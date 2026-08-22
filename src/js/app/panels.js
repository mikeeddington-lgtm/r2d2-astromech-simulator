'use strict';
function kvRow(host,a,b){
  const r=el('div','kbrow'); r.appendChild(el('span',null,a));
  const s=el('span'); s.innerHTML=b; s.style.color='var(--dimmer)'; s.style.textAlign='right'; s.style.maxWidth='62%';
  r.appendChild(s); host.appendChild(r); return r;
}

/* ---- tabs ---- */
document.querySelectorAll('#tabs button').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('#tabs button').forEach(x=>x.classList.remove('act'));
    document.querySelectorAll('.pane').forEach(x=>{x.classList.remove('act'); x.style.display='none';});
    b.classList.add('act');
    const p=$(b.dataset.p); p.classList.add('act'); p.style.display='block';
  });
});

/* ---- firmware selector ---- */
/* The firmware buttons left the header in v1.4.0 — the sketch is a build
   answer, so it is chosen in the setup. A read-only tag replaced them, and in
   v1.45.0 that went too (Mike: "Remove the Maestro 2025 reference/image") —
   the header no longer carries a board maker's product name. The lookup below
   is deliberately kept: it is `if(tag)`, so it costs nothing while #fwTag is
   absent and works again the day somebody wants the tag back, and every other
   place that names the sketch (Setup → Firmware, the Config summary, the
   wiring sheet) is unaffected. */
function buildFwSelector(){
  const tag=$('fwTag');
  if(tag && typeof PROFILE!=='undefined' && PROFILE){
    tag.textContent = PROFILE.short;
    tag.title = PROFILE.name+' — '+PROFILE.file+'\nchange it in Setup → Firmware';
  }
  const host=$('fwsel'); if(!host) return;
  host.innerHTML='';
  PROFILE_ORDER.forEach(id=>{
    const p=PROFILES[id];
    const b=el('button',null,p.short);
    b.className='fwbtn'+(id===SIM.profile?' act':'');
    b.dataset.id=id;
    b.title=p.name+' — '+p.file;
    b.addEventListener('click',()=>{
      if(id===SIM.profile) return;
      loadProfile(id);
      buildFwSelector();
    });
    host.appendChild(b);
  });
}

/* ---- outputs pane ---- */
let OUTROWS = {servo:{1:[],2:[]}, act:[], mot:[], mae:[]};

/* =====================================================================
   EXPANDING OUTPUT ROW

   Mike, 2026-07-27: "when I click on output it should open up the panel /
   item so we can adjust the control etc and test."

   So a row in the Outputs tables is no longer read-only. Clicking one
   selects the part on the 3D model and drops a control strip underneath
   it: which channel it is on (and a picker to change that where the board
   allows it), a position slider, open/close, and its colour. One row open
   at a time — this is a status table with a drawer, not an accordion.

   Everything drives through actSet(), which is what makes it work on
   mod2026 too: there the PCA9685 layer owns ACT and overwrites it from
   servoTravel() every frame, so a raw ACT_T write would be stamped on.
   ===================================================================== */
let OUT_OPEN = null;                       // the actuator key currently open

function outDetailRow(tbody, afterTr, act, cols){
  const tr = el('tr','detrow');
  const td = el('td','detcell'); td.colSpan = cols;
  tr.appendChild(td); tr.style.display='none';
  tbody.appendChild(tr);

  afterTr.addEventListener('click',()=>outToggle(act));
  afterTr.title = 'open the controls for this actuator';
  return {tr, td, act, built:false};
}

function outToggle(act){
  const wasOpen = (OUT_OPEN === act);
  /* close everything first — a status table with two drawers open reads badly */
  OUTROWS.act.concat(OUTROWS.servo[1], OUTROWS.servo[2]).forEach(r=>{
    if(!r.det) return;
    r.det.tr.style.display='none';
    r.tr.classList.remove('open');
  });
  OUT_OPEN = null;
  if(wasOpen) return;

  const row = OUTROWS.act.concat(OUTROWS.servo[1], OUTROWS.servo[2]).find(r=>r.det && r.det.act===act);
  if(!row) return;
  OUT_OPEN = act;
  row.tr.classList.add('open');
  row.det.tr.style.display='';
  outBuildDetail(row.det);

  /* show it on the droid too, and open the full part card */
  const parts = (typeof actCadParts==='function') ? actCadParts(act) : [];
  if(parts.length && typeof selectPart==='function') selectPart(parts[0].name);
}

