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
    /* mbRecDriven() rather than a hinge/ball list, so a new joint type counts
       itself (v1.45.0) — see scene/builder.js's mbJointCount() */
    const joints = MB.parts.filter(p=>mbRecDriven(p)).length;
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
  /* "0 OF 12" said nothing about what the 12 was (v1.70.0) — and the one
     sentence that explains it, "twelve parts is the limit for one mechanism",
     was inside the collapsed block BELOW this bin. The noun is the whole
     fix here; the block below opens itself on a first visit. */
  const s = sect(host, 'Parts bin', MB.parts.length + ' of ' + MB_HARD_CAP + ' parts used');
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
  h.innerHTML = 'Click a part on the stage to select it, or drag it to move it.';
  s.appendChild(h);

  /* USAGE, in the short version (v1.45.0, Mike: "add clear usage
     instructions"). A first-time visitor used to get a parts bin and no hint
     that ATTACH TO is the entire point of the feature, that a joint spends a
     servo channel, or that the 50 mm grid is not a setting.

     COLLAPSIBLE, not hidden: a <details> is one line shut, so the bin still
     lands above the fold, and the answer is one click away rather than in a
     tooltip nobody hovers. Plain words only — this very pane had "fixed at
     compile time" written out of it once already (builder.test.js pins that),
     so there is nothing here about scene graphs or forward kinematics.

     OPEN ON A FIRST VISIT (v1.70.0). Collapsed-by-default was the wrong
     default for the one reader who needs it: a newcomer met "0 OF 12" and a
     row of Add buttons, and the block that answers nearly every question they
     had was a shut line UNDER them. It stays where it is — the bin still
     lands first, which is what the collapse was protecting — and simply
     starts open while the bin is empty, which is exactly the first visit.
     Once there is something on the stage it starts shut again, and either way
     a reader who works the twisty owns it from then on (MB.helpOpen). */
  const help = document.createElement('details');
  help.className = 'mbhelp';
  help.open = (MB.helpOpen === null || MB.helpOpen === undefined) ? !MB.parts.length : !!MB.helpOpen;
  help.addEventListener('toggle', ()=>{ MB.helpOpen = help.open; });
  const sum = document.createElement('summary');
  sum.textContent = 'how this works';
  help.appendChild(sum);
  const ul = el('ul','mbhelplist');
  [ 'pick a part from the bin. it lands on the base plate, on the grid.',
    '<b>attach to</b> is the point of the whole thing: put a part on another one and it becomes part of it — move or turn the one underneath and everything on top goes with it.',
    'or just drag a part on the stage. drop it on another part and it attaches there; drop it on bare base plate and it only moves. either way you are told what happened, and <b>undo the last attach</b> puts it back.',
    'a hinge, a plate or a ball joint is <b>driven</b>, so it spends one servo channel — a ball spends two, one each for pan and tilt. beams and discs are rigid and cost nothing.',
    'the <b>preview</b> slider beside a channel moves the joint so you can watch the travel before you wire anything to it.',
    'everything sits on a <b>50 mm grid</b>. that is the only spacing there is, on purpose.',
    'twelve parts is the limit for one mechanism, and eight is a comfortable one.'
  ].forEach(t=>{ const li = document.createElement('li'); li.innerHTML = t; ul.appendChild(li); });
  help.appendChild(ul);
  s.appendChild(help);

  /* the drop's own undo, only while there is something to undo */
  if(typeof MB !== 'undefined' && MB.undo){
    const ub = el('div','conbar');
    const bU = el('button','b','Undo the last attach');
    bU.id = 'btnMbUndo';
    bU.title = 'put that part back on the parent, attach point and cell it came from';
    bU.addEventListener('click', ()=>{ mbUndoAttach(); buildCadPane(); });
    ub.appendChild(bU);
    s.appendChild(ub);
  }

  mbPropsCard(host);
  mbFileCard(host);
}

/* ---- the model as a file of its own (v1.45.0) ----------------------------
   Mike asked for save and export. The buttons are setupButtons()'s pattern
   (app/setup-io.js) one size down, and the work is scene/builder.js's
   mbExportModel()/mbImportModelFile() — including the fileStamp() name, so
   every saved file carries its date and time. */
