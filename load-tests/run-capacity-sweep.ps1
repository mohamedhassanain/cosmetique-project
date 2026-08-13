# =====================================================================
# KISSARIYA - FULL CAPACITY SWEEP (real Supabase, read-only, anon key)
# =====================================================================
# Runs the complete isolated endpoint sweep (HOME/CATALOG/SEARCH/DETAIL at
# 100/500/600/700/800/900/1000 VU) then the global mixed workload
# (500/600/700/800/900/1000, continuing to 1500+ ONLY if 1000 is stable).
#
# Every run:
#   * hits the REAL Supabase project configured in .env
#   * uses ONLY the public anon key (never service_role)
#   * is READ-ONLY (GET/SELECT only)
#   * is monitored on the load-generator machine (CPU/RAM/sockets)
#
# NOTE: this script must be run from the repository ROOT, and uses
# SPACE-FREE RELATIVE PATHS internally (the repo path may contain spaces,
# which breaks Start-Process argument passing).
#
# Results:
#   * isolated : load-tests/results/k6-<endpoint>-<vu>vu.json
#   * global   : load-tests/results/optimized2-<vu>vu.json
#   * machine  : load-tests/results/machine-<endpoint>-<vu>.csv (+ global)
#   * progress : load-tests/results/sweep-progress.log
#
# Usage (from repo root):
#   powershell -NoProfile -File load-tests/run-capacity-sweep.ps1 -Probe   # sanity check
#   powershell -NoProfile -File load-tests/run-capacity-sweep.ps1          # full sweep
# =====================================================================
param(
  [switch]$Probe
)

$ErrorActionPreference = 'Continue'

# Space-free relative paths (repo root = current directory).
$resultsRel = 'load-tests\results'
$isolatedScript = 'load-tests\k6-isolated.js'
$globalScript = 'load-tests\supabase-optimized2-load.js'
$monitorScript = 'load-tests\monitor-k6.ps1'
$progressLog = "$resultsRel\sweep-progress.log"

New-Item -ItemType Directory -Force -Path $resultsRel | Out-Null

# ---------------- creds from .env (never printed) ----------------
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

# ---------------- logging ----------------
function Log([string]$msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Add-Content -Path $progressLog -Value $line
  Write-Host $line
}

Log "Sweep start. URL=$url Probe=$Probe"

# ---------------- helpers ----------------
# Runs k6 synchronously via the call operator (reliable $LASTEXITCODE and
# no argument-quoting pitfalls on paths containing spaces). The -e vars are
# injected as PROCESS environment variables, which k6 reads via __ENV.
function Invoke-K6([string]$scriptPath, [hashtable]$vars, [string]$label) {
  foreach ($k in $vars.Keys) {
    Set-Item -Path "env:$k" -Value ([string]$vars[$k])
  }
  & k6 run -q $scriptPath
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 1 }
  return $code
}

function Start-Monitor([string]$outFileRel) {
  $mArgs = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', $monitorScript,
    '-Seconds', '5',
    '-OutFile', $outFileRel
  )
  $m = Start-Process powershell -ArgumentList $mArgs -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 2
  return $m
}

function Stop-MonitorWait($m) {
  try { $m | Wait-Process -Timeout 120 -ErrorAction SilentlyContinue } catch { }
}

function Read-Metric([string]$jsonPath, [string]$metricName, [string]$valueKey) {
  try {
    $j = Get-Content $jsonPath -Raw | ConvertFrom-Json
    $v = $j.metrics.$metricName.values.$valueKey
    return $v
  } catch { return $null }
}

# ---------------- helper: run one k6 config with machine monitor ----------------
function Invoke-One([string]$scriptPath, [hashtable]$vars, [string]$label, [string]$monOut) {
  $mon = Start-Monitor $monOut
  $code = Invoke-K6 $scriptPath $vars $label
  Stop-MonitorWait $mon
  return $code
}

# ---------------- probe / sanity ----------------
if ($Probe) {
  Log 'PROBE: 1 VU detail (real Supabase, anon)'
  $monOut = "$resultsRel\machine-probe.csv"
  $mon = Start-Monitor $monOut
  $code = Invoke-K6 $isolatedScript @{
    SUPABASE_URL = $url; SUPABASE_ANON_KEY = $key; ENDPOINT = 'detail';
    MAX_VUS = '1'; RAMP_UP = '8s'; SUSTAIN_DURATION = '8s'; RAMP_DOWN = '8s'
  } 'probe'
  Stop-MonitorWait $mon
  Log "PROBE exit=$code"
  if ($code -ne 0) {
    Log 'PROBE FAILED - aborting (bad creds / connectivity / script error)'
    exit 1
  }
  Log 'PROBE OK - creds valid, real Supabase reachable, k6 pipeline works'
  exit 0
}

