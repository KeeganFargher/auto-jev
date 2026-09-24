import os
import tempfile
import bpy
import bmesh
import math
from mathutils import Matrix, Vector

HERO = "Bulwark"
COLLECTION = "Heroes"
SCENE = "Jev Props"
LOCATION = globals().get("LOCATION_OVERRIDE", (0.0, 0.9, 0.0))

PALETTE = {
    "plate": ("#7c8397", 0.75, 0.0),
    "plate_dark": ("#3d414f", 0.8, 0.0),
    "gold": ("#d9a441", 0.6, 0.0),
    "steel": ("#a7adbd", 0.65, 0.0),
    "leather": ("#5a3820", 0.85, 0.0),
    "fur": ("#7a5a3b", 0.95, 0.0),
    "glow": ("#ffb23e", 0.5, 3.0),
    "team": ("#ffffff", 0.8, 0.0),
}
MATERIALS = list(PALETTE)
RETIRED = ["skin", "visor"]
GROUPS = [
    "hips", "spine", "head", "cape",
    "upper_arm.L", "forearm.L", "hand.L",
    "upper_arm.R", "forearm.R", "hand.R",
    "thigh.L", "shin.L", "foot.L",
    "thigh.R", "shin.R", "foot.R",
]

CHAMFER = [(0.55, -1.0), (1.0, -0.55), (1.0, 0.55), (0.55, 1.0), (-0.55, 1.0), (-1.0, 0.55), (-1.0, -0.55), (-0.55, -1.0)]
FUR = [
    ((1.0 if i % 2 == 0 else 0.78) * math.cos(math.tau * i / 18), (1.0 if i % 2 == 0 else 0.78) * math.sin(math.tau * i / 18))
    for i in range(18)
]
ANVIL = [
    (-0.17, 0.075), (-0.07, 0.035), (-0.03, 0.03), (-0.03, -0.03), (-0.08, -0.09),
    (0.11, -0.09), (0.06, -0.03), (0.06, 0.03), (0.13, 0.04), (0.13, 0.10), (-0.07, 0.10),
]
CREST = [
    (-0.13, 1.63), (0.12, 1.63), (0.2, 1.56), (0.26, 1.46), (0.29, 1.39),
    (0.285, 1.52), (0.25, 1.63), (0.19, 1.73), (0.12, 1.79), (0.06, 1.775),
    (0.01, 1.84), (-0.05, 1.8), (-0.1, 1.83), (-0.15, 1.73),
]
TABARD = [(-0.09, 0.78), (-0.115, 0.3), (0.0, 0.23), (0.115, 0.3), (0.09, 0.78)]
CAPE = [(1.36, 0.22, 0.19), (1.18, 0.3, 0.3), (0.8, 0.32, 0.325), (0.42, 0.34, 0.35)]
LEGS = {
    "L": ((0.13, 0.0, 0.62), (0.17, -0.035, 0.34), (0.18, -0.01, 0.12)),
    "R": ((-0.13, 0.0, 0.62), (-0.17, -0.035, 0.34), (-0.18, -0.01, 0.12)),
}
ARMS = {
    "L": ((0.28, 0.0, 1.2), (0.36, -0.12, 0.98), (0.2, -0.25, 0.95), (0.15, -0.275, 0.95)),
    "R": ((-0.28, 0.0, 1.2), (-0.39, -0.06, 0.98), (-0.33, -0.19, 1.1), (-0.3, -0.26, 1.15)),
}
SHIELD_X = 0.07
RIM = {"width": 0.58, "height": 1.2, "thick": 0.05, "curve": 1.4, "dip": 0.09, "arch": 0.03, "front": -0.375, "base": 0.16}
FACE = {"width": 0.52, "height": 1.14, "thick": 0.035, "curve": 1.4, "dip": 0.075, "arch": 0.03, "front": -0.39, "base": 0.19}
MACE = ((-0.3, -0.3, 0.95), (-0.3, -0.2, 1.45))


def linear(hex_colour):
    digits = hex_colour.lstrip("#")
    channels = []
    for start in (0, 2, 4):
        c = int(digits[start:start + 2], 16) / 255
        channels.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*channels, 1.0)


