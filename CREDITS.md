# Credits

This simulator is built on other people's work. Five parts of what you have
just downloaded belong to somebody else, and your rights to them come from
them, not from this repository's licence.

**The project's own code and artwork are [MIT](LICENSE). Nothing on this page
is.**

The same list is inside the app itself — **Menu → About → Credits…** — because
the simulator travels as one self-contained HTML file, and most of the people
who ever run it will never see this page.

---

## The 3D geometry — MrBaddeley

The MK4 astromech and the Polar Mouse are **MrBaddeley's designs**, sold as
paid models through his Patreon. The rigged geometry in this repository
(`src/js/cad/payload.js`, `src/js/cad/mouse-payload.js`) is derived from those
models and is included **with his permission**.

**That permission is for this project to publish them, and it does not travel
onward to you.** You may run the simulator and you may modify the simulator.
You may not extract, redistribute, print, sell or repackage the geometry. If
you want the models — and they are the best astromech models there are — get
them from him:

> <https://www.patreon.com/mrbaddeley>

If you are forking this repository and republishing it, ask him yourself first.
He said yes once; that is not the same as saying yes to everyone.

## The firmware — Dan Kraus and the Padawan360 project

This simulator is a model *of* the Padawan360 family of Arduino sketches. The
three firmware profiles in `src/js/profiles/` are hand ports of:

- [padawan360](https://github.com/dankraus/padawan360) — Dan Kraus, **BSD-3-Clause**
- [Astromech-padawan360-mod2026](https://github.com/sel-uis/Astromech-padawan360-mod2026)
- [Padawan360_mega_maestro_DYSV5W](https://github.com/Imperiallandm/Padawan360_mega_maestro_DYSV5W)

The `.ino` files under `tests/fixtures-sketches/` are upstream sketches, kept
verbatim so the transpiler is tested against the real thing rather than
something written to pass. They carry their own copyright and licence headers;
those stay as they are.

BSD-3-Clause requires that the copyright notice and disclaimer travel with the
code. This file is that notice. The upstream authors have not endorsed this
simulator and are not responsible for it.

> Where the simulator's model of a sketch and the sketch itself disagree, the
> sketch is right and this is a bug. Several **real firmware bugs** were found
> that way and are documented in `HANDOVER.md` §4 — they are reported as
> findings about the sketches, not as criticism of the people who wrote them.
> Everyone in this hobby is standing on Dan Kraus's work.

## three.js

The 3D renderer, r128, vendored in `src/vendor/three.min.js` so the single-file
build runs offline. **MIT licence**, © three.js authors.
<https://threejs.org>

## The typeface — IBM Plex Mono and IBM Plex Sans

`src/css/01-tokens.css` vendors **IBM Plex Mono** and **IBM Plex Sans** — 400
and 600 weights, latin subset only — as base64 `woff2` data URIs, so both
builds carry their own type and render it with no network request and no
system-font substitution. © **IBM Corp.** Licence: **SIL Open Font License
1.1** (<https://scripts.sil.org/OFL>).

The OFL requires its own licence text to travel with the fonts it covers. It
does not yet — there is no OFL licence file anywhere in this repository for a
reader to find. That is a gap worth closing; which file it goes in is Mike's
call, not this one's to make.

## The board photographs

- **Pololu's** labelled Maestro top-views (`src/js/app/board-img.js`) come from
  their own product pages, and drive the clickable pin map on the wiring sheet.
  <https://www.pololu.com>
- The **hardware-card photographs** in `src/art/boards/` are the respective
  manufacturers' product images — Arduino, Adafruit, Dimension Engineering,
  Flipsky, DY, and others.

Both are reproduced small, for identification: the job they do is to answer
"is *this* the board I am holding?" Nobody's photograph is the product here. If
you own one of these images and would rather it were not included, say so and
it will be removed — `src/art/boards/README.md` explains that every card falls
back to a drawn stand-in, so removing one costs nothing.

## Printed Droid

The dome panel numbering the top-down dome map is drawn to follows
[Printed Droid's reference drawing](https://www.printed-droid.com/kb/r2-d2-terminology).
The **layout** is fact about the droid and is drawn procedurally here; their
drawing is their own work and is not reproduced.

## And the club

The R2 Builders Club, the astromech.net forums and the people who worked out
all of this a decade before any of it was written down. This project is a
sim; they built the droids.

---

*Star Wars, R2-D2 and related marks are Lucasfilm's. This is a
non-commercial fan project with no connection to, or endorsement from,
Lucasfilm or The Walt Disney Company.*
