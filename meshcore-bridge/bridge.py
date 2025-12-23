"""
MeshCore Bridge - HTTP API wrapper for meshcli subprocess calls

This service runs as a separate container with exclusive USB device access.
The main mc-webui container communicates with this bridge via HTTP.
"""

import os
import subprocess
import logging
import threading
import time
from flask import Flask, request, jsonify

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration
MC_SERIAL_PORT = os.getenv('MC_SERIAL_PORT', '/dev/ttyUSB0')
DEFAULT_TIMEOUT = 10  # Reduced from 30s to 10s
RECV_TIMEOUT = 60

# Thread lock to prevent concurrent meshcli calls
# Only one meshcli command can execute at a time to avoid USB conflicts
meshcli_lock = threading.Lock()
lock_wait_timeout = 15  # Max time to wait for lock

def run_meshcli_command(args, timeout=DEFAULT_TIMEOUT):
    """
    Execute meshcli command via subprocess with locking.

    Uses a thread lock to ensure only one meshcli command runs at a time,
    preventing USB port conflicts and protocol errors.

    Args:
        args: List of command arguments
        timeout: Command timeout in seconds

    Returns:
        Dict with success, stdout, stderr
    """
    full_command = ['meshcli', '-s', MC_SERIAL_PORT] + args

    logger.info(f"Waiting for lock to execute: {' '.join(full_command)}")

    # Try to acquire lock with timeout
    lock_acquired = meshcli_lock.acquire(timeout=lock_wait_timeout)

    if not lock_acquired:
        logger.error(f"Failed to acquire lock after {lock_wait_timeout}s - another command is running")
        return {
            'success': False,
            'stdout': '',
            'stderr': f'Another meshcli command is already running (timeout after {lock_wait_timeout}s)',
            'returncode': -1
        }

    try:
        logger.info(f"Lock acquired, executing: {' '.join(full_command)}")

        result = subprocess.run(
            full_command,
            capture_output=True,
            text=True,
            timeout=timeout
        )

        success = result.returncode == 0

        if not success:
            logger.warning(f"Command failed with code {result.returncode}: {result.stderr}")
        else:
            logger.info(f"Command completed successfully")

        return {
            'success': success,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        }

    except subprocess.TimeoutExpired:
        logger.error(f"Command timeout after {timeout}s")
        return {
            'success': False,
            'stdout': '',
            'stderr': f'Command timeout after {timeout} seconds',
            'returncode': -1
        }
    except Exception as e:
        logger.error(f"Command execution error: {e}")
        return {
            'success': False,
            'stdout': '',
            'stderr': str(e),
            'returncode': -1
        }
    finally:
        # Always release lock
        meshcli_lock.release()
        logger.info("Lock released")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'serial_port': MC_SERIAL_PORT
    }), 200


@app.route('/cli', methods=['POST'])
def execute_cli():
    """
    Execute meshcli command.

    Request JSON:
        {
            "args": ["recv"],
            "timeout": 60  (optional)
        }

    Response JSON:
        {
            "success": true,
            "stdout": "...",
            "stderr": "...",
            "returncode": 0
        }
    """
    try:
        data = request.get_json()

        if not data or 'args' not in data:
            return jsonify({
                'success': False,
                'stdout': '',
                'stderr': 'Missing required field: args',
                'returncode': -1
            }), 400

        args = data['args']
        timeout = data.get('timeout', DEFAULT_TIMEOUT)

        # Special handling for recv command (longer timeout)
        if args and args[0] == 'recv':
            timeout = data.get('timeout', RECV_TIMEOUT)

        if not isinstance(args, list):
            return jsonify({
                'success': False,
                'stdout': '',
                'stderr': 'args must be a list',
                'returncode': -1
            }), 400

        result = run_meshcli_command(args, timeout)

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"API error: {e}")
        return jsonify({
            'success': False,
            'stdout': '',
            'stderr': str(e),
            'returncode': -1
        }), 500


if __name__ == '__main__':
    logger.info(f"Starting MeshCore Bridge on port 5001")
    logger.info(f"Serial port: {MC_SERIAL_PORT}")

    # Run on all interfaces to allow Docker network access
    app.run(host='0.0.0.0', port=5001, debug=False)