def material(name, hex_colour, roughness, emission):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    bsdf = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    colour = linear(hex_colour)
    bsdf.inputs["Base Color"].default_value = colour
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Emission Color"].default_value = colour
    bsdf.inputs["Emission Strength"].default_value = emission
    mat.diffuse_color = colour
    mat.roughness = roughness
    mat.metallic = 0.0
    return mat


bm = bmesh.new()
deform = bm.verts.layers.deform.verify()
crisp = set()


def finish(verts, faces, mat, group):
    index = MATERIALS.index(mat)
    weight_index = GROUPS.index(group)
    for face in faces:
        face.material_index = index
    for vert in verts:
        vert[deform][weight_index] = 1.0


def block(matrix, mat, group, bevel=True):
    verts = bmesh.ops.create_cube(bm, size=1.0, matrix=matrix)["verts"]
    finish(verts, {f for v in verts for f in v.link_faces}, mat, group)
    if not bevel:
        crisp.update(verts)


def box(center, size, mat, group, tilt=0.0, axis="Y"):
    block(Matrix.Translation(center) @ Matrix.Rotation(tilt, 4, axis) @ Matrix.Diagonal((*size, 1.0)), mat, group)


def circle(sides, turn=0.0):
    return [(math.cos(turn + math.tau * i / sides), math.sin(turn + math.tau * i / sides)) for i in range(sides)]


def lathe(profile, shape, mat, group, matrix=None, sx=1.0, sy=1.0, turn=0.0):
    matrix = matrix if matrix is not None else Matrix.Identity(4)
    outline = shape if isinstance(shape, list) else circle(shape, turn)
    rings = []
    for z, r in profile:
        if r <= 0.0:
            rings.append([bm.verts.new(matrix @ Vector((0.0, 0.0, z)))])
        else:
            rings.append([bm.verts.new(matrix @ Vector((r * sx * cx, r * sy * cy, z))) for cx, cy in outline])
    sides = len(outline)
    faces = []
    for low, high in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            if len(low) == 1:
                faces.append(bm.faces.new((low[0], high[j], high[i])))
            elif len(high) == 1:
                faces.append(bm.faces.new((low[i], low[j], high[0])))
            else:
                faces.append(bm.faces.new((low[i], low[j], high[j], high[i])))
    if len(rings[0]) > 1:
        faces.append(bm.faces.new(list(reversed(rings[0]))))
    if len(rings[-1]) > 1:
        faces.append(bm.faces.new(rings[-1]))
    finish([v for ring in rings for v in ring], faces, mat, group)


def along(start, end):
    start, end = Vector(start), Vector(end)
    direction = end - start
    rotation = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized()).to_matrix().to_4x4()
    return Matrix.Translation(start) @ rotation, direction.length


def limb(start, end, r0, r1, mat, group, sides=8):
    matrix, length = along(start, end)
    lathe([(0.0, r0), (length, r1)], sides, mat, group, matrix)


def extrude(points, low, high, mat, group):
    bottom = [bm.verts.new(low(u, v)) for u, v in points]
    top = [bm.verts.new(high(u, v)) for u, v in points]
    faces = [bm.faces.new(list(reversed(bottom))), bm.faces.new(top)]
    for i in range(len(points)):
        j = (i + 1) % len(points)
        faces.append(bm.faces.new((bottom[i], bottom[j], top[j], top[i])))
    finish(bottom + top, faces, mat, group)


def slab(spec, mat, group, columns=8):
    rows = []
    for i in range(columns + 1):
        x = -spec["width"] / 2 + spec["width"] * i / columns
        edge = 1 - (2 * x / spec["width"]) ** 2
        y = spec["front"] + spec["curve"] * x * x
        low = spec["base"] - spec["dip"] * edge
        high = spec["base"] + spec["height"] + spec["arch"] * edge
        rows.append([
            bm.verts.new((SHIELD_X + x, y + dy, z))
            for dy, z in ((0.0, low), (0.0, high), (spec["thick"], low), (spec["thick"], high))
        ])
    faces = []
    for a, b in zip(rows, rows[1:]):
        faces.append(bm.faces.new((a[0], b[0], b[1], a[1])))
        faces.append(bm.faces.new((b[2], a[2], a[3], b[3])))
        faces.append(bm.faces.new((a[1], b[1], b[3], a[3])))
        faces.append(bm.faces.new((b[0], a[0], a[2], b[2])))
    faces.append(bm.faces.new((rows[0][0], rows[0][1], rows[0][3], rows[0][2])))
    faces.append(bm.faces.new((rows[-1][0], rows[-1][2], rows[-1][3], rows[-1][1])))
    finish([v for row in rows for v in row], faces, mat, group)


