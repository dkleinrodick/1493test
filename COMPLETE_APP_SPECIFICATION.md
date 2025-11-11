# Frontier GoWild Flight Scraper - Complete Application Specification

## 🎯 Application Purpose

A full-stack web application that scrapes Frontier Airlines' booking website to extract GoWild fare prices using intelligent proxy rotation with automatic bot detection, blacklisting, and cooldown management.

**Key Value Proposition:**
- Scrapes JavaScript-protected Frontier Airlines pages (protected by PerimeterX)
- Manages pool of user-provided premium proxies
- Automatically detects and handles bot detection
- Provides clean UI for flight search and proxy management
- Caches results to reduce scraping load

---

## 📋 Technology Stack

### Backend
- **Runtime:** Node.js (v16+)
- **Framework:** Express.js
- **Database:** SQLite3 (2 databases: flights.db, proxies.db)
- **Scraping:**
  - Playwright (Chromium headless browser)
  - playwright-extra (stealth plugins)
  - puppeteer-extra-plugin-stealth
- **HTML Parsing:** Cheerio
- **HTTP:** Axios (minimal use)

### Frontend
- **Pure HTML/CSS/JavaScript** (no frameworks)
- Single Page Application (SPA)
- Fetch API for AJAX requests
- Custom CSS with gradient styling

### Dependencies (package.json)
```json
{
  "name": "frontier-gowild-scraper",
  "version": "2.0.0",
  "description": "Frontier Airlines GoWild fare scraper with intelligent proxy management",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "sqlite3": "^5.1.7",
    "playwright": "^1.40.0",
    "playwright-extra": "^4.3.6",
    "puppeteer-extra-plugin-stealth": "^2.11.2",
    "cheerio": "^1.0.0-rc.12"
  }
}
```

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        USER BROWSER                          │
│                   (Frontend - index.html)                    │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP/JSON API
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                    EXPRESS.JS SERVER                         │
│                      (server.js)                             │
│  Endpoints: /api/search, /api/proxies, /api/proxy-stats     │
└───┬──────────────┬───────────────┬──────────────────────┬───┘
    │              │               │                      │
    ▼              ▼               ▼                      ▼
┌─────────┐  ┌──────────┐  ┌────────────┐     ┌──────────────┐
│Database │  │  Scraper │  │   Proxy    │     │   Premium    │
│Module   │  │  Module  │  │  Manager   │     │   Proxies    │
│         │  │          │  │            │     │   (Editable) │
└─────────┘  └────┬─────┘  └─────┬──────┘     └──────────────┘
    │             │               │
    │         ┌───┴───────────────┴────┐
    │         │                        │
    ▼         ▼                        ▼
┌─────────────────┐          ┌─────────────────┐
│  flights.db     │          │   proxies.db    │
│                 │          │                 │
│ Tables:         │          │ Tables:         │
│ - flights       │          │ - proxy_states  │
│ - scrape_log    │          └─────────────────┘
└─────────────────┘

         ┌────────────────────┐
         │   Playwright       │
         │   + Stealth        │
         │   + Proxy Rotation │
         └────────┬───────────┘
                  │
                  ▼
         ┌────────────────────┐
         │  Frontier Airlines │
         │  (PerimeterX)      │
         └────────────────────┘
```

---

## 📂 Complete File Structure

```
frontier-scraper/
├── server.js                    # Main Express server (350 lines)
├── database.js                  # SQLite operations for flights.db
├── proxy-manager.js             # NEW: Intelligent proxy state management
├── scraper.js                   # Playwright scraper with bot detection
├── premium-proxies.js           # Default proxy list (user-editable)
├── package.json                 # Dependencies
├── package-lock.json
├── .gitignore
├── README.md
│
├── public/
│   └── index.html               # Frontend SPA (800+ lines with proxy UI)
│
├── flights.db                   # Auto-created SQLite database
├── proxies.db                   # Auto-created SQLite database
│
├── test-proxy-manager.js        # Test proxy state management
├── test-scraper-with-proxy.js   # Test scraping with proxy
└── test-bot-detection.js        # Test bot detection logic
```

---

## 🗄️ Database Schema

### Database 1: flights.db

**Table: flights**
```sql
CREATE TABLE flights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  date TEXT NOT NULL,                  -- YYYY-MM-DD
  departure_time TEXT,
  arrival_time TEXT,
  stops TEXT,
  price REAL,
  duration TEXT,
  available INTEGER DEFAULT 1,         -- 1 = available, 0 = sold out
  scrape_method TEXT,                  -- always "direct"
  scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(origin, destination, date, departure_time, price)
);

CREATE INDEX idx_route_date ON flights(origin, destination, date);
CREATE INDEX idx_scraped_at ON flights(scraped_at);
```

**Table: scrape_log**
```sql
CREATE TABLE scrape_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin TEXT,
  destination TEXT,
  date TEXT,
  method TEXT,                          -- always "direct"
  status TEXT,                          -- "success" or "error"
  error_message TEXT,
  proxy_used TEXT,                      -- IP:PORT of proxy used
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scrape_date ON scrape_log(created_at);
```

### Database 2: proxies.db

**Table: proxy_states**
```sql
CREATE TABLE proxy_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proxy TEXT UNIQUE NOT NULL,           -- Format: "IP:PORT"
  state TEXT NOT NULL DEFAULT 'active', -- active, cooldown, blacklisted

  -- Usage tracking
  last_used DATETIME,
  last_success DATETIME,
  last_error TEXT,

  -- Statistics
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  bot_detections INTEGER DEFAULT 0,
  total_requests INTEGER DEFAULT 0,

  -- State management
  cooldown_until DATETIME,              -- ISO timestamp when cooldown ends
  blacklisted_at DATETIME,
  blacklist_reason TEXT,                -- 403_forbidden, connection_failed, etc.

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_proxy ON proxy_states(proxy);
CREATE INDEX idx_state ON proxy_states(state);
CREATE INDEX idx_cooldown_until ON proxy_states(cooldown_until);
CREATE INDEX idx_last_used ON proxy_states(last_used);
```

---

## 🔧 Core Modules

### 1. server.js - Express Server

**Port:** 3000 (configurable via PORT env variable)

**Middleware:**
- `cors()` - Enable CORS
- `express.json()` - Parse JSON bodies
- `express.static('public')` - Serve frontend

**API Endpoints:**

#### GET /api/airports
Returns list of 140+ airport codes
```json
{
  "ORD": "Chicago, IL",
  "CUN": "Cancun, MX",
  "LAX": "Los Angeles, CA",
  ...
}
```

#### POST /api/search
Main flight search endpoint
```javascript
// Request
{
  "origin": "ORD",
  "destination": "CUN",
  "date": "2025-12-01",
  "useCache": true
}

