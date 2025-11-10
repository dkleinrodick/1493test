const express = require('express');
const cors = require('cors');
const path = require('path');
const {
  getCachedFlights,
  upsertFlight,
  clearFlights,
  logScrape,
  getAllRoutes,
  upsertRoute,
  getRoutesByOrigin
} = require('./database');
const { scrapeFrontierDirect, initializeProxyList } = require('./scraper');
const { scrapeFrontierWithScrapfly, testScrapflyConnection } = require('./scrapfly');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Airport codes and routes data
const AIRPORTS = {
  'ATL': 'Atlanta, GA',
  'ORD': 'Chicago, IL',
  'DEN': 'Denver, CO',
  'DFW': 'Dallas, TX',
  'LAX': 'Los Angeles, CA',
  'LAS': 'Las Vegas, NV',
  'MCO': 'Orlando, FL',
  'MIA': 'Miami, FL',
  'PHX': 'Phoenix, AZ',
  'PHL': 'Philadelphia, PA',
  'CUN': 'Cancun, MX',
  'SJU': 'San Juan, PR',
  'PUJ': 'Punta Cana, Dominican Republic',
  'CLE': 'Cleveland, OH',
  'CVG': 'Cincinnati, OH',
  'BOS': 'Boston, MA',
  'BWI': 'Baltimore, MD',
  'TPA': 'Tampa, FL',
  'FLL': 'Fort Lauderdale, FL',
  'RSW': 'Fort Myers, FL',
  'DTW': 'Detroit, MI',
  'MSP': 'Minneapolis/St. Paul, MN',
  'STL': 'St. Louis, MO',
  'CLT': 'Charlotte, NC',
  'RDU': 'Raleigh, NC',
  'BUF': 'Buffalo, NY',
  'PIT': 'Pittsburgh, PA',
  'SAN': 'San Diego, CA',
  'SFO': 'San Francisco, CA',
  'SEA': 'Seattle, WA',
  'AUS': 'Austin, TX',
  'IAH': 'Houston, TX',
  'SJC': 'San Jose, CA',
  'OAK': 'Oakland, CA',
  'SAC': 'Sacramento, CA',
  'SNA': 'Santa Ana, CA',
  'ONT': 'Ontario/LA, CA',
  'BUR': 'Burbank',
  'SLC': 'Salt Lake City, UT',
  'PDX': 'Portland, OR',
  'SAT': 'San Antonio, TX',
  'JAX': 'Jacksonville, FL',
  'PBI': 'West Palm Beach, FL',
  'BDL': 'Hartford, CT',
  'MCI': 'Kansas City, MO',
  'CMH': 'Columbus, OH',
  'IND': 'Indianapolis, IN',
  'MKE': 'Milwaukee, WI',
  'OMA': 'Omaha, NE',
  'OKC': 'Oklahoma City, OK',
  'TUS': 'Tucson, AZ',
  'ELP': 'El Paso, TX',
  'ISP': 'Islip, NY',
  'TTN': 'Trenton, NJ',
  'SYR': 'Syracuse, NY',
  'GRR': 'Grand Rapids, MI',
  'DSM': 'Des Moines, IA',
  'MSY': 'New Orleans, LA',
  'BNA': 'Nashville, TN',
  'MEM': 'Memphis, TN',
  'RIC': 'Richmond',
  'ORF': 'Norfolk, VA',
  'SRQ': 'Sarasota, FL',
  'MYR': 'Myrtle Beach, SC',
  'CHS': 'Charleston, SC',
  'SAV': 'Savannah, GA',
  'PNS': 'Pensacola, FL',
  'GUA': 'Guatemala City',
  'SAP': 'San Pedro Sula',
  'SAL': 'San Salvador',
  'SJO': 'San Jose, CR',
  'PVR': 'Puerto Vallarta, Mexico',
  'CZM': 'Cozumel',
  'MBJ': 'Montego Bay, Jamaica',
  'NAS': 'Nassau',
  'AUA': 'Oranjestad, Aruba',
  'PLS': 'Providenciales',
  'SXM': 'St. Maarten',
  'STT': 'St. Thomas',
  'STX': 'Saint Croix',
  'EWR': 'Newark, NJ',
  'LGA': 'New York City, NY',
  'JFK': 'New York City, NY',
  'DCA': 'Washington, D.C.',
  'IAD': 'Washington, D.C.',
  'HPN': 'White Plains, NY',
  'PVD': 'Providence, RI',
  'BTV': 'Burlington, VT',
  'PWM': 'Portland, ME',
  'MDW': 'Chicago, IL',
  'HOU': 'Houston, TX',
  'DAL': 'Dallas, TX',
  'SJD': 'Cabo San Lucas',
  'SDQ': 'Santo Domingo',
  'POZ': 'Ponce',
  'BQN': 'Aguadilla',
  'GDL': 'Guadalajara',
  'ABE': 'Allentown, PA',
  'MDT': 'Harrisburg, PA',
  'FAR': 'Fargo, ND',
  'FSD': 'Sioux Falls, SD',
  'CID': 'Cedar Rapids, IA',
  'MSN': 'Madison, WI',
  'GRB': 'Green Bay, WI',
  'XNA': 'Bentonville/Fayetteville, AR',
  'LIT': 'Little Rock, AR',
  'TUL': 'Tulsa, OK',
  'EGE': 'Vail',
  'BOI': 'Boise, ID',
  'GEG': 'Spokane, WA',
  'MSO': 'Missoula, MT',
  'RNO': 'Reno, NV',
  'PSP': 'Palm Springs, CA',
  'TYS': 'Knoxville, TN',
  'CRP': 'Corpus Christi',
  'BDL': 'Hartford, CT',
  'ANU': 'St. John\'s, Antigua',
  'BGI': 'Bridgetown',
  'POS': 'Port-of-Spain',
  'STI': 'Santiago de los Caballeros',
  'POP': 'Puerto Plata'
};

