/**
 * Background Service Worker for Bookmarks Extension
 * Handles GitHub API calls and native messaging
 */

const NATIVE_HOST_NAME = 'com.bookmarks.native_host';

// Cache for recently created bookmarks (to detect duplicates immediately)
// Key: URL, Value: { issueNumber, issueUrl, timestamp }
const recentBookmarksCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Add bookmark to cache
 */
function addToCache(url, issue) {
  recentBookmarksCache.set(url, {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    timestamp: Date.now()
  });
  
  // Clean up old entries
  setTimeout(() => {
    recentBookmarksCache.delete(url);
  }, CACHE_DURATION);
}

/**
 * Check cache for URL
 */
function checkCache(url) {
  const normalizedUrl = url.trim();
  const normalizedUrlNoTrailing = normalizedUrl.replace(/\/$/, '');
  
  // Check exact match
  if (recentBookmarksCache.has(normalizedUrl)) {
    const cached = recentBookmarksCache.get(normalizedUrl);
    if (Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached;
    }
    recentBookmarksCache.delete(normalizedUrl);
  }
  
  // Check without trailing slash
  if (recentBookmarksCache.has(normalizedUrlNoTrailing)) {
    const cached = recentBookmarksCache.get(normalizedUrlNoTrailing);
    if (Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached;
    }
    recentBookmarksCache.delete(normalizedUrlNoTrailing);
  }
  
  // Check all cache entries for URL match
  for (const [cachedUrl, cached] of recentBookmarksCache.entries()) {
    const cachedNoTrailing = cachedUrl.replace(/\/$/, '');
    if (cachedUrl === normalizedUrl || 
        cachedUrl === normalizedUrlNoTrailing ||
        cachedNoTrailing === normalizedUrl ||
        cachedNoTrailing === normalizedUrlNoTrailing) {
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached;
      }
    }
  }
  
  return null;
}

/**
 * Get PAT from native host
 * @returns {Promise<string>} Personal Access Token
 */
async function getPAT() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      { cmd: 'get' },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.status === 'error') {
          reject(new Error(response.error));
        } else {
          resolve(response.pat);
        }
      }
    );
  });
}

/**
 * Check native host health
 * @returns {Promise<Object>} Health status
 */
async function checkHealth() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      { cmd: 'health' },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      }
    );
  });
}

/**
 * Store PAT in native host
 * @param {string} pat - Personal Access Token
 * @returns {Promise<Object>} Storage result
 */
async function storePAT(pat) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      { cmd: 'set', pat: pat },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.status === 'error') {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      }
    );
  });
}

/**
 * Remove PAT from native host
 * @returns {Promise<Object>} Removal result
 */
async function removePAT() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      { cmd: 'remove' },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.status === 'error') {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      }
    );
  });
}

/**
 * Get GitHub configuration from storage
 * @returns {Promise<Object>} GitHub owner and repo
 */
async function getGitHubConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['githubOwner', 'githubRepo'], (result) => {
      resolve({
        owner: result.githubOwner || '',
        repo: result.githubRepo || ''
      });
    });
  });
}

/**
 * Check if URL already exists in GitHub issues
 * @param {string} url - URL to check
 * @returns {Promise<Object|null>} Existing issue if found, null otherwise
 */
