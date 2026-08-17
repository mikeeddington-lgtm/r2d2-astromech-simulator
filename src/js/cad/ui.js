'use strict';
/* =====================================================================
   CAD pane — model source, part mapping, visibility, alignment
   ===================================================================== */
const CAD_ACT_CHOICES = [
  ['— static —',''],
  ['pie 0','pie0'],['pie 1','pie1'],['pie 2','pie2'],['pie 3','pie3'],['pie 4','pie4'],['pie 5','pie5'],
  ['pie 6','pie6'],['pie 7','pie7'],['pie 8','pie8'],['pie 9','pie9'],['pie 10','pie10'],['pie 11','pie11'],
  ['left body door (ch0)','doorL'],['right body door (ch1)','doorR'],
  ['rear-left door','doorRL'],['rear-right door','doorRR'],
  ['upper utility arm','utilUp'],['lower utility arm','utilLo'],
  ['dataport door','dataport'],['chargebay door','chargebay'],
  ['small long door','smallDoor'],['drawer','drawer'],
  ['gripper arm','gripArm'],['gripper claw','claw'],
  ['interface arm','interArm'],['interface tool','interTool']
].concat(Array.from({length:14},(_,i)=>['side panel '+i,'panel'+i]));
const KIND_LABEL = {shell:'Shell', pie:'Dome pie panels', panel:'Dome side panels',
                    anim:'Doors & arms', leg:'Legs & skirt', internal:'Internal mechanism', outlier:'Loose hardware'};

/* ---- what is on the stage ----------------------------------------------
   Mike asked for one selection that decides which model is displayed and
   which one works. It sits at the very top because everything below it is
   the DROID's — the visibility switches, the ride height, the part table —
   and those had been sitting above two other models they say nothing about. */
function buildModelSect(host){
  const cur = modelGet();
  const s = sect(host, 'On the stage', modelById(cur).label);
  const bar = el('div','conbar');
  MODELS.forEach(m=>{
    const b = el('button','b'+(m.id===cur?' act':''), m.label);
    b.title = m.blurb;
    b.addEventListener('click',()=>modelSet(m.id));
    bar.appendChild(b);
  });
  s.appendChild(bar);

  const h = el('div','hint prose'); h.textContent = modelById(cur).blurb;
  s.appendChild(h);

  /* what the selection actually costs you, per model */
  const st = el('div','hint');
  if(cur === 'mouse' && typeof MOUSE !== 'undefined' && MOUSE.loaded){
    const S = MOUSE.spec, m = MOUSE.stats;
    st.innerHTML = m.parts+' parts · '+m.tris.toLocaleString()+' triangles · ~'+m.draws+' draw calls<br>'
      + 'wheelbase <b>'+(S.wheelbase*1000).toFixed(0)+' mm</b> · track <b>'+(S.trackF*1000).toFixed(0)+' mm</b> · '
      + 'wheels <b>'+(S.wheelR*2000).toFixed(0)+' mm</b> · hitch <b>'+(S.hitchBack*1000).toFixed(0)+' mm</b> behind the driven axle';
  }else if(cur === 'frik' && typeof ANZ_ACTS !== 'undefined'){
    st.innerHTML = ANZ_ACTS.length+' face channels · '+ANZ.whisk.length+' whiskers · fully procedural, no mesh file'
      + '<br>'+ANZ_ACTS.map(a=>a.label.replace(/^Frik /,'')).join(' · ');
  }else if(cur === 'droid' && CAD.loaded && CAD.stats){
    st.innerHTML = CAD.stats.parts+' parts · '+CAD.stats.tris.toLocaleString()+' triangles · '
      + CAD.stats.moving+' moving · ~'+CAD.stats.draws+' draw calls';
  }else if(cur === 'builder' && typeof MB !== 'undefined'){
    const joints = MB.parts.filter(p=>p.type==='hinge'||p.type==='ball').length;
    st.innerHTML = MB.parts.length+' part(s) · '+joints+' joint(s) · 50 mm grid';
  }
  if(st.innerHTML) s.appendChild(st);

  const n = el('div','note cy prose');
  n.innerHTML = '<b>One at a time.</b> Only the selected model is on the stage, driven by the pad and registered in the '
    + 'output tables — so the Outputs list, the sequencer and the wiring sheet describe what you are actually looking at. '
    + '<b>The sketch keeps running either way:</b> this moves a model off the stage, it does not switch the firmware off.'
    + (cur === 'mouse'
        ? ' The mouse has the sticks now, so the sketch is seeing them <b>centred</b> — that is a second receiver on the bench, not a fault.'
        : '');
  s.appendChild(n);
  return cur;
}

