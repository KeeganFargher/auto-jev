import json
import math
import os
import random
import sys
import tempfile
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))

import hero_kit as kit
from hero_kit import TAU, WEIGHTED, along, bevel, grid_sheet, lathe, ring, rounded_box, solid, sphere, subsurf, sweep

OUT = Path(os.environ.get("ART_OUT") or Path(tempfile.gettempdir()) / "jev-art")
FLAGS = set(sys.argv[sys.argv.index("--") + 1 :]) if "--" in sys.argv else set()
SAVED = REPO / "art" / "explorations" / "cinder-hq.blend"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "cinder-hq"
scene.render.fps = 30
scene.render.fps_base = 1.0
collection = bpy.data.collections.new("cinder_hq")
scene.collection.children.link(collection)

MATS = kit.library(["team", "leather"])
MATS.update(
    {
        "skin": kit.material("cn_skin", "#e3a57c", roughness=0.5, bump=0.05, bump_scale=160.0, rough_var=0.08, subsurface=0.15),
        "hair": kit.material("cn_hair", "#c4521e", roughness=0.6, bump=0.4, bump_scale=220.0),
        "brow": kit.material("cn_brow", "#7a2c14", roughness=0.7),
        "coat": kit.material("cn_coat", "#5a4b4a", roughness=0.85, bump=0.25, bump_scale=140.0, rough_var=0.08),
        "coat_dark": kit.material("cn_coat_dark", "#352b2b", roughness=0.85, bump=0.2, bump_scale=140.0),
        "mantle": kit.material("cn_mantle", "#3d3233", roughness=0.9, bump=0.3, bump_scale=120.0, rough_var=0.06),
        "trousers": kit.material("cn_trousers", "#4a3a36", roughness=0.9, bump=0.2, bump_scale=160.0),
        "leather_dark": kit.material("cn_leather_dark", "#3a2418", roughness=0.7, bump=0.25, bump_scale=120.0, rough_var=0.1),
        "brass": kit.material("cn_brass", "#c9933e", metallic=1.0, roughness=0.35, bump=0.06, bump_scale=50.0, rough_var=0.1),
        "book": kit.material("cn_book", "#6e2419", roughness=0.65, bump=0.2, bump_scale=90.0),
        "paper": kit.material("cn_paper", "#e8dab4", roughness=0.9, bump=0.1, bump_scale=200.0),
        "soot": kit.material("cn_soot", "#1a1413", roughness=0.95),
        "pupil": kit.material("cn_pupil", "#2a0f0a", roughness=0.4),
        "sclera": kit.material("cn_sclera", "#f3e7d8", roughness=0.35),
        "iris": kit.material("cn_iris", "#ff8a2a", roughness=0.4, emission=3.0),
        "lash": kit.material("cn_lash", "#3a1a12", roughness=0.7),
        "catchlight": kit.material("cn_catchlight", "#fffaf0", roughness=0.3),
        "mouth": kit.material("cn_mouth", "#5a1812", roughness=0.6),
        "teeth": kit.material("cn_teeth", "#f6efe2", roughness=0.4),
        "freckle": kit.material("cn_freckle", "#cf8a60", roughness=0.6),
        "flame": kit.material("cn_flame", "#ffc15a", roughness=0.5, emission=3.5),
        "embers": kit.material("cn_embers", "#ff7a2a", roughness=0.5, emission=3.0),
    }
)
B = kit.Builder(collection, MATS)

SIDES = {"L": 1, "R": -1}
HEAD = Vector((0.0, -0.03, 1.6))
HIP = (0.1, 0.0, 0.84)
KNEE = (0.11, -0.03, 0.47)
ANKLE = (0.12, 0.0, 0.1)
ARMS = {
    "L": {"shoulder": (0.215, 0.0, 1.34), "elbow": (0.29, 0.07, 1.1), "wrist": (0.24, -0.17, 1.1), "hand": (0.225, -0.265, 1.1)},
    "R": {"shoulder": (-0.215, 0.0, 1.34), "elbow": (-0.285, 0.03, 1.08), "wrist": (-0.3, -0.02, 0.86), "hand": (-0.3, -0.035, 0.77)},
}
PALMS = {"L": (0.0, 0.0, 1.0), "R": (1.0, 0.0, 0.0)}
FLAME_BASE = Vector((0.222, -0.262, 1.15))
FLAME_HEIGHT = 0.3
HAND_SCALE = 1.4
HEAD_GROW = Matrix.Translation((0.0, -0.02, 1.45)) @ Matrix.Diagonal((1.2, 1.2, 1.2, 1.0)) @ Matrix.Translation((0.0, 0.02, -1.45))
SKIRT_TOP = 0.98
SKIRT_HEM = 0.42
TORSO = [
    (0.84, 0.165, 0.125, 0.0),
    (0.92, 0.158, 0.118, 0.0),
    (1.0, 0.15, 0.112, 0.0),
    (1.08, 0.162, 0.118, -0.005),
    (1.17, 0.19, 0.132, -0.01),
    (1.26, 0.205, 0.136, -0.01),
    (1.33, 0.2, 0.13, -0.005),
    (1.39, 0.14, 0.104, 0.0),
    (1.43, 0.07, 0.065, 0.0),
]


