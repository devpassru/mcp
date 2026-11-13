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

const DEFAULT_PROJECT_KEY_SCOPES = [
  "project:read",
  "profiles:write",
  "events:write",
  "diagnostics:read",
  "drafts:read",
  "drafts:write",
  "tests:write",
  "flows:publish",
  "flows:pause",
  "keys:manage",
] as const;

function getAdoptoBaseUrl(): string {
  return (process.env.ADOPTO_API_URL || "https://api.adopto.ru").replace(/\/+$/, "");
}

function getAdoptoProjectToken(explicitKey?: string): string | undefined {
  return explicitKey || process.env.ADOPTO_API_KEY || process.env.DEVPASS_TOKEN;
}

function getAdoptoOwnerToken(explicitToken?: string): string | undefined {
  return explicitToken || process.env.DEVPASS_TOKEN || process.env.ADOPTO_OWNER_TOKEN;
}

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

async function adoptoRequest(
  path: string,
  token: string | undefined,
  missingTokenMessage: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ReturnType<typeof formatJsonResult>> {
  if (!token) {
    return formatJsonResult({ error: missingTokenMessage }, true);
  }

  const apiUrl = getAdoptoBaseUrl();
  try {
    const res = await fetch(`${apiUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    const rawText = await res.text().catch(() => "");
    let parsed: unknown = { status: res.status };
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { status: res.status, body: rawText };
      }
    }

    if (!res.ok) {
      return formatJsonResult(
        {
          error: `Adopto API error (${res.status})`,
          status: res.status,
          details: parsed,
        },
        true,
      );
    }

    return formatJsonResult(parsed);
  } catch (err) {
    return formatJsonResult(
      {
        error: "Failed to reach Adopto API",
        detail: err instanceof Error ? err.message : String(err),
      },
      true,
    );
  }
}

export function registerAdoptoTools(server: McpServer): void {
  // ── Projects & Project API Keys (Owner / DEVPASS_TOKEN) ─────────────────

  server.registerTool(
    "adopto_list_projects",
    {
      description: "List all Adopto projects owned by the authenticated DevPass account (GET /v1/projects).",
      inputSchema: {},
    },
    async () => {
      return adoptoRequest(
        "/v1/projects",
        getAdoptoOwnerToken(),
        "DEVPASS_TOKEN is required to list Adopto projects.",
      );
    },
  );

  server.registerTool(
    "adopto_create_project",
    {
      description: "Create a new Adopto project under the authenticated DevPass account (POST /v1/projects).",
      inputSchema: {
        name: z.string().min(1).max(120).describe("Project display name (e.g. 'RunGate')"),
        url: z.string().url().describe("Project website URL (e.g. 'https://rungate.ru')"),
        language: z.string().min(2).max(16).optional().describe("BCP-47 language tag (default: 'ru')"),
        timezone: z.string().min(1).optional().describe("IANA timezone (default: 'Europe/Moscow')"),
        reply_to: z.string().email().nullable().optional().describe("Optional reply-to email address"),
        first_result: z.string().min(1).describe("Product card: first value/result user should achieve"),
        purchase_signal: z.string().min(1).describe("Product card: signal indicating purchase readiness"),
        constraints: z.string().optional().describe("Product card: optional messaging constraints"),
        idempotency_key: z.string().uuid().optional().describe("Optional UUID idempotency key"),
      },
    },
    async ({
      name,
      url,
      language = "ru",
      timezone = "Europe/Moscow",
      reply_to = null,
      first_result,
      purchase_signal,
      constraints = "",
      idempotency_key,
    }) => {
      return adoptoRequest(
        "/v1/projects",
        getAdoptoOwnerToken(),
        "DEVPASS_TOKEN is required to create an Adopto project.",
        {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotency_key ?? randomUUID(),
          },
          body: {
            name,
            url,
            language,
            timezone,
            replyTo: reply_to,
            productCard: {
              firstResult: first_result,
              purchaseSignal: purchase_signal,
              constraints,
            },
            confirmProductCard: true,
          },
        },
      );
    },
  );

  server.registerTool(
    "adopto_list_keys",
    {
      description:
        "List API keys for an Adopto project. Pass project_id with DEVPASS_TOKEN, or omit project_id to use ADOPTO_API_KEY.",
      inputSchema: {
        project_id: z.string().uuid().optional().describe("Project UUID (uses DEVPASS_TOKEN when provided)"),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ project_id, api_key }) => {
      if (project_id) {
        return adoptoRequest(
          `/v1/projects/${encodeURIComponent(project_id)}/keys`,
          getAdoptoOwnerToken(),
          "DEVPASS_TOKEN is required to list project keys by project_id.",
        );
      }
      return adoptoRequest(
        "/v1/keys",
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or project_id with DEVPASS_TOKEN) is required to list keys.",
      );
    },
  );

  server.registerTool(
    "adopto_create_key",
    {
      description:
        "Issue a new project API key (secret) in Adopto. Pass project_id with DEVPASS_TOKEN to bootstrap the first key, or omit project_id to issue using ADOPTO_API_KEY.",
      inputSchema: {
        project_id: z.string().uuid().optional().describe("Project UUID (uses DEVPASS_TOKEN when provided)"),
        scopes: z
          .array(z.string().min(1))
          .optional()
          .describe("Requested key scopes (defaults to full automation + events + flows scopes)"),
        api_key: z.string().min(1).optional().describe("Optional existing project API key with keys:manage scope"),
      },
    },
    async ({ project_id, scopes, api_key }) => {
      const requestedScopes = scopes ?? [...DEFAULT_PROJECT_KEY_SCOPES];
      if (project_id) {
        return adoptoRequest(
          `/v1/projects/${encodeURIComponent(project_id)}/keys`,
          getAdoptoOwnerToken(),
          "DEVPASS_TOKEN is required to create a key by project_id.",
          {
            method: "POST",
            body: { scopes: requestedScopes },
          },
        );
      }
      return adoptoRequest(
        "/v1/keys",
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or project_id with DEVPASS_TOKEN) is required to create a key.",
        {
          method: "POST",
          body: { scopes: requestedScopes },
        },
      );
    },
  );

  server.registerTool(
    "adopto_revoke_key",
    {
      description: "Revoke a project API key in Adopto.",
      inputSchema: {
        key_id: z.string().uuid().describe("API key UUID to revoke"),
        project_id: z.string().uuid().optional().describe("Project UUID (uses DEVPASS_TOKEN when provided)"),
        api_key: z.string().min(1).optional().describe("Optional project API key with keys:manage scope"),
      },
    },
    async ({ key_id, project_id, api_key }) => {
      if (project_id) {
        return adoptoRequest(
          `/v1/projects/${encodeURIComponent(project_id)}/keys/${encodeURIComponent(key_id)}/revoke`,
          getAdoptoOwnerToken(),
          "DEVPASS_TOKEN is required to revoke a key by project_id.",
          { method: "POST", body: {} },
        );
      }
      return adoptoRequest(
        `/v1/keys/${encodeURIComponent(key_id)}/revoke`,
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or project_id with DEVPASS_TOKEN) is required to revoke a key.",
        { method: "POST", body: {} },
      );
    },
  );

  // ── Templates (Project API Key) ─────────────────────────────────────────

  server.registerTool(
    "adopto_create_template",
    {
      description: "Create an email template draft in Adopto (POST /v1/templates).",
      inputSchema: {
        name: z.string().min(1).max(128).describe("Internal template name"),
        subject: z.string().min(1).describe("Email subject"),
        primary_url: z.string().url().describe("Primary CTA URL used in the template"),
        sender_mode: z.enum(["project", "custom"]).optional().describe("Sender mode (default: 'project')"),
        text: z.string().min(1).describe("Plain-text email body (must include {{unsubscribeUrl}} if marketing)"),
        html: z.string().min(1).describe("HTML email body"),
        variables: z.record(z.unknown()).optional().describe("Template variable definitions"),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ name, subject, primary_url, sender_mode = "project", text, html, variables, api_key }) => {
      return adoptoRequest(
        "/v1/templates",
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or api_key) is required to create templates in Adopto.",
        {
          method: "POST",
          body: {
            name,
            content: {
              subject,
              primaryUrl: primary_url,
              senderMode: sender_mode,
              ...(variables !== undefined ? { variables } : {}),
              text,
              html,
            },
          },
        },
      );
    },
  );

  server.registerTool(
    "adopto_get_template",
    {
      description: "Get a template and its draft/versions in Adopto (GET /v1/templates/:id).",
      inputSchema: {
        template_id: z.string().uuid().describe("Template UUID"),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ template_id, api_key }) => {
      return adoptoRequest(
        `/v1/templates/${encodeURIComponent(template_id)}`,
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or api_key) is required to read templates in Adopto.",
      );
    },
  );

  server.registerTool(
    "adopto_update_template_draft",
    {
      description: "Update an existing template draft in Adopto (PATCH /v1/templates/:id/draft).",
      inputSchema: {
        template_id: z.string().uuid().describe("Template UUID"),
        expected_revision: z.number().int().positive().describe("Current draft revision number"),
        subject: z.string().min(1).describe("Email subject"),
        primary_url: z.string().url().describe("Primary CTA URL"),
        sender_mode: z.enum(["project", "custom"]).optional().describe("Sender mode (default: 'project')"),
        text: z.string().min(1).describe("Plain-text email body"),
        html: z.string().min(1).describe("HTML email body"),
        variables: z.record(z.unknown()).optional().describe("Template variable definitions"),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({
      template_id,
      expected_revision,
      subject,
      primary_url,
      sender_mode = "project",
      text,
      html,
      variables,
      api_key,
    }) => {
      return adoptoRequest(
        `/v1/templates/${encodeURIComponent(template_id)}/draft`,
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or api_key) is required to update templates in Adopto.",
        {
          method: "PATCH",
          body: {
            expectedRevision: expected_revision,
            content: {
              subject,
              primaryUrl: primary_url,
              senderMode: sender_mode,
              ...(variables !== undefined ? { variables } : {}),
              text,
              html,
            },
          },
        },
      );
    },
  );

  server.registerTool(
    "adopto_approve_template",
    {
      description: "Approve a template draft to create a sendable immutable version (POST /v1/templates/:id/versions).",
      inputSchema: {
        template_id: z.string().uuid().describe("Template UUID"),
        expected_revision: z.number().int().positive().optional().describe("Expected draft revision (default: 1)"),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ template_id, expected_revision = 1, api_key }) => {
      return adoptoRequest(
        `/v1/templates/${encodeURIComponent(template_id)}/versions`,
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or api_key) is required to approve templates in Adopto.",
        {
          method: "POST",
          body: { expectedRevision: expected_revision },
        },
      );
    },
  );

  // ── Sequences / Flows (Project API Key) ─────────────────────────────────

  server.registerTool(
    "adopto_list_sequences",
    {
      description: "List automated behavioral email flows and active rules in Adopto (GET /v1/flows).",
      inputSchema: {
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ api_key }) => {
      const apiUrl = getAdoptoBaseUrl();
      const token = getAdoptoProjectToken(api_key);

      if (token) {
        try {
          const res = await fetch(`${apiUrl}/v1/flows`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(15_000),
          });
          if (res.ok) {
            const data = (await res.json()) as { flows?: unknown[] };
            return formatJsonResult({ sequences: data.flows ?? [] });
          }
          const errorText = await res.text().catch(() => "");
          return formatJsonResult(
            { error: `Adopto API error (${res.status}): ${errorText}` },
            true,
          );
        } catch (err) {
          return formatJsonResult(
            {
              error: "Failed to reach Adopto API",
              detail: err instanceof Error ? err.message : String(err),
            },
            true,
          );
        }
      }

      return formatJsonResult({ sequences: DEVPASS_DEFAULT_SEQUENCES });
    },
  );

  server.registerTool(
    "adopto_get_sequence",
    {
      description: "Get a behavioral flow definition and status in Adopto (GET /v1/flows/:id).",
      inputSchema: {
        flow_id: z.string().uuid().describe("Flow UUID"),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ flow_id, api_key }) => {
      return adoptoRequest(
        `/v1/flows/${encodeURIComponent(flow_id)}`,
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or api_key) is required to get flow details in Adopto.",
      );
    },
  );

  server.registerTool(
    "adopto_create_sequence",
    {
      description: "Create a behavioral email flow draft in Adopto (POST /v1/flows).",
      inputSchema: {
        definition: z
          .record(z.unknown())
          .describe(
            "Flow definition ({ schemaVersion: 1, name, entry: { eventName, conditions }, exit: { eventNames, conditions }, goal: { eventName }, steps })",
          ),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ definition, api_key }) => {
      return adoptoRequest(
        "/v1/flows",
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or api_key) is required to create flows in Adopto.",
        {
          method: "POST",
          body: { definition },
        },
      );
    },
  );

  server.registerTool(
    "adopto_update_sequence_draft",
    {
      description: "Update a behavioral email flow draft in Adopto (PATCH /v1/flows/:id/draft).",
      inputSchema: {
        flow_id: z.string().uuid().describe("Flow UUID"),
        expected_draft_version: z.number().int().positive().describe("Current draft version"),
        definition: z.record(z.unknown()).describe("Updated flow definition"),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ flow_id, expected_draft_version, definition, api_key }) => {
      return adoptoRequest(
        `/v1/flows/${encodeURIComponent(flow_id)}/draft`,
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or api_key) is required to update flows in Adopto.",
        {
          method: "PATCH",
          body: { expectedDraftVersion: expected_draft_version, definition },
        },
      );
    },
  );

  server.registerTool(
    "adopto_validate_sequence",
    {
      description: "Validate a behavioral email flow draft in Adopto (POST /v1/flows/:id/validate).",
      inputSchema: {
        flow_id: z.string().uuid().describe("Flow UUID"),
        expected_draft_version: z.number().int().positive().optional().describe("Expected draft version (default: 1)"),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ flow_id, expected_draft_version = 1, api_key }) => {
      return adoptoRequest(
        `/v1/flows/${encodeURIComponent(flow_id)}/validate`,
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or api_key) is required to validate flows in Adopto.",
        {
          method: "POST",
          body: { expectedDraftVersion: expected_draft_version },
        },
      );
    },
  );

  server.registerTool(
    "adopto_publish_sequence",
    {
      description: "Publish an Adopto flow draft so it starts processing live events (POST /v1/flows/:id/publish).",
      inputSchema: {
        flow_id: z.string().uuid().describe("Flow UUID"),
        expected_draft_version: z.number().int().positive().optional().describe("Expected draft version (default: 1)"),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ flow_id, expected_draft_version = 1, api_key }) => {
      return adoptoRequest(
        `/v1/flows/${encodeURIComponent(flow_id)}/publish`,
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or api_key) is required to publish flows in Adopto.",
        {
          method: "POST",
          body: { expectedDraftVersion: expected_draft_version },
        },
      );
    },
  );

  server.registerTool(
    "adopto_pause_sequence",
    {
      description: "Pause a published Adopto flow (POST /v1/flows/:id/pause).",
      inputSchema: {
        flow_id: z.string().uuid().describe("Flow UUID"),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ flow_id, api_key }) => {
      return adoptoRequest(
        `/v1/flows/${encodeURIComponent(flow_id)}/pause`,
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or api_key) is required to pause flows in Adopto.",
        { method: "POST", body: {} },
      );
    },
  );

  server.registerTool(
    "adopto_resume_sequence",
    {
      description: "Resume a paused Adopto flow (POST /v1/flows/:id/resume).",
      inputSchema: {
        flow_id: z.string().uuid().describe("Flow UUID"),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ flow_id, api_key }) => {
      return adoptoRequest(
        `/v1/flows/${encodeURIComponent(flow_id)}/resume`,
        getAdoptoProjectToken(api_key),
        "ADOPTO_API_KEY (or api_key) is required to resume flows in Adopto.",
        { method: "POST", body: {} },
      );
    },
  );

  // ── Users & Events (Project API Key) ────────────────────────────────────

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
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ user_id, email, profile_version, properties = {}, api_key }) => {
      const apiUrl = getAdoptoBaseUrl();
      const token = getAdoptoProjectToken(api_key);
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

      if (!token) {
        return formatJsonResult(
          { error: "ADOPTO_API_KEY or DEVPASS_TOKEN is required to sync user profiles in Adopto." },
          true,
        );
      }

      try {
        const res = await fetch(`${apiUrl}/v1/users/${encodeURIComponent(user_id)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          return formatJsonResult(
            { error: `Adopto API error (${res.status}): ${errorText}` },
            true,
          );
        }
        const data = await res.json();
        return formatJsonResult({
          status: "profile_synced",
          userId: user_id,
          profileVersion: version,
          result: data,
        });
      } catch (err) {
        return formatJsonResult(
          {
            error: "Failed to reach Adopto API",
            detail: err instanceof Error ? err.message : String(err),
          },
          true,
        );
      }
    },
  );

  server.registerTool(
    "adopto_track_event",
    {
      description:
        "Track a behavioral user event in Adopto (POST /v1/events) to trigger onboarding, cross-sell, or upgrade flows, or record a conversion goal.",
      inputSchema: {
        user_id: z.string().min(1).optional().describe("Stable user ID from id.devpass.ru"),
        user_email: z.string().email().optional().describe("Fallback identifier if user_id is unavailable"),
        event_id: z.string().min(1).optional().describe("Idempotency event ID (defaults to random UUID)"),
        event_name: z
          .string()
          .min(1)
          .describe(
            "Event name (e.g. 'user.registered', 'rungate.trial_activated', 'rungate.first_activity', 'runping.first_monitor_active', 'subscription.paid')",
          ),
        occurred_at: z.string().datetime().optional().describe("ISO-8601 timestamp (defaults to now)"),
        properties: z.record(z.unknown()).optional().describe("Optional event metadata payload"),
        api_key: z.string().min(1).optional().describe("Optional project API key (overrides ADOPTO_API_KEY)"),
      },
    },
    async ({ user_id, user_email, event_id, event_name, occurred_at, properties = {}, api_key }) => {
      const resolvedUserId = user_id || user_email;
      if (!resolvedUserId) {
        return formatJsonResult({ error: "Either user_id or user_email must be provided" }, true);
      }

      const apiUrl = getAdoptoBaseUrl();
      const token = getAdoptoProjectToken(api_key);
      const body = {
        eventId: event_id || randomUUID(),
        userId: resolvedUserId,
        name: event_name,
        occurredAt: occurred_at || new Date().toISOString(),
        properties,
      };

      if (!token) {
        return formatJsonResult(
          { error: "ADOPTO_API_KEY or DEVPASS_TOKEN is required to track events in Adopto." },
          true,
        );
      }

      try {
        const res = await fetch(`${apiUrl}/v1/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          return formatJsonResult(
            { error: `Adopto API error (${res.status}): ${errorText}` },
            true,
          );
        }
        const data = await res.json();
        return formatJsonResult({
          status: "event_accepted",
          eventId: body.eventId,
          userId: body.userId,
          event: body.name,
          result: data,
        });
      } catch (err) {
        return formatJsonResult(
          {
            error: "Failed to reach Adopto API",
            detail: err instanceof Error ? err.message : String(err),
          },
          true,
        );
      }
    },
  );
}
