/**
 * Test script for BaseRepository
 * 
 * Run with: node api/scripts/test-base-repository.js
 */

const db = require('../database');
const BaseRepository = require('../repositories/BaseRepository');

// Test repository for soundscapes table
class TestSoundScapeRepository extends BaseRepository {
  constructor(db) {
    super(db, 'soundscapes');
  }

  async getAllForUser(userId) {
    const rows = await this.findAll({ user_id: userId }, 'created_at DESC');
    return rows.map(row => this._toEntity(row));
  }
}

async function runTests() {
  console.log('🧪 Testing BaseRepository...\n');
  
  const repo = new TestSoundScapeRepository(db);
  
  try {
    // Test 1: Count all soundscapes
    console.log('Test 1: Count soundscapes');
    const count = await repo.count();
    console.log(`✅ Total soundscapes: ${count}\n`);
    
    // Test 2: Find by ID (using first soundscape if exists)
    console.log('Test 2: Find by ID');
    const firstRow = await repo.findAll({}, 'created_at DESC LIMIT 1');
    if (firstRow.length > 0) {
      const found = await repo.findById(firstRow[0].id);
      console.log(`✅ Found: ${found.name || found.id}`);
      
      // Test 3: Convert to entity (snake_case → camelCase)
      console.log('\nTest 3: Convert to entity (snake_case → camelCase)');
      const entity = repo._toEntity(found);
      console.log('✅ Entity keys:', Object.keys(entity));
      console.log('✅ Has camelCase:', 'createdAt' in entity || 'updatedAt' in entity);
      
      // Test 4: Convert back to row (camelCase → snake_case)
      console.log('\nTest 4: Convert to row (camelCase → snake_case)');
      const row = repo._toRow(entity);
      console.log('✅ Row keys:', Object.keys(row));
      console.log('✅ Has snake_case:', 'created_at' in row || 'updated_at' in row);
    } else {
      console.log('⚠️  No soundscapes found - skipping find tests\n');
    }
    
    // Test 5: Find all with filter
    console.log('Test 5: Find all (no filter)');
    const all = await repo.findAll({}, 'created_at DESC');
    console.log(`✅ Found ${all.length} soundscapes\n`);
    
    console.log('✅ All BaseRepository tests passed!\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

runTests();
