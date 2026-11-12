import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spawn, ChildProcess } from "node:child_process";
import { z } from "zod";

export const activeTunnels = new Map<string, ChildProcess>();
export const tunnelLogs = new Map<string, string[]>();

export function registerRunPortTools(server: McpServer): void {
  server.registerTool(
    "runport_start_tunnel",
    {
      description:
        "Start a RunPort reverse SSH tunnel to expose a local port (e.g. 3000, 8080) to the internet with HTTPS. Returns public URL.",
      inputSchema: {
        port: z.number().int().min(1).max(65535).describe("Local port to expose (e.g. 3000)"),
        subdomain: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,62}$/i, "Invalid subdomain format: must be 1-63 alphanumeric chars or hyphens, starting with alphanumeric")
          .optional()
          .describe("Requested subdomain (e.g. 'my-app'). Random if omitted."),
        review: z.boolean().optional().describe("Enable interactive visual feedback and client review mode on the tunnel."),
      },
    },
    async ({ port, subdomain: requestedSubdomain, review }) => {
      const domain = process.env.RUNPORT_DOMAIN || process.env.TUNNEL_DOMAIN || "runport.ru";
      const remoteHost = process.env.RUNPORT_HOST || process.env.TUNNEL_HOST || `srv.${domain}`;
      const remotePort = process.env.RUNPORT_PORT || process.env.TUNNEL_PORT || "2222";
      const remoteBind = requestedSubdomain ? `${requestedSubdomain}:80` : "80";

      return new Promise((resolve) => {
        const args = [
          "-p", remotePort,
          "-R", `${remoteBind}:localhost:${port}`,
          "-o", "StrictHostKeyChecking=no",
          "-o", "UserKnownHostsFile=/dev/null",
          "-T",
          remoteHost,
        ];

        if (review) {
          args.push("--review");
        }

        const sshProcess = spawn("ssh", args);
        let subdomain = requestedSubdomain || "";
        let isStarted = false;

        tunnelLogs.set(subdomain, []);

        sshProcess.stdout.on("data", (data: Buffer) => {
          const output = data.toString();

          if (!isStarted && output.includes("https://")) {
            const match = output.match(/https:\/\/([^.]+)\./);
            if (match && match[1]) {
              subdomain = match[1];
              activeTunnels.set(subdomain, sshProcess);
              tunnelLogs.set(subdomain, []);
              isStarted = true;

              resolve({
                content: [
                  {
                    type: "text",
                    text:
                      `RunPort tunnel active!\n` +
                      `URL: https://${subdomain}.${domain}\n` +
                      `Local Port: ${port}\n` +
                      (review ? `Review Mode: Enabled (clients can leave visual annotations)\n` : "") +
                      `Inspect logs with: runport_get_logs`,
                  },
                ],
              });
            }
          } else if (isStarted) {
            const lines = output
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            const logs = tunnelLogs.get(subdomain) || [];
            logs.push(...lines);
            if (logs.length > 100) logs.splice(0, logs.length - 100);
            tunnelLogs.set(subdomain, logs);
          }
        });

        sshProcess.stderr.on("data", (data: Buffer) => {
          console.error(`[RunPort SSH Error] ${data.toString()}`);
        });

        sshProcess.on("close", (code) => {
          if (subdomain) {
            activeTunnels.delete(subdomain);
          }
          if (!isStarted) {
            resolve({
              content: [
                {
                  type: "text",
                  text: `Failed to start RunPort tunnel. SSH process closed with code ${code}. Check SSH availability or network.`,
                },
              ],
              isError: true,
            });
          }
        });

        setTimeout(() => {
          if (!isStarted) {
            const finalSub = subdomain || requestedSubdomain || "tunnel";
            isStarted = true;
            activeTunnels.set(finalSub, sshProcess);
            resolve({
              content: [
                {
                  type: "text",
                  text: `Tunnel process spawned. Expected public URL: https://${finalSub}.${domain} (forwarding to port ${port})`,
                },
              ],
            });
          }
        }, 5000);
      });
    }
  );

  server.registerTool(
    "runport_stop_tunnel",
    {
      description: "Stop an active RunPort tunnel by its subdomain.",
      inputSchema: {
        subdomain: z.string().describe("Subdomain of the active tunnel to terminate"),
      },
    },
    async ({ subdomain }) => {
      const processRef = activeTunnels.get(subdomain);
      if (processRef) {
        processRef.kill();
        activeTunnels.delete(subdomain);
        tunnelLogs.delete(subdomain);
        return {
          content: [{ type: "text", text: `RunPort tunnel '${subdomain}' stopped.` }],
        };
      }
      return {
        content: [{ type: "text", text: `No active tunnel found for subdomain '${subdomain}'.` }],
        isError: true,
      };
    }
  );

  server.registerTool(
    "runport_get_logs",
    {
      description: "Get recent HTTP access logs for an active RunPort tunnel (useful for webhook and API debugging).",
      inputSchema: {
        subdomain: z.string().describe("Subdomain of the active tunnel"),
      },
    },
    async ({ subdomain }) => {
      const logs = tunnelLogs.get(subdomain);
      if (!logs || logs.length === 0) {
        return {
          content: [{ type: "text", text: `No traffic logs recorded yet for tunnel '${subdomain}'.` }],
        };
      }
      return {
        content: [{ type: "text", text: logs.join("\n") }],
      };
    }
  );

  server.registerTool(
    "runport_list_reviews",
    {
      description: "List visual feedback, annotations, and client review comments left on the preview tunnel.",
      inputSchema: {
        subdomain: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,62}$/i, "Invalid subdomain format")
          .describe("Subdomain of the tunnel"),
        path: z.string().optional().describe("Filter comments by URL path (e.g. '/pricing')"),
        status: z.enum(["open", "resolved", "all"]).optional().describe("Filter status: 'open', 'resolved', or 'all'. Defaults to 'open'."),
      },
    },
    async ({ subdomain, path, status = "open" }) => {
      const domain = process.env.RUNPORT_DOMAIN || process.env.TUNNEL_DOMAIN || "runport.ru";
      const targetHost = `https://${subdomain}.${domain}/__runport/reviews`;

      try {
        const url = new URL(targetHost);
        if (path) url.searchParams.set("path", path);

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        type ReviewItem = {
          id: string;
          review_number?: number;
          path: string;
          component_name?: string;
          selector?: string;
          element_text?: string;
          comment: string;
          author_name?: string;
          status: string;
        };

        let reviews = (await res.json()) as ReviewItem[];
        if (status !== "all") {
          reviews = reviews.filter((r) => r.status === status);
        }

        if (!reviews || reviews.length === 0) {
          return {
            content: [{ type: "text", text: `No ${status} review comments found for '${subdomain}'.` }],
          };
        }

        const formatted = reviews
          .map((r, idx) => {
            const num = r.review_number || idx + 1;
            const comp = r.component_name ? ` [Component: ${r.component_name}]` : "";
            const target = r.selector ? `\n   Element: ${r.selector}` : "";
            const textContext = r.element_text ? `\n   Text preview: "${r.element_text}"` : "";
            return `#${num}. [${r.status.toUpperCase()}] on ${r.path}${comp}${target}${textContext}\n   Comment: "${r.comment}"\n   Author: ${r.author_name || "Client"} (ID: ${r.id})`;
          })
          .join("\n\n");

        return {
          content: [{ type: "text", text: `Found ${reviews.length} review comment(s) for '${subdomain}':\n\n${formatted}` }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Could not retrieve reviews for '${subdomain}': ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "runport_resolve_review",
    {
      description: "Mark a visual review comment as resolved after implementing changes.",
      inputSchema: {
        subdomain: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,62}$/i, "Invalid subdomain format")
          .describe("Subdomain of the tunnel"),
        reviewId: z.string().describe("UUID of the review item to resolve"),
      },
    },
    async ({ subdomain, reviewId }) => {
      const domain = process.env.RUNPORT_DOMAIN || process.env.TUNNEL_DOMAIN || "runport.ru";
      const targetHost = `https://${subdomain}.${domain}/__runport/reviews/${reviewId}`;

      try {
        const res = await fetch(targetHost, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return {
          content: [{ type: "text", text: `Review comment '${reviewId}' marked as resolved.` }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Failed to resolve review '${reviewId}': ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
