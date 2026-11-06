
window.addEventListener("message", async (event) => {
  const d = event.data;

  if (
    event.source !== window ||
    event.origin !== location.origin ||
    !d ||
    d.channel !== "PERCHANCE_BRIDGE_REQUEST"
  ) return;

  try {
    const result = await chrome.runtime.sendMessage({
      type: "LOCAL_REQUEST",
      id: d.id,
      request: d.request
    });

    window.postMessage({
      channel: "PERCHANCE_BRIDGE_RESPONSE",
      id: d.id,
      result
    }, location.origin);

  } catch (error) {
    window.postMessage({
      channel: "PERCHANCE_BRIDGE_RESPONSE",
      id: d.id,
      result: {
        ok: false,
        error: String(error)
      }
    }, location.origin);
  }
});
