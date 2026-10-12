# PinAsk

点选或拖框选择页面元素，再问一个问题。审查用快捷键冻结画面（灰黑遮罩 + 悬停高亮），不靠按钮，以免打断 hover。

## 产品定位

PinAsk 是接入具体项目或测试环境的可插拔反馈层，不是新的评测控制台，也不是必须集中部署的中心平台。

- **接入位置**：在项目的测试环境或交付页面加载 overlay；同一套代码可以用于多个环境。
- **最小部署单位**：当前建议一个项目/环境配一套 PinAsk 数据和状态入口，先保证记录不会混在一起。将来有权限和多租户需求时，再把多个项目接到同一个服务实例。
- **提供的能力**：选取界面元素、提交反馈、查看反馈与处理会话历史。
- **不负责的事情**：不理解项目代码，不决定使用哪种 coding agent，不直接决定合并、发布或上线。

处理会话由项目自己的适配器回写。适配器可以连接 coding agent、人工流程或其他任务系统；PinAsk 只保存一个通用的会话状态和摘要。

轻点选择单个元素；按下、拖动、抬起进行一次框选，选择框在抬起时消失。完整落入框内或自身边界与框边界相交的 UI 元素都会命中；只是从外部包住选择框、但边界没有相交的大容器不会命中。如果命中元素尚未全部属于当前颜色组，它们会全部加入当前组；如果已经全部属于当前组，则整批取消当前颜色标记。同一元素可同时属于多个颜色组；已标元素列表只显示色点，两组的交叉项尽量排在两组之间，三组以上或无法自然夹放的交叉项排在末尾。Agent 会同时收到每个元素的分组数据，不依赖截图猜测元素关系。

默认快捷键 **F9**（`Alt+Q` 容易冲突）。退出：再按 F9、**右键**、Esc，或点退出。

## 两种用法

1. **浏览器插件**：标注存在 `chrome.storage.local`。Chrome 打开 `chrome://extensions` → 加载已解压的扩展 → 选本仓库根目录。弹窗可填服务器地址做同步。
2. **本地服务**：标注写成 `data/items/*.json`，给 Cursor skill 轮询改正。

需要 Python 3.10+（本机若 `python` 仍是 3.4，改用 `py -3.13`）。

```powershell
py -3.13 server/start.py
```

打开 `http://127.0.0.1:8788/`。配置在 `pinask.config.json`。`http://127.0.0.1:8788/status.html` 是反馈与处理会话历史页。

## 嵌进已有页面

把 `overlay/pinask.js` 和 `overlay/pinask.css` 引进宿主页，调用 `PinAsk.mount({...})`。字段说明见 `.cursor/skills/pinask/SKILL.md`。

## API

| 方法 | 路径 | 作用 |
|------|------|------|
| `POST` | `/api/pinask` | 保存一批（`question` + `ui_elements`） |
| `GET` | `/api/pinask?status=open` | 列出标注 |
| `GET` | `/api/pinask/<id>` | 单条 |
| `PATCH` | `/api/pinask/<id>` | `{"status":"resolved"}` |
| `PATCH` | `/api/pinask/<id>/session` | 回写通用处理会话状态和摘要 |

当前反馈状态只有 `open`、`resolved`、`ignored`。其中 `resolved` 表示这条反馈已被处理，不表示代码已经合并、部署或上线。处理会话另外使用 `queued`、`running`、`waiting_test`、`succeeded`、`failed` 等状态，两者不要混用。

适配器回写处理会话的例子：

```bash
curl -X PATCH http://127.0.0.1:8788/api/pinask/pq_xxx/session \
  -H 'Content-Type: application/json' \
  -d '{"id":"run-123","status":"waiting_test","summary":"已生成隔离预览","preview_url":"http://127.0.0.1:9001"}'
```

如果 PinAsk 需要服务多个项目，应由项目方补充鉴权，并在 `scene.project_id`、`scene.environment` 上做访问隔离；这属于部署形态，不是 overlay 本身的前提。

## 阶段 0 接入清单

新项目只需要完成以下步骤即可使用问题采集：

1. 加载 `overlay/pinask.js` 和 `overlay/pinask.css`，调用 `PinAsk.mount`；无法改页面时安装浏览器插件。
2. 将 `endpoint` 指向项目可访问的 PinAsk API，或先使用本地服务保存 JSON。
3. 在 `context` 中提供项目、环境、任务和测试人员标识；没有身份系统时可先提供稳定的测试人员名。
4. 为测试人员提供 `/status.html`，让他们查看当前记录和处理会话历史。
5. 如果需要异步处理，项目方提供一个适配器，把任务状态通过 `/api/pinask/<id>/session` 回写；独立开发版本和研发审核属于后续档位。

页面接入示例：

```html
<link rel="stylesheet" href="/pinask/overlay/pinask.css">
<script src="/pinask/overlay/pinask.js"></script>
<script>
  PinAsk.mount({
    hotkey: "F9",
    endpoint: "https://pinask.example.test/api/pinask",
    context: () => ({
      project_id: "example-project",
      environment: "test",
      tester_id: window.currentTesterId || "unknown",
      task_id: document.body.dataset.taskId || "",
    }),
  });
</script>
```

## Cursor

个人 skill 在 `~/.cursor/skills/pinask/`。在宿主项目里说「按 PinAsk 标注改」，agent 会拉 `open` 项、改 UI、标 resolved。持续改可用 loop 轮询 `python server/watch.py`。

## 选择位置与回归检查

当前选择的标记通过捕获 `scroll`（含嵌套滚动）及 `resize`，在下一动画帧重新定位；保存的元素坐标同步更新。框选遍历有可见矩形的页面元素，保留包含/边界相交规则和 `data-pinask-ignore`，不再因标签不在列表或超过 80 项静默漏选。宿主仍应把浮球/工具栏等不参与框选的 UI 标记为 `data-pinask-ignore`。

`node tests/overlay_geometry.test.mjs` 验证纯几何；`tests/browser-selection.html` 是一次性本地浏览器夹具（重新运行先刷新），可由独立 runner 打开并点“运行独立回归”。夹具验证窗口及嵌套滚动、resize 事件后的布局、保存坐标、完整包含/四边相交、外包/忽略/不相交排除、多组与取消某组、95 元素无截断。夹具使用 PointerEvent 合成框选事件并禁用其指针捕获，仅用于验证真实 DOM 几何及 overlay 事件处理，不等同硬件拖拽端到端测试；不连接保存 API。
