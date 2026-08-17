'use strict';
/* =====================================================================
   CONFIG TAB SECTIONS

   Mike, 2026-07-27: "all of this should move into this one configuration
   panel or configuration tab". So the Config tab is now the single place
   the droid is configured — the build answers, the boards and their pin
   maps (which used to live on the Model tab), the panel assignment, and
   the paint (which used to live only on the startup overlay).

   The wizard and this tab share these builders so the two can never drift.
   ===================================================================== */

/* (buildBuildSect — the compact one-select-per-question build section —
   lived here until v1.18.0. It had no callers anywhere in the tree since
   the SETUP took the build answers over, so the Stage-5 sweep removed it;
   the wizard's card UI in config/wizard.js is the one build editor.) */

/* ------------------------------------------------ panel ↔ servo assignment
   The pin-first view lives on the Boards cards; this is the part-first view
   Mike asked for — walk down the droid and say what moves each flap. */
function assignChannelIndex(){
  /* act → {loc, ch, board} across both configured boards */
  const idx = {};
  /* whatever boards this build has — one shared controller is ONE pass, not
     two identical ones (v1.34.0) */
  hwLocs().forEach(loc=>{
    if(typeof hwPins !== 'function') return;
    const info = hwPins(loc);
    /* v1.40.0 — `name` rides along too, so a driven-by cell can show the
       servo-config name Mike actually typed, not just the channel number
       (chLabel/chLabelTip, app/boards.js). `mstr` says whether `ch` is
       genuinely an index into HW.channels()/MSTR.channels — hwPins() only
       reads the LOADED Maestro settings for whichever location matches
       MSTR.board; the other location (or an unloaded planned board) is
       drawn from PREFS.hwMap instead, and its channel numbers do not line
       up with MSTR.channels at all. assignTest (below) must not drive
       hardware from a mismatched index. */
    info.pins.forEach(p=>{ if(p.act && !idx[p.act]) idx[p.act] = {loc, ch:p.pin, name:p.name, title:info.title, fixed:hwAt(loc)==='mod2026', mstr:info.live}; });
  });
  return idx;
}
function assignChannelOptions(){
  const out = [];
  hwLocs().forEach(loc=>{
    if(hwAt(loc) === 'mod2026') return;            // compile-time constants, not editable
    const info = hwPins(loc);
    const where = (loc === 'both') ? '' : servoLocLabel(loc)+' ';
    /* v1.40.0 — Mike: "do the driven by names match the names put in via
       the servo config?" This used to fall back to the raw actuator id
       ("ch 5 · pie5") whenever a channel's own name was still the default;
       chLabel (app/boards.js) is the one rule every such label now shares —
       the servo-config name first, the driven part's label only if the
       channel itself was never named. */
    info.pins.forEach(p=>out.push({
      value: loc+':'+p.pin,
      label: where + chLabel(p.pin, p.name, p.act) + (p.act ? '' : '  · free')
    }));
  });
  return out;
}
/* 'pie3' -> 3, unassigned parts sort to the bottom */
function actSortKey(m){
  if(!m.act) return 1e6;
  const n = /(\d+)$/.exec(m.act);
  return n ? parseInt(n[1],10) : 0;
}
const ASSIGN_GROUPS = [
  {kind:'pie',   title:'Dome pie panels'},
  {kind:'panel', title:'Dome side panels'},
  {kind:'anim',  title:'Body doors & arms'}
];
/* ------------------------------------------------------------------ ▶ test
   Mike: "Assign Panels / Panels should have the ability to live test so the
   live servos match the panels on the sim." Off the bench this only ever
   moved the SIM part (actSet). On a LIVE bench — a board actually
   streaming positions, `typeof SER!=='undefined' && SER.port &&
   !SER.blocked` — the same button now drives the real channel too:
   HW.drive() writes the bench engine, the wire AND ACT_T in one call
   (hw-host.js), so ONE call moves sim+real together; the return-to-home a
   moment later is the same call again, to the channel's own home. Off the
   bench, or on a fixed mod2026 channel HW.channels() knows nothing about,
   this behaves exactly as it always did — sim only.

   Kiosk: never. Panels lives only on the Config tab and the setup wizard's
   Panels step, and body.kiosk hides both wholesale (#side and #splitV —
   src/css/10-kiosk.css) exactly the way it hides the rest of Setup, so
   this is unreachable there already (app/kiosk.js's own note: "hiding a
   control is cosmetic … the two doors that survive hiding the chrome are
   both closed here rather than in CSS"). The check below is the same
   belt-and-braces guard live-drive.js's liveOn() uses, in case a future
   caller reaches this without going through the (already-hidden) UI. */
