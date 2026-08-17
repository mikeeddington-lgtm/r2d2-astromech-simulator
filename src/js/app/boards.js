'use strict';
/* =====================================================================
   BOARDS — the electronics, visually

   Mike's build may end up with any mix: a Maestro in the dome and a
   mod2026 PCA9685 pair in the body, two Maestros, whatever. The choice
   lives in PREFS.hw (written through from the build answers), and this
   section draws each board with CLICKABLE PINS:

     click a pin  -> the part wired to it flashes and gets selected
     click a part -> its pin lights up here

   Which board is "live" (driven by the running firmware) depends on the
   active profile; the other is shown as the planned wiring so the loom
   can still be labelled from it.
   ===================================================================== */
const HW_CHOICES = [
  ['mod2026','PCA9685 (mod2026)'],
  ['micro6','Micro Maestro 6'],
  ['mini12','Mini Maestro 12'],
  ['mini18','Mini Maestro 18'],
  ['mini24','Mini Maestro 24'],
  /* v1.33.0 — the co-processor route. These are PCA_SEQ_BOARDS ids, and
     they take the MAESTRO branch of hwPins() on purpose: from this section's
     point of view a co-processor is a board with N channels that the host
     addresses over the Maestro link, which is exactly a Maestro. What they
     have no entry for is BOARD_IMG — there is no one photo of "an Arduino
     and two expanders", and the pin grid draws fine without one. */
  ['pca16','PCA9685 ×1 + co-processor'],
  ['pca32','PCA9685 ×2 + co-processor']
];
/* PREFS.hw is the store the Boards section reads, but the BUILD answers are
   the source of truth for what board is where — so an unset hw block takes
   its values from them rather than from a second, drifting default. */
function hwDefault(){
  if(typeof buildGet === 'function'){
    const b = buildGet();
    const d = buildOpt('domeServo', b.domeServo), y = buildOpt('bodyServo', b.bodyServo);
    if(d && y) return {dome:d.hw, body:y.hw};
  }
  return {dome:'mini24', body:'mod2026'};
}
function hwGet(){
  if(!PREFS.hw) PREFS.hw = hwDefault();
  return PREFS.hw;
}
/* The board at a LOCATION, where a location may now be 'both' (v1.34.0 — one
   controller running the whole droid). PREFS.hw keeps its two keys either
   way, with the same value in each when the build is shared, so a saved
   setup .json written before the merge still loads and every consumer that
   knows only 'dome'/'body' still works. */
function hwAt(loc){ return hwGet()[loc === 'both' ? 'dome' : loc]; }
/* the locations this build actually has boards at */
function hwLocs(){
  return (typeof buildServoLocs === 'function') ? buildServoLocs() : ['dome','body'];
}
function hwLabel(id){ const h=HW_CHOICES.find(x=>x[0]===id); return h?h[1]:id; }

/* the pin list for one location: [{pin, name, act, live}] */
function hwPins(loc){
  const hw = hwAt(loc);
  const where = (typeof servoLocLabel === 'function') ? servoLocLabel(loc)
              : (loc === 'dome' ? 'Dome' : 'Body');
  if(hw === 'mod2026'){
    /* mod2026: 0x40 is the body board, 0x41 the dome board — fixed by the sketch */
    const board = (loc==='body') ? 1 : 2;
    const defs = SERVO_DEFS[board];
    const n = 16;
    const out=[];
    for(let i=0;i<n;i++){
      const d = defs.find(x=>x.ch===i);
      out.push({pin:i, name:d?d.name:'', act:d?d.act:'', live:PROFILE.hasServos});
    }
    return {title:where+' — PCA9685 '+(board===1?'0x40':'0x41')+' (mod2026)',
            pins:out, live:PROFILE.hasServos,
            note:PROFILE.hasServos?'live — driven by the running sketch':'planned — switch to mod2026 to drive it'};
  }
  /* a Maestro variant. If the loaded settings use this same board size and the
     profile has a Maestro, treat it as the live one. */
  const bd = boardById(hw);
  const live = PROFILE.hasMaestro && MSTR.loaded && MSTR.board===hw;
  const ov = (!live && PREFS.hwMap && PREFS.hwMap[loc]) || null;   // planned-board edits
  const out=[];
  for(let i=0;i<bd.ch;i++){
    let name='', act='';
    if(live){
      const c = MSTR.channels[i];
      if(c && /^servo/i.test(c.mode)){ name=c.name; act=c.act||''; }
    }else{
      /* 'both' takes the DOME naming: pies first, panels filling the rest,
         which is the layout worth starting from when one board runs
         everything (same rule as buildEnsureMaestro) */
      const names = starterNames(loc==='body'?'body':'dome', bd.ch);
      if(names[i]){ name=names[i]; act=guessPart(names[i]); }
      if(ov && ov[i]!==undefined){                 // user reassigned this pin on the picker
        act = ov[i]||'';
        name = act ? (actPartLabel(act)||act) : '';
      }
    }
    out.push({pin:i, name, act, live});
  }
  return {title:where+' — '+bd.product, pins:out, live,
          note: live ? 'live — this is the loaded Maestro settings'
                     : 'planned layout — generate/import a matching .mstr on the Maestro tab to drive it'};
}

