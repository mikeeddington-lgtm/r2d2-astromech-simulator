'use strict';
/* =====================================================================
   SETUP-HW CAL — the calibration dial, split out of setup-hw.js on
   2026-08-15 so the wizard shell and the channel table can load without it.
   ===================================================================== */

/* ============================================== the calibration dial ====
   One channel at a time, driving the real servo through the same engine the
   sequencer uses — so what you see here is what a sequence will do. */
const CAL_SAFE = {lo:4000, hi:8000};      /* 1000–2000 µs, the cautious sweep */
const CAL_FULL = {lo:2000, hi:10000};     /* 500–2500 µs, everything a servo takes */

/* ================================================ THE DIAL IS THE VIEW
   v1.51.0. Mike sent a screenshot of the Channels step with the list, the
   Configure panel AND the dial all on screen at once: *"this should be the
   default view."*

   It was a mode before — you pressed `configure…` to enter it and cancel or
   commit to leave. Making it the default means three things had to change,
   and each of them was a latent lie the mode was hiding:

     · OPENING MUST NOT MOVE A SERVO. It used to drive the channel to its
       centre on the way in, which was defensible when you had asked for the
       dial and unforgivable when merely clicking down a list of rows would
       walk every panel on the droid to mid-travel in turn.
     · THE PANEL ABOVE MUST NOT SHOW THE WORKING RANGE. The dial widens the
       channel to 1000–2000 µs so it can reach past its own endpoints, and
       the Configure panel reads the same fields — so the two would have
       disagreed the moment they were on screen together. While the dial is
       open the panel shows the DIAL's pending ends (setupChPanel), which is
       what the numbers in Mike's screenshot actually are.
     · "NOTHING IS SAVED YET" HAD TO BECOME VISIBLE. In a mode you know you
       are mid-edit. In the default view you do not, so the dial says
       `unsaved` the moment its ends differ from the channel's, and the
       button that ends it is called what it does. */
function setupCalOpen(ch, opts){
  setupCalLeave();
  /* the dial and the selection are one thing now: opening it on a channel
     IS selecting that channel, or the next render's setupCalEnsure would
     move it straight back to whatever the list has highlighted */
  SETUP.sel = ch;
  const c = setupEnsure(ch);
  const o = opts || {};
  if(!o.quiet) SETUP.calShown = false;
  const mid = (Math.min(c.min,c.max)+Math.max(c.min,c.max))>>1;
  /* where the servo already IS, if it is being driven — the dial should
     open under the needle rather than jumping it somewhere */
  const E = (typeof HW !== 'undefined' && HW.engine) ? HW.engine() : null;
  const st = E && E.st && E.st[ch];
  const at = (st && st.active && st.target) ? st.target : 0;
  SETUP.cal = {
    ch, wide:false,
    saveMin:c.min, saveMax:c.max, saveHome:c.home, saveMode:c.homemode,
    min:c.min, max:c.max, home:c.home || mid,
    pos: at || c.home || mid
  };
  /* NOT HW.drive() any more (v1.51.0) — see above. The dial follows the
     servo on the way in; the servo follows the dial only once you turn it.
     And NOT a widened c.min/c.max either: see calDrive(). */
  /* v1.56.0: the read-back follows the dial. One channel is polled at a
     time — the wire is shared with every target the engine sends, and the
     channel you are turning is the only one whose position anybody is
     looking at. mstrWatch() is a no-op unless the board is a Maestro. */
  if(typeof mstrWatch === 'function') mstrWatch(ch);
  if(!o.quiet) setupCalRender();
}
/* the dial is open on THIS channel, whatever it was on before. The cancel
   inside setupCalOpen puts the previous channel's ends back, so moving down
   the list never leaves a widened working range behind. */
function setupCalEnsure(ch){
  if(SETUP.cal && SETUP.cal.ch === ch) return;
  setupCalOpen(ch, {quiet:true});
}
/* has the dial got anything in it that is not on the channel yet? Only the
   three CAPTURED ends count — turning the dial moves `pos`, which is where
   the servo is standing and not a setting, so a nudge stages nothing. */
