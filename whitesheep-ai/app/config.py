import os
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ModelRoute(Strict):
    adapter: Literal["ollama"] = "ollama"
    model: str = Field(min_length=1)
    base_url: str
    context_window: int = Field(default=8192, ge=2048, le=32768)
    max_output_tokens: int = Field(default=1024, ge=1, le=4096)
    temperature: float = Field(default=0.6, ge=0, le=2)
    timeout_seconds: int = Field(default=180, ge=1, le=600)

    @model_validator(mode="after")
    def local_only(self):
        url = urlsplit(self.base_url)
        if (url.scheme != "http" or url.hostname not in {"ollama", "localhost", "127.0.0.1", "::1"}
                or url.username or url.password or url.query or url.fragment or url.path not in {"", "/"}):
            raise ValueError("Only the local Ollama service or loopback endpoints are allowed")
        if "cloud" in self.model.lower() or "/" in self.model:
            raise ValueError("Use a local Ollama model tag")
        if self.max_output_tokens >= self.context_window // 2:
            raise ValueError("Reserve at least half the context for input")
        return self


class Models(Strict):
    default: str
    models: dict[str, ModelRoute]


class Agent(Strict):
    label: str
    route: str
    tools: list[Literal["repository.list", "repository.read"]] = []
    selectable: bool = True
    system_prompt: str = Field(min_length=1, max_length=4000)


class Agents(Strict):
    agents: dict[str, Agent]


class Repository(Strict):
    path: str
    tools: list[Literal["repository.list", "repository.read"]] = []


class Projects(Strict):
    default_agent: str
    memory_kinds: list[Literal["requirement", "decision", "note"]]
    repositories: dict[str, Repository] = {}


class Skill(Strict):
    label: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=300)
    instructions: str = Field(min_length=1, max_length=2000)
    category: Literal["whitesheep_core", "superpower_core"] = "whitesheep_core"


class Skills(Strict):
    skills: dict[str, Skill]


class Configuration:
    def __init__(self, directory=None):
        root = Path(directory or os.getenv("CONFIG_DIR", "config"))
        self.models = Models.model_validate(yaml.safe_load((root / "models.yaml").read_text()))
        self.agents = Agents.model_validate(yaml.safe_load((root / "agents.yaml").read_text())).agents
        self.projects = Projects.model_validate(yaml.safe_load((root / "projects.yaml").read_text()))
        self.skills = Skills.model_validate(yaml.safe_load((root / "skills.yaml").read_text())).skills
        if self.models.default not in self.models.models:
            raise ValueError("Unknown default model route")
        if self.projects.default_agent not in self.agents:
            raise ValueError("Unknown default project agent")
        if any(a.route not in self.models.models for a in self.agents.values()):
            raise ValueError("Unknown agent model route")
