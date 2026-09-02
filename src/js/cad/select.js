'use strict';
/* =====================================================================
   CLICK-TO-SELECT on the 3D model

   A click (not a drag — the orbit camera owns drags) raycasts into the
   CAD meshes. Rigged parts carry their name on the mesh; merged statics
   resolve the hit triangle back to a part through the ranges recorded at
   build time. The selected part gets a highlight tint and a card in the
   stage corner: rename, colour, actuator test, group membership.
   ===================================================================== */
const SEL = { name:null, adv:false };
const _ray = (typeof THREE!=='undefined') ? new THREE.Raycaster() : null;
const _ndc = (typeof THREE!=='undefined') ? new THREE.Vector2() : null;

/* hit triangle -> part name, via the merged mesh's recorded ranges */
function partFromHit(hit){
  const ud = hit.object.userData;
  if(ud.partName) return ud.partName;
  if(!ud.ranges || hit.faceIndex===undefined) return null;
  const ip = hit.faceIndex*3;                      // position in the index buffer
  let lo=0, hi=ud.ranges.length-1;
  while(lo<hi){
    const mid=(lo+hi+1)>>1;
    if(ud.ranges[mid].iStart<=ip) lo=mid; else hi=mid-1;
  }
  const r = ud.ranges[lo];
  return (ip < r.iStart + r.iCount) ? r.name : null;
}

function pickAt(clientX, clientY){
  if(!CAD.loaded || !CAD.active) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  _ndc.x = ((clientX-rect.left)/rect.width)*2-1;
  _ndc.y = -((clientY-rect.top)/rect.height)*2+1;
  _ray.setFromCamera(_ndc, camera);
  const targets=[];
  CAD.root.traverse(o=>{ if(o.isMesh && o.visible) targets.push(o); });
  const hits = _ray.intersectObjects(targets, false);
  for(const h of hits){
    // an invisible ancestor (hidden kind group) means the mesh isn't on screen
    let n=h.object, vis=true;
    while(n){ if(n.visible===false){vis=false;break;} n=n.parent; }
    if(!vis) continue;
    const name = partFromHit(h);
    if(name) return name;
  }
  return null;
}

/* ------------------------------------------------------------ highlight */
const SEL_TINT = 0x4fd8e8;
function selectRepaint(){
  if(!SEL.name || !CAD.partIndex[SEL.name]) return;
  const base = new THREE.Color(effectivePartHex(SEL.name) || '#9ab');
  const hi = base.clone().lerp(new THREE.Color(SEL_TINT), 0.55);
  hi.multiplyScalar(1.35);
  const pi = CAD.partIndex[SEL.name];
  const attr = pi.mesh.geometry.getAttribute('color'); if(!attr) return;
  for(let i=pi.vStart;i<pi.vStart+pi.vCount;i++) attr.setXYZ(i, Math.min(1,hi.r), Math.min(1,hi.g), Math.min(1,hi.b));
  attr.needsUpdate = true;
}
/* the selection entry point — initSelect()'s stage raycaster below funnels
   every click here, and config/tab.js and app/panels.js call it directly, so
   one guard closes the pointer path and both of those at once. Sim only
   hides the sidebar wholesale and leaves #stage FULLY LIVE — it has to, the
   public are there to drive the droid — so this is the one surface where
   display:none guards nothing: a stranger left alone with the laptop can
   left-click a panel and get the part card, which is a configuration
   surface entire (a live position slider, the Port <select> that rewrites
   MSTR.channels[n].act and calls rebuildMaestroUI(), rename, colour, the
   pivot/travel editor, "+ New group with this part"). Nothing legitimate
   calls this during kiosk — its two non-pointer callers are the Config
   tab's assign row and the Outputs table, both inside #side — so the
   selection is refused outright rather than the card guarded separately.
   Same "guard the function, not the button" reasoning as openStartup(),
   wsSet(), setStripMode('seq'), the file-drop door and mbSelect()
   (look/startup.js, config/workspaces.js, maestro/ui-sequencer.js,
   app/kiosk.js, scene/builder.js) — the Model Builder's raycaster got
   exactly this as the fifth guard; the droid's own is the sixth.
   deselectPart() is deliberately NOT guarded: it only ever closes, and
   kioskEnter() calls it on the way in. */

