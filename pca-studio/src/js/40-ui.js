'use strict';
/* ================================================================== UI */
/* The channel table moved to src/js/maestro/hw-table.js on 2026-08-12 and
   is now the sim's table too, reached through the HW seam (44-hw-host.js).
   Studio keeps the name because everything here calls buildChannels(). */
function buildChannels(){ hwTableBuild('chTable'); }

function buildSeqTabs(){
  const host=$('seqTabs'); host.innerHTML='';
  PROJ.sequences.forEach((s,k)=>{
    const d=document.createElement('div');
    d.className='seqtab'+(k===curSeq?' on':'')+(pcaSeqRunning(E,k)?' playing':'');
    const kind = s.gen==='osc' ? '\u223f' : s.gen==='wander' ? '\u2248' : ((s.frames?s.frames.length:0)+'f');
    d.innerHTML='<span class="slot">'+k+'</span>'+s.name+' <span class="slot">('+kind+(s.loop&&!s.gen?' \u21bb':'')+(s.background?' bg':'')+')</span>';
    d.onclick=()=>{
      curSeq=k;
      /* undo history follows the routine being edited — opening another one
         must not replay this one's past into it (blocks.js §undo/redo) */
      if(typeof blockHistReset === 'function') blockHistReset(PROJ.sequences[k]);
      if(typeof BLK !== 'undefined') BLK.sel = null;
      buildSeqTabs(); buildFrames(); syncLoopBox();
      if(typeof blkDraw === 'function') blkDraw();
    };
    host.appendChild(d);
  });
}
function buildFrames(){
  const t=$('frTable'), seq=PROJ.sequences[curSeq];
  if(!seq){ t.innerHTML=''; return; }
  if(seq.gen){ buildGenRows(t, seq); return; }
  let h='<tr><th>#</th><th class="fname">frame</th><th>ms</th>';
  PROJ.channels.forEach((c,i)=>{ h+='<th class="chcol" title="'+c.name+'">'+i+' '+c.name+'</th>'; });
  h+='<th></th></tr>';
  seq.frames.forEach((fr,f)=>{
    h+='<tr data-f="'+f+'"><td class="pin">'+f+'</td>'
      +'<td><input type="text" class="fname" data-k="name" value="'+String(fr.name).replace(/"/g,'&quot;')+'"></td>'
      +'<td class="fdur"><input type="number" data-k="duration" value="'+fr.duration+'" min="0" max="65535"></td>';
    PROJ.channels.forEach((c,i)=>{
      const v=fr.targets[i]|0;
      h+='<td><input type="number" data-k="t" data-ch="'+i+'" class="'+(v?'':'blank')+'" value="'+(v||'')+'" placeholder="·" min="0" max="16000"></td>';
    });
    h+='<td><button class="mini" data-k="cap" title="capture the current pose into this frame (active channels only)">📷</button> '
      +'<button class="mini" data-k="dup">dup</button> '
      +'<button class="mini" data-k="del">✕</button></td></tr>';
  });
  t.innerHTML=h;
  t.oninput=e=>{
    const tr=e.target.closest('tr'); if(!tr) return;
    const f=+tr.dataset.f, k=e.target.dataset.k, fr=seq.frames[f];
    if(k==='name') fr.name=e.target.value;
    else if(k==='duration') fr.duration=+e.target.value|0;
    else if(k==='t'){
      const i=+e.target.dataset.ch;
      fr.targets[i]=+e.target.value|0;
      e.target.classList.toggle('blank', !fr.targets[i]);
    }
    projSave(); rebuildEngine(true);
  };
  t.onclick=e=>{
    const b=e.target.closest('button'); if(!b) return;
    const tr=e.target.closest('tr'); if(!tr) return;
    const f=+tr.dataset.f, k=b.dataset.k;
    if(k==='cap'){
      PROJ.channels.forEach((c,i)=>{ if(E.st[i].servo && E.st[i].active) seq.frames[f].targets[i]=E.st[i].target; });
      log('pose captured into frame '+f);
    }
    if(k==='dup') seq.frames.splice(f+1,0,JSON.parse(JSON.stringify(seq.frames[f])));
    if(k==='del') seq.frames.splice(f,1);
    projSave(); rebuildEngine(true); buildFrames(); buildSeqTabs();
  };
}
/* oscillator / wander entries: one row per channel being driven */
function buildGenRows(t, seq){
  seq.entries = seq.entries || [];
  let h='<tr><th>#</th><th>channel</th><th>from</th><th>to</th><th>period ms</th><th>phase&deg;</th><th></th></tr>';
  seq.entries.forEach((g,i)=>{
    h+='<tr data-g="'+i+'"><td class="pin">'+i+'</td>'
      +'<td><select data-k="ch">'+PROJ.channels.map((c,ci)=>'<option value="'+ci+'"'+(g.ch===ci?' selected':'')+'>'+ci+' '+c.name+'</option>').join('')+'</select></td>'
      +'<td><input type="number" data-k="lo" value="'+g.lo+'" min="0" max="16000"></td>'
      +'<td><input type="number" data-k="hi" value="'+g.hi+'" min="0" max="16000"></td>'
      +'<td><input type="number" data-k="period" value="'+g.period+'" min="20" max="65535" step="100"></td>'
      +'<td><input type="number" data-k="phase" value="'+(g.phase|0)+'" min="0" max="359" style="width:48px"></td>'
      +'<td><button class="mini" data-k="del">&#10005;</button></td></tr>';
  });
  h+='<tr><td colspan="7"><button class="mini" id="bAddGen">+ channel</button>'
    +'<span class="stat" style="margin-left:12px;color:var(--faint)">'
    +(seq.gen==='osc' ? 'eases from &rarr; to &rarr; from every period, forever. Phase offsets one row against another, so a pan and a tilt need not swing together.'
                      : 'picks a fresh random target in range every period; the channel&rsquo;s own speed and acceleration carry it there.')
    +'</span></td></tr>';
  t.innerHTML=h;
  t.oninput=e=>{
    const tr=e.target.closest('tr'); if(!tr||tr.dataset.g===undefined) return;
    const g=seq.entries[+tr.dataset.g], k=e.target.dataset.k;
    g[k] = +e.target.value|0;
    projSave(); rebuildEngine(true);
  };
  t.onclick=e=>{
    const b=e.target.closest('button'); if(!b) return;
    if(b.id==='bAddGen'){
      const c=PROJ.channels[0];
      seq.entries.push({ch:0, lo:Math.min(c.min,c.max), hi:Math.max(c.min,c.max), period:3000, phase:0});
    }else{
      const tr=e.target.closest('tr'); if(!tr) return;
      seq.entries.splice(+tr.dataset.g,1);
    }
    projSave(); rebuildEngine(true); buildFrames(); buildSeqTabs();
  };
}
function syncLoopBox(){
  const sq=PROJ.sequences[curSeq]; if(!sq) return;
  $('ckLoop').checked=!!sq.loop;
  $('ckBg').checked=!!sq.background;
  $('selKind').value=sq.gen||'frames';
  $('ckLoop').disabled=!!sq.gen;            /* generators always repeat */
  $('bAddFr').disabled=!!sq.gen;
}
function rebuildAll(){
  rebuildEngine(true); buildChannels(); buildSeqTabs(); buildFrames(); syncLoopBox();
  $('inOsc').value=PROJ.osc;
  if(typeof syncFreqBox === 'function') syncFreqBox();
  if(typeof blkDraw === 'function') blkDraw();
}

/* ------------------------------------------------------------ header bar */
$('bHdr').onclick=()=>{
  const text=pcaGenHeader(PROJ.channels, PROJ.sequences, {source:'PCA Studio project', appVersion:STUDIO_VERSION+' (PCA Studio)'});
  download('sequences.h', text, 'text/x-c');
  log('sequences.h exported — '+PROJ.channels.length+' channels, '+PROJ.sequences.length+' slots. Verify endpoints and oscillator on YOUR hardware first.','warn');
};
$('bSave').onclick=()=>{ download('project.pcastudio.json', JSON.stringify(PROJ,null,1), 'application/json'); log('project saved'); };
$('bLoad').onclick=()=>$('fProj').click();
$('fProj').onchange=()=>{
  const f=$('fProj').files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{
    const p=JSON.parse(r.result);
    /* a servo-setup export is the same door: it carries the hardware answers
       and the channel table but no sequences, so it must not wipe the ones
       you already have — that file is a CALIBRATION, and calibration and
       choreography are exactly the two things this project keeps apart */
    if(p.kind === 'pca-studio-setup'){
      PROJ.setup = p.setup || PROJ.setup;
      PROJ.osc = p.osc || PROJ.osc;
      PROJ.channels = p.channels;
      if(!PROJ.sequences || !PROJ.sequences.length) PROJ.sequences = defaultProject().sequences;
      curSeq = 0; projSave(); rebuildAll();
      log('servo setup loaded — '+p.channels.length+' channels, '+
          (p.setup? (p.setup.boards+' board'+(p.setup.boards===1?'':'s')) : 'boards unknown')+
          '. Your sequences are untouched.');
      $('fProj').value=''; return;
    }
    if(!p.channels || !p.sequences) throw new Error('not a PCA Studio project');
    PROJ=p; PROJ.osc=PROJ.osc||25000000; curSeq=0; projSave(); rebuildAll();
    log('project loaded — '+PROJ.channels.length+' channels, '+PROJ.sequences.length+' sequences');
  }catch(e){ log('load failed: '+e.message,'err'); } };
  r.readAsText(f); $('fProj').value='';
};
$('bMstr').onclick=()=>$('fMstr').click();
$('fMstr').onchange=()=>{
  const f=$('fMstr').files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{
    const P=mstrImportText(r.result, f.name);
    PROJ.channels=P.channels; PROJ.sequences=P.sequences; curSeq=0;
    projSave(); rebuildAll();
    log('imported '+f.name+' — '+P.channels.length+' channels, '+P.sequences.length+' sequences in script slot order'+(P.warn?' · '+P.warn:''), P.warn?'warn':'');
  }catch(e){ log('import failed: '+e.message,'err'); } };
  r.readAsText(f); $('fMstr').value='';
};
$('inOsc').onchange=()=>{ PROJ.osc=+$('inOsc').value|0; projSave(); if(SER.port) serialConfig(); };
$('inFreq').onchange=()=>{ serialSetFreq(+$('inFreq').value|0); syncFreqBox(); };
/* one count is the period ÷ 4096 — the number that decides whether a slow
   move steps or glides, shown next to the control that changes it */
