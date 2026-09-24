import math
from dataclasses import dataclass, field
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Vector

SENTINEL = (1.0, 0.0, 1.0)

EDGE = {
    "metal": 1.0,
    "bronze": 1.0,
    "gold": 1.0,
    "wood_v": 0.8,
    "bone": 0.7,
    "leather": 0.5,
    "skin": 0.35,
    "skin_soft": 0.25,
    "cloth": 0.3,
    "hair": 0.3,
    "fur": 0.25,
    "paint": 0.2,
}

ORGANIC = {"skin", "skin_soft", "fur", "hair", "cloth", "bone", "paint"}

STREAKED = {"fur", "hair"}

TUNING = {"skin_soft": {"cavity": 0.74, "vary": (0.96, 1.04), "brush": (0.97, 1.03), "shadow": (0.94, 0.9, 0.96)}}


@dataclass
class Recipe:
    id: str
    source: Path
    target: Path
    hq: str
    rig: str
    kinds: dict
    targets: dict
    team: str
    glow: dict
    drop: frozenset = frozenset()
    gradients: dict = field(default_factory=dict)
    weights: dict = field(default_factory=dict)
    uv_boost: dict = field(default_factory=dict)
    isolate: tuple = ()
    glow_colour: str | None = None
    glow_strength: float = 6.0
    texture_size: int = 1024


def stem(name):
    return name[:-2] if name[-2:] in (".L", ".R") else name


def triangle_count(mesh):
    return sum(len(polygon.vertices) - 2 for polygon in mesh.polygons)


def linear(hex_colour):
    value = hex_colour.lstrip("#")
    channels = [int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]

    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels)


def select_only(objects, active):
    view_layer = bpy.context.view_layer

    for obj in view_layer.objects:
        obj.select_set(False)

    for obj in objects:
        obj.select_set(True)

    view_layer.objects.active = active


def rest_pose(rig):
    scene = bpy.context.scene

    for obj in scene.objects:
        if obj.animation_data is not None:
            obj.animation_data.action = None

            for track in obj.animation_data.nla_tracks:
                track.mute = True

    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)

    scene.frame_set(0)
    bpy.context.view_layer.update()


def applied_mesh(obj, name, modifiers, unwrap_first=False):
    holder = bpy.data.objects.new(name, obj.data.copy())
    bpy.context.scene.collection.objects.link(holder)

    if unwrap_first:
        holder.data.uv_layers.new(name="UVMap")
        select_only([holder], holder)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.02, correct_aspect=True)
        bpy.ops.object.mode_set(mode="OBJECT")

    for kind, settings in modifiers:
        modifier = holder.modifiers.new(kind.lower(), kind)

        for key, value in settings.items():
            setattr(modifier, key, value)

    evaluated = holder.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated)
    mesh.name = name
    bpy.data.objects.remove(holder, do_unlink=True)

    return mesh


def material_of(obj):
    return obj.material_slots[0].material.name if obj.material_slots else ""


def kind_of(recipe, name):
    if name == recipe.team or name in recipe.glow:
        return None

    if name not in recipe.kinds:
        raise KeyError(f"material {name} has no paint kind in the recipe")

    return recipe.kinds[name]


def skin(part, obj, recipe):
    weigh = recipe.weights.get(stem(obj.name))

    if weigh is None:
        group = part.vertex_groups.new(name=obj.parent_bone)
        group.add(range(len(part.data.vertices)), 1.0, "REPLACE")

        return

    groups = {}

    for vertex in part.data.vertices:
        for bone, weight in weigh(vertex.co).items():
            if bone not in groups:
                groups[bone] = part.vertex_groups.new(name=bone)

            groups[bone].add([vertex.index], weight, "REPLACE")


