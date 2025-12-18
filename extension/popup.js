/**
 * Popup UI Logic
 * Handles bookmark form and communication with background worker
 */

let currentTab = null;

/**
 * Show status message
 * @param {string} message - Status message
 * @param {string} type - 'success', 'error', or 'loading'
 */
function showStatus(message, type = 'loading') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  
  // Auto-hide success messages after 3 seconds
  if (type === 'success') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
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
 * Handle form submission
 */
document.getElementById('bookmarkForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const title = document.getElementById('title').value.trim();
  const url = document.getElementById('url').value.trim();
  const type = document.querySelector('input[name="type"]:checked').value;
  const notes = document.getElementById('notes').value.trim();
  
  if (!title || !url) {
    showStatus('Please fill in all required fields', 'error');
    return;
  }
  
  // Get provider
  const provider = await detectProvider(url);
  
  const bookmark = {
    title: title,
    url: url,
    type: type,
    provider: provider,
    notes: notes
  };
  
  // Disable button and show loading
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  showStatus('Saving bookmark...', 'loading');
  
  try {
    // Send to background worker
    const response = await chrome.runtime.sendMessage({
      action: 'createBookmark',
      data: bookmark
    });
    
    if (response.success) {
      showStatus('✓ Bookmark saved successfully!', 'success');
      
      // Clear notes field
      document.getElementById('notes').value = '';
      
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

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', initializePopup);
