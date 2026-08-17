'use strict';
/* =====================================================================
   RC TRANSMITTER — the calibrate-and-assign panel

   Three sections, in the order you actually do the job:

     1. WHICH DEVICE. Every connected gamepad, with a live movement
        meter beside each one, because "USB Joystick" and "USB Joystick"
        are not distinguishable any other way — you wiggle a stick and
        pick the row that twitches.
     2. CALIBRATE. One button, one instruction, live bars. Start, sweep
        everything to both stops, let go, Done. The rest position is read
        at Done, which is what makes a bottom-resting throttle work.
     3. CHANNELS. One row per channel that moved: live bar, what it does,
        reverse. The rest are folded away behind a "show all channels"
        toggle — a 16-axis dongle would otherwise open with twelve dead
        rows above the four that matter.

   The Advanced switch is the only thing that reveals direct-to-output
   binding, and it carries the warning with it rather than in a footnote:
   a channel bound to an output is writing over the sketch.

   LIVE REDRAW. The bars have to move while nothing else does, so this
   panel runs its own rAF loop and updates the widths in place. It stops
   itself the moment its own wrapper leaves the document, which is what
   happens every time buildStartup() rebuilds the wizard body — no
   listener to unbind, no leak across a step change.

   THE ANCHOR HAS TO BE OURS. The first cut watched `$('startupBody')`,
   which never leaves the document — buildStartup() replaces its CHILDREN
   (`host.innerHTML = ''`). The loop therefore survived every step change
   and kept writing to detached nodes for the rest of the session. So the
   panel wraps itself in a div of its own and watches that: it is the
   thing that actually gets thrown away.
   ===================================================================== */

const RCUI = { raf:0, host:null, rows:[], showAll:false };

function rcUiStop(){
  if(RCUI.raf) cancelAnimationFrame(RCUI.raf);
  RCUI.raf = 0; RCUI.host = null; RCUI.rows = [];
}
function rcUiTick(){
  const host = RCUI.host;
  if(!host || !document.contains(host)){ rcUiStop(); return; }
  RCUI.rows.forEach(r=>{
    const v = RC.norm[r.idx];
    const raw = RC.raw[r.idx];
    const n = (v === undefined) ? 0 : v;
    /* the bar grows from the middle, because a calibrated channel is
       signed and "which way is it deflected" is the thing you are looking
       for while you sweep a stick */
    const pct = Math.abs(n) * 50;
    r.fill.style.left  = (n >= 0 ? 50 : 50 - pct) + '%';
    r.fill.style.width = pct + '%';
    r.fill.classList.toggle('neg', n < 0);
    if(r.val) r.val.textContent = n.toFixed(2);
    if(r.rawv) r.rawv.textContent = (raw === undefined ? 0 : raw).toFixed(3);
    r.wrap.classList.toggle('hot', RC.hot === r.idx);
  });
  const st = RCUI.status;
  if(st) st.textContent = rcUiStatusText();
  RCUI.raf = requestAnimationFrame(rcUiTick);
}
function rcUiStatusText(){
  if(!RC.padId) return 'no transmitter chosen yet';
  if(!RC.live)  return 'chosen device is not connected — plug it in and move a stick';
  if(RC.cal.on) return 'calibrating — sweep every stick and switch to BOTH stops, then let go and press Done';
  return rcCalMovedCount() + ' of ' + RC.chans.length + ' channels moved during calibration';
}
/* NOT rcUiStop() — that clears RCUI.rows, and by the time we are started
   the rows are the ones rcSetupPanel has just built. Calling it here left
   the loop running over an empty list, so every bar sat at 0.00 with live
   values sitting in RC.norm right beside them. Cancel the frame, keep the
   rows. */
function rcUiStart(host){
  if(RCUI.raf) cancelAnimationFrame(RCUI.raf);
  RCUI.host = host;
  RCUI.raf = requestAnimationFrame(rcUiTick);
}

