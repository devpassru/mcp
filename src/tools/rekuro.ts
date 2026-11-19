import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

async function rekuroRequest(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<ReturnType<typeof formatJsonResult>> {
  const token = process.env.REKURO_API_KEY || process.env.DEVPASS_TOKEN;
  if (!token) {
    return formatJsonResult(
      {
        error: "REKURO_API_KEY is not set",
        hint: "Export REKURO_API_KEY (tenant API key from https://app.rekuro.ru) to authenticate with Rekuro.",
      },
      true,
    );
  }

  const baseUrl = (process.env.REKURO_API_URL || "https://app.rekuro.ru").replace(/\/+$/, "");

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (init.idempotencyKey) {
      headers["Idempotency-Key"] = init.idempotencyKey;
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.json().catch(() => ({ status: res.status }));
    return formatJsonResult(data, !res.ok);
  } catch (err) {
    return formatJsonResult(
      {
        error: "Failed to reach Rekuro API",
        detail: err instanceof Error ? err.message : String(err),
      },
      true,
    );
  }
}

export function registerRekuroTools(server: McpServer): void {
  server.registerTool(
    "rekuro_list_plans",
    {
      description: "List Rekuro billing plans (tariffs) for the authenticated tenant.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        status: z.enum(["active", "archived"]).optional(),
      },
    },
    async ({ limit, offset, status }) => {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set("limit", String(limit));
      if (offset !== undefined) params.set("offset", String(offset));
      if (status) params.set("status", status);
      const qs = params.toString();
      return rekuroRequest(`/v1/plans${qs ? `?${qs}` : ""}`);
    },
  );

  server.registerTool(
    "rekuro_create_plan",
    {
      description:
        "Create a recurring billing plan in Rekuro. Amount MUST be an integer in kopecks (e.g. 99000 for 990 RUB).",
      inputSchema: {
        code: z.string().min(1).describe("Unique plan code (e.g. pro-monthly)"),
        name: z.string().min(1).describe("Human-readable plan name"),
        amount: z.number().int().positive().describe("Price in integer kopecks (e.g. 99000)"),
        interval: z.enum(["day", "week", "month", "year"]).optional(),
        interval_count: z.number().int().min(1).optional(),
        trial_days: z.number().int().min(0).optional(),
        grace_days: z.number().int().min(0).optional(),
        plan_type: z.enum(["base", "addon"]).optional(),
      },
    },
    async (args) => rekuroRequest("/v1/plans", { method: "POST", body: args }),
  );

  server.registerTool(
    "rekuro_list_payments",
    {
      description: "List payments in Rekuro with optional status or customer_id filter.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        status: z.string().optional(),
        customer_id: z.string().uuid().optional(),
      },
    },
    async ({ limit, offset, status, customer_id }) => {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set("limit", String(limit));
      if (offset !== undefined) params.set("offset", String(offset));
      if (status) params.set("status", status);
      if (customer_id) params.set("customer_id", customer_id);
      const qs = params.toString();
      return rekuroRequest(`/v1/payments${qs ? `?${qs}` : ""}`);
    },
  );

  server.registerTool(
    "rekuro_get_payment",
    {
      description: "Get detailed payment status and fiscal receipt state by payment UUID.",
      inputSchema: {
        paymentId: z.string().uuid(),
      },
    },
    async ({ paymentId }) => rekuroRequest(`/v1/payments/${encodeURIComponent(paymentId)}`),
  );

  server.registerTool(
    "rekuro_create_payment",
    {
      description:
        "Create a one-time payment checkout link in Rekuro. Amount MUST be integer kopecks.",
      inputSchema: {
        amount: z.number().int().positive().describe("Amount in integer kopecks"),
        order_id: z.string().min(1).describe("Merchant order identifier"),
        description: z.string().max(250).optional(),
        customer_email: z.string().email().optional(),
        success_url: z.string().url().optional(),
        fail_url: z.string().url().optional(),
        save_payment_method: z.boolean().optional(),
        idempotency_key: z.string().optional(),
      },
    },
    async ({ customer_email, idempotency_key, ...rest }) =>
      rekuroRequest("/v1/payments", {
        method: "POST",
        idempotencyKey: idempotency_key || randomUUID(),
        body: {
          ...rest,
          ...(customer_email ? { customer: { email: customer_email } } : {}),
        },
      }),
  );

  server.registerTool(
    "rekuro_list_subscriptions",
    {
      description: "List subscriptions in Rekuro with optional status, customer_id, or plan_id.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        status: z.string().optional(),
        customer_id: z.string().uuid().optional(),
        plan_id: z.string().uuid().optional(),
      },
    },
    async ({ limit, offset, status, customer_id, plan_id }) => {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set("limit", String(limit));
      if (offset !== undefined) params.set("offset", String(offset));
      if (status) params.set("status", status);
      if (customer_id) params.set("customer_id", customer_id);
      if (plan_id) params.set("plan_id", plan_id);
      const qs = params.toString();
      return rekuroRequest(`/v1/subscriptions${qs ? `?${qs}` : ""}`);
    },
  );

  server.registerTool(
    "rekuro_get_subscription",
    {
      description: "Get subscription details by UUID in Rekuro.",
      inputSchema: {
        subscriptionId: z.string().uuid(),
      },
    },
    async ({ subscriptionId }) =>
      rekuroRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`),
  );

  server.registerTool(
    "rekuro_create_subscription",
    {
      description: "Create a recurring subscription checkout in Rekuro.",
      inputSchema: {
        plan_code: z.string().min(1).describe("Plan code or UUID"),
        customer_email: z.string().email(),
        customer_external_id: z.string().optional(),
        success_url: z.string().url().optional(),
        fail_url: z.string().url().optional(),
        promo_code: z.string().optional(),
        idempotency_key: z.string().optional(),
      },
    },
    async ({ customer_email, customer_external_id, idempotency_key, ...rest }) =>
      rekuroRequest("/v1/subscriptions", {
        method: "POST",
        idempotencyKey: idempotency_key || randomUUID(),
        body: {
          ...rest,
          customer: {
            email: customer_email,
            ...(customer_external_id ? { externalId: customer_external_id } : {}),
          },
        },
      }),
  );

  server.registerTool(
    "rekuro_cancel_subscription",
    {
      description: "Cancel an active subscription in Rekuro (immediately or at period end).",
      inputSchema: {
        subscriptionId: z.string().uuid(),
        at_period_end: z.boolean().optional(),
      },
    },
    async ({ subscriptionId, at_period_end }) =>
      rekuroRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
        method: "POST",
        body: at_period_end !== undefined ? { at_period_end } : {},
      }),
  );
}
