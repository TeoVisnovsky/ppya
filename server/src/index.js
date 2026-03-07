import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import {
  getPoliticianDetail,
  getTableData,
  listDatabaseTables,
  listDeclarationsByPolitician,
  listPoliticians,
} from "./db/repositories.js";
import { runScrape } from "./scraper/nrsrScraper.js";
import { runVotingScrape } from "./scraper/nrsrVotingScraper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, "../../client");

const app = express();
app.use(express.json());
app.use(express.static(clientDir));

function getErrorMessage(error) {
  if (error?.code === "SELF_SIGNED_CERT_IN_CHAIN") {
    return "Database TLS verification failed while connecting to Supabase.";
  }

  return error?.message || "Unexpected server error";
}

function getErrorStatus(error) {
  if (error?.code === "SELF_SIGNED_CERT_IN_CHAIN") {
    return 502;
  }

  return 500;
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.post("/api/migrate", async (_, res) => {
  try {
    await runMigrations();
    res.json({ ok: true });
  } catch (error) {
    res.status(getErrorStatus(error)).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.post("/api/scrape", async (req, res) => {
  try {
    const queryLimit = req.query.limit;
    const bodyLimit = req.body?.limit;
    const rawLimit = queryLimit ?? bodyLimit;
    const parsedLimit = rawLimit ? Number(rawLimit) : undefined;

    const result = await runScrape({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });

    res.json({ ok: true, result });
  } catch (error) {
    res.status(getErrorStatus(error)).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.post("/api/scrape/voting", async (req, res) => {
  try {
    const queryMaxPoliticianMasterId = req.query.maxPoliticianMasterId;
    const bodyMaxPoliticianMasterId = req.body?.maxPoliticianMasterId;
    const queryMaxPeriod = req.query.maxPeriod;
    const bodyMaxPeriod = req.body?.maxPeriod;

    const maxPoliticianMasterId = Number(queryMaxPoliticianMasterId ?? bodyMaxPoliticianMasterId);
    const maxPeriod = Number(queryMaxPeriod ?? bodyMaxPeriod);

    const result = await runVotingScrape({
      maxPoliticianMasterId: Number.isFinite(maxPoliticianMasterId) ? maxPoliticianMasterId : undefined,
      maxPeriod: Number.isFinite(maxPeriod) ? maxPeriod : undefined,
    });

    res.json({ ok: true, result });
  } catch (error) {
    res.status(getErrorStatus(error)).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/politicians", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);
    const rows = await listPoliticians(limit);
    res.json({ ok: true, rows });
  } catch (error) {
    res.status(getErrorStatus(error)).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/politicians/:id/declarations", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid politician id" });
    }

    const rows = await listDeclarationsByPolitician(id);
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(getErrorStatus(error)).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/politicians/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const declarationId = req.query.declarationId ? Number(req.query.declarationId) : null;

    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid politician id" });
    }

    if (req.query.declarationId && !Number.isFinite(declarationId)) {
      return res.status(400).json({ ok: false, error: "Invalid declaration id" });
    }

    const detail = await getPoliticianDetail(id, declarationId);
    if (!detail) {
      return res.status(404).json({ ok: false, error: "Politician not found" });
    }

    return res.json({ ok: true, detail });
  } catch (error) {
    return res.status(getErrorStatus(error)).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/admin/tables", async (_, res) => {
  try {
    const rows = await listDatabaseTables();
    return res.json({ ok: true, rows });
  } catch (error) {
    return res.status(getErrorStatus(error)).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/admin/tables/:tableName", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);
    const offset = Number(req.query.offset || 0);
    const result = await getTableData(req.params.tableName, limit, offset);
    return res.json({ ok: true, result });
  } catch (error) {
    const status = error.message === "Unknown table" || error.message === "Invalid table name"
      ? 400
      : getErrorStatus(error);
    return res.status(status).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  if (req.path === "/detail" || req.path === "/detail.html") {
    return res.sendFile(path.join(clientDir, "detail.html"));
  }

  if (req.path === "/admin" || req.path === "/admin.html") {
    return res.sendFile(path.join(clientDir, "admin.html"));
  }

  return res.sendFile(path.join(clientDir, "index.html"));
});

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
