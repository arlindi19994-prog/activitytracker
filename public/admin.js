const API_URL = window.location.origin + '/api';
let currentUser = null;
let token = null;
let activities = [];
let users = [];

// Check authentication
function checkAuth() {
  token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  
  if (!token || !userStr) {
    window.location.href = 'index.html';
    return;
  }
  
  currentUser = JSON.parse(userStr);
  
  if (currentUser.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }
  
  document.getElementById('currentUser').textContent = currentUser.username;
}

// API helper
async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });
  
  if (response.status === 401 || response.status === 403) {
    localStorage.clear();
    window.location.href = 'index.html';
    return;
  }
  
  return response;
}

// Navigation
function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.content-section');
  
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionName = link.dataset.section;
      
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      
      sections.forEach(section => {
        if (section.id === `${sectionName}Section`) {
          section.classList.remove('d-none');
        } else {
          section.classList.add('d-none');
        }
      });
      
      // Load section data
      if (sectionName === 'dashboard') loadDashboard();
      if (sectionName === 'activities') loadActivities();
      if (sectionName === 'users') loadUsers();
      if (sectionName === 'audit') loadAuditHistory();
      if (sectionName === 'profile') loadProfile();
      
      // Close mobile menu
      document.getElementById('sidebar').classList.remove('active');
    });
  });
}

// Mobile menu toggle
document.getElementById('mobileMenuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('active');
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = 'index.html';
});

// ============= DASHBOARD =============

