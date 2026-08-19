# V14 - Windows all-in-one staging runner for AEROVENTA.RU (correction 2)
# Run from the repository root in PowerShell:
#   .\scripts\v14-staging-runner.ps1
#
# Fixes vs. correction 1 (all confirmed by reading the actual committed
# runtime, not re-guessed):
#  (1) This runner NO LONGER pre-builds. It decrypts/sets DIRECTUS env,
#      hard-preflights it, prompts credentials, then calls
#      v14-stage-deploy.mjs ONCE - that script performs the single V13
#      build + single postbuild + FTPS upload. DIRECTUS_STATIC_TOKEN is
#      kept set through the acceptance step (so acceptance can assert the
#      exact token value is absent from served bodies) and is only
#      cleared in ONE outer finally, alongside all other secrets.
#  (2) Directus preflight is now a HARD gate on both checks: content
#      read (/items/content?limit=1) must be exactly 200; /users must be
#      exactly 401 or 403. Uses a try/catch status-code helper that works
#      on Windows PowerShell 5.1 (no -SkipHttpErrorCheck, which is a
#      PowerShell 7-only parameter).
#  (8) basic-ftp availability is verified/installed BEFORE any credential
#      is prompted. If still unresolvable after an install attempt, the
#      run fails closed before touching any secret prompt.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$LogPath = Join-Path $RepoRoot ("reports\v14-runner-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot "reports") | Out-Null

function Write-Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
  Write-Host $line
  Add-Content -Path $LogPath -Value $line
}

function Invoke-Step($label, $scriptBlock) {
  Write-Log ("STEP: " + $label)
  try {
    & $scriptBlock
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
      throw ("Step exited with code " + $LASTEXITCODE)
    }
    Write-Log ("OK: " + $label)
  } catch {
    Write-Log ("FAILED: " + $label + " -> " + $_.Exception.Message)
    Write-Log "ABORTING RUN."
    exit 1
  }
}

function Unprotect-DpapiFile($dpapiPath) {
  Add-Type -AssemblyName System.Security
  if (-not (Test-Path $dpapiPath)) {
    throw ("Build Reader DPAPI file not found: " + $dpapiPath)
  }
  $encrypted = [System.IO.File]::ReadAllBytes($dpapiPath)
  $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $encrypted, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  return [System.Text.Encoding]::UTF8.GetString($decrypted)
}

function Get-HttpStatusCode($Uri, $Headers) {
  # Works on both Windows PowerShell 5.1 and PowerShell 7+: Invoke-WebRequest
  # throws on non-2xx in both, and in both the exception's Response object
  # exposes a usable status code (HttpWebResponse.StatusCode on 5.1's
  # System.Net.WebException, HttpResponseMessage.StatusCode on 7's
  # Microsoft.PowerShell.Commands.HttpResponseException).
  try {
    $resp = Invoke-WebRequest -Uri $Uri -Headers $Headers -UseBasicParsing
    return [int]$resp.StatusCode
  } catch {
    $r = $_.Exception.Response
    if ($null -eq $r) { throw }
    try { return [int]$r.StatusCode } catch { return [int]$r.StatusCode.value__ }
  }
}

Write-Log "=== V14 STAGING RUNNER START (correction 2) ==="

# --- Require main branch ---
Invoke-Step "Require branch=main" {
  $branch = git rev-parse --abbrev-ref HEAD
  if ($branch -ne "main") { throw ("Current branch is '" + $branch + "', not 'main'.") }
}

# --- Require clean tracked worktree ---
Invoke-Step "Require clean tracked worktree" {
  $status = git status --porcelain
  if ($status) { throw ("Worktree not clean:`n" + $status) }
}

# --- Fetch + fast-forward-only pull ---
Invoke-Step "git fetch origin main + fast-forward-only pull" {
  git fetch origin main
  if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }
  $localHead = (git rev-parse HEAD).Trim()
  $remoteHead = (git rev-parse origin/main).Trim()
  if ($localHead -ne $remoteHead) {
    $mergeBase = (git merge-base HEAD origin/main).Trim()
    if ($mergeBase -ne $localHead) {
      throw "Local main has diverged from origin/main - cannot fast-forward safely. Resolve manually."
    }
    git merge --ff-only origin/main
    if ($LASTEXITCODE -ne 0) { throw "fast-forward merge failed" }
  }
}

$FinalHead = (git rev-parse HEAD).Trim()
Write-Log ("Resulting HEAD after fetch/ff-pull: " + $FinalHead)

Invoke-Step "Verify worktree/HEAD sanity" { node scripts/v14-verify-head.mjs }

