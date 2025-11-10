const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const db = new Database(path.join(__dirname, 'flights.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS flights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    date TEXT NOT NULL,
    departure_time TEXT,
    arrival_time TEXT,
    stops TEXT,
    duration TEXT,
    price REAL,
    available INTEGER DEFAULT 1,
    scrape_method TEXT,
    scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(origin, destination, date, departure_time)
  );

  CREATE TABLE IF NOT EXISTS scrape_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    date TEXT NOT NULL,
    method TEXT,
    status TEXT,
    error TEXT,
    scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    flight_count INTEGER DEFAULT 0,
    UNIQUE(origin, destination)
  );

  CREATE INDEX IF NOT EXISTS idx_route_date ON flights(origin, destination, date);
  CREATE INDEX IF NOT EXISTS idx_scraped_at ON flights(scraped_at);
  CREATE INDEX IF NOT EXISTS idx_routes_origin ON routes(origin);
`);

// Add duration column if it doesn't exist (migration)
try {
  db.exec(`ALTER TABLE flights ADD COLUMN duration TEXT`);
  console.log('Added duration column to flights table');
} catch (error) {
  // Column already exists, ignore error
}

// Database functions
const db_functions = {
  // Get cached flights (within last 6 hours)
  getCachedFlights: (origin, destination, date) => {
    const stmt = db.prepare(`
      SELECT * FROM flights
      WHERE origin = ? AND destination = ? AND date = ?
      AND datetime(scraped_at) > datetime('now', '-6 hours')
      ORDER BY departure_time
    `);
    return stmt.all(origin, destination, date);
  },

  // Insert or update flight
  upsertFlight: (flight) => {
    const stmt = db.prepare(`
      INSERT INTO flights (origin, destination, date, departure_time, arrival_time, stops, duration, price, available, scrape_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(origin, destination, date, departure_time)
      DO UPDATE SET
        arrival_time = excluded.arrival_time,
        stops = excluded.stops,
        duration = excluded.duration,
        price = excluded.price,
        available = excluded.available,
        scrape_method = excluded.scrape_method,
        scraped_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(
      flight.origin,
      flight.destination,
      flight.date,
      flight.departure_time,
      flight.arrival_time,
      flight.stops,
      flight.duration || null,
      flight.price,
      flight.available ? 1 : 0,
      flight.scrape_method
    );
  },

  // Clear old flights for a route/date before inserting new ones
  clearFlights: (origin, destination, date) => {
    const stmt = db.prepare(`
      DELETE FROM flights
      WHERE origin = ? AND destination = ? AND date = ?
    `);
    return stmt.run(origin, destination, date);
  },

  // Log scrape attempt
  logScrape: (origin, destination, date, method, status, error = null) => {
    const stmt = db.prepare(`
      INSERT INTO scrape_log (origin, destination, date, method, status, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(origin, destination, date, method, status, error);
  },

  // Get all routes
  getAllRoutes: () => {
    const stmt = db.prepare(`
      SELECT DISTINCT origin, destination FROM flights
      ORDER BY origin, destination
    `);
    return stmt.all();
  },

  // Add or update a route (called when flights are found)
  upsertRoute: (origin, destination) => {
    const stmt = db.prepare(`
      INSERT INTO routes (origin, destination, flight_count)
      VALUES (?, ?, 1)
      ON CONFLICT(origin, destination)
      DO UPDATE SET
        last_seen = CURRENT_TIMESTAMP,
        flight_count = flight_count + 1
    `);
    return stmt.run(origin, destination);
  },

  // Get valid destinations for an origin
  getDestinationsForOrigin: (origin) => {
    const stmt = db.prepare(`
      SELECT destination, last_seen, flight_count
      FROM routes
      WHERE origin = ?
      ORDER BY destination
    `);
    return stmt.all(origin);
  },

  // Get all known routes with metadata
  getKnownRoutes: () => {
    const stmt = db.prepare(`
      SELECT origin, destination, first_seen, last_seen, flight_count
      FROM routes
      ORDER BY origin, destination
    `);
    return stmt.all();
  },

  // Get routes organized by origin (returns map)
  getRoutesByOrigin: () => {
    const stmt = db.prepare(`
      SELECT origin, destination
      FROM routes
      ORDER BY origin, destination
    `);
    const routes = stmt.all();

    // Organize into map
    const routeMap = {};
    routes.forEach(route => {
      if (!routeMap[route.origin]) {
        routeMap[route.origin] = [];
      }
      routeMap[route.origin].push(route.destination);
    });

    return routeMap;
  },

  // Check if a route is known
  isRouteKnown: (origin, destination) => {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM routes
      WHERE origin = ? AND destination = ?
    `);
    const result = stmt.get(origin, destination);
    return result.count > 0;
  }
};

module.exports = { db, ...db_functions };