/* a labelled bar; returns the record rcUiTick() updates in place */
function rcUiBar(host, idx, withNumbers){
  const wrap = el('div','rcbar');
  const track = el('div','rctrack');
  const mid = el('div','rcmid'); track.appendChild(mid);
  const fill = el('i','rcfill'); track.appendChild(fill);
  wrap.appendChild(track);
  let val = null, rawv = null;
  if(withNumbers){
    val  = el('span','rcval','0.00');
    rawv = el('span','rcraw','0.000');
    wrap.appendChild(val); wrap.appendChild(rawv);
  }
  host.appendChild(wrap);
  const rec = {idx:idx, wrap:wrap, fill:fill, val:val, rawv:rawv};
  RCUI.rows.push(rec);
  return rec;
}

/* ============================================================ SECTION 1 */
function rcDeviceSect(host, redraw){
  const pads = rcPads();
  const s = sect(host, 'Your transmitter', pads.length ? pads.length + ' connected' : 'nothing connected');

  if(!pads.length){
    const h = el('div','note');
    h.innerHTML = '<b>No game controller is visible.</b> Put the transmitter in its USB / simulator mode, plug it in, '
      + 'then <b>move a stick</b> — browsers deliberately hide gamepads until one of them is used. '
      + 'If it still does not appear, it is enumerating as something other than a HID joystick and this route will not reach it.';
    s.appendChild(h);
    return s;
  }

  pads.forEach(p=>{
    const r = el('div','rcdev' + (p.id === RC.padId ? ' act' : ''));
    r.dataset.padId = p.id;
    const nm = el('div','rcdevname');
    nm.appendChild(el('b', null, p.id));
    nm.appendChild(el('div','rcdevsub', p.axes.length + ' axes · ' + p.buttons.length + ' buttons'));
    r.appendChild(nm);
    const b = el('button','b' + (p.id === RC.padId ? '' : ' prim'), p.id === RC.padId ? 'In use' : 'Use this one');
    b.disabled = (p.id === RC.padId);
    b.addEventListener('click',()=>{ rcSelect(p.id); redraw(); });
    r.appendChild(b);
    s.appendChild(r);
  });

  const h = el('div','hint');
  h.innerHTML = 'Not sure which row is the transmitter? Move a stick — the one that reacts is the one you want. '
    + 'While RC is your controller answer, the chosen device is taken OUT of the ordinary pad path, so its channels '
    + 'cannot arrive as stray Xbox buttons.';
  s.appendChild(h);
  return s;
}

/* ============================================================ SECTION 2 */
function rcCalSect(host, redraw){
  const s = sect(host, 'Calibrate', RC.cal.on ? 'recording' : (rcCalMovedCount() ? 'done' : 'not yet'));

  const status = el('div','rcstatus', rcUiStatusText());
  RCUI.status = status;
  s.appendChild(status);

  const bar = el('div','conbar');
  if(!RC.cal.on){
    const b = el('button','b prim', rcCalMovedCount() ? 'Calibrate again' : 'Start calibration');
    b.id = 'btnRcCal';
    b.disabled = !RC.live;
    b.addEventListener('click',()=>{ rcCalStart(); redraw(); });
    bar.appendChild(b);
  }else{
    const b = el('button','b prim','Done — I have let go');
    b.id = 'btnRcCalDone';
    b.addEventListener('click',()=>{
      rcCalStop();
      /* first calibration on a fresh set: put the obvious Mode 2 mapping in
         rather than leaving four live channels pointed at nothing */
      if(!RC.chans.some(c=>c.mode !== 'off' && (c.pad || c.out))) rcAutoAssign();
      redraw();
    });
    bar.appendChild(b);
  }
  s.appendChild(bar);

  const h = el('div','note');
  h.innerHTML = RC.cal.on
    ? '<b>Now:</b> push every stick to all four corners, run the throttle top to bottom, and flick every switch both ways. '
      + 'Then let everything go and press Done — the resting positions are read at that moment, which is how a throttle that sits '
      + 'at the bottom is told apart from a gimbal that springs back to the middle.'
    : 'This learns what your transmitter actually sends: the real endpoints of each channel and where it sits at rest. '
      + 'Endpoints vary channel to channel — travel adjust, sub-trim and a bit of gimbal wear all show up here — and without them '
      + 'a stick either creeps at rest or never reaches full deflection.';
  s.appendChild(h);
  return s;
}