def shield_edge(spec, x, top):
    edge = 1 - (2 * x / spec["width"]) ** 2
    return spec["base"] + (spec["height"] + spec["arch"] * edge if top else -spec["dip"] * edge)


def sheet(rows, columns, spread, thick, hem, fold, mat, group):
    grid = []
    for row, (z, rx, ry) in enumerate(rows):
        line = []
        depth = fold * row / (len(rows) - 1)
        for i in range(columns + 1):
            angle = -spread + 2 * spread * i / columns
            out = depth if i % 2 == 1 else 0.0
            drop = -hem if row == len(rows) - 1 and i % 2 == 1 else 0.0
            line.append(tuple(
                bm.verts.new(((rx + out + d) * math.sin(angle), (ry + out + d) * math.cos(angle), z + drop))
                for d in (0.0, thick)
            ))
        grid.append(line)
    faces = []
    for upper, lower in zip(grid, grid[1:]):
        for i in range(columns):
            faces.append(bm.faces.new((upper[i][0], upper[i + 1][0], lower[i + 1][0], lower[i][0])))
            faces.append(bm.faces.new((upper[i + 1][1], upper[i][1], lower[i][1], lower[i + 1][1])))
    for line, flip in ((grid[0], False), (grid[-1], True)):
        for i in range(columns):
            quad = (line[i][0], line[i][1], line[i + 1][1], line[i + 1][0])
            faces.append(bm.faces.new(tuple(reversed(quad)) if flip else quad))
    for upper, lower in zip(grid, grid[1:]):
        faces.append(bm.faces.new((upper[0][1], upper[0][0], lower[0][0], lower[0][1])))
        faces.append(bm.faces.new((upper[-1][0], upper[-1][1], lower[-1][1], lower[-1][0])))
    finish([v for line in grid for pair in line for v in pair], faces, mat, group)


def build_legs():
    for suffix, (hip, knee, ankle) in LEGS.items():
        side = 1 if suffix == "L" else -1
        limb(hip, knee, 0.105, 0.092, "plate", f"thigh.{suffix}")
        lathe([(-0.07, 0.0), (-0.045, 0.07), (0.045, 0.07), (0.07, 0.0)], 8, "plate_dark", f"shin.{suffix}", Matrix.Translation(knee))
        lathe([(0.0, 0.07), (0.035, 0.058), (0.065, 0.0)], 8, "gold", f"shin.{suffix}", along(Vector(knee) + Vector((0.0, -0.035, 0.0)), Vector(knee) + Vector((0.0, -0.2, 0.0)))[0])
        box((knee[0] + side * 0.07, knee[1], knee[2]), (0.03, 0.1, 0.12), "gold", f"shin.{suffix}")
        limb(knee, ankle, 0.088, 0.105, "plate", f"shin.{suffix}")
        box((ankle[0], -0.05, 0.065), (0.18, 0.3, 0.13), "plate_dark", f"foot.{suffix}")
        box((ankle[0], -0.19, 0.055), (0.16, 0.07, 0.1), "plate", f"foot.{suffix}")


def build_waist():
    lames = [(0.66, 0.79, 0.25, 0.25), (0.58, 0.69, 0.278, 0.265), (0.5, 0.61, 0.305, 0.288)]
    for z0, z1, r0, r1 in lames:
        lathe([(z0, r0), (z1, r1)], 8, "plate", "hips", sx=1.08, sy=0.88)
    lathe([(0.495, 0.312), (0.525, 0.31)], 8, "gold", "hips", sx=1.08, sy=0.88)
    lathe([(0.76, 0.246), (0.845, 0.246)], 8, "leather", "hips", sx=1.1, sy=0.88)
    box((0.0, -0.226, 0.8), (0.11, 0.035, 0.095), "gold", "hips")
    extrude(
        TABARD,
        lambda u, v: Vector((u, -(0.222 + (0.78 - v) * 0.16), v)),
        lambda u, v: Vector((u, -(0.242 + (0.78 - v) * 0.16), v)),
        "team",
        "hips",
    )


