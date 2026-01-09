const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const cron = require('node-cron');
const multer = require('multer');
const fs = require('fs');
const { db, calculateSprint } = require('./database');
const { authenticateToken, requireAdmin, generateToken } = require('./auth');
const { sendNotificationEmail, checkUpcomingActivities, sendWeeklyReminders } = require('./emailService');
const { generatePDF, generateExcel } = require('./exportService');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  db.get('SELECT COUNT(*) as count FROM users', (err, result) => {
    if (err) {
      return res.status(500).json({ status: 'error', error: err.message });
    }
    res.json({ 
      status: 'ok', 
      database: 'connected',
      users: result.count,
      timestamp: new Date().toISOString()
    });
  });
});

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
           u3.username as backup_person_name,
           u4.username as owner_name_display
    FROM activities a
    LEFT JOIN users u1 ON a.created_by = u1.id
    LEFT JOIN users u2 ON a.last_edited_by = u2.id
    LEFT JOIN users u3 ON a.backup_person = u3.id
    LEFT JOIN users u4 ON a.owner_id = u4.id
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

// Get my personal activities (non-shared activities created by user)
app.get('/api/activities/my', authenticateToken, (req, res) => {
  const { startDate, endDate, sprint, status } = req.query;
  
  let query = `
    SELECT a.*, 
           u1.username as created_by_name,
           u2.username as last_edited_by_name,
           u3.username as backup_person_name,
           u4.username as owner_name_display
    FROM activities a
    LEFT JOIN users u1 ON a.created_by = u1.id
    LEFT JOIN users u2 ON a.last_edited_by = u2.id
    LEFT JOIN users u3 ON a.backup_person = u3.id
    LEFT JOIN users u4 ON a.owner_id = u4.id
    WHERE (a.created_by = ? OR a.backup_person = ?) AND (a.is_shared = 0 OR a.is_shared IS NULL)
  `;
  
  const params = [req.user.id, req.user.id];

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

// Get shared activities (visible to all users)
app.get('/api/activities/shared', authenticateToken, (req, res) => {
  const { startDate, endDate, sprint, status } = req.query;
  
  let query = `
    SELECT a.*, 
           u1.username as created_by_name,
           u2.username as last_edited_by_name,
           u3.username as backup_person_name,
           u4.username as owner_name_display
    FROM activities a
    LEFT JOIN users u1 ON a.created_by = u1.id
    LEFT JOIN users u2 ON a.last_edited_by = u2.id
    LEFT JOIN users u3 ON a.backup_person = u3.id
    LEFT JOIN users u4 ON a.owner_id = u4.id
    WHERE a.is_shared = 1
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
    assigned_to,
    backup_person,
    department,
    it_type,
    gxp_impact,
    business_benefit,
    tco_value,
    is_shared,
    owner_name,
    progress_percentage
  } = req.body;

  const sprint = calculateSprint(activity_date);
  // Admin can assign to others, clients create for themselves
  const created_by = assigned_to || req.user.id;
  const owner_id = assigned_to || req.user.id;
  const activity_year = new Date(activity_date).getFullYear();
  
  // Generate unique identifier based on activity name, date, and creator
  const unique_identifier = `${activity_name.toLowerCase().replace(/\s+/g, '_')}_${activity_date}_${created_by}`;
  
  // Check if activity with same identifier already exists
  db.get('SELECT id FROM activities WHERE unique_identifier = ?', [unique_identifier], (err, existing) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (existing) {
      return res.status(400).json({ 
        error: 'This activity already exists. An activity with the same name and date has already been added.',
        duplicate: true 
      });
    }

    db.run(`
      INSERT INTO activities (
        activity_name, description, gxp_scope, priority, risk_level, 
        activity_date, sprint, status, created_by, backup_person,
        department, it_type, gxp_impact, business_benefit, tco_value, activity_year,
        owner_id, owner_name, is_shared, unique_identifier, progress_percentage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [activity_name, description, gxp_scope, priority, risk_level, 
       activity_date, sprint, status, created_by, backup_person,
       department, it_type, gxp_impact, business_benefit, tco_value, activity_year,
       owner_id, owner_name || req.user.username, is_shared || 0, unique_identifier, 
       progress_percentage || 0],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ 
              error: 'This activity already exists. An activity with the same name and date has already been added.',
              duplicate: true 
            });
          }
          return res.status(500).json({ error: 'Failed to create activity' });
        }
        
        const activityId = this.lastID;
        
        // Log creation in history
        db.run(`
          INSERT INTO edit_history (activity_id, edited_by, field_changed, new_value, change_description)
          VALUES (?, ?, ?, ?, ?)
        `, [activityId, req.user.id, 'created', 'Activity created', 'Activity created']);
        
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
          id: activityId, 
          message: 'Activity created successfully',
          sprint 
        });
      }
    );
  });
});

