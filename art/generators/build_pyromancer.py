import json
import os
import sys
import tempfile
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))

from bake_kit import Recipe, bake_texture, blank_image, build_parts, final_materials, high_source, preview, render_camera, render_views, rest_pose, shoot, unwrap, use_gpu

OUT = Path(os.environ.get("ART_OUT") or Path(tempfile.gettempdir()) / "jev-art")
FLAGS = set(sys.argv[sys.argv.index("--") + 1 :]) if "--" in sys.argv else set()
SETTINGS = {flag.split("=")[0]: float(flag.split("=")[1]) for flag in FLAGS if "=" in flag}
HEROES = REPO / "art" / "models" / "heroes"

RECIPE = Recipe(
    id="pyromancer",
    source=REPO / "art" / "explorations" / "cinder-hq.blend",
    target=Path(os.environ.get("ART_TARGET") or HEROES / "pyromancer.blend"),
    hq="cinder_hq",
    rig="Cinder",
    drop=frozenset(
        {
            "cn_pupils",
            "cn_catchlights",
            "cn_lashes",
            "cn_brows",
            "cn_mouth",
            "cn_teeth",
            "cn_freckles",
            "cn_scorch",
            "cn_placket",
            "cn_book_strap",
        }
    ),
    targets={
        "cn_hair_locks": 1400,
        "cn_hair_cap": 300,
        "cn_head": 600,
        "cn_nose": 60,
        "cn_sclera": 64,
        "cn_iris": 40,
        "cn_torso": 480,
        "cn_buttons": 48,
        "cn_collar": 200,
        "cn_mantle": 360,
        "cn_scarf": 220,
        "cn_scarf_tail": 80,
        "cn_belt": 96,
        "cn_buckle": 24,
        "cn_pouch": 60,
        "cn_pouch_flap": 40,
        "cn_book": 60,
        "cn_book_pages": 24,
        "cn_book_brass": 80,
        "cn_skirt": 380,
        "cn_embers": 90,
        "cn_sleeve_upper": 170,
        "cn_sleeve_fore": 130,
        "cn_cuff": 70,
        "cn_hand": 230,
        "cn_thigh": 90,
        "cn_knee": 36,
        "cn_shin": 60,
        "cn_boot": 110,
        "cn_boot_cuff": 70,
        "cn_foot": 90,
        "cn_sole": 40,
        "cn_flame": 300,
    },
    kinds={
        "cn_skin": "skin_soft",
        "cn_sclera": "skin_soft",
        "cn_lash": "paint",
        "cn_catchlight": "paint",
        "cn_hair": "hair",
        "cn_brow": "hair",
        "cn_coat": "cloth",
        "cn_coat_dark": "cloth",
        "cn_mantle": "cloth",
        "cn_trousers": "cloth",
        "cn_paper": "cloth",
        "hq_leather": "leather",
        "cn_leather_dark": "leather",
        "cn_book": "leather",
        "cn_brass": "bronze",
        "cn_soot": "paint",
        "cn_pupil": "paint",
        "cn_mouth": "paint",
        "cn_teeth": "paint",
        "cn_freckle": "paint",
    },
    team="hq_team",
    glow={"cn_iris": "#ff8a2a", "cn_flame": "#fff3b0", "cn_embers": "#ff8a3a"},
    glow_strength=2.0,
    uv_boost={"cn_skin": 3.0, "cn_sclera": 3.0, "cn_iris": 3.0},
    isolate=(
        (
            frozenset({"cn_head", "cn_nose", "cn_sclera", "cn_iris"}),
            frozenset(
                {
                    "cn_head",
                    "cn_nose",
                    "cn_sclera",
                    "cn_iris",
                    "cn_pupils",
                    "cn_catchlights",
                    "cn_lashes",
                    "cn_brows",
                    "cn_mouth",
                    "cn_teeth",
                    "cn_freckles",
                }
            ),
        ),
    ),
    gradients={
        "cn_hair": ("#ffb05a", 1.75, 2.1),
        "cn_coat": ("#1f1a1a", 0.66, 0.46),
        "cn_mantle": ("#1e1512", 1.33, 1.24),
        "cn_flame": ("#ff4a1a", 1.18, 1.44),
    },
)


def report_line():
    print("PYROMANCER " + json.dumps({k: v for k, v in report.items() if k != "parts"}))


assert Path(bpy.data.filepath).resolve() == RECIPE.source.resolve(), f"open {RECIPE.source} first, not {bpy.data.filepath}"
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "frames").mkdir(exist_ok=True)
report = {}

if "preview" in FLAGS:
    rest_pose(bpy.data.objects[RECIPE.rig])
    lineup = [(HEROES / "bulwark.blend", "bulwark", -1.15), (HEROES / "ravager.blend", "ravager", 1.25)]
    preview(high_source(RECIPE), RECIPE, OUT, "cinder_preview", lineup)
    sys.exit(0)

rig, low, high = build_parts(RECIPE, report)

if "lp" in FLAGS:
    print("PYROMANCER " + json.dumps(report))
    sys.exit(0)

unwrap(low, report, RECIPE.uv_boost)

if "nobake" in FLAGS:
    painted = blank_image("pyromancer_paint", (0.5, 0.5, 0.5), RECIPE.texture_size)
else:
    painted = bake_texture(low, high, RECIPE, report, OUT, SETTINGS, "debug" in FLAGS)

final_materials(low, painted, RECIPE)

if "render" in FLAGS:
    render_camera()
    bpy.context.scene.render.engine = "CYCLES"
    use_gpu()
    bpy.context.scene.cycles.samples = 48
    bpy.context.scene.cycles.use_denoising = True
    render_views([low], "pyromancer_low", OUT)
    shoot(render_camera(), (0.6, -1.1, 1.78), (0.02, -0.05, 1.62), OUT / "pyromancer_low_face.png", (720, 720))

report_line()
