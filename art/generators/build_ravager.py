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

from bake_kit import Recipe, bake_texture, blank_image, build_parts, final_materials, render_views, unwrap
from clip_kit import TAU, Poser, bind, blend, body_points, clip_sheet, clip_stats, finish, groups_of, keyed, mirrored, play, sample, swing

OUT = Path(os.environ.get("ART_OUT") or Path(tempfile.gettempdir()) / "jev-art")
FLAGS = set(sys.argv[sys.argv.index("--") + 1 :]) if "--" in sys.argv else set()
SETTINGS = {flag.split("=")[0]: float(flag.split("=")[1]) for flag in FLAGS if "=" in flag}

RECIPE = Recipe(
    id="ravager",
    source=REPO / "art" / "explorations" / "gorrak-hq.blend",
    target=Path(os.environ.get("ART_TARGET") or REPO / "art" / "models" / "heroes" / "ravager.blend"),
    hq="gorrak_hq",
    rig="Gorrak",
    drop=frozenset({
        "gk_belt_studs",
        "gk_flap_studs",
        "gk_boot_straps.L",
        "gk_boot_straps.R",
        "gk_war_paint",
        "gk_arm_paint.L",
        "gk_arm_paint.R",
        "gk_belt_skull_eyes",
        "gk_beard_rings",
        "gk_axe_wrap.L",
        "gk_axe_wrap.R",
        "gk_wraps.L",
        "gk_wraps.R",
        "gk_harness_boss",
    }),
    targets={
        "gk_mantle": 540,
        "gk_fur_skirt": 360,
        "gk_beard": 260,
        "gk_torso": 520,
        "gk_cape": 320,
        "gk_cape_tufts": 160,
        "gk_upper_arm": 220,
        "gk_horn_tips": 150,
        "gk_horns": 130,
        "gk_kilt_flaps": 130,
        "gk_fist": 190,
        "gk_sash": 150,
        "gk_pauldron_bronze": 200,
        "gk_head": 240,
        "gk_boot_cuff": 100,
        "gk_belt_skull": 120,
        "gk_pauldron_lames": 200,
        "gk_helm_bronze": 140,
        "gk_harness": 120,
        "gk_forearm": 150,
        "gk_helm": 200,
        "gk_pauldron": 200,
        "gk_axe_fittings": 70,
        "gk_helm_plates": 160,
        "gk_pauldron_tusks": 100,
        "gk_boot": 120,
        "gk_eyes": 40,
        "gk_tusks": 70,
        "gk_thigh": 120,
        "gk_knee": 70,
        "gk_axe_tassel": 50,
        "gk_belt": 120,
        "gk_bracer": 100,
        "gk_axe_tusk": 50,
        "gk_axe_head": 80,
        "gk_foot": 90,
        "gk_axe_edge": 60,
        "gk_sole": 50,
        "gk_axe_haft": 64,
    },
    kinds={
        "gk_skin": "skin",
        "gk_paint": "paint",
        "gk_bone": "bone",
        "gk_horn": "bone",
        "gk_hair": "fur",
        "hq_fur": "fur",
        "gk_fur_dark": "fur",
        "gk_wool": "fur",
        "gk_wood": "wood_v",
        "gk_bronze": "bronze",
        "gk_iron": "metal",
        "hq_steel": "metal",
        "gk_leather_dark": "leather",
        "hq_leather": "leather",
    },
    team="hq_team",
    glow={"gk_eyes": "#ff8a3d"},
    glow_colour="#ff8a3d",
)


def report_line():
    print("RAVAGER " + json.dumps({k: v for k, v in report.items() if k != "parts"}))


assert Path(bpy.data.filepath).resolve() == RECIPE.source.resolve(), f"open {RECIPE.source} first, not {bpy.data.filepath}"
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "frames").mkdir(exist_ok=True)
report = {}
rig, low, high = build_parts(RECIPE, report)

if "lp" in FLAGS:
    report_line()
    sys.exit(0)

unwrap(low, report)

if "nobake" in FLAGS:
    painted = blank_image("ravager_paint", (0.5, 0.5, 0.5), RECIPE.texture_size)
else:
    painted = bake_texture(low, high, RECIPE, report, OUT, SETTINGS, "debug" in FLAGS)

final_materials(low, painted, RECIPE)

if "render" in FLAGS:
    render_views([low], "ravager_low", OUT)

if "bake" in FLAGS:
    report_line()
    sys.exit(0)

SIDES = {"L": 1, "R": -1}
AXE_BUTT = (0.56, -0.17, 0.97)
AXE_END = (0.52, -0.5, 0.36)
HIP = (0.17, 0.02, 0.76)
KNEE = (0.23, -0.07, 0.43)
ANKLE = (0.25, -0.02, 0.15)