async function checkUrlExists(url) {
  try {
    // First check cache for recently created bookmarks
    const cached = checkCache(url);
    if (cached) {
      console.log('checkUrlExists: Found in cache! Issue #' + cached.issueNumber);
      // Return a mock issue object that matches the API response format
      return {
        number: cached.issueNumber,
        html_url: cached.issueUrl,
        body: `---\nurl: "${url}"\n---`
      };
    }
    
    const pat = await getPAT();
    const config = await getGitHubConfig();
    
    if (!config.owner || !config.repo) {
      console.log('checkUrlExists: No config, returning null');
      return null;
    }
    
    console.log('checkUrlExists: Checking URL:', url);
    
    // Normalize the input URL for comparison
    const normalizedUrl = url.trim();
    const normalizedUrlNoTrailing = normalizedUrl.replace(/\/$/, '');
    const normalizedUrlWithTrailing = normalizedUrlNoTrailing + '/';
    
    // Search through issues to find matching URL
    // Check multiple pages, prioritizing most recent
    let page = 1;
    const perPage = 100;
    const maxPages = 10; // Increased to check more issues
    
    // Also check recently created issues (last 24 hours) more thoroughly
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    while (page <= maxPages) {
      const response = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/issues?state=all&per_page=${perPage}&page=${page}&sort=created&direction=desc`,
        {
          headers: {
            'Authorization': `token ${pat}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );
      
      if (!response.ok) {
        console.log('checkUrlExists: API error', response.status);
        break;
      }
      
      const issues = await response.json();
      
      if (!issues || issues.length === 0) {
        break;
      }
      
      // Normalize the input URL for comparison
      const normalizedUrl = url.trim();
      const normalizedUrlNoTrailing = normalizedUrl.replace(/\/$/, '');
      const normalizedUrlWithTrailing = normalizedUrlNoTrailing + '/';
      
      // Check each issue's body for the URL
      for (const issue of issues) {
        if (issue.pull_request) continue; // Skip pull requests
        
        if (!issue.body) continue;
        
        // Try multiple methods to extract URL from frontmatter
        let existingUrl = null;
        
        // Method 1: Extract from frontmatter with double quotes
        const urlMatchQuoted = issue.body.match(/url:\s*"([^"]+)"/);
        if (urlMatchQuoted) {
          existingUrl = urlMatchQuoted[1].trim();
        }
        
        // Method 2: Extract from frontmatter with single quotes
        if (!existingUrl) {
          const urlMatchSingle = issue.body.match(/url:\s*'([^']+)'/);
          if (urlMatchSingle) {
            existingUrl = urlMatchSingle[1].trim();
          }
        }
        
        // Method 3: Extract from frontmatter without quotes (more permissive)
        if (!existingUrl) {
          const urlMatchUnquoted = issue.body.match(/url:\s*([^\s\n"']+)/);
          if (urlMatchUnquoted) {
            existingUrl = urlMatchUnquoted[1].trim();
          }
        }
        
        if (existingUrl) {
          // Handle escaped quotes in URL
          existingUrl = existingUrl.replace(/\\"/g, '"').replace(/\\'/g, "'");
          
          const existingUrlNoTrailing = existingUrl.replace(/\/$/, '');
          const existingUrlWithTrailing = existingUrlNoTrailing + '/';
          
          // Compare URLs (with and without trailing slash, both ways)
          if (existingUrl === normalizedUrl ||
              existingUrl === normalizedUrlNoTrailing ||
              existingUrl === normalizedUrlWithTrailing ||
              existingUrlNoTrailing === normalizedUrl ||
              existingUrlNoTrailing === normalizedUrlNoTrailing ||
              existingUrlNoTrailing === normalizedUrlWithTrailing ||
              existingUrlWithTrailing === normalizedUrl ||
              existingUrlWithTrailing === normalizedUrlNoTrailing ||
              existingUrlWithTrailing === normalizedUrlWithTrailing) {
            console.log('checkUrlExists: Found duplicate! Issue #' + issue.number, 'Existing:', existingUrl, 'New:', normalizedUrl);
            return issue;
          }
        }
        
        // Fallback: More thorough search using regex with global flag
        const urlFieldRegex = /url:\s*["']?([^"'\n]+)["']?/g;
        let match;
        while ((match = urlFieldRegex.exec(issue.body)) !== null) {
          const foundUrl = match[1].trim().replace(/\\"/g, '"').replace(/\\'/g, "'");
          const foundUrlNoTrailing = foundUrl.replace(/\/$/, '');
          
          if (foundUrl === normalizedUrl ||
              foundUrl === normalizedUrlNoTrailing ||
              foundUrlNoTrailing === normalizedUrl ||
              foundUrlNoTrailing === normalizedUrlNoTrailing) {
            console.log('checkUrlExists: Found duplicate via fallback! Issue #' + issue.number);
            return issue;
          }
        }
      }
      
      // If we got fewer issues than perPage, we've reached the end
      if (issues.length < perPage) {
        break;
      }
      
      page++;
    }
    
    console.log('checkUrlExists: No duplicate found for URL:', url);
    return null;
  } catch (error) {
    console.error('Error checking URL existence:', error);
    return null; // Return null on error to allow saving
  }
}

