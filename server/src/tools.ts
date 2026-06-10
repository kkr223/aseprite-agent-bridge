import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  type AsepriteBridge,
  BridgeError
} from "./bridge-server.js";
import type { ServerConfig } from "./config.js";
import { launchAseprite } from "./launcher.js";

type JsonObject = Record<string, unknown>;

const colorSchema = z
  .string()
  .regex(/^#?(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
  .describe("RRGGBB or RRGGBBAA hex color, optionally prefixed with #");
const positiveInteger = z.number().int().positive();
const frameSchema = positiveInteger.optional().describe("One-based frame number");
const layerSchema = z.string().min(1).optional();

const textResult = (value: unknown): CallToolResult => ({
  content: [
    {
      type: "text",
      text: JSON.stringify(value, null, 2)
    }
  ]
});

const errorResult = (error: unknown): CallToolResult => {
  const code = error instanceof BridgeError ? error.code : "mcp_error";
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ code, message }, null, 2)
      }
    ]
  };
};

const runBridgeCommand = async (
  bridge: AsepriteBridge,
  command: string,
  args: JsonObject = {}
): Promise<CallToolResult> => {
  try {
    return textResult(await bridge.request(command, args));
  } catch (error) {
    return errorResult(error);
  }
};

export const toolNames = [
  "aseprite_status",
  "aseprite_launch",
  "aseprite_get_state",
  "aseprite_create_sprite",
  "aseprite_add_layer",
  "aseprite_select_layer",
  "aseprite_add_frame",
  "aseprite_select_frame",
  "aseprite_draw_pixels",
  "aseprite_fill_rect",
  "aseprite_clear_cel",
  "aseprite_undo",
  "aseprite_redo",
  "aseprite_save",
  "aseprite_save_as",
  "aseprite_export",
  "aseprite_get_preview"
] as const;

export const registerAsepriteTools = (
  server: McpServer,
  bridge: AsepriteBridge,
  config: ServerConfig
): void => {
  server.registerTool(
    "aseprite_status",
    {
      description: "Report whether the local Aseprite bridge is connected."
    },
    async () => textResult(bridge.getStatus())
  );

  server.registerTool(
    "aseprite_launch",
    {
      description:
        "Launch the configured Aseprite executable and wait for its bridge extension to connect."
    },
    async () => {
      try {
        await launchAseprite(
          config.asepritePath,
          bridge,
          config.launchTimeoutMs
        );
        return textResult(bridge.getStatus());
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "aseprite_get_state",
    {
      description:
        "Inspect the active sprite, frame, layer, selection, and document dimensions."
    },
    async () => runBridgeCommand(bridge, "get_state")
  );

  server.registerTool(
    "aseprite_create_sprite",
    {
      description: "Create a new RGB sprite.",
      inputSchema: {
        width: positiveInteger,
        height: positiveInteger,
        filename: z.string().min(1).optional()
      }
    },
    async args => runBridgeCommand(bridge, "create_sprite", args)
  );

  server.registerTool(
    "aseprite_add_layer",
    {
      description: "Add and select a new image layer.",
      inputSchema: {
        name: z.string().min(1)
      }
    },
    async args => runBridgeCommand(bridge, "add_layer", args)
  );

  server.registerTool(
    "aseprite_select_layer",
    {
      description: "Select an image layer by name.",
      inputSchema: {
        name: z.string().min(1)
      }
    },
    async args => runBridgeCommand(bridge, "select_layer", args)
  );

  server.registerTool(
    "aseprite_add_frame",
    {
      description: "Append one or more empty frames and select the final frame.",
      inputSchema: {
        count: positiveInteger.optional()
      }
    },
    async args => runBridgeCommand(bridge, "add_frame", args)
  );

  server.registerTool(
    "aseprite_select_frame",
    {
      description: "Select a frame by its one-based frame number.",
      inputSchema: {
        frame: positiveInteger
      }
    },
    async args => runBridgeCommand(bridge, "select_frame", args)
  );

  server.registerTool(
    "aseprite_draw_pixels",
    {
      description:
        "Draw colored pixels using zero-based sprite coordinates on an image layer.",
      inputSchema: {
        layer: layerSchema,
        frame: frameSchema,
        pixels: z.array(
          z.object({
            x: z.number().int(),
            y: z.number().int(),
            color: colorSchema
          })
        )
      }
    },
    async args => runBridgeCommand(bridge, "draw_pixels", args)
  );

  server.registerTool(
    "aseprite_fill_rect",
    {
      description:
        "Fill a rectangle using zero-based sprite coordinates on an image layer.",
      inputSchema: {
        layer: layerSchema,
        frame: frameSchema,
        x: z.number().int(),
        y: z.number().int(),
        width: positiveInteger,
        height: positiveInteger,
        color: colorSchema
      }
    },
    async args => runBridgeCommand(bridge, "fill_rect", args)
  );

  server.registerTool(
    "aseprite_clear_cel",
    {
      description: "Delete the cel at the selected or specified layer and frame.",
      inputSchema: {
        layer: layerSchema,
        frame: frameSchema
      }
    },
    async args => runBridgeCommand(bridge, "clear_cel", args)
  );

  for (const [toolName, command, description] of [
    ["aseprite_undo", "undo", "Undo the latest Aseprite operation."],
    ["aseprite_redo", "redo", "Redo the latest undone Aseprite operation."],
    ["aseprite_save", "save", "Save the active sprite to its current filename."]
  ] as const) {
    server.registerTool(
      toolName,
      { description },
      async () => runBridgeCommand(bridge, command)
    );
  }

  server.registerTool(
    "aseprite_save_as",
    {
      description: "Save the active sprite under a new filename.",
      inputSchema: {
        filename: z.string().min(1)
      }
    },
    async args => runBridgeCommand(bridge, "save_as", args)
  );

  server.registerTool(
    "aseprite_export",
    {
      description:
        "Export a copy of the active sprite; the output format is selected by the filename extension.",
      inputSchema: {
        filename: z.string().min(1)
      }
    },
    async args => runBridgeCommand(bridge, "export", args)
  );

  server.registerTool(
    "aseprite_get_preview",
    {
      description:
        "Render the active frame and return a PNG image plus active document metadata."
    },
    async () => {
      let directory: string | undefined;
      try {
        directory = await mkdtemp(join(tmpdir(), "aseprite-mcp-"));
        const filename = join(directory, "preview.png");
        const metadata = await bridge.request("render_preview", { filename });
        const png = await readFile(filename);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(metadata, null, 2)
            },
            {
              type: "image",
              data: png.toString("base64"),
              mimeType: "image/png"
            }
          ]
        };
      } catch (error) {
        return errorResult(error);
      } finally {
        if (directory) {
          await rm(directory, { recursive: true, force: true });
        }
      }
    }
  );
};
