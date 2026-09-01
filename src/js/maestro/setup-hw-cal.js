'use strict';
/* =====================================================================
   SETUP-HW CAL — the calibration dial, split out of setup-hw.js on
   2026-08-15 so the wizard shell and the channel table can load without it.
   ===================================================================== */

/* ============================================== the calibration dial ====
   One channel at a time, driving the real servo through the same engine the
   sequencer uses — so what you see here is what a sequence will do. */
/* THE TWO BANDS ARE NOT THIS FILE'S TO DECIDE (v1.70.1).
   These were a second copy of PW_STD/PW_ABS — the same four numbers,
   written out again, a hundred lines from a set of number boxes that
   accepted 300–2700 and a chip that counted against 500–2500. Two copies
   that agree today are one release away from disagreeing, and the way you
   find out is a stripped gear. They ARE the shared pair now, by identity:
   the cautious sweep is the standard band, the full sweep is the absolute
   one, and there is nowhere left for a third opinion to live.
   servo-units.js is listed before this file in both manifests, which is
   what makes a plain reference safe here. */
const CAL_SAFE = PW_STD;      /* 1000–2000 µs, the cautious sweep */
const CAL_FULL = PW_ABS;      /* 500–2500 µs, everything a servo takes */

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
  calFree(SETUP.cal.ch, false);      /* the window past the ends shuts with the dial */
  /* v1.70.1 — leaving means keeping, but it does not mean keeping
     ANYTHING: a trio the gate refuses is dropped rather than written, and
     setupCalCommit has already said why. The only way to stage one is to
     reverse or reset a channel that arrived out of band in the first
     place, so what is dropped is a change that could not have been saved
     from the button either. */
  if(setupCalDirty()) setupCalCommit();
  SETUP.cal = null;
}
function setupCalCancel(){
  const cal = SETUP.cal; if(!cal) return;
  if(typeof mstrUnwatch === 'function') mstrUnwatch();
  calFree(cal.ch, false);
  const c = HW.channels()[cal.ch];
  if(c){ c.min = cal.saveMin; c.max = cal.saveMax; c.home = cal.saveHome; c.homemode = cal.saveMode; }
  SETUP.cal = null;
  HW.rebuild(true);
}
/* ============================================ THE GATE, NOT THE BUTTON
   v1.70.1. Every road onto a channel's three ends ends here — the save
   button, leaving the channel, closing the bench — so this is where the
   owner's ruling is actually kept: nothing outside 500–2500 µs, and no
   centre outside its own min–max, is ever written to hardware, however it
   got as far as the staged trio. The controls refuse these numbers as they
   are typed, which is where a person is told; this refuses them as they
   are WRITTEN, which is what covers a value that arrived some other way —
   an imported .mstr, a profile, a calibration older than this release.

   It returns whether it wrote, because two of its three callers need to
   know: the button must not report a save it did not make, and
   setupCalLeave must not silently drop what it could not keep. */
function setupCalCommit(){
  const cal = SETUP.cal; if(!cal) return false;
  const stop = pwEndsRefusal(cal);
  if(stop){
    setupEndsSay(cal);
    HW.say('channel '+cal.ch+' not saved — '+stop.text, 'warn');
    return false;
  }
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
  calFree(cal.ch, false);   /* the ends are the ends again — shut the window */
  SETUP.cal = null;
  HW.rebuild(true);
  HW.save();
  HW.say('channel '+cal.ch+' saved: '+(c.min/4).toFixed(0)+'–'+(c.max/4).toFixed(0)+' µs, centre '
    + (c.home/4).toFixed(0)+' µs');
  /* the dial does not go away — it is the view now, so it comes straight
     back seeded from what was just saved (setupRender's setupCalEnsure) */
  return true;
}

/* The stock ends. "Reset" means these: 1000 / 1500 / 2000 µs is what every
   hobby servo accepts, so it is the known-safe place to start again from
   when a linkage has been changed or a calibration has gone wrong. */
const CAL_STOCK = {min:4000, home:6000, max:8000};

/* one of the three end buttons: press it to capture where the dial is, or
   type the pulse width in if you already know it */
