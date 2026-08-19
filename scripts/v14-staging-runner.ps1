# V14 - Windows all-in-one staging runner for AEROVENTA.RU (hardened correction)
# Run from the repository root in PowerShell:
#   .\scripts\v14-staging-runner.ps1
#
# Fixes vs. the first V14 draft:
#  (2) No frozen expected SHA. Requires branch=main + clean tracked
#      worktree, does `git fetch origin main`, fast-forwards only if
#      safe (local HEAD is an ancestor of origin/main), then uses the
#      exact resulting HEAD. Fails closed on divergence.
#  (1) Decrypts the EXISTING Windows-DPAPI Build Reader token (never
#      creates a new credential) and exports DIRECTUS_URL /
#      DIRECTUS_STATIC_TOKEN for the build child-process only, clearing
#      them in a finally block. Optionally preflights the token:
#      content read should be 200, /users should be 401/403.
#  (5) Prompts locally for staging Basic Auth username/password and
#      FTP(S) login/password (all hidden input), exports them as env
#      vars for the deploy + acceptance child processes only, clears
#      them in a finally block. No secret is ever written to disk/log.

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

Write-Log "=== V14 STAGING RUNNER START (hardened) ==="

# --- Step: require main branch ---
Invoke-Step "Require branch=main" {
  $branch = git rev-parse --abbrev-ref HEAD
  if ($branch -ne "main") { throw ("Current branch is '" + $branch + "', not 'main'.") }
}

# --- Step: require clean tracked worktree ---
Invoke-Step "Require clean tracked worktree" {
  $status = git status --porcelain
  if ($status) { throw ("Worktree not clean:`n" + $status) }
}

# --- Step: fetch + fast-forward-only pull ---
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

# --- Load config to find the DPAPI path (config itself is not secret) ---
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

try {
  # --- Decrypt existing Build Reader token (no new credential created) ---
  Write-Log "Decrypting existing DPAPI Build Reader token (local, in-memory only)."
  $env:DIRECTUS_URL = $Config.directusUrl
  $env:DIRECTUS_STATIC_TOKEN = Unprotect-DpapiFile -dpapiPath $Config.buildReaderDpapiPath

  Invoke-Step "Preflight Directus Build Reader token (content=200, /users=401/403)" {
    $headers = @{ Authorization = ("Bearer " + $env:DIRECTUS_STATIC_TOKEN) }
    $contentResp = Invoke-WebRequest -Uri ($env:DIRECTUS_URL + "/items") -Headers $headers -UseBasicParsing -SkipHttpErrorCheck
    if ($contentResp.StatusCode -ne 200) { Write-Log ("  note: /items preflight status=" + $contentResp.StatusCode + " (non-fatal, continuing)") }
    $usersResp = Invoke-WebRequest -Uri ($env:DIRECTUS_URL + "/users") -Headers $headers -UseBasicParsing -SkipHttpErrorCheck
    if ($usersResp.StatusCode -ne 401 -and $usersResp.StatusCode -ne 403) {
      throw ("Build Reader token unexpectedly can read /users (status=" + $usersResp.StatusCode + "). Token scope looks wrong - aborting.")
    }
    Write-Log ("  /users correctly denied with status=" + $usersResp.StatusCode)
  }

  Invoke-Step "Directus V13 preview build (reused, unmodified)" { node scripts/build-directus-v13-preview.mjs }
  Invoke-Step "Postbuild (reused, unmodified - writes robots + validates)" { node scripts/postbuild.mjs }
}
finally {
  $env:DIRECTUS_URL = $null
  $env:DIRECTUS_STATIC_TOKEN = $null
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

try {
  $env:V14_BASIC_AUTH_USER     = $BasicUser
  $env:V14_BASIC_AUTH_PASSWORD = Unwrap $BasicPassSec
  $env:V14_FTP_LOGIN           = Unwrap $FtpLoginSec
  $env:V14_FTP_PASSWORD        = Unwrap $FtpPassSec

  Invoke-Step "Deploy static preview to isolated staging (FTPS, staging-only guard + pre-upload safety listing)" {
    node scripts/v14-stage-deploy.mjs
  }

  Invoke-Step "External acceptance checks against staging (exact contract counts + byte/sha256 checks)" {
    node scripts/v14-external-acceptance.mjs
  }
}
finally {
  $env:V14_BASIC_AUTH_USER = $null
  $env:V14_BASIC_AUTH_PASSWORD = $null
  $env:V14_FTP_LOGIN = $null
  $env:V14_FTP_PASSWORD = $null
}

Write-Log "=== V14 STAGING RUNNER COMPLETE ==="
Write-Log ("Full log: " + $LogPath)
Write-Log "Production aeroventa.ru document root was never addressed by this run."
