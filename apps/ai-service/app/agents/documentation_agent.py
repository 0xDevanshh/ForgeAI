from collections import defaultdict

from app.graph.state import GraphState
from app.lib.llm import get_llm
from app.tools.rag_search import RetrievedChunk, search_codebase

SYSTEM_PROMPT = """Generate clear technical documentation for this module. Include: purpose of \
each component, function signatures and what they do, how components interact, any API \
endpoints found, and key dependencies. Only document what's shown in the provided code — do \
not invent functionality. Format the response as markdown, with headers per file/component."""

# Higher than other agents' default — documentation needs broad coverage of
# a module, not just the single most-relevant chunk.
TOP_K = 15


def _group_by_file(chunks: list[RetrievedChunk]) -> dict[str, list[RetrievedChunk]]:
    grouped: dict[str, list[RetrievedChunk]] = defaultdict(list)
    for chunk in chunks:
        grouped[chunk.file_path].append(chunk)
    return grouped


def _format_chunk(chunk: RetrievedChunk) -> str:
    header = f"lines {chunk.start_line}-{chunk.end_line}"
    if chunk.name:
        header += f" — {chunk.chunk_type} `{chunk.name}`"
    return f"#### {header}\n```\n{chunk.content}\n```"


def _build_context_block(grouped: dict[str, list[RetrievedChunk]]) -> str:
    if not grouped:
        return "No relevant code context was found in the repository for this query."
    sections = [
        f"### {file_path}\n\n" + "\n\n".join(_format_chunk(chunk) for chunk in file_chunks)
        for file_path, file_chunks in grouped.items()
    ]
    return "\n\n".join(sections)


def _format_previous_issues(verdict: dict) -> str:
    issues = [*verdict["grounding_issues"], *verdict["missing_info"]]
    bullet_list = "\n".join(f"- {issue}" for issue in issues)
    return f"Your previous answer had these issues:\n{bullet_list}\nPlease address them specifically."


async def documentation_node(state: GraphState) -> GraphState:
    # Same "is this a retry" signal architecture_agent_node uses:
    # reviewer_verdict is only set once a full round has completed.
    previous_verdict = state.get("reviewer_verdict")
    if previous_verdict is not None:
        state["regeneration_count"] += 1

    chunks = await search_codebase(state["repo_id"], state["query"], top_k=TOP_K)
    state["retrieved_chunks"] = [chunk.model_dump() for chunk in chunks]

    grouped = _group_by_file(chunks)
    context_block = _build_context_block(grouped)

    user_content = f"Code context, grouped by file:\n\n{context_block}\n\nRequest: {state['query']}"
    if previous_verdict is not None:
        user_content += f"\n\n{_format_previous_issues(previous_verdict)}"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *state["chat_history"],
        {"role": "user", "content": user_content},
    ]

    llm = get_llm("documentation")
    result = await llm.ainvoke(messages)

    # result.content is typed as str | list[str | dict] (Anthropic can return
    # content blocks), but for a plain text response like this it's always a
    # str — normalize defensively rather than assuming the narrower type.
    content = result.content
    if isinstance(content, list):
        content = "".join(block if isinstance(block, str) else block.get("text", "") for block in content)

    state["generated_response"] = content
    return state
