type Question = { id: string; q: string; options: string[] };
type Tone = { name: string; description: string };

class RefineOverlay {
  private host = document.createElement("div");
  private root: ShadowRoot;
  private target: HTMLElement | null = null;
  private sourceText = "";
  private answers: Record<string, string> = {};
  private output = "";
  private tone = "formal";
  private audience = "work";
  private goal = "professional communication";
  private seed = Math.floor(Math.random() * 100_000);
  private inputRange: { start: number; end: number } | null = null;
  private editableRange: Range | null = null;
  private selectionTimer = 0;

  constructor() {
    this.host.style.cssText = "position:fixed;z-index:2147483647;display:none";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>
      *{box-sizing:border-box} :host{font:14px/1.45 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17241f}
      :host{--forest:#12664d;--ink:#1d3028;--muted:#77867e;--line:#e5ece6;--mist:#f6f9f5}
      .fab{height:38px;display:flex;align-items:center;gap:8px;padding:0 13px;border:1px solid #d8e7dc;border-radius:13px;background:#fff;color:var(--forest);font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 8px 26px #17241f24;transition:transform .18s,box-shadow .18s}.fab:hover{transform:translateY(-2px);box-shadow:0 12px 30px #17241f30}
      .fab span{width:22px;height:22px;border-radius:8px;background:#eaf4ec;display:grid;place-items:center;font-size:14px}
      .card{width:368px;max-height:min(580px,82vh);overflow:auto;background:#fff;border:1px solid #e2eae3;border-radius:20px;box-shadow:0 22px 72px #12231b38;animation:arrive .18s ease-out}
      @keyframes arrive{from{opacity:0;transform:translateY(5px) scale(.985)}to{opacity:1;transform:none}}
      header{padding:15px 17px;border-bottom:1px solid #edf2ef;display:flex;justify-content:space-between;align-items:center;font-weight:750;color:var(--ink)}
      header small{display:block;color:var(--muted);font-weight:450;font-size:11px;margin-top:3px}.body{padding:16px 17px}.footer{padding:12px 17px;border-top:1px solid #edf2ef;display:flex;justify-content:flex-end;gap:8px}
      button{font:inherit}.primary,.secondary,.chip{border-radius:11px;padding:9px 13px;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}.primary{background:var(--forest);color:#fff;border:1px solid var(--forest);font-weight:680}.primary:hover{background:#0e583f;transform:translateY(-1px)}.secondary,.chip{background:#fff;border:1px solid var(--line);color:#40554a}.secondary:hover,.chip:hover{border-color:#a9c9b0;background:#f8fbf7}.chip{border-radius:999px;margin:3px;font-size:12px}.chip.selected{background:#eaf4e9;border-color:#a8c9a8;color:#245b3b;box-shadow:inset 0 0 0 1px #d7e8d5}.question{margin:0 0 15px}.question b{display:block;margin-bottom:7px}.result{white-space:pre-wrap;background:var(--mist);border:1px solid #e5eee9;border-radius:13px;padding:13px;min-height:70px;color:#2f4337;line-height:1.65}.muted{color:var(--muted);font-size:12px;line-height:1.6}.error{color:#9f4235;background:#fff2f0;padding:11px;border-radius:10px}.actions{display:flex;gap:7px;flex-wrap:wrap}.spinner{color:var(--forest);padding:18px 0}.close{border:0;background:transparent;color:#829087;font-size:20px;cursor:pointer;width:28px;height:28px;border-radius:8px}.close:hover{background:#f2f6f1;color:#334b3d}.choice-group{margin-bottom:15px}.choice-label{display:block;color:#78867d;text-transform:uppercase;letter-spacing:.09em;font-size:10px;font-weight:750;margin:0 0 7px 3px}.choices{display:flex;gap:7px}.choices .chip{margin:0}
    </style><div id="view"></div>`;
    document.documentElement.appendChild(this.host);
    this.root.addEventListener("click", event => this.handleClick(event));
    document.addEventListener("mouseup", () => this.scheduleSelection());
    document.addEventListener("keyup", event => {
      if (["Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) this.scheduleSelection();
    });
    document.addEventListener("selectionchange", () => this.scheduleSelection());
    document.addEventListener("pointerdown", event => {
      if (!this.host.contains(event.target as Node)) this.host.style.display = "none";
    });
    chrome.runtime.onMessage.addListener(message => {
      if (message.type === "REFINE_SELECTION") {
        const el = document.activeElement as HTMLElement;
        if (this.isEditable(el)) this.show(el, message.text || this.selectedText(el) || this.read(el));
      }
      if (message.type === "OPEN_OVERLAY") {
        const el = document.activeElement as HTMLElement;
        if (this.isEditable(el)) this.show(el, this.selectedText(el) || this.read(el));
      }
    });
  }

  private isEditable(el: HTMLElement | null) {
    return !!el && (el.matches("textarea,input:not([type]),input[type=text],input[type=email],input[type=search]") || el.isContentEditable);
  }

  private selectedText(el: HTMLElement) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value.slice(el.selectionStart || 0, el.selectionEnd || 0);
    return window.getSelection()?.toString() || "";
  }

  private read(el: HTMLElement) {
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.innerText;
  }

  private show(el: HTMLElement, selected?: string) {
    this.target = el;
    const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    const start = field ? el.selectionStart ?? 0 : 0;
    const end = field ? el.selectionEnd ?? start : 0;
    const selection = field ? el.value.slice(start, end) : window.getSelection()?.toString() || "";
    this.sourceText = selected || selection || this.read(el);
    if (field) {
      if (selected && start === end) {
        const found = el.value.indexOf(selected);
        this.inputRange = found >= 0 ? { start: found, end: found + selected.length } : { start: 0, end: el.value.length };
      } else {
        this.inputRange = selection ? { start, end } : { start: 0, end: el.value.length };
      }
      this.editableRange = null;
    } else {
      const current = window.getSelection();
      const range = current?.rangeCount ? current.getRangeAt(0) : null;
      this.editableRange = range && el.contains(range.commonAncestorContainer) ? range.cloneRange() : document.createRange();
      if (!range || !el.contains(range.commonAncestorContainer)) {
        this.editableRange.selectNodeContents(el);
      }
      this.inputRange = null;
    }
    if (!this.sourceText.trim()) { this.host.style.display = "none"; return; }
    this.host.style.display = "block";
    const rect = el.getBoundingClientRect();
    this.host.style.left = `${Math.max(8, Math.min(innerWidth - 368, rect.right - 34))}px`;
    const below = rect.bottom + 8;
    this.host.style.top = `${below < innerHeight - 360 ? below : Math.max(8, rect.top - 360)}px`;
    this.render(`<button class="fab" title="Refine selected text"><span>✦</span> Refine</button>`);
  }

  private scheduleSelection() {
    window.clearTimeout(this.selectionTimer);
    this.selectionTimer = window.setTimeout(() => {
      const el = document.activeElement as HTMLElement;
      if (!this.isEditable(el)) return;
      const selection = this.selectedText(el);
      if (selection.trim()) this.show(el, selection);
      else if (!this.root.querySelector(".card")) this.host.style.display = "none";
    }, 180);
  }

  private render(content: string) {
    const view = this.root.querySelector<HTMLDivElement>("#view")!;
    view.innerHTML = content;
  }

  private card(title: string, body: string, footer = "") {
    this.render(`<section class="card"><header><div>Refine <small>${title}</small></div><button class="close" data-action="close" aria-label="Close">×</button></header><div class="body">${body}</div>${footer ? `<div class="footer">${footer}</div>` : ""}</section>`);
  }

  private async handleClick(event: Event) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    const action = button.dataset.action;
    if (button.classList.contains("fab")) return void this.openComposer();
    if (action === "close") { this.host.style.display = "none"; return; }
    if (action === "full") return void this.start();
    if (action === "tone") return void this.rewrite(button.dataset.tone || "formal");
    if (action === "tone-select") {
      this.tone = button.dataset.tone || "formal";
      this.root.querySelectorAll<HTMLButtonElement>('[data-action="tone-select"]').forEach(option => {
        const selected = option.dataset.tone === this.tone;
        option.classList.toggle("selected", selected);
        option.setAttribute("aria-pressed", String(selected));
      });
      return;
    }
    if (action === "audience") {
      this.audience = button.dataset.value || "work";
      this.goal = this.audience === "work" ? "professional communication" : "personal communication";
      this.root.querySelectorAll<HTMLButtonElement>('[data-action="audience"]').forEach(option => option.classList.toggle("selected", option === button));
      return;
    }
    if (action === "skip" || action === "continue") return void this.rewrite(this.tone);
    if (action === "answer") {
      this.answers[button.dataset.id || ""] = button.dataset.value || "";
      button.parentElement?.querySelectorAll(".chip").forEach(chip => chip.classList.toggle("selected", chip === button));
      return;
    }
    if (action === "other") {
      const val = prompt(button.dataset.question || "Add a detail");
      if (val?.trim()) this.answers[button.dataset.id || ""] = val.trim();
      return;
    }
    if (action === "replace") { this.replace(); return; }
    if (action === "copy") { await navigator.clipboard.writeText(this.output); return; }
    if (action === "more") { this.seed = Math.floor(Math.random() * 100_000); return void this.rewrite(this.tone); }
  }

  private async send(message: unknown): Promise<any> {
    return new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
  }

  private async start() {
    this.card("One quick check", `<p class="muted">Checking whether the draft needs more context…</p>`);
    const health = await this.send({ type: "HEALTH_CHECK" });
    if (!health?.success) return this.card("Local model unavailable", `<p class="error">${this.escape(health?.error || "Start the Refine API and local model server.")}</p>`, `<button class="secondary" data-action="close">Close</button>`);
    const result = await this.send({ type: "CLARIFY", text: this.sourceText, context: { app: location.hostname } });
    if (!result?.success) return this.card("Could not analyze draft", `<p class="error">${this.escape(result?.error || "Refine API request failed")}</p>`);
    const data = result.data;
    if (data.needs_clarification && data.questions?.length) this.renderQuestions(data.questions);
    else this.rewrite(this.tone);
  }

  private openComposer() {
    this.answers = { audience: this.audience, goal: this.goal };
    const tones = [
      ["formal", "Formal"], ["friendly", "Friendly"], ["concise", "Concise"], ["confident", "Confident"], ["kind", "Kind"],
    ] as const;
    const toneOptions = tones.map(([key, name]) => `<button class="chip ${this.tone === key ? "selected" : ""}" data-action="tone-select" data-tone="${key}" aria-pressed="${this.tone === key}">${name}</button>`).join("");
    const body = `<p class="muted" style="margin:0 0 16px">A quick polish for the text you selected.</p><div class="choice-group"><span class="choice-label">Writing for</span><div class="choices"><button class="chip ${this.audience === "work" ? "selected" : ""}" data-action="audience" data-value="work">Work</button><button class="chip ${this.audience === "personal" ? "selected" : ""}" data-action="audience" data-value="personal">Personal</button></div></div><div class="choice-group"><span class="choice-label">Tone</span><div class="choices" style="flex-wrap:wrap">${toneOptions}</div></div>`;
    this.card("Work messages, made clearer", body, `<button class="secondary" data-action="close">Cancel</button><button class="primary" data-action="full">✦ Refine</button>`);
  }

  private async quickRewrite() {
    if (!this.sourceText.trim()) return;
    this.answers = { audience: this.audience, goal: this.goal };
    const health = await this.send({ type: "HEALTH_CHECK" });
    if (!health?.success) return this.card("Local model unavailable", `<p class="error">${this.escape(health?.error || "Start the Refine API and local model server.")}</p>`, `<button class="secondary" data-action="close">Close</button>`);
    this.answers = {};
    this.seed = Math.floor(Math.random() * 100_000);
    await this.rewrite("friendly");
  }

  private renderQuestions(questions: Question[]) {
    const body = questions.map(q => `<div class="question"><b>${this.escape(q.q)}</b><div>${q.options.map(option => `<button class="chip" data-action="answer" data-id="${this.escape(q.id)}" data-value="${this.escape(option)}">${this.escape(option)}</button>`).join("")}<button class="chip" data-action="other" data-id="${this.escape(q.id)}" data-question="${this.escape(q.q)}">Other / skip</button></div></div>`).join("");
    this.card("A little more context", body, `<button class="secondary" data-action="skip">Skip</button><button class="primary" data-action="continue">Continue</button>`);
  }

  private async chooseTone() {
    const response = await this.send({ type: "GET_TONES" });
    if (!response?.success) return this.card("Could not load tones", `<p class="error">${this.escape(response?.error || "Refine API request failed")}</p>`);
    const tones = response.data as Record<string, Tone>;
    const options = Object.entries(tones).map(([key, tone]) => `<button class="chip" data-action="tone" data-tone="${key}">${this.escape(tone.name)}</button><p class="muted">${this.escape(tone.description)}</p>`).join("");
    this.card("Choose a tone", options);
  }

  private async rewrite(tone: string) {
    this.tone = tone;
    this.output = "";
    this.card("Your rewrite", `<div class="result" id="result">Thinking locally…</div><p class="muted">Your draft stays on this device.</p>`);
    const result = this.root.querySelector<HTMLElement>("#result")!;
    const port = chrome.runtime.connect({ name: "rewrite-stream" });
    port.onMessage.addListener((message: any) => {
      if (message.type === "CHUNK") { this.output += message.text.replace(/\\n/g, "\n"); result.textContent = this.output; }
      if (message.type === "DONE") this.card("Your rewrite", `<div class="result">${this.escape(this.output)}</div>`, `<button class="secondary" data-action="full">Full refine</button><button class="secondary" data-action="more">More options</button><button class="secondary" data-action="copy">Copy</button><button class="primary" data-action="replace">Replace</button>`);
      if (message.type === "ERROR") this.card("Rewrite failed", `<p class="error">${this.escape(message.error)}</p>`);
    });
    port.postMessage({ type: "REWRITE", body: { text: this.sourceText, tone, answers: this.answers, seed: this.seed } });
  }

  private replace() {
    if (!this.target || !this.output) return;
    const el = this.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const { start, end } = this.inputRange || { start: 0, end: el.value.length };
      const value = el.value;
      const next = value.slice(0, start) + this.output + value.slice(end);
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
      setter?.call(el, next);
      el.setSelectionRange(start + this.output.length, start + this.output.length);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: this.output }));
    } else {
      const selection = window.getSelection();
      if (selection && this.editableRange) {
        el.focus();
        selection.removeAllRanges();
        selection.addRange(this.editableRange);
        document.execCommand("insertText", false, this.output);
      } else {
        el.focus();
        el.textContent = el.innerText.replace(this.sourceText, this.output);
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: this.output }));
      }
    }
    this.host.style.display = "none";
  }

  private escape(value: string) {
    return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
  }
}

const extensionWindow = window as Window & { __refineOverlayLoaded?: boolean };
if (!extensionWindow.__refineOverlayLoaded) {
  extensionWindow.__refineOverlayLoaded = true;
  new RefineOverlay();
}
