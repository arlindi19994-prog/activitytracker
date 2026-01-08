const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Running database migration...');
});

// Add new columns to activities table
const migrations = [
  // Add backup person
  `ALTER TABLE activities ADD COLUMN backup_person INTEGER`,
  
  // Add department/team
  `ALTER TABLE activities ADD COLUMN department TEXT CHECK(department IN ('Corp IT Cybersecurity', 'Corp IT Helpdesk', 'Corp IT Compliance', 'Corp IT Application Solutions', 'Corp IT Business Technology', 'Corp IT OctaERP Solution', 'Local IT'))`,
  
  // Add IT type
  `ALTER TABLE activities ADD COLUMN it_type TEXT CHECK(it_type IN ('Corp IT', 'Local IT'))`,
  
  // Add GxP impact type
  `ALTER TABLE activities ADD COLUMN gxp_impact TEXT CHECK(gxp_impact IN ('GxP', 'non-GxP', 'indirect GxP'))`,
  
  // Add business benefit
  `ALTER TABLE activities ADD COLUMN business_benefit TEXT`,
  
  // Add TCO value
  `ALTER TABLE activities ADD COLUMN tco_value DECIMAL(15, 2)`,
  
  // Add year
  `ALTER TABLE activities ADD COLUMN activity_year INTEGER`
];

let completedMigrations = 0;

migrations.forEach((sql, index) => {
  db.run(sql, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error(`Migration ${index + 1} error:`, err.message);
    } else {
      console.log(`✓ Migration ${index + 1} completed`);
    }
    
    completedMigrations++;
    
    if (completedMigrations === migrations.length) {
      console.log('\n✓ All migrations completed successfully!');
      db.close();
      process.exit(0);
    }
  });
});
