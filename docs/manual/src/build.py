#!/usr/bin/env python3
"""Assemble the builder's manual.

Encodes each captured burst twice (VP9 webm + H.264 mp4 — see the README for
why both), resizes the stills, and inlines every asset as a data: URI so the
manual is one self-contained file that opens offline.

    python3 docs/manual/src/build.py

Reads frames from <repo>/captures/<name>/f####.jpg, which is where
tools/video-rig/cap_docs.js puts them. Override with R2_CAPTURES.
"""
import base64, os, re, subprocess, sys

SRC  = os.path.dirname(os.path.abspath(__file__))     # docs/manual/src
MAN  = os.path.dirname(SRC)                           # docs/manual
ROOT = os.path.dirname(os.path.dirname(MAN))          # the repo
CAP  = os.environ.get('R2_CAPTURES') or os.path.join(ROOT, 'captures')
MED  = os.path.join(MAN, 'media')
OUT  = os.path.join(MAN, 'R2D2-Simulator-Manual.html')

CLIPS = {                      # name -> playback fps
    'setup':  18,
    'drive':  20,
    'bench':  20,
    'bricks': 20,
    'domemap': 18,
    'import': 16,
    'slots': 16,
}
WIDTH = 1180                   # everything is normalised to this width

def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(' '.join(cmd[:6]), '...\n', r.stderr[-1500:])
        raise SystemExit(1)

def encode_clips():
    os.makedirs(MED, exist_ok=True)
    for name, fps in CLIPS.items():
        src = os.path.join(CAP, name)
        if not os.path.isdir(src):
            print('  ! no frames for', name); continue
        mp4 = os.path.join(MED, name + '.mp4')
        webm = os.path.join(MED, name + '.webm')
        sh(['ffmpeg', '-y', '-loglevel', 'error',
            '-framerate', str(fps), '-i', os.path.join(src, 'f%04d.jpg'),
            '-vf', f'scale={WIDTH}:-2:flags=lanczos',
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4])
        # VP9 as well: Chromium builds without proprietary codecs cannot
        # decode H.264, and the manual has to play wherever it is opened.
        sh(['ffmpeg', '-y', '-loglevel', 'error',
            '-framerate', str(fps), '-i', os.path.join(src, 'f%04d.jpg'),
            '-vf', f'scale={WIDTH}:-2:flags=lanczos',
            '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0',
            '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
            '-pix_fmt', 'yuv420p', '-an', webm])
        print('  clip %-8s %4d frames   webm %6.1f KB   mp4 %6.1f KB' %
              (name, len(os.listdir(src)), os.path.getsize(webm)/1024,
               os.path.getsize(mp4)/1024))

def prep_img(rel, out_name):
    """rel is a path under captures/; returns the media path."""
    src = os.path.join(CAP, rel)
    dst = os.path.join(MED, out_name + '.jpg')
    sh(['ffmpeg', '-y', '-loglevel', 'error', '-i', src,
        '-vf', f'scale={WIDTH}:-2:flags=lanczos', '-q:v', '5', dst])
    return dst

def data_uri(path, mime):
    with open(path, 'rb') as f:
        return 'data:%s;base64,%s' % (mime, base64.b64encode(f.read()).decode())

IMAGES = {           # placeholder name -> source under captures/
    'wizmodel':  'wiz/wiz00-model.jpg',
    'wizservos': 'wiz/wiz03-servos.jpg',
    'servoset':  'wiz/wiz09-servoSet.jpg',
    'panels':    'wiz/wiz11-panels.jpg',
    'drive':     'ws/00-drive.jpg',
    'seq':       'ws/ws-seq.jpg',
    'board':     'ws/ws-bench.jpg',
    'channels':  'x/bench-pre.jpg',
    'dial':      'x/dialview.jpg',
    'jobwiz':    'x/jobwiz.jpg',
    'learn':     'x/learn.jpg',
    'track':     'x/track.jpg',
    'keys':      'ws/kbd.jpg',
}

def main():
    print('encoding clips…')
    encode_clips()
    print('preparing stills…')
    stills = {}
    for name, rel in IMAGES.items():
        if os.path.exists(os.path.join(CAP, rel)):
            stills[name] = prep_img(rel, 'img-' + name)
        else:
            print('  ! missing', rel)

    html = ''.join(open(os.path.join(SRC, f)).read()
                   for f in ('head.html', 'body1.html', 'body2.html',
                             'body3.html', 'body4.html'))

    def clip_sub(m):
        name, cap = m.group(1), ' '.join(m.group(2).split())
        webm = os.path.join(MED, name + '.webm')
        mp4 = os.path.join(MED, name + '.mp4')
        if not os.path.exists(mp4):
            return '<!-- missing clip %s -->' % name
        srcs = ''
        if os.path.exists(webm):
            srcs += '<source type="video/webm" src="%s">' % data_uri(webm, 'video/webm')
        srcs += '<source type="video/mp4" src="%s">' % data_uri(mp4, 'video/mp4')
        return ('<figure><video autoplay muted loop playsinline controls '
                'preload="metadata">%s</video>'
                '<figcaption><b>Clip.</b> %s</figcaption></figure>'
                % (srcs, cap))

    def img_sub(m):
        name, cap = m.group(1), ' '.join(m.group(2).split())
        p = stills.get(name)
        if not p:
            return '<!-- missing image %s -->' % name
        return ('<figure><img alt="%s" src="%s">'
                '<figcaption>%s</figcaption></figure>'
                % (re.sub('<[^>]+>', '', cap)[:120], data_uri(p, 'image/jpeg'), cap))

    html = re.sub(r'\{\{CLIP:([a-z0-9_-]+)\|(.*?)\}\}', clip_sub, html, flags=re.S)
    html = re.sub(r'\{\{IMG:([a-z0-9_-]+)\|(.*?)\}\}', img_sub, html, flags=re.S)

    left = re.findall(r'\{\{[A-Z]+:[^}]+\}\}', html)
    if left:
        print('  ! unresolved placeholders:', left[:5]); raise SystemExit(1)

    with open(OUT, 'w') as f:
        f.write(html)
    print('\nwrote %s  (%.1f MB)' % (OUT, os.path.getsize(OUT) / 1e6))

if __name__ == '__main__':
    main()