// Response (success)
{
  "flights": [
    {
      "origin": "ORD",
      "destination": "CUN",
      "date": "2025-12-01",
      "departure_time": "10:30 AM",
      "arrival_time": "2:45 PM",
      "stops": "Nonstop",
      "price": 89,
      "duration": "4h 15m",
      "available": true,
      "scrape_method": "direct"
    }
  ],
  "cached": false,
  "scrapedAt": "2025-11-11T20:00:00.000Z",
  "proxyUsed": "104.207.44.112:3129"
}

// Response (error)
{
  "error": "No available proxies",
  "details": {
    "active": 0,
    "cooldown": 12,
    "blacklisted": 35
  }
}
```

#### GET /api/proxies
Get all proxies with their states
```json
[
  {
    "id": 1,
    "proxy": "104.207.44.112:3129",
    "state": "active",
    "success_count": 45,
    "error_count": 2,
    "bot_detections": 1,
    "total_requests": 48,
    "last_used": "2025-11-11T19:55:00.000Z",
    "cooldown_until": null,
    "blacklist_reason": null
  },
  ...
]
```

#### POST /api/proxies
Update entire proxy list
```javascript
// Request
{
  "proxies": [
    "104.207.44.112:3129",
    "104.167.25.173:3129",
    ...
  ]
}

// Response
{
  "success": true,
  "added": 5,
  "removed": 2,
  "total": 47
}
```

#### POST /api/proxies/add
Add single proxy
```javascript
// Request
{
  "proxy": "192.168.1.1:3129"
}

// Response
{
  "success": true,
  "proxy": "192.168.1.1:3129"
}
```

#### DELETE /api/proxies/:proxy
Delete single proxy (URL encode the proxy)
```
DELETE /api/proxies/104.207.44.112%3A3129
```

#### GET /api/proxy-stats
Get proxy statistics
```json
{
  "total": 47,
  "active": 35,
  "cooldown": 8,
  "blacklisted": 4,
  "activePercentage": 74.5,
  "successRate": 82.3
}
```

#### POST /api/proxies/clear-blacklist
Clear all blacklisted proxies (reset to active)
```json
{
  "success": true,
  "cleared": 4
}
```

#### POST /api/proxies/reset-cooldowns
Manually reset all cooldowns
```json
{
  "success": true,
  "reset": 8
}
```

#### GET /api/health
Health check endpoint
```json
{
  "status": "ok",
  "uptime": 3600,
  "timestamp": "2025-11-11T20:00:00.000Z"
}
```

---

### 2. proxy-manager.js - Intelligent Proxy Management

**Class: ProxyManager**

```javascript
class ProxyManager {
  constructor(dbPath = './proxies.db') {
    this.db = new Database(dbPath);
    this.initializeDatabase();
  }

  // Database initialization
  initializeDatabase() {
    // Create proxy_states table with schema above
  }

  // ========== PROXY SELECTION ==========

  async getNextAvailableProxy() {
    // 1. Check and reset expired cooldowns first
    await this.checkCooldownExpiration();

    // 2. Get all active proxies (state = 'active')
    // 3. If no active proxies, throw error
    // 4. Select random proxy from active pool
    // 5. Return proxy object

    /* Returns:
    {
      proxy: "104.207.44.112:3129",
      state: "active",
      success_count: 45,
      ...
    }
    */
  }

  // ========== STATE MANAGEMENT ==========

  async markProxySuccess(proxy) {
    // 1. Increment success_count
    // 2. Increment total_requests
    // 3. Set error_count = 0 (reset on success)
    // 4. Set last_used = NOW
    // 5. Set last_success = NOW
    // 6. Set updated_at = NOW
  }

  async markProxyBotDetected(proxy) {
    // 1. Increment bot_detections
    // 2. Increment total_requests
    // 3. Set state = 'cooldown'
    // 4. Set cooldown_until = NOW + 5 minutes
    // 5. Set last_error = "Bot detected"
    // 6. Set last_used = NOW
    // 7. Set updated_at = NOW

    // 8. CHECK: If bot_detections >= 5, blacklist instead
    if (bot_detections >= 5) {
      await this.markProxyBlacklisted(proxy, 'excessive_bot_detections');
    }
  }

  async markProxyBlacklisted(proxy, reason) {
    // 1. Set state = 'blacklisted'
    // 2. Set blacklisted_at = NOW
    // 3. Set blacklist_reason = reason
    // 4. Set cooldown_until = NULL
    // 5. Set last_error = reason
    // 6. Set updated_at = NOW

    /* Reasons:
       - 403_forbidden
       - connection_failed
       - excessive_bot_detections
       - proxy_authentication_failed
       - timeout
    */
  }

  async markProxyError(proxy, errorMessage) {
    // 1. Increment error_count
    // 2. Increment total_requests
    // 3. Set last_error = errorMessage
    // 4. Set last_used = NOW
    // 5. Set updated_at = NOW

    // 6. CHECK: If error_count >= 3, blacklist
    if (error_count >= 3) {
      await this.markProxyBlacklisted(proxy, 'excessive_errors');
    }
  }

  // ========== COOLDOWN MANAGEMENT ==========

  async checkCooldownExpiration() {
    // 1. Find all proxies with state = 'cooldown' AND cooldown_until <= NOW
    // 2. For each expired cooldown:
    //    - Set state = 'active'
    //    - Set cooldown_until = NULL
    //    - Set updated_at = NOW
  }

  async resetProxyCooldown(proxy) {
    // Manual reset for specific proxy
    // Set state = 'active', cooldown_until = NULL
  }

