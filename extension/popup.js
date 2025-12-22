/**
 * Popup UI Logic
 * Handles bookmark form and communication with background worker
 */

let currentTab = null;
let tags = [];
let lastFailedBookmark = null; // Store last failed bookmark for retry

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
  // Reset form state
  const form = document.getElementById('bookmarkForm');
  delete form.dataset.issueNumber;
  document.getElementById('saveBtn').textContent = 'Mook It';
  tags = [];
  renderTags();
  
  // Check health first
  checkHealth();
  
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  
  // Populate form
  document.getElementById('title').value = tab.title || '';
  document.getElementById('url').value = tab.url || '';
  document.getElementById('notes').value = '';
  
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
 * Undo last save (delete the issue)
 * @param {number} issueNumber - Issue number to delete
 */
async function undoLastSave(issueNumber) {
  showStatus('Deleting bookmark...', 'loading');
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteBookmark',
      issueNumber: issueNumber
    });
    
    if (response.success) {
      showStatus('✓ Bookmark deleted', 'success');
      setTimeout(() => {
        window.close();
      }, 1500);
    } else {
      showStatus(`✗ Error: ${response.error}`, 'error');
    }
  } catch (error) {
    showStatus(`✗ Error: ${error.message}`, 'error');
  }
}

/**
 * Load existing bookmark for editing
 * @param {number} issueNumber - Issue number to edit
 */
