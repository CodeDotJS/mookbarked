# MookBarked

Chrome extension that saves bookmarks as GitHub Issues. PAT stored in OS keychain via native messaging.

## Prerequisites

- Python 3.7+
- Chrome or Chromium
- GitHub account with a repository
- GitHub Personal Access Token ([create one](https://github.com/settings/tokens/new) with `repo` or `public_repo` scope)

## Installation

**1. Clone the repository**

```bash
git clone https://github.com/CodeDotJS/mookbarked.git
cd mookbarked
```

**2. Run setup script**

```bash
./setup.sh
```

This fixes Python paths for your machine.

**3. Install dependencies**

```bash
cd native-host
pip install keyring keyrings.alt
```

**4. Load extension in Chrome**

1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension` folder
5. Copy the extension ID

**5. Install native host**

```bash
./install.sh <your-extension-id>
```

If you don't have the extension ID yet, run `./install.sh` and update the manifest later:
- **macOS**: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.bookmarks.native_host.json`
- **Linux**: `~/.config/google-chrome/NativeMessagingHosts/com.bookmarks.native_host.json`

**6. Configure extension**

1. Right-click the extension icon
2. Click "Options"
3. Enter your GitHub username and repository name
4. Paste your Personal Access Token
5. Click "Save PAT"
6. Click "Test Connection" to verify

**Done!** Click the extension icon on any page to save a bookmark.

## Testing

```bash
cd native-host
python3 test_native_host.py
```

## Troubleshooting Common Issues

- __"Native messaging host not found"__

  -  Verify manifest is in correct location:
     - macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
     - Linux: `~/.config/google-chrome/NativeMessagingHosts/`
  - Check extension ID in manifest matches actual ID
  - Set correct permissions: `chmod 700 native_host.py`

- __"Connection failed" in Options page__

  - Run native host test: `python3 test_native_host.py`
  - Check keyring backend installed: `pip install keyrings.alt`
  - Test keyring manually:
  ```bash
   python3 -c "import keyring; keyring.set_password('test', 'test', 'value')"
   ```

- __"PAT not found" when bookmarking__

  - Go to Options page
  - Verify health indicator is green
  - Re-enter and save PAT
  - Test connection

- __GitHub API returns 403 or 404__

  - Verify PAT has correct scopes (`repo` or `public_repo`)
  - Check repository is public (or PAT has `repo` scope for private repos)
  - Verify owner/repo names are correct
  - Test PAT manually:
   ```bash
        curl -H "Authorization: token YOUR_PAT" https://api.github.com/user
   ```

- __Updates page shows "Rate limited"__
  - Wait for rate limit reset (shown in error message)
  - For frequent access, implement GitHub Actions to generate static JSON


# License

MIT &copy; Rishi Giri