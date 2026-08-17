#!/usr/bin/env python3
"""
Polar Mouse + Chariot OBJ  ->  the same .r2m container the MK4 uses.

    python3 mouse.py            # writes polar-mouse.r2m and src/js/cad/mouse-payload.js

WHY A SECOND SCRIPT AND NOT A FLAG ON convert.py
------------------------------------------------
`convert.py` is about an astromech: it classifies dome pies by azimuth and
derives door hinges from the CAD's own hinge bodies. None of that means
anything here. What this model needs instead is a VEHICLE block — wheel
centres, a wheelbase, a track, a hitch — so the sim can drive it. The two
scripts share the container format and the quantiser, and nothing else.

COORDINATE FRAME (derived, do not re-guess)
-------------------------------------------
The export is millimetres, Z up, like the MK4 — but it is laid out along a
different axis, so the transform is NOT the droid's.

    front  = +X_cad   FrontBodyEdge x=+396 vs RearBodyEdge x=-39;
                      the chariot trails at -X
    left   = +Y_cad   LeftHub y=+88.9 vs RightHub y=-201.5
    up     = +Z_cad

The model's own centreline sits at y = -56.31, not zero (SteerBar, LArmServo
and MouseTow all share it), so the lateral offset comes out before anything
else or the vehicle drives permanently crabbed.

    sim = ( -(y_cad - y0) , z_cad - z0 , -x_cad ) / 1000     det = +1

z0 puts the bottom of the tyres on y = 0.

WHAT GETS DROPPED
-----------------
Two thirds of the triangles are gears, bearings, the differential, drive
shafts, brackets and chassis frames sealed inside the body. They are recorded
in `dropped` for the record and thrown away. The six tyres are 35.7k triangles
EACH — a fifth of the whole model in rubber — so anything over the decimation
threshold goes through a quadric pass and gets smooth normals, which is
exactly right for a revolved part.
"""
import sys, os, re, json, math, struct, gzip, base64
import numpy as np
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from convert import parse_obj, parse_mtl, base_name

MM = 0.001
Y0 = -56.31                    # the model's lateral centreline, in CAD mm
DECIMATE_OVER = 6000           # triangles
DECIMATE_TO   = 0.10           # keep this fraction

# Sealed inside the chassis: you cannot see any of it with the body on.
# NOTE greebles, bumpers, wheel plugs and hubs are deliberately NOT here —
# they are exterior detail, and the model looks bald without them.
INTERNAL_RE = re.compile(
    r'(gear|bearing|diff|driveshaft|shaftgear|crossbolt|spacer|endcap|centrepin|'
    r'lock|idler|motor|servo|bracket|frame(?!.*base)|framebase|brace|boardassemble|'
    r'hubbar|servobar|steerbar|susarm|upperarm|lowerarm|gearsidespace)', re.I)

CHARIOT_X = -80.0              # anything behind this belongs to the trailer


def norm_key(n):
    return re.sub(r'[^a-z0-9]', '', n.lower())


