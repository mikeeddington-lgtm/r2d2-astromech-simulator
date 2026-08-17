#!/usr/bin/env python3
"""
Fusion/ATF OBJ  ->  compact .r2m container for the R2 simulator.

CAD frame (both exports):  millimetres, Z up, front = -Y, +X = R2's left.
Simulator frame:           metres,      Y up, front = -Z, left = -X.
  three = ( -x_cad , z_cad , y_cad ) / 1000        (proper rotation, det = +1)

.r2m layout
  'R2M1'            4 bytes
  uint32            header JSON byte length
  header JSON       utf-8
  int16[3] * V      quantised positions
  int8[3]  * V      normals
  uint32[3] * T     triangle indices (global, into the shared vertex array)
"""
import sys, os, re, json, math, struct
import numpy as np
from collections import OrderedDict
import rig as rigmod

MM = 0.001

# ---------------------------------------------------------------- classification
INTERNAL_RE = re.compile(
    r'(servo|gear|pinion|lazysusan|slip\s*ring|sonichub|motor|bracket|hinge|'
    r'backbox|back\s*box|boltholder|rodx|graniteearth|\bled|^option|centrebar|framebox)', re.I)
FORCE_VISIBLE = {
    'PowerCouplerFront','PowerCouplerFront2','PowerCouplerMain','PowerCouplerRear','PowerCouplerRing',
    'VentFrame','RearLogicFrame','FrontPSIRing','RearPSIRing','LargeBar','Button',
}
# base name -> simulator actuator key
ROLE = {
    # body
    'UpperUtilityArm':'utilUp', 'LowerUtilityArm':'utilLo',
    'DataPortDoor':'dataport', 'ChargingBayDoor':'chargebay',
    'FLBreadpanDoor':'doorFL', 'FRBreadpandoor':'doorFR',
    'RLBreadpanDoor':'doorRL', 'RRBreadpandoor':'doorRR',
    'SmallLongDoor':'smallDoor', 'Drawer':'drawer',
    # dome side panels and pies get assigned by azimuth below
}
PIE_RE   = re.compile(r'^(MainPie|Pie)\d*$', re.I)
PANEL_RE = re.compile(r'^Panel\d+$', re.I)
LEG_RE   = re.compile(r'(LegOnePiece|BodyBarLeg|^Skirt)', re.I)
# CAD part role -> the simulator actuator that drives it.
# The firmware only has two body-door channels, so the front pair follows them and
# the rear pair is left unassigned for the user to wire up.
ACT_FOR_ROLE = {
    'doorFL':'doorL', 'doorFR':'doorR', 'doorRL':'doorRL', 'doorRR':'doorRR',
    'utilUp':'utilUp', 'utilLo':'utilLo', 'dataport':'dataport', 'chargebay':'chargebay',
    'smallDoor':'smallDoor', 'drawer':'drawer',
}

def base_name(n):
    return re.sub(r'(\s*\(\d+\))+$', '', n).strip()

# ------------------------------------------------------------------- obj parsing
def parse_obj(path):
    """Return (verts, norms, groups) where each group holds (vi,ni) index pairs per triangle."""
    verts, norms = [], []
    groups = OrderedDict()
    cur, curmtl = None, ''
    with open(path, 'r', errors='replace') as fh:
        for line in fh:
            if not line or line[0] == '#':
                continue
            if line.startswith('v '):
                p = line.split(); verts.append((float(p[1]), float(p[2]), float(p[3])))
            elif line.startswith('vn '):
                p = line.split(); norms.append((float(p[1]), float(p[2]), float(p[3])))
            elif line[0] in 'go' and line[1] == ' ':
                name = line[2:].strip() or ('group%d' % len(groups))
                if name not in groups:
                    groups[name] = {'tris': [], 'mtl': curmtl}
                cur = name
            elif line.startswith('usemtl'):
                parts = line.split(None, 1)
                curmtl = parts[1].strip() if len(parts) > 1 else ''
                if cur is not None and not groups[cur]['mtl']:
                    groups[cur]['mtl'] = curmtl
            elif line.startswith('f '):
                if cur is None:
                    cur = '__root__'; groups.setdefault(cur, {'tris': [], 'mtl': curmtl})
                corner = []
                for tok in line.split()[1:]:
                    bits = tok.split('/')
                    vi = int(bits[0]); vi = vi - 1 if vi > 0 else len(verts) + vi
                    ni = -1
                    if len(bits) > 2 and bits[2]:
                        n = int(bits[2]); ni = n - 1 if n > 0 else len(norms) + n
                    corner.append((vi, ni))
                for k in range(1, len(corner) - 1):
                    groups[cur]['tris'].append((corner[0], corner[k], corner[k + 1]))
    return verts, norms, groups

