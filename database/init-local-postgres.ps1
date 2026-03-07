param(
  [string]$DatabaseName = "ppya",
  [string]$UserName = "postgres",
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$Password
)

$ErrorActionPreference = "Stop"

function Get-PsqlPath {
  $installRoot = "C:\Program Files\PostgreSQL"
  if (-not (Test-Path $installRoot)) {
    throw "PostgreSQL installation was not found in '$installRoot'."
  }

  $candidate = Get-ChildItem $installRoot -Directory |
    Sort-Object { [int]$_.Name } -Descending |
    ForEach-Object { Join-Path $_.FullName "bin\psql.exe" } |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1

  if (-not $candidate) {
    throw "psql.exe was not found under '$installRoot'."
  }

  return $candidate
}

function Invoke-Psql {
  param(
    [string]$Database,
    [string]$Sql
  )

  $psqlPath = Get-PsqlPath
  $arguments = @(
    "-v", "ON_ERROR_STOP=1",
    "-U", $UserName,
    "-h", $HostName,
    "-p", "$Port",
    "-d", $Database,
    "-tAc", $Sql
  )

  if ($Password) {
    $env:PGPASSWORD = $Password
  }

  try {
    $result = & $psqlPath @arguments
    if ($LASTEXITCODE -ne 0) {
      throw "psql command failed for database '$Database'."
    }

    if ($null -eq $result) {
      return ""
    }

    return ([string]::Join("`n", $result)).Trim()
  }
  finally {
    if ($Password) {
      Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
  }
}

Write-Host "Using PostgreSQL user '$UserName' on ${HostName}:$Port" -ForegroundColor Cyan

$databaseExists = Invoke-Psql -Database "postgres" -Sql "SELECT 1 FROM pg_database WHERE datname = '$DatabaseName';"
if ($databaseExists -ne "1") {
  Write-Host "Creating database '$DatabaseName'..." -ForegroundColor Yellow
  Invoke-Psql -Database "postgres" -Sql "CREATE DATABASE $DatabaseName;" | Out-Null
} else {
  Write-Host "Database '$DatabaseName' already exists." -ForegroundColor DarkYellow
}

Write-Host "Ensuring optional pgvector extension if available..." -ForegroundColor Yellow
try {
  Invoke-Psql -Database $DatabaseName -Sql "CREATE EXTENSION IF NOT EXISTS vector;" | Out-Null
  Write-Host "pgvector is enabled." -ForegroundColor Green
}
catch {
  Write-Host "pgvector is not available in this PostgreSQL installation. Continuing without it." -ForegroundColor DarkYellow
}

Write-Host "Local PostgreSQL database is ready: $DatabaseName" -ForegroundColor Green
