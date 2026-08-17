'use strict';
/* =====================================================================
   IMPORT YOUR CONFIG — the guided route from a real board to a working
   settings file.

   The premise is that the user's own .mstr is the AUTHORITY. Their channel
   names, endpoints, home modes, speeds and accelerations were tuned against
   real linkages and are not ours to touch — Mike, 2026-07-29: "the servo
   names and servo end points have all been setup and should not change".
   So the wizard never rewrites the channel table. It reads it, works out
   what each channel drives, tells the user what is wrong with the file it
   found, and then lets them build sequences on top.

   Five steps:
     1 file      drop or pick the .mstr saved from Control Center
     2 found     what the file actually is, including whether the script it
                 carries could ever have answered restartScript()
     3 map       channel -> droid part, auto-matched, hand-correctable
     4 check     the full lint report
     5 done      into the sequencer, or straight to export

   The step that earns its keep is 2. Everything in it is invisible in
   Control Center: a script copied with the singular command looks fine on
   screen and cannot work on the bench.
   ===================================================================== */

const IMPWIZ = { open:false, step:1, err:'', pre:null, sel:-1, hover:'' };

/* Esc closes the wizard (Stage-4 pickup — this overlay had NO keydown
   handling at all). Document CAPTURE + stopPropagation, the app dialog's
   containment, via escGuard (core/dialog.js): the key must not fall
   through to the gamepad mapper or the setup wizard underneath. When a
   .dlgwrap IS up, the dialog is above this overlay and its own capture
   handler owns Esc — stand aside so one press closes the dialog, the
   next one the wizard. */
const impwizEsc = escGuard(()=> !document.querySelector('.dlgwrap'), impwizClose);
function impwizOpen(){
  IMPWIZ.open = true;
  IMPWIZ.step = MSTR.loaded ? 2 : 1;
  IMPWIZ.err  = '';
  impwizEsc.bind();
  impwizRender();
}
function impwizClose(){
  IMPWIZ.open = false;
  impwizEsc.unbind();
  const h = $('impWiz'); if(h){ h.hidden = true; h.innerHTML=''; }
  if(typeof rebuildMaestroUI==='function') rebuildMaestroUI();
}
function impwizGo(n){
  IMPWIZ.step = Math.max(1, Math.min(5, n));
  impwizRender();
}

/* Read a file into the wizard rather than into the sidebar, so a bad file
   leaves the previous import untouched. */
function impwizRead(file){
  const fr = new FileReader();
  fr.onload = async ()=>{
    try{
      const P = mstrParse(String(fr.result), file.name);
      /* the wizard is the guided "import your config" path — but the same
         sharing rule holds: with a config already loaded, offer to take
         just the sequences (retargeted onto YOUR servo settings) and skip
         the wizard entirely, since there is then no config to walk through */
      if(MSTR.loaded && typeof mstrImportChoice === 'function'){
        const did = await mstrImportChoice(P);
        if(did === 'cancel'){ IMPWIZ.err=''; impwizRender(); return; }
        if(did === 'seq'){
          impwizClose();
          toast('Adopted '+P.sequences.length+' sequence(s) from '+file.name+' — playing through YOUR servo settings');
          return;
        }
      }else{
        mstrApply(P);
      }
      CFG.maestroSource = 'imported';
      IMPWIZ.err = '';
      IMPWIZ.pre = JSON.parse(JSON.stringify(MSTR.report || {}));
      impwizGo(2);
    }catch(e){
      IMPWIZ.err = e.message;
      lg('warn','import failed: '+e.message);
      impwizRender();
    }
  };
  fr.onerror = ()=>{ IMPWIZ.err = 'could not read that file'; impwizRender(); };
  fr.readAsText(file);
}

