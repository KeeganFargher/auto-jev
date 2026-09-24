import json
import math
import os
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))

from bake_kit import Recipe, bake_texture, blank_image, build_parts, final_materials, high_source, preview, render_camera, render_views, rest_pose, shoot, unwrap, use_gpu
from clip_kit import TAU, Poser, bind, blend, body_points, clip_sheet, clip_stats, finish, groups_of, keyed, play, sample, smooth, swing

OUT = Path(os.environ.get("ART_OUT") or Path(tempfile.gettempdir()) / "jev-art")
FLAGS = set(sys.argv[sys.argv.index("--") + 1 :]) if "--" in sys.argv else set()
SETTINGS = {flag.split("=")[0]: float(flag.split("=")[1]) for flag in FLAGS if "=" in flag}
HEROES = REPO / "art" / "models" / "heroes"


def coat_weights(co):
    t = min(max((0.98 - co.z) / 0.54, 0.0), 1.0)
    left = smooth((co.x + 0.07) / 0.14)
    legs = 0.62 * t**1.3
    coat = 0.25 * t
    weights = {"hips": 1.0 - legs - coat, "coat": coat, "thigh.L": legs * left, "thigh.R": legs * (1.0 - left)}
    kept = {bone: weight for bone, weight in weights.items() if weight > 0.004}
    total = sum(kept.values())

    return {bone: weight / total for bone, weight in kept.items()}


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
    weights={"cn_skirt": coat_weights, "cn_embers": coat_weights},
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

if "bake" in FLAGS:
    report_line()
    sys.exit(0)

SIDES = ("L", "R")
POSER = Poser(rig, hands={"L": ((-0.015, -0.095, 0.0), (0.0, 0.0, 1.0)), "R": ((0.0, -0.015, -0.09), (1.0, 0.0, 0.0))})
FLAME = (1.0, 1.0, 1.0)
REST_P = {
    "root": (0.0, 0.0, 0.0),
    "root_off": (0.0, 0.0, 0.0),
    "spine": (0.0, 0.0, 0.0),
    "head": (0.0, 0.0, 0.0),
    "hips": (0.0, 0.0, 0.0),
    "hips_off": (0.0, 0.0, 0.0),
    "coat": (0.0, 0.0, 0.0),
    "coat_scale": (1.0, 1.0, 1.0),
    "flame": FLAME,
    "L.foot": (0.0, 0.0, 0.0),
    "R.foot": (0.0, 0.0, 0.0),
}

for tag in SIDES:
    REST_P[f"{tag}.upper"] = tuple(POSER.rest_dir[f"upper_arm.{tag}"])
    REST_P[f"{tag}.fore"] = tuple(POSER.rest_dir[f"forearm.{tag}"])
    REST_P[f"{tag}.grip"] = tuple(POSER.hands[tag][0].normalized())
    REST_P[f"{tag}.palm"] = tuple(POSER.hands[tag][1])


def resolve(p):
    rotations = {"root": p["root"], "spine": p["spine"], "head": p["head"], "hips": p["hips"], "coat": p["coat"]}
    offsets = {"hips": p["hips_off"], "root": p["root_off"]}

    for tag in SIDES:
        POSER.aim_arm(rotations, tag, p[f"{tag}.upper"], p[f"{tag}.fore"], p[f"{tag}.grip"], p[f"{tag}.palm"])

    for tag in SIDES:
        POSER.plant_leg(rotations, offsets, tag, p[f"{tag}.foot"])

    return rotations, offsets, {"coat": p["coat_scale"], "flame": p["flame"]}


def nudge(vector, offset):
    return tuple((Vector(vector) + Vector(offset)).normalized())


def flicker(t, strength=1.0):
    wobble = 0.06 * math.sin(TAU * 3 * t) + 0.04 * math.sin(TAU * 5 * t + 1.0)
    return (strength * (1.0 - wobble * 0.5), strength * (1.0 - wobble * 0.5), strength * (1.0 + wobble))


