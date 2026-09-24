import os
import tempfile
import bpy
import bmesh
import math
import random
from mathutils import Matrix, Vector

TAU = math.tau
COLLECTION = "Heroes HQ"
ROOT = "Anvil HQ"
SCENE = "Jev Props"
LOCATION = (-1.3, 0.6, 0.0)
STAGE = globals().get("STAGE", 2)


def linear(hex_colour):
    digits = hex_colour.lstrip("#")
    channels = []
    for start in (0, 2, 4):
        c = int(digits[start:start + 2], 16) / 255
        channels.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*channels, 1.0)


def material(name, hex_colour, metallic=0.0, roughness=0.5, bump=0.0, bump_scale=40.0, rough_var=0.0, emission=0.0):
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


MATS = {
    "steel": material("hq_steel", "#b7bfcd", metallic=0.9, roughness=0.28, bump=0.05, bump_scale=22.0, rough_var=0.1),
    "steel_dark": material("hq_steel_dark", "#4b505d", metallic=0.85, roughness=0.4, bump=0.08, bump_scale=22.0, rough_var=0.1),
    "gold": material("hq_gold", "#e2a93b", metallic=1.0, roughness=0.26, bump=0.05, bump_scale=60.0, rough_var=0.08),
    "leather": material("hq_leather", "#5b3a22", roughness=0.68, bump=0.25, bump_scale=120.0, rough_var=0.12),
    "mail": material("hq_mail", "#737985", metallic=0.9, roughness=0.45, bump=0.9, bump_scale=420.0),
    "team": material("hq_team", "#f3f0ea", roughness=0.85, bump=0.08, bump_scale=200.0),
    "fur": material("hq_fur", "#7a5a3b", roughness=0.95, bump=0.4, bump_scale=90.0),
    "glow": material("hq_glow", "#ffb23e", roughness=0.5, emission=9.0),
}

scene = bpy.data.scenes.get(SCENE) or bpy.context.scene
collection = bpy.data.collections.get(COLLECTION) or bpy.data.collections.new(COLLECTION)
if scene.collection.children.get(collection.name) is None:
    scene.collection.children.link(collection)
for old in list(collection.objects):
    data = old.data
    bpy.data.objects.remove(old, do_unlink=True)
    if data is not None and data.users == 0:
        bpy.data.meshes.remove(data)

root = bpy.data.objects.new(ROOT, None)
root.empty_display_type = "PLAIN_AXES"
root.empty_display_size = 0.3
collection.objects.link(root)
root.location = LOCATION


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
        ring = []
        for a in angles:
            m = shape(a) if shape else 1.0
            ring.append(bm.verts.new(matrix @ Vector((r * sx * m * math.cos(a), r * sy * m * math.sin(a), z))))
        rings.append(ring)
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
        if up is not None:
            hint = Vector(up)
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
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=radius, matrix=Matrix.Translation(center) @ Matrix.Diagonal((*scale, 1.0)))


def prism(bm, points, low, high):
    bottom = [bm.verts.new(low(u, v)) for u, v in points]
    top = [bm.verts.new(high(u, v)) for u, v in points]
    faces = [bm.faces.new(list(reversed(bottom))), bm.faces.new(top)]
    for i in range(len(points)):
        j = (i + 1) % len(points)
        faces.append(bm.faces.new((bottom[i], bottom[j], top[j], top[i])))
    bmesh.ops.triangulate(bm, faces=faces[:2], quad_method="BEAUTY", ngon_method="BEAUTY")


def build(name, fill, mat, recalc=True, sharp=None, modifiers=()):
    bm = bmesh.new()
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
    mesh.materials.append(MATS[mat])
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = root
    for kind, props in modifiers:
        mod = obj.modifiers.new(kind.title(), kind)
        for key, value in props.items():
            setattr(mod, key, value)
    return obj


def solid(thickness, offset=-1.0):
    return ("SOLIDIFY", {"thickness": thickness, "offset": offset, "use_even_offset": True, "use_quality_normals": True})


def bevel(width, segments=2, angle=35.0):
    return ("BEVEL", {"width": width, "segments": segments, "limit_method": "ANGLE", "angle_limit": math.radians(angle), "use_clamp_overlap": True, "harden_normals": True})


