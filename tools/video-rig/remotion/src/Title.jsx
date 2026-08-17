import React from 'react';
import { AbsoluteFill, Img, staticFile, interpolate, useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { T } from './theme.js';
import { Grid } from './bits.jsx';

export const Title = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bgIn = interpolate(f, [0, 30], [0, 0.28], { extrapolateRight: 'clamp' });
  const s1 = spring({ frame: f - 12, fps, config: { damping: 200 } });
  const s2 = spring({ frame: f - 34, fps, config: { damping: 200 } });
  const s3 = spring({ frame: f - 56, fps, config: { damping: 200 } });
  const typedN = Math.max(0, Math.floor((f - 12) * 1.35));
  const name = 'R2-D2 ASTROMECH SIMULATOR';
  const shown = name.slice(0, typedN);
  const caret = typedN <= name.length && f % 16 < 9;
  return (
    <AbsoluteFill style={{ background: T.bg }}>
      <AbsoluteFill style={{ opacity: bgIn, filter: 'blur(6px) saturate(0.8)' }}>
        <Img src={staticFile('drive_studio.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 42%, rgba(14,19,25,0.25), rgba(14,19,25,0.95) 78%)' }} />
      <Grid opacity={0.35} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: T.mono, fontSize: 25, letterSpacing: '0.42em', color: T.cyan,
            opacity: s1, marginBottom: 30, textTransform: 'uppercase',
          }}>
            De-risk the droid before you wire it
          </div>
          <div style={{
            fontFamily: T.mono, fontWeight: 700, fontSize: 84, letterSpacing: '0.06em',
            color: T.text, minHeight: 110,
          }}>
            {shown}<span style={{ opacity: caret ? 1 : 0, color: T.ctaHi }}>▌</span>
          </div>
          <div style={{
            fontFamily: T.sans, fontSize: 31, color: T.dim, marginTop: 26, opacity: s2,
          }}>
            Three real firmware sketches · a model of the real hardware · the real CAD
          </div>
          <div style={{ marginTop: 44, opacity: s3, display: 'flex', gap: 18, justifyContent: 'center' }}>
            {['v1.18.0', '908 TESTS', 'ONE HTML FILE'].map(t => (
              <span key={t} style={{
                fontFamily: T.mono, fontSize: 20, letterSpacing: '0.12em', color: T.text,
                border: `1px solid ${T.edge}`, borderRadius: 3, padding: '9px 16px',
                background: 'rgba(62,111,196,0.16)',
              }}>{t}</span>
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
