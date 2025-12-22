/**
 * Popup UI Logic
 * Handles bookmark form and communication with background worker
 */

let currentTab = null;
let tags = [];

/**
 * Show status message
 * @param {string} message - Status message
 * @param {string} type - 'success', 'error', or 'loading'
 */
function showStatus(message, type = 'loading', isHTML = false) {
  const statusEl = document.getElementById('status');
  if (isHTML) {
    statusEl.innerHTML = message;
  } else {
    statusEl.textContent = message;
  }
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  
  // Auto-hide success messages after 3 seconds
  if (type === 'success') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
  
  // Auto-hide duplicate messages after 5 seconds
  if (type === 'duplicate') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 5000);
  }
}

/**
 * Add a tag
 * @param {string} tagText - Tag text to add
 */
function addTag(tagText) {
  const trimmed = tagText.trim().toLowerCase();
  if (trimmed && !tags.includes(trimmed)) {
    tags.push(trimmed);
    renderTags();
  }
}

/**
 * Remove a tag
 * @param {string} tagText - Tag text to remove
 */
function removeTag(tagText) {
  tags = tags.filter(t => t !== tagText);
  renderTags();
}

/**
 * Render tags in the UI
 */
function renderTags() {
  const wrapper = document.getElementById('tagsWrapper');
  const input = document.getElementById('tagsInput');
  
  // Clear existing tags (but keep input)
  const existingTags = wrapper.querySelectorAll('.tag');
  existingTags.forEach(tag => tag.remove());
  
  // Add tag elements
  tags.forEach(tag => {
    const tagEl = document.createElement('span');
    tagEl.className = 'tag';
    tagEl.innerHTML = `
      ${tag}
      <button type="button" class="tag-remove" data-tag="${tag}">×</button>
    `;
    wrapper.insertBefore(tagEl, input);
    
    // Add remove handler
    tagEl.querySelector('.tag-remove').addEventListener('click', (e) => {
      e.preventDefault();
      removeTag(tag);
    });
  });
}

/**
 * Update health indicator
 * @param {boolean} healthy - Is native host healthy?
 * @param {string} message - Status message
 */
function updateHealthIndicator(healthy, message) {
  const indicator = document.getElementById('healthIndicator');
  const text = document.getElementById('healthText');
  
  indicator.className = `health-indicator ${healthy ? 'healthy' : 'unhealthy'}`;
  text.textContent = message;
}

/**
 * Check native host health
 */
async function checkHealth() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkHealth' });
    
    if (response.success) {
      updateHealthIndicator(true, 'Connected');
    } else {
      updateHealthIndicator(false, 'Connection failed');
      console.error('Health check failed:', response.error);
    }
  } catch (error) {
    updateHealthIndicator(false, 'Not connected');
    console.error('Health check error:', error);
  }
}

/**
 * Detect provider from URL
 * @param {string} url - Page URL
 * @returns {Promise<string>} Provider name
 */
async function detectProvider(url) {
  const response = await chrome.runtime.sendMessage({ 
    action: 'detectProvider', 
    url: url 
  });
  return response.provider;
}

/**
 * Detect type from URL
 * @param {string} url - Page URL
 * @returns {Promise<string>} 'article' or 'video'
 */
async function detectType(url) {
  const response = await chrome.runtime.sendMessage({ 
    action: 'detectType', 
    url: url 
  });
  return response.type;
}

/**
 * Initialize popup with current tab data
 */
async function initializePopup() {
  // Check health first
  checkHealth();
  
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  
  // Populate form
  document.getElementById('title').value = tab.title || '';
  document.getElementById('url').value = tab.url || '';
  
  // Detect provider and type
  const provider = await detectProvider(tab.url);
  const type = await detectType(tab.url);
  
  document.getElementById('providerBadge').textContent = provider;
  
  // Set type radio button
  if (type === 'video') {
    document.getElementById('typeVideo').checked = true;
  } else {
    document.getElementById('typeArticle').checked = true;
  }
}

/**
 * Handle tags input
 */
