# Design: Model Builder & Track Builder

> **STATUS 2026-08-15.** Mike answered the decision list (below) and both
> phase 1s shipped in **v1.41.0**: the Track Builder editor
> (`app/track-edit.js`, ✎ EDIT beside the stage TRACK button) and the Builder
> model (`scene/builder.js`, fourth card in setup). Decisions locked: **50 mm
> grid** · **~8 parts soft cap, 12 hard** · **2-axis ball joints allowed** ·
> **forward kinematics only** (parent-child attachment, no solver) · **full
> wiring sheet** (builder joints print like everything else) · track spacing
> violations **warn but allow** · face parts = **all three, phase 2** (eyes +
> brows + mouth together — NOT built yet). Remaining: Builder phase 2 (faces)
> and phase 3 (chains are already implicit via attachment; the phase-3 section
> below stays for the linkage-drawing polish), Track Builder phase 2 (multiple
> layouts & share).

## 1. Model Builder

The Builder is a fourth model on the stage alongside the droid, Anzellan head, and Polar Mouse. It lets users compose mechanical assemblies from primitive parts (beams, hinges, discs, ball joints, plates), snap them together on a grid, assign servo channels to moving joints, and optionally add pre-made animated face elements (eyes, brows, mouths). The finished build saves to the setup `.json` and its channel assignments flow into the sequencer and wiring sheet unchanged — a user-built arm or leg becomes indistinguishable from an Anzellan face rig to the rest of the sim.

The seam in the existing architecture is `scene/models.js`: adding the builder as a fourth entry in `MODELS` (alongside `droid`, `frik`, `mouse`) and routing `PREFS.model = 'builder'` through the same visibility and ACT registration plumbing that already works for Anzellan. Like `anzellan.js` registers `ANZ_ACTS` to wire the eleven face channels into the output table, the builder's parts will each register a channel when assigned a servo, and `buildCadPane()` will redraw the channel→part table on demand.

### Builder — Phase 1: Parts Bin & Snapping (Medium: 2–3 sessions)

Users drag primitives from a parts bin onto a 3D canvas: a 50 mm beam (cylinder), a hinge (two spheres with pin), a disc (thin washer), a ball joint (socket + ball), a plate (flat cube). Each snaps to a grid and can be rotated on axis. A hinge gets an input field to assign it to a channel; the builder reads the channel and registers the part in ACT. Save writes `{parts:[{id, type, pos, rot, channel}]}` to the build config.

**Size:** Medium — picking & snapping UI is familiar (Lego, BlockCAD). The 3D manipulation layer exists in the track builder (below). **Risks:** grid locking vs. free rotation clarity, deciding 50 mm as the unit, whether a part can have multiple channels. **Not in scope:** physics or collision, assembly instructions, exporting to CAD.

### Builder — Phase 2: Animated Face Parts (Small: 1 session)

Premade face elements (left & right eyes on gimbals, left & right eyebrows with blink rig, upper & lower mouth on hinge) appear in the parts bin. Each one is a rigged sub-assembly reusing the Anzellan face rig patterns (see `anzellan.js` lines 27–49 for the eye/brow/lid structure). Drop an eye onto the canvas, assign it two channels (yaw and tilt), and the sequencer can drive it as a unit. Save the palette to prefs.

**Size:** Small — the rigging is already proven in Anzellan; this is duplicating that structure and parameterizing it. **Risks:** rig complexity if more than four face parts accumulate; testing visibility at small scale. **Not in scope:** procedural face generation, skin deformation.

### Builder — Phase 3: Kinematic Chains (Large: 3+ sessions)

A mode where a chain of hinges can be linked: the second hinge's base position is relative to the first hinge's endpoint, so a two-segment arm stays connected as the user rotates each joint. The solver reads the chain and draws the linkage in the 3D view. Assign channels to each joint and the sequencer drives the forward kinematics.

**Size:** Large — kinematics solvers are non-trivial, and testing requires a surface to place objects on. **Risks:** gimbal lock in the visualization, whether to support closed chains, ground contact detection. **Not in scope:** inverse kinematics, collision avoidance, dynamic simulation.

---

## 2. Track Builder

The Track Builder is a top-down 2D editor where users draw the racing line, place gates and cones, and optionally save multiple layouts. The seam in the existing architecture is `app/track.js`: currently `TRACK_SHAPE` is a hard-coded array of control points; the builder moves that array into a PREFS-stored data structure and `trackBuild()` consumes it from there instead. Gates and barriers follow the same route — sampling off the curve at design time, stored once, read by collision logic unchanged.

### Track Builder — Phase 1: 2D Editor (Medium: 2 sessions)

Open a modal with a 1:1 canvas of the hangar deck (±7 m). Render the current track as a Catmull-Rom curve preview. Drag the control points to reshape; right-click to add/remove. A separate toolbar places gates (sensing gates) and cones (visual objects). Save writes the shape array to `PREFS.track` and merges it into the build config `.json`. On load, `trackCurve()` reads from PREFS instead of the hard-coded `TRACK_SHAPE`.

**Size:** Medium — canvas interaction is standard; the curve math is already in place. **Risks:** the test surface (hangar deck background image), point density if the user creates very tight curves, barrier placement rules (the constraint in `track.js` line 46 that two non-adjacent sections must stay 2.4 m apart). **Not in scope:** terrain height variation, multiple disconnected tracks, real-time path smoothing.

### Track Builder — Phase 2: Multiple Layouts & Share (Small: 1 session)

Store a list of named track layouts in `PREFS.tracks`, add a dropdown to pick the active one, and a duplicate button to fork the current layout. On export, bundle all layouts into the config. Optional: a "share" button that generates a URL-safe JSON string for pasting into a message.

**Size:** Small — it is a list wrapper around phase 1. **Risks:** name collision, UI space on a small screen. **Not in scope:** collaborative editing, version control.

---

## Decisions Needed from Mike

1. **Grid snapping for builder parts:** fixed 50 mm grid (matches a Meccano standard pitch), or freeform placement that locks to 5 mm increments?
2. **Max parts in a build:** are we thinking 6–8 primitive parts (a single arm), 20+ (a mobile platform), or no hard limit?
3. **Multi-channel parts:** can a single hinge be split across two channels (e.g., pan and tilt on one physical joint)?
4. **Export wiring sheets:** should the builder generate a physical wiring diagram like the droid does, or is the sequencer export enough?
5. **Track barrier rules:** should the editor warn or prevent designs that violate the 2.4 m non-adjacent spacing rule, or let the user learn the hard way?
6. **Premade face parts:** which animations matter first — blink/gaze for the eye, or a full mouth rig?
7. **Kinematic chains in phase 3:** is the goal a simple forward-kinematics preview (moving joint 1 pulls joint 2), or end-effector guidance (drag the hand, solve backwards)?
8. **Builder file format in setup .json:** one `"builder":{parts:[...], faces:[...]}` object, or split `"parts"` and `"faces"` at the top level?