function outBuildDetail(det){
  det.td.innerHTML='';
  /* A <select> contributes its LONGEST OPTION to the cell's min-content width,
     which stretched the whole table past the sidebar. Nesting the controls in
     a width:0 / min-width:100% block makes that contribution zero while the
     block still fills the cell. */
  const host = el('div','detwrap');
  det.td.appendChild(host);
  const act = det.act;
  const parts = (typeof actCadParts==='function') ? actCadParts(act) : [];
  const part  = parts[0] || null;

  /* line 1 — what this actually is, and where it is on the droid */
  const head = el('div','dethead');
  head.appendChild(el('b',null, (typeof actPartLabel==='function' && actPartLabel(act)) || actFriendly(act)));
  const az = (typeof actAzimuth==='function') ? actAzimuth(act) : null;
  head.appendChild(el('span','detsub',
    (part ? part.base : 'no CAD part') + (az===null ? '' : '  ·  '+az.toFixed(0)+'° '+azWord(az))));
  host.appendChild(head);

  /* line 2 — the channel it is wired to */
  const chRow = el('div','detrow2');
  chRow.appendChild(el('span','detlab','Channel'));
  const idx = (typeof assignChannelIndex==='function') ? assignChannelIndex() : {};
  const cur = idx[act];
  const opts = (typeof assignChannelOptions==='function') ? assignChannelOptions() : [];
  if(cur && cur.fixed){
    const f = el('span','asfix', (cur.loc==='dome'?'Dome':'Body')+' ch '+cur.ch);
    f.title = 'fixed by the mod2026 sketch — a compile-time constant';
    chRow.appendChild(f);
  }else if(!opts.length){
    chRow.appendChild(el('span','asfix dim','no editable board — set one in Config'));
  }else{
    const sel = document.createElement('select');
    sel.dataset.detAct = act;
    const o0=document.createElement('option'); o0.value=''; o0.textContent='— not wired —'; sel.appendChild(o0);
    opts.forEach(o=>{
      const e=document.createElement('option'); e.value=o.value; e.textContent=o.label;
      if(cur && o.value === cur.loc+':'+cur.ch) e.selected=true;
      sel.appendChild(e);
    });
    sel.addEventListener('click',e=>e.stopPropagation());
    sel.addEventListener('change',()=>{
      if(cur) chAssign(cur.loc, cur.ch, '');
      if(sel.value){
        const [loc,ch] = sel.value.split(':');
        const use = chFindUse(act, loc, +ch);
        if(use) chRelease(use);
        chAssign(loc, +ch, act);
        lg('mae', (actPartLabel(act)||act)+' → '+(loc==='dome'?'Dome':'Body')+' ch '+ch);
      }else lg('mae', (actPartLabel(act)||act)+' unwired');
      outBuildDetail(det);
      if(typeof buildConfig==='function' && $('cfgHost') && $('cfgHost').querySelector('.boardcard')) buildConfig();
    });
    chRow.appendChild(sel);
  }
  host.appendChild(chRow);

  /* line 3 — drive it */
  const drive = el('div','detrow2');
  drive.appendChild(el('span','detlab','Position'));
  const rng = document.createElement('input');
  rng.type='range'; rng.min=0; rng.max=100; rng.step=1;
  rng.value = Math.round((ACT[act]||0)*100);
  rng.className='detrng';
  rng.addEventListener('click',e=>e.stopPropagation());
  rng.addEventListener('input',()=>{ actSet(act, rng.value/100); readout.textContent=(rng.value/100).toFixed(2); });
  drive.appendChild(rng);
  const readout = el('span','detval', (ACT[act]||0).toFixed(2));
  drive.appendChild(readout);
  host.appendChild(drive);
  det.rng = rng; det.readout = readout;

  const bar2 = el('div','conbar');
  const mk = (label, fn, title)=>{
    const b = el('button','b', label); if(title) b.title=title;
    b.addEventListener('click',e=>{ e.stopPropagation(); fn(); });
    bar2.appendChild(b); return b;
  };
  mk('Open',  ()=>{ actSet(act,1); rng.value=100; readout.textContent='1.00'; });
  mk('Close', ()=>{ actSet(act,0); rng.value=0;   readout.textContent='0.00'; });
  mk('Cycle', ()=>{ actSet(act,1); setTimeout(()=>{ actSet(act,0); rng.value=0; readout.textContent='0.00'; }, 900); },
     'open, hold, and close again — the quickest way to check the travel');
  if(part){
    const col = document.createElement('input');
    col.type='color'; col.className='ascol detcol';
    col.value = (typeof effectivePartHex==='function' ? effectivePartHex(part.name) : '#ffffff') || '#ffffff';
    col.title = 'colour just this part';
    col.addEventListener('click',e=>e.stopPropagation());
    col.addEventListener('input',()=>setPartColor(part.name, col.value));
    bar2.appendChild(col);
  }
  host.appendChild(bar2);

  if(!part){
    const h = el('div','hint prose','No CAD geometry is mapped to this actuator, so nothing will move on screen — the channel and the travel are still real.');
    host.appendChild(h);
  }
}
function buildOutputs(){
  const host=$('outHost'); host.innerHTML='';
  OUTROWS = {servo:{1:[],2:[]}, act:[], mot:[], mae:[]};

  const mkTable=(parent,cols)=>{
    const t=el('table','srv'); const th=el('thead'); const tr=el('tr');
    cols.forEach(c=>{ const e=el('th',c[1]||'',c[0]); tr.appendChild(e); });
    th.appendChild(tr); t.appendChild(th);
    const tb=el('tbody'); t.appendChild(tb); parent.appendChild(t); return tb;
  };
  const bar=()=>{ const td=el('td','tv'); const b=el('div','trav'); const f=el('i'); b.appendChild(f); td.appendChild(b); return {td,f}; };

  if(PROFILE.hasServos){
    for(const b of [1,2]){
      const s=sect(host, 'PCA9685 @ 0x4'+b, b===1?'pwm1 · body':'pwm2 · dome pies');
      const tb=mkTable(s,[['Ch'],['Function'],['Pulse','r'],['Travel']]);
      for(const d of SERVO_DEFS[b]){
        const tr=el('tr', d.act?'clickrow':null);
        tr.appendChild(el('td','ch',d.ch));
        tr.appendChild(el('td','nm',d.name));
        const pw=el('td','pw r','0'); tr.appendChild(pw);
        const bb=bar(); tr.appendChild(bb.td);
        tb.appendChild(tr);
        /* mod2026 has no actuator table, so these ARE the rows you click */
        const det = d.act ? outDetailRow(tb, tr, d.act, 4) : null;
        OUTROWS.servo[b].push({tr,pw,fill:bb.f,board:b,ch:d.ch,det});
      }
    }
  }

  if(PROFILE.hasMaestro){
    const imported = CFG.maestroSource==='imported' && MSTR.loaded;
    const s=sect(host,'Pololu Maestro', imported ? xmlEsc(MSTR.fileName) : 'built-in stand-ins');
    const tb=mkTable(s,[['Slot'],['Trigger'],[imported?'Subroutine':'Mapped sequence'],['State','r']]);
    const trig=['RT+▲','RT+▶','RT+▼','RT+◀','LT+▲','LT+▶','LT+▼','LT+◀'];
    for(let n=0;n<8;n++){
      const tr=el('tr');
      tr.appendChild(el('td','ch',n));
      tr.appendChild(el('td','nm',trig[n]));
      const nm=el('td',null,'—'); tr.appendChild(nm);
      const st=el('td','pw r','idle'); tr.appendChild(st);
      tb.appendChild(tr);
      OUTROWS.mae.push({tr,nm,st,n});
    }
    const s2=sect(host,'Actuators','driven by the mapped sequences');
    const tb2=mkTable(s2,[['#'],['Part'],['Pos','r'],['Travel']]);
    /* every actuator that exists — a dome-panel sequence must not look idle
       here just because the old hard-coded list stopped at pie10 */
    const parts = Object.keys(ACT).map(k=>[k, (typeof actFriendly==='function'?actFriendly(k):k)]);
    parts.forEach(([k,label],i)=>{
      const tr=el('tr','clickrow');
      tr.appendChild(el('td','ch',k));
      tr.appendChild(el('td','nm',label));
      const v=el('td','pw r','0'); tr.appendChild(v);
      const bb=bar(); tr.appendChild(bb.td);
      tb2.appendChild(tr);
      const det = outDetailRow(tb2, tr, k, 4);
      OUTROWS.act.push({tr,v,fill:bb.f,key:k,det});
    });
    const h2=el('div','hint prose');
    h2.innerHTML='Click any row to open it — the part is selected on the model, and you get its channel, a position slider and open/close so you can prove the travel before you wire it.';
    s2.appendChild(h2);
  }

  const s3=sect(host,'Motor controllers', PROFILE.footPWM()?'hub ESCs + Syren':'Sabertooth + Syren');
  const tb3=mkTable(s3,[['Bus'],['Device'],['Cmd','r'],['Level']]);
  const rows = PROFILE.footPWM()
    ? [['pin 44','Left foot ESC','leftFoot'],['pin 45','Right foot ESC','rightFoot'],['Serial2','Syren10 dome','dome']]
    : [['Serial1','Sabertooth drive','drive'],['Serial1','Sabertooth turn','turn'],['Serial2','Syren10 dome','dome']];
  rows.forEach(([bus,nm,key])=>{
    const tr=el('tr');
    tr.appendChild(el('td','ch',bus));
    tr.appendChild(el('td','nm',nm));
    const v=el('td','pw r','0'); tr.appendChild(v);
    const bb=bar(); tr.appendChild(bb.td);
    tb3.appendChild(tr);
    OUTROWS.mot.push({tr,v,fill:bb.f,key});
  });

  const hint=el('div','hint prose');
  hint.innerHTML = PROFILE.hasServos
    ? 'Both sketches call <code>setTimeout(950)</code> on the Sabertooth and the Syren. When a controller stops receiving packets for that long it cuts its motor — the <b>TIMEOUT</b> flag below and in the HUD shows when that happens.'
    : 'The Maestro stores the actual sequences, so the sim can\'t know them. Pick what each slot should do in the Config tab so it matches your board.';
  host.appendChild(hint);
}

