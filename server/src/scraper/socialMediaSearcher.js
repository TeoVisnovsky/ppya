import axios from "axios";

/**
 * Social media account finder for politicians
 * Searches Instagram, Facebook, and Twitter for politician accounts
 */

class SocialMediaSearcher {
  constructor() {
    // API endpoints and configurations
    this.instagramSearchUrl = "https://www.instagram.com/api/v1/web/search/topsearch";
    this.twitterApiV2 = "https://api.twitter.com/2/search/tweets";
    this.facebookGraphApi = "https://graph.facebook.com/v18.0/search";
  }

  /**
   * Search for Instagram account by person name
   * @param {string} fullName - Politician's full name
   * @returns {Promise<Object>} Instagram account data
   */
  async searchInstagram(fullName) {
    try {
      // Instagram search via web endpoints (requires valid session/headers)
      const response = await axios.get(this.instagramSearchUrl, {
        params: {
          query: fullName,
          context: "user",
        },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 5000,
      });

      // Extract user profiles from results
      const users = response.data?.users || [];
      const matches = users.map((user) => ({
        username: user.username,
        full_name: user.full_name,
        profile_pic_url: user.profile_pic_url || null,
        is_verified: user.is_verified || false,
        similarity: this.calculateNameSimilarity(full_name, user.full_name),
      }));

      return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
    } catch (error) {
      console.error(`Instagram search failed for "${fullName}":`, error.message);
      return [];
    }
  }

  /**
   * Search for Twitter account by person name
   * @param {string} fullName - Politician's full name
   * @param {string} twitterBearerToken - Twitter API Bearer Token
   * @returns {Promise<Object>} Twitter account data
   */
  async searchTwitter(fullName, twitterBearerToken) {
    if (!twitterBearerToken) {
      console.warn("Twitter API token not provided, skipping Twitter search");
      return [];
    }

    try {
      const response = await axios.get(this.twitterApiV2, {
        params: {
          query: `${fullName} -is:retweet`,
          "user.fields": "verified,username,name,profile_image_url",
          max_results: 10,
        },
        headers: {
          Authorization: `Bearer ${twitterBearerToken}`,
        },
        timeout: 5000,
      });

      const matches = (response.data?.data || []).map((user) => ({
        username: user.username,
        name: user.name,
        verified: user.verified || false,
        profile_image_url: user.profile_image_url || null,
        similarity: this.calculateNameSimilarity(fullName, user.name),
      }));

      return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
    } catch (error) {
      console.error(`Twitter search failed for "${fullName}":`, error.message);
      return [];
    }
  }

  /**
   * Search for Facebook account by person name
   * @param {string} fullName - Politician's full name
   * @param {string} facebookAccessToken - Facebook Graph API Token
   * @returns {Promise<Object>} Facebook account data
   */
  async searchFacebook(fullName, facebookAccessToken) {
    if (!facebookAccessToken) {
      console.warn("Facebook API token not provided, skipping Facebook search");
      return [];
    }

    try {
      const response = await axios.get(this.facebookGraphApi, {
        params: {
          q: fullName,
          type: "user",
          access_token: facebookAccessToken,
        },
        timeout: 5000,
      });

      const matches = (response.data?.data || []).map((user) => ({
        id: user.id,
        name: user.name,
        picture: user.picture?.data?.url || null,
        similarity: this.calculateNameSimilarity(fullName, user.name),
      }));

      return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
    } catch (error) {
      console.error(`Facebook search failed for "${fullName}":`, error.message);
      return [];
    }
  }

  /**
   * Calculate similarity score between two names (0-1)
   * Simple Levenshtein-like algorithm
   * @param {string} name1
   * @param {string} name2
   * @returns {number} Similarity score
   */
  calculateNameSimilarity(name1, name2) {
    const clean1 = name1.toLowerCase().trim();
    const clean2 = name2.toLowerCase().trim();

    // Exact match
    if (clean1 === clean2) return 1;

    // Check if one contains the other
    if (clean1.includes(clean2) || clean2.includes(clean1)) return 0.8;

    // Check for partial word matches
    const words1 = clean1.split(/\s+/);
    const words2 = clean2.split(/\s+/);
    const commonWords = words1.filter((w) => words2.includes(w)).length;
    const maxWords = Math.max(words1.length, words2.length);

    return commonWords > 0 ? commonWords / maxWords : 0;
  }

  /**
   * Search all platforms for a politician
   * @param {string} fullName - Politician's full name
   * @param {Object} apiTokens - API tokens { twitter, facebook }
   * @returns {Promise<Object>} Search results from all platforms
   */
  async searchAllPlatforms(fullName, apiTokens = {}) {
    const results = {
      full_name: fullName,
      instagram: await this.searchInstagram(fullName),
      twitter: await this.searchTwitter(fullName, apiTokens.twitter),
      facebook: await this.searchFacebook(fullName, apiTokens.facebook),
      searched_at: new Date().toISOString(),
    };

    return results;
  }

  /**
   * Find best match across all platforms
   * Returns single best match for each platform
   * @param {string} fullName
   * @param {Object} apiTokens
   * @returns {Promise<Object>} Best matches or null for each platform
   */
  async findBestMatches(fullName, apiTokens = {}) {
    const allResults = await this.searchAllPlatforms(fullName, apiTokens);

    return {
      full_name: fullName,
      instagram: allResults.instagram[0] || null,
      twitter: allResults.twitter[0] || null,
      facebook: allResults.facebook[0] || null,
      searched_at: allResults.searched_at,
    };
  }
}

export { SocialMediaSearcher };
