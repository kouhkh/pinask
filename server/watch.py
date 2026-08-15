#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打印当前 open 标注，给 Cursor loop / skill 拉新问题。"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server.store import list_items  # noqa: E402


def load_data_dir() -> Path:
    path = ROOT / "pinask.config.json"
    data_dir = "data"
    if path.is_file():
        data_dir = str(json.loads(path.read_text(encoding="utf-8")).get("dataDir") or "data")
    return (ROOT / data_dir).resolve()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--status", default="open")
    args = parser.parse_args()
    payload = list_items(load_data_dir(), args.status or None)
    out = ROOT / "data" / "_open.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"WROTE {out} count={len(payload['items'])}")


if __name__ == "__main__":
    main()
