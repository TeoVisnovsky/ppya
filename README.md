# PPYA - Kompletna dokumentacia projektu

PPYA je investigativna data-platforma na analyzu majetkovych priznani politikov. Projekt spaja scraping, cistenie dat, databazovu vrstvu, analytiku, chatbot nad databazou a webove rozhranie pre rychlu investigativnu pracu.

Tento dokument je napisany tak, aby sa dal priamo exportovat do PDF ako technicka dokumentacia celeho riesenia.

## 1. Co projekt riesi

Rucna analyza majetkovych priznani je pomala, nejednotna a tazko opakovatelna. Bez centralnej datovej vrstvy investigativny tim straca cas na:
1. hladanie zdrojov,
2. prepisovanie hodnot,
3. porovnavanie rokov,
4. overovanie nehnutelnosti,
5. tvorbu ad-hoc tabuliek,
6. opakovane checky bez jednotnej metodiky.

PPYA tento proces skracuje na konzistentny workflow:
1. zisk dat,
2. normalizacia dat,
3. analyticke obohatenie,
4. API pristup,
5. vizualny pristup vo web UI,
6. prirodzeny dotaz cez chatbot.

## 2. Pre koho je system urceny

Primarni pouzivatelia:
1. investigativni novinari,
2. watchdog organizacie,
3. data analytici,
4. redakcne fact-checking timy,
5. studenti a vyucujuci v oblasti transparentnosti verejnych funkcii.

## 3. Vysledok pre pouzivatela

Pouzivatel dostane:
1. prehlad politikov a ich rizikovych signalov,
2. detail priznani po rokoch,
3. mapu nehnutelnosti s LV preklikmi,
4. hlasovacie statistiky a transcript data,
5. chatbot odpovede zostavene z databazy,
6. exportovatelnu tabulku vysledkov v CSV.

## 4. Architektura na vysokej urovni

Projekt sa sklada zo styroch hlavnych vrstiev:
1. `client/` - staticky frontend v HTML, CSS, vanilla JS,
2. `server/` - Node.js + Express API, scraper, analyza,
3. `database/` - migracie, backup/restore a data-presun skripty,
4. PostgreSQL - centralny zdroj pravdy.

Data tecu cez system takto:
1. scraper nacita data zo zdrojov,
2. parser/ETL zapise normalizovane zaznamy do DB,
3. repositories vrstva pripravi agregacie pre UI,
4. API vracia modely pre stranky a chatbot,
5. frontend vykresli tabulky, karty, mapu a grafy,
6. chatbot vrati odpoved + suvisiace vysledky + komplet table output.

## 5. Struktura repozitara

Hlavne adresare:
1. `client/` - web aplikacia (`index`, `detail`, `voting`, `chatbot`, `admin`),
2. `server/src/` - API server a biznis logika,
3. `server/src/db/` - DB pripojenie, migracie runner, repositories,
4. `server/src/scraper/` - scrapers pre priznania, profily, hlasovania, social,
5. `server/src/analysis/` - odhady a analyticke moduly,
6. `database/migrations/` - SQL schema evolucia,
7. `database/*.ps1` - operacne skripty pre lokalnu DB,
8. `api/index.js` - Vercel serverless vstup,
9. `vercel.json` - Vercel routing konfiguracia,
10. `package.json` - root skripty pre spustanie bez `cd server`.

## 6. Frontend cast a funkcionalita

### 6.1 Stranka prehladu politikov (`/`)

Ucel:
1. rychly screening politikov,
2. filtrovanie podla mena, strany, roka a rizika,
3. zoradenie podla prijmov, rizika a velkosti majetku,
4. preklik na detail politika.

Typicke metriky v tabulke:
1. prijmy,
2. majetkove polozky,
3. risk faktor,
4. medzirocne zmeny.

### 6.2 Detail politika (`/detail` alebo `/detail.html?id=...`)

Ucel:
1. centralny investigativny pohlad na jedneho politika,
2. prepinanie medzi rokmi priznani,
3. sumar priznania,
4. rozpad kategorii majetku,
5. rizikove signaly a koeficienty,
6. mapa nehnutelnosti na Slovensku,
7. prekliky na LV.

