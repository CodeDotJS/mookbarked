#!/Users/rishi/.pyenv/versions/3.12.3/bin/python3	

"""
Chrome Native Messaging Host for Bookmark Extension
Handles secure credential storage using OS keychain
"""

import sys
import json
import struct
import logging
from typing import Dict, Any, Optional

try:
    import keyring
except ImportError:
    print("Error: keyring library not installed. Run: pip install keyring", file=sys.stderr)
    sys.exit(1)

# Constants
SERVICE_NAME = "chrome_bookmarks_extension"
USERNAME = "github_pat"
VERSION = "1.0.0"

# Configure logging (never log secrets!)
logging.basicConfig(
    filename='/tmp/chrome_bookmarks_host.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)


def send_message(message: Dict[str, Any]) -> None:
    """
    Send a message to Chrome using Native Messaging protocol.
    Messages are length-prefixed JSON over stdout.
    
    Args:
        message: Dictionary to send as JSON
    """
    try:
        encoded_content = json.dumps(message).encode('utf-8')
        encoded_length = struct.pack('I', len(encoded_content))
        
        sys.stdout.buffer.write(encoded_length)
        sys.stdout.buffer.write(encoded_content)
        sys.stdout.buffer.flush()
        
        logging.info(f"Sent message: {message.get('status', 'unknown')}")
    except Exception as e:
        logging.error(f"Error sending message: {str(e)}")


def read_message() -> Optional[Dict[str, Any]]:
    """
    Read a message from Chrome using Native Messaging protocol.
    
    Returns:
        Parsed JSON message or None on error
    """
    try:
        # Read the message length (first 4 bytes)
        text_length_bytes = sys.stdin.buffer.read(4)
        
        if len(text_length_bytes) == 0:
            # EOF reached
            return None
        
        # Unpack message length
        text_length = struct.unpack('I', text_length_bytes)[0]
        
        # Read the message content
        text = sys.stdin.buffer.read(text_length).decode('utf-8')
        
        # Parse JSON
        message = json.loads(text)
        
        # Log command (but never log the PAT itself)
        cmd = message.get('cmd', 'unknown')
        logging.info(f"Received command: {cmd}")
        
        return message
        
    except Exception as e:
        logging.error(f"Error reading message: {str(e)}")
        send_message({
            "status": "error",
            "error": f"Failed to read message: {str(e)}"
        })
        return None


def handle_set_command(pat: str) -> None:
    """
    Store PAT in OS keychain.
    
    Args:
        pat: Personal Access Token to store
    """
    try:
        if not pat or not isinstance(pat, str):
            send_message({
                "status": "error",
                "error": "Invalid PAT: must be a non-empty string"
            })
            return
        
        # Basic validation (GitHub PATs start with ghp_ or github_pat_)
        if not (pat.startswith('ghp_') or pat.startswith('github_pat_')):
            send_message({
                "status": "warning",
                "message": "PAT format looks unusual (expected to start with 'ghp_' or 'github_pat_')"
            })
        
        keyring.set_password(SERVICE_NAME, USERNAME, pat)
        
        send_message({
            "status": "success",
            "message": "PAT stored securely"
        })
        
        logging.info("PAT stored successfully")
        
    except Exception as e:
        logging.error(f"Error storing PAT: {str(e)}")
        send_message({
            "status": "error",
            "error": f"Failed to store PAT: {str(e)}"
        })


def handle_get_command() -> None:
    """
    Retrieve PAT from OS keychain.
    """
    try:
        pat = keyring.get_password(SERVICE_NAME, USERNAME)
        
        if pat is None:
            send_message({
                "status": "error",
                "error": "PAT not found. Please set it first in the Options page."
            })
            logging.info("PAT not found in keychain")
            return
        
        send_message({
            "status": "success",
            "pat": pat
        })
        
        logging.info("PAT retrieved successfully")
        
    except Exception as e:
        logging.error(f"Error retrieving PAT: {str(e)}")
        send_message({
            "status": "error",
            "error": f"Failed to retrieve PAT: {str(e)}"
        })


def handle_remove_command() -> None:
    """
    Remove PAT from OS keychain.
    """
    try:
        # Check if PAT exists first
        pat = keyring.get_password(SERVICE_NAME, USERNAME)
        
        if pat is None:
            send_message({
                "status": "success",
                "message": "No PAT to remove"
            })
            return
        
        keyring.delete_password(SERVICE_NAME, USERNAME)
        
        send_message({
            "status": "success",
            "message": "PAT removed successfully"
        })
        
        logging.info("PAT removed successfully")
        
    except Exception as e:
        logging.error(f"Error removing PAT: {str(e)}")
        send_message({
            "status": "error",
            "error": f"Failed to remove PAT: {str(e)}"
        })


def handle_health_command() -> None:
    """
    Health check - verify native host is working.
    """
    try:
        # Test keyring access
        test_key = f"{SERVICE_NAME}_health_check"
        keyring.set_password(SERVICE_NAME, test_key, "test")
        result = keyring.get_password(SERVICE_NAME, test_key)
        keyring.delete_password(SERVICE_NAME, test_key)
        
        if result != "test":
            raise Exception("Keyring test failed")
        
        send_message({
            "status": "success",
            "message": "Native host is healthy",
            "version": VERSION,
            "keyring_backend": keyring.get_keyring().__class__.__name__
        })
        
        logging.info("Health check passed")
        
    except Exception as e:
        logging.error(f"Health check failed: {str(e)}")
        send_message({
            "status": "error",
            "error": f"Health check failed: {str(e)}",
            "version": VERSION
        })


def handle_message(message: Dict[str, Any]) -> None:
    """
    Route message to appropriate handler based on command.
    
    Args:
        message: Parsed message from Chrome
    """
    cmd = message.get('cmd')
    
    if cmd == 'set':
        pat = message.get('pat')
        if not pat:
            send_message({
                "status": "error",
                "error": "Missing 'pat' field in set command"
            })
            return
        handle_set_command(pat)
        
    elif cmd == 'get':
        handle_get_command()
        
    elif cmd == 'remove':
        handle_remove_command()
        
    elif cmd == 'health':
        handle_health_command()
        
    else:
        send_message({
            "status": "error",
            "error": f"Unknown command: {cmd}",
            "supported_commands": ["set", "get", "remove", "health"]
        })
        logging.warning(f"Unknown command received: {cmd}")


def main() -> None:
    """
    Main loop - read messages from stdin and process them.
    """
    logging.info(f"Native host started (version {VERSION})")
    
    try:
        while True:
            message = read_message()
            
            if message is None:
                # EOF or error - exit gracefully
                break
            
            handle_message(message)
            
    except KeyboardInterrupt:
        logging.info("Native host stopped by user")
    except Exception as e:
        logging.error(f"Unexpected error: {str(e)}")
    finally:
        logging.info("Native host exiting")


if __name__ == '__main__':
    main()
