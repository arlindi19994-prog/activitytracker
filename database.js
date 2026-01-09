const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL CHECK(role IN ('admin', 'client')),
    notify_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Activities table
  db.run(`CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_name TEXT NOT NULL,
    description TEXT,
    gxp_scope TEXT NOT NULL CHECK(gxp_scope IN ('Yes', 'No')),
    priority TEXT NOT NULL CHECK(priority IN ('Critical', 'High', 'Medium', 'Low')),
    risk_level TEXT NOT NULL CHECK(risk_level IN ('High', 'Medium', 'Low')),
    activity_date DATE NOT NULL,
    sprint INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Planned', 'In Progress', 'Completed', 'Cancelled', 'On Hold')),
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_edited_by INTEGER,
    last_edited_at DATETIME,
    backup_person INTEGER,
    department TEXT,
    it_type TEXT,
    gxp_impact TEXT,
    business_benefit TEXT,
    tco_value DECIMAL(15,2),
    activity_year INTEGER,
    owner_id INTEGER,
    owner_name TEXT,
    is_shared BOOLEAN DEFAULT 0,
    unique_identifier TEXT UNIQUE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (last_edited_by) REFERENCES users(id),
    FOREIGN KEY (backup_person) REFERENCES users(id),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`, (err) => {
    if (!err) {
      // Run migrations for existing databases
      migrateDatabase();
    }
  });

  // Edit history table
  db.run(`CREATE TABLE IF NOT EXISTS edit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    edited_by INTEGER NOT NULL,
    edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    field_changed TEXT,
    old_value TEXT,
    new_value TEXT,
    change_description TEXT,
    FOREIGN KEY (activity_id) REFERENCES activities(id),
    FOREIGN KEY (edited_by) REFERENCES users(id)
  )`);

  // Comments table
  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT,
    comment_text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (activity_id) REFERENCES activities(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // File attachments table
  db.run(`CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    uploaded_by INTEGER NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (activity_id) REFERENCES activities(id),
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  )`);

  // Notifications table
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    activity_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (activity_id) REFERENCES activities(id)
  )`);

  // Activity templates table
  db.run(`CREATE TABLE IF NOT EXISTS activity_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_name TEXT NOT NULL,
    description TEXT,
    gxp_scope TEXT,
    priority TEXT,
    risk_level TEXT,
    department TEXT,
    it_type TEXT,
    gxp_impact TEXT,
    business_benefit TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);

  // Activity dependencies table
  db.run(`CREATE TABLE IF NOT EXISTS activity_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    depends_on_activity_id INTEGER NOT NULL,
    dependency_type TEXT DEFAULT 'blocks',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (activity_id) REFERENCES activities(id),
    FOREIGN KEY (depends_on_activity_id) REFERENCES activities(id)
  )`);

  // Create default admin user
  db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, user) => {
    if (!user) {
      const adminPassword = bcrypt.hashSync('admin123', 10);
      db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, 
        ['admin', adminPassword, 'admin'], 
        (err) => {
          if (err) {
            console.error('Error creating admin user:', err);
          } else {
            console.log('Default admin user created (username: admin, password: admin123)');
          }
        }
      );
    } else {
      console.log('Admin user already exists');
    }
  });
}

// Migration function to add new columns to existing databases
function migrateDatabase() {
  const columnsToAdd = [
    'backup_person INTEGER',
    'department TEXT',
    'it_type TEXT',
    'gxp_impact TEXT',
    'business_benefit TEXT',
    'tco_value DECIMAL(15,2)',
    'activity_year INTEGER',
    'owner_id INTEGER',
    'owner_name TEXT',
    'is_shared BOOLEAN DEFAULT 0',
    'unique_identifier TEXT',
    'change_description TEXT',
    'progress_percentage INTEGER DEFAULT 0',
    'is_archived BOOLEAN DEFAULT 0'
  ];

  columnsToAdd.forEach(columnDef => {
    const columnName = columnDef.split(' ')[0];
    db.run(`ALTER TABLE activities ADD COLUMN ${columnDef}`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.log(`Column ${columnName} migration skipped (already exists or table structure different)`);
      } else if (!err) {
        console.log(`Added column: ${columnName}`);
      }
    });
  });
  
  // Add change_description column to edit_history table if it doesn't exist
  db.run(`ALTER TABLE edit_history ADD COLUMN change_description TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log(`Column change_description migration skipped`);
    } else if (!err) {
      console.log(`Added column to edit_history: change_description`);
    }
  });
  
  // Add profile_picture column to users table
  db.run(`ALTER TABLE users ADD COLUMN profile_picture TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log(`Column profile_picture migration skipped`);
    } else if (!err) {
      console.log(`Added column to users: profile_picture`);
    }
  });
}

// Helper function to calculate Sprint based on date
function calculateSprint(dateString) {
  const date = new Date(dateString);
  const month = date.getMonth() + 1; // 1-12
  
  if (month >= 1 && month <= 3) return 1;
  if (month >= 4 && month <= 6) return 2;
  if (month >= 7 && month <= 9) return 3;
  return 4;
}

module.exports = { db, calculateSprint };
