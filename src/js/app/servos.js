'use strict';
/* =====================================================================
   THE SERVO GRID — one gauge per channel, ON THE STAGE
   (v1.60.0; v1.59.0 had it in a workspace, v1.57.0 as 3D servos)

   Mike: "I dont like the Servo look — can you change them to be a grid,
   not on the stage, a separate view, and they are represented via either a
   180 degree gauge or a round dial 360 degree; when clicked it pops up a
   similar config like on clicking panels."

   WHERE IT LIVES, THIRD AND FINAL ANSWER. Mike, with the stage circled in
   orange: *"The servo grid should be where ive marked and replace the r2
   completly — we need to treat it as another modle like we did for the polar
   mouse, only we dont need the stage area, just a simple screen representing
   the servos."*

   So it is a MODEL, not a workspace. `PREFS.model === 'servos'` puts it on
   the stage the same way it puts the Polar Mouse there, which means it
   appears in BOTH stages — the big one in Drive and the narrow column in the
   sequencer desk — for free, and the way in is the stage chip and
   Configure → Model, like every other model. v1.59.0's fifth workspace
   button is gone: a header button that behaved differently from the four
   beside it was the wrong shape for this.

   What "we dont need the stage area" means in code: no 3D scene. `#svScreen`
   covers `#stage`, `body.model-servos` takes the canvas, the HUD and every
   stage button except the model chip out of the way, and main.js skips the
   render entirely. A flat screen, in the space the droid was in.

   WHAT A TILE IS. v1.57.0 drew twenty-four little 3D servos, each owning an
   `rkS<n>` actuator that you then wired a channel to. That put a mapping
   layer between you and the board for no gain: the thing you actually want
   to look at IS the board. So a tile is not a rack slot that a channel
   drives — **a tile IS a channel**. Tile 5 is channel 5, always.

   Which leaves one question the sim could not previously answer: what is a
   channel wired to NOTHING doing? `CHPOS` (maestro/playback.js) is that
   answer, and `chanPosNorm(c)` is the single reader this file draws from.

   THE FOUR THINGS IT IS:
     · a WORKSPACE, not an overlay — the fifth button beside Drive,
       Sequence, Configure and Board. You go there; it does not open over
       you, and the sketch keeps running while you are in it.
     · a GRID that follows the board — 6 tiles on a Micro 6, 128 on eight
       PCA9685s, wrapping to the width it is given.
     · a GAUGE or a DIAL per tile, switchable for the whole view. The gauge
       is a 180° arc, which is what a servo actually travels; the dial is a
       360° bezel, which packs squarer and reads like an instrument. Mike
       asked for both, so the choice is his to make while looking at them.
     · a CARD on click, the same shape as clicking a panel on the model
       (cad/select.js buildSelCard): what it drives, what it is called, and
       a slider to move it.

   WHERE THE NEEDLE COMES FROM. `chanPosNorm(c)` is 0..1 across this
   channel's own shut→open ends, whichever numeric order they are in
   (chanEnds). Both shapes draw the same number; only the arc differs. That
   is deliberate — and it matters more now the two can sit side by side in
   one grid: a gauge and a dial disagreeing about the same servo would be
   the worst possible outcome of offering both.
   ===================================================================== */

const SV_PER_ROW_MIN = 120;          // px — the grid's own minimum tile width
const SV_SHAPES = ['gauge','dial'];
const SV = {
  shape: 'gauge',                    // the BOARD's default — restored in svRestore()
  per: {},                           // per-channel overrides, {index: 'gauge'|'dial'}
  shown: false,                      // is it the model on the stage
  sel: -1,                           // the channel whose card is open, or -1
  tiles: []                          // {i, needle, read, wrap} — kept for the frame tick
};

/* ---------------------------------------------------------------- prefs
   The shape is a LOOK, so it lives with the other looks in PREFS rather
   than in the servo store: it says nothing about the droid. */
function svRestore(){
  if(typeof PREFS === 'undefined') return;
  if(SV_SHAPES.indexOf(PREFS.svShape) >= 0) SV.shape = PREFS.svShape;
  SV.per = (PREFS.svShapes && typeof PREFS.svShapes === 'object') ? PREFS.svShapes : {};
}
function svSave(){
  if(typeof PREFS === 'undefined') return;
  PREFS.svShape = SV.shape;
  PREFS.svShapes = SV.per;
  if(typeof prefsSave === 'function') prefsSave();
}
/* WHICH SHAPE THIS ONE WEARS. Mike, v1.60.0: "the 180 / 360 gauges should be
   selectable for each servo" — so the board's default is the fallback, not
   the answer. A channel with no opinion follows the default, which is what
   makes "all of them to dials" one click rather than a hundred and
   twenty-eight. */
