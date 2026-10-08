param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("architect", "watch", "orchestrator")]
    [string]$Mode
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
    Write-Host "[!] $Message" -ForegroundColor Red
    exit 1
}

$root = $PSScriptRoot
Set-Location -LiteralPath $root

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "npm не найден в PATH." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "node не найден в PATH." }

$bridge = Join-Path $root "tools\mcp-orchestrator"

if ($Mode -eq "watch") {
    $watch = Join-Path $bridge "watch.ps1"
    if (-not (Test-Path -LiteralPath $watch)) { Fail "watch.ps1 не найден: $watch" }
    Push-Location -LiteralPath $bridge
    try {
        & npm run watch
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    exit $code
}

if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) { Fail "opencode не найден в PATH." }

$cfg = Join-Path $root "opencode.json"
if (-not (Test-Path -LiteralPath $cfg)) { Fail "opencode.json не найден: $cfg" }
if (-not (Select-String -LiteralPath $cfg -Pattern '"orchestrator"' -Quiet)) {
    Fail "Блок mcp.orchestrator не найден в opencode.json."
}

if (-not (Test-Path -LiteralPath (Join-Path $bridge "node_modules"))) {
    Write-Host "[i] Установка зависимостей моста (npm ci)..."
    Push-Location -LiteralPath $bridge
    try {
        & npm ci
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($code -ne 0) { Fail "npm ci завершился с ошибкой (exit $code): $bridge" }
}

switch ($Mode) {
    "architect" { & opencode --agent nda-architect }
    "orchestrator" { & opencode --agent nda-orchestrator }
    default { Fail "Неизвестный режим: $Mode" }
}
exit $LASTEXITCODE
