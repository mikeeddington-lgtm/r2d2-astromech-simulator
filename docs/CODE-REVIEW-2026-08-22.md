# Code review — 2026-08-22 (v1.68.0 → v1.69.0)

> **STATUS.** Full-source audit of `src/` (106 modules), `tools/`, `tests/` and
> `arduino/`. **61 findings confirmed and fixed in v1.69.0**, each with a
> regression test watched red against the pre-fix tree. **29 further findings
> are HANDED OFF** — they live in files another session had uncommitted at the
> time of the review (`maestro/{export,import,servo-cfg,ui-pane,starters,
> builder,pca-gen-sim}.js`, `test.sh`, `tests/pcaseq.test.js`) and were
> deliberately not touched. Those are listed in §9 with enough detail to apply
> without re-deriving anything.
>
> Suite: **4658 → 5309 assertions**, 36 suites × 2 builds + PCA Studio's smoke,
> all green.

## How this review was done

Eight reviewers read every module in `src/js` (excluding the 24,000 lines of
generated model data in `cad/payload.js` and `cad/mouse-payload.js`), the build
system, all 37 test suites and the Arduino library. Four more drove the built
app in a headless browser as first-time users — that half is in
`docs/UX-REVIEW-2026-08-22.md`.

The standing rule for every reviewer was **prove it or drop it**. Most findings
below were reproduced by executing the actual source under node or in a page —
the compiler, the exporters, the RC maths, the engine — rather than by reading.
The firmware overrun was reproduced under AddressSanitizer. Where a finding is
inferred rather than executed, it says so.

Each reviewer also produced a **refuted** list — things that looked wrong and
are not. Those are folded into §10 so nobody re-finds them.

---

# §1 Hardware — the ones that move a real servo

### 1.1 `HW.rebuild(true)` does not carry `aim` — CRITICAL
`src/js/maestro/hw-host.js:171`

`rebuild(keep)` copies `active`, `pos256`, `vel256` and `target` from the old
engine to the new one, and not `aim`. `pcaCreate` → `pcaGoHome` has already set
`aim` to the channel's home; `aim` is what `pcaStepChannel` integrates toward
(`const T = s.aim<<8`). So after **any** bench edit — ticking boot or rev,
changing ease, typing in min/max/centre (which fires per keystroke), saving or
cancelling the calibration dial, setting a Part, finishing the wizard — every
driven channel ramps back to home. On a channel with `homemode:'Off'`
(`pcaHomeQus` = 0) it drives hard into `c.min` **and stays there**, because the
`d===0` repair branch is unreachable once `pos256` is clamped at `c.min<<8` and
`T` is 0.

Proven, boot-off channel driven to 7000:

```
after : {pos:7000, aim:0, target:7000}
trace : 6988, 4000, 4000, 4000, 4000 …   pinned at c.min for good
```

The 3D droid does not show it — `ACT_T` is only written by `HW.drive` — which
is why it survived. With a board connected the clock is running and
`HWE.onWrite` → `serialWrite`, so it is delivered to real servos.

**Fixed:** `s.aim = o.aim` copied and clamped with the others.
**Residual:** the belt-and-braces repair inside `pcaStepChannel` (`pcaseq.js`)
was not applied — that file was out of scope. See §9.

### 1.2 The Maestro wire bypasses the channel clamp — CRITICAL
`src/js/maestro/hw-host.js:205`

`HW.drive` calls `pcaSetTarget(E, ch, qus)`, which clamps into the channel's
own min/max, and then hands the **unclamped** `qus` to `serialMove`, which does
no clamping of its own. The only remaining bound is the protocol's 0–16383.

Proven — channel calibrated 1200–1600 µs, frame asks 2000 µs:

```
wire: [{cmd:'SetSpeed', ch:5, v:300}, {cmd:'SetTarget', ch:5, qus:8000}]
engineTargetQus: 6400   channelMaxQus: 6400
```

2000 µs went on the wire while the engine, the model and the bench all read
1600. This contradicts the promise written into `live-drive.js:30-31` — *"a
routine built on a different droid cannot drive this one past its stops"* — and
the bench's own advice to open the board's stored limits to the full
992–2000 µs removes the other backstop.

**Fixed:** the wire now carries the engine's post-clamp `target`.
`calDrive()` still reaches past the stored ends, because it widens `c.min`/
`c.max` on the live channel object and `pcaCreate` holds `MSTR.channels` by
reference — asserted by a new test.

### 1.3 A new pulse frequency is streamed but never sent to the board — CRITICAL
`src/js/maestro/hw-host.js:135`

`setupApply()` does `HW.setSetup` / `HW.setOsc` / `HW.applied`. `applied()`
starts with `rebuild(true)`, which ends in `serialSyncAll()` → `serialWrite` →
`serialTicksFor()` — the **new** rate. Nothing on that path calls
`serialConfig()` or `serialSetFreq()`, the only writers of the board's config
frame. Then `setupApply` disconnects, leaving the board holding it.

```
wanted 1500 µs → 307 ticks at 50 Hz (1499 µs, correct)
              → 1229 ticks at 200 Hz → the 50 Hz board emits 6001 µs
```

A 6 ms pulse on every channel at once, indefinitely.

**Fixed:** a new `hwCfgPush()` runs `serialAllOff()` + `serialConfig()` and
clears `SER.lastTicks` before the re-stream, keyed on a record of what was last
sent, and does nothing when nothing changed.

### 1.4 `mstrQuiet()` leaves the Set Speed cache stale — HIGH
`src/js/maestro/maestro-link.js:211` (symptom at `serial-link.js:633`)

`serialMove` de-duplicates Set Speed against `SER.lastSpeed`, which only
`serialConnect()` ever cleared. `mstrQuiet()` rewrites every channel's speed on
the board straight through `mstrTell` without touching it.

```
firstPlay:            [Speed ch5=300, Target ch5=6000]
after quiet toggle:   [Speed ch5=0, Accel ch5=0]      ← board now unlimited
replay:               [Target ch5=4000, Target ch5=6000]   ← no Set Speed
lastSpeed5: 300
```

The routine believes it asked for a 300-unit ramp; the board slams each target
at full speed. **Fixed** in `mstrQuiet()` itself, so any future caller is
covered — the same reason `serialSetMode()` clears `SER.lastTicks`.

### 1.5 `chAssign()` never saved the part mapping — CRITICAL (work loss)
`src/js/app/boards.js:255`

The live branch wrote `c.act` and `c.name` into `MSTR.channels` and called
`rebuildMaestroUI()` — three render calls. The *planned* branch persisted;
this one did not, and `HW.save()` → `servoStoreSave()` is the only writer of
`r2sim.servo.v1`. So every panel→channel assignment made on the Panels step or
the Outputs detail panel was silently reverted on the next reload. `HW.setPart()`
does `this.save()` for exactly this reason. **Fixed**, plus the null-row guard
`HW.setPart` already carries.

### 1.6 Every dome side panel rests half open — HIGH
`src/js/maestro/boards.js:137`

```js
const ACT_CENTRED = /(pan|tilt|nod|spin|rot|wag)/i;
```

An unanchored substring test, so **`pan` matches `panel0` … `panel13`** and
`actRestNorm()` calls all fourteen side panels bipolar, resting them centred at
6000 instead of shut at 4000. That is precisely the half-open-panel complaint
the twenty-line comment directly above it was written to close. `chanRest()` is
documented as *the* one reader for this question, so the wrong answer reached
`EDIT.live`, `chanPosReset`, `makeStarter` and beat-built routines.

**Fixed** with a whole-token predicate, verified against all 56 actuator ids
that exist in the running app: **exactly the fourteen panels change answer**,
the six holoprojector axes still centre, and a hypothetical `pantilt` with no
separator still centres.

