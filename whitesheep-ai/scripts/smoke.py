"""Run against a started local stack. Creates a clearly named project for restart checks."""
import json
from urllib.request import Request, urlopen
from uuid import uuid4


def call(path, body=None):
    request = Request("http://127.0.0.1:8765" + path,
                      data=json.dumps(body).encode() if body is not None else None,
                      headers={"Content-Type": "application/json", "X-WhiteSheep-Client": "local-web"})
    with urlopen(request, timeout=240) as response:
        return json.load(response)


assert call("/health")["status"] == "ok"
project = call("/api/projects", {"name": "WhiteSheep smoke check", "description": "Local integration and persistence verification."})
call(f"/api/projects/{project['id']}/memory", {"kind": "requirement", "content": "The project codename is Mango. It must work locally."})
call(f"/api/projects/{project['id']}/memory", {"kind": "decision", "content": "Start with one small milestone."})
conversation = call("/api/conversations", {"project_id": project["id"], "title": "Local Qwen verification"})
request = {"content": "What is this project's codename? Answer in one short sentence.", "request_id": str(uuid4())}
reply = call(f"/api/conversations/{conversation['id']}/messages", request)
assert "mango" in reply["message"]["content"].lower(), reply
repeat = call(f"/api/conversations/{conversation['id']}/messages", request)
assert repeat["replayed"] and repeat["message"]["id"] == reply["message"]["id"]
assert len(call(f"/api/conversations/{conversation['id']}")["messages"]) == 2
print(json.dumps({"project_id": project["id"], "conversation_id": conversation["id"], "answer": reply["message"]["content"], "status": "passed"}, indent=2))
