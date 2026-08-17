'use strict';
/* =====================================================================
   PART REGISTRY — your names and groups on top of the CAD's names

   The CAD names stay untouched (see naming.js). What lives here is the
   layer Mike adds on top: a label per part ("left gripper door"), an
   optional colour override per part, and named GROUPS of parts.

   A group is the unit you actually think in when programming the droid:
   "front doors", "scream panels", "left side". Each group can carry a
   colour (beats the paint role, loses to a per-part override), can be
   flashed / opened / closed for testing, is registered as a pair of
   built-in animations selectable in the firmware slots, and can be
   exported as a pair of Maestro sequences in one click.
   ===================================================================== */
const PARTS = {
  overrides: {},   // part name -> {label?, color?}
  groups: []       // {id, name, color|null, members:[part names]}
};
let PARTS_NEXT_ID = 1;

function partsSave(){
  PREFS.parts = JSON.parse(JSON.stringify({overrides:PARTS.overrides, groups:PARTS.groups, nextId:PARTS_NEXT_ID}));
  prefsSave();
}
/* called once the CAD is in — drop saved state that no longer matches a part */
function partsLoad(){
  const p = PREFS.parts;
  if(!p) return;
  PARTS.overrides = {};
  for(const name in (p.overrides||{}))
    if(CAD.partIndex[name]) PARTS.overrides[name] = p.overrides[name];
  PARTS.groups = (p.groups||[]).map(g=>({
    id:g.id, name:g.name, color:g.color||null,
    members:(g.members||[]).filter(n=>CAD.partIndex[n])
  }));
  PARTS_NEXT_ID = p.nextId || (Math.max(0,...PARTS.groups.map(g=>g.id))+1);
}

/* ------------------------------------------------------------ per part */
function partBase(name){
  const hp = CAD.header && CAD.header.parts.find(x=>x.name===name);
  return hp ? hp.base : name;
}
function partLabel(name){
  const ov = PARTS.overrides[name];
  if(ov && ov.label) return ov.label;
  /* build-assigned default labels (e.g. the pies: four CAD parts are all
     literally called "Pie5", so buildCad names them Pie 1..6 per Mike's
     physical numbering) — a user rename still wins above */
  const hp = CAD.header && CAD.header.parts.find(x=>x.name===name);
  return (hp && hp.label) ? hp.label : (hp ? hp.base : name);
}
function partHasLabel(name){
  const ov = PARTS.overrides[name];
  return !!(ov && ov.label);
}
function setPartLabel(name, label){
  const ov = PARTS.overrides[name] || (PARTS.overrides[name]={});
  const v = (label||'').trim();
  if(v && v !== partBase(name)) ov.label = v; else delete ov.label;
  if(!ov.label && !ov.color) delete PARTS.overrides[name];
  partsSave();
  lg('sys', v ? `part "${partBase(name)}" labelled "${v}"` : `part "${partBase(name)}" label cleared`);
}
function setPartColor(name, hex){
  const ov = PARTS.overrides[name] || (PARTS.overrides[name]={});
  if(hex) ov.color = hex; else delete ov.color;
  if(!ov.label && !ov.color) delete PARTS.overrides[name];
  applyPaint();
  partsSave();
}

/* ------------------------------------------------- how a part moves
   Mike, 2026-07-27: "for movement of panels — or anything else that's
   defined as something that moves — we should add an advanced button that
   allows the user to select where it pivots, whether it goes in/out,
   up/down, turns left or right etc… with a slider to define by how much.
   Note these should be advanced options within each part's popup."

   The .r2m carries a rig guessed from the geometry, and the guess is
   sometimes wrong on the real build — the utility arms were read as
   clamshell flaps when they are really side-hinged arms. This is the manual
   override: pick a motion, pick what it pivots about, set one number for
   how far. It rides in PARTS.overrides like a label or a colour, so it is
   saved with everything else and re-applied whenever the CAD loads.

   Axes are the model's: -Z is the front of the droid, +Y up, and -X is the
   droid's own left (the viewer's right when it faces you).                */
const MOTION_KINDS = [
  {id:'hinge_x', mode:'hinge', axis:[1,0,0],  label:'Hinges up / down',    unit:'°',  def:70, min:-180, max:180,
   hint:'swings about a side-to-side axis, like a flap lifting'},
  {id:'hinge_y', mode:'hinge', axis:[0,1,0],  label:'Turns left / right',  unit:'°',  def:70, min:-180, max:180,
   hint:'swings about the upright axis, like a door opening outwards'},
  {id:'hinge_z', mode:'hinge', axis:[0,0,1],  label:'Rolls in its plane',  unit:'°',  def:70, min:-180, max:180,
   hint:'spins in the plane of the panel, like a rotating disc'},
  {id:'slide_z', mode:'slide', axis:[0,0,-1], label:'Slides in / out',     unit:'cm', def:8,  min:-40,  max:40,
   hint:'straight out of the front of the droid, like a periscope drawer'},
  {id:'slide_y', mode:'slide', axis:[0,1,0],  label:'Slides up / down',    unit:'cm', def:8,  min:-40,  max:40,
   hint:'straight up, the way Mike\'s Pie 5 lifter rises'},
  {id:'slide_x', mode:'slide', axis:[1,0,0],  label:'Slides left / right', unit:'cm', def:8,  min:-40,  max:40,
   hint:'straight sideways across the droid'}
];
function motionKind(id){ return MOTION_KINDS.find(k=>k.id === id) || MOTION_KINDS[0]; }

