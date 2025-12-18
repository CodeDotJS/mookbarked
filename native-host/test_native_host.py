#!/usr/bin/env python3
"""
Test script for native messaging host.
Tests all commands without requiring Chrome.
"""

import subprocess
import json
import struct
import sys

def send_native_message(message):
    """Send a message to the native host and read response."""
    # Encode message
    encoded_content = json.dumps(message).encode('utf-8')
    encoded_length = struct.pack('I', len(encoded_content))
    
    # Start native host process
    process = subprocess.Popen(
        ['python3', 'native_host.py'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    # Send message
    process.stdin.write(encoded_length)
    process.stdin.write(encoded_content)
    process.stdin.flush()
    
    # Read response length
    response_length_bytes = process.stdout.read(4)
    if len(response_length_bytes) == 0:
        return None
    
    response_length = struct.unpack('I', response_length_bytes)[0]
    
    # Read response content
    response_content = process.stdout.read(response_length).decode('utf-8')
    
    # Close process
    process.stdin.close()
    process.wait()
    
    return json.loads(response_content)


def test_health():
    """Test health check command."""
    print("Testing health check...")
    response = send_native_message({"cmd": "health"})
    print(f"Response: {json.dumps(response, indent=2)}")
    assert response['status'] == 'success', "Health check failed"
    print("✓ Health check passed\n")


def test_set_get_remove():
    """Test set, get, and remove commands."""
    test_pat = "ghp_test_token_12345678901234567890"
    
    # Test SET
    print("Testing SET command...")
    response = send_native_message({"cmd": "set", "pat": test_pat})
    print(f"Response: {json.dumps(response, indent=2)}")
    assert response['status'] == 'success', "Set command failed"
    print("✓ SET passed\n")
    
    # Test GET
    print("Testing GET command...")
    response = send_native_message({"cmd": "get"})
    print(f"Response: {json.dumps(response, indent=2)}")
    assert response['status'] == 'success', "Get command failed"
    assert response['pat'] == test_pat, "Retrieved PAT doesn't match"
    print("✓ GET passed\n")
    
    # Test REMOVE
    print("Testing REMOVE command...")
    response = send_native_message({"cmd": "remove"})
    print(f"Response: {json.dumps(response, indent=2)}")
    assert response['status'] == 'success', "Remove command failed"
    print("✓ REMOVE passed\n")
    
    # Test GET after remove (should fail)
    print("Testing GET after REMOVE (should fail)...")
    response = send_native_message({"cmd": "get"})
    print(f"Response: {json.dumps(response, indent=2)}")
    assert response['status'] == 'error', "Get should fail after remove"
    print("✓ GET correctly fails after REMOVE\n")


def test_invalid_command():
    """Test handling of invalid command."""
    print("Testing invalid command...")
    response = send_native_message({"cmd": "invalid"})
    print(f"Response: {json.dumps(response, indent=2)}")
    assert response['status'] == 'error', "Should return error for invalid command"
    print("✓ Invalid command handled correctly\n")


def test_missing_pat():
    """Test SET command without PAT."""
    print("Testing SET without PAT...")
    response = send_native_message({"cmd": "set"})
    print(f"Response: {json.dumps(response, indent=2)}")
    assert response['status'] == 'error', "Should return error for missing PAT"
    print("✓ Missing PAT handled correctly\n")


if __name__ == '__main__':
    print("=" * 60)
    print("Native Host Test Suite")
    print("=" * 60 + "\n")
    
    try:
        test_health()
        test_set_get_remove()
        test_invalid_command()
        test_missing_pat()
        
        print("=" * 60)
        print("✓ All tests passed!")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        sys.exit(1)