function svShapeOf(i){
  const own = SV.per && SV.per[i];
  return (SV_SHAPES.indexOf(own) >= 0) ? own : SV.shape;
}
/* set ONE servo's shape. Passing '' clears the override and puts it back on
   the board default. */
function svSetShapeOf(i, shape){
  if(typeof kioskOn === 'function' && kioskOn()) return false;
  if(shape && SV_SHAPES.indexOf(shape) < 0) return false;
  if(!shape) delete SV.per[i];
  else SV.per[i] = shape;
  svSave();
  buildServos();
  return true;
}
/* set the DEFAULT, and clear every override with it — "all of them like
   this" has to mean all of them, or the button lies on a grid where three
   channels were set by hand. */
function svSetShape(shape){
  if(SV_SHAPES.indexOf(shape) < 0) return false;
  if(typeof kioskOn === 'function' && kioskOn()) return false;
  SV.shape = shape;
  SV.per = {};
  svSave();
  buildServos();
  return true;
}

/* ------------------------------------------------------------- geometry
   Both shapes are one SVG path each, drawn once per rebuild; only the
   needle's transform changes per frame. An arc from a to b, on a circle of
   radius r about (cx,cy), with 0° pointing straight down and angles going
   clockwise — which is how both a servo horn and a dial face are read. */
/* ONE BOX FOR BOTH SHAPES, and that is the whole reason the centre moves.
   A 180° gauge only uses the top half of its circle and a 360° dial uses all
   of it — drawn in their own natural boxes they come out different heights,
   and a grid with three dials in it goes ragged, every row's labels sitting
   at a different level. So both faces are 88 × 78 and the geometry moves
   inside it: the gauge's centre drops so its semicircle fills the box, the
   dial's sits in the middle with a slightly smaller radius. */
const SV_BOX_W = 88, SV_BOX_H = 78;
const SV_GEO = {
  gauge: {cx:44, cy:57, r:34},
  dial:  {cx:44, cy:41, r:32}
};
function svGeo(shape){ return SV_GEO[shape] || SV_GEO.gauge; }
function svPolar(g, r, deg){
  const t = (deg - 90) * Math.PI / 180;
  return [g.cx + r * Math.cos(t), g.cy + r * Math.sin(t)];
}
function svArc(g, r, a1, a2){
  const [x1,y1] = svPolar(g, r, a1), [x2,y2] = svPolar(g, r, a2);
  const big = Math.abs(a2 - a1) > 180 ? 1 : 0;
  const sweep = a2 > a1 ? 1 : 0;
  return 'M'+x1.toFixed(2)+' '+y1.toFixed(2)+
         'A'+r+' '+r+' 0 '+big+' '+sweep+' '+x2.toFixed(2)+' '+y2.toFixed(2);
}
/* the span each shape uses, in degrees clockwise from straight down.
   GAUGE: 180°, from due west to due east — a servo's real travel, with
   centre at the top. DIAL: 300° of a 360° bezel, leaving the usual gap at
   the bottom, because a needle that can point at its own zero and its own
   full-scale at the same time cannot be read. */
const SV_SPAN = {gauge:{from:-90, to:90}, dial:{from:-150, to:150}};
function svAngle(shape, t){
  const s = SV_SPAN[shape] || SV_SPAN.gauge;
  return s.from + clamp(t, 0, 1) * (s.to - s.from);
}