/**
 * Create a GitHub Issue (bookmark)
 * @param {Object} bookmark - Bookmark data
 * @returns {Promise<Object>} Created issue
 */
async function createGitHubIssue(bookmark) {
  // Get PAT from native host
  const pat = await getPAT();
  
  // Get GitHub config
  const config = await getGitHubConfig();
  
  if (!config.owner || !config.repo) {
    throw new Error('GitHub repository not configured. Please set it in the Options page.');
  }
  
  // Format bookmark as YAML frontmatter
  const body = `---
title: "${bookmark.title.replace(/"/g, '\\"')}"
url: "${bookmark.url}"
provider: "${bookmark.provider}"
date_saved: "${new Date().toISOString()}"
---
${bookmark.notes || ''}`;
  
  // Determine labels - include type and tags
  const labels = [bookmark.type]; // 'article' or 'video'
  
  // Add tags as labels if provided
  if (bookmark.tags && Array.isArray(bookmark.tags) && bookmark.tags.length > 0) {
    // Filter out empty tags and add to labels
    bookmark.tags.forEach(tag => {
      const trimmedTag = tag.trim();
      if (trimmedTag && !labels.includes(trimmedTag)) {
        labels.push(trimmedTag);
      }
    });
  }
  
  // Create issue via GitHub API
  const response = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/issues`,
    {
      method: 'POST',
      headers: {
        'Authorization': `token ${pat}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        title: bookmark.title,
        body: body,
        labels: labels
      })
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`GitHub API error (${response.status}): ${error.message || 'Unknown error'}`);
  }
  
  const issue = await response.json();
  
  // Add to cache immediately after creation
  addToCache(bookmark.url, issue);
  
  return issue;
}

/**
 * Parse YAML frontmatter from issue body
 * @param {string} body - Issue body text
 * @returns {Object|null} Parsed metadata and content
 */
function parseYAMLFrontmatter(body) {
  if (!body) return null;
  
  const match = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return null;
  
  const yaml = match[1];
  const content = match[2].trim();
  
  // Simple YAML parser
  const metadata = {};
  yaml.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;
    
    const key = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();
    
    // Remove quotes
    value = value.replace(/^["']|["']$/g, '');
    
    if (key && value) {
      metadata[key] = value;
    }
  });
  
  return { metadata, content };
}

/**
 * Get bookmark data from GitHub issue
 * @param {number} issueNumber - Issue number
 * @returns {Promise<Object>} Bookmark data
 */
async function getBookmarkFromIssue(issueNumber) {
  const pat = await getPAT();
  const config = await getGitHubConfig();
  
  if (!config.owner || !config.repo) {
    throw new Error('GitHub repository not configured.');
  }
  
  const response = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${issueNumber}`,
    {
      headers: {
        'Authorization': `token ${pat}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`GitHub API error (${response.status}): ${error.message || 'Unknown error'}`);
  }
  
  const issue = await response.json();
  const parsed = parseYAMLFrontmatter(issue.body);
  
  if (!parsed) {
    throw new Error('Could not parse bookmark data from issue');
  }
  
  // Extract tags from labels (exclude type label)
  const tags = issue.labels
    .map(label => label.name)
    .filter(label => label !== 'article' && label !== 'video');
  
  // Determine type from labels
  const type = issue.labels.some(l => l.name === 'video') ? 'video' : 'article';
  
  return {
    title: issue.title,
    url: parsed.metadata.url || '',
    type: type,
    provider: parsed.metadata.provider || 'Article',
    notes: parsed.content || '',
    tags: tags,
    issueNumber: issue.number
  };
}

/**
 * Detect provider from URL
 * @param {string} url - Page URL
 * @returns {string} Provider name
 */