### 1.7 `serialAdoptBoardCount()` ended the setup wizard — HIGH
`src/js/maestro/serial-link.js:289` (twin at `setup-hw.js:308`)

`wizFinish()` is the wizard's **exit**: it marks the build done, closes the
startup card, and burns the once-ever first-run card. It was being used as
shorthand for "re-apply the build", an idiom copied out of the test suites.

Worse, the trigger is present on a genuine first run: `buildDefault()` ships
`pcaBoards:2`, so `HW.short()` is `{want:32, have:24, missing:8}` before you
have answered anything. Pressing **add the missing 8 rows** made the wizard
vanish, logged "build configured", and meant setup never auto-opened again.

**Fixed in both places:** `buildApply()`, which is what `buildSet` has already
run and what these callers actually want.

### 1.8 `SER.modeWarn` survives disconnect — LOW
`src/js/maestro/serial-link.js:515`. `hwLinkRender()` ends with
`monWarn(SER.modeWarn)` and runs on every `setupRender()`, so the next
keystroke on the Channels step put the "Connected to a Pololu Maestro" banner
and its live buttons back on screen with nothing connected. **Fixed.**

---

# §2 The sequence compiler

### 2.1 An abutting brick blanks the interval before it — CRITICAL
`src/js/maestro/blocks.js:649`

Act bricks are sampled at the **end** of each interval, and a brick's window is
inclusive at its start. So at `next === B.t0` the later brick returns its value
at local 0 — fully shut — and, being later in `blockList`, beats a brick that
is genuinely mid-hold.

```
"Opens" [0,1000] then "Opens then closes" [1000,2000]:
  t0    200 [8000]
  t200  800 [4000]     ← 0.8 s commanded SHUT in the middle of the hold
  t1000 200 [8000]
scrub @600 = 8000      ← the preview says open; the frames say shut
```

Dropping the same two bricks in the other order produced the correct file, so
identical timelines exported differently. **Fixed:** a brick's start instant no
longer claims the interval before it. A deliberate overlap still layers, as the
comment at `:643` promises — both directions are asserted.

### 2.2 Save with an existing name destroyed the other routine — CRITICAL (work loss)
`src/js/maestro/blocks-ui.js:1583`

The handler set the name and then called `blockSaveAs`, which replaces **by
name** — so `findIndex` found the *victim*.

```
before: [Wave(500ms), Dance(900ms)]   loadout ['Wave','Dance']
open Dance, type "Wave", press Save
after:  [Wave(900), Wave(900)]        loadout ['Wave','Wave']
both board slots now play the 900 ms routine; the original Wave is gone
```

No confirm, no log, no undo. **Fixed:** the clash is detected before any
mutation, and offers Replace / Keep both (the latter using the new
`seqUniqueName`). A confirmed replace leaves exactly one sequence and one board
slot carrying the name.

### 2.3 "Work them out and review…" lost the original frame list — CRITICAL (work loss)
`src/js/maestro/blocks-ui.js:802`

The review door snapshotted the original into `BLK.conv` **in memory only** and
never called `blkConvKeepOriginal`, while `buildSequencer()` → `servoStoreTouch()`
wrote the *converted* sequence to `r2sim.servo.v1` 500 ms later. Leaving via
`setStripMode('pad')` never reaches the restore path, so a tab switch or a
reload destroyed an imported routine permanently. The module's own header at
`:774-780` states the opposite: *"BOTH doors save the original frame list as a
copy first."*

**Fixed:** the code now matches the header, and `blkConvDiscard` /
`blkConvCheckSeq` remove the copy by identity so its lifecycle is still exactly
bounded. A new test walks away via `setStripMode('pad')` and proves the original
survives in the persisted store.

### 2.4 `blockSaveAs` downgraded the ramp step — HIGH
`src/js/maestro/blocks.js:870`. The copy carried `name`, `frames`, `blocks` and
nothing else, so `blockStepMs` fell back to the legacy 120 ms and the next brick
edit rewrote the routine with 3–4× the frames — the exact regression v1.66.0
exists to prevent (measured ripple CV 1.33 at 120 ms vs 0.24 at 500 ms). It also
dropped the library `cat`. **Fixed** by carrying the whole sequence
(`Object.assign`), after checking every reader of the library array.

### 2.5 Two doors minted colliding sequence names — HIGH
`src/js/maestro/blocks.js:887` and `maestro/ui-pane.js:91`. One used
`lib.length+1`, the other `MSTR.sequences.length`, neither checked. Everything
downstream resolves a board slot **by name**, so a duplicate made one routine
unreachable from the board while another slot silently fired the wrong one.

```
pane + , library + , pane +  →  ['Sequence 0','Sequence 2','Sequence 2']
slot → library index: [0, 1, 1]      library index 2 invisible in the loadout editor
```

**Fixed on the library door** with a new `seqUniqueName(base)` helper in
`blocks.js`. The pane door and `musicBuildSequence` still need to call it — see
§9.

### 2.6 400 ms of dead tail on every compiled routine — MEDIUM
`src/js/maestro/blocks.js:611`. The final boundary already emitted a frame, and
the home frame was then appended unconditionally, so the last two frames were
byte-identical and `restartScript(n)` ran 400 ms long — which matters for
music-synced cues and for the script-size lint. The header printed
`seqTotal` (2.4 s) while the inspector printed `blockEnd` (2.0 s).
**Fixed**, and the invariant is *stronger* than before: the last frame is now
always the base pose and always named `home`. A routine left mid-open by an
`'o'` brick still gets its closing frame — asserted both ways.

### 2.7 Half-millisecond boundaries produced junk frames — MEDIUM
`src/js/maestro/blocks.js:197`. `Math.min(…, b.dur/2)` on an odd-length brick is
an x.5 value, and frame names are `'t'+Math.round(t)` — so the compiler emitted
a 1 ms frame and two `<Frame>` elements with the same name. Hit by roughly half
of all exploded library bricks. **Fixed** at both ends: `Math.floor(b.dur/2)`,
and `blockBoundaries` now rounds at the door so a fractional import cannot
reintroduce it.

### 2.8 The inspector's Duplicate dropped the motion mode — MEDIUM
`src/js/maestro/blocks-ui.js:1334`. The multi-select twin passes `mode:b.mode`;
this one did not, so "Opens" / "Closes" / "Closes then opens" all silently
became "Opens then closes". **Fixed.**

### 2.9 The Advanced-only Ramp step control was never hidden — MEDIUM
`src/css/09-sequencer.css`, `src/js/maestro/ui-sequencer.js:170`.
`sqStepSync()` toggles `.hide`, but the only `.hide` rules in the estate are for
four other elements, so `.blkswitch{display:flex}` always won. And the function
returned *before* repopulating the `<select>`, so the hidden box kept the
previous routine's options and its change handler clamped a legacy 120 up to
200 — which `blockStepMs`'s own comment says must never happen.
**Fixed:** `#sqStepWrap.hide{display:none}` (named, not generic — a generic
`.hide` at class specificity would be decided by source order against every
later `display` rule), and the rebuild moved above the early return.

### 2.10 Beat-built routines closed to `c.home`, not to the shut end — HIGH
`src/js/maestro/music.js:276`. The v1.46.0 travel fix corrected the *open* half
and left the shut half on raw `c.home`. Two real failures: a **reversed**
channel gets `openOf(c) === c.home`, so open and shut are the same number and
the panel never moves; an imported `homemode="Off"` channel has `home:0`, which
`applyFrameTargets` reads as "leave alone", so the panel stays open for the rest
of the routine. **Fixed** with `shutOf` and `chanRest`.

Two existing assertions in `music.test.js` had to be corrected: both used
`t !== c.home` as a proxy for "open", which only worked while the bug was
present. They now ask the question directly, which is stronger.

---

# §3 Build configuration and setup