def subsurf(levels=1):
    return ("SUBSURF", {"levels": levels, "render_levels": levels})


WEIGHTED = ("WEIGHTED_NORMAL", {"keep_sharp": True})

HELM_R = 0.222
HELM_Z = [1.40, 1.43, 1.47, 1.49, 1.51, 1.53, 1.56, 1.575, 1.612, 1.64, 1.70, 1.76, 1.79, 1.815, 1.835, 1.848, 1.855]
HELM_SY = 1.04
EYE_ROW, BREATH_ROWS = 7, {2: {27, 29, 31}, 4: {28, 30, 32}}
EYE_CELLS = {31, 32, 33, 34, 37, 38, 39, 40}


def helm_r(z):
    side = HELM_R + 0.008 * math.sin(math.pi * min(max((z - 1.40) / 0.40, 0.0), 1.0))
    if z <= 1.76:
        return side
    t = min((z - 1.76) / 0.098, 1.0)
    return side * max(0.0, 1 - t ** 4) ** 0.25


def helm_profile(zs, grow=0.0):
    return [(z, helm_r(z) + grow) for z in zs]


def build_helm():
    def shell(bm):
        lathe(
            bm, helm_profile(HELM_Z) + [(1.858, 0.0)], 48, sy=HELM_SY, caps=(False, False),
            skip=lambda i, k: (i == EYE_ROW and k in EYE_CELLS) or k in BREATH_ROWS.get(i, ()),
        )
    build("hq_helm", shell, "steel", recalc=False, modifiers=[solid(0.014), bevel(0.003, 2, 40.0), WEIGHTED])

    def cross(bm):
        brow = [z for z in HELM_Z if 1.612 <= z <= 1.64]
        lathe(bm, helm_profile(brow, 0.002), 12, sy=HELM_SY, arc=(math.radians(228), math.radians(312)))
        strip = [z for z in HELM_Z if 1.43 <= z <= 1.79]
        lathe(bm, helm_profile(strip, 0.003), 2, sy=HELM_SY, arc=(math.radians(262.5), math.radians(277.5)))
    build("hq_helm_cross", cross, "gold", recalc=False, modifiers=[solid(0.007, 1.0), bevel(0.002, 2, 40.0)])

    build("hq_helm_glow", lambda bm: lathe(bm, [(1.44, HELM_R - 0.035), (1.66, HELM_R - 0.031)], 16, sy=HELM_SY, arc=(math.radians(195), math.radians(345))), "glow", recalc=False)

    def crown(bm):
        lathe(bm, [(1.785, HELM_R - 0.005), (1.785, HELM_R + 0.019), (1.835, HELM_R + 0.019), (1.835, HELM_R - 0.005)], 48, sy=HELM_SY, loop=True)
        ring(bm, HELM_R + 0.003, 0.012, 48, sy=HELM_SY, z=1.405)
        for k in range(12):
            a = TAU * (k + 0.5) / 12
            place = Matrix.Translation(((HELM_R + 0.007) * math.cos(a), (HELM_R + 0.007) * HELM_SY * math.sin(a), 1.862)) @ Matrix.Rotation(a, 4, "Z")
            rounded_box(bm, place, (0.024, 0.05, 0.06), 0.006, 2)
    build("hq_crown", crown, "gold", modifiers=[WEIGHTED])


def keel(a):
    return 1.0 + 0.075 * max(0.0, -math.sin(a)) ** 10


def build_torso():
    build("hq_torso", lambda bm: lathe(
        bm, [(0.84, 0.25), (0.94, 0.27), (1.04, 0.31), (1.14, 0.34), (1.24, 0.35), (1.32, 0.33), (1.38, 0.28), (1.42, 0.17), (1.43, 0.0)],
        48, sx=1.1, sy=0.8, shape=keel,
    ), "steel")
    build("hq_gorget", lambda bm: lathe(bm, [(1.36, 0.15), (1.36, 0.17), (1.47, 0.14), (1.47, 0.12)], 32, sx=1.1, loop=True), "steel_dark")

    def trims(bm):
        ring(bm, 0.285, 0.012, 48, sx=1.1, sy=0.8, z=1.375)
        ring(bm, 0.252, 0.011, 48, sx=1.1, sy=0.8, z=0.85)
    build("hq_torso_trim", trims, "gold")


