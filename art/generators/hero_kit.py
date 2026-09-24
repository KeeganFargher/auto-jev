import os
import tempfile
import bpy
import bmesh
import math
from mathutils import Matrix, Vector

TAU = math.tau

LIBRARY = {
    "steel": ("hq_steel", "#b7bfcd", {"metallic": 0.9, "roughness": 0.28, "bump": 0.05, "bump_scale": 22.0, "rough_var": 0.1}),
    "steel_dark": ("hq_steel_dark", "#4b505d", {"metallic": 0.85, "roughness": 0.4, "bump": 0.08, "bump_scale": 22.0, "rough_var": 0.1}),
    "gold": ("hq_gold", "#e2a93b", {"metallic": 1.0, "roughness": 0.26, "bump": 0.05, "bump_scale": 60.0, "rough_var": 0.08}),
    "leather": ("hq_leather", "#5b3a22", {"roughness": 0.68, "bump": 0.25, "bump_scale": 120.0, "rough_var": 0.12}),
    "mail": ("hq_mail", "#737985", {"metallic": 0.9, "roughness": 0.45, "bump": 0.9, "bump_scale": 420.0}),
    "team": ("hq_team", "#f3f0ea", {"roughness": 0.85, "bump": 0.08, "bump_scale": 200.0}),
    "fur": ("hq_fur", "#7a5a3b", {"roughness": 0.95, "bump": 0.4, "bump_scale": 90.0}),
    "glow": ("hq_glow", "#ffb23e", {"roughness": 0.5, "emission": 9.0}),
}


def linear(hex_colour):
    digits = hex_colour.lstrip("#")
    channels = []
    for start in (0, 2, 4):
        c = int(digits[start:start + 2], 16) / 255
        channels.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*channels, 1.0)


