// Test different Scrapfly configurations to compare costs
const axios = require('axios');

const SCRAPFLY_API_KEY = 'scp-live-c07f17fbff654e8188cd5308fa92018d';
const SCRAPFLY_BASE_URL = 'https://api.scrapfly.io/scrape';

// Test configurations with different cost profiles
const CONFIGS = {
  'Minimal (Cheapest)': {
    key: SCRAPFLY_API_KEY,
    url: 'https://booking.flyfrontier.com/Flight/InternalSelect?o1=ORD&d1=CUN&dd1=2025-11-15&adt=1&umnr=false&loy=false&mon=true&ftype=GW',
    country: 'us',
    retry: true
    // asp: false (default)
    // render_js: false (default)
  },

  'ASP Only (Moderate)': {
    key: SCRAPFLY_API_KEY,
    url: 'https://booking.flyfrontier.com/Flight/InternalSelect?o1=ORD&d1=CUN&dd1=2025-11-15&adt=1&umnr=false&loy=false&mon=true&ftype=GW',
    asp: true,              // Anti-scraping protection
    country: 'us',
    retry: true
    // render_js: false (no browser)
  },

  'Current (Most Expensive)': {
    key: SCRAPFLY_API_KEY,
    url: 'https://booking.flyfrontier.com/Flight/InternalSelect?o1=ORD&d1=CUN&dd1=2025-11-15&adt=1&umnr=false&loy=false&mon=true&ftype=GW',
    asp: true,              // Anti-scraping protection
    render_js: true,        // Browser rendering (expensive)
    country: 'us',
    rendering_wait: 5000,
    retry: true
  }
};

async function testConfiguration(name, params) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`${'='.repeat(60)}`);
  console.log('Parameters:', JSON.stringify(params, null, 2));

  const startTime = Date.now();

  try {
    const scrapflyUrl = `${SCRAPFLY_BASE_URL}?${new URLSearchParams(params).toString()}`;

    const response = await axios.get(scrapflyUrl, {
      timeout: 90000, // 90 seconds
      headers: {
        'Accept': 'application/json'
      }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Extract cost and other metadata
    const cost = response.headers['x-scrapfly-api-cost'];
    const remainingCredit = response.headers['x-scrapfly-remaining-api-credit'];
    const statusCode = response.status;

    console.log(`\n✅ SUCCESS`);
    console.log(`   HTTP Status: ${statusCode}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   💰 API Cost: ${cost} credits`);
    console.log(`   Remaining Credit: ${remainingCredit}`);

    // Check if we got FlightData
    const result = response.data.result;
    const html = result.content;
    const hasFlightData = html.includes('FlightData');

    console.log(`   HTML Length: ${html.length} characters`);
    console.log(`   Contains FlightData: ${hasFlightData ? '✓ YES' : '✗ NO'}`);

    // Try to parse FlightData
    if (hasFlightData) {
      const match = html.match(/FlightData\s*=\s*['"]({[^'"]+})['"]/);
      if (match) {
        try {
          const jsonString = match[1].replace(/&quot;/g, '"');
          const flightData = JSON.parse(jsonString);
          const journeyCount = flightData.journeys?.length || 0;
          console.log(`   ✓ Parsed FlightData: ${journeyCount} journey(s)`);
        } catch (e) {
          console.log(`   ✗ FlightData found but failed to parse`);
        }
      }
    }

    return {
      success: true,
      cost: parseFloat(cost) || 0,
      duration: parseFloat(duration),
      hasData: hasFlightData,
      statusCode
    };

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n❌ FAILED`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Error: ${error.message}`);

    if (error.response) {
      console.log(`   HTTP Status: ${error.response.status}`);
      console.log(`   💰 API Cost: ${error.response.headers['x-scrapfly-api-cost'] || 'N/A'}`);

      if (error.response.headers['x-scrapfly-reject-code']) {
        console.log(`   Reject Code: ${error.response.headers['x-scrapfly-reject-code']}`);
        console.log(`   Reject Reason: ${error.response.headers['x-scrapfly-reject-description']}`);
      }
    }

    return {
      success: false,
      cost: 0,
      duration: parseFloat(duration),
      error: error.message
    };
  }
}

async function runAllTests() {
  console.log('\n🧪 Scrapfly Cost Comparison Test');
  console.log('Testing different configurations to find the cheapest working option\n');
  console.log('Target: Frontier Airlines GoWild flights');
  console.log('Route: ORD → CUN on 2025-11-15\n');

  const results = {};

  // Test each configuration
  for (const [name, params] of Object.entries(CONFIGS)) {
    results[name] = await testConfiguration(name, params);

    // Wait 2 seconds between tests to avoid rate limiting
    if (Object.keys(results).length < Object.keys(CONFIGS).length) {
      console.log('\n⏳ Waiting 2 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 SUMMARY');
  console.log(`${'='.repeat(60)}\n`);

  const successfulTests = Object.entries(results).filter(([_, r]) => r.success);
  const failedTests = Object.entries(results).filter(([_, r]) => !r.success);

  console.log('Successful Configurations:');
  successfulTests.forEach(([name, result]) => {
    const dataStatus = result.hasData ? '✓ Has FlightData' : '✗ No FlightData';
    console.log(`  ${name}:`);
    console.log(`    💰 Cost: ${result.cost} credits`);
    console.log(`    ⏱️  Time: ${result.duration}s`);
    console.log(`    📊 Data: ${dataStatus}`);
  });

  if (failedTests.length > 0) {
    console.log('\nFailed Configurations:');
    failedTests.forEach(([name, result]) => {
      console.log(`  ${name}: ${result.error}`);
    });
  }

  // Find the cheapest working option
  const cheapestWorking = successfulTests
    .filter(([_, r]) => r.hasData)
    .sort(([_, a], [__, b]) => a.cost - b.cost)[0];

  if (cheapestWorking) {
    const [name, result] = cheapestWorking;
    const savings = results['Current (Most Expensive)']?.cost
      ? ((1 - result.cost / results['Current (Most Expensive)'].cost) * 100).toFixed(1)
      : 0;

    console.log('\n🏆 RECOMMENDATION:');
    console.log(`   Use: ${name}`);
    console.log(`   💰 Cost: ${result.cost} credits per request`);
    console.log(`   💵 Savings: ${savings}% cheaper than current config`);
    console.log(`   ⏱️  Speed: ${result.duration}s per request`);
  }

  console.log('\n');
}

// Run tests
runAllTests().catch(console.error);
