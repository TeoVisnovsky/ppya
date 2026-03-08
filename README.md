# PPYA - Investigatívny OSINT nad majetkovými priznaniami

## Problém, ktorý riešime
Investigatívni novinári dnes pri analyzovaní majetkových priznaní prechádzajú dlhý, manuálny a opakovaný proces:
1. otvorenie zdrojov na NRSR,
2. hľadanie konkrétneho politika,
3. manuálne čítanie kategórií majetku, príjmov, záväzkov a funkcií,
4. porovnávanie rokov medzi sebou,
5. vytváranie vlastných tabuliek a ad-hoc štatistík,
6. overovanie nehnuteľností cez listy vlastníctva a mapy.

Tento proces je pomalý, náchylný na chyby a ťažko replikovateľný medzi redakčnými tímami.

## Čo zjednodušujeme
Zjednodušujeme celý investigatívny workflow od "raw dokumentov" po "analyzovateľný výstup":
1. centralizujeme dáta z NRSR do konzistentnej DB,
2. dávame ich do prehľadnej aplikácie s filtrami,
3. pridávame detail politika so signálmi podozrivosti,
4. umožňujeme pokročilé dotazy cez chatbot napojený iba na databázu,
5. prepájame nehnuteľnosti s katastrom, LV a mapou.

## Ako to riešime
Projekt poskytuje jednoduchú webovú aplikáciu s prehľadným dizajnom:
1. `index` stránka: rýchle filtrovanie a porovnávanie politikov.
2. `detail` politika: majetok, spoločnosti/aktivity, príjmy, záväzky, pomerové indikátory rastu.
3. `chatbot`: prirodzený jazyk -> databázový query plan -> výsledky v kartách a tabuľke.

V detaile politika sa zobrazujú praktické investigatívne metriky:
1. podiel platu z verejnej funkcie na celkových príjmoch,
2. rast príjmov mimo verejnej funkcie,
3. rast počtu majetkových položiek,
4. kombinovaný risk faktor (heuristická indikácia pre ďalšiu investigáciu).

Pri nehnuteľnostiach sú dostupné:
1. geolokácia na mape Slovenska,
2. odkazy na list vlastníctva (LV),
3. pripravená vrstva pre odhady hodnoty majetku (vrátane LV-based enrichmentu).

## Pre koho je systém
1. investigatívni novinári,
2. analytici watchdog organizácií,
3. dátoví reportéri,
4. interný redakčný fact-checking.

## Hlavné funkcionality

### 1. Prehľad politikov (`/`)
1. jednotná tabuľka politikov z NRSR,
2. rýchle filtrovanie,
3. preklik na detailné profily.

### 2. Detail politika (`/detail.html?id=...`)
1. historické priznania po rokoch,
2. majetkové kategórie (nehnuteľnosti, hnuteľné veci, majetkové práva, záväzky, dary),
3. príjmy a derived pomery,
4. risk summary a timeline,
5. nehnuteľnosti na mape + LV odkazy.

### 3. Chatbot nad databázou (`/chatbot.html`)
1. odpovedá iba z databázových dát,
2. mapuje prirodzený jazyk na intents a query plan,
3. používa sémantické vyhľadávanie v tabuľkách,
4. vracia najlepšie zhody + kompletnú tabuľku,
5. umožňuje export do CSV.

## Architektúra systému

### High-level komponenty
1. `client/` - statický frontend (HTML/CSS/JS),
2. `server/` - Express API, scraping, analýza, chatbot služby,
3. `database/` - migrácie a operačné skripty,
4. PostgreSQL - centrálny zdroj pravdy.

### Dátový tok
1. Scraper získa dáta z NRSR.
2. ETL vrstvy rozdelia dáta do normalizovaných tabuliek.
3. API servuje agregované view modely pre UI.
4. Chatbot vykoná query nad DB vrstvou a zostaví odpoveď.
5. UI zobrazí tabuľky, metriky, mapu, LV odkazy a exporty.

## Riadny setup (rich setup)

### Predpoklady
1. Node.js 18+ (odporúčané 20+),
2. PostgreSQL 14+,
3. Windows PowerShell alebo bash,
4. optional Docker (lokálny disposable Postgres).

Poznámka pre Windows: ak je blokovaný `npm.ps1`, používaj `npm.cmd`.

### 1. Databáza
Máš 3 možnosti:
1. local PostgreSQL,
2. hosted PostgreSQL (napr. Supabase),
3. Docker Postgres.

Príklad local DB URL:
```text
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ppya
```

Rýchla inicializácia local DB:
```powershell
powershell -ExecutionPolicy Bypass -File .\database\init-local-postgres.ps1 -DatabaseName ppya -UserName postgres -Password your_password
```

### 2. Konfigurácia servera
```powershell
cd server
copy .env.example .env
```

Skontroluj hlavné premenné:
1. `DATABASE_URL` alebo `LOCAL_DATABASE_URL`/`SUPABASE_DATABASE_URL`,
2. `DEV_MODE` (local vs supabase primary target),
3. scraper limity a period parametre,
4. optional AI estimation parametre.