/* ============================================================ SECTION 3 */
function rcChanRow(host, idx, redraw){
  const ch = RC.chans[idx];
  const assigned = ch.mode !== 'off' && (ch.pad || ch.out);
  /* a channel that is not reading zero with your hands off the set is
     commanding something right now — flag the row, not a footnote */
  const restive = assigned && Math.abs(rcRestValue(ch)) > 0.08;
  const r = el('div','rcrow' + (assigned ? ' on' : '') + (restive ? ' warn' : ''));
  r.dataset.rcChan = String(idx);
  if(restive) r.title = 'This channel reads ' + rcRestValue(ch).toFixed(2) + ' at rest, so it is commanding '
    + (ch.out || ch.pad) + ' with nothing touched. Press "Centring" to make its resting position zero.';

  r.appendChild(el('div','rcname', rcChanName(ch)));

  const barCell = el('div','rcbarcell');
  rcUiBar(barCell, idx, true);
  r.appendChild(barCell);

  /* what it does. In simple mode this is the only control that matters. */
  const target = el('div','rctarget');
  if(RC.advanced){
    const ms = document.createElement('select');
    ms.className = 'rcmode';
    [['off','Ignore'],['pad','Controller'],['out','Direct output']].forEach(([v,l])=>{
      const o = document.createElement('option'); o.value = v; o.textContent = l;
      if(ch.mode === v) o.selected = true; ms.appendChild(o);
    });
    ms.title = 'Controller = the sketch sees a stick move. Direct output = this channel is written straight to the hardware after the sketch has run, overriding it.';
    ms.addEventListener('change',()=>{ ch.mode = ms.value; rcPrefsSave(); redraw(); });
    target.appendChild(ms);
  }

  const sel = document.createElement('select');
  sel.className = 'rcassign';
  const opts = (RC.advanced && ch.mode === 'out') ? rcOutOptions() : rcPadOptions();
  const cur  = (RC.advanced && ch.mode === 'out') ? ch.out : ch.pad;
  opts.forEach(o=>{
    const opt = document.createElement('option');
    opt.value = o.id; opt.textContent = o.label;
    if(cur === o.id) opt.selected = true;
    sel.appendChild(opt);
  });
  if(RC.advanced && ch.mode === 'off') sel.disabled = true;
  sel.addEventListener('change',()=>{
    if(RC.advanced && ch.mode === 'out') ch.out = sel.value;
    else { ch.pad = sel.value; if(ch.mode === 'off' && sel.value) ch.mode = 'pad'; if(!sel.value) ch.mode = 'off'; }
    rcPrefsSave(); redraw();
  });
  target.appendChild(sel);
  r.appendChild(target);

  /* reverse — one click, and the single most-used control on this panel */
  const rev = el('button','b rcrev' + (ch.rev ? ' act' : ''), ch.rev ? 'Reversed' : 'Reverse');
  rev.title = 'flip this channel end for end — the same job as the reverse switch on the transmitter';
  rev.addEventListener('click',()=>{ ch.rev = !ch.rev; rcPrefsSave(); redraw(); });
  r.appendChild(rev);

  /* centring — set automatically by the calibration, changeable because a
     three-position switch resting in the middle is neither case cleanly */
  const ctr = el('button','b rcctr', ch.ctr === 'span' ? 'Full span' : 'Centring');
  ctr.title = ch.ctr === 'span'
    ? 'treated as a throttle: the middle of the travel is zero, so it reads -1 at one stop and +1 at the other'
    : 'treated as a self-centring gimbal: where it rests is zero';
  ctr.addEventListener('click',()=>{ ch.ctr = (ch.ctr === 'span') ? 'rest' : 'span'; rcPrefsSave(); redraw(); });
  r.appendChild(ctr);

  host.appendChild(r);
  return r;
}

