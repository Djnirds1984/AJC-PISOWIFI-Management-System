#!/usr/bin/env node

/**
 * Migration Script: Migrate existing sessions to use device UUID
 * This script populates the device_uuid column for existing sessions
 * based on their MAC addresses to maintain backward compatibility.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

// Database path
const DB_PATH = path.join(__dirname, '..', 'pisowifi.sqlite');

console.log('🚀 Starting device UUID migration...');

// Open database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Failed to connect to database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Function to generate deterministic UUID from MAC address
function generateDeterministicUUID(mac) {
  // Simple hash-based UUID generation for deterministic results
  let hash = 0;
  for (let i = 0; i < mac.length; i++) {
    const char = mac.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to UUID format
  const hex = Math.abs(hash).toString(16).padStart(32, '0');
  return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-4${hex.substr(12, 3)}-8${hex.substr(15, 3)}-${hex.substr(18, 12)}`;
}

// Migration function
async function migrateSessions() {
  return new Promise((resolve, reject) => {
    // Get all sessions that don't have device_uuid set
    db.all('SELECT mac, ip FROM sessions WHERE device_uuid IS NULL OR device_uuid = ""', (err, sessions) => {
      if (err) {
        console.error('❌ Error fetching sessions:', err.message);
        return reject(err);
      }
      
      if (sessions.length === 0) {
        console.log('✅ No sessions need migration');
        return resolve();
      }
      
      console.log(`📋 Found ${sessions.length} sessions to migrate`);
      
      let completed = 0;
      let errors = 0;
      
      sessions.forEach((session) => {
        const deviceUUID = generateDeterministicUUID(session.mac);
        
        db.run(
          'UPDATE sessions SET device_uuid = ? WHERE mac = ?',
          [deviceUUID, session.mac],
          (err) => {
            completed++;
            
            if (err) {
              console.error(`❌ Failed to migrate session ${session.mac}:`, err.message);
              errors++;
            } else {
              console.log(`✅ Migrated session ${session.mac} → ${deviceUUID}`);
            }
            
            // Check if all migrations are complete
            if (completed === sessions.length) {
              if (errors === 0) {
                console.log(`🎉 Successfully migrated all ${sessions.length} sessions!`);
              } else {
                console.log(`⚠️  Migration completed with ${errors} errors out of ${sessions.length} sessions`);
              }
              resolve();
            }
          }
        );
      });
    });
  });
}

// Migrate vouchers that don't have used_by_device_uuid set
async function migrateVouchers() {
  return new Promise((resolve, reject) => {
    // Get all used vouchers that don't have used_by_device_uuid set
    db.all(`
      SELECT v.id, v.code, v.used_by_mac 
      FROM vouchers v 
      WHERE v.status = 'used' 
      AND (v.used_by_device_uuid IS NULL OR v.used_by_device_uuid = "")
      AND v.used_by_mac IS NOT NULL
    `, (err, vouchers) => {
      if (err) {
        console.error('❌ Error fetching vouchers:', err.message);
        return reject(err);
      }
      
      if (vouchers.length === 0) {
        console.log('✅ No vouchers need migration');
        return resolve();
      }
      
      console.log(`📋 Found ${vouchers.length} vouchers to migrate`);
      
      let completed = 0;
      let errors = 0;
      
      vouchers.forEach((voucher) => {
        const deviceUUID = generateDeterministicUUID(voucher.used_by_mac);
        
        db.run(
          'UPDATE vouchers SET used_by_device_uuid = ? WHERE id = ?',
          [deviceUUID, voucher.id],
          (err) => {
            completed++;
            
            if (err) {
              console.error(`❌ Failed to migrate voucher ${voucher.code}:`, err.message);
              errors++;
            } else {
              console.log(`✅ Migrated voucher ${voucher.code} → ${deviceUUID}`);
            }
            
            // Check if all migrations are complete
            if (completed === vouchers.length) {
              if (errors === 0) {
                console.log(`🎉 Successfully migrated all ${vouchers.length} vouchers!`);
              } else {
                console.log(`⚠️  Voucher migration completed with ${errors} errors out of ${vouchers.length} vouchers`);
              }
              resolve();
            }
          }
        );
      });
    });
  });
}

// Verify migration results
async function verifyMigration() {
  return new Promise((resolve, reject) => {
    console.log('\n🔍 Verifying migration results...');
    
    // Check sessions
    db.get('SELECT COUNT(*) as total, COUNT(device_uuid) as with_uuid FROM sessions', (err, result) => {
      if (err) {
        console.error('❌ Error verifying sessions:', err.message);
        return reject(err);
      }
      
      console.log(`📊 Sessions: ${result.total} total, ${result.with_uuid} with device_uuid`);
      
      // Check vouchers
      db.get(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'used' THEN 1 END) as used,
          COUNT(used_by_device_uuid) as with_device_uuid
        FROM vouchers
      `, (err, voucherResult) => {
        if (err) {
          console.error('❌ Error verifying vouchers:', err.message);
          return reject(err);
        }
        
        console.log(`📊 Vouchers: ${voucherResult.total} total, ${voucherResult.used} used, ${voucherResult.with_device_uuid} with device_uuid`);
        
        if (result.with_uuid === result.total && voucherResult.with_device_uuid >= voucherResult.used) {
          console.log('✅ Migration verification successful!');
        } else {
          console.log('⚠️  Some records may not have been migrated properly');
        }
        
        resolve();
      });
    });
  });
}

// Main migration process
async function main() {
  try {
    console.log('🔧 Device UUID Migration Tool');
    console.log('==============================\n');
    
    // Run migrations
    await migrateSessions();
    console.log('');
    await migrateVouchers();
    console.log('');
    await verifyMigration();
    
    console.log('\n✨ Migration completed successfully!');
    console.log('The system will now use device UUIDs for session management while maintaining backward compatibility.');
    
  } catch (error) {
    console.error('\n💥 Migration failed:', error.message);
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('✅ Database connection closed');
      }
      process.exit(0);
    });
  }
}

// Run the migration
if (require.main === module) {
  main();
}

module.exports = {
  migrateSessions,
  migrateVouchers,
  generateDeterministicUUID
};