function assignLive(){
  if(typeof kioskOn === 'function' && kioskOn()) return false;
  return typeof SER !== 'undefined' && !!SER.port && !SER.blocked;
}
/* would ▶ reach the real servo for THIS row? Live streaming, an editable
   (non-mod2026) channel, and `cur.mstr` — `cur.ch` genuinely has to index
   the LOADED Maestro's channel table (see assignChannelIndex's note); a
   planned-but-not-loaded board's channel numbers are not real indices into
   HW.channels() and driving one would hit the wrong servo. */
function assignWillDriveHw(cur){
  return assignLive() && !!cur && !cur.fixed && !!cur.mstr;
}
function assignTest(act, cur){
  if(!act) return;
  if(assignWillDriveHw(cur) && typeof HW !== 'undefined' && HW.channels){
    const c = HW.channels()[cur.ch];
    if(c){
      const open = (typeof blockOpen === 'function') ? blockOpen(c) : Math.max(c.min, c.max);
      const home = (typeof blockClosed === 'function') ? blockClosed(c) : (c.home || open);
      HW.drive(cur.ch, open);
      setTimeout(()=>HW.drive(cur.ch, home), 900);
      return;
    }
  }
  actSet(act, 1); setTimeout(()=>actSet(act, 0), 900);
}

/* the model-aware Panels note (1.3, and the improvement review's 1.3
   finding): buildAssignSect gated on CAD.loaded alone, never on
   modelGet(), so with the Anzellan head, the Polar Mouse or the Builder
   on stage this table still walked the droid's own pies and side panels
   as though that were what was in front of you. Collapse-don't-hide is
   still the rule — the droid rows below are exactly as useful as ever to
   someone who switches back — so the fix is one note at the top saying
   whose parts these actually are, and where the OTHER model's own parts
   get wired instead (its own pane on the Model tab). */
const ASSIGN_MODEL_NOUN = { frik:'Anzellan head', mouse:'Polar Mouse', builder:'Builder' };
function buildAssignModelNote(host){
  const model = (typeof modelGet === 'function') ? modelGet() : 'droid';
  if(model === 'droid') return;
  const noun = ASSIGN_MODEL_NOUN[model] || (typeof modelById === 'function' ? modelById(model).label : model);
  const n = el('div','note assignmodelnote');
  n.innerHTML = "These rows are the R2's panels. The <b>"+noun+"</b>'s own parts are assigned from its Model pane.";
  if(model === 'builder'){
    const bar = el('div','conbar');
    const b = el('button','b','Open the Builder pane');
    b.title = 'switch the Model tab to the Builder\'s own pane, where its joints are wired';
    b.addEventListener('click', ()=>{ typeof mbOpenPane === 'function' && mbOpenPane(); });
    bar.appendChild(b);
    n.appendChild(bar);
  }
  host.appendChild(n);
}