/* =================== IS A PARTS PANE OPEN? (v1.70.1 — SUPERSEDED 2026-08-22)

   The argument this block used to make stays written down, because the
   thing it worried about has not gone away. It was the second guard, and
   it was about the OTHER way this card arrives unasked. Kiosk is a
   stranger at a show; this was the owner, on their own laptop, clicking
   the canvas to give the stage keyboard focus before pressing a key — and
   getting #selcard on whichever panel the ray hit. The card is not a
   hover tooltip: it is the part's whole configuration (rename, colour,
   groups, pivot/travel, and the Maestro channel re-map that rewrites
   MSTR.channels[n].act), and the rule that followed was that a pointing
   device should not open an editor for something you were not editing. So
   the plain click kept working where you were already doing part work —
   Configure → Model (#pCad), the pane this card IS, and the setup's Panels
   step, the split step that gives up half the window to the stage
   precisely so you can click the part you are assigning — and did nothing
   on the Drive screen.

   Mike overruled that on 2026-08-22. He asked for “I should be able to
   click on a panel on the model and bring up its configuration including
   what servo drives it etc.”, was asked where it should apply, and chose
   everywhere except kiosk. So that is the rule now: a click on a panel
   opens the part card on whatever screen you are on, and sim is the one
   place that still refuses — selectPart()'s kioskOn() guard above, with
   10-kiosk.css's own line on #selcard standing behind it. The card was
   always the right answer to what he asked for: the “Driven by” channel
   picker, the colour and the test slider are already on it.

   The old worry is answered by a threshold rather than by a place — the
   `moved > 6 || dt > 500` test in initSelect() means a click that was
   really an orbit drag never reaches the ray, and a click on empty stage
   deselects, which is exactly what it already did in the pane this card
   belongs to. If the accidental focus-click ever becomes a real
   complaint, the fix is a modifier or a read-only card on the Drive
   screen, not this test back in front of the pointer path.

   selPartsPaneOpen() itself is kept, and is still the honest answer to
   “is a parts pane showing”: `.act` is app/panels.js's own tab state and
   applyWs() keeps it honest when a workspace change hides the tab, and
   the wizard is asked first because the overlay owns the window while it
   is up. It is simply no longer wired to the pointer path. It was never
   the test for the two non-pointer callers either (config/tab.js's
   assign-row Test, app/panels.js's Outputs row — the Outputs table is a
   DRIVE pane); they pass no `from` and never asked it anything. */
function selPartsPaneOpen(){
  const su = $('startup');
  if(su && su.classList.contains('on')){
    if(typeof wizSteps !== 'function' || typeof WIZ === 'undefined') return false;
    const st = wizSteps()[WIZ.i];
    return !!(st && st.key === '_panels');
  }
  const p = $('pCad');
  return !!(p && p.classList.contains('act'));
}

function selectPart(name, from){
  /* the ONE refusal left (2026-08-22, see above): sim. `from` is still
     passed by the pointer path so a future place-rule has something to
     read, but nothing tests it any more. */
  if(typeof kioskOn === 'function' && kioskOn()) return;
  SEL.name = name;
  applyPaint();                                    // repaints all, then selectRepaint() highlights
  buildSelCard();
  if(typeof boardVizSync==='function') boardVizSync();   // light the pin up too
}
function deselectPart(){
  if(!SEL.name) return;
  SEL.name = null;
  applyPaint();
  const c=$('selcard'); if(c) c.classList.remove('on');
}

