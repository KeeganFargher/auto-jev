import os
import tempfile
import bpy
import json
import math
import random
import sys
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("ART_OUT") or os.path.join(tempfile.gettempdir(), "jev-art")
os.makedirs(os.path.join(OUT, "frames"), exist_ok=True)
sys.path.insert(0, HERE)
import hero_kit as kit
from hero_kit import TAU, WEIGHTED, along, bevel, grid_sheet, lathe, prism, ring, rounded_box, solid, sphere, subsurf, sweep

FPS = 30
FLAGS = set(sys.argv[sys.argv.index("--") + 1:]) if "--" in sys.argv else set()

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.render.fps_base = 1.0
collection = bpy.data.collections.new("Ravager HQ")
scene.collection.children.link(collection)

MATS = kit.library(["steel", "leather", "team", "fur"])
MATS.update({
    "skin": kit.material("gk_skin", "#c4855c", roughness=0.5, bump=0.06, bump_scale=160.0, rough_var=0.08, subsurface=0.15),
    "paint": kit.material("gk_paint", "#b3302a", roughness=0.8, bump=0.05, bump_scale=160.0),
    "bone": kit.material("gk_bone", "#e4d6b6", roughness=0.55, bump=0.12, bump_scale=70.0, rough_var=0.1),
    "horn": kit.material("gk_horn", "#3a2d25", roughness=0.4, bump=0.1, bump_scale=60.0),
    "hair": kit.material("gk_hair", "#6b3822", roughness=0.75, bump=0.5, bump_scale=260.0),
    "wood": kit.material("gk_wood", "#6d4a2e", roughness=0.7, bump=0.2, bump_scale=90.0, rough_var=0.1),
    "bronze": kit.material("gk_bronze", "#b5793b", metallic=1.0, roughness=0.34, bump=0.06, bump_scale=50.0, rough_var=0.1),
    "iron": kit.material("gk_iron", "#6a635c", metallic=0.85, roughness=0.48, bump=0.1, bump_scale=26.0, rough_var=0.12),
    "fur_dark": kit.material("gk_fur_dark", "#4d3f35", roughness=0.95, bump=0.45, bump_scale=90.0),
    "wool": kit.material("gk_wool", "#4a3528", roughness=0.9, bump=0.3, bump_scale=180.0),
    "leather_dark": kit.material("gk_leather_dark", "#3d2616", roughness=0.7, bump=0.25, bump_scale=120.0, rough_var=0.1),
    "eyes": kit.material("gk_eyes", "#ff8a3d", roughness=0.5, emission=26.0),
    "stone": kit.material("gk_stone", "#6f6557", roughness=0.9, bump=0.3, bump_scale=40.0),
    "wind": kit.fx_material("gk_fx_wind", "#f4ead8", 2.1, noise=5.0),
    "blood": kit.fx_material("gk_fx_blood", "#e0493c", 2.4, noise=5.0),
    "shock": kit.fx_material("gk_fx_shock", "#f1e3c8", 3.0, noise=9.0),
    "trail": kit.fx_material("gk_fx_trail", "#ffe4bd", 4.2),
    "dust": kit.fx_material("gk_fx_dust", "#cdbda2", 0.0, additive=False, opacity=0.42, noise=6.0),
})
B = kit.Builder(collection, MATS)

SIDES = {"L": 1, "R": -1}
SHOULDER = (0.44, 0.0, 1.4)
ELBOW = (0.58, -0.04, 1.08)
WRIST = (0.56, -0.2, 0.86)
HAND = (0.545, -0.265, 0.8)
AXE_BUTT = (0.56, -0.17, 0.97)
AXE_END = (0.52, -0.5, 0.36)
HIP = (0.17, 0.02, 0.76)
KNEE = (0.23, -0.07, 0.43)
ANKLE = (0.25, -0.02, 0.15)
HEAD = Vector((0.0, -0.1, 1.64))


def mirror(point, side):
    return Vector((point[0] * side, point[1], point[2]))


def diff(a, b):
    return math.atan2(math.sin(a - b), math.cos(a - b))


TORSO = [
    (0.84, 0.27, 0.22, 0.02), (0.95, 0.3, 0.255, 0.0), (1.05, 0.33, 0.275, -0.01), (1.15, 0.36, 0.27, -0.02),
    (1.25, 0.41, 0.27, -0.03), (1.34, 0.44, 0.255, -0.035), (1.42, 0.39, 0.215, -0.04), (1.49, 0.24, 0.15, -0.05), (1.53, 0.12, 0.09, -0.05),
]


def torso_row(z):
    for (z0, *v0), (z1, *v1) in zip(TORSO, TORSO[1:]):
        if z <= z1:
            t = max(0.0, (z - z0) / (z1 - z0))
            return [a + (b - a) * t for a, b in zip(v0, v1)]
    return list(TORSO[-1][1:])


def torso_bump(z, a):
    bump = 0.0
    if 1.14 < z < 1.38:
        w = math.sin(math.pi * (z - 1.14) / 0.24)
        bump += 0.04 * w * (math.exp(-(diff(a, math.radians(-58)) / 0.33) ** 2) + math.exp(-(diff(a, math.radians(-122)) / 0.33) ** 2))
        bump -= 0.012 * w * math.exp(-(diff(a, -math.pi / 2) / 0.12) ** 2)
    if 0.88 < z < 1.12:
        bump += 0.03 * math.sin(math.pi * (z - 0.88) / 0.24) * math.exp(-(diff(a, -math.pi / 2) / 0.9) ** 2)
    return bump


def torso_point(z, a, lift=0.0):
    rx, ry, cy = torso_row(z)
    normal = Vector((math.cos(a) / rx, math.sin(a) / ry, 0.0)).normalized()
    return Vector((rx * math.cos(a), ry * math.sin(a) + cy, z)) + normal * (torso_bump(z, a) + lift), normal


def build_torso():
    def fill(bm):
        zs = [0.84 + (1.53 - 0.84) * i / 23 for i in range(24)]
        rings = [[bm.verts.new(torso_point(z, TAU * k / 48)[0]) for k in range(48)] for z in zs]
        top = bm.verts.new((0.0, -0.05, 1.545))
        for low, high in zip(rings, rings[1:]):
            for k in range(48):
                j = (k + 1) % 48
                bm.faces.new((low[k], low[j], high[j], high[k]))
        for k in range(48):
            bm.faces.new((rings[-1][k], rings[-1][(k + 1) % 48], top))
        bm.faces.new(list(reversed(rings[0])))
    B.build("gk_torso", fill, "skin", modifiers=[subsurf(1)], bone="spine")

    def harness(bm):
        points, ups = [], []
        for i in range(25):
            t = i / 24
            p, n = torso_point(1.38 + (0.93 - 1.38) * t, math.radians(-38 + (-142 + 38) * t), 0.012)
            points.append(p)
            ups.append(n)
        sweep(bm, points, 0.03, 8, up=ups, flat=0.28)
    B.build("gk_harness", harness, "leather_dark", modifiers=[subsurf(1)], bone="spine")

    def boss(bm):
        z = 1.38 + (0.93 - 1.38) * 0.5
        p, n = torso_point(z, math.radians(-90), 0.02)
        place, _ = along(p, p + n)
        lathe(bm, [(0.0, 0.058), (0.012, 0.056), (0.022, 0.035), (0.05, 0.0)], 24, place)
    B.build("gk_harness_boss", boss, "bronze", modifiers=[WEIGHTED], bone="spine")

    def paint(bm):
        for i in range(3):
            points, ups, radii = [], [], []
            for k in range(13):
                t = k / 12
                p, n = torso_point(1.33 - 0.3 * t - 0.02 * i, math.radians(-100 - 8 * i - 26 * t), 0.004)
                points.append(p)
                ups.append(n)
                radii.append(0.004 + 0.011 * math.sin(math.pi * t) ** 0.6)
            sweep(bm, points, radii, 6, up=ups, flat=0.2)
    B.build("gk_war_paint", paint, "paint", bone="spine")


