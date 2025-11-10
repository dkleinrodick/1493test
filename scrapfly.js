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
      rendering_wait: 3000,   // Wait 3 seconds after page load
      retry: true,            // Auto-retry on failure
      timeout: 60000          // 60 second timeout
    };

    const scrapflyUrl = `${SCRAPFLY_BASE_URL}?${new URLSearchParams(scrapflyParams).toString()}`;

    console.log('Calling Scrapfly API...');

    const response = await axios.get(scrapflyUrl, {
      timeout: 65000, // Slightly longer than Scrapfly's timeout
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

  // Check for error messages or no results
  if (html.toLowerCase().includes('no flights available') ||
      html.toLowerCase().includes('no results') ||
      html.toLowerCase().includes('sold out')) {
    console.log('✓ Page indicates no flights available');
    return [];
  }

  // Look for GoWild fare elements
  // Note: These selectors may need to be adjusted based on actual HTML structure

  // Try finding flight cards/containers
  const flightSelectors = [
    '.flight-result',
    '.flight-card',
    '[class*="flight"]',
    '[data-testid*="flight"]',
    '.fare-option',
    '[class*="fare"]'
  ];

  for (const selector of flightSelectors) {
    $(selector).each((i, elem) => {
      try {
        const flightElem = $(elem);

        // Look for price
        const priceText = flightElem.text();
        const priceMatch = priceText.match(/\$(\d+)/);

        if (!priceMatch) return;

        const price = parseFloat(priceMatch[1]);

        // Only consider GoWild prices (typically under $200)
        if (price > 200) return;

        // Look for times
        const timeElements = flightElem.find('[class*="time"], [data-testid*="time"]');
        let departureTime = '';
        let arrivalTime = '';

        if (timeElements.length >= 2) {
          departureTime = $(timeElements[0]).text().trim();
          arrivalTime = $(timeElements[1]).text().trim();
        }

        // Look for stops info
        let stops = 'Unknown';
        const stopsText = flightElem.find('[class*="stop"], [class*="connection"]').text();
        if (stopsText.toLowerCase().includes('nonstop') || stopsText.toLowerCase().includes('direct')) {
          stops = 'Nonstop';
        } else if (stopsText.match(/(\d+)\s*stop/i)) {
          const numStops = stopsText.match(/(\d+)\s*stop/i)[1];
          stops = `${numStops} Stop${numStops > 1 ? 's' : ''}`;
        }

        // Check if available
        const isUnavailable = flightElem.text().toLowerCase().includes('sold out') ||
                             flightElem.text().toLowerCase().includes('unavailable');

        if (departureTime && arrivalTime && !isUnavailable) {
          flights.push({
            origin,
            destination,
            date,
            departure_time: departureTime,
            arrival_time: arrivalTime,
            stops,
            price,
            available: true,
            scrape_method: 'scrapfly'
          });
        }
      } catch (err) {
        console.error('Error parsing flight element:', err.message);
      }
    });

    if (flights.length > 0) break; // Found flights with this selector
  }

  // Alternative: Search for all prices and try to extract flight info
  if (flights.length === 0) {
    console.log('Trying alternative parsing method...');

    $('*').each((i, elem) => {
      const text = $(elem).text();
      const priceMatch = text.match(/\$(\d+)/);

      if (priceMatch) {
        const price = parseFloat(priceMatch[1]);

        // GoWild fares are typically under $200
        if (price < 200) {
          console.log(`Found potential GoWild price: $${price}`);

          // Try to find parent container with time info
          const parent = $(elem).closest('div, article, section');
          const timeText = parent.text();

          // Look for time patterns (e.g., "10:30 AM", "14:45")
          const timeMatches = timeText.match(/\d{1,2}:\d{2}\s*[AP]M|\d{1,2}:\d{2}/gi);

          if (timeMatches && timeMatches.length >= 2) {
            flights.push({
              origin,
              destination,
              date,
              departure_time: timeMatches[0],
              arrival_time: timeMatches[1],
              stops: 'Unknown',
              price,
              available: true,
              scrape_method: 'scrapfly'
            });
          }
        }
      }
    });
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
