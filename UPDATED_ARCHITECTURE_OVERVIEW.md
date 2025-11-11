# Frontier GoWild Flight Scraper - Updated Architecture Overview

## 🎯 Purpose
A full-stack web application that scrapes Frontier Airlines' booking website to find GoWild fare prices using intelligent proxy rotation with automatic bot detection and blacklisting.

---

## 🏗️ Revised Architecture

### System Design
```
┌─────────────┐
│   Browser   │
│  (Frontend) │
└──────┬──────┘
       │ HTTP/JSON
       ▼
┌─────────────────────┐
│  Express Server     │
│   (Backend API)     │
└────────┬────────────┘
         │
    ┌────┴────┬──────────────┐
    ▼         ▼              ▼
┌────────┐ ┌───────┐ ┌──────────────┐
│SQLite  │ │Scraper│ │Proxy Manager │
│Database│ │Module │ │ (Intelligent)│
└────────┘ └───┬───┘ └──────┬───────┘
               │             │
           ┌───┴─────────────┴────┐
           ▼                      ▼
    ┌─────────────────┐    ┌──────────┐
    │  Playwright     │    │  Proxy   │
    │  + Stealth Mode │    │  Pool    │
    └─────────────────┘    │ + States │
             │              └──────────┘
             ▼
    ┌─────────────────┐
    │ Frontier Website│
    └─────────────────┘
```

---

## 🔄 Key Changes from Previous Version

### 1. **Removed Components**
- ❌ Scrapfly API integration (scrapfly.js) - DELETED
- ❌ Browse.ai integration (browseai.js) - ALREADY DEPRECATED
- ❌ API mode option in frontend - REMOVED

### 2. **New Components**
- ✅ **Proxy Manager** - Intelligent proxy state management
- ✅ **Bot Detection System** - Automatic detection and handling
- ✅ **Proxy Input UI** - Frontend form to add/edit proxies
- ✅ **Enhanced Scraper** - Waits for specific DOM elements

### 3. **Modified Components**
- 🔧 **scraper.js** - Enhanced with bot detection
- 🔧 **Frontend** - Proxy management interface
- 🔧 **Server API** - Proxy CRUD endpoints

---

## 📂 Updated File Structure

```
1493test/
├── server.js                      # Express server and API routes
├── database.js                    # SQLite operations
├── scraper.js                     # Playwright scraper with bot detection
├── proxy-manager.js               # NEW: Intelligent proxy state management
├── premium-proxies.js             # Dynamic proxy list (user-editable)
├── package.json                   # Dependencies
├── flights.db                     # SQLite database (auto-created)
├── proxies.db                     # NEW: Proxy state tracking database
├── test-direct-scraper.js         # Test scripts
├── test-premium-proxies.js
├── test-scraper-with-proxy.js
├── test-frontier-with-proxy.js
└── public/
    └── index.html                 # Frontend SPA with proxy management
```

---

## 🆕 New Module: Proxy Manager (proxy-manager.js)

### Purpose
Manages proxy pool with intelligent state tracking, automatic blacklisting, and cooldown periods.

### Proxy States

```javascript
{
  proxy: "104.207.44.112:3129",
  state: "active",              // active, cooldown, blacklisted
  lastUsed: "2025-11-11T20:00:00.000Z",
  lastError: null,
  errorCount: 0,
  botDetections: 0,
  successCount: 0,
  cooldownUntil: null,          // ISO timestamp
  blacklistedAt: null,
  blacklistReason: null         // "403_forbidden", "bot_detected", "timeout"
}
```

### State Transitions

**1. Active → Cooldown (5 minutes)**
- Trigger: Bot detection (CAPTCHA, PerimeterX challenge)
- Detection methods:
  - Page contains "px-captcha"
  - Page contains "Access to this page has been denied"
  - HTTP status 403
  - Page title contains "Access Denied"

**2. Active → Blacklisted (Permanent)**
- Trigger: Repeated failures (3+ in a row)
- Trigger: Connection refused
- Trigger: Proxy authentication failure
- Trigger: 5+ bot detections

