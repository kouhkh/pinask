---
name: pinask
description: >-
  Poll PinAsk UI annotations (selected elements + a question), patch the host
  page, and mark items resolved. Use when the user mentions PinAsk, 审查界面,
  F9 标注, 点选元素提问, UI 标注, scene_question, or wants a Cursor agent to
  loop on overlay/extension feedback.
---

# PinAsk

一批标注 = 若干 `ui_elements` + 一个 `question`。快捷键默认 `F9`（可在 `pinask.config.json` 改）；右键 / Esc / 再按快捷键退出。不要用会打断 hover 的页面按钮进入审查。

## 配置

| 键 | 默认 | 含义 |
|----|------|------|
| `hotkey` | `F9` | 进入/退出审查 |
| `port` | `8788` | 本地服务 |
| `dataDir` | `data` | 标注 JSON 目录 |
| `endpoint` | `/api/pinask` | 保存接口 |
| `showHint` | `false` | 角落提示；不要插入会挤占布局的横幅 |

环境变量 `PINASK_URL`（默认 `http://127.0.0.1:8788`）覆盖服务地址。

## 接入宿主页

```html
<link rel="stylesheet" href="/overlay/pinask.css" />
<script src="/overlay/pinask.js"></script>
<script>
  PinAsk.mount({
    hotkey: "F9",
    endpoint: "/api/pinask",
    storage: "server",
    context: () => ({ step: document.body.dataset.step || "" }),
  });
</script>
```

`storage: "local"` 写入页面 `localStorage`。浏览器插件走 `onSave` → `chrome.storage.local`，可选再 POST 到服务器。

## 拉开放标注

优先写文件再读，避免 PowerShell 中文乱码：

```powershell
$env:PYTHONIOENCODING = "utf-8"
python server/watch.py --status open
```

然后 Read `data/_open.json`。或 `GET $PINASK_URL/api/pinask?status=open`。

## 改完闭环

1. 对照 `question`、`ui_elements[].selector`、`scene.href` 改宿主 UI/代码。
2. `PATCH /api/pinask/<id>`，body：`{"status":"resolved"}`（或 `ignored`）。
3. 用户说持续改：按 loop skill 轮询 `watch.py` / open API，有新 `open` 就处理，没有就短等。

## 不要做

- 不要把提示做成会撑开顶栏/挤走其它元素的块
- 不要用 `Alt+Q`（易抢快捷键）；改快捷键只动配置
- 不要改标注 JSON 里的 `ui_elements` 快照来“假装修过”