// API Routes

// Get list of airports
app.get('/api/airports', (req, res) => {
  res.json(AIRPORTS);
});

// Get valid routes (destinations for each origin)
app.get('/api/routes', (req, res) => {
  try {
    const routeMap = getRoutesByOrigin();
    res.json(routeMap);
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
});

// Search flights
app.post('/api/search', async (req, res) => {
  const { origin, destination, date, method, useCache, useProxies, robotId } = req.body;

  // Validate inputs
  if (!origin || !destination || !date) {
    return res.status(400).json({
      error: 'Missing required fields: origin, destination, date'
    });
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: 'Invalid date format. Use YYYY-MM-DD'
    });
  }

  try {
    // Check cache first if requested
    if (useCache !== false) {
      const cachedFlights = getCachedFlights(origin, destination, date);
      if (cachedFlights.length > 0) {
        console.log(`✓ Cache hit: Returning ${cachedFlights.length} cached flight(s) for ${origin}-${destination} on ${date}`);
        console.log(`  Cached at: ${cachedFlights[0].scraped_at}`);
        return res.json({
          flights: cachedFlights,
          cached: true,
          cachedAt: cachedFlights[0].scraped_at
        });
      } else {
        console.log(`⚡ Cache miss: No cached data for ${origin}-${destination} on ${date}, scraping fresh...`);
      }
    } else {
      console.log(`⚡ Cache disabled: Scraping fresh data for ${origin}-${destination} on ${date}`);
    }

    // Scrape fresh data
    let flights = [];
    let scrapeMethod = method || 'direct';
    let error = null;

    try {
      if (scrapeMethod === 'api' || scrapeMethod === 'scrapfly') {
        flights = await scrapeFrontierWithScrapfly(origin, destination, date);
      } else {
        // Pass useProxies parameter to direct scraper
        flights = await scrapeFrontierDirect(origin, destination, date, useProxies || false);
      }

      // Clear old flights and insert new ones
      clearFlights(origin, destination, date);

      for (const flight of flights) {
        upsertFlight(flight);
      }

      // Record this route as valid if flights were found
      if (flights.length > 0) {
        upsertRoute(origin, destination);
      }

      logScrape(origin, destination, date, scrapeMethod, 'success');

    } catch (err) {
      error = err.message;
      const errorDetails = err.details || {};
      logScrape(origin, destination, date, scrapeMethod, 'error', error);

      // If direct scraping failed, try to return cached data even if old
      if (scrapeMethod === 'direct') {
        const oldCache = getCachedFlights(origin, destination, date);
        if (oldCache.length > 0) {
          return res.json({
            flights: oldCache,
            cached: true,
            error: `Fresh scraping failed: ${error}. Showing cached data.`,
            errorDetails: errorDetails,
            cachedAt: oldCache[0].scraped_at
          });
        }
      }

      throw err;
    }

    res.json({
      flights,
      cached: false,
      scrapedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Search error:', error);

    // Build detailed error response
    const errorResponse = {
      error: error.message,
      flights: [],
      details: error.details || {}
    };

    // Add helpful suggestions based on error type
    if (error.details?.type === 'blocked') {
      errorResponse.suggestion = 'Try using "Scrapfly API" mode instead of direct scraping.';
    }

    res.status(500).json(errorResponse);
  }
});

// Bulk search - search all routes from an origin airport
app.post('/api/search-bulk', async (req, res) => {
  const { origin, date, useCache, method } = req.body;

  if (!origin || !date) {
    return res.status(400).json({
      error: 'Missing required parameters: origin and date'
    });
  }

  try {
    // Get all valid destinations for this origin
    const routes = getAllRoutes();
    const destinations = routes[origin] || [];

    if (destinations.length === 0) {
      return res.status(404).json({
        error: `No known routes from ${origin}`,
        results: []
      });
    }

    console.log(`\n🔍 Bulk search: ${origin} to ${destinations.length} destinations on ${date}`);
    console.log(`Cache mode: ${useCache ? 'enabled' : 'disabled'}`);
    console.log(`Method: ${method || 'scrapfly'}`);

    const results = [];
    const scrapeMethod = method || 'api';
    const MAX_CONCURRENT = 5; // Scrapfly API limit
    let completed = 0;
    let cached = 0;
    let scraped = 0;
    let errors = 0;

    // Process destinations with concurrency limit
    async function processBatch(destBatch) {
      const promises = destBatch.map(async (destination) => {
        try {
          // Check cache first if enabled
          let cachedFlights = [];
          let usedCache = false;

          if (useCache !== false) {
            cachedFlights = getCachedFlights(origin, destination, date);
            if (cachedFlights.length > 0) {
              console.log(`  ✓ ${origin}-${destination}: ${cachedFlights.length} flight(s) from cache`);
              cached++;
              completed++;
              usedCache = true;

              return {
                origin,
                destination,
                flights: cachedFlights,
                cached: true,
                cachedAt: cachedFlights[0].scraped_at
              };
            } else {
              console.log(`  ⚡ ${origin}-${destination}: No cache found, scraping fresh...`);
            }
          }

          // No cache OR cache disabled - scrape fresh data
          let flights = [];
          try {
            if (scrapeMethod === 'api' || scrapeMethod === 'scrapfly') {
              flights = await scrapeFrontierWithScrapfly(origin, destination, date);
            } else {
              flights = await scrapeFrontierDirect(origin, destination, date, false);
            }

            // Save to database
            clearFlights(origin, destination, date);
            for (const flight of flights) {
              upsertFlight(flight);
            }

            console.log(`  ✓ ${origin}-${destination}: ${flights.length} flight(s) scraped fresh`);
            scraped++;
            completed++;

            return {
              origin,
              destination,
              flights,
              cached: false,
              scrapedAt: new Date().toISOString()
            };

          } catch (scrapeError) {
            console.error(`  ✗ ${origin}-${destination}: ${scrapeError.message}`);
            errors++;
            completed++;

            return {
              origin,
              destination,
              flights: [],
              error: scrapeError.message,
              cached: false
            };
          }

        } catch (error) {
          console.error(`  ✗ ${origin}-${destination}: ${error.message}`);
          errors++;
          completed++;

          return {
            origin,
            destination,
            flights: [],
            error: error.message,
            cached: false
          };
        }
      });

      return Promise.all(promises);
    }

    // Process in batches of MAX_CONCURRENT
    for (let i = 0; i < destinations.length; i += MAX_CONCURRENT) {
      const batch = destinations.slice(i, i + MAX_CONCURRENT);
      console.log(`\nProcessing batch ${Math.floor(i / MAX_CONCURRENT) + 1}/${Math.ceil(destinations.length / MAX_CONCURRENT)} (${batch.join(', ')})`);

      const batchResults = await processBatch(batch);
      results.push(...batchResults);

      console.log(`Progress: ${completed}/${destinations.length} routes (${cached} cached, ${scraped} scraped, ${errors} errors)`);
    }

    // Calculate total flights found
    const totalFlights = results.reduce((sum, r) => sum + r.flights.length, 0);

    console.log(`\n✓ Bulk search complete!`);
    console.log(`  Total routes checked: ${destinations.length}`);
    console.log(`  Total flights found: ${totalFlights}`);
    console.log(`  From cache: ${cached}`);
    console.log(`  Freshly scraped: ${scraped}`);
    console.log(`  Errors: ${errors}\n`);

    res.json({
      origin,
      date,
      totalRoutes: destinations.length,
      totalFlights,
      cached,
      scraped,
      errors,
      results
    });

  } catch (error) {
    console.error('Bulk search error:', error);
    res.status(500).json({
      error: error.message,
      results: []
    });
  }
});

// Get all cached routes
app.get('/api/routes', (req, res) => {
  try {
    const routes = getAllRoutes();
    res.json(routes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test Scrapfly connection
app.get('/api/test-scrapfly', async (req, res) => {
  try {
    const result = await testScrapflyConnection();
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Auto-seed routes on startup if database is empty
async function autoSeedRoutes() {
  try {
    const routes = getAllRoutes();
    const routeCount = Object.keys(routes).length;

    if (routeCount === 0) {
      console.log('📋 Routes table is empty - auto-seeding Frontier routes...');

      // Import seed function
      const { seedRoutes } = require('./seed-routes');
      const seeded = await seedRoutes();

      console.log(`✓ Auto-seeded ${seeded} routes to database`);
    } else {
      console.log(`✓ Found ${routeCount} origins with routes in database`);
    }
  } catch (error) {
    console.error('⚠ Failed to auto-seed routes:', error.message);
    console.log('You can manually seed routes by running: node seed-routes.js');
  }
}

// Start server
async function startServer() {
  try {
    // Initialize proxy list on startup
    console.log('🚀 Starting Frontier GoWild Scraper...');
    await initializeProxyList();

    // Auto-seed routes if needed
    await autoSeedRoutes();
    console.log('');

    // Start listening
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