function setupCalDirty(){
  const cal = SETUP.cal; if(!cal) return false;
  return cal.min !== cal.saveMin || cal.max !== cal.saveMax || cal.home !== cal.saveHome;
}
/* ================================================ LEAVING MEANS KEEPING
   Mike, asked what should happen to a staged end when you click another
   channel or close the bench: *"keep it — leaving means keeping."*

   Which is the only answer consistent with the panel it now sits in. Every
   other field there — speed, acceleration, ease, sleep, boot, the name —
   writes the moment you change it; three of them silently reverting because
   you looked at the next channel would be the trap, not the safeguard. The
   `save servo setting` button is the affordance, not the gate: it is how you
   commit WITHOUT leaving. `cancel` remains the real undo, and because only
   a deliberate capture or a typed number stages anything (see
   setupCalDirty), nudging the dial on a real linkage still commits nothing.

   Every place that used to abandon the dial goes through here. */
function setupCalLeave(){
  if(!SETUP.cal) return;
  /* no dial, nobody looking at a position — stop asking for one */
  if(typeof mstrUnwatch === 'function') mstrUnwatch();
  if(setupCalDirty()) setupCalCommit();
  else SETUP.cal = null;
}
function setupCalCancel(){
  const cal = SETUP.cal; if(!cal) return;
  if(typeof mstrUnwatch === 'function') mstrUnwatch();
  const c = HW.channels()[cal.ch];
  if(c){ c.min = cal.saveMin; c.max = cal.saveMax; c.home = cal.saveHome; c.homemode = cal.saveMode; }
  SETUP.cal = null;
  HW.rebuild(true);
}
function setupCalCommit(){
  const cal = SETUP.cal; if(!cal) return;
  const c = HW.channels()[cal.ch];
  c.min = cal.min; c.max = cal.max;
  c.home = cal.home;
  /* Mike, 2026-08-14: "boot should not be auto ticked just because it's
     setup" — capturing MIN/CENTER/MAX on the dial is calibration, not an
     answer to "drive to centre at power-up?". cal.home is almost never 0
     (setupCalOpen seeds it from the midpoint), so forcing homemode to
     'Goto' here ticked boot on every single channel anyone calibrated —
     exactly the auto-tick Mike is describing. homemode is left exactly as
     it was; the boot column (setupStepChannels) and its own tick
     (setupBindChannels) are the only things that change it now. */
  c.calibrated = true;      /* you set these against the real linkage */
  setupTouched();           /* ...so the export on the way out is now stale */
  SETUP.cal = null;
  HW.rebuild(true);
  HW.save();
  HW.say('channel '+cal.ch+' saved: '+(c.min/4).toFixed(0)+'–'+(c.max/4).toFixed(0)+' µs, centre '
    + (c.home/4).toFixed(0)+' µs');
  /* the dial does not go away — it is the view now, so it comes straight
     back seeded from what was just saved (setupRender's setupCalEnsure) */
}

/* The stock ends. "Reset" means these: 1000 / 1500 / 2000 µs is what every
   hobby servo accepts, so it is the known-safe place to start again from
   when a linkage has been changed or a calibration has gone wrong. */
const CAL_STOCK = {min:4000, home:6000, max:8000};

/* one of the three end buttons: press it to capture where the dial is, or
   type the pulse width in if you already know it */
function calEndCell(cap, label, id){
  const cls = cap === 'home' ? 'ctr' : cap;
  return '<div class="calb '+cls+'">'
    + '<button class="calcap" data-cap="'+cap+'" title="record where the dial is now as '+label+'">'+label+'</button>'
    + '<div class="calnum"><input type="number" data-set="'+cap+'" id="'+id+'" step="1" min="300" max="2700"'
    + ' title="type the pulse width for this end"><span>µs</span></div>'
    + '</div>';
}

/* Geometry constants shared by the shell and the paint pass. The dial is a
   240 degree sweep with the gap at the bottom, starting bottom-left. */
const CAL_R = 92, CAL_CX = 120, CAL_CY = 120, CAL_A0 = -210, CAL_SPAN = 240;
function calRange(){ return SETUP.cal && SETUP.cal.wide ? CAL_FULL : CAL_SAFE; }