function buildAssignSect(host, redraw){
  if(typeof CAD === 'undefined' || !CAD.loaded){
    const s = sect(host, 'Panels & servos');
    s.appendChild(el('div','hint','No CAD model loaded, so there are no parts to assign yet.'));
    return s;
  }
  buildAssignModelNote(host);
  const idx = assignChannelIndex();
  const opts = assignChannelOptions();
  const anyEditable = opts.length > 0;
  const live = assignLive();
  if(live){
    const note = el('div','note cy');
    note.innerHTML = '⚡ <b>tests drive the real servos.</b> A board is connected and streaming, so every ▶ below drives the mapped channel on the bench as well as the model, then returns it home.';
    host.appendChild(note);
  }

  ASSIGN_GROUPS.forEach(g=>{
    const members = CAD.moving.filter(m=>m.kind === g.kind);
    if(!members.length) return;
    const s = sect(host, g.title, members.length+' parts');
    const hdr = el('div','asrow ashdr');
    ['Name','Driven by','Col','Test'].forEach(x=>hdr.appendChild(el('div','cn',x)));
    s.appendChild(hdr);

    /* actuator order, not azimuth: pie0-4 are Mike's Pie 1-5 and panel0-13
       already run round the dome, so this is also the order you wire them */
    members.slice().sort((a,c)=>actSortKey(a) - actSortKey(c) || a.name.localeCompare(c.name)).forEach(m=>{
      const row = el('div','asrow');
      /* Mike asked to be able to name panels here: four of the inner pies are
         all called Pie5 in the CAD, so a build-specific name is the only way
         to tell them apart on the bench. The CAD name never changes — the
         label rides on top of it (PARTS.overrides). */
      const lbl = partLabel(m.name);
      const nm = document.createElement('input');
      nm.type = 'text'; nm.className = 'asname'; nm.value = lbl;
      nm.title = m.name + (lbl===m.base ? '' : '  (CAD: '+m.base+')')
        + '\n' + (partAzimuth(m)===null ? '' : partAzimuth(m).toFixed(0)+'° from the front ('+azWord(partAzimuth(m))+')')
        + '\ntype your own name — the CAD name underneath never changes';
      if(lbl !== m.base) nm.classList.add('named');
      nm.addEventListener('click',e=>e.stopPropagation());
      nm.addEventListener('change',()=>{
        setPartLabel(m.name, nm.value.trim());
        nm.classList.toggle('named', partLabel(m.name) !== m.base);
        if(typeof buildCadPane === 'function') buildCadPane();
        lg('sys','part renamed: '+m.base+' → '+partLabel(m.name));
      });
      row.appendChild(nm);

      /* channel */
      const cur = m.act ? idx[m.act] : null;
      if(cur && cur.fixed){
        /* v1.40.0 — the servo-config name rides along here too (chLabel) */
        const f = el('div','asfix', (cur.loc==='dome'?'Dome ':'Body ')+chLabel(cur.ch, cur.name, m.act));
        f.title = 'fixed by the mod2026 sketch — these channel numbers are compile-time constants\n'+chLabelTip(cur.ch, cur.name, m.act);
        row.appendChild(f);
      }else if(!anyEditable){
        row.appendChild(el('div','asfix dim','—'));
      }else{
        const sel = document.createElement('select');
        sel.dataset.act = m.act || '';
        const o0 = document.createElement('option'); o0.value=''; o0.textContent='— not wired —';
        sel.appendChild(o0);
        opts.forEach(o=>{
          const e = document.createElement('option'); e.value = o.value; e.textContent = o.label;
          if(cur && o.value === cur.loc+':'+cur.ch) e.selected = true;
          sel.appendChild(e);
        });
        sel.disabled = !m.act;
        if(!m.act) sel.title = 'this part has no actuator — give it one on the Model tab first';
        sel.addEventListener('change',async ()=>{
          const act = m.act; if(!act) return;
          if(sel.value){
            const [loc, ch] = sel.value.split(':');
            const use = chFindUse(act, loc, +ch);
            const info = hwPins(loc);
            const occupant = info.pins[+ch] && info.pins[+ch].act;
            if(occupant && occupant !== act &&
               !await appConfirm((actAnyLabel(occupant)||occupant)+' is on that channel. Move '+(partLabel(m.name))+' there and unwire it?',
                 {title:'Channel in use', yes:'Move it', no:'Cancel', danger:true})){
              if(redraw) redraw(); else buildConfig();
              return;
            }
            // v1.39.5: confirm before touching the wiring — Cancel must be a no-op
            if(cur) chAssign(cur.loc, cur.ch, '');        // free the old channel
            if(use) chRelease(use);
            /* whatever was on this channel is displaced — the one-part-per-
               channel rule is what makes the wiring sheet trustworthy */
            chAssign(loc, +ch, act);
            lg('mae', (partLabel(m.name))+' → '+(loc==='dome'?'Dome':'Body')+' ch '+ch);
          }else{
            if(cur) chAssign(cur.loc, cur.ch, '');        // free the old channel
            lg('mae', (partLabel(m.name))+' unwired');
          }
          if(redraw) redraw(); else buildConfig();
          if(typeof buildCadPane === 'function') buildCadPane();
        });
        row.appendChild(sel);
      }

      /* colour */
      const col = document.createElement('input');
      col.type = 'color'; col.className = 'ascol';
      col.value = (typeof effectivePartHex === 'function' ? effectivePartHex(m.name) : '#ffffff') || '#ffffff';
      col.title = 'override just this part — clear it from the part card on the model';
      col.addEventListener('input',()=>setPartColor(m.name, col.value));
      row.appendChild(col);

      /* test */
      const t = el('button','b astest','▶');
      t.title = assignWillDriveHw(cur)
        ? 'drive the real servo to its open position and back, then update the model to match'
        : 'drive this part to its open position and back';
      t.disabled = !m.act;
      t.addEventListener('click',()=>{
        if(!m.act) return;
        assignTest(m.act, cur);
        selectPart(m.name);
      });
      row.appendChild(t);
      s.appendChild(row);
    });
  });

  buildAssignOtherSect(host, idx, opts, anyEditable, redraw);

  const h = el('div','note cy');
  h.innerHTML = '<b>Two naming systems, on purpose.</b> The names here are yours — straight out of the Fusion export unless you renamed them — while the channel is where the lead plugs in. '
    + 'A part can only be on one channel; picking a channel that is taken moves the other part off it. '
    + 'Click a part on the model to rename it, and print the <b>wiring sheet</b> to get both columns side by side for the bench.';
  host.appendChild(h);
  return host;
}

