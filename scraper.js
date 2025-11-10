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

    // Navigate to the page with less strict wait condition
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',  // Less strict than 'networkidle'
        timeout: 60000
      });
      console.log('✓ Page navigation successful (DOM loaded)');
    } catch (navError) {
      console.error('⚠️ Navigation error:', navError.message);

      // Try to save whatever we got
      try {
        const html = await page.content();
        fs.writeFileSync('direct_scraper_output.html', html);
        await page.screenshot({ path: 'direct_scraper_screenshot.png' });
        console.log('Saved HTML and screenshot for debugging');
      } catch (e) {
        console.error('Could not save debug files:', e.message);
      }

      throw navError;
    }

    // Wait a bit for JavaScript to execute
    console.log('Waiting for page to stabilize...');
    await page.waitForTimeout(5000);

    // Save HTML for debugging
    let html = await page.content();
    fs.writeFileSync('direct_scraper_output.html', html);
    await page.screenshot({ path: 'direct_scraper_screenshot.png' });
    console.log('✓ HTML saved to direct_scraper_output.html');
    console.log('✓ Screenshot saved to direct_scraper_screenshot.png');

    // Wait for FlightData to be defined on the page
    let flightDataJSON = null;
    try {
      await page.waitForFunction(() => {
        return typeof FlightData !== 'undefined';
      }, { timeout: 45000 });

      console.log('✓ FlightData found!');

      // Extract FlightData from the page as a string
      const flightDataString = await page.evaluate(() => {
        if (typeof FlightData !== 'undefined') {
          return FlightData;
        }
        return null;
      });

      if (flightDataString) {
        try {
          // Save raw FlightData for debugging
          fs.writeFileSync('flightdata_raw.txt', flightDataString);
          console.log('✓ Raw FlightData saved to flightdata_raw.txt');
          console.log(`FlightData length: ${flightDataString.length} characters`);
          console.log('FlightData preview:', flightDataString.substring(0, 300) + '...');

          // FlightData is HTML-encoded JSON string, decode it first
          // Replace &quot; with " to make it valid JSON
          const cleanedString = flightDataString.replace(/&quot;/g, '"');

          // Save cleaned version
          fs.writeFileSync('flightdata_cleaned.txt', cleanedString);
          console.log('✓ Cleaned FlightData saved to flightdata_cleaned.txt');

          console.log('Parsing cleaned FlightData string...');
          flightDataJSON = JSON.parse(cleanedString);
          console.log('✓ Successfully parsed FlightData JSON');

          // Save parsed JSON for inspection
          fs.writeFileSync('flightdata_parsed.json', JSON.stringify(flightDataJSON, null, 2));
          console.log('✓ Parsed JSON saved to flightdata_parsed.json');

          // Log structure info
          if (flightDataJSON.journeys) {
            console.log(`JSON contains ${flightDataJSON.journeys.length} journey(s)`);
          } else {
            console.log('⚠️ JSON does not contain journeys array');
            console.log('JSON keys:', Object.keys(flightDataJSON).join(', '));
          }
        } catch (parseError) {
          console.error('⚠️ Error parsing FlightData:', parseError.message);
          console.error('Parse error stack:', parseError.stack);
          console.log('FlightData preview (first 500 chars):', flightDataString.substring(0, 500));
          console.log('FlightData preview (last 500 chars):', flightDataString.substring(Math.max(0, flightDataString.length - 500)));
        }
      }
    } catch (timeoutError) {
      console.log('⚠️ FlightData not found within timeout');
      console.log('Checking page content for errors...');

      // Check for common issues
      try {
        const pageText = await page.evaluate(() => document.body.innerText);
        const pageTextPreview = pageText.substring(0, 500);

        console.log('Page text preview:', pageTextPreview);

        if (pageText.toLowerCase().includes('access denied') ||
            pageText.toLowerCase().includes('blocked')) {
          console.log('⚠️ Page shows "access denied" or "blocked" message');
        }
        if (pageText.toLowerCase().includes('captcha')) {
          console.log('⚠️ CAPTCHA detected on page');
        }
        if (pageText.toLowerCase().includes('error')) {
          console.log('⚠️ Page shows error message');
        }

        // Check if this looks like the actual booking page
        if (pageText.toLowerCase().includes('frontier') &&
            pageText.toLowerCase().includes('flight')) {
          console.log('✓ Page appears to be a Frontier flight page');
        } else {
          console.log('⚠️ Page may not be the expected Frontier booking page');
        }
      } catch (e) {
        console.error('Could not check page text:', e.message);
      }
    }

    await browser.close();

    // If we didn't get FlightData from the page, try parsing from saved HTML
    if (!flightDataJSON && fs.existsSync('direct_scraper_output.html')) {
      console.log('⚠️ FlightData not available from page, trying to parse from saved HTML...');
      flightDataJSON = extractFlightDataFromHTML(fs.readFileSync('direct_scraper_output.html', 'utf8'));
    }

    if (!flightDataJSON) {
      console.log('⚠️ FlightData is null or could not be parsed');
      console.log('💡 Please share the following files for debugging:');
      console.log('   - direct_scraper_output.html');
      console.log('   - direct_scraper_screenshot.png');
      console.log('   - flightdata_raw.txt (if it exists)');
      console.log('   - flightdata_cleaned.txt (if it exists)');
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
    if (error.message.includes('Timeout') || error.message.includes('timeout')) {
      errorDetails.type = 'timeout';
      errorDetails.message = 'Request timed out while loading page. This usually means:\n' +
        '  1. Frontier is blocking automated access\n' +
        '  2. The page structure has changed\n' +
        '  3. Network connectivity issues\n' +
        'Suggestion: Use Scrapfly API mode instead, or check direct_scraper_output.html and direct_scraper_screenshot.png for details.';
    } else if (error.message.includes('net::ERR_')) {
      errorDetails.type = 'network_error';
      errorDetails.message = 'Network error: ' + error.message;
    } else if (error.message.includes('navigation')) {
      errorDetails.type = 'navigation_error';
      errorDetails.message = 'Failed to navigate to page: ' + error.message;
    }

    console.error('Detailed error:', JSON.stringify(errorDetails, null, 2));
    console.error('\n💡 TIP: Check these debug files in your project folder:');
    console.error('   - direct_scraper_output.html (page HTML)');
    console.error('   - direct_scraper_screenshot.png (page screenshot)');

    const detailedError = new Error(errorDetails.message);
    detailedError.details = errorDetails;
    throw detailedError;
  }
}

