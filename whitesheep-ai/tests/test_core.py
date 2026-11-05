from pathlib import Path
from uuid import uuid4
import asyncio
import json

import pytest
import httpx
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Configuration, ModelRoute, Repository
from app.main import create_app
from app.db import Conversation
from sqlalchemy.orm import Session
from app.router import ModelUnavailable, OllamaAdapter
from app.tools import ToolDenied, ToolRegistry


HEADERS = {"X-WhiteSheep-Client": "local-web"}
CONFIG = Path(__file__).resolve().parents[1] / "config"


class FakeModel:
    def __init__(self):
        self.calls = []
        self.fail = False

    async def complete(self, route, messages):
        self.calls.append((route.model, messages))
        if self.fail:
            raise ModelUnavailable("Model offline")
        return "A practical next step."


@pytest.fixture
def workspace(tmp_path):
    fake = FakeModel()
    config = Configuration(CONFIG)
    url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
    app = create_app(url, config, fake, tmp_path / "repos")
    with TestClient(app, base_url="http://localhost", headers=HEADERS) as client:
        yield client, fake, url, config


def conversation(client, **kwargs):
    response = client.post("/api/conversations", json=kwargs)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_project_memory_chat_and_restart(workspace):
    client, fake, url, config = workspace
    project = client.post("/api/projects", json={"name": "Garden", "description": "A sensor project"}).json()
    for kind, content in [("requirement", "Budget: 3000 pesos"), ("decision", "Use an ESP32")]:
        assert client.post(f"/api/projects/{project['id']}/memory", json={"kind": kind, "content": content}).status_code == 201
    cid = conversation(client, project_id=project["id"])
    request = {"content": "Suggest a first milestone", "request_id": str(uuid4())}
    response = client.post(f"/api/conversations/{cid}/messages", json=request)
    assert response.status_code == 200, response.text
    assert "3000 pesos" in fake.calls[0][1][0]["content"]
    assert "ESP32" in fake.calls[0][1][0]["content"]
    assert fake.calls[0][0] == "qwen3.5:4b"
    # A new application/engine reads persisted rows, not in-memory process state.
    with TestClient(create_app(url, config, fake), base_url="http://localhost", headers=HEADERS) as restarted:
        messages = restarted.get(f"/api/conversations/{cid}").json()["messages"]
        assert [m["role"] for m in messages] == ["user", "assistant"]
        detail = restarted.get(f"/api/projects/{project['id']}").json()
        assert len(detail["memory"]) == 2
        assert {h["action"] for h in detail["history"]} >= {"project.created", "requirement.added", "decision.added", "conversation.turn"}
    other = client.post("/api/projects", json={"name": "Unrelated"}).json()
    assert client.get(f"/api/conversations?project_id={other['id']}").json() == []


def test_retry_is_idempotent_and_conflicting_reuse_fails(workspace):
    client, fake, *_ = workspace
    cid = conversation(client)
    request = {"content": "Hello", "request_id": str(uuid4())}
    first = client.post(f"/api/conversations/{cid}/messages", json=request)
    second = client.post(f"/api/conversations/{cid}/messages", json=request)
    assert first.json()["message"]["id"] == second.json()["message"]["id"]
    assert second.json()["replayed"] is True
    assert len(fake.calls) == 1
    request["content"] = "Different"
    assert client.post(f"/api/conversations/{cid}/messages", json=request).status_code == 409


def test_failed_inference_rolls_back_and_can_retry(workspace):
    client, fake, *_ = workspace
    cid = conversation(client)
    request = {"content": "Hello", "request_id": str(uuid4())}
    fake.fail = True
    assert client.post(f"/api/conversations/{cid}/messages", json=request).status_code == 503
    assert client.get(f"/api/conversations/{cid}").json()["messages"] == []
    fake.fail = False
    assert client.post(f"/api/conversations/{cid}/messages", json=request).status_code == 200


