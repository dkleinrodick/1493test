# Frontier GoWild Flight Scraper

A web application that scrapes Frontier Airlines for GoWild flight availability between specific airports on specific dates.

## 🎯 Features

- ✅ **Scrapfly API Integration** - Bypasses bot protection and extracts flight data
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

### Why Direct Scraping Doesn't Work
Direct scraping fails because:
1. **Frontier blocks automated requests** (403 Forbidden)
2. **JavaScript execution required** - FlightData loads via JS
3. **Would need Puppeteer** - Headless Chrome to render page

**Solution:** Scrapfly already does all of this! It renders JavaScript, bypasses bot protection, and returns the fully rendered page. Just use Scrapfly mode (default).

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
  "method": "api",          # "direct" or "api"
  "useCache": true,         # Use cached data if available
  "robotId": "rob_xxxxx"    # Browse.ai robot ID (optional)
}
```

### Get Available Airports
```bash
GET /api/airports
```

### Test Browse.ai Connection
```bash
GET /api/test-browseai
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
├── server.js           # Express server and API routes
├── database.js         # SQLite database functions
├── scraper.js          # Direct scraping logic
├── browseai.js         # Browse.ai API integration
├── package.json        # Dependencies
├── flights.db          # SQLite database (created on first run)
└── public/
    └── index.html      # Frontend interface
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

### Direct Scraping Returns 403
This is expected - Frontier blocks automated requests. Use Browse.ai API mode instead.

### Browse.ai API Fails
1. Check your API key is correct
2. Verify you have credits remaining (currently on free plan with 50 credits)
3. Check that your robot is configured correctly
4. Use the "Test Browse.ai" button to verify connection

### No Flights Found
1. Check that the route exists in Frontier's schedule
2. Verify the date format is YYYY-MM-DD
3. Check if flights are actually available on that date
4. Review `debug_output.html` if using direct scraping (though it won't work due to 403)

## Contributing

To add more features:
1. Add new API endpoints in `server.js`
2. Update database schema in `database.js`
3. Modify frontend in `public/index.html`

## License

ISC
