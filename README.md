# Frontier GoWild Flight Scraper

A web application that scrapes Frontier Airlines for GoWild flight availability between specific airports on specific dates.

## 🎯 Features

- ✅ **Scrapfly API Integration** - Bypasses bot protection and extracts flight data
- ✅ **Premium Proxy Support** - 47 premium proxies for direct scraping mode
- ✅ **Smart Parsing** - Extracts FlightData JSON directly from rendered pages
- ✅ **SQLite Caching** - 6-hour cache reduces API calls
- ✅ **140+ Airports** - Complete Frontier network coverage (882 routes)
- ✅ **Clean UI** - Responsive interface with city-based airport sorting
- ✅ **Detailed Flight Info** - Price, duration, stops, times

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Open `http://localhost:3000` in your browser.

## ✅ Current Status

### What's Working
- ✅ **Scrapfly API** - Fully functional, extracts GoWild fares
- ✅ **FlightData Parsing** - Extracts from JavaScript variable
- ✅ **Database** - Stores flights with duration, stops, price
- ✅ **UI** - City-sorted airports, real-time results
- ✅ **Error Handling** - Detailed error messages and suggestions

### Direct Scraping Status
Direct scraping now uses **Playwright** with stealth plugins:
- ✅ **Playwright Installed** - Headless Chromium with anti-detection
- ✅ **JavaScript Rendering** - Extracts FlightData from rendered pages
- ✅ **Stealth Mode** - Uses playwright-extra with stealth plugins
- ⚠️ **Still Blocked** - Frontier's bot protection detects automation

**Why Frontier Still Blocks It:**
Frontier uses sophisticated bot detection that identifies automation even with stealth plugins. The containerized environment may make detection easier.

**Options:**
1. **Scrapfly API (Recommended)** - Advanced anti-scraping protection (ASP) with residential proxies
2. **Local Machine** - Direct scraping might work better on your local machine
3. **Residential Proxies** - Could be added to Playwright for better success rate

**Recommendation:** Use Scrapfly API mode (default) for reliable results.

## 🔒 Premium Proxies

The application includes 47 premium proxies that can be used with direct scraping mode to improve success rates and avoid IP blocking.

### Using Proxies

**In the Web UI:**
1. Select "Direct Scraping" mode
2. Check the "Use premium proxies" checkbox (47 available)
3. A random proxy will be automatically selected for each request

**Testing Proxies:**
```bash
# Test proxy list
node test-premium-proxies.js

# Test proxy connection
node test-scraper-with-proxy.js

# Test full scraping with proxy
node test-frontier-with-proxy.js ORD CUN 2025-12-01
```

**In Code:**
```javascript
const { scrapeFrontierDirect } = require('./scraper');

// With proxy
const flights = await scrapeFrontierDirect('ORD', 'CUN', '2025-12-01', { useProxy: true });

// Without proxy
const flights = await scrapeFrontierDirect('ORD', 'CUN', '2025-12-01', { useProxy: false });
```

**Proxy Features:**
- 47 premium proxies on port 3129
- Automatic random selection
- Works with Playwright stealth mode
- Reduces IP-based blocking
- No authentication required

## 🔧 How It Works

### Step 1: Create a Robot
1. Go to https://browse.ai
2. Log in with your account (using the credentials: 1493test)
3. Create a new robot/scraper
4. Set it to scrape: `https://booking.flyfrontier.com/Flight/InternalSelect?o1=ORD&d1=CUN&dd1=2025-11-15&adt=1&umnr=false&loy=false&mon=true&ftype=GW`

### Step 2: Configure the Robot
The robot should extract:
- `price`: Flight price (e.g., "$80")
- `departure_time`: Departure time
- `arrival_time`: Arrival time
- `stops`: Number of stops (e.g., "Nonstop", "1 Stop")
- `available`: Whether the flight is available (not sold out)

### Step 3: Get Robot ID
Once created, copy the Robot ID (looks like `rob_xxxxx`)

### Step 4: Test the Integration
1. Open the web interface at `http://localhost:3000`
2. Click "Test Browse.ai" button - it should show your available robots
3. Update `browseai.js` to use your robot ID, or pass it via the API