def mirror(point, side):
    return Vector((point[0] * side, point[1], point[2]))


def axe_frame(side):
    butt, end = mirror(AXE_BUTT, side), mirror(AXE_END, side)
    axis = (end - butt).normalized()
    outward = Vector((side, 0.0, 0.0))
    edge = (outward - outward.dot(axis) * axis).normalized()

    return axis, edge


POSER = Poser(
    rig,
    hands={tag: axe_frame(side) for tag, side in SIDES.items()},
    legs={tag: tuple(mirror(point, side) for point in (HIP, KNEE, ANKLE)) for tag, side in SIDES.items()},
)

REST_P = {
    "root": (0.0, 0.0, 0.0),
    "root_off": (0.0, 0.0, 0.0),
    "spine": (0.0, 0.0, 0.0),
    "head": (0.0, 0.0, 0.0),
    "hips": (0.0, 0.0, 0.0),
    "cape": (0.0, 0.0, 0.0),
    "hips_off": (0.0, 0.0, 0.0),
    "kilt": (1.0, 1.0, 1.0),
    "L.foot": (0.0, 0.0, 0.0),
    "R.foot": (0.0, 0.0, 0.0),
}

for tag, side in SIDES.items():
    REST_P[f"{tag}.upper"] = tuple(POSER.rest_dir[f"upper_arm.{tag}"])
    REST_P[f"{tag}.fore"] = tuple(POSER.rest_dir[f"forearm.{tag}"])
    REST_P[f"{tag}.haft"] = tuple(axe_frame(side)[0])
    REST_P[f"{tag}.edge"] = tuple(axe_frame(side)[1])


def resolve(p):
    rotations = {"root": p["root"], "spine": p["spine"], "head": p["head"], "hips": p["hips"], "cape": p["cape"]}
    offsets = {"hips": p["hips_off"], "root": p["root_off"]}

    for tag in SIDES:
        POSER.aim_arm(rotations, tag, p[f"{tag}.upper"], p[f"{tag}.fore"], p[f"{tag}.haft"], p[f"{tag}.edge"])

    for tag in SIDES:
        POSER.plant_leg(rotations, offsets, tag, p[f"{tag}.foot"])

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


def run_params(f):
    theta = TAU * f / 21
    p = dict(IDLE0)
    p["spine"] = (17.0 + 2.5 * math.cos(2 * theta), 0.0, 9.0 * math.sin(theta))
    p["head"] = (-16.0, 0.0, -7.0 * math.sin(theta))
    p["hips"] = (0.0, 0.0, -9.0 * math.sin(theta))
    p["hips_off"] = (0.0, -0.02, -0.06 + 0.035 * abs(math.cos(theta)))
    p["cape"] = (26.0 + 7.0 * math.sin(2 * theta + 0.6), 0.0, 3.0 * math.sin(theta))
    p["kilt"] = (1.06, 1.0, 1.06)

    for tag, phase in (("L", 0.0), ("R", math.pi)):
        stride = theta + phase
        forward = -math.cos(stride + math.pi)
        arm = -32.0 * forward
        p[f"{tag}.foot"] = (-0.17 * math.cos(stride), 0.15 * max(0.0, -math.sin(stride)), 18.0 * max(0.0, -math.sin(stride)))
        p[f"{tag}.upper"] = swing(REST_P[f"{tag}.upper"], arm)
        p[f"{tag}.fore"] = swing(REST_P[f"{tag}.fore"], arm - 48.0)
        p[f"{tag}.haft"] = swing(REST_P[f"{tag}.haft"], arm - 48.0)
        p[f"{tag}.edge"] = swing(REST_P[f"{tag}.edge"], arm - 48.0)

    return p


RAISE = dict(IDLE0)
RAISE.update({"spine": (-9.0, 0.0, 0.0), "head": (-16.0, 0.0, 0.0), "hips_off": (0.0, 0.03, -0.02), "cape": (12.0, 0.0, 0.0)})
RAISE.update(mirrored({"upper": (0.3, 0.12, 0.95), "fore": (0.15, 0.55, 0.82), "haft": (0.12, 0.62, 0.78), "edge": (0.0, -0.75, 0.62)}))
CHOP = dict(IDLE0)
CHOP.update({"spine": (26.0, 0.0, 0.0), "head": (-4.0, 0.0, 0.0), "hips_off": (0.0, -0.05, -0.11), "cape": (-4.0, 0.0, 0.0)})
CHOP.update(mirrored({"upper": (0.3, -0.8, -0.5), "fore": (0.2, -0.96, -0.18), "haft": (0.12, -0.94, -0.3), "edge": (0.0, -0.3, -0.95)}))
CHOP.update({"L.foot": (-0.12, 0.0, 0.0), "R.foot": (0.08, 0.0, 0.0)})
FOLLOW = dict(CHOP)
FOLLOW.update({"spine": (21.0, 0.0, 0.0), "head": (-8.0, 0.0, 0.0), "hips_off": (0.0, -0.04, -0.09)})
FOLLOW.update({"hips_off": (0.0, -0.04, -0.07)})
FOLLOW.update(mirrored({"upper": (0.3, -0.5, -0.81), "fore": (0.24, -0.7, -0.67), "haft": (0.16, -0.62, -0.77), "edge": (0.0, -0.78, 0.62)}))
ATTACK_KEYS = [(0, IDLE0), (5, RAISE), (8, CHOP), (12, FOLLOW), (20, IDLE0)]

