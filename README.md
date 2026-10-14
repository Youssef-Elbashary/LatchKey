# Latchkey

A first-person horror game for adults (about 30 minutes) that runs in the browser.

You are a kid home alone at 3:00 AM. Mom works night shifts. The power is out, the phone is ringing,
and there is a note on the fridge with ten rules you have followed before. Something that sounds
exactly like Mom spends the night trying to get you to break them.

## Play

- Double-click `index.html` (Chrome, Edge or Firefox). It needs an internet connection the first
  time to fetch three.js and the fonts.
- Or serve the folder and open http://localhost:8790:

  ```bash
  python -m http.server 8790
  ```

- Headphones strongly recommended. Contains intense jump scares, blood, flashing light and loud
  sounds (there is a "reduce flashing" setting).

## Controls

| Key | Action |
|-----|--------|
| WASD / arrows | move |
| mouse | look (click the screen to capture the mouse) |
| Shift | run |
| E / left click | use |
| F / right click | flashlight on / off |
| hold Space | close your eyes |
| hold Shift (in the closet) | hold your breath |
| hold E / left mouse (at 5:13) | hold the door shut |
| Tab | read Mom's note again |
| Esc | pause, settings, restart the hour |

Progress is saved per hour; "continue" on the title screen picks up where you died or quit.

## The night

| Hour | Your task | What happens | Rule |
|------|-----------|--------------|------|
| 3:00 | find your flashlight, read the note | Mom calls. | — |
| 3:09 | find the matches, light three candles | The phone rings again. The answering machine picks up. | 6 |
| 3:17 | check the three window locks | Knocking. Her voice through the door, the peephole. Something at the kitchen window. | 1, 2 |
| 3:33 | close the music box | The bathtub. The mirror. | 5 |
| 3:51 | — | She is in the hall, and every candle goes out. | 3 |
| 4:05 | get the spare key, lock Mom's door | Her door opens by itself. Someone in her bed is calling you. | 7 |
| 4:12 | get batteries from the kitchen | Something walks behind you. | 4 |
| 4:23 | get under the bed | Something crawls through the ceiling. | 8 |
| 4:44 | hide in the hall closet | She searches the apartment. | 9 |
| 5:13 | get a glass of water | Knocking from inside Mom's room. She runs. Your room. The door. | 10 |
| 5:52 | open the curtains | Dawn. Two people come to the front door. | 1, 2 |

The house is quiet on purpose: the rain and the drone sit low, and they drop out completely for a
second or two before something happens.

## How it is made

- three.js r160 with physically based lights, soft shadows, a real-time mirror, a render-to-texture
  security camera on the TV, bloom and a custom film/VHS pass (grain, chromatic aberration,
  eyelids, peephole fisheye).
- The flashlight casts five rays down its cone every frame (three-mesh-bvh) and caps its own
  brightness by the distance and reflectance of whatever it lands on, so the fridge, the tub or a
  door at arm's length never blow out to white.
- Canvas-painted textures: wallpaper, floorboards, tiles, photographs, crayon drawings, the paper mask
  (and what is under it), blood.
- Voices: 69 recorded lines and effects made with ElevenLabs (Mom: "Mother – Strong, Warm, Calm";
  the thing pretending to be her: Mom's voice bent with ring modulation and an octave-down shadow;
  what is under the face: "The Ancient Evil", layered with a pitched-down double and reversed
  reverb swells). Shouted lines play both voices at once.
- Web Audio: HRTF spatial sound, convolution reverb, a mix that keeps the rain under the steps and
  voices, plus synthesized rain, thunder, creaks, a rotary phone bell, a warped music box (Brahms'
  lullaby), breathing and heartbeat.

## Source and build

`src/` holds numbered modules and `template.html`. Recorded audio lives in `assets/audio/`
(originals) and `assets/audio/proc/` (trimmed mono 80 kbps copies that get embedded). Rebuild after
editing:

```bash
node build.js
```

This writes `index.html` (play locally) and `artifact.html` (the same page without the document
wrapper, for publishing). Both embed every clip in `assets/audio/proc/` as base64.
`assets/audio/ledger.json` maps each clip to its ElevenLabs generation session.

## Debugging

Open `index.html#debug`, then in the console use `window.__lk`:
`goto(n)` jumps to hour n (0–10), `await step(frames)` advances the simulation,
`await snap()` pins the current frame on screen, `trace()` logs every voice line that plays,
`until(fn)` / `walk(points)` drive automated playthroughs.
