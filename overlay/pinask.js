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

  const state = {
    opts: { ...DEFAULTS },
    on: false,
    picks: [],
    lastMouse: { x: 0, y: 0 },
    toastTimer: 0,
    wired: false,
  };

  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
    return {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      className: String(el.className || "").slice(0, 160),
      role: el.getAttribute("role") || "",
      name,
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
    if (!el || root.contains(el) || el === document.documentElement || el === document.body) return null;
    return el;
  }

  function placeBox(node, box) {
    const rect = box.getBoundingClientRect();
    node.style.left = `${Math.round(rect.left)}px`;
    node.style.top = `${Math.round(rect.top)}px`;
    node.style.width = `${Math.max(1, Math.round(rect.width))}px`;
    node.style.height = `${Math.max(1, Math.round(rect.height))}px`;
  }

  function renderMarks() {
    $("pinask-marks").innerHTML = state.picks.map(() => '<div class="pinask-mark"></div>').join("");
    const marks = $("pinask-marks").children;
    state.picks.forEach((item, index) => {
      const el = item.selector ? document.querySelector(item.selector) : null;
      if (!el || !marks[index]) return;
      placeBox(marks[index], el);
    });
    $("pinask-picks").innerHTML = state.picks.map((item, index) => (
      `<span class="pinask-chip">${index + 1}. ${esc(item.name || item.selector)}</span>`
    )).join("") || "";
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
      ...extra,
    };
  }

  function setOn(on) {
    state.on = Boolean(on);
    $("pinask-root").hidden = !state.on;
    if (!state.on) {
      state.picks = [];
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
    const index = state.picks.findIndex((row) => row.selector === item.selector);
    if (index >= 0) state.picks.splice(index, 1);
    else state.picks.push(item);
    renderMarks();
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
      ui_elements: state.picks,
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
      <div id="pinask-tip"></div>
      <div id="pinask-toast"></div>
      <aside id="pinask-dock">
        <p>界面已静止。移动鼠标看元素，点击加入本批；保存后可继续再选。再按 <kbd></kbd>、右键或点退出。</p>
        <div id="pinask-picks"></div>
        <textarea id="pinask-question" rows="2" placeholder="针对这些界面元素，你想问什么？"></textarea>
        <div class="pinask-actions">
          <button class="pinask-btn primary" type="button" id="pinask-save">保存本批</button>
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
    document.addEventListener("mousemove", (event) => {
      state.lastMouse = { x: event.clientX, y: event.clientY };
      if (!state.on) return;
      if (event.target.closest("#pinask-dock")) {
        showHover(null);
        return;
      }
      showHover(inspectHit(event.clientX, event.clientY));
    }, true);
    $("pinask-mask").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const el = inspectHit(event.clientX, event.clientY);
      if (el) togglePick(el);
    });
    $("pinask-mask").addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOn(false);
    });
    $("pinask-save").addEventListener("click", saveBatch);
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
    get options() { return { ...state.opts }; },
  };
})();