/* ============================================ DRIVING PAST THE ENDPOINTS
   `pcaSetTarget()` clamps to the channel's own min/max — it has to, it is
   the board's model — so the dial cannot reach past the very endpoints it
   exists to FIND. Until v1.51.0 the answer was to open the channel's range
   to 1000–2000 µs for as long as the dial was on screen, and put it back on
   cancel or commit.

   That was survivable while the dial was a MODE. It is not survivable now
   that the dial is the default view, because "for as long as the dial is on
   screen" became "always": every `HW.save()` — changing a speed, ticking
   boot, renaming a channel — would have written 1000–2000 µs over the
   builder's measured travel, and the Configure panel would have read the
   working range back out and shown it as the channel's ends.

   So the widening lasts exactly one call instead. `pcaSetTarget` clamps at
   SET time and the step never re-clamps (pcaseq.js), so opening the range,
   commanding the target and closing it again lands the servo where the dial
   asked and leaves the channel exactly as the builder measured it. Nothing
   outside this function ever sees the working range.

   `HW.drive` also normalises the target onto the 3D model through
   `chanNorm(c, …)`, which reads the real ends — so a dial past the travel
   pins the model at its own limit and the DROID does not pretend to have
   travel it has not got. That is the right way round. */
function calDrive(ch, qus){
  const c = HW.channels()[ch]; if(!c){ HW.drive(ch, qus); return; }
  const r = calRange();
  const sMin = c.min, sMax = c.max;
  c.min = r.lo; c.max = r.hi;
  try{ HW.drive(ch, qus); }
  finally{ c.min = sMin; c.max = sMax; }
}

/* THE RULE FOR THIS PANEL: setupCalRender() builds the DOM, calPaint()
   moves it. They were one function, which meant every pointermove rebuilt
   the SVG the pointer was captured on — so a drag died on its first frame
   and the dial could only be clicked. Anything that changes on every frame
   belongs in calPaint(); anything structural belongs in the shell. */