function svSvgEl(tag, attrs){
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

/* one face — the track, the ticks, the centre mark and the needle. Returns
   the needle so the tick can turn it without touching the DOM again. */
function svFace(shape){
  const s = SV_SPAN[shape] || SV_SPAN.gauge;
  const g = svGeo(shape);
  const svg = svSvgEl('svg', {viewBox:'0 0 '+SV_BOX_W+' '+SV_BOX_H, class:'svface '+shape});
  svg.setAttribute('aria-hidden','true');
  svg.appendChild(svSvgEl('path', {class:'svtrack', d:svArc(g, g.r, s.from, s.to), fill:'none'}));
  /* five ticks — the two ends, the middle, and the quarters. Enough to read
     "about a third open" off; more would be noise at this size. */
  for(let k = 0; k <= 4; k++){
    const a = s.from + (s.to - s.from) * (k/4);
    const [x1,y1] = svPolar(g, g.r - (k%2 ? 4 : 7), a);
    const [x2,y2] = svPolar(g, g.r, a);
    svg.appendChild(svSvgEl('line', {class:'svtick'+(k===2?' mid':''),
      x1:x1.toFixed(2), y1:y1.toFixed(2), x2:x2.toFixed(2), y2:y2.toFixed(2)}));
  }
  const needle = svSvgEl('g', {class:'svneedle'});
  needle.appendChild(svSvgEl('line', {x1:g.cx, y1:g.cy, x2:g.cx, y2:g.cy - (g.r - 6)}));
  needle.appendChild(svSvgEl('circle', {cx:g.cx, cy:g.cy, r:3.4, class:'svhub'}));
  svg.appendChild(needle);
  return {svg, needle, geo:g};
}

/* ---------------------------------------------------------------- data */
function svChannels(){
  return (typeof MSTR !== 'undefined' && Array.isArray(MSTR.channels)) ? MSTR.channels : [];
}
function svIsServo(c){ return !!c && /^servo/i.test(c.mode || ''); }
/* what this channel drives, in words. The naming seam, so a rack of gauges
   never shows a raw actuator id — same rule as the wiring sheet. */
function svDrives(c){
  if(!c || !c.act) return '';
  const lab = (typeof actPartLabel === 'function') ? actPartLabel(c.act) : '';
  return lab || ((typeof actFriendly === 'function') ? actFriendly(c.act) : c.act);
}
function svTileLabel(c){
  const n = (c.name || '').trim();
  return n || ('Channel ' + c.i);
}

/* ================================================================ the view */
function buildServos(){
  const host = $('svGrid'); if(!host) return;
  host.innerHTML = '';
  SV.tiles = [];
  const chans = svChannels();

  const head = $('svHead');
  if(head){
    head.innerHTML = '';
    const wrap = el('div','svhrow');
    /* the shape switch — Mike asked for both, so it is one control and not
       a setting buried in a menu */
    const seg = el('div','svseg');
    [['gauge','All 180°'],['dial','All 360°']].forEach(([id,label])=>{
      /* `act` only when EVERY tile is wearing it — a default of gauge with
         three dials set by hand is not "all 180°", and lighting the button
         as though it were would misreport the grid you are looking at */
      const all = SV.shape === id && !Object.keys(SV.per || {}).length;
      const b = el('button','svsegb'+(all?' act':''), label);
      b.id = 'btnSvShape_' + id;
      b.title = (id === 'gauge'
        ? 'a half-circle sweep — what the servo actually travels'
        : 'a full round bezel — packs squarer, and reads like an instrument')
        + '. Sets every servo, and clears any you set individually — each one can still be changed on its own card.';
      b.addEventListener('click', ()=>svSetShape(id));
      seg.appendChild(b);
    });
    wrap.appendChild(seg);

    const count = el('div','svcount');
    const live = chans.filter(svIsServo).length;
    count.innerHTML = chans.length
      ? '<b>' + chans.length + '</b> channel(s) · ' + live + ' servo · '
        + chans.filter(c=>c.act).length + ' wired to the model'
      : 'no channel table loaded';
    wrap.appendChild(count);
    head.appendChild(wrap);
  }

  if(!chans.length){
    const empty = el('div','svempty');
    empty.innerHTML = '<b>Nothing to show yet.</b> This is one gauge per channel on your board, so it needs '
      + 'a channel table. Build one here, import a <code>.mstr</code> on the Board tab, or run the setup.';
    host.appendChild(empty);
    const bar = el('div','conbar');
    const bGen = el('button','b prim','Build a servo layout');
    bGen.id = 'btnSvStarter';
    bGen.title = 'a channel per servo on your board, plus eight routines that visibly move them';
    bGen.addEventListener('click', ()=>{
      if(typeof kioskOn === 'function' && kioskOn()) return;
      makeStarter('rack');
      if(typeof CFG !== 'undefined') CFG.maestroSource = 'imported';
      if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
      buildServos();
    });
    bar.appendChild(bGen);
    host.appendChild(bar);
    return;
  }

  chans.forEach(c=>{
    const wrap = el('div','svtile' + (svIsServo(c) ? '' : ' off') + (SV.sel === c.i ? ' sel' : ''));
    wrap.dataset.ch = c.i;
    wrap.tabIndex = 0;
    wrap.title = 'channel ' + c.i + ' — ' + svTileLabel(c)
               + (c.act ? '\ndrives ' + svDrives(c) : '\nnot wired to anything on the model')
               + '\nclick to wire, name or test it';

    const face = svFace(svShapeOf(c.i));
    wrap.appendChild(face.svg);

    const n = el('div','svn', 'ch ' + c.i);
    wrap.appendChild(n);
    const nm = el('div','svname', svTileLabel(c));
    wrap.appendChild(nm);
    const dr = el('div','svdrives', c.act ? svDrives(c) : '—');
    if(!c.act) dr.classList.add('none');
    wrap.appendChild(dr);
    const read = el('div','svread','0.00');
    wrap.appendChild(read);

    const open = ()=>svSelect(c.i);
    wrap.addEventListener('click', open);
    wrap.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); } });

    host.appendChild(wrap);
    SV.tiles.push({i:c.i, needle:face.needle, read, wrap, shape:svShapeOf(c.i), geo:face.geo});
  });

  svTick();
  svBuildCard();
}