Specialne obohatenia:
1. odhadovana cena pri nehnutelnostiach (ak je dostupna),
2. kataster prepojenia,
3. profile metadata poslanca.

### 6.3 Hlasovania (`/voting`)

Ucel:
1. prehlad hlasovacich statistik,
2. filtrovanie podla obdobia,
3. textove vyhladavanie,
4. prehlad transcript dat.

### 6.4 Chatbot (`/chatbot`)

Ucel:
1. dotazovanie databazy prirodzenym jazykom,
2. vysledok vo forme odpovede + karty + tabulka,
3. export CSV pre dalsiu redakcnu analyzu.

Chatbot UI funguje v troch oknach:
1. konverzacia,
2. najlepsie vysledky,
3. vysledkova tabulka.

## 7. Backend API a domenova logika

API bezi na Express a je zjednotene v `server/src/app.js`.

Hlavne endpoint skupiny:
1. `GET /api/health` - health check,
2. `POST /api/migrate` - spustenie migracii,
3. `POST /api/scrape` - scraping priznani,
4. `POST /api/scrape/voting` - scraping hlasovani,
5. `GET /api/politicians` - list politikov,
6. `GET /api/politicians/:id` - detail politika,
7. `GET /api/politicians/:id/declarations` - priznania politika,
8. `GET /api/voting-stats` - agregovane hlasovania,
9. `GET /api/voting-records` - zaznamy hlasovania,
10. `GET /api/voting-transcripts` - transcript data,
11. `GET /api/admin/tables` - DB tabulky,
12. `GET /api/admin/tables/:tableName` - data konkretnej tabulky,
13. `POST /api/chatbot/query` - chatbot dotaz,
14. `GET /api/kataster/open?target=...` - bezpecny redirect na kataster.

Routing pre frontend je tiez obsluhovany Expressom:
1. `/`,
2. `/detail`,
3. `/voting`,
4. `/chatbot`,
5. fallback na `index.html`.

## 8. Databazova vrstva

### 8.1 Core entity model

Klucove entity:
1. `politicians` - profil politika,
2. `declarations` - rocne priznania,
3. `declaration_*` tabulky - normalizovane kategorie majetku a aktivit.

### 8.2 Rozsirene analyticke tabulky

Pouzivane tabulky navyse:
1. `politician_voting_stats`,
2. `politician_voting_page_snapshots`,
3. `politician_voting_records`,
4. `politician_voting_transcripts`,
5. `declaration_real_estate_kataster_links`,
6. `declaration_movable_asset_estimations`,
7. `searchable_chunks` (ak je aktivovane semanticke vyhladavanie).

### 8.3 Integrita dat

Pouzite principy:
1. parameterizovane SQL dotazy,
2. whitelisting tabuliek pre admin endpoint,
3. deduplikacia cez hash strategie,
4. migracie pre schema evoluciu,
5. konzistentne vazby medzi declaration-level entitami.

## 9. Scraping a datovy pipeline

### 9.1 Co sa scrapuje

Zdrojove oblasti:
1. majetkove priznania,
2. profilove metadata poslancov,
3. hlasovacie data,
4. transcript data,
5. social media metadata,
6. kataster linkovanie nehnutelnosti.

### 9.2 Pipeline kroky

Standardny tok:
1. fetch zdrojov,
2. parse do struktury,
3. transform do normalizovanych modelov,
4. zapis do DB,
5. enrichment,
6. API expozicia.

### 9.3 Enrichment vrstva

Priklady enrichu:
1. kataster LV linky,
2. odhady hnutelnych veci,
3. rizikove koeficienty,
4. chatbot searchable chunks.

## 10. Chatbot: ako funguje

Chatbot je navrhnuty ako databazovy asistent, nie ako open-ended LLM s vlastnymi vedomostami.

