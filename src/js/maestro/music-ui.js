'use strict';
/* ------------------------------------------------- music bar + waveform */
function musicRebuildUI(){
  const bar = $('musbar'); if(!bar) return;
  bar.innerHTML='';

  const fin = document.createElement('input');
  fin.type='file'; fin.accept='audio/*,.mp3,.wav,.ogg,.m4a'; fin.style.display='none';
  fin.addEventListener('change',()=>{ if(fin.files[0]) musicLoadFile(fin.files[0]); fin.value=''; });
  const bLoad = el('button','b', MUSIC.loaded ? '♪ Replace' : '♪ Load music');
  bLoad.addEventListener('click',()=>fin.click());
  bar.appendChild(bLoad); bar.appendChild(fin);

  if(!MUSIC.loaded){
    const h = el('span','mushint','load a track to snap frames to its beats, build sequences from a group, and preview in sync');
    bar.appendChild(h);
    $('muswave').style.display='none';
    return;
  }
  $('muswave').style.display='block';   // '' would fall back to the stylesheet's display:none

  const info = el('span','musinfo', MUSIC.name+' · '+MUSIC.duration.toFixed(1)+'s');
  bar.appendChild(info);

  const bpmWrap = el('span','musbpm');
  bpmWrap.appendChild(document.createTextNode('BPM '));
  const bpm = document.createElement('input');
  bpm.type='number'; bpm.step=0.5; bpm.min=30; bpm.max=260; bpm.value=MUSIC.bpm||120;
  bpm.title='detected tempo — edit to override the beat grid';
  bpm.addEventListener('change',()=>musicSetGrid(parseFloat(bpm.value)||120));
  bpmWrap.appendChild(bpm);
  bar.appendChild(bpmWrap);

  const seq = MSTR.loaded ? MSTR.sequences[EDIT.seq] : null;

  const bPlay = el('button','b'+(MUSIC.playing?' act':''), MUSIC.playing ? '■ Stop' : '▶ Play ♪');
  bPlay.title = seq ? 'play the track and drive the droid from the audio clock — what the bench will look like'
                    : 'play the track (audio only — no sequence selected yet)';
  bPlay.addEventListener('click',()=>{ MUSIC.playing ? musicStop() : musicPlay(seq); });
  bar.appendChild(bPlay);

  const barWrap = el('span','musbpm');
  barWrap.title = 'beats per bar — the first beat of each bar is the STRONG beat';
  barWrap.appendChild(document.createTextNode('bar '));
  const barSel = document.createElement('select');
  [[2,'2/4'],[3,'3/4'],[4,'4/4']].forEach(([v,l])=>{
    const o=document.createElement('option'); o.value=v; o.textContent=l;
    if(v===MUSIC.barLen) o.selected=true; barSel.appendChild(o);
  });
  barSel.addEventListener('change',()=>{ musicFitBars(+barSel.value); musicRebuildUI(); if(typeof buildBlocks==='function') buildBlocks(); });
  barWrap.appendChild(barSel);
  bar.appendChild(barWrap);

  const bSnap = el('button','b','Snap to beats');
  bSnap.title='retime the whole sequence so it lands on the beat grid — bricks snap their starts, '+
    'a hand-made sequence snaps its frame boundaries. The snap mode picker in the top bar chooses strong beats or all of them.';
  bSnap.disabled = !seq;
  bSnap.addEventListener('click',()=>{
    let n;
    if(blockIsRoutine(seq)){
      n = blockSnapToBeats(seq);
      musicStatus('snapped '+n+' brick(s) of "'+seq.name+'" onto the '+((BLK.snapMode==='strong')?'strong-beat':'beat')+' grid');
    }else{
      n = musicSnapSequence(seq);
      musicStatus('snapped '+n+' frame boundary(ies) of "'+seq.name+'" onto the beat grid');
    }
    reindexSubs(); buildSequencer(); buildMaestroPane();
  });
  bar.appendChild(bSnap);

  const bBuild = el('button','b','Build sequence…');
  bBuild.title='generate a new sequence: one move per beat from a group or panel set';
  bBuild.addEventListener('click',()=>{ $('muspop').classList.toggle('on'); musicBuildPop(); });
  bar.appendChild(bBuild);

  const st = el('span','musstat'+(MUSIC.status&&MUSIC.status.isErr?' err':''),
                MUSIC.status ? MUSIC.status.msg : '');
  st.id='musstat';
  bar.appendChild(st);
  if(!seq && !MUSIC.status){
    musicStatus('no sequence selected — Build sequence… makes one from the beats (a starter is generated automatically if needed)');
  }

  musicDrawWave();
}