def parse_mtl(path):
    mats = {}
    if not os.path.exists(path):
        return mats
    cur = None
    for line in open(path, errors='replace'):
        if line.startswith('newmtl'):
            cur = line.split(None, 1)[1].strip(); mats[cur] = [0.8, 0.8, 0.8]
        elif line.startswith('Kd') and cur:
            p = line.split(); mats[cur] = [float(p[1]), float(p[2]), float(p[3])]
    return mats

# ----------------------------------------------------------------------- convert
def convert(sources, out_path, drop_internal=False, outlier_r=320.0):
    all_pos, all_nrm, all_idx = [], [], []
    parts, materials, mat_index = [], [], {}
    ref = {}          # base name -> [centroid, ...] for ALL groups, dropped or not
    vbase = 0

    for src in sources:
        path, tag, zoff = src['path'], src['tag'], src.get('zoff', 0.0)
        verts, norms, groups = parse_obj(path)
        mtl = {}
        for line in open(path, errors='replace'):
            if line.startswith('mtllib'):
                mtl = parse_mtl(os.path.join(os.path.dirname(path), line.split(None, 1)[1].strip()))
                break
        print('  %-26s %6d verts %6d norms %4d groups' % (os.path.basename(path), len(verts), len(norms), len(groups)))

        for name, g in groups.items():
            if not g['tris']:
                continue
            base = base_name(name)
            internal = bool(INTERNAL_RE.search(base)) and base not in FORCE_VISIBLE

            if drop_internal and internal:
                # still record where it is, so hinge bodies can rig the doors they belong to
                vi = set()
                for tri in g['tris']:
                    for (v, _n) in tri:
                        vi.add(v)
                if vi:
                    pts = np.array([verts[i] for i in vi], dtype=np.float64)
                    c = pts.mean(axis=0)
                    ref.setdefault(base, []).append([-c[0]*MM, (c[2]+zoff)*MM, c[1]*MM])
                continue

            # unique (vi,ni) pairs -> local vertex list
            remap, lpos, lnrm, lidx = {}, [], [], []
            for tri in g['tris']:
                for (vi, ni) in tri:
                    key = (vi, ni)
                    j = remap.get(key)
                    if j is None:
                        j = len(lpos); remap[key] = j
                        x, y, z = verts[vi]
                        z += zoff
                        lpos.append((-x * MM, z * MM, y * MM))          # CAD -> sim
                        if 0 <= ni < len(norms):
                            nx, ny, nz = norms[ni]
                            lnrm.append((-nx, nz, ny))
                        else:
                            lnrm.append((0.0, 1.0, 0.0))
                    lidx.append(j)

            lpos = np.asarray(lpos, dtype=np.float64)
            lnrm = np.asarray(lnrm, dtype=np.float64)
            ln = np.linalg.norm(lnrm, axis=1, keepdims=True); ln[ln == 0] = 1
            lnrm = lnrm / ln

            cen = lpos.mean(axis=0)
            bb = [float(v) for v in np.concatenate([lpos.min(axis=0), lpos.max(axis=0)])]
            # radius in the CAD's horizontal plane, for outlier detection (mm)
            rad = math.hypot(cen[0], cen[2]) / MM

            mname = g['mtl'] or 'default'
            if mname not in mat_index:
                mat_index[mname] = len(materials)
                col = mtl.get(mname, [0.75, 0.75, 0.75])
                materials.append({'name': mname, 'color': col})

            role = ROLE.get(base, '')
            kind = 'internal' if internal else ('outlier' if rad > outlier_r else 'shell')
            if PIE_RE.match(base):
                kind = 'pie'
            elif PANEL_RE.match(base):
                kind = 'panel'
            elif role:
                kind = 'anim'
            elif LEG_RE.search(base) and not internal:
                kind = 'leg'

            parts.append({
                'name': name, 'base': base, 'file': tag, 'mat': mat_index[mname],
                'vOff': vbase, 'vCount': len(lpos),
                'iOff': sum(len(x) for x in all_idx), 'iCount': len(lidx),
                'bbox': [round(v, 5) for v in bb],
                'centroid': [round(float(v), 5) for v in cen],
                'radius': round(rad, 1),
                'kind': kind, 'role': role,
                'tris': len(lidx) // 3,
            })
            ref.setdefault(base, []).append([float(cen[0]), float(cen[1]), float(cen[2])])
            all_pos.append(lpos); all_nrm.append(lnrm)
            all_idx.append(np.asarray(lidx, dtype=np.uint32) + vbase)
            vbase += len(lpos)

    pos = np.concatenate(all_pos); nrm = np.concatenate(all_nrm); idx = np.concatenate(all_idx)

    # ---- assign pie panels and dome panels an index by azimuth (front = -Z, clockwise) ----
    for kind, key in (('pie', 'pieOrder'), ('panel', 'panelOrder')):
        sel = [p for p in parts if p['kind'] == kind]
        def az(p):
            x, z = p['centroid'][0], p['centroid'][2]
            return (math.degrees(math.atan2(x, -z)) + 360.0) % 360.0
        sel.sort(key=az)
        for i, p in enumerate(sel):
            p[key] = i
            p['azimuth'] = round(az(p), 1)

    # ---- derive hinge axes / pivots / travel from the CAD ----
    report = rigmod.derive(parts, pos, ref)

    # ---- default actuator assignment ----
    # 11 firmware pie channels vs however many pies the dome actually has:
    # take the outer ring (MainPie*) first, then the inner ring, by azimuth.
    # outer ring (MainPie*) first, then the inner ring, each by azimuth
    pies = sorted([p for p in parts if p['kind'] == 'pie'],
                  key=lambda p: (0 if p['base'].lower().startswith('mainpie') else 1, p['azimuth']))
    for i, p in enumerate(pies):
        p['act'] = 'pie%d' % i
    panels = sorted([p for p in parts if p['kind'] == 'panel'], key=lambda p: p['azimuth'])
    for i, p in enumerate(panels):
        p['act'] = 'panel%d' % i
    for p in parts:
        if p['kind'] == 'anim':
            p['act'] = ACT_FOR_ROLE.get(p['role'], p['role'])
        elif p['kind'] not in ('pie', 'panel'):
            p['act'] = ''

    # ---- quantise positions to int16 over the global bbox ----
    lo = pos.min(axis=0); hi = pos.max(axis=0)
    span = np.maximum(hi - lo, 1e-9)
    q = np.round((pos - lo) / span * 65534.0 - 32767.0).astype(np.int16)
    nq = np.round(np.clip(nrm, -1, 1) * 127.0).astype(np.int8)

    header = {
        'format': 'r2m1',
        'source': [os.path.basename(s['path']) for s in sources],
        'unit': 'm', 'up': 'Y', 'front': '-Z',
        'note': 'positions quantised int16 over bbox; decode p = lo + (q+32767)/65534*span',
        'bboxLo': [float(v) for v in lo], 'bboxSpan': [float(v) for v in span],
        'vertexCount': int(pos.shape[0]), 'triCount': int(idx.shape[0] // 3),
        'materials': materials, 'parts': parts,
    }
    print('  rigged %d moving parts' % len(report))
    hj = json.dumps(header, separators=(',', ':')).encode('utf-8')
    # pad so the binary blocks that follow start 4-byte aligned: 4 magic + 4 len + hj
    while (8 + len(hj)) % 4:
        hj += b' '
    with open(out_path, 'wb') as fh:
        fh.write(b'R2M1'); fh.write(struct.pack('<I', len(hj))); fh.write(hj)
        fh.write(q.tobytes()); fh.write(nq.tobytes()); fh.write(idx.tobytes())

    return header, os.path.getsize(out_path)

if __name__ == '__main__':
    up = '/mnt/user-data/uploads/R2D2 Sim'
    srcs = [
        {'path': os.path.join(up, 'Body+MK4+-+Complex.obj'), 'tag': 'body', 'zoff': 0.0},
        {'path': os.path.join(up, 'MK4+Complex+Cut.obj'),    'tag': 'dome', 'zoff': 498.0},
    ]
    for drop, name in ((False, 'r2-mk4-full.r2m'), (True, 'r2-mk4-shell.r2m')):
        print('building %s  (drop_internal=%s)' % (name, drop))
        h, sz = convert(srcs, '/home/claude/r2sim/cad/' + name, drop_internal=drop)
        kinds = {}
        for p in h['parts']:
            kinds[p['kind']] = kinds.get(p['kind'], 0) + p['tris']
        print('  parts %d  verts %d  tris %d  file %.2f MB' % (
            len(h['parts']), h['vertexCount'], h['triCount'], sz / 1e6))
        print('  tris by kind: %s' % ', '.join('%s=%d' % kv for kv in sorted(kinds.items(), key=lambda k: -k[1])))
        print()
