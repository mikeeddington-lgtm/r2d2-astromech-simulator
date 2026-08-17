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

/* =====================================================================
   WHAT DO YOU WANT TO DO? — one guided front door (v1.45.0)

   Mike: "Put build/import/export/assign-panel actions in a guided
   wizard."

   The Maestro pane had grown into a wall: eleven buttons in one bar, two
   long build-dependent paragraphs under it, a link buried in a third, and
   four completely different jobs — building sequences, importing a
   config, exporting one, and wiring panels to channels — with nothing to
   tell you which button belonged to which job. Every one of them was
   discoverable only by reading all eleven.

   Mike's standing brief for the whole app applies exactly: simple by
   default, advanced behind one explicit switch; collapse, don't hide;
   pictures beat lists; put the job where the answer was given. So this is
   a chooser with four doors, each of which then walks its own job, and
   the specialist outputs (the raw .mstr, sequences.h, the whole-bench
   backup) live behind Advanced rather than sitting beside the file most
   people actually want.

   IT IS A COPY OF impwizOpen(), NOT A THIRD PATTERN. Same overlay, same
   .iwcard/.iwhead/.iwbody/.iwfoot furniture, same escGuard, same
   stand-aside-for-a-dialog rule. Copying one of the two wizards this app
   already has was the instruction and it is the right instruction: three
   overlay idioms would be worse than eleven buttons.

   NOTHING IS TAKEN AWAY. Every control that existed before still exists
   in the pane, one disclosure click away (#maeAdvIO), and every id a test
   or another module reaches for — #btnCfgImport, #btnAssignPanels,
   #btnExpPca, #lnkMstrFull — is still the same element doing the same
   thing. This is a front door, not a replacement.

   The host element is created on demand rather than declared in
   body.html: one wizard is up at a time, and a lazily built overlay is
   one fewer edit in a file this module does not own.
   ===================================================================== */

const JOBWIZ = { open:false, job:'' };

const JOBWIZ_JOBS = [
  {id:'build',  glyph:'▦', label:'build sequences',
   sub:'choreograph panels on a timeline, then choose what lands on slots 0–7'},
  {id:'import', glyph:'▼', label:'import a config',
   sub:'bring in servo travel, or somebody else\'s choreography'},
  {id:'export', glyph:'▲', label:'export',
   sub:'write your config out — to keep, to share, or to compile'},
  {id:'assign', glyph:'◎', label:'assign panels to channels',
   sub:'which servo moves which panel, part by part, with a test button'}
];

const jobwizEsc = escGuard(()=> JOBWIZ.open && !document.querySelector('.dlgwrap'), ()=>jobwizClose());

/* the overlay, built the first time it is asked for */
function jobwizHost(){
  let h = $('jobWiz');
  if(!h){
    h = document.createElement('div');
    h.id = 'jobWiz';
    h.className = 'iwrap';
    h.hidden = true;
    document.body.appendChild(h);
  }
  return h;
}
function jobwizOpen(job){
  JOBWIZ.open = true;
  JOBWIZ.job  = job || '';
  jobwizEsc.bind();
  jobwizRender();
}
function jobwizClose(){
  JOBWIZ.open = false;
  jobwizEsc.unbind();
  const h = $('jobWiz'); if(h){ h.hidden = true; h.innerHTML = ''; }
  if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
}
function jobwizGo(job){ JOBWIZ.job = job || ''; jobwizRender(); }

function jobwizRender(){
  const host = jobwizHost();
  if(!JOBWIZ.open){ host.hidden = true; return; }
  host.hidden = false;
  host.innerHTML = '';

  const card = el('div','iwcard');
  const head = el('div','iwhead');
  const job  = JOBWIZ_JOBS.find(j=>j.id === JOBWIZ.job);
  head.appendChild(el('h2', null, job ? job.label : 'what do you want to do?'));
  head.appendChild(el('div','iwsub', job ? job.sub
    : (MSTR.loaded ? MSTR.fileName + ' · ' + MSTR.servoCount + ' channels'
                   : 'nothing loaded yet — any of these four will get you started')));
  const x = el('button','iwx','×'); x.title = 'close';
  x.addEventListener('click', ()=>jobwizClose());
  head.appendChild(x);
  card.appendChild(head);

  const body = el('div','iwbody');
  if(job) ({build:jobwizStepBuild, import:jobwizStepImport,
            export:jobwizStepExport, assign:jobwizStepAssign}[job.id])(body);
  else jobwizStepChoose(body);
  card.appendChild(body);

  const foot = el('div','iwfoot');
  if(job){
    const b = el('button','b','← all four jobs');
    b.addEventListener('click', ()=>jobwizGo(''));
    foot.appendChild(b);
  }
  foot.appendChild(el('div','iwgap'));
  const done = el('button','b','close');
  done.addEventListener('click', ()=>jobwizClose());
  foot.appendChild(done);
  card.appendChild(foot);
  host.appendChild(card);
}