def idle_params(t):
    s, s2 = math.sin(TAU * t), math.sin(2 * TAU * t)
    p = dict(REST_P)
    p["spine"] = (3.0 + 1.5 * s2, -1.0 * s, 1.5 * math.sin(TAU * t + 1.0))
    p["head"] = (-3.0 - 1.0 * s2, 0.0, 6.0 * math.sin(TAU * t + 0.4))
    p["hips"] = (0.0, 1.0 * s, 0.0)
    p["hips_off"] = (0.01 * s, 0.0, -0.012 - 0.005 * (1 - math.cos(2 * TAU * t)) / 2)
    p["coat"] = (2.0 + 1.5 * math.sin(TAU * t + 1.2), 0.0, 1.0 * s)
    p["flame"] = flicker(t)
    bob = 0.03 * math.sin(2 * TAU * t + 0.5)
    p["L.upper"] = nudge(REST_P["L.upper"], (0.0, 0.0, bob))
    p["L.fore"] = nudge(REST_P["L.fore"], (0.0, 0.0, bob * 1.5))
    p["R.upper"] = nudge(REST_P["R.upper"], (0.0, bob * 0.6, 0.0))

    return p


IDLE0 = idle_params(0.0)


def run_params(f):
    theta = TAU * f / 20
    p = dict(IDLE0)
    p["spine"] = (13.0 + 2.5 * math.cos(2 * theta), 0.0, 8.0 * math.sin(theta))
    p["head"] = (-11.0, 0.0, -6.0 * math.sin(theta))
    p["hips"] = (0.0, 0.0, -8.0 * math.sin(theta))
    p["hips_off"] = (0.0, -0.02, -0.045 + 0.03 * abs(math.cos(theta)))
    p["coat"] = (18.0 + 6.0 * math.sin(2 * theta + 0.6), 0.0, 3.0 * math.sin(theta))
    p["coat_scale"] = (1.08, 1.08, 1.0)
    p["flame"] = flicker(f / 20, 1.05)

    for tag, phase in (("L", 0.0), ("R", math.pi)):
        stride = theta + phase
        p[f"{tag}.foot"] = (-0.15 * math.cos(stride), 0.13 * max(0.0, -math.sin(stride)), 16.0 * max(0.0, -math.sin(stride)))

    arm = -30.0 * math.cos(theta)
    p["R.upper"] = swing(REST_P["R.upper"], arm)
    p["R.fore"] = swing(REST_P["R.fore"], arm - 40.0)
    p["R.grip"] = swing(REST_P["R.grip"], arm - 40.0)
    p["R.palm"] = swing(REST_P["R.palm"], arm - 40.0)
    hold = 7.0 * math.cos(theta)
    p["L.upper"] = swing(REST_P["L.upper"], hold)
    p["L.fore"] = swing(REST_P["L.fore"], hold)
    p["L.grip"] = swing(REST_P["L.grip"], hold)

    return p


