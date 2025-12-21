"""
Message parser - reads and parses .msgs file (JSON Lines format)
"""

import json
import logging
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
from app.config import config

logger = logging.getLogger(__name__)


def parse_message(line: Dict) -> Optional[Dict]:
    """
    Parse a single message line from .msgs file.

    Args:
        line: Raw JSON object from .msgs file

    Returns:
        Parsed message dict or None if not a valid chat message
    """
    msg_type = line.get('type')
    channel_idx = line.get('channel_idx', 0)

    # Only process Public channel (channel 0) messages
    if channel_idx != 0:
        return None

    # Only process CHAN (received) and SENT_CHAN (sent) messages
    if msg_type not in ['CHAN', 'SENT_CHAN']:
        return None

    timestamp = line.get('timestamp', 0)
    text = line.get('text', '').strip()

    if not text:
        return None

    # Determine if message is sent or received
    is_own = msg_type == 'SENT_CHAN'

    # Extract sender name
    if is_own:
        # For sent messages, use device name from config or 'name' field
        sender = line.get('name', config.MC_DEVICE_NAME)
        content = text
    else:
        # For received messages, extract sender from "SenderName: message" format
        if ':' in text:
            sender, content = text.split(':', 1)
            sender = sender.strip()
            content = content.strip()
        else:
            # Fallback if format is unexpected
            sender = "Unknown"
            content = text

    return {
        'sender': sender,
        'content': content,
        'timestamp': timestamp,
        'datetime': datetime.fromtimestamp(timestamp).isoformat() if timestamp > 0 else None,
        'is_own': is_own,
        'snr': line.get('SNR'),
        'path_len': line.get('path_len')
    }


def read_messages(limit: Optional[int] = None, offset: int = 0) -> List[Dict]:
    """
    Read and parse messages from .msgs file.

    Args:
        limit: Maximum number of messages to return (None = all)
        offset: Number of messages to skip from the end

    Returns:
        List of parsed message dictionaries, sorted by timestamp (oldest first)
    """
    msgs_file = config.msgs_file_path

    if not msgs_file.exists():
        logger.warning(f"Messages file not found: {msgs_file}")
        return []

    messages = []

    try:
        with open(msgs_file, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue

                try:
                    data = json.loads(line)
                    parsed = parse_message(data)
                    if parsed:
                        messages.append(parsed)
                except json.JSONDecodeError as e:
                    logger.warning(f"Invalid JSON at line {line_num}: {e}")
                    continue
                except Exception as e:
                    logger.error(f"Error parsing line {line_num}: {e}")
                    continue

    except FileNotFoundError:
        logger.error(f"Messages file not found: {msgs_file}")
        return []
    except Exception as e:
        logger.error(f"Error reading messages file: {e}")
        return []

    # Sort by timestamp (oldest first)
    messages.sort(key=lambda m: m['timestamp'])

    # Apply offset and limit
    if offset > 0:
        messages = messages[:-offset] if offset < len(messages) else []

    if limit is not None and limit > 0:
        messages = messages[-limit:]

    logger.info(f"Loaded {len(messages)} messages from {msgs_file}")
    return messages


def get_latest_message() -> Optional[Dict]:
    """
    Get the most recent message.

    Returns:
        Latest message dict or None if no messages
    """
    messages = read_messages(limit=1)
    return messages[0] if messages else None


def count_messages() -> int:
    """
    Count total number of messages in the file.

    Returns:
        Message count
    """
    return len(read_messages())
