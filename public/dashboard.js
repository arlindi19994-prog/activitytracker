const API_URL = window.location.origin + '/api';
let currentUser = null;
let token = null;
let myActivities = [];
let allActivities = [];
let allUsers = [];
let charts = {};
let showArchived = false;

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
      if (sectionName === 'myactivities') {
        loadMyActivities();
      }
      if (sectionName === 'allactivities') {
        loadAllActivities();
      }
      if (sectionName === 'profile') {
        loadProfile();
      }
      if (sectionName === 'calendar') {
        if (myActivities.length === 0) {
          loadMyActivities().then(() => renderCalendar());
        } else {
          renderCalendar();
        }
      }
      if (sectionName === 'analytics') {
        if (allActivities.length === 0) {
          loadAllActivities().then(() => loadAnalytics());
        } else {
          loadAnalytics();
        }
      }
      if (sectionName === 'templates') {
        loadTemplates();
      }
      
      // Close mobile menu
      document.getElementById('sidebar').classList.remove('active');
    });
  });
  
  // Mobile menu toggle
  const mobileToggle = document.getElementById('mobileMenuToggle');
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('active');
    });
  }
}

function switchSection(sectionName) {
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.content-section');
  
  navLinks.forEach(l => {
    if (l.dataset.section === sectionName) {
      l.classList.add('active');
    } else {
      l.classList.remove('active');
    }
  });
  
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
}

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
  
  // Show empty state if no data
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const chartData = total === 0 ? [1] : Object.values(statusCounts);
  const chartLabels = total === 0 ? ['No Activities'] : Object.keys(statusCounts);
  const chartColors = total === 0 ? ['#e2e3e5'] : [
    '#cce5ff',
    '#fff3cd',
    '#d4edda',
    '#f8d7da',
    '#e2e3e5'
  ];
  
  charts.status = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartData,
        backgroundColor: chartColors,
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
          enabled: total > 0,
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
  
  // Show empty state if no data
  const total = Object.values(priorityCounts).reduce((a, b) => a + b, 0);
  const chartData = total === 0 ? [1] : Object.values(priorityCounts);
  const chartLabels = total === 0 ? ['No Activities'] : Object.keys(priorityCounts);
  const chartColors = total === 0 ? ['#e2e3e5'] : [
    '#ef233c',
    '#f77f00',
    '#ffc107',
    '#06d6a0'
  ];
  
  charts.priority = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartData,
        backgroundColor: chartColors,
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
          enabled: total > 0
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
      apiCall('/activities/my'),
      apiCall('/users/list')
    ]);
    
    myActivities = await activitiesRes.json();
    allUsers = await usersRes.json();
    
    // Populate backup person dropdown
    const backupSelect = document.getElementById('activityBackupPerson');
    backupSelect.innerHTML = '<option value="">No backup person</option>' +
      allUsers.filter(u => u.id !== currentUser.id).map(u => 
        `<option value="${u.id}">${u.username}</option>`
      ).join('');
    
    // Filter archived activities based on toggle
    const visibleActivities = showArchived ? myActivities : myActivities.filter(a => !a.is_archived);
    const activeActivities = myActivities.filter(a => !a.is_archived);
    
    // Update stats (only count non-archived)
    document.getElementById('myTotalActivities').textContent = activeActivities.length;
    document.getElementById('myPlannedActivities').textContent = 
      activeActivities.filter(a => a.status === 'Planned').length;
    document.getElementById('myInProgressActivities').textContent = 
      activeActivities.filter(a => a.status === 'In Progress').length;
    document.getElementById('myCompletedActivities').textContent = 
      activeActivities.filter(a => a.status === 'Completed').length;
    
    // Create charts
    createStatusChart(activeActivities);
    createPriorityChart(activeActivities);
    createSprintChart(activeActivities);
    createTrendChart(activeActivities);
    
    displayMyActivities(visibleActivities);
  } catch (error) {
    console.error('Error loading activities:', error);
  }
}

