"""
schemas.py — Pydantic models for every request and response body.

All validation lives here. main.py and tests import from this module.
"""

from typing import Any

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# /rewrite
# ---------------------------------------------------------------------------

class RewriteRequest(BaseModel):
    text: str = Field(..., min_length=1, description="The draft text to rewrite.")
    tone: str = Field("formal", description="Tone key from tones.json.")
    answers: dict[str, str] = Field(
        default_factory=dict,
        description="Answers to clarification questions keyed by question id.",
    )
    seed: int | None = Field(
        None,
        description="RNG seed for reproducibility. Random if omitted.",
    )

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be blank")
        return v


# ---------------------------------------------------------------------------
# /clarify
# ---------------------------------------------------------------------------

class ClarifyContext(BaseModel):
    app: str | None = Field(None, description="Host app name hint, e.g. 'gmail'.")


class ClarifyRequest(BaseModel):
    text: str = Field(..., min_length=1, description="The draft text to analyse.")
    context: ClarifyContext = Field(default_factory=ClarifyContext)

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be blank")
        return v


class ClarifyQuestion(BaseModel):
    id: str
    q: str
    options: list[str] = Field(..., min_length=2)


class ClarifyResponse(BaseModel):
    needs_clarification: bool
    questions: list[ClarifyQuestion] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    backend: str
    model: str
