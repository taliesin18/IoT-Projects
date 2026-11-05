import os
from pathlib import Path


class ToolDenied(Exception):
    pass


EXTENSIONS = {".py", ".js", ".ts", ".tsx", ".jsx", ".html", ".css", ".md", ".txt", ".toml", ".yaml", ".yml", ".json", ".sql", ".c", ".h", ".cpp", ".rs", ".go"}
SKIP = {"node_modules", "vendor", "dist", "build", "__pycache__", "venv"}
SENSITIVE = {"credentials", "secrets", "id_rsa", "id_ed25519", "package-lock.json", "poetry.lock"}


def permitted(path):
    return all(not p.startswith(".") and p.lower() not in SKIP | SENSITIVE
               and not any(word in p.lower() for word in ("secret", "credential", "private_key")) for p in path.parts)


def safe_path(root, relative):
    path = Path(relative)
    if path.is_absolute() or not path.parts or ".." in path.parts or not permitted(path):
        raise ToolDenied("Path is outside the permitted repository files")
    candidate = root / path
    # Reject symlinks, including links whose targets remain inside the root.
    for item in [candidate, *candidate.parents]:
        if item == root:
            break
        if item.is_symlink() or (hasattr(item, "is_junction") and item.is_junction()):
            raise ToolDenied("Linked paths are not allowed")
    if not candidate.resolve().is_relative_to(root.resolve()):
        raise ToolDenied("Path escapes repository root")
    return candidate


class ToolRegistry:
    def __init__(self, config, root=None):
        self.config = config
        self.root = Path(root or os.getenv("REPOSITORY_ROOT", "repositories")).resolve()

    def execute(self, agent_id, tool, repository_id, path, confirmed):
        agent = self.config.agents.get(agent_id)
        repo = self.config.projects.repositories.get(repository_id)
        if not confirmed or not agent or not repo or tool not in agent.tools or tool not in repo.tools:
            raise ToolDenied("Tool requires explicit confirmation and both agent and repository grants")
        root = safe_path(self.root, repo.path)
        if not root.is_dir():
            raise ToolDenied("Repository is not available")
        if tool == "repository.list":
            files, visited = [], 0
            for base, dirs, names in os.walk(root, followlinks=False):
                dirs[:] = sorted(d for d in dirs if permitted(Path(d)) and not (Path(base) / d).is_symlink())
                visited += len(dirs) + len(names)
                if visited > 5000:
                    return {"files": files, "truncated": True}
                for name in sorted(names):
                    relative = (Path(base) / name).relative_to(root)
                    if permitted(relative) and relative.suffix.lower() in EXTENSIONS and not (root / relative).is_symlink():
                        files.append(relative.as_posix())
                        if len(files) >= 500:
                            return {"files": files, "truncated": True}
            return {"files": files, "truncated": False}
        if tool == "repository.read":
            target = safe_path(root, path)
            if target.suffix.lower() not in EXTENSIONS or not target.is_file():
                raise ToolDenied("Only supported text source files can be read")
            with target.open("rb") as source:
                raw = source.read(32769)
            if len(raw) > 32768 or b"\0" in raw:
                raise ToolDenied("File is binary or exceeds 32 KiB")
            try:
                return {"path": path, "content": raw.decode("utf-8")}
            except UnicodeDecodeError as exc:
                raise ToolDenied("File must be UTF-8 text") from exc
        raise ToolDenied("Unknown tool")
