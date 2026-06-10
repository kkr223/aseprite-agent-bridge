import assert from "node:assert/strict";
import { access, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  type AsepriteBridge,
  BridgeError
} from "../src/bridge-server.js";
import type { ServerConfig } from "../src/config.js";
import {
  registerAsepriteTools,
  toolNames
} from "../src/tools.js";

interface BridgeCall {
  command: string;
  args: unknown;
}

const config: ServerConfig = {
  wsPort: 32123,
  token: "",
  asepritePath: undefined,
  requestTimeoutMs: 100,
  launchTimeoutMs: 100
};

const createHarness = async (
  bridge: AsepriteBridge
): Promise<{
  client: Client;
  server: McpServer;
  close: () => Promise<void>;
}> => {
  const server = new McpServer({
    name: "test-server",
    version: "0.0.0"
  });
  registerAsepriteTools(server, bridge, config);
  const client = new Client({
    name: "test-client",
    version: "0.0.0"
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);
  return {
    client,
    server,
    close: async () => {
      await client.close();
      await server.close();
    }
  };
};

test("publishes all tools and maps tool arguments to bridge commands", async () => {
  const calls: BridgeCall[] = [];
  const bridge: AsepriteBridge = {
    getStatus: () => ({ connected: true, ready: true }),
    waitUntilReady: async () => {},
    request: async (command, args = {}) => {
      calls.push({ command, args });
      return { command, args };
    }
  };
  const harness = await createHarness(bridge);

  try {
    const listed = await harness.client.listTools();
    assert.deepEqual(
      listed.tools.map(tool => tool.name).sort(),
      [...toolNames].sort()
    );

    const cases: Array<[string, string, Record<string, unknown>]> = [
      ["aseprite_get_state", "get_state", {}],
      [
        "aseprite_create_sprite",
        "create_sprite",
        { width: 16, height: 16 }
      ],
      ["aseprite_add_layer", "add_layer", { name: "Ink" }],
      ["aseprite_select_layer", "select_layer", { name: "Ink" }],
      ["aseprite_add_frame", "add_frame", { count: 2 }],
      ["aseprite_select_frame", "select_frame", { frame: 2 }],
      [
        "aseprite_draw_pixels",
        "draw_pixels",
        { pixels: [{ x: 1, y: 2, color: "#ff0000" }] }
      ],
      [
        "aseprite_fill_rect",
        "fill_rect",
        { x: 0, y: 0, width: 4, height: 4, color: "00ff00ff" }
      ],
      ["aseprite_clear_cel", "clear_cel", {}],
      ["aseprite_undo", "undo", {}],
      ["aseprite_redo", "redo", {}],
      ["aseprite_save", "save", {}],
      ["aseprite_save_as", "save_as", { filename: "sprite.aseprite" }],
      ["aseprite_export", "export", { filename: "sprite.png" }]
    ];

    for (const [toolName, command, args] of cases) {
      const result = await harness.client.callTool({
        name: toolName,
        arguments: args
      });
      assert.notEqual(result.isError, true, toolName);
      assert.equal(calls.at(-1)?.command, command);
      assert.deepEqual(calls.at(-1)?.args, args);
    }
  } finally {
    await harness.close();
  }
});

test("validates schemas and preserves bridge error details", async () => {
  const bridge: AsepriteBridge = {
    getStatus: () => ({ connected: false, ready: false }),
    waitUntilReady: async () => {},
    request: async () => {
      throw new BridgeError("not_connected", "Start Aseprite");
    }
  };
  const harness = await createHarness(bridge);

  try {
    const invalid = (await harness.client.callTool({
      name: "aseprite_create_sprite",
      arguments: { width: 0, height: 16 }
    })) as CallToolResult;
    assert.equal(invalid.isError, true);

    const failed = (await harness.client.callTool({
      name: "aseprite_get_state",
      arguments: {}
    })) as CallToolResult;
    assert.equal(failed.isError, true);
    const text = failed.content.find(item => item.type === "text");
    assert.ok(text && text.type === "text");
    assert.deepEqual(JSON.parse(text.text), {
      code: "not_connected",
      message: "Start Aseprite"
    });
  } finally {
    await harness.close();
  }
});

test("returns PNG image content and removes the preview directory", async () => {
  let previewFilename = "";
  const bridge: AsepriteBridge = {
    getStatus: () => ({ connected: true, ready: true }),
    waitUntilReady: async () => {},
    request: async (command, args) => {
      assert.equal(command, "render_preview");
      previewFilename = (args as { filename: string }).filename;
      await writeFile(previewFilename, Buffer.from([137, 80, 78, 71]));
      return {
        width: 16,
        height: 16,
        activeFrame: 1,
        activeLayer: "Ink"
      };
    }
  };
  const harness = await createHarness(bridge);

  try {
    const result = (await harness.client.callTool({
      name: "aseprite_get_preview",
      arguments: {}
    })) as CallToolResult;
    assert.notEqual(result.isError, true);
    const image = result.content.find(item => item.type === "image");
    assert.ok(image && image.type === "image");
    assert.equal(image.mimeType, "image/png");
    assert.equal(image.data, Buffer.from([137, 80, 78, 71]).toString("base64"));
    await assert.rejects(access(previewFilename));
    await assert.rejects(access(dirname(previewFilename)));
  } finally {
    await harness.close();
  }
});

test("removes preview files when rendering fails", async () => {
  let previewFilename = "";
  const bridge: AsepriteBridge = {
    getStatus: () => ({ connected: true, ready: true }),
    waitUntilReady: async () => {},
    request: async (_command, args) => {
      previewFilename = (args as { filename: string }).filename;
      throw new BridgeError("command_failed", "render failed");
    }
  };
  const harness = await createHarness(bridge);

  try {
    const result = (await harness.client.callTool({
      name: "aseprite_get_preview",
      arguments: {}
    })) as CallToolResult;
    assert.equal(result.isError, true);
    await assert.rejects(access(dirname(previewFilename)));
  } finally {
    await harness.close();
  }
});