### 3.1 A smaller board answer silently truncated the calibrated table — CRITICAL (work loss)
`src/js/config/hardware.js:1213`

`buildApply()` called `setBoard(want)` unconditionally, and `setBoard()` does
`MSTR.channels.slice(0, bd.ch)`, truncates every `f.targets`, and calls
`servoStoreSave()` — persisting the loss. It never asked.

```
before: 24 channels, ch20 = {"name":"Panel 20","min":4220,"max":7780,"act":"panel20","calibrated":true}
Setup ▸ Servo hardware ▸ Mini Maestro 12
after : 12 channels, ch20 = undefined, frame targets truncated, saved
```

Same from taking PCA expanders 4 → 1: forty-eight rows. The comment two hundred
lines below asserted the opposite — *"setBoard() … asks first (see
buildLiveIssues)"* — and `buildLiveIssues` **does not exist anywhere in the
tree**.

**Fixed:** grow is still silent; shrink is an offer, naming the row count and
how many are mapped to a part, computed from `setBoard`'s own arithmetic so the
number in the question is the number that happens. `buildApply()` stays
synchronous and defers the confirm — making it async would leave a modal open
across whatever ran next. The false comment is gone.

### 3.2 A pre-v1.36 `PREFS.build` reads as the wrong servo hardware — HIGH
`src/js/config/hardware.js:730`. `buildGet()`'s only reconciliation is a blind
default fill, so a blob that names `domeServo`/`bodyServo` but has no
`servoDevice`/`servoTopo` inherits the shipped default (PCA9685 ×2).
`buildNormaliseServos()` — the one function that reads a board answer back into
a shape — was only ever called from `buildSet()`.

```
v1.35 blob (mini24 + mini12) → servoDevice 'pca', label "PCA9685 × 2"
                             → buildMaestroBoard() still 'mini24'
```

So the rail chip, the review table and the wiring sheet said PCA while the sim
ran Maestro; correcting it by clicking the Maestro card collapsed two boards
into one, which fed §3.1 and truncated the table. **Fixed**, guarded on what
the *stored* blob actually had.

### 3.3 "Keep these settings" wrote a record that reads back as nothing — MEDIUM
`src/js/config/wizard.js:1161`. It seeded `{how:'', …}` and `servoCfgSrc()`
returns null on a falsy `how`, so the button was inert — toast and log fired,
the card never showed as chosen, every time. Reachable whenever the table
carries travel but nothing wrote provenance: a dropped `.mstr`, a starter table,
or a bench session left via × or Esc. **Fixed** with a real `how:'kept'`
provenance, guarded so a truer record is never overwritten.

### 3.4 The wizard's dome map ignored the saved rotation — MEDIUM
`src/js/config/wizard.js:1809`. The bench's copy passes `rotate: setupDomeRot()`
and persists it *because a builder's bench does not move between sessions*; the
wizard's copy defaulted to 0 and offered no way to correct it, so the panel
under the pointer was the one on the opposite side of the dome. **Fixed**, and
the rotate control was added to the wizard's copy too — it needed no new CSS and
redraws only the map, so the slider is never rebuilt under the thumb.

### 3.5 The Boards spinner contradicted its own jumper table — MEDIUM
`src/js/maestro/setup-hw.js:541`. The stat printed `setupChannels()` — the
loaded table's size — beside the number you had just typed, so step 2 read
"24 channels · highest channel number 23" while the table three lines below
listed board 2 as channels 32–47. This is where Mike's *"still cant see servos
24 and above"* report starts. **Fixed:** the stat counts the boards on the
spinner, and when `HW.short()` is non-null it carries the same both-numbers
sentence and `growboards` button the Channels step already has.

### 3.6 Documentation drift — LOW
`buildDefault()`'s comment claimed the default "still ships `p0`"; it has
shipped `p1x2` since v1.46.0. `setup-hw.js`'s `max="8"` shadowed
`PCA_MAX_BOARDS_UI`. Both **fixed**; two more hardcoded 8s in `board-art.js`
and one in `setup-hw-channels.js` are handed off (§9).

---

# §4 RC transmitter — safety

The standing rule for this area is *"an auto-assignment that could make the
droid drive away is not a convenience"*. Three of the four findings are that
rule not actually holding.

### 4.1 The rest-position guard read the record, not the stick — CRITICAL
`src/js/input/rc.js:258`

```js
function rcRestValue(ch){ return rcNorm(ch, clamp(ch.mid, ch.min, ch.max)); }
```

`rcNewChan()` defaults an axis to `min:-1, max:1, mid:0`, so for a channel that
has **never been calibrated** this returns 0 wherever the stick physically
rests. A Mode-2 throttle rests at raw −1.

```
live norm at rest    = -1
rcRestValue says     =  0
rcRestWarnings       =  0 warnings
rcContribute         = {"ax":{"LY":-1}}     ← full reverse, hands off
```

This is not hypothetical — the panel *invites* it: *"Nothing has moved yet — run
the calibration above, **or tick 'show every channel' to assign one by hand**."*

**Fixed:** the check falls back to the live normalised value whenever
`ch.moved` is false, and the hand-assignment dropdown is now disabled for an
uncalibrated, unassigned channel with its first option reading *"calibrate this
channel first"*.

### 4.2 Un-ticking **Advanced** did not disarm direct-to-output bindings — CRITICAL
`src/js/input/rc.js:328`

The switch that exists to lock direct-to-output binding away did not lock it
away: `rcDirectApply()` never consulted `RC.advanced`, and the checkbox handler
did no cleanup.

```
RC.advanced = false
rcDirectApply() = true
MOT.drive = 102
simple-mode dropdown renders "— not assigned —"
```

It compounded: picking a target from that dropdown only promoted `mode` when it
was `'off'`, so the new Controller assignment did nothing while the old direct
binding kept writing `MOT.drive`. All of it persisted and restored on reload.

**Fixed, all three halves:** `rcDirectApply()` bails on `!RC.advanced`; the
checkbox positively demotes every bound channel, behind one confirm naming the
count; and the picker promotes from `'out'` as well as from `'off'`.

### 4.3 A proportional trigger delivered 128/255 with hands off — HIGH
`src/js/input/rc.js:315`. `(v+1)/2` assumes the channel rests at −1, but
`rcNorm()` returns 0 at rest for every `ctr:'rest'` channel — which is what a
knob, a slider or a centre-resting switch calibrates to, and what
`rcAutoAssign()` forces. `pollInput`'s noise floor is 25, so 128 sailed into
`XB.press.L2` permanently. On both Maestro sketches LT/RT select which
`restartScript()` slot a d-pad press fires and which sound bank a face button
draws from — so a permanently half-held trigger silently changes the meaning of
every other button on the set. **Fixed** by rescaling from the channel's own
rest point, which also removed a *false* warning on a `span` throttle.

### 4.4 Two identical dongles cannot be told apart — MEDIUM
`src/js/input/rc.js:99`. The module's own header says `Gamepad.id` is not unique
and the panel's hint says *"you wiggle a stick and pick the row that twitches"* —
and then every lookup keyed on that string, so both rows read "In use", both
buttons were disabled, and the second device was unreachable by either route.
`rcSelect()` also wiped the calibration with no confirm on a mis-click.
**Fixed:** identity is `{id, index}` with an id-only fallback for reconnects and
for prefs written before this, and `rcSelect` now asks.

---

# §5 Kiosk ("Sim only") containment

### 5.1 The part editor is reachable from the droid — CRITICAL
`src/js/cad/select.js:62`

`initSelect()` binds the pick straight to `#stage`, the one surface kiosk
deliberately leaves live, and nothing on the path to `buildSelCard()` called
`kioskOn()`. `10-kiosk.css` had no rule for `#selcard`. So a stranger left alone
with the laptop could click a panel and get a live position slider, a **Port
`<select>` that rewrites `MSTR.channels[n].act`**, a rename field, a colour
picker, the pivot/travel editor and "+ New group with this part".

