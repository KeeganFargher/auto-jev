import os
import tempfile
import bpy
import json
import math
import sys
from mathutils import Euler, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("ART_OUT") or os.path.join(tempfile.gettempdir(), "jev-art")
os.makedirs(os.path.join(OUT, "frames"), exist_ok=True)
FPS = 30
TAU = math.tau
RENDER = "--render" in sys.argv

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.render.fps_base = 1.0

build = {"LOCATION_OVERRIDE": (0.0, 0.0, 0.0)}
exec(open(os.path.join(HERE, "build_bulwark.py")).read(), build)
body = build["hero"]
body.name = "Bulwark Body"
collection = build["collection"]
ARMS = build["ARMS"]
LEGS = build["LEGS"]
MACE = build["MACE"]


def extend(start, end, length):
    start, end = Vector(start), Vector(end)
    return tuple(end + (end - start).normalized() * length)


BONES = [
    ("root", None, (0.0, 0.0, 0.0), (0.0, 0.25, 0.0)),
    ("hips", "root", (0.0, 0.0, 0.62), (0.0, 0.0, 0.8)),
    ("spine", "hips", (0.0, 0.0, 0.8), (0.0, 0.0, 1.3)),
    ("head", "spine", (0.0, 0.0, 1.32), (0.0, 0.0, 1.62)),
    ("cape", "spine", (0.0, 0.2, 1.36), (0.0, 0.33, 0.45)),
]
for suffix, (shoulder, elbow, wrist, hand) in ARMS.items():
    BONES += [
        (f"upper_arm.{suffix}", "spine", shoulder, elbow),
        (f"forearm.{suffix}", f"upper_arm.{suffix}", elbow, wrist),
        (f"hand.{suffix}", f"forearm.{suffix}", wrist, extend(wrist, hand, 0.08)),
    ]
for suffix, (hip, knee, ankle) in LEGS.items():
    BONES += [
        (f"thigh.{suffix}", "hips", hip, knee),
        (f"shin.{suffix}", f"thigh.{suffix}", knee, ankle),
        (f"foot.{suffix}", f"shin.{suffix}", ankle, (ankle[0], -0.2, 0.05)),
    ]
NAMES = [name for name, _, _, _ in BONES]
MOVERS = ["root", "hips", "spine"]

armature = bpy.data.armatures.new("Bulwark Rig")
rig = bpy.data.objects.new("Bulwark", armature)
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

body.parent = rig
modifier = body.modifiers.new("Armature", "ARMATURE")
modifier.object = rig
rig.animation_data_create()

REST = {bone.name: bone.matrix_local.to_3x3() for bone in armature.bones}
HEAD = {bone.name: bone.head_local.copy() for bone in armature.bones}
TAIL = {bone.name: bone.tail_local.copy() for bone in armature.bones}
MACE_AXIS = (Vector(MACE[1]) - Vector(MACE[0])).normalized()


def turn(value):
    if isinstance(value, Quaternion):
        return value
    return Euler(tuple(math.radians(a) for a in value), "XYZ").to_quaternion()


def local_rotation(bone, value):
    rest = REST[bone]
    return (rest.inverted() @ turn(value).to_matrix() @ rest).to_quaternion()


def local_offset(bone, delta):
    return REST[bone].inverted() @ Vector(delta)


def direction(bone):
    return (TAIL[bone] - HEAD[bone]).normalized()


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def about_x(angle):
    return Quaternion((1.0, 0.0, 0.0), angle)


def wrap(angle):
    return (angle + math.pi) % TAU - math.pi


def aim_arm(rotations, side, upper, fore=None, hand=None):
    world_upper = direction(f"upper_arm.{side}").rotation_difference(Vector(upper).normalized())
    world_fore = world_upper if fore is None else direction(f"forearm.{side}").rotation_difference(Vector(fore).normalized())
    world_hand = world_fore if hand is None else MACE_AXIS.rotation_difference(Vector(hand).normalized())
    rotations[f"upper_arm.{side}"] = world_upper
    rotations[f"forearm.{side}"] = world_upper.inverted() @ world_fore
    rotations[f"hand.{side}"] = world_fore.inverted() @ world_hand


