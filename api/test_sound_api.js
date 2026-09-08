/**
 * Test script for Sound API endpoints
 * Run this after starting the server to verify API functionality
 */

const testSoundApi = async () => {
  console.log('Testing Sound API endpoints...\n');

  // Test GET /api/sounds
  try {
    console.log('1. Testing GET /api/sounds...');
    const getResponse = await fetch('/api/sounds', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer YOUR_AUTH_TOKEN_HERE',
        'Content-Type': 'application/json'
      }
    });
    console.log(`   Status: ${getResponse.status}`);
    if (getResponse.ok) {
      const sounds = await getResponse.json();
      console.log(`   Response: Found ${sounds.length} sounds`);
    } else {
      console.log(`   Error: ${await getResponse.text()}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}\n`);
  }

  // Test POST /api/sounds/upload
  try {
    console.log('\n2. Testing POST /api/sounds/upload...');
    const formData = new FormData();
    // Note: You'd need an actual audio file for this test
    // formData.append('sound', audioFile, 'test.mp3');
    
    console.log('   Skipping upload test - requires actual file');
  } catch (error) {
    console.log(`   Error: ${error.message}\n`);
  }

  // Test PUT /api/sounds/:id/rename
  try {
    console.log('\n3. Testing PUT /api/sounds/:id/rename...');
    const renameResponse = await fetch('/api/sounds/SOME_SOUND_ID/rename', {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer YOUR_AUTH_TOKEN_HERE',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'New Sound Name' })
    });
    console.log(`   Status: ${renameResponse.status}`);
    if (renameResponse.ok) {
      const updatedSound = await renameResponse.json();
      console.log(`   Response: ${JSON.stringify(updatedSound)}`);
    } else {
      console.log(`   Error: ${await renameResponse.text()}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}\n`);
  }

  // Test DELETE /api/sounds/:id
  try {
    console.log('\n4. Testing DELETE /api/sounds/:id...');
    const deleteResponse = await fetch('/api/sounds/SOME_SOUND_ID', {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer YOUR_AUTH_TOKEN_HERE'
      }
    });
    console.log(`   Status: ${deleteResponse.status}`);
    if (deleteResponse.status === 204) {
      console.log('   Response: Sound deleted successfully');
    } else {
      console.log(`   Error: ${await deleteResponse.text()}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}\n`);
  }

  // Test PUT /api/waypoints/:id/sound
  try {
    console.log('\n5. Testing PUT /api/waypoints/:id/sound...');
    const assignResponse = await fetch('/api/waypoints/SOME_WAYPOINT_ID/sound', {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer YOUR_AUTH_TOKEN_HERE',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ soundId: 'SOME_SOUND_ID' })
    });
    console.log(`   Status: ${assignResponse.status}`);
    if (assignResponse.ok) {
      const result = await assignResponse.json();
      console.log(`   Response: ${JSON.stringify(result)}`);
    } else {
      console.log(`   Error: ${await assignResponse.text()}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}\n`);
  }

  // Test GET /api/sounds/:id/usage
  try {
    console.log('\n6. Testing GET /api/sounds/:id/usage...');
    const usageResponse = await fetch('/api/sounds/SOME_SOUND_ID/usage', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer YOUR_AUTH_TOKEN_HERE'
      }
    });
    console.log(`   Status: ${usageResponse.status}`);
    if (usageResponse.ok) {
      const usage = await usageResponse.json();
      console.log(`   Response: ${JSON.stringify(usage)}`);
    } else {
      console.log(`   Error: ${await usageResponse.text()}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}\n`);
  }

  console.log('\nSound API tests completed.');
};

console.log('Sound API Test Script');
console.log('Note: This script is for reference only - actual testing requires:');
console.log('- A running server');
console.log('- Valid authentication token');
console.log('- Actual sound/waypoint IDs\n');

// Uncomment to run tests when appropriate:
// testSoundApi();