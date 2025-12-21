"""
mc-webui - Flask application entry point
"""

import logging
from flask import Flask
from app.config import config
from app.routes.views import views_bp
from app.routes.api import api_bp
from app.archiver.manager import schedule_daily_archiving

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if config.FLASK_DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


def create_app():
    """Create and configure Flask application"""
    app = Flask(__name__)

    # Load configuration
    app.config['DEBUG'] = config.FLASK_DEBUG
    app.config['SECRET_KEY'] = 'mc-webui-secret-key-change-in-production'

    # Register blueprints
    app.register_blueprint(views_bp)
    app.register_blueprint(api_bp)

    # Initialize archive scheduler if enabled
    if config.MC_ARCHIVE_ENABLED:
        schedule_daily_archiving()
        logger.info(f"Archive scheduler enabled - directory: {config.MC_ARCHIVE_DIR}")
    else:
        logger.info("Archive scheduler disabled")

    logger.info(f"mc-webui started - device: {config.MC_DEVICE_NAME}")
    logger.info(f"Messages file: {config.msgs_file_path}")
    logger.info(f"Serial port: {config.MC_SERIAL_PORT}")

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(
        host=config.FLASK_HOST,
        port=config.FLASK_PORT,
        debug=config.FLASK_DEBUG
    )