  async resetAllCooldowns() {
    // Reset all cooldown proxies to active
  }

  // ========== BLACKLIST MANAGEMENT ==========

  async clearBlacklist() {
    // Reset all blacklisted proxies to active
    // Set state = 'active', blacklist_reason = NULL, blacklisted_at = NULL
  }

  async removeProxy(proxy) {
    // Delete proxy from database
  }

  // ========== PROXY MANAGEMENT ==========

  async addProxy(proxy) {
    // Insert new proxy with state = 'active'
    // If already exists, do nothing
  }

  async updateProxyList(proxyArray) {
    // 1. Get current proxies from DB
    // 2. Find proxies to add (in array but not in DB)
    // 3. Find proxies to remove (in DB but not in array)
    // 4. Add new proxies with state = 'active'
    // 5. Remove old proxies
    // 6. Return counts
  }

  // ========== QUERIES ==========

  async getAllProxies() {
    // Return all proxies with full state
  }

  async getActiveProxies() {
    // Return proxies where state = 'active'
  }

  async getCooldownProxies() {
    // Return proxies where state = 'cooldown'
  }

  async getBlacklistedProxies() {
    // Return proxies where state = 'blacklisted'
  }

  async getProxyStatus(proxy) {
    // Return single proxy state
  }

  async getStats() {
    // Return summary statistics
    /* Returns:
    {
      total: 47,
      active: 35,
      cooldown: 8,
      blacklisted: 4,
      totalRequests: 1234,
      totalSuccesses: 1015,
      totalErrors: 219,
      successRate: 82.3
    }
    */
  }

  // ========== CLEANUP ==========

  close() {
    // Close database connection
  }
}

module.exports = ProxyManager;
```

**Proxy State Machine:**

```
        ┌──────────┐
        │  ACTIVE  │
        └────┬─────┘
             │
    ┌────────┼────────┐
    │        │        │
    ▼        ▼        ▼
403/ERR   BOT     SUCCESS
    │        │        │
    ▼        ▼        └──────┐
┌──────┐ ┌────────┐         │
│BLACK │ │COOLDOWN│         │
│LISTED│ │(5 min) │         │
└──────┘ └────┬───┘         │
    ▲         │             │
    │    ┌────┴──────┐      │
    │    │           │      │
    │    ▼           ▼      │
    │ 5 min      Bot Det    │
    │ expires    >= 5       │
    │    │           │      │
    │    ▼           │      │
    │ ┌──────────┐  │      │
    └─┤  ACTIVE  │◄─┘      │
      └──────────┘◄─────────┘