def build_waist():
    build("hq_belt", lambda bm: lathe(bm, [(0.78, 0.24), (0.78, 0.263), (0.875, 0.263), (0.875, 0.24)], 48, sx=1.1, sy=0.83, loop=True), "leather")

    def buckle(bm):
        corners = [(-0.06, 0.0), (0.06, 0.0), (0.06, 0.1), (-0.06, 0.1)]
        path = []
        for (x0, z0), (x1, z1) in zip(corners, corners[1:] + corners[:1]):
            for t in (0.0, 0.33, 0.66):
                path.append((x0 + (x1 - x0) * t, -0.232, 0.777 + z0 + (z1 - z0) * t))
        sweep(bm, path, 0.011, 8, up=(0.0, -1.0, 0.0), closed=True)
        rounded_box(bm, Matrix.Translation((0.0, -0.228, 0.827)), (0.075, 0.018, 0.06), 0.006, 2)
    build("hq_buckle", buckle, "gold")

    def lames(bm):
        for z0, z1, r0, r1 in [(0.72, 0.80, 0.272, 0.262), (0.65, 0.735, 0.292, 0.276), (0.58, 0.665, 0.312, 0.294)]:
            lathe(bm, [(z0, r0), (z1, r1)], 48, sx=1.1, sy=0.85, caps=(False, False))
    build("hq_faulds", lames, "steel", recalc=False, modifiers=[solid(0.01), bevel(0.003, 2, 40.0)])

    def lame_edges(bm):
        ring(bm, 0.274, 0.008, 48, sx=1.1, sy=0.85, z=0.72)
        ring(bm, 0.294, 0.008, 48, sx=1.1, sy=0.85, z=0.65)
    build("hq_fauld_edges", lame_edges, "steel_dark")
    build("hq_fauld_trim", lambda bm: ring(bm, 0.314, 0.011, 48, sx=1.1, sy=0.85, z=0.58), "gold")
    build("hq_mail", lambda bm: lathe(bm, [(0.42, 0.305), (0.64, 0.3)], 48, sx=1.08, sy=0.86, caps=(False, False)), "mail", recalc=False, modifiers=[solid(0.006)])


def build_pauldrons():
    for side in (1, -1):
        tag = "L" if side == 1 else "R"
        base = Matrix.Translation((0.335 * side, 0.0, 1.3)) @ Matrix.Rotation(math.radians(30) * side, 4, "Y")

        def dome(bm, base=base):
            lathe(bm, [(0.0, 0.228), (0.05, 0.222), (0.1, 0.198), (0.15, 0.15), (0.185, 0.085), (0.2, 0.0)], 40, base, sy=1.1, caps=(False, False))
        build(f"hq_pauldron.{tag}", dome, "steel", recalc=False, modifiers=[solid(0.014), bevel(0.003, 2, 40.0), WEIGHTED])

        def lames(bm, base=base):
            for step, radius in ((2, 0.18), (1, 0.205)):
                place = base @ Matrix.Translation((0.055 * step * side, 0.0, -0.09 * step))
                lathe(bm, [(0.0, radius), (0.05, radius * 0.97), (0.09, radius * 0.84)], 40, place, sy=1.1, caps=(False, False))
        build(f"hq_pauldron_lames.{tag}", lames, "steel", recalc=False, modifiers=[solid(0.012), bevel(0.003, 2, 40.0)])

        def rims(bm, base=base):
            ring(bm, 0.232, 0.017, 40, base, sy=1.1)
            for step, radius in ((2, 0.18), (1, 0.205)):
                place = base @ Matrix.Translation((0.055 * step * side, 0.0, -0.09 * step))
                ring(bm, radius + 0.004, 0.01, 40, place, sy=1.1)
        build(f"hq_pauldron_rims.{tag}", rims, "gold")