def mirror(point, side):
    return Vector((point[0] * side, point[1], point[2]))


def diff(a, b):
    return math.atan2(math.sin(a - b), math.cos(a - b))


def bump(width, centre, angle):
    return math.exp(-((diff(angle, centre) / width) ** 2))


def torso_row(z):
    for (z0, *v0), (z1, *v1) in zip(TORSO, TORSO[1:]):
        if z <= z1:
            t = max(0.0, (z - z0) / (z1 - z0))
            return [a + (b - a) * t for a, b in zip(v0, v1)]

    return list(TORSO[-1][1:])


def torso_point(z, a, lift=0.0):
    rx, ry, cy = torso_row(z)
    normal = Vector((math.cos(a) / rx, math.sin(a) / ry, 0.0)).normalized()
    swell = 0.0

    if 1.12 < z < 1.28:
        front = bump(0.38, math.radians(-65), a) + bump(0.38, math.radians(-115), a)
        swell = 0.02 * math.sin(math.pi * (z - 1.12) / 0.16) * front

    return Vector((rx * math.cos(a), ry * math.sin(a) + cy, z)) + normal * (swell + lift), normal


def frame_matrix(origin, across, forward, up):
    rotation = Matrix((across, forward, up)).transposed().to_4x4()

    return Matrix.Translation(origin) @ rotation


EYE_X = 0.05
EYE_Z = 0.012
EYE_TILT = 10


def shape_head(co):
    local = co - HEAD
    below = max(0.0, -local.z) / 0.15
    local.x *= 1.0 - 0.34 * below**1.6

    if local.y < 0.0:
        local.y *= 1.0 + 0.08 * below

    local.z -= 0.02 * below**2

    if local.y < -0.09:
        local.y = -0.09 + (local.y + 0.09) * 0.75

    front = max(0.0, -local.y) / 0.14

    for side in (1, -1):
        cheek = math.exp(-(((local.x - 0.066 * side) / 0.03) ** 2) - ((local.z + 0.045) / 0.03) ** 2)
        socket = math.exp(-(((local.x - EYE_X * side) / 0.022) ** 2) - ((local.z - EYE_Z) / 0.016) ** 2)
        local.y += (0.007 * socket - 0.012 * cheek) * front
        local.x += 0.006 * cheek * side * front

    ridge = math.exp(-(((local.z - 0.045) / 0.018) ** 2) - (local.x / 0.08) ** 2)
    local.y -= 0.005 * ridge * front

    return HEAD + local


def surface_tree(obj):
    return BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())


def stick(tree, x, z, lift=0.002):
    hit, normal, _, _ = tree.ray_cast(Vector((x, -1.0, z)), Vector((0.0, 1.0, 0.0)))

    return hit + normal * lift, normal


def flattened_blob(bm, centre, normal, radius, depth=0.25):
    verts = sphere(bm, Vector((0.0, 0.0, 0.0)), 1.0, 12, 8)
    turn = Vector((0.0, 0.0, 1.0)).rotation_difference(normal).to_matrix()

    for vert in verts:
        vert.co = centre + turn @ Vector((vert.co.x * radius, vert.co.y * radius, vert.co.z * radius * depth))


def hairline(local):
    a = math.atan2(local.y, local.x)

    return 0.02 + 0.075 * max(0.0, -math.sin(a)) ** 1.5 - 0.1 * max(0.0, math.sin(a))


def eye_tilt(side):
    return Matrix.Rotation(math.radians(-EYE_TILT * side), 3, "Y")


def eye_point(face, side, dx, dz, lift):
    offset = eye_tilt(side) @ Vector((dx * side, 0.0, dz))

    return stick(face, EYE_X * side + offset.x, HEAD.z + EYE_Z + offset.z, lift)


