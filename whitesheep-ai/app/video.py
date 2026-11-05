"""File-backed video projects; a separate offline worker performs rendering."""
import json
import os
import shutil
import time
from threading import RLock
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal
from .generated_scene import digest, parse_model_code, validate_code, validate_subject
from .router import ModelUnavailable


class VideoInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=120)
    subtitle: str = Field(default="", max_length=240)
    narration: str = Field(default="", max_length=800)
    duration: int = Field(default=5, ge=2, le=60)
    asset_id: UUID | None = None


class AssetTags(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    tags: list[str] = Field(default_factory=list, max_length=10)

    @field_validator('tags')
    @classmethod
    def normalize_tags(cls, tags):
        normalized = []
        for tag in tags:
            tag = ' '.join(tag.strip().lower().split())
            if not tag or len(tag) > 30:
                raise ValueError('Tags must contain 1 to 30 characters')
            if tag not in normalized:
                normalized.append(tag)
        return normalized


class AssetInput(AssetTags):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    shape: Literal['cube', 'sphere', 'cylinder']
    color: str = Field(default='#668b69', pattern=r'^#[0-9a-fA-F]{6}$')


class GeneratedInput(AssetTags):
    name: str = Field(min_length=1, max_length=100)
    prompt: str = Field(min_length=1, max_length=1500)


class ImageInput(AssetTags):
    name: str = Field(min_length=1, max_length=100)
    prompt: str = Field(min_length=1, max_length=1500)
    negative_prompt: str = Field(default='', max_length=1000)
    seed: int = Field(ge=0, le=2147483647)


class Approval(BaseModel):
    model_config = ConfigDict(extra='forbid')
    code_hash: str = Field(pattern=r'^[0-9a-f]{64}$')


def video_router(root, model_router=None, inference_lock=None):
    router = APIRouter(prefix="/api/videos")
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    library = root / 'library'
    library.mkdir(exist_ok=True)
    images = root / 'public' / 'library'
    images.mkdir(parents=True, exist_ok=True)
    asset_lock = RLock()

    def asset_folder(identifier):
        path = library / str(identifier)
        if path.is_symlink() or not path.is_dir():
            raise HTTPException(404, 'Asset not found')
        return path

    def asset_detail(path):
        try:
            meta = json.loads((path / 'asset.json').read_text(encoding='utf-8'))
            status_file = path / 'status.json'
            status = json.loads(status_file.read_text(encoding='utf-8')) if status_file.exists() else {'state': 'queued'}
            return {'id': path.name, 'tags': [], **meta, 'status': status}
        except (ValueError, OSError, KeyError):
            raise HTTPException(500, 'Asset data is unreadable')

    @router.get('/assets')
    def list_assets():
        results = []
        for path in library.iterdir():
            try:
                UUID(path.name)
                if path.is_dir() and not path.is_symlink():
                    results.append(asset_detail(path))
            except ValueError:
                continue
        return sorted(results, key=lambda a: a['created_at'], reverse=True)

    @router.get('/generated/worker')
    def generated_worker_status():
        heartbeat = root / '.generated-worker-heartbeat'
        try:
            running = not heartbeat.is_symlink() and time.time() - heartbeat.stat().st_mtime < 20
        except OSError:
            running = False
        return {'running': running}

    @router.get('/image/worker')
    def image_worker_status():
        heartbeat = root / '.image-worker-heartbeat'
        try:
            running = not heartbeat.is_symlink() and time.time() - heartbeat.stat().st_mtime < 30
        except OSError:
            running = False
        return {'running': running}

    @router.post('/assets', status_code=201)
    def create_asset(data: AssetInput):
        from datetime import datetime, timezone
        path = library / str(uuid4())
        path.mkdir()
        (path / 'asset.json').write_text(json.dumps({**data.model_dump(), 'created_at': datetime.now(timezone.utc).isoformat()}), encoding='utf-8')
        (path / 'queued').mkdir()
        return asset_detail(path)

    @router.post('/assets/image', status_code=201)
    def create_image(data: ImageInput):
        from datetime import datetime, timezone
        path = library / str(uuid4())
        path.mkdir()
        meta = {**data.model_dump(), 'kind': 'diffusion', 'created_at': datetime.now(timezone.utc).isoformat()}
        (path / 'asset.json').write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
        (path / 'status.json').write_text(json.dumps({'state': 'queued', 'message': 'Queued for local image generation. Start the image worker if needed.'}), encoding='utf-8')
        (path / 'image-queued').mkdir()
        return asset_detail(path)

    @router.post('/assets/generated/draft', status_code=201)
    async def generate_asset_draft(data: GeneratedInput):
        if model_router is None:
            raise HTTPException(503, 'Local model routing is unavailable')
        if inference_lock.locked():
            raise HTTPException(409, 'The local model is busy. Retry shortly.')
        instructions = (Path(__file__).parent.parent / 'videolab' / 'generated' / 'AUTHORING_GUIDE.md').read_text(encoding='utf-8')
        messages = [{'role': 'system', 'content': 'Return only JSON {"code":"..."} with a short Python Blender scene. '
            'Use exactly this Python structure: from scene_api import *; then def build():; '
            'inside build create all objects; then define nested def update(t): pass; '
            'then return update inside build. Never call build or put a return at module level. '
            'This is a still image: do not animate. Use distinct primitive objects for distinctive subject features. '
            'For a dog or puppy use at least six primitive calls to build distinguishable head, ears, '
            'eyes, body and legs; do not use the prebuilt mascot. '
            'No loops, comprehensions, extra functions, extra imports, bpy, file access, or commands. '
            'Include every required helper argument, including the name. '
            'The final asset is a still preview at t=0. Follow the helper contract:\n' + instructions},
            {'role': 'user', 'content': data.prompt}]
        async with inference_lock:
            try:
                route = model_router.config.models.default
                schema = {'type':'object', 'properties':{'code':{'type':'string'}}, 'required':['code'], 'additionalProperties':False}
                for attempt in range(2):
                    reply = await model_router.complete(route, messages, schema=schema)
                    try:
                        code = validate_subject(validate_code(parse_model_code(reply)), data.prompt)
                        break
                    except ValueError as error:
                        if attempt:
                            raise
                        messages.append({'role':'assistant', 'content':reply})
                        messages.append({'role':'user', 'content':f'The draft failed validation: {error} Return corrected JSON only with a short, valid scene.'})
            except ModelUnavailable as exc:
                raise HTTPException(503, str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(422, f'Generated scene did not pass checks: {exc}') from exc
        from datetime import datetime, timezone
        path = library / str(uuid4())
        path.mkdir()
        meta = {'name': data.name, 'tags': data.tags, 'kind': 'generated', 'prompt': data.prompt,
                'model': model_router.config.models.models[route].model, 'code_hash': digest(code),
                'created_at': datetime.now(timezone.utc).isoformat()}
        (path / 'asset.json').write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
        (path / 'scene.py').write_text(code, encoding='utf-8')
        (path / 'status.json').write_text(json.dumps({'state':'awaiting_review', 'message':'Review the exact scene code before approving.'}), encoding='utf-8')
        return {**asset_detail(path), 'code': code}

    @router.get('/assets/{identifier}/code')
    def get_generated_code(identifier: UUID):
        path = asset_folder(identifier)
        meta = asset_detail(path)
        if meta.get('kind') != 'generated':
            raise HTTPException(404, 'No generated code for this asset')
        code_path = path / 'scene.py'
        if code_path.is_symlink() or not code_path.is_file():
            raise HTTPException(404, 'Generated code is unavailable')
        code = code_path.read_text(encoding='utf-8')
        return {'code': code, 'code_hash': digest(code), 'original_hash': meta['code_hash']}

    @router.post('/assets/{identifier}/approve', status_code=202)
    def approve_generated(identifier: UUID, data: Approval):
        with asset_lock:
            path = asset_folder(identifier)
            meta = asset_detail(path)
            if meta.get('kind') != 'generated' or meta['status']['state'] != 'awaiting_review':
                raise HTTPException(409, 'This asset is not awaiting review')
            scene = path / 'scene.py'
            if scene.is_symlink() or not scene.is_file():
                raise HTTPException(409, 'Scene code is unavailable')
            code = scene.read_text(encoding='utf-8')
            if digest(code) != data.code_hash or meta['code_hash'] != data.code_hash:
                raise HTTPException(409, 'Scene changed after it was generated; create a new draft')
            try:
                validate_subject(validate_code(code), meta.get('prompt', ''))
                (path / 'generated-queued').mkdir()
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
            except FileExistsError:
                raise HTTPException(409, 'This asset is already queued')
            approval = {'approved_hash': data.code_hash}
            (path / 'approval.json').write_text(json.dumps(approval), encoding='utf-8')
            (path / 'status.json').write_text(json.dumps({'state':'approved', 'message':'Approved. The local generated-scene worker will run the exact code.'}), encoding='utf-8')
            # Publish a final marker only after approval is fully persisted.
            (path / 'generated-queued' / 'ready').touch()
            return {'state':'approved'}

    @router.get('/assets/{identifier}')
    def get_asset(identifier: UUID):
        return asset_detail(asset_folder(identifier))

    @router.delete('/assets/{identifier}')
    def delete_asset(identifier: UUID):
        with asset_lock:
            path = asset_folder(identifier)
            if asset_detail(path)['status'].get('state') not in {'complete', 'failed', 'awaiting_review'}:
                raise HTTPException(409, 'Wait until this asset has finished before deleting it.')
            for project in root.iterdir():
                try:
                    UUID(project.name)
                except ValueError:
                    continue
                if not project.is_dir() or project.is_symlink():
                    continue
                try:
                    project_data = json.loads((project / 'project.json').read_text(encoding='utf-8'))
                except (OSError, ValueError):
                    raise HTTPException(409, 'A video project could not be checked. Repair it before deleting assets.')
                if project_data.get('asset_id') == str(identifier):
                    raise HTTPException(409, 'This asset is used by a video project and cannot be deleted.')
            output = images / path.name
            if output.is_symlink() or (output.exists() and not output.is_dir()):
                raise HTTPException(409, 'The asset output location is invalid.')
            if output.exists():
                shutil.rmtree(output)
            shutil.rmtree(path)
        return {'deleted': True}

    @router.post('/assets/{identifier}/tags')
    def update_asset_tags(identifier: UUID, data: AssetTags):
        path = asset_folder(identifier)
        meta = json.loads((path / 'asset.json').read_text(encoding='utf-8'))
        meta['tags'] = data.tags
        # Use a unique temporary file so concurrent requests never expose partial JSON.
        temporary = path / (f'.asset-{uuid4()}.tmp')
        try:
            temporary.write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
            os.replace(temporary, path / 'asset.json')
        finally:
            temporary.unlink(missing_ok=True)
        return asset_detail(path)

    @router.get('/assets/{identifier}/image')
    def asset_image(identifier: UUID):
        path = asset_folder(identifier)
        image = images / path.name / 'render.png'
        if image.is_symlink() or not image.is_file() or asset_detail(path)['status']['state'] != 'complete':
            raise HTTPException(404, 'The rendered image is not available')
        return FileResponse(image, media_type='image/png')

    @router.get('/assets/{identifier}/blend')
    def asset_blend(identifier: UUID):
        path = asset_folder(identifier)
        scene = path / 'object.blend'
        if scene.is_symlink() or not scene.is_file() or asset_detail(path)['status']['state'] != 'complete':
            raise HTTPException(404, 'The Blender scene is not available')
        return FileResponse(scene, media_type='application/octet-stream', filename='whitesheep-object.blend')

    @router.get('/assets/{identifier}/quality')
    def asset_quality(identifier: UUID):
        path = asset_folder(identifier)
        report = path / 'quality.json'
        if report.is_symlink() or not report.is_file() or asset_detail(path)['status']['state'] != 'complete':
            raise HTTPException(404, 'No quality report is available')
        return json.loads(report.read_text(encoding='utf-8'))

    def folder(identifier):
        path = root / str(identifier)
        if path.is_symlink() or not path.is_dir():
            raise HTTPException(404, "Video project not found")
        return path

    def detail(path):
        try:
            meta = json.loads((path / 'project.json').read_text(encoding='utf-8'))
            status_file = path / 'status.json'
            status = json.loads(status_file.read_text(encoding='utf-8')) if status_file.exists() else {'state': 'draft'}
            if (path / 'queued').is_dir() and status['state'] == 'draft':
                status = {'state': 'queued'}
            return {'id': path.name, **meta, 'status': status}
        except (ValueError, OSError, KeyError):
            raise HTTPException(500, 'Video project data is unreadable')

    @router.get('')
    def list_videos():
        projects = []
        for path in root.iterdir():
            try:
                UUID(path.name)
                if path.is_dir() and not path.is_symlink():
                    projects.append(detail(path))
            except ValueError:
                continue
        return sorted(projects, key=lambda p: p['created_at'], reverse=True)

    @router.post('', status_code=201)
    def create_video(data: VideoInput):
        from datetime import datetime, timezone
        with asset_lock:
            if data.asset_id:
                asset_path = asset_folder(data.asset_id)
                image = images / asset_path.name / 'render.png'
                if asset_detail(asset_path)['status']['state'] != 'complete' or image.is_symlink() or not image.is_file():
                    raise HTTPException(409, 'Choose a finished rendered asset')
            identifier = str(uuid4())
            path = root / identifier
            path.mkdir()
            meta = {**data.model_dump(mode='json'), 'created_at': datetime.now(timezone.utc).isoformat()}
            (path / 'project.json').write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
            return detail(path)

    @router.get('/{identifier}')
    def get_video(identifier: UUID):
        return detail(folder(identifier))

    @router.post('/{identifier}/render', status_code=202)
    def render_video(identifier: UUID):
        path = folder(identifier)
        try:
            (path / 'queued').mkdir()
        except FileExistsError:
            raise HTTPException(409, 'This project has already been submitted; create a new project for another version')
        return {'state': 'queued'}

    @router.get('/{identifier}/file')
    def video_file(identifier: UUID):
        path = folder(identifier)
        output = path / 'final.mp4'
        if output.is_symlink() or not output.is_file() or detail(path)['status']['state'] != 'complete':
            raise HTTPException(404, 'The finished video is not available')
        return FileResponse(output, media_type='video/mp4', filename='whitesheep-video.mp4', content_disposition_type='inline')

    return router
