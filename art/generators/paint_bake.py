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
view_layer = bpy.context.view_layer

KINDS = {
    "anvil_armor_light": "metal",
    "anvil_armor_dark": "metal",
    "anvil_iron": "metal",
    "anvil_rivet": "metal",
    "anvil_armor_stain": "metal",
    "anvil_bronze": "bronze",
    "anvil_leather": "leather",
    "anvil_haft": "wood_v",
    "anvil_wood_a": "wood_v",
    "anvil_wood_b": "wood_v",
    "anvil_wood_c": "wood_v",
    "anvil_wood_stain": "wood_v",
    "anvil_groove": "dark",
    "anvil_visor": "dark",
    "team": "cloth",
    "frame": "wood_h",
    "brace": "wood_h",
    "plank_a": "wood_h",
    "plank_b": "wood_h",
    "plank_c": "wood_h",
    "groove": "dark",
    "stave_a": "wood_v",
    "stave_b": "wood_v",
    "stave_c": "wood_v",
    "lid_a": "wood_h",
    "lid_b": "wood_h",
    "lid_shadow": "dark",
    "metal": "metal",
}
EDGE = {"metal": 1.0, "bronze": 1.0, "wood_v": 0.8, "wood_h": 0.8, "leather": 0.5, "cloth": 0.45, "dark": 0.25}


def kind_of(name):
    stem = name.rsplit(".", 1)
    if len(stem) == 2 and stem[1].isdigit():
        name = stem[0]
    return KINDS.get(name, "metal")


def base_color(mat):
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    return tuple(bsdf.inputs["Base Color"].default_value)[:3]


