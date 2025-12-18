#!/bin/bash
# Setup script to fix hardcoded Python paths for your machine

set -e

echo "=========================================="
echo "MookBarked Setup"
echo "=========================================="
echo ""

# Detect Python
PYTHON_PATH=$(which python3)

if [ -z "$PYTHON_PATH" ]; then
    echo "Error: python3 not found in PATH"
    exit 1
fi

echo "Found Python: $PYTHON_PATH"
echo ""

# Update native_host.py shebang
echo "Updating native_host.py..."
sed -i.bak "1s|.*|#!${PYTHON_PATH}|" native-host/native_host.py
chmod 700 native-host/native_host.py

# Update native_host_wrapper.sh
echo "Updating native_host_wrapper.sh..."
SCRIPT_DIR="\$(dirname \"\$0\")"
cat > native-host/native_host_wrapper.sh << EOF
#!/bin/bash
exec ${PYTHON_PATH} "${SCRIPT_DIR}/native_host.py" "\$@"
EOF
chmod 700 native-host/native_host_wrapper.sh

echo ""
echo "=========================================="
echo "Setup complete!"
echo "=========================================="
echo ""
echo "Python path: $PYTHON_PATH"
echo ""
echo "Next steps:"
echo "1. cd native-host"
echo "2. pip install keyring keyrings.alt"
echo "3. ./install.sh <your-extension-id>"
echo ""

