# Project rules for Refine

Refine is an open-source, privacy-first writing refiner (a Grammarly alternative). Read SPEC.md before every task.

## How to work
- Work on ONE slice at a time, in the order listed in SPEC.md section 8. Never start the next slice until I say so.
- Before writing code for a slice, state your plan in a few lines.
- After finishing a slice, run the tests, then tell me exactly how I can try it myself (a curl command, or how to load the extension in Chrome).
- Only do what I ask. If you think something extra is needed, suggest it and wait.
- When something fails, explain the cause in simple terms before fixing it.
- Commit to git after each working slice with a clear message (only when I ask).

## Stack
- API: Python 3.11, FastAPI, Pydantic, pytest.
- Chrome extension: TypeScript, Manifest V3.
- Model: Qwen3 8B (Hugging Face GGUF) served by llama.cpp server at http://localhost:8080/v1 (Ollama is an optional alternative).

## Code rules
- All prompts live in packages/prompts/. Never hardcode prompts in code.
- Only apps/api/llm.py may know about the model backend. It reads LLM_BACKEND, LLM_BASE_URL and LLM_MODEL from .env.
- Turn off Qwen3 thinking mode, and strip any <think>...</think> blocks from output.
- Validate every model output against its Pydantic schema. On invalid JSON, retry once, then fail gracefully with a clear error.
- Never invent facts when rewriting text. Preserve names, numbers, dates and links.
- Add a test for every new endpoint and run it before saying a slice is done.
- Keep functions small and commented. Explain any non-obvious decision.
- Do not add a dependency without telling me why.

## Privacy rules (non-negotiable)
- Never send user text to any external service. Only the configured local or self-hosted model server.
- No telemetry, analytics or tracking of any kind.
- Request the minimum browser permissions in the extension (activeTab, storage, contextMenus, plus the configured server URL).
- Never log the user's text.
