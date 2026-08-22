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
  /* "open" is the channel's OPEN END, asked for directly. This used to count
     any target that differed from `c.home`, which only worked while the
     builder's shut pose WAS c.home — the bug below. A resting pose is now
     chanRest()'s answer (a door shut, a bipolar actuator centred), so it no
     longer equals home on every channel and a proxy for open has to stop
     being "not home". */
  ok('the chase opens exactly one channel per frame', await ev(()=>{
    const seq = MSTR.sequences[MSTR.sequences.length-1];
    return seq.frames.slice(0,-1).every(f=>{
      const open = f.targets.filter((t,i)=>{
        const c = MSTR.channels[i];
        return t!==0 && c && t===chanEnds(c).open;
      }).length;
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
    /* The old bug drove this panel to 8000 and CALLED that open. 8000 is now
       a pose the routine legitimately writes — it is the shut end once the
       pair is reversed — so what must never happen is 8000 being the OPEN
       pose. Every target the routine writes is one of the two ends, and the
       model reads each one as the end it actually is. */
    const never = !r.error && r.seq.frames.every(f=>{
      const t = f.targets[c.i];
      if(!t) return true;
      if(t === c.max) return chanNorm(c, t) === 1;
      return t === c.min && chanNorm(c, t) === 0;      // c.min is keep.max, 8000, now the shut end
    });
    MSTR.sequences.pop();
    c.min = keep.min; c.max = keep.max;
    return drove && reads && never;
  }));
  /* The OTHER half of the same v1.46.0 rule, which the travel work left
     behind: a routine's SHUT pose is the channel's shut END, not `c.home`.
     Tick `inv` on a starter channel (min 4000 / max 8000 / home 4000) and the
     pane swaps the pair to min 8000 / max 4000 — the home number is now the
     OPEN end, so a builder who reverses one linkage gets a panel that starts
     open and never moves, because the routine's "open" and "close" poses are
     the same 4000. The two poses must differ, and beat 0 must find every
     channel it is not opening sitting shut. */
  ok('a REVERSED channel closes to its shut end, not to c.home', await ev(()=>{
    const pies = Array.from({length:PIE_COUNT},(_,i)=>'pie'+i)
                      .map(a=>MSTR.channels.find(x=>x.act===a)).filter(Boolean);
    const c = pies[1];                               // not the one beat 0 opens
    const keep = {min:c.min, max:c.max, home:c.home};
    const t=c.min; c.min=c.max; c.max=t;             // exactly what the pane's inv tick does
    const r = musicBuildSequence('pies','chase',1,8);
    const ends = {shut:c.min, open:c.max};
    const frames = r.error ? [] : r.seq.frames;
    const differ  = !r.error && ends.open !== ends.shut
                 && frames.some(f=>f.targets[c.i]===ends.open)
                 && frames.some(f=>f.targets[c.i]===ends.shut);
    const startsShut = !r.error && frames[0].targets[c.i] === ends.shut;
    if(!r.error) MSTR.sequences.pop();
    c.min=keep.min; c.max=keep.max; c.home=keep.home;
    return differ && startsShut;
  }));
  /* An imported channel with homemode="Off" carries `home:0` — the board is
     told not to drive it at power-up, so there is no number to obey. A frame
     target of 0 is "leave this channel alone" (applyFrameTargets, playback.js),
     so seeding the shut pose from `c.home` wrote a routine that opened the
     panel on beat 0 and then never closed it again. Both the per-beat shut
     pose and the base pose have to be a real position — chanEnds()/chanRest()
     ask the actuator, which is what `homemode:'Off'` leaves them to do. */
  ok('a homemode="Off" channel (home 0) still gets a real shut position', await ev(()=>{
    const pies = Array.from({length:PIE_COUNT},(_,i)=>'pie'+i)
                      .map(a=>MSTR.channels.find(x=>x.act===a)).filter(Boolean);
    const c = pies[1];
    const keep = {home:c.home, homemode:c.homemode};
    c.home = 0; c.homemode = 'Off';                  // what import.js writes for Off/Ignore
    const r = musicBuildSequence('pies','chase',1,8);
    const frames = r.error ? [] : r.seq.frames;
    const beatShut = !r.error && frames[0].targets[c.i] === c.min && frames[0].targets[c.i] !== 0;
    const baseShut = !r.error && frames[frames.length-1].targets[c.i] === c.min;
    if(!r.error) MSTR.sequences.pop();
    c.home = keep.home; c.homemode = keep.homemode;
    return beatShut && baseShut;
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

  ok('no page errors', errs.length===0, errs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})();
