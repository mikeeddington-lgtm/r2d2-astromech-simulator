#!/usr/bin/env python3
"""Cut the single <style> block into per-area stylesheets, and pull the
markup out into its own fragment. Line-for-line: nothing is rewritten."""
import os

src = open('parts/01_head.html', encoding='utf-8').read().split('\n')
i0 = src.index('<style>') + 1
i1 = src.index('</style>')
css = src[i0:i1]                       # 1-based line n  ->  css[n - i0 - 1]
def at(n): return n - i0 - 1           # original file line number -> css index

CUTS = [
  ('01-tokens.css',   at(8),   at(51),  'Colour and type tokens. Both themes live here and nowhere else:\n   every other stylesheet uses var(--x), so a re-skin is a one-file change.'),
  ('02-layout.css',   at(51),  at(116), 'App shell: header, the main grid, the stage and its HUD overlays.'),
  ('03-pad.css',      at(116), at(208), 'The controller strip along the bottom — pad stage, key list, sequencer.'),
  ('04-sidebar.css',  at(208), at(268), 'Right-hand sidebar: tabs, panes, the servo table and the console.'),
  ('05-controls.css', at(268), at(328), 'Buttons, inputs, hints and notes — the generic widgets, plus the sound box.'),
  ('06-theme-light.css', at(328), at(352), 'Light theme. Only re-points the tokens from 01 plus a few one-offs.'),
  ('07-startup.css',  at(352), at(i1+1),  'Header buttons, the setup overlay, colour swatches and the Maestro\n   channel-mapping rows.'),
]
os.makedirs('src/css', exist_ok=True)
total = 0
for name, a, b, note in CUTS:
    chunk = css[a:b]
    while chunk and not chunk[0].strip(): chunk.pop(0)
    while chunk and not chunk[-1].strip(): chunk.pop()
    open('src/css/'+name, 'w', encoding='utf-8').write('/* ' + note + ' */\n' + '\n'.join(chunk) + '\n')
    total += len([l for l in chunk if l.strip()])
    print(f'{len(chunk):5d}  src/css/{name}')

orig = len([l for l in css if l.strip()])
print(f'\ncss lines {orig} in / {total} out — ' + ('BALANCED' if orig==total else 'MISMATCH'))

# ---- markup: everything from <body> onwards in 01, plus all of 02 ----
b0 = src.index('<body>')
head_tail = src[b0:]                    # <body>, <div id="app">
body = open('parts/02_body.html', encoding='utf-8').read().split('\n')
os.makedirs('src/html', exist_ok=True)
open('src/html/body.html','w',encoding='utf-8').write('\n'.join(head_tail[2:] + body).rstrip()+'\n')
print(f'{len(head_tail[2:])+len(body):5d}  src/html/body.html')
