# The builder's manual

Three documents, for the person who has downloaded the simulator and wants to
get a real droid moving with it.

| File | What it is |
|---|---|
| `R2D2-Simulator-Manual.html` | **The manual.** Twenty-one chapters, one self-contained file — eight screen-capture clips and ten screenshots inlined as `data:` URIs, so it opens offline and travels the same way the simulator does. **Generated; not tracked.** Build it with the recipe below. |
| `quickstart.html` | **Your first hour.** One printable A4 side. Hand this to somebody who will not read twenty chapters. |
| `bench-card.html` | **The servo bench card.** One sheet, printed double-sided: power rules and the order of work on the front, the silent-failure table and the numbers on the back. Meant to go on the workshop wall. |

The two printable pages are hand-written and tracked as they are — open them and
press ⌘P / Ctrl-P. The manual is assembled.

## Rebuilding the manual

The prose lives in `src/`, split into five files so a chapter can be edited
without scrolling past a megabyte of base64. **Chapter numbers are plain text
in both the heading and the nav link**, so inserting one means renumbering the
rest — key the edit off the `id`, never off the number, and fix the handful of
"see chapter N" references in the prose first, while the old numbers still mean
the old things.

```
src/head.html      the shell — styles, the contents rail
src/body1.html     chapters 1-4    what it is · open it · the nine questions · drive it
src/body2.html     chapters 5-10   the servo rack · panels · the bench · the ends · power · importing
src/body3.html     chapters 11-16  bricks · music · the board · live drive · sketches · Maestro
src/body4.html     chapters 17-21  files · troubleshooting · keys · storage · glossary
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

### Assembling with no captures at all

Step 2 works on its own. `media/` is tracked, so a fresh clone — or the release
workflow on a `v*` tag — assembles the whole manual from the encoded clips and
stills already in the repository: no browser, no ffmpeg, about two seconds.

```bash
python3 docs/manual/src/build.py     # reuses media/, says so per clip
```

That is what makes the download link in the top-level README work: the manual is
attached to the release beside `R2D2-Simulator.html`, built the same way, for
the same reason. Step 1 is a **human** job — run it when the UI a clip points at
has actually moved.

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

## The manual, from inside the simulator

Since v1.58.0 the app itself has four doors onto this file — a **📖 Manual**
button in the header, one on the setup screen's head, a card in the Learn tab
and another at the top of the **?** panel. All four go through `MANUAL_URL` in
`src/js/app/manual.js`, which points at
`releases/latest/download/R2D2-Simulator-Manual.html`.

**So the manual has to be attached to every release.** A tag that ships
`R2D2-Simulator.html` without its manual leaves four buttons in the app
pointing at a 404. `tests/chrome.test.js` pins the URL's shape; nothing can pin
the other end but the release itself.