async function loadDashboard() {
  try {
    const [activitiesRes, usersRes, progressRes] = await Promise.all([
      apiCall('/activities'),
      apiCall('/users'),
      apiCall('/activities/sprint-progress')
    ]);
    
    activities = await activitiesRes.json();
    users = await usersRes.json();
    const sprintProgress = await progressRes.json();
    
    // Update stats
    document.getElementById('totalActivities').textContent = activities.length;
    document.getElementById('completedActivities').textContent = 
      activities.filter(a => a.status === 'Completed').length;
    document.getElementById('inProgressActivities').textContent = 
      activities.filter(a => a.status === 'In Progress').length;
    document.getElementById('totalUsers').textContent = users.length;
    
    // Sprint progress
    displaySprintProgress(sprintProgress);
    
    // Recent activities
    displayRecentActivities(activities.slice(0, 10));
  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
}

function displaySprintProgress(sprintProgress) {
  const container = document.getElementById('sprintProgress');
  
  if (sprintProgress.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No sprint data available</p>';
    return;
  }
  
  container.innerHTML = sprintProgress.map(sprint => {
    let colorClass = 'progress-low';
    if (sprint.percentage >= 80) colorClass = 'progress-high';
    else if (sprint.percentage >= 50) colorClass = 'progress-medium';
    
    return `
      <div style="margin-bottom: 20px; padding: 15px; background: var(--hover-bg); border-radius: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <strong>Sprint ${sprint.sprint}</strong>
          <span class="progress-indicator ${colorClass}">${sprint.percentage}%</span>
        </div>
        <div style="font-size: 0.9em; color: var(--text-secondary);">
          ${sprint.completed} of ${sprint.total} activities completed
        </div>
        <div style="background: #e0e0e0; height: 8px; border-radius: 4px; margin-top: 10px; overflow: hidden;">
          <div style="background: ${colorClass === 'progress-high' ? 'var(--success-color)' : colorClass === 'progress-medium' ? 'var(--warning-color)' : 'var(--danger-color)'}; height: 100%; width: ${sprint.percentage}%; transition: width 0.3s;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function displayRecentActivities(recentActivities) {
  const tbody = document.querySelector('#recentActivitiesTable tbody');
  
  if (recentActivities.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No activities found</td></tr>';
    return;
  }
  
  tbody.innerHTML = recentActivities.map(activity => `
    <tr>
      <td>${activity.activity_name}</td>
      <td>${activity.created_by_name || 'Unknown'}</td>
      <td>${formatDate(activity.activity_date)}</td>
      <td><span class="sprint-badge">Sprint ${activity.sprint}</span></td>
      <td>${getStatusBadge(activity.status)}</td>
      <td>${getPriorityBadge(activity.priority)}</td>
    </tr>
  `).join('');
}

// ============= ACTIVITIES =============

async function loadActivities() {
  try {
    const response = await apiCall('/activities');
    activities = await response.json();
    displayActivities(activities);
  } catch (error) {
    console.error('Error loading activities:', error);
  }
}

function displayActivities(activitiesToDisplay) {
  const tbody = document.querySelector('#activitiesTable tbody');
  
  if (activitiesToDisplay.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">No activities found</td></tr>';
    return;
  }
  
  tbody.innerHTML = activitiesToDisplay.map(activity => {
    const isCriticalAll = activity.gxp_scope === 'Yes' && activity.priority === 'Critical';
    const rowClass = isCriticalAll ? 'row-critical-all' : '';
    
    return `
      <tr class="${rowClass}">
        <td>
          ${activity.activity_name}
          ${activity.last_edited_at ? '<span class="edited-indicator">✏️ Edited ' + formatDate(activity.last_edited_at) + '</span>' : ''}
        </td>
        <td>${activity.department || 'N/A'}</td>
        <td>${getGxpBadge(activity.gxp_scope)}</td>
        <td class="${!isCriticalAll && activity.priority === 'Critical' ? 'cell-critical' : ''}">${getPriorityBadge(activity.priority)}</td>
        <td>${getRiskBadge(activity.risk_level)}</td>
        <td>${formatDate(activity.activity_date)}</td>
        <td><span class="sprint-badge">Sprint ${activity.sprint}</span></td>
        <td>${getStatusBadge(activity.status)}</td>
        <td>${activity.assigned_to_name || activity.created_by_name || 'Unknown'}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editActivity(${activity.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteActivity(${activity.id})">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Filters
document.getElementById('filterStartDate').addEventListener('change', applyFilters);
document.getElementById('filterEndDate').addEventListener('change', applyFilters);
document.getElementById('filterSprint').addEventListener('change', applyFilters);
document.getElementById('filterStatus').addEventListener('change', applyFilters);

function applyFilters() {
  const startDate = document.getElementById('filterStartDate').value;
  const endDate = document.getElementById('filterEndDate').value;
  const sprint = document.getElementById('filterSprint').value;
  const status = document.getElementById('filterStatus').value;
  
  let filtered = [...activities];
  
  if (startDate) {
    filtered = filtered.filter(a => a.activity_date >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter(a => a.activity_date <= endDate);
  }
  if (sprint) {
    filtered = filtered.filter(a => a.sprint == sprint);
  }
  if (status) {
    filtered = filtered.filter(a => a.status === status);
  }
  
  displayActivities(filtered);
}

// Add Activity
document.getElementById('addActivityBtn').addEventListener('click', async () => {
  document.getElementById('activityModalTitle').textContent = 'Add Activity';
  document.getElementById('activityForm').reset();
  document.getElementById('activityId').value = '';
  await populateUserDropdowns();
  document.getElementById('activityModal').classList.add('active');
});

document.getElementById('closeActivityModal').addEventListener('click', () => {
  document.getElementById('activityModal').classList.remove('active');
});

document.getElementById('cancelActivityBtn').addEventListener('click', () => {
  document.getElementById('activityModal').classList.remove('active');
});

document.getElementById('activityForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const activityId = document.getElementById('activityId').value;
  const data = {
    activity_name: document.getElementById('activityName').value,
    description: document.getElementById('activityDescription').value,
    it_type: document.getElementById('activityItType').value,
    department: document.getElementById('activityDepartment').value,
    gxp_scope: document.getElementById('activityGxp').value,
    gxp_impact: document.getElementById('activityGxpImpact').value,
    priority: document.getElementById('activityPriority').value,
    risk_level: document.getElementById('activityRisk').value,
    activity_date: document.getElementById('activityDate').value,
    status: document.getElementById('activityStatus').value,
    business_benefit: document.getElementById('activityBusinessBenefit').value,
    tco_value: document.getElementById('activityTcoValue').value || null
  };
  
  // Add assigned_to and backup_person for admin
  const assignedTo = document.getElementById('activityOwner').value;
  const backupPerson = document.getElementById('activityBackupPerson').value;
  
  if (assignedTo) {
    data.assigned_to = parseInt(assignedTo);
  }
  if (backupPerson) {
    data.backup_person = parseInt(backupPerson);
  }
  
  try {
    const endpoint = activityId ? `/activities/${activityId}` : '/activities';
    const method = activityId ? 'PUT' : 'POST';
    
    const response = await apiCall(endpoint, {
      method,
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      document.getElementById('activityModal').classList.remove('active');
      loadActivities();
    } else {
      const error = await response.json();
      alert(error.error || 'Failed to save activity');
    }
  } catch (error) {
    console.error('Error saving activity:', error);
    alert('Failed to save activity');
  }
});

// Populate user dropdowns
async function populateUserDropdowns() {
  try {
    const response = await apiCall('/users/list');
    const usersList = await response.json();
    
    const ownerSelect = document.getElementById('activityOwner');
    const backupSelect = document.getElementById('activityBackupPerson');
    
    // Clear existing options (except first one)
    ownerSelect.innerHTML = '<option value="">Select user...</option>';
    backupSelect.innerHTML = '<option value="">No backup person</option>';
    
    // Add all users to both dropdowns
    usersList.forEach(user => {
      const ownerOption = document.createElement('option');
      ownerOption.value = user.id;
      ownerOption.textContent = user.username;
      ownerSelect.appendChild(ownerOption);
      
      const backupOption = document.createElement('option');
      backupOption.value = user.id;
      backupOption.textContent = user.username;
      backupSelect.appendChild(backupOption);
    });
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

async function editActivity(id) {
  const activity = activities.find(a => a.id === id);
  if (!activity) return;
  
  await populateUserDropdowns();
  
  document.getElementById('activityModalTitle').textContent = 'Edit Activity';
  document.getElementById('activityId').value = activity.id;
  document.getElementById('activityName').value = activity.activity_name;
  document.getElementById('activityDescription').value = activity.description || '';
  document.getElementById('activityItType').value = activity.it_type || '';
  document.getElementById('activityDepartment').value = activity.department || '';
  document.getElementById('activityGxp').value = activity.gxp_scope;
  document.getElementById('activityGxpImpact').value = activity.gxp_impact || '';
  document.getElementById('activityPriority').value = activity.priority;
  document.getElementById('activityRisk').value = activity.risk_level;
  document.getElementById('activityDate').value = activity.activity_date;
  document.getElementById('activityStatus').value = activity.status;
  document.getElementById('activityOwner').value = activity.created_by || '';
  document.getElementById('activityBackupPerson').value = activity.backup_person || '';
  document.getElementById('activityBusinessBenefit').value = activity.business_benefit || '';
  document.getElementById('activityTcoValue').value = activity.tco_value || '';
  document.getElementById('activityModal').classList.add('active');
}

async function deleteActivity(id) {
  if (!confirm('Are you sure you want to delete this activity?')) return;
  
  try {
    const response = await apiCall(`/activities/${id}`, { method: 'DELETE' });
    if (response.ok) {
      loadActivities();
    } else {
      const error = await response.json();
      alert(error.error || 'Failed to delete activity');
    }
  } catch (error) {
    console.error('Error deleting activity:', error);
    alert('Failed to delete activity');
  }
}

// Export Excel
document.getElementById('exportExcelBtn').addEventListener('click', async () => {
  const startDate = document.getElementById('filterStartDate').value;
  const endDate = document.getElementById('filterEndDate').value;
  const sprint = document.getElementById('filterSprint').value;
  
  try {
    const response = await apiCall('/export/excel', {
      method: 'POST',
      body: JSON.stringify({ startDate, endDate, sprint })
    });
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'activities.xlsx';
    a.click();
  } catch (error) {
    console.error('Error exporting Excel:', error);
    alert('Failed to export Excel file');
  }
});

// ============= USER MANAGEMENT =============

async function loadUsers() {
  try {
    const response = await apiCall('/users');
    users = await response.json();
    displayUsers(users);
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

function displayUsers(usersToDisplay) {
  const tbody = document.querySelector('#usersTable tbody');
  
  if (usersToDisplay.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No users found</td></tr>';
    return;
  }
  
  tbody.innerHTML = usersToDisplay.map(user => `
    <tr>
      <td>${user.id}</td>
      <td>${user.username}</td>
      <td>${user.email || '-'}</td>
      <td><span class="badge ${user.role === 'admin' ? 'badge-critical' : 'badge-low'}">${user.role}</span></td>
      <td>${formatDate(user.created_at)}</td>
      <td>
        ${user.id !== 1 ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">Delete</button>` : '-'}
      </td>
    </tr>
  `).join('');
}

// Add User
document.getElementById('addUserBtn').addEventListener('click', () => {
  document.getElementById('userForm').reset();
  document.getElementById('userModal').classList.add('active');
});

document.getElementById('closeUserModal').addEventListener('click', () => {
  document.getElementById('userModal').classList.remove('active');
});

document.getElementById('cancelUserBtn').addEventListener('click', () => {
  document.getElementById('userModal').classList.remove('active');
});

document.getElementById('userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const data = {
    username: document.getElementById('newUsername').value,
    password: document.getElementById('newPassword2').value,
    email: document.getElementById('newEmail').value,
    role: document.getElementById('newRole').value
  };
  
  try {
    const response = await apiCall('/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      document.getElementById('userModal').classList.remove('active');
      loadUsers();
    } else {
      document.getElementById('userFormMessage').innerHTML = 
        `<div class="error-message">${result.error}</div>`;
    }
  } catch (error) {
    console.error('Error creating user:', error);
    document.getElementById('userFormMessage').innerHTML = 
      `<div class="error-message">Failed to create user</div>`;
  }
});

async function deleteUser(id) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  
  try {
    const response = await apiCall(`/users/${id}`, { method: 'DELETE' });
    if (response.ok) {
      loadUsers();
    } else {
      const error = await response.json();
      alert(error.error || 'Failed to delete user');
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    alert('Failed to delete user');
  }
}

// ============= AUDIT HISTORY =============

async function loadAuditHistory() {
  try {
    const response = await apiCall('/activities/audit/all-history');
    const history = await response.json();
    
    const tbody = document.querySelector('#auditHistoryTable tbody');
    
    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px;">No audit history available</td></tr>';
      return;
    }
    
    tbody.innerHTML = history.map(h => `
      <tr>
        <td>${formatDateTime(h.edited_at)}</td>
        <td><strong>${h.activity_name || 'Unknown Activity'}</strong></td>
        <td><span class="badge badge-low">👤 ${h.edited_by_name || 'Unknown'}</span></td>
        <td>${h.change_description || h.new_value || 'Modified'}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading audit history:', error);
    const tbody = document.querySelector('#auditHistoryTable tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--danger-color);">Failed to load audit history</td></tr>';
  }
}

document.getElementById('refreshAuditBtn').addEventListener('click', () => {
  loadAuditHistory();
});

// ============= PROFILE =============

async function loadProfile() {
  try {
    const response = await apiCall('/auth/me');
    const user = await response.json();
    document.getElementById('notifyEmail').value = user.notify_email || '';
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  if (newPassword !== confirmPassword) {
    document.getElementById('passwordMessage').innerHTML = 
      '<div class="error-message">Passwords do not match</div>';
    return;
  }
  
  try {
    const response = await apiCall('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      document.getElementById('passwordMessage').innerHTML = 
        '<div class="success-message">Password updated successfully</div>';
      document.getElementById('changePasswordForm').reset();
    } else {
      document.getElementById('passwordMessage').innerHTML = 
        `<div class="error-message">${result.error}</div>`;
    }
  } catch (error) {
    document.getElementById('passwordMessage').innerHTML = 
      '<div class="error-message">Failed to update password</div>';
  }
});

document.getElementById('notificationForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const notifyEmail = document.getElementById('notifyEmail').value;
  
  try {
    const response = await apiCall('/auth/update-notification-email', {
      method: 'POST',
      body: JSON.stringify({ notifyEmail })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      document.getElementById('notificationMessage').innerHTML = 
        '<div class="success-message">Notification email updated successfully</div>';
    } else {
      document.getElementById('notificationMessage').innerHTML = 
        `<div class="error-message">${result.error}</div>`;
    }
  } catch (error) {
    document.getElementById('notificationMessage').innerHTML = 
      '<div class="error-message">Failed to update email</div>';
  }
});

// ============= UTILITY FUNCTIONS =============

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getGxpBadge(value) {
  return `<span class="badge badge-${value === 'Yes' ? 'yes' : 'no'}">${value}</span>`;
}

function getPriorityBadge(value) {
  const classes = {
    'Critical': 'badge-critical',
    'High': 'badge-high',
    'Medium': 'badge-medium',
    'Low': 'badge-low'
  };
  return `<span class="badge ${classes[value]}">${value}</span>`;
}

function getRiskBadge(value) {
  const classes = {
    'High': 'badge-high',
    'Medium': 'badge-medium',
    'Low': 'badge-low'
  };
  return `<span class="badge ${classes[value]}">${value}</span>`;
}

function getStatusBadge(value) {
  const classes = {
    'Planned': 'badge-planned',
    'In Progress': 'badge-in-progress',
    'Completed': 'badge-completed',
    'Cancelled': 'badge-cancelled',
    'On Hold': 'badge-on-hold'
  };
  return `<span class="badge ${classes[value]}">${value}</span>`;
}

// Initialize
checkAuth();
setupNavigation();
loadDashboard();
