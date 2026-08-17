'use strict';
const PAINT_ROLES = [
  {key:'dome',   label:'Dome shell',   hint:'the skin between the panels'},
  {key:'pies',   label:'Pie panels',   hint:'the 12 dome wedges'},
  {key:'panels', label:'Dome panels',  hint:'the 14 side panels'},
  {key:'body',   label:'Body shell',   hint:'skirt and body skins'},
  {key:'doors',  label:'Doors & arms', hint:'everything that opens'},
  {key:'legs',   label:'Legs & feet',  hint:'shoulders down'},
  {key:'trim',   label:'Trim',         hint:'the accent colour'},
  {key:'metal',  label:'Bare metal',   hint:'hardware left unpainted'}
];
const PAINT_ROLE_KEYS = PAINT_ROLES.map(r=>r.key);
/* how each role is finished — a sprayed panel should not read as chrome */
const ROLE_FINISH = {
  metal: {metalness:0.92, roughness:0.22},   // chrome hardware
  dome:  {metalness:0.80, roughness:0.28},   // spun aluminium, like the real thing
  pies:  {metalness:0.55, roughness:0.34},   // painted panels on the aluminium
  panels:{metalness:0.55, roughness:0.34},
  legs:  {metalness:0.55, roughness:0.36},
  trim:  {metalness:0.25, roughness:0.40},
  _def:  {metalness:0.12, roughness:0.50}
};
const PAINT_SCHEMES = {
  'r2d2':  {label:'R2-D2',        dome:'#e8ecf0', pies:'#2b5fb0', panels:'#e8ecf0', body:'#eceff2',
                                  doors:'#eceff2', legs:'#e4e8ec', trim:'#2b5fb0', metal:'#aeb7c0'},
  'r2q5':  {label:'R2-Q5 black',  dome:'#26292e', pies:'#3c424a', panels:'#26292e', body:'#212429',
                                  doors:'#212429', legs:'#2a2e34', trim:'#8d1f1a', metal:'#98a1ab'},
  'r5d4':  {label:'R5-D4 red',    dome:'#d9d6ce', pies:'#a8352b', panels:'#d9d6ce', body:'#d9d6ce',
                                  doors:'#cfccc3', legs:'#d2cfc6', trim:'#a8352b', metal:'#aaa398'},
  'r2a6':  {label:'R2-A6 green',  dome:'#e7eae5', pies:'#2f7a4a', panels:'#e7eae5', body:'#e7eae5',
                                  doors:'#dee2dc', legs:'#e2e6e0', trim:'#2f7a4a', metal:'#adb7b1'},
  'chrome':{label:'Chrome dome',  dome:'#dfe6ee', pies:'#3468bb', panels:'#dfe6ee', body:'#eceff2',
                                  doors:'#eceff2', legs:'#dfe6ee', trim:'#3468bb', metal:'#dfe6ee'},
  'fusion':{label:'Fusion (as modelled)', special:'fusion'},
  'shop':  {label:'Bare build',   dome:'#b6bec7', pies:'#9aa3ad', panels:'#b6bec7', body:'#b6bec7',
                                  doors:'#a7b0ba', legs:'#aab3bd', trim:'#7d8792', metal:'#c3ccd5'}
};
/* metallic quick-colours — on a metal-finish surface these read as the real
   thing; on a matte painted role they read as paint of that colour */
const METAL_COLORS = [
  ['Chrome','#dfe6ee'],['Silver','#c9ced6'],['Aluminium','#b8bfc7'],['Gold','#d4af37'],
  ['Brass','#b5893c'],['Copper','#b87333'],['Bronze','#8c6a3f'],['Gunmetal','#2a3439']
];
function favGet(){ return PREFS.favColors || (PREFS.favColors=['#d4af37','#c9ced6','#b87333','#dfe6ee','#2b5fb0','#c0392b']); }
function favSet(i, hex){ favGet()[i]=hex; prefsSave(); }

const PAINT = { scheme:'r2d2', colors:{}, roleOf:{}, advOpen:false };
PAINT_ROLE_KEYS.forEach(k=>PAINT.colors[k] = PAINT_SCHEMES.r2d2[k]);

function isBlueish(c){ return c && c[2] > c[0] + 0.10 && c[2] > c[1] + 0.06; }
/* Default role for one (kind, file, material) slot. Kind wins over material,
   because the material is mostly a lie — see the comment in buildCad. */
function defaultRole(slot){
  const m = (CAD.header.materials[slot.mat] || {});
  const name = (m.name||'').toLowerCase();
  const col  = m.color;
  if(/glass|lens/.test(name)) return 'glass';        // left at its own tint
  if(isBlueish(col)) return 'trim';
  switch(slot.kind){
    case 'pie':     return 'pies';
    case 'panel':   return 'panels';
    case 'leg':     return 'legs';
    case 'anim':    return 'doors';
    case 'outlier': return 'metal';                  // loose greebles and hardware
  }
  return slot.file === 'dome' ? 'dome' : 'body';
}
function classifyMaterials(){
  PAINT.roleOf = {};
  if(!CAD.header || !CAD.slots) return;
  CAD.slots.forEach(s=>{ PAINT.roleOf[s.key] = defaultRole(s); });
}
/* which colour a single part ends up: its own override beats its group's
   colour beats its slot's role colour */
