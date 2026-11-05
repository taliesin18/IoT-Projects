# Blender scene helper contract

Import `from scene_api import *` and `import math`. The studio already creates the floor, lighting, camera and render settings. Do not reset them.

Write exactly this interface (use your own meaningful objects and motion):

```python
from scene_api import *
import math
def build():
    ball = sphere('ball', (0, 0, 1), (0.7, 0.7, 0.7), '#70ee55')
    def update(t):
        ball.location.z = 1 + 0.3 * math.sin(t * 4)
    return update
```

Only these helpers are available. Create ALL objects once, in build(). The update(t) callback must ONLY change existing object transforms or visibility; NEVER call sphere(), box(), mascot() or other geometry constructors inside update(). Never assign variables with the same names as helpers: use `jelly = mascot(...)`, not `mascot = mascot(...)`. Colors are six-digit hex strings. Positions and scales are three-number tuples. Geometry helpers return a Blender object; animate `obj.location.x/y/z`, `obj.rotation_euler.x/y/z` (radians), or assign `obj.scale = (x,y,z)`. Initial scales on sphere are absolute axis radii, so preserve that scale when animating it.

- `sphere(name, location, scale, color)` — smooth glossy sphere or ellipsoid.
- `box(name, location, scale, color)` — rounded box; scale is full width/depth/height.
- `cylinder(name, location, radius, depth, color)` — cylinder along the Z axis.
- `torus(name, location, major_radius, minor_radius, color)` — ring in the XY plane.
- `tube(name, points, radius, color)` — smooth round tube through a LIST of 3D positions. Do not pass strings or objects as positions. Animate its scale/rotation or location, not its control points.
- `mascot(name, location, color)` — friendly glossy blob with eyes, cheeks and feet; local height about 1.8, width about 1.8. Returns a parent object so scale/rotation moves the whole character. Its default scale is (1,1,1).
- `bowl(name, location, color)` — open mixing bowl, height 1.1, width 2.6. Returns a parent object. Add your own ellipsoid pool at z=location.z+0.75.
- `bottle(name, location, color)` — rounded bottle, body centered at location with nozzle pointing UP, total height 1.4. To pour, set rotation_euler.y=math.pi and add a separate narrow stream underneath. Returns a parent object.
- `camera(target=(0,0,1.4), scale=8.8)` — adjust the orthographic camera. scale is the vertical view size; larger values zoom out.
- `group(name, objects)` — parent an existing list of objects under a new origin object.

The camera looks from (0,-12,7), so faces should face negative Y. The floor is z=-0.12. Keep objects centrally inside x=-2.1..2.1 and z=0..3.4 for the vertical frame. Captions occupy the top and bottom. Usually use 3–12 objects, a clear central subject and visible motion. Use smooth absolute sine-based movement. Do not hide all objects. Do not use `bpy.ops`, material nodes, custom fonts, simulations, files, shell commands, unknown helper functions, or external assets. Do not modify parent hierarchies after build().