# ---------------- PHASE A: isolated endpoints ----------------
$isolatedEndpoints = @('home', 'catalog', 'search', 'detail')
$isolatedVus = @(100, 500, 600, 700, 800, 900, 1000)

foreach ($ep in $isolatedEndpoints) {
  foreach ($vu in $isolatedVus) {
    $label = "iso-$ep-$vu"
    Log "RUN $label"
    $monOut = "$resultsRel\machine-$ep-$vu.csv"
    $code = Invoke-One $isolatedScript @{
      SUPABASE_URL = $url; SUPABASE_ANON_KEY = $key; ENDPOINT = $ep;
      MAX_VUS = [string]$vu; RAMP_UP = '20s'; SUSTAIN_DURATION = '60s'; RAMP_DOWN = '20s'
    } $label $monOut

    $json = "$resultsRel\k6-$ep-${vu}vu.json"
    $p95 = Read-Metric $json 'http_req_duration' 'p(95)'
    $rate = Read-Metric $json 'http_req_failed' 'rate'
    Log "DONE $label exit=$code p95=$p95 errRate=$rate"
  }
}

# ---------------- PHASE B: global mixed workload ----------------
# Stop condition: exit 99 (threshold breach) or error rate >= 5%.
$globalVus = @(500, 600, 700, 800, 900, 1000)
$globalBeyond = @(1500, 2000, 2500, 3000)
$globalVusRun = @()

foreach ($vu in $globalVus) {
  $label = "global-$vu"
  Log "RUN $label"
  $monOut = "$resultsRel\machine-global-$vu.csv"
  $code = Invoke-One $globalScript @{
    SUPABASE_URL = $url; SUPABASE_ANON_KEY = $key; MAX_VUS = [string]$vu
  } $label $monOut

  $json = "$resultsRel\optimized2-${vu}vu.json"
  $p95 = Read-Metric $json 'http_req_duration' 'p(95)'
  $rate = Read-Metric $json 'http_req_failed' 'rate'
  Log "DONE $label exit=$code p95=$p95 errRate=$rate"
  $globalVusRun += $vu

  if ($code -eq 99 -or ($null -ne $rate -and $rate -ge 0.05)) {
    Log "STOP CONDITION at $label (exit=$code errRate=$rate). Not continuing beyond $vu."
    break
  }
}

# ---------------- PHASE B2: beyond 1000 ONLY if 1000 was stable ----------------
$lastVu = if ($globalVusRun.Count -gt 0) { $globalVusRun[-1] } else { 0 }
if ($lastVu -ge 1000) {
  $global1000Json = "$resultsRel\optimized2-1000vu.json"
  $rate1000 = Read-Metric $global1000Json 'http_req_failed' 'rate'
  $p951000 = Read-Metric $global1000Json 'http_req_duration' 'p(95)'
  $stable = ($null -ne $rate1000 -and $rate1000 -lt 0.05 -and $null -ne $p951000 -and $p951000 -lt 2000)
  Log "1000 VU stability check: errRate=$rate1000 p95=$p951000 => stable=$stable"
  if ($stable) {
    foreach ($vu in $globalBeyond) {
      $label = "global-$vu"
      Log "RUN $label (1000 was stable)"
      $monOut = "$resultsRel\machine-global-$vu.csv"
      $code = Invoke-One $globalScript @{
        SUPABASE_URL = $url; SUPABASE_ANON_KEY = $key; MAX_VUS = [string]$vu
      } $label $monOut

      $json = "$resultsRel\optimized2-${vu}vu.json"
      $p95 = Read-Metric $json 'http_req_duration' 'p(95)'
      $rate = Read-Metric $json 'http_req_failed' 'rate'
      Log "DONE $label exit=$code p95=$p95 errRate=$rate"

      if ($code -eq 99 -or ($null -ne $rate -and $rate -ge 0.05)) {
        Log "STOP CONDITION at $label. Saturation reached at $vu."
        break
      }
    }
  } else {
    Log '1000 VU NOT stable - per protocol, DO NOT continue to 1500/2000/2500/3000.'
  }
} else {
  Log 'Global sweep stopped before reaching 1000 VU - no beyond-1000 runs.'
}

Log 'SWEEP COMPLETE'