ARMS = {
    "L": ((0.32, 0.0, 1.26), (0.4, -0.14, 1.02), (0.25, -0.29, 0.99), (0.19, -0.33, 0.99)),
    "R": ((-0.32, 0.0, 1.26), (-0.45, -0.07, 1.03), (-0.37, -0.22, 1.13), (-0.3, -0.302, 1.19)),
}


def build_arms():
    for tag, (shoulder, elbow, wrist, hand) in ARMS.items():
        def plates(bm, shoulder=shoulder, elbow=elbow, wrist=wrist):
            upper, length = along(shoulder, elbow)
            lathe(bm, [(0.0, 0.088), (length * 0.6, 0.086), (length, 0.078)], 24, upper)
            fore, length = along(elbow, wrist)
            lathe(bm, [(0.0, 0.078), (length * 0.55, 0.088), (length - 0.04, 0.082)], 24, fore)
        build(f"hq_arm.{tag}", plates, "steel")

        def joints(bm, shoulder=shoulder, elbow=elbow, wrist=wrist):
            sphere(bm, elbow, 0.078, 20, 12)
            fore, length = along(elbow, wrist)
            lathe(bm, [(length - 0.05, 0.084), (length + 0.015, 0.112), (length + 0.015, 0.1), (length - 0.05, 0.075)], 24, fore, loop=True)
        build(f"hq_arm_joints.{tag}", joints, "steel_dark")

        def fan(bm, shoulder=shoulder, elbow=elbow, wrist=wrist):
            outward = (Vector(elbow) - Vector(shoulder)).cross(Vector(wrist) - Vector(elbow)).normalized()
            if outward.x * (1 if tag == "L" else -1) < 0:
                outward = -outward
            place, _ = along(Vector(elbow) + outward * 0.07, Vector(elbow) + outward * 0.085)
            lathe(bm, [(0.0, 0.075), (0.015, 0.068)], 24, place)
        build(f"hq_couter.{tag}", fan, "gold", modifiers=[bevel(0.003, 2, 40.0)])

        def gauntlet(bm, wrist=wrist, hand=hand):
            place, _ = along(wrist, hand)
            rounded_box(bm, place @ Matrix.Translation((0.0, 0.0, 0.07)), (0.17, 0.15, 0.16), 0.035, 3)
        build(f"hq_gauntlet.{tag}", gauntlet, "steel_dark", modifiers=[WEIGHTED])


LEGS = {"L": ((0.14, 0.0, 0.66), (0.18, -0.04, 0.38), (0.19, -0.02, 0.14)), "R": ((-0.14, 0.0, 0.66), (-0.18, -0.04, 0.38), (-0.19, -0.02, 0.14))}


def build_legs():
    for tag, (hip, knee, ankle) in LEGS.items():
        side = 1 if tag == "L" else -1

        def plates(bm, hip=hip, knee=knee, ankle=ankle):
            thigh, length = along(hip, knee)
            lathe(bm, [(0.0, 0.122), (length * 0.5, 0.118), (length, 0.1)], 24, thigh)
            lathe(bm, [(0.13, 0.092), (0.2, 0.108), (0.3, 0.114), (0.4, 0.098)], 32, Matrix.Translation((ankle[0], -0.03, 0.0)), shape=keel)
        build(f"hq_leg.{tag}", plates, "steel")

        def knee_cop(bm, knee=knee):
            place, _ = along(Vector(knee) + Vector((0.0, -0.05, 0.0)), Vector(knee) + Vector((0.0, -0.15, 0.0)))
            lathe(bm, [(0.0, 0.085), (0.03, 0.08), (0.06, 0.055), (0.078, 0.0)], 24, place)
            sphere(bm, knee, 0.085, 20, 12)
        build(f"hq_knee.{tag}", knee_cop, "steel_dark")

        def knee_fan(bm, knee=knee):
            place, _ = along(Vector(knee) + Vector((0.085 * side, -0.02, 0.0)), Vector(knee) + Vector((0.1 * side, -0.02, 0.0)))
            lathe(bm, [(0.0, 0.07), (0.015, 0.062)], 24, place)
        build(f"hq_knee_fan.{tag}", knee_fan, "gold", modifiers=[bevel(0.003, 2, 40.0)])

        def boot(bm, ankle=ankle):
            x = ankle[0]
            rounded_box(bm, Matrix.Translation((x, -0.06, 0.1)), (0.2, 0.32, 0.12), 0.05, 3)
            rounded_box(bm, Matrix.Translation((x, -0.12, 0.145)), (0.19, 0.08, 0.1), 0.03, 3)
            place, _ = along((x, -0.18, 0.08), (x, -0.25, 0.08))
            lathe(bm, [(0.0, 0.085), (0.04, 0.078), (0.07, 0.05), (0.085, 0.0)], 24, place, sx=1.1, sy=0.8)
        build(f"hq_boot.{tag}", boot, "steel_dark", modifiers=[WEIGHTED])
        build(f"hq_sole.{tag}", lambda bm, x=ankle[0]: rounded_box(bm, Matrix.Translation((x, -0.075, 0.022)), (0.215, 0.37, 0.045), 0.018, 2), "leather")
        build(f"hq_ankle.{tag}", lambda bm, x=ankle[0]: ring(bm, 0.098, 0.014, 32, Matrix.Translation((x, -0.03, 0.155))), "gold")


