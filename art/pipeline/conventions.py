import math
import os
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Vector

REPO = Path(__file__).resolve().parents[2]
SOURCE_ROOT = REPO / "art" / "models"
RUNTIME_ROOT = REPO / "apps" / "client" / "public" / "assets" / "models"
KINDS = ("heroes", "props", "board")
STAGE = "stage"
FPS = 30
FOOTPRINT_RADIUS = 0.5
HERO_HEIGHT = 1.8
GAME_PITCH_DEGREES = 56
GAME_FIELD_OF_VIEW_DEGREES = 30

GLTF_SETTINGS = {
    "export_format": "GLB",
    "export_yup": True,
    "export_apply": True,
    "export_texcoords": True,
    "export_normals": True,
    "export_tangents": False,
    "export_materials": "EXPORT",
    "export_image_format": "AUTO",
    "export_vertex_color": "MATERIAL",
    "export_cameras": False,
    "export_lights": False,
    "export_extras": False,
    "export_animations": True,
    "export_animation_mode": "ACTIONS",
    "export_anim_single_armature": True,
    "export_nla_strips": False,
    "export_force_sampling": True,
    "export_frame_step": 1,
    "export_anim_slide_to_zero": True,
    "export_optimize_animation_size": True,
    "export_optimize_animation_keep_anim_armature": True,
    "export_meshopt_compression_enable": True,
    "export_meshopt_extension": "EXT_meshopt_compression",
    "export_reset_pose_bones": True,
    "export_rest_position_armature": True,
    "export_skins": True,
    "export_influence_nb": 4,
    "export_morph": False,
    "export_leaf_bone": False,
    "export_def_bones": False,
}


def asset_of(blend_path):
    path = Path(blend_path).resolve()
    relative = path.relative_to(SOURCE_ROOT)

    if len(relative.parts) != 2 or path.suffix != ".blend" or relative.parts[0] not in KINDS:
        raise ValueError(f"{path} is not art/models/<{'|'.join(KINDS)}>/<id>.blend")

    return relative.parts[0], path.stem


def runtime_path(kind, asset_id):
    return RUNTIME_ROOT / kind / f"{asset_id}.glb"


def blend_relative(target, blend_path):
    return "//" + Path(os.path.relpath(target, Path(blend_path).resolve().parent)).as_posix()


def configure_exporter(collection, kind, asset_id, blend_path):
    for exporter in list(collection.exporters):
        collection.exporters.remove(exporter)

    exporter = collection.exporters.new("IO_FH_gltf2", name="glTF 2.0")
    exporter.filepath = blend_relative(runtime_path(kind, asset_id), blend_path)
    properties = exporter.export_properties

    for key, value in GLTF_SETTINGS.items():
        setattr(properties, key, value)

    return exporter


def prepare_scene(scene, name, frame_start=0, frame_end=120):
    scene.name = name
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.frame_start = frame_start
    scene.frame_end = frame_end
    scene.frame_current = frame_start

    world = bpy.data.worlds.get(STAGE) or bpy.data.worlds.new(STAGE)
    world.color = (0.035, 0.035, 0.045)
    scene.world = world


def ensure_collection(scene, name):
    collection = bpy.data.collections.get(name) or bpy.data.collections.new(name)

    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)

    return collection


def guide_material():
    material = bpy.data.materials.get("stage_guide") or bpy.data.materials.new("stage_guide")
    material.diffuse_color = (0.89, 0.74, 0.36, 1.0)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (0.89, 0.74, 0.36, 1.0)
    emission.inputs["Strength"].default_value = 1.0
    output = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])

    return material


def guide_object(collection, name, fill):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    fill(bm)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(guide_material())
    obj = bpy.data.objects.new(name, mesh)
    obj.hide_render = True
    obj.hide_select = True
    collection.objects.link(obj)

    return obj


def ring(radius, z, width=0.014, segments=96):
    def fill(bm):
        inner = []
        outer = []

        for index in range(segments):
            angle = math.tau * index / segments
            direction = Vector((math.cos(angle), math.sin(angle), 0.0))
            inner.append(bm.verts.new(direction * (radius - width / 2) + Vector((0, 0, z))))
            outer.append(bm.verts.new(direction * (radius + width / 2) + Vector((0, 0, z))))

        for index in range(segments):
            following = (index + 1) % segments
            bm.faces.new((inner[index], outer[index], outer[following], inner[following]))

    return fill


def front_arrow(bm):
    z = 0.002
    shaft = [(-0.018, -0.56), (0.018, -0.56), (0.018, -0.74), (-0.018, -0.74)]
    head = [(-0.07, -0.74), (0.07, -0.74), (0.0, -0.86)]
    bm.faces.new([bm.verts.new((x, y, z)) for x, y in shaft])
    bm.faces.new([bm.verts.new((x, y, z)) for x, y in head])


def build_stage(scene, target=(0.0, 0.0, 0.9), distance=6.0):
    collection = ensure_collection(scene, STAGE)

    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    guide_object(collection, "stage_footprint", ring(FOOTPRINT_RADIUS, 0.002))
    guide_object(collection, "stage_height", ring(0.18, HERO_HEIGHT, width=0.01, segments=48))
    guide_object(collection, "stage_front", front_arrow)

    camera_data = bpy.data.cameras.new("stage_camera")
    camera_data.angle = math.radians(GAME_FIELD_OF_VIEW_DEGREES)
    camera = bpy.data.objects.new("stage_camera", camera_data)
    pitch = math.radians(GAME_PITCH_DEGREES)
    focus = Vector(target)
    camera.location = focus + Vector((0.0, -distance * math.cos(pitch), distance * math.sin(pitch)))
    camera.rotation_euler = Euler((math.pi / 2 - pitch, 0.0, 0.0))
    collection.objects.link(camera)
    scene.camera = camera

    sun_data = bpy.data.lights.new("stage_sun", "SUN")
    sun_data.energy = 3.0
    sun_data.angle = math.radians(8)
    sun = bpy.data.objects.new("stage_sun", sun_data)
    sun.location = (2.0, -2.0, 4.0)
    sun.rotation_euler = Euler((math.radians(40), math.radians(18), math.radians(28)))
    collection.objects.link(sun)

    return collection


def frame_viewport(target=(0.0, 0.0, 0.9), distance=5.0):
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != "VIEW_3D":
                continue

            space = area.spaces.active
            space.shading.type = "MATERIAL"
            space.overlay.show_relationship_lines = False
            view = space.region_3d
            view.view_perspective = "PERSP"
            view.view_location = target
            view.view_rotation = Euler((math.radians(64), 0.0, math.radians(-28))).to_quaternion()
            view.view_distance = distance


def add_markers(scene, markers):
    scene.timeline_markers.clear()

    for frame, name in markers:
        scene.timeline_markers.new(name, frame=frame)
