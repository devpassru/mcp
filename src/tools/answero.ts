import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function formatJsonResult(data: unknown, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

async function answeroRequest(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ ok: boolean; data: unknown }> {
  const token = process.env.DEVPASS_TOKEN;
  if (!token) {
    return {
      ok: false,
      data: {
        error: "DEVPASS_TOKEN is not set",
        hint: "Export DEVPASS_TOKEN=dp_live_... to authenticate with Answero.",
      },
    };
  }

  const baseUrl = (process.env.ANSWERO_API_URL || "https://answero.ru").replace(/\/+$/, "");

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.json().catch(() => ({ status: res.status }));
    return { ok: res.ok, data };
  } catch (err) {
    return {
      ok: false,
      data: {
        error: "Failed to reach Answero API",
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export function registerAnsweroTools(server: McpServer): void {
  server.registerTool(
    "answero_list_sites",
    {
      description:
        "List all Answero chat widget sites in the authenticated workspace along with plan limits.",
      inputSchema: {},
    },
    async () => {
      const res = await answeroRequest("/api/v1/sites");
      return formatJsonResult(res.data, !res.ok);
    }
  );

  server.registerTool(
    "answero_create_site",
    {
      description:
        "Create a new Answero AI + Telegram support chat widget site and receive its embeddable siteKey.",
      inputSchema: {
        name: z.string().min(1).max(100).describe("Display name of the site"),
        allowedDomains: z
          .array(z.string().min(1))
          .optional()
          .describe("Allowed domains for widget embeds (empty = allow all)"),
        mode: z
          .enum(["ai_first", "hybrid", "telegram_only"])
          .optional()
          .describe("Support routing mode (default ai_first)"),
        themeColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe("Widget accent color in #RRGGBB format"),
        greetingMessage: z.string().max(500).optional().describe("Initial greeting shown in widget"),
        placeholderText: z.string().max(100).optional().describe("Input placeholder text"),
        position: z
          .enum(["bottom_right", "bottom_left"])
          .optional()
          .describe("Widget corner position"),
        aiEnabled: z.boolean().optional().describe("Enable AI first-line replies (default true)"),
        aiModel: z.string().optional().describe("LLM model identifier (default gpt-4o-mini)"),
        systemPrompt: z.string().max(4000).optional().describe("Custom AI assistant instructions"),
      },
    },
    async (args) => {
      const res = await answeroRequest("/api/v1/sites", { method: "POST", body: args });
      return formatJsonResult(res.data, !res.ok);
    }
  );

  server.registerTool(
    "answero_get_widget_snippet",
    {
      description:
        "Fetch an Answero site by ID and generate the ready-to-paste <script> embed snippet for HTML/React/Astro.",
      inputSchema: {
        site_id: z.string().min(1).describe("Answero site ID (e.g. site_...)"),
      },
    },
    async ({ site_id }) => {
      const res = await answeroRequest(`/api/v1/sites/${encodeURIComponent(site_id)}`);
      if (!res.ok) {
        return formatJsonResult(res.data, true);
      }

      const payload = res.data as { site?: { id: string; name: string; siteKey: string } };
      const siteKey = payload.site?.siteKey;
      const baseUrl = (process.env.ANSWERO_API_URL || "https://answero.ru").replace(/\/+$/, "");

      return formatJsonResult({
        site: payload.site,
        snippet: siteKey
          ? `<script src="${baseUrl}/widget.js" data-answero="${siteKey}" defer></script>`
          : null,
      });
    }
  );

  server.registerTool(
    "answero_list_knowledge",
    {
      description: "List FAQ and knowledge base documents configured for an Answero site.",
      inputSchema: {
        site_id: z.string().min(1).describe("Answero site ID"),
      },
    },
    async ({ site_id }) => {
      const res = await answeroRequest(`/api/v1/sites/${encodeURIComponent(site_id)}/knowledge`);
      return formatJsonResult(res.data, !res.ok);
    }
  );

  server.registerTool(
    "answero_add_knowledge",
    {
      description:
        "Add a FAQ, article, or raw_text knowledge base document to an Answero site for AI answers.",
      inputSchema: {
        site_id: z.string().min(1).describe("Answero site ID"),
        title: z.string().min(1).max(200).describe("Document title or question"),
        type: z
          .enum(["faq", "article", "raw_text"])
          .optional()
          .describe("Document type (default faq)"),
        content: z.string().min(1).max(50000).describe("Document text or answer body"),
        active: z.boolean().optional().describe("Whether document is active in AI context (default true)"),
      },
    },
    async ({ site_id, title, type, content, active }) => {
      const res = await answeroRequest(`/api/v1/sites/${encodeURIComponent(site_id)}/knowledge`, {
        method: "POST",
        body: { title, type, content, active },
      });
      return formatJsonResult(res.data, !res.ok);
    }
  );

  server.registerTool(
    "answero_list_conversations",
    {
      description: "List support chat conversations across Answero sites, optionally filtered by site or status.",
      inputSchema: {
        site_id: z.string().optional().describe("Optional Answero site ID filter"),
        status: z
          .enum(["bot", "waiting_operator", "operator_active", "closed"])
          .optional()
          .describe("Optional conversation status filter"),
      },
    },
    async ({ site_id, status }) => {
      const qs = new URLSearchParams();
      if (site_id) qs.set("siteId", site_id);
      if (status) qs.set("status", status);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      const res = await answeroRequest(`/api/v1/conversations${query}`);
      return formatJsonResult(res.data, !res.ok);
    }
  );

  server.registerTool(
    "answero_get_conversation",
    {
      description: "Get full conversation details and message history for an Answero support thread.",
      inputSchema: {
        conversation_id: z.string().min(1).describe("Conversation ID (e.g. conv_...)"),
      },
    },
    async ({ conversation_id }) => {
      const res = await answeroRequest(
        `/api/v1/conversations/${encodeURIComponent(conversation_id)}`
      );
      return formatJsonResult(res.data, !res.ok);
    }
  );

  server.registerTool(
    "answero_reply_conversation",
    {
      description:
        "Send an operator reply into an Answero conversation (delivered live via SSE and email fallback if visitor left).",
      inputSchema: {
        conversation_id: z.string().min(1).describe("Conversation ID"),
        content: z.string().min(1).max(4000).describe("Reply message text"),
      },
    },
    async ({ conversation_id, content }) => {
      const res = await answeroRequest(
        `/api/v1/conversations/${encodeURIComponent(conversation_id)}/reply`,
        { method: "POST", body: { content } }
      );
      return formatJsonResult(res.data, !res.ok);
    }
  );

  server.registerTool(
    "answero_update_conversation_status",
    {
      description: "Update the status of an Answero conversation (e.g. mark as closed or return to bot).",
      inputSchema: {
        conversation_id: z.string().min(1).describe("Conversation ID"),
        status: z
          .enum(["bot", "waiting_operator", "operator_active", "closed"])
          .describe("New conversation status"),
      },
    },
    async ({ conversation_id, status }) => {
      const res = await answeroRequest(
        `/api/v1/conversations/${encodeURIComponent(conversation_id)}/status`,
        { method: "PATCH", body: { status } }
      );
      return formatJsonResult(res.data, !res.ok);
    }
  );
}
