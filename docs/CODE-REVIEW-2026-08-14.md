# Code review — confirmed bugs

*2026-08-14 · against `src/` as of v1.39.4 · four parallel reviewers read every module (the two generated payload files excluded), 25 candidates raised, each one then re-verified against the source by the coordinator before it was allowed in here; several were additionally proven by executing the actual code under node. The deliberate firmware reproductions (watchdog starvation, dome-automation collision, no boot homing, inverted volume) were excluded on purpose — nothing below is one of those. None of the 1349 passing tests catches any of it.*

Findings are ranked: §1 can hurt real hardware or corrupt real files, §2 is wrong behaviour you can see, §3 is minor. Every item: where, what, how it fails, and the fix direction.

> **STATUS: all 23 findings FIXED in v1.39.5, same day.** Every fix is in the
> change log under v1.39.5. The six §1-class fixes carry regression tests that
> were each watched failing against the pre-fix code first (hw ×2, maestro,
> sequencer-ui, build-config, sounds). This file is kept as the record of what
> was wrong and why.

---

## 1. Real-hardware and file-corruption bugs — fix these first

### 1.1 Streamed positions assume 50 Hz forever — wrong pulses at any other servo rate

`maestro/serial-link.js:283` — `serialWrite()` converts quarter-µs to PCA ticks with a hard-coded period:

```js
const ticks = (qus==null) ? 8191 : pcaQusToTicks(qus, 20000);
```

But `serialConfig()`/`serialSetFreq()` (lines 248/271) send frame 63 = `HW.freq()` and the bridge reprograms the prescaler — the very feature the long comment above `serialSetFreq` sells (200 Hz for digital servos). At 200 Hz the real period is 5 000 µs, so a 1 500 µs target is sent as 307 ticks = **a 375 µs pulse**, far below the 500 µs floor, on every channel at once. That is a hard-stop slam on real servos, delivered by the exact code path live drive uses.

**Fix:** `pcaQusToTicks(qus, 1000000/HW.freq())`, and resend all positions after a rate change (`serialSetFreq` already stops everything first).

### 1.2 The bench's "full 500–2500 µs" unlock widens the dial but not the engine — captured endpoints the servo never reached

`maestro/setup-hw.js` — `setupCalOpen()` (line 1009) opens the working range to `CAL_SAFE` (1000–2000 µs) precisely because "otherwise pcaSetTarget clamps and the servo will not follow the dial". Ticking **unlock full sweep** (line 1178) only sets `SETUP.cal.wide` and re-renders: `calRange()` now offers 500–2500 µs on the dial, but `c.min/c.max` stay at `CAL_SAFE`, and `pcaSetTarget` (pcaseq.js:154) still clamps at 2000 µs. Drag to 2300: the readout says 2300, the engine — and the real servo behind the bridge — sits at 2000, and pressing MAX records 2300 µs, **an endpoint that was never physically visited**. The typed-end path (line 1203) sets `wide=true` expecting reach and has the same problem, and `calSweep` (line 1286) restores `CAL_SAFE` regardless of the unlock.

This breaks the bench's own calibration doctrine (capture where the servo *is*), and quietly makes genuine 500–2500 µs servos impossible to calibrate.

**Fix:** the wide toggle should also set `c.min/c.max` to `CAL_FULL` (and back), mirroring what `setupCalOpen` already does for the safe range.

### 1.3 `.mstr` export of brick-built routines shifts targets onto the wrong channels on round-trip

`maestro/export.js:81` — `genFrameRow`'s pad keeps array holes:

```js
const pad=(a)=>{ const v=(a||[]).slice(0,n); while(v.length<n) v.push(0); return v.join(' '); };
```

`blockCompile()` (blocks.js:293) writes `targets[c.i]` only for servo channels, leaving holes at non-servo indices — and `join` renders a hole (or the `null` a JSON deep-copy turns it into) as an *empty string*. On a board with ch0=Servo, ch1=Input, ch2=Servo, the row `[6000, ·, 7000]` serialises as `6000  7000`, the parser tokenises two values, and ch1 gets 7000 while ch2 gets 0 — **every re-import drives the wrong servos** (verified by execution). Any Maestro file with an Input/Output channel below a servo channel is exposed.

