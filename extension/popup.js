const $ = (id) => document.getElementById(id);

async function load() {
  const stored = await chrome.storage.local.get(["items", "config"]);
  const config = stored.config || {};
  $("hotkey").value = config.hotkey || "F9";
  $("endpoint").value = config.endpoint || "";
  $("showHint").checked = Boolean(config.showHint);
  const items = Array.isArray(stored.items) ? stored.items : [];
  $("list").innerHTML = items.slice(0, 12).map((item) => {
    const q = String(item.question || "").slice(0, 60);
    return `<li>${item.status || "open"} · ${q}</li>`;
  }).join("") || "<li class='muted'>还没有标注</li>";
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    config: {
      hotkey: $("hotkey").value.trim() || "F9",
      endpoint: $("endpoint").value.trim(),
      showHint: $("showHint").checked,
    },
  });
  $("status").textContent = "已保存。刷新页面后快捷键生效。";
});

$("export").addEventListener("click", async () => {
  const stored = await chrome.storage.local.get("items");
  const blob = new Blob([JSON.stringify(stored.items || [], null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pinask-items.json";
  a.click();
  URL.revokeObjectURL(url);
});

load();
