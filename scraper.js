const axios = require('axios');
const cheerio = require('cheerio');

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

  console.log(`Scraping: ${url}`);

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Check for CAPTCHA
    if (html.includes('captcha') || html.includes('CAPTCHA') || html.includes('challenge')) {
      throw new Error('CAPTCHA detected - please use API mode');
    }

    // Parse flights from the page
    const flights = [];

    // Look for GoWild fare buttons/elements
    // The actual selectors will need to be adjusted based on Frontier's HTML structure
    $('.flight-result, .flight-card, [class*="flight"]').each((i, elem) => {
      try {
        const flightElem = $(elem);

        // Try to find GoWild price
        const priceText = flightElem.find('[class*="gowild"], [class*="price"], .fare-amount').text();
        const priceMatch = priceText.match(/\$(\d+)/);

        if (!priceMatch) return; // Skip if no price found

        const price = parseFloat(priceMatch[1]);

        // Extract time information
        const departureTime = flightElem.find('[class*="departure"], [class*="depart-time"]').first().text().trim();
        const arrivalTime = flightElem.find('[class*="arrival"], [class*="arrive-time"]').first().text().trim();

        // Extract stops information
        let stops = 'Nonstop';
        const stopsText = flightElem.find('[class*="stop"], [class*="connection"]').text();
        if (stopsText.includes('1 stop') || stopsText.includes('1 Stop')) {
          stops = '1 Stop';
        } else if (stopsText.match(/(\d+)\s*stop/i)) {
          const numStops = stopsText.match(/(\d+)\s*stop/i)[1];
          stops = `${numStops} Stops`;
        }

        // Check if available (not sold out)
        const isUnavailable = flightElem.text().toLowerCase().includes('sold out') ||
                             flightElem.text().toLowerCase().includes('unavailable') ||
                             flightElem.hasClass('unavailable') ||
                             flightElem.hasClass('sold-out');

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
            scrape_method: 'direct'
          });
        }
      } catch (err) {
        console.error('Error parsing flight element:', err.message);
      }
    });

    // Alternative parsing: look for any element with price that looks like GoWild
    if (flights.length === 0) {
      // Try to find all price elements
      $('[class*="price"], [class*="fare"], [class*="amount"]').each((i, elem) => {
        const text = $(elem).text();
        const priceMatch = text.match(/\$(\d+)/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1]);
          // GoWild fares are typically under $200
          if (price < 200) {
            console.log(`Found potential GoWild price: $${price}`);
            // Try to find parent flight container
            const parent = $(elem).closest('[class*="flight"], [class*="result"], .card, .row');
            const timeElements = parent.find('[class*="time"]');
            if (timeElements.length >= 2) {
              flights.push({
                origin,
                destination,
                date,
                departure_time: $(timeElements[0]).text().trim(),
                arrival_time: $(timeElements[1]).text().trim(),
                stops: 'Unknown',
                price,
                available: true,
                scrape_method: 'direct'
              });
            }
          }
        }
      });
    }

    console.log(`Found ${flights.length} flights via direct scraping`);

    // Debug: if no flights found, save HTML for inspection
    if (flights.length === 0) {
      const fs = require('fs');
      fs.writeFileSync('debug_output.html', html);
      console.log('No flights found. HTML saved to debug_output.html for inspection');

      // Check if page indicates no flights available
      if (html.toLowerCase().includes('no flights available') ||
          html.toLowerCase().includes('no results') ||
          html.toLowerCase().includes('sold out')) {
        console.log('Page indicates no flights available');
        return [];
      }
    }

    return flights;

  } catch (error) {
    console.error('Error scraping Frontier:', error.message);
    throw error;
  }
}

module.exports = {
  scrapeFrontierDirect
};