def plant_leg(rotations, offsets, side, forward, lift, pitch):
    hip, knee, ankle = (Vector(p) for p in LEGS[side])
    hips_turn = turn(rotations.get("hips", (0.0, 0.0, 0.0)))
    joint = HEAD["hips"] + Vector(offsets.get("hips", (0.0, 0.0, 0.0))) + hips_turn @ (hip - HEAD["hips"])
    root_turn = turn(rotations.get("root", (0.0, 0.0, 0.0)))
    target = root_turn.inverted() @ (Vector((ankle.x, ankle.y + forward, ankle.z + lift)) - Vector(offsets.get("root", (0.0, 0.0, 0.0))))
    target_y, target_z = target.y, target.z
    thigh_vec, shin_vec = knee - hip, ankle - knee
    l1, l2 = math.hypot(thigh_vec.y, thigh_vec.z), math.hypot(shin_vec.y, shin_vec.z)
    reach = math.hypot(target_y - joint.y, target_z - joint.z)
    reach = min(max(reach, abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4)
    aim = math.atan2(target_z - joint.z, target_y - joint.y)
    bend = math.acos((l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach))
    thigh_angle = aim - bend
    knee_y, knee_z = joint.y + l1 * math.cos(thigh_angle), joint.z + l1 * math.sin(thigh_angle)
    shin_angle = math.atan2(target_z - knee_z, target_y - knee_y)
    thigh = wrap(thigh_angle - math.atan2(thigh_vec.z, thigh_vec.y))
    shin = wrap(shin_angle - math.atan2(shin_vec.z, shin_vec.y))
    rotations[f"thigh.{side}"] = hips_turn.inverted() @ about_x(thigh)
    rotations[f"shin.{side}"] = about_x(shin - thigh)
    rotations[f"foot.{side}"] = about_x(math.radians(pitch) - root_turn.to_euler().x - shin)


PLANTED = {"L": (0.0, 0.0, 0.0), "R": (0.0, 0.0, 0.0)}


def pose(rot=None, loc=None, right=None, feet=PLANTED):
    rotations = dict(rot or {})
    offsets = dict(loc or {})
    if right is not None:
        aim_arm(rotations, "R", *right)
    for side, (forward, lift, pitch) in (feet or {}).items():
        plant_leg(rotations, offsets, side, forward, lift, pitch)
    return rotations, offsets


def make_action(name, keys, cyclic):
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    slot = action.slots.new(id_type="OBJECT", name="Bulwark")
    strip = action.layers.new("Layer").strips.new(type="KEYFRAME")
    bag = strip.channelbag(slot, ensure=True)
    for bone in NAMES:
        quats = []
        for _, rotations, _, _ in keys:
            q = local_rotation(bone, rotations.get(bone, (0.0, 0.0, 0.0)))
            if quats and q.dot(quats[-1]) < 0:
                q.negate()
            quats.append(q)
        channels = [("rotation_quaternion", 4, [tuple(q) for q in quats])]
        if bone in MOVERS:
            channels.append(("location", 3, [tuple(local_offset(bone, offsets.get(bone, (0.0, 0.0, 0.0)))) for _, _, offsets, _ in keys]))
        for prop, size, values in channels:
            for index in range(size):
                curve = bag.fcurves.new(f'pose.bones["{bone}"].{prop}', index=index, group_name=bone)
                for (frame, _, _, interpolation), value in zip(keys, values):
                    point = curve.keyframe_points.insert(frame, value[index], options={"FAST"})
                    point.interpolation = interpolation
                curve.update()
    action.use_frame_range = True
    action.frame_start = keys[0][0]
    action.frame_end = keys[-1][0]
    action.use_cyclic = cyclic
    return action, slot


def sampled(frames, shape):
    return [(f, *shape(f / frames), "LINEAR") for f in range(frames + 1)]


def key(frame, shaped, interpolation="BEZIER"):
    return (frame, *shaped, interpolation)


def idle(t):
    s, s2 = math.sin(TAU * t), math.sin(2 * TAU * t)
    return pose(
        rot={
            "hips": (0.0, 1.0 * s, 0.0),
            "spine": (1.0 + 0.8 * s2, -1.2 * s, 1.2 * math.sin(TAU * t + 1.0)),
            "head": (-0.6 * s2, 0.8 * s, 3.0 * math.sin(TAU * t + 0.4)),
            "upper_arm.R": (-1.5 * s2, 0.0, 0.0),
            "forearm.R": (2.0 * math.sin(2 * TAU * t + 0.6), 0.0, 0.0),
            "upper_arm.L": (0.8 * s2, 0.0, 0.0),
            "cape": (3.0 + 2.0 * math.sin(TAU * t + 1.2), 0.0, 1.5 * s),
        },
        loc={"hips": (0.01 * s, 0.0, -0.004 * (1 - math.cos(2 * TAU * t)) / 2), "spine": (0.0, 0.0, 0.004 * s2)},
    )


def stride(phase):
    swing = max(0.0, math.cos(phase))
    return (-0.13 * math.sin(phase), 0.11 * swing, 20.0 * swing)


def run(t):
    phase = TAU * t
    s = math.sin(phase)
    return pose(
        rot={
            "hips": (0.0, 0.0, -7.0 * s),
            "spine": (10.0 + 2.0 * math.cos(2 * phase), 0.0, 9.0 * s),
            "head": (-9.0 - 2.0 * math.cos(2 * phase), 0.0, -5.0 * s),
            "upper_arm.R": (-10.0 * s, 0.0, 0.0),
            "forearm.R": (6.0 * s, 0.0, 0.0),
            "upper_arm.L": (-16.0 + 4.0 * s, 0.0, 0.0),
            "cape": (22.0 + 6.0 * math.sin(2 * phase + 1.0), 0.0, 4.0 * s),
        },
        loc={"hips": (0.0, 0.0, -0.045 + 0.025 * s * s)},
        feet={"L": stride(phase), "R": stride(phase + math.pi)},
    )


def victory(t):
    pump = (1 - math.cos(2 * TAU * t)) / 2
    s = math.sin(TAU * t)
    return pose(
        rot={
            "spine": (-8.0 - 4.0 * pump, 0.0, -6.0),
            "head": (-14.0 - 6.0 * pump, 0.0, 6.0),
            "upper_arm.L": (-10.0, -4.0, 0.0),
            "cape": (6.0 + 4.0 * s, 0.0, 3.0 * s),
        },
        loc={"hips": (0.0, 0.0, -0.015 * pump)},
        right=(mix((-0.85, 0.05, 0.35), (-0.55, 0.05, 0.83), pump), (0.15, 0.1, 0.98), (0.05, 0.1, 0.99)),
    )


ATTACK = [
    key(0, pose()),
    key(5, pose(
        rot={"spine": (-8.0, 0.0, -18.0), "hips": (0.0, 0.0, -5.0), "head": (4.0, 0.0, 12.0), "upper_arm.L": (-6.0, 0.0, 0.0)},
        loc={"hips": (0.0, 0.01, -0.01)},
        right=((-0.75, 0.15, 0.45), (0.1, 0.35, 0.93), (0.0, 0.75, 0.66)),
    ), "QUAD"),
    key(8, pose(
        rot={"spine": (18.0, 0.0, 16.0), "hips": (0.0, 0.0, 6.0), "head": (-8.0, 0.0, -10.0), "upper_arm.L": (-27.0, -10.0, 8.0)},
        loc={"hips": (0.0, -0.03, -0.06)},
        right=((-0.35, -0.75, -0.55), (-0.05, -0.85, -0.5), (0.1, -0.9, -0.42)),
    )),
    key(11, pose(
        rot={"spine": (14.0, 0.0, 14.0), "hips": (0.0, 0.0, 5.0), "head": (-6.0, 0.0, -8.0), "upper_arm.L": (-18.0, -8.0, 6.0)},
        loc={"hips": (0.0, -0.025, -0.05)},
        right=((-0.4, -0.72, -0.45), (-0.05, -0.85, -0.3), (0.1, -0.9, -0.2)),
    )),
    key(20, pose()),
]

CAST = [
    key(0, pose()),
    key(7, pose(
        rot={"spine": (-10.0, 0.0, -10.0), "head": (-14.0, 0.0, 6.0), "upper_arm.L": (-10.0, 0.0, 0.0)},
        loc={"hips": (0.0, 0.0, -0.005)},
        right=((-0.8, 0.0, 0.6), (0.2, 0.2, 0.96), (0.15, 0.3, 0.94)),
    ), "QUAD"),
    key(12, pose(
        rot={"spine": (10.0, 0.0, 14.0), "head": (6.0, 0.0, -6.0), "upper_arm.L": (-18.0, 0.0, -6.0)},
        loc={"hips": (0.0, -0.01, -0.04)},
        right=((-0.15, -0.93, 0.33), (0.59, -0.73, 0.34), (0.92, 0.18, 0.34)),
    )),
    key(15, pose(
        rot={"spine": (6.0, 0.0, 10.0), "head": (-2.0, 0.0, -4.0), "upper_arm.L": (-14.0, 0.0, -4.0)},
        loc={"hips": (0.0, 0.0, -0.03)},
        right=((-0.2, -0.9, 0.38), (0.5, -0.7, 0.5), (0.72, 0.12, 0.68)),
    )),
    key(24, pose()),
]

HIT = [
    key(0, pose()),
    key(2, pose(
        rot={
            "spine": (-10.0, 0.0, 6.0), "head": (-14.0, 0.0, 8.0), "upper_arm.L": (6.0, 0.0, 0.0),
            "upper_arm.R": (8.0, 10.0, 0.0), "forearm.R": (-10.0, 0.0, 0.0), "cape": (-10.0, 0.0, 0.0),
        },
        loc={"hips": (0.0, 0.03, -0.012)},
    )),
    key(5, pose(rot={"spine": (-4.0, 0.0, 2.0), "head": (-5.0, 0.0, 3.0), "cape": (-4.0, 0.0, 0.0)}, loc={"hips": (0.0, 0.012, -0.005)})),
    key(9, pose()),
]

FALLEN = dict(
    rot={
        "root": (-90.0, 0.0, 0.0),
        "thigh.L": (15.0, 0.0, 0.0), "thigh.R": (10.0, 0.0, 6.0), "shin.L": (8.0, 0.0, 0.0), "shin.R": (20.0, 0.0, 0.0),
        "foot.L": (-10.0, 0.0, 0.0), "foot.R": (-10.0, 0.0, 0.0),
        "spine": (-4.0, 0.0, 0.0), "head": (-12.0, 0.0, 25.0),
        "upper_arm.L": (0.0, -10.0, 0.0), "cape": (175.0, 0.0, 0.0),
    },
    loc={"root": (0.0, 0.0, 0.36)},
    right=((-0.85, 0.45, 0.25), (-0.8, 0.5, 0.3), (-0.35, 0.1, 0.93)),
    feet=None,
)

DEATH = [
    key(0, pose()),
    key(4, pose(
        rot={"spine": (-14.0, 0.0, 8.0), "head": (-20.0, 0.0, 10.0), "upper_arm.L": (6.0, 0.0, 0.0), "cape": (-12.0, 0.0, 0.0)},
        loc={"hips": (0.0, 0.035, -0.01)},
        right=((-0.8, 0.15, -0.3), (-0.2, 0.2, 0.95), (-0.2, 0.35, 0.9)),
    )),
    key(12, pose(
        rot={"spine": (18.0, 0.0, 10.0), "head": (15.0, 0.0, 12.0), "upper_arm.L": (-40.0, -8.0, 0.0), "cape": (-6.0, 0.0, 0.0)},
        loc={"hips": (0.0, 0.05, -0.2)},
        right=((-0.6, -0.3, -0.74), (-0.2, -0.6, -0.77), (0.05, -0.75, -0.66)),
    )),
    key(16, pose(
        rot={
            "root": (-12.0, 0.0, 0.0), "spine": (10.0, 0.0, 8.0), "head": (2.0, 0.0, 10.0),
            "upper_arm.L": (-25.0, -12.0, 0.0), "cape": (20.0, 0.0, 0.0),
        },
        loc={"hips": (0.0, 0.04, -0.17), "root": (0.0, 0.0, 0.03)},
        right=((-0.85, -0.1, -0.2), (-0.3, 0.0, 0.95), (-0.2, 0.2, 0.96)),
    )),
    key(20, pose(
        rot={
            "root": (-30.0, 0.0, 0.0),
            "spine": (0.0, 0.0, 6.0), "head": (-10.0, 0.0, 10.0), "upper_arm.L": (0.0, -20.0, 0.0), "cape": (60.0, 0.0, 0.0),
        },
        loc={"hips": (0.0, 0.03, -0.12), "root": (0.0, 0.0, 0.1)},
        right=((-0.9, 0.1, 0.4), (-0.3, 0.3, 0.9), (-0.2, 0.5, 0.84)),
    ), "LINEAR"),
    key(26, pose(**FALLEN)),
    key(29, pose(**{**FALLEN, "rot": {**FALLEN["rot"], "root": (-84.0, 0.0, 0.0), "head": (-18.0, 0.0, 25.0), "cape": (160.0, 0.0, 0.0)}, "loc": {"root": (0.0, 0.0, 0.38)}})),
    key(32, pose(**FALLEN)),
    key(36, pose(**FALLEN)),
]

CLIPS = {
    "idle": (sampled(90, idle), True),
    "run": (sampled(21, run), True),
    "attack": (ATTACK, False),
    "cast": (CAST, False),
    "hit": (HIT, False),
    "death": (DEATH, False),
    "victory": (sampled(75, victory), True),
}
ACTIONS = {name: make_action(name, keys, cyclic) for name, (keys, cyclic) in CLIPS.items()}

vertex_group = [v.groups[0].group if len(v.groups) == 1 else -1 for v in body.data.vertices]
group_names = [g.name for g in body.vertex_groups]
rest = [v.co.copy() for v in body.data.vertices]
mace_length = (Vector(MACE[1]) - Vector(MACE[0])).length
mace_head = [
    i for i in range(len(rest))
    if group_names[vertex_group[i]] == "hand.R" and (rest[i] - Vector(MACE[0])).dot(MACE_AXIS) > mace_length + 0.03
]
rim = max(range(len(rest)), key=lambda i: rest[i].z if group_names[vertex_group[i]] == "hand.L" else -9.0)


def evaluate(action, slot, frame):
    rig.animation_data.action = action
    rig.animation_data.action_slot = slot
    scene.frame_set(frame)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    points = [v.co.copy() for v in mesh.vertices]
    evaluated.to_mesh_clear()
    return points


def spread(a, b):
    return max((p - q).length for p, q in zip(a, b))


def centre(points, indices):
    return sum((points[i] for i in indices), Vector()) / len(indices)


def lowest_by_group(points):
    low = {}
    for i, p in enumerate(points):
        name = group_names[vertex_group[i]]
        low[name] = min(low.get(name, 9.0), p.z)
    return low


report = {
    "bones": len(armature.bones),
    "groups_without_bone": [g for g in group_names if g not in armature.bones],
    "unweighted": vertex_group.count(-1),
    "clips": {},
}
for name, (action, slot) in ACTIONS.items():
    start, end = int(action.frame_start), int(action.frame_end)
    frames = [evaluate(action, slot, f) for f in range(start, end + 1)]
    worst = {}
    below = 0
    for points in frames:
        low = lowest_by_group(points)
        if min(z for g, z in low.items() if g != "cape") < -0.01:
            below += 1
        for g, z in low.items():
            worst[g] = min(worst.get(g, 9.0), z)
    clip = {
        "seconds": round((end - start) / FPS, 3),
        "frames_below_ground": below,
        "lowest": {k: round(v, 3) for k, v in sorted(worst.items(), key=lambda kv: kv[1])[:5]},
        "first_last_gap": round(spread(frames[0], frames[-1]), 4),
        "last_vs_rest": round(spread(frames[-1], rest), 4),
    }
    heads = [centre(points, mace_head) for points in frames]
    clip["mace_top"] = round(max(h.z for h in heads), 3)
    if name == "attack":
        clip["mace_lowest_frame"] = min(range(len(heads)), key=lambda f: heads[f].z)
        clip["mace_forward_frame"] = min(range(len(heads)), key=lambda f: heads[f].y)
        clip["mace_at_hit"] = [round(c, 3) for c in heads[8]]
    if name == "cast":
        gaps = [(heads[f] - frames[f][rim]).length for f in range(len(frames))]
        clip["mace_to_rim_closest_frame"] = min(range(len(gaps)), key=gaps.__getitem__)
        clip["mace_to_rim_closest"] = round(min(gaps), 3)
    if name == "death":
        clip["tail_motion"] = round(spread(frames[-5], frames[-1]), 4)
        clip["final_top"] = round(max(p.z for p in frames[-1]), 3)
        clip["per_frame_low"] = [round(min(z for g, z in lowest_by_group(points).items() if g != "cape"), 3) for points in frames]
        clip["final_lowest"] = {k: round(v, 3) for k, v in sorted(lowest_by_group(frames[-1]).items(), key=lambda kv: kv[1])[:6]}
    report["clips"][name] = clip


def look_at(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


if RENDER:
    import numpy as np

    ground_mat = bpy.data.materials.new("preview_ground")
    ground_mat.diffuse_color = (0.18, 0.17, 0.26, 1.0)
    ground_mesh = bpy.data.meshes.new("preview_ground")
    ground_mesh.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [], [(0, 1, 2, 3)])
    ground_mesh.materials.append(ground_mat)
    ground = bpy.data.objects.new("preview_ground", ground_mesh)
    scene.collection.objects.link(ground)
    camera = bpy.data.objects.new("preview_camera", bpy.data.cameras.new("preview_camera"))
    scene.collection.objects.link(camera)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 3.4
    scene.camera = camera
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.render.resolution_x = 240
    scene.render.resolution_y = 240
    views = [((-5.0, 0.4, 0.9), (0.0, 0.4, 0.8)), ((-3.2, -4.0, 3.4), (0.0, 0.3, 0.7))]
    picks = {
        "idle": [0, 11, 22, 34, 45, 56, 68, 79],
        "run": [0, 3, 5, 8, 11, 13, 16, 18],
        "attack": [0, 3, 5, 7, 8, 10, 12, 16],
        "cast": [0, 4, 7, 10, 12, 15, 19, 24],
        "hit": [0, 1, 2, 3, 4, 5, 7, 9],
        "death": [0, 4, 12, 20, 24, 26, 29, 36],
        "victory": [0, 9, 19, 28, 37, 47, 56, 66],
    }
    wanted = [a for a in sys.argv if a in picks] or list(picks)
    size = 240
    for name in wanted:
        frames = picks[name]
        action, slot = ACTIONS[name]
        rig.animation_data.action = action
        rig.animation_data.action_slot = slot
        sheet = np.ones((len(views) * size, len(frames) * size, 4), dtype=np.float32)
        for row, (location, target) in enumerate(views):
            camera.location = location
            look_at(camera, target)
            for column, frame in enumerate(frames):
                scene.frame_set(frame)
                path = f"{OUT}/frames/{name}_{row}_{column}.png"
                scene.render.filepath = path
                bpy.ops.render.render(write_still=True)
                image = bpy.data.images.load(path)
                pixels = np.empty(size * size * 4, dtype=np.float32)
                image.pixels.foreach_get(pixels)
                bpy.data.images.remove(image)
                top = (len(views) - 1 - row) * size
                sheet[top:top + size, column * size:(column + 1) * size] = pixels.reshape(size, size, 4)
        out = bpy.data.images.new(f"sheet_{name}", len(frames) * size, len(views) * size, alpha=True)
        out.pixels.foreach_set(sheet.ravel())
        out.filepath_raw = f"{OUT}/sheet_{name}.png"
        out.file_format = "PNG"
        out.save()
        bpy.data.images.remove(out)
    for thing in (ground, camera):
        bpy.data.objects.remove(thing, do_unlink=True)
    bpy.data.meshes.remove(ground_mesh)
    bpy.data.materials.remove(ground_mat)

idle_action, idle_slot = ACTIONS["idle"]
rig.animation_data.action = idle_action
rig.animation_data.action_slot = idle_slot
scene.frame_start = 0
scene.frame_end = 90
scene.frame_set(0)

for thing in scene.objects:
    thing.select_set(thing in (rig, body))
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=f"{OUT}/bulwark.glb",
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_anim_single_armature=True,
    export_force_sampling=True,
    export_frame_step=1,
    export_anim_slide_to_zero=True,
    export_optimize_animation_size=False,
    export_reset_pose_bones=True,
    export_skins=True,
    export_morph=False,
    export_yup=True,
    export_apply=False,
    export_cameras=False,
    export_lights=False,
)
bpy.ops.wm.save_as_mainfile(filepath=f"{OUT}/bulwark_rigged.blend")
print("RESULT " + json.dumps(report))
