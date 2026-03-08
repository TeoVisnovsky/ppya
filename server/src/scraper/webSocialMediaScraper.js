import { chromium } from "playwright";

/**
 * Web-based social media profile finder
 * Uses browser automation (Playwright) to search for politician profiles on X, Facebook, and Instagram
 */
class WebSocialMediaScraper {
  constructor() {
    this.browser = null;
    this.headless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  }

  /**
   * Initialize the browser
   */
  async init() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.headless,
      });
    }
    return this.browser;
  }

  /**
   * Close the browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Search for politician on X (Twitter)
   * @param {string} fullName - Politician's full name
   * @returns {Promise<Object>} Profile data or null
   */
  async searchX(fullName) {
    let page;
    try {
      await this.init();
      page = await this.browser.newPage();
      page.setDefaultTimeout(20000);

      console.log(`🔍 Searching X for: "${fullName}"`);

      // Navigate to X search
      await page.goto(`https://x.com/search?q=${encodeURIComponent(fullName)}&f=user`, {
        waitUntil: "networkidle",
      });

      // Wait for search results to load
      await page.waitForSelector("a[href*='/']", { timeout: 5000 }).catch(() => null);

      // Get the first user profile link
      const firstProfile = await page.evaluate(() => {
        const profileLinks = document.querySelectorAll('a[href^="/"][href*="/"]');

        for (const link of profileLinks) {
          const href = link.getAttribute("href");
          if (href && !href.includes("/search") && href !== "/" && !href.includes("/home") && !href.includes("/i/")) {
            const match = href.match(/^\/([a-zA-Z0-9_]+)$/);
            if (match && match[1]) {
              return {
                username: match[1],
                url: `https://x.com${href}`,
                source: "x",
              };
            }
          }
        }
        return null;
      });

      await page.close();

      if (firstProfile) {
        console.log(`✓ Found X profile: @${firstProfile.username}`);
      } else {
        console.log(`✗ No X profile found for "${fullName}"`);
      }

      return firstProfile;
    } catch (error) {
      if (page) await page.close().catch(() => null);
      console.error(`✗ Error searching X for "${fullName}":`, error.message);
      return null;
    }
  }

  /**
   * Search for politician on Facebook
   * @param {string} fullName - Politician's full name
   * @returns {Promise<Object>} Profile data or null
   */
  async searchFacebook(fullName) {
    let page;
    try {
      await this.init();
      page = await this.browser.newPage();
      page.setDefaultTimeout(20000);

      console.log(`🔍 Searching Facebook for: "${fullName}"`);

      // Navigate to Facebook search
      await page.goto(
        `https://www.facebook.com/search/people/?q=${encodeURIComponent(fullName)}`,
        {
          waitUntil: "networkidle",
        },
      );

      // Wait for results
      await page.waitForSelector("a[href*='/']", { timeout: 5000 }).catch(() => null);

      // Get the first profile
      const firstProfile = await page.evaluate(() => {
        const profileLinks = document.querySelectorAll('a[href*="facebook.com"]');

        for (const link of profileLinks) {
          const href = link.getAttribute("href");
          const text = link.textContent?.trim();

          if (href && text && text.length > 2 && text.length < 100 && !href.includes("search")) {
            const match = href.match(/\/([a-zA-Z0-9._-]+)\/?(\?|$)/);
            if (match && match[1]) {
              return {
                username: match[1],
                url: href.startsWith("http") ? href : `https://www.facebook.com${href}`,
                source: "facebook",
              };
            }
          }
        }
        return null;
      });

      await page.close();

      if (firstProfile) {
        console.log(`✓ Found Facebook profile: ${firstProfile.username}`);
      } else {
        console.log(`✗ No Facebook profile found for "${fullName}"`);
      }

      return firstProfile;
    } catch (error) {
      if (page) await page.close().catch(() => null);
      console.error(`✗ Error searching Facebook for "${fullName}":`, error.message);
      return null;
    }
  }

  /**
   * Search for politician on Instagram
   * @param {string} fullName - Politician's full name
   * @returns {Promise<Object>} Profile data or null
   */
  async searchInstagram(fullName) {
    let page;
    try {
      await this.init();
      page = await this.browser.newPage();
      page.setDefaultTimeout(20000);

      console.log(`🔍 Searching Instagram for: "${fullName}"`);

      // Use Google search to find Instagram profiles (workaround for Instagram's JS-heavy pages)
      await page.goto(
        `https://www.google.com/search?q=site:instagram.com ${encodeURIComponent(fullName)}`,
        {
          waitUntil: "networkidle",
        },
      );

      // Wait for search results
      const firstProfile = await page.evaluate(() => {
        const links = document.querySelectorAll("a");

        for (const link of links) {
          const href = link.getAttribute("href");

          if (href && href.includes("instagram.com/") && !href.includes("/explore")) {
            const match = href.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
            if (match && match[1]) {
              return {
                username: match[1],
                url: `https://www.instagram.com/${match[1]}/`,
                source: "instagram",
              };
            }
          }
        }
        return null;
      });

      await page.close();

      if (firstProfile) {
        console.log(`✓ Found Instagram profile: @${firstProfile.username}`);
      } else {
        console.log(`✗ No Instagram profile found for "${fullName}"`);
      }

      return firstProfile;
    } catch (error) {
      if (page) await page.close().catch(() => null);
      console.error(`✗ Error searching Instagram for "${fullName}":`, error.message);
      return null;
    }
  }

  /**
   * Search all platforms for a politician
   * @param {string} fullName - Politician's full name
   * @returns {Promise<Object>} Result with profiles from all platforms
   */
  async searchAllPlatforms(fullName) {
    console.log(`\n🎯 Searching for politician: "${fullName}"\n`);

    const results = {
      full_name: fullName,
      x: await this.searchX(fullName),
      facebook: await this.searchFacebook(fullName),
      instagram: await this.searchInstagram(fullName),
      searched_at: new Date().toISOString(),
    };

    return results;
  }

  /**
   * Extract account identifiers from search results
   * @param {Object} searchResults - Results from searchAllPlatforms
   * @returns {Object} Extracted identifiers for database storage
   */
  extractIdentifiers(searchResults) {
    return {
      twitter: searchResults.x?.username || null,
      facebook: searchResults.facebook?.username || null,
      instagram: searchResults.instagram?.username || null,
    };
  }
}

export { WebSocialMediaScraper };