SHIELD = {"cx": 0.08, "front": -0.46, "width": 0.66, "base": 0.18, "height": 1.12, "curve": 1.2, "arch": 0.06, "dip": 0.08}
ANVIL = [
    (-0.17, 0.075), (-0.07, 0.035), (-0.03, 0.03), (-0.03, -0.03), (-0.08, -0.09),
    (0.11, -0.09), (0.06, -0.03), (0.06, 0.03), (0.13, 0.04), (0.13, 0.10), (-0.07, 0.10),
]


def shield_point(u, t, lift=0.0):
    s = SHIELD
    x = u * s["width"] / 2
    bottom = s["base"] - s["dip"] * (1 - u * u)
    top = s["base"] + s["height"] + s["arch"] * (1 - u * u)
    return Vector((s["cx"] + x, s["front"] + s["curve"] * x * x - lift, bottom + (top - bottom) * t))


def shield_surface(x_local, z, lift):
    s = SHIELD
    return Vector((s["cx"] + x_local, s["front"] + s["curve"] * x_local * x_local - lift, z))


def build_shield():
    cols, rows = 24, 40

    def face(bm):
        grid = [[bm.verts.new(shield_point(-1 + 2 * i / cols, j / rows)) for j in range(rows + 1)] for i in range(cols + 1)]
        for i in range(cols):
            for j in range(rows):
                bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    build("hq_shield", face, "steel_dark", recalc=False, modifiers=[solid(0.035), bevel(0.004, 2, 40.0), WEIGHTED])

    def rim(bm):
        loop = [shield_point(-1 + 2 * i / cols, 0.0, 0.004) for i in range(cols)]
        loop += [shield_point(1.0, j / rows, 0.004) for j in range(rows)]
        loop += [shield_point(1 - 2 * i / cols, 1.0, 0.004) for i in range(cols)]
        loop += [shield_point(-1.0, 1 - j / rows, 0.004) for j in range(rows)]
        sweep(bm, loop, 0.024, 10, up=(0.0, -1.0, 0.0), closed=True)
    build("hq_shield_rim", rim, "gold")

    centre_z = SHIELD["base"] + SHIELD["height"] * 0.5

    def emblem(bm):
        shape = [(u * 1.55 + 0.03, v * 1.55) for u, v in ANVIL]
        prism(bm, shape, lambda u, v: shield_surface(u, centre_z + v, -0.004), lambda u, v: shield_surface(u, centre_z + v, 0.03))
    build("hq_shield_emblem", emblem, "gold", sharp=30.0, modifiers=[bevel(0.006, 3, 30.0), WEIGHTED])

    def rays(bm):
        for degrees in (60, 90, 120, 240, 270, 300):
            a = math.radians(degrees)
            dx, dz = math.cos(a), math.sin(a)
            reach = min((SHIELD["width"] / 2 - 0.07) / abs(dx) if abs(dx) > 1e-3 else 9.0, (SHIELD["height"] / 2 - 0.08) / abs(dz) if abs(dz) > 1e-3 else 9.0)
            start = 0.3
            px, pz = -dz, dx
            outline = [
                (dx * start + px * 0.022, dz * start + pz * 0.022),
                (dx * (reach - 0.06) + px * 0.01, dz * (reach - 0.06) + pz * 0.01),
                (dx * (reach - 0.06) + px * 0.035, dz * (reach - 0.06) + pz * 0.035),
                (dx * reach, dz * reach),
                (dx * (reach - 0.06) - px * 0.035, dz * (reach - 0.06) - pz * 0.035),
                (dx * (reach - 0.06) - px * 0.01, dz * (reach - 0.06) - pz * 0.01),
                (dx * start - px * 0.022, dz * start - pz * 0.022),
            ]
            prism(bm, outline, lambda u, v: shield_surface(u, centre_z + v, -0.004), lambda u, v: shield_surface(u, centre_z + v, 0.014))
    build("hq_shield_rays", rays, "gold", sharp=30.0, modifiers=[bevel(0.003, 2, 30.0), WEIGHTED])