function displayMyActivities(activitiesToDisplay) {
  const tbody = document.querySelector('#myActivitiesTable tbody');
  
  document.getElementById('filteredCount').textContent = activitiesToDisplay.length;
  
  if (activitiesToDisplay.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px;">No activities found. Create your first activity!</td></tr>';
    return;
  }
  
  tbody.innerHTML = activitiesToDisplay.map(activity => {
    const isCriticalAll = activity.gxp_scope === 'Yes' && activity.priority === 'Critical';
    const rowClass = isCriticalAll ? 'row-critical-all' : '';
    const progress = activity.progress_percentage || 0;
    const progressColor = progress >= 80 ? '#06d6a0' : progress >= 50 ? '#ffc107' : '#ef233c';
    
    // Check if overdue
    const activityDate = new Date(activity.activity_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isOverdue = activityDate < today && activity.status !== 'Completed' && activity.status !== 'Cancelled';
    
    return `
      <tr class="${rowClass}" data-activity-id="${activity.id}">
        <td><input type="checkbox" class="activity-checkbox" data-id="${activity.id}"></td>
        <td>
          <strong>${activity.activity_name}</strong>
          ${activity.last_edited_at ? '<span class="edited-indicator">✏️ Edited ' + formatDate(activity.last_edited_at) + '</span>' : ''}
          ${isOverdue ? '<span class="badge" style="background: #dc3545; color: white; margin-left: 5px;">⚠️ OVERDUE</span>' : ''}
        </td>
        <td><span class="badge" style="background: #e3f2fd; color: #1976d2;">${activity.department || '-'}</span></td>
        <td><span class="badge badge-low">👤 ${activity.owner_name || activity.owner_name_display || currentUser.username}</span></td>
        <td>${getGxpBadge(activity.gxp_scope)}</td>
        <td class="${!isCriticalAll && activity.priority === 'Critical' ? 'cell-critical' : ''}">${getPriorityBadge(activity.priority)}</td>
        <td>${getRiskBadge(activity.risk_level)}</td>
        <td>${formatDate(activity.activity_date)}</td>
        <td><span class="sprint-badge">Sprint ${activity.sprint}</span></td>
        <td>
          <select class="quick-status-change" data-id="${activity.id}" data-current="${activity.status}" 
                  style="padding: 5px 8px; border: 2px solid #ddd; border-radius: 5px; font-size: 0.85em; cursor: pointer; background: white;"
                  onchange="quickStatusChange(${activity.id}, this.value)">
            <option value="Planned" ${activity.status === 'Planned' ? 'selected' : ''}>Planned</option>
            <option value="In Progress" ${activity.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
            <option value="Completed" ${activity.status === 'Completed' ? 'selected' : ''}>Completed</option>
            <option value="Cancelled" ${activity.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
            <option value="On Hold" ${activity.status === 'On Hold' ? 'selected' : ''}>On Hold</option>
          </select>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="flex: 1; min-width: 60px; background: #e0e0e0; height: 20px; border-radius: 10px; overflow: hidden;">
              <div style="width: ${progress}%; background: ${progressColor}; height: 100%; transition: width 0.3s;"></div>
            </div>
            <span style="font-size: 0.85em; font-weight: bold; color: ${progressColor};">${progress}%</span>
          </div>
        </td>
        <td>${activity.backup_person_name ? '<span class="badge badge-low">👤 ' + activity.backup_person_name + '</span>' : '-'}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editActivity(${activity.id})" style="margin-right: 5px; margin-bottom: 3px;">Edit</button>
          <button class="btn btn-sm" style="background: #17a2b8; color: white; margin-right: 5px; margin-bottom: 3px;" onclick="cloneActivity(${activity.id})">📋 Clone</button>
          <button class="btn btn-sm" style="background: #6c757d; color: white; margin-right: 5px; margin-bottom: 3px;" onclick="viewActivityHistory(${activity.id})">📜 History</button>
          <button class="btn btn-sm" style="background: ${activity.is_archived ? '#28a745' : '#fd7e14'}; color: white; margin-bottom: 3px;" onclick="toggleArchiveActivity(${activity.id})">${activity.is_archived ? '📤 Unarchive' : '📦 Archive'}</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Quick status change function
async function quickStatusChange(id, newStatus) {
  const activity = myActivities.find(a => a.id === id);
  if (!activity) return;
  
  const data = {
    activity_name: activity.activity_name,
    description: activity.description,
    gxp_scope: activity.gxp_scope,
    priority: activity.priority,
    risk_level: activity.risk_level,
    activity_date: activity.activity_date,
    status: newStatus,
    it_type: activity.it_type,
    department: activity.department,
    gxp_impact: activity.gxp_impact,
    backup_person: activity.backup_person,
    business_benefit: activity.business_benefit,
    tco_value: activity.tco_value,
    owner_name: activity.owner_name,
    is_shared: activity.is_shared
  };
  
  try {
    const response = await apiCall(`/activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      // Update local data
      activity.status = newStatus;
      // Show brief success indicator
      const select = document.querySelector(`select[data-id="${id}"]`);
      if (select) {
        select.style.borderColor = 'var(--success-color)';
        setTimeout(() => {
          select.style.borderColor = '#ddd';
        }, 1000);
      }
      // Refresh stats
      loadMyActivities();
    } else {
      alert('Failed to update status');
      // Revert selection
      const select = document.querySelector(`select[data-id="${id}"]`);
      if (select) {
        select.value = activity.status;
      }
    }
  } catch (error) {
    console.error('Status update error:', error);
    alert('Failed to update status');
  }
}

// Filters for my activities
document.getElementById('myFilterStartDate').addEventListener('change', applyMyFilters);
document.getElementById('myFilterEndDate').addEventListener('change', applyMyFilters);
document.getElementById('myFilterSprint').addEventListener('change', applyMyFilters);
document.getElementById('myFilterStatus').addEventListener('change', applyMyFilters);
document.getElementById('myFilterDepartment').addEventListener('change', applyMyFilters);
document.getElementById('myFilterPriority').addEventListener('change', applyMyFilters);
document.getElementById('myFilterRisk').addEventListener('change', applyMyFilters);

function applyMyFilters() {
  const startDate = document.getElementById('myFilterStartDate').value;
  const endDate = document.getElementById('myFilterEndDate').value;
  const sprint = document.getElementById('myFilterSprint').value;
  const status = document.getElementById('myFilterStatus').value;
  const departments = Array.from(document.getElementById('myFilterDepartment').selectedOptions).map(o => o.value);
  const priorities = Array.from(document.getElementById('myFilterPriority').selectedOptions).map(o => o.value);
  const risks = Array.from(document.getElementById('myFilterRisk').selectedOptions).map(o => o.value);
  
  let filtered = showArchived ? [...myActivities] : myActivities.filter(a => !a.is_archived);
  
  if (startDate) filtered = filtered.filter(a => a.activity_date >= startDate);
  if (endDate) filtered = filtered.filter(a => a.activity_date <= endDate);
  if (sprint) filtered = filtered.filter(a => a.sprint == sprint);
  if (status) filtered = filtered.filter(a => a.status === status);
  if (departments.length > 0) filtered = filtered.filter(a => departments.includes(a.department));
  if (priorities.length > 0) filtered = filtered.filter(a => priorities.includes(a.priority));
  if (risks.length > 0) filtered = filtered.filter(a => risks.includes(a.risk_level));
  
  displayMyActivities(filtered);
}

// ============= ALL ACTIVITIES =============

async function loadAllActivities() {
  try {
    const activitiesRes = await apiCall('/activities/shared');
    
    allActivities = await activitiesRes.json();
    
    // Create charts for all activities
    createAllStatusChart(allActivities);
    createAllPriorityChart(allActivities);
    createAllSprintChart(allActivities);
    createAllTrendChart(allActivities);
    
    displayAllActivities(allActivities);
  } catch (error) {
    console.error('Error loading all activities:', error);
  }
}

function createAllStatusChart(activities) {
  const ctx = document.getElementById('allStatusChart');
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
  
  if (charts.allStatus) charts.allStatus.destroy();
  
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const chartData = total === 0 ? [1] : Object.values(statusCounts);
  const chartLabels = total === 0 ? ['No Activities'] : Object.keys(statusCounts);
  const chartColors = total === 0 ? ['#e2e3e5'] : [
    '#cce5ff',
    '#fff3cd',
    '#d4edda',
    '#f8d7da',
    '#e2e3e5'
  ];
  
  charts.allStatus = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartData,
        backgroundColor: chartColors,
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
          enabled: total > 0,
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

function createAllPriorityChart(activities) {
  const ctx = document.getElementById('allPriorityChart');
  if (!ctx) return;
  
  const priorityCounts = { 'Critical': 0, 'High': 0, 'Medium': 0, 'Low': 0 };
  activities.forEach(a => {
    if (priorityCounts.hasOwnProperty(a.priority)) {
      priorityCounts[a.priority]++;
    }
  });
  
  if (charts.allPriority) charts.allPriority.destroy();
  
  const total = Object.values(priorityCounts).reduce((a, b) => a + b, 0);
  const chartData = total === 0 ? [1] : Object.values(priorityCounts);
  const chartLabels = total === 0 ? ['No Activities'] : Object.keys(priorityCounts);
  const chartColors = total === 0 ? ['#e2e3e5'] : [
    '#ef233c',
    '#f77f00',
    '#ffc107',
    '#06d6a0'
  ];
  
  charts.allPriority = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartData,
        backgroundColor: chartColors,
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
          enabled: total > 0
        }
      }
    }
  });
}

