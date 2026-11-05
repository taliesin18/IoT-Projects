import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Configuration
from .db import Conversation, History, Memory, Message, MessageSkill, Project, ToolAudit, database, initialize
from .router import ModelRouter, ModelUnavailable, build_context
from .tools import ToolDenied, ToolRegistry
from .video import video_router


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class NewProject(Input):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=3000)


class NewMemory(Input):
    kind: Literal["requirement", "decision", "note"]
    content: str = Field(min_length=1, max_length=4000)


class NewConversation(Input):
    title: str = Field(default="New conversation", min_length=1, max_length=120)
    project_id: UUID | None = None
    agent: str | None = None
    route: str | None = None


class ChatInput(Input):
    content: str = Field(min_length=1, max_length=12000)
    request_id: UUID
    skill: str | None = Field(default=None, max_length=80)


class ToolInput(Input):
    agent: str = Field(max_length=80)
    tool: str = Field(max_length=80)
    repository: str = Field(max_length=120)
    path: str = Field(default="", max_length=500)
    confirmed: bool = False


def record(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


def required(session, model, identifier):
    result = session.get(model, str(identifier))
    if result is None:
        raise HTTPException(404, "Not found")
    return result


def create_app(database_url=None, config=None, adapter=None, repository_root=None, video_root=None):
    config = config or Configuration()
    engine, Session = database(database_url or os.environ["DATABASE_URL"])
    router = ModelRouter(config, adapter)
    registry = ToolRegistry(config, repository_root)
    inference_lock = asyncio.Lock()

    @asynccontextmanager
    async def lifespan(app):
        initialize(engine)
        yield
        engine.dispose()

    app = FastAPI(title="WhiteSheep", version="0.1.0", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.engine = engine
    video_root = video_root or os.getenv("VIDEO_PROJECT_ROOT")
    if video_root:
        app.include_router(video_router(video_root, router, inference_lock))
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]"])

    @app.middleware("http")
    async def local_boundary(request: Request, call_next):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            if request.headers.get("x-whitesheep-client") != "local-web":
                return JSONResponse({"detail": "Local client header required"}, 403)
            origin = request.headers.get("origin")
            if origin and origin != f"http://{request.headers.get('host')}":
                return JSONResponse({"detail": "Cross-origin requests are disabled"}, 403)
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 65536:
                    return JSONResponse({"detail": "Request too large"}, 413)
            request._body = bytes(body)
        response = await call_next(request)
        response.headers.update({
            "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store",
        })
        return response

    @app.get("/health")
    def health():
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "version": "0.1.0", "inference": "checked when sending a message"}

    @app.get("/api/config")
    def public_config():
        return {"models": {k: {"model": v.model} for k, v in config.models.models.items()},
                "default_model": config.models.default,
                "agents": {k: {"label": v.label, "route": v.route, "tools": v.tools, "selectable": v.selectable} for k, v in config.agents.items()},
                "default_agent": config.projects.default_agent, "memory_kinds": config.projects.memory_kinds,
                "skills": {k: {"label": v.label, "description": v.description, "category": v.category} for k, v in config.skills.items()},
                "repositories": list(config.projects.repositories)}

    @app.get("/api/projects")
    def projects():
        with Session() as s:
            return [record(x) for x in s.scalars(select(Project).order_by(Project.created_at.desc()))]

    @app.post("/api/projects", status_code=201)
    def create_project(data: NewProject):
        with Session.begin() as s:
            project = Project(**data.model_dump())
            s.add(project)
            s.flush()
            s.add(History(project_id=project.id, action="project.created", detail=project.name))
            return record(project)

    @app.get("/api/projects/{project_id}")
    def project_detail(project_id: UUID):
        with Session() as s:
            project = required(s, Project, project_id)
            return {**record(project),
                    "memory": [record(x) for x in s.scalars(select(Memory).where(Memory.project_id == project.id).order_by(Memory.created_at.desc(), Memory.id))],
                    "history": [record(x) for x in s.scalars(select(History).where(History.project_id == project.id).order_by(History.id.desc()).limit(200))]}

    @app.post("/api/projects/{project_id}/memory", status_code=201)
    def add_memory(project_id: UUID, data: NewMemory):
        if data.kind not in config.projects.memory_kinds:
            raise HTTPException(422, "Memory kind is disabled")
        with Session.begin() as s:
            project = required(s, Project, project_id)
            memory = Memory(project_id=project.id, **data.model_dump())
            s.add(memory)
            s.flush()
            s.add(History(project_id=project.id, action=f"{data.kind}.added", detail=data.content))
            return record(memory)

    @app.get("/api/conversations")
    def conversations(project_id: UUID | None = None):
        with Session() as s:
            statement = select(Conversation).order_by(Conversation.created_at.desc())
            if project_id:
                statement = statement.where(Conversation.project_id == str(project_id))
            return [record(x) for x in s.scalars(statement)]

    @app.post("/api/conversations", status_code=201)
    def create_conversation(data: NewConversation):
        agent = data.agent or (config.projects.default_agent if data.project_id else "core")
        if agent not in config.agents:
            raise HTTPException(422, "Unknown agent")
        if not config.agents[agent].selectable:
            raise HTTPException(422, "This legacy assistant is only available in existing conversations")
        route = data.route or config.agents[agent].route
        if route not in config.models.models:
            raise HTTPException(422, "Unknown model route")
        with Session.begin() as s:
            if data.project_id:
                required(s, Project, data.project_id)
            conv = Conversation(title=data.title, project_id=str(data.project_id) if data.project_id else None, agent=agent, route=route)
            s.add(conv)
            s.flush()
            if conv.project_id:
                s.add(History(project_id=conv.project_id, action="conversation.created", detail=conv.title))
            return record(conv)

    @app.get("/api/conversations/{conversation_id}")
    def conversation_detail(conversation_id: UUID):
        with Session() as s:
            conv = required(s, Conversation, conversation_id)
            skills = {x.request_id: x.skill for x in s.scalars(select(MessageSkill).where(MessageSkill.conversation_id == conv.id))}
            return {**record(conv), "messages": [{**record(x), "skill": skills.get(x.request_id)} for x in s.scalars(select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at, Message.id))]}

    @app.post("/api/conversations/{conversation_id}/messages")
    async def chat(conversation_id: UUID, data: ChatInput):
        if inference_lock.locked():
            raise HTTPException(409, "WhiteSheep is answering another message. Retry shortly.")
        async with inference_lock:
            with Session.begin() as s:
                conv = required(s, Conversation, conversation_id)
                existing = list(s.scalars(select(Message).where(Message.conversation_id == conv.id, Message.request_id == str(data.request_id)).order_by(Message.created_at)))
                if existing:
                    user = next((x for x in existing if x.role == "user"), None)
                    assistant = next((x for x in existing if x.role == "assistant"), None)
                    stored_skill = s.scalar(select(MessageSkill).where(MessageSkill.conversation_id == conv.id, MessageSkill.request_id == str(data.request_id)))
                    if not user or user.content != data.content or not assistant or (stored_skill.skill if stored_skill else None) != data.skill:
                        raise HTTPException(409, "Request id already used for a different message")
                    return {"message": record(assistant), "replayed": True, "context_truncated": False}
                if conv.route not in config.models.models or conv.agent not in config.agents:
                    raise HTTPException(409, "This conversation's model or agent was removed from configuration")
                if data.skill is not None and data.skill not in config.skills:
                    raise HTTPException(422, "Unknown skill")
                project = s.get(Project, conv.project_id) if conv.project_id else None
                memories = list(s.scalars(select(Memory).where(Memory.project_id == conv.project_id).order_by(Memory.created_at.desc(), Memory.id))) if project else []
                history = list(s.scalars(select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at, Message.id)))
                route = config.models.models[conv.route]
                try:
                    messages, truncated = build_context(route, config.agents[conv.agent], project, memories, history, data.content, config.skills.get(data.skill))
                    answer = await router.complete(conv.route, messages)
                except ValueError as exc:
                    raise HTTPException(422, str(exc)) from exc
                except ModelUnavailable as exc:
                    raise HTTPException(503, str(exc)) from exc
                # Persist the complete turn atomically; failed inference leaves no orphan user message.
                s.add(Message(conversation_id=conv.id, request_id=str(data.request_id), role="user", content=data.content))
                s.flush()
                assistant = Message(conversation_id=conv.id, request_id=str(data.request_id), role="assistant", content=answer, model=route.model)
                s.add(assistant)
                if data.skill:
                    s.add(MessageSkill(conversation_id=conv.id, request_id=str(data.request_id), skill=data.skill))
                s.flush()
                if conv.project_id:
                    s.add(History(project_id=conv.project_id, action="conversation.turn", detail=conv.title))
                return {"message": record(assistant), "replayed": False, "context_truncated": truncated}

    @app.post("/api/tools/run")
    def run_tool(data: ToolInput):
        denial = None
        try:
            result = registry.execute(data.agent, data.tool, data.repository, data.path, data.confirmed)
        except (ToolDenied, OSError) as exc:
            denial = str(exc) if isinstance(exc, ToolDenied) else "Repository file is unavailable"
            result = None
        with Session.begin() as s:
            s.add(ToolAudit(agent=data.agent, tool=data.tool, repository=data.repository, outcome="denied" if denial else "allowed"))
        if denial:
            raise HTTPException(403, denial)
        return result

    @app.get("/api/tools/audit")
    def tool_audit():
        with Session() as s:
            return [record(x) for x in s.scalars(select(ToolAudit).order_by(ToolAudit.id.desc()).limit(100))]

    static = Path(__file__).parent / "static"
    app.mount("/static", StaticFiles(directory=static), name="static")

    @app.get("/")
    def index():
        return FileResponse(static / "index.html")

    @app.get("/videolab")
    def videolab():
        return FileResponse(static / "videolab.html")

    return app


# Factory imports remain usable in tests without requiring a running database.
app = create_app() if os.getenv("DATABASE_URL") else None
