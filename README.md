# Latchkey

A first-person horror game for adults (about 30 minutes) that runs in the browser.

You are a kid home alone at 3:00 AM. Mom works night shifts. The power is out, the phone is ringing,
and there is a note on the fridge with ten rules you have followed before. Something that sounds
exactly like Mom spends the night trying to get you to break them.

## Play

- Online: https://latchkey-sigma.vercel.app
- Or double-click `index.html` (Chrome, Edge or Firefox). It needs an internet connection the first
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
| 3:09 | find the matches, light three candles | The phone rings again, and every ring is a little more wrong. The answering machine picks up. | 6 |
| 3:17 | check the three window locks | Knocking. Her voice through the door, the peephole. When that fails, a baby starts crying in the corridor (there is no baby on your floor). Something at the kitchen window. | 1, 2 |
| 3:33 | close the music box | The bathtub. The mirror. | 5 |
| 3:51 | — | She is in the hall, and every candle goes out. | 3 |
| 4:05 | get the spare key, lock Mom's door | Her door opens by itself. Someone in her bed is calling you. | 7 |
| 4:12 | get batteries from the kitchen | Something walks behind you. | 4 |
| 4:23 | get under the bed | Something crawls through the ceiling. | 8 |
| 4:44 | hide in the hall closet | She searches the apartment. | 9 |
| 5:13 | get a glass of water | Knocking from inside Mom's room. She runs. Your room. The door. | 10 |
| 5:52 | open the curtains | Dawn. Two people come to the front door. | 1, 2 |

The house is quiet on purpose. The rain is a dark murmur through the walls (you hear it properly
only at a window), the fridge hums in the kitchen, the hall clock ticks, and that's it. Right before
something happens everything drops out, and the clock and the fridge stop whenever she is near.
Between the scripted scares the flat is never quite empty: footsteps in the flat upstairs (nobody
lives upstairs), a dog down the street that suddenly stops, one strike of the phone bell, knocks
inside the wall beside you, your name from an empty room, breathing behind you in the dark. More
of them as the night goes on.

## How it is made

- three.js r160 with physically based lights, soft shadows, a real-time mirror, a render-to-texture
  security camera on the TV, bloom and a custom film/VHS pass (grain, chromatic aberration,
  eyelids, peephole fisheye).
- The flashlight casts five rays down its cone every frame (three-mesh-bvh) and caps its own
  brightness by the distance and reflectance of whatever it lands on, so the fridge, the tub or a
  door at arm's length never blow out to white.
- Canvas-painted textures: wallpaper, floorboards, tiles, photographs, crayon drawings, the paper mask
  (and what is under it), blood.
- Voices and recorded sound: 76 clips made with ElevenLabs. Mom is "Mother – Strong, Warm, Calm";
  the thing pretending to be her is Mom's voice bent with ring modulation and an octave-down shadow;
  what is under the face is "The Ancient Evil", layered with a pitched-down double and reversed
  reverb swells. Shouted lines play both voices at once. The effects include a real landline bell
  (slowed, lowered and shadowed an octave down when the call is the wrong one), rain and a fridge
  hum as seamless loops, far thunder, the crying in the corridor, footsteps through the ceiling.
- Web Audio: HRTF spatial sound, convolution reverb, a mix measured in place (the bed of the night
  sits around −48 dBFS with almost nothing above 2 kHz, so there is no static hiss; voices and
  scares land 30+ dB above it), plus synthesized creaks, knocks, a warped music box (Brahms'
  lullaby), breathing and heartbeat.

## Source and build

`src/` holds numbered modules and `template.html`. Recorded audio lives in `assets/audio/`
(originals) and `assets/audio/proc/` (trimmed mono 80 kbps copies that get embedded). Rebuild after
editing:

```bash
node build.js
```

This writes `index.html` (play locally), `dist/index.html` (what Vercel serves) and `artifact.html`
(the same page without the document wrapper, for publishing). All of them embed every clip in
`assets/audio/proc/` as base64. `assets/audio/ledger.json` maps each clip to its ElevenLabs
generation session.

## Deploy

The Vercel project is connected to this repository: every push to `main` runs `node build.js` on
Vercel (`vercel.json`) and publishes `dist/` to https://latchkey-sigma.vercel.app. To deploy by
hand from this folder:

```bash
vercel deploy --prod
```

## Debugging

Open `index.html#debug`, then in the console use `window.__lk`:
`goto(n)` jumps to hour n (0–10), `await step(frames)` advances the simulation,
`await snap()` pins the current frame on screen, `trace()` logs every voice line that plays,
`until(fn)` / `walk(points)` drive automated playthroughs.
