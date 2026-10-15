# SPEC: Open-Source AI Writing Refiner — "Refine"

An open-source, privacy-first alternative to Grammarly. The user highlights or types text anywhere, taps Refine, answers a quick popup if details are missing, and gets a better version in place. It replaces the "copy, paste into ChatGPT, copy back" loop.

---

## 1. Goals and non-goals

**Goals**
- Free and open source (MIT). No accounts, no telemetry, no paid APIs.
- Model: **Qwen3 8B from Hugging Face** (`hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M`), served locally by **Ollama** (default backend).
- Clients: Chrome extension (first), Windows/Mac desktop, Android, iOS.
- Two-step flow: **Clarify** (ask what's missing) then **Rewrite** (apply tone + answers).
- Tone options: Formal, Kind, Friendly, Concise, Confident (extensible via `tones.json`).
- First variant is streamed immediately. "More options" button generates additional variants on demand (separate calls, different seeds + variation hints).
- Every Regenerate gives a meaningfully different result.

**Non-goals (v1)**
- Grammar underlining as you type (Grammarly-style live checking). Refine is on-demand.
- Cloud sync, user accounts, analytics.
- Promising CPU-only speed. 60-second timeout; loading state shown; no performance guarantees stated.

---

## 2. Architecture

```
Chrome extension
    │
    │  HTTP/JSON (localhost only)
    ▼
Refine Core API  (FastAPI, Python 3.11)
    │  all prompt logic, tone config, schema validation
    │
    │  Ollama API  (http://localhost:11434)
    ▼
Qwen3 8B GGUF  (Ollama, hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M)
```

- **Core API** holds ALL prompt logic. Every client is thin; prompts are written once.
- **Extension talks only to the Core API** — never directly to Ollama. No `OLLAMA_ORIGINS` config needed.
- **CORS**: Core API allows only the Chrome extension origin (and `http://localhost` for dev). No other origins.
- Text never leaves the user's machine.
- **Fail fast**: if the model server is not running, `/health` returns 503 and the extension shows a clear "Model server not running — start Ollama first" message.

---

## 3. Repo structure

```
CLONEGRAMRLY/          ← repo root (workspace folder)
├── SPEC.md
├── CLAUDE.md
├── packages/
│   └── prompts/
│       ├── clarify.md
│       ├── rewrite.md
│       └── tones.json
├── apps/
│   ├── api/                 # FastAPI service
│   │   ├── main.py
│   │   ├── llm.py           # ONLY file that knows the Ollama backend
│   │   ├── schemas.py       # Pydantic models
│   │   ├── .env
│   │   ├── requirements.txt
│   │   └── tests/
│   │       └── test_rewrite.py
│   ├── chrome-extension/    # Manifest V3, TypeScript (Slice 4+)
│   ├── desktop/             # Tauri + React (later)
│   ├── android/             # Kotlin (later)
│   └── ios/                 # Swift (later)
└── eval/
    ├── samples.jsonl
    └── run_eval.py
```

---

## 4. API contract

### GET /health
Response (200 — model server reachable):
```json
{ "status": "ok", "backend": "ollama", "model": "hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M" }
```
Response (503 — Ollama not running):
```json
{ "detail": "Model server not running — start Ollama first" }
```

### GET /tones
Returns the contents of `tones.json`.

### POST /clarify
Request:
```json
{ "text": "hey can u send the report", "context": { "app": "gmail" } }
```
Response:
```json
{
  "needs_clarification": true,
  "questions": [
    { "id": "audience", "q": "Who is this for?", "options": ["Manager", "Colleague", "Client", "Friend"] },
    { "id": "goal",     "q": "What's the goal?", "options": ["Request", "Follow up", "Inform"] }
  ]
}
```
- Maximum 3 questions. Each has 2–5 options; the UI always adds "Other / skip".
- If the draft is clear: `{ "needs_clarification": false, "questions": [] }`.
- On LLM JSON failure: retry once, then return `{ "needs_clarification": false, "questions": [] }` (fail safe — skip clarification rather than error).

### POST /rewrite
Request:
```json
{
  "text": "hey can u send the report",
  "tone": "formal",
  "answers": { "audience": "Manager", "goal": "Request" },
  "seed": 4821
}
```
Response: **Server-Sent Events** (SSE), `text/event-stream`.
- Streams the rewritten text in chunks: `data: <chunk>\n\n`
- Ends with: `data: [DONE]\n\n`
- The client shows a "More options" button after [DONE]. Each click calls `/rewrite` again with a new random `seed`; the API picks a different `variation_hint` based on the seed.

---

## 5. Model and backend setup

**Backend**: Ollama (default and only supported backend for now).
**Model**: `hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M` (~5 GB).

**Pull and run**:
```bash
ollama pull hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M
ollama serve   # if not already running as a daemon
```

**Verify (Slice 0 check)**:
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M",
  "messages": [{"role":"user","content":"Say hello. /no_think"}],
  "stream": false,
  "think": false
}'
```
Expected: JSON with `message.content` containing a greeting and no `<think>` blocks.

**Config (`apps/api/.env`)**:
```
LLM_BACKEND=ollama
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M
```
`llm.py` is the only file that reads these. Switching backends must never require changes outside it.

**Request settings**:
- Disable thinking: set `"think": false` in the Ollama request body. Also append `/no_think` to the user message as a belt-and-suspenders fallback. Always strip `<think>…</think>` blocks from output defensively.
- Clarify call: `temperature 0.2`, JSON schema enforced via Ollama's `format` field.
- Rewrite call: `temperature 0.8`, `top_p 0.9`, unique `seed` per call. `variation_hint` cycles through a list based on seed so results genuinely differ.
- Timeout: 60 seconds. Hard fail with 504 after that.
- Hard rules: never add facts the user didn't write; preserve names, numbers, dates and links; keep the original language.

**`llm.py` interface** (the only public API of this module):
```python
async def generate_text_stream(messages, temperature, seed) -> AsyncGenerator[str, None]
async def generate_json(messages, schema, temperature) -> dict   # retries once on bad JSON
async def check_health() -> bool
```

---

## 6. Prompts

### packages/prompts/rewrite.md  (system prompt)
```
You are an expert editor. Rewrite the user's draft.