Funkcny tok:
1. uzivatel posle prirodzeny dotaz,
2. backend identifikuje intent a relevantne datove oblasti,
3. vykona DB query alebo viac query,
4. zostavi odpoved v troch castiach,
5. vrati:
6. textovu odpoved,
7. cards summary,
8. tabulku vysledkov s moznostou exportu.

CSV export:
1. oddelovac je `;`,
2. export obsahuje BOM,
3. obsahuje `sep=;` hint pre kompatibilitu s Excel.

## 11. Spustenie lokalne bez `cd server`

Toto je aktualny odporucany sposob.

### 11.1 Predpoklady

1. Node.js 18+,
2. PostgreSQL 14+,
3. nastavene env pre DB.

### 11.2 Instalacia

```powershell
npm.cmd install
```

Poznamka:
1. root `postinstall` automaticky nainstaluje `server/` dependencies,
2. ak mas blokovany `npm.ps1`, pouzivaj `npm.cmd`.

### 11.3 Start aplikacie

```powershell
npm.cmd run start
```

Aplikacia bezi na:
1. `http://localhost:4000`

Ak je port obsadeny:
1. ukonci bezaci proces,
2. alebo nastav `PORT` v `.env`.

### 11.4 Root utility skripty

Mozes pouzit priamo z root:
1. `npm.cmd run migrate`,
2. `npm.cmd run migrate:all`,
3. `npm.cmd run scrape`,
4. `npm.cmd run scrape:profiles`,
5. `npm.cmd run scrape:voting`,
6. `npm.cmd run scrape:social`,
7. `npm.cmd run link:real-estate`,
8. `npm.cmd run estimate:movable-assets`.

## 12. Konfiguracia prostredia

### 12.1 Kde sa cita `.env`

Server config cita env v tomto poradi:
1. root `.env`,
2. fallback `server/.env`.

To znamena:
1. lokalne root spustanie funguje bez zmeny adresara,
2. Vercel vie pouzit svoje environment variables bez lokalneho `.env`.

### 12.2 Klucove premenne

Najdolezitejsie:
1. `PORT`,
2. `DEV_MODE`,
3. `DATABASE_URL`,
4. `LOCAL_DATABASE_URL`,
5. `SUPABASE_DATABASE_URL`,
6. `DATABASE_SSL`,
7. `DATABASE_SSL_REJECT_UNAUTHORIZED`,
8. scraper-related premenne,
9. AI estimation premenne.

## 13. Deploy na Vercel

Projekt je upraveny na root-based deploy.

### 13.1 Co je nakonfigurovane

Pridane subory:
1. `api/index.js` - serverless vstup exportujuci Express app,
2. `vercel.json` - rewrite vsetkych rout na app handler,
3. root `package.json` - skripty a dependency flow,
4. `server/src/app.js` - oddelena app inicializacia,
5. `server/src/index.js` - lokalny listener.

### 13.2 Deploy kroky

1. prihlasenie do Vercel CLI,
2. deploy z root adresara,
3. nastavenie environment variables vo Vercel projekte,
4. produkcny deploy.

Priklad:
```powershell
vercel
vercel --prod
```

### 13.3 Vercel environment variables

Minimalne nastav:
1. `DATABASE_URL` alebo `SUPABASE_DATABASE_URL`,
2. `DEV_MODE` podla prostredia,
3. SSL premenne podla DB providera,
4. dalsie premenne pre chatbot/scraper podla potreby.

### 13.4 Dolezite serverless limity

V serverless mode pocitaj s tymto:
1. scraping endpointy su funkcne, ale dlhe scraping jobs nemusia byt vhodne pre timeout limity,
2. preferovany je batch ingest mimo request lifecycle,
3. API pre citanie dat a chatbot je idealny use-case pre Vercel.

## 14. Databazove operacie a maintenance

### 14.1 Inicializacia lokalnej DB

```powershell
powershell -ExecutionPolicy Bypass -File .\database\init-local-postgres.ps1 -DatabaseName ppya -UserName postgres -Password your_password
```

### 14.2 Kopia local -> cloud