MACE = ((-0.3, -0.35, 0.98), (-0.3, -0.25, 1.52))


def build_mace():
    frame, length = along(*MACE)
    build("hq_mace_grip", lambda bm: lathe(bm, [(-0.02, 0.026), (length, 0.026)], 16, frame), "leather")

    def metal(bm):
        lathe(bm, [(length + 0.015, 0.06), (length + 0.06, 0.082), (length + 0.21, 0.082), (length + 0.25, 0.06)], 32, frame)
        blade = [(0.055, 0.0), (0.125, 0.035), (0.142, 0.13), (0.118, 0.235), (0.055, 0.262)]
        for k in range(7):
            a = TAU * k / 7
            radial = Vector((math.cos(a), math.sin(a), 0.0))
            tangent = Vector((-math.sin(a), math.cos(a), 0.0))
            prism(
                bm, blade,
                lambda r, h, radial=radial, tangent=tangent: frame @ (radial * r + tangent * -0.012 + Vector((0.0, 0.0, length + 0.005 + h))),
                lambda r, h, radial=radial, tangent=tangent: frame @ (radial * r + tangent * 0.012 + Vector((0.0, 0.0, length + 0.005 + h))),
            )
    build("hq_mace_head", metal, "steel", sharp=30.0, modifiers=[bevel(0.004, 2, 30.0), WEIGHTED])

    def gilt(bm):
        sphere(bm, frame @ Vector((0.0, 0.0, -0.055)), 0.048, 16, 10)
        ring(bm, 0.03, 0.012, 20, frame, z=-0.02)
        lathe(bm, [(length - 0.02, 0.036), (length - 0.02, 0.046), (length + 0.02, 0.046), (length + 0.02, 0.036)], 24, frame, loop=True)
        lathe(bm, [(length + 0.245, 0.064), (length + 0.28, 0.052), (length + 0.3, 0.03), (length + 0.42, 0.0)], 24, frame)
    build("hq_mace_gold", gilt, "gold")


def build_plume():
    rng = random.Random(7)

    def strands(bm):
        for _ in range(18):
            x0, y0 = rng.uniform(-0.05, 0.05), rng.uniform(-0.06, 0.05)
            lift, back = rng.uniform(-0.04, 0.06), rng.uniform(-0.04, 0.08)
            controls = [
                Vector((x0, y0, 1.84)),
                Vector((x0 * 1.3, y0 - 0.03, 2.05 + lift * 0.5)),
                Vector((x0 * 2.0, y0 + 0.2 + back * 0.5, 2.14 + lift)),
                Vector((x0 * 2.6, y0 + 0.42 + back, 1.96 + lift * 0.5)),
            ]
            path, radii = [], []
            for i in range(19):
                t = i / 18
                a, b, c, d = controls
                path.append(a * (1 - t) ** 3 + b * 3 * (1 - t) ** 2 * t + c * 3 * (1 - t) * t * t + d * t ** 3)
                radii.append(0.004 + 0.04 * math.sin(math.pi * (0.15 + 0.85 * t)) ** 1.2 * (1 - t) ** 0.5 if t < 1 else 0.0)
            sweep(bm, path, radii, 8)
    build("hq_plume", strands, "team", modifiers=[subsurf(1)])