The Model Builder's raycaster *was* given exactly this guard, with a comment
calling it *"the fifth guard in that style"*. The droid's never got the sixth.

**Fixed** in all three layers: `selectPart()` refuses (the funnel, as
`mbSelect()` does), `kioskEnter()` calls `deselectPart()`, and
`body.kiosk #selcard{display:none}`. The only two non-pointer callers of
`selectPart()` both live inside `#side`, which kiosk hides wholesale.

### 5.2 `appConfirm` leaked keystrokes to the pad mapper — MEDIUM
`src/js/core/dialog.js:66`. It handled Escape and Enter with no else-branch,
while `appPrompt` two functions below has the missing line and the reason. The
mapper's guards are the focused element and `uiModalOpen()` — which does not
know about `.dlgwrap` — so one click on the dialog text dropped focus to `body`
and both guards were gone. Reading the About box the natural way (click the
text, press Down or Space) fired D-pad and A presses at the running sketch.
**Fixed.**

### 5.3 A wrong kiosk password said nothing — MEDIUM
`src/js/app/kiosk.js:136`. The dialog simply closed — indistinguishable from the
button being broken. There *was* a toast, but `#toasts` is z-index 7 against the
dialog's 300, so it was only ever visible for the instant after the dialog it
referred to had vanished, in the opposite corner. And because the dialog went
away, an operator who fat-fingers their own password and keeps typing is typing
at the live pad: a walkthrough measured DRIVE climbing 29 → 37 and the gear
going SPD 1 → SPD 2 from the letters in two failed passwords.
**Fixed:** the prompt stays up with an inline message and re-asks. No lockout,
no counter — this is a convention laptop.

**Every other sibling-of-`#main` surface was enumerated and is shut** — see §10.

---

# §6 Model Builder, CAD and paint

### 6.1 Importing a model destroys the assembly and reports success — CRITICAL (work loss)
`src/js/scene/builder.js:1096`

`mbImportModelText` committed the file **before validating a single record**,
then `mbRebuildFromPrefs()` tore the assembly down, skipped every record it did
not recognise, and its closing `mbSaveState()` persisted the empty result.

Proven with the project's **own shipped example**:

```
BEFORE: 4 parts     IMPORT RESULT: {"ok":true,"count":0}
AFTER : 0 parts     PREFS.builder = {"v":2,"parts":[]}
TOAST : "loaded 0 part(s) from R2-model-simple-face.json"
```

A success word for total destruction, with no undo. The file declares `"v": 2`,
which equals `MB_SCHEMA`, so the "newer sim" warning never fired; its types are
`panel/eye/brow/mouth` and this build has `beam/plate/disc/hinge/ball/grip`.

**Fixed:** validate into a scratch list and commit only if something survived;
otherwise refuse, leave `PREFS.builder` alone, and name the unrecognised types.
A partial import now says what it dropped, and `mbSavedPartWhy()` distinguishes
*corrupt* from *this build has no part type "eye"*. The UI door confirms before
replacing a non-empty assembly.

### 6.2 `Object.prototype` keys pass as part types — CRITICAL
`src/js/scene/builder.js:539`. `MB_PRIM['constructor']` is `Object`, so
`!!MB_PRIM[sp.type]` validates it; `mbBuildGeometry` then returns `Object(...)`
whose `.group` is undefined and `mbRealize` throws — inside the function whose
own docblock says it **must never throw**, and after the live assembly is
already destroyed. The poison persists, so it throws again on every later switch
to the Builder and, at boot, rejects inside `main.js:293`'s promise as an
unhandled rejection: an empty stage on every reload, with no message.
**Fixed** with `hasOwnProperty` tests throughout, `Object.create(null)` maps,
`mbRealize` returning false instead of throwing, and `mbSetShown` catching so a
bad `PREFS.builder` cannot escape into `modelApply`.

### 6.3 Clearing a name or a colour deletes the part's motion — CRITICAL (work loss)
`src/js/cad/parts.js:62`, `:69`, `src/js/look/paint.js:146`. Three of the four
override writers pruned the record on a **subset** of the keys it can carry;
only `setPartMotion` checked them all. So setting a hand-authored motion and
then touching the colour scheme, or clearing the part's name, deleted the
motion — silently, because neither writer calls `motionApply`, so the part keeps
moving correctly until the next reload puts it back on the CAD rig.
**Fixed** with one `partOvPrune(name)` helper that has no key list to keep in
step, called by all four writers.

### 6.4 `partsLoad()` prunes against whatever model is loaded — HIGH (work loss)
`src/js/cad/parts.js:31`. It kept only overrides and group members present in
`CAD.partIndex` — which at every boot is the bundled shell-only payload
(measured: 175 parts, kinds `shell/leg/anim/outlier/panel/pie`, **no
`internal`**). `partsLoad()` does not save, but `partsSave()` serialises the
pruned set, and every rename, colour, motion and group edit calls it. So the
documented workflow — drop the full `.r2m`, name and group the internal parts,
reload, rename anything — permanently deleted the internal work.
**Fixed:** no prune on load. Every reader was checked first; all key by name and
pass over names they do not find.

### 6.5 `buildCad` tears down the live model before reading the new header — HIGH
`src/js/cad/build.js:78`. The first statement disposes the current model; the
first unguarded read of the incoming header is six lines later. With `materials`
removed the build throws and leaves `CAD.loaded === true` with the *old* header,
`CAD.moving` emptied, `CAD.slots` pointing at disposed materials, and nothing on
the stage — while the Model pane still claims "MK4 (bundled) · 175 parts ·
29 moving". **Fixed:** validate first, build into locals, and swap at a single
point after everything that can fail.

### 6.6 An unknown part kind is invisible with no checkbox — MEDIUM
`src/js/cad/runtime.js:48`. Visibility defaulted to hidden for any kind outside
a hardcoded seven, and the Show section only offered those seven. The project's
**own second container** — the Polar Mouse `.r2m`, which `ui-files.js` routes
here by extension — has kinds `{body, wheel, chariot}`: 130 parts loaded, all
invisible, zero checkboxes, empty stage, nothing logged.
**Fixed:** unknown kinds default to shown, and the list is built from the kinds
actually present.

### 6.7 `paintSave()` replaced `roleOf` wholesale — MEDIUM
`src/js/look/paint.js:178`. `PAINT.roleOf` is rebuilt from model-specific slot
keys, so the first colour touched under a second CAD model erased every role
override made against the first. `initPaint()` was careful on read and the write
path was not. **Fixed** by merging. `setSlotRole()` carried a hand-copy of the
same defect and now calls `paintSave()`.

### 6.8 Re-picking the model already on stage resets it — MEDIUM
`src/js/scene/models.js:92`. `modelSet()` gated only the log line, contradicting
its own comment, so re-selecting the Anzellan head snapped all eleven face
channels to home mid-sequence and reset the camera. **Fixed** with a guard on
"the preference has not changed *and* the stage already shows it" — the plain
identity test breaks callers that write `PREFS.model` and then use `modelSet` to
put it into effect. `anzRegister()`'s own idempotence is handed off (§9).

### 6.9 A leaked `BoxHelper` per selection — LOW
`src/js/scene/builder.js:973`. Measured 200 selections → 200 geometries created,
0 disposed. **Fixed.** For contrast, the CAD model-swap and the Builder rebuild
were both measured symmetric (44/44 geometries, 33/33 materials) — there is no
leak there.

---

# §7 App shell, layout and files

### 7.1 `map_()` is off by one across the whole negative half — HIGH
`src/js/core/util.js:44`

```js
const map_ = (x,a,b,c,d)=>Math.trunc((x-a)*(d-c)/(b-a)+c);
```