/* ------------------------------------------------------------ rendering */
function impwizRender(){
  const host = $('impWiz'); if(!host) return;
  if(!IMPWIZ.open){ host.hidden = true; return; }
  host.hidden = false;
  host.innerHTML = '';

  const card = el('div','iwcard');
  const head = el('div','iwhead');
  head.appendChild(el('h2', null, 'Import your config'));
  const sub = el('div','iwsub', MSTR.loaded ? MSTR.fileName : 'the settings file you saved from Maestro Control Center');
  head.appendChild(sub);
  const x = el('button','iwx','×'); x.title='close'; x.addEventListener('click',impwizClose);
  head.appendChild(x);
  card.appendChild(head);

  const steps = el('div','iwsteps');
  ['File','Found','Map','Check','Done'].forEach((label,i)=>{
    const n = i+1;
    const d = el('div','iwstep'+(n===IMPWIZ.step?' on':'')+(n<IMPWIZ.step?' done':''));
    d.appendChild(el('span','iwn', n));
    d.appendChild(el('span',null,label));
    if(MSTR.loaded || n===1) d.addEventListener('click',()=>impwizGo(n));
    steps.appendChild(d);
  });
  card.appendChild(steps);

  const body = el('div','iwbody');
  ({1:impwizStepFile, 2:impwizStepFound, 3:impwizStepMap,
    4:impwizStepCheck, 5:impwizStepDone}[IMPWIZ.step])(body);
  card.appendChild(body);

  const foot = el('div','iwfoot');
  if(IMPWIZ.step > 1){
    const b = el('button','b','← Back');
    b.addEventListener('click',()=>impwizGo(IMPWIZ.step-1));
    foot.appendChild(b);
  }
  foot.appendChild(el('div','iwgap'));
  if(IMPWIZ.step < 5 && MSTR.loaded){
    const n = el('button','b prim', IMPWIZ.step===4 ? 'Finish →' : 'Next →');
    n.addEventListener('click',()=>impwizGo(IMPWIZ.step+1));
    foot.appendChild(n);
  }
  card.appendChild(foot);
  host.appendChild(card);
}

/* -------------------------------------------------------------- step 1 */
function impwizStepFile(host){
  const p = el('p','iwp');
  p.innerHTML = 'In Maestro Control Center: <b>File ▸ Save settings file</b>, then bring it here. '+
    'Everything in it stays yours — the sim reads your channel names, endpoints, home modes, '+
    'speeds and accelerations and never writes over them.';
  host.appendChild(p);

  const drop = el('div','iwdrop');
  drop.innerHTML = '<b>Drop your .mstr here</b><span>or click to choose a file</span>';
  const fin = document.createElement('input');
  fin.type='file'; fin.accept='.mstr,.xml,text/xml'; fin.style.display='none';
  fin.addEventListener('change',()=>{ if(fin.files[0]) impwizRead(fin.files[0]); fin.value=''; });
  drop.addEventListener('click',()=>fin.click());
  drop.addEventListener('dragover',e=>{ e.preventDefault(); e.stopPropagation(); drop.classList.add('on'); });
  drop.addEventListener('dragleave',()=>drop.classList.remove('on'));
  drop.addEventListener('drop',e=>{
    e.preventDefault(); e.stopPropagation(); drop.classList.remove('on');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if(f) impwizRead(f);
  });
  host.appendChild(drop); host.appendChild(fin);

  if(IMPWIZ.err){
    const n = el('div','note rd');
    n.innerHTML = '<b>Could not read that file.</b> '+xmlEsc(IMPWIZ.err)+
      '<br><span class="iwdim">If Control Center itself refuses the file with '+
      '“Data at the root level is invalid, line 1 position 1”, check you picked the '+
      '<b>.mstr</b> and not an .html or .txt sitting next to it — that message is what '+
      '.NET says when the first character is not XML.</span>';
    host.appendChild(n);
  }

  const alt = el('div','iwalt');
  alt.innerHTML = '<b>No file yet?</b> Build one from a starter layout instead — '+
    'Body, Dome or Frik head, on the Maestro tab. You can come back here once you have '+
    'saved a real file off the board.';
  host.appendChild(alt);

  const n2 = el('div','note cy');
  n2.innerHTML = '<b>Sequences live in the Windows registry, not on the Maestro.</b> '+
    'They only reach a file when you <i>Save settings file</i>, and only reach the board via '+
    '<b>Copy all Sequences to Script</b>. If your file has a script but no <b>&lt;Sequences&gt;</b>, '+
    'the sim rebuilds the timelines by decoding the <b>sub</b> blocks.';
  host.appendChild(n2);
}