// Update activity
app.put('/api/activities/:id', authenticateToken, (req, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role;

  // First check if user owns this activity or is admin
  db.get('SELECT * FROM activities WHERE id = ?', [activityId], (err, activity) => {
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
      assigned_to,
      backup_person,
      department,
      it_type,
      gxp_impact,
      business_benefit,
      tco_value,
      owner_name,
      progress_percentage
    } = req.body;

    const sprint = calculateSprint(activity_date);
    const activity_year = new Date(activity_date).getFullYear();
    
    // If admin is reassigning, update created_by and owner_id
    const newCreatedBy = (userRole === 'admin' && assigned_to) ? assigned_to : activity.created_by;
    const newOwnerId = (userRole === 'admin' && assigned_to) ? assigned_to : (activity.owner_id || activity.created_by);

    // Track changes for history
    const changes = [];
    if (activity.activity_name !== activity_name) changes.push(`Name: "${activity.activity_name}" → "${activity_name}"`);
    if (activity.status !== status) changes.push(`Status: "${activity.status}" → "${status}"`);
    if (activity.priority !== priority) changes.push(`Priority: "${activity.priority}" → "${priority}"`);
    if (activity.activity_date !== activity_date) changes.push(`Target Date: "${activity.activity_date}" → "${activity_date}"`);
    
    const changeDescription = changes.length > 0 ? changes.join('; ') : 'Activity updated';

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
        created_by = ?,
        backup_person = ?,
        department = ?,
        it_type = ?,
        gxp_impact = ?,
        business_benefit = ?,
        tco_value = ?,
        activity_year = ?,
        owner_id = ?,
        owner_name = ?,
        progress_percentage = ?,
        last_edited_by = ?,
        last_edited_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [activity_name, description, gxp_scope, priority, risk_level, 
       activity_date, sprint, status, newCreatedBy, backup_person, department, it_type,
       gxp_impact, business_benefit, tco_value, activity_year, newOwnerId, 
       owner_name || activity.owner_name, progress_percentage || 0, userId, activityId],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to update activity' });
        }

        // Log the edit in history
        db.run(`
          INSERT INTO edit_history (activity_id, edited_by, field_changed, new_value, change_description)
          VALUES (?, ?, ?, ?, ?)
        `, [activityId, userId, 'updated', activity_name, changeDescription]);

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

// Get edit history for user's own activities
app.get('/api/activities/:id/my-history', authenticateToken, (req, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;

  // First check if user owns this activity
  db.get('SELECT created_by FROM activities WHERE id = ?', [activityId], (err, activity) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!activity) return res.status(404).json({ error: 'Activity not found' });
    
    if (activity.created_by !== userId) {
      return res.status(403).json({ error: 'You can only view history of your own activities' });
    }

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
});

// Get all edit history (admin only - for audit)
app.get('/api/activities/audit/all-history', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT eh.*, 
           u.username as edited_by_name,
           a.activity_name
    FROM edit_history eh
    LEFT JOIN users u ON eh.edited_by = u.id
    LEFT JOIN activities a ON eh.activity_id = a.id
    ORDER BY eh.edited_at DESC
    LIMIT 500
  `;

  db.all(query, [], (err, history) => {
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

// ============= COMMENTS API =============

// Get comments for an activity
app.get('/api/activities/:id/comments', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const sql = `
    SELECT c.*, u.username 
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.activity_id = ?
    ORDER BY c.created_at DESC
  `;
  
  db.all(sql, [id], (err, comments) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(comments);
  });
});

// Add comment to an activity
app.post('/api/activities/:id/comments', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { comment_text } = req.body;
  
  if (!comment_text || !comment_text.trim()) {
    return res.status(400).json({ error: 'Comment text is required' });
  }
  
  const sql = `
    INSERT INTO comments (activity_id, user_id, username, comment_text)
    VALUES (?, ?, ?, ?)
  `;
  
  db.run(sql, [id, req.user.id, req.user.username, comment_text.trim()], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Return the new comment
    db.get('SELECT * FROM comments WHERE id = ?', [this.lastID], (err, comment) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json(comment);
    });
  });
});

// Delete comment
app.delete('/api/comments/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  // Check if comment belongs to user or user is admin
  db.get('SELECT * FROM comments WHERE id = ?', [id], (err, comment) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (comment.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }
    
    db.run('DELETE FROM comments WHERE id = ?', [id], (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Comment deleted' });
    });
  });
});

// ============= FILE ATTACHMENTS API =============

// Upload file for activity
app.post('/api/activities/:id/attachments', authenticateToken, upload.single('file'), (req, res) => {
  const { id } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const sql = `
    INSERT INTO attachments (activity_id, filename, original_name, file_size, mime_type, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  db.run(sql, [
    id,
    req.file.filename,
    req.file.originalname,
    req.file.size,
    req.file.mimetype,
    req.user.id
  ], function(err) {
    if (err) {
      // Delete uploaded file on error
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: err.message });
    }
    
    db.get('SELECT * FROM attachments WHERE id = ?', [this.lastID], (err, attachment) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json(attachment);
    });
  });
});