def test_route_selection_and_context_bound(workspace):
    client, fake, _, config = workspace
    config.models.models["small"] = config.models.models["core"].model_copy(update={"model": "qwen3.5:2b", "context_window": 2048, "max_output_tokens": 256})
    cid = conversation(client, route="small")
    response = client.post(f"/api/conversations/{cid}/messages", json={"content": "x" * 3000, "request_id": str(uuid4())})
    assert response.status_code == 422
    assert fake.calls == []
    response = client.post(f"/api/conversations/{cid}/messages", json={"content": "Hello", "request_id": str(uuid4())})
    assert response.status_code == 200
    assert fake.calls[0][0] == "qwen3.5:2b"


def test_history_is_supplied_and_old_context_is_bounded(workspace):
    client, fake, *_ = workspace
    cid = conversation(client)
    for i in range(8):
        response = client.post(f"/api/conversations/{cid}/messages", json={"content": f"Turn {i}: " + "x" * 900, "request_id": str(uuid4())})
        assert response.status_code == 200
    assert response.json()["context_truncated"] is True
    assert any(m["role"] == "assistant" for m in fake.calls[-1][1])
    assert len(client.get(f"/api/conversations/{cid}").json()["messages"]) == 16


def test_browser_boundary(workspace):
    client, *_ = workspace
    assert client.post("/api/projects", json={"name": "x"}, headers={"X-WhiteSheep-Client": ""}).status_code == 403
    assert client.post("/api/projects", json={"name": "x"}, headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.get("/api/projects", headers={"Host": "evil.example"}).status_code == 400
    assert client.post("/api/projects", json={"name": "x"}, headers={"Origin": "http://localhost"}).status_code == 201
    assert client.post("/api/projects", content="x" * 70000).status_code == 413
    assert "frame-ancestors 'none'" in client.get("/").headers["content-security-policy"]


@pytest.mark.parametrize("url", ["https://api.openai.com", "http://example.com", "http://ollama.evil.test", "http://user:pass@ollama:11434", "http://ollama:11434/redirect"])
def test_remote_routes_rejected(url):
    with pytest.raises(ValidationError):
        ModelRoute(model="qwen3.5:4b", base_url=url)


def test_unknown_agent_route_and_project(workspace):
    client, *_ = workspace
    assert client.post("/api/conversations", json={"agent": "shell"}).status_code == 422
    assert client.post("/api/conversations", json={"route": "cloud"}).status_code == 422
    assert client.post("/api/conversations", json={"project_id": str(uuid4())}).status_code == 404
    assert client.post("/api/projects", json={"name": "   "}).status_code == 422


def test_tools_default_denied_and_audited(workspace):
    client, *_ = workspace
    response = client.post("/api/tools/run", json={"agent": "codelab", "tool": "repository.read", "repository": "anything", "path": "main.py", "confirmed": True})
    assert response.status_code == 403
    assert client.get("/api/tools/audit").json()[0]["outcome"] == "denied"


def test_read_only_tools_and_path_security(tmp_path):
    config = Configuration(CONFIG)
    config.projects.repositories["demo"] = Repository(path="demo", tools=["repository.list", "repository.read"])
    repo = tmp_path / "demo"
    repo.mkdir()
    (repo / "main.py").write_text("print('hello')")
    (repo / ".env").write_text("password")
    (repo / "secrets.json").write_text("password")
    (repo / "large.txt").write_text("x" * 33000)
    registry = ToolRegistry(config, tmp_path)
    run = lambda tool, path="", confirmed=True, agent="codelab": registry.execute(agent, tool, "demo", path, confirmed)
    assert run("repository.read", "main.py")["content"] == "print('hello')"
    assert ".env" not in run("repository.list")["files"]
    assert "secrets.json" not in run("repository.list")["files"]
    for path in ["../main.py", ".env", "secrets.json", "large.txt", "/etc/passwd"]:
        with pytest.raises(ToolDenied):
            run("repository.read", path)
    with pytest.raises(ToolDenied):
        run("repository.read", "main.py", confirmed=False)
    with pytest.raises(ToolDenied):
        run("repository.read", "main.py", agent="core")
    with pytest.raises(ToolDenied):
        run("shell.execute", "main.py")
    assert (repo / "main.py").read_text() == "print('hello')"


def test_symlink_escape_is_denied(tmp_path):
    config = Configuration(CONFIG)
    config.projects.repositories["demo"] = Repository(path="demo", tools=["repository.read"])
    repo = tmp_path / "demo"
    repo.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("private")
    try:
        (repo / "link.txt").symlink_to(outside)
    except OSError:
        pytest.skip("Symlink creation unavailable on this host; covered in Linux Docker tests")
    with pytest.raises(ToolDenied):
        ToolRegistry(config, tmp_path).execute("codelab", "repository.read", "demo", "link.txt", True)


def test_ollama_wire_contract_and_failure(monkeypatch):
    route = Configuration(CONFIG).models.models["core"]
    requests = []
    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={"message": {"content": "Hello locally"}})
    original_client = httpx.AsyncClient
    def client(**kwargs):
        assert kwargs["trust_env"] is False
        assert kwargs["follow_redirects"] is False
        return original_client(transport=httpx.MockTransport(respond), **kwargs)
    monkeypatch.setattr(httpx, "AsyncClient", client)
    answer = asyncio.run(OllamaAdapter().complete(route, [{"role": "user", "content": "Hello"}]))
    assert answer == "Hello locally"
    assert str(requests[0].url) == "http://ollama:11434/api/chat"
    payload = json.loads(requests[0].content)
    assert payload["think"] is False and payload["stream"] is False
    assert "tools" not in payload
    assert payload["options"]["num_ctx"] == 8192
    asyncio.run(OllamaAdapter().complete(route, [], schema={'type': 'object'}))
    assert json.loads(requests[-1].content)['format'] == {'type': 'object'}
    def unavailable(request):
        return httpx.Response(404, json={"error": "model not found"})
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original_client(transport=httpx.MockTransport(unavailable), **kw))
    with pytest.raises(ModelUnavailable):
        asyncio.run(OllamaAdapter().complete(route, []))