def build_torso():
    lathe([(0.76, 0.235), (0.9, 0.27), (1.05, 0.32), (1.18, 0.335), (1.28, 0.3), (1.35, 0.2)], 8, "plate", "spine", sx=1.1, sy=0.82)
    lathe([(1.22, 0.29), (1.33, 0.3), (1.44, 0.16)], FUR, "fur", "spine", sx=1.2, sy=1.1)
    sheet(CAPE, 12, math.radians(58), 0.02, 0.1, 0.035, "team", "cape")
    for side in (1, -1):
        shoulder = Matrix.Translation((0.28 * side, 0.0, 1.25)) @ Matrix.Rotation(math.radians(35) * side, 4, "Y")
        for step, radius in ((2, 0.15), (1, 0.172)):
            lame = shoulder @ Matrix.Translation((0.045 * step * side, 0.0, -0.075 * step))
            lathe([(0.0, radius), (0.04, radius * 0.95), (0.075, radius * 0.7)], 8, "plate", "spine", lame, sy=1.1, turn=math.pi / 8)
            lathe([(-0.005, radius * 1.05), (0.02, radius * 1.04)], 8, "gold", "spine", lame, sy=1.1, turn=math.pi / 8)
        lathe([(0.0, 0.19), (0.06, 0.183), (0.12, 0.145), (0.165, 0.075), (0.18, 0.0)], 8, "plate", "spine", shoulder, sy=1.1, turn=math.pi / 8)
        lathe([(-0.01, 0.203), (0.03, 0.2)], 8, "gold", "spine", shoulder, sy=1.1, turn=math.pi / 8)


def build_head():
    lathe([(1.31, 0.96), (1.36, 1.0), (1.56, 1.0), (1.615, 0.92), (1.64, 0.8)], CHAMFER, "plate", "head", sx=0.16, sy=0.17)
    lathe([(1.305, 1.07), (1.345, 1.065)], CHAMFER, "gold", "head", sx=0.16, sy=0.17)
    box((0.0, -0.176, 1.405), (0.032, 0.02, 0.13), "gold", "head")
    for side in (1, -1):
        box((0.043 * side, -0.174, 1.476), (0.062, 0.016, 0.02), "glow", "head", -side * math.radians(12))
        box((0.047 * side, -0.18, 1.508), (0.09, 0.03, 0.028), "plate_dark", "head", -side * math.radians(15))

    def crest_half(u, v):
        return max(0.024, 0.05 - max(v - 1.6, 0.0) * 0.11)

    extrude(
        CREST,
        lambda u, v: Vector((-crest_half(u, v), u, v)),
        lambda u, v: Vector((crest_half(u, v), u, v)),
        "team",
        "head",
    )


def build_arms():
    for suffix, (shoulder, elbow, wrist, hand) in ARMS.items():
        limb(shoulder, elbow, 0.08, 0.075, "plate", f"upper_arm.{suffix}")
        lathe([(-0.065, 0.0), (-0.042, 0.066), (0.042, 0.066), (0.065, 0.0)], 8, "plate_dark", f"forearm.{suffix}", Matrix.Translation(elbow))
        limb(elbow, wrist, 0.075, 0.07, "plate", f"forearm.{suffix}")
        cuff, length = along(elbow, wrist)
        lathe([(length - 0.07, 0.074), (length, 0.098)], 8, "plate_dark", f"forearm.{suffix}", cuff)
        box(hand, (0.14, 0.13, 0.14), "plate_dark", f"hand.{suffix}")


