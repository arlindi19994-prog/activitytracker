const API_URL = window.location.origin + '/api';
let currentUser = null;
let token = null;
let myActivities = [];
let allActivities = [];
let allUsers = [];
let charts = {};

// Check authentication
function checkAuth() {
  token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  
  if (!token || !userStr) {
    window.location.href = 'index.html';
    return;
  }
  
  currentUser = JSON.parse(userStr);
  
  if (currentUser.role === 'admin') {
    window.location.href = 'admin.html';
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
      if (sectionName === 'myactivities') loadMyActivities();
      if (sectionName === 'allactivities') loadAllActivities();
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

// ============= CHARTS =============

function createStatusChart(activities) {
  const ctx = document.getElementById('statusChart');
  if (!ctx) return;
  
  const statusCounts = {
    'Planned': 0,
    'In Progress': 0,
    'Completed': 0,
    'Cancelled': 0,
    'On Hold': 0
  };
  
  activities.forEach(a => {
    if (statusCounts.hasOwnProperty(a.status)) {
      statusCounts[a.status]++;
    }
  });
  
  if (charts.status) charts.status.destroy();
  
  charts.status = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(statusCounts),
      datasets: [{
        data: Object.values(statusCounts),
        backgroundColor: [
          '#cce5ff',
          '#fff3cd',
          '#d4edda',
          '#f8d7da',
          '#e2e3e5'
        ],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            font: { size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.parsed / total) * 100).toFixed(1);
              return `${context.label}: ${context.parsed} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

function createPriorityChart(activities) {
  const ctx = document.getElementById('priorityChart');
  if (!ctx) return;
  
  const priorityCounts = { 'Critical': 0, 'High': 0, 'Medium': 0, 'Low': 0 };
  activities.forEach(a => {
    if (priorityCounts.hasOwnProperty(a.priority)) {
      priorityCounts[a.priority]++;
    }
  });
  
  if (charts.priority) charts.priority.destroy();
  
  charts.priority = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(priorityCounts),
      datasets: [{
        data: Object.values(priorityCounts),
        backgroundColor: [
          '#ef233c',
          '#f77f00',
          '#ffc107',
          '#06d6a0'
        ],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            font: { size: 12 }
          }
        }
      }
    }
  });
}

function createSprintChart(activities) {
  const ctx = document.getElementById('sprintChart');
  if (!ctx) return;
  
  const sprintData = { 1: {total: 0, completed: 0}, 2: {total: 0, completed: 0}, 
                       3: {total: 0, completed: 0}, 4: {total: 0, completed: 0} };
  
  activities.forEach(a => {
    if (sprintData[a.sprint]) {
      sprintData[a.sprint].total++;
      if (a.status === 'Completed') sprintData[a.sprint].completed++;
    }
  });
  
  if (charts.sprint) charts.sprint.destroy();
  
  charts.sprint = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 4'],
      datasets: [{
        label: 'Total Activities',
        data: [sprintData[1].total, sprintData[2].total, sprintData[3].total, sprintData[4].total],
        backgroundColor: '#4361ee',
        borderRadius: 5
      }, {
        label: 'Completed',
        data: [sprintData[1].completed, sprintData[2].completed, sprintData[3].completed, sprintData[4].completed],
        backgroundColor: '#06d6a0',
        borderRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            font: { size: 12 }
          }
        }
      }
    }
  });
}

function createTrendChart(activities) {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  
  const monthCounts = {};
  const currentYear = new Date().getFullYear();
  
  for (let i = 1; i <= 12; i++) {
    monthCounts[i] = 0;
  }
  
  activities.forEach(a => {
    const date = new Date(a.activity_date);
    if (date.getFullYear() === currentYear) {
      const month = date.getMonth() + 1;
      monthCounts[month]++;
    }
  });
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  if (charts.trend) charts.trend.destroy();
  
  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: monthNames,
      datasets: [{
        label: 'Activities per Month',
        data: Object.values(monthCounts),
        borderColor: '#7209b7',
        backgroundColor: 'rgba(114, 9, 183, 0.1)',
        tension: 0.4,
        fill: true,
        borderWidth: 3,
        pointRadius: 5,
        pointBackgroundColor: '#7209b7',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}

// ============= MY ACTIVITIES =============

async function loadMyActivities() {
  try {
    const [activitiesRes, usersRes] = await Promise.all([
      apiCall('/activities'),
      apiCall('/users/list')
    ]);
    
    allActivities = await activitiesRes.json();
    allUsers = await usersRes.json();
    myActivities = allActivities.filter(a => a.created_by === currentUser.id);
    
    // Populate backup person dropdown
    const backupSelect = document.getElementById('activityBackupPerson');
    backupSelect.innerHTML = '<option value="">No backup person</option>' +
      allUsers.filter(u => u.id !== currentUser.id).map(u => 
        `<option value="${u.id}">${u.username}</option>`
      ).join('');
    
    // Update stats
    document.getElementById('myTotalActivities').textContent = myActivities.length;
    document.getElementById('myPlannedActivities').textContent = 
      myActivities.filter(a => a.status === 'Planned').length;
    document.getElementById('myInProgressActivities').textContent = 
      myActivities.filter(a => a.status === 'In Progress').length;
    document.getElementById('myCompletedActivities').textContent = 
      myActivities.filter(a => a.status === 'Completed').length;
    
    // Create charts
    createStatusChart(myActivities);
    createPriorityChart(myActivities);
    createSprintChart(myActivities);
    createTrendChart(myActivities);
    
    displayMyActivities(myActivities);
  } catch (error) {
    console.error('Error loading activities:', error);
  }
}

function displayMyActivities(activitiesToDisplay) {
  const tbody = document.querySelector('#myActivitiesTable tbody');
  
  document.getElementById('filteredCount').textContent = activitiesToDisplay.length;
  
  if (activitiesToDisplay.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px;">No activities found. Create your first activity!</td></tr>';
    return;
  }
  
  tbody.innerHTML = activitiesToDisplay.map(activity => {
    const isCriticalAll = activity.gxp_scope === 'Yes' && activity.priority === 'Critical';
    const rowClass = isCriticalAll ? 'row-critical-all' : '';
    
    return `
      <tr class="${rowClass}">
        <td>
          <strong>${activity.activity_name}</strong>
          ${activity.last_edited_at ? '<span class="edited-indicator">✏️ Edited ' + formatDate(activity.last_edited_at) + '</span>' : ''}
        </td>
        <td><span class="badge" style="background: #e3f2fd; color: #1976d2;">${activity.department || '-'}</span></td>
        <td>${getGxpBadge(activity.gxp_scope)}</td>
        <td class="${!isCriticalAll && activity.priority === 'Critical' ? 'cell-critical' : ''}">${getPriorityBadge(activity.priority)}</td>
        <td>${getRiskBadge(activity.risk_level)}</td>
        <td>${formatDate(activity.activity_date)}</td>
        <td><span class="sprint-badge">Sprint ${activity.sprint}</span></td>
        <td>${getStatusBadge(activity.status)}</td>
        <td>${activity.backup_person_name ? '<span class="badge badge-low">👤 ' + activity.backup_person_name + '</span>' : '-'}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editActivity(${activity.id})">Edit</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Filters for my activities
document.getElementById('myFilterStartDate').addEventListener('change', applyMyFilters);
document.getElementById('myFilterEndDate').addEventListener('change', applyMyFilters);
document.getElementById('myFilterSprint').addEventListener('change', applyMyFilters);
document.getElementById('myFilterStatus').addEventListener('change', applyMyFilters);

function applyMyFilters() {
  const startDate = document.getElementById('myFilterStartDate').value;
  const endDate = document.getElementById('myFilterEndDate').value;
  const sprint = document.getElementById('myFilterSprint').value;
  const status = document.getElementById('myFilterStatus').value;
  
  let filtered = [...myActivities];
  
  if (startDate) filtered = filtered.filter(a => a.activity_date >= startDate);
  if (endDate) filtered = filtered.filter(a => a.activity_date <= endDate);
  if (sprint) filtered = filtered.filter(a => a.sprint == sprint);
  if (status) filtered = filtered.filter(a => a.status === status);
  
  displayMyActivities(filtered);
}

// ============= ALL ACTIVITIES =============

async function loadAllActivities() {
  try {
    const [activitiesRes, progressRes] = await Promise.all([
      apiCall('/activities'),
      apiCall('/activities/sprint-progress')
    ]);
    
    allActivities = await activitiesRes.json();
    const sprintProgress = await progressRes.json();
    
    displaySprintProgress(sprintProgress);
    displayAllActivities(allActivities);
  } catch (error) {
    console.error('Error loading all activities:', error);
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

function displayAllActivities(activitiesToDisplay) {
  const tbody = document.querySelector('#allActivitiesTable tbody');
  
  if (activitiesToDisplay.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No activities found</td></tr>';
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
        <td>${getGxpBadge(activity.gxp_scope)}</td>
        <td class="${!isCriticalAll && activity.priority === 'Critical' ? 'cell-critical' : ''}">${getPriorityBadge(activity.priority)}</td>
        <td>${getRiskBadge(activity.risk_level)}</td>
        <td>${formatDate(activity.activity_date)}</td>
        <td><span class="sprint-badge">Sprint ${activity.sprint}</span></td>
        <td>${getStatusBadge(activity.status)}</td>
        <td>${activity.created_by_name || 'Unknown'}</td>
      </tr>
    `;
  }).join('');
}

// Filters for all activities
document.getElementById('allFilterStartDate').addEventListener('change', applyAllFilters);
document.getElementById('allFilterEndDate').addEventListener('change', applyAllFilters);
document.getElementById('allFilterSprint').addEventListener('change', applyAllFilters);
document.getElementById('allFilterStatus').addEventListener('change', applyAllFilters);

function applyAllFilters() {
  const startDate = document.getElementById('allFilterStartDate').value;
  const endDate = document.getElementById('allFilterEndDate').value;
  const sprint = document.getElementById('allFilterSprint').value;
  const status = document.getElementById('allFilterStatus').value;
  
  let filtered = [...allActivities];
  
  if (startDate) filtered = filtered.filter(a => a.activity_date >= startDate);
  if (endDate) filtered = filtered.filter(a => a.activity_date <= endDate);
  if (sprint) filtered = filtered.filter(a => a.sprint == sprint);
  if (status) filtered = filtered.filter(a => a.status === status);
  
  displayAllActivities(filtered);
}

// ============= ACTIVITY CRUD =============

document.getElementById('addActivityBtn').addEventListener('click', () => {
  document.getElementById('activityModalTitle').textContent = 'Add Activity';
  document.getElementById('activityForm').reset();
  document.getElementById('activityId').value = '';
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
    gxp_scope: document.getElementById('activityGxp').value,
    priority: document.getElementById('activityPriority').value,
    risk_level: document.getElementById('activityRisk').value,
    activity_date: document.getElementById('activityDate').value,
    status: document.getElementById('activityStatus').value,
    it_type: document.getElementById('activityItType').value,
    department: document.getElementById('activityDepartment').value,
    gxp_impact: document.getElementById('activityGxpImpact').value,
    backup_person: document.getElementById('activityBackupPerson').value || null,
    business_benefit: document.getElementById('activityBusinessBenefit').value,
    tco_value: document.getElementById('activityTcoValue').value || null
  };
  
  try {
    const endpoint = activityId ? `/activities/${activityId}` : '/activities';
    const method = activityId ? 'PUT' : 'POST';
    
    const response = await apiCall(endpoint, {
      method,
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      document.getElementById('activityModal').classList.remove('active');
      loadMyActivities();
    } else {
      const error = await response.json();
      alert(error.error || 'Failed to save activity');
    }
  } catch (error) {
    console.error('Error saving activity:', error);
    alert('Failed to save activity');
  }
});

async function editActivity(id) {
  const activity = myActivities.find(a => a.id === id);
  if (!activity) return;
  
  document.getElementById('activityModalTitle').textContent = 'Edit Activity';
  document.getElementById('activityId').value = activity.id;
  document.getElementById('activityName').value = activity.activity_name;
  document.getElementById('activityDescription').value = activity.description || '';
  document.getElementById('activityGxp').value = activity.gxp_scope;
  document.getElementById('activityPriority').value = activity.priority;
  document.getElementById('activityRisk').value = activity.risk_level;
  document.getElementById('activityDate').value = activity.activity_date;
  document.getElementById('activityStatus').value = activity.status;
  document.getElementById('activityItType').value = activity.it_type || '';
  document.getElementById('activityDepartment').value = activity.department || '';
  document.getElementById('activityGxpImpact').value = activity.gxp_impact || '';
  document.getElementById('activityBackupPerson').value = activity.backup_person || '';
  document.getElementById('activityBusinessBenefit').value = activity.business_benefit || '';
  document.getElementById('activityTcoValue').value = activity.tco_value || '';
  document.getElementById('activityModal').classList.add('active');
}

// Export PDF
document.getElementById('exportPdfBtn').addEventListener('click', async () => {
  const startDate = document.getElementById('myFilterStartDate').value;
  const endDate = document.getElementById('myFilterEndDate').value;
  const sprint = document.getElementById('myFilterSprint').value;
  
  try {
    const response = await apiCall('/export/pdf', {
      method: 'POST',
      body: JSON.stringify({ startDate, endDate, sprint })
    });
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-activities-${new Date().toISOString().split('T')[0]}.pdf`;
    a.click();
  } catch (error) {
    console.error('Error exporting PDF:', error);
    alert('Failed to export PDF file');
  }
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
        '<div class="success-message">Notification email updated successfully. You will receive reminders 3 days before your activities start.</div>';
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
loadMyActivities();