def build_head():
    def skull(bm):
        lathe(bm, [(-0.13, 0.0), (-0.11, 0.07), (-0.06, 0.112), (0.0, 0.125), (0.06, 0.118), (0.1, 0.088), (0.132, 0.0)], 32, Matrix.Translation(HEAD), sy=1.1)
        rounded_box(bm, Matrix.Translation(HEAD + Vector((0.0, -0.075, -0.095))), (0.18, 0.14, 0.11), 0.04, 3)
        rounded_box(bm, Matrix.Translation(HEAD + Vector((0.0, -0.14, -0.035))), (0.05, 0.055, 0.065), 0.02, 2)
        lathe(bm, [(0.0, 0.125), (0.14, 0.105)], 24, along((0.0, -0.05, 1.45), (0.0, -0.085, 1.58))[0])
    B.build("gk_head", skull, "skin", modifiers=[subsurf(1)], bone="head")

    def eyes(bm):
        for side in (1, -1):
            sphere(bm, HEAD + Vector((0.045 * side, -0.135, -0.01)), 0.021, 16, 10, (1.0, 0.55, 0.7))
    B.build("gk_eyes", eyes, "eyes", bone="head", shadow=False)

    def tusks(bm):
        for side in (1, -1):
            base = HEAD + Vector((0.06 * side, -0.16, -0.11))
            path = [base, base + Vector((0.02 * side, -0.035, 0.05)), base + Vector((0.045 * side, -0.045, 0.1)), base + Vector((0.06 * side, -0.035, 0.15))]
            sweep(bm, path, [0.022, 0.018, 0.011, 0.0], 12)
    B.build("gk_tusks", tusks, "bone", modifiers=[subsurf(1)], bone="head")

    def beard(bm):
        chin = HEAD + Vector((0.0, -0.13, -0.15))
        path = [chin, chin + Vector((0.0, -0.04, -0.07)), chin + Vector((0.0, -0.07, -0.15)), chin + Vector((0.0, -0.08, -0.22)), chin + Vector((0.0, -0.07, -0.28))]
        sweep(bm, path, [0.08, 0.09, 0.075, 0.045, 0.0], 12, up=(0.0, -1.0, 0.0), flat=0.55)
        for side in (1, -1):
            start = HEAD + Vector((0.01 * side, -0.165, -0.055))
            sweep(bm, [start, start + Vector((0.04 * side, -0.005, -0.015)), start + Vector((0.065 * side, 0.005, -0.065)), start + Vector((0.07 * side, 0.025, -0.125))], [0.014, 0.016, 0.012, 0.0], 8)
            top = HEAD + Vector((0.05 * side, -0.2, -0.3))
            for k in range(7):
                sphere(bm, top + Vector((0.006 * side * (-1) ** k, -0.004 * k, -0.034 * k)), 0.024 - 0.0018 * k, 12, 8, (1.0, 1.0, 1.3))
    B.build("gk_beard", beard, "hair", modifiers=[subsurf(1)], bone="head")

    def beard_rings(bm):
        for side in (1, -1):
            top = HEAD + Vector((0.05 * side, -0.2, -0.3))
            ring(bm, 0.02, 0.006, 16, Matrix.Translation(top + Vector((0.0, -0.028, -0.245))))
    B.build("gk_beard_rings", beard_rings, "bronze", bone="head")

    def helm(bm):
        lathe(bm, [(0.005, 0.139), (0.04, 0.141), (0.08, 0.133), (0.115, 0.108), (0.145, 0.066), (0.16, 0.0)], 40, Matrix.Translation(HEAD), sy=1.1, caps=(False, False))
    B.build("gk_helm", helm, "iron", recalc=False, modifiers=[solid(0.012), bevel(0.003, 2, 40.0), WEIGHTED], bone="head")

    def helm_iron(bm):
        for side in (1, -1):
            place = Matrix.Translation(HEAD + Vector((0.128 * side, -0.05, -0.055))) @ Matrix.Rotation(math.radians(-15 * side), 4, "Z")
            rounded_box(bm, place, (0.022, 0.11, 0.12), 0.01, 2)
        outline = [(-0.13, 0.06), (-0.07, 0.15), (0.0, 0.185), (0.08, 0.14), (0.13, 0.05), (0.1, 0.05), (0.06, 0.12), (0.0, 0.15), (-0.06, 0.125), (-0.1, 0.055)]
        prism(bm, outline, lambda y, z: HEAD + Vector((-0.012, y * 1.05, z)), lambda y, z: HEAD + Vector((0.012, y * 1.05, z)))
    B.build("gk_helm_plates", helm_iron, "iron", sharp=30.0, modifiers=[bevel(0.004, 2, 30.0), WEIGHTED], bone="head")

    def helm_bronze(bm):
        ring(bm, 0.142, 0.017, 40, Matrix.Translation(HEAD), sy=1.1, z=0.012)
        rounded_box(bm, Matrix.Translation(HEAD + Vector((0.0, -0.158, -0.03))), (0.034, 0.018, 0.1), 0.008, 2)
        for k in range(10):
            a = math.radians(-160 + 140 * k / 9)
            sphere(bm, HEAD + Vector((0.158 * math.cos(a), 0.158 * 1.1 * math.sin(a), 0.012)), 0.011, 10, 6)
    B.build("gk_helm_bronze", helm_bronze, "bronze", bone="head")

    horn_path = [(0.128, 0.0, 0.07), (0.2, 0.01, 0.1), (0.28, -0.005, 0.17), (0.325, -0.05, 0.27), (0.315, -0.12, 0.36), (0.27, -0.17, 0.41)]
    horn_radii = [0.05, 0.046, 0.039, 0.03, 0.018, 0.0]

    def horns(bm):
        for side in (1, -1):
            path = [HEAD + Vector((x * side, y, z)) for x, y, z in horn_path[:4]]
            sweep(bm, path, horn_radii[:3] + [0.031], 16)
    B.build("gk_horns", horns, "bone", modifiers=[subsurf(1)], bone="head")

    def horn_tips(bm):
        for side in (1, -1):
            path = [HEAD + Vector((x * side, y, z)) for x, y, z in horn_path[3:]]
            sweep(bm, path, [0.031, 0.018, 0.0], 16, caps=True)
            for index in (1, 2):
                p = HEAD + Vector((horn_path[index][0] * side, horn_path[index][1], horn_path[index][2]))
                q = HEAD + Vector((horn_path[index + 1][0] * side, horn_path[index + 1][1], horn_path[index + 1][2]))
                place, _ = along(p, p + (q - p).normalized())
                ring(bm, horn_radii[index] + 0.003, 0.007, 20, place)
    B.build("gk_horn_tips", horn_tips, "horn", modifiers=[subsurf(1)], bone="head")


def build_arms():
    upper_radii = [0.13, 0.14, 0.135, 0.13, 0.133, 0.125, 0.112, 0.104, 0.1]
    fore_radii = [0.1, 0.112, 0.12, 0.118, 0.11, 0.1, 0.092, 0.085, 0.08]

    def fore_radius(t):
        x = t * 8
        i = min(int(x), 7)
        return fore_radii[i] + (fore_radii[i + 1] - fore_radii[i]) * (x - i)

    for tag, side in SIDES.items():
        S, E, W, H = (mirror(p, side) for p in (SHOULDER, ELBOW, WRIST, HAND))
        butt, end = mirror(AXE_BUTT, side), mirror(AXE_END, side)

        def upper(bm, S=S, E=E, side=side):
            sweep(bm, [S.lerp(E, i / 8) for i in range(9)], upper_radii, 20, caps=False)
            sphere(bm, S + Vector((0.02 * side, 0.0, 0.02)), 0.15, 24, 14)
            sphere(bm, E, 0.102, 20, 12)
        B.build(f"gk_upper_arm.{tag}", upper, "skin", modifiers=[subsurf(1)], bone=f"upper_arm.{tag}")

        def bands(bm, S=S, E=E):
            place, length = along(S, E)
            for t in (0.46, 0.58):
                r = upper_radii[round(t * 8)] + 0.007
                lathe(bm, [(t * length, r), (t * length + 0.024, r)], 24, place, caps=(False, False))
        B.build(f"gk_arm_paint.{tag}", bands, "paint", recalc=False, modifiers=[solid(0.003, 1.0)], bone=f"upper_arm.{tag}")

        def fore(bm, E=E, W=W):
            sweep(bm, [E.lerp(W, i / 8) for i in range(9)], fore_radii, 20, caps=False)
        B.build(f"gk_forearm.{tag}", fore, "skin", modifiers=[subsurf(1)], bone=f"forearm.{tag}")

        def wraps(bm, E=E, W=W):
            place, length = along(E, W)
            points, ups = [], []
            for i in range(121):
                t = 0.42 + 0.4 * i / 120
                a = TAU * 5 * i / 120
                r = fore_radius(t) + 0.01
                points.append(place @ Vector((r * math.cos(a), r * math.sin(a), t * length)))
                ups.append(place.to_3x3() @ Vector((math.cos(a), math.sin(a), 0.0)))
            sweep(bm, points, 0.013, 6, up=ups, flat=0.4)
        B.build(f"gk_wraps.{tag}", wraps, "leather_dark", bone=f"forearm.{tag}")

        def bracer(bm, E=E, W=W):
            place, length = along(E, W)
            lathe(bm, [(0.84 * length, 0.088), (0.84 * length, 0.104), (0.99 * length, 0.1), (0.99 * length, 0.085)], 28, place, loop=True)
            for k in range(3):
                a = TAU * k / 3 + 0.5
                p = place @ Vector((0.104 * math.cos(a), 0.104 * math.sin(a), 0.915 * length))
                q = place @ Vector((0.16 * math.cos(a), 0.16 * math.sin(a), 0.93 * length))
                sweep(bm, [p, p.lerp(q, 0.5), q], [0.016, 0.01, 0.0], 8)
        B.build(f"gk_bracer.{tag}", bracer, "bronze", modifiers=[WEIGHTED], bone=f"forearm.{tag}")

        axis = (end - butt).normalized()
        grip = (Vector(H) - butt).dot(axis)
        frame, length = along(butt, end)
        palm = W - butt - axis * (W - butt).dot(axis)
        local_palm = frame.to_3x3().inverted() @ palm
        palm_angle = math.atan2(local_palm.y, local_palm.x)

        def fist(bm, W=W, H=H, frame=frame, grip=grip, palm_angle=palm_angle):
            place, _ = along(W, H)
            rounded_box(bm, place @ Matrix.Translation((0.0, 0.0, 0.05)), (0.13, 0.12, 0.12), 0.035, 3)
            for i in range(4):
                h = grip - 0.045 + i * 0.03
                path = [frame @ Vector((0.046 * math.cos(palm_angle + 0.5 + (TAU - 1.3) * k / 13), 0.046 * math.sin(palm_angle + 0.5 + (TAU - 1.3) * k / 13), h)) for k in range(14)]
                sweep(bm, path, 0.019, 8)
            thumb = [frame @ Vector((0.05 * math.cos(palm_angle - 0.4 - 0.9 * k / 6), 0.05 * math.sin(palm_angle - 0.4 - 0.9 * k / 6), grip - 0.085)) for k in range(7)]
            sweep(bm, thumb, 0.021, 8)
        B.build(f"gk_fist.{tag}", fist, "skin", modifiers=[subsurf(1)], bone=f"hand.{tag}")


