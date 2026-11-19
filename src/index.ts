#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as dotenv from "dotenv";
import { registerAdoptoTools } from "./tools/adopto.js";
import { registerAnsweroTools } from "./tools/answero.js";
import { registerDevPassTools } from "./tools/devpass.js";
import { registerRekuroTools } from "./tools/rekuro.js";
import { registerRunDeployTools } from "./tools/rundeploy.js";
import { registerRunGateTools } from "./tools/rungate.js";
import { registerRunPingTools } from "./tools/runping.js";
import { registerRunPortTools } from "./tools/runport.js";
import { registerSubmitoTools } from "./tools/submito.js";

dotenv.config({ quiet: true });

export function createServer(): McpServer {
  const server = new McpServer({
    name: "devpass",
    version: "1.2.0",
  });

  registerDevPassTools(server);
  registerRunPortTools(server);
  registerSubmitoTools(server);
  registerRunGateTools(server);
  registerRunPingTools(server);
  registerAdoptoTools(server);
  registerRunDeployTools(server);
  registerAnsweroTools(server);
  registerRekuroTools(server);

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
