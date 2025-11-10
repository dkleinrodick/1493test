# Frontier GoWild Flight Scraper

A web application that scrapes Frontier Airlines for GoWild flight availability between specific airports on specific dates.

## Features

- ✅ Search for GoWild flights by origin, destination, and date
- ✅ Two scraping modes:
  - **Direct Scraping**: Attempts to scrape Frontier's booking page directly (currently blocked by 403)
  - **Browse.ai API**: Uses Browse.ai's scraping service (requires setup)
- ✅ SQLite database caching (6-hour cache by default)
- ✅ Rate limiting (10 seconds between direct requests, 2 seconds for API)
- ✅ Clean, responsive web interface
- ✅ Support for 140+ airports and 882 routes

## Installation

```bash
# Install dependencies
npm install

# Start the server
npm start

# For development with auto-reload
npm run dev
```

The application will be available at `http://localhost:3000`

## Current Status

### ✅ What's Working
- Express server with REST API
- SQLite database with flight caching
- Frontend interface with airport selection
- Rate limiting system
- Browse.ai API integration (configured)

### ⚠️ Known Issues
1. **Direct scraping is blocked (403 error)**: Frontier's website blocks automated requests. This is expected and why Browse.ai integration exists.
2. **Browse.ai robot needs configuration**: You need to create a robot on Browse.ai that scrapes Frontier's flight results.

## Browse.ai Setup Instructions

Since direct scraping is blocked by Frontier, you'll need to configure Browse.ai:

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
