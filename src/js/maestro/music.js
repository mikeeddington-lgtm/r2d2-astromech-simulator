'use strict';
/* =====================================================================
   MUSIC — sequence the servos against a track

   Load an audio file into the sequencer strip: it draws a waveform under
   the timeline, finds the beats, and then three things become possible:

   1. SNAP    — retime the current sequence so its frame boundaries land
                on the beat grid.
   2. BUILD   — generate a new sequence from a group (or the pies/panels/
                doors) with one move per beat: chase, alternate or pulse.
   3. PLAY ♪  — play the track and the sequence together, position driven
                by the AUDIO clock, so what you see is what the droid will
                do when the same .mstr script and the same track start
                together on the bench.

   The exported .mstr is an ordinary sequence — the music never leaves the
   browser. On the droid you fire the subroutine and the sound cue in the
   same button handler, exactly like the stock sketches do.

   Beat detection is deliberately simple and dependency-free: an onset
   envelope from frame-energy flux, peak-picked with an adaptive
   threshold, then a tempo fit by autocorrelation over 60–190 BPM and a
   phase fit against the strongest onsets. Good for anything with a drum
   kit; a rubato string quartet will defeat it, and the grid can always be
   nudged by hand afterwards (the BPM box is editable).
   ===================================================================== */
/* one visible line of truth — Mike: "if it is doing something, give it a
   status bar; if it's not, fix it". Every action lands here. */
function musicStatus(msg, isErr){
  MUSIC.status = {msg, isErr: !!isErr};
  const s = $('musstat');
  if(s){ s.textContent = msg; s.classList.toggle('err', !!isErr); }
  lg(isErr?'warn':'mae', 'music: '+msg);
}
const MUSIC = {
  loaded:false, name:'', duration:0,
  peaks:null,          // Float32Array min/max pairs for the waveform
  onsets:[],           // seconds — detected attacks
  bpm:0, phase:0,      // fitted grid: beat k at phase + k*60/bpm
  beats:[],            // seconds — the grid, clipped to the track
  barLen:4, barPhase:0,// beats per bar, and which beat index starts a bar
  playing:null,        // {ctx, src, t0, seq, raf}
  buffer:null
};

/* ------------------------------------------------------------- analysis */
function musicMono(buf){
  const n = buf.length, out = new Float32Array(n);
  for(let c=0;c<buf.numberOfChannels;c++){
    const d = buf.getChannelData(c);
    for(let i=0;i<n;i++) out[i] += d[i]/buf.numberOfChannels;
  }
  return out;
}
function musicAnalyse(buf){
  const sr = buf.sampleRate, mono = musicMono(buf);
  const hop = 512, win = 1024;
  const nF = Math.max(1, Math.floor((mono.length-win)/hop));
  const energy = new Float32Array(nF);
  for(let f=0; f<nF; f++){
    let e=0; const o=f*hop;
    for(let i=0;i<win;i++){ const v=mono[o+i]; e += v*v; }
    energy[f] = Math.sqrt(e/win);
  }
  /* onset envelope: rising energy only */
  const flux = new Float32Array(nF);
  for(let f=1; f<nF; f++) flux[f] = Math.max(0, energy[f]-energy[f-1]);
  /* adaptive threshold: mean + 1.5σ over a ±0.5 s window */
  const W = Math.round(0.5*sr/hop);
  const onsets = [];
  const minGap = 0.22*sr/hop;                        // ≥220 ms between beats
  let last = -1e9;
  for(let f=1; f<nF-1; f++){
    if(flux[f] < flux[f-1] || flux[f] < flux[f+1]) continue;
    let m=0, s=0, n=0;
    for(let k=Math.max(0,f-W); k<Math.min(nF,f+W); k++){ m+=flux[k]; n++; }
    m/=n;
    for(let k=Math.max(0,f-W); k<Math.min(nF,f+W); k++){ const d=flux[k]-m; s+=d*d; }
    s=Math.sqrt(s/n);
    if(flux[f] > m + 1.5*s && f-last >= minGap){ onsets.push(f*hop/sr); last=f; }
  }
  /* tempo: autocorrelate the envelope, 60–190 BPM.
     The true period rarely lands on an integer frame lag (120 BPM at this
     hop is 21.53 frames), so raw spikes miss each other and the double-lag
     harmonic wins. Smooth the envelope first, then prefer the smallest lag
     whose correlation holds up — take the half-lag while it keeps ≥60%. */
  const fluxS = new Float32Array(nF);
  for(let f=0; f<nF; f++){
    fluxS[f] = (flux[Math.max(0,f-1)] + 2*flux[f] + flux[Math.min(nF-1,f+1)]) / 4;
  }
  const fps = sr/hop;
  const lagLo = Math.max(2, Math.round(fps*60/190)), lagHi = Math.round(fps*60/60);
  const corr = lag => { let acc=0; for(let f=0; f<nF-lag; f++) acc += fluxS[f]*fluxS[f+lag]; return acc; };
  let best=0, bestLag=0;
  for(let lag=lagLo; lag<=lagHi && lag<nF; lag++){
    const acc = corr(lag);
    if(acc > best){ best=acc; bestLag=lag; }
  }
  while(bestLag >= lagLo*2){
    const half = Math.round(bestLag/2);
    if(corr(half) >= 0.6*best) { bestLag = half; best = corr(half); }
    else break;
  }
  /* the true period is rarely an integer number of frames (120 BPM here is
     21.53) — parabolic interpolation over the neighbouring lags recovers the
     fractional peak, worth ±3 BPM of accuracy at this hop size */
  let lagF = bestLag;
  if(bestLag>lagLo && bestLag<lagHi){
    const y1=corr(bestLag-1), y2=corr(bestLag), y3=corr(bestLag+1);
    const den = y1 - 2*y2 + y3;
    if(den !== 0){ const d = 0.5*(y1-y3)/den; if(Math.abs(d)<=0.5) lagF = bestLag + d; }
  }
  const bpm = bestLag ? Math.round(60*fps/lagF*10)/10 : 0;
  /* phase: try each onset as beat zero, score grid hits against onsets */
  let phase = 0;
  if(bpm && onsets.length){
    const period = 60/bpm;
    let bestScore=-1;
    for(const cand of onsets.slice(0, 24)){
      const p = cand % period;
      let score=0;
      for(const o of onsets){
        const d = Math.abs((((o-p)%period)+period)%period);
        score += Math.min(d, period-d) < 0.05 ? 1 : 0;
      }
      if(score>bestScore){ bestScore=score; phase=p; }
    }
  }
  const beats=[];
  if(bpm){ const period=60/bpm; for(let t=phase; t<buf.duration; t+=period) beats.push(Math.round(t*1000)/1000); }
  return {onsets, bpm, phase, beats};
}
/* waveform peaks for drawing: `bins` (min,max) pairs */
function musicPeaks(buf, bins){
  const mono = musicMono(buf);
  const per = Math.max(1, Math.floor(mono.length/bins));
  const out = new Float32Array(bins*2);
  for(let b=0;b<bins;b++){
    let lo=1, hi=-1;
    const o=b*per, e=Math.min(mono.length, o+per);
    for(let i=o;i<e;i++){ const v=mono[i]; if(v<lo)lo=v; if(v>hi)hi=v; }
    out[b*2]=lo; out[b*2+1]=hi;
  }
  return out;
}