/* the per-frame move. Called from the frame loop next to updateOutputs() —
   only while the view is on screen, because a hidden grid is 128 needles
   nobody is looking at. */
function svTick(){
  /* the guard lives HERE, not at the call site, so the one line in the UI
     tick cannot forget it — a grid nobody is looking at is 128 needles of
     wasted work sixteen times a second */
  if(!SV.tiles.length || !svVisible()) return;
  const chans = svChannels();
  for(const t of SV.tiles){
    const c = chans[t.i]; if(!c) continue;
    const v = (typeof chanPosNorm === 'function') ? chanPosNorm(c) : 0;
    t.needle.setAttribute('transform',
      'rotate(' + svAngle(t.shape, v).toFixed(1) + ' ' + t.geo.cx + ' ' + t.geo.cy + ')');
    t.read.textContent = v.toFixed(2);
    t.wrap.classList.toggle('moving',
      typeof CHPOS_T !== 'undefined' && CHPOS_T[t.i] !== undefined
      && Math.abs(CHPOS_T[t.i] - (CHPOS[t.i] !== undefined ? CHPOS[t.i] : CHPOS_T[t.i])) > 0.004);
  }
}
function svVisible(){ return !!SV.shown; }

/* ======================================================= on the stage
   The seam scene/models.js drives, the same shape as mouseSetShown() and
   mbSetShown(). `body.model-servos` is what takes the canvas, the HUD and
   the stage buttons out of the way (15-servos.css) — one class, so nothing
   here has to know which pieces of furniture exist. */
function svSetShown(on){
  const was = SV.shown;
  SV.shown = !!on;
  document.body.classList.toggle('model-servos', SV.shown);
  if(SV.shown){
    svRestore();
    buildServos();
  }else if(was){
    svDeselect();
    SV.tiles = [];
    const g = $('svGrid'); if(g) g.innerHTML = '';
    const h = $('svHead'); if(h) h.innerHTML = '';
  }
}

/* ============================================================== the card
   "a similar config like on clicking panels" — cad/select.js's
   buildSelCard(), one size down and pointed at a CHANNEL instead of a part.
   It floats at the top right of the STAGE, which is exactly where #selcard
   appears when you click a panel on the droid: same corner, same width,
   same manners.
   Three rows, because those are the three things you want at the moment you
   have just pointed at a gauge: what it drives, what it is called, and move
   it so I can see which one it is. Everything deeper is the servo bench's
   job and the card says so. */
function svSelect(i){
  SV.sel = (SV.sel === i) ? -1 : i;
  document.querySelectorAll('#svGrid .svtile').forEach(t=>
    t.classList.toggle('sel', +t.dataset.ch === SV.sel));
  svBuildCard();
}
function svDeselect(){ SV.sel = -1; document.querySelectorAll('#svGrid .svtile.sel').forEach(t=>t.classList.remove('sel')); svBuildCard(); }

