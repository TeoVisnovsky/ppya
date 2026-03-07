import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeAllPools, getScraperWriteTargets } from "./pool.js";
import { runMigrationsForPool } from "./migrate.js";

const __filename = fileURLToPath(import.meta.url);

export async function runMigrationsOnAllTargets() {
  const targets = getScraperWriteTargets();

  for (const target of targets) {
    await runMigrationsForPool(target.pool);
    console.log(`Migrations finished for target: ${target.name}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runMigrationsOnAllTargets()
    .then(async () => {
      await closeAllPools();
    })
    .catch(async (error) => {
      console.error("Migration failed:", error);
      await closeAllPools();
      process.exitCode = 1;
    });
}