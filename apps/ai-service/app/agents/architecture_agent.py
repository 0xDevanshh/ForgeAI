from app.graph.state import GraphState
from app.lib.llm import get_llm
from app.tools.rag_search import RetrievedChunk, search_codebase

SYSTEM_PROMPT = """You are a senior engineer explaining code architecture. Only use the \
provided code context. If the context doesn't fully answer the question, explicitly say \
what's missing rather than guessing."""


def _format_chunk(chunk: RetrievedChunk) -> str:
    header = f"{chunk.file_path} (lines {chunk.start_line}-{chunk.end_line})"
    if chunk.name:
        header += f" — {chunk.chunk_type} `{chunk.name}`"
    return f"### {header}\n```\n{chunk.content}\n```"


def _build_context_block(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return "No relevant code context was found in the repository for this query."
    return "\n\n".join(_format_chunk(chunk) for chunk in chunks)


def _format_previous_issues(verdict: dict) -> str:
    issues = [*verdict["grounding_issues"], *verdict["missing_info"]]
    bullet_list = "\n".join(f"- {issue}" for issue in issues)
    return f"Your previous answer had these issues:\n{bullet_list}\nPlease address them specifically."


def attach_incomplete_flag(state: GraphState) -> GraphState:
    """Called by builder.should_regenerate when retries are exhausted without
    approval, so the frontend can show a "may be incomplete" indicator
    instead of presenting an unverified answer as fully trustworthy."""
    verdict = state["reviewer_verdict"]
    state["generated_response"] = {
        "response": state["generated_response"],
        "reviewer_approved": False,
        "reviewer_notes": [*verdict["grounding_issues"], *verdict["missing_info"]],
    }
    return state


async def architecture_agent_node(state: GraphState) -> GraphState:
    # reviewer_verdict is only set once a full round has completed, so its
    # presence is what distinguishes a regeneration entry from the initial
    # call — not just regeneration_count, which would otherwise need to be
    # incremented before we know whether there's a previous verdict to read.
    previous_verdict = state.get("reviewer_verdict")
    if previous_verdict is not None:
        state["regeneration_count"] += 1

    chunks = await search_codebase(state["repo_id"], state["query"])
    # Stored on state (not just used locally) so the Reviewer node can later
    # check the generated response's claims against the same chunks.
    state["retrieved_chunks"] = [chunk.model_dump() for chunk in chunks]

    context_block = _build_context_block(chunks)

    user_content = f"Code context:\n\n{context_block}\n\nQuestion: {state['query']}"
    if previous_verdict is not None:
        user_content += f"\n\n{_format_previous_issues(previous_verdict)}"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *state["chat_history"],
        {"role": "user", "content": user_content},
    ]

    llm = get_llm("architecture")
    result = await llm.ainvoke(messages)

    # result.content is typed as str | list[str | dict] (Anthropic can return
    # content blocks), but for a plain text response like this it's always a
    # str — normalize defensively rather than assuming the narrower type.
    content = result.content
    if isinstance(content, list):
        content = "".join(block if isinstance(block, str) else block.get("text", "") for block in content)

    state["generated_response"] = content
    return state
