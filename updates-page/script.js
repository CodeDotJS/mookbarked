/**
 * Updates Page Script
 * Fetches and displays latest bookmarks from GitHub Issues
 */

// Configuration - UPDATE THESE WITH YOUR GITHUB INFO
const GITHUB_OWNER = 'CodeDotJS';
const GITHUB_REPO = 'mookbarked';
const ITEMS_PER_TYPE = 3; // Number of articles and videos to show

/**
 * Parse YAML frontmatter from issue body
 * @param {string} body - Issue body text
 * @returns {Object|null} Parsed metadata and content
 */
function parseYAMLFrontmatter(body) {
  if (!body) return null;
  
  const match = body.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
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
 * Format date for display
 * @param {string} isoDate - ISO 8601 date string
 * @returns {string} Formatted date
 */
function formatDate(isoDate) {
  if (!isoDate) return '';
  
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

/**
 * Create bookmark card HTML
 * @param {Object} bookmark - Bookmark data
 * @returns {string} HTML string
 */
function createBookmarkCard(bookmark) {
  const { metadata, content } = bookmark.parsed;
  const title = metadata.title || bookmark.title;
  const url = metadata.url || '';
  const provider = metadata.provider || 'Unknown';
  const dateSaved = metadata.date_saved || bookmark.created_at;
  
  return `
    <div class="bookmark-card" onclick="window.open('${url}', '_blank')">
      <div class="bookmark-title">${escapeHtml(title)}</div>
      <div class="bookmark-url">${escapeHtml(url)}</div>
      <div class="bookmark-meta">
        <span class="bookmark-provider">${escapeHtml(provider)}</span>
        <span class="bookmark-date">
          <span>📅</span>
          <span>${formatDate(dateSaved)}</span>
        </span>
      </div>
      ${content ? `<div class="bookmark-notes">${escapeHtml(content)}</div>` : ''}
    </div>
  `;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('errorState').style.display = 'block';
  document.getElementById('errorMessage').textContent = message;
}

/**
 * Fetch bookmarks from GitHub
 * @param {string} label - Label to filter by ('article' or 'video')
 * @param {number} perPage - Number of items to fetch
 * @returns {Promise<Array>} Filtered and parsed bookmarks
 */
async function fetchBookmarks(label, perPage = 3) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues?labels=${label}&state=open&per_page=${perPage}&sort=created&direction=desc`;
  
  const response = await fetch(url);
  
  // Check for rate limiting
  if (response.status === 403) {
    const resetTime = response.headers.get('X-RateLimit-Reset');
    if (resetTime) {
      const resetDate = new Date(parseInt(resetTime) * 1000);
      throw new Error(`Rate limited. Resets at ${resetDate.toLocaleTimeString()}`);
    }
    throw new Error('Rate limited. Please try again later.');
  }
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const issues = await response.json();
  
  // Filter out pull requests and parse frontmatter
  return issues
    .filter(issue => !issue.pull_request)
    .map(issue => {
      const parsed = parseYAMLFrontmatter(issue.body);
      return {
        ...issue,
        parsed: parsed || { metadata: {}, content: '' }
      };
    });
}

/**
 * Display bookmarks
 * @param {Array} articles - Article bookmarks
 * @param {Array} videos - Video bookmarks
 */
function displayBookmarks(articles, videos) {
  const articlesSection = document.getElementById('articlesSection');
  const videosSection = document.getElementById('videosSection');
  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');
  
  loadingState.style.display = 'none';
  
  if (articles.length === 0 && videos.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  
  // Display articles
  if (articles.length > 0) {
    articlesSection.style.display = 'block';
    const articlesList = document.getElementById('articlesList');
    articlesList.innerHTML = articles.map(createBookmarkCard).join('');
  }
  
  // Display videos
  if (videos.length > 0) {
    videosSection.style.display = 'block';
    const videosList = document.getElementById('videosList');
    videosList.innerHTML = videos.map(createBookmarkCard).join('');
  }
}

/**
 * Main function - fetch and display bookmarks
 */
async function loadBookmarks() {
  try {
    // Validate configuration
    if (GITHUB_OWNER === 'YOUR_GITHUB_USERNAME' || GITHUB_REPO === 'YOUR_REPO_NAME') {
      showError('Please update GITHUB_OWNER and GITHUB_REPO in script.js');
      return;
    }
    
    // Fetch articles and videos in parallel
    const [articles, videos] = await Promise.all([
      fetchBookmarks('article', ITEMS_PER_TYPE),
      fetchBookmarks('video', ITEMS_PER_TYPE)
    ]);
    
    displayBookmarks(articles, videos);
    
    // Update footer with repo link
    const repoLink = document.getElementById('repoLink');
    repoLink.innerHTML = `View all bookmarks on <a href="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues" target="_blank" class="github-link">GitHub</a>`;
    
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    showError(error.message);
  }
}

// Load bookmarks when page loads
document.addEventListener('DOMContentLoaded', loadBookmarks);
