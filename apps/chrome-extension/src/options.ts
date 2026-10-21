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
