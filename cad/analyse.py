#!/usr/bin/env python3
"""Inspect a Fusion/ATF-exported OBJ: per-group face counts, bounds, centroids, materials."""
import sys, os, math, re, json
from collections import OrderedDict

def parse_obj(path):
    verts = []            # (x,y,z)
    groups = OrderedDict()  # name -> {'faces':[(i,i,i)...], 'mtls':set()}
    cur = None
    curmtl = None
    with open(path, 'r', errors='replace') as fh:
        for line in fh:
            if not line: continue
            c = line[0]
            if c == 'v' and line[1] == ' ':
                p = line.split()
                verts.append((float(p[1]), float(p[2]), float(p[3])))
            elif c == 'g' or (c == 'o' and line[1] == ' '):
                name = line[2:].strip() or ('group%d' % len(groups))
                if name not in groups:
                    groups[name] = {'faces': [], 'mtls': set()}
                cur = name
            elif c == 'u' and line.startswith('usemtl'):
                curmtl = line.split(None, 1)[1].strip() if len(line.split(None, 1)) > 1 else ''
                if cur is not None:
                    groups[cur]['mtls'].add(curmtl)
            elif c == 'f' and line[1] == ' ':
                if cur is None:
                    cur = '__root__'
                    groups.setdefault(cur, {'faces': [], 'mtls': set()})
                idx = []
                for tok in line.split()[1:]:
                    v = tok.split('/')[0]
                    n = int(v)
                    idx.append(n - 1 if n > 0 else len(verts) + n)
                for k in range(1, len(idx) - 1):     # fan-triangulate
                    groups[cur]['faces'].append((idx[0], idx[k], idx[k + 1]))
    return verts, groups

def base_name(n):
    """Fusion appends ' (1) (2)' to duplicated bodies — strip all of it."""
    return re.sub(r'(\s*\(\d+\))+$', '', n).strip()

def analyse(path):
    verts, groups = parse_obj(path)
    allx = [v[0] for v in verts]; ally = [v[1] for v in verts]; allz = [v[2] for v in verts]
    print('=' * 78)
    print(os.path.basename(path))
    print('  vertices %d   groups %d   triangles %d' % (
        len(verts), len(groups), sum(len(g['faces']) for g in groups.values())))
    print('  bounds  X %.1f .. %.1f   Y %.1f .. %.1f   Z %.1f .. %.1f  (mm)' % (
        min(allx), max(allx), min(ally), max(ally), min(allz), max(allz)))
    print('  size    %.1f x %.1f x %.1f mm' % (
        max(allx) - min(allx), max(ally) - min(ally), max(allz) - min(allz)))

    rows = []
    for name, g in groups.items():
        vi = set()
        for f in g['faces']:
            vi.update(f)
        if not vi:
            continue
        xs = [verts[i][0] for i in vi]; ys = [verts[i][1] for i in vi]; zs = [verts[i][2] for i in vi]
        cx, cy, cz = sum(xs) / len(xs), sum(ys) / len(ys), sum(zs) / len(zs)
        rows.append({
            'name': name, 'base': base_name(name), 'tris': len(g['faces']),
            'cx': cx, 'cy': cy, 'cz': cz,
            'x0': min(xs), 'x1': max(xs), 'y0': min(ys), 'y1': max(ys), 'z0': min(zs), 'z1': max(zs),
            'r': math.hypot(cx, cy), 'az': math.degrees(math.atan2(cy, cx)) % 360,
            'mtl': sorted(g['mtls']),
        })

    fam = OrderedDict()
    for r in rows:
        fam.setdefault(r['base'], []).append(r)
    print('\n  families (base name → count, total tris):')
    for b, lst in sorted(fam.items(), key=lambda kv: -sum(x['tris'] for x in kv[1])):
        print('    %-26s n=%-3d tris=%-7d  z %.0f..%.0f  r %.0f..%.0f' % (
            b, len(lst), sum(x['tris'] for x in lst),
            min(x['z0'] for x in lst), max(x['z1'] for x in lst),
            min(x['r'] for x in lst), max(x['r'] for x in lst)))
    return rows, fam, verts, groups

if __name__ == '__main__':
    out = {}
    for p in sys.argv[1:]:
        rows, fam, verts, groups = analyse(p)
        out[os.path.basename(p)] = rows
    with open('/home/claude/r2sim/cad/groups.json', 'w') as fh:
        json.dump(out, fh)
    print('\nwrote groups.json')