function syncFreqBox(){
  const hz = HW.freq();
  if($('inFreq')) $('inFreq').value = hz;
  if($('freqRes')) $('freqRes').textContent = '· 1 count = '+(1000000/hz/4096).toFixed(2)+' µs';
}
$('bConnect').onclick=serialConnect;

/* ---- panic stop: on screen AND on the hardware ---- */
function panicStop(why){
  pcaStop(E);                                   /* every track, and no bg resume */
  PROJ.channels.forEach((c,i)=>pcaSetTarget(E,i,0));   /* pulses off everywhere */
  if(SER.port && !SER.blocked){
    /* say it directly too, in case a position write was in flight */
    PROJ.channels.forEach((c,i)=>{ SER.lastTicks[i]=-1; serialWrite(i,null); });
  }
  buildSeqTabs();
  log(why || 'STOPPED — all sequences halted, all outputs off','warn');
}
$('bPanic').onclick=()=>panicStop();
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    /* Esc must work even mid-edit, so do not ignore it in inputs */
    panicStop('STOPPED (Esc) — all sequences halted, all outputs off');
  }
});

/* ---- monitor ---- */
$('bMon').onclick=()=>monShow($('secMon').classList.contains('hide'));
$('bMonHide').onclick=()=>monShow(false);
$('bMonClear').onclick=()=>{ $('monOut').textContent=''; SER.banner=''; };
$('bMonSend').onclick=()=>{ serialSendText($('monIn').value); $('monIn').value=''; };
$('monIn').addEventListener('keydown',e=>{
  if(e.key==='Enter'){ serialSendText($('monIn').value); $('monIn').value=''; }
});
$('bAddCh').onclick=()=>{
  if(PROJ.channels.length>=32){ log('32 channels = two full PCA9685 boards — the bridge stops there','warn'); return; }
  PROJ.channels.push({name:'Servo '+PROJ.channels.length,mode:'Servo',min:4000,max:8000,home:0,homemode:'Off',speed:80,acceleration:10});
  PROJ.sequences.forEach(s=>s.frames.forEach(fr=>fr.targets.push(0)));
  projSave(); rebuildAll();
};
$('bDelCh').onclick=()=>{
  if(PROJ.channels.length<=1) return;
  PROJ.channels.pop();
  PROJ.sequences.forEach(s=>s.frames.forEach(fr=>fr.targets.pop()));
  projSave(); rebuildAll();
};
$('bAllHome').onclick=()=>pcaGoHome(E);
$('bAllOff').onclick=()=>PROJ.channels.forEach((c,i)=>pcaSetTarget(E,i,0));
$('bAddSeq').onclick=()=>{
  PROJ.sequences.push({name:'Sequence '+PROJ.sequences.length, frames:[{name:'F0',duration:500,targets:PROJ.channels.map(()=>0)}]});
  curSeq=PROJ.sequences.length-1; projSave(); rebuildAll();
};
$('bDupSeq').onclick=()=>{
  const s=PROJ.sequences[curSeq]; if(!s) return;
  PROJ.sequences.splice(curSeq+1,0,JSON.parse(JSON.stringify(s)));
  PROJ.sequences[curSeq+1].name=s.name+' copy';
  curSeq++; projSave(); rebuildAll();
};
$('bRenSeq').onclick=()=>{
  const s=PROJ.sequences[curSeq]; if(!s) return;
  const nm=prompt('Sequence name (becomes MPCA_SLOT_'+pcaCName(s.name)+')', s.name);
  if(nm){ s.name=nm; projSave(); rebuildAll(); }
};
$('bDelSeq').onclick=()=>{
  if(PROJ.sequences.length<=0) return;
  if(!confirm('Delete "'+PROJ.sequences[curSeq].name+'"? Slot numbers after it shift down.')) return;
  PROJ.sequences.splice(curSeq,1);
  curSeq=Math.max(0,curSeq-1); projSave(); rebuildAll();
};
$('bPlay').onclick=()=>{ pcaRestart(E,curSeq); buildSeqTabs(); };
$('bStop').onclick=()=>{ pcaStop(E); buildSeqTabs(); };
$('bStopAll').onclick=()=>panicStop();
$('ckBg').onchange=()=>{
  const sq=PROJ.sequences[curSeq]; if(!sq) return;
  sq.background=$('ckBg').checked;
  projSave(); rebuildEngine(true); buildSeqTabs();
  log(sq.background ? '"'+sq.name+'" resumes by itself after something borrows its channels'
                    : '"'+sq.name+'" stays stopped once displaced');
};
$('selKind').onchange=()=>{
  const sq=PROJ.sequences[curSeq]; if(!sq) return;
  const k=$('selKind').value;
  if(k==='frames'){ delete sq.gen; if(!sq.frames||!sq.frames.length) sq.frames=[{name:'F0',duration:500,targets:PROJ.channels.map(()=>0)}]; }
  else{
    sq.gen=k;
    if(!sq.entries||!sq.entries.length){
      const c=PROJ.channels[0];
      sq.entries=[{ch:0, lo:Math.min(c.min,c.max), hi:Math.max(c.min,c.max), period:3000, phase:0}];
    }
  }
  projSave(); rebuildEngine(true); buildSeqTabs(); buildFrames(); syncLoopBox();
};
$('ckLoop').onchange=()=>{
  const sq=PROJ.sequences[curSeq]; if(!sq) return;
  sq.loop=$('ckLoop').checked;
  projSave(); rebuildEngine(true); buildSeqTabs();
  log(sq.loop ? '"'+sq.name+'" loops until stopped or displaced'
              : '"'+sq.name+'" plays once');
};

