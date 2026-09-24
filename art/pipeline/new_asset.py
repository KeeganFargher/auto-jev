import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

from conventions import KINDS, SOURCE_ROOT, build_stage, configure_exporter, ensure_collection, frame_viewport, prepare_scene

arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []

if len(arguments) != 2 or arguments[0] not in KINDS:
    print(f"JEV_NEW_ERROR usage: -- <{'|'.join(KINDS)}> <id>")
    sys.exit(1)

kind, asset_id = arguments
path = SOURCE_ROOT / kind / f"{asset_id}.blend"

if path.exists():
    print(f"JEV_NEW_ERROR {path} already exists")
    sys.exit(1)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
prepare_scene(scene, asset_id)
collection = ensure_collection(scene, asset_id)
build_stage(scene)
configure_exporter(collection, kind, asset_id, path)
frame_viewport()
path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)
print(f"JEV_NEW {path}")