```

---

### 3. scraper.js - Playwright Scraper with Bot Detection

**Main Function:**

```javascript
async function scrapeFrontierDirect(origin, destination, date, options = {}) {
  const proxyManager = options.proxyManager; // Required
  const maxRetries = options.maxRetries || 5;
  const timeout = options.timeout || 60000;

  let attempts = 0;
  let lastError = null;

  // Retry loop
  while (attempts < maxRetries) {
    attempts++;
    console.log(`\n=== Attempt ${attempts}/${maxRetries} ===`);

    // Get next available proxy
    let selectedProxy;
    try {
      selectedProxy = await proxyManager.getNextAvailableProxy();
    } catch (error) {
      throw new Error('No available proxies. All are blacklisted or in cooldown.');
    }

    console.log(`Using proxy: ${selectedProxy.proxy}`);
    console.log(`Proxy stats: ${selectedProxy.success_count} successes, ${selectedProxy.bot_detections} bot detections`);

    let browser;
    try {
      // ========== STEP 1: Launch Browser ==========
      browser = await chromium.launch({
        headless: true,
        proxy: {
          server: `http://${selectedProxy.proxy}`
        },
        args: [
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        ignoreHTTPSErrors: true
      });

      const page = await context.newPage();

      // ========== STEP 2: Navigate to URL ==========
      const url = `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${origin}&d1=${destination}&dd1=${date}&adt=1&umnr=false&loy=false&mon=true&ftype=GW`;

      console.log(`Navigating to: ${url}`);
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: timeout
      });

      // ========== CHECK 1: HTTP Status ==========
      const status = response.status();
      console.log(`HTTP Status: ${status}`);

      if (status === 403) {
        console.log('❌ 403 Forbidden - Blacklisting proxy');
        await proxyManager.markProxyBlacklisted(selectedProxy.proxy, '403_forbidden');
        await browser.close();
        continue; // Try next proxy
      }

      // ========== STEP 3: Wait for Flight Container ==========
      // This is the CRITICAL step - wait for .ibe-flight-info
      // This confirms JavaScript has executed and page is rendered
      console.log('Waiting for .ibe-flight-info selector...');

      try {
        await page.waitForSelector('.ibe-flight-info', { timeout: 30000 });
        console.log('✓ Flight container found!');
      } catch (timeoutError) {
        console.log('⚠️ .ibe-flight-info not found - checking for bot detection...');

        // Get page content and title for analysis
        const pageContent = await page.content();
        const pageTitle = await page.title();

        // ========== CHECK 2: Bot Detection Patterns ==========
        const botDetected = detectBotProtection(pageContent, pageTitle);

        if (botDetected.detected) {
          console.log(`🤖 Bot detected: ${botDetected.reason}`);
          console.log('Setting proxy cooldown for 5 minutes');

          // Save debug output
          const debugFilename = `bot_detected_${selectedProxy.proxy.replace(/[:.]/g, '_')}_${Date.now()}.html`;
          fs.writeFileSync(debugFilename, pageContent);
          console.log(`Debug HTML saved: ${debugFilename}`);

          await proxyManager.markProxyBotDetected(selectedProxy.proxy);
          await browser.close();
          continue; // Try next proxy immediately
        }

        // No bot detected, but element not found - other issue
        console.log('❌ Unknown error - element not found but no bot detected');
        await proxyManager.markProxyError(selectedProxy.proxy, 'Element not found');
        await browser.close();
        lastError = timeoutError;
        continue;
      }

      // ========== STEP 4: Extract HTML Content ==========
      console.log('Extracting page content...');
      const htmlContent = await page.content();

      // Save output for debugging
      fs.writeFileSync('latest_scrape_output.html', htmlContent);
      await page.screenshot({ path: 'latest_scrape_screenshot.png' });
      console.log('✓ Debug files saved');

      await browser.close();

      // ========== STEP 5: Parse Flight Data ==========
      console.log('Parsing flight data...');
      const flights = parseFlightsFromHTML(htmlContent, origin, destination, date);

      if (flights.length >= 0) {
        // Success (even if 0 flights found)
        console.log(`✅ Success! Found ${flights.length} flights`);
        await proxyManager.markProxySuccess(selectedProxy.proxy);
        return flights;
      }

    } catch (error) {
      // Browser/network errors
      if (browser) {
        await browser.close();
      }

      console.error(`Error: ${error.message}`);

      // ========== CHECK 3: Connection Errors ==========
      if (error.message.includes('ERR_PROXY_CONNECTION_FAILED') ||
          error.message.includes('ERR_TUNNEL_CONNECTION_FAILED') ||
          error.message.includes('net::ERR_CONNECTION_REFUSED')) {
        console.log('❌ Proxy connection failed - Blacklisting');
        await proxyManager.markProxyBlacklisted(selectedProxy.proxy, 'connection_failed');
        continue;
      }

      // ========== CHECK 4: Timeout Errors ==========
      if (error.message.includes('Timeout') || error.message.includes('timeout')) {
        console.log('⏱️ Timeout - marking error');
        await proxyManager.markProxyError(selectedProxy.proxy, 'timeout');
        lastError = error;
        continue;
      }

      // Generic error
      await proxyManager.markProxyError(selectedProxy.proxy, error.message);
      lastError = error;
    }
  }

  // All retries exhausted
  throw new Error(`Failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown'}`);
}
```

**Bot Detection Function:**

```javascript
function detectBotProtection(pageContent, pageTitle) {
  // Pattern 1: PerimeterX CAPTCHA
  if (pageContent.includes('px-captcha') ||
      pageContent.includes('_pxCaptcha') ||
      pageContent.includes('pxApps')) {
    return { detected: true, reason: 'perimeterx_captcha' };
  }

  // Pattern 2: Access Denied Message
  if (pageContent.includes('Access to this page has been denied') ||
      pageContent.includes('access to this page has been blocked')) {
    return { detected: true, reason: 'access_denied_message' };
  }

  // Pattern 3: Page Title
  if (pageTitle.toLowerCase().includes('access denied') ||
      pageTitle.toLowerCase().includes('blocked')) {
    return { detected: true, reason: 'access_denied_title' };
  }

  // Pattern 4: PerimeterX Script
  if (pageContent.includes('PerimeterX') ||
      pageContent.includes('perimeterx')) {
    return { detected: true, reason: 'perimeterx_script' };
  }

  // Pattern 5: Human Verification
  if (pageContent.includes('Please verify you are a human') ||
      pageContent.includes('verify that you are human') ||
      pageContent.includes('are you a robot')) {
    return { detected: true, reason: 'human_verification' };
  }

  // Pattern 6: Cloudflare Challenge
  if (pageContent.includes('Checking your browser') ||
      pageContent.includes('cf-browser-verification')) {
    return { detected: true, reason: 'cloudflare_challenge' };
  }

  return { detected: false };
}
```

**HTML Parsing Function:**

```javascript
function parseFlightsFromHTML(html, origin, destination, date) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);

  let flightDataJSON = null;

  // Method 1: Look for injected element (if we injected it)
  const extractedData = $('#extracted-flight-data').text();
  if (extractedData) {
    try {
      let jsonString = extractedData.replace(/&quot;/g, '"');
      flightDataJSON = JSON.parse(jsonString);
      console.log('✓ Parsed FlightData from injected element');
    } catch (e) {
      console.log('✗ Failed to parse injected FlightData');
    }
  }

  // Method 2: Search script tags for FlightData variable
  if (!flightDataJSON) {
    console.log('Searching script tags for FlightData...');

    $('script').each((i, elem) => {
      const scriptContent = $(elem).html();

      if (scriptContent && scriptContent.includes('FlightData')) {
        // Match: FlightData = '{ ... }';
        const match = scriptContent.match(/FlightData\s*=\s*['"]({[^'"]+})['"]/);

        if (match && match[1]) {
          let jsonString = match[1];
          jsonString = jsonString.replace(/&quot;/g, '"');

          try {
            flightDataJSON = JSON.parse(jsonString);
            console.log('✓ Parsed FlightData from script tag');
          } catch (e) {
            console.log('✗ Failed to parse FlightData JSON');
          }
        }
      }
    });
  }

  if (!flightDataJSON) {
    console.log('⚠️ FlightData not found');
    return [];
  }

  // Parse flights from JSON structure
  const flights = [];

  for (const journey of flightDataJSON.journeys || []) {
    for (const flight of journey.flights || []) {
      const goWildFare = flight.goWildFare;

      // Only include flights with GoWild fares
      if (!goWildFare || goWildFare <= 0) {
        continue;
      }

      flights.push({
        origin,
        destination,
        date,
        departure_time: flight.departureTime || flight.depTime || 'N/A',
        arrival_time: flight.arrivalTime || flight.arrTime || 'N/A',
        stops: flight.stopsText || 'Unknown',
        price: goWildFare,
        duration: flight.duration || 'Unknown',
        available: true,
        scrape_method: 'direct'
      });
    }
  }

  console.log(`✓ Extracted ${flights.length} GoWild flights`);
  return flights;
}

module.exports = {
  scrapeFrontierDirect
};
```

---

### 4. database.js - SQLite Operations for Flights

```javascript
const Database = require('better-sqlite3');
const db = new Database('./flights.db');