/* ------------------------------------------------------- the chooser
   Cards, not a list of links: "pictures beat lists" is Mike's rule, and
   the glyph plus a one-line description is what makes four unlike jobs
   scannable in one look. Same .optcard idiom the build wizard uses. */
function jobwizStepChoose(host){
  const p = el('p','iwp');
  p.innerHTML = 'Four jobs live on this tab. Pick the one you came for and this walks it — '
    + 'everything is still on the tab underneath if you would rather press the buttons yourself.';
  host.appendChild(p);

  const grid = el('div','jwgrid');
  JOBWIZ_JOBS.forEach(j=>{
    const c = el('div','optcard jwjob');
    c.dataset.job = j.id;
    c.tabIndex = 0;
    const h = el('div','opthead');
    h.appendChild(el('span','jwglyph', j.glyph));
    h.appendChild(el('b', null, j.label));
    c.appendChild(h);
    c.appendChild(el('div','optsub', j.sub));
    const go = ()=>jobwizGo(j.id);
    c.addEventListener('click', go);
    c.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } });
    grid.appendChild(c);
  });
  host.appendChild(grid);

  const n = el('div','note cy prose');
  n.innerHTML = '<b>What this app reads and writes.</b> ' + xmlEsc(IO_FORMATS_SENTENCE);
  host.appendChild(n);
}

/* one Advanced disclosure per job — the switch is explicit and it is the
   only one, exactly as the bench's own Advanced tick is */
function jobwizAdv(host, summary){
  const d = document.createElement('details');
  d.className = 'jwadv';
  const s = document.createElement('summary');
  s.textContent = summary;
  d.appendChild(s);
  host.appendChild(d);
  return d;
}
function jobwizBar(host){ const b = el('div','conbar'); host.appendChild(b); return b; }
function jobwizBtn(bar, label, title, fn, prim){
  const b = el('button', 'b' + (prim ? ' prim' : ''), label);
  if(title) b.title = title;
  b.addEventListener('click', fn);
  bar.appendChild(b);
  return b;
}

/* ---------------------------------------------------------- build */
function jobwizStepBuild(host){
  const p = el('p','iwp');
  p.innerHTML = 'The <b>sequencer</b> is where a routine gets made: drag a panel onto the timeline, '
    + 'stretch it, and the droid plays it back. When the routine is right, the <b>builder</b> is where '
    + 'you choose which eight land on <code>restartScript(0)</code>…<code>(7)</code> — the only slots '
    + 'a controller button can reach.';
  host.appendChild(p);
  const bar = jobwizBar(host);
  jobwizBtn(bar, 'open the sequencer', 'the bottom strip, with the brick timeline',
    ()=>{ jobwizClose(); if(typeof setStripMode === 'function') setStripMode('seq'); }, true);
  jobwizBtn(bar, ((typeof bldTitle === 'function') ? bldTitle() : 'build your Maestro').toLowerCase() + '…',
    'select which sequences are on the board, set their order, validate, and generate the script',
    ()=>{ jobwizClose(); if(typeof bldOpen === 'function') bldOpen(); });

  const adv = jobwizAdv(host, 'Advanced — start from a ready-made table');
  const abar = jobwizBar(adv);
  [['body starter','body'],['dome starter','dome'],['frik head starter','anzellan']].forEach(([label,which])=>{
    jobwizBtn(abar, label, 'build a named channel layout for this board, with subroutines 0–7 already lined up',
      ()=>{ makeStarter(which); CFG.maestroSource = 'imported'; jobwizGo('build'); });
  });
  const h = el('div','hint prose');
  h.innerHTML = 'A starter is a channel TABLE, not a calibration — the endpoints in it are placeholders. '
    + 'Measure yours on the bench, or import a config, before running anything at speed.';
  adv.appendChild(h);
}

