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


async def architecture_agent_node(state: GraphState) -> GraphState:
    chunks = await search_codebase(state["repo_id"], state["query"])
    # Stored on state (not just used locally) so the Reviewer node can later
    # check the generated response's claims against the same chunks.
    state["retrieved_chunks"] = [chunk.model_dump() for chunk in chunks]

    context_block = _build_context_block(chunks)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *state["chat_history"],
        {
            "role": "user",
            "content": f"Code context:\n\n{context_block}\n\nQuestion: {state['query']}",
        },
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