function createAllSprintChart(activities) {
  const ctx = document.getElementById('allSprintChart');
  if (!ctx) return;
  
  const sprintData = { 1: {total: 0, completed: 0}, 2: {total: 0, completed: 0}, 
                       3: {total: 0, completed: 0}, 4: {total: 0, completed: 0} };
  
  activities.forEach(a => {
    if (sprintData[a.sprint]) {
      sprintData[a.sprint].total++;
      if (a.status === 'Completed') sprintData[a.sprint].completed++;
    }
  });
  
  if (charts.allSprint) charts.allSprint.destroy();
  
  charts.allSprint = new Chart(ctx, {
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

function createAllTrendChart(activities) {
  const ctx = document.getElementById('allTrendChart');
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
  
  if (charts.allTrend) charts.allTrend.destroy();
  
  charts.allTrend = new Chart(ctx, {
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

function displayAllActivities(activitiesToDisplay) {
  const tbody = document.querySelector('#allActivitiesTable tbody');
  
  if (activitiesToDisplay.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">No shared activities found</td></tr>';
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
        <td><span class="badge badge-low">👤 ${activity.owner_name || activity.owner_name_display || 'Unknown'}</span></td>
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
  currentActivityForComments = null; // Clear for new activity
  document.getElementById('activityModalTitle').textContent = 'Add Personal Activity';
  document.getElementById('activityForm').reset();
  document.getElementById('activityId').value = '';
  document.getElementById('activityVisibility').value = '0'; // Personal by default
  document.getElementById('activityOwnerName').value = currentUser.username;
  document.getElementById('viewCommentsBtn').style.display = 'none'; // Hide comments button for new activity
  document.getElementById('viewAttachmentsBtn').style.display = 'none'; // Hide attachments button for new activity
  document.getElementById('viewDependenciesBtn').style.display = 'none'; // Hide dependencies button for new activity
  document.getElementById('activityModal').classList.add('active');
});

document.getElementById('addSharedActivityBtn').addEventListener('click', () => {
  currentActivityForComments = null; // Clear for new activity
  document.getElementById('activityModalTitle').textContent = 'Add Shared Activity';
  document.getElementById('activityForm').reset();
  document.getElementById('activityId').value = '';
  document.getElementById('activityVisibility').value = '1'; // Shared
  document.getElementById('activityOwnerName').value = currentUser.username;
  document.getElementById('viewCommentsBtn').style.display = 'none'; // Hide comments button for new activity
  document.getElementById('viewAttachmentsBtn').style.display = 'none'; // Hide attachments button for new activity
  document.getElementById('viewDependenciesBtn').style.display = 'none'; // Hide dependencies button for new activity
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
    tco_value: document.getElementById('activityTcoValue').value || null,
    owner_name: document.getElementById('activityOwnerName').value,
    is_shared: parseInt(document.getElementById('activityVisibility').value),
    progress_percentage: parseInt(document.getElementById('activityProgress').value) || 0
  };
  
  try {
    const endpoint = activityId ? `/activities/${activityId}` : '/activities';
    const method = activityId ? 'PUT' : 'POST';
    
    const response = await apiCall(endpoint, {
      method,
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      document.getElementById('activityModal').classList.remove('active');
      loadMyActivities();
      if (data.is_shared) {
        loadAllActivities();
      }
    } else {
      if (result.duplicate) {
        alert('⚠️ Duplicate Activity!\n\n' + result.error);
      } else {
        alert(result.error || 'Failed to save activity');
      }
    }
  } catch (error) {
    console.error('Error saving activity:', error);
    alert('Failed to save activity');
  }
});

async function editActivity(id) {
  const activity = myActivities.find(a => a.id === id);
  if (!activity) return;
  
  currentActivityForComments = id; // Set for comments modal
  
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
  document.getElementById('activityOwnerName').value = activity.owner_name || currentUser.username;
  document.getElementById('activityVisibility').value = activity.is_shared || 0;
  document.getElementById('activityProgress').value = activity.progress_percentage || 0;
  document.getElementById('viewCommentsBtn').style.display = 'block'; // Show comments button
  document.getElementById('viewAttachmentsBtn').style.display = 'block'; // Show attachments button
  document.getElementById('viewDependenciesBtn').style.display = 'block'; // Show dependencies button
  document.getElementById('activityModal').classList.add('active');
}

// Clone activity
async function cloneActivity(id) {
  const activity = myActivities.find(a => a.id === id);
  if (!activity) return;
  
  document.getElementById('activityModalTitle').textContent = 'Clone Activity';
  document.getElementById('activityId').value = ''; // Clear ID for new activity
  document.getElementById('activityName').value = activity.activity_name + ' (Copy)';
  document.getElementById('activityDescription').value = activity.description || '';
  document.getElementById('activityGxp').value = activity.gxp_scope;
  document.getElementById('activityPriority').value = activity.priority;
  document.getElementById('activityRisk').value = activity.risk_level;
  document.getElementById('activityDate').value = ''; // Clear date for user to set
  document.getElementById('activityStatus').value = 'Planned'; // Default to Planned
  document.getElementById('activityItType').value = activity.it_type || '';
  document.getElementById('activityDepartment').value = activity.department || '';
  document.getElementById('activityGxpImpact').value = activity.gxp_impact || '';
  document.getElementById('activityBackupPerson').value = activity.backup_person || '';
  document.getElementById('activityBusinessBenefit').value = activity.business_benefit || '';
  document.getElementById('activityTcoValue').value = activity.tco_value || '';
  document.getElementById('activityOwnerName').value = currentUser.username;
  document.getElementById('activityVisibility').value = activity.is_shared || 0;
  document.getElementById('activityProgress').value = 0; // Reset progress for clone
  document.getElementById('activityModal').classList.add('active');
}

// View activity history
async function viewActivityHistory(id) {
  try {
    const response = await apiCall(`/activities/${id}/my-history`);
    const history = await response.json();
    
    const historyContent = document.getElementById('historyContent');
    
    if (history.length === 0) {
      historyContent.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-secondary);">No history available for this activity.</p>';
    } else {
      historyContent.innerHTML = `
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: var(--hover-bg); border-bottom: 2px solid #ddd;">
              <th style="padding: 12px; text-align: left;">Date & Time</th>
              <th style="padding: 12px; text-align: left;">Edited By</th>
              <th style="padding: 12px; text-align: left;">Changes</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(h => `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px;">${formatDateTime(h.edited_at)}</td>
                <td style="padding: 12px;">${h.edited_by_name || 'Unknown'}</td>
                <td style="padding: 12px;">${h.change_description || h.new_value || 'Modified'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    
    document.getElementById('historyModal').classList.add('active');
  } catch (error) {
    console.error('Error loading history:', error);
    alert('Failed to load activity history');
  }
}

document.getElementById('closeHistoryModal').addEventListener('click', () => {
  document.getElementById('historyModal').classList.remove('active');
});

document.getElementById('closeHistoryBtn').addEventListener('click', () => {
  document.getElementById('historyModal').classList.remove('active');
});

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

// Export CSV
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  try {
    // Get current visible activities
    const activitiesToExport = currentView === 'myactivities' ? myActivities : allActivities;
    
    // Create CSV headers
    const headers = ['Activity Name', 'Department', 'Owner', 'GxP', 'Priority', 'Risk', 'Date', 'Sprint', 'Status', 'Progress %', 'Backup Person'];
    
    // Create CSV rows
    const rows = activitiesToExport.map(activity => [
      activity.activity_name,
      activity.department || '',
      activity.owner_name || activity.owner_name_display || '',
      activity.gxp_scope || '',
      activity.priority || '',
      activity.risk_level || '',
      activity.activity_date || '',
      activity.sprint || '',
      activity.status || '',
      activity.progress_percentage || 0,
      activity.backup_person_name || ''
    ]);
    
    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activities-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    alert('Failed to export CSV file');
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

// ============= GLOBAL SEARCH =============

let searchTimeout;

document.getElementById('globalSearch').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim().toLowerCase();
  
  if (query.length < 2) {
    document.getElementById('searchResults').style.display = 'none';
    return;
  }
  
  searchTimeout = setTimeout(() => {
    const results = myActivities.filter(a => 
      a.activity_name.toLowerCase().includes(query) ||
      (a.description && a.description.toLowerCase().includes(query)) ||
      (a.owner_name && a.owner_name.toLowerCase().includes(query)) ||
      (a.department && a.department.toLowerCase().includes(query))
    ).slice(0, 10); // Limit to 10 results
    
    displaySearchResults(results, 'searchResults');
  }, 300);
});

document.getElementById('globalSearchAll').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim().toLowerCase();
  
  if (query.length < 2) {
    document.getElementById('searchResultsAll').style.display = 'none';
    return;
  }
  
  searchTimeout = setTimeout(() => {
    const results = allActivities.filter(a => 
      a.activity_name.toLowerCase().includes(query) ||
      (a.description && a.description.toLowerCase().includes(query)) ||
      (a.owner_name && a.owner_name.toLowerCase().includes(query)) ||
      (a.created_by_name && a.created_by_name.toLowerCase().includes(query))
    ).slice(0, 10);
    
    displaySearchResults(results, 'searchResultsAll');
  }, 300);
});

function displaySearchResults(results, containerId) {
  const container = document.getElementById(containerId);
  
  if (results.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No results found</div>';
    container.style.display = 'block';
    return;
  }
  
  container.innerHTML = results.map(a => `
    <div style="padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; transition: background 0.2s;" 
         onmouseover="this.style.background='#f8f9fa'" 
         onmouseout="this.style.background='white'"
         onclick="highlightActivity(${a.id})">
      <div style="font-weight: bold; margin-bottom: 5px;">${a.activity_name}</div>
      <div style="font-size: 0.85em; color: #666;">
        ${getStatusBadge(a.status)} ${getPriorityBadge(a.priority)} • 
        ${formatDate(a.activity_date)} • 
        Sprint ${a.sprint}
      </div>
    </div>
  `).join('');
  
  container.style.display = 'block';
}

function highlightActivity(id) {
  // Close search results
  document.getElementById('searchResults').style.display = 'none';
  document.getElementById('searchResultsAll').style.display = 'none';
  document.getElementById('globalSearch').value = '';
  document.getElementById('globalSearchAll').value = '';
  
  // Find and highlight the row
  const rows = document.querySelectorAll('table tbody tr');
  rows.forEach(row => {
    const button = row.querySelector(`button[onclick*="editActivity(${id})"]`);
    if (button) {
      row.style.backgroundColor = '#fffacd';
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        row.style.transition = 'background-color 2s';
        row.style.backgroundColor = '';
      }, 2000);
    }
  });
}

// Close search results when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('#globalSearch') && !e.target.closest('#searchResults')) {
    document.getElementById('searchResults').style.display = 'none';
  }
  if (!e.target.closest('#globalSearchAll') && !e.target.closest('#searchResultsAll')) {
    document.getElementById('searchResultsAll').style.display = 'none';
  }
});

