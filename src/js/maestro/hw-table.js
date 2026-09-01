'use strict';
/* =====================================================================
   HW TABLE — the live channel table, shared by the sim and PCA Studio

   One row per channel: what it is called, its three pulse widths, which
   way round it runs, what it does at power-up, and the four numbers the
   engine moves it with — plus a slider you drag to drive it and a bar
   showing where it actually IS. With a board connected that bar is the
   servo; without one it is the engine's model of the servo, which is the
   same arithmetic the co-processor will run.

   Everything host-specific goes through HW (see hw-host.js). This file
   knows nothing about MSTR, PROJ, the 3D droid or Web Serial.

   ------------------------------------------------------------- the units
   min, max and home are MICROSECONDS here, and quarter-µs underneath.
   That is not a preference: the dial speaks µs, servo datasheets speak µs,
   and the two warning bands are about µs. Quarter-µs is the wire unit and
   lives in the tooltip. Two tables in one app disagreeing about the unit
   reads as a fault at the bench, which is why this one is shared.

   ------------------------------------------------------------- reversing
   A reversed linkage IS min and max the other way round. There is no
   stored invert flag and there does not need to be — every consumer takes
   Math.min/Math.max of the pair — so the tick is drawn from `min > max`
   and can never disagree with the two numbers beside it.
   ===================================================================== */

/* which channels the table shows. Studio shows all of them; the sim has
   24 or 32 rows and a real reason to hide the ones nothing is wired to. */
const HWT = { only:'used' };      /* 'used' | 'all' */

function hwTableRows(){
  const n = HW.count(), out = [];
  for(let i=0;i<n;i++){
    const c = HW.channels()[i];
    if(!c) continue;
    if(HWT.only === 'used' && !/^servo/i.test(c.mode||'')) continue;
    out.push(i);
  }
  return out;
}

/* a pulse-width cell: µs in, quarter-µs stored, banded amber/red. The box's
   own min/max are the policy's hard band (servo-units.js PW_ABS), not a
   looser pair of its own (v1.76.0). */
function hwPwCell(f, q){
  return '<td class="pw"><input type="number" data-f="'+f+'" value="'+(q?(q/4).toFixed(0):'')
    + '" min="'+(PW_ABS.lo/4)+'" max="'+(PW_ABS.hi/4)+'" step="1" class="'+pwClass(q)+'" title="'+(q?pwTitle(q):'')+'"></td>';
}

