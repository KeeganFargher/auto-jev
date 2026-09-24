import os
import tempfile
import math

import bpy
import numpy as np
from mathutils import Vector

SCRATCH = os.path.join(os.environ.get("ART_OUT") or os.path.join(tempfile.gettempdir(), "jev-art"), "")
scene = bpy.context.scene
assert scene.name == "Jev Props", scene.name
scene.frame_set(1)
scene.render.engine = "BLENDER_EEVEE"
cam = scene.camera
root = bpy.data.objects["Anvil Test"]
names = ("Props", "Props Painted", "Heroes Test", "Heroes", "Heroes HQ")
groups = {n: bpy.data.collections[n] for n in names}
bpy.data.collections["Preview"].hide_render = False


def bounds(cols):
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for col in cols:
        for obj in col.all_objects:
            if obj.type != "MESH" or obj.hide_render:
                continue
            ev = obj.evaluated_get(dg)
            for corner in ev.bound_box:
                p = ev.matrix_world @ Vector(corner)
                lo = Vector(map(min, lo, p))
                hi = Vector(map(max, hi, p))
    return lo, hi


def shoot(filename, show, elevation, azimuth, pad, res):
    for name, col in groups.items():
        col.hide_render = name not in show
    scene.render.resolution_x, scene.render.resolution_y = res
    lo, hi = bounds([groups[n] for n in show])
    center = (lo + hi) / 2
    distance = max(hi - lo) * pad
    el, az = math.radians(elevation), math.radians(azimuth)
    offset = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * distance
    cam.location = center + offset
    cam.rotation_euler = (-offset).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = SCRATCH + filename
    bpy.ops.render.render(write_still=True)
    print("SHOT", filename)


def side_by_side(left, right, out):
    images = [bpy.data.images.load(SCRATCH + name) for name in (left, right)]
    arrays = []
    for img in images:
        w, h = img.size
        buf = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(buf)
        arrays.append(buf.reshape(h, w, 4))
    joined = np.concatenate(arrays, axis=1)
    h, w = joined.shape[:2]
    result = bpy.data.images.new("joined", w, h, alpha=False)
    result.pixels.foreach_set(joined.ravel())
    result.filepath_raw = SCRATCH + out
    result.file_format = "PNG"
    result.save()
    print("JOINED", out)


root.location = (1.5, 0.05, 0.0)
root.scale = (1.0, 1.0, 1.0)
bpy.context.view_layer.update()
shoot("painted_front.png", ("Heroes Test",), 14, 22, 2.2, (900, 1100))
shoot("game_flat_props.png", ("Props", "Heroes Test"), 55, 0, 1.45, (1400, 900))
shoot("game_painted_props.png", ("Props Painted", "Heroes Test"), 55, 0, 1.45, (1400, 900))
side_by_side("anvil_front.png", "painted_front.png", "hero_flat_vs_painted.png")
