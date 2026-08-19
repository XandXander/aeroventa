# V14 - Windows all-in-one staging runner for AEROVENTA.RU
# Run from the repository root in PowerShell:
#   .\scripts\v14-staging-runner.ps1 -ExpectedHeadSha 8e4ef126820d25ee45d5cee4392438d0d2f987f7
#
# What it does, in order, aborting on the first failure:
#   1. Verifies local git HEAD against the expected SHA.
#   2. Runs the already-validated V13 Directus preview build + validator
#      as black-box steps (does not modify them).
#   3. Prompts locally (hidden input) for Beget FTP credentials and the
#      staging Basic-Auth password. Nothing typed here is ever written to
#      disk, logs, or git - it lives only in this PowerShell process's
#      environment variables for the duration of the run.
#   4. Runs the Node deploy script, which enforces its own "staging-only
#      target" guard independently of this runner.
#   5. Runs the external acceptance script against the staging URL.
#   6. Writes exactly one consolidated result log.
#
# This script cannot address or overwrite the production Bitrix root:
# the deploy step's remoteRoot/acceptanceBaseUrl guard (see
# scripts/v14-stage-deploy.mjs) hard-fails if those values do not contain
# the "staging" path segment, independent of anything this runner does.

param(
  [string]$ExpectedHeadSha = "8e4ef126820d25ee45d5cee4392438d0d2f987f7"
)

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
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
      throw ("Step exited with code " + $LASTEXITCODE)
    }
    Write-Log ("OK: " + $label)
  } catch {
    Write-Log ("FAILED: " + $label + " -> " + $_.Exception.Message)
    Write-Log "ABORTING RUN."
    exit 1
  }
}

Write-Log "=== V14 STAGING RUNNER START ==="
Write-Log ("Expected HEAD: " + $ExpectedHeadSha)

Invoke-Step "Verify local HEAD" { node scripts/v14-verify-head.mjs $ExpectedHeadSha }

Invoke-Step "Directus V13 preview build (reused, unmodified)" { node scripts/build-directus-v13-preview.mjs }

Invoke-Step "Validate built site (reused, unmodified)" { node scripts/validate-built-site.mjs }

Write-Log "Collecting Beget staging credentials locally (input hidden, not logged, not committed)."
$FtpLoginSecure = Read-Host -Prompt "Beget staging-only FTP login" -AsSecureString
$FtpPassSecure  = Read-Host -Prompt "Beget staging-only FTP password" -AsSecureString

$FtpLoginPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($FtpLoginSecure)
$FtpPassPtr  = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($FtpPassSecure)
try {
  $env:V14_FTP_LOGIN    = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($FtpLoginPtr)
  $env:V14_FTP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($FtpPassPtr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($FtpLoginPtr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($FtpPassPtr)
}

Invoke-Step "Deploy static preview to isolated staging (staging-only guard enforced in script)" {
  node scripts/v14-stage-deploy.mjs $ExpectedHeadSha
}

# Credentials are no longer needed after upload; clear them immediately.
$env:V14_FTP_LOGIN = $null
$env:V14_FTP_PASSWORD = $null

Invoke-Step "External acceptance checks against staging" { node scripts/v14-external-acceptance.mjs }

Write-Log "=== V14 STAGING RUNNER COMPLETE ==="
Write-Log ("Full log: " + $LogPath)
Write-Log "Production aeroventa.ru document root was never addressed by this run."
