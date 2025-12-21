"""
Configuration module - loads settings from environment variables
"""

import os
from pathlib import Path


class Config:
    """Application configuration from environment variables"""

    # MeshCore device configuration
    MC_SERIAL_PORT = os.getenv('MC_SERIAL_PORT', '/dev/ttyUSB0')
    MC_DEVICE_NAME = os.getenv('MC_DEVICE_NAME', 'MeshCore')
    MC_CONFIG_DIR = os.getenv('MC_CONFIG_DIR', '/root/.config/meshcore')

    # Application settings
    MC_REFRESH_INTERVAL = int(os.getenv('MC_REFRESH_INTERVAL', '60'))
    MC_INACTIVE_HOURS = int(os.getenv('MC_INACTIVE_HOURS', '48'))

    # Archive configuration
    MC_ARCHIVE_DIR = os.getenv('MC_ARCHIVE_DIR', '/root/.archive/meshcore')
    MC_ARCHIVE_ENABLED = os.getenv('MC_ARCHIVE_ENABLED', 'true').lower() == 'true'
    MC_ARCHIVE_RETENTION_DAYS = int(os.getenv('MC_ARCHIVE_RETENTION_DAYS', '7'))

    # Flask server configuration
    FLASK_HOST = os.getenv('FLASK_HOST', '0.0.0.0')
    FLASK_PORT = int(os.getenv('FLASK_PORT', '5000'))
    FLASK_DEBUG = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'

    # Derived paths
    @property
    def msgs_file_path(self) -> Path:
        """Get the full path to the .msgs file"""
        return Path(self.MC_CONFIG_DIR) / f"{self.MC_DEVICE_NAME}.msgs"

    @property
    def meshcli_command(self) -> list:
        """Get the base meshcli command with serial port"""
        return ['meshcli', '-s', self.MC_SERIAL_PORT]

    @property
    def archive_dir_path(self) -> Path:
        """Get the full path to archive directory"""
        return Path(self.MC_ARCHIVE_DIR)

    def __repr__(self):
        return (
            f"Config(device={self.MC_DEVICE_NAME}, "
            f"port={self.MC_SERIAL_PORT}, "
            f"config_dir={self.MC_CONFIG_DIR})"
        )


# Global config instance
config = Config()
