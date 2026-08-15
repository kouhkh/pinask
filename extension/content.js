(() => {
  chrome.storage.local.get("config", ({ config }) => {
    const cfg = config || {};
    PinAsk.mount({
      hotkey: cfg.hotkey || "F9",
      storage: "custom",
      source: "extension",
      showHint: Boolean(cfg.showHint),
      onSave(batch) {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: "pinask.save", batch }, (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!res || !res.ok) {
              reject(new Error((res && res.error) || "保存失败"));
              return;
            }
            resolve(res);
          });
        });
      },
    });
  });
})();