function buildBoardsSect(host){
  const s = sect(host, 'Boards', 'click a pin ↔ click a part');
  /* one card per BOARD, not per end — a shared controller is one board and
     drawing it twice would be two lies for the price of one */
  hwLocs().forEach(loc=>{
    const info = hwPins(loc);
    const card = el('div','boardcard'+(info.live?' live':''));
    const head = el('div','bchead');
    head.appendChild(el('b',null,info.title));
    head.appendChild(el('span','bcnote',info.note));
    card.appendChild(head);

    /* Pololu's own labelled photo, with a clickable strip on every channel */
    const hw = hwAt(loc);
    if(typeof BOARD_IMG!=='undefined' && BOARD_IMG[hw]){
      const wrap = el('div','bimgwrap');
      const img = document.createElement('img');
      img.src = BOARD_IMG[hw]; img.className='bimg'; img.alt = hwLabel(hw);
      wrap.appendChild(img);
      const pm = BOARD_PINMAP[hw];
      if(pm) pm.banks.forEach(bank=>{
        for(let k=0;k<bank.n;k++){
          const ch = bank.horiz ? (bank.rev ? bank.ch0+bank.n-1-k : bank.ch0+k) : bank.ch0+k;
          const p = info.pins[ch]; if(!p) continue;
          const strip = el('div','pinstrip'
            + (bank.horiz ? ' h' : '')
            + (p.act && actCadParts(p.act).length ? ' ok' : p.name ? ' named' : ''));
          if(bank.horiz){
            strip.style.left  = (bank.x0 + (bank.x1-bank.x0)*k/bank.n)+'%';
            strip.style.width = ((bank.x1-bank.x0)/bank.n)+'%';
            strip.style.top   = bank.y+'%'; strip.style.height = bank.h+'%';
          }else{
            strip.style.left  = bank.x+'%'; strip.style.width = bank.w+'%';
            strip.style.top   = (bank.y0 + (bank.y1-bank.y0)*k/bank.n)+'%';
            strip.style.height= ((bank.y1-bank.y0)/bank.n)+'%';
          }
          strip.title = 'ch '+ch+(p.name? ': '+p.name : ' — unassigned')
            + '\nclick to see the connection and change it';
          strip.textContent = ch;
          strip.addEventListener('click',ev=>{ ev.stopPropagation(); chPicker(loc, ch, strip); });
          wrap.appendChild(strip);
        }
      });
      const cr = el('div','bcredit','board photo: pololu.com');
      wrap.appendChild(cr);
      card.appendChild(wrap);
    }

    const row = el('div','pinrow');
    const selAct = (typeof SEL!=='undefined' && SEL.name) ? (CAD.moving.find(m=>m.name===SEL.name)||{}).act : null;
    info.pins.forEach(p=>{
      const b = el('button','pinbtn'
        + (p.act && actCadParts(p.act).length ? ' ok' : p.name ? ' named' : '')
        + (selAct && p.act===selAct ? ' sel' : ''), p.pin);
      b.title = p.name ? (p.pin+': '+p.name + (p.act ? '  →  '+(actCadName(p.act)||p.act) : '')) : 'pin '+p.pin+' — unassigned';
      b.addEventListener('click',ev=>{
        if(hw!=='mod2026'){ ev.stopPropagation(); chPicker(loc, p.pin, b); return; }
        if(!p.act){ const m=$('cadMsg'); if(m) m.textContent='Pin '+p.pin+' has nothing assigned — map it on the Maestro tab or via a part card.'; return; }
        const parts = actCadParts(p.act);
        if(parts.length){
          selectPart(parts[0].name);
          actSet(p.act, 1); setTimeout(()=>actSet(p.act, 0), 700);   // flash the real thing
        }else{
          const m=$('cadMsg'); if(m) m.textContent='Pin '+p.pin+' drives "'+p.name+'" — that part is not in the CAD exports, so nothing can flash.';
        }
      });
      row.appendChild(b);
    });
    card.appendChild(row);
    s.appendChild(card);
  });
  const h = el('div','hint');
  h.innerHTML = 'Which controller lives where comes from the <b>Servos</b> answer earlier in this setup — one board for the whole droid, or mix and match (a Maestro in the dome and the mod2026 PCA9685 pair in the body is fine). '
    + 'Green pins drive a part of the 3D model; clicking one selects it and flashes the servo. Selecting a part on the model lights its pin here.';
  s.appendChild(h);
}
/* called by selectPart so the pin highlight follows the model.
   The Boards cards moved to the Config tab on 2026-07-27 — rebuild whichever
   pane is actually showing them, and never rebuild a pane that is not. */
