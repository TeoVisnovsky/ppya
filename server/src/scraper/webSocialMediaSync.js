import { WebSocialMediaScraper } from "./webSocialMediaScraper.js";
import {
  listPoliticiansWithoutSocialMedia,
  updatePoliticianSocialMedia,
} from "../db/repositories.js";
import { pool } from "../db/pool.js";

/**
 * Web-based social media sync for politicians
 * Searches X, Facebook, and Instagram and stores the first found profile
 */
class WebSocialMediaSync {
  constructor() {
    this.scraper = new WebSocialMediaScraper();
    this.stats = {
      processed: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
    };
  }

  /**
   * Search and sync social media for a single politician
   * @param {Object} politician - Politician object with id, full_name
   * @returns {Promise<Object>} Result of the sync
   */
  async syncPolitician(politician) {
    try {
      if (!politician.full_name) {
        console.warn(`⊘ Skipping politician ${politician.id}: no full name`);
        this.stats.skipped++;
        return { status: "skipped", reason: "no_name" };
      }

      const results = await this.scraper.searchAllPlatforms(politician.full_name);
      const identifiers = this.scraper.extractIdentifiers(results);

      // Only update if at least one platform was found
      if (identifiers.twitter || identifiers.facebook || identifiers.instagram) {
        await updatePoliticianSocialMedia(politician.id, identifiers, pool);
        this.stats.updated++;

        console.log(`📌 Stored profiles:`);
        if (identifiers.twitter) console.log(`   • Twitter/X: @${identifiers.twitter}`);
        if (identifiers.facebook) console.log(`   • Facebook: ${identifiers.facebook}`);
        if (identifiers.instagram) console.log(`   • Instagram: @${identifiers.instagram}`);

        return {
          status: "success",
          data: identifiers,
        };
      } else {
        console.log(`⚠ No profiles found for "${politician.full_name}"`);
        this.stats.skipped++;

        return {
          status: "not_found",
          reason: "no_profiles_found",
        };
      }
    } catch (error) {
      this.stats.failed++;
      console.error(
        `✗ Error syncing politician ${politician.id} (${politician.full_name}):`,
        error.message,
      );
      return { status: "error", error: error.message };
    }
  }

  /**
   * Batch sync politicians without complete social media data
   * @param {number} limit - Number of politicians to sync
   * @returns {Promise<Object>} Summary of sync operation
   */
  async syncBatch(limit = 10) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📱 Starting social media web search for up to ${limit} politicians...`);
    console.log(`${"=".repeat(60)}\n`);

    try {
      const politicians = await listPoliticiansWithoutSocialMedia(limit, pool);

      if (politicians.length === 0) {
        console.log("✓ All politicians have complete social media data!");
        await this.scraper.close();
        return {
          complete: true,
          stats: this.stats,
        };
      }

      console.log(`Found ${politicians.length} politicians needing social media updates\n`);

      for (let i = 0; i < politicians.length; i++) {
        const politician = politicians[i];
        console.log(
          `\n[${i + 1}/${politicians.length}] Processing: ${politician.full_name}`,
        );
        console.log(`${"─".repeat(60)}`);

        await this.syncPolitician(politician);

        // Add delay between searches to avoid overwhelming the browser
        if (i < politicians.length - 1) {
          console.log(`⏳ Waiting 3 seconds before next search...\n`);
          await this.delay(3000);
        }
      }

      await this.scraper.close();

      console.log(`\n${"=".repeat(60)}`);
      console.log(`✓ Sync batch complete!`);
      console.log(`${"=".repeat(60)}`);

      return {
        complete: false,
        stats: this.stats,
        nextBatchAvailable: politicians.length >= limit,
      };
    } catch (error) {
      console.error("Fatal error during batch sync:", error.message);
      await this.scraper.close();
      throw error;
    }
  }

  /**
   * Display summary statistics
   */
  displayStats() {
    console.log(`\n📊 ${"=".repeat(56)} 📊`);
    console.log(`Sync Statistics:`);
    console.log(`  • Processed: ${this.stats.processed}`);
    console.log(`  • Updated:   ${this.stats.updated}`);
    console.log(`  • Failed:    ${this.stats.failed}`);
    console.log(`  • Skipped:   ${this.stats.skipped}`);
    console.log(`📊 ${"=".repeat(56)} 📊\n`);
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export the sync class
export { WebSocialMediaSync };

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const sync = new WebSocialMediaSync();

    // Get limit from command line argument or default to 10
    const limit = parseInt(process.argv[2]) || 10;

    // Run sync
    const result = await sync.syncBatch(limit);

    sync.stats.processed = result.stats.updated + result.stats.failed + result.stats.skipped;
    sync.displayStats();

    process.exit(result.stats.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}
