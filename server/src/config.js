import dotenv from "dotenv";

dotenv.config();

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value == null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function isDevMode() {
  return parseBoolean(process.env.DEV_MODE, false);
}

function resolveLocalDatabaseConfig() {
  return {
    databaseUrl: process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL || "postgresql://ppya:ppya@localhost:5432/ppya",
    databaseSsl: parseBoolean(process.env.LOCAL_DATABASE_SSL, false),
    databaseSslRejectUnauthorized: parseBoolean(process.env.LOCAL_DATABASE_SSL_REJECT_UNAUTHORIZED, true),
  };
}

function resolveSupabaseDatabaseConfig(localDatabaseConfig) {
  return {
    databaseUrl: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || localDatabaseConfig.databaseUrl,
    databaseSsl: parseBoolean(process.env.SUPABASE_DATABASE_SSL, true),
    databaseSslRejectUnauthorized: parseBoolean(process.env.SUPABASE_DATABASE_SSL_REJECT_UNAUTHORIZED, false),
  };
}

function resolvePrimaryDatabaseConfig(localDatabaseConfig, supabaseDatabaseConfig) {
  const devMode = isDevMode();

  if (process.env.DATABASE_URL_OVERRIDE) {
    return {
      devMode,
      databaseUrl: process.env.DATABASE_URL_OVERRIDE,
      databaseSsl: parseBoolean(process.env.DATABASE_SSL, false),
      databaseSslRejectUnauthorized: parseBoolean(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED, true),
    };
  }

  if (devMode) {
    return {
      devMode,
      ...localDatabaseConfig,
    };
  }

  return {
    devMode,
    ...supabaseDatabaseConfig,
  };
}

const localDatabaseConfig = resolveLocalDatabaseConfig();
const supabaseDatabaseConfig = resolveSupabaseDatabaseConfig(localDatabaseConfig);
const databaseConfig = resolvePrimaryDatabaseConfig(localDatabaseConfig, supabaseDatabaseConfig);

export const config = {
  port: Number(process.env.PORT || 4000),
  devMode: databaseConfig.devMode,
  databaseUrl: databaseConfig.databaseUrl,
  scraperDelayMs: Number(process.env.SCRAPER_DELAY_MS || 200),
  databaseSsl: databaseConfig.databaseSsl,
  databaseSslRejectUnauthorized: databaseConfig.databaseSslRejectUnauthorized,
  localDatabaseUrl: localDatabaseConfig.databaseUrl,
  localDatabaseSsl: localDatabaseConfig.databaseSsl,
  localDatabaseSslRejectUnauthorized: localDatabaseConfig.databaseSslRejectUnauthorized,
  supabaseDatabaseUrl: supabaseDatabaseConfig.databaseUrl,
  supabaseDatabaseSsl: supabaseDatabaseConfig.databaseSsl,
  supabaseDatabaseSslRejectUnauthorized: supabaseDatabaseConfig.databaseSslRejectUnauthorized,
  votingScraperCisObdobia: parseNumber(process.env.VOTING_SCRAPER_CIS_OBDOBIA, 2),
  votingScraperCisSchodze: parseNumber(process.env.VOTING_SCRAPER_CIS_SCHODZE, 0),
  votingScraperRepeatThreshold: parseNumber(process.env.VOTING_SCRAPER_REPEAT_THRESHOLD, 300),
  votingScraperMaxPeriod: parseNumber(process.env.VOTING_SCRAPER_MAX_PERIOD, 9),
  votingScraperMaxPoliticianMasterId: parseNumber(process.env.VOTING_SCRAPER_MAX_POLITICIAN_MASTER_ID, 5000),
  votingScraperConsecutiveMissThreshold: parseNumber(process.env.VOTING_SCRAPER_CONSECUTIVE_MISS_THRESHOLD, 200),
  profileScraperStartPoslanecId: parseNumber(process.env.PROFILE_SCRAPER_START_POSLANEC_ID, 1),
  profileScraperMaxPoslanecId: parseNumber(process.env.PROFILE_SCRAPER_MAX_POSLANEC_ID, 0),
  profileScraperMaxPeriod: parseNumber(process.env.PROFILE_SCRAPER_MAX_PERIOD, 9),
  profileScraperConcurrency: parseNumber(process.env.PROFILE_SCRAPER_CONCURRENCY, 6),
  profileScraperConsecutiveMissThreshold: parseNumber(process.env.PROFILE_SCRAPER_CONSECUTIVE_MISS_THRESHOLD, 0),
  aiEstimationEnabled: parseBoolean(process.env.AI_ESTIMATION_ENABLED, false),
  aiEstimationProvider: process.env.AI_ESTIMATION_PROVIDER || "gemini",
  aiEstimationApiUrl: process.env.AI_ESTIMATION_API_URL || "https://generativelanguage.googleapis.com/v1beta/models",
  aiEstimationApiKey: process.env.AI_ESTIMATION_API_KEY || process.env.GEMINI_API_KEY || "",
  aiEstimationModel: process.env.AI_ESTIMATION_MODEL || "gemini-2.0-flash",
  aiEstimationTimeoutMs: parseNumber(process.env.AI_ESTIMATION_TIMEOUT_MS, 12000),
};
