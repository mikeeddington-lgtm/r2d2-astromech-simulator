#!/usr/bin/env python3
"""Slice the old parts/* files into src/ modules at declaration boundaries.

Each entry is (dest, anchor-regex). The splitter finds the anchor line, then
walks backwards over the contiguous comment/blank block above it so a function
keeps its own doc comment. Everything before the first anchor stays in the
first dest. Line counts are checked at the end -- nothing may go missing.
"""
import os, re, sys

SPEC = {
 'parts/03_core.js': [
   ('js/core/util.js',            r'^const map_'),
   ('js/core/actuators.js',       r"^const ACT_KEYS"),
   ('js/core/servos.js',          r'^const SERVO_DEFS'),
   ('js/core/motors.js',          r'^const MOT'),
   ('js/core/audio.js',           r'^const SND'),
   ('js/core/anims.js',           r'^const ANIMS'),
   ('js/core/maestro-runtime.js', r'^const MAESTRO ='),
   ('js/core/xbox.js',            r'^const XB'),
   ('js/core/firmware.js',        r'^const FW'),
 ],
 'parts/03b_profiles.js': [
   ('js/profiles/mod2026.js',        r'^const PROFILE_MOD2026'),
   ('js/profiles/maestro-shared.js', r'^const MAESTRO_MAP'),
   ('js/profiles/maestro-sketches.js', r'^const PROFILE_MAESTRO_PWM'),
   ('js/profiles/registry.js',       r'^const PROFILES'),
 ],
 'parts/04_input.js': [
   ('js/input/gamepad.js', r'^const INPUT'),
   ('js/input/pad-ui.js',  r'^const svg'),
 ],
 'parts/05_model.js': [
   ('js/scene/droid-proc.js', r'^const V3'),
   ('js/scene/scene.js',      r'^let renderer, scene'),
   ('js/scene/camera.js',     r'^function bindCamera'),
 ],
 'parts/05b_maestro.js': [
   ('js/maestro/boards.js',   r'^const MAESTRO_BOARDS'),
   ('js/maestro/import.js',   r'^function frameChannelsFromName'),
   ('js/maestro/export.js',   r'^function frameSubName'),
   ('js/maestro/starters.js', r'^const STARTER_BODY'),
   ('js/maestro/playback.js', r'^function chanNorm'),
 ],
 'parts/05c_maestro_ui.js': [
   ('js/maestro/ui-pane.js',      r'^function buildMaestroPane'),
   ('js/maestro/ui-sequencer.js', r'^function setStripMode'),
   ('js/maestro/ui-files.js',     r'^let dragDepth'),
 ],
 'parts/05d_cad.js': [
   ('js/cad/decode.js',  r'^const CAD ='),
   ('js/cad/build.js',   r'^function cadMaterial'),
   ('js/cad/runtime.js', r'^const _cadAxis'),
 ],
 'parts/05e_cad_ui.js': [
   ('js/cad/ui.js', r'^const CAD_ACT_CHOICES'),
 ],
 'parts/05f_theme_paint.js': [
   ('js/look/prefs.js',   r'^const STORE_KEY'),
   ('js/look/theme.js',   r'^const THEME_3D'),
   ('js/look/paint.js',   r'^const PAINT_ROLES'),
   ('js/look/startup.js', r'^function buildStartup'),
 ],
 'parts/06_anim_ui.js': [
   ('js/app/animate.js', r'^let blinkT'),
   ('js/app/panels.js',  r'^function kvRow'),
   ('js/app/hud.js',     r'^const FILT\b'),
   ('js/app/main.js',    r'^let camIdx'),
 ],
}

def body_lines(path):
    """drop the <script> wrapper and the file-level 'use strict'"""
    out = []
    for ln in open(path, encoding='utf-8').read().split('\n'):
        s = ln.strip()
        if s in ('<script>', '</script>', '"use strict";', "'use strict';"):
            continue
        out.append(ln)
    while out and not out[0].strip(): out.pop(0)
    while out and not out[-1].strip(): out.pop()
    return out

def find_anchor(lines, rx, frm):
    pat = re.compile(rx)
    for i in range(frm, len(lines)):
        if pat.match(lines[i]):
            # walk back over the contiguous comment / blank block
            j = i
            while j > frm:
                p = lines[j-1].strip()
                if p == '' or p.startswith('//') or p.startswith('/*') or p.startswith('*'):
                    j -= 1
                else:
                    break
            # do not swallow a trailing blank run that belongs to nobody
            while j < i and lines[j].strip() == '': j += 1
            return j
    raise SystemExit('anchor not found: ' + rx)

total_in = total_out = 0
written = []
for src, entries in SPEC.items():
    lines = body_lines(src)
    total_in += len(lines)
    cuts = []
    at = 0
    for dest, rx in entries:
        at = find_anchor(lines, rx, at)
        cuts.append((at, dest))
        at += 1
    # everything above the first anchor is the file preamble -> first dest
    cuts[0] = (0, cuts[0][1])
    for k, (start, dest) in enumerate(cuts):
        end = cuts[k+1][0] if k+1 < len(cuts) else len(lines)
        chunk = lines[start:end]
        while chunk and not chunk[-1].strip(): chunk.pop()
        p = os.path.join('src', dest)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write("'use strict';\n" + '\n'.join(chunk) + '\n')
        total_out += len(chunk)
        written.append((p, len(chunk)))

for p, n in written:
    print(f'{n:5d}  {p}')
print(f'\n{len(written)} modules · {total_in} lines in · {total_out} lines out · '
      + ('BALANCED' if total_in == total_out else f'LOST {total_in-total_out}'))
