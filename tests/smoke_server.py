# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
PORT = 8799
BASE = f"http://127.0.0.1:{PORT}"


def req(method: str, path: str, payload: dict | None = None) -> dict:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def text_req(path: str) -> str:
    with urllib.request.urlopen(BASE + path, timeout=5) as response:
        return response.read().decode("utf-8")


def main() -> None:
    proc = subprocess.Popen(
        [PY, str(ROOT / "server" / "server.py"), "--port", str(PORT)],
        cwd=str(ROOT),
    )
    try:
        for _ in range(20):
            try:
                urllib.request.urlopen(BASE + "/", timeout=1)
                break
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.15)
        status_page = text_req("/status.html")
        assert "反馈与处理会话" in status_page
        saved = req(
            "POST",
            "/api/pinask",
            {
                "question": "empty tree",
                "ui_elements": [{"selector": "#gapTree", "name": "tree"}],
            },
        )
        listed = req("GET", "/api/pinask?status=open")
        patched = req("PATCH", f"/api/pinask/{saved['id']}", {"status": "resolved"})
        session = req("PATCH", f"/api/pinask/{saved['id']}/session", {"id": "smoke-run", "status": "waiting_test", "summary": "等待测试确认"})
        assert session["item"]["session"]["status"] == "waiting_test"
        out = ROOT / "data" / "_smoke.json"
        out.write_text(
            json.dumps(
                {"saved_ok": saved.get("ok"), "open_count": len(listed.get("items") or []), "resolved": patched["item"]["status"]},
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"WROTE {out}")
    finally:
        proc.terminate()
        proc.wait(timeout=5)


if __name__ == "__main__":
    main()
