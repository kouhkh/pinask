(() => {
  "use strict";

  const state = {
    items: [],
    timer: null,
    endpoint: "/api/pinask",
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const STATUS_LABELS = {
    open: "待处理",
    resolved: "已处理",
    ignored: "已忽略",
  };

  const SESSION_STATUS_LABELS = {
    queued: "排队中",
    running: "处理中",
    waiting_test: "等待确认",
    succeeded: "已完成",
    failed: "失败",
    paused: "已暂停",
    canceled: "已取消",
    unknown: "未接入",
  };

  function scene(item) {
    return item && item.scene && typeof item.scene === "object" ? item.scene : {};
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || status || "未知";
  }

  function session(item) {
    return item && item.session && typeof item.session === "object" ? item.session : null;
  }

  function sessionStatusLabel(status) {
    return SESSION_STATUS_LABELS[status] || status || "未接入";
  }

  function formatTime(value) {
    if (!value) return "时间未知";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function itemMatches(item) {
    const query = $("query").value.trim().toLowerCase();
    const tester = $("tester").value.trim().toLowerCase();
    const status = $("status").value;
    const sessionStatus = $("session-status").value;
    const itemScene = scene(item);
    const itemSession = session(item);
    const searchable = [
      item.question,
      item.id,
      itemScene.href,
      itemScene.page_url,
      itemScene.page,
      itemScene.project_id,
      itemScene.environment,
      itemScene.task_id,
    ].join(" ").toLowerCase();
    const owner = String(itemScene.tester_id || item.tester_id || "").toLowerCase();
    return (!query || searchable.includes(query))
      && (!tester || owner === tester)
      && (!status || item.status === status)
      && (!sessionStatus || itemSession?.status === sessionStatus);
  }

  function updateSummary() {
    const counts = state.items.reduce((result, item) => {
      result.total += 1;
      if (item.status === "open") result.open += 1;
      if (item.status === "resolved") result.resolved += 1;
      if (item.status === "ignored") result.ignored += 1;
      if (["queued", "running", "waiting_test", "paused"].includes(session(item)?.status)) result.activeSessions += 1;
      return result;
    }, { total: 0, open: 0, resolved: 0, ignored: 0, activeSessions: 0 });
    $("total-count").textContent = counts.total;
    $("open-count").textContent = counts.open;
    $("resolved-count").textContent = counts.resolved;
    $("ignored-count").textContent = counts.ignored;
    $("active-session-count").textContent = counts.activeSessions;
  }

  function renderItem(item) {
    const itemScene = scene(item);
    const itemSession = session(item);
    const elements = Array.isArray(item.ui_elements) ? item.ui_elements : [];
    const elementRows = elements.length
      ? `<ul class="elements">${elements.map((element) => `<li><code>${esc(element.selector || element.name || "未命名元素")}</code> ${esc(element.name || "")}</li>`).join("")}</ul>`
      : "<p>没有记录 UI 元素。</p>";
    const status = String(item.status || "");
    const sessionBlock = itemSession
      ? `<div class="session"><div class="session-head"><span class="session-title">处理会话</span><span class="session-badge ${esc(itemSession.status || "unknown")}">${esc(sessionStatusLabel(itemSession.status))}</span></div>${itemSession.summary ? `<p class="session-summary">${esc(itemSession.summary)}</p>` : ""}<div class="session-meta">${itemSession.id ? `<span>ID <code>${esc(itemSession.id)}</code></span>` : ""}${itemSession.updated_at ? `<span>更新于 ${esc(formatTime(itemSession.updated_at))}</span>` : ""}${itemSession.preview_url ? `<a href="${esc(itemSession.preview_url)}" target="_blank" rel="noreferrer">打开预览</a>` : ""}</div></div>`
      : `<div class="session"><div class="session-head"><span class="session-title">处理会话</span><span class="session-badge unknown">未接入</span></div><div class="session-meta"><span>等待项目适配器回写处理状态</span></div></div>`;
    return `<article class="item">
      <div class="item-head">
        <h2 class="item-question">${esc(item.question || "未填写问题")}</h2>
        <span class="badge ${esc(status)}">${esc(statusLabel(status))}</span>
      </div>
      <div class="meta">
        <span>ID <code>${esc(item.id)}</code></span>
        <span>创建于 ${esc(formatTime(item.created_at))}</span>
        ${itemScene.project_id ? `<span>项目 <code>${esc(itemScene.project_id)}</code></span>` : ""}
        ${itemScene.environment ? `<span>环境 <code>${esc(itemScene.environment)}</code></span>` : ""}
        ${itemScene.tester_id ? `<span>测试人员 <code>${esc(itemScene.tester_id)}</code></span>` : ""}
      </div>
      ${sessionBlock}
      <details>
        <summary>查看页面和选中元素</summary>
        <div class="detail-grid">
          <div><strong>页面</strong>${esc(itemScene.href || itemScene.page_url || itemScene.page || "未记录")}</div>
          <div><strong>任务</strong>${esc(itemScene.task_id || "未记录")}</div>
          <div><strong>最近更新</strong>${esc(formatTime(item.updated_at || item.created_at))}</div>
          <div><strong>元素数量</strong>${elements.length}</div>
        </div>
        ${elementRows}
      </details>
    </article>`;
  }

  function render() {
    updateSummary();
    const items = state.items.filter(itemMatches);
    $("items").innerHTML = items.length
      ? items.map(renderItem).join("")
      : `<div class="empty">没有符合条件的记录。可以回到 <a href="/">PinAsk demo</a> 按 F9 提交一个问题。</div>`;
  }

  async function loadConfig() {
    try {
      const response = await fetch("/pinask.config.json", { cache: "no-store" });
      if (!response.ok) return;
      const config = await response.json();
      if (config.endpoint) state.endpoint = config.endpoint;
    } catch (_error) {
      // Keep the documented default endpoint for local use.
    }
  }

  async function load() {
    $("message").textContent = "正在读取…";
    $("message").classList.remove("error");
    try {
      const response = await fetch(`${state.endpoint}?status=`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.error || "读取失败");
      state.items = Array.isArray(payload.items) ? payload.items : [];
      render();
      $("message").textContent = `最近刷新：${new Date().toLocaleTimeString()} · ${state.items.length} 条记录`;
    } catch (error) {
      state.items = [];
      render();
      $("message").textContent = `读取失败：${error.message || error}`;
      $("message").classList.add("error");
    }
  }

  function schedule() {
    window.clearInterval(state.timer);
    if ($("auto-refresh").checked) state.timer = window.setInterval(load, 5000);
  }

  $("refresh").addEventListener("click", load);
  ["query", "tester", "status", "session-status"].forEach((id) => $(id).addEventListener("input", render));
  $("auto-refresh").addEventListener("change", schedule);

  const params = new URLSearchParams(window.location.search);
  if (params.get("tester_id")) $("tester").value = params.get("tester_id");
  loadConfig().finally(() => { load(); schedule(); });
})();
