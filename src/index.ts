#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as dotenv from "dotenv";
import { registerDevPassTools } from "./tools/devpass.js";
import { registerRunPortTools } from "./tools/runport.js";
import { registerSubmitoTools } from "./tools/submito.js";
import { registerRunGateTools } from "./tools/rungate.js";
import { registerRunPingTools } from "./tools/runping.js";
import { registerAdoptoTools } from "./tools/adopto.js";
import { registerRunDeployTools } from "./tools/rundeploy.js";
import { registerAnsweroTools } from "./tools/answero.js";

dotenv.config();

export function createServer(): McpServer {
  const server = new McpServer({
    name: "devpass",
    version: "1.1.0",
  });

  registerDevPassTools(server);
  registerRunPortTools(server);
  registerSubmitoTools(server);
  registerRunGateTools(server);
  registerRunPingTools(server);
  registerAdoptoTools(server);
  registerRunDeployTools(server);
  registerAnsweroTools(server);

  return server;
}

export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DevPass MCP Server running on stdio");
}

const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith("/index.js") || process.argv[1].endsWith("/devpass-mcp"));

if (isDirectExecution) {
  runServer().catch((error) => {
    console.error("Server fatal error:", error);
    process.exit(1);
  });
}
