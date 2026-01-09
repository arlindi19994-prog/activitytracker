// ============= FILE ATTACHMENTS SYSTEM =============
// Add this code to the end of dashboard.js (before the initialization section)

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
