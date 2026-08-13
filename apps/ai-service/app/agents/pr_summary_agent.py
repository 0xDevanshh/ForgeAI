import re

from app.graph.state import GraphState
from app.lib.llm import get_llm
from app.tools.github_context import (
    fetch_commit_diff,
    fetch_commit_metadata,
    fetch_recent_commits,
)
from app.tools.rag_search import RetrievedChunk, search_codebase

SYSTEM_PROMPT = """Summarize what changed, why (infer from the commit message and diff), and \
which modules/files were affected. Be concise."""

# Matches a full or short git SHA (7-40 hex chars). Requiring at least one
# a-f letter (checked below) rules out plain numbers — an issue or line
# number, say — from being mistaken for a commit reference.
_SHA_PATTERN = re.compile(r"\b[0-9a-fA-F]{7,40}\b")

# "the latest commit", "most recent commit", "last commit" — by far the most
# natural way to ask, and resolvable without troubling the user for a SHA.
_LATEST_PATTERN = re.compile(
    r"\b(latest|last|most[\s-]?recent|newest|head)\b.{0,20}\bcommit\b"
    r"|\bcommit\b.{0,20}\b(latest|last|most[\s-]?recent|newest|head)\b",
    re.IGNORECASE,
)


def refers_to_latest_commit(query: str) -> bool:
    """True when the query names the newest commit rather than a specific one."""
    return _LATEST_PATTERN.search(query) is not None


async def parse_commit_reference(query: str) -> str | None:
    """Extracts a commit SHA the user referenced in their query, e.g.
    "Summarize commit abc1234" -> "abc1234".

    Returns None if no SHA-shaped token is found — the caller then needs to
    ask for clarification rather than guessing which commit is meant.
    """
    for match in _SHA_PATTERN.finditer(query):
        candidate = match.group(0)
        if any(char in "abcdefABCDEF" for char in candidate):
            return candidate
    return None


def _format_chunk(chunk: RetrievedChunk) -> str:
    header = f"{chunk.file_path} (lines {chunk.start_line}-{chunk.end_line})"
    if chunk.name:
        header += f" — {chunk.chunk_type} `{chunk.name}`"
    return f"### {header}\n```\n{chunk.content}\n```"


def _build_context_block(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return "No related codebase context was found for this commit."
    return "\n\n".join(_format_chunk(chunk) for chunk in chunks)


def _format_previous_issues(verdict: dict) -> str:
    issues = [*verdict["grounding_issues"], *verdict["missing_info"]]
    bullet_list = "\n".join(f"- {issue}" for issue in issues)
    return f"Your previous answer had these issues:\n{bullet_list}\nPlease address them specifically."


async def pr_summary_node(state: GraphState) -> GraphState:
    # Same "is this a retry" signal architecture_agent_node uses:
    # reviewer_verdict is only set once a full round has completed.
    previous_verdict = state.get("reviewer_verdict")
    if previous_verdict is not None:
        state["regeneration_count"] += 1

    sha = await parse_commit_reference(state["query"])

    if sha is None and refers_to_latest_commit(state["query"]):
        # Resolve it rather than bouncing the question back: the newest commit
        # is exactly what fetch_recent_commits returns first.
        recent = await fetch_recent_commits(state["repo_id"], [], limit=1)
        if recent:
            sha = recent[0]["sha"]

    if sha is None:
        state["generated_response"] = (
            "I couldn't tell which commit you mean. Share the commit SHA, or ask about "
            "the latest commit and I'll pick it up from there."
        )
        # No commit to ground a claim in yet, so there's nothing for the
        # Reviewer to check — builder.py routes this case straight to END.
        return state

    diff = await fetch_commit_diff(state["repo_id"], sha)
    commit = await fetch_commit_metadata(state["repo_id"], sha)
    state["github_context"] = {"commit": commit, "diff": diff}

    # Always included for v1 — the diff alone doesn't explain *why* a change
    # was made if it touches code the commit message doesn't describe.
    # Worth pruning later if it turns out not to add value.
    chunks = await search_codebase(state["repo_id"], state["query"])
    state["retrieved_chunks"] = [chunk.model_dump() for chunk in chunks]

    context_block = _build_context_block(chunks)

    user_content = (
        f"Commit {commit['sha'][:7]} by {commit['author']} on {commit['date']}: {commit['message']}\n\n"
        f"Diff:\n```diff\n{diff}\n```\n\n"
        f"Related codebase context:\n\n{context_block}"
    )
    if previous_verdict is not None:
        user_content += f"\n\n{_format_previous_issues(previous_verdict)}"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *state["chat_history"],
        {"role": "user", "content": user_content},
    ]

    llm = get_llm("pr_summary")
    result = await llm.ainvoke(messages)

    # result.content is typed as str | list[str | dict] (Anthropic can return
    # content blocks), but for a plain text response like this it's always a
    # str — normalize defensively rather than assuming the narrower type.
    content = result.content
    if isinstance(content, list):
        content = "".join(block if isinstance(block, str) else block.get("text", "") for block in content)

    state["generated_response"] = content
    return state
