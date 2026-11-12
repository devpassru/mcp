import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const DEVPASS_DEFAULT_SEQUENCES = [
  {
    key: "onboarding_runping",
    name: "Онбординг RunPing: первый монитор и Telegram-алерт",
    entryEventName: "user.registered",
    goalEventName: "runping.alert_connected",
    stepsCount: 6,
    status: "active",
  },
  {
    key: "onboarding_rungate",
    name: "Онбординг RunGate: подключение AI DNS или AI Gateway",
    entryEventName: "user.registered",
    goalEventName: "rungate.first_activity",
    stepsCount: 6,
    status: "active",
  },
  {
    key: "onboarding_devpass",
    name: "Онбординг DevPass: подключение MCP и выбор первого сервиса",
    entryEventName: "user.registered",
    goalEventName: "ecosystem.first_product_activated",
    stepsCount: 6,
    status: "active",
  },
  {
    key: "discovery_from_rungate",
    name: "Знакомство с экосистемой: из RunGate в RunPing и MCP",
    entryEventName: "rungate.first_activity",
    goalEventName: "ecosystem.multi_product_activated",
    stepsCount: 6,
    status: "active",
  },
  {
    key: "discovery_from_runping",
    name: "Знакомство с экосистемой: из RunPing в RunGate и MCP",
    entryEventName: "runping.first_monitor_active",
    goalEventName: "ecosystem.multi_product_activated",
    stepsCount: 6,
    status: "active",
  },
  {
    key: "upgrade_runping_single",
    name: "Покупка: интерес к RunPing Pro",
    entryEventName: "runping.pro_interest",
    goalEventName: "subscription.paid",
    stepsCount: 3,
    status: "active",
  },
  {
    key: "upgrade_rungate_single",
    name: "Покупка: интерес к RunGate Pro и пополнение Gateway",
    entryEventName: "rungate.pro_interest",
    goalEventName: "subscription.paid",
    stepsCount: 3,
    status: "active",
  },
  {
    key: "upgrade_devpass_bundle",
    name: "Покупка: переход на единую подписку DevPass Pro",
    entryEventName: "ecosystem.multi_product_activated",
    goalEventName: "subscription.paid",
    stepsCount: 6,
    status: "active",
  },
] as const;

function getAdoptoAuth(): { apiUrl: string; token: string | undefined } {
  const apiUrl = (process.env.ADOPTO_API_URL || "https://api.adopto.ru").replace(/\/+$/, "");
  const token = process.env.ADOPTO_API_KEY || process.env.DEVPASS_TOKEN;
  return { apiUrl, token };
}

export function registerAdoptoTools(server: McpServer): void {
  server.registerTool(
    "adopto_sync_user",
    {
      description:
        "Synchronize a user profile and DevPass ecosystem state into Adopto (PUT /v1/users/:userId) before or alongside behavioral events.",
      inputSchema: {
        user_id: z.string().min(1).describe("Stable user ID from id.devpass.ru"),
        email: z.string().email().describe("User email address"),
        profile_version: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Monotonic profile version (defaults to current unix timestamp in seconds)"),
        properties: z
          .record(z.unknown())
          .optional()
          .describe(
            "Ecosystem profile attributes (e.g. { userName, signupSource: 'runping'|'rungate'|'devpass', plan: 'free'|'single_pro'|'devpass_pro', runpingActivated, rungateActivated, anyProductActivated, multiProductActive, mcpConnected })",
          ),
      },
    },
    async ({ user_id, email, profile_version, properties = {} }) => {
      const { apiUrl, token } = getAdoptoAuth();
      const version = profile_version ?? Math.floor(Date.now() / 1000);
      const payload = {
        profileVersion: version,
        email,
        emailVerified: true,
        permission: {
          status: "granted",
          recordedAt: new Date().toISOString(),
          source: "id.devpass.ru",
          email,
        },
        properties,
      };

      if (token) {
        try {
          const res = await fetch(`${apiUrl}/v1/users/${encodeURIComponent(user_id)}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          return {
            isError: !res.ok,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: res.ok ? "profile_synced" : "error",
                    httpStatus: res.status,
                    userId: user_id,
                    result: data,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Failed to reach Adopto API: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
          };
        }
      }

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "ADOPTO_API_KEY or DEVPASS_TOKEN is required to sync a user profile in Adopto.",
          },
        ],
      };
    },
  );

  server.registerTool(
    "adopto_track_event",
    {
      description:
        "Track a user lifecycle event in Adopto (POST /v1/events, e.g. 'user.registered', 'rungate.first_activity', 'runping.first_monitor_active', 'ecosystem.multi_product_activated', 'subscription.paid') to trigger flows or complete goals.",
      inputSchema: {
        user_id: z
          .string()
          .min(1)
          .optional()
          .describe("Stable user ID from id.devpass.ru (falls back to user_email if omitted)"),
        user_email: z.string().email().optional().describe("User email address"),
        event_name: z
          .string()
          .min(1)
          .describe(
            "Event name (e.g. 'user.registered', 'runping.alert_connected', 'rungate.first_activity', 'ecosystem.multi_product_activated', 'subscription.paid')",
          ),
        event_id: z.string().min(1).optional().describe("Idempotency event ID (defaults to random UUID)"),
        occurred_at: z.string().optional().describe("ISO-8601 UTC timestamp (defaults to now)"),
        properties: z
          .record(z.unknown())
          .optional()
          .describe("Optional event payload metadata"),
      },
    },
    async ({ user_id, user_email, event_name, event_id, occurred_at, properties = {} }) => {
      const resolvedUserId = user_id || user_email;
      if (!resolvedUserId) {
        return {
          isError: true,
          content: [{ type: "text", text: "Either user_id or user_email must be provided" }],
        };
      }

      const { apiUrl, token } = getAdoptoAuth();
      const body = {
        eventId: event_id || randomUUID(),
        userId: resolvedUserId,
        name: event_name,
        occurredAt: occurred_at || new Date().toISOString(),
        properties,
      };

      if (token) {
        try {
          const res = await fetch(`${apiUrl}/v1/events`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const errorText = await res.text().catch(() => "");
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Adopto API error (${res.status}): ${errorText}`,
                },
              ],
            };
          }
          const data = await res.json();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "event_accepted",
                    eventId: body.eventId,
                    userId: body.userId,
                    event: body.name,
                    result: data,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Failed to reach Adopto API: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
          };
        }
      }

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "ADOPTO_API_KEY or DEVPASS_TOKEN is required to track events in Adopto.",
          },
        ],
      };
    },
  );

  server.registerTool(
    "adopto_list_sequences",
    {
      description: "List automated behavioral email flows and active rules in Adopto (GET /v1/flows).",
      inputSchema: {},
    },
    async () => {
      const { apiUrl, token } = getAdoptoAuth();

      if (token) {
        try {
          const res = await fetch(`${apiUrl}/v1/flows`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (res.ok) {
            const data = (await res.json()) as { flows?: unknown[] };
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      sequences: data.flows ?? [],
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        } catch {
          // Fall through to preset list
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sequences: DEVPASS_DEFAULT_SEQUENCES,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