// Keyboard shortcut: Press '/' to focus search
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.matches('input, textarea')) {
    e.preventDefault();
    document.getElementById('globalSearch').focus();
  }
});

// ============= DARK MODE =============

function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButton(savedTheme);
}

function updateThemeButton(theme) {
  const icon = document.getElementById('themeIcon');
  const text = document.getElementById('themeText');
  if (theme === 'dark') {
    icon.textContent = '☀️';
    text.textContent = 'Light Mode';
  } else {
    icon.textContent = '🌙';
    text.textContent = 'Dark Mode';
  }
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeButton(newTheme);
});

// ============= BULK OPERATIONS =============

let selectedActivities = new Set();

// Select all checkbox
document.getElementById('selectAll').addEventListener('change', (e) => {
  const checkboxes = document.querySelectorAll('.activity-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = e.target.checked;
    if (e.target.checked) {
      selectedActivities.add(parseInt(cb.dataset.id));
    } else {
      selectedActivities.delete(parseInt(cb.dataset.id));
    }
  });
  updateBulkActionsBar();
});

// Individual checkbox changes
document.addEventListener('change', (e) => {
  if (e.target.classList.contains('activity-checkbox')) {
    const id = parseInt(e.target.dataset.id);
    if (e.target.checked) {
      selectedActivities.add(id);
    } else {
      selectedActivities.delete(id);
      document.getElementById('selectAll').checked = false;
    }
    updateBulkActionsBar();
  }
});

function updateBulkActionsBar() {
  const count = selectedActivities.size;
  const bar = document.getElementById('bulkActionsBar');
  const countSpan = document.getElementById('selectedCount');
  
  if (count > 0) {
    bar.style.display = 'flex';
    countSpan.textContent = `${count} selected`;
  } else {
    bar.style.display = 'none';
  }
}

// Clear selection
document.getElementById('clearSelection').addEventListener('click', () => {
  selectedActivities.clear();
  document.querySelectorAll('.activity-checkbox').forEach(cb => cb.checked = false);
  document.getElementById('selectAll').checked = false;
  updateBulkActionsBar();
});

