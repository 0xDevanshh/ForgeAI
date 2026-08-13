from langchain_anthropic import ChatAnthropic

from app.config import agent_models

_llm_cache: dict[str, ChatAnthropic] = {}

# Claude 5 models reject non-default sampling parameters — a `temperature` of
# 0.2 returns `400 temperature is deprecated for this model`, which surfaced as
# a 500 on every query. Behaviour is steered by the agent prompts instead.
#
# max_tokens also has to cover *thinking*, not just the answer: adaptive
# thinking is on by default on these models and shares this budget, so the
# previous 4096 would truncate longer answers mid-response. 16000 is the
# recommended ceiling for non-streaming calls (beyond that, HTTP timeouts
# become the constraint and the call should stream instead).
MAX_TOKENS = 16000


def get_llm(agent_name: str) -> ChatAnthropic:
    model_name = getattr(agent_models, agent_name)
    if model_name not in _llm_cache:
        _llm_cache[model_name] = ChatAnthropic(
            model=model_name,
            max_tokens=MAX_TOKENS,
        )
    return _llm_cache[model_name]
