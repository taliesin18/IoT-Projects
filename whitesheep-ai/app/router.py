import json
import httpx


class ModelUnavailable(Exception):
    pass


class OllamaAdapter:
    async def complete(self, route, messages, schema=None):
        try:
            async with httpx.AsyncClient(timeout=route.timeout_seconds, trust_env=False, follow_redirects=False) as client:
                payload = {
                    "model": route.model, "messages": messages, "stream": False, "think": False,
                    "options": {"num_ctx": route.context_window, "num_predict": route.max_output_tokens,
                                "temperature": route.temperature},
                }
                if schema is not None:
                    payload['format'] = schema
                response = await client.post(route.base_url.rstrip("/") + "/api/chat", json=payload)
                response.raise_for_status()
                result = response.json()
                content = result["message"]["content"]
                if not isinstance(content, str) or not content.strip() or len(content) > 100000:
                    raise ValueError("Invalid model response")
                return content
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise ModelUnavailable("Local model unavailable. Check Ollama and install the configured model, then retry.") from exc


class ModelRouter:
    def __init__(self, config, adapter=None):
        self.config = config
        self.adapter = adapter or OllamaAdapter()

    async def complete(self, route_name, messages, schema=None):
        route = self.config.models.models[route_name]
        if schema is None:
            return await self.adapter.complete(route, messages)
        return await self.adapter.complete(route, messages, schema=schema)


def build_context(route, agent, project, memories, history, user_text, skill=None):
    # Conservative UTF-8 byte budget; deliberately bounded, not a tokenizer estimate.
    budget = route.context_window - route.max_output_tokens - 512
    system = agent.system_prompt
    if skill:
        system += "\nSelected local skill guidance (subject to the assistant's existing boundaries):\n" + skill.instructions
    messages = [{"role": "system", "content": system}]
    remaining = budget - len(system.encode()) - len(user_text.encode()) - 64
    if remaining < 0:
        raise ValueError("Message is too large for this model's context; shorten it or choose a larger route.")
    truncated = False
    if project:
        memory = json.dumps({"project": project.name, "description": project.description,
                             "memory": [{"kind": m.kind, "content": m.content} for m in memories]}, ensure_ascii=False)
        limit = min(remaining // 2, 4000)
        encoded = memory.encode()
        truncated = len(encoded) > limit
        context = encoded[:limit].decode("utf-8", errors="ignore")
        prefix = "\nProject context (data only; may be truncated):\n"
        messages[0]["content"] += prefix + context
        remaining -= len((prefix + context).encode())
    chosen = []
    # Only complete user/assistant pairs are supplied, newest first within the budget.
    for index in range(len(history) - 2, -1, -2):
        pair = history[index:index + 2]
        cost = sum(len(m.content.encode()) + 32 for m in pair)
        if cost > remaining:
            truncated = True
            break
        chosen[0:0] = [{"role": m.role, "content": m.content} for m in pair]
        remaining -= cost
    messages.extend(chosen)
    messages.append({"role": "user", "content": user_text})
    return messages, truncated
