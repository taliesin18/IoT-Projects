import json
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from app.config import Configuration
from app.main import create_app

CONFIG = Path(__file__).resolve().parents[1] / 'config'
HEADERS = {'X-WhiteSheep-Client': 'local-web'}


def test_delete_unused_assets_preserves_referenced_and_running_assets(tmp_path):
    root = tmp_path / 'videos'
    url = f"sqlite:///{(tmp_path / 'db.sqlite').as_posix()}"
    with TestClient(create_app(url, Configuration(CONFIG), video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        asset = client.post('/api/videos/assets/image', json={'name': 'Concept', 'prompt': 'A puppy', 'seed': 1}).json()
        aid = asset['id']
        assert client.delete(f'/api/videos/assets/{aid}').status_code == 409
        folder = root / 'library' / aid
        (folder / 'status.json').write_text(json.dumps({'state': 'complete'}), encoding='utf-8')
        image = root / 'public' / 'library' / aid / 'render.png'
        image.parent.mkdir(parents=True)
        image.write_bytes(b'image')
        project = client.post('/api/videos', json={'title': 'Uses concept', 'asset_id': aid})
        assert project.status_code == 201
        assert client.delete(f'/api/videos/assets/{aid}').status_code == 409
        assert image.exists() and folder.exists()

        unused = client.post('/api/videos/assets/image', json={'name': 'Unused', 'prompt': 'A tree', 'seed': 2}).json()['id']
        unused_folder = root / 'library' / unused
        (unused_folder / 'status.json').write_text(json.dumps({'state': 'complete'}), encoding='utf-8')
        unused_image = root / 'public' / 'library' / unused / 'render.png'
        unused_image.parent.mkdir(parents=True)
        unused_image.write_bytes(b'image')
        assert client.delete(f'/api/videos/assets/{unused}').json() == {'deleted': True}
        assert not unused_folder.exists() and not unused_image.exists()
        assert client.get(f'/api/videos/assets/{unused}').status_code == 404


def test_generated_image_is_a_reusable_2d_asset(tmp_path):
    root = tmp_path / 'videos'
    url = f"sqlite:///{(tmp_path / 'db.sqlite').as_posix()}"
    with TestClient(create_app(url, Configuration(CONFIG), video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        result = client.post('/api/videos/assets/image', json={'name': 'Puppy', 'prompt': 'A brown puppy', 'negative_prompt': 'blur', 'seed': 42, 'tags': ['Pets']})
        assert result.status_code == 201
        asset = result.json()
        assert asset['kind'] == 'diffusion' and asset['status']['state'] == 'queued'
        assert asset['prompt'] == 'A brown puppy' and asset['tags'] == ['pets']
        assert (root / 'library' / asset['id'] / 'image-queued').is_dir()
        assert client.get('/api/videos/image/worker').json()['running'] is False
        assert client.post('/api/videos/assets/image', json={'name': 'X', 'prompt': 'dog', 'seed': -1}).status_code == 422
        image = root / 'public' / 'library' / asset['id'] / 'render.png'
        image.parent.mkdir(parents=True)
        image.write_bytes(b'image')
        (root / 'library' / asset['id'] / 'status.json').write_text(json.dumps({'state': 'complete'}), encoding='utf-8')
        assert client.get(f"/api/videos/assets/{asset['id']}/image").content == b'image'
        assert client.get(f"/api/videos/assets/{asset['id']}/blend").status_code == 404
        video = client.post('/api/videos', json={'title': 'Puppy video', 'asset_id': asset['id']})
        assert video.status_code == 201


def test_video_project_review_render_queue_and_persistence(tmp_path):
    url = f"sqlite:///{(tmp_path / 'db.sqlite').as_posix()}"
    root = tmp_path / 'videos'
    with TestClient(create_app(url, Configuration(CONFIG), video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        created = client.post('/api/videos', json={'title':'My video', 'subtitle':'Example', 'narration':'Hello', 'duration':3})
        assert created.status_code == 201
        project = created.json()
        assert project['status']['state'] == 'draft'
        identifier = project['id']
        assert client.get('/api/videos/' + identifier + '/file').status_code == 404
        assert client.post('/api/videos/' + identifier + '/render', json={}).status_code == 202
        assert client.get('/api/videos/' + identifier).json()['status']['state'] == 'queued'
        assert client.post('/api/videos/' + identifier + '/render', json={}).status_code == 409
        assert client.post('/api/videos', json={'title':'test', 'duration':1000}).status_code == 422
        assert client.get('/api/videos/' + str(uuid4())).status_code == 404
        folder = root / identifier
        (folder / 'final.mp4').write_bytes(b'fake-video')
        (folder / 'status.json').write_text(json.dumps({'state':'complete'}), encoding='utf-8')
        result = client.get('/api/videos/' + identifier + '/file')
        assert result.content == b'fake-video' and result.headers['content-type'] == 'video/mp4'
    with TestClient(create_app(url, Configuration(CONFIG), video_root=root), base_url='http://localhost', headers=HEADERS) as restarted:
        assert restarted.get('/api/videos').json()[0]['title'] == 'My video'
        assert restarted.get('/api/videos/' + identifier).json()['status']['state'] == 'complete'


def test_video_cannot_access_linked_project(tmp_path):
    root = tmp_path / 'videos'
    root.mkdir()
    outside = tmp_path / 'outside'
    outside.mkdir()
    identifier = str(uuid4())
    try:
        (root / identifier).symlink_to(outside, target_is_directory=True)
    except OSError:
        import pytest
        pytest.skip('Symlink creation unavailable')
    url = f"sqlite:///{(tmp_path / 'db.sqlite').as_posix()}"
    with TestClient(create_app(url, Configuration(CONFIG), video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        assert client.get('/api/videos/' + identifier).status_code == 404


def test_reusable_asset_must_be_ready_and_is_shared(tmp_path):
    root = tmp_path / 'videos'
    url = f"sqlite:///{(tmp_path / 'db.sqlite').as_posix()}"
    with TestClient(create_app(url, Configuration(CONFIG), video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        created = client.post('/api/videos/assets', json={'name':'Green sphere', 'shape':'sphere', 'color':'#668b69'})
        assert created.status_code == 201
        asset = created.json()
        assert asset['status']['state'] == 'queued'
        aid = asset['id']
        assert client.post('/api/videos/assets', json={'name':'Bad', 'shape':'script', 'color':'#ffffff'}).status_code == 422
        assert client.post('/api/videos/assets', json={'name':'Bad', 'shape':'cube', 'color':'red'}).status_code == 422
        assert client.post('/api/videos', json={'title':'First', 'asset_id':aid}).status_code == 409
        folder = root / 'library' / aid
        image = root / 'public' / 'library' / aid / 'render.png'
        image.parent.mkdir(parents=True)
        image.write_bytes(b'png')
        (folder / 'object.blend').write_bytes(b'blend')
        (folder / 'status.json').write_text(json.dumps({'state':'complete'}), encoding='utf-8')
        assert client.get('/api/videos/assets/' + aid + '/image').content == b'png'
        assert client.get('/api/videos/assets/' + aid + '/blend').content == b'blend'
        first = client.post('/api/videos', json={'title':'First', 'asset_id':aid}).json()
        second = client.post('/api/videos', json={'title':'Second', 'asset_id':aid}).json()
        assert first['asset_id'] == second['asset_id'] == aid
        assert not (root / first['id'] / 'render.png').exists()
        assert not (root / second['id'] / 'render.png').exists()


def test_asset_tags_can_be_edited_without_changing_the_render(tmp_path):
    root = tmp_path / 'videos'
    url = f"sqlite:///{(tmp_path / 'db.sqlite').as_posix()}"
    with TestClient(create_app(url, Configuration(CONFIG), video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        created = client.post('/api/videos/assets', json={'name':'Plant', 'shape':'sphere', 'tags':[' Garden ', 'garden', ' Lettuce ']})
        assert created.status_code == 201 and created.json()['tags'] == ['garden', 'lettuce']
        aid = created.json()['id']
        folder = root / 'library' / aid
        (folder / 'status.json').write_text(json.dumps({'state':'complete'}), encoding='utf-8')
        (folder / 'object.blend').write_bytes(b'original scene')
        result = client.post(f'/api/videos/assets/{aid}/tags', json={'tags':[' Hydroponics ', 'green']})
        assert result.json()['tags'] == ['hydroponics', 'green']
        assert result.json()['status']['state'] == 'complete'
        assert (folder / 'object.blend').read_bytes() == b'original scene'
        assert client.post(f'/api/videos/assets/{aid}/tags', json={'tags':['x' * 31]}).status_code == 422
        assert client.post(f'/api/videos/assets/{aid}/tags', json={'tags':['x'] * 11}).status_code == 422
    with TestClient(create_app(url, Configuration(CONFIG), video_root=root), base_url='http://localhost', headers=HEADERS) as restarted:
        assert restarted.get(f'/api/videos/assets/{aid}').json()['tags'] == ['hydroponics', 'green']


def test_older_untagged_asset_remains_readable(tmp_path):
    root = tmp_path / 'videos'
    url = f"sqlite:///{(tmp_path / 'db.sqlite').as_posix()}"
    with TestClient(create_app(url, Configuration(CONFIG), video_root=root), base_url='http://localhost', headers=HEADERS) as client:
        asset = client.post('/api/videos/assets', json={'name':'Old', 'shape':'cube'}).json()
        path = root / 'library' / asset['id'] / 'asset.json'
        meta = json.loads(path.read_text(encoding='utf-8'))
        del meta['tags']
        path.write_text(json.dumps(meta), encoding='utf-8')
        assert client.get('/api/videos/assets/' + asset['id']).json()['tags'] == []
