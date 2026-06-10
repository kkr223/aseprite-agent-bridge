local Commands = {}
Commands.__index = Commands

local function requireTable(value, name)
  if type(value) ~= "table" then
    error(name .. " must be an object or array")
  end
  return value
end

local function requireString(value, name)
  if type(value) ~= "string" or value == "" then
    error(name .. " must be a non-empty string")
  end
  return value
end

local function requireInteger(value, name)
  if type(value) ~= "number" or value % 1 ~= 0 then
    error(name .. " must be an integer")
  end
  return value
end

local function positiveInteger(value, name)
  value = requireInteger(value, name)
  if value < 1 then
    error(name .. " must be greater than zero")
  end
  return value
end

local function activeSprite()
  local sprite = app.activeSprite
  if not sprite then
    error("No active sprite")
  end
  return sprite
end

local function findLayer(sprite, name)
  for _, layer in ipairs(sprite.layers) do
    if layer.name == name then
      return layer
    end
  end
  return nil
end

local function requireLayer(sprite, name)
  local layer = findLayer(sprite, requireString(name, "layer"))
  if not layer then
    error("Layer not found: " .. name)
  end
  return layer
end

local function requireFrame(sprite, frameNumber)
  frameNumber = positiveInteger(frameNumber, "frame")
  if frameNumber > #sprite.frames then
    error("Frame is out of range")
  end
  return sprite.frames[frameNumber]
end

local function parseColor(value)
  value = requireString(value, "color"):gsub("^#", "")
  if #value ~= 6 and #value ~= 8 then
    error("color must use RRGGBB or RRGGBBAA hex format")
  end

  local red = tonumber(value:sub(1, 2), 16)
  local green = tonumber(value:sub(3, 4), 16)
  local blue = tonumber(value:sub(5, 6), 16)
  local alpha = #value == 8 and tonumber(value:sub(7, 8), 16) or 255
  if not red or not green or not blue or not alpha then
    error("color contains invalid hexadecimal digits")
  end

  return Color {
    r = red,
    g = green,
    b = blue,
    a = alpha
  }
end

local function getOrCreateCel(sprite, layer, frame)
  local cel = layer:cel(frame)
  if cel then
    return cel
  end

  local image = Image(sprite.width, sprite.height, sprite.colorMode)
  return sprite:newCel(layer, frame, image, Point(0, 0))
end

local function layerState(layer, index)
  return {
    index = index,
    name = layer.name,
    visible = layer.isVisible,
    editable = layer.isEditable,
    opacity = layer.opacity,
    isGroup = layer.isGroup,
    isTilemap = layer.isTilemap
  }
end

local function spriteState(sprite)
  local layers = {}
  for index, layer in ipairs(sprite.layers) do
    table.insert(layers, layerState(layer, index))
  end

  local activeLayer = app.activeLayer
  local activeFrame = app.activeFrame
  return {
    filename = sprite.filename,
    width = sprite.width,
    height = sprite.height,
    colorMode = tostring(sprite.colorMode),
    frameCount = #sprite.frames,
    activeFrame = activeFrame and activeFrame.frameNumber or nil,
    activeLayer = activeLayer and activeLayer.name or nil,
    layers = layers,
    selection = {
      isEmpty = sprite.selection.isEmpty,
      bounds = {
        x = sprite.selection.bounds.x,
        y = sprite.selection.bounds.y,
        width = sprite.selection.bounds.width,
        height = sprite.selection.bounds.height
      }
    }
  }
end

local handlers = {}

handlers.ping = function(args)
  return {
    pong = true,
    timestamp = os.time()
  }
end

handlers.capabilities = function(args)
  local names = {}
  for name, _ in pairs(handlers) do
    table.insert(names, name)
  end
  table.sort(names)
  return {
    protocolVersion = "1.0",
    commands = names
  }
end

handlers.get_state = function(args)
  if not app.activeSprite then
    return {
    hasSprite = false,
    apiVersion = app.apiVersion,
    version = tostring(app.version)
    }
  end
  return {
    hasSprite = true,
    apiVersion = app.apiVersion,
    version = tostring(app.version),
    sprite = spriteState(app.activeSprite)
  }
end

handlers.create_sprite = function(args)
  local width = positiveInteger(args.width, "width")
  local height = positiveInteger(args.height, "height")
  local sprite = Sprite(width, height, ColorMode.RGB)

  if args.filename ~= nil and args.filename ~= "" then
    sprite:saveAs(requireString(args.filename, "filename"))
  end
  app.refresh()
  return spriteState(sprite)
end

