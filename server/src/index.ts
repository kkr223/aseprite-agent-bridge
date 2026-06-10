#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AsepriteBridgeServer } from "./bridge-server.js";
import { loadConfig } from "./config.js";
import { registerAsepriteTools } from "./tools.js";

const main = async (): Promise<void> => {
  const config = loadConfig();
  const bridge = new AsepriteBridgeServer(
    config.wsPort,
    config.token,
    config.requestTimeoutMs
  );
  await bridge.start();

  const server = new McpServer({
    name: "aseprite-mcp-server",
    version: "0.1.0"
  });
  registerAsepriteTools(server, bridge, config);
  server.server.onclose = () => {
    void bridge.stop().catch(error => {
      console.error("Failed to stop Aseprite WebSocket bridge:", error);
    });
  };
  server.server.onerror = error => {
    console.error("MCP transport error:", error);
  };

  const shutdown = async (): Promise<void> => {
    await server.close();
    await bridge.stop();
  };
  process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

  await server.connect(new StdioServerTransport());
  console.error(
    `Aseprite MCP server listening on ws://127.0.0.1:${config.wsPort}`
  );
};

main().catch(error => {
  console.error("Aseprite MCP server failed:", error);
  process.exit(1);
});