def test_overlapping_inference_is_rejected(tmp_path):
    async def scenario():
        entered, release = asyncio.Event(), asyncio.Event()
        class SlowModel:
            async def complete(self, route, messages):
                entered.set()
                await release.wait()
                return "Complete"
        app = create_app(f"sqlite:///{(tmp_path / 'concurrent.db').as_posix()}", Configuration(CONFIG), SlowModel())
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost", headers=HEADERS) as client:
                response = await client.post("/api/conversations", json={})
                cid = response.json()["id"]
                request = {"content": "hello", "request_id": str(uuid4())}
                first = asyncio.create_task(client.post(f"/api/conversations/{cid}/messages", json=request))
                await asyncio.wait_for(entered.wait(), timeout=5)
                second = await client.post(f"/api/conversations/{cid}/messages", json=request)
                assert second.status_code == 409
                release.set()
                assert (await first).status_code == 200
    asyncio.run(scenario())


def test_skills_are_selected_per_turn_persisted_and_retry_safe(workspace):
    client, fake, url, config = workspace
    assert set(client.get('/api/config').json()['skills']) == {'ideation', 'feasibility', 'fastapi', 'agile', 'devops', 'agriculture', 'superpowers_brainstorm', 'superpowers_plan', 'superpowers_debug', 'superpowers_review'}
    cid = conversation(client)
    request = {'content': 'Plan a release', 'request_id': str(uuid4()), 'skill': 'devops'}
    assert client.post(f'/api/conversations/{cid}/messages', json=request).status_code == 200
    assert 'MegaBus-inspired' in fake.calls[-1][1][0]['content']
    assert client.post(f'/api/conversations/{cid}/messages', json=request).json()['replayed']
    assert client.post(f'/api/conversations/{cid}/messages', json={**request, 'skill': 'agile'}).status_code == 409
    assert client.post(f'/api/conversations/{cid}/messages', json={'content': 'Hi', 'request_id': str(uuid4()), 'skill': '../bad'}).status_code == 422
    with TestClient(create_app(url, config, fake), base_url='http://localhost', headers=HEADERS) as restarted:
        messages = restarted.get(f'/api/conversations/{cid}').json()['messages']
        assert [m['skill'] for m in messages] == ['devops', 'devops']
    assert client.post(f'/api/conversations/{cid}/messages', json={'content': 'Hi', 'request_id': str(uuid4())}).status_code == 200
    assert 'MegaBus-inspired' not in fake.calls[-1][1][0]['content']


