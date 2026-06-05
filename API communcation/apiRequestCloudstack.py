import base64
import hashlib
import hmac
import json
from pathlib import Path
from urllib.parse import urlencode

import requests
from cryptography.fernet import Fernet, InvalidToken


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PROJECT_ROOT / "config.json"
KEY_PATH = PROJECT_ROOT / ".netwerk_tool.key"


def load_config(config_path=CONFIG_PATH):
    raw_text = Path(config_path).read_text(encoding="utf-8")
    data = json.loads(raw_text)
    if not isinstance(data, dict):
        raise ValueError("config.json moet een JSON object bevatten.")
    return data


def decrypt_secret(encrypted_secret, key_path=KEY_PATH):
    secret_value = (encrypted_secret or "").strip()
    if not secret_value:
        return ""

    key_file = Path(key_path)
    if not key_file.exists():
        raise FileNotFoundError(f"Key bestand niet gevonden: {key_file}")

    fernet = Fernet(key_file.read_bytes().strip())
    try:
        return fernet.decrypt(secret_value.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError) as exc:
        raise ValueError("Secret in config.json kon niet ontsleuteld worden met .netwerk_tool.key") from exc


def build_base_url(host_ip, port, use_https=False):
    host_value = (host_ip or "").strip()
    port_value = str(port or "").strip()

    if not host_value:
        raise ValueError("hostIp ontbreekt in config.json")

    scheme = "https" if bool(use_https) else "http"
    host = f"{scheme}://{host_value}" if not host_value.startswith(("http://", "https://")) else host_value.rstrip("/")

    if port_value and f":{port_value}" not in host:
        host = f"{host}:{port_value}"

    return f"{host}/client/api"


def build_params(command, api_key, extra_params=None):
    params = {
        "command": command,
        "apikey": api_key,
        "response": "json",
    }

    if isinstance(extra_params, dict):
        for key, value in extra_params.items():
            if value is not None:
                params[key] = str(value)

    return params


def sign_request(params, secret):
    sorted_items = sorted(params.items(), key=lambda x: x[0])
    canonical = urlencode(sorted_items, doseq=True)
    digest = hmac.new(
        secret.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha1
    ).digest()
    return base64.b64encode(digest).decode("utf-8")


def build_url(base_url, params):
    return f"{base_url}?{urlencode(params, doseq=True)}"


def send_request(url, timeout=30):
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    return response.json()


def _extract_collection(payload, keys):
    if not isinstance(payload, dict):
        return []

    current = payload
    if len(current) == 1:
        sole_value = next(iter(current.values()))
        if isinstance(sole_value, dict):
            current = sole_value

    for key in keys:
        value = current.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    return []


def list_virtual_machines(config_path=CONFIG_PATH, key_path=KEY_PATH, timeout=30):
    response = request_cloudstack("listVirtualMachines", config_path=config_path, key_path=key_path, timeout=timeout)
    return _extract_collection(response, ("virtualmachine", "virtualmachines"))


def list_nics(vm_id, config_path=CONFIG_PATH, key_path=KEY_PATH, timeout=30):
    response = request_cloudstack(
        "listNics",
        extra_params={"vmid": vm_id},
        config_path=config_path,
        key_path=key_path,
        timeout=timeout,
    )
    return _extract_collection(response, ("nic", "nics"))


def list_networks(config_path=CONFIG_PATH, key_path=KEY_PATH, timeout=30):
    response = request_cloudstack("listNetworks", config_path=config_path, key_path=key_path, timeout=timeout)
    return _extract_collection(response, ("network", "networks"))


def request_cloudstack(command, extra_params=None, config_path=CONFIG_PATH, key_path=KEY_PATH, timeout=30):
    config = load_config(config_path)
    api_key = (config.get("apiKey") or "").strip()
    encrypted_secret = config.get("secret", "")

    if not api_key:
        raise ValueError("apiKey ontbreekt in config.json")

    secret = decrypt_secret(encrypted_secret, key_path)
    if not secret:
        raise ValueError("Secret ontbreekt of kon niet worden ontsleuteld")

    base_url = build_base_url(config.get("hostIp", ""), config.get("port", ""), config.get("useHttps", False))
    params = build_params(command, api_key, extra_params=extra_params)
    params["signature"] = sign_request(params, secret)
    url = build_url(base_url, params)
    return send_request(url, timeout=timeout)