GATHER = dict(IDLE0)
GATHER.update({"spine": (21.0, 0.0, 0.0), "head": (-9.0, 0.0, 0.0), "hips_off": (0.0, 0.02, -0.11), "cape": (6.0, 0.0, 0.0)})
GATHER.update(mirrored({"upper": (0.25, 0.32, -0.91), "fore": (0.12, -0.3, -0.95), "haft": (0.22, 0.5, -0.84), "edge": (1.0, 0.0, 0.0)}))
RELEASE = dict(IDLE0)
RELEASE.update(
    {
        "spine": (-9.0, 0.0, 0.0),
        "head": (-21.0, 0.0, 0.0),
        "hips_off": (0.0, 0.0, -0.03),
        "cape": (24.0, 0.0, 0.0),
        "kilt": (1.12, 0.95, 1.12),
    }
)
RELEASE.update(mirrored({"upper": (0.95, -0.05, -0.15), "fore": (0.94, -0.2, 0.22), "haft": (0.84, -0.12, 0.52), "edge": (0.0, -0.94, 0.3)}))
RELEASE_SOFT = blend(RELEASE, IDLE0, 0.35)
CAST_KEYS = [(0, IDLE0), (8, GATHER), (13, RELEASE), (18, RELEASE_SOFT), (27, IDLE0)]

FLINCH = dict(IDLE0)
FLINCH.update({"spine": (-14.0, 0.0, 6.0), "head": (-2.0, 0.0, 12.0), "hips_off": (0.0, 0.05, -0.035), "cape": (14.0, 0.0, 0.0)})

for tag, side in SIDES.items():
    FLINCH[f"{tag}.upper"] = tuple((Vector(IDLE0[f"{tag}.upper"]) + Vector((0.18 * side, 0.12, 0.1))).normalized())
    FLINCH[f"{tag}.haft"] = tuple((Vector(IDLE0[f"{tag}.haft"]) + Vector((0.2 * side, 0.2, 0.2))).normalized())

HIT_KEYS = [(0, IDLE0), (3, FLINCH), (9, IDLE0)]

STAGGER = dict(IDLE0)
STAGGER.update({"spine": (-16.0, 0.0, -8.0), "head": (-28.0, 0.0, 10.0), "hips_off": (0.0, 0.06, -0.04), "cape": (22.0, 0.0, 0.0)})
STAGGER.update(mirrored({"upper": (0.85, 0.3, -0.3), "fore": (0.9, 0.35, 0.1), "haft": (0.8, 0.5, -0.2), "edge": (0.0, -0.4, -0.9)}))
KNEEL = dict(IDLE0)
KNEEL.update({"spine": (28.0, 0.0, 0.0), "head": (24.0, 0.0, 0.0), "hips_off": (0.0, 0.0, -0.26), "cape": (4.0, 0.0, 0.0)})
KNEEL.update(mirrored({"upper": (0.45, -0.25, -0.86), "fore": (0.55, -0.55, -0.62), "haft": (0.6, -0.72, -0.34), "edge": (0.0, 0.0, 1.0)}))
TIP = dict(KNEEL)
TIP.update({"root": (-28.0, 0.0, 0.0), "spine": (6.0, 0.0, 0.0), "head": (-12.0, 0.0, 0.0), "hips_off": (0.0, 0.0, -0.2)})
TIP.update(mirrored({"upper": (0.8, 0.1, -0.55), "fore": (0.85, 0.2, -0.45), "haft": (0.75, 0.1, -0.65), "edge": (0.0, -1.0, 0.0)}))
FALLEN = dict(IDLE0)
FALLEN.update({"root": (-86.0, 0.0, 0.0), "spine": (-6.0, 0.0, 0.0), "head": (-14.0, 0.0, 18.0), "hips_off": (0.0, 0.0, 0.0), "cape": (-2.0, 0.0, 0.0)})
FALLEN.update(mirrored({"upper": (0.93, 0.0, 0.36), "fore": (0.8, 0.0, 0.6), "haft": (0.72, 0.0, 0.69), "edge": (0.0, 0.07, 1.0)}))