def build_fur():
    rng = random.Random(11)

    def tufts(bm):
        roll = []
        for k in range(10):
            angle = TAU * k / 10
            roll.append((1.41 + 0.045 * math.sin(angle), 0.235 + 0.05 * math.cos(angle)))
        lathe(bm, roll, 40, sx=1.18, sy=1.0, loop=True)
        for vert in bm.verts:
            vert.co += Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * 0.008
        for row, (radius, height, count, droop) in enumerate(((0.25, 1.44, 44, 0.2), (0.285, 1.4, 54, 0.75), (0.3, 1.36, 60, 1.25))):
            for k in range(count):
                a = TAU * (k + rng.uniform(-0.35, 0.35)) / count + row * 0.2
                outward = Vector((math.cos(a), math.sin(a), 0.0))
                base = Vector((radius * 1.18 * math.cos(a), radius * math.sin(a), height + rng.uniform(-0.012, 0.012)))
                length = rng.uniform(0.05, 0.085)
                bend = (outward + Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), -droop))).normalized()
                path = [base + bend * length * t + Vector((0.0, 0.0, -0.03 * t * t)) for t in (0.0, 0.4, 0.75, 1.0)]
                width = rng.uniform(0.028, 0.04)
                sweep(bm, path, [width, width * 0.9, width * 0.5, 0.0], 6, up=outward + Vector((0.0, 0.0, 0.6)), flat=0.4)
    build("hq_fur", tufts, "fur", recalc=False, modifiers=[subsurf(1)])


def grid_sheet(bm, columns, rows, point):
    grid = [[bm.verts.new(point(i / columns, j / rows)) for j in range(rows + 1)] for i in range(columns + 1)]
    for i in range(columns):
        for j in range(rows):
            bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))


CAPE_ROWS = [(1.40, 0.24, 0.2), (1.25, 0.34, 0.31), (0.9, 0.36, 0.34), (0.35, 0.39, 0.38)]


def build_cape():
    rng = random.Random(5)
    columns, rows = 28, 16
    hem = [rng.uniform(0.0, 0.1) * (1 if i % 3 else 0.2) for i in range(columns + 1)]

    def shape(bm):
        def point(u, v):
            span = v * (len(CAPE_ROWS) - 1)
            index = min(int(span), len(CAPE_ROWS) - 2)
            t = span - index
            z0, rx0, ry0 = CAPE_ROWS[index]
            z1, rx1, ry1 = CAPE_ROWS[index + 1]
            z, rx, ry = z0 + (z1 - z0) * t, rx0 + (rx1 - rx0) * t, ry0 + (ry1 - ry0) * t
            angle = math.radians(-62 + 124 * u)
            fold = 0.035 * v * math.sin(u * math.pi * 7)
            z -= hem[round(u * columns)] * max(0.0, v - 0.85) / 0.15
            return Vector(((rx + fold) * math.sin(angle), (ry + fold) * math.cos(angle), z))
        grid_sheet(bm, columns, rows, point)
    build("hq_cape", shape, "team", recalc=False, modifiers=[solid(0.012), subsurf(1)])

    def tabard(bm):
        def point(u, v):
            z = 0.8 - 0.5 * v
            half = 0.12 + 0.03 * v
            x = (u - 0.5) * 2 * half
            z -= 0.07 * v * (1 - abs(u - 0.5) * 2)
            y = -0.262 - 0.06 * v - 0.012 * v * math.sin(u * math.pi * 4)
            return Vector((x, y, z))
        grid_sheet(bm, 10, 14, point)
    build("hq_tabard", tabard, "team", recalc=False, modifiers=[solid(0.01, 1.0), subsurf(1)])