/* ---- the two non-droid models get their own small panel, because none of
   the droid sections below apply to them ---- */
function buildFrikPane(host){
  const s = sect(host,'Anzellan head','11-channel face rig');
  const bar = el('div','conbar');
  [['frik_talk','Talk'],['frik_blink','Blink'],['frik_surprise','Surprise'],
   ['frik_grumble','Grumble'],['frik_nod_yes','Nod'],['frik_shake_no','Shake']].forEach(([id,label])=>{
    const b = el('button','b',label);
    b.addEventListener('click',()=>{
      const a = ANIMS[id]; if(!a) return;
      MAESTRO.slot['frik'] = {kind:'anim', id, t:0, i:0};
      lg('sys','stage: '+a.label);
    });
    bar.appendChild(b);
  });
  s.appendChild(bar);
  const l = el('label','sw');
  const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = ANZ.idle;
  cb.addEventListener('change',()=>{ ANZ.idle = cb.checked; if(!cb.checked) anzResetPose(); });
  l.appendChild(cb);
  l.appendChild(document.createTextNode('Idle behaviour — blink, glance around, chatter along with the droid'));
  s.appendChild(l);
  const h = el('div','hint prose');
  h.innerHTML = 'Idle only touches channels <b>no Maestro owns</b>. Wire the jaw to a channel and the board has it — '
    + 'a lifelike wobble laid over a real sequence would misrepresent the servo.';
  s.appendChild(h);
  const bar2 = el('div','conbar');
  const bs = el('button','b','Build its Maestro layout');
  bs.title = '11 channels and eight routines, sized for a Mini Maestro 12';
  bs.addEventListener('click',()=>{ makeStarter('anzellan'); CFG.maestroSource='imported'; rebuildMaestroUI();
    lg('mae','Anzellan face layout generated'); });
  bar2.appendChild(bs); s.appendChild(bar2);
}

function buildMousePane(host){
  const s = sect(host,'Polar Mouse','drive it with the left stick');
  const h = el('div','hint prose');
  h.innerHTML = '<b>Left stick</b> — up/down is throttle, left/right is steering. It steers like a car and '
    + '<b>cannot turn on the spot</b>: the CAD has a steering rack and a fixed rear axle, so the model does not pretend otherwise. '
    + 'Reverse into a corner and the chariot jack-knifes, because it does.';
  s.appendChild(h);
  const bar = el('div','conbar');
  const bR = el('button','b','Reset to its mark');
  bR.addEventListener('click',()=>{ mouseResetPose(); modelFrame('mouse'); });
  const bS = el('button','b','Straighten the chariot');
  bS.addEventListener('click',()=>{ MOUSE.chYaw = MOUSE.yaw; });
  bar.appendChild(bR); bar.appendChild(bS);
  s.appendChild(bar);
  if(MOUSE.loaded){
    const hint = el('div','hint prose');
    hint.innerHTML = 'Its <code>.mtl</code> is not in the project folder, so the colours are read off the material names '
      + 'and each part\'s role. Drop the real <code>.mtl</code> next to the OBJ and re-run <code>cad/mouse.py</code> to use the '
      + 'exported ones instead.';
    s.appendChild(hint);
  }
}

/* =====================================================================
   MODEL BUILDER PANE — the parts bin and the selected part's properties
   card. This is the "which panel the Model tab draws" seam scene/models.js
   describes: buildCadPane() routes here exactly the way it routes to
   buildFrikPane()/buildMousePane() above, once PREFS.model==='builder'.

   The channel dropdowns below are a deliberate COPY of the Port row in
   cad/select.js's buildSelCard() — same "clear every other owner, then
   set" rule — rather than a shared helper, because cad/select.js is not
   this file's to edit and the two pickers are one screenful of markup
   apart in intent even if they read alike.
   ===================================================================== */