// Get attachments for activity
app.get('/api/activities/:id/attachments', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const sql = `
    SELECT a.*, u.username as uploaded_by_name
    FROM attachments a
    LEFT JOIN users u ON a.uploaded_by = u.id
    WHERE a.activity_id = ?
    ORDER BY a.uploaded_at DESC
  `;
  
  db.all(sql, [id], (err, attachments) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(attachments);
  });
});

// Download attachment
app.get('/api/attachments/:id/download', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM attachments WHERE id = ?', [id], (err, attachment) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const filePath = path.join(uploadsDir, attachment.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }
    
    res.download(filePath, attachment.original_name);
  });
});

// Delete attachment
app.delete('/api/attachments/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM attachments WHERE id = ?', [id], (err, attachment) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    // Check permission (uploader or admin)
    if (attachment.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Delete file from disk
    const filePath = path.join(uploadsDir, attachment.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Delete from database
    db.run('DELETE FROM attachments WHERE id = ?', [id], (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Attachment deleted' });
    });
  });
});

// ============= NOTIFICATIONS API =============

// Get user notifications
app.get('/api/notifications', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.user.id],
    (err, notifications) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(notifications);
    }
  );
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticateToken, (req, res) => {
  db.run(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Notification marked as read' });
    }
  );
});

// Mark all notifications as read
app.put('/api/notifications/read-all', authenticateToken, (req, res) => {
  db.run(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
    [req.user.id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'All notifications marked as read' });
    }
  );
});

// Clear all notifications
app.delete('/api/notifications/clear-all', authenticateToken, (req, res) => {
  db.run(
    'DELETE FROM notifications WHERE user_id = ?',
    [req.user.id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'All notifications cleared' });
    }
  );
});

// Create notification (helper function to be called internally)
function createNotification(userId, activityId, type, title, message) {
  db.run(
    'INSERT INTO notifications (user_id, activity_id, type, title, message) VALUES (?, ?, ?, ?, ?)',
    [userId, activityId, type, title, message],
    (err) => {
      if (err) console.error('Error creating notification:', err);
    }
  );
}

// ============= TEMPLATES API =============

// Get all templates
app.get('/api/templates', authenticateToken, (req, res) => {
  db.all(
    'SELECT t.*, u.username as created_by_name FROM activity_templates t LEFT JOIN users u ON t.created_by = u.id ORDER BY t.created_at DESC',
    [],
    (err, templates) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(templates);
    }
  );
});

// Create template
app.post('/api/templates', authenticateToken, (req, res) => {
  const { template_name, description, gxp_scope, priority, risk_level, department, it_type, gxp_impact, business_benefit } = req.body;
  
  db.run(
    `INSERT INTO activity_templates (template_name, description, gxp_scope, priority, risk_level, department, it_type, gxp_impact, business_benefit, created_by) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [template_name, description, gxp_scope, priority, risk_level, department, it_type, gxp_impact, business_benefit, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, message: 'Template created' });
    }
  );
});

// Delete template
app.delete('/api/templates/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM activity_templates WHERE id = ?', [req.params.id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Template deleted' });
  });
});

// ============= DEPENDENCIES API =============

// Get activity dependencies
app.get('/api/activities/:id/dependencies', authenticateToken, (req, res) => {
  db.all(
    `SELECT d.*, a.activity_name as depends_on_name, a.status as depends_on_status
     FROM activity_dependencies d
     LEFT JOIN activities a ON d.depends_on_activity_id = a.id
     WHERE d.activity_id = ?`,
    [req.params.id],
    (err, dependencies) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(dependencies);
    }
  );
});

// Add dependency
app.post('/api/activities/:id/dependencies', authenticateToken, (req, res) => {
  const { depends_on_activity_id, dependency_type } = req.body;
  
  db.run(
    'INSERT INTO activity_dependencies (activity_id, depends_on_activity_id, dependency_type) VALUES (?, ?, ?)',
    [req.params.id, depends_on_activity_id, dependency_type || 'blocks'],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Create notification for the dependent activity owner
      db.get('SELECT owner_id, activity_name FROM activities WHERE id = ?', [req.params.id], (err, activity) => {
        if (!err && activity && activity.owner_id) {
          createNotification(
            activity.owner_id,
            req.params.id,
            'dependency',
            'New Dependency Added',
            `A dependency was added to your activity: ${activity.activity_name}`
          );
        }
      });
      
      res.json({ id: this.lastID, message: 'Dependency added' });
    }
  );
});

// Delete dependency
app.delete('/api/dependencies/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM activity_dependencies WHERE id = ?', [req.params.id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Dependency removed' });
  });
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
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Default admin credentials: username=admin, password=admin123');
});