class Graph:
    def __init__(self, mat):
        self.nt = mat.node_tree
        self.nt.nodes.clear()

    def node(self, kind, **props):
        n = self.nt.nodes.new(kind)
        for key, value in props.items():
            setattr(n, key, value)
        return n

    def feed(self, socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            self.nt.links.new(value, socket)
        else:
            socket.default_value = value

    def math(self, op, a, b=None):
        n = self.node("ShaderNodeMath", operation=op)
        self.feed(n.inputs[0], a)
        if b is not None:
            self.feed(n.inputs[1], b)
        return n.outputs[0]

    def vec(self, op, a, b=None, scale=None):
        n = self.node("ShaderNodeVectorMath", operation=op)
        self.feed(n.inputs[0], a)
        if b is not None:
            self.feed(n.inputs[1], b)
        if scale is not None:
            self.feed(n.inputs[3], scale)
        return n.outputs["Value"] if op == "DOT_PRODUCT" else n.outputs["Vector"]

    def remap(self, value, a, b, c, d):
        n = self.node("ShaderNodeMapRange", clamp=True)
        self.feed(n.inputs["Value"], value)
        n.inputs["From Min"].default_value = a
        n.inputs["From Max"].default_value = b
        n.inputs["To Min"].default_value = c
        n.inputs["To Max"].default_value = d
        return n.outputs["Result"]

    def mix(self, a, b, t):
        return self.vec("ADD", a, self.vec("SCALE", self.vec("SUBTRACT", b, a), scale=t))


def paint_network(mat, image, top_range):
    kind = kind_of(mat.name)
    color = base_color(mat)
    g = Graph(mat)
    coords = g.node("ShaderNodeTexCoord")
    geo = g.node("ShaderNodeNewGeometry")
    height = g.node("ShaderNodeSeparateXYZ")
    g.feed(height.inputs["Vector"], coords.outputs["Generated"])
    top = g.remap(height.outputs["Z"], 0.0, 1.0, top_range[0], top_range[1])
    normal = g.node("ShaderNodeSeparateXYZ")
    g.feed(normal.inputs["Vector"], geo.outputs["Normal"])
    facing = g.remap(normal.outputs["Z"], -1.0, 1.0, 0.0, 1.0)
    up_light = g.remap(facing, 0.0, 1.0, 0.72, 1.22)
    ao = g.node("ShaderNodeAmbientOcclusion", samples=16, only_local=True)
    ao.inputs["Distance"].default_value = 0.12
    cavity = g.remap(ao.outputs["AO"], 0.0, 1.0, 0.38, 1.0)
    bevel = g.node("ShaderNodeBevel", samples=8)
    bevel.inputs["Radius"].default_value = 0.022
    edge = g.remap(g.math("SUBTRACT", 1.0, g.vec("DOT_PRODUCT", bevel.outputs["Normal"], geo.outputs["Normal"])), 0.0, 0.08, 0.0, 1.0)
    broad = g.node("ShaderNodeTexNoise")
    g.feed(broad.inputs["Vector"], coords.outputs["Object"])
    broad.inputs["Scale"].default_value = 4.0
    broad.inputs["Detail"].default_value = 2.0
    vary = g.remap(broad.outputs["Fac"], 0.3, 0.7, 0.86, 1.12)
    if kind != "dark":
        stretch = g.node("ShaderNodeMapping")
        g.feed(stretch.inputs["Vector"], coords.outputs["Object"])
        stretch.inputs["Scale"].default_value = (1.0, 1.0, 0.35)
        brush = g.node("ShaderNodeTexNoise")
        g.feed(brush.inputs["Vector"], stretch.outputs["Vector"])
        brush.inputs["Scale"].default_value = 9.0
        brush.inputs["Detail"].default_value = 1.5
        vary = g.math("MULTIPLY", vary, g.remap(brush.outputs["Fac"], 0.35, 0.65, 0.9, 1.08))
    shade = g.math("MULTIPLY", g.math("MULTIPLY", top, up_light), g.math("MULTIPLY", cavity, vary))
    if kind in ("wood_v", "wood_h"):
        mapping = g.node("ShaderNodeMapping")
        g.feed(mapping.inputs["Vector"], coords.outputs["Object"])
        mapping.inputs["Scale"].default_value = (1.0, 1.0, 0.07) if kind == "wood_v" else (0.07, 0.07, 1.0)
        grain = g.node("ShaderNodeTexNoise")
        g.feed(grain.inputs["Vector"], mapping.outputs["Vector"])
        grain.inputs["Scale"].default_value = 22.0
        grain.inputs["Detail"].default_value = 3.0
        grain.inputs["Distortion"].default_value = 0.6
        shade = g.math("MULTIPLY", shade, g.remap(grain.outputs["Fac"], 0.35, 0.65, 0.66, 1.08))
    painted = g.vec("SCALE", color, scale=shade)
    tint = g.mix((0.84, 0.9, 1.1), (1.08, 1.0, 0.9), g.math("MULTIPLY", facing, g.remap(ao.outputs["AO"], 0.3, 1.0, 0.0, 1.0)))
    painted = g.vec("MULTIPLY", painted, tint)
    if kind == "bronze":
        patina = g.remap(ao.outputs["AO"], 0.35, 0.9, 0.65, 0.0)
        painted = g.mix(painted, (0.09, 0.25, 0.2), patina)
    highlight = g.vec("ADD", g.vec("SCALE", painted, scale=1.7), (0.05, 0.05, 0.05))
    painted = g.mix(painted, highlight, g.math("MULTIPLY", edge, EDGE[kind]))
    emit = g.node("ShaderNodeEmission")
    g.feed(emit.inputs["Color"], painted)
    out = g.node("ShaderNodeOutputMaterial")
    g.feed(out.inputs["Surface"], emit.outputs["Emission"])
    target = g.node("ShaderNodeTexImage", image=image)
    g.nt.nodes.active = target


def final_network(mat, image, roughness=0.8):
    g = Graph(mat)
    tex = g.node("ShaderNodeTexImage", image=image)
    bsdf = g.node("ShaderNodeBsdfPrincipled")
    g.feed(bsdf.inputs["Base Color"], tex.outputs["Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    out = g.node("ShaderNodeOutputMaterial")
    g.feed(out.inputs["Surface"], bsdf.outputs["BSDF"])


def select_only(objs, active):
    for o in scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    view_layer.objects.active = active


def unwrap(obj, margin):
    select_only([obj], obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake(obj, name, size, top_range):
    image = bpy.data.images.new(name, size, size, alpha=False)
    image.colorspace_settings.name = "sRGB"
    unique = []
    for mat in obj.data.materials:
        if mat not in unique:
            unique.append(mat)
    for mat in unique:
        paint_network(mat, image, top_range)
    hidden = {}
    for o in scene.objects:
        hidden[o.name] = o.hide_render
        o.hide_render = o is not obj
    select_only([obj], obj)
    bpy.ops.object.bake(type="EMIT", margin=6, use_clear=True)
    for o in scene.objects:
        o.hide_render = hidden[o.name]
    image.filepath_raw = SCRATCH + name + ".png"
    image.file_format = "PNG"
    image.save()
    image.pack()
    for mat in unique:
        final_network(mat, image)
    print("BAKED", name, len(unique), "materials")
    return image


scene.render.engine = "CYCLES"
scene.cycles.samples = 64
scene.cycles.device = "CPU"
scene.render.bake.margin = 6

hero_col = bpy.data.collections["Heroes Test"]
root = bpy.data.objects["Anvil Test"]
root.location = (0.0, 0.0, 0.0)
root.scale = (1.0, 1.0, 1.0)
parts = [o for o in hero_col.all_objects if o.type == "MESH" and o.name != "Eye Glow"]
select_only(parts, parts[0])
bpy.ops.object.convert(target="MESH")
bpy.ops.object.join()
hero = view_layer.objects.active
hero.name = "Anvil Painted"
hero.data.name = "Anvil Painted"
unwrap(hero, 0.01)
bake(hero, "anvil_paint", 1024, (0.62, 1.12))

props_col = bpy.data.collections["Props"]
painted_col = bpy.data.collections.new("Props Painted")
scene.collection.children.link(painted_col)
for src in list(props_col.objects):
    dup = src.copy()
    dup.data = src.data.copy()
    painted_col.objects.link(dup)
    for i, mat in enumerate(dup.data.materials):
        dup.data.materials[i] = mat.copy()
    select_only([dup], dup)
    bpy.ops.object.convert(target="MESH")
    dup = view_layer.objects.active
    dup.name = src.name + " Painted"
    unwrap(dup, 0.012)
    bake(dup, src.name.lower() + "_paint", 512, (0.75, 1.08))

bpy.ops.wm.save_as_mainfile(filepath=SCRATCH + "anvil_painted.blend")
print("SAVED")
