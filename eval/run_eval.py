"""Run the small, hand-labeled local-model evaluation set.

The model server must be running at the LLM_BASE_URL configured for Refine.
This reports metrics and raw outputs for human review; it is not a quality
certification or a substitute for expert evaluation.
"""

import asyncio
import json
import pathlib
import sys

from apps.api.main import clarify, rewrite
from apps.api.schemas import ClarifyContext, ClarifyRequest, RewriteRequest

SAMPLES_FILE = pathlib.Path(__file__).with_name("samples.jsonl")


def score_clarification(rows: list[dict]) -> dict[str, float | int]:
    tp = sum(r["expected"] and r["predicted"] for r in rows)
    tn = sum(not r["expected"] and not r["predicted"] for r in rows)
    fp = sum(not r["expected"] and r["predicted"] for r in rows)
    fn = sum(r["expected"] and not r["predicted"] for r in rows)

    def ratio(numerator: int, denominator: int) -> float:
        return round(numerator / denominator, 3) if denominator else 0.0

    return {
        "count": len(rows),
        "accuracy": ratio(tp + tn, len(rows)),
        "precision": ratio(tp, tp + fp),
        "recall": ratio(tp, tp + fn),
        "specificity": ratio(tn, tn + fp),
        "true_positive": tp,
        "true_negative": tn,
        "false_positive": fp,
        "false_negative": fn,
    }


async def collect_rewrite(text: str, tone: str, seed: int) -> str:
    response = await rewrite(
        RewriteRequest(text=text, tone=tone, answers={}, seed=seed)
    )
    chunks: list[str] = []
    async for event in response.body_iterator:
        frame = event.decode("utf-8") if isinstance(event, bytes) else str(event)
        for part in frame.split("\n\n"):
            if not part.startswith("data: "):
                continue
            content = part[6:]
            if content == "[DONE]":
                return "".join(chunks).strip()
            chunks.append(content.replace("\\n", "\n"))
    return "".join(chunks).strip()


async def run() -> int:
    samples = [
        json.loads(line)
        for line in SAMPLES_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    rows: list[dict] = []
    rewrites: list[dict] = []

    for index, sample in enumerate(samples, start=1):
        expected = sample["comment"].startswith("Vague")
        response = await clarify(
            ClarifyRequest(
                text=sample["text"],
                context=ClarifyContext(app="eval-test"),
            )
        )
        rows.append(
            {
                "index": index,
                "expected": expected,
                "predicted": response.needs_clarification,
                "question_count": len(response.questions),
            }
        )
        rewritten = await collect_rewrite(
            sample["text"], sample.get("tone", "formal"), seed=1942 + index
        )
        rewrites.append(
            {
                "index": index,
                "tone": sample.get("tone", "formal"),
                "output": rewritten,
                "nonempty": bool(rewritten),
            }
        )
        print(
            f"{index:02d} clarify expected={expected} "
            f"predicted={response.needs_clarification}; "
            f"rewrite={'nonempty' if rewritten else 'EMPTY'}",
            flush=True,
        )

    print("\nClarification metrics (hand-labeled set):")
    print(json.dumps(score_clarification(rows), indent=2))
    nonempty = sum(row["nonempty"] for row in rewrites)
    print(f"\nRewrite validity: {nonempty}/{len(rewrites)} non-empty outputs")
    print("Review the outputs below for meaning, tone, factual additions, and fluency:")
    for row in rewrites:
        print(f"{row['index']:02d} [{row['tone']}] {row['output']}")
    print("\nRewrite semantic quality still requires human review.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(run()))
    except Exception as error:
        print(
            f"Evaluation could not complete ({type(error).__name__}). "
            "Check that the configured local model server is running.",
            file=sys.stderr,
        )
        raise SystemExit(1)
