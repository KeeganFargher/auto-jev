import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

from conventions import GLTF_SETTINGS, asset_of


def fail(message):
    print("JEV_EXPORT_ERROR " + message)
    sys.exit(1)


arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []

if len(arguments) != 1:
    fail("usage: Blender --background <asset.blend> --python export.py -- <out.glb>")

output = Path(arguments[0]).resolve()
kind, asset_id = asset_of(bpy.data.filepath)
collection = bpy.data.collections.get(asset_id)

if collection is None:
    fail(f"{bpy.data.filepath} has no collection named '{asset_id}' to export")

objects = list(collection.all_objects)
armatures = [obj for obj in objects if obj.type == "ARMATURE"]
meshes = [obj for obj in objects if obj.type == "MESH"]

if not meshes:
    fail(f"collection '{asset_id}' has no meshes")

if kind == "heroes" and len(armatures) != 1:
    fail(f"hero '{asset_id}' needs exactly one armature, found {len(armatures)}")

strays = [obj.name for obj in objects if obj.parent is not None and obj.parent not in objects]

if strays:
    fail(f"objects parented outside '{asset_id}': {', '.join(strays)}")

for obj in objects:
    if obj.animation_data is not None:
        obj.animation_data.action = None

        for track in obj.animation_data.nla_tracks:
            track.mute = True

output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), collection=asset_id, use_selection=False, **GLTF_SETTINGS)

print(
    "JEV_EXPORT "
    + json.dumps(
        {
            "kind": kind,
            "id": asset_id,
            "output": str(output),
            "objects": sorted(obj.name for obj in objects),
            "actions": sorted(action.name for action in bpy.data.actions) if armatures else [],
        }
    )
)