WINDUP = dict(IDLE0)
WINDUP.update(
    {
        "spine": (-5.0, 0.0, 22.0),
        "head": (-4.0, 0.0, -16.0),
        "hips": (0.0, 0.0, 8.0),
        "hips_off": (0.0, 0.02, -0.03),
        "coat": (-4.0, 0.0, 4.0),
        "flame": (1.3, 1.3, 1.35),
        "L.upper": (0.8, 0.35, -0.1),
        "L.fore": (-0.15, 0.15, 0.98),
        "L.grip": (0.0, -0.45, 0.9),
        "L.palm": (0.0, -0.85, -0.45),
        "R.upper": (-0.2, -0.6, -0.78),
        "R.fore": (-0.1, -0.95, -0.25),
        "R.grip": (0.0, -0.95, -0.3),
        "R.palm": (1.0, 0.0, 0.0),
        "L.foot": (0.02, 0.0, 0.0),
        "R.foot": (0.04, 0.0, 0.0),
    }
)
THROW = dict(IDLE0)
THROW.update(
    {
        "spine": (12.0, 0.0, -20.0),
        "head": (-8.0, 0.0, 12.0),
        "hips": (0.0, 0.0, -8.0),
        "hips_off": (0.0, -0.04, -0.06),
        "coat": (12.0, 0.0, -4.0),
        "coat_scale": (1.06, 1.06, 1.0),
        "flame": (0.35, 0.35, 0.3),
        "L.upper": (0.18, -0.9, 0.2),
        "L.fore": (0.05, -0.96, 0.25),
        "L.grip": (0.0, -0.3, 0.95),
        "L.palm": (0.0, -1.0, 0.1),
        "R.upper": (-0.35, 0.5, -0.8),
        "R.fore": (-0.2, 0.3, -0.93),
        "R.grip": (0.0, 0.2, -0.98),
        "R.palm": (1.0, 0.0, 0.0),
        "L.foot": (-0.12, 0.0, 0.0),
        "R.foot": (0.08, 0.0, 0.0),
    }
)
FOLLOW = dict(THROW)
FOLLOW.update(
    {
        "spine": (8.0, 0.0, -12.0),
        "head": (-6.0, 0.0, 8.0),
        "hips_off": (0.0, -0.03, -0.045),
        "flame": (0.5, 0.5, 0.45),
        "L.upper": (0.25, -0.8, -0.1),
        "L.fore": (0.1, -0.9, -0.2),
        "L.grip": (0.05, -0.85, -0.3),
        "L.palm": (0.0, -0.3, -0.95),
    }
)
ATTACK_KEYS = [(0, IDLE0), (5, WINDUP), (8, THROW), (12, FOLLOW), (21, IDLE0)]

GATHER = dict(IDLE0)
GATHER.update(
    {
        "spine": (16.0, 0.0, 0.0),
        "head": (8.0, 0.0, 0.0),
        "hips_off": (0.0, 0.02, -0.07),
        "coat": (4.0, 0.0, 0.0),
        "flame": (1.45, 1.45, 1.4),
        "L.upper": (0.2, -0.35, -0.9),
        "L.fore": (-0.4, -0.88, 0.2),
        "L.grip": (-0.45, -0.8, 0.3),
        "L.palm": (0.0, 0.0, 1.0),
        "R.upper": (-0.2, -0.35, -0.9),
        "R.fore": (0.4, -0.88, 0.2),
        "R.grip": (0.45, -0.8, 0.3),
        "R.palm": (0.0, 0.0, 1.0),
        "L.foot": (0.0, 0.0, 0.0),
        "R.foot": (0.0, 0.0, 0.0),
    }
)
RELEASE = dict(IDLE0)
RELEASE.update(
    {
        "spine": (-10.0, 0.0, 0.0),
        "head": (-20.0, 0.0, 0.0),
        "hips_off": (0.0, 0.0, -0.02),
        "coat": (12.0, 0.0, 0.0),
        "coat_scale": (1.22, 1.22, 0.92),
        "flame": (2.0, 2.0, 2.1),
        "L.upper": (0.35, -0.15, 0.92),
        "L.fore": (0.15, -0.2, 0.97),
        "L.grip": (0.05, -0.25, 0.97),
        "L.palm": (0.0, -0.95, 0.25),
        "R.upper": (-0.35, -0.15, 0.92),
        "R.fore": (-0.15, -0.2, 0.97),
        "R.grip": (-0.05, -0.25, 0.97),
        "R.palm": (0.0, -0.95, 0.25),
        "L.foot": (-0.03, 0.0, 0.0),
        "R.foot": (0.03, 0.0, 0.0),
    }
)
RELEASE_SOFT = blend(RELEASE, IDLE0, 0.35)
CAST_KEYS = [(0, IDLE0), (7, GATHER), (13, RELEASE), (18, RELEASE_SOFT), (27, IDLE0)]

