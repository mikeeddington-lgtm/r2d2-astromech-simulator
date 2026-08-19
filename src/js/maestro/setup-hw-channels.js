'use strict';
/* =====================================================================
   SETUP-HW CHANNELS — the "5 · channels" table, split out of setup-hw.js
   on 2026-08-15 so the wizard shell and the dial can each load without it.
   ===================================================================== */

/* --------------------------------------------------------- 5 · channels */
/* ------------------------------------------------- which part (v1.39.2)
   Mike: "ok where do I assign servos to panels?" It was a fair question with
   an unfair answer — the setup wizard's Panels step, the Wiring step's board
   cards, or clicking the part on the 3D droid. All three are real and none of
   them is HERE, on the screen where you tick a pin, name it and drive it with
   the dial. Naming a channel "Pie 3" and telling the app it moves Pie 3 are
   the same thought; splitting them across two overlays is why the mapping
   gets forgotten until a sequence moves the wrong flap.

   The column only exists when the host HAS parts — PCA Studio does not, and
   must not grow an empty dropdown for a droid it has never heard of. */
function setupParts(){
  return (typeof HW !== 'undefined' && HW.parts) ? (HW.parts() || []) : [];
}
function setupPartCell(i, c, on){
  const list = setupParts();
  if(!list.length) return '';
  const cur = (c && c.act) || '';
  /* who else claims this part, so the dropdown can say so rather than
     silently stealing it on change */
  const owner = {};
  HW.channels().forEach((x,n)=>{ if(x && x.act) owner[x.act] = n; });
  const esc = s => String(s).replace(/</g,'&lt;').replace(/"/g,'&quot;');
  /* Mike: "why do multiple say pie 5" — the CAD name (four of the six inner
     pies are all literally "Pie5" in the Fusion export) rides in the
     option's tooltip now, not appended to the label. */
  const opt = p=>{
    const taken = (owner[p.act] !== undefined && owner[p.act] !== i);
    const title = p.cad ? ' title="'+esc(p.cad)+'"' : '';
    return '<option value="'+p.act+'"'+(cur===p.act?' selected':'')+title+'>'
       + esc(p.label) + (taken ? '  (ch '+owner[p.act]+')' : '') + '</option>';
  };
  let o = '<option value="">— not mapped —</option>';
  const model = list.filter(p=>!p.other), other = list.filter(p=>p.other);
  o += model.map(opt).join('');
  /* v1.40.0 — Mike: "option to choose others that are not part of the
     model, say Other 1 through 10". They group apart under their own
     optgroup (chPartOptions' `other` flag) rather than sorting into the
     droid's own parts. */
  if(other.length) o += '<optgroup label="Not on the model">'+other.map(opt).join('')+'</optgroup>';
  return '<td><select data-k="part"'+(on?'':' disabled')
    + ' title="the panel this channel moves. Picking one that another channel already has moves it here — a part has exactly one channel.">'
    + o + '</select></td>';
}
/* ============================================ THE LIST, AND THE PANEL
   v1.50.0. Mike, 2026-08-19: *"I think it's too complicated a view. What we
   should have is a simple view that when you select a servo or a channel,
   it uses the configuration panel, which should always be visible… And then
   the view at the top is simply a case of a test button, so it opens and
   closes, and the ability to rename and define what it drives."*

   He is right, and the shape of the old screen says why it happened. Every
   setting a channel has was a COLUMN, sixteen of them, on a table that
   scrolled sideways — so the six identity columns had to be pinned, the
   pinning offsets had to be measured after every render, and the thing you
   most wanted (`configure…`) had spent a release clipped to "co…" off the
   right-hand edge. Each fix was reasonable; the sum of them was a
   spreadsheet you had to drive.

   The split is the fix. A channel has two kinds of question about it:

     WHICH ONE IS THIS?   in use, its number, its name, what it drives —
                          and does it move when I press this? That is a
                          list, it is the same four answers for every row,
                          and it fits without scrolling sideways.

     HOW IS IT SET UP?    ends, centre, direction, boot, speed,
                          acceleration, ease, sleep. That is a FORM about
                          ONE channel, and a form does not belong in a
                          table cell.

   So the second kind moves into a panel that is always on screen and
   follows whatever is selected. Always visible, not a popup: Mike asked for
   that specifically, and it is the difference between "configure this
   channel" being a place you go and a place you are.

   THREE THINGS THE WORD "SELECTED" COULD MEAN, and this screen needs all
   three, so they are kept visibly apart:
     · `use`      — is anything plugged into this pin. A property of the droid.
     · the TICK   — which channels a bulk change will touch. Many at once,
                    and the button says the number out loud.
     · the ROW    — which one the panel below is showing. Exactly one.
   Clicking anywhere on a row selects it for the panel; the tick is its own
   column and changes nothing else. */

/* The identity list. Seven columns, no horizontal scroll, no pinning —
   the pinned-column machinery went with the sixteen-column table it
   existed to rescue. */
function setupChCols(){
  return [
    {th:x=>'<th><input type="checkbox" data-k="pickall"'+(x.picked && x.picked===x.usable?' checked':'')
        + ' title="tick every channel in use, so a setting can be applied to all of them at once"></th>',
     td:r=>'<td>'+(r.on?'<input type="checkbox" data-k="pick"'+(r.chosen?' checked':'')
        + ' title="include this channel when you apply a setting to all selected">':'')+'</td>'},
    {th:()=>'<th title="the channel number every sequence, export and serial frame uses">#</th>',
     td:r=>'<td class="pin">'+r.i+'</td>'},
    {th:()=>'<th title="which PCA9685 and which of its sixteen outputs — the thing you count along the header to find">board·pin</th>',
     td:r=>'<td class="pin">'+(r.i>>4)+'·'+(r.i&15)+'</td>'},
    {th:()=>'<th title="is anything plugged into this pin?">use</th>',
     td:r=>'<td><input type="checkbox" data-k="use"'+(r.on?' checked':'')+' title="is anything plugged into this pin?"></td>'},
    {th:()=>'<th>name</th>',
     td:r=>'<td><input type="text" data-k="name" value="'+(r.c?String(r.c.name).replace(/"/g,'&quot;'):'')
        + '" placeholder="not used"'+(r.on?'':' disabled')+'></td>'},
    /* `drives` is a SIM idea (HW.parts()) — PCA Studio has no droid and must
       not grow an empty dropdown for one. Absent means absent, header and
       cell together, which is the only way the pairing survives. */
    {when:()=>!!setupParts().length,
     th:()=>'<th title="which panel, door or arm this channel actually moves on the droid">drives</th>',
     td:r=>setupPartCell(r.i, r.c, r.on)},
    {th:()=>'<th title="drive this channel to its open end and back, so you can see which one it is">test</th>',
     td:r=>'<td>'+(r.on
        ? '<button class="mini chtest" data-k="test" data-ch="'+r.i+'" title="'+setupTestTip(r.c)+'">'
          + setupTestWord(r.c)+'</button>'
        : '')+'</td>'}
  ].filter(c=>!c.when || c.when());
}

/* ------------------------------------------------------------- the test
   ONE button that opens and closes, because that is the question a builder
   is actually asking of a channel they cannot identify: *does this one move
   the flap I am looking at?*

   Which end is which comes from the DIRECTED pair — `min` is the shut end
   and `max` the open one, whichever is numerically larger (the travel rule,
   v1.46.0). The old min/mid/max buttons deliberately sorted the pair so
   "min" went to the smaller number; this one must not, or a reversed
   channel would open when the button says shut. Those three buttons are
   still here, in the panel, under their own honest labels.

   Stateless on purpose: where the channel IS decides what the button says
   next, so the label cannot drift out of step with a servo something else
   moved (a sequence, the dial, `all home`). */
function setupTestOpen(c){
  if(!c) return false;
  const E = (typeof HW !== 'undefined' && HW.engine) ? HW.engine() : null;
  const st = E && E.st && E.st[c.i];
  if(!st || !st.active) return false;                 // limp counts as shut
  /* the TARGET, not where it has got to. Press open on a slow panel and the
     button has to say "shut" straight away, or the second press repeats the
     first — a servo mid-travel is already going somewhere and that is the
     thing the next press should undo. */
  const q = st.target || 0;
  if(!q) return false;
  return Math.abs(q - c.max) < Math.abs(q - c.min);
}
function setupTestWord(c){ return setupTestOpen(c) ? 'shut' : 'open'; }
function setupTestTip(c){
  return setupTestOpen(c)
    ? 'send it back to its shut end (' + ((c.min/4)|0) + ' µs)'
    : 'drive it to its open end (' + ((c.max/4)|0) + ' µs) so you can see which panel this is';
}
/* refreshes the word on every test button without rebuilding anything —
   called from the same clock the position bars run on */
function setupTestSync(){
  const list = document.querySelectorAll('#setBody .chtest[data-ch]');
  for(let k=0;k<list.length;k++){
    const b = list[k], c = HW.channels()[+b.dataset.ch];
    if(!c) continue;
    const w = setupTestWord(c);
    if(b.textContent !== w){ b.textContent = w; b.title = setupTestTip(c); }
  }
}

/* ============================================================ THE PANEL
   Always on screen, always about ONE channel, and it is where every
   setting that used to be a column now lives. */
function setupChPanel(){
  const chans = HW.channels();
  const n = setupChannels();
  const i = SETUP.sel;
  const c = (i >= 0 && i < n) ? chans[i] : null;
  const on = !!(c && /^servo/i.test(c.mode||''));

  /* the picker: every channel, so the panel can be driven from the panel
     itself — a list of twenty-four rows is a long way to reach for the one
     you were just looking at */
  const esc = s2=>String(s2==null?'':s2).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  let opts = '';
  for(let k=0;k<n;k++){
    const x = chans[k];
    const live = !!(x && /^servo/i.test(x.mode||''));
    opts += '<option value="'+k+'"'+(k===i?' selected':'')+'>'
      + k + ' · ' + (k>>4) + '·' + (k&15) + ' — '
      + (live ? esc(x.name || ('Channel '+k)) : 'not in use')
      + '</option>';
  }

  const head = '<div class="chcfghead"><b>Configure</b>'
    + '<select id="chPick" title="which channel this panel is about">'+opts+'</select>'
    + '<span class="sp" style="flex:1"></span>'
    + (on ? '<span class="stat">the dial below drives this one</span>' : '')
    + '</div>';

  if(!on){
    return '<div class="chcfg" id="chCfg">' + head
      + '<div class="setnote">'
      + (c ? '<b>Channel '+i+' is not in use.</b> Tick its <b>use</b> box in the list above and its settings appear here.'
           : '<b>No channel selected.</b> Click a row in the list above — everything about that channel is set here.')
      + '</div></div>';
  }

  /* WHILE THE DIAL IS OPEN, THESE THREE NUMBERS ARE THE DIAL'S (v1.51.0).
     setupCalOpen() widens the channel to the 1000–2000 µs working range so
     the dial can reach past its own endpoints, so reading c.min/c.max here
     would show the working range and not the builder's travel — two
     controls on one screen disagreeing about the same servo. One set of
     numbers, two ways to set it: type here or turn the dial, and `save
     servo setting` is what puts them on the channel. */
  const cal = (SETUP.cal && SETUP.cal.ch === i) ? SETUP.cal : null;
  const vMin  = cal ? cal.min  : c.min;
  const vMax  = cal ? cal.max  : c.max;
  const vHome = cal ? cal.home : c.home;

  const q = v => ((v||0)/4).toFixed(0);
  const pw = (k, lab, val, tip) =>
    '<label class="chf" title="'+tip+'"><span>'+lab+'</span>'
    + '<input type="number" data-k="'+k+'" data-ch="'+i+'" value="'+q(val)+'" min="300" max="2700" step="1"'
    + ' class="'+pwClass(val)+'" title="'+pwTitle(val)+'"><em>µs</em></label>';
  const num = (k, lab, val, min, max, tip) =>
    '<label class="chf" title="'+tip+'"><span>'+lab+'</span>'
    + '<input type="number" data-k="'+k+'" data-ch="'+i+'" value="'+(val|0)+'" min="'+min+'" max="'+max+'"></label>';
  const tick = (k, lab, checked, tip) =>
    '<label class="chf chk" title="'+tip+'"><input type="checkbox" data-k="'+k+'" data-ch="'+i+'"'
    + (checked?' checked':'')+'><span>'+lab+'</span></label>';

  const lo = Math.min(vMin,vMax), hi = Math.max(vMin,vMax);
  return '<div class="chcfg" id="chCfg">' + head
    + '<div class="chcfgwho"><b>'+esc(c.name || ('Channel '+i))+'</b>'
    + '<span class="stat">channel '+i+' · board '+(i>>4)+' pin '+(i&15)+'</span></div>'

    + '<h4>Travel</h4><div class="chcfgrow">'
    + pw('minUs', 'shut',   vMin,  'the pulse width at the shut end of the travel')
    + pw('ctrUs', 'centre', vHome, 'the pulse width it rests at — and goes to at power-up when boot is ticked')
    + pw('maxUs', 'open',   vMax,  'the pulse width at the open end of the travel')
    + tick('rev', 'reversed', vMin > vMax,
        'the linkage runs the other way — ticking swaps this channel’s two ends, unticking puts them back')
    + tick('boot', 'go to centre at power-up', !/off|ignore/i.test(c.homemode||''),
        'at power-up, drive to the centre above. Unticked = no pulses at all, so the servo is limp and a panel does not buzz.')
    + '</div>'

    + '<h4>Motion</h4><div class="chcfgrow">'
    + num('speed', 'speed', c.speed, 0, 16000,
        'the Maestro’s units — 0.25 µs per 10 ms. 0 means unlimited, which on a panel means it slams.')
    + num('acceleration', 'acceleration', c.acceleration, 0, 255,
        'the Maestro’s units — per 80 ms. 0 means unlimited.')
    + '<label class="chf" title="'+EASE_TIP+'"><span>ease</span><select data-k="ease" data-ch="'+i+'">'
    + EASE_KINDS.map(x=>'<option value="'+x.id+'"'+(((c.ease||'none')===x.id)?' selected':'')
        + ' title="'+x.hint+'">'+x.id+'</option>').join('')
    + '</select></label>'
    + '<label class="chf chk" title="stop pulsing once it has settled — silent, cool, no current">'
    + '<input type="checkbox" data-k="sleep" data-ch="'+i+'"'+(c.releaseMs?' checked':'')+'>'
    + '<span>sleep when idle after</span>'
    + '<input type="number" data-k="sleepMs" data-ch="'+i+'" value="'+(c.releaseMs||1200)+'"'
    + ' min="100" max="60000" step="100"'+(c.releaseMs?'':' disabled')+'><em>ms</em></label>'
    + '</div>'

    /* the live half. Same engine, same wire, same arithmetic the
       co-processor runs — and NOTHING here is saved: where a servo happens
       to be standing is not a setting. */
    + '<h4>Move it now</h4><div class="chcfgrow chdrive">'
    + '<input type="range" data-k="slide" data-ch="'+i+'" min="'+lo+'" max="'+hi+'" value="'+(c.home||lo)+'" step="1"'
    + ' title="drag to move this servo now — through the engine, so its speed, acceleration and your endpoints all apply">'
    + '<div class="poswrap" id="spw'+i+'"><div class="postick" id="spt'+i+'"></div><div class="posbar" id="spb'+i+'"></div></div>'
    + '<span class="us" id="sus'+i+'"></span>'
    + '<span class="sp" style="flex:1"></span>'
    + '<button class="mini" data-k="soff" data-ch="'+i+'" title="stop pulses — this channel goes limp">off</button> '
    + '<button class="mini" data-k="slo"  data-ch="'+i+'">min</button> '
    + '<button class="mini" data-k="smid" data-ch="'+i+'">mid</button> '
    + '<button class="mini" data-k="shi"  data-ch="'+i+'">max</button>'
    + '</div></div>';
}

/* the moving parts of the live half — bar, target tick, µs readout. Called
   from whatever clock the host runs (hwTableSync, hw-table.js), so it never
   rebuilds the DOM: a slider stays under the pointer while it is dragged. */
function setupLiveSync(){
  if(typeof SETUP === 'undefined' || !SETUP.open) return;
  const step = SETUP_STEPS[SETUP.step];
  if(!step || step.key !== 'channels') return;
  const E = HW.engine(); if(!E) return;
  const n = setupChannels();
  for(let i=0;i<n;i++){
    const wrap = document.getElementById('spw'+i); if(!wrap) continue;
    const c = HW.channels()[i], s = E.st[i];
    if(!c || !s) continue;
    const bar = document.getElementById('spb'+i), tick = document.getElementById('spt'+i),
          usEl = document.getElementById('sus'+i);
    const lo = Math.min(c.min,c.max), hi = Math.max(c.min,c.max);
    const span = (hi - lo) || 1;
    const q = pcaPos(E, i);
    wrap.classList.toggle('posoff', !s.active);
    if(bar)  bar.style.width = s.active ? ((q-lo)/span*100).toFixed(1)+'%' : '0%';
    if(tick){ tick.style.left = s.active ? ((s.target-lo)/span*100).toFixed(1)+'%' : '0%';
              tick.style.display = s.active ? 'block' : 'none'; }
    if(usEl) usEl.textContent = q ? (q/4).toFixed(0)+' µs' : '— off';
  }
  setupTestSync();          // "open" / "shut" follows where the servo IS
}

/* ================================================== THE DOME, ON THE BENCH
   v1.45.0. Mike: "Add dome-view panel selection for servo-channel
   assignments" and "Add the dome map to Servo Setup as well as Panels."

   The same diagram the build wizard's Panels step and the .mstr import
   wizard's Map step already draw (dome-map.js), bound to the LIVE channel
   table. "P11" means nothing until you can see where P11 is, and the
   `drives` dropdown is forty options long — so clicking the panel is the
   honest gesture and the dropdown stays for the body parts a dome drawing
   cannot show.

   buildDomeMap is deliberately caller-owns-the-write: it never touches a
   channel, so the write below is HW.setPart, which is the one place the
   one-part-one-channel rule lives.

   GUARDED like the `drives` column, and for the same reason: PCA Studio
   loads this file but NOT dome-map.js, has no droid, no CAD and no parts.
   A host that cannot answer "which panels are there" is not a host with no
   panels; it is a host the question does not apply to. */
function setupDomeReady(){
  return typeof buildDomeMap === 'function' && typeof domeMapCovers === 'function'
      && !!setupParts().length && !!(typeof HW !== 'undefined' && HW.setPart);
}
/* the next servo channel nothing is mapped to, wrapping — so placing a
   whole dome is click, click, click without going back to the table */
function setupDomeNext(from){
  const ch = HW.channels(), n = ch.length;
  for(let k=1;k<=n;k++){
    const i = (Math.max(-1,from)+k+n) % n;
    const c = ch[i];
    if(c && /^servo/i.test(c.mode||'') && !c.act) return i;
  }
  return -1;
}
/* how far the drawing is turned, in degrees clockwise. Kept in PREFS
   because a builder's bench does not move between sessions and neither
   should the map: having to re-orient it every time you open it is the
   same tax as not being able to orient it at all. Guarded, because PCA
   Studio loads this file and has no PREFS and no dome. */
function setupDomeRot(){
  if(SETUP.dome && SETUP.dome.rot !== undefined) return SETUP.dome.rot;
  return (typeof PREFS !== 'undefined' && +PREFS.domeRot) || 0;
}
function setupDomeSetRot(deg){
  const d = ((Math.round(+deg||0) % 360) + 360) % 360;
  if(SETUP.dome) SETUP.dome.rot = d;
  if(typeof PREFS !== 'undefined'){
    PREFS.domeRot = d;
    if(typeof prefsSave === 'function') prefsSave();
  }
}
function setupDomeOpen(){
  if(!setupDomeReady()) return;
  SETUP.dome = {open:true, hover:'', rot: setupDomeRot()};
  const cur = HW.channels()[SETUP.sel];
  /* start on something worth placing: the selected row if it is a servo
     that still has no part, otherwise the next one that has none */
  if(!(cur && /^servo/i.test(cur.mode||'') && !cur.act)){
    const next = setupDomeNext(-1);
    if(next >= 0) SETUP.sel = next;
  }
  setupRender();
}
function setupDomeClose(){ SETUP.dome = null; setupRender(); }

/* The DIAGRAM's own name for a part — PP1, P7, HP2 pan. The list beside the
   drawing has to speak the drawing's language: the CAD mesh behind panel P1
   is called "Panel13", so a table saying "Panel13" beside a picture saying
   "P1" gives one flap three names and makes the reader do the join. The
   dropdown's own label rides along after it, so the row still matches the
   `drives` column. */
function setupDomeLabel(key){
  let m = /^pie(\d+)$/.exec(key);       if(m) return 'PP' + (+m[1] + 1);
  m = /^panel(\d+)$/.exec(key);         if(m) return 'P'  + (+m[1] + 1);
  m = /^hp(\d+)(Pan|Tilt)$/.exec(key);  if(m) return 'HP' + m[1] + ' ' + m[2].toLowerCase();
  return key;
}

/* what the dropdown says, said on the diagram: who claims what, and which
   channels the drawing cannot place at all */
function setupDomeRender(){
  const host = $('domeWrap'); if(!host) return;
  if(!(SETUP.dome && SETUP.dome.open) || !setupDomeReady()){ host.innerHTML = ''; return; }
  const chans = HW.channels();
  /* the DROPDOWN's word for a part, so the two surfaces agree. Empty when
     nobody has a better word than the key itself — the diagram already
     labels that panel (setupDomeLabel), and "PP6 pie5" is a raw key printed
     twice rather than information. */
  const label = k=>{
    const p = setupParts().find(x=>x.act===k);
    if(p) return p.label;
    const a = (typeof actPartLabel === 'function') ? actPartLabel(k) : '';
    return (a && a !== k) ? a : '';
  };
  const esc = s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const selC = (SETUP.sel >= 0 && chans[SETUP.sel] && /^servo/i.test(chans[SETUP.sel].mode||''))
             ? chans[SETUP.sel] : null;
  const servos = chans.filter(c=>c && /^servo/i.test(c.mode||''));
  const placed = servos.filter(c=>c.act && domeMapCovers(c.act));
  /* the parts the diagram DOES draw, and who has them — the "(ch 7)" the
     dropdown puts beside a taken option, as a list you can read at once */
  const claimed = domeMapKeys().map(k=>({k, own:chans.filter(c=>c && c.act===k && /^servo/i.test(c.mode||''))}))
                               .filter(x=>x.own.length);
  /* and the ones it cannot: a dataport door is a real mapping and a real
     servo, it is just not on the dome. Saying so is the difference between
     "the map is incomplete" and "the map is lying". */
  const strays = servos.filter(c=>c.act && !domeMapCovers(c.act));
  const unmapped = servos.filter(c=>!c.act).length;

  host.innerHTML = '<div class="dompanel">'
    + '<div class="calhead"><b>Dome map</b>'
    + '<span class="stat">click a channel’s <b>row</b> in the list, then click its panel here</span>'
    + '<span class="sp" style="flex:1"></span>'
    /* turn the drawing to match the dome in front of you (v1.50.0) */
    + '<label class="domrot" title="turn the drawing so it matches how you are looking at your dome. '
    + 'The FRONT marker turns with it; the labels stay upright.">rotate '
    + '<input type="range" id="domeRot" min="0" max="359" step="1" value="'+setupDomeRot()+'">'
    + '<b id="domeRotN">'+setupDomeRot()+'°</b></label>'
    + '<button class="mini" data-dome="0" title="put the drawing back with the droid’s front at the bottom">reset</button>'
    + '<button class="mini" data-dome="next" title="jump to the next channel that has no part yet">next unmapped</button>'
    + '<button class="mini" data-dome="close" title="close the map — the bench stays where it is">close</button>'
    + '</div>'
    + '<div class="dombody iwsplit">'
    + '<div class="iwdome"><div class="iwcue">'
    + (selC
        ? 'Placing <b>ch '+selC.i+' · '+esc(selC.name||'')+'</b> — click its panel.'
          + (selC.act ? ' It already drives <b>'+esc(label(selC.act) || setupDomeLabel(selC.act))+'</b>; clicking moves it.' : '')
        : 'No channel selected. Click a channel’s <b>row</b> in the list, or press <b>next unmapped</b>.')
    + '</div><div id="domeSvg"></div>'
    + '<div class="iwkey"><span class="k has"></span>mapped <span class="k dup"></span>two channels'
    + ' <span class="k lit"></span>lighting on the reference <span class="k"></span>free</div></div>'
    + '<div class="iwchans">'
    + '<div class="iwtally"><b>'+placed.length+'</b> of '+servos.length+' servo channel'
    + (servos.length===1?'':'s')+' placed on the dome'
    + (unmapped ? ' · <b>'+unmapped+'</b> with no part at all' : '')+'.</div>'
    + (claimed.length
        ? '<table class="settab domtab"><tr><th>part</th><th>channel</th></tr>'
          + claimed.map(x=>'<tr'+(x.own.length>1?' class="dup"':'')+'><td><b>'+esc(setupDomeLabel(x.k))
              + '</b> '+esc(label(x.k))+'</td><td>'
              + x.own.map(c=>'ch '+c.i+' ('+esc(c.name||'')+')').join(', ')
              + (x.own.length>1 ? ' — two channels on one part' : '')+'</td></tr>').join('')
          + '</table>'
        : '<div class="setnote">Nothing on the dome is mapped yet. Every panel below is free.</div>')
    + (strays.length
        ? '<div class="setnote warn"><b>'+strays.length+' channel'+(strays.length===1?'':'s')
          + ' this diagram cannot place</b> — '
          + strays.map(c=>'ch '+c.i+' → '+esc(label(c.act) || c.act)).join(', ')
          + '. They are mapped and they work; they are just not on the dome. Use the <b>drives</b> column for those.</div>'
        : '')
    + '</div></div></div>';

  buildDomeMap($('domeSvg'), {
    channels: chans,
    selected: SETUP.sel,
    hoverKey: SETUP.dome.hover,
    rotate: setupDomeRot(),
    onPick: pickPart
  });
  function pickPart(key){
    if(!selC){ HW.say('select a channel first — click its row in the list','warn'); return; }
    HW.setPart(selC.i, key);
    setupTouched();
    HW.say('channel '+selC.i+' drives '+(label(key) || setupDomeLabel(key))+' — placed on the dome map');
    /* HW.setPart clears the part off whatever channel had it, so the
       re-render is not cosmetic: another row's dropdown just changed */
    SETUP.sel = setupDomeNext(selC.i);
    setupRender();
  }

  /* the slider redraws the MAP only — never setupRender(), or the input
     would be rebuilt under the thumb and the drag would end on the first
     pixel. Same lesson the calibration dial learned in v0.7.1. */
  const rot = $('domeRot');
  if(rot) rot.oninput = e=>{
    setupDomeSetRot(e.target.value);
    const n = $('domeRotN'); if(n) n.textContent = setupDomeRot()+'°';
    const svgHost = $('domeSvg');
    if(svgHost){ svgHost.innerHTML = ''; buildDomeMap(svgHost, {
      channels: HW.channels(), selected: SETUP.sel, hoverKey: SETUP.dome.hover,
      rotate: setupDomeRot(), onPick: pickPart });
    }
  };

  host.onclick = e=>{
    const b = e.target.closest('[data-dome]'); if(!b) return;
    if(b.dataset.dome === 'close'){ setupDomeClose(); return; }
    if(b.dataset.dome === '0'){ setupDomeSetRot(0); setupDomeRender(); return; }
    if(b.dataset.dome === 'next'){ const i = setupDomeNext(SETUP.sel); if(i>=0){ SETUP.sel = i; setupRender(); } }
  };
}

function setupStepChannels(){
  const n = setupChannels();
  const pick = SETUP.pick || (SETUP.pick = []);
  const cols = setupChCols();
  let rows = '', usable = 0, picked = 0;
  for(let i=0;i<n;i++){
    const c = HW.channels()[i];
    const on = !!(c && /^servo/i.test(c.mode));
    const sel = (i === SETUP.sel);
    const chosen = on && pick.indexOf(i) >= 0;
    if(on){ usable++; if(chosen) picked++; }
    const r = {i, c, on, sel, chosen,
               rev: on && c.min > c.max,
               boot: on && !/off|ignore/i.test(c.homemode)};
    rows += '<tr data-ch="'+i+'" class="'+(on?'on':'off')+(sel?' sel':'')+'">'
      + cols.map(col=>col.td(r)).join('')
      + '</tr>';
  }
  const audit = pwAudit();
  const chn = n=>n+' channel'+(n===1?'':'s');
  const flag = (audit.bad.length ? '<span class="pwflag bad">'+chn(audit.bad.length)+' outside 500–2500 µs</span>' : '')
             + (audit.warn.length ? '<span class="pwflag warn">'+chn(audit.warn.length)+' outside 1000–2000 µs</span>' : '');

  const f = setupApplyDef(SETUP.apField || 'speed');
  const val = (SETUP.apVal === undefined || SETUP.apField !== f.k) ? f.def : SETUP.apVal;
  const control = f.type === 'sel'
    ? '<select id="apVal"'+(f.tip?' title="'+f.tip+'"':'')+'>'+f.opts.map(o=>'<option'+(o===val?' selected':'')+'>'+o+'</option>').join('')+'</select>'
    : '<input type="number" id="apVal" value="'+val+'" min="'+f.min+'" max="'+f.max+'" step="'+f.step+'">';

  return '<h3>Which channels are in use, and what are they?</h3>'
    + setupLinkBar()
    /* the sim's fuller link row — the rate, the serial monitor and the
       fixed element ids serial-link.js binds — rendered by hw-ui.js into
       here. Studio's page carries those ids itself, so it must NOT get a
       second copy of them: no hwLinkRender, no host div (v1.45.0). */
    + (typeof hwLinkRender === 'function' ? '<div id="hwLink"></div>' : '')
    /* THE TABLE IS THE POINT OF THE SCREEN (v1.45.0)
       Everything below used to be four paragraphs of standing prose, and on a
       laptop that left three channel rows visible under it: you arrived at the
       screen whose whole job is a table and had to scroll to find the table.
       Mike's standing brief is simple by default with the detail one
       deliberate click away, so the one sentence that says what to DO stays,
       and the reference — what centre and boot mean, the Maestro's units, the
       live half, what each ease does — folds into a disclosure. Collapsed, not
       removed: the words were right, they were just always on. */
    + '<p class="setp">Tick a pin, name it and give it a part to drive. Press <b>test</b> to make that '
    + 'panel move, so you can see which one it is. Everything else about a channel — its ends, its centre, '
    + 'its speed — is in the <b>Configure</b> panel below, which follows whichever row you click.</p>'
    + '<details class="setwhat"><summary>what the other columns mean</summary>'
    + '<p class="setp"><b>Centre</b> is also where the channel goes at power-up, if <b>boot</b> is ticked; unticked it stays limp. '
    + 'Speed and acceleration are the Maestro’s units: speed in 0.25 µs per 10 ms, acceleration per 80 ms, '
    + 'and <b>0 means unlimited</b>, which on a panel means it slams. '
    + 'In the panel’s <b>Move it now</b> row, drag the slider and the <b>position</b> bar shows where that '
    + 'servo actually is — the engine’s model of the board with nothing plugged in, the servo itself once '
    + 'something is.</p>'
    + '<p class="setp"><b>Ease</b> is the shape of a move, not its speed. '
    + '<b>none</b> is the plain one — get up to speed, hold it, stop dead on the number. '
    + '<b>soft</b> brings the acceleration itself in over the first 80 ms, so the part breathes into motion '
    + 'instead of jerking off the mark; kindest to a long linkage or a heavy panel. '
    + '<b>overshoot</b> deliberately aims about a twelfth of the way past the target and settles back, '
    + 'which is what makes a pie panel read as <i>snapping</i> open rather than arriving. It only does it on '
    + 'moves worth more than an eighth of the channel’s travel, and never past your endpoints — so a brick '
    + 'that already drives to MIN or MAX looks identical to <b>none</b>.</p></details>'
    + '<div class="setrow"><button class="mini" data-act="allon">tick all</button>'
    + '<button class="mini" data-act="alloff">untick all</button>'
    + '<span class="stat" id="setChCount"></span>'
    + flag + '</div>'
    /* the row that moves hardware, kept away from the row that ticks boxes.
       Both buttons came off the old #hwWrap bar (v1.45.0) — nothing that
       could drive a real servo was allowed to disappear with it. */
    + '<div class="setrow drvrow">'
    + (setupDomeReady()
        ? '<button class="mini'+((SETUP.dome && SETUP.dome.open)?' prim':'')+'" data-act="dome"'
          + ' title="place channels on a top-down drawing of the dome instead of hunting the drives dropdown">'
          + '🗺 dome map…</button>'
        : '')
    + '<span class="sp" style="flex:1"></span>'
    + '<button class="mini" data-act="drvhome" title="drive every channel in use to its centre">all home</button>'
    + '<button class="mini danger" data-act="drvoff" title="stop pulsing every channel — everything goes limp">all off</button>'
    + '</div>'
    + '<div class="setscroll"><table class="settab chtab">'
    + '<tr>' + cols.map(col=>col.th({picked, usable})).join('') + '</tr>'
    + rows + '</table></div>'
    + '<div class="setrow applybar">'
    + '<span class="stat">Apply</span><select id="apField">'
    + SETUP_APPLY.map(x=>'<option value="'+x.k+'"'+(x.k===f.k?' selected':'')+'>'+x.label+'</option>').join('')
    + '</select><span class="stat">=</span>'+control
    /* NOT data-act="apply" — that is the wizard's own "Build my project"
       action on #setupWrap, and this click bubbles all the way up to it.
       Sharing the name closed the whole wizard instead. */
    /* Mike: "instead of saying apply, it should say apply setting to all
       selected — so it's really clear what that setting does." The count
       rides in the label rather than in a sentence beside it, because the
       number IS the warning. */
    + '<button class="mini" data-act="applysel"'+(picked?'':' disabled')+'>apply this setting to all '
    + picked + ' selected…</button>'
    + '<span class="stat">'+(picked ? '' : 'tick the left-hand column to choose which channels')+'</span>'
    + '</div>'
    + setupAskHtml('table')
    + setupChPanel()
    + '<div id="calWrap"></div>'
    + '<div id="domeWrap"></div>';
}

function setupBindSimple(){
  const body = $('setBody');
  body.oninput = e=>{
    const f = e.target.dataset.f; if(!f) return;
    SETUP.hw[f] = (e.target.type === 'number') ? (+e.target.value|0) : e.target.value;
    if(f === 'boards') SETUP.hw.boards = Math.max(1, Math.min(8, SETUP.hw.boards));
    /* the ESP32 sketch exists only for the ESP32, and vice versa — moving
       between boards must not leave a choice that cannot be flashed */
    if(f === 'mcu'){
      if(SETUP.hw.mcu === 'esp32' && SETUP.hw.sketch === 'coproc') SETUP.hw.sketch = 'esp32';
      if(SETUP.hw.mcu !== 'esp32' && SETUP.hw.sketch === 'esp32')  SETUP.hw.sketch = 'coproc';
    }
    /* v1.39.5: never rebuild the input under the caret — the Channels step's
       rule (v0.7.1), applied here. A number field (board count, Advanced's
       pulse frequency, …) bands the model as you type but only redraws on
       change, or typing "16" stores 1 and drops focus after the first digit.
       Selects and radios have no caret to lose, so they still redraw right
       away — which is what keeps the mcu → sketch swap above instant. */
    if(e.target.type !== 'number') setupRender();
  };
  body.onchange = e=>{
    if(e.target.dataset.f && e.target.type === 'number') setupRender();
  };
  body.onclick = e=>{
    const b = e.target.closest('button'); if(!b) return;
    if(b.dataset.act === 'expcfg'){
      /* the same file the Finish prompt offers, written by the same
         function — see setupStepExports() */
      if(typeof servoCfgExport === 'function'){
        const f = servoCfgExport();
        HW.say('servo config exported — '+f+'. Names and travel, nothing else; import it into any build.');
      }
      return;
    }
    if(b.dataset.act === 'impcfg'){
      if(typeof servoCfgPick === 'function') servoCfgPick(()=>{ setupTouched(); setupRender(); });
      return;
    }
    /* v1.45.0: setupDownload, not a bare download() — that helper exists
       only in PCA Studio, so in the sim these two buttons threw
       ReferenceError the moment Mike pressed them. And the names carry the
       moment they were written, because four files called servos.h in one
       Downloads folder is four files you have to open to tell apart. */
    if(b.dataset.act === 'expjson'){
      const f = setupFileName('servo-setup','json');
      setupDownload(f, setupJson(), 'application/json');
      HW.say('setup exported — '+f+': boards, wiring answers and every channel'); return;
    }
    if(b.dataset.act === 'exph'){
      const f = setupFileName('servos','h');
      setupDownload(f, setupServosH(), 'text/x-c');
      HW.say(f+' exported — the channel table alone. Endpoints are yours; regenerate it whenever you recalibrate, not when you change a sequence.','warn');
      return;
    }
    if(b.dataset.act === 'copycfg'){
      const t = $('setBody').querySelector('.setpre').textContent;
      navigator.clipboard.writeText(t).then(()=>HW.say('sketch config copied'),()=>HW.say('clipboard blocked — select the text','warn'));
    }
  };
}

/* --------------------------------------------------- the channel table */
function setupBlank(){
  return {name:'', mode:'Input', min:4000, max:8000, home:0, homemode:'Off',
          speed:0, acceleration:0, releaseMs:0, ease:'none'};
}
/* Fills HOLES as well as extending. Setting `channels.length = 32` on a
   shorter array leaves sparse slots, and a hole is invisible until it is
   saved: JSON.stringify writes `null`, and unlike a hole a null is NOT
   skipped by forEach or filter. That is the whole of the "setup worked the
   first time and not the second" bug — it only appeared after a reload. */
/* HW.ensure() fills 0..i, never just i — a hole in a channel array is
   invisible until something walks it, and pcaCreate over a sparse list
   makes a sparse engine (HANDOVER §Traps) */
function setupEnsure(i){
  const before = HW.channels().length;
  const c = HW.ensure(i);
  if(HW.channels().length !== before) setupSync();
  return c;
}
/* every slot a real object, in one pass — cheaper and safer than 32 calls
   to setupEnsure, each of which would rebuild the engine */
function setupFill(n){
  const before = HW.channels().length;
  if(n > 0) HW.ensure(n-1);
  HW.trim(n);
  if(HW.channels().length !== before) setupSync();
}
/* Adding a channel changes E.channels' LENGTH — and E.st is sized once, at
   pcaCreate. Rebuild rather than leave the two disagreeing; pcaseq guards
   the gap as well, but a guard is a seatbelt, not a plan. */
function setupSync(){ HW.rebuild(true); }
function setupUse(i, on){
  const c = setupEnsure(i);
  if(on){
    /* Mike, 2026-08-14: "boot should not be auto ticked just because it's
       setup" — ticking USE turns a pin into a servo, nothing more. Boot
       (drive to centre at power-up) is a separate, explicit opt-in, so a
       channel that was NOT already in use starts limp: homemode 'Off'.
       A channel that was already a servo (re-ticking after an untick, or
       one an import already configured — imports never go through this
       function, see servo-cfg.js/import.js) keeps whatever homemode it
       already carries; this only sets the DEFAULT for a newly-enabled one. */
    const wasUsed = /^servo/i.test(c.mode);
    c.mode = 'Servo';
    if(!wasUsed) c.homemode = 'Off';
    if(!c.name) c.name = 'Channel '+i;
    if(!c.speed) c.speed = 40;
    if(!c.acceleration) c.acceleration = 10;
    if(c.min === c.max){ c.min = 4000; c.max = 8000; }
  }else{
    c.mode = 'Input'; c.name = '';
  }
  setupSync();
}
function setupBindChannels(){
  const body = $('setBody');
  const count = ()=>{
    const n = HW.channels().filter(c=>c && /^servo/i.test(c.mode)).length;
    const el2 = $('setChCount');
    if(el2) el2.textContent = n + ' channel' + (n===1?'':'s') + ' in use of ' + setupChannels();
  };
  count();
  body.oninput = e=>{
    const k0 = e.target.dataset.k;
    /* the header tick and the apply bar sit outside any row */
    if(k0 === 'pickall'){
      SETUP.pick = e.target.checked
        ? HW.channels().map((c,i)=>(c && /^servo/i.test(c.mode)) ? i : -1).filter(i=>i>=0)
        : [];
      setupAskClear(); setupRender(); return;
    }
    if(e.target.id === 'apField'){
      SETUP.apField = e.target.value; SETUP.apVal = undefined;
      setupAskClear(); setupRender(); return;
    }
    if(e.target.id === 'apVal'){ SETUP.apVal = e.target.value; return; }
    /* the panel's own channel picker — the same selection the list makes */
    if(e.target.id === 'chPick'){ SETUP.sel = +e.target.value; setupRender(); return; }

    /* v1.50.0 — a control is either in a row of the list or in the panel
       below it, and the panel is not a row. So the channel comes from the
       control's own data-ch when it has one, and from its row when it does
       not: one lookup, both surfaces, no second copy of this handler. */
    const tr = e.target.closest('tr[data-ch]');
    const own = e.target.dataset ? e.target.dataset.ch : undefined;
    if(!tr && own === undefined) return;
    const i = (own !== undefined) ? +own : +tr.dataset.ch;
    const k = e.target.dataset.k, c = setupEnsure(i);
    /* the live half (v1.45.0): dragging IS driving, so it goes straight to
       HW.drive and NOTHING is saved — a slider position is where the servo
       happens to be standing, not a setting. It must also return before the
       generic `c[k] = +value` fall-through below, which would otherwise
       invent a channel field called `slide`. */
    if(k === 'slide'){ HW.drive(i, +e.target.value); return; }
    if(k === 'use'){ setupUse(i, e.target.checked); setupRender(); return; }
    if(k === 'part'){
      /* HW.setPart clears the part off whatever channel had it, so the
         re-render is not cosmetic — another row's dropdown just changed */
      if(HW.setPart) HW.setPart(i, e.target.value);
      setupTouched();
      HW.say(e.target.value
        ? 'channel '+i+' drives '+(HW.parts().find(p=>p.act===e.target.value)||{label:e.target.value}).label
        : 'channel '+i+' no longer drives anything on the model');
      setupRender(); return;
    }
    if(k === 'pick'){
      const at = SETUP.pick.indexOf(i);
      if(e.target.checked){ if(at < 0) SETUP.pick.push(i); }
      else if(at >= 0) SETUP.pick.splice(at, 1);
      setupAskClear(); setupRender(); return;
    }
    if(k === 'rev'){
      /* Ticking IS swapping the two ends — there is no separate invert flag
         anywhere downstream and there does not need to be, because every
         consumer takes Math.min/Math.max of the pair. The tick is checked
         when min > max, so unticking puts it back and the box is never out
         of step with the numbers beside it.
         v1.51.0 — while the dial is open the pair being swapped is the
         DIAL's, not the channel's: the channel is sitting at the widened
         working range and swapping THAT would mean nothing. */
      const cal = (SETUP.cal && SETUP.cal.ch === i) ? SETUP.cal : null;
      if(cal){
        const t2 = cal.min; cal.min = cal.max; cal.max = t2;
        setupCalRender();
        HW.say('channel '+i+' '+(cal.min>cal.max?'reversed':'back to normal')
          +' — press save servo setting to keep it');
        setupRender();
        return;
      }
      const t = c.min; c.min = c.max; c.max = t;
      HW.save(); HW.rebuild(true); setupRender();
      HW.say('channel '+i+' '+(c.min>c.max?'reversed':'back to normal')+' — '
          +(c.min/4).toFixed(0)+' → '+(c.max/4).toFixed(0)+' µs');
      return;
    }
    if(k === 'boot'){ c.homemode = e.target.checked ? 'Goto' : 'Off'; HW.save(); HW.rebuild(true); setupRender(); return; }
    if(k === 'name') c.name = e.target.value;
    else if(k === 'minUs' || k === 'maxUs' || k === 'ctrUs'){
      const q = Math.round((+e.target.value || 0) * 4);
      const cal = (SETUP.cal && SETUP.cal.ch === i) ? SETUP.cal : null;
      /* v1.51.0 — one set of numbers. With the dial open these fields ARE
         its three ends (setupChPanel says why), so typing here moves the
         dial and `save servo setting` is what reaches the channel. Without
         it — Studio, or a channel the dial is not on — they write straight
         through exactly as before. */
      if(cal){
        if(k === 'minUs') cal.min = q; else if(k === 'maxUs') cal.max = q; else cal.home = q;
        if(typeof calPaint === 'function') calPaint();
      }else{
        if(k === 'minUs') c.min = q; else if(k === 'maxUs') c.max = q; else c.home = q;
        HW.rebuild(true);
      }
      /* band the cell as you type, without rebuilding the input under the
         caret — the dial learned this lesson the hard way (v0.7.1) */
      e.target.className = pwClass(q);
      e.target.title = pwTitle(q);
    }
    else if(k === 'sleep'){
      const ms = document.querySelector('#chCfg [data-k=sleepMs]');
      c.releaseMs = e.target.checked ? ((ms ? +ms.value|0 : 0) || 1200) : 0;
      HW.save(); setupRender(); return;
    }
    else if(k === 'sleepMs') c.releaseMs = (+e.target.value|0);
    else if(k === 'ease'){ c.ease = e.target.value; HW.rebuild(true); }
    else c[k] = (+e.target.value|0);
    HW.save();
  };
  body.onclick = e=>{
    /* SELECTING IS CLICKING THE ROW (v1.50.0). It used to be clicking the
       channel NUMBER and nothing else — a four-character target nobody
       found, which is why the dome map so often said "no channel
       selected". Now the whole row is the target, and because the panel
       below is always on screen the selection has somewhere visible to
       land. Answered before the button guard, so pressing `test` on a row
       also brings that channel into the panel — which is what you wanted
       when you pressed it. */
    const row = e.target.closest('tr[data-ch]');
    if(row){
      const ri = +row.dataset.ch;
      if(SETUP.sel !== ri){
        SETUP.sel = ri;
        /* re-render for the panel, but NOT out from under a control the
           click is on its way to: the input handler above needs the
           element that was clicked to still be the one that changes. */
        if(!e.target.closest('input,select,button')){ setupRender(); return; }
        setupRender();
      }
    }
    const b = e.target.closest('button'); if(!b) return;
    if(b.dataset.ask){
      const a = SETUP.ask;
      setupAskClear();
      if(b.dataset.ask === 'yes' && a) a.fn();
      setupRender(); return;
    }
    if(b.dataset.act === 'allon' || b.dataset.act === 'alloff'){
      for(let i=0;i<setupChannels();i++) setupUse(i, b.dataset.act === 'allon');
      if(b.dataset.act === 'alloff') SETUP.pick = [];
      HW.save(); setupRender(); return;
    }
    /* the door onto the dome map — a toggle, because the map is a panel on
       this step and not a place you leave the bench for (v1.45.0) */
    if(b.dataset.act === 'dome'){
      setupAskClear();
      if(SETUP.dome && SETUP.dome.open) setupDomeClose(); else setupDomeOpen();
      return;
    }
    /* the two things off the old #hwWrap bar that move real hardware. They
       are DELIBERATELY not behind a confirm: "all off" is the thing you
       press when a panel is straining, and a dialog in front of it is the
       reason a gear strips (v1.45.0). */
    if(b.dataset.act === 'drvhome'){
      let n = 0;
      HW.channels().forEach((c,i)=>{
        if(c && /^servo/i.test(c.mode||'') && c.home){ HW.drive(i, c.home); n++; }
      });
      HW.say(n+' channel'+(n===1?'':'s')+' driven to centre');
      return;
    }
    if(b.dataset.act === 'drvoff'){
      let n = 0;
      HW.channels().forEach((c,i)=>{ if(c && /^servo/i.test(c.mode||'')){ HW.drive(i, 0); n++; } });
      HW.say('all pulses stopped — '+n+' channel'+(n===1?'':'s')+' limp. Anything holding a loaded panel has let go.','warn');
      return;
    }
    if(b.dataset.act === 'applysel'){
      const list = setupPicked();
      if(!list.length) return;
      const f = setupApplyDef(SETUP.apField || 'speed');
      const raw = $('apVal') ? $('apVal').value : f.def;
      const shown = f.type === 'num' ? (+raw||0) : raw;
      /* remember what was typed — the confirm re-renders this bar, and
         cancelling must not throw the number away and quietly hand back the
         default the next time the button is pressed */
      SETUP.apVal = raw;
      setupAsk('Set <b>'+f.label+'</b> to <b>'+shown+'</b> on '+list.length+' channel'+(list.length===1?'':'s')+'?',
        'apply', ()=>{
          list.forEach(i=>setupApplyOne(HW.channels()[i], f.k, shown));
          HW.save(); HW.rebuild(true);
          HW.say(f.label+' set to '+shown+' on '+list.length+' channel'+(list.length===1?'':'s'));
        }, 'table');
      setupRender();
      return;
    }
    const tr = e.target.closest('tr[data-ch]');
    const own = b.dataset.ch;
    if(!tr && own === undefined) return;
    const i = (own !== undefined) ? +own : +tr.dataset.ch;
    if(b.dataset.k === 'cal'){ SETUP.sel = i; setupAskClear(); setupCalOpen(i); return; }
    /* the test button: one press opens, the next shuts. The DIRECTED pair
       decides which end is which (min is shut, max is open, whichever is
       the larger number — the travel rule) so a reversed channel really
       does close when the button says shut. */
    if(b.dataset.k === 'test'){
      const c0 = HW.channels()[i]; if(!c0) return;
      const wasOpen = setupTestOpen(c0);
      HW.drive(i, wasOpen ? c0.min : c0.max);
      b.textContent = wasOpen ? 'open' : 'shut';
      HW.say('channel '+i+(c0.name?' ('+c0.name+')':'')+' driven '+(wasOpen?'shut':'open')
        +' — '+(((wasOpen?c0.min:c0.max)/4)|0)+' µs');
      return;
    }
    /* the four quick moves, carried across from the old bench (v1.45.0).
       min/mid/max read Math.min/Math.max of the pair, so a reversed channel
       still goes where the label says rather than where the field is. */
    const c = HW.channels()[i]; if(!c) return;
    const lo = Math.min(c.min,c.max), hi = Math.max(c.min,c.max);
    if(b.dataset.k === 'soff') HW.drive(i, 0);
    if(b.dataset.k === 'slo')  HW.drive(i, lo);
    if(b.dataset.k === 'smid') HW.drive(i, (lo+hi)>>1);
    if(b.dataset.k === 'shi')  HW.drive(i, hi);
  };
}

