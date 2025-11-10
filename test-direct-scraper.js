// Quick test of direct scraper
const { scrapeFrontierDirect } = require('./scraper');

async function test() {
  console.log('Testing direct scraper with Playwright...\n');

  try {
    const flights = await scrapeFrontierDirect('ORD', 'CUN', '2025-11-15');

    console.log('\n=== RESULTS ===');
    console.log(`Found ${flights.length} flights`);

    if (flights.length > 0) {
      console.log('\nFirst few flights:');
      flights.slice(0, 3).forEach((flight, i) => {
        console.log(`\n${i + 1}. ${flight.origin} → ${flight.destination}`);
        console.log(`   Price: $${flight.price}`);
        console.log(`   Departure: ${flight.departure_time}`);
        console.log(`   Arrival: ${flight.arrival_time}`);
        console.log(`   Duration: ${flight.duration}`);
        console.log(`   Stops: ${flight.stops}`);
      });
    }

    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
  }
}

test();
