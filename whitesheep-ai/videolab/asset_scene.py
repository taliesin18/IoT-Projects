"""A fixed Blender scene with strictly validated preset data, not generated code."""
import json
import math
import re
import sys
from pathlib import Path
from uuid import UUID

import bpy
from mathutils import Vector

identifier = str(UUID(sys.argv[sys.argv.index('--') + 1]))
job = Path('/videos/library') / identifier
params = json.loads((job / 'asset.json').read_text(encoding='utf-8'))
shape, color = params['shape'], params['color']
if shape not in {'cube', 'sphere', 'cylinder'} or not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
    raise ValueError('Invalid preset')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
if shape == 'cube':
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 1.2))
elif shape == 'sphere':
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.2, location=(0, 0, 1.3))
    bpy.ops.object.shade_smooth()
else:
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1, depth=2.4, location=(0, 0, 1.3))
    bpy.ops.object.shade_smooth()
obj = bpy.context.object
obj.name = 'Reusable ' + shape
material = bpy.data.materials.new('Asset colour')
material.diffuse_color = tuple(int(color[i:i+2], 16) / 255 for i in (1, 3, 5)) + (1,)
obj.data.materials.append(material)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
floor = bpy.data.materials.new('Floor')
floor.diffuse_color = (0.80, 0.84, 0.79, 1)
bpy.context.object.data.materials.append(floor)
bpy.ops.object.light_add(type='AREA', location=(4, -5, 7))
bpy.context.object.data.energy = 1400
bpy.context.object.data.shape = 'DISK'
bpy.context.object.data.size = 5
bpy.ops.object.camera_add(location=(5, -8, 5))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 1.2)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.resolution_x = 720
scene.render.resolution_y = 1280
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world.color = (0.18, 0.18, 0.18)
output = Path('/videos/public/library') / identifier
output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(job / 'object.blend'))
scene.render.filepath = str(output / 'render.png')
bpy.ops.render.render(write_still=True)
