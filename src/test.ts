import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    "adopto_sync_user",
    "adopto_track_event",
    "adopto_list_sequences",
    "rundeploy_list_projects",
    "rundeploy_create_project",
    "rundeploy_list_deployments",
    "rundeploy_deploy_archive",
    "rundeploy_rollback_deployment",
    "rundeploy_list_domains",
    "rundeploy_add_domain",
    "rundeploy_verify_domain",
    "rundeploy_list_env",
    "rundeploy_set_env",
    "rundeploy_list_deploy_tokens",
    "rundeploy_create_deploy_token",
    "rundeploy_revoke_deploy_token",
    "answero_list_sites",
    "answero_create_site",
    "answero_get_widget_snippet",
    "answero_list_knowledge",
    "answero_add_knowledge",
    "answero_list_conversations",
    "answero_get_conversation",
    "answero_reply_conversation",
    "answero_update_conversation_status",
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

test("Adopto MCP tools send v1 user sync, event intake and list 8 ecosystem flows", async () => {
  const server = createServer();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const origToken = process.env.DEVPASS_TOKEN;
  const origAdoptoKey = process.env.ADOPTO_API_KEY;
  const origAdoptoUrl = process.env.ADOPTO_API_URL;
  const origFetch = globalThis.fetch;

  try {
    delete process.env.DEVPASS_TOKEN;
    delete process.env.ADOPTO_API_KEY;

    // Offline preset list should return all 8 ecosystem flows
    const presetRes = await client.callTool({
      name: "adopto_list_sequences",
      arguments: {},
    });
    const presetData = JSON.parse((presetRes.content as Array<{ text: string }>)[0].text);
    assert.equal(presetData.sequences.length, 8);

    // Online API calls with ADOPTO_API_KEY
    process.env.ADOPTO_API_KEY = "adopto_secret_test";
    process.env.ADOPTO_API_URL = "https://api.adopto.example.test/";

    const calls: Array<{ url: string; method: string; auth: string | null; body?: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        method: init?.method ?? "GET",
        auth: headers.get("Authorization"),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify({ accepted: true, flows: [{ id: "flow_1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await client.callTool({
      name: "adopto_sync_user",
      arguments: {
        user_id: "usr_42",
        email: "dev@example.com",
        profile_version: 5,
        properties: {
          signupSource: "rungate",
          plan: "free",
          rungateActivated: true,
          runpingActivated: false,
          anyProductActivated: true,
          multiProductActive: false,
        },
      },
    });

    await client.callTool({
      name: "adopto_track_event",
      arguments: {
        user_id: "usr_42",
        event_id: "evt_001",
        event_name: "rungate.first_activity",
        occurred_at: "2026-11-12T12:00:00.000Z",
        properties: { mode: "dns" },
      },
    });

    await client.callTool({
      name: "adopto_list_sequences",
      arguments: {},
    });

    assert.equal(calls.length, 3);
    assert.equal(calls[0].url, "https://api.adopto.example.test/v1/users/usr_42");
    assert.equal(calls[0].method, "PUT");
    assert.equal(calls[0].auth, "Bearer adopto_secret_test");
    assert.equal(calls[0].body?.profileVersion, 5);
    assert.equal(calls[0].body?.email, "dev@example.com");

    assert.deepEqual(calls[1], {
      url: "https://api.adopto.example.test/v1/events",
      method: "POST",
      auth: "Bearer adopto_secret_test",
      body: {
        eventId: "evt_001",
        userId: "usr_42",
        name: "rungate.first_activity",
        occurredAt: "2026-11-12T12:00:00.000Z",
        properties: { mode: "dns" },
      },
    });

    assert.equal(calls[2].url, "https://api.adopto.example.test/v1/flows");
    assert.equal(calls[2].method, "GET");
  } finally {
    globalThis.fetch = origFetch;
    if (origToken === undefined) delete process.env.DEVPASS_TOKEN;
    else process.env.DEVPASS_TOKEN = origToken;
    if (origAdoptoKey === undefined) delete process.env.ADOPTO_API_KEY;
    else process.env.ADOPTO_API_KEY = origAdoptoKey;
    if (origAdoptoUrl === undefined) delete process.env.ADOPTO_API_URL;
    else process.env.ADOPTO_API_URL = origAdoptoUrl;
    await Promise.all([client.close(), server.close()]);
  }
});

test("RunDeploy MCP tools handle missing token, JSON endpoints, and archive upload", async () => {
  const server = createServer();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const origToken = process.env.DEVPASS_TOKEN;
  const origRundeployUrl = process.env.RUNDEPLOY_API_URL;
  const origFetch = globalThis.fetch;
  const tempDir = await mkdtemp(join(tmpdir(), "mcp-rundeploy-"));
  const archivePath = join(tempDir, "dist.zip");
  await writeFile(archivePath, Buffer.from("PK\x03\x04test"));

  try {
    delete process.env.DEVPASS_TOKEN;
    const noTokenRes = await client.callTool({
      name: "rundeploy_list_projects",
      arguments: {},
    });
    assert.equal(noTokenRes.isError, true);
    const noTokenText = (noTokenRes.content as Array<{ text: string }>)[0]?.text ?? "";
    assert.match(noTokenText, /DEVPASS_TOKEN is not set/);

    process.env.DEVPASS_TOKEN = "dp_live_test_token";
    process.env.RUNDEPLOY_API_URL = "https://rundeploy.example.test/";

    const calls: Array<{
      url: string;
      method: string;
      auth: string | null;
      body?: unknown;
      isFormData: boolean;
    }> = [];

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const headers = new Headers(init?.headers);
      const isFormData = init?.body instanceof FormData;
      calls.push({
        url,
        method: init?.method ?? "GET",
        auth: headers.get("Authorization"),
        body: !isFormData && init?.body ? JSON.parse(String(init.body)) : undefined,
        isFormData,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await client.callTool({ name: "rundeploy_list_projects", arguments: {} });
    await client.callTool({
      name: "rundeploy_create_project",
      arguments: { name: "My App", slug: "my-app", spaFallback: true, type: "static" },
    });
    await client.callTool({
      name: "rundeploy_list_deployments",
      arguments: { project_id: "prj_1" },
    });
    await client.callTool({
      name: "rundeploy_deploy_archive",
      arguments: {
        project_id: "prj_1",
        archive_path: archivePath,
        commit_sha: "abc123",
        commit_message: "Initial release",
      },
    });
    await client.callTool({
      name: "rundeploy_rollback_deployment",
      arguments: { project_id: "prj_1", deployment_id: "dep_1" },
    });
    await client.callTool({
      name: "rundeploy_list_domains",
      arguments: { project_id: "prj_1" },
    });
    await client.callTool({
      name: "rundeploy_add_domain",
      arguments: { project_id: "prj_1", domain: "app.example.com" },
    });
    await client.callTool({
      name: "rundeploy_verify_domain",
      arguments: { project_id: "prj_1", domain_id: "dom_1" },
    });
    await client.callTool({
      name: "rundeploy_list_env",
      arguments: { project_id: "prj_1" },
    });
    await client.callTool({
      name: "rundeploy_set_env",
      arguments: { project_id: "prj_1", key: "API_KEY", value: "secret" },
    });

    assert.equal(calls.length, 10);
    assert.equal(calls[0].url, "https://rundeploy.example.test/api/v1/projects");
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[1].url, "https://rundeploy.example.test/api/v1/projects");
    assert.equal(calls[1].method, "POST");
    assert.deepEqual(calls[1].body, {
      name: "My App",
      slug: "my-app",
      spaFallback: true,
      type: "static",
    });
    assert.equal(calls[2].url, "https://rundeploy.example.test/api/v1/projects/prj_1/deployments");
    assert.equal(calls[3].url, "https://rundeploy.example.test/api/v1/projects/prj_1/deployments");
    assert.equal(calls[3].method, "POST");
    assert.equal(calls[3].isFormData, true);
    assert.equal(
      calls[4].url,
      "https://rundeploy.example.test/api/v1/projects/prj_1/deployments/dep_1/rollback"
    );
    assert.equal(calls[4].method, "POST");
    assert.equal(calls[5].url, "https://rundeploy.example.test/api/v1/projects/prj_1/domains");
    assert.equal(calls[6].url, "https://rundeploy.example.test/api/v1/projects/prj_1/domains");
    assert.deepEqual(calls[6].body, { domain: "app.example.com" });
    assert.equal(
      calls[7].url,
      "https://rundeploy.example.test/api/v1/projects/prj_1/domains/dom_1/verify"
    );
    assert.equal(calls[8].url, "https://rundeploy.example.test/api/v1/projects/prj_1/env");
    assert.equal(calls[9].url, "https://rundeploy.example.test/api/v1/projects/prj_1/env");
    assert.deepEqual(calls[9].body, { key: "API_KEY", value: "secret" });
  } finally {
    globalThis.fetch = origFetch;
    await rm(tempDir, { recursive: true, force: true });
    if (origToken === undefined) delete process.env.DEVPASS_TOKEN;
    else process.env.DEVPASS_TOKEN = origToken;
    if (origRundeployUrl === undefined) delete process.env.RUNDEPLOY_API_URL;
    else process.env.RUNDEPLOY_API_URL = origRundeployUrl;
    await Promise.all([client.close(), server.close()]);
  }
});

test("Answero MCP tools handle missing token, site/knowledge/conversation APIs, and snippet generation", async () => {
  const server = createServer();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const origToken = process.env.DEVPASS_TOKEN;
  const origAnsweroUrl = process.env.ANSWERO_API_URL;
  const origFetch = globalThis.fetch;

  try {
    delete process.env.DEVPASS_TOKEN;
    const noTokenRes = await client.callTool({
      name: "answero_list_sites",
      arguments: {},
    });
    assert.equal(noTokenRes.isError, true);
    const noTokenText = (noTokenRes.content as Array<{ text: string }>)[0]?.text ?? "";
    assert.match(noTokenText, /DEVPASS_TOKEN is not set/);

    process.env.DEVPASS_TOKEN = "dp_live_test_token";
    process.env.ANSWERO_API_URL = "https://answero.example.test/";

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

      if (url.endsWith("/api/v1/sites/site_1")) {
        return new Response(
          JSON.stringify({ site: { id: "site_1", name: "Docs", siteKey: "ans_key_123" } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await client.callTool({ name: "answero_list_sites", arguments: {} });
    await client.callTool({
      name: "answero_create_site",
      arguments: { name: "Docs", mode: "ai_first", allowedDomains: ["docs.example.com"] },
    });
    const snippetRes = await client.callTool({
      name: "answero_get_widget_snippet",
      arguments: { site_id: "site_1" },
    });
    const snippetData = JSON.parse((snippetRes.content as Array<{ text: string }>)[0].text);
    assert.equal(
      snippetData.snippet,
      '<script src="https://answero.example.test/widget.js" data-answero="ans_key_123" defer></script>'
    );

    await client.callTool({
      name: "answero_list_knowledge",
      arguments: { site_id: "site_1" },
    });
    await client.callTool({
      name: "answero_add_knowledge",
      arguments: { site_id: "site_1", title: "Pricing", type: "faq", content: "Starts at 0 RUB" },
    });
    await client.callTool({
      name: "answero_list_conversations",
      arguments: { site_id: "site_1", status: "waiting_operator" },
    });
    await client.callTool({
      name: "answero_get_conversation",
      arguments: { conversation_id: "conv_1" },
    });
    await client.callTool({
      name: "answero_reply_conversation",
      arguments: { conversation_id: "conv_1", content: "Hello from operator" },
    });
    await client.callTool({
      name: "answero_update_conversation_status",
      arguments: { conversation_id: "conv_1", status: "closed" },
    });

    assert.equal(calls.length, 9);
    assert.equal(calls[0].url, "https://answero.example.test/api/v1/sites");
    assert.equal(calls[1].url, "https://answero.example.test/api/v1/sites");
    assert.equal(calls[1].method, "POST");
    assert.equal(calls[2].url, "https://answero.example.test/api/v1/sites/site_1");
    assert.equal(calls[3].url, "https://answero.example.test/api/v1/sites/site_1/knowledge");
    assert.equal(calls[4].url, "https://answero.example.test/api/v1/sites/site_1/knowledge");
    assert.equal(calls[4].method, "POST");
    assert.equal(
      calls[5].url,
      "https://answero.example.test/api/v1/conversations?siteId=site_1&status=waiting_operator"
    );
    assert.equal(calls[6].url, "https://answero.example.test/api/v1/conversations/conv_1");
    assert.equal(calls[7].url, "https://answero.example.test/api/v1/conversations/conv_1/reply");
    assert.equal(calls[7].method, "POST");
    assert.deepEqual(calls[7].body, { content: "Hello from operator" });
    assert.equal(calls[8].url, "https://answero.example.test/api/v1/conversations/conv_1/status");
    assert.equal(calls[8].method, "PATCH");
    assert.deepEqual(calls[8].body, { status: "closed" });
  } finally {
    globalThis.fetch = origFetch;
    if (origToken === undefined) delete process.env.DEVPASS_TOKEN;
    else process.env.DEVPASS_TOKEN = origToken;
    if (origAnsweroUrl === undefined) delete process.env.ANSWERO_API_URL;
    else process.env.ANSWERO_API_URL = origAnsweroUrl;
    await Promise.all([client.close(), server.close()]);
  }
});