/* -------------------------------------------------------------- step 2 */
function impwizStepFound(host){
  const r = MSTR.report || {};
  const bd = boardById(MSTR.board);
  const servos = MSTR.channels.filter(c=>/^servo/i.test(c.mode)).length;

  const grid = el('div','iwgrid');
  const fact = (k,v,t)=>{ const d=el('div','iwfact'); d.appendChild(el('div','k',k));
    d.appendChild(el('div','v',v)); if(t) d.title=t; grid.appendChild(d); };
  fact('Board', bd.label, bd.product);
  fact('Channels', servos+' servo'+(r.nonServo&&r.nonServo.length?' · '+r.nonServo.length+' other':''),
       'channels set to Input or Output emit no pulses');
  fact('Sequences', String(MSTR.sequences.length) + (r.seqRecovered? ' ('+r.seqRecovered+' rebuilt)' : ''),
       r.seqRecovered ? 'rebuilt by decoding the script, because the file carried no <Sequences> for them' : '');
  fact('On the board', String((r.seqSubs||[]).length)+' subroutine'+((r.seqSubs||[]).length===1?'':'s'),
       'what restartScript(n) can actually reach');
  fact('Serial', (MSTR.header.SerialMode||'?').replace(/_/g,' ').toLowerCase()+' @ '+(MSTR.header.FixedBaudRate||'?'),
       'the sketches expect a fixed 9600 baud UART');
  fact('Device', String(MSTR.header.SerialDeviceNumber||'—'),'');
  host.appendChild(grid);

  /* the part the user cannot see in Control Center */
  const bad = [];
  if(r.scriptEmpty)
    bad.push(['The file carries no script at all.',
      'Nothing is on the board. Whatever sequences the file lists exist only on the PC — the Maestro itself has nothing to run. The sim will generate a proper script for you on export.']);
  if(r.scriptLoop)
    bad.push(['The script is a begin/repeat loop with no subroutine wrapping it.',
      'That is what “Copy Sequence to Script” (singular) produces. restartScript(0) then lands on the first frame_* helper and faults with 0x0080, so no button on the controller does anything. Only the one selected sequence was ever copied.']);
  if(r.scriptFallThrough)
    bad.push(['The script has no top-level quit, so it falls through into “'+((r.seqSubs||[])[0]||'the first sequence')+'”.',
      'Pressing Run Script in Control Center performs that sequence and then returns with an empty call stack — error 0x0080. The exported file fixes this with one bare quit.']);
  if(r.dupNames && r.dupNames.length)
    bad.push(['Channels '+r.dupNames.join(', ')+' share a name with another channel.',
      'Ambiguous everywhere — the wiring sheet, the part map, and any sequence written by name. Worth renaming one in Control Center.']);
  if(r.blankNames)
    bad.push([r.blankNames+' servo channel(s) have no name.',
      'They still work, but the name matcher has nothing to read, so you will have to map them by hand on the next step.']);

  if(bad.length){
    const h = el('div','iwh','What is wrong with it');
    host.appendChild(h);
    bad.forEach(([t,d])=>{
      const n = el('div','note am');
      n.innerHTML = '<b>'+t+'</b><br><span class="iwdim">'+d+'</span>';
      host.appendChild(n);
    });
  }else{
    const n = el('div','note gn');
    n.innerHTML = '<b>The script on this board looks sound.</b> '+
      (r.seqSubs||[]).length+' sequence subroutine(s), a top-level quit, and no begin/repeat loop.';
    host.appendChild(n);
  }

  if((r.seqSubs||[]).length){
    const h2 = el('div','iwh','What the sketch can fire');
    host.appendChild(h2);
    const tbl = el('div','iwslots');
    (r.seqSubs||[]).forEach((nm,i)=>{
      const d = el('div','iwslot'+(i>7?' over':''));
      d.appendChild(el('span','ix','restartScript('+i+')'));
      d.appendChild(el('span',null,nm));
      if(i>7) d.title = 'past slot 7 — on the board, but no stock button combo reaches it';
      tbl.appendChild(d);
    });
    host.appendChild(tbl);
  }
}

