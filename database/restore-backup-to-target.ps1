param(
  [Parameter(Mandatory = $true)]
  [string]$TargetDatabaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$BackupFile,

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

function Invoke-PsqlSql {
  param(
    [string]$PsqlPath,
    [string]$DatabaseUrl,
    [string]$SqlText
  )

  $tempFile = [System.IO.Path]::GetTempFileName()
  try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempFile, $SqlText, $utf8NoBom)
    Invoke-External -Executable $PsqlPath -Arguments @(
      "--dbname=$DatabaseUrl",
      "-v", "ON_ERROR_STOP=1",
      "-c", "SET search_path TO public;",
      "-f", $tempFile
    )
  }
  finally {
    Remove-Item $tempFile -ErrorAction SilentlyContinue
  }
}

function Get-DbSslEnvironment {
  param([string]$DatabaseUrl)

  if ($DatabaseUrl -match "localhost" -or $DatabaseUrl -match "127\.0\.0\.1") {
    return @{}
  }

  return @{
    DATABASE_SSL = "true"
    DATABASE_SSL_REJECT_UNAUTHORIZED = "false"
  }
}

$psqlPath = Get-PgToolPath -ToolName "psql.exe"
$migrationsDir = Join-Path $WorkspaceRoot "database\migrations"

if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

if (-not (Test-Path $migrationsDir)) {
  throw "Migrations directory not found: $migrationsDir"
}

Write-Host "Running migrations on target..." -ForegroundColor Cyan
Get-ChildItem $migrationsDir -File |
  Sort-Object Name |
  ForEach-Object {
    Invoke-External -Executable $psqlPath -Arguments @(
      "--dbname=$TargetDatabaseUrl",
      "-v", "ON_ERROR_STOP=1",
      "-c", "SET search_path TO public;",
      "-f", $_.FullName
    )
    Write-Host "Applied migration: $($_.Name)" -ForegroundColor DarkGray
  }

Write-Host "Migrations finished." -ForegroundColor DarkGray

if ($LASTEXITCODE -ne 0) {
  throw "Migration command failed."
}

$truncateSql = @'
DO $$
DECLARE
  truncate_sql text;
BEGIN
  SELECT string_agg(format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', schemaname, tablename), '; ')
  INTO truncate_sql
  FROM pg_tables
  WHERE schemaname = 'public';

  IF truncate_sql IS NOT NULL THEN
    EXECUTE truncate_sql;
  END IF;
END
$$;
'@

Write-Host "Truncating public tables on target..." -ForegroundColor Cyan
Invoke-PsqlSql -PsqlPath $psqlPath -DatabaseUrl $TargetDatabaseUrl -SqlText $truncateSql

Write-Host "Importing backup into target..." -ForegroundColor Cyan
Invoke-External -Executable $psqlPath -Arguments @(
  "--dbname=$TargetDatabaseUrl",
  "-v", "ON_ERROR_STOP=1",
  "-c", "SET search_path TO public;",
  "-f", $BackupFile
)

$sequenceSql = @'
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT
      pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq_name,
      format('%I.%I', n.nspname, c.relname) AS table_name,
      a.attname AS column_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) IS NOT NULL
  LOOP
    EXECUTE format(
      'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %s), 1), true)',
      rec.seq_name,
      rec.column_name,
      rec.table_name
    );
  END LOOP;
END
$$;
'@

Write-Host "Reseeding sequences on target..." -ForegroundColor Cyan
Invoke-PsqlSql -PsqlPath $psqlPath -DatabaseUrl $TargetDatabaseUrl -SqlText $sequenceSql

Write-Host "Restore finished for target." -ForegroundColor Green