// Initialize database
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS flights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      date TEXT NOT NULL,
      departure_time TEXT,
      arrival_time TEXT,
      stops TEXT,
      price REAL,
      duration TEXT,
      available INTEGER DEFAULT 1,
      scrape_method TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(origin, destination, date, departure_time, price)
    );

    CREATE INDEX IF NOT EXISTS idx_route_date ON flights(origin, destination, date);
    CREATE INDEX IF NOT EXISTS idx_scraped_at ON flights(scraped_at);

    CREATE TABLE IF NOT EXISTS scrape_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin TEXT,
      destination TEXT,
      date TEXT,
      method TEXT,
      status TEXT,
      error_message TEXT,
      proxy_used TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_scrape_date ON scrape_log(created_at);
  `);
}

function getCachedFlights(origin, destination, date) {
  const stmt = db.prepare(`
    SELECT * FROM flights
    WHERE origin = ? AND destination = ? AND date = ?
    AND scraped_at >= datetime('now', '-6 hours')
    ORDER BY departure_time
  `);
  return stmt.all(origin, destination, date);
}

function upsertFlight(flight) {
  const stmt = db.prepare(`
    INSERT INTO flights (origin, destination, date, departure_time, arrival_time,
                        stops, price, duration, available, scrape_method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(origin, destination, date, departure_time, price)
    DO UPDATE SET
      arrival_time = excluded.arrival_time,
      stops = excluded.stops,
      duration = excluded.duration,
      available = excluded.available,
      scraped_at = CURRENT_TIMESTAMP
  `);

  return stmt.run(
    flight.origin,
    flight.destination,
    flight.date,
    flight.departure_time,
    flight.arrival_time,
    flight.stops,
    flight.price,
    flight.duration,
    flight.available ? 1 : 0,
    flight.scrape_method
  );
}

function clearFlights(origin, destination, date) {
  const stmt = db.prepare(`
    DELETE FROM flights
    WHERE origin = ? AND destination = ? AND date = ?
  `);
  return stmt.run(origin, destination, date);
}

function logScrape(origin, destination, date, method, status, errorMessage = null, proxyUsed = null) {
  const stmt = db.prepare(`
    INSERT INTO scrape_log (origin, destination, date, method, status, error_message, proxy_used)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(origin, destination, date, method, status, errorMessage, proxyUsed);
}

function getAllRoutes() {
  const stmt = db.prepare(`
    SELECT DISTINCT origin, destination, COUNT(*) as flight_count,
           MAX(scraped_at) as last_scraped
    FROM flights
    GROUP BY origin, destination
    ORDER BY last_scraped DESC
  `);
  return stmt.all();
}

module.exports = {
  initializeDatabase,
  getCachedFlights,
  upsertFlight,
  clearFlights,
  logScrape,
  getAllRoutes
};
```

---

### 5. premium-proxies.js - Default Proxy List

```javascript
// Default proxy list - users can edit via frontend
const PREMIUM_PROXIES = [
  '104.207.44.112:3129',
  '104.167.25.173:3129',
  '104.207.35.127:3129',
  '104.207.41.123:3129',
  '209.50.170.186:3129',
  '104.207.35.120:3129',
  '104.207.34.186:3129',
  '209.50.172.137:3129',
  '45.3.33.160:3129',
  '216.26.235.113:3129',
  '209.50.163.7:3129',
  '193.56.28.130:3129',
  '216.26.234.250:3129',
  '209.50.169.44:3129',
  '65.111.10.15:3129',
  '65.111.14.83:3129',
  '104.207.44.228:3129',
  '104.207.40.249:3129',
  '65.111.6.77:3129',
  '104.207.33.59:3129',
  '209.50.171.109:3129',
  '104.207.37.148:3129',
  '65.111.6.116:3129',
  '209.50.170.244:3129',
  '104.207.34.158:3129',
  '45.3.33.46:3129',
  '216.26.226.158:3129',
  '216.26.234.148:3129',
  '65.111.1.33:3129',
  '65.111.8.20:3129',
  '209.50.175.95:3129',
  '65.111.12.140:3129',
  '209.50.163.67:3129',
  '104.207.36.84:3129',
  '45.3.48.101:3129',
  '104.207.34.120:3129',
  '216.26.234.64:3129',
  '209.50.173.24:3129',
  '216.26.226.59:3129',
  '216.26.238.5:3129',
  '65.111.7.117:3129',
  '65.111.8.54:3129',
  '65.111.14.5:3129',
  '65.111.7.169:3129',
  '65.111.2.149:3129',
  '193.56.28.37:3129',
  '216.26.234.223:3129'
];

module.exports = {
  PREMIUM_PROXIES
};
```

---

## 🎨 Frontend (public/index.html)

### UI Sections

**1. Header**
- Purple gradient background
- Title: "✈️ Frontier GoWild Flight Scraper"
- Subtitle: "Intelligent proxy-based scraping"

**2. Proxy Management Card**

```html
<div class="proxy-card">
  <h2>🔒 Proxy Management</h2>

  <!-- Proxy Statistics -->
  <div class="proxy-stats">
    <div class="stat-box">
      <div class="stat-value" id="activeCount">0</div>
      <div class="stat-label">Active</div>
    </div>
    <div class="stat-box">
      <div class="stat-value" id="cooldownCount">0</div>
      <div class="stat-label">Cooldown</div>
    </div>
    <div class="stat-box">
      <div class="stat-value" id="blacklistedCount">0</div>
      <div class="stat-label">Blacklisted</div>
    </div>
    <div class="stat-box">
      <div class="stat-value" id="successRate">0%</div>
      <div class="stat-label">Success Rate</div>
    </div>
  </div>

  <!-- Proxy Input -->
  <div class="proxy-input-section">
    <label for="proxyList">
      <strong>Proxy List</strong> (one per line: IP:PORT)
    </label>
    <textarea
      id="proxyList"
      rows="10"
      placeholder="104.207.44.112:3129
104.167.25.173:3129
104.207.35.127:3129"></textarea>

    <div class="button-row">
      <button class="btn-primary" onclick="updateProxies()">
        💾 Update Proxy List
      </button>
      <button class="btn-secondary" onclick="loadProxyList()">
        🔄 Reload Current List
      </button>
    </div>
  </div>

  <!-- Proxy Actions -->
  <div class="proxy-actions">
    <button class="btn-secondary" onclick="clearBlacklist()">
      🗑️ Clear Blacklist
    </button>
    <button class="btn-secondary" onclick="resetCooldowns()">
      ⏱️ Reset Cooldowns
    </button>
    <button class="btn-info" onclick="viewProxyStatus()">
      📊 View Detailed Status
    </button>
  </div>
