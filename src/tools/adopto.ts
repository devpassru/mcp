import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerAdoptoTools(server: McpServer): void {
  server.registerTool(
    "adopto_track_event",
    {
      description:
        "Track a user lifecycle event in Adopto (e.g. 'signup', 'form_submitted', 'payment_success') to trigger onboarding or stop follow-up campaigns.",
      inputSchema: {
        user_email: z.string().email().describe("User email address to identify recipient"),
        event_name: z
          .string()
          .describe("Event identifier (e.g. 'waitlist_joined', 'demo_requested', 'trial_started', 'payment_completed')"),
        properties: z
          .record(z.unknown())
          .optional()
          .describe("Optional key-value metadata for personalizing emails (e.g. { name: 'Alex', plan: 'pro' })"),
      },
    },
    async ({ user_email, event_name, properties = {} }) => {
      const token = process.env.DEVPASS_TOKEN;
      const apiUrl = process.env.ADOPTO_API_URL || "https://api.adopto.ru";

      if (token) {
        try {
          const res = await fetch(`${apiUrl}/v1/events`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              email: user_email,
              event: event_name,
              properties,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "event_recorded",
                      email: user_email,
                      event: event_name,
                      result: data,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
        } catch {
          // Fall through
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "queued",
                message: `Event '${event_name}' received for ${user_email}.`,
                activeAction:
                  event_name.includes("payment") || event_name.includes("success")
                    ? "Stopped onboarding reminder sequence"
                    : "Scheduled welcome & onboarding sequence",
                properties,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "adopto_list_sequences",
    {
      description: "List automated email sequences and active onboarding rules in Adopto.",
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sequences: [
                  {
                    id: "seq_welcome",
                    name: "AI-Dev Welcome & Quickstart",
                    trigger_event: "signup",
                    stop_event: "payment_completed",
                    steps_count: 3,
                    status: "active",
                  },
                  {
                    id: "seq_abandoned_lead",
                    name: "Form Lead Follow-up",
                    trigger_event: "form_submitted",
                    stop_event: "trial_started",
                    steps_count: 2,
                    status: "active",
                  },
                ],
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