/* --------------------------------------------------------------- card */
function buildSelCard(){
  const card = $('selcard'); if(!card) return;
  const name = SEL.name;
  if(!name){ card.classList.remove('on'); return; }
  card.innerHTML='';
  card.classList.add('on');

  const pi = CAD.partIndex[name];
  const mov = CAD.moving.find(m=>m.name===name);
  const hp  = CAD.header.parts.find(x=>x.name===name);
  const az  = hp && typeof hp.azimuth==='number' ? hp.azimuth
            : hp && hp.centroid ? Math.round((((Math.atan2(hp.centroid[0], -hp.centroid[2])*180/Math.PI)+360)%360)*10)/10
            : null;

  const head = el('div','selhead');
  head.appendChild(el('div','seltitle', partLabel(name)));
  const bX = el('button','hbtn','✕'); bX.title='deselect (Esc)';
  bX.addEventListener('click',deselectPart);
  head.appendChild(bX);
  card.appendChild(head);

  const sub = el('div','selsub');
  sub.innerHTML = '<b>'+xmlEsc(partBase(name))+'</b>'
    + (hp ? ' · '+xmlEsc(hp.kind) + (az!==null ? ' · '+az.toFixed(0)+'° '+azWord(az) : '') : '')
    + (mov && mov.act ? ' · drives <b>'+xmlEsc(mov.act)+'</b>' : (mov ? ' · rigged, no servo' : ' · static'));
  card.appendChild(sub);

  /* rename — the label rides on top of the CAD name, never replaces it */
  const r1 = el('div','selrow');
  r1.appendChild(el('label',null,'Name'));
  const inp = document.createElement('input');
  inp.type='text'; inp.value = partHasLabel(name) ? partLabel(name) : '';
  inp.placeholder = partBase(name);
  inp.addEventListener('change',()=>{ setPartLabel(name, inp.value); buildSelCard(); if(typeof buildCadPane==='function') buildCadPane(); });
  r1.appendChild(inp);
  card.appendChild(r1);

  /* colour override */
  const r2 = el('div','selrow');
  r2.appendChild(el('label',null,'Colour'));
  const col = document.createElement('input');
  col.type='color';
  const ov = PARTS.overrides[name];
  col.value = (ov && ov.color) || effectivePartHex(name) || '#888888';
  col.addEventListener('input',()=>{ setPartColor(name, col.value); selectRepaint(); bClr.style.display=''; });
  r2.appendChild(col);
  const bClr = el('button','b','scheme');
  bClr.title='clear the override — back to the group / paint-scheme colour';
  bClr.style.display = (ov && ov.color) ? '' : 'none';
  bClr.addEventListener('click',()=>{ setPartColor(name, null); buildSelCard(); });
  r2.appendChild(bClr);
  card.appendChild(r2);

  /* favourites: click applies, shift-click saves the part's current colour */
  const favRow = el('div','favrow');
  favGet().forEach((hex,i)=>{
    const b = el('button','favsw');
    b.style.background = hex;
    b.title = 'Favourite '+(i+1)+': '+hex+'\nclick = paint this part · shift-click = save this part\'s colour here';
    b.addEventListener('click',e=>{
      if(e.shiftKey){ favSet(i, effectivePartHex(name)||'#888888'); buildSelCard(); }
      else { setPartColor(name, favGet()[i]); buildSelCard(); }
    });
    favRow.appendChild(b);
  });
  favRow.appendChild(el('span','favlab','favs'));
  card.appendChild(favRow);

  /* metals: real metal colours; on a part with its own mesh the finish goes
     metallic too, so gold reads as gold rather than gold paint */
  const metRow = el('div','favrow');
  METAL_COLORS.forEach(([label,hex])=>{
    const b = el('button','favsw met');
    b.style.background = hex;
    b.title = label + (mov ? ' — colour + metallic finish' : ' — colour (finish stays with the paint role)');
    b.addEventListener('click',()=>{
      setPartColor(name, hex);
      if(mov) setPartFinish(name, 'metal');
      buildSelCard();
    });
    metRow.appendChild(b);
  });
  metRow.appendChild(el('span','favlab','metals'));
  card.appendChild(metRow);
  if(mov && PARTS.overrides[name] && PARTS.overrides[name].finish){
    const bF = el('button','b','back to painted finish');
    bF.addEventListener('click',()=>{ setPartFinish(name, null); buildSelCard(); });
    card.appendChild(bF);
  }

  /* actuator test — instant answer to "which flap is this?" in reverse */
  if(mov && mov.act){
    const r3 = el('div','selrow');
    r3.appendChild(el('label',null,'Test'));
    const sl = document.createElement('input');
    sl.type='range'; sl.min=0; sl.max=1; sl.step=0.01;
    sl.value = ACT[mov.act]!==undefined ? ACT[mov.act] : 0;
    sl.addEventListener('input',()=>{ actSet(mov.act, +sl.value); });
    r3.appendChild(sl);
    card.appendChild(r3);
  }

  /* which port is it plugged into? Assign it right here. */
  if(mov && mov.act){
    const r4 = el('div','selrow');
    r4.appendChild(el('label',null,'Channel'));
    if(PROFILE.hasServos){
      const src = (typeof wiringSource==='function') ? wiringSource(mov.act) : null;
      const d = el('div','selport', src ? src.board+' · ch '+src.ch : 'no mod2026 channel');
      d.title = src ? 'fixed by the mod2026 sketch — its channel assignments are compile-time constants'
                    : 'the mod2026 sketch has no channel for this part; a Maestro profile can drive it';
      r4.appendChild(d);
    }else if(MSTR.loaded){
      /* NOT shared with cad/ui.js's mbChannelSelect() — that copy is
         deliberate (see its own comment: cad/ui.js is not this file's to
         edit) and carries the same raw-id note this fixes, so it stays a
         hand-rolled builder here too. What changes is the label: never a
         bare actuator id. A channel's own typed name wins (chGenericName's
         rule, elsewhere the app), else the part it drives; the taken-note
         goes through actPartLabel/actAnyLabel the same way, so "now: pie3"
         reads "now: Pie 3" like every other driven-by label in the app. */
      const sel = document.createElement('select');
      const o0 = document.createElement('option'); o0.value=''; o0.textContent='— not connected —'; sel.appendChild(o0);
      MSTR.channels.forEach(c=>{
        if(!/^servo/i.test(c.mode)) return;
        const o = document.createElement('option'); o.value=c.i;
        const nm = c.name && !/^channel \d+$/i.test(c.name) ? c.name : (actPartLabel(c.act)||c.name);
        const taken = (c.act && c.act!==mov.act)
          ? '  (now: '+((typeof actAnyLabel==='function' && actAnyLabel(c.act)) || c.act)+')' : '';
        o.textContent = 'ch '+c.i+' — '+nm+taken;
        if(c.act===mov.act) o.selected = true;
        sel.appendChild(o);
      });
      sel.title = 'which Maestro channel this part is plugged into — picking one updates the mapping everywhere';
      sel.addEventListener('change',()=>{
        MSTR.channels.forEach(c=>{ if(c.act===mov.act) c.act=''; });      // one channel per part
        if(sel.value!==''){ MSTR.channels[+sel.value].act = mov.act; }
        if(typeof rebuildMaestroUI==='function') rebuildMaestroUI();
        if(typeof boardVizSync==='function') boardVizSync();
        buildSelCard();
        lg('mae', partLabel(name)+' → '+(sel.value===''?'disconnected':'Maestro channel '+sel.value));
      });
      r4.appendChild(sel);
    }else{
      const d = el('div','selport dim','no Maestro settings loaded');
      /* by the pane's real name — partsServoPane() (cad/parts.js) quotes the
         tab button; "the Maestro tab" has not existed since v1.73.0 (v1.78.0,
         review L9) */
      const pane = (typeof partsServoPane === 'function') ? partsServoPane() : 'Board ▸ Servo / Sequence config';
      d.title = 'generate or import a .mstr on '+pane+', then pick the channel here';
      r4.appendChild(d);
    }
    card.appendChild(r4);
  }

  /* advanced: how this part moves (rigged parts only — a static shell has
     no rig to override) */
  if(mov){
    const bAdv = el('button','b advtog', (SEL.adv?'▾ ':'▸ ') + 'Advanced — how this part moves');
    bAdv.title = 'set where it pivots, which way it travels, and how far';
    bAdv.addEventListener('click',()=>{ SEL.adv = !SEL.adv; buildSelCard(); });
    card.appendChild(bAdv);
    if(SEL.adv) card.appendChild(buildMotionEditor(name, mov));
  }

  /* groups */
  const gh = el('div','selgh','Groups');
  card.appendChild(gh);
  PARTS.groups.forEach(g=>{
    const l = el('label','sw');
    const cb = document.createElement('input'); cb.type='checkbox';
    cb.checked = g.members.includes(name);
    cb.addEventListener('change',()=>{ groupToggleMember(g.id, name, cb.checked); selectRepaint(); });
    l.appendChild(cb);
    l.appendChild(document.createTextNode(g.name + (g.color ? ' ●' : '')));
    if(g.color) l.style.setProperty('--gdot', g.color);
    l.title = g.members.length+' member(s)'+(g.color?' · group colour '+g.color:'');
    card.appendChild(l);
  });
  const bNew = el('button','b','+ New group with this part');
  bNew.addEventListener('click',async ()=>{
    const v = await appPrompt('Group name:', {title:'New group with this part', value:'Group '+PARTS_NEXT_ID, yes:'Create'});
    if(v===null) return;               // cancel backs out; '' still creates (old contract)
    const g = groupCreate(v);
    groupToggleMember(g.id, name, true);
    buildSelCard(); if(typeof buildCadPane==='function') buildCadPane();
  });
  card.appendChild(bNew);

  const h = el('div','hint');
  h.innerHTML = 'The CAD name never changes — your name rides on top and shows up here, in the Model tab and on the wiring sheet.';
  card.appendChild(h);
}

