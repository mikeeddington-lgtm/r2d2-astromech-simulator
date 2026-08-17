# CAD pipeline (offline, Python)

Turns the Fusion OBJ exports into the `.r2m` container the sim loads.
You only run this when the geometry changes.

```
python3 convert.py            # OBJ + MTL  ->  r2-mk4-shell.r2m and r2-mk4-full.r2m
```

`convert.py` parses the OBJ into unique (v, vn) vertex pairs per named group,
classifies each group (internal / pie / panel / leg / shell / anim / outlier),
records a `ref` table of **every** group centroid *before* dropping the internals,
then calls `rig.derive()` to work out hinge pivots and axes from the CAD's own
hinge bodies. Positions are quantised to int16 over the model bbox.

`.r2m` container:

```
'R2M1' | uint32 headerLen | header JSON | int16[3]*V positions
       | int8[3]*V normals | uint32[3]*T indices
```

The header JSON is **space-padded so the binary blocks land on a 4-byte
boundary** — the typed-array views in `src/js/cad/decode.js` need the alignment,
and a header that grew by one character broke this once already.

## After regenerating

The shell build is gzipped, base64'd and inlined as `src/js/cad/payload.js`.
**Regenerating the `.r2m` without regenerating that file leaves the bundled
model stale against the actuator mapping.** Then `./build.sh`.

`analyse.py` is the throwaway that established the coordinate frame — kept
because re-deriving it cost a debugging cycle. See `cad_model_plan.md`.


## The Polar Mouse

`mouse.py` is the second vehicle's converter — a separate script on purpose.
`convert.py` is about an astromech: it orders dome pies by azimuth and derives
door hinges from the CAD's own hinge bodies, none of which means anything for a
car. What the mouse needs instead is a **`vehicle` block** in the header —
wheel centres, wheelbase, both tracks, tyre radius and the hitch pin — so the
sim can drive it. The two scripts share the container format and the quantiser
and nothing else.

```
python3 mouse.py       # Polar+Mouse+with+Chariot.obj -> polar-mouse.r2m
                       #                             -> src/js/cad/mouse-payload.js
```

Its frame is **not** the droid's. This export is millimetres, Z up, but laid
out along a different axis: front is `+X`, left is `+Y`, and the model's own
centreline sits at `y = -56.31` rather than zero.

    sim = ( -(y_cad + 56.31) , z_cad - z0 , -x_cad ) / 1000

`z0` is the bottom of a tyre, so the wheels land on `y = 0`.

It drops 68 internal groups (gears, bearings, the differential, drive shafts,
chassis frames) and quadric-decimates anything over 6,000 triangles — which in
practice means the six tyres, at 35,726 triangles each. 1.01M triangles in,
204k out.

Needs `fast-simplification` (`pip install fast-simplification --break-system-packages`).

The `.mtl` the OBJ names is **not in the project folder**, so no `Kd` values
are read and colour falls back to material names plus part roles in
`scene/mouse.js`. Drop the real `.mtl` next to the OBJ and this script picks it
up with no changes.
