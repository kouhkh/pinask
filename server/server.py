#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PinAsk HTTP：静态 demo + 标注 API。"""
from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
if sys.version_info < (3, 10):
    sys.exit("PinAsk needs Python 3.10+")
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server.store import get_item, list_items, save_batch, set_session, set_status  # noqa: E402


def load_config() -> dict[str, Any]:
    path = ROOT / "pinask.config.json"
    cfg = {
        "hotkey": "F9",
        "host": "127.0.0.1",
        "port": 8788,
        "dataDir": "data",
        "showHint": False,
        "endpoint": "/api/pinask",
    }
    if path.is_file():
        cfg.update(json.loads(path.read_text(encoding="utf-8")))
    return cfg


CFG = load_config()
DATA_DIR = (ROOT / str(CFG.get("dataDir") or "data")).resolve()
STATIC = {
    "/": ROOT / "demo" / "index.html",
    "/index.html": ROOT / "demo" / "index.html",
    "/status": ROOT / "demo" / "status.html",
    "/status.html": ROOT / "demo" / "status.html",
    "/status.css": ROOT / "demo" / "status.css",
    "/status.js": ROOT / "demo" / "status.js",
    "/overlay/pinask.js": ROOT / "overlay" / "pinask.js",
    "/overlay/pinask.css": ROOT / "overlay" / "pinask.css",
    "/pinask.config.json": ROOT / "pinask.config.json",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(code, body, "application/json; charset=utf-8")

    def _file(self, path: Path) -> None:
        if not path.is_file():
            self._json(404, {"ok": False, "error": "not found"})
            return
        suffix = path.suffix.lower()
        content_type = "application/octet-stream"
        if suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif suffix == ".js":
            content_type = "application/javascript; charset=utf-8"
        elif suffix == ".html":
            content_type = "text/html; charset=utf-8"
        elif suffix == ".json":
            content_type = "application/json; charset=utf-8"
        self._send(200, path.read_bytes(), content_type)

    def _body_json(self) -> dict[str, Any]:
        size = int(self.headers.get("Content-Length") or 0)
        if size <= 0 or size > 1_000_000:
            raise ValueError("请求内容为空或过大")
        value = json.loads(self.rfile.read(size).decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("请求必须是 JSON 对象")
        return value

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path in STATIC:
            self._file(STATIC[parsed.path])
            return
        if parsed.path == "/api/pinask":
            status = (query.get("status") or [""])[0] or None
            self._json(200, list_items(DATA_DIR, status))
            return
        if parsed.path.startswith("/api/pinask/"):
            parts = parsed.path.strip("/").split("/")
            item_id = parts[-1]
            if len(parts) == 4 and parts[-1] == "session":
                item_id = parts[-2]
            if len(parts) == 4 and parts[-1] == "session":
                # Session metadata is included in the normal item response;
                # this route exists for clients that prefer a focused lookup.
                try:
                    item = get_item(DATA_DIR, item_id)["item"]
                    self._json(200, {"ok": True, "session": item.get("session")})
                except FileNotFoundError as exc:
                    self._json(404, {"ok": False, "error": str(exc)})
                return
            try:
                self._json(200, get_item(DATA_DIR, item_id))
            except FileNotFoundError as exc:
                self._json(404, {"ok": False, "error": str(exc)})
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            payload = self._body_json()
            if parsed.path == "/api/pinask":
                self._json(200, save_batch(payload, DATA_DIR))
                return
            self._json(404, {"ok": False, "error": "not found"})
        except (ValueError, json.JSONDecodeError) as exc:
            self._json(400, {"ok": False, "error": str(exc)})
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"ok": False, "error": f"保存失败：{exc}"})

    def do_PATCH(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            payload = self._body_json()
            if parsed.path.startswith("/api/pinask/"):
                parts = parsed.path.strip("/").split("/")
                if len(parts) == 4 and parts[-1] == "session":
                    self._json(200, set_session(DATA_DIR, parts[-2], payload))
                    return
                item_id = parts[-1]
                self._json(200, set_status(DATA_DIR, item_id, str(payload.get("status") or "")))
                return
            self._json(404, {"ok": False, "error": "not found"})
        except FileNotFoundError as exc:
            self._json(404, {"ok": False, "error": str(exc)})
        except (ValueError, json.JSONDecodeError) as exc:
            self._json(400, {"ok": False, "error": str(exc)})
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"ok": False, "error": f"更新失败：{exc}"})


def main() -> None:
    import argparse
    global DATA_DIR

    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=str(CFG.get("host") or "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(CFG.get("port") or 8788))
    parser.add_argument("--data-dir", type=Path, help="此实例独立保存反馈的目录")
    args = parser.parse_args()
    if args.data_dir:
        DATA_DIR = args.data_dir.expanduser().resolve()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"pinask http://{args.host}:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