function effectivePartHex(name){
  /* the sequencer's identification tint wins over everything while it is on
     — that is the whole point of it (Mike, 2026-07-27). It is not stored, so
     switching it off restores the override / group / scheme stack below. */
  if(typeof blkTintHex === 'function'){
    const t = blkTintHex(name);
    if(t) return t;
  }
  const ov = (typeof PARTS!=='undefined') ? PARTS.overrides[name] : null;
  if(ov && ov.color) return ov.color;
  if(typeof groupColorOf==='function'){
    const gc = groupColorOf(name);
    if(gc) return gc;
  }
  const pi = CAD.partIndex && CAD.partIndex[name];
  const role = pi ? (PAINT.roleOf[pi.slot] || 'body') : 'body';
  if(role === 'glass') return null;                  // lens keeps the CAD tint
  if(PAINT.scheme === 'fusion'){                     // original .mtl colours
    const fx = fusionPartHex(name);
    if(fx) return fx;
  }
  return PAINT.colors[role] || '#888888';
}
const _pc = (typeof THREE!=='undefined') ? new THREE.Color() : null;
/* write one part's colour into its vertex range */
function paintPart(name, hex){
  const pi = CAD.partIndex[name]; if(!pi) return;
  const attr = pi.mesh.geometry.getAttribute('color'); if(!attr) return;
  _pc.set(hex);
  for(let i=pi.vStart; i<pi.vStart+pi.vCount; i++) attr.setXYZ(i, _pc.r, _pc.g, _pc.b);
  attr.needsUpdate = true;
}
function applyPaint(){
  if(!CAD.loaded || !CAD.slots || !CAD.slots.length) return;
  /* material: white base (vertex colours carry the paint) + role finish */
  CAD.slots.forEach(s=>{
    const role = PAINT.roleOf[s.key] || 'body';
    const mat = CAD.slotMats[s.key];
    if(!mat) return;
    if(role !== 'glass') mat.color.set('#ffffff');   // glass keeps the CAD tint
    const f = ROLE_FINISH[role] || ROLE_FINISH._def;
    mat.metalness = f.metalness; mat.roughness = f.roughness;
  });
  /* per part: override > group > role */
  for(const name in CAD.partIndex){
    const hex = effectivePartHex(name);
    if(hex) paintPart(name, hex);
  }
  /* per-part FINISH override — only rigged parts have their own mesh, so
     only they can carry a metalness different from their slot */
  if(typeof PARTS!=='undefined' && CAD.moving){
    for(const m of CAD.moving){
      const ov = PARTS.overrides[m.name];
      const fin = ov && ov.finish;
      if(fin){
        const base = CAD.slotMats[CAD.partIndex[m.name].slot];
        if(!m._finMat || m._finBase!==base){ m._finMat = base.clone(); m._finBase = base; }
        m._finMat.metalness = (fin==='metal') ? 0.92 : 0.30;
        m._finMat.roughness = (fin==='metal') ? 0.22 : 0.28;
        m.mesh.material = m._finMat;
      }else if(m._finMat){
        m.mesh.material = CAD.slotMats[CAD.partIndex[m.name].slot];
        m._finMat.dispose(); m._finMat = null;
      }
    }
  }
  if(typeof selectRepaint==='function') selectRepaint();   // keep the highlight on top
}
function setPartFinish(name, fin){
  const ov = PARTS.overrides[name] || (PARTS.overrides[name]={});
  if(fin) ov.finish = fin; else delete ov.finish;
  if(!ov.label && !ov.color && !ov.finish) delete PARTS.overrides[name];
  applyPaint(); partsSave();
}
function setSlotRole(key, role){
  PAINT.roleOf[key] = role;
  applyPaint();
  PREFS.paint = {scheme:PAINT.scheme, colors:Object.assign({},PAINT.colors), roleOf:Object.assign({},PAINT.roleOf)};
  prefsSave();
}
function setScheme(key){
  const s = PAINT_SCHEMES[key];
  if(!s) return;
  PAINT.scheme = key;
  if(!s.special) PAINT_ROLES.forEach(r=>{ PAINT.colors[r.key] = s[r.key]; });
  applyPaint();
  paintSave();
}
/* the original CAD colour of one part — the .mtl Kd values the OBJ import
   carried in. "Fusion (as modelled)" paints straight from these. */
function fusionPartHex(name){
  const pi = CAD.partIndex && CAD.partIndex[name]; if(!pi) return null;
  const mi = +pi.slot.split(':')[2];
  const m = CAD.header.materials[mi]; if(!m || !m.color) return null;
  return '#'+new THREE.Color(m.color[0], m.color[1], m.color[2]).getHexString();
}
function setRoleColor(role, hex){
  PAINT.colors[role] = hex;
  PAINT.scheme = 'custom';
  applyPaint();
  paintSave();
}
function paintSave(){
  PREFS.paint = {scheme:PAINT.scheme, colors:Object.assign({},PAINT.colors), roleOf:Object.assign({},PAINT.roleOf)};
  prefsSave();
}
/* called once the CAD is in — restores a saved scheme or classifies fresh */
function initPaint(){
  classifyMaterials();
  if(!PREFS.paint){
    /* first run: match Fusion exactly — these are Mike's own .mtl colours */
    PAINT.scheme = 'fusion';
  }
  if(PREFS.paint){
    PAINT.scheme = PREFS.paint.scheme || 'custom';
    if(PREFS.paint.colors) Object.assign(PAINT.colors, PREFS.paint.colors);
    /* only reuse saved slot roles that still exist in this model */
    if(PREFS.paint.roleOf)
      for(const k in PREFS.paint.roleOf)
        if(PAINT.roleOf[k] !== undefined) PAINT.roleOf[k] = PREFS.paint.roleOf[k];
  }
  applyPaint();
}