def axe_frame(side):
    butt, end = mirror(AXE_BUTT, side), mirror(AXE_END, side)
    axis = (end - butt).normalized()
    outward = Vector((side, 0.0, 0.0))
    edge = (outward - outward.dot(axis) * axis).normalized()
    return butt, end, axis, edge


BLADE = [(0.03, 0.075), (0.12, 0.095), (0.2, 0.15), (0.265, 0.215), (0.3, 0.13), (0.318, 0.0), (0.3, -0.13), (0.265, -0.215), (0.2, -0.15), (0.12, -0.095), (0.03, -0.075)]
EDGE_STRIP = [(0.265, 0.215), (0.3, 0.13), (0.318, 0.0), (0.3, -0.13), (0.265, -0.215), (0.24, -0.185), (0.262, -0.115), (0.278, 0.0), (0.262, 0.115), (0.24, 0.185)]


def build_axes():
    for tag, side in SIDES.items():
        butt, end, axis, edge = axe_frame(side)
        frame, length = along(butt, end)
        head_at = length - 0.09
        centre = butt + axis * head_at
        normal = axis.cross(edge)

        def haft(bm, frame=frame, length=length):
            lathe(bm, [(-0.03, 0.0), (-0.03, 0.024), (length + 0.03, 0.022), (length + 0.03, 0.0)], 16, frame)
        B.build(f"gk_axe_haft.{tag}", haft, "wood", bone=f"hand.{tag}")

        def fittings(bm, frame=frame, length=length, head_at=head_at):
            sphere(bm, frame @ Vector((0.0, 0.0, -0.055)), 0.036, 16, 10)
            ring(bm, 0.026, 0.009, 20, frame, z=-0.02)
            ring(bm, 0.026, 0.01, 20, frame, z=head_at - 0.235)
            lathe(bm, [(length + 0.03, 0.026), (length + 0.06, 0.02), (length + 0.1, 0.0)], 16, frame)
        B.build(f"gk_axe_fittings.{tag}", fittings, "bronze", bone=f"hand.{tag}")

        def grip_wrap(bm, frame=frame, length=length):
            points, ups = [], []
            for i in range(141):
                t = i / 140
                a = TAU * 9 * t
                points.append(frame @ Vector((0.027 * math.cos(a), 0.027 * math.sin(a), 0.02 + 0.32 * t)))
                ups.append(frame.to_3x3() @ Vector((math.cos(a), math.sin(a), 0.0)))
            sweep(bm, points, 0.009, 6, up=ups, flat=0.45)
            for h in (head_at - 0.215, head_at + 0.2):
                ring(bm, 0.026, 0.008, 20, frame, z=h)
        B.build(f"gk_axe_wrap.{tag}", grip_wrap, "leather_dark", bone=f"hand.{tag}")

        def blade(bm, centre=centre, axis=axis, edge=edge, normal=normal):
            def thick(b):
                return 0.036 - 0.028 * min(max((b - 0.03) / 0.29, 0.0), 1.0)
            prism(bm, BLADE, lambda b, a: centre + edge * b + axis * a - normal * thick(b) / 2, lambda b, a: centre + edge * b + axis * a + normal * thick(b) / 2)
        B.build(f"gk_axe_head.{tag}", blade, "iron", sharp=30.0, modifiers=[bevel(0.003, 2, 30.0), WEIGHTED], bone=f"hand.{tag}")

        def keen(bm, centre=centre, axis=axis, edge=edge, normal=normal):
            prism(bm, EDGE_STRIP, lambda b, a: centre + edge * b + axis * a - normal * 0.0065, lambda b, a: centre + edge * b + axis * a + normal * 0.0065)
        B.build(f"gk_axe_edge.{tag}", keen, "steel", sharp=30.0, modifiers=[bevel(0.002, 2, 30.0), WEIGHTED], bone=f"hand.{tag}")

        def spike(bm, centre=centre, axis=axis, edge=edge):
            base = centre - edge * 0.02
            path = [base, base - edge * 0.08 + axis * 0.02, base - edge * 0.15 + axis * 0.06, base - edge * 0.19 + axis * 0.12]
            sweep(bm, path, [0.028, 0.024, 0.014, 0.0], 12)
        B.build(f"gk_axe_tusk.{tag}", spike, "bone", modifiers=[subsurf(1)], bone=f"hand.{tag}")

        def tassel(bm, frame=frame):
            top = frame @ Vector((0.0, 0.0, -0.075))
            for k in range(3):
                drift = Vector(((k - 1) * 0.018, 0.012 * k, 0.0))
                sweep(bm, [top, top + drift * 0.5 + Vector((0.0, 0.0, -0.06)), top + drift + Vector((0.0, 0.01, -0.13))], [0.012, 0.011, 0.0], 8, flat=0.5)
        B.build(f"gk_axe_tassel.{tag}", tassel, "team", modifiers=[subsurf(1)], bone=f"hand.{tag}")


def build_pauldron():
    base = Matrix.Translation((0.5, 0.0, 1.45)) @ Matrix.Rotation(math.radians(35), 4, "Y")

    def dome(bm):
        lathe(bm, [(0.0, 0.215), (0.05, 0.21), (0.1, 0.185), (0.15, 0.14), (0.185, 0.075), (0.198, 0.0)], 40, base, sy=1.15, caps=(False, False))
    B.build("gk_pauldron", dome, "iron", recalc=False, modifiers=[solid(0.016), bevel(0.003, 2, 40.0), WEIGHTED], bone="spine")

    def lames(bm):
        for step, radius in ((2, 0.17), (1, 0.195)):
            place = base @ Matrix.Translation((0.05 * step, 0.0, -0.085 * step))
            lathe(bm, [(0.0, radius), (0.05, radius * 0.97), (0.09, radius * 0.84)], 40, place, sy=1.15, caps=(False, False))
    B.build("gk_pauldron_lames", lames, "iron", recalc=False, modifiers=[solid(0.013), bevel(0.003, 2, 40.0)], bone="spine")

    def rims(bm):
        ring(bm, 0.219, 0.017, 40, base, sy=1.15)
        for step, radius in ((2, 0.17), (1, 0.195)):
            ring(bm, radius + 0.004, 0.01, 40, base @ Matrix.Translation((0.05 * step, 0.0, -0.085 * step)), sy=1.15)
        for k in range(12):
            a = TAU * k / 12
            sphere(bm, base @ Vector((0.2 * math.cos(a), 0.2 * 1.15 * math.sin(a), 0.035)), 0.012, 10, 6)
    B.build("gk_pauldron_bronze", rims, "bronze", bone="spine")

    def spikes(bm):
        for a, length in ((math.radians(160), 0.32), (math.radians(112), 0.26), (math.radians(208), 0.26)):
            local = Vector((0.08 * math.cos(a), 0.08 * 1.15 * math.sin(a), 0.175))
            outward = Vector((0.55 * math.cos(a), 0.55 * math.sin(a), 1.0)).normalized()
            p0 = base @ local
            direction = base.to_3x3() @ outward
            path = [p0 - direction * 0.02, p0 + direction * length * 0.4, p0 + direction * length * 0.75 + Vector((0.0, 0.03, 0.0)), p0 + direction * length + Vector((0.0, 0.07, -0.01))]
            sweep(bm, path, [0.048, 0.04, 0.022, 0.0], 12)
    B.build("gk_pauldron_tusks", spikes, "bone", modifiers=[subsurf(1)], bone="spine")