/* accept a decoded AudioBuffer (file load and the test suite both land here) */
function musicSetBuffer(buf, name){
  MUSIC.buffer = buf;
  MUSIC.name = name || 'track';
  MUSIC.duration = buf.duration;
  MUSIC.peaks = musicPeaks(buf, 900);
  const a = musicAnalyse(buf);
  MUSIC.onsets = a.onsets; MUSIC.bpm = a.bpm; MUSIC.phase = a.phase; MUSIC.beats = a.beats;
  MUSIC.loaded = true;
  musicFitBars();
  musicStatus(`${MUSIC.name}: ${MUSIC.duration.toFixed(1)} s, ${MUSIC.bpm||'?'} BPM, ${MUSIC.beats.length} beats found — Snap retimes the current sequence, Build makes a new one`);
  if(typeof musicRebuildUI==='function') musicRebuildUI();
  return a;
}
/* manual grid override (the BPM box) — keeps the detected phase */
function musicSetGrid(bpm, phase){
  MUSIC.bpm = bpm; if(phase!==undefined) MUSIC.phase = phase;
  MUSIC.beats = [];
  if(bpm>0){ const per=60/bpm; for(let t=MUSIC.phase; t<MUSIC.duration; t+=per) MUSIC.beats.push(Math.round(t*1000)/1000); }
  musicFitBars();
  if(typeof musicRebuildUI==='function') musicRebuildUI();
}

/* ------------------------------------------------- strong beats / bars
   A DOWN beat is louder than its neighbours far more often than not, so
   the bar phase is fitted the same way the beat phase was: try each
   offset, score how much onset energy lands on the beats it claims, keep
   the best. barLen is 4 unless the user says otherwise. */
