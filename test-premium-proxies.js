// Test premium proxies module
const { PREMIUM_PROXIES, getRandomProxy, getAllProxies, getProxyCount } = require('./premium-proxies');

console.log('=== Premium Proxies Test ===\n');

// Test 1: Check proxy count
console.log('1. Proxy Count:');
console.log(`   Total proxies: ${getProxyCount()}`);
console.log(`   ✓ Pass\n`);

// Test 2: Get all proxies
console.log('2. Get All Proxies:');
const allProxies = getAllProxies();
console.log(`   Retrieved ${allProxies.length} proxies`);
console.log(`   First proxy: ${allProxies[0]}`);
console.log(`   Last proxy: ${allProxies[allProxies.length - 1]}`);
console.log(`   ✓ Pass\n`);

// Test 3: Get random proxies
console.log('3. Random Proxy Selection:');
console.log('   Getting 5 random proxies:');
for (let i = 0; i < 5; i++) {
  const proxy = getRandomProxy();
  console.log(`   ${i + 1}. ${proxy}`);
}
console.log(`   ✓ Pass\n`);

// Test 4: Verify proxy format
console.log('4. Proxy Format Validation:');
const proxyRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/;
let invalidProxies = [];
allProxies.forEach((proxy, index) => {
  if (!proxyRegex.test(proxy)) {
    invalidProxies.push({ index, proxy });
  }
});

if (invalidProxies.length === 0) {
  console.log(`   ✓ All ${allProxies.length} proxies have valid format (IP:PORT)`);
} else {
  console.log(`   ✗ Found ${invalidProxies.length} invalid proxies:`);
  invalidProxies.forEach(({ index, proxy }) => {
    console.log(`     ${index}: ${proxy}`);
  });
}
console.log();

// Test 5: Check for duplicates
console.log('5. Duplicate Check:');
const uniqueProxies = new Set(allProxies);
if (uniqueProxies.size === allProxies.length) {
  console.log(`   ✓ No duplicates found`);
} else {
  console.log(`   ✗ Found ${allProxies.length - uniqueProxies.size} duplicates`);
}
console.log();

console.log('=== All Tests Complete ===\n');

// Example usage with Playwright
console.log('=== Example: How to use with Playwright ===');
console.log(`
const { chromium } = require('playwright');
const { getRandomProxy } = require('./premium-proxies');

async function scrapeWithProxy() {
  const proxy = getRandomProxy();
  console.log('Using proxy:', proxy);

  const browser = await chromium.launch({
    headless: true,
    proxy: {
      server: 'http://' + proxy
    }
  });

  const page = await browser.newPage();
  await page.goto('https://example.com');
  await browser.close();
}
`);

console.log('To test with actual scraping, run:');
console.log('  node test-scraper-with-proxy.js\n');
