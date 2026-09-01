# -*- coding: utf-8 -*-
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server.store import get_item, list_items, save_batch, set_status


class StoreTests(unittest.TestCase):
    def test_save_requires_question_and_elements(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            with self.assertRaisesRegex(ValueError, "问题"):
                save_batch({"ui_elements": [{"selector": "#a"}]}, data_dir)
            with self.assertRaisesRegex(ValueError, "元素"):
                save_batch({"question": "为什么是空的？"}, data_dir)

    def test_save_list_and_resolve(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            saved = save_batch(
                {
                    "question": "未挂树展开后是空的",
                    "ui_elements": [{"selector": "#gapTree", "tag": "div", "name": "未挂装饰装修树", "groups": [
                        {"id": "red", "label": "红组", "color": "#e05a5a"},
                        {"id": "blue", "label": "蓝组", "color": "#3978d4"},
                    ]}],
                    "selection_groups": [
                        {"id": "red", "label": "红组", "color": "#e05a5a"},
                        {"id": "blue", "label": "蓝组", "color": "#3978d4"},
                    ],
                    "scene": {"href": "http://127.0.0.1:8778/"},
                    "source": "demo",
                },
                data_dir,
            )
            self.assertTrue(saved["ok"])
            self.assertTrue(saved["id"].startswith("pq_"))
            opened = list_items(data_dir, "open")
            self.assertEqual(len(opened["items"]), 1)
            self.assertEqual(opened["items"][0]["ui_elements"][0]["selector"], "#gapTree")
            self.assertEqual([group["id"] for group in opened["items"][0]["ui_elements"][0]["groups"]], ["red", "blue"])
            self.assertEqual(opened["items"][0]["selection_groups"][1]["label"], "蓝组")
            item_id = saved["id"]
            self.assertEqual(get_item(data_dir, item_id)["item"]["question"], "未挂树展开后是空的")
            resolved = set_status(data_dir, item_id, "resolved")
            self.assertEqual(resolved["item"]["status"], "resolved")
            self.assertEqual(list_items(data_dir, "open")["items"], [])


if __name__ == "__main__":
    unittest.main()
