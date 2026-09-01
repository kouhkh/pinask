# PinAsk

点选或拖框选择页面元素，再问一个问题。审查用快捷键冻结画面（灰黑遮罩 + 悬停高亮），不靠按钮，以免打断 hover。

轻点选择单个元素；按下、拖动、抬起进行一次框选，选择框在抬起时消失。如果框内元素尚未全部属于当前颜色组，它们会全部加入当前组；如果已经全部属于当前组，则整批取消当前颜色标记。同一元素可同时属于多个颜色组；已标元素列表只显示色点，两组的交叉项尽量排在两组之间，三组以上或无法自然夹放的交叉项排在末尾。Agent 会同时收到每个元素的分组数据，不依赖截图猜测元素关系。

默认快捷键 **F9**（`Alt+Q` 容易冲突）。退出：再按 F9、**右键**、Esc，或点退出。

## 两种用法

1. **浏览器插件**：标注存在 `chrome.storage.local`。Chrome 打开 `chrome://extensions` → 加载已解压的扩展 → 选本仓库根目录。弹窗可填服务器地址做同步。
2. **本地服务**：标注写成 `data/items/*.json`，给 Cursor skill 轮询改正。

需要 Python 3.10+（本机若 `python` 仍是 3.4，改用 `py -3.13`）。

```powershell
py -3.13 server/start.py
```

打开 `http://127.0.0.1:8788/`。配置在 `pinask.config.json`。

## 嵌进已有页面

把 `overlay/pinask.js` 和 `overlay/pinask.css` 引进宿主页，调用 `PinAsk.mount({...})`。字段说明见 `.cursor/skills/pinask/SKILL.md`。

## API

| 方法 | 路径 | 作用 |
|------|------|------|
| `POST` | `/api/pinask` | 保存一批（`question` + `ui_elements`） |
| `GET` | `/api/pinask?status=open` | 列出标注 |
| `GET` | `/api/pinask/<id>` | 单条 |
| `PATCH` | `/api/pinask/<id>` | `{"status":"resolved"}` |

## Cursor

个人 skill 在 `~/.cursor/skills/pinask/`。在宿主项目里说「按 PinAsk 标注改」，agent 会拉 `open` 项、改 UI、标 resolved。持续改可用 loop 轮询 `python server/watch.py`。