Arduino truncates the **quotient** then adds `out_min`; this truncated the sum,
and `trunc(q+c) === trunc(q)+c` only when `q+c ≥ 0`. Measured against a faithful
C-semantics reimplementation: **32,765 of 65,536 throttle positions disagree**
with the sketch. Reverse throttle, reverse turn, dome-left and the
`leftDirection===0` foot-PWM path were all one unit off, permanently — in an app
whose entire premise is that its numbers match the sketch's.

**Fixed.** One assertion went red: `profiles.test.js`'s `refMix()` — the
"straight transcription of the .ino" — carried **its own private copy of the
same bug**, so it agreed with the sim only because both were wrong. Corrected.

### 7.2 Three places mix viewport pixels with zoomed lengths — HIGH
`applyUiScale()` puts `zoom` on `<body>`, so anything measuring the viewport and
storing into the zoomed subtree is wrong by the scale factor.

- **`app/splitters.js:70`** — measured at scale 1.5: pointer at x=788, pane edge
  at x=432, stored `--sideW` 712 against a visual 1068. The `SPLIT_LIMITS` clamp
  is in the wrong space too, so the sidebar can swallow the stage while the
  clamp thinks it is in range. **Fixed** by dividing the delta by the zoom.
- **`app/main.js:145` and `app/hud.js:93`** — `#stagePick` and `#faultPop` are
  `position:fixed`, appended to the zoomed body, positioned from
  `getBoundingClientRect()`. At 1.5 the picker landed 267 px right and 208 px
  below its button. The `innerWidth` clamp could not help, being in the other
  unit system. **Fixed** by scaling the anchor rather than re-hosting, so the
  popover still scales with the UI.

### 7.3 The header status chips were unreadable at every size — MAJOR
`src/css/02-layout.css:45`, `src/js/app/main.js`

At the default 1440×900 and 100% all six chips truncated mid-word —
`VIRTUAL P_`, `DRIVE O_`, `NO BOA_`. At 150% two showed **no characters at
all** and the app title clipped; at 1024×700 they became six anonymous dots,
two of them the same grey, none with a `title`.

This is the app's single most important readout: **`Drive off` vs
`Drive armed`** is what a first-time user has to know before the droid will
move, and all four UX walkthroughs got stuck on it. The media query could never
have fixed it, because a media query reads the un-zoomed viewport while the
chips live inside `zoom`.

**Fixed** with a measured tier ladder — full words → compact words → dot with
the Drive state kept → bare dots, every one carrying a `title` and an
`aria-label`. Measured after:

| | 0.9 | 1.0 | 1.15 | 1.5 |
|---|---|---|---|---|
| **1440×900** | full labels | `PAD · FEET OFF · AUTO · SPD 1 · HP OFF · NO BOARD` | dots + `FEET OFF` | dots + `FEET OFF` |
| **1024×700** | dots + `FEET OFF` | dots + `FEET OFF` | dots + `FEET OFF` | dots, all titled |
| **800×600** | dots + `FEET OFF` | dots + `OFF` | dots, all titled | dots, all titled |

A second bug fell out of it: in kiosk the header is `display:none`, so every box
measures 0, "nothing is clipped" is true, and the cluster re-fitted onto the
widest tier and stayed there on the way out. Guarded and tested.

*Note:* `keyboard.test.js` pins `chDrive`'s DOM text to `Drive off`/`Drive
armed`, so the DOM text and the title are unchanged and `FEET OFF` is what is
*rendered*. Changing the DOM text means moving that suite with it.

### 7.4 The exported wiring diagram draws two boards as one — HIGH
`src/js/app/wiring.js:348`. `wiringSource()` was deliberately fixed to walk both
board locations, and the diagram then titled the sheet from `wired[0].board`,
drew **one** board box, and hung every channel off it with duplicated pin
numbers (0,0,1,1,2,2…). The default build is a two-board build, so this is the
default output — and this is the page a builder prints and takes to the bench.
**Fixed:** one titled section, box, pin column and GND bus per board.

### 7.5 A whole-setup `.json` naming an unknown firmware imports "successfully" — HIGH
`src/js/app/setup-io.js:95`. `loadProfile()` is a no-op for an unknown id, but
`Object.assign(CFG, o.cfg)` ran anyway and `PREFS.build.firmware = o.profile`
was written and persisted. Imported-sketch profiles are registered only at
runtime from `localStorage`, and the setup file carries neither the `.ino` nor
the id's provenance — so opening your own exported setup on another machine
leaves the old profile loaded with the *new* file's constants merged on top, and
a dangling firmware id. The receipt named the profile that was loaded, so it read
as success. **Fixed:** refuse the merge, keep the current profile, and say so by
name in the toast and the log, with the way out (drop the `.ino` first).

### 7.6 A negative anim rate makes the droid spin forever — MEDIUM
`src/js/app/animate.js:119`. `(CFG.maestroRate||2.2)*dt` with no validation: a
typed `0` is silently ignored (falsy) and a **negative** value makes
`Math.abs(d) <= step` always false, so every actuator steps *away* from its
target without bound — `ACT.doorL = -11.00` after 11 s, feeding
`rotation.y = ACT.doorL*1.95`. `panels.js` built that input with no `min`/`max`
while `main.js` correctly clamps `loopHz`. **Fixed** at the use site and with a
`CFG_LIMITS` table on the Sim inputs, re-clamped on `change` because browsers
only enforce min/max on stepper clicks.

### 7.7 A failed sound-pack save is completely silent — MEDIUM
`src/js/core/soundbank.js:145`. `.catch(()=>{})` covered only the *open*
failing; a `QuotaExceededError` aborts the **transaction**, which nothing
listened to. Measured: 10 files → 10 independent `indexedDB.open()` calls, none
closed; the toast reported "53 of 53 tracks" from a count of *decodes*. Reload
and the bank is gone with nothing said. **Fixed:** one cached connection,
`onerror`/`onabort` hooked, counts from real persists, and the receipt now reads
`… 3 of 53 tracks · 1 NOT SAVED (QuotaExceededError) — gone after a reload`.

### 7.8 Smaller ones, all fixed
- **`core/soundbank.js:43`** — the name normaliser left a leading space
  (`"01 SCREAM2.mp3"` → `" SCREAM2"`) and fell back to the raw filename for a
  bare-numbered file (`"21.wav"` → `"21.wav"`), which then *overrode* the correct
  embedded `MISC17`. Dropping the pack made the labels worse than not dropping
  it.
- **`core/toast.js:58`** — eviction bypassed `toastDrop`, leaving a live 3.5 s
  timer per evicted plate on a detached node.
- **`app/hud.js:229`** — the **Grid** button lit `act` when the grid was
  *hidden*, the inverse of every other toggle, and never re-synced when
  `envApply()` hid the grid behind its back.
- **`app/wiring.js:404`** — the sheet's "generated" stamp was UTC while its own
  filename came from `fileStamp()`, whose contract is explicitly local. An
  export at 09:00 in UTC+10 printed a different clock time *and* a different
  date. Now derived from `fileStamp()` itself so the two cannot drift.

---

# §8 Arduino firmware

The library is flashed to Mike's droid. All three main findings were reproduced
natively; the first under AddressSanitizer.

### 8.1 Two bytes of serial noise walk `_arg[52]` off the end — CRITICAL
`arduino/MaestroPCA/src/MaestroLink.cpp:109`

```cpp
if(_cmd == 0x9F && _got == 1) _need = 2 + _arg[0] * 2;
```

`_need` is `uint8_t`. For `_arg[0] = 0x7F`, `2 + 254 = 256` truncates to **0**,
the completion test `_got >= _need` is `1 >= 0`, and `execute()` reads
`_arg[254]`/`_arg[255]`, firing ~127 `setTarget()` calls from out-of-bounds
memory. Writes were bounded; the reads were not. Even the well-formed path
overruns from `n = 26`.

Reproduced from literally `feed(0x9F); feed(0x7F);`:

```
==ERROR: AddressSanitizer: stack-buffer-overflow READ of size 1
    #0 MaestroLink::val14(unsigned char) const
    #1 MaestroLink::execute(unsigned char*)
    [96, 176) 'link' <== Memory access at offset 176 overflows this variable