function mbFileCard(host){
  const s = sect(host, 'Model file', MB.parts.length + ' part(s)');
  const bar = el('div','conbar');
  const bEx = el('button','b prim','Export model (.json)');
  bEx.id = 'btnMbExport';
  bEx.title = 'just this assembly — parts, joints and channels — without the rest of the droid’s setup';
  bEx.addEventListener('click', ()=>{ mbExportModel(); });
  const bIm = el('button','b','Import model');
  bIm.id = 'btnMbImport';
  bIm.title = 'load an exported model, or a whole setup .json — it replaces what is on the stage';
  const fin = document.createElement('input');
  fin.type = 'file'; fin.accept = '.json,application/json'; fin.style.display = 'none';
  fin.addEventListener('change', ()=>{ if(fin.files[0]) mbImportModelFile(fin.files[0]); fin.value=''; buildCadPane(); });
  bIm.addEventListener('click', ()=>fin.click());
  bar.appendChild(bEx); bar.appendChild(bIm); bar.appendChild(fin);
  s.appendChild(bar);
  const h = el('div','hint prose');
  h.innerHTML = 'The whole build already travels inside <b>Export setup</b> on the Config tab. This is the model on its own, '
    + 'so you can share one mechanism, or keep dated snapshots of it, without shipping a droid config with it. '
    + 'Importing replaces the assembly on the stage.';
  s.appendChild(h);
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

/* Is a real board driving this channel? Then leave it alone — the same
   respect scene/anzellan.js's anzOwned() pays its idle loop: what you see is
   supposed to be what the hardware would do, and a preview slider fighting a
   Maestro sequence for the same servo would be a lie about the servo. */
function mbChanOwned(act){
  if(typeof PROFILE === 'undefined' || !PROFILE.hasMaestro) return false;
  if(typeof blockChan !== 'function') return false;
  return !!blockChan(act);
}
/* the slider writes ACT_T, never ACT — so the joint is walked there by the
   ordinary easing loop, at the speed the servo model says it moves. Same
   precedent as maestro/ui-pane.js's channel sliders and the Outputs drawer in
   app/panels.js. */
function mbPreviewRow(host, act, label){
  const owned = mbChanOwned(act);
  const live = typeof ACT_T !== 'undefined' && ACT_T[act] !== undefined;
  const r = el('div','selrow');
  r.appendChild(el('label',null,label));
  const wrap = el('div','mbrng');
  const rng = document.createElement('input');
  rng.type = 'range'; rng.min = '0'; rng.max = '1'; rng.step = '0.01';
  const cur = live ? ACT_T[act] : 0.5;
  rng.value = String(cur);
  rng.disabled = owned || !live;
  rng.title = owned ? 'a board is driving this channel'
                    : (live ? 'drag to move the joint — 0% to 100% of its travel'
                            : 'the builder is off the stage');
  /* PER CENT OF TRAVEL, and say so (v1.70.0). The readout was a bare "0.50"
     with no unit and nothing naming what it measured — next to a Position row
     that read "0.05 m", the obvious guess was that it was another distance.
     It is neither: it is where the joint sits between its two end stops, so
     it is a percentage, and the row's label carries the word. */
  const pct = v => Math.round(v * 100) + '%';
  const out = el('span','mbval', pct(cur));
  rng.addEventListener('input', ()=>{
    const v = +rng.value;
    out.textContent = pct(v);
    if(!mbChanOwned(act) && typeof ACT_T !== 'undefined' && ACT_T[act] !== undefined) ACT_T[act] = v;
  });
  const bMid = el('button','mbstep','·');
  bMid.title = 'back to the middle — 50%';
  bMid.disabled = rng.disabled;
  bMid.addEventListener('click', ()=>{
    if(rng.disabled) return;
    ACT_T[act] = 0.5; rng.value = '0.5'; out.textContent = pct(0.5);
  });
  wrap.appendChild(rng); wrap.appendChild(out); wrap.appendChild(bMid);
  r.appendChild(wrap);
  host.appendChild(r);
  if(owned) host.appendChild(el('div','hint dim','a board is driving this channel, so the hardware has it — the preview stays out of its way.'));
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

  /* MILLIMETRES, because that is the unit this feature is described in
     (v1.70.0). The blurb, the stats line and the help block all say "50 mm
     grid" and these fields answered "0.05 m", so one stepper click moved the
     part by a number that did not appear anywhere else in the pane. The
     record stays in metres — the whole stage is (see the FRAME note in
     scene/builder.js); only the reading changes. */
  s.appendChild(mbAxisRow('Position', rec, 'pos', MB_GRID, v=>Math.round(v*1000)+' mm',
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

  /* WHICH attach point on that parent (v1.45.0). Every primitive describes
     more than one now — a hinge's flag or its still body, a beam's middle or
     either end — so the dropdown that names the PART needs a second one
     naming the place on it. A part whose parent offers only one (the base
     plate) gets no row at all. */
  const parentRec = mbFind(rec.parent);
  const socks = (parentRec && parentRec.sockets) || [];
  if(socks.length > 1){
    const r3b = el('div','selrow');
    r3b.appendChild(el('label',null,'Attach point'));
    const skSel = document.createElement('select');
    const on = rec.socket || mbSocketId(rec.parent);
    socks.forEach(k=>{
      const o = document.createElement('option'); o.value = k.id; o.textContent = k.label || k.id;
      if(on === k.id) o.selected = true;
      skSel.appendChild(o);
    });
    skSel.addEventListener('change', ()=>{ mbSetAttach(rec.id, rec.parent, skSel.value); buildCadPane(); });
    r3b.appendChild(skSel);
    s.appendChild(r3b);
  }

  /* a 1-DOF joint chooses which of its own axes the channel turns; a ball's
     two are fixed by its gimbal. mbJointCount() is the general test, so the
     spin plate gets this row without it being listed here (v1.45.0) */
  if(mbJointCount(rec.type) === 1){
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

  /* a joint-capable part carrying no channels is one saved before its type
     could be driven — a v1.44.1 plate. Say so, rather than draw an empty
     Channels block it can never fill (v1.45.0) */
  if(mbJointCount(rec.type) && !mbRecDriven(rec)){
    s.appendChild(el('div','hint prose','This one came from an older save, when a '+mbTypeLabel(rec.type).toLowerCase()
      + ' was a rigid part — so it has no channel and does not move. Add a new '+mbTypeLabel(rec.type).toLowerCase()
      + ' from the bin if you want a driven one.'));
  }else if(mbRecDriven(rec)){
    s.appendChild(el('div','selgh','Channels'));
    const labels = (MB_PRIM[rec.type] && MB_PRIM[rec.type].chan) || [];
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
      /* THE SECOND WALL, and it used to be the dead end (v1.70.0). The one
         above hands over OPEN THE SETUP — FIRMWARE; take its advice, switch
         to a Maestro, and you landed here — told to use "the Servo tab",
         which is not a tab this app has, with no button to press. The channel
         table is generated (a starter) and imported (a .mstr) on #pMae, so
         name that tab and open it, exactly as the firmware wall does.
         mbServoTabLabel()/mbOpenServoConfig() are scene/builder.js's, beside
         mbOpenFirmwareSetup() — the markup is this file's, the door is not. */
      const tabName = (typeof mbServoTabLabel === 'function') ? mbServoTabLabel() : 'Servo / Sequence config';
      s.appendChild(el('div','hint dim','no channel table yet — generate a starter or import a .mstr on '
        + 'Board ▸ ' + tabName + ', then wire the joint here.'));
      const barSv = el('div','conbar');
      const bSv = el('button','b','OPEN ' + tabName.toUpperCase());
      bSv.id = 'btnMbServoDoor';
      bSv.title = 'the pane that builds a channel table from a starter, or reads one out of a .mstr';
      bSv.addEventListener('click', ()=>{ if(typeof mbOpenServoConfig==='function') mbOpenServoConfig(); });
      barSv.appendChild(bSv);
      s.appendChild(barSv);
    }else{
      rec.channels.forEach((act,i)=>{
        const r = el('div','selrow');
        r.appendChild(el('label',null,labels[i]||('Ch '+i)));
        r.appendChild(mbChannelSelect(act));
        s.appendChild(r);
      });
    }
    /* MOVEMENT PREVIEW (v1.45.0, Mike: "add movement preview/testing
       controls, such as sliders"). Deliberately independent of the wiring
       above: the preview is about the MODEL, so it works on a firmware that
       cannot wire the joint at all and before any .mstr has been loaded. */
    rec.channels.forEach((act,i)=>{
      mbPreviewRow(s, act, 'Preview travel' + (rec.channels.length > 1 ? ' — ' + String(labels[i]||('ch '+(i+1))).toLowerCase() : ''));
    });
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
  /* THE KINDS THIS FILE ACTUALLY HAS, not the seven the MK4 happens to have
     (v1.46.0). The list used to be a hardcoded seven, so a container with any
     other vocabulary got no checkboxes at all — and since visibility defaulted
     to hidden for an unlisted kind (see cadShown() in cad/runtime.js), the
     Polar Mouse .r2m loaded 130 parts onto an empty stage with no way to bring
     any of them back. The MK4's seven keep their familiar order; anything else
     follows, under its raw kind string where KIND_LABEL has no name for it. */
  const KIND_ORDER = ['shell','pie','panel','anim','leg','internal','outlier'];
  KIND_ORDER.filter(k => counts[k] !== undefined)
    .concat(Object.keys(counts).filter(k => KIND_ORDER.indexOf(k) < 0))
    .forEach(k=>{
    const l = el('label','sw');
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = cadShown(k);
    cb.addEventListener('change',()=>{ CAD.show[k]=cb.checked; applyCadVisibility(); });
    l.appendChild(cb);
    const named = Object.prototype.hasOwnProperty.call(KIND_LABEL, k) ? KIND_LABEL[k] : k;
    l.appendChild(document.createTextNode(named+'  ('+counts[k].toLocaleString()+' tris)'));
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
  /* a part with no bbox is a header this pane cannot measure, not a reason to
     throw and take the whole Model tab down with it — foreign containers do
     reach here (v1.46.0, and see cadHeaderCheck() in cad/build.js for the two
     fields the BUILD genuinely cannot start without) */
  const bb = CAD.header.parts.reduce((a,p)=>(p.bbox
    ? [Math.min(a[0],p.bbox[1]), Math.max(a[1],p.bbox[4])] : a), [1e9,-1e9]);
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
