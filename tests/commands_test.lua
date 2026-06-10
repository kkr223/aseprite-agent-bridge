local savedPreview = nil

local function makeImage(width, height)
  local image = {
    width = width,
    height = height,
    pixels = {}
  }

  function image:drawImage(source, position)
    for key, value in pairs(source.pixels) do
      local x, y = key:match("(-?%d+),(-?%d+)")
      local target = (tonumber(x) + position.x) .. "," ..
        (tonumber(y) + position.y)
      self.pixels[target] = value
    end
  end

  function image:drawPixel(x, y, color)
    if x >= 0 and y >= 0 and x < self.width and y < self.height then
      self.pixels[x .. "," .. y] = color
    end
  end

  function image:clear(bounds, color)
    for y = bounds.y, bounds.y + bounds.height - 1 do
      for x = bounds.x, bounds.x + bounds.width - 1 do
        self:drawPixel(x, y, color)
      end
    end
  end

  function image:saveAs(filename)
    savedPreview = {
      filename = filename,
      image = self
    }
  end

  return image
end

Point = function(x, y)
  return { x = x, y = y }
end

Rectangle = function(x, y, width, height)
  return { x = x, y = y, width = width, height = height }
end

Color = function(value)
  return value
end

Image = function(width, height)
  if type(width) == "table" then
    return makeImage(width.width, width.height)
  end
  return makeImage(width, height)
end

local frame = { frameNumber = 1 }
local existingImage = makeImage(2, 2)
existingImage.pixels["0,0"] = "old"

local cel = {
  image = existingImage,
  position = Point(2, 2)
}

local layer = {
  name = "Layer 1",
  isImage = true,
  isTilemap = false,
  isReference = false,
  isEditable = true
}

function layer:cel()
  return cel
end

local sprite = {
  width = 8,
  height = 8,
  colorMode = "rgb",
  frames = { frame },
  layers = { layer }
}

function sprite:newCel(targetLayer, targetFrame, image, position)
  cel = {
    image = image,
    position = position
  }
  return cel
end

app = {
  activeSprite = sprite,
  activeLayer = layer,
  activeFrame = frame,
  transaction = function(_, callback)
    callback()
  end,
  refresh = function()
  end
}

local Commands = dofile("extension/src/commands.lua")
local commands = Commands.new()

local result = commands:execute("draw_pixels", {
  pixels = {
    { x = 7, y = 7, color = "#ff0000" }
  }
})

assert(result.written == 1, "draw_pixels did not report the canvas pixel")
assert(cel.image.pixels["2,2"] == "old", "existing cel pixels were not preserved")
assert(cel.image.pixels["7,7"] ~= nil, "pixel outside the old cel bounds was lost")
assert(cel.position.x == 0 and cel.position.y == 0, "cel was not normalized to canvas origin")

commands:execute("fill_rect", {
  x = 6,
  y = 6,
  width = 2,
  height = 2,
  color = "#00ff00"
})

assert(cel.image.pixels["6,6"] ~= nil, "fill_rect outside old cel bounds was lost")
assert(cel.image.pixels["7,7"] ~= nil, "fill_rect did not cover its full canvas area")

local function assertRejected(rejectedLayer)
  app.activeLayer = rejectedLayer
  local ok, message = pcall(commands.execute, commands, "draw_pixels", {
    pixels = {}
  })
  assert(not ok, "non-image layer was accepted")
  assert(
    tostring(message):find("writable image layer", 1, true),
    "non-image layer returned an unexpected error"
  )
end

assertRejected({
  isImage = true,
  isTilemap = true,
  isReference = false,
  isEditable = true
})
assertRejected({
  isImage = true,
  isTilemap = false,
  isReference = true,
  isEditable = true
})
assertRejected({
  isImage = true,
  isTilemap = false,
  isReference = false,
  isEditable = false
})

app.activeLayer = layer
local preview = commands:execute("render_preview", {
  filename = "preview.png"
})
assert(savedPreview.filename == "preview.png", "preview was not saved")
assert(preview.width == sprite.width, "preview width is incorrect")
assert(preview.height == sprite.height, "preview height is incorrect")
assert(preview.activeFrame == 1, "preview active frame is incorrect")
assert(preview.activeLayer == layer.name, "preview active layer is incorrect")

print("command tests passed")
