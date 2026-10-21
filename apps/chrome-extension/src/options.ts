const field = document.querySelector<HTMLInputElement>("#api")!;
const notice = document.querySelector<HTMLDivElement>("#notice")!;
const allowed = (value: string) => {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.protocol === "http:";
  } catch { return false; }
};

chrome.storage.local.get({ apiUrl: "http://localhost:8000" }, value => { field.value = value.apiUrl; });
document.querySelector<HTMLButtonElement>("#save")!.addEventListener("click", () => {
  const value = field.value.trim().replace(/\/$/, "");
  if (!allowed(value)) { notice.textContent = "Use a local address (localhost or 127.0.0.1)."; return; }
  chrome.storage.local.set({ apiUrl: value }, () => { notice.textContent = "Saved. Refine will use this local API."; });
});

const bubbleButton = document.querySelector<HTMLButtonElement>("#bubble")!;
const bubbleNotice = document.querySelector<HTMLDivElement>("#bubble-notice")!;
const webOrigins = ["http://*/*", "https://*/*"];
let bubbleEnabled = false;

async function refreshBubbleSetting() {
  bubbleEnabled = await chrome.permissions.contains({ origins: webOrigins });
  bubbleButton.textContent = bubbleEnabled ? "Disable writing bubble" : "Enable writing bubble";
  bubbleNotice.textContent = bubbleEnabled
    ? "Enabled. Select text in a writing field to see Refine."
    : "Off. Refine does not monitor website selections.";
}

bubbleButton.addEventListener("click", async () => {
  if (bubbleEnabled) {
    await chrome.permissions.remove({ origins: webOrigins });
    await chrome.runtime.sendMessage({ type: "SYNC_CONTENT_SCRIPT" });
    await refreshBubbleSetting();
    return;
  }
  const accepted = await chrome.permissions.request({ origins: webOrigins });
  if (accepted) await chrome.runtime.sendMessage({ type: "SYNC_CONTENT_SCRIPT" });
  else bubbleNotice.textContent = "Permission was not granted. Refine will keep using click-to-open.";
  await refreshBubbleSetting();
});

void refreshBubbleSetting();