</div>
```

**3. Flight Search Card**

```html
<div class="search-card">
  <h2>🔍 Search Flights</h2>

  <form id="searchForm">
    <div class="form-grid">
      <div class="form-group">
        <label for="origin">Origin Airport</label>
        <select id="origin" required></select>
      </div>

      <div class="form-group">
        <label for="destination">Destination Airport</label>
        <select id="destination" required></select>
      </div>

      <div class="form-group">
        <label for="date">Travel Date</label>
        <input type="date" id="date" required>
      </div>
    </div>

    <div class="options">
      <label>
        <input type="checkbox" id="useCache" checked>
        📦 Use cached data (if available)
      </label>
    </div>

    <button type="submit" class="btn-primary btn-large">
      🔍 Search Flights
    </button>
  </form>

  <!-- Loading Indicator -->
  <div id="loading" class="loading hidden">
    <div class="spinner"></div>
    <p>Scraping flights with intelligent proxy rotation...</p>
  </div>
</div>
```

**4. Results Card**

```html
<div id="results" class="results-card hidden">
  <div class="results-header">
    <h2 id="resultsTitle">Results</h2>
    <div id="resultsMeta" class="results-meta"></div>
  </div>

  <div id="resultsContent"></div>
</div>
```

**5. Proxy Status Modal**

```html
<div id="proxyModal" class="modal">
  <div class="modal-content">
    <span class="close" onclick="closeModal()">&times;</span>
    <h2>Proxy Status Details</h2>
    <div id="proxyStatusTable"></div>
  </div>
</div>
```

### JavaScript Functions

```javascript
// ========== INITIALIZATION ==========

async function init() {
  await loadAirports();
  await loadProxyStats();
  await loadProxyList();

  // Auto-refresh stats every 10 seconds
  setInterval(loadProxyStats, 10000);

  // Set default date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('date').value = tomorrow.toISOString().split('T')[0];
  document.getElementById('date').min = new Date().toISOString().split('T')[0];
}

// ========== PROXY MANAGEMENT ==========

async function loadProxyStats() {
  const response = await fetch('/api/proxy-stats');
  const stats = await response.json();

  document.getElementById('activeCount').textContent = stats.active;
  document.getElementById('cooldownCount').textContent = stats.cooldown;
  document.getElementById('blacklistedCount').textContent = stats.blacklisted;
  document.getElementById('successRate').textContent = stats.successRate.toFixed(1) + '%';
}

async function loadProxyList() {
  const response = await fetch('/api/proxies');
  const proxies = await response.json();

  const proxyStrings = proxies.map(p => p.proxy).join('\n');
  document.getElementById('proxyList').value = proxyStrings;
}

async function updateProxies() {
  const proxyText = document.getElementById('proxyList').value;
  const proxies = proxyText.split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0 && p.includes(':'));

  if (proxies.length === 0) {
    alert('⚠️ No valid proxies found. Format: IP:PORT');
    return;
  }

  const response = await fetch('/api/proxies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proxies })
  });

  const result = await response.json();

  if (response.ok) {
    alert(`✅ Proxy list updated!\nAdded: ${result.added}\nRemoved: ${result.removed}\nTotal: ${result.total}`);
    await loadProxyStats();
  } else {
    alert('❌ Failed to update proxies');
  }
}

async function clearBlacklist() {
  if (!confirm('Clear all blacklisted proxies and reset to active?')) return;

  const response = await fetch('/api/proxies/clear-blacklist', { method: 'POST' });
  const result = await response.json();

  alert(`✅ Cleared ${result.cleared} blacklisted proxies`);
  await loadProxyStats();
}

async function resetCooldowns() {
  if (!confirm('Reset all cooldown proxies to active?')) return;

  const response = await fetch('/api/proxies/reset-cooldowns', { method: 'POST' });
  const result = await response.json();

  alert(`✅ Reset ${result.reset} proxies from cooldown`);
  await loadProxyStats();
}

async function viewProxyStatus() {
  const response = await fetch('/api/proxies');
  const proxies = await response.json();

  let tableHTML = `
    <table class="proxy-table">
      <thead>
        <tr>
          <th>Proxy</th>
          <th>State</th>
          <th>Successes</th>
          <th>Errors</th>
          <th>Bot Detections</th>
          <th>Total Requests</th>
          <th>Success Rate</th>
          <th>Last Used</th>
        </tr>
      </thead>
      <tbody>
  `;

  proxies.forEach(p => {
    const stateClass = p.state === 'active' ? 'success' :
                       p.state === 'cooldown' ? 'warning' : 'error';

    const successRate = p.total_requests > 0
      ? ((p.success_count / p.total_requests) * 100).toFixed(1)
      : 0;

    const lastUsed = p.last_used
      ? new Date(p.last_used).toLocaleString()
      : 'Never';

    tableHTML += `
      <tr>
        <td><code>${p.proxy}</code></td>
        <td><span class="badge badge-${stateClass}">${p.state}</span></td>
        <td>${p.success_count}</td>
        <td>${p.error_count}</td>
        <td>${p.bot_detections}</td>
        <td>${p.total_requests}</td>
        <td>${successRate}%</td>
        <td>${lastUsed}</td>
      </tr>
    `;
  });

  tableHTML += '</tbody></table>';

  document.getElementById('proxyStatusTable').innerHTML = tableHTML;
  document.getElementById('proxyModal').style.display = 'block';
}

function closeModal() {
  document.getElementById('proxyModal').style.display = 'none';
}

// ========== FLIGHT SEARCH ==========

document.getElementById('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const origin = document.getElementById('origin').value;
  const destination = document.getElementById('destination').value;
  const date = document.getElementById('date').value;
  const useCache = document.getElementById('useCache').checked;

  // Show loading
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('results').classList.add('hidden');

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, date, useCache })
    });

    const data = await response.json();

    // Hide loading
    document.getElementById('loading').classList.add('hidden');

    if (response.ok) {
      displayResults(data, origin, destination, date);
    } else {
      displayError(data);
    }

  } catch (error) {
    document.getElementById('loading').classList.add('hidden');
    alert('Error: ' + error.message);
  }

  // Refresh proxy stats after search
  await loadProxyStats();
});

