/**
 * Options Page Logic
 * Handles settings and PAT management
 */

/**
 * Show status message
 * @param {string} elementId - Status element ID
 * @param {string} message - Status message
 * @param {string} type - 'success', 'error', or 'info'
 */
function showStatus(elementId, message, type = 'info') {
  const statusEl = document.getElementById(elementId);
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 5000);
}

/**
 * Update health indicator
 * @param {string} status - 'healthy', 'unhealthy', or 'checking'
 * @param {string} message - Status message
 */
function updateHealthIndicator(status, message) {
  const dot = document.getElementById('healthDot');
  const text = document.getElementById('healthText');
  
  dot.className = `health-dot ${status}`;
  text.textContent = message;
}

/**
 * Check native host health
 */
async function checkHealth() {
  updateHealthIndicator('checking', 'Checking connection...');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkHealth' });
    
    if (response && response.success) {
      const status = response.status || {};
      const backend = status.keyring_backend || 'Unknown';
      updateHealthIndicator('healthy', `Connected (${backend})`);
      return true;
    } else {
      const errorMsg = (response && response.error) || 'Connection failed';
      updateHealthIndicator('unhealthy', `Connection failed: ${errorMsg}`);
      return false;
    }
  } catch (error) {
    updateHealthIndicator('unhealthy', `Not connected: ${error.message}`);
    return false;
  }
}

/**
 * Load saved settings
 */
async function loadSettings() {
  chrome.storage.local.get(['githubOwner', 'githubRepo', 'defaultTags'], (result) => {
    if (result.githubOwner) {
      document.getElementById('githubOwner').value = result.githubOwner;
    }
    if (result.githubRepo) {
      document.getElementById('githubRepo').value = result.githubRepo;
    }
    if (result.defaultTags) {
      document.getElementById('defaultTags').value = Array.isArray(result.defaultTags) 
        ? result.defaultTags.join(', ') 
        : result.defaultTags;
    }
  });
}

/**
 * Save repository settings
 */
function saveRepoSettings() {
  const owner = document.getElementById('githubOwner').value.trim();
  const repo = document.getElementById('githubRepo').value.trim();
  
  if (!owner || !repo) {
    showStatus('repoStatus', 'Please fill in both fields', 'error');
    return;
  }
  
  chrome.storage.local.set({ 
    githubOwner: owner, 
    githubRepo: repo 
  }, () => {
    showStatus('repoStatus', '✓ Repository settings saved', 'success');
  });
}

/**
 * Store PAT via native host
 */
async function storePAT() {
  const pat = document.getElementById('pat').value.trim();
  
  if (!pat) {
    showStatus('patStatus', 'Please enter a PAT', 'error');
    return;
  }
  
  // Basic validation
  if (!pat.startsWith('ghp_') && !pat.startsWith('github_pat_')) {
    const confirm = window.confirm(
      'The PAT format looks unusual (should start with "ghp_" or "github_pat_"). Continue anyway?'
    );
    if (!confirm) return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'storePAT',
      pat: pat
    });
    
    if (response.success) {
      showStatus('patStatus', '✓ PAT stored securely in keychain', 'success');
      // Clear input field for security
      document.getElementById('pat').value = '';
      // Re-check health
      checkHealth();
    } else {
      showStatus('patStatus', `✗ Error: ${response.error}`, 'error');
    }
  } catch (error) {
    showStatus('patStatus', `✗ Error: ${error.message}`, 'error');
  }
}

/**
 * Test PAT by making a GitHub API call
 */
async function testPAT() {
  const owner = document.getElementById('githubOwner').value.trim();
  const repo = document.getElementById('githubRepo').value.trim();
  
  if (!owner || !repo) {
    showStatus('patStatus', 'Please save repository settings first', 'error');
    return;
  }
  
  showStatus('patStatus', 'Testing connection to GitHub...', 'info');
  
  try {
    // This will trigger the background worker to get PAT and test it
    const testBookmark = {
      title: '[TEST] Connection Test',
      url: 'https://example.com',
      type: 'article',
      provider: 'Test',
      notes: 'This is a test bookmark to verify the connection. You can delete this issue.'
    };
    
    const response = await chrome.runtime.sendMessage({
      action: 'createBookmark',
      data: testBookmark
    });
    
    if (response.success) {
      const issueUrl = response.issue.html_url;
      showStatus(
        'patStatus', 
        `✓ Connection successful! Test issue created: ${issueUrl}`, 
        'success'
      );
    } else {
      showStatus('patStatus', `✗ Connection failed: ${response.error}`, 'error');
    }
  } catch (error) {
    showStatus('patStatus', `✗ Error: ${error.message}`, 'error');
  }
}

/**
 * Remove PAT from native host
 */
async function removePAT() {
  const confirm = window.confirm(
    'Are you sure you want to remove your PAT? You will need to re-enter it to create bookmarks.'
  );
  
  if (!confirm) return;
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'removePAT'
    });
    
    if (response.success) {
      showStatus('patStatus', '✓ PAT removed from keychain', 'success');
      // Re-check health
      checkHealth();
    } else {
      showStatus('patStatus', `✗ Error: ${response.error}`, 'error');
    }
  } catch (error) {
    showStatus('patStatus', `✗ Error: ${error.message}`, 'error');
  }
}

/**
 * Save Quick Save settings
 */
function saveQuickSaveSettings() {
  const defaultTagsInput = document.getElementById('defaultTags').value.trim();
  const defaultTags = defaultTagsInput 
    ? defaultTagsInput.split(',').map(tag => tag.trim()).filter(tag => tag)
    : [];
  
  chrome.storage.local.set({ defaultTags: defaultTags }, () => {
    showStatus('quickSaveStatus', '✓ Default tags saved', 'success');
  });
}

// Initialize on load
function initialize() {
  // Load saved settings
  loadSettings();
  
  // Check health
  checkHealth();
  
  // Setup event listeners
  document.getElementById('saveRepoBtn').addEventListener('click', saveRepoSettings);
  document.getElementById('storePATBtn').addEventListener('click', storePAT);
  document.getElementById('testPATBtn').addEventListener('click', testPAT);
  document.getElementById('removePATBtn').addEventListener('click', removePAT);
  document.getElementById('saveQuickSaveBtn').addEventListener('click', saveQuickSaveSettings);
  
  // Allow Enter key to save PAT
  document.getElementById('pat').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      storePAT();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  // DOM already loaded
  initialize();
}