### Step 5: Update the Code (Optional)
Edit `browseai.js` line 45 and set your default robot ID:
```javascript
if (robotId) {
  // ... existing code
} else {
  // Change this line to use your robot ID by default
  robotId = 'rob_YOUR_ROBOT_ID_HERE';
}
```

## API Documentation

### Search for Flights
```bash
POST /api/search
Content-Type: application/json

{
  "origin": "ORD",
  "destination": "CUN",
  "date": "2025-11-15",
  "method": "api",          # "direct" (Playwright) or "api" (Scrapfly)
  "useCache": true,         # Use cached data if available (6-hour cache)
  "useProxy": true          # Use premium proxies (for direct mode only)
}
```

### Get Available Airports
```bash
GET /api/airports
```

### Test Scrapfly Connection
```bash
GET /api/test-scrapfly
```

### Get Proxy Information
```bash
GET /api/proxy-info
```

## Database Schema

### Flights Table
- `id`: Auto-increment primary key
- `origin`: Origin airport code
- `destination`: Destination airport code
- `date`: Flight date (YYYY-MM-DD)
- `departure_time`: Departure time
- `arrival_time`: Arrival time
- `stops`: Number of stops
- `price`: Flight price
- `available`: 1 if available, 0 if sold out
- `scrape_method`: "direct" or "browseai"
- `scraped_at`: Timestamp of when data was scraped

### Scrape Log Table
Tracks all scraping attempts for debugging and analytics.

## Project Structure

```
├── server.js                    # Express server and API routes
├── database.js                  # SQLite database functions
├── scraper.js                   # Direct scraping with Playwright + proxy support
├── scrapfly.js                  # Scrapfly API integration (recommended)
├── browseai.js                  # Browse.ai API integration (deprecated)
├── premium-proxies.js           # Premium proxy list (47 proxies)
├── package.json                 # Dependencies (includes playwright, playwright-extra)
├── flights.db                   # SQLite database (created on first run)
├── test-direct-scraper.js       # Test script for direct scraping
├── test-playwright-basic.js     # Test script for Playwright functionality
├── test-premium-proxies.js      # Test script for proxy validation
├── test-scraper-with-proxy.js   # Test script for proxy connectivity
├── test-frontier-with-proxy.js  # Test script for scraping with proxies
└── public/
    └── index.html               # Frontend interface
```

## Next Steps

1. **Set up Browse.ai robot** (see instructions above)
2. **Test with working robot ID**
3. **Parse Browse.ai results** - Adjust the `parseBrowseAIResults()` function based on actual data structure
4. **Add bulk scraping** - Create a background job to scrape all routes periodically
5. **Add user authentication** - For tiered access (free vs paid)
6. **Optimize scraping** - Add more sophisticated parsing based on actual HTML structure
7. **Deploy** - Deploy to a cloud platform (Heroku, Railway, Render, etc.)

## Environment Variables (Optional)

You can set these in a `.env` file:

```bash
PORT=3000
BROWSEAI_API_KEY=your_key_here
DEFAULT_ROBOT_ID=rob_xxxxx
CACHE_DURATION_HOURS=6
```

## Route Coverage

The application supports all 882 Frontier routes. See the full list in `server.js` under the `AIRPORTS` object.

## Troubleshooting

### Direct Scraping Shows "Access Denied"
**Expected behavior** - Frontier's bot protection blocks automated requests even with Playwright stealth mode.

**Solutions:**
1. Use **Scrapfly API mode** (recommended - works reliably)
2. Try running on your **local machine** instead of in a container
3. Consider adding **residential proxies** to Playwright

### Scrapfly API Fails
1. Check your API key is correct in `scrapfly.js`
2. Verify you have credits remaining
3. Check internet connectivity
4. Review error logs for timeout or rejection codes

### No Flights Found
1. Check that the route exists in Frontier's schedule
2. Verify the date format is YYYY-MM-DD
3. Check if flights are actually available on that date
4. Review `scrapfly_output.html` or `direct_scraper_output.html` for debugging

### Playwright Crashes
If direct scraping crashes the browser:
1. Already using `--single-process` flag for containers
2. May need more system resources
3. Try increasing timeout values
4. Use Scrapfly API instead

## Contributing

To add more features:
1. Add new API endpoints in `server.js`
2. Update database schema in `database.js`
3. Modify frontend in `public/index.html`

## License

ISC
