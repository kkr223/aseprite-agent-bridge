# WebSocket Protocol

The extension is a WebSocket client. It connects to the local server configured
in `File > Scripts > AI Bridge: Settings`.

Default endpoint:

```text
ws://127.0.0.1:32123
```

## Request

```json
{
  "id": "request-1",
  "command": "get_state",
  "token": "optional-shared-secret",
  "args": {}
}
```

`id` is echoed in the response. When a token is configured in Aseprite, every
request must contain the same token.

## Response

Success:

```json
{
  "id": "request-1",
  "ok": true,
  "protocolVersion": "1.0",
  "result": {}
}
```

Failure:

```json
{
  "id": "request-1",
  "ok": false,
  "protocolVersion": "1.0",
  "error": {
    "code": "command_failed",
    "message": "No active sprite"
  }
}
```

## Commands

| Command | Important arguments |
| --- | --- |
| `ping` | none |
| `capabilities` | none |
| `get_state` | none |
| `create_sprite` | `width`, `height`, optional `filename` |
| `add_layer` | `name` |
| `select_layer` | `name` |
| `add_frame` | optional `count` |
| `select_frame` | `frame` |
| `draw_pixels` | optional `layer`, optional `frame`, `pixels` |
| `fill_rect` | optional `layer`, optional `frame`, `x`, `y`, `width`, `height`, `color` |
| `clear_cel` | optional `layer`, optional `frame` |
| `undo` | none |
| `redo` | none |
| `save` | none |
| `save_as` | `filename` |
| `export` | `filename` |

Coordinates are zero-based sprite coordinates. Frame numbers are one-based.
Colors use `RRGGBB` or `RRGGBBAA`, optionally prefixed with `#`.

Example:

```json
{
  "id": "draw-1",
  "command": "draw_pixels",
  "args": {
    "layer": "AI",
    "frame": 1,
    "pixels": [
      { "x": 4, "y": 5, "color": "#ff0066" },
      { "x": 5, "y": 5, "color": "#ffcc00" }
    ]
  }
}
```