function boardVizSync(){
  /* the cards have moved twice now (Model tab → Config tab → the setup's
     wiring step), so ask where they actually are rather than assuming */
  if($('startupBody') && $('startupBody').querySelector('.boardcard') && typeof buildStartup==='function') buildStartup();
  else if($('cfgHost') && $('cfgHost').querySelector('.boardcard') && typeof buildConfig==='function') buildConfig();
  else if($('cadHost') && $('cadHost').querySelector('.boardcard')) buildCadPane();
}

/* =====================================================================
   CHANNEL PICKER — click a channel on the photo, see what it drives,
   pick something else off a list. Warns before stealing a part that is
   already wired to another channel (and releases the old channel, so
   the one-channel-per-part rule holds everywhere).
   ===================================================================== */
function chPartOptions(){
  const seen = new Set(); const out = [];
  if(typeof CAD!=='undefined' && CAD.loaded) CAD.moving.forEach(m=>{
    if(!m.act || seen.has(m.act)) return;
    seen.add(m.act);
    /* Mike: "why do multiple say pie 5" — four of the six inner pies are all
       literally named "Pie5" in the Fusion export (cad/naming.js explains).
       Leading the label with "Pie 2  (Pie5)" made every one of the four
       LOOK the same; the human label stands alone now and the CAD name
       rides along as `cad` for whichever renderer wants it in a tooltip. */
    out.push({act:m.act, label: partLabel(m.name), cad: m.base});
  });
  out.sort((a,b)=>a.label.localeCompare(b.label));
  /* v1.40.0 — Mike: "option to choose others that are not part of the
     model, say Other 1 through 10". Ten model-independent placeholders
     (core/actuators.js OTH_KEYS), appended AFTER the sort so they group at
     the end rather than interleaving alphabetically with the droid's own
     parts. `other:true` is the flag a renderer uses to draw a
     separator/optgroup ("Not on the model") instead of mixing them in. */
  OTH_KEYS.forEach((act,i)=>out.push({act, label:'Other '+(i+1), other:true}));
  return out;
}
/* where is this act wired right now, other than (exceptLoc,exceptCh)? */
function chFindUse(act, exceptLoc, exceptCh){
  if(!act) return null;
  for(const loc of hwLocs()){
    const info = hwPins(loc);
    for(const p of info.pins){
      if(p.act===act && !(loc===exceptLoc && p.pin===exceptCh))
        return {loc, ch:p.pin, name:p.name, title:info.title, fixed: hwAt(loc)==='mod2026'};
    }
  }
  return null;
}
/* ===================================================================
   ONE NAME PER CHANNEL, EVERYWHERE (v1.40.0)
   Mike: "do the driven by names match the names put in via the servo
   config?" They did not, consistently — some labels showed the assigned
   part ("ch 0 · Pie 1"), others the bare actuator id ("ch 5 · pie5"),
   which reads as two systems disagreeing about the same channel. One rule
   now, everywhere a channel gets named in the UI: the string MIKE TYPED
   into the servo config wins — that is what the question was actually
   about — the driven part's label steps in only when the channel itself
   carries no real name, and the bare channel number stands alone only
   when neither exists.
   =================================================================== */
