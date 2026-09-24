import os
import tempfile
import json
import math
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

SCRATCH = os.path.join(os.environ.get("ART_OUT") or os.path.join(tempfile.gettempdir(), "jev-art"), "")
OLD_HEROES = SCRATCH + "heroes_snapshot.blend"
WATERLINE = 0.26
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SHOTS = ARGS[0] if ARGS else "all"

scene = bpy.context.scene
assert scene.name == "Jev Props", scene.name
scene.frame_set(1)


def lin(hexstr):
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


def material(name, hexstr, roughness=0.8, glow=0.0):
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    output = next((n for n in nodes if n.type == "OUTPUT_MATERIAL"), None)
    if bsdf is None:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    if output is None:
        output = nodes.new("ShaderNodeOutputMaterial")
    if not output.inputs["Surface"].is_linked:
        mat.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    color = lin(hexstr)
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    if glow > 0:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = glow
    mat.diffuse_color = color
    mat.roughness = roughness
    mat.metallic = 0.0
    return mat


M = {
    "armor_light": material("anvil_armor_light", "#7A8190"),
    "armor_dark": material("anvil_armor_dark", "#4B505B"),
    "bronze": material("anvil_bronze", "#B7823F"),
    "leather": material("anvil_leather", "#5B3A24"),
    "haft": material("anvil_haft", "#4A3020"),
    "wood_a": material("anvil_wood_a", "#A07A4E"),
    "wood_b": material("anvil_wood_b", "#92704A"),
    "wood_c": material("anvil_wood_c", "#AD8659"),
    "iron": material("anvil_iron", "#3F434B"),
    "rivet": material("anvil_rivet", "#8A909B"),
    "groove": material("anvil_groove", "#2A1C11", 0.9),
    "wood_stain": material("anvil_wood_stain", "#56684C"),
    "armor_stain": material("anvil_armor_stain", "#4C6255"),
    "visor": material("anvil_visor", "#141210", 0.9),
    "glow": material("anvil_glow", "#FFC45A", 0.5, 9.0),
    "team": material("team", "#FFFFFF"),
}
STAIN = {
    "anvil_wood_a": "wood_stain",
    "anvil_wood_b": "wood_stain",
    "anvil_wood_c": "wood_stain",
    "anvil_armor_dark": "armor_stain",
    "anvil_armor_light": "armor_stain",
    "anvil_iron": "armor_stain",
    "anvil_rivet": "armor_stain",
    "anvil_bronze": "armor_stain",
    "anvil_haft": "wood_stain",
}

collection = bpy.data.collections.new("Heroes Test")
scene.collection.children.link(collection)
root = bpy.data.objects.new("Anvil Test", None)
collection.objects.link(root)
DETAIL = []
PARTS = []


def rot_matrix(rot):
    return Euler(tuple(math.radians(a) for a in rot), "XYZ").to_matrix().to_4x4()


def finish(bm, name, mats, flat=False, bevel=0.0, segments=2, angle=35.0, detail=False):
    if not flat:
        limit = math.radians(angle)
        for face in bm.faces:
            face.smooth = True
        for edge in bm.edges:
            face_angle = edge.calc_face_angle(None)
            if face_angle is None or face_angle > limit:
                edge.smooth = False
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for key in mats:
        mesh.materials.append(M[key])
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = root
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(angle)
        mod.use_clamp_overlap = True
        mod.harden_normals = not flat
    if not flat:
        wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        wn.keep_sharp = True
    (DETAIL if detail else PARTS).append(obj)
    return obj


def tbox(name, size, center, top=(1.0, 1.0), rot=(0, 0, 0), mat="armor_light", bevel=0.03, segments=3, flat=False, detail=False):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        if v.co.z > 0:
            v.co.x *= top[0]
            v.co.y *= top[1]
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ rot_matrix(rot), verts=bm.verts[:])
    return finish(bm, name, [mat], flat=flat, bevel=bevel, segments=segments, detail=detail)


def tube(name, a, b, r1, r2, segs=16, mat="armor_dark", bevel=0.012, segments=2, squash=1.0, detail=False):
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=d.length)
    for v in bm.verts:
        v.co.y *= squash
    orient = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ orient, verts=bm.verts[:])
    return finish(bm, name, [mat], bevel=bevel, segments=segments, detail=detail)


def dome(name, r, center, scale=(1, 1, 1), rot=(0, 0, 0), segs=(16, 5), mat="armor_light", bevel=0.012, detail=False):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1] * 2, radius=r)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-5], context="VERTS")
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    scale_m = Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ rot_matrix(rot) @ scale_m, verts=bm.verts[:])
    return finish(bm, name, [mat], bevel=bevel, segments=2, detail=detail)


