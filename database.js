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
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (last_edited_by) REFERENCES users(id)
  )`);

  // Edit history table
  db.run(`CREATE TABLE IF NOT EXISTS edit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    edited_by INTEGER NOT NULL,
    edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    field_changed TEXT,
    old_value TEXT,
    new_value TEXT,
    FOREIGN KEY (activity_id) REFERENCES activities(id),
    FOREIGN KEY (edited_by) REFERENCES users(id)
  )`);

  // Create default admin user
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (id, username, password, role) VALUES (1, 'admin', ?, 'admin')`, 
    [adminPassword], 
    (err) => {
      if (err) {
        console.log('Admin user already exists');
      } else {
        console.log('Default admin user created (username: admin, password: admin123)');
      }
    }
  );
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
