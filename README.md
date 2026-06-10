# Aseprite WebSocket Bridge

An Aseprite extension that exposes a small, explicit command API to a local
WebSocket server. It is intended as the editor-side bridge for AI agents, MCP
servers, automation tools, and live development workflows.

The extension controls the currently running Aseprite session. It does not
launch a new batch process for each operation.

## Architecture

```text
AI agent or MCP server
        |
        | WebSocket JSON messages
        v
Aseprite WebSocket Bridge extension
        |
        | Aseprite Lua API + transactions
        v
Active sprite, layers, frames, and cels
```

The external process acts as the WebSocket server. Aseprite's Lua API provides
a WebSocket client, so the extension connects outward to a loopback endpoint.

## Build

```powershell
.\scripts\validate.ps1
.\scripts\build.ps1
```

The installable package is generated at:

```text
dist/aseprite-ws-bridge.aseprite-extension
```

Open that file to install it in Aseprite, then restart Aseprite if requested.

## Configure

Open:

```text
File > Scripts > AI Bridge: Settings
```

The default server is `ws://127.0.0.1:32123`. A shared token is optional but
recommended. Keep the server bound to `127.0.0.1`; this API can modify and save
the active document.

See [PROTOCOL.md](PROTOCOL.md) for the request and response format.

## Current Scope

- Inspect the active document and advertised capabilities
- Create sprites, layers, and frames
- Select layers and frames
- Draw pixel batches and filled rectangles
- Clear cels
- Undo and redo edits
- Save, save as, and export through file extensions

Arbitrary Lua execution is intentionally not exposed.

## Requirements

- Aseprite with Lua WebSocket API support
- A local WebSocket server that accepts JSON text messages

## Development

The extension is deliberately thin. AI planning, schema adaptation, retries,
preview analysis, and MCP integration should live in the external service.

