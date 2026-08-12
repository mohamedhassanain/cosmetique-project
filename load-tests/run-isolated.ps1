param(
  [Parameter(Mandatory=$true)][string]$Script,
  [int]$VUs = 100
)
$envFile = Join-Path $PSScriptRoot '..\.env'
$url = ''
$key = ''
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^VITE_SUPABASE_URL=(.*)$') { $url = $Matches[1].Trim() }
  if ($_ -match '^VITE_SUPABASE_PUBLISHABLE_KEY=(.*)$') { $key = $Matches[1].Trim() }
}
if (-not $key) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^SUPABASE_ANON_KEY=(.*)$') { $key = $Matches[1].Trim() }
  }
}
if (-not $url -or -not $key) { Write-Error 'Missing Supabase creds in .env'; exit 1 }
$scriptPath = Join-Path $PSScriptRoot $Script
Write-Host "Running $Script at $VUs VUs against real Supabase..."
& k6 run $scriptPath -e "SUPABASE_URL=$url" -e "SUPABASE_ANON_KEY=$key" -e "MAX_VUS=$VUs"
exit $LASTEXITCODE
