$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot "extension\package.json"
$mainPath = Join-Path $repoRoot "extension\main.lua"
$commandsPath = Join-Path $repoRoot "extension\src\commands.lua"
$bridgePath = Join-Path $repoRoot "extension\src\bridge.lua"

$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
if ($manifest.name -ne "aseprite-ws-bridge") {
  throw "Unexpected extension name"
}
if (-not $manifest.contributes.scripts) {
  throw "Manifest does not contribute a script"
}

foreach ($path in @($mainPath, $commandsPath, $bridgePath)) {
  if (-not (Test-Path $path)) {
    throw "Missing required file: $path"
  }
  $content = Get-Content -Raw $path
  if ($content.Contains("loadstring") -or $content.Contains("os.execute")) {
    throw "Unsafe dynamic execution found in $path"
  }
}

if (Get-Command luac -ErrorAction SilentlyContinue) {
  & luac -p $mainPath
  & luac -p $commandsPath
  & luac -p $bridgePath
  if ($LASTEXITCODE -ne 0) {
    throw "Lua syntax validation failed"
  }
}

Write-Output "Manifest and source structure are valid."
