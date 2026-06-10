$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$extensionRoot = Join-Path $repoRoot "extension"
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

Write-Output $extensionPath

