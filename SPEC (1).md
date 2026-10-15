# SPEC: Open-Source AI Writing Refiner (working title: "Refine")

An open-source, privacy-first alternative to Grammarly. The user highlights or types text anywhere, taps Refine, answers a quick popup if details are missing, and gets a better version in place. It replaces the "copy, paste into ChatGPT, copy back" loop.

## 1. Goals and non-goals

**Goals**
- Free and open source (MIT). No accounts, no telemetry, no paid APIs.
- Model: **Qwen3 8B from Hugging Face** (`Qwen/Qwen3-8B-GGUF`, Q4_K_M, about 5 GB), served locally by the **llama.cpp server** (default). Ollama is an optional alternative backend.
- Clients: Chrome extension (first), Windows/Mac desktop, Android, iOS.
- Two-step flow: **Clarify** (ask what's missing) then **Rewrite** (apply tone plus answers).
- Tone options: Formal, Kind, Friendly, Concise, Confident (extensible via config file).
- Every Regenerate gives a meaningfully different result.

**Non-goals (v1)**
- Grammar underlining as you type (Grammarly-style live checking). Refine is on-demand.
- Cloud sync, user accounts, analytics.

## 2. Architecture

```
Clients (thin)  ──HTTP/JSON──►  Refine Core API  ──OpenAI-compatible API──►  Qwen3 8B
Chrome ext | Desktop | Android | iOS     (prompts, tones, validation)       (llama.cpp server, HF GGUF)
```

- **Core API** (Python, FastAPI) holds ALL prompt logic, so every client stays thin and prompts are written once.
- Chrome extension and desktop app may call the local model server directly in "local mode" via the same prompt files (shared in `/packages/prompts`).
- Text never leaves the user's machine or their own self-hosted server.

## 3. Repo structure

```
refine/
├── SPEC.md
├── CLAUDE.md                # rules for the AI coding tool (see section 9)
├── packages/
│   └── prompts/
│       ├── clarify.md
│       ├── rewrite.md
│       └── tones.json
├── apps/
│   ├── api/                 # FastAPI service
│   │   ├── main.py
│   │   ├── llm.py           # ONLY file that knows the backend (llama.cpp default, Ollama optional)
│   │   ├── schemas.py       # Pydantic models
│   │   └── tests/
│   ├── chrome-extension/    # Manifest V3, TypeScript
│   ├── desktop/             # Tauri + React (later)
│   ├── android/             # Kotlin (later)
│   └── ios/                 # Swift (later)
└── eval/
    ├── samples.jsonl        # 20+ test drafts
    └── run_eval.py
```

## 4. API contract

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
    { "id": "goal", "q": "What's the goal?", "options": ["Request", "Follow up", "Inform"] }
  ]
}
```
If the draft is already clear, return `{ "needs_clarification": false, "questions": [] }`. Maximum 3 questions. Each has 2 to 5 options and the UI always adds an "Other / skip" choice.

### POST /rewrite
Request:
```json
{
  "text": "hey can u send the report",
  "tone": "formal",
  "answers": { "audience": "Manager", "goal": "Request" },
  "variants": 3,
  "seed": 4821
}
```
Response:
```json
{ "variants": [ { "text": "...", "notes": "Made more polite and specific." } ] }
```

### GET /tones
Returns the contents of `tones.json`.

## 5. Model and backend setup (Qwen3 8B from Hugging Face)

**Model**: `Qwen/Qwen3-8B-GGUF`, file `Qwen3-8B-Q4_K_M.gguf` (about 5 GB, needs roughly 6 GB free RAM).

**Run the server (default: llama.cpp)**
```
llama-server -hf Qwen/Qwen3-8B-GGUF:Q4_K_M --port 8080
```
This exposes an OpenAI-compatible API at `http://localhost:8080/v1`.

**Alternative backend (Ollama)**
```
ollama pull hf.co/Qwen/Qwen3-8B-GGUF:Q4_K_M
```
**Full safetensors model** (`Qwen/Qwen3-8B`, about 16 GB) is only for machines with a GPU (serve with vLLM or `transformers`, passing `enable_thinking=False` to `apply_chat_template`). For laptops, use the GGUF.

**Config (`apps/api/.env`)**
```
LLM_BACKEND=llamacpp          # or: ollama
LLM_BASE_URL=http://localhost:8080/v1
LLM_MODEL=qwen3-8b
```
`llm.py` is the only file that reads these. Switching backends must never require changes outside it.

**Request settings**
- Disable thinking mode for speed: send `"chat_template_kwargs": {"enable_thinking": false}` in the request body (llama.cpp), or `"think": false` (Ollama). Fallback for either: append `/no_think` to the user message.
- Clarify call: `temperature 0.2`, and enforce valid JSON with `response_format` set to a `json_schema` (llama.cpp) or the `format` field (Ollama).
- Rewrite call: `temperature 0.8`, `top_p 0.9`, a new random `seed` per Regenerate. For multiple variants, make separate calls with different seeds, or one call asking for N variants in JSON.
- Hard rules: never add facts the user didn't write, preserve names, numbers, dates and links, keep the original language.
- Strip any `<think>...</think>` blocks from output defensively before returning it.