def build_head():
    def skull(bm):
        verts = sphere(bm, HEAD, 1.0, 36, 24, (0.125, 0.14, 0.15))

        for vert in verts:
            vert.co = shape_head(vert.co)

        bmesh.ops.delete(bm, geom=[vert for vert in verts if (vert.co - HEAD).z > hairline(vert.co - HEAD) + 0.03], context="VERTS")

        lathe(bm, [(0.0, 0.052), (0.1, 0.05), (0.16, 0.055)], 20, along((0.0, -0.005, 1.38), (0.0, -0.02, 1.56))[0])

        for side in (1, -1):
            centre = HEAD + Vector((0.118 * side, -0.005, -0.012))
            turn = Matrix.Rotation(math.radians(-12 * side), 3, "Z")

            for vert in sphere(bm, Vector((0.0, 0.0, 0.0)), 1.0, 14, 10, (0.015, 0.03, 0.042)):
                vert.co = centre + turn @ vert.co

    head = B.build("cn_head", skull, "skin", modifiers=[subsurf(1)], bone="head")
    face = surface_tree(head)

    def nose(bm):
        top, _ = stick(face, 0.0, HEAD.z + 0.015, -0.006)
        tip, _ = stick(face, 0.0, HEAD.z - 0.035, 0.012)
        sweep(bm, [top, top.lerp(tip, 0.55) + Vector((0.0, -0.004, 0.0)), tip], [0.012, 0.014, 0.017], 12)
        sphere(bm, tip + Vector((0.0, 0.002, 0.0)), 1.0, 14, 10, (0.02, 0.017, 0.016))

    B.build("cn_nose", nose, "skin", modifiers=[subsurf(1)], bone="head")

    def sclera(bm):
        for side in (1, -1):
            centre, _ = eye_point(face, side, 0.0, 0.0, -0.003)

            for vert in sphere(bm, Vector((0.0, 0.0, 0.0)), 1.0, 18, 12, (0.028, 0.011, 0.019)):
                vert.co = centre + eye_tilt(side) @ vert.co

    B.build("cn_sclera", sclera, "sclera", modifiers=[subsurf(1)], bone="head")

    def iris(bm):
        for side in (1, -1):
            point, normal = eye_point(face, side, -0.002, -0.001, 0.0075)
            flattened_blob(bm, point, normal, 0.0125, 0.22)

    B.build("cn_iris", iris, "iris", bone="head", shadow=False)

    def pupils(bm):
        for side in (1, -1):
            point, normal = eye_point(face, side, -0.002, -0.001, 0.0102)
            flattened_blob(bm, point, normal, 0.006, 0.3)

    B.build("cn_pupils", pupils, "pupil", bone="head")

    def catchlights(bm):
        for side in (1, -1):
            point, normal = eye_point(face, side, -0.006, 0.005, 0.011)
            flattened_blob(bm, point, normal, 0.0028, 0.3)

    B.build("cn_catchlights", catchlights, "catchlight", bone="head")

    def lashes(bm):
        for side in (1, -1):
            path = []

            for k in range(8):
                t = k / 7
                dx = -0.03 + 0.062 * t
                dz = 0.0195 * math.sqrt(max(0.0, 1.0 - (dx / 0.03) ** 2)) + (0.04 * (t - 0.85) if t > 0.85 else 0.0)
                point, _ = eye_point(face, side, dx, dz, 0.006)
                path.append(point)

            sweep(bm, path, [0.002, 0.0035, 0.0045, 0.005, 0.0055, 0.006, 0.005, 0.0], 8, up=(0.0, -1.0, 0.0), flat=0.4)

    B.build("cn_lashes", lashes, "lash", bone="head")

    def brows(bm):
        for side in (1, -1):
            path = []

            for k in range(6):
                t = k / 5
                point, _ = stick(face, (0.024 + 0.068 * t) * side, HEAD.z + 0.048 + 0.03 * t - 0.03 * (t - 0.55) ** 2, 0.004)
                path.append(point)

            sweep(bm, path, [0.01, 0.014, 0.016, 0.015, 0.012, 0.0], 8, up=(0.0, -1.0, 0.0), flat=0.45)

    B.build("cn_brows", brows, "brow", bone="head")

    def grin(z_shift, lift, width):
        path = []

        for k in range(11):
            t = k / 10
            z = HEAD.z - 0.082 + z_shift - 0.018 * math.sin(math.pi * t) + 0.018 * (2 * t - 1) ** 2
            point, _ = stick(face, -width + 2 * width * t, z, lift)
            path.append(point)

        return path

    B.build(
        "cn_mouth",
        lambda bm: sweep(bm, grin(0.0, 0.003, 0.058), [0.004, 0.009, 0.013, 0.016, 0.018, 0.019, 0.018, 0.016, 0.013, 0.009, 0.004], 8, up=(0.0, -1.0, 0.0), flat=0.35),
        "mouth",
        bone="head",
    )
    B.build(
        "cn_teeth",
        lambda bm: sweep(bm, grin(0.008, 0.005, 0.046)[1:-1], [0.003, 0.006, 0.0075, 0.008, 0.008, 0.008, 0.0075, 0.006, 0.003], 8, up=(0.0, -1.0, 0.0), flat=0.3),
        "teeth",
        bone="head",
    )

    rng = random.Random(5)

    def freckles(bm):
        for _ in range(14):
            side = rng.choice((1, -1))
            point, normal = stick(face, side * rng.uniform(0.015, 0.075), HEAD.z - rng.uniform(0.008, 0.035), 0.0015)
            flattened_blob(bm, point, normal, rng.uniform(0.0026, 0.0034), 0.1)

    B.build("cn_freckles", freckles, "freckle", bone="head")


CAP_CENTRE = HEAD + Vector((0.0, 0.02, 0.028))
CAP_RADII = (0.148, 0.162, 0.168)


def scalp(azimuth, elevation, lift=0.0):
    a, e = math.radians(azimuth), math.radians(elevation)
    rx, ry, rz = CAP_RADII
    local = Vector((rx * math.cos(e) * math.cos(a), ry * math.cos(e) * math.sin(a), rz * math.sin(e)))
    normal = Vector((math.cos(e) * math.cos(a) / rx, math.cos(e) * math.sin(a) / ry, math.sin(e) / rz)).normalized()

    return CAP_CENTRE + local + normal * lift, normal


