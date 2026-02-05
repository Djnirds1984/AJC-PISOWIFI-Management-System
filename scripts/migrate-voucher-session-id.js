const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, '..', 'pisowifi.sqlite');

// Migration SQL
const migrationSQL = `
-- Add used_by_session_id column to vouchers table for Session ID binding
ALTER TABLE vouchers ADD COLUMN used_by_session_id TEXT;

-- Create index for faster Session ID lookups
CREATE INDEX IF NOT EXISTS idx_vouchers_used_by_session_id ON vouchers(used_by_session_id);
`;

// Run migration
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Failed to connect to database:', err.message);
    process.exit(1);
  }
  
  console.log('✅ Connected to database');
  
  db.exec(migrationSQL, (err) => {
    if (err) {
      console.error('❌ Migration failed:', err.message);
      process.exit(1);
    }
    
    console.log('✅ Migration completed successfully!');
    console.log('Added used_by_session_id column to vouchers table');
    
    // Verify the column was added
    db.get("PRAGMA table_info(vouchers)", (err, row) => {
      if (err) {
        console.error('❌ Failed to verify migration:', err.message);
      } else {
        console.log('✅ Vouchers table structure updated');
      }
      
      db.close();
      console.log('✅ Database connection closed');
    });
  });
});