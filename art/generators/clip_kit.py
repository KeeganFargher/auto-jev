import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))

from conventions import add_markers, build_stage, configure_exporter, ensure_collection, frame_viewport, prepare_scene

from bake_kit import render_camera, shoot

TAU = math.tau

SHEET_ORDER = ("idle", "run", "attack", "cast", "hit", "death", "victory", "channel")


def turn(value):
    if isinstance(value, Quaternion):
        return value

    return Euler(tuple(math.radians(a) for a in value), "XYZ").to_quaternion()


def frame_of(a, b):
    a = Vector(a).normalized()
    b = Vector(b)
    b = (b - b.dot(a) * a).normalized()

    return Matrix((a, b, a.cross(b))).transposed()


def aim(rest_a, rest_b, a, b):
    return (frame_of(a, b) @ frame_of(rest_a, rest_b).transposed()).to_quaternion()


def wrap_angle(angle):
    return (angle + math.pi) % TAU - math.pi


def blend(a, b, t):
    return {key: tuple(x + (y - x) * t for x, y in zip(a[key], b[key])) for key in a}


def smooth(t):
    t = min(max(t, 0.0), 1.0)

    return t * t * (3 - 2 * t)


def keyed(keys, f):
    for (f0, p0), (f1, p1) in zip(keys, keys[1:]):
        if f <= f1:
            return blend(p0, p1, smooth((f - f0) / (f1 - f0)) if f1 > f0 else 1.0)

    return dict(keys[-1][1])


def mirrored(values):
    result = {}

    for key, value in values.items():
        result[f"L.{key}"] = value
        result[f"R.{key}"] = (-value[0], value[1], value[2])

    return result


def swing(vector, degrees):
    return tuple(Matrix.Rotation(math.radians(degrees), 3, "X") @ Vector(vector))


def sample(resolve, params, count):
    return [(f, *resolve(params(f))) for f in range(count + 1)]