// Apply bulk status change
document.getElementById('applyBulkStatus').addEventListener('click', async () => {
  const newStatus = document.getElementById('bulkStatusChange').value;
  if (!newStatus) {
    alert('Please select a status');
    return;
  }
  
  if (!confirm(`Change status of ${selectedActivities.size} activities to "${newStatus}"?`)) {
    return;
  }
  
  const promises = Array.from(selectedActivities).map(async (id) => {
    const activity = myActivities.find(a => a.id === id);
    if (!activity) return;
    
    const data = {
      activity_name: activity.activity_name,
      description: activity.description,
      gxp_scope: activity.gxp_scope,
      priority: activity.priority,
      risk_level: activity.risk_level,
      activity_date: activity.activity_date,
      status: newStatus,
      it_type: activity.it_type,
      department: activity.department,
      gxp_impact: activity.gxp_impact,
      backup_person: activity.backup_person,
      business_benefit: activity.business_benefit,
      tco_value: activity.tco_value,
      owner_name: activity.owner_name,
      is_shared: activity.is_shared
    };
    
    return apiCall(`/activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  });
  
  try {
    await Promise.all(promises);
    alert(`Successfully updated ${selectedActivities.size} activities`);
    selectedActivities.clear();
    document.getElementById('bulkStatusChange').value = '';
    loadMyActivities();
  } catch (error) {
    console.error('Bulk update error:', error);
    alert('Failed to update some activities');
  }
});

// ============= KEYBOARD SHORTCUTS =============

document.addEventListener('keydown', (e) => {
  // Ignore if user is typing in an input field
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
    // Allow Escape to close modals even when in input
    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('.modal.active');
      modals.forEach(modal => modal.classList.remove('active'));
    }
    return;
  }
  
  // N - New Activity
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    document.getElementById('addActivityBtn').click();
  }
  
  // E - Edit first selected activity
  if (e.key === 'e' || e.key === 'E') {
    e.preventDefault();
    if (selectedActivities.size === 1) {
      const activityId = Array.from(selectedActivities)[0];
      editActivity(activityId);
    } else if (selectedActivities.size > 1) {
      alert('Please select only one activity to edit');
    }
  }
  
  // Delete - Delete selected activities
  if (e.key === 'Delete') {
    e.preventDefault();
    if (selectedActivities.size > 0) {
      if (confirm(`Delete ${selectedActivities.size} selected activities?`)) {
        deleteSelectedActivities();
      }
    }
  }
  
  // Escape - Close modals
  if (e.key === 'Escape') {
    const modals = document.querySelectorAll('.modal.active');
    modals.forEach(modal => modal.classList.remove('active'));
  }
  
  // Ctrl+A - Select All
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault();
    document.getElementById('selectAll').click();
  }
});

async function deleteSelectedActivities() {
  const promises = Array.from(selectedActivities).map(id => {
    return apiCall(`/activities/${id}`, { method: 'DELETE' });
  });
  
  try {
    await Promise.all(promises);
    alert(`Successfully deleted ${selectedActivities.size} activities`);
    selectedActivities.clear();
    loadMyActivities();
  } catch (error) {
    console.error('Bulk delete error:', error);
    alert('Failed to delete some activities');
  }
}
// ============= ARCHIVING =============

// Toggle archive view
document.getElementById('toggleArchived').addEventListener('click', () => {
  showArchived = !showArchived;
  const btn = document.getElementById('toggleArchived');
  btn.innerHTML = showArchived 
    ? '<span>📋</span><span>Hide Archived</span>' 
    : '<span>📦</span><span>Show Archived</span>';
  loadMyActivities();
});

// Archive/Unarchive activity
async function toggleArchiveActivity(id) {
  const activity = myActivities.find(a => a.id === id);
  if (!activity) return;
  
  const newArchivedState = !activity.is_archived;
  const action = newArchivedState ? 'archive' : 'unarchive';
  
  if (!confirm(`Are you sure you want to ${action} this activity?`)) {
    return;
  }
  
  try {
    // Update activity with new archived state
    const data = {
      activity_name: activity.activity_name,
      description: activity.description,
      gxp_scope: activity.gxp_scope,
      priority: activity.priority,
      risk_level: activity.risk_level,
      activity_date: activity.activity_date,
      sprint: activity.sprint,
      status: activity.status,
      backup_person: activity.backup_person,
      department: activity.department,
      it_type: activity.it_type,
      gxp_impact: activity.gxp_impact,
      business_benefit: activity.business_benefit,
      tco_value: activity.tco_value,
      owner_name: activity.owner_name,
      is_shared: activity.is_shared,
      progress_percentage: activity.progress_percentage,
      is_archived: newArchivedState
    };
    
    await apiCall(`/activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    
    loadMyActivities();
  } catch (error) {
    console.error('Error toggling archive:', error);
    alert('Failed to update activity');
  }
}

// ============= CALENDAR VIEW =============

let currentCalendarDate = new Date();

function renderCalendar() {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  
  // Update month/year display
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  document.getElementById('currentMonthYear').textContent = `${monthNames[month]} ${year}`;
  
  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Build calendar grid
  const calendarGrid = document.getElementById('calendarGrid');
  calendarGrid.innerHTML = '';
  
  // Day headers
  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayHeaders.forEach(day => {
    const header = document.createElement('div');
    header.style.cssText = 'font-weight: bold; text-align: center; padding: 10px; background: var(--primary-color); color: white; border-radius: 5px;';
    header.textContent = day;
    calendarGrid.appendChild(header);
  });
  
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.style.cssText = 'min-height: 100px; background: #f5f5f5; border-radius: 5px;';
    calendarGrid.appendChild(emptyCell);
  }
  
  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayActivities = myActivities.filter(a => a.activity_date === dateStr && !a.is_archived);
    
    const dayCell = document.createElement('div');
    dayCell.style.cssText = 'min-height: 100px; border: 2px solid #ddd; border-radius: 5px; padding: 8px; cursor: pointer; background: white; transition: all 0.2s;';
    dayCell.onmouseover = () => dayCell.style.background = '#f0f8ff';
    dayCell.onmouseout = () => dayCell.style.background = 'white';
    dayCell.onclick = () => showDayActivities(dateStr, dayActivities);
    
    const dayNumber = document.createElement('div');
    dayNumber.style.cssText = 'font-weight: bold; font-size: 1.1em; margin-bottom: 5px;';
    dayNumber.textContent = day;
    dayCell.appendChild(dayNumber);
    
    // Show activity badges
    if (dayActivities.length > 0) {
      const badge = document.createElement('div');
      badge.style.cssText = 'background: var(--primary-color); color: white; font-size: 0.75em; padding: 2px 6px; border-radius: 10px; text-align: center; margin-top: 5px;';
      badge.textContent = `${dayActivities.length} ${dayActivities.length === 1 ? 'activity' : 'activities'}`;
      dayCell.appendChild(badge);
      
      // Show status breakdown
      const statuses = dayActivities.reduce((acc, a) => {
        acc[a.status] = (acc[a.status] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(statuses).slice(0, 3).forEach(([status, count]) => {
        const statusBadge = document.createElement('div');
        statusBadge.style.cssText = 'font-size: 0.7em; margin-top: 3px; padding: 1px 4px; border-radius: 3px; background: #e9ecef;';
        statusBadge.textContent = `${status}: ${count}`;
        dayCell.appendChild(statusBadge);
      });
    }
    
    calendarGrid.appendChild(dayCell);
  }
}

function showDayActivities(dateStr, activities) {
  const card = document.getElementById('dayActivitiesCard');
  const title = document.getElementById('selectedDayTitle');
  const list = document.getElementById('dayActivitiesList');
  
  const date = new Date(dateStr + 'T00:00:00');
  title.textContent = `Activities on ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
  
  if (activities.length === 0) {
    list.innerHTML = '<p style="color: #999;">No activities scheduled for this day</p>';
  } else {
    list.innerHTML = activities.map(a => `
      <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 10px; background: white;">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <h4 style="margin: 0 0 10px 0;">${a.activity_name}</h4>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
              <span class="badge" style="background: #e3f2fd; color: #1976d2;">${a.department || 'N/A'}</span>
              <span class="badge" style="background: ${a.status === 'Completed' ? '#06d6a0' : a.status === 'In Progress' ? '#ffc107' : '#6c757d'}; color: white;">${a.status}</span>
              <span class="badge" style="background: ${a.priority === 'Critical' ? '#dc3545' : a.priority === 'High' ? '#ff6b6b' : a.priority === 'Medium' ? '#ffc107' : '#06d6a0'}; color: white;">${a.priority}</span>
            </div>
          </div>
          <button class="btn btn-sm btn-primary" onclick="editActivity(${a.id})">Edit</button>
        </div>
      </div>
    `).join('');
  }
  
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('prevMonth').addEventListener('click', () => {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  renderCalendar();
});
// ============= COMMENTS SYSTEM =============

let currentActivityForComments = null;

// View comments button (in activity modal)
document.getElementById('viewCommentsBtn').addEventListener('click', () => {
  if (currentActivityForComments) {
    document.getElementById('activityModal').classList.remove('active');
    loadComments(currentActivityForComments);
    document.getElementById('commentsModal').classList.add('active');
  }
});

// Close comments modal
document.getElementById('closeCommentsModal').addEventListener('click', () => {
  document.getElementById('commentsModal').classList.remove('active');
});

// Add comment
document.getElementById('addCommentBtn').addEventListener('click', async () => {
  const commentText = document.getElementById('newCommentText').value.trim();
  
  if (!commentText) {
    alert('Please enter a comment');
    return;
  }
  
  if (!currentActivityForComments) {
    alert('No activity selected');
    return;
  }
  
  try {
    await apiCall(`/activities/${currentActivityForComments}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment_text: commentText })
    });
    
    document.getElementById('newCommentText').value = '';
    loadComments(currentActivityForComments);
  } catch (error) {
    console.error('Error adding comment:', error);
    alert('Failed to add comment');
  }
});

async function loadComments(activityId) {
  try {
    const response = await apiCall(`/activities/${activityId}/comments`);
    const comments = await response.json();
    
    const activity = myActivities.find(a => a.id === activityId) || allActivities.find(a => a.id === activityId);
    document.getElementById('commentsModalTitle').textContent = `💬 Comments - ${activity ? activity.activity_name : 'Activity'}`;
    
    const commentsList = document.getElementById('commentsList');
    
    if (comments.length === 0) {
      commentsList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No comments yet. Be the first to comment!</p>';
    } else {
      commentsList.innerHTML = comments.map(c => {
        const date = new Date(c.created_at);
        const isOwn = c.user_id === currentUser.id;
        
        return `
          <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 10px; background: ${isOwn ? '#e3f2fd' : 'white'};">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
              <div>
                <strong style="color: var(--primary-color);">${c.username || 'Unknown User'}</strong>
                <span style="color: #999; font-size: 0.85em; margin-left: 10px;">${date.toLocaleString()}</span>
              </div>
              ${isOwn || currentUser.role === 'admin' ? `
                <button class="btn btn-sm" onclick="deleteComment(${c.id})" style="background: #dc3545; color: white; padding: 3px 8px; font-size: 0.8em;">Delete</button>
              ` : ''}
            </div>
            <p style="margin: 0; white-space: pre-wrap;">${c.comment_text}</p>
          </div>
        `;
      }).join('');
    }
  } catch (error) {
    console.error('Error loading comments:', error);
    document.getElementById('commentsList').innerHTML = '<p style="color: red;">Failed to load comments</p>';
  }
}

