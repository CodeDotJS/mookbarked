/**
 * Background Service Worker for Bookmarks Extension
 * Handles GitHub API calls and native messaging
 */

const NATIVE_HOST_NAME = 'com.bookmarks.native_host';

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
  
  // Determine label
  const labels = [bookmark.type]; // 'article' or 'video'
  
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
  
  return response.json();
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
});

console.log('Background service worker loaded');