/* ------------------------------------------------ advanced motion editor
   Mike's "advanced options within each part's popup": the motion, the pivot
   and one number for how far. Every change lands on the model immediately
   and the test buttons drive the part end to end, so you set it by eye
   rather than by arithmetic. */
function buildMotionEditor(name, mov){
  const box = el('div','seladv');
  const hp  = CAD.header.parts.find(p=>p.name === name);
  if(!hp || !hp.bbox){
    box.appendChild(el('div','hint','This part has no bounding box in the model, so its motion cannot be re-set here.'));
    return box;
  }
  const cur = partMotion(name);
  const k   = motionKind(cur ? cur.kind : motionGuessKind(mov));
  const piv = (cur && cur.pivot) || 'centre';
  const amt = (cur && cur.amount !== undefined) ? cur.amount : motionGuessAmount(mov, k);

  const write = (kind, pivot, amount)=>{
    setPartMotion(name, {kind, pivot, amount});
  };

  /* what it does */
  const r1 = el('div','selrow');
  r1.appendChild(el('label',null,'Motion'));
  const kSel = document.createElement('select');
  MOTION_KINDS.forEach(x=>{
    const o = document.createElement('option'); o.value = x.id; o.textContent = x.label;
    o.title = x.hint;
    if(x.id === k.id) o.selected = true;
    kSel.appendChild(o);
  });
  kSel.title = k.hint;
  kSel.addEventListener('change',()=>{
    const nk = motionKind(kSel.value);
    write(nk.id, piv, nk.mode === motionKind(k.id).mode ? amt : nk.def);
    buildSelCard();
  });
  r1.appendChild(kSel);
  box.appendChild(r1);

  /* what it pivots about */
  const r2 = el('div','selrow');
  const pl = el('label',null,'Pivot');
  pl.title = k.mode === 'slide'
    ? 'a sliding part does not turn, so the pivot only marks where it is measured from'
    : 'the hinge line this part turns about';
  r2.appendChild(pl);
  const pSel = document.createElement('select');
  MOTION_PIVOTS.forEach(x=>{
    const o = document.createElement('option'); o.value = x.id; o.textContent = x.label;
    if(x.id === piv) o.selected = true;
    pSel.appendChild(o);
  });
  pSel.addEventListener('change',()=>{ write(k.id, pSel.value, amt); buildSelCard(); });
  r2.appendChild(pSel);
  box.appendChild(r2);

  /* how far */
  const r3 = el('div','selrow');
  const al = el('label',null,'How far');
  al.title = 'negative goes the other way — which is usually what "it opens backwards" means';
  r3.appendChild(al);
  const sl = document.createElement('input');
  sl.type='range'; sl.min=k.min; sl.max=k.max; sl.step=(k.mode==='slide'?0.5:1); sl.value=amt;
  const vv = el('span','selamt', amt + k.unit);
  sl.addEventListener('input',()=>{
    vv.textContent = (+sl.value) + k.unit;
    /* live, without rebuilding the card — the slider must stay under the
       pointer while it is being dragged */
    const ov = PARTS.overrides[name] || (PARTS.overrides[name] = {});
    ov.motion = {kind:k.id, pivot:piv, amount:+sl.value};
    motionApply(name);
    actSet(mov.act || '', 1);
  });
  sl.addEventListener('change',()=>{ write(k.id, piv, +sl.value); });
  r3.appendChild(sl); r3.appendChild(vv);
  box.appendChild(r3);

  /* try it */
  const bar = el('div','conbar');
  const mk = (lab, fn, tip)=>{ const b = el('button','b', lab); b.title = tip||''; b.addEventListener('click', fn); return b; };
  if(mov.act){
    bar.appendChild(mk('▲ Open',  ()=>actSet(mov.act, 1), 'drive it to the far end'));
    bar.appendChild(mk('▼ Close', ()=>actSet(mov.act, 0), 'drive it home'));
  }
  bar.appendChild(mk('⤢ Zoom to it', ()=>viewFocusPart(name, 0.6), 'put the camera on this part'));
  bar.appendChild(mk('↺ CAD rig', ()=>{ setPartMotion(name, null); buildSelCard(); },
    'throw the override away and go back to the motion that came out of the model'));
  box.appendChild(bar);

  const h = el('div','hint');
  const r0 = mov.rig0 || mov.rig;
  h.innerHTML = (cur ? '<b>Hand-set.</b> ' : '<b>Straight from the model.</b> ')
    + 'The CAD rigged this one as <b>' + xmlEsc(r0.mode) + '</b>'
    + (r0.src ? ' (' + xmlEsc(r0.src) + ')' : '') + '. '
    + 'Nothing here changes the CAD — the override is saved with your labels and colours, '
    + 'and <b>CAD rig</b> puts it back.';
  box.appendChild(h);
  return box;
}
/* sensible starting point when a part has never been touched: whatever the
   CAD already does, expressed in this editor's terms */
