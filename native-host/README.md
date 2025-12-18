# Native Messaging Host

Secure credential storage for the Bookmarks Chrome Extension using OS keychain.

## Overview

This native messaging host:
- Stores GitHub Personal Access Token (PAT) in OS keychain
- Provides secure access to credentials for the Chrome extension
- Uses Chrome Native Messaging protocol
- Has no network access
- Runs only when called by the extension

## Requirements

- Python 3.7 or higher
- `keyring` library
- `keyrings.alt` library (for alternative backends)

## Installation

### Automatic Installation

#### macOS/Linux:
```bash
./install.sh <your-extension-id>
```

#### Windows:
```cmd
install.bat <your-extension-id>
```

### Manual Installation

1. **Install Python dependencies:**
   ```bash
   pip install keyring keyrings.alt
   ```

2. **Make native_host.py executable (macOS/Linux):**
   ```bash
   chmod +x native_host.py
   ```

3. **Create manifest file:**

   **macOS:**
   ```bash
   mkdir -p "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
   ```
   
   **Linux:**
   ```bash
   mkdir -p ~/.config/google-chrome/NativeMessagingHosts
   ```
   
   **Windows:** Use Registry Editor or install.bat script

4. **Create `com.bookmarks.native_host.json`:**
   ```json
   {
     "name": "com.bookmarks.native_host",
     "description": "Native messaging host for bookmarks extension",
     "path": "/absolute/path/to/native_host.py",
     "type": "stdio",
     "allowed_origins": [
       "chrome-extension://YOUR_EXTENSION_ID/"
     ]
   }
   ```

5. **Place manifest file:**
   - **macOS:** `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
   - **Linux:** `~/.config/google-chrome/NativeMessagingHosts/`
   - **Windows:** Add registry key pointing to manifest

## Testing

Run the test suite:
```bash
python3 test_native_host.py
```

Manual testing:
```bash
# Health check
echo '{"cmd":"health"}' | python3 native_host.py

# Store a test PAT
echo '{"cmd":"set","pat":"ghp_test123"}' | python3 native_host.py

# Retrieve PAT
echo '{"cmd":"get"}' | python3 native_host.py

# Remove PAT
echo '{"cmd":"remove"}' | python3 native_host.py
```

## Commands

### Health Check
**Request:**
```json
{"cmd": "health"}
```

**Response:**
```json
{
  "status": "success",
  "message": "Native host is healthy",
  "version": "1.0.0",
  "keyring_backend": "KeyringBackendName"
}
```

### Store PAT
**Request:**
```json
{"cmd": "set", "pat": "ghp_your_token_here"}
```

**Response:**
```json
{
  "status": "success",
  "message": "PAT stored securely"
}
```

### Retrieve PAT
**Request:**
```json
{"cmd": "get"}
```

**Response:**
```json
{
  "status": "success",
  "pat": "ghp_your_token_here"
}
```

### Remove PAT
**Request:**
```json
{"cmd": "remove"}
```

**Response:**
```json
{
  "status": "success",
  "message": "PAT removed successfully"
}
```

## Security

- **No network access:** This script never makes network requests
- **OS keychain:** Credentials stored using OS-level security
- **Extension restriction:** Only the specified extension can communicate
- **No logging of secrets:** Logs never contain PAT values
- **File permissions:** Script should be user-readable/executable only

## Troubleshooting

### "Native messaging host not found"
- Verify manifest is in correct OS location
- Check `path` in manifest points to native_host.py
- Ensure extension ID in `allowed_origins` matches actual ID
- Make sure native_host.py is executable

### "No recommended backend was available"
Install keyring backends:
```bash
pip install keyrings.alt
```

### "Keychain access denied" (macOS)
Grant Keychain Access in System Preferences → Security & Privacy

### Test keyring manually:
```python
python3 -c "import keyring; keyring.set_password('test', 'test', 'value'); print(keyring.get_password('test', 'test'))"
```

### Check Chrome logs:
1. Go to chrome://extensions/
2. Enable "Developer mode"
3. Click "Inspect views: service worker" on your extension
4. Check Console for errors

## Files

- `native_host.py` - Main native messaging host
- `test_native_host.py` - Test suite
- `install.sh` - Installer for macOS/Linux
- `install.bat` - Installer for Windows
- `README.md` - This file

## Logs

Logs are written to `/tmp/chrome_bookmarks_host.log` (macOS/Linux) or `%TEMP%\chrome_bookmarks_host.log` (Windows).

**Note:** Logs never contain PAT values for security.
