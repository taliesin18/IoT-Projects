import json
import sys
from types import SimpleNamespace

from videolab import image_worker


def test_offline_image_job_publishes_only_after_success(tmp_path, monkeypatch):
    root = tmp_path / 'videos'
    path = root / 'library' / 'sample'
    path.mkdir(parents=True)
    model = tmp_path / 'model'
    model.mkdir()
    (model / 'model_index.json').write_text('{}')
    (path / 'asset.json').write_text(json.dumps({'prompt': 'a puppy', 'seed': 42, 'negative_prompt': 'blur'}))
    (path / 'status.json').write_text(json.dumps({'state': 'queued'}))
    monkeypatch.setattr(image_worker, 'ROOT', root)
    monkeypatch.setattr(image_worker, 'MODEL', model)
    calls = {}

    class Generator:
        def __init__(self, device):
            calls['device'] = device
        def manual_seed(self, seed):
            calls['seed'] = seed
            return self

    class Picture:
        def save(self, output, format):
            output.write_bytes(b'generated png')

    class Pipeline:
        @classmethod
        def from_pretrained(cls, location, **kwargs):
            calls['load'] = (location, kwargs)
            return cls()
        def enable_attention_slicing(self):
            pass
        def to(self, device):
            return self
        def __call__(self, prompt, **kwargs):
            calls['prompt'] = prompt
            return SimpleNamespace(images=[Picture()], nsfw_content_detected=[False])

    monkeypatch.setitem(sys.modules, 'torch', SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True), float16='float16', Generator=Generator))
    monkeypatch.setitem(sys.modules, 'diffusers', SimpleNamespace(StableDiffusionPipeline=Pipeline))
    image_worker.generate(path)
    assert json.loads((path / 'status.json').read_text())['state'] == 'complete'
    assert (root / 'public/library/sample/render.png').read_bytes() == b'generated png'
    assert calls['prompt'] == 'a puppy' and calls['seed'] == 42
    assert calls['load'][1]['local_files_only'] and calls['load'][1]['use_safetensors']