function detectProvider(url) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'YouTube';
  } else if (url.includes('vimeo.com')) {
    return 'Vimeo';
  } else {
    return 'Article';
  }
}

/**
 * Auto-detect bookmark type from URL
 * @param {string} url - Page URL
 * @returns {string} 'article' or 'video'
 */
function detectType(url) {
  if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com')) {
    return 'video';
  }
  return 'article';
}

/**
 * Update a GitHub Issue (bookmark)
 * @param {number} issueNumber - Issue number to update
 * @param {Object} bookmark - Bookmark data
 * @returns {Promise<Object>} Updated issue
 */
async function updateGitHubIssue(issueNumber, bookmark) {
  // Get PAT from native host
  const pat = await getPAT();
  
  // Get GitHub config
  const config = await getGitHubConfig();
  
  if (!config.owner || !config.repo) {
    throw new Error('GitHub repository not configured.');
  }
  
  // Format bookmark as YAML frontmatter
  const body = `---
title: "${bookmark.title.replace(/"/g, '\\"')}"
url: "${bookmark.url}"
provider: "${bookmark.provider}"
date_saved: "${new Date().toISOString()}"
date_updated: "${new Date().toISOString()}"
---
${bookmark.notes || ''}`;
  
  // Determine labels - include type and tags
  const labels = [bookmark.type]; // 'article' or 'video'
  
  // Add tags as labels if provided
  if (bookmark.tags && Array.isArray(bookmark.tags) && bookmark.tags.length > 0) {
    bookmark.tags.forEach(tag => {
      const trimmedTag = tag.trim();
      if (trimmedTag && !labels.includes(trimmedTag)) {
        labels.push(trimmedTag);
      }
    });
  }
  
  // Update issue via GitHub API
  const response = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${issueNumber}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${pat}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        title: bookmark.title,
        body: body,
        labels: labels,
        state: 'open' // Ensure it's open
      })
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`GitHub API error (${response.status}): ${error.message || 'Unknown error'}`);
  }
  
  return response.json();
}

/**
 * Delete a GitHub Issue
 * @param {number} issueNumber - Issue number to delete
 * @returns {Promise<Object>} Deletion result
 */
