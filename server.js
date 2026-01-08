const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const cron = require('node-cron');
const { db, calculateSprint } = require('./database');
const { authenticateToken, requireAdmin, generateToken } = require('./auth');
const { sendNotificationEmail, checkUpcomingActivities, sendWeeklyReminders } = require('./emailService');
const { generatePDF, generateExcel } = require('./exportService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ============= AUTH ROUTES =============

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        email: user.email,
        notify_email: user.notify_email
      } 
    });
  });
});

// Get current user info
app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get('SELECT id, username, email, role, notify_email FROM users WHERE id = ?', 
    [req.user.id], 
    (err, user) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    }
  );
});

// Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  db.get('SELECT password FROM users WHERE id = ?', [req.user.id], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.run('UPDATE users SET password = ? WHERE id = ?', 
      [hashedPassword, req.user.id], 
      (err) => {
        if (err) return res.status(500).json({ error: 'Failed to update password' });
        res.json({ message: 'Password updated successfully' });
      }
    );
  });
});

// Update notification email
app.post('/api/auth/update-notification-email', authenticateToken, (req, res) => {
  const { notifyEmail } = req.body;

  db.run('UPDATE users SET notify_email = ? WHERE id = ?', 
    [notifyEmail, req.user.id], 
    (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update email' });
      res.json({ message: 'Notification email updated successfully' });
    }
  );
});

// ============= USER MANAGEMENT (ADMIN ONLY) =============

// Get all users
app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
  db.all('SELECT id, username, email, role, notify_email, created_at FROM users', 
    (err, users) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(users);
    }
  );
});

// Create user
app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, password, email, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password, and role are required' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  db.run('INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
    [username, hashedPassword, email, role],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Username already exists' });
        }
        return res.status(500).json({ error: 'Failed to create user' });
      }
      res.json({ id: this.lastID, username, email, role });
    }
  );
});

// Delete user
app.delete('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.id;

  // Prevent deleting the admin user
  if (userId == 1) {
    return res.status(400).json({ error: 'Cannot delete the main admin user' });
  }

  db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to delete user' });
    if (this.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  });
});

// ============= ACTIVITY ROUTES =============

// Get all activities
app.get('/api/activities', authenticateToken, (req, res) => {
  const { startDate, endDate, sprint, status } = req.query;
  
  let query = `
    SELECT a.*, 
           u1.username as created_by_name,
           u2.username as last_edited_by_name,
           u3.username as backup_person_name
    FROM activities a
    LEFT JOIN users u1 ON a.created_by = u1.id
    LEFT JOIN users u2 ON a.last_edited_by = u2.id
    LEFT JOIN users u3 ON a.backup_person = u3.id
    WHERE 1=1
  `;
  
  const params = [];

  if (startDate) {
    query += ' AND a.activity_date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND a.activity_date <= ?';
    params.push(endDate);
  }
  if (sprint) {
    query += ' AND a.sprint = ?';
    params.push(sprint);
  }
  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  }

  query += ' ORDER BY a.activity_date ASC, a.id DESC';

  db.all(query, params, (err, activities) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(activities);
  });
});

// Get Sprint progress
app.get('/api/activities/sprint-progress', authenticateToken, (req, res) => {
  const query = `
    SELECT 
      sprint,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed
    FROM activities
    GROUP BY sprint
    ORDER BY sprint
  `;

  db.all(query, [], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    
    const progress = results.map(r => ({
      sprint: r.sprint,
      total: r.total,
      completed: r.completed,
      percentage: r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0
    }));

    res.json(progress);
  });
});

