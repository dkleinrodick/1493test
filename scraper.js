const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

// Add stealth plugin
chromium.use(stealth);

// Rate limiting: store last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 10000; // 10 seconds

async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    console.log(`Rate limiting: waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
}

async function scrapeFrontierDirect(origin, destination, date) {
  await waitForRateLimit();

  const url = `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${origin}&d1=${destination}&dd1=${date}&adt=1&umnr=false&loy=false&mon=true&ftype=GW`;

  console.log(`Direct scraping with Playwright: ${origin} -> ${destination} on ${date}`);
  console.log(`Target URL: ${url}`);

  let browser;
  try {
    // Launch browser with stealth settings to avoid detection
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--single-process'  // Required for resource-constrained environments
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      ignoreHTTPSErrors: true  // Bypass SSL certificate validation
    });

    const page = await context.newPage();

    console.log('Navigating to Frontier booking page...');

    // Navigate to the page
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    console.log('Page loaded, waiting for FlightData...');

    // Save HTML for debugging first
    let html = await page.content();
    fs.writeFileSync('direct_scraper_output.html', html);
    console.log('HTML saved to direct_scraper_output.html for inspection');

    // Wait for FlightData to be defined on the page
    let flightDataJSON = null;
    try {
      await page.waitForFunction(() => {
        return typeof FlightData !== 'undefined';
      }, { timeout: 45000 });

      console.log('✓ FlightData found!');

      // Extract FlightData from the page
      flightDataJSON = await page.evaluate(() => {
        if (typeof FlightData !== 'undefined') {
          // FlightData is a JSON string, parse it
          try {
            return JSON.parse(FlightData);
          } catch (e) {
            console.error('Error parsing FlightData:', e);
            return null;
          }
        }
        return null;
      });
    } catch (timeoutError) {
      console.log('⚠️ FlightData not found within timeout');
      console.log('Checking page content for errors...');

      // Check for common issues
      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.toLowerCase().includes('access denied') ||
          pageText.toLowerCase().includes('blocked')) {
        console.log('⚠️ Page shows "access denied" or "blocked" message');
      }
      if (pageText.toLowerCase().includes('captcha')) {
        console.log('⚠️ CAPTCHA detected on page');
      }
    }

    await browser.close();

    if (!flightDataJSON) {
      console.log('⚠️ FlightData is null or could not be parsed');
      return [];
    }

    // Parse flights from FlightData (same logic as scrapfly.js)
    const flights = parseFlightsFromJSON(flightDataJSON, origin, destination, date);

    console.log(`✓ Total GoWild flights found: ${flights.length}`);
    return flights;

  } catch (error) {
    if (browser) {
      await browser.close();
    }

    console.error('Error scraping Frontier:', error.message);

    // Provide detailed error information
    const errorDetails = {
      message: error.message,
      type: 'scraping_error',
      url: url
    };

    // Check for specific error types
    if (error.message.includes('Timeout')) {
      errorDetails.type = 'timeout';
      errorDetails.message = 'Request timed out. FlightData did not load in time.';
    } else if (error.message.includes('net::ERR_')) {
      errorDetails.type = 'network_error';
      errorDetails.message = 'Network error: ' + error.message;
    }

    console.error('Detailed error:', JSON.stringify(errorDetails, null, 2));

    const detailedError = new Error(errorDetails.message);
    detailedError.details = errorDetails;
    throw detailedError;
  }
}

function parseFlightsFromJSON(flightDataJSON, origin, destination, date) {
  const flights = [];

  try {
    // Navigate through the JSON structure: journeys -> flights
    if (!flightDataJSON.journeys || !Array.isArray(flightDataJSON.journeys)) {
      console.log('⚠️ No journeys array found in FlightData');
      console.log('FlightData structure:', JSON.stringify(flightDataJSON, null, 2).substring(0, 500));
      return [];
    }

    console.log(`Found ${flightDataJSON.journeys.length} journey(s)`);

    // Iterate through journeys
    for (const journey of flightDataJSON.journeys) {
      if (!journey.flights || !Array.isArray(journey.flights)) {
        continue;
      }

      console.log(`  Processing ${journey.flights.length} flight(s) in this journey`);

      // Iterate through flights
      for (const flight of journey.flights) {
        // Extract GoWild fare
        const goWildFare = flight.goWildFare;

        if (!goWildFare || goWildFare <= 0) {
          console.log('  ⊗ Skipping flight - no GoWild fare available');
          continue;
        }

        // Extract other details
        const duration = flight.duration || 'Unknown';
        const stopsText = flight.stopsText || 'Unknown';

        // Try to extract departure and arrival times
        const departureTime = flight.departureTime || flight.depTime || flight.departure || 'N/A';
        const arrivalTime = flight.arrivalTime || flight.arrTime || flight.arrival || 'N/A';

        console.log(`  ✓ Found GoWild fare: $${goWildFare} (${duration}, ${stopsText})`);

        flights.push({
          origin,
          destination,
          date,
          departure_time: departureTime,
          arrival_time: arrivalTime,
          stops: stopsText,
          price: goWildFare,
          duration: duration,
          available: true,
          scrape_method: 'direct'
        });
      }
    }

    console.log(`\n✓ Extracted ${flights.length} GoWild flights from FlightData`);

  } catch (error) {
    console.error('Error parsing FlightData:', error.message);
    console.error('Stack:', error.stack);
  }

  return flights;
}

module.exports = {
  scrapeFrontierDirect
};