def test_skill_guidance_is_counted_against_context_budget(workspace):
    client, fake, _, config = workspace
    config.models.models['small'] = config.models.models['core'].model_copy(update={'context_window': 2048, 'max_output_tokens': 256})
    cid = conversation(client, route='small')
    response = client.post(f'/api/conversations/{cid}/messages', json={'content': 'x' * 1500, 'request_id': str(uuid4()), 'skill': 'devops'})
    assert response.status_code == 422
    assert fake.calls == []


def test_agriculture_skill_guides_local_model_and_preserves_selection(workspace):
    client, fake, *_ = workspace
    cid = conversation(client)
    response = client.post(f'/api/conversations/{cid}/messages', json={
        'content': 'Plan a soil moisture monitor', 'request_id': str(uuid4()), 'skill': 'agriculture'})
    assert response.status_code == 200
    system = fake.calls[-1][1][0]['content']
    assert 'calibration' in system and 'not universal watering thresholds' in system
    assert client.get(f'/api/conversations/{cid}').json()['messages'][0]['skill'] == 'agriculture'


@pytest.mark.parametrize('agent_id,expected', [
    ('superpowers_brainstorm', 'approaches'),
    ('superpowers_plan', 'acceptance criteria'),
    ('superpowers_debug', 'hypotheses'),
    ('superpowers_review', 'actionable'),
])
def test_superpowers_profiles_are_local_and_remembered(workspace, agent_id, expected, tmp_path):
    client, fake, url, config = workspace
    assert client.get('/api/config').json()['agents'][agent_id]['tools'] == []
    assert client.post('/api/conversations', json={'agent': agent_id}).status_code == 422
    with Session(client.app.state.engine) as session, session.begin():
        old = Conversation(title='Previous chat', agent=agent_id, route='core')
        session.add(old)
        session.flush()
        cid = old.id
    response = client.post(f'/api/conversations/{cid}/messages', json={
        'content': 'Help me with my project', 'request_id': str(uuid4())})
    assert response.status_code == 200
    assert expected in fake.calls[-1][1][0]['content']
    with TestClient(create_app(url, config, fake), base_url='http://localhost', headers=HEADERS) as restarted:
        assert restarted.get(f'/api/conversations/{cid}').json()['agent'] == agent_id
    repo = tmp_path / 'repos' / 'demo'
    repo.mkdir(parents=True)
    (repo / 'x.py').write_text('print(1)', encoding='utf-8')
    config.projects.repositories['demo'] = Repository(path='demo', tools=['repository.read'])
    denied = client.post('/api/tools/run', json={'agent': agent_id, 'tool': 'repository.read',
        'repository': 'demo', 'path': 'x.py', 'confirmed': True})
    assert denied.status_code == 403


@pytest.mark.parametrize('skill_id,expected', [
    ('superpowers_brainstorm', 'tradeoffs'), ('superpowers_plan', 'acceptance criteria'),
    ('superpowers_debug', 'hypotheses'), ('superpowers_review', 'actionable')])
def test_superpower_skills_category_and_turn_selection(workspace, skill_id, expected):
    client, fake, *_ = workspace
    skills = client.get('/api/config').json()['skills']
    assert skills[skill_id]['category'] == 'superpower_core'
    assert skills['agriculture']['category'] == 'whitesheep_core'
    cid = conversation(client, agent='idealab')
    response = client.post(f'/api/conversations/{cid}/messages', json={
        'content': 'Help with this project', 'skill': skill_id, 'request_id': str(uuid4())})
    assert response.status_code == 200
    assert expected in fake.calls[-1][1][0]['content']
    assert client.get(f'/api/conversations/{cid}').json()['messages'][0]['skill'] == skill_id
