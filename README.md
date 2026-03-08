# PPYA - Investigativny OSINT nad majetkovymi priznaniami

## Problem, ktory riesime
Investigativni novinari dnes pri analyzovani majetkovych priznani prechadzaju dlhy, manualny a opakovany proces:
1. otvorenie zdrojov na NRSR,
2. hladanie konkretneho politika,
3. manualne citanie kategorii majetku, prijmov, zavazkov a funkcii,
4. porovnavanie rokov medzi sebou,
5. vytvaranie vlastnych tabuliek a ad-hoc statistik,
6. overovanie nehnutelnosti cez listy vlastnictva a mapy.

Tento proces je pomaly, narocny na chyby a tazko replikovatelny medzi redakcnymi timami.

## Co zjednodusujeme
Zjednodusujeme cely investigativny workflow od "raw dokumentov" po "analyzovatelny vystup":
1. centralizujeme data z NRSR do konzistentnej DB,
2. davame ich do prehladnej aplikacie s filtrami,
3. pridavame detail politika so signalmi podozrivosti,
4. umoznujeme pokrocile dotazy cez chatbot napojeny iba na databazu,
5. prepajame nehnutelnosti s katastrom, LV a mapou.

## Ako to riesime
Projekt poskytuje jednoduchu webovu aplikaciu s prehladnym dizajnom:
1. `index` stranka: rychle filtrovanie a porovnavanie politikov.
2. `detail` politika: majetok, spolocnosti/aktivity, prijmy, zavazky, pomerove indikatory rastu.
3. `chatbot`: prirodzeny jazyk -> databazovy query plan -> vysledky v kartach a tabulke.

V detaile politika sa zobrazuju prakticke investigativne metriky:
1. podiel platu z verejnej funkcie na celkovych prijmoch,
2. rast prijmov mimo verejnej funkcie,
3. rast poctu majetkovych poloziek,
4. kombinovany risk faktor (heuristicka indikacia pre dalsiu investigaciu).

Pri nehnutelnostiach su dostupne:
1. geolokacia na mape Slovenska,
2. odkazy na list vlastnictva (LV),
3. pripravena vrstva pre odhady hodnoty majetku (vratane LV-based enrichmentu).

## Pre koho je system
1. Investigativni novinari,
2. analytici watchdog organizacii,
3. datovi reporteri,
4. interny redakcny fact-checking.

## Hlavne funkcionality

### 1. Prehlad politikov (`/`)
1. jednotna tabulka politikov z NRSR,
2. rychle filtrovanie,
3. preklik na detailne profily.

### 2. Detail politika (`/detail.html?id=...`)
1. historicke priznania po rokoch,
2. majetkove kategorie (nehnutelnosti, hnutelne veci, majetkove prava, zavazky, dary),
3. prijmy a derived pomery,
4. risk summary a timeline,
5. nehnutelnosti na mape + LV odkazy.

### 3. Chatbot nad databazou (`/chatbot.html`)
1. odpoveda iba z databazovych dat,
2. mapuje prirodzeny jazyk na intents a query plan,
3. pouziva semanticke vyhladavanie v tabulkach,
4. vracia najlepsie zhody + komplet tabulku,
5. umoznuje export do CSV.

## Architektura systemu

### High-level komponenty
1. `client/` - staticky frontend (HTML/CSS/JS),
2. `server/` - Express API, scraping, analyza, chatbot sluzby,
3. `database/` - migracie a operacne skripty,
4. PostgreSQL - centralny zdroj pravdy.

### Datovy tok
1. Scraper ziska data z NRSR.
2. ETL vrstvy rozdelia data do normalizovanych tabuliek.
3. API servuje agregovane view modely pre UI.
4. Chatbot vykona query nad DB vrstvou a zostavi odpoved.
5. UI zobrazi tabulky, metriky, mapu, LV odkazy a exporty.

## Riadny setup (rich setup)

### Predpoklady
1. Node.js 18+ (odporucane 20+),
2. PostgreSQL 14+,
3. Windows PowerShell alebo bash,
4. optional Docker (lokalny disposable Postgres).

Poznamka pre Windows: ak je blokovany `npm.ps1`, pouzivaj `npm.cmd`.

### 1. Databaza
Mas 3 moznosti:
1. local PostgreSQL,
2. hosted PostgreSQL (napr. Supabase),
3. Docker Postgres.

Priklad local DB URL:
```text
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ppya
```

Rychla inicializacia local DB:
```powershell
powershell -ExecutionPolicy Bypass -File .\database\init-local-postgres.ps1 -DatabaseName ppya -UserName postgres -Password your_password
```

### 2. Konfiguracia servera
```powershell
cd server
copy .env.example .env
```

Skontroluj hlavne premenne:
1. `DATABASE_URL` alebo `LOCAL_DATABASE_URL`/`SUPABASE_DATABASE_URL`,
2. `DEV_MODE` (local vs supabase primary target),
3. scraper limity a period parametre,
4. optional AI estimation parametre.

### 3. Instalacia zavislosti
```powershell
cd server
npm.cmd install
```

### 4. Migracie
```powershell
npm.cmd run migrate
```

### 5. Naplnenie dat
Zakladny scraping:
```powershell
npm.cmd run scrape -- 20
```

Profilovy scraping:
```powershell
npm.cmd run scrape:profiles
```

Voting scraping:
```powershell
npm.cmd run scrape:voting
```

Social scraping:
```powershell
npm.cmd run scrape:social
```

Kataster linkovanie nehnutelnosti:
```powershell
npm.cmd run link:real-estate
```

Odhady hnutelnych veci backfill:
```powershell
npm.cmd run estimate:movable-assets
```

### 6. Spustenie aplikacie
```powershell
npm.cmd start
```

