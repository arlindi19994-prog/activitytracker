const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to database');
});

// First, let's see what users exist
db.all('SELECT id, username, role FROM users', [], (err, rows) => {
  if (err) {
    console.error('Error querying users:', err);
    process.exit(1);
  }
  
  console.log('\nExisting users:');
  console.log(rows);
  
  // Delete the admin user if it exists
  db.run('DELETE FROM users WHERE username = ?', ['admin'], (err) => {
    if (err) {
      console.error('Error deleting admin:', err);
      process.exit(1);
    }
    
    console.log('\nDeleted old admin user');
    
    // Create new admin user
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.run(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      ['admin', adminPassword, 'admin'],
      function(err) {
        if (err) {
          console.error('Error creating admin:', err);
          process.exit(1);
        }
        
        console.log('Created new admin user with ID:', this.lastID);
        
        // Verify the admin can be authenticated
        db.get('SELECT * FROM users WHERE username = ?', ['admin'], async (err, user) => {
          if (err) {
            console.error('Error fetching admin:', err);
            process.exit(1);
          }
          
          console.log('\nVerifying admin user...');
          const isValid = await bcrypt.compare('admin123', user.password);
          console.log('Password verification:', isValid ? 'SUCCESS ✓' : 'FAILED ✗');
          
          if (isValid) {
            console.log('\n✓ Admin user is ready!');
            console.log('Username: admin');
            console.log('Password: admin123');
          }
          
          db.close();
          process.exit(0);
        });
      }
    );
  });
});
