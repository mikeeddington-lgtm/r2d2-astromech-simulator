import React from 'react';
import { AbsoluteFill, Img, staticFile, interpolate, useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { T } from './theme.js';
import { Grid } from './bits.jsx';

const STATS = [
  { n: 68, label: 'JS MODULES' },
  { n: 908, label: 'TESTS PASSING' },
  { n: 3, label: 'REAL FIRMWARES' },
  { n: 4, label: 'MAESTRO BOARDS' },
  { n: 1, label: 'SELF-CONTAINED HTML FILE' },
];

export const Outro = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: T.bg }}>
      <AbsoluteFill style={{ opacity: 0.16, filter: 'blur(8px)' }}>
        <Img src={staticFile('env_hangar.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <Grid opacity={0.3} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 26, marginBottom: 70 }}>
          {STATS.map((s, i) => {
            const sp = spring({ frame: f - 8 - i * 9, fps, config: { damping: 200 } });
            const count = Math.round(interpolate(
              Math.min(f - 8 - i * 9, 45), [0, 45], [0, s.n],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            ));
            return (
              <div key={s.label} style={{
                opacity: sp, transform: `translateY(${(1 - sp) * 30}px)`,
                border: `1px solid ${T.edge}`, borderTop: `3px solid ${T.cta}`,
                background: 'rgba(21,28,37,0.85)', borderRadius: 3,
                padding: '30px 34px', minWidth: 218, textAlign: 'center',
              }}>
                <div style={{ fontFamily: T.mono, fontSize: 64, fontWeight: 700, color: T.cyan }}>{count}</div>
                <div style={{ fontFamily: T.mono, fontSize: 16.5, letterSpacing: '0.14em', color: T.dim, marginTop: 10 }}>
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{
          opacity: spring({ frame: f - 62, fps, config: { damping: 200 } }),
          fontFamily: T.mono, fontSize: 44, fontWeight: 700, letterSpacing: '0.08em', color: T.text,
        }}>
          R2-D2 ASTROMECH SIMULATOR
        </div>
        <div style={{
          opacity: spring({ frame: f - 76, fps, config: { damping: 200 } }),
          fontFamily: T.sans, fontSize: 27, color: T.dim, marginTop: 18,
        }}>
          Shake out the wiring, the endpoints and the firmware — before the smoke can get out.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