function displayResults(data, origin, destination, date) {
  const resultsCard = document.getElementById('results');
  const resultsTitle = document.getElementById('resultsTitle');
  const resultsMeta = document.getElementById('resultsMeta');
  const resultsContent = document.getElementById('resultsContent');

  resultsCard.classList.remove('hidden');

  // Title
  resultsTitle.textContent = `${origin} → ${destination} on ${date}`;

  // Meta info
  let metaHTML = `Found ${data.flights.length} flight(s) `;

  if (data.cached) {
    metaHTML += `<span class="badge badge-warning">Cached</span>`;
    metaHTML += ` <small>(Cached at: ${new Date(data.cachedAt).toLocaleString()})</small>`;
  } else {
    metaHTML += `<span class="badge badge-success">Fresh</span>`;
    if (data.proxyUsed) {
      metaHTML += ` <small>(Proxy: ${data.proxyUsed})</small>`;
    }
  }

  resultsMeta.innerHTML = metaHTML;

  // Flights
  if (data.flights.length === 0) {
    resultsContent.innerHTML = `
      <div class="no-results">
        <h3>No GoWild Flights Found</h3>
        <p>No GoWild fares available for this route on this date.</p>
      </div>
    `;
  } else {
    resultsContent.innerHTML = data.flights.map(flight => `
      <div class="flight-card">
        <div class="flight-header">
          <div class="flight-route">
            <span>${flight.origin}</span>
            <span class="arrow">→</span>
            <span>${flight.destination}</span>
          </div>
          <div class="flight-price">$${flight.price}</div>
        </div>
        <div class="flight-details">
          <div class="detail">
            <span class="label">Departure</span>
            <span class="value">${flight.departure_time}</span>
          </div>
          <div class="detail">
            <span class="label">Arrival</span>
            <span class="value">${flight.arrival_time}</span>
          </div>
          <div class="detail">
            <span class="label">Duration</span>
            <span class="value">${flight.duration}</span>
          </div>
          <div class="detail">
            <span class="label">Stops</span>
            <span class="value">${flight.stops}</span>
          </div>
        </div>
      </div>
    `).join('');
  }
}

function displayError(data) {
  const resultsCard = document.getElementById('results');
  const resultsContent = document.getElementById('resultsContent');

  resultsCard.classList.remove('hidden');

  resultsContent.innerHTML = `
    <div class="error-message">
      <h3>⚠️ Error</h3>
      <p>${data.error}</p>
      ${data.details ? `<pre>${JSON.stringify(data.details, null, 2)}</pre>` : ''}
    </div>
  `;
}

// ========== AIRPORTS ==========

async function loadAirports() {
  const response = await fetch('/api/airports');
  const airports = await response.json();

  const sorted = Object.entries(airports).sort((a, b) =>
    a[1].localeCompare(b[1])
  );

  const originSelect = document.getElementById('origin');
  const destSelect = document.getElementById('destination');

  sorted.forEach(([code, name]) => {
    const text = `${name} (${code})`;
    originSelect.add(new Option(text, code));
    destSelect.add(new Option(text, code));
  });
}

// Initialize on load
init();
```

---

## 🔄 Complete Data Flow

### Scenario: User searches for flights ORD → CUN on 2025-12-01

**1. User Action**
- Fills form: Origin=ORD, Dest=CUN, Date=2025-12-01
- Checks "Use cache"
- Clicks "Search Flights"

**2. Frontend → Backend**
```javascript
POST /api/search
{
  "origin": "ORD",
  "destination": "CUN",
  "date": "2025-12-01",
  "useCache": true
}
```

**3. Server: Check Cache**
```javascript
const cached = getCachedFlights("ORD", "CUN", "2025-12-01");
// If found and < 6 hours old, return immediately
if (cached.length > 0) {
  return res.json({ flights: cached, cached: true });
}
```

**4. Server: Initialize Scraping**
```javascript
const proxyManager = new ProxyManager('./proxies.db');

const flights = await scrapeFrontierDirect("ORD", "CUN", "2025-12-01", {
  proxyManager: proxyManager,
  maxRetries: 5
});
```

**5. Scraper: Attempt 1**
```javascript
// Get first available proxy
const proxy1 = await proxyManager.getNextAvailableProxy();
// → { proxy: "104.207.44.112:3129", state: "active", ... }

// Launch browser with proxy
browser = chromium.launch({ proxy: { server: "http://104.207.44.112:3129" } });

// Navigate to URL
await page.goto(url, { waitUntil: 'domcontentloaded' });

// Wait for .ibe-flight-info
await page.waitForSelector('.ibe-flight-info', { timeout: 30000 });
// ❌ Timeout!

// Check page content
const content = await page.content();
const botDetected = detectBotProtection(content, title);
// → { detected: true, reason: 'perimeterx_captcha' }

// Mark proxy for cooldown
await proxyManager.markProxyBotDetected("104.207.44.112:3129");
// Database: state='cooldown', cooldown_until=NOW+5min

browser.close();
// Continue to attempt 2
```

**6. Scraper: Attempt 2**
```javascript
// Get next available proxy (skips cooldown proxy)
const proxy2 = await proxyManager.getNextAvailableProxy();
// → { proxy: "104.167.25.173:3129", state: "active", ... }

// Launch browser with proxy2
browser = chromium.launch({ proxy: { server: "http://104.167.25.173:3129" } });

// Navigate and wait
await page.goto(url);
await page.waitForSelector('.ibe-flight-info');
// ✅ Success!

// Extract HTML
const html = await page.content();

// Parse FlightData
const flights = parseFlightsFromHTML(html, "ORD", "CUN", "2025-12-01");
// → Found 3 flights

// Mark success
await proxyManager.markProxySuccess("104.167.25.173:3129");
// Database: success_count++, last_success=NOW

return flights;
```

**7. Server: Cache & Log**
```javascript
clearFlights("ORD", "CUN", "2025-12-01");

flights.forEach(f => upsertFlight(f));

logScrape("ORD", "CUN", "2025-12-01", "direct", "success", null, "104.167.25.173:3129");