```powershell
powershell -ExecutionPolicy Bypass -File .\database\copy-local-to-supabase.ps1 `
  -SourceDatabaseUrl "postgresql://postgres:your_local_password@localhost:5432/ppya" `
  -TargetDatabaseUrl "your_supabase_connection_string"
```

### 14.3 Restore backupu

```powershell
powershell -ExecutionPolicy Bypass -File .\database\restore-backup-to-target.ps1 `
  -TargetDatabaseUrl "your_target_database_url" `
  -BackupFile ".\database\backups\local_public_data_YYYYMMDD_HHMMSS.sql"
```

## 15. Bezpecnostne poznamky

Implementovane ochranne body:
1. validacia vstupov,
2. parameterized SQL,
3. safe host/path guard pre kataster redirect,
4. controlled admin DB endpoint scope,
5. TLS support pre DB connections.

Odporucane doplnenia pre produkciu:
1. rate limiting,
2. autentifikacia admin endpointov,
3. centralny audit log,
4. secrets rotation politika.

## 16. Testovanie a overenie funkcnosti

Minimalny smoke checklist:
1. `GET /api/health` vracia `{ ok: true }`,
2. homepage nacita tabulku politikov,
3. detail politika sa otvori cez `id`,
4. chatbot odpovie na test dotaz,
5. CSV export sa stiahne,
6. `/voting` nacita data,
7. `/api/admin/tables` vrati zoznam tabuliek.

Odporucany release checklist:
1. migracie su aplikovane,
2. env premenne su kompletne,
3. DB spojenie ma spravne SSL,
4. frontend routy (`/`, `/detail`, `/voting`, `/chatbot`) su funkcne,
5. API endpointy vracaju ocakavane statusy.

## 17. Najcastejsie problemy a riesenia

### Problem: `npm.ps1` blokovany na Windows

Riesenie:
1. pouzi `npm.cmd` namiesto `npm`.

### Problem: `EADDRINUSE: 4000`

Riesenie:
1. na porte uz bezi iny proces,
2. proces zastav,
3. alebo zmen `PORT`.

### Problem: DB TLS chyba (`SELF_SIGNED_CERT_IN_CHAIN`)

Riesenie:
1. skontroluj SSL env premenne,
2. skontroluj DB provider nastavenia,
3. over `DATABASE_SSL_REJECT_UNAUTHORIZED`.

### Problem: prazdne vysledky v UI

Riesenie:
1. over, ze prebehli migracie,
2. over, ze DB obsahuje data,
3. spusti scraping/alebo import backupu.

## 18. Buduci rozvoj

Navrhovane smery:
1. pokrocile valuation modely pre nehnutelnosti,
2. robustnejsie anomaly detection,
3. explainability panel pre risk score,
4. query history a team collaboration,
5. role-based access pre admin cast,
6. observability dashboard pre scraping health.

## 19. Rychly priklad konca-koncoveho workflow

Scenario: novinar hlada politikov s nestandardnym profilom majetku.

Postup:
1. otvori `/` a zoradi podla risk faktora,
2. vyberie kandidata a otvori detail,
3. porovna viacero rokov priznani,
4. skontroluje nehnutelnosti a LV,
5. pouzije chatbot dotaz na podobne profily,
6. exportuje vysledky do CSV,
7. doplni vlastnu investigativnu analyzu.

## 20. Export README do PDF

Odporucany postup:
1. otvor `README.md` vo VS Code preview,
2. pouzi export/print do PDF,
3. alternativne otvor README na GitHub a pouzi browser `Print -> Save as PDF`.

Tipy pre kvalitny PDF vystup:
1. pouzi standardne A4 formatovanie,
2. nechaj default markdown styly,
3. pred exportom skontroluj code bloky a zalomenie dlhsich riadkov.

## 21. Zhrnutie

PPYA je end-to-end platforma od zberu dat az po investigativny vystup. Po poslednych upravach je projekt pripraveny na:
1. lokalne spustanie z root bez prechodu do `server/`,
2. root-based deployment na Vercel,
3. systematicku analyzu majetkovych priznani,
4. dokumentacny export do PDF pre odovzdanie alebo prezentaciu.