function setupCalRender(){
  const host = $('calWrap'); if(!host) return;
  const cal = SETUP.cal;
  if(!cal){ host.innerHTML=''; return; }
  const c = HW.channels()[cal.ch];
  const range = calRange();

  host.innerHTML = '<div class="calpanel">'
    + '<div class="calhead"><b>'+(c.name||('Channel '+cal.ch))+'</b>'
    + '<span class="stat">channel '+cal.ch+' · board '+(cal.ch>>4)+' pin '+(cal.ch&15)+'</span>'
    + '<span class="sp" style="flex:1"></span>'
    + (setupAdv()
        ? '<label class="tiny" title="Only after you know the linkage will not bind. A horn driven into a hard stop at full travel strips gears."><input type="checkbox" id="calWide"'+(cal.wide?' checked':'')+'> unlock full 500–2500 µs</label>'
        : '<span class="tiny" title="1000–2000 µs covers almost every linkage, and stops a horn reaching a hard stop. Tick Advanced in the header if you genuinely need the full sweep.">safe range · 1000–2000 µs</span>')
    + '</div>'
    + '<div class="calbody">'
    + '<svg class="caldial" viewBox="0 0 240 240" id="calDial" tabindex="0">'
    + '<circle cx="'+CAL_CX+'" cy="'+CAL_CY+'" r="'+CAL_R+'" fill="var(--setFace)" stroke="var(--setEdge)" stroke-width="2"/>'
    + '<path d="'+calArc(CAL_CX,CAL_CY,CAL_R-3,CAL_A0,CAL_A0+CAL_SPAN)+'" fill="none" stroke="var(--setEdge)" stroke-width="6"/>'
    + '<g id="calTicks"></g>'
    + '<line id="calNeedle" x1="'+CAL_CX+'" y1="'+CAL_CY+'" x2="'+CAL_CX+'" y2="'+(CAL_CY-CAL_R+16)+'" stroke="var(--setNeedle)" stroke-width="5" stroke-linecap="round"/>'
    + '<circle cx="'+CAL_CX+'" cy="'+CAL_CY+'" r="30" fill="var(--setHub)" stroke="var(--setEdge)"/>'
    + '<text id="calRead" x="'+CAL_CX+'" y="'+(CAL_CY+2)+'" fill="var(--setInk)" font-size="17" text-anchor="middle" font-family="monospace">—</text>'
    + '<text x="'+CAL_CX+'" y="'+(CAL_CY+18)+'" fill="var(--setTick)" font-size="10" text-anchor="middle" font-family="monospace">µs</text>'
    + '</svg>'
    + '<div class="calside">'
    + '<input type="range" id="calSlide" min="'+range.lo+'" max="'+range.hi+'" value="'+cal.pos+'" step="1">'
    + '<div class="calnudge">'
    + '<button class="mini" data-nudge="-20" title="−5 µs">≪</button>'
    + '<button class="mini" data-nudge="-4" title="−1 µs">‹</button>'
    + '<button class="mini" data-nudge="-1" title="−0.25 µs, the finest step there is">·</button>'
    + '<input type="number" id="calNum" step="0.25" min="'+(range.lo/4)+'" max="'+(range.hi/4)+'" title="type an exact pulse width">'
    + '<span class="stat">µs</span>'
    + '<button class="mini" data-nudge="1" title="+0.25 µs">·</button>'
    + '<button class="mini" data-nudge="4" title="+1 µs">›</button>'
    + '<button class="mini" data-nudge="20" title="+5 µs">≫</button>'
    + '<span class="stat">drag the dial, or click it and use ← →</span>'
    + '</div>'
    + '<div class="calbtns">'
    /* Mike, 2026-08-16: "changes the words to Set Min / Set Center /
       Set Max". A bare "MIN" reads as a label for the box under it; the
       verb says it is a button you press to CAPTURE where the dial is. */
    + calEndCell('min',  'Set MIN',    'calLmin')
    + calEndCell('home', 'Set CENTER', 'calLctr')
    + calEndCell('max',  'Set MAX',    'calLmax')
    + '</div>'
    + '<div class="calhint">Turn the dial until the part is exactly where you want that limit, then press the button — '
    + 'or type the pulse width straight into the box under it, which is quicker when you already know the number. '
    + 'If the part goes the wrong way, tick <b>reverse</b> — it swaps the two ends, which is all a reversed linkage ever means.</div>'
    + setupAskHtml('dial')
    /* v1.56.0. Empty unless a real Pololu Maestro is connected — it is the
       only board on the link that can be ASKED where it actually is. Filled
       by mstrReadoutSync() rather than by this render, because it changes
       five times a second and the panel around it must not. */
    + '<div class="calboard" id="calBoard"></div>'
    + '<div class="calbar">'
    /* the same control as the table's, and the same rule: the tick is READ
       BACK off min > max rather than stored, so the two can never disagree
       and unticking is a real undo */
    + '<label class="tiny calrev"><input type="checkbox" id="calRev"'+(cal.min > cal.max ? ' checked' : '')
    + ' title="the linkage runs the other way — ticking swaps MIN and MAX"> reverse</label>'
    + '<button class="mini" data-cal="sweep">test sweep</button>'
    + '<button class="mini" data-cal="off">pulses off</button>'
    + '<button class="mini" data-cal="reset" title="back to the stock 1000 / 1500 / 2000 µs every servo accepts">reset to default</button>'
    + '<span class="sp" style="flex:1"></span>'
    + (setupCalDirty()
        ? '<span class="calpend" title="these three numbers are not written to the channel yet. Press save, or just carry on — leaving this channel keeps them. Cancel puts back what was there.">not written yet</span>'
        : '')
    /* Mike, 2026-08-19: *"rename use these ends to save servo setting"* —
       and he is right that the old words described the gesture rather than
       the consequence. It is the button that makes this channel stick. */
    + '<button class="mini" data-cal="cancel" title="put back the ends this channel had before you started turning the dial">cancel</button>'
    + '<button class="prim" data-cal="ok" title="write these three pulse widths onto this channel and save">save servo setting</button>'
    + '</div></div></div></div>';

  calBind();
  calPaint();
  if(!SETUP.calShown){ SETUP.calShown = true; host.scrollIntoView({block:'nearest'}); }
}

