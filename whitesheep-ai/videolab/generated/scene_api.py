import bpy
import math
from mathutils import Vector

__all__=['sphere','box','cylinder','torus','tube','mascot','bowl','bottle','camera','group']
_materials={}
def material(color):
    if color in _materials:return _materials[color]
    c=color.lstrip('#');rgb=tuple(int(c[i:i+2],16)/255 for i in (0,2,4))
    m=bpy.data.materials.new(color);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1)
    bs.inputs['Roughness'].default_value=.26;bs.inputs['Coat Weight'].default_value=.32
    _materials[color]=m;return m
def finish(o,name,color):
    o.name=name;o.data.materials.append(material(color))
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=True
    return o
def sphere(name,location,scale,color):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=location)
    o=bpy.context.object;o.scale=scale;return finish(o,name,color)
def box(name,location,scale,color):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    b=o.modifiers.new('Rounded edges','BEVEL');b.width=min(scale)*.15;b.segments=3
    o.modifiers.new('Soft normals','WEIGHTED_NORMAL');return finish(o,name,color)
def cylinder(name,location,radius,depth,color):
    bpy.ops.mesh.primitive_cylinder_add(vertices=40,radius=radius,depth=depth,location=location)
    o=bpy.context.object;b=o.modifiers.new('Soft edge','BEVEL');b.width=.04;b.segments=3
    o.modifiers.new('Soft normals','WEIGHTED_NORMAL');return finish(o,name,color)
def torus(name,location,major_radius,minor_radius,color):
    bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=12,major_radius=major_radius,minor_radius=minor_radius,location=location)
    return finish(bpy.context.object,name,color)
def tube(name,points,radius,color):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=radius;cu.bevel_resolution=3
    sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
    for p,co in zip(sp.points,points):p.co=(*co,1)
    o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);return finish(o,name,color)
def group(name,objects):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o)
    for child in objects:child.parent=o
    return o
def mascot(name,location,color):
    parts=[sphere('Body',(0,0,.9),(.85,.67,.9),color)]
    for x in [-.45,.45]:parts.append(sphere('Foot',(x,-.12,.18),(.39,.43,.19),color))
    for x in [-.31,.31]:
        parts.extend([sphere('Eye',(x,-.59,1.10),(.25,.14,.31),'#ffffff'),sphere('Pupil',(x,-.72,1.1),(.12,.06,.18),'#241342'),sphere('Glint',(x-.035,-.775,1.17),(.038,.018,.047),'#ffffff'),sphere('Cheek',(x*1.65,-.56,.74),(.13,.035,.07),'#ff68aa')])
    parts.append(sphere('Mouth',(0,-.655,.7),(.14,.035,.09),'#35204d'))
    o=group(name,parts);o.location=location;return o
def bowl(name,location,color):
    profile=[(.03,.10),(.6,.10),(.98,.30),(1.25,.67),(1.35,1.05),(1.27,1.09),(1.16,.7),(.92,.4),(.55,.24),(.03,.24)]
    n=48;verts=[];faces=[]
    for r,z in profile:
        for i in range(n):a=i*2*math.pi/n;verts.append((r*math.cos(a),r*math.sin(a),z))
    for j in range(len(profile)-1):
        for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);finish(ob,name,color)
    o=group(name,[ob,torus('Rim',(0,0,1.07),1.30,.055,'#caffee')]);o.location=location;return o
def bottle(name,location,color):
    parts=[box('Body',(0,0,0),(.65,.48,.95),color),cylinder('Neck',(0,0,.56),.15,.23,color),cylinder('Nozzle',(0,0,.74),.065,.17,'#ffffff')]
    o=group(name,parts);o.location=location;return o
def camera(target=(0,0,1.4),scale=8.8):
    cam=bpy.context.scene.camera;cam.location=(0,-12,7);cam.data.type='ORTHO';cam.data.ortho_scale=scale
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
def setup():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);_materials.clear()
    floor=box('Studio floor',(0,0,-.2),(200,200,.2),'#6d508e')
    floor.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.75
    for pos,power,size in [((-4,-5,8),1300,6),((5,-1,6),1000,5),((0,5,7),1500,5)]:
        bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size
        o.rotation_euler=(Vector((0,0,1.3))-o.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add();bpy.context.scene.camera=bpy.context.object;camera()
    bpy.context.scene.world.color=(.2,.2,.2)