function updateOutputs(){
  /* keep an open drawer's slider honest while a sequence or the sketch drives
     the same actuator — but never fight the user's own drag */
  if(OUT_OPEN && document.activeElement && document.activeElement.className !== 'detrng'){
    const row = OUTROWS.act.concat(OUTROWS.servo[1], OUTROWS.servo[2]).find(r=>r.det && r.det.act===OUT_OPEN);
    if(row && row.det.rng){
      const v = ACT[OUT_OPEN] || 0;
      row.det.rng.value = Math.round(v*100);
      row.det.readout.textContent = v.toFixed(2);
    }
  }
  if(PROFILE.hasServos){
    for(const b of [1,2]) for(const r of OUTROWS.servo[b]){
      const s=SERVO[b][r.ch];
      r.pw.textContent = Math.round(s.pulse);
      r.fill.style.width = (servoTravel(b,r.ch)*100).toFixed(0)+'%';
      r.tr.classList.toggle('moving', s.moving);
    }
  }
  for(const r of OUTROWS.act){
    r.v.textContent = ACT[r.key].toFixed(2);
    r.fill.style.width = (ACT[r.key]*100).toFixed(0)+'%';
    r.tr.classList.toggle('moving', Math.abs(ACT_T[r.key]-ACT[r.key])>0.005);
  }
  const imported = CFG.maestroSource==='imported' && MSTR.loaded;
  for(const r of OUTROWS.mae){
    if(imported){
      const sub = MSTR.subs[r.n];
      r.nm.textContent = sub ? (sub.kind==='frame' ? sub.name+'  ⚠ helper' : sub.name) : '— no sub '+r.n+' —';
    }else{
      const id = CFG.maestroScript ? CFG.maestroScript[r.n] : 'none';
      r.nm.textContent = ANIMS[id] ? ANIMS[id].label : id;
    }
    const run = MAESTRO.slot[r.n];
    r.st.textContent = run ? (run.kind==='seq' ? ('frame '+run.i) : (Math.round(run.t)+' ms')) : 'idle';
    r.tr.classList.toggle('moving', !!run);
  }
  for(const r of OUTROWS.mot){
    let v, max=127, to=false;
    if(r.key==='leftFoot' || r.key==='rightFoot'){ v=MOT[r.key]; max=180; }
    else if(r.key==='dome'){ v=MOT.dome; to=MOT.domeTO; }
    else { v=MOT[r.key]; to=MOT.driveTO; }
    r.v.textContent = v + (to && v!==0 ? ' ⏱' : '');
    const lvl = (r.key==='leftFoot'||r.key==='rightFoot') ? Math.abs(v-90)/90 : Math.abs(v)/127;
    r.fill.style.width = (lvl*100).toFixed(0)+'%';
    r.tr.classList.toggle('moving', to && v!==0);
  }
}