def build_fur():
    rng = random.Random(11)

    def mantle(bm):
        roll = [(1.47 + 0.05 * math.sin(TAU * k / 10), 0.27 + 0.055 * math.cos(TAU * k / 10)) for k in range(10)]
        lathe(bm, roll, 40, sx=1.25, sy=0.95, loop=True)
        for vert in bm.verts:
            vert.co += Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * 0.01
        for row, (radius, height, count, droop) in enumerate(((0.28, 1.5, 46, 0.2), (0.32, 1.46, 56, 0.75), (0.34, 1.41, 62, 1.25))):
            for k in range(count):
                a = TAU * (k + rng.uniform(-0.35, 0.35)) / count + row * 0.2
                outward = Vector((math.cos(a), math.sin(a), 0.0))
                base = Vector((radius * 1.25 * math.cos(a), radius * 0.95 * math.sin(a) - 0.02, height + rng.uniform(-0.015, 0.015)))
                length = rng.uniform(0.06, 0.1)
                bend = (outward + Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), -droop))).normalized()
                path = [base + bend * length * t + Vector((0.0, 0.0, -0.035 * t * t)) for t in (0.0, 0.4, 0.75, 1.0)]
                width = rng.uniform(0.03, 0.045)
                sweep(bm, path, [width, width * 0.9, width * 0.5, 0.0], 6, up=outward + Vector((0.0, 0.0, 0.6)), flat=0.4)
    B.build("gk_mantle", mantle, "fur", recalc=False, modifiers=[subsurf(1)], bone="spine")

    rows = [(1.47, 0.3, 0.2), (1.32, 0.47, 0.31), (1.0, 0.43, 0.35), (0.64, 0.45, 0.38)]
    hem = [rng.uniform(0.0, 0.08) for _ in range(29)]

    def cape_point(u, v):
        span = v * (len(rows) - 1)
        index = min(int(span), len(rows) - 2)
        t = span - index
        z0, rx0, ry0 = rows[index]
        z1, rx1, ry1 = rows[index + 1]
        z, rx, ry = z0 + (z1 - z0) * t, rx0 + (rx1 - rx0) * t, ry0 + (ry1 - ry0) * t
        angle = math.radians(-60 + 120 * u)
        fold = 0.03 * v * math.sin(u * math.pi * 6)
        z -= hem[round(u * 28)] * max(0.0, v - 0.85) / 0.15
        return Vector(((rx + fold) * math.sin(angle), (ry + fold) * math.cos(angle), z))

    B.build("gk_cape", lambda bm: grid_sheet(bm, 28, 16, cape_point), "fur_dark", recalc=False, modifiers=[solid(0.018), subsurf(1)], bone="cape")

    def cape_tufts(bm):
        for i in range(40):
            u = (i + rng.uniform(-0.3, 0.3)) / 39
            u = min(max(u, 0.0), 1.0)
            base = cape_point(u, 0.97)
            outward = Vector((base.x, base.y, 0.0)).normalized()
            length = rng.uniform(0.09, 0.15)
            direction = (outward * 0.35 + Vector((rng.uniform(-0.15, 0.15), 0.0, -1.0))).normalized()
            path = [base + direction * length * t for t in (0.0, 0.45, 0.8, 1.0)]
            width = rng.uniform(0.035, 0.05)
            sweep(bm, path, [width, width * 0.9, width * 0.45, 0.0], 6, up=outward, flat=0.4)
    B.build("gk_cape_tufts", cape_tufts, "fur_dark", recalc=False, modifiers=[subsurf(1)], bone="cape")


def build_waist():
    B.build("gk_belt", lambda bm: lathe(bm, [(0.84, 0.94), (0.84, 1.0), (0.955, 1.0), (0.955, 0.94)], 48, sx=0.318, sy=0.272, loop=True), "leather", bone="hips")

    def studs(bm):
        for k in range(14):
            a = math.radians(-60 + 300 * k / 13) + math.pi / 2
            sphere(bm, Vector((0.322 * math.cos(a), 0.276 * math.sin(a), 0.897)), 0.012, 10, 6)
    B.build("gk_belt_studs", studs, "bronze", bone="hips")

    def skull(bm):
        sphere(bm, Vector((0.0, -0.292, 0.908)), 1.0, 20, 14, (0.066, 0.05, 0.056))
        rounded_box(bm, Matrix.Translation((0.0, -0.335, 0.876)), (0.056, 0.07, 0.046), 0.016, 2)
        for side in (1, -1):
            base = Vector((0.026 * side, -0.362, 0.866))
            sweep(bm, [base, base + Vector((0.016 * side, -0.012, 0.028)), base + Vector((0.022 * side, -0.006, 0.058))], [0.01, 0.007, 0.0], 8)
    B.build("gk_belt_skull", skull, "bone", modifiers=[subsurf(1)], bone="hips")
    B.build("gk_belt_skull_eyes", lambda bm: [sphere(bm, Vector((0.027 * s, -0.327, 0.917)), 0.013, 10, 6) for s in (1, -1)], "iron", bone="hips")

    rng = random.Random(4)

    def skirt(bm):
        for row, (z, count) in enumerate(((0.85, 40), (0.8, 44), (0.74, 48))):
            for k in range(count):
                a = TAU * (k + rng.uniform(-0.3, 0.3)) / count + row * 0.15
                outward = Vector((math.cos(a), math.sin(a), 0.0))
                base = Vector((0.31 * math.cos(a), 0.265 * math.sin(a), z))
                length = rng.uniform(0.2, 0.28)
                direction = (outward * 0.3 + Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), -1.0))).normalized()
                path = [base + direction * length * t for t in (0.0, 0.4, 0.8, 1.0)]
                width = rng.uniform(0.035, 0.05)
                sweep(bm, path, [width, width * 0.95, width * 0.55, 0.0], 6, up=outward, flat=0.4)
    B.build("gk_fur_skirt", skirt, "fur_dark", recalc=False, modifiers=[subsurf(1)], bone="kilt")

    def flaps(bm):
        for degrees in (-90, -52, -128, -15, -165):
            centre = math.radians(degrees)

            def point(u, v, centre=centre):
                a = centre + math.radians(-13 + 26 * u)
                flare = 0.035 + 0.075 * v
                z = 0.875 - 0.36 * v - 0.045 * v * (2 * u - 1) ** 2
                return Vector(((0.318 + flare) * math.cos(a), (0.272 + flare) * math.sin(a), z))
            grid_sheet(bm, 6, 8, point)
    B.build("gk_kilt_flaps", flaps, "leather_dark", recalc=False, modifiers=[solid(0.012), subsurf(1)], bone="kilt")

    def flap_studs(bm):
        for degrees in (-90, -52, -128, -15, -165):
            for offset in (-6, 6):
                a = math.radians(degrees + offset)
                sphere(bm, Vector((0.36 * math.cos(a), 0.315 * math.sin(a), 0.83)), 0.013, 10, 6)
    B.build("gk_flap_studs", flap_studs, "bronze", bone="kilt")

    def sash(bm):
        sphere(bm, Vector((-0.31, -0.17, 0.9)), 1.0, 16, 10, (0.045, 0.035, 0.04))
        for k, (drop, lean) in enumerate(((0.42, 0.0), (0.34, 0.04))):
            def point(u, v, drop=drop, lean=lean, k=k):
                x = -0.315 - 0.02 * v - lean + (u - 0.5) * 0.075
                y = -0.2 - 0.03 * v + 0.02 * k + 0.012 * math.sin(v * 9 + u * 2)
                return Vector((x, y, 0.89 - drop * v))
            grid_sheet(bm, 3, 12, point)
    B.build("gk_sash", sash, "team", recalc=False, modifiers=[solid(0.008), subsurf(1)], bone="kilt")