function buildBuilderPane(hostOuter){
  /* everything below lives inside one .mbpane wrapper so 14-builder.css can
     scope its rules (bin buttons, steppers, the select dropdowns) without
     leaking into the droid's own sections */
  const host = el('div','mbpane');
  hostOuter.appendChild(host);
  const s = sect(host, 'Parts bin', MB.parts.length + ' of ' + MB_HARD_CAP);
  const bin = el('div','mbbin');
  MB_PRIM_ORDER.forEach(type=>{
    const def = MB_PRIM[type];
    const b = el('button','mbbtn', 'Add ' + def.label);
    b.disabled = mbAtHardCap();
    b.title = def.joint
      ? 'a ' + def.label.toLowerCase() + ' — ' + def.joint + ' driven channel' + (def.joint > 1 ? 's' : '')
      : 'a rigid ' + def.label.toLowerCase();
    b.addEventListener('click', ()=>{ mbAddPart(type); });
    bin.appendChild(b);
  });
  s.appendChild(bin);

  const capNote = mbSoftCapNote();
  if(capNote) s.appendChild(el('div','mbwarn', capNote));
  if(mbAtHardCap()) s.appendChild(el('div','mbwarn hard', MB_HARD_CAP + ' parts is the cap for one mechanism — delete one to add another.'));

  const h = el('div','hint prose');
  h.innerHTML = 'Click a part on the stage to select it. New parts spawn on the base plate’s <b>50 mm grid</b>. '
    + 'Snap one onto another to make it a child — rotate a hinge or a ball joint and everything riding on it turns with it.';
  s.appendChild(h);

  mbPropsCard(host);
}

function mbAxisRow(label, rec, field, step, fmt, onStep){
  const r = el('div','selrow');
  r.appendChild(el('label',null,label));
  const grp = el('div','mbaxes');
  ['x','y','z'].forEach(axis=>{
    const cell = el('div','mbaxis');
    cell.appendChild(el('span','mbaxlab', axis.toUpperCase()));
    const bm = el('button','mbstep','−');
    const val = el('span','mbval', fmt(rec[field][axis]));
    const bp = el('button','mbstep','+');
    bm.title = 'step down'; bp.title = 'step up';
    bm.addEventListener('click', ()=>onStep(axis, -step));
    bp.addEventListener('click', ()=>onStep(axis, step));
    cell.appendChild(bm); cell.appendChild(val); cell.appendChild(bp);
    grp.appendChild(cell);
  });
  r.appendChild(grp);
  return r;
}

/* every servo channel, current owner named — the same list cad/select.js's
   Port row builds, just written fresh here rather than shared */
function mbChannelSelect(act){
  const sel = document.createElement('select');
  const o0 = document.createElement('option'); o0.value=''; o0.textContent='— not connected —';
  sel.appendChild(o0);
  MSTR.channels.forEach(c=>{
    if(!/^servo/i.test(c.mode)) return;
    const o = document.createElement('option'); o.value=c.i;
    o.textContent = 'ch '+c.i+' — '+(c.name||'(unnamed)') + (c.act && c.act!==act ? '  (now: '+c.act+')' : '');
    if(c.act===act) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change',()=>{
    MSTR.channels.forEach(c=>{ if(c.act===act) c.act=''; });   // one channel per part, same rule everywhere
    if(sel.value!=='') MSTR.channels[+sel.value].act = act;
    if(typeof rebuildMaestroUI==='function') rebuildMaestroUI();
    if(typeof boardVizSync==='function') boardVizSync();
    buildCadPane();
  });
  return sel;
}

