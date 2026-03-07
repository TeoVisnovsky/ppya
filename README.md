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
- `declaration_voting` exists in schema for your requested `hlasovanie` category and can be populated when source pages expose voting records.
- `searchable_chunks` gets a `vector(1536)` column only when `pgvector` is available in your PostgreSQL installation.
