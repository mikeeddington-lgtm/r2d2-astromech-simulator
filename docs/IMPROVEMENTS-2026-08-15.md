# Improvement review — v1.41.0, the whole codebase, journey first

*2026-08-15 · a cold fresh-state walkthrough of the built v1.41.0 (first run → drive → sequence → Builder → Track editor), then three parallel reviews over the source: journey/integration seams, code quality, and documentation truth. Every item below was verified against the code — file references are exact. Screenshots in `docs/shots/review-2026-08-15/`.*

> **STATUS: all four batches implemented in v1.42.0, same day.** The full
> what-and-how is the v1.42.0 change-log entry in HANDOVER. Two findings
> resolved by *disproof* rather than code: the kiosk sequencer-delete guard
> (1.7) is unnecessary by construction — `EDIT.active` and `kioskOn()` are
> provably mutually exclusive, every path to the desk refuses in kiosk; and
> the explode-recovers-mode test (2.6) pins the actual truth — a *compiled*
> routine always ends on the home frame by design, so only hand-authored
> frame lists can end open. One deliberate scope note: `maestro/pcaseq.js`'s
> uncalled setters were left alone — they are PCA Studio's public API.
> This file is kept as the record of what was found and why.

First, credit where it is due, because two of the newest things are the best-made things in the app: the **Track editor** is a model of the genre — one instruction line, three modes, the same curve maths as the stage so the preview cannot lie, and the warn-but-allow red stroke; and the **Builder pane** itself is clear, capped, and plainly worded. The problems below are almost all about the *road to* the new features, not the features.

---

## 1. The user journey

**1.1 The Builder dead-ends on the default build — top finding.** Fresh setup, defaults accepted (mod2026), pick Builder, add a hinge — the CHANNELS section of the selected part reads: *"mod2026 channels are fixed at compile time — switch the build to a Maestro to wire this joint."* That is a wall, in jargon, with no door, at the exact moment of the feature's first success. The constraint is real (`hwPins()` reads the fixed `SERVO_DEFS` table on mod2026 — app/boards.js:64-76), but Maestro **and PCA-with-co-processor** builds already take builder joints the same way the Other 1-10 placeholders ride `MSTR.channels[].act`. Smallest fix: plain words plus a door — "mod2026's servo map is compiled into the sketch, so Builder joints can't be wired on this firmware. **Open the setup ▸ Firmware** to switch to a Maestro or MaestroPCA build" — with the button. Better, and worth considering: on ANY build with a live channel table, let joints join it exactly as Others do. (scene/builder.js channels section; cad/ui.js:270 area.)

**1.2 Finishing setup with the Builder chosen drops you in front of an empty plate with no pointer to the tools.** The wizard ends with "Finish — take me to my droid" (even when the model is the Builder), lands in Drive view, and the parts bin lives two clicks away behind names that don't say "build" (Configure ▸ Model). The right rail meanwhile shows the DROID's Controls list — utility arms, dome pies — none of which the Builder has. Smallest fix set: model-aware Finish copy ("take me to my build"); when the Builder is the chosen model, land with the Model pane open; and the long-standing first-run "what next" card (Drive it — press START · Learn to drive · Build a sequence / Start building) finally earns its keep here. (config/wizard.js:1022; the card idea is carried unfixed from the 2026-08-14 UX review.)

**1.3 The wizard's Panels step isn't model-aware.** With MODEL=Builder ticked at step 1, the Panels step still lists the droid's five pies and fourteen side panels and says *"The droid is beside you — press ▶ to prove the travel."* It is not. `buildAssignSect` gates on `CAD.loaded`, never on `modelGet()` (config/tab.js:120-138). Smallest fix: under a non-droid model, open with one line — "these rows are the R2's panels; the ⟨Builder/head/Mouse⟩'s own parts are assigned ⟨in the Builder pane/…⟩" — and a door. Same class: the Track and Learn buttons happily enter droid-only modes while another model is on stage, silently (app/track.js:327, app/tutor.js:140) — one honest line ("the circuit drives the R2 — put it on the stage first" or auto-swap with a note) closes it.

**1.4 The stage button named after the Builder doesn't open the Builder.** Bottom-right the model chip reads BUILDER; clicking it opens the model *picker* (correct for the chip, wrong for the expectation it sets). Put a second door where the user is standing: when the Builder is on stage, a sibling 🔧 BUILD stage button that opens Configure ▸ Model directly. (app/main.js:205; scene/models.js:117-124.)

**1.5 Still open from the 2026-08-14 review — the first five minutes.** These were reported, agreed worthy, and remain unbuilt; they are still the top of the funnel: **(a)** pushing a stick while disarmed does nothing and nothing says why — the seam for a one-line hint is where drive input meets the disarmed state (input/pad-ui.js:66 area), plus making the DRIVE OFF chip clickable; **(b)** a genuine first run shows every wizard chip pre-ticked ✓ — assumed defaults are indistinguishable from answers; **(c)** "Step 1 of 15" counts six jobs as questions — group the rail ("Your hardware" / "Jobs — come back any time").

**1.6 Doors and vocabulary, the leftovers.** The dome map has its wizard door but not one on the Config ▸ Panels tab (app/panels.js:495 area) — same table, no map. The setup `.json` still doesn't carry everything a user makes: RC calibration, brick colours and favourite colours stay on the machine (app/setup-io.js:24; puppet cues were already a known gap) — work products should travel. And naming: "↩ Back to workshop" now collides with the *Workshop* backdrop (two meanings of one word), a few "routine"/"sub Xxx" strings survive at the basic level, and the BENCH view button still isn't the bench tool. One deliberate naming pass ends this class.