def material(name, hex_colour, metallic=0.0, roughness=0.5, bump=0.0, bump_scale=40.0, rough_var=0.0, emission=0.0, subsurface=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    colour = linear(hex_colour)
    bsdf.inputs["Base Color"].default_value = colour
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if subsurface:
        bsdf.inputs["Subsurface Weight"].default_value = subsurface
    if emission:
        bsdf.inputs["Emission Color"].default_value = colour
        bsdf.inputs["Emission Strength"].default_value = emission
    if bump or rough_var:
        coord = nodes.new("ShaderNodeTexCoord")
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = bump_scale
        noise.inputs["Detail"].default_value = 6.0
        links.new(coord.outputs["Object"], noise.inputs["Vector"])
        if bump:
            height = nodes.new("ShaderNodeBump")
            height.inputs["Strength"].default_value = bump
            height.inputs["Distance"].default_value = 0.01
            links.new(noise.outputs["Fac"], height.inputs["Height"])
            links.new(height.outputs["Normal"], bsdf.inputs["Normal"])
        if rough_var:
            spread = nodes.new("ShaderNodeMapRange")
            spread.inputs["To Min"].default_value = max(0.0, roughness - rough_var)
            spread.inputs["To Max"].default_value = min(1.0, roughness + rough_var)
            links.new(noise.outputs["Fac"], spread.inputs["Value"])
            links.new(spread.outputs["Result"], bsdf.inputs["Roughness"])
    mat.diffuse_color = colour
    mat.metallic = metallic
    mat.roughness = roughness
    return mat


def library(keys):
    return {key: material(LIBRARY[key][0], LIBRARY[key][1], **LIBRARY[key][2]) for key in keys}


def fx_material(name, hex_colour, strength, additive=True, opacity=1.0, noise=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    fade = nodes.new("ShaderNodeAttribute")
    fade.attribute_type = "GEOMETRY"
    fade.attribute_name = "fade"
    info = nodes.new("ShaderNodeObjectInfo")
    faded = nodes.new("ShaderNodeMath")
    faded.operation = "MULTIPLY"
    links.new(fade.outputs["Factor"], faded.inputs[0])
    links.new(info.outputs["Alpha"], faded.inputs[1])
    source = faded
    if noise:
        coord = nodes.new("ShaderNodeTexCoord")
        texture = nodes.new("ShaderNodeTexNoise")
        texture.inputs["Scale"].default_value = noise
        texture.inputs["Detail"].default_value = 4.0
        links.new(coord.outputs["Object"], texture.inputs["Vector"])
        mask = nodes.new("ShaderNodeMapRange")
        mask.inputs["From Min"].default_value = 0.38
        mask.inputs["From Max"].default_value = 0.68
        links.new(texture.outputs["Fac"], mask.inputs["Value"])
        broken = nodes.new("ShaderNodeMath")
        broken.operation = "MULTIPLY"
        links.new(faded.outputs["Value"], broken.inputs[0])
        links.new(mask.outputs["Result"], broken.inputs[1])
        source = broken
    level = nodes.new("ShaderNodeMath")
    level.operation = "MULTIPLY"
    level.inputs[1].default_value = strength if additive else opacity
    links.new(source.outputs["Value"], level.inputs[0])
    clear = nodes.new("ShaderNodeBsdfTransparent")
    colour = linear(hex_colour)
    if additive:
        glow = nodes.new("ShaderNodeEmission")
        glow.inputs["Color"].default_value = colour
        links.new(level.outputs["Value"], glow.inputs["Strength"])
        add = nodes.new("ShaderNodeAddShader")
        links.new(clear.outputs["BSDF"], add.inputs[0])
        links.new(glow.outputs["Emission"], add.inputs[1])
        links.new(add.outputs["Shader"], out.inputs["Surface"])
    else:
        body = nodes.new("ShaderNodeBsdfPrincipled")
        body.inputs["Base Color"].default_value = colour
        body.inputs["Roughness"].default_value = 1.0
        blend = nodes.new("ShaderNodeMixShader")
        links.new(level.outputs["Value"], blend.inputs["Fac"])
        links.new(clear.outputs["BSDF"], blend.inputs[1])
        links.new(body.outputs["BSDF"], blend.inputs[2])
        links.new(blend.outputs["Shader"], out.inputs["Surface"])
    mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = False
    mat.diffuse_color = (*colour[:3], 0.3)
    return mat


def along(start, end):
    start, end = Vector(start), Vector(end)
    direction = end - start
    rotation = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized()).to_matrix().to_4x4()
    return Matrix.Translation(start) @ rotation, direction.length


def lathe(bm, profile, segs, matrix=None, sx=1.0, sy=1.0, turn=0.0, shape=None, caps=(True, True), loop=False, skip=None, arc=None):
    matrix = matrix if matrix is not None else Matrix.Identity(4)
    if arc is not None:
        angles = [arc[0] + (arc[1] - arc[0]) * k / segs for k in range(segs + 1)]
        closed = False
    else:
        angles = [turn + TAU * k / segs for k in range(segs)]
        closed = True
    rings = []
    for z, r in profile:
        if r <= 0.0:
            rings.append([bm.verts.new(matrix @ Vector((0.0, 0.0, z)))])
            continue
        ring_verts = []
        for a in angles:
            m = shape(a) if shape else 1.0
            ring_verts.append(bm.verts.new(matrix @ Vector((r * sx * m * math.cos(a), r * sy * m * math.sin(a), z))))
        rings.append(ring_verts)
    n = len(angles)
    cells = n if closed else n - 1
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if loop else [])
    faces = []
    for i, (low, high) in enumerate(pairs):
        for k in range(cells):
            if skip is not None and skip(i, k):
                continue
            j = (k + 1) % n
            if len(low) == 1:
                faces.append(bm.faces.new((low[0], high[j], high[k])))
            elif len(high) == 1:
                faces.append(bm.faces.new((low[k], low[j], high[0])))
            else:
                faces.append(bm.faces.new((low[k], low[j], high[j], high[k])))
    if closed and not loop:
        if caps[0] and len(rings[0]) > 1:
            faces.append(bm.faces.new(list(reversed(rings[0]))))
        if caps[1] and len(rings[-1]) > 1:
            faces.append(bm.faces.new(rings[-1]))
    return faces


def ring(bm, radius, tube, segs, matrix=None, sx=1.0, sy=1.0, minor=8, z=0.0):
    profile = [(z + tube * math.sin(TAU * k / minor), radius + tube * math.cos(TAU * k / minor)) for k in range(minor)]
    return lathe(bm, profile, segs, matrix, sx, sy, loop=True)


