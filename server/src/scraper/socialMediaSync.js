import { SocialMediaSearcher } from "../scraper/socialMediaSearcher.js";
import {
  listPoliticiansWithoutSocialMedia,
  updatePoliticianSocialMedia,
  listAllPoliticiansSocialMedia,
} from "../db/repositories.js";
import { pool } from "../db/pool.js";

/**
 * Search and store social media accounts for politicians
 */
class SocialMediaSync {
  constructor() {
    this.searcher = new SocialMediaSearcher();
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
   * @param {Object} apiTokens - API tokens for social platforms
   * @returns {Promise<Object>} Result of the sync
   */
  async syncPolitician(politician, apiTokens = {}) {
    try {
      if (!politician.full_name) {
        console.warn(`Skipping politician ${politician.id}: no full name`);
        this.stats.skipped++;
        return { status: "skipped", reason: "no_name" };
      }

      console.log(`Searching for "${politician.full_name}" (ID: ${politician.id})...`);

      const bestMatches = await this.searcher.findBestMatches(politician.full_name, apiTokens);

      const socialMediaData = {
        instagram: bestMatches.instagram?.username || null,
        facebook: bestMatches.facebook?.id || null,
        twitter: bestMatches.twitter?.username || null,
      };

      await updatePoliticianSocialMedia(politician.id, socialMediaData, pool);

      this.stats.updated++;
      console.log(
        `✓ Updated: Instagram=${socialMediaData.instagram}, Facebook=${socialMediaData.facebook}, Twitter=${socialMediaData.twitter}`,
      );

      return {
        status: "success",
        data: socialMediaData,
      };
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
   * @param {Object} apiTokens - API tokens
   * @returns {Promise<Object>} Summary of sync operation
   */
  async syncBatch(limit = 100, apiTokens = {}) {
    console.log(`\n📱 Starting social media sync for up to ${limit} politicians...`);

    try {
      const politicians = await listPoliticiansWithoutSocialMedia(limit, pool);

      if (politicians.length === 0) {
        console.log("✓ All politicians have complete social media data!");
        return {
          complete: true,
          stats: this.stats,
        };
      }

      console.log(`Found ${politicians.length} politicians needing social media updates\n`);

      for (const politician of politicians) {
        await this.syncPolitician(politician, apiTokens);
        // Add delay to avoid rate limiting
        await this.delay(1000);
      }

      console.log("\n✓ Sync batch complete!");
      return {
        complete: false,
        stats: this.stats,
        nextBatchAvailable: politicians.length >= limit,
      };
    } catch (error) {
      console.error("Fatal error during batch sync:", error.message);
      throw error;
    }
  }

  /**
   * Get all politicians with their current social media data
   * @returns {Promise<Array>} List of all politicians with social media info
   */
  async getAllWithSocialMedia() {
    try {
      const politicians = await listAllPoliticiansSocialMedia(pool);
      return politicians;
    } catch (error) {
      console.error("Error retrieving social media data:", error.message);
      throw error;
    }
  }

  /**
   * Display summary statistics
   */
  displayStats() {
    console.log("\n📊 Sync Statistics:");
    console.log(`  - Processed: ${this.stats.processed}`);
    console.log(`  - Updated: ${this.stats.updated}`);
    console.log(`  - Failed: ${this.stats.failed}`);
    console.log(`  - Skipped: ${this.stats.skipped}`);
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export the sync class
export { SocialMediaSync };

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const sync = new SocialMediaSync();

  // Example: sync first 10 politicians
  sync
    .syncBatch(10)
    .then(() => {
      sync.displayStats();
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