def low_part(obj, recipe, report, index):
    target = recipe.targets[stem(obj.name)]
    solidify = next((mod for mod in obj.modifiers if mod.type == "SOLIDIFY"), None)
    before = target / 2.6 if solidify is not None else target
    base = triangle_count(obj.data)
    modifiers = []

    if base > before * 1.05:
        modifiers.append(("DECIMATE", {"decimate_type": "COLLAPSE", "ratio": before / base, "use_collapse_triangulate": True}))

    if solidify is not None:
        modifiers.append(
            (
                "SOLIDIFY",
                {"thickness": solidify.thickness, "offset": solidify.offset, "use_even_offset": solidify.use_even_offset},
            )
        )

    mesh = applied_mesh(obj, f"lp_{obj.name}", modifiers, unwrap_first=True)
    mesh.transform(obj.matrix_world)
    organic = kind_of(recipe, material_of(obj)) in ORGANIC
    mesh.shade_smooth()
    mesh.set_sharp_from_angle(angle=math.radians(75 if organic else 38))
    part = bpy.data.objects.new(f"lp_{obj.name}", mesh)
    bpy.context.scene.collection.objects.link(part)
    report.setdefault("parts", {})[obj.name] = [base, triangle_count(mesh), target]
    tag = mesh.attributes.new("part", "INT", "FACE")
    tag.data.foreach_set("value", [index] * len(mesh.polygons))
    skin(part, obj, recipe)

    return part


def high_part(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated)
    mesh.transform(obj.matrix_world)
    part = bpy.data.objects.new(f"hq_{obj.name}", mesh)
    bpy.context.scene.collection.objects.link(part)

    return part


def join(parts, name):
    select_only(parts, parts[0])
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    joined.data.name = name

    return joined


def measure(obj):
    count = len(obj.data.vertices)
    points = np.empty(count * 3)
    obj.data.vertices.foreach_get("co", points)
    points = points.reshape(-1, 3)

    return float(np.hypot(points[:, 0], points[:, 1]).max()), float(points[:, 2].min()), float(points[:, 2].max())


def hq_parts(recipe):
    return [obj for obj in bpy.data.collections[recipe.hq].objects if obj.type == "MESH"]


def high_source(recipe):
    return join([high_part(obj) for obj in hq_parts(recipe)], f"{recipe.id}_bake_source")


def build_parts(recipe, report):
    rig = bpy.data.objects[recipe.rig]
    rest_pose(rig)
    kept = [obj for obj in hq_parts(recipe) if obj.name not in recipe.drop]
    low = join([low_part(obj, recipe, report, index) for index, obj in enumerate(kept)], f"{recipe.id}_body")
    low["parts"] = [obj.name for obj in kept]
    high = high_source(recipe)
    reach, floor, top = measure(low)
    report["low"] = {
        "triangles": triangle_count(low.data),
        "vertices": len(low.data.vertices),
        "reach": round(reach, 3),
        "floor": round(floor, 3),
        "height": round(top - floor, 3),
        "normalized_reach": round(reach * 1.8 / (top - floor), 3),
        "groups": sorted(group.name for group in low.vertex_groups),
        "materials": [slot.material.name for slot in low.material_slots],
    }
    report["high"] = {"triangles": triangle_count(high.data)}

    return rig, low, high


def base_color(material):
    bsdf = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")

    return tuple(bsdf.inputs["Base Color"].default_value)[:3]


