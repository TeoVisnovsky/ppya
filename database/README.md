# Database

Migrations live in `database/migrations`.

Current schema:
- PostgreSQL, with optional `pgvector`
- Core tables: `politicians`, `declarations`
- `declaration_income` stores raw income text plus separated public-function, other, and total income amounts
- One category table per declaration section (real estate, movable assets, liabilities, etc.)
- Optional vector storage in `searchable_chunks`

Local Windows helper:
- Run `database/init-local-postgres.ps1` to create the `ppya` database using your installed PostgreSQL.
