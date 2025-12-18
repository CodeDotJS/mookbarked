#!/bin/bash
# Installation script for macOS and Linux
# This script installs the native messaging host manifest

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Native Messaging Host Installer"
echo "=========================================="
echo ""

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
else
    echo -e "${RED}Error: Unsupported OS${NC}"
    echo "This installer supports macOS and Linux only."
    exit 1
fi

echo "Detected OS: $OS"
echo ""

# Check if extension ID is provided
if [ -z "$1" ]; then
    echo -e "${YELLOW}Warning: No extension ID provided${NC}"
    echo "Usage: $0 <extension-id>"
    echo ""
    echo "To get your extension ID:"
    echo "1. Load the unpacked extension in Chrome"
    echo "2. Go to chrome://extensions/"
    echo "3. Enable 'Developer mode'"
    echo "4. Copy the extension ID"
    echo ""
    read -p "Enter your extension ID (or press Enter to use placeholder): " EXTENSION_ID
    
    if [ -z "$EXTENSION_ID" ]; then
        EXTENSION_ID="YOUR_EXTENSION_ID_HERE"
        echo -e "${YELLOW}Using placeholder ID. You'll need to update the manifest later.${NC}"
    fi
else
    EXTENSION_ID="$1"
fi

echo "Extension ID: $EXTENSION_ID"
echo ""

# Get absolute path to native host script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
HOST_PATH="$SCRIPT_DIR/native_host.py"

if [ ! -f "$HOST_PATH" ]; then
    echo -e "${RED}Error: native_host.py not found at $HOST_PATH${NC}"
    exit 1
fi

echo "Native host script: $HOST_PATH"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: python3 not found${NC}"
    echo "Please install Python 3.7 or higher"
    exit 1
fi

PYTHON_VERSION=$(python3 --version)
echo "Python: $PYTHON_VERSION"
echo ""

# Check keyring library
if ! python3 -c "import keyring" 2>/dev/null; then
    echo -e "${YELLOW}Warning: keyring library not installed${NC}"
    echo "Installing keyring..."
    pip3 install keyring keyrings.alt --user
    echo ""
fi

# Create manifest directory
echo "Creating manifest directory..."
mkdir -p "$MANIFEST_DIR"

# Create manifest file
MANIFEST_FILE="$MANIFEST_DIR/com.bookmarks.native_host.json"

echo "Creating manifest file..."
cat > "$MANIFEST_FILE" << EOF
{
  "name": "com.bookmarks.native_host",
  "description": "Native messaging host for bookmarks extension",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

echo "Manifest created at: $MANIFEST_FILE"
echo ""

# Set permissions
echo "Setting permissions..."
chmod 700 "$HOST_PATH"
chmod 600 "$MANIFEST_FILE"

echo ""
echo -e "${GREEN}=========================================="
echo "Installation complete!"
echo "==========================================${NC}"
echo ""
echo "Manifest location: $MANIFEST_FILE"
echo "Host script: $HOST_PATH"
echo ""

# Show next steps
echo "Next steps:"
echo "1. Load your extension in Chrome (chrome://extensions/)"
echo "2. If you used a placeholder ID, update the manifest with the real ID:"
echo "   - Get ID from chrome://extensions/"
echo "   - Edit: $MANIFEST_FILE"
echo "   - Replace YOUR_EXTENSION_ID_HERE with actual ID"
echo "3. Restart Chrome"
echo "4. Test the connection from your extension"
echo ""

# Offer to show the manifest
read -p "View the manifest file? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cat "$MANIFEST_FILE"
    echo ""
fi

echo "Done!"