class Graph:
    def __init__(self, material):
        self.tree = material.node_tree
        self.tree.nodes.clear()

    def node(self, kind, **props):
        created = self.tree.nodes.new(kind)

        for key, value in props.items():
            setattr(created, key, value)

        return created

    def feed(self, socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            self.tree.links.new(value, socket)
        else:
            socket.default_value = value

    def math(self, operation, a, b=None):
        created = self.node("ShaderNodeMath", operation=operation)
        self.feed(created.inputs[0], a)

        if b is not None:
            self.feed(created.inputs[1], b)

        return created.outputs[0]

    def vec(self, operation, a, b=None, scale=None):
        created = self.node("ShaderNodeVectorMath", operation=operation)
        self.feed(created.inputs[0], a)

        if b is not None:
            self.feed(created.inputs[1], b)

        if scale is not None:
            self.feed(created.inputs[3], scale)

        return created.outputs["Value"] if operation == "DOT_PRODUCT" else created.outputs["Vector"]

    def remap(self, value, a, b, c, d, smooth=False):
        created = self.node("ShaderNodeMapRange", clamp=True)

        if smooth:
            created.interpolation_type = "SMOOTHSTEP"

        self.feed(created.inputs["Value"], value)
        created.inputs["From Min"].default_value = a
        created.inputs["From Max"].default_value = b
        created.inputs["To Min"].default_value = c
        created.inputs["To Max"].default_value = d

        return created.outputs["Result"]

    def mix(self, a, b, t):
        return self.vec("ADD", a, self.vec("SCALE", self.vec("SUBTRACT", b, a), scale=t))

    def gradient(self, colour, spec, coords):
        other, start, end = spec
        height = self.node("ShaderNodeSeparateXYZ")
        self.feed(height.inputs["Vector"], coords.outputs["Object"])
        wobble = self.node("ShaderNodeTexNoise")
        self.feed(wobble.inputs["Vector"], coords.outputs["Object"])
        wobble.inputs["Scale"].default_value = 7.0
        wobble.inputs["Detail"].default_value = 3.0
        shifted = self.math("ADD", height.outputs["Z"], self.remap(wobble.outputs["Fac"], 0.3, 0.7, -0.04, 0.04))

        return self.mix(colour, linear(other), self.remap(shifted, start, end, 0.0, 1.0, smooth=True))

    def emit(self, colour):
        emission = self.node("ShaderNodeEmission")
        self.feed(emission.inputs["Color"], colour)
        out = self.node("ShaderNodeOutputMaterial")
        self.feed(out.inputs["Surface"], emission.outputs["Emission"])


def target_node(graph, image):
    if image is None:
        return None

    node = graph.node("ShaderNodeTexImage", image=image)
    graph.tree.nodes.active = node

    return node


def flat_network(material, colour, image, gradient=None):
    graph = Graph(material)

    if gradient is None:
        graph.emit((*colour, 1.0))
    else:
        coords = graph.node("ShaderNodeTexCoord")
        graph.emit(graph.gradient(colour, gradient, coords))

    target_node(graph, image)


def paint_network(material, image, kind, gradient=None, top_range=(0.66, 1.1)):
    colour = base_color(material)
    tune = TUNING.get(kind, {})
    g = Graph(material)
    coords = g.node("ShaderNodeTexCoord")
    geo = g.node("ShaderNodeNewGeometry")
    height = g.node("ShaderNodeSeparateXYZ")
    g.feed(height.inputs["Vector"], coords.outputs["Generated"])
    top = g.remap(height.outputs["Z"], 0.0, 1.0, top_range[0], top_range[1])
    normal = g.node("ShaderNodeSeparateXYZ")
    g.feed(normal.inputs["Vector"], geo.outputs["Normal"])
    facing = g.remap(normal.outputs["Z"], -1.0, 1.0, 0.0, 1.0)
    up_light = g.remap(facing, 0.0, 1.0, 0.74, 1.2)
    ao = g.node("ShaderNodeAmbientOcclusion", samples=8, only_local=True)
    ao.inputs["Distance"].default_value = 0.14
    cavity = g.remap(ao.outputs["AO"], 0.0, 1.0, tune.get("cavity", 0.4), 1.0)
    bevel = g.node("ShaderNodeBevel", samples=4)
    bevel.inputs["Radius"].default_value = 0.02
    edge = g.remap(
        g.math("SUBTRACT", 1.0, g.vec("DOT_PRODUCT", bevel.outputs["Normal"], geo.outputs["Normal"])), 0.0, 0.08, 0.0, 1.0
    )
    broad = g.node("ShaderNodeTexNoise")
    g.feed(broad.inputs["Vector"], coords.outputs["Object"])
    broad.inputs["Scale"].default_value = 4.0
    broad.inputs["Detail"].default_value = 2.0
    vary = g.remap(broad.outputs["Fac"], 0.3, 0.7, *tune.get("vary", (0.86, 1.12)))
    stretch = g.node("ShaderNodeMapping")
    g.feed(stretch.inputs["Vector"], coords.outputs["Object"])
    stretch.inputs["Scale"].default_value = (1.0, 1.0, 0.35)
    brush = g.node("ShaderNodeTexNoise")
    g.feed(brush.inputs["Vector"], stretch.outputs["Vector"])
    brush.inputs["Scale"].default_value = 14.0 if kind in STREAKED else 9.0
    brush.inputs["Detail"].default_value = 2.5 if kind in STREAKED else 1.5
    low_brush = 0.78 if kind in STREAKED else 0.9
    vary = g.math("MULTIPLY", vary, g.remap(brush.outputs["Fac"], 0.35, 0.65, *tune.get("brush", (low_brush, 1.08))))
    shade = g.math("MULTIPLY", g.math("MULTIPLY", top, up_light), g.math("MULTIPLY", cavity, vary))

    if kind == "wood_v":
        mapping = g.node("ShaderNodeMapping")
        g.feed(mapping.inputs["Vector"], coords.outputs["Object"])
        mapping.inputs["Scale"].default_value = (1.0, 1.0, 0.07)
        grain = g.node("ShaderNodeTexNoise")
        g.feed(grain.inputs["Vector"], mapping.outputs["Vector"])
        grain.inputs["Scale"].default_value = 22.0
        grain.inputs["Detail"].default_value = 3.0
        grain.inputs["Distortion"].default_value = 0.6
        shade = g.math("MULTIPLY", shade, g.remap(grain.outputs["Fac"], 0.35, 0.65, 0.66, 1.08))

    base = colour if gradient is None else g.gradient(colour, gradient, coords)
    painted = g.vec("SCALE", base, scale=shade)
    tint = g.mix(tune.get("shadow", (0.84, 0.9, 1.1)), (1.08, 1.0, 0.9), g.math("MULTIPLY", facing, g.remap(ao.outputs["AO"], 0.3, 1.0, 0.0, 1.0)))
    painted = g.vec("MULTIPLY", painted, tint)

    if kind == "bronze":
        patina = g.remap(ao.outputs["AO"], 0.35, 0.9, 0.55, 0.0)
        painted = g.mix(painted, (0.09, 0.25, 0.2), patina)

    highlight = g.vec("ADD", g.vec("SCALE", painted, scale=1.7), (0.05, 0.05, 0.05))
    painted = g.mix(painted, highlight, g.math("MULTIPLY", edge, EDGE[kind]))
    g.emit(painted)
    target_node(g, image)


def paint_materials(materials, recipe, image):
    for material in materials:
        gradient = recipe.gradients.get(material.name)

        if material.name == recipe.team:
            flat_network(material, (1.0, 1.0, 1.0), image)
        elif material.name in recipe.glow:
            flat_network(material, linear(recipe.glow[material.name]), image, gradient)
        else:
            paint_network(material, image, kind_of(recipe, material.name), gradient)


def materials_of(objects):
    found = []

    for obj in objects:
        for slot in obj.material_slots:
            if slot.material not in found:
                found.append(slot.material)

    return found


def blank_image(name, colour, size):
    image = bpy.data.images.new(name, size, size, alpha=False)
    image.colorspace_settings.name = "sRGB"
    image.pixels.foreach_set(np.tile(np.array((*colour, 1.0), dtype=np.float32), size * size))

    return image


def pixels_of(image, size):
    buffer = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(buffer)

    return buffer.reshape(size, size, 4)


def use_gpu():
    scene = bpy.context.scene

    try:
        preferences = bpy.context.preferences.addons["cycles"].preferences
        preferences.compute_device_type = "METAL"
        preferences.get_devices()
        devices = [device for device in preferences.devices if device.type == "METAL"]

        for device in devices:
            device.use = True

        scene.cycles.device = "GPU" if devices else "CPU"
    except (KeyError, TypeError, AttributeError):
        scene.cycles.device = "CPU"

    return scene.cycles.device


def count_islands(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    layer = bm.loops.layers.uv.active
    seen = set()
    islands = 0

    for face in bm.faces:
        if face.index in seen:
            continue

        islands += 1
        stack = [face]
        seen.add(face.index)

        while stack:
            current = stack.pop()

            for loop in current.loops:
                for other in loop.edge.link_faces:
                    if other.index in seen:
                        continue

                    shared = [l for l in other.loops if l.vert in (loop.vert, loop.link_loop_next.vert)]

                    if len(shared) == 2 and all(
                        (s[layer].uv - l[layer].uv).length < 1e-5
                        for s in shared
                        for l in (loop, loop.link_loop_next)
                        if s.vert == l.vert
                    ):
                        seen.add(other.index)
                        stack.append(other)

    bm.free()

    return islands


def boost_uvs(obj, boost):
    names = [slot.material.name for slot in obj.material_slots]
    layer = obj.data.uv_layers.active.data

    for polygon in obj.data.polygons:
        factor = boost.get(names[polygon.material_index])

        if factor is None:
            continue

        for index in polygon.loop_indices:
            layer[index].uv = layer[index].uv * factor


def unwrap(obj, report, boost=None):
    select_only([obj], obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()

    if boost:
        bpy.ops.object.mode_set(mode="OBJECT")
        boost_uvs(obj, boost)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.select_all(action="SELECT")

    bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    loops = len(obj.data.loops)
    uv = np.empty(loops * 2, dtype=np.float32)
    obj.data.uv_layers.active.data.foreach_get("uv", uv)
    report["uv"] = {"islands": count_islands(obj), "min": [round(float(uv.min()), 3)], "max": [round(float(uv.max()), 3)]}


def fill_triangle(mask, a, b, c):
    size = mask.shape[0]
    x0, x1 = max(int(np.floor(min(a[0], b[0], c[0]))), 0), min(int(np.ceil(max(a[0], b[0], c[0]))), size - 1)
    y0, y1 = max(int(np.floor(min(a[1], b[1], c[1]))), 0), min(int(np.ceil(max(a[1], b[1], c[1]))), size - 1)

    if x1 < x0 or y1 < y0:
        return

    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    edges = [(q[0] - p[0]) * (ys - p[1]) - (q[1] - p[1]) * (xs - p[0]) for p, q in ((a, b), (b, c), (c, a))]
    inside = ((edges[0] >= 0) & (edges[1] >= 0) & (edges[2] >= 0)) | ((edges[0] <= 0) & (edges[1] <= 0) & (edges[2] <= 0))
    mask[y0 : y1 + 1, x0 : x1 + 1] |= inside


def part_mask(low, names, size, dilate=2):
    wanted = {index for index, name in enumerate(low["parts"]) if name in names}
    parts = np.empty(len(low.data.polygons), dtype=np.int32)
    low.data.attributes["part"].data.foreach_get("value", parts)
    uv = np.empty(len(low.data.loops) * 2, dtype=np.float32)
    low.data.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2) * size
    mask = np.zeros((size, size), dtype=bool)

    for polygon in low.data.polygons:
        if parts[polygon.index] not in wanted:
            continue

        corners = [uv[index] for index in polygon.loop_indices]

        for k in range(1, len(corners) - 1):
            fill_triangle(mask, corners[0], corners[k], corners[k + 1])

    for _ in range(dilate):
        grown = mask.copy()
        grown[1:, :] |= mask[:-1, :]
        grown[:-1, :] |= mask[1:, :]
        grown[:, 1:] |= mask[:, :-1]
        grown[:, :-1] |= mask[:, 1:]
        mask = grown

    return mask


def missed_of(pixels):
    return np.all(np.abs(pixels[..., :3] - np.array(SENTINEL, dtype=np.float32)) < 0.02, axis=-1)


def set_targets(materials, image):
    for material in materials:
        node = next(node for node in material.node_tree.nodes if node.type == "TEX_IMAGE")
        node.image = image
        material.node_tree.nodes.active = node


def bake_texture(low, high, recipe, report, out, settings=None, debug=False):
    settings = settings or {}
    scene = bpy.context.scene
    size = recipe.texture_size
    materials = materials_of([low, high])
    projected = blank_image(f"{recipe.id}_projected", SENTINEL, size)
    paint_materials(materials, recipe, projected)
    scene.render.engine = "CYCLES"
    report["device"] = use_gpu()
    scene.cycles.samples = 32
    scene.render.bake.margin = 0

    for obj in scene.objects:
        obj.hide_render = obj not in (low, high)

    select_only([high, low], low)
    bpy.ops.object.bake(
        type="EMIT",
        use_selected_to_active=True,
        cage_extrusion=settings.get("ext", 0.025),
        max_ray_distance=settings.get("dist", 0.09),
        margin=0,
        use_clear=False,
    )
    direct = blank_image(f"{recipe.id}_direct", (0.0, 0.0, 0.0), size)
    set_targets(materials, direct)
    high.hide_render = True
    select_only([low], low)
    bpy.ops.object.bake(type="EMIT", margin=8, use_clear=True)
    a = pixels_of(projected, size)
    b = pixels_of(direct, size)

    if debug:
        for image, name in ((projected, "debug_projected.png"), (direct, "debug_direct.png")):
            image.filepath_raw = str(out / name)
            image.file_format = "PNG"
            image.save()

    missed = missed_of(a)
    merged = np.where(missed[..., None], b, a)
    isolated = 0

    for receivers, sources in recipe.isolate:
        group = join([high_part(obj) for obj in hq_parts(recipe) if obj.name in sources], f"{recipe.id}_group")
        target = blank_image(f"{recipe.id}_group", SENTINEL, size)
        set_targets(materials, target)

        for obj in scene.objects:
            obj.hide_render = obj not in (low, group)

        select_only([group, low], low)
        bpy.ops.object.bake(
            type="EMIT",
            use_selected_to_active=True,
            cage_extrusion=settings.get("ext", 0.025),
            max_ray_distance=settings.get("dist", 0.09),
            margin=0,
            use_clear=False,
        )
        c = pixels_of(target, size)
        chosen = part_mask(low, receivers, size) & ~missed_of(c)
        merged[chosen] = c[chosen]
        isolated += int(chosen.sum())
        bpy.data.objects.remove(group, do_unlink=True)
        bpy.data.images.remove(target)

    merged[..., 3] = 1.0
    painted = bpy.data.images.new(f"{recipe.id}_paint", size, size, alpha=False)
    painted.colorspace_settings.name = "sRGB"
    painted.pixels.foreach_set(merged.ravel())
    painted.filepath_raw = str(out / f"{recipe.id}_paint.jpg")
    painted.file_format = "JPEG"
    painted.save(quality=90)
    painted.source = "FILE"
    painted.reload()
    painted.pack()
    covered = np.any(b[..., :3] > 0.004, axis=-1)
    report["bake"] = {
        "covered": round(float(covered.mean()), 3),
        "projected_of_covered": round(float((covered & ~missed).sum() / max(1, covered.sum())), 3),
    }

    if recipe.isolate:
        report["bake"]["isolated"] = round(isolated / (size * size), 4)

    return painted


def principled(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.8
    bsdf.inputs["Metallic"].default_value = 0.0

    return material, bsdf


def final_materials(low, painted, recipe):
    low.data.attributes.remove(low.data.attributes["part"])
    del low["parts"]
    body, body_bsdf = principled(f"{recipe.id}_body")
    texture = body.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = painted
    body.node_tree.links.new(texture.outputs["Color"], body_bsdf.inputs["Base Color"])
    team, team_bsdf = principled("team")
    team_bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    glow, glow_bsdf = principled("glow")
    glow_bsdf.inputs["Roughness"].default_value = 0.5
    glow_bsdf.inputs["Emission Strength"].default_value = recipe.glow_strength

    if recipe.glow_colour is None:
        lit = glow.node_tree.nodes.new("ShaderNodeTexImage")
        lit.image = painted
        glow.node_tree.links.new(lit.outputs["Color"], glow_bsdf.inputs["Base Color"])
        glow.node_tree.links.new(lit.outputs["Color"], glow_bsdf.inputs["Emission Color"])
    else:
        glow_bsdf.inputs["Base Color"].default_value = (*linear(recipe.glow_colour), 1.0)
        glow_bsdf.inputs["Emission Color"].default_value = (*linear(recipe.glow_colour), 1.0)

    names = [slot.material.name for slot in low.material_slots]
    remap = [1 if name == recipe.team else 2 if name in recipe.glow else 0 for name in names]
    indices = np.empty(len(low.data.polygons), dtype=np.int32)
    low.data.polygons.foreach_get("material_index", indices)
    low.data.materials.clear()

    for material in (body, team, glow):
        low.data.materials.append(material)

    low.data.polygons.foreach_set("material_index", np.array(remap, dtype=np.int32)[indices])
    low.data.update()


def setup_render(engine="BLENDER_EEVEE"):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("render_world")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    environment = nodes.new("ShaderNodeTexEnvironment")
    environment.image = bpy.data.images.load(
        str(Path(bpy.utils.resource_path("LOCAL")) / "datafiles" / "studiolights" / "world" / "studio.exr")
    )
    background = next(node for node in nodes if node.type == "BACKGROUND")
    background.inputs["Strength"].default_value = 1.0
    world.node_tree.links.new(environment.outputs["Color"], background.inputs["Color"])
    scene.render.engine = engine
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    camera_data = bpy.data.cameras.new("render_camera")
    camera = bpy.data.objects.new("render_camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    sun_data = bpy.data.lights.new("render_sun", "SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("render_sun", sun_data)
    sun.rotation_euler = Euler((math.radians(42), math.radians(12), math.radians(-35)))
    scene.collection.objects.link(sun)

    return camera


def render_camera():
    scene = bpy.context.scene

    if scene.camera is not None and scene.camera.name == "render_camera":
        return scene.camera

    return setup_render()


def shoot(camera, location, target, path, size=(720, 720), lens=50):
    scene = bpy.context.scene
    camera.location = location
    direction = Vector(target) - Vector(location)
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = lens
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def show_only(objects):
    for obj in bpy.context.scene.objects:
        obj.hide_render = obj.type in ("MESH", "ARMATURE") and obj not in objects


def render_views(objects, prefix, out):
    show_only(objects)
    camera = render_camera()
    shoot(camera, (-2.6, -4.6, 2.1), (0.0, 0.0, 1.0), out / f"{prefix}_front.png")
    shoot(camera, (2.3, 4.2, 2.6), (0.0, 0.0, 1.0), out / f"{prefix}_back.png")
    shoot(camera, (-2.2, -3.4, 5.4), (0.0, 0.0, 0.8), out / f"{prefix}_game.png")


def lit_preview(materials, recipe, team_colour):
    for material in materials:
        tree = material.node_tree
        emission = next(node for node in tree.nodes if node.type == "EMISSION")
        output = next(node for node in tree.nodes if node.type == "OUTPUT_MATERIAL")

        if material.name in recipe.glow:
            emission.inputs["Strength"].default_value = recipe.glow_strength
            continue

        bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Roughness"].default_value = 0.8

        if material.name == recipe.team:
            bsdf.inputs["Base Color"].default_value = (*linear(team_colour), 1.0)
        elif emission.inputs["Color"].links:
            tree.links.new(emission.inputs["Color"].links[0].from_socket, bsdf.inputs["Base Color"])
        else:
            bsdf.inputs["Base Color"].default_value = emission.inputs["Color"].default_value

        tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])


def append_hero(path, name, offset, team_colour):
    with bpy.data.libraries.load(str(path), link=False) as (_, target):
        target.collections = [name]

    collection = target.collections[0]
    bpy.context.scene.collection.children.link(collection)

    for obj in collection.objects:
        if obj.animation_data is not None:
            obj.animation_data.action = None

            for track in obj.animation_data.nla_tracks:
                track.mute = True

        if obj.parent is None:
            obj.location.x += offset

        for slot in obj.material_slots:
            if slot.material is not None and slot.material.name.startswith("team"):
                bsdf = next(node for node in slot.material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
                bsdf.inputs["Base Color"].default_value = (*linear(team_colour), 1.0)

    return list(collection.objects)


def shoot_game(camera, focus, distance, path, size):
    pitch = math.radians(56)
    location = Vector(focus) + Vector((0.0, -distance * math.cos(pitch), distance * math.sin(pitch)))
    shoot(camera, location, focus, path, size, lens=67.0)


def preview(high, recipe, out, prefix, lineup=(), team_colour="#4ea1ff"):
    scene = bpy.context.scene
    materials = materials_of([high])
    paint_materials(materials, recipe, None)
    lit_preview(materials, recipe, team_colour)
    others = []

    for path, name, offset in lineup:
        others += append_hero(path, name, offset, team_colour)

    camera = setup_render("CYCLES")
    use_gpu()
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    show_only([high])
    shoot(camera, (-1.5, -2.9, 1.8), (0.0, 0.0, 1.08), out / f"{prefix}_front.png", (720, 900))
    shoot(camera, (1.9, 3.1, 2.1), (0.0, 0.0, 1.05), out / f"{prefix}_back.png", (720, 900))
    shoot(camera, (0.6, -1.1, 1.78), (0.02, -0.05, 1.62), out / f"{prefix}_face.png", (720, 720))
    shoot_game(camera, (0.0, 0.0, 0.95), 12.0, out / f"{prefix}_game.png", (360, 360))

    if others:
        show_only([high] + others)
        shoot_game(camera, (0.0, 0.0, 1.0), 9.0, out / f"{prefix}_lineup_game.png", (960, 540))
        shoot(camera, (-0.8, -6.2, 1.9), (0.0, 0.0, 1.05), out / f"{prefix}_lineup_front.png", (960, 540))
