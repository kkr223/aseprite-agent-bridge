# Aseprite MCP Bridge

[English](README.md) | [简体中文](README.zh-CN.md)

通过 Codex 或其他兼容 MCP 的 Agent 控制正在运行的 Aseprite。Agent
可以检查文档、编辑像素、管理图层和帧、保存或导出文件，并以 PNG
预览图的形式获取当前活动帧。

```text
Agent + 可选的 Aseprite Skill
            |
            | 基于 stdio 的 MCP
            v
TypeScript MCP Server
            |
            | 127.0.0.1:32123 上的 WebSocket
            v
Aseprite Lua 扩展
            |
            v
当前精灵、图层、帧和 Cel
```

预览工具让 Agent 可以形成视觉反馈闭环：

```text
检查 -> 编辑 -> 渲染 PNG -> 评估 -> 修正
```

## 项目组成

- `extension/`：提供显式命令 API 的 Aseprite 扩展。
- `server/`：负责本地 WebSocket 监听的 TypeScript MCP Server。
- `skill/aseprite-agent/`：可选的 Codex Skill，包含安全编辑和预览工作流。
- `PROTOCOL.md`：MCP Server 与扩展之间的 WebSocket 协议。

本项目不会开放任意 Lua 执行、任意 Shell 执行、远程 WebSocket 访问或
多实例路由。

## 环境要求

- Node.js 20 或更高版本
- 支持 Lua WebSocket API 的 Aseprite 1.3
- 使用仓库脚本时需要 Windows PowerShell
- 使用下文 Codex 安装命令时需要 Codex CLI

当前实现已在 Aseprite `1.3.17.2`、API 版本 `40` 和 Node.js `24`
环境中完成测试。

## 构建

安装 MCP Server 依赖：

```powershell
cd server
npm install
cd ..
```

验证并构建扩展和 MCP Server：

```powershell
.\scripts\validate.ps1
.\scripts\build.ps1
```

生成的入口文件：

```text
dist/aseprite-ws-bridge.aseprite-extension
server/dist/index.js
```

## 安装 Aseprite 扩展

打开 `dist/aseprite-ws-bridge.aseprite-extension`，允许 Aseprite
安装扩展，并在提示时重启 Aseprite。

扩展首次加载时，Aseprite 会显示脚本安全确认。请先检查扩展内容；
如果希望以后启动时自动连接，可以选择**完全信任此脚本**。

设置入口：

```text
文件 > 脚本 > AI Bridge: Settings
```

默认地址是 `ws://127.0.0.1:32123`。扩展连接前必须先启动 MCP Server。
如果设置了共享 Token，请确保扩展中的值与 `ASEPRITE_TOKEN` 相同；
仅在本机回环地址开发时也可以让两边都保持为空。

## 安装到 Codex

先构建 MCP Server，然后将其注册为全局 MCP。请把命令中的路径替换为
你本机的实际路径：

```powershell
codex mcp add aseprite `
  --env "ASEPRITE_PATH=E:\SteamLibrary\steamapps\common\Aseprite\Aseprite.exe" `
  --env "ASEPRITE_WS_PORT=32123" `
  --env "ASEPRITE_REQUEST_TIMEOUT_MS=10000" `
  --env "ASEPRITE_LAUNCH_TIMEOUT_MS=15000" `
  -- node "D:\workspace\aseprite-ws-extension\server\dist\index.js"
```

检查注册结果：

```powershell
codex mcp get aseprite
```

安装可选的 Skill：

```powershell
Copy-Item `
  -Recurse `
  -Force `
  ".\skill\aseprite-agent" `
  "$HOME\.codex\skills\aseprite-agent"
