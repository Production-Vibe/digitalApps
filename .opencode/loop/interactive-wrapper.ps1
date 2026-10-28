# interactive-wrapper.ps1 — интерактивная обёртка opencode с авто-перезапуском
# по маркеру плагина (контракт цикла: instructions/session-loop.md).
# Держит ИНТЕРАКТИВНОЕ окно opencode живым: после авто-стопа плагина (маркер
# .opencode/loop/restart-request.json) сессия перезапускается с seed-промптом,
# зависший процесс добивается grace-kill'ом.
# Запуск: run-agent-interactive.cmd [args] либо
#   powershell -NoProfile -ExecutionPolicy Bypass -File .opencode\loop\interactive-wrapper.ps1 [-Task ...] [-Dry]
#
# Маркер (пишет плагин, обёртка только читает/удаляет), JSON:
#   { version:1, reason:"context_restart", sessionID:"<id>", ratio:<number>,
#     percent:<int>, brief:".opencode/handoff/handoff-*.md", createdAt:"<ISO>",
#     createdAtMs:<int ms>, nonce:"<uuid>", pid:<int> }
# Маркер валиден, только если: парсится как JSON, version -eq 1, sessionID
# непустой, createdAtMs — число и СТРОГО больше времени старта текущей сессии.
# Иначе — устаревший/битый: удалить, в лог, рестарта НЕ делать (защита от
# зацикливания на старом маркере).
# Маркер проверяется и после выхода процесса (гонка маркер/exit не теряет рестарт).
#
# Коды выхода:
#   0 — сессия завершилась без валидного маркера с кодом процесса 0
#       (пользователь закрыл окно / штатный выход), либо завершена
#       симуляция -Dry (реальный лимит в симуляции — не ошибка);
#   N — процесс сам завершился без валидного маркера с ненулевым кодом N:
#       возвращается код процесса (краш окна без запроса перезапуска);
#   1 — не удалось запустить процесс opencode (Process.Start);
#   2 — исчерпан лимит -MaxRestarts;
#   3 — быстрый краш: две сессии подряд с валидным маркером прожили
#       меньше -MinSessionSeconds;
#   4 — grace-kill не удался (процесс жив после taskkill) ИЛИ после
#       стартового сброса появлялся битый/чужой маркер и валидного
#       запроса рестарта не было (маркер удалён без рестарта).
# В режиме -Dry opencode не запускается, маркер и логи — в
# .opencode/loop/dry-run/, всегда выход 0.
[CmdletBinding()]
param(
    [string]$Task = 'Продолжить работу над «ЦифровойНаряд» по docs/reports/STATUS.md',
    [ValidateRange(1, 50)]
    [int]$MaxRestarts = 3,
    [ValidateRange(5, 600)]
    [int]$GraceSeconds = 20,
    [ValidateRange(1, 3600)]
    [int]$MinSessionSeconds = 60,
    [ValidateRange(0.01, 0.99)]
    [double]$RestartThreshold = 0.80,
    [ValidateRange(0.01, 0.99)]
    [double]$Threshold = 0.50,
    [switch]$Dry
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$LoopDir = Join-Path $RepoRoot '.opencode\loop'
$LogsDir = Join-Path $LoopDir 'logs'
$DryRoot = Join-Path $LoopDir 'dry-run'
$MarkerPath = Join-Path $LoopDir 'restart-request.json'

if ($Dry) {
    if (Test-Path -LiteralPath $DryRoot) { Remove-Item -LiteralPath $DryRoot -Recurse -Force }
    $LogsDir = Join-Path $DryRoot 'logs'
    $MarkerPath = Join-Path $DryRoot 'restart-request.json'
}

New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

$stamp = Get-Date -Format 'yyMMdd-HHmmss'
$suffix = ''
if ($Dry) { $suffix = '-dry' }
$LogFile = Join-Path $LogsDir ('interactive-{0}{1}.log' -f $stamp, $suffix)
[System.IO.File]::WriteAllText($LogFile, '')

$thrText = $Threshold.ToString('0.##', [System.Globalization.CultureInfo]::InvariantCulture)
$rtText = $RestartThreshold.ToString('0.##', [System.Globalization.CultureInfo]::InvariantCulture)

function Log([string]$Message) {
    $line = '[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Remove-MarkerIfPresent {
    if (Test-Path -LiteralPath $MarkerPath) {
        Remove-Item -LiteralPath $MarkerPath -Force
        return $true
    }
    return $false
}

# Читает маркер и решает, валиден ли он для текущей сессии.
# Возвращает $null (файла нет) либо @{ Valid; Reason; Marker }.
function Read-RestartMarker([long]$SessionStartMs) {
    if (-not (Test-Path -LiteralPath $MarkerPath)) { return $null }
    $marker = $null
    try {
        $marker = Get-Content -LiteralPath $MarkerPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        return @{ Valid = $false; Reason = 'файл не парсится как JSON'; Marker = $null }
    }
    if ($null -eq $marker) {
        return @{ Valid = $false; Reason = 'пустой/битый JSON'; Marker = $null }
    }
    if ($marker.version -ne 1) {
        return @{ Valid = $false; Reason = "version='$($marker.version)' (ожидается 1)"; Marker = $marker }
    }
    if ([string]::IsNullOrWhiteSpace([string]$marker.sessionID)) {
        return @{ Valid = $false; Reason = 'sessionID пуст'; Marker = $marker }
    }
    $msProp = $marker.PSObject.Properties['createdAtMs']
    if ($null -eq $msProp -or $null -eq $msProp.Value) {
        return @{ Valid = $false; Reason = 'createdAtMs отсутствует'; Marker = $marker }
    }
    $ms = [int64]0
    try { $ms = [int64][double]$msProp.Value } catch {
        return @{ Valid = $false; Reason = 'createdAtMs не число'; Marker = $marker }
    }
    if ($ms -le $SessionStartMs) {
        return @{ Valid = $false; Reason = "createdAtMs=$ms не больше старта сессии $SessionStartMs — маркер чужой/устаревший"; Marker = $marker }
    }
    return @{ Valid = $true; Reason = ''; Marker = $marker }
}

function Start-OpenCodeSession([string]$Prompt) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'cmd.exe'
    # Интерактивный TUI: без --auto, без RedirectStandard* — opencode должен
    # получить консоль; промпт передаётся через --prompt (позиционный аргумент
    # TUI — это project-path, а не сообщение; в текущем CLI -p это --password).
    # Кавычки безопасны: Task/seed-промпты не содержат " (seed заменяет на ').
    $psi.Arguments = '/c opencode --agent orchestrator --prompt "' + $Prompt + '"'
    $psi.WorkingDirectory = $RepoRoot
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $false
    $psi.EnvironmentVariables['ND_RESTART_THRESHOLD'] = $rtText
    $psi.EnvironmentVariables['ND_HANDOFF_THRESHOLD'] = $thrText
    if ($psi.EnvironmentVariables.ContainsKey('ND_RESTART_DISABLE')) {
        $psi.EnvironmentVariables.Remove('ND_RESTART_DISABLE')
    }
    if ($psi.EnvironmentVariables.ContainsKey('ND_LOOP_DRIVER')) {
        $psi.EnvironmentVariables.Remove('ND_LOOP_DRIVER')
    }
    return [System.Diagnostics.Process]::Start($psi)
}