function mbPropsCard(host){
  const rec = MB.sel ? mbFind(MB.sel) : null;
  if(!rec || rec.id === 'base'){
    const s = sect(host, 'Selected part', 'none');
    s.appendChild(el('div','hint','Click a part on the stage, or add one from the bin above.'));
    return;
  }
  const s = sect(host, 'Selected part', mbPartLabel(rec));

  const r0 = el('div','selrow');
  r0.appendChild(el('label',null,'Name'));
  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = rec.name || '';
  inp.placeholder = mbTypeLabel(rec.type);
  inp.addEventListener('change', ()=>{ mbRename(rec.id, inp.value); buildCadPane(); });
  r0.appendChild(inp);
  s.appendChild(r0);

  s.appendChild(mbAxisRow('Position', rec, 'pos', MB_GRID, v=>v.toFixed(2)+' m',
    (axis,d)=>{ mbMovePart(rec.id, axis, d); buildCadPane(); }));
  s.appendChild(mbAxisRow('Rotation', rec, 'rot', 90, v=>v+'°',
    (axis,d)=>{ mbRotatePart(rec.id, axis, d); buildCadPane(); }));

  const r3 = el('div','selrow');
  r3.appendChild(el('label',null,'Attach to'));
  const attSel = document.createElement('select');
  const descendants = mbDescendants(rec.id);
  const optBase = document.createElement('option'); optBase.value='base'; optBase.textContent='Base plate';
  if(rec.parent==='base') optBase.selected = true;
  attSel.appendChild(optBase);
  MB.parts.forEach(p=>{
    if(p.id===rec.id || descendants.has(p.id)) return;
    const o = document.createElement('option'); o.value=p.id; o.textContent = mbPartLabel(p);
    if(rec.parent===p.id) o.selected = true;
    attSel.appendChild(o);
  });
  attSel.addEventListener('change', ()=>{ mbSetAttach(rec.id, attSel.value); buildCadPane(); });
  r3.appendChild(attSel);
  s.appendChild(r3);

  if(rec.type === 'hinge'){
    const r4 = el('div','selrow');
    r4.appendChild(el('label',null,'Axis'));
    const axSel = document.createElement('select');
    ['x','y','z'].forEach(ax=>{
      const o = document.createElement('option'); o.value=ax; o.textContent = ax.toUpperCase();
      if((rec.axis||'y')===ax) o.selected = true;
      axSel.appendChild(o);
    });
    axSel.addEventListener('change', ()=>{ mbSetAxis(rec.id, axSel.value); buildCadPane(); });
    r4.appendChild(axSel);
    s.appendChild(r4);
  }

  if(rec.type === 'hinge' || rec.type === 'ball'){
    s.appendChild(el('div','selgh','Channels'));
    if(typeof PROFILE !== 'undefined' && PROFILE.hasServos){
      s.appendChild(el('div','hint',"mod2026's servo map is compiled into the sketch, so Builder joints can't be wired on this firmware."));
      const barFw = el('div','conbar');
      const bFw = el('button','b','OPEN THE SETUP — FIRMWARE');
      bFw.id = 'btnMbFwDoor';
      bFw.title = 'switch the build to a Maestro or MaestroPCA firmware to wire this joint';
      bFw.addEventListener('click', ()=>{ if(typeof mbOpenFirmwareSetup==='function') mbOpenFirmwareSetup(); });
      barFw.appendChild(bFw);
      s.appendChild(barFw);
    }else if(typeof MSTR === 'undefined' || !MSTR.loaded){
      s.appendChild(el('div','hint dim','no Maestro settings loaded — generate or import a .mstr on the Servo tab, then wire it here.'));
    }else{
      const labels = rec.type === 'ball' ? ['Pan','Tilt'] : ['Joint'];
      rec.channels.forEach((act,i)=>{
        const r = el('div','selrow');
        r.appendChild(el('label',null,labels[i]||('Ch '+i)));
        r.appendChild(mbChannelSelect(act));
        s.appendChild(r);
      });
    }
  }

  const bar = el('div','conbar');
  const bDel = el('button','b danger','Delete');
  bDel.addEventListener('click', ()=>{ mbDeletePart(rec.id); buildCadPane(); });
  bar.appendChild(bDel);
  s.appendChild(bar);
}