// Get analytics for dashboard
app.get('/api/analytics/dashboard', authenticateToken, (req, res) => {
  const queries = {
    // Corp IT vs Local IT comparison
    itTypeComparison: `
      SELECT 
        it_type,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'Planned' THEN 1 ELSE 0 END) as planned
      FROM activities
      WHERE it_type IS NOT NULL
      GROUP BY it_type
    `,
    
    // GxP distribution
    gxpDistribution: `
      SELECT 
        it_type,
        gxp_impact,
        COUNT(*) as count
      FROM activities
      WHERE it_type IS NOT NULL AND gxp_impact IS NOT NULL
      GROUP BY it_type, gxp_impact
    `,
    
    // Department breakdown
    departmentBreakdown: `
      SELECT 
        department,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed
      FROM activities
      WHERE department IS NOT NULL
      GROUP BY department
    `,
    
    // Priority distribution
    priorityDistribution: `
      SELECT 
        priority,
        COUNT(*) as count
      FROM activities
      GROUP BY priority
    `,
    
    // TCO summary
    tcoSummary: `
      SELECT 
        it_type,
        SUM(tco_value) as total_tco,
        AVG(tco_value) as avg_tco
      FROM activities
      WHERE tco_value IS NOT NULL AND it_type IS NOT NULL
      GROUP BY it_type
    `
  };

  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, query]) => {
    db.all(query, [], (err, data) => {
      if (!err) results[key] = data;
      completed++;
      
      if (completed === total) {
        res.json(results);
      }
    });
  });
});

// Get user list for dropdowns
app.get('/api/users/list', authenticateToken, (req, res) => {
  db.all('SELECT id, username, role FROM users ORDER BY username', (err, users) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(users);
  });
});

// Create activity
app.post('/api/activities', authenticateToken, (req, res) => {
  const {
    activity_name,
    description,
    gxp_scope,
    priority,
    risk_level,
    activity_date,
    status,
    backup_person,
    department,
    it_type,
    gxp_impact,
    business_benefit,
    tco_value
  } = req.body;

  const sprint = calculateSprint(activity_date);
  const created_by = req.user.id;
  const activity_year = new Date(activity_date).getFullYear();

  db.run(`
    INSERT INTO activities (
      activity_name, description, gxp_scope, priority, risk_level, 
      activity_date, sprint, status, created_by, backup_person,
      department, it_type, gxp_impact, business_benefit, tco_value, activity_year
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [activity_name, description, gxp_scope, priority, risk_level, 
     activity_date, sprint, status, created_by, backup_person,
     department, it_type, gxp_impact, business_benefit, tco_value, activity_year],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to create activity' });
      }
      
      // Send notification to owner
      db.get('SELECT notify_email FROM users WHERE id = ?', [created_by], (err, user) => {
        if (!err && user && user.notify_email) {
          sendNotificationEmail(user.notify_email, {
            activity_name,
            activity_date,
            type: 'assignment'
          });
        }
      });
      
      // Send notification to backup person if exists
      if (backup_person) {
        db.get('SELECT notify_email FROM users WHERE id = ?', [backup_person], (err, user) => {
          if (!err && user && user.notify_email) {
            sendNotificationEmail(user.notify_email, {
              activity_name,
              activity_date,
              type: 'backup_assignment'
            });
          }
        });
      }
      
      res.json({ 
        id: this.lastID, 
        message: 'Activity created successfully',
        sprint 
      });
    }
  );
});

// Update activity
app.put('/api/activities/:id', authenticateToken, (req, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role;

  // First check if user owns this activity or is admin
  db.get('SELECT created_by FROM activities WHERE id = ?', [activityId], (err, activity) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    // Only allow the creator or admin to edit
    if (activity.created_by !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own activities' });
    }

    const {
      activity_name,
      description,
      gxp_scope,
      priority,
      risk_level,
      activity_date,
      status,
      backup_person,
      department,
      it_type,
      gxp_impact,
      business_benefit,
      tco_value
    } = req.body;

    const sprint = calculateSprint(activity_date);
    const activity_year = new Date(activity_date).getFullYear();

    db.run(`
      UPDATE activities SET
        activity_name = ?,
        description = ?,
        gxp_scope = ?,
        priority = ?,
        risk_level = ?,
        activity_date = ?,
        sprint = ?,
        status = ?,
        backup_person = ?,
        department = ?,
        it_type = ?,
        gxp_impact = ?,
        business_benefit = ?,
        tco_value = ?,
        activity_year = ?,
        last_edited_by = ?,
        last_edited_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [activity_name, description, gxp_scope, priority, risk_level, 
       activity_date, sprint, status, backup_person, department, it_type,
       gxp_impact, business_benefit, tco_value, activity_year, userId, activityId],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to update activity' });
        }

        // Log the edit in history
        db.run(`
          INSERT INTO edit_history (activity_id, edited_by, field_changed)
          VALUES (?, ?, ?)
        `, [activityId, userId, 'activity_updated']);

        res.json({ message: 'Activity updated successfully', sprint });
      }
    );
  });
});

