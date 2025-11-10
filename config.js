// Configuration for Frontier GoWild scraper

module.exports = {
  // Proxy settings
  USE_PROXIES: false,  // Set to true to enable proxy rotation when bot detection occurs

  // How many proxies to try before giving up
  MAX_PROXY_RETRIES: 10,

  // Scrapfly API settings
  SCRAPFLY_API_KEY: process.env.SCRAPFLY_API_KEY || '',

  // Rate limiting
  MIN_REQUEST_INTERVAL: 10000, // 10 seconds between requests

  // Server settings
  PORT: process.env.PORT || 3000
};