document.getElementById('tagsInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const value = e.target.value.trim();
    if (value) {
      // Support comma-separated tags
      value.split(',').forEach(tag => {
        if (tag.trim()) {
          addTag(tag.trim());
        }
      });
      e.target.value = '';
    }
  } else if (e.key === 'Backspace' && e.target.value === '' && tags.length > 0) {
    // Remove last tag on backspace when input is empty
    removeTag(tags[tags.length - 1]);
  }
});

/**
 * Check if URL already exists
 * @param {string} url - URL to check
 * @returns {Promise<Object|null>} Existing issue if found
 */
async function checkUrlExists(url) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'checkUrlExists',
      url: url
    });
    return response.exists ? response.issue : null;
  } catch (error) {
    console.error('Error checking URL:', error);
    return null;
  }
}

/**
 * Handle form submission
 */
document.getElementById('bookmarkForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const title = document.getElementById('title').value.trim();
  const url = document.getElementById('url').value.trim();
  const type = document.querySelector('input[name="type"]:checked').value;
  const notes = document.getElementById('notes').value.trim();
  
  // Add any remaining text in tags input
  const tagsInputValue = document.getElementById('tagsInput').value.trim();
  if (tagsInputValue) {
    tagsInputValue.split(',').forEach(tag => {
      if (tag.trim()) {
        addTag(tag.trim());
        document.getElementById('tagsInput').value = '';
      }
    });
  }
  
  if (!title || !url) {
    showStatus('Please fill in all required fields', 'error');
    return;
  }
  
  // Disable button and show loading
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  showStatus('Checking for duplicates...', 'loading');
  
  try {
    // Check if URL already exists
    const existingIssue = await checkUrlExists(url);
    
    if (existingIssue) {
      const issueLink = existingIssue.html_url || '#';
      const message = `⚠ This URL already exists in <a href="${issueLink}" target="_blank" style="color: #92400e; text-decoration: underline; font-weight: 600; cursor: pointer;">issue #${existingIssue.number}</a>`;
      showStatus(message, 'duplicate', true);
      saveBtn.disabled = false;
      return;
    }
    
    // Get provider
    const provider = await detectProvider(url);
    
    const bookmark = {
      title: title,
      url: url,
      type: type,
      provider: provider,
      notes: notes,
      tags: tags
    };
    
    showStatus('Saving bookmark...', 'loading');
    
    // Send to background worker
    const response = await chrome.runtime.sendMessage({
      action: 'createBookmark',
      data: bookmark
    });
    
    if (response.success) {
      showStatus('✓ Bookmark saved successfully!', 'success');
      
      // Clear form fields
      document.getElementById('notes').value = '';
      tags = [];
      renderTags();
      
      // Close popup after 1.5 seconds
      setTimeout(() => {
        window.close();
      }, 1500);
    } else {
      showStatus(`✗ Error: ${response.error}`, 'error');
      saveBtn.disabled = false;
    }
  } catch (error) {
    showStatus(`✗ Error: ${error.message}`, 'error');
    saveBtn.disabled = false;
  }
});

/**
 * Handle keyboard shortcuts
 */
document.addEventListener('keydown', (e) => {
  // Escape: Close popup
  if (e.key === 'Escape') {
    window.close();
    return;
  }
  
  // Cmd/Ctrl + Enter or Cmd/Ctrl + S: Submit form (works everywhere including textarea/tags)
  if ((e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.key === 's')) {
    e.preventDefault();
    const form = document.getElementById('bookmarkForm');
    const saveBtn = document.getElementById('saveBtn');
    
    // Submit form even when in textarea or tags input
    if (!saveBtn.disabled && form.checkValidity()) {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
    return;
  }
  
  // Enter: Submit form (when not in textarea or tags input)
  if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    const activeElement = document.activeElement;
    
    // Allow Enter in textarea (for new lines)
    if (activeElement.tagName === 'TEXTAREA') {
      return;
    }
    
    // Allow Enter in tags input (for adding tags)
    if (activeElement.id === 'tagsInput') {
      return;
    }
    
    // Submit form if Enter is pressed elsewhere
    e.preventDefault();
    const form = document.getElementById('bookmarkForm');
    const saveBtn = document.getElementById('saveBtn');
    if (!saveBtn.disabled && form.checkValidity()) {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  }
});

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', initializePopup);
