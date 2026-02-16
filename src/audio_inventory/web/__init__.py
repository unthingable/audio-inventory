"""Flask web UI for audio plugin inventory."""

from __future__ import annotations

from pathlib import Path

from flask import Flask

from audio_inventory.db import DEFAULT_DATA_PATH


def create_app(db_path: Path = DEFAULT_DATA_PATH) -> Flask:
    """Create and configure the Flask application."""
    app = Flask(
        __name__,
        template_folder=str(Path(__file__).parent / "templates"),
        static_folder=str(Path(__file__).parent / "static"),
    )
    app.config["DB_PATH"] = db_path

    from audio_inventory.web.routes import bp

    app.register_blueprint(bp)

    return app
