$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot "extension\package.json"
$mainPath = Join-Path $repoRoot "extension\main.lua"
$commandsPath = Join-Path $repoRoot "extension\src\commands.lua"
$bridgePath = Join-Path $repoRoot "extension\src\bridge.lua"
$bridgeTestPath = Join-Path $repoRoot "tests\bridge_test.lua"
$commandsTestPath = Join-Path $repoRoot "tests\commands_test.lua"
$serverRoot = Join-Path $repoRoot "server"

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

if (Get-Command lua -ErrorAction SilentlyContinue) {
  Push-Location $repoRoot
  try {
    & lua $bridgeTestPath
    if ($LASTEXITCODE -ne 0) {
      throw "Bridge tests failed"
    }

    & lua $commandsTestPath
    if ($LASTEXITCODE -ne 0) {
      throw "Command tests failed"
    }
  }
  finally {
    Pop-Location
  }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required to validate the MCP server"
}
if (-not (Test-Path (Join-Path $serverRoot "node_modules"))) {
  throw "MCP dependencies are missing; run npm install in $serverRoot"
}

& npm --prefix $serverRoot run typecheck
if ($LASTEXITCODE -ne 0) {
  throw "MCP TypeScript validation failed"
}

& npm --prefix $serverRoot test
if ($LASTEXITCODE -ne 0) {
  throw "MCP tests failed"
}

Write-Output "Extension and MCP server validation passed."
