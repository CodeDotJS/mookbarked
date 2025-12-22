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
 * Check if URL already exists in GitHub issues
 * @param {string} url - URL to check
 * @returns {Promise<Object|null>} Existing issue if found, null otherwise
 */
async function checkUrlExists(url) {
  try {
    const pat = await getPAT();
    const config = await getGitHubConfig();
    
    if (!config.owner || !config.repo) {
      return null;
    }
    
    // Search through issues to find matching URL
    // We'll check the first few pages of issues
    let page = 1;
    const perPage = 100;
    const maxPages = 5; // Limit to 5 pages to avoid too many API calls
    
    while (page <= maxPages) {
      const response = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/issues?state=all&per_page=${perPage}&page=${page}&sort=updated&direction=desc`,
        {
          headers: {
            'Authorization': `token ${pat}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );
      
      if (!response.ok) {
        break;
      }
      
      const issues = await response.json();
      
      // Check each issue's body for the URL
      for (const issue of issues) {
        if (issue.pull_request) continue; // Skip pull requests
        
        if (!issue.body) continue;
        
        // Normalize URLs for comparison
        const normalizedUrl = url.trim();
        const normalizedUrlNoTrailing = normalizedUrl.replace(/\/$/, '');
        
        // Extract URL from frontmatter - match the exact format used when saving
        // Format is: url: "URL" (with double quotes)
        const frontmatterRegex = /^---\s*\n[\s\S]*?url:\s*"([^"]+)"[\s\S]*?---/m;
        const frontmatterMatch = issue.body.match(frontmatterRegex);
        
        if (frontmatterMatch) {
          const existingUrl = frontmatterMatch[1].trim();
          const existingUrlNoTrailing = existingUrl.replace(/\/$/, '');
          
          // Compare both with and without trailing slash
          if (existingUrl === normalizedUrl || 
              existingUrl === normalizedUrlNoTrailing ||
              existingUrlNoTrailing === normalizedUrl ||
              existingUrlNoTrailing === normalizedUrlNoTrailing) {
            return issue;
          }
        }
        
        // Fallback: check if URL appears in url: field with various quote styles
        const urlFieldPatterns = [
          `url: "${normalizedUrl}"`,
          `url: "${normalizedUrlNoTrailing}"`,
          `url: ${normalizedUrl}`,
          `url: ${normalizedUrlNoTrailing}`
        ];
        
        for (const pattern of urlFieldPatterns) {
          if (issue.body.includes(pattern)) {
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
});

console.log('Background service worker loaded');