FLINCH = dict(IDLE0)
FLINCH.update(
    {
        "spine": (-14.0, 0.0, 6.0),
        "head": (-4.0, 0.0, 12.0),
        "hips_off": (0.0, 0.04, -0.03),
        "coat": (-8.0, 0.0, 0.0),
        "flame": (0.7, 0.7, 0.6),
        "R.upper": (-0.55, -0.45, 0.2),
        "R.fore": (0.2, -0.5, 0.85),
        "R.grip": (0.1, -0.3, 0.95),
        "R.palm": (0.0, -1.0, 0.0),
    }
)
HIT_KEYS = [(0, IDLE0), (3, FLINCH), (9, IDLE0)]

STAGGER = dict(IDLE0)
STAGGER.update(
    {
        "spine": (-16.0, 0.0, -8.0),
        "head": (-24.0, 0.0, 10.0),
        "hips_off": (0.0, 0.06, -0.04),
        "coat": (-10.0, 0.0, 0.0),
        "flame": (0.4, 0.4, 0.3),
        "L.upper": (0.85, 0.3, -0.3),
        "L.fore": (0.9, 0.3, 0.2),
        "L.grip": (0.8, 0.2, 0.5),
        "L.palm": (0.0, 0.0, 1.0),
        "R.upper": (-0.85, 0.3, -0.3),
        "R.fore": (-0.9, 0.3, 0.2),
        "R.grip": (-0.8, 0.2, 0.5),
        "R.palm": (0.0, 0.0, 1.0),
    }
)
KNEEL = dict(STAGGER)
KNEEL.update(
    {
        "spine": (26.0, 0.0, 0.0),
        "head": (22.0, 0.0, 0.0),
        "hips_off": (0.0, 0.0, -0.24),
        "coat": (4.0, 0.0, 0.0),
        "flame": (0.001, 0.001, 0.001),
        "L.upper": (0.4, -0.3, -0.86),
        "L.fore": (0.3, -0.6, -0.74),
        "L.grip": (0.2, -0.7, -0.68),
        "R.upper": (-0.4, -0.3, -0.86),
        "R.fore": (-0.3, -0.6, -0.74),
        "R.grip": (-0.2, -0.7, -0.68),
    }
)
TIP = dict(KNEEL)
TIP.update({"root": (-28.0, 0.0, 0.0), "spine": (6.0, 0.0, 0.0), "head": (-10.0, 0.0, 0.0), "hips_off": (0.0, 0.0, -0.2)})
FALLEN = dict(KNEEL)
FALLEN.update(
    {
        "root": (-86.0, 0.0, 0.0),
        "spine": (-6.0, 0.0, 0.0),
        "head": (-12.0, 0.0, 16.0),
        "hips_off": (0.0, 0.0, 0.0),
        "coat": (-2.0, 0.0, 0.0),
        "L.upper": (0.93, 0.0, 0.36),
        "L.fore": (0.8, 0.0, 0.6),
        "L.grip": (0.7, 0.0, 0.7),
        "L.palm": (0.0, -1.0, 0.0),
        "R.upper": (-0.93, 0.0, 0.36),
        "R.fore": (-0.8, 0.0, 0.6),
        "R.grip": (-0.7, 0.0, 0.7),
        "R.palm": (0.0, -1.0, 0.0),
        "L.foot": (0.0, 0.0, 0.0),
        "R.foot": (0.0, 0.0, 0.0),
    }
)


def death_keys(lift):
    fallen = dict(FALLEN)
    fallen["root_off"] = (0.0, 0.0, lift)
    tip = dict(TIP)
    tip["root_off"] = (0.0, 0.0, lift * 0.25)
    bounce = dict(fallen)
    bounce["root"] = (-80.0, 0.0, 0.0)
    bounce["root_off"] = (0.0, 0.0, lift + 0.03)

    return [(0, IDLE0), (6, STAGGER), (14, KNEEL), (20, tip), (29, fallen), (32, bounce), (36, fallen)]