function hwTableHtml(){
  let h = '<tr><th>#</th><th>board·pin</th><th>name</th>'
    + '<th title="the pulse width at one end of the travel">min <span class="u">µs</span></th>'
    + '<th title="the pulse width at the other end of the travel">max <span class="u">µs</span></th>'
    + '<th title="the pulse width it rests at — and goes to at power-up when boot is on">home <span class="u">µs</span></th>'
    + '<th title="tick if the linkage runs the other way — it swaps the two ends">rev</th>'
    + '<th title="drive to home at power-up, or stay limp">boot</th><th>speed</th><th>accel</th>'
    + '<th title="Stop pulsing this long after arriving — silent, cool, no current. Only for parts that rest in place on their own.">release</th>'
    + '<th title="'+EASE_TIP+'">ease</th><th>drive</th><th>position</th>'
    + '<th><span class="u">µs</span></th><th></th></tr>';
  hwTableRows().forEach(i=>{
    const c = HW.channels()[i];
    const off = /off|ignore/i.test(c.homemode||'');
    h += '<tr data-ch="'+i+'">'
      + '<td class="pin">'+i+'</td>'
      + '<td class="pin">'+(i>>4)+'·'+(i&15)+'</td>'
      + '<td><input type="text" class="chname" data-f="name" value="'+String(c.name||'').replace(/"/g,'&quot;')+'"></td>'
      + hwPwCell('min', c.min) + hwPwCell('max', c.max)
      /* home is editable whatever boot says: boot decides whether the
         channel is DRIVEN there at power-up, not whether you may choose
         where "there" is */
      + hwPwCell('home', c.home)
      + '<td><input type="checkbox" data-f="rev"'+(c.min>c.max?' checked':'')
        + ' title="the linkage runs the other way — ticking swaps this channel’s two ends, unticking puts them back"></td>'
      + '<td><label title="off = no pulses at power-up (panels don\'t buzz)"><input type="checkbox" data-f="boot" '+(off?'checked':'')+'> off</label></td>'
      + '<td><input type="number" data-f="speed" value="'+(c.speed|0)+'" min="0" max="16000" style="width:52px"></td>'
      + '<td><input type="number" data-f="acceleration" value="'+(c.acceleration|0)+'" min="0" max="255" style="width:46px"></td>'
      + '<td><input type="number" data-f="releaseMs" value="'+(c.releaseMs||0)+'" min="0" max="60000" step="100" style="width:58px" title="0 = hold forever"></td>'
      + '<td><select data-f="ease" title="'+EASE_TIP+'">'
        + EASE_KINDS.map(x=>'<option value="'+x.id+'"'+((c.ease||'none')===x.id?' selected':'')
          + ' title="'+x.hint+'">'+x.id+'</option>').join('')
        + '</select></td>'
      + '<td><input type="range" data-f="slider" min="'+Math.min(c.min,c.max)+'" max="'+Math.max(c.min,c.max)+'" value="'+(c.home||Math.min(c.min,c.max))+'" style="width:130px"></td>'
      + '<td><div class="poswrap" id="pw'+i+'"><div class="postick" id="pt'+i+'"></div><div class="posbar" id="pb'+i+'"></div></div></td>'
      + '<td><span class="us" id="us'+i+'"></span></td>'
      + '<td><button class="mini" data-f="off" title="stop pulses">off</button> '
        + '<button class="mini" data-f="lo">min</button> '
        + '<button class="mini" data-f="mid">mid</button> '
        + '<button class="mini" data-f="hi">max</button></td>'
      + '</tr>';
  });
  return h;
}

/* build into whatever element the host gives us */
function hwTableBuild(hostId){
  const t = document.getElementById(hostId || 'chTable'); if(!t) return;
  t.innerHTML = hwTableHtml();
  t.oninput = e=>{
    const tr = e.target.closest('tr[data-ch]'); if(!tr) return;
    const i = +tr.dataset.ch, f = e.target.dataset.f, c = HW.ensure(i);
    if(f === 'slider'){ HW.drive(i, +e.target.value); return; }
    if(f === 'name'){ c.name = e.target.value; HW.save(); HW.changed(); return; }
    if(f === 'boot'){ c.homemode = e.target.checked ? 'Off' : 'Goto'; hwTableBuild(hostId); HW.changed(); HW.save(); return; }
    if(f === 'rev'){
      const t2 = c.min; c.min = c.max; c.max = t2;
      hwTableBuild(hostId); HW.changed(); HW.save();
      HW.say('channel '+i+' '+(c.min>c.max?'reversed':'back to normal')
             + ' — '+(c.min/4).toFixed(0)+' → '+(c.max/4).toFixed(0)+' µs');
      return;
    }
    if(f === 'ease'){ c.ease = e.target.value; HW.changed(); HW.save(); return; }
    if(f === 'min' || f === 'max' || f === 'home'){
      const q = Math.round((+e.target.value||0)*4);        /* µs in, quarter-µs stored */
      /* ============================ REFUSED AT THE POINT OF ENTRY (v1.76.0)
         The rule the bench's own Configure panel has had since v1.70.1, in
         the one table that did not: outside 500–2500 µs the number is not
         written, and a centre outside its own two ends is not written. The
         box keeps the number so you can see what you meant and goes red.

         This handler is `oninput`, and this row is wired to the engine
         whose onWrite is the wire — so typing 1500 here used to write 1 µs,
         then 15, then 150 to a real servo, one keystroke apart, before it
         wrote 1500. A three-digit prefix of any four-digit width is under
         500, which is exactly why the hard band is the guard. */
      const now = {min:c.min, max:c.max, home:c.home};
      const no = (typeof pwEndFault === 'function' && pwEndFault(q, f))
        || (f === 'home' && typeof pwEndsRefusal === 'function'
            ? pwEndsRefusal(Object.assign({}, now, {home:q})) : null);
      if(no){
        e.target.className = 'bad';
        e.target.title = no.text;
        return;
      }
      c[f] = q;
      /* an end drags its centre inside the travel rather than stranding it
         there — the same rule, and the same words, as the bench */
      if(f !== 'home' && typeof pwCentreFollow === 'function'){
        const follow = pwCentreFollow({min:c.min, max:c.max, home:c.home});
        if(follow){ c.home = follow; HW.say('centre moved to '+(follow/4).toFixed(0)+' µs — it was outside the travel you just set', 'warn'); }
      }
      /* band the cell as you type WITHOUT rebuilding the input under the
         caret — the calibration dial learned this one the hard way */
      e.target.className = pwClass(c[f]);
      e.target.title = c[f] ? pwTitle(c[f]) : '';
      HW.changed(); HW.save();
      if(f !== 'home'){
        const s = tr.querySelector('[data-f=slider]');
        s.min = Math.min(c.min,c.max); s.max = Math.max(c.min,c.max);
      }
      return;
    }
    if(['speed','acceleration','releaseMs'].indexOf(f) >= 0){
      c[f] = +e.target.value|0; HW.changed(); HW.save();
    }
  };
  t.onclick = e=>{
    const b = e.target.closest('button'); if(!b) return;
    const tr = e.target.closest('tr[data-ch]'); if(!tr) return;
    const i = +tr.dataset.ch, c = HW.channels()[i]; if(!c) return;
    const lo = Math.min(c.min,c.max), hi = Math.max(c.min,c.max);
    const f = b.dataset.f;
    if(f === 'off') HW.drive(i, 0);
    if(f === 'lo')  HW.drive(i, lo);
    if(f === 'mid') HW.drive(i, (lo+hi)>>1);
    if(f === 'hi')  HW.drive(i, hi);
  };
}

/* the moving parts: position bar, target tick, µs readout. Called from
   whatever clock the host runs — never rebuilds the DOM, so a slider stays
   under the pointer while it is being dragged. */
function hwTableSync(){
  const E = HW.engine(); if(!E) return;
  hwTableRows().forEach(i=>{
    const c = HW.channels()[i], s = E.st[i];
    if(!c || !s) return;
    const wrap = document.getElementById('pw'+i); if(!wrap) return;
    const bar = document.getElementById('pb'+i), tick = document.getElementById('pt'+i),
          us = document.getElementById('us'+i);
    const lo = Math.min(c.min,c.max), hi = Math.max(c.min,c.max);
    const span = (hi - lo) || 1;
    const q = pcaPos(E, i);
    wrap.classList.toggle('posoff', !s.active);
    bar.style.width = s.active ? ((q-lo)/span*100).toFixed(1)+'%' : '0%';
    tick.style.left = s.active ? ((s.target-lo)/span*100).toFixed(1)+'%' : '0%';
    tick.style.display = s.active ? 'block' : 'none';
    if(us) us.textContent = q ? (q/4).toFixed(0)+' µs' : '— off';
  });
  /* v1.45.0 — the fold-in. The setup bench grew this table's live half
     (drive / position / move) when the duplicate #hwWrap surface was folded
     into it, and those cells need exactly the same heartbeat: one pass per
     frame, never a DOM rebuild. It is called from here rather than given a
     clock of its own because "whatever clock the host runs" already arrives
     at this function (hw-host.js's hwTick) and two clocks for one engine is
     the ripple v1.31.1 fixed. Guarded — a host may load this file without
     the bench (and Studio's own page table is the caller above). */
  if(typeof setupLiveSync === 'function') setupLiveSync();
}