// Delete activity (admin only)
app.delete('/api/activities/:id', authenticateToken, requireAdmin, (req, res) => {
  const activityId = req.params.id;

  db.run('DELETE FROM activities WHERE id = ?', [activityId], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to delete activity' });
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    // Also delete edit history
    db.run('DELETE FROM edit_history WHERE activity_id = ?', [activityId]);
    
    res.json({ message: 'Activity deleted successfully' });
  });
});

// Get edit history for an activity (admin only)
app.get('/api/activities/:id/history', authenticateToken, requireAdmin, (req, res) => {
  const activityId = req.params.id;

  const query = `
    SELECT eh.*, u.username as edited_by_name
    FROM edit_history eh
    LEFT JOIN users u ON eh.edited_by = u.id
    WHERE eh.activity_id = ?
    ORDER BY eh.edited_at DESC
  `;

  db.all(query, [activityId], (err, history) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(history);
  });
});

// ============= EXPORT ROUTES =============

// Export to PDF
app.post('/api/export/pdf', authenticateToken, async (req, res) => {
  const { startDate, endDate, sprint } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    let query = `
      SELECT a.*, u.username as created_by_name
      FROM activities a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    // Non-admin users only see their own activities
    if (userRole !== 'admin') {
      query += ' AND a.created_by = ?';
      params.push(userId);
    }

    if (startDate) {
      query += ' AND a.activity_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND a.activity_date <= ?';
      params.push(endDate);
    }
    if (sprint) {
      query += ' AND a.sprint = ?';
      params.push(sprint);
    }

    query += ' ORDER BY a.activity_date ASC';

    db.all(query, params, async (err, activities) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      const pdfBuffer = await generatePDF(activities, req.user.username);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=activities.pdf');
      res.send(pdfBuffer);
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Export to Excel
app.post('/api/export/excel', authenticateToken, async (req, res) => {
  const { startDate, endDate, sprint } = req.body;

  try {
    let query = `
      SELECT a.*, u.username as created_by_name
      FROM activities a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND a.activity_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND a.activity_date <= ?';
      params.push(endDate);
    }
    if (sprint) {
      query += ' AND a.sprint = ?';
      params.push(sprint);
    }

    query += ' ORDER BY a.activity_date ASC';

    db.all(query, params, async (err, activities) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      const excelBuffer = await generateExcel(activities);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=activities.xlsx');
      res.send(excelBuffer);
    });
  } catch (error) {
    console.error('Excel generation error:', error);
    res.status(500).json({ error: 'Failed to generate Excel' });
  }
});

// ============= NOTIFICATION ROUTE =============

app.post('/api/notifications/test', authenticateToken, (req, res) => {
  const { email } = req.body;
  
  sendNotificationEmail(email, {
    activity_name: 'Test Activity',
    activity_date: new Date().toISOString().split('T')[0]
  });

  res.json({ message: 'Test email sent (check console if using test mode)' });
});

// ============= CRON JOB FOR NOTIFICATIONS =============

// Run every day at 9 AM to check for upcoming activities
cron.schedule('0 9 * * *', () => {
  console.log('Running daily notification check...');
  checkUpcomingActivities();
});

// Run every Monday at 9 AM for weekly reminders
cron.schedule('0 9 * * 1', () => {
  console.log('Running weekly reminder check...');
  sendWeeklyReminders();
});

// ============= START SERVER =============

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Default admin credentials: username=admin, password=admin123');
});