/* -------------------------------------------------------------- step 3 */
/* first channel with no part yet — where the click-to-place flow starts and
   what it advances to after each assignment */
function impwizNextUnmapped(from){
  const ch = MSTR.channels;
  for(let k=1;k<=ch.length;k++){
    const c = ch[(Math.max(0,from)+k) % ch.length];
    if(/^servo/i.test(c.mode) && !c.act) return c.i;
  }
  return -1;
}
function impwizSelect(i){ IMPWIZ.sel = i; impwizRender(); }

function impwizStepMap(host){
  const servos = MSTR.channels.filter(c=>/^servo/i.test(c.mode));
  const mapped = servos.filter(c=>c.act).length;
  if(IMPWIZ.sel < 0 || !MSTR.channels[IMPWIZ.sel] || !/^servo/i.test(MSTR.channels[IMPWIZ.sel].mode))
    IMPWIZ.sel = impwizNextUnmapped(-1);

  const p = el('p','iwp');
  p.innerHTML = 'Names were matched automatically, including the Printed Droid shorthand — '+
    '<b>PP5</b>, <b>P11</b> and <b>HP1-1</b> resolve to a pie, a side panel and a holoprojector axis. '+
    'To fix one: <b>pick the channel, then click where it is on the dome.</b> '+
    'None of this changes your endpoints.';
  host.appendChild(p);

  const split = el('div','iwsplit');

  /* ---- the diagram ---- */
  const left = el('div','iwdome');
  const sel = IMPWIZ.sel>=0 ? MSTR.channels[IMPWIZ.sel] : null;
  const cue = el('div','iwcue');
  cue.innerHTML = sel
    ? 'Placing <b>ch '+sel.i+' · '+xmlEsc(sel.name)+'</b> — click its panel'
    : 'Every channel is placed. Click a channel below to move it.';
  left.appendChild(cue);
  buildDomeMap(left, {
    channels: MSTR.channels,
    selected: IMPWIZ.sel,
    hoverKey: IMPWIZ.hover,
    onPick: (key)=>{
      if(IMPWIZ.sel < 0) return;
      MSTR.channels[IMPWIZ.sel].act = key;
      IMPWIZ.sel = impwizNextUnmapped(IMPWIZ.sel);
      impwizRender();
    }
  });
  const key = el('div','iwkey');
  key.innerHTML = '<span class="k has"></span>mapped <span class="k dup"></span>two channels'+
                  ' <span class="k lit"></span>lighting on the reference <span class="k"></span>free';
  left.appendChild(key);
  split.appendChild(left);

  /* ---- the channel list ---- */
  const right = el('div','iwchans');
  const bar = el('div','conbar');
  const bAuto = el('button','b','Re-match by name');
  bAuto.addEventListener('click',()=>{
    MSTR.channels.forEach(c=>{ const g=guessPart(c.name); if(g) c.act=g; });
    IMPWIZ.sel = impwizNextUnmapped(-1); impwizRender();
  });
  const bClear = el('button','b','Clear all');
  bClear.addEventListener('click',()=>{ MSTR.channels.forEach(c=>c.act=''); IMPWIZ.sel=impwizNextUnmapped(-1); impwizRender(); });
  bar.appendChild(bAuto); bar.appendChild(bClear);
  right.appendChild(bar);

  const tally = el('div','iwtally');
  tally.innerHTML = '<b>'+mapped+'</b> of '+servos.length+' channels placed.';
  right.appendChild(tally);

  const tbl = el('div','iwmap');
  servos.forEach(c=>{
    const r = el('div','iwmaprow'+(c.act?'':' un')+(c.i===IMPWIZ.sel?' sel':''));
    r.addEventListener('mouseenter',()=>{
      if(IMPWIZ.hover===c.act) return;
      IMPWIZ.hover = c.act; impwizRender();
    });
    r.appendChild(el('span','ix', c.i));
    const nm = el('span','nm', c.name || '(unnamed)');
    nm.title = c.min+'\u2013'+c.max+' qus \u00b7 '+qus(c.min)+'\u2013'+qus(c.max)+
               ' \u00b7 full throw '+Math.round(chanFullThrowMs(c))+' ms at speed '+c.speed+' / accel '+c.acceleration+
               '\n\nclick to place this channel on the dome';
    nm.addEventListener('click',()=>impwizSelect(c.i));
    r.appendChild(nm);

    /* the dropdown stays: body doors, arms and the head are not on a dome
       diagram, and some boards are all body */
    const selEl = document.createElement('select');
    PART_LIST.forEach(([label,k])=>{
      const o=document.createElement('option'); o.value=k;
      o.textContent = (typeof actLabel==='function') ? actLabel(label,k) : label;
      if(c.act===k) o.selected=true; selEl.appendChild(o);
    });
    selEl.addEventListener('change',()=>{ c.act=selEl.value; impwizRender(); });
    r.appendChild(selEl);

    /* the test slider only exists once it drives a real part — a disabled
       slider on an unplaced channel had no user value (spec, 2026-07-29) */
    if(c.act){
      const sl = document.createElement('input');
      sl.type='range'; sl.min=Math.min(c.min,c.max); sl.max=Math.max(c.min,c.max); sl.step=4;
      sl.value = EDIT.live[c.i]!==undefined ? EDIT.live[c.i] : c.home;
      sl.title = 'drag and the mapped part moves on the model';
      sl.addEventListener('input',()=>{
        const v=+sl.value; EDIT.live[c.i]=v;
        ACT_T[c.act]=chanNorm(c,v);
      });
      r.appendChild(sl);
    }else{
      const ph = el('span','iwdim','place it to test it');
      ph.style.cssText='font-size:9px;align-self:center';
      r.appendChild(ph);
    }

    const warn = (typeof pdPanelWarning==='function') ? pdPanelWarning(c.name) : '';
    const flag = el('span','fl', warn ? '?' : (c.act && !domeMapCovers(c.act) ? '\u25aa' : ''));
    if(warn) flag.title = warn;
    else if(c.act && !domeMapCovers(c.act)) flag.title = 'not a dome part, so it is not on the diagram — set it with the dropdown';
    r.appendChild(flag);

    tbl.appendChild(r);
  });
  right.appendChild(tbl);
  split.appendChild(right);
  host.appendChild(split);

  const offDome = servos.filter(c=>c.act && !domeMapCovers(c.act)).length;
  const h = el('div','hint');
  h.innerHTML = 'Not sure which panel a channel opens? Drag its slider and watch the model \u2014 then, at the bench, '+
    'sweep the same channel in Control Center and see which one moves. '+
    'A <b>?</b> means Printed Droid lists that panel as lighting rather than a servo; plenty of builds differ, so it is a question, not an error.'+
    (offDome ? ' <b>'+offDome+'</b> channel(s) drive body or head parts, which a dome diagram cannot show \u2014 those stay on the dropdown.' : '');
  host.appendChild(h);
}

