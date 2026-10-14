# LATCHKEY — design spec

> The original v1 spec, kept for reference. The game has since grown to eleven hours, ten rules,
> recorded voices and in-game tasks; README.md describes the current night.

Short first-person horror game (~15 min). Browser, single HTML file.

## Intent
User asked for "the best short horror game you can make", free choice of tech, scary, detailed.
Success = genuinely tense, readable rules the player can learn, memorable scares, polished
atmosphere, zero install (double-click `index.html` or open the published artifact).

## Premise
You are a kid home alone at 3:00 AM in a rainy apartment. Mom works night shifts at the hospital.
The power is out. Mom calls: the roads are closed, she can't get home before sunrise, read the note
on the fridge. The note lists rules ("same as last time"). Something that wears Mom's coat and a
paper cut-out of Mom's face walks the apartment until sunrise. Following the rules keeps you alive.

### Mom's rules (fridge note)
1. Keep the chain on the front door. Don't take it off until the sun is up.
2. I never knock. I have my key.
3. If you see her in the hall, close your eyes. Don't look at her face.
4. If she says your name behind you, don't turn around. Keep walking.
5. If the music box plays, close it.
6. If the clock says 4:44, hide in the hall closet. Hold your breath when she's close.
7. When the sun comes up, she has to leave.

## Chapters (each is a checkpoint)
| # | Time | Beat | Rule tested | Failure |
|---|------|------|-------------|---------|
| 1 | 3:00 | Wake, flashlight, answer phone, read note | — | — |
| 2 | 3:17 | Knocking, "Mom forgot her keys", peephole eye, fingers under door | 1, 2 | chain off |
| 3 | 3:33 | Warped music box in the bathtub; she appears only in the mirror | 5 | — |
| 4 | 3:51 | Hall light flickers on, she stands at the end of the hall | 3 | stare too long / open eyes while near |
| 5 | 4:12 | Flashlight dying → batteries in kitchen; she follows behind, TV shows her | 4 | turn around / stop walking |
| 6 | 4:44 | Alarm, Mom's door bursts; hide in louvered closet, hold breath | 6 | seen / breathing / light on |
| 7 | 5:52 | Fake Mom knocks, then uses a key; real sunrise; real Mom (no knock) | 1, 2, 7 | chain off for the knocker |

Ending: real Mom comes in at sunrise → white → "She works nights again on Thursday." → knock knock knock.

## Mechanics
- WASD move, mouse look, Shift sprint, E/click interact, F flashlight, hold Space close eyes,
  hold Shift (while hiding) hold breath, Tab re-read note, Esc pause.
- Child eye height (1.18 m); entity is 2.35 m and stoops under the ceiling.
- Fear value drives heartbeat, breathing, vignette, chromatic aberration, flashlight flicker.
- Death = jump scare → black → rule-specific line → retry from chapter start.

## Tech
- Three.js r160 (CDN import map), WebGL2, physically based lights, PCF soft shadows.
- 100% procedural assets: canvas-generated PBR textures (color/normal/roughness), procedural
  geometry for the apartment, props and the creature.
- Post: bloom + custom VHS/film shader (grain, vignette, chromatic aberration, lens distortion,
  eyelids, peephole fisheye, glitch, fear pulse).
- Real-time mirror (Reflector) and a render-to-texture "security cam" on the TV.
- Web Audio: HRTF spatial audio, convolution reverb, all sounds synthesized (rain, thunder, knocks,
  footsteps, heels, creaks, phone bell, music box lullaby (Brahms, public domain), formant voice
  babble under subtitles, heartbeat, breathing, drones, stingers, shriek).
- Scripted director with abortable async chapters; checkpoints in localStorage.

## Build
`src/*.js` are concatenated in order into `src/template.html` by `node build.js` → `index.html`.
