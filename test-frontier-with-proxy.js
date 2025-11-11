// Test Frontier scraping with premium proxy
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { getRandomProxy } = require('./premium-proxies');
const fs = require('fs');

// Add stealth plugin
chromium.use(stealth);

async function testFrontierWithProxy(origin = 'ORD', destination = 'CUN', date = '2025-11-15') {
  const proxy = getRandomProxy();
  console.log('=== Frontier Scraping Test with Premium Proxy ===\n');
  console.log(`Route: ${origin} → ${destination}`);
  console.log(`Date: ${date}`);
  console.log(`Using proxy: ${proxy}\n`);

  const url = `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${origin}&d1=${destination}&dd1=${date}&adt=1&umnr=false&loy=false&mon=true&ftype=GW`;

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
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });

    const page = await context.newPage();

    console.log('Navigating to Frontier booking page...');
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('✓ Page loaded');
    console.log('Waiting for page to stabilize...');
    await page.waitForTimeout(5000);

    // Save output for inspection
    const html = await page.content();
    fs.writeFileSync('proxy_test_output.html', html);
    await page.screenshot({ path: 'proxy_test_screenshot.png' });

    console.log('✓ Saved proxy_test_output.html');
    console.log('✓ Saved proxy_test_screenshot.png');

    // Check for FlightData
    console.log('\nChecking for FlightData...');
    const hasFlightData = await page.evaluate(() => {
      return typeof FlightData !== 'undefined';
    });

    if (hasFlightData) {
      console.log('✅ FlightData found! Proxy successfully bypassed protection.');

      const flightDataJSON = await page.evaluate(() => {
        try {
          return JSON.parse(FlightData);
        } catch (e) {
          return null;
        }
      });

      if (flightDataJSON && flightDataJSON.journeys) {
        console.log(`✓ Found ${flightDataJSON.journeys.length} journey(s)`);

        let flightCount = 0;
        for (const journey of flightDataJSON.journeys) {
          if (journey.flights) {
            flightCount += journey.flights.length;
          }
        }
        console.log(`✓ Found ${flightCount} flight(s)`);
      }
    } else {
      console.log('⚠️ FlightData not found');

      // Check page content
      const bodyText = await page.evaluate(() => document.body.innerText);
      const preview = bodyText.substring(0, 500);

      console.log('\nPage content preview:');
      console.log(preview);

      if (bodyText.toLowerCase().includes('access denied')) {
        console.log('\n⚠️ Access denied - proxy may be blocked');
      } else if (bodyText.toLowerCase().includes('captcha')) {
        console.log('\n⚠️ CAPTCHA detected');
      } else {
        console.log('\n⚠️ Unknown issue - check output files');
      }
    }

    await browser.close();

    console.log('\n=== Test Complete ===');
    console.log('Check these files for details:');
    console.log('  - proxy_test_output.html');
    console.log('  - proxy_test_screenshot.png');

  } catch (error) {
    if (browser) {
      await browser.close();
    }

    console.error('\n❌ Test failed');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Try a different proxy (run the test again)');
    console.error('  2. Check if proxy requires authentication');
    console.error('  3. Verify proxy is online and accessible');
  }
}

// Parse command line arguments or use defaults
const origin = process.argv[2] || 'ORD';
const destination = process.argv[3] || 'CUN';
const date = process.argv[4] || '2025-11-15';

testFrontierWithProxy(origin, destination, date);