def lock(bm, start, normal, direction, length, width, curl_axis, curl, wave=0.3, steps=8):
    points = [start - normal * 0.015, start]
    heading = Vector(direction).normalized()
    axis = Vector(curl_axis).normalized()
    position = start.copy()

    for k in range(steps):
        bend = curl / steps * (1.0 if (k + 0.5) / steps > wave else -0.6)
        heading = (Matrix.Rotation(bend, 3, axis) @ heading).normalized()
        position = position + heading * length / steps
        points.append(position.copy())

    radii = [width * 0.85, width] + [width * (1.0 - k / steps) ** 0.7 for k in range(1, steps)] + [0.0]
    sweep(bm, points, radii, 10, up=normal, flat=0.42)


def build_hair():
    rng = random.Random(21)

    def cap(bm):
        verts = sphere(bm, CAP_CENTRE, 1.0, 32, 20, CAP_RADII)
        doomed = []

        for vert in verts:
            local = vert.co - HEAD

            if local.z < hairline(local):
                doomed.append(vert)

        bmesh.ops.delete(bm, geom=doomed, context="VERTS")

    B.build("cn_hair_cap", cap, "hair", recalc=False, modifiers=[solid(0.012), subsurf(1)], bone="head")

    def locks(bm):
        up = Vector((0.0, 0.0, 1.0))
        back = Vector((0.0, 1.0, 0.0))

        for azimuth in (-70, -40, -10, 20, 50, 85, 120, 155, 190, 225):
            start, normal = scalp(azimuth + rng.uniform(-10, 10), rng.uniform(56, 82))
            heading = up * 0.8 + back * 0.7 + normal * 0.35 + Vector((-0.25, 0.0, 0.0))
            lock(bm, start, normal, heading, rng.uniform(0.2, 0.3), rng.uniform(0.07, 0.088), heading.cross(back), math.radians(rng.uniform(55, 100)))

        for side in (1, -1):
            for azimuth, elevation in ((-35, 30), (-5, 12), (25, 32), (50, 0)):
                start, normal = scalp((azimuth if side > 0 else 180 - azimuth) + rng.uniform(-6, 6), elevation + rng.uniform(-5, 5))
                heading = normal + up * 0.45 + back * 0.2
                lock(bm, start, normal, heading, rng.uniform(0.17, 0.24), rng.uniform(0.068, 0.082), heading.cross(up), math.radians(rng.uniform(110, 160)))

        for azimuth in (55, 75, 95, 115, 135, 90):
            start, normal = scalp(azimuth + rng.uniform(-8, 8), rng.uniform(-15, 30))
            heading = back * 0.8 + normal * 0.5 - up * 0.2
            lock(bm, start, normal, heading, rng.uniform(0.16, 0.22), rng.uniform(0.07, 0.085), heading.cross(up), math.radians(rng.uniform(100, 150)))

        for azimuth, elevation in ((-72, 62), (-98, 64), (-124, 58)):
            start, normal = scalp(azimuth, elevation)
            heading = Vector((-0.6, -0.55, 0.35))
            lock(bm, start, normal, heading, rng.uniform(0.14, 0.18), 0.066, heading.cross(up), math.radians(rng.uniform(90, 130)))

        front = Vector((0.0, -1.0, 0.0))

        for azimuth, elevation, length in ((-84, 50, 0.12), (-104, 48, 0.13)):
            start, normal = scalp(azimuth, elevation)
            heading = front * 0.6 - up * 0.35 + Vector((-0.5, 0.0, 0.0))
            lock(bm, start, normal, heading, length, 0.056, heading.cross(up), math.radians(rng.uniform(80, 110)))

        for side in (1, -1):
            for azimuth, elevation in ((12, 4), (32, -6)):
                start, normal = scalp(azimuth if side > 0 else 180 - azimuth, elevation)
                heading = normal * 0.5 - up * 0.6 + front * 0.1
                lock(bm, start, normal, heading, rng.uniform(0.18, 0.22), 0.064, heading.cross(normal), math.radians(rng.uniform(90, 120)))

    B.build("cn_hair_locks", locks, "hair", modifiers=[subsurf(1)], bone="head")


def grow_head():
    for obj, bone in B.parts:
        if bone == "head":
            obj.data.transform(HEAD_GROW)


def build_torso():
    def fill(bm):
        zs = [0.84 + (1.43 - 0.84) * i / 23 for i in range(24)]
        rings = [[bm.verts.new(torso_point(z, TAU * k / 48)[0]) for k in range(48)] for z in zs]
        top = bm.verts.new((0.0, 0.0, 1.45))

        for low, high in zip(rings, rings[1:]):
            for k in range(48):
                j = (k + 1) % 48
                bm.faces.new((low[k], low[j], high[j], high[k]))

        for k in range(48):
            bm.faces.new((rings[-1][k], rings[-1][(k + 1) % 48], top))

        bm.faces.new(list(reversed(rings[0])))

    B.build("cn_torso", fill, "coat", modifiers=[subsurf(1)], bone="spine")

    def placket(bm):
        points, ups = [], []

        for i in range(13):
            z = 1.37 - (1.37 - 0.99) * i / 12
            point, normal = torso_point(z, math.radians(-96), 0.006)
            points.append(point)
            ups.append(normal)

        sweep(bm, points, 0.016, 8, up=ups, flat=0.3)

    B.build("cn_placket", placket, "coat_dark", modifiers=[subsurf(1)], bone="spine")

    def buttons(bm):
        for z in (1.24, 1.1):
            point, normal = torso_point(z, math.radians(-78), 0.012)
            place, _ = along(point, point + normal)
            lathe(bm, [(0.0, 0.027), (0.008, 0.025), (0.014, 0.013), (0.016, 0.0)], 24, place)

    B.build("cn_buttons", buttons, "brass", modifiers=[WEIGHTED], bone="spine")

    def scorch(bm):
        for z, degrees, radius in ((1.15, -40, 0.03), (1.02, -130, 0.024), (1.28, 20, 0.026), (1.08, 150, 0.03), (1.22, 110, 0.022)):
            point, normal = torso_point(z, math.radians(degrees), 0.004)
            flattened_blob(bm, point, normal, radius, 0.15)

    B.build("cn_scorch", scorch, "soot", bone="spine")


