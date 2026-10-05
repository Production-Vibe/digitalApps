# Human-in-the-loop reproduction loop (PowerShell).
# Copy this file, edit the steps below, and run it:
#   powershell -ExecutionPolicy Bypass -File hitl-loop.ps1
# The agent runs the script; the user follows prompts in their terminal.
#
# Two helpers:
#   Step "<instruction>"        -> show instruction, wait for Enter
#   Capture "<variable>" "<q>"   -> show question, read response into variable
#
# At the end, captured values are printed as NAME=VALUE for the agent to parse.
#
# `Capture` echoes the value back to the terminal where the agent reads it, so
# capture observations and leave signing in to the user as a `Step`.

$ErrorActionPreference = 'Stop'

function Step([string]$instruction) {
    Write-Host ''
    Write-Host ">>> $instruction" -ForegroundColor Cyan
    Read-Host '    [Enter when done]'
}

function Capture([string]$variable, [string]$question) {
    Write-Host ''
    Write-Host ">>> $question" -ForegroundColor Yellow
    $answer = Read-Host '    >'
    Set-Variable -Name $variable -Value $answer -Scope Script
}

# --- edit below ---------------------------------------------------------

Step 'Open the app at http://localhost:3000 and sign in.'

Capture 'ERRORED' "Click the 'Export' button. Did it throw an error? (y/n)"
Capture 'ERROR_MSG' "Paste the error message (or 'none'):"

# --- edit above ---------------------------------------------------------

Write-Host ''
Write-Host '--- Captured ---'
Write-Host "ERRORED=$ERRORED"
Write-Host "ERROR_MSG=$ERROR_MSG"