/* ---- controls pane ---- */
function buildMap(){
  $('hwBlurb').classList.add('prose');                 // the sketch blurb is a paragraph, not a caption
  $('hwBlurb').innerHTML = '<code>'+PROFILE.file+'</code><br>'+PROFILE.blurb;
  $('sndChipName').textContent = PROFILE.audio;
  $('sndBus').textContent = PROFILE.audio==='DY-SV5W' ? '· Serial0 (DYPlayerArduino)' : '· Serial0';
  const host=$('mapHost'); host.innerHTML='';
  for(const title in PROFILE.map){
    const s=sect(host,title);
    PROFILE.map[title].forEach(([a,b])=>kvRow(s,a,b));
  }
}

/* ---- config pane ----
   Since 2026-07-27 this is THE configuration surface: the build answers,
   the electronics and their pin maps (moved off the Model tab), the panel
   assignment, the paint (moved off the startup overlay) and the sketch
   constants, in one scrollable pane with a jump bar at the top. */
function cfgAnchor(host, id, label){
  const a = el('div'); a.id = id; a.dataset.cfgSection = label;
  host.appendChild(a); return a;
}
function buildCfgNav(host, items){
  const nav = el('div','cfgnav');
  items.forEach(([id,label])=>{
    const b = el('button','b', label);
    b.addEventListener('click',()=>{
      const t = $(id);
      if(t) t.scrollIntoView({behavior:'smooth', block:'start'});
    });
    nav.appendChild(b);
  });
  host.appendChild(nav);
}