/* the little build-routine popover */
function musicBuildPop(){
  const pop = $('muspop'); if(!pop || !pop.classList.contains('on')) return;
  pop.innerHTML='';
  const mkSel = (opts)=>{ const s=document.createElement('select');
    opts.forEach(([v,l])=>{ const o=document.createElement('option'); o.value=v; o.textContent=l; s.appendChild(o); });
    return s; };
  const targets = PARTS.groups.filter(g=>groupActs(g).length)
    .map(g=>['g'+g.id, 'Group: '+g.name+' ('+groupActs(g).length+')'])
    .concat([['pies','Dome pies (12)'],['panels','Side panels (14)'],['doors','Body doors (5)']]);
  const sTarget = mkSel(targets);
  const sPattern = mkSel(MUSIC_PATTERNS);
  const sEvery = mkSel([['1','every beat'],['2','every 2nd beat'],['4','every 4th beat']]);
  const bGo = el('button','b prim','Build');
  bGo.addEventListener('click',()=>{
    const r = musicBuildSequence(sTarget.value, sPattern.value, +sEvery.value, 64);
    if(r.error){ musicStatus(r.error, true); }
    else pop.classList.remove('on');
  });
  const bX = el('button','b','Cancel');
  bX.addEventListener('click',()=>pop.classList.remove('on'));
  [sTarget,sPattern,sEvery,bGo,bX].forEach(x=>pop.appendChild(x));
  const h = el('div','hint');
  h.innerHTML='The new sequence is written into the settings like any other, so it exports in the <b>.mstr</b> and plays from a <b>restartScript(n)</b> slot. On the droid, fire the sound cue and the sub from the same button.';
  pop.appendChild(h);
}

/* ------------------------------------------------------------- waveform */
function musicDrawWave(){
  const cv = $('muswave'); if(!cv || !MUSIC.loaded) return;
  const w = cv.clientWidth||800, h = cv.clientHeight||44;
  cv.width = w*devicePixelRatio; cv.height = h*devicePixelRatio;
  const g = cv.getContext('2d'); g.scale(devicePixelRatio, devicePixelRatio);
  const css = k=>getComputedStyle(document.body).getPropertyValue(k).trim();
  g.clearRect(0,0,w,h);
  /* waveform */
  g.fillStyle = css('--track')||'#1a212c';
  g.fillRect(0,0,w,h);
  g.strokeStyle = css('--cy-d')||'#1b6b74';
  g.beginPath();
  const bins = MUSIC.peaks ? MUSIC.peaks.length/2 : 0;
  for(let x=0;x<w;x++){
    const b = Math.floor(x/w*bins);
    const lo = MUSIC.peaks[b*2], hi = MUSIC.peaks[b*2+1];
    g.moveTo(x+0.5, h/2 - hi*(h/2-2));
    g.lineTo(x+0.5, h/2 - lo*(h/2-2));
  }
  g.stroke();
  /* beat grid + onsets — a STRONG (down) beat draws brighter and full
     height, an ordinary beat dimmer and shorter, so the bar structure is
     readable at a glance (Mike's spec: visually distinguish them) */
  for(let i=0;i<MUSIC.beats.length;i++){
    const x = MUSIC.beats[i]/MUSIC.duration*w;
    const strong = (typeof musicIsStrong==='function') && musicIsStrong(i);
    g.strokeStyle = strong ? 'rgba(242,166,60,.95)' : 'rgba(242,166,60,.35)';
    g.lineWidth = strong ? 1.5 : 1;
    g.beginPath(); g.moveTo(x, strong?0:h*0.35); g.lineTo(x,h); g.stroke();
  }
  g.lineWidth = 1;
  g.fillStyle = css('--cy')||'#43d9e8';
  for(const o of MUSIC.onsets){ const x=o/MUSIC.duration*w; g.fillRect(x-1, h-5, 2, 5); }
  /* frame boundaries of the current sequence, to see the fit */
  const seq = MSTR.loaded ? MSTR.sequences[EDIT.seq] : null;
  if(seq){
    g.strokeStyle = 'rgba(255,255,255,.65)';
    let t=0;
    for(const f of seq.frames){
      t += f.duration/1000;
      if(t>MUSIC.duration) break;
      const x=t/MUSIC.duration*w;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 10); g.stroke();
    }
  }
}
function musicDrawCursor(t){
  musicDrawWave();
  const cv = $('muswave'); if(!cv || !MUSIC.loaded || t===undefined) return;
  const g = cv.getContext('2d');
  const w = cv.clientWidth||800, h = cv.clientHeight||44;
  g.strokeStyle = '#fff'; g.lineWidth=1.5;
  const x = Math.max(0, t/MUSIC.duration*w);
  g.beginPath(); g.moveTo(x,0); g.lineTo(x,h); g.stroke();
}