function motionGuessKind(mov){
  const r = mov.rig0 || mov.rig;
  const ax = r.axis.map(Math.abs);
  const big = ax.indexOf(Math.max.apply(null, ax));
  if(r.mode === 'slide') return ['slide_x','slide_y','slide_z'][big];
  return ['hinge_x','hinge_y','hinge_z'][big];
}
function motionGuessAmount(mov, k){
  const r = mov.rig0 || mov.rig;
  if(r.mode !== k.mode) return k.def;
  const v = (k.mode === 'slide') ? r.range*100 : r.range*180/Math.PI;
  return Math.round(v*10)/10;
}

/* ============== “THERE IS NOTHING HERE TO PICK” (2026-08-22)

   pickAt() needs CAD.active, and with the Procedural model chosen there
   is no pickable geometry at all — the procedural meshes (scene/
   droid-proc.js) carry no userData.partName, so every ray misses. Before
   today that silence was invisible, because the click did nothing on most
   screens anyway. Now that a click picks everywhere, a click that lands on
   a panel-shaped thing and produces nothing is the one way the new rule
   reads as a bug, so it answers instead of failing quietly.

   Only for the DROID. The mouse, the Anzellan head, the Builder and the
   servo gauges are not this card's subject, and a click on one of them
   going quiet is correct rather than broken.

   Rate-limited the way the other one-shot hints are (buildFootUnsetSay in
   config/hardware.js, driveHintCheck in input/pad-ui.js) — once, then not
   again for 30 s, and cleared the moment the CAD model IS on the stage so
   switching away and back does not buy thirty seconds of silence.
   performance.now() rather than SIM.millis, unlike those two: this is the
   pointer path, which is already on the wall clock two lines up, and a
   hint about a click must not go quiet because the sketch stalled.

   No uiModalOpen() test either. The click reached a CANVAS inside #stage,
   so the stage is on screen and taking the pointer — which during the
   setup means the split Panels step, and somebody assigning panels to a
   procedural droid is precisely the person who needs to hear this.

   Returns true when it has handled the click, so a miss on a stage that
   was never pickable does not also deselect whatever the Outputs row or
   the assign row just opened. */