def build_shield():
    slab(RIM, "gold", "hand.L")
    slab(FACE, "plate_dark", "hand.L")
    emblem = [((u + 0.02) * 1.4, (v - 0.005) * 1.4) for u, v in ANVIL]
    extrude(
        emblem,
        lambda u, v: Vector((SHIELD_X + u, FACE["front"] + FACE["curve"] * u * u + 0.004, 0.86 + v)),
        lambda u, v: Vector((SHIELD_X + u, FACE["front"] + FACE["curve"] * u * u - 0.02, 0.86 + v)),
        "gold",
        "hand.L",
    )
    studs = [(x, 0.3 + 0.19 * i) for x in (-0.275, 0.275) for i in range(6)]
    studs += [(x, (shield_edge(RIM, x, True) + shield_edge(FACE, x, True)) / 2) for x in (-0.17, 0.0, 0.17)]
    studs += [(x, (shield_edge(RIM, x, False) + shield_edge(FACE, x, False)) / 2) for x in (-0.14, 0.14)]
    for x, z in studs:
        y = RIM["front"] + RIM["curve"] * x * x - 0.004
        block(Matrix.Translation((SHIELD_X + x, y, z)) @ Matrix.Rotation(math.radians(45), 4, "Y") @ Matrix.Diagonal((0.026, 0.026, 0.026, 1.0)), "steel", "hand.L", bevel=False)


def build_mace():
    mace, length = along(*MACE)
    lathe([(-0.06, 0.0), (-0.05, 0.042), (0.0, 0.032)], 8, "gold", "hand.R", mace)
    lathe([(0.0, 0.024), (length, 0.024)], 6, "leather", "hand.R", mace)
    lathe([(length - 0.015, 0.042), (length + 0.02, 0.042)], 8, "gold", "hand.R", mace)
    lathe([(length + 0.02, 0.055), (length + 0.06, 0.075), (length + 0.2, 0.075), (length + 0.22, 0.062)], 8, "steel", "hand.R", mace)
    lathe([(length + 0.215, 0.066), (length + 0.25, 0.05), (length + 0.35, 0.0)], 8, "gold", "hand.R", mace)
    for k in range(7):
        angle = math.tau * k / 7
        block(
            mace
            @ Matrix.Translation((0.085 * math.cos(angle), 0.085 * math.sin(angle), length + 0.12))
            @ Matrix.Rotation(angle, 4, "Z")
            @ Matrix.Diagonal((0.065, 0.024, 0.18, 1.0)),
            "steel",
            "hand.R",
        )


build_legs()
build_waist()
build_torso()
build_head()
build_arms()
build_shield()
build_mace()

sharp = [
    e for e in bm.edges
    if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(30) and not crisp.intersection(e.verts)
]
bmesh.ops.bevel(bm, geom=sharp, offset=0.006, offset_type="OFFSET", segments=1, profile=0.5, affect="EDGES", clamp_overlap=True, material=-1)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
for face in bm.faces:
    face.smooth = False

existing = bpy.data.objects.get(HERO)
if existing is not None:
    bpy.data.objects.remove(existing, do_unlink=True)
stale = bpy.data.meshes.get(HERO)
if stale is not None and stale.users == 0:
    bpy.data.meshes.remove(stale)

mesh = bpy.data.meshes.new(HERO)
bm.to_mesh(mesh)
bm.free()
for name in MATERIALS:
    mesh.materials.append(material(name, *PALETTE[name]))
for name in RETIRED:
    retired = bpy.data.materials.get(name)
    if retired is not None and retired.users == 0:
        bpy.data.materials.remove(retired)

hero = bpy.data.objects.new(HERO, mesh)
for group in GROUPS:
    hero.vertex_groups.new(name=group)

scene = bpy.data.scenes.get(SCENE) or bpy.context.scene
collection = bpy.data.collections.get(COLLECTION) or bpy.data.collections.new(COLLECTION)
if scene.collection.children.get(collection.name) is None:
    scene.collection.children.link(collection)
collection.objects.link(hero)
hero.location = LOCATION

zs = [v.co.z for v in mesh.vertices]
result = {
    "triangles": sum(len(p.vertices) - 2 for p in mesh.polygons),
    "height": round(max(zs), 3),
    "lowest": round(min(zs), 3),
    "max_radius": round(max(math.hypot(v.co.x, v.co.y) for v in mesh.vertices), 3),
    "used": sorted({MATERIALS[p.material_index] for p in mesh.polygons}),
    "team": [round(c, 3) for c in bpy.data.materials["team"].diffuse_color],
    "materials_in_file": sorted(m.name for m in bpy.data.materials),
}