res.json({
  flights: flights,
  cached: false,
  scrapedAt: new Date().toISOString(),
  proxyUsed: "104.167.25.173:3129"
});
```

**8. Frontend: Display**
```javascript
displayResults(data, "ORD", "CUN", "2025-12-01");
// Shows 3 flight cards
// Badge: "Fresh"
// Proxy: "104.167.25.173:3129"

// Auto-refresh stats
loadProxyStats();
// Active: 46, Cooldown: 1, Blacklisted: 0
```

---

## ⚙️ Configuration

### Environment Variables (.env)
```bash
PORT=3000
FLIGHTS_DB_PATH=./flights.db
PROXIES_DB_PATH=./proxies.db
COOLDOWN_DURATION_MS=300000      # 5 minutes
MAX_BOT_DETECTIONS=5             # Blacklist after 5 bot detections
MAX_ERRORS=3                     # Blacklist after 3 consecutive errors
SCRAPE_TIMEOUT_MS=60000          # 60 seconds
ELEMENT_WAIT_MS=30000            # 30 seconds for .ibe-flight-info
MAX_RETRIES=5                    # Try 5 different proxies
CACHE_DURATION_HOURS=6
```

### Airports List
140+ airports hardcoded in server.js:
```javascript
const AIRPORTS = {
  'ORD': 'Chicago, IL',
  'CUN': 'Cancun, MX',
  'LAX': 'Los Angeles, CA',
  'MIA': 'Miami, FL',
  // ... 140+ total
};
```

---

## 🧪 Testing

### Test Files

**1. test-proxy-manager.js**
```javascript
const ProxyManager = require('./proxy-manager');

async function testProxyManager() {
  const pm = new ProxyManager(':memory:'); // In-memory DB for testing

  // Test adding proxies
  await pm.addProxy('192.168.1.1:3129');
  await pm.addProxy('192.168.1.2:3129');

  // Test getting proxy
  const proxy = await pm.getNextAvailableProxy();
  console.log('Got proxy:', proxy);

  // Test bot detection
  await pm.markProxyBotDetected('192.168.1.1:3129');
  const status = await pm.getProxyStatus('192.168.1.1:3129');
  console.log('Status after bot:', status);

  // Wait 1 second and check cooldown
  await new Promise(r => setTimeout(r, 1000));
  await pm.checkCooldownExpiration();

  // Test blacklist
  await pm.markProxyBlacklisted('192.168.1.2:3129', 'test');

  // Get stats
  const stats = await pm.getStats();
  console.log('Stats:', stats);
}

testProxyManager();
```

**2. test-scraper-with-proxy.js**
```javascript
const { scrapeFrontierDirect } = require('./scraper');
const ProxyManager = require('./proxy-manager');

async function test() {
  const pm = new ProxyManager();

  try {
    const flights = await scrapeFrontierDirect('ORD', 'CUN', '2025-12-01', {
      proxyManager: pm,
      maxRetries: 3
    });

    console.log('Success!');
    console.log('Flights:', flights);
  } catch (error) {
    console.error('Failed:', error.message);
  }

  const stats = await pm.getStats();
  console.log('Final stats:', stats);
}

test();
```

---

## 🚀 Deployment

### Installation Steps

1. **Clone/Create Project**
```bash
mkdir frontier-scraper
cd frontier-scraper
npm init -y
```

2. **Install Dependencies**
```bash
npm install express cors sqlite3 playwright playwright-extra puppeteer-extra-plugin-stealth cheerio
npx playwright install chromium
```

3. **Create Files**
- Copy all module code above into respective files
- Create public/index.html with frontend code

4. **Initialize Databases**
```bash
node -e "require('./database').initializeDatabase()"
node -e "new (require('./proxy-manager'))('./proxies.db')"
```

5. **Seed Proxies**
```bash
node -e "
const pm = new (require('./proxy-manager'))();
const proxies = require('./premium-proxies').PREMIUM_PROXIES;
proxies.forEach(p => pm.addProxy(p));
"
```

6. **Start Server**
```bash
npm start
# or
node server.js
```

7. **Access**
```
http://localhost:3000
```

---

## 🎯 Critical Success Factors

1. **Proxy Pool Size**: Need at least 20-30 active proxies for reliability
2. **Bot Detection Accuracy**: Must catch all PerimeterX patterns
3. **Element Wait Strategy**: `.ibe-flight-info` must reliably indicate page loaded
4. **Cooldown Timing**: Exactly 5 minutes (300,000ms)
5. **State Persistence**: Proxy states must survive server restarts
6. **Error Handling**: Must gracefully handle all browser/network errors
7. **Rate Limiting**: Respect 10-second interval between requests

---

## 📝 Key Algorithms

### Proxy Selection Algorithm
```
1. Check and reset expired cooldowns
2. Query all proxies WHERE state = 'active'
3. If none available, throw error
4. Select random proxy from active pool
5. Return proxy object
```

### Bot Detection Algorithm
```
1. Check HTTP status code (403 → blacklist)
2. Check page content for patterns:
   - px-captcha
   - Access denied
   - PerimeterX
   - Human verification
3. If detected → 5-minute cooldown
4. If 5+ bot detections → blacklist
5. If connection failed → blacklist
```

### Retry Strategy
```
1. Max 5 attempts
2. Each attempt uses different proxy
3. Failed proxy marked (cooldown/blacklist)
4. Next proxy selected immediately
5. No delay between retries
6. Stop on success or proxy exhaustion
```

---

## 💡 Future Enhancements

1. **Multi-date Search**: Search multiple dates at once
2. **Price Alerts**: Email/SMS when price drops
3. **Proxy Testing**: Background job to test proxy health
4. **Analytics Dashboard**: Visualize proxy performance over time
5. **Proxy Auto-Discovery**: Automatically find and test new proxies
6. **Load Balancing**: Distribute requests across healthy proxies
7. **API Authentication**: Secure API with keys
8. **Webhook Support**: Notify external systems of new flights
9. **Docker Container**: Containerize entire application
10. **Horizontal Scaling**: Multiple scraper instances with shared DB

---

This specification provides everything needed to recreate the Frontier GoWild Flight Scraper with intelligent proxy management, bot detection, and automatic recovery mechanisms. The system is designed to be self-healing, automatically managing proxy health and routing requests through the best available proxies.