# --- Load config (config itself is not secret) ---
$ConfigLocalPath = Join-Path $RepoRoot "scripts\v14-stage-config.local.json"
if (-not (Test-Path $ConfigLocalPath)) {
  Write-Log "FAILED: scripts/v14-stage-config.local.json not found. Copy the .example file and fill in real values."
  exit 1
}
$ConfigRaw = Get-Content -Raw -Path $ConfigLocalPath
if ($ConfigRaw -match "REPLACE") {
  Write-Log "FAILED: v14-stage-config.local.json still contains a REPLACE placeholder."
  exit 1
}
$Config = ($ConfigRaw | ConvertFrom-Json).staging

# --- Dependency preflight BEFORE any credential prompt ---
Invoke-Step "Ensure 'basic-ftp' is resolvable (install locally if needed, before any credential prompt)" {
  $probe = "import('basic-ftp').then(()=>process.exit(0),()=>process.exit(1))"
  & node -e $probe
  if ($LASTEXITCODE -ne 0) {
    Write-Log "  'basic-ftp' not resolvable, installing locally (not saved to package.json)..."
    & npm install --no-save --package-lock=false --no-audit --no-fund basic-ftp
    if ($LASTEXITCODE -ne 0) { throw "npm install of basic-ftp failed" }
    & node -e $probe
    if ($LASTEXITCODE -ne 0) { throw "'basic-ftp' still not resolvable after install attempt" }
  }
}

$AllSecretsSet = $false
try {
  # --- Decrypt existing Build Reader token (no new credential created) ---
  Write-Log "Decrypting existing DPAPI Build Reader token (local, in-memory only)."
  $env:DIRECTUS_URL = $Config.directusUrl
  $env:DIRECTUS_STATIC_TOKEN = Unprotect-DpapiFile -dpapiPath $Config.buildReaderDpapiPath
  $AllSecretsSet = $true

  Invoke-Step "HARD preflight: /items/content?limit=1 must be 200, /users must be 401/403" {
    $headers = @{ Authorization = ("Bearer " + $env:DIRECTUS_STATIC_TOKEN) }
    $contentStatus = Get-HttpStatusCode -Uri ($env:DIRECTUS_URL + "/items/content?limit=1") -Headers $headers
    if ($contentStatus -ne 200) {
      throw ("Content preflight failed: expected 200, got " + $contentStatus + ". Aborting - this is a hard gate.")
    }
    Write-Log ("  content preflight OK: status=" + $contentStatus)

    $usersStatus = Get-HttpStatusCode -Uri ($env:DIRECTUS_URL + "/users") -Headers $headers
    if ($usersStatus -ne 401 -and $usersStatus -ne 403) {
      throw ("Build Reader token unexpectedly can read /users (status=" + $usersStatus + "). Token scope looks wrong - aborting.")
    }
    Write-Log ("  /users correctly denied with status=" + $usersStatus)
  }

  Write-Log "Collecting staging Basic Auth and FTP(S) credentials locally (hidden, not logged/committed)."
  $BasicUser     = Read-Host -Prompt "Staging Basic Auth username"
  $BasicPassSec  = Read-Host -Prompt "Staging Basic Auth password" -AsSecureString
  $FtpLoginSec   = Read-Host -Prompt "Beget staging-only FTP login" -AsSecureString
  $FtpPassSec    = Read-Host -Prompt "Beget staging-only FTP password" -AsSecureString

  function Unwrap($secure) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  }

  $env:V14_BASIC_AUTH_USER     = $BasicUser
  $env:V14_BASIC_AUTH_PASSWORD = Unwrap $BasicPassSec
  $env:V14_FTP_LOGIN           = Unwrap $FtpLoginSec
  $env:V14_FTP_PASSWORD        = Unwrap $FtpPassSec

  Invoke-Step "Deploy: ONE V13 build + ONE postbuild + FTPS upload (staging-only guard + fail-closed safety listing)" {
    node scripts/v14-stage-deploy.mjs
  }

  Invoke-Step "External acceptance checks against staging (exact contract counts, PDF split, absolute redirect targets, byte/sha256 checks)" {
    node scripts/v14-external-acceptance.mjs
  }
}
finally {
  # Single outer clear of every secret this run ever set, regardless of
  # where a failure occurred.
  $env:DIRECTUS_URL = $null
  $env:DIRECTUS_STATIC_TOKEN = $null
  $env:V14_BASIC_AUTH_USER = $null
  $env:V14_BASIC_AUTH_PASSWORD = $null
  $env:V14_FTP_LOGIN = $null
  $env:V14_FTP_PASSWORD = $null
  if ($AllSecretsSet) { Write-Log "All secrets cleared from process environment (outer finally)." }
}

Write-Log "=== V14 STAGING RUNNER COMPLETE ==="
Write-Log ("Full log: " + $LogPath)
Write-Log "Production aeroventa.ru document root was never addressed by this run."