function Build-ResumeSeedPrompt {
    $text = @'
Продолжение интерактивной сессии после авто-перезапуска (переполнение контекста). Свежий бриф — самый поздний файл .opencode/handoff/handoff-*.md: прочитай через Read/Bash (НЕ Glob — он не видит dot-папки), сверь с docs/reports/STATUS.md и git log. Режим resume: pre-approval не повторяй, scope не расширяй, сразу выполняй next_action брифа. Преднастройки сессии подтверждены (.opencode/session/config.json) — шаг подтверждения пропусти. Работай до границы фазы; на границе/пороге контекста — /handoff с актуальным frontmatter.
'@
    return ($text.Trim() -replace '"', "'")
}

Log ('=== interactive-wrapper: ' + $(if ($Dry) { 'DRY (без запуска opencode)' } else { 'РЕАЛЬНЫЙ ПРОГОН' }) + ' ===')
Log ('Параметры: MaxRestarts=' + $MaxRestarts + ' GraceSeconds=' + $GraceSeconds + ' MinSessionSeconds=' + $MinSessionSeconds + ' RestartThreshold=' + $rtText + ' Threshold=' + $thrText)
Log ('Task: ' + $Task)
Log ('Маркер: ' + $MarkerPath)
Log ('Лог: ' + $LogFile)

