param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDatabaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$TargetDatabaseUrl,

  [string]$WorkspaceRoot = "C:\Users\mhrom\Desktop\ppya"
)

$ErrorActionPreference = "Stop"

function Get-PgToolPath {
  param([string]$ToolName)

  $installRoot = "C:\Program Files\PostgreSQL"
  if (-not (Test-Path $installRoot)) {
    throw "PostgreSQL installation was not found in '$installRoot'."
  }

  $candidate = Get-ChildItem $installRoot -Directory |
    Sort-Object { [int]$_.Name } -Descending |
    ForEach-Object { Join-Path $_.FullName "bin\$ToolName" } |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1

  if (-not $candidate) {
    throw "$ToolName was not found under '$installRoot'."
  }

  return $candidate
}

function Invoke-External {
  param(
    [string]$Executable,
    [string[]]$Arguments,
    [hashtable]$Environment = @{}
  )

  $previousValues = @{}
  foreach ($key in $Environment.Keys) {
    $previousValues[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
    [Environment]::SetEnvironmentVariable($key, $Environment[$key], "Process")
  }

  try {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $Executable $($Arguments -join ' ')"
    }
  }
  finally {
    foreach ($key in $Environment.Keys) {
      [Environment]::SetEnvironmentVariable($key, $previousValues[$key], "Process")
    }
  }
}

$pgDumpPath = Get-PgToolPath -ToolName "pg_dump.exe"
$psqlPath = Get-PgToolPath -ToolName "psql.exe"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $WorkspaceRoot "database\backups"
$fullBackupPath = Join-Path $backupDir "local_full_$timestamp.dump"
$dataBackupPath = Join-Path $backupDir "local_public_data_$timestamp.sql"
$serverDir = Join-Path $WorkspaceRoot "server"

Write-Host "Creating full local backup: $fullBackupPath" -ForegroundColor Cyan
Invoke-External -Executable $pgDumpPath -Arguments @(
  "--dbname=$SourceDatabaseUrl",
  "--format=custom",
  "--file=$fullBackupPath"
)

Write-Host "Creating public-schema data backup: $dataBackupPath" -ForegroundColor Cyan
Invoke-External -Executable $pgDumpPath -Arguments @(
  "--dbname=$SourceDatabaseUrl",
  "--data-only",
  "--inserts",
  "--column-inserts",
  "--schema=public",
  "--file=$dataBackupPath"
)

Write-Host "Running migrations against Supabase target..." -ForegroundColor Cyan
Push-Location $serverDir
try {
  $env:DATABASE_URL_OVERRIDE = $TargetDatabaseUrl
  $env:DATABASE_SSL = "true"
  $env:DATABASE_SSL_REJECT_UNAUTHORIZED = "false"
  node src/db/migrate.js
  if ($LASTEXITCODE -ne 0) {
    throw "Migration command failed."
  }
}
finally {
  Remove-Item Env:DATABASE_URL_OVERRIDE -ErrorAction SilentlyContinue
  Remove-Item Env:DATABASE_SSL -ErrorAction SilentlyContinue
  Remove-Item Env:DATABASE_SSL_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue
  Pop-Location
}

Write-Host "Importing data into Supabase..." -ForegroundColor Cyan
Invoke-External -Executable $psqlPath -Arguments @(
  "--dbname=$TargetDatabaseUrl",
  "-v", "ON_ERROR_STOP=1",
  "-f", $dataBackupPath
)

Write-Host "Done. Local data backup kept at:" -ForegroundColor Green
Write-Host "  $fullBackupPath" -ForegroundColor Green
Write-Host "  $dataBackupPath" -ForegroundColor Green
