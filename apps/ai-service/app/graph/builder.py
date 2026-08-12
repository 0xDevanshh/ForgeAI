from langgraph.graph import END, StateGraph

from app.agents.architecture_agent import architecture_agent_node, attach_incomplete_flag
from app.agents.bug_investigation_agent import bug_investigation_node
from app.agents.documentation_agent import documentation_node
from app.agents.planner import planner_node
from app.agents.pr_summary_agent import pr_summary_node
from app.agents.reviewer import reviewer_node
from app.graph.state import GraphState


def should_regenerate(state: GraphState) -> str:
    verdict = state["reviewer_verdict"]
    if verdict["approved"]:
        return "end"
    if state["regeneration_count"] >= 2:  # max 2 retries (3 total attempts)
        attach_incomplete_flag(state)  # give up, but flag the response as unverified
        return "end"
    # Reviewer is generic across agents, so "regenerate" must route back to
    # whichever agent produced this response, not a hardcoded node.
    return f"regenerate_{state['intent']}"


# pr_summary_node skips straight to END when it can't find a commit
# reference in the query (a clarification request has no context for the
# Reviewer to check) — github_context is only ever set on the full path, so
# its presence is what distinguishes the two outcomes here.
def after_pr_summary(state: GraphState) -> str:
    return "reviewer" if state.get("github_context") is not None else "end"


def build_graph():
    graph = StateGraph(GraphState)

    graph.add_node("planner", planner_node)
    graph.add_node("architecture_agent", architecture_agent_node)
    graph.add_node("bug_investigation_agent", bug_investigation_node)
    graph.add_node("pr_summary_agent", pr_summary_node)
    graph.add_node("documentation_agent", documentation_node)
    graph.add_node("reviewer", reviewer_node)

    graph.set_entry_point("planner")

    graph.add_conditional_edges(
        "planner",
        lambda state: state["intent"],  # routing function
        {
            "architecture": "architecture_agent",
            "bug_investigation": "bug_investigation_agent",
            "pr_summary": "pr_summary_agent",
            "documentation": "documentation_agent",
        },
    )

    graph.add_edge("architecture_agent", "reviewer")
    graph.add_edge("bug_investigation_agent", "reviewer")
    graph.add_edge("documentation_agent", "reviewer")
    graph.add_conditional_edges(
        "pr_summary_agent",
        after_pr_summary,
        {"reviewer": "reviewer", "end": END},
    )
    graph.add_conditional_edges(
        "reviewer",
        should_regenerate,
        {
            "end": END,
            "regenerate_architecture": "architecture_agent",
            "regenerate_bug_investigation": "bug_investigation_agent",
            "regenerate_pr_summary": "pr_summary_agent",
            "regenerate_documentation": "documentation_agent",
        },
    )

    return graph.compile()
