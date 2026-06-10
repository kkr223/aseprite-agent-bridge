---
name: aseprite-agent
description: Create, inspect, and edit pixel art or sprite animations in a live Aseprite session through the aseprite MCP tools. Use for requests to draw sprites, modify pixels, manage layers or frames, export images, inspect the current Aseprite document, or iteratively refine artwork from PNG previews.
---

# Aseprite Agent

Use the `aseprite_*` MCP tools to operate the user's live Aseprite session.
Work in short edit-and-preview cycles so visual mistakes stay cheap to undo.

## Start And Inspect

1. Call `aseprite_status`.
2. If disconnected, call `aseprite_launch`, then check status again.
3. Call `aseprite_get_state` before editing an existing document.
4. Call `aseprite_get_preview` whenever an existing visual must be understood.

Do not create a new sprite when the user clearly intends to modify the active
one. Do not save, overwrite, or export unless the request requires it.

## Create Artwork

1. Establish dimensions, palette, background treatment, and animation needs
   from the request.
2. Create the sprite with `aseprite_create_sprite` when no suitable document is
   active.
3. Use named layers for distinct visual roles such as background, silhouette,
   shading, highlights, and effects.
4. Prefer `aseprite_fill_rect` for solid regions and `aseprite_draw_pixels` for
   contours, details, and sparse edits.
5. Batch related pixels into one tool call instead of sending one call per
   pixel.
6. Request a preview after each meaningful visual stage and correct issues
   before adding more detail.

Use zero-based coordinates and one-based frame numbers. Colors are six- or
eight-digit hexadecimal values, optionally prefixed with `#`.

## Edit Existing Artwork

- Inspect state before selecting layers or frames.
- Use explicit `layer` and `frame` arguments when the target matters; do not
  rely on selection state across long workflows.
- Keep changes localized. Preview immediately after destructive or
  composition-changing edits.
- Use `aseprite_undo` when the latest operation is visibly wrong; avoid trying
  to paint over a structural mistake.
- Preserve the document's existing dimensions, palette intent, layer naming,
  and animation timing unless the user asks to change them.

## Animation

1. Inspect the current frame count.
2. Add only the required frames with `aseprite_add_frame`.
3. Select and edit frames explicitly.
4. Preview each key pose. The preview represents the active frame, so select
   the intended frame before inspecting it.
5. Keep silhouettes stable between frames unless motion requires otherwise.

## Save And Export

- Use `aseprite_save` only when the active document already has the intended
  filename.
- Use `aseprite_save_as` for the editable source file, normally `.aseprite`.
- Use `aseprite_export` for delivery formats such as `.png`.
- After saving or exporting, report the exact returned path.

## Error Recovery

- `not_connected`: call `aseprite_launch`, then retry after status becomes
  ready.
- `No active sprite`: create a sprite only if that matches the user's intent.
- Layer or frame errors: refresh with `aseprite_get_state` instead of guessing.
- Protocol or authorization errors: stop editing and report the configuration
  problem.
- After a failed mutation, inspect state and preview before deciding whether to
  retry or undo.