```

The protocol's own self-resync path reaches it — a dropped byte that resyncs
onto `0x9F`.

**Fixed** with `MPCA_LINK_MAX_MULTI` bounding both the parse and the execute
loop; an oversized count now lands in `badCount()`, which the sketch already
prints. Cost: 0 RAM, +38 bytes flash.

**Decision recorded:** `_arg[52]` caps the command at 25 channels and that is
enough — `maestro-link.js` declares `multi:0x9F` and **never calls it** (every
`MST_CMD` use is one 0x84 per channel), PCA Studio is the same, and the largest
real Maestro is 24 channels. Widening the buffer would cost RAM on a Nano for a
command nothing sends.

### 8.2 The track mask saturates above 32 channels — CRITICAL
`arduino/MaestroPCA/src/MaestroPCA.cpp:170`

```cpp
if(pgm_read_word(&row[c])) mask |= 1UL << (c < 31 ? c : 31);
```

Every channel ≥ 31 folds into bit 31, and `restartScript()` uses
`_tk[i].mask & mask` to decide who gives way. So on a three-or-more-board rig
any two sequences touching any high channel look like they overlap — killing the
library's headline feature over a real Maestro. (The cutoff is also off by one:
`c < 31` should be `c < 32`.)

Proven on 48 channels — sequence A drives only ch33, B only ch40:

```
after A:  running=1
after B:  running=1  A=0 B=1      ← disjoint, and B displaced A
control, channels 3 and 10:  running=2, both alive
```

**Fixed** with a `Mask` struct of `uint32_t w[4]` — 128 channels, which is the
ceiling the rest of the system already has (`MpcaSplitOutput`'s 7-bit header,
`board*16+pin` over eight PCA9685s), so no generator `#error` is needed.
Measured cost of going to 128 rather than 64: **+32 bytes RAM, +48 bytes
flash** — not worth buying a ceiling for. `overlaps()` only runs inside
`restartScript()`/`bgResume()`, downstream of a `seqMask()` that already walks
the whole sequence out of PROGMEM.

### 8.3 `restartScript(n)` silently does nothing for n ≥ 128 — HIGH
`arduino/MaestroPCA/src/MaestroPCA.cpp:229`. `Track::seq` is `int8_t`, so slot
128+ stores negative — and `t.seq < 0` is the "track is free" test everywhere.
`sequenceRunning(n)` compares against the same truncated value and **reports it
as running**.

```
slot 5   : running=1  currentScript=5
slot 128 : running=0  currentScript=-1  sequenceRunning(128)=1
```

**Fixed** by widening to `int16_t` (+8 bytes; any rig with 130 routines is a
Mega or an ESP32). The generator's `#warning` states the *opposite* of the
truth — exact replacement wording is in §9.

### 8.4 Two lows, both fixed
- **`MaestroPCA.cpp:59`** — `MpcaSplitOutput::frame()` bounds-checks after the
  cast has already wrapped, so board 16 (`256 → 0`) transmitted as channel 0.
  Now computed in `uint16_t` and tested before narrowing.
- **`MaestroPCA.cpp:400` vs `:458`** — the same `elapsed` advanced frame timers
  by up to 250 ms but contributed at most 200 ms of kinematics ticks, because
  `_tickAcc` was `uint8_t`. A host that blocks 200–250 ms per pass drifted
  cumulatively. Accumulator widened; one clamp, one value.

**Total firmware cost:** `sizeof(MaestroPCA)` 89 → 146 bytes, +352 bytes flash
(~1.1 % of an ATmega328). Clean under `-Wall -Wextra` for AVR.

**Library copies re-synced.** The three sketch folders carry byte-identical
copies of the library and `run.sh` checks for drift. All four files were copied
into `examples/MaestroReplacement`, `examples/Esp32Droid` and
`bench-sketches/R2_Bench_Console`, CRLF preserved, and verified `cmp`-identical.

### 8.5 Four new native tests
`link_multi_test.cpp` (also built under ASan), `mask_test.cpp`,
`slots_test.cpp`, `bounds_test.cpp`, all registered in `test/run.sh`. Every
existing native test still passes: `link_test` 40, `features_test` 47,
`tracks_test` 14, `ledc_test` 25/25, `ripple_test` 13, `split_test` 16,
`scan_test` 17, `bridge_test` 24, plus both Esp32Slave compiles.

---

# §9 HANDED OFF — do not apply blind, these files were dirty

At the time of this review another session had uncommitted work in
`src/js/maestro/{export,import,servo-cfg,ui-pane,starters,builder,pca-gen-sim}.js`,
`test.sh` and `tests/pcaseq.test.js`. Nothing below was touched.

## 9a. Export and import — the files that get flashed