function buildConfig(){
  const host=$('cfgHost'); host.innerHTML='';

  buildCfgNav(host, [['cfgSketch','Sketch'], ['cfgPanels','Panels'], ['cfgFiles','Files']]);

  /* ---- the build lives in the SETUP now ----
     Mike, 2026-07-27: "anything that's in the setup should be removed from
     the config tab". So this tab is the sketch's own numbers — the things
     you tune against a running droid — and nothing else. What is bolted in,
     which board is where, which channel drives which panel and what colour
     it is are all setup questions, and repeating them here only invited the
     two copies to disagree. */
  cfgAnchor(host,'cfgBuild','Build');
  const sB = sect(host,'This droid', buildConfigured() ? 'configured' : 'not set up yet');
  const sum = el('div','bsum');
  buildSummaryRows().forEach(r=>{
    const row = el('div','bsumrow'); row.style.gridTemplateColumns='118px 1fr';
    row.appendChild(el('div','bsk', r.title));
    const v = el('div','bsv', r.label);
    if(r.sim === 'park') v.appendChild(el('span','optbadge park','not simulated'));
    row.appendChild(v);
    sum.appendChild(row);
  });
  sB.appendChild(sum);
  const sBar = el('div','conbar');
  const bOpen = el('button','b prim','Open the setup');
  bOpen.title = 'hardware, wiring, boards, panels, colours and the backdrop — all in one place';
  bOpen.addEventListener('click',()=>wizOpen(0));
  sBar.appendChild(bOpen);
  sB.appendChild(sBar);
  const con = buildConflicts().filter(c=>c.kind !== 'park');
  if(con.length){
    const n = el('div','note');
    n.innerHTML = '<b>These do not line up</b><br>' + con.map(c=>'· '+c.text).join('<br>');
    sB.appendChild(n);
  }
  const hB = el('div','hint prose');
  hB.innerHTML = 'Everything above is set in the setup. What follows is the <b>sketch\'s own constants</b> — speeds, deadzones, endpoints and slot mappings — which you tune against a droid that is already wired.';
  sB.appendChild(hB);

  /* ---- the sketch ---- */
  cfgAnchor(host,'cfgSketch','Sketch');
  /* the sketch bug notes are real paragraphs — .prose gives them the sans
     and calms the inline bolds; the amber/cyan border still says warn/info */
  PROFILE.notes.forEach(n=>{
    const d=el('div','note'+(n.k==='info'?' cy':'')+' prose');
    d.innerHTML=n.h; host.appendChild(d);
  });

  if(PROFILE.id==='mod2026'){
    const l=el('label','sw');
    const cb=document.createElement('input'); cb.type='checkbox'; cb.id='cbFixDome'; cb.checked=SIM.fixDomeBug;
    cb.addEventListener('change',e=>{ SIM.fixDomeBug=e.target.checked; lg('sys','dome automation fix '+(SIM.fixDomeBug?'ENABLED':'disabled')); });
    l.appendChild(cb); l.appendChild(document.createTextNode('Apply the dome-automation fix'));
    host.appendChild(l);
  }

  /* THE SIM BOX IS A RATE, NOT A FREE NUMBER.
     These inputs had no min and no max, so `maestroRate` could be typed
     negative — and a negative ramp rate makes every actuator step AWAY from
     its target for ever (app/animate.js has the whole story and the clamp
     that now catches it). main.js has always clamped CFG.loopHz at the
     point of use, 20–2000; these are the same limits said out loud, on the
     box, where a typed value can be refused before it ever reaches the
     model. Anything not named here keeps its old free-number behaviour —
     the entry is the claim that we know what a sane range IS. */
  const CFG_LIMITS = {
    loopHz:     {min:20,   max:2000},
    maestroRate:{min:0.05, max:60},
    servoSpeed: {min:10,   max:20000},
    maxSpeed:   {min:0.1,  max:20},
    maxYaw:     {min:0.1,  max:20},
    domeRate:   {min:0.1,  max:30}
  };
  const numGrid=(parent,list)=>{
    const g=el('div','cfggrid2');
    list.forEach(([k,label])=>{
      const r=el('div','cfgrow');
      const lb=el('label',null,label); lb.title=k+'  (default '+PROFILE.defaults[k]+')';
      const i=document.createElement('input');
      i.type='number'; i.value=CFG[k];
      i.step=(k==='maxSpeed'||k==='maxYaw'||k==='domeRate'||k==='maestroRate')?0.1:1;
      const lim=CFG_LIMITS[k];
      if(lim){
        i.min=lim.min; i.max=lim.max;
        lb.title += '  ·  ' + lim.min + '–' + lim.max;
      }
      i.addEventListener('change',()=>{
        let v=parseFloat(i.value); if(isNaN(v)){ i.value=CFG[k]; return; }
        /* the browser only ENFORCES min/max on a stepper click or a form
           submit — a typed number arrives whatever it says — so the box is
           pulled back here and the input repainted with what was taken */
        if(lim){ v=clamp(v, lim.min, lim.max); if(v!==parseFloat(i.value)) i.value=v; }
        CFG[k]=v;
        if(k==='vol') SND.vol=v;
        if(k==='FOOT_CONTROLLER'){
          CFG[k]=v?1:0; i.value=CFG[k];
          MOT.leftFoot=MOT.rightFoot=90; MOT.drive=MOT.turn=0; MOT.driveAt=MOT.footAt=-1e9;
          lg('sys','FOOT_CONTROLLER = '+CFG[k]+(CFG[k]?'  (individual ESCs / hub motors)':'  (Sabertooth serial)'));
          buildOutputs();
        }
        if(k.indexOf('DRIVESPEED')===0 && [CFG.DRIVESPEED1,CFG.DRIVESPEED2,CFG.DRIVESPEED3].indexOf(FW.drivespeed)<0) FW.drivespeed=CFG.DRIVESPEED1;
        lg('sys',`config: ${k} = ${CFG[k]}`);
      });
      r.appendChild(lb); r.appendChild(i); g.appendChild(r);
    });
    parent.appendChild(g);
  };

  const s1=sect(host,'Speed &amp; feel', PROFILE.footPWM()?'PWM hub':'serial');
  numGrid(s1, PROFILE.cfg.speed);

  const s2=sect(host,'Input mapping');
  const l2=el('label','sw');
  const cb2=document.createElement('input'); cb2.type='checkbox'; cb2.checked=FW.isLeftStickDrive;
  cb2.addEventListener('change',e=>{ FW.isLeftStickDrive=e.target.checked; applyStickMapping(); axHint(); lg('sys','isLeftStickDrive = '+FW.isLeftStickDrive); });
  l2.appendChild(cb2); l2.appendChild(document.createTextNode('isLeftStickDrive'));
  s2.appendChild(l2);
  const ah=el('div','hint'); ah.id='axisHint'; s2.appendChild(ah);

  if(PROFILE.hasServos){
    const s3=sect(host,'Body servo endpoints','0x40'); numGrid(s3, PROFILE.cfg.body);
    const s4=sect(host,'Dome pie panels','0x41');      numGrid(s4, PROFILE.cfg.pie);
  }

  if(PROFILE.hasMaestro){
    const s5=sect(host,'Maestro script slots','what each sequence does');
    const trig=['RT+▲','RT+▶','RT+▼','RT+◀','LT+▲','LT+▶','LT+▼','LT+◀'];
    for(let n=0;n<8;n++){
      const r=el('div','cfgrow'); r.style.gridTemplateColumns='58px 1fr';
      r.appendChild(el('label',null, n+' · '+trig[n]));
      const sel=document.createElement('select'); sel.className='msel';
      ANIM_IDS.forEach(id=>{
        const o=document.createElement('option'); o.value=id; o.textContent=ANIMS[id].label;
        if(CFG.maestroScript[n]===id) o.selected=true;
        sel.appendChild(o);
      });
      sel.addEventListener('change',()=>{ CFG.maestroScript[n]=sel.value; lg('sys',`script ${n} → ${ANIMS[sel.value].label}`); });
      r.appendChild(sel); s5.appendChild(r);
    }
    const h=el('div','hint prose');
    h.innerHTML='These sequences live on the Maestro itself, so set them to match what you actually loaded onto the board. The sim only knows the slot number the sketch fires.';
    s5.appendChild(h);
  }

  const s6=sect(host,'Simulation'); numGrid(s6, PROFILE.cfg.sim);
  if(PROFILE.hasServos){
    const h=el('div','hint prose');
    h.innerHTML='Loop rate decides how long the frame-counted arm animations take — they run for 1000 passes, so 250 Hz ≈ 4 s.';
    s6.appendChild(h);
  }

  /* ---- panel <-> servo, back on this tab (v1.39.2) ----
     It was moved out in July with the rest of the setup answers ("anything
     that's in the setup should be removed from the config tab"), and that
     was right for the QUESTIONS — which board, which sketch, what colour.
     This one is not a question, it is a table you come back to: a linkage
     gets rebuilt, a servo gets moved to a spare channel, and you want the
     mapping in front of you without walking through a wizard. It is the
     SAME builder the setup's Panels step uses, so the two cannot drift. */
  cfgAnchor(host,'cfgPanels','Panels');
  if(typeof buildAssignSect === 'function'){
    const sP = sect(host,'Panels & servos','which channel moves what');
    const hP = el('div','hint prose');
    hP.innerHTML = 'The same table as the setup\'s <b>Panels</b> step — part first, with a <b>Test</b> on every row. '
      + 'A part has exactly one channel: giving a panel a channel that another one holds moves it, it does not share it. '
      + 'This mapping belongs to YOUR droid, which is why an imported servo config never carries it.';
    sP.appendChild(hP);
    buildAssignSect(host, buildConfig);
  }

  cfgAnchor(host,'cfgFiles','Files');
  const sIO=sect(host,'Whole setup','one file, everything');
  if(typeof setupButtons==='function'){
    const m=el('div','hint'); m.id='expMsg2';
    setupButtons(sIO, m);
    sIO.appendChild(m);
    const h=el('div','hint prose');
    h.innerHTML='Profile + constants, Maestro board/channels/sequences, part mapping, your names, colours, groups, themes and the electronics choice — restore it all on any machine, or drop the <code>.json</code> anywhere on the window.';
    sIO.appendChild(h);
  }

  const s7=sect(host,'Export');
  const bar=el('div','conbar');
  const bE=el('button','b prim','Copy .ino constants');
  const bD=el('button','b','Restore defaults');
  bar.appendChild(bE); bar.appendChild(bD); s7.appendChild(bar);
  const msg=el('div','hint'); msg.id='expMsg'; s7.appendChild(msg);
  bE.addEventListener('click',()=>doExport(msg));
  bD.addEventListener('click',()=>{
    CFG = JSON.parse(JSON.stringify(PROFILE.defaults));
    FW.drivespeed=CFG.DRIVESPEED1; SND.vol=CFG.vol;
    buildConfig(); buildOutputs();
    if(typeof rebuildMaestroUI==='function') rebuildMaestroUI();   // maestroSource just reset
    lg('sys','config restored to sketch defaults');
    $('expMsg').textContent='Defaults restored.';
  });

  axHint();
}
function axHint(){
  const e=$('axisHint'); if(!e) return;
  const swap = PROFILE.swapsStickButtons;
  e.innerHTML = (FW.isLeftStickDrive
    ? 'throttle <b>LeftHatY</b> · turn <b>LeftHatX</b> · dome <b>RightHatX</b>'
    : 'throttle <b>RightHatY</b> · turn <b>RightHatX</b> · dome <b>LeftHatX</b>')
    + ' · speed <b>'+FW.speedSelectButton+'</b> · HP <b>'+FW.hpLightToggleButton+'</b>'
    + (swap ? '' : '<br>this sketch assigns L3/R3 the same in both branches, so they never swap');
}