async function deleteComment(commentId) {
  if (!confirm('Delete this comment?')) {
    return;
  }
  
  try {
    await apiCall(`/comments/${commentId}`, { method: 'DELETE' });
    loadComments(currentActivityForComments);
  } catch (error) {
    console.error('Error deleting comment:', error);
    alert('Failed to delete comment');
  }
}

// ============= FILE ATTACHMENTS SYSTEM =============

// View attachments button
document.getElementById('viewAttachmentsBtn').addEventListener('click', () => {
  if (currentActivityForComments) {
    document.getElementById('activityModal').classList.remove('active');
    loadAttachments(currentActivityForComments);
    document.getElementById('attachmentsModal').classList.add('active');
  }
});

// Close attachments modal
document.getElementById('closeAttachmentsModal').addEventListener('click', () => {
  document.getElementById('attachmentsModal').classList.remove('active');
});

// Upload file
document.getElementById('uploadFileBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  
  if (!file) {
    alert('Please select a file');
    return;
  }
  
  if (file.size > 10 * 1024 * 1024) {
    alert('File size must be less than 10MB');
    return;
  }
  
  if (!currentActivityForComments) {
    alert('No activity selected');
    return;
  }
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_URL}/activities/${currentActivityForComments}/attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Upload failed');
    }
    
    fileInput.value = '';
    loadAttachments(currentActivityForComments);
    alert('File uploaded successfully');
  } catch (error) {
    console.error('Error uploading file:', error);
    alert('Failed to upload file');
  }
});