def collar_point(u, v, tops):
    a = math.radians(-25 + 230 * u)
    back = max(0.0, math.sin(a))
    top = 1.46 + 0.07 * back**0.7 + tops[round(u * (len(tops) - 1))]
    z = 1.41 + (top - 1.41) * v
    radius = 0.108 + 0.07 * v**1.3

    return Vector((radius * math.cos(a), radius * 0.92 * math.sin(a) + 0.01, z))


SHAWL = [(1.45, 0.115, 0.104), (1.425, 0.215, 0.156), (1.39, 0.3, 0.196), (1.33, 0.336, 0.214), (1.26, 0.35, 0.224)]


def shawl_point(u, v, hem):
    a = math.radians(-62 + 304 * u)
    span = v * (len(SHAWL) - 1)
    index = min(int(span), len(SHAWL) - 2)
    t = span - index
    z0, rx0, ry0 = SHAWL[index]
    z1, rx1, ry1 = SHAWL[index + 1]
    z, rx, ry = z0 + (z1 - z0) * t, rx0 + (rx1 - rx0) * t, ry0 + (ry1 - ry0) * t
    z -= 0.03 * max(0.0, -math.sin(a)) ** 2 * v**1.5
    z -= hem[round(u * (len(hem) - 1))] * max(0.0, v - 0.75) / 0.25
    fold = 0.012 * v * math.sin(9 * a)

    return Vector(((rx + fold) * math.cos(a), (ry + fold) * math.sin(a) + 0.01, z))


def build_neckwear():
    rng = random.Random(8)
    tops = [rng.uniform(-0.02, 0.012) for _ in range(27)]
    B.build("cn_collar", lambda bm: grid_sheet(bm, 26, 6, lambda u, v: collar_point(u, v, tops)), "coat", recalc=False, modifiers=[solid(0.014), subsurf(1)], bone="spine")
    hem = [rng.uniform(0.0, 0.035) + (0.05 if rng.random() < 0.15 else 0.0) for _ in range(41)]
    B.build("cn_mantle", lambda bm: grid_sheet(bm, 40, 10, lambda u, v: shawl_point(u, v, hem)), "mantle", recalc=False, modifiers=[solid(0.013), subsurf(1)], bone="spine")

    def roll(bm):
        points, radii, ups = [], [], []

        for k in range(36):
            a = TAU * k / 36
            out = Vector((math.cos(a), math.sin(a), 0.0))
            points.append(Vector((0.122 * math.cos(a), 0.112 * math.sin(a) + 0.008, 1.448 + 0.012 * math.sin(3 * a + 0.4))))
            radii.append(0.036 + 0.007 * math.sin(5 * a + 1.0))
            ups.append(out)

        sweep(bm, points, radii, 12, up=ups, closed=True, flat=0.78)

    B.build("cn_scarf", roll, "team", modifiers=[subsurf(1)], bone="spine")
    tail_hem = [rng.uniform(0.0, 0.035) for _ in range(4)]

    def tail_point(u, v):
        z = 1.42 - 0.34 * v - tail_hem[round(u * 3)] * max(0.0, v - 0.8) / 0.2
        point, normal = torso_point(z, math.radians(-110 - 6 * v), 0.036 + 0.008 * math.sin(v * 7))
        across = Vector((0.0, 0.0, 1.0)).cross(normal).normalized()

        return point + across * (u - 0.5) * (0.078 - 0.018 * v)

    B.build("cn_scarf_tail", lambda bm: grid_sheet(bm, 3, 12, tail_point), "team", recalc=False, modifiers=[solid(0.012), subsurf(1)], bone="spine")