| # | Where | Severity | What |
|---|---|---|---|
| 1 | `export.js:27` `genSeqBody` | **CRITICAL** | The generated Maestro **script** writes the literal token `undefined` for any missing target. `genFrameRow` got the v1.39.5 hole fix; `genSeqBody` — the half `restartScript(n)` actually runs — did not. Reproduced: 16 script lines containing `undefined` from a table `HW.ensure()` had grown past `servoCount`. `lintMaestro()` says nothing. **Fix:** the same `(x==null)?0:x` guard, and compare with the same normalisation. |
| 2 | `import.js:341` `mstrApply` | **CRITICAL** | `loadoutReset()` rebuilds the loadout from `<Sequences>` order, but the script's subroutine order — which defines slot numbers — is the **loadout** order, a subset in a chosen order. Re-importing your own export renumbers `restartScript(n)`, so the d-pad fires different routines. `pcaGenFromParsed` already implements the correct rule and is dead code. **Fix:** set `MSTR.loadout` from `P.subs`; fall back to `loadoutReset()` only when the file carried no script. |
| 3 | `export.js:132` `genSequencesXml` | **CRITICAL** | Frame rows are written at `MSTR.servoCount` columns while `<Channels>` declares `MSTR.channels.length`. `HW.ensure()` grows the latter and never the former, so targets above `servoCount` are dropped silently. **Fix:** use `MSTR.channels.length`. |
| 4 | `import.js:258` | HIGH | The script-sub → sequence match uses `niceName()` while the exporter emits `scriptSubNames()` symbols (`s_` prefix for a leading digit, `_2` for collisions). Any mismatch fires the "no `<Sequences>`" recovery and appends a phantom copy — 3 → 5 → 7 sequences over two round trips. **Fix:** match on `scriptSubNames(sequences)`. |
| 5 | `import.js:670` | HIGH | `MPCA_SEQ_LOOP`/`_BACKGROUND` are indexed by the header's slot number while `sequences[]` is compacted (generator tables are skipped), so every flag after a generator lands on the wrong routine. Proven: the loop moved from "Beta Loop" to "Gamma". **Fix:** keep a `slotToIndex` map. |
| 6 | `servo-cfg.js:181` `servoCfgApply` | HIGH | Writes the imported table and never rebuilds the engine, so imported speed, accel, ease and mode never reach it — a channel the file turns into a Servo cannot be driven at all, and speed limits do not apply. **Fix:** `HW.changed()` at the end. **Must land after §1.1**, or the rebuild itself flings every driven channel home. |
| 7 | `ui-pane.js:223` | **CRITICAL** | The **Body / Dome / Frik head starter** buttons wipe the entire sequence library and channel table with one click, no confirmation, and `servoStoreSave()` in the same call. Every other destructive path in the project asks. **Fix:** gate on `appConfirm` naming the counts, as `mstrImportChoice` does. |
| 8 | `ui-pane.js:102,109` | HIGH | Rename and delete leave every `{kind:'seq'}` brick in other routines pointing at a name that no longer exists — the brick stays on the timeline, keeps its length, and compiles to nothing. **Fix:** re-point on rename, warn on delete. |
| 9 | `ui-pane.js:91`, `music.js:301` | HIGH | The pane's **+ Sequence** and `musicBuildSequence` still mint unchecked names. `seqUniqueName(base)` now exists in `blocks.js` — call it from both. |
| 10 | `servo-cfg.js:35` | MEDIUM | `SERVO_CFG_FIELDS` omits `ease` and `releaseMs`, so both `.json` exports drop them and the import reports nothing dropped — including the copy `impChooseSave('servo')` writes as the safety gate before an import. **Fix:** add both fields. |
| 11 | `export.js:135` | MEDIUM | Per-frame speeds are written into `<Frame>` rows while the `<Sequence>` is stamped `useSpeedAndAcceleration="false"`, and the script carries no speed at all — with no receipt. The PCA door names every lost field in `pcaExportDrops`; the `.mstr` door, which loses them on *every* export, says nothing. |
| 12 | `pca-gen.js:164` | MEDIUM | A zero-frame sequence emits `static const uint16_t MPCA_SEQ0[] PROGMEM = {\n};` — illegal C++ — and `lintMaestro` has no rule for it. Control Center saves such sequences. |
| 13 | `pca-gen.js:122` | MEDIUM | Names are interpolated raw into `/* … */` comments, and `pcaHeaderParse` reads them back out of exactly those comments. A `*/` or a newline in a channel or routine name breaks the generated C++ and truncates the name on re-import — and the truncated name is the key `blocksTryAttach` matches on, so the bricks go with it. The acts/blocks sidecars are base64 *precisely* so this cannot happen. |
| 14 | `pca-gen.js:166` | LOW | Frame durations over 65 535 ms are silently clamped, with no entry in `pcaExportDrops`. A 90 s hold becomes 65.5 s on the droid. |
| 15 | `pca-gen.js:101` | **Now HIGH** | The >128-sequence `#warning` says *"Direct restartScript() calls on this board are unaffected."* After §8.3 that is true against a fixed library and false against any older copy. Replacement text: <br>`// … Direct restartScript() calls DO reach slots 128-255, but only on a` <br>`// MaestroPCA that stores a track's sequence number in an int16_t. An older` <br>`// copy truncates it: the slot stores negative, the track reads as FREE so` <br>`// the routine never plays, and sequenceRunning() matches the same truncated` <br>`// value and reports it as running anyway.` <br>Better still, a hard guard on a symbol only the fixed library defines: `#ifndef MPCA_MASK_WORDS / #error "…" / #endif`. |
| 16 | `pcaseq.js` `pcaSeqMask` | HIGH | The JS twin still folds at 31 (`1 << (c < 31 ? c : 31)`). It was a faithful mirror of the firmware; after §8.2 it is a divergence. **Fix:** mirror `MPCA_MASK_WORDS`. |
| 17 | `wizard-import.js:1237` | LOW | The "sequences only" toast reports `P.sequences.length` while `mstrAdoptSequences` skips empty sequences and returns the real list in `r.added` — so the toast and the log disagree. |
| 18 | `export.js:385,396` | LOW | The sidecar strippers use `-->\n?` against CRLF text, so every `.mstr` round trip adds one blank line, forever. Measured 1 → 2 → 3 → 4 over four cycles. **Fix:** `-->\r?\n?`. |

## 9b. The build and the test harness

| # | Where | Severity | What |
|---|---|---|---|
| 19 | `test.sh:18,23` | **CRITICAL** | **`./test.sh` cannot fail.** Both suite lines end `\| grep … \|\| echo '(no summary)'`, which neutralises `set -e` and discards the suite's exit code. Every branch exits 0. Reproduced: two suites printing `FAIL`, `EXIT=0`. Every `process.exit(fail?1:0)` in 37 suites is thrown away, and any CI or hook keying off the exit code reports success. **Fix:** capture `rc` before the pipe and accumulate. `set -o pipefail` alone is not enough — the `\|\|` still swallows it. |
| 20 | `test.sh`, `package.json:8` | **CRITICAL** | Nothing checks that the tracked `pca-studio/PCA-Studio.html` is current: no suite rebuilds and diffs, and `smoke.test.js` asserts against the checked-in artefact, so a stale file passes its own smoke test by definition. `npm run build` runs only `tools/build.js`, so a contributor using the npm script leaves Studio behind on every edit to a shared module. (The file is currently in sync — verified byte-identical.) **Fix:** rebuild to a temp path and `cmp` as the first step of `test.sh`; `"build": "./build.sh"`. |
| 21 | 14 suites | HIGH | They install `page.on('pageerror', …)` and only *print* the result; `pass`/`fail` never see it. The other 23 end with `ok('no page errors', errs.length === 0, …)`. `PAGE ERRORS:` also fails `test.sh`'s grep, so it does not reach the summary. The suites: `export-guards, cad, chrome, firmware, keyboard, look-boards, maestro, music, pcaseq, profiles, select, setup, sounds, track-ui, wiring`. |
| 22 | `servos.test.js:88` | MEDIUM | `SV.shown === true && (typeof SIM === 'undefined' \|\| true)` — the second clause is unconditionally true, so the assertion named *"the renderer is skipped while it is up"* checks only a flag. Remove `\|\| true` and it fails; the suite runs under `?norender` where `SIM.draw` is already false, so nothing here can observe the skip at all. **Fix:** count `renderer.render` calls. |
| 23 | `sounds.test.js:161` | MEDIUM | If the IndexedDB probe returns false, two real assertions are traded for `ok('…fallback', true)`. Both the `catch` and the `onerror` downgrade to it, and the probe promise never settles on a hang. A broken persistence layer reports a pass. |
| 24 | `mstr-share.test.js:99`, `maestro-link.test.js:187` | MEDIUM | Two fields built from an always-true clause (`… \|\| true`, `… \|\| window.__tx.length >= 1`) and never asserted on. Currently shadowed by honest assertions; they become live the moment someone tidies. |
| 25 | `arduino/MaestroPCA/test/run.sh:126` | MEDIUM | The angled-include guard's header-name list is now complete but its **file glob is not** — it scans only `*.ino`. A counterexample is in the tree: `examples/MaestroReplacement/sequencesold.h:11` `#include <MaestroPCA.h>`, in a sketch folder, in front of a green run. The generated `sequences.h` is in the same blind spot. **Fix:** scan `*.ino *.h *.cpp`, and delete `sequencesold.h`, which the manifest comment already calls scratch. |
| 26 | `board-art.js:108,277`, `setup-hw-channels.js:611` | LOW | Three more hardcoded `8`s shadowing `PCA_MAX_BOARDS_UI`. Raise the constant and the wizard offers boards nothing draws. |

## 9c. Small hand-offs in files this pass could not reach

