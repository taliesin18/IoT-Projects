"""Runs only inside an offline, per-job Blender container after user approval."""
import hashlib
import json
import math
import sys
from array import array
from pathlib import Path

import bpy

sys.path.insert(0, '/app/generated')
import scene_api
from generated_scene import digest, validate_code, validate_subject

job = Path('/job')
out = Path('/out')
code = Path('/approved.py').read_text(encoding='utf-8')
approved = json.loads((job / 'approval.json').read_text(encoding='utf-8'))['approved_hash']
if digest(code) != approved:
    raise ValueError('Reviewed code has changed; execution refused')
prompt = json.loads((job / 'asset.json').read_text(encoding='utf-8')).get('prompt', '')
validate_subject(validate_code(code), prompt)
scene_api.setup()
before = {obj.name for obj in bpy.context.scene.objects}
namespace = {'__name__': 'reviewed_scene'}
exec(compile(code, '<reviewed-scene>', 'exec'), namespace)
update = namespace['build']()
if not callable(update):
    raise ValueError('build() must return an update function')
objects = [obj for obj in bpy.context.scene.objects if obj.name not in before]
meshes = [obj for obj in objects if obj.type in {'MESH', 'CURVE'} and not obj.hide_render]
if not meshes or len(objects) > 100:
    raise ValueError('The scene is empty or exceeds the object limit')
for moment in (0, 1, 2):
    update(moment)
    if any(not math.isfinite(float(value)) or abs(float(value)) > 1000 for obj in objects for vector in (obj.location, obj.rotation_euler, obj.scale) for value in vector):
        raise ValueError('Scene has invalid object transforms')
update(0)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.resolution_x = 720
scene.render.resolution_y = 1280
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
bpy.ops.wm.save_as_mainfile(filepath=str(job / 'object.blend'))
scene.render.filepath = str(out / 'render.png')
bpy.ops.render.render(write_still=True)
image = bpy.data.images.load(str(out / 'render.png'), check_existing=False)
pixels = image.pixels
buffer = array('f', [0.0]) * len(pixels)
pixels.foreach_get(buffer)
sample = buffer[::max(4, (len(buffer) // 4000 // 4) * 4)]
if len(sample) < 20 or max(sample) - min(sample) < 0.01:
    raise ValueError('Rendered image appears blank or uniform')
report = {'code_sha256': approved, 'objects': len(objects), 'visible_meshes': len(meshes),
          'transform_checks_seconds': [0, 1, 2], 'image_range': [min(sample), max(sample)],
          'image_sha256': hashlib.sha256((out / 'render.png').read_bytes()).hexdigest(),
          'helper_sha256': hashlib.sha256(Path('/app/generated/scene_api.py').read_bytes()).hexdigest(),
          'blender_version': bpy.app.version_string, 'image_size': [720, 1280],
          'semantic_match_checked': False, 'note': 'Visual accuracy requires human review.'}
(job / 'quality.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