Otvori:
```text
http://localhost:4000
```

## Ako system pouzivat (novinarsky workflow)

### Workflow A: rychly screening
1. otvor `/`,
2. filtruj politikov,
3. otvor detail kandidata,
4. pozri prijmy, majetok, zavazky, risk pomery,
5. checkni nehnutelnosti cez mapu a LV.

### Workflow B: konkretna investigativna otazka
1. otvor `/chatbot.html`,
2. poloz dotaz prirodzenym jazykom,
3. prezri najlepsiu odpoved,
4. otvor tabulku vsetkych zhod,
5. exportuj CSV pre redakcny notebook alebo dalsiu analyzu.

### Workflow C: porovnanie medzi rokmi
1. v detaile prepni `declarationId`,
2. porovnaj rast prijmov a majetku,
3. identifikuj skoky,
4. nasledne over cez LV, hlasovania, funkcie a aktivity.

## API endpointy
Zaklad:
1. `GET /api/health`
2. `POST /api/migrate`
3. `POST /api/scrape`
4. `POST /api/scrape/voting`
5. `GET /api/politicians`
6. `GET /api/politicians/:id`
7. `GET /api/politicians/:id/declarations`

Voting:
1. `GET /api/voting-stats`
2. `GET /api/voting-records`
3. `GET /api/voting-transcripts`

Admin:
1. `GET /api/admin/tables`
2. `GET /api/admin/tables/:tableName`

Chatbot:
1. `POST /api/chatbot/query`

Kataster safe redirect:
1. `GET /api/kataster/open?target=...`

## Scraping - podrobny prehlad

### Co scrapujeme
1. majetkove priznania,
2. profilove metadata poslancov,
3. voting data a prepisy,
4. social media metadata (web scraping modul),
5. kataster prepojenia pre nehnutelnosti.

### Scraping pipeline
1. fetch HTML/XML zdrojov,
2. parse do `raw_payload`,
3. normalizacia na kategoriove tabulky,
4. deduplikacia cez `item_hash`,
5. enrich (profily, kataster links, estimations),
6. expose cez API.

### Kvalita dat
1. unikatne kluce na kombinaciach deklaracie a hashov,
2. fallbacky pri nekompletnych zdrojoch,
3. priebezna iteracia parserov podla zmien na strane zdroja.

## Databaza - podrobna architektura a flow

### Core entity model
1. `politicians` - master profil politika,
2. `declarations` - rocne priznania,
3. kategoriove tabulky `declaration_*` - strukturovane polozky priznani.

### Analyticke a rozsirujuce tabulky
1. `politician_voting_stats`,
2. `politician_voting_page_snapshots`,
3. `politician_voting_records`,
4. `politician_voting_transcripts`,
5. `declaration_real_estate_kataster_links`,
6. `declaration_movable_asset_estimations`,
7. `searchable_chunks` (optional vector column pri dostupnom `pgvector`).

### Flow v DB vrstve
1. write path: scraper -> repositories -> SQL upserts/inserts,
2. read path: repositories -> agregacie -> API DTO pre frontend/chatbot,
3. analyza path: risk factors, pomerove ukazovatele, enrichment.

### Bezpecnost a integrita dat
1. parameterized SQL dotazy (bez string concatenation user inputu),
2. whitelist pristupu pre admin table read endpoint,
3. safe redirect guard pre kataster URL,
4. TLS nastavenia pre cloud DB pripojenia,
5. lokalne backup/restore skripty pred migraciou dat,
6. ON DELETE CASCADE medzi deklaraciami a kategoriami pre konzistenciu.

## Operacie s datami (backup, migrate, restore)

### Presun local -> Supabase
```powershell
powershell -ExecutionPolicy Bypass -File .\database\copy-local-to-supabase.ps1 `
  -SourceDatabaseUrl "postgresql://postgres:your_local_password@localhost:5432/ppya" `
  -TargetDatabaseUrl "your_supabase_connection_string"
```

### Restore backupu
```powershell
powershell -ExecutionPolicy Bypass -File .\database\restore-backup-to-target.ps1 `
  -TargetDatabaseUrl "your_target_database_url" `
  -BackupFile ".\database\backups\local_public_data_YYYYMMDD_HHMMSS.sql"
```

## Ako to chceme rozvijat do buducnosti
1. Presnejsie valuation modely nehnutelnosti (LV + geodata + trhove benchmarky).
2. Pokrocile anomaly detection (casove rady, cross-category korelacie).
3. Audit trail pre zmeny parserov a data provenance dashboard.
4. Lepse vysvetlovanie risk score pre redakcny use-case (explainability).
5. Rich exporty: JSON schema export, reproducible report bundles.
6. Team collaboration: ulozene query, annotation a sharing medzi novinarmi.
7. Volitelna DB read-only auth vrstva pre multi-user deployment.

## Limity aktualnej verzie
1. kvalita zavisi od struktury externych zdrojov,
2. niektore enrichment kroky su heuristicke,
3. chatbot je databazovo orientovany, nie je to pravny ani financny expert,
4. risk indikator je signal pre investigaciu, nie automaticky dokaz.

## Referencie
1. NRSR verejne data a dokumenty majetkovych priznani.
2. Interny projektovy podklad: `the spot.pdf` (prilozena referencia od zadavatela).

## Strucna orientacia v repozitari
1. `client/` - web rozhranie (`index`, `detail`, `voting`, `chatbot`),
2. `server/src/scraper/` - scraping pipeline,
3. `server/src/db/` - migracie runner, repositories, DB integracia,
4. `server/src/analysis/` - risk a estimation logika,
5. `database/migrations/` - SQL schema evolucia,
6. `database/*.ps1` - operational scripts (init/copy/restore).
