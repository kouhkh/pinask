chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "pinask.save") return;
  (async () => {
    const batch = msg.batch || {};
    const stored = await chrome.storage.local.get(["items", "config"]);
    const items = Array.isArray(stored.items) ? stored.items : [];
    const config = stored.config || {};
    const item = {
      id: `pq_ext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      created_at: batch.created_at || new Date().toISOString(),
      status: "open",
      question: batch.question,
      ui_elements: batch.ui_elements || [],
      scene: batch.scene || {},
      source: "extension",
    };
    items.unshift(item);
    await chrome.storage.local.set({ items: items.slice(0, 500) });
    const endpoint = String(config.endpoint || "").trim();
    if (endpoint) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "同步服务器失败");
      }
      item.id = data.id || item.id;
    }
    sendResponse({ ok: true, id: item.id });
  })().catch((error) => {
    sendResponse({ ok: false, error: String(error.message || error) });
  });
  return true;
});
