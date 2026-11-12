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

async function runpingRequest(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<ReturnType<typeof formatJsonResult>> {
  const token = process.env.DEVPASS_TOKEN;
  if (!token) {
    return formatJsonResult(
      {
        error: "DEVPASS_TOKEN is not set",
        hint: "Export DEVPASS_TOKEN=dp_live_... to authenticate with RunPing.",
      },
      true
    );
  }

  const baseUrl = (process.env.RUNPING_API_URL || "https://runping.ru").replace(/\/+$/, "");

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
    return formatJsonResult(data, !res.ok);
  } catch (err) {
    return formatJsonResult(
      {
        error: "Failed to reach RunPing API",
        detail: err instanceof Error ? err.message : String(err),
      },
      true
    );
  }
}

export function registerRunPingTools(server: McpServer): void {
  server.registerTool(
    "runping_list_monitors",
    {
      description:
        "List all RunPing uptime & SSL monitors for the authenticated workspace with status, uptime, latency, and SSL days remaining.",
      inputSchema: {
        status: z
          .enum(["pending", "up", "degraded", "down", "paused"])
          .optional()
          .describe("Optional filter by monitor status"),
        search: z
          .string()
          .optional()
          .describe("Optional search filter matching monitor name or URL"),
      },
    },
    async ({ status, search }) => {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (search) qs.set("search", search);
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return runpingRequest(`/api/v1/monitors${query}`);
    }
  );

  server.registerTool(
    "runping_create_monitor",
    {
      description:
        "Create a new RunPing HTTP(S), Keyword, JSON, or TCP port monitor with SSRF protection and DevPass tier checks.",
      inputSchema: {
        name: z.string().min(1).describe("Display name of the monitor"),
        target_url: z
          .string()
          .min(1)
          .describe("Public HTTPS/HTTP URL or host:port (for tcp)"),
        type: z
          .enum(["http", "keyword", "json", "tcp"])
          .optional()
          .describe("Monitor check type (defaults to http)"),
        method: z.enum(["GET", "HEAD", "POST"]).optional().describe("HTTP method"),
        interval_sec: z
          .number()
          .int()
          .optional()
          .describe("Check interval in seconds: 30, 60, or 300"),
        timeout_ms: z
          .number()
          .int()
          .min(3000)
          .max(30000)
          .optional()
          .describe("Timeout in milliseconds (3000-30000)"),
        locations: z
          .array(z.enum(["ru-msk", "eu-ams"]))
          .optional()
          .describe("Probe locations"),
        keyword: z.string().optional().describe("Expected keyword or JSON condition"),
        keyword_should_exist: z
          .boolean()
          .optional()
          .describe("Whether keyword/JSON expression must exist"),
      },
    },
    async (args) => runpingRequest("/api/v1/monitors", { method: "POST", body: args })
  );

  server.registerTool(
    "runping_get_incidents",
    {
      description:
        "Get recent RunPing downtime incidents and failure causes across workspace monitors.",
      inputSchema: {
        monitor_id: z.string().optional().describe("Optional monitor ID filter"),
        status: z.enum(["ongoing", "resolved"]).optional().describe("Optional incident status"),
        limit: z.number().int().min(1).max(100).optional().describe("Max incidents to return"),
      },
    },
    async ({ monitor_id, status, limit }) => {
      const qs = new URLSearchParams();
      if (monitor_id) qs.set("monitor_id", monitor_id);
      if (status) qs.set("status", status);
      if (limit !== undefined) qs.set("limit", String(limit));
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return runpingRequest(`/api/v1/incidents${query}`);
    }
  );

  server.registerTool(
    "runping_pause_monitor",
    {
      description: "Pause monitoring checks for a RunPing monitor by ID.",
      inputSchema: {
        monitor_id: z.string().min(1).describe("RunPing monitor ID (e.g. mon_...)"),
      },
    },
    async ({ monitor_id }) =>
      runpingRequest(`/api/v1/monitors/${encodeURIComponent(monitor_id)}/pause`, {
        method: "POST",
      })
  );

  server.registerTool(
    "runping_resume_monitor",
    {
      description: "Resume monitoring checks for a paused RunPing monitor by ID.",
      inputSchema: {
        monitor_id: z.string().min(1).describe("RunPing monitor ID (e.g. mon_...)"),
      },
    },
    async ({ monitor_id }) =>
      runpingRequest(`/api/v1/monitors/${encodeURIComponent(monitor_id)}/resume`, {
        method: "POST",
      })
  );

  server.registerTool(
    "runping_create_status_page",
    {
      description: "Create a public RunPing status page (/s/:slug) exposing selected monitors.",
      inputSchema: {
        slug: z.string().min(2).describe("URL slug for /s/:slug"),
        title: z.string().min(1).describe("Public status page title"),
        description: z.string().optional().describe("Optional subtitle or description"),
        monitor_ids: z
          .array(z.string())
          .optional()
          .describe("Monitor IDs to include on the status page"),
        is_public: z.boolean().optional().describe("Whether status page is public"),
      },
    },
    async ({ slug, title, description, monitor_ids, is_public }) =>
      runpingRequest("/api/v1/status-pages", {
        method: "POST",
        body: {
          slug,
          title,
          ...(description !== undefined ? { description } : {}),
          is_public: is_public ?? true,
          monitors_config: (monitor_ids ?? []).map((monitor_id) => ({ monitor_id })),
        },
      })
  );
}