def smooth_normals(pos, idx):
    """Area-weighted vertex normals. Correct for the revolved parts this is
    used on (tyres); the un-decimated parts keep the CAD's own normals."""
    n = np.zeros_like(pos)
    a, b, c = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    fn = np.cross(b - a, c - a)          # length == 2 * area, so no normalising
    for k in range(3):
        np.add.at(n, idx[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True); ln[ln == 0] = 1
    return n / ln


def decimate(pos, idx, ratio):
    import fast_simplification
    p, f = fast_simplification.simplify(pos.astype(np.float32), idx.astype(np.int32),
                                        target_reduction=1.0 - ratio)
    return np.asarray(p, dtype=np.float64), np.asarray(f, dtype=np.int64)


def build(obj_path, out_path):
    verts, norms, groups = parse_obj(obj_path)
    V = np.asarray(verts, dtype=np.float64)
    print('  parsed %d verts, %d norms, %d groups' % (len(verts), len(norms), len(groups)))

    mtl = {}
    for line in open(obj_path, errors='replace'):
        if line.startswith('mtllib'):
            mtl = parse_mtl(os.path.join(os.path.dirname(obj_path), line.split(None, 1)[1].strip()))
            break

    # ---- pass 1: centroids, so the wheels can be found before anything is built
    cen = {}
    for name, g in groups.items():
        if not g['tris']:
            continue
        vi = np.unique(np.array([v for tri in g['tris'] for (v, _n) in tri], dtype=np.int64))
        cen[name] = V[vi].mean(axis=0)

    tyres = [(n, cen[n]) for n in cen if norm_key(base_name(n)).startswith('tyre')]
    if len(tyres) != 6:
        print('  ! expected 6 tyres, found %d — check the classifier' % len(tyres))
    axles = sorted({round(c[0], 0) for _n, c in tyres})          # -520, 6, 350
    sides = sorted({round(c[1], 0) for _n, c in tyres})          # -223, +110
    print('  axles at x =', axles, ' sides at y =', sides)

    # wheel id per (axle, side). +X is the front, +Y is the left.
    WHEEL_ID = {}
    axle_name = {axles[-1]: 'F', axles[-2]: 'R', axles[0]: 'C'}  # front, rear, chariot
    for ax in axles:
        for sy in sides:
            WHEEL_ID[(ax, sy)] = axle_name[ax] + ('L' if sy > Y0 else 'R')

    def wheel_of(c):
        """Which wheel a part belongs to, or None. Matched on the axle plane and
        the side, not on the name — the CAD's copy suffixes carry no meaning."""
        for (ax, sy), wid in WHEEL_ID.items():
            if abs(c[0] - ax) < 45 and abs(c[1] - sy) < 55:
                return wid
        return None

    wheel_c = {}
    for n, c in tyres:
        wid = wheel_of(c)
        wheel_c[wid] = c

    # tyre radius, from the tyre's own bbox
    tn = tyres[0][0]
    tvi = np.unique(np.array([v for tri in groups[tn]['tris'] for (v, _n) in tri], dtype=np.int64))
    tb = V[tvi]
    r_front = float((tb[:, 2].max() - tb[:, 2].min()) / 2)
    z0 = float(tb[:, 2].min())                     # tyre bottom -> ground
    print('  tyre radius %.1f mm, ground at z = %.1f mm' % (r_front, z0))

    def to_sim(p):
        return np.stack([-(p[:, 1] - Y0), p[:, 2] - z0, -p[:, 0]], axis=1) * MM

    def to_sim1(p):
        return [float(-(p[1] - Y0) * MM), float((p[2] - z0) * MM), float(-p[0] * MM)]

    # ---- pass 2: build
    all_pos, all_nrm, all_idx = [], [], []
    parts, materials, mat_index = [], [], {}
    dropped, vbase, decim = [], 0, 0

    for name, g in groups.items():
        if not g['tris']:
            continue
        base = base_name(name)
        c = cen[name]
        wid = wheel_of(c)
        # TRAP: 'ring' also matches "bea-RING", and three bearings rode into the
        # payload on that substring before the test caught them. Match the
        # wheel-ring parts by their full word instead.
        is_wheel = wid is not None and bool(re.search(r'(tyre|wheel|plug|hub)', base, re.I))
        chariot = c[0] < CHARIOT_X

        if INTERNAL_RE.search(norm_key(base)) and not is_wheel:
            dropped.append(name)
            continue

        # local vertex list, keyed on the (v, vn) pairs the exporter wrote
        remap, lpos, lnrm, lidx = {}, [], [], []
        for tri in g['tris']:
            for (vi, ni) in tri:
                key = (vi, ni)
                j = remap.get(key)
                if j is None:
                    j = len(lpos); remap[key] = j
                    lpos.append(verts[vi])
                    lnrm.append(norms[ni] if 0 <= ni < len(norms) else (0.0, 0.0, 1.0))
                lidx.append(j)
        lpos = np.asarray(lpos, dtype=np.float64)
        lnrm = np.asarray(lnrm, dtype=np.float64)
        lidx = np.asarray(lidx, dtype=np.int64).reshape(-1, 3)

        if len(lidx) > DECIMATE_OVER:
            # weld on position first, or the simplifier sees a shell full of cracks
            uniq, inv = np.unique(lpos.round(4), axis=0, return_inverse=True)
            wp, wi = decimate(uniq, inv[lidx], DECIMATE_TO)
            lpos, lidx = wp, wi
            lnrm = smooth_normals(lpos, lidx)
            decim += 1

        spos = to_sim(lpos)
        # the normal transform is the same proper rotation, with no translation
        snrm = np.stack([-lnrm[:, 1], lnrm[:, 2], -lnrm[:, 0]], axis=1)
        ln = np.linalg.norm(snrm, axis=1, keepdims=True); ln[ln == 0] = 1
        snrm = snrm / ln

        mname = g['mtl'] or 'default'
        if mname not in mat_index:
            mat_index[mname] = len(materials)
            materials.append({'name': mname, 'color': mtl.get(mname, [0.72, 0.72, 0.74])})

        if is_wheel:
            kind, member = 'wheel', wid
        elif chariot:
            kind, member = 'chariot', 'chariot'
        else:
            kind, member = 'body', 'mouse'

        sc = spos.mean(axis=0)
        parts.append({
            'name': name, 'base': base, 'file': 'mouse', 'mat': mat_index[mname],
            'vOff': vbase, 'vCount': int(len(spos)),
            'iOff': int(sum(len(x) for x in all_idx)), 'iCount': int(lidx.size),
            'bbox': [round(float(v), 5) for v in np.concatenate([spos.min(axis=0), spos.max(axis=0)])],
            'centroid': [round(float(v), 5) for v in sc],
            'kind': kind, 'member': member, 'tris': int(len(lidx)),
        })
        all_pos.append(spos); all_nrm.append(snrm)
        all_idx.append(lidx.reshape(-1).astype(np.uint32) + vbase)
        vbase += len(spos)

    pos = np.concatenate(all_pos); nrm = np.concatenate(all_nrm); idx = np.concatenate(all_idx)
    print('  kept %d parts (%d decimated), dropped %d internals' % (len(parts), decim, len(dropped)))

    # ---- the vehicle block: everything the drive model needs, measured here
    ws = {wid: to_sim1(c) for wid, c in wheel_c.items()}
    for wid in ws:
        ws[wid][1] = r_front * MM              # sit every wheel centre one radius up
    wheelbase = abs(ws['FL'][2] - ws['RL'][2])
    trackF = abs(ws['FL'][0] - ws['FR'][0])
    trackR = abs(ws['RL'][0] - ws['RR'][0])

    # The hitch is where MouseTow (the bracket on the droid) and TowBar (the
    # first part of the trailer) overlap — the midpoint of that overlap is the
    # pin. Guessing it from either part's centroid puts the pivot a hand's
    # width out and the trailer tracks wrong on every corner.
    def span(nm, ax):
        vi = np.unique(np.array([v for tri in groups[nm]['tris'] for (v, _n) in tri], dtype=np.int64))
        return float(V[vi][:, ax].min()), float(V[vi][:, ax].max())
    tow_lo, tow_hi = span('MouseTow', 0)
    bar_lo, bar_hi = span('TowBar', 0)
    hx = (max(tow_lo, bar_lo) + min(tow_hi, bar_hi)) / 2.0
    hz = (span('MouseTow', 2)[0] + span('MouseTow', 2)[1]) / 2.0
    hitch = to_sim1(np.array([hx, Y0, hz]))
    print('  wheelbase %.3f m  track %.3f/%.3f m  hitch z %.3f m' % (wheelbase, trackF, trackR, hitch[2]))

    lo = pos.min(axis=0); hi = pos.max(axis=0)
    span_v = np.maximum(hi - lo, 1e-9)
    q = np.round((pos - lo) / span_v * 65534.0 - 32767.0).astype(np.int16)
    nq = np.round(np.clip(nrm, -1, 1) * 127.0).astype(np.int8)

    header = {
        'format': 'r2m1',
        'source': [os.path.basename(obj_path)],
        'unit': 'm', 'up': 'Y', 'front': '-Z',
        'note': 'positions quantised int16 over bbox; decode p = lo + (q+32767)/65534*span',
        'bboxLo': [float(v) for v in lo], 'bboxSpan': [float(v) for v in span_v],
        'vertexCount': int(pos.shape[0]), 'triCount': int(idx.shape[0] // 3),
        'materials': materials, 'parts': parts,
        'vehicle': {
            'name': 'Polar Mouse with Chariot',
            'wheels': [{'id': k, 'c': [round(v, 5) for v in ws[k]],
                        'r': round(r_front * MM, 5),
                        'steer': k[0] == 'F', 'driven': k[0] == 'R', 'trailer': k[0] == 'C'}
                       for k in sorted(ws)],
            'wheelbase': round(float(wheelbase), 5),
            'trackF': round(float(trackF), 5), 'trackR': round(float(trackR), 5),
            'wheelR': round(r_front * MM, 5),
            'hitch': [round(v, 5) for v in hitch],
            'bodyLo': [round(float(v), 5) for v in lo], 'bodyHi': [round(float(v), 5) for v in hi],
        },
        'dropped': len(dropped),
    }
    hj = json.dumps(header, separators=(',', ':')).encode('utf-8')
    while (8 + len(hj)) % 4:
        hj += b' '
    with open(out_path, 'wb') as fh:
        fh.write(b'R2M1'); fh.write(struct.pack('<I', len(hj))); fh.write(hj)
        fh.write(q.tobytes()); fh.write(nq.tobytes()); fh.write(idx.tobytes())
    return header, out_path


def emit_payload(r2m_path, js_path):
    raw = open(r2m_path, 'rb').read()
    gz = gzip.compress(raw, 9)
    b64 = base64.b64encode(gz).decode('ascii')
    chunks = [b64[i:i + 160] for i in range(0, len(b64), 160)]
    body = '\n'.join('"%s"%s' % (c, '+' if i < len(chunks) - 1 else ';')
                     for i, c in enumerate(chunks))
    with open(js_path, 'w') as fh:
        fh.write("'use strict';\n"
                 "/* Polar Mouse + Chariot, built from Polar+Mouse+with+Chariot.obj by\n"
                 "   cad/mouse.py. gzip + base64 of the .r2m container, decoded at load\n"
                 "   time by the same inflateB64()/decodeR2M() the MK4 payload uses.\n"
                 "   Internals (gears, diff, shafts, chassis frames) are stripped and the\n"
                 "   tyres are decimated — see cad/mouse.py. Regenerate BOTH this file and\n"
                 "   the .r2m together or the bundled model goes stale. */\n"
                 "const MOUSE_PAYLOAD =\n")
        fh.write(body + '\n')
    return len(gz), os.path.getsize(js_path)


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    obj = os.environ.get('MOUSE_OBJ', '/mnt/user-data/uploads/R2D2 Sim/Polar+Mouse+with+Chariot.obj')
    out = os.path.join(here, 'polar-mouse.r2m')
    print('building polar-mouse.r2m')
    h, path = build(obj, out)
    kinds = {}
    for p in h['parts']:
        kinds[p['kind']] = kinds.get(p['kind'], 0) + p['tris']
    print('  parts %d  verts %d  tris %d  .r2m %.2f MB' % (
        len(h['parts']), h['vertexCount'], h['triCount'], os.path.getsize(path) / 1e6))
    print('  tris by kind: %s' % ', '.join('%s=%d' % kv for kv in sorted(kinds.items(), key=lambda k: -k[1])))
    gz, js = emit_payload(path, os.path.join(here, '..', 'src', 'js', 'cad', 'mouse-payload.js'))
    print('  payload gz %.2f MB -> mouse-payload.js %.2f MB' % (gz / 1e6, js / 1e6))
