# Audio: sounds and how they reach the game

Every sound effect is generated with ElevenLabs, processed with ffmpeg
into an MP3 and played by the audio engine (`docs/architecture.md`,
"Client audio"). Each sound has raw takes under `art/audio/sfx/` and one
runtime file under `apps/client/public/assets/audio/`, made from the
chosen take. Today there are 22 sounds and one music track.
`pnpm audio:check` checks that every file exists and is used.

The pivot removed the old heroes' voice lines and ability sounds (they
are at the `pre-pivot` tag). The Bone & Banner signatures have no sounds
of their own yet: bubbles, fuses, fire, Rampage and combo links are
silent. They are requested in `missing_assets.md` entry 31. Only the
planning music exists, and it plays on every screen; the three loops are
entry 7.

## Where things live

| Path                                         | What                                                                                                                                                                             | Git   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `art/audio/sfx/<id>-<take>.mp3`              | Raw ElevenLabs takes for each sound, every take kept                                                                                                                             | LFS   |
| `art/audio/takes.json`                       | Per sound: prompt, duration, cap, stereo flag, chosen take and the ElevenLabs flow, node and session ids. Also the processing numbers below                                      | plain |
| `apps/client/public/assets/audio/<id>.mp3`   | Runtime sound, processed from the chosen take                                                                                                                                    | plain |
| `apps/client/src/audio/catalogue.ts`         | Each sound's file, bus, preload group, volume, overlap rules and priority; the music tracks and which screen plays which                                                         | plain |
| `apps/client/src/audio/sound-map.ts`         | Which sound each battle beat plays: swings and hits by attack kind, hits by damage cause, and the crit, heavy hit, impact, landing, throw, yank, stun, death and teleport sounds | plain |
| `apps/client/src/game/fx/battle-sounds.ts`   | Plays those sounds, panned to where the beat happens. `battle-view.ts` and `teleport-view.ts` call it                                                                            | plain |
| `apps/client/src/game/scenes/match-scene.ts` | Plays the draft, countdown, battle-start and result stingers                                                                                                                     | plain |
| `scripts/audio/check.ts`                     | `pnpm audio:check`                                                                                                                                                               | plain |

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
   - hit-blade and teleport-in each needed a third, re-prompted take.

## Processing

`takes.json` → `processing` holds the numbers:

1. Trim leading silence below −50 dBFS and trailing silence below
   −60 dBFS, keeping 2 ms before the first sample and 20 ms after the last.
2. Cut sounds with a `cap` to that many seconds with an 80 ms fade-out.
   Other sounds get a 12 ms end fade. Swings and hits are capped at
   0.55–0.6 s because they repeat constantly.
3. Measure momentary loudness (`ebur128=peak=sample`) and apply one gain
   so the loudest 400 ms sits at −16 LUFS, with sample peaks no higher
   than −1 dBFS.
4. Encode MP3 at 44.1 kHz:
   - mono 128 kbps for battle sounds;
   - stereo 192 kbps for the stingers, draft and UI sounds, and
     teleport-warp.

A take can also set `leadCutSeconds`, to start at least that far in, or
`fadeIn`, to fade in from its first sample
(`afade=t=in:st=0:d=<seconds>:curve=cub`). No current sound uses either.

```bash
ffmpeg -i take.mp3 -af "atrim=start=S:end=E,asetpts=PTS-STARTPTS,afade=t=out:st=E-S-F:d=F,volume=GdB" -ac 1 -ar 44100 -c:a libmp3lame -b:a 128k out.mp3
```

Every file is equally loud after this. The mix comes from each sound's
`volume` in `catalogue.ts`: swings 0.32, hits 0.42, UI sounds 0.45,
heavy impacts 0.8 and stingers 0.85, with some sounds overriding their
preset. Each preset also has a `priority` for busy fights: swings and
hits 0, heavy impacts 2, stingers and UI sounds 3. When a channel is
full, a hit can only take another hit's slot, so it never cuts off a
heavy impact (`docs/architecture.md`, "Overlap rules").

## Adding a sound for a hero or signature

1. Pick the battle event that should sound. `battle-view.ts` handles
   each event from the engine's recording and calls a `play*` function
   in `battle-sounds.ts`. These events play nothing today: `signature`,
   `launch`, `bubble`, `bubble-launch`, `pop`, `prime` (a lit fuse),
   `ignite`, `rampage`, `grab`, `heal` and `combo-link`.
2. Reuse a sound where it fits, or generate and process a new one as
   above and add it to `SOUNDS` in `catalogue.ts` in the `battle` group,
   using the preset that matches its role.
3. Name it in `sound-map.ts`, add a `play*` function to
   `battle-sounds.ts` and call it from the event's case in
   `battle-view.ts`.
4. `ATTACK_SOUNDS` and `CAUSE_HIT_SOUNDS` are keyed by the engine's
   attack kinds and damage causes, so a new kind or cause fails the
   typecheck until it has an entry. A `null` cause plays no hit sound:
   hammer and blast hits already play the impact sound as they land,
   splash damage comes with the projectile's own hit, and burn ticks
   are silent.
5. Run `pnpm audio:check`.

## Commands

```bash
pnpm audio:check
```

Fails when a `SOUNDS` or `MUSIC` entry points at a missing file, or an
MP3 under `apps/client/public/assets/audio/` isn't used by any entry. It
imports the client catalogue directly, so it needs no build.
