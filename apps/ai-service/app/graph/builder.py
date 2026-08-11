from langgraph.graph import END, StateGraph

from app.agents.architecture_agent import architecture_agent_node
from app.agents.planner import planner_node
from app.graph.state import GraphState


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

    graph.add_edge("architecture_agent", END)
    graph.add_edge("passthrough", END)

    return graph.compile()
