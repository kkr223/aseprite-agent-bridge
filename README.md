# Aseprite MCP Bridge

Control a live Aseprite session from Codex or another MCP-compatible agent.
The agent can inspect documents, edit pixels, manage layers and frames, save
or export files, and receive the active frame as a PNG preview.

```text
Agent + optional Aseprite Skill
            |
            | MCP over stdio
            v
TypeScript MCP server
            |
            | WebSocket on 127.0.0.1:32123
            v
Aseprite Lua extension
            |
            v
Active sprite, layers, frames, and cels
```

The preview tool enables a visual feedback loop:

```text
inspect -> edit -> render PNG -> evaluate -> correct
```

## Components

- `extension/`: Aseprite extension that exposes an explicit command API.
- `server/`: TypeScript MCP server that owns the local WebSocket listener.
- `skill/aseprite-agent/`: Optional Codex Skill with safe editing and preview
  workflows.
- `PROTOCOL.md`: WebSocket protocol between the server and extension.

Arbitrary Lua execution, arbitrary shell execution, remote WebSocket access,
and multi-instance routing are intentionally not exposed.

## Requirements

- Node.js 20 or newer
- Aseprite 1.3 with Lua WebSocket API support
- Windows PowerShell for the repository scripts
- Codex CLI when using the included Codex setup commands

The implementation has been tested with Aseprite `1.3.17.2`, API version `40`,
and Node.js `24`.

## Build

Install the MCP server dependencies:

```powershell
cd server
npm install
cd ..
```

Validate and build both components:

```powershell
.\scripts\validate.ps1
.\scripts\build.ps1
```

Generated entry points:

```text
dist/aseprite-ws-bridge.aseprite-extension
server/dist/index.js
```

## Install The Extension

Open `dist/aseprite-ws-bridge.aseprite-extension` and allow Aseprite to install
it. Restart Aseprite when requested.

On first load, Aseprite displays a script security confirmation. Review the
extension and select **Fully trust this script** if you want it to connect
automatically on later launches.

Open the settings at:

```text
File > Scripts > AI Bridge: Settings
```

The default endpoint is `ws://127.0.0.1:32123`. The MCP server must be running
before the extension can connect. Use the same shared token in the extension
and `ASEPRITE_TOKEN`, or leave both empty for loopback-only development.

## Install In Codex

Build the MCP server first, then register it globally. Replace the paths with
the paths on your machine:

```powershell
codex mcp add aseprite `
  --env "ASEPRITE_PATH=E:\SteamLibrary\steamapps\common\Aseprite\Aseprite.exe" `
  --env "ASEPRITE_WS_PORT=32123" `
  --env "ASEPRITE_REQUEST_TIMEOUT_MS=10000" `
  --env "ASEPRITE_LAUNCH_TIMEOUT_MS=15000" `
  -- node "D:\workspace\aseprite-ws-extension\server\dist\index.js"
```

Verify the registration:

```powershell
codex mcp get aseprite
```

Install the optional Skill:

```powershell
Copy-Item `
  -Recurse `
  -Force `
  ".\skill\aseprite-agent" `
  "$HOME\.codex\skills\aseprite-agent"
```

Start a new Codex thread or restart Codex after installation if the MCP tools
or Skill do not appear in the current thread.

## Configure Other MCP Clients

The server uses standard stdio transport. A generic client configuration looks
like this:

```json
{
  "mcpServers": {
    "aseprite": {
      "command": "node",
      "args": [
        "D:\\workspace\\aseprite-ws-extension\\server\\dist\\index.js"
      ],
      "env": {
        "ASEPRITE_PATH": "E:\\SteamLibrary\\steamapps\\common\\Aseprite\\Aseprite.exe",
        "ASEPRITE_WS_PORT": "32123",
        "ASEPRITE_TOKEN": ""
      }
    }
  }
}
```

## Usage

1. Start the MCP client so the WebSocket server begins listening.
2. Start Aseprite, or ask the agent to call `aseprite_launch`.
3. Confirm `aseprite_status` reports `ready: true`.
4. Inspect the active document with `aseprite_get_state`.
5. Edit the sprite and call `aseprite_get_preview` after meaningful changes.
6. Save the editable source with `aseprite_save_as` and export delivery files
   with `aseprite_export`.

When `aseprite_get_preview` writes its first temporary PNG, Aseprite can show a
separate file-access confirmation. Allow the write operation for previews to
work. The MCP server deletes the temporary preview directory after reading the
image.

Coordinates are zero-based sprite coordinates. Frame numbers are one-based.
Colors use `RRGGBB` or `RRGGBBAA`, optionally prefixed with `#`.

## MCP Tools

| Category | Tools |
| --- | --- |
| Connection | `aseprite_status`, `aseprite_launch` |
| Inspection | `aseprite_get_state`, `aseprite_get_preview` |
| Documents | `aseprite_create_sprite`, `aseprite_save`, `aseprite_save_as`, `aseprite_export` |
| Layers | `aseprite_add_layer`, `aseprite_select_layer` |
| Frames | `aseprite_add_frame`, `aseprite_select_frame` |
| Drawing | `aseprite_draw_pixels`, `aseprite_fill_rect`, `aseprite_clear_cel` |
| History | `aseprite_undo`, `aseprite_redo` |

Only one Aseprite instance can be connected to a server at a time. The preview
represents the active frame; select a frame before requesting its preview.

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `ASEPRITE_WS_PORT` | `32123` | Local WebSocket listening port |
| `ASEPRITE_TOKEN` | empty | Shared token sent with each bridge request |
| `ASEPRITE_PATH` | unset | Executable used by `aseprite_launch` |
| `ASEPRITE_REQUEST_TIMEOUT_MS` | `10000` | Bridge command timeout |
| `ASEPRITE_LAUNCH_TIMEOUT_MS` | `15000` | Time to wait for the extension after launch |

The WebSocket listener always binds to `127.0.0.1`.

## Development

Run extension and MCP validation:

```powershell
.\scripts\validate.ps1
```

This performs:

- Lua syntax and mock regression tests
- TypeScript type checking
- WebSocket connection, timeout, and protocol tests
- MCP tool schema and command mapping tests
- PNG preview cleanup tests
- A real stdio MCP startup and shutdown smoke test

Build release artifacts:

```powershell
.\scripts\build.ps1
```

The Aseprite package contains only `main.lua`, `package.json`, and the two
runtime source modules. Server tests, Skill files, and Node dependencies are
not included in the extension package.

## Troubleshooting

- **`not_connected`**: start Aseprite or call `aseprite_launch`; then check
  `aseprite_status`.
- **Launch timeout**: confirm the extension is installed, trusted, set to
  autoconnect, and using the same port as the MCP server.
- **Command timeout after connecting**: reinstall the latest extension. Older
  builds rejected Aseprite JSON userdata containers.
- **Preview timeout**: check Aseprite for a file-access confirmation and allow
  temporary PNG writes.
- **Address already in use**: another MCP server owns the configured port.
  Stop it or choose a matching new port for the server and extension.
- **`unauthorized`**: make the extension token match `ASEPRITE_TOKEN`.
- **Protocol mismatch**: rebuild and reinstall the extension and MCP server
  from the same repository revision.
- **New tools are missing in Codex**: start a new thread or restart Codex after
  changing global MCP or Skill configuration.

See [PROTOCOL.md](PROTOCOL.md) for the bridge wire format.
