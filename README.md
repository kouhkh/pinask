# PinAsk

点选或拖框选择页面元素，再问一个问题。审查用快捷键冻结画面（灰黑遮罩 + 悬停高亮），不靠按钮，以免打断 hover。

轻点选择单个元素；按下、拖动、抬起进行一次框选，选择框在抬起时消失。完整落入框内或自身边界与框边界相交的 UI 元素都会命中；只是从外部包住选择框、但边界没有相交的大容器不会命中。如果命中元素尚未全部属于当前颜色组，它们会全部加入当前组；如果已经全部属于当前组，则整批取消当前颜色标记。同一元素可同时属于多个颜色组；已标元素列表只显示色点，两组的交叉项尽量排在两组之间，三组以上或无法自然夹放的交叉项排在末尾。Agent 会同时收到每个元素的分组数据，不依赖截图猜测元素关系。

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

## 选择位置与回归检查

当前选择的标记通过捕获 `scroll`（含嵌套滚动）及 `resize`，在下一动画帧重新定位；保存的元素坐标同步更新。框选遍历有可见矩形的页面元素，保留包含/边界相交规则和 `data-pinask-ignore`，不再因标签不在列表或超过 80 项静默漏选。宿主仍应把浮球/工具栏等不参与框选的 UI 标记为 `data-pinask-ignore`。

`node tests/overlay_geometry.test.mjs` 验证纯几何；`tests/browser-selection.html` 是一次性本地浏览器夹具（重新运行先刷新），可由独立 runner 打开并点“运行独立回归”。夹具验证窗口及嵌套滚动、resize 事件后的布局、保存坐标、完整包含/四边相交、外包/忽略/不相交排除、多组与取消某组、95 元素无截断。夹具使用 PointerEvent 合成框选事件并禁用其指针捕获，仅用于验证真实 DOM 几何及 overlay 事件处理，不等同硬件拖拽端到端测试；不连接保存 API。
