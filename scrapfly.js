const axios = require('axios');

// Scrapfly API credentials
const SCRAPFLY_API_KEY = 'scp-live-c07f17fbff654e8188cd5308fa92018d';
const SCRAPFLY_BASE_URL = 'https://api.scrapfly.io/scrape';

// Rate limiting for API
let lastApiRequestTime = 0;
const MIN_API_REQUEST_INTERVAL = 2000; // 2 seconds for API

async function waitForApiRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastApiRequestTime;

  if (timeSinceLastRequest < MIN_API_REQUEST_INTERVAL) {
    const waitTime = MIN_API_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastApiRequestTime = Date.now();
}

async function scrapeFrontierWithScrapfly(origin, destination, date) {
  await waitForApiRateLimit();

  const targetUrl = `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${origin}&d1=${destination}&dd1=${date}&adt=1&umnr=false&loy=false&mon=true&ftype=GW`;

  console.log(`Scraping via Scrapfly: ${origin} -> ${destination} on ${date}`);
  console.log(`Target URL: ${targetUrl}`);

  try {
    // Build Scrapfly request with anti-scraping protection
    const scrapflyParams = {
      key: SCRAPFLY_API_KEY,
      url: targetUrl,
      asp: true,              // Anti Scraping Protection - bypasses bot detection
      render_js: true,        // Render JavaScript
      country: 'us',          // Use US proxy
      rendering_wait: 3000,   // Wait 3 seconds to ensure FlightData loads
      retry: true,            // Auto-retry on failure
      // Inject FlightData into page body for easier extraction (reduces parsing complexity)
      js: Buffer.from(`
        if (typeof FlightData !== 'undefined') {
          const pre = document.createElement('pre');
          pre.id = 'extracted-flight-data';
          pre.textContent = FlightData;
          document.body.prepend(pre);
        }
      `).toString('base64')
    };

    const scrapflyUrl = `${SCRAPFLY_BASE_URL}?${new URLSearchParams(scrapflyParams).toString()}`;

    console.log('Calling Scrapfly API...');

    const response = await axios.get(scrapflyUrl, {
      timeout: 120000, // 120 seconds timeout (increased from 65s)
      headers: {
        'Accept': 'application/json'
      }
    });

    console.log('Scrapfly response received');
    console.log(`API Cost: ${response.headers['x-scrapfly-api-cost'] || 'unknown'}`);

    // Parse the response
    const result = response.data.result;
    const html = result.content;

    console.log(`HTML length: ${html.length} characters`);

    // Parse flights from the HTML
    const flights = parseFlightsFromHTML(html, origin, destination, date);

    console.log(`Found ${flights.length} flights via Scrapfly`);

    return flights;

  } catch (error) {
    console.error('Error with Scrapfly API:', error.message);

    if (error.response) {
      console.error('Scrapfly Response Status:', error.response.status);
      console.error('Scrapfly Response Headers:', error.response.headers);

      // Check for specific error headers
      if (error.response.headers['x-scrapfly-reject-code']) {
        console.error('Reject Code:', error.response.headers['x-scrapfly-reject-code']);
        console.error('Reject Description:', error.response.headers['x-scrapfly-reject-description']);
        console.error('Retryable:', error.response.headers['x-scrapfly-reject-retryable']);
      }

      if (error.response.data) {
        console.error('Scrapfly Error Data:', JSON.stringify(error.response.data, null, 2));
      }
    }

    throw error;
  }
}

function parseFlightsFromHTML(html, origin, destination, date) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const flights = [];

  // Save HTML for debugging
  const fs = require('fs');
  fs.writeFileSync('scrapfly_output.html', html);
  console.log('HTML saved to scrapfly_output.html for inspection');

  try {
    // Find the FlightData variable
    let flightDataJSON = null;

    // First, try to get it from our injected element (faster, cleaner)
    const extractedData = $('#extracted-flight-data').text();
    if (extractedData) {
      console.log('✓ Found injected FlightData!');
      try {
        // The data is already a JSON string, just need to unescape and parse
        let jsonString = extractedData.replace(/&quot;/g, '"');
        flightDataJSON = JSON.parse(jsonString);
        console.log('✓ Successfully parsed injected FlightData JSON');
      } catch (parseError) {
        console.error('✗ Error parsing injected FlightData:', parseError.message);
      }
    }

    // Fallback: Look in script tags (old method)
    if (!flightDataJSON) {
      console.log('Injected data not found, searching script tags...');

      $('script').each((i, elem) => {
        const scriptContent = $(elem).html();

        // Look for FlightData = '{...}' pattern
        if (scriptContent && scriptContent.includes('FlightData')) {
          const match = scriptContent.match(/FlightData\s*=\s*['"]({[^'"]+})['"]/);

          if (match && match[1]) {
            // Found the FlightData JSON string
            let jsonString = match[1];

            // Replace HTML-escaped quotes with actual quotes
            jsonString = jsonString.replace(/&quot;/g, '"');

            console.log('Found FlightData in script tag! Parsing...');
            console.log('JSON string preview:', jsonString.substring(0, 200));

            try {
              flightDataJSON = JSON.parse(jsonString);
              console.log('✓ Successfully parsed FlightData JSON from script');
            } catch (parseError) {
              console.error('✗ Error parsing FlightData JSON:', parseError.message);
              console.error('JSON string preview:', jsonString.substring(0, 500));
            }
          }
        }
      });
    }

    if (!flightDataJSON) {
      console.log('⚠️ FlightData variable not found in HTML');
      console.log('Checking for alternate data sources...');
      return [];
    }

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
        // These might be in different fields depending on the structure
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
          scrape_method: 'scrapfly'
        });
      }
    }

    console.log(`\n✓ Total GoWild flights found: ${flights.length}`);

  } catch (error) {
    console.error('Error parsing FlightData:', error.message);
    console.error('Stack:', error.stack);
  }

  return flights;
}

// Test Scrapfly API connection
async function testScrapflyConnection() {
  try {
    // Make a simple test request
    const testUrl = 'https://httpbin.org/get';
    const params = {
      key: SCRAPFLY_API_KEY,
      url: testUrl
    };

    const scrapflyUrl = `${SCRAPFLY_BASE_URL}?${new URLSearchParams(params).toString()}`;

    const response = await axios.get(scrapflyUrl, {
      timeout: 30000,
      headers: {
        'Accept': 'application/json'
      }
    });

    console.log('✓ Scrapfly API connection successful');
    console.log('API Cost:', response.headers['x-scrapfly-api-cost']);
    console.log('Remaining Credit:', response.headers['x-scrapfly-remaining-api-credit']);

    return {
      success: true,
      cost: response.headers['x-scrapfly-api-cost'],
      remainingCredit: response.headers['x-scrapfly-remaining-api-credit']
    };
  } catch (error) {
    console.error('✗ Scrapfly API connection failed:', error.message);

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }

    throw error;
  }
}

module.exports = {
  scrapeFrontierWithScrapfly,
  testScrapflyConnection
};