/* everything that moves — needle, readout, ticks, labels, the two inputs */
function calPaint(){
  const cal = SETUP.cal; if(!cal) return;
  const range = calRange();
  const ang = q=>(CAL_A0 + Math.max(0, Math.min(1, (q-range.lo)/(range.hi-range.lo))) * CAL_SPAN) * Math.PI/180;
  const a = ang(cal.pos);
  const n = $('calNeedle'); if(!n) return;
  n.setAttribute('x2', CAL_CX + Math.cos(a)*(CAL_R-16));
  n.setAttribute('y2', CAL_CY + Math.sin(a)*(CAL_R-16));
  $('calRead').textContent = (cal.pos/4).toFixed(2).replace(/\.00$/,'');
  const tick = (q,col,lbl)=>{
    if(!q) return '';
    const r2 = ang(q);
    return '<line x1="'+(CAL_CX+Math.cos(r2)*(CAL_R-4))+'" y1="'+(CAL_CY+Math.sin(r2)*(CAL_R-4))+'" '
      + 'x2="'+(CAL_CX+Math.cos(r2)*(CAL_R+9))+'" y2="'+(CAL_CY+Math.sin(r2)*(CAL_R+9))+'" stroke="'+col+'" stroke-width="3"/>'
      + '<text x="'+(CAL_CX+Math.cos(r2)*(CAL_R+22))+'" y="'+(CAL_CY+Math.sin(r2)*(CAL_R+22)+4)+'" fill="'+col+'" '
      + 'font-size="10" text-anchor="middle" font-family="monospace">'+lbl+'</text>';
  };
  $('calTicks').innerHTML = tick(cal.min,'var(--setAcc)','min') + tick(cal.max,'var(--setBad)','max') + tick(cal.home,'var(--setGood)','ctr');
  /* the three end boxes are typed as well as captured, so they follow the
     same rule as calNum: never write to the one under the caret */
  const endBox = (id, q)=>{
    const b = $(id); if(!b) return;
    if(document.activeElement !== b) b.value = q ? (q/4).toFixed(0) : '';
    b.className = pwClass(q);
    b.title = q ? pwTitle(q) : 'type the pulse width for this end';
  };
  endBox('calLmin', cal.min);
  endBox('calLmax', cal.max);
  endBox('calLctr', cal.home);
  /* the reverse tick is drawn from the numbers, so typing MIN above MAX
     ticks it and "reset to default" unticks it, with no extra bookkeeping */
  const rv = $('calRev'); if(rv) rv.checked = cal.min > cal.max;
  const sl = $('calSlide'); if(sl && document.activeElement !== sl) sl.value = cal.pos;
  const nm = $('calNum');   if(nm && document.activeElement !== nm) nm.value = (cal.pos/4).toFixed(2).replace(/\.00$/,'');
}

/* the one place a position is set: clamp, drive the servo, repaint */
function calSet(qus){
  const cal = SETUP.cal; if(!cal) return;
  const range = calRange();
  cal.pos = Math.max(range.lo, Math.min(range.hi, Math.round(qus)));
  calDrive(cal.ch, cal.pos);
  calPaint();
}