function svBuildCard(){
  const card = $('svCard'); if(!card) return;
  const c = svChannels()[SV.sel];
  if(!c){ card.classList.remove('on'); card.innerHTML = ''; return; }
  card.innerHTML = '';
  card.classList.add('on');

  const head = el('div','selhead');
  head.appendChild(el('div','seltitle', 'Channel ' + c.i));
  const bX = el('button','hbtn','✕');
  bX.id = 'btnSvCardX'; bX.title = 'close (Esc)';
  bX.addEventListener('click', svDeselect);
  head.appendChild(bX);
  card.appendChild(head);

  const sub = el('div','selsub');
  /* the MODE is only worth a word when it is not the ordinary one — "Servo 4
     · Servo · not wired" reads like a stutter, and every channel here is a
     servo unless somebody deliberately made it an input */
  sub.innerHTML = xmlEsc(svTileLabel(c))
    + (svIsServo(c) ? '' : ' · ' + xmlEsc(c.mode || 'Input'))
    + (c.act ? ' · drives <b>' + xmlEsc(svDrives(c)) + '</b>' : ' · not wired to the model');
  card.appendChild(sub);

  /* 1 — THIS servo's shape. Mike, v1.60.0: "the 180 / 360 gauges should be
     selectable for each servo", and the card you opened by clicking that
     servo is the obvious place to say it. `default` is a real third choice
     rather than a missing one: it is what makes the head's All buttons
     able to move a tile you have not deliberately pinned. */
  const rS = el('div','selrow');
  rS.appendChild(el('label',null,'Face'));
  const seg = el('div','svseg small');
  const own = (SV.per && SV.per[c.i]) || '';
  [['gauge','180°'],['dial','360°']].forEach(([id,label])=>{
    const b = el('button','svsegb'+(svShapeOf(c.i)===id?' act':''), label);
    b.id = 'btnSvCardShape_' + id;
    b.title = (id === 'gauge' ? 'a half-circle sweep — the servo\u2019s real travel'
                              : 'a full round bezel')
            + (own === id ? ' — set for this servo. Click again to follow the board default.' : '');
    b.addEventListener('click', ()=>{ svSetShapeOf(c.i, own === id ? '' : id); });
    seg.appendChild(b);
  });
  rS.appendChild(seg);
  card.appendChild(rS);

  /* 2 — what it drives. HW.setPart() is the one writer (it does the
     clear-then-set AND saves the table); the option list is HW.parts(),
     which is the same list the bench's own Part column offers. */
  const canPart = typeof HW !== 'undefined' && typeof HW.setPart === 'function'
               && typeof HW.parts === 'function' && HW.parts().length;
  if(canPart){
    const r1 = el('div','selrow');
    r1.appendChild(el('label',null,'Drives'));
    const sel = document.createElement('select');
    sel.id = 'svCardPart';
    const o0 = document.createElement('option'); o0.value=''; o0.textContent='— nothing —';
    sel.appendChild(o0);
    HW.parts().forEach(p=>{
      if(!p.act) return;
      const o = document.createElement('option');
      o.value = p.act; o.textContent = p.label;
      if(c.act === p.act) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', ()=>{
      if(typeof kioskOn === 'function' && kioskOn()) return;
      HW.setPart(c.i, sel.value);
      buildServos();
    });
    r1.appendChild(sel);
    card.appendChild(r1);
  }

  /* 3 — its name. Straight onto the channel, the way the bench's name field
     writes it, then through HW.save() so it survives a reload. */
  const r2 = el('div','selrow');
  r2.appendChild(el('label',null,'Name'));
  const inp = document.createElement('input');
  inp.type = 'text'; inp.id = 'svCardName';
  inp.value = c.name || '';
  inp.placeholder = 'Channel ' + c.i;
  inp.addEventListener('change', ()=>{
    if(typeof kioskOn === 'function' && kioskOn()) return;
    c.name = inp.value.slice(0, 40);
    if(typeof HW !== 'undefined' && typeof HW.save === 'function') HW.save();
    buildServos();
  });
  r2.appendChild(inp);
  card.appendChild(r2);

  /* 4 — move it. Writes the channel's TARGET, so the needle eases there the
     way it would off a frame rather than snapping: what you are testing is
     the servo, and a servo takes time. */
  const r3 = el('div','selrow');
  r3.appendChild(el('label',null,'Test'));
  const sl = document.createElement('input');
  sl.type='range'; sl.min=0; sl.max=1; sl.step=0.01; sl.id='svCardTest';
  sl.value = (typeof chanPosNorm === 'function') ? chanPosNorm(c) : 0.5;
  sl.addEventListener('input', ()=>{
    if(typeof kioskOn === 'function' && kioskOn()) return;
    const t = +sl.value;
    if(c.act && typeof ACT_T !== 'undefined') ACT_T[c.act] = t;
    if(typeof chanPosSet === 'function') chanPosSet(c.i, t);
    if(typeof EDIT !== 'undefined' && EDIT.live) EDIT.live[c.i] = chanDenorm(c, t);
  });
  r3.appendChild(sl);
  card.appendChild(r3);

  const h = el('div','hint prose');
  h.innerHTML = c.act
    ? 'Moving it here moves the model too. Its end stops and speed live on the <b>servo bench</b>.'
    : 'This one drives nothing on the model, so only the gauge moves — which is the point: '
      + 'a sequence can still be written against it. Its end stops live on the <b>servo bench</b>.';
  card.appendChild(h);
}

/* Esc closes the card, the same key that deselects a part on the model */
function svKey(e){
  if(e.key !== 'Escape' || SV.sel < 0 || !svVisible()) return false;
  svDeselect();
  return true;
}
