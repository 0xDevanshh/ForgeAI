from langchain_anthropic import ChatAnthropic

from app.config import agent_models

_llm_cache: dict[str, ChatAnthropic] = {}


def get_llm(agent_name: str, temperature: float = 0.2) -> ChatAnthropic:
    model_name = getattr(agent_models, agent_name)
    cache_key = f"{model_name}:{temperature}"
    if cache_key not in _llm_cache:
        _llm_cache[cache_key] = ChatAnthropic(
            model=model_name,
            temperature=temperature,
            max_tokens=4096,
        )
    return _llm_cache[cache_key]
