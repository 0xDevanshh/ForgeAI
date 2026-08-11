from langgraph.graph import END, StateGraph

from app.agents.architecture_agent import architecture_agent_node, attach_incomplete_flag
from app.agents.bug_investigation_agent import bug_investigation_node
from app.agents.planner import planner_node
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


def passthrough_node(state: GraphState) -> GraphState:
    # Temporary — exists only to prove routing works end-to-end before the
    # real pr_summary/documentation nodes land in Steps 12/13. Replaced
    # node-by-node as each one is built.
    state["generated_response"] = f"[DEBUG] Classified as: {state['intent']}"
    return state


def build_graph():
    graph = StateGraph(GraphState)

    graph.add_node("planner", planner_node)
    graph.add_node("architecture_agent", architecture_agent_node)
    graph.add_node("bug_investigation_agent", bug_investigation_node)
    graph.add_node("reviewer", reviewer_node)
    graph.add_node("passthrough", passthrough_node)

    graph.set_entry_point("planner")

    graph.add_conditional_edges(
        "planner",
        lambda state: state["intent"],  # routing function
        {
            "architecture": "architecture_agent",
            "bug_investigation": "bug_investigation_agent",
            "pr_summary": "passthrough",  # will become a real node in Steps 12/13
            "documentation": "passthrough",
        },
    )

    graph.add_edge("architecture_agent", "reviewer")
    graph.add_edge("bug_investigation_agent", "reviewer")
    graph.add_conditional_edges(
        "reviewer",
        should_regenerate,
        {
            "end": END,
            "regenerate_architecture": "architecture_agent",
            "regenerate_bug_investigation": "bug_investigation_agent",
        },
    )
    graph.add_edge("passthrough", END)

    return graph.compile()
