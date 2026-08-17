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
function setupStepChannels(){
  const n = setupChannels();
  const pick = SETUP.pick || (SETUP.pick = []);
  let rows = '', usable = 0, picked = 0;
  for(let i=0;i<n;i++){
    const c = HW.channels()[i];
    const on = !!(c && /^servo/i.test(c.mode));
    const sel = (i === SETUP.sel);
    const chosen = on && pick.indexOf(i) >= 0;
    if(on){ usable++; if(chosen) picked++; }
    const rev = on && c.min > c.max;
    const boot = on && !/off|ignore/i.test(c.homemode);
    /* a pulse-width cell: µs in, quarter-µs stored, banded */
    const us = (k, q)=>{
      const cls = on ? pwClass(q) : '';
      return '<td class="pw"><input type="number" data-k="'+k+'" value="'+(on&&q?(q/4).toFixed(0):'')+'"'
        + ' min="300" max="2700" step="1" class="'+cls+'"'+(on?'':' disabled')
        + ' title="'+(on&&q?pwTitle(q):'')+'"></td>';
    };
    rows += '<tr data-ch="'+i+'" class="'+(on?'on':'off')+(sel?' sel':'')+'">'
      + '<td>'+(on?'<input type="checkbox" data-k="pick"'+(chosen?' checked':'')+' title="include this channel when you apply a setting below">':'')+'</td>'
      + '<td class="pin">'+i+'</td><td class="pin">'+(i>>4)+'·'+(i&15)+'</td>'
      + '<td><input type="checkbox" data-k="use"'+(on?' checked':'')+' title="is anything plugged into this pin?"></td>'
      + '<td><input type="text" data-k="name" value="'+(c?String(c.name).replace(/"/g,'&quot;'):'')+'" placeholder="not used"'+(on?'':' disabled')+'></td>'
      + setupPartCell(i, c, on)
      + us('minUs', on?c.min:0) + us('ctrUs', on?c.home:0) + us('maxUs', on?c.max:0)
      + '<td><input type="checkbox" data-k="rev"'+(rev?' checked':'')+(on?'':' disabled')
        + ' title="the linkage runs the other way — ticking swaps this channel’s two ends, unticking puts them back"></td>'
      + '<td><input type="checkbox" data-k="boot"'+(boot?' checked':'')+(on?'':' disabled')
        + ' title="at power-up, drive to the centre above. Unticked = no pulses at all, so the servo is limp and a panel does not buzz."></td>'
      + '<td><input type="number" data-k="speed" value="'+(on?c.speed:0)+'" min="0" max="16000"'+(on?'':' disabled')+'></td>'
      + '<td><input type="number" data-k="acceleration" value="'+(on?c.acceleration:0)+'" min="0" max="255"'+(on?'':' disabled')+'></td>'
      + '<td><select data-k="ease"'+(on?'':' disabled')+' title="'+EASE_TIP+'">'
        + EASE_KINDS.map(x=>'<option value="'+x.id+'"'+((on&&(c.ease||'none')===x.id)?' selected':'')
            + ' title="'+x.hint+'">'+x.id+'</option>').join('')
        + '</select></td>'
      + '<td><label class="tiny"><input type="checkbox" data-k="sleep"'+((on&&c.releaseMs)?' checked':'')+(on?'':' disabled')
        + ' title="stop pulsing once it has settled — silent, cool, no current"> after '
        + '<input type="number" data-k="sleepMs" value="'+((on&&c.releaseMs)||1200)+'" min="100" max="60000" step="100"'+((on&&c.releaseMs)?'':' disabled')+'> ms</label></td>'
      + '<td><button class="mini" data-k="cal"'+(on?'':' disabled')+' title="drive this servo with a dial and set its ends, its centre and its direction against the real linkage">configure…</button></td>'
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
    + '<p class="setp">Tick a pin, name it, then set its three pulse widths — type them here, or press '
    + '<b>configure…</b> to drive the servo with a dial and record where it actually stops. '
    + '<b>Centre</b> is also where the channel goes at power-up, if <b>boot</b> is ticked; unticked it stays limp. '
    + 'Speed and acceleration are the Maestro’s units: speed in 0.25 µs per 10 ms, acceleration per 80 ms, '
    + 'and <b>0 means unlimited</b>, which on a panel means it slams.</p>'
    + '<p class="setp"><b>Ease</b> is the shape of a move, not its speed. '
    + '<b>none</b> is the plain one — get up to speed, hold it, stop dead on the number. '
    + '<b>soft</b> brings the acceleration itself in over the first 80 ms, so the part breathes into motion '
    + 'instead of jerking off the mark; kindest to a long linkage or a heavy panel. '
    + '<b>overshoot</b> deliberately aims about a twelfth of the way past the target and settles back, '
    + 'which is what makes a pie panel read as <i>snapping</i> open rather than arriving. It only does it on '
    + 'moves worth more than an eighth of the channel’s travel, and never past your endpoints — so a brick '
    + 'that already drives to MIN or MAX looks identical to <b>none</b>.</p>'
    + '<div class="setrow"><button class="mini" data-act="allon">tick all</button>'
    + '<button class="mini" data-act="alloff">untick all</button>'
    + '<span class="stat" id="setChCount"></span>'
    + flag + '</div>'
    + '<div class="setscroll"><table class="settab chtab">'
    + '<tr><th><input type="checkbox" data-k="pickall"'+(picked && picked===usable?' checked':'')+' title="select every channel in use"></th>'
    + '<th>#</th><th>board·pin</th><th>use</th><th>name</th>'
    + (setupParts().length ? '<th title="which panel, door or arm this channel actually moves on the droid">drives</th>' : '')
    /* the unit is wrapped because the header's text-transform:uppercase
       turns µ into Greek capital Mu — "MIN ΜS", which reads as milliseconds */
    + '<th title="the pulse width at one end of the travel">min <span class="u">µs</span></th>'
    + '<th title="the pulse width it rests at — and goes to at power-up when boot is ticked">centre <span class="u">µs</span></th>'
    + '<th title="the pulse width at the other end of the travel">max <span class="u">µs</span></th>'
    + '<th title="tick if the linkage runs the other way">rev</th>'
    + '<th title="go to centre at power-up, or stay limp">boot</th>'
    + '<th>speed</th><th>accel</th><th>ease</th><th>sleep when idle</th><th></th></tr>'
    + rows + '</table></div>'
    + '<div class="setrow applybar">'
    + '<span class="stat">Apply</span><select id="apField">'
    + SETUP_APPLY.map(x=>'<option value="'+x.k+'"'+(x.k===f.k?' selected':'')+'>'+x.label+'</option>').join('')
    + '</select><span class="stat">=</span>'+control
    /* NOT data-act="apply" — that is the wizard's own "Build my project"
       action on #setupWrap, and this click bubbles all the way up to it.
       Sharing the name closed the whole wizard instead. */
    + '<button class="mini" data-act="applysel"'+(picked?'':' disabled')+'>apply to '+picked+' selected…</button>'
    + '<span class="stat">'+(picked ? '' : 'tick the left-hand column to choose which channels')+'</span>'
    + '</div>'
    + setupAskHtml('table')
    + '<div id="calWrap"></div>';
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
    if(b.dataset.act === 'expjson'){
      download('servo-setup.json', setupJson(), 'application/json');
      HW.say('setup exported — boards, wiring answers and every channel'); return;
    }
    if(b.dataset.act === 'exph'){
      download('servos.h', setupServosH(), 'text/x-c');
      HW.say('servos.h exported — the channel table alone. Endpoints are yours; regenerate it whenever you recalibrate, not when you change a sequence.','warn');
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

    const tr = e.target.closest('tr[data-ch]'); if(!tr) return;
    const i = +tr.dataset.ch, k = e.target.dataset.k, c = setupEnsure(i);
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
         of step with the numbers beside it. */
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
      if(k === 'minUs') c.min = q; else if(k === 'maxUs') c.max = q; else c.home = q;
      /* band the cell as you type, without rebuilding the input under the
         caret — the dial learned this lesson the hard way (v0.7.1) */
      e.target.className = pwClass(q);
      e.target.title = pwTitle(q);
      HW.rebuild(true);
    }
    else if(k === 'sleep'){ c.releaseMs = e.target.checked ? (+tr.querySelector('[data-k=sleepMs]').value|0) || 1200 : 0; setupRender(); return; }
    else if(k === 'sleepMs') c.releaseMs = (+e.target.value|0);
    else if(k === 'ease'){ c.ease = e.target.value; HW.rebuild(true); }
    else c[k] = (+e.target.value|0);
    HW.save();
  };
  body.onclick = e=>{
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
    const tr = e.target.closest('tr[data-ch]'); if(!tr) return;
    const i = +tr.dataset.ch;
    if(b.dataset.k === 'cal'){ SETUP.sel = i; setupAskClear(); setupCalOpen(i); }
  };
}

