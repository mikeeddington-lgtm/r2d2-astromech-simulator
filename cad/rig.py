#!/usr/bin/env python3
"""
Rig derivation: turn CAD geometry into pivot/axis/travel for every moving part.

Everything here works in SIM coordinates (metres, Y up, front -Z, R2's left = -X).
Positive travel always means "open" / "deployed".
"""
import math
import numpy as np

UP = np.array([0.0, 1.0, 0.0])

def unit(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else np.array([1.0, 0.0, 0.0])

def edge_centroid(pos, axis_idx, lowest=True, tol=0.004):
    """Centroid of the vertices at the extreme end of one axis (a hinge line)."""
    vals = pos[:, axis_idx]
    lim = vals.min() + tol if lowest else vals.max() - tol
    sel = pos[vals <= lim] if lowest else pos[vals >= lim]
    if len(sel) == 0:
        sel = pos
    return sel.mean(axis=0)

def far_point(pos, pivot):
    """The vertex furthest from the pivot in the horizontal plane — a door's free edge."""
    d = np.hypot(pos[:, 0] - pivot[0], pos[:, 2] - pivot[2])
    return pos[int(np.argmax(d))]

def rot_about(axis, ang, p):
    a = unit(np.asarray(axis, dtype=float))
    c, s = math.cos(ang), math.sin(ang)
    return p * c + np.cross(a, p) * s + a * np.dot(a, p) * (1 - c)

def outward_sign(pivot, probe, axis):
    """Pick the rotation sign that swings `probe` away from the droid's vertical axis."""
    rel = probe - pivot
    best, sign = -1e9, 1.0
    for s in (1.0, -1.0):
        r = rot_about(axis, s * 0.35, rel) + pivot
        d = math.hypot(r[0], r[2])
        if d > best:
            best, sign = d, s
    return sign

# --------------------------------------------------------------- hinge hardware
def hinge_axis_from_parts(hparts):
    """Vertical hinge line from the upper/lower hinge bodies: average their XZ centre."""
    if not hparts:
        return None
    c = np.mean([p['centroid'] for p in hparts], axis=0)
    return np.array([c[0], 0.0, c[2]])

HINGE_FOR = {   # door role -> name fragments of its hinge bodies in the CAD
    'doorFL':   ('FLUpperBreadpanHinge', 'FLLowerBreadPanHinge', 'FLUpperBreadpanHingeB', 'FLLowerBreadpanHingeB'),
    'doorFR':   ('FRUpperBreadpanHinge', 'FRLowerBreadPanHinge', 'FRUpperBreadpanHingeB', 'FRLowerBreadpanHingeB'),
    'doorRL':   ('RLUpperBreadpanHinge', 'RLLowerBreadPanHinge', 'RLUpperBreadpanHingeB', 'RLLowerBreadpanHingeB'),
    'doorRR':   ('RRUpperBreadpanHinge', 'RRLowerBreadPanHinge', 'RRUpperBreadpanHingeB', 'RRLowerBreadpanHingeB'),
    'dataport': ('UpperHinge', 'LowerHinge'),
    'smallDoor':('SmallLongDoorUpperHinge', 'SmallLongDoorLowerHinge'),
}

def derive(parts, pos_all, ref=None):
    """Attach a 'rig' dict to every movable part. Returns a human-readable report.

    `ref` maps base name -> list of centroids for every group in the source files,
    including internal bodies we chose not to render — that is how the breadpan and
    dataport hinges still position their doors in the shell-only build.
    """
    ref = ref or {}
    by_base = {}
    for p in parts:
        by_base.setdefault(p['base'], []).append(p)

    def slice_pos(p):
        return pos_all[p['vOff']:p['vOff'] + p['vCount']]

    report = []
    for p in parts:
        kind, role = p['kind'], p['role']
        rig = None
        pos = slice_pos(p)
        cen = np.asarray(p['centroid'], dtype=float)

        if kind == 'pie':
            # NOTE (Mike, 2026-07-27): on the real build the geometry hinge
            # below is CORRECT for pies 1-4; only Mike's "Pie 5" is a
            # vertical lifter (~10 cm straight up) and CAD "Pie6" does not
            # move at all — js/cad/build.js applies both corrections at load
            # (pieOrder===4 -> PIE_LIFT / STATIC_KEEP_PART) and numbers the
            # movers "Pie 1".."Pie 5" anticlockwise from the fixed Pie6.
            # hinge along the panel's low outer edge; it lifts up and outward
            piv = edge_centroid(pos, 1, lowest=True)
            radial = unit(np.array([piv[0], 0.0, piv[2]]))
            axis = unit(np.cross(UP, radial))
            probe = edge_centroid(pos, 1, lowest=False)
            sign = outward_sign(piv, probe, axis)
            rig = {'mode': 'hinge', 'pivot': piv.tolist(), 'axis': (axis * sign).tolist(),
                   'range': 0.70, 'src': 'geometry:low-edge'}

        elif kind == 'panel':
            # dome side panels hinge along their top edge, bottom swings out
            piv = edge_centroid(pos, 1, lowest=False)
            radial = unit(np.array([piv[0], 0.0, piv[2]]))
            axis = unit(np.cross(UP, radial))
            probe = edge_centroid(pos, 1, lowest=True)
            sign = outward_sign(piv, probe, axis)
            rig = {'mode': 'hinge', 'pivot': piv.tolist(), 'axis': (axis * sign).tolist(),
                   'range': 0.60, 'src': 'geometry:top-edge'}

        elif role in HINGE_FOR:
            cents, used = [], []
            for frag in HINGE_FOR[role]:
                for c in ref.get(frag, []):
                    cents.append(c); used.append(frag)
                for q in by_base.get(frag, []):
                    cents.append(q['centroid']); used.append(frag)
            hv = None
            if cents:
                m = np.mean(cents, axis=0)
                hv = np.array([m[0], 0.0, m[2]])
            if hv is not None:
                piv = np.array([hv[0], cen[1], hv[2]])
                src = 'cad-hinge:' + ','.join(sorted(set(used)))
            else:
                # fall back to the vertical edge furthest from the body centre
                d = np.hypot(pos[:, 0], pos[:, 2])
                piv = pos[int(np.argmax(d))].copy(); piv[1] = cen[1]
                src = 'geometry:outer-edge'
            probe = far_point(pos, piv)
            axis = UP.copy()
            sign = outward_sign(piv, probe, axis)
            rig = {'mode': 'hinge', 'pivot': piv.tolist(), 'axis': (axis * sign).tolist(),
                   'range': 1.75, 'src': src}

        elif role == 'chargebay':
            # no hinge body in the CAD — assume a vertical hinge on its outboard edge
            d = np.hypot(pos[:, 0], pos[:, 2])
            piv = pos[int(np.argmax(d))].copy(); piv[1] = cen[1]
            probe = far_point(pos, piv)
            sign = outward_sign(piv, probe, UP)
            rig = {'mode': 'hinge', 'pivot': piv.tolist(), 'axis': (UP * sign).tolist(),
                   'range': 1.60, 'src': 'guess:no-hinge-body'}

        elif role in ('utilUp', 'utilLo'):
            # SIDE-hinged — confirmed against the physical build (Mike,
            # 2026-07-26): the arms swing out horizontally like arms, they do
            # not clamshell. Viewed from the front (viewer's right = sim -X),
            # the UPPER arm pivots on the viewer's right, the LOWER on the
            # viewer's left. Axis signs make positive travel swing outward.
            piv = edge_centroid(pos, 0, lowest=(role == 'utilUp'))
            piv[1] = cen[1]
            piv[2] = 0.5 * (pos[:, 2].min() + pos[:, 2].max())
            s = 1.0 if role == 'utilUp' else -1.0
            rig = {'mode': 'hinge', 'pivot': piv.tolist(), 'axis': [0.0, s, 0.0],
                   'range': 1.40, 'src': 'build:side-hinge'}

        elif role == 'drawer':
            rig = {'mode': 'slide', 'pivot': cen.tolist(), 'axis': [0.0, 0.0, -1.0],
                   'range': 0.075, 'src': 'geometry:front'}

        if rig:
            rig['pivot'] = [round(v, 5) for v in rig['pivot']]
            rig['axis'] = [round(v, 5) for v in rig['axis']]
            p['rig'] = rig
            report.append((p['name'], p['kind'], p['role'], rig))
    return report