async function loadAttachments(activityId) {
  try {
    const response = await apiCall(`/activities/${activityId}/attachments`);
    const attachments = await response.json();
    
    const activity = myActivities.find(a => a.id === activityId) || allActivities.find(a => a.id === activityId);
    document.getElementById('attachmentsModalTitle').textContent = `📎 Attachments - ${activity ? activity.activity_name : 'Activity'}`;
    
    const attachmentsList = document.getElementById('attachmentsList');
    
    if (attachments.length === 0) {
      attachmentsList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No attachments yet. Upload your first file!</p>';
    } else {
      attachmentsList.innerHTML = attachments.map(a => {
        const date = new Date(a.uploaded_at);
        const sizeKB = Math.round(a.file_size / 1024);
        const isOwn = a.uploaded_by === currentUser.id;
        
        return `
          <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 10px; background: white; display: flex; justify-content: space-between; align-items: center;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                <span style="font-size: 1.5em;">📄</span>
                <strong>${a.original_name}</strong>
              </div>
              <div style="font-size: 0.85em; color: #666;">
                <span>${sizeKB} KB</span>
                <span style="margin: 0 10px;">•</span>
                <span>Uploaded by ${a.uploaded_by_name || 'Unknown'}</span>
                <span style="margin: 0 10px;">•</span>
                <span>${date.toLocaleString()}</span>
              </div>
            </div>
            <div style="display: flex; gap: 10px;">
              <button class="btn btn-sm" onclick="downloadAttachment(${a.id}, '${a.original_name}')" style="background: #28a745; color: white;">⬇ Download</button>
              ${isOwn || currentUser.role === 'admin' ? `
                <button class="btn btn-sm" onclick="deleteAttachment(${a.id})" style="background: #dc3545; color: white;">Delete</button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (error) {
    console.error('Error loading attachments:', error);
    document.getElementById('attachmentsList').innerHTML = '<p style="color: red;">Failed to load attachments</p>';
  }
}

async function downloadAttachment(attachmentId, filename) {
  try {
    const response = await fetch(`${API_URL}/attachments/${attachmentId}/download`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Download failed');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading file:', error);
    alert('Failed to download file');
  }
}

async function deleteAttachment(attachmentId) {
  if (!confirm('Delete this attachment?')) {
    return;
  }
  
  try {
    await apiCall(`/attachments/${attachmentId}`, { method: 'DELETE' });
    loadAttachments(currentActivityForComments);
  } catch (error) {
    console.error('Error deleting attachment:', error);
    alert('Failed to delete attachment');
  }
}

// ============= INITIALIZATION =============

checkAuth();
setupNavigation();
initTheme();
loadMyActivities();

// ============= NOTIFICATIONS SYSTEM =============

let unreadNotifications = 0;

// Load notifications on page load
loadNotifications();

// Poll for new notifications every 30 seconds
setInterval(loadNotifications, 30000);

async function loadNotifications() {
  try {
    const response = await apiCall('/notifications');
    const notifications = await response.json();
    
    // Count unread
    unreadNotifications = notifications.filter(n => !n.is_read).length;
    
    // Update badge
    const badge = document.getElementById('notificationBadge');
    if (unreadNotifications > 0) {
      badge.textContent = unreadNotifications > 99 ? '99+' : unreadNotifications;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (error) {
    console.error('Error loading notifications:', error);
  }
}

document.getElementById('notificationBtn').addEventListener('click', async () => {
  document.getElementById('notificationsModal').style.display = 'flex';
  
  try {
    const response = await apiCall('/notifications');
    const notifications = await response.json();
    
    const listDiv = document.getElementById('notificationsList');
    if (notifications.length === 0) {
      listDiv.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No notifications</p>';
      return;
    }
    
    listDiv.innerHTML = notifications.map(n => `
      <div style="padding: 15px; border-bottom: 1px solid #eee; background: ${n.is_read ? '#fff' : '#f0f8ff'}; cursor: pointer;" onclick="markNotificationRead(${n.id}, ${n.activity_id})">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div style="flex: 1;">
            <strong style="color: #2c3e50;">${n.title}</strong>
            ${!n.is_read ? '<span style="background: #dc3545; color: white; font-size: 0.7em; padding: 2px 6px; border-radius: 10px; margin-left: 8px;">NEW</span>' : ''}
            <p style="margin: 5px 0; color: #666;">${n.message}</p>
            <small style="color: #999;">${new Date(n.created_at).toLocaleString()}</small>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading notifications:', error);
  }
});

async function markNotificationRead(notifId, activityId) {
  try {
    await apiCall(`/notifications/${notifId}/read`, { method: 'PUT' });
    loadNotifications();
    
    // Navigate to activity if activityId exists
    if (activityId) {
      document.getElementById('notificationsModal').style.display = 'none';
      // Optionally scroll to the activity or open it
    }
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
}

document.getElementById('markAllReadBtn').addEventListener('click', async () => {
  try {
    await apiCall('/notifications/read-all', { method: 'PUT' });
    loadNotifications();
    document.getElementById('notificationsModal').style.display = 'none';
  } catch (error) {
    console.error('Error marking all as read:', error);
  }
});

document.getElementById('clearAllNotificationsBtn').addEventListener('click', async () => {
  if (!confirm('Clear all notifications?')) return;
  
  try {
    await apiCall('/notifications/clear-all', { method: 'DELETE' });
    loadNotifications();
    document.getElementById('notificationsList').innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No notifications</p>';
  } catch (error) {
    console.error('Error clearing notifications:', error);
  }
});

document.getElementById('closeNotificationsModal').addEventListener('click', () => {
  document.getElementById('notificationsModal').style.display = 'none';
});

// ============= TEMPLATES SYSTEM =============

async function loadTemplates() {
  try {
    const response = await apiCall('/templates');
    const templates = await response.json();
    
    const grid = document.getElementById('templatesGrid');
    if (templates.length === 0) {
      grid.innerHTML = '<p style="text-align: center; color: #999; padding: 40px; grid-column: 1 / -1;">No templates yet. Create one from an existing activity!</p>';
      return;
    }
    
    grid.innerHTML = templates.map(t => `
      <div class="card" style="padding: 20px;">
        <h3 style="margin-bottom: 10px; color: #2c3e50;">${t.template_name}</h3>
        <p style="color: #666; font-size: 0.9em; margin-bottom: 15px;">${t.description || 'No description'}</p>
        
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 15px;">
          ${t.priority ? `<span class="badge" style="background: ${getPriorityColor(t.priority)};">${t.priority}</span>` : ''}
          ${t.risk_level ? `<span class="badge" style="background: ${getRiskColor(t.risk_level)};">${t.risk_level} Risk</span>` : ''}
          ${t.department ? `<span class="badge" style="background: #6c757d;">${t.department}</span>` : ''}
        </div>
        
        <small style="color: #999;">Created by ${t.created_by_name} on ${new Date(t.created_at).toLocaleDateString()}</small>
        
        <div style="margin-top: 15px; display: flex; gap: 10px;">
          <button class="btn btn-primary btn-sm" onclick="useTemplate(${t.id})">Use Template</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTemplate(${t.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading templates:', error);
  }
}

function getPriorityColor(priority) {
  const colors = {
    'Critical': '#dc3545',
    'High': '#fd7e14',
    'Medium': '#ffc107',
    'Low': '#28a745'
  };
  return colors[priority] || '#6c757d';
}

function getRiskColor(risk) {
  const colors = {
    'High': '#dc3545',
    'Medium': '#ffc107',
    'Low': '#28a745'
  };
  return colors[risk] || '#6c757d';
}

async function useTemplate(templateId) {
  try {
    const response = await apiCall('/templates');
    const templates = await response.json();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
      alert('Template not found');
      return;
    }
    
    // Open activity modal with template data
    document.getElementById('activityModalTitle').textContent = 'New Activity from Template';
    document.getElementById('activityForm').reset();
    document.getElementById('activityId').value = '';
    
    // Fill in template data
    if (template.description) document.getElementById('activityDescription').value = template.description;
    if (template.gxp_scope) document.getElementById('activityGxp').value = template.gxp_scope;
    if (template.priority) document.getElementById('activityPriority').value = template.priority;
    if (template.risk_level) document.getElementById('activityRisk').value = template.risk_level;
    if (template.department) document.getElementById('activityDepartment').value = template.department;
    if (template.it_type) document.getElementById('activityItType').value = template.it_type;
    if (template.gxp_impact) document.getElementById('activityGxpImpact').value = template.gxp_impact;
    if (template.business_benefit) document.getElementById('activityBusinessBenefit').value = template.business_benefit;
    
    document.getElementById('activityModal').style.display = 'flex';
    document.getElementById('viewCommentsBtn').style.display = 'none';
    document.getElementById('viewAttachmentsBtn').style.display = 'none';
    document.getElementById('viewDependenciesBtn').style.display = 'none';
    
    // Switch to my activities section
    switchSection('myactivities');
  } catch (error) {
    console.error('Error using template:', error);
    alert('Failed to load template');
  }
}

async function deleteTemplate(templateId) {
  if (!confirm('Delete this template?')) return;
  
  try {
    await apiCall(`/templates/${templateId}`, { method: 'DELETE' });
    loadTemplates();
  } catch (error) {
    console.error('Error deleting template:', error);
    alert('Failed to delete template');
  }
}

document.getElementById('createTemplateBtn').addEventListener('click', () => {
  const templateName = prompt('Enter template name:');
  if (!templateName) return;
  
  const description = prompt('Enter template description (optional):');
  
  // Create a basic template
  saveTemplate({
    template_name: templateName,
    description: description || '',
    priority: 'Medium',
    risk_level: 'Medium',
    gxp_scope: 'No'
  });
});

async function saveTemplate(templateData) {
  try {
    await apiCall('/templates', {
      method: 'POST',
      body: JSON.stringify(templateData)
    });
    
    alert('Template created successfully!');
    loadTemplates();
  } catch (error) {
    console.error('Error creating template:', error);
    alert('Failed to create template');
  }
}

// Add "Save as Template" button functionality
document.getElementById('activityForm').addEventListener('submit', async function(e) {
  const activityId = document.getElementById('activityId').value;
  
  // After saving activity, offer to save as template
  if (e.target.dataset.saveAsTemplate === 'true') {
    e.preventDefault();
    
    const formData = {
      template_name: document.getElementById('activityName').value + ' Template',
      description: document.getElementById('activityDescription').value,
      gxp_scope: document.getElementById('activityGxpScope').value,
      priority: document.getElementById('activityPriority').value,
      risk_level: document.getElementById('activityRiskLevel').value,
      department: document.getElementById('activityDepartment').value,
      it_type: document.getElementById('activityItType').value,
      gxp_impact: document.getElementById('activityGxpImpact').value,
      business_benefit: document.getElementById('activityBusinessBenefit').value
    };
    
    await saveTemplate(formData);
    delete e.target.dataset.saveAsTemplate;
  }
});

// ============= PERFORMANCE ANALYTICS =============

async function loadAnalytics() {
  try {
    const response = await apiCall('/activities');
    const activities = await response.json();
    
    // Calculate metrics
    const completed = activities.filter(a => a.status === 'Completed').length;
    const total = activities.length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    // Velocity (activities per sprint)
    const sprintCounts = {};
    activities.forEach(a => {
      sprintCounts[a.sprint] = (sprintCounts[a.sprint] || 0) + 1;
    });
    const avgVelocity = Object.keys(sprintCounts).length > 0 
      ? Math.round(Object.values(sprintCounts).reduce((a, b) => a + b, 0) / Object.keys(sprintCounts).length)
      : 0;
    
    // Average duration to complete
    const completedActivities = activities.filter(a => a.status === 'Completed' && a.activity_date);
    let avgDuration = 0;
    if (completedActivities.length > 0) {
      const durations = completedActivities.map(a => {
        const start = new Date(a.created_at);
        const end = new Date(a.last_edited_at || a.created_at);
        return Math.round((end - start) / (1000 * 60 * 60 * 24));
      });
      avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    }
    
    // On-time delivery
    const onTimeCount = activities.filter(a => {
      if (a.status !== 'Completed') return false;
      const dueDate = new Date(a.activity_date);
      const completedDate = new Date(a.last_edited_at || a.created_at);
      return completedDate <= dueDate;
    }).length;
    const onTimeRate = completed > 0 ? Math.round((onTimeCount / completed) * 100) : 0;
    
    // Update stats
    document.getElementById('analyticsCompletionRate').textContent = completionRate + '%';
    document.getElementById('analyticsVelocity').textContent = avgVelocity;
    document.getElementById('analyticsAvgDuration').textContent = avgDuration + ' days';
    document.getElementById('analyticsOnTime').textContent = onTimeRate + '%';
    
    // Create charts
    createVelocityChart(activities);
    createBurndownChart(activities);
    createDepartmentChart(activities);
    createCycleTimeChart(activities);
  } catch (error) {
    console.error('Error loading analytics:', error);
  }
}

function createVelocityChart(activities) {
  const ctx = document.getElementById('velocityChart');
  if (!ctx) return;
  
  // Group by sprint
  const sprintData = {};
  activities.forEach(a => {
    const sprint = a.sprint;
    sprintData[sprint] = sprintData[sprint] || { total: 0, completed: 0 };
    sprintData[sprint].total++;
    if (a.status === 'Completed') sprintData[sprint].completed++;
  });
  
  const sprints = Object.keys(sprintData).sort();
  
  if (charts.velocityChart) charts.velocityChart.destroy();
  charts.velocityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sprints.map(s => `Sprint ${s}`),
      datasets: [{
        label: 'Completed Activities',
        data: sprints.map(s => sprintData[s].completed),
        borderColor: '#28a745',
        backgroundColor: 'rgba(40, 167, 69, 0.1)',
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true } }
    }
  });
}

function createBurndownChart(activities) {
  const ctx = document.getElementById('burndownChart');
  if (!ctx) return;
  
  // Simple burndown based on status
  const statusCounts = {
    'Planned': 0,
    'In Progress': 0,
    'Completed': 0,
    'On Hold': 0,
    'Cancelled': 0
  };
  
  activities.forEach(a => {
    if (statusCounts[a.status] !== undefined) {
      statusCounts[a.status]++;
    }
  });
  
  if (charts.burndownChart) charts.burndownChart.destroy();
  charts.burndownChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(statusCounts),
      datasets: [{
        label: 'Activities',
        data: Object.values(statusCounts),
        backgroundColor: [
          '#ffc107',
          '#17a2b8',
          '#28a745',
          '#6c757d',
          '#dc3545'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

function createDepartmentChart(activities) {
  const ctx = document.getElementById('departmentChart');
  if (!ctx) return;
  
  const deptData = {};
  activities.forEach(a => {
    const dept = a.department || 'Unknown';
    deptData[dept] = (deptData[dept] || 0) + 1;
  });
  
  if (charts.departmentChart) charts.departmentChart.destroy();
  charts.departmentChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(deptData),
      datasets: [{
        data: Object.values(deptData),
        backgroundColor: ['#007bff', '#28a745', '#ffc107', '#dc3545', '#17a2b8', '#6c757d']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

function createCycleTimeChart(activities) {
  const ctx = document.getElementById('cycleTimeChart');
  if (!ctx) return;
  
  // Calculate cycle times
  const cycleTimes = activities
    .filter(a => a.status === 'Completed' && a.created_at && a.last_edited_at)
    .map(a => {
      const start = new Date(a.created_at);
      const end = new Date(a.last_edited_at);
      return Math.round((end - start) / (1000 * 60 * 60 * 24));
    });
  
  // Group into buckets
  const buckets = { '0-7 days': 0, '8-14 days': 0, '15-30 days': 0, '30+ days': 0 };
  cycleTimes.forEach(days => {
    if (days <= 7) buckets['0-7 days']++;
    else if (days <= 14) buckets['8-14 days']++;
    else if (days <= 30) buckets['15-30 days']++;
    else buckets['30+ days']++;
  });
  
  if (charts.cycleTimeChart) charts.cycleTimeChart.destroy();
  charts.cycleTimeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        label: 'Number of Activities',
        data: Object.values(buckets),
        backgroundColor: '#007bff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

// ============= ACTIVITY DEPENDENCIES =============

// ============= ACTIVITY DEPENDENCIES =============

let currentActivityForDependencies = null;

document.getElementById('viewDependenciesBtn').addEventListener('click', () => {
  const activityId = document.getElementById('activityId').value;
  if (!activityId) {
    alert('Please save the activity first before managing dependencies');
    return;
  }
  
  currentActivityForDependencies = activityId;
  document.getElementById('dependenciesModal').style.display = 'flex';
  loadDependenciesModal(activityId);
});

document.getElementById('closeDependenciesModal').addEventListener('click', () => {
  document.getElementById('dependenciesModal').style.display = 'none';
});

async function loadDependenciesModal(activityId) {
  try {
    // Load all activities for the select dropdown
    const activitiesResponse = await apiCall('/activities');
    const allActivities = await activitiesResponse.json();
    
    const select = document.getElementById('dependencyActivitySelect');
    select.innerHTML = '<option value="">Select activity that blocks this one...</option>' +
      allActivities
        .filter(a => a.id != activityId) // Exclude current activity
        .map(a => `<option value="${a.id}">${a.activity_name} (${a.status})</option>`)
        .join('');
    
    // Load existing dependencies
    const dependencies = await loadDependencies(activityId);
    
    const listDiv = document.getElementById('dependenciesList');
    if (dependencies.length === 0) {
      listDiv.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No dependencies</p>';
      return;
    }
    
    listDiv.innerHTML = dependencies.map(d => `
      <div style="padding: 15px; border: 2px solid #eee; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>${d.depends_on_name}</strong>
          <br>
          <span style="display: inline-block; margin-top: 5px; padding: 3px 8px; background: ${getStatusColor(d.depends_on_status)}; color: white; border-radius: 4px; font-size: 0.85em;">
            ${d.depends_on_status}
          </span>
          ${d.depends_on_status !== 'Completed' ? '<span style="color: #dc3545; margin-left: 10px;">⚠️ Blocking</span>' : '<span style="color: #28a745; margin-left: 10px;">✓ Completed</span>'}
        </div>
        <button class="btn btn-danger btn-sm" onclick="removeDependency(${d.id})">Remove</button>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading dependencies modal:', error);
  }
}

function getStatusColor(status) {
  const colors = {
    'Planned': '#ffc107',
    'In Progress': '#17a2b8',
    'Completed': '#28a745',
    'On Hold': '#6c757d',
    'Cancelled': '#dc3545'
  };
  return colors[status] || '#6c757d';
}

document.getElementById('addDependencyBtn').addEventListener('click', async () => {
  const dependsOnId = document.getElementById('dependencyActivitySelect').value;
  if (!dependsOnId) {
    alert('Please select an activity');
    return;
  }
  
  await addDependency(currentActivityForDependencies, dependsOnId);
  loadDependenciesModal(currentActivityForDependencies);
});

async function removeDependency(dependencyId) {
  if (!confirm('Remove this dependency?')) return;
  
  try {
    await apiCall(`/dependencies/${dependencyId}`, { method: 'DELETE' });
    loadDependenciesModal(currentActivityForDependencies);
  } catch (error) {
    console.error('Error removing dependency:', error);
    alert('Failed to remove dependency');
  }
}

async function loadDependencies(activityId) {
  try {
    const response = await apiCall(`/activities/${activityId}/dependencies`);
    const dependencies = await response.json();
    
    // Display dependencies in the activity modal or a separate section
    console.log('Dependencies:', dependencies);
    return dependencies;
  } catch (error) {
    console.error('Error loading dependencies:', error);
    return [];
  }
}

async function addDependency(activityId, dependsOnId) {
  try {
    await apiCall(`/activities/${activityId}/dependencies`, {
      method: 'POST',
      body: JSON.stringify({ depends_on_activity_id: dependsOnId, dependency_type: 'blocks' })
    });
    
    alert('Dependency added successfully!');
  } catch (error) {
    console.error('Error adding dependency:', error);
    alert('Failed to add dependency');
  }
}