$exitCode = 0
$stopReason = $null
$restartsUsed = 0
$fastCrash = 0
$prompt = $Task

if ($Dry) {

    # (i) симуляция устаревшего маркера до первого старта — должен быть
    # удалён стартовым сбросом.
    $stale = [ordered]@{
        version     = 1
        reason      = 'context_restart'
        sessionID   = 'stale-sim'
        ratio       = 0.9
        percent     = 90
        brief       = '.opencode/handoff/handoff-stale-sim.md'
        createdAt   = '2020-01-01T00:00:00.000Z'
        createdAtMs = [int64]1577836800000
        nonce       = 'stale-sim'
        pid         = 1
    }
    $stale | ConvertTo-Json | Set-Content -LiteralPath $MarkerPath -Encoding UTF8
    if (Remove-MarkerIfPresent) {
        Log 'DRY: устаревший маркер до старта удалён (защита от зацикливания)'
    }

    # (ii) сессии с валидным маркером и lifetime > MinSessionSeconds →
    # рестарты до -MaxRestarts; длительности — счётчиками, без реального
    # ожидания (никаких Start-Sleep).
    $simStart = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    for ($s = 1; $s -le ($MaxRestarts + 1); $s++) {
        Log ('DRY: сессия ' + $s + ' стартовала (симуляция, opencode не запускался)')
        $simLifetime = $MinSessionSeconds + 5
        Log ('DRY: сессия ' + $s + ' симулированно прожила ' + $simLifetime + ' с (счётчик; > MinSessionSeconds=' + $MinSessionSeconds + ')')
        $simMarker = [ordered]@{
            version     = 1
            reason      = 'context_restart'
            sessionID   = ('dry-session-' + $s)
            ratio       = 0.85
            percent     = 85
            brief       = '.opencode/handoff/handoff-dry-sim.md'
            createdAt   = (Get-Date -Format 'o')
            createdAtMs = [int64]($simStart + [int64]$s * 1000)
            nonce       = ('dry-' + $s)
            pid         = 0
        }
        $simMarker | ConvertTo-Json | Set-Content -LiteralPath $MarkerPath -Encoding UTF8
        $check = Read-RestartMarker -SessionStartMs $simStart
        if ($null -eq $check -or -not $check.Valid) {
            $reason = 'нет маркера'
            if ($check) { $reason = $check.Reason }
            Log ('DRY: маркер не валиден (' + $reason + ') — удаление, рестарта нет')
            Remove-MarkerIfPresent | Out-Null
            continue
        }
        Log ('DRY: обнаружен валидный маркер (sessionID=' + $simMarker.sessionID + ', percent=85) — запрос рестарта')
        $fastCrash = 0
        if ($restartsUsed -ge $MaxRestarts) {
            $stopReason = 'лимит рестартов исчерпан (' + $MaxRestarts + ' из ' + $MaxRestarts + ')'
            $exitCode = 2
            break
        }
        $restartsUsed++
        Log ('DRY: рестарт ' + $restartsUsed + '/' + $MaxRestarts + ' со seed-промптом')
    }

    # (iii) симуляция гонки «маркер записан — процесс уже вышел»: валидный
    # маркер читается после выхода процесса и принимается (без реального
    # процесса) — как финальное чтение в реальной ветке.
    $raceStart = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $raceMarker = [ordered]@{
        version     = 1
        reason      = 'context_restart'
        sessionID   = 'dry-race-exit'
        ratio       = 0.88
        percent     = 88
        brief       = '.opencode/handoff/handoff-dry-race.md'
        createdAt   = (Get-Date -Format 'o')
        createdAtMs = [int64]($raceStart + 1)
        nonce       = 'dry-race'
        pid         = 0
    }
    $raceMarker | ConvertTo-Json | Set-Content -LiteralPath $MarkerPath -Encoding UTF8
    $raceCheck = Read-RestartMarker -SessionStartMs $raceStart
    if ($null -ne $raceCheck -and $raceCheck.Valid) {
        Log ('DRY: маркер обнаружен после выхода процесса (гонка marker/exit) — валидный маркер принят, sessionID=' + $raceMarker.sessionID + ' (без реального процесса)')
    } else {
        $raceReason = 'нет маркера'
        if ($raceCheck) { $raceReason = $raceCheck.Reason }
        Log ('DRY: гонка marker/exit — маркер не принят (' + $raceReason + ')')
    }
    Remove-MarkerIfPresent | Out-Null

} else {

    while ($true) {

        # (b) стартовый сброс маркера перед каждым запуском.
        if (Remove-MarkerIfPresent) { Log 'маркер удалён перед запуском (стартовый сброс)' }
        $sessionStartMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        Log ('Старт сессии #' + ($restartsUsed + 1) + ': opencode --agent orchestrator (интерактивно' + $(if ($restartsUsed -gt 0) { ', рестарт ' + $restartsUsed + '/' + $MaxRestarts } else { '' }) + ')')
        try {
            $proc = Start-OpenCodeSession -Prompt $prompt
        } catch {
            Log ('ОШИБКА запуска opencode: ' + $_.Exception.Message)
            $stopReason = 'не удалось запустить opencode'
            $exitCode = 1
            break
        }
        if ($null -eq $proc) {
            Log 'ОШИБКА запуска opencode: Process.Start вернул null'
            $stopReason = 'не удалось запустить opencode'
            $exitCode = 1
            break
        }
        Log ('opencode запущен, PID=' + $proc.Id)

        # Ожидание: polling 500 мс — выход процесса ЛИБО появление валидного
        # маркера. Без маркера ждём без ограничения по времени (пользователь
        # мог работать часами).
        $markerHit = $null
        $sawBroken = $false
        while ($true) {
            # Сначала читаем маркер, потом проверяем выход процесса: плагин
            # пишет маркер и завершается за ~250 мс при polling 500 мс —
            # прежний порядок (exit → маркер) терял валидный рестарт.
            $check = Read-RestartMarker -SessionStartMs $sessionStartMs
            if ($null -ne $check -and $check.Valid) { $markerHit = $check; break }
            if ($proc.HasExited) { break }
            if ($null -eq $check) { Start-Sleep -Milliseconds 500; continue }
            # Устаревший/битый маркер: удалить, в лог, рестарта НЕ делать.
            $sawBroken = $true
            Log ('маркер битый/не относится к этой сессии (' + $check.Reason + ') — удалён, рестарта нет')
            Remove-MarkerIfPresent | Out-Null
            Start-Sleep -Milliseconds 500
        }

        # Финальное чтение маркера после выхода процесса: закрывает гонку
        # «маркер записан — процесс вышел — polling не успел».
        if ($null -eq $markerHit -and $proc.HasExited) {
            $final = Read-RestartMarker -SessionStartMs $sessionStartMs
            if ($null -ne $final -and $final.Valid) {
                $markerHit = $final
                Log 'маркер обнаружен после выхода процесса (гонка marker/exit)'
            } elseif ($null -ne $final) {
                $sawBroken = $true
                Log ('маркер битый/не относится к этой сессии (' + $final.Reason + ') — удалён после выхода процесса, рестарта нет')
                Remove-MarkerIfPresent | Out-Null
            }
        }

        $hadValidMarker = ($null -ne $markerHit)

        if ($hadValidMarker) {
            $m = $markerHit.Marker
            $pct = '-'
            if ($m.PSObject.Properties['percent'] -and $null -ne $m.percent) { $pct = [string]$m.percent }
            $brief = ''
            if ($m.PSObject.Properties['brief'] -and $m.brief) { $brief = [string]$m.brief }
            Log ('обнаружен валидный маркер: sessionID=' + $m.sessionID + ', reason=' + $m.reason + ', percent=' + $pct + $(if ($brief) { ', brief=' + $brief } else { '' }))
            Log ('таймер грации: ' + $GraceSeconds + ' с — процесс может завершиться сам')
            $graceSw = [System.Diagnostics.Stopwatch]::StartNew()
            while ($graceSw.Elapsed.TotalSeconds -lt $GraceSeconds) {
                if ($proc.HasExited) { break }
                Start-Sleep -Milliseconds 500
            }
            if ($proc.HasExited) {
                $graceSec = [math]::Round($graceSw.Elapsed.TotalSeconds, 1)
                if ($graceSec -le 0.5) {
                    Log 'процесс уже завершился к моменту grace-фазы'
                } else {
                    Log ('процесс завершился сам за ' + $graceSec + ' с грации')
                }
            } else {
                Log ('grace-kill: taskkill.exe /PID ' + $proc.Id + ' /T /F')
                & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null
                $killed = $proc.WaitForExit(5000)
                if (-not $killed) {
                    Log 'процесс ЖИВ после grace-kill — стоп (код 4)'
                    $stopReason = 'grace-kill не удался (процесс жив после taskkill)'
                    $exitCode = 4
                    break
                }
                Log 'grace-kill выполнен'
            }
        } else {
            $proc.WaitForExit()
        }

        $lifetimeMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $sessionStartMs
        $lifetimeSec = [math]::Round($lifetimeMs / 1000.0, 1)
        Log ('сессия #' + ($restartsUsed + 1) + ' завершилась: exit=' + $proc.ExitCode + ', срок жизни ' + $lifetimeSec + ' с')

        if (-not $hadValidMarker) {
            if ($sawBroken) {
                $stopReason = 'после стартового сброса появлялся битый/чужой маркер, валидного запроса рестарта не было'
                $exitCode = 4
            } else {
                # (d) пользователь закрыл окно / краш без запроса перезапуска.
                $stopReason = 'выход без валидного маркера (пользователь закрыл окно или процесс завершился сам)'
                if ($proc.ExitCode -eq 0) { $exitCode = 0 } else { $exitCode = $proc.ExitCode }
            }
            break
        }

        # (c) guard «быстрый крах»: маркер был, но сессия прожила < MinSessionSeconds.
        if ($lifetimeMs -lt ([int64]$MinSessionSeconds * 1000)) {
            $fastCrash++
            Log ('быстрый крах: сессия прожила ' + $lifetimeSec + ' с (< ' + $MinSessionSeconds + '), подряд: ' + $fastCrash)
            if ($fastCrash -ge 2) {
                $stopReason = 'две сессии подряд с маркером прожили меньше ' + $MinSessionSeconds + ' с — стоп (защита от зацикливания)'
                $exitCode = 3
                break
            }
        } else {
            if ($fastCrash -gt 0) { Log ('сессия прожила ' + $lifetimeSec + ' с — счётчик быстрых крашей сброшен') }
            $fastCrash = 0
        }

        # (a) лимит рестартов исчерпан.
        if ($restartsUsed -ge $MaxRestarts) {
            $stopReason = 'лимит рестартов исчерпан (' + $MaxRestarts + ' из ' + $MaxRestarts + ')'
            $exitCode = 2
            break
        }

        $restartsUsed++
        Log ('РЕСТАРТ ' + $restartsUsed + '/' + $MaxRestarts + ' со seed-промптом')
        $prompt = Build-ResumeSeedPrompt
    }

}

if (-not $stopReason) { $stopReason = 'цикл завершён' }
Log ('СТОП: ' + $stopReason)
if ($Dry) {
    Log 'Симуляция завершена (режим -Dry): реальный лимит не считается ошибкой'
    Log 'Код выхода: 0 (симуляция). Логи: ' + $LogsDir
    exit 0
}
Log ('Код выхода: ' + $exitCode + '. Логи: ' + $LogsDir)
exit $exitCode