/* ------------------------------------------------------- OTHER (not on the model)
   Mike: "option to choose others that are not part of the model, say Other
   1 through 10" — the ten placeholders core/actuators.js registers
   (OTH_KEYS) for a servo that drives something entirely off the CAD model
   (a fire extinguisher, a custom rig, whatever else ends up on a spare
   channel). No CAD part will ever claim one, so there is no Fusion name to
   reconcile and no part to tint — a plain label instead of the rename
   field, no Colour cell, but the same driven-by dropdown and the same ▶
   test (assignTest, above) as every other row. 'a part has exactly one
   channel' still holds: assignChannelOptions()/chFindUse() know nothing
   about CAD parts, so the same displace-and-confirm dance applies whether
   the channel is currently driving a droid panel or another Other. */
function buildAssignOtherSect(host, idx, opts, anyEditable, redraw){
  if(typeof OTH_KEYS === 'undefined' || !OTH_KEYS.length) return;
  const s = sect(host, 'OTHER (not on the model)', OTH_KEYS.length+' placeholder'+(OTH_KEYS.length===1?'':'s'));
  const hdr = el('div','asrow ashdr');
  ['Name','Driven by','Test'].forEach(x=>hdr.appendChild(el('div','cn',x)));
  s.appendChild(hdr);

  OTH_KEYS.forEach((act,i)=>{
    const label = 'Other '+(i+1);
    const row = el('div','asrow');

    const nm = el('div','asfix', label);
    nm.title = 'a placeholder actuator — for a servo that drives something off the CAD model entirely (a fire extinguisher, a custom rig, …). '
      + 'No CAD part will ever claim it, so there is nothing to rename or tint here — only the channel it is wired to.';
    row.appendChild(nm);

    const cur = idx[act];
    if(cur && cur.fixed){
      const f = el('div','asfix', (cur.loc==='dome'?'Dome ':'Body ')+chLabel(cur.ch, cur.name, act));
      f.title = 'fixed by the mod2026 sketch — these channel numbers are compile-time constants\n'+chLabelTip(cur.ch, cur.name, act);
      row.appendChild(f);
    }else if(!anyEditable){
      row.appendChild(el('div','asfix dim','—'));
    }else{
      const sel = document.createElement('select');
      sel.dataset.act = act;
      const o0 = document.createElement('option'); o0.value=''; o0.textContent='— not wired —';
      sel.appendChild(o0);
      opts.forEach(o=>{
        const e = document.createElement('option'); e.value = o.value; e.textContent = o.label;
        if(cur && o.value === cur.loc+':'+cur.ch) e.selected = true;
        sel.appendChild(e);
      });
      sel.addEventListener('change',async ()=>{
        if(sel.value){
          const [loc, ch] = sel.value.split(':');
          const use = chFindUse(act, loc, +ch);
          const info = hwPins(loc);
          const occupant = info.pins[+ch] && info.pins[+ch].act;
          if(occupant && occupant !== act &&
             !await appConfirm((actAnyLabel(occupant)||occupant)+' is on that channel. Move '+label+' there and unwire it?',
               {title:'Channel in use', yes:'Move it', no:'Cancel', danger:true})){
            if(redraw) redraw(); else buildConfig();
            return;
          }
          if(cur) chAssign(cur.loc, cur.ch, '');          // free the old channel
          if(use) chRelease(use);
          chAssign(loc, +ch, act);
          lg('mae', label+' → '+(loc==='dome'?'Dome':'Body')+' ch '+ch);
        }else{
          if(cur) chAssign(cur.loc, cur.ch, '');
          lg('mae', label+' unwired');
        }
        if(redraw) redraw(); else buildConfig();
        if(typeof buildCadPane === 'function') buildCadPane();
      });
      row.appendChild(sel);
    }

    /* test — change 5's live routing applies here exactly as it does to a
       real part's row; there is simply no selectPart() to follow it with */
    const t = el('button','b astest','▶');
    t.title = assignWillDriveHw(cur)
      ? 'drive the real servo to its open position and back'
      : 'drive this channel to its open position and back';
    t.disabled = !cur;
    t.addEventListener('click',()=>assignTest(act, cur));
    row.appendChild(t);

    s.appendChild(row);
  });
}
