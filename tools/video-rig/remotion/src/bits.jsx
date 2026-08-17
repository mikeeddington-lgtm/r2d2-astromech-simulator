import React from 'react';
import { AbsoluteFill, Img, staticFile, interpolate, useCurrentFrame } from 'remotion';
import { T } from './theme.js';

/* full-bleed still with a slow Ken Burns drift */
export const KenBurns = ({ src, dur, from = 1.0, to = 1.06, dx = 0, dy = 0 }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, dur], [from, to], { extrapolateRight: 'clamp' });
  const x = interpolate(f, [0, dur], [0, dx], { extrapolateRight: 'clamp' });
  const y = interpolate(f, [0, dur], [0, dy], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: T.bg, overflow: 'hidden' }}>
      <Img src={staticFile(src)} style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${s}) translate(${x}px,${y}px)`,
      }} />
    </AbsoluteFill>
  );
};

/* captured image sequence, played at `rate` fps inside a 30fps comp.
   pingpong: forward then backward, forever (orbit shots). */
export const Burst = ({ dir, count, rate = 20, hold = true, pingpong = false, scale = 1.0 }) => {
  const f = useCurrentFrame();
  let i = Math.floor((f * rate) / 30);
  if (pingpong) {
    const cycle = 2 * count - 2;
    i = i % cycle;
    if (i >= count) i = cycle - i;
  } else if (i >= count) i = hold ? count - 1 : i % count;
  const name = `${dir}/f${String(i).padStart(4, '0')}.jpg`;
  return (
    <AbsoluteFill style={{ background: T.bg, overflow: 'hidden' }}>
      <Img src={staticFile(name)} style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: scale !== 1 ? `scale(${scale})` : undefined,
      }} />
    </AbsoluteFill>
  );
};

/* lower-third caption in the console's own voice */
export const Caption = ({ kicker, title, sub, dur, wide = false }) => {
  const f = useCurrentFrame();
  const inA = interpolate(f, [4, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(f, [4, 16], [26, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const out = interpolate(f, [dur - 10, dur - 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-start', pointerEvents: 'none' }}>
      <div style={{
        margin: '0 0 64px 64px', maxWidth: wide ? 1400 : 980,
        opacity: inA * out, transform: `translateY(${y}px)`,
        background: T.plate, border: `1px solid ${T.edge}`, borderLeft: `3px solid ${T.cta}`,
        padding: '22px 30px 24px', backdropFilter: 'blur(6px)', borderRadius: 3,
      }}>
        {kicker && <div style={{
          fontFamily: T.mono, fontSize: 21, letterSpacing: '0.18em', color: T.cyan,
          textTransform: 'uppercase', marginBottom: 8,
        }}>{kicker}</div>}
        <div style={{ fontFamily: T.sans, fontSize: 40, fontWeight: 600, color: T.text, lineHeight: 1.22 }}>
          {title}
        </div>
        {sub && <div style={{ fontFamily: T.sans, fontSize: 26, color: T.dim, marginTop: 8, lineHeight: 1.4 }}>
          {sub}
        </div>}
      </div>
    </AbsoluteFill>
  );
};

/* small persistent version chip, bottom right */
export const VersionChip = () => (
  <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-end', pointerEvents: 'none' }}>
    <div style={{
      margin: '0 28px 24px 0', fontFamily: T.mono, fontSize: 17, letterSpacing: '0.1em',
      color: T.dim, background: 'rgba(13,18,25,0.6)', border: `1px solid ${T.edge}`,
      padding: '6px 12px', borderRadius: 3,
    }}>
      v1.18.0&ensp;·&ensp;908 TESTS PASSING
    </div>
  </AbsoluteFill>
);

/* fade from/to black at the very ends of the film */
export const EdgeFade = ({ dur, inLen = 15, outLen = 20 }) => {
  const f = useCurrentFrame();
  const o = Math.max(
    interpolate(f, [0, inLen], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(f, [dur - outLen, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  return <AbsoluteFill style={{ background: '#000', opacity: o, pointerEvents: 'none' }} />;
};

/* faint blueprint grid for the graphics cards */
export const Grid = ({ opacity = 0.5 }) => (
  <AbsoluteFill style={{
    opacity,
    backgroundImage:
      `linear-gradient(${T.edge}22 1px, transparent 1px), linear-gradient(90deg, ${T.edge}22 1px, transparent 1px)`,
    backgroundSize: '72px 72px',
  }} />
);
