"""
HTML views for mc-webui
"""

import logging
from flask import Blueprint, render_template
from app.config import config

logger = logging.getLogger(__name__)

views_bp = Blueprint('views', __name__)


@views_bp.route('/')
def index():
    """
    Main chat view - displays message list and send form.
    """
    return render_template(
        'index.html',
        device_name=config.MC_DEVICE_NAME,
        refresh_interval=config.MC_REFRESH_INTERVAL
    )


@views_bp.route('/health')
def health():
    """
    Health check endpoint for monitoring.
    """
    return 'OK', 200