/* -------------------------------------------------------------- step 4 */
function impwizStepCheck(host){
  if(typeof reindexSubs==='function') reindexSubs();
  const rep = lintMaestro();

  const grid = el('div','iwgrid');
  const fact = (k,v,t)=>{ const d=el('div','iwfact'); d.appendChild(el('div','k',k));
    d.appendChild(el('div','v',v)); if(t) d.title=t; grid.appendChild(d); };
  fact('Errors', String(rep.counts.err), 'this will not work on the board');
  fact('Warnings', String(rep.counts.warn), 'it will run, but not the way you meant');
  fact('Script', rep.stats.bytes+' / '+rep.stats.scriptMax+' bytes', 'estimate — Control Center is authoritative');
  fact('Subroutines', rep.stats.subs+' / 126','');
  fact('Slots used', String(rep.stats.loadout), 'the sketches reach 0–7');
  fact('Slowest throw', rep.stats.slowestThrowMs+' ms', 'a full endpoint-to-endpoint move at your speed and acceleration settings');
  host.appendChild(grid);

  if(!rep.items.length){
    const n = el('div','note gn');
    n.innerHTML = '<b>Nothing to flag.</b> Channels, sequences and script all check out.';
    host.appendChild(n);
  }
  const cls = {err:'rd', warn:'am', note:'cy'};
  ['err','warn','note'].forEach(level=>{
    rep.items.filter(i=>i.level===level).forEach(i=>{
      const n = el('div','note '+cls[level]);
      n.innerHTML = '<b>'+xmlEsc(i.msg)+'</b>'+(i.fix?'<br><span class="iwdim">'+xmlEsc(i.fix)+'</span>':'');
      host.appendChild(n);
    });
  });

  const h = el('div','hint');
  h.innerHTML = 'The timing rule is the one that bites hardest: <b>acceleration</b>, not speed, sets how long a move takes. '+
    'A channel handed a new target before it has arrived never completes its travel — which is fine for a staggered open, '+
    'because a target persists after its frame ends, and fatal for anything that reverses a channel.';
  host.appendChild(h);
}

