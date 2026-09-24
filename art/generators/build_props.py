import tempfile
import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

TAG = "jev_props"
SCENE_NAME = "Jev Props"
OUT = os.environ.get("ART_OUT") or os.path.join(tempfile.gettempdir(), "jev-art")
OUT_DIR = os.path.join(OUT, "props")
BLEND_PATH = os.path.join(OUT, "jev_props.blend")
LIVE = not bpy.app.background

PALETTE = {
    "frame": ("#6B4226", 0.8),
    "groove": ("#3E2614", 0.9),
    "plank_a": ("#C99A5B", 0.8),
    "plank_b": ("#BB8A4F", 0.8),
    "plank_c": ("#D1A566", 0.8),
    "brace": ("#A06A36", 0.8),
    "stave_a": ("#A5693A", 0.8),
    "stave_b": ("#9A6034", 0.8),
    "stave_c": ("#AE7342", 0.8),
    "lid_a": ("#C08C55", 0.8),
    "lid_b": ("#B27E4A", 0.8),
    "lid_shadow": ("#5A3820", 0.9),
    "metal": ("#70757D", 0.55),
    "tile_a": ("#8F89A7", 0.9),
    "tile_b": ("#7F7998", 0.9),
}


def srgb_to_linear(hexstr):
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


def tagged(idblock):
    idblock[TAG] = True
    return idblock


def cleanup():
    wm = bpy.context.window_manager
    fallback = next((s for s in bpy.data.scenes if s.name != SCENE_NAME), None)
    for win in wm.windows:
        if win.scene.name == SCENE_NAME and fallback is not None:
            win.scene = fallback
    for collection in (
        bpy.data.objects,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.worlds,
        bpy.data.collections,
    ):
        for idblock in list(collection):
            if idblock.get(TAG):
                collection.remove(idblock)
    scene = bpy.data.scenes.get(SCENE_NAME)
    if scene is not None:
        bpy.data.scenes.remove(scene)


def make_material(name, hexstr, roughness):
    mat = tagged(bpy.data.materials.new(name))
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
    color = srgb_to_linear(hexstr)
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    mat.diffuse_color = color
    mat.roughness = roughness
    mat.metallic = 0.0
    return mat


BOX_FACES = ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3))


def add_box(bm, center, size, mat_index, rot=None):
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    basis = rot if rot is not None else Matrix.Identity(3)
    origin = Vector(center)
    verts = [
        bm.verts.new(origin + basis @ Vector((x, y, z)))
        for x in (-hx, hx)
        for y in (-hy, hy)
        for z in (-hz, hz)
    ]
    for ids in BOX_FACES:
        face = bm.faces.new([verts[i] for i in ids])
        face.material_index = mat_index