def torus(name, major, minor, center, scale=(1, 1, 1), rot=(0, 0, 0), segs=(20, 6), mat="bronze", detail=True):
    bm = bmesh.new()
    rings = []
    for i in range(segs[0]):
        a = 2 * math.pi * i / segs[0]
        ring = []
        for j in range(segs[1]):
            b = 2 * math.pi * j / segs[1]
            w = major + minor * math.cos(b)
            ring.append(bm.verts.new((w * math.cos(a), w * math.sin(a), minor * math.sin(b))))
        rings.append(ring)
    for i in range(segs[0]):
        for j in range(segs[1]):
            i2 = (i + 1) % segs[0]
            j2 = (j + 1) % segs[1]
            bm.faces.new((rings[i][j], rings[i2][j], rings[i2][j2], rings[i][j2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    scale_m = Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ rot_matrix(rot) @ scale_m, verts=bm.verts[:])
    return finish(bm, name, [mat], angle=80.0, detail=detail)


def strap(name, a, b, width, thick, mat, detail=False):
    a, b = Vector(a), Vector(b)
    u = (b - a).normalized()
    t = Vector((0, -1, 0))
    t = (t - u * t.dot(u)).normalized()
    w = u.cross(t)
    bm = bmesh.new()
    corners = []
    for end in (a, b):
        for sw, st in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            corners.append(bm.verts.new(end + w * (sw * width / 2) + t * (st * thick / 2)))
    for ids in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        bm.faces.new([corners[i] for i in ids])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return finish(bm, name, [mat], bevel=0.008, segments=2, detail=detail)


def block(bm, lo, hi, mat_index, tops=None):
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    tl, tr = tops if tops else (z1, z1)
    v = [
        bm.verts.new((x0, y0, z0)), bm.verts.new((x1, y0, z0)), bm.verts.new((x1, y1, z0)), bm.verts.new((x0, y1, z0)),
        bm.verts.new((x0, y0, tl)), bm.verts.new((x1, y0, tr)), bm.verts.new((x1, y1, tr)), bm.verts.new((x0, y1, tl)),
    ]
    for ids in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        face = bm.faces.new([v[i] for i in ids])
        face.material_index = mat_index


def build_shield():
    slots = ["wood_a", "wood_b", "wood_c", "iron"]
    idx = {k: i for i, k in enumerate(slots)}
    bm = bmesh.new()
    marks = bmesh.new()
    width, gap, thick = 0.1, 0.008, 0.05
    tops = ((0.98, 1.04), (1.1, 0.99), (0.93, 1.0), (1.02, 0.9))
    woods = ("wood_a", "wood_c", "wood_b", "wood_a")
    for i in range(4):
        x0 = -0.212 + i * (width + gap)
        block(bm, (x0, -thick / 2, 0.0), (x0 + width, thick / 2, 1.0), idx[woods[i]], tops[i])
    for zc in (0.2, 0.72):
        block(bm, (-0.225, -thick / 2 - 0.012, zc - 0.0325), (0.225, -thick / 2, zc + 0.0325), idx["iron"])
        block(bm, (-0.225, thick / 2, zc - 0.0325), (0.225, thick / 2 + 0.01, zc + 0.0325), idx["iron"])
        for i in range(4):
            xc = -0.162 + i * (width + gap)
            block(marks, (xc - 0.013, -thick / 2 - 0.02, zc - 0.013), (xc + 0.013, -thick / 2 - 0.012, zc + 0.013), 0)
    for xc in (-0.17, -0.147, -0.124, -0.101, -0.035, -0.012, 0.011, 0.034):
        block(marks, (xc - 0.006, -thick / 2 - 0.004, 0.785), (xc + 0.006, -thick / 2 + 0.002, 0.885), 1)
    slash = bmesh.new()
    block(slash, (-0.075, -thick / 2 - 0.005, -0.006), (0.075, -thick / 2 + 0.002, 0.006), 1)
    bmesh.ops.transform(slash, matrix=Matrix.Translation((-0.135, 0, 0.835)) @ rot_matrix((0, -32, 0)), verts=slash.verts[:])
    slash_mesh = bpy.data.meshes.new("tmp_slash")
    slash.to_mesh(slash_mesh)
    slash.free()
    marks.from_mesh(slash_mesh)
    bpy.data.meshes.remove(slash_mesh)
    place = Matrix.Translation((0.12, -0.33, 0.1)) @ rot_matrix((-5, 0, 15))
    for target in (bm, marks):
        bmesh.ops.recalc_face_normals(target, faces=target.faces[:])
        bmesh.ops.transform(target, matrix=place, verts=target.verts[:])
    finish(marks, "Anvil Test Shield Marks", ["rivet", "groove"], flat=True)
    return finish(bm, "Anvil Test Shield", slots, flat=True, bevel=0.006, segments=1, angle=40.0)


def build():
    right = -1
    left = 1
    tbox("Torso", (0.42, 0.3, 0.56), (0, -0.01, 1.02), top=(1.3, 1.25), mat="armor_light", bevel=0.07)
    tube("Gorget", (0, 0.01, 1.24), (0, 0.01, 1.36), 0.17, 0.15, mat="armor_dark")
    tube("Helm", (0, 0, 1.28), (0, 0, 1.52), 0.13, 0.118, mat="armor_light", bevel=0.01)
    dome("Helm Top", 0.118, (0, 0, 1.52), scale=(1, 1, 0.85), mat="armor_light", bevel=0.0)
    tube("Belt", (0, 0, 0.68), (0, 0, 0.78), 0.215, 0.215, mat="leather", squash=0.8)
    for side in (left, right):
        s = side
        dome("Pauldron", 0.19, (0.262 * s, 0.0, 1.3), scale=(1.05, 1.05, 1.0), rot=(0, 18 * s, 0), mat="armor_light")
        dome("Pauldron Lame", 0.15, (0.295 * s, 0.0, 1.19), scale=(1.0, 1.0, 0.8), rot=(0, 32 * s, 0), mat="armor_dark")
    tube("Upper Arm R", (-0.27, 0, 1.2), (-0.34, -0.05, 0.98), 0.095, 0.085, segs=12)
    tube("Forearm R", (-0.34, -0.05, 0.98), (-0.22, -0.19, 0.94), 0.085, 0.1, segs=12)
    tbox("Gauntlet R", (0.165, 0.175, 0.155), (-0.2, -0.24, 0.93), top=(1.12, 1.12), mat="armor_dark", bevel=0.04, segments=2)
    tube("Upper Arm L", (0.27, 0, 1.2), (0.34, -0.06, 0.96), 0.095, 0.085, segs=12)
    tube("Forearm L", (0.34, -0.06, 0.96), (0.25, -0.2, 0.85), 0.085, 0.1, segs=12)
    tbox("Gauntlet L", (0.165, 0.175, 0.155), (0.22, -0.24, 0.83), top=(1.12, 1.12), mat="armor_dark", bevel=0.04, segments=2)
    legs = (
        (left, (0.13, 0.0, 0.7), (0.16, -0.06, 0.46), (0.17, -0.08, 0.17), -0.13),
        (right, (-0.13, 0.0, 0.7), (-0.16, 0.0, 0.46), (-0.17, 0.02, 0.17), -0.03),
    )
    for side, hip, knee, ankle, boot_y in legs:
        tube("Thigh", hip, knee, 0.11, 0.095, segs=12)
        dome("Knee", 0.08, (knee[0], knee[1] - 0.07, knee[2]), rot=(90, 0, 0), segs=(12, 4), mat="armor_light")
        tube("Greave", (knee[0], knee[1], knee[2] - 0.02), ankle, 0.095, 0.12, mat="armor_light")
        tbox("Boot", (0.2, 0.3, 0.17), (ankle[0], boot_y, 0.085), top=(0.85, 0.7), mat="armor_dark", bevel=0.035, segments=2)
    for phi in (300, 240, 345, 195):
        a = math.radians(phi)
        tbox("Tasset", (0.15, 0.035, 0.25), (0.21 * math.cos(a), 0.17 * math.sin(a), 0.6), top=(0.85, 1.0), rot=(-12, 0, phi - 270), mat="armor_light", bevel=0.015, segments=2)
    tbox("Hip Cloth", (0.14, 0.02, 0.32), (-0.13, -0.2, 0.52), top=(0.9, 1.0), rot=(-5, 0, -10), mat="team", bevel=0.008, segments=2)
    tbox("Cape", (0.46, 0.035, 0.78), (0, 0.2, 0.84), top=(0.85, 1.0), rot=(8, 0, 0), mat="team", bevel=0.015, segments=2)
    tube("Hammer Haft", (-0.15, -0.28, 0.18), (-0.2, -0.24, 1.0), 0.038, 0.038, segs=10, mat="haft", bevel=0.0)
    tbox("Hammer Head", (0.27, 0.16, 0.18), (-0.15, -0.28, 0.095), top=(0.9, 0.9), mat="iron", bevel=0.022, segments=2)
    build_shield()

    tbox("Eye Slit", (0.17, 0.03, 0.028), (0, -0.118, 1.46), mat="visor", bevel=0.006, segments=1, detail=True)
    tbox("Eye Glow", (0.15, 0.012, 0.014), (0, -0.128, 1.46), mat="glow", bevel=0.0, detail=True)
    tbox("Nose Guard", (0.03, 0.02, 0.12), (0, -0.127, 1.38), mat="bronze", bevel=0.006, segments=1, detail=True)
    tube("Brow Band", (0, 0, 1.488), (0, 0, 1.514), 0.124, 0.122, mat="bronze", detail=True)
    tbox("Crest", (0.05, 0.27, 0.1), (0, 0.01, 1.66), top=(0.55, 0.75), mat="team", bevel=0.012, segments=2, detail=True)
    strap("Sash", (-0.22, -0.212, 1.28), (0.21, -0.19, 0.76), 0.11, 0.03, "team")
    tbox("Buckle", (0.1, 0.03, 0.07), (0, -0.18, 0.73), mat="bronze", bevel=0.01, segments=2, detail=True)
    for side in (left, right):
        torus("Pauldron Rim", 0.19, 0.016, (0.262 * side, 0.0, 1.3), scale=(1.05, 1.05, 1.0), rot=(0, 18 * side, 0), segs=(16, 5))
    for elbow in ((-0.34, -0.05, 0.98), (0.34, -0.06, 0.96)):
        dome("Elbow", 0.065, (elbow[0] * 1.08, elbow[1] + 0.03, elbow[2]), rot=(0, 90 if elbow[0] > 0 else -90, 0), segs=(12, 4), mat="armor_light", detail=True)
    for x, y in ((0.17, -0.13), (-0.17, -0.03)):
        tbox("Toe Cap", (0.16, 0.07, 0.07), (x, y - 0.12, 0.05), top=(0.9, 0.9), mat="bronze", bevel=0.015, segments=2, detail=True)
    tube("Hammer Grip", (-0.195, -0.245, 0.78), (-0.2, -0.24, 0.9), 0.044, 0.044, segs=10, mat="leather", bevel=0.0, detail=True)
    for dx in (-0.1, 0.1):
        tbox("Hammer Band", (0.03, 0.17, 0.192), (-0.15 + dx, -0.28, 0.095), mat="bronze", bevel=0.008, segments=1, detail=True)
    dome("Pommel", 0.045, (-0.2, -0.24, 1.0), segs=(8, 3), mat="bronze", bevel=0.0, detail=True)


def apply_waterline(objs):
    for obj in objs:
        if obj.name.startswith(("Hammer", "Pommel")):
            continue
        mesh = obj.data
        names = [m.name for m in mesh.materials]
        if not any(n in STAIN for n in names):
            continue
        world = obj.matrix_world
        bm = bmesh.new()
        bm.from_mesh(mesh)
        if min((world @ v.co).z for v in bm.verts) >= WATERLINE:
            bm.free()
            continue
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, WATERLINE), plane_no=(0, 0, 1))
        remap = {}
        for i, n in enumerate(names):
            if n in STAIN:
                key = STAIN[n]
                stain_name = M[key].name
                if stain_name not in [m.name for m in mesh.materials]:
                    mesh.materials.append(M[key])
                remap[i] = [m.name for m in mesh.materials].index(stain_name)
        for face in bm.faces:
            if (world @ face.calc_center_median()).z < WATERLINE - 1e-4 and face.material_index in remap:
                face.material_index = remap[face.material_index]
        bm.to_mesh(mesh)
        bm.free()