**3. Cooldown → Active**
- Trigger: 5 minutes elapsed since cooldown started
- Auto-check on proxy selection

### Key Functions

```javascript
class ProxyManager {
  constructor(dbPath = './proxies.db')

  // Core proxy management
  getNextAvailableProxy()                    // Returns active proxy, skips cooldown/blacklisted
  addProxy(proxyString)                      // Add new proxy to pool
  removeProxy(proxyString)                   // Delete proxy
  updateProxyList(proxyArray)                // Bulk update proxy list

  // State management
  markProxySuccess(proxy)                    // Increment success count, reset errors
  markProxyBotDetected(proxy)                // Set 5-min cooldown
  markProxyBlacklisted(proxy, reason)        // Permanent blacklist
  resetProxyCooldown(proxy)                  // Manual cooldown reset
  clearBlacklist()                           // Manual blacklist clear

  // Status queries
  getProxyStatus(proxy)                      // Get current state object
  getAllProxies()                            // Get all proxies with states
  getActiveProxies()                         // Get only active proxies
  getBlacklistedProxies()                    // Get blacklisted proxies
  getCooldownProxies()                       // Get proxies in cooldown

  // Cleanup
  checkCooldownExpiration()                  // Convert expired cooldowns to active
}
```

### Database Schema (proxies.db)

```sql
CREATE TABLE proxy_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proxy TEXT UNIQUE NOT NULL,
  state TEXT NOT NULL DEFAULT 'active',          -- active, cooldown, blacklisted
  last_used DATETIME,
  last_error TEXT,
  error_count INTEGER DEFAULT 0,
  bot_detections INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  cooldown_until DATETIME,
  blacklisted_at DATETIME,
  blacklist_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_proxy ON proxy_states(proxy);
CREATE INDEX idx_state ON proxy_states(state);
CREATE INDEX idx_cooldown_until ON proxy_states(cooldown_until);
```

---

## 🔧 Updated Scraper (scraper.js)

### Enhanced Scraping Logic

