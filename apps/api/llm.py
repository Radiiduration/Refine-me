"""Local model adapter. This is the only module that knows model APIs."""

import json
import os
import re
from typing import Any, AsyncGenerator

import httpx
from dotenv import load_dotenv

load_dotenv()

LLM_BACKEND = os.getenv("LLM_BACKEND", "llamacpp")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8080/v1").rstrip("/")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen3-4b-q4km")
TIMEOUT = 60.0
MAX_OUTPUT_TOKENS = 2048
VARIATION_HINTS = [
    "lead with the main point", "use shorter sentences", "warmer opening",
    "more direct", "stronger action verbs", "simpler vocabulary",
]


def _strip_think(text: str) -> str:
    return re.sub(r"<think>.*?</think>|</?think>", "", text, flags=re.DOTALL).strip()


class _ThinkStreamFilter:
    """Hold partial tags and reasoning blocks so split SSE chunks cannot leak them."""

    OPEN = "<think>"
    CLOSE = "</think>"

    def __init__(self) -> None:
        self.buffer = ""
        self.in_think = False

    def feed(self, text: str, final: bool = False) -> str:
        self.buffer += text
        visible: list[str] = []
        while self.buffer:
            marker = self.CLOSE if self.in_think else self.OPEN
            at = self.buffer.find(marker)
            if at >= 0:
                if not self.in_think:
                    visible.append(self.buffer[:at])
                self.buffer = self.buffer[at + len(marker):]
                self.in_think = not self.in_think
                continue
            if self.in_think:
                if final:
                    self.buffer = ""
                else:
                    self.buffer = self.buffer[-(len(marker) - 1):]
                break
            if final:
                visible.append(self.buffer.replace(self.CLOSE, ""))
                self.buffer = ""
            else:
                keep = len(marker) - 1
                if len(self.buffer) > keep:
                    visible.append(self.buffer[:-keep])
                    self.buffer = self.buffer[-keep:]
                break
        return "".join(visible)


def _endpoint(path: str) -> str:
    if LLM_BACKEND == "ollama":
        return f"{LLM_BASE_URL}/api/{path}"
    return f"{LLM_BASE_URL}/{path}"


def _build_payload(messages: list[dict], *, stream: bool, temperature: float,
                   seed: int | None = None, schema: dict | None = None) -> dict:
    if LLM_BACKEND == "ollama":
        payload: dict[str, Any] = {
            "model": LLM_MODEL,
            "messages": messages,
            "stream": stream,
            "think": False,
            "options": {"temperature": temperature, "top_p": 0.9, "num_predict": MAX_OUTPUT_TOKENS},
        }
        if seed is not None:
            payload["options"]["seed"] = seed
        if schema is not None:
            payload["format"] = schema
        return payload

    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "stream": stream,
        "temperature": temperature,
        "top_p": 0.9,
        "max_tokens": MAX_OUTPUT_TOKENS,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    if seed is not None:
        payload["seed"] = seed
    if schema is not None:
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "refine_response", "strict": False, "schema": schema},
        }
    return payload


def _content_from_response(data: dict) -> str:
    if LLM_BACKEND == "ollama":
        return data["message"]["content"]
    return data["choices"][0]["message"]["content"]


async def generate_text_stream(
    messages: list[dict], temperature: float = 0.8, seed: int | None = None,
) -> AsyncGenerator[str, None]:
    payload = _build_payload(messages, stream=True, temperature=temperature, seed=seed)
    endpoint = _endpoint("chat" if LLM_BACKEND == "ollama" else "chat/completions")
    think_filter = _ThinkStreamFilter()
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        async with client.stream("POST", endpoint, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                if LLM_BACKEND == "ollama":
                    data = json.loads(line)
                    chunk = data.get("message", {}).get("content", "")
                    done = data.get("done", False)
                else:
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if raw == "[DONE]":
                        break
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    delta = data.get("choices", [{}])[0].get("delta", {})
                    chunk = delta.get("content", "") or ""
                    done = False
                if chunk:
                    clean = think_filter.feed(chunk)
                    if clean:
                        yield clean
                if done:
                    break
            remaining = think_filter.feed("", final=True)
            if remaining:
                yield remaining


async def generate_json(messages: list[dict], schema: dict,
                        temperature: float = 0.2) -> dict:
    payload = _build_payload(messages, stream=False, temperature=temperature, schema=schema)
    endpoint = _endpoint("chat" if LLM_BACKEND == "ollama" else "chat/completions")
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        last_error: Exception | None = None
        for _ in range(2):
            try:
                response = await client.post(endpoint, json=payload)
                response.raise_for_status()
                return json.loads(_strip_think(_content_from_response(response.json())).strip())
            except (json.JSONDecodeError, KeyError, IndexError) as exc:
                last_error = exc
        raise ValueError(f"Model returned invalid JSON after 2 attempts: {last_error}")


async def check_health() -> bool:
    path = "tags" if LLM_BACKEND == "ollama" else "models"
    endpoint = _endpoint(path)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(endpoint)
            return response.status_code == 200
    except (httpx.HTTPError, OSError):
        return False


def variation_hint(seed: int) -> str:
    return VARIATION_HINTS[seed % len(VARIATION_HINTS)]
