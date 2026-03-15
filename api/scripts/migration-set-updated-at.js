/**
 * Migration: Set updated_at for existing soundscapes
 * 
 * Usage: node scripts/migration-set-updated-at.js
 * 
 * This script ensures all soundscapes have updated_at populated.
 * For soundscapes that haven't been modified, it uses created_at.
 */

const db = require('../database');

async function runMigration() {
  console.log('🔄 Starting migration: Set updated_at for existing soundscapes...\n');

  try {
    // Update soundscapes
    const soundscapeResult = await db.query(`
      UPDATE soundscapes 
      SET updated_at = created_at 
      WHERE updated_at IS NULL
      RETURNING id, name, created_at, updated_at
    `);

    console.log(`✅ Soundscapes updated: ${soundscapeResult.rows.length} rows`);
    if (soundscapeResult.rows.length > 0) {
      console.log('   Sample updated soundscapes:');
      soundscapeResult.rows.slice(0, 3).forEach(row => {
        console.log(`   - ${row.name} (${row.id}): ${row.updated_at}`);
      });
    }

    // Update waypoints
    const waypointResult = await db.query(`
      UPDATE waypoints 
      SET updated_at = created_at 
      WHERE updated_at IS NULL
      RETURNING id, name, created_at, updated_at
    `);

    console.log(`\n✅ Waypoints updated: ${waypointResult.rows.length} rows`);
    if (waypointResult.rows.length > 0) {
      console.log('   Sample updated waypoints:');
      waypointResult.rows.slice(0, 3).forEach(row => {
        console.log(`   - ${row.name} (${row.id}): ${row.updated_at}`);
      });
    }

    // Verify migration
    console.log('\n📊 Verification:');
    const stats = await db.query(`
      SELECT 
        'soundscapes' as table_name,
        COUNT(*) as total_rows,
        COUNT(updated_at) as with_updated_at,
        MIN(updated_at) as earliest_update,
        MAX(updated_at) as latest_update
      FROM soundscapes
      UNION ALL
      SELECT 
        'waypoints' as table_name,
        COUNT(*) as total_rows,
        COUNT(updated_at) as with_updated_at,
        MIN(updated_at) as earliest_update,
        MAX(updated_at) as latest_update
      FROM waypoints
    `);

    stats.rows.forEach(stat => {
      console.log(`   ${stat.table_name}: ${stat.with_updated_at}/${stat.total_rows} rows have updated_at`);
      console.log(`     Range: ${stat.earliest_update} to ${stat.latest_update}`);
    });

    console.log('\n✅ Migration completed successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
