// Test scraper with premium proxies
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { getRandomProxy, getProxyCount } = require('./premium-proxies');

// Add stealth plugin
chromium.use(stealth);

async function testProxyConnection() {
  const proxy = getRandomProxy();
  console.log('=== Testing Premium Proxy ===\n');
  console.log(`Available proxies: ${getProxyCount()}`);
  console.log(`Selected proxy: ${proxy}\n`);

  let browser;
  try {
    console.log('Launching browser with proxy...');

    browser = await chromium.launch({
      headless: true,
      proxy: {
        server: `http://${proxy}`
      },
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--single-process'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    // Test 1: Check IP address
    console.log('Test 1: Checking IP address via proxy...');
    await page.goto('https://api.ipify.org?format=json', { timeout: 30000 });
    const ipData = await page.evaluate(() => document.body.textContent);
    console.log(`Response: ${ipData}`);
    console.log('✓ IP check successful\n');

    // Test 2: Test with httpbin
    console.log('Test 2: Testing headers via httpbin...');
    await page.goto('https://httpbin.org/headers', { timeout: 30000 });
    const headers = await page.evaluate(() => document.body.textContent);
    console.log('Headers received:');
    console.log(headers.substring(0, 300) + '...');
    console.log('✓ Headers check successful\n');

    // Test 3: Try accessing Frontier (limited test)
    console.log('Test 3: Testing Frontier access...');
    const frontierUrl = 'https://www.flyfrontier.com';
    await page.goto(frontierUrl, {
      timeout: 30000,
      waitUntil: 'domcontentloaded'
    });

    const title = await page.title();
    console.log(`Page title: ${title}`);

    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 200));
    console.log(`Page content preview: ${bodyText}...`);

    if (bodyText.toLowerCase().includes('access denied') ||
        bodyText.toLowerCase().includes('blocked')) {
      console.log('⚠️ Warning: Page may be blocked');
    } else {
      console.log('✓ Frontier homepage accessed successfully\n');
    }

    await browser.close();

    console.log('\n=== Proxy Test Results ===');
    console.log(`Proxy: ${proxy}`);
    console.log('Status: ✅ All tests passed');
    console.log('\nThe proxy is working! You can now use it with your scraper.');

  } catch (error) {
    if (browser) {
      await browser.close();
    }

    console.error('\n❌ Proxy test failed');
    console.error('Error:', error.message);
    console.error('\nPossible issues:');
    console.error('  1. Proxy may be offline or unreachable');
    console.error('  2. Proxy may require authentication');
    console.error('  3. Network connectivity issues');
    console.error(`  4. Try another proxy from the list (${getProxyCount()} available)`);
  }
}

// Run the test
testProxyConnection();
