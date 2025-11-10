// Test if Playwright works at all in this environment
const { chromium } = require('playwright');

async function test() {
  console.log('Testing basic Playwright functionality...\n');

  let browser;
  try {
    console.log('1. Launching browser...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process'  // Use single process mode for resource-constrained environments
      ]
    });
    console.log('✓ Browser launched');

    console.log('2. Creating context...');
    const context = await browser.newContext({
      ignoreHTTPSErrors: true
    });
    console.log('✓ Context created');

    console.log('3. Creating page...');
    const page = await context.newPage();
    console.log('✓ Page created');

    console.log('4. Navigating to test URL...');
    await page.goto('http://httpbin.org/html', {
      waitUntil: 'load',
      timeout: 30000
    });
    console.log('✓ Navigation successful');

    const title = await page.title();
    console.log(`✓ Page title: ${title}`);

    await browser.close();

    console.log('\n✅ Playwright works in this environment!');
    return true;

  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error('\n❌ Playwright test failed:', error.message);
    return false;
  }
}

test();
