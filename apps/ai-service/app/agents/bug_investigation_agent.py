from app.graph.state import GraphState
from app.lib.llm import get_llm
from app.tools.github_context import fetch_recent_commits
from app.tools.rag_search import RetrievedChunk, search_codebase

SYSTEM_PROMPT = """You are debugging a production issue. Analyze the code context AND recent \
commit history to identify the most likely root cause. Distinguish between confirmed findings \
(directly supported by code) and hypotheses (plausible but unconfirmed) — label each clearly. \
Do not guess wildly."""


def _format_chunk(chunk: RetrievedChunk) -> str:
    header = f"{chunk.file_path} (lines {chunk.start_line}-{chunk.end_line})"
    if chunk.name:
        header += f" — {chunk.chunk_type} `{chunk.name}`"
    return f"### {header}\n```\n{chunk.content}\n```"


def _build_context_block(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return "No relevant code context was found in the repository for this query."
    return "\n\n".join(_format_chunk(chunk) for chunk in chunks)


def _format_commit(commit: dict) -> str:
    files = ", ".join(commit["files_changed"]) or "no file list available"
    return f"- {commit['sha'][:7]} ({commit['date']}) by {commit['author']}: {commit['message']} [files: {files}]"


def _build_commits_block(commits: list[dict]) -> str:
    if not commits:
        return "No recent commits were found for the affected files."
    return "\n".join(_format_commit(commit) for commit in commits)


def _format_previous_issues(verdict: dict) -> str:
    issues = [*verdict["grounding_issues"], *verdict["missing_info"]]
    bullet_list = "\n".join(f"- {issue}" for issue in issues)
    return f"Your previous answer had these issues:\n{bullet_list}\nPlease address them specifically."


async def bug_investigation_node(state: GraphState) -> GraphState:
    # Same "is this a retry" signal architecture_agent_node uses:
    # reviewer_verdict is only set once a full round has completed.
    previous_verdict = state.get("reviewer_verdict")
    if previous_verdict is not None:
        state["regeneration_count"] += 1

    chunks = await search_codebase(state["repo_id"], state["query"])
    state["retrieved_chunks"] = [chunk.model_dump() for chunk in chunks]

    # Preserves retrieval order while deduping, so paths from the most
    # relevant chunks stay first.
    affected_file_paths = list(dict.fromkeys(chunk.file_path for chunk in chunks))

    commits = await fetch_recent_commits(state["repo_id"], affected_file_paths)
    state["github_context"] = {"commits": commits}

    context_block = _build_context_block(chunks)
    commits_block = _build_commits_block(commits)

    user_content = (
        f"Code context:\n\n{context_block}\n\n"
        f"Recent commit history for the affected files:\n{commits_block}\n\n"
        f"Question: {state['query']}"
    )
    if previous_verdict is not None:
        user_content += f"\n\n{_format_previous_issues(previous_verdict)}"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *state["chat_history"],
        {"role": "user", "content": user_content},
    ]

    llm = get_llm("bug_investigation")
    result = await llm.ainvoke(messages)

    # result.content is typed as str | list[str | dict] (Anthropic can return
    # content blocks), but for a plain text response like this it's always a
    # str — normalize defensively rather than assuming the narrower type.
    content = result.content
    if isinstance(content, list):
        content = "".join(block if isinstance(block, str) else block.get("text", "") for block in content)

    state["generated_response"] = content
    return state
