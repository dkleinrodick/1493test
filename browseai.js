const axios = require('axios');

// Browse.ai API credentials
const BROWSEAI_API_KEY = '8331625c-d022-450a-afbb-4c6eebf7795f:5aec169f-7b24-41f5-b01d-d89c5b37fcc3';
const BROWSEAI_BASE_URL = 'https://api.browse.ai/v2';

// Rate limiting for API
let lastApiRequestTime = 0;
const MIN_API_REQUEST_INTERVAL = 2000; // 2 seconds for API

async function waitForApiRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastApiRequestTime;

  if (timeSinceLastRequest < MIN_API_REQUEST_INTERVAL) {
    const waitTime = MIN_API_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastApiRequestTime = Date.now();
}

async function scrapeFrontierWithBrowseAI(origin, destination, date, robotId = null) {
  await waitForApiRateLimit();

  try {
    // If no robot ID provided, we need to create a robot or use a pre-configured one
    // For now, let's assume we need to use the monitoring/bulk run endpoint

    const url = `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${origin}&d1=${destination}&dd1=${date}&adt=1&umnr=false&loy=false&mon=true&ftype=GW`;

    console.log(`Scraping via Browse.ai API: ${origin} -> ${destination} on ${date}`);

    // If we have a robot ID, use it to create a task
    if (robotId) {
      const response = await axios.post(
        `${BROWSEAI_BASE_URL}/robots/${robotId}/tasks`,
        {
          inputParameters: {
            originUrl: url
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${BROWSEAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const taskId = response.data.result.id;
      console.log(`Browse.ai task created: ${taskId}`);

      // Poll for results
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        const statusResponse = await axios.get(
          `${BROWSEAI_BASE_URL}/robots/${robotId}/tasks/${taskId}`,
          {
            headers: {
              'Authorization': `Bearer ${BROWSEAI_API_KEY}`
            }
          }
        );

        const task = statusResponse.data.result;

        if (task.status === 'successful') {
          console.log('Browse.ai task completed successfully');
          return parseBrowseAIResults(task.capturedLists, origin, destination, date);
        } else if (task.status === 'failed') {
          throw new Error(`Browse.ai task failed: ${task.error || 'Unknown error'}`);
        }

        attempts++;
      }

      throw new Error('Browse.ai task timeout');
    } else {
      // No robot configured - return error with instructions
      throw new Error(
        'No Browse.ai robot configured. Please create a robot at https://browse.ai and provide the robot ID. ' +
        'The robot should scrape the Frontier GoWild search results page.'
      );
    }

  } catch (error) {
    console.error('Error with Browse.ai API:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    throw error;
  }
}

function parseBrowseAIResults(capturedData, origin, destination, date) {
  const flights = [];

  try {
    // Parse the captured data structure from Browse.ai
    // The exact structure depends on how the robot is configured
    // This is a generic parser that can be adjusted

    if (!capturedData || Object.keys(capturedData).length === 0) {
      console.log('No captured data from Browse.ai');
      return flights;
    }

    // Assuming capturedData has a list of flights
    const flightsList = capturedData.flights || capturedData.results || [];

    for (const flight of flightsList) {
      // Extract flight details based on Browse.ai's captured structure
      const price = parseFloat((flight.price || '').replace(/[^0-9.]/g, ''));
      const departureTime = flight.departure_time || flight.depart || '';
      const arrivalTime = flight.arrival_time || flight.arrive || '';
      const stops = flight.stops || 'Unknown';
      const available = flight.available !== false; // Assume available unless explicitly marked

      if (price && departureTime && arrivalTime) {
        flights.push({
          origin,
          destination,
          date,
          departure_time: departureTime,
          arrival_time: arrivalTime,
          stops,
          price,
          available,
          scrape_method: 'browseai'
        });
      }
    }

    console.log(`Parsed ${flights.length} flights from Browse.ai`);

  } catch (error) {
    console.error('Error parsing Browse.ai results:', error.message);
  }

  return flights;
}

// Test API connection
async function testBrowseAIConnection() {
  try {
    const response = await axios.get(
      `${BROWSEAI_BASE_URL}/robots`,
      {
        headers: {
          'Authorization': `Bearer ${BROWSEAI_API_KEY}`
        }
      }
    );

    console.log('Browse.ai API connection successful');
    console.log('Available robots:', response.data.result.robots.length);
    return response.data.result.robots;
  } catch (error) {
    console.error('Browse.ai API connection failed:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    throw error;
  }
}

module.exports = {
  scrapeFrontierWithBrowseAI,
  testBrowseAIConnection
};