function buildCadPane(){
  const host = $('cadHost'); if(!host) return;
  host.innerHTML = '';

  /* the stage selection, then only the sections that belong to it */
  const which = (typeof modelGet === 'function') ? buildModelSect(host) : 'droid';
  if(which === 'frik'){ buildFrikPane(host); return; }
  if(which === 'mouse'){ buildMousePane(host); return; }
  if(which === 'builder'){ buildBuilderPane(host); return; }

  /* ---- source ---- */
  const s0 = sect(host, 'Model', CAD.loaded ? xmlEsc(CAD.fileName) : 'procedural');
  const bar = el('div','conbar');
  const bProc = el('button','b'+(CAD.active?'':' act'),'Procedural');
  bProc.addEventListener('click',()=>{ setCadActive(false); lg('sys','model → procedural'); });
  const bCad = el('button','b'+(CAD.active?' act':''),'MK4 CAD');
  bCad.disabled = !CAD.loaded;
  bCad.addEventListener('click',()=>{ setCadActive(true); lg('sys','model → MK4 CAD'); });
  const bImp = el('button','b','Load .r2m');
  const fin = document.createElement('input');
  fin.type='file'; fin.accept='.r2m,.gz,application/octet-stream'; fin.style.display='none';
  fin.addEventListener('change',()=>{ if(fin.files[0]) loadCadFromFile(fin.files[0]); fin.value=''; });
  bImp.addEventListener('click',()=>fin.click());
  bar.appendChild(bProc); bar.appendChild(bCad); bar.appendChild(bImp); bar.appendChild(fin);
  s0.appendChild(bar);
  const msg = el('div','hint'); msg.id='cadMsg';
  if(CAD.loaded && CAD.stats){
    const st = CAD.stats;
    msg.innerHTML = st.parts+' parts · '+st.tris.toLocaleString()+' triangles · '+st.moving+
      ' moving · ~'+st.draws+' draw calls';
  }else{
    msg.innerHTML = 'The bundled model is the shell of your MK4 exports. Drop the full <b>.r2m</b> in to add the internal mechanism.';
  }
  s0.appendChild(msg);

  if(!CAD.loaded){
    const n = el('div','note cy prose');
    n.innerHTML = '<b>No CAD loaded.</b> The bundled model should load on its own — if it did not, this browser may lack <code>DecompressionStream</code>. Drop an <code>.r2m</code> file on the window instead.';
    host.appendChild(n);
    return;
  }

  /* ---- provenance note ---- */
  const note = el('div','note cy prose');
  note.innerHTML = '<b>Built from your Fusion exports.</b> <b>Body MK4 - Complex</b> and <b>MK4 Complex Cut</b>, converted from mm/Z-up to the simulator\'s m/Y-up frame. Hinge pivots and axes for the four breadpan doors, the dataport and the small long door come from the model\'s own hinge bodies; the pie and side panels are hinged on their outer edges; the chargebay door is a guess because that assembly has no separate hinge body.';
  host.appendChild(note);

  /* ---- visibility ---- */
  const s1 = sect(host,'Show','by part group');
  const counts = {};
  for(const p of CAD.header.parts) counts[p.kind] = (counts[p.kind]||0) + p.tris;
  ['shell','pie','panel','anim','leg','internal','outlier'].forEach(k=>{
    if(counts[k] === undefined) return;
    const l = el('label','sw');
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = !!CAD.show[k];
    cb.addEventListener('change',()=>{ CAD.show[k]=cb.checked; applyCadVisibility(); });
    l.appendChild(cb);
    l.appendChild(document.createTextNode((KIND_LABEL[k]||k)+'  ('+counts[k].toLocaleString()+' tris)'));
    s1.appendChild(l);
  });
  const lp = el('label','sw');
  const cbp = document.createElement('input'); cbp.type='checkbox'; cbp.checked = CAD.procLegs;
  cbp.addEventListener('change',()=>{ CAD.procLegs=cbp.checked; if(R2.legGroup) R2.legGroup.visible = CAD.active ? CAD.procLegs : true; });
  lp.appendChild(cbp); lp.appendChild(document.createTextNode('Procedural legs & feet (fills the gap to the floor)'));
  s1.appendChild(lp);
  const h1 = el('div','hint prose');
  h1.innerHTML = 'Your exports stop at the skirt — the ankles and feet are in the legs document, so the procedural legs stand in underneath. Export that too and I can drop it in.';
  s1.appendChild(h1);

  /* ---- alignment ---- */
  const s2 = sect(host,'Alignment');
  const r = el('div','cfgrow');
  r.appendChild(el('label',null,'Ride height (m)'));
  const inp = document.createElement('input');
  inp.type='number'; inp.step=0.005; inp.value=CAD.yOffset.toFixed(3);
  inp.addEventListener('change',()=>{ CAD.yOffset = parseFloat(inp.value)||0; });
  r.appendChild(inp); s2.appendChild(r);
  const bb = CAD.header.parts.reduce((a,p)=>[Math.min(a[0],p.bbox[1]),Math.max(a[1],p.bbox[4])],[1e9,-1e9]);
  const h2 = el('div','hint prose');
  h2.innerHTML = 'Model spans '+bb[0].toFixed(3)+' … '+bb[1].toFixed(3)+' m before the offset, so the dome top lands at '+
                 (bb[1]+CAD.yOffset).toFixed(3)+' m. A real R2 is about 1.09 m.';
  s2.appendChild(h2);

  /* ---- boards moved to the Config tab (2026-07-27) ---- */
  const sB = sect(host,'Electronics','moved');
  const hB = el('div','hint prose');
  hB.innerHTML = 'The boards, their pin maps and the panel→servo assignment now live in one place on the <b>Config</b> tab, '
    + 'alongside the build questions that decide which board is where.';
  sB.appendChild(hB);
  const bB = el('button','b','Open Config');
  bB.addEventListener('click',()=>{ const t=document.querySelector('#tabs button[data-p="pCfg"]'); if(t) t.click(); const a=$('cfgBoards'); if(a) a.scrollIntoView({block:'start'}); });
  const bar2 = el('div','conbar'); bar2.appendChild(bB); sB.appendChild(bar2);

  /* ---- groups ---- */
  if(typeof buildGroupsSect==='function') buildGroupsSect(host);

  /* ---- part mapping ---- */
  const s3 = sect(host,'Moving parts','CAD part → actuator');
  const hdr = el('div','maerow'); hdr.style.gridTemplateColumns='1fr 108px 26px';
  ['CAD part','Driven by','flip'].forEach(t=>{
    const e=el('div','cn',t); e.style.color='var(--dimmer)'; e.style.fontSize='9px'; e.style.textTransform='uppercase'; hdr.appendChild(e);
  });
  s3.appendChild(hdr);
  const order = {anim:0, pie:1, panel:2};
  CAD.moving.slice().sort((a,b)=>(order[a.kind]-order[b.kind]) || a.name.localeCompare(b.name)).forEach(m=>{
    const row = el('div','maerow'); row.style.gridTemplateColumns='1fr 108px 26px';
    const az = partAzimuth(m);
    const lbl = (typeof partLabel==='function' && partHasLabel(m.name)) ? partLabel(m.name) : null;
    const nm = el('div','cn', lbl ? lbl+'  ·  '+m.name : m.name);
    if(lbl) nm.style.color='var(--cy)';
    nm.title = m.name+'  ('+m.kind+', '+m.tris+' tris)'+
               (az===null ? '' : '\n'+az.toFixed(0)+'° from the front ('+azWord(az)+')')+
               '\nhinge '+m.rig.src+
               '\npivot '+m.rig.pivot.map(v=>v.toFixed(3)).join(', ');
    row.appendChild(nm);
    const sel = document.createElement('select');
    /* show which CAD part each actuator already owns, so a reassignment is a
       swap you can see rather than a guess */
    CAD_ACT_CHOICES.forEach(([label,key])=>{
      const o=document.createElement('option'); o.value=key;
      const owner = actCadName(key);
      o.textContent = (!key || key===m.act || !owner) ? label : label+' · now '+owner;
      if(m.act===key) o.selected=true; sel.appendChild(o);
    });
    sel.addEventListener('change',()=>{ m.act = sel.value; });
    row.appendChild(sel);
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=m.flip; cb.title='reverse travel';
    cb.addEventListener('change',()=>{ m.flip=cb.checked; });
    row.appendChild(cb);
    s3.appendChild(row);
  });
  const wbar = el('div','conbar');
  const bWire = el('button','b','Wiring sheet');
  bWire.title='A printable table pairing every actuator with its CAD part name, its bearing from the front, and the channel driving it';
  bWire.addEventListener('click',()=>downloadWiring('html'));
  const bWireC = el('button','b','…as CSV');
  bWireC.addEventListener('click',()=>downloadWiring('csv'));
  wbar.appendChild(bWire); wbar.appendChild(bWireC);
  s3.appendChild(wbar);

  const hName = el('div','note cy prose');
  hName.innerHTML = '<b>Two naming systems.</b> The names on the left are yours — straight out of the Fusion export, unchanged. '+
    'The actuator IDs on the right are the simulator\'s, and they are numbered <b>by position around the droid</b> (front first), not by the CAD\'s numbering. '+
    'So <b>pie 0</b> is <b>MainPie3</b>, and <b>side panel 0</b> is <b>Panel13</b>. That is deliberate: a firmware channel maps to a place on the droid, '+
    'and four of the inner pies are all called <b>Pie5</b> in the CAD, so their names carry no order at all. Print the <b>Wiring sheet</b> to get both columns side by side.';
  s3.appendChild(hName);

  const h3 = el('div','hint prose');
  h3.innerHTML = 'The dome has <b>12</b> pie panels: six MainPies printed as one piece with the dome (static), and six inner pies; the real build moves only <b>five</b> inner pies (Pie 1–4 pivot, Pie 5 lifts) against <b>11</b> firmware channels, leaving Pie 6 fixed — reassign as you like. '+
    'Likewise the MK4 body has <b>four</b> doors against two firmware channels: the front pair follows ch0/ch1 and the rear pair is free for a Maestro slot. '+
    'The 14 dome side panels are rigged and ready but unassigned, since neither sketch drives them.';
  s3.appendChild(h3);
}