Tone: {{tone_name}} — {{tone_description}}
Audience: {{audience}}
Goal: {{goal}}

Rules:
- Keep the original meaning. Do NOT invent facts, names, dates or numbers.
- Preserve links, @mentions, emojis, and line breaks where sensible.
- Keep the same language as the draft.
- Match length to the tone unless it says otherwise.
- Output ONLY the rewritten text. No preamble, no quotes, no explanations.

Style guidance for this attempt: {{variation_hint}}
```

Variation hints (cycle by seed mod N):
`"lead with the main point"`, `"use shorter sentences"`, `"warmer opening"`, `"more direct"`, `"stronger action verbs"`, `"simpler vocabulary"`.

### packages/prompts/clarify.md  (system prompt)
```
You are a writing assistant that decides whether a draft needs more
information before it can be rewritten well.

Given a draft message, decide what is genuinely missing that would change
how it should be rewritten. Consider: who the audience is, the goal of the
message, the desired tone, and any missing key detail (a date, a name, an amount).

Rules:
- Ask at most 3 questions. Ask 0 if the draft is already clear.
- Never ask about anything already obvious from the draft.
- Each question needs 2–5 short multiple-choice options.
- Respond ONLY with JSON matching the schema. No explanation.

Schema:
{"needs_clarification": boolean,
 "questions": [{"id": string, "q": string, "options": [string]}]}
```

### packages/prompts/tones.json
```json
{
  "formal":    { "name": "Formal",    "description": "Professional, polite, complete sentences, no slang or contractions." },
  "kind":      { "name": "Kind",      "description": "Warm, considerate, softens requests, shows appreciation." },
  "friendly":  { "name": "Friendly",  "description": "Casual and upbeat, conversational, light contractions." },
  "concise":   { "name": "Concise",   "description": "As short as possible while keeping every key point." },
  "confident": { "name": "Confident", "description": "Direct and assertive without being rude; no hedging words." }
}
```

---

## 7. Chrome extension spec (Manifest V3)

- **Content script**: detect focus on `<textarea>`, `<input type=text>` and `[contenteditable]`; show a small floating sparkle button near the field.
- **Popup UI** (shadow DOM, so page CSS can't break it):
  - Step 1: clarify questions as chips.
  - Step 2: tone chips, first variant streamed in, then "More options" button.
  - Buttons: Replace, Regenerate, Copy.
  - If `/health` returns 503: show "Model server not running — start Ollama first" in place of the popup.
- **Replace text**: try `document.execCommand('insertText')` first; fall back to Selection/Range API + dispatch `input` event. This ensures Gmail, LinkedIn and Google Docs register the change.
- **Service worker**: all network calls to the Core API (avoids page CORS issues). Configurable API URL in the options page (default `http://localhost:8000`).
- **Also**: right-click menu "Refine selected text" and keyboard shortcut (default Ctrl/Cmd+Shift+R).
- **Permissions**: `activeTab`, `storage`, `contextMenus`, plus the Core API URL in `host_permissions`. No direct connection to Ollama ever.
- 60-second timeout on all fetch calls; show a loading spinner during generation.

---

## 8. Build slices (do in order; test each before moving on)

| # | Slice | Done when |
|---|-------|-----------|
| 0 | Start Ollama with the HF GGUF model; confirm a raw curl request returns text with thinking off | curl response contains text, no `<think>` blocks |
| 1 | `apps/api` with `/health` and `/rewrite` (streaming SSE, Ollama backend via `llm.py`) | `pytest` passes; curl streams rewritten text |
| 2 | `/clarify` with schema-enforced JSON; add `/tones` | pytest passes; curl returns valid clarify JSON |
| 3 | `eval/run_eval.py` runs 20 sample drafts, checks JSON validity and output diversity | script exits 0 with a summary report |
| 4 | Chrome extension: floating button on a plain textarea, full popup flow (clarify → tone → streaming variant → Replace) | manually loads in Chrome, replaces text in a plain `<textarea>` |
| 5 | Gmail, LinkedIn and Google Docs compatibility fixes | replace works in all three apps |
| 6 | Options page (API URL, shortcuts), README, demo GIF, MIT license | repo is ready for public release |
| Later | Desktop (Tauri + React), Android (text-selection action → keyboard), iOS (share extension → keyboard) | — |

---

## 9. Definition of done (v1 demo)

In Chrome, the user types a rough email in Gmail, clicks the sparkle button, answers 1–2 popup questions, picks "Formal", sees the first rewritten variant streaming in within ~5 seconds on a GPU-equipped machine (no promise on CPU-only), clicks Replace, and the text is swapped in place. Clicking "More options" streams an additional meaningfully different variant. Everything runs locally with no network calls beyond localhost.