def death_keys(lift):
    fallen = dict(FALLEN)
    fallen["root_off"] = (0.0, 0.0, lift)
    tip = dict(TIP)
    tip["root_off"] = (0.0, 0.0, lift * 0.25)
    bounce = dict(fallen)
    bounce["root"] = (-80.0, 0.0, 0.0)
    bounce["root_off"] = (0.0, 0.0, lift + 0.03)

    return [(0, IDLE0), (6, STAGGER), (14, KNEEL), (20, tip), (29, fallen), (32, bounce), (36, fallen)]


ROAR = dict(IDLE0)
ROAR.update({"spine": (-8.0, 0.0, 10.0), "head": (-22.0, 0.0, -8.0), "hips_off": (0.0, 0.0, -0.02), "cape": (18.0, 0.0, 0.0), "kilt": (1.08, 0.96, 1.08)})
ROAR.update(mirrored({"upper": (0.85, 0.05, -0.25), "fore": (0.55, -0.25, 0.8), "haft": (0.35, -0.15, 0.92), "edge": (1.0, 0.0, 0.0)}))
ROAR_HIGH = dict(ROAR)
ROAR_HIGH.update({"spine": (-12.0, 0.0, -6.0), "head": (-30.0, 0.0, 6.0), "hips_off": (0.0, 0.0, 0.0)})
ROAR_HIGH.update(mirrored({"upper": (0.6, 0.05, 0.8), "fore": (0.3, -0.1, 0.95), "haft": (0.2, -0.2, 0.96), "edge": (1.0, 0.0, 0.0)}))


def victory_params(f):
    pump = 0.5 - 0.5 * math.cos(TAU * 2 * f / 75)

    return blend(ROAR, ROAR_HIGH, pump)


SPIN = dict(IDLE0)
SPIN.update({"spine": (8.0, 5.0, 0.0), "head": (-10.0, 0.0, 0.0), "hips_off": (0.0, 0.0, -0.05), "cape": (58.0, 0.0, 0.0), "kilt": (1.28, 0.9, 1.28)})
SPIN.update(
    {
        "L.upper": (0.6, -0.05, -0.8),
        "L.fore": (0.9, -0.3, -0.3),
        "L.haft": (0.93, 0.05, -0.36),
        "L.edge": (0.0, 1.0, 0.0),
        "R.upper": (-0.6, -0.05, -0.8),
        "R.fore": (-0.9, -0.3, -0.3),
        "R.haft": (-0.93, 0.05, -0.36),
        "R.edge": (0.0, -1.0, 0.0),
    }
)


def channel_params(f):
    beat = TAU * f / 20
    p = dict(SPIN)
    p["hips_off"] = (0.0, 0.0, -0.05 + 0.012 * math.sin(2 * beat))
    p["cape"] = (58.0 + 8.0 * math.sin(beat), 0.0, 4.0 * math.sin(beat))
    p["spine"] = (8.0 + 2.0 * math.sin(2 * beat), 5.0, 0.0)

    return p


def rig_action(name, params, count):
    return POSER.action(name, sample(resolve, params, count), "ravager_rig", scaled=("kilt",))


bind(low, rig)
CLIPS = {
    "idle": (lambda f: idle_params(f / 90), 90, True),
    "run": (run_params, 21, True),
    "attack": (lambda f: keyed(ATTACK_KEYS, f), 20, False),
    "cast": (lambda f: keyed(CAST_KEYS, f), 27, False),
    "hit": (lambda f: keyed(HIT_KEYS, f), 9, False),
    "victory": (victory_params, 75, True),
    "channel": (channel_params, 20, True),
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
    clip_sheet(rig, low, ACTIONS, {name: clip[1] for name, clip in CLIPS.items()}, OUT / "ravager_clips.png", OUT)

if "clips" in FLAGS:
    report_line()
    sys.exit(0)

if "render" in FLAGS:
    render_views([low], "ravager_final", OUT)

SHOWREEL = [("idle", 1), ("run", 3), ("attack", 1), ("cast", 1), ("channel", 3), ("hit", 1), ("victory", 1), ("death", 1)]
finish(RECIPE, rig, low, ACTIONS, SHOWREEL)
report["saved"] = str(RECIPE.target.relative_to(REPO)) if RECIPE.target.is_relative_to(REPO) else str(RECIPE.target)
report["actions"] = sorted(action.name for action in bpy.data.actions)
report["objects"] = sorted(obj.name for obj in bpy.data.objects)
report_line()
