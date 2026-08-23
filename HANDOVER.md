# Handover

**Keep this file current.** Anyone — or any session — picking this project up
reads this first. Every change of substance gets an entry in the Change log at
the bottom and, where it alters how things work, an edit to the section above it.
`README.md` is the *how*, §9 below is the version-control procedure (there was
a `GIT.md`; it went at the public split and its content is in §9); this file is
the *why*, the *state* and the *next*.

Last updated: **2026-08-23** (CI follow-up: the remaining red `suites` job was test packaging, not an app regression — the foot-controller assertion selected the oldest concurrent toast and depended on runner timing, the Builder suite read two shipped JSON examples that had never entered Git, and the full check exposed a sequencer premise tied to one browser's 1440×900 text metrics. The assertions now state the rules and both fixtures are tracked; v1.75.0: **eleven things Mike asked for in one message, and the interface moved rather than grew.** The two board-count spinners are ONE number now — the startup wizard wrote `PREFS.build.pcaBoards`, the bench wrote `SETUP.hw.boards` and committed it only on Finish, and the one sync that existed wrote past the bench's live copy; `buildAdoptBenchBoards()` closes the other direction and leaves the channel table to `buildApply()`, which since v1.67.0 grows quietly and OFFERS to shrink. The channels tick box needed two clicks because the row-select handler re-rendered `innerHTML` under a checkbox mid-activation, so the `input` event fired on a detached element and `setupUse()` never ran — the comment three lines above it already described the correct behaviour and the code did the opposite. The channel list stopped jumping to the top: the render bracket saved the outer body's `scrollTop` and the table's `scrollLeft`, and the table went vertical in v1.50.0 without anyone updating the save. Clicking a panel on the droid now opens its card on ANY screen — the raycaster was already pointed at the live droid and two guards suppressed it, and the v1.70.1 ruling behind them is superseded, recorded not deleted. The arming prompt speaks EVERY time: the armed branch re-stamped its own quiet timer on every armed frame, so the sixty-second window only began the moment you disarmed, and the D-pad was never a drive attempt at all. AstroPixels get a tick at the top of both places that ask about them. The manual is a **live page** with the release as its named fallback. The stage button says **Edit Track**. **Build, import, export or assign** is on the top bar, in a fit tier of its own so a button added in 2026 cannot cost six status chips the labels they have carried since v1.0. And the sketch's own settings LEFT the Config tab for the setup step whose question they answer, each behind that step's own Advanced tick — which flushed out a real one: `.prose` was scoped under `.pane`, so three paragraphs of bug notes drew as 11.5 px mono the moment they moved. **75 suite runs, all green.**; v1.74.1: **the PSI panels were behind the model’s own lens** — they rendered perfectly and were never seen. The MK4’s PSI is a **38 mm can** whose lens tips 8 mm proud of the dome, and the panel was anchored to the ring’s bounding-box centre, which is 11 mm INSIDE the shell: the droid’s own geometry was drawn over the top. Two things were wrong and only one was obvious. A part’s **centroid is not its face** — these are blocks, 36 mm deep for the front logic and 38 for the PSI — and the bbox’s outer corner is not the face either: for a plate tilted off the world axes the axis-aligned box is fat in all three directions, so its support point along the normal overshoots by an inch and stands the board proud of its own bezel. Fixed by putting every panel on the **fitted shell** — the one surface here that is measured rather than inferred — at its part’s bearing, with a per-fitting `out`: negative for a logic display recessed into the dome, positive for a PSI standing on its lens. `out` is now the only hand-set number in `render3d.js` and it is stated in the anchor table rather than buried. The new assertion is on the RULE, not the neighbourhood: each panel is at `fit.r + out` to within half a millimetre. **58 assertions.**; v1.74.0: **the dome lights, for real** — Mike, with the repository open: *"this is the astropixels code can we use it to build the lighting systems?"* The answer is yes, and the useful half of that repository is not its code. Six `main.cpp` files of thirty to a hundred lines declare boards and pins; every pixel is drawn by Darren Poulson’s fork of **ReelTwo**, whose `LogicEngine.h` alone is 3,240 lines — **LGPL-2.1, against this project’s MIT**. So nothing is ported. `src/js/lights/` is a clean-room re-implementation from the published command grammar and a written behavioural specification: **the real boards at the pixel** (9×10 front logic, 27×4 rear, 5×5 PSIs with the corners cut out), the six palettes, the 46-entry HSV ramp with its **integer** tween step, the 90-state ping-pong colour walk, all **25 LogicEngine effects**, the seven holoprojector sequences and the twitch timer, and the `LE`/`HP`/Jawalite grammar. Three findings changed the shape of it. **The four firmwares do not listen on the same doors** — `imperial` and `r2kt` declare `I2CReceiver` and no `CommandEventSerial` at all, so a serial command to one of those boards is not refused, it is **never read**; `apxSend()` therefore models the transport and says which door was needed. **The front logic is TWO 9×5 boards**, so its serpentine RESTARTS at row 5 — a strict every-other-row map looks perfectly reasonable and renders the bottom half of every glyph mirrored, and the test that caught it was written against spot values off the published table. And **the brightness is applied twice**, then squared by FastLED, so `NORMAL` peaks at 18 of 255: correct, and black on a monitor — so the *renderer* carries a display curve and the *engine* stays faithful. On the MK4 the panels are placed and sized from **the CAD’s own named parts** — `SmallLogicLightUp`, `SmallLogicLightLow`, `LargeLogicInner`, the PSI rings — and the dome sphere is **fitted to the shell’s vertices**, 4.8 mm RMS over 4,306 points, after two cheaper fits came out 30 mm and 50 mm wrong. `domeLights: astropixels` leaves `park`. **57 new assertions.**; v1.68.0: **the ESP version, and the servo that would never have moved** — Mike, with boards on the desk: *"do we need to reveiew how they work so we dont have the same issues with jerkyness?"* Reviewing found something else first. `MpcaEsp32.h` compiles against both arduino-esp32 cores, and **on a 2.x core it used the GPIO NUMBER as the LEDC channel** — twelve of the sixteen default servo pins are above 15, where no channel exists, and the writes then went to a third number again, so setup and write addressed different channels even for the four legal pins. **Not one servo would have moved, on any pin, and nothing would have said why.** No test could catch it: `esp32shim/esp32env.h` hardcoded `ESP_ARDUINO_VERSION_MAJOR 3` and faked only the 3.x calls, so **the 2.x branch had never been compiled by anything**, and `ledc_test.cpp` builds under `MPCA_TEST_LEDC`, where the whole `#if defined(ESP32)` block — macros and attach loop — is preprocessed away. The channel is now the **array index** (0-15 by construction, which is what `MPCA_LEDC_MAX` means) and the pin is the GPIO; `ledcfake.h` refuses what the silicon refuses — an out-of-range channel, an unconfigured channel, a write to a channel with no pin on it — and the SAME assertions run through both branches. Proven red: the old mapping restored fails 10 of 25 on core 2 and the fake names the reason, while core 3 stays green, which is the shape of the bug. **On the jerkiness itself the answer is: no, and better.** The kinematics is one shared `MaestroPCA::update()` — `millis()` delta, drained in fixed 10 ms quanta — so every bit of v1.66.0's ramp work is already on the ESP path and none of it needs redoing. `ripple_test.cpp` measures what the servo is actually SHOWN, sampling the pin at its own 20 ms frame: on a one-second throw LEDC and a PCA9685 are indistinguishable (CV 0.079 vs 0.110) because the engine tick and the servo frame swamp any µs quantising, but **on a ten-second throw the PCA9685 stands still for 289 of 490 frames** (CV 1.199) while LEDC freezes none (CV 0.078) — 4.88 µs a count is simply bigger than the distance a crawl covers in a frame. The gentle panel open is exactly the move people call jerky, and direct pins fix it. **The ESP32's own risk is the radio, so the radio is OFF.** Mike: *"should we dissbale the wifi - not needed I dont think - maybe add it later on?"* `web.handleClient()` blocks, and arduino-esp32's `WebServer` waits **5000 ms** for a client that opened a socket and went quiet — which browsers do unprompted. Measured: blocking the loop 120 ms in every 200 takes ripple from 0.08 to 2.18 and a 20 µs frame step to 210 µs; past `update()`'s 250 ms clamp the routine also runs long, a millisecond for every millisecond, so it drifts out of step with its sound. `ESP_WIFI 0` compiles none of it (proven by the absent `WebServer` symbols, not by reading the source), and turning it on is one line — with the numbers and the proper fix, a pinned FreeRTOS task, written at the switch. **No motion task was added: with the radio off there is nothing to starve the motion, and untested concurrency for a feature that is not compiled in is a worse trade.** Also, `Esp32Droid` **becomes a pack** — its own `Config.h`, `sequences.h` and six library copies, byte-checked; it was a bare `.ino` leaning on a library Mike had deliberately removed from `libraries\`, so it could not have compiled on his machine at all. And **three guards that were not catching what they were written for**: the angled-include check greps three header names and had never heard of `MpcaEsp32.h`, which BOTH ESP sketches were including with angles in front of a green suite; `BT_LEDC` had no compile check of any kind, because "BOTH back ends" meant the other two; and `compile_esp32.cpp` named the `.ino` by a **relative path**, so a quoted include inside it resolved against the real sketch folder and every `-I` at a modified copy was silently ignored — three variants of `Config.h` all compiled the same original and all "passed". That last one was found only by asserting a new `#error` FIRES. The suite is 249 assertions, up from 203: LEDC on both cores, Esp32Droid on both cores x radio x pins/expander, the bench console on all three back ends, and both channel ceilings proven to refuse. MaestroPCA 0.9.0. **Still open: the radio itself.** Wanting it back means the pinned task and a mailbox, not flipping `ESP_WIFI` to 1. Then, before it: v1.67.1: **exit code 126, and the list view that said it passed** — the v1.67.0 release attached nothing. `make-packs.sh` went into the index as **100644**, because it was written through the file bridge rather than created in the working tree, and `run.sh` called it directly: 126 is *found it, could not execute it*. Fixed twice on purpose — the mode bit is set in the index AND `run.sh` calls it through `bash`, because the executable bit is absent on a Windows clone with `core.filemode false`, absent from a downloaded source zip, and was absent from the commit that introduced the line. Proven by stripping the bit and running the suite. **The near-miss is the lesson**: GitHub's Actions list page and the workflow list page BOTH rendered that run as succeeded. What gave it away was the artefact — `expanded_assets` for the tag showed two entries, the source archives GitHub writes for any tag, and none of the seven files the workflow attaches. The list view is not the result. Then, before it: v1.67.0: **the sketches ship as packs, and one file is the config** — Mike: *"can we create a pack for each that others can run with little config… + simple instructions that guide the user step by step"*, then *"make sure they are maintained moving forwards"*. A stranger who wanted to wire real hardware had to clone the repo, pick one of five sketch folders, discover for themselves that anything under `libraries\` is compiled twice, and then find the settings scattered down a 700-line `.ino`. Now: **one zip, unzip into the sketchbook, edit `Config.h`, upload**, with one library from Library Manager and nothing else to download. Every knob a builder touches is in that one file with the reason beside it and a default that already works; the sketches wrap their own defines in `#ifndef` so it wins, **checked by preprocessing the build rather than by reading it**. The bench console's channel table is now **COUNTED, not declared** — `BENCH_CHANNEL_LIST` is a list of `X("name", min, max)` and `MAESTRO_CHANNELS` is `sizeof(CHAN)/sizeof(CHAN[0])`; the old arrangement had a hand-typed 18 beside 18 rows, so raising one without the other left rows whose **name was a null pointer** and this console prints channel names. Adding a channel is one line and nothing else. **The packs are GENERATED, never committed**: `arduino/packs/make-packs.sh` zips the sketch folders themselves, because a zip in git would rot the first time somebody fixed a sketch and nothing would say so — and its manifest is EXPLICIT rather than a glob, since a working folder collects scratch (`sequencesold.h` sat beside the sketch for four days) and a glob ships it to strangers. It refuses to write anything if a library copy has drifted, `Config.h` is missing, the sketch has stopped reading it, or an include went angled; all four guards proven to fire. **And the firmware harness now runs in CI, which it never has** — that is what "maintained" has to mean: every push compiles both sketches from their own folder with nothing installed, asserts the five library copies are byte-identical to `src`, and builds the zips a release attaches. `R2_Bench_Console` gets its **first compile check ever**, against Pololu's real library rather than a stand-in, on BOTH back ends — the second reached by copying the folder and editing `Config.h`, which is the route a user takes rather than a `-D` flag no reader will type. It is the sketch that was found missing `MpcaScan.h` and the one left pointing at the wrong back end for an evening. Then, before it: v1.66.4: **the generated header includes its library in quotes** — Mike, flashing the droid sketch: *"sequences.h:22: fatal error: MaestroPCA.h: No such file or directory"*, with the file sitting two lines away in the same folder. An **angled include is only ever found on the LIBRARY path**, and `examples/MaestroReplacement/` now carries its own copy of MaestroPCA — so a generated header writing `<MaestroPCA.h>` cannot be compiled from that folder at all. Quoted searches the including file's own directory FIRST and the library path afterwards, so it works both ways. The `.ino` had been fixed for exactly this an hour earlier; **`sequences.h` writes its own include line** (`pca-gen.js`) and nobody had ever read it. `servos.h` had the same line in `setup-hw.js` and is fixed with it. **The pattern, three times in one evening** — angled includes, a renamed library that was still scanned, a sketch unzipped into `libraries\` — every one was reasoning about the Arduino toolchain instead of testing it, and every one was caught in seconds by Mike's compiler: the container proves the CODE compiles and says nothing about how the IDE resolves libraries. 4604 assertions. Then, before it: v1.66.3: **three boards, and the step that said two** — Mike, with three PCA9685s set on the servo hardware step: *"still not able to see all servos… capped at 32"*. **The channel table was 48 rows the whole time**, and so was the servo grid; the number he was reading was a SENTENCE and the sentence was wrong. `topo.pca` is a property of the SHAPE — `p1x2` declares 2 because that is the picture it draws — and since v1.54.0 the quantity has been an ANSWER (`b.pcaBoards`, 1–8, on any shape flagged `counted`). v1.54.0 fixed the derivation and the board-picture strip and missed the two sites that render the line a person actually reads: `wizard.js` said "2 × PCA9685 — 32 channels" and `hardware.js` said "PCA9685 × 2". Four sites, two right and two wrong, which is how it survived three releases of work on this exact area. There is now ONE function — `buildPcaTotal()`, over `buildPcaPerLink()`, because the two are genuinely different quantities (a `p2s`/`p1s` splits its expanders across two links, so what sizes one co-processor's answer is not what tells the user how many boards the droid has). And the other half of "without extra steps": on a build that already speaks PCA9685 the table grows the moment the count changes — measured 32 rows to 48, every name, endpoint and mapping untouched — but on a MAESTRO table it does not, because a change of KIND is not a change of size and v1.65.0 made that an offer on purpose. The offer just lived in the bench, three screens from the question that caused it; `wizServoTableGap()` now puts it on the step itself, naming both numbers. **The lesson, for the third time here: the model has been right every time** — `HW.count()` was 48, the grid drew 48 tiles — while the sentence on screen was computed by a fourth file from a number that stopped being the answer in v1.54.0. A derivation that is duplicated is a derivation that will be fixed in one place. 4602 assertions. Then, before it: v1.66.2: **two boards, two doors** — Mike: *"we should make a change so the maestros work as expected - I guess they diverge on out put but thats ok"*. They diverge completely, and that is the answer rather than a compromise. **PCA_Bridge has no kinematics at all** — a frame arrives and it calls `setPWM` — so it wants the engine's 100 Hz stream, 41 stepped positions for one full-throw move. **A Maestro is the exact opposite**: a Set Target starts a ramp it runs on the board, so streaming 41 positions at it means every one starts a fresh ramp the next interrupts 10 ms later, which is the "board is also applying its own speed on top of the sim's" line that has sat in the Serial pane since v1.56.0. So the same move now goes out as **two commands** on a Maestro (`0x87` Set Speed 94, `0x84` Set Target 8000, then silence) and **forty-eight** on a bridge. `serialPaces()` is the one question, `serialWrite()` stays the STREAM, the new `serialMove()` is the PACED door, and `mstrQuiet` still picks between them. **Sending the speed is not optional and not free**: a Maestro ramps at whatever it has STORED — Mike's dome is 80, a 1.1 s throw — so a 500 ms frame overruns and the routine drifts further behind with every brick. It is a runtime write, a power cycle restores his numbers, Pololu have no Get Speed to read them first, and the acceleration is left alone; all of which the Serial pane now says. Two details worth keeping: an OFF is an EVENT not a position, so it still goes through the stream on a paced board; and every manual writer already funnels through `HW.drive()` — checked before suppressing the stream, because a path that reached the wire only through the engine would have gone silent with no error anywhere. Still open: the `.mstr` SCRIPT generator still emits bare `set_target`, so a routine run from the board's own button uses the channel's stored speed rather than the brick's. 4584 assertions. Then, before it: v1.66.1: **the wire carries the authored timing** — Mike, reading v1.66.0's Still Open: *"can we fix this - PCA_Bridge's live-drive protocol has no speed command at all?"*. We can, and not the way that sentence implies: **the sentence was wrong**. `PCA_Bridge.ino` has no kinematics in it at all — a frame arrives and it calls `setPWM(pin, 0, payload)`, which is why its own header opens with *"The BROWSER runs …"* — so a speed command would mean bolting a trapezoid engine onto the one sketch whose identity is not having one, and re-flashing every board in the field for it. And it would solve nothing, because the browser **already streams the interpolated curve**: `pcaStepChannel` fires `onWrite` every 10 ms and hw-host wires that straight to `serialWrite`, so one frame target measurably goes down the wire as **41 stepped positions** at 100 Hz. The real gap was one argument wide — the engine paced those writes at the CHANNEL's speed because `HW.drive()` had nowhere to put the FRAME's, so v1.66.0's per-frame speeds reached the sim and the flashed board but not the live wire. `HW.drive(ch, qus, speed)` takes it now, `liveWrite` passes it and `applyFrameTargets(targets, speeds)` carries it through all five players that hold a frame. Measured: 500 ms asked → 480 ms taken, 900 ms asked → 890 ms taken, against a flat 410 ms before. A falsy speed RESTORES the channel table's own and `HW.releaseDriveSpeeds()` runs on disarm, the same rule the firmware and the JS twin follow. Genuinely still open: a real Pololu Maestro is the opposite case — it interpolates on the board, so it wants Set Speed (0x87) rather than a stream, and `mstrSetTarget()` still sends bare targets. 4572 assertions. Then, before it: v1.66.0: **a ramp is a move, not a staircase** — Mike, for the third time in four days: *"the servos still are jerky - way worse than it was"*. The comment this release deletes had been load-bearing since v1.12.0: `blocks.js` drew every ramp as a ~120 ms staircase because *"the board's own acceleration rounds the corners anyway"*, and it does not. Both `pcaStepChannel()` and the AVR build cap velocity at `vstop = 128*isqrt32(accel*distance_remaining)+256`, which plans to reach every target AT REST — so an intermediate waypoint is a full STOP, not a rounded corner, and 27% of ticks in a ramp were stationary. Two halves of one lever, and the obvious half fails alone: coarsening the step without pacing each move is monotonically WORSE (velocity ripple CV 0.56 at 100 ms rising to 1.68 at 1 s, because fewer waypoints means bigger jumps still chased flat out), while pacing them makes it monotonically better (0.55 down to 0.13). So the **ramp step is a per-routine setting**, default **500 ms**, exposed as a **Ramp step** select behind Advanced at Mike's request — and **every frame that moves a channel carries a speed sized to fill it**, from `chanSpeedForMs()`, the inverse of `chanTravelMs()`. The authored duration survives at every setting: worst error 0.1% at 250 and 500 ms, 0.8% at 750. 500 rather than 750 deliberately, because 750 collapses every ramp to a single move and a Control Center `<Sequence>` has nowhere to put a speed — a single-move ramp opened in Pololu's own software is the 2026-08-12 bug back again. Legacy is 120 and a routine carries its own step, so every routine written before this recompiles to the frames it already had, byte for byte; targets and durations are untouched throughout, the speeds ride alongside. The firmware carries it too — `MPCA_SEQ_SPEEDS` doubles the stride to `1 + 2*channels`, `releaseSeqSpeeds()` hands the channel table's value back at all five places a track lets go, and a new `sequences.h` against an old library **fails at compile time** rather than silently misreading the stride. Two of my own bugs caught by the suites: the stride has a READER as well as a writer (`pcaHeaderParse` read 35 frames back as 68), and the comment after the brace IS the routine's name, so annotating it renamed every imported routine and cost it its bricks. One that was not mine: **`pca-studio/PCA-Studio.html` was stale** — rebuild it on v1.65.0 and the smoke test drops to 85/1, because v1.63.0 removed the `board N -> I2C address` lines on purpose and the assertion still demanded `0x41`; the check that exists to catch staleness had been passing against an out-of-date artifact for three releases. Still open: **PCA_Bridge's live-drive protocol has no speed command at all**, so live drive to a bridge cannot pace its moves without a protocol bump (a real Maestro is fine — Set Speed 0x87). 4562 assertions both builds, plus PCA Studio's 86 and the Arduino suite's 176. Then, before it: v1.60.0: **the gauges move onto the stage** — Mike circled the stage and asked for them "where ive marked", "treated as another modle like we did for the polar mouse". So they are a MODEL again, the fifth, but a flat one: `#svScreen` covers `#stage`, the canvas and every piece of stage furniture except the model chip go, and the renderer is skipped. It therefore appears in BOTH stages — the big one and the sequencer's narrow column — for free, and v1.59.0's fifth workspace button is gone. The **180°/360° face is now per servo**, chosen on that servo's own card, with All buttons for the lot. Then, before it: v1.59.0: **the servo rack becomes a wall of gauges** — Mike did not like the 3D servos, so the fifth STAGE MODEL is gone and there is a fifth WORKSPACE instead: **SERVOS**, full width, one tile per channel on your board (6 to 128), each a **180° gauge or a 360° dial** at the flick of one switch. A tile IS a channel now — the `rkS<n>` actuator layer the rack invented is retired, and clicking a tile opens the panel card one size down: what it drives, what it is called, and a slider that moves it. Underneath it all, `CHPOS` finally lets the sim answer **"what is channel 7 doing"** for a channel wired to nothing at all. Then, before it: v1.58.0: **the manual is in the app** — a **📖 Manual** button in the header beside the ?, another on the setup screen's head so it is on all fifteen steps, a card at the top of the **?** panel and one above the lessons in **Learn**, all four going through the single `MANUAL_URL` in `app/manual.js`; and the manual itself gains **chapter 5, "A rack of servos, and nothing else"** — the fastest path a newcomer has from opening the file to watching something move — with a captured clip, taking it to twenty-one chapters and eight clips. Then, before it: v1.57.0: **a servo rack on the stage** — a fifth model that is nothing but a row of plain servos, one per channel on your board, each one mappable to a channel the way a dome panel is, so anyone can write a sequence and watch it move without a droid, a build or a CAD payload; the horn shows the servo's real **180°**, not a bipolar half of it; **Build its Maestro layout** turns an empty channel table into one servo per channel already wired, with eight routines (sweep, ripple, count up, wave) to press play on; the automatic wiring pass only ever claims channels whose Part column is **empty**, and the pass that takes the ones already driving your dome panels is behind an Advanced tick with its warning beside it and one click back. Then, the same day: **a builder's manual** — `docs/manual/`, twenty chapters with seven captured clips, plus a one-page quick start and a double-sided servo bench card; written against the running app and re-capturable with `tools/video-rig/cap_docs.js`. Then, in the app itself: v1.56.0: **the bench talks to a real Maestro** — Mike: *“if a maestro is directly connected can you control / read from it?”*, then *“I'm thinking if we can link to it for help setting it up via the simulator and skipping the maestro app altogether?”* It can now, for everything a bench DOES. The Maestro's USB **command port** is a virtual COM port, Web Serial opens it exactly as it opens PCA_Bridge's, and the unit is already right: a Maestro target is in **quarter-microseconds**, which is what this app has spoken since its first `.mstr` import — so `serialWrite(ch, qus)` needed no conversion at all, only a different envelope (`maestro-link.js`, Pololu 0J40 §5.e). It also does the one thing the PCA9685 path never could: it **asks the board where the servo actually is**. What it cannot do is CONFIGURE — min, max, neutral, home, channel mode and serial mode live behind the board's NATIVE USB interface, which a COM port cannot reach (0J40 §8), and **that gap is a silent trap, not an inconvenience**: the board clamps a Set Target to its own stored limits with no error and no reply, so a dial that keeps turning while the panel stops moving reads exactly like a binding linkage. So the read-back is the feature. `mstrWatch()` polls Get Position on the channel under the dial, and a servo that has SETTLED somewhere other than where it was asked is named in µs, with the stored limit identified as the cause — which Control Center itself does not tell you. The probe order is the other trap: `0xA1` (Get Errors) has its high bit set, and to PCA_Bridge a high bit IS a frame header, so asking a bridge whether it is a Maestro would move a servo. The text identify therefore always goes first, and the binary question is only asked once no sketch has answered AND the build says Pololu — or the user presses *it is a Pololu Maestro*. Finish, on a Maestro build only, says what Control Center is still for and hands over the settings `.mstr` that closes the gap. 48 assertions, both builds, red-first twice. v1.55.0: **the BUILD can hold eight of them too** — v1.54.0 raised the firmware and the wire protocol to eight PCA9685s, Mike flashed it, all three of his boards answered (`0x40`, `0x48`, `0x50`), and then: *“The Servo Hardware - doesnt show enough servos its only showing two”*. It was showing two because the build catalogue had exactly two PCA answers, `mpca16` and `mpca32`, and the arrangement step offered *one expander* and *two expanders* as two separate CARDS. Cards are right for a shape — controller or no controller, one link or two — and wrong for a quantity: eight of them would have been eight near-identical pictures differing by one rectangle. So the shape stays a card and the quantity becomes a **number beside it**, 1–8, capped at the wire protocol's ceiling rather than an arbitrary one. `p1` and `p1x2` were the same arrangement drawn twice and are now one card; `p1` is kept as a **hidden alias** because `servoTopoDef()` falls back to `SERVO_TOPOS[0]`, which is a *Maestro* shape — deleting the id would have turned a saved PCA build into a Maestro one. The co-processor options and the sequencer pseudo-boards are **generated** for 1–8 with `mpca16`/`mpca32` and `pca16`/`pca32` spelled exactly as they were, so every saved build, workspace and exported setup still reads. Three boards now grows the channel table to 48 and the exports to `PCA_BOARDS 3`. v1.54.0: **eight PCA9685s, not two** — Mike put three boards on the bench and the bridge answered *“1 more board(s) on the bus than this sketch drives (32 channels max)”*, so he asked whether that was a true limit: *“for the dome I need two and one for the body - 4 pcas would future proof me”*. It was not. Nothing about the hardware capped it — the **live-drive wire protocol** did. A frame's header byte spends its high bit marking the frame, and the channel was being read out of only SIX of the remaining seven bits, with 62 and 63 spent on the oscillator and the servo rate: 32 usable channels, two boards, and a dome wants two on its own. Reading all seven costs nothing and gives 0–127. Channels **0–125** drive servos, **126** is the oscillator and **127** the servo rate; both sketches carry eight drivers and bind whatever the boot scan found. **The dangerous part is that the two widths are indistinguishable on the wire**: send channel 70 to an older board and it decodes `70 & 0x3F` = 6 and moves a completely different servo, with no error and no clue. So the app reads the width off the BANNER once, at connect (`PCA-BRIDGE 2`+ or `MAESTRO-PCA 3`+ is wide, anything unrecognised is narrow), and DROPS what the connected board cannot decode with one plain warning rather than folding it. Nothing needs re-flashing to keep working; re-flashing is what unlocks channels 32 and up. The decoder is now tested where it is decoded — `bridge_test.cpp` runs real byte streams through `loop()` — and `MaestroReplacement`, the sketch that actually ends up in the droid, finally has a compile check of its own. v1.53.1: **PCA_Bridge needs no library** — v1.53.0 gave it `#include <MpcaScan.h>`, which quietly made the FIRST sketch a builder flashes depend on the MaestroPCA library being installed, for a bus scan it is the only user of. It carries its own copy of the scan instead and builds with nothing but Wire and Adafruit_PWMServoDriver, as it always has. A copy is a liability, so it is not left as a promise: `bridge_test.cpp` compiles the sketch and runs BOTH scans over the same seven buses, asserting they agree answer for answer and sweep the same addresses — change one and the test tells you about the other. It also gives PCA_Bridge the compile check it has never had. v1.53.0: **the sketches find the boards** — Mike: *"does the PCA sketches check for pca boards via a scan of all addresses as I and others may jumper them differently"*. They did not. Every sketch assumed CONSECUTIVE addresses from 0x40, and the two that probed at all probed only those, to decide whether to talk to a board they had already decided existed — bridge A1 instead of A0 and your board answers at 0x42, the sketch says "board 1 not present", channels 16–31 silently do nothing, and nothing mentions the board sitting right there on the bus. `MpcaScan.h` sweeps the real range (0x40–0x7F, six jumpers) and maps what it finds to board numbers in **ascending address order**, so 0x40+0x42 behaves exactly as 0x40+0x41 does. **The All Call is the trap**: a PCA9685 answers 0x70 out of the box, so a naive sweep turns one board into two — the phantom being every board at once, which would move every servo on the droid on a write meant for one. All five sketches re-address their drivers from the scan and print the mapping they settled on. Also: the ESP32 compile check in the Arduino test suite had been failing silently since it was written — `run.sh` sends the compiler’s stderr to `/dev/null` and two shim headers were missing. v1.52.0: **two placements** — the dome map’s **rotate slider moves under the drawing it turns** (it had sat in the panel header, a hand’s width from the thing it rotates and beside the buttons you press to LEAVE), taking `reset` with it; and **Pose and Frames are Advanced-only** in the sequencer. BRICKS is how a routine is authored, and the other two are ways of looking underneath it — a live pose set channel by channel, and the frame list the bricks compile to. Both useful, neither a beginner’s first move, so they go behind the same tick that already reveals the per-brick speed overrides. Hidden, never orphaning: unticking Advanced while you are standing in one of them returns you to the bricks rather than leaving you on a pane whose only door has just been removed. v1.51.0: **the dial is the view** — Mike sent back a screenshot of the Channels step with the list, the Configure panel AND the calibration dial all on screen and said *"this should be the default view"*, and *"rename use these ends to save servo setting"*. The dial is no longer a mode you enter: it is simply there for whichever channel is selected. Three things had to change to make that honest, each of them a lie the mode was hiding. **Opening it no longer moves a servo** — it used to drive to centre on the way in, which was fine when you had asked for it and unforgivable when clicking down a list would walk every panel on the droid to mid-travel in turn. **It no longer widens the channel** — the 1000–2000 µs working range that lets the dial reach past its own endpoints now lasts exactly one `calDrive()` call instead of the whole session, because "for as long as the dial is open" had just become "always" and every `HW.save()` would have written it over the builder’s measured travel. And **the panel and the dial show the same three numbers**, which are the dial’s pending ends, marked *not written yet* when they differ. Asked what should happen to a staged end when you walk away, Mike: *"keep it — leaving means keeping"* — so moving channel or closing the bench commits it, `cancel` stays the real undo, and only a deliberate capture or a typed number stages anything at all. v1.50.0: **the bench stops being a spreadsheet** — seven things Mike asked for in one pass over "Set up your servo hardware". The Channels step is a **list of who each channel is** (use · # · board·pin · name · drives · **test**) and an **always-visible Configure panel** that follows whatever row you click and holds everything that used to be a column — ends, centre, reversed, boot, speed, acceleration, ease, sleep, the dial and the live drive. Sixteen columns, the sideways scroll and the measured pinned-column offsets all go with it. **test** opens and closes the channel off the DIRECTED pair, so a reversed one really shuts. **The screen stops jumping**: `setupRender()` now brackets every rebuild, so the scroll position, the keyboard focus and the caret all survive ticking a box or clicking a dome panel. **Selection is visible in light mode** — a blue fill, an accent bar and a tick, not a grey wash. Apply says **"apply this setting to all N selected"**. The **dome map rotates** on a 0–359° slider, remembered, with every label turned back upright. The **PCA9685 step asks one question** — how many boards — with chained/star, power routing and supply amps moved behind ADVANCED, where the wiring diagram can still read them. And the **Sketch step links the sketches**, on GitHub, in a new tab. v1.49.0: **frames back into bricks** — Mike asked whether importing a Maestro gives you a brick view; for our own files it has since v1.48.0, and for anybody else’s it could not, because a Pololu file carries poses and nothing else. `blocks-trace.js` reads them back: each channel’s curve is cut into excursions, each excursion becomes one rise-hold-fall brick with its edges taken off the frame grid rather than interpolated, and then — the only part that matters — the proposal is MEASURED against the original at every instant the file had an opinion about. Two doors, Mike’s: **Work out the bricks** applies it, and **Work them out and review…** holds the original alongside, flags every channel the bricks do not reproduce on the timeline, and shows the error live in the inspector while you drag the brick until it says *matches*. **Both keep your original frame list in the library as “<name> (frames)”** — accepting a guess changes what the droid does, so the thing it was guessing at has to survive. A channel with no panel is named and offered the bench rather than silently dropped; discarding restores the frame list byte for byte; leaving the routine abandons the review rather than stranding it. On frames the compiler itself wrote it comes back clean, which is the property `tests/blocks-trace.test.js` exists to hold. v1.48.1: **the part mapping rides the file** — a Pololu `<Channel>` is name, mode, travel, speed and acceleration and nothing else, and a MaestroPCA table is no better, so "which panel is this channel?" was re-derived on every import with `guessPart(name)`. On the starter table the names ARE the guess. On Mike's they are not — he names a channel "Panel7" and wires it to the CAD lane `panel5`, because his physical numbering is not the CAD's — and a wholesale import of **his own exported file** came back with channels 11 and 12 both claiming `panel6`, `panel5` and `panel11` driven by nothing, and every brick naming either of them unwired. The frames were exact throughout, which is why it survived unseen until v1.48.0 gave the bricks a way home and `blocksTryAttach()` started refusing them (63 frames' worth recompiling to 54). The mapping now rides the same kind of comment the bricks do — `<!--r2sim:acts …-->` in the .mstr, `/* r2sim:acts … */` in the header, base64, stripped and rewritten on every export, ignored by Control Center and by the compiler — and `actsApply()` lets an authored entry beat the guess per channel while a missing one keeps it. Found by `tests/roundtrip.test.js`, which the same day had asserted the broken behaviour in both directions; five assertions cover it now, proven red by disabling `actsApply()`. v1.48.0: **unwired panels work in ALL sim playback, the bricks survive a round trip, and the round trip has a suite of its own** — `tests/roundtrip.test.js` (47 assertions, both builds) builds an eight-brick routine on a deliberately awkward table, exports it three ways, clears `localStorage`, reloads, rebuilds the same droid and reads each file back through the app's own doors; frames come back target-for-target on all four routes and the bricks now come back with them — except through a `.mstr`, which **carries no part mapping at all** and re-guesses it from the channel name, so a builder whose numbering disagrees with the CAD's gets his droid re-wired on import (two channels claiming `panel6`, `panel5` and `panel11` driven by nothing) and the bricks rightly refuse to re-attach. Frames stay exact, which is why it was invisible until the bricks had a way home. Asserted in both directions; — `seqStart()` recognises which LIBRARY routine its frames belong to (by identity) and `seqFreeOverlay()` lays unwired bricks' envelopes onto the model during ANY slot's playback — the pad, a loadout slot, the preview — parking them shut when the slot ends; and the brick structure now survives export/import on all three formats: the choreography `.json` always carried `blocks`, the `.mstr` and `sequences.h` writers embed them as a base64 comment (`r2sim:blocks` — Control Center and the compiler both ignore it), and every reader re-attaches them through `blocksTryAttach()` ONLY when compiling the bricks against the destination table reproduces the imported frames exactly — otherwise the frames win and the drop is counted out loud. From the round-trip report, items still OPEN: loadout membership silent on the merge path, the two doors disagreeing about clamping a stale target, and brick colours living in PREFS. v1.47.2: **unwired bricks work on the model** — an unmapped panel dragged into a routine now MOVES the 3D droid in preview and scrub (`blockEnvAt()`/`blockFreeAt()` in blocks.js — the brick's envelope in normalised travel, laid over `ACT_T` via the new `BLKH.applyFree` seam from `blockPoseAt()` and the follow loop), parks closed when the preview ends exactly as the wired home frame does, and still compiles to NOTHING — the emitted frames, the board and live drive are untouched, so mapping the panel later is the moment it starts driving the real droid; PCA Studio's host simply lacks the seam, so nothing changes there; the "moves nothing" tooltips and the preview toast now say "model only until mapped". v1.47.1: **choreography round-trips stop reversing and cross-wiring** — Mike diffed his choreography export against his sequences.h and the re-imported copies were wrong two ways: `mstrSrcEnds()` invented a 6000 "shut" for a homemode-Off source channel (a MaestroPCA header stores home 0, the parser fills 6000), so on any pair asymmetric about 6000 the adopted copy came back REVERSED — the home heuristic now fires only on an explicit Goto home inside the pair, otherwise the directed pair; and `mstrMatchChannels()` preferred the GUESSED act (`guessPart(name)`) over an exact authored name, cross-wiring "Panel7"→`panel11` builds — an exact name match now outranks the guess. His real files round-trip target-for-target identical. v1.47.0: **the sequencer's bulk edits and the snap picker's move** — the multi-select card gains **Runs for** and **Motion** (set every selected brick's duration, or its open / open-and-close / close shape, in one undoable gesture — `blkMultiDur()`/`blkMultiMode()` beside the existing Duplicate and Remove), and the **snap picker now IS the timeline ruler's corner cell** (it had sat in the crowded transport bar since v1.12.0, where Mike never found it — the control belongs beside the timing line it governs; same `#sqSnapWrap` id, built by `blkTimeline()` via `buildSnapPicker(host)`); servo speed needed **no change** — the bench inputs already accept Pololu's full 0–16000 speed / 0–255 acceleration, 0 = unlimited. v1.46.1: **the half-open panels** — Mike's screenshot showed every dome panel standing mid-travel, and the cause was the two places that still read a channel's `home`/`neutral` µs as a pose: the brick sequencer's `blockClosed()`/`blockOpen()` now come from the **directed pair** (shut end / open end, never `home || neutral || 6000`, never "furthest from home"), and `chanRest()` lets the actuator's own answer beat a measured Goto home **for any part on screen** (a board-only channel still obeys its Goto home); generated group sequences and the "+ Sequence" base frame park at `chanRest()`; foreign-choreography adoption keeps the home heuristic on the SOURCE side only (`mstrSrcEnds()` — a Control Center pair is always sorted, home is the only directional tell). The travel rule is now a **standing constraint**: the model's panels are an approximation and must never be made to match a user's real servo endpoint or home values. v1.46.0: **the sim stops inheriting a bad bench** — on the model a channel's `min` is SHUT and its `max` is FULLY OPEN, directed rather than sorted, so a narrow span, a big offset or a reversed pair animates the same full sweep and the real board still gets the authored microseconds (`chanEnds()`, `maestro/playback.js`); `invert` is **retired** and a legacy file carrying it is adopted by swapping its two ends; **an unmapped panel can be dragged into the sequencer and stays grey**, keeps its place and timing, is left out of the compiled frames with a named warning, and starts working the moment it has a channel; an **import sequence button on the sequencer desk**; the import job is **three visible choices** — servo config only, servo config and choreography, choreography only — with a choice the dropped file cannot satisfy unavailable *and reasoned*, a **replace prompt naming what you are about to lose** (cancel · save a copy first · replace), choreography offering **save-then-replace or add as additions** with the collisions named, "save a copy" writing a timestamped file that must land before the import proceeds, and the prompt sitting at the READER's door so all three servo-config entry points ask it; and Mike's two defaults — **one controller and two expanders**, first and selected, and **DY-SV5W** — which he chose to pair with padawan360 mod2026 knowing the sketch drives neither, so a fresh build shows exactly those two objections and one click hands the sketch to the setup; v1.45.0: **Mike's thirty-item list, in one release** — the app opens in **light mode**; **Servo hardware is image-led** (pick Maestro or PCA9685 by its photograph, then that family's own question: one board or two, or the expander arrangement, defaulting to one controller and two expanders); every **setup rail chip is one size**; **Reset really does clear the servo config** (it always deleted the store, and `pagehide` then wrote the still-populated table straight back); the **wiring diagrams are marked BETA** and the dead **Boards section is gone** from the Wiring step; **every saved file carries the date and the time**; the channel table is in **Mike's column order with the first six columns pinned**, so `configure…` never scrolls off the edge, and its four paragraphs of standing prose now fold away so you see the table; a **dome map inside the bench** assigns a channel to a panel by clicking the dome; the **second servo bench is folded into the first** — `#hwWrap` is gone, its live drive/position columns and its board link came with it, and **leaving the bench now disconnects the board**; the Maestro pane has **one guided front door** for build / import / export / assign; the sequencer **lists every moving panel**, with the unconfigured ones dashed and grey; a **PCA9685 `servos.h` / `sequences.h` can be imported as well as written**, with every field that cannot cross the boundary named rather than silently dropped; **one canonical sentence** says what can be imported and exported; **the track's furniture adapts to the track** — curvature-aware spacing, no interpenetrating rails or kerbs on a 3 m lap, no inverted barrier ring inside a hairpin, and the pinch warning no longer switches itself off on small circuits; gates are **sorted into track order** and the painted start line, the grid and the timing line finally agree; **named track layouts** with save-as, load, rename and delete, the stock lap never overwritable; the **Model Builder is repaired** — deleting a joint crashed the frame loop sixteen times a second — and gained **drag-and-drop with auto-connection**, **driven centre-pivot plates**, **per-joint preview sliders**, **usage instructions** and its **own model file** to export and import; **panels rest shut** (`chanRest()` — mid-travel is right for a gimbal and wrong for a door, which is why the pie panels sat half open); and the **MAESTRO 2025 chip is out of the header**; v1.44.1: **one browser launch, not thirty-one** — `tests/harness.js` owns the Chromium flags, and the GitHub workflows moved to the node24 action runtime; v1.44.0: **ready to be handed to strangers** — the project goes public with MrBaddeley's permission for the geometry, MIT (scoped) with forty lines saying what it does not cover, credits in the app, a rewritten README, two GitHub Actions, and the "rc flake" turned out to be a test measuring the wrong number; v1.43.0: **the servo config stops evaporating** — the channel table was never written to storage at all, so a refresh silently replaced an afternoon of names, endpoints and part mappings with a freshly generated starter (`maestro/servo-store.js`); **the sound board goes quiet while a setup overlay is open**, at the board rather than at the keyboard, because automation and the pad-connect greeting never went near a key; **a picture on every hardware card** from a drop folder (`src/art/boards/`, the file name is the whole API) with themed SVG stand-ins until the photos land; a **board link chip in the header**; **Set MIN / Set CENTER / Set MAX** on the dial; the servo step offers to **edit the config you have**, landing on the channel table rather than four questions in front of it; the **dome map drives** — a play button per channel and a connect bar; **Finish offers the whole setup as one file**; the sequencer gets **Clear all** with a confirm and an undo; `⚡ Model only` becomes `⚡ Sim only`; and **PCA Studio's hardware wizard could not open at all** since v1.42.0 — `escGuard` lived in a module Studio does not load, and Studio's smoke test was not in `./test.sh`; v1.39.4: **leaving the sequencer disarms live drive** — the arm is sequencer state, and an arm whose amber button is off screen is an arm you have forgotten; the link stays open and the servos hold where they are; v1.39.3: **Play works on a build with no Pololu Maestro** — the sequence clock was still gated on `PROFILE.hasMaestro` while the desk had been open to PCA9685 builds since v1.27.0, so Play armed a slot nothing ever stepped; the Part column shows the name the BUILDER gave a panel rather than the CAD's (four inner pies are all literally "Pie5"); and the sequencer lists only channels that drive something, like the brick library always has; v1.39.2: **assigning a servo to a panel from where you are standing** — a `drives` column in the bench's channel table (host-gated, so PCA Studio never sees it), an *Assign panels…* button on the Bench pane that lands ON the Panels step, and the part-first table back on the Config tab; v1.39.1: **the servo config has a door back in** — an import beside the export on the bench's Finish step and on the Maestro/Bench pane, a dropped `.json` routed by its `kind` instead of being refused by the whole-setup reader, and on a PCA build the Pololu settings import is no longer the only thing on offer: sequences-only is the button, the whole-file import is a line of text; v1.39.0: **the sequencer can drive the real servos**, armed from a switch beside the transport and hooked into `playback.js` so a pad cue and a music track follow the same arm — through the bench engine, so speed, acceleration and this droid's own end stops all apply; and **the servo step offers what you already have** instead of asking for a file you have not got, naming where the settings came from and when; v1.38.3: **the bench asks before it lets you go, and offers one file instead of three** — Finish now prompts on WORK done (a channel named, ticked, measured, or any edit at all) rather than on travel that differs from the factory pair, and the Finish step shows the servo config alone, with `servos.h` appearing only once you pick a sketch that must be compiled with it and the whole-bench backup under Advanced; v1.38.2: PCA_Bridge is in **`pca-studio/`**, not under `arduino/MaestroPCA/examples/` — the setup wizard said the wrong folder in three places, and the paths are pinned by a test now; v1.38.1: **the Channels step can reach the board** — a Connect hardware button on the step whose whole premise is driving a real servo, and the link chrome no longer assumes the Bench tab is on screen; v1.38.0: **the servo setup path is one flow now** — the import offer matches the boards you actually have, "measure them now" opens the bench carrying your answers, the bench opens on PCA_Bridge, MaestroReplacement stays locked until there is travel to bake in and says it hands the droid to Padawan360, and Finish offers the file and returns you to the wizard; v1.37.0: **Servo setup is its own step after Firmware** and opens by asking whether you already have a config to import — travel only, from a .mstr or our own export; the Firmware step links only the sketch you chose; the bench popout hides its two dangerous controls behind an Advanced tick and finally takes its colours from the theme; v1.36.0: **the servo step is a form and a set of flow diagrams** — Maestro / PCA9685 / Other in a dropdown, then you pick the arrangement whose PICTURE matches your droid, with the three the sketch cannot address drawn dashed and labelled; firmware back to last; v1.35.0: **the platform comes first** — controller, controller board, then the sketch, and a sketch you chose is never silently swapped; **Servo hardware** asks the KIND before the part number; and a **bench walkthrough** for setting the servos up physically, with the right tool for the board you picked; v1.34.0: **one servo question, not two** — dome and body side by side, "one controller for the whole droid" as a real answer, and how two boards reach the host (with the compact-protocol trap that arrangement carries); v1.33.0: **an Arduino or ESP32 running MaestroPCA is a build answer** — PCA9685s behind a co-processor that the Padawan sketch cannot tell from a Maestro, with the chip and the expander count owned by the build and read back by the Bench; v1.32.0: **the model comes first** — setup opens on a picture of each model, and the nine hardware questions grey out the ones the chosen model does not use; **the RC transmitter is a real input** — pick the device, calibrate its endpoints, assign its channels to the pad map or, behind Advanced, straight to an output; v1.28.0: **Sim only** — a public driving mode you hand the laptop over in, with a temporary password on the way out; v1.25.0: past the Maestro — release-when-settled, background sequences that resume, oscillator/wander generators, per-channel easing, link watchdog; v1.24.0: concurrent sequence tracks and looping — a holo idle-sweep survives a panel button press; MaestroLink makes a spare Arduino a drop-in Maestro; PCA Studio 0.2.0; v1.23.0: the PCA9685 route — the MaestroPCA Arduino library plays Maestro-style sequences on a £5 PCA9685, its JS twin lives in the sim, and the Maestro tab exports a generated `sequences.h`; v1.22.0: every imported sketch is its own firmware; v1.21.0: the sketch transpiler and shareable .mstr files; v1.20.0: the rest of the August revert undone)

---

## 1. What this is and why

Mike is building a physical R2-D2 (MrBaddeley Printed Droid **MK4**). This
simulator exists to de-risk the electronics and firmware **before anything is
wired**: it runs three real Arduino sketches, unmodified in behaviour, against a
model of the actual hardware, and drives the real MK4 CAD geometry from the
resulting servo values.

It has already earned its keep — see §4, the confirmed firmware bugs. That list
is the highest-value output of the project so far.

**Open hardware decision:** the foot drive is *not chosen yet* — Sabertooth
brushed vs Flipsky/brushless hub motors. That is why `FOOT_CONTROLLER` is a live
toggle in the sim rather than a compile-time constant. Don't "simplify" it away.

**Licence constraint:** the MK4 and Polar Mouse geometry is MrBaddeley's **paid
Patreon** design, included here **with his permission** (2026-08-17) — see
`CREDITS.md`. That permission is for THIS project to publish it and does not
travel onward: nobody who clones this repository may extract, repackage or
redistribute `src/js/cad/payload.js`, `src/js/cad/mouse-payload.js` or the
`.r2m` files. Anyone forking and republishing asks him themselves. The raw
Fusion OBJ exports have never been in the repository and stay out of it.

---

## 2. Current state

| | |
|---|---|
| Modules | 113 JS, 15 CSS, 1 markup fragment (+ the MaestroPCA Arduino library under `arduino/`) — v1.74.0 added the eight of `js/lights/` |
| Tests | **6108 passing** across 37 suites, both builds, zero failures — plus PCA Studio's 86-assertion smoke test (in `./test.sh`) and 169 host-compiled C++ assertions plus **four** sketch-compile checks in `arduino/MaestroPCA/test` (`./run.sh`). v1.45.0 added 227 of them and v1.60.0 carries the gauges' 45, every one written red first |
| Dist size | ≈8.69 MB single self-contained HTML (0.75 MB of it the twenty-one board photos, inlined) |
| PCA Studio | 0.12.2 — built from `pca-studio/manifest.json` — 20 modules, 12 of them the sim's own |
| Firmware profiles | 3 hand ports (mod2026, Maestro 2025 PWM, Maestro 2022 BETA) + one per imported `.ino`, side by side |
| Maestro boards | 4 Pololu (Micro 6, Mini 12/18/24) — **driven and read back over USB since v1.56.0** — + the MaestroPCA co-processor, **up to eight PCA9685s / 128 channels** (v1.54.0 in the firmware, v1.55.0 in the build) |

Working: a **guided build setup** (nine hardware questions) that is now the ONLY place the droid is
configured — and it opens by asking **which model** you are setting up, as three
pictures, because the answer changes how the nine hardware questions read; 3D droid (procedural stand-in **and** the real MK4 geometry),
real + on-screen Xbox pad, a **calibrated RC transmitter**, the three firmware ports with live config, PCA9685
and Maestro output tables, serial console, `.mstr` import/export with a sequence
and pose editor, door and dome animations, paint/theme, and the channel→part
mapping table with live test sliders, four **environments** to stand it in, a
**practice circuit** with barriers and per-lap timing, and a **lessons** mode
that teaches you to operate it, three **view modes**, and a **brick
sequencer** you build routines in by dragging, with a **part colour** each and
a **script loadout** that decides what actually reaches the board. The Config
tab is the sketch's own constants and nothing else. And a **Sim only** mode —
the app folded down to the droid, its backdrop and the pad, with a temporary
password on the way out, for handing the laptop to the public at a show.

Run `./build.sh` then open `dev.html`. Full detail in `README.md`.

> **The August 2026 partial revert is CLOSED as of v1.20.0.** For a week
> this folder carried the UI programme's JS and CSS on top of a
> pre-UI-programme `body.html`, `main.js`, `manifest.json`, `test.sh` and
> half of `03-pad.css`. Both halves are repaired — see the v1.19.0 and
> v1.20.0 change-log entries, which are also the record of how it was
> diagnosed if it ever happens again.

---

## 3. Decisions and why they are that way

### The HW seam — one copy of the servo bench, two apps

PCA Studio was built as a place to get the servo-setup screen right before it
went near the sim. When it was folded in (2026-08-12, v1.29.0–1.31.0) the
choice was copy or share, and this repo has already paid for copying once —
the PCA engine existed as a hand-kept copy inside PCA-Studio.html until
v1.26.0, and a hand-kept copy is a copy that eventually differs.

So four modules live once and run in both apps, written against `HW`: the
setup wizard and dial (`maestro/setup-hw.js`), Web Serial
(`maestro/serial-link.js`), the live channel table (`maestro/hw-table.js`) and
the servo vocabulary (`maestro/servo-units.js`). The sim implements `HW` in
`maestro/hw-host.js` over `MSTR`; Studio in `pca-studio/src/js/44-hw-host.js`
over `PROJ`.

**The rule for the contract:** everything in it is something the two hosts
genuinely disagree about. Anything they agree on belongs in the shared module,
not the seam. The disagreements that turned out to be real are worth knowing:

- **`setupCount()`** — Studio OWNS its hardware, so "two boards" means the
  project HAS 32 channels and grows or shrinks to match. The sim's channel
  count is a build answer, and its rows carry names, actuator mappings and
  endpoints tuned against real linkages, so the wizard reads the build and
  never resizes the table. `trim(n)` is a real operation in one and a
  deliberate no-op in the other for the same reason.
- **`drive(ch, qus)`** — Studio's engine IS its droid. The sim's mirrors into
  `ACT_T` as well, so one command reaches the engine, the wire and the model.
- **`changed()`** — Studio repaints a frame grid; the sim repaints a channel
  map, a wiring sheet and a sequencer.

**The sim's bench engine is not the firmware.** `HW.engine()` is a `pcaseq`
instance modelling what the PCA9685s are doing. The firmware profiles still
own the droid in Drive and Sequence; this owns it while you are at the Bench.
They must not be merged: one is a model of a sketch, the other a model of a
board.


Reversing any of these without knowing the reason will cost a day. Each cost one
already.

**Concatenated classic scripts, not ES modules.** Mike opens the sim from disk.
`file://` blocks ES modules (CORS) but allows classic `<script src>`. So every
module is a plain script sharing the global lexical scope, and `dev.html` works
with no server. `tools/build.js` generates dev and dist from one manifest so they
cannot drift.

**One `<script>` tag per module in *both* builds.** Keeps semantics identical
between dev and dist, and stops a syntax error in one file from swallowing the
next.

**Firmware is ported, not approximated.** `loop()` is transcribed statement for
statement, including Arduino's integer `map()` (`Math.trunc`), `random(min,max)`
exclusive max, and `getButtonClick` consume-on-read. The point is to reproduce
bugs, so "tidying" a port destroys the value.

**`.mstr` schema was read from Pololu's SDK source**
(`pololu-usb-sdk` → `ConfigurationFile.cs`, `Sequence.cs`, `Frame.cs`), not from
the docs. That is why the delta encoding, `frame_*` naming and pop order are
exact. Details in the `maestro-format` memory note.

**Paint works on (kind, file, material) slots, not materials.** Fusion exports
one `Steel_-_Satin` across **128 parts** — dome skin, legs, body, greebles. Paint
by material and the dome comes out grey. Meshes get a material cloned per slot,
which is the granularity they were already batched at, so it costs zero extra
draw calls. Kind beats material when assigning the default role.

**The SETUP owns configuration; the Config tab owns the sketch.** Mike,
2026-07-27: *"anything that's in the setup should be removed from the config
tab"*. So the build answers, the boards and pin maps, the panel↔servo table,
the paint and the backdrop live in the setup wizard, and the Config tab holds
the sketch's own constants — speeds, deadzones, endpoints, slot mappings — plus
a read-only summary and a way back into the setup. Two editable copies of the
same thing only invited them to disagree. The header firmware buttons went the
same way: the sketch is a build answer, so the header carries a read-only tag.

**The build config is the source of truth, not documentation.** `PREFS.build`
answers nine hardware questions, and `SIM.profile`, `CFG.FOOT_CONTROLLER` and
the live Maestro board size are all **derived** from it (`buildApply()`). A
builder knows what is bolted in, not which `.ino` line to change. Picking
Flipsky hub motors switches the sim to the only sketch that can drive them and
sets `FOOT_CONTROLLER = 1`, right then. If you find yourself setting a profile
or a foot mode from somewhere else, you are working against this — change the
build answer instead. **`PREFS.hw` is still the store the Boards section reads;
`buildSet()` writes through to it, and `hwDefault()` reads back from the build,
so there is one answer and not two.**

**Firmware blockers are weighted, not counted.** `firmwareBlockers()` returns
`{why, w}`. A sound-board mismatch is `BLOCK_SOFT` (a £15 module swap); a
servo-board or foot-drive mismatch is `BLOCK_HARD` (the sketch physically
cannot speak to what is fitted). Ranking by *count* made a sound objection
outvote a drive one and recommended the wrong sketch. Keep the weights.

**Options carry a `sim` honesty flag.** `'full'` modelled, `'sub'` stands in
for something equivalent, `'park'` recorded on the wiring sheet but not
simulated (the RC transmitter, AstroPixels, the Due). Parked answers are
choosable on purpose — Mike asked for the RC question now and the RC code
later — and they are shown dashed on the wiring diagram rather than left off,
because it is still a wire you have to run. **Never silently upgrade a `park`
to `full`; add the firmware first.**

**Sequences are BRICKS that compile to frames.** `maestro/blocks.js` holds a
routine as a list of blocks on a timeline; `blockCompile()` turns it back into
the absolute keyframes the Maestro actually understands, by collecting every
event boundary and evaluating every channel at each one. The frames are
regenerated on every edit, so the `.mstr` export, the preview and the
subroutine table never had to change. **A block's `rise`/`fall` are the
per-instance speed overrides** — they live on the block, so editing one cannot
touch the library action or the same action in another routine. A sequence
without a `blocks` array is a hand-made frame list and is left completely
alone, which is what keeps an imported `.mstr` editable the old way.

**ONE model is on the stage at a time, and `PREFS.model` is the whole of it.**
Mike, 2026-07-29: *"in the model tab put a selection thing so that only one
model is displayed and works."* Three things can stand on the stage now, and
having all three out made the Model tab lie — its visibility switches, its ride
height and its part table are all the DROID's, and they were sitting above two
other models they say nothing about. `scene/models.js` holds the one selection
and everything derives from it: what is visible, who has the pad, which
channels are registered in `ACT` (so the Outputs table, the sequencer and the
wiring sheet describe what you are looking at), and which panel the Model tab
draws. **It does not stop the sketch.** Selecting the head takes the droid off
the stage; it does not switch the firmware off — `loop()`, the serial console
and the automation timers all carry on, for the same reason view modes hide
rather than simplify. The stage bar's two toggles (`btnAnz`, `btnMouse`)
collapsed into one `btnModel` that names what is on the stage, because two
independent toggles could disagree with each other and with the pane.

**The Polar Mouse gets a CAR's drive model, because it is a car.** R2 is
skid-steer: two driven feet, turns on the spot. `Polar+Mouse+with+Chariot.obj`
has a steering rack — SteerBar, kingpins, servo horns — a differential and a
fixed rear axle, so `scene/mouse.js` gives it a bicycle model about the rear
axle with Ackermann geometry on the front pair, and **it cannot turn on the
spot**. Reusing `effTurn()` to "simplify" this would put a model on screen
that lies about the chassis in the CAD, which is the one thing this simulator
must not do. `tests/mouse.test.js` measures the arc it actually drives against
`wheelbase / tan(steer)` and asserts the stationary-full-lock case does
nothing.

Everything the model needs is **measured off the geometry**, not typed in:
`cad/mouse.py` finds the six wheels by their axle planes, takes the wheelbase,
both tracks and the tyre radius from them, and locates the hitch pin at the
overlap of `MouseTow` (the bracket on the droid) and `TowBar` (the first part
of the trailer). Those travel in the header's `vehicle` block. If the geometry
is re-exported, the numbers follow on their own.

**The chariot TRACKS, it is not welded on.** Standard tractor-trailer
constraint with the pin behind the driven axle:
`psi' = (v*sin(theta-psi) - d*theta'*cos(theta-psi)) / Lt`. Forwards it pulls
straight; reversing, the same equation diverges — that is the jack-knife, it
is real, and it is kept, clamped only so it cannot fold through the towbar.

**The pad belongs to ONE vehicle at a time.** On a bench the mouse is a
separate receiver, so while it is being driven the *sketch* sees the sticks
CENTRED — `mouseTakeSticks()` is called from `pollInput()` and hands the
firmware zeros. Anything else and the droid drives off across the room while
you are steering the trolley. Buttons are deliberately NOT gated: sounds and
sequences are not driving.

**The Anzellan head is a SECOND animatronic, not a droid accessory.** Mike
sent a photo of a silicone Babu-Frik-style puppet head on a bench stand and
asked whether the sim could model one. `scene/anzellan.js` is the answer: a
fully procedural head with an eleven-channel face rig. Three rules make it fit
rather than bolt on:

- **Its channels only exist while it is on stage.** `anzSetShown()` adds the
  eleven `anz*` keys to `ACT`/`ACT_T` and takes them out again. `ACT` is what
  the Outputs table, the sequencer's action library and the wiring sheet all
  read, and eleven dead face channels sitting in an R2-only build would be
  noise on every one of them.
- **A face is not a door.** Every droid actuator honestly rests at 0 = shut.
  Head pan/tilt/nod and the eyes rest CENTRED, so each entry in `ANZ_ACTS`
  carries its own `home`, `anzRegister()` seeds from it, and the `anzellan`
  Maestro starter writes it into the channel's power-on `Goto`. Home a gimbal
  at an endpoint and the head boots up with its neck fully over.
- **The idle loop stops where the board starts.** `anzIdle()` blinks, drifts
  and chatters the jaw along with `SND.at`, but it skips any channel
  `blockChan()` says a Maestro owns. A lifelike wobble laid on top of a real
  sequence would be a lie about what the servo is doing, and lying about the
  hardware is the one thing this simulator must not do.

It is world-anchored, not parented to `R2.root` — the stand is furniture, and
it stays put when the droid drives off. Eleven channels is also exactly a Mini
Maestro 12 with one spare, which is the board that would actually go in it.

**View modes hide, they never simplify.** `config/views.js` gates which tabs
are visible; the sketch runs identically in all three. A "simple mode" that
quietly simplified the model would undermine the entire point of the
simulator, which is reproducing the firmware exactly.

**The wiring sheet follows the BUILD, not the running sketch.** It is a bench
document: what matters is which board the lead plugs into. `wiringSource()`
walks both configured locations through `hwPins()`. There is deliberately NO
fallback to the loaded `.mstr` — an actuator mapped in a settings file but not
on a board this build has is *not driven*, and saying so is the truth.

**Environments override the theme, and are applied last.** `applyStageTheme()`
paints the studio look and then hands to `envApply()` if anything other than
the studio is selected. A room's walls and roof are tagged as *shells* and
CULLED when the camera leaves the room (`envCull`, once a frame) — BackSide
does not work, because a closed box is opaque from every angle, you just see
its inner face instead.

**Canvas textures must declare `sRGBEncoding`.** The renderer outputs sRGB, so
a colour texture that does not say it is sRGB is treated as linear and every
surface comes out washed-out white. The workshop's concrete looked like paper
until this was set.

**Lessons detect the DROID, never the button.** `LESSONS[].done()` reads the
same state the sketch sets — `FW.isDriveEnabled`, `SND.at`, `MAESTRO.slot`,
`ACT`, `MOT`. Anything that measures a *change* compares against a baseline
snapshot taken when the lessons start, or the sketch's boot sound ticks "make
some noise" before the user touches anything.

**Theme is CSS variables *plus* a 3D counterpart.** `applyTheme()` retints fog,
ground, grid and all four lights as well as flipping `body.light`. A CSS-only
light theme leaves a black 3D stage in the middle of a white app.

**Part names are Mike's; actuator IDs are ours, and they deliberately don't
match.** Every CAD name (`MainPie3`, `FLBreadpanDoor`, `Panel13`) comes verbatim
from the Fusion `g` groups — nothing was renamed. The actuator IDs (`pie0…11`,
`panel0…13`, `doorL`…) are the sim's, numbered **by azimuth around the droid,
front first**, because a firmware channel maps to a physical position. So
`panel0` is `Panel13`. It has to be that way: four of the inner pies are all
called `Pie5` in the CAD, so their names carry no ordering. (Real-build
corrections: the outer MainPies are one printed piece with the dome — static
shell — and CAD `Pie6` does not move either, so only FIVE pies actuate,
`pie0-4`.) **Exception since v1.1.0 — the pies follow Mike's physical
numbering, not plain azimuth order:** the fixed `Pie6` anchors the ring and
the movers count 1-5 anticlockwise from it as you face the droid looking down
(= decreasing azimuth); `buildCad` stamps `p.label` "Pie 1".."Pie 6 (fixed)"
and `partLabel()`/`actPartLabel()` surface those everywhere. Because the two
systems diverge, **anywhere an actuator ID is shown to a human, its label or
CAD name goes with it** — `cad/naming.js` exists for exactly that.

**Paint is per-part via vertex colours, not per-material.** Since the selection
feature, every CAD geometry carries a `color` attribute; painted slot materials
are WHITE with `vertexColors:true`, and `applyPaint()` resolves each part as
**override → group colour → role colour** and writes its vertex range. That is
what lets one merged mesh carry many part colours at zero extra draw calls
(still ~51). Do not set colours on slot materials directly — they multiply the
vertex colour. `effectivePartHex(name)` is the query helper.

**Test actions route through `actSet()`, not `ACT_T` directly.** Under mod2026
the PCA9685 layer owns its 21 actuators (ACT is overwritten from `servoTravel()`
every frame), so `actSet()` commands the servo model through `setPWM()` there
and falls back to the `ACT_T` ramp everywhere else. Group open/close and the
selection card's test slider both use it — bypassing it makes buttons dead on
exactly one profile and nobody notices until a demo.

**Tests wait on `SIM.millis` or on state, never `waitForTimeout`.** Headless
swiftshader runs simulated time far behind the wall clock, and the page gets
heavier with each feature. Wall-clock waits pass today and flake next month.

---

### The library is not the board

`MSTR.sequences` is everything you have ever saved. `MSTR.loadout` is the
ordered list of names that gets compiled into the `<Script>` — and because the
script is what defines the subroutines, that list is what decides which number
`restartScript(n)` hits.

Mike, 2026-07-27: *"playing in the sequencer should[n't] change the Maestro
scripts, that should be a separate operation … then we have a separate step
under the Maestro tab to select and order which sequences are loaded."*

So building, playing, renaming and **saving** in the sequencer only ever touch
the library. A routine sits there until someone puts it on the board in the
**Build your Maestro** workspace (since v1.12.0 the full-screen builder IS the
loadout editor — one builder, two doors: the Sequencer's top-bar button and the
Maestro tab's Script-loadout section both open it; the tab section itself is a
read-only summary). Two things are deliberately exempt, because they are
already an explicit "put this on the board" gesture: the group **⟶M** button
and the music routine builder both call `loadoutAdd()`.

`loadout === null` means "all of them", which is only true before anything is
loaded. Every place that replaces the whole sequence list — `parseMstr`,
`makeStarter`, `setupImport` — calls `loadoutReset()` to turn that into an
explicit list, or a routine saved afterwards would sneak onto the board.

The `<Sequences>` block of an exported `.mstr` still carries the **whole**
library: that block is Control Center's sequence list, not the board.

### A part's colour, its motion and its pivot are all overrides

Three separate layers now ride on top of the CAD, and none of them changes it:

- **`PARTS.overrides[name].motion`** — the advanced motion editor. The `.r2m`'s
  rig came from geometry and is sometimes wrong on the real build (the utility
  arms were). `m.rig0` keeps what the CAD said, so **CAD rig** always has
  something to go back to.
- **`m.mOff`** — the trick that makes a hand-set pivot free. The geometry was
  baked relative to the original pivot at load time, so moving the pivot means
  moving the group there and pushing the mesh back by the same vector: every
  vertex lands exactly where it was, but now it turns about somewhere else. No
  buffer is touched. (It is `mOff`, **not** `base` — `m.base` is already the
  part's CAD base name.)
- **`BLK.tint`** — the sequencer's identification colours, read by
  `effectivePartHex()` at the top of the stack. Nothing is stored, so switching
  it off restores the override / group / scheme stack underneath it.

## 4. Firmware bugs confirmed by simulation

All reproduced in tests. This is what the project is *for* — keep adding to it.

**mod2026**
- **Sabertooth watchdog starvation.** Drive packets are only sent on *change*,
  but `setup()` calls `setTimeout(950)`. Hold a steady throttle — especially full
  deflection, where the mapped value pins to `DRIVESPEED` — and packets stop, so
  the Sabertooth cuts the motors after 950 ms. Fix: send every pass, or on a timer.
- **Automation dome turn never reaches the Syren.** `Syren10.motor(1, turnDirection)`
  in the automation block is overwritten by the unconditional
  `Syren10.motor(1, domeThrottle)` at the end of the same pass.
- `setup()` never homes the PCA9685 channels.

**Both Maestro sketches**
- `delay(750)` inside automation blocks the whole loop — no controller polling,
  no motor updates.
- `Serial.println()` collides with the DY-SV5W: `DY::Player player;` defaults to
  `Serial`, and the START/BACK handlers print to that same UART.
- Volume inverted — D-pad ▲ runs `vol--`; on the DY-SV5W 30 is loudest
  (MP3Trigger convention left over).
- Bare **X** plays `random(32,52)` (same as bare B) instead of the whistle bank.
- `isLeftStickDrive` doesn't swap L3/R3 — both branches assign the same buttons.
- Held d-pad restarts Maestro scripts forever (`getButtonPress`, not
  `getButtonClick`). Tap, don't hold.

**Maestro 2025 only** — `mixHubDrive()` overshoots the speed cap: unconstrained
`map()` from a ±100 range produces 139 at speed 3 where the cap is 125 (~19%
over). Only `Servo::write()`'s 180 clamp saves it.

**Maestro 2022 BETA only** — the lost-controller block never clears
`isDriveEnabled`, so the droid re-arms itself on reconnect with no START press.

---

## 5. Where each area stands

| Area | State | Notes |
|---|---|---|
| Firmware ports | Done | Three profiles, live config with `.ino` export |
| Drive / motors | Done | Sabertooth + Syren + hub mixing, watchdogs modelled |
| Audio | Done | MD-YX5300 and DY-SV5W, cue indicator. **DY-SV5W is the default and the first card** (Mike, v1.46.0) |
| CAD model | Done | 36 rigged parts, hinges from the CAD's own hinge bodies |
| Maestro import/export | Done | Round-trips against Pololu's own script format. v1.46.0: the import job is **three visible choices** (servo config only · servo config and choreography · choreography only), each saying what it touches and what it leaves alone, with replace/merge prompts and a timestamped copy of what is about to go |
| Maestro boards | Done | 4 variants, board-correct export, script-size warning |
| Channel → part mapping | Done | Live test sliders, auto-map, CAD-part indicator |
| Part naming | Done | CAD names paired with actuator IDs throughout the UI |
| Click-to-select | Done | Raycast picking incl. merged statics, rename, colour, test slider, port picker |
| Electronics config | v6 | **Eight** build questions — controller, board, servos, the rest, firmware last. One **Servo hardware** question, built as a form: device dropdown (Maestro · PCA9685 · Other), the arrangement chosen from **flow diagrams**, board/controller dropdowns, and the physical bench walkthrough. Boards + pin maps on the Config tab |
| Part groups | Done | Group colour, flash/open/close, firmware-slot anims, →Maestro sequences |
| Wiring reference | Done | Printable HTML + CSV: build table, **system control-signal diagram**, per-channel table |
| Paint + startup screen | Done | 8 roles, 6 schemes, per-slot overrides, persisted |
| Light / dark theme | Done | CSS + 3D, remembered |
| Practice circuit | Done | Closed circuit, kerbs, barriers, 6 gates, per-lap times, hangar deck |
| Setup export/import | Done | One .json: profile+CFG, Maestro, mapping, parts, paint, themes, hw, **build** |
| Music sequencer | Done | Beat detect, strong beats/bars, 4 snap modes, beat-driven routines, synced preview |
| Brick sequencer | Done | v2: show-control layout, playhead/scrub, snap-with-indicator, grouped+searchable library, inspector column. v1.46.0: **an unmapped panel drags in and stays grey** — kept in the routine, left out of the compiled frames with a named warning and a *map them…* door; an **import sequence** button on the desk |
| Imported-config authority | Done | Channel table never rewritten; ramps floored at imported speed/accel; overrides badged + restorable behind Advanced |
| Build your Maestro | Done | Full-screen builder: select · order · validate (lint) · generate/export, two doors |
| View modes | Done | No config · Simple · Advanced, gating Serial and Config |
| Guided setup wizard | Done | 15 steps, full-page, first-run, answers applied immediately; **step 1 is the model**, and questions the model does not use are greyed but still answerable |
| Panel ↔ servo assignment | Done | Part-first table with colour and test, droid docked beside it in the wizard |
| Output rows | Done | Click one for its channel, a position slider, open/close/cycle and its colour |
| Resizable panes | Done | Sidebar and strip splitters, clamped and remembered |
| Environments | Done | Studio · Workshop · Desert flats · Hangar bay, all procedural |
| Lessons | Done | 11-13 tasks detected from the droid's own state, HUD prompt + Learn tab |
| Anzellan head | Done | Procedural puppet head, 11-channel face rig, own Maestro starter, idle behaviour |
| Polar Mouse | Done | Drivable: Ackermann steering, measured chassis, towed chariot, pad hand-over |
| Stage model selector | Done | One model at a time — visibility, the pad, the ACT channels and the Model pane all follow it. Chosen on the FIRST setup step from hand-drawn SVG cards, or from the stage button |
| RC transmitter | v1 | Device picker · endpoint/rest calibration · channels → the Xbox map, or (Advanced) straight to a motor or servo. `sim:'sub'` — no sketch reads a radio |
| Puppet mode | Done | Every stick half / trigger / button is a servo STRING, spring-back feel, hold or latch |
| Cues | Done | A control can instead fire a whole ACTION — part, group or saved routine; hold-to-open, analog partial travel, routine cues one-shot |
| Performance recorder | Done | 3-2-1, then: cues fired ⇒ a brick routine that opens in the sequencer; strings only ⇒ a plain frame list |
| PCA9685 route | v3 | Library + JS twins + generator; **MaestroLink** = drop-in Maestro over serial; concurrent tracks, looping, background-resume, oscillator/wander generators, release-when-settled, easing, link watchdog. PCA9685 **proven on the bench 2026-08-09** |
| ESP32 route | v2 (v1.68.0) | `MpcaLedcOutput` (`src/MpcaEsp32.h`) drives servos straight off ESP32 pins — 16 LEDC channels, 16-bit at 50 Hz, **0.305 µs a step** against a PCA9685's 4.88, so no expander, no I2C and no address jumpers below 17 channels. Measurably smoother, but **only on slow moves** (`test/ripple_test.cpp`): a 10 s throw freezes 289 of 490 servo frames on a PCA9685 and none on LEDC; a 1 s throw is indistinguishable. The kinematics is the shared engine, so all of v1.66.0 applies unchanged. `Esp32Droid` is a downloadable pack with its own `Config.h`; `Esp32Slave` is the far end of a UART split; the bench console's `BT_LEDC` is the same silicon from the other door. Compiled on **both** arduino-esp32 cores — they address LEDC completely differently and v1.67.1's 2.x branch would have moved nothing. **The radio is `ESP_WIFI 0`**: `handleClient()` blocks the motion loop for up to 5 s. **NONE OF IT HAS RUN ON SILICON** |
| Live drive | v1 | The sequencer (and any cue or music track) can drive the **real** servos: `maestro/live-drive.js` arms the `playback.js` seam, positions go through the bench engine so speed, acceleration and this droid's end stops apply. Three honest states, never live in kiosk, disarms when the board goes away |
| Sequencer motion / explode / multi-select | v1.40.0 | Per-brick **MOTION** mode (Opens-then-closes default, Opens, Closes, Closes-then-opens) with irrelevant ramp sliders hidden; dropping a library sequence onto the timeline **explodes** it into per-part act bricks (channels with no part assigned are toasted, not silently dropped); Shift/Ctrl-click **multi-select** with group Duplicate/Remove, Delete/Backspace, Escape to collapse |
| Other 1-10 channels | v1.40.0 | Ten model-independent placeholder actuators (`oth1`..`oth10`, `core/actuators.js`) for a servo that drives something off the CAD model; grouped under "Not on the model" in every channel picker, a dedicated OTHER section on the Panels step, and sequenceable like any other channel |
| Track Builder | v2 (v1.45.0) | Top-down 2D circuit editor (`app/track-edit.js`), opened from the stage's ✎ EDIT button: drag/add/remove control points, Gates and Cones modes, the same Catmull-Rom sampler and 2.4 m spacing check the stage itself drives so the preview cannot lie, warn-but-allow on overlap, RESET TO DEFAULT. v1.45.0: **named layouts** (`PREFS.tracks`, save-as / load / rename / delete, the stock lap never overwritable, a v1.44.1 `PREFS.track` upgraded into the library on first read), gates sorted into track order on save, and the painted start line, the grid and the timing line all sit on gate 0. Still not built: a share string |
| Model Builder | v2 (v1.45.0) | The fourth stage model — a base plate plus five primitives (beam, plate, disc, hinge, ball joint) snapped together on a 50 mm grid, soft-capped at 8 parts / hard-capped at 12; `ATTACH TO` gives forward kinematics through the THREE scene graph; joints register `bldJ<n>`/`bldJ<n>t` acts only while it is the model on stage, so the sequencer, live drive and the wiring sheet pick them up unchanged (`scene/builder.js`). v1.45.0: nine defects repaired (the worst crashed `updateOutputs()` every frame after a joint was deleted), plus drag-and-drop with auto-connection to the nearest socket, driven centre-pivot plates, per-joint preview sliders, collapsible usage instructions, a schema version on `PREFS.builder` and a standalone model `.json` to export and import. Still not built: phase 2's face parts (eyes + brows + mouth) |
| Servo gauges | v3 (v1.60.0) | The **fifth stage model** (`app/servos.js`), and the only one that is not 3D: `#svScreen` covers `#stage` while `body.model-servos` is on, the canvas and every stage button except the model chip go with it, and `main.js` skips the render. One tile per channel, 6 to 128, each a **180° gauge or a 360° dial chosen per servo** (`SV.per` over `PREFS.svShape`) into a shared 88 × 78 box so a mixed grid stays square. Clicking one opens `buildSelCard()`'s own corner of the stage — Face · Drives · Name · Test — writing through `HW.setPart()`. Needles from `chanPosNorm()`; `CHPOS` (maestro/playback.js) is what gives a channel wired to nothing a position at all. Appears in the sequencer's narrow stage for free |
| Dome lighting | v1 (v1.74.0) | **AstroPixels, simulated at the pixel** (`src/js/lights/`). Four displays on their real grids — FLD 9×10 (two 9×5 boards, serpentine restarting at row 5), RLD 27×4, PSIs 5×5 with four cut corners — plus three seven-pixel holoprojectors. Six palettes, the 46-entry ramp, the 90-state walk, all 25 effects, 7 HP sequences and the twitch timer, driven by `LE`/`HP` commands or Jawalite from a Marcduino. **The transport is modelled**: `imperial` and `r2kt` have no serial command port, `standard-md` wants `*RT`/`@AP` in front of a native command, and `apxSend()` refuses what the flashed sketch could not have heard. Panels are placed and sized from the MK4’s **own part bounding boxes**; the stand-in gets spherical placement and keeps its sine-wave lights whenever the build’s answer is not AstroPixels. Which sketch and which door live on the **Model pane**, not in the build questions — they are facts about the code, not the hardware. **Nothing is ported**: LGPL-2.1 library, MIT project, re-implemented from a written spec |

---

## 6. Outstanding work

### Asked for, not yet built (2026-08-22, Mike's calls on the UX review)

- **Simulate the dome lighting** — DONE in v1.74.0, and left here because the
  ask is the record. Question 6 asked what lights the dome and all three
  answers were badged NOT SIMULATED, so a walkthrough spent attention on a
  question that could not change anything. Mike: *"keep as is but add a todo
  to simulate"*, and then, with the repository open, *"this is the astropixels
  code can we use it to build the lighting systems?"* **AstroPixels is now
  `sim:'full'`** and the dome lights at the pixel (`src/js/lights/`). Teeces
  is still parked: it is a MAX7219 chain, a completely different animation
  model, and nothing here transfers to it.
- **A sound lane and dome rotation in the sequencer.** *"Panels open AND he
  beeps"* is the show, and neither is reachable from the timeline: the parts
  list is mechanical parts only, `LOAD MUSIC` is a backing track to snap frames
  to rather than a cue you can place, and there is no dome-rotation channel.
  The Drive view has a whole sound bank and the pad fires it. Mike: *"not yet
  add to todo"*. Shape when it comes: a bank/track number dropped on the
  timeline as a zero-length cue, firing in the sim and emitting a `playSound(n)`
  on export. Until then the sequencer should say where dome rotation actually
  lives rather than leaving people hunting — v1.71.0 did not do that either.
- **Promote three of the nine export buttons** — done in v1.71.0. Left here as
  the note that the *choice* was Mike's and the rest of the row stays reachable
  behind Advanced, so a future tidy does not quietly delete one.


### Three follow-ups the travel rule exposed (v1.46.0)

None of these is new breakage; the settled rule just made them legible.

- **`blockOpen()` can still mean SHUT.** It answers the µs-authoring question
  ("closed is home, open is whichever endpoint is furthest from it"), so on a
  channel whose `home` sits at or near its **max** end it picks `min` as "open"
  — a brick that says *open* drives the model shut. True before v1.46.0 as well.
  Under the settled rule the fix is `blockOpen(c) = c.max`, but that collides
  with `import.js`'s adopt maths (`blockOpen(src) - blockClosed(src)`, which
  `mstr-share.test.js` deliberately feeds a home-at-max file), so it wants a
  release of its own rather than a surgical patch.
- **`blockMinTravelMs()` measures the throw as home→endpoint**, not `max - min`,
  so on a channel whose home is mid-travel the ramp floor is computed against a
  shorter throw than the model animates. `travel.js` itself needs nothing — it
  reads only speed, acceleration and an already-absolute distance, and the
  model's visible rate is now measured against each channel's own span, so a
  200 µs channel sweeps at the same speed on screen as a 1000 µs one.
- **`invert` is still a field on a channel object.** `starters.js`, `hw-host.js`
  and `import.js` write `invert:false` and `app/wiring.js` prints it, so
  removing it would put "undefined" on the wiring sheet. It is annotated as
  retired and read only for adoption; deleting it is a tidy-up for a quiet day.

### What v1.45.0 deliberately left (2026-08-17)

Each of these was a decision, not an oversight, and each is one edit if Mike
disagrees:

- **`buildDefault()` still ships `servoTopo:'p0'`** (straight off the droid's
  board). The *question's* default is now one controller and two expanders
  (`p1x2`), which is what he asked for; changing the shipped build as well
  forces `domeServo:'mpca32'`, which hard-blocks the mod2026 sketch and would
  silently change the default firmware for every new user. One word in
  `SERVO_DEFAULT_TOPO` if he wants it.
- **A PCA9685 configuration means OUR `servos.h` / `sequences.h`.** No other
  project's PCA sketch is parsed, and an unrecognised `.h` is refused with the
  reason. `SERVO_HZ`, `OSC_HZ`, generator sequences and the Maestro serial block
  are read and then reported as dropped, because inventing a field nothing reads
  is worse than saying so.
- **`BOARD_PINMAP` in `app/board-img.js` is now dead data** — its only consumer
  was the Boards section. `BOARD_IMG` is still live (the Maestro card photos).
  Delete it, or keep it for a future pin view.
- **`hw-table.js` is dead in the sim** except `hwTableSync()`, and kept only
  because PCA Studio loads it. Studio is the reason several files in
  `maestro/` cannot simply be tidied — check `pca-studio/manifest.json` first,
  every time.
- **`setupStickyFit()` does not re-run on a window resize**, only on render, so
  a mid-session resize can leave the pinned columns a few pixels stale until the
  next redraw.
- **No track share string** (phase 2's other half), and cones are neither
  squeezed nor trimmed — they are decorative and collision-free.
- **Phase 2's face parts are not built** in the Model Builder, but a stand-in
  type in the suite proves one `MB_PRIM` plus one `MB_BUILDERS` entry is now all
  it takes: the four hardcoded joint tests are gone.
- **`xbox360.jpg` has a dark background baked in**, so the enlarged controller
  card shows a bigger black band. A white-background shot would look better.
- **`due.jpg` and `mp3trigger.jpg`** are still the only two missing board
  photos (both parked options).

### Two board photos still missing (v1.44.0)

Mike supplied twenty-one. Two cards still draw the SVG stand-in, and both are
parked options nobody is choosing:

| File to drop | Card |
|---|---|
| `due.jpg` | Controller board → Due (parked) |
| `mp3trigger.jpg` | Sound → MP3Trigger (parked) |

**The file name is the option id, lower-case.** `MD-YX5300.jpeg` was dropped in
and did nothing: the build inlined it under the key `MD-YX5300`, which matches
no answer. It is `mdyx5300.jpg` and the card has its photo now. If a dropped
photo does not appear, that is the reason — check `BUILD_OPTIONS` in
`src/js/config/hardware.js` for the id.

Drop them in `src/art/boards/` named after the option id and run `./build.sh` —
nothing else to edit. Keep them near 600 × 450 and under 80 KB; they are
base64'd into the dist, and the twenty already there cost it 0.95 MB.
`src/art/boards/_originals/` holds Mike's untouched uploads (the build ignores
subfolders); the files beside them are the same photos trimmed of their white
border and padded to a common 720 × 480 on white, so twenty cards of different
crops line up as one row.

**Tidy the repo root before this is published.** Mike, 2026-08-12: *"add it to
git for now — we'll do a clean up before we publish."* The root has collected
working files that are useful now and would be clutter to a stranger:

- `maestro-not-responding-summary.md` — now a SOLVED writeup (the board's TTL
  RX input was dead; proved with a USB Dual Port loopback on the board itself,
  no Arduino involved). Worth keeping, probably as `docs/`.
- **Done at the public split (2026-08-17):** the loose `.mstr`/`.h`/`.html`
  bench artefacts moved to `examples/`, the four one-off `.ino` sketches to
  `arduino/bench-sketches/`, the not-responding writeup to `docs/`, and
  Pololu's `manual_english.pdf` was dropped rather than republished — it is
  their document and it is one click away at pololu.com/docs/0J40.
- `_to_delete/` — the workaround for `device_bash` being unable to delete
  (§7). Empty it by hand when convenient.

Decide per file: keep in `docs/`, keep untracked, or delete. Not urgent, but do
it before anyone else clones this.


In the order Mike asked for it.

**1. ~~Timed practice track.~~ DONE 2026-07-26** — five gates round an oval,
apex cones (+2 s, they tip over), lap/last/best HUD, best lap persisted.
Stage **Track** button and the startup toggle both work. Not built: track
editor / alternative layouts.

**2. ~~Setup export/import.~~ DONE 2026-07-26** — `app/setup-io.js`, buttons in
Config and the startup screen, drop a `.json` anywhere to load. Music routines
travel inside `maestro.sequences` like any sequence. Version-gated
(`r2sim-setup` v1); unknown files are refused with a reason.

**3. ~~Music sequencer.~~ DONE 2026-07-26** — see the change log. Not built:
click-to-seek on the waveform, and per-onset (rather than grid) snapping for
rubato material; the BPM box override is the escape hatch.

**4. ~~Click a part → name it → animate it.~~ DONE 2026-07-26** — the
faceIndex→part lookup went in (`userData.ranges` + binary search), plus the
part registry, groups, and the selection card. **Hinge adjustment from the UI
landed in v1.6.0** — the Advanced section of a part's popup sets the motion,
the pivot and the travel. What is still NOT built: promoting an *unrigged
static* to a moving part. A static can be named, coloured and grouped, but
giving it motion still means editing `cad/rig.py` and regenerating the `.r2m`
— the editor only re-rigs parts the CAD already rigged.

**5. ~~Start a new model: guide the builder through their configuration.~~
DONE 2026-07-27** — see the v1.3.0 change-log entry. What was NOT built:
the RC controller input layer (the question is asked, the code does not
exist), any dome-lighting firmware, and a per-build `.ino` generator — the
export still emits constants for the active profile rather than a whole
sketch tailored to the answers.

**6. ~~Model something like this photo.~~ DONE 2026-07-29** — the Anzellan
head, see the v1.7.0 change-log entry. What was NOT built: a lip-sync driver
that reads the actual audio (the jaw chatters off `SND.at`, it does not
follow the waveform); a **head** board in the setup's Wiring step, so the
face channels do not yet appear on the printable wiring sheet — generate the
`anzellan` starter from the Maestro pane instead; and no physical build notes
(servo sizes, linkage geometry, skin material).

**7. ~~Add the Polar Mouse as a drivable vehicle.~~ DONE 2026-07-29** — see
the v1.8.0 change-log entry. What was NOT built: the practice circuit is still
the DROID's — `trackTick()` reads and writes `R2.pos` directly, so the mouse
can be driven anywhere on the stage but does not trigger the gates or get a
lap time; no barrier collision for it either. No firmware layer — it is driven
straight from the sticks rather than through a ported sketch, because there
isn't one for it. And the `.mtl` the OBJ names is missing from the folder, so
its colours are inferred from the material names (see below).

**8. ~~One model displayed at a time, selected from the Model tab.~~ DONE
2026-07-29** — see the v1.9.0 change-log entry. What was NOT built: no way to
show two at once on purpose (there was one, and it was the problem), and the
practice circuit and the lessons are still droid-only whichever model is
selected.

**9. ~~Use the controller as a sequence recorder.~~ DONE 2026-08-07** — see
the v1.19.0 change-log entry. What was NOT built: no quantise/snap of a
recorded brick to the beat grid (Mike chose raw timing — the sequencer's own
Snap-to-beats can be run on the take afterwards); no way to record ON TOP of
an existing routine (every take is a new one); a routine cue cannot be
stopped by releasing the button, by design, so there is no panic-stop for a
long one beyond switching puppet off; and cue mappings do not travel in the
setup `.json` yet — they live in `PREFS.puppetCues` on the machine.

**10. Puppetry-engine headroom — PROPOSED 2026-08-12, not started.** Recorded
from the *"by replicating the Maestro have we missed an opportunity?"*
discussion. Conclusion first: no — the replication is confined to the
INTERFACES (MaestroLink's wire protocol, `restartScript(n)` slots, quarter-µs
units, `.mstr`), and the engine already exceeds a real Maestro (v1.24.0
concurrent tracks + looping; v1.25.0 background-resume, oscillator/wander
generators, per-channel easing, release-when-settled). What still constrains
puppetry is the Maestro's *model*, in exactly three places, detailed below.
All three go in the way v1.24/v1.25 went in: **append-only** fields on
`MpcaChannelDef`/`MpcaSeqDef` so every existing `sequences.h` compiles and
behaves unchanged; engine changes mirrored integer-for-integer in
`src/js/maestro/pcaseq.js` (change one, change the other); the host sketch and
the wire protocol untouched. Compatibility stays the escape hatch and the test
oracle — dropping it would buy none of this.

**Prerequisite before ANY of it: bench-prove v1.24/v1.25 on a physical
servo.** Nothing since the v1.23.0 SelfTest plan has moved real hardware
(§ change log, v1.25.0 "Not done"); stacking more behaviour on an unproven
engine doubles the debugging surface for no gain.

**(a) Layered blending — displace → blend. The pick: biggest expressive
jump.** Today a sequence claiming a busy channel DISPLACES the incumbent
(v1.24.0 rule) — right for panels, wrong for puppetry, where the classic move
is a breathing base with a gesture layered on top of the same channels.
- New flag `MPCA_SEQ_LAYER`. A layer track never owns channels for the
  displacement rule and is never displaced. Instead of absolute targets it
  contributes a signed quarter-µs OFFSET added to whatever the base commands
  (frames, generator, or the held/eased position) — applied after easing,
  before the endpoint clamp, so a layer can never push a servo past its
  calibrated min/max.
- Minimal version is ONE layer per channel plus the base, not N layers — AVR
  RAM is the ceiling and the puppetry win does not need a stack.
- Rules to pin in tests before trusting it: `stopScript()` clears layers too
  (an explicit stop must mean stop — same law as `_bgWait`); a layer over a
  RELEASED channel (`releaseMs`, v1.25.0) SUSPENDS rather than re-driving it,
  or release-when-settled stops meaning anything; offset maths stays inside
  32 bits on the AVR.
- Optional second half, shippable separately: per-track weight with
  fade-in/out ms, so displacement becomes a crossfade instead of a snap.
- UI: a "Layer" checkbox per sequence beside Background/Loop in Build your
  Maestro and PCA Studio. **Breathe is the demo case** — as a layer (amp 0.22)
  it runs under everything instead of dying at the first button press.

**(b) Per-keyframe speed/accel first, curves second.** Frames are absolute
poses and motion between them is the channel's ONE trapezoid, so motion cannot
pass *through* a pose without arriving (velocity 0) — a wave has a stutter in
it at every keyframe.
- The first half is compatibility-COMPLETING, not an extension: the `.mstr`
  frame body already carries the `s`/`a` sections (all zero while
  `useSpeedAndAcceleration="false"` — §maestro format notes). Honour
  `useSpeedAndAcceleration="true"` in the engine, the generator and the brick
  compiler and per-move ramps exist with NO new format. A real Maestro does
  this; MaestroPCA currently does not.
- The second half, only if wanted after (a): a per-frame `through` flag —
  consecutive through-keyframes sampled as a Catmull-Rom position spline at
  the 10 ms tick, non-zero velocity through the pose. Integer-only maths to be
  proven on the AVR before committing; if it will not fit, the first half
  already covers most of the musical cases.
- Sim side: brick `rise`/`fall` could compile to per-frame speeds instead of
  only flooring at the channel speed. The imported-config floors STILL apply —
  the authoritative-import doctrine (v1.12.0) does not bend for this.

**(c) Parameterised triggers — last, smallest payoff.** `restartScript(n)`
cannot say "pie 3, 40%, over 2 s"; the sim's bricks know amp and duration but
the wire only fires a numbered slot, so variants multiply.
- Direct-API first: `startSequence(n, amp8, rate8)` for sketches linking
  MaestroPCA directly — no wire change at all.
- Wire second, only if a real need appears: an addressed Pololu-protocol
  EXTENSION subcommand under our own device number (a real Maestro at a
  different device number ignores addressed packets it is not for) — never
  reuse a real opcode, and the 7-bit resync rule (v1.24.0) applies.
- Payoff: one "open pie" sequence replaces N amp-variants, and an analog cue
  could stream amp live. Deliberately last because the sim/cue layer already
  fakes the effect by generating variants — this is wire expressiveness, not
  new behaviour.

Order: bench proof → (a) → (b) first half → reassess before (b) second half
or (c). Deliberately NOT proposed: N-deep layer stacks, floating-point
blending on the AVR, or any break in the Maestro-protocol surface.

**11. Buildable model + Track Builder — PHASE 1 OF BOTH SHIPPED in v1.41.0
(2026-08-15).** Decisions and status in `docs/DESIGN-builder-and-track.md`.
Remaining: Builder phase 2 (the full basic face — eyes, brows, mouth — as
rigged parts-bin sub-assemblies), Track Builder phase 2 (named layouts +
share string).

**Next, if Mike wants it:** the RC code, so the parked answer stops being
parked; more dome-lighting systems beyond AstroPixels and Teeces; and a
"generate my sketch" export that writes the whole `.ino` from the build
rather than just its constants.

---

## 7. Traps

- **A wire protocol with no version field will happily lie to you.** The
  live-drive frame carries no handshake, no length and no version — so a
  6-bit decoder and a 7-bit decoder are indistinguishable from the sending
  end. Channel 70 sent to the old one is not rejected, it is *folded*
  (`70 & 0x3F` = 6) and a servo the user never touched moves. The only
  evidence available is the boot banner, which is why `PCA-BRIDGE`/
  `MAESTRO-PCA` carry a number and why widening a field means bumping it.
  Two rules fall out: **assume the OLD protocol** when there is no evidence
  (a board that will not identify itself is narrow, never wide), and **drop
  what the far end cannot decode** rather than masking it into range —
  masking is what turns "this channel does nothing" into "the wrong panel
  opens", and the second is far harder to diagnose from inside a dome.
- **Two agents in one release can invent the same function twice.** v1.46.0's
  `chanAdoptInvert()` was written with its guard at the call site by one and
  called unconditionally by the other, so every channel in an imported file had
  its two ends swapped. Both halves were individually green and fully tested.
  Two lessons: a function whose name is a *conditional action* ("adopt the flag
  IF there is one") must carry the condition itself, and the merge is not done
  when the suites pass — run the suites that cross the seam (here: a round-trip
  import) and read what they actually assert.
- **Fix the number the user is actually looking at.** Three releases went
  into reconciling the serial banner with the build — both real bugs — while
  the `of 24` in Mike's screenshot came from neither: it was the channel
  table's length, printed by a third file that had never heard of either
  check. When somebody sends a screenshot, find the line that renders that
  exact string and work outwards from it. A fix one layer away from the
  symptom is a fix for a different bug.
- **When you add a consistency check, write down which direction you
  checked.** v1.63.0 compared firmware-against-build and shipped feeling
  complete; the report that prompted it was the OTHER direction, and the check
  stayed silent on the very case it was written for. Two things drift apart in
  two ways, and the one you did not implement is invisible in a green suite.
  Ask, out loud, "and what if the other one is bigger?"
- **A board that reports itself is only useful if something reads the
  report.** Three PCA9685s on the bus, two driven, and the firmware printed
  the difference on the line that mattered — in a thirty-line boot banner,
  using the name of a `#define`. The app had the whole banner in memory and
  was reading one regexp out of it. If a device tells you what it is doing,
  parse it and say it where the user is standing; scrollback is not a UI.
- **A comment that says "the board rounds the corners anyway" is a
  DEPENDENCY, not an aside.** `blocks.js` compiles every ramp as a staircase
  ~120 ms apart and says so out loud; `starters.js` generated every channel
  with `speed:0, acceleration:0`, which means unlimited. Two files, both
  correct on their own, and between them a real servo banging eight times a
  second for four months. When a comment names something ELSE as the reason a
  choice is safe, that thing is a contract — go and check it holds, and if it
  is a default somewhere, make the default say why.
- **Measure before you believe the newest change did it.** The report landed
  one day after a release that touched exactly this path, and the release was
  innocent: a frame cost 0.02–0.23 ms across three versions, the trajectories
  were clean ramps, and the wire already de-duplicated. Three cheap
  measurements ruled out CPU, easing and serial in about ten minutes and left
  one candidate standing. Guessing would have "fixed" the wrong file.
- **Opening a door is two jobs, and fixing one of them looks like fixing
  both.** v1.39.3 unshut the sequence clock for PCA9685 builds and stopped
  there; the actuator path stayed shut for eighteen versions, and the symptom
  the whole time was identical to the one that had just been fixed — press
  play, nothing moves. When a feature is gated in more than one place, the
  first gate you open is the one that hides the rest. Trace a value all the way
  to the pixel before calling it fixed, and write down what OWNS it: on a
  `hasServos` profile the PCA9685 layer owns `ACT`, and any writer that does
  not know that is writing to a variable that is overwritten before anyone
  reads it.
- **A sorted pair silently discards a direction.** `Math.min/Math.max` on a
  channel's endpoints looks defensive and is how a reversed linkage came to read
  backwards on the model for months: the bench records a reversal *as* the pair's
  order, and sorting it threw that away. If a pair's order carries meaning, say
  so in the function that reads it (`chanEnds()`), and give the codebase exactly
  one of them.
- **Changing a default breaks fixtures that never named what they relied on.**
  Making the two-expander arrangement the shipped answer turned three `track-ui`
  assertions and one in `sketch` red — none of them about the new default, all of
  them asserting mod2026's fixed pin map or a PCA sketch's suitability against
  *whatever the default happened to be*. A fixture that depends on a build should
  ask for that build out loud.
- **An agent that rewrites a whole file can silently convert its line
  endings.** This repo is `* text=auto` — LF in the object store, CRLF in a
  Windows working tree — and five of the files that came back from parallel
  work in v1.45.0 had been rewritten as LF. Nothing breaks at runtime, which is
  exactly why it is worth checking: the diff you hand over is otherwise every
  line of the file. Compare against the pristine copy and convert back before
  shipping (`file src/js/**/*.js | grep -c CRLF` is enough to spot it), and
  never let a build output be converted — `pca-studio/PCA-Studio.html` is
  `-text` in `.gitattributes` for that reason.
- **A store that flushes on `pagehide` will undo a clear-then-reload.** The
  setup Reset deleted both keys and called `location.reload()`; `pagehide` fired
  on the way out and `servo-store.js` wrote the still-populated in-memory
  `MSTR` straight back over the hole. Blank the memory first, then clear the
  store, then reload. Generalise: when a wipe does not stick, look for a writer
  on the *exit* path, not only on the edit path.
- **Two hand-kept lists paired only by position are one list waiting to
  desynchronise.** The channel table emitted sixteen headers in one function and
  sixteen cells in another; reorder one and every column is mislabelled with no
  error anywhere. It is `setupChCols()` now — one entry per column, header and
  cell together, with a `when` gate that removes both.
- **A warning whose threshold cannot be exceeded is a warning that never
  fires.** `trackSpacingViolations()` skipped any pair closer than
  `max(3.6, total*0.05)` of arc, and arc between two samples on a closed loop
  can never exceed `total/2` — so every pair on a lap under 7.2 m was skipped as
  "the same stretch" and the canvas looked clean on exactly the layouts that
  were broken. When you write a guard, ask what its own arithmetic makes
  impossible.
- **Mid-travel is a safe default for a gimbal and a wrong one for a door.** A
  channel with nothing measured into it used to rest at `DEFAULT_NEUTRAL`, and
  five places seeded the pose that way, which is why the dome's pie panels sat
  half open before anybody touched anything. Ask the *actuator* where it rests
  (`chanRest()`), not the number.
- **A feature that unregisters an `ACT` key must rebuild the Outputs table.**
  `OUTROWS.act` is built from `Object.keys(ACT)` and `updateOutputs()` reads
  `ACT[r.key].toFixed(2)` sixteen times a second, so a deleted key throws every
  frame until reload. `mbSetShown()` remembered to call `buildOutputs()`; the
  three mutators beside it did not.
- **"Validate the shape" is not "validate the contents".** The Model Builder
  checked that a saved part's `channels` was an *array* and then registered
  whatever was in it — so a foreign setup file claiming `['doorL','pie0']` could
  delete the droid's own actuators on the next model switch. If a restore path
  is documented as surviving hand-edited input, that includes the values.
- **State the app never SAVED reads exactly like state something
  overwrote.** `HW.save()` wrote PREFS, PREFS never held `MSTR`, and so the
  servo channel table — names, calibrated endpoints, part mapping, the
  sequence library — was session state from the day the bench was written.
  What made it look like a bug rather than a gap is that something else
  refilled the hole: `buildEnsureMaestro()` generates a starter whenever
  `MSTR.loaded` is false, so a reload came back to a *plausible* table with
  every channel named and every endpoint factory-fresh. Two lessons. When a
  user says "X overwrote my settings", check whether the settings were ever
  written down before hunting for the writer. And any "generate a default if
  there is nothing" path must ask whether there is really nothing — see
  `servoStoreWorth()`, and v1.43.0.
- **A helper a SHARED module depends on has to be as shared as the module
  is.** v1.42.0 lifted six Escape handlers into `escGuard()` and filed it in
  `core/dialog.js` beside `appConfirm`, where it was written. PCA Studio
  loads the shared `maestro/setup-hw.js` and does NOT load `core/dialog.js`,
  so Studio's hardware wizard threw `ReferenceError` on its first line for
  four versions. The manifest check that release added catches a shared
  module missing from a manifest; it cannot catch a shared module's
  *dependency* missing from one. When you extract a helper out of a module,
  grep every manifest for every file that calls it — and if it is generic
  (this one is four lines of keyboard containment), give it its own file so
  both manifests can name it: `core/esc-guard.js`.
- **A suite that is not in `./test.sh` is not a suite.** Studio's smoke test
  had been red at the same line for four versions. It is in the script now,
  last, with no `R2_TARGET` — same reasoning as the orphan-module check that
  was a warning nobody read until it became a build failure.

- **A slow test suite is usually the RENDERER, not the tests.** Every
  `page.evaluate()` queues behind a frame, and with no GPU three.js falls back
  to a software rasteriser at ~740 ms a frame — so each assertion pays for a
  picture nothing reads. The suites load with `?norender` (`SIM.draw = false`,
  guarded in `app/main.js`) for exactly this reason; `R2_DRAW=1` puts it back.
  If you add a suite, copy the `R2_Q` line, or it will run twenty times slower
  than its neighbours and you will blame the assertions.
- **`arr[i] = x` past the end of an array leaves HOLES, and a hole is
  invisible.** `JSON.stringify` writes `null`, `forEach`/`filter`/`map` skip
  it, and `pcaCreate` over a sparse channel list produces an engine whose
  `st[]` has gaps — which is a crash, one rebuild later, in a place unrelated
  to the write. It has now cost two sessions: Studio 0.7.1 ("worked the first
  time and not the second") and `HW.ensure()` in v1.29.0. Any `ensure`-shaped
  function fills 0..i, never just i.
- **A frame commands its targets and THEN waits.** So the pose a frame carries
  is where the droid should be when that frame *ends*, not where it starts, and
  two keyframes do not make a ramp — between them the servo travels at whatever
  its own speed setting allows, which on a channel with no speed set is
  instantly. Both mistakes were live in `blockCompile` until v1.28.1 and
  together they turned "opens in 3 s" into "opens *after* 3 s". Ramps are drawn
  as a run of steps now (`blockRampSteps`); anything else that compiles motion
  into frames has to do the same, or it is writing delays and calling them
  speeds.
- **A nested `seq` brick is sampled at ARBITRARY times, not frame by frame.**
  `blockCompile` walks the routine's boundaries and only overlays the
  channels a frame actually names, so a change-only frame list — which is
  what the puppet recorder produces — loses every channel it left as a hole
  and the compiler sends that servo home mid-move. Anything destined to be
  dropped into a routine as a brick must carry a FULL pose in every frame
  (`cueDensify` in `input/cues.js`). Imported Pololu sequences are safe
  because Pololu writes full rows.
- **Hiding a grid child with `display:none` re-runs auto-placement.**
  `#left`, `#main` and `#padwrap` all place at least one child implicitly, so
  removing an element from the grid shifts everything after it up a track.
  Sim only hid `#splitH` and the whole controller strip collapsed to 1px
  while the row it should have been in sat empty (v1.28.0). Use
  `visibility:hidden` for a middle child, or check the element is either last
  in its container or explicitly placed before reaching for `display:none`.
- **The manifest is the only thing that loads a module.** A file can sit in
  `src/js/` looking perfectly healthy and never run. `tools/build.js` prints
  `WARNING: not in the manifest, so not loaded:` — that warning is not
  cosmetic, and it is how the v1.19.0 repair was found. Read the build
  output, especially after restoring files from a checkpoint or another
  session's write-back.
- **Re-stage a file before editing it if another agent may have touched it
  since you last read it.** The v1.20.0 HANDOVER write-back was edited from
  a copy staged BEFORE Codex's doc commit landed, and silently reverted §9.
  Git caught it; nothing else would have. A stale in-memory copy of a file
  is the same hazard as the August revert, just faster.
- **`bindCamera()` calls `stage.setPointerCapture()`**, which retargets
  `pointerup` to the STAGE div — a listener on the canvas never hears it. The
  selection bindings live on the stage for exactly this reason. Cost a
  debugging cycle.
- **`Object3D.lookAt()` aims +Z** for non-cameras (cameras aim −Z). `faceOut()`
  in `scene/droid-proc.js` compensates with `rotateY(Math.PI)`. Cost a debugging
  cycle when every dome fitting faced inward.
- **Maestro targets are quarter-microseconds.** 6000 = 1500 µs = neutral.
- **Clamping the target is not clamping the position.** The MaestroPCA
  integrator can carry a channel past `min`/`max` on a direction reversal with
  residual velocity, or when `MPCA_EASE_OVERSHOOT` aims beyond its target. Both
  the target AND `pos256` are clamped, in both engine copies. Endpoints are
  the only thing stopping a panel binding against the shell, so "13 counts over"
  is not a rounding detail. Fixed and regression-tested in v1.25.1.
- **An ease-compare test that targets `max` proves nothing.** Overshoot is
  clamped at the endpoint, so aiming AT the endpoint makes it byte-identical to
  `MPCA_EASE_NONE`. Any test of overshoot must leave headroom inside the range.
- **A "close" sequence is not the open steps reversed step by step.** Frames are
  absolute, so that delta-encodes into bare `delay`s and the panel slams shut in
  one frame. Reverse the *frame list* and append the closed pose — `reverseOf()`
  in `maestro/starters.js`.
- **The Micro Maestro is a different chip.** It writes
  `ServosAvailable`/`ServoPeriod` and has no pull-ups; the Minis write
  `MiniMaestroServoPeriod`/`ServoMultiplier`. Exports must follow the board.
- **`.r2m` header JSON is space-padded to a 4-byte boundary.** The typed-array
  views in `cad/decode.js` need the alignment; a header that grew by one
  character broke it once. The decoder also falls back to a copy when misaligned.
- **Regenerating the `.r2m` means regenerating `src/js/cad/payload.js`**, or the
  bundled model goes stale against the actuator mapping.
- **A sequence with nothing mapped must still emit one frame**, or subroutine
  numbers stop lining up with the sketch on small boards.
- **Never hard-code a viewport pixel in a picking test.** `select.test.js`
  clicked (660, 364) and broke the day the layout gained a 5px splitter
  track. It now measures `#stage` and clicks a fraction of it.
- **A `<select>` contributes its LONGEST OPTION to a table cell's min-content
  width**, which stretched the Outputs table past the sidebar. The drawer's
  controls live in a `width:0; min-width:100%` block so that contribution is
  zero — `.detwrap` in 07-startup.css.
- **The canvas only resizes on a window event.** Any layout change of ours —
  `wizSplit()`, a splitter drag — has to call `onResize()` itself.
- **Uncovering the stage is not enough to show the droid.** `body.wizsplit`
  also gives `#main` a left margin; without it the droid stays centred in a
  full-width stage, i.e. behind the overlay. Cost a debugging cycle.
- **A `<select>`'s longest option sets its cell's min-content width** — see
  v1.3.1. The same trap bit the brick inspector's channel picker.
- **HTML5 drag-and-drop is not usable here**: it cannot follow the pointer
  smoothly, does not work on touch, and cannot resize. The brick sequencer
  uses pointer events with its own ghost.
- **The Boards cards have moved twice**: Model tab → Config tab (v1.3.0) →
  the setup's **Wiring step** (v1.4.0). `boardVizSync()` asks where they
  actually are rather than assuming; a test that hunts for `.boardcard` in a
  fixed host will find nothing.
- **A closed box is opaque from every angle** — `THREE.BackSide` shows its
  inner face, it does not make it see-through. Room shells are culled by
  camera position instead (`envCull`).
- **A `<canvas>` texture needs `encoding = sRGBEncoding`** or it renders
  washed out.
- **The boot sound plays on connect**, so any "has a sound played" check ticks
  immediately. Lessons compare `SND.at` against `TUTOR.t0`.
- **A barrier must not stand in the neighbouring lane.** No two non-adjacent
  parts of `TRACK_SHAPE` may come within 2 × (TRACK_HALF + 0.26). The first
  draft pinched to 1.1 m and put a barrier row across a straight.
- **The old Boards note (v1.3.0)**:
  `boardVizSync()` rebuilds whichever pane is actually showing them; a test or
  a helper that hunts for `.boardcard` in `#cadHost` will find nothing.
- **`buildStartup()` renders the WIZARD now**, not a paint screen. It lives in
  `config/wizard.js`; the paint sections it used to be became reusable
  builders in `look/startup.js` so the Config tab can show the same markup.
- **The first-run trigger is `buildConfigured()`, not `PREFS.seenStartup`.**
  "Has this droid been set up" is the question, not "has a screen been seen".
- **SVG does not wrap text.** The system diagram clips long peripheral notes
  with `clip()` and puts the full string in a `<title>`; a note added without
  that runs straight out past its box.
- **cdnjs is proxy-blocked** in the build environment. three.js is vendored in
  `src/vendor/`.
- **The Polar Mouse's `.mtl` is NOT in the project folder.** The OBJ names
  `5a14f924-e53a-4bf2-8bef-e48f4bdc07e7.mtl`; the two `.mtl` files that are
  there belong to the MK4. With no `Kd` values every material falls back to the
  same grey and the whole vehicle renders as one lump of putty, so colour comes
  from the material NAME plus the part's role (`MOUSE_MAT_BY_NAME` /
  `MOUSE_ROLE` in `scene/mouse.js`). Drop the real `.mtl` next to the OBJ and
  `cad/mouse.py` picks it up on its own; the role overrides still win, because
  one `Steel_-_Satin_2` covers 92 parts including both the tyres and the rims.
- **`ring` also matches "bea-RING".** Three bearings rode into the mouse
  payload on that substring before the test caught them. Match wheel parts on
  `wheelring`, not `ring`.
- **A test that integrates a model by hand must stop `frame()` first.** The
  render loop steps the vehicle again with a wall-clock dt *and* — through
  `pollInput()` — resets the throttle from the untouched on-screen stick, so
  the same turn settles at a different angle every run. `mouse.test.js` sets
  `frame = function(){}` before it measures anything.
- **A `LatheGeometry`'s winding follows the ORDER of its profile points.**
  List them top-down and every normal points INTO the shape: the near side is
  backface-culled and you see the inside of the far side instead. The
  Anzellan's jowls came out as two enormous ears until the profile was
  reversed to run bottom-up. `anzellan.test.js` measures a real normal against
  the outward radial so it cannot come back.
- **This renderer predates `THREE.ColorManagement`.** `outputEncoding` is
  `sRGBEncoding`, so a hex handed to a material is taken as LINEAR and gets a
  gamma curve on the way out — everything renders lighter and flatter than the
  number says. R2 is white and blue so nobody noticed; the first Anzellan came
  out a pale grey ghost. `anzHue()` converts once, at build time. Same family
  as the canvas-texture note above.
- **`host.innerHTML = ''` does not detach the host.** A self-stopping rAF loop
  that watches `document.contains(hostElement)` never stops if the host is a
  panel the app REBUILDS rather than replaces — `buildStartup()` empties
  `#startupBody` and keeps the node, so the RC panel's bar loop outlived every
  step change and went on writing to detached children. Watch a wrapper YOU
  created inside the host (`.rcpanel`), because that is the node that is
  actually thrown away.
- **A start() that calls its own stop() throws away what was just built.**
  `rcUiStart()` opened with `rcUiStop()` for symmetry, and `rcUiStop()` clears
  the row list — so the loop ran over an empty array and every bar sat at 0.00
  with live values in `RC.norm` an inch away. Cancel the frame; do not reuse
  the teardown.
- **An RC throttle rests at the BOTTOM of its travel, and that is not zero.**
  Calibration correctly reads such a channel as full-span (bottom = −1, top =
  +1) — but wire that to the feet and letting go is full reverse. `rcAutoAssign`
  forces `ctr:'rest'` on anything it points at a stick, and `rcRestWarnings()`
  flags any channel still commanding something with your hands off the set.
  Never auto-assign a channel that did not move during calibration either: a
  dead axis bound to the drive is the same accident from the other end.
- **A module that writes straight into another screen's elements only works
  while that screen exists.** `serialConnect()` set `$('bConnect').textContent`
  and friends, which silently assumed the Bench tab was rendered. Called from
  the setup wizard it threw AFTER `port.open()` succeeded and before
  `serialRead()` — a connected board with nothing listening to it, and no
  error the user could see. Surfaces register with `serialUiRegister()` now
  and `serialUiSync()` repaints whichever of them exist. The same guard is on
  every `mon*` helper.
- **A full-page tool that does not go back where it came from is a tool you
  stop trusting.** The bench is reachable from the Bench tab AND from the
  wizard's Servo setup step; `setupOpen(step, {from:'wizard'})` is how it
  knows, and `setupClose()` reopens the wizard on that step. Two full-page
  overlays at once is the other half of the same rule — always
  `closeStartup()` first.
- **A custom property that ALIASES another is resolved where it is
  DECLARED.** `--tx:var(--txt)` sits in `:root`, so it computes against
  `:root`'s dark `--txt`; the light theme overrides `--txt` on `body`, a
  descendant, and nothing goes back to recompute `--tx`. Four aliases
  (`--tx`, `--faint`, `--bl`, `--am2`) therefore kept dark-theme values in
  light mode — and the bench popout's entire text colour is `--tx`, which is
  why it read as pale grey on a white card. Restate aliases in every theme
  block, or do not alias.
- **A hex in a themed stylesheet is a bug with a delay on it.** The same
  popout carried nine hard-coded darks in CSS and eleven more in the SVG it
  draws. They looked fine for months because nobody opened it in light mode.
  SVG attributes cannot read a class, so the drawing colours are custom
  properties (`--setFace`, `--setNeedle`, …) defined per theme.
- **Under `file://` a LINKED stylesheet's `cssRules` throws SecurityError.**
  A test that reads stylesheet text passes on the inlined dist and silently
  reads nothing on `dev.html`. Assert on `getComputedStyle` instead — and
  note that `getPropertyValue('--x')` hands back the token stream
  (`"var(--y)"`), not the substituted value, so measure a rendered colour.
- **`buildSet(key, id)` returning early on an unchanged value throws away the
  INTENT.** Clicking the firmware card that was already selected is the user
  saying "this one, hold it" — and the `if(b[key] === id) return` guard meant
  that one click did nothing, so the card you deliberately picked was the only
  one that never got pinned. Any flag that records *that you chose*, rather
  than *what you chose*, has to be set before the guard.
- **A derived model needs to run BOTH ways or it eats its callers.**
  `buildNormaliseServos()` turns four small answers (device, shape, two board
  sizes) into the ones the rest of the app reads. Forward-only, the first
  `buildSet('domeServo','mini24')` from a test or a loaded .json was accepted
  and then silently overwritten a line later — an API that takes your value
  and ignores it. The reverse mapping reads a direct board answer back into
  the shape, and `servoDevice:'mixed'` exists for the one case it cannot: a
  different KIND at each end, which the old two-question setup allowed and
  plenty of real droids are.
- **`links` is not `boards`.** How many wires leave the droid and how many
  things have servo headers on them are different numbers — "two Maestros,
  chained" is two boards on one link. Deriving `servoSplit` from the link
  count collapsed it to a single board, which silently took the
  compact-protocol warning with it: the finding that arrangement exists to
  carry.
- **A silent auto-correction is only kind while the thing it corrects is the
  LAST question.** `buildSet()` re-picked the firmware whenever a hardware
  answer invalidated it, which was fine when firmware was question 9 —
  everything above it was settled, so the re-pick was the answer catching up.
  Moving it to question 3 turned the same line into "your deliberate choice
  vanishes six steps later, with no message". `firmwarePinned` is the fix, and
  the general rule is: an auto-correction that runs BEFORE the user has spoken
  is help; the same one after is data loss.
- **A wizard step is not necessarily an ANSWER.** `step.key` was a key of
  `PREFS.build` everywhere — the rail, the review table, the parked-option
  scan, the "every question has options" test — until the merged servo step,
  which owns two. Anything asking "what did the user say to this step" goes
  through `buildStepAnswer()` / `stepAnswerKeys()` now; indexing the build by
  `step.key` silently yields undefined for that one step, which renders as a
  blank chip rather than an error.
- **An option id is not a board id.** `buildMaestroBoard()` returned the
  build ANSWER (`mini24`) and got away with it for six months because the
  Maestro answers were named after the boards they select. The co-processor
  answers are not — `mpca32` selects the `pca32` pseudo-board — so anything
  resolving an answer to a board must go through the option's `hw` field.
  Same for the reverse map: `buildServoFromHw()` now searches the catalogue
  instead of assuming identity.
- **Never hardcode Playwright's browser path.** `chromium.launch()` resolves
  the browser installed by `npx playwright install chromium` and honours
  `PLAYWRIGHT_BROWSERS_PATH` when configured. A path that exists only on the
  machine you are sitting at is not configuration; it is a bug with a delay
  on it.

---

## 8. Coordinate frame — verified, do not re-derive

CAD is **millimetres, Z up, front = −Y, +X = R2's left**. Established from
RadarEye cy=−197.6 and FrontPSI cy=−207.7 against RearPSI cy=+197.0, and
LeftShoulderHub cx=+227 against RightShoulderHub cx=−227.

    sim = ( −x_cad , z_cad , y_cad ) / 1000        # metres, Y up, front = −Z

The dome mounts at body **z = +498 mm**. Ride-height offset 0.30 m puts the dome
top at 1.09 m, matching a real R2.

---

## 9. Version control

The folder went under git on **2026-08-08**, after the August half-revert
made the cost of not having it obvious. There was a `GIT.md` at the root
carrying the long procedure; it did not survive the public split (v1.44.0) and
this section is now the whole of it — if you are looking for that file, it is
not missing, it was folded in here (noted 2026-08-17).

- **Public repository: https://github.com/mikeeddington-lgtm/r2d2-astromech-simulator**
  — public since v1.44.0 (2026-08-17), and renamed from `r2d2-sim` at the same
  time. Branch `main`; initial snapshot `3678f2a`, tagged `v1.19.0`.
- **Two GitHub Actions** run on that remote: every push builds and runs all 29
  suites plus PCA Studio's smoke test, and a `v*` tag builds, tests and attaches
  `R2D2-Simulator.html` to the release — which is where the README's download
  link points. So a release is `git tag v1.45.0 && git push --tags`, not a file
  uploaded by hand. Both workflows are pinned to the node24 action runtime
  (v1.44.1); if the deprecation warnings come back, bump the majors rather than
  silencing them.
- **162 files, 38.46 MiB** — the code and the configs, including
  the rigged `.r2m`, the `.mstr` starters, the sketch folders, `docs/` and
  the `_checkpoints` zips.
- **The ~330 MB of raw geometry and audio is deliberately excluded** — the
  three OBJs, the STEP, the sound pack, the render and the two source
  zips. They are Patreon originals, they never change, and what the sim
  loads is the tracked `.r2m` and `payload.js`. Consequence: **no Git LFS
  and no 100 MB problem.** They are only needed to re-rig from scratch
  (`cad/convert.py`, `cad/mouse.py`) and are NOT reproducible from the
  repo — back them up separately.
- The two generated builds (`dev.html`, `R2D2-Simulator.html`) are also
  excluded. A tracked dist is how the shipped build went four versions
  stale; do not add them back without a reason.
- **Public, with one constraint that travels in the history.** `payload.js`
  and the `.r2m` files *are* MrBaddeley's paid Patreon geometry, published here
  **with his permission** (2026-08-17) — and that permission is for this project
  to publish, not for anyone to redistribute. See §1, `LICENSE` and
  `CREDITS.md`. Practical consequence for git: the geometry is in every commit
  from the initial snapshot onward, so the repository cannot be made
  "public but without the geometry" by deleting files at the tip — and nothing
  new of his goes in without asking him first.
- The cloud session's stranded `.git/index.lock` and `.git/tLmve0c` were
  removed locally before the initial commit. The local `main` branch tracks
  `origin/main`; normal desktop Git and GitHub workflows are now available.
- **Git cannot be driven over the cloud session's FILE MOUNT** (it cannot
  delete, so git strands its own `index.lock`). Through the mount, read only —
  `git --no-optional-locks`.
- **And "read only" is not enough on its own: a plain `git status` through the
  mount TAKES the lock** and then cannot remove it, so every later GitKraken
  call fails with a bare `exit status 128` and no message. That happened on
  2026-08-21 (a `git status --porcelain` at 10:55 blocked the commit at 13:30).
  Always pass `--no-optional-locks`. To recover, **`mv` the lock out** —
  `mv .git/index.lock _to_delete/gitlock/` — because the mount cannot delete
  it, and `_to_delete/` is gitignored.
- **A stale index makes files look modified when they are not.** After that
  lock cleared, three files listed as modified all session (`app/wiring.js`,
  `cad/naming.js`, `cad/ui.js`) turned out to be byte-identical to HEAD — an
  unrefreshed index entry under `* text=auto`, not an edit. Check
  `git diff HEAD --stat -- <file>` before believing a status taken through the
  mount.
- **But a cloud session can still commit**, via the GitKraken MCP tools
  exposed by the desktop app (`git_status`, `git_add`, `git_commit`,
  `git_push`, `git_graph`). Those run natively on the desktop, outside the
  mount, so the lock problem does not apply. Verified 2026-08-17: v1.45.0 was
  committed and pushed that way. Handing the work package to a local agent is
  still fine; it is no longer the only route.
- `node tools/build.js` **exits non-zero** on a module that is in `src/`
  but not in `src/manifest.json`, instead of printing a warning nobody
  read. That warning was true for four modules for a week. On 2026-08-08
  its manifest audit was also made cross-platform by normalising Windows
  path separators before comparison.
- **2026-08-08, later:** the v1.20.0 write-back from the cloud session
  overwrote this very section (it was edited from a stale copy — the same
  accident class as the August revert, caught because git held Codex's
  commit `70d4497`). Restored and merged the same day. Lesson recorded in
  §7 Traps: re-stage a file before editing it if another agent may have
  touched it since.

## 10. Change log

### 2026-08-22 - v1.75.0: eleven asks, and the interface moved rather than grew

Mike sent eleven things in one message. Nine of them are the same idea seen
from different angles: *this setting is not where I would look for it*. So
almost nothing here is new code — it is code that changed address, plus four
real bugs that fell out of walking the paths it lives on.

**The two board counts were never one number.** The startup wizard wrote
`PREFS.build.pcaBoards`; the bench wrote `SETUP.hw.boards` and only committed
it to `CFG.hwSetup` on Finish. Build → bench existed but wrote past the
bench's live copy — `SETUP.hw` is a detached `Object.assign` taken once at
`setupOpen()` — so the wizard could say two boards while the bench went on
saying three. Bench → build did not exist at all, deliberately:
`setupAdoptBoards()` is a BUTTON because growing the channel table behind
somebody's back is how calibrations get deleted. That reasoning still holds,
and is why `buildAdoptBenchBoards()` sets the ANSWER and leaves the table to
`buildApply()`, which since v1.67.0 grows quietly and OFFERS to shrink, naming
the rows and how many of them drive a part.

**The tick box needed two clicks, and the comment knew why.** The delegated
row-select handler called `setupRender()` — `body.innerHTML = …` — while a
click was still travelling to a checkbox. Per the HTML spec the box's
`checked` flips, then `click` dispatches, then `input` fires: by then the
element was detached, the event bubbled into nothing, `setupUse()` never ran,
and the rebuilt row came back unticked. The second click worked because the
row was already selected. Channel 0 always worked, because `SETUP.sel`
defaults to 0 — which is exactly the kind of detail that makes a bug report
read as flaky. The comment sitting three lines above it described the correct
behaviour; the code did the opposite.

**And the list jumped back to the top** because the render bracket saved
`#setBody.scrollTop` and the table's `scrollLeft`. The channel table grew its
own vertical scrollbar in v1.50.0 and nobody updated the save, so every
re-render threw you back to channel 0 — worst exactly where Mike hit it, at
the high channel numbers. Restored before the focus block now, with
`preventScroll`, so the focus cannot fight it.

**Clicking a panel opens its card, everywhere except sim only.** Nothing had
to be built: `CAD.root` hangs off `R2.root`, so the raycaster was already
pointed at the live droid and two guards were suppressing it. The v1.70.1
ruling behind those guards — a plain stage click must not open a config
editor — is superseded by the owner and **recorded rather than deleted**, in
select.test.js and in the source. The stray-selection worry it existed for is
answered by the click-vs-drag threshold instead of by a place. On the
procedural stand-in there is no pickable geometry at all, so a click says so
once rather than doing nothing.

**The arming prompt now speaks every time.** It was rate-limited to once per
sixty seconds after any successful arm — and the already-armed branch
re-stamped `shownAt` on EVERY armed frame, so those sixty seconds only started
when you disarmed. Arm, disarm, push the stick: silence, indistinguishable
from a broken prompt. The window is one short burst on the WALL clock now,
not `SIM.millis`, because a sketch that blocks must not be able to mute it.
The D-pad feeds the prompt too — it was buttons only, so a D-pad drive
attempt produced nothing at all — without changing what drives the droid.

**The sketch’s own settings left the Config tab.** Speed & feel to Foot
drive, the stick mapping to Controller, both endpoint tables to Servo
hardware, and the bug notes, the dome fix, the Maestro slots, Simulation and
the `.ino` export to Firmware — each behind that step’s own Advanced tick,
one per area rather than one for the wizard, because the risks are not alike:
a servo endpoint can drive a horn into a hard stop and `isLeftStickDrive`
cannot hurt anything. They MOVED; the tab keeps a line saying where they went
and a door to it, because two places to change the same number is two places
to be wrong. The same goes for the sound card, which is re-parented onto the
Sound step rather than copied — same element, so the ids, the boot-time
bindings and the live readout `hud.js` paints every frame all survive the trip.

**That move flushed out a real bug**: `.prose` was scoped under `.pane`, and
the wizard is not a pane. Three paragraphs of bug notes became 11.5 px mono
the moment they arrived, which is precisely the regression
`look-boards.test.js` was written to catch — it caught it.

**Build, import, export or assign is on the top bar.** The four jobs people
open that pane FOR were most of the way down it, behind a tab called Board.
The header was already exactly full at 1500 px, so the button carries its word
in a fit tier of its own, `hdrjob`, above `hdrshort`: the newcomer gives up
its label first and the six status chips keep theirs. Twenty pixels of window
is the whole cost.

**The manual is a live page**, `MANUAL_PAGES_URL`, composed from `APP_REPO`
rather than typed out a second time, with the release download kept as
`MANUAL_RELEASE_URL` and named as the fallback when Pages does not answer.
`.github/workflows/pages.yml` publishes it and had to be handed over by hand
— the desktop bridge refuses to write that path. **It needs Settings ▸ Pages
▸ Source: GitHub Actions once, or the URL 404s.** Until then the app opens a
page that is not there and says so through the probe it already had.

Also: an include/exclude tick for the AstroPixels at the top of both places
that ask about them — it writes the build’s own `domeLights` answer, and
un-ticking restores a previous Teeces rather than jumping to “None yet” — and
the stage button reads **Edit Track**.

**75 suite runs, all green.**

**Postscript, same day — green here, red on the runner.** The header-fit
assertion above was rewritten to a viewport width of 1520 px, and the real
threshold turned out to sit at 1516. **A test four pixels from a cliff.**
Text metrics differ between Chromium builds by more than four pixels, so it
passed locally and failed in CI — which is the worst way for a test to fail,
because the machine that can see the failure is not the machine that can fix
it. The claim was never really about a number: it is that when the header
runs out of room, the newcomer gives up its word before the six status chips
give up theirs. So it is asserted as that rule now — sweep 1700 → 1200 and
require that no width exists where a chip is abbreviated while the new button
is still spelling itself out, plus a second assertion that the sweep really
crossed both thresholds so it cannot pass vacuously. Resolution-independent,
and it says what the commit message said.

**The lesson is not "pick a bigger number".** It is that a magic constant in
an assertion is a claim about the environment, and this suite runs on three
of them. Where a threshold matters, find it by sweeping rather than by
writing it down.

**Second postscript, next day — the remaining red job had two packaging bugs.**
`build-config.test.js` asked for the first toast on the page even though the
toast contract allows three at once and dismisses them on wall time. On the
runner, the older “Channels 24-47 are yours to name now” receipt still stood;
the suite read it as the foot-controller warning and then clicked it, so both
assertions depended on machine speed. The test now finds the plate by the
cause it is required to name and clicks that same plate. This keeps the strong
rule — the droid must explain that no foot controller is chosen and the plate
must open question 7 — without making a claim about concurrent-toast order.

`builder.test.js` also read `examples/R2-model-simple-face.json` and
`examples/R2-model-robot-arm.json` at process startup. The tests and
`scene/builder.js` both described them as shipped examples, but neither file
was in Git, so a developer's working copy passed and a clean runner crashed
with `ENOENT` before printing a summary. Both fixtures are tracked now.

The full local run exposed one more claim about the environment:
`sequencer-ui.test.js` required the READY-MADE heading to begin below the fold
at exactly 1440×900. The library was genuinely clipped and its pinned “more”
control was present, but this Chromium fit the heading itself above the edge.
The suite now asserts the rule — clipped content provides the affordance —
then retains its existing geometry and click checks that the control is pinned
and brings READY-MADE into view.

### 2026-08-22 - v1.74.1: the PSI panels were behind the model’s own lens

They rendered perfectly and were never seen — which is the failure mode a
screenshot catches and a test does not, and the reason this was found by looking
at the droid rather than at the assertions.

Anchoring the PSIs to `FrontPSIRing`/`RearPSIRing` put each panel at the ring’s
**bounding-box centre**, 11 mm inside the shell. The MK4’s PSI is a 38 mm can
whose lens tips 8 mm proud of the dome, so the model’s own geometry was drawn
over the top of a perfectly correct 5x5 display.

Two things were wrong, and the second is the one worth remembering:

* **a part’s centroid is not its face.** Every anchor here is a BLOCK — 36 mm
  deep for the front logic, 38 for the PSI — so the middle of one is halfway
  inside the dome.
* **and the bounding box’s outer corner is not the face either.** The obvious
  repair is to stand the panel on the box’s support point along the outward
  normal. For an axis-aligned box that support width is exactly
  `|dx·nx| + |dy·ny| + |dz·nz|` — and for a PLATE TILTED off the world axes the
  box is fat in all three directions, so the answer comes out an inch too big
  and the board stands proud of its own bezel. It was tried, it looked wrong,
  and the picture is what said so.

The rule now is one that cannot drift: every panel sits on the **fitted shell**
— the only surface in this file that is measured rather than inferred — at its
part’s bearing, offset by that fitting’s own `out`. Negative for a logic display
recessed into the dome (−4 mm), positive for a PSI standing on its lens (+9 mm).
`out` is the only hand-set number in `render3d.js`; it is measured off the CAD’s
own bounding boxes and it is stated in the anchor table rather than buried in the
maths.

`tests/lights.test.js` gained the assertion that would have caught it: not "the
panel is somewhere near its part" but **"the panel is at `fit.r + out`, to within
half a millimetre"** — the rule itself.

### 2026-08-22 - v1.74.0: the dome lights, for real

Mike, with the repository open: *"this is the astropixels code can we use it to
build the lighting systems?"* — https://github.com/dpoulson/Astropixels

## The answer is yes, and the code is the part you cannot use

That repository is six `main.cpp` files, thirty to a hundred lines each. They
declare boards and pins and nothing else. Every pixel an AstroPixels dome
actually lights is drawn by Darren Poulson’s fork of the **ReelTwo** library,
whose `LogicEngine.h` alone is 3,240 lines — and it is **LGPL-2.1**, with the
Astropixels documentation **GPL-3**, against this project’s MIT (scoped — see
`CREDITS.md`). Lifting any of it in would relicense the simulator.

What IS usable is everything else, and it turns out to be enough:

* the **command grammar**, published in full — `LE<logic><effect><colour><speed><time>`
  and `HP<who><type><seq><colour><speed><random><position>`, with all 24 logic
  effects, 7 HP sequences, the colour tables and the speed multipliers;
* the **board geometries** — FLD 9×10 = 90 px, RLD 27×4 = 108, PSI 5×5 = 25,
  plus the 20×9 toolbox FLD, the 10×10 slant and the 8×8 PSI;
* the **palettes and defaults** — FADE/HUE/DELAY/PAL/BRI per board, the six
  palettes’ four key HSV colours, hue 220 for R2-KT and 255 for imperial;
* the **pin map** and the two interfaces (i2c `0x0A`, Serial2 @ 9600);
* the **Jawalite mapping** in `standard-md/md_commands/`.

So `src/js/lights/` is a clean-room re-implementation from a written behavioural
specification, and every module says so in its header. The prose in those files
is the provenance, not decoration: it is the record of what was read and what
was inferred.

## What it does

Eight modules, in manifest order:

| | |
|---|---|
| `lights/pcb.js` | boards, generated LED maps, the six palettes, `scale8`/`map8`, FastLED’s `hsv2rgb_rainbow` |
| `lights/engine.js` | one display’s state, the 10 ms frame clock, the colour walk, effect dispatch |
| `lights/font.js` | original 5×8 and 4-row bitmap fonts for the text effects |
| `lights/effects.js` | all 25 `LFX` entries |
| `lights/holo.js` | the seven HP sequences, the twitch timer |
| `lights/commands.js` | `LE`/`HP`/Jawalite parsing, the four firmwares and the transport |
| `lights/render3d.js` | the pixel panels, on either dome |
| `lights/ui.js` | the Dome lighting section on the Model pane |

A logic display is not a video screen with an animation played onto it. It is
ninety independent little state machines, each walking its own way along a
shared 46-entry HSV ramp at its own randomised pace, and an EFFECT is just
something that leans on that walk — brightens half of it, holds it still,
shifts its hue, or bypasses it and writes pixels directly. Everything about the
way a real dome looks follows from that one sentence, and from two details
inside it that read like bugs and are not:

* **the tween step is an integer**, truncated and then multiplied, so the ramp
  never quite reaches the next key. There is a jump at every key boundary, and
  it is what makes the fade look mechanical rather than like a phone screen.
* **a paused LED is not written at all.** An effect that turns the brightness
  down does not darken the panel; it darkens each LED as and when that LED next
  happens to step. That is why the flip-flops and the march *dissolve* across
  the display over a few tenths of a second instead of switching cleanly, and
  why the same effect looks lazy on the rear logic (delay 40) and snappy on the
  front (10).

## Three findings, each of which changed the build

**The four firmwares do not listen on the same doors.** `standard` takes native
commands on i2c AND Serial2. `standard-md` takes Jawalite on Serial2 and needs
`*RT` or `@AP` in front of a native one. And `imperial` and `r2kt` declare
`I2CReceiver` and **no `CommandEventSerial` at all** — so a serial command sent
to one of those two boards is not refused, it is **never read**. Nothing blinks
and nothing complains. That is exactly the class of failure this simulator
exists to catch, so `apxSend()` models the transport and refuses what the
configured sketch could not have heard, naming the door it would have needed.
Every control on the pane goes out through that same function; there is no back
way in that works when the wiring says it should not.

**The front logic is two 9×5 boards, so its serpentine restarts at row 5.**
The maps are GENERATED here rather than transcribed — a generated map cannot
drift from a board that was rewired, and a copied one cannot be checked at all
— and the first generator alternated strictly every row. That produces a map
which looks entirely reasonable and renders the bottom half of every glyph
mirrored. It was caught by the one test written against spot values read off
the published table, which is the whole argument for writing that kind of test:
the assertion knew something the generator did not. The 10×10 slant board
really is one board and really does alternate all the way down, which is why
the reset is a parameter and not a rule.

**The brightness is applied twice.** `calculateAllColors` bakes `bri` into the
ramp’s V, `updateDisplay()` then passes `bri` again per pixel, and FastLED
squares the value on top of that. `NORMAL` peaks at **18 of 255** and averages
under 3. That number is right — and as an sRGB value on a monitor it is black,
so Mike would have been shown a dome with its logics off. The reconciliation is
in the RENDERER and nowhere near the simulation: `LR_CURVE` is a power law
applied on the way into the texture only. `leCell()` still returns exactly what
the board would have driven, every test reads the true value, and nothing
downstream of the engine is told a different number.

## The panels are measured off the MK4, not guessed onto it

The stand-in’s boards go on by spherical coordinates, because that is how the
stand-in was built. The CAD model is different: it carries its own named parts
— `SmallLogicLightUp`, `SmallLogicLightLow`, `LargeLogicInner`, `FrontPSIRing`,
`RearPSIRing` — each with a bounding box and a centroid in the header, so on
the MK4 every panel is placed AND SIZED from the geometry Mike exported. They
land in the actual recesses rather than near them, and they stay right the next
time the model is re-exported. `tests/lights.test.js` asserts each panel’s
position falls inside the bounding box of the part it belongs to, which is the
one check that catches a re-export moving a board.

The front logic is drawn as its two real boards taking the top and bottom half
of one 9×10 texture — which is exactly how the hardware is built and exactly
how the Marcduino text commands address it (`@1M` top, `@2M` bottom).

Getting the outward NORMALS right needed the dome’s sphere centre, which is
written down nowhere, and two reasonable fits were wrong before the third was
right:

1. fitting the header’s `radius` field over all 57 dome parts lands **30 mm
   out**. `radius` is not one consistent measurement — a pie panel’s centroid
   is the middle of a flat plate sunk into the shell and sits well inside the
   surface, while the rim parts sit outside it.
2. fitting the five board faces alone gets the RMS down to 10 mm and is
   **degenerate in y**: five points in a narrow horizontal band let the centre
   slide up and down that axis almost for free. It came out 50 mm high, which
   tilts every panel 16° down — numerically fine and visibly wrong.
3. fitting the **shell’s own vertices** — 4,306 of them, every 17th, a prime
   stride so a regularly-tessellated lathe cannot alias onto one meridian —
   gives 4.8 mm RMS and a radius of 221.7 mm. One pass, then a second with the
   outliers dropped so the radar eye and the pie panels cannot drag it.

The MK4 export models no holoprojectors at all, so the lighting layer brings its
own housing, sat above the board it belongs with at that board’s own bearing
round the dome — the front logic is 23° off centre, and an HP at phi 0 would
sit beside it rather than over it. It is the one piece of geometry here that is
an invention and it is marked as such at the site.

## Deliberately not done, and why

* **The firmware is not ported and will not be.** This is a preview of what the
  boards will do, good enough to choose an effect and a colour by; it is not the
  sketch. The pane says so in as many words.
* **`MICBRIGHT` and `MICRAINBOW` read a microphone this app does not have**, so
  the level comes from the droid’s own sound — which is what the mic on a real
  logic board is usually taped next to anyway. Approximate, and labelled.
* **HP servo moves (`HP<x>1...`) are reported, not acted on.** This simulator
  already models servos properly, with travel limits and this droid’s own
  calibration; a lighting module inventing a second, worse servo path would be
  the wrong shape entirely. Map the holoprojector to a channel on the Panels
  step and it moves with everything else.
* **Which sketch and which door are NOT build questions.** The build wizard asks
  what hardware is in the droid; both of these are facts about the code on it,
  the same reason the Config tab holds the sketch’s own constants and nothing
  else. They live on the Model pane and persist in `PREFS.lights`. Adding two
  more steps would also have changed “the nine questions” the rail, the review
  and four test assertions all count — which is Mike’s call to make, not a side
  effect of a lighting feature.
* **The text effects draw Latin only.** `@1P61` selects Aurabesh on a real board
  and is answered here with a note rather than a font.

## Where it shows

`domeLights: astropixels` moves from `sim:'park'` to `sim:'full'`, and the
build’s answer is what turns the layer on: a droid whose dome lighting is Teeces
or “none yet” keeps the stand-in’s own sine-wave blink, because showing him
AstroPixels effects on a dome that has none would be the simulator telling him
something untrue about his own droid. The **Dome lighting** section on the Model
pane carries the sketch, the door, an effect and colour per display, the
holoprojectors, six one-click shows and a command box that takes anything —
`LE0110000`, `HPA0021|20`, `@1T3`.

**57 assertions in `tests/lights.test.js`**, four of them regressions rather
than coverage: the generated LED maps against spot values off the published
tables, the ramp’s integer step, the transport refusals, and the CAD anchors
landing inside their own parts’ bounding boxes.

### 2026-08-22 - v1.73.0: one word per thing

**Why.** The UX review counted six words for a stored movement and seven for one
servo output, in a tool whose whole job is explaining hardware to beginners.
Mike: *"yeah happy to standardise"*. This is that pass, deliberately its own
release so a rename sweep is not tangled with behaviour changes and is one clean
revert if it reads wrong.

**The glossary, now applied throughout:**

| Concept | Now | Retired from user-visible text |
|---|---|---|
| A stored movement | **sequence** | routine, script, subroutine, animation, frame list, macro |
| One output | **channel** (the number) driving a **servo** (the thing) | slot, port, output, actuator, pin |
| The measuring tool / its file | **servo bench** / **servo config** | servo setup, servo layout, servo rack, servo table |
| Getting it onto the board | **Put on the board** | four different "Build ..." verbs |
| The puppet head | **Anzellan head** | Frik head |

**Scope was the whole discipline.** Strings a person reads - labels, headings,
tooltips, dialog text, hints, toasts, `lg()` lines, option text, table headers.
**Not** identifiers, **not** stored values (an option id, a `PREFS`/`MSTR` key,
anything written into a saved file), **not** generated output, **not** the
Pololu/Maestro domain words. Every saved build, every `.mstr` and every setup
`.json` still loads unchanged.

**Where a literal swap read badly, the sentence was rewritten** rather than left
grammatical-but-clumsy. The daisy-chain warning is the example: *"...starts
subroutine 2 on Maestro 1 and Maestro 2, and whichever sequence happens to be at
index 2..."* became *"...starts sequence 2 on Maestro 1 and Maestro 2 - whatever
happens to be sitting at index 2 on the other board runs too"*, because the
mechanical substitution produced a tautology.

**Four words were kept on purpose, and the reasons are the useful part.**
`sub` survives where the UI is literally naming the generated symbol ("on the
board as sub 3") - there it is the *board's* word, not ours, and the same goes
for every `restartScript(n)` reference. `slot` survives where it means a
firmware board slot 0-7, which is a genuinely distinct concept from a channel.
The wiring sheet's CSV header and `<th>` still say **Actuator**, because that
column names the simulator's internal id and the sheet says so in its own
legend - it is a format, not a description. And the Anzellan channel **names**
(`Frik head pan`, `Frik head tilt`, `Frik head nod`) stay: they are written into
`MSTR.channels[].name` by the starter generator and into every exported file, so
renaming them would desync every table already calibrated. Only the model's
display name moved. **That is a residual, not a finish** - it wants a migration,
not a rename.

**One collision resolved by not renaming it.** The stage toolbar shows `BUILDER`
and a `BUILD` button side by side, which read as two meanings of one word. On
reading them they are not: the button opens the Builder's own parts bin (its
tooltip already said so) and has never referred to compiling. The real board
compiler was the thing saying "Build your Maestro", and that is now "Put on the
board" - so nothing that compiles says "build" any more and "Builder" is left
unambiguous.

**Two process notes, both of which cost time.**

**Line endings, again.** Five files came back from an agent's editor with their
CRLF stripped to LF - `cad/select.js`, `input/cues.js`, `input/puppet.js`,
`profiles/maestro-shared.js`, `profiles/mod2026.js`. Content-wise each had
changed 2-8 lines; as a diff each read as a 900-line rewrite. **Diff with
`--strip-trailing-cr` before believing a large diff**, and check `file -b` on
anything that looks rewritten.

**And two of the three rename agents were interrupted before reporting.** The
work was already in the tree with no record of what had been changed. Rather
than discard it, the change list was **recovered by diffing the working tree
against the committed one** (`tar` the committed files off the device, extract,
diff) and then safety-scanned for anything touching an id, a stored value or
generated output before being trusted. It was clean. *A partially-applied rename
with no report is recoverable exactly as long as the last commit is good* -
which is the argument for the small, frequent commits this run has been making.

**Suite: 6076 assertions**, unchanged in count, 36 suites x 2 builds plus PCA
Studio, green. Eight assertions pinned retired wording and were updated to pin
the new wording exactly - none relaxed to a substring or a regex to make it
pass. The repair pass also found **a guard that had been passing for free**:
`build-config.test.js` asserted the Maestro import card does *not* say
"exported from here", a phrase that no longer exists anywhere in the app, so a
regression showing the PCA wording on a Maestro build would not have been
caught. It now guards on the live phrase.

**Left deliberately:** "Build a sequence" and "build sequences out of bricks"
are *authoring* verbs, not the put-it-on-the-board verb, and now that the
compiler says something else they are unambiguous. Roughly 130 `ok()`
descriptions in untouched suites still use "routine" as a concept word; churning
twenty otherwise-untouched files was judged worse than the inconsistency.


### 2026-08-22 - v1.72.0: the last of the review's interface work

**Why.** The remainder of the "needs no decision" list, once v1.71.0's rulings
had unblocked the files. Small, and two of them are things the app was actively
teaching wrong.

**The manual's blank tab, diagnosed rather than guessed.** `manualOpen()`
caught `window.open` *throwing* - which is not the failure. The failure is the
tab opening fine and then not loading, i.e. a garage with no wifi, which is
where a builder is standing. Probing was measured before anything was written:
a plain `fetch(HEAD)` is worthless here (CORS from a `file://` page: TypeError
online **and** off, identically), an image probe likewise; `mode:'no-cors'` HEAD
is the one that answers - opaque means GitHub was reached, TypeError means it
was not, and HEAD never pulls the 5 MB body. The tab still opens synchronously
inside the click so popup blockers keep trusting it; a definite failure now
raises a card naming the cause, the Releases download, the filename and the URL.
A card rather than a toast **because the new tab takes focus** - a 3.5 s plate
in the window you just left is the same silence in a different costume. The
connection caveat also moved into the shared button title, so the header button
carries it and not only the sidebar.

**Track mode's first thirty seconds** were: cannot see the droid (it starts 5.4 m
off-frame with Follow off), cannot move it (feet disarmed), and losing points
for it (a barrier touch charged +2 s while the HUD still read "cross the line"
and the clock had not started). All three fixed - the camera is framed on the
start line, the penalty clock is gated on the run having begun, and the HUD
carries a persistent "feet disarmed" line that clears the moment they are armed.
That line is deliberately the same *advice* as v1.71.0's stage hint rather than
a second voice: the hint is a moment, this is a state, and anyone who sees both
is told one thing twice.

**"Ellipses render as underscores" was wrong, and the measurement is the
finding.** IBM Plex Mono does carry U+2026 - checked by pulling the woff2 out of
the stylesheet and reading its cmap. Rendered at the label's own 10px, the three
dots sit ~1.7 px apart and antialias into a single 6x1 px bar, which is
pixel-identical to the box `text-overflow:ellipsis` paints on a clipped label.
So `SIM ONLY...` and a truncation were the same mark. No font swap can fix that
at 10px, so the rule instead is: **the mark means "cut off" and nothing else.**
Three chrome labels dropped their literal ellipsis; each already sits beside a
row naming its door. This matters beyond tidiness - v1.69.0's header chip ladder
deliberately truncates at small widths, and it cannot communicate if a real
ellipsis looks the same.

**One keyboard legend, not two.** The always-visible strip panel and the `?`
card were near-identical lists, and v1.71.0 made the card authoritative (it
gained the arming lead and rewrote its driving rows) - leaving the *permanently
visible* one still teaching `Start / Back  ↵ N`, the exact row that hid the
arming fact through four walkthroughs. Nothing could have kept hand-written
markup in step with a table in a JS file. The strip now carries a `? Shortcuts`
door to the one card. It earns its place most in **sim only**, where the header
and its `?` are hidden and the visitor holding the laptop was never told a key
exists.

**And the make-or-break moment: "did the thing I made do anything?"** A first
brick on a panel behind the dome played three times and looked like nothing.
Adding a brick no longer moves the camera - it lights the part up on the model
in that brick's own colour, wherever you are looking. `ZOOM TO THIS PART` now
frames the part *in context* (about three times its size) rather than filling
the frame with it, which is what put the camera inside the geometry. Pressing
play borrows "colour the model to match" for the duration and hands the user's
setting back afterwards. And when the selected brick's part is facing away, the
inspector says so by name and offers to turn the view round - measured on the
horizontal bearing of part and camera about the droid's axis, returning *null*
rather than *false* when it cannot tell, so "don't know" can never be read as
"no". Separately, a routine built on parts with no servo channel is now a named
warning at export instead of `ERRORS 0` in silence.

**Two residuals closed.** The startup wizard's Escape still doubled with the
help card's, because it binds at load and `stopImmediatePropagation` only stops
listeners registered *after* it - so the wizard's guard now declines while the
card is up, and the general rule is recorded: **a guard that listens permanently
cannot rely on anyone else's `stopImmediatePropagation`, and must name in its
own `isOpen` every surface that can stack above it.** And `HW.rebuild(true)`'s
keep-loop guarded on the *new* servo flag only, so a channel that had just
become a Servo had its freshly-homed state overwritten by the old row's zeros;
the copy is now narrowed rather than widened, so it composes with v1.69.0's
`aim` fix instead of undoing it.

**Suite: 5972 -> 6076 assertions**, 36 suites x 2 builds plus PCA Studio, green.


### 2026-08-22 - v1.71.0: the interface half of the review

**Why.** v1.69.0 and v1.70.0 fixed what was broken. This is the half that
needed Mike to decide: he answered fourteen open questions in one pass, and
this release is those answers plus the ~30 interface fixes that never needed
asking. Reports: `docs/UX-REVIEW-2026-08-22.md`.

**The four and a half minutes.** Pushing the stick while the feet are disarmed
produced total silence - every walkthrough's first action, and the one that made
one of them conclude the app was broken and close it. The blocking fact lived in
the last three words of a table row, which you had to join to a *second* table
to act on. Mike's ruling: keep the Start gate, *"prompt the user if they try to
use the Controller to press start - a great lesson tip"*. So a line now appears
over the stage at the moment of the attempt, on every drive door - keyboard,
on-screen stick, real pad, RC - once per attempt-burst, backing off once you
have armed at all; the `?` card carries the arming fact as its first row; and on
a true first run lesson 1 opens on the stage explaining *why* the feet boot
disarmed. Measured on a fresh profile: the line appears **one frame** after the
first push, the feet arm 48 ms after the key goes down. **Two deliberate actions
and about five seconds**, against four and a half minutes and four wrong turns.

**And the wizard that would not stay shut.** Answering all nine questions and
dismissing the panel never set `PREFS.build.done` - only the final Finish job
does - so the boot check reopened it at question 1 on **every** reload, forever.
That also put a full-screen questionnaire under a click meant for the stage,
which silently swapped a walkthrough's droid for a wheeled chariot. One
predicate. It was also why Configure headed a complete, correct list of all nine
answers with **NOT SET UP YET**; that now reads *answered, not finished*.

**Q7 gets an honest third answer.** *"This is the open decision on your build"*
offered exactly two committing choices. Mike chose **feet inert until you
choose**: a "Not decided yet" card, the foot drive parked, everything else -
dome, panels, sounds, sequencer - untouched, and the droid says *why* with a
jump back to question 7. That created a second silent-feet cause, so the two
messages are deliberately disjoint and each defers to the other: *"Feet are
disarmed - hold Enter (Start) to arm"* versus *"No foot controller chosen yet"*.
`buildApply()` also stopped writing `FOOT_CONTROLLER = 0`, which asserted a
Sabertooth by omission.

**One channel map is the truth.** Three were live and they disagreed. Mike:
**the Board table**. It is `MSTR.channels` - what the bench edits, the engine
drives and the exporter writes. Outputs was answering a different question
("what would this firmware drive") and already knew - it carried a `live` flag
and a *planned* note - but under a heading that read as fact, and with section
titles naming `0x41`/`0x42` from the section index rather than the addresses the
sketch opens. It now says which it is, in the heading. The wiring sheet was
worse: `wiringSource()` derived from whichever *sketch* was loaded, so with a
dome Maestro's table open it printed `starterNames()` order, `set on the board`
in every TRAVEL cell, and INV structurally always blank (it read `c.invert`,
retired in v1.46.0). It now reads the channel table, prints real endpoints
shut->open, and marks a board with no table as planned rather than stating it.

**The safe range is defended.** The dial displayed *"safe range · 1000-2000 µs"*
and accepted 2700, producing a channel whose centre sat outside its own
min-max - and a red chip appeared afterwards, off-screen, using a **third** pair
of thresholds. Mike's policy: *"500 - 2500 but warn when outside of
1000-2000"*. Four hard-coded pairs (`300/2700` on the dial, `300/2700` on the
Configure panel, `400/2600` on the apply bar, `500/2500` on the chip) now all
derive from `servo-units.js`'s single `PW_STD`/`PW_ABS`. Out of band is refused
at the point of entry with the reason at the control; the warning band decorates
and does not block; a centre outside its own travel is refused by any door. One
finding fell out of the fix: the boxes had been *classed* `bad` since v1.37.0
and the colour could never win, because a specificity accident meant
`#setupWrap input[type=number]` outranked the band rules. "Nothing turned red"
was literally true.

**The rest of the interface.** The stage toolbar escaped its own stage - at
800x600 `Follow` sat at x=-161 with nothing to scroll it back, and at the
*default* 1440x900 in the Sequence workspace it drew 94 px inside the sequencer
pane; it is now clamped to the stage's box and scrolls. The app header showed
through the Panels/Colours/Scene overlays with `DRIVE` cut to "VE". Splitters
gained real minimums (the pad could be squashed to 90 px, the stage to 17). The
Parts panel clipped mid-sentence so `READY-MADE` - one click of which builds a
whole convention show - read as the bottom of the panel; it now announces
itself, and the caption finally documents that **clicking** a part adds it,
which is the gesture that always works. The sequence library gained Rename and
Delete. `Fit` on the timeline, lanes that grow, and a ruler that stops
re-anchoring mid-drag. **Two clicks and about ten seconds** to one panel opening
and closing, against eighteen minutes.

**And the decisions that were Mike's alone.** Three export buttons front of
house with the second following the build, so a Maestro builder is never handed
a PCA9685 header (the rest stay behind Advanced - nothing became unreachable).
Clicking the droid opens the part editor only where part work happens, so it
cannot ambush someone focusing the canvas on the Drive screen. The Track
Builder's two indistinguishable save buttons became one `Save as...` - no
in-place overwrite, per Mike - and Cancel now asks before binning a dirty curve.
Kiosk composes its opening frame and has a Re-centre, so one mouse wheel can no
longer end the exhibit. PCA Studio is **parked**: a banner saying so and where
its functions now live in the sim, a `tools` heading in the README, and it keeps
building and keeps its staleness check so it cannot rot silently. Q9 stays
advice - the app recommends and does not auto-select, because *"we are offering
advice they can do what they want"*.

**Suite: 5524 -> 5972 assertions**, 36 suites x 2 builds plus PCA Studio, green.

**Still to come:** the naming standardisation Mike agreed to - ~600 strings
across sequence/routine/sub/script and channel/servo/port/output - is
deliberately its own release, so a rename sweep is not tangled with thirty
behavioural changes.


### 2026-08-22 - v1.70.0: the handed-off half, and a test runner that can fail

**Why.** v1.69.0 shipped 61 fixes and handed 31 off, because another session
had nine files uncommitted. Mike: *"For B can you sort it out"*. Those files
had not been touched since 23:09 the night before and were already inside
v1.69.0's green run, so **their work was committed first and unchanged as
`304ad97`** - nine files of finished work in a dirty tree is the one case git
cannot help with - and this release is built on top of it.

**Their v1.68.1 made one of the handed-off findings worse, which is why it went
first.** `scriptSubNames()` now deliberately emits `s_2001_Salute` and
`Dome_Wave_2` where two routine names collapse onto one `niceName()` symbol -
correct, and the reason two `sub Dome_Wave` blocks stopped both resolving to the
first routine. But `import.js` still matched subs on `niceName`, so every such
name now failed to match on re-import and fell into the "this file carried no
`<Sequences>`" recovery, which appends a phantom copy: 8 -> 10 -> 12 routines
over two round trips, each with frames identical to the original. Matching on
the exporter's own symbols closes it, with the old symbols kept as a fallback so
every file written before v1.68.1 still resolves.

**The export door was writing `undefined` into the script.** `genFrameRow` got
the v1.39.5 hole fix; `genSeqBody` - the half `restartScript(n)` actually runs -
did not, so a table the bench had grown past `servoCount` produced 19 script
lines reading `500 6000 undefined undefined undefined`. The same normalisation
now decides both the emitted value and the has-it-changed test, so a hole and an
explicit 0 stop re-commanding channels for nothing. Alongside it, frame rows
were written at `MSTR.servoCount` columns while `<Channels>` declared
`MSTR.channels.length`, so a channel added on the bench was declared and then
silently dropped from every frame.

**And re-importing your own `.mstr` renumbered the d-pad.** `mstrApply` called
`loadoutReset()`, which is the whole library in library order - but the script's
subroutine order, which is what slot numbers mean, is the **loadout** order: a
subset, in a chosen order. A curated `0=Dome Flutter, 1=Whole Dome Open` came
back as `0=Dome Pies Open … 7=Dome Flutter`. The loadout now comes from the
file's own subs, positionally, and falls back to a reset only when the file
carried no script - the one case the old comment actually described.

**Three buttons that wiped everything, and the two edits that left bricks
pointing at nothing.** Body / Dome / Frik head starter each replaced the channel
table and the sequence library and rewrote the browser backup in the same click,
with no question - the only destructive path in the app that did not ask. And
renaming a sequence left every whole-sequence brick in other routines naming a
sequence that no longer existed: the brick stays on the timeline, keeps its
length, and compiles to a held pose. Rename now re-points and recompiles them;
delete names the count and the routines and asks.

**The firmware and the sim had drifted apart in a day.** v1.69.0 widened the
track mask to four words in `MaestroPCA.h` and left `pcaSeqMask` folding at 31,
so the sim said two sequences above channel 31 collided and the board said they
did not. `pcaseq.js` now mirrors `struct Mask` method for method, including the
corrected `c < 32` boundary - and `pca-gen.js`'s `#warning` about slots above
127, which after v1.69.0 was true against a fixed library and false against the
copy anyone already has, now says which, and emits a hard `#error` keyed on
`MPCA_MASK_WORDS` rather than a `#warning` nobody sees on a droid with no serial
monitor.

**Two more in the generators.** A `*/` or a newline in a routine or channel name
went raw into the `/* … */` comments that `pcaHeaderParse` reads names back out
of - so the generated C++ broke and the name came back truncated, taking the
bricks that match on it. And a frame longer than 65535 ms was silently clamped;
it is now split into repeated rows, which is exact rather than merely reported,
because a target already given persists and a target of 0 means "not driven".

**Importing a servo config never reached the engine.** Speed, acceleration, ease
and mode are copied once, at `pcaCreate`, so an imported speed limit did not
apply - the servo still slammed - and a channel the file turned into a Servo
could not be driven at all. One 10 ms tick crossed the whole throw where the
file asked for 1.1 seconds. This one had to wait for v1.69.0's `aim` fix, or the
rebuild it adds would have flung every driven channel home. `ease` and
`releaseMs` were also missing from `SERVO_CFG_FIELDS`, so both `.json` exports
dropped them - including the copy the "save first, then import" gate writes.

**## The safety net was not one**

`./test.sh` **could not fail.** Every suite ran as
`node "$s" | grep … || echo '(no summary)'`, and a pipeline reports grep's
status, not node's - so 37 suites' `process.exit(fail ? 1 : 0)` was discarded at
the pipe, the `||` made the compound succeed unconditionally so `set -e` had
nothing to fire on, and that same construct was the last statement in the file.
`./test.sh` returned 0 with FAIL lines scrolling past it. So did `npm test` and
anything keying off it. It now captures each status before anything pipes it,
accumulates across suites and targets, prints a plain PASS/FAIL verdict, and
distinguishes a suite that printed nothing from one whose summary line simply
did not match. Proven three ways: green run exits 0; a deliberately failed
assertion exits 1 and names the suite; a suite that dies on `require` exits 1
and echoes the error.

**And nothing checked the tracked PCA Studio build.** The standing note says it
is tracked "so `./test.sh` fails loudly on a stale one" - that check had never
existed, and `smoke.test.js` asserts against the checked-in artefact, so a stale
file passes its own smoke test by definition. `tools/check-studio.js` runs the
real generator with its write intercepted, compares in memory, and names the
first differing byte and which module it lands in. It cannot repair what it is
meant to report, which a rebuild-and-diff would. `npm run build` now runs
`./build.sh` rather than half of it.

**Fourteen suites collected page errors and never asserted on them** - a
`ReferenceError` from an unloaded module scrolled past invisibly, and the
`PAGE ERRORS:` line did not even match the runner's grep. All fourteen now
assert, and the assertion was proved live by removing `esc-guard.js` from
`dev.html` and watching five suites go red on `escGuard is not defined`. Four
assertions that could not fail were rewritten to assert their mechanism -
including one where the `|| true` was hiding a wrong operator, not just a
constant, and one where a four-word mask array was being `&`-ed into `NaN` so
the test would have passed for two *identical* masks.

**Also:** `?` opened over the servo bench and one Escape then closed the card
*and* the bench, which disconnects the board and disarms live drive - the
blocker now asks `uiModalOpen()` rather than hand-rolling four of its six
checks, and the handler uses `stopImmediatePropagation`. The Maestro watcher
polled every 200 ms while each ask could take 400 ms to time out, all serialised
on one chain, so a board that accepts bytes and never replies built an unbounded
backlog that kept writing for seconds after the watch was stopped; it now
re-arms itself after each pass. The validate panel collapsed 129 identical lines
into one that names the channel and the frame count, painted errors in the
fault token instead of the warnings' amber, and grew a "Fix channel N" that
lands on that channel in the bench. And the nine unlabelled file buttons each
say what their file is and who it is for - **which three get promoted out of the
collapsed row is still Mike's call and was deliberately not taken.**

**Suite: 5309 -> 5524 assertions**, 36 suites x 2 builds plus PCA Studio, green,
and for the first time the runner would have told us if it were not.


### 2026-08-22 - v1.69.0: the review release - 61 bugs, and the ones that move a real servo

**Why.** Mike asked for a full deep dive: *"identify any bugs and issues that
may bite us now or in the future"*, then *"act as a user who doesn't know how
to use the software"*. Eight reviewers read every module in `src/js`, the build,
all 37 suites and the Arduino library; four more drove the built app in a
headless browser as first-time builders. The standing rule was **prove it or
drop it** - most findings below were reproduced by executing the code, not by
reading it.

**Two reports, both with STATUS blocks:**
`docs/CODE-REVIEW-2026-08-22.md` (61 fixed, 31 handed off, the refuted list) and
`docs/UX-REVIEW-2026-08-22.md` (85 findings, 12 of them fixed here).

**The five that reach hardware.** `HW.rebuild(true)` carried `target` across an
engine rebuild but not **`aim`** - the field `pcaStepChannel` actually steers by
- so *any* bench edit walked every driven channel back to its home, and a
boot-Off channel hard into `c.min` where it stayed. `HW.drive` clamped inside
the engine and then handed the **unclamped** value to the wire, so a frame from
another droid drove a real servo past its calibrated stops while the model, the
engine and the bench all read the endpoint correctly. `HW.applied()` re-streamed
every position using a new pulse frequency it had never sent to the board -
a 50 Hz board driven with 200 Hz tick maths emits a 6 ms pulse on every channel,
and then the wizard disconnects and leaves it there. `mstrQuiet()` rewrote every
channel's speed on the board without clearing `SER.lastSpeed`, so the next play
suppressed Set Speed and the board ran the move flat out. And in the firmware,
**two bytes of serial noise walked `MaestroLink::_arg[52]` off the end** -
reproduced under AddressSanitizer from literally `feed(0x9F); feed(0x7F);`,
firing ~127 `setTarget()` calls from out-of-bounds memory.

**The seven that destroyed work, silently.** `chAssign()` wrote the panel to
channel mapping into `MSTR.channels` and never called `HW.save()`, so an
afternoon of Panels-step wiring was reverted by the next reload. A build answer
naming a *smaller* board truncated the calibrated table, `servoStoreSave()`d the
loss and never asked - while the comment two hundred lines below claimed it did
ask, citing a `buildLiveIssues()` that has never existed in this tree. Pressing
**Save** with a name already in the library overwrote the *other* routine and
left two entries sharing a name. The review door of the frame-to-brick converter
kept the original **in memory only**, so a tab switch destroyed an imported
routine - while the module's own header says both doors keep a copy. Importing a
model file committed it before validating a single record, so the project's own
`examples/R2-model-simple-face.json` emptied the stage and toasted *"loaded 0
part(s)"* in success styling. Clearing a part's **name** or **colour** deleted
its hand-authored **motion** too, because three of the four override writers
pruned the record on a subset of the keys it can carry. And `partsLoad()` pruned
against whatever model was loaded - which at every boot is the shell-only
payload - so the documented "drop the full `.r2m` and name the internal parts"
workflow deleted that work on the next unrelated edit.

**The four safety guards that were not holding.** `rcRestWarnings()` - the guard
whose entire job is to say out loud when something is commanding an output with
your hands off the set - read the *calibration record* rather than the stick, so
an uncalibrated channel bound by hand sat at full reverse and reported nothing.
Un-ticking **Advanced** did not disarm direct-to-output bindings: the row
displayed "not assigned" while still writing `MOT.drive`. A proportional trigger
delivered 128/255 at rest, silently changing which `restartScript()` slot every
d-pad press fires. And in kiosk mode a stranger could click the droid and get
the full part card, **including the Maestro channel re-map** - the sixth guard
in a series where five had already been added one at a time.

**The compiler.** An abutting brick blanked the interval before it, so a hold
compiled as 0.8 s SHUT while the scrub preview said open - and the same timeline
exported differently depending on the order the bricks were dropped. `blockSaveAs`
dropped `stepMs`, silently downgrading a routine to the legacy 120 ms step that
v1.66.0 exists to avoid. Two "new sequence" doors minted colliding names, and
everything downstream resolves a board slot **by name**. Every compiled routine
carried 400 ms of dead tail. Odd-length bricks produced half-millisecond
boundaries, a junk 1 ms frame and two `<Frame>` elements sharing a name.

**And `map_()` was off by one across the entire negative half** - it truncated
the sum where Arduino truncates the quotient, so 32,765 of 65,536 throttle
positions disagreed with the sketch, in an app whose whole premise is that they
match. `profiles.test.js`'s "straight transcription of the .ino" carried its own
private copy of the same bug, which is why nothing caught it.

**Firmware, measured not guessed.** The track mask folded every channel above 31
into bit 31, so on a three-board rig two sequences on genuinely disjoint
channels cancelled each other - killing the library's headline feature over a
real Maestro. Now a `uint32_t w[4]` covering the full 128 channels, which is the
ceiling the rest of the system already has; going to 128 rather than 64 costs
**32 bytes of RAM and 48 of flash**, measured on atmega2560 at `-Os`.
`Track::seq` was an `int8_t`, so `restartScript(128)` stored negative, read as
"track free" everywhere, and never played - while `sequenceRunning()` matched
the same truncated value and reported it as running. Total firmware cost: +57
bytes RAM, +352 flash, about 1.1 % of an ATmega328. Four new native tests, and
the library copies in all three sketch folders re-synced with CRLF intact.

**Two findings about the safety net itself.** `./test.sh` **cannot fail** -
every branch ends `| grep ... || echo '(no summary)'`, which neutralises `set -e`
and discards the suite's exit code, so a run full of `FAIL` lines exits 0. And
nothing in the repo checks that the tracked `pca-studio/PCA-Studio.html` is
current; `npm run build` runs only `tools/build.js`. Both live in files another
session had uncommitted, so both are handed off in the report rather than fixed
here - along with the `undefined` token the Maestro **script** exporter writes
for a missing target, the loadout order that re-importing your own `.mstr`
destroys, and the three starter buttons that wipe the whole library with one
unconfirmed click.

**Suite: 4658 -> 5309 assertions**, 36 suites x 2 builds plus PCA Studio, all
green. Every fix carries a regression test that was watched red against the
pre-fix tree first.

**What the walkthroughs found, in one sentence:** the app is beautifully written
and badly sequenced - its explanations are among the best in any tool of this
kind, and almost all of them appear at the exits rather than the entrances.
Time to first movement for a new visitor was four and a half minutes and four
wrong turns, because pushing the stick while disarmed produces total silence.
The setup wizard reopens at Question 1 on every page load forever, because
answering all nine and dismissing it never sets `PREFS.build.done`. And
`READY-MADE`, the one-click show builder that turns twenty minutes into three
seconds, is below the fold at the default window size. Those three are the top
of `docs/UX-REVIEW-2026-08-22.md` and are **not** fixed here - they are
interface decisions, and they are Mike's to make.


### 2026-08-21 - v1.68.0: the ESP version, and the servo that would never have moved

**Why.** Mike has ESP32 boards on the desk and asked the right question before
flashing anything: *"do we need to reveiew how they work so we dont have the
same issues with jerkyness?"* — the ramp work in v1.66.0 having taken three
releases and three reports to settle. Reviewing found something else first.

## The bug a compile could never have caught

`MpcaEsp32.h` handles both arduino-esp32 cores, because which one somebody has
installed is not their fault. **A GPIO number and an LEDC channel number are
not the same thing**, and 3.0 hid that: it made every call pin-addressed and
allocates the channel behind your back. 2.x does not — you pick the channel,
then hang a pin on it:

```
2.x   ledcSetup(uint8_t channel, uint32_t freq, uint8_t bits)     channel 0-15
      ledcAttachPin(uint8_t pin, uint8_t channel)
      ledcWrite(uint8_t channel, uint32_t duty)
3.x   ledcAttach(uint8_t pin, uint32_t freq, uint8_t bits)
      ledcWrite(uint8_t pin, uint32_t duty)
```

(Checked against Espressif's own `esp32-hal-ledc.h` at 2.0.17 and 3.0.7, not
reasoned about — the standing lesson from §7.)

The 2.x branch passed the **GPIO where the channel belongs** and then wrote to
a third number again:

```c
#define MPCA_LEDC_ATTACH(pin, hz, bits)  do{ ledcSetup((pin), ...);
                                             ledcAttachPin((pin), (pin)); }while(0)
#define MPCA_LEDC_WRITE(pin, idx, duty)  ledcWrite((idx), (duty))
```

The default `SERVO_PINS` are `13,12,14,27,26,25,33,32,23,22,21,19,18,5,17,16`.
**Twelve of the sixteen are above 15**, so `ledcSetup` was being asked for
channels that do not exist and simply failed. And for the four legal ones, the
setup configured channel *GPIO* while the write went to channel *array index* —
different numbers. **Not one servo would have moved, on any pin, with no error
printed anywhere.**

The channel is now the **array index** — 0..count-1, which is 0..15 by
construction because `MPCA_LEDC_MAX` is the silicon's channel count — and the
pin is the GPIO. Both branches take both and use the one they mean.

## Why nothing caught it, which is the more useful half

Two independent reasons, and both are the same shape as v1.53.0's silenced
compile step:

1. **`test/esp32shim/esp32env.h` hardcoded `ESP_ARDUINO_VERSION_MAJOR 3`** and
   faked only `ledcAttach`/`ledcWrite`. The 2.x branch had **never been
   compiled by anything**, in the harness or in CI.
2. **`ledc_test.cpp` builds under `MPCA_TEST_LEDC`**, and the entire
   `#if defined(ESP32)` block — both macros and `begin()`'s attach loop — is
   preprocessed away on that path. The test that exists to check the mapping
   could not see the mapping.

So the fakes changed shape. `test/esp32shim/ledcfake.h` **enforces the core's
own rules** rather than swallowing everything: an out-of-range channel, an
attach before setup and a write to a channel with no pin on it are all refused
and counted, and it answers the one question that matters on both branches —
*what duty is GPIO n holding?* One set of assertions therefore covers both
cores, and `MPCA_SHIM_CORE` / `MPCA_TEST_CORE` build every ESP artefact twice.

**Proven red**: restore the v1.67.1 mapping and core 2 fails 10 of 25, with the
fake naming the cause (`ledcWrite: channel 3 has no pin on it`), while core 3
stays green — which is exactly the signature of a 2.x-only bug.

## The jerkiness answer: no, and better — measured

The kinematics is **one shared `MaestroPCA::update()`**: a `millis()` delta,
clamped, drained into `_tickAcc` in fixed **10 ms** quanta. Every back end runs
the same code, so `MPCA_SEQ_SPEEDS`, the per-frame speeds and the per-routine
ramp step from v1.66.0 are already on the ESP path and **none of it needs
redoing**.

`test/ripple_test.cpp` is new and is a measurement kept as a test. It models the
servo honestly — it samples the pin once per 20 ms frame and holds the last duty
written — and reports velocity-ripple CV, the measure that settled the ramp-step
question:

| full throw | LEDC CV | frozen frames | PCA9685 CV | frozen frames |
|---|---|---|---|---|
| 1.0 s | 0.079 | 0/40 | 0.110 | 0/40 |
| 4.0 s | 0.044 | 0/190 | 0.141 | 0/190 |
| 10 s | 0.078 | 0/490 | **1.199** | **289/490** |
| 20 s | 0.137 | 0/989 | **1.969** | **787/990** |

**Fast moves are identical** — the 10 ms engine tick and the 20 ms servo frame
swamp any µs quantising, which is worth knowing because it is the opposite of
what the resolution figures suggest. **Slow moves are not**: 4.88 µs is bigger
than the distance a 100 µs/s crawl covers in one frame, so a PCA9685 servo
stands still for four frames and then steps. That is the gentle panel open
people report as jerky, and direct pins remove it.

## The radio is off, and that is the fix for now

Mike: *"should we dissbale the wifi - not needed I dont think - maybe add it
later on?"* Yes, and the reason is stronger than not needing it.
`web.handleClient()` **blocks**, and arduino-esp32's `WebServer.h` sets
`HTTP_MAX_DATA_WAIT`, `POST_WAIT`, `SEND_WAIT` and `CLOSE_WAIT` to **5000 ms**
each. A phone opening a speculative socket and not finishing its request line —
which browsers do with nobody pressing anything — parks the motion loop for up
to five seconds. Measured:

| loop blocked | CV | worst step in one 20 ms frame |
|---|---|---|
| never | 0.079 | 20 µs |
| 20 ms every 200 | 1.251 | 210 µs |
| 120 ms every 200 | 2.175 | 210 µs |

And `update()`'s `if(elapsed > 250) elapsed = 250` means a stall **under** a
quarter second costs no time at all while every millisecond past it is lost 1:1
— a 600 ms stall makes a 2400 ms routine take 2752, so it drifts out of step
with its sound. Both cliffs are pinned by assertions now. (Worth noting the two
clamps disagree: the frame clock caps at 250 ms and `_tickAcc` at 200, so past a
quarter second the sequence advances further than the servos can step toward it.)

`ESP_WIFI 0` compiles none of it — proven by the **absence of `WebServer`
symbols in the binary**, not by reading the source — and section 4/6 of
`Config.h` carries the numbers and says what a proper fix is.

**No motion task was added, deliberately.** The starvation risk *is*
`handleClient()`; with the radio off there is nothing to starve the motion, and
adding untested concurrency and a mailbox for a feature that is not compiled in
is the worse trade. Doing it properly is what turning the radio back on costs.

## Esp32Droid becomes a pack

It was a **bare `.ino`** — no `Config.h`, no `sequences.h`, no library copies —
leaning on MaestroPCA being installed, and per §7 nothing supplies MaestroPCA
from Mike's `libraries\` any more. **It could not have compiled on his machine
at all.** It now carries its own `Config.h` (six sections, every knob with the
reason beside it), a starter `sequences.h`, six byte-checked library copies
(`MpcaEsp32.h` as well, which only the two sketches that include it carry) and a
README that says in as many words that it has not met silicon. `make-packs.sh`
grew a third pack and a per-pack extras field; the release attaches
`Esp32Droid.zip`.

Two ways to wire it wrong are **compile errors** now rather than runtime
warnings nobody reads on a droid with no monitor attached: a table above 16
channels on direct pins, in both `Esp32Droid` and the bench console's
`BT_LEDC`. Both asserted to FIRE — a guard that has stopped working looks
exactly like a guard that is not needed.

## Three guards that were not catching what they were written for

1. **The angled-include check greps three header names** —
   `MaestroPCA|MaestroLink|MpcaScan` — and had never heard of `MpcaEsp32.h`.
   **Both** ESP sketches were including it with `<angles>` the whole time, in
   front of a green suite. This is trap §7.2, still live, three weeks after it
   cost an evening.
2. **`BT_LEDC` had no compile check of any kind.** `run.sh` said "on BOTH back
   ends" and meant `BT_MAESTRO` and `BT_PCA`; the third was the one carrying the
   angled include.
3. **`compile_esp32.cpp` named the `.ino` by a relative path.** A *quoted*
   include searches the including file's own directory first, so the sketch's
   `#include "Config.h"` resolved against the real folder and every `-I` at a
   modified **copy** was silently ignored — three variants of `Config.h` all
   compiled the same original and all "passed". Found only because a new
   `#error` was asserted to fire and did not. It takes `ESP32_INO` now, the way
   the bench console takes `BENCH_INO`.

Also: `shim/Wire.h` had no two-argument `begin()`, which is how an ESP32 names
its SDA/SCL — so `Esp32Droid`'s **PCA9685 route had never been host-compiled
either**. It has now.

**249 assertions, up from 203.** MaestroPCA 0.9.0.

**Still open: the radio.** Wanting the phone page back means the pinned
FreeRTOS task and a command mailbox, not flipping `ESP_WIFI` to 1.

### 2026-08-21 - v1.67.1: exit code 126, and the list view that said it passed

The v1.67.0 release workflow failed, and the whole of what the run page said
about why was:

    Process completed with exit code 126

126 is "found the file, could not execute it". `run.sh` called
`../../packs/make-packs.sh` directly, and that file had gone into the index as
**100644** — it was written through the file bridge rather than created in the
working tree, and nothing in the commit path notices a missing mode bit. So the
release attached none of its seven files and the tag stood with no release
behind it.

Fixed twice, deliberately. `git update-index --chmod=+x` sets the bit, and
`run.sh` now calls it as `bash ../../packs/make-packs.sh` so losing the bit
again cannot matter. That is not caution for its own sake — the executable bit
is **absent on a Windows clone with `core.filemode false`, absent from a
downloaded source zip, and was absent from the commit that introduced the
line**. Proven by stripping the bit and running the suite, which passes.

#### The near-miss, which is the more useful half

GitHub's Actions list page and the release workflow's own list page **both
rendered that run as succeeded.** Read either one and the job was done.

What gave it away was going and looking at the thing itself:
`releases/expanded_assets/v1.67.0` showed **two** entries — the source zip and
tarball that GitHub writes for any bare tag — and not one of the seven files the
workflow attaches. Only then did the run page admit to 126.

**A summary view is not the artefact.** This project has now been bitten by that
shape three times: a tracked build that had been stale for four versions, a
`PCA-Studio.html` whose own smoke test passed against an out-of-date copy for
three releases, and now a green tick over a release with nothing in it. Check
the output, not the report about the output.

### 2026-08-21 - v1.67.0: the sketches ship as packs, and one file is the config

Mike: *"We need to simplify this for both - can we create a pack for each that
others can run with little config or multiple files to download… + simple
instructions that guide the user step by step"*, and then the part that decided
the shape of all of it: *"make sure they are maintained moving forwards"*.

Until now, somebody who wanted to wire real hardware had to clone the
repository, work out which of five sketch folders to open, discover for
themselves that anything under `libraries\` is scanned and compiled twice, and
then find the settings scattered down a 700-line `.ino`. The path existed and
nobody could be handed it.

**Now: one zip, unzipped into the sketchbook, `Config.h` edited, upload.** One
library from Library Manager and nothing else to download.

#### Config.h, in both sketches

Every knob a builder touches is in one file, in numbered sections, each with the
reason beside it and a default that already works — link baud, console baud,
oscillator trim, watchdog, back end, channel table. The sketches wrap their own
defines in `#ifndef` so `Config.h` wins.

That last sentence is the kind of claim this project has been wrong about
before, so it is not a claim: the build is **preprocessed with altered values**
and each one is checked for where it lands. `LINK_BAUD` reaches `link.begin()`,
`OSC_HZ` reaches `maestro.begin()`, and so on.

#### The channel table is COUNTED, not declared

`BENCH_CHANNEL_LIST` is a list of `X( "name", min, max )` lines and
`MAESTRO_CHANNELS` is `sizeof(CHAN) / sizeof(CHAN[0])`.

The old arrangement had a hand-typed `18` beside 18 initialisers. Raising one
without the other — which is exactly what somebody with a 48-channel
MaestroReplacement would do — left rows whose `name` was a **null pointer**, and
this console prints channel names. Adding a channel is now one line and nothing
else, asserted by adding a nineteenth and compiling.

#### The packs are GENERATED, never committed

`arduino/packs/make-packs.sh` zips the sketch folders themselves. A zip in git
would go stale the first time somebody fixed a bug in a sketch, and **nothing
would say so** — which is the same failure mode as the tracked build in
`.gitignore`, and as `PCA-Studio.html` sitting three releases out of date.

Its manifest is **explicit rather than a glob**. A working folder collects
scratch — `sequencesold.h` had been sitting beside the sketch for four days —
and a glob ships it to strangers. Name what goes in; anything else stays behind.

It refuses to write anything at all if a library copy has drifted from `src`,
`Config.h` is missing, the sketch has stopped `#include`-ing it, or one of our
includes went `<angled>`. All four guards were proven to fire before being
trusted.

#### The firmware harness runs in CI, which it never has

This is what "maintained moving forwards" had to mean. `test.yml` gains a
`firmware` job beside the browser suites: it clones Pololu's library and runs
`arduino/MaestroPCA/test/run.sh`, which now also builds the packs. A pack that
would ship broken fails on the push rather than on a stranger's bench.

`release.yml` runs the same script and attaches
`R2_Bench_Console.zip` and `MaestroReplacement.zip` beside the simulator, so
`releases/latest/download/` resolves for both. The README links them under the
simulator download.

#### R2_Bench_Console gets its first compile check ever

`compile_bench_console.cpp`, against **Pololu's real library** rather than a
stand-in for it — taking anything less would prove nothing about the real build,
since `MiniMaestro` takes a `Stream&`.

Both back ends are compiled, and the second one is reached by **copying the
sketch folder and editing `BENCH_TARGET` in the copy's `Config.h`** — literally
the edit a user makes, rather than a `-D` flag no reader will ever type.

It is worth remembering which sketch this is. It is the one found **missing
`MpcaScan.h` entirely**, and the one left on `BT_PCA` — a back end that opens no
serial port at all — while Mike had two Megas wired 18↔19 and was looking for a
comms fault. Neither would have been caught by a compile alone; the guards
beside it catch those. This catches everything after them.

Estate: **the Arduino suite now covers both sketches on all three back-end
branches, plus the two packs.**

### 2026-08-21 - v1.66.4: the generated header includes its library in quotes

Mike, flashing the droid sketch, third failure in a row and the first one that
was not about where a file sits:

    sequences.h:22:10: fatal error: MaestroPCA.h: No such file or directory
     #include <MaestroPCA.h>

`examples/MaestroReplacement/` now carries its own copy of the library, and an
**angled include is only ever found on the LIBRARY path**. So a generated header
that writes `<MaestroPCA.h>` cannot be compiled from that folder at all — the
IDE says the file does not exist with the file sitting two lines away in the
same directory. Quoted searches the including file's own folder FIRST and the
library path afterwards, so it works both ways: sketch-local copy if there is
one, installed library if there is not.

The `.ino` was fixed for exactly this an hour earlier. **`sequences.h` writes
its own include line**, in `pca-gen.js`, and nobody had ever read it. `servos.h`
had the same line in `setup-hw.js` and is fixed with it.

One assertion in `tests/pcaseq.test.js` (70 from 69), on the STRING the writer
emits, because that is the only place this mistake can live. Estate: **4604
assertions, both builds, plus PCA Studio's 86 and the Arduino suite's 176.**

#### The pattern, now that it has happened three times in one evening

Angled includes, a renamed library that was still scanned, and a sketch unzipped
into `libraries\` — every one of them was me reasoning about the Arduino
toolchain instead of testing it, and every one was caught in seconds by Mike's
compiler. **The container proves the CODE compiles; it says nothing about how
the IDE resolves libraries.** Anything about include style, library discovery or
folder layout is a guess until it has been through the real IDE, and should be
written down as a guess when it cannot be.

Mike's own `sequences.h` had the same line — his 48-channel v1.66.3 export. It
was corrected in place, one line, `<>` → `""`, with the diff shown; nothing else
in the file was touched, on his instruction and on principle. Regenerating from
this version writes it correctly.

### 2026-08-21 — the droid sketch carries its own copy of the library

Mike: *"can you put all the files I need to compile the maestro sketch into
`arduino/MaestroPCA/examples/MaestroReplacement` — do not overwrite the
sequences file"*.

`MaestroReplacement.ino` asks for six headers. Three are somebody else's —
`Wire` and `SoftwareSerial` from the board core, `Adafruit_PWMServoDriver` from
Library Manager — and three are ours: `MpcaScan.h`, `MaestroPCA.h` and
`MaestroLink.h`. Until now those three meant installing `arduino/MaestroPCA/`
as a ZIP library before the sketch that ends up in the droid would build at all.

The folder now holds copies of all five of our files (the two headers with
implementations bring their `.cpp` with them).

**And the includes had to change from `<angled>` to `"quoted"`**, which is the
part I got wrong first and Mike's compiler corrected within the minute:

    MaestroReplacement.ino:41:10: fatal error: MpcaScan.h: No such file or directory
     #include <MpcaScan.h>

A sketch folder is **not** on the compiler's include path for an angled
include — the file can be sitting directly beside the `.ino` and it will still
not be found. A QUOTED include searches the including file's own directory
first and the library path afterwards, so it finds the copies in this folder
**and** still finds the library for anyone who deletes them and installs
`arduino/MaestroPCA/` properly. Both ways work; angled only ever worked the
second way, which is why nobody noticed while the library was the only route.

#### And you must have ONE of the two, never both

The second thing Mike's compiler corrected, a minute after the first. With
`MaestroPCA` ALSO installed in his `libraries` folder, the build reached the
linker and produced pages of *multiple definition of `MaestroPCA::…`*, ending
in *"type 'struct MaestroPCA' itself violates the C++ One Definition Rule"*.

**Quoting the includes does not prevent this, and the reason is worth writing
down**: the COMPILER finds the header next door, but the BUILDER separately
resolves `MaestroPCA.h` against the library index, finds the installed library
and compiles its `.cpp` files too. Two copies of every symbol reach the linker.
No include-style trick avoids it — the choice is genuinely exclusive, and the
README now says so instead of the "keeping both is fine" I had written.

The log also showed his installed library was **stale**: it put
`class MaestroPCA` at line 111 where ours has it at 243. So the route he had
before this was compiling old code, silently, and would have gone on doing so.
The README tells you how to check.

So: move the installed library aside, install Adafruit's driver, press Verify.

`MpcaEsp32.h` is deliberately NOT copied: this sketch does not include it, and
an unused copy is one more thing to drift.

#### A copy is a liability, so it is not left as a promise

This project has paid for that once already — v1.53.0 gave PCA_Bridge its own
inlined bus scan, and v1.53.1 had to prove the two agreed rather than assert it
in a comment. So `test/run.sh` gains two steps:

- every one of the five must be **byte-identical** to `../src`, and when one is
  not it names the file and prints the single `cp` that fixes it;
- the sketch is compiled **with `../src` deliberately off the include path**,
  which is the only way to know the folder is actually self-sufficient rather
  than quietly leaning on the library it is supposed to replace.

Both run on Mike's own disk as well as in the container: five OK, and
*"compiles, links and boots onto 3 of 8 boards"* from the sketch folder alone.

**Edit the library, never the copy.** The guard will catch it either way, but a
drifted copy inside the sketch that goes into the droid is the worst place in
this repository for one to hide.

#### `sequences.h` was not touched, and will not be

It is generated — sized to the build, carrying the builder's own endpoints and
routines — and Mike's is 62 KB of his. It was left exactly as it was (mtime and
md5 both unchanged), as was the `sequencesold.h` he had put beside it. The new
`README.md` in the folder says so too, along with what to install and what to
delete if you would rather use the library properly.

### 2026-08-21 - v1.66.3: three boards, and the step that said two

Mike, with three PCA9685s set on the servo hardware step: *"I'm still not able
to see all servos when I have three pca's in the hardware setup. I was able to
go from 8 and add additional banks but capped at 32. Lets make sure all are
viewable without extra steps."*

**The channel table was 48 rows the whole time.** So was the servo grid — 48
tiles. The number he was reading was a SENTENCE, and the sentence was wrong.

#### `topo.pca` is the shape's, and the count is an answer

`p1x2` declares `pca: 2` because that is the picture it draws: a controller and
a pair of expanders behind it. Since v1.54.0 the quantity has been an ANSWER
instead — `b.pcaBoards`, 1 to 8, on any shape flagged `counted` — precisely
because eight expanders would otherwise have been eight near-identical cards.

v1.54.0 updated the derivation (`buildNormaliseServos`) and the board-picture
strip (`wizBoardPics`), and missed the two places that render the line a person
actually reads:

    wizard.js:901    const total = (topo.pca || 1) * …   → "2 × PCA9685 — 32 channels"
    hardware.js:738  const n     = (topo.pca || 1) * …   → "PCA9685 × 2"

Four sites, two right and two wrong, which is how this survived three releases
of work on exactly this area. So there is now **one function**, and all four go
through it — `buildPcaTotal()`, with `buildPcaPerLink()` underneath because the
two are genuinely different quantities and conflating them is what makes this
get rewritten: a `p2s` or `p1s` splits its expanders across two links, so what
sizes ONE co-processor's answer is not what tells the user how many boards the
droid has. Anything showing a person a number of BOARDS or of CHANNELS wants
the total.

Measured after: 1 → "1 × PCA9685 — 16 channels", 3 → 48, 8 → 128, with the row
count and the build summary agreeing at every step.

#### "Without extra steps" — the other half

On a build that already speaks PCA9685, changing the number of expanders grows
the channel table **there and then**: measured 32 rows to 48, with every name,
endpoint and mapping untouched, because growing only ever fills holes
(`HW.ensure`, and `HW.trim()` is a deliberate no-op).

It does NOT follow when the loaded table is a MAESTRO one — a dome starter, or
somebody's imported `.mstr` — and that is right: a change of KIND is not a
change of size, and v1.65.0 made it an offer rather than a side effect for good
reasons. The problem was only ever where the offer lived. It sat in the bench,
three screens from the question that caused it, so the step where you type
"three" told you 32 and said nothing about the 24 rows you actually had.

`wizServoTableGap()` puts it on that step: both numbers named, and a button that
does exactly what the bench's does. Proved end to end — 24 rows and a bench
answer of three boards produces *"channel table still has 24 rows, not 48"* and
*"add the missing 24 rows"*; clicking it lands 48 rows with `MIKES ROW` still
carrying its name, its 4321 endpoint and its `pie0` mapping, and the new rows
arriving as **Input** rather than silently driving something.

#### The lesson, for the third time in this area

HANDOVER §7 already says it after v1.65.0: *when somebody sends a screenshot,
find the line that renders that exact string and work outwards from it.* This
release is that same finding again, and the reason it keeps happening is that
the model has been right every time. `HW.count()` was 48. `MSTR.channels.length`
was 48. The servo grid drew 48 tiles. Three releases went into reconciling
banners, builds and benches — all real bugs — while the sentence on screen was
computed by a fourth file from a number that stopped being the answer in
v1.54.0. **A derivation that is duplicated is a derivation that will be fixed in
one place.**

Nine assertions in `tests/build-config.test.js` (327 from 318), asserting the
rendered STRING rather than the model behind it — the model was never wrong,
which is exactly why this was missed. **Estate: 4602 assertions, both builds,
plus PCA Studio's 86 and the Arduino suite's 176.**

### 2026-08-21 - v1.66.2: two boards, two doors

Mike, on v1.66.1's Still Open: *"yeah we should make a change so the maestros
work as expected - I guess they diverge on out put but thats ok"*. They do
diverge, completely, and that is the answer rather than a compromise.

#### The two boards are opposites, and were being driven the same way

**PCA_Bridge has no kinematics at all.** A frame arrives, it computes board and
pin and calls `setPWM`. Nothing tracks a position; nothing steps. So the right
traffic is the engine's 100 Hz stream — 41 stepped positions for one full-throw
move, which is what v1.66.1 made carry the frame's timing.

**A Maestro is the exact opposite.** Speed and acceleration are its own, and a
Set Target *starts a ramp it runs on the board* whether or not anything else
arrives. Streaming 41 positions at it means every one of them starts a fresh
ramp that the next interrupts 10 ms later — the board's own limiter fighting
the browser's, which is precisely the "board is also applying its own speed and
acceleration on top of the sim's" line that has been in the Serial pane since
v1.56.0 with a button to defeat it.

So the wire now looks completely different depending on who is listening:

    paced (Maestro)    0x87 00 5e 00     Set Speed  ch0 = 94
                       0x84 00 40 3e     Set Target ch0 = 8000
                       …and then silence

    streamed (bridge)  0x84 00 2d 1f · 0x84 00 46 1f · 0x84 00 6b 1f · …
                       48 of them

Two commands against forty-eight, for the same move. `serialPaces()` is the one
question, `serialWrite()` stays the STREAM and the new `serialMove()` is the
PACED door; `mstrQuiet` still picks between them, because "let the sim shape the
moves" means zeroing the board and streaming, which is the bridge case again.

#### What it costs, said out loud

**Sending the speed is not optional and not free.** A Maestro ramps at whatever
speed it has STORED — Mike's dome is tuned to 80, a 1.1 s throw — so a 500 ms
frame overruns and a routine drifts further behind with every brick. Writing the
speed is the only way the authored timing can land on that board.

It is a RUNTIME write, so a power cycle brings his own numbers back, and the
Serial pane says so where the old copy used to describe the double-limiting.
**Pololu have no Get Speed**, so it cannot be read first and restored after;
that asymmetry is why this is announced rather than silent. The board's
**acceleration is left alone** and still shapes the ends of every move, which is
also said.

With no frame speed — a bench dial, a group action, a test button — the channel
table's own speed goes down instead. That leaves the board in a state the
simulator can predict rather than whatever the last routine happened to need,
and it is the same self-healing rule `HW.drive()` follows for the bridge.

#### Two details that are easy to get wrong

**An OFF is an event, not a position.** `serialWrite(ch, null)` still goes
through on a paced board: "stop pulsing" is not part of a ramp, and nothing else
would ever send it. The suppression is on positions only.

**Every manual writer already funnels through `HW.drive()`** — the dial, the
wizard's test sweep, the Config tab's open/close, the all-off. Checked before
suppressing the stream, because a path that reached the wire only through the
engine would have gone silent on a Maestro with no error anywhere.

#### Tests

Six assertions in `tests/ramp-step.test.js` (29 from 23) decoding the actual
bytes off both doors, and three in `tests/maestro-link.test.js` (51 from 48).
Its "what goes down the wire" block asserted the streamed shape, so it now ASKS
for it (`MST.quiet = true`) and covers the paced door beside it — §7, fifth
time. **Estate: 4584 assertions, both builds, plus PCA Studio's 86 and the
Arduino suite's 176.**

#### Still open

Nothing on either live-drive path. The `.mstr` **script** generator still emits
bare `set_target` sequences, so a routine compiled into a script and run from
the board's own button will use the channel's stored speed rather than the
brick's — the same gap this release closed for live drive, one layer further
down, and it needs `genScript()` to emit Pololu's `speed` command beside each
target.

### 2026-08-21 - v1.66.1: the wire carries the authored timing

Mike, reading v1.66.0's "still open": *"can we fix this - PCA_Bridge's
live-drive protocol has no speed command at all?"*

**We can, and not the way that sentence implies. The sentence was wrong.**

#### PCA_Bridge does not need a speed command, and should not have one

`PCA_Bridge.ino` has no kinematics in it at all. A frame arrives, it computes
`board = ch >> 4, pin = ch & 15` and calls `setPWM(pin, 0, payload)`. There is
no position, no velocity, no stepping loop — the sketch's own header says it in
the first line: *"The BROWSER runs …"*. Adding a speed command would mean
adding an entire trapezoid engine to the one sketch whose whole identity is
that it does not have one, and re-flashing every board in the field to get it.

It would also be solving a problem that does not exist, because **the browser
already streams the interpolated curve.** `pcaStepChannel()` calls `pcaFire()`
on every 10 ms tick, `pcaFire` calls `E.onWrite`, and `hw-host.js` wires
`onWrite` straight to `serialWrite`. The hw clock runs whenever a port is open.
Measured: **one frame target goes down the wire as 41 stepped positions**,
4013 · 4038 · 4075 · 4125 · 4188 … 7952 · 7988 · 8000 — a real acceleration
curve, at 100 Hz, on the boards Mike already has flashed.

So the protocol was never the gap. Writing "it needs a protocol bump" in
v1.66.0's Still Open was a guess made from the wire format's shape rather than
from reading what sits behind it, and it would have cost a firmware release.

#### The actual gap, which is one argument wide

The bench engine paced those 41 writes at the **channel's** speed, because
`HW.drive(ch, qus)` never had anywhere to put the **frame's**. So v1.66.0's
per-frame speeds reached the sim and the flashed board but not the live wire: a
500 ms ramp step was crossed at whatever the bench was set to — 410 ms on a
stock 120/100 channel — and then stood still for the rest of the frame. Close
enough to look right on screen, and not what the sequencer authored.

`HW.drive(ch, qus, speed)` now takes it, `liveWrite(c, qus, speed)` passes it,
and `applyFrameTargets(targets, speeds)` carries it from the frame — through
all five players that had a frame in hand: the sequence clock, the cue player,
the puppet rig and the music track. Measured on the wire:

    no frame speed   41 writes   410 ms   (the channel's own, unchanged)
    paced for 500ms  48 writes   480 ms
    paced for 900ms  89 writes   890 ms

It follows the number rather than a constant, which is the property worth
holding.

**A falsy speed RESTORES the channel table's own**, and `HW.releaseDriveSpeeds()`
runs on disarm — the same rule `releaseSeqSpeeds()` follows in the firmware and
`pcaReleaseSpeeds()` in the JS twin. A routine's speeds belong to the routine;
without this the bench dial and the pad would be left running at whatever pace
the last frame of the last thing you played happened to need.

#### What is genuinely still open

Nothing on the bridge. A real Pololu Maestro has its own kinematics and is
therefore the opposite case — it interpolates on the board, so it wants Set
Speed (0x87) rather than a stream, and `mstrSetTarget()` still sends bare
targets. That is a small, separate job on the Maestro path, and unlike the
bridge it really is a protocol question.

Five assertions in `tests/ramp-step.test.js` (23 from 18). Estate: **4572
assertions, both builds, plus PCA Studio's 86 and the Arduino suite's 176.**

### 2026-08-21 - v1.66.0: a ramp is a move, not a staircase

Mike, on real hardware, for the THIRD time in four days: *"the servos still are
jerky - way worse than it was so somethings changed in that area - can you do a
diff and see if yo can spot it"*. Then, once shown what the board actually does
between frames: *"would setting the frame rate before building a sequence help
- maybe default to .5 sec for every frame"*, and *"allow the user to change the
step size - and could we do the maths to smooth it out"*.

#### The comment this release deletes was wrong, and it was load-bearing

`blocks.js` has drawn every ramp as a staircase ~120 ms apart since v1.12.0,
on the stated grounds that *"the board's own acceleration rounds the corners
anyway"*. It does not. Both `pcaStepChannel()` and the AVR build cap velocity at

    vstop = 128 * isqrt32(accel * distance_remaining) + 256

which is a **deceleration-to-arrival** constraint: the horn is planned to reach
every target AT REST. An intermediate waypoint is not a rounded corner, it is a
full stop. Measured on the engine, full throw over a second at accel 100 — the
velocity per 10 ms tick, first three frames:

    staircase   0 0 0 0 0 0 0 0 0 0 0 0 | 12 25 37 50 62 75 77 64 49 34 0 0 | …
    one target  12 25 37 50 62 75 87 100 112 120 120 120 … 119 105 92

Twenty-seven per cent of ticks stationary, and it never reaches the 120 it is
allowed. That is the noise, and it is why v1.62.0's speed default helped so
little: an unlimited channel bangs into each waypoint, a limited one stops dead
at each waypoint, and neither is a ramp.

#### Two halves of one lever, and the obvious half does not work alone

    step     frames   CV without a per-frame speed   CV with one
    100 ms     10                0.56                   0.55
    250 ms      4                1.00                   0.36
    500 ms      2                1.33                   0.24
    750 ms +    1                1.68                   0.13

Coarsening the step ALONE is monotonically worse — fewer waypoints means bigger
jumps, each still chased flat out, and at 1 s the move finishes in 320 ms of a
1000 ms ramp and then waits. Pacing each move makes it monotonically better.
Handing each 120 ms STEP its own speed — the cheap fix, and the one to reach for
first — was measured too and does not work: `vstop` decelerates into every
waypoint whatever pace it is given. The waypoint is the stutter.

So: **the step is a per-routine setting, and every frame that moves a channel
carries a speed sized to fill it.**

#### `chanSpeedForMs()` — travel.js, the inverse of `chanTravelMs()`

Solving the trapezoid for vmax: `T = v/a + d/v` → `v² − a·T·v + a·d = 0`, take
the SMALLER root; the larger one is the branch where the ramps alone outlast the
move. A negative discriminant is the accel-limited case and returns the
triangular peak `sqrt(a·d)`, with `blockMinTravelMs()` still the thing that stops
a brick asking for it. Checked against the forward model: 4000 quarter-µs in
430 ms → speed 120 → 429 ms, which is v1.62.0's own published figure.

The timing survives at every step size — worst error 0.1 % at 250 and 500 ms,
0.8 % at 750 ms. That is what makes the setting safe to expose: whatever Mike
picks, "opens in 800 ms" still means 800 ms.

#### 500 ms is the default, and 750 deliberately is not

750 and up collapses every ramp to a single move, which is smoothest — but a
Control Center `<Sequence>` is targets and durations with nowhere to put a
speed, so a single-move ramp opened in Pololu's own software is the 2026-08-12
bug back again: three seconds of the shut pose and then a snap. 500 ms is the
largest step that still leaves a staircase in an exported file for a long ramp,
and `round(ms/step)` already gives ONE move for any ramp under 750 ms — which is
most dome panel bricks. The smooth case where it is free, the safe case where it
is not.

**Legacy is 120.** A routine carries its own step (`seq.stepMs`, packed with its
bricks as `r2sim:blocks` v2), so every routine written before this release
recompiles to the frames it already had, byte for byte. That is why the step is
per-routine rather than a global preference, and it is why `roundtrip` and
`mstr-share` stayed green: **targets and durations are untouched by any of this,
the speeds ride alongside them.**

#### The Advanced control

A **Ramp step** select beside the Advanced switch, 0.25 / 0.5 / 0.75 / 1 s,
visible only on a ROUTINE (a frame list has no ramps to draw) and only with
Advanced on. A routine already using the legacy 120 shows it as an extra
"0.12 s (old)" entry — the truth about itself, without being offered as a
choice. Below 200 ms the per-frame speed stops buying anything, which is why the
range is a select rather than a number box. Changing it is one undoable gesture,
and `blockHistCapture()` now snapshots `{blocks, stepMs}` — an undo that put the
bricks back and left the new step would restore a routine that never existed.

#### The firmware carries it too

`MPCA_SEQ_SPEEDS` (0x10) doubles a sequence's stride to `1 + 2*channels`:
duration, targets, then speeds. A speed of 0 means "leave that channel's own
setting alone" — the same do-nothing convention as a 0 target — and
`MPCA_SPEED_FREE` (0xFFFF) is how a frame says "unlimited", which 0 cannot say
because 0 is taken. A frame's speed belongs to the ROUTINE, so
`releaseSeqSpeeds()` puts the channel table's value back at all five places a
track lets go of its channels; without it a finished routine would leave the
pad, a group action and every later move running at whatever pace its last frame
happened to need.

**The dangerous direction is a NEW header against an OLD library**, and it is
silent — the old code walks the rows at the single stride, reads speeds as
targets and drives channels to numbers nobody asked for, with no runtime tell.
So `pca-gen.js` emits a `#ifndef MPCA_SEQ_SPEEDS / #error` guard, but only into
a header that actually uses speeds: a header without them is byte-identical to
what this app has always written and works against any version.

#### Two things found on the way, both mine, both caught by the suites

**The stride has a reader as well as a writer.** `pcaHeaderParse()` walked rows
at `1 + channels` regardless. That does not fail, it silently yields twice as
many frames of nonsense — 35 frames read back as 68. Taught the flag, and the
pre-scan of `MPCA_SEQ_TABLE` has to happen BEFORE the rows are walked.

**The comment after the brace IS the routine's name.** `pcaCName()` strips the
spaces out of the symbol, so that comment is the only place the real name
survives, and `pcaHeaderParse()` reads it back as the name. Adding
"— duration, targets, then speeds" to it renamed every imported routine and cost
it its bricks. Nothing else may go in that comment.

#### And one that was NOT mine

`pca-studio/PCA-Studio.html` is a TRACKED generated file, deliberately, so that
`./test.sh` fails loudly on a stale one rather than silently. It was stale.
Rebuilding it on the unmodified v1.65.0 tree took `pca-studio/smoke.test.js`
from 86 passed to 85 passed, 1 FAILED: the header assertion still required
`0x41`, and **v1.63.0 removed the `board N -> I2C address` lines on purpose** —
the sketches scan for their boards now, so a header naming addresses the boot
scan may never use is worse than one naming none. The assertion now checks the
board-to-CHANNEL mapping, which is what the header actually promises. The check
that exists to catch staleness had been passing against an out-of-date artifact
for three releases.

#### Tests

`tests/ramp-step.test.js` — 18 assertions, red on the pristine tree — plus 7 new
ones in `arduino/MaestroPCA/test/features_test.cpp` (47 from 40). The four suites
that went red were all FIXTURES relying on the old default, and each now ASKS for
the fine step out loud (`seq.stepMs = BLK_RAMP_STEP_MS`) rather than inheriting
one: the 2026-08-12 guard, the 2.6 explode block that wants "many short
ramp-stepped frames", and blocks-trace's import fixture. No assertion was
weakened — HANDOVER §7, for the fourth time.

**Estate: 4562 assertions, both builds, plus PCA Studio's 86 and the Arduino
suite's 176. All green.**

#### Still open

**PCA_Bridge's live-drive wire protocol has no speed command at all** — three
bytes, `0x80 | channel` then the payload, with 126 and 127 spent on the
oscillator and the servo rate. So live drive to a bridge still sends bare
targets and cannot pace them; it needs a protocol bump. A real Maestro is fine —
Set Speed is 0x87 and the port already speaks it. And the 3D model still eases
at the global `CFG.servoSpeed` rather than the channel's own, measured at a fixed
1879 ms per full travel whatever the frame asks for; harmless while the frames
do the shaping, and the thing to close if the step ever goes coarser than 1 s.

### 2026-08-21 - v1.65.0: "still cant see servos 24 and above"

Mike, with a screenshot of **this app's own wizard**: *Set up your servo
hardware*, step 2 ticked to three PCA9685s, his bridge reporting
0x40/0x48/0x50 — and under the channel table, in small grey type:

> `0 channels in use of 24`

Twenty-four. Not 32, not 48. A **Mini Maestro 24's** worth of rows, because
that is what the droid's BUILD still said, while the bench two steps up was
set up for three expanders and the hardware was driving all 48.

Three releases chasing this and each one fixed a real thing that was not it:
v1.63.0 read the boot banner, v1.64.0 compared the banner with the build. Both
were looking at the wire. **The number Mike was staring at came from neither**
— it is `HW.setupCount()`, which is the length of the channel table, which is
the build's.

#### The hole was one `&&`

```js
if(hw && boardIsPca(MSTR.board) && MSTR.board !== want){ …say so… }
```

`HW.applied()`'s reconcile — the function whose entire job is "the wizard's
board count and the BUILD can disagree, say so" — only spoke when the build
was **already** a PCA build with the wrong COUNT. A build answering "Mini
Maestro 24", the wrong KIND, fell straight through it. The case that most
needed telling was the one case written to be silent.

Both shapes get a line now, worded differently because the fix differs.

#### And the line he was reading now says both numbers

`HW.wantCount()` is the bench's own answer in channels; `HW.short()` is the
gap or null. The count line stops at the table's number only when there is no
gap. When there is:

> 20 channels in use of 24 — **step 2 says 3 PCA9685s, which is 48 channels.
> The droid's build only gives this table 24 rows, so channels 24-47 have
> nowhere to be configured.** `[add the missing 24 rows]`

#### What the button is allowed to do, and what it is not

`setupAdoptBoards()` does **not** pad the table behind the build's back. The
doctrine is written into `hw-host.js` and stands: *"the BUILD decides how many
channels this droid has — not an answer typed into step 2 of a wizard."* So it
changes the **build's servo answer**, and the table follows the way it always
has. That is exactly why it is a button and not a side effect of opening the
page.

**GROW ONLY**, the same rule `HW.trim()` refuses to break: `HW.short()` is
null unless the bench wants MORE, so asking for fewer boards can never delete
a row. A board off the bus, or a number typed down by accident, must not cost
somebody an endpoint they measured on a real linkage. Asserted, along with a
calibrated row surviving the grow with its name, ends, part mapping and speed
intact.

It sets the ANSWER (`domeServo: mpca48`), not the shape — `hardware.js` reads
a direct board answer back into the topology, so `servoTopo` alone gets undone.
That cost an hour in v1.64.0's fixtures and is now written down twice.

Nine assertions in `tests/setup-bench.test.js`, all nine red on v1.64.0.

### 2026-08-21 - v1.64.0: the board has more channels than the build

v1.63.0 read the boot banner and said so when the FIRMWARE was behind the
build. Mike then pasted what his board actually prints:

```
--- PCA bridge ---
  0x40  channels 0-15   FOUND
  0x48  channels 16-31   FOUND
  0x50  channels 32-47   FOUND
```

All three bound. `PCA_Bridge` has no `sequences.h` — it binds everything the
scan finds, up to eight — so nothing needed re-flashing and every one of the
48 channels was live and pulsing. **The BUILD still said two expanders**, so
the channel table had 32 rows and the third board had nowhere to be named or
calibrated. That is the whole of *"I was only able to configure the first
two"*, and **v1.63.0 was silent on it**, because it only checked one
direction.

Backwards, on reflection. Nobody bolts a board on and then tells the app they
have fewer. **Adding hardware and not telling the build is the thing people
actually do**, and it is now the case that gets the loudest answer:

> The board is driving **48 channels** across **3 PCA9685s** (0x40, 0x48,
> 0x50); this build has **32**. Channels 32-47 are wired and pulsing, but
> there is no row to name or calibrate them on. `[use 3 expanders]`

#### What the button is allowed to do

`serialAdoptBoardCount()` GROWS the table and never shrinks it. That is the
same rule `HW.trim()` states and refuses to break: rows carry names, part
mappings and endpoints measured against real linkage, and *"the board only
answered at three addresses today"* is not a reason to delete row 40. A board
that drops off the bus — a loose SDA, a brown-out — must never cost somebody
their calibration. Asserted.

It is also **not offered at all** unless the build's shape carries a count
(`buildServoTopo().counted`). A Maestro build with a bridge plugged in for the
bench is not a build with expanders, and `p0` is the mod2026 pair at two fixed
addresses, which is not a count. Offering there would be offering to break
somebody's build.

The new rows arrive as **Input**, exactly as unnamed rows always have — an
unused channel does not pulse — so the log line says the next step out loud
rather than leaving sixteen inert rows and a satisfied-looking toast.

Nine assertions in `tests/hw.test.js`, all nine red on v1.63.0, including
Mike's banner verbatim with its jumpered 0x40/0x48/0x50 — because assuming
0x40/0x41/0x42 is the bug v1.53.0 existed to kill and a fixture that quietly
re-assumes it would let it back in.

#### The fixture trap, for the third time this week

The first version of these assertions set `buildSet('servoTopo','p1x2')` and
got `topo: m1` back. `hardware.js` reads a direct board ANSWER back into the
shape — deliberately, and it says so — so the `mini24` this suite sets in its
preamble put the topology straight back. Ask for the build by its answer
(`domeServo: 'mpca32'`), not by its shape.

### 2026-08-21 - v1.63.0: which boards is it actually driving?

Mike: *"I setup three pca's and I was only able to configure the first two -
all three where seen in the serial monitor."*

Both halves of that are true at the same time, and the board had already said
so in plain words — in the scrollback, phrased for somebody who already knew
what `MPCA_CHANNELS` was.

The **bus scan** (v1.53.0) finds every PCA9685 on the wire, which is why all
three showed up. What each one is FOR is a different question, answered by
`MPCA_CHANNELS` in the generated `sequences.h` — **and that is fixed when you
flash**. Generate the header on a two-board build, bolt on a third, and
MaestroReplacement prints exactly what happened:

```
  I2C: 3 PCA9685(s) on the bus
    board 0 = 0x40   channels 0-15
    board 1 = 0x41   channels 16-31
    board 2 = 0x45   spare - live drive only, no slots use it
  channels 32   slots 8
```

Two configured, three seen. Nothing was broken; nothing said what to do either.

#### The banner is parsed now, not skimmed

`SER.banner` was already being kept whole (4000 chars) and read for exactly one
fact: the channel width. `serialBoardReport()` reads the rest — how many are on
the bus, which are driven and at what addresses, which are spare, and how many
channels and slots the firmware was flashed with. Both sketches are covered,
because both print a board list in different words (MaestroReplacement's
`board N = 0xNN`, PCA_Bridge's `0xNN channels a-b FOUND`).

`serialBoardCheck()` then says the one sentence, on connect, in the Serial
pane's warning strip rather than the scrollback — **added** to whatever the
mode already said, never instead of it — and it carries a
**`generate sequences.h now`** button, because being sent to go and find the
Maestro tab is how a warning gets read and then ignored.

Three things it can say, and it never guesses: a board that is spare, a board
the sketch cannot drive at all (an un-reflashed v1 bridge), and a firmware
whose channel count is below what this build has. **An empty banner produces
no opinion at all** — a Maestro, a silent board or an older sketch is not a
report of zero boards.

#### And the generated header had been lying since v1.53.0

`pca-gen.js` still wrote `board 0 -> I2C address 0x40, board 1 -> 0x41…` into
every `sequences.h`. That stopped being true the moment the sketches started
FINDING their boards instead of assuming consecutive addresses — which was
Mike's own request: *"I and others may jumper them differently"*. A header that
names addresses the boot scan may never use is worse than one that names none,
because somebody wires to the comment. It now names the rule (ascending scanned
address, All Call excluded) and says out loud that `MPCA_CHANNELS` is fixed at
flash time.

Eleven assertions in `tests/hw.test.js`, all eleven red on v1.62.0, plus one
in `tests/pcaseq.test.js` — where the old assertion counted the header's
`board N -> I2C address` lines, and is now the guard that they are gone.

### 2026-08-21 - v1.62.0: the servos stop banging

Mike: *"the servos are sounding and looking jerky - more so than previously
can you check for any thng that might have changed"* — on **real hardware**,
audibly.

Measured first, three ways, and two of the three came back clean: no CPU
regression (a full frame costs 0.02–0.23 ms across v1.58/1.60/1.61), and the
actuator trajectories are constant-velocity ramps with no stalls in either
profile. The wire is fine too — `applyFrameTargets()` only runs on a frame
BOUNDARY, not every step, and `serialWrite()` already drops a repeat.

#### What it actually is, and it was written down in advance

`blocks.js`, on why a compiled ramp is a run of steps ~120 ms apart:

> *"125 ms apart is finer than a panel can be seen to step, **and the board's
> own acceleration rounds the corners anyway**."*

Every generated channel carried `speed:0, acceleration:0`. On a Maestro and
on the PCA bridge alike that means UNLIMITED. **There were no corners to
round.** The horn is commanded to a new position eight times a second and
slams flat out into each one — which on screen is a stepped panel and on a
real servo is a bang, eight times a second.

Faithful to a factory Maestro, and wrong here, because this app's own
compiler is built on the opposite assumption.

**Why it got worse**: v1.57.0's servo layout does both halves at once. It
REGENERATES the whole channel table (so a limited one becomes unlimited), and
its Ripple and Wave routines put frames 70 and 110 ms apart — faster than any
servo can track.

#### The limit, and whose numbers it is allowed to touch

`STARTER_SPEED = 120, STARTER_ACCEL = 100` in `maestro/starters.js`. In
Pololu's units (0J40; `travel.js` does the maths) that is a **429 ms**
endpoint-to-endpoint throw with **~96 ms of accelerating at each end** — the
corner-rounding the compiler already assumes, and about what a real dome pie
does. `HW.ensure()` uses the same pair, because the way an Off channel stops
being Off is somebody setting it to Servo in the bench.

**Only GENERATED channels.** A table you imported or measured is yours and is
never rewritten — the standing rule since v1.43.0. Those are COUNTED instead:
`liveUnlimited()` feeds the live-drive arm dialog, which now says *"N channels
have no speed limit — speed and acceleration are 0, so every step of a ramp is
chased flat out"* next to the unmeasured-endpoints warning it already carried.
0 is still one edit away in the bench's Speed column for anyone who wants it.

#### And the needles were running at a quarter speed

Separately, and mine: v1.60.0 put `svTick()` on the 0.06 s UI tick calling it
*"a readout, not a render"*. True of v1.59.0's side panel; false the moment
the gauges BECAME the model. Sixteen needle positions a second, where the 3D
rack they replaced drew at sixty. Measured at **ratio 0.26** — one tick per
four frames. It moves next to `renderer.render()`, which is what it stands in
for: ≤128 attribute writes, gated on `SV.shown` inside `svTick()`, and while
it is shown the renderer above is skipped entirely.

Eight assertions in `tests/servos.test.js`, all eight red on v1.61.0.

#### Two things found on the way, both fixed here

**`mstrQuiet(false)` said "the board's own stored speed and acceleration are
back"** and did nothing of the kind: it writes what the SIM's channel table
says. On a generated table that was 0 — so the message announced a restore
while leaving every channel on a hand-tuned Maestro unlimited until the next
power cycle. It now says what it does.

**The copy said "your imported speed and acceleration"** in four places (the
Slowest field and its title, the brick hint, the builder's report). Speed is
not an imported-only idea any more; it is the channel's, however it got there.

#### Still open

The 3D model does NOT honour a channel's speed/acceleration — it eases at
`maestroRate` (Maestro profiles) or `servoSpeed` (PCA profiles), both global.
So the droid on screen still glides where the board ramps. Worth closing, and
`chanTravelMs()` already has the model to do it with.

### 2026-08-21 - v1.61.0: the sequencer moves the droid on a PCA9685 build

Mike: *"somethings broken when im in the sequncer and have r2 set as the model
I dont see any of teh panels moving."*

He is right, it was broken, and it had been broken for longer than this week —
**on `mod2026` only, and it is the second half of a bug whose first half was
fixed in v1.39.3.** That release found the sequence CLOCK shut behind
`if(PROFILE.hasMaestro)` and opened it, because v1.27.0 had already opened the
desk to PCA9685 builds — *"every build"*, `buildCanSequence()`. The clock then
ran, frames advanced, `liveWrite()` fired, and the droid still did not move,
because the ACTUATOR path was **also** shut and nobody looked past the clock.

On a `hasServos` profile the PCA9685 layer OWNS its 21 actuators: `ACT` is
overwritten from `servoTravel()` every frame. So `applyFrameTargets()` wrote
`ACT_T[c.act]`, and one line later `syncActuators()` stamped it flat. A dome
routine ran its whole length with the droid sitting perfectly still.

#### Why it surfaced this week and not in April

v1.59.0's `CHPOS` is profile-blind, so on the **Servo gauges** the very same
routine visibly sweeps every gauge. Play it, switch the model back to the
droid, and nothing happens. That side-by-side is what Mike saw, and it is a
good argument for building two views onto one thing: the disagreement between
them is the bug report.

#### The fix, and why it is not in the sequencer

There are a dozen writers of `ACT_T[act]` — the sequencer, the live pose, the
free-lane overlay, cues, the puppet rig, the bench host, two importers — and
teaching each one about PCA ownership is twelve chances to forget. `cad/parts.js`
already solved this once for test actions (`actSet()`: *"a test action must
command the servo model through setPWM, exactly as the sketch would"*). v1.61.0
applies that same rule at the ONE seam every writer already funnels through:
`syncActuators()`, in `app/animate.js`.

**An `ACT_T` write on a PCA-owned actuator is a command to the board.**
`servoTakeTargets()` turns it back into a pulse, exactly as the sketch would.

It is **edge-triggered**, and it has to be. Commanding the board from `ACT_T`
every frame would let a stale `ACT_T` from an old sequence fight the running
sketch forever — the sketch closes a door, this re-opens it, sixty times a
second. So only a CHANGE commands anything, and at the end of every frame
`ACT_T` is mirrored back from where the board is actually headed
(`servoTargetTravel()`, new in `core/servos.js`), which keeps the two in step
whether the move came from a sketch, the pad, a group action or a routine.

A dividend: the Outputs table's **moving** flag compares `ACT_T` with `ACT`,
and on `mod2026` it was comparing against a stale number. It is honest now.

Nothing here touches real hardware. `setPWM()` is the simulated PCA9685 — the
same one the transpiled sketch calls.

Five assertions in `tests/sequencer.test.js`, all five red on v1.60.0: the
routine opens the pie, the pie on screen actually rotates, the Maestro path is
unchanged, a door the sketch opened is not yanked shut, and `ACT_T` tracks the
board.

### 2026-08-21 - v1.60.0: the gauges move onto the stage

Mike, with the stage circled in orange on four screenshots: *"The servo grid
should be where ive marked and replace the r2 completly — we need to treat it
as another modle like we did for the plor mouse only we dont need the stage
area just a simple screen representing the servos — also the 180 / 360 gauges
should be selectable for each servo."*

Third shape for this feature: 3D servos on the stage (v1.57.0), a workspace of
its own (v1.59.0), and now a MODEL that draws a flat screen where the droid
stands. This one is right, and it is right for a reason worth writing down —
**the thing that varies is what is ON the stage, and this app already has a
selector for that.** A fifth workspace button made it a fifth kind of place;
a fifth model makes it a fifth kind of thing to look at, which is what it is.

#### What "another model, only without the stage area" means in code

`PREFS.model === 'servos'` puts it up, exactly the way it puts the Polar Mouse
up (`scene/models.js`, one line beside `mouseSetShown`). `svSetShown()` then
does something no other model does: it puts `model-servos` on the body, and
`15-servos.css` covers `#stage` with `#svScreen` and takes the canvas, the
HUD, the orbit hint and every stage button except the model chip out of the
way. `main.js` skips `renderer.render()` entirely while it is up.

The dividend is the bit that would have been work otherwise: **it appears in
both stages for free.** The big one in Drive, and the narrow column beside the
sequencer desk — where you can watch a routine you are editing move the actual
channels it compiles onto. The grid is `auto-fill` from a 104&nbsp;px minimum
and drops to 78&nbsp;px under 560, so the same markup fills either.

#### The face is per servo

Mike asked, so each channel wears its own. `SV.per` holds the overrides,
`PREFS.svShape` the board default, and `svShapeOf()` is the single reader.
The choice lives on that servo's own card — a **Face** row above Drives —
and clicking the face it already wears clears the override rather than doing
nothing, so the head's **All 180° / All 360°** buttons can move it again.
Those two set the default AND clear every override, because "all of them like
this" has to mean all of them; and they only light when every tile really is
wearing it, or a default of gauge with three dials set by hand would report
itself as an all-gauge grid.

**Both faces draw into the same 88 × 78 box.** A 180° gauge uses the top half
of its circle and a 360° dial uses all of it, so in their own natural boxes
they come out different heights and a mixed grid goes ragged — every row's
labels at a different level. The geometry moves inside one box instead: the
gauge's centre drops so its semicircle fills it, the dial's sits in the middle
with a slightly smaller radius.

#### The card is the panel card, literally

It floats at the top right of the stage, which is where `#selcard` appears
when you click a panel on the droid: same corner, same width, same z-index,
same Esc. "A similar config like on clicking panels" was meant literally, and
now that the gauges are on the stage it can be taken literally.

#### Two traps

**three.js writes `display:block` INLINE on its canvas.** `setSize()` does it,
and an inline declaration beats any plain author rule however specific —
`body.model-servos #stage canvas` matched perfectly and the canvas stayed
visible under the gauges, rendering every frame. It needs `!important`, and
that is the only rule in the file that does, because it is the only thing on
the list that is written inline.

**Sim only had to be taught about it again, for a different reason.** In
v1.59.0 the grid was a sibling of `#main` that the kiosk's rules could not
reach. Now the kiosk's rules DO reach the furniture — but they hide
`#stageTools`, which is the only way back to the droid, so a laptop handed
over on the gauges would have stranded the public on a screen of instruments
they cannot drive. `kioskEnter()` selects the droid before the class lands.

#### Small print

- Four workspaces again; five models. Five existing suites swapped those two
  numbers back, which is the second time this release pair has moved them —
  worth remembering before adding either.
- `tests/servos.test.js` 38 → **45**. Five guards proved red first: the
  canvas's `!important`, the shared face box, both halves of the All buttons,
  and the kiosk escape.
- Manual chapter 5 rewritten again and re-captured. The clip sets the mixed
  grid and the open card up BEFORE the burst: switching a face from inside it
  never reached the film, while the same calls work outside it. State belongs
  in the setup where it is deterministic; only motion needs the burst.


### 2026-08-21 - v1.59.0: a wall of gauges, not a rack of servos

Mike, two days after asking for the rack: *"I dont like the Servo look — can
you change them to be a grid, not on the stage, a separate view, and they are
represented via either a 180 degree gauge or a round dial 360 degree; when
clicked it pops up a similar config like on clicking panels."*

He chose: its own workspace button · both shapes, switchable · **a tile is a
board channel**, not a rack slot · and the card holds wiring, name and a test
slider.

#### What went, and why it is simpler for going

v1.57.0 drew twenty-four little 3D servos on the stage, each owning an
`rkS<n>` actuator that you then wired a channel to. That put a mapping layer
between you and the board for no gain, and it cost a stage model that had to
be framed, lit and orbited around. **A tile is a channel now.** Tile 5 is
channel 5, always; the rkS layer, the auto-map, the take-everything pass and
the "why is my rack empty" problem all went with the 3D model, and
`scene/rack.js` is deleted. Four models on the stage again.

The idea was never really a MODEL. One gauge per channel is a READOUT, and a
readout belongs in a view of its own.

#### `CHPOS` — the sim can finally answer "what is channel 7 doing"

It could not, unless the channel drove a part. `applyFrameTargets()` wrote
`ACT_T[c.act]` and `liveWrite()`, and a channel mapped to nothing wrote
nowhere: a real servo on a real board that the simulator had no opinion about.
Survivable while every surface was part-shaped — the Outputs table lists
ACTUATORS, the model shows PARTS — and not survivable the moment a view drew
one gauge per CHANNEL.

So `CHPOS` / `CHPOS_T` (maestro/playback.js): one normalised position and one
target per channel index, written wherever a channel target is set and eased
in `syncActuators()` beside ACT with the same rule. **`chanPosNorm(c)` is the
single reader**, and it deliberately prefers `ACT[c.act]` when there is one —
that is where the sketch, the pad and every group action put it, and none of
them goes anywhere near a channel index. Not persisted and not exported: it is
a live reading, like ACT.

That is what makes the grid work before you own a servo. A generated servo
layout now wires no parts at all — there is no droid part called "Servo 3" —
and every tile still moves.

#### The view

- **A workspace, not an overlay.** `#svwrap` is a SIBLING of `#main`, so
  `body.ws-servos` swaps the two wholesale and the grid gets the window.
- **Both shapes.** The gauge is 180° from due west to due east, centre at the
  top — a servo's real travel, so the needle IS the horn. The dial is 300° of
  a 360° bezel, leaving the usual gap at the bottom, because a needle that can
  point at both its own zero and its own full scale cannot be read. Both draw
  the same number: a gauge and a dial disagreeing about one servo would be the
  worst possible outcome of offering two.
- **The card is `buildSelCard()` one size down** — Drives, Name, Test. Every
  write goes through `HW.setPart()` / `HW.save()`, and the test slider writes
  the channel's TARGET so the needle eases there rather than snapping. Deeper
  numbers stay on the servo bench and the card says so.
- **It is built on the way IN, not per frame.** 128 tiles is 128 `<svg>`s; the
  per-frame work is `svTick()` turning needles that already exist, on the UI
  tick beside `updateOutputs()`, and it returns immediately while the view is
  off screen.

#### Two traps this release paid for

**Sim only would have shown the public a wall of gauges.** `#svwrap` is a
sibling of `#main`, so `body.kiosk header{display:none}` and the kiosk's
sidebar rules do not reach it — and with the header gone there is no way back.
`kioskEnter()` now leaves the workspace before the class lands, deliberately
to `drive` rather than `wsPrev()` (the grid writes ITSELF into `PREFS.ws`, so
"the way back" would be itself), and `15-servos.css` says the same thing a
second time. It has to live in that sheet rather than `10-kiosk.css`: the two
selectors have the same specificity as the `ws-servos` pair and the later
sheet is the one that wins.

**A CDP screencast only produces a frame when the page REPAINTS.** Every other
manual clip films the stage, which repaints continuously; this view has no 3D
canvas, so it repaints only when a needle moves. The first attempt opened on
the empty state and pressed the button — with nothing moving there were no
frames, `untilFrames()` waited out its whole timeout, and ten minutes of
capture produced ONE image. The clip now opens with the layout already built
and a routine already running. Written up at the top of `cap_docs.js` beside
the wall-clock rule it mirrors.

#### Small print

- Anyone whose channel table already carries an `rkS<n>` id has it cleared on
  load (`chanDropRetiredActs`), counted and said out loud. A channel left on a
  retired actuator is worse than an unwired one: `actPartLabel()` has nothing
  to return, so the cell goes blank while `c.act` stays truthy and every "is
  this wired" test in the app answers yes.
- `makeStarter('rack')` survives, minus the actuators: its routines address
  channels by index through a synthetic `ch<n>` key, and its channels rest
  centred because a bare servo does.
- Manual **chapter 5 rewritten** ("A wall of gauges") with a new clip. Five
  existing suites moved off "four models" / "four workspaces" — those numbers
  swapped places this release.
- `tests/rack.test.js` → `tests/servos.test.js`, 38 assertions. Five guards
  proved red first: the gauge's 180°, the CHPOS write, the off-screen tick
  guard, and both halves of the kiosk escape.


### 2026-08-20 - v1.58.0: the manual is in the app

Mike, on being told the manual did not know about the servo rack: *"yeah do
this — also make the manual really prominent on the sim."*

#### Chapter 5 — A rack of servos, and nothing else

The rack chapter goes in at **5**, not at the end, because of what it is for.
Chapters 1-4 are what this is, opening it, the nine setup questions and driving
it; chapter 6 onward is your real droid's servos. The rack sits exactly between
them: it is the fastest path from *I have opened this file* to *something is
moving*, and it needs no droid, no build and no CAD payload to get there.

It covers **Build its Maestro layout** and what the eight routines are each
good for (Count Up is the one you play to find out which channel is which),
wiring a slot by hand, why the horn shows the servo's real **180 degrees**, and
the paragraph that will save the most support: **why your rack looks empty** on
a real dome config, and where the deliberate take-everything switch is.

Everything from the old 5 down shifted by one, so the manual is **21 chapters**
now. The chapter numbers are plain text in both the heading and the nav link,
so the renumber was keyed off each `id` rather than off the number, and the
four "see chapter N" cross-references in the prose were fixed FIRST, while the
old numbers still meant the old things. That recipe is written into
`docs/manual/README.md` for the next person who inserts one.

#### The eighth clip

`tools/video-rig/cap_docs.js` gained a `rack` scene: it empties `MSTR` first —
the chapter's whole claim is that the rack needs no channel table, so the film
starts by proving it rather than inheriting whatever the clip before it left
behind — then presses **Build its Maestro layout**, plays **Servo Ripple** and
then **Servo Wave**. The routines are started through `seqStart()`
(`maestro/playback.js`), the same entry `restartScript()` and the sequencer
preview both go through, so what is on film is the real playback path and not a
scripted wiggle. Paced by captured frames, per the rule at the top of that file.

Only the rack clip was re-captured. The other seven still say v1.56.0 in the
corner and that is the documented policy — re-capture when the UI a clip points
at has actually moved, not on every release.

#### Four doors, one URL

`src/js/app/manual.js` is a small file whose entire point is that
`MANUAL_URL` exists once. Four hardcoded copies of a release URL is four things
to forget when the repository moves, and the one that gets forgotten is always
the one somebody actually clicks.

| Door | Where | Why there |
|---|---|---|
| `#btnManual` | the header, beside **?** | visible from every tab and every workspace, all the time |
| `#btnManualStp` | the setup screen's **head** | so it is on all fifteen steps, not on step one — somebody stuck on question six is exactly who needs it |
| `#btnManualLearn` | the **Learn** tab, above the lessons | thirteen lessons teach you to drive; the manual is the other twenty chapters |
| `#btnManualHelp` | first section of the **?** panel | where somebody mid-task goes for a lookup |

**It is a link, not a bundle.** The manual is 5.4 MB, the simulator is already
8.2 MB, and the clips inside the manual are captured FROM a built simulator —
so inlining it would mean building this file twice, and the copy would go stale
the moment either half moved. `releases/latest/download/` always resolves to
the manual built alongside whatever simulator the person is running.

**Which makes the release responsible for the other end.** A tag that ships
`R2D2-Simulator.html` without its manual leaves four buttons pointing at a 404.
`tests/chrome.test.js` pins the URL's shape; nothing but the release itself can
pin what is at it, and `docs/manual/README.md` now says so.

Sim only hides the whole header, so the button goes with it — and `manualOpen()`
carries the kiosk guard anyway, because the standing rule is guard the FUNCTION,
not the button: a public terminal at a con should not have a door out to a
browser tab. `window.open` failing (a browser refusing it from a `file://` page
is a real possibility) toasts the URL rather than doing nothing.

8 new assertions in `tests/chrome.test.js`, three of them proved red by moving
the button, breaking the URL and removing the kiosk guard.


### 2026-08-20 - v1.57.0: a servo rack on the stage

Mike: *"add a simple View that is just a line of Servos that you can map as we
do with the dome — this will allow anyone to just use a sequencer and see
simple movements on a grid (or line) of servos."* He picked: the count follows
the board, each slot is a real actuator with a non-destructive first-time
auto-map, and a line that wraps into rows.

#### What it is

A fifth entry in `MODELS`, and the point of it is the word ANYONE. Every other
model asks something of you first — the droid needs a build config and the MK4
payload, the Anzellan head is a fixed eleven-channel face, the Polar Mouse is a
vehicle you drive, and the Builder asks you to build something before it does
anything at all. None of them answers *"I have written a sequence — did it
work?"*. This does: one servo per channel, the horn sweeping its real travel,
and the sequencer, live drive, the pad and the firmware all reaching it through
the plumbing they already use.

- **The count follows the board.** `MSTR.servoCount`, clamped to 1..128 — a
  Micro 6 draws six and eight PCA9685s draw a hundred and twenty-eight. The
  rows WIDEN with the count (8, 12, then 16 per row) rather than staying at
  eight, because eight never changing turns 128 channels into a sixteen-row
  corridor you orbit down.
- **`rkS<n>` is registered in ACT only while it is on stage** — the ANZ_ACTS
  rule, third implementation, so the Outputs table, the sequencer and the
  wiring sheet always describe what you are looking at.
- **It is named at both naming seams** (`cad/naming.js`, `app/wiring.js`), so
  nothing anywhere prints a raw `rkS3`.

#### The three details that are not obvious

**The horn shows 180°, not 60°.** Every other joint in this app poses through
a bipolar `bi()` about a 0.5 home, because a door or a brow swings either side
of a rest position. A servo's 0..1 IS its 0..180, and drawing half of it would
make the one view whose whole job is to show what a servo is doing lie about
it. `RK_SWEEP = 180`, and 0.5 lands the horn on the centre tick moulded into
the case.

**A bare servo rests CENTRED, and that lives in `actRestNorm()`.** Without a
line there, `rkS3` misses `ACT_CENTRED` and falls through to 0, which parks
every horn hard over at one end — the half-open-panels rule (v1.46.1) read
backwards. Mid-travel is where a horn with nothing bolted to it belongs, and it
is where the tick is drawn. One rule, one place, the way that standing
constraint says.

**The rack notices a board change from the FRAME LOOP.** Six different places
write `MSTR.servoCount` — `setBoard()`, `makeStarter()`, two importers, the
setup `.json` reader and the servo store — and hooking all six is precisely the
kind of list this project has been bitten by twice (`mbSyncOutputs`,
`mbRecDriven`). `applyServoRack()` compares one integer per frame instead;
`rkResize()` is a no-op unless the number actually moved, and the seventh
writer cannot forget it.

#### Mapping, and the thing it must never do

"…that you can map as we do with the dome". The dome map's flow is
pick-a-channel-then-click-the-thing, which works because a dome is a picture
with named places on it. A rack of identical servos is not, so the useful
direction is the other way round — *here is servo 3, which channel drives it* —
and the control is a dropdown per slot. Every write goes through
`HW.setPart()`, the one place that does the clear-then-set and saves the
channel table to its own store; writing `MSTR.channels[i].act` straight would
skip the save, which is the exact shape of the v1.43.0 bug Mike reported as
"it overwrote my settings".

**The automatic pass only ever claims channels whose Part column is EMPTY.**
Landing on an empty rack and having to wire it by hand first would miss the
brief, but a channel with a part on it is somebody's calibration — and on a
real dome config every servo channel already drives a pie or a panel, so the
honest answer there is that the rack stays empty. Taking the assigned ones is a
separate, deliberate act: `rkMapEverything()`, behind an Advanced tick with the
warning beside the control rather than in a footnote (the `RC.advanced` model),
and keeping one step back the way the Builder's ready-made models do.

#### The zero-setup door

An empty channel table is the commonest first-run state, and answering it with
"go and generate one somewhere else" fails the brief at step one. So the pane
carries **Build its Maestro layout**, the same wording and the same place as
the Anzellan head's own: `makeStarter('rack')` writes a channel table of
nothing but servos, each already on its own slot, resting centred, plus eight
routines — Servos Centre, Sweep, Ripple, Ripple Back, Count Up, Odds and
Evens, Wave, Small Nudge. Every one starts and ends centred so two in a row
compose, and **Count Up** moves one servo at a time, which is the one you play
to find out which channel is which.

#### Small print

- `RK`/`rk*`, because `maestro/builder.js` owns `BLD`/`bld*` and
  `scene/builder.js` owns `MB`/`mb*`. A third collision would be a fatal
  SyntaxError on load, so "no page errors" at the end of `rack.test.js` is
  itself that guard.
- The nameplates are **opaque** canvases with `transparent:false`. A canvas
  with per-pixel alpha uploads as alpha = 0 in this app under headless
  swiftshader — `scene/scene.js`'s `contactTexture()` works around it with a
  luminance canvas read through `alphaMap`, which a colour label cannot do. An
  opaque plaque reads like a label stuck on the servo, which is what it is, and
  it draws identically on a real GPU and in the suites.
- 56 new assertions (`tests/rack.test.js`, in `./test.sh`). Seven guards were
  proved red first by putting the old line back in `src/` and watching the
  assertion fail: the non-destructive auto-map, the frame-loop board notice,
  the 180° sweep, the kiosk refusals, the stranded-key clear, the shrunk-rack
  ACT cleanup, and the eye of the whole thing — that a rack key never survives
  off stage.
- Three existing suites asserted "four models"; they assert five now
  (`builder`, `chrome`, `mouse`).


### 2026-08-20 — docs: the builder's manual

Mike: *"We need to create training docs maybe some videos"*. For **droid
builders**, sim side and bench side — not for contributors, who have this file.

`docs/manual/` — twenty chapters, one self-contained HTML file with **seven
screen-capture clips** and ten screenshots inlined as `data:` URIs, so it
travels exactly the way the simulator does: open it, offline, from a stick.
Beside it, two printable pages: **your first hour** on one A4 side, and a
**servo bench card** on one double-sided sheet — the power rules and the order
of work on the front, every silent failure mode this project has paid for on
the back.

**Written against the running app, not against this file.** Every flow it
describes was walked in a headless dist at v1.56.0 first; several sentences
changed because the app turned out to say it better than the note about it did.

**The clips are captured, not recorded.** `tools/video-rig/cap_docs.js` drives
the dist through each flow under the synthetic rAF clock, so re-capturing after
a UI change is one command rather than a screen-recording session. Its header
carries the four traps that cost real time here, and the first is the one that
generalises: **pace an interaction by CAPTURED FRAMES, never by wall clock** —
swiftshader renders about a frame a second, so a 60 ms wait between slider steps
is a twentieth of one image, and the first bench clip came out with the dial
sitting still at 1000 for its entire length. The others: `calSlide` is in
**quarter**-microseconds (writing 1000 clamps to the bottom of the range, which
looks identical to a dead control); the dome map draws into `#domeWrap` below
the fold and its click targets are bare `<g>` groups; and the import chooser
needs its file loaded *before* `jobwizOpen()`, or the job re-renders back to the
four-job menu.

**Each clip is encoded twice** — VP9 webm and H.264 mp4, both as `<source>`s.
A Chromium built without proprietary codecs cannot decode H.264 at all, and a
manual whose clips silently show nothing is worse than one with no clips. The
first build shipped mp4 only and every `<video>` sat at `readyState 0`.

**The built manual is NOT tracked**, for the reason in `.gitignore`: a tracked
build is how the shipped file went four versions stale. `src/` (prose split
five ways), `media/` and `build.py` are tracked, so it rebuilds in two commands.
`*.mp4` is ignored repository-wide, so the media folder needed a negation.

**"At your own risk", in plain words, four times.** Mike: *"can you also add that
anything you do or run with this is at your own risk type wording in case
something goes wrong"*. `LICENSE` has disclaimed warranty since the project went
public, but MIT's all-caps paragraph is not what somebody about to wire a servo
reads. So: a red block in **chapter 1 of the manual** (linked from its footer), a
box on the **quick start**, a line on **both sides of the bench card**, and a
section of its own in the **README** under the download. Same content each time —
it models hardware and cannot see your wiring; check before you do it; keep a way
to cut the power in reach; verify every figure on your own bench; what happens to
your boards and your fingers is yours. The plain-English version, next to the
thing it is about. *(Written by a language model, not a lawyer — if the wording
needs to hold up legally, have somebody qualified read it.)*

**So it is attached to the release beside the dist**, and the README's download
block links it there — a link to a path in the tree would 404 on exactly the
file people want. That works because **`build.py` assembles with no captures at
all**: `media/` is tracked, so `python3 docs/manual/src/build.py` on a bare CI
runner reuses the encoded clips and stills and writes the 4.8 MB file in about
two seconds, with no browser and no ffmpeg. `release.yml` runs it between
`./build.sh` and the upload. **Capturing stays a human job** — the frames only
need re-taking when the UI a clip points at has moved, and that is a judgement
nothing in CI can make.

### 2026-08-20 — v1.56.0: the bench talks to a real Maestro

Mike, on the physical droid rather than the simulator: *"if a maestro is
directly connected can you control / read from it?"* — and then the real
question: *"I'm thinking if we can link to it for help setting it up via the
simulator and skipping the maestro app altogether?"*

**Mostly yes, and the "mostly" is the whole design.**

#### What made it easy

Almost nothing had to be invented. The Maestro's USB **Command Port** is a
virtual COM port; `navigator.serial` opens it exactly as it already opens
PCA_Bridge's. And the unit was already right — a Maestro's target is in
**quarter-microseconds**, which is what every channel, every endpoint and
every frame in this app has been in since the first `.mstr` import. So the
seam was one function deep:

```
HWE.onWrite  →  serialWrite(ch, qus)  →  0x84, ch, qus&0x7F, qus>>7
```

No conversion. A different envelope. `maestro-link.js` holds the protocol
(0J40 §5.e), `serial-link.js` keeps sole ownership of the port and routes on
`SER.kind`, and everything above — the dial, the **test** button, the
sequencer's live-drive arm — reaches the board through the engine it always
did. **Always drive through the engine, never straight to the wire** still
holds; there is simply a second envelope at the end of it.

#### What it cannot do, which is the part worth remembering

The serial port **drives**; it does not **configure**. Pololu are explicit
(0J40 §8): *"the native USB interface provides more features than the serial
port, such as the ability to change configuration parameters."* So each
channel's stored **min, max, neutral, home** and **mode**, and the board's
own **serial mode**, cannot be written from here at all. Control Center
writes those, once.

That is not a footnote. **The board clamps a Set Target to its stored limits
silently** — no error, no reply, and Set Target has no acknowledgement that
could carry one. Ask for 1000 µs on a channel whose stored minimum is 1136
and the servo stops at 1136: the dial keeps turning, the panel stops moving,
and it reads exactly like a binding linkage or a dying servo. Same family as
every other trap in §7 — **the failure that looks like a different failure**.

#### So the read-back IS the feature

`mstrWatch(ch)` polls **Get Position** at 5 Hz on the channel under the dial,
and reads **Get Errors** every fourth pass. When the position has stopped
changing (two identical reads) and is more than 2 µs from the target,
`mstrClampNote()` says so in µs and names the stored **minimum** or
**maximum** as the cause. **Control Center does not tell you this either** —
it simply will not let you ask for the number in the first place.

Three details that are easy to get wrong and are pinned by tests:

- **The two encodings are not the same.** A target goes out seven bits at a
  time; a position comes back **eight** bits at a time. Confuse them and
  everything below 1024 quarter-µs still works, so the bug hides until a
  real servo is on the end of it. `mstrSplit` / `mstrJoin`, asserted apart.
- **A stale reply must not answer the next question.** A timed-out Get
  Position landing late would be read as an error word. Every ask drops
  whatever is unclaimed before it writes, and the queries are serialised.
- **Get Errors CLEARS what it reads**, so there is exactly one reader.

#### The probe order, which is a safety property

`0xA1` (Get Errors) is the natural opening question: no channel, moves
nothing, and a two-byte answer proves a Maestro. **But `0xA1` has its high
bit set, and to PCA_Bridge a byte with the high bit set is a FRAME HEADER**
— it would read channel `0x21`, swallow the next two bytes as a position and
move a servo, just to ask a question. There is no probe for one board that
is not a live command to the other.

So: the existing text identify (DTR pulse, then `?`) **always runs first** —
harmless to a Maestro, which has no banner and ignores a lone data byte —
and the binary question is only asked when no sketch answered **and**
`serialBuildIsMaestro()` is true, or the user presses the new *it is a
Pololu Maestro* button on the "did not identify itself" bar.

#### Two smaller decisions, recorded because they will come up again

- **The board's speed and acceleration are left alone by default.** A
  Maestro shapes every move with its own stored values, and the engine has
  already shaped it — both at once is not dangerous, just slower than
  either, which reads as *the model and the droid disagree*. Zeroing them
  (`mstrQuiet()`, one button) hands the shaping to the engine so the panel
  on screen and the panel on the droid move together. It is a RUNTIME write
  and a power cycle restores the board's own values — but it is still a
  change to a board Mike tuned by hand, so it is opt-in and it says what it
  did.
- **The PCA9685 config frames (channels 126/127) are never sent to a
  Maestro.** On a Maestro they are two valid Set Targets to channels that do
  not exist — a protocol error flag for nothing. `serialConfig()` returns
  early, and `serialSetFreq()` says the servo rate is a PCA9685 idea.

#### Closing the gap

The Finish step, **on a Maestro build only**, now says what Control Center
is still for — USB Dual Port, mode Servo, and the stored limits — names any
channel the board was caught clamping while you worked, and hands over the
settings file. That file is not new: `genChannelsXml()` has always
regenerated the `<Channels>` block from live channel state, so the ordinary
`.mstr` export already carries the endpoints captured on the dial. What was
missing was anyone saying **why** you would open it in Control Center, and
in what order. It also says the thing people forget: **the COM port can only
be held by one program at a time.**

Note that this leaves §7's standing rule intact — Mike's tuned endpoints are
still never changed behind his back. The settings file is written only when
he presses the button, and applied only when he applies it.

#### Estate

`tests/maestro-link.test.js`, **48 assertions**, both builds, in `./test.sh`.
There is no serial port in a headless browser, so the suite owns the wire:
`serialRaw` becomes a capture and replies are pushed back through `mstrRx`
exactly as the read loop would. Proven able to fail twice — `mstrJoin`
switched to the 7-bit split (6 red), and the clamp tolerance widened past a
real clamp (7 red).

**Still open, and honest about it:** this has been proved against the fake
wire and not yet against Mike's Mini 18. The board's own USB path is known
good (see §7 / the dome RX fault — USB works, it is the TTL RX input that
does not), which is exactly why this route is worth having: it sidesteps the
open hardware fault entirely for setup purposes.


### 2026-08-19 — v1.55.0: the build can hold eight of them too

v1.54.0 raised the firmware and the wire protocol to eight boards. Mike
flashed it and the bench answered exactly as it should:

```
--- PCA bridge ---
  0x40  channels 0-15   FOUND
  0x48  channels 16-31   FOUND
  0x50  channels 32-47   FOUND
```

And then: *"The Servo Hardware - doesnt show enough servos its only showing
two."*

Which it was. Raising the ceiling in the firmware left the APP still unable
to say a number above two, in three places at once:

- `PCA_SEQ_BOARDS` in `maestro/boards.js` had exactly two entries, `pca16`
  and `pca32`. That list is what tells the sequencer how many channels a
  build has.
- The **Servo hardware** answers in `config/hardware.js` were `mpca16` and
  `mpca32`. Two options, per location, hand-written.
- The arrangement step offered `p1` (*one controller, one expander*) and
  `p1x2` (*one controller, two expanders*) as two separate picture cards.

**Cards are right for a shape and wrong for a quantity.** `p1` and `p1x2`
differed by the integer 1 and nothing else — same controller, same link,
same wiring, one more rectangle in the drawing. Eight of them would have
been eight near-identical pictures, and picking between them is not the
question anybody has; the question is *how many boards have you got*. So
the shape stays a card and the quantity is a **number beside it**, 1–8,
which is also what the bench's own Channels step has always used. The field
says what the answer BUYS you — channels, and the highest channel number —
because "6 boards" is not a thing anyone can picture and "96 channels" is.

Answered by Mike, asked before building: *how should the build ask?* →
**"A number, 1–8"**. And *how are your PCA9685s driven?* → **"Both — let me
pick per build"**, so the count applies to the one-controller shape (which
is his bench: one scan, three boards) and the existing dome/body split is
untouched.

**`p1` is hidden, not deleted.** `servoTopoDef()` falls back to
`SERVO_TOPOS[0]` for an unknown id, and `SERVO_TOPOS[0]` is `m1` — a
*Maestro* shape. Removing the id outright would have quietly turned any
saved build naming `p1` into a Maestro build. It stays in the array with
`hidden:true`, out of the picker, and `buildNormaliseServos()` rewrites it
to `p1x2` with a count of 1. A test asserts exactly that, because the
failure mode is silent and total.

**Generated, not listed, and the old ids are untouched.** `mpca16`/`mpca32`
and `pca16`/`pca32` are strings in saved builds, saved workspaces and
exported setup files, so they come out of the generators spelled exactly as
they were hand-written — including their notes, which are sentences somebody
wrote about a real dome and not the generated fallback. Only 3–8 are new.

**NOT ANSWERED and ANSWERED ZERO are different things.** The first cut
folded them together with `if(!(b.pcaBoards >= 1)) b.pcaBoards = 2`, which
made the floor 2 — a spinner that will not go down to 1. A build saved
before the field existed has no answer and means two (that is what every
such build was); a typed 0 is a value and clamps to one.

**The count rides back with the board answer.** `buildSet('domeServo',
'mpca48')` — what an import, a test or a restored workspace effectively does
— has to leave `pcaBoards` saying three, or the forwards derivation a few
lines later reads the stale count and hands your value back changed. That is
the same trap the BACKWARDS pass was written for in the first place, and the
comment there already said so.

Downstream, `buildApply()` → `setBoard()` already did the right thing: three
boards grows the channel table to 48, four to 64, eight to 128, padding
rather than rebuilding so the mapping work survives. `baPca()` in
`board-art.js` stacked one board per 26 units from y=10, which walks off a
72-tall drawing at four; past three it draws two columns now.

Twenty-two new assertions in `build-config.test.js`, including the one that
is literally Mike's report — apply a three-board build and check the channel
table is 48 — proven red against the old derivation (9 failures).

### 2026-08-19 — v1.54.0: eight PCA9685s, not two

Mike flashed v1.53.1 onto the bench, pasted the serial output back, and it
said:

```
PCA-BRIDGE 1
--- PCA bridge ---
  0x40  channels 0-15   FOUND
  0x48  channels 16-31  FOUND
  1 more board(s) on the bus than this sketch drives (32 channels max)
```

*"Is this a true limit on the number of PCA's? as for the dome I need two and
one for the body - 4 pcas would future proof me."*

No. Nothing about the hardware capped it. A PCA9685 has six address jumpers,
so sixty-four addresses exist; `MaestroPCA` indexes boards as `channel >> 4`
with `uint8_t` counts and never had a limit at all. There were three separate
ceilings and only one of them was structural:

1. `PCA_Bridge` declared `Adafruit_PWMServoDriver pca[2]`. An array size.
2. `MaestroReplacement` declared `pcaA` and `pcaB`. Two named variables.
3. **The wire protocol.** This was the real one, and it is why the other two
   were set where they were.

A live-drive frame is three bytes: `0x80 | channel`, then the payload in two
7-bit halves. The high bit of the header marks the frame, so a dropped byte
resyncs on the next one. But the channel was being read as `b & 0x3F` — only
SIX of the seven bits available — and 62 and 63 were spent on the oscillator
and the servo rate. Thirty-two usable servo channels. Two boards. A dome
wants two boards on its own.

The seventh bit was sitting there unused. Reading `b & 0x7F` costs nothing:

- channels **0–125** drive servos (board = `ch >> 4`, pin = `ch & 15`)
- channel **126** = oscillator Hz / 10000
- channel **127** = servo frequency in Hz

Eight boards, 128 channels. Both sketches carry eight drivers now and bind
whatever the boot scan found, in ascending address order; `PCA_Bridge`'s
banner is `PCA-BRIDGE 2` and `MaestroReplacement`'s is `MAESTRO-PCA 3`.

**The honest cost.** On a full eight-board rig, board 7's last two pins —
channels 126 and 127 — cannot be driven live from the browser, because those
two numbers carry the configuration. They still work on the standalone droid
sketch, which does not use this wire format. Anyone with eight boards who
needs those two pins puts the servos that matter on lower channels. This is
written into the README and the sketch header rather than left to be
discovered.

**The dangerous part, and what the release is really about.** The two widths
are *indistinguishable on the wire*. There is no handshake, no length byte,
no version field in the frame. Send channel 70 to a board still running the
old decoder and it reads `70 & 0x3F` = 6 and moves a completely different
servo. No error. No clue. A panel opens that you were not touching, which on
a droid with a dome full of linkages is exactly the class of fault that
costs somebody an afternoon and possibly a servo horn.

So the width is decided by the **banner**, once, at connect — the same
banner the app already reads to decide whether a board can share its USB
port safely:

| banner | channel field | config on | servo channels |
|---|---|---|---|
| `PCA-BRIDGE 2` or later | 7 bits | 126, 127 | 0–125 |
| `MAESTRO-PCA 3` or later | 7 bits | 126, 127 | 0–125 |
| `PCA-BRIDGE 1`, `MAESTRO-PCA 2`, unrecognised, silent | 6 bits | 62, 63 | 0–61 |

`serialSetWidth()` is the one place that decides, so the encoder, the config
frames and the guard cannot disagree. A channel above the connected board's
ceiling is **dropped**, with one plain warning naming why and what to
re-flash — never folded onto a lower channel. A board that will not identify
itself is assumed NARROW, which is the same instinct as the existing refusal
to stream into an unidentified sketch: guessing generously is what makes
servos move on their own.

Nothing needs re-flashing to keep working. Re-flashing is what unlocks
channels 32 and up, and the Boards step in the setup says so the moment you
answer more than two.

**Testing.** The frame decoder is now tested *where it is decoded*:
`bridge_test.cpp` feeds real byte streams through the sketch's own `loop()`
and asserts channel 70 reaches board 4 pin 6 and not board 0 pin 6, that
62 is an ordinary servo channel now, that 126/127 configure and move
nothing, that 8191 still means pulses-off on a high channel, and that a
truncated frame is abandoned at the next header rather than smeared. Mike's
actual bench — 0x40, 0x48 and one more — is a fixture: all three bind, and
channel 33 reaches the third board that used to be unaddressable. Proven red
by restoring the `& 0x3F` mask (5 failures). On the browser side, thirteen
new assertions in `hw.test.js` cover the banner thresholds, both widths, and
the drop-rather-than-fold rule.

`MaestroReplacement` — the sketch that actually ends up in the droid — had
**no compile check at all** until now; the ESP32 pair got theirs in v1.33.0
and `PCA_Bridge` in v1.53.0. It has one, and it boots against a fake
three-board bus. The `2>/dev/null` on the ESP32 compile steps in `run.sh` is
also gone: that redirect is what hid a compile check that had been broken
since the day it was written, and the only symptom of a broken step was a
step that printed nothing.

### 2026-08-19 — v1.53.1: PCA_Bridge needs no library

v1.53.0 gave every sketch the bus scan, and gave `PCA_Bridge` it as
`#include <MpcaScan.h>`. Which is tidy and wrong: PCA_Bridge is the one sketch
here that is **not a library example**. It lives in `pca-studio/` because it is
a TOOL — the thing you flash first, to let the app drive your servos — and it
has always compiled with nothing installed but Wire and
Adafruit_PWMServoDriver. Making it depend on MaestroPCA to do a bus scan means
the first sketch a builder flashes now fails to compile on a file they did not
write, for a library they do not otherwise use.

So it carries its own copy of the scan, and the copy is **fifteen lines with
the same All Call exclusion and the same ascending-address rule**.

#### A copy is a liability, so it is not left as a promise

`arduino/MaestroPCA/test/bridge_test.cpp` compiles the sketch and then runs
**both** scans — the sketch's `bridgeScan()` and the library's `mpcaScan()` —
over the same seven buses, asserting they agree answer for answer: an empty bus,
one board plus its All Call, a lone board on a different jumper, two
non-consecutive boards, the far end of the range, a bus with the sub-call
addresses live, and more boards than either will store. It then asserts they
probed **exactly the same number of addresses**, which is what catches a range
that has quietly narrowed.

Proven red both ways: narrowing the sketch's sweep back to 0x40–0x4F fails two
assertions (including "same sweep, same exclusions — 16 vs 60"), and dropping
the All Call from the sketch's reserved list fails six.

It also gives PCA_Bridge **the compile check it has never had**, and exercises
its `setup()` against a fake bus: two boards at 0x40 and 0x42 are found and
bound, a write to board 1 goes to 0x42, and a bus carrying nothing but an All
Call is correctly an empty bus.

The Arduino suite is now **157 assertions plus three sketch-compile checks**.
Nothing in the browser build changed: **2096 assertions, 32 suites, both builds,
zero failures**, plus PCA Studio's 86.


### 2026-08-19 — v1.53.0: the sketches find the boards

Mike: *"does the PCA sketches check for pca boards via a scan of all addresses
as I and others may jumper them differently"*.

They did not. What each of them actually did:

| sketch | probed? | where | boards it could ever use |
|---|---|---|---|
| `PCA_Bridge` | yes | 0x40 and 0x41 only | 2 |
| `MaestroReplacement` | yes — `probe(0x40 + b)` | 0x40, 0x41 | 2 |
| `Esp32Droid` | **no probe at all** | 0x40–0x43, written to blind | 4 |
| `SelfTest` | no | 0x40 | 1 |
| `LoopbackTest` | swept 0x40–0x4F — but only to PRINT; the drivers stayed at 0x40/0x41 | — | 2 |

So every one of them assumed **consecutive addresses starting at 0x40**, and
probing was only ever used to decide whether to talk to a board it had already
decided existed. A PCA9685 has six address jumpers, A0–A5; which of them you
bridge is a soldering decision made inside a dome. Bridge A1 instead of A0 and
the board answers at 0x42: `MaestroReplacement` reports "board 1 not present",
channels 16–31 silently do nothing, and nothing says that the board it cannot
see is sitting right there on the bus answering.

#### `arduino/MaestroPCA/src/MpcaScan.h`

One header, used by all five sketches. It sweeps the whole range a PCA9685 can
occupy — **0x40–0x7F**, not the 0x40–0x4F that `LoopbackTest` covered — and maps
what it finds to board numbers **in ascending address order**, so 0x40 + 0x42
behaves exactly as 0x40 + 0x41 does. That is what "jumper them however you like"
has to mean. The cost is stated in the header and printed by every sketch at
boot: if a board drops off the bus, everything above it renumbers, so the
mapping is announced rather than assumed.

**The All Call is the whole reason this is a shared file and not four lines
copied into each sketch.** A PCA9685 answers address **0x70** out of the box —
MODE1 powers up with ALLCALL set and Adafruit's `begin()` sets it again — so a
bus with one chip on it ACKs at both its own address *and* 0x70. Sweep without
knowing that and one board reads as two, the phantom being **every board at
once**: a write meant for "board 1" would move every servo on the droid. 0x71–
0x73 are the sub-call addresses, disabled by default and excluded for the same
reason.

`mpcaBind()` re-addresses the driver objects to what was found, and its one
constraint is written into the header: **it must run before `begin()`**, because
recent Adafruit versions allocate their I2C device inside `begin()` and
re-addressing afterwards would strand that allocation.

The sim's Sketch step now says so too — the `Adafruit_PWMServoDriver pca[]` block
is what somebody copies, and it read as an instruction about which jumpers to
bridge. The PCA9685 step's jumper table is described as a suggestion.

#### The check that had never run

While adding `scan_test.cpp` to `arduino/MaestroPCA/test/run.sh`, the ESP32
sketch-compile step turned out to have been **failing since it was written**:
the sketches `#include <WiFi.h>` and `<WebServer.h>`, both of which the shim
declared (in `esp32env.h`) but never provided as FILES, so the compile died on
its first line. `run.sh` sends the compiler's stderr to `/dev/null`, so all
anyone saw was the step not printing a PASS. Two one-line shim headers fix it and
both ESP32 sketches now compile again — the same lesson as PCA Studio's smoke
test in v1.43.0: a check nobody can see fail is not a check.

The Arduino suite is **145 assertions plus two compile checks** — the handover
had been saying 87 for some time.

#### Tests

`scan_test.cpp` (17): the All Call is excluded and one board on the bus counts
as one; a lone board at 0x42 is found; 0x40 + 0x42 map to boards 0 and 1 in that
order; the far end of the range is reachable; an empty bus probes every
non-reserved address; the total is returned even when it exceeds the caller's
array, so a sketch can say it found more boards than its table has room for; and
a bound driver writes to the address it was found at rather than the one it was
constructed with. Proven red by removing the All Call from the reserved list —
six assertions fail, including "it is ONE board, not two". Four more in
`tests/setup-bench.test.js` (71) for what the sim now says.

**2096 assertions, 32 suites, both builds, zero failures**, plus PCA Studio's 86
and the Arduino suite's 145.


### 2026-08-19 — v1.52.0: two placements

Mike, on the dome map: *"move rotate to under the image."* And on the
sequencer: *"Pose and Frames should only be displayed when advanced is
ticked."*

**The rotate slider goes under the drawing.** It arrived in v1.50.0 in the
map's header, next to `next unmapped` and `close` — which is where you go to
LEAVE the map, a hand's width from the thing the slider turns. A control
belongs beside what it changes, so it and its `reset` now sit in their own
row directly under the SVG, above the key. Nothing about the rotation itself
changed.

**Pose and Frames go behind Advanced.** BRICKS is how a routine is authored;
the other two are ways of looking underneath it — a live pose you set channel
by channel, and the frame list the bricks compile to. Both are useful and
neither is a beginner's first move, which is exactly the shape of Mike's
standing brief (simple by default, the detail one deliberate click away), and
this was the last place in the sequencer it had not been applied. They now
share the tick that already reveals the per-brick speed overrides.

`sqAdvViews()` is the one place that decides, called from the tick's own
handler, from `blkPrefsRestore()` (so a session that had Advanced on comes
back with all three) and once at load. It also refuses to orphan you:
unticking Advanced while you are standing in Pose or Frames returns the view
to the bricks, rather than leaving you on a pane whose only door has just
been removed.

Three assertions in `tests/sequencer-ui.test.js` (198) and two in
`tests/setup-bench.test.js` (67) — including that the slider is measurably
BELOW the drawing and no longer in the header, because "move it under the
image" is a claim about geometry and can be checked as one.

**2092 assertions, 32 suites, both builds, zero failures**, plus PCA Studio's
86.


### 2026-08-19 — v1.51.0: the dial is the view, and the button says what it does

Mike, with a screenshot of the Channels step showing the list, the Configure
panel and the calibration dial all at once: *"this should be the default view"*.
And: *"rename use these ends to save servo setting"*.

The rename is the smaller half and the better name. "Use these ends" described
the gesture; "save servo setting" describes the consequence, which is what a
button should be called.

#### Making the dial the default was not a one-line change

It had been a MODE since v0.7.0 — you pressed `configure…` to enter it, and
cancel or commit to leave. Three things it did were only defensible *because*
you had asked for it, and each of them became a bug the moment it was simply
on screen:

- **It drove the servo on the way in.** Fine when you asked for the dial;
  unforgivable when merely clicking down a list of rows would walk every panel
  on the droid to mid-travel in turn. It now opens under the needle — seeded
  from where the engine already has the channel — and the servo follows the
  dial only once you turn it.
- **It widened the channel to the 1000–2000 µs working range** so
  `pcaSetTarget()`'s clamp would let the dial reach past the very endpoints it
  exists to find, and put it back on cancel or commit. "For as long as the dial
  is open" had just become "always", so **every `HW.save()`** — changing a
  speed, ticking boot, renaming a channel — would have written the working
  range over the builder's measured travel, and the Configure panel would have
  read it back out and shown it as the channel's ends. The widening now lasts
  **exactly one call**: `calDrive()` opens the range, commands the target and
  closes it again. `pcaSetTarget` clamps at set time and the step never
  re-clamps, so the servo lands where the dial asked and nothing outside that
  function ever sees the working range. `calApplyRange()` is deleted, and
  `calSweep()` no longer does range surgery either — an interrupted sweep used
  to be able to leave a channel narrowed to its captured pair.
- **Nobody had to be told nothing was saved yet.** In a mode you know you are
  mid-edit. In the default view you do not, so the dial says **not written
  yet** the moment its three ends differ from the channel's.

#### One set of numbers

The Configure panel's shut / centre / open ARE the dial's pending ends while it
is open: type in the panel and the dial moves, capture on the dial and the panel
follows, and `reversed` swaps whichever pair is live. Two controls on one screen
disagreeing about the same servo was the thing to avoid, and it is now
structurally impossible.

#### Leaving means keeping

Asked what a staged end should do when you click another channel or close the
bench: *"keep it — leaving means keeping."* Which is the only answer consistent
with the panel it sits in — every other field there writes on change, and three
of them silently reverting because you looked at the next channel would be the
trap, not the safeguard. `setupCalLeave()` is the one door: dirty commits, clean
drops. `cancel` remains the real undo, and because **turning** the dial moves
`pos` (where the servo is standing) rather than any of the three ends, a nudge
on a real linkage still stages nothing.

Esc loses its innermost branch: closing a view that reopens on the next render
would look broken, and silently reverting the ends would be worse. Esc is the
map, then the bench.

#### Tests

`tests/setup-bench.test.js` grows to 65: the dial is there without a press; it
does not move the servo; the panel and the dial show the same three numbers and
they are the builder's travel, not the working range; typing stages and `save
servo setting` writes; the dial stays open after saving; cancel restores;
leaving a channel and closing the bench both KEEP a staged end; and an ordinary
`HW.save()` while the dial is open cannot write 1000–2000 µs into storage.
`hw.test.js` (96) and `pca-studio/smoke.test.js` (86) were updated where the
contract changed — Studio's suite now asserts the opposite of what it did, on
purpose: the channel's ends survive both opening the dial and driving past them.

**2087 assertions, 32 suites, both builds, zero failures**, plus PCA Studio's 86.


### 2026-08-19 — v1.50.0: the bench stops being a spreadsheet

Seven things, all Mike's, all about the same overlay:

> *"in setup popout in light mode its hard to see whats selected"* · *"in Set up
> your servo hardware it jumps around when enabling servos"* · *"I think it's too
> complicated a view… what we should have is a simple view that when you select a
> servo or a channel, it uses the configuration panel, which should always be
> visible… and then the view at the top is simply a case of a test button, so it
> opens and closes, and the ability to rename and define what it drives"* ·
> *"instead of saying apply, it should say apply setting to all selected"* ·
> *"for the dome map, can we make it rotatable"* · *"clicking one of the panels
> seems to jump around the screen"* · *"under the tab for the PCA9685s — do we
> care?… we just need to know how many boards there are"* · *"under the sketch
> section, can we provide links to the sketches?"*

#### The list and the panel

The old screen made every setting a COLUMN — sixteen of them, on a table that
scrolled sideways, which is why six columns had to be pinned, why the offsets had
to be measured after every render, and why `configure…` had spent a release
clipped to "co…" off the right-hand edge. Each fix was reasonable. The sum was a
spreadsheet you had to drive.

A channel asks two different kinds of question, so it now gets two surfaces:

- **the list** — use · # · board·pin · name · drives · **test**. Who this channel
  is. The same six answers for every row, and it fits.
- **the Configure panel** — ends, centre, reversed, boot, speed, acceleration,
  ease, sleep, the dial, and the live drive slider with its position bar and
  off/min/mid/max. How this one channel is set up. That is a FORM about one
  thing, and a form does not belong in a table cell.

The panel is `position:sticky` to the bottom of the scrolling body, because
**always visible** was the request and a panel you have to scroll to is not one.
It follows the row you click and its own channel picker equally, and it says so
plainly when the selected channel is not in use rather than showing empty fields.
`setupCst()` and `setupStickyFit()` are deleted: the pinned-column machinery
existed to rescue the table that has gone.

**Three things "selected" could mean** are now kept visibly apart, because this
screen needs all three: `use` (is anything plugged in), the **tick** (which
channels a bulk change touches — many), and the **row** (which one the panel is
showing — exactly one). Clicking anywhere on a row selects it; it used to be the
channel number and nothing else, a four-character target nobody found, which is
why the dome map so often said "no channel selected".

**test** drives the channel to its open end and back. Which end is which comes
from the **directed pair** — `min` is shut and `max` open whichever is the larger
number (the travel rule, v1.46.0) — so a reversed channel really does close when
the button says shut. The old min/mid/max buttons deliberately sort the pair;
this one must not, and that difference is asserted. It reads the engine's
**target**, not the position, so on a slow panel the second press undoes the
first instead of repeating it.

#### The jumping

`setupRender()` rebuilds the dialog by innerHTML, and a fresh element scrolls to
the top — so every tick, every dropdown and every dome click threw the reader
back to the header. Fixed once, structurally: `setupScrollSave()` /
`setupScrollLoad()` bracket the render and put back the scroll position, the
keyboard focus and the caret inside it. Focus is restored by a STABLE
description of the field (its row and its `data-k`, or its id), never by element
identity — the element it was is gone. Doing this per-handler would have meant
remembering, in twelve call sites, something none of them is about.

#### Selection you can see

`.setopt.on` was a grey fill and a one-pixel border: fine on a dark card, all but
invisible on a white one. Three signals now, so no single one carries it — a
blue-tinted fill (`--selBg`, which the light theme already defined properly), a
solid accent bar down the left edge, and a ✓ before the label. The selected
channel row gets an accent edge as well as its fill.

#### The dome map turns

`buildDomeMap(host, {rotate})` puts the whole drawing inside one rotated group,
so no bearing is recomputed and a rotated map and an unrotated one are the same
picture; every label is then turned back about its own anchor, because a panel
number upside down is not a label. The FRONT marker turns WITH the dome — it is
the thing that says which way you have turned it. A 0–359° slider on the map's
own header, remembered in `PREFS.domeRot`, with a reset. The slider redraws the
MAP only, never the wizard, or the input would be rebuilt under the thumb and the
drag would end on the first pixel (the dial learned that in v0.7.1).

#### One question on the PCA9685 step

The board count is the only answer there that changes anything: how many channels
exist, which address jumpers to bridge, what goes in the sketch. Chained-versus-
star changes one drawing and the power routing changes nothing at all, so both —
and the supply amps — move behind ADVANCED beside the pulse frequency. Hidden,
not deleted: the Wiring diagram genuinely draws the two layouts differently, and
the step still states in one line what they are currently set to.

#### The sketches are links

The step has named four folder paths at people since v1.38.0 and offered no way
to reach any of them; a path is only an instruction if you already have the repo.
`APP_REPO` (core/util.js — one string, one place) plus `setupRepoLink()`, so
PCA_Bridge, MaestroReplacement, Esp32Droid and the library itself are links, on
GitHub, `target="_blank"` with `rel="noopener"` — a new tab that can reach back
into a bench session with a board connected is a hazard we would get nothing for.

#### Tests

`tests/setup-bench.test.js`, 44 assertions, both builds, in `./test.sh`. "Is it
clearer?" is not a test; every structural promise underneath the request is. The
scroll position and the caret survive a re-render; the list carries no setting
and the panel carries all of them; the panel follows the selection from both
directions and writes to the channel it names and no other; the test button
drives the directed ends on a deliberately reversed channel; the map rotates by
one transform with every label counter-rotated; what left the PCA step is off it
and still reachable under Advanced; the links point at this project and open
safely. `hw.test.js` and `build-config.test.js` were updated where the surface
moved — same contracts, new addresses.

**2062 assertions, 32 suites, both builds, zero failures**, plus PCA Studio's 86.


### 2026-08-19 — v1.49.0: frames back into bricks

Mike: *"when we import the meastro does that convert the sequence import into
a bricks veiw?"* — and, told that our own files do since v1.48.0 but a
stranger's cannot: *"lets build it - but with two options the first is where we
guess and another which highlights the issues and allows the user to use the
bricks sequence to see them, accept them or change each issue"*.

**The asymmetry.** `blockCompile()` throws information away on purpose: a brick
says "panel 3 opens over 300 ms, holds a second, shuts over 300 ms" and out comes
a list of absolute poses. Our own exports carry the bricks along in a comment, so
nothing is lost there. A Pololu file has no such thing and never did — which
meant the sequencer could show an imported routine, play it and re-export it, but
never let you edit it as bricks. "Build this one with bricks" was an empty start,
not a conversion: drop one brick and the imported motion was gone (19 frames
→ 8, measured in the round-trip report).

#### The analysis — `src/js/maestro/blocks-trace.js`

A frame commands its targets and then waits, so the instants a frame list has an
opinion about are t=0 and the END of every frame — the same rule
`blockCompile()` is built on. On that grid each channel's curve is normalised to
0..1 of its own travel (`blockClosed`/`blockOpen`, so an inverted pair reads the
right way up), cut into **excursions** away from the shut end, and each excursion
becomes one brick: the peak is the amplitude, the first sample at the peak ends
the rise, the last one begins the fall. Every edge is taken off the grid rather
than interpolated, so a routine that WAS bricks comes back with its own numbers
instead of numbers near them.

It deliberately does not attempt three things, each for the same reason — no
evidence in the file to decide it: **'c' and 'co' bricks** (both describe a
channel already open at t=0, which a routine resting shut cannot need);
**overlapping bricks on one lane** (two bricks layer into one curve and that
curve is all a frame list preserves — one excursion, one brick); and **nested
sequence bricks** (indistinguishable from the same motion authored by hand, and
guessing wrong would silently couple two routines).

#### The measurement, which is the whole point

A conversion is a guess. What stops it being a bad one is
`blockTraceCheck()`: evaluate the proposed bricks at every grid instant —
mirroring the compiler exactly, base-closed start, later bricks win, values carry
— and report where they disagree with what the file said. **One issue per
channel**, carrying its worst moment, because "Panel 3 is wrong" is actionable
and forty rows of "wrong at 1.25 s, wrong at 1.37 s" are not. Where the cause is
obvious it is named: a channel whose own speed setting cannot deliver the ramp
the frames ask for is the common case, and reads as a mystery otherwise.

#### The two doors

- **Work out the bricks** — applies it and keeps it. The receipt names every
  channel it could not reproduce.
- **Work them out and review…** — applies it but holds the original frames
  alongside. The banner lists the issues; clicking one selects its brick, parks
  the playhead on the worst moment and scrolls it into view; the brick is
  outlined amber on the timeline; and the inspector carries a live line —
  *"against the original: off by 340 (8%) at 1.40 s"* — re-measured on every
  rebuild, so **watching it turn to "matches" IS the fix**. Accept anyway is
  allowed and says what is still different.

**Both doors keep the original frame list in the library as
“<name> (frames)”.** Accepting a conversion changes what the
droid does wherever the bricks disagree, and a conversion is a guess by
construction, so the thing it was guessing at survives under its own name —
for comparison, and for going back. Discard restores the frame list byte for
byte and leaves no copy behind. Leaving the routine abandons a pending review
rather than stranding a banner you cannot see.

A channel that moves but has **no panel** cannot be a brick at all — a
brick's ref IS an actuator. It is reported as its own kind of issue with a
*map it…* button onto the bench's Channels step, and it lives in
`blockTraceCheck()` rather than in the proposal so that review mode's
re-measurement cannot lose it. Reporting it as a numeric mismatch would be true
and useless: the number is the whole of its motion and no amount of dragging
closes it.

#### Tests

`tests/blocks-trace.test.js`, 28 assertions, both builds, in `./test.sh`. Its
spine is a round trip in the opposite direction from `roundtrip.test.js`: author
a routine as bricks, compile it, throw the bricks away, and require the tracer to
find its way back — including a lane used twice, so excursions must split,
and a partial-travel brick, so the amplitude must survive. **On the compiler's
own frames it must come out with zero issues**; if it cannot re-derive what the
compiler produced it has no business guessing at a stranger's file. Proven red by
making the fall start at the peak instead of the end of the plateau (five
channels go wrong). Liveness is proved in both directions on one brick: shift it
and the error grows, put it back and the error returns to exactly what it was.

Also: the import log now says when routines arrived as frame lists and that the
sequencer can work the bricks back out of them — the one place a person is
already reading after an import.

**2016 assertions, 31 suites, both builds, zero failures**, plus PCA Studio's 86.


### 2026-08-18 — v1.48.1: the part mapping rides the file

Found by the suite written for it an hour earlier. `tests/roundtrip.test.js`
exports a routine, wipes the sim and reads the file back; on the *starter* table
the bricks came home through the v1.48.0 comment and on the *tuned* one — the
fixture shaped like a real builder's — they did not.

**The cause was older than the bricks.** A Pololu `<Channel>` carries name, mode,
travel, speed and acceleration; there is no "which panel does this drive"
anywhere in a `.mstr`, and a MaestroPCA channel table is no better. So
`mstrParse()` and `pcaHeaderParse()` re-derived it with `guessPart(name)`, and a
**wholesale** import (`mstrApply()` — the file IS the table) replaced whatever
the builder had assigned by hand with that guess.

On the starter table nobody could see it: the names ARE the guess. On Mike's they
are not — "Panel7" wired to the CAD lane `panel5`, because his physical panel
numbering is not the CAD's — and a round trip through **his own exported file**
came back with:

- channels 11 and 12 **both claiming `panel6`**,
- `panel5` and `panel11` driven by **nothing**,
- and every brick naming either of them unwired, compiling to nothing, so
  `blocksTryAttach()` correctly refused the lot (63 frames' worth of bricks
  recompiling to 54).

**The frames were exact throughout.** That is why this lived through every
release that ever exported a `.mstr`: the droid moved correctly, and only the
*model* was mis-wired. It became visible the moment v1.48.0 gave the bricks a way
home, because re-attachment is the first thing that ever had to agree with the
mapping.

**The fix** is the same trick, in the same place, for the same reasons:
`actsPack()` (export.js) writes the mapping by channel index as base64 inside a
comment — `<!--r2sim:acts …-->` in the `.mstr`, `/* r2sim:acts … */` in the
header — that Control Center and the compiler both ignore, stripped and
rewritten on every export so a stale copy cannot survive. `actsUnpack()` /
`actsApply()` (import.js) read it for **both** families, because "which panel is
this channel" is one question whatever file it arrived in, and apply it **per
channel**: an entry present in the comment wins, a missing one keeps
`guessPart()`, and an empty string is a real answer meaning *mapped to nothing*.
`buildMstrText()`'s two return paths now go through one `mstrSidecar()` so a
third comment cannot be added to one branch and forgotten in the other.

Adoption is deliberately untouched. `mstrMatchChannels()` still ranks an exact
authored name above the act (v1.47.1) — the name is the human's meaning, and
now that the source act is authored rather than guessed the two simply agree
more often. Nothing rewrites your channel table on the adoption path; only the
wholesale import, which is the one that replaces it by definition.

Five assertions in `tests/roundtrip.test.js` (the file carries the comment; the
hand-assigned mapping comes back rather than the guess; the bricks therefore
re-attach; and the header reader gives back the same). **Proven red** by making
`actsApply()` a no-op — three fail, including the brick count dropping to zero.
**1988 assertions, 30 suites, both builds, zero failures**, plus PCA Studio's 86.


### 2026-08-18 — v1.48.0: unwired panels in all playback, and bricks that survive a round trip

Two asks in one message, both riding on the round-trip report
(2026-08-18, run against v1.47.1).

#### Unwired panels move in ANY sim playback, not just the sequencer

Mike: *"if the user Loads the sequence shoudl that then become availble if
nt we need a way for people to trigger sequences as part fo the SIm (not
hte sequencer)"*. v1.47.2 covered preview and scrub; now the pad, a
loadout slot, `restartScript(n)` — anything that plays a library routine —
moves the unmapped panels too. `seqStart()` recognises the routine **by
frames identity** (`MSTR.sequences.find(q=>q.frames===frames)` — the
runtime hands it the library sequence's own array, so no caller changed)
and `seqStepPlayback()` calls `seqFreeOverlay()` after each frame: the
unwired bricks' envelopes onto `ACT_T` at the slot's own clock, parked
shut when the slot ends. Model only — `liveWrite()` still sees exactly
the compiled frames, so the real droid cannot be commanded on a channel
that does not exist. Built-in stand-in ANIMS ('anim' slots) are not
routines and are untouched.

#### The bricks survive export/import — "commented out", exactly as asked

Mike: *"could we not export teh Bricks info into the export files that
are commented out - but when we import we can import them as bricks"*.
The report measured the loss: adopt an imported routine, drop ONE brick,
and 19 frames become 8.

- **Writers**: the choreography `.json` always carried `blocks` verbatim.
  `buildMstrText()` now appends `<!--r2sim:blocks <base64>-->` before
  `</UscSettings>` (stripping any older copy first), and the sequences.h
  generator appends `/* r2sim:blocks <base64> */`. base64 because an XML
  comment cannot contain `--` and a C comment cannot contain `*/` — no
  user-authored name can break either file. Control Center and the
  compiler ignore the comments entirely.
- **Readers**: `mstrParse()` / `pcaHeaderParse()` decode the comment into
  per-sequence CANDIDATES (`blocksCand`); the choreography reader's
  candidates are the `blocks` already in the JSON. `mstrApply()` and
  `mstrAdoptSequences()` hand them to **`blocksTryAttach()`**
  (maestro/blocks.js): compile the candidate bricks against the
  DESTINATION table and require the same frames, duration for duration
  and target for target (0 and a hole both mean untouched). Pass → the
  routine is a routine again, fresh brick ids, frames regenerated from
  its own bricks. Fail (endpoints or speeds changed since export) → the
  frames stay the truth, the bricks are dropped, and the log counts both
  outcomes by name. The frames-win rule keeps the guarantee that an
  import never invents motion.

Eight new assertions across `tests/mstr-share.test.js` and
`tests/sequencer-ui.test.js`, each proven red first (the negative case:
slow a destination channel after export → bricks dropped, frames intact).
Full estate green, both builds, plus PCA Studio's smoke test.

#### The round trip gets a suite of its own

Mike: *"create a test sequence, export it out, clean the sim so it doesn't exist
and then re-import and see if its the same."* Nothing asked that end to end —
`mstr-share.test.js` proves the retargeting maths and `maestro-import.test.js`
proves the readers, but neither wipes the app and starts again, so a routine
could survive the parser and still be lost by the chooser, the loadout or
persistence.

**`tests/roundtrip.test.js`** (47 assertions, both builds, in `./test.sh`) builds
one routine of eight bricks — all four motion modes, two partial-travel amps, a
deliberate overlap, a nested library sequence, and a name
(`RT probe: "Mike's" <wave> & co`) that has to survive XML escaping and a C
string — exports it as a choreography `.json`, a `.mstr` and a `sequences.h`,
then clears `localStorage`, reloads, rebuilds the same droid from the wizard and
reads each file back through the chooser's real buttons. It runs the whole thing
**twice**: on the starter table, and on one shaped like a real builder's — every
pair asymmetric about 6000, one channel inverted, one homemode Off with home 0,
and two channels named so `guessPart()` disagrees with the wired act.

**Frames: identical on all four routes**, both tables, both builds. **Bricks:
identical too, since this release** — except through a `.mstr`, and that
exception is a finding:

- **A `.mstr` carries no part mapping.** `genChannelsXml()` writes name, mode,
  travel, speed and acceleration; there is no `act` in a Pololu settings file and
  never was, so `mstrParse()` re-derives it with `guessPart(name)`. On the
  starter table the names ARE the guess. On Mike's — "Panel7" wired to the CAD
  lane `panel5` — the import re-wires the droid: channels 11 and 12 both come
  back claiming `panel6`, `panel5` and `panel11` are driven by nothing, and a
  brick naming either is unwired, compiles to nothing, and `blocksTryAttach()`
  correctly refuses (63 frames' worth of bricks recompile to 54). **The frames
  are still exact**, which is exactly why this was invisible until v1.48.0 gave
  the bricks a way home. The fix, when it is wanted, is an `act` riding the same
  comment the bricks already ride in; the suite asserts the CURRENT behaviour in
  both directions so that fixing it turns red rather than passing silently.

Both v1.47.1 bugs were re-introduced to prove the suite goes red: the
`mstrSrcEnds()` revert reverses the homemode-Off channel (4649 where 7216
belongs) and fails three assertions; the `mstrMatchChannels()` revert cross-wires
the two misleadingly-named panels and fails one.

Two fixture traps are written into the suite's header because each cost an hour:
an untouched channel is a sparse hole on one side and a `0` on the other (both
normalise to 0, or ~250 phantom differences bury the real ones), and retuning
endpoints after `makeStarter()` leaves the starter *frames* speaking the old
ones, so the library must be rescaled with the recalibration or the fixture —
not the round trip — is what differs.

**Still OPEN from the round-trip report** (deliberate, not forgotten):
merge-path adoption leaves the loadout untouched *silently*; the
choreography door clamps a stale out-of-range target while the `.mstr`
door does not (the two disagree and only one says so); and brick colours
live in `PREFS`, so no export carries them. (The fourth item on this list — the `.mstr` carrying no `act` — is
FIXED in v1.48.1 above.)

### 2026-08-18 — v1.47.2: unwired bricks work on the model

Mike: *"For panels that I havent mapped yet I should be able to add them to a
sequence or see them in an exsisting sequence, Alos they should 'Work' on the
sim and once I or a user maps them they will then work in the real model."*

The first half shipped in v1.46.0 — the grey brick that lands, keeps its
timing, and compiles to nothing. This is the second half: **the grey brick
now moves the 3D droid** in preview and scrub, while everything board-facing
stays exactly as it was.

- **`blockEnvAt(b, t)`** (blocks.js) — the brick's shape alone, in 0..1 of
  its own throw, amp and motion mode included, no channel needed. It MUST
  mirror `blockValueAt()` mode-for-mode; `blockValueAt()` keeps its own µs
  arithmetic (round the open end first, then the lerp) so the compiled
  frames stay byte-stable — the two carry a change-together comment.
- **`blockFreeAt(seq, ms)`** — every unwired act brick's openness at an
  instant, keyed by act, defaulted to 0 so a free lane parks SHUT outside
  its bricks, exactly as a wired channel parks at base-closed. Later bricks
  win, the wired path's layering rule.
- **Scrub**: `blockPoseAt()` lays the free map over the model through a new
  host hook, **`BLKH.applyFree(act, v)`** — defined only by the sim's host
  (writes `ACT_T`); PCA Studio's host has no droid and simply lacks it,
  which is the gate blocks.js checks. **Play**: the follow loop (`blkTick`)
  applies the free map at the playhead's instant while the edit slot runs,
  and parks the free lanes closed ONCE when the preview ends — the same
  landing the compiled home frame gives wired channels.
- **Nothing board-facing moved**: the compiled frames are asserted
  byte-identical with the brick present, live drive goes through
  `liveWrite()` which the free path never touches, and the skip-by-name
  warning and *map them…* door stay. The tooltips and the preview toast now
  say the true thing: **model only until mapped** — map the panel and the
  same brick starts driving the real droid.

Six new assertions in `tests/sequencer-ui.test.js` (proven red first,
`blockEnvAt is not defined`). Full estate green, both builds, plus PCA
Studio's smoke test.

### 2026-08-18 — v1.47.1: choreography round-trips stop reversing and cross-wiring

Mike: *"check thise two for sequence differences"* — his choreography export
(20:41) against the sequences.h it was exported alongside (20:40). The .h
matched his library **byte-for-byte**. But his library also carried three
`·`-suffixed twins from re-importing that very .h as choreography-only, and
those were wrong two independent ways:

- **Reversed.** `mstrSrcEnds()` (the v1.46.1 foreign-file heuristic) used
  `home || neutral || 6000` for the source's shut end. A MaestroPCA header
  stores **home 0** for a homemode-Off channel (rest is computed, not
  stored) and `pcaHeaderParse()` fills that hole with 6000 — so a
  round-trip of OUR OWN directed file was rescaled through a fictional
  mid-travel "shut", and on any pair asymmetric about 6000 (4530–7293) the
  invented "open" landed on the wrong side: every panel in the adopted copy
  reversed, shut-for-open. The heuristic now fires **only on an explicit
  Goto home inside the pair** — the one case where somebody measured it —
  and otherwise uses the directed pair, which is exactly right for our own
  exports and the only honest default for anyone else's.
- **Cross-wired.** `mstrMatchChannels()` preferred the source's act — which
  is ALWAYS `guessPart(name)`, a guess — over an exact authored name match.
  Mike names a channel "Panel7" and wires it to the CAD lane `panel11`
  (his physical panel numbering is not the CAD's); the guess read "Panel7"
  as `panel6` and adoption landed two panels' choreography on each other's
  channels. **An exact name match now outranks the act**: the name is the
  human's meaning, the guess is ours. Same-number fallback unchanged.

Verified against his actual files: with both fixes the three adopted twins
are **target-for-target identical** to the sequences they round-tripped
from. Regression tests in `tests/mstr-share.test.js` (the reversal proven
red first with an asymmetric homemode-Off fixture; the probe channels are
named so the guess disagrees with the wired act); the old "preferred the
part name" assertion updated to the new tier order (name → act → index).
Full estate green, both builds, plus PCA Studio's smoke test. His library
still holds the three corrupted `·` twins from before the fix — delete
them (they were duplicates; the originals are what the .h carries).

### 2026-08-18 — v1.47.0: bulk edits on the multi-select, and the snap picker moves to the timing line

Mike: *"on the sequencer I should be able to select mulitple and copy, delete
and extend the run time and even bulk change if its an open, open and close
or just close"*, and *"there should be a selector for Snap to nearest
auto-snap next to the timeline timming line"*.

- **Bulk edits.** Copy and delete already existed on the multi card
  (Duplicate / Remove, v1.40.0). It gains **Runs for** — a number input that
  sets EVERY selected brick's duration (200–8000 ms, the single-brick
  limits; shows the longest and says `· mixed` when they differ) — and
  **Motion**, the same four-shape dropdown as the single-brick inspector,
  applied to every selected act brick (nested-sequence bricks have no motion
  of their own and are skipped; picking "Opens, then closes" DELETES the
  stored mode, the single dropdown's contract). `blkMultiDur()` /
  `blkMultiMode()` sit beside `blkMultiDuplicate()` — one undo snapshot per
  gesture, selection kept, and undo genuinely restores the old values
  (asserted through the real `#sqUndo` button).
- **The snap picker.** It has existed since v1.12.0 — four modes, Auto /
  strong beats / all beats / off — but lived in the transport top bar among
  ten other controls, and Mike asked for it as a missing feature: a control
  nobody finds is a feature that does not exist (the standing lesson from
  v1.39.x). It now IS the timeline ruler's **corner cell**: same
  `#sqSnapWrap` id (the test contract), built by `blkTimeline()` passing the
  detached corner node into `buildSnapPicker(host)` — the id lookup stays as
  a fallback. The transport span is gone from `body.html`; the select got
  `max-width:82px` to fit the 118 px sticky lane column. It exists exactly
  when the timeline does, which is exactly when snapping means anything.
- **Servo speed: no change needed.** Mike: *"on Accelleration and speed set
  to 100 it still doesnt feel fast enough"* — the bench inputs already
  accept Pololu's full ranges (speed 0–16000, acceleration 0–255), so 100
  is nowhere near the ceiling, and **0 means unlimited**. Answered rather
  than coded.

Tests: eight new assertions in `tests/sequencer-ui.test.js` (proven red
first — the transport assertion no longer claims the snap picker). Full
estate green, both builds, plus PCA Studio's smoke test.

### 2026-08-18 — v1.46.1: the half-open panels, and the travel rule made a standing constraint

Mike, first: *"The panels on the model should not match the settings within
the user's Servo settings — they are used for approximation not exact, as a
user may have weird offsets to make it work in their model, so we should avoid
making the sim's panels' endpoints match the real endpoints."* Then a
screenshot: every dome panel standing half open, the periscope hovering
mid-rise.

v1.46.0 settled the rule at `chanEnds()` but **two readers still treated a
settings µs as a pose**, and both park panels at mid-travel:

- **`blockClosed()` was `home || neutral || 6000`.** A bench-made channel
  (`setupBlank()`: `home:0`, no `neutral` column) fell all the way through to
  6000, so every routine the brick sequencer compiled rested every panel HALF
  OPEN — first frame, home frame, and the pose held after playback. That is
  the screenshot. And `blockOpen()` — "whichever endpoint is further from
  home" — drove a reversed pair toward its own SHUT end. Both now come from
  the directed pair: `chanEnds().shut` / `.open` (falling back to `c.min` /
  `c.max` in PCA Studio, which loads blocks.js without playback.js — same
  convention, the bench's own).
- **`chanRest()` obeyed an explicit Goto home, always.** A stale stored
  starter from before v1.45.0 carries `home:6000, homemode:'Goto'` on every
  mapped channel, which resurrected the exact v1.45.0 half-open bug through
  the store. Now the ACTUATOR's answer wins for any part on screen — a door
  rests shut, a gimbal centred — even when the channel carries a measured
  Goto home; a **board-only** channel (nothing on the model to lie) still
  obeys its Goto home.

Swept the remaining `c.home`-as-pose readers: `groupToSequences()`'s base
frame (cad/parts.js), the Maestro pane's "+ Sequence" base (ui-pane.js) and
the anzellan starter's live-pose seeding (starters.js) all go through
`chanRest()` now; config/tab.js's assign-test fallbacks follow the directed
pair. **One deliberate exception:** adopting a FOREIGN file's choreography
(`mstrRetargetFrame()`) keeps the home heuristic for the SOURCE file only —
`mstrSrcEnds()` — because a Control Center pair is always sorted and its home
is the only directional tell; the destination side uses the directed pair.

Tests: five new assertions in `tests/sequencer.test.js` (each proven red
against v1.46.0 first), `mstr-share`'s inverted-mounting adoption updated to
the split convention. Full estate green, both builds, plus PCA Studio's smoke
test.

**The standing constraint, recorded so no future session builds the
opposite:** the model's panels are an approximation. A feature that calibrates
the sim panel's on-screen travel, endpoints or rest pose to the user's
measured µs values is out of scope **by design**, not by oversight. The
lesson repeats v1.45.0's: when a rule about a field changes, grep for EVERY
reader of that field — `blockClosed()` was the sixth of "five separate
places".

### 2026-08-17 — v1.46.0: the sim stops inheriting a bad bench

Six items, and the big one is a rule rather than a feature.

#### The model's travel rule

Mike: *"it should always assume that the initial setting on the low of a servo
is Closed and whatever its set to is the max open on the model — the settings
for min and max on a real servo are only really for the real model and not for
the sim — this way we avoid a poor physical setup ruining the sims look and
functionality — they may have had to use a weird offset or something."*

**On the model a channel's `min` is SHUT (0) and its `max` is FULLY OPEN (1) —
directed, never sorted, whatever the numbers are:** a 200 µs span, a 700 µs
offset or the higher number first all animate the same full sweep. One
implementation, `chanEnds()` in `maestro/playback.js`, with `chanNorm()` and
`chanDenorm()` as its only two directions; `chanRest()`, the music routine
builder, the Pose min/max buttons and `cad/parts.js` all go through them and
nothing sorts the pair any more. **The bench's convention won** — reversing a
linkage IS min and max the other way round (`hw-table.js`), with no flag —
because it is reachable from the UI, it is one number pair, and it cannot drift
from what the channel table shows. **`c.invert` is retired**: it said the same
thing a second way, nothing in the bench could ever set it, and combining it
with a sorted pair is exactly what made a reversed panel stand wide open on
screen while the real one was shut. A file that still carries `invert:true` is
**adopted, not ignored** — the two ends are swapped, the flag cleared, and the
swap logged (`chanAdoptInvert()`). **The real board is untouched**: `liveWrite()`
sends the authored µs, always. A poor physical setup is fixed at the bench, on
the servo, never by quietly writing a different pulse.

Two consequences worth knowing. `All min` / `All max` in the Pose view now drive
every channel to *its own* shut and open end, so "All min" means everything shut
— on a reversed channel the old one flung the panel wide open. And the ⇄ tick in
the Maestro pane's channel table is now the bench's REVERSE: it swaps the two
ends rather than setting a flag nothing else believes in.

**Reaffirmed 2026-08-18 as a standing constraint on future work.** The model's
panels are an *approximation*: the on-screen endpoints are the rig's own (shut,
and its full open sweep — `cad/parts.js`), and the servo config's µs pair
contributes direction and normalisation only. Never make the sim panel's visual
endpoints match the real endpoints — a user's real values may carry weird
offsets that only make sense on their physical linkage.

#### A brick you have not wired yet

Mike: *"The user should be able to drag into the sequencer non mapped items but
keep them grey - they may not have the servo setup in the real model yet but
want to build a sequence."*

v1.45.0 put every moving panel in the brick library and **refused** to let you
drag the grey ones. Now the drop lands, the brick renders dashed and grey
wherever bricks are drawn, and it survives save and reload. The compiler still
never emits a row that drives nothing: an unwired brick is **skipped with a
named warning** under the timeline — *"1 brick is not wired to a channel yet:
Pie 1"* — with a **map them…** button beside it, and the emitted `.mstr` /
`sequences.h` is byte-for-byte what it would be without the brick. Give the
panel a channel and it compiles.

#### The import job, said out loud

Mike: *"we should make it clear on the import that they select what they are
importing as clear selections not hidden in advance."*

Three cards, in his words: **import servo config only**, **import servo config
and choreography**, **import choreography only** — each naming what it TOUCHES
and what it LEAVES ALONE. A choice the file you dropped cannot satisfy is
unavailable **with the reason on it**, rather than quietly missing. Then the two
confirmations he asked for:

- **Servo config, when there is work worth keeping** (`setupSaveWorth()` — the
  v1.38.3 gate: ticked, named, calibrated or edited, because travel alone is too
  narrow) says what is about to go in counts you recognise, and offers **cancel**,
  **save a copy first**, or **replace**.
- **Choreography** offers **save existing, then replace** or **add as
  additions** — a merge that names how many landed and how any clash was
  renamed, and that refuses rather than truncates if the board's slot limit
  would be passed.

"Save a copy" is a **download**, Mike's choice: a timestamped `.json` written
through the export path, and the import does not proceed unless the file lands.
The choreography backup needed a writer of its own (`seqLibExport()`,
`maestro/export.js`) and it is written in the shape the existing reader already
understands, carrying the channel table alongside — frame targets are meaningless
without the endpoints they were tuned against.

The prompt lives at the **reader's** door (`servoCfgImportFile()`), not only in
the chooser, so the Maestro pane's import button, the bench's Channels step and a
dropped file all ask it. Three doors that used to replace an afternoon's
calibration in silence. A dropped `.json` or `.h` now opens the chooser instead
of importing on the spot. And there is an **import sequence** button on the
sequencer desk, beside *Build your Maestro* — the two file ends of that screen.

#### Mike's two defaults, and the conflict he accepted

*"This should be the default option as in first and selected in the list"* — so
**one controller, two expanders** (`p1x2`) leads the PCA arrangements and is the
shipped answer, and `buildDefault()`'s `domeServo`/`bodyServo` are `mpca32` to
match, because a default that disagrees with its own derivation is a build
nobody chose. *"the DY-sv5w should be the first and default option"* — it was
already first; it is the default now too.

He was asked what that does to the sketch: a co-processor answers the droid like
a Maestro, so **padawan360 mod2026 can drive neither** — it writes its own I2C
pulses and it opens an MD-YX5300. He chose to keep mod2026 as the default sketch
anyway. So a brand-new build now shows **exactly those two objections**, on the
firmware card and on the review, and because the firmware is not pinned on a
build nobody has answered, **one click on "let the setup choose" lands Maestro
2025 (PWM) and clears both**. This is deliberate, it is his call, and there is a
test that pins it to two objections so a third cannot drift in unnoticed.

#### And the bug the merge produced

Two agents' work met in this release and both had reached for the same new
function. `chanAdoptInvert()` guarded the flag at its *call site* in
`chanEnds()`, while `servo-cfg.js`'s importer called it for **every** channel in
a file — so a straight round-trip of our own export came back with every
channel's ends swapped. Caught by an existing assertion ("importing our own
export restores the travel"), and fixed where it belongs: the function no-ops
when there is no flag and reports whether it did anything, so it cannot matter
which caller remembers to check.

**1909 assertions, 29 suites, both builds, zero failures**, plus PCA Studio's 86.


### 2026-08-17 — v1.45.0: Mike's list, all thirty items

One list, five areas, one release, because he asked for it in one release. The
through-line is the standing brief: **simple by default, the detail one
deliberate click away** — and, this time, four separate cases of a screen whose
own explanation had crowded out the thing the screen is for.

#### Setup

**It opens in light mode.** `PREFS.theme` defaults to `'light'` on a first run;
anybody who has chosen dark keeps dark, because the default only applies when
there is nothing saved. `stageTheme:'follow'` stays — a light frame gets a light
stage, and holding the stage dark by default would be a two-tone choice the
backdrop picker already exists to make.

**Servo hardware is image-led.** The step used to open with a dropdown. It now
opens with **photographs of the two families** — a Pololu Maestro and a
PCA9685 — and only the chosen family's questions follow: for a Maestro, *one
board or two* as a real question rather than something implied by which wiring
diagram you clicked; for PCA9685, the arrangement as a picture, defaulting to
**one controller and two expanders**. The chained-versus-a-port-each choice went
behind one Advanced tick, and it opens itself if that is the arrangement you are
already on, so no answer is ever hidden from the person who gave it. The shipped
`buildDefault()` still says `p0` on purpose — see §6.

**One size of rail chip.** Every step chip is 178 × 44 whether it carries an
answer line or not, whether it is active, done or not-applicable. Bold no longer
reflows the row, and a long answer no longer stretches its neighbour. Asserted
with `getBoundingClientRect()` across all fifteen.

**Reset clears the servo config — and always deleted it.** The button removed
`r2sim.prefs.v1`, called `servoStoreClear()`, then reloaded. What nobody had
noticed is that `servo-store.js` flushes `MSTR` on `pagehide`, and
`location.reload()` fires `pagehide` — so the store was deleted, rewritten from
the still-populated in-memory table, and restored at boot. This was not
`buildEnsureMaestro()` refilling the hole (that would have come back with
factory endpoints; Mike saw *his own* names). The fix blanks `MSTR` first, so
the exit flush has nothing worth writing, and the confirm now names both the
build answers and the channel table out loud.

**The wiring diagrams say BETA**, in the app and on the exported sheet, with one
sentence saying what beta means here: check it against the board's own pinout
before you cut a wire.

**The Wiring step's Boards section is gone.** It was dead on arrival for the
default build — `BOARD_IMG`/`BOARD_PINMAP` only cover the four Pololu Maestros,
a mod2026 or PCA build got a bare numeric grid, the pin buttons deliberately do
not open the picker for mod2026, and its failure messages were written to
`$('cadMsg')`, an element that does not exist while the wizard is up. So half of
it could not work and the other half told you nothing, silently.
`app/boards.js` stays: `chPartOptions()` is what `HW.parts()` reads and the
whole `drives` column depends on it.

**Every file this app saves carries the date and the time**, to the minute —
`fileStamp()` in `core/util.js`, one function, eight writers. A date alone
collided: three attempts at one calibration were three files with the same name
and the browser silently renamed them `(1)`, `(2)`.

#### The servo bench, and one bench only

**Mike's column order, with the first six columns pinned.** `#`, board·pin,
use, name, **configure**, drives, then the numeric half. His screenshot showed
`configure…` clipped to "co…" off the right-hand edge of a sixteen-column
scroller — so reordering alone would only have moved the clipping to whatever
column landed last. The identity columns are `position:sticky` with offsets
*measured* in JS, because `name` is elastic and a hard-coded `left:` breaks the
moment a font or a name changes. Headers and cells now come from **one**
`setupChCols()` table: they used to be two hand-kept lists paired only by
position, which is a trap that fires the first time somebody reorders one.

**A dome map inside the bench.** `buildDomeMap()` already existed and already
had the right contract — it draws the dome and calls back with the panel you
clicked, and never writes a channel itself. It is mounted in the Channels step
now, so a channel's part can be chosen by clicking the panel on a top-down
drawing rather than hunting a dropdown of forty names. Gated exactly like the
`drives` column, because PCA Studio loads this file and does not load
`dome-map.js`.

**The second bench is folded into the first.** `#hwWrap` — the "Servo hardware"
overlay — is gone, and the six-step bench is the one place a channel is
configured. Nothing that could drive a real servo was allowed to disappear with
it: the live **drive** and **position** columns, the board link row and
all-home / all-off came across. `hw-table.js` stays untouched because PCA Studio
loads it; `hw-ui.js` is now the router that points the old doors at the bench.

**Leaving the bench disconnects the board.** Same lesson as v1.39.4's sequencer
arm: a connection you can no longer see is a connection you have forgotten. On
exit it disarms, then disconnects, and the servos hold where they are — a limp
servo holding a loaded panel drops it. Stepping between the bench's own steps,
and cancelling the dial, do not disconnect. Sim-only, host-gated: Studio's port
belongs to its page.

**And two of the bench's export buttons never worked in the simulator at all** —
`servo-setup.json` and `servos.h` called a bare `download()` that exists only in
PCA Studio, so both threw `ReferenceError`. Proven with a test that clicks them
and watches for page errors.

#### Sequencing, and the file formats

**One guided front door** for the four jobs the Maestro pane had spread across
eleven buttons: build sequences, import a config, export, assign panels to
channels. The eleven buttons are still there, collapsed, so every existing entry
point and id survives.

**The sequencer lists every moving panel.** It listed only channels that
already drive something, which is the wrong way round for the screen you go to
*because* a panel is not moving yet: an unconfigured mover is now a dashed grey
chip, and dragging one refuses with a reason and an offer to go and map it,
matching what the Pose view already did. The `!c.act` rule stayed where it was —
Studio's own `blocks-host.js` is a separate copy — and the compiler still refuses
to emit a brick that drives nothing.

**A PCA9685 configuration can be read, not only written.** "Either format, both
ways" is the ask; the honest definition of "a PCA9685 configuration" is **this
project's own `servos.h` / `sequences.h`** — read back what we write, testable
against something real, rather than guessing at a stranger's sketch and landing
their numbers on your linkages. Crossing the boundary loses fields (the
Maestro's per-channel speed and acceleration, `homemode`, our own easing, the
serial block), and **every one of them is now named to you** rather than
silently dropped, which is the contract `mstrAdoptSequences()` already modelled.

**And one canonical sentence** says what can be imported and what can be
exported, in the places where those jobs are chosen. The dropzone's list had
omitted the servo-config `.json` it has always accepted, and the file picker
narrows by board family while the reader is deliberately wider — that gap is now
stated instead of discovered.

#### The practice circuit

**The furniture adapts to the track.** Barriers were placed every 6th sample and
kerbs every 3rd, at a fixed offset, with fixed-size rails — so pitch scaled with
lap length while the pieces did not, and the offset compressed by `(1 − d/R)` on
the inside of a corner. Below R ≈ 3.7 m inner rails interpenetrated (the *stock*
hairpin already did), below 0.86 m the whole barrier ring inverted and posts
landed inside the racing line, and any lap under about 27 m had rails overlapping
everywhere. Mike's screenshot was all three at once. Now: one squeeze factor per
side keeps the outermost ring inside 80% of the local radius, so layer order and
clearances survive any bend; fixed-size pieces are spaced in **metres along the
ring they sit on** rather than every Nth centreline sample; a piece that no
longer fits is **dropped, not overlapped**; and `trackNearest()` remembers which
stretch you were on, so two passes 1.5 m apart stop teleporting the droid across
the track and charging it two seconds.

**The pinch warning stopped switching itself off.** `adjacentArc` was
`max(2.4*1.5, total*0.05)` and the arc between two samples can never exceed
`total/2` — so on any lap under 7.2 m *every* pair was skipped as "the same
stretch" and the warning was always empty. Exactly the circuits that break worst
were the ones told nothing. Warn-but-allow is still the rule: nothing blocks a
save.

**Gates are sorted into track order** on save (adding one on the start straight
used to make it the *last* gate you had to cross), and the painted chequer, the
grid and the timing line now all sit on gate 0 instead of disagreeing.

**Named layouts.** `PREFS.tracks = {v:1, active, list:[…]}` — save as new, load,
rename, delete, with the stock lap always available and never overwritable
(SAVE on it forks a copy). A v1.44.1 `PREFS.track` is upgraded into the library
on first read, and the whole-setup `.json` carries the library while still
importing an old file. `trackLibPersist()` reads the write back and rolls PREFS
forward only if it landed, because `prefsSave()` swallows quota errors.

#### The Model Builder

**Repaired.** Nine defects, all reproduced before they were fixed. The one that
earns "broken": deleting a joint unregistered its `ACT` key but never rebuilt
the Outputs table, so `updateOutputs()` threw `Cannot read properties of
undefined` **every frame**, sixteen times a second, for the rest of the session.
The others: `mbRebuildFromPrefs()` did no ACT bookkeeping, so importing a setup
while the builder was on stage stranded the old assembly's channels and
registered none of the new ones (and rebuilt twice, the first time from the
pre-import assembly); `mbSavedPartValid()` checked that `channels` was an array
but never its contents, so a foreign `PREFS.builder` claiming `['doorL','pie0']`
could **delete the droid's own actuators** on the next model switch; duplicate
saved ids left an unselectable, undeletable ghost mesh on the stage;
`builderActLabel()` read live state that is empty until you visit the Builder,
so every wired joint read "Joint 1" in the sequencer and on the wiring sheet;
`mbRename` and `mbSetAxis` ignored kiosk mode; attach rounded rotation but not
position, so the 50 mm grid invariant quietly did not hold for anything that had
ever been attached; a rebuild never wrote its own result back, so the same
"corrupt part record" warnings replayed on every load forever; and a storage
failure lost the build in silence — it says so now.

**And the five things he asked for on top:** collapsible usage instructions
(ATTACH TO is the whole point and nothing said so); **drag-and-drop** with
auto-connection to the nearest compatible socket — parts describe sockets now,
a drag is only a drag when the pointer went down on a part, and every
auto-attach is announced and undoable; **driven centre-pivot plates**, which
also meant fixing the four places that hardcoded `type === 'hinge' || 'ball'`
where `MB_PRIM[type].joint` is the general test (the same four would have left
phase 2's face parts behind); **per-joint preview sliders** that stand down for
a board-owned channel; and a **model file** of its own to export and import, so
a mechanism can be shared without shipping a whole droid config, with a schema
version on `PREFS.builder` for the next record-shape change.

#### And the small ones

**Panels rest shut.** The pie panels sat half open because a channel with
nothing measured into it rests at `DEFAULT_NEUTRAL` — mid-travel — and five
separate places seeded the pose with `c.home || c.neutral || DEFAULT_NEUTRAL`.
Mid-travel is right for a gimbal and wrong for a door. `chanRest()`
(`maestro/boards.js`) is now the one reader: an explicit Goto home is obeyed
always, a bipolar actuator (a holo pan/tilt, a head gimbal, a builder joint)
rests centred, and everything else — pies, side panels, doors, the drawer, the
arms — rests at 0, which is shut. `makeStarter()` already knew this rule; nothing
else did.

**The MAESTRO 2025 chip is out of the header.** Mike: "Remove the Maestro 2025
reference/image." The read-only firmware tag spelled a board maker's product
name across the title bar of every screenshot he takes. The sketch is still a
build answer, still named where it is chosen and in the Config summary — the
header just does not brand itself with it. And `all_open` / `all_close` were the
only two pie animations that stopped at eleven, so "Everything close" used to
leave `pie11` standing open in the Outputs table all session.

**1827 assertions, 29 suites, both builds, zero failures**, plus Studio's 86.
227 new ones, every one proven red against the old code first.


### 2026-08-17 — v1.44.1: the first two jobs of the public era

Small, and both the same shape: something that was fine on one machine and
wrong the moment the project had more than one.

**One browser launch, not thirty-one.** `tests/harness.js` owns the Chromium
flags now; every suite and both browser tools call `launchBrowser()`, and the
eight that play sound call `launchBrowser({audio:true})`. This is the fix
whose absence cost thirty-two file edits the day before: every one of those
files carried its own copy of an `executablePath` pointing at a path that
existed in exactly one container, so the whole estate ran nowhere else. The
harness's header says that, and says that a browser it cannot find is
answered by `npx playwright install chromium` and never by a path in a file.
1600 assertions plus Studio's 86, green on both builds, before and after.

**The workflows run on node24.** `actions/checkout@v6`,
`actions/setup-node@v6`, `actions/upload-artifact@v6` and
`softprops/action-gh-release@v3`. GitHub deprecated the node20 action runtime
and every run had been raising a warning since the repo went public. Both
files carry a note saying that if the warnings come back the runtime has moved
again, and the majors get bumped rather than the warning silenced.


### 2026-08-17 — v1.44.0: ready to be handed to strangers

The project goes public. Mike has MrBaddeley's permission to publish the
geometry (2026-08-17), and the repository is rebuilt around the idea that
the next person to read it will not be one of us.

**The credits travel with the file.** `app/about.js` — Menu ▸ About ▸
Credits… — names MrBaddeley and the limit of his permission, the Padawan360
BSD-3-Clause notice, three.js's MIT, Pololu's photographs and Printed
Droid's panel drawing. It is in the APP, not only in `CREDITS.md`, because
the simulator travels as one self-contained HTML file and most of the people
who ever run it will never see a repository. `appConfirm` learned that
`no:''` means there is genuinely one way out — it used to fall through to
`|| 'Cancel'` and put a Cancel button on a message with nothing to decide.

**A clean public tree.** Loose bench artefacts to `examples/`, four one-off
sketches to `arduino/bench-sketches/`, the not-responding writeup to
`docs/`. Pololu's `manual_english.pdf` was dropped rather than republished —
their document, one click away at pololu.com/docs/0J40. `tools/video-rig.zip`
unpacked, because a zip of source in a repository is source nobody reads.
The README is rewritten for someone who has never seen it: what it is, four
screenshots, download-one-file-and-open-it, and the fact that **this finds
real firmware bugs** stated up front, since that is the argument for the
whole approach. `CREDITS.md`, **`LICENSE` (MIT)** and
two GitHub Actions — every push builds and runs all 29 suites plus Studio's,
and a `v*` tag builds, tests and attaches `R2D2-Simulator.html` to the
release, which is where the README's download link points. The dist stays
untracked: a tracked build is how the shipped file went four versions stale.

**MIT, scoped.** Mike's choice (2026-08-17). It covers this project's own
code, stylesheets, hand-drawn artwork, docs and the MaestroPCA library —
and `LICENSE` then spends forty lines saying what it does NOT cover, because
a licence can only give away what the licensor owns: the geometry is
MrBaddeley's (permission to publish, not to redistribute), the Padawan360
lineage stays BSD-3-Clause, three.js is MIT in its own right, and the board
photographs are the manufacturers'. `APP_LICENCE` in `core/util.js` is the
one string the About box reads.

**And the "rc flake" was never a flake.** `tests/rc.test.js`'s bar assertion
has been red in the container for months, written off as timing. It fails
identically every single time: it hard-coded 0.5 for a raw axis reading of
0.47, which was true before channels grew a **deadband** — and `rcNorm()`
rescales OUTSIDE the deadband rather than subtracting it, so 0.47 on a ±1
channel with dz 0.06 is (0.47−0.06)/(1−0.06) = **0.436**. The bars were
right and the test was measuring the wrong number, 0.004 outside its own
tolerance. It derives the expectation from the channel's calibration now and
WAITS for the DOM rather than counting two animation frames. Proven red by
freezing the readout. **29 suites, 1600 assertions, zero failures** — the
first fully green run in this container in months, which matters now that
every push runs them in public.


### 2026-08-16 — v1.43.0: the servo config stops evaporating, and the boards get faces

Mike's list, in one release: board pictures on the hardware cards, sounds
during setup, a link box on the main screen, the dial's wording, the
overwritten servo config, an edit-what-I-have door, driving from the dome
map, Finish offering the file, a sequencer clear-all, and "Model only" →
"Sim only". 24 source files, 4 suites extended, one new module and one
module split out; 1591 assertions green on both builds plus Studio's 86.

**The channel table was never saved. That is the whole bug.**
Mike: *"Going into Servo Hardware page seems to have overwritten my
settings in 'Set up your servo hardware'."* Nothing overwrote anything —
`HW.save()` called `prefsSave()`, and PREFS has never held `MSTR`. The
names, the measured endpoints, the part mapping, the speeds and the whole
sequence library were **session state**. Any reload — a refresh, a crash, a
laptop waking up — dropped them, and then `buildEnsureMaestro()` saw
`MSTR.loaded === false` and generated a starter over the top: every channel
named after its panel, 1000 / 1000 / 2000 µs, boot ticked. Which is exactly
what Mike photographed, and exactly what "it overwrote my settings" looks
like from the outside. The Finish step's own prose ("an hour of calibration
that exists only in one browser's localStorage") described something that
was not happening.

`maestro/servo-store.js` now write-throughs the table to its own
localStorage key on every `HW.save()`, restores it at boot before anything
can generate a starter, and `buildEnsureMaestro()` refuses to regenerate
over a table with work in it whatever `loaded` says. Its own key, not a
corner of PREFS: `prefsSave()` swallows quota errors, so folding a big
sequence library in would mean one oversized routine silently taking the
theme and the build answers down with it. Sequencer edits coalesce through
`servoStoreTouch()` (500 ms) with a `pagehide` flush. Proven red first: with
the two hooks removed the reload assertion comes back
`{"cal":false,"loaded":false,"engine":false}`.

**Sounds during setup, the half that was never the keyboard.** v1.39.6
fixed letters typed into a channel name falling through to the pad map, and
Mike came straight back with *"Its still triggering sounds when using the
setup menu"* — because automation fires a random track every 3–10 seconds on
its own clock and the pad-connect greeting fires whenever a profile
reloads, which is what changing a hardware answer does. The gate is at the
BOARD now (`sndTrigger`, one line, guarded on `uiModalOpen()`): the sketch
still calls `playTrack()`, the log still records it, `SND.track` still says
what the board was told. Only the speaker is unplugged.

**A picture on every hardware card.** `config/board-art.js` + a drop folder.
Put `syren10.jpg` in `src/art/boards/`, run `./build.sh`, and that card has
a photo — `tools/build.js` inlines everything in that folder as data URLs
into both builds, so the single-file dist still works off a memory stick.
The name IS the API: `<option-id>.jpg`, or `<step>-<option-id>.jpg` for the
three ids that answer two questions. Until a photo lands, each card draws a
themed SVG stand-in in `model-art.js`'s idiom (a PCA9685 is a strip of
sixteen three-pin headers; the Flipsky card draws the ESC *and* the hub
motor, because the answer is the pairing). The four Pololu boards use the
real labelled photos `app/board-img.js` already carries. The firmware step
takes none on purpose — its ids collide with hardware ones. The servo step
is the one question answered with dropdowns rather than cards, so it gets a
captioned strip (`wizBoardPics`) instead. `src/art/boards/README.md` lists
every filename and the size/licensing caveats.

**And the photos landed the next morning** — twenty of Mike's own, 600 × 450
each. Two things came out of putting real ones in. A photo's panel goes
**white** rather than letterboxing a white studio shot on a dark plate, which
read as a bright rectangle floating in a hole; and the twenty were trimmed of
their white borders and re-padded to a common 720 × 480 so twenty different
crops line up as one row (the untouched uploads are kept in
`src/art/boards/_originals/`, which the build skips — it only reads the top
level of that folder). The dist is 7.73 MB now, 0.95 MB of it photos. Three
cards still draw: `due`, `mp3trigger` and — the one worth having —
`mdyx5300`, which is the default build's own answer. See §6.

**The rest of the list.**
· A **board chip in the header bezel** — status and connect/disconnect for
  the PCA bridge without opening a full-page tool, repainting through the
  same `serialUiRegister` registry as every other link surface.
· The dial's three capture buttons read **Set MIN / Set CENTER / Set MAX** —
  a bare "MIN" reads as a label for the box under it.
· **Edit, not redo.** With a config in hand the servo step's card is *"Edit
  the servo config you have"* and opens the bench **on the Channels step**,
  not four questions in front of it; starting the hardware questions again
  is the small answer underneath. The bench pane's button says *"Edit
  current servo config…"* for the same reason.
· The **dome map drives**: a ▶ on every channel row (one end, the other,
  back to rest — through `HW.drive()`, so the engine, the model and the wire
  in that order), press-again to stop, and a connect bar that says whether a
  real servo is on the end of it.
· **Finish offers the whole setup as one file** before it lets go — one
  `.json` with the build answers, the channel table, the sequences, the
  mapping, the colours and the scene. The ASK lives on the button
  (`wizFinishAsked`), never inside `wizFinish()`, which six suites call
  directly — a promise in the middle of it would leave a modal open across
  whatever ran next.
· The sequencer has **Clear all**, with a confirm that always appears
  (a confirm that only sometimes appears is one nobody reads) and one undo
  snapshot, like every other multi-brick gesture.
· `⚡ Model only` → **`⚡ Sim only`**, matching the mode of the same name.

**And a bug the release stumbled over: PCA Studio's hardware wizard could
not open.** v1.42.0 lifted six hand-rolled Escape handlers into
`escGuard()` and put it in `core/dialog.js` — which Studio does not load,
though it *does* load the shared `maestro/setup-hw.js`. `setupOpen()` threw
`ReferenceError: escGuard is not defined` on its first line and had been
doing so ever since, unnoticed, because **Studio's smoke test was not in
`./test.sh`**. Same shape as that release's own trap note about checking
every manifest, one layer down: a helper a SHARED module depends on has to
be as shared as the module is. `escGuard` is `core/esc-guard.js` now, in
both manifests; Studio's smoke test is in `./test.sh`; and three of its
assertions that had gone stale against v1.40.0's deliberate "the dial does
not arm boot" change were corrected rather than deleted.


### 2026-08-15 — v1.42.0: all four batches of the improvement review

Everything in `docs/IMPROVEMENTS-2026-08-15.md` (the report now carries a
STATUS block), in one release. 38 source files changed, 11 suites extended;
all 29 suites green in the container (~1660 tests; rc's one
container-timing flake unchanged), key suites re-run against the dist.

**Batch 1 — the Builder's road.** The channels wall speaks plainly and
carries a door: "mod2026's servo map is compiled into the sketch…" with an
OPEN THE SETUP — FIRMWARE button that lands on the Firmware step (the
Maestro/PCA-live path already worked — verified, untouched). Finish is
model-aware ("take me to my build/head/Mouse/droid") and finishing with the
Builder lands ON the Builder pane. A first-run-only "Where next?" card
offers Drive it (press START to arm) · Learn to drive · Build a sequence —
or Start building when the model is the Builder; shown once
(PREFS.seenNextCard). The wizard's Panels step and its "the droid is beside
you" line are model-aware, with a note and a door under non-droid models.
A 🔧 BUILD stage button appears beside the model chip whenever the Builder
is on stage (kiosk hides it with the rest of stageTools). Track and Learn
now say so when a non-droid model is on stage (one toast per entry, no
auto-switch). mbRebuildFromPrefs is hardened like track.js: per-record
validation, the hard cap re-checked, and pass-2 reparenting refuses cycles
SYMMETRICALLY (the naive one-at-a-time check only caught half a mutual
cycle). Builder mutations and selection refuse in kiosk — the fifth guard.

**Batch 2 — the first five minutes.** Pushing a drive input while disarmed
now says "Feet are disarmed — press START (Enter) to arm." — one seam in
pollInput() where keyboard, on-screen pad and real pad converge; rate
limited, never in kiosk or under a modal, dismissed on arming. The DRIVE
chip is a button: it presses virtual START, so the sketch sees a real edge
and keeps its own bookkeeping. Wizard chips distinguish assumed from
answered: a question chip is hollow until its step has been VISITED
(PREFS.wizVisited; existing configured builds grandfather to all-visited,
keyed on the raw saved blob because PREFS.build is incidentally created at
boot). The rail groups nine questions from six jobs ("jobs — come back any
time") and the footer counts "Question N of 9", naming jobs as jobs.

**Batch 3 — robustness and seams.** The Maestro pane's Drives dropdown is
built from chPartOptions() (rename-aware, CAD-driven; static PART_LIST
kept only as the CAD-unloaded fallback and for actFriendly), and
cad/select.js's Port row never shows a raw act id again. escGuard() in
core/dialog.js replaces six hand-rolled Escape handlers — dialog wins,
dome map closes above the wizard, byte-identical precedence, no test
edits needed. The kiosk sequencer-delete guard was investigated and proven
unnecessary BY CONSTRUCTION (EDIT.active and kioskOn() are mutually
exclusive at every entry point — documented, not padded). Three new
regression tests: multi-select undo actually RESTORES (proven red by
dropping the snapshot call), explode of a compiled mode-brick routine
(pins the truth: blockCompile's closing home frame means a compiled
routine cannot end open), and the dome map's two-click pan→tilt rule.
Dead weight: 15 uncalled functions removed (five in config/hardware.js,
two whole section builders in look/startup.js, blkSelPrimary and
blockLaneIndex among them) plus the dead CSS classes; pcaseq.js left
alone (PCA Studio's API). The setup .json now carries RC calibration,
brick colours, favourite colours and puppet cues, format still v1,
absent-key = keep current; round-trip tested.

**Batch 4 — words, docs, splits.** "Back to workshop" → "← Back to Drive"
and every user-visible "workshop" outside the backdrop is retired (kiosk
prose now says "the full app"). The top-bar BENCH workspace is labelled
**Board** (id unchanged) — "bench" now means only the servo tool. The
strip header's "· sub Name" moved behind Advanced. One noun: every
user-visible "routine" in the sequencer became "sequence" (~28 strings;
new default name "Sequence N"; the Pololu term "subroutine" untouched).
setup-hw.js split at its own comment boundaries into setup-hw.js +
setup-hw-channels.js + setup-hw-cal.js — pure move, proven by the
multiset-of-non-blank-lines md5 matching before and after. **The split's one trap, caught at ship time:** PCA Studio has its OWN manifest (pca-studio/manifest.json) listing setup-hw.js — the Studio build silently dropped the channels table and the cal dial (247→211 KB) until the two new files were added there too. A bulk move in a SHARED module means checking every manifest that names it, not just src/manifest.json. README brought
back to truth (97 JS / 14 CSS / 29 suites / ≈6.75 MB / four models, the
module and suite tables completed, the bite-list re-verified); HANDOVER §2
and §5 corrected by the docs patch alongside this entry. APP_VERSION
1.42.0.

### 2026-08-15 — Improvement review of v1.41.0, journey first (docs only)

A cold walkthrough of the built v1.41.0 plus three parallel source reviews
(journey/integration, code quality, docs truth). Full ranked report:
**`docs/IMPROVEMENTS-2026-08-15.md`** (screenshots in
`docs/shots/review-2026-08-15/`). Nothing fixed yet; the report ends with a
four-batch order.

The finding that should not wait: **the Builder dead-ends on the default
build** — pick Builder on a mod2026 build, add a hinge, and the CHANNELS
card says "switch the build to a Maestro" with no door, in jargon, at the
feature's first-success moment. Related walls: Finish always says "take me
to my droid" and lands a Builder user in Drive view two clicks from the
parts bin; the wizard's Panels step lists the droid's panels under
MODEL=Builder ("The droid is beside you" — it is not); the stage chip
named BUILDER opens the model picker, not the tools. The 2026-08-14 UX
items (arming silence, all-ticked first-run rail, Step-N-of-15) remain
open and remain the top of the funnel.

Code quality: `mbRebuildFromPrefs()` trusts hand-edited setup files (no
field guards, no cycle check on restore, no cap — track.js is the hardened
sibling to mirror); the Maestro pane's static PART_LIST and
cad/select.js's hand-copied Port row still show names the v1.40.0 label
rule was built to end; six overlays hand-roll the same Escape pattern;
~14 dead functions (one of them added by v1.40.0 itself) and ~40 lines of
dead CSS; four named test gaps. Perf: the dist growth is payload data, not
app code — recorded so nobody chases it.

Docs: README and HANDOVER §2/§5 have fallen behind the app (counts, sizes,
missing modules/suites/features, an eight-vs-nine contradiction in §2) —
one sitting's pass, and the README is the front door for the publish plan.

### 2026-08-15 — v1.41.0: the Track Builder and the Model Builder, phase 1 of each

Mike answered the design questions (all recorded in
`docs/DESIGN-builder-and-track.md`, which now carries a STATUS block) and
chose "both". All 29 suites pass in the container (~1520 tests; rc's one
container-timing flake unchanged).

**Track Builder** (`app/track-edit.js`, new; `app/track.js` refactored).
The hard-coded TRACK_SHAPE is now only the DEFAULT: `trackShapeData()`
reads `PREFS.track` {shape, gates as curve-t, cones} field-by-field with
validation, and `trackBuild()` consumes it — laps, penalties, barriers and
best-lap untouched. The editor is a full-page JS-built overlay (✎ EDIT
beside the stage TRACK button, hidden by kiosk's existing stageTools rule):
top-down ±7 m canvas, the SAME Catmull-Rom sampler as the stage so the
preview cannot lie, drag points (pointer capture, redraw in place),
right-click adds/removes (floor of four), Gates and Cones modes, RESET TO
DEFAULT, and the 2.4 m non-adjacent spacing rule recomputed on every edit —
offending stretches stroke red with "barriers may overlap (allowed)";
Mike's decision was warn-but-allow, so SAVE always works. Save writes
PREFS.track and rebuilds the live circuit. uiModalOpen() is wrapped so pad
keys stay gated while it is open. track-ui: 52.

**Model Builder** (`scene/builder.js`, new) — the FOURTH stage model,
picked in setup (fourth SVG card) or the stage model picker. A base plate
plus five primitives — beam, plate, disc, hinge (one channel), ball joint
(pan + tilt, TWO channels — Mike's decision) — on a fixed 50 mm grid
(decision), soft-capped at 8 parts with a note, hard-capped at 12
(decision). ATTACH TO parents a part into another's THREE subtree
(transforms preserved, cycles guarded), so a hinge rotates everything built
on it — forward kinematics by scene graph, no solver (decision). Joints
register acts `bldJ<n>`/`bldJ<n>t` ONLY while the Builder is on stage —
the exact ANZ_ACTS pattern — so the sequencer, live drive, the channel
pickers and the OUTPUTS table pick them up with no changes; the naming
seam (actPartLabel/actFriendly) routes them through `builderActLabel()`
(the part's name, else "Joint N pan/tilt"); and `wiringRows()` extends its
order at row time so builder joints PRINT on the wiring sheet (decision).
Builds persist in PREFS.builder and travel in the setup .json (with
PREFS.track riding along, version-gated like env). Builder never takes the
pad. NOTE for next session: `maestro/builder.js` owns the `BLD`/`bld*`
identifier space — the model builder is `MB`/`mb*` for that reason.
New suite tests/builder.test.js: 38. mouse and chrome suites' hardcoded
three-model assertions updated to four (the only test edits).

**Not built yet, by phase:** face parts (eyes + brows + mouth, all three
together — phase 2, Mike's pick), Track Builder multiple layouts & share
(phase 2). APP_VERSION 1.41.0.

### 2026-08-15 — v1.40.0: Mike's feedback batch — setup silence, honest labels, Others, and a bigger sequencer

Twelve items from Mike's 2026-08-14 walkthrough feedback, in one release.
All 28 suites pass in the container (~1428 tests; the rc bars-redraw test
still fails only THERE, on any tree — container timing).

**"selecting boxes in setup makes noises from the sound files"** — found by
instrumenting `mp3.playTrack` with a stack capture: the startup wizard's
option cards are focusable `<div>`s whose Space/Enter keydown bubbled to the
window pad-map (gamepad.js guarded only INPUT/TEXTAREA/SELECT/BUTTON), so
the running sketch saw an A-press and played a random track. New
`uiModalOpen()` (core/util.js) gates the pad map whenever any full-page
overlay is open, and the target guard now covers label/a/contenteditable.
Keyup still clears unconditionally so no key can stick. Regression test in
keyboard.test.js, watched red first.

**"why do multiple say pie 5"** — chPartOptions no longer appends the CAD
base name to the label ("Pie 2 (Pie5)" → "Pie 2"); the CAD name rides in
the option tooltip. Four inner pies really are all called Pie5 in the
Fusion export — the label rule (lead with the human name) now holds in the
bench map dropdown too.

**"option to choose others that are not part of the model"** — ten
placeholder actuators `oth1..oth10` ("Other 1".."Other 10") registered in
core/actuators.js, model-independent, no CAD part. They appear in every
mapping surface under "Not on the model", in a new OTHER section on the
Panels step, and — deliberately — as sequenceable lanes (BLKH.actions
already accepts any channel with an act). actPartLabel/actFriendly name
them at the naming seam so bricks and the wiring sheet never show a raw id.

**"boot should not be auto ticked just because it's setup"** — a channel
newly enabled on the bench now defaults homemode 'Off' (limp; boot
UNTICKED): setupUse only resets homemode on a genuine off→on transition,
setupCalCommit no longer forces 'Goto', and the apply-all default reads
'limp'. Imported files keep their own homemode — the import stays
authoritative. Watched red first in hw.test.js.

**"do the driven-by names match the servo config?"** — they do now: one
label rule (chLabel/chLabelTip in boards.js) everywhere — the servo-config
channel name when set and non-generic, else the part label, else bare
`ch N`; the tooltip carries the full story.

**Panels ▶ tests drive the real servos** when the bench link is streaming —
routed through HW.drive (engine → model AND wire), home again after a
second, '⚡ tests drive the real servos' note shown, never in kiosk, and
guarded against the planned-wiring pin table (its channel numbers are not
live MSTR indices — driving through them would have hit the wrong servo).

**The top-down dome map is back for setup** — it had only ever lived in the
.mstr import wizard's Map step. buildDomeMap is parameterised (channels
passed in) and the wizard's Panels step gains '🗺 Dome map…', an overlay
ABOVE the startup wizard bound to the live channel table, assigning through
HW.setPart (clear-then-set). Import wizard byte-for-byte unchanged
(maestro-import 66/66).

**Maestro tab renamed** to **Servo / Sequence config** (ids unchanged), and
the pane's three stacked lists — Sequences, Script loadout, Subroutine
index — are ONE list: slot badge, name, generated sub name, frames·length,
▶, with the "N of M on the board" footer. `.ldrow .nm` selectors still
satisfiable, ordering stays in ⚙ Build your sequences.h.

**Sequencer** (blocks.js/blocks-ui.js):
- **Per-brick MOTION mode** — Opens-then-closes (default, unchanged) /
  Opens / Closes / Closes-then-opens, a basic-level dropdown on the brick
  inspector; irrelevant ramp sliders hide per mode. blockCompile now CARRIES
  each channel's value between frames (seeded closed), which is what lets an
  'Opens' brick stay open past its own end — proven identical on
  'oc'-only routines by frame-diffing pre/post compile in a node harness.
- **Explode on drop** — dropping a library sequence onto the timeline now
  expands it into per-part act bricks (span extraction per channel: t0,
  dur, rise to first max, fall from last max, amp, mode 'o' if it ends
  open). Channels with no part are counted into a toast ("N channels have
  no part assigned — left out"). The preview card keeps 'Insert as one
  brick' for the old behaviour.
- **Multi-select** — Shift/Ctrl-click toggles bricks into a selection;
  inspector shows 'N bricks selected' with Duplicate (group copy lands
  after the selection, +200 ms) and Remove; Delete/Backspace deletes;
  Escape collapses. BLK.sel stays scalar (blkSelIds/blkSelPrimary helpers)
  so every old call site is untouched.

**Also:** APP_VERSION 1.40.0; sequencer suite 98, sequencer-ui 144,
build-config 235, hw 56, keyboard 29 — all green both builds.

**Designs, not code:** `docs/DESIGN-builder-and-track.md` — the
Meccano-style buildable model (fourth stage model, Anzellan-precedent act
registration, three phases) and the top-down Track Builder (TRACK_SHAPE →
PREFS-driven data, 2D editor, then multiple layouts). Ends with the
decisions Mike needs to make before either starts.

### 2026-08-14 — v1.39.5: the 23 review bugs, fixed

Every finding in `docs/CODE-REVIEW-2026-08-14.md` is fixed (the report now
carries a STATUS line saying so). Eighteen source files changed; the work was
fanned out one-file-per-agent so nothing collided, and every subtle fix was
verified by execution before landing. All 28 suites pass in the cloud
container against dev.html (the one rc bars-redraw test fails THERE on the
pre-fix tree too — container timing, not a regression).

**The §1 five, and how each was closed:** `serialWrite` now converts through
`serialTicksFor()`, which follows `HW.freq()` instead of assuming 50 Hz, and
`serialSetFreq` clears `SER.lastTicks` (serial-link.js). The bench's
500–2500 µs unlock now moves the ENGINE's working range too — new
`calApplyRange()` called from the wide tick, the typed-end unlock and
calSweep's restore (setup-hw.js). `genFrameRow` fills holes with 0 so a
brick-compiled routine round-trips onto the right channels, and
`buildMstrText` splices XML with replacement FUNCTIONS so `$` in a name is
not a pattern (export.js). The sequencer's Save calls `loadoutRename` +
`reindexSubs` when the name changed (blocks-ui.js). The Panels-table
reassign confirms BEFORE freeing anything, so Cancel is a real no-op
(config/tab.js, chPicker's order).

**Also fixed:** volume 0 now means silence (`SND.vol ?? 30`, soundbank.js);
seq-brick boundaries clip at the brick's end (blocks.js); the serial-UI
callback is a named function so registration dedupes, and `hwLinkRender`
preserves the monitor + re-applies `SER.modeWarn`, with the warn-bar buttons
wired inside `monWarn()` so a re-render cannot orphan them (hw-ui.js /
serial-link.js); a USB unplug now calls `serialDisconnect()` from the read
loop's exit; the sketch importer got real `static` locals (hoisted
`__st_<fn>_<name>` slots), a correct integer-division fold
(`a*b/c → __idiv(a*b,c)`, chains nest, unprovable runs left alone with a
caveat), per-parameter int typing, `new Array(n).fill(0)` for uninitialised
arrays, and `hasServos`/`footPWM` DERIVED from what the sketch actually
drives — an imported Maestro sketch's restartScript animations are no longer
stomped by the PCA sync path (sketch-import.js; sketch + profiles suites
pass, fixture flags match the hand ports). The library search and the
bench's simple-step number fields no longer rebuild the input under the
caret; the Maestro pane's Drives dropdown clears the previous holder (one
part, one channel); lint's chan-home skips Off/Ignore channels; the setup
file now carries `PREFS.env` (the backdrop the popover always promised);
the Anzellan starter is filed under its own name; the starter's script-size
warning is gated on a board that HAS a script store; the builder's footer
speaks sequences.h on a PCA build and its dead SCRIPT/SUBROUTINES stats are
gone; ▶ Play ♪ applies every frame it passes; the stale 12-pies hint copy
and the Group-name off-by-one are corrected. APP_VERSION 1.39.5.

**Tests: six new regression tests, each watched RED against the pre-fix tree
first** — serialTicksFor@200Hz and the wide-unlock engine range (hw, now 46),
hole-serialisation (maestro, 26), Save-rename loadout survival
(sequencer-ui, 112), Cancel-is-a-no-op (build-config, 222), volume-0 silence
(sounds, 15). Suites touched: hw, maestro, sequencer-ui, build-config,
sounds.

### 2026-08-14 — Code review: 23 confirmed bugs, none fixed yet (docs only)

Four parallel reviewers read every module (payload data files excluded); 25
candidates were raised and each re-verified against the source before being
kept — several proven by executing the code under node. The full ranked
report is **`docs/CODE-REVIEW-2026-08-14.md`**. The deliberate firmware
reproductions were excluded; none of the 1349 passing tests catches any of
these.

The five that can hurt real hardware or real files, fix first:
`serialWrite()` converts positions with a hard-coded 50 Hz period while the
bridge is reprogrammed to `HW.freq()` — at 200 Hz a 1500 µs target goes out
as a 375 µs pulse (serial-link.js:283); the bench's 500–2500 µs unlock widens
the dial but never `c.min/c.max`, so MAX can capture an endpoint the servo
never reached (setup-hw.js:1178 vs 1009); `genFrameRow` keeps array holes, so
brick-compiled routines lose columns in the `<Frame>` row and a `.mstr`
round-trip drives the wrong servos (export.js:81); the sequencer's Save
renames without `loadoutRename`, silently dropping the routine off the board
and renumbering every later slot (blocks-ui.js:867); and the Panels table's
channel-reassign frees the old channel BEFORE the "Channel in use" confirm,
so Cancel destroys the part's wiring (config/tab.js:122).

Also in the report: volume 0 plays at full gain (`SND.vol||30`), the
serial-UI callback registers itself exponentially, four sketch-importer
miscompilations (static, int division, param types, arrays) plus imported
Maestro sketches getting `hasServos:true` which kills their restartScript
visuals, seq-brick compile overrun past the brick's end, unplug not noticed
until a write fails, two rebuild-under-the-caret input bugs, and more.

### 2026-08-14 — UX review: setup to sequences as a first-time user (docs only)

A cold walkthrough of the built v1.39.4 dist — fresh state, no prior knowledge
assumed — from first load through the wizard, the workshop, servo setup and the
sequencer, looking for friction, duplication and things that say the wrong
thing. No code changed. The full report, with priorities and the evidence, is
**`docs/UX-REVIEW-2026-08-14.md`** (screenshots in `docs/shots/ux-2026-08-14/`).

The two findings that should not wait: **bricks on parts with no assigned servo
silently vanish from what the board plays** (`blockCompile()` drops channel-less
bricks; the model still animates them, nothing says so), and **the sequences.h
builder's footer gives the Pololu Control Center procedure on a PCA build**
(the hint in `maestro/builder.js` is unconditional while the script preview is
correctly gated on `bldIsPca()` — the v1.39.1 class of fix, one instance
missed). Also confirmed: `makeStarter()` still logs the "holds 0 — trim
sequences" warning the v1.29.0 linter dropped, and the PCA validate column
shows dead SCRIPT 0/0 B stats.

### 2026-08-14 — v1.39.4: leaving the sequencer disarms live drive

Mike: *"comming out of sequencer shoudl dissable live mode."*

Right, and for the same reason the identification tint is dropped two lines
away in the same branch of `setStripMode()`: **live drive is sequencer state.**
The arm is deliberately loud while you are at the desk — an amber, pulsing
button that says `⚡ Live servos` — and the instant you press *Back to
workshop* that signal is off screen while a pad cue or a music track can still
reach the board through the same `playback.js` seam. An arm you cannot see is
an arm you have forgotten.

Two things it deliberately does NOT do:

- **it does not drop the link.** The port stays open and the bench keeps
  working; only the arm goes. Re-entering the desk does not restore it either
  — arming is a decision, and a decision that re-makes itself is not one.
- **it does not release the servos.** They hold their last position, which is
  `liveSet(false)`'s own rule: a limp servo drops whatever it was holding up.

`liveSet()` takes an options object now so the caller can pass a `why`, shown
as a toast — a droid that quietly stops following is worse than one that says
why it stopped.

**Tests: 1349 passing across 28 suites, both builds** (was 1348). The new one
also asserts `liveReady()` is still true afterwards, so a future "tidy up on
exit" cannot start closing the port on the way out.


### 2026-08-14 — v1.39.3: Play did nothing on a PCA build, and the Part column named the wrong thing

Three from one message, with a screenshot of the channel map attached.

#### "pressing play on the sequencer doesnt appear to do anything"

It did nothing. One line in `app/main.js`:

    if(PROFILE.hasMaestro) maestroStep(period/1000);   // Maestro runs on its own clock

`maestroStep()` is what walks `MAESTRO.slot` — and a sequencer preview IS a
slot (`seqStart('edit', …)`). That gate was correct when only a Pololu board
could hold a routine. **v1.27.0 opened the desk to PCA9685 builds**
(`buildCanSequence()`: "in practice that is every build") and the door opened
while the clock behind it stayed shut. On mod2026, `hasMaestro` is false, so
Play set the slot and nothing ever stepped it — no error, no log line, nothing
moving. The Frik head animation, which `cad/ui.js` parks in the same slot
table, was dead the same way.

`maestroStep()` is profile-agnostic — it walks whatever slots exist — so the
fix is to call it unconditionally; on a sketch with no Maestro it costs one
empty `for…in`. **A door and its clock are one feature**, and this is the
second time in this codebase they have been opened separately.

The regression test asserts against `mod2026` specifically (with a check that
`hasMaestro` really is false, so it cannot quietly stop proving anything) and
was run against the OLD line first to watch both assertions fail. The last
frame of the test routine drives to the MIDPOINT rather than the shut end,
because a target of min normalises to 0 and "did it move?" cannot be asked of
a 0 that is also where it started.

#### "the attached doesnt appear to match what I configured"

Nothing was wrong with the mapping. The **Part** column showed the CAD name,
and four of the six inner pies are all literally called `Pie5` in
MrBaddeley's Fusion export — `cad/naming.js` opens by saying so. So a table
whose *Drives* column read "Dome pie 2, 3, 4, 5" had a Part column reading
"Pie5" four times. Correct, and unreadable.

It leads with `actPartLabel()` now — the builder's rename, else the build's own
"Pie 2" — which is what the brick, the wiring sheet and the Panels table all
say. The CAD name is one hover away, where it belongs for anyone matching this
against a Fusion tree.

#### "in the sequncer only parts that are assigned to servos should be displayed"

The brick library already worked that way: `BLKH.actions()` has always filtered
to servo channels WITH an actuator, because a brick for a channel that drives
nothing is a brick that does nothing. **Pose and Frames did not** — they listed
every channel in Servo mode and handed the unmapped ones a "map it to move it"
hint, which on a 24- or 32-channel board is a column of dead rows between you
and the ones you came for.

They follow the library now (`seqPoseChans()`). Nothing is silently swallowed:
the count is stated under the list and one click brings them back, because a
board-only channel is real — it just has nothing on this model to move, and
since v1.39.0 it can still be driven live.

**Tests: 1348 passing across 28 suites, both builds** (was 1344).


### 2026-08-14 — v1.39.2: assigning a servo to a panel, from where you are standing

Mike, straight after finding the servo config import: *"ok where do I assign
servos to panels?"*

It was a fair question with an unfair answer — **three** places, and not one of
them where you would be standing when you asked:

- the setup wizard's **Panels** step (part-first: every pie, side panel, door
  and arm with a *Driven by* channel dropdown, a colour and a **Test**),
- the setup wizard's **Wiring** step, further down, on the board cards
  (pin-first: click a pin, pick the part),
- clicking the part on the 3D droid — the selection card's **Port** dropdown.

All three are real and all three stay. What was missing was a route from the
screens where you are already thinking in channels. Asked where he wanted one,
Mike said all of the above:

**1 · The bench's channel table now has a `drives` column.** Naming a channel
"Pie 3" and telling the app it moves Pie 3 are the same thought; splitting them
across two overlays is why the mapping gets forgotten until a sequence moves the
wrong flap. The column is **host-gated** through the HW seam — `HW.parts()`,
`HW.partAt()`, `HW.setPart()` exist in the sim and simply do not in PCA Studio,
which has no droid, no CAD and no parts, so the column does not render there. A
host that cannot answer "what parts are there" is not a host with no parts; it
is a host the question does not apply to.

`HW.setPart()` clears the part off whatever channel held it before setting it —
**a part has exactly one channel**, the same clear-then-set `cad/select.js` has
always done, because two channels claiming one panel is the bug that reads as
"it moves twice as far". The dropdown says which channel currently holds a part
rather than stealing it silently, and the step re-renders after a change because
another row's dropdown really did just change.

**2 · An *Assign panels…* button on the Maestro/Bench pane**, which opens the
setup **on the Panels step** (`wizStepIndex('_panels')`), not at the start of
the wizard.

**3 · The part-first table is back on the Config tab**, under its own `Panels`
anchor in the section nav. This partly reverses the July rule (*"anything that's
in the setup should be removed from the config tab"*) and does so deliberately:
that rule was about the build QUESTIONS — which board, which sketch, what colour
— and the panel map is not a question but a table you come back to when a
linkage is rebuilt or a servo moves to a spare channel. It is the **same
builder** (`buildAssignSect`) the wizard step uses, so the two cannot drift, and
the suite's "the Config tab does not repeat the setup" assertion was split
rather than deleted: boards and paint still must not be there, the panel table
now must be.

**Tests: 1344 passing across 28 suites, both builds** (was 1338).


### 2026-08-14 — v1.39.1: the servo config has a door back in

Mike, on a PCA build, looking for somewhere to load the file the app had just
written for him: *"where do I import the PCA servo setup I exported, the only
thing I see the mestro one which should be hidden by default only the abilty to
import meastro sequencs should be available"*.

**An export with no visible import is a trap.** `servoCfgExport()` had exactly
one way back in — the setup wizard's Servo setup step — which you reach by
re-opening the build wizard, on a step about a job you have already finished.
Everywhere else offered *Import your config…*, which reads a Pololu `.mstr`: a
different file, doing a different job, for a board this builder does not own.

Three doors now, all through one picker (`servoCfgPick()` / `servoCfgImportFile()`):

| where | why there |
|---|---|
| the bench's **Finish** step, beside `save servo config` | the way back in belongs next to the way out |
| the **Maestro/Bench pane** | where Mike was standing when he asked |
| the wizard's **Servo setup** step | unchanged — it was already right |

**Dropping the file works too, which it did not.** Both of this app's `.json`
exports land on the same drop handler, and the servo config was being handed to
the whole-setup reader and refused — the app rejecting a file it had written an
hour earlier. `jsonDropRoute()` reads the text once and routes on `kind`
(`servoCfgLooksLikeCfg()`), because neither the extension nor the name can tell
`R2-servos-2026-08-14.json` from `servo-setup.json`, and either may have been
renamed by whoever mailed it to you.

**Whose file is the file.** On a PCA9685 build the pane's primary import is now
the servo config, and the Pololu route becomes **Maestro sequences…** —
`mstrAdoptSequences()`, which plays somebody else's choreography through YOUR
servo settings and never touches the channel table. That is the half worth
keeping on any build: sequences are what the community shares, and a `.mstr` is
what they share them in. The whole-file import is still reachable for a real
Maestro→PCA migration, as a line of text under the bar rather than a button in
it, saying what it does (*"replaces your channel table with theirs"*). A Maestro
build sees exactly what it saw before.

The section heading follows: **Settings file** on a Maestro build, **Servo
config & sequences** otherwise — and the "where sequences live in Control
Center" note, which is Pololu trivia, is replaced on a PCA build by the sentence
that actually helps (make a starter table first, then import travel onto it).

**Tests: 1338 passing across 28 suites, both builds** (was 1333).


### 2026-08-14 — v1.39.0: the sequencer drives real servos, and the servo step stops asking for a file you already have

Two from Mike in one message.

#### "for the Sequencer we should have the option to drive the real servos too"

Everything this needed already existed and none of it was joined up.
`serial-link.js` opens by claiming *"the same drive slider, the same dial and
the same sequence that move the model also move the servo"* — but only the
slider and the dial ever called `HW.drive()`. The sequencer wrote `ACT_T`,
which is the 3D model and nothing else. You could build an afternoon of
choreography, watch it play perfectly, and never move a horn.

**The seam is `playback.js`, not the sequencer.** `applyFrameTargets()` and
`applyLivePose()` are what every routine goes through — the sequencer preview,
a pad cue, a music track, a brick routine — so arming once arms all of them
instead of leaving four half-features that disagree about what stop means.
`maestro/live-drive.js` is the new module; the switch sits beside the transport
because that is where you are standing when you decide to trust a routine.

**It goes through the bench engine, deliberately.** `HW.drive()` sets a target
and the engine streams positions; it does not write the target to the board.
That buys three things a direct write would not:

- the channel's **speed and acceleration** apply, so a frame that jumps 90°
  ramps — which is what the droid will do when the sketch plays the same
  sequence;
- targets are **clamped into each channel's own min/max**, so a routine built
  on somebody else's droid cannot drive this one past its stops;
- `serialWrite()` already de-duplicates, so a 60 Hz UI cannot flood 115200 baud.

**What it will not do is pretend.** Three states, and the button names the one
it is in: `⚡ No board` (click to connect) · `⚡ Model only` · `⚡ Live servos`,
amber and slowly pulsing, because `--am` is this app's warning colour and
something moving in the room is exactly what that colour is for. A
monitor-only board (`SER.blocked` — a co-processor's USB is a text console) is
never streamed to. Kiosk is never live: someone else is holding the laptop and
they did not agree to move your droid. **Unplugging disarms**, because silently
staying armed would mean the next connect starts driving with nobody expecting
it.

Arming asks once, and the warning is two facts that have each cost somebody a
servo: channels nobody has measured have endpoints that are a guess, and **the
first move on each channel is a jump, not a ramp** — the board does not know
where the horn is standing until something tells it. Disarming leaves the
servos **holding**, not released: a limp servo holding a heavy panel drops it.

One incidental: a channel with no `act` was skipped by `applyFrameTargets()`
entirely, because it moves nothing on screen. Board-only channels are real
servos, and would have been the one kind that could never go live. The model
update and the wire write are now separate conditions.

#### "if we are starting from a setup the settings should be imported automatically"

Automatically is what already happened, and that was the problem. The bench
edits the LIVE channel table — there is no file in between — so a builder who
had just spent an afternoon measuring came back to a step asking whether they
had a config, as though the last hour had not happened. Nothing remembered
where the numbers came from, so the step could not say.

`servoCfgNote()` records one line of history — how (bench · import), what it
was called, when, how many channels — written by `setupApply()` and by
`servoCfgApply()`. `servoCfgStory()` turns it into a sentence a builder
recognises as their own afternoon: *"measured on the bench a moment ago — 4
channels carrying travel"*. With that in hand the step leads with **"Yes — use
the ones you just measured"**, and the two answers beside it stop pretending
this is a fresh start: *"Import a different one instead"* and *"Measure them
again"*, with the note that measuring again is a continuation on the same
table, so a half-done afternoon is safe to walk back into.

`appConfirm` grew an opt-in `html:true` for the live-drive warning. Text stays
the default — a message built from a file name must never be able to inject
markup.

**Tests: 1333 passing across 28 suites, both builds** (was 1318). The live-drive
ones are in `hw.test.js`, next to the wire they exercise: disarmed is silent,
armed reaches the engine, a board-only channel still moves, a wild target is
clamped to this droid's travel, 0 still means leave it alone, and unplugging
disarms.


### 2026-08-14 — v1.38.3: the bench asks before it lets you go, and offers one file

Mike, after a bench session: *"It didnt prompt me to save config when id
finished - also why do we have two export methods .json and .h"*.

**The prompt.** It was gated on `servoCfgConfigured()`, which counts channels
whose min/max differ from the pair a fresh table is born with. His four
channels were named and switched to Servo but not yet taken round the dial, so
the count was zero and Finish said nothing — while the very same step was
warning him, correctly, that *"4 channels have endpoints you have not set on
the dial"*. The step knew there was work; the exit did not.

That gate was the `calibrated`-by-inference mistake in a second place, and the
comment three functions away already said why it is wrong: a channel can sit
on 4000–8000 because that is genuinely right, and can be typed to something
else and still be a guess. `setupSaveWorth()` replaces it and asks a plainer
question — *did somebody do work here*:

- a channel captured on the dial (`calibrated`), or
- a channel named something other than its number, or
- travel that is not the factory pair, or
- any edit at all this session (`SETUP.changedAt`).

An untouched table out of the profile still says nothing. The wording follows
the work, too: "4 channels set up" when nothing is measured, "2 channels
measured on the dial and 2 more set up" when some are. `servoCfgConfigured()`
itself now counts a calibrated channel regardless of its numbers, which is
what the wizard's "N channels already have travel set" meant all along.

**The two exports.** They were never two of a kind, and there were in fact
three files with two of them called `.json`:

| file | who needs it |
|---|---|
| **servo config** (`R2-servos-<date>.json`) | everybody — names and travel, importable into any build |
| `servos.h` | only someone compiling `MaestroReplacement` / `Esp32Droid` |
| `servo-setup.json` | a backup of the bench page — boards, wiring, power, table |

Finish now shows **one** button, `save servo config`, and it writes the same
file the Finish prompt writes — the two buttons producing two different
`.json`s was the actual confusion underneath the question. `servos.h` appears
only when the selected sketch is one that has to be compiled with it, named in
the sentence ("only if you compile **MaestroReplacement** yourself"), because
that is the only moment it means anything. The whole-bench `.json` moved under
the **Advanced** tick with the other things you reach for deliberately.

**Tests: 1318 passing across 28 suites, both builds** (was 1311). The seven new
ones include Mike's exact session — four channels named and ticked, nothing
measured, changedAt zero — asserting the dialog appears, and its opposite: a
table nobody has touched must not nag.


### 2026-08-14 — v1.38.2: PCA_Bridge lives with PCA Studio, not with the library

Mike, reading the new servo setup step: *"is this the right sketch
the repository's `pca-studio/PCA_Bridge` folder"*.

It is, and the wizard was telling him otherwise. The two sketches ship in two
different places, for a reason that is easy to forget once you are writing UI
text about both in the same sentence:

| | where | why |
|---|---|---|
| `PCA_Bridge` | **`pca-studio/PCA_Bridge/`** | it is a TOOL — the hardware end of PCA Studio's live mode, and a standalone bench tester in its own right |
| `MaestroReplacement` · `Esp32Droid` · … | `arduino/MaestroPCA/examples/` | they are what the LIBRARY is for |

Three places in the setup wizard claimed PCA_Bridge was an example of the
library: the holding link on the Servo setup step, step 4 of the co-processor
bench procedure, and the footnote under the bench buttons. All three said a
folder that does not contain it — which on a step whose entire job is "go and
flash this" is the worst kind of wrong. The bench wizard's own Sketch step was
vague rather than wrong ("all of them are in `pca-studio/` and
`arduino/MaestroPCA/examples/`") and now names which is which.

**The paths are pinned by a test.** `build-config.test.js` asserts the exact
strings and, just as importantly, asserts that
`arduino/MaestroPCA/examples/PCA_Bridge` does NOT appear — so the same mistake
cannot be reintroduced by someone tidying the sentence.

**Tests: 1311 passing across 28 suites, both builds.**


### 2026-08-14 — v1.38.1: the Channels step can reach the board

Mike: *"under channels in Setup your servo hardware - shoudl we not have the
connect to the Arduino button Aka Hardware connect."*

Yes — and the absence was worse than an omission. That step's premise is the
one written at the top of `setup-hw.js`: *"The dial drives the servo LIVE,
and Min / Center / Max capture wherever it currently is … that is the only
way to find an endpoint on a printed droid."* With no port open the dial
drives a **model** of a servo. You could work down twenty-six channels,
believe every number, and have measured nothing — and the only clue was a
small chip on a different tab.

So the link lives on the Channels step too, and the bar says which of the two
you are doing rather than leaving you to infer it:

- **Not connected** — the dial moves the on-screen model only; flash
  PCA_Bridge, plug in, connect.
- **Live** — the dial drives the real servo and Min/Centre/Max record where
  it actually is.
- **Monitor only** — the board is talking but nothing is streamed to it.

#### The bug underneath

`serialConnect()` and `serialDisconnect()` wrote straight into
`$('bConnect')`, `$('serialChip')` and `$('monPort')` — the Bench tab's
elements. Calling connect from the wizard therefore threw on the first of
them, **after** `port.open()` had succeeded and **before** `serialRead()` was
armed: a connected board that nothing was listening to, and no error anywhere
a user would look. Every surface registers with `serialUiRegister()` now, and
`serialUiSync()` repaints whichever exist; `monShow`, `monWarn`, `monAppend`
and `serialSetMode` are all guarded the same way. Both bars register, so the
Bench tab and the wizard cannot disagree about the state of the port.

#### Files

Changed: `maestro/serial-link.js` (`SER_UI`, `serialUiSync`, the guards),
`maestro/setup-hw.js` (`setupLinkBar`, `setupBindLink`),
`maestro/hw-ui.js`, `css/12-setup-hw.css`.

**Tests: 1311 passing across 28 suites, both builds** (was 1306).
`build-config.test.js` is 195 — the button exists on Channels and nowhere
else, the bar names what the dial is moving, and the link chrome survives the
Bench tab being absent.


### 2026-08-14 — v1.38.0: the servo setup path becomes one flow

Six corrections from Mike, all on the same journey, and together they turn
three loosely-connected screens into one route with a beginning and an end.

#### The offer matches the hardware

*"if they are using PCA's we should not offer meastro and in they are using
maestro we should not offer PCA import - adjust wording based on there
config."* A Maestro builder has never seen this app's export; a PCA builder
has never opened Control Center. Naming both was two thirds noise and one
third *"which of these am I?"*. So the card, the button label and the file
picker's `accept` all follow the device: **.mstr** for a Maestro,
**servo config** for a PCA build.

The READER stays permissive on purpose — it is the same six fields either
way, and somebody bringing a `.mstr` to a PCA build is doing something
sensible. What narrows is the offer, not the capability.

#### "Measure them now" actually starts the tool

It was a description of work; it is a button now. On a PCA build it opens the
bench carrying everything answered upstairs — controller, expanders, channel
count — via the `buildSyncBench()` write-through that already existed. On a
Maestro build there is no tool of ours to open, so the same card says so and
points at Control Center.

#### The bench opens on PCA_Bridge

*"once the servo hardware is open we should default to teh PCA Bridge - then
we can test the imported file in safe manor or guide the user to the initial
setup of the servos."* It used to pre-select the droid sketch, which is the
one you flash LAST. Both jobs you can do here — checking an imported config
and measuring a new one — need this app driving the board, and only
PCA_Bridge lets it. A deliberate choice is still never overwritten.

#### MaestroReplacement is the last step, and says so

*"should only be available when we have a valid config file for servo
movements"* and *"we need to make it clear this is used once finished and you
dont want to use the sim to control the real model anymore and you are ready
for it to be contrlled by padewon360."*

Both halves are the same point. MaestroReplacement **ends** the bench session:
it takes the link away from this app and hands the droid to Padawan360. Flash
it before the endpoints exist and you have a co-processor confidently driving
servos to numbers nobody checked — and no way to fix them without reflashing
PCA_Bridge and starting again. So the card is offered but locked until
something has been measured, saying exactly that; once unlocked it opens with
**"This is the last step, not a step"** and names how many channels it is
about to bake in.

#### Finish asks about the file

An hour of calibration that exists only in one browser's `localStorage` is an
hour you will do again after a cache clear, on another machine, or in a year.
So Finish offers the export when there is measured travel that has not been
written out since it last changed — `setupExported()` compares two counters,
so it means "saved since you last changed something", not "saved ever". It
offers; it does not insist.

#### …and it goes back where it came from

The bench is reachable from the Bench tab and from the wizard's Servo setup
step. `setupOpen(step, {from:'wizard'})` records which, and `setupClose()`
reopens the wizard on that step. Opened from the Bench tab it does nothing,
because the tab is already behind the popout.

#### Files

Changed: `maestro/setup-hw.js` (`SETUP.from`, `setupFinish`, `setupDroidCard`,
the export counters), `maestro/servo-cfg.js`, `config/wizard.js` (the
device-aware import card, the measure button), `config/hardware.js`
(`buildSyncBench` defaults to `bridge`), `css/12-setup-hw.css`.

**Tests: 1306 passing across 28 suites, both builds** (was 1292).
`build-config.test.js` is 190 — the offer narrowing per device while the
reader stays permissive, the measure button and its Maestro counterpart, the
bench opening on PCA_Bridge, the droid sketch locked then unlocked by one
measured channel, Finish asking exactly when it should, and the return to the
wizard.


### 2026-08-14 — v1.37.0: servo setup gets its own step, and the popout gets its colours back

Mike, running through the previous build: *"lets move this to after the
firmware button … under Firmware when I user selects which firmware only then
should it provide a link to the correct firmware only orthers should be
hidden … The first question on servo setup should be do you have an exsisting
config to import … Also the colours in this popout are really bad review them
to match the themes."*

#### Servo setup is a step, and it asks about the import first

The physical job was a section at the bottom of the Servo hardware question,
which put "go and measure twenty-six panels" underneath five paragraphs about
which board to buy. It is a job, not an answer, so it is now its own chip in
the rail, immediately after Firmware.

**And the first thing it asks is whether you have already done it.** That
ordering is the point: measuring a droid's travel is an hour of work, and the
person most likely to be standing on this step is somebody who did it on a
previous build, on another droid, or in Control Center last Tuesday. Offering
the hour-long path first and the ten-second one at the bottom would be exactly
the wrong way round.

`maestro/servo-cfg.js` is the new module, and the load-bearing word in it is
**only**. Two file types already in the app contain a channel table — a Pololu
`.mstr` and the whole-setup `.json` — and both drag a great deal else along
with them. This reads six fields and writes six fields: name, min, centre,
max, speed, acceleration. It deliberately does not touch the board, the
sequences, or **`act`** — which panel a channel drives is this droid's wiring
and belongs to the Panels step, so a config carried from another builder
cannot silently re-wire your dome.

Then, at the bottom, the export — because the whole reason the first question
is worth asking is that somebody, once, pressed this button.

#### One firmware, one link

Three repo rows, two of which you are not going to flash, is three chances to
flash the wrong one — and the step above has just made you decide. So the
Firmware step now shows the link for the sketch you chose and hides the
others. Imported sketches say so instead. The tools needed to set the SERVOS
up are separate, and live on the servo step where they are used: Control
Center for a Maestro, `PCA_Bridge` then `MaestroReplacement` for a
co-processor, and for the mod2026 arrangement an explanation that there is no
separate tool because its endpoints are constants in the sketch.

#### The bench popout: simple by default

Mike asked for "a very simple wizzard with advance options hidden unless they
tick an advance box", and, on what should hide, **"just the risky ones"**. So
the Advanced tick reveals exactly two controls, and hides nothing else:

- the **full 500–2500 µs sweep unlock** — a horn driven into a hard stop at
  full travel strips its gears quietly, in seconds;
- the **pulse frequency** — an analogue servo fed 300 Hz gets hot.

Each hidden control leaves a line saying what it is set to and where the tick
is, so nobody wonders where it went.

#### …and its colours

*"the colours in this popout are really bad."* Three faults, one behind the
other:

1. **Nine hard-coded dark hexes in the CSS** and **eleven in the SVG** the
   wizard draws. They do not flip with the theme, so in light mode the card
   was white and the option you had just selected went near-black.
2. **Amber as the accent** — the step chips, the primary button and the
   selected card were all `--am`, which `01-tokens.css` is explicit about:
   *"amber means warning, and a call-to-action that shares the warning colour
   reads as a hazard"*. In light mode `--am` is a dark brown, which is how it
   looked. The accent is `--cta`, the same blue as the rest of the app.
3. **And underneath both — the alias tokens never followed the theme at
   all.** `--tx:var(--txt)` is declared on `:root`, so it computes against
   `:root`'s DARK `--txt`; the light theme overrides `--txt` on `body`, and
   nothing recomputes the alias. The popout's entire text colour is `--tx`.
   That is the one that made it unreadable rather than merely ugly, and it
   had been true of `--tx`, `--faint`, `--bl` and `--am2` since they were
   introduced. See §7.

The modal backdrop was also a literal `rgba(10,13,15,.82)`, so a light-theme
dialog sat on a near-black wash; there is a `--scrim` token now.

#### Files

New: `src/js/maestro/servo-cfg.js`. Changed: `config/wizard.js` (the
`_servoSet` step, the single firmware link, the tool links),
`maestro/setup-hw.js` (`SETUP.adv`, the two hidden controls, colours as
properties), `css/12-setup-hw.css`, `css/01-tokens.css`,
`css/06-theme-light.css`, `src/manifest.json`.

**Tests: 1292 passing across 28 suites, both builds** (was 1271).
`build-config.test.js` is 176 — the single firmware link, the import-first
ordering, a `.mstr` and our own export both importing travel and only travel,
`act` surviving an import, rubbish refused with a sentence, the tool links per
device, the Advanced tick hiding exactly one control on its step, and the
popout measured in LIGHT theme: light card, light selected option, dark
heading text.


### 2026-08-14 — v1.36.0: the servo step becomes a form and a set of diagrams

Mike, after running through the previous version: *"now running through that s
good point about firmware - lets move to after Sound when key questions have
been answered"*, and then, on the servo step: *"we should use drop down boxes
to simplify the veiw - the options for the device servo plug into should be
Maestro, PCA9685 or Other … but need to make it easy to pick which one best
suites them : maybe add flow diagrames / flow logic images"* — followed by the
seven arrangements, written out by hand.

#### The firmware goes back to last

Tried at position 3 in v1.35.0 and moved back: it is the one answer that is a
*consequence* of the others, and asking it early means greying out most of the
list for reasons the builder has not given yet. `firmwarePinned` survives the
experiment — a sketch you picked yourself is still never silently swapped —
it is just no longer the common case.

Order now: **Controller · Controller board · Servo hardware · Dome motor ·
Dome lighting · Foot drive · Sound · Firmware.**

#### The shape is the answer, and the answer is a picture

The seven arrangements differ in exactly one way — the path from the droid's
Arduino to a servo horn — and that is miserable in prose. "The second board
hangs off the first rather than off the host" is a sentence you read twice;
two boxes and an arrow is a thing you recognise. So `SERVO_TOPOS` names the
shape, `config/flow-art.js` draws it, and the picker is the drawings:

| | |
|---|---|
| **Maestro** | Padawan → Maestro → Servos |
| | Padawan → Maestro 1 → Maestro 2 → Servos |
| | Padawan → Maestro 1 → Servos *and* Padawan → Maestro 2 → Servos — **not yet** |
| **PCA9685** | Padawan → PCA9685 ×2 → Servos *(no controller — this is mod2026)* |
| | Padawan → Controller → PCA9685 → Servos |
| | Padawan → Controller → PCA9685 1 → PCA9685 2 → Servos |
| | two controllers, one link each — **not yet** |
| | one controller, two links — **not yet** |

The three the stock sketches cannot address are drawn **dashed**, badged *not
working yet*, and say why on the card rather than being left out. The
no-controller row is not in Mike's list because his diagrams all pass through
one — but it is the default build (mod2026), and "PCA9685 with nothing in
between" is exactly a shape, so it belongs in the same picker.

`flow-art.js` is generic: a topology gives an array of links, each an array of
node names, and the file lays out boxes and arrows. Adding an arrangement is
one entry in the table, not a new drawing.

#### Everything else is a dropdown

Device (Maestro · PCA9685 · Other), the controller chip (Arduino/ESP32, from
the Bench's own list), and one board size per Maestro. Five of the six
questions on this step have an obvious answer and a couple of alternatives,
which is what a dropdown is for. **Other** is a placeholder, and an honest
one: it records the answer, appears on the wiring sheet, and leaves the
simulator driving whatever you had — because blanking the boards would take
the running sim down with the question.

#### The model runs both ways

`buildNormaliseServos()` derives `domeServo`, `bodyServo`, `servoSplit`,
`servoLink` and `PREFS.hw` from the four small answers — which is what let the
UI change completely with no change downstream. But it also has to run
BACKWARDS: `buildSet('domeServo','mini24')` is the setter six other suites use
and what a loaded .json effectively does, so a direct board answer is read
back into the shape rather than being overwritten by it. See §7 for the two
traps that cost the most here, and for `servoDevice:'mixed'` — the escape
hatch for a build with a different kind at each end, which the picker cannot
draw and must not quietly rewrite.

#### Files

New: `src/js/config/flow-art.js`. Changed: `config/hardware.js` (the order,
`SERVO_DEVICES`, `SERVO_TOPOS`, the two-way normalise, the pin-before-guard
fix), `config/wizard.js` (`wizField`, `wizTopoPicker`, the rewritten
`wizServosStep`), `css/07-startup.css`, `src/manifest.json`.

**Tests: 1271 passing across 28 suites, both builds** (was 1266).
`build-config.test.js` is 155 — Mike's seven arrangements in his order and
their flow arrays, the diagrams rendering (one box per node, one arrow
between, dashed when parked), the shape driving split/link/board answers, the
dropdowns, the backwards mapping, mixed builds surviving, and the firmware
back at the end.


### 2026-08-14 — v1.35.0: the platform first, plainer servos, and the bench

Three things, from *"lets move Contrller board to after Controller, formware
after Controller board, Then servos / rename Servo to Servo hardware also its
not very easy to understand make it simpler / add the option to setup the
servos pysically."*

#### 1. The order, and what it changes

    Model · Controller · Controller board · Firmware · Servo hardware
          · Dome motor · Dome lighting · Foot drive · Sound

The first three answers are now the PLATFORM — what you drive it with, what
runs the code, **which code** — and everything after is hardware that has to
suit the sketch you already chose.

That inverts a load-bearing assumption. The firmware question used to be last
precisely so it could be *narrowed by* everything above it, and `buildSet()`
re-picked it whenever a hardware change invalidated it. Asked third, the same
line means choosing hub motors on step 7 silently throws away the sketch you
chose on step 3. Asked whether that mattered, Mike's answer was **"if the
moves are done first this should then be in order"** — the order is the
design, so the firmware is an anchor, not a consequence:

- `firmwarePinned` is set the moment YOU pick a sketch. Pinned, nothing later
  changes it; the contradiction is reported instead — on the option card that
  would cause it, on the review, and with a line saying *whose* choice is
  being respected.
- `optionBlockers(key, id, b)` is the firmware step's own service pointing the
  other way: every later step greys what the chosen sketch cannot drive, and
  says why. It returns only the objections an answer would ADD, so an option
  is never blamed for a clash already there.
- **"Let the setup choose"** on the Firmware step unpins it, and the old
  behaviour resumes. Until you have picked one at all, a fresh build still
  converges on something runnable on its own.

#### 2. "Servo hardware", and the kind before the part number

The merged step was fourteen cards named after part numbers. But there are
only **three arrangements**, and the arrangement is the decision that actually
changes what you flash and where the wires go:

| | what it is |
|---|---|
| A Pololu Maestro | a board that stores its own movements; the droid says "run number 3" |
| PCA9685 expanders, on their own Arduino | MaestroReplacement on a spare chip — the sketch cannot tell it from a Maestro |
| PCA9685 expanders, on the droid's own Arduino | mod2026: no extra board, and nowhere to store movements |

So each column asks the kind first, in words, and then offers the sizes inside
it as a compact chip row (`Mini 24 · 24 channels`) with the chosen board's own
note underneath — one description on screen instead of seven. The unpicked
kinds show a single line rather than a paragraph; three paragraphs per column,
twice, was most of why the page felt heavy. A kind with one size shows no chip
row at all, because there is nothing to pick.

Every board's note was rewritten in plain language on the way past: "12 pies
plus 14 side panels is 26" became "the MK4 dome has 12 pie panels and 14 side
panels — that is 26, so two of them stay fixed or go elsewhere."

#### 3. Setting the servos up for real

Everything above that point describes a droid. This is the part where you put
a horn on a spline and find out where the panel actually stops — and it is a
**different job with a different tool** depending on the kind you just chose,
which is exactly why it belongs on this step rather than in a help page:

- **Maestro** — Pololu's own Control Center, over the board's USB port; the
  numbers live on the board. Linked out to directly.
- **Co-processor** — flash `PCA_Bridge`, calibrate from this simulator over
  Web Serial with the dial, then flash `MaestroReplacement` for the droid with
  the numbers baked into `sequences.h`. **Open the bench** closes the wizard
  (two full-page overlays at once is a trap) and opens the setup wizard.
- **mod2026** — there is no calibration tool, and that is not an oversight:
  its endpoints are constants in the sketch's own source. Set them in the
  bench, export the .ino.

Each is a numbered procedure, and each ends on the same three warnings,
because they are the three ways a first servo dies: fit the horn with the
servo already commanded to centre; creep up on each endpoint and stop at the
touch (a horn held against a hard stop strips its gears quietly, in seconds);
and give the servos their own supply with a common ground — a droid that
"randomly resets" is almost always a servo browning out its own Arduino.

#### Files

Changed: `config/hardware.js` (the order, `firmwarePinned`, `optionBlockers`,
`SERVO_FAMILIES`, plainer notes), `config/wizard.js` (kind-then-size columns,
the pin UI, `wizServoBenchSect`), `css/07-startup.css`, `css/05-controls.css`
(`a.b` — an anchor that has to look like a button). No new modules.

**Tests: 1266 passing across 28 suites, both builds** (was 1247).
`build-config.test.js` is 150 — the new order in the rail, pinning and what it
protects, the reversed blockers, the three kinds and their size chips, and all
three bench procedures including that the button leaves the wizard rather than
stacking overlays. Three existing assertions relied on the old silent re-pick
and now name the sketch they want, which is what they always meant.


### 2026-08-14 — v1.34.0: one servo question, not two

Mike: *"we should merge the Body / Dome servos into one - the user then sets
whats controlling the Dome / Body and then hows its wired."*

The two servo questions had the same option list and were answered four steps
apart, which made the one thing you actually want to see — **how the two ends
relate** — the one thing the setup could not show you. They are now a single
step, and the step is that sentence in order:

1. **How many controllers** — one for the whole droid, or one at each end.
2. **What each one is** — the two ends *side by side*, same catalogue in each
   column, one card per row so the two lists read as a comparison.
3. **How they reach the host** — a real question only when there are two
   Maestro-protocol boards on the host UART. Otherwise a sentence: one board
   is one wire, and a mod2026 end is on the host's own I2C bus with nothing to
   arrange.

Plus the co-processor chip, when an answer needs one — moved here from being
tacked onto whichever servo step you happened to be on.

#### "One controller for the whole droid" is a real answer now

It was not expressible before: answering both questions `mini24` meant TWO
Mini 24s. A body-only test rig, a bench setup, and any droid with a fixed dome
are all one board — so `servoSplit` says which, and `buildServoLocs()` returns
`['both']` instead of `['dome','body']`. Everything that used to walk the two
locations walks that instead, so a shared controller draws **one** board card,
**one** wiring row and **one** channel list rather than the same thing twice.

`mod2026` is the exception, enforced in `buildNormaliseServos()`: it is not a
board you address, it is the sketch driving two fixed expanders at 0x40 and
0x41 on its own bus. Choosing it forces the split back to two, and the "one
for the whole droid" card says why rather than doing nothing when clicked.

**`domeServo` and `bodyServo` survive unchanged as build answers.** Only the
QUESTION merged. Every saved setup `.json`, `PREFS.hw`, the wiring sheet, the
firmware rules and half a dozen suites go on reading them exactly as before;
`servoSplit === 'one'` simply keeps the two in step.

#### The finding this turned up

Choosing two Maestro boards and chaining them on the one host link is now
flagged, on the step and again on the review:

> Both boards will act on every command.

Both Maestro sketches build the board as `MiniMaestro maestro(Serial3)` — no
device number — and with the library's default that means the **compact
protocol**: a bare command byte with no address in it (verified against
Pololu's own maestro-arduino library; the byte-level notes are in
`arduino/MaestroPCA/src/MaestroLink.h`). So `restartScript(2)` starts
subroutine 2 on the dome board *and* the body board, and whatever sequence
happens to sit at index 2 on the other one runs too. The fix is a device
number per board, passed to the constructor — or one board doing both ends,
which is now a click away.

The other arrangement, a UART each, is `sim:'park'`: all four of the Mega's
hardware UARTs are already spoken for (feet, dome, Maestro, sound) and none of
the three sketches opens a second Maestro port.

#### The generic machinery had to learn that a step can own two answers

`step.key` was a key of `PREFS.build` everywhere. A step now declares
`answers:[...]`, and the rail chip, the review row and the parked-option scan
read `buildStepAnswer()` / `stepAnswerKeys()`. The rail carries a short form
("Mini 24 · Mini 12", or "PCA ×2 + coproc · both") and the review row the long
one, including the co-processor chip — so it is still exactly **one row per
question**, which the Config tab and three suites depend on and which is also
just true.

#### Files

Changed: `config/hardware.js` (the merged step, `servoSplit`/`servoLink`, the
step-answer helpers, `buildNormaliseServos`, the chained-board conflict),
`config/wizard.js` (`wizServosStep`, `wizServoLinkSect`, `wizCoprocSect`, the
shared model banner), `config/tab.js`, `app/boards.js` (`hwAt`/`hwLocs`,
`'both'` as a location), `app/wiring.js`, `css/07-startup.css`. No new modules.

**Tests: 1247 passing across 28 suites, both builds** (was 1232).
`build-config.test.js` is 131 — the merged step and its two columns, the
answers surviving underneath, the one-controller mirror and its board/row/card
count, mod2026 refusing to be shared, and the link question with its warning.


### 2026-08-14 — v1.33.0: the PCA9685 co-processor is a build answer

Mike: *"we need to add the additional option / set up for using an Arduino /
ESP for the PCA9685's — as a reminder they will use the same output from the
Padawan as a Maestro."*

That last clause is the whole design. The co-processor has existed in this repo
since v1.23.0 (`arduino/MaestroPCA`, and `MaestroReplacement` since v1.24.0) and
the Bench wizard has asked which chip runs it since v1.29.0 — but the BUILD
config, which is the source of truth for what is bolted into the droid, had no
way to say it. Its two servo questions offered four Pololu boards and the
mod2026 direct-I2C arrangement, and nothing in between.

#### The distinction that was missing

There are two completely different ways a PCA9685 ends up in an astromech, and
before this the build could only express one of them:

| | mod2026 | co-processor (new) |
|---|---|---|
| Where the expanders live | the **host's** I2C bus | the **co-processor's** I2C bus |
| Who writes the pulses | the Padawan sketch | MaestroReplacement |
| How the host asks | `setPWM()` inline | `restartScript(n)` on a UART |
| Which sketches can run it | mod2026 only | both Maestro sketches |

So the answer is not "a PCA9685", it is **which side of the UART it is on** —
and on the far side, as far as the host sketch is concerned, it is a Maestro.

#### What was added

Two answers on **each** servo question, per Mike's call to ask the expander
count per location rather than once for the droid:

- `mpca16` — one PCA9685 behind a co-processor, 16 channels
- `mpca32` — two (0x40 + 0x41), 32 channels — which is the whole MK4 dome,
  12 pies plus 14 panels, with six to spare

They are answered independently for dome and body because on a real droid they
are separate boards: the slip ring is the reason.

Plus a **follow-on question, not a tenth step**: which chip runs it, shown only
when an answer needs one. The list is `SETUP_MCUS` from the Bench wizard —
Nano, Uno, Mega, ESP32 — minus the Mega ADK, which is the HOST board and not
something to spend on a servo expander.

#### One answer, not two

The chip and the expander count are build answers now, and `buildSyncBench()`
writes them into `HW.setup()` — the same write-through `PREFS.hw` has always
had for the servo boards. `setupDefaults()` closes the loop from the other
side: with no saved bench answers it reads the build rather than guessing, so
opening the Bench on a configured droid starts from that droid. This repo has
already paid once for a hand-kept second copy (the PCA engine before v1.26.0,
§3) and that is not a mistake worth repeating in a smaller place.

`buildSyncBench()` runs from `buildApply()` as well as `buildSet()`, because
`HW.setup()` lives on `CFG` and `loadProfile()` replaces `CFG` wholesale.

#### Three facts, kept separate

The servo options grew three flags, and they are genuinely independent —
`servoSpeaksMaestro()`, `servoUsesPca()`, `servoCoprocBoards()`:

- a Mini 24 speaks the Maestro protocol and has no PCA9685;
- mod2026 has PCA9685s and speaks no protocol;
- a co-processor is **both**.

Everything downstream falls out of that rather than from string-matching
`'mod2026'` at eleven call sites. `buildUsesMaestro()` is now literally "does
anything on this droid answer `restartScript()` over a UART", which is the
question the firmware checks were always really asking — so choosing a
co-processor correctly blocks mod2026 and clears both Maestro sketches, and the
sim switches profile on the spot. The blocker text says why in the new terms
("the expanders are on the host's own I2C bus … a co-processor would give it
something to fire at") instead of the old "PCA9685s on both ends".

#### The wiring diagram grew a third column

A co-processor row has one more hop in it, and pretending the expanders sit on
the host UART would be exactly the kind of lie this sheet exists to prevent. So
a link may now carry a `chain`, and the canvas widens to 1320 when one does:

    Mega ADK ──Serial3 @ 9600──▶ MaestroPCA co-processor — Arduino Nano ──I2C──▶ 2 × PCA9685 (0x40 + 0x41)
                                 subroutines fired by restartScript(0-7)          32 servo channels · SDA A4 · SCL A5

A Maestro or mod2026 build draws exactly as before, at exactly the old width.
The Boards section takes the co-processor down its MAESTRO branch on purpose —
from that section's point of view it is a board with N channels addressed over
the Maestro link, which is what it is — and simply has no `BOARD_IMG` entry,
because there is no one photo of "an Arduino and two expanders".

#### Files

Changed: `config/hardware.js` (the two answers, `servoMcu`, the three servo
predicates, `buildSyncBench`, `buildServoLabel`, blocker wording),
`config/wizard.js` (the follow-on chip picker), `app/wiring.js` (`chain`),
`app/boards.js` (`HW_CHOICES`), `maestro/setup-hw.js` (`setupDefaults` reads
the build). No new modules.

**Tests: 1232 passing across 28 suites, both builds** (was 1214).
`build-config.test.js` is 116 — the option catalogue, the three predicates
staying independent, the firmware consequence, the 32 channels reaching the
board model and the sequencer, the write-through in both directions, and that
a Maestro build does **not** invent a co-processor answer. Two existing
assertions were counting option cards and step indices by hand; they now count
the catalogue.


### 2026-08-14 — v1.32.0: the model comes first, and the RC transmitter is real input

Mike opened the session with the frame for it: *"This chat will be around
making the interface simple to use with options to enable the advance stuff."*
Two changes under that heading.

#### 1. Model selection moves to the start of setup, with a picture of each

*"First change move the model selection to the start of the setup page - with
static images of each model."*

The stage has held one model at a time since v1.9.0, but the only way to change
it was a button on the stage — so it was a thing you DISCOVERED rather than a
thing you chose, and a new builder met nine questions about dome motors without
ever being told what the questions were about. It is now step 1 of 15
(`WIZ_MODEL` in `config/wizard.js`), three full-width cards, and picking one
calls `modelSet()` immediately like every other answer in the wizard.

**The pictures are hand-drawn SVG** (`config/model-art.js`), not renders, for
three reasons that all point the same way:

- the wizard opens BEFORE `CAD.loaded` on a cold boot, so render-based
  thumbnails would be three empty boxes exactly when they are needed;
- the MK4 geometry is MrBaddeley's paid Patreon design (§1) and a baked render
  is a picture of that design sitting in a file we hand around;
- line art is ~1 KB each, crisp at any size, and takes its colours from the
  theme — four stroke roles (`ma-b` body, `ma-l` limbs, `ma-d` detail, `ma-a`
  accent) styled once in `07-startup.css`, so light and dark both work without
  a second asset.

They are identification, not preview: same 120×96 box, same stroke weight, so
the three read as a set.

#### 2. Questions the chosen model does not use are collapsed, not hidden

Mike's call when asked: **"ask all nine, but collapsed."** `MODEL_UNUSED_STEPS`
in `config/hardware.js` names only what a model does NOT use — the Anzellan
head skips dome motor, dome lighting, foot drive and sound; the Polar Mouse
also skips the dome and body servo boards. Those steps stay in the rail with a
dashed, dimmed chip, the step itself opens with a line saying why and a button
back to the model, and **the answer is kept and still changeable** — it is
still the truth about the droid you are building, and the droid is one card
away.

Nothing here gates the SIM. `buildApply()` still derives the profile, the foot
mode and the board from the answers whatever is on the stage, because the
sketch runs regardless — the same rule as `scene/models.js`, "WHAT THIS IS
NOT". This is a reading aid.

#### 3. The RC transmitter, calibrated and assigned

*"I have a RC controller that connects via USB and appears as a game controller
- so we just need to Callibrate it and assing chanels."*

A radio set in USB/simulator mode enumerates through the Gamepad API, and that
is where the resemblance to an Xbox pad stops. `input/rc.js` handles the ways
it differs, each of which was a real defect waiting to happen:

- **It must not go through the Xbox map.** Axis 4 would become a trigger and a
  two-position switch a stuck A button — and on a bench where the transmitter
  is the only device, it is exactly the pad `pollInput()`'s scan would pick.
  `rcOwns()` takes it out of that path.
- **Endpoints are per-channel.** Travel adjust, sub-trim and gimbal wear mean
  full deflection might be 0.94 one way and −0.71 the other. Calibration
  records both and normalises about the rest point, splitting the two halves so
  neither end gets clipped.
- **Sticks do not return to 0.000.** A gimbal at rest reads 0.02–0.08 and stays
  there, so the pad path's fixed 0.04 deadzone is either a permanent creep or
  eats a third of the throw. The rest position is read when you press Done, and
  the deadband is RESCALED rather than subtracted so a calibrated stick still
  reaches 1.000 at the stop.
- **A throttle rests at the bottom.** Detected automatically (`ctr:'span'`
  vs `'rest'`) — and then deliberately overridden for anything auto-assigned to
  a stick, because "hands off = full reverse" is the bench accident this panel
  exists to prevent. See §7.

**Two destinations, switchable — Mike asked for both.** `mode:'pad'` is the
default and feeds the XBOXRECV stub, so the sketch sees a stick move and every
sequence, sound and HUD reading behaves as if a pad were plugged in; that keeps
the FIRMWARE in the loop, which is what the simulator is for. `mode:'out'` is
behind an Advanced switch and writes the channel straight to a motor or servo
from `rcDirectApply()` in the frame loop — after `fwLoop()` so it genuinely
overrides the sketch, before `motorWatchdog()` so a held stick keeps the
Sabertooth packet clock alive. The panel says so in as many words rather than
in a footnote.

The whole job lives on the Controller step of the wizard, appearing when the
answer is RC (Mike's choice: setup, not a second home in the Controls tab).
Three sections in the order you actually do it — which device (with live
movement, since "USB Joystick" is not distinguishable any other way), calibrate
(one button, one instruction, live bars), then channels (bar, what it does,
reverse). Channels that never moved are folded away behind a toggle so a
16-axis dongle does not open with twelve dead rows.

**The build answer moved `park` → `sub`, and only that far.** The sim reads a
transmitter now; no sketch does — all three read an Xbox receiver — so a
calibrated channel STANDS IN for a stick rather than arriving the way it would
on the real droid. `sim:'full'` needs PPM/SBUS firmware that does not exist
yet. The wiring diagram still draws the receiver dashed, on the same grounds.

#### Files

New: `src/js/config/model-art.js`, `src/js/input/rc.js`, `src/js/input/rc-ui.js`,
`tests/rc.test.js`. Changed: `config/wizard.js` (the model step, the collapsed
notes, the rail, `wizStepIndex()`), `config/hardware.js` (`MODEL_UNUSED_STEPS`,
the RC option), `input/pad-ui.js` (skip the RC pad, merge its channels),
`app/main.js` (`rcDirectApply()`, `rcPrefsRestore()`), `css/07-startup.css`,
`src/manifest.json`, `test.sh`.

**`wizStepIndex(key)`, not `BUILD_STEPS.findIndex()`.** The two lists no longer
share an index now that a step sits in front of the nine. Three existing suites
were doing the latter and jumped to the wrong step; they now call the helper.

**Tests: 1214 passing across 28 suites, both builds** (was 1168 / 27).
`rc.test.js` is 34 assertions against a deliberately awkward fake transmitter —
uneven travel, an off-centre rest, a bottom-resting throttle and a switch on an
axis. `build-config.test.js` gained the model step and the collapsed-step
behaviour and is 99.


### 2026-08-12 — v1.31.2 / Studio 0.12.2: the servo rate reaches the wire

**Why.** Mike ran the diagnostic: *"so its the slow ones that show it the
most — I dont have a maestro to test right now."* That is the board's
signature, not the clock's, and it needs no co-processor to confirm: the clock
artefact was speed-INdependent (a fixed 1,2,2 ripple in step delivery, whatever
the step size), while the PCA9685's 4.88 µs quantisation bites hardest exactly
where the engine's own step is smallest. At speed 5 a step is 1.25 µs — a
QUARTER of a count — so the board holds one duty value for four ticks and then
jumps the whole 4.88 µs. Visible stepping, ~25 Hz, and no software can remove
it.

The one real lever is the refresh rate, because resolution is the period ÷
4096. And it turned out he could not pull it:

- `PCA_Bridge.ino` has accepted a servo frequency on **channel 63** since it
  was written, and calls `setPWMFreq()` the moment it arrives.
- `serialConfig()` sent `serialFrame(63, 50)` — **hardcoded**. The setup
  wizard's `freq` answer never left the browser.

So the experiment that would settle his question was impossible for want of one
literal.

**What changed.** `HW.freq()` / `HW.setFreq()` on the seam, `serialConfig()`
sends the real answer, and `serialSetFreq(hz)` changes it on a RUNNING board.
Both apps get the control next to the oscillator trim, showing what one count
is worth at that rate — 4.88 µs at 50 Hz, 2.44 at 100, 1.22 at 200.

`serialSetFreq` stops every channel before it sends. Reprogramming the
prescaler glitches the outputs, and a glitch delivered to a servo mid-travel is
a twitch you can hear. It also clamps to 40–400 Hz.

**The warning belongs on the control, not in a doc.** Most ANALOGUE servos are
built for 50 Hz and will get hot, buzz or refuse to hold at 200; digital ones
are usually fine. This is a per-rig experiment, never a default.

**Tests.** `tests/hw.test.js` is 33: `serialConfig` carries the configured rate
rather than a hardcoded 50, the rate can be changed on a running board, and it
is clamped.


### 2026-08-12 — v1.31.1 / Studio 0.12.1: the engine gets its own heartbeat

**Why.** Mike, after driving real servos from PCA Studio for the first time:
*"my only thought was it felt a little jerky but that could be because I'm
watching for it."* It was not imagination, and there turned out to be TWO
causes — one ours, one the board's.

**Ours: a fixed-rate engine on a variable-rate clock.** The engine integrates
in 10 ms quanta and carries the remainder, so its POSITION is right at any
instant. But it was stepped from `requestAnimationFrame`, and 16.667 ms
through that accumulator gives `1, 2, 2, 1, 2, 2 …` steps per frame. The
average is correct; the delivery is not. The servo is commanded a new position
every frame, and that position advances one step, then two, then two — a 2:1
ripple in commanded velocity repeating every three frames, about 20 Hz, which
is exactly where a person reads *rough* rather than *fast*. A real Maestro and
the MaestroPCA co-processor never do this: they step on a fixed 10 ms timer.

Measured in Chromium over 3 s, before and after:

```
stepped from requestAnimationFrame   180 fires   1×71  2×108   mean 1.59  SD 0.502
stepped from the 10 ms clock         300 fires   1×283 2×4     mean 0.97  SD 0.236
```

`src/js/maestro/hw-clock.js` (shared) now owns the heartbeat; the animation
frame only paints. Real elapsed time still feeds the accumulator, so the
average rate is unchanged and a throttled tab catches up rather than running
slow. Position updates also arrive at 100 Hz instead of 60.

**The board's, which this does NOT fix.** A PCA9685 at 50 Hz resolves
20000/4096 = **4.88 µs**. One engine step at speed 10 is 2.5 µs — *half a
count*. So at low speeds the board holds a value for two ticks and then jumps
a whole count, and no clock discipline changes that:

```
speed   µs per 10 ms step   PCA9685 counts   Maestro counts
   10                 2.5             0.51               10
   20                   5             1.02               20
   40                  10             2.05               40
   80                  20             4.10               80
```

The mitigation is hardware, and the wizard already asks for it: **raise the
servo frequency**. Resolution is one period ÷ 4096, so 100 Hz gives 2.44 µs and
200 Hz gives 1.22 µs. Analogue servos generally will not take it; most digital
ones will. Step 2 of the setup wizard is where that number lives.

**How to tell them apart at the bench:** if it is worse at LOW speed settings
it is the board's resolution; if it is the same at all speeds it was the
clock, and this release fixes it. If it is smooth from `sequences.h` on the
co-processor but rough over the USB bridge, it was the clock.


### 2026-08-12 — v1.31.0 / Studio 0.12.0: the sim touches hardware (2 and 4 of 4)

**Why.** The last two phases of the fold-in. Mike: *"yeah complete the phases."*

**Web Serial (phase 2).** `pca-studio/src/js/20-serial.js` is gone; all 235
lines are `src/js/maestro/serial-link.js` and both apps load it. Connect over
USB, the DTR-pulse handshake that identifies which sketch is on the far end,
the stream-vs-monitor gate, the 3-byte position protocol and the serial
monitor.

Until this landed **the sim touched no hardware at all.** It modelled a droid
beautifully and could not move one. Now the same drive slider, the same dial
and the same sequence that move the model also move the servo, because the
bench engine's `onWrite` goes down the wire — no new plumbing, that hook was
put in during phase 1 precisely so this phase would be small.

The module drives a fixed set of element ids because it was written against
Studio's page. Rather than rewrite 235 lines of hardware-tested code to take
selectors, the sim renders the SAME ids inside the bench card (`hwLinkRender`).
The module cannot tell which app it is in, which is the point.

**The gate matters.** A MaestroPCA co-processor's USB is a TEXT console.
Firing binary position frames at it is not a cosmetic error, so "monitor only"
is enforced in `serialWrite` — the thing everything upstream calls — and
`serialFrame` below it is only the encoder. There is a test for exactly that
distinction, because the first version of the test asserted it at the wrong
layer and passed for the wrong reason.

**What is left duplicated (phase 4).** Almost nothing, and the remainder is
deliberate. Studio still owns `10-mstr-mini.js` (its own cut-down `.mstr`
reader — the sim's is a superset but is bound to `MSTR` and `boards.js`),
`40-ui.js` (frame grid, generators, header bar, tick loop), `30-project.js`,
`45-blocks-host.js` and `50-blocks-ui.js` (a different DOM for the same
`blocks.js` model), plus 21 lines of boot and core. Everything that was worth
sharing now IS shared:

| shared module | lines | what |
|---|---|---|
| `maestro/setup-hw.js` | 1179 | the wizard and the dial |
| `maestro/serial-link.js` | 235 | Web Serial |
| `maestro/hw-table.js` | 162 | the live channel table |
| `maestro/servo-units.js` | 50 | the pulse-width bands, the ease vocabulary |

Studio's own code is **1,054 lines**, down from 2,505, and its build now names
**8 modules shared with the sim**. The two apps cannot drift on any of it,
because there is only one of it.

**Tests.** `tests/hw.test.js` is 29. Sim **1164 across 27 suites** on both
builds; Studio smoke **86, unchanged through all four phases** — the single
most useful number in this whole piece of work.


### 2026-08-12 — v1.30.0 / Studio 0.11.0: the setup wizard is the sim's too (3 of 4)

**Why.** Mike: *"have you rolled the setup wizzard from the pca studio into
the sim if not we should move all functionalty over but maintain both."* Not
yet — it was phase 3. It is now, and phase 2 (Web Serial) is what is left.

**What moved.** `pca-studio/src/js/60-setup.js` is gone. All 1,150 lines are
`src/js/maestro/setup-hw.js`, which BOTH apps load: the six steps, the SVG
wiring diagram, the sketch config, the channel table with apply-to-selected,
the calibration dial, `servos.h` and the setup `.json`. Its CSS went the same
way, to `src/css/12-setup-hw.css`.

Only 63 lines of it were host-specific, which is why this was tractable:
`PROJ.channels` → `HW.channels()`, `projSave()` → `HW.save()`,
`log()` → `HW.say()`, `pcaSetTarget(E, …)` → `HW.drive(…)`, and so on.

**The seam grew five methods**, each one a genuine disagreement:

- `setupCount()` — **the important one.** Studio OWNS its hardware, so "two
  boards" means the project has 32 channels and grows or shrinks to match.
  The sim's channel count is a BUILD answer made long before this wizard
  opened, and its rows carry names, actuator mappings and endpoints tuned
  against real linkages. So in the sim the wizard reads the build, never
  resizes the table, and `HW.applied()` says out loud when the board count on
  step 2 disagrees with the build. A test asserts the table length is
  unchanged across an apply.
- `setup()` / `setSetup()` — Studio's answers ARE its project; the sim keeps
  them in `CFG.hwSetup` beside a build it must not silently overwrite.
- `sequences()` / `addSequence()` — a brand-new project gets one "All home"
  sequence; a host that already has sequences keeps them. Calibration must
  never eat choreography.
- `appVersion()` — so an exported `servos.h` says which app produced it.
- `trim(n)` — a real operation in Studio, deliberately a no-op in the sim.

**Where it is.** Bench → *Open the servo bench…* → **Set up hardware…**,
opening on the Channels step because the sim already knows its boards. The
dial drives the bench engine, the 3D droid and the wire, and committing writes
`MSTR.channels` — the wizard IS the sim's endpoint editor now, which is what
Mike chose when he was asked.

**CSS across two design systems.** The moved sheet uses Studio's token names;
the sim gained four aliases (`--tx`, `--faint`, `--bl`, `--am2`) rather than
the shared file growing a parallel palette. The wizard's markup also wears
Studio's `.prim`/`.mini`/`.stat` classes, which the sim does not have — those
rules are restated inside `12-setup-hw.css` **scoped to `#setupWrap`**, so
nothing leaks into either host.

**Tests.** `tests/hw.test.js` is 24, up from 17: the wizard opens in the sim,
its table is the build's channel count and not the wizard's board answer, the
dial drives engine and model, committing writes `MSTR.channels`, `servos.h`
comes out stamped with the sim and guarded, the diagram/config/Finish steps all
survived, and applying resizes nothing. Studio's smoke suite is **86, unchanged**
— which is the proof that mattered: its wizard is now the sim's file and it
did not notice.

**Flake seen once.** `build-config.test.js` "the canvas actually resized to
match" failed once in a full run and passed alone. Same family as the others:
a layout-timing assertion on a loaded two-core box.


### 2026-08-12 — v1.29.0 / Studio 0.10.0: folding PCA Studio into the sim (1 of 4)

**Why.** Mike: *"lets fold the PCA Studio into the Simulator."* The plan from
the day Studio was built — it was always the place to get the servo-setup
screen right before it went near the big app.

**What is actually moving.** Studio is 2,505 lines, but only about 1,500 are
things the sim does not already have. Its `.mstr` reader is a strict subset of
`maestro/import.js`; its brick timeline and frame grid duplicate the sim's. So
this is a MOVE of three things, decided with Mike: the live channel table, the
Web Serial link, and the setup wizard with its calibration dial. Studio keeps
being built — it is the 197 KB page you open from a USB stick next to a droid,
and the sim is a 6.3 MB page that wants a GPU.

**The seam.** Both apps run the moved modules from ONE copy, so those modules
are written against `HW` — the smallest contract describing what a host
provides. Same pattern as `BLKH` and for the same reason: a hand-kept copy is
a copy that eventually differs.

| | |
|---|---|
| contract + sim implementation | `src/js/maestro/hw-host.js` (over `MSTR`) |
| Studio implementation | `pca-studio/src/js/44-hw-host.js` (over `PROJ`) |
| shared: the channel table | `src/js/maestro/hw-table.js` |
| shared: the bands and ease | `src/js/maestro/servo-units.js` |
| the sim's surface | `src/js/maestro/hw-ui.js`, `css/11-hw.css` |

**The thing that made this real work: the sim had no engine.** It loads
`pcaseq.js` and never called `pcaCreate` — only Studio and the tests did. The
droid moved because firmware profiles wrote `ACT_T` and the model eased toward
it, which is a fine model of a DROID and a useless model of a BOARD. A
calibration dial, a position bar and a serial stream all need the board.

So the sim now runs a **bench engine**. `HW.drive(ch, qus)` writes it, and the
engine's `onWrite` puts the position on the wire; `HW.drive` also mirrors into
`ACT_T` so the 3D droid follows. One command, three places. It is deliberately
not what the firmware profiles drive — they still own the droid in Drive and
Sequence; this owns it while you are at the Bench with a servo in your hand.
`hwTick()` only steps it when the Bench is open or a board is connected, so a
session that never goes near it pays nothing.

**Where it is.** Bench → Maestro pane → *Open the servo bench…*, which opens
an overlay on the same `.iwrap`/`.iwcard` furniture the import and build
wizards use. The sidebar is 300 px and a sixteen-column table does not go in a
sidebar.

**It edits your real channels.** `HW.channels()` IS `MSTR.channels` — the
table Mike calibrated against real linkages. The standing rule has always been
that *I* must not change those numbers; this is him changing them, deliberately,
with the servo moving in front of him (2026-08-12). A test asserts that opening
and closing the bench changes no endpoint by itself.

**A trap this re-found.** `HW.ensure(i)` originally wrote `list[i]` directly,
which on a shorter array leaves HOLES — and a hole is invisible until something
walks the array: `JSON.stringify` writes null, `forEach` skips it, and
`pcaCreate` produces a sparse engine whose `st[]` has gaps, which is what threw.
It fills 0..i now. This is the same fault as Studio 0.7.1's "worked the first
time and not the second", in a new place, which is why it is in §Traps.

**Tests.** New suite `tests/hw.test.js`, 17 assertions, in `test.sh`: the seam
reaches `MSTR`, the bench engine exists and walks a channel to its endpoint
under its own speed law, the droid mirrors, 0 means stop pulsing, the clock
idles when nothing is watching, and the shared table behaves in the sim exactly
as the Studio smoke suite says it behaves in Studio.

**Still to come:** 2 Web Serial, 3 the wizard and the dial, 4 docs and
retiring what is now duplicated.


### 2026-08-12 — PCA Studio 0.9.2: the default screen catches up with the wizard

**Why.** Mike: *"PCA-Studio.html — Home isn't editable from the default
screen, reverse tick too."* Both true. 0.9.0 and 0.9.1 improved the SETUP
wizard's table and left the main one behind, so the app had two tables for the
same channels that disagreed about what you could change and in what units.

**What changed in `40-ui.js`.**

*Home is editable whatever boot says.* It carried `disabled` whenever
`homemode` was Off, so the only way to set a home was to arm boot first. That
is backwards: boot decides whether the channel is DRIVEN there at power-up,
not whether you are allowed to choose where "there" is. Editing home no longer
touches `homemode` either — the smoke suite pins that, because silently arming
boot when someone types a number is exactly the kind of helpfulness that moves
a panel on the next power cycle.

*Reverse is a tick here too*, drawn from `min > max` like the other two, so
all three reverse controls in the app are the same control.

*And the units match.* min, max and home are microseconds on this table now,
as they are in the wizard and on the dial. Quarter-µs is still what is stored
and exported and is in the tooltip. Two tables in one app showing the same
field in different units is the sort of thing that reads as a fault at the
bench — the wizard's units won because they are also the servo's.

The amber/red bands and the ease tooltips came along with it, so a channel
edited from the main screen gets the same warnings as one edited in the
wizard.

**Housekeeping this forced, and it was overdue.** `PW_STD`, `PW_ABS`,
`pwClass`, `pwTitle`, `EASE_TIP` and `EASE_KINDS` were declared in
`60-setup.js` and are now needed by `40-ui.js`, which the manifest loads
FIRST. It happens to work — nothing calls them until boot is done — but a
`const` referenced across scripts in load order is a trap waiting for the day
someone calls one at module scope. They live in `00-core.js` now, which is
where a definition two modules share belongs.

**One more µ.** `text-transform:uppercase` turns µ into Greek capital Mu, so
`µs` headers render as `MS` and read as milliseconds. 0.9.0 fixed that for the
wizard with `.settab th .u`; the main table uses the bare `th` rule and was
still showing "MIN MS". The selector is now plain `th .u`, which covers both
tables and the live-position column.

**Tests.** Studio smoke 86, up from 81. The new five cover the main table
directly: home editable with boot off and not arming it, the µs⇄quarter-µs
round trip, the bands, the reverse tick round-tripping, and the drive slider
still spanning a reversed pair the right way round.

### 2026-08-12 — PCA Studio 0.9.1: "set ends" is "configure", and what ease means

**Why.** Three from Mike, straight after using 0.9.0.

*Reverse on the dial is a tick too.* It was still a `⇄ reverse` button there
while the table had a checkbox, which is two controls for one idea. Same rule
as the row's: the box is drawn from `cal.min > cal.max` rather than stored, so
typing MIN above MAX ticks it and **reset to default** unticks it with no
extra bookkeeping, and unticking is a real undo.

*The button says `configure…`.* "Set ends" undersold it — that panel sets the
two ends, the centre, the direction and drives the servo while you do it, and
since 0.9.0 the ends are also editable in the table, so "set ends" was the one
thing it was no longer uniquely for.

*What ease means.* Mike asked, which means the column never said. It is the
SHAPE of a move, not its speed — speed and acceleration decide how fast, ease
decides how it starts and finishes:

- `none` — accelerate, run at speed, stop dead on the number. What a Maestro does.
- `soft` — `pcaStepChannel` brings the acceleration itself in over the first
  8 ticks (80 ms), so the part breathes into motion instead of jerking off the
  mark. Kindest to a long linkage or a heavy panel.
- `overshoot` — `pcaSetTarget` aims `dist/12` past the target and lets it
  settle back, which is what makes a pie panel read as *snapping* open. Two
  conditions people trip over: it only engages on moves worth more than an
  eighth of the channel's travel, and the aim is clamped to `min`/`max`, so a
  brick that already drives to an endpoint is byte-identical to `none`. That
  second one is already in §Traps as the reason an ease-compare test that
  targets `max` proves nothing.

That now lives in `EASE_KINDS`/`EASE_TIP` in `60-setup.js` — one definition,
used by the column's tooltip, each option's tooltip, the apply bar and a
paragraph above the table, so the four cannot drift apart.

**Tests.** Studio smoke 81, up from 80: the dial's reverse tick swaps the
ends, reports checked, and follows the numbers when they are typed rather than
clicked.

### 2026-08-12 — PCA Studio 0.9.0: the channel table does the work now

**Why.** Mike's list, from using the setup screen for real. Seven things,
and the thread running through them is that the table was a *display* and
the dial was the only *editor* — so every small correction meant opening a
channel, driving a servo, and closing it again.

**What changed, in his order.**

*Reverse is a tick box.* It was a `⇄` button that swapped min and max; now
it is a checkbox whose state is READ BACK off the numbers (`c.min > c.max`),
so it can never disagree with the two boxes beside it, and unticking puts the
pair back. Reversing is still a swap and there is still no separate invert
flag anywhere downstream — every consumer takes `Math.min`/`Math.max` of the
pair, which is the whole reason that decision was made in 0.7.0.

*Set ends resets, and takes typed numbers.* The three big MIN / CENTER / MAX
buttons still capture wherever the dial is, and each now has a box under it
you can type a pulse width straight into — quicker when you already know the
number, which on a second identical servo you usually do. A typed end outside
the current working range unlocks the full 500–2500 µs sweep rather than
being silently clamped to a number nobody typed. **Reset to default** goes
back to the stock 1000 / 1500 / 2000 µs behind a confirm, because it throws
away a calibration made against a real linkage.

*The pulse widths are editable in the table.* min, centre and max are three
number boxes in **µs**, not quarter-µs — the same unit the dial shows and the
same unit the warnings are about. Quarter-µs is still what is stored and
exported; it is in the tooltip. Centre is `home`, which is the same field the
dial's CENTER button writes.

*Home was the unanswered question.* Mike: *"I assume Home is the default when
turned on?? if so that should be configurable."* Yes — `home` is where the
channel is driven at power-up, and whether it happens at all is `homemode`.
That was derived silently (`home ? 'Goto' : 'Off'`), so it was never anyone's
decision. It is a **boot** tick per channel now: ticked drives to centre at
power-up, unticked means no pulses at all and the servo stays limp, which is
what stops a panel buzzing on a bench supply.

*Apply to selected.* A select column with a master tick in the header, and a
bar under the table: pick a setting, pick a value, apply. It covers speed,
acceleration, ease, min/centre/max in µs, boot, sleep-when-idle and the idle
time. It asks first, naming the setting, the value and how many channels —
and cancelling keeps what you typed rather than handing back the default.
Mike asked for filters "like names, boards etc"; he chose hand-picked rows
over both, which is the one that also covers "this board" and "everything
called pie" without a query language.

*Warnings.* Two bands, held as `PW_STD` and `PW_ABS`. Amber outside
1000–2000 µs, because plenty of digital servos travel further and people open
them up deliberately — a note, not an error. Red outside 500–2500 µs, where
the servo will either ignore the pulse or answer it by driving the horn into
its own end stop and sitting there stalled. The band shows on the box as you
type, on the dial's end boxes, as a count beside the channel tally, and as a
per-channel list on the Finish step.

**A latent bug this uncovered.** `setupRender()` empties `#calWrap` and did
not put the dial back, so any other control — ticking a channel, renaming
one — silently shut an open dial. That was cosmetic on its own, but
`setupCalOpen` widens the channel's `min`/`max` to the working range and only
cancel and commit restore them, so the channel was left stranded on
4000–8000 with a calibration half-done and nothing on screen to say so.
`setupRender()` now re-renders an open dial, and the smoke suite pins it.

**Watch for.** `data-act="apply"` is taken: it is the wizard's own "Build my
project" action, bound on `#setupWrap`, and this click bubbles all the way up
to it. Naming the new button `apply` closed the whole wizard instead of
applying anything, which is exactly the sort of thing a test catches and a
demo does not. It is `applysel`. Also: `text-transform:uppercase` turns µ into
Greek capital Mu, so a `µs` column header renders as `ΜS` and reads as
milliseconds — the unit is wrapped in a span the transform does not touch.

**Tests.** `pca-studio/smoke.test.js` is 80 passing, up from 67: the µs⇄
quarter-µs round trip, both warning bands and their boundaries, the reverse
tick's state coming back off the numbers, boot, apply-to-selected asking
before it touches anything and touching only the selection, the typed ends,
reset behind its confirm, and the dial surviving a re-render.

### 2026-08-12 — v1.28.2: the test suite, from 55 minutes to 6

**Why.** Mike: *"also why does testing take so long?"* Fair question, and the
answer was not any of the obvious candidates.

**What it actually was.** Measured rather than guessed:

```
launch chromium         211 ms
load the page           690 ms
20 trivial evaluates  23,914 ms   ← 1.2 s each
```

Not the suite count. Not the 6.28 MB bundle — `dev.html` is 24 KB and was only
four seconds faster. Not the deliberate sleeps, which total 51 s across all 26
suites, about 2% of the run. It was that every assertion is a round-trip into a
page whose main thread is busy rendering the droid, and on a box with no GPU
three.js falls back to SwiftShader, Google's software rasteriser. One frame
cost **740 ms**; the sim ran at 1.4 fps; every `page.evaluate()` queued behind
a frame. 1135 assertions × 2 builds × ~0.8 s is most of an hour, which is what
we had.

**What changed.** `?norender` on the URL sets `SIM.draw = false`, and the frame
loop in `app/main.js` skips `renderer.render()` — and only that. The firmware
ticks, the actuators move, the model transforms update, every assertion reads
what it always read. `scene.updateMatrixWorld(true)` is called in its place
because `render()` is what normally refreshes the world matrices, and raycast
picking and `viewFocusPart()` read them.

Every suite now loads with the flag; `R2_DRAW=1` puts the picture back for
watching. `look-boards.test.js` rewrites `docs/shots/shot-light.png` and
`shot-dark.png` only when `R2_UPDATE_SHOTS=1`; ordinary test runs stay
read-only and skip those rendering delays.

**Result.** 5 m 59 s for both builds, all 26 suites, 52/52 green. Was ~55 min.

**Worth knowing.** This is a GPU-less-container problem, so on a machine with a
real GPU the suite was never this bad — the fix helps everywhere but the
before-number is specific to where it was measured. Also, `music.test.js`
carries a brittle assertion: it sleeps 900 ms of wall time and requires the
WebAudio clock to have advanced past 0.5 s. Under heavy load it once returned
0.46 s and failed; alone it returns 0.86 s, three runs out of three. It wants
waiting on the clock rather than on a fixed sleep, and has not been touched.

### 2026-08-12 — puppetry headroom recorded as §6 item 10 (docs only)

**Why.** Mike asked whether replicating the Maestro on an Arduino missed the
chance to make servo control and puppetry better. Answer: mostly no — his own
v1.25.0 rule (*"We don't have to replicate the maestro. But we can use its
best bits"*) already confined the replication to the interfaces, and the
engine is past a real Maestro on tracks, loops, generators, easing and
release. But three real gaps remain where the Maestro's MODEL still
constrains: **displace-not-blend, one trapezoid per channel, and
unparameterised triggers.** Mike: *"add the full details of your proposal to
the handover … we'll pick them up later."*

Full detail — design sketches, the append-only compatibility rule, the
rules-to-pin-in-tests, and the recommended order (bench proof first, then
layered blending, then per-keyframe speeds) — is **§6, item 10**. No code
changed, no version bump; 1135/26 stands.

### 2026-08-12 — v1.28.1: "Opens in" now means how long it takes

**Why.** Mike, from the bench: *"in the r2 sim in the sequencer when advance
is enabled opens in and closes in are shown I dont think these work the way I
expected in my head … there's a time it takes to open the speed followed by a
gap then a close — does that make sense?"* It made complete sense. It was also
not what the sim did, and he had the screenshot to prove it: a 6.10 s brick
with 3.00 s ramps sat shut for three seconds and then snapped open.

**What was wrong.** Two things, one of which hid the other.

`blockCompile` emitted four keyframes per brick — `t0`, `t0+rise`,
`t0+dur−fall`, `t0+dur` — and left the *shape* of the ramp to the channel's
own speed and acceleration. That is a reasonable thing to do on a Maestro,
where speed is the ramp mechanism, and it is why `blockMinTravelMs` floors the
ramps. But a channel with no speed set has nothing to stretch the jump with,
so a ramp became a delay: the shut pose held for the whole of `rise`, then one
instantaneous move. Mike's Pie 1 is exactly that channel — the inspector even
says *"no speed limit set on this channel"* — so he got the pure form of the
bug. On a channel that DOES carry speed the ramp appeared, but only ever as
long as the speed setting made it, never the time the brick asked for.

Underneath that sat an off-by-one-interval. A frame commands its targets and
then waits its duration, so the pose a frame carries is where the droid should
be when that frame ENDS. The compiler sampled at the START of each interval,
which pushed every ramp one whole interval late.

**What changed.** `src/js/maestro/blocks.js` only — which means PCA Studio got
the same fix for free, since it shares the file.

- `blockBoundaries` subdivides each ramp: about one step per
  `BLK_RAMP_STEP_MS` (120 ms), capped at `BLK_RAMP_MAX_STEPS` (24). A 3 s ramp
  becomes 24 steps of 125 ms; a stock 300 ms ramp becomes 3 of 100 ms.
- `blockCompile` reads act bricks at the END of each interval and nested `seq`
  bricks at the MIDDLE — the middle because a boundary sample can land exactly
  on one of the sub-sequence's own frame edges and pick either side of it.
- `blockPoseAt` — the scrub pose — now reads a ROUTINE from its bricks rather
  than from its compiled frames. Two suites caught this immediately and were
  right to: the frames are a quantised rendering carrying end-of-step poses, so
  walking them put the playhead up to one step out, and scrubbing to 0 applied
  the first step's pose instead of the shut one. The bricks are the exact,
  continuous answer and are what the timeline draws, so the model and the
  picture now agree by construction. A plain imported sequence has no bricks
  and still walks its frames as before.

`blockValueAt`, `blockEffRamps` and the travel floor are untouched: a brick
still cannot ask for a ramp faster than the imported speed can deliver.

Mike's brick now compiles to a smooth open reaching full travel at exactly
3.000 s, a 100 ms hold, and a close that is shut on the brick's right edge at
6.100 s — the shape he described, in the preview, in an exported `.mstr` and
in `sequences.h` alike.

**The cost, and what watches it.** Frames. That one brick is 51 frames where
it used to be 5. The existing `script-size` lint rule is the guard for the
Pololu route — it estimates the script against the board's limit and warns at
80% — and the PCA route's limits (128 slots, channel count) are checked
alongside it. Nothing new was needed, but the numbers move faster now than
they used to.

**Tests.** `tests/sequencer.test.js` gained three assertions that pin Mike's
mental model directly — half open at 1.5 s, fully open at 3.0 s, shut at
6.1 s, on a channel with speed and acceleration forced to 0 — plus one that
the very first frame is already moving rather than holding shut. All four fail
against the pre-fix compiler, which was checked by reconstructing it. The
"one brick becomes a ramp-up, a hold, a ramp-down and a home frame" assertion
was relaxed from `frames===5` to `frames>=5`; its `at0===closed` clause was
the bug written down as an expectation, and is now the opposite assertion.

### 2026-08-12 — v1.28.0: Sim only, the mode you hand the laptop over in

**Why.** Mike: *"Need to add a Sim only which displays the Droid and its
background / track and when enabled has the option to set a temporary password
— this will allow the public to have a go at driving the Droids."* A show
stand, a stranger, and a laptop that is also the only place this build is
configured. The sim already had the interesting half of that — the real
firmware, the real geometry, a timed circuit — and none of the boring half.

**His four answers, 2026-08-12** (all the recommended option): the password
locks the **exit**, not the entry; it is **session-only**, held in memory and
never written anywhere; the mode keeps the **stage, the on-screen pad and the
HUD** and nothing else; and the model, backdrop, environment and track are
**locked to whatever was live when it was enabled**.

**It is deliberately NOT a fifth workspace.** The four workspaces
(config/workspaces.js) answer *what am I doing*, they are a preference, and the
app remembers and restores them. This answers *who is holding the laptop*, and
it is a lock. A lock a reload could restore is a lock that can strand Mike out
of his own droid at a show, in front of people. So `KIOSK = {on, pass}` lives
in `app/kiosk.js`, is touched by nothing that persists — not `PREFS`, not the
setup `.json` — and dies with the tab. That is the entire meaning of
"temporary", and the suite asserts it three ways: the password string does not
appear in the localStorage blob, `setupExportObj()` has no trace of it, and a
reload comes back in the workshop.

**The sketch is untouched, same rule as the model selector (§3).** `loop()`
runs, the Maestro steps, the automation timers tick. Hiding a pane never
changes behaviour — the public are driving the real ported firmware, which is
the whole point of the sim. Entering changes nothing about the scene either, so
leaving has nothing to put back.

**The guards are the actual work; the CSS is cosmetic.** `10-kiosk.css` hides
the header, the sidebar and every tab, the stage pickers, the sequencer door
and the splitters. That stops a stranger *finding* trouble. It does not stop
trouble: four doors survive `display:none` and are closed at the function
instead, each consulting `kioskOn()` —

- **the file drop** (`maestro/ui-files.js`). The window accepts a `.json`,
  `.ino`, `.r2m` or `.mstr` dropped **anywhere** and reconfigures itself from
  it. The single most destructive thing a visitor could do by accident, and no
  amount of hiding reaches it. Note the refusal still calls
  `e.preventDefault()` first — return early without it and the browser
  **navigates to the dropped file** and the kiosk is gone entirely.
- **`openStartup()`** (`look/startup.js`) — the Setup button is hidden, the
  function is one call from anywhere, and the wizard is where the droid is
  configured.
- **`wsSet()`** — a workspace change would put the sidebar back.
- **`setStripMode('seq')`** — the desk has more doors than anything else (the
  strip switch, the header, a dropped audio file, a sequence card); refusing
  entry in the one function closes all of them. Leaving is never refused —
  `kioskEnter()` uses `setStripMode('pad')` itself to get out of the desk on
  the way in.

**Entering is a housekeeping pass, not a state machine.** Before the class
lands, `kioskEnter()` leaves the sequencer, turns the puppet rig off (it owns
the servos), and closes the app menu, the save/load popover, the stage picker,
the "?" card, the setup wizard, the import wizard and the Maestro builder.
Anything left half-open would sit underneath the kiosk with no way to reach it.

**Three answers on the way out, not one.** No password set → an `appConfirm`,
because the mode is still worth a "are you sure". Password set → an
`appPrompt` with `password:true` (new option, `core/dialog.js`: `type=password`
and no preselect — nothing to type over, and selecting a masked value only
invites overtyping it blind). Cancel leaves it locked silently; a wrong answer
says so in a toast and logs it. The prompt's existing Enter/Esc containment
matters more here than anywhere it was written for: this dialog sits over a
**live pad**, and a keystroke reaching the mapper would arm the feet under a
stranger's hands.

**The bar takes the header's grid track.** `#app` is `grid-template-rows:38px
1fr`; with `header{display:none}` and `#kioskBar` shown, the bar simply *is*
row 1 — no grid maths, and nothing absolutely positioned over the stage, where
`bindCamera()`'s pointer capture makes overlays a hazard (§7). `#kioskBar`
carries no `hidden` attribute on purpose: `#kioskBar{display:flex}` outranks
the UA's `[hidden]`, so it would have been an attribute that reads
authoritative and does nothing. One rule owns it.

**A trap this flushed out, worth the whole screenshot.** `body.kiosk
#splitH{display:none}` collapsed the entire controller strip to 1px while the
row it belonged in sat empty. `#left`, `#main` and `#padwrap` all rely on grid
**auto-placement**: `display:none` removes an element from the grid, so hiding
the middle child promoted `#padwrap` from row 3 into row 2. It is
`visibility:hidden;pointer-events:none` now, which keeps it a grid item holding
row 2 open at 0px. Everything else hidden here is either the last item in its
container (`#side`) or explicitly placed (`#stripmode`, `#pupbar`,
`#padstage`/`#padside` — 03-pad.css), which is why `display:none` is safe for
those. **Check placement before hiding a grid child.**

**Not built.** No timed expiry (Mike chose session-only, and a mode that drops
out from under a visitor mid-lap is worse than one you leave by hand); no
per-visitor lap board — the circuit's own `TRACK.times` HUD is what they get;
the public cannot change the model or the backdrop, so a stand showing all
three means leaving sim only between them; and there is no true browser
full-screen call (F11 is the operator's job, and requesting it needs a user
gesture the mode's own dialog has already spent).

**Checks.** `tests/kiosk.test.js`, 48 assertions — the bar, each surface it
hides, the frozen scene, `SIM.millis` still advancing, all four guards
including a synthetic `DragEvent` with a real `File` in it, the exit's three
answers, and the reload. **1131 passing, 0 failing across 26 suites on BOTH
builds.**

### 2026-08-11 — MaestroPCA 0.8.0: two boards, one engine

**Why.** Mike: *"could we use two ESP's one as the master to get around the
servo limit"* — I said yes but argued against the stated reason, and he said
build it anyway. Both halves of that were right: it is the wrong tool for
channel count and the right one for distance, and it is small enough that
having it costs nothing.

**`MpcaSplitOutput`** sends boards `0..localBoards-1` to a local output and
everything above down a `Stream` to a second board. **The channel table needs
no change at all** — it already says which board every channel is on, and
nothing ever promised a "board" was a PCA9685. Same `sequences.h`, same
editor, same `restartScript(n)`.

**The wire format is PCA Studio's**, unchanged: three bytes, high bit marking
the header so a dropped byte self-resyncs. That was not a coincidence worth
passing up — `PCA_Bridge` already speaks it, the format is already documented,
and `Esp32Slave` ended up being a hundred lines because of it.

**QUARTER-MICROSECONDS cross the wire, not codes** — and this is what forced
an interface change one commit after shipping the interface. `code(qus)`
became `code(board, pin, qus)`, because a rig split across two different kinds
of output quantises differently per bank and a signature without the channel
cannot say so. Local channels dedupe on the local hardware's quantisation;
remote ones on the µs, because only the far end knows what it will round to.
**The first thing to use the abstraction in anger found the shape slightly
wrong**, which is the argument for building the second implementation rather
than admiring the first.

**Cost on an AVR: 4 bytes.** `--gc-sections` drops the whole split backend
when nothing references it, which is exactly what should happen — measured
27,010 → 27,014 on the real `MaestroReplacement` build.

**`examples/Esp32Slave`** is deliberately stupid: it holds no sequences,
computes no easing and knows nothing about the droid. Everything clever
happened before the bytes left the other board. Its one real decision is what
to do when the master goes quiet — HOLD the last position (default, safest for
a panel that would fall shut) or go limp — and that is a `#define` rather than
a decision made for somebody else's droid.

**`split_test.cpp` (16 assertions)** covers routing both ways, the exact bytes
on the wire, that nothing local leaks onto it, that a sequence and an eased
move both cross correctly, that a settled remote channel stops sending, and
that pulses-off crosses as 0. `Esp32Slave.ino` is compile-checked against the
faked ESP32 like its master.

**A test bug worth remembering:** two assertions "passed" while printing the
wrong value, because C++ does not promise argument evaluation order — the
message read an out-parameter that the call in the same argument list had not
yet set. Compute into a variable before `ok()`.

C++ suites are now 40 / 40 / 14 / 18 / 16 plus two compile checks.

### 2026-08-11 — PCA Studio 0.8.0: the setup screen knows about the ESP32

**Why.** Mike: *"what if we use a esp with the 2026"* — and I answered the
wrong question first. He has used "2026" for the **PCA9685 boards** since the
setup screen was specified (*"how many 2026's… 2 wired in series or
parallel"*), and I read it as the mod2026 sketch. Worth recording because the
lesson is not about ESP32s: **when a word means something specific in
somebody's vocabulary, an answer that redefines it is not an answer.** Asking
which of three readings he meant cost one click and would have cost nothing
the first time.

What he actually meant: an ESP32 driving the existing PCA9685s, in place of a
Nano.

**Setup now offers `Esp32Droid`** as a third sketch, but only when the
controller is an ESP32 — and switching controller drops a sketch that cannot
be flashed on the new one, rather than leaving a stale choice selected. The
generated config block turns ESP32-shaped: `MPCA_DIRECT_PINS 0`,
`Wire.begin(21, 22)`, the link pins, the access-point name, and a note that
its VCC is 3V3 while V+ is still the servo supply.

**The card says which way the ESP32 should drive**, computed from the boards
you already answered: past 16 channels the choice is made for you, because
that is how many LEDC channels the silicon has. At 16 or fewer it points out
that the ESP32's own pins would give ~0.3 µs steps with no expander at all.

**The honest summary, now in `docs/servo-brains.html`:** against a Nano with
the same two PCA9685s, an ESP32 buys a radio and 4 MB of flash for about £1
and changes nothing about the motion — same engine, same 100 Hz tick, same
4.88 µs expander steps. The processor was never the limit. Whether that is
worth swapping a working board for comes down to whether firing a routine
from a phone at an event is a thing he will actually do.

Studio smoke test 65 → 67.

### 2026-08-11 — MaestroPCA 0.7.0: the ESP32 version, ready to test

**Why.** Mike: *"now create the ESP version ready for testing."* The
`MpcaOutput` interface from 0.6.0 existed precisely so this would be a
subclass rather than a fork, and that is how it turned out.

**`MpcaLedcOutput` (`src/MpcaEsp32.h`)** drives servos straight off ESP32
pins. The LEDC peripheral gives 16 hardware PWM channels, and at 50 Hz it
runs them at 16-bit resolution — **0.305 µs a step, better than a PCA9685's
4.88 µs** and close to a Maestro's 0.25 µs. Sixteen servos or fewer therefore
need no expander at all: no I2C, no address jumpers, no second board. Sixteen
is a hard ceiling (it is the silicon's channel count) and `overflowed()`
reports it, because the failure mode otherwise is the top channels going
quietly dead — the exact fault that cost a bench session in v1.24.0.

It compiles against **both** LEDC APIs. Arduino-ESP32 3.0 merged `ledcSetup` +
`ledcAttachPin` into `ledcAttach` and changed every `channel` argument to
`pin`; both cores are alive in the wild and which one somebody has is not
their fault, so the header handles either via `ESP_ARDUINO_VERSION_MAJOR`.

**`examples/Esp32Droid`** is the co-processor plus the thing that actually
justifies an ESP32: a web page. It joins your network or, failing that, raises
its own access point (`R2-PCA`) — which is the honest default for a droid at
an event, where there is no network to depend on. `GET /` lists the slots as
big buttons, `/run?slot=n` fires one, `/stop` kills everything, `/status`
returns JSON. Fire a routine from a phone without opening the dome. Everything
else — the Maestro link on Serial1, the console keys, the watchdog — is the
Nano sketch's behaviour unchanged.

**What is and is not proven.** `test/ledc_test.cpp` (18 assertions) covers the
duty arithmetic against hand-computed figures (1500 µs → 4915 counts at 16
bits), the resolution step-down above ~1220 Hz, the GPIO mapping, the
16-channel ceiling, and the engine driving it end to end with easing intact —
all against a faked peripheral. `test/esp32shim/` fakes an entire ESP32
(String, WiFi, WebServer, Serial1, LEDC) so the **sketch itself compiles and
links**, which catches every mistyped method and stale API without installing
a 2 GB toolchain.

**None of it has met silicon**, and the sketch says so in its own header
comment. Flash it expecting to find something. What cannot be faked is
whether `ledcWrite` does the right thing and whether the WiFi joins.

C++ suites are now 40 / 40 / 14 / 18 plus the compile check.

### 2026-08-11 — PCA Studio 0.7.1: two bench-found bugs in the setup screen

Mike, straight off using it: *"it worked the first time but not the second
time I went in — also the Dial isn't draggable and it's too coarse."* Both
real, and the first one is the more interesting.

**THE HOLE BUG — "worked the first time, not the second".** `setupApply()`
did `PROJ.channels.length = setupChannels()` and then walked the range calling
`setupEnsure(i)`. But `setupEnsure` only PUSHES while the array is short, and
after setting `.length = 32` it no longer is — so the slots that `.length`
created stayed **holes**. A sparse array is invisible in JS: `forEach`,
`filter` and `map` all skip holes, so everything appeared to work. Then
`projSave()` ran `JSON.stringify`, which writes a hole as `null` — and a null
is NOT skipped. On the next page load `PROJ.channels` was 32 real entries of
which most were `null`, and the first thing to touch `c.mode` threw.

That is why it worked once. Nothing was wrong until it had been *saved and
reloaded*, which is exactly the gap between "I set it up" and "I came back to
it". `setupFill()` now assigns a real object to every slot, `setupEnsure()`
fills a hole as well as extending, and every `filter` over channels guards for
a falsy entry. Tested through an actual `JSON.parse(JSON.stringify())` round
trip, because that is where it hid.

**The dial was not draggable, and it was the panel's own fault.** Every
`calSet()` called `setupCalRender()`, which rebuilt `calWrap.innerHTML` — so
the first `pointermove` destroyed the `<svg>` the pointer was captured on, and
the drag died on frame one. Clicking worked, which is what made it look coarse
rather than broken. **The panel is now a shell plus a paint pass**:
`setupCalRender()` builds the DOM once and `calPaint()` moves the needle, the
readout, the ticks and the labels in place. New rule at the top of that
section: anything that changes every frame belongs in `calPaint()`.

**And it is now as fine as the unit allows.** The slider steps 1 quarter-µs
rather than 4; there are ±0.25, ±1 and ±5 µs nudge buttons; the dial takes
focus so the arrow keys step 0.25 µs (10 with shift); and there is a box you
can type an exact pulse width into. The readout shows two decimals. 0.25 µs is
the floor — it is the Maestro unit the whole project speaks, and finer would
be inventing precision the format cannot carry.

Studio smoke test 61 → 65, including a drag that asserts the SVG node is the
same object afterwards.

### 2026-08-11 — MaestroPCA 0.6.0: the output is an interface

**Why.** The last thing `docs/servo-brains.html` said was worth doing whether
or not Mike ever buys an ESP32, so he asked for it directly. The engine handed
positions to an array of `Adafruit_PWMServoDriver*` — a PCA9685 and nothing
else — even though nothing above that line is about a PCA9685. The sequences,
the kinematics, the easing and the whole Maestro protocol are just "put this
channel at this many quarter-microseconds".

**`MpcaOutput`** is four methods: `begin(oscHz, servoHz)`, `code(qus)`,
`writeCode(board, pin, code)`, `off(board, pin)`. `MpcaPca9685Output` is the
existing behaviour behind it. **The original constructor still exists and
still takes the board array** — it builds the PCA9685 backend for you — so
every sketch and every generated `sequences.h` written before this compiles
and behaves exactly as it did. A second constructor takes an `MpcaOutput&`.

**Why `code()` exists, since three methods would look tidier.** A PCA9685
quantises to 4.88 µs steps at 50 Hz, so dozens of distinct quarter-µs targets
land on the same tick, and the engine's dedupe has to happen on the value that
actually goes on the wire or a 100 Hz tick floods the I2C bus with writes that
change nothing. That dedupe was `lastTicks` in `ChanState` and stayed there;
what moved is who decides what a "tick" is. A backend with real hardware
timers returns the µs and gets the same protection for free.

**What it cost:** 284 bytes of flash and 13 bytes of RAM on an AVR, measured
with `avr-size` on the real `MaestroReplacement` build before and after
(26,726 → 27,010). Under 1% of a Nano for the ability to put an ESP32 or a
Teensy underneath the same sequences, the same editor and the same
`sequences.h`.

**Proved rather than asserted.** `features_test.cpp` gained a `DirectPins`
backend — microsecond resolution, no board concept, the shape a Teensy driving
pins would take — and the whole library drives it with no idea it is not a
PCA9685: homing writes 1500 (µs, not ticks), a move lands exactly on target, a
settled channel stops writing, sequences run against it unchanged, and
pulses-off reaches it. That test is the deliverable; the interface is just how
it is spelled.

The JS twin needed nothing — `E.onWrite` has been the same seam since Studio
got live hardware. Both files now point at each other.

**Also, from the same conversation:** a **reverse** button on the calibration
dial and on each channel row. Mike: *"it's easier to explain."* It swaps the
two ends, which is the whole of what reversing a linkage means, and there is
still no invert flag anywhere downstream.

### 2026-08-11 — PCA Studio 0.7.0: the setup screen, and a dial you calibrate on

**Why.** Mike: *"we now need to build an initial setup screen for the PCA
Studio … firstly it should ask for the components … include a wiring diagram
… we should then offer the correct IDE sketch … the user should then be able
to select which channels are in use and name them and set the same settings as
the Maestro … for the end points we should use a large Dial with three buttons
underneath Min / Center / Max."* Built in Studio first, to fold into the sim
once it has earned it.

**Six steps** (`pca-studio/src/js/60-setup.js`): controller, PCA9685s, wiring,
sketch, channels, finish. The first four exist to make the fifth honest.

**The wiring question is two questions.** Mike asked about "2 in series or
parallel, 4 as 2×2". Every PCA9685 sits on the same I2C bus whatever the
layout, so the useful split is SIGNAL (chained board to board, or star back to
the Arduino) and POWER (one supply daisy-chained, or a feed per board) — asked
separately because they are independent, and on a droid they usually should
be different. The diagram is generated from the answers: the address jumpers
per board (0x43 = bridge A0+A1, the thing everyone gets wrong), the I2C run
down one side, V+ down the other, and a stall-current check against the supply
you named. First draft ran the cables straight through the board labels; the
legend then sat where the signal curve crossed it. Both moved.

**THE CALIBRATION RULE, and why the range opens.** The dial drives the servo
live through the same engine the sequencer uses, and MIN / CENTER / MAX
capture wherever it currently is. That means the channel's working range has
to be OPENED while the dial is out — `pcaSetTarget()` clamps to min/max, so a
channel still on its defaults could not be moved to the endpoint you are
trying to record. Cancel restores the old range exactly; commit writes the
captured pair and arms `homemode`. The sweep starts at a cautious 1000–2000 µs
and the full 500–2500 µs is a separate deliberate unlock, because there is a
real linkage on the other end and a horn in a hard stop strips a gear.

A reversed linkage needs **no invert flag** — capture MIN wherever the part is
at its minimum, even if that is the bigger pulse width. Everything downstream
already uses `Math.min`/`Math.max` on the pair. One less concept, and one less
thing to get backwards.

**`calibrated` is a flag, not an inference.** The Finish step warns about
channels you have not set on the dial. My first version guessed from the
numbers ("still on 4000–8000"), which is wrong twice over: a channel can be
left on a default because that default is genuinely right, and one can be
typed to something else and still be a guess.

**Three exports, one of them the default.** Mike, v1.38.3: *"why do we have
two export methods .json and .h"*. Because they were sitting side by side as
equals and are nothing of the kind — presented as a pair, the only fair reading
is that you must understand the difference before you are allowed to leave.

| file | who needs it | where it is |
|---|---|---|
| **servo config** (`R2-servos-<date>.json`, `servoCfgExport()`) | everybody — names and travel, the part of a build that outlives the rest of it. Imports on the wizard's Servo setup step and reads back here | the one button on **Finish**, and the same file the Finish prompt writes |
| `servos.h` | anyone compiling `MaestroReplacement` / `Esp32Droid` themselves | **Finish, but only when that sketch is selected** (or Advanced) |
| `servo-setup.json` (`setupJson()`) | a backup of the bench page: boards, wiring, power, pulse rate AND the table. Loads back in **without touching your sequences** | **Advanced** only |

The confusion underneath the question was two buttons that both said `.json`
and produced different files — the bench's default export is `servoCfgExport()`
now, so the button and the prompt cannot disagree. Endpoints are calibration,
sequences are art; they change for different reasons, which is why `servos.h`
is regenerated when you recalibrate and not when you change a move. It covers
every pin the boards HAVE rather than just the ticked ones, and carries an
`#error` if the count exceeds them — a table shorter than the hardware is
exactly the fault that reads as "that servo is dead", which cost a bench
session in v1.24.0.

**`calibrated` is a flag, and now the SAVE PROMPT reads it too.** The v1.38.0
Finish prompt gated on `servoCfgConfigured()` — "has any channel got travel
unlike the default?" — which is the same inference the paragraph above rejects,
made in a second place. Mike named and ticked four channels, had not yet been
round the dial, and was let out in silence. `setupSaveWorth()` asks *did
somebody do work here*: a channel captured on the dial, a channel named
something other than its number, non-factory travel, or any edit this session.
A table straight out of the profile still says nothing, because nagging about
a file nobody changed is how people learn to click through dialogs unread.

**A real defect in the shared engine, found by building this.** `E.channels`
is a live reference to the host's channel array, and the setup screen grows
it. `pcaTick` did `E.st[c].active` for every channel — so one tick after a
channel was added threw inside `requestAnimationFrame`, which kills the loop
and freezes the entire app. Setup now rebuilds the engine whenever the count
changes AND `pcaseq.js` guards the gap, because a missing state should cost
that channel, not the application. The guard has no counterpart in the C++,
where the table is fixed at compile time and cannot grow — noted at the line
so nobody mirrors it back.

**Also worth knowing:** a bare `.setbody svg` rule outranked `.caldial` and
stretched the dial to the full width of the card — it rendered as a metre-wide
letter C. Specificity, not layout.

**A reverse button, added the same day.** Mike: *"we should add a reverse
button, it's easier to explain."* He is right — the previous instruction was
"capture MIN wherever the part is at its minimum, even if that is the bigger
number", which is true and reads like a riddle. Reverse simply swaps the two
ends, on the dial and on the channel row. There is still no invert flag
anywhere downstream, and there still does not need to be.

**Also: `docs/servo-brains.html`** — Maestro vs the PCA route vs ESP32 vs
Teensy, prompted by *"does the maestro run things in parallel or serial?"*
The answer is both, and the distinction is the whole reason MaestroPCA exists:
MOTION is parallel (every channel has its own speed/accel, all updated every
20 ms) but SEQUENCES are serial (one script, one stack — `restartScript(n)`
abandons whatever was running). Facts worth keeping: a PCA9685 at 50 Hz has
**4.88 µs** steps (20000 ÷ 4096), so our quarter-µs targets round — 0.5% of a
throw, inside the slop of a printed linkage, but it is why the oscillator trim
matters. An ESP32 has **16 LEDC channels** so it cannot direct-drive a full
dome, but for ≤16 servos it manages ~0.3 µs, better than a PCA9685. A Teensy's
stock Servo library caps at **12 motors**. Verdict: build the ESP32 version
only when the radio is worth it — it would not improve the motion, which is
limited by the PCA9685's steps and not by the CPU — and skip the Teensy.

**One thing that came out of writing it** and is worth doing whenever
`MaestroPCA.cpp` is next open: the engine already hands positions to a list of
PCA9685 objects. Making that a small interface rather than a concrete type is
about an hour, and it is what would let an ESP32 or a direct-PWM board drop in
under the same sequences, editor and `sequences.h`.

Studio smoke test 48 → 61.

### 2026-08-10 — v1.27.0: the sequencer opens for PCA9685 builds

**Why.** Mike: *"should the sequencer in the r2d2 sim work for the 2026? its
currently not clickable."* It was not a bug — the desk was gated on
`PROFILE.hasMaestro`, mod2026 declares `hasMaestro:false`, and mod2026 is the
boot default, so a fresh session landed on a dead button. But the reasoning
behind that gate expired the moment `arduino/MaestroPCA` existed. A PCA9685
**can** hold a routine now; the co-processor answers `restartScript(n)`
exactly as a Maestro does. The gate was still enforcing a limitation we had
spent a fortnight removing.

**The gate moved from the PROFILE to the BUILD.** `buildSeqBoard()` returns
the Maestro this build calls for, or the PCA9685 arrangement it implies —
`pca32` when dome and body are both mod2026 (two boards, 0x40 and 0x41, which
is what the default build's own wiring sheet already said), `pca16` when only
one is. `buildCanSequence()` is `!!buildSeqBoard()`, and that is what the
strip button, the header workspace button and the Maestro pane now ask. In
practice it refuses only a build with no servo answers at all, so the refusal
wording changed from "mod2026 has no Maestro" to something that is true when
it fires.

**`MSTR.board` was always "which servo board these settings describe"** — it
just happened to only ever hold a Pololu id. `PCA_SEQ_BOARDS` adds `pca16` and
`pca32` and `boardById()` resolves them, deliberately WITHOUT putting them in
`MAESTRO_BOARDS`: that list is the Pololu picker, and a PCA9685 is not
something you pick there, it comes from the build. `boardIsPca()` is how
everything else asks.

**What a PCA build gets.** Opening the desk generates a 32-channel dome
starter (pies first, side panels filling the rest — the body layout would
leave two thirds unnamed), and everything downstream is the same desk: the
library, the brick timeline, the loadout, the lint. What changes is the
output. The build button reads **⚙ Build your sequences.h**, the builder drops
the script preview and the Copy-script button (there is no Pololu script), and
the primary action exports the header for MaestroPCA. Slot order still IS
`restartScript(n)` numbering, which is the whole reason the co-processor was
worth building.

**The linter had to learn the difference.** Its entire script section — the
top-level loop trap, the missing `quit`, subroutine underflow, the 1 KB/8 KB
script space — is about a machine that is not there on this route. It is
skipped for a PCA board and replaced with the two limits that DO bite: 128
slots (the Maestro protocol's slot byte) and the channel count the board
arrangement has pins for. Before that, the first thing a PCA build saw was
`script-size: the script is about 900 bytes and the PCA9685 ×2 holds 0`.

**A defect I introduced and the tests caught within one run:** I had
`buildMaestroPane()` generate a starter when none was loaded, which seemed
harmless. `rebuildMaestroUI()` runs from dozens of places, so MSTR became
loaded at moments nothing asked for it — and `makeStarter()` with no argument
inherits `MSTR.board`, so a later test asking for the default body starter got
a 32-channel PCA one. Two suites failed immediately. **Rendering a pane must
not have side effects**; `setStripMode` and `bldOpen` are the two places that
legitimately create a starter.

**`tests/workspaces.test.js` asserted the old refusal** in detail — the
`.blocked` class, the toast, the disabled strip button. Those assertions were
correct and are now wrong, so they were replaced rather than deleted: the door
still has a gate, mod2026 now passes it, and the new block checks the thing
that actually matters — that clicking it enters the desk, generates a 32-
channel PCA starter, says "sequences.h" on the button, lints clean and exports
a header with all 32 channels.

**Checks.** **1083 passing, 0 failing across 25 suites on BOTH builds.** Three
suites reported as flaky mid-run and all six re-runs passed alone — the cause
was my own debug browsers competing for the machine, not the code. Worth
knowing for next time: `page.click` on ANY header button times out in the
distributable build when the box is loaded, so a "(no summary)" crash in
`workspaces`, `mstr-share` or `build-config` means contention, not a
regression. Do not run a browser alongside `./test.sh`.

**Also: `docs/rtrobot-board.md`** — Mike asked whether anything in an RTrobot
servo-controller manual was usable. Its whole instruction set is four commands
(`#1P1500T1000D800`, `#…#…`, `G<n>F<r>`, `~ST`, `~RE`) and `G3F1` is
`restartScript(3)` in another dialect, so an exporter would be small: our
frames map onto its steps almost 1:1, including "this frame does not drive
this channel", because you only list the channels you want to move. What it
has no concept of is per-channel speed/acceleration (Mike's calibration has
nowhere to go), concurrency, background layers, release-when-parked or easing
— the four things we deliberately went past the Maestro to get. Written up as
a decision document, no code, on the understanding that he does not own one.

### 2026-08-10 — v1.26.0: PCA Studio is built, and gets the brick sequencer

**Why.** Mike: *"can we add a sequencer the same as is in the R2 Sim to the
PCA Studio"* — the brick timeline, with the library and groups. He also chose
how to carry the cost: build Studio from modules rather than let 1,600 lines
of sequencer exist twice.

**PCA Studio is now a BUILT artifact.** `pca-studio/manifest.json` +
`tools/build-studio.js`, run by the same `./build.sh`. The output is still one
self-contained file you open from disk with no server — that was always the
point of it — but it is no longer a file you hand-edit. Edit under
`pca-studio/src/`, rebuild, refresh.

This is the direct consequence of v1.25.1: the endpoint-clamp fix landed in
`MaestroPCA.cpp` and `pcaseq.js` and sat there while the third copy, inlined
in `PCA-Studio.html`, still had the defect. THE RULE ("change one, change all
three") was doing its job as documentation and failing as engineering.
**There are now two copies of the kinematics, not three** — the C++ and
`pcaseq.js` — and Studio is built from the latter. `E.onWrite(ch, qus)` is the
one thing Studio needed that the sim didn't; it is null there, so `E.writes`
still means exactly what the tests have always counted.

Also now shared rather than copied: the `sequences.h` generator (the sim-only
front-ends split out into `pca-gen-sim.js`, since they read MSTR and the
Maestro tab's DOM) and the travel model, lifted out of `lint.js` into
`travel.js` because the brick ramps need the same physical floor. A test
asserts the two tools emit **byte-identical** headers from the same project.

**The block sequencer now has a host seam.** `blocks.js` was written against
the sim's globals — MSTR, PARTS, CAD, MUSIC, PREFS — which is what kept a
perfectly general timeline-and-compiler tied to one droid. Everything it needs
from its surroundings now goes through one object, `BLKH`:
`src/js/maestro/blocks-host.js` for the sim, `45-blocks-host.js` for Studio.
The model file itself is shared verbatim. **Sim behaviour is unchanged** — the
80 sequencer and 40 track-UI assertions all still pass, which is the only
reason to believe that.

The adaptation is smaller than it sounds. A brick's `ref` is an ACTUATOR in
the sim ('pie3') and a CHANNEL in Studio ('ch3'); everything downstream only
ever passes a ref back through `chanFor()` and `label()`, so that one
substitution is most of it. Studio's groups are what a PCA9685 rig actually
has — one per board when there are two, plus any set of channels sharing a
first word ("Pie 1", "Pie 2" → "Pie ×4"), which is how people name things
anyway.

**The timeline UI is Studio's own** (`50-blocks-ui.js`), not a port of
`blocks-ui.js`: that file is bound to the sim's sequencer pane, its 3D model
tint, its music track and its part inspector. Sharing the LOGIC is the part
that matters, because that is where the bugs live. Studio gets: drag to move
with edge/grid snapping and a labelled snap line, drag the ends to resize,
per-brick rise/fall and partial travel in an inspector, ready-made shapes
built from a group, whole sequences dropped in as one brick, Ctrl+Z / Ctrl+
Shift+Z, Delete, and − slower / + faster. Ramps are drawn as a FADE rather
than a flat wash, so a brick reads as the shape of its move — a flat overlay
looked identical to a brick whose ramps filled it completely, which is common
once a channel's speed floor is applied.

**One thing Studio does that the sim does not: it refuses to adopt an
imported frame list silently.** The first brick to land makes
`blockCompile()` regenerate the entire frame list, and in Studio the
sequences you are most likely to click on are the ones that just came out of
somebody's `.mstr`. The timeline shows what would be lost — "18 frames,
probably imported" — and offers *Rebuild it as bricks* or *Copy to a new
sequence first*. An empty sequence is still adopted the moment you drop
something in it, because there is nothing to lose.

**Worth knowing about ramps.** `blockEffRamps()` floors a ramp at the
channel's own travel time and then caps it at half the brick. The cap wins:
a brick shorter than twice its floor gets half its own length, and the servo
simply doesn't finish the throw. That is what the real board does — the
compiler does not get to invent time it wasn't given — and the linter is what
flags it. My first version of the Studio test asserted the floor always wins
and failed correctly.

**Checks.** **1080 passing, 0 failing across 25 suites on BOTH builds** —
one more than v1.25.0, the new position-clamp regression. Studio smoke test up
from 35 to 48, the new ones covering adoption (including the refusal and the
copy-first path), lanes, frames regenerating from bricks, a channel with no
brick being left alone, the ramp floor AND the short-brick cap, undo, shapes
from a group, and a generator sequence correctly having no timeline at all.

### 2026-08-10 — v1.25.1: the bench test card, and the endpoint the engine could walk past

**Why.** Mike: *"looking good now we need to build some test sequences to see
that the features we've built work in real life."* Ten slots, one per feature,
written so the thing each proves is visible from across the bench rather than
buried in a serial log. Building them found a real defect, which is exactly
what the exercise was for.

**THE DEFECT: the position could leave the calibrated range.** Only the
*target* was clamped to `[min,max]`. The integrator was not. Reverse direction
while some velocity remains from the previous move — or aim past a target with
`MPCA_EASE_OVERSHOOT` — and `pos256` could carry a channel a little outside its
endpoints before settling back. Simulation showed a soft-eased channel reading
**4987 against a minimum of 5000**. Thirteen quarter-µs is nothing electrically
and everything mechanically: those endpoints are the only thing stopping a
panel binding against the shell, and Mike's are hand-tuned against real
linkages. Fixed by caching `lo`/`hi` in `ChanState` at `begin()` and clamping
`pos256` (zeroing `vel256`) at the end of `stepChannel`. Mirrored into
`pcaseq.js` and `PCA-Studio.html` — **all three copies, per the rule**.

Guarded in all three: 24 reversals with a walking dwell, so the turn happens at
every phase of a move, asserting the position never reads outside the
endpoints. Verified the test *fails* without the fix — 3882 against a 4000
minimum, 8129 against an 8000 maximum. A regression test that has never been
seen to fail is a guess.

**The bench sequences.** `pca-studio/bench-sequences.h` plus the editable
`pca-studio/bench-tests.pcastudio.json`, for Mike's actual rig: channels 0–3 on
0x40, 15 on 0x40's last pin, 16 and 31 on 0x41 — deliberately including the
three channels that were dead before the wake-every-board fix. Endpoints
5000–7000 (±250 µs about centre) so nothing can drive a horn into a stop.
Slot roles: 0 park, 1 background sweep, 2 alternate (loops), 3 ease compare
(loops), 4 wander, 5 release A/B, 6 cross-board wave, 7 grab-and-resume,
8 dual sweep 90° apart, 9 all home.

Two of those slots are the shape they are *because* the simulation argued with
them. **Ease compare targets 6600, not the 7000 maximum** — overshoot aims past
its target and is clamped at `max`, so a move that already targets the endpoint
comes out byte-identical to `none`, and the test would have "passed" while
proving nothing. **Release A/B's last frame is 3200 ms**, because travel (~500
ms) plus the 1200 ms release timer has to fit inside the frame or nothing ever
goes quiet. Both slots now loop so a subtle effect can be watched repeatedly
rather than caught once.

**`pca-studio/BENCH-TESTS.html`** — the card itself: what to press, what to
watch for, what it proves, and what a failure looks like for each slot, with
the simulated numbers alongside so a bench result can be compared against what
the code actually did in software. Pairs with `WIRING.html`.

**Checks.** All ten slots re-simulated against the real engine; overshoot now
peaks 6699 against a 6600 target where before it was indistinguishable from
`none`. Cross-compiled `MaestroReplacement` + the new header for a Mega:
26,726 bytes flash, 1,163 bytes RAM, and `avr-nm` confirms all ten sequence
tables survive `--gc-sections` (the lesson from v1.24.0 — if added data doesn't
grow the binary, suspect the reference, not the linker). The Studio's generator
copy and the sim's now verified to emit the same header **byte for byte** from
the same project.

### 2026-08-09 — v1.25.0: past the Maestro

**Why.** Mike: *"We don't have to replicate the maestro. But we can use its
best bits."* So the Maestro compatibility stays as the INTERFACE — the host
sketch never changes — and the behaviour goes where a droid actually needs
it. He picked all four proposals plus easing.

**Release when settled** — `releaseMs` per channel stops the pulses that
long after arriving. A parked panel then draws nothing, makes no noise and
does not cook; a servo holding a closed panel otherwise buzzes all day.
Needed a new distinction in ChanState: `active` (pulses going out) vs
`known` (we believe we know where it is). Released ⇒ `!active && known`, so
re-driving EASES from the remembered position; an explicit `setTarget(ch,0)`
clears `known` so the next target snaps, as before. **Only safe where the
part rests in place on its own** — warned in the header, the generator
output and the README.

**Background sequences that resume** — `MPCA_SEQ_BACKGROUND`. Displacing a
background sequence files it in `_bgWait[]`; `bgResume()` restarts it once
no running track claims its channels. `stopScript()` clears the waiting
list too, because an explicit stop must mean stop. This is what makes a
permanent holo idle practical.

**Oscillator and wander generators** — `MPCA_SEQ_OSC` / `MPCA_SEQ_WANDER`.
Same `restartScript(n)` addressing, but `data` holds 5-word entries
(`ch, lo, hi, periodMs, phase`) instead of frames. OSC drives position
directly through a smoothstep-over-triangle, so it has zero velocity at
each turn and **cannot be truncated by a too-short frame** — the trap the
frame-based sweep falls into. WANDER retargets randomly each period and
lets the channel's own speed/accel carry it, which is what reads as idle
life. Deterministic xorshift32 in both languages so the twins agree.

**Per-channel easing** — `MPCA_EASE_SOFT` ramps the acceleration itself in
over 8 ticks; `MPCA_EASE_OVERSHOOT` aims past a large move and settles
back, via a new `aim` separate from `target`. Both contained inside
`setTarget`/`stepChannel`, so the integrator invariants (never overshoot
the aim, always land exactly) are untouched. Worth knowing: plain
ease-in-out was always there — an acceleration-limited move IS an S-curve.

**Link watchdog** in `examples/MaestroReplacement`: no command from the
host for `WATCHDOG_MS` and the board goes to a safe state instead of
animating for ever. Deliberately only arms once the host has spoken at
least once, so a bench board with no host attached does not trip.

**Compatibility.** Every new field was APPENDED to `MpcaChannelDef` /
`MpcaSeqDef`, so a `sequences.h` generated before they existed still
compiles and behaves exactly as it used to (C++ zero-fills the missing
initialisers, and every new default is "as before"). Pinned by a test.

**Traps hit while building it.**
- The JS channel rows carry `ease` as a NAME ('soft'/'overshoot') because
  that is what the UI and the .json project store, but the engine works in
  the same numbers as the C++ — `'overshoot'|0` is 0, so overshoot silently
  did nothing until `pcaEaseNum()` was added. Caught by the twin test
  disagreeing with the C++ (peak 7000 vs 7083; they now match exactly).
- A python edit script that asserts partway through and writes at the END
  loses everything when an assertion fails. Write incrementally.
- Measuring flash per sequence was meaningless at first because the
  `MPCA_SEQ_TABLE` regex did not match the pre-flags 2-field rows, leaving
  the table empty — so `--gc-sections` stripped every sequence array. If
  added data does not grow the binary, suspect the reference, not the linker.

**Capacity, measured on a Nano with the real 18-channel dome** (38 bytes per
frame): 8 sequences/41 frames = 62% flash, 32/164 = 78%, 64/328 = 98%. So
~60 sequences or ~330 frames on a Nano; a Mega is thousands. RAM does not
grow with sequence count. With all of v1.25.0 the dome build is 71%.
Ceilings elsewhere: **256 sequences** by direct API (uint8_t), but only
**128 over the serial link** — Pololu's `restartScript()` puts the
subroutine number through `write7BitData`, so slot 130 would silently fire
slot 2. The generator now emits a `#warning` past 128.

**Tests.** `arduino/MaestroPCA/test/run.sh` now runs three host-compiled
suites: 40 protocol assertions against Pololu's own library, 30 on the new
features, 14 on concurrency. `tests/pcaseq.test.js` 46 → 63; PCA Studio
smoke 15 → 27. **1079 passing, 0 failing, 25 suites, both builds.
APP_VERSION 1.25.0, MaestroPCA 0.4.0, PCA Studio 0.3.0.**

**PCA Studio** gained release/ease columns per channel, background and
kind (frames / sweep / wander) per sequence, and a generator-entry editor.

**Not done:** LED/brightness channels (deferred by Mike); nothing of
v1.24.0 or v1.25.0 has touched a physical servo yet — the bench rig proved
the PCA9685 and the engine, not these behaviours.

### 2026-08-09 — v1.24.0: several sequences at once, and looping

**Why.** Mike: *"If we want one servo to move smoothly left to right and
others to do something else can we achieve that?"* Half the answer was
already yes and worth writing down; the other half was a real gap.

**What was already true** (verified, not assumed — a scratch harness ran
the engine and printed the trace). Every channel has its own position,
velocity, target, speed and acceleration and is stepped every 10 ms tick,
so channels are inherently parallel. A frame only touches the channels it
names — **blank/0 = leave alone** — so one frame can launch ch0 on a
two-second sweep and later frames drive only the panels while it keeps
easing straight through them. It even continues after the sequence ends,
because the sequencer and the motion engine are separate.

Two traps that fell out of writing that test, both now documented:
- **Park before you sweep.** A `homemode Off` channel has no pulses, so its
  FIRST target always snaps. The first attempt jumped to the end instead of
  sweeping. That is what frame 0 is for.
- **Speed governs smoothness, not frame duration.** Frame length only
  decides when the next instruction lands.

**The real gap: one script at a time, and no looping.** Faithful to a
Maestro, but it meant a button press killed a running idle. Now lifted, on
Mike's chosen rule: **sequences driving disjoint channels play together; one
that claims a busy channel displaces the sequence using it.** Up to
`MPCA_MAX_TRACKS` (4) at once, ~12 bytes of RAM each. Plus `MPCA_SEQ_LOOP`
per sequence, keeping its leftover milliseconds each pass so a looping idle
does not drift slower. `stopScript()` clears all, `stopSequence(n)` one.
Channel masks are read from PROGMEM per restart; channels ≥32 fold into the
top bit so a very wide rig errs toward "these overlap", never toward two
sequences silently fighting over one servo.

`E.seq` survives as a getter reading "most recently started, or -1", so the
existing tests and UI did not have to change shape.

**Also in this release — the drop-in Maestro (`MaestroLink`, library 0.3.0).**
A single board cannot give what a Maestro really sells: isolation.
`maestro.update()` never blocks but it is *cooperative*, so a host stalling
on `Usb.Task()` or a `delay()` stalls the panels too. `MaestroLink` answers
the Maestro's own serial protocol — compact, addressed `0xAA`, CRC7, Mini
SSC — so the animation moves to a second CPU with **no changes to the host
sketch**: same `PololuMaestro`, same `MiniMaestro maestro(Serial3)`, same
slot numbers, same wire. Opcodes were read out of `pololu/maestro-arduino`,
not from documentation. `feed()` takes a byte and returns a reply, so the
ESP32/WiFi version later changes only the byte source. **Nano first**
(5 V native — no level shifter on the Mega's TX, no 3.3 V clash with the
5 V I2C bus carrying the logic displays; no WiFi stack competing for
timing). Mike's real 18-channel 8-slot dome builds to 18.5 KB of a Nano's
30 KB, about half its RAM.

**Testing without a second board:** `examples/LoopbackTest` plays both
parts on one Mega — host on Serial3, co-processor on Serial1, one jumper
pin 14 → pin 19. It detects the jumper on boot and falls back to a software
loop when it is absent, which also lets it run on a one-UART board.

**Two bugs the tests found, one of them upstream.**
- **Ours:** a command truncated by line noise ate the NEXT command's bytes
  as arguments, corrupting both. Data bytes are 7-bit precisely so a parser
  can resync on the high bit; it now does (except Mini SSC, whose target is
  genuinely 8-bit). Regression test pinned.
- **Pololu's:** `PololuMaestro.h` declares `uint8_t _CRCByte;` with **no
  initialiser** and only zeroes it in `writeCRC()` *after* sending, so the
  first CRC-enabled command a host ever sends carries a CRC seeded from
  uninitialised memory. A correct receiver must reject it — we do. Our
  test asserted on that outcome and was itself unreliable (it passed or
  failed depending on stack garbage); it now primes and asserts nothing
  about the first command. Harmless in practice: CRC is off by default.

**Tests.** `arduino/MaestroPCA/test/run.sh` runs two host-compiled suites:
40 assertions against Pololu's own library through a loopback (its blocking
getters included), and 14 on concurrency/looping. `tests/pcaseq.test.js`
33 → 46; PCA Studio smoke 10 → 15. **1062 passing, 0 failing, 25 suites,
both builds. APP_VERSION 1.24.0, MaestroPCA 0.3.0, PCA Studio 0.2.0.**

### 2026-08-09 — pca-studio/: PCA Studio, the standalone PCA9685 sequencer & tester

**Why.** Mike, same day as v1.23.0: *"move away from the r2d2 sim and create
a separate PCA9685 sequencer and tester … allows us to test and iterate
quickly"* without the droid project's weight. Decided with Mike: it lives in
`pca-studio/` inside this repo (movable to its own repo later), and v1 does
virtual **and** live hardware.

**`pca-studio/PCA-Studio.html`** — one file, no build, no framework, opens
from disk in Chrome. Channel table editor (Maestro units, board/pin derived
i/16 · i%16), live sliders + animated position bars driven by the engine,
frame-grid sequencer (blank cell = not driven; 📷 captures the current
pose), play = real `restartScript(n)` semantics, `.mstr` import (channels +
sequences, slots in the *script's* sub order; frame rows stop at the `s`
marker), `sequences.h` export **byte-compatible with the sim's generator**,
`.pcastudio.json` save/load, localStorage autosave. Since v1.26.0 Studio is
BUILT from `pca-studio/manifest.json` and shares `pcaseq.js`, `pca-gen.js`,
`travel.js` and `blocks.js` with the sim outright, so the kinematics has two
copies — the C++ and `pcaseq.js` — not three. Plus the brick timeline, on
channels rather than droid parts, through the `BLKH` host seam.

**`pca-studio/PCA_Bridge/PCA_Bridge.ino`** — Web Serial live mode. The
browser runs the sequencer and streams only changed channels as 3-byte
frames @115200 (header bit for self-resync; ticks 0–4096, 8191 = off; ch62
oscillator config, ch63 servo Hz); the bridge is a dumb pipe to setPWM on
0x40/0x41 and boots with everything full-off so nothing lunges. Compiled
for the Mega with avr-gcc: 11.3 KB.

**Tests:** `pca-studio/smoke.test.js` (10) — deliberately NOT in `test.sh`;
fast iteration is the point. Run it by hand when the app changes. The sim
itself is untouched (no version bump; 1049/25 stands).

### 2026-08-09 — v1.23.0: the PCA9685 route — a Maestro-style sequencer without the Maestro

**Why.** Cost. Mike's ask: other people using the sim want to build on the
£5 PCA9685 rather than a £40+ Maestro — "we can create a replacement
sequencer and then if it works create a converter". A PCA9685 holds its
last pulse unattended but has no script engine, so the Maestro's animation
brain has to move into the Arduino. Decided with Mike up front: prove it in
the sim first, Maestro drop-in API, converter with BOTH front-ends from the
start, Mega/AVR first.

**The Arduino library — `arduino/MaestroPCA/`** (`src/MaestroPCA.h/.cpp`,
`library.properties`, `keywords.txt`, `README.md`, `examples/SelfTest/`).
- Drop-in surface: `restartScript(n)` / `stopScript()` / `setTarget(ch, quarter-µs)`
  / `setSpeed` / `setAcceleration` / `getMovingState`, plus **one new line —
  `maestro.update()` every `loop()` pass** (not interrupt-driven; a `delay()`
  freezes the show, same law as the Padawan sketches).
- Maestro motion units preserved: speed = 0.25 µs/10 ms, accel =
  0.25 µs/10 ms/80 ms, 10 ms kinematics tick, trapezoidal profile with an
  integer overshoot guard (`v ≤ 128·√(accel·dist_q) + 256`, kept inside
  32 bits for the AVR). Bench rule holds: 2752 counts at speed 80 = 35 ticks.
- Real-Maestro behaviours carried over deliberately: **one script at a
  time** (restart replaces — unlike the sim's `MAESTRO.slot` map, which can
  layer); target 0 = pulses off; a channel that is off **snaps** to its
  first target with no ramp (neither board knows where an undriven servo
  is); targets clamp into the calibrated min/max; homemode Off = limp at
  boot, so generated first frames write every channel.
- Data in PROGMEM: `MpcaChannelDef` table (board, pin, min, max, home,
  speed, accel) + flat `uint16_t` frame arrays, stride 1+channels, 0 = "not
  driven". Channel i → board i/16 (0x40, 0x41…), pin i%16.
- **Compile evidence, not hope:** built with avr-gcc 7.3 against the real
  ArduinoCore-avr + Adafruit_PWMServoDriver + BusIO for the ATmega2560 —
  SelfTest links at 13.8 KB flash / 953 B RAM; a bench sketch with Mike's
  full 18-channel dome header links at 15.4 KB.

**The JS twin — `src/js/maestro/pcaseq.js`.** The same engine,
**integer-for-integer** (same `isqrt`, same shifts) — the header comment in
both files says change one, change the other. `pcaCreate/pcaRestart/pcaTick/
pcaSetTarget/pcaPos…` are pure functions; frame stepping mirrors
`seqStepPlayback()` including the remainder-carry across frame boundaries.

**The converter — `src/js/maestro/pca-gen.js`.** One generator
(`pcaGenHeader`), two front-ends, as agreed:
- `pcaGenFromLoadout()` — the sim's channel table + the **loadout** in
  order, so slot numbers match the .mstr script the sim would export.
  Wired to a new **Export PCA9685 header** button (`#btnExpPca`) beside
  Export .mstr on the Maestro tab.
- `pcaGenFromParsed(P)` — a raw `mstrParse` result; slot order follows the
  **script's sequence subroutines** when the file has a script (that is
  what `restartScript(n)` actually addressed on the real board), falling
  back to `<Sequences>` order.
- The channel table is copied through **verbatim** — endpoints are personal
  calibration (same doctrine as .mstr sharing). Non-servo channels keep
  their row (frames index by channel number) with pin 255 = unused.
  Generated headers repeat the oscillator-calibration warning: a PCA9685's
  RC oscillator is only nominally 25 MHz, so `maestro.begin(<measured hz>)`
  or the quarter-µs endpoints are approximate on the wire.
- Verified against `R2-dome-padawan.mstr`: 18 channels byte-identical to
  Mike's table, slots 0–7 exactly the sketch's map (Pies Open … Dome Home),
  two boards (0x40 ch0–15, 0x41 ch16–17).

**Tests.** New suite `tests/pcaseq.test.js` (33): the speed law, accel
ramp + no-overshoot, endpoint clamping, off/limp, Input channels never
move, frame boundaries under awkward 16 ms stepping, 0-target skip,
one-script-at-a-time, the live dome fixture end-to-end (every driven
channel lands exactly on its final-frame target), generator row format,
two-board split, slot defines, `pcaQusToTicks` (1500 µs = 307 ticks at
50 Hz), and the Maestro-tab button emitting slots that match the loadout.
**1049 passing, 0 failing, 25 suites, both builds. APP_VERSION 1.23.0.**

**Not done / next:** nothing has touched a physical PCA9685 yet — the
SelfTest example (four servos, wave + home, no controller) is the bench
step; oscillator calibration is manual; the transpiler does not yet map
`MiniMaestro maestro(Serial3)` sketches onto the PCA engine automatically
(imported Maestro sketches still play through the sim's Maestro model).

### 2026-08-08 — v1.22.0: an imported sketch IS a firmware

Mike: *"can we not add the new sketch as an additional Firmware?"* — yes,
and it was the right call. v1.21.0 registered every transpile into ONE
`sketch` slot: importing a second replaced the first, and it never appeared
in the setup's Firmware question at all, so it read as a hidden mode rather
than a build answer.

- **One id per sketch.** `sketchId(fileName)` mints `sketch:<slug>`,
  deduping (`sketch:maestro22-2`) so re-importing the same NAME never
  silently overwrites. `SKETCH.list` / `SKETCH.byId` are the registry;
  storage moved to `r2sim.sketches.v2` (an array), with a one-way
  migration from the v1 single slot.
- **They stand with the three ports**: in `PROFILE_ORDER`, and pushed into
  `BUILD_OPTIONS.firmware` so each is a card in Setup → Firmware, badged
  `stands in` — honest, since it is a transpile of somebody's file rather
  than one of the three ports walked line by line. Dropping a `.ino` now
  calls `buildSet('firmware', id)`, so the choice persists like any other
  build answer instead of evaporating on reload.
- **Suitability is DETECTED, not assumed.** `firmwareBlockers` used to
  treat every non-mod2026 id as a Maestro sketch — which an imported
  profile is not necessarily. Sketch profiles are now judged from what the
  transpiler actually found: `hasMaestro` against `buildUsesMaestro`,
  `footPWM()` against hub ESCs, `audio` against the sound answer.
- **Never auto-recommended.** `firmwareRecommend` picks only from the
  three vetted ports. Somebody's transpiled fork is theirs to choose, not
  ours to push — but once chosen it is respected everywhere.
- **`sketchRestore()` was never wired into boot** (found doing this): the
  v1.21.0 sketch came back into localStorage and nowhere else. It now runs
  in main.js BEFORE `loadProfile`, and boot falls back with a warning if
  the configured firmware is missing, so a forgotten sketch cannot brick a
  startup.
- **Forgetting**, per sketch, in Setup → Firmware → "Your own sketches":
  confirms, removes the profile, its setup card and its stored copy, and
  if it was the running/configured one, falls back to a real port. The
  `.ino` on disk is never touched.

`tests/sketch.test.js` grows to 31. **1016 passing, 0 failing across 24
suites, both builds. APP_VERSION 1.22.0.**

### 2026-08-08 — v1.21.0: the sketch transpiler, and .mstr files that travel between builders

Mike, two asks in one: *"build a sketch importer based on the padawan360
code that can re-import other variations… or will that need an LLM?"* and
the .mstr sharing rule: *"servo settings are unique to each person… import
another person's scripts / sequences and those use the CURRENT builder's
servo settings; export should use the person's servo settings, not generic
or imported ones."*

**A · The sketch transpiler — `src/js/profiles/sketch-import.js`.** A
deterministic Arduino-C → JS transpiler for the Padawan360 dialect. NO LLM
in the pipeline, as a design rule: the sim's highest-value output is the
confirmed-bug list, which exists because the ports are faithful INCLUDING
the sins — a model porting a sketch quietly fixes or invents exactly what
the sim is for. The transpiler reproduces the sketch verbatim, fails
LOUDLY with named, line-numbered residue (no guessing, ever), and its
output is byte-identical for the same input.

- Shape: preprocessor (#define, #include, #if/#elif/#else with numeric
  defines — `FOOT_CONTROLLER == 1` picks the branch the compiler would
  have), tokenizer, structural pass (declarations→let/const, enums, casts,
  the sizeof array-length idiom, prototypes, C string-literal
  concatenation), and adapters binding the sketch's library objects to the
  sim's EXISTING shims by name — `Sabertooth2x`, `Syren10`, `pwm1/2`,
  `leftFootSignal`… the same names the whole family uses. Everything else
  passes through token-for-token: this dialect of C IS JavaScript once the
  library objects exist.
- Config tab: every numeric constant the sketch declares lands in
  `defaults`/`cfg` under its own name; edits apply through `__cfg()` on
  profile (re)load — and every load rebuilds the closure, which is
  re-flash semantics.
- Doors: drop a `.ino` anywhere; persists in localStorage
  (`r2sim.sketch.v1`), restored at boot as the `sketch` profile.
- **GOLDEN TESTS — the exact sources, fetched.** tests/fixtures-sketches/
  holds the REAL `.ino` files the three hand ports were made from (their
  repos, unchanged since May) plus Dan Kraus's canonical body sketch. All
  four transpile with zero residue, and the transpiled mod2026 plays a
  scripted A/B against the hand port as oracle: same arming track and LED,
  same ramped drive command, same dome command, same volume step, same
  PCA9685 utility-arm targets. `tests/sketch.test.js` (21).
- Found on the way: the transpile is MORE faithful than the hand port in
  one respect — it serves setup()'s `delay(500)` through SIM.blockUntil,
  so a fresh sketch is deaf for its first half-second exactly as the real
  board is.
- Honest gaps, reported not hidden: byte/char wraparound not emulated;
  statements after a mid-loop delay() still run that pass; `/` stays
  float division unless both sides are provably int (each such line is
  listed in the report); one imported sketch at a time.

**B · .mstr sharing — the show-file/fixture-patch split.**
`parseMstr` split into `mstrParse` (pure read) + `mstrApply` (wholesale)
+ **`mstrAdoptSequences`** (sequences-only). Import with a config loaded
asks: **Sequences only** (default posture) or **Everything…**, and
Everything raises a second, danger-styled confirm before your channel
table is replaced. First-ever import applies whole, no dialog.

- Adoption RETARGETS every frame target through the closed→open transform:
  n = (t−closed_A)/(open_A−closed_A) → t' = closed_Y + n·(open_Y−closed_Y),
  clamped to your endpoints. closed/open (not min/max) is what makes an
  INVERTED mounting come out the right way round. Channels match by part
  name, then channel name, then number — but never number when both sides
  carry real names that disagree. Unmatched channels are dropped and
  reported; per-frame speed/accel rows are discarded on purpose (your
  channel table's limits govern, same doctrine as blockMinTravelMs).
- Adopted sequences land in the library under `Imported · <file>`, never
  overwrite (name grows a `·`), and DO NOT touch the loadout.
- Export was already right — `genChannelsXml` reads `MSTR.channels`, so
  with import guarded your exports always carry YOUR calibration.
- `tests/mstr-share.test.js` (21).

`test.sh` grows both suites (24 total). **APP_VERSION 1.21.0.**

### 2026-08-08 — v1.20.0: the rest of the revert, undone

Mike: *"ok fix the body.html"* — the last thing the August partial revert
broke. It turned out not to be one file.

**What was actually reverted**, found by diffing `_checkpoints/` against
`src/` rather than by guessing:

| File | State found | Recovered from |
|---|---|---|
| `src/html/body.html` | pre-Stage-1 (16,701 b) | Stage-3 zip + reconstruction |
| `src/js/app/main.js` | pre-Stage-1 (5,415 b) | Stage-2 zip + re-applied deltas |
| `src/css/03-pad.css` | Stage-2's strip-door section reverted, puppet CSS layered on the OLD vertical strip | Stage-2 zip, puppet block rebased |
| `src/js/maestro/ui-sequencer.js` | one missing line | the contract in workspaces.js |

The JS and CSS for all of it were present and correct the whole time. Only
the things that *hold* them — the markup, the boot path, the grid — were old.

- **`body.html`.** Stages 1–3 came from the checkpoint zips as real
  artefacts (app menu + `#btnAppMenu`; the two `.smbtn` titles;
  `#sqUndo`/`#sqRedo`), then the puppet elements were re-inserted. **Stage
  4/5 exist in no checkpoint** and were reconstructed from the CSS, the JS
  that names the IDs and the test assertions: `#hdrBezel` wrapping the
  firmware tag and the five chips as one instrument cluster (the fw tag
  goes FIRST so `#chFault`, hidden until there is a fault, is never the
  cell that owns no separator); `#wsAdvWrap`/`#wsAdv` as a **label, not a
  button**, inside `#tabs` — panels.js wires a pane switch onto every
  `#tabs button` and this control *gates* a tab, it must never be one; and
  `#btnKbd`, the header "?", which `kbdHelpToggle()` had been waiting for
  since v1.16.0.
- **Tab ORDER is load-bearing.** Each workspace hides the buttons it does
  not offer, so the row it shows is the DOM order filtered — and one order
  has to satisfy all three lists at once (`pHelp,pServo,pLearn` ·
  `pMae,pServo,pCon` · `pCfg,pCad`). Maestro therefore sits second, not
  next to Model. Pinned by `sequencer.test.js`.
- **`main.js`.** Stage 2's version, plus the two deltas that came after it:
  the puppet tick + `pupPrefsRestore()`, and `wsInit()` as the boot path in
  place of `buildViewSel(); applyView(viewGet())`. It brings back
  `stagePicker()` (the three stage buttons stop being slot machines) and
  `syncChipTitles()` (the sub-1400px chips keep their words in a tooltip).
- **`03-pad.css`.** The horizontal sequencer door was gone — the switch was
  back to rotated vertical text in a 26px gutter — and, worse, the puppet
  CSS had been authored against that old strip, so its grid rules encoded
  the reverted layout. Rebased onto Stage 2's file: the strip is now
  `24px auto minmax(0,1fr)` — switch, puppet bar, content — with `#seqwrap`
  on rows 2-3 so the door stays visible above the sequencer, which is the
  entire point of a horizontal switch.
- **`ui-sequencer.js`.** `setStripMode()` never called `wsStripSync(m)`.
  workspaces.js documents that call as "the last line of setStripMode()" —
  it is the ONE place the header switcher learns the desk was entered or
  left, through every door. Five workspace failures, one line.

**964 passing, 0 failing across 22 suites, both builds** (was 621 across
17, with four suites crashing and `keyboard` at 23/2). Nothing about the
simulator's behaviour changed: every edit here restores markup, a boot path
or a layout that the rest of the source already expected.

**APP_VERSION 1.20.0.**

### 2026-08-07 — v1.19.0: cues — the controller as a sequence recorder

Mike: *"we should add the ability to use the controller as a sequence
recorder … you assign the actions, maybe using the default, maybe by
customising the buttons to actions, and then you can record the movements
into sequencer — so as a puppet you record the actions and the sequencer
plays them back."*

His four choices, asked and answered before a line was written: a cue may be
a **part, a group OR a saved routine**; it is **one rig with a per-control
choice**, not a second mode; a take produces **a brick routine, opened in
the sequencer**; and the **sticks keep playing their servos in the same
pass, captured as one nested brick**.

**FIRST, A REPAIR — read this before blaming the feature.** The folder was
found in a broken half-state: `src/manifest.json` did not list
`core/toast.js`, `core/dialog.js`, `config/workspaces.js` or
`app/shortcuts.js`, although the rest of `src/` (and three test suites)
depend on them; `app/main.js` still booted through the retired
`buildViewSel(); applyView(viewGet())` instead of `wsInit()`;
`test.sh` was missing `chrome`, `keyboard` and `workspaces`; and
`R2D2-Simulator.html` was stale by the whole UI programme. On that baseline
`cad.test.js` and `build-config.test.js` **timed out entirely** and
`anzellan.test.js` failed on `buildWsSel is not defined`. The likely cause
is the v1.14.0 puppet write-back overwriting the manifest, main.js, test.sh,
the dist and this file with pre-UI-programme copies while leaving the newer
modules on disk. All four points are repaired here. **APP_VERSION was
sitting at 1.14.0 while v1.15.0–v1.18.0 of the UI programme were present in
`src/`; 1.19.0 puts the number ahead of both lines** rather than pretending
the collision did not happen.

- **`src/js/input/cues.js`** (new module, after puppet.js in the manifest).
  `CUE.map` = control id → `{kind:'act'|'grp'|'seq', ref}`. The catalog is
  exactly the sequencer's palette (`blockActions` / `blockGroups` /
  `MSTR.sequences`), so a cue and a brick mean the same thing.
  **One control, one job**: `cueSet` frees that control from `PUPPET.map`,
  and the servo picker calls `cueFree` the other way.
- **Performing.** A part or group cue is **hold-to-open** (or latch), and an
  ANALOG control gives **partial travel** — the same quantity as a brick's
  `b.amp`. A routine cue is a **one-shot**: the press launches it and it
  runs to its own end; releasing does not stop it. Several can overlap.
- **Who wins a shared channel** (`cueOwns`): a control does one job, but a
  CHANNEL can be both somebody's string and a member of a cued group. While
  a cue is actually holding it the cue wins — otherwise a resting stick
  would stamp the servo shut the instant you pressed the group button. The
  string still commands (`PUPPET.pose` follows it, so the take records what
  the puppeteer meant); it just does not write the target until the cue lets
  go. A running routine cue owns every channel its frames ever touch, for
  its whole length, so a string cannot fight it between keyframes.
- **The recorder now has two species of take.** Cues fired ⇒ a **BRICK
  ROUTINE**: one brick per press, at `t0` = the instant it was pressed, with
  `dur` = how long it was held (a group becomes one brick per member, a
  routine cue becomes a `seq` brick of its own length), then `blockSync`.
  It is pushed into the library under `cat:'Recorded'` and **opened in the
  sequencer** (`pupOpenTake`). No cue fired ⇒ the ORIGINAL plain frame list,
  byte-for-byte the old behaviour — that contract is pinned by
  `tests/puppet.test.js` and must not drift.
- **The nested strings brick.** Stick work in the same pass is saved as its
  own library sequence `<take> · strings` and dropped on the spine lane at
  t0 0. Its frames are **densified** (`cueDensify`): the live recorder's
  change-only keyframes are exact played frame-by-frame, but the block
  compiler samples a nested sequence at ARBITRARY boundary times and only
  overlays the channels a frame names — a hole would send a still-open servo
  home. Every mapped channel is carried forward instead.
- **`cueAutoMap()`** is the "default" Mike asked for: groups first, then
  saved routines, then single parts, dealt across A/B/X/Y, the d-pad, the
  bumpers and the stick clicks; sticks and triggers stay strings.
- **UI**: the mapping panel beside the pad grew a second section,
  `.pupcues` — one row per cued control (action picker · hold/latch · ✕),
  an "＋ add a cue…" row listing only controls that are not already doing a
  job, and **Auto-cue the buttons**. The servo rows are untouched, so the
  `.puprow`-per-channel assertion still holds. Persisted in
  `PREFS.puppetCues`, restored from `pupPrefsRestore`.
- **Bug found on the way**: `pupBuildBar()` rebuilds on arm, on GO and on
  stop, so a take name typed before pressing ● was wiped every time — you
  could never actually name a take. The field's value now survives a
  rebuild.
- **Honest physics, worth knowing**: a brick shorter than its channel's
  imported travel time is a PARTIAL throw, because `blockDefaultRamp` floors
  the ramp at the imported speed. A 500 ms tap on a servo that takes ~1 s to
  cross does not reach full open — on the sim or on the board. Hold longer,
  or stretch the brick in the sequencer.

`tests/cues.test.js` (28) added to test.sh, same synthetic-clock discipline
as puppet.test.js — the whole performance runs inside ONE evaluate.

**621 passing, 0 failing across 17 suites on both builds.** What the repair
could NOT reach: `src/html/body.html` is also a pre-UI-programme copy and
no checkpoint holds the Stage-4/5 version, so `sequencer`, `sequencer-ui`,
`workspaces` and `chrome` still crash on missing elements and `keyboard`
loses 2 — see the boxed note in §2. Those five were failing before this
change and are untouched by it; the repair took `cad` (36) and
`build-config` (86) from outright timeouts to green and fixed `anzellan`.

**APP_VERSION 1.19.0.**

### 2026-08-02 — v1.14.0: puppet mode and the performance recorder

Mike: *"change the controller to a servo input only and each servo is
controlled by a stick or button … then record those actions."* His feel
choices: sticks **spring back** (deflection IS the position; release glides
closed at the imported servo speed), recording starts on a **3-2-1
countdown**.

- **`src/js/input/puppet.js`** (new module, after pad-ui in the manifest).
  `PUPPET.map` = channel index → control id. The control catalog treats
  **stick halves as separate strings** (LY+/LY− etc. — up and down can play
  different servos), triggers as true analog, buttons as **hold or latch**
  (per-channel toggle in the mapping table). 22 controls; START/BACK/XBOX
  stay system. Auto-map deals sticks/triggers first, then buttons.
- **The sketch sees a silent pad**: the gate lives in the xbox.js accessors
  (`getAnalogHat`/`getButtonPress`/`getButtonClick` return centred/0/false
  while `PUPPET.on`) — so drive, automation and sounds all stand down, but
  the RAW `XB` state stays live for the rig and the on-screen pad mirror.
  Clicks still consumed so a stale press cannot fire when puppet ends.
  `puppetTick(dtms)` runs from the main loop right after `pollInput()`.
- **Recorder**: 3-2-1 overlay (`#pupcount`), then a 50 ms sampler captures
  the COMMANDED targets (not the eased positions) as change-only keyframes —
  first frame carries the whole starting pose; a motionless tail is trimmed
  to 300 ms; two-minute self-stop. Takes save as **plain frame lists** (no
  blocks — same species as an imported sequence, protected from the brick
  compiler) under `cat:'Recorded'`, auto-named Take N, never overwriting.
  They preview in the sequencer library, drop into routines as bricks, and
  go on the board through Build your Maestro. `▶ Last take` replays through
  a tiny frame player inside puppetTick (works on every profile).
- **UI**: `#pupbar` above the pad (switch · record · take name · last take ·
  auto-map), `#pupside` mapping table replaces the keyboard list while on
  (`body.pupmode`), padwrap grid grew a top row. Mapping persists in
  `PREFS.puppetMap` (`pupPrefsRestore` from main.js boot). Entering the
  sequencer calls `puppetSet(false)` — the two cannot both own the servos.
- **Testing trap**: headless rAF is ~10 fps, so the recorder cannot be
  tested in real time — `tests/puppet.test.js` (28) drives the whole take
  inside ONE evaluate with a synthetic clock (`puppetTick(ms)` calls),
  which rAF cannot interleave. Suite added to test.sh (18 suites).

**730 passing across 18 suites, both builds.** APP_VERSION **1.14.0**.

### 2026-07-29 — v1.13.0: Mexican wave, Breathe, and a speed for everything

Mike: *"create two new sequences one called mexican wave … and another called
breath where it makes r2 appear to be breathing gentle in out — both should
have the ability to adjust the speed."* Built as READY-MADE presets (pick a
set, press the button) rather than fixed library entries, so they work with
whatever board and group is loaded — pies, side panels, doors, the Frik face.

- **Mexican wave** (`blockMakeShape 'mexwave'`): one brick per part in
  **physical ring order** — `blockRingOrder()` sorts by the actuator ID's
  trailing number, which is the sim's own by-azimuth numbering, because a
  wave in CHANNEL order would jump about the dome. Each brick is a smooth
  rise-and-fall bell (rise = fall = dur/2, no hold), starting 500 ms after
  its neighbour with a 1.5 s bell, so two or three parts are always mid-air.
- **Breathe** (`'breathe'`): the whole set together, four slow 3 s cycles,
  ramps meeting in the middle so the motion never sits still — and only
  **22% of the travel**, which is the thing that makes it read as breathing.
  That needed a small engine addition: **`b.amp`** on a block (partial
  amplitude); `blockValueAt()` scales the open target, the imported-speed
  floor scales with the shorter throw (`blockMinTravelMs(ref, amp)`), and
  the inspector gained an **"Opens to"** percentage slider (basic level, not
  behind Advanced — it is a creative control, not a safety override).
  Duplicate carries it.
- **Routine speed** (`blockScaleTime(seq, f)`): toolbar **− Slower / +
  Faster** buttons rescale every brick's start, length and ramps by 1.25× /
  0.8× with a length readout. Destructive on purpose — the timeline you see
  IS the timing that exports — and the imported-speed floors still apply on
  compile, so "faster" can never pretend past what the servos do.

`sequencer-ui.test.js` +13 (68): ring order, the travelling overlap, bell
ramps, the four gentle cycles, compiled swell measured at 0.22 of full
travel, scale round-trip, and both presets present in the Ready-made row.
**702 passing across 17 suites, both builds.** APP_VERSION **1.13.0**.

### 2026-07-29 — v1.12.0: the sequencer becomes a show-control desk

Mike's spec (the "Robot Simulator — Sequencer & Import Requirements" document,
with **Daslight 5** as the design benchmark): make the sequencer feel like a
polished show-control environment, keep it easy by default with expert
settings behind a switch, make the imported servo configuration authoritative,
and make the build/upload flow reachable from the Sequencer as a full-screen
workspace. Confirmed choices: rework the existing brick sequencer in place
(same block engine), confirmed requirements only, ONLY the speed/accel
overrides behind the Advanced switch, and one builder with two doors.

**The layout** (`03-pad.css` grid areas + new `09-sequencer.css`): transport
top (play/stop, time readout, snap-mode picker, Advanced switch, ⚙ Build your
Maestro); the timeline in the centre as ONE scroller (`.tlouter`) — sticky
lane names, sticky ruler with the beat grid drawn on it, so every track
shares one horizontal position; the sequence library lower-left in its own
panel; the inspector in a right-hand column (`#seqinsp`, moved out of
`#seqblocks`). The waveform strip sits under the music bar, strong beats
drawn full-height and bright, ordinary beats short and dim.

**The playhead** (`tlPlayhead`): drag it (or the ruler) to scrub —
`blockPoseAt()` walks the sparse frames from 0 so the model takes the exact
pose of that instant — and during any preview it follows the clock:
`blkTick()` (rAF) reads the edit slot's progress, and `musicPlay`'s tick calls
`blkPlayheadFollow()` off the audio clock.

**Snapping** (`blockSnapResolve()` in blocks.js — pure, tested): candidates
are neighbour EDGES (align with a brick's start, or butt against its end) and
the musical grid filtered by the mode — Auto / Strong beats / All beats /
Off-manual, persisted in `PREFS.seqSnap`. Threshold is 12 px at the current
zoom. Ties go to the musical candidate. A dashed snap line + label ("beat 12",
"after Pie 2") shows what a drag snapped to; dropped chips snap the same way.
`musicFitBars()` fits the bar phase the same way the beat phase was fitted
(most onset energy on the claimed downbeats); bar length is a 2/4·3/4·4/4
picker. `blockSnapToBeats()` is Snap-to-beats for brick routines.

**Imported configuration is authoritative.** `blockMinTravelMs()` (via the
lint's `chanTravelMs`) is the physical floor for a channel's throw at its
imported speed/acceleration; `blockEffRamps()` floors every compiled ramp at
it, and a fresh brick DEFAULTS to it — on Mike's dome file that is ~939 ms,
not the stock 300. Nothing in build/play/scrub/save writes the channel table
(there is a test that diffs it). The rise/fall sliders only exist when the
**Advanced** switch is on; an edited value wears an "override" badge and a
one-click **restore** puts the imported value back.

**The library is a panel, not a strip.** Grouped (`seq.cat`, defaulting to
Routines / Imported), searchable, and CLICK NEVER OPENS: it shows a
description card (duration, frames, parts with their colours, board status)
with explicit Open / ▶ Preview / ＋ Insert buttons and a group field. Drag
still inserts at the snapped drop point.

**⚙ Build your Maestro** (`maestro/builder.js`, `#bldWiz`): full-screen,
sharing the import wizard's styling. Three live columns — 1·Your library
(add), 2·On the board in order (slot badges, ▲▼✕▶), 3·Validate & generate
(the full `lintMaestro()` report plus script preview / copy / export). It IS
the loadout editor; the Maestro tab's section became a read-only summary with
the second door.

**Also per the spec:** dead sliders removed — the import wizard's Map step and
the Pose view only render a test slider once the channel actually drives a
part; leaving the Sequencer drops the identification tint and restores the
paint scheme (`setStripMode`), and it does not sneak back on re-entry; and a
guarantee test that EVERY channel-mapped CAD part — all four breadpan doors
included — takes its sequencer colour under the tint.

**The "lower right body panel" solved.** The CAD literally has skins named
`TopRight`, `CentreRight`, `LowerFront` … and `LowerRight` — and Fusion
exported **LowerRight with the BLUE trim material** (`Opaque(49,51,196)`)
while its siblings carry the white one, so `defaultRole()`'s blueish test
classified that one panel as `trim` and it rendered blue in every scheme.
`buildCad` now remaps LowerRight to whatever material CentreRight carries
(same load-time corrections pass as the rigs — self-healing on re-export);
three assertions in `cad.test.js` pin slot, role and colour to the siblings.
Note: `LowerUtilityArm` carries the same blue material (the upper arm is
white) — left alone deliberately, ask Mike whether that one is intended.

New suite `tests/sequencer-ui.test.js` (55) covers the acceptance checks;
`sequencer.test.js` (78) passes unchanged on the reworked UI.
**689 passing across 17 suites, both builds.** APP_VERSION **1.12.0**.

Not built (deliberately, per Mike's scope choice): multi-select / box-select /
copy-duplicate beyond the inspector button, loop-range playback, named song
sections and tap-to-correct beats, action layers with conflict warnings, and
the additional action/sequence preset packs (a separate follow-up workstream).

### 2026-07-29 — v1.11.0: the dome, from above

Mike, on seeing Printed Droid's terminology sheet: *"we should use a top down
image like this for the import process."* Right instinct — a channel called
"P11" means nothing until you can see where P11 is. New `maestro/dome-map.js`
draws it, and it is now the primary picker on the wizard's Map step.

**Drawn procedurally, not traced.** `DOME_LAYOUT` holds the bearing of each
feature — fourteen lower panels, six pie panels, three holoprojectors, the two
dome buttons — taken off the reference drawing at
printed-droid.com/kb/r2-d2-terminology. The layout is fact about the droid; the
drawing is their work and is not reproduced. It also has to be procedural
because the build is self-contained and because the fills are live state.

Bearings are degrees clockwise from the front-back axis, 0 astern and 180 dead
ahead, so the front logic displays and front PSI cluster at the bottom and the
rear logic display sits top-left. There is a test for that orientation, because
getting it mirrored would be easy and would look plausible.

**Click the channel, then click where it is.** `IMPWIZ.sel` is the channel the
next click places; assigning advances to the next unmapped one, so labelling a
whole board is a run of clicks rather than a dropdown hunt. Hovering a channel
row highlights its feature; a feature already claimed by two channels goes
amber, which is how you spot a doubled mapping instantly.

Three details worth keeping:

- **Panels sit at their real bearings, and some are 10 apart** — P13 and P14,
  P12 and P13. Their labels overlap. Two label radii, alternating whenever the
  gap is under 16 degrees, plus a leader line on every one, the way the
  reference drawing solves the same problem.
- **One marker per holoprojector, not two.** A click takes pan first and then
  tilt, so wiring a holo is two clicks in one place, and the marker reads `0/2`,
  `1/2`, `2/2`. HP3 lives inside pie 3 but is drawn just outside the pie ring at
  pie 3's bearing — inside, it buried PP3's own label.
- **The dropdown stays.** Body doors, utility arms and the Frik head are not on
  a dome diagram, and some boards are all body. Channels the diagram cannot
  place are flagged in the list rather than hidden.

Lower panels the reference lists as lighting rather than servos — P5 Magic
Panel, P6, P8 Rear PSI, P9 RLD, P12 FLDs, P14 Front PSI — are drawn dashed. A
question, not a refusal: Mike's own dome moves P11 and P13 and has no P10.

Sixty-six assertions in `maestro-import.test.js` now, including a click-to-place
round trip that clears a channel, clicks PP1 on the rendered SVG and checks both
the assignment and the advance. Colours come from `01-tokens.css`, so the light
theme follows without a second code path — checked by screenshot in both.

**All 16 suites pass on both builds — 631 assertions.**

Not built: no body or head equivalent of the diagram, and the dome map does not
yet appear in the Maestro tab's own channel-map section, only in the wizard.


### 2026-07-29 — v1.10.0: Import your config

Mike, at the bench: *"we now need to create an import your config which pulls
in the users own maestro settings and we then guide / do a conversion of the
servos setup … it should also import their sequences — use the lessons we've
learnt to aid this build."* So this release is the bench session turned into
code. New `maestro/lint.js` and `maestro/wizard-import.js`, plus fixes to the
parser, the exporter, the part matcher and the build tool.

**Four bugs the sim already had, found by pointing it at Mike's real file.**

- `genScript()` emitted **no top-level `quit`**, so every `.mstr` the sim has
  ever exported carried the 0x0080 fall-through. Fixed with `SCRIPT_PREAMBLE`.
  `quit` is not a subroutine, so `restartScript()` numbering is untouched —
  there is a test for exactly that.
- `genSequencesXml()` wrote **bare 18-token frame rows**. Control Center writes
  `targets s speeds a accelerations`; import read straight through and survived
  only because `slice(0, servoCount)` happened to take the targets, while
  silently discarding the speed and acceleration rows so they could not
  round-trip. Both ends now handle all three sections, and
  `useSpeedAndAcceleration` is preserved.
- `guessPart()` knew nothing of **Printed Droid shorthand** and mapped **0 of
  18** channels on Mike's own dome file. `PP1-6`, `P1-P14`, `P1-Fix` and
  `HPn-1`/`HPn-2` now resolve; the same file maps **17 of 18** (ch17 is
  genuinely unnamed). Rules are anchored and require the digit to follow the
  prefix, so "Dome Panel 4" and "Pie 3" still take the descriptive path.
- **`tools/build.js` was corrupting string literals.** `esc()` replaced
  `/<\/script>/gi` with a fixed *lowercase* `<\/script>`, so any JS literal
  spelling the tag differently came out re-cased in the distributable build
  only. `mstrBytes()` compares against Pololu's `</Script>` and quietly stopped
  matching — dev.html fine, R2D2-Simulator.html not. The escape now preserves
  the original casing. Worth remembering: this class of bug is invisible to
  `dev.html` testing.

**Holoprojectors are actuators now.** Six new keys — `hp1Pan`/`hp1Tilt` through
`hp3`. Real domes wire them (six of Mike's eighteen channels), and a channel
the sim cannot name is a channel it cannot map, sequence or lint. No CAD part
claims them yet, so they show as `proc`.

**`maestro/lint.js`** — pure functions, no DOM. `chanTravelMs()` implements
Pololu's speed/acceleration model properly (triangular vs trapezoid), which is
what tells you a throw is ~940 ms and not the ~344 ms speed alone implies.
`seqTimingIssues()` walks a sequence tracking, per channel, how long ago each
target was issued, and flags anything re-targeted before it can have arrived.
`scriptTraps()` reads the main program the way the board will. `lintMaestro()`
returns err/warn/note items with a fix line each, covering duplicate and blank
channel names, targets outside endpoints, targets on non-Servo channels,
`homemode="Off"` with no sequence that writes every channel, the two script
traps, the 126-subroutine limit, script size, a loadout past slot 7, and
channels mapped to nothing or doubled up.

**`maestro/wizard-import.js`** — a five-step overlay: File, Found, Map, Check,
Done. **Found** is the one that earns its keep: it reports what the file was
*before* the sim touched it, from `MSTR.report` captured during import, because
once we re-export the evidence is gone. A begin/repeat script, a missing quit,
duplicate names, an empty script — none of which Control Center will tell you.

**Import no longer substitutes a name for a blank one.** It records
`autoName:true` instead. Filling in "Channel 17" and then counting blanks later
finds none, and the user never learns which channel the matcher had nothing to
read.

**Tests: `tests/maestro-import.test.js`, 55 assertions, run against Mike's
actual 18-channel dome file** (`tests/fixtures-live-dome.mstr`) rather than a
fixture invented to pass. It asserts the file is detected as a Mini 18, that
endpoints and speed/accel survive verbatim, that the begin/repeat script is
caught, that a duplicated name is caught, that the quit does not shift slot
numbering, that the download bytes carry no BOM / CRLF structure / LF script
body / no trailing newline, and that a 250 ms reversal is flagged while a
1200 ms one is not.

`tests/anzellan.test.js` had a literal `14` for the droid's body actuator
count, so legitimately adding an actuator to the DROID failed a test about the
HEAD not leaking. It derives from `ACT_KEYS.length` now, with a second
assertion that no `anz*` key is in `ACT_KEYS` — which is what that check was
actually for.

**All 16 suites pass on both builds — 606 assertions.**

Not built: the wizard does not write a second board, so a dome-plus-body droid
still needs two files and two passes; there is no CAD geometry for the
holoprojector axes; and the lint knows nothing about whether a sequence is
*good*, only whether it can physically execute.


### 2026-07-29 — Mike's live dome Maestro, and why the controller did nothing

Mike sent his real settings file off the physical droid. Three things it settled.

**It is a Mini Maestro 18, not a 24.** 18 channels, all `mode="Servo"`, all
`homemode="Off"`, all `speed="80" acceleration="10"`. `SerialMode` is
`UART_FIXED_BAUD_RATE` @ 9600, device 12, CRC off — correct for Padawan on
Serial3. It is a **dome** board: 4 pie panels (PP1 PP2 PP5 PP6), 3
holoprojectors as pan/tilt pairs (HP1/HP2/HP3), 7 side panels, one spare.

**The board could not have answered `restartScript()`.** His `<Script>` was a
top-level `begin … repeat` loop — the output of *Copy **Sequence** to Script*
(singular) rather than *Copy **all** Sequences to Script*. The only `sub`s in
it were the `frame_*` helpers, so `restartScript(0)` resolved to
`frame_0..17`, which pops 19 values off an empty stack and faults. Only one of
his four sequences ("Full Wave") was on the board at all; the other three
existed solely in the registry/file.

**The frame row format has two more sections than `maestro-format` recorded.**
Every `<Frame>` body is `18 targets  s  18 speeds  a  18 accelerations` — 56
tokens, not 18 — with the per-frame speed/accel blocks all zero because the
sequences carry `useSpeedAndAcceleration="false"`. `parseMstr` must stop at
the `s` marker or it will read speeds as channel targets. Memory note updated.

Also found: **ch6 and ch16 were both named `P11`** with different endpoints
(4032/7616 vs 4416/7744). Cross-referencing Printed Droid's terminology page
narrowed it — the moving lower panels are P1 P2 P3 P4 P7 P10 — and Mike then
identified ch6 on the droid itself as **P13**. The file is now unique; his
moving panels are P1 P2 P3 P4 P7 P11 P13, with **no P10**. Do not add one.
**ch17 is still unnamed** and no sequence drives it — one spare channel.

That page also confirms the pie set is complete rather than short: PP3 *is*
Holoprojector 3 and PP4 is the periscope, so four servo'd pies (PP1 PP2 PP5
PP6) is the whole set. P5 is the Magic Panel, P6 the small upper, P8 Rear PSI,
P9 the RLD, P12 the FLDs and P14 Front PSI — all lighting, never servos.

Delivered `R2-dome-padawan.mstr` — his `<Channels>` block copied through
byte-identical (verified by string compare; his endpoints are hard-won and
must not move) with eight sequences built on top in `restartScript(0..7)`
order: pies open/close, panels open/close, whole dome open/close, a
travelling wave, and a home/park. Panel order is P1 → P2 → P3 → P4 → P7
→ P11 → P13. Holos are excluded from the panel
choreography and only ever driven to centre (5984, or 5888 for HP2-1, kept on
the file's own 32-step grid). ch17 is never commanded. Mike's four original
sequences are preserved but appended **after** the eight, so a future *Copy
all Sequences to Script* cannot shift the slot numbering. ~1.1 KB of the 8 KB
script space. Companion `R2-dome-bench-card.html`.

**Second trap, found on the bench the same day: a script that is nothing but
subroutines falls through.** With no top-level code the program counter starts
at 0, runs straight into the first subroutine's body, and hits its `return`
with an empty call stack — Maestro error `0x0080`, "Subroutine call
overflow/underflow", and the dome actually performs Dome Pies Open while it
does it. Control Center's **Run Script** is what exposes it. Fix is one bare
`quit` at the top of the script; it is not a subroutine, so `restartScript()`
numbering is untouched. Every generated `.mstr` from now on carries it.

Note also that **Maestro error flags latch until read**. A red `0x0080` in the
corner may be left over from an earlier fault, so Clear Errors before
concluding anything from it.

**Third trap: `acceleration` is the binding constraint, not `speed`.** The
frame durations were first sized off `speed="80"` (~344 ms for a full throw)
and the movements came out visibly short. At `acceleration="10"` a servo needs
640 ms just to reach its speed limit, so every panel move on this dome is a
pure accelerate-then-decelerate triangle: **935 ms for a pie, 1030-1135 ms for
a side panel, 1163 ms worst case (HP2-1)**. Against that, 250 ms of wave frame
buys 14% of travel and 350 ms buys 28%. Rule to apply when timing frames: a
channel must not be given a new target until it has arrived at the previous
one — compute `2*sqrt(d/a)` (or the trapezoid form if it reaches `vmax`) per
channel and check every re-target gap against it. Mike chose to retime the
sequences rather than raise acceleration, so his tuned board settings stand.

**Design change made at the same time: an opener only opens and a closer only
closes.** Pololu's generator writes every enabled channel in a sequence's first
frame, which meant pressing Close while already closed slammed the dome open
and then shut it again. Frames are now explicit `{channel: target}` sets, so
only the channels a step actually moves appear in it (0 elsewhere, which is
Pololu's "not driven by this frame"). The one sequence that still writes all
17 channels is **Dome Home**, which is what gives the dome a known pose after
power-up — necessary because `homemode="Off"` leaves every servo limp until
something drives it. Press LT + ◀ once after power-on.

The wave now uses a **lag of 3**: a panel opens at step k and shuts at step
k+3, so it gets 3 x 400 = 1200 ms to travel (> the 1163 ms worst case) while
the ripple itself still moves at 400 ms per step. Three panels are open at any
moment and the whole thing runs 5.6 s. Sequence lengths: pies 1.6 s, panels
2.7 s, whole dome 1.7 s, home 1.2 s.

Because the board is dome-only, slots 0/1/4/5 no longer mean what
`maestro-shared.js` labels them (body doors, utility arms) — the numbers are
unchanged, only what they drive. If a body board joins later it needs its own
Maestro and the sketch needs a second `MiniMaestro` instance; the compact
protocol on Serial3 is not addressable, so two boards cannot share the UART
without switching to the Pololu protocol with device numbers.


Newest first. One entry per session or per substantial change.

### 2026-07-29 — v1.9.0: one model on the stage
Mike: *"in the model tab put a selection thing so that only one model is
displayed and works."*

- New `scene/models.js`. `PREFS.model` is one of `droid · frik · mouse`, and
  `modelApply()` puts it into effect across four things that used to be able to
  disagree: visibility, who has the pad, which channels are registered in
  `ACT`, and which panel the Model tab draws. §3 has the reasoning, including
  why it deliberately does **not** stop the sketch.
- **The Model tab opens on the selection.** Three buttons, the model's own
  blurb, and its numbers — the mouse reports its measured wheelbase, track,
  wheel size and hitch offset; the head lists its eleven channels; the droid
  keeps its part count and draw calls. Below that, only the sections that
  belong to the selected model: the droid keeps the visibility switches, the
  ride height and the part table, and the other two get a small panel of their
  own (six expression buttons and the idle switch for the head; reset,
  straighten-the-chariot and the driving note for the mouse).
- **The stage bar lost two buttons and gained one.** `Frik` and `Drive Mouse`
  were independent toggles that could contradict each other and the pane;
  `btnModel` cycles the one selection and names what is on the stage.
- The selection travels in the setup `.json` like everything else, and the
  default is the droid — so an existing setup opens on the droid alone rather
  than the head-plus-droid pair v1.7.0 shipped.
- `mouse.test.js` +14 (58): only one visible, the pad and the ACT channels
  following, the pane swapping, the cycle coming home, the selection
  persisting and travelling, and that `fwLoop()` still runs with the droid off
  the stage. **564 passing across 15 suites, both builds.** APP_VERSION **1.9.0**.

### 2026-07-29 — v1.8.0: the Polar Mouse, a second drivable vehicle
Mike dropped `Polar+Mouse+with+Chariot.obj` in the project folder — a printed
mouse droid on an RC chassis towing a Mandalorian chariot — and asked for it as
a drivable vehicle. His four answers set the shape: car-like Ackermann steering,
the pad switches between the two vehicles, the chariot is towed on a hinged
hitch, and the model is inlined with the internals stripped.

**The pipeline — `cad/mouse.py`.** 139 MB, 198 groups, 502k verts, 1.01M
triangles in. It emits the same `.r2m` container `convert.py` does, and the
frame is derived, not guessed: this export is millimetres Z-up like the MK4 but
laid out along a different axis — front is **+X**, left is **+Y**, and the
model's own centreline sits at **y = -56.31**, not zero, so the lateral offset
comes out first or the vehicle drives permanently crabbed. Two thirds of the
triangles are gears, bearings, the diff, drive shafts and chassis frames sealed
inside the body: 68 groups dropped. The six tyres are 35,726 triangles **each**
— a fifth of the model in rubber — so anything over 6,000 goes through a
quadric decimation and gets smooth normals, which is right for a revolved part.
Out: **130 parts, 204k triangles**, in the MK4's league (268k), bundled as
`src/js/cad/mouse-payload.js` (1.88 MB). Distributable 4.03 → 5.83 MB.

**The chassis is measured, not typed.** The wheels are found by their axle
planes rather than their names (the CAD's copy suffixes carry no ordering), and
the wheelbase (343 mm), both tracks (334 mm), the tyre radius (77.5 mm) and the
hitch pin all come off the geometry into the header's `vehicle` block.

**The drive model — `scene/mouse.js`.** Bicycle model about the rear axle,
Ackermann on the front pair, a steering servo that slews rather than snaps,
throttle with separate accelerate / brake / coast rates, and a chariot that
tracks on the standard tractor-trailer constraint and jack-knifes in reverse.
See §3 for why none of that is optional. **Drive Mouse** on the stage bar hands
the pad over — and the sketch then sees the sticks centred, which is what a
second receiver on a bench would mean. Follow now follows whoever you are
driving, and the mouse gets its own HUD line because the Drive/Turn bars are
honestly reading zero.

**Colour.** The `.mtl` the OBJ names is not in the folder, so it is inferred
from material names plus part roles — black rubber tyres, bright rims,
gunmetal hubs and bumpers. See §7; drop the real `.mtl` in and it takes over.

**Two bugs the tests caught**: three bearings survived the internals filter
because `ring` matches "bea-RING", and the trailer's settling angle was
non-deterministic until the suite stopped `frame()` from stepping the model
behind its back. Both are in §7.

New suite `tests/mouse.test.js` (44), added to `test.sh`.
**550 passing across 15 suites, both builds.** APP_VERSION **1.8.0**.

### 2026-07-29 — v1.7.0: the Anzellan head
Mike sent a photo of a silicone Anzellan ("Babu Frik") puppet head on a bench
stand — goggles pushed up on the crown, gold eyes, white whiskers, a flesh
skirt over a white stand — and asked whether the sim could model one. It can,
and it can drive it.

**New `scene/anzellan.js` (~600 lines), fully procedural.** No mesh file: the
skull is a deformed sphere with a brow shelf, sunken sockets, a muzzle pouch
and a low-frequency wrinkle field; the jowls are a lathe with a drape; the
whiskers, 25 of them, come out of a seeded LCG so they are the same mess on
every machine. Welding goggles are an extruded silhouette with a lens band,
rivets and the little striped decal. It stands on a turned white stand to the
viewer's right of the droid — 0.63 m to the droid's 1.23 m. Geometry-in-code
for the same reason `scene/env.js` is: the MK4 payload cannot travel, so
anything new that might be shown to anyone has no licence attached.

**Eleven channels, and eleven is not an accident** — it is a Mini Maestro 12
with one spare. `anzJaw · anzLipU · anzLipL · anzBrowL · anzBrowR · anzLids ·
anzEyeX · anzEyeY · anzPan · anzTilt · anzNod`. The lids are ganged onto one
channel, with the upper doing most of the travel, which is what a one-servo
lid mechanism actually does.

**It plugs into what already exists rather than growing a parallel system.**
The channels are `ACT` keys, so the Outputs table lists them, the brick
sequencer offers them as parts, the channel picker names them ("Frik jaw"),
and `PREFS.blkColors` gives each one its lane colour for free. New
`makeStarter('anzellan')` builds a board layout and eight routines — Talk,
Blink, Look Left, Look Right, Surprise, Grumble, Nod Yes, Shake No — matching
eight new `frik_*` stand-in animations slot for slot. **Frik head starter**
button in the Maestro pane; **Frik** button on the stage to show or hide it
(persisted in `PREFS.anz`, on by default).

**An idle loop that knows when to stop.** Blinks at irregular intervals,
saccades, drifts its head, and chatters the jaw whenever the droid is talking
(`SND.at`, the same window the logic displays use) — but only on channels no
Maestro owns. See §3.

**Fixed on the way** — both worth knowing about, both now regression-tested:
the jowl lathe was wound inside-out and rendered as two enormous ears (§7),
and the flesh tones came out grey because material colours are treated as
linear (§7).

**Three bugs the tests caught before delivery**: `frik_blink` and two starter
routines parked the eyelids at 0.18 after `anzLids`' home moved to 0.10, and
`frik_grumble` left the jaw 4% open — all three are "ends on the rest pose"
failures, which is exactly what that assertion is for.

New suite `tests/anzellan.test.js` (51), added to `test.sh`.
**506 passing across 14 suites, both builds.** APP_VERSION **1.7.0**.

### 2026-07-27 — v1.6.0: part colours, the script loadout, motion overrides
Mike's list, item by item.

**The sequencer**
- **BUG FIXED — dragging a pre-configured sequence in did nothing**, and left
  a ghost stranded on screen. `blkChipDrag()` decided click-vs-drag in a
  `setTimeout(0)` that fired *before* `pointerup`, so every press counted as a
  click; `buildSequencer()` then destroyed the chip node mid-gesture and its
  listeners went with it. The listeners now live on the **window**, the
  decision is made on `pointerup` with a 5 px threshold, and the ghost is
  removed on every exit path.
- **Every part has its own colour.** Derived from the channel it is plugged
  into, so it is stable and two neighbouring channels never collide; a part
  with no channel falls back to a hash of its id. It is carried on the library
  chip, the lane and the brick, and can be overridden from the inspector
  (remembered in `PREFS.blkColors`).
- **Colour the model to match** — a switch that paints every actuated part in
  its sequencer colour. It is a layer in `effectivePartHex()`, not a write:
  switch it off and the paint scheme comes straight back.
- **Timeline slider** — stretches the bricks and nothing else. It re-scales the
  DOM in place (`blkZoomApply()`) rather than rebuilding, because rebuilding
  would drop the slider out from under the pointer — the same class of bug as
  the chip drag. No `t0`, no duration, no frame changes.
- **Droid slider** — how close the view sits. Clicking a brick points the
  camera at the part that brick moves (`partWorldPos()` → `blkFocusApply()`),
  so the slider reads as "zoom in on this flap".
- The right sidebar is hidden in sequence mode; the **100%** UI-scale readout
  is now a button that resets the scale.

**The board is not the library**
- **`MSTR.loadout`** — see §3. A new section under the Maestro tab picks which
  routines go on the board and in what order, with ▲▼ to renumber the
  subroutines, ▶ to preview and ✕ to take one off. The sequence list carries a
  **sub n** / **not loaded** badge, and an unloaded routine's chip is faded in
  the sequencer.

**How a part moves**
- **Advanced — how this part moves**, inside each part's popup, exactly as Mike
  asked: a motion (hinge up/down, turn left/right, roll, slide in/out, up/down,
  left/right), a pivot (the part's middle or any one of its six bounding-box
  faces, which is how a hinge line is actually described), and one slider for
  how far. Negative goes the other way. **▲ Open / ▼ Close** drive it, **⤢ Zoom
  to it** frames it, **↺ CAD rig** throws the override away.
- The maths is checked in the suite: changing the pivot leaves the part exactly
  where it was when shut, and the travel slider moves it by the number on the
  slider.

**Also**
- **The model no longer leans when it turns** (`R2.body.rotation.z = 0`). The
  acceleration pitch stays — that one is real.

**Tests** — `sequencer.test.js` grew from 44 to 78; 455 across the 13 suites,
both builds.

### 2026-07-27 — v1.5.0: view modes, the brick sequencer, Mike's handoff
Worked from `droidsimulatorfeedbackhandoff.md` plus two screenshots.

**Setup flow**
- **Arduino → Controller board** (Arduino is still an option inside it, and
  Teensy joins the parked list).
- The **Firmware** step now links the **repo and the exact .ino** for all
  three sketches, plus the sound pack and Pololu's Control Center docs.
- **BUG FIXED — the body Maestro was missing from the wiring sheet.**
  `wiringSource()` consulted only `MSTR`, the one loaded settings file, so a
  build with a Maestro at each end printed the dome board and silently dropped
  every body channel. It walks both configured boards through `hwPins()` now.
- **Panels can be renamed where they are assigned** — the Panels step's first
  column is an editable name. The CAD name underneath never changes.
- The **Scene** step is scenes only; the practice circuit and the lessons moved
  into the app, where they belong (they are things you *do*).
- **Export setup / Import setup**, not "Save setup".

**Interface**
- Three **view modes** in the top bar — *No config · Simple · Advanced*.
  Serial and Config are Advanced-only; Outputs is visible in all three,
  deliberately untouched.
- **Save & load** is a top-level header control with a popover.
- The **Maestro board picker is gone** from the Maestro pane — it is a setup
  answer, and two copies could disagree with the wiring sheet.
- **BUG FIXED — light-mode stage buttons.** `.sbtn` had a hard-coded dark
  `rgba()` plate, so in light mode it was dark text on dark. Tokenised as
  `--sbtnBg`/`--sbtnTxt` with a light override.

**Sequence mode — the brick sequencer** (Lego Mindstorms as the reference)
- **BUG FIXED — the squashed layout.** Sequence mode and "expanded" were two
  independent states; it is one mode now, opening straight into the expanded
  layout, with the pad SVG out of the way and the exit renamed
  **Back to workshop**.
- New `maestro/blocks.js` + `blocks-ui.js`. The strip is: the **sequence
  library** across the top (drag a whole routine in as one brick, appended end
  to end), the **timeline** in the middle (a lane per part, bricks you drag to
  move and grab by either edge to restretch), the **parts library** along the
  bottom, and an inspector for the selected brick.
- **Ready-made shapes** — Wave, Chase, Alternate, All at once — built from a
  set of parts in one click, and **Save to library** stores the routine under
  a name so it can be dropped into another one.
- Per-brick **opening and closing speeds**, which affect that brick only.
- The old Pose and Frames views are still there behind two buttons.
- The Maestro pane now opens on its sequence library.
- New suite `tests/sequencer.test.js` (44). **440 passing across 13 suites,
  both builds.** APP_VERSION **1.5.0**.

**Not done from the handoff:** nothing — but the view-mode rules were left
undefined in the doc, so §3 records the reading that was implemented.

### 2026-07-27 — v1.4.0: environments, a real circuit, and lessons
Mike's list, in his order.
- **"We don't need these as they are in the setup … anything that's in the
  setup should be removed from the config tab."** The header firmware buttons
  are gone (a read-only `#fwTag` replaces them — the sketch is a build answer),
  and the Config tab no longer repeats the build questions, the boards, the
  panel table or the paint. It shows the build read-only with an **Open the
  setup** button, then the sketch's own constants. The boards moved into the
  setup's **Wiring** step, where the pin map belongs anyway.
- **"Add light / dark mode to the setup screen too … move to always be
  visible."** `#stpTheme` sits in the setup header on every step.
- **"Make the text bigger … fill the screen with the boxes and the next
  buttons."** Option cards are `minmax(300px,1fr)` auto-fit, 15px titles,
  11.5px body; the rail, hints, notes and footer all a size up.
- **"Add a nice large finish button."** `.finbtn` on the Finish step.
- **"Some cool backgrounds … industrial, desert, in a spacecraft."** New
  `scene/env.js`: **Studio · Workshop · Desert flats · Hangar bay**, all
  procedural — geometry in code, textures painted on a `<canvas>`, so the
  distributable stays self-contained and nothing has a licence attached.
  Stage button, a **Scene** step in the setup, persisted in `PREFS.env`.
- **"For the track it should have this kind of shape with barriers and a timer
  for each lap … set in a Star Wars themed hangar bay."** `app/track.js` is
  rewritten: a closed Catmull-Rom circuit (start straight, fast right-hander,
  hairpin, chicane), a generated ribbon surface, red/white kerbs, **barriers**
  down both edges that push the droid back on for 2 s, a chequered start/finish,
  six sector gates sampled off the curve, and **every lap timed** with the last
  five on the HUD. Switching it on moves you to the hangar deck and puts the
  droid on the grid.
- **"Add a teach me to operate my Robot."** New `app/tutor.js`: 11–13 lessons
  (arm · drive · turn · change gear · dome · sound · volume · open the dome or
  the doors · run a sequence · holoprojectors · automation · disarm), each with
  a *how* and a *why*. **Every one is detected from the droid's own state**, not
  from a keypress — see §3. A prompt card on the stage, the full checklist on a
  new **Learn** tab, progress in `PREFS.tutor`. Lessons a profile cannot do are
  filtered out.
- build-config suite +19 (82). **396 passing across 12 suites, both builds.**
  APP_VERSION **1.4.0**.

### 2026-07-27 — v1.3.1: Mike's four UI notes on the setup
- **"The setup should be the full size of the webpage — easier to see."**
  The overlay is full-bleed instead of a 720px card. Horizontal padding is
  `max(18px, (100% - 1360px)/2)` so the borders run edge to edge while the
  text keeps a readable measure on a wide monitor. Title, option cards and
  notes all a size up; the option grid reflows to as many columns as fit.
- **"When selecting servos panels and colours it should have the robot in
  view, maybe the right side of the screen."** New `body.wizsplit`, applied
  on the Panels and Colours steps only: the overlay stops at
  `clamp(320px, 38vw, 660px)` from the right and `#main` takes a matching
  left margin so the 3D stage genuinely moves into that strip — merely
  uncovering it leaves the droid centred behind the card. The sidebar and
  pad strip hide, `viewFrame('full')` frames the droid in the tall column,
  and `onResize()` is called explicitly. Below 1000px wide it falls back to
  the full-width overlay.
- **"When I click on output it should open up the panel / item so we can
  adjust the control etc and test."** Rows in the Outputs tables are now
  clickable and drop a drawer underneath: the channel it is wired to (with
  a picker where the board allows edits), a live position slider, Open /
  Close / Cycle, and the part colour. Clicking also selects the part on the
  model. One drawer at a time; the slider follows `ACT` while a sequence
  drives it, unless you are the one dragging. Under mod2026 — which has no
  actuator table — the PCA9685 channel rows are the clickable ones.
- **"These should be draggable"** (the sidebar edge and the strip edge).
  New `app/splitters.js`: each handle is its own grid track, so a drag is a
  CSS-variable write. `--sideW` / `--padH`, and `--seqW` when `body.seqbig`
  has the droid docked right, which flips `#splitH` to a column resize.
  Clamped, persisted in `PREFS.split`, double-click to reset.
- build-config suite +22 (63). **352 passing across 12 suites, both builds.**
  APP_VERSION **1.3.1**.

### 2026-07-27 — v1.3.0: start a new model — the guided build setup
- Mike: *"the first thing that should be presented, if the user has not
  already created a model, is to create their configuration … all of this
  should move into this one configuration panel or configuration tab."*
- **New `js/config/` area (3 modules).** `hardware.js` is the build model:
  nine questions in Mike's order (controller · dome motor · dome servos ·
  dome lighting · foot drive · body servos · sound · Arduino · firmware),
  each option carrying a `note` and a `sim` honesty flag. `wizard.js` is the
  13-step overlay. `tab.js` is the Config-tab build panel plus the part-first
  panel↔servo assignment table.
- **The answers ARE the config** (§3). `buildApply()` pushes them into
  `SIM.profile`, `CFG.FOOT_CONTROLLER` and `setBoard()`. Choosing Flipsky hub
  motors moves the sim to the 2025 sketch and sets FOOT_CONTROLLER 1 with the
  droid still on screen behind the card. The header firmware buttons still
  work; they and the wizard drive the same state.
- **Firmware suitability, with reasons.** Each profile is checked against the
  build and the blocked ones are greyed with the actual objection ("mod2026
  only talks to a Sabertooth over Serial1 — it has no PWM foot output for hub
  ESCs"). Weighted, not counted — see §3.
- **System wiring diagram** (`systemLinks()` / `systemDiagramSvg()` in
  `app/wiring.js`): the Arduino in the middle, every peripheral with its bus
  and Mega pin — Serial1 TX 18 to the Sabertooth, pins 44/45 to hub ESCs,
  Serial2 TX 16 to the Syren, Serial3 TX 14 to a Maestro (SoftwareSerial
  10/11 on the 2022 BETA), I2C 20/21 to the PCA9685s, Serial0 TX 1 to the
  sound board. Links the chosen sketch does not drive are dashed and say why.
  Still **no V+ lines, by design**. It renders in the wizard's wiring step and
  heads the printable sheet, which also now carries the build table.
- **One Config tab.** The Boards cards and pin maps moved off the Model tab;
  the paint scheme, role colours, per-slot roles and favourites moved off the
  startup overlay; the panel assignment table is new. A sticky jump bar
  (Build · Sketch · Boards · Panels · Colours · Files) makes the long pane
  navigable. The Model tab keeps the CAD-specific work and links across.
- **Upgrade path**: prefs saved before this feature have `PREFS.hw` but no
  build block — `buildGet()` seeds the two servo answers from it, re-picks the
  firmware and matches the sound board, so an existing user is not greeted by
  a conflict they never chose. The build travels in the setup `.json`; on
  import the file's `profile` wins over its build block.
- New suite `tests/build-config.test.js` (41). `test.sh` now also runs
  `sounds.test.js`, which had never been in the list.
  **330 passing across 12 suites, both builds.** APP_VERSION **1.3.0**.

### 2026-07-27 — v1.2.1: contrast pass ("not very easy to read")
- Mike sent screenshots of the startup overlay and the Outputs pane: the
  secondary text was too dim. Measured it: dark `--dim` sat at ~4.2:1
  against the panels and `--dimmer` at ~2.4:1 — genuinely illegible at
  10px mono. Token-only fix in `01-tokens.css` / `06-theme-light.css`
  (nothing else touched, every stylesheet routes through the tokens):
  dark `--txt` #c6cfdc→#d7dfea, `--dim` #6e7a8c→#9aa7b8 (~7:1),
  `--dimmer` #4a5464→#828ea0 (~5:1), pad labels up too; light `--dim`
  →#4a5866 (~7:1), `--dimmer` →#65727f (~4.6:1).
- look-boards' light-theme check no longer pins a magic hex — it now
  computes real WCAG contrast (txt ≥10:1, dim ≥4.5:1 vs panel), so future
  re-skins are judged by legibility, not by matching an old value.
- **287 passing across 11 suites, both builds.** APP_VERSION **1.2.1**.

### 2026-07-27 — v1.2.0: pies 1-4 pivot, only Pie 5 rises
- Mike, correcting v1.1.0's blanket lifters: "dome pies 1-4 need to go back
  to pivoting rather than rising — only 5 rises." Pies 1-4 now keep the
  .r2m's original geometry hinge (low outer edge, opening up and outward);
  only **Pie 5** (his numbering — az 263.5°, droid left) gets `PIE_LIFT`.
  Because "Pie 5" is Mike's number rather than a CAD base name, the lifter
  is assigned by `pieOrder===4` AFTER the numbering pass in `cad/build.js`
  — the `Pie1`/`Pie5` entries left `RIG_CORRECTIONS`.
- cad suite: rig assertion split (pie0-3 hinge, pie4 slide 10 cm); the
  mod2026 drive test now checks rotation on 1-4 (via `m.group.quaternion` —
  hinges rotate the group, slides move the mesh) and lift on 5.
  **287 passing across 11 suites, both builds.**
- APP_VERSION **1.2.0**.

### 2026-07-27 — v1.1.0: real Padawan sounds, Pie 6 fixed, pies named 1-6
- **The sim plays the real R2 sounds.** Mike's pack:
  github.com/Imperiallandm/r2sounds → `Padawan_sounds_May22.zip`, 53 MP3s
  numbered 01-53 = exactly the track space all three sketches trigger.
  18 MB, so NOT embedded: drop the zip (or the mp3s) anywhere on the sim, or
  Controls → **Load sounds**. New `core/soundbank.js`: own tiny zip reader
  (central-directory walk; STORED copied, DEFLATE via
  `DecompressionStream('deflate-raw')` — no vendor lib), lazy
  `decodeAudioData` cache, `mp3.playTrack`/`player.playSpecified` both route
  through `sndTrigger()` → `sbankPlay(n)`; a new trigger interrupts the
  current sound (both boards are single-channel); volume maps `SND.vol`/30
  → gain. Bank persists in **IndexedDB** (works on file:// in Chrome) so the
  drop is once per machine; `SOUND_NAMES` (just the 53 file names) is
  embedded so the HUD/log say "13 · ALARM3" even with no files. A copy of
  the zip sits in the project root as `Padawan_sounds_May22.zip`. The pack's
  read.me asks visitors to consider a donation to firstinspires.org.
- **Verified against the real zip**: all 53 load, startup sound (21)
  audibly plays in headless Chrome.
- **CAD `Pie6` does not move** (Mike, by observation): `STATIC_KEEP_PART` in
  `cad/build.js` strips its rig/actuator but — unlike the MainPies — keeps
  it a separate, selectable, pie-coloured part. Five lifters remain
  (`pie0-4`); dome starter and mod2026 dome ch of the sixth pie now simply
  drive nothing (shows "named", not green).
- **Pies named per Mike**: "all the pies have the same name … name them going
  anticlockwise with 1 being to the left of 6." Implemented as: front view,
  looking down at the dome → anticlockwise = decreasing azimuth →
  Pie 1 = 149.5° (rear-right), 2 = 88.8°, 3 = 28.9°, 4 = 328.9°,
  5 = 263.5°, 6 = 216.6° fixed. `buildCad` sorts the movers by
  `(azPie6 - az) % 360` and stamps default labels; a user rename still wins.
  **If Mike says the direction is backwards, swap the two operands of that
  subtraction — one line.** `actPartLabel()` (naming.js) is the new
  human-name helper; the channel picker, planned-board names and .mstr
  channel names all use it, so exports now read "Pie 3" instead of a
  duplicated CAD "Pie5".
- New suite `tests/sounds.test.js` (13): pack names, zip reader
  stored+deflate+junk-skip, real playback through both board APIs, interrupt,
  volume, IDB reload survival. cad/wiring suites updated for 5 lifters +
  numbering. **287 passing across 11 suites, both builds.**
- APP_VERSION **1.1.0**.

### 2026-07-27 — v1.0.0: real board photos, channel picker, Reset, version tag
- **The sim now carries a version number** — `APP_VERSION` in `core/util.js`,
  shown top-left in the header (`#verTag`). **Bump it on every delivery** and
  put the same number in this log, so Mike can tell at a glance whether the
  copy he has open is the latest. This entry is **v1.0.0**.
- **Pololu's own labelled photos replace the STEP render** (Mike: "you didn't
  line up the channels very well"). All four Maestro variants now show the
  official annotated top view: micro6 #1350/0J1954, mini12 #1352/0J2341,
  mini18 #1354/0J9971, mini24 #1356/0J9972. Photos are Pololu's — fine inside
  Mike's own tool, do not republish separately.
- **Pin maps are measured, not eyeballed**: the percentages in
  `app/board-img.js` come from detecting Pololu's red "signal" boxes
  programmatically (PIL red-mask; box edges = rows/cols with >60% red
  coverage). New bank shapes: vertical right-edge banks *and* horizontal
  bottom-edge banks (`horiz:true, rev:true` — both boards label the bottom
  row ch17..ch12 / ch23..ch18 left→right).
- **Photo acquisition recipe** (container proxy blocks a.pololu-files.com):
  a browser on the build machine → navigate the tab straight to the image URL
  (same-origin beats CORS) → `javascript_tool` pins the `<img>` to the
  viewport corner on white → `computer` zoom with `save_to_disk:true` lands
  the PNG on the container. Trim white margins with PIL, save JPEG q82.
- **Channel picker**: click any channel — strip on the photo or numbered pin
  button — and a popover shows what it is connected to plus a pick list of
  every moving part. Choosing a part already wired elsewhere pops a
  **confirm() warning and moves it** (old channel released — the
  one-channel-per-part rule holds everywhere). Live Maestro boards write
  straight into `MSTR.channels`; planned boards persist edits in
  **`PREFS.hwMap[loc][ch]`** (''=explicitly cleared, overlaying the starter
  defaults) — included in the setup .json. mod2026 stays read-only (sketch
  constants).
- **Reset button** beside Save/Load setup (Config tab + startup screen):
  "Are you sure" confirm, wipes `localStorage` prefs, reloads. Saved .json
  setups on disk untouched.
- track-ui suite +11: photo/pinmap coverage, picker open/clear/assign/steal
  (dialog captured), live-board write, version tag, Reset cancel keeps prefs.
  **271 passing across 10 suites, both builds.**
- OPEN (answered in v1.1.0): the garbled pie is CAD `Pie6`; the sounds repo
  is github.com/Imperiallandm/r2sounds.

### 2026-07-26 — Fusion look, sequencer workspace, lifters, STEP board, wiring diagram
- **Default paint is now "Fusion (as modelled)"** — Mike compared Fusion vs sim
  side by side; out of the box the droid now wears his own .mtl colours.
  (Saved paint prefs still win.)
- **Big sequencer layout**: ⛶ Expand in the sequencer transport — sequencing
  takes the left two-thirds, the droid docks right (xLights-style, per Mike).
  **Head / Body / Full** framing buttons; Expand auto-frames the head. Exits
  with the strip mode.
- **Inner pies are LIFTERS** (superseded in v1.2.0 — only Pie 5 lifts now): they rise straight up ~10 cm
  (`mode:slide`, axis +Y), they do not hinge. `PIE_LIFT` correction in
  `cad/build.js` + tests. **OPEN QUESTION for Mike:** the dictation said
  "[something] doesn't move, and Pie5 moves up and down" — if one specific
  inner pie is actually fixed, say which and it gets pinned.
- **STEP pipeline**: `pip install cascadio` → STEP→GLB → three.js orthographic
  top view → PNG. Mike's Mini Maestro 12 STEP is now the board image in the
  Boards section (`app/board-img.js`, 18 KB data URL) with clickable channel
  strips overlaid on the photo (`BOARD_PINMAP` percentages — re-measure if the
  render is redone). Recipe: /tmp/boardrender.html pattern — cascadio, GLTFLoader
  from the vendored three examples, camera down the shortest bbox axis.
- **Wiring diagram** added to the wiring sheet: board + numbered pins, coloured
  SIGNAL line per channel, dashed GROUND lines to a common bus — **no V+ lines
  by design** (Mike: power config is up to the user; the sheet says so in red).
- **Sounds verified against the mod2026 sketch** — every trigger matches:
  Y 13-16 / A 17-24 / B 32-51 / X 25-31, all twelve L1/L2/R1 combos, startup
  21, arm/disarm 52/53, automation 52/53, L3 speed cycle 53/1/52, auto-mode
  random 32-51. If there is a separate sounds-pack repo, the link never came
  through — ask Mike.
- Tests updated for lifters and Fusion default. **260 passing across 10 suites.**

### 2026-07-26 — Resize fix, real audio player, whole-setup files, colour tools
- **Window resize was broken horizontally**: the canvas's intrinsic width
  propped the grid column open, so the stage could shrink vertically but never
  sideways. Canvas is now absolutely positioned (contributes no intrinsic
  size, `z-index:0` under the HUD/tools) and `#stage` got `min-width:0`.
  **Trap: any big intrinsic-size element inside a grid cell needs this.**
- **Sound**: `AudioContext.resume()` on play (browsers hand out suspended
  contexts even from click handlers — the silent-no-sound classic), and
  **▶ Play ♪ now plays the track with no sequence at all** (audio + cursor
  only, status says so). The droid joins in as soon as a sequence is selected.
- **Whole-setup export/import** (`app/setup-io.js`): one `.json` carries
  profile + constants, Maestro board/channels/sequences, CAD actuator mapping
  + ride height, part labels/colours/finishes/groups, paint scheme, themes,
  UI scale, electronics choice, best lap. Buttons in Config + startup screen;
  drop the file anywhere. Round-tripped in tests (wreck state → import →
  everything back).
- **Favourite colours**: six user-set slots (startup screen to edit; on every
  part card click applies, shift-click captures the part's colour).
- **Metal swatches**: chrome, silver, aluminium, gold, brass, copper, bronze,
  gunmetal on the part card. On a rigged part (own mesh) they also set a
  **metallic finish** via a lazily-cloned material — gold reads as gold, not
  gold paint. Merged statics get the colour only (finish is per-material and
  they share one — the known limitation).
- **"Fusion (as modelled)" paint scheme** — answers Mike's question: yes, the
  OBJ import brought the `.mtl` Kd colours in; they live in
  `CAD.header.materials[].color`. This scheme paints every part with its
  original Fusion colour again (`fusionPartHex()`).
- New suite `tests/setup.test.js` (24). **260 passing across 10 suites.**

### 2026-07-26 — Mike's UX punch-list, all seven items
- **Chrome is back.** The paint rework had flattened everything matte, and the
  amber fill light tinted white paint beige. Role finishes now: dome = spun
  aluminium (metalness .80), hardware chrome (.92), panels/legs semi-gloss;
  the fill light went neutral in both stage themes.
- **Frame text**: smallest font sizes bumped, and an **A− / % / A+** UI-scale
  control in the header (persisted, body zoom + renderer resize).
- **Stage theme decoupled**: the **BG** stage button holds the 3D stage light
  or dark independently of the frame (`PREFS.stageTheme`, `applyStageTheme()`).
- **Practice track** implemented (see §6 item 1).
- **Music was failing silently** — Build/Play errors went to the Serial log.
  Now: a status line in the music bar reports every action; **Build with no
  settings loaded auto-generates a matching starter** instead of doing nothing;
  decode failures surface in red.
- **Port picker on the selection card**: select a moving part → choose the
  Maestro channel it is plugged into right there (one channel per part; the
  old channel is released). mod2026 shows its fixed PCA9685 port read-only.
- **Endpoint warnings on every export**: the `.mstr` carries a warning comment
  and the export status says it loud; the `.ino` export carries the same
  warning — the sim's travel values are placeholders, not the user's servos.
- **MainPies are static** (real build): `MainPie1-6` merged into the dome shell
  — dome colour, rotate only with the dome. The six inner pies renumber
  `pie0-5` by azimuth; the dome starter is now 6 pies + 14 panels (20ch).
- **Electronics v1**: startup **Electronics** section — dome and body
  controller each mod2026 PCA9685s or any Maestro variant, mix and match,
  persisted in `PREFS.hw`. The Model tab gains a **Boards** section: each
  board drawn with clickable pins — click a pin to select and flash its part
  on the model; select a part and its pin lights. Not yet: photographic board
  art, per-pin drag-rewiring on the picture, dome-variant geometry choice.
- Fixes on the way: profile selector highlight follows `SIM.profile`;
  `segCross` tolerates a path landing exactly on a gate line.
- New suite `tests/track-ui.test.js` (24). **236 passing across 9 suites.**

### 2026-07-26 — Utility arms re-rigged from the physical build
- Mike checked the real MK4: the utility arms are **side-hinged and swing out
  horizontally like arms** — upper pivots on the **viewer's right** (sim −X),
  lower on the **viewer's left** (+X). The geometry heuristic had them as
  top/bottom clamshell flaps hinged on their rear edge. The mirrored bboxes in
  the export support the correction.
- Implemented as `RIG_CORRECTIONS` in `cad/build.js`, applied at load (before
  the −pivot geometry translation) so the bundled payload and any dropped
  `.r2m` both get it; `cad/rig.py` carries the same rule so a regeneration
  agrees. Range 1.40 rad, axes ±Y so positive travel swings outward.
- `tests/cad.test.js` now asserts the pivots sit on the correct vertical edges,
  the axes are vertical and opposed, and both free ends swing toward −Z.
  **This is the pattern for future rig fixes: physical observation beats the
  heuristic — add a correction, don't tweak the derive code's guesses.**
- Known cosmetic artefact spotted on the way (pre-existing): one dome panel is
  modelled **open in the Fusion source**, so its "closed" pose stands proud of
  the shell in the sim. Nothing moves it; re-exporting with the panel shut (or
  a future per-part pose offset) would clear it.

### 2026-07-26 — Music sequencing
- `maestro/music.js` + `music-ui.js`: load a track into the sequencer strip
  (button or drop it anywhere) → waveform, onset detection, tempo by
  autocorrelation with **parabolic lag interpolation** (integer lags alone are
  ±3 BPM off at this hop — a 120 BPM click track read as 117.5 before) and a
  half-lag walk so the smallest credible period wins over its double. Phase is
  fitted against the onsets; the BPM box overrides the grid by hand.
- **Snap to beats** retimes the current sequence's frame boundaries onto the
  grid, assigning FORWARD with a 60 ms floor so collapsed boundaries don't push
  everything later off-grid.
- **Build routine…** generates a sequence from a group (or pies/panels/doors):
  chase / alternate / pulse, one move per beat (or every 2nd/4th), ending on
  the home pose. It lands in `MSTR.sequences` like any hand-made sequence, so
  it exports in the `.mstr` and fires from a `restartScript(n)` slot.
- **▶ Play ♪** drives the droid from the AUDIO clock (`musicApplyAt()`), not
  the sim loop — the preview cannot drift from the track. The music itself
  never leaves the browser: on the droid, fire the sound cue and the
  subroutine from the same button, as the stock sketches do.
- Fixes on the way: `#muswave` used `style.display=''` which fell back to the
  stylesheet's `display:none`; the profile selector highlight now follows
  `SIM.profile` instead of the last click; chrome buttons blur after click so
  the keyboard keeps driving the droid.
- New suite `tests/music.test.js` (21 tests) against a synthesised 120 BPM
  click track — tempo ±1 BPM, phase lock, grid snap, routine shapes, export
  round-trip, live playback. **207 passing across 8 suites.**

### 2026-07-26 — Click-to-select, part registry, groups; 12 review fixes
- **Selection:** click a part on the model (drags stay with the orbit camera) —
  works on merged static meshes via per-bucket face ranges + binary search, so
  draw calls stayed at ~51. Card in the stage corner: rename (label rides on
  top of the CAD name, which never changes), colour override, actuator test
  slider, group membership. Esc / empty-click deselects.
- **Part registry (`cad/parts.js`):** labels + colour overrides per part,
  persisted in `localStorage` and pruned against the loaded model. Labels
  surface in the Model pane, the selection card and the wiring sheet
  (`DataPortDoor "diagnostic hatch"`).
- **Groups:** named sets of parts with optional group colour
  (override > group > paint role, resolved per part into vertex colours).
  Groups panel on the Model tab: flash / open / close / delete, and **⟶M**
  appends the group to the Maestro settings as an Open+Close sequence pair
  (delta-safe: close ends on the base pose). Groups with actuated members also
  register as `Group: … open/close` animations in the Config slot dropdowns.
- **Paint reworked to per-part vertex colours** (see §3) — slot materials went
  white; `effectivePartHex()` is the query.
- **`actSet()`** routes test actions through the servo model under mod2026 and
  the ACT_T ramp elsewhere; side panels/rear doors now also answer UI tests
  under mod2026.
- **Review pass fixed 12 defects**, the worst being: exported `.mstr` kept the
  imported `<Channels>` block verbatim so channel edits (All to Servo,
  endpoints) shipped a self-contradictory file — the block is now regenerated
  on export; importing a valid `.mstr` under mod2026 reported "import failed"
  (null `#maeMsg`); dropping an `.r2m` discarded the paint job (no
  `initPaint()`); the channel test slider overwrote the Part column; arrow keys
  inside dropdowns drove the droid (SELECT/BUTTON now exempt); multi-touch
  chords broke (pointerup released all buttons — now filtered by pointerId);
  Sequencer strip was a silent dead end under mod2026 (now disabled with a
  tooltip); Restore defaults desynced the Maestro pane; THREE materials leaked
  on rebuilds; the wiring sheet printed PCA9685 ticks as "µs" (now both);
  the Outputs actuator table hid panels/rear doors (now built from ACT);
  `setBoard()` left the subroutine table stale (now reindexes).
- New suite `tests/select.test.js` (30 tests). **186 passing across 7 suites.**

### 2026-07-26 — Part naming reconciled, wiring reference added
- New `cad/naming.js`: `actCadName()`, `actAzimuth()`, `azWord()`, `actLabel()`,
  `actTip()`. Pairs the sim's actuator IDs with the CAD names they drive and the
  bearing from the front.
- The Maestro **Drives** dropdown now reads *"Dome pie 1 · MainPie3"*, the Part
  column shows the CAD name instead of a count, and hovering gives bearing +
  hinge source. The Model pane's dropdown shows which CAD part each actuator
  already owns, so a reassignment is a visible swap rather than a guess.
- New `app/wiring.js`: a printable **wiring sheet** (HTML) and CSV, from buttons
  in both the Maestro and Model panes. Three disjoint sections — driven / rigged
  but undriven / driven but not in the CAD — with a tick column for the bench.
  It reads the **active profile**, so mod2026 shows PCA9685 board+channel and
  the Maestro profiles show board+channel, with the endpoints currently set in
  Config.
- New suite `tests/wiring.test.js` (24 tests) asserting the CAD names are
  untouched, the azimuth ordering is monotonic round each ring, the door pairs
  mirror, the names surface in the UI, and no row is printed twice.
- **Correction:** four inner pies share the name `Pie5`, not six as first stated.
  Fixed in the code comments and the Model pane note.

### 2026-07-26 — Handover file
- Added this file. Keep it updated with every change.

### 2026-07-26 — Split the single file into modules
- Broke the build into **39 JS + 7 CSS + 1 markup** modules under `src/`,
  driven by `src/manifest.json`.
- `tools/build.js` now generates **both** `dev.html` (per-file, edit-and-refresh,
  no server) and the self-contained `R2D2-Simulator.html`. The build warns about
  any file under `src/` missing from the manifest.
- Split was mechanical (`tools/split.py`, `tools/split_css.py`) and verified:
  every non-blank source line present in the new tree, checked as an exact
  multiset. No hand-retyping.
- Tests renamed to what they cover and moved to `tests/`; they take `R2_TARGET`
  so they can run against either build. `./test.sh` runs both. 131 passing on each.
- Added `README.md`, `cad/README.md`, `package.json`, `.gitignore`.
- Fixed on the way: a stale cdnjs `<script>` tag that had been living inside the
  core source, and `</body></html>` that had been trailing the last JS part.

### 2026-07-26 — Maestro board variants and output→part mapping
- Four boards (Micro 6, Mini 12/18/24) with board-correct starters, exports
  (`ServosAvailable`/`ServoPeriod` vs `MiniMaestroServoPeriod`/`ServoMultiplier`,
  pull-ups only on Minis), import detection, and in-place resizing that keeps
  mapping work and trims sequence rows.
- Script-size estimator warns before you exceed the board's memory (a full dome
  script is ~2.2 KB — fine on a Mini's 8 KB, over a Micro's 1 KB).
- Rebuilt the channel table as **Outputs → moving parts**: live test slider per
  channel that drives the model, click-to-rename, invert, auto-map by name, and a
  column showing how many CAD parts that actuator drives.

### 2026-07-25 — Paint, theme, startup screen
- Reworked paint onto (kind, file, material) slots (see §3) — 23 slots from 11
  Fusion materials. 8 roles, 6 schemes, per-slot overrides, persisted.
- Light theme across CSS variables *and* the 3D scene.
- Startup screen on first run, reopenable from **Setup** in the header.

### 2026-07-25 — CAD model, dome animations, door scripts
- MK4 geometry loading from a custom `.r2m` container, 36 rigged parts with
  hinges derived from the CAD's own hinge bodies.
- Door and dome animation sets.

### 2026-07-25 — Maestro tooling, third profile, first build
- `.mstr` import/export, sequence and pose editor, starter generators.
- Maestro 2025 and 2022 BETA profiles alongside mod2026.
- Initial simulator: 3D droid, Xbox pad, ported `loop()`, serial console, live
  servo table, editable config, sound cue indicator.