/* Where it pivots. A free 3-D point is no use at a workbench, so the choice
   is the part's own bounding box: its middle, or any one of its six faces —
   which is how a hinge line is actually described ("hinged along the top"). */
const MOTION_PIVOTS = [
  {id:'centre', label:'Its middle'},
  {id:'top',    label:'Along its top edge'},
  {id:'bottom', label:'Along its bottom edge'},
  {id:'left',   label:'Along its left edge  (droid\'s left)'},
  {id:'right',  label:'Along its right edge'},
  {id:'front',  label:'Along its front edge (nearest you)'},
  {id:'back',   label:'Along its back edge'}
];
function motionPivotPoint(hp, id){
  const b = hp.bbox;
  const c = [(b[0]+b[3])/2, (b[1]+b[4])/2, (b[2]+b[5])/2];
  switch(id){
    case 'top':    c[1] = b[4]; break;
    case 'bottom': c[1] = b[1]; break;
    case 'left':   c[0] = b[0]; break;    // droid's left is -X
    case 'right':  c[0] = b[3]; break;
    case 'front':  c[2] = b[2]; break;    // the front of the droid is -Z
    case 'back':   c[2] = b[5]; break;
  }
  return c;
}

function partMotion(name){
  const ov = PARTS.overrides[name];
  return (ov && ov.motion) || null;
}
function setPartMotion(name, mo){
  const ov = PARTS.overrides[name] || (PARTS.overrides[name] = {});
  if(mo) ov.motion = mo; else delete ov.motion;
  if(!ov.label && !ov.color && !ov.finish && !ov.motion) delete PARTS.overrides[name];
  motionApply(name);
  partsSave();
  lg('sys', mo
    ? `part "${partLabel(name)}" → ${motionKind(mo.kind).label.toLowerCase()}, ${mo.amount}${motionKind(mo.kind).unit} about ${mo.pivot}`
    : `part "${partLabel(name)}" → back to the rig from the CAD`);
}
/* rebuild one part's rig from its override (or restore the CAD's own) */
function motionApply(name){
  if(typeof CAD === 'undefined' || !CAD.loaded) return;
  const m = CAD.moving.find(x=>x.name === name); if(!m) return;
  const hp = CAD.header.parts.find(p=>p.name === name); if(!hp || !hp.bbox) return;
  if(!m.rig0) m.rig0 = JSON.parse(JSON.stringify(m.rig));
  const mo = partMotion(name);
  if(!mo){
    m.rig = JSON.parse(JSON.stringify(m.rig0));
  }else{
    const k = motionKind(mo.kind);
    const amt = (mo.amount === undefined) ? k.def : mo.amount;
    m.rig = {
      mode: k.mode,
      axis: k.axis.slice(),
      pivot: motionPivotPoint(hp, mo.pivot || 'centre'),
      range: (k.mode === 'slide') ? amt/100 : amt*Math.PI/180,
      src: 'user:'+k.id
    };
  }
  motionRebind(m);
}
/* The geometry was baked relative to the ORIGINAL pivot at load time, so a
   new pivot needs no vertex touched: move the group to the new pivot and
   push the mesh back by exactly the same amount, and every vertex lands
   where it started — but now it turns about somewhere else. */
function motionRebind(m){
  const p0 = m.rig0.pivot, p = m.rig.pivot;
  m.group.position.set(p[0], p[1], p[2]);
  m.mOff = [p0[0]-p[0], p0[1]-p[1], p0[2]-p[2]];
  m.mesh.position.set(m.mOff[0], m.mOff[1], m.mOff[2]);
  m.group.quaternion.set(0,0,0,1);
}
function motionApplyAll(){
  if(typeof CAD === 'undefined' || !CAD.loaded) return;
  CAD.moving.forEach(m=>motionApply(m.name));
}

/* -------------------------------------------------------------- groups */
function groupById(id){ return PARTS.groups.find(g=>g.id===id); }
/* the colour a part inherits from its groups: the LAST coloured group wins,
   so newer grouping decisions override older ones */
