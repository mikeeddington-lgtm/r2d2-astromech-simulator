'use strict';
/* =====================================================================
   BOARDS — what board is where, and what each channel drives

   Mike's build may end up with any mix: a Maestro in the dome and a
   mod2026 PCA9685 pair in the body, two Maestros, whatever. The choice
   lives in PREFS.hw (written through from the build answers), and this
   file is the one place that turns it into a CHANNEL LIST per location —
   hwPins() — plus the assign/release rules that keep one channel per part.

   Which board is "live" (driven by the running firmware) depends on the
   active profile; the other is reported as the planned wiring so the loom
   can still be labelled from it.

   It used to also DRAW the boards, as photo cards with clickable pins.
   That section was removed in v1.45.0 — the long note further down says
   why, and where the job went. Everything the rest of the app reads is
   still here: config/tab.js's panel assignment, app/panels.js, the wiring
   sheet and HW.parts() all come through these functions.
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
/* v1.54.0 — three to eight expanders, appended rather than typed out. The
   first two keep their hand-written entries above so the order of this list,
   which IS the order of the picker, does not change for anyone. */
for(let n = 3; n <= PCA_MAX_BOARDS_UI; n++){
  HW_CHOICES.push(['pca'+(n*16), 'PCA9685 ×'+n+' + co-processor']);
}
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

/* ===================================================================
   THE "BOARDS" SECTION WAS HERE, AND IT IS NOT COMING BACK (v1.45.0)

   Mike: "Remove the non-functional Wiring 'Boards' section." It drew one
   card per board on the setup's wiring step, each with a labelled photo,
   a strip over every channel and a row of pin buttons: click a pin, the
   part it drives flashes; click a part, its pin lights up.

   It only ever worked for a Maestro. BOARD_IMG/BOARD_PINMAP
   (app/board-img.js) cover the four Pololu boards and nothing else, so a
   mod2026 or PCA9685 build — which is the DEFAULT build — got a bare
   numeric grid with no photo; the pin buttons deliberately did not open
   the channel picker for mod2026, because that map is compile-time
   constants in the sketch; and the messages explaining all of this were
   written to $('cadMsg'), an element that does not exist while the setup
   overlay is up. So on the commonest build every click was a silent
   no-op, which is worse than no section at all.

   Removed with it: chPicker()/chPickerClose(), the popover the pin strips
   opened. Nothing else called them. EVERYTHING ELSE IN THIS FILE STAYS —
   hwPins(), hwLocs(), chAssign(), chFindUse(), chRelease() and the chLabel
   family are what config/tab.js's panel assignment, app/panels.js, the
   wiring sheet and HW.parts() read, and chPartOptions() in particular is
   the whole of the Bench's `drives` column.

   Where the job went instead: the PANELS step asks "which servo moves
   which panel?" with a dropdown per part (config/tab.js, buildAssignSect)
   and the wiring sheet prints every channel with its part, bearing and
   travel — both of which work on every build, photo or no photo.
   =================================================================== */

/* Called by selectPart(), cad/ui.js and the HW host so a pin highlight could
   follow the model. There are no pin cards left to highlight (v1.45.0 — see
   above), so there is nothing to do.

   It stays, and it stays a function: four call sites in three files this
   module does not own call it on every selection and every channel edit, and
   the honest way to say "that view is gone" is one no-op here rather than four
   deletions elsewhere. It still asks where the cards are, so if anyone ever
   builds a pin view again this keeps working the moment they do. */
function boardVizSync(){
  const host = ($('startupBody') && $('startupBody').querySelector('.boardcard') && typeof buildStartup==='function') ? buildStartup
             : ($('cfgHost') && $('cfgHost').querySelector('.boardcard') && typeof buildConfig==='function') ? buildConfig
             : ($('cadHost') && $('cadHost').querySelector('.boardcard') && typeof buildCadPane==='function') ? buildCadPane
             : null;
  if(host) host();
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
    /* `c &&` for the same reason HW.setPart() has it: a table that came back
       through the servo store has explicit NULLS where the JSON had holes
       (JSON.stringify writes null for a sparse slot), and forEach visits an
       explicit null even though it skips a real hole. */
    if(act) MSTR.channels.forEach(c=>{ if(c && c.act===act) c.act=''; });
    const c = MSTR.channels[ch];
    if(c){
      c.act = act||'';
      if(act){
        if(!/^servo/i.test(c.mode)) c.mode='Servo';
        const nm = actPartLabel(act) || actCadName(act); if(nm) c.name = nm;
      }
    }
    if(typeof rebuildMaestroUI==='function') rebuildMaestroUI();
    /* AND SAVE IT (v1.66.3). The planned branch below has always ended in
       prefsSave(); this one redrew three surfaces and wrote nothing, and
       servoStoreSave() — which HW.save() calls — is the only writer of
       r2sim.servo.v1. So every panel→channel assignment made on the Panels
       step or in the Outputs detail panel looked right for the rest of the
       session and was silently replaced by servoStoreLoad() on the next
       reload. HW.setPart() calls this.save() for exactly this reason. */
    if(typeof HW !== 'undefined') HW.save();
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
