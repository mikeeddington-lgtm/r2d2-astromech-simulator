'use strict';
/* =====================================================================
   PUT ON THE BOARD — the full-screen build/upload workspace.

   One builder, two doors (Mike, 2026-07-29): this overlay IS the loadout
   editor. The prominent button in the Sequencer opens it, and so does the
   Maestro tab — both edit the same MSTR.loadout, which is the one thing
   that decides what the generated <Script> carries and which number
   restartScript(n) hits.

   The flow is the spec's four steps, side by side rather than paged,
   because they feed each other:

     1 SELECT   the library on the left — add a routine to the board
     2 ORDER    the loadout in the middle — order IS subroutine order,
                and the sketch only calls slots 0–7
     3 VALIDATE the lint report on the right, live
     4 GENERATE the script preview, copy it, or export the .mstr

   The robot model does not need to stay visible: this takes the whole
   screen, like the import wizard it shares its styling with.
   ===================================================================== */

const BLD = { open:false, showScript:false };

/* A PCA9685 build has no Pololu script and no .mstr to upload — the same
   loadout compiles into a sequences.h for the MaestroPCA co-processor, and
   the slot order still IS restartScript() numbering. Everything else in
   this workspace (select, order, validate) is identical, so the difference
   is confined to the title and the two output buttons. */
function bldIsPca(){ return typeof boardIsPca === 'function' && boardIsPca(MSTR.board); }
function bldTitle(){ return 'Put on the board'; }

/* Esc closes the builder (Stage-4 pickup — no keydown handling before).
   Same containment as the import wizard and the app dialog, via escGuard
   (core/dialog.js): document CAPTURE + stopPropagation, and it stands
   aside while a .dlgwrap is up so the dialog above takes the first Esc
   and this overlay the second. */