| # | Where | What |
|---|---|---|
| 27 | `pcaseq.js` `pcaStepChannel` | The belt-and-braces half of §1.1: repair a zero or out-of-range `aim` from `target`. |
| 28 | `scene/anzellan.js:565` | `anzRegister()` is still unconditional, so anything else that calls `anzSetShown(true)` while frik is already shown snaps the face home. Make it idempotent like `mbRegisterPart()`, and give `anzSetShown` a `was`/`!was` edge guard. |
| 29 | `core/util.js:88` `uiModalOpen()` | Does not check `.dlgwrap`, so an open dialog is not a modal as far as `input/gamepad.js` is concerned. Both dialogs now contain their own keystrokes, so nothing leaks today — but it is the belt to their braces, and `shortcuts.js:80`'s `kbdHelpBlocked()` hand-rolls four checks where `uiModalOpen()` already enumerates six (it omits `#setupWrap` and `#jobWiz`, so `?` opens over the servo bench and one Escape closes both the card *and* the bench, disconnecting a connected board). |
| 30 | `cad/ui.js:268` `mbChannelSelect` | Prints raw actuator ids (`(now: bldJ2t)`) where `cad/select.js:202` goes through `actPartLabel()`/`actAnyLabel()`. The fix was applied to one copy of two. |
| 31 | `maestro-link.js:262` `mstrWatch` | Polls every 200 ms while each query may take 400 ms to time out, all serialised on one promise chain — so a board that accepts bytes and never replies builds an unbounded backlog. Self-heals only if a *write* fails, which a quiet-but-open port never does. **Fix:** re-arm with `setTimeout` after the await. |

## 9d. Test-coverage holes, ranked

1. **The entire Arduino firmware is outside `./test.sh`.** `run.sh` is a separate
   script that needs a Pololu clone or it exits 1. §8.1–8.3 all live in code the
   one command a contributor runs does not touch, and all three were reachable
   with the shims already in the repo. *Add `tests/firmware-native.test.js` that
   shells out to `run.sh` and parses its PASS/FAIL lines, with the Pololu
   checkout vendored or cached.*
2. **Multi-board behaviour above 32 channels.** Every C++ test works at ≤16
   channels. This is the hole that hid §8.2, and 48–64 channels is what Mike is
   building. *Add `tracks48_test.cpp`.*
3. **The build outputs themselves.** Nothing asserts the three HTML files are
   current, well-formed or mutually consistent — see §9b/20.
4. **`app/shortcuts.js` (147 lines) — zero references in any suite.** `KBD`,
   `kbdHelpOpen`, `kbdHelpBlocked`, `kbdKeycaps`: the legend can drift from the
   real bindings and the thing that decides whether a keystroke is swallowed is
   unexercised.
5. **`escGuard` and its six call sites.** `core/esc-guard.js` exists *because*
   filing it in `core/dialog.js` broke Studio's hardware wizard for four
   versions — and `escGuard` is not named in any suite. Escape is never pressed
   for the dome map, the import wizard, the job wizard or the builder, and
   Studio's smoke test never presses it at all.
6. **`app/about.js` (95 lines) — zero references.** A dialog that can silently
   throw. Cheap to cover.

---

# §10 Refuted — checked, and fine

Recorded so nobody re-finds them.

**Hardware.** `serialTicksFor` follows `HW.freq()` correctly (the v1.39.5 fix
holds; §1.3 is a different hole). The 500–2500 µs unlock widens the engine range
correctly. `hwLinkRender`'s doubling callback is fixed. Unplug does disarm
through the registry. `0xA1` is never sent first. `mstrSplit`/`mstrJoin` are the
right way round and every ask has a timeout, so no read can hang.
`serialWrite` **drops** a channel above `SER.chMax` with a warning rather than
folding it. `HW.trim()`'s no-op is deliberate and documented. `hw-clock.js` uses
real elapsed time with a 250 ms cap. `serialFrame` re-entrancy is safe — a
WritableStream queues in order. The servo grid's Test slider never reaches
`HW.drive`.

**Sequencer.** `blockBoundaries` clips a resized library-sequence brick.
`servoStoreFlush` on `pagehide`+`visibilitychange` means in-memory edits do
reach storage. Undo snapshots are fresh deep copies with no aliasing.
`blockAdd` floors `dur` at 120 and `t0` at 0. `chanSpeedForMs` handles both
divide-by-zero branches. A whole-sequence brick reads the referenced sequence's
*frames*, so A→B→A cannot recurse. Multi-select bulk edits re-resolve every id.

**Export/import.** `$`, `&`, `<`, `"` and non-ASCII in names round-trip
byte-exact — the v1.39.5 replacement-function fix is present and correct.
`genFrameRow` holes serialise as 0. The `frame_0..19_24..31` range encoding
reverses exactly. `MPCA_SLOT_` handles a leading digit and folded names. A
whole-setup `.json` round trip keeps loadout order, `ease`, `releaseMs`,
sequences and `PREFS.env`.

**Input and kiosk.** `rcAutoAssign()` genuinely does neutralise a bottom-resting
throttle and refuse dead channels; the calibration maths and the
deadband-then-rescale are correct. RC disconnect does not latch — the watchdog
zeroes at 950 ms. Nothing caches a `Gamepad` across frames. The track editor's
listeners are all on its own canvas. `trackLibPersist()` verifies its own write
and restores on failure. Every sibling of `#main` was enumerated: `header`,
`#dropzone`, `#startup`, `#impWiz`, `#bldWiz`, `#setupWrap`, `#trackEdit`,
`#stagePick`, `#kbdHelp`, `#jobWiz`, `#faultPop`, the save/load popover, the
sequencer drag ghost and every transient `<input type=file>` are all shut, by
CSS, by a function guard, or by both. `#appMenu` and `#jobWiz` are shut *by
closure only* and would be better with a CSS line each.

**Scene.** The CAD model swap is symmetric (44 geometries created / 44 disposed,
33 materials / 33). The Builder rebuild is symmetric. `initSelect`,
`mbInitPick`, `bindCamera` each register exactly once. `mbRebuildFromPrefs`'s
cycle refusal is symmetric and terminates. The model geometry is an
approximation by permanent design and is not a finding.

**Core.** No ANIMS step is lost at any `loopHz` (verified across all 34 under
node). The HUD volume and the gain do not diverge. `frame()`'s fixed-step loop
cannot spiral — `dt` is clamped to 0.1 s. `rnd(a,b)` matches Arduino's
`random(min,max)` exactly. The zip EOCD backward scan cannot read past the end.

**Build.** Both manifests are complete — zero orphans, zero missing, zero
duplicates, and every failure branch exits 1. `PCA-Studio.html` is current
(byte-identical to a fresh build). No suite reads stylesheet text, so the
`cssRules` trap is not live. No "helper defined in Node, not in the page". Every
`url()` in the CSS is a `data:` URI, so inlining cannot break one. `<!--` in
inlined JS is always balanced. All 36 suites are listed in `test.sh` and all
honour `R2_TARGET`. The relative-path sketch-include trap is fixed — both
harnesses take the `.ino` path as a `-D`. `PCA_BOARDS` cannot be undersized by
the generator. `MaestroPCA::update()` handles `millis()` rollover correctly
(only `walkStep` in `MaestroReplacement.ino` gets it wrong, and that sketch was
out of scope). No `attachInterrupt`, no `String` in an AVR hot loop.

---

# Appendix — files changed in v1.69.0

**Simulator source (37):** `css/02-layout.css`, `css/09-sequencer.css`,
`css/10-kiosk.css`, `app/{animate,boards,hud,kiosk,main,panels,setup-io,splitters,wiring}.js`,
`cad/{build,parts,runtime,select,ui}.js`, `config/{hardware,wizard}.js`,
`core/{dialog,soundbank,toast,util}.js`, `input/{rc,rc-ui}.js`, `look/paint.js`,
`maestro/{blocks,blocks-ui,boards,hw-host,maestro-link,music,serial-link,setup-hw,ui-sequencer}.js`,
`scene/{builder,models}.js`.

**Tests (18 changed, +651 assertions):** `blocks-trace, build-config, builder,
cad, chrome, hw, kiosk, maestro-link, maestro, music, profiles, rc,
sequencer-ui, sequencer, setup, sounds, wiring, workspaces`.

**Firmware (20):** `src/{MaestroPCA,MaestroLink}.{h,cpp}`, the same four copied
into three sketch folders, `test/run.sh`, and four new native tests.

**Generated and tracked:** `pca-studio/PCA-Studio.html` rebuilt.
