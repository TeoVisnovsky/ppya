import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || "postgresql://ppya:ppya@localhost:5432/ppya",
  scraperDelayMs: Number(process.env.SCRAPER_DELAY_MS || 200),
};
