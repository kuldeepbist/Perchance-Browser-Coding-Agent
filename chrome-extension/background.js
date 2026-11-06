
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "LOCAL_REQUEST") return;

  (async () => {
    try {
      // Only allow messages from Perchance pages.
      const pageUrl = new URL(sender.url || "");

      if (
        pageUrl.protocol !== "https:" ||
        !(pageUrl.hostname === "perchance.org" ||
          pageUrl.hostname.endsWith(".perchance.org"))
      ) {
        throw new Error("Untrusted sender");
      }

      const r = message.request;
      const url = new URL(r.url);

      const allowed = new Set([
        "/status",
        "/list",
        "/read",
        "/write",
        "/backups",
        "/undo"
      ]);

      if (
        url.origin !== "http://127.0.0.1:18777" ||
        !allowed.has(url.pathname) ||
        !["GET", "POST"].includes(r.method)
      ) {
        throw new Error("Request not allowed");
      }

      const headers = new Headers(r.headers || {});

      if (!headers.has("x-bridge-token")) {
        throw new Error("Bridge token missing");
      }

      const response = await fetch(url.href, {
        method: r.method,
        headers,
        body: r.method === "POST" ? r.body : undefined,
        redirect: "error"
      });

      const body = await response.text();

      // ok means transport succeeded, not that file operation succeeded.
      sendResponse({
        ok: true,
        status: response.status,
        headers: {
          "Content-Type": "application/json"
        },
        body
      });

    } catch (error) {
      sendResponse({
        ok: false,
        error: error.message
      });
    }
  })();

  return true;
});