/* is this channel name one nobody actually typed? ('Channel 7' is
   HW.ensure()/setupUse()'s own default, 'not used' is the empty-name
   placeholder text) */
function chGenericName(name){
  const s = String(name||'').trim();
  return !s || /^channel\s*\d+$/i.test(s) || /^not used$/i.test(s);
}
/* actPartLabel(act) only ever answers for a CAD part; an 'oth*' placeholder
   (change 2) has none and never will, so it needs its own fallback here or
   the driven-by column would go blank for exactly the channels Mike just
   asked to be able to name. */
function actAnyLabel(act){
  if(!act) return '';
  const p = actPartLabel(act);
  if(p) return p;
  const m = /^oth(\d+)$/.exec(act);
  return m ? 'Other '+m[1] : '';
}
/* the bit that goes after "ch N  ·  " — '' means nothing worth showing */
function chNamedText(name, act){
  if(!chGenericName(name)) return name;
  return act ? actAnyLabel(act) : '';
}
/* the one format every driven-by / channel-list label in the app shares */
function chLabel(ch, name, act){
  const t = chNamedText(name, act);
  return 'ch '+ch + (t ? '  ·  '+t : '');
}
/* the full story, for a tooltip: 'Channel 5 "pie5" → drives Pie 5' */
function chLabelTip(ch, name, act){
  const bits = ['Channel '+ch];
  if(!chGenericName(name)) bits.push('"'+name+'"');
  const p = act ? actAnyLabel(act) : '';
  if(p) bits.push('→ drives '+p);
  else if(act) bits.push('→ drives '+act+' (no CAD part)');
  return bits.join(' ');
}
/* write an assignment to whichever store owns this board */
function chAssign(loc, ch, act){
  const hw = hwAt(loc);
  if(hw==='mod2026') return false;                        // fixed by the sketch
  const live = PROFILE.hasMaestro && MSTR.loaded && MSTR.board===hw;
  if(live){
    if(act) MSTR.channels.forEach(c=>{ if(c.act===act) c.act=''; });
    const c = MSTR.channels[ch];
    if(c){
      c.act = act||'';
      if(act){
        if(!/^servo/i.test(c.mode)) c.mode='Servo';
        const nm = actPartLabel(act) || actCadName(act); if(nm) c.name = nm;
      }
    }
    if(typeof rebuildMaestroUI==='function') rebuildMaestroUI();
  }else{
    if(!PREFS.hwMap) PREFS.hwMap = {};
    if(!PREFS.hwMap[loc]) PREFS.hwMap[loc] = {};
    if(act){                                              // release it wherever this board shows it now
      hwPins(loc).pins.forEach(p=>{ if(p.act===act && p.pin!==ch) PREFS.hwMap[loc][p.pin]=''; });
    }
    PREFS.hwMap[loc][ch] = act||'';
    prefsSave();
  }
  return true;
}
/* clear the act from the OTHER board when the user confirms a move */
function chRelease(use){
  if(!use || use.fixed) return;                           // mod2026 mapping cannot be edited
  chAssign(use.loc, use.ch, '');
}
function chPickerClose(){
  const old = document.querySelector('.chpick');
  if(old) old.remove();
  document.removeEventListener('click', chPickerClose);
}
function chPicker(loc, ch, anchor){
  chPickerClose();
  const hw = hwGet()[loc];
  const info = hwPins(loc);
  const p = info.pins[ch]; if(!p) return;

  const pop = el('div','chpick');
  pop.addEventListener('click',ev=>ev.stopPropagation());
  pop.appendChild(el('div','chpkh','ch '+ch+' — '+info.title));
  const cur = el('div','chpkcur');
  cur.textContent = p.act
    ? '→ '+(actPartLabel(p.act)||p.name||p.act)
    : (p.name ? '→ '+p.name+' (no matching CAD part)' : '— unassigned —');
  pop.appendChild(cur);

  if(hw==='mod2026'){
    pop.appendChild(el('div','hint','This channel map is fixed by the mod2026 sketch — its assignments are compile-time constants.'));
  }else{
    const sel = document.createElement('select');
    const o0 = document.createElement('option'); o0.value=''; o0.textContent='— unassigned —'; sel.appendChild(o0);
    /* the ten placeholders group apart under their own optgroup rather than
       sorting into the droid's own parts (chPartOptions' `other` flag) */
    const grpOther = document.createElement('optgroup'); grpOther.label = 'Not on the model';
    chPartOptions().forEach(op=>{
      const o = document.createElement('option'); o.value=op.act; o.textContent=op.label;
      /* Mike: "why do multiple say pie 5" — the CAD name lives in the
         tooltip now, not appended to the label (see chPartOptions) */
      if(op.cad) o.title = op.cad;
      if(op.act===p.act) o.selected = true;
      const use = chFindUse(op.act, loc, ch);
      if(use){ o.textContent += '  — in use: '+chLabel(use.ch, use.name, op.act)+(use.loc===loc?'':' ('+use.loc+')'); }
      (op.other ? grpOther : sel).appendChild(o);
    });
    if(grpOther.childElementCount) sel.appendChild(grpOther);
    sel.title = 'what is plugged into channel '+ch;
    sel.addEventListener('change',async ()=>{
      const act = sel.value;
      if(act){
        const use = chFindUse(act, loc, ch);
        if(use){
          const msg = use.fixed
            ? (actPartLabel(act)||act)+' is also wired to '+use.title+' ch '+use.ch+' — that sketch mapping is fixed, so it would appear on both boards. Assign it here anyway?'
            : (actPartLabel(act)||act)+' is already on '+use.title+' ch '+use.ch+'. Move it to this channel?';
          if(!await appConfirm(msg, {title:'Channel in use', yes:use.fixed?'Assign it':'Move it', no:'Cancel', danger:true})){
            sel.value = p.act||''; return;
          }
          chRelease(use);
        }
      }
      chAssign(loc, ch, act);
      chPickerClose();
      if(typeof buildCadPane==='function') buildCadPane();
      lg('mae','ch '+ch+' ('+loc+') '+(act ? '→ '+(actPartLabel(act)||act) : 'cleared'));
    });
    pop.appendChild(sel);
    if(!info.live) pop.appendChild(el('div','hint','planned board — this edit is saved in your prefs and used by the starter .mstr'));
  }

  const bx = el('button','b chpkx','Close');
  bx.addEventListener('click',chPickerClose);
  pop.appendChild(bx);

  /* place it near the click, kept on screen */
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, phh = pop.offsetHeight;
  let x = r.right + 8, y = r.top - 4;
  if(x + pw > innerWidth - 8)  x = Math.max(8, r.left - pw - 8);
  if(y + phh > innerHeight - 8) y = Math.max(8, innerHeight - phh - 8);
  pop.style.left = x+'px'; pop.style.top = y+'px';

  /* show the current part on the model while the picker is open */
  if(p.act){
    const parts = actCadParts(p.act);
    if(parts.length){ selectPart(parts[0].name); actSet(p.act,1); setTimeout(()=>actSet(p.act,0),700); }
  }
  setTimeout(()=>document.addEventListener('click', chPickerClose), 0);
}
