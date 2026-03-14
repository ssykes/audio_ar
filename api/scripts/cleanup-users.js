/**
 * Cleanup Users Script
 * Removes users with no soundscapes older than specified days
 * 
 * Usage: node scripts/cleanup-users.js [days]
 * Example: node scripts/cleanup-users.js 30  ← Delete users with no activity in 30 days
 */

const db = require('../database');

async function cleanupUsers(days = 30) {
  console.log(`🧹 Cleaning up users with no soundscapes older than ${days} days...`);
  
  try {
    // Find users with no soundscapes created in last N days
    const result = await db.query(`
      SELECT u.id, u.email, u.created_at 
      FROM users u
      WHERE u.id NOT IN (
        SELECT DISTINCT user_id 
        FROM soundscapes 
        WHERE created_at > NOW() - INTERVAL '${days} days'
      )
      ORDER BY u.created_at ASC
    `);
    
    const usersToDelete = result.rows;
    
    if (usersToDelete.length === 0) {
      console.log('✅ No users to clean up');
      return;
    }
    
    console.log(`📋 Found ${usersToDelete.length} users to delete:`);
    usersToDelete.forEach(u => {
      console.log(`   - ${u.email} (created: ${u.created_at})`);
    });
    
    // Confirm deletion
    console.log('\n⚠️  These users and ALL their data will be DELETED.');
    console.log('Type "yes" to confirm deletion:');
    
    // For automated use, set environment variable: CONFIRM_CLEANUP=yes
    if (process.env.CONFIRM_CLEANUP === 'yes') {
      console.log('✅ Confirmed via environment variable');
      
      let deletedCount = 0;
      for (const user of usersToDelete) {
        try {
          // Delete user (cascade will delete soundscapes, waypoints, behaviors)
          await db.query('DELETE FROM users WHERE id = $1', [user.id]);
          deletedCount++;
          console.log(`   ✅ Deleted: ${user.email}`);
        } catch (err) {
          console.error(`   ❌ Failed to delete ${user.email}: ${err.message}`);
        }
      }
      
      console.log(`\n✅ Cleanup complete! Deleted ${deletedCount}/${usersToDelete.length} users`);
    } else {
      console.log('\n❌ Deletion cancelled. Set CONFIRM_CLEANUP=yes to auto-confirm.');
      console.log('   Or manually run: CONFIRM_CLEANUP=yes node scripts/cleanup-users.js');
    }
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Get days from command line or default to 30
const days = parseInt(process.argv[2]) || 30;
cleanupUsers(days);