function rcChanSect(host, redraw){
  const live = RC.chans.filter(c=>c.moved).length;
  const s = sect(host, 'Channels', live ? live + ' live' : 'calibrate first');

  if(!RC.chans.length){
    s.appendChild(el('div','hint','Choose a transmitter above and the channels appear here.'));
    return s;
  }

  const tools = el('div','conbar');
  const auto = el('button','b','Assign the usual four');
  auto.title = 'Mode 2: throttle drives, rudder turns, aileron spins the dome. Only channels that moved during calibration are assigned.';
  auto.addEventListener('click',()=>{ const n = rcAutoAssign(); lg('sys','RC: assigned '+n+' channel'+(n===1?'':'s')); redraw(); });
  tools.appendChild(auto);
  const clr = el('button','b','Clear all');
  clr.addEventListener('click',()=>{ rcClearAssign(); redraw(); });
  tools.appendChild(clr);

  const adv = el('label','blkswitch');
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.id = 'rcAdvanced'; cb.checked = RC.advanced;
  cb.addEventListener('change',()=>{ RC.advanced = cb.checked; rcPrefsSave(); redraw(); });
  adv.appendChild(cb); adv.appendChild(document.createTextNode('Advanced — bind straight to an output'));
  tools.appendChild(adv);
  s.appendChild(tools);

  if(RC.advanced){
    const w = el('div','note');
    w.innerHTML = '<b>Direct output takes the firmware out of the loop.</b> A channel set to <i>Direct output</i> is written to the '
      + 'motor or servo AFTER the sketch has run each frame, so it overrides whatever the sketch decided — which is how an RC-only '
      + 'droid behaves, and is exactly what you want for proving a surface at the bench. It is not what you want when you are here '
      + 'to test the code. Leave a channel on <i>Controller</i> and the sketch does the deciding.';
    s.appendChild(w);
  }

  const warn = rcRestWarnings();
  if(warn.length){
    const w = el('div','note');
    w.innerHTML = '<b>Hands off the set and ' + (warn.length === 1 ? 'a channel is' : warn.length + ' channels are')
      + ' still commanding something.</b> ' + warn.map(x=>rcChanName(x.ch) + ' reads ' + x.rest.toFixed(2)).join(', ')
      + '. That is usually a throttle: it rests at the bottom of its travel, so treating the middle of the throw as zero '
      + 'means "not touching it" is full reverse. Press <b>Centring</b> on the row and its resting position becomes zero.';
    s.appendChild(w);
  }

  const hdr = el('div','rcrow rchdr');
  hdr.appendChild(el('div','rcname','Channel'));
  hdr.appendChild(el('div','rcbarcell','position'));
  hdr.appendChild(el('div','rctarget','does what'));
  hdr.appendChild(el('div',null,''));
  hdr.appendChild(el('div',null,''));
  s.appendChild(hdr);

  const shown = RC.chans.map((c,i)=>i).filter(i=>RCUI.showAll || RC.chans[i].moved || RC.chans[i].mode !== 'off');
  if(!shown.length){
    s.appendChild(el('div','hint','Nothing has moved yet — run the calibration above, or tick "show every channel" to assign one by hand.'));
  }
  shown.forEach(i=>rcChanRow(s, i, redraw));

  const hidden = RC.chans.length - shown.length;
  if(hidden > 0 || RCUI.showAll){
    const more = el('label','blkswitch');
    const mb = document.createElement('input');
    mb.type = 'checkbox'; mb.id = 'rcShowAll'; mb.checked = RCUI.showAll;
    mb.addEventListener('change',()=>{ RCUI.showAll = mb.checked; redraw(); });
    more.appendChild(mb);
    more.appendChild(document.createTextNode(RCUI.showAll ? 'show every channel' : 'show every channel (' + hidden + ' hidden)'));
    s.appendChild(more);
  }
  return s;
}

/* ======================================================== the whole panel
   One entry point. `redraw` is whatever rebuilds the host — buildStartup()
   in the wizard — so every control here is a write-then-redraw and there is
   no second copy of the state to keep in step. */
function rcSetupPanel(host, redraw){
  RCUI.rows = [];
  RCUI.status = null;
  /* our own wrapper, not the caller's host — see the header note on why the
     rAF loop must watch a node that is genuinely discarded */
  const wrap = el('div','rcpanel');
  host.appendChild(wrap);
  rcDeviceSect(wrap, redraw);
  rcCalSect(wrap, redraw);
  rcChanSect(wrap, redraw);
  rcUiStart(wrap);
  return wrap;
}