**Fix:** fill the holes at pad time — `for(let i=0;i<n;i++) v[i]=v[i]||0` — or make `blockCompile` write 0 into every non-servo index.

### 1.4 Renaming a routine via the sequencer's Save silently drops it off the board and renumbers the slots

`maestro/blocks-ui.js:867` — the Save button does `seq.name = n; blockSaveAs(seq, n);`. The pane's Rename (ui-pane.js:73) correctly calls `loadoutRename(seq.name, v)` first; Save does not, and `blockSaveAs` (blocks.js:411) never touches the loadout. Routine "Wave" sitting at slot 3: type "Wave v2", Save — `MSTR.loadout` still says "Wave", `loadoutNames()` filters it out, `reindexSubs()` rebuilds without it, and **slot 3 now fires what used to be slot 4**. On the real droid that is the d-pad firing the wrong sequence, with no warning anywhere.

**Fix:** in the Save handler, when the name changes, `loadoutRename(oldName, n)` before `blockSaveAs` (and reindex), exactly as the pane does.

### 1.5 Cancelling a "Channel in use" reassignment destroys the part's existing wiring

`config/tab.js:122` — the Panels-table dropdown frees the part's current channel *before* asking:

```js
if(cur) chAssign(cur.loc, cur.ch, '');        // free the old channel
...
if(occupant && ... !await appConfirm(...)){ ...return; }   // Cancel path
```

Pick a channel that another part holds, then press **Cancel**: the dialog promised a no-op, but the part is already unwired and nothing restores it. `chPicker` in app/boards.js does the same operation in the right order (confirm first, restore on cancel) — this is the miscopied twin.

**Fix:** move the `chAssign(cur…, '')` below the confirm, or restore `cur` on the cancel path.

---

## 2. Wrong behaviour in the sim

### 2.1 Volume 0 plays at full blast

`core/soundbank.js:58` — `SBANK.gain.gain.value = clamp((SND.vol||30)/30, 0, 1);`. Zero is a valid volume (mod2026 steps 14→0 by twos; the DY profiles decrement to 0), and `||30` treats it as "unset" — so a muted droid plays the next Padawan sound **at maximum gain**. At a show, with the kiosk handed to a stranger, that is the worst possible moment for a falsy-zero bug. **Fix:** `clamp((SND.vol ?? 30)/30, 0, 1)` or an explicit `typeof` check.

### 2.2 A resized library-sequence brick compiles frames past the routine's end

`maestro/blocks.js:228` — `blockBoundaries()` walks the referenced sequence's *entire* frame list (`t += f.duration; set.add(t)`) with no clip at `b.t0 + b.dur`, and `blockCompile` emits a frame for every boundary pair. Drop a 10 s library sequence in as a brick, resize it to 2 s: the compiled routine runs 10.4 s (verified by execution), the last 8 s sitting in the closed pose — inflating script size, every `restartScript` slot's real runtime, and the exported `.mstr`. Same overrun if the referenced sequence is later lengthened. **Fix:** clip sub-frame boundaries to the brick window (`if(t >= b.t0+b.dur) break;` style), matching how the brick is drawn on the timeline.

### 2.3 The serial-link UI callback doubles itself until the tab hangs

`maestro/hw-ui.js:135` — every `hwLinkRender()` registers a *fresh anonymous closure* with `serialUiRegister` (dedupe is by function identity, so it never matches). Each registered copy re-renders the bar, and each re-render registers another copy: with k copies, one `serialUiSync()` produces 2k. Connect/disconnect/mode events double it every time — after ~20 events that is a million callbacks, each doing a full innerHTML rebuild and wiping `#monOut`. setup-hw.js:385 and live-drive.js:151 register *named* functions once; this is the odd one out. **Fix:** hoist a named `hwLinkSync` function and register that.

### 2.4 Connecting a board that doesn't identify wipes its own escape hatch

