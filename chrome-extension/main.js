
(() => {
  if (window.__perchanceBridgeInstalled) return;
  window.__perchanceBridgeInstalled = true;

  const originalFetch = window.fetch.bind(window);
  const pending = new Map();

  window.addEventListener("message", (event) => {
    const d = event.data;
    if (event.source !== window || !d ||
        d.channel !== "PERCHANCE_BRIDGE_RESPONSE") return;

    const resolve = pending.get(d.id);
    if (!resolve) return;

    pending.delete(d.id);
    resolve(d.result);
  });

  window.fetch = async function(input, init) {
    let req;

    try {
      req = new Request(input, init);
    } catch {
      return originalFetch(input, init);
    }

    const url = new URL(req.url);

    if (
      url.origin !== "http://127.0.0.1:18777" ||
      !["GET", "POST"].includes(req.method)
    ) {
      return originalFetch(input, init);
    }

    const id = crypto.randomUUID();
    const body = ["GET", "HEAD"].includes(req.method)
      ? null
      : await req.clone().text();

    const headers = Object.fromEntries(req.headers.entries());

    const result = await new Promise((resolve, reject) => {
      pending.set(id, resolve);

      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error("Local bridge timeout"));
        }
      }, 300000);

      window.postMessage({
        channel: "PERCHANCE_BRIDGE_REQUEST",
        id,
        request: {
          url: req.url,
          method: req.method,
          headers,
          body
        }
      }, location.origin);
    });

    if (!result || !result.ok) {
      throw new Error(result?.error || "Local bridge failed");
    }

    return new Response(result.body, {
      status: result.status,
      headers: result.headers
    });
  };

  console.log("[Perchance Bridge] Fetch interceptor installed");
})();