function doExport(msg){
  const L=['// ---- generated by the R2-D2 simulator ----','// profile: '+PROFILE.name+'  ('+PROFILE.file+')',
    '// WARNING: servo endpoint values are simulator placeholders, not measured on your hardware.',
    '// Verify each channel\'s endpoints and direction at low speed before running at full speed.',''];
  const push=(k,type)=>{ if(CFG[k]!==undefined) L.push(`${type} ${k} = ${CFG[k]};`); };
  if(PROFILE.id==='maestro25') L.push(`#define FOOT_CONTROLLER ${CFG.FOOT_CONTROLLER}`, '');
  ['DRIVESPEED1','DRIVESPEED2','DRIVESPEED3'].forEach(k=>push(k,'const byte'));
  push('TURNSPEED', PROFILE.id==='maestro25'?'const float':'const byte');
  push('DOMESPEED','const byte'); push('RAMPING','const byte');
  push('DOMEDEADZONERANGE','const byte'); push('DRIVEDEADZONERANGE','const byte');
  if(CFG.RampingDeadzoneDelay!==undefined && PROFILE.id==='maestro25') L.push(`int RampingDeadzoneDelay = ${CFG.RampingDeadzoneDelay};`);
  if(CFG.CalibrationSpeed!==undefined && PROFILE.id==='maestro25')     L.push(`int CalibrationSpeed = ${CFG.CalibrationSpeed};`);
  if(PROFILE.id==='maestro25') L.push(`#define leftDirection ${CFG.leftDirection}`, `#define rightDirection ${CFG.rightDirection}`);
  L.push(`boolean isLeftStickDrive = ${FW.isLeftStickDrive};`);
  L.push(PROFILE.audio==='DY-SV5W' ? `byte vol = ${CFG.vol};` : `int vol = ${CFG.vol};`);
  if(PROFILE.hasServos){
    L.push('');
    ['LeftDoorOpen','LeftDoorClose','RightDoorOpen','RightDoorClose','GripperOpen','GripperClose',
     'GripperArmIn','GripperArmOut','InterOut','InterIn','InterArmIn','InterArmOut',
     'UpperUtilOut','UpperUtilIn','LowerUtilOut','LowerUtilIn',
     'dataportDoorOpen','dataportDoorClose','chargebayDoorOpen','chargebayDoorClose']
      .forEach(k=>L.push(`int ${k}=${CFG[k]};`));
    L.push('','int pieChannel[] = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };');
    L.push('int pieOpen[]  = { '+Array(11).fill(CFG.pieOpen ).join(',')+' };');
    L.push('int pieClose[] = { '+Array(11).fill(CFG.pieClose).join(',')+' };');
  }
  if(PROFILE.hasMaestro){
    L.push('','// Maestro slot → sequence, as configured in the simulator:');
    CFG.maestroScript.forEach((id,n)=>L.push(`//   restartScript(${n})  =  ${ANIMS[id].label}`));
  }
  const txt=L.join('\n');
  navigator.clipboard.writeText(txt).then(
    ()=>{ msg.textContent='Copied to clipboard ('+L.length+' lines).'; },
    ()=>{ msg.textContent='Clipboard blocked — dumped to the Serial tab instead.'; lg('sys','\n'+txt); }
  );
}

