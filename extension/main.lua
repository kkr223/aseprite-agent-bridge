local bridge = nil
local settingsDialog = nil

local function loadModule(plugin, name)
  return dofile(app.fs.joinPath(plugin.path, "src", name .. ".lua"))
end

local function applyDefaults(preferences)
  if preferences.url == nil or preferences.url == "" then
    preferences.url = "ws://127.0.0.1:32123"
  end
  if preferences.token == nil then
    preferences.token = ""
  end
  if preferences.autoconnect == nil then
    preferences.autoconnect = true
  end
end

local function showSettings(plugin)
  if settingsDialog then
    settingsDialog:close()
  end

  local preferences = plugin.preferences
  settingsDialog = Dialog("Aseprite WebSocket Bridge")
    :entry {
      id = "url",
      label = "Server URL",
      text = preferences.url
    }
    :entry {
      id = "token",
      label = "Token",
      text = preferences.token
    }
    :check {
      id = "autoconnect",
      label = "Connect",
      text = "Automatically on startup",
      selected = preferences.autoconnect
    }
    :button {
      id = "save",
      text = "Save",
      onclick = function()
        local data = settingsDialog.data
        preferences.url = data.url
        preferences.token = data.token
        preferences.autoconnect = data.autoconnect
        settingsDialog:close()
      end
    }
    :button {
      id = "connect",
      text = "Save & Connect",
      onclick = function()
        local data = settingsDialog.data
        preferences.url = data.url
        preferences.token = data.token
        preferences.autoconnect = data.autoconnect
        settingsDialog:close()
        bridge:connect()
      end
    }
    :button {
      id = "cancel",
      text = "Cancel"
    }

  settingsDialog:show { wait = false }
end

function init(plugin)
  applyDefaults(plugin.preferences)

  local Commands = loadModule(plugin, "commands")
  local Bridge = loadModule(plugin, "bridge")

  bridge = Bridge.new {
    commands = Commands.new(),
    getUrl = function()
      return plugin.preferences.url
    end,
    getToken = function()
      return plugin.preferences.token
    end
  }

  plugin:newCommand {
    id = "asepriteWsBridgeConnect",
    title = "AI Bridge: Connect",
    group = "file_scripts",
    onclick = function()
      bridge:connect()
    end
  }

  plugin:newCommand {
    id = "asepriteWsBridgeDisconnect",
    title = "AI Bridge: Disconnect",
    group = "file_scripts",
    onclick = function()
      bridge:disconnect()
    end
  }

  plugin:newCommand {
    id = "asepriteWsBridgeSettings",
    title = "AI Bridge: Settings",
    group = "file_scripts",
    onclick = function()
      showSettings(plugin)
    end
  }

  if plugin.preferences.autoconnect then
    bridge:connect()
  end
end

function exit(plugin)
  if settingsDialog then
    settingsDialog:close()
    settingsDialog = nil
  end
  if bridge then
    bridge:disconnect()
    bridge = nil
  end
end

