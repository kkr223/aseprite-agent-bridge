import assert from "node:assert/strict";
import { createServer } from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { toolNames } from "../src/tools.js";

const reservePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolveClose, reject) => {
    server.close(error => (error ? reject(error) : resolveClose()));
  });
  return port;
};

test("serves tools over stdio and shuts down with the client", async () => {
  const port = await reservePort();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("dist/index.js")],
    cwd: process.cwd(),
    env: {
      ...getDefaultEnvironment(),
      ASEPRITE_WS_PORT: String(port)
    },
    stderr: "pipe"
  });
  const client = new Client({
    name: "stdio-smoke-client",
    version: "0.0.0"
  });
  let childPid: number | null = null;

  try {
    await client.connect(transport);
    childPid = transport.pid;
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map(tool => tool.name).sort(),
      [...toolNames].sort()
    );
    assert.ok(childPid);
  } finally {
    await client.close().catch(error => {
      assert.match(String(error), /Connection closed/);
    });
  }

  if (childPid) {
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
    assert.throws(() => process.kill(childPid, 0));
  }
});
