#!/usr/bin/env python3
"""
AI Job Hunter Dashboard — Standalone Launcher
=============================================
Runs ai_job_hunter_dashboard.html as a native desktop window.
Reads API keys and webhook URLs from config.json (next to the .exe).

Requirements (install once):
    pip install pywebview

Usage:
    python launch_dashboard.py
    python launch_dashboard.py --file /path/to/ai_job_hunter_dashboard.html
    python launch_dashboard.py --width 1400 --height 900
"""

import argparse
import datetime
import json
import os
import sys
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse


# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
try:
    import webview
except ImportError:
    print(
        "\n[ERROR] pywebview is not installed.\n"
        "Install it with:\n\n"
        "    pip install pywebview\n\n"
        "On Linux you may also need one of these GUI back-ends:\n"
        "    pip install pywebview[gtk]   # GTK / GNOME\n"
        "    pip install pywebview[qt]    # Qt5/Qt6\n"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Config loader
# ---------------------------------------------------------------------------

CONFIG_KEYS = ("gemini_api_key", "gdrive_webhook", "export_webhook", "html_path")


def exe_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def load_config() -> dict:
    config_path = os.path.join(exe_dir(), "config.json")
    if not os.path.isfile(config_path):
        print(f"[INFO] No config.json found at {config_path} — using page defaults.")
        return {}
    try:
        with open(config_path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except json.JSONDecodeError as exc:
        print(f"[WARN] config.json is not valid JSON ({exc}) — using page defaults.")
        return {}
    config = {k: raw[k] for k in CONFIG_KEYS if k in raw and str(raw[k]).strip()}
    print(f"[INFO] Config loaded. Keys found: {', '.join(config.keys()) or '(none)'}")
    return config


# ---------------------------------------------------------------------------
# Logger API — exposes file logging to frontend JS via pywebview's js_api
# ---------------------------------------------------------------------------

class LoggerAPI:
    """Mounts onto window.pywebview.api so JS can write error logs to disk."""

    def write_error_log(self, log_title, exception_msg, technical_payload):
        try:
            logs_dir = os.path.join(exe_dir(), "logs")
            os.makedirs(logs_dir, exist_ok=True)

            timestamp  = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            safe_title = "".join(
                c for c in log_title if c.isalnum() or c in (" ", "_", "-")
            ).strip().replace(" ", "_")

            filename  = f"error_{timestamp}_{safe_title}.txt"
            log_path  = os.path.join(logs_dir, filename)

            with open(log_path, "w", encoding="utf-8") as fh:
                fh.write("=" * 60 + "\n")
                fh.write("AI JOB HUNTER — PIPELINE EXCEPTION LOG\n")
                fh.write("=" * 60 + "\n")
                fh.write(f"Timestamp      : {datetime.datetime.now().isoformat()}\n")
                fh.write(f"Error Domain   : {log_title}\n")
                fh.write(f"Exception Type : {exception_msg}\n")
                fh.write("-" * 60 + "\n")
                fh.write("TECHNICAL DEBUG CONTEXT / RESPONSE PAYLOAD:\n")
                fh.write("-" * 60 + "\n")
                fh.write(str(technical_payload))
                fh.write("\n" + "=" * 60 + "\n")

            print(f"[INFO] Error log written to: {log_path}")
            return True
        except Exception as err:
            print(f"[ERROR] Failed to write error log: {err}")
            return False


# ---------------------------------------------------------------------------
# Script builder
# ---------------------------------------------------------------------------

def build_config_script(config: dict) -> str:
    """
    Build a JS snippet that:
    - Writes webhook values into localStorage (before window.onload reads them)
    - Wraps window.fetch to substitute the Gemini API key on outgoing requests
    """
    if not config:
        return ""

    lines = ["(function () {"]

    for cfg_key, ls_key in [("gdrive_webhook", "gdrive_webhook"),
                             ("export_webhook",  "export_webhook")]:
        if cfg_key in config:
            lines.append(
                f"  localStorage.setItem({json.dumps(ls_key)}, {json.dumps(config[cfg_key])});"
            )

    if "gemini_api_key" in config:
        key = json.dumps(config["gemini_api_key"])
        base = json.dumps("https://generativelanguage.googleapis.com")
        lines += [
            f"  var _k = {key}, _b = {base}, _f = window.fetch.bind(window);",
            "  window.fetch = function (url, opts) {",
            "    if (typeof url === 'string' && url.indexOf(_b) === 0) {",
            "      url = url.indexOf('key=') !== -1",
            "        ? url.replace(/([?&]key=)[^&]*/, '$1' + _k)",
            "        : url + (url.indexOf('?') === -1 ? '?' : '&') + 'key=' + _k;",
            "    }",
            "    return _f(url, opts);",
            "  };",
        ]

    lines += [
        "  console.log('[config] Script executed. localStorage state:');",
        "  console.log('[config] gdrive_webhook =', localStorage.getItem('gdrive_webhook'));",
        "  console.log('[config] export_webhook =', localStorage.getItem('export_webhook'));",
        "  console.log('[config] fetch wrapper installed:', window.fetch.toString().indexOf('_k') !== -1);",
    ]
    lines.append("}());")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Local HTTP server — serves the HTML with config script injected
# ---------------------------------------------------------------------------

class DashboardHandler(BaseHTTPRequestHandler):
    """Serves the HTML file with config injected, and all other files normally."""

    html_dir   = ""
    html_file  = ""
    config_js  = ""

    def log_message(self, fmt, *args):
        print(f"[SERVER] {self.address_string()} - {fmt % args}")

    def do_GET(self):
        path = urlparse(self.path).path

        # Serve the main HTML with injected config
        if path in ("/", "/index.html", "/" + os.path.basename(self.html_file)):
            try:
                with open(self.html_file, "r", encoding="utf-8") as fh:
                    html = fh.read()
                if self.config_js:
                    tag = f"<script>\n{self.config_js}\n</script>"
                    # Inject immediately after <body ...>
                    idx = html.lower().find("<body")
                    if idx != -1:
                        close = html.find(">", idx) + 1
                        html  = html[:close] + "\n" + tag + "\n" + html[close:]
                        print(f"[SERVER] Config script injected ({len(self.config_js)} chars) after position {close}")
                    else:
                        print("[SERVER] WARNING: <body> tag not found — injection skipped!")
                body = html.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type",   "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as exc:
                self.send_error(500, str(exc))
            return

        # Serve any other file in the same directory (CSS, JS, images, etc.)
        file_path = os.path.join(self.html_dir, path.lstrip("/"))
        if os.path.isfile(file_path):
            ext  = os.path.splitext(file_path)[1].lower()
            mime = {
                ".js":   "application/javascript",
                ".css":  "text/css",
                ".png":  "image/png",
                ".jpg":  "image/jpeg",
                ".svg":  "image/svg+xml",
                ".ico":  "image/x-icon",
            }.get(ext, "application/octet-stream")
            with open(file_path, "rb") as fh:
                body = fh.read()
            self.send_response(200)
            self.send_header("Content-Type",   mime)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)


def start_server(html_path: str, config_js: str) -> str:
    """Start a local HTTP server on a random free port. Returns the URL."""
    DashboardHandler.html_dir  = os.path.dirname(html_path)
    DashboardHandler.html_file = html_path
    DashboardHandler.config_js = config_js

    server = HTTPServer(("127.0.0.1", 0), DashboardHandler)
    port   = server.server_address[1]

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    fname = os.path.basename(html_path)
    url   = f"http://127.0.0.1:{port}/{fname}"
    print(f"[INFO] Local server running at {url}")
    return url


# ---------------------------------------------------------------------------
# Path resolver
# ---------------------------------------------------------------------------

def resolve_html_path(cli_path, config: dict) -> str:
    candidates = []

    if cli_path:
        candidates.append(os.path.abspath(cli_path))

    if config.get("html_path"):
        candidates.append(os.path.abspath(config["html_path"]))

    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        candidates.append(
            os.path.join(sys._MEIPASS, "src", "index.html")
        )

    candidates.append(os.path.join(exe_dir(), "index.html"))
    candidates.append(os.path.join(os.getcwd(), "index.html"))

    for path in candidates:
        if os.path.isfile(path):
            label = " (from config.json)" if config.get("html_path") and \
                    path == os.path.abspath(config["html_path"]) else ""
            print(f"[INFO] Using HTML: {path}{label}")
            return path

    searched = "\n  ".join(dict.fromkeys(candidates))
    print(
        f"\n[ERROR] Could not find ai_job_hunter_dashboard.html.\n"
        f"Searched:\n  {searched}\n\n"
        "Place index.html next to this script in src/, pass --file <path>,\n"
        "or set 'html_path' in config.json.\n"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Launch the AI Job Hunter dashboard as a desktop app."
    )
    parser.add_argument("--file", "-f", metavar="PATH",
        help="Path to ai_job_hunter_dashboard.html")
    parser.add_argument("--width",  "-W", type=int, default=1280)
    parser.add_argument("--height", "-H", type=int, default=800)
    parser.add_argument("--no-resizable", action="store_true")
    parser.add_argument("--debug", action="store_true",
        help="Enable browser DevTools")
    args = parser.parse_args()

    config    = load_config()
    html_path = resolve_html_path(args.file, config)

    print(f"[INFO] Window: {args.width}x{args.height}")

    # Build the config script and serve via local HTTP so that:
    # 1. External resources (Tailwind CDN, fetch calls) work normally
    # 2. The config script is injected BEFORE window.onload fires
    config_js = build_config_script(config)
    url       = start_server(html_path, config_js)

    window = webview.create_window(
        title="AI Job Hunter Dashboard",
        url=url,
        width=args.width,
        height=args.height,
        resizable=not args.no_resizable,
        min_size=(800, 600),
        js_api=LoggerAPI(),
    )

    webview.start(debug=args.debug)


if __name__ == "__main__":
    main()