/* -------------------------------------------------------------- step 5 */
function impwizStepDone(host){
  const rep = lintMaestro();
  const p = el('p','iwp');
  p.innerHTML = 'Your board is loaded. Build sequences in the <b>Sequencer</b> strip, then use the '+
    '<b>⚙ builder</b> in the <b>Sequences</b> list so the eight you want land on slots 0–7, then export.';
  host.appendChild(p);

  const bar = el('div','conbar');
  const bSeq = el('button','b prim','Open the sequencer');
  bSeq.addEventListener('click',()=>{ impwizClose(); if(typeof setStripMode==='function') setStripMode('seq'); });
  const bExp = el('button','b','Export .mstr now');
  bExp.addEventListener('click',()=>{ impwizClose(); exportMstr(); });
  bar.appendChild(bSeq); bar.appendChild(bExp);
  host.appendChild(bar);

  if(rep.counts.err){
    const n = el('div','note rd');
    n.innerHTML = '<b>'+rep.counts.err+' error(s) still outstanding.</b> The export will still be written — '+
      'it is your file — but go back to <b>Check</b> and read them first.';
    host.appendChild(n);
  }

  const n2 = el('div','note cy');
  n2.innerHTML = '<b>What the export does for you.</b> Your <b>&lt;Channels&gt;</b> block is written back unchanged. '+
    'The script gets a top-level <b>quit</b> so Run Script cannot fall through, every sequence becomes a real '+
    'subroutine in loadout order, frames are written in Control Center\'s own '+
    '<b>targets s speeds a accelerations</b> form, and the file is saved with Pololu\'s byte conventions.';
  host.appendChild(n2);

  const n3 = el('div','note am');
  n3.innerHTML = '<b>At the bench.</b> Load it, press <b>Apply Settings</b>, then <b>Clear Errors</b> — Maestro error '+
    'flags latch until they are read, so an old fault sits there looking current. Do not press '+
    '“Copy all Sequences to Script”: the script is already generated, and that would rebuild it from the whole '+
    'library and renumber your slots.';
  host.appendChild(n3);
}