/* ------------------------------------------------------------ main loop */
let lastNow=performance.now(), uiAt=0, lastPlayingTab='', msAcc=0;
function loop(now){
  /* The engine is NOT stepped here any more. A fixed-rate engine driven off
     the animation frame delivers 1,2,2,1,2,2 steps per frame at 60 Hz — a
     2:1 ripple in commanded velocity that Mike felt on real servos,
     2026-08-12. hw-clock.js owns the heartbeat; this loop only paints. */
  lastNow = now;
  if(now-uiAt>33){
    uiAt=now;
    hwTableSync();
    const st=$('playStat');
    const live=E.tracks.filter(t=>t.seq>=0);
    if(live.length){
      st.textContent=live.map(t=>{
        const q=PROJ.sequences[t.seq];
        if(q.gen) return t.seq+' "'+q.name+'" '+(q.gen==='osc'?'sweep':'wander');
        return t.seq+' "'+q.name+'" f'+(t.frame+1)+'/'+q.frames.length+(q.loop?' \u21bb':'');
      }).join('   ·   ');
    }else{
      st.textContent=pcaMoving(E)?'servos settling…':'idle';
    }
    /* highlight the playing frame of the sequence you are looking at */
    const cq=PROJ.sequences[curSeq];
    const cur=(cq&&cq.gen)?null:E.tracks.find(t=>t.seq===curSeq);
    const rows=$('frTable').rows;
    for(let r=1;r<rows.length;r++) rows[r].classList.toggle('cur', !!cur && (r-1)===cur.frame);
    const sig=E.tracks.map(t=>t.seq).join(',');
    if(lastPlayingTab!==sig){ lastPlayingTab=sig; buildSeqTabs(); }
    $('stTicks').textContent=E.ticks;
    $('stWrites').textContent=E.writes;
    $('stSerial').textContent=SER.port?'115200 8N1':'—';
  }
  requestAnimationFrame(loop);
}
