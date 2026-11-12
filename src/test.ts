import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./index.js";

test("createServer initializes MCP server with expected tools", async () => {
  const server = createServer();
  assert.ok(server, "Server should be defined");

  const registeredTools = Object.keys((server as any)._registeredTools);
  const expectedTools = [
    "devpass_status",
    "runport_start_tunnel",
    "runport_stop_tunnel",
    "runport_get_logs",
    "runport_list_reviews",
    "runport_resolve_review",
    "submito_create_form",
    "submito_get_snippet",
    "submito_list_forms",
    "rungate_get_gateway_config",
    "rungate_check_dns",
    "runping_list_monitors",
    "runping_create_monitor",
    "runping_get_incidents",
    "runping_pause_monitor",
    "runping_resume_monitor",
    "runping_create_status_page",
    "adopto_track_event",
    "adopto_list_sequences",
  ];

  for (const tool of expectedTools) {
    assert.ok(
      registeredTools.includes(tool),
      `Expected tool '${tool}' to be registered, registered: ${registeredTools.join(", ")}`
    );
  }
});

test("RunPing MCP tools handle missing token and proxy API requests", async () => {
  const server = createServer();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const origToken = process.env.DEVPASS_TOKEN;
  const origRunpingUrl = process.env.RUNPING_API_URL;
  const origFetch = globalThis.fetch;

  try {
    delete process.env.DEVPASS_TOKEN;
    const noTokenRes = await client.callTool({
      name: "runping_list_monitors",
      arguments: {},
    });
    assert.equal(noTokenRes.isError, true);
    const noTokenText = (noTokenRes.content as Array<{ text: string }>)[0]?.text ?? "";
    assert.match(noTokenText, /DEVPASS_TOKEN is not set/);

    process.env.DEVPASS_TOKEN = "dp_live_test_token";
    process.env.RUNPING_API_URL = "https://runping.example.test/";

    const calls: Array<{ url: string; method: string; auth: string | null; body?: unknown }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        method: init?.method ?? "GET",
        auth: headers.get("Authorization"),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await client.callTool({
      name: "runping_list_monitors",
      arguments: { status: "up", search: "api" },
    });
    await client.callTool({
      name: "runping_create_monitor",
      arguments: { name: "API", target_url: "https://api.example.com/health", interval_sec: 60 },
    });
    await client.callTool({
      name: "runping_get_incidents",
      arguments: { monitor_id: "mon_1", status: "ongoing", limit: 10 },
    });
    await client.callTool({
      name: "runping_pause_monitor",
      arguments: { monitor_id: "mon_1" },
    });
    await client.callTool({
      name: "runping_resume_monitor",
      arguments: { monitor_id: "mon_1" },
    });
    await client.callTool({
      name: "runping_create_status_page",
      arguments: {
        slug: "status",
        title: "System Status",
        monitor_ids: ["mon_1"],
        is_public: true,
      },
    });

    assert.equal(calls.length, 6);
    assert.deepEqual(calls[0], {
      url: "https://runping.example.test/api/v1/monitors?status=up&search=api",
      method: "GET",
      auth: "Bearer dp_live_test_token",
      body: undefined,
    });
    assert.deepEqual(calls[1], {
      url: "https://runping.example.test/api/v1/monitors",
      method: "POST",
      auth: "Bearer dp_live_test_token",
      body: { name: "API", target_url: "https://api.example.com/health", interval_sec: 60 },
    });
    assert.deepEqual(calls[2], {
      url: "https://runping.example.test/api/v1/incidents?monitor_id=mon_1&status=ongoing&limit=10",
      method: "GET",
      auth: "Bearer dp_live_test_token",
      body: undefined,
    });
    assert.deepEqual(calls[3], {
      url: "https://runping.example.test/api/v1/monitors/mon_1/pause",
      method: "POST",
      auth: "Bearer dp_live_test_token",
      body: undefined,
    });
    assert.deepEqual(calls[4], {
      url: "https://runping.example.test/api/v1/monitors/mon_1/resume",
      method: "POST",
      auth: "Bearer dp_live_test_token",
      body: undefined,
    });
    assert.deepEqual(calls[5], {
      url: "https://runping.example.test/api/v1/status-pages",
      method: "POST",
      auth: "Bearer dp_live_test_token",
      body: {
        slug: "status",
        title: "System Status",
        is_public: true,
        monitors_config: [{ monitor_id: "mon_1" }],
      },
    });
  } finally {
    globalThis.fetch = origFetch;
    if (origToken === undefined) delete process.env.DEVPASS_TOKEN;
    else process.env.DEVPASS_TOKEN = origToken;
    if (origRunpingUrl === undefined) delete process.env.RUNPING_API_URL;
    else process.env.RUNPING_API_URL = origRunpingUrl;
    await Promise.all([client.close(), server.close()]);
  }
});
