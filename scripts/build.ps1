$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$extensionRoot = Join-Path $repoRoot "extension"
$serverRoot = Join-Path $repoRoot "server"
$buildRoot = Join-Path $repoRoot "build"
$distRoot = Join-Path $repoRoot "dist"
$stagingRoot = Join-Path $buildRoot "aseprite-ws-bridge"
$zipPath = Join-Path $distRoot "aseprite-ws-bridge.zip"
$extensionPath = Join-Path $distRoot "aseprite-ws-bridge.aseprite-extension"

if (Test-Path $buildRoot) {
  Remove-Item -Recurse -Force $buildRoot
}
if (Test-Path $distRoot) {
  Remove-Item -Recurse -Force $distRoot
}

New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
New-Item -ItemType Directory -Force -Path $distRoot | Out-Null
Copy-Item -Path (Join-Path $extensionRoot "*") -Destination $stagingRoot -Recurse

Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $zipPath
Move-Item -Path $zipPath -Destination $extensionPath

& npm --prefix $serverRoot run build
if ($LASTEXITCODE -ne 0) {
  throw "MCP server build failed"
}

Write-Output "Extension: $extensionPath"
Write-Output "MCP server: $(Join-Path $serverRoot 'dist\index.js')"