function groupColorOf(name){
  for(let i=PARTS.groups.length-1;i>=0;i--){
    const g = PARTS.groups[i];
    if(g.color && g.members.includes(name)) return g.color;
  }
  return null;
}
function groupCreate(name){
  const gid = PARTS_NEXT_ID++;
  const g = {id:gid, name:(name||'Group '+gid).trim(), color:null, members:[]};
  PARTS.groups.push(g);
  partsSave(); registerGroupAnims();
  return g;
}
function groupDelete(id){
  const i = PARTS.groups.findIndex(g=>g.id===id);
  if(i<0) return;
  PARTS.groups.splice(i,1);
  applyPaint(); partsSave(); registerGroupAnims();
}
function groupSetColor(id, hex){
  const g = groupById(id); if(!g) return;
  g.color = hex || null;
  applyPaint(); partsSave();
}
function groupToggleMember(id, name, on){
  const g = groupById(id); if(!g) return;
  const i = g.members.indexOf(name);
  if(on && i<0) g.members.push(name);
  if(!on && i>=0) g.members.splice(i,1);
  applyPaint(); partsSave(); registerGroupAnims();
}
/* the actuators a group can move (members that are rigged AND assigned) */
function groupActs(g){
  const acts = [];
  g.members.forEach(n=>{
    const m = CAD.moving.find(x=>x.name===n);
    if(m && m.act && !acts.includes(m.act)) acts.push(m.act);
  });
  return acts;
}

/* ---- test actions: work under ANY profile ----
   Under mod2026 the PCA9685 layer OWNS its 21 actuators — ACT is overwritten
   from servoTravel() every frame — so a test action must command the servo
   model through setPWM, exactly as the sketch would. Everything else (side
   panels, rear doors, Maestro profiles) goes through the ACT_T ramp. */
function actSet(a, v){
  if(PROFILE.hasServos){
    for(const b of [1,2]){
      const d = SERVO_DEFS[b].find(x=>x.act===a);
      if(d && CFG[d.lo]!==undefined && CFG[d.hi]!==undefined){
        setPWM(b, d.ch, 0, Math.round(CFG[d.lo] + (CFG[d.hi]-CFG[d.lo])*v));
        return;
      }
    }
  }
  ACT_T[a] = v;
}
function groupSet(id, v){
  const g = groupById(id); if(!g) return;
  groupActs(g).forEach(a=>actSet(a, v));
  lg('sys', `group "${g.name}" → ${v? 'open':'close'} (${groupActs(g).length} actuator(s))`);
}
function groupFlash(id){
  const g = groupById(id); if(!g) return;
  const acts = groupActs(g);
  acts.forEach(a=>actSet(a, 1));
  setTimeout(()=>{ acts.forEach(a=>actSet(a, 0)); }, 650);
}

/* ---- groups as animations: selectable wherever ANIMS are (Config slots) */
function registerGroupAnims(){
  // clear previous grp_* entries
  Object.keys(ANIMS).filter(k=>/^grp_/.test(k)).forEach(k=>{
    delete ANIMS[k];
    const i = ANIM_IDS.indexOf(k); if(i>=0) ANIM_IDS.splice(i,1);
  });
  PARTS.groups.forEach(g=>{
    const acts = groupActs(g);
    if(!acts.length) return;
    const stag = 90;
    ANIMS['grp_'+g.id+'_open'] = {label:'Group: '+g.name+' open', dur:acts.length*stag+500,
      steps:acts.map((a,i)=>[i*stag, a, 1])};
    ANIMS['grp_'+g.id+'_close'] = {label:'Group: '+g.name+' close', dur:acts.length*stag+500,
      steps:acts.slice().reverse().map((a,i)=>[i*stag, a, 0])};
    ANIM_IDS.push('grp_'+g.id+'_open','grp_'+g.id+'_close');
  });
  if(typeof buildConfig==='function' && $('cfgHost')) buildConfig();   // slot dropdowns list ANIM_IDS
}