async function loadBookmarkForEdit(issueNumber) {
  try {
    showStatus('Loading bookmark...', 'loading');
    
    const response = await chrome.runtime.sendMessage({
      action: 'getBookmark',
      issueNumber: issueNumber
    });
    
    if (response.success) {
      const bookmark = response.bookmark;
      
      // Populate form with existing data
      document.getElementById('title').value = bookmark.title;
      document.getElementById('url').value = bookmark.url;
      document.getElementById('notes').value = bookmark.notes;
      
      // Set type
      if (bookmark.type === 'video') {
        document.getElementById('typeVideo').checked = true;
      } else {
        document.getElementById('typeArticle').checked = true;
      }
      
      // Set tags
      tags = bookmark.tags || [];
      renderTags();
      
      // Update provider badge
      document.getElementById('providerBadge').textContent = bookmark.provider;
      
      // Store issue number for update
      document.getElementById('bookmarkForm').dataset.issueNumber = issueNumber;
      
      // Change button text
      document.getElementById('saveBtn').textContent = 'Update Bookmark';
      
      showStatus('Bookmark loaded. Make your changes and click Update.', 'success');
      
      // Focus on title field
      document.getElementById('title').focus();
    } else {
      showStatus(`Error: ${response.error}`, 'error');
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
}

/**
 * Replace existing bookmark with new data
 * @param {number} issueNumber - Issue number to replace
 * @param {string} url - URL
 * @param {string} title - Title
 * @param {string} type - Type
 * @param {string} notes - Notes
 * @param {Array} tags - Tags
 */
async function replaceExistingBookmark(issueNumber, url, title, type, notes, tags) {
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  showStatus('Replacing bookmark...', 'loading');
  
  try {
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
    
    // Update the existing issue
    const response = await chrome.runtime.sendMessage({
      action: 'updateBookmark',
      issueNumber: issueNumber,
      data: bookmark
    });
    
    if (response.success) {
      const undoMessage = `✓ Bookmark replaced! <a href="#" id="undoLink" style="color: #166534; text-decoration: underline; font-weight: 600; margin-left: 8px; cursor: pointer;">Undo</a>`;
      showStatus(undoMessage, 'success', true);
      
      // Setup undo handler (close the issue)
      document.getElementById('undoLink').addEventListener('click', async (e) => {
        e.preventDefault();
        await undoLastSave(issueNumber);
      });
      
      // Clear form fields
      document.getElementById('notes').value = '';
      tags = [];
      renderTags();
      
      // Close popup after 5 seconds
      setTimeout(() => {
        window.close();
      }, 5000);
    } else {
      const errorMessage = `✗ Error: ${response.error} <a href="#" id="retryLink" style="color: #991b1b; text-decoration: underline; font-weight: 600; margin-left: 8px; cursor: pointer;">Retry</a>`;
      showStatus(errorMessage, 'error', true);
      
      document.getElementById('retryLink').addEventListener('click', async (e) => {
        e.preventDefault();
        await replaceExistingBookmark(issueNumber, url, title, type, notes, tags);
      });
      
      saveBtn.disabled = false;
    }
  } catch (error) {
    const errorMessage = `✗ Error: ${error.message} <a href="#" id="retryLink" style="color: #991b1b; text-decoration: underline; font-weight: 600; margin-left: 8px; cursor: pointer;">Retry</a>`;
    showStatus(errorMessage, 'error', true);
    
    document.getElementById('retryLink').addEventListener('click', async (e) => {
      e.preventDefault();
      await replaceExistingBookmark(issueNumber, url, title, type, notes, tags);
    });
    
    saveBtn.disabled = false;
  }
}

/**
 * Retry last failed save
 */
async function retryLastSave() {
  if (!lastFailedBookmark) {
    showStatus('No previous save to retry', 'error');
    return;
  }
  
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  showStatus('Retrying save...', 'loading');
  
  try {
    // Check for duplicates again
    const existingIssue = await checkUrlExists(lastFailedBookmark.url);
    
    if (existingIssue) {
      const issueLink = existingIssue.html_url || '#';
      const message = `⚠ This URL already exists in <a href="${issueLink}" target="_blank" style="color: #92400e; text-decoration: underline; font-weight: 600; cursor: pointer;">issue #${existingIssue.number}</a>`;
      showStatus(message, 'duplicate', true);
      saveBtn.disabled = false;
      lastFailedBookmark = null;
      return;
    }
    
    // Retry saving
    const response = await chrome.runtime.sendMessage({
      action: 'createBookmark',
      data: lastFailedBookmark
    });
    
    if (response.success) {
      const issueNumber = response.issue.number;
      const undoMessage = `✓ Bookmark saved! <a href="#" id="undoLink" style="color: #166534; text-decoration: underline; font-weight: 600; margin-left: 8px; cursor: pointer;">Undo</a>`;
      showStatus(undoMessage, 'success', true);
      
      // Setup undo handler
      document.getElementById('undoLink').addEventListener('click', async (e) => {
        e.preventDefault();
        await undoLastSave(issueNumber);
      });
      
      // Clear form fields
      document.getElementById('notes').value = '';
      tags = [];
      renderTags();
      lastFailedBookmark = null;
      
      // Close popup after 5 seconds
      setTimeout(() => {
        window.close();
      }, 5000);
    } else {
      // Store failed bookmark again for another retry
      const errorMessage = `✗ Error: ${response.error} <a href="#" id="retryLink" style="color: #991b1b; text-decoration: underline; font-weight: 600; margin-left: 8px; cursor: pointer;">Retry</a>`;
      showStatus(errorMessage, 'error', true);
      
      document.getElementById('retryLink').addEventListener('click', async (e) => {
        e.preventDefault();
        await retryLastSave();
      });
      
      saveBtn.disabled = false;
    }
  } catch (error) {
    const errorMessage = `✗ Error: ${error.message} <a href="#" id="retryLink" style="color: #991b1b; text-decoration: underline; font-weight: 600; margin-left: 8px; cursor: pointer;">Retry</a>`;
    showStatus(errorMessage, 'error', true);
    
    document.getElementById('retryLink').addEventListener('click', async (e) => {
      e.preventDefault();
      await retryLastSave();
    });
    
    saveBtn.disabled = false;
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
  const form = document.getElementById('bookmarkForm');
  const issueNumber = form.dataset.issueNumber;
  
  saveBtn.disabled = true;
  
  // Check if we're editing an existing bookmark
  if (issueNumber) {
    showStatus('Updating bookmark...', 'loading');
    
    try {
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
      
      // Update existing bookmark
      const response = await chrome.runtime.sendMessage({
        action: 'updateBookmark',
        issueNumber: parseInt(issueNumber),
        data: bookmark
      });
      
      if (response.success) {
        const undoMessage = `✓ Bookmark updated! <a href="#" id="undoLink" style="color: #166534; text-decoration: underline; font-weight: 600; margin-left: 8px; cursor: pointer;">Undo</a>`;
        showStatus(undoMessage, 'success', true);
        
        // Setup undo handler
        document.getElementById('undoLink').addEventListener('click', async (e) => {
          e.preventDefault();
          await undoLastSave(parseInt(issueNumber));
        });
        
        // Clear edit mode
        delete form.dataset.issueNumber;
        saveBtn.textContent = 'Mook It';
        
        // Clear form fields
        document.getElementById('notes').value = '';
        tags = [];
        renderTags();
        
        // Close popup after 5 seconds
        setTimeout(() => {
          window.close();
        }, 5000);
      } else {
        showStatus(`✗ Error: ${response.error}`, 'error');
        saveBtn.disabled = false;
      }
    } catch (error) {
      showStatus(`✗ Error: ${error.message}`, 'error');
      saveBtn.disabled = false;
    }
    return;
  }
  
  // New bookmark - check for duplicates
  showStatus('Checking for duplicates...', 'loading');
  
  try {
    // Check if URL already exists
    const existingIssue = await checkUrlExists(url);
    
    if (existingIssue) {
      const issueLink = existingIssue.html_url || '#';
      const message = `⚠ This URL already exists in <a href="${issueLink}" target="_blank" style="color: #92400e; text-decoration: underline; font-weight: 600; cursor: pointer;">issue #${existingIssue.number}</a>. <a href="#" id="editLink" style="color: #92400e; text-decoration: underline; font-weight: 600; margin-left: 8px; cursor: pointer;">Edit</a> or <a href="#" id="replaceLink" style="color: #92400e; text-decoration: underline; font-weight: 600; margin-left: 8px; cursor: pointer;">Replace</a>?`;
      showStatus(message, 'duplicate', true);
      
      // Setup edit handler
      document.getElementById('editLink').addEventListener('click', async (e) => {
        e.preventDefault();
        await loadBookmarkForEdit(existingIssue.number);
      });
      
      // Setup replace handler
      document.getElementById('replaceLink').addEventListener('click', async (e) => {
        e.preventDefault();
        await replaceExistingBookmark(existingIssue.number, url, title, type, notes, tags);
      });
      
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
      const issueNumber = response.issue.number;
      const issueUrl = response.issue.html_url;
      
      // Show success with undo option
      const undoMessage = `✓ Bookmark saved! <a href="#" id="undoLink" style="color: #166534; text-decoration: underline; font-weight: 600; margin-left: 8px; cursor: pointer;">Undo</a>`;
      showStatus(undoMessage, 'success', true);
      
      // Setup undo handler
      document.getElementById('undoLink').addEventListener('click', async (e) => {
        e.preventDefault();
        await undoLastSave(issueNumber);
      });
      
      // Clear form fields
      document.getElementById('notes').value = '';
      tags = [];
      renderTags();
      
      // Close popup after 3 seconds (longer to allow undo)
      setTimeout(() => {
        window.close();
      }, 5000);
    } else {
      // Store failed bookmark for retry
      lastFailedBookmark = bookmark;
      const errorMessage = `✗ Error: ${response.error} <a href="#" id="retryLink" style="color: #991b1b; text-decoration: underline; font-weight: 600; margin-left: 8px; cursor: pointer;">Retry</a>`;
      showStatus(errorMessage, 'error', true);
      
      // Setup retry handler
      document.getElementById('retryLink').addEventListener('click', async (e) => {
        e.preventDefault();
        await retryLastSave();
      });
      
      saveBtn.disabled = false;
    }
  } catch (error) {
    // Store failed bookmark for retry
    lastFailedBookmark = {
      title: title,
      url: url,
      type: type,
      provider: provider,
      notes: notes,
      tags: tags
    };
    
    const errorMessage = `✗ Error: ${error.message} <a href="#" id="retryLink" style="color: #991b1b; text-decoration: underline; font-weight: 600; margin-left: 8px; cursor: pointer;">Retry</a>`;
    showStatus(errorMessage, 'error', true);
    
    // Setup retry handler
    document.getElementById('retryLink').addEventListener('click', async (e) => {
      e.preventDefault();
      await retryLastSave();
    });
    
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

/**
 * Save all tabs in current window
 */
async function saveAllTabs() {
  const saveAllBtn = document.getElementById('saveAllTabsBtn');
  saveAllBtn.disabled = true;
  saveAllBtn.textContent = 'Saving...';
  
  try {
    // Get all tabs in current window
    const tabs = await chrome.tabs.query({ currentWindow: true });
    
    if (tabs.length === 0) {
      showStatus('No tabs to save', 'error');
      saveAllBtn.disabled = false;
      saveAllBtn.textContent = 'Mook All Tabs';
      return;
    }
    
    // Get default tags
    const result = await chrome.storage.local.get(['defaultTags']);
    const defaultTags = result.defaultTags || [];
    
    let saved = 0;
    let skipped = 0;
    let errors = 0;
    
    showStatus(`Saving ${tabs.length} tabs...`, 'loading');
    
    // Save each tab
    for (const tab of tabs) {
      try {
        // Skip chrome:// and extension:// pages
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
          skipped++;
          continue;
        }
        
        // Check for duplicates
        const existingIssue = await checkUrlExists(tab.url);
        if (existingIssue) {
          skipped++;
          continue;
        }
        
        // Detect provider and type
        const provider = await detectProvider(tab.url);
        const type = await detectType(tab.url);
        
        const bookmark = {
          title: tab.title || tab.url,
          url: tab.url,
          type: type,
          provider: provider,
          notes: '',
          tags: defaultTags
        };
        
        // Save bookmark
        const response = await chrome.runtime.sendMessage({
          action: 'createBookmark',
          data: bookmark
        });
        
        if (response.success) {
          saved++;
          // Add to cache
          chrome.runtime.sendMessage({
            action: 'cacheBookmark',
            url: tab.url,
            issue: response.issue
          });
        } else {
          errors++;
        }
      } catch (error) {
        console.error('Error saving tab:', tab.url, error);
        errors++;
      }
    }
    
    // Show results
    const message = `Saved: ${saved}, Skipped: ${skipped}, Errors: ${errors}`;
    showStatus(message, saved > 0 ? 'success' : 'error');
    
    saveAllBtn.textContent = 'Mook All Tabs';
    saveAllBtn.disabled = false;
    
    // Close popup after 3 seconds if successful
    if (saved > 0) {
      setTimeout(() => {
        window.close();
      }, 3000);
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
    saveAllBtn.disabled = false;
    saveAllBtn.textContent = 'Mook All Tabs';
  }
}

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', () => {
  initializePopup();
  
  // Setup save all tabs button
  document.getElementById('saveAllTabsBtn').addEventListener('click', saveAllTabs);
});
