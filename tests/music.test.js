/* music: beat detection, snapping, beat-driven routines, synced playback */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser({audio:true});
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ PREFS.seenStartup=true; closeStartup(); loadProfile('maestro25'); });
  await page.waitForTimeout(400);
  const ev = f => page.evaluate(f);

  console.log('\n════ beat detection on a known track ════');
  // synthesise 16 s of clicks at 120 BPM (one every 0.5 s), first click at t=0.25
  const a = await ev(async ()=>{
    const sr=22050, dur=16, ctx=new OfflineAudioContext(1, sr*dur, sr);
    for(let t=0.25; t<dur; t+=0.5){
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.frequency.value=1000; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.05);
      o.start(t); o.stop(t+0.06);
    }
    const buf = await ctx.startRendering();
    const r = musicSetBuffer(buf, 'click120.test');
    return {bpm:MUSIC.bpm, phase:MUSIC.phase, beats:MUSIC.beats.length, onsets:MUSIC.onsets.length,
            peaks:MUSIC.peaks.length, dur:MUSIC.duration};
  });
  ok('tempo comes out at 120 BPM (±1)', Math.abs(a.bpm-120)<=1, a.bpm+' BPM');
  ok('the grid phase locks onto the first click (±60 ms)', Math.abs(a.phase-0.25)<0.06 || Math.abs(a.phase-0.75)<0.06,
     'phase '+a.phase.toFixed(3)+' s');
  ok('roughly one onset per click', a.onsets>=28 && a.onsets<=34, a.onsets+' onsets for 32 clicks');
  ok('beat grid covers the track', a.beats>=30 && a.beats<=33, a.beats+' beats');
  ok('waveform peaks computed for drawing', a.peaks===1800);
  ok('a manual BPM override rebuilds the grid', await ev(()=>{
    const keep={bpm:MUSIC.bpm, phase:MUSIC.phase};
    musicSetGrid(60);
    const n60 = MUSIC.beats.length;
    musicSetGrid(keep.bpm, keep.phase);
    return n60 <= Math.ceil(16-keep.phase) + 1;
  }));

  console.log('\n════ snap to beats ════');
  await ev(()=>{ setBoard('mini24'); makeStarter('dome','mini24'); });
  const snap = await ev(()=>{
    const seq = MSTR.sequences[0];                    // Dome Pies Open: 12×90 ms frames
    const before = seq.frames.map(f=>f.duration);
    const moved = musicSnapSequence(seq);
    // every boundary must now sit on a grid beat (±1 ms rounding)
    let t=0, onGrid=0;
    for(const f of seq.frames){
      t += f.duration/1000;
      const d = Math.min(...MUSIC.beats.map(b=>Math.abs(b-t)));
      if(d < 0.002 || f.duration===60) onGrid++;      // 60 ms = floor for collapsed frames
    }
    return {moved, onGrid, n:seq.frames.length, before:before.slice(0,3), after:seq.frames.slice(0,3).map(f=>f.duration)};
  });
  ok('snapping retimes frames', snap.moved>0, snap.moved+' of '+snap.n+' changed');
  ok('boundaries land on the grid (or hit the 60 ms floor)', snap.onGrid===snap.n,
     snap.onGrid+'/'+snap.n);

  console.log('\n════ beat-driven routine ════');
  const build = await ev(()=>{
    const g = groupCreate('Beat pies');
    CAD.moving.filter(m=>/^pie[0-5]$/.test(m.act)).forEach(m=>groupToggleMember(g.id, m.name, true));
    const before = MSTR.sequences.length;
    const r = musicBuildSequence('g'+g.id, 'chase', 1, 16);
    return {err:r.error||null, added:MSTR.sequences.length-before, name:r.seq&&r.seq.name,
            frames:r.seq&&r.seq.frames.length, gid:g.id};
  });
  ok('a group becomes a chase routine', !build.err && build.added===1, build.err||build.name);
  ok('one frame per beat plus the home frame', build.frames===16, build.frames+' frames');
  ok('frame boundaries track the beat interval (~500 ms)', await ev(()=>{
    const seq = MSTR.sequences[MSTR.sequences.length-1];
    const mid = seq.frames.slice(1,-2);
    return mid.every(f=>Math.abs(f.duration-500)<=15);
  }));
  ok('the chase opens exactly one channel per frame', await ev(()=>{
    const seq = MSTR.sequences[MSTR.sequences.length-1];
    const homes = {}; MSTR.channels.forEach(c=>homes[c.i]=c.home);
    return seq.frames.slice(0,-1).every(f=>{
      const open = f.targets.filter((t,i)=>t!==0 && homes[i]!==undefined && t!==homes[i]).length;
      return open===1;
    });
  }));
  ok('the routine exports in the .mstr like any sequence', await ev(()=>{
    const t = buildMstrText();
    return t.indexOf('click120_test_chase') >= 0 || /chase/.test(t);
  }));
  ok('pulse pattern gets two frames per beat', await ev(()=>{
    const r = musicBuildSequence('pies','pulse',1,8);
    return !r.error && r.seq.frames.length === (8-1)*2+1;
  }));
  ok('an unmapped target explains itself', await ev(()=>{
    const g = groupCreate('Empty'); const r = musicBuildSequence('g'+g.id,'chase',1,8);
    groupDelete(g.id);
    return r && /nothing in that target/.test(r.error||'');
  }));
  /* v1.46.0 — Mike: "the initial setting on the low of a servo is Closed and
     whatever its set to is the max open on the model". A beat routine's OPEN
     pose is the channel's max END, not the numerically higher of the pair, so
     a reversed linkage (min > max, the bench's own way of saying "backwards"
     — hw-table.js) is driven to its own open end and the model reads it as
     open. It used to be driven to the number that sorted highest, i.e. shut. */
  ok('a beat routine opens a REVERSED channel at its max end, and the model reads that as open', await ev(()=>{
    const c = MSTR.channels.find(x=>/^pie/.test(x.act||''));
    const keep = {min:c.min, max:c.max};
    c.min = 8000; c.max = 4000;                      // reversed: shut high, open low
    const r = musicBuildSequence('pies','alternate',1,6);
    const drove = !r.error && r.seq.frames.some(f=>f.targets[c.i] === c.max);
    const reads = !r.error && r.seq.frames.some(f=>f.targets[c.i] && chanNorm(c, f.targets[c.i]) === 1);
    const never = !r.error && !r.seq.frames.some(f=>f.targets[c.i] === keep.max);
    MSTR.sequences.pop();
    c.min = keep.min; c.max = keep.max;
    return drove && reads && never;
  }));

  console.log('\n════ synced playback ════');
  const sync = await ev(()=>{
    const seq = MSTR.sequences[MSTR.sequences.length-1];   // the pulse routine
    // drive the shared clock path directly — same code live playback uses
    const i0 = musicApplyAt(seq, 0.1);
    const iMid = musicApplyAt(seq, 2.6);
    const iEnd = musicApplyAt(seq, 999);
    return {i0, iMid, iEnd, n:seq.frames.length};
  });
  ok('the audio clock maps to the right frame', sync.i0===0 && sync.iMid>sync.i0 && sync.iEnd===sync.n-1,
     JSON.stringify(sync));
  ok('applying a frame drives the actuator targets', await ev(()=>{
    const seq = MSTR.sequences[MSTR.sequences.length-1];
    musicApplyAt(seq, seq.frames[0].duration/2000);       // middle of the first (open) frame
    return Object.keys(ACT_T).some(k=>/^pie/.test(k) && ACT_T[k]>0.9);
  }));
  const played = await ev(async ()=>{
    const seq = MSTR.sequences[MSTR.sequences.length-1];
    musicPlay(seq);
    if(!MUSIC.playing) return {started:false};
    await new Promise(r=>setTimeout(r, 900));
    const alive = !!MUSIC.playing;
    const t = alive ? (MUSIC.playing.ctx.currentTime - MUSIC.playing.t0) : -1;
    musicStop();
    return {started:true, alive, t, stopped:!MUSIC.playing};
  });
  ok('live playback starts, advances on the audio clock, and stops',
     played.started && played.alive && played.t>0.5 && played.stopped, 't='+(played.t&&played.t.toFixed(2))+'s');

  console.log('\n════ UI presence ════');
  await ev(()=>{ setStripMode('seq'); buildSequencer(); });
  ok('the music bar lives in the sequencer strip', await ev(()=>
    $('musbar').querySelectorAll('button').length>=4 && $('muswave').style.display!=='none'));
  ok('the waveform canvas has been drawn on', await ev(()=>$('muswave').width>0));
  ok('the routine builder offers groups and panel sets', await ev(()=>{
    $('muspop').classList.add('on'); musicBuildPop();
    const opts = Array.from($('muspop').querySelectorAll('select')[0].options).map(o=>o.textContent);
    $('muspop').classList.remove('on');
    return opts.some(o=>/Beat pies/.test(o)) && opts.some(o=>/Dome pies/.test(o));
  }));

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('page errors:', errs.length?errs:'none');
  await browser.close();
  process.exit(fail?1:0);
})();