/* ---- groups as Maestro sequences: the real programming path ---- */
function groupToSequences(id){
  const g = groupById(id); if(!g) return null;
  if(!MSTR.loaded) return {error:'no Maestro settings loaded — generate or import one on the Maestro tab first'};
  const chans = [];
  groupActs(g).forEach(a=>{
    const c = MSTR.channels.find(x=>x.act===a);
    if(c) chans.push(c);
  });
  if(!chans.length) return {error:'no Maestro channel drives any part of this group — map channels on the Maestro tab first'};
  const base = new Array(MSTR.servoCount).fill(0);
  MSTR.channels.forEach(c=>{ if(/^servo/i.test(c.mode)) base[c.i]=c.home; });
  /* v1.46.0 — max IS the open end, directed, whatever the numbers are; see
     chanEnds() in maestro/playback.js. `invert` is retired. */
  const openOf  = c => (typeof chanEnds === 'function') ? chanEnds(c).open : c.max;
  const frames = [];
  let cur = base.slice();
  chans.forEach((c,k)=>{
    cur = cur.slice(); cur[c.i] = openOf(c);
    frames.push({name:'Frame '+k, duration:420, targets:cur.slice()});
  });
  const open = {name:g.name+' Open', frames};
  const closeFrames = frames.slice().reverse().map((f,i)=>({name:'Frame '+i, duration:f.duration, targets:f.targets.slice()}));
  closeFrames.push({name:'Frame '+closeFrames.length, duration:420, targets:base.slice()});
  const close = {name:g.name+' Close', frames:closeFrames};
  MSTR.sequences.push(open, close);
  /* this button means "put this group on the board", so unlike a routine
     saved in the sequencer the pair joins the loadout straight away */
  if(typeof loadoutAdd==='function'){ loadoutAdd(open.name); loadoutAdd(close.name); }
  if(typeof reindexSubs==='function') reindexSubs();
  if(typeof rebuildMaestroUI==='function') rebuildMaestroUI();
  lg('mae', `group "${g.name}" → sequences "${open.name}" (sub ${loadoutIndex(open.name)}) and "${close.name}" (sub ${loadoutIndex(close.name)})`);
  return {open, close, count:chans.length};
}

/* --------------------------------------------- Groups panel (Model tab) */
function buildGroupsSect(host){
  const s = sect(host, 'Groups', PARTS.groups.length + ' defined');
  PARTS.groups.forEach(g=>{
    const row = el('div','grprow');

    const nm = el('div','cn', g.name);
    nm.title = g.members.length+' part(s): '+g.members.map(partLabel).join(', ')+'\nclick to rename';
    nm.style.cursor='text';
    nm.addEventListener('click',async ()=>{
      const v = await appPrompt('Group name:', {title:'Rename group', value:g.name, yes:'Rename'});
      /* '' and cancel both keep the old name — same contract as the old prompt() */
      if(v && v.trim()){ g.name=v.trim(); partsSave(); registerGroupAnims(); buildCadPane(); }
    });
    row.appendChild(nm);

    row.appendChild(el('div','mv', g.members.length+'p'));

    const col = document.createElement('input');
    col.type='color'; col.value = g.color || '#808080';
    col.title = g.color ? 'group colour — every member wears it' : 'no group colour set (drag to set one)';
    col.classList.toggle('unset', !g.color);
    col.addEventListener('input',()=>{ groupSetColor(g.id, col.value); col.classList.remove('unset'); });
    row.appendChild(col);

    const mk=(lab,fn,tip)=>{ const b=el('button','b',lab); b.title=tip||''; b.addEventListener('click',fn); return b; };
    row.appendChild(mk('◉', ()=>groupFlash(g.id), 'flash the group on the model'));
    row.appendChild(mk('▲', ()=>groupSet(g.id,1), 'open every actuated member'));
    row.appendChild(mk('▼', ()=>groupSet(g.id,0), 'close every actuated member'));
    row.appendChild(mk('⟶M', ()=>{
      const r = groupToSequences(g.id);
      const m=$('cadMsg'); if(m) m.textContent = r ? (r.error || `"${g.name}" exported as two Maestro sequences (${r.count} channel(s)) — see the Maestro tab.`) : '';
    }, 'append this group to the Maestro settings as an Open + Close sequence pair'));
    row.appendChild(mk('✕', async ()=>{
      if(await appConfirm('Delete group "'+g.name+'"? Parts and their colours stay; only the grouping goes.',
        {title:'Delete group', yes:'Delete', no:'Keep it'})) { groupDelete(g.id); buildCadPane(); }
    }, 'delete the group'));
    if(g.color){
      row.appendChild(mk('⌫', ()=>{ groupSetColor(g.id,null); buildCadPane(); }, 'clear the group colour — members fall back to the paint scheme'));
    }

    s.appendChild(row);
  });

  const bar = el('div','conbar');
  const bNew = el('button','b','+ New group');
  bNew.addEventListener('click',async ()=>{
    const v = await appPrompt('Group name:', {title:'New group', value:'Group '+PARTS_NEXT_ID, yes:'Create'});
    /* only cancel backs out — '' still creates, and groupCreate names it (old contract) */
    if(v!==null){ groupCreate(v); buildCadPane(); }
  });
  bar.appendChild(bNew);
  s.appendChild(bar);

  const h = el('div','hint');
  h.innerHTML = 'Add parts to a group by <b>clicking them on the model</b> and ticking the group in the card. '
    + 'A group with actuated members shows up as <b>Group: … open/close</b> in the Config slot dropdowns, so a controller button can fire it, '
    + 'and <b>⟶M</b> writes it into the Maestro settings as a real sequence pair ready to export.';
  s.appendChild(h);
}