**1.7 Kiosk and the new surfaces — verify and guard.** The ✎ EDIT door and Configure view are hidden in kiosk by existing rules, and `trackEditOpen()` checks `kioskOn()` — good. Two to check and pin with tests: the Builder's stage raycaster (click-to-select on the stage — scene/builder.js:472) while kiosk chrome is hidden, and the sequencer's new Delete/Backspace multi-delete if the desk can be open when the kiosk drops. The four existing guards are the pattern; these are the fifth and sixth.

## 2. Code quality

**2.1 Harden the Builder restore path — the one item bordering a bug.** `mbRebuildFromPrefs()` (scene/builder.js:319-347) trusts a hand-edited or damaged setup file: `sp.pos.x` dereferenced unguarded (TypeError on a missing field), pass-2 `mbReparent()` skips the cycle guard `mbSetAttach()` enforces live (two parts naming each other as parent = both silently vanish), and `MB_HARD_CAP` isn't re-checked. Its sibling `track.js` validates field-by-field with fallbacks and has tests for garbage input — mirror exactly that, plus a hand-edited-file test.

**2.2 One channel-option renderer, one label rule — finish the job.** Three renderers of "channel ↔ part" still exist, and the two not yet consolidated show wrong names *today*: the Maestro pane uses the hand-maintained static `PART_LIST` (maestro/boards.js:92 — "Dome pie 1" where everything else says "Pie 1", and it will never learn a user rename), and `cad/select.js:188-207`'s Port row is a self-confessed hand-copy of `cad/ui.js`'s builder that shows **raw act ids** ("now: pie3") in its taken-channel note. Consolidate both onto `chPartOptions()`/`chLabel()`/`actPartLabel()` — the seams built for exactly this in v1.40.0.

**2.3 One Escape, not six.** Six overlays each hand-roll the same capture-keydown/dialog-precedence/close pattern (wizard dome-map, import wizard, builder workspace, bench, track editor, startup). Extract a tiny shared `escGuard(closeFn)`; tests/keyboard.test.js's nine Escape assertions are the safety net. This is the codebase's own "small seams" rule applied to itself.

**2.4 Split `setup-hw.js` (1,558 lines) at its own comment boundaries** — wizard shell + steps / the channels table / the calibration dial — three manifest entries, no behaviour change. Optional second: the inspector column out of blocks-ui.js (~275 lines). `config/hardware.js`'s data/behaviour split only if it keeps growing.

**2.5 Dead weight, verified.** ~14 functions with zero call sites (including `blkSelPrimary` — added by the v1.40.0 multi-select work itself and never used; also five in config/hardware.js, `mbDeselect`, `anzToggle`, two whole uncalled section builders in look/startup.js:93+), and ~40 lines of dead CSS in 07-startup/03-pad (the pre-v1.36 servo-chip picker classes; the two NEW css files are clean). One caveat: maestro/pcaseq.js's uncalled setters are plausibly PCA Studio's public API — verify against the Studio checkout before deleting anything there.

**2.6 Test gaps worth closing before they close themselves.** Multi-select undo asserts "undo became possible", never that the bricks actually come back; `blockExplode` is never fed a sequence that was itself compiled from 'o'/'c' mode bricks (the zero-baseline assumption is untested); the dome map's holoprojector two-click pan→tilt rule has no test; and 2.1's restore validation. Four small tests.

**2.7 Perf: nothing to do — recorded so nobody chases it.** The dist's growth 6.59 → 7.05 MB is almost entirely regenerated payload data, not app code (the Track editor + Builder together are under 50 KB of source); `wiringRows`'s per-row regex runs only on explicit sheet renders.

## 3. The documentation has fallen behind the app

README: "seven stylesheets" (14), "4 MB file" (6.8 MB), "twenty-eight suites" (29+), the module table is missing ~20 files across six areas (all of maestro's growth, builder.js, track-edit.js, puppet, cues, workspaces, sketch-import…), the test table lists 17 of the suites, and "three models" is four. HANDOVER §2 still says 93 JS / 12 CSS / 28 suites / 6.55 MB and contradicts itself ("eight hardware questions" vs "nine" two lines apart); §5's area table predates the motion modes, the Other channels, the Track Builder and the Model Builder entirely. This is one sitting's docs pass, and it should ride with whatever batch goes next — the README is the front door for the "publish it" plan in §6.

## 4. Suggested order

| Batch | Contents | Size |
|---|---|---|
| 1 — the Builder's road | 1.1 door + plain words (and ideally joints-on-any-live-table), 1.2 land in the pane + first-run card, 1.3 model-aware Panels/copy, 1.4 🔧 BUILD door | one release |
| 2 — the first five minutes | 1.5 a/b/c (arming hint, assumed-vs-✓ chips, grouped rail) | small |
| 3 — robustness + seams | 2.1 restore hardening, 2.2 label consolidation, 2.3 escGuard, 2.6 tests, 2.5 dead-weight sweep | one release |
| 4 — words and docs | 1.6 naming pass + setup.json completeness, §3 docs pass, 2.4 splits | small + rolling |
| — | 1.7 kiosk checks fold into whichever batch ships first | — |