```javascript
async function scrapeFrontierDirect(origin, destination, date, options = {}) {
  const proxyManager = options.proxyManager; // Injected dependency
  const maxRetries = options.maxRetries || 3;

  let attempts = 0;
  let lastError = null;

  while (attempts < maxRetries) {
    attempts++;

    // Get next available proxy (skips cooldown/blacklisted)
    const selectedProxy = await proxyManager.getNextAvailableProxy();

    if (!selectedProxy) {
      throw new Error('No available proxies. All proxies are blacklisted or in cooldown.');
    }

    console.log(`Attempt ${attempts}/${maxRetries} using proxy: ${selectedProxy.proxy}`);

    let browser;
    try {
      // Launch browser with proxy
      browser = await chromium.launch({
        headless: true,
        proxy: { server: `http://${selectedProxy.proxy}` },
        args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox']
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York'
      });

      const page = await context.newPage();

      // Navigate to target URL
      const url = `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${origin}&d1=${destination}&dd1=${date}&adt=1&umnr=false&loy=false&mon=true&ftype=GW`;

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // CHECK 1: HTTP Status Code
      if (response.status() === 403) {
        console.log('❌ 403 Forbidden - Proxy blocked');
        await proxyManager.markProxyBlacklisted(selectedProxy.proxy, '403_forbidden');
        await browser.close();
        continue; // Try next proxy
      }

      // Wait for flight results container - CRITICAL CHANGE
      // This confirms JavaScript has executed and page is rendered
      try {
        await page.waitForSelector('.ibe-flight-info', { timeout: 30000 });
      } catch (timeoutError) {
        // Element not found - check why
        const pageContent = await page.content();
        const pageTitle = await page.title();

        // CHECK 2: Bot Detection Patterns
        const botDetected =
          pageContent.includes('px-captcha') ||
          pageContent.includes('Access to this page has been denied') ||
          pageContent.includes('PerimeterX') ||
          pageTitle.includes('Access Denied') ||
          pageContent.includes('Please verify you are a human');

        if (botDetected) {
          console.log('🤖 Bot detection triggered - Proxy cooldown for 5 minutes');
          await proxyManager.markProxyBotDetected(selectedProxy.proxy);

          // Save debug files
          fs.writeFileSync(`bot_detected_${selectedProxy.proxy.replace(/[:.]/g, '_')}.html`, pageContent);

          await browser.close();
          continue; // Try next proxy immediately
        }

        // CHECK 3: Other errors (connection, timeout, etc.)
        console.log('⚠️ .ibe-flight-info not found - Unknown issue');
        lastError = timeoutError;
        await browser.close();
        continue;
      }

      // Get fully rendered HTML
      const htmlContent = await page.content();

      // Save debug output
      fs.writeFileSync('direct_scraper_output.html', htmlContent);
      await page.screenshot({ path: 'direct_scraper_screenshot.png' });

      await browser.close();

      // Parse FlightData
      const flights = await parseFlightsFromHTML(htmlContent, origin, destination, date);

      if (flights.length > 0) {
        // SUCCESS
        console.log(`✅ Success! Found ${flights.length} flights`);
        await proxyManager.markProxySuccess(selectedProxy.proxy);
        return flights;
      } else {
        // No flights found, but page loaded successfully
        console.log('⚠️ No flights found, but page loaded correctly');
        await proxyManager.markProxySuccess(selectedProxy.proxy);
        return [];
      }

    } catch (error) {
      if (browser) await browser.close();

      console.error(`Error with proxy ${selectedProxy.proxy}:`, error.message);

      // CHECK 4: Connection errors
      if (error.message.includes('ERR_PROXY_CONNECTION_FAILED') ||
          error.message.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
        console.log('❌ Proxy connection failed - Blacklisting');
        await proxyManager.markProxyBlacklisted(selectedProxy.proxy, 'connection_failed');
        continue;
      }

      lastError = error;
      // Continue to next proxy
    }
  }

  // All retries exhausted
  throw new Error(`Failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}

function parseFlightsFromHTML(html, origin, destination, date) {
  // Extract FlightData JSON (same as before)
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);

  // Try injected element first
  let flightDataJSON = null;
  const extractedData = $('#extracted-flight-data').text();

  if (extractedData) {
    let jsonString = extractedData.replace(/&quot;/g, '"');
    flightDataJSON = JSON.parse(jsonString);
  } else {
    // Fallback: search script tags
    $('script').each((i, elem) => {
      const scriptContent = $(elem).html();
      if (scriptContent && scriptContent.includes('FlightData')) {
        const match = scriptContent.match(/FlightData\s*=\s*['"]({[^'"]+})['"]/);
        if (match && match[1]) {
          let jsonString = match[1].replace(/&quot;/g, '"');
          flightDataJSON = JSON.parse(jsonString);
        }
      }
    });
  }

  if (!flightDataJSON) return [];

  // Parse flights from JSON
  const flights = [];
  for (const journey of flightDataJSON.journeys || []) {
    for (const flight of journey.flights || []) {
      if (flight.goWildFare && flight.goWildFare > 0) {
        flights.push({
          origin,
          destination,
          date,
          departure_time: flight.departureTime || 'N/A',
          arrival_time: flight.arrivalTime || 'N/A',
          stops: flight.stopsText || 'Unknown',
          price: flight.goWildFare,
          duration: flight.duration || 'Unknown',
          available: true,
          scrape_method: 'direct'
        });
      }
    }
  }

  return flights;
}
```

### Key Improvements

1. **Wait for `.ibe-flight-info`** - Ensures JavaScript has executed
2. **Bot Detection Patterns** - Multiple checks for CAPTCHA/PerimeterX
3. **Immediate Retry** - Skips failed proxy instantly, tries next
4. **State Tracking** - Updates proxy manager with results
5. **Debug Output** - Saves HTML when bot detected

---

## 🎨 Updated Frontend (public/index.html)

### Removed Elements
- ❌ Scrapfly API radio button
- ❌ "Test Scrapfly" button
- ❌ Method selection (always direct now)

### New Elements

**1. Proxy Management Section**
```html
<div class="proxy-management-card">
  <h3>🔒 Proxy Management</h3>

  <div class="proxy-stats">
    <div class="stat">
      <span class="stat-value" id="activeProxyCount">0</span>
      <span class="stat-label">Active</span>
    </div>
    <div class="stat">
      <span class="stat-value" id="cooldownProxyCount">0</span>
      <span class="stat-label">Cooldown</span>
    </div>
    <div class="stat">
      <span class="stat-value" id="blacklistedProxyCount">0</span>
      <span class="stat-label">Blacklisted</span>
    </div>
  </div>

  <div class="proxy-input-section">
    <label for="proxyList">Proxy List (one per line: IP:PORT)</label>
    <textarea id="proxyList" rows="10" placeholder="104.207.44.112:3129
104.167.25.173:3129
104.207.35.127:3129"></textarea>

    <button type="button" class="btn-primary" onclick="updateProxies()">
      💾 Update Proxy List
    </button>
  </div>

  <div class="proxy-actions">
    <button type="button" class="btn-secondary" onclick="clearBlacklist()">
      🔄 Clear Blacklist
    </button>
    <button type="button" class="btn-secondary" onclick="viewProxyStatus()">
      📊 View Proxy Status
    </button>
  </div>
</div>
```

**2. Proxy Status Modal**
```html
<div id="proxyStatusModal" class="modal">
  <div class="modal-content">
    <span class="close">&times;</span>
    <h2>Proxy Status</h2>
    <div id="proxyStatusTable"></div>
  </div>
</div>
```

**3. Search Section (Simplified)**
```html
<div class="search-card">
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

    <div class="options-group">
      <div class="option-item">
        <input type="checkbox" id="useCache" checked>
        <label for="useCache">📦 Use cached data (if available)</label>
      </div>
    </div>

    <button type="submit" class="btn-primary">🔍 Search Flights</button>
  </form>
</div>
```

### JavaScript Functions

```javascript
// Load proxy statistics
async function loadProxyStats() {
  const response = await fetch('/api/proxy-stats');
  const data = await response.json();

  document.getElementById('activeProxyCount').textContent = data.active;
  document.getElementById('cooldownProxyCount').textContent = data.cooldown;
  document.getElementById('blacklistedProxyCount').textContent = data.blacklisted;
}

// Load current proxy list
async function loadProxyList() {
  const response = await fetch('/api/proxies');
  const proxies = await response.json();

  const proxyStrings = proxies.map(p => p.proxy).join('\n');
  document.getElementById('proxyList').value = proxyStrings;
}

// Update proxy list
async function updateProxies() {
  const proxyText = document.getElementById('proxyList').value;
  const proxies = proxyText.split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const response = await fetch('/api/proxies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proxies })
  });

  if (response.ok) {
    alert('✅ Proxy list updated successfully!');
    loadProxyStats();
  } else {
    alert('❌ Failed to update proxies');
  }
}

// Clear blacklist
async function clearBlacklist() {
  if (!confirm('Clear all blacklisted proxies?')) return;

  await fetch('/api/proxies/clear-blacklist', { method: 'POST' });
  alert('✅ Blacklist cleared!');
  loadProxyStats();
}

// View proxy status
async function viewProxyStatus() {
  const response = await fetch('/api/proxies/status');
  const proxies = await response.json();

  let tableHTML = `
    <table>
      <thead>
        <tr>
          <th>Proxy</th>
          <th>State</th>
          <th>Success</th>
          <th>Errors</th>
          <th>Bot Detections</th>
          <th>Cooldown Until</th>
        </tr>
      </thead>
      <tbody>
  `;

  proxies.forEach(p => {
    const stateClass = p.state === 'active' ? 'success' :
                       p.state === 'cooldown' ? 'warning' : 'error';

    tableHTML += `
      <tr>
        <td>${p.proxy}</td>
        <td><span class="badge badge-${stateClass}">${p.state}</span></td>
        <td>${p.success_count}</td>
        <td>${p.error_count}</td>
        <td>${p.bot_detections}</td>
        <td>${p.cooldown_until || '-'}</td>
      </tr>
    `;
  });

  tableHTML += '</tbody></table>';

  document.getElementById('proxyStatusTable').innerHTML = tableHTML;
  document.getElementById('proxyStatusModal').style.display = 'block';
}

// Search flights (simplified)
document.getElementById('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const origin = document.getElementById('origin').value;
  const destination = document.getElementById('destination').value;
  const date = document.getElementById('date').value;
  const useCache = document.getElementById('useCache').checked;

  // Always use direct method with proxies
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin,
      destination,
      date,
      useCache
    })
  });

  const data = await response.json();
  displayResults(data, origin, destination, date);
});

// Initialize
loadAirports();
loadProxyStats();
loadProxyList();
setInterval(loadProxyStats, 10000); // Refresh stats every 10 seconds
```

---

## 🛣️ Updated API Endpoints

### Removed Endpoints
- ❌ `GET /api/test-scrapfly`
- ❌ Scrapfly-related logic in `/api/search`

### Modified Endpoints

**1. POST /api/search**
```javascript
app.post('/api/search', async (req, res) => {
  const { origin, destination, date, useCache } = req.body;

  // Check cache
  if (useCache) {
    const cached = getCachedFlights(origin, destination, date);
    if (cached.length > 0) {
      return res.json({ flights: cached, cached: true });
    }
  }

  // Always use direct scraping with proxy manager
  const proxyManager = new ProxyManager('./proxies.db');

  try {
    const flights = await scrapeFrontierDirect(origin, destination, date, {
      proxyManager,
      maxRetries: 5  // Will try up to 5 different proxies
    });

    // Cache results
    clearFlights(origin, destination, date);
    flights.forEach(f => upsertFlight(f));
    logScrape(origin, destination, date, 'direct', 'success');

    res.json({ flights, cached: false });

  } catch (error) {
    logScrape(origin, destination, date, 'direct', 'error', error.message);
    res.status(500).json({ error: error.message });
  }
});
```

### New Endpoints

**2. GET /api/proxies**
```javascript
app.get('/api/proxies', async (req, res) => {
  const proxyManager = new ProxyManager();
  const proxies = await proxyManager.getAllProxies();
  res.json(proxies);
});
```

**3. POST /api/proxies**
```javascript
app.post('/api/proxies', async (req, res) => {
  const { proxies } = req.body;
  const proxyManager = new ProxyManager();

  await proxyManager.updateProxyList(proxies);
  res.json({ success: true, count: proxies.length });
});
```

**4. GET /api/proxy-stats**
```javascript
app.get('/api/proxy-stats', async (req, res) => {
  const proxyManager = new ProxyManager();

  const active = await proxyManager.getActiveProxies();
  const cooldown = await proxyManager.getCooldownProxies();
  const blacklisted = await proxyManager.getBlacklistedProxies();

  res.json({
    active: active.length,
    cooldown: cooldown.length,
    blacklisted: blacklisted.length,
    total: active.length + cooldown.length + blacklisted.length
  });
});
```

**5. GET /api/proxies/status**
```javascript
app.get('/api/proxies/status', async (req, res) => {
  const proxyManager = new ProxyManager();
  const proxies = await proxyManager.getAllProxies();
  res.json(proxies);
});
```

**6. POST /api/proxies/clear-blacklist**
```javascript
app.post('/api/proxies/clear-blacklist', async (req, res) => {
  const proxyManager = new ProxyManager();
  await proxyManager.clearBlacklist();
  res.json({ success: true });
});
```

---

## 🔄 Complete Request Flow

### User Searches for Flight

**1. User Input**
- Origin: ORD
- Destination: CUN
- Date: 2025-12-01
- Use cache: ✓

**2. Frontend → Server**
```json
POST /api/search
{
  "origin": "ORD",
  "destination": "CUN",
  "date": "2025-12-01",
  "useCache": true
}
```

**3. Server: Cache Check**
```javascript
const cached = getCachedFlights("ORD", "CUN", "2025-12-01");
// If found and < 6 hours old, return immediately
```

**4. Server: Initialize Proxy Manager**
```javascript
const proxyManager = new ProxyManager('./proxies.db');
```

**5. Scraper: Attempt 1**
```javascript
// Get first available proxy
const proxy1 = await proxyManager.getNextAvailableProxy();
// → { proxy: "104.207.44.112:3129", state: "active", ... }

// Launch browser with proxy
// Navigate to Frontier URL
// Wait for .ibe-flight-info selector

// ❌ Timeout - element not found
// Check page content
// → Contains "px-captcha" - BOT DETECTED

// Mark proxy for cooldown
await proxyManager.markProxyBotDetected("104.207.44.112:3129");
// → Proxy state: "cooldown", cooldown_until: 5 minutes from now

// Browser closed, continue to attempt 2
```

**6. Scraper: Attempt 2**
```javascript
// Get next available proxy (skips cooldown proxy)
const proxy2 = await proxyManager.getNextAvailableProxy();
// → { proxy: "104.167.25.173:3129", state: "active", ... }

// Launch browser with proxy2
// Navigate to Frontier URL
// Wait for .ibe-flight-info selector

// ✅ Element found!
// Get page HTML
// Parse FlightData JSON
// → Found 3 flights

// Mark success
await proxyManager.markProxySuccess("104.167.25.173:3129");
// → success_count++, error_count = 0

return flights;
```

**7. Server: Cache & Return**
```javascript
clearFlights("ORD", "CUN", "2025-12-01");
flights.forEach(f => upsertFlight(f));
logScrape("ORD", "CUN", "2025-12-01", "direct", "success");

res.json({ flights, cached: false });
```

**8. Frontend: Display**
- Show 3 flight cards
- Update "Fresh" badge
- Load proxy stats (1 cooldown, rest active)

---

## 🧠 Bot Detection Logic

### Detection Patterns

```javascript
function detectBot(pageContent, pageTitle, httpStatus) {
  // HTTP 403
  if (httpStatus === 403) {
    return { detected: true, reason: '403_forbidden', action: 'blacklist' };
  }

  // PerimeterX CAPTCHA
  if (pageContent.includes('px-captcha') ||
      pageContent.includes('_pxCaptcha')) {
    return { detected: true, reason: 'perimeterx_captcha', action: 'cooldown' };
  }

  // Access Denied Page
  if (pageContent.includes('Access to this page has been denied') ||
      pageTitle.includes('Access Denied')) {
    return { detected: true, reason: 'access_denied', action: 'cooldown' };
  }

  // PerimeterX Script
  if (pageContent.includes('PerimeterX') ||
      pageContent.includes('pxApps')) {
    return { detected: true, reason: 'perimeterx_detection', action: 'cooldown' };
  }

  // Human Verification
  if (pageContent.includes('Please verify you are a human') ||
      pageContent.includes('verify that you are human')) {
    return { detected: true, reason: 'human_verification', action: 'cooldown' };
  }

  return { detected: false };
}
```

### Action Matrix

| Detection Reason        | Action       | Duration    | Retry     |
|------------------------|--------------|-------------|-----------|
| 403 Forbidden          | Blacklist    | Permanent   | Never     |
| Connection Failed      | Blacklist    | Permanent   | Never     |
| PerimeterX CAPTCHA     | Cooldown     | 5 minutes   | Auto      |
| Access Denied Page     | Cooldown     | 5 minutes   | Auto      |
| Human Verification     | Cooldown     | 5 minutes   | Auto      |
| Timeout (no bot signs) | Retry        | Immediate   | Different proxy |
| 5+ Bot Detections      | Blacklist    | Permanent   | Never     |

---

## 📊 Database Schema Updates

### New Table: proxy_states

```sql
CREATE TABLE proxy_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proxy TEXT UNIQUE NOT NULL,
  state TEXT NOT NULL DEFAULT 'active',
  last_used DATETIME,
  last_error TEXT,
  error_count INTEGER DEFAULT 0,
  bot_detections INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  cooldown_until DATETIME,
  blacklisted_at DATETIME,
  blacklist_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_proxy ON proxy_states(proxy);
CREATE INDEX idx_state ON proxy_states(state);
CREATE INDEX idx_cooldown_until ON proxy_states(cooldown_until);
```

### Existing Tables (Unchanged)
- `flights` - Same as before
- `scrape_log` - Same as before

---

## 🎯 Implementation Priority

### Phase 1: Core Infrastructure
1. Create `proxy-manager.js` with ProxyManager class
2. Create `proxies.db` database with schema
3. Update `scraper.js` with bot detection logic
4. Test proxy state transitions

### Phase 2: API Updates
1. Remove Scrapfly endpoints
2. Add proxy CRUD endpoints
3. Update `/api/search` to use ProxyManager
4. Test API endpoints

### Phase 3: Frontend
1. Remove Scrapfly UI elements
2. Add proxy management section
3. Add proxy stats display
4. Add proxy status modal
5. Test UI interactions

### Phase 4: Testing
1. Test bot detection with various scenarios
2. Test cooldown expiration
3. Test blacklist functionality
4. Load test with multiple concurrent requests

---

## 🔑 Critical Success Factors

1. **Proxy Manager Database** - Must persist state across restarts
2. **Cooldown Timing** - Must be exactly 5 minutes (300,000 ms)
3. **Bot Detection Accuracy** - Must catch all PerimeterX patterns
4. **Element Wait Strategy** - `.ibe-flight-info` must reliably indicate success
5. **Retry Logic** - Must try different proxies, not the same one
6. **State Cleanup** - Must auto-reset expired cooldowns before selecting proxy

---

## 📝 Configuration

### Environment Variables
```bash
PORT=3000
PROXY_DB_PATH=./proxies.db
FLIGHTS_DB_PATH=./flights.db
COOLDOWN_DURATION_MS=300000  # 5 minutes
MAX_BOT_DETECTIONS=5         # Blacklist after 5 detections
SCRAPE_TIMEOUT_MS=60000      # 1 minute timeout
ELEMENT_WAIT_MS=30000        # 30 seconds to wait for .ibe-flight-info
```

### Default Proxy List
47 proxies from `premium-proxies.js` (user can edit via UI)

---

## 🚀 Deployment Notes

1. **Database Initialization**: On first run, create `proxies.db` and seed with default proxies
2. **Proxy Persistence**: Proxy states persist across server restarts
3. **Scheduled Cleanup**: Optional cron job to reset old cooldowns (though auto-handled)
4. **Monitoring**: Log all bot detections for pattern analysis
5. **Backup**: Backup `proxies.db` to preserve proxy statistics

---

## 🔄 Migration from Old System

### Files to Delete
- `scrapfly.js`
- `browseai.js` (already deprecated)

### Files to Create
- `proxy-manager.js`
- `proxies.db` (auto-created on first run)

### Files to Modify
- `scraper.js` - Add bot detection, element waiting
- `server.js` - Remove Scrapfly, add proxy endpoints
- `public/index.html` - Remove Scrapfly UI, add proxy management
- `premium-proxies.js` - Keep for default list, but allow user edits

### Data Migration
- Export current 47 proxies to `proxies.db` with state="active"

---

This updated architecture focuses on intelligent, self-managing proxy rotation with automatic bot detection and recovery. The system is fully self-contained without external API dependencies.