function rebuildProfileUI(){
  buildFwSelector();                                   // keeps the header tag honest
  /* the header's Sequence workspace button dims under mod2026 (.blocked,
     still clickable — wsSet('seq') refuses with the toast), same gate as
     the strip door below */
  if(typeof buildWsSel==='function') buildWsSel();
  document.querySelectorAll('#fwsel button').forEach(x=>x.classList.toggle('act', x.dataset.id===SIM.profile));
  buildMap(); buildOutputs(); buildConfig();
  const tab=$('tabMae');
  if(tab) tab.style.opacity = PROFILE.hasMaestro ? '' : '.45';
  if(typeof buildMaestroPane==='function') buildMaestroPane();
  if(typeof buildCadPane==='function') buildCadPane();
  const seqBtn=document.querySelector('#stripmode .smbtn[data-m="seq"]');
  /* v1.27.0: the door is "can this build hold sequences", not "has a
     Pololu board". A PCA9685 build runs them on the MaestroPCA
     co-processor and exports sequences.h instead of a .mstr. */
  const canSeq = (typeof buildCanSequence === 'function') ? buildCanSequence() : PROFILE.hasMaestro;
  if(seqBtn){ seqBtn.disabled=!canSeq;
    seqBtn.title=canSeq?'':'this build has no servo board to hold sequences'; }
  if(!canSeq && EDIT.active) setStripMode('pad');
  else if(EDIT.active) buildSequencer();
  const dz=$('cbAutoscroll'); if(dz) dz.checked=true;
}