function calEndCell(cap, label, id){
  const cls = cap === 'home' ? 'ctr' : cap;
  /* the box stops where the policy stops. It used to say min="300"
     max="2700" — numbers that matched nothing else on the screen and that
     the browser only ever treated as a hint anyway, which is why 2700 went
     in without an argument. The attributes are the spinner's manners; the
     refusal in calBind is the rule (v1.70.1). */
  return '<div class="calb '+cls+'">'
    + '<button class="calcap" data-cap="'+cap+'" title="record where the dial is now as '+label+'">'+label+'</button>'
    + '<div class="calnum"><input type="number" data-set="'+cap+'" id="'+id+'" step="1"'
    + ' min="'+(PW_ABS.lo/4)+'" max="'+(PW_ABS.hi/4)+'"'
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

   So from v1.51.0 the widening lasted exactly one call — and this comment
   claimed "the step never re-clamps (pcaseq.js)". IT DID: pcaStepChannel
   clamps the position every tick (it has since the reversing-with-residual-
   velocity fix), so the target was accepted and the servo walked straight
   back to the stored end. v1.76.0 replaced the one-call widening with a
   window the ENGINE holds per channel (`st.free`, pcaBounds in pcaseq.js)
   for as long as the dial is on it; the table's numbers are never touched,
   which keeps everything the paragraph above was afraid of impossible.

   `HW.drive` also normalises the target onto the 3D model through
   `chanNorm(c, …)`, which reads the real ends — so a dial past the travel
   pins the model at its own limit and the DROID does not pretend to have
   travel it has not got. That is the right way round.

   AND THE SAFE-RANGE GATE DOES NOT LIVE HERE (v1.70.1). It is worth saying
   out loud, because the two look superficially alike and one of them
   exists to do what the other forbids. This function writes c.min/c.max
   for the duration of ONE synchronous HW.drive call, to a band the policy
   itself defines (calRange is CAL_SAFE or CAL_FULL, which are PW_STD and
   PW_ABS), and puts them back in a `finally`. It is a WINDOW, not a
   setting: no calibration is being recorded, nothing is saved, and the
   channel is byte-for-byte what it was on the way out.

   The gate judges the three numbers being WRITTEN — the dial's staged
   trio when a value is typed, the trio again when it is committed. It
   never runs inside this window and has nothing to read here, which is why
   the dial can still reach past the stored stops while you are measuring
   them, and why 2400 µs on a channel that stops at 1823 is a measurement
   rather than a violation. */
function calDrive(ch, qus){
  const c = HW.channels()[ch]; if(!c){ HW.drive(ch, qus); return; }
  /* v1.76.0 — THE WINDOW IS THE ENGINE'S, NOT THE TABLE'S. Widening
     c.min/c.max around one HW.drive() call let pcaSetTarget() accept the
     target, and then pcaStepChannel() clamped the POSITION back to the
     stored ends on the very next tick (the comment above said it never
     re-clamped; it did, every tick). Only a never-driven channel snapped
     through — so the first turn of the dial on a fresh channel worked and
     the second did not, which read as flaky, and re-measuring a narrowed
     channel over PCA_Bridge was impossible. `st.free` is read by every clamp
     in pcaseq.js (pcaBounds) and survives a rebuild (pcaCarryState); it is
     opened here and shut by calFree(ch, false) wherever the dial leaves the
     channel. The table's own numbers are never touched. */
  calFree(ch, true);
  HW.drive(ch, qus);
}
/* open or shut the engine's window past the stored ends for one channel */
function calFree(ch, on){
  const E = (typeof HW !== 'undefined' && HW.engine) ? HW.engine() : null;
  const s = E && E.st && E.st[ch]; if(!s) return;
  const r = calRange();
  s.free = on ? {lo:r.lo, hi:r.hi} : null;
  /* shutting the window on a servo parked past the ends: bring its aim
     back inside so it RAMPS home at the channel's own speed — the position
     clamp in pcaStepChannel only runs on a channel that is still moving */
  if(!on && s.active){
    const c = HW.channels()[ch]; if(!c) return;
    const lo = Math.min(c.min,c.max), hi = Math.max(c.min,c.max);
    s.target = Math.max(lo, Math.min(hi, s.target));
    s.aim    = Math.max(lo, Math.min(hi, s.aim));
  }
}

/* THE RULE FOR THIS PANEL: setupCalRender() builds the DOM, calPaint()
   moves it. They were one function, which meant every pointermove rebuilt
   the SVG the pointer was captured on — so a drag died on its first frame
   and the dial could only be clicked. Anything that changes on every frame
   belongs in calPaint(); anything structural belongs in the shell. */
/* A channel name is whatever an imported .mstr, a servo-config .json or the
   bench's name box said it was, and this heading was building it with
   innerHTML. Its own escaper, deliberately: this file is in BOTH manifests,
   and xmlEsc() lives in maestro/boards.js which PCA Studio does not load —
   reaching for it here would throw a ReferenceError and blank the dial in
   Studio only, which is exactly the kind of bug nobody finds. (2026-08-23) */
function calEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                          .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function setupCalRender(){
  const host = $('calWrap'); if(!host) return;
  const cal = SETUP.cal;
  if(!cal){ host.innerHTML=''; return; }
  const c = HW.channels()[cal.ch];
  const range = calRange();

  host.innerHTML = '<div class="calpanel">'
    + '<div class="calhead"><b>'+calEsc(c.name||('Channel '+cal.ch))+'</b>'
    + '<span class="stat">channel '+cal.ch+' · board '+(cal.ch>>4)+' pin '+(cal.ch&15)+'</span>'
    + '<span class="sp" style="flex:1"></span>'
    /* v1.70.1 — this line used to read `safe range · 1000–2000 µs` beside a
       set of boxes that would take 2700, which is the sentence that started
       all this: it named a rule the screen did not keep. It now says what
       the screen ACTUALLY does, in both halves of the policy, and quotes
       the bands rather than spelling them out again. */
    + (setupAdv()
        ? '<label class="tiny" title="Only after you know the linkage will not bind. A horn driven into a hard stop at full travel strips gears. Typed ends are warned past '+pwBandUs(PW_STD)+' either way, and refused past '+pwBandUs(PW_ABS)+'."><input type="checkbox" id="calWide"'+(cal.wide?' checked':'')+'> unlock full '+pwBandUs(PW_ABS)+' sweep</label>'
        : '<span class="tiny" title="The dial itself turns within '+pwBandUs(PW_STD)+', which covers almost every linkage and keeps a horn off its hard stop — tick Advanced in the header to sweep wider. A width you TYPE is taken up to '+pwBandUs(PW_ABS)+' with a warning, and refused past it.">safe sweep · '+pwBandUs(PW_STD)+' · warned to '+(PW_ABS.hi/4)+'</span>')
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
    /* WHY, WHERE THEY ARE LOOKING (v1.70.1). Directly under the three
       boxes, because a beginner who has just typed 2700 is looking at the
       box they typed it into and not at a chip above a table they have
       scrolled past. Filled by calPaint (setupEndsSay), never rebuilt, so
       being told you are wrong cannot take the caret out of the field. */
    + '<div class="pwsay off" id="calSay"></div>'
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
     same rule as calNum: never write to the one under the caret.
     v1.70.1 — the class comes from pwEndClass rather than pwClass, which
     is the same answer for the two ends and a different one for the
     centre: a centre inside 500–2500 but outside its own min–max is red,
     because it is invalid on any servo. */
  /* A REFUSED NUMBER IS STILL ON SCREEN (v1.70.1). It was not staged — that
     is what refusing it means — so it cannot be found by reading the three
     ends, and yet it is sitting in the box in front of somebody in red.
     `cal.refuse` remembers it for exactly as long as it is visible: the
     moment this repaint is allowed to overwrite that box (which it does for
     any box the caret is not in), the number is gone from the screen and
     the refusal goes with it. That is also what keeps `save servo setting`
     honest — see the button below. */
  const endBox = (id, k)=>{
    const b = $(id); if(!b) return;
    const q = cal[k];
    if(document.activeElement !== b){
      b.value = q ? (q/4).toFixed(0) : '';
      if(cal.refuse && cal.refuse.end === k) cal.refuse = null;
    }
    const held = cal.refuse && cal.refuse.end === k;
    b.className = held ? 'bad' : pwEndClass(cal, k);
    b.title = held ? cal.refuse.text : pwEndTitle(cal, k);
  };
  endBox('calLmin', 'min');
  endBox('calLmax', 'max');
  endBox('calLctr', 'home');
  /* ONE POLICY, BOTH SURFACES. The Configure panel above shows these same
     three numbers (setupChPanel says why), so it is banded from the same
     trio in the same pass — otherwise the panel would sit there in its
     render-time colours saying a number is fine while the box under it
     said it was refused, which is exactly the disagreement this release
     exists to end. The caret rule applies to those boxes too. */
  const panelBox = (k, q)=>{
    const b = document.querySelector('#chCfg [data-k="'+k+'"][data-ch="'+cal.ch+'"]'); if(!b) return;
    const end = {minUs:'min', maxUs:'max', ctrUs:'home'}[k];
    const held = cal.refuse && cal.refuse.end === end && document.activeElement === b;
    if(document.activeElement !== b) b.value = q ? (q/4).toFixed(0) : '';
    b.className = held ? 'bad' : pwEndClass(cal, end);
    b.title = held ? cal.refuse.text : pwEndTitle(cal, end);
  };
  panelBox('minUs', cal.min);
  panelBox('maxUs', cal.max);
  panelBox('ctrUs', cal.home);
  setupEndsSay(cal, cal.refuse ? cal.refuse.text : '');
  /* `save servo setting` is not offered while these three cannot be
     written. The REAL gate is in setupCalCommit — the standing rule is to
     guard the function, never the button — but a button that looks
     pressable and then refuses is its own small lie, so it says so first
     and carries the reason as its tooltip. */
  const okBtn = document.querySelector('#calWrap [data-cal=ok]');
  if(okBtn){
    /* blocked for either reason: a staged trio that cannot be written, OR a
       refused number still standing in a box. The second matters as much as
       the first — a save that succeeded while 2700 sat there in red would
       report "channel 5 saved: 1000–2000 µs" and be believed to have taken
       the 2700. Nothing is saved until the number on screen is one that
       could be. */
    const stop = pwEndsRefusal(cal) || cal.refuse;
    okBtn.disabled = !!stop;
    okBtn.title = stop ? stop.text
      : 'write these three pulse widths onto this channel and save';
  }
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
      const k = e.target.dataset.set;
      const q = Math.round((+e.target.value || 0) * 4);
      if(!q){ calPaint(); return; }
      /* ============================ REFUSED AT THE POINT OF ENTRY (v1.70.1)
         Outside 500–2500 µs the number does not go in. Not staged, not
         driven, not saved-and-flagged-afterwards: the box keeps what you
         typed so you can see the number you meant, goes red, and the strip
         under the three boxes says what is wrong and what the limits are.
         The first repaint that is allowed to touch that box — any repaint,
         once the caret has left it — puts the staged value back, because
         the number never took.

         This is the one control where the difference between refusing and
         recording matters most: `calSet` DRIVES the servo at the number,
         so accepting 2700 here would not have been a bad row in a table,
         it would have been a horn against a hard stop while you watched. */
      const no = pwEndFault(q, k)
        /* and a CENTRE has one more way to be impossible: not between its
           own two ends. Refused here rather than at the save button,
           because this is a number somebody has just asserted and the app
           must not overrule it silently — see setup-hw.js §policy. An END
           typed past the centre is the other case entirely, and is handled
           three lines down. */
        || (k === 'home' ? pwEndsRefusal(Object.assign({}, cal, {home:q})) : null);
      if(no){
        /* remembered, so `save servo setting` goes dead while the number
           is on screen (calPaint says how long that is). Deliberately NOT
           repainted here: a repaint would put the staged value back in the
           box, and a refusal that erases the number it refused leaves
           somebody staring at a value they did not type. */
        cal.refuse = {end:k, text:no.text};
        e.target.className = 'bad';
        e.target.title = no.text;
        setupEndsSay(cal, no.text);
        const okNow = document.querySelector('#calWrap [data-cal=ok]');
        if(okNow){ okNow.disabled = true; okNow.title = no.text; }
        HW.say(no.text, 'warn');
        return;
      }
      cal.refuse = null;
      cal[k] = q;
      /* the end you typed wins, and the centre comes with it rather than
         being left outside the travel it no longer belongs to */
      const follow = (k === 'home') ? 0 : pwCentreFollow(cal);
      if(follow){
        cal.home = follow;
        HW.say('centre moved to '+(follow/4).toFixed(0)+' µs — it was outside the travel you just set', 'warn');
      }
      /* a typed end outside the working range would be clamped away by
         calSet and the dial would show a number nobody typed — unlock the
         full sweep instead, which is what the value is asking for. It can
         only ever ask as far as CAL_FULL now: anything past it was refused
         above. */
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
    /* Set MIN / Set CENTER / Set MAX. The position is already inside the
       policy — calSet clamps to calRange, which IS the pair of bands — so
       a capture can never be out of band. It can still swallow the centre,
       and it is the commonest way to: you turn to the shut end and press
       Set MIN on a channel whose centre is still where it arrived. Same
       rule as a typed end (v1.70.1) — the end you pressed for wins, and
       the centre comes inside the travel rather than being stranded
       outside it. */
    if(b.dataset.cap){
      cal2.refuse = null;                 /* a capture answers the box it lands in */
      cal2[b.dataset.cap] = cal2.pos;
      if(b.dataset.cap !== 'home'){
        const f = pwCentreFollow(cal2);
        if(f){
          cal2.home = f;
          HW.say('centre moved to '+(f/4).toFixed(0)+' µs — it was outside the travel you just captured', 'warn');
        }
      }
      calPaint(); return;
    }
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
        cal3.refuse = null;               /* the stock ends answer every box */
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
      /* refused: the dial stays exactly as it is, with the reason under the
         three boxes and the button still saying no. A full setupRender()
         here would be a re-render in answer to a press that changed
         nothing, and it would take the caret with it. */
      if(!setupCalCommit()){ setupCalRender(); return; }
      setupRender();
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