function musicFitBars(barLen){
  if(barLen) MUSIC.barLen = barLen;
  const L = Math.max(2, MUSIC.barLen|0);
  if(!MUSIC.beats.length){ MUSIC.barPhase = 0; return; }
  const near = t => MUSIC.onsets.some(o=>Math.abs(o-t) < 0.07);
  let best = -1, bestOff = 0;
  for(let off=0; off<L; off++){
    let score = 0;
    for(let i=off; i<MUSIC.beats.length; i+=L) if(near(MUSIC.beats[i])) score++;
    if(score > best){ best = score; bestOff = off; }
  }
  MUSIC.barPhase = bestOff;
}
function musicIsStrong(i){ return (i - MUSIC.barPhase) % MUSIC.barLen === 0 && i >= MUSIC.barPhase; }
/* the beat list a snap mode actually uses: [{t (s), n (beat index), strong}] */
function musicSnapBeats(mode){
  if(!MUSIC.loaded || mode === 'off') return [];
  const out = [];
  MUSIC.beats.forEach((t,i)=>{
    const strong = musicIsStrong(i);
    if(mode === 'strong' && !strong) return;
    out.push({t, n:i, strong});
  });
  return out;
}
function musicLoadFile(file){
  const fr = new FileReader();
  fr.onload = async ()=>{
    try{
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      const buf = await ctx.decodeAudioData(fr.result);
      ctx.close();
      musicSetBuffer(buf, file.name);
    }catch(e){ musicStatus('could not decode '+file.name+' — '+e.message+'. MP3/WAV/OGG work; DRM-protected files do not.', true); }
  };
  fr.readAsArrayBuffer(file);
}

/* -------------------------------------------------------------- snapping */
function musicNearestBeat(t){
  if(!MUSIC.beats.length) return t;
  let best=MUSIC.beats[0];
  for(const b of MUSIC.beats) if(Math.abs(b-t)<Math.abs(best-t)) best=b;
  return best;
}
/* retime the frames of `seq` so each boundary lands on the nearest beat.
   Boundaries are assigned FORWARD — each at least 60 ms after the previous —
   so when several old boundaries collapse onto one beat, the floor does not
   push every later boundary off the grid. The result: every boundary is
   either exactly a beat or exactly prev+60 ms. */
function musicSnapSequence(seq){
  if(!seq || !seq.frames.length || !MUSIC.beats.length) return 0;
  let t=0;
  const bounds=[0];
  for(const f of seq.frames){ t+=f.duration/1000; bounds.push(t); }
  let prev=0, moved=0;
  for(let i=1;i<bounds.length;i++){
    const b = Math.max(musicNearestBeat(bounds[i]), prev + 0.06);
    const d = Math.round((b - prev)*1000);
    if(d !== seq.frames[i-1].duration){ seq.frames[i-1].duration = d; moved++; }
    prev = prev + d/1000;
  }
  return moved;
}

/* ------------------------------------------------- beat-driven sequences */
const MUSIC_PATTERNS = [
  ['chase',    'Chase — one member per beat, previous closes'],
  ['alternate','Alternate — all open on one beat, all close on the next'],
  ['pulse',    'Pulse — open on the beat, close on the half-beat']
];
/* acts for a target key: a group id like 'g3', or 'pies'|'panels'|'doors' */
function musicTargetActs(key){
  if(/^g\d+$/.test(key)){ const g=groupById(+key.slice(1)); return g? groupActs(g):[]; }
  if(key==='pies')   return Array.from({length:PIE_COUNT},(_,i)=>'pie'+i);
  if(key==='panels') return Array.from({length:PANEL_COUNT},(_,i)=>'panel'+i);
  if(key==='doors')  return ['doorL','doorR','doorRL','doorRR','smallDoor'];
  return [];
}
function musicBuildSequence(targetKey, pattern, everyN, maxBeats){
  if(!MUSIC.beats.length) return {error:'no beat grid — load a track (or type a BPM) first'};
  if(!MSTR.loaded){
    // don't dead-end — build the board the target implies and say so
    const which = (targetKey==='doors') ? 'body' : 'dome';
    makeStarter(which, MSTR.board || 'mini24');
    if(typeof rebuildMaestroUI==='function') rebuildMaestroUI();
    musicStatus('no Maestro settings were loaded, so a '+which+' starter was generated first');
  }
  const acts = musicTargetActs(targetKey);
  const chans = acts.map(a=>MSTR.channels.find(c=>c.act===a)).filter(Boolean);
  if(!chans.length) return {error:'nothing in that target is mapped to a Maestro channel'};

  const beats = MUSIC.beats.filter((b,i)=>i%Math.max(1,everyN)===0).slice(0, maxBeats||64);
  if(beats.length<2) return {error:'fewer than two beats to work with'};
  /* v1.46.0 — one rule: max IS the open end (chanNorm(), playback.js). This
     line used to sort the pair and then consult the retired `invert` flag,
     so a beat routine on a reversed channel drove that panel to its shut
     end and called it open. */
  const openOf = c => chanEnds(c).open;
  const base = new Array(MSTR.servoCount).fill(0);
  MSTR.channels.forEach(c=>{ if(/^servo/i.test(c.mode)) base[c.i]=c.home; });

  const frames=[]; let cur=base.slice();
  const push=(untilSec)=>{ const prev=frames.reduce((a,f)=>a+f.duration,0);
    frames.push({name:'Frame '+frames.length, duration:Math.max(60, Math.round(untilSec*1000-prev)), targets:cur.slice()}); };
  for(let k=0;k<beats.length-1;k++){
    cur = cur.slice();
    if(pattern==='chase'){
      chans.forEach(c=>cur[c.i]=c.home);
      cur[chans[k%chans.length].i] = openOf(chans[k%chans.length]);
      push(beats[k+1]);
    }else if(pattern==='alternate'){
      const open = k%2===0;
      chans.forEach(c=>{ cur[c.i] = open ? openOf(c) : c.home; });
      push(beats[k+1]);
    }else{ /* pulse: open on the beat, home on the half-beat */
      chans.forEach(c=>{ cur[c.i]=openOf(c); });
      push((beats[k]+beats[k+1])/2);
      cur = cur.slice();
      chans.forEach(c=>{ cur[c.i]=c.home; });
      push(beats[k+1]);
    }
  }
  cur = base.slice(); frames.push({name:'Frame '+frames.length, duration:400, targets:cur});
  const label = /^g\d+$/.test(targetKey) ? groupById(+targetKey.slice(1)).name : targetKey;
  const seq = {name:(MUSIC.name.replace(/\.[a-z0-9]+$/i,'')||'Track')+' '+pattern+' ('+label+')', frames};
  MSTR.sequences.push(seq);
  if(typeof loadoutAdd==='function') loadoutAdd(seq.name);
  EDIT.seq = MSTR.sequences.length-1; EDIT.frame=-1;
  if(typeof reindexSubs==='function') reindexSubs();
  if(typeof rebuildMaestroUI==='function') rebuildMaestroUI();
  musicStatus(`built "${seq.name}": ${frames.length} frames over ${beats.length-1} beats — it is now the selected sequence, press ▶ Play ♪`);
  return {seq};
}

