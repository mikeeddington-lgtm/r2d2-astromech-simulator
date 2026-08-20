# The builder's manual

Three documents, for the person who has downloaded the simulator and wants to
get a real droid moving with it.

| File | What it is |
|---|---|
| `R2D2-Simulator-Manual.html` | **The manual.** Twenty chapters, one self-contained file — seven screen-capture clips and ten screenshots inlined as `data:` URIs, so it opens offline and travels the same way the simulator does. **Generated; not tracked.** Build it with the recipe below. |
| `quickstart.html` | **Your first hour.** One printable A4 side. Hand this to somebody who will not read twenty chapters. |
| `bench-card.html` | **The servo bench card.** One sheet, printed double-sided: power rules and the order of work on the front, the silent-failure table and the numbers on the back. Meant to go on the workshop wall. |

The two printable pages are hand-written and tracked as they are — open them and
press ⌘P / Ctrl-P. The manual is assembled.

## Rebuilding the manual

The prose lives in `src/`, split into five files so a chapter can be edited
without scrolling past a megabyte of base64:

```
src/head.html      the shell — styles, the contents rail
src/body1.html     chapters 1-4    what it is · open it · the nine questions · drive it
src/body2.html     chapters 5-9    panels · the bench · the ends · power · importing
src/body3.html     chapters 10-15  bricks · music · the board · live drive · sketches · Maestro
src/body4.html     chapters 16-20  files · troubleshooting · keys · storage · glossary
src/build.py       assembles them, encodes the clips, inlines every asset
```

Media goes in `media/`, and `build.py` writes it there from the raw frames:

```bash
# 1. capture — needs a built R2D2-Simulator.html beside the rig
cp R2D2-Simulator.html tools/video-rig/
node tools/video-rig/cap_docs.js            # or: cap_docs.js bench

# 2. assemble
python3 docs/manual/src/build.py
```

`build.py` fails loudly on an unresolved `{{CLIP:…}}` or `{{IMG:…}}`
placeholder rather than shipping a manual with a hole in it.

### Why two video codecs

Every clip is encoded **twice** — VP9 in a `.webm` and H.264 in an `.mp4`, both
listed as `<source>`s. Chromium builds without proprietary codecs cannot decode
H.264 at all, and a manual whose clips silently show nothing is worse than one
with no clips. Together they cover every browser anyone will open this in.

`*.mp4` is ignored repository-wide (the raw renders in `output/` are enormous);
`.gitignore` carries one negation for `docs/manual/media/`, which is why these
particular mp4s are tracked.

### Why the built file is not tracked

Same reason `R2D2-Simulator.html` is not: a tracked build is how the shipped
file silently went four versions stale. Rebuild it from `src/`, and attach it
to a release when it is worth publishing.

## Keeping it true

The manual is written **against the running app**, not against `HANDOVER.md`.
Every screenshot and clip in it was captured from the dist at the version named
in its footer. When a flow changes, re-capture the clip that shows it — the
capture script is the manual's regression test, in the sense that it stops
working when the thing it was pointing at moves.
