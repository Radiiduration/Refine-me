const DEFAULT_API = "http://localhost:8000";

async function apiUrl() {
  const stored = await chrome.storage.local.get({ apiUrl: DEFAULT_API });
  const url = new URL(String(stored.apiUrl));
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error("Refine only connects to a local API address.");
  }
  return url.origin + url.pathname.replace(/\/$/, "");
}

async function callApi(endpoint: string, method = "GET", body?: unknown) {
  const base = await apiUrl();
  const response = await fetch(`${base}${endpoint}`, {
    method,
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Refine API request failed" }));
    throw new Error(error.detail || "Refine API request failed");
  }
  return response;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    return;
  }
  const endpoints: Record<string, [string, string]> = {
    HEALTH_CHECK: ["/health", "GET"],
    GET_TONES: ["/tones", "GET"],
    CLARIFY: ["/clarify", "POST"],
  };
  const endpoint = endpoints[message.type];
  if (!endpoint) return;
  callApi(endpoint[0], endpoint[1], message.type === "CLARIFY"
    ? { text: message.text, context: message.context }
    : undefined)
    .then(response => response.json())
    .then(data => sendResponse({ success: true, data }))
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true;
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "rewrite-stream") return;
  port.onMessage.addListener(async message => {
    if (message.type !== "REWRITE") return;
    try {
      const response = await callApi("/rewrite", "POST", message.body);
      if (!response.body) throw new Error("No response stream from Refine API");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          if (!frame.startsWith("data: ")) continue;
          const content = frame.slice(6);
          if (content === "[DONE]") port.postMessage({ type: "DONE" });
          else port.postMessage({ type: "CHUNK", text: content });
        }
      }
      port.disconnect();
    } catch (error) {
      port.postMessage({ type: "ERROR", error: error instanceof Error ? error.message : "Rewrite failed" });
      port.disconnect();
    }
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "refine-selection", title: "Refine selected text", contexts: ["selection"] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "refine-selection" && tab?.id) {
    injectAndSend(tab.id, { type: "REFINE_SELECTION", text: info.selectionText || "" });
  }
});

async function injectAndSend(tabId: number, message: unknown) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Browser-internal pages do not allow extension script injection.
  }
}

chrome.commands.onCommand.addListener(async command => {
  if (command !== "refine-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) injectAndSend(tab.id, { type: "REFINE_SELECTION" });
});

chrome.action.onClicked.addListener(tab => {
  if (tab.id) injectAndSend(tab.id, { type: "OPEN_OVERLAY" });
});