def build_waist():
    B.build("cn_belt", lambda bm: lathe(bm, [(0.93, 0.95), (0.93, 1.0), (1.0, 1.0), (1.0, 0.95)], 48, sx=0.17, sy=0.13, loop=True), "leather", bone="hips")

    def buckle(bm):
        point = Vector((0.17 * math.cos(math.radians(-72)), 0.13 * math.sin(math.radians(-72)) - 0.004, 0.965))
        place = Matrix.Translation(point) @ Matrix.Rotation(math.radians(18), 4, "Z")
        rounded_box(bm, place, (0.07, 0.022, 0.06), 0.008, 2)

    B.build("cn_buckle", buckle, "brass", modifiers=[WEIGHTED], bone="hips")

    def pouch(bm):
        a = math.radians(-18)
        place = Matrix.Translation((0.215 * math.cos(a), 0.17 * math.sin(a), 0.88)) @ Matrix.Rotation(a + math.pi / 2, 4, "Z")
        rounded_box(bm, place, (0.09, 0.05, 0.1), 0.018, 3)

    B.build("cn_pouch", pouch, "leather", modifiers=[subsurf(1)], bone="hips")

    def pouch_flap(bm):
        a = math.radians(-18)
        place = Matrix.Translation((0.222 * math.cos(a), 0.176 * math.sin(a), 0.915)) @ Matrix.Rotation(a + math.pi / 2, 4, "Z")
        rounded_box(bm, place, (0.095, 0.052, 0.045), 0.012, 2)

    B.build("cn_pouch_flap", pouch_flap, "leather_dark", modifiers=[subsurf(1)], bone="hips")

    book_at = Matrix.Translation((-0.212, 0.03, 0.855)) @ Matrix.Rotation(math.radians(-8), 4, "Y")

    def cover(bm):
        rounded_box(bm, book_at, (0.052, 0.14, 0.18), 0.012, 2)

    B.build("cn_book", cover, "book", modifiers=[bevel(0.003, 2, 40.0), WEIGHTED], bone="hips")

    def pages(bm):
        rounded_box(bm, book_at @ Matrix.Translation((-0.004, 0.006, 0.0)), (0.04, 0.132, 0.168), 0.004, 1)

    B.build("cn_book_pages", pages, "paper", bone="hips")

    def book_brass(bm):
        for dy in (-0.066, 0.066):
            for dz in (-0.086, 0.086):
                rounded_box(bm, book_at @ Matrix.Translation((0.0, dy, dz)), (0.058, 0.024, 0.024), 0.005, 1)

        place = book_at @ Matrix.Translation((-0.028, 0.0, 0.0)) @ Matrix.Rotation(-math.pi / 2, 4, "Y")
        lathe(bm, [(0.0, 0.026), (0.006, 0.024), (0.01, 0.0)], 20, place)

    B.build("cn_book_brass", book_brass, "brass", modifiers=[WEIGHTED], bone="hips")

    def strap(bm):
        top = Vector((-0.168, 0.02, 0.96))
        path = [top, top + Vector((-0.03, 0.005, -0.03)), Vector((-0.212, 0.03, 0.945))]
        sweep(bm, path, 0.012, 6, up=(-1.0, 0.0, 0.0), flat=0.35)

    B.build("cn_book_strap", strap, "leather_dark", bone="hips")


def skirt_point(u, v, side, hem):
    gap = math.radians(5 + 26 * v**1.2)
    vent = math.radians(9 * max(0.0, (v - 0.45) / 0.55))

    if side > 0:
        a0, a1 = -math.pi / 2 + gap, math.pi / 2 - vent
    else:
        a0, a1 = math.pi / 2 + vent, 3 * math.pi / 2 - gap

    a = a0 + (a1 - a0) * u
    flare = v**1.25
    rx = 0.162 + (0.31 - 0.162) * flare
    ry = 0.122 + (0.28 - 0.122) * flare
    fold = 0.016 * v * math.sin(7 * a + 0.6)
    z = SKIRT_TOP - (SKIRT_TOP - SKIRT_HEM) * v - hem[round(u * (len(hem) - 1))] * max(0.0, v - 0.8) / 0.2

    return Vector(((rx + fold) * math.cos(a), (ry + fold) * math.sin(a) + 0.01 * v, z))


def build_skirt():
    for tag, side in SIDES.items():
        rng = random.Random(40 + side)
        hem = [rng.uniform(-0.02, 0.045) + (0.07 if rng.random() < 0.12 else 0.0) for _ in range(25)]
        B.build(
            f"cn_skirt.{tag}",
            lambda bm, side=side, hem=hem: grid_sheet(bm, 24, 16, lambda u, v: skirt_point(u, v, side, hem)),
            "coat",
            recalc=False,
            modifiers=[solid(0.012), subsurf(1)],
            bone="coat",
        )

        def embers(bm, side=side, hem=hem):
            path = [skirt_point(k / 48, 1.0, side, hem) + Vector((0.0, 0.0, 0.004)) for k in range(49)]
            sweep(bm, path, 0.0075, 6, up=(0.0, 0.0, 1.0), flat=0.6)

        B.build(f"cn_embers.{tag}", embers, "embers", modifiers=[subsurf(1)], bone="coat", shadow=False)


