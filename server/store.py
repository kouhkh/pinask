#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PinAsk 标注存储：一批 UI 元素 + 一个问题。"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def new_id() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    return f"pq_{stamp}_{uuid.uuid4().hex[:6]}"


def items_dir(data_dir: Path) -> Path:
    path = Path(data_dir) / "items"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _read_item(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_item(path: Path, item: dict[str, Any]) -> None:
    path.write_text(json.dumps(item, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def save_batch(payload: dict[str, Any], data_dir: Path) -> dict[str, Any]:
    question = str(payload.get("question") or payload.get("note") or "").strip()
    if not question:
        raise ValueError("请写下要问的问题")
    ui_elements = [
        dict(row)
        for row in payload.get("ui_elements") or []
        if isinstance(row, dict) and (row.get("selector") or row.get("name"))
    ]
    if not ui_elements:
        raise ValueError("请先点选至少一个界面元素")
    item_id = str(payload.get("id") or "").strip() or new_id()
    item = {
        "id": item_id,
        "created_at": str(payload.get("created_at") or now_iso()),
        "status": "open",
        "question": question,
        "ui_elements": ui_elements,
        "selection_groups": [
            dict(row)
            for row in payload.get("selection_groups") or []
            if isinstance(row, dict) and row.get("id") and row.get("label")
        ],
        "scene": dict(payload.get("scene") or {}),
        "source": str(payload.get("source") or "overlay"),
    }
    path = items_dir(data_dir) / f"{item_id}.json"
    _write_item(path, item)
    return {"ok": True, "id": item_id, "item": item}


def list_items(data_dir: Path, status: str | None = None) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for path in sorted(items_dir(data_dir).glob("*.json")):
        try:
            item = _read_item(path)
        except (OSError, json.JSONDecodeError):
            continue
        if status and str(item.get("status") or "") != status:
            continue
        rows.append(item)
    rows.sort(key=lambda row: str(row.get("created_at") or ""), reverse=True)
    return {"ok": True, "items": rows}


def get_item(data_dir: Path, item_id: str) -> dict[str, Any]:
    path = items_dir(data_dir) / f"{item_id}.json"
    if not path.is_file():
        raise FileNotFoundError(f"找不到标注 {item_id}")
    return {"ok": True, "item": _read_item(path)}


def set_status(data_dir: Path, item_id: str, status: str) -> dict[str, Any]:
    status = str(status or "").strip()
    if status not in {"open", "resolved", "ignored"}:
        raise ValueError("status 只能是 open / resolved / ignored")
    path = items_dir(data_dir) / f"{item_id}.json"
    if not path.is_file():
        raise FileNotFoundError(f"找不到标注 {item_id}")
    item = _read_item(path)
    item["status"] = status
    item["updated_at"] = now_iso()
    _write_item(path, item)
    return {"ok": True, "item": item}