/* --------------------------------------------------------- import */
function jobwizStepImport(host){
  const n = el('div','note cy prose');
  n.innerHTML = '<b>What this app reads and writes.</b> ' + xmlEsc(IO_FORMATS_SENTENCE);
  host.appendChild(n);

  const p = el('p','iwp');
  p.innerHTML = 'Most of the time the file you want is a <b>servo config</b> — the travel for every channel, '
    + 'and nothing else. It replaces your endpoints and leaves your sequences and your panel wiring alone. '
    + 'One reader takes all four formats and works out which it is from the content, so a file renamed by '
    + 'whoever mailed it to you still lands in the right place.';
  host.appendChild(p);

  const bar = jobwizBar(host);
  jobwizBtn(bar, 'choose a config file…',
    'names, min, centre, max, speed — whichever of the four formats it arrived in',
    ()=>{ if(typeof servoCfgPick === 'function') servoCfgPick(()=>jobwizGo('import')); }, true);

  const g = el('div','hint prose');
  g.innerHTML = xmlEsc(SERVO_CFG_ACCEPT_NOTE);
  host.appendChild(g);

  const story = (typeof servoCfgStory === 'function') ? servoCfgStory() : '';
  if(story){
    const s = el('div','note gn prose');
    s.innerHTML = '<b>There is already a config here:</b> ' + xmlEsc(story) + '.';
    host.appendChild(s);
  }

  const adv = jobwizAdv(host, 'Advanced — the whole file, or somebody else\'s choreography');
  const abar = jobwizBar(adv);
  jobwizBtn(abar, 'guided .mstr import…',
    'the five-step walkthrough: what the file is, what is wrong with its script, channel → panel, lint',
    ()=>{ jobwizClose(); impwizOpen(); });
  jobwizBtn(abar, 'sequences only, from a .mstr…',
    'take the MOVES out of somebody else\'s file and play them through YOUR endpoints — your channel table is not touched',
    ()=>{ jobwizClose(); jobwizSeqOnlyPick(); });
  const ah = el('div','hint prose');
  ah.innerHTML = 'The difference is whose calibration wins. <b>Sequences only</b> re-expresses every target as a '
    + 'fraction of your own closed→open throw, so an inverted mounting comes out right. The <b>whole file</b> '
    + 'replaces your channel table with theirs, which is only what you want coming off your own board.';
  adv.appendChild(ah);
}
/* the sequences-only picker, lifted out of buildMaestroPane so both doors
   call the same code rather than two copies of one FileReader */
function jobwizSeqOnlyPick(){
  const fi = document.createElement('input');
  fi.type = 'file'; fi.accept = '.mstr,.xml,text/xml'; fi.style.display = 'none';
  fi.addEventListener('change', ()=>{
    const f = fi.files && fi.files[0];
    fi.remove();
    if(!f) return;
    const fr = new FileReader();
    fr.onload = ()=>{
      try{
        const P = mstrParse(String(fr.result), f.name);
        mstrAdoptSequences(P);
        if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
        toast('Adopted ' + P.sequences.length + ' sequence(s) from ' + f.name
              + ' — playing through YOUR servo settings');
      }catch(e){
        lg('warn','sequence import failed: ' + e.message);
        toast('Could not read ' + f.name + ': ' + e.message, 'err');
      }
    };
    fr.readAsText(f);
  });
  document.body.appendChild(fi);
  fi.click();
}