CHEER = dict(IDLE0)
CHEER.update(
    {
        "spine": (-6.0, 0.0, -8.0),
        "head": (-16.0, 0.0, 6.0),
        "coat": (6.0, 0.0, 0.0),
        "flame": (1.6, 1.6, 1.7),
        "L.upper": (0.3, -0.1, 0.95),
        "L.fore": (0.1, -0.15, 0.98),
        "L.grip": (0.0, -0.2, 0.98),
        "L.palm": (0.0, 0.0, 1.0),
        "R.upper": (-0.7, -0.2, -0.55),
        "R.fore": (-0.2, -0.6, 0.75),
        "R.grip": (-0.1, -0.5, 0.85),
        "R.palm": (1.0, 0.0, 0.0),
    }
)
CHEER_HIGH = dict(CHEER)
CHEER_HIGH.update(
    {
        "spine": (-10.0, 0.0, -4.0),
        "head": (-22.0, 0.0, 0.0),
        "hips_off": (0.0, 0.0, 0.015),
        "flame": (1.9, 1.9, 2.0),
        "L.upper": (0.2, -0.05, 0.98),
        "R.upper": (-0.6, -0.3, 0.2),
        "R.fore": (-0.1, -0.3, 0.95),
        "R.grip": (0.0, -0.2, 0.98),
    }
)


def victory_params(f):
    pump = 0.5 - 0.5 * math.cos(TAU * 3 * f / 75)
    p = blend(CHEER, CHEER_HIGH, pump)
    p["flame"] = tuple(a * b for a, b in zip(p["flame"], flicker(f / 75)))

    return p


def rig_action(name, params, count):
    return POSER.action(name, sample(resolve, params, count), "pyromancer_rig", scaled=("coat", "flame"))


bind(low, rig)
CLIPS = {
    "idle": (lambda f: idle_params(f / 90), 90, True),
    "run": (run_params, 20, True),
    "attack": (lambda f: keyed(ATTACK_KEYS, f), 21, False),
    "cast": (lambda f: keyed(CAST_KEYS, f), 27, False),
    "hit": (lambda f: keyed(HIT_KEYS, f), 9, False),
    "victory": (victory_params, 75, True),
}
ACTIONS = {name: rig_action(name, params, count) for name, (params, count, _) in CLIPS.items()}
probe = rig_action("death_probe", lambda f: keyed(death_keys(0.0), f), 36)
play(rig, *probe, 36)
lift = -float(body_points(low)[:, 2].min()) + 0.005
bpy.data.actions.remove(probe[0])
ACTIONS["death"] = rig_action("death", lambda f: keyed(death_keys(lift), f), 36)
CLIPS["death"] = (None, 36, False)
report["death_lift"] = round(lift, 3)
GROUPS = groups_of(low)
report["clips"] = {name: clip_stats(rig, low, GROUPS, *ACTIONS[name], CLIPS[name][1], CLIPS[name][2]) for name in ACTIONS}

if "sheet" in FLAGS:
    lengths = {name: clip[1] for name, clip in CLIPS.items()}
    clip_sheet(rig, low, ACTIONS, lengths, OUT / "pyromancer_clips.png", OUT, columns=7, size=300, view=((-1.9, -3.3, 1.7), (0.0, 0.0, 1.0), 40))

if "clips" in FLAGS:
    report_line()
    sys.exit(0)

if "render" in FLAGS:
    render_views([low], "pyromancer_final", OUT)

SHOWREEL = [("idle", 1), ("run", 3), ("attack", 1), ("cast", 1), ("hit", 1), ("victory", 1), ("death", 1)]
finish(RECIPE, rig, low, ACTIONS, SHOWREEL)
report["saved"] = str(RECIPE.target.relative_to(REPO)) if RECIPE.target.is_relative_to(REPO) else str(RECIPE.target)
report["actions"] = sorted(action.name for action in bpy.data.actions)
report["objects"] = sorted(obj.name for obj in bpy.data.objects)
report_line()