build()
apply_waterline(PARTS + DETAIL)
anvil_parts = PARTS + DETAIL


def measure(objs, origin):
    dg = bpy.context.evaluated_depsgraph_get()
    tris, radius, top = 0, 0.0, 0.0
    for obj in objs:
        ev = obj.evaluated_get(dg)
        mesh = ev.to_mesh()
        mesh.calc_loop_triangles()
        tris += len(mesh.loop_triangles)
        for v in mesh.vertices:
            p = ev.matrix_world @ v.co - origin
            radius = max(radius, math.hypot(p.x, p.y))
            top = max(top, p.z)
        ev.to_mesh_clear()
    return tris, radius, top


stats = measure(anvil_parts, root.location)
per_part = sorted(((measure([o], root.location), o.name) for o in anvil_parts), reverse=True)
print("TOP_TRIS", [(n, t[0]) for t, n in per_part[:8]])
print("TOP_RADIUS", sorted(((round(t[1], 3), n) for t, n in per_part), reverse=True)[:6])
print("ANVIL_STATS", json.dumps({"triangles": stats[0], "max_radius": round(stats[1], 3), "height": round(stats[2], 3), "ratio": round(stats[1] / stats[2], 3)}))

with bpy.data.libraries.load(OLD_HEROES, link=False) as (src, dst):
    dst.collections = [n for n in src.collections if n in ("Heroes", "Heroes HQ")]
