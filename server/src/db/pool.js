import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

const poolCache = new Map();

const SSL_QUERY_PARAMS = [
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "sslpassword",
  "sslcrl",
  "uselibpqcompat",
];

function resolveSslConfig(enabled, rejectUnauthorized) {
  return enabled
    ? {
        rejectUnauthorized,
      }
    : undefined;
}

function sanitizeConnectionString(connectionString, sslEnabled) {
  if (!sslEnabled || !connectionString) {
    return connectionString;
  }

  try {
    const url = new URL(connectionString);
    for (const parameter of SSL_QUERY_PARAMS) {
      url.searchParams.delete(parameter);
    }

    return url.toString();
  } catch {
    return connectionString;
  }
}

function getPoolCacheKey(connectionString, sslEnabled, sslRejectUnauthorized) {
  return JSON.stringify({ connectionString, sslEnabled, sslRejectUnauthorized });
}

function getOrCreatePool(connectionString, sslEnabled, sslRejectUnauthorized) {
  const normalizedConnectionString = sanitizeConnectionString(connectionString, sslEnabled);
  const cacheKey = getPoolCacheKey(normalizedConnectionString, sslEnabled, sslRejectUnauthorized);
  if (!poolCache.has(cacheKey)) {
    const nextPool = new Pool({
      connectionString: normalizedConnectionString,
      ssl: resolveSslConfig(sslEnabled, sslRejectUnauthorized),
    });

    nextPool.on("error", (error) => {
      console.error("Database pool emitted an idle client error:", error.message);
    });

    poolCache.set(
      cacheKey,
      nextPool,
    );
  }

  return poolCache.get(cacheKey);
}

export const pool = getOrCreatePool(
  config.databaseUrl,
  config.databaseSsl,
  config.databaseSslRejectUnauthorized,
);

export function getScraperWriteTargets() {
  const seen = new Set();
  const targets = [];
  const candidates = [
    {
      name: "local",
      connectionString: config.localDatabaseUrl,
      sslEnabled: config.localDatabaseSsl,
      sslRejectUnauthorized: config.localDatabaseSslRejectUnauthorized,
    },
    {
      name: "supabase",
      connectionString: config.supabaseDatabaseUrl,
      sslEnabled: config.supabaseDatabaseSsl,
      sslRejectUnauthorized: config.supabaseDatabaseSslRejectUnauthorized,
    },
  ];

  for (const candidate of candidates) {
    if (!candidate.connectionString) {
      continue;
    }

    const normalizedConnectionString = sanitizeConnectionString(candidate.connectionString, candidate.sslEnabled);
    const cacheKey = getPoolCacheKey(
      normalizedConnectionString,
      candidate.sslEnabled,
      candidate.sslRejectUnauthorized,
    );
    if (seen.has(cacheKey)) {
      continue;
    }

    seen.add(cacheKey);
    targets.push({
      name: candidate.name,
      pool: getOrCreatePool(candidate.connectionString, candidate.sslEnabled, candidate.sslRejectUnauthorized),
    });
  }

  if (targets.length === 0) {
    targets.push({ name: "primary", pool });
  }

  return targets;
}

export async function closeAllPools() {
  await Promise.all(Array.from(poolCache.values(), (item) => item.end()));
}
