"""Offline Stable Diffusion worker; jobs are data, never executable code."""
import json
import os
import time
import traceback
import threading
from pathlib import Path
from uuid import UUID

ROOT = Path('/videos')
LIBRARY = ROOT / 'library'
MODEL = Path('/model')


def status(path, state, message):
    temporary = path / 'image-status.tmp'
    temporary.write_text(json.dumps({'state': state, 'message': message}), encoding='utf-8')
    os.replace(temporary, path / 'status.json')


def generate(path):
    previous = json.loads((path / 'status.json').read_text(encoding='utf-8'))
    if previous['state'] == 'running':
        status(path, 'failed', 'Generation was interrupted. Create another image to retry.')
        return
    if previous['state'] != 'queued':
        return
    status(path, 'running', 'Generating an image locally. This may take several minutes.')
    try:
        import torch
        from diffusers import StableDiffusionPipeline
        if not torch.cuda.is_available():
            raise RuntimeError('NVIDIA GPU is not available in the image worker.')
        if not (MODEL / 'model_index.json').is_file():
            raise RuntimeError('No compatible local model found. Complete the image setup first.')
        data = json.loads((path / 'asset.json').read_text(encoding='utf-8'))
        pipe = StableDiffusionPipeline.from_pretrained(str(MODEL), local_files_only=True,
            torch_dtype=torch.float16, use_safetensors=True, variant='fp16')
        pipe.enable_attention_slicing()
        pipe = pipe.to('cuda')
        generator = torch.Generator(device='cuda').manual_seed(data['seed'])
        result = pipe(data['prompt'], negative_prompt=data.get('negative_prompt') or None,
            width=512, height=512, num_inference_steps=30, guidance_scale=7.5, generator=generator)
        if result.nsfw_content_detected and result.nsfw_content_detected[0]:
            raise RuntimeError('The image model flagged this result. Try a different prompt.')
        destination = ROOT / 'public' / 'library' / path.name
        destination.mkdir(parents=True, exist_ok=True)
        temporary = destination / 'render.tmp.png'
        result.images[0].save(temporary, format='PNG')
        os.replace(temporary, destination / 'render.png')
        status(path, 'complete', 'Image ready for reuse in videos or as a Blender reference.')
    except Exception as exc:
        (path / 'image.log').write_text(traceback.format_exc(), encoding='utf-8')
        status(path, 'failed', f'Image generation failed: {str(exc)[:300]}')


def main():
    LIBRARY.mkdir(parents=True, exist_ok=True)
    def heartbeat():
        while True:
            (ROOT / '.image-worker-heartbeat').touch()
            time.sleep(5)
    threading.Thread(target=heartbeat, daemon=True).start()
    while True:
        for path in LIBRARY.iterdir():
            try:
                UUID(path.name)
                if path.is_dir() and not path.is_symlink() and (path / 'image-queued').is_dir():
                    generate(path)
            except (ValueError, OSError, KeyError, json.JSONDecodeError):
                continue
        time.sleep(2)


if __name__ == '__main__':
    main()