def hand(bm, tag, wrist, grip, palm, curl, spread, size=HAND_SCALE):
    grip = Vector(grip).normalized()
    palm = Vector(palm)
    palm = (palm - palm.dot(grip) * grip).normalized()
    across = grip.cross(palm)
    thumb_side = across * -SIDES[tag]
    rounded_box(bm, frame_matrix(wrist + grip * 0.045 * size, across, grip, palm), (0.078 * size, 0.082 * size, 0.032 * size), 0.013 * size, 2)

    for offset, scale in ((-0.027, 0.86), (-0.009, 1.0), (0.009, 1.04), (0.027, 0.95)):
        base = wrist + (grip * 0.082 + thumb_side * offset + palm * 0.002) * size
        heading = (grip + thumb_side * offset * spread * 6.0).normalized()
        points = [base - grip * 0.012 * size, base]
        position = base.copy()
        bend_axis = heading.cross(palm).normalized()

        for length in (0.027, 0.021, 0.017):
            heading = (Matrix.Rotation(curl, 3, bend_axis) @ heading).normalized()
            position = position + heading * length * scale * size
            points.append(position.copy())

        sweep(bm, points, [r * size for r in (0.0115, 0.012, 0.0115, 0.0105, 0.009)], 8)

    base = wrist + (grip * 0.028 + thumb_side * 0.036 + palm * 0.004) * size
    heading = (grip * 0.55 + thumb_side * 0.6 + palm * 0.45).normalized()
    points = [base - heading * 0.01 * size, base]
    position = base.copy()

    for length in (0.028, 0.022):
        heading = (Matrix.Rotation(curl * 0.6, 3, heading.cross(palm).normalized()) @ heading).normalized()
        position = position + heading * length * size
        points.append(position.copy())

    sweep(bm, points, [r * size for r in (0.013, 0.014, 0.013, 0.011)], 8)


def build_arms():
    for tag, side in SIDES.items():
        S, E, W, H = (Vector(ARMS[tag][key]) for key in ("shoulder", "elbow", "wrist", "hand"))

        def upper(bm, S=S, E=E, side=side):
            sweep(bm, [S.lerp(E, i / 6) for i in range(7)], [0.085, 0.083, 0.079, 0.075, 0.072, 0.07, 0.068], 18, caps=False)
            sphere(bm, S + Vector((0.004 * side, 0.0, -0.012)), 0.078, 20, 12)
            sphere(bm, E, 0.07, 18, 10)

        B.build(f"cn_sleeve_upper.{tag}", upper, "coat", modifiers=[subsurf(1)], bone=f"upper_arm.{tag}")

        def fore(bm, E=E, W=W):
            sweep(bm, [E.lerp(W, i / 6) for i in range(7)], [0.068, 0.07, 0.068, 0.065, 0.062, 0.06, 0.058], 18, caps=False)

        B.build(f"cn_sleeve_fore.{tag}", fore, "coat", modifiers=[subsurf(1)], bone=f"forearm.{tag}")

        def cuff(bm, E=E, W=W):
            place, length = along(E, W)
            lathe(bm, [(0.66 * length, 0.06), (0.7 * length, 0.088), (0.93 * length, 0.094), (0.96 * length, 0.062)], 24, place, loop=True)

        B.build(f"cn_cuff.{tag}", cuff, "team", modifiers=[subsurf(1)], bone=f"forearm.{tag}")

        grip = H - W
        curl = math.radians(38 if tag == "L" else 24)
        spread = 0.5 if tag == "L" else 0.25
        B.build(
            f"cn_hand.{tag}",
            lambda bm, tag=tag, W=W, grip=grip, curl=curl, spread=spread: hand(bm, tag, W, grip, PALMS[tag], curl, spread),
            "skin",
            modifiers=[subsurf(1)],
            bone=f"hand.{tag}",
        )


def build_legs():
    for tag, side in SIDES.items():
        hip, knee, ankle = (mirror(point, side) for point in (HIP, KNEE, ANKLE))
        B.build(f"cn_thigh.{tag}", lambda bm, hip=hip, knee=knee: lathe(bm, [(0.0, 0.09), (0.18, 0.087), (0.38, 0.074)], 20, along(hip, knee)[0]), "trousers", modifiers=[subsurf(1)], bone=f"thigh.{tag}")
        B.build(f"cn_knee.{tag}", lambda bm, knee=knee: sphere(bm, knee, 0.058, 16, 10), "trousers", bone=f"shin.{tag}")
        B.build(f"cn_shin.{tag}", lambda bm, knee=knee, ankle=ankle: lathe(bm, [(-0.02, 0.071), (0.2, 0.063), (0.37, 0.054)], 18, along(knee, ankle)[0]), "trousers", modifiers=[subsurf(1)], bone=f"shin.{tag}")
        place = Matrix.Translation((ankle.x, ankle.y - 0.005, 0.0))
        B.build(f"cn_boot.{tag}", lambda bm, place=place: lathe(bm, [(0.07, 0.068), (0.18, 0.072), (0.29, 0.076), (0.33, 0.078)], 20, place), "leather", modifiers=[subsurf(1)], bone=f"shin.{tag}")
        B.build(f"cn_boot_cuff.{tag}", lambda bm, place=place: lathe(bm, [(0.3, 0.078), (0.315, 0.092), (0.37, 0.096), (0.385, 0.08)], 20, place, loop=True), "leather_dark", modifiers=[subsurf(1)], bone=f"shin.{tag}")
        B.build(f"cn_foot.{tag}", lambda bm, x=ankle.x: rounded_box(bm, Matrix.Translation((x, -0.065, 0.06)), (0.125, 0.27, 0.105), 0.045, 3), "leather", bone=f"foot.{tag}")
        B.build(f"cn_sole.{tag}", lambda bm, x=ankle.x: rounded_box(bm, Matrix.Translation((x, -0.068, 0.014)), (0.132, 0.28, 0.028), 0.01, 2), "leather_dark", bone=f"foot.{tag}")