```

如果当前线程中没有出现新 MCP 工具或 Skill，请新建一个 Codex 线程，
或重启 Codex。

## 配置其他 MCP 客户端

MCP Server 使用标准 stdio 传输。通用客户端配置示例：

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

## 使用方法

1. 启动 MCP 客户端，让 WebSocket Server 开始监听。
2. 启动 Aseprite，或让 Agent 调用 `aseprite_launch`。
3. 确认 `aseprite_status` 返回 `ready: true`。
4. 使用 `aseprite_get_state` 检查当前文档。
5. 编辑精灵，并在每次有意义的修改后调用 `aseprite_get_preview`。
6. 使用 `aseprite_save_as` 保存可编辑源文件，使用 `aseprite_export`
   导出交付文件。

`aseprite_get_preview` 首次写入临时 PNG 时，Aseprite 可能显示单独的
文件访问确认。允许写入后预览功能才能正常工作。MCP Server 读取图片后
会删除临时预览目录。

坐标从零开始，帧编号从一开始。颜色使用 `RRGGBB` 或 `RRGGBBAA`
十六进制格式，可以带有 `#` 前缀。

## MCP 工具

| 分类 | 工具 |
| --- | --- |
| 连接 | `aseprite_status`、`aseprite_launch` |
| 检查 | `aseprite_get_state`、`aseprite_get_preview` |
| 文档 | `aseprite_create_sprite`、`aseprite_save`、`aseprite_save_as`、`aseprite_export` |
| 图层 | `aseprite_add_layer`、`aseprite_select_layer` |
| 帧 | `aseprite_add_frame`、`aseprite_select_frame` |
| 绘制 | `aseprite_draw_pixels`、`aseprite_fill_rect`、`aseprite_clear_cel` |
| 历史记录 | `aseprite_undo`、`aseprite_redo` |

一个 MCP Server 同时只允许一个 Aseprite 实例连接。预览图对应当前
活动帧；查看某一帧之前，请先选择该帧。

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `ASEPRITE_WS_PORT` | `32123` | 本地 WebSocket 监听端口 |
| `ASEPRITE_TOKEN` | 空 | 每个桥接请求携带的共享 Token |
| `ASEPRITE_PATH` | 未设置 | `aseprite_launch` 使用的可执行文件 |
| `ASEPRITE_REQUEST_TIMEOUT_MS` | `10000` | 桥接命令超时时间 |
| `ASEPRITE_LAUNCH_TIMEOUT_MS` | `15000` | 启动后等待扩展连接的时间 |

WebSocket 监听始终绑定到 `127.0.0.1`。

## 开发

运行扩展与 MCP 验证：

```powershell
.\scripts\validate.ps1
```

验证内容包括：

- Lua 语法检查和 Mock 回归测试
- TypeScript 类型检查
- WebSocket 连接、超时和协议测试
- MCP 工具 Schema 和命令映射测试
- PNG 预览临时文件清理测试
- 真实 stdio MCP 启动和关闭冒烟测试

构建发布产物：

```powershell
.\scripts\build.ps1
```

Aseprite 安装包只包含 `main.lua`、`package.json` 和两个运行时源码模块。
Server 测试、Skill 文件和 Node 依赖不会被打入扩展安装包。

## 故障排查

- **`not_connected`**：启动 Aseprite 或调用 `aseprite_launch`，然后检查
  `aseprite_status`。
- **启动超时**：确认扩展已经安装并设为信任、启用了自动连接，并且扩展
  与 MCP Server 使用相同端口。
- **连接后命令超时**：重新安装最新版扩展。旧版本不接受 Aseprite JSON
  返回的 userdata 容器。
- **预览超时**：检查 Aseprite 是否正在等待文件访问确认，并允许临时
  PNG 写入。
- **地址已被占用**：另一个 MCP Server 正在占用端口。关闭它，或同时
  修改 Server 与扩展使用的端口。
- **`unauthorized`**：确保扩展 Token 与 `ASEPRITE_TOKEN` 相同。
- **协议版本不匹配**：从同一个仓库版本重新构建并安装扩展和 MCP Server。
- **Codex 中没有新工具**：修改全局 MCP 或 Skill 配置后，新建线程或重启
  Codex。

桥接协议格式请参阅 [PROTOCOL.md](PROTOCOL.md)。