def build_legs():
    for tag, side in SIDES.items():
        hip, knee, ankle = (mirror(p, side) for p in (HIP, KNEE, ANKLE))
        B.build(f"gk_thigh.{tag}", lambda bm, hip=hip, knee=knee: lathe(bm, [(0.0, 0.155), (0.2, 0.15), (0.33, 0.125)], 24, along(hip, knee)[0]), "wool", modifiers=[subsurf(1)], bone=f"thigh.{tag}")
        B.build(f"gk_knee.{tag}", lambda bm, knee=knee: sphere(bm, knee, 0.125, 20, 12), "leather_dark", bone=f"shin.{tag}")
        place = Matrix.Translation((ankle.x, -0.03, 0.0))
        B.build(f"gk_boot.{tag}", lambda bm, place=place: lathe(bm, [(0.12, 0.125), (0.24, 0.135), (0.36, 0.13), (0.41, 0.12)], 24, place), "leather", modifiers=[subsurf(1)], bone=f"shin.{tag}")

        def straps(bm, place=place):
            for direction in (1, -1):
                points, ups = [], []
                for i in range(61):
                    t = i / 60
                    a = direction * TAU * 1.5 * t
                    z = 0.14 + 0.22 * t
                    r = 0.137
                    points.append(place @ Vector((r * math.cos(a), r * math.sin(a), z)))
                    ups.append(Vector((math.cos(a), math.sin(a), 0.0)))
                sweep(bm, points, 0.012, 6, up=ups, flat=0.4)
        B.build(f"gk_boot_straps.{tag}", straps, "leather_dark", bone=f"shin.{tag}")

        rng = random.Random(30 + side)

        def cuff(bm, place=place):
            for k in range(20):
                a = TAU * (k + rng.uniform(-0.3, 0.3)) / 20
                outward = Vector((math.cos(a), math.sin(a), 0.0))
                base = place @ Vector((0.13 * math.cos(a), 0.13 * math.sin(a), 0.42))
                direction = (outward * 0.5 + Vector((0.0, 0.0, -1.0))).normalized()
                path = [base + direction * 0.1 * t for t in (0.0, 0.45, 0.8, 1.0)]
                sweep(bm, path, [0.04, 0.036, 0.02, 0.0], 6, up=outward, flat=0.45)
        B.build(f"gk_boot_cuff.{tag}", cuff, "fur", recalc=False, modifiers=[subsurf(1)], bone=f"shin.{tag}")
        B.build(f"gk_foot.{tag}", lambda bm, x=ankle.x: rounded_box(bm, Matrix.Translation((x, -0.085, 0.075)), (0.21, 0.36, 0.13), 0.055, 3), "leather", bone=f"foot.{tag}")
        B.build(f"gk_sole.{tag}", lambda bm, x=ankle.x: rounded_box(bm, Matrix.Translation((x, -0.09, 0.018)), (0.225, 0.38, 0.036), 0.015, 2), "leather_dark", bone=f"foot.{tag}")


build_torso()
build_head()
HEAD_GROW = Matrix.Translation((0.0, -0.07, 1.49)) @ Matrix.Diagonal((1.35, 1.35, 1.35, 1.0)) @ Matrix.Translation((0.0, 0.06, -1.47))
for obj, bone in B.parts:
    if bone == "head":
        obj.data.transform(HEAD_GROW)
build_arms()
build_axes()
build_pauldron()
build_fur()
build_waist()
build_legs()
CHARACTER = [obj for obj, _ in B.parts]

report = {"objects": len(CHARACTER), "triangles": kit.triangles(CHARACTER)}

rig = None
holder = None
if "rig" not in FLAGS:
    holder = bpy.data.objects.new("Gorrak", None)
    collection.objects.link(holder)
    for obj in CHARACTER:
        obj.parent = holder
