import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from 'remotion';
import { T } from './theme.js';
import { KenBurns, Burst, Caption, VersionChip, EdgeFade } from './bits.jsx';
import { Title } from './Title.jsx';
import { Outro } from './Outro.jsx';

/* ---- burst frame counts (from the capture run) ---- */
import { COUNTS } from './assets.js';

/* big mono workspace label used in the four-way montage */
const WsLabel = ({ text }) => {
  const f = useCurrentFrame();
  const inA = interpolate(f, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-start', pointerEvents: 'none' }}>
      <div style={{
        margin: '120px 0 0 64px', opacity: inA,
        fontFamily: T.mono, fontSize: 58, fontWeight: 700, letterSpacing: '0.22em',
        color: T.text, background: 'rgba(13,18,25,0.78)', border: `1px solid ${T.edge}`,
        borderLeft: `4px solid ${T.cta}`, padding: '16px 30px', borderRadius: 3,
      }}>{text}</div>
    </AbsoluteFill>
  );
};

/* segment layout: [key, dur, element-builder] */
const SEGS = [];
const add = (key, dur, build) => SEGS.push({ key, dur, build });

add('title', 205, d => <Title dur={d} />);

add('orbit', 215, d => (<>
  <Burst dir="orbit" count={COUNTS.orbit} rate={15} pingpong />
  <Caption dur={d} kicker="The droid" title="The real MK4 CAD on stage — 36 rigged parts"
    sub="MrBaddeley's Printed Droid MK4, decoded and driven live" />
</>));

add('dome', 260, d => (<>
  <Burst dir="dome" count={COUNTS.dome} rate={15} />
  <Caption dur={d} kicker="Real firmware, real motion" title="Dome, pie panels, utility arms, holoprojectors"
    sub="Three Arduino sketches ported statement-for-statement — the pad, the keys or the real Xbox controller" />
</>));

add('wizard', 300, d => (<>
  <Sequence from={0} durationInFrames={100}><KenBurns src="wiz_1_controller.jpg" dur={100} to={1.04} /></Sequence>
  <Sequence from={100} durationInFrames={100}><KenBurns src="wiz_2_foot.jpg" dur={100} to={1.04} /></Sequence>
  <Sequence from={200} durationInFrames={100}><KenBurns src="wiz_3_wiring.jpg" dur={100} to={1.04} /></Sequence>
  <Caption dur={d} kicker="Guided build setup" title="Answer the nine hardware questions — the sim configures itself"
    sub="Firmware, boards, pins and wiring all derive from what is actually bolted in" wide />
</>));

add('workspaces', 240, d => (<>
  <Sequence from={0} durationInFrames={60}><KenBurns src="drive_studio.jpg" dur={60} to={1.02} /><WsLabel text="DRIVE" /></Sequence>
  <Sequence from={60} durationInFrames={60}><KenBurns src="seq_wave.jpg" dur={60} to={1.02} /><WsLabel text="SEQUENCE" /></Sequence>
  <Sequence from={120} durationInFrames={60}><KenBurns src="config_tab.jpg" dur={60} to={1.02} /><WsLabel text="CONFIGURE" /></Sequence>
  <Sequence from={180} durationInFrames={60}><KenBurns src="bench_maestro.jpg" dur={60} to={1.02} /><WsLabel text="BENCH" /></Sequence>
  <Caption dur={d} kicker="One header" title="Four workspaces — the one answer to “where am I?”" />
</>));

add('sequencer', 330, d => (<>
  <Burst dir="seq" count={COUNTS.seq} rate={15} />
  <Caption dur={d} kicker="The brick sequencer" title="Drag bricks, snap to beats — a Mexican wave in one click"
    sub="Undo, per-part colours, playhead scrub — and it compiles to a real Maestro script" wide />
</>));

add('bench', 285, d => (<>
  <Sequence from={0} durationInFrames={105}><KenBurns src="bench_maestro.jpg" dur={105} to={1.03} /></Sequence>
  <Sequence from={105} durationInFrames={90}><KenBurns src="bench_outputs.jpg" dur={90} to={1.03} /></Sequence>
  <Sequence from={195} durationInFrames={90}><KenBurns src="bench_serial.jpg" dur={90} to={1.03} /></Sequence>
  <Caption dur={d} kicker="The bench" title="Channel tables, live outputs, the serial console"
    sub="It has already caught real firmware bugs — before anything was wired" wide />
</>));

add('envs', 235, d => (<>
  <Sequence from={0} durationInFrames={80}><KenBurns src="env_workshop.jpg" dur={80} to={1.05} dx={-8} /></Sequence>
  <Sequence from={80} durationInFrames={80}><KenBurns src="env_desert.jpg" dur={80} to={1.05} dx={8} /></Sequence>
  <Sequence from={160} durationInFrames={75}><KenBurns src="env_hangar.jpg" dur={75} to={1.05} dy={-6} /></Sequence>
  <Caption dur={d} kicker="Somewhere to stand" title="Four procedural environments — workshop, desert flats, hangar bay"
    sub="All generated in code: the single HTML file ships no assets" wide />
</>));

add('track', 245, d => (<>
  <Burst dir="track" count={COUNTS.track} rate={15} />
  <Caption dur={d} kicker="Practice circuit" title="Barriers, sector gates and per-lap timing"
    sub="Learn the sticks before the real droid is under you" />
</>));

add('friends', 300, d => (<>
  <Sequence from={0} durationInFrames={150}>
    <Burst dir="anz" count={COUNTS.anz} rate={15} />
    <Caption dur={150} kicker="Also on the stage" title="The Anzellan puppet head — an 11-channel face rig" />
  </Sequence>
  <Sequence from={150} durationInFrames={150}>
    <Burst dir="mouse" count={COUNTS.mouse} rate={15} />
    <Caption dur={150} kicker="Also on the stage" title="The Polar Mouse — Ackermann steering, towing its chariot" />
  </Sequence>
</>));

add('learn', 185, d => (<>
  <KenBurns src="learn.jpg" dur={d} to={1.04} />
  <Caption dur={d} kicker="Lessons" title="It teaches you to operate your droid"
    sub="Every task is checked off the droid's real state — not your keypresses" />
</>));

add('outro', 300, d => <Outro dur={d} />);

export const TOTAL = SEGS.reduce((a, s) => a + s.dur, 0);

export const Main = () => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: T.bg }}>
      {SEGS.map(s => {
        const from = at; at += s.dur;
        return (
          <Sequence key={s.key} from={from} durationInFrames={s.dur}>
            {s.build(s.dur)}
          </Sequence>
        );
      })}
      <Sequence from={205} durationInFrames={TOTAL - 505}><VersionChip /></Sequence>
      <EdgeFade dur={TOTAL} />
    </AbsoluteFill>
  );
};