async function deleteGitHubIssue(issueNumber) {
  // Get PAT from native host
  const pat = await getPAT();
  
  // Get GitHub config
  const config = await getGitHubConfig();
  
  if (!config.owner || !config.repo) {
    throw new Error('GitHub repository not configured.');
  }
  
  // Close the issue (GitHub doesn't allow deleting issues, only closing)
  const response = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${issueNumber}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${pat}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        state: 'closed'
      })
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`GitHub API error (${response.status}): ${error.message || 'Unknown error'}`);
  }
  
  return response.json();
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'createBookmark') {
    // Handle bookmark creation
    createGitHubIssue(request.data)
      .then((issue) => {
        sendResponse({ success: true, issue: issue });
      })
      .catch((error) => {
        console.error('Error creating bookmark:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'checkHealth') {
    // Check native host health
    checkHealth()
      .then((status) => {
        sendResponse({ success: true, status: status });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'storePAT') {
    // Store PAT via native host
    storePAT(request.pat)
      .then((result) => {
        sendResponse({ success: true, result: result });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'removePAT') {
    // Remove PAT via native host
    removePAT()
      .then((result) => {
        sendResponse({ success: true, result: result });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'detectProvider') {
    // Detect provider from URL
    const provider = detectProvider(request.url);
    sendResponse({ provider: provider });
    return false;
  }
  
  if (request.action === 'detectType') {
    // Detect type from URL
    const type = detectType(request.url);
    sendResponse({ type: type });
    return false;
  }
  
  if (request.action === 'checkUrlExists') {
    // Check if URL already exists
    checkUrlExists(request.url)
      .then((issue) => {
        sendResponse({ exists: !!issue, issue: issue });
      })
      .catch((error) => {
        console.error('Error checking URL:', error);
        sendResponse({ exists: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'deleteBookmark') {
    // Delete (close) a bookmark issue
    deleteGitHubIssue(request.issueNumber)
      .then((result) => {
        sendResponse({ success: true, result: result });
      })
      .catch((error) => {
        console.error('Error deleting bookmark:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'updateBookmark') {
    // Update an existing bookmark issue
    updateGitHubIssue(request.issueNumber, request.data)
      .then((issue) => {
        sendResponse({ success: true, issue: issue });
      })
      .catch((error) => {
        console.error('Error updating bookmark:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'cacheBookmark') {
    // Add bookmark to cache (for bulk save)
    addToCache(request.url, request.issue);
    sendResponse({ success: true });
    return false;
  }
  
  if (request.action === 'getBookmark') {
    // Get bookmark data from issue
    getBookmarkFromIssue(request.issueNumber)
      .then((bookmark) => {
        sendResponse({ success: true, bookmark: bookmark });
      })
      .catch((error) => {
        console.error('Error getting bookmark:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

/**
 * Quick save bookmark (no popup)
 */
async function quickSaveBookmark(tab) {
  try {
    const url = tab.url;
    const title = tab.title || url;
    
    // Show checking badge
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
    
    // Check for duplicates first
    const existingIssue = await checkUrlExists(url);
    if (existingIssue) {
      // Show notification that it already exists with link
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'MookBarked - Duplicate',
        message: `Already saved in issue #${existingIssue.number}`,
        buttons: [
          { title: 'View Issue' }
        ],
        requireInteraction: false
      }, (notificationId) => {
        // Store issue URL for button click
        if (notificationId) {
          chrome.storage.local.set({ 
            [`notification_${notificationId}`]: existingIssue.html_url 
          });
        }
      });
      
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#fbbf24' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
      return { duplicate: true, issue: existingIssue };
    }
    
    // Get default tags from storage
    const result = await chrome.storage.local.get(['defaultTags']);
    const defaultTags = result.defaultTags || [];
    
    // Detect provider and type
    const provider = detectProvider(url);
    const type = detectType(url);
    
    const bookmark = {
      title: title,
      url: url,
      type: type,
      provider: provider,
      notes: '',
      tags: defaultTags
    };
    
    // Create the bookmark
    const issue = await createGitHubIssue(bookmark);
    
    // Show success notification with link
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'MookBarked - Saved ✓',
      message: `${title.substring(0, 60)}${title.length > 60 ? '...' : ''}`,
      buttons: [
        { title: 'View Issue' }
      ],
      requireInteraction: false
    }, (notificationId) => {
      // Store issue URL for button click
      if (notificationId) {
        chrome.storage.local.set({ 
          [`notification_${notificationId}`]: issue.html_url 
        });
      }
    });
    
    // Show success badge
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
    
    return issue;
  } catch (error) {
    console.error('Quick save error:', error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'MookBarked - Error ✗',
      message: error.message || 'Failed to save bookmark',
      requireInteraction: false
    });
    
    chrome.action.setBadgeText({ text: '✗' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
    
    throw error;
  }
}

// Setup context menu
function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'quickSave',
      title: 'Quick Save with MookBarked',
      contexts: ['page']
    });
  });
}

// Setup on install and startup
chrome.runtime.onInstalled.addListener(setupContextMenu);
chrome.runtime.onStartup.addListener(setupContextMenu);
setupContextMenu(); // Also setup immediately

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'quickSave') {
    quickSaveBookmark(tab).catch(error => {
      console.error('Quick save failed:', error);
    });
  }
});

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // Get stored URL and open it
    chrome.storage.local.get([`notification_${notificationId}`], (result) => {
      const url = result[`notification_${notificationId}`];
      if (url) {
        chrome.tabs.create({ url: url });
        // Clean up
        chrome.storage.local.remove([`notification_${notificationId}`]);
      }
    });
  }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  // Get stored URL and open it
  chrome.storage.local.get([`notification_${notificationId}`], (result) => {
    const url = result[`notification_${notificationId}`];
    if (url) {
      chrome.tabs.create({ url: url });
      // Clean up
      chrome.storage.local.remove([`notification_${notificationId}`]);
    }
  });
});

console.log('Background service worker loaded');
