import json
import os
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, url_for
from cryptography.fernet import Fernet, InvalidToken

from core.core import get_network_visualizer_core


PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
CONFIG_PATH = PROJECT_ROOT / "config.json"
SECRET_KEY_PATH = PROJECT_ROOT / ".netwerk_tool.key"

DEFAULT_CONFIG = {
    "hypervisor": "",
    "hostIp": "",
    "port": "",
    "useHttps": False,
    "apiKey": "",
    "secret": "",
}


def _load_raw_config():
    try:
        raw_config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

    return raw_config if isinstance(raw_config, dict) else {}


def _get_fernet():
    if SECRET_KEY_PATH.exists():
        key = SECRET_KEY_PATH.read_bytes().strip()
    else:
        key = Fernet.generate_key()
        SECRET_KEY_PATH.write_bytes(key)

    return Fernet(key)


def _encrypt_secret(secret_value):
    secret_value = (secret_value or '').strip()
    if not secret_value:
        return ''

    return _get_fernet().encrypt(secret_value.encode('utf-8')).decode('utf-8')


def _decrypt_secret(secret_value):
    secret_value = (secret_value or '').strip()
    if not secret_value:
        return ''

    try:
        return _get_fernet().decrypt(secret_value.encode('utf-8')).decode('utf-8')
    except (InvalidToken, ValueError, TypeError):
        return ''


def load_config():
    config = {**DEFAULT_CONFIG}

    raw_config = _load_raw_config()

    for key in ("hypervisor", "hostIp", "port", "apiKey"):
        value = raw_config.get(key, DEFAULT_CONFIG[key])
        config[key] = "" if value is None else str(value)

    raw_use_https = raw_config.get("useHttps", DEFAULT_CONFIG["useHttps"])
    if isinstance(raw_use_https, bool):
        config["useHttps"] = raw_use_https
    elif isinstance(raw_use_https, str):
        config["useHttps"] = raw_use_https.strip().lower() in {"1", "true", "yes", "on"}
    else:
        config["useHttps"] = bool(raw_use_https)

    config["secret"] = ""
    config["secretStored"] = bool(raw_config.get("secret"))
    return config


def save_config(payload):
    config = {**DEFAULT_CONFIG}
    raw_config = _load_raw_config()

    if isinstance(payload, dict):
        for key in ("hypervisor", "hostIp", "port", "apiKey"):
            value = payload.get(key, DEFAULT_CONFIG[key])
            config[key] = "" if value is None else str(value)

        use_https_value = payload.get("useHttps", DEFAULT_CONFIG["useHttps"])
        if isinstance(use_https_value, bool):
            config["useHttps"] = use_https_value
        elif isinstance(use_https_value, str):
            config["useHttps"] = use_https_value.strip().lower() in {"1", "true", "yes", "on"}
        else:
            config["useHttps"] = bool(use_https_value)

        secret_value = payload.get("secret", "")
        if isinstance(secret_value, str) and secret_value.strip():
            config["secret"] = _encrypt_secret(secret_value.strip())
        else:
            config["secret"] = raw_config.get("secret", "")

    CONFIG_PATH.write_text(json.dumps(config, indent=4) + "\n", encoding="utf-8")
    return config


def render_page(template_name, title):
    return render_template(
        template_name,
        title=title,
        config=load_config(),
        active_page=title.lower(),
    )


def create_app():
    app = Flask(
        __name__,
        template_folder=str(FRONTEND_DIR / "template"),
        static_folder=str(FRONTEND_DIR / "template"),
        static_url_path="/static",
    )

    @app.route("/")
    def index():
        return redirect(url_for("home"))

    @app.route("/home")
    def home():
        return render_page("home.html", "home")

    @app.route("/canvas")
    def canvas():
        return render_page("canvas.html", "canvas")

    @app.route("/settings")
    def settings():
        return render_page("settings.html", "settings")

    @app.route("/api/network-graph")
    def network_graph():
        runtime = get_network_visualizer_core()
        snapshot = runtime.get_snapshot()
        return jsonify(snapshot)

    @app.route("/settings", methods=["POST"])
    def update_settings():
        payload = request.get_json(silent=True) or {}
        config = save_config(payload)
        return jsonify({"ok": True, "config": config})

    return app


app = create_app()


def start_app(host="0.0.0.0", port=8080, debug=True):
    if not debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        get_network_visualizer_core().start()

    app.run(host=host, port=port, debug=debug)