def build_flame():
    def fill(bm):
        start = len(bm.verts)
        lathe(
            bm,
            [(0.0, 0.0), (0.014, 0.05), (0.045, 0.068), (0.09, 0.062), (0.14, 0.044), (0.19, 0.024), (0.235, 0.0)],
            24,
            Matrix.Translation(FLAME_BASE),
            shape=lambda a: 1.0 + 0.12 * math.sin(3 * a),
        )
        bm.verts.ensure_lookup_table()

        for vert in bm.verts[start:]:
            local = vert.co - FLAME_BASE
            h = max(0.0, local.z) / 0.235
            vert.co = FLAME_BASE + Matrix.Rotation(1.5 * h, 3, "Z") @ local + Vector((0.0, 0.03 * h * h, 0.0))

        for k in range(3):
            a = 0.4 + TAU * k / 3
            out = Vector((math.cos(a), math.sin(a), 0.0))
            side = Vector((-math.sin(a), math.cos(a), 0.0))
            base = FLAME_BASE + out * 0.045 + Vector((0.0, 0.0, 0.07))
            tip = FLAME_BASE + side * 0.02 + Vector((0.0, 0.02, 0.26 + 0.02 * k))
            path = [base, base + out * 0.035 + Vector((0.0, 0.0, 0.06)), base.lerp(tip, 0.6) + out * 0.02 + side * 0.03, tip]
            sweep(bm, path, [0.032, 0.026, 0.016, 0.0], 12, up=out, flat=0.6)

        for k in range(2):
            a = 1.3 + math.pi * k
            out = Vector((math.cos(a), math.sin(a), 0.0))
            base = FLAME_BASE + out * 0.05 + Vector((0.0, 0.0, 0.04))
            path = [base, base + out * 0.04 + Vector((0.0, 0.0, 0.05)), base + out * 0.02 + Vector((0.0, 0.0, 0.11))]
            sweep(bm, path, [0.018, 0.013, 0.0], 10, up=out, flat=0.6)

    B.build("cn_flame", fill, "flame", modifiers=[subsurf(1)], bone="flame", shadow=False)


build_head()
build_hair()
grow_head()
build_torso()
build_neckwear()
build_waist()
build_skirt()
build_arms()
build_legs()
build_flame()
CHARACTER = [obj for obj, _ in B.parts]


def extend(start, end, length):
    start, end = Vector(start), Vector(end)

    return tuple(end + (end - start).normalized() * length)


BONES = [
    ("root", None, (0.0, 0.0, 0.0), (0.0, 0.3, 0.0)),
    ("hips", "root", (0.0, 0.0, 0.84), (0.0, 0.0, 0.98)),
    ("spine", "hips", (0.0, 0.0, 0.98), (0.0, -0.01, 1.4)),
    ("head", "spine", (0.0, -0.02, 1.44), (0.0, -0.05, 1.84)),
    ("coat", "hips", (0.0, 0.0, 0.96), (0.0, 0.0, 0.5)),
]

for tag, side in SIDES.items():
    S, E, W, H = (Vector(ARMS[tag][key]) for key in ("shoulder", "elbow", "wrist", "hand"))
    hip, knee, ankle = (mirror(point, side) for point in (HIP, KNEE, ANKLE))
    BONES += [
        (f"upper_arm.{tag}", "spine", S, E),
        (f"forearm.{tag}", f"upper_arm.{tag}", E, W),
        (f"hand.{tag}", f"forearm.{tag}", W, extend(W, H, 0.08)),
        (f"thigh.{tag}", "hips", hip, knee),
        (f"shin.{tag}", f"thigh.{tag}", knee, ankle),
        (f"foot.{tag}", f"shin.{tag}", ankle, (ankle.x, -0.2, 0.03)),
    ]

BONES.append(("flame", "hand.L", FLAME_BASE, FLAME_BASE + Vector((0.0, 0.0, FLAME_HEIGHT))))

armature = bpy.data.armatures.new("Cinder Rig")
rig = bpy.data.objects.new("Cinder", armature)
collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")

for name, parent, head, tail in BONES:
    bone = armature.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    bone.roll = 0.0

    if parent is not None:
        bone.parent = armature.edit_bones[parent]

bpy.ops.object.mode_set(mode="OBJECT")
B.attach(rig)

report = {
    "objects": len(CHARACTER),
    "triangles": kit.triangles(CHARACTER),
    "bones": len(armature.bones),
    "parts": {obj.name: kit.triangles([obj]) for obj in CHARACTER},
}
target = SAVED if "save" in FLAGS else OUT / "cinder-hq.blend"
target.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(target), compress=True)
report["saved"] = str(target)

if "render" in FLAGS:
    from bake_kit import render_camera, shoot, show_only

    show_only(CHARACTER + [rig])
    camera = render_camera()
    shoot(camera, (-1.5, -2.9, 1.75), (0.0, 0.0, 1.05), OUT / "cinder_hq_front.png", (720, 900), 50)
    shoot(camera, (0.6, -1.05, 1.7), (0.02, -0.05, 1.6), OUT / "cinder_hq_face.png", (720, 720), 50)
    shoot(camera, (1.9, 3.1, 2.0), (0.0, 0.0, 1.0), OUT / "cinder_hq_back.png", (720, 900), 50)

print("CINDER " + json.dumps(report))
