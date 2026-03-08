import path from "node:path";
import { fileURLToPath } from "node:url";
import { backfillRealEstateKatasterLinks } from "./repositories.js";
import { closeAllPools, getScraperWriteTargets } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);

function parseLimit(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function runRealEstateKatasterBackfill({ limit } = {}) {
  const targets = getScraperWriteTargets();
  const results = [];

  for (const target of targets) {
    const summary = await backfillRealEstateKatasterLinks({ limit }, target.pool);
    results.push({ target: target.name, ...summary });
  }

  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const limit = parseLimit(process.argv[2]);

  runRealEstateKatasterBackfill({ limit })
    .then(async (results) => {
      console.log(JSON.stringify(results, null, 2));
      await closeAllPools();
    })
    .catch(async (error) => {
      console.error(error);
      await closeAllPools();
      process.exitCode = 1;
    });
}