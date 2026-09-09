(() => {
  "use strict";

  const DEFAULTS = {
    hotkey: "F9",
    storage: "server",
    endpoint: "/api/pinask",
    context: null,
    onSave: null,
    showHint: false,
    source: "overlay",
  };

  const GROUP_PALETTE = [
    { id: "red", label: "红组", color: "#e05a5a", fill: "rgba(224, 90, 90, .16)" },
    { id: "blue", label: "蓝组", color: "#3978d4", fill: "rgba(57, 120, 212, .16)" },
    { id: "green", label: "绿组", color: "#2d9461", fill: "rgba(45, 148, 97, .16)" },
    { id: "purple", label: "紫组", color: "#8a5bd1", fill: "rgba(138, 91, 209, .16)" },
    { id: "orange", label: "橙组", color: "#d67a22", fill: "rgba(214, 122, 34, .16)" },
    { id: "cyan", label: "青组", color: "#198b96", fill: "rgba(25, 139, 150, .16)" },
  ];

  const state = {
    opts: { ...DEFAULTS },
    on: false,
    picks: [],
    groups: GROUP_PALETTE.slice(0, 2),
    activeGroupId: GROUP_PALETTE[0].id,
    drag: null,
    lastMouse: { x: 0, y: 0 },
    toastTimer: 0,
    wired: false,
    refreshFrame: 0,
  };

  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function activeGroup() {
    return state.groups.find((group) => group.id === state.activeGroupId) || state.groups[0];
  }

  function groupRef(group) {
    return { id: group.id, label: group.label, color: group.color };
  }

  function groupsFor(item) {
    const source = Array.isArray(item?.groups) ? item.groups : (item?.group ? [item.group] : []);
    const seen = new Set();
    return source.filter((group) => {
      if (!group?.id || seen.has(group.id)) return false;
      seen.add(group.id);
      return true;
    }).map(groupRef);
  }

  function hasGroup(item, groupId) {
    return groupsFor(item).some((group) => group.id === groupId);
  }

  function withGroup(item, group = activeGroup()) {
    const { group: _legacyGroup, ...base } = item;
    const groups = groupsFor(item);
    if (!groups.some((row) => row.id === group.id)) groups.push(groupRef(group));
    return { ...base, groups };
  }

  function withoutGroup(item, groupId) {
    const { group: _legacyGroup, ...base } = item;
    const groups = groupsFor(item).filter((group) => group.id !== groupId);
    return groups.length ? { ...base, groups } : null;
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
      return `#${CSS.escape(el.id)}`;
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((child) => child.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }

  function describeEl(el) {
    const rect = el.getBoundingClientRect();
    const name = (el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const stableKey = el.getAttribute("data-ui-key") || el.getAttribute("data-testid") || el.id || "";
    const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : el.closest("label")?.textContent;
    const ancestorSummary = [];
    let parent = el.parentElement;
    while (parent && ancestorSummary.length < 3 && parent !== document.body) {
      const text = (parent.getAttribute("data-ui-key") || parent.getAttribute("data-testid") || parent.getAttribute("aria-label") || parent.querySelector("h1,h2,h3,legend,label")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100);
      if (text) ancestorSummary.push({ tag: parent.tagName.toLowerCase(), text });
      parent = parent.parentElement;
    }
    return {
      selector: stableKey ? (el.getAttribute("data-ui-key") ? `[data-ui-key="${CSS.escape(stableKey)}"]` : el.getAttribute("data-testid") ? `[data-testid="${CSS.escape(stableKey)}"]` : el.id ? `#${CSS.escape(el.id)}` : cssPath(el)) : cssPath(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      className: String(el.className || "").slice(0, 160),
      role: el.getAttribute("role") || "",
      name,
      semantic: {
        stableKey,
        label: (label || "").replace(/\s+/g, " ").trim().slice(0, 120),
        placeholder: el.getAttribute("placeholder") || "",
        text: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180),
        htmlSnippet: el.outerHTML.replace(/\s+/g, " ").slice(0, 700),
        ancestors: ancestorSummary,
      },
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
    };
  }

  function inspectHit(x, y) {
    const root = $("pinask-root");
    const mask = $("pinask-mask");
    const dock = $("pinask-dock");
    if (!root || !mask || !dock) return null;
    mask.style.pointerEvents = "none";
    dock.style.pointerEvents = "none";
    const el = document.elementFromPoint(x, y);
    mask.style.pointerEvents = "auto";
    dock.style.pointerEvents = "auto";
    if (!el || root.contains(el) || el.closest("[data-pinask-ignore]") || el === document.documentElement || el === document.body) return null;
    return el;
  }

  function normalizedRect(startX, startY, endX, endY) {
    return {
      left: Math.min(startX, endX),
      top: Math.min(startY, endY),
      right: Math.max(startX, endX),
      bottom: Math.max(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY),
    };
  }

  function intersects(left, top, right, bottom, rect) {
    return left <= rect.right && right >= rect.left && top <= rect.bottom && bottom >= rect.top;
  }

  function frameSelectsRect(frame, rect) {
    if (!intersects(rect.left, rect.top, rect.right, rect.bottom, frame)) return false;
    const frameStrictlyInsideElement = rect.left < frame.left
      && rect.top < frame.top
      && rect.right > frame.right
      && rect.bottom > frame.bottom;
    return !frameStrictlyInsideElement;
  }

  function frameCandidates(frame) {
    // Display-only elements (div/span/p/table cells) are selectable too.
    // Geometry excludes enclosing containers; tag names must not exclude UI.
    const selector = "*";
    const rows = [];
    const seen = new Set();
    for (const el of document.querySelectorAll(selector)) {
      if ($("pinask-root")?.contains(el) || el.closest("[data-pinask-ignore]")) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || !frameSelectsRect(frame, rect)) continue;
      const item = describeEl(el);
      if (!item.selector || seen.has(item.selector)) continue;
      seen.add(item.selector);
      rows.push(item);
    }
    return rows;
  }

  function placeBox(node, box) {
    const rect = box.getBoundingClientRect();
    node.style.left = `${Math.round(rect.left)}px`;
    node.style.top = `${Math.round(rect.top)}px`;
    node.style.width = `${Math.max(1, Math.round(rect.width))}px`;
    node.style.height = `${Math.max(1, Math.round(rect.height))}px`;
  }

  function placeRect(node, rect) {
    node.style.left = `${Math.round(rect.left)}px`;
    node.style.top = `${Math.round(rect.top)}px`;
    node.style.width = `${Math.max(1, Math.round(rect.width))}px`;
    node.style.height = `${Math.max(1, Math.round(rect.height))}px`;
  }

  function setMarkColor(node, group) {
    node.style.setProperty("--pinask-group-color", group?.color || GROUP_PALETTE[0].color);
    node.style.setProperty("--pinask-group-fill", GROUP_PALETTE.find((row) => row.id === group?.id)?.fill || GROUP_PALETTE[0].fill);
  }

  function stripeStops(groups, valueFor) {
    return groups.flatMap((group, index) => {
      const start = Math.round(index * 100 / groups.length);
      const end = Math.round((index + 1) * 100 / groups.length);
      const value = valueFor(group);
      return [`${value} ${start}%`, `${value} ${end}%`];
    }).join(",");
  }

  function setMarkColors(node, groups) {
    const normalized = groups.length ? groups : [GROUP_PALETTE[0]];
    setMarkColor(node, normalized[0]);
    if (normalized.length === 1) {
      node.style.removeProperty("--pinask-group-border");
      node.style.removeProperty("--pinask-group-background");
      return;
    }
    const colorStops = stripeStops(normalized, (group) => group.color);
    const fillStops = stripeStops(normalized, (group) => GROUP_PALETTE.find((row) => row.id === group.id)?.fill || "rgba(91, 157, 255, .16)");
    node.style.setProperty("--pinask-group-border", `linear-gradient(90deg,${colorStops}) 1`);
    node.style.setProperty("--pinask-group-background", `linear-gradient(90deg,${fillStops})`);
  }

  function orderedPicks() {
    const groupOrder = new Map(state.groups.map((group, index) => [group.id, index]));
    const singles = state.groups.map(() => []);
    const bridges = state.groups.slice(0, -1).map(() => []);
    const tail = [];
    for (const item of state.picks) {
      const indexes = [...new Set(groupsFor(item).map((group) => groupOrder.get(group.id)).filter(Number.isInteger))].sort((a, b) => a - b);
      if (indexes.length === 1) singles[indexes[0]].push(item);
      else if (indexes.length === 2 && indexes[1] === indexes[0] + 1) bridges[indexes[0]].push(item);
      else tail.push(item);
    }
    const ordered = [];
    for (let index = 0; index < singles.length; index += 1) {
      ordered.push(...singles[index]);
      if (bridges[index]) ordered.push(...bridges[index]);
    }
    return [...ordered, ...tail];
  }

  function renderGroups() {
    const group = activeGroup();
    const trigger = $("pinask-group-trigger");
    const menu = $("pinask-group-menu");
    if (!trigger || !menu) return;
    trigger.innerHTML = `<span class="pinask-group-dot" style="--pinask-group-color:${esc(group.color)}"></span>分组`;
    trigger.title = `接下来选择：${group.label}`;
    menu.innerHTML = state.groups.map((row) => (
      `<button type="button" class="pinask-group-option${row.id === group.id ? " active" : ""}" data-group-id="${esc(row.id)}"><span class="pinask-group-dot" style="--pinask-group-color:${esc(row.color)}"></span>${esc(row.label)}</button>`
    )).join("") + (state.groups.length < GROUP_PALETTE.length ? '<button type="button" class="pinask-group-add" id="pinask-group-add">＋ 新增一组</button>' : "");
  }

  function updateMarkPositions() {
    const marks = $("pinask-marks")?.children;
    if (!marks) return;
    state.picks.forEach((item, index) => {
      const mark = marks[index];
      if (!mark) return;
      let el = null;
      try { el = item.selector ? document.querySelector(item.selector) : null; } catch { /* stale selector */ }
      const rect = el?.getBoundingClientRect();
      mark.hidden = !rect || rect.width < 1 || rect.height < 1;
      if (mark.hidden) return;
      setMarkColors(mark, groupsFor(item));
      placeRect(mark, rect);
      item.rect = { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) };
    });
  }

  function scheduleMarkRefresh() {
    if (!state.on || state.refreshFrame) return;
    state.refreshFrame = requestAnimationFrame(() => {
      state.refreshFrame = 0;
      if (!state.on) return;
      updateMarkPositions();
      if (!state.drag) showHover(inspectHit(state.lastMouse.x, state.lastMouse.y));
    });
  }

  function renderMarks() {
    $("pinask-marks").innerHTML = state.picks.map(() => '<div class="pinask-mark"></div>').join("");
    updateMarkPositions();
    $("pinask-picks").innerHTML = orderedPicks().map((item, index) => (
      `<span class="pinask-chip" aria-label="${esc(`${index + 1}. ${item.name || item.selector}；分组：${groupsFor(item).map((group) => group.label).join("、")}`)}"><span class="pinask-chip-swatches" aria-hidden="true">${groupsFor(item).map((group) => `<i style="--pinask-group-color:${esc(group.color)}"></i>`).join("")}</span>${index + 1}. ${esc(item.name || item.selector)}</span>`
    )).join("") || "";
    renderGroups();
  }

  function showHover(el) {
    const hover = $("pinask-hover");
    const tip = $("pinask-tip");
    if (!el) {
      hover.style.display = "none";
      tip.style.display = "none";
      return;
    }
    hover.style.display = "block";
    tip.style.display = "block";
    placeBox(hover, el);
    const info = describeEl(el);
    tip.textContent = `${info.tag}${info.id ? `#${info.id}` : ""} ${info.name}`.trim();
    const top = Math.max(8, info.rect.y - 22);
    tip.style.left = `${Math.min(info.rect.x, window.innerWidth - 280)}px`;
    tip.style.top = `${top}px`;
  }

  function showToast(message) {
    const toast = $("pinask-toast");
    toast.textContent = message;
    toast.style.display = "block";
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      toast.style.display = "none";
    }, 2200);
  }

  function scenePayload() {
    const extra = typeof state.opts.context === "function" ? state.opts.context() : (state.opts.context || {});
    return {
      href: location.href,
      title: document.title,
      pageHeadings: [...document.querySelectorAll("h1,h2,h3,main [role=heading]")].map((node) => (node.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12),
      visualEvidence: { screenshot: "not-captured", note: "当前网页框选仅保存元素坐标；浏览器扩展接入后保存整页与裁剪截图，不默认发送给模型。" },
      ...extra,
    };
  }

  function setOn(on) {
    state.on = Boolean(on);
    $("pinask-root").hidden = !state.on;
    if (!state.on) {
      state.picks = [];
      state.drag = null;
      $("pinask-question").value = "";
      showHover(null);
      renderMarks();
      return;
    }
    renderMarks();
    showHover(inspectHit(state.lastMouse.x, state.lastMouse.y));
  }

  function togglePick(el) {
    const item = describeEl(el);
    if (!item.selector) return;
    const group = activeGroup();
    const index = state.picks.findIndex((row) => row.selector === item.selector);
    if (index < 0) state.picks.push(withGroup(item, group));
    else if (hasGroup(state.picks[index], group.id)) {
      const remaining = withoutGroup(state.picks[index], group.id);
      if (remaining) state.picks.splice(index, 1, remaining);
      else state.picks.splice(index, 1);
    } else {
      state.picks.splice(index, 1, withGroup({ ...state.picks[index], ...item, groups: groupsFor(state.picks[index]) }, group));
    }
    renderMarks();
  }

  function toggleFramePicks(items, group = activeGroup()) {
    const allSelectedInGroup = items.every((item) => state.picks.some((pick) => pick.selector === item.selector && hasGroup(pick, group.id)));
    if (allSelectedInGroup) {
      for (const item of items) {
        const index = state.picks.findIndex((pick) => pick.selector === item.selector);
        if (index < 0) continue;
        const remaining = withoutGroup(state.picks[index], group.id);
        if (remaining) state.picks.splice(index, 1, remaining);
        else state.picks.splice(index, 1);
      }
    } else {
      for (const item of items) {
        const index = state.picks.findIndex((row) => row.selector === item.selector);
        const grouped = withGroup(index >= 0 ? { ...state.picks[index], ...item, groups: groupsFor(state.picks[index]) } : item, group);
        if (index >= 0) state.picks.splice(index, 1, grouped);
        else state.picks.push(grouped);
      }
    }
    renderMarks();
    return allSelectedInGroup ? "removed" : "selected";
  }

  function chooseGroup(id) {
    if (!state.groups.some((group) => group.id === id)) return;
    state.activeGroupId = id;
    $("pinask-group-menu").hidden = true;
    $("pinask-group-trigger").setAttribute("aria-expanded", "false");
    renderGroups();
  }

  function addGroup() {
    const next = GROUP_PALETTE.find((group) => !state.groups.some((row) => row.id === group.id));
    if (!next) return;
    state.groups.push(next);
    chooseGroup(next.id);
  }

  async function saveLocal(batch) {
    const key = "pinask.batches";
    const all = JSON.parse(localStorage.getItem(key) || "[]");
    all.push(batch);
    localStorage.setItem(key, JSON.stringify(all));
    return { ok: true, id: batch.id };
  }

  async function saveServer(batch) {
    const response = await fetch(state.opts.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "保存失败");
    return data;
  }

  async function saveBatch() {
    const question = $("pinask-question").value.trim();
    if (!state.picks.length) {
      showToast("先点选至少一个界面元素");
      return;
    }
    if (!question) {
      showToast("先写下要问的问题");
      return;
    }
    const batch = {
      question,
      ui_elements: orderedPicks(),
      selection_groups: state.groups.map(({ id, label, color }) => ({ id, label, color })),
      scene: scenePayload(),
      source: state.opts.source,
      created_at: new Date().toISOString(),
    };
    try {
      let result;
      if (typeof state.opts.onSave === "function") result = await state.opts.onSave(batch);
      else if (state.opts.storage === "local") result = await saveLocal(batch);
      else result = await saveServer(batch);
      const id = (result && (result.id || result.case_id)) || "ok";
      showToast(`已保存本批界面问题：${id}。可继续再选。`);
      state.picks = [];
      $("pinask-question").value = "";
      renderMarks();
    } catch (error) {
      showToast(String(error.message || error));
    }
  }

  function isHotkey(event, hotkey) {
    const parts = String(hotkey || "F9").split("+").map((part) => part.trim().toLowerCase()).filter(Boolean);
    const key = parts.pop();
    if (!key) return false;
    const wantAlt = parts.includes("alt");
    const wantCtrl = parts.includes("ctrl") || parts.includes("control");
    const wantShift = parts.includes("shift");
    const wantMeta = parts.includes("meta") || parts.includes("cmd") || parts.includes("win");
    if (Boolean(event.altKey) !== wantAlt) return false;
    if (Boolean(event.ctrlKey) !== wantCtrl) return false;
    if (Boolean(event.shiftKey) !== wantShift) return false;
    if (Boolean(event.metaKey) !== wantMeta) return false;
    const eventKey = String(event.key || "").toLowerCase();
    const code = String(event.code || "").toLowerCase();
    return eventKey === key || code === key || code === `key${key}`;
  }

  function ensureDom() {
    if ($("pinask-root")) return;
    const root = document.createElement("div");
    root.id = "pinask-root";
    root.hidden = true;
    root.innerHTML = `
      <div id="pinask-mask"></div>
      <div id="pinask-hover"></div>
      <div id="pinask-marks"></div>
      <div id="pinask-drag" hidden></div>
      <div id="pinask-tip"></div>
      <div id="pinask-toast"></div>
      <aside id="pinask-dock">
        <p>点击选一个；拖动框选一批。同组全选时再框一次可整批取消。再按 <kbd></kbd>、右键或点退出。</p>
        <div id="pinask-picks"></div>
        <textarea id="pinask-question" rows="2" placeholder="针对这些界面元素，你想问什么？"></textarea>
        <div class="pinask-actions">
          <button class="pinask-btn primary" type="button" id="pinask-save">保存本批</button>
          <span class="pinask-group-control">
            <button class="pinask-btn" type="button" id="pinask-group-trigger" aria-haspopup="menu" aria-expanded="false"></button>
            <span id="pinask-group-menu" role="menu" hidden></span>
          </span>
          <button class="pinask-btn text" type="button" id="pinask-clear">清空本批</button>
          <button class="pinask-btn text" type="button" id="pinask-exit">退出</button>
        </div>
      </aside>
    `;
    document.documentElement.appendChild(root);
  }

  function ensureHint() {
    let hint = $("pinask-hint");
    if (!state.opts.showHint) {
      if (hint) hint.hidden = true;
      return;
    }
    if (!hint) {
      hint = document.createElement("p");
      hint.id = "pinask-hint";
      hint.setAttribute("role", "note");
      document.documentElement.appendChild(hint);
    }
    hint.hidden = false;
    hint.innerHTML = `按 <kbd></kbd> 审查界面并提问`;
    hint.querySelector("kbd").textContent = state.opts.hotkey;
  }

  function ensureStyle() {
    if ($("pinask-style") || document.querySelector('link[href*="pinask.css"]')) return;
    const script = document.currentScript;
    const src = script && script.src ? script.src : "";
    const href = src ? src.replace(/[^/]+$/, "pinask.css") : "";
    if (href && !href.startsWith("chrome-extension:")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
  }

  function wire() {
    if (state.wired) return;
    state.wired = true;
    // scroll does not bubble; capture nested scrolling as well as window scroll.
    window.addEventListener("scroll", scheduleMarkRefresh, { capture: true, passive: true });
    window.addEventListener("resize", scheduleMarkRefresh, { passive: true });
    document.addEventListener("mousemove", (event) => {
      state.lastMouse = { x: event.clientX, y: event.clientY };
      if (!state.on) return;
      if (state.drag?.dragging) return;
      if (event.target.closest("#pinask-dock")) {
        showHover(null);
        return;
      }
      showHover(inspectHit(event.clientX, event.clientY));
    }, true);
    $("pinask-mask").addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      state.drag = { startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, dragging: false };
      $("pinask-mask").setPointerCapture?.(event.pointerId);
    });
    $("pinask-mask").addEventListener("pointermove", (event) => {
      if (!state.drag) return;
      event.preventDefault();
      state.drag.lastX = event.clientX;
      state.drag.lastY = event.clientY;
      const frame = normalizedRect(state.drag.startX, state.drag.startY, event.clientX, event.clientY);
      if (!state.drag.dragging && Math.max(frame.width, frame.height) < 6) return;
      state.drag.dragging = true;
      showHover(null);
      const drag = $("pinask-drag");
      drag.hidden = false;
      setMarkColor(drag, activeGroup());
      placeRect(drag, frame);
    });
    $("pinask-mask").addEventListener("pointerup", (event) => {
      if (!state.drag) return;
      event.preventDefault();
      event.stopPropagation();
      const dragState = state.drag;
      state.drag = null;
      $("pinask-drag").hidden = true;
      if (!dragState.dragging) {
        const el = inspectHit(event.clientX, event.clientY);
        if (el) togglePick(el);
        return;
      }
      const frame = normalizedRect(dragState.startX, dragState.startY, event.clientX, event.clientY);
      const items = frameCandidates(frame);
      if (!items.length) {
        showToast("这个框没有命中可选择的界面元素");
        return;
      }
      const group = activeGroup();
      const action = toggleFramePicks(items, group);
      showToast(action === "removed" ? `已取消框内 ${items.length} 个元素` : `已把框内 ${items.length} 个元素加入${group.label}`);
    });
    $("pinask-mask").addEventListener("pointercancel", () => {
      state.drag = null;
      $("pinask-drag").hidden = true;
    });
    $("pinask-mask").addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOn(false);
    });
    $("pinask-save").addEventListener("click", saveBatch);
    $("pinask-group-trigger").addEventListener("click", () => {
      const menu = $("pinask-group-menu");
      menu.hidden = !menu.hidden;
      $("pinask-group-trigger").setAttribute("aria-expanded", menu.hidden ? "false" : "true");
    });
    $("pinask-group-menu").addEventListener("click", (event) => {
      const option = event.target.closest("[data-group-id]");
      if (option) chooseGroup(option.dataset.groupId);
      else if (event.target.closest("#pinask-group-add")) addGroup();
    });
    $("pinask-clear").addEventListener("click", () => {
      state.picks = [];
      renderMarks();
    });
    $("pinask-exit").addEventListener("click", () => setOn(false));
    document.addEventListener("keydown", (event) => {
      if (isHotkey(event, state.opts.hotkey)) {
        event.preventDefault();
        setOn(!state.on);
        return;
      }
      if (event.key === "Escape" && state.on) {
        event.preventDefault();
        setOn(false);
      }
    }, true);
  }

  function mount(options) {
    state.opts = { ...DEFAULTS, ...(options || {}) };
    ensureStyle();
    ensureDom();
    $("pinask-dock").querySelector("kbd").textContent = state.opts.hotkey;
    ensureHint();
    wire();
    return window.PinAsk;
  }

  window.PinAsk = {
    mount,
    setOn,
    defaults: DEFAULTS,
    geometry: Object.freeze({ frameSelectsRect }),
    get options() { return { ...state.opts }; },
  };
})();
