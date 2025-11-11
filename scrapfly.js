const axios = require('axios');
const he = require('he');

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
    // Build Scrapfly request - OPTIMIZED: No JS rendering needed!
    // FlightData is in the HTML source, so we just need Scrapfly to bypass bot detection
    const scrapflyParams = {
      key: SCRAPFLY_API_KEY,
      url: targetUrl,
      asp: true,              // Anti Scraping Protection - bypasses bot detection
      render_js: false,       // Don't render JS - FlightData is in source HTML (faster & cheaper!)
      country: 'us',          // Use US proxy
      retry: true             // Auto-retry on failure
    };

    const scrapflyUrl = `${SCRAPFLY_BASE_URL}?${new URLSearchParams(scrapflyParams).toString()}`;

    console.log('Calling Scrapfly API (optimized - no JS rendering)...');

    const response = await axios.get(scrapflyUrl, {
      timeout: 30000, // 30 seconds timeout (reduced from 120s since no JS rendering)
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

    // Parse flights from the HTML using simple regex extraction
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
    // Extract FlightData using simple regex (no JS rendering needed!)
    // FlightData is embedded in the HTML source as: FlightData = '{...}';
    let flightDataJSON = null;

    console.log('Extracting FlightData from HTML source...');

    $('script').each((i, elem) => {
      const scriptContent = $(elem).html();

      // Look for FlightData = '{...}' pattern
      if (scriptContent && scriptContent.includes('FlightData')) {
        const match = scriptContent.match(/FlightData\s*=\s*['"]({[^'"]+})['"]/);

        if (match && match[1]) {
          // Found the FlightData JSON string
          let jsonString = match[1];

          // Decode ALL HTML entities using 'he' library
          jsonString = he.decode(jsonString);

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

    let flightIndex = 0; // Track flight index for uniqueness

    // Iterate through journeys
    for (const journey of flightDataJSON.journeys) {
      if (!journey.flights || !Array.isArray(journey.flights)) {
        continue;
      }

      console.log(`  Processing ${journey.flights.length} flight(s) in this journey`);

      // Iterate through flights
      for (const flight of journey.flights) {
        flightIndex++;
        // Check if this is a GoWild flight
        if (!flight.isGoWildFareEnabled || flight.isGoWildFareEnabled !== true) {
          console.log('  ⊗ Skipping flight - GoWild fare not enabled');
          continue;
        }

        // Extract GoWild fare
        const goWildFare = flight.goWildFare;
        const goWildFareKey = flight.goWildFareKey || '';

        if (!goWildFare || goWildFare <= 0) {
          console.log('  ⊗ Skipping flight - no GoWild fare available');
          continue;
        }

        // Extract other details
        const duration = flight.durationFormatted || flight.duration || 'Unknown';
        const stopsText = flight.stopsText || 'Unknown';

        // Extract departure and arrival times from legs (same as direct scraper)
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

        // Ensure uniqueness: if departure_time is 'N/A', append flight index
        // This prevents the database UNIQUE constraint from treating all 'N/A' flights as duplicates
        const uniqueDepartureTime = departureTime === 'N/A' ? `N/A-${flightIndex}` : departureTime;

        flights.push({
          origin,
          destination,
          date,
          departure_time: uniqueDepartureTime,
          arrival_time: arrivalTime,
          stops: stopsText,
          price: goWildFare,
          duration: duration,
          selection_key: goWildFareKey,
          segments: segments,
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
