import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface EntitlementsResponse {
  user_id?: string;
  email?: string;
  bundle?: string;
  services: {
    rungate: { tier: string; dns_devices: number; dns_active: boolean };
    submito: { tier: string; forms_limit: number; submissions_monthly: number };
    runport: { tier: string; max_tunnels: number; bandwidth_bytes: number; rps_limit: number };
    runping?: { tier: string; monitors_limit: number; min_interval_sec: number; locations: string[]; custom_domains: boolean; status_pages_limit: number; retention_days: number };
    adopto: { tier: string; emails_monthly: number };
    rekuro?: { tier: string };
  };
}

export function registerDevPassTools(server: McpServer): void {
  server.registerTool(
    "devpass_status",
    {
      description:
        "Check DevPass account status, active subscription plan, and quotas for all services (RunPort, Submito, RunGate, RunPing, Adopto).",
      inputSchema: {
        token: z.string().optional().describe("Optional token override. If omitted, uses DEVPASS_TOKEN environment variable."),
      },
    },
    async ({ token }) => {
      const activeToken = token || process.env.DEVPASS_TOKEN;
      const apiUrl = process.env.DEVPASS_API_URL || "https://id.devpass.ru";

      if (!activeToken) {
        return {
          content: [
            {
              type: "text",
              text:
                "DevPass token is missing.\n\n" +
                "To get your token:\n" +
                "1. Go to https://id.devpass.ru\n" +
                "2. Copy your Master Token (format: dp_live_...)\n" +
                "3. Set DEVPASS_TOKEN in your MCP settings (e.g. .cursor/mcp.json or Claude Code env).",
            },
          ],
        };
      }

      try {
        const response = await fetch(`${apiUrl}/api/v1/billing/entitlements`, {
          headers: {
            Authorization: `Bearer ${activeToken}`,
            Accept: "application/json",
          },
        });

        if (response.ok) {
          const data = (await response.json()) as EntitlementsResponse;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "authenticated",
                    plan: data.bundle || "DevPass Pro",
                    services: data.services,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `DevPass API error (${response.status}): failed to fetch billing entitlements.`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to reach DevPass API: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );
}