old = {}
for col in dst.collections:
    scene.collection.children.link(col)
    roots = [o for o in col.objects if o.parent is None]
    old[col.name] = roots[0]


def hero_height(col_objs):
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = 1e9, -1e9
    for obj in col_objs:
        if obj.type != "MESH":
            continue
        ev = obj.evaluated_get(dg)
        for corner in ev.bound_box:
            z = (ev.matrix_world @ Vector(corner)).z
            lo, hi = min(lo, z), max(hi, z)
    return hi - lo


groups = {
    "Props": bpy.data.collections["Props"],
    "Heroes Test": collection,
    "Heroes": bpy.data.collections["Heroes"],
    "Heroes HQ": bpy.data.collections["Heroes HQ"],
}
cam = scene.camera


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


def shoot(filename, show, elevation, azimuth, pad, res, engine="BLENDER_EEVEE"):
    for name, col in groups.items():
        col.hide_render = name not in show
    bpy.data.collections["Preview"].hide_render = False
    scene.render.engine = engine
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


def place_lineup():
    targets = (("Heroes", -1.2), ("Heroes Test", 0.0), ("Heroes HQ", 1.2))
    for name, x in targets:
        node = root if name == "Heroes Test" else old[name]
        node.scale = (1, 1, 1)
        bpy.context.view_layer.update()
        objs = [o for o in groups[name].all_objects]
        h = hero_height(objs)
        factor = 1.75 / h
        node.scale = (factor, factor, factor)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        cx, cy, n = 0.0, 0.0, 0
        for obj in objs:
            if obj.type != "MESH":
                continue
            ev = obj.evaluated_get(dg)
            for corner in ev.bound_box:
                p = ev.matrix_world @ Vector(corner)
                cx += p.x
                cy += p.y
                n += 1
        node.location.x += x - cx / n
        node.location.y += 0.0 - cy / n
        bpy.context.view_layer.update()


