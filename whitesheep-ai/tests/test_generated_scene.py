import json
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import Configuration
from app.generated_scene import digest, parse_model_code, validate_code, validate_subject
from app.main import create_app

CONFIG = Path(__file__).resolve().parents[1] / 'config'
HEADERS = {'X-WhiteSheep-Client': 'local-web'}
VALID = '''from scene_api import *
import math
def build():
    ball = sphere('ball', (0, 0, 1), (0.5, 0.5, 0.5), '#70ee55')
    def update(t):
        ball.location.z = 1 + 0.1 * math.sin(t)
    return update
'''


class FakeScene:
    def __init__(self, code=VALID):
        self.code = code
    async def complete(self, route, messages, schema=None):
        assert schema['required'] == ['code']
        return json.dumps({'code': self.code})


def test_validator_accepts_scene_and_fenced_json():
    assert validate_code(VALID) == VALID
    assert parse_model_code('```json\n' + json.dumps({'code': VALID}) + '\n```') == VALID


def test_specific_subject_does_not_use_generic_mascot():
    generic = VALID.replace("sphere('ball', (0, 0, 1), (0.5, 0.5, 0.5), '#70ee55')", "mascot('yorkie', (0, 0, 1), '#704322')")
    assert validate_code(generic) == generic  # Old code remains syntactically valid.
    with pytest.raises(ValueError, match='generic mascot'):
        validate_subject(generic, 'a brown Yorkshire puppy')
    assert validate_subject(generic, 'a generic mascot') == generic
    with pytest.raises(ValueError, match='multiple distinct'):
        validate_subject(VALID, 'a brown Yorkshire puppy')


def test_prompt_check_allows_multipart_dog_and_single_simple_shape():
    parts = VALID.replace("    def update(t):", """    head = sphere('head', (0, 0, 1.5), (0.4, 0.4, 0.4), '#703020')
    ear_l = sphere('ear_left', (-0.2, 0, 1.8), (0.1, 0.1, 0.2), '#703020')
    ear_r = sphere('ear_right', (0.2, 0, 1.8), (0.1, 0.1, 0.2), '#703020')
    leg_l = sphere('leg_left', (-0.2, 0, 0.4), (0.1, 0.1, 0.3), '#703020')
    leg_r = sphere('leg_right', (0.2, 0, 0.4), (0.1, 0.1, 0.3), '#703020')
    def update(t):""")
    assert validate_subject(validate_code(parts), 'brown Yorkshire puppy') == parts
    assert validate_subject(VALID, 'one green sphere') == VALID


@pytest.mark.parametrize('code', [
    VALID + '\nimport os\n',
    VALID.replace("ball = sphere", "ball = open"),
    VALID.replace('def update(t):', 'def update(t):\n        while True: pass'),
    VALID.replace('ball.location.z', 'ball.__class__'),
    VALID.replace('return update', 'return ball'),
    'print("side effect")\n' + VALID,
    VALID.replace("ball.location.z =", "sphere('extra',(0,0,0),(1,1,1),'#ffffff')\n        ball.location.z ="),
])
def test_validator_rejects_unsupported_code(code):
    with pytest.raises(ValueError):
        validate_code(code)


def test_generated_draft_requires_exact_approval_and_survives_restart(tmp_path):
    root = tmp_path / 'videos'
    url = f"sqlite:///{(tmp_path / 'db.sqlite').as_posix()}"
    config = Configuration(CONFIG)
    with TestClient(create_app(url, config, FakeScene(), video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        draft = client.post('/api/videos/assets/generated/draft', json={'name':'Ball', 'prompt':'A green ball', 'tags':['test']})
        assert draft.status_code == 201, draft.text
        data = draft.json()
        aid, code_hash = data['id'], data['code_hash']
        assert data['status']['state'] == 'awaiting_review'
        assert not (root / 'library' / aid / 'generated-queued').exists()
        assert client.get(f'/api/videos/assets/{aid}/code').json()['code'] == VALID
        assert client.post(f'/api/videos/assets/{aid}/approve', json={'code_hash':'0' * 64}).status_code == 409
        assert client.post(f'/api/videos/assets/{aid}/approve', json={'code_hash':code_hash}).status_code == 202
        assert (root / 'library' / aid / 'generated-queued' / 'ready').is_file()
        assert json.loads((root / 'library' / aid / 'approval.json').read_text())['approved_hash'] == digest(VALID)
        assert client.post(f'/api/videos/assets/{aid}/approve', json={'code_hash':code_hash}).status_code == 409
    with TestClient(create_app(url, config, FakeScene(), video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        assert client.get(f'/api/videos/assets/{aid}').json()['status']['state'] == 'approved'


def test_changed_code_cannot_be_approved(tmp_path):
    root = tmp_path / 'videos'
    url = f"sqlite:///{(tmp_path / 'db.sqlite').as_posix()}"
    with TestClient(create_app(url, Configuration(CONFIG), FakeScene(), video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        draft = client.post('/api/videos/assets/generated/draft', json={'name':'Ball', 'prompt':'A ball'}).json()
        (root / 'library' / draft['id'] / 'scene.py').write_text(VALID + '\n# changed', encoding='utf-8')
        assert client.post(f"/api/videos/assets/{draft['id']}/approve", json={'code_hash':draft['code_hash']}).status_code == 409
        assert not (root / 'library' / draft['id'] / 'generated-queued').exists()


def test_bad_generated_code_is_not_saved(tmp_path):
    root = tmp_path / 'videos'
    url = f"sqlite:///{(tmp_path / 'db.sqlite').as_posix()}"
    with TestClient(create_app(url, Configuration(CONFIG), FakeScene('import os\n' + VALID), video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        response = client.post('/api/videos/assets/generated/draft', json={'name':'Bad', 'prompt':'A ball'})
        assert response.status_code == 422
        assert client.get('/api/videos/assets').json() == []


def test_one_correction_is_allowed_without_running_code(tmp_path):
    class CorrectingModel:
        def __init__(self): self.calls = 0
        async def complete(self, route, messages, schema=None):
            self.calls += 1
            if self.calls == 2:
                assert messages[-2] == {'role':'assistant', 'content':'invalid json'}
            return 'invalid json' if self.calls == 1 else json.dumps({'code':VALID})
    model = CorrectingModel()
    root = tmp_path / 'videos'
    url = f"sqlite:///{(tmp_path / 'db.sqlite').as_posix()}"
    with TestClient(create_app(url, Configuration(CONFIG), model, video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        draft = client.post('/api/videos/assets/generated/draft', json={'name':'Ball', 'prompt':'A ball'})
        assert draft.status_code == 201 and model.calls == 2
        assert draft.json()['status']['state'] == 'awaiting_review'
        assert not (root / 'library' / draft.json()['id'] / 'generated-queued').exists()


def test_helper_status_is_visible_without_exposing_files(tmp_path):
    root = tmp_path / 'videos'
    url = f"sqlite:///{(tmp_path / 'db.sqlite').as_posix()}"
    with TestClient(create_app(url, Configuration(CONFIG), FakeScene(), video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        assert client.get('/api/videos/generated/worker').json() == {'running':False}
        (root / '.generated-worker-heartbeat').touch()
        assert client.get('/api/videos/generated/worker').json() == {'running':True}
