"""
MeshCore CLI wrapper - executes meshcli commands via subprocess
"""

import subprocess
import logging
from typing import Tuple, Optional
from app.config import config

logger = logging.getLogger(__name__)

# Command timeout in seconds
DEFAULT_TIMEOUT = 30
RECV_TIMEOUT = 60  # recv can take longer


class MeshCLIError(Exception):
    """Custom exception for meshcli command failures"""
    pass


def _run_command(args: list, timeout: int = DEFAULT_TIMEOUT) -> Tuple[bool, str, str]:
    """
    Execute a meshcli command and return result.

    Args:
        args: Command arguments (will be prepended with meshcli -s <port>)
        timeout: Command timeout in seconds

    Returns:
        Tuple of (success, stdout, stderr)
    """
    cmd = config.meshcli_command + args
    logger.info(f"Executing: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False
        )

        success = result.returncode == 0
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()

        if not success:
            logger.warning(f"Command failed: {stderr or stdout}")

        return success, stdout, stderr

    except subprocess.TimeoutExpired:
        logger.error(f"Command timeout after {timeout}s: {' '.join(cmd)}")
        return False, "", f"Command timeout after {timeout}s"

    except FileNotFoundError:
        logger.error("meshcli command not found")
        return False, "", "meshcli not found - is meshcore-cli installed?"

    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return False, "", str(e)


def recv_messages() -> Tuple[bool, str]:
    """
    Fetch new messages from the device.

    Returns:
        Tuple of (success, message)
    """
    success, stdout, stderr = _run_command(['recv'], timeout=RECV_TIMEOUT)
    return success, stdout or stderr


def send_message(text: str, reply_to: Optional[str] = None) -> Tuple[bool, str]:
    """
    Send a message to the Public channel.

    Args:
        text: Message content
        reply_to: Optional username to reply to (will format as @[username])

    Returns:
        Tuple of (success, message)
    """
    if reply_to:
        message = f"@[{reply_to}] {text}"
    else:
        message = text

    success, stdout, stderr = _run_command(['public', message])
    return success, stdout or stderr


def get_contacts() -> Tuple[bool, str]:
    """
    Get list of contacts from the device.

    Returns:
        Tuple of (success, output)
    """
    success, stdout, stderr = _run_command(['contacts'])
    return success, stdout or stderr


def clean_inactive_contacts(hours: int = 48) -> Tuple[bool, str]:
    """
    Remove contacts inactive for specified hours.

    Args:
        hours: Inactivity threshold in hours

    Returns:
        Tuple of (success, message)
    """
    # Command format: apply_to u<48h,t=1 remove_contact
    # u<48h = updated less than 48h ago (inactive)
    # t=1 = type client (not router/repeater)
    filter_cmd = f"u<{hours}h,t=1"
    success, stdout, stderr = _run_command(['apply_to', filter_cmd, 'remove_contact'])
    return success, stdout or stderr


def get_device_info() -> Tuple[bool, str]:
    """
    Get device information.

    Returns:
        Tuple of (success, info)
    """
    success, stdout, stderr = _run_command(['infos'])
    return success, stdout or stderr


def check_connection() -> bool:
    """
    Quick check if device is accessible.

    Returns:
        True if device responds, False otherwise
    """
    success, _, _ = _run_command(['infos'], timeout=5)
    return success
