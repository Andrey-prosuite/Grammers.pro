param(
    [ValidateRange(10, 3600)]
    [int]$IntervalSeconds = 30,
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$GitCommand = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
$GitExe = if ($GitCommand) { $GitCommand.Source } else { $null }

if (-not $GitExe -and $env:LOCALAPPDATA) {
    $DesktopGit = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'GitHubDesktop\app-*\resources\app\git\cmd\git.exe') -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($DesktopGit) { $GitExe = $DesktopGit.FullName }
}

if (-not $GitExe) {
    Write-Host 'Git was not found. Install Git for Windows, then reopen this file.'
    exit 1
}

function Invoke-RepoGit {
    param([string[]]$Arguments)
    # Windows PowerShell 5.1 represents native stderr as ErrorRecords.
    # Capture them and use Git's exit code rather than treating progress as failure.
    $PreviousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $OutputLines = @(& $GitExe -C $RepoRoot @Arguments 2>&1)
        $Code = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $PreviousPreference }
    [PSCustomObject]@{
        Code = $Code
        Text = ($OutputLines | ForEach-Object { $_.ToString() }) -join "`n"
    }
}

function Write-SyncStatus {
    param([string]$Message)
    Write-Host ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message)
}

function Sync-Repository {
    $Branch = Invoke-RepoGit -Arguments @('branch', '--show-current')
    if ($Branch.Code -ne 0) {
        Write-SyncStatus 'Cannot read this repository. No files changed.'
        return 'Failed'
    }
    if ($Branch.Text.Trim() -ne 'main') {
        Write-SyncStatus 'Skipped: switch to main in GitHub Desktop.'
        return 'Skipped'
    }

    $Status = Invoke-RepoGit -Arguments @('status', '--porcelain=v1', '--untracked-files=normal')
    if ($Status.Code -ne 0) {
        Write-SyncStatus 'Cannot check local changes. Update skipped.'
        return 'Failed'
    }
    if ($Status.Text.Trim()) {
        Write-SyncStatus 'Paused: local changes or untracked files. Review them in GitHub Desktop.'
        return 'Skipped'
    }

    $Fetch = Invoke-RepoGit -Arguments @('fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main')
    if ($Fetch.Code -ne 0) {
        Write-SyncStatus 'Fetch failed. Check Internet access and GitHub authentication.'
        Write-Host $Fetch.Text
        return 'Failed'
    }

    $Local = Invoke-RepoGit -Arguments @('rev-parse', '--verify', 'HEAD^{commit}')
    $Remote = Invoke-RepoGit -Arguments @('rev-parse', '--verify', 'refs/remotes/origin/main^{commit}')
    if ($Local.Code -ne 0 -or $Remote.Code -ne 0) {
        Write-SyncStatus 'Cannot read main commits. Update skipped.'
        return 'Failed'
    }
    if ($Local.Text.Trim() -eq $Remote.Text.Trim()) {
        Write-SyncStatus 'Up to date.'
        return 'Unchanged'
    }

    $Ancestor = Invoke-RepoGit -Arguments @('merge-base', '--is-ancestor', $Local.Text.Trim(), $Remote.Text.Trim())
    if ($Ancestor.Code -ne 0) {
        Write-SyncStatus 'Paused: local commits or different history. Review in GitHub Desktop.'
        return 'Skipped'
    }

    # Check again in case files or the branch changed while fetch was running.
    $Status = Invoke-RepoGit -Arguments @('status', '--porcelain=v1', '--untracked-files=normal')
    $Branch = Invoke-RepoGit -Arguments @('branch', '--show-current')
    $Current = Invoke-RepoGit -Arguments @('rev-parse', '--verify', 'HEAD^{commit}')
    if ($Status.Code -ne 0 -or $Branch.Code -ne 0 -or $Current.Code -ne 0 -or
        $Status.Text.Trim() -or $Branch.Text.Trim() -ne 'main' -or $Current.Text.Trim() -ne $Local.Text.Trim()) {
        Write-SyncStatus 'Skipped: local repository changed during fetch.'
        return 'Skipped'
    }

    $Merge = Invoke-RepoGit -Arguments @('merge', '--ff-only', '--no-overwrite-ignore', '--no-edit', '--no-stat', $Remote.Text.Trim())
    if ($Merge.Code -ne 0) {
        Write-SyncStatus 'Update skipped. Review repository status in GitHub Desktop.'
        Write-Host $Merge.Text
        return 'Failed'
    }
    Write-SyncStatus ('Updated to {0}.' -f $Remote.Text.Trim().Substring(0, 7))
    return 'Updated'
}

$PreviousPrompt = $env:GIT_TERMINAL_PROMPT
$env:GIT_TERMINAL_PROMPT = '0'
try {
    Write-Host 'Grammers.pro: receive changes from origin/main. Close this window to stop.'
    Write-Host 'This does not push, reset, stash, install dependencies or build the site.'
    do {
        $Result = Sync-Repository
        if ($Once) {
            if ($Result -eq 'Failed') { exit 1 }
            break
        }
        Start-Sleep -Seconds $IntervalSeconds
    } while ($true)
}
finally { $env:GIT_TERMINAL_PROMPT = $PreviousPrompt }