const bldEsc = escGuard(()=> !document.querySelector('.dlgwrap'), bldClose);
function bldOpen(){
  if(!MSTR.loaded && typeof buildEnsureMaestro === 'function') buildEnsureMaestro();
  if(!MSTR.loaded){ lg('warn','no servo settings to build from — generate a starter first'); return; }
  BLD.open = true;
  bldEsc.bind();
  bldRender();
}
function bldClose(){
  BLD.open = false;
  bldEsc.unbind();
  const h = $('bldWiz'); if(h){ h.hidden = true; h.innerHTML=''; }
  if(typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
}

function bldRender(){
  const host = $('bldWiz'); if(!host) return;
  if(!BLD.open){ host.hidden = true; return; }
  host.hidden = false;
  host.innerHTML = '';
  reindexSubs();

  const card = el('div','iwcard');
  const head = el('div','iwhead');
  head.appendChild(el('h2', null, bldTitle()));
  head.appendChild(el('div','iwsub', boardById(MSTR.board).label+' · '
    + (bldIsPca() ? 'sequences.h for the MaestroPCA library' : MSTR.fileName)));
  const x = el('button','iwx','×'); x.title='done — back to the sequencer'; x.addEventListener('click',bldClose);
  head.appendChild(x);
  card.appendChild(head);

  const body = el('div','iwbody');
  const grid = el('div','bldgrid');
  grid.appendChild(bldLibraryCol());
  grid.appendChild(bldLoadoutCol());
  grid.appendChild(bldCheckCol());
  body.appendChild(grid);
  card.appendChild(body);

  const foot = el('div','iwfoot');
  const pca = bldIsPca();
  const bScript = el('button','b', BLD.showScript ? 'Hide the script' : 'Show the script');
  bScript.addEventListener('click',()=>{ BLD.showScript = !BLD.showScript; bldRender(); });
  if(!pca) foot.appendChild(bScript);          /* no Pololu script on this route */
  const bCopy = el('button','b','Copy script');
  bCopy.title = 'the generated script, for pasting into Control Center’s Script tab';
  bCopy.addEventListener('click',()=>{
    navigator.clipboard.writeText(genScript(loadoutSeqs(), enabledChannels())).then(
      ()=>lg('mae','script copied — paste it into the Control Center Script tab'),
      ()=>lg('warn','clipboard blocked — use Show the script and select the text'));
  });
  if(!pca) foot.appendChild(bCopy);
  foot.appendChild(el('div','iwgap'));
  const rep = lintMaestro();
  const what = pca ? 'sequences.h' : '.mstr';
  const bExp = el('button','b prim', rep.counts.err ? 'Export anyway ('+what+')' : 'Generate & export '+what);
  bExp.title = rep.counts.err
    ? rep.counts.err+' validation error(s) outstanding — the export is still written, it is your file'
    : (pca
        ? 'write sequences.h: your channels unchanged, the loadout in slot order for restartScript(n)'
        : 'write the settings file: your channels unchanged, the loadout compiled into the script');
  bExp.addEventListener('click',()=>{ pca ? exportPcaHeader() : exportMstr(); });
  foot.appendChild(bExp);
  const bDone = el('button','b','Done');
  bDone.addEventListener('click',bldClose);
  foot.appendChild(bDone);
  card.appendChild(foot);
  host.appendChild(card);
}

/* ---- column 1: the library — what CAN go on the board ---- */
function bldLibraryCol(){
  const col = el('div','bldcol');
  col.appendChild(el('h4',null,'1 · Your library'));
  const names = loadoutNames();
  const spare = MSTR.sequences.filter(s=>names.indexOf(s.name) < 0);
  if(!spare.length){
    col.appendChild(el('div','hint','Every saved sequence is on the board. Make more in the sequencer — they land here.'));
  }
  spare.forEach(s=>{
    const row = el('div','bldrow spare');
    row.appendChild(el('span','nm', s.name));
    row.appendChild(el('span','mt', s.frames.length+'f · '+(seqTotal(s)/1000).toFixed(1)+'s'));
    const bPrev = el('button','b','▶'); bPrev.title='preview it on the model';
    bPrev.addEventListener('click',()=>{ if(s.frames.length) seqStart('edit', s.frames, 'preview'); });
    row.appendChild(bPrev);
    const bAdd = el('button','b prim','＋ Add'); bAdd.title='put it on the board — it takes the next slot';
    bAdd.addEventListener('click',()=>{ loadoutAdd(s.name); bldRender(); });
    row.appendChild(bAdd);
    col.appendChild(row);
  });
  const bar = el('div','conbar');
  const bAll = el('button','b','Load everything');
  bAll.title = 'put every saved sequence on the board, in library order';
  bAll.addEventListener('click',()=>{ loadoutReset(); reindexSubs(); bldRender(); });
  bar.appendChild(bAll);
  col.appendChild(bar);
  const h = el('div','hint');
  h.innerHTML = 'A sequence in the library is safe on the PC. Only what you <b>Add</b> here is compiled into '
    + (bldIsPca() ? 'the header.' : 'the script.');
  col.appendChild(h);
  return col;
}

/* ---- column 2: the loadout — order IS restartScript() numbering ---- */
function bldLoadoutCol(){
  const col = el('div','bldcol');
  col.appendChild(el('h4',null,'2 · On the board, in order'));
  const names = loadoutNames();
  if(!names.length){
    const n = el('div','note');
    n.innerHTML = '<b>Nothing is loaded.</b> Add a sequence from the library — it becomes sub 0 on the board.';
    col.appendChild(n);
  }
  names.forEach((nm,i)=>{
    const seq = MSTR.sequences.find(q=>q.name === nm);
    const row = el('div','bldrow');
    const slot = el('span','bldslot'+(i>7?' far':''), i);
    slot.title = i < 8 ? 'restartScript('+i+') — the controller can fire this one'
                       : 'sub '+i+' — past 7, no stock button reaches it';
    row.appendChild(slot);
    const lab = el('span','nm', nm);
    lab.title = seq ? seq.frames.length+' frames · '+seqTotal(seq)+' ms · sub '+scriptSubNameFor(seq) : '';
    row.appendChild(lab);
    row.appendChild(el('span','mt', seq ? (seqTotal(seq)/1000).toFixed(1)+'s' : '—'));
    const mk = (t, fn, tip, dis)=>{
      const b = el('button','b', t); b.title = tip || ''; b.disabled = !!dis;
      b.addEventListener('click', fn); return b;
    };
    row.appendChild(mk('▲', ()=>{ loadoutMove(nm,-1); bldRender(); }, 'earlier — lower slot', i===0));
    row.appendChild(mk('▼', ()=>{ loadoutMove(nm, 1); bldRender(); }, 'later — higher slot', i===names.length-1));
    row.appendChild(mk('▶', ()=>{ if(seq && seq.frames.length) seqStart('edit', seq.frames, 'preview'); }, 'preview it on the model'));
    row.appendChild(mk('✕', ()=>{ loadoutDrop(nm); bldRender(); }, 'take it off the board — it stays in your library'));
    col.appendChild(row);
  });
  const h = el('div','hint');
  h.innerHTML = 'Order is subroutine order. The stock sketches call <b>restartScript(0)</b>–<b>(7)</b> from the d-pad, '
    + 'so put the eight you want on the buttons at the top.';
  col.appendChild(h);
  return col;
}

/* AN ERROR HAS TO LOOK LIKE ONE (v1.69.0). `.note` is the amber wash and
   `.note.cy` recolours it cyan, but there has never been a `.note.rd` — so
   step 3 asked for one, got the plain amber, and rendered 129 errors in the
   exact colour of the 9 warnings underneath them. The two piles were
   indistinguishable at a glance, which is the one job a colour has here.

   The colour comes from --rd, the app's fault token (css/01-tokens.css:
   "--rd faults · --am warnings · --gn good"), and the light theme already
   overrides it — so this follows the theme rather than pinning a hex. It is
   applied INLINE rather than as a class because the stylesheet is not this
   file's to edit; export.js's exportLintNote() reaches for the same token
   the same way, in the same situation. The wash is mixed from the token so
   there is still exactly one red in the app; a browser that cannot mix
   simply keeps the old background and the text and rule are still red. */
function bldPaintError(node){
  node.style.color           = 'var(--rd)';
  node.style.borderLeftColor = 'var(--rd)';
  node.style.background      = 'color-mix(in srgb, var(--rd) 9%, transparent)';
  /* .note b is --amHi, which would leave the headline sentence amber inside
     an otherwise red note — the loudest word on the line, in the wrong ink */
  const b = node.querySelector('b');
  if(b) b.style.color = 'var(--rd)';
}

/* AND IT HAS TO OFFER SOMETHING TO DO (v1.69.0). The report could say a
   channel is wrong 129 times without once saying where to go and change it.
   The Channels step of the servo bench is the one table with the endpoints,
   the part column and a Test button on every row, and SETUP.sel is what
   decides which channel it opens on — so that is the door, the same one
   blocks-ui.js's blkMapPanelsOpen() uses for the same reason.

   This is deliberately NOT a "fix it for me" button. The linter cannot know
   whether a target of 8000 on a 10400-10800 channel means the endpoints were
   never calibrated or the routine was written against a different droid, and
   silently widening somebody's calibrated limits is how a panel goes through
   the shell. It takes you to the channel; the judgement stays yours.

   The bench is another full-screen overlay, so the builder closes first —
   two of them stacked would leave Esc ambiguous. Nothing is lost by that:
   the loadout is already saved in MSTR, and the button that reopens this is
   where it always was. */
function bldFixChannelStep(){
  if(typeof SETUP_STEPS === 'undefined') return 4;
  const i = SETUP_STEPS.findIndex(s=>s.key === 'channels');
  return i >= 0 ? i : 4;
}
function bldAddFixChannel(node, item){
  if(typeof item.ch !== 'number') return;
  /* PCA Studio builds from this file and has the same bench; a host that
     does not is simply left with the sentence, which is what it had. */
  if(typeof setupOpen !== 'function' || typeof SETUP === 'undefined') return;
  const bar = el('div','conbar');
  const b = el('button','b','Fix channel '+item.ch+' →');
  b.title = 'open the servo bench on channel '+item.ch+' — its endpoints, its part and its Test button';
  b.dataset.fixch = String(item.ch);
  b.addEventListener('click',()=>{
    const ch = item.ch;
    bldClose();
    SETUP.sel = ch;
    setupOpen(bldFixChannelStep(), {from:'builder'});
  });
  bar.appendChild(b);
  node.appendChild(bar);
}

/* ---- column 3: validate & generate ---- */
function bldCheckCol(){
  const col = el('div','bldcol');
  col.appendChild(el('h4',null,'3 · Validate & generate'));
  const rep = lintMaestro();

  const grid = el('div','bldstats');
  const fact = (k,v,t)=>{ const d=el('div','iwfact'); d.appendChild(el('div','k',k));
    d.appendChild(el('div','v',String(v))); if(t) d.title=t; grid.appendChild(d); };
  fact('Errors', rep.counts.err, 'this will not work on the board');
  fact('Warnings', rep.counts.warn, 'it will run, but not the way you meant');
  if(!bldIsPca()){ // v1.39.5: don't measure a machine that is not there — v1.29.0's linter rule, applied to the stats
    fact('Script', rep.stats.bytes+' / '+rep.stats.scriptMax+' B', 'estimate — Control Center is authoritative');
    fact('Subroutines', rep.stats.subs+' / 126','');
  }
  fact('Slots used', rep.stats.loadout, 'the sketches reach 0–7');
  fact('Slowest throw', rep.stats.slowestThrowMs+' ms', 'a full endpoint-to-endpoint move at these channels\' speed and acceleration');
  col.appendChild(grid);

  if(!rep.items.length){
    const n = el('div','note gn');
    n.innerHTML = '<b>Nothing to flag.</b> Channels, sequences and script all check out.';
    col.appendChild(n);
  }
  const cls = {err:'rd', warn:'am', note:'cy'};
  ['err','warn','note'].forEach(level=>{
    rep.items.filter(i=>i.level===level).forEach(i=>{
      const n = el('div','note '+cls[level]);
      n.innerHTML = '<b>'+xmlEsc(i.msg)+'</b>'+(i.fix?'<br><span class="iwdim">'+xmlEsc(i.fix)+'</span>':'');
      if(level === 'err') bldPaintError(n);
      bldAddFixChannel(n, i);
      col.appendChild(n);
    });
  });

  if(BLD.showScript && !bldIsPca()){
    const pre = el('pre','bldscript', genScript(loadoutSeqs(), enabledChannels()));
    col.appendChild(pre);
  }

  const h = el('div','hint');
  // v1.39.5: the footer speaks the family's own language — same rule as v1.39.1
  if(bldIsPca()){
    h.innerHTML = 'The export writes <b>sequences.h</b> — drop it into your MaestroPCA sketch folder, recompile and flash the co-processor. '
      + 'Slot order here is <b>restartScript(n)</b> numbering, exactly what your sketch already sends.';
  }else{
    h.innerHTML = 'The export writes your <b>&lt;Channels&gt;</b> back unchanged, gives the script its top-level '
      + '<b>quit</b>, and compiles the loadout in this order. At the bench: load it, <b>Apply Settings</b>, '
      + '<b>Clear Errors</b> — and never press “Copy all Sequences to Script” afterwards, it would renumber your slots.';
  }
  col.appendChild(h);
  return col;
}
