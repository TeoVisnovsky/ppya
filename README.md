# PPYA - Majetkove priznania scraper

Project structure:
- `client/` - frontend placeholder
- `server/` - Express API + scraper
- `database/` - SQL migrations

## 1. Start PostgreSQL

Docker is not required.

This project now works with plain local PostgreSQL. `pgvector` is optional and is enabled only if your local PostgreSQL installation supports it.

You have 3 valid options:

### Option A: Existing local PostgreSQL

If you already have PostgreSQL installed locally, create a database and point `DATABASE_URL` to it.

Example:

```text
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ppya
```

You can initialize the database automatically with the included PowerShell script:

```powershell
powershell -ExecutionPolicy Bypass -File .\database\init-local-postgres.ps1 -DatabaseName ppya -UserName postgres -Password your_password
```

Or create it manually with `psql`:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -p 5432 -d postgres -c "CREATE DATABASE ppya;"
```

If `pgvector` is installed locally, you can enable it manually too:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Option B: Hosted PostgreSQL

You can use Neon, Supabase, Railway, or another hosted PostgreSQL provider.

Set `DATABASE_URL` in `server/.env` to that connection string.

### Option C: Docker

Use Docker only if you want a disposable local PostgreSQL instance without using your existing installation.

```bash
docker compose up -d
```

If you use Docker, it starts Postgres on `localhost:5432` with:
- db: `ppya`
- user: `ppya`
- password: `ppya`

## 2. Configure server env

Copy `server/.env.example` to `server/.env` and adjust if needed.

## 3. Install server dependencies

```bash
cd server
npm install
```

## 4. Run migrations

```bash
npm run migrate
```

## 5. Scrape data

```bash
npm run scrape -- 20
```

The numeric argument is optional and sets max politician profiles to process.

To scrape voting summaries per politician and per `CisObdobia` into both local PostgreSQL and Supabase at once:

```bash
npm run scrape:voting
```

Optional positional arguments:
- first argument: max `PoslanecMasterID` to probe
- second argument: max `CisObdobia` to probe

Example:

```bash
npm run scrape:voting -- 1500 9
```

## 6. Start API server

```bash
npm start
```

Then open:

```text
http://localhost:4000
```

The Express server now also serves the frontend pages:
- `/` - searchable politicians table
- `/detail.html?id=123` - politician detail page

Server endpoints:
- `GET /api/health`
- `POST /api/migrate`
- `POST /api/scrape?limit=20`
- `POST /api/scrape/voting?maxPoliticianMasterId=1500&maxPeriod=9`
- `GET /api/politicians?limit=100`
- `GET /api/politicians/:id`
- `GET /api/politicians/:id/declarations`

## Full startup sequence without Docker

From a fresh machine or empty database, run in this order:

```powershell
powershell -ExecutionPolicy Bypass -File .\database\init-local-postgres.ps1 -DatabaseName ppya -UserName postgres -Password your_password
cd server
npm install
copy .env.example .env
npm run migrate
npm run scrape -- 20
npm start
```

Before `npm run migrate`, make sure your PostgreSQL database already exists and `DATABASE_URL` points to it.

If you are using Docker, start it first:

```bash
docker compose up -d
```

If you want to scrape the full dataset, remove the limit:

```bash
node src/scraper/nrsrScraper.js
```

## Notes

- Scraping logic currently parses the declaration table and maps data into category-specific tables.
- The main scrape now also enriches matched current MPs with candidate party and parliamentary club from NR SR deputy profile pages.
- `declaration_voting` exists in schema for your requested `hlasovanie` category and can be populated when source pages expose voting records.
- `politician_voting_stats` stores aggregate voting counts per politician and per `CisObdobia`, matched back to existing `politicians` rows by normalized name.
- The voting scraper writes to every configured target in `LOCAL_DATABASE_URL` and `SUPABASE_DATABASE_URL`, deduplicating identical connection strings.
- `searchable_chunks` gets a `vector(1536)` column only when `pgvector` is available in your PostgreSQL installation.
- Politician detail now exposes heuristic risk coefficients based on salary-to-income ratios, asset-count changes, and other-income pressure against a maintained Slovak salary baseline.

## Move Local Data To Supabase

If you already scraped data into your local PostgreSQL and want to move it to Supabase safely:

1. Keep your local database running.
2. Use the included migration script, which first creates local backups and only then imports to Supabase.

Example:

```powershell
powershell -ExecutionPolicy Bypass -File .\database\copy-local-to-supabase.ps1 `
	-SourceDatabaseUrl "postgresql://postgres:your_local_password@localhost:5432/ppya" `
	-TargetDatabaseUrl "your_supabase_connection_string"
```

What the script does:
- creates a full backup of your local database
- creates a data-only SQL backup of the `public` schema
- runs this project's migrations against the Supabase target
- imports your local data into Supabase

Backups are saved in `database/backups/`.

If Supabase rejects the connection, use the exact connection string from Supabase and include `?sslmode=require` when needed.

## Restore A Backup To Any Target

To restore one of the saved SQL backups into either local PostgreSQL or Supabase:

```powershell
powershell -ExecutionPolicy Bypass -File .\database\restore-backup-to-target.ps1 `
	-TargetDatabaseUrl "your_target_database_url" `
	-BackupFile ".\database\backups\local_public_data_YYYYMMDD_HHMMSS.sql"
```

The restore script:
- runs migrations on the target first
- truncates the `public` schema tables
- imports the backup file
- reseeds serial sequences after import
