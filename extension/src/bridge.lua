local Bridge = {}
Bridge.__index = Bridge

local PROTOCOL_VERSION = "1.0"

local function makeResponse(id, ok, payload)
  local response = {
    id = id,
    ok = ok,
    protocolVersion = PROTOCOL_VERSION
  }

  if ok then
    response.result = payload
  else
    response.error = payload
  end
  return response
end

function Bridge.new(options)
  return setmetatable({
    commands = options.commands,
    getUrl = options.getUrl,
    getToken = options.getToken,
    socket = nil,
    connected = false
  }, Bridge)
end

function Bridge:send(payload)
  if not self.socket or not self.connected then
    return
  end
  self.socket:sendText(json.encode(payload))
end

function Bridge:sendError(id, code, message)
  self:send(makeResponse(id, false, {
    code = code,
    message = message
  }))
end

function Bridge:authorize(request)
  local expected = self.getToken() or ""
  if expected == "" then
    return true
  end
  return request.token == expected
end

function Bridge:handleText(data)
  local decoded, request = pcall(json.decode, data)
  if not decoded or type(request) ~= "table" then
    self:sendError(nil, "invalid_json", "Message must be a JSON object")
    return
  end

  if not self:authorize(request) then
    self:sendError(request.id, "unauthorized", "Invalid bridge token")
    return
  end

  if type(request.command) ~= "string" or request.command == "" then
    self:sendError(request.id, "invalid_request", "command must be a non-empty string")
    return
  end

  local succeeded, result = pcall(
    self.commands.execute,
    self.commands,
    request.command,
    request.args or {}
  )

  if not succeeded then
    self:sendError(request.id, "command_failed", tostring(result))
    return
  end

  self:send(makeResponse(request.id, true, result))
end

function Bridge:handleEvent(messageType, data, errorMessage)
  if messageType == WebSocketMessageType.ERROR then
    self.connected = false
    return
  end

  if messageType == WebSocketMessageType.OPEN then
    self.connected = true
    self:send {
      event = "bridge.ready",
      protocolVersion = PROTOCOL_VERSION,
      apiVersion = app.apiVersion,
      version = tostring(app.version)
    }
    return
  end

  if messageType == WebSocketMessageType.TEXT then
    self:handleText(data)
    return
  end

  if messageType == WebSocketMessageType.CLOSE then
    self.connected = false
  end
end

function Bridge:connect()
  self:disconnect()

  self.socket = WebSocket {
    url = self.getUrl(),
    deflate = false,
    minreconnectwait = 1,
    maxreconnectwait = 10,
    onreceive = function(messageType, data, errorMessage)
      local ok, message = pcall(
        self.handleEvent,
        self,
        messageType,
        data,
        errorMessage
      )
      if not ok and self.connected then
        self:sendError(nil, "bridge_error", tostring(message))
      end
    end
  }
  self.socket:connect()
end

function Bridge:disconnect()
  self.connected = false
  if self.socket then
    self.socket:close()
    self.socket = nil
  end
end

return Bridge