### 3. Inštalácia závislostí
```powershell
cd server
npm.cmd install
```

### 4. Migrácie
```powershell
npm.cmd run migrate
```

### 5. Naplnenie dát
Základný scraping:
```powershell
npm.cmd run scrape -- 20
```

Profilový scraping:
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

Kataster linkovanie nehnuteľností:
```powershell
npm.cmd run link:real-estate
```

Odhady hnuteľných vecí backfill:
```powershell
npm.cmd run estimate:movable-assets
```

### 6. Spustenie aplikácie
```powershell
npm.cmd start
```

Otvorí:
```text
http://localhost:4000
```

## Ako systém používať (novinársky workflow)

### Workflow A: rýchly screening
1. otvor `/`,
2. filtruj politikov,
3. otvor detail kandidáta,
4. pozri príjmy, majetok, záväzky, risk pomery,
5. checkni nehnuteľnosti cez mapu a LV.

### Workflow B: konkrétna investigatívna otázka
1. otvor `/chatbot.html`,
2. polož dotaz prirodzeným jazykom,
3. prezri najlepšiu odpoveď,
4. otvor tabuľku všetkých zhôd,
5. exportuj CSV pre redakčný notebook alebo ďalšiu analýzu.

### Workflow C: porovnanie medzi rokmi
1. v detaile prepni `declarationId`,
2. porovnaj rast príjmov a majetku,
3. identifikuj skoky,
4. následne over cez LV, hlasovania, funkcie a aktivity.

## API endpointy
Základ:
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

## Scraping - podrobný prehľad

### Čo scrapujeme
1. majetkové priznania,
2. profilové metadata poslancov,
3. voting dáta a prepisy,
4. social media metadata (web scraping modul),
5. kataster prepojenia pre nehnuteľnosti.

### Scraping pipeline
1. fetch HTML/XML zdrojov,
2. parse do `raw_payload`,
3. normalizácia na kategóriové tabuľky,
4. deduplikácia cez `item_hash`,
5. enrich (profily, kataster links, estimations),
6. expose cez API.

### Kvalita dát
1. unikátne kľúče na kombináciách deklarácie a hashov,
2. fallbacky pri nekompletných zdrojoch,
3. priebežná iterácia parserov podľa zmien na strane zdroja.

## Databáza - podrobná architektúra a flow

### Core entity model
1. `politicians` - master profil politika,
2. `declarations` - ročné priznania,
3. kategóriové tabuľky `declaration_*` - štruktúrované položky priznaní.

### Analytické a rozširujúce tabuľky
1. `politician_voting_stats`,
2. `politician_voting_page_snapshots`,
3. `politician_voting_records`,
4. `politician_voting_transcripts`,
5. `declaration_real_estate_kataster_links`,
6. `declaration_movable_asset_estimations`,
7. `searchable_chunks` (optional vector column pri dostupnom `pgvector`).

### Flow v DB vrstve
1. write path: scraper -> repositories -> SQL upserts/inserts,
2. read path: repositories -> agregácie -> API DTO pre frontend/chatbot,
3. analýza path: risk factors, pomerové ukazovatele, enrichment.

### Bezpečnosť a integrita dát
1. parameterized SQL dotazy (bez string concatenation user inputu),
2. whitelist prístupu pre admin table read endpoint,
3. safe redirect guard pre kataster URL,
4. TLS nastavenia pre cloud DB pripojenia,
5. lokálne backup/restore skripty pred migráciou dát,
6. ON DELETE CASCADE medzi deklaráciami a kategóriami pre konzistenciu.

## Operácie s dátami (backup, migrate, restore)

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

## Ako to chceme rozvíjať do budúcnosti
1. Presnejšie valuation modely nehnuteľností (LV + geodata + trhové benchmarky).
2. Pokročilé anomaly detection (časové rady, cross-category korelácie).
3. Audit trail pre zmeny parserov a data provenance dashboard.
4. Lepšie vysvetľovanie risk score pre redakčný use-case (explainability).
5. Rich exporty: JSON schema export, reproducible report bundles.
6. Team collaboration: uložené query, annotation a sharing medzi novinármi.
7. Voliteľná DB read-only auth vrstva pre multi-user deployment.

## Limity aktuálnej verzie
1. kvalita závisí od štruktúry externých zdrojov,
2. niektoré enrichment kroky sú heuristické,
3. chatbot je databázovo orientovaný, nie je to právny ani finančný expert,
4. risk indikátor je signál pre investigáciu, nie automatický dôkaz.

## Referencie
1. NRSR verejné dáta a dokumenty majetkových priznaní.
2. Interný projektový podklad: `the spot.pdf` (priložená referencia od zadávateľa).

## Stručná orientácia v repozitári
1. `client/` - web rozhranie (`index`, `detail`, `voting`, `chatbot`),
2. `server/src/scraper/` - scraping pipeline,
3. `server/src/db/` - migrácie runner, repositories, DB integrácia,
4. `server/src/analysis/` - risk a estimation logika,
5. `database/migrations/` - SQL schema evolúcia,
6. `database/*.ps1` - operational scripts (init/copy/restore).
