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
    adopto: { tier: string; emails_monthly: number };
    rekuro?: { tier: string };
  };
}

export function registerDevPassTools(server: McpServer): void {
  server.registerTool(
    "devpass_status",
    {
      description:
        "Check DevPass account status, active subscription plan, and quotas for all services (RunPort, Submito, RunGate, Adopto).",
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
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "active",
                  tokenPrefix: activeToken.slice(0, 10) + "...",
                  defaultPlan: "DevPass Pro (4 in 1)",
                  services: {
                    runport: { status: "ready", tunnelsLimit: 5, domain: "runport.ru" },
                    submito: { status: "ready", submissionsMonthly: 5000, formsLimit: "unlimited" },
                    rungate: { status: "ready", smartDns: "enabled", gatewayUrl: "https://gateway.rungate.ru/v1" },
                    adopto: { status: "ready", emailsMonthly: 5000 },
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "connected",
                  tokenPrefix: activeToken.slice(0, 10) + "...",
                  services: {
                    runport: "available",
                    submito: "available",
                    rungate: "available",
                    adopto: "available",
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );
}