def finish(bm, name, slot_names, materials, collection, bevel_width):
    mesh = tagged(bpy.data.meshes.new(name))
    bm.to_mesh(mesh)
    bm.free()
    for slot in slot_names:
        mesh.materials.append(materials[slot])
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = tagged(bpy.data.objects.new(name, mesh))
    collection.objects.link(obj)
    if bevel_width > 0:
        bevel = obj.modifiers.new("Bevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = 1
        bevel.limit_method = "ANGLE"
        bevel.angle_limit = math.radians(40)
        bevel.use_clamp_overlap = True
    return obj


def build_crate(materials, collection):
    slots = ["frame", "groove", "plank_a", "plank_b", "plank_c", "brace"]
    idx = {name: i for i, name in enumerate(slots)}
    size = 0.66
    beam = 0.085
    inner = size - 2 * beam
    core_inset = 0.045
    plank_t = 0.015
    brace_t = 0.02
    gap = 0.012
    plank_w = (inner - 2 * gap) / 3
    half = size / 2
    center = Vector((0, 0, half))
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            add_box(bm, center + Vector((sx * (half - beam / 2), sy * (half - beam / 2), 0)), (beam, beam, size), idx["frame"])
    for sz in (-1, 1):
        for sy in (-1, 1):
            add_box(bm, center + Vector((0, sy * (half - beam / 2), sz * (half - beam / 2))), (inner, beam, beam), idx["frame"])
        for sx in (-1, 1):
            add_box(bm, center + Vector((sx * (half - beam / 2), 0, sz * (half - beam / 2))), (beam, inner, beam), idx["frame"])
    core = size - 2 * core_inset
    add_box(bm, center, (core, core, core), idx["groove"])
    faces = (
        ((0, 0, 1), (1, 0, 0), (0, 1, 0), 1),
        ((0, -1, 0), (1, 0, 0), (0, 0, 1), -1),
        ((0, 1, 0), (-1, 0, 0), (0, 0, 1), 1),
        ((1, 0, 0), (0, 1, 0), (0, 0, 1), -1),
        ((-1, 0, 0), (0, -1, 0), (0, 0, 1), 1),
    )
    plank_slots = [idx["plank_a"], idx["plank_b"], idx["plank_c"]]
    orders = ((0, 1, 2), (1, 2, 0), (2, 0, 1), (0, 2, 1), (1, 0, 2))
    for face_index, (n, u, v, brace_dir) in enumerate(faces):
        n, u, v = Vector(n), Vector(u), Vector(v)
        basis = Matrix((u, v, n)).transposed()
        plank_depth = half - core_inset + plank_t / 2
        for i in range(3):
            offset = -inner / 2 + plank_w / 2 + i * (plank_w + gap)
            add_box(bm, center + n * plank_depth + v * offset, (inner, plank_w, plank_t), plank_slots[orders[face_index][i]], basis)
        angle = math.radians(45 * brace_dir)
        u2 = u * math.cos(angle) + v * math.sin(angle)
        v2 = -u * math.sin(angle) + v * math.cos(angle)
        brace_basis = Matrix((u2, v2, n)).transposed()
        brace_depth = half - core_inset + plank_t + brace_t / 2
        add_box(bm, center + n * brace_depth, (inner * math.sqrt(2), 0.08, brace_t), idx["brace"], brace_basis)
    return finish(bm, "Crate", slots, materials, collection, 0.006)


def build_barrel(materials, collection):
    slots = ["stave_a", "stave_b", "stave_c", "lid_a", "lid_b", "lid_shadow", "metal"]
    idx = {name: i for i, name in enumerate(slots)}
    sides = 14
    height = 0.78
    end_r = 0.225
    mid_r = 0.272
    rim_t = 0.026
    lid_drop = 0.04

    def radius_at(z):
        return end_r + (mid_r - end_r) * math.sin(math.pi * z / height)

    ring_z = (0.0, 0.08, 0.2, 0.39, 0.58, 0.7, height)

    def mesh_radius(z):
        for k in range(len(ring_z) - 1):
            if ring_z[k] <= z <= ring_z[k + 1]:
                t = (z - ring_z[k]) / (ring_z[k + 1] - ring_z[k])
                return radius_at(ring_z[k]) * (1 - t) + radius_at(ring_z[k + 1]) * t
        return end_r

    angles = [2 * math.pi * i / sides + math.pi / sides for i in range(sides)]

    def ring(r, z):
        return [bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for a in angles]

    bm = bmesh.new()
    rings = [ring(radius_at(z), z) for z in ring_z]
    stave_order = (0, 1, 2, 1, 0, 2, 1, 0, 2, 0, 1, 2, 0, 1)
    stave_slots = [idx["stave_a"], idx["stave_b"], idx["stave_c"]]
    for k in range(len(ring_z) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            face = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            face.material_index = stave_slots[stave_order[i]]
    top = rings[-1]
    inner_r = end_r - rim_t
    inner_top = ring(inner_r, height)
    inner_low = ring(inner_r, height - lid_drop)
    for i in range(sides):
        j = (i + 1) % sides
        face = bm.faces.new((top[i], top[j], inner_top[j], inner_top[i]))
        face.material_index = stave_slots[stave_order[i]]
        face = bm.faces.new((inner_top[i], inner_top[j], inner_low[j], inner_low[i]))
        face.material_index = idx["lid_shadow"]
    lid = bm.faces.new(inner_low)
    lid.material_index = idx["lid_a"]
    bottom = bm.faces.new(list(reversed(rings[0])))
    bottom.material_index = idx["stave_a"]
    lid_z = height - lid_drop

    def lid_faces():
        bm.normal_update()
        return [f for f in bm.faces if f.normal.z > 0.9 and all(abs(v.co.z - lid_z) < 1e-6 for v in f.verts)]

    cut = inner_r / 3
    for x in (-cut, cut):
        found = lid_faces()
        geom = list(found) + list({e for f in found for e in f.edges}) + list({v for f in found for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(x, 0, 0), plane_no=(1, 0, 0))
    planks = lid_faces()
    for f in planks:
        f.material_index = idx["lid_a"] if abs(f.calc_center_median().x) < cut else idx["lid_b"]
    bmesh.ops.inset_individual(bm, faces=planks, thickness=0.007, depth=-0.004)
    hoops = ((0.04, 0.085), (0.215, 0.25), (0.53, 0.565), (0.69, 0.735))
    for z0, z1 in hoops:
        samples = [z0 + (z1 - z0) * s / 4 for s in range(5)]
        r_out = max(radius_at(z) for z in samples) + 0.011
        r_in = min(mesh_radius(z) for z in samples) - 0.012
        o0, o1, i0, i1 = ring(r_out, z0), ring(r_out, z1), ring(r_in, z0), ring(r_in, z1)
        for i in range(sides):
            j = (i + 1) % sides
            for quad in (
                (o0[i], o0[j], o1[j], o1[i]),
                (o1[i], o1[j], i1[j], i1[i]),
                (o0[j], o0[i], i0[i], i0[j]),
            ):
                face = bm.faces.new(quad)
                face.material_index = idx["metal"]
    return finish(bm, "Barrel", slots, materials, collection, 0.005)


def build_board(materials, collection):
    slots = ["tile_a", "tile_b"]
    bm = bmesh.new()
    for ix, x in enumerate((-1.5, -0.5, 0.5, 1.5)):
        for iy, y in enumerate((-1.0, 0.0, 1.0)):
            add_box(bm, (x, y, -0.075), (0.97, 0.97, 0.15), (ix + iy) % 2)
    return finish(bm, "Preview Board", slots, materials, collection, 0.02)


if LIVE:
    cleanup()
    scene = tagged(bpy.data.scenes.new(SCENE_NAME))
else:
    scene = bpy.context.scene
    for leftover in list(scene.objects):
        bpy.data.objects.remove(leftover)
    scene.name = SCENE_NAME
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
props_col = tagged(bpy.data.collections.new("Props"))
preview_col = tagged(bpy.data.collections.new("Preview"))
scene.collection.children.link(props_col)
scene.collection.children.link(preview_col)
materials = {name: make_material(name, hexstr, rough) for name, (hexstr, rough) in PALETTE.items()}
crate = build_crate(materials, props_col)
barrel = build_barrel(materials, props_col)
board = build_board(materials, preview_col)
crate.location = (-0.5, 0.0, 0.0)
barrel.location = (0.5, 0.0, 0.0)

world = tagged(bpy.data.worlds.new("Jev Props World"))
if world.node_tree is None:
    world.use_nodes = True
background = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
background.inputs["Color"].default_value = srgb_to_linear("#3A366F")
background.inputs["Strength"].default_value = 1.7
scene.world = world

sun_data = tagged(bpy.data.lights.new("Preview Sun", "SUN"))
sun_data.energy = 4.0
sun_data.angle = math.radians(8)
sun_data.color = srgb_to_linear("#FFF0DC")[:3]
sun = tagged(bpy.data.objects.new("Preview Sun", sun_data))
sun.rotation_euler = Vector((0.55, 0.8, -1.0)).normalized().to_track_quat("-Z", "Y").to_euler()
preview_col.objects.link(sun)

target = Vector((0.0, 0.0, 0.32))
elevation = math.radians(55)
azimuth = math.radians(20)
distance = 3.3
offset = Vector((
    math.sin(azimuth) * math.cos(elevation),
    -math.cos(azimuth) * math.cos(elevation),
    math.sin(elevation),
)) * distance
cam_data = tagged(bpy.data.cameras.new("Preview Camera"))
cam_data.lens = 50
cam = tagged(bpy.data.objects.new("Preview Camera", cam_data))
cam.location = target + offset
cam.rotation_euler = (-offset).to_track_quat("-Z", "Y").to_euler()
preview_col.objects.link(cam)
scene.camera = cam

if LIVE:
    bpy.context.window_manager.windows[0].scene = scene
    screens = [bpy.context.window_manager.windows[0].screen]
else:
    screens = list(bpy.data.screens)
for screen in screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.shading.type = "MATERIAL"
            r3d = space.region_3d
            r3d.view_perspective = "PERSP"
            r3d.view_location = target
            r3d.view_rotation = cam.rotation_euler.to_quaternion()
            r3d.view_distance = distance

view_layer = scene.view_layers[0]
view_layer.update()
depsgraph = view_layer.depsgraph
triangles = {}
for obj in (crate, barrel, board):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    triangles[obj.name] = len(mesh.loop_triangles)
    evaluated.to_mesh_clear()

exported = []
if not LIVE:
    os.makedirs(OUT_DIR, exist_ok=True)
    for obj in (crate, barrel):
        saved = obj.location.copy()
        obj.location = (0.0, 0.0, 0.0)
        for other in scene.objects:
            other.select_set(False)
        obj.select_set(True)
        view_layer.objects.active = obj
        path = os.path.join(OUT_DIR, obj.name.lower() + ".glb")
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_cameras=False,
            export_lights=False,
        )
        obj.location = saved
        exported.append(path)
    for other in scene.objects:
        other.select_set(False)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

result = {
    "triangles": triangles,
    "crate_dimensions": list(crate.dimensions),
    "barrel_dimensions": list(barrel.dimensions),
    "exported": exported,
    "scene": scene.name,
}
if not LIVE:
    print("JEV_RESULT " + json.dumps(result))
