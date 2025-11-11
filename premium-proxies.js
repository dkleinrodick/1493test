// Premium proxy list
// Format: IP:PORT
const PREMIUM_PROXIES = [
  '104.207.44.112:3129',
  '104.167.25.173:3129',
  '104.207.35.127:3129',
  '104.207.41.123:3129',
  '209.50.170.186:3129',
  '104.207.35.120:3129',
  '104.207.34.186:3129',
  '209.50.172.137:3129',
  '45.3.33.160:3129',
  '216.26.235.113:3129',
  '209.50.163.7:3129',
  '193.56.28.130:3129',
  '216.26.234.250:3129',
  '209.50.169.44:3129',
  '65.111.10.15:3129',
  '65.111.14.83:3129',
  '104.207.44.228:3129',
  '104.207.40.249:3129',
  '65.111.6.77:3129',
  '104.207.33.59:3129',
  '209.50.171.109:3129',
  '104.207.37.148:3129',
  '65.111.6.116:3129',
  '209.50.170.244:3129',
  '104.207.34.158:3129',
  '45.3.33.46:3129',
  '216.26.226.158:3129',
  '216.26.234.148:3129',
  '65.111.1.33:3129',
  '65.111.8.20:3129',
  '209.50.175.95:3129',
  '65.111.12.140:3129',
  '209.50.163.67:3129',
  '104.207.36.84:3129',
  '45.3.48.101:3129',
  '104.207.34.120:3129',
  '216.26.234.64:3129',
  '209.50.173.24:3129',
  '216.26.226.59:3129',
  '216.26.238.5:3129',
  '65.111.7.117:3129',
  '65.111.8.54:3129',
  '65.111.14.5:3129',
  '65.111.7.169:3129',
  '65.111.2.149:3129',
  '193.56.28.37:3129',
  '216.26.234.223:3129'
];

/**
 * Get a random premium proxy from the list
 * @returns {string} Random proxy in format "IP:PORT"
 */
function getRandomProxy() {
  const randomIndex = Math.floor(Math.random() * PREMIUM_PROXIES.length);
  return PREMIUM_PROXIES[randomIndex];
}

/**
 * Get all premium proxies
 * @returns {Array<string>} Array of all proxies
 */
function getAllProxies() {
  return [...PREMIUM_PROXIES];
}

/**
 * Get proxy count
 * @returns {number} Total number of proxies
 */
function getProxyCount() {
  return PREMIUM_PROXIES.length;
}

module.exports = {
  PREMIUM_PROXIES,
  getRandomProxy,
  getAllProxies,
  getProxyCount
};
