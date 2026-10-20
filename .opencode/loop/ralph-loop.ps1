# ralph-loop.ps1 — внешний драйвер цикла session-loop (контракт: instructions/session-loop.md).
# Запуск: run-agent-loop.cmd [args] либо
#   powershell -NoProfile -ExecutionPolicy Bypass -File .opencode\loop\ralph-loop.ps1 [-Task ...] [-Dry]
# Коды выхода: 0=done, 1=ошибка (нет брифа/неизвестный loop), 2=blocked, 3=лимит итераций, 4=таймаут.
[CmdletBinding()]
param(
    [string]$Task = 'Продолжить работу над «ЦифровойНаряд» по docs/reports/STATUS.md и утверждённому плану',
    [ValidateRange(1, 1000)]
    [int]$MaxIterations = 10,
    [ValidateRange(1, 240)]
    [int]$TimeoutMinutes = 30,
    [ValidateRange(0.01, 0.99)]
    [double]$Threshold = 0.58,
    [switch]$Dry
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$LoopDir = Join-Path $RepoRoot '.opencode\loop'
$LogsDir = Join-Path $LoopDir 'logs'
$StatePath = Join-Path $LoopDir 'state.json'
$HandoffDir = Join-Path $RepoRoot '.opencode\handoff'
$DryRoot = Join-Path $LoopDir 'dry-run'

if ($Dry) {
    if (Test-Path -LiteralPath $DryRoot) { Remove-Item -LiteralPath $DryRoot -Recurse -Force }
    $HandoffDir = Join-Path $DryRoot 'handoff'
    $StatePath = Join-Path $DryRoot 'state.json'
}

New-Item -ItemType Directory -Force -Path $LogsDir, $HandoffDir | Out-Null

$stamp = Get-Date -Format 'yyMMdd-HHmmss'
$suffix = ''
if ($Dry) { $suffix = '-dry' }
$LogFile = Join-Path $LogsDir ('loop-{0}{1}.log' -f $stamp, $suffix)
$thrText = $Threshold.ToString('0.##', [System.Globalization.CultureInfo]::InvariantCulture)

function Log([string]$Message) {
    $line = '[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Get-LatestHandoffFile {
    if (-not (Test-Path -LiteralPath $HandoffDir)) { return $null }
    $files = @(Get-ChildItem -LiteralPath $HandoffDir -Filter 'handoff-*.md' -File | Sort-Object Name -Descending)
    if ($files.Count -eq 0) { return $null }
    return $files[0]
}

function Get-Frontmatter([string]$Path) {
    $lines = @(Get-Content -LiteralPath $Path -Encoding UTF8)
    if ($lines.Count -lt 2) { return $null }
    if ($lines[0].Trim() -ne '---') { return $null }
    $fm = @{}
    for ($i = 1; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line.Trim() -eq '---') { break }
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$') {
            $fm[$Matches[1]] = $Matches[2].Trim()
        }
    }
    if (-not $fm.ContainsKey('loop')) { return $null }
    return $fm
}

function Read-LoopState {
    if (-not (Test-Path -LiteralPath $StatePath)) { return $null }
    try {
        return (Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json)
    } catch {
        return $null
    }
}

