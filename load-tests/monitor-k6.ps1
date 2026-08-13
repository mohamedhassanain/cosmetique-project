# =====================================================================
# KISSARIYA - LOAD-GENERATOR MONITOR
# =====================================================================
# Samples the k6 process (and overall machine) CPU/RAM/sockets every N
# seconds and appends one line per sample to a CSV. Used to determine
# whether the PC running k6 is itself the bottleneck (client saturation)
# rather than the Supabase project.
#
# Usage (PowerShell, from the repository root):
#   powershell -NoProfile -File load-tests/monitor-k6.ps1 -Seconds 5 `
#     -OutFile load-tests/results/machine-monitor-100vu.csv
#
# The script can be started BEFORE the k6 run. It self-stops after
# -MaxSamples or when a running k6 process is no longer found.
# =====================================================================
param(
  [int]$Seconds = 5,
  [string]$OutFile = 'load-tests/results/machine-monitor.csv',
  [int]$MaxSamples = 600
)

$ErrorActionPreference = 'Stop'

$out = Join-Path (Get-Location) $OutFile
$dir = Split-Path -Parent $out
if ($dir -and -not (Test-Path $dir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

"timestamp,k6_cpu_pct,k6_mem_mb,total_cpu_pct,mem_free_mb,mem_used_pct,tcp_connections,note" |
  Set-Content -Path $out -Encoding UTF8

Write-Host "Monitoring -> $out (every ${Seconds}s, up to ${MaxSamples} samples)."

$sample = 0
while ($sample -lt $MaxSamples) {
  $sample++
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $note = ''

  $k6 = Get-Process -Name 'k6' -ErrorAction SilentlyContinue
  $k6Proc = $k6 | Select-Object -First 1
  if ($k6Proc) {
    $cpuPct = -1
    try {
      $cpuPct = [math]::Round((Get-Counter "\Process(k6*)\% Processor Time" -ErrorAction Stop).CounterSamples[0].CookedValue, 1)
    } catch {
      # fall through: -1 means unavailable
    }
    try {
      $mem = [math]::Round($k6Proc.WorkingSet64 / 1MB, 1)
    } catch {
      $mem = -1
    }
  } else {
    $cpuPct = -1
    $mem = -1
    $note = 'k6 not running'
  }

  $totalCpu = -1
  try {
    $totalCpu = [math]::Round((Get-Counter "\Processor(_Total)\% Processor Time" -ErrorAction Stop).CounterSamples[0].CookedValue, 1)
  } catch {
    # -1 means unavailable
  }

  $memFree = -1
  $memUsedPct = -1
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    $memFree = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    $memUsedPct = [math]::Round(100 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize * 100), 1)
  } catch {
    # -1 means unavailable
  }

  $tcp = -1
  try {
    $tcp = (Get-NetTCPConnection -State Established -ErrorAction Stop | Measure-Object).Count
  } catch {
    # -1 means unavailable
  }

  $line = "{0},{1},{2},{3},{4},{5},{6},{7}" -f $ts, $cpuPct, $mem, $totalCpu, $memFree, $memUsedPct, $tcp, $note
  Add-Content -Path $out -Value $line -Encoding UTF8

  if (-not $k6Proc -and $sample -gt 1) {
    Write-Host "$ts - k6 process ended, stopping monitor."
    break
  }
  Start-Sleep -Seconds $Seconds
}

Write-Host "Monitor finished. $sample samples written to $out"
