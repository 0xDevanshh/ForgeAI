import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.graph.builder import build_graph
from app.middleware.internal_auth import verify_internal_key
from app.middleware.rate_limit import rate_limiter

logger = logging.getLogger(__name__)

# Bare "/query", not under /internal — still gated by the same
# verify_internal_key dependency, just a distinct top-level path since
# that's what Node's own matching endpoint calls.
router = APIRouter(
    dependencies=[
        Depends(verify_internal_key),
        Depends(rate_limiter(max_requests=10, window_seconds=60)),
    ]
)


class QueryRequest(BaseModel):
    query: str
    repo_id: str
    chat_session_id: str
    chat_history: list[dict]


@router.post("/query")
async def query(body: QueryRequest) -> StreamingResponse:
    async def event_generator():
        graph = build_graph()
        initial_state = {
            "query": body.query,
            "repo_id": body.repo_id,
            "chat_history": body.chat_history,
            "intent": None,
            "retrieved_chunks": None,
            "github_context": None,
            "generated_response": None,
            "reviewer_verdict": None,
            "regeneration_count": 0,
        }

        async for event in graph.astream(initial_state, stream_mode="updates"):
            # event is a dict like { node_name: updated_state_fields }
            node_name = list(event.keys())[0]
            yield f"data: {json.dumps({'node': node_name, 'data': event[node_name]})}\n\n"

        yield f"data: {json.dumps({'node': 'done'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
