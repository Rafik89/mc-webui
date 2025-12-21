"""
Archive manager - handles message archiving and scheduling
"""

import os
import shutil
import logging
from pathlib import Path
from datetime import datetime, time
from typing import List, Dict, Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import config

logger = logging.getLogger(__name__)

# Global scheduler instance
_scheduler: Optional[BackgroundScheduler] = None


def get_archive_path(archive_date: str) -> Path:
    """
    Get the path to an archive file for a specific date.

    Args:
        archive_date: Date in YYYY-MM-DD format

    Returns:
        Path to archive file
    """
    archive_dir = config.archive_dir_path
    filename = f"{config.MC_DEVICE_NAME}.{archive_date}.msgs"
    return archive_dir / filename


def archive_messages(archive_date: Optional[str] = None) -> Dict[str, any]:
    """
    Archive messages for a specific date by copying the .msgs file.

    Args:
        archive_date: Date to archive in YYYY-MM-DD format.
                     If None, uses yesterday's date.

    Returns:
        Dict with success status and details
    """
    try:
        # Determine date to archive
        if archive_date is None:
            from datetime import date, timedelta
            yesterday = date.today() - timedelta(days=1)
            archive_date = yesterday.strftime('%Y-%m-%d')

        # Validate date format
        try:
            datetime.strptime(archive_date, '%Y-%m-%d')
        except ValueError:
            return {
                'success': False,
                'error': f'Invalid date format: {archive_date}. Expected YYYY-MM-DD'
            }

        # Ensure archive directory exists
        archive_dir = config.archive_dir_path
        archive_dir.mkdir(parents=True, exist_ok=True)

        # Get source .msgs file
        source_file = config.msgs_file_path
        if not source_file.exists():
            logger.warning(f"Source messages file not found: {source_file}")
            return {
                'success': False,
                'error': f'Messages file not found: {source_file}'
            }

        # Get destination archive file
        dest_file = get_archive_path(archive_date)

        # Check if archive already exists
        if dest_file.exists():
            logger.info(f"Archive already exists: {dest_file}")
            return {
                'success': True,
                'message': f'Archive already exists for {archive_date}',
                'archive_file': str(dest_file),
                'exists': True
            }

        # Copy the file
        shutil.copy2(source_file, dest_file)

        # Get file size
        file_size = dest_file.stat().st_size

        logger.info(f"Archived messages to {dest_file} ({file_size} bytes)")

        return {
            'success': True,
            'message': f'Successfully archived messages for {archive_date}',
            'archive_file': str(dest_file),
            'file_size': file_size,
            'archive_date': archive_date
        }

    except Exception as e:
        logger.error(f"Error archiving messages: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


def list_archives() -> List[Dict]:
    """
    List all available archive files with metadata.

    Returns:
        List of archive info dicts, sorted by date (newest first)
    """
    archives = []

    try:
        archive_dir = config.archive_dir_path

        # Check if archive directory exists
        if not archive_dir.exists():
            logger.info(f"Archive directory does not exist: {archive_dir}")
            return []

        # Pattern: {device_name}.YYYY-MM-DD.msgs
        pattern = f"{config.MC_DEVICE_NAME}.*.msgs"

        for archive_file in archive_dir.glob(pattern):
            try:
                # Extract date from filename
                # Format: DeviceName.YYYY-MM-DD.msgs
                filename = archive_file.name
                date_part = filename.replace(f"{config.MC_DEVICE_NAME}.", "").replace(".msgs", "")

                # Validate date format
                try:
                    datetime.strptime(date_part, '%Y-%m-%d')
                except ValueError:
                    logger.warning(f"Invalid archive filename format: {filename}")
                    continue

                # Get file stats
                stats = archive_file.stat()
                file_size = stats.st_size

                # Count messages (read file)
                message_count = _count_messages_in_file(archive_file)

                archives.append({
                    'date': date_part,
                    'file_size': file_size,
                    'message_count': message_count,
                    'file_path': str(archive_file)
                })

            except Exception as e:
                logger.warning(f"Error processing archive file {archive_file}: {e}")
                continue

        # Sort by date, newest first
        archives.sort(key=lambda x: x['date'], reverse=True)

        logger.info(f"Found {len(archives)} archive files")

    except Exception as e:
        logger.error(f"Error listing archives: {e}", exc_info=True)

    return archives


def _count_messages_in_file(file_path: Path) -> int:
    """
    Count the number of valid message lines in a file.

    Args:
        file_path: Path to the .msgs file

    Returns:
        Number of messages
    """
    import json

    count = 0
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    # Only count Public channel messages
                    if data.get('channel_idx', 0) == 0 and data.get('type') in ['CHAN', 'SENT_CHAN']:
                        count += 1
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        logger.warning(f"Error counting messages in {file_path}: {e}")

    return count


def _archive_job():
    """
    Background job that runs daily to archive messages.
    This is called by the scheduler at midnight.
    """
    logger.info("Running daily archive job...")

    if not config.MC_ARCHIVE_ENABLED:
        logger.info("Archiving is disabled, skipping")
        return

    result = archive_messages()

    if result['success']:
        logger.info(f"Archive job completed: {result.get('message', 'Success')}")
    else:
        logger.error(f"Archive job failed: {result.get('error', 'Unknown error')}")


def schedule_daily_archiving():
    """
    Initialize and start the background scheduler for daily archiving.
    Runs at midnight (00:00) local time.
    """
    global _scheduler

    if not config.MC_ARCHIVE_ENABLED:
        logger.info("Archiving is disabled in configuration")
        return

    if _scheduler is not None:
        logger.warning("Scheduler already initialized")
        return

    try:
        _scheduler = BackgroundScheduler(
            daemon=True,
            timezone='UTC'  # Use UTC for consistency
        )

        # Schedule job for midnight every day
        trigger = CronTrigger(hour=0, minute=0)

        _scheduler.add_job(
            func=_archive_job,
            trigger=trigger,
            id='daily_archive',
            name='Daily Message Archive',
            replace_existing=True
        )

        _scheduler.start()

        logger.info("Archive scheduler started - will run daily at 00:00 UTC")

    except Exception as e:
        logger.error(f"Failed to start archive scheduler: {e}", exc_info=True)


def stop_scheduler():
    """
    Stop the background scheduler.
    Called during application shutdown.
    """
    global _scheduler

    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
            logger.info("Archive scheduler stopped")
        except Exception as e:
            logger.error(f"Error stopping scheduler: {e}")
        finally:
            _scheduler = None
