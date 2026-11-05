# Original VideoStudio Blender helper reference

The scene is built using `from scene_api import *` and optionally `import math`.
Define `build()` containing one nested `update(t)` function and return `update`.
Create objects in `build()` only. A still image is rendered at t=0.

Available geometry helpers:
- `sphere(name, location, scale, color)` makes an ellipsoid; scale is a 3-number tuple.
- `box(name, location, scale, color)` makes a rounded box.
- `cylinder(name, location, radius, depth, color)` makes a vertical cylinder.
- `torus(name, location, major_radius, minor_radius, color)` makes a ring.
- `tube(name, points, radius, color)` makes a curved tube from a list of 3D positions.
- `bowl(name, location, color)` and `bottle(name, location, color)` make simple props.
- `group(name, objects)` parents a list of objects, and `camera(target, scale)` adjusts framing.

Use six-digit hex colors. Locations are tuples (x, y, z). The camera faces from negative Y;
z=0 is the floor. Keep subjects roughly within x=-2 to 2, z=0 to 3.4. Do not use loops,
comprehensions, additional imports, direct bpy access, file operations, or commands.
In update(t), change existing transforms only; never construct new objects. Do not use helper
names as variable names. Do not use the generic `mascot()` helper to represent a specific subject.
For a recognisable multi-part subject, build its distinguishing features with separate primitives,
using clear names for the parts, appropriate colours and relative positions. It will be stylised,
not photorealistic. Keep the requested subject and its details in view. If a request cannot be
represented with these helpers, do not substitute a generic prebuilt character.
