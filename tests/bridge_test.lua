local sockets = {}

json = {
  encode = function(value)
    return value
  end,
  decode = function(value)
    return value
  end
}

app = {
  apiVersion = 1,
  version = "test"
}

WebSocketMessageType = {
  ERROR = "error",
  OPEN = "open",
  TEXT = "text",
  CLOSE = "close"
}

WebSocket = function(options)
  local socket = {
    options = options,
    sent = {}
  }

  function socket:connect()
  end

  function socket:close()
    self.closed = true
  end

  function socket:sendText(value)
    table.insert(self.sent, value)
  end

  table.insert(sockets, socket)
  return socket
end

local executed = 0
local Bridge = dofile("extension/src/bridge.lua")
local bridge = Bridge.new {
  commands = {
    execute = function()
      executed = executed + 1
      return {}
    end
  },
  getUrl = function()
    return "ws://test"
  end,
  getToken = function()
    return ""
  end
}

bridge:connect()
local first = sockets[1]
first.options.onreceive(WebSocketMessageType.OPEN)

bridge:connect()
local second = sockets[2]
second.options.onreceive(WebSocketMessageType.OPEN)
first.options.onreceive(WebSocketMessageType.CLOSE)

assert(bridge.connected, "a stale CLOSE event disconnected the active socket")

second.options.onreceive(WebSocketMessageType.TEXT, {
  command = "ping",
  args = {}
})

assert(executed == 1, "the active socket did not execute the command")
assert(#second.sent == 2, "the active socket did not send ready and response messages")

print("bridge tests passed")
