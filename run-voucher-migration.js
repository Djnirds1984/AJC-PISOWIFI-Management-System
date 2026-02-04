#!/usr/bin/env node

// Script to run voucher system migration
const db = require('./lib/db');
const fs = require('fs');

async function runMigration() {
  try {
    console.log('🔄 Running voucher system migration...');
    
    // Read the migration SQL
    const migrationSQL = fs.readFileSync('./migrations/voucher_system.sql', 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await db.run(statement.trim());
          console.log('✅ Executed:', statement.trim().substring(0, 50) + '...');
        } catch (err) {
          if (err.message.includes('already exists') || err.message.includes('duplicate column')) {
            console.log('⚠️  Skipped (already exists):', statement.trim().substring(0, 50) + '...');
          } else {
            throw err;
          }
        }
      }
    }
    
    // Verify tables were created
    const vouchers = await db.all('SELECT COUNT(*) as count FROM vouchers');
    const logs = await db.all('SELECT COUNT(*) as count FROM voucher_usage_logs');
    
    console.log('🎉 Migration completed successfully!');
    console.log(`📊 Vouchers table: ${vouchers[0].count} records`);
    console.log(`📊 Usage logs table: ${logs[0].count} records`);
    
    // Test creating a sample voucher
    console.log('🧪 Testing voucher creation...');
    const testCode = 'AJC' + Math.random().toString(36).substr(2, 5).toUpperCase();
    const testId = 'test_' + Date.now();
    
    await db.run(`
      INSERT INTO vouchers (id, code, minutes, price, expires_at) 
      VALUES (?, ?, 30, 5, datetime('now', '+30 days'))
    `, [testId, testCode]);
    
    console.log(`✅ Test voucher created: ${testCode} (30 minutes, ₱5)`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Initialize database and run migration
db.init().then(() => {
  runMigration();
}).catch(err => {
  console.error('❌ Database initialization failed:', err);
  process.exit(1);
});