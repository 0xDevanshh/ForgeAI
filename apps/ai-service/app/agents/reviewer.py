from pydantic import BaseModel

from app.graph.state import GraphState
from app.lib.llm import get_llm

SYSTEM_PROMPT = """You are a strict reviewer. Given the ORIGINAL QUERY, the RETRIEVED CODE \
CONTEXT, and the GENERATED RESPONSE, verify:
(a) every factual claim in the response is directly supported by the retrieved context
(b) the response actually addresses what the user asked
(c) nothing is invented that isn't in the context

Flag anything that fails these checks rather than giving the benefit of the doubt."""


class ReviewVerdict(BaseModel):
    approved: bool
    grounding_issues: list[str]  # claims not supported by retrieved context
    missing_info: list[str]  # aspects of the query not addressed
    confidence: float


def _format_chunk(chunk: dict) -> str:
    header = f"{chunk['file_path']} (lines {chunk['start_line']}-{chunk['end_line']})"
    if chunk.get("name"):
        header += f" — {chunk['chunk_type']} `{chunk['name']}`"
    return f"### {header}\n```\n{chunk['content']}\n```"


def _build_context_block(chunks: list[dict] | None) -> str:
    if not chunks:
        return "No code context was retrieved for this query."
    return "\n\n".join(_format_chunk(chunk) for chunk in chunks)


async def reviewer_node(state: GraphState) -> GraphState:
    context_block = _build_context_block(state["retrieved_chunks"])

    user_content = (
        f"ORIGINAL QUERY:\n{state['query']}\n\n"
        f"RETRIEVED CODE CONTEXT:\n{context_block}\n\n"
        f"GENERATED RESPONSE:\n{state['generated_response']}"
    )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    llm = get_llm("reviewer")
    structured_llm = llm.with_structured_output(ReviewVerdict)

    verdict: ReviewVerdict = await structured_llm.ainvoke(messages)

    state["reviewer_verdict"] = verdict.model_dump()
    return state