handlers.add_layer = function(args)
  local sprite = activeSprite()
  local name = requireString(args.name, "name")
  local layer
  app.transaction("AI: Add Layer", function()
    layer = sprite:newLayer()
    layer.name = name
    app.activeLayer = layer
  end)
  app.refresh()
  return layerState(layer, #sprite.layers)
end

handlers.select_layer = function(args)
  local sprite = activeSprite()
  local layer = requireLayer(sprite, args.name)
  app.activeLayer = layer
  app.refresh()
  return { name = layer.name }
end

handlers.add_frame = function(args)
  local sprite = activeSprite()
  local count = args.count == nil and 1 or positiveInteger(args.count, "count")
  app.transaction("AI: Add Frames", function()
    for _ = 1, count do
      sprite:newEmptyFrame()
    end
  end)
  app.activeFrame = sprite.frames[#sprite.frames]
  app.refresh()
  return {
    frameCount = #sprite.frames,
    activeFrame = app.activeFrame.frameNumber
  }
end

handlers.select_frame = function(args)
  local sprite = activeSprite()
  local frame = requireFrame(sprite, args.frame)
  app.activeFrame = frame
  app.refresh()
  return { frame = frame.frameNumber }
end

handlers.draw_pixels = function(args)
  local sprite = activeSprite()
  local layer = args.layer and requireLayer(sprite, args.layer) or app.activeLayer
  if not layer or layer.isGroup then
    error("A writable image layer must be selected")
  end
  local frame = args.frame and requireFrame(sprite, args.frame) or app.activeFrame
  local pixels = requireTable(args.pixels, "pixels")
  local written = 0

  app.transaction("AI: Draw Pixels", function()
    local cel = getOrCreateCel(sprite, layer, frame)
    local image = cel.image:clone()
    for index, pixel in ipairs(pixels) do
      requireTable(pixel, "pixels[" .. index .. "]")
      local x = requireInteger(pixel.x, "pixels[" .. index .. "].x")
      local y = requireInteger(pixel.y, "pixels[" .. index .. "].y")
      if x >= 0 and y >= 0 and x < sprite.width and y < sprite.height then
        image:drawPixel(
          x - cel.position.x,
          y - cel.position.y,
          parseColor(pixel.color)
        )
        written = written + 1
      end
    end
    cel.image = image
  end)

  app.activeLayer = layer
  app.activeFrame = frame
  app.refresh()
  return { written = written }
end

handlers.fill_rect = function(args)
  local sprite = activeSprite()
  local layer = args.layer and requireLayer(sprite, args.layer) or app.activeLayer
  if not layer or layer.isGroup then
    error("A writable image layer must be selected")
  end
  local frame = args.frame and requireFrame(sprite, args.frame) or app.activeFrame
  local x = requireInteger(args.x, "x")
  local y = requireInteger(args.y, "y")
  local width = positiveInteger(args.width, "width")
  local height = positiveInteger(args.height, "height")
  local color = parseColor(args.color)

  app.transaction("AI: Fill Rectangle", function()
    local cel = getOrCreateCel(sprite, layer, frame)
    local image = cel.image:clone()
    image:clear(
      Rectangle(
        x - cel.position.x,
        y - cel.position.y,
        width,
        height
      ),
      color
    )
    cel.image = image
  end)

  app.activeLayer = layer
  app.activeFrame = frame
  app.refresh()
  return { x = x, y = y, width = width, height = height }
end

handlers.clear_cel = function(args)
  local sprite = activeSprite()
  local layer = args.layer and requireLayer(sprite, args.layer) or app.activeLayer
  if not layer then
    error("No active layer")
  end
  local frame = args.frame and requireFrame(sprite, args.frame) or app.activeFrame

  app.transaction("AI: Clear Cel", function()
    local cel = layer:cel(frame)
    if cel then
      sprite:deleteCel(cel)
    end
  end)
  app.refresh()
  return { cleared = true }
end

handlers.undo = function(args)
  app.command.Undo()
  app.refresh()
  return { undone = true }
end

handlers.redo = function(args)
  app.command.Redo()
  app.refresh()
  return { redone = true }
end

handlers.save = function(args)
  local sprite = activeSprite()
  if sprite.filename == "" then
    error("Active sprite has no filename; use save_as")
  end
  app.command.SaveFile()
  return { filename = sprite.filename }
end

handlers.save_as = function(args)
  local sprite = activeSprite()
  local filename = requireString(args.filename, "filename")
  sprite:saveAs(filename)
  return { filename = sprite.filename }
end

handlers.export = function(args)
  local sprite = activeSprite()
  local filename = requireString(args.filename, "filename")
  sprite:saveCopyAs(filename)
  return { filename = filename }
end

function Commands.new()
  return setmetatable({}, Commands)
end

function Commands:execute(command, args)
  local handler = handlers[command]
  if not handler then
    error("Unknown command: " .. command)
  end
  requireTable(args, "args")
  return handler(args)
end

return Commands
