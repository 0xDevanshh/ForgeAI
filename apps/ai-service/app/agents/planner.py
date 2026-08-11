import logging
from typing import Literal

from pydantic import BaseModel

from app.graph.state import GraphState
from app.lib.llm import get_llm

logger = logging.getLogger(__name__)

CONFIDENCE_WARNING_THRESHOLD = 0.6

SYSTEM_PROMPT = """You are a routing classifier for a codebase assistant. Given a user's \
question about a code repository, classify it into exactly one of these intents:

- architecture: questions about how the system/code is structured or how something works \
overall (e.g. "Explain how X works", "How is the auth flow structured?")
- bug_investigation: questions about why something is failing, broken, or behaving \
unexpectedly (e.g. "Why is X failing?", "This test keeps failing, why?")
- pr_summary: requests to summarize a commit, pull request, or set of changes \
(e.g. "Summarize commit abc123", "What changed in this PR?")
- documentation: requests to generate or write documentation \
(e.g. "Generate docs for X", "Write a README section for this module")

Examples:
Query: "Explain how the authentication middleware works"
Intent: architecture

Query: "Why is the login endpoint returning 500 errors"
Intent: bug_investigation

Query: "Summarize commit abc123"
Intent: pr_summary

Query: "Generate docs for the repo_cloner module"
Intent: documentation

Classify the user's query below. Provide your confidence (0.0-1.0) and a brief reasoning \
for your classification."""


class IntentClassification(BaseModel):
    intent: Literal["architecture", "bug_investigation", "pr_summary", "documentation"]
    confidence: float
    reasoning: str


async def planner_node(state: GraphState) -> GraphState:
    llm = get_llm("planner")
    structured_llm = llm.with_structured_output(IntentClassification)

    result: IntentClassification = await structured_llm.ainvoke(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": state["query"]},
        ]
    )

    if result.confidence < CONFIDENCE_WARNING_THRESHOLD:
        # Still proceed with the top choice for now — this is just a signal
        # for future prompt-tuning, not something worth failing/retrying on.
        logger.warning(
            "Low-confidence intent classification: intent=%s confidence=%.2f reasoning=%s query=%r",
            result.intent,
            result.confidence,
            result.reasoning,
            state["query"],
        )

    state["intent"] = result.intent
    return state
