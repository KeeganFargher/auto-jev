# Audio: sounds, voice lines and how they reach the game

Every sound effect and hero voice line is generated with ElevenLabs,
processed with ffmpeg into an MP3 and played by the audio engine
(`docs/architecture.md`, "Client audio"). Each has raw takes under
`art/audio/` and one runtime file under `apps/client/public/assets/audio/`,
made from the chosen take. Today there are 97 sounds and 50 voice lines
(five for each of the ten heroes). `pnpm audio:check` enforces coverage.
Only the planning music exists so far. The rest is tracked in
`missing_assets.md` entry 7.

## Where things live

| Path | What | Git |
| --- | --- | --- |
| `art/audio/sfx/<id>-<take>.mp3` | Raw ElevenLabs takes for each sound, every take kept | LFS |
| `art/audio/vo/<hero>-<moment>-<take>.mp3` | Raw voice line takes | LFS |
| `art/audio/takes.json` | Per sound: prompt, duration, cap, stereo flag, any lead cut or fade-in, chosen take and the ElevenLabs flow, node and session ids. Per line: text, voice and chosen take. Also the processing numbers below | plain |
| `apps/client/public/assets/audio/<id>.mp3` | Runtime sound, processed from the chosen take | plain |
| `apps/client/public/assets/audio/vo/<hero>-<moment>.mp3` | Runtime voice line | plain |
| `apps/client/src/audio/catalogue.ts` | Each sound's file, bus, preload group, volume, overlap rules and priority | plain |
| `apps/client/src/audio/sound-map.ts` | Which sound each ability, summon, form, self-revive, emitter, passive trigger, combo, crit, shield and teleport beat plays, and the upgrades that change an impact's sounds | plain |
| `apps/client/src/audio/voice-lines.ts` | Each hero's pick, cast, death and win lines | plain |
| `apps/client/src/audio/line-policy.ts`, `apps/client/src/game/fx/hero-voices.ts` | The voice director: whether a line may play now | plain |
| `scripts/audio/check.ts` | `pnpm audio:check` | plain |

## Style

The set follows one direction, picked by the user on 2026-09-23 from a
four-style audition: a stone arena. Every prompt names a concrete
physical sound, then ends with the same clause:

```
<the sound>, big and deep, echoing through a vast stone arena, no voice
```

The UI click is the one exception: `close-mic, dry, no voice`. It fires
on every button and the reverb would smear.

Describe the object and the action ("a heavy steel blade slashing into a
leather-armoured body"), not the feeling. Keep these words out of
prompts: mallet, chime, sparkle, glockenspiel, plucked, shimmer,
playful, game UI, coin. They come out as arcade pickups, which is what
the user disliked about the first set.

## Generating a sound

1. Use ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) through
   the creative MCP, with prompt influence 0.6 and an explicit
   duration. The minimum is 0.5 s. Make two takes; runs are limited to
   20 nodes, and the queue refuses big batches, so send them in chunks.
2. Keep every take as `art/audio/sfx/<id>-<n>.mp3` and record it in
   `takes.json`.
