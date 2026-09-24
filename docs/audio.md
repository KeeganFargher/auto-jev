# Audio: sounds, voice lines and how they reach the game

Every sound effect and hero voice line is generated with ElevenLabs,
processed with ffmpeg into an MP3 and played by the audio engine
(`docs/architecture.md`, "Client audio"). Each has raw takes under
`art/audio/` and one runtime file under `apps/client/public/assets/audio/`,
made from the chosen take. Today there are 62 sounds and 50 voice lines
(five for each of the ten heroes). `pnpm audio:check` enforces coverage.
Music is still missing and tracked in `missing_assets.md` entry 7.

## Where things live

| Path | What | Git |
| --- | --- | --- |
| `art/audio/sfx/<id>-<take>.mp3` | Raw ElevenLabs takes for each sound, every take kept | LFS |
| `art/audio/vo/<hero>-<moment>-<take>.mp3` | Raw voice line takes | LFS |
| `art/audio/takes.json` | Per sound: prompt, duration, cap, stereo flag, chosen take and the ElevenLabs flow, node and session ids. Per line: text, voice and chosen take. Also the processing numbers below | plain |
| `apps/client/public/assets/audio/<id>.mp3` | Runtime sound, processed from the chosen take | plain |
| `apps/client/public/assets/audio/vo/<hero>-<moment>.mp3` | Runtime voice line | plain |
| `apps/client/src/audio/catalogue.ts` | Each sound's file, bus, preload group, volume and overlap rules | plain |
| `apps/client/src/audio/sound-map.ts` | Which sound each ability, summon, combo, crit, shield and teleport beat plays | plain |
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
2. Cut sounds with a `cap` to that many seconds with an 80 ms fade-out.
   Other sounds get a 12 ms end fade. Swings and hits are capped at
   0.55–0.6 s because they repeat constantly.
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
impacts 0.8, stingers 0.85, lines 1.

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
| Cinder (`pyromancer`) | Laura | Excitable, loves explosions |
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

## Adding a hero or ability

1. Give each new ability an entry in `ABILITY_SOUNDS` (`sound-map.ts`).
   Reuse an existing sound where it fits (a blade basic attack is
   `swing-light` + `hit-blade`). For a new sound, generate and process
   it as above, then add it to `SOUNDS` in `catalogue.ts` in the
   `battle` group.
2. Summons go in `UNIT_SOUNDS`: a death sound and, if it rises, a spawn
   sound.
3. Choose a voice (`creative_list_voices`), write the five lines,
   generate and process them, add them to `SOUNDS` with `line()` and
   the hero to `HERO_LINES`.
4. Run `pnpm build` so the content package has the new ids, then
   `pnpm audio:check`.

## Commands

```bash
pnpm audio:check
```

Fails when:
- an ability has no sound entry, or a hero with an archetype has no lines;
- a sound entry names an ability or hero that isn't in the catalogue;
- a catalogue file is missing;
- an MP3 under `apps/client/public/assets/audio/` isn't used.

Like `icons:check`, it reads `@jev-game/content`'s built `dist`.
