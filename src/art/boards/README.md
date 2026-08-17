# Board photos — the drop folder

Anything you put in this folder becomes the picture on that hardware card in
the setup wizard. There is nothing to register: `tools/build.js` reads the
folder, inlines each file as a data URL, and both builds get it — so the
single-file `R2D2-Simulator.html` still works off a memory stick with no
image folder beside it.

**Drop a file in, run `./build.sh`, refresh.** Delete it and the card goes
back to the drawn stand-in (`src/js/config/board-art.js`).

## Naming

**Lower-case, and exactly the option id.** `MD-YX5300.jpeg` looks right and
does nothing — the build has no idea it is meant to be the `mdyx5300` answer.
If a photo you dropped in does not appear, this is why.

The file name is the whole API — it is the **option id**, which is the id in
`BUILD_OPTIONS` (`src/js/config/hardware.js`):

```
src/art/boards/<option-id>.jpg
src/art/boards/<step>-<option-id>.jpg      only if you need the two to differ
```

`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` and `.svg` all work. The
step-scoped name wins over the bare one, which matters only for `mod2026`
— it is an answer to the dome question, the body question *and* the
firmware question.

## The names, question by question

| Question | Drop this file | What it is |
|---|---|---|
| Controller | `xbox360.jpg` | Xbox 360 wireless pad + receiver |
| | `xboxusb.jpg` | Xbox 360 wired pad |
| | `rc.jpg` | an RC transmitter |
| Controller board | `megaadk.jpg` | Arduino Mega ADK |
| | `mega2560.jpg` | Mega 2560 + USB host shield |
| | `due.jpg` · `teensy.jpg` | the two parked boards |
| Servo hardware | `mini24.jpg` `mini18.jpg` `mini12.jpg` `micro6.jpg` | Pololu Maestros — **already supplied**, see below |
| | `mpca16.jpg` · `mpca32.jpg` | PCA9685 ×1 / ×2 behind a co-processor |
| | `mod2026.jpg` | a bare PCA9685 on the host's own I²C |
| | `nano.jpg` `uno.jpg` `mega.jpg` `esp32.jpg` | the co-processor boards |
| Dome motor | `syren10.jpg` | Dimension Engineering Syren10 |
| | `sabertooth_dome.jpg` | a second Sabertooth |
| Dome lighting | `astropixels.jpg` · `teeces.jpg` | |
| Foot drive | `sabertooth.jpg` | Sabertooth 2x25 |
| | `flipsky.jpg` | the FSESC **and** a hub motor in one shot, if you can |
| Sound | `dysv5w.jpg` · `mdyx5300.jpg` · `mp3trigger.jpg` | |

The **firmware** question deliberately takes no pictures: its answers are
sketches, not objects, and its ids collide with the hardware ones.

## The four you do not need to supply

`micro6`, `mini12`, `mini18` and `mini24` already have real, labelled
photographs in `src/js/app/board-img.js` — captured from Pololu's product
pages for the wiring sheet — and the cards use them automatically. Dropping
a file here with one of those names overrides it.

## Practical notes

* **Size them before you drop them.** They are base64'd into a 6.8 MB HTML
  file; a 4000-px product shot adds about 2 MB on its own. Around
  **600 × 450** and under **80 KB** is plenty — the card draws them 104 px
  tall.
* **A plain background reads best.** The card scales to fit, so a photo with
  the board filling the frame beats one with a bench in the background.
* **Licensing is yours to check.** These are inlined into a file you may
  hand to other builders. A manufacturer's product shot is usually fine for
  a personal build tool and usually *not* fine to redistribute — the Pololu
  photos already in the app carry that same caveat in
  `src/js/app/board-img.js`. If in doubt, photograph your own board on the
  bench: it is a better picture anyway, because it is the one you have.