3. Pick a take by eye. Nobody listens during generation, so check each
   take's loudness and spectrogram (`ffmpeg -i take.mp3 -lavfi
   showspectrumpic=s=420x150:legend=0:scale=log:fscale=log take.png`):
   - A raw momentary maximum under about −30 LUFS is usually a dud:
     near-silence that turns into noise once normalised.
   - A hit needs a clear attack at the start.
   - A take that is flat noise with no envelope is a dud.
   - Three sounds (hit-blade, shield-up, teleport-in) had to be
     re-prompted this way.

## Processing

`takes.json` → `processing` holds the numbers:

1. Trim leading silence below −50 dBFS and trailing silence below
   −60 dBFS, keeping 2 ms before the first sample and 20 ms after the last.
   A sound with a `leadCutSeconds` starts at least that far into the
   take. voidheart's 0.1 s drops most of the inward rush, so the burst
   peaks 60 ms in, while the Voidheart flash is still up.
2. Cut sounds with a `cap` to that many seconds with an 80 ms fade-out.
   Other sounds get a 12 ms end fade. Swings and hits are capped at
   0.55–0.6 s because they repeat constantly. `ice-shard` is capped at
   0.3 s, because Rime's orbs fire several shards a second. A sound with
   a `fadeIn` also fades in from its first sample
   (`afade=t=in:st=0:d=<seconds>:curve=cub`). supernova-fall's 0.7 s
   turns a steady rush into a riser, and hailstorm's 0.4 s lets the
   storm roll in instead of starting on one hard hit. voidheart's 10 ms
   stops its lead cut from clicking.
3. Measure momentary loudness (`ebur128=peak=sample`) and apply one gain
   so the loudest 400 ms sits at −16 LUFS, with sample peaks no higher
   than −1 dBFS.
4. Encode MP3 at 44.1 kHz:
   - mono 128 kbps for battle sounds and voice lines;
   - stereo 192 kbps for the stingers, draft and UI sounds, and
     teleport-warp.

```bash
ffmpeg -i take.mp3 -af "atrim=start=S:end=E,asetpts=PTS-STARTPTS,afade=t=out:st=E-S-F:d=F,volume=GdB" -ac 1 -ar 44100 -c:a libmp3lame -b:a 128k out.mp3
```

Every file is equally loud after this. The mix comes from each sound's
`volume` in `catalogue.ts`: swings 0.32, hits 0.42, abilities 0.6, big
impacts 0.8, stingers 0.85, lines 1. Each preset also has a `priority`
for busy fights: swings and hits 0, abilities 1, big impacts 2,
stingers, UI sounds and lines 3. When a channel is full, a hit can only
take another hit's slot, so it never cuts off a spell
(`docs/architecture.md`, "Overlap rules").

## Voice lines

Lines use ElevenLabs v3 (`eleven_v3`) text to speech with one library
voice per hero. v3 takes audio tags such as `[whispers]`, `[laughs]`
and `[groans]`. On 2026-09-24 a Scribe transcription of all 50 lines
matched the scripts word for word and found no tag read aloud. The
account allows three speech generations at once; more than that fail.

| Hero | Voice | Character |
| --- | --- | --- |
| Anvil (`bulwark`) | Bill Adams | Weary veteran who counts his wins |
| Morrow (`oathkeeper`) | Blue – Commander with Grit | Stern protector, bound by an oath |
| Gorrak (`ravager`) | Azgar the Cursed | Gleeful brute who talks to his axes |
| Vesper (`duskblade`) | Daria | Whispering, amused assassin |
| Cinder (`pyromancer`) | Emma - Adorable and Upbeat | Excitable, loves explosions (the user's pick) |
| Rime (`frostweaver`) | Lady Penelope | Unhurried, aristocratic calm |
| Moira (`hexbinder`) | Enchantress | Knowing fate-witch |
| Nettle (`blightmother`) | Seer Morganna | Sweet old poisoner who offers tea |
| Sexton (`bonecaller`) | Desmond (UK) | Polite gravedigger |
| Brassjack (`clockwright`) | Fin | Chatty engineer who names his turrets |

Voice ids and every line's text are in `takes.json`. Each hero has five
lines, one sentence each and under about 4 s:

- `pick`: drafted or recruited.
- `cast-1` and `cast-2`: alternate on signature casts (abilities that
  cost mana).
- `death`.
- `win`: after the round-won sting.

**When lines play.** The voice director (`line-policy.ts`) allows one
line at a time:

- **Pick and win** interrupt whatever is playing.
- **Death:** waits for silence, needs 1.5 s since the last line and plays
  90% of the time for your heroes, 35% for enemies.
- **Cast:** needs 4 s since any line and 12 s since that hero's last one,
  and plays 50% of the time for your heroes, 20% for enemies.
- **Win:** a random hero from your team, starting 85% of the way through
  the sting.
- **Risen copies never speak.** A hero the Sexton raises from a corpse
  plays its abilities' sounds but none of that hero's lines.

## Adding a hero or ability

1. Give each new ability an entry in `ABILITY_SOUNDS` (`sound-map.ts`).
   Reuse an existing sound where it fits (a blade basic attack is
   `swing-light` + `hit-blade`). For a new sound, generate and process
   it as above, then add it to `SOUNDS` in `catalogue.ts` in the
   `battle` group.
2. An ability that drops something from the sky gets a `falling` and a
   `landing` sound instead of cast and hit. The falling sound ends as
   the impact lands, so it must be shorter than the delay between the
   cast and the landing, and loudest at its end. Anything that lands
   through `impact-landed` (Living Bomb's detonation too) uses
   `landing`. Hex has no impact: its `landing` plays as each `hexed`
   status lands, the first at once and the rest when their fate bolt
   arrives 0.2 s later.
3. An upgrade that turns an impact into something bigger goes in
   `UPGRADE_IMPACT_SOUNDS` with its own pair. A form a hero enters goes
   in `FORM_SOUNDS`, by form key. An upgrade that makes a hero revive
   itself goes in `REVIVE_SOUNDS`, by upgrade id; that sound replaces
   the form sound on the revive tick.
4. An ability that starts an emitter (something that keeps firing shots
   by itself for a while) gets a start sound in `EMITTER_SOUNDS`, keyed
   by the ability that owns the emitter, even when an upgrade adds it:
   Hailstorm is under `glacial-prison`. The shots arrive as ordinary
   hits of the ability they shoot as (`shotsAs`, else the owner), so
   they play that ability's `hit` sound. Hailstorm's shots are Frozen
   Orb's, so they play `ice-shard`.
5. A passive that should sound when it triggers goes in
   `PASSIVE_SOUNDS`, by the `passive` name on its `passive-triggered`
   event (its kind, or its key if it has one), such as `deep-freeze`
   or `virulence`. If it can trigger on many enemies at once, give its
   sound a cooldown in `SOUNDS` so they fold into one: Virulence can
   Burst 13 enemies within 67 ms, and `plague-burst`'s 100 ms cooldown
   plays one pop for them. Damage a passive deals comes as reaction
   hits (`damage-dealt` with `reaction: true`), which are silent unless
   `REACTION_SOUNDS` maps the hit's `abilityId`, the passive kind. Death
   Knell hits every bound enemy on one tick and its cooldown folds them
   into one toll.
6. Summons go in `UNIT_SOUNDS`: a death sound and, if it rises, a spawn
   sound. A hero raised from a corpse (`unit-spawned` with a
   `corpseUnitId`) needs no entry: it plays `grave-rise` as it rises and
   `death-bones` when it dies. Any unit that times out
   (`unit-dismissed` at its `expiresAtTick`) also plays `death-bones`.
   Several rises or crumbles on one tick fold into one.
7. Choose a voice (`creative_list_voices`), write the five lines,
   generate and process them, add them to `SOUNDS` with `line()` and
   the hero to `HERO_LINES`.
8. Run `pnpm build` so the content package has the new ids, then
   `pnpm audio:check`.

## Commands

```bash
pnpm audio:check
```

Fails when:
- an ability has no sound entry, or a hero with an archetype has no lines;
- a sound entry names an ability or hero that isn't in the catalogue;
- `UPGRADE_IMPACT_SOUNDS` names an upgrade that doesn't change that
  ability, `REVIVE_SOUNDS` an upgrade that grants no revive, or
  `FORM_SOUNDS` a form no ability, passive or upgrade creates;
- `EMITTER_SOUNDS` names an ability that neither has an emitter nor
  gains one from an upgrade, or `PASSIVE_SOUNDS` or `REACTION_SOUNDS` a
  passive kind or key that no hero or upgrade has;
- a catalogue file is missing;
- an MP3 under `apps/client/public/assets/audio/` isn't used.

Like `icons:check`, it reads `@jev-game/content`'s built `dist`.
