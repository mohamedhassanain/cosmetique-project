# =====================================================================
# KISSARIYA - CONTROLLED SUPABASE BOTTLENECK RUNNER
# =====================================================================
# Reads .env (anon key only) and runs k6/bottleneck-controlled.js
# progressively: 50 -> 100 -> 250 -> 500 -> 700 -> 1000 VU (read-only
# workloads), stopping early if unstable. Single-level mode:
#   powershell -File k6/run-controlled.ps1 -Workload H -Vus 500
#   powershell -File k6/run-controlled.ps1 -Workload H -Sweep
# Read-only workloads (A-E,H) target the REAL project with anon key.
# NEVER run F/G against production (rate-limited write path).
# =====================================================================
param(
  [string]$Workload = 'H',
  [int]$Vus = 0,
  [switch]$Sweep,
  [string]$Sustain = '2m'
)

$ErrorActionPreference = 'Continue'
$scriptPath = 'k6\bottleneck-controlled.js'
$resultsRel = 'load-tests\results'
New-Item -ItemType Directory -Force -Path $resultsRel | Out-Null

# ---- creds from .env (never printed) ----
$envPath = '.env'
if (-not (Test-Path $envPath)) { Write-Host 'FATAL: .env missing (run from repo root)'; exit 1 }
$envLines = Get-Content $envPath

function Get-EnvVal([string]$name) {
  foreach ($l in $envLines) {
    $t = $l.Trim()
    if ($t.Length -gt 0 -and $t[0] -ne '#' -and $t -match "^$name=(.*)$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return ''
}

$url = Get-EnvVal 'VITE_SUPABASE_URL'
if (-not $url) { $url = Get-EnvVal 'SUPABASE_URL' }
$key = Get-EnvVal 'VITE_SUPABASE_PUBLISHABLE_KEY'
if (-not $key) { $key = Get-EnvVal 'SUPABASE_ANON_KEY' }

if (-not $url -or -not $key) { Write-Host 'FATAL: missing Supabase creds in .env'; exit 1 }
if ($key -match 'YOUR_|PLACEHOLDER|xxx') { Write-Host 'FATAL: placeholder anon key in .env'; exit 1 }
if ($url -notmatch '^https://[a-z0-9]+\.supabase\.co/?$') { Write-Host 'FATAL: invalid SUPABASE_URL'; exit 1 }

function Invoke-K6([int]$vu) {
  Set-Item -Path 'env:SUPABASE_URL' -Value $url
  Set-Item -Path 'env:SUPABASE_ANON_KEY' -Value $key
  Set-Item -Path 'env:WORKLOAD' -Value $Workload
  Set-Item -Path 'env:MAX_VUS' -Value ([string]$vu)
  Set-Item -Path 'env:SUSTAIN_DURATION' -Value $Sustain
  Write-Host ("[run] " + (Get-Date -Format 'HH:mm:ss') + " WORKLOAD=$Workload VU=$vu")
  & k6 run -q $scriptPath
  return $LASTEXITCODE
}

function Run-Level([int]$vu) {
  $code = Invoke-K6 $vu
  $json = "$resultsRel\controlled-$Workload-${vu}vu.json"
  $rate = $null
  $p95 = $null
  if (Test-Path $json) {
    try {
      $j = Get-Content $json -Raw | ConvertFrom-Json
      $rate = $j.metrics.http_req_failed.values.rate
      $p95 = $j.metrics.http_req_duration.values.'p(95)'
    } catch { }
  }
  Write-Host ("[done] VU=$vu exit=$code errRate=$rate p95=$p95")
  if ($code -eq 99 -or ($null -ne $rate -and $rate -ge 0.05)) { return $false }
  return $true
}

if (-not $Sweep) {
  if ($Vus -lt 1) { Write-Host 'Specify -Vus N or -Sweep'; exit 1 }
  if (Run-Level $Vus) { exit 0 } else { exit 1 }
}

$levels = @(50, 100, 250, 500, 700, 1000)
foreach ($vu in $levels) {
  $ok = Run-Level $vu
  if (-not $ok) {
    Write-Host "STOP after $vu VU (unstable)"
    break
  }
}
Write-Host 'SWEEP COMPLETE'
