import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { getPoliticianDetail, listDeclarationsByPolitician, listPoliticians } from "./db/repositories.js";
import { runScrape } from "./scraper/nrsrScraper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, "../../client");

const app = express();
app.use(express.json());
app.use(express.static(clientDir));

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.post("/api/migrate", async (_, res) => {
  try {
    await runMigrations();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
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
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/politicians", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);
    const rows = await listPoliticians(limit);
    res.json({ ok: true, rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
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
    return res.status(500).json({ ok: false, error: error.message });
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
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  if (req.path === "/detail" || req.path === "/detail.html") {
    return res.sendFile(path.join(clientDir, "detail.html"));
  }

  return res.sendFile(path.join(clientDir, "index.html"));
});

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
