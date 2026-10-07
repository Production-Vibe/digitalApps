$ErrorActionPreference = "Stop"

try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
} catch {
}

$logPath = Join-Path -Path $PSScriptRoot -ChildPath "logs\orchestrator.log"

if (-not (Test-Path -LiteralPath $logPath)) {
    Write-Host "Лог-файл моста ещё не создан:"
    Write-Host "  $logPath"
    Write-Host ""
    Write-Host "Файл появится автоматически при старте моста (npm start либо подключение через opencode.json)."
    Write-Host "Запустите npm run watch повторно после первого запуска."
    exit 0
}

Write-Host "Наблюдение за логом моста: $logPath"
Write-Host "Показаны последние 120 строк, обновление в реальном времени. Остановка - Ctrl+C."
Write-Host ""

Get-Content -LiteralPath $logPath -Encoding UTF8 -Wait -Tail 120