class Poser:
    def __init__(self, rig, hands, legs=None):
        bones = rig.data.bones
        self.names = [bone.name for bone in bones]
        self.rest = {bone.name: bone.matrix_local.to_3x3() for bone in bones}
        self.heads = {bone.name: bone.head_local.copy() for bone in bones}
        tails = {bone.name: bone.tail_local.copy() for bone in bones}
        self.rest_dir = {name: (tails[name] - self.heads[name]).normalized() for name in self.names}
        self.hands = {tag: (Vector(a), Vector(b)) for tag, (a, b) in hands.items()}
        self.legs = legs or {
            tag: (self.heads[f"thigh.{tag}"], self.heads[f"shin.{tag}"], self.heads[f"foot.{tag}"]) for tag in hands
        }

    def local_rotation(self, bone, value):
        rest = self.rest[bone]

        return (rest.inverted() @ turn(value).to_matrix() @ rest).to_quaternion()

    def aim_arm(self, rotations, tag, upper, fore, grip, facing):
        world_upper = self.rest_dir[f"upper_arm.{tag}"].rotation_difference(Vector(upper).normalized())
        world_fore = self.rest_dir[f"forearm.{tag}"].rotation_difference(Vector(fore).normalized())
        rest_grip, rest_facing = self.hands[tag]
        world_hand = aim(rest_grip, rest_facing, grip, facing)
        rotations[f"upper_arm.{tag}"] = world_upper
        rotations[f"forearm.{tag}"] = world_upper.inverted() @ world_fore
        rotations[f"hand.{tag}"] = world_fore.inverted() @ world_hand

    def plant_leg(self, rotations, offsets, tag, foot):
        hip, knee, ankle = (Vector(point) for point in self.legs[tag])
        target = ankle + Vector((0.0, foot[0], foot[1]))
        hips_turn = turn(rotations.get("hips", (0.0, 0.0, 0.0)))
        joint = self.heads["hips"] + Vector(offsets.get("hips", (0.0, 0.0, 0.0))) + hips_turn @ (hip - self.heads["hips"])
        thigh_vec, shin_vec = knee - hip, ankle - knee
        l1, l2 = math.hypot(thigh_vec.y, thigh_vec.z), math.hypot(shin_vec.y, shin_vec.z)
        span = math.hypot(target.y - joint.y, target.z - joint.z)
        span = min(max(span, abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4)
        aim_angle = math.atan2(target.z - joint.z, target.y - joint.y)
        bend = math.acos((l1 * l1 + span * span - l2 * l2) / (2 * l1 * span))
        thigh_angle = aim_angle - bend
        knee_y, knee_z = joint.y + l1 * math.cos(thigh_angle), joint.z + l1 * math.sin(thigh_angle)
        shin_angle = math.atan2(target.z - knee_z, target.y - knee_y)
        thigh = wrap_angle(thigh_angle - math.atan2(thigh_vec.z, thigh_vec.y))
        shin = wrap_angle(shin_angle - math.atan2(shin_vec.z, shin_vec.y))
        rotations[f"thigh.{tag}"] = hips_turn.inverted() @ Quaternion((1.0, 0.0, 0.0), thigh)
        rotations[f"shin.{tag}"] = Quaternion((1.0, 0.0, 0.0), shin - thigh)
        rotations[f"foot.{tag}"] = Quaternion((1.0, 0.0, 0.0), -shin + math.radians(foot[2] if len(foot) > 2 else 0.0))

    def action(self, name, frames, slot_name, located=("root", "hips"), scaled=()):
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        slot = action.slots.new(id_type="OBJECT", name=slot_name)
        bag = action.layers.new("Layer").strips.new(type="KEYFRAME").channelbag(slot, ensure=True)

        for bone in self.names:
            quats = []

            for _, rotations, _, _ in frames:
                q = self.local_rotation(bone, rotations.get(bone, (0.0, 0.0, 0.0)))

                if quats and q.dot(quats[-1]) < 0:
                    q.negate()

                quats.append(q)

            channels = [("rotation_quaternion", [tuple(q) for q in quats])]

            if bone in located:
                channels.append(
                    (
                        "location",
                        [tuple(self.rest[bone].inverted() @ Vector(offsets.get(bone, (0.0, 0.0, 0.0)))) for _, _, offsets, _ in frames],
                    )
                )

            if bone in scaled:
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


def bind(low, rig):
    low.parent = rig
    low.matrix_parent_inverse = rig.matrix_world.inverted()
    modifier = low.modifiers.new("armature", "ARMATURE")
    modifier.object = rig
    rig.animation_data_create()


def body_points(low):
    evaluated = low.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", points)
    evaluated.to_mesh_clear()
    matrix = np.array(low.matrix_world)

    return points.reshape(-1, 3) @ matrix[:3, :3].T + matrix[:3, 3]


def play(rig, action, slot, frame):
    rig.animation_data.action = action
    rig.animation_data.action_slot = slot
    bpy.context.scene.frame_set(frame)


def groups_of(low):
    names = {group.index: group.name for group in low.vertex_groups}

    return [names[max(vertex.groups, key=lambda g: g.weight).group] if vertex.groups else "" for vertex in low.data.vertices]


def clip_stats(rig, low, groups, action, slot, count, loops):
    lows = []
    first = last = None

    for f in range(count + 1):
        play(rig, action, slot, f)
        points = body_points(low)
        lows.append(float(points[:, 2].min()))

        if f == 0:
            first = points

        if f == count:
            last = points

    worst = int(np.argmin(lows))
    play(rig, action, slot, worst)
    points = body_points(low)
    stats = {
        "frames_below": sum(1 for z in lows if z < -0.015),
        "lowest": round(lows[worst], 3),
        "lowest_frame": worst,
        "lowest_bone": groups[int(np.argmin(points[:, 2]))],
    }

    if loops:
        stats["loop_gap"] = round(float(np.abs(first - last).max()), 4)
    else:
        stats["end_top"] = round(float(last[:, 2].max()), 3)
        stats["end_top_bone"] = groups[int(np.argmax(last[:, 2]))]
        stats["end_low"] = round(float(last[:, 2].min()), 3)

    return stats


def clip_sheet(rig, low, actions, lengths, path, out, columns=6, size=260):
    scene = bpy.context.scene

    for obj in scene.objects:
        obj.hide_render = obj is not low

    camera = render_camera()
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x = scene.render.resolution_y = size
    rows = []
    frame_path = out / "frames" / "clip.png"

    for name in (name for name in SHEET_ORDER if name in actions):
        action, slot = actions[name]
        count = lengths[name]
        tiles = []

        for column in range(columns):
            frame = round(count * column / (columns - 1))
            play(rig, action, slot, frame)
            shoot(camera, (-3.1, -4.9, 2.6), (0.0, 0.0, 0.8), frame_path, (size, size), lens=42)
            image = bpy.data.images.load(str(frame_path), check_existing=False)
            tiles.append(np.array(image.pixels[:], dtype=np.float32).reshape(size, size, 4))
            bpy.data.images.remove(image)

        rows.append(np.concatenate(tiles, axis=1))

    sheet = np.concatenate(rows[::-1], axis=0)
    image = bpy.data.images.new("clip_sheet", sheet.shape[1], sheet.shape[0])
    image.pixels.foreach_set(sheet.ravel())
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()


def showreel(rig, actions, reel):
    rig.animation_data.action = None

    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)

    track = rig.animation_data.nla_tracks.new()
    track.name = "Showreel"
    start = 0
    markers = []

    for index, (name, repeat) in enumerate(reel):
        action, slot = actions[name]
        strip = track.strips.new(name, start, action)
        strip.action_slot = slot
        strip.repeat = repeat
        strip.extrapolation = "HOLD" if index == 0 else "HOLD_FORWARD"
        markers.append((start, name))
        start = int(strip.frame_end) + 12

    return markers, start


def finish(recipe, rig, low, actions, reel):
    scene = bpy.context.scene
    keep = {rig, low}

    for obj in list(bpy.data.objects):
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)

    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)

    for action in list(bpy.data.actions):
        if action.name not in actions:
            bpy.data.actions.remove(action)

    for world in list(bpy.data.worlds):
        if world.name != "stage":
            bpy.data.worlds.remove(world)

    rig.name = f"{recipe.id}_rig"
    rig.data.name = f"{recipe.id}_rig"
    prepare_scene(scene, recipe.id, 0, 0)
    collection = ensure_collection(scene, recipe.id)

    for obj in (rig, low):
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)

        collection.objects.link(obj)

    markers, end = showreel(rig, actions, reel)
    scene.frame_end = end
    build_stage(scene, target=(0.0, 0.0, 1.0), distance=7.2)
    frame_viewport(target=(0.0, 0.0, 1.0), distance=6.0)
    add_markers(scene, markers)
    configure_exporter(collection, "heroes", recipe.id, recipe.target)

    for material in bpy.data.materials:
        if material.users == 0:
            bpy.data.materials.remove(material)

    for image in bpy.data.images:
        if image.users == 0:
            bpy.data.images.remove(image)

    recipe.target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(recipe.target), compress=True)