## 6. Starting prompts

### packages/prompts/clarify.md (system prompt)
```
You are a writing assistant that decides whether a draft needs more
information before it can be rewritten well.

Given a draft message, decide what is genuinely missing that would change
how it should be rewritten. Consider: who the audience is, the goal of the
message, the desired tone, and any missing key detail (a date, a name, an amount).

Rules:
- Ask at most 3 questions. Ask 0 if the draft is already clear.
- Never ask about anything already obvious from the draft.
- Each question needs 2-5 short multiple-choice options.
- Respond ONLY with JSON matching the schema. No explanation.

Schema:
{"needs_clarification": boolean,
 "questions": [{"id": string, "q": string, "options": [string]}]}
```

### packages/prompts/rewrite.md (system prompt)
```
You are an expert editor. Rewrite the user's draft.

Tone: {{tone_name}} - {{tone_description}}
Audience: {{audience}}   Goal: {{goal}}

Rules:
- Keep the original meaning. Do NOT invent facts, names, dates or numbers.
- Preserve links, @mentions, emojis, and line breaks where sensible.
- Keep the same language as the draft.
- Match length to the tone unless it says otherwise.
- Output ONLY the rewritten text. No preamble, no quotes, no explanations.

Style guidance for this attempt: {{variation_hint}}
```

`{{variation_hint}}` rotates between options such as "lead with the main point", "use shorter sentences", "warmer opening", "more direct", so regenerated results really differ.

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

## 7. Chrome extension spec (Manifest V3)

- **Content script**: detect focus on `<textarea>`, `<input type=text>` and `[contenteditable]`; show a small floating button near the field.
- **Popup UI** (shadow DOM, so page CSS can't break it): step 1 shows the clarify questions as chips; step 2 shows tone chips plus the variants list with Replace, Regenerate and Copy buttons.
- **Replace text**: for `textarea`, set value and dispatch an `input` event; for `contenteditable`, use `document.execCommand('insertText')` or the Selection/Range API so editors like Gmail and LinkedIn register the change.
- **Service worker**: all network calls (avoids page CORS issues). Configurable API URL in the options page (default `http://localhost:8000`).
- **Also**: right-click menu "Refine selected text" and a keyboard shortcut (default Ctrl/Cmd+Shift+R).
- **Permissions**: keep minimal (`activeTab`, `storage`, `contextMenus`) and never send text anywhere except the configured URL.
- Direct mode (extension calls the model server without the Core API): add the server URL to `host_permissions`. If using Ollama, also set `OLLAMA_ORIGINS` to allow the extension origin. Document this in the README.

## 8. Build slices (do in order, test each before moving on)

0. **Slice 0**: Start `llama-server` with the HF GGUF and confirm a raw curl request to `/v1/chat/completions` returns text with thinking off.
1. **Slice 1**: `apps/api` with `/rewrite` only, hardcoded tone, via `llm.py`. Test with curl.
2. **Slice 2**: `/clarify` with schema-enforced JSON; add `/tones`.
3. **Slice 3**: `eval/run_eval.py` runs 20 sample drafts and checks that the JSON is valid and the output differs between tones and seeds.
4. **Slice 4**: Chrome extension: floating button on a plain textarea, replace in place.
5. **Slice 5**: Full popup flow (clarify, tone, variants, regenerate).
6. **Slice 6**: Gmail, LinkedIn and Google Docs compatibility fixes.
7. **Slice 7**: Options page, README, demo GIF, MIT license.
8. **Later**: Desktop (Tauri), Android (text-selection action, then keyboard), iOS (share extension, then keyboard).

## 9. CLAUDE.md (rules for the AI coding tool)

```
# Project rules
- Read SPEC.md before every task. Work on ONE slice at a time.
- Stack: Python 3.11 + FastAPI + Pydantic for the API; TypeScript for the extension.
- All prompts live in packages/prompts/. Never hardcode prompts in code.
- Never send user text to any external service. Only the configured local/self-hosted API.
- Only llm.py may know about the model backend (llama.cpp or Ollama). Read its settings from .env.
- Validate every model output against the schema; retry once on invalid JSON, then fail gracefully.
- Add a test for every new endpoint. Run the tests before saying a slice is done.
- Keep functions small and commented. Explain any non-obvious decision in the PR/commit message.
- Do not add dependencies without saying why.
```

## 10. Definition of done (v1 demo)

In Chrome, the user types a rough email in Gmail, clicks the sparkle button, answers 1 to 2 popup questions, picks "Formal", sees 3 variants within about 5 seconds on a typical laptop, clicks Replace, and the text is swapped in place. Regenerate gives noticeably different wording. Everything runs locally with no network calls beyond localhost.