/* --------------------------------------------------------- export */
function jobwizStepExport(host){
  const n = el('div','note cy prose');
  n.innerHTML = '<b>What this app reads and writes.</b> ' + xmlEsc(IO_FORMATS_SENTENCE);
  host.appendChild(n);

  const p = el('p','iwp');
  p.innerHTML = 'The file worth keeping is the <b>servo config</b>: the travel you measured, in a small file '
    + 'that outlives everything else about a build. Every filename carries the date and the time, so two '
    + 'exports in one afternoon are told apart by their names rather than by <code>(1)</code>.';
  host.appendChild(p);

  const bar = jobwizBar(host);
  jobwizBtn(bar, 'export the servo config',
    'name and travel for every channel — the file to keep, and the one the setup wizard reads back',
    ()=>{ if(typeof servoCfgExport === 'function') servoCfgExport(); }, true);

  /* THE SPECIALIST OUTPUTS. Each of these is the right answer to exactly
     one question, and each of them is wrong for a beginner: a .mstr means
     nothing without Control Center, sequences.h means nothing without the
     Arduino toolchain, and the whole-setup backup carries paint and part
     names that would overwrite somebody's droid. Behind the switch. */
  const adv = jobwizAdv(host, 'Advanced — the specialist outputs');
  const abar = jobwizBar(adv);
  const bM = jobwizBtn(abar, 'export .mstr',
    'a Pololu settings file: your channel table, every sequence, and a generated script with a top-level quit',
    ()=>{ if(typeof exportMstr === 'function') exportMstr(); });
  bM.disabled = !MSTR.loaded;
  const bH = jobwizBtn(abar, 'export sequences.h',
    'the C header for the MaestroPCA library — same loadout, same slot numbers, played on a PCA9685',
    ()=>{ if(typeof exportPcaHeader === 'function') exportPcaHeader(); });
  bH.disabled = !MSTR.loaded;
  jobwizBtn(abar, 'export the whole setup',
    'everything: profile, build answers, channel table, sequences, panel mapping, paint and groups',
    ()=>{ if(typeof setupExport === 'function') setupExport(); });
  const ah = el('div','hint prose');
  ah.innerHTML = 'Both board families are written from the same channel table, and both speak '
    + 'quarter-microseconds — but the conversion is lossy in each direction and every dropped field is '
    + 'named in the log when you press the button, never quietly left behind.';
  adv.appendChild(ah);
}

/* --------------------------------------------------------- assign */
function jobwizStepAssign(host){
  const p = el('p','iwp');
  p.innerHTML = 'A channel number means nothing on its own — you have to see which flap moves. '
    + 'Both doors below give you a part picker per channel and a test control beside it, so you can '
    + 'sweep a channel, watch what opens, and name it from what you saw.';
  host.appendChild(p);

  const bar = jobwizBar(host);
  jobwizBtn(bar, 'assign panels, part by part…',
    'the setup\'s Panels step: one row per panel, with a Test button for each',
    ()=>{
      jobwizClose();
      if(typeof wizOpen === 'function' && typeof wizStepIndex === 'function'){
        const i = wizStepIndex('_panels');
        if(i >= 0){ wizOpen(i); return; }
      }
      if(typeof wizOpen === 'function') wizOpen(0);
    }, true);
  jobwizBtn(bar, 'the live channel table…',
    'the bench\'s Channels step: drive a servo, watch where it actually is, and set the part it moves',
    ()=>{ jobwizClose(); if(typeof setupOpen === 'function') setupOpen(4); });

  const mapped = MSTR.loaded ? MSTR.channels.filter(c=>c.act).length : 0;
  const servos = MSTR.loaded ? MSTR.channels.filter(c=>/^servo/i.test(c.mode)).length : 0;
  const t = el('div','iwtally');
  t.innerHTML = '<b>' + mapped + '</b> of ' + servos + ' servo channels drive something on this droid.';
  host.appendChild(t);

  const adv = jobwizAdv(host, 'Advanced — match by name, or start over');
  const abar = jobwizBar(adv);
  jobwizBtn(abar, 'auto-map by name',
    're-run the name matcher over every channel, including the Printed Droid shorthand (PP5, P11, HP1-1)',
    ()=>{
      let n = 0;
      MSTR.channels.forEach(c=>{ const g = guessPart(c.name); if(g && g !== c.act){ c.act = g; n++; } });
      if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
      lg('mae','auto-map by name — ' + n + ' channel(s) re-matched');
      jobwizGo('assign');
    });
  jobwizBtn(abar, 'clear every assignment',
    'unwire all of them — the panels stay on the droid, they just stop being driven',
    ()=>{ MSTR.channels.forEach(c=>c.act = ''); if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI(); jobwizGo('assign'); });
  const ah = el('div','hint prose');
  ah.innerHTML = 'One channel per panel, always. Picking a part that another channel already had moves it — '
    + 'two channels claiming one panel is the bug that reads as "it opens twice as far".';
  adv.appendChild(ah);
}
