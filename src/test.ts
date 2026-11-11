import test from "node:test";
import assert from "node:assert/strict";
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
