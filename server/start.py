#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""启动 PinAsk 服务并打开 demo。"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

if sys.version_info < (3, 10):
    sys.exit("PinAsk needs Python 3.10+")


def load_port() -> int:
    path = ROOT / "pinask.config.json"
    if path.is_file():
        cfg = json.loads(path.read_text(encoding="utf-8"))
        return int(cfg.get("port") or 8788)
    return 8788


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=load_port())
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--data-dir", type=Path)
    args = parser.parse_args()
    url = f"http://127.0.0.1:{args.port}/"
    command = [sys.executable, str(HERE / "server.py"), "--port", str(args.port)]
    if args.data_dir:
        command.extend(["--data-dir", str(args.data_dir.expanduser().resolve())])
    process = subprocess.Popen(command)
    try:
        if not args.no_open:
            time.sleep(0.6)
            webbrowser.open(url)
        print(url)
        process.wait()
    except KeyboardInterrupt:
        process.terminate()


if __name__ == "__main__":
    main()
