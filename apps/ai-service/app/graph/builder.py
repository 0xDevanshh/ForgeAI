from langgraph.graph import END, StateGraph

from app.agents.architecture_agent import architecture_agent_node, attach_incomplete_flag
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
    return "regenerate"


def passthrough_node(state: GraphState) -> GraphState:
    # Temporary — exists only to prove routing works end-to-end before the
    # real architecture/bug_investigation/pr_summary/documentation nodes
    # land in Steps 9/11/12/13. Replaced node-by-node as each one is built.
    state["generated_response"] = f"[DEBUG] Classified as: {state['intent']}"
    return state


def build_graph():
    graph = StateGraph(GraphState)

    graph.add_node("planner", planner_node)
    graph.add_node("architecture_agent", architecture_agent_node)
    graph.add_node("reviewer", reviewer_node)
    graph.add_node("passthrough", passthrough_node)

    graph.set_entry_point("planner")

    graph.add_conditional_edges(
        "planner",
        lambda state: state["intent"],  # routing function
        {
            "architecture": "architecture_agent",
            "bug_investigation": "passthrough",  # will become real nodes in
            "pr_summary": "passthrough",  # Steps 11/12/13
            "documentation": "passthrough",
        },
    )

    graph.add_edge("architecture_agent", "reviewer")
    graph.add_conditional_edges(
        "reviewer",
        should_regenerate,
        {"end": END, "regenerate": "architecture_agent"},
    )
    graph.add_edge("passthrough", END)

    return graph.compile()