function extractFlightDataFromHTML(html) {
  try {
    console.log('Attempting to extract FlightData from HTML...');

    // Look for the script tag that defines FlightData
    // Pattern: var FlightData = "...";
    const flightDataMatch = html.match(/var\s+FlightData\s*=\s*"([^"]*)";/);

    if (!flightDataMatch) {
      console.log('⚠️ Could not find FlightData variable in HTML');

      // Try alternative pattern with single quotes
      const altMatch = html.match(/var\s+FlightData\s*=\s*'([^']*)';/);
      if (altMatch) {
        console.log('Found FlightData with single quotes');
        const cleanedString = altMatch[1].replace(/&quot;/g, '"');
        const parsed = JSON.parse(cleanedString);
        console.log('✓ Successfully extracted and parsed FlightData from HTML');
        return parsed;
      }

      // Try to find it in a different format
      const jsonMatch = html.match(/FlightData\s*=\s*({.*?});/s);
      if (jsonMatch) {
        console.log('Found FlightData as object literal');
        return JSON.parse(jsonMatch[1]);
      }

      return null;
    }

    console.log('✓ Found FlightData in HTML');
    const encodedString = flightDataMatch[1];

    // Decode HTML entities
    const cleanedString = encodedString.replace(/&quot;/g, '"');

    // Parse JSON
    const parsed = JSON.parse(cleanedString);
    console.log('✓ Successfully extracted and parsed FlightData from HTML');

    // Save for debugging
    fs.writeFileSync('flightdata_from_html.json', JSON.stringify(parsed, null, 2));
    console.log('✓ Saved parsed JSON to flightdata_from_html.json');

    return parsed;
  } catch (error) {
    console.error('⚠️ Error extracting FlightData from HTML:', error.message);
    return null;
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
        // Check if this is a GoWild flight by checking isGoWildFareEnabled
        if (!flight.isGoWildFareEnabled || flight.isGoWildFareEnabled !== true) {
          console.log('  ⊗ Skipping flight - GoWild fare not enabled');
          continue;
        }

        // Extract GoWild fare details
        const goWildFare = flight.goWildFare;
        const goWildFareKey = flight.goWildFareKey || '';

        if (!goWildFare || goWildFare <= 0) {
          console.log('  ⊗ Skipping flight - no GoWild fare available');
          continue;
        }

        // Extract other details
        const duration = flight.durationFormatted || flight.duration || 'Unknown';
        const stopsText = flight.stopsText || 'Unknown';

        // Extract departure and arrival times from legs
        let departureTime = 'N/A';
        let arrivalTime = 'N/A';
        const segments = [];

        if (flight.legs && Array.isArray(flight.legs) && flight.legs.length > 0) {
          // First leg departure
          const firstLeg = flight.legs[0];
          departureTime = firstLeg.departureDateFormatted || firstLeg.departureTime || 'N/A';

          // Last leg arrival
          const lastLeg = flight.legs[flight.legs.length - 1];
          arrivalTime = lastLeg.arrivalDateFormatted || lastLeg.arrivalTime || 'N/A';

          // Extract all segments
          for (const leg of flight.legs) {
            segments.push({
              from: leg.departureStation || 'N/A',
              to: leg.arrivalStation || 'N/A',
              departure_time: leg.departureDateFormatted || leg.departureTime || 'N/A',
              arrival_time: leg.arrivalDateFormatted || leg.arrivalTime || 'N/A',
              duration: leg.durationFormatted || leg.duration || 'N/A'
            });
          }
        }

        console.log(`  ✓ Found GoWild fare: $${goWildFare} (${duration}, ${stopsText})`);
        console.log(`    Departure: ${departureTime}, Arrival: ${arrivalTime}`);
        console.log(`    Segments: ${segments.length}, Key: ${goWildFareKey.substring(0, 30)}...`);

        flights.push({
          origin,
          destination,
          date,
          departure_time: departureTime,
          arrival_time: arrivalTime,
          stops: stopsText,
          price: goWildFare,
          duration: duration,
          selection_key: goWildFareKey,
          segments: segments,
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
