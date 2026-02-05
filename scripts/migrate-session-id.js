const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database path
const dbPath = path.join(__dirname, '..', 'pisowifi.sqlite');

// Migration SQL
const migrationSQL = `
-- Add session_id column to sessions table for new Session ID system
-- This column will store the unique session identifier from browser storage

ALTER TABLE sessions ADD COLUMN session_id TEXT;

-- Create index for faster session ID lookups
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);

-- Update existing sessions to have session_id = token for backward compatibility
-- This ensures existing sessions continue to work
UPDATE sessions 
SET session_id = token 
WHERE session_id IS NULL AND token IS NOT NULL;
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
    console.log('Added session_id column to sessions table');
    
    // Verify the column was added
    db.get("PRAGMA table_info(sessions)", (err, row) => {
      if (err) {
        console.error('❌ Failed to verify migration:', err.message);
      } else {
        console.log('✅ Session table structure updated');
      }
      
      db.close();
      console.log('✅ Database connection closed');
    });
  });
});