`maestro/hw-ui.js:131` — `bConnect`'s handler awaits `serialConnect()` and then calls `hwLinkRender()`. When the board doesn't identify as PCA_Bridge, `serialConnect` ends in monitor mode and installs the "stream anyway (it *is* PCA_Bridge)" / "stay monitor" buttons in `#monWarn` — which the handler's re-render immediately destroys (`#monWarn` empty, `#secMon` re-hidden, `#monOut` wiped, and the rebuilt HTML would carry no click handlers anyway since `SER.modeWarn` is not re-applied). The user's path to forcing a stream on a DTR-less adapter is gone before they can click it. **Fix:** drop the `hwLinkRender()` call (the comment above it already says the module repaints itself), or make `hwLinkRender` re-apply `SER.modeWarn` and monitor visibility.

### 2.5 Pulling the USB cable leaves the app claiming a live link

`maestro/serial-link.js:96` — when the read loop dies on a physical unplug it prints "[read stopped]" and breaks, leaving `SER.port` set; there is no `navigator.serial` 'disconnect' listener anywhere. Until the next *write* fails, `liveReady()` stays true — the ⚡ chip says "Live servos", the wizard bar says "Live." The v1.39.4 rule ("unplugging clears the arm") only actually fires on write failure. **Fix:** on read-loop exit without `SER.port===null` (i.e. not a deliberate disconnect), call `serialDisconnect()`; optionally also listen for `navigator.serial`'s `disconnect` event.

### 2.6 The sketch importer miscompiles common Arduino idioms (four related defects)

`profiles/sketch-import.js` — all four verified by executing the transpiler:

- **line 394 — `static` is stripped**: `static long last=0;` becomes a per-call `let`, so the ubiquitous `if(millis()-lastMillis > N)` throttle fires *every pass*. Silent — no residue, no caveat, against the module's own fail-loud mandate.
- **line 444 — the integer-division rewrite breaks expressions**: `out.pop()` removes only the previous token, so `x = a * b / c` becomes `x = a * __idiv(b, c)` (wrong associativity) and `a / b / c` becomes `__idiv(b, c)` — **`a` is deleted from the expression entirely**.
- **line 347 — parameters take the function's *return* type**: `int half(float v){ return v/2; }` truncates a genuine float division; `void f(int a)` never truncates a genuinely integer one.
- **line 382 — an uninitialised C array declares as scalar `0`**: `int buf[4];` then `buf[0]=1;` throws `TypeError` at runtime *inside* `fwLoop()`, every frame — `frame()` schedules the next rAF first (main.js:16), so the app doesn't die, but everything after the throw (sequence clock, watchdog, actuator sync, render) is skipped every frame: a frozen droid with a spinning console.

Also on line 629: every imported sketch gets `hasServos:true`, so for an imported *Maestro* sketch `syncActuators()` (app/animate.js:19) overwrites `ACT[d.act]` from the never-driven PCA state each frame — **its `restartScript` timelines are visually dead** for every SERVO_DEF part (doors, arms, pies 0-10), which defeats the point of importing a Maestro sketch at all. `footPWM:()=>/__mkServo/.test(t.js)` on the same line misclassifies any Sabertooth sketch that declares one incidental `Servo` as PWM-hub feet (the droid then can't drive). **Fix:** derive `hasServos`/`footPWM` from what the transpiled sketch *actually drives* (PCA writes vs Maestro calls), keep `static` by hoisting to a module-scope temp, fix the two division rules, and turn the array case into a transpile-time residue instead of a runtime throw.

### 2.7 Two rebuild-under-the-caret input bugs

- `maestro/blocks-ui.js:850` — the sequence-library search rebuilds the whole pane on every keystroke; the focused input is destroyed after the first character. Searching "wave" takes four clicks.
- `maestro/setup-hw.js:805` — `setupBindSimple`'s `oninput` calls a full `setupRender()` per keystroke: typing "16" into a supply field stores 1 and drops focus; typing "200" into the Advanced pulse-frequency field stores 2. The Channels step deliberately avoids exactly this ("band the cell as you type, without rebuilding the input under the caret") — these two paths didn't get the memo.

**Fix:** debounce + preserve focus, or update in place like the Channels step.

### 2.8 The Maestro pane's channel map lets two channels own one part

`maestro/ui-pane.js:411` — the Drives dropdown does `c.act = sel.value` with no clear-then-set: assign ch5 to a part ch2 already drives and both keep it — the part jitters between two targets during playback, and answers two sliders on the bench. Everything else honours "a part has exactly one channel" (`HW.setPart`, `cad/select.js`, tab.js). **Fix:** clear the act off any other channel holding it, same as `HW.setPart()`.

### 2.9 Lint flags `homemode="Off"` channels for a home they deliberately don't have

`maestro/lint.js:137` — `chan-home` warns whenever `c.home` is outside min–max, with no off/ignore gate — but `home=0` is how Control Center saves an Off channel, and both `pcaHomeQus` (pcaseq.js:126) and pca-gen.js:75 special-case exactly that. Importing a normal file with Off channels produces a false warning per channel, two blocks above lint's *own* Off-handling rule. **Fix:** skip `chan-home` when `/off|ignore/i.test(c.homemode)`.

### 2.10 Sequence/channel names containing `$` corrupt the exported `.mstr`

`maestro/export.js:195-197` — `buildMstrText` splices generated XML in with `String.replace(regex, seqXml)`; `$&`, `` $` ``, `$'` in the replacement expand to match text, and `xmlEsc` doesn't escape `$`. A sequence named `Fanfare $&` duplicates the old `<Sequences>` block inside the new one — a file that no longer parses. **Fix:** use the function form, `t.replace(re, ()=>seqXml)`.

### 2.11 The setup file silently loses the backdrop

`app/setup-io.js:24` — `setupExportObj()`'s prefs block carries theme, paint, model, ws, build… but not `PREFS.env`, while the Save & load popover (config/views.js:115) explicitly promises "…the paint scheme and **the backdrop**". Export on the hangar deck, import elsewhere: everything lands except the scene. **Fix:** add `env: PREFS.env` to export and honour it in `setupImportObj` (the format is version-gated; absent key = keep current, so it is backwards-compatible).

---

## 3. Minor

- `maestro/starters.js:264` — `MSTR.fileName` ternary knows only dome/body, so the Anzellan starter is filed as `R2-body-maestro-starter.mstr`; every log line and derived header name mislabels the head board's config.
- `maestro/music.js:318` — `musicApplyAt` applies only the single frame containing *t*, unlike `seqStepPlayback` (playback.js:41) which applies every frame it passes — a frame shorter than one rAF tick can be skipped entirely during ▶ Play ♪. With full target rows (the normal case) the impact is a transient pose, so this is an asymmetry to know about rather than a fire.
- `cad/ui.js:271` — stale copy: "The dome has 12 pie panels but the firmware drives 11 channels, so one is left static — reassign as you like." Since the STATIC_ON_REAL_BUILD decision only pie0–4 move and seven are static; the hint describes the pre-decision model.
- `cad/parts.js:197` — `{id:PARTS_NEXT_ID++, name:(name||'Group '+PARTS_NEXT_ID)}` — post-increment means the fallback name is always one ahead of the id ("Group 2" for the first group).

---

## 4. Candidates raised and refuted (so they don't get re-found)

The reviewers also raised and *rejected*, with reasons that held up: `chPicker`'s 'both' indexing; theme alias restatement in `body.light` (all four aliases plus the bench set are correctly restated); flow-art/model-art theme classes; RC calibration maths incl. the off-centre rest; Ackermann/trailer maths; the pie renumbering; kiosk's four guards; `EASE_TIP` load order; PREFS references in the maestro/input modules (all runtime-only, the `*PrefsRestore` pattern is followed); jsonDropRoute kind-sniffing; the v1.39.4 leave-sequencer disarm.

## 5. Fixing notes

Items 1.1–1.5 first — three of them can move real servos wrongly and two corrupt real files. 2.6 (sketch importer) is the largest single surface and can be a work package of its own. Several fixes land on strings and DOM that `sequencer-ui`, `build-config`, `hw` and `rc` suites assert on — per the standing rule, write the regression test first and watch it fail against the current code (the review found five of these bugs by execution; those node snippets are a head start on the tests). None of the §1 items has any test today, which is how all five survived 1349 green.