/* --------------------------------------------------------- synced playback
   Position comes from a supplied clock so the sim preview and the test
   suite share one code path; live playback passes the AudioContext clock. */
function musicFrameAt(seq, tSec){
  let acc=0;
  for(let i=0;i<seq.frames.length;i++){
    acc += seq.frames[i].duration/1000;
    if(tSec < acc) return i;
  }
  return seq.frames.length-1;
}
function musicApplyAt(seq, tSec, prevIdx){
  const i = musicFrameAt(seq, tSec);
  if(typeof prevIdx === 'number' && prevIdx < i){
    // v1.39.5: a tick must not step over a short frame — same law as seqStepPlayback
    for(let j = prevIdx + 1; j <= i; j++) applyFrameTargets(seq.frames[j].targets, seq.frames[j].speeds);
  } else {
    applyFrameTargets(seq.frames[i].targets, seq.frames[i].speeds);
  }
  return i;
}
function musicStop(){
  const pl = MUSIC.playing; if(!pl) return;
  musicStatus('stopped');
  MUSIC.playing = null;
  try{ pl.src && pl.src.stop(); }catch(e){}
  try{ pl.ctx && pl.ctx.close(); }catch(e){}
  if(pl.raf) cancelAnimationFrame(pl.raf);
  if(typeof musicRebuildUI==='function') musicRebuildUI();
}
function musicPlay(seq){
  if(!MUSIC.loaded) return;
  if(seq && !seq.frames.length) seq = null;
  musicStop();
  const ctx = new (window.AudioContext||window.webkitAudioContext)();
  // browsers sometimes hand out a SUSPENDED context even from a click —
  // resume() is what actually lets sound reach the speakers
  if(ctx.state !== 'running') ctx.resume().catch(()=>{});
  const src = ctx.createBufferSource();
  src.buffer = MUSIC.buffer; src.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.05;
  src.start(t0);
  const pl = MUSIC.playing = {ctx, src, t0, seq, raf:0, lastIdx:-1};
  const tick = ()=>{
    if(MUSIC.playing !== pl) return;
    if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
    const t = ctx.currentTime - t0;
    if(t >= 0 && seq) pl.lastIdx = musicApplyAt(seq, t, pl.lastIdx);
    musicDrawCursor(t);
    if(t >= 0 && typeof blkPlayheadFollow === 'function') blkPlayheadFollow(t*1000);
    const end = seq ? Math.max(MUSIC.duration, seqTotal(seq)/1000 + 2) : MUSIC.duration;
    if(t > end){ musicStop(); return; }
    pl.raf = requestAnimationFrame(tick);
  };
  tick();
  musicStatus(seq
    ? `playing "${MUSIC.name}" against "${seq.name}" — the droid follows the audio clock`
    : `playing "${MUSIC.name}" — no sequence selected, audio only (Build routine… to make one)`);
  if(typeof musicRebuildUI==='function') musicRebuildUI();
}