if "rig" in FLAGS:
    def extend(start, end, length):
        start, end = Vector(start), Vector(end)
        return tuple(end + (end - start).normalized() * length)

    BONES = [
        ("root", None, (0.0, 0.0, 0.0), (0.0, 0.3, 0.0)),
        ("hips", "root", (0.0, 0.02, 0.76), (0.0, 0.0, 0.95)),
        ("spine", "hips", (0.0, 0.0, 0.95), (0.0, -0.04, 1.44)),
        ("head", "spine", (0.0, -0.07, 1.5), (0.0, -0.1, 1.8)),
        ("cape", "spine", (0.0, 0.24, 1.46), (0.0, 0.36, 0.66)),
        ("kilt", "hips", (0.0, 0.0, 0.88), (0.0, 0.0, 0.55)),
    ]
    for tag, side in SIDES.items():
        S, E, W, H = (mirror(p, side) for p in (SHOULDER, ELBOW, WRIST, HAND))
        hip, knee, ankle = (mirror(p, side) for p in (HIP, KNEE, ANKLE))
        BONES += [
            (f"upper_arm.{tag}", "spine", S, E),
            (f"forearm.{tag}", f"upper_arm.{tag}", E, W),
            (f"hand.{tag}", f"forearm.{tag}", W, extend(W, H, 0.08)),
            (f"thigh.{tag}", "hips", hip, knee),
            (f"shin.{tag}", f"thigh.{tag}", knee, ankle),
            (f"foot.{tag}", f"shin.{tag}", ankle, (ankle.x, -0.24, 0.05)),
        ]
    NAMES = [b[0] for b in BONES]

    armature = bpy.data.armatures.new("Gorrak Rig")
    rig = bpy.data.objects.new("Gorrak", armature)
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
    rig.animation_data_create()

    REST = {b.name: b.matrix_local.to_3x3() for b in armature.bones}
    HEADS = {b.name: b.head_local.copy() for b in armature.bones}
    TAILS = {b.name: b.tail_local.copy() for b in armature.bones}
    REST_DIR = {name: (TAILS[name] - HEADS[name]).normalized() for name in NAMES}
    REST_HAFT = {tag: axe_frame(side)[2] for tag, side in SIDES.items()}
    REST_EDGE = {tag: axe_frame(side)[3] for tag, side in SIDES.items()}

    def turn(value):
        if isinstance(value, Quaternion):
            return value
        return Euler(tuple(math.radians(a) for a in value), "XYZ").to_quaternion()

    def local_rotation(bone, value):
        rest = REST[bone]
        return (rest.inverted() @ turn(value).to_matrix() @ rest).to_quaternion()

    def frame_of(a, b):
        a = Vector(a).normalized()
        b = Vector(b)
        b = (b - b.dot(a) * a).normalized()
        return Matrix((a, b, a.cross(b))).transposed()

    def aim(rest_a, rest_b, a, b):
        return (frame_of(a, b) @ frame_of(rest_a, rest_b).transposed()).to_quaternion()

    def aim_arm(rotations, tag, upper, fore, haft, edge):
        world_upper = REST_DIR[f"upper_arm.{tag}"].rotation_difference(Vector(upper).normalized())
        world_fore = REST_DIR[f"forearm.{tag}"].rotation_difference(Vector(fore).normalized())
        world_hand = aim(REST_HAFT[tag], REST_EDGE[tag], haft, edge)
        rotations[f"upper_arm.{tag}"] = world_upper
        rotations[f"forearm.{tag}"] = world_upper.inverted() @ world_fore
        rotations[f"hand.{tag}"] = world_fore.inverted() @ world_hand

    def wrap_angle(angle):
        return (angle + math.pi) % TAU - math.pi

    def plant_leg(rotations, offsets, tag):
        side = SIDES[tag]
        hip, knee, ankle = (mirror(p, side) for p in (HIP, KNEE, ANKLE))
        hips_turn = turn(rotations.get("hips", (0.0, 0.0, 0.0)))
        joint = HEADS["hips"] + Vector(offsets.get("hips", (0.0, 0.0, 0.0))) + hips_turn @ (hip - HEADS["hips"])
        thigh_vec, shin_vec = knee - hip, ankle - knee
        l1, l2 = math.hypot(thigh_vec.y, thigh_vec.z), math.hypot(shin_vec.y, shin_vec.z)
        reach = math.hypot(ankle.y - joint.y, ankle.z - joint.z)
        reach = min(max(reach, abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4)
        aim_angle = math.atan2(ankle.z - joint.z, ankle.y - joint.y)
        bend = math.acos((l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach))
        thigh_angle = aim_angle - bend
        knee_y, knee_z = joint.y + l1 * math.cos(thigh_angle), joint.z + l1 * math.sin(thigh_angle)
        shin_angle = math.atan2(ankle.z - knee_z, ankle.y - knee_y)
        thigh = wrap_angle(thigh_angle - math.atan2(thigh_vec.z, thigh_vec.y))
        shin = wrap_angle(shin_angle - math.atan2(shin_vec.z, shin_vec.y))
        rotations[f"thigh.{tag}"] = hips_turn.inverted() @ Quaternion((1.0, 0.0, 0.0), thigh)
        rotations[f"shin.{tag}"] = Quaternion((1.0, 0.0, 0.0), shin - thigh)
        rotations[f"foot.{tag}"] = Quaternion((1.0, 0.0, 0.0), -shin)

    REST_P = {"spine": (0.0, 0.0, 0.0), "head": (0.0, 0.0, 0.0), "hips": (0.0, 0.0, 0.0), "cape": (0.0, 0.0, 0.0), "hips_off": (0.0, 0.0, 0.0), "kilt": (1.0, 1.0, 1.0)}
    for tag in SIDES:
        REST_P[f"{tag}.upper"] = tuple(REST_DIR[f"upper_arm.{tag}"])
        REST_P[f"{tag}.fore"] = tuple(REST_DIR[f"forearm.{tag}"])
        REST_P[f"{tag}.haft"] = tuple(REST_HAFT[tag])
        REST_P[f"{tag}.edge"] = tuple(REST_EDGE[tag])

    def blend(a, b, t):
        return {k: tuple(x + (y - x) * t for x, y in zip(a[k], b[k])) for k in a}

    def smooth(t):
        t = min(max(t, 0.0), 1.0)
        return t * t * (3 - 2 * t)

    def ramp(f, a, b):
        return smooth((f - a) / (b - a))

    def resolve(p, spin=0.0):
        rotations = {"root": (0.0, 0.0, spin), "spine": p["spine"], "head": p["head"], "hips": p["hips"], "cape": p["cape"]}
        offsets = {"hips": p["hips_off"]}
        for tag in SIDES:
            aim_arm(rotations, tag, p[f"{tag}.upper"], p[f"{tag}.fore"], p[f"{tag}.haft"], p[f"{tag}.edge"])
        for tag in SIDES:
            plant_leg(rotations, offsets, tag)
        return rotations, offsets, {"kilt": p["kilt"]}

    def idle_params(t):
        s, s2 = math.sin(TAU * t), math.sin(2 * TAU * t)
        p = dict(REST_P)
        p["spine"] = (4.0 + 1.5 * s2, -1.5 * s, 1.5 * math.sin(TAU * t + 1.0))
        p["head"] = (-6.0 - 1.0 * s2, 0.0, 7.0 * math.sin(TAU * t + 0.4))
        p["hips"] = (0.0, 1.2 * s, 0.0)
        p["hips_off"] = (0.012 * s, 0.0, -0.015 - 0.005 * (1 - math.cos(2 * TAU * t)) / 2)
        p["cape"] = (4.0 + 2.0 * math.sin(TAU * t + 1.2), 0.0, 1.5 * s)
        sway = 0.04 * math.sin(2 * TAU * t + 0.5)
        for tag in SIDES:
            p[f"{tag}.upper"] = tuple(Vector(REST_P[f"{tag}.upper"]) + Vector((0.0, sway * 0.5, 0.0)))
            p[f"{tag}.haft"] = tuple(Vector(REST_P[f"{tag}.haft"]) + Vector((0.0, sway, 0.0)))
        return p

    IDLE0 = idle_params(0.0)
    SPIN_P = dict(IDLE0)
    SPIN_P.update({
        "spine": (8.0, 5.0, 0.0), "head": (-10.0, 0.0, 0.0), "hips": (0.0, 0.0, 0.0), "hips_off": (0.0, 0.0, -0.05),
        "cape": (58.0, 0.0, 0.0), "kilt": (1.28, 0.9, 1.28),
        "L.upper": (0.6, -0.05, -0.8), "L.fore": (0.9, -0.3, -0.3), "L.haft": (0.93, 0.05, -0.36), "L.edge": (0.0, 1.0, 0.0),
        "R.upper": (-0.6, -0.05, -0.8), "R.fore": (-0.9, -0.3, -0.3), "R.haft": (-0.93, 0.05, -0.36), "R.edge": (0.0, -1.0, 0.0),
    })
    WINDUP = blend(IDLE0, SPIN_P, 0.3)
    WINDUP.update({"spine": (16.0, 0.0, -34.0), "head": (-12.0, 0.0, 26.0), "hips": (0.0, 0.0, -12.0), "hips_off": (0.0, 0.02, -0.085), "cape": (8.0, 0.0, 0.0), "kilt": (1.0, 1.0, 1.0)})
    ROAR = dict(IDLE0)
    ROAR.update({
        "spine": (-8.0, 0.0, 10.0), "head": (-22.0, 0.0, -8.0), "hips_off": (0.0, 0.0, -0.02), "cape": (18.0, 0.0, 0.0), "kilt": (1.08, 0.96, 1.08),
        "L.upper": (0.85, 0.05, -0.25), "L.fore": (0.55, -0.25, 0.8), "L.haft": (0.35, -0.15, 0.92), "L.edge": (1.0, 0.0, 0.0),
        "R.upper": (-0.85, 0.05, -0.25), "R.fore": (-0.55, -0.25, 0.8), "R.haft": (-0.35, -0.15, 0.92), "R.edge": (-1.0, 0.0, 0.0),
    })
    WHIRL_KEYS = [(0, IDLE0), (9, WINDUP), (16, SPIN_P), (61, SPIN_P), (70, SPIN_P), (77, ROAR), (84, IDLE0)]
    WHIRL_END = 84

    def velocity(f):
        if f < 9 or f > 72:
            return 0.0
        if f < 17:
            return smooth((f - 9) / 8)
        if f < 61:
            return 1.0
        return smooth((72 - f) / 11)

    cumulative = [0.0]
    for f in range(WHIRL_END):
        cumulative.append(cumulative[-1] + sum(velocity(f + (k + 0.5) / 20) for k in range(20)) / 20)
    YAW = [1440.0 * c / cumulative[-1] for c in cumulative]

    def whirl_params(f):
        for (f0, p0), (f1, p1) in zip(WHIRL_KEYS, WHIRL_KEYS[1:]):
            if f <= f1:
                p = blend(p0, p1, smooth((f - f0) / (f1 - f0)) if f1 > f0 else 1.0)
                break
        spin = velocity(f)
        yaw = math.radians(YAW[f])
        p["hips_off"] = (p["hips_off"][0], p["hips_off"][1], p["hips_off"][2] + 0.015 * spin * math.sin(2 * yaw))
        p["cape"] = (p["cape"][0] + 8.0 * spin * math.sin(3 * yaw), p["cape"][1], p["cape"][2])
        return p

    def rig_action(name, frames):
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        slot = action.slots.new(id_type="OBJECT", name="Gorrak")
        bag = action.layers.new("Layer").strips.new(type="KEYFRAME").channelbag(slot, ensure=True)
        for bone in NAMES:
            quats = []
            for _, rotations, _, _ in frames:
                q = local_rotation(bone, rotations.get(bone, (0.0, 0.0, 0.0)))
                if quats and q.dot(quats[-1]) < 0:
                    q.negate()
                quats.append(q)
            channels = [("rotation_quaternion", [tuple(q) for q in quats])]
            if bone in ("root", "hips"):
                channels.append(("location", [tuple(REST[bone].inverted() @ Vector(offsets.get(bone, (0.0, 0.0, 0.0)))) for _, _, offsets, _ in frames]))
            if bone == "kilt":
                channels.append(("scale", [tuple(scales.get(bone, (1.0, 1.0, 1.0))) for _, _, _, scales in frames]))
            for prop, values in channels:
                for index in range(len(values[0])):
                    curve = bag.fcurves.new(f'pose.bones["{bone}"].{prop}', index=index, group_name=bone)
                    for (frame, _, _, _), value in zip(frames, values):
                        point = curve.keyframe_points.insert(frame, value[index], options={"FAST"})
                        point.interpolation = "LINEAR"
                    curve.update()
        action.use_frame_range = True
        action.frame_start = frames[0][0]
        action.frame_end = frames[-1][0]
        return action, slot

    idle_frames = [(f, *resolve(idle_params(f / 90))) for f in range(91)]
    whirl_frames = [(f, *resolve(whirl_params(f), YAW[f])) for f in range(WHIRL_END + 1)]
    ACTIONS = {"gorrak_idle": rig_action("gorrak_idle", idle_frames), "gorrak_whirlwind": rig_action("gorrak_whirlwind", whirl_frames)}

    def play(name, frame):
        action, slot = ACTIONS[name]
        rig.animation_data.action = action
        rig.animation_data.action_slot = slot
        scene.frame_set(frame)

    def world_points(objects):
        depsgraph = bpy.context.evaluated_depsgraph_get()
        chunks = []
        for obj in objects:
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            co = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
            mesh.vertices.foreach_get("co", co)
            matrix = np.array(evaluated.matrix_world)
            chunks.append(co.reshape(-1, 3) @ matrix[:3, :3].T + matrix[:3, 3])
            evaluated.to_mesh_clear()
        return chunks

    for obj in CHARACTER:
        for mod in obj.modifiers:
            if mod.type == "SUBSURF":
                mod.show_viewport = False

    names = [obj.name for obj in CHARACTER]
    head_objects = [bpy.data.objects[f"gk_axe_head.{tag}"] for tag in SIDES]
    torso_obj = bpy.data.objects["gk_torso"]
    pauldron_obj = bpy.data.objects["gk_pauldron"]
    lames_obj = bpy.data.objects["gk_pauldron_lames"]
    upper_l = bpy.data.objects["gk_upper_arm.L"]

    def clip_report(name, count):
        lows, low_names, snapshots = [], [], []
        for f in range(count):
            play(name, f)
            chunks = world_points(CHARACTER)
            z = [c[:, 2].min() for c in chunks]
            i = int(np.argmin(z))
            lows.append(float(z[i]))
            low_names.append(names[i])
            if f in (0, count - 1):
                snapshots.append(np.concatenate(chunks))
        worst = int(np.argmin(lows))
        return {
            "frames_below": sum(1 for z in lows if z < -0.01),
            "lowest": round(lows[worst], 3),
            "lowest_part": low_names[worst],
            "lowest_frame": worst,
        }, snapshots

    idle_stats, idle_snap = clip_report("gorrak_idle", 91)
    whirl_stats, whirl_snap = clip_report("gorrak_whirlwind", WHIRL_END + 1)
    whirl_stats["gap_to_idle0_start"] = round(float(np.abs(whirl_snap[0] - idle_snap[0]).max()), 4)
    whirl_stats["gap_to_idle0_end"] = round(float(np.abs(whirl_snap[1] - idle_snap[0]).max()), 4)
    idle_stats["loop_gap"] = round(float(np.abs(idle_snap[0] - idle_snap[1]).max()), 4)
    whirl_stats["yaw_total"] = round(YAW[-1], 3)

    edge_dots, radii, clearances, heights, arm_gap = [], [], [], [], []
    for f in range(20, 58, 2):
        play("gorrak_whirlwind", f)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        torso_pts = world_points([torso_obj])[0]
        tree = KDTree(len(torso_pts))
        for i, p in enumerate(torso_pts):
            tree.insert(tuple(p), i)
        tree.balance()
        for tag, obj in zip(SIDES, head_objects):
            pts = world_points([obj])[0]
            centre = Vector(pts.mean(axis=0))
            pose_bone = rig.pose.bones[f"hand.{tag}"]
            world_rot = pose_bone.matrix.to_3x3() @ armature.bones[f"hand.{tag}"].matrix_local.to_3x3().inverted()
            edge = world_rot @ REST_EDGE[tag]
            travel = Vector((0.0, 0.0, 1.0)).cross(Vector((centre.x, centre.y, 0.0))).normalized()
            flat_edge = Vector((edge.x, edge.y, 0.0)).normalized()
            edge_dots.append(flat_edge.dot(travel))
            radii.append(math.hypot(centre.x, centre.y))
            heights.append(centre.z)
            clearances.append(min(tree.find(Vector(p))[2] for p in pts[::4]))
        lame_pts = np.concatenate(world_points([pauldron_obj, lames_obj]))
        ptree = KDTree(len(lame_pts))
        for i, p in enumerate(lame_pts):
            ptree.insert(tuple(p), i)
        ptree.balance()
        arm_pts = world_points([upper_l])[0]
        arm_gap.append(min(ptree.find(Vector(p))[2] for p in arm_pts[::3]))
    whirl_stats["edge_lead_min"] = round(min(edge_dots), 3)
    whirl_stats["axe_radius"] = [round(min(radii), 3), round(max(radii), 3)]
    whirl_stats["axe_height"] = [round(min(heights), 3), round(max(heights), 3)]
    whirl_stats["axe_to_torso_min"] = round(min(clearances), 3)
    whirl_stats["pauldron_to_arm_min"] = round(min(arm_gap), 3)
    report["idle"] = idle_stats
    report["whirlwind"] = whirl_stats

    play("gorrak_whirlwind", 40)
    root_pose = rig.pose.bones["root"].matrix.copy()
    trail_specs = []
    for tag, obj in zip(SIDES, head_objects):
        pts = world_points([obj])[0]
        local = root_pose.inverted() @ Vector(pts.mean(axis=0))
        trail_specs.append((math.hypot(local.x, local.y), math.atan2(local.y, local.x), local.z))
    report["trail_specs"] = [[round(v, 3) for v in spec] for spec in trail_specs]

    for obj in CHARACTER:
        for mod in obj.modifiers:
            if mod.type == "SUBSURF":
                mod.show_viewport = True

    axe_radius = sum(spec[0] for spec in trail_specs) / 2
    axe_height = sum(spec[2] for spec in trail_specs) / 2

    def funnel_radius(z):
        return axe_radius * (0.78 + 0.26 * z / 2.2)

    FX = []
    frng = random.Random(3)

    def funnel(bm, fade, count=30):
        for i in range(count):
            z0, z1 = frng.uniform(0.0, 0.8), frng.uniform(1.4, 2.8)
            angle0 = frng.uniform(0.0, TAU)
            turns = frng.uniform(0.35, 0.7)
            width = frng.uniform(0.05, 0.2)
            scale = frng.uniform(0.86, 1.14)
            brightness = frng.uniform(0.5, 1.0)
            columns = []
            for k in range(41):
                s = k / 40
                z = z0 + (z1 - z0) * s
                r = funnel_radius(z) * scale
                a = angle0 + TAU * turns * s
                w = width * (0.6 + 0.8 * s)
                along_fade = math.sin(math.pi * s) ** 0.8 * brightness
                column = []
                for offset, across in ((-0.5, 0.0), (0.0, 1.0), (0.5, 0.0)):
                    vert = bm.verts.new((r * math.cos(a), r * math.sin(a), z + offset * w))
                    vert[fade] = along_fade * across
                    column.append(vert)
                columns.append(column)
            for c0, c1 in zip(columns, columns[1:]):
                for j in range(2):
                    bm.faces.new((c0[j], c1[j], c1[j + 1], c0[j + 1]))
    FX.append(B.build("gk_fx_funnel", funnel, "wind", recalc=False, fade=True, shadow=False))
    blood_obj = B.build("gk_fx_funnel_blood", lambda bm, fade: funnel(bm, fade, 12), "blood", recalc=False, fade=True, shadow=False)

    def dust(bm, fade):
        for i in range(64):
            a = frng.uniform(0.0, TAU)
            r = frng.uniform(0.6, 1.05) * axe_radius
            size = frng.uniform(0.12, 0.26)
            verts = bmesh_ico(bm, Vector((r * math.cos(a), r * math.sin(a), size * 0.3)), size)
            for vert in verts:
                vert.co.z = size * 0.3 + (vert.co.z - size * 0.3) * 0.55
                vert[fade] = 1.0

    import bmesh as _bmesh

    def bmesh_ico(bm, centre, radius):
        verts = _bmesh.ops.create_icosphere(bm, subdivisions=2, radius=radius, matrix=Matrix.Translation(centre))["verts"]
        for vert in verts:
            vert.co += Vector((frng.uniform(-1, 1), frng.uniform(-1, 1), frng.uniform(-1, 1))) * radius * 0.15
        return verts
    FX.append(B.build("gk_fx_dust", dust, "dust", recalc=False, fade=True, shadow=False))

    def debris(bm):
        for i in range(16):
            a = frng.uniform(0.0, TAU)
            r = frng.uniform(0.6, 1.05) * axe_radius
            bmesh_ico(bm, Vector((r * math.cos(a), r * math.sin(a), frng.uniform(0.1, 1.6))), frng.uniform(0.02, 0.055))
    FX.append(B.build("gk_fx_debris", debris, "stone", shadow=False))

    def trails(bm, fade):
        for radius, angle, height in trail_specs:
            columns = []
            for k in range(41):
                s = k / 40
                a = angle - math.radians(125) * s
                column = []
                for offset, across in ((-0.2, 0.0), (0.0, 1.0), (0.18, 0.0)):
                    vert = bm.verts.new(((radius + offset) * math.cos(a), (radius + offset) * math.sin(a), height))
                    vert[fade] = across * (1.0 - s) ** 1.6
                    column.append(vert)
                columns.append(column)
            for c0, c1 in zip(columns, columns[1:]):
                for j in range(2):
                    bm.faces.new((c0[j], c1[j], c1[j + 1], c0[j + 1]))
    trail_obj = B.build("gk_fx_trails", trails, "trail", recalc=False, fade=True, shadow=False)

    def shock(bm, fade):
        columns = []
        for k in range(97):
            a = TAU * k / 96
            column = []
            for radius, across in ((0.82, 0.0), (1.0, 1.0), (1.2, 0.0)):
                vert = bm.verts.new((radius * math.cos(a), radius * math.sin(a), 0.012))
                vert[fade] = across
                column.append(vert)
            columns.append(column)
        for c0, c1 in zip(columns, columns[1:]):
            for j in range(2):
                bm.faces.new((c0[j], c1[j], c1[j + 1], c0[j + 1]))
    shock_obj = B.build("gk_fx_shock", shock, "shock", recalc=False, fade=True, shadow=False)
    FX += [blood_obj, shock_obj]
    kit.parent_to_bone(trail_obj, rig, "root")
    for obj in FX:
        obj.parent = rig

    def object_action(name, obj, frames):
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        slot = action.slots.new(id_type="OBJECT", name=obj.name)
        bag = action.layers.new("Layer").strips.new(type="KEYFRAME").channelbag(slot, ensure=True)
        channels = [("rotation_euler", 2, lambda s: math.radians(s[1])), ("color", 3, lambda s: s[3])]
        channels += [("scale", i, lambda s: s[2]) for i in range(3)]
        for prop, index, getter in channels:
            curve = bag.fcurves.new(prop, index=index)
            for sample in frames:
                point = curve.keyframe_points.insert(sample[0], getter(sample), options={"FAST"})
                point.interpolation = "LINEAR"
            curve.update()
        action.use_frame_range = True
        action.frame_start = 0
        action.frame_end = WHIRL_END
        obj.animation_data_create()
        obj.animation_data.action = action
        obj.animation_data.action_slot = slot
        ACTIONS[name] = (action, slot)

    def hidden(scale):
        return max(scale, 0.001)

    object_action("gorrak_fx_funnel", FX[0], [
        (f, 1.8 * YAW[f], hidden(0.0 if f < 8 or f > 77 else (0.35 + 0.65 * ramp(f, 8, 18)) * (1 + 0.15 * ramp(f, 60, 76))), ramp(f, 8, 18) * (1 - ramp(f, 60, 76)))
        for f in range(WHIRL_END + 1)
    ])
    object_action("gorrak_fx_dust", FX[1], [
        (f, 1.1 * YAW[f], hidden(0.0 if f < 10 or f > 80 else (0.5 + 0.5 * ramp(f, 10, 22)) * (1 + 0.3 * ramp(f, 58, 80))), ramp(f, 10, 22) * (1 - ramp(f, 58, 80)))
        for f in range(WHIRL_END + 1)
    ])
    object_action("gorrak_fx_debris", FX[2], [
        (f, 1.6 * YAW[f], hidden(ramp(f, 12, 22) * (1 - ramp(f, 60, 74))), 1.0)
        for f in range(WHIRL_END + 1)
    ])
    object_action("gorrak_fx_funnel_blood", blood_obj, [
        (f, 2.3 * YAW[f] + 40.0, hidden(0.0 if f < 12 or f > 74 else (0.4 + 0.6 * ramp(f, 12, 22)) * (1 + 0.12 * ramp(f, 58, 72))) * 0.92, ramp(f, 12, 22) * (1 - ramp(f, 56, 72)))
        for f in range(WHIRL_END + 1)
    ])
    object_action("gorrak_fx_shock", shock_obj, [
        (f, 0.0, hidden(0.0 if f < 9 or f > 26 else axe_radius * (0.35 + 1.05 * ramp(f, 9, 26))), (1 - ramp(f, 12, 26)) * ramp(f, 9, 11))
        for f in range(WHIRL_END + 1)
    ])
    object_action("gorrak_fx_trails", trail_obj, [
        (f, 0.0, 1.0, ramp(f, 14, 20) * (1 - ramp(f, 56, 64)))
        for f in range(WHIRL_END + 1)
    ])
    report["fx_alpha_ends"] = [round(ramp(f, 8, 18) * (1 - ramp(f, 60, 76)), 3) for f in (0, WHIRL_END)] + [round(ramp(f, 14, 20) * (1 - ramp(f, 56, 64)), 3) for f in (0, WHIRL_END)]
    report["triangles_with_fx"] = kit.triangles(CHARACTER + FX + [trail_obj])
    play("gorrak_idle", 0)

bpy.ops.wm.save_as_mainfile(filepath=f"{OUT}/gorrak.blend")


def setup_render():
    world = bpy.data.worlds.new("render_world")
    scene.world = world
    nodes = world.node_tree.nodes
    env = nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load("/Applications/Blender.app/Contents/Resources/5.2/datafiles/studiolights/world/studio.exr")
    background = next(n for n in nodes if n.type == "BACKGROUND")
    background.inputs["Strength"].default_value = 0.9
    world.node_tree.links.new(env.outputs["Color"], background.inputs["Color"])
    sun = bpy.data.objects.new("render_sun", bpy.data.lights.new("render_sun", "SUN"))
    sun.data.energy = 2.5
    sun.rotation_euler = (math.radians(45), 0.0, math.radians(30))
    scene.collection.objects.link(sun)
    floor_mat = kit.material("render_floor", "#6f6a8a", roughness=0.85)
    floor = bpy.data.meshes.new("render_floor")
    floor.from_pydata([(-8, -8, 0), (8, -8, 0), (8, 8, 0), (-8, 8, 0)], [], [(0, 1, 2, 3)])
    floor.materials.append(floor_mat)
    scene.collection.objects.link(bpy.data.objects.new("render_floor", floor))
    camera = bpy.data.objects.new("render_camera", bpy.data.cameras.new("render_camera"))
    camera.data.lens = 50
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 24
    if hasattr(scene.eevee, "use_raytracing"):
        scene.eevee.use_raytracing = True
    return camera


def shoot(camera, location, target, path, size=(720, 720), lens=50):
    camera.location = location
    camera.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = lens
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


if FLAGS & {"render", "sheet", "lineup"}:
    camera = setup_render()
    if "render" in FLAGS:
        shoot(camera, (-2.6, -4.6, 2.1), (0.0, 0.0, 1.0), f"{OUT}/gorrak_front.png")
        shoot(camera, (2.3, 4.2, 2.6), (0.0, 0.0, 1.0), f"{OUT}/gorrak_back.png")
        shoot(camera, (-2.2, -3.4, 5.4), (0.0, 0.0, 0.8), f"{OUT}/gorrak_game.png")
    if "sheet" in FLAGS and rig is not None:
        size = 400
        picks = [0, 9, 14, 22, 30, 40, 52, 66, 72, 77]
        sheet = np.ones((size, len(picks) * size, 4), dtype=np.float32)
        for column, frame in enumerate(picks):
            play("gorrak_whirlwind", frame)
            path = f"{OUT}/frames/gorrak_{column}.png"
            shoot(camera, (-3.4, -5.4, 4.2), (0.0, 0.0, 0.9), path, (size, size), 38)
            image = bpy.data.images.load(path)
            pixels = np.empty(size * size * 4, dtype=np.float32)
            image.pixels.foreach_get(pixels)
            bpy.data.images.remove(image)
            sheet[:, column * size:(column + 1) * size] = pixels.reshape(size, size, 4)
        out = bpy.data.images.new("gorrak_sheet", len(picks) * size, size, alpha=True)
        out.pixels.foreach_set(sheet.ravel())
        out.filepath_raw = f"{OUT}/sheet_gorrak_whirlwind.png"
        out.file_format = "PNG"
        out.save()
        play("gorrak_idle", 0)
    if "lineup" in FLAGS:
        anvil = {}
        exec(open(os.path.join(HERE, "build_anvil_hq.py")).read(), anvil)
        bpy.data.objects["Anvil HQ"].location = (-0.95, 0.0, 0.0)
        (rig or holder).location = (0.95, 0.0, 0.0)
        shoot(camera, (-1.8, -5.6, 2.2), (0.0, 0.0, 1.0), f"{OUT}/lineup_front.png", (960, 640))
        shoot(camera, (-1.6, -4.6, 5.6), (0.0, 0.0, 0.8), f"{OUT}/lineup_game.png", (960, 640))

print("RESULT " + json.dumps(report))
