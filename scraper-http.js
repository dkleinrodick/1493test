/**
 * Simple HTTP-based scraper for Frontier GoWild flights
 * No browser automation - just direct HTTP requests
 *
 * This approach is much faster IF it works, but Frontier has bot protection
 * that may block simple HTTP requests (403 Forbidden).
 */

const axios = require('axios');
const he = require('he');

// Try multiple HTTP strategies to bypass bot detection
const strategies = {
  // Strategy 1: Minimal headers (as per instructions)
  minimal: (url) => {
    return axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 30000
    });
  },

  // Strategy 2: Comprehensive browser headers
  comprehensive: (url) => {
    return axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Connection': 'keep-alive'
      },
      timeout: 30000
    });
  },

  // Strategy 3: With referer (pretend we came from their site)
  withReferer: (url) => {
    return axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.flyfrontier.com/',
        'Origin': 'https://www.flyfrontier.com',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000
    });
  }
};

async function scrapeFrontierHTTP(origin, destination, date, strategyName = 'comprehensive') {
  const url = `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${origin}&d1=${destination}&dd1=${date}&adt=1&umnr=false&loy=false&mon=true&ftype=GW`;

  console.log(`\n🔍 HTTP scraping (${strategyName}): ${origin} → ${destination} on ${date}`);

  try {
    const strategy = strategies[strategyName] || strategies.comprehensive;
    const response = await strategy(url);

    const html = response.data;
    console.log(`✓ Received HTML (${html.length} characters, status: ${response.status})`);

    // Extract FlightData using regex
    const regex = /FlightData\s*=\s*['"]({.*?})['"];/s;
    const match = html.match(regex);

    if (!match) {
      console.log('❌ FlightData variable not found in HTML');

      // Try alternative patterns
      const altRegex1 = /var\s+FlightData\s*=\s*['"]({.*?})['"];/s;
      const altMatch1 = html.match(altRegex1);

      if (altMatch1) {
        console.log('✓ Found FlightData with "var" prefix');
        return parseFlightData(altMatch1[1], origin, destination, date);
      }

      return { flights: [], error: 'FlightData not found in response' };
    }

    console.log('✓ Found FlightData variable');
    return parseFlightData(match[1], origin, destination, date);

  } catch (error) {
    if (error.response) {
      console.error(`❌ HTTP ${error.response.status}: ${error.response.statusText}`);
      return {
        flights: [],
        error: `HTTP ${error.response.status}`,
        blocked: error.response.status === 403
      };
    } else {
      console.error(`❌ Error: ${error.message}`);
      return { flights: [], error: error.message };
    }
  }
}

function parseFlightData(encodedJson, origin, destination, date) {
  try {
    // Decode all HTML entities
    const cleanedJson = he.decode(encodedJson);
    const flightData = JSON.parse(cleanedJson);

    console.log('✓ Successfully parsed FlightData JSON');

    // Extract GoWild flights
    const flights = [];
    let flightIndex = 0;

    for (const journey of flightData.journeys || []) {
      for (const flight of journey.flights || []) {
        flightIndex++;

        if (!flight.isGoWildFareEnabled || flight.isGoWildFareEnabled !== true) {
          continue;
        }

        const goWildFare = flight.goWildFare;
        if (!goWildFare || goWildFare <= 0) {
          continue;
        }

        const duration = flight.durationFormatted || flight.duration || 'Unknown';
        const stopsText = flight.stopsText || 'Unknown';
        const goWildFareKey = flight.goWildFareKey || '';

        let departureTime = 'N/A';
        let arrivalTime = 'N/A';
        const segments = [];

        if (flight.legs && Array.isArray(flight.legs) && flight.legs.length > 0) {
          const firstLeg = flight.legs[0];
          departureTime = firstLeg.departureDateFormatted || firstLeg.departureTime || 'N/A';

          const lastLeg = flight.legs[flight.legs.length - 1];
          arrivalTime = lastLeg.arrivalDateFormatted || lastLeg.arrivalTime || 'N/A';

          for (const leg of flight.legs) {
            segments.push({
              flightNumber: leg.flightNumber,
              from: leg.departureStation || 'N/A',
              to: leg.arrivalStation || 'N/A',
              departure_time: leg.departureDateFormatted || leg.departureTime || 'N/A',
              arrival_time: leg.arrivalDateFormatted || leg.arrivalTime || 'N/A',
              duration: leg.durationFormatted || leg.duration || 'N/A'
            });
          }
        }

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
          scrape_method: 'http'
        });

        console.log(`  ✓ GoWild: $${goWildFare} (${duration}, ${stopsText})`);
      }
    }

    console.log(`✓ Found ${flights.length} GoWild flight(s)`);
    return { flights, error: null };

  } catch (error) {
    console.error(`❌ Parse error: ${error.message}`);
    return { flights: [], error: `Parse error: ${error.message}` };
  }
}

// Test all strategies to find one that works
async function testAllStrategies(origin, destination, date) {
  console.log('='.repeat(80));
  console.log('🧪 Testing all HTTP strategies to bypass bot detection');
  console.log('='.repeat(80));

  const strategyNames = Object.keys(strategies);

  for (const strategyName of strategyNames) {
    console.log(`\nTrying strategy: ${strategyName}`);
    const result = await scrapeFrontierHTTP(origin, destination, date, strategyName);

    if (!result.error && result.flights.length > 0) {
      console.log(`✅ SUCCESS with ${strategyName} strategy!`);
      return { strategyName, result };
    }

    if (result.blocked) {
      console.log(`🚫 Blocked (403) with ${strategyName} strategy`);
    }

    // Wait between attempts to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n❌ All strategies failed - Frontier is blocking HTTP requests');
  console.log('💡 Recommendation: Use Scrapfly API instead');
  return null;
}

module.exports = {
  scrapeFrontierHTTP,
  testAllStrategies
};

// Run test if executed directly
if (require.main === module) {
  const origin = process.argv[2] || 'ORD';
  const destination = process.argv[3] || 'CUN';
  const date = process.argv[4] || '2025-11-15';

  testAllStrategies(origin, destination, date)
    .then(result => {
      if (result) {
        console.log('\n✓ Found working strategy:', result.strategyName);
        console.log('Sample result:', JSON.stringify(result.result.flights[0], null, 2));
      }
      process.exit(result ? 0 : 1);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}