if SHOTS in ("all", "silhouette"):
    for obj in DETAIL:
        obj.hide_render = True
    place_lineup()
    shading = scene.display.shading
    shading.light = "FLAT"
    shading.color_type = "SINGLE"
    shading.single_color = (0.0, 0.0, 0.0)
    shading.show_shadows = False
    shading.show_cavity = False
    shading.show_object_outline = False
    world_color = tuple(scene.world.color)
    scene.world.color = (1.0, 1.0, 1.0)
    bpy.data.collections["Preview"].hide_render = True
    for name, col in groups.items():
        col.hide_render = name not in ("Heroes", "Heroes Test", "Heroes HQ")
    for filename, el, res in (("sil_game.png", 55, (900, 420)), ("sil_front.png", 5, (900, 420)), ("sil_small.png", 55, (300, 140))):
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.render.resolution_x, scene.render.resolution_y = res
        lo, hi = bounds([groups[n] for n in ("Heroes", "Heroes Test", "Heroes HQ")])
        center = (lo + hi) / 2
        distance = max(hi - lo) * 1.55
        e = math.radians(el)
        offset = Vector((0, -math.cos(e), math.sin(e))) * distance
        cam.location = center + offset
        cam.rotation_euler = (-offset).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = SCRATCH + filename
        bpy.ops.render.render(write_still=True)
        print("SHOT", filename)
    scene.world.color = world_color
    for obj in DETAIL:
        obj.hide_render = False

if SHOTS in ("all", "final"):
    place_lineup()
    shoot("anvil_compare.png", ("Heroes", "Heroes Test", "Heroes HQ"), 55, 0, 1.5, (1500, 800))
    for name in ("Heroes", "Heroes HQ"):
        old[name].location.y += 30.0
    root.scale = (1, 1, 1)
    root.location = (1.5, 0.05, 0.0)
    bpy.context.view_layer.update()
    shoot("anvil_game.png", ("Props", "Heroes Test"), 55, 0, 1.45, (1400, 900))
    shoot("anvil_front.png", ("Heroes Test",), 14, 22, 2.2, (900, 1100))
    root.location = (0.0, 0.0, 0.0)
    for name in ("Heroes", "Heroes HQ"):
        old[name].location.y -= 30.0
    bpy.ops.wm.save_as_mainfile(filepath=SCRATCH + "anvil_test.blend")