def build_details():
    frame, length = along(*MACE)
    axis = (Vector(MACE[1]) - Vector(MACE[0])).normalized()
    hand = Vector(ARMS["R"][3])
    wrist = Vector(ARMS["R"][2])
    grip_t = (hand - Vector(MACE[0])).dot(axis)
    palm = wrist - Vector(MACE[0]) - axis * (wrist - Vector(MACE[0])).dot(axis)
    local_palm = frame.to_3x3().inverted() @ palm
    palm_angle = math.atan2(local_palm.y, local_palm.x)

    def fingers(bm):
        for i in range(4):
            h = grip_t - 0.035 + i * 0.03
            path = []
            for k in range(14):
                a = palm_angle + 0.5 + (TAU - 1.3) * k / 13
                path.append(frame @ Vector((0.047 * math.cos(a), 0.047 * math.sin(a), h)))
            sweep(bm, path, 0.017, 8)
        thumb = [frame @ Vector((0.05 * math.cos(palm_angle - 0.4 - 0.9 * k / 6), 0.05 * math.sin(palm_angle - 0.4 - 0.9 * k / 6), grip_t + 0.09)) for k in range(7)]
        sweep(bm, thumb, 0.02, 8)
    build("hq_fingers", fingers, "steel_dark")

    def wrap(bm):
        turns = length / 0.03
        path = [frame @ Vector((0.028 * math.cos(TAU * turns * t), 0.028 * math.sin(TAU * turns * t), length * t)) for t in [k / 160 for k in range(161)]]
        sweep(bm, path, 0.0055, 6)
    build("hq_mace_wrap", wrap, "leather")

    def rivets(bm):
        for u in (-0.9, 0.9):
            for j in range(12):
                sphere(bm, shield_point(u, 0.06 + 0.88 * j / 11, 0.002), 0.013, 10, 6, (1.0, 0.55, 1.0))
        for t in (0.035, 0.965):
            for i in range(7):
                sphere(bm, shield_point(-0.72 + 1.44 * i / 6, t, 0.002), 0.013, 10, 6, (1.0, 0.55, 1.0))
    build("hq_shield_rivets", rivets, "steel")

    def gilt_rivets(bm):
        for side in (1, -1):
            base = Matrix.Translation((0.335 * side, 0.0, 1.3)) @ Matrix.Rotation(math.radians(30) * side, 4, "Y")
            for k in range(12):
                a = TAU * k / 12
                sphere(bm, base @ Vector((0.214 * math.cos(a), 0.214 * 1.1 * math.sin(a), 0.035)), 0.012, 10, 6)
        for k in range(12):
            a = TAU * k / 12
            sphere(bm, Vector(((HELM_R + 0.02) * math.cos(a), (HELM_R + 0.02) * HELM_SY * math.sin(a), 1.81)), 0.011, 10, 6)
        for k in range(11):
            a = math.radians(-60 + 300 * k / 10) + math.pi / 2
            sphere(bm, Vector((0.266 * 1.1 * math.cos(a), 0.266 * 0.83 * math.sin(a), 0.827)), 0.012, 10, 6)
    build("hq_gilt_rivets", gilt_rivets, "gold")

    def combs(bm):
        outer = [(-0.17, 0.11), (-0.1, 0.2), (0.0, 0.245), (0.1, 0.2), (0.17, 0.11)]
        inner = [(0.13, 0.1), (0.07, 0.16), (0.0, 0.185), (-0.07, 0.16), (-0.13, 0.1)]
        outline = outer + inner
        for side in (1, -1):
            base = Matrix.Translation((0.335 * side, 0.0, 1.3)) @ Matrix.Rotation(math.radians(30) * side, 4, "Y")
            prism(bm, outline, lambda y, z, base=base: base @ Vector((-0.009, y, z)), lambda y, z, base=base: base @ Vector((0.009, y, z)))
    build("hq_pauldron_combs", combs, "steel", sharp=30.0, modifiers=[bevel(0.004, 2, 30.0), WEIGHTED])


def build_all():
    build_helm()
    build_torso()
    build_waist()
    build_pauldrons()
    build_arms()
    build_legs()
    build_shield()
    build_mace()
    if STAGE >= 2:
        build_plume()
        build_fur()
        build_cape()
        build_details()


build_all()

depsgraph = bpy.context.evaluated_depsgraph_get()
triangles = 0
for obj in collection.objects:
    if obj.type != "MESH":
        continue
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    triangles += len(mesh.loop_triangles)
    evaluated.to_mesh_clear()
result = {"objects": len(collection.objects), "triangles": triangles}