const SEL_PROC_HINT = { shownAt:-Infinity };
function selProcHintSay(){
  if(typeof CAD === 'undefined') return false;
  if(CAD.loaded && CAD.active){ SEL_PROC_HINT.shownAt = -Infinity; return false; }
  if(typeof modelGet === 'function' && modelGet() !== 'droid') return false;
  const now = performance.now();
  if(now - SEL_PROC_HINT.shownAt < 30000) return true;
  SEL_PROC_HINT.shownAt = now;
  if(typeof toast === 'function')
    toast('part picking needs the MK4 CAD model — the procedural stand-in has no separate panels', 'warn');
  return true;
}

/* ----------------------------------------------------------- bindings */
function initSelect(){
  const stage = $('stage');
  const card = document.createElement('div');
  card.id='selcard';
  stage.appendChild(card);

  /* bindCamera() calls stage.setPointerCapture(), which retargets pointerup
     to the STAGE — so these listeners must live there too, not on the canvas */
  let d0=null;
  stage.addEventListener('pointerdown', e=>{
    if(e.target.tagName!=='CANVAS'){ d0=null; return; }   // card / HUD clicks are not picks
    d0={x:e.clientX,y:e.clientY,t:performance.now(),b:e.button};
  });
  stage.addEventListener('pointerup', e=>{
    if(!d0 || d0.b!==0) return;
    const moved = Math.hypot(e.clientX-d0.x, e.clientY-d0.y);
    const dt = performance.now()-d0.t;
    d0=null;
    if(moved>6 || dt>500) return;                  // that was an orbit drag
    /* 2026-08-22 — the parts-pane test that used to stand here went with
       the ruling at the top of this file: the pick runs on every screen
       now, and sim is the only refusal. Keeping it in front of pickAt()
       rather than leaving it all to selectPart() matters for the hint
       below — a stranger at a show must not be told about CAD models.
       Everything past this line is a genuine click on the canvas, which
       is what lets that hint speak without firing on every orbit drag. */
    if(typeof kioskOn === 'function' && kioskOn()) return;
    const name = pickAt(e.clientX, e.clientY);
    if(name){ selectPart(name, 'stage'); return; }
    if(selProcHintSay()) return;                   // nothing here is pickable — say so
    deselectPart();
  });
  window.addEventListener('keydown', e=>{
    if(e.key==='Escape' && SEL.name && !$('startup').classList.contains('on')) deselectPart();
  });
}
