# Proxy Setup Guide

This guide explains how to enable and use proxy rotation to bypass bot detection.

## Quick Start

1. **Enable Proxy Mode**

   Edit `config.js` and set:
   ```javascript
   USE_PROXIES: true
   ```

2. **Run the Scraper**

   ```bash
   npm start
   ```

   On first run, it will:
   - Automatically download 500 proxies from Geonode API
   - Save them to `proxy_list.json`
   - Try proxies one by one until one works

## How It Works

### Proxy Rotation
- When bot detection occurs (e.g., "Press & Hold" challenges), the scraper automatically tries the next proxy
- It will try up to 10 proxies by default (configurable via `MAX_PROXY_RETRIES`)
- Progress is saved in `proxy_state.json` so it remembers where it left off

### State Persistence
The scraper saves its state between runs:
- **proxy_list.json**: List of 500 proxies (refreshed if older than 24 hours)
- **proxy_state.json**: Current position in the proxy list and last working proxy

### Proxy Source
Proxies are fetched from: `https://proxylist.geonode.com/api/proxy-list`
- 500 proxies per fetch
- Sorted by most recently checked
- Includes country, uptime, and response time information

## Configuration Options

Edit `config.js` to customize:

```javascript
{
  // Enable/disable proxy rotation
  USE_PROXIES: false,  // Set to true to enable

  // How many proxies to try before giving up
  MAX_PROXY_RETRIES: 10,

  // Time between requests (milliseconds)
  MIN_REQUEST_INTERVAL: 10000
}
```

## Files Created

When using proxies, these files are created:

- `proxy_list.json` - List of available proxies
- `proxy_state.json` - Current state (which proxy we're on)
- `direct_scraper_output.html` - Last page HTML (for debugging)
- `direct_scraper_screenshot.png` - Last page screenshot (for debugging)
- `flightdata_*.json` - FlightData extraction outputs (if successful)

## Troubleshooting

### All Proxies Failed
If all proxies fail, you can:

1. **Refresh the proxy list**:
   ```bash
   rm proxy_list.json
   npm start
   ```

2. **Increase retry count** in `config.js`:
   ```javascript
   MAX_PROXY_RETRIES: 20  // Try more proxies
   ```

3. **Use Scrapfly API instead** (more reliable but costs money)

### Reset Proxy State
To start from the beginning of the proxy list:
```bash
rm proxy_state.json
```

### Check Proxy Status
The console will show:
- Current proxy being tried: `[Attempt X/Y] Trying proxy: IP:PORT (Country)`
- Bot detection: `🤖 Bot detection triggered!`
- Success: `✅ Success with proxy: IP:PORT (Country)`
- Failures: `⚠️ FlightData not found, trying next proxy...`

## Example Output

```
Proxy mode: ENABLED
Fetching proxy list from Geonode API...
✓ Fetched 500 proxies and saved to proxy_list.json

[Attempt 1/10] Trying proxy: 123.45.67.89:8080 (US)
Navigating to Frontier booking page...
✓ Page navigation successful (DOM loaded)
🤖 Bot detection triggered!
🔄 Retrying with next proxy (attempt 2/10)...

[Attempt 2/10] Trying proxy: 98.76.54.32:3128 (CA)
Navigating to Frontier booking page...
✓ FlightData found!
✓ Successfully parsed FlightData JSON
✅ Success with proxy: 98.76.54.32:3128 (CA)
✓ Total GoWild flights found: 5
```

## Notes

- Free proxies from Geonode may have varying reliability
- Some proxies may be slow or offline
- The scraper automatically skips failed proxies and tries the next one
- Proxy list is cached for 24 hours to avoid excessive API calls
- State is saved after each proxy attempt to resume from the same spot
