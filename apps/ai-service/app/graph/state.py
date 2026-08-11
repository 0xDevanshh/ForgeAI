from typing import TypedDict, Optional
from pydantic import BaseModel


class GraphState(TypedDict):
    query: str                          # original user question
    repo_id: str
    chat_history: list[dict]            # previous messages for context
    intent: Optional[str]               # set by Planner: "architecture" |
                                         # "bug_investigation" |
                                         # "pr_summary" | "documentation"
    retrieved_chunks: Optional[list[dict]]  # RAG results, filled by
                                             # retrieval nodes
    github_context: Optional[dict]      # commits/diffs, filled by bug/PR
                                         # agent nodes when needed
    generated_response: Optional[str]   # the agent's answer
    reviewer_verdict: Optional[dict]     # { approved: bool, reasons:
                                          # list[str], missing_info:
                                          # list[str] }
    regeneration_count: int             # tracks how many times reviewer
                                         # rejected — used to cap retries