function calBind(){
  const host = $('calWrap'), dial = $('calDial'), slide = $('calSlide');
  slide.oninput = ()=>calSet(+slide.value);
  $('calNum').onchange = e=>calSet(Math.round(+e.target.value * 4));
  /* absent in simple mode — see SETUP.adv */
  if($('calWide')) $('calWide').onchange = e=>{
    SETUP.cal.wide = e.target.checked;
    setupCalRender();
    /* narrowing back can leave the dial sitting past the new endpoints —
       drive it back in bounds rather than show a position the engine no
       longer allows. calSet is the one place a position is clamped. */
    calSet(SETUP.cal.pos);
  };
  /* Reversing IS swapping the two ends — there is no separate invert anywhere
     downstream, and there does not need to be: everything takes Math.min /
     Math.max of the pair. Mike, 2026-08-11: "we should add a reverse button,
     it's easier to explain" — and 2026-08-12: make it a tick, like the row's.
     The box is drawn from min > max, so it is never out of step with the two
     numbers above it. */
  $('calRev').onchange = ()=>{
    const cal = SETUP.cal; if(!cal) return;
    const t = cal.min; cal.min = cal.max; cal.max = t;
    calPaint();
    HW.say('ends swapped — MIN is now '+(cal.min?(cal.min/4).toFixed(0)+' µs':'unset'));
  };
  /* typing an end sets it directly and drives the servo there, so you see
     what you just typed rather than trusting the number */
  host.querySelectorAll('[data-set]').forEach(inp=>{
    inp.onchange = e=>{
      const cal = SETUP.cal; if(!cal) return;
      const q = Math.round((+e.target.value || 0) * 4);
      if(!q){ calPaint(); return; }
      cal[e.target.dataset.set] = q;
      /* a typed end outside the working range would be clamped away by
         calSet and the dial would show a number nobody typed — unlock the
         full sweep instead, which is what the value is asking for */
      const r = calRange();
      if(q < r.lo || q > r.hi){ cal.wide = true; setupCalRender(); }
      calSet(q);
    };
  });

  /* pointer → angle. The gap is at the bottom, so anything past +60° is
     read as the far end of the sweep rather than wrapping to the start. */
  const fromEvent = e=>{
    const r = dial.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * 240 - CAL_CX;
    const y = (e.clientY - r.top) / r.height * 240 - CAL_CY;
    let deg = Math.atan2(y, x) * 180/Math.PI;
    if(deg > 60) deg -= 360;
    const range = calRange();
    return range.lo + Math.max(0, Math.min(1, (deg - CAL_A0)/CAL_SPAN)) * (range.hi - range.lo);
  };
  let dragging = false;
  dial.addEventListener('pointerdown', e=>{
    dragging = true; dial.setPointerCapture(e.pointerId);
    dial.focus({preventScroll:true});
    calSet(fromEvent(e)); e.preventDefault();
  });
  dial.addEventListener('pointermove', e=>{ if(dragging) calSet(fromEvent(e)); });
  const stop = e=>{ dragging = false; try{ dial.releasePointerCapture(e.pointerId); }catch(_){} };
  dial.addEventListener('pointerup', stop);
  dial.addEventListener('pointercancel', stop);
  /* the dial is focusable, so the arrow keys are the finest control there
     is — one quarter-µs a press, ten with shift */
  dial.addEventListener('keydown', e=>{
    const step = e.shiftKey ? 10 : 1;
    if(e.key === 'ArrowRight' || e.key === 'ArrowUp'){ calSet(SETUP.cal.pos + step); e.preventDefault(); }
    if(e.key === 'ArrowLeft'  || e.key === 'ArrowDown'){ calSet(SETUP.cal.pos - step); e.preventDefault(); }
  });

  host.onclick = e=>{
    const b = e.target.closest('button'); if(!b) return;
    const cal2 = SETUP.cal; if(!cal2) return;
    if(b.dataset.nudge){ calSet(cal2.pos + (+b.dataset.nudge)); return; }
    if(b.dataset.cap){ cal2[b.dataset.cap] = cal2.pos; calPaint(); return; }
    if(b.dataset.ask){
      const a = SETUP.ask;
      setupAskClear();
      if(b.dataset.ask === 'yes' && a) a.fn();
      setupCalRender(); return;
    }
    if(b.dataset.cal === 'reset'){
      setupAsk('Reset this channel’s ends to the stock 1000 / 1500 / 2000 µs? '
             + 'Whatever you calibrated against the linkage is lost.', 'reset', ()=>{
        const cal3 = SETUP.cal; if(!cal3) return;
        cal3.min = CAL_STOCK.min; cal3.home = CAL_STOCK.home; cal3.max = CAL_STOCK.max;
        calSet(cal3.home);
        HW.say('ends reset to 1000 / 1500 / 2000 µs — nothing is saved until you press "save servo setting"');
      }, 'dial');
      setupCalRender();
      return;
    }
    if(b.dataset.cal === 'off'){ HW.drive(cal2.ch, 0); return; }
    if(b.dataset.cal === 'sweep'){ calSweep(); return; }
    if(b.dataset.cal === 'cancel'){ setupCalCancel(); setupRender(); return; }
    if(b.dataset.cal === 'ok'){
      if(cal2.min === cal2.max){ HW.say('capture a min and a max that differ first','warn'); return; }
      setupCalCommit(); setupRender();
    }
  };
}

function calArc(cx,cy,r,a0,a1){
  const p = a=>[cx+Math.cos(a*Math.PI/180)*r, cy+Math.sin(a*Math.PI/180)*r];
  const [x0,y0]=p(a0), [x1,y1]=p(a1);
  return 'M'+x0+' '+y0+' A '+r+' '+r+' 0 1 1 '+x1+' '+y1;
}
/* walk the captured range at the channel's own speed — the honest check
   that the endpoints do not bind before you trust them in a sequence */
function calSweep(){
  const cal = SETUP.cal; if(!cal) return;
  if(!cal.min || !cal.max){ HW.say('capture a min and a max first','warn'); return; }
  const lo = Math.min(cal.min, cal.max), hi = Math.max(cal.min, cal.max);
  /* v1.51.0 — no range surgery here either. calDrive() opens the working
     range for the one call and closes it again, so a sweep that is
     interrupted (the dial closes, the wizard closes, the tab is hidden mid
     `setTimeout`) cannot leave a channel narrowed to the captured pair. */
  let at = 0;
  const seq = [lo, hi, cal.home || ((lo+hi)>>1)];
  const tick = ()=>{
    if(!SETUP.cal || at >= seq.length) return;
    calDrive(cal.ch, seq[at++]);
    setTimeout(tick, 1400);
  };
  tick();
}