function Save-LoopState([int]$Iteration, [string]$Loop, [string]$Plan, [string]$Phase) {
    $state = [ordered]@{
        iteration     = $Iteration
        loop          = $Loop
        phase         = $Phase
        approved_plan = $Plan
        task          = $Task
        updatedAt     = (Get-Date -Format 'o')
    }
    $state | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

function New-SimulatedHandoff([int]$Iteration, [string]$Loop, [string]$Plan, [string]$NextAction) {
    $name = 'handoff-{0}-i{1}.md' -f (Get-Date -Format 'yyMMdd-HHmmss'), $Iteration
    $path = Join-Path $HandoffDir $name
    $body = @"
---
loop: $Loop
iteration: $Iteration
approved_plan: $Plan
next_action: $NextAction
---

# Бриф (итерация $Iteration, симуляция -Dry)

Файл создан драйвером в режиме -Dry; opencode не запускался.
Цикл: $Loop.
"@
    Set-Content -LiteralPath $path -Value $body -Encoding UTF8
    return $path
}

function Build-ColdPrompt([int]$Iteration) {
    $text = @"
Холодный старт цикла session-loop «ЦифровойНаряд». Итерация $Iteration. Режим COLD: свежего resume-брифа нет или он не согласован со state.json.
Задача цикла: $Task
Действия: пройди pre-approval (уточни цель и scope либо зафиксируй уже согласованный план), зафиксируй утверждённый план в docs/specs/ или .opencode/design/ — это approved_plan. Далее исполняй только утверждённый scope.
Неинтерактивный запуск: если .opencode/session/config.json уже существует — преднастройки повторно НЕ опрашивай и вопросов не задавай, зафиксируй согласованный план/разумные дефолты и продолжай работу.
Проверяй .opencode/** (свежие брифы .opencode/handoff/, .opencode/session/config.json, .opencode/loop/state.json) инструментами Read либо Bash (Test-Path, Get-Content, Get-ChildItem) — НЕ полагайся на Glob: он не видит dot-папки, и его «0 совпадений» не доказывает, что файлов нет.
На границе фазы, при вопросе пользователю или когда контекст достигнет порога $thrText — заверши ход командой /handoff с актуальным frontmatter: loop (continue, done или blocked), iteration, approved_plan, next_action.
"@
    return ($text -replace '"', "'")
}

function Build-ResumePrompt([int]$Iteration, [string]$Plan, [string]$NextAction) {
    $planRef = $Plan
    if ([string]::IsNullOrWhiteSpace($planRef)) { $planRef = '(из брифа)' }
    $nextAct = $NextAction
    if ([string]::IsNullOrWhiteSpace($nextAct)) { $nextAct = '(из брифа)' }
    $text = @"
RESUME-режим цикла session-loop «ЦифровойНаряд». Итерация $Iteration. Это продолжение по уже утверждённому плану $planRef.
Прочитай свежий бриф: последний файл .opencode/handoff/ (frontmatter loop, iteration, approved_plan, next_action) и сверь его с docs/reports/STATUS.md и git log (пункт 0 ритуала старта в AGENTS.md).
Проверяй .opencode/** (handoff, session/config.json, loop/state) инструментами Read либо Bash (Test-Path, Get-Content, Get-ChildItem) — НЕ полагайся на Glob: он не видит dot-папки, и его «0 совпадений» не доказывает, что брифов/конфига нет.
Правила resume-режима: pre-approval НЕ повторяй; план не пересматривай; scope не расширяй. Сразу выполни next_action: $nextAct — работай только в approved scope.
Преднастройки сессии подтверждены (запуск драйвером): шаг подтверждения session-bootstrap ПРОПУСТИ; вопрос «подтвердить/изменить» не задавай — инструмент question в неинтерактивной сессии недоступен; сразу продолжай работу.
Задача вне approved scope — записать handoff с loop: blocked и вопросом пользователю, ход завершить.
При завершении фазы или когда контекст достигнет порога $thrText — записать handoff с актуальным frontmatter (loop, iteration, approved_plan, next_action) и завершить ход.
Общая задача цикла: $Task
"@
    return ($text -replace '"', "'")
}

function Invoke-OpenCodeIteration([string]$Prompt, [int]$Iteration) {
    $outLog = Join-Path $LogsDir ('iter-{0}-{1}.out.log' -f $stamp, $Iteration)
    $errLog = Join-Path $LogsDir ('iter-{0}-{1}.err.log' -f $stamp, $Iteration)

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'cmd.exe'
    # Свежая сессия: без -c/--continue; промпт — позиционный аргумент message
    # (в текущем CLI opencode флаг -p это --password, а не print).
    $psi.Arguments = '/c opencode run --agent orchestrator --auto "' + $Prompt + '"'
    $psi.WorkingDirectory = $RepoRoot
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8

    $proc = [System.Diagnostics.Process]::Start($psi)
    Log ('opencode запущен, PID=' + $proc.Id)
    $outTask = $proc.StandardOutput.ReadToEndAsync()
    $errTask = $proc.StandardError.ReadToEndAsync()

    $timeoutMs = [int]([int64]$TimeoutMinutes * 60 * 1000)
    $finished = $proc.WaitForExit($timeoutMs)
    if (-not $finished) {
        Log ('Таймаут ' + $TimeoutMinutes + ' мин — kill-on-hang (taskkill /T /F PID=' + $proc.Id + ')')
        & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null
        [void]$outTask.Wait(15000)
        [void]$errTask.Wait(15000)
        $outText = ''
        $errText = 'RALPH-LOOP: iteration timed out and process tree was killed.'
        if ($outTask.IsCompleted) { $outText = $outTask.Result }
        if ($errTask.IsCompleted -and -not [string]::IsNullOrEmpty($errTask.Result)) { $errText = $errTask.Result }
        Set-Content -LiteralPath $outLog -Value $outText -Encoding UTF8
        Set-Content -LiteralPath $errLog -Value $errText -Encoding UTF8
        return @{ TimedOut = $true; ExitCode = -1 }
    }
    $proc.WaitForExit()
    $outText = $outTask.Result
    $errText = $errTask.Result
    Set-Content -LiteralPath $outLog -Value $outText -Encoding UTF8
    Set-Content -LiteralPath $errLog -Value $errText -Encoding UTF8
    return @{ TimedOut = $false; ExitCode = $proc.ExitCode }
}

Log ('=== ralph-loop: ' + $(if ($Dry) { 'DRY (без запуска opencode)' } else { 'РЕАЛЬНЫЙ ПРОГОН' }) + ' ===')
Log ('Параметры: MaxIterations=' + $MaxIterations + ' TimeoutMinutes=' + $TimeoutMinutes + ' Threshold=' + $thrText)
Log ('Task: ' + $Task)
Log ('Handoff-каталог: ' + $HandoffDir)
Log ('Лог: ' + $LogFile)

$exitCode = 0
$stopReason = $null

for ($slot = 1; $slot -le $MaxIterations; $slot++) {

    $latest = Get-LatestHandoffFile
    if ($latest) {
        $preFm = Get-Frontmatter $latest.FullName
        if ($preFm) {
            if ($preFm['loop'] -eq 'done') {
                $stopReason = 'loop: done в брифе ' + $latest.Name + ' — цикл закрыт'
                $exitCode = 0
                break
            }
            if ($preFm['loop'] -eq 'blocked') {
                $stopReason = 'loop: blocked в брифе ' + $latest.Name + ' — ход за пользователем'
                $exitCode = 2
                break
            }
        }
    }

    $state = Read-LoopState
    $mode = 'cold'
    $iteration = 1
    $plan = ''
    $nextAction = ''
    if ($latest) {
        $fm = Get-Frontmatter $latest.FullName
        if ($fm -and $fm['loop'] -eq 'continue' -and $state) {
            $agree = $true
            if ($state.loop -ne 'continue') { $agree = $false }
            if ($fm.ContainsKey('iteration') -and $state.iteration -and ([int]$fm['iteration'] -ne [int]$state.iteration)) { $agree = $false }
            if ($fm.ContainsKey('approved_plan') -and $state.approved_plan -and ($fm['approved_plan'] -ne [string]$state.approved_plan)) { $agree = $false }
            if ($agree) {
                $mode = 'resume'
                $baseIter = 0
                if ($fm.ContainsKey('iteration')) { $baseIter = [int]$fm['iteration'] } else { $baseIter = [int]$state.iteration }
                $iteration = $baseIter + 1
                if ($fm.ContainsKey('approved_plan')) { $plan = $fm['approved_plan'] } else { $plan = [string]$state.approved_plan }
                if ($fm.ContainsKey('next_action')) { $nextAction = $fm['next_action'] }
            }
        }
    }

    if ($mode -eq 'resume') {
        Log ('Итерация ' + $iteration + ': RESUME (план: ' + $plan + ')')
        $prompt = Build-ResumePrompt -Iteration $iteration -Plan $plan -NextAction $nextAction
    } else {
        Log ('Итерация ' + $iteration + ': COLD-старт')
        $prompt = Build-ColdPrompt -Iteration $iteration
    }
    $promptLog = Join-Path $LogsDir ('iter-{0}-{1}.prompt.txt' -f $stamp, $iteration)
    Set-Content -LiteralPath $promptLog -Value $prompt -Encoding UTF8
    Log ('Промпт (' + $mode + ') сохранён: ' + $promptLog)

    # F2: запоминаем имя последнего брифа ДО запуска итерации — после итерации
    # результатом считается только файл с другим именем (новый бриф).
    $preHandoffName = $null
    $preHandoff = Get-LatestHandoffFile
    if ($preHandoff) { $preHandoffName = Split-Path -Leaf $preHandoff.FullName }

    $newFm = $null
    if ($Dry) {
        if ($iteration -le 1) {
            $simLoop = 'continue'
            $simNext = 'симуляция: выполнить следующий шаг утверждённого плана'
        } else {
            $simLoop = 'done'
            $simNext = 'симуляция: цикл завершён'
        }
        $simPlan = $plan
        if ([string]::IsNullOrWhiteSpace($simPlan)) { $simPlan = '.opencode/design/dry-run-plan.md' }
        $hp = New-SimulatedHandoff -Iteration $iteration -Loop $simLoop -Plan $simPlan -NextAction $simNext
        Log ('DRY: симулирован бриф ' + (Split-Path -Leaf $hp) + ' (loop: ' + $simLoop + ')')
        $newFm = Get-Frontmatter $hp
    } else {
        Log ('Запуск: opencode run --agent orchestrator --auto (свежая сессия, таймаут ' + $TimeoutMinutes + ' мин)')
        $result = Invoke-OpenCodeIteration -Prompt $prompt -Iteration $iteration
        if ($result.TimedOut) {
            Save-LoopState -Iteration $iteration -Loop 'timeout' -Plan $plan -Phase 'timeout'
            $stopReason = 'таймаут итерации ' + $iteration + ' (' + $TimeoutMinutes + ' мин) — процесс убит (kill-on-hang)'
            $exitCode = 4
            break
        }
        Log ('opencode завершился: exit=' + $result.ExitCode + '; логи iter-' + $stamp + '-' + $iteration + '.out.log / iter-' + $stamp + '-' + $iteration + '.err.log')
        $latestAfter = Get-LatestHandoffFile
        $latestAfterName = $null
        if ($latestAfter) { $latestAfterName = Split-Path -Leaf $latestAfter.FullName }
        if (-not $latestAfter -or $latestAfterName -eq $preHandoffName) {
            # Нового брифа нет (или это прежний чужой файл) — state.json НЕ перезаписываем,
            # чтобы не затереть план старым брифом.
            $stopReason = 'итерация ' + $iteration + ' завершена без нового handoff — нить потеряна, останов (см. логи итерации)'
            $exitCode = 1
            break
        }
        $newFm = Get-Frontmatter $latestAfter.FullName
        if (-not $newFm) {
            Save-LoopState -Iteration $iteration -Loop 'error' -Plan $plan -Phase 'bad-handoff'
            $stopReason = 'в брифе ' + $latestAfter.Name + ' нет валидного frontmatter (loop) — останов'
            $exitCode = 1
            break
        }
        Log ('Прочитан бриф ' + $latestAfter.Name)
    }

    $newLoop = $newFm['loop']
    $newPlan = $plan
    if ($newFm.ContainsKey('approved_plan')) { $newPlan = $newFm['approved_plan'] }
    Save-LoopState -Iteration $iteration -Loop $newLoop -Plan $newPlan -Phase $newLoop
    Log ('Состояние: iteration=' + $iteration + ' loop=' + $newLoop)

    if ($newLoop -eq 'done') {
        $stopReason = 'loop: done на итерации ' + $iteration + ' — цикл завершён'
        $exitCode = 0
        break
    }
    if ($newLoop -eq 'blocked') {
        $stopReason = 'loop: blocked на итерации ' + $iteration + ' — ход за пользователем'
        $exitCode = 2
        break
    }
    if ($newLoop -ne 'continue') {
        $stopReason = "неизвестное значение loop='$newLoop' в брифе — стоп как ошибка"
        $exitCode = 1
        break
    }
}

if (-not $stopReason) {
    $stopReason = 'достигнут лимит итераций (' + $MaxIterations + '); последний бриф — loop: continue'
    $exitCode = 3
}

Log ('СТОП: ' + $stopReason)
Log ('Код выхода: ' + $exitCode + '. Логи: ' + $LogsDir)
exit $exitCode
