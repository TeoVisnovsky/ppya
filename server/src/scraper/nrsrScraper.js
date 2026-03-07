import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import * as cheerio from "cheerio";
import { config } from "../config.js";
import { saveDeclaration } from "../db/repositories.js";
import { closeAllPools, getScraperWriteTargets } from "../db/pool.js";
import { parseDeclarationHtml } from "./parser.js";

const __filename = fileURLToPath(import.meta.url);

const LIST_URL = "https://www.nrsr.sk/web/Default.aspx?sid=vnf/zoznam&ViewType=1";
const DETAIL_URL = "https://www.nrsr.sk/web/Default.aspx?sid=vnf/oznamenie&UserId=";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toAbsoluteUrl(href) {
  return new URL(href, "https://www.nrsr.sk").toString();
}

async function fetchList() {
  const response = await axios.get(LIST_URL, { timeout: 30000 });
  const $ = cheerio.load(response.data);

  const map = new Map();

  $("a[href*='sid=vnf/oznamenie&UserId=']").each((_, anchor) => {
    const href = $(anchor).attr("href");
    if (!href) {
      return;
    }

    const absoluteUrl = toAbsoluteUrl(href);
    const url = new URL(absoluteUrl);
    const userId = url.searchParams.get("UserId");
    const label = $(anchor).text().trim();

    if (!userId) {
      return;
    }

    if (!map.has(userId)) {
      map.set(userId, { userId, name: label, url: absoluteUrl });
    }
  });

  return Array.from(map.values());
}

async function fetchDeclarationForPolitician({ userId, name }) {
  const url = `${DETAIL_URL}${encodeURIComponent(userId)}`;
  const response = await axios.get(url, { timeout: 30000 });

  return parseDeclarationHtml({
    html: response.data,
    sourceUrl: url,
    userId,
    fallbackName: name,
  });
}

export async function runScrape({ limit } = {}) {
  const politicians = await fetchList();
  const selected = typeof limit === "number" ? politicians.slice(0, limit) : politicians;
  const targets = getScraperWriteTargets();

  let saved = 0;
  const errors = [];
  const byTarget = Object.fromEntries(targets.map((target) => [target.name, { saved: 0, errors: 0 }]));

  for (const politician of selected) {
    try {
      const declaration = await fetchDeclarationForPolitician(politician);
      let savedAnywhere = false;

      for (const target of targets) {
        try {
          await saveDeclaration(declaration, target.pool);
          savedAnywhere = true;
          saved += 1;
          byTarget[target.name].saved += 1;
        } catch (error) {
          byTarget[target.name].errors += 1;
          errors.push({
            userId: politician.userId,
            target: target.name,
            message: error.message,
          });
        }
      }

      if (!savedAnywhere && targets.length === 0) {
        errors.push({
          userId: politician.userId,
          message: "No configured database targets available",
        });
      }
    } catch (error) {
      errors.push({
        userId: politician.userId,
        message: error.message,
      });
    }

    if (config.scraperDelayMs > 0) {
      await sleep(config.scraperDelayMs);
    }
  }

  return {
    targets: targets.map((target) => target.name),
    totalDiscovered: politicians.length,
    attempted: selected.length,
    saved,
    byTarget,
    errors,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const limitArg = Number(process.argv[2]);
  const limit = Number.isFinite(limitArg) ? limitArg : undefined;

  runScrape({ limit })
    .then(async (result) => {
      console.log(JSON.stringify(result, null, 2));
      await closeAllPools();
    })
    .catch(async (error) => {
      console.error(error);
      await closeAllPools();
      process.exitCode = 1;
    });
}