def sweep(bm, path, radii, segs, up=None, closed=False, caps=True, flat=1.0):
    points = [Vector(p) for p in path]
    count = len(points)
    rings = []
    normal = None
    for i, p in enumerate(points):
        if closed:
            before, after = points[i - 1], points[(i + 1) % count]
        else:
            before, after = points[max(i - 1, 0)], points[min(i + 1, count - 1)]
        tangent = (after - before).normalized()
        hint = up[i] if isinstance(up, list) else up
        if hint is not None:
            hint = Vector(hint)
            normal = (hint - hint.dot(tangent) * tangent).normalized()
        elif normal is None:
            normal = tangent.orthogonal().normalized()
        else:
            normal = (normal - normal.dot(tangent) * tangent).normalized()
        binormal = tangent.cross(normal)
        radius = radii[i] if isinstance(radii, (list, tuple)) else radii
        if radius <= 0.0:
            rings.append([bm.verts.new(p)])
            continue
        rings.append([
            bm.verts.new(p + radius * (math.cos(TAU * k / segs) * flat * normal + math.sin(TAU * k / segs) * binormal))
            for k in range(segs)
        ])
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    faces = []
    for low, high in pairs:
        for k in range(segs):
            j = (k + 1) % segs
            if len(high) == 1:
                faces.append(bm.faces.new((low[k], low[j], high[0])))
            elif len(low) == 1:
                faces.append(bm.faces.new((low[0], high[j], high[k])))
            else:
                faces.append(bm.faces.new((low[k], low[j], high[j], high[k])))
    if caps and not closed:
        if len(rings[0]) > 1:
            faces.append(bm.faces.new(list(reversed(rings[0]))))
        if len(rings[-1]) > 1:
            faces.append(bm.faces.new(rings[-1]))
    return faces


def rounded_box(bm, matrix, size, radius, segments=3):
    verts = bmesh.ops.create_cube(bm, size=1.0, matrix=matrix @ Matrix.Diagonal((*size, 1.0)))["verts"]
    edges = list({e for v in verts for e in v.link_edges})
    bmesh.ops.bevel(bm, geom=edges, offset=radius, offset_type="OFFSET", segments=segments, profile=0.5, affect="EDGES", clamp_overlap=True)


def sphere(bm, center, radius, u=16, v=10, scale=(1.0, 1.0, 1.0)):
    return bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=radius, matrix=Matrix.Translation(center) @ Matrix.Diagonal((*scale, 1.0)))["verts"]


def prism(bm, points, low, high):
    bottom = [bm.verts.new(low(u, v)) for u, v in points]
    top = [bm.verts.new(high(u, v)) for u, v in points]
    faces = [bm.faces.new(list(reversed(bottom))), bm.faces.new(top)]
    for i in range(len(points)):
        j = (i + 1) % len(points)
        faces.append(bm.faces.new((bottom[i], bottom[j], top[j], top[i])))
    bmesh.ops.triangulate(bm, faces=faces[:2], quad_method="BEAUTY", ngon_method="BEAUTY")


def grid_sheet(bm, columns, rows, point, fade=None, weight=None):
    grid = [[bm.verts.new(point(i / columns, j / rows)) for j in range(rows + 1)] for i in range(columns + 1)]
    if fade is not None:
        for i in range(columns + 1):
            for j in range(rows + 1):
                grid[i][j][fade] = weight(i / columns, j / rows)
    for i in range(columns):
        for j in range(rows):
            bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    return grid


def solid(thickness, offset=-1.0):
    return ("SOLIDIFY", {"thickness": thickness, "offset": offset, "use_even_offset": True, "use_quality_normals": True})


def bevel(width, segments=2, angle=35.0):
    return ("BEVEL", {"width": width, "segments": segments, "limit_method": "ANGLE", "angle_limit": math.radians(angle), "use_clamp_overlap": True, "harden_normals": True})


def subsurf(levels=1):
    return ("SUBSURF", {"levels": levels, "render_levels": levels})


WEIGHTED = ("WEIGHTED_NORMAL", {"keep_sharp": True})


class Builder:
    def __init__(self, collection, materials):
        self.collection = collection
        self.materials = materials
        self.parts = []

    def build(self, name, fill, mat, recalc=True, sharp=None, modifiers=(), bone=None, fade=False, shadow=True):
        bm = bmesh.new()
        if fade:
            fill(bm, bm.verts.layers.float.new("fade"))
        else:
            fill(bm)
        if recalc:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        for face in bm.faces:
            face.smooth = True
        if sharp is not None:
            for edge in bm.edges:
                if len(edge.link_faces) == 2 and edge.calc_face_angle(0.0) > math.radians(sharp):
                    edge.smooth = False
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(self.materials[mat])
        obj = bpy.data.objects.new(name, mesh)
        self.collection.objects.link(obj)
        obj.visible_shadow = shadow
        for kind, props in modifiers:
            mod = obj.modifiers.new(kind.title(), kind)
            for key, value in props.items():
                setattr(mod, key, value)
        self.parts.append((obj, bone))
        return obj

    def attach(self, rig):
        for obj, bone in self.parts:
            if bone is None:
                continue
            parent_to_bone(obj, rig, bone)


def parent_to_bone(obj, rig, bone):
    data = rig.data.bones[bone]
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    obj.matrix_parent_inverse = (rig.matrix_world @ data.matrix_local @ Matrix.Translation((0.0, data.length, 0.0))).inverted()


def triangles(objects):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    return total
