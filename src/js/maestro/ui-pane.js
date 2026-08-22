'use strict';
/* =====================================================================
   MAESTRO UI — sidebar pane (import / channels / sequences) plus the
   sequencer that takes over the bottom strip.
   ===================================================================== */

/* ============================== WHO ELSE IS PLAYING THIS ROUTINE (v1.69.1)

   A whole-sequence brick names its target BY NAME and resolves it fresh on
   every compile — `BLKH.sequences().find(x => x.name === b.ref)` in both
   blockBoundaries() and blockSeqTargetsAt(). Neither of them complains when
   the find comes back empty: the brick keeps its place on the timeline and
   keeps its length, and the routine it sits in compiles to one held pose.
   A "Show" carrying a 0.9 s brick that played "Wave" compiled to
   `t0 300 [8000,4000] · t300 300 [4000,8000] · t600 300 [4000,4000]`;
   renaming "Wave" turned that into `t0 900 [4000,4000]` — every move gone,
   the brick still on the timeline, still saying 0.9 s, still looking wired.

   So this pane's Rename and Delete have to ask the question the compiler
   cannot: which OTHER routines name this one? It is deliberately a plain
   scan rather than an index — the library is a handful of routines, the
   answer has to be right at the instant it is asked, and an index would be
   a second thing to keep in step with a rename. */
function paneSeqRefs(name){
  const out = [];
  if(typeof blockList !== 'function' || !MSTR.sequences) return out;
  MSTR.sequences.forEach(s=>{
    blockList(s).forEach(b=>{ if(b.kind === 'seq' && b.ref === name) out.push({seq:s, b:b}); });
  });
  return out;
}

/* ============================== THE THREE BUTTONS THAT EMPTIED THE APP
   (v1.69.1)

   `makeStarter()` is not "add a starter layout". It does
   `MSTR.channels = channels` and `MSTR.sequences = [...]` — every measured
   endpoint and every routine in the library discarded — then loadoutReset()
   and servoStoreSave(), so the browser's own backup is overwritten with the
   new emptiness in the same click. There was no confirmation on any of the
   three buttons that called it and there is no undo behind them.

   The realistic way to lose an afternoon was not recklessness: it was
   opening "all 9 file buttons, one by one" and clicking Dome starter to
   find out what it does.

   Every other destructive path in this project asks first — blkToolbar's
   Clear all, mstrImportChoice's second confirm, buildAskBoardShrink — and
   config/hardware.js's buildEnsureMaestro() exists precisely so that a
   starter is never generated implicitly over a table somebody has worked
   on. This is the same rule, said out loud on the button.

   WHAT COUNTS AS "there is something to lose". Not MSTR.loaded on its own:
   `loaded` is set by an import or by a starter, and a table built up
   channel by channel in the bench never had it (the same trap
   buildEnsureMaestro() answers with servoStoreWorth()). So the test is the
   union of the three things this pane can actually lose — a channel table
   of any size, a sequence library of any size, or travel that was measured
   rather than defaulted (servoCfgConfigured(), which counts a calibrated
   channel as well as a non-default endpoint). Any one of them makes it a
   question; none of them — a genuinely fresh app — generates silently, so
   the first starter of the day still costs one click. */
async function paneStarterConfirm(what){
  const chans = (MSTR.channels || []).length;
  const seqs  = (MSTR.sequences || []).length;
  const trav  = (typeof servoCfgConfigured === 'function') ? servoCfgConfigured() : 0;
  if(!(MSTR.loaded || chans || seqs || trav)) return true;
  if(typeof appConfirm !== 'function') return true;
  return await appConfirm(
    'The ' + what + ' starter builds a channel table from scratch. It replaces all '
    + chans + ' channel(s) — '
    + (trav ? trav + ' of them carrying travel you measured, plus every name and panel assignment'
            : 'every name, endpoint, speed and panel assignment')
    + ' — and discards all ' + seqs + ' sequence(s) in your library. The browser backup is '
    + 'rewritten in the same click, so nothing is left to go back to.\n\n'
    + 'Export servo config saves the travel and the choreography .json saves the routines; '
    + 'either one keeps what this would take. Your build answers, the sound bank and the '
    + 'model itself are untouched whichever way you answer.',
    {title:'Replace everything with the ' + what + ' starter?',
     yes:'Replace it all', no:'Keep what I have', danger:true});
}

/* ------------------------------------------------- sidebar Maestro pane */
function buildMaestroPane(){
  const host=$('maeHost'); if(!host) return;
  host.innerHTML='';

  /* v1.27.0: a PCA9685 build is no longer turned away here. The sequence
     library, the editor and the loadout are all board-agnostic — what
     changes is where they END UP: a .mstr for a Pololu board, or a
     sequences.h for the MaestroPCA co-processor. Only the Pololu-specific
     furniture (the board picker, the script) is hidden. */
  const pca = (typeof boardIsPca === 'function') && MSTR.loaded && boardIsPca(MSTR.board);
  if(!PROFILE.hasMaestro && !pca && !(typeof buildCanSequence === 'function' && buildCanSequence())){
    const n=el('div','note cy prose');
    n.innerHTML='<b>'+PROFILE.short+' has no Maestro.</b> This sketch drives the body through two PCA9685 boards, so there is no settings file to import. Switch to <b>Maestro 2025</b> or <b>Maestro 2022</b> to use this tab.';
    host.appendChild(n);
    return;
  }
  /* NOTE: rendering this pane must NOT generate a starter. It briefly did,
     and two suites caught it immediately — rebuildMaestroUI() runs from
     dozens of places, so a side effect here means MSTR is loaded at moments
     nothing asked for it, and `makeStarter()` with no argument then inherits
     whatever board that starter chose. The desk (setStripMode) and the
     builder (bldOpen) are the two places that legitimately create one. */
  if(pca){
    const n=el('div','note cy prose');
    n.innerHTML='<b>PCA9685 route.</b> These sequences export as <b>sequences.h</b> '
      +'for the <b>MaestroPCA</b> library, not as a <code>.mstr</code> — the co-processor '
      +'answers <code>restartScript(n)</code> exactly as a Maestro does, so the slot '
      +'numbers below are what your sketch already sends. Endpoints are yours to '
      +'calibrate; nothing here changes them.';
    host.appendChild(n);
  }

  /* Mike: "Sequences", "Script loadout" and "Subroutine index" were three
     sections about the same eight objects — the library, whether each one
     is on the board, and the generated sub it compiles to. One list now
     (2026-08-14): board order leads (it's what restartScript(n) hits and
     what the old loadout summary showed), library-only routines trail
     after as "not loaded". Rename/delete still act on the row you last
     clicked (EDIT.seq); ordering the board stays in the full-screen
     builder below — one editor for "what number is this", not two. */
  const s4=sect(host,'Sequences','library · board order · what the sketch fires');
  const loadout=loadoutNames();
  const seqRow=(seq,libIndex,slot)=>{
    const d=el('div','seqrow'+(slot>=0?' ldrow':'')+(libIndex===EDIT.seq?' sel':''));
    const badge=el('span','sqbadge'+(slot>=0?' on':'')+(slot>=8?' far':''), slot>=0?String(slot):'not loaded');
    badge.title = slot>=0
      ? (slot<8 ? 'restartScript('+slot+') — the sketch can fire this one' : 'subroutine '+slot+' — past 7, so no controller button reaches it')
      : 'in your library but not on the board — add it with the ⚙ builder below';
    d.appendChild(badge);
    d.appendChild(el('span','nm',seq.name));
    const sub=el('span','sub','sub '+scriptSubNameFor(seq)); sub.title='the generated subroutine name';
    d.appendChild(sub);
    d.appendChild(el('span','mt',seq.frames.length+'f · '+seqTotal(seq)+'ms'));
    const bPrev=el('button','b','▶'); bPrev.title='preview it on the model';
    bPrev.addEventListener('click',e=>{ e.stopPropagation(); if(seq.frames.length) seqStart('edit', seq.frames, 'preview'); });
    d.appendChild(bPrev);
    d.addEventListener('click',e=>{
      if(e.target.closest('button')) return;
      EDIT.seq=libIndex; EDIT.frame=-1; setStripMode('seq'); rebuildMaestroUI();
    });
    return d;
  };
  if(!loadout.length){
    const n=el('div','note prose');
    n.innerHTML='<b>Nothing is on the board yet.</b> Add a routine below — it becomes subroutine 0.';
    s4.appendChild(n);
  }
  loadout.forEach((nm,slot)=>{
    const seq=MSTR.sequences.find(q=>q.name===nm);
    if(seq) s4.appendChild(seqRow(seq, MSTR.sequences.indexOf(seq), slot));
  });
  MSTR.sequences.forEach((seq,i)=>{
    if(loadout.indexOf(seq.name)>=0) return;
    s4.appendChild(seqRow(seq, i, -1));
  });
  const bar4=el('div','conbar');
  const bAdd=el('button','b','+ Sequence');
  bAdd.addEventListener('click',()=>{
    const base = new Array(MSTR.servoCount).fill(0);
    /* 2026-08-18 — chanRest(), not c.home: a new sequence starts from the
       rest pose (doors shut, gimbals centred), never from a home µs whose
       offset belongs to the real linkage. */
    MSTR.channels.forEach(c=>{ if(/^servo/i.test(c.mode)) base[c.i]=chanRest(c); });
    /* v1.69.1 — 'Sequence ' + length is not a name, it is a guess. Everything
       downstream resolves a board slot BY NAME (loadoutSeqs → find(s.name ===
       n)), so a duplicate makes one routine unreachable from the board while
       another slot silently fires the wrong one: pane +, library +, pane +
       produced ['Sequence 0','Sequence 2','Sequence 2'], slot 2 compiling
       library index 1 and index 2 invisible in the loadout editor. blocks.js
       has seqUniqueName() for exactly this and the library's own + already
       calls it; this door was the one still counting. Guarded with typeof
       like every other cross-module call in this file. */
    const mint = 'Sequence '+MSTR.sequences.length;
    const name = (typeof seqUniqueName === 'function') ? seqUniqueName(mint) : mint;
    MSTR.sequences.push({name:name, frames:[{name:'Frame 0',duration:500,targets:base}]});
    EDIT.seq=MSTR.sequences.length-1; EDIT.frame=0; reindexSubs(); rebuildMaestroUI();
  });
  const bRen=el('button','b','Rename');
  bRen.addEventListener('click',async ()=>{
    const seq=MSTR.sequences[EDIT.seq]; if(!seq) return;
    const v=await appPrompt('Sequence name (becomes the sub name):',
      {title:'Rename sequence', value:seq.name, yes:'Rename'});
    /* '' and cancel both keep the old name; spaces still become underscores
       in the generated sub name — that lives in niceName()/genScript, which
       read seq.name at build time, so the raw name passes through untouched */
    if(!v) return;
    /* A RENAME IS A RE-ADDRESSING (v1.69.1). loadoutRename() has always
       followed the name onto the board; nothing followed it into the other
       routines. A whole-sequence brick naming this one kept the old string,
       found nothing on its next compile and quietly played silence — see
       paneSeqRefs() above. So the bricks are re-pointed here, and the
       routines holding them are recompiled straight away: their frames are
       what the board and the preview read, and leaving them stale would only
       move the moment the moves vanish to whenever something else touched
       that routine. */
    const was = seq.name;
    loadoutRename(was, v); seq.name=v;
    const hits = paneSeqRefs(was);
    hits.forEach(h=>{ h.b.ref = v; });
    const held = [];
    hits.forEach(h=>{ if(held.indexOf(h.seq) < 0) held.push(h.seq); });
    if(typeof blockSync === 'function') held.forEach(s=>blockSync(s));
    if(hits.length) lg('mae','renamed “'+was+'” → “'+v+'” — '+hits.length+' brick(s) in '
      + held.length + ' other routine(s) re-pointed and recompiled: '+held.map(s=>s.name).join(', '));
    reindexSubs(); rebuildMaestroUI();
  });
  const bDelS=el('button','b','Delete');
  bDelS.addEventListener('click',async ()=>{
    if(MSTR.sequences.length<=1) return;
    const gone = MSTR.sequences[EDIT.seq];
    if(!gone) return;
    /* DELETING SOMETHING ANOTHER ROUTINE PLAYS (v1.69.1). A rename can be
       followed through; a deletion cannot — there is no name left to point
       at. The brick cannot be greyed the way an unmapped part's brick is
       either: `.unwired` is decided by blockWired(), which answers TRUE for
       every whole-sequence brick by construction (blocks.js: "a dropped-in
       sequence carries its own targets"), and blocks.js is not this file's
       to change. So the honest thing left is to ASK, before the fact, with
       the count and the routines named — the same shape mstrImportChoice's
       second confirm and the sequencer's CLEAR EVERY BRICK ask in — and to
       say plainly in the log afterwards which routines are now holding a
       brick that plays nothing. */
    const hits = paneSeqRefs(gone.name);
    const held = [];
    hits.forEach(h=>{ if(held.indexOf(h.seq.name) < 0 && h.seq !== gone) held.push(h.seq.name); });
    if(hits.length && held.length && typeof appConfirm === 'function'){
      const ok = await appConfirm(
        hits.length + ' brick' + (hits.length===1?'':'s') + ' in ' + held.length + ' other routine'
        + (held.length===1?'':'s') + ' — ' + held.join(', ') + ' — play' + (hits.length===1?'s':'')
        + ' “' + gone.name + '”. Deleting it '
        + 'leaves those bricks on their timelines, keeping their length and their labels, compiling '
        + 'to a held pose instead of the moves they play now.\n\n'
        + 'Those routines survive and so do their other bricks — only what “' + gone.name + '” '
        + 'contributed goes. Rename it instead and the bricks follow it.',
        {title:'Delete “'+gone.name+'”?', yes:'Delete it anyway', no:'Keep it', danger:true});
      if(!ok) return;
      lg('warn','deleted “'+gone.name+'” — '+hits.length+' brick(s) in '+held.join(', ')
        + ' now name a sequence that is not there and compile to a held pose');
    }
    loadoutDrop(gone.name);
    MSTR.sequences.splice(EDIT.seq,1); EDIT.seq=Math.max(0,EDIT.seq-1); EDIT.frame=-1;
    reindexSubs(); rebuildMaestroUI();
  });
  bar4.appendChild(bAdd); bar4.appendChild(bRen); bar4.appendChild(bDelS);
  s4.appendChild(bar4);

  const bar4b=el('div','conbar');
  const bBld=el('button','b prim','⚙ '
    + ((typeof bldTitle === 'function') ? bldTitle() : 'Build your Maestro') + '…');
  bBld.title = 'the full-screen builder: select which sequences are on the board, set their order, validate, and generate the script';
  bBld.addEventListener('click',()=>{ if(typeof bldOpen==='function') bldOpen(); });
  bar4b.appendChild(bBld);
  s4.appendChild(bar4b);

  const h4=el('div','hint prose');
  h4.innerHTML='Slot badges are subroutine numbers — the sketch only ever calls <code>restartScript(0)</code>…<code>(7)</code>, '
    + 'so a routine past 7, or still <b>not loaded</b>, is unreachable from the controller. Click a routine to edit it in the '
    + '<b>Sequencer strip</b>; the <b>⚙ builder</b> above is the only thing that changes what is on the board and in what order. '
    + 'Rename freely — spaces become underscores in the generated <code>sub</code> name.';
  s4.appendChild(h4);
  const foot4=el('div','hint');
  foot4.innerHTML='<b>'+loadout.length+'</b> of <b>'+MSTR.sequences.length+'</b> on the board.';
  s4.appendChild(foot4);

  /* --- generated script preview --- */

  /* --- which board --- */
  /* The Maestro board used to be pickable here. It is a BUILD answer now —
     "dome servos" / "body servos" in the setup — and having it in two places
     meant the pane could silently disagree with the wiring sheet. Mike, 2026-07-27. */
  /* WHOSE FILE IS THE FILE? (v1.39.1)
     Mike: "the only thing I see the mestro one which should be hidden by
     default only the abilty to import meastro sequencs should be available."

     This section has said "Settings file · Import your config…" since the app
     was a Maestro tool with nothing else in it. On a PCA9685 build that is
     now actively misleading: the file it means is a Pololu .mstr, which that
     builder has never had and never will, while the file they DO have — the
     servo config this app exported — had no button anywhere on this screen.

     So the primary route follows the build. What is never taken away is
     importing a Maestro's SEQUENCES: choreography is the one thing that
     travels between rigs, most of what the community shares is a .mstr, and
     `mstrAdoptSequences()` plays those moves through YOUR servo settings
     without touching the channel table. The whole-file import stays reachable
     for a genuine Maestro→PCA migration, as a line of text rather than a
     button in the bar. */
  const isMaestroBuild = (typeof buildGet !== 'function' || typeof servoFamily !== 'function')
    || servoFamily(buildGet().domeServo) === 'maestro';
  const s0=sect(host, isMaestroBuild ? 'Settings file' : 'Servo config & sequences',
                MSTR.loaded?xmlEsc(MSTR.fileName):'nothing loaded');
  const bar=el('div','conbar');
  const fin=document.createElement('input'); fin.type='file'; fin.accept='.mstr,.xml,text/xml'; fin.style.display='none';
  fin.addEventListener('change',()=>{ if(fin.files[0]) readMstrFile(fin.files[0]); fin.value=''; });

  /* One guided route in, rather than a bare file picker: the wizard is where
     the file gets explained, the channels get mapped and the lint runs. */
  const bImp=el('button','b'+(isMaestroBuild?' prim':''),
                isMaestroBuild ? 'Import your config…' : 'Maestro sequences…');
  bImp.title = isMaestroBuild
    ? 'Guided import of the settings file you saved from Maestro Control Center'
    : 'Take the SEQUENCES out of a Pololu .mstr and play them through your own servo settings — your channel table is not touched';
  bImp.addEventListener('click',()=>{
    if(isMaestroBuild){ impwizOpen(); return; }
    seqOnly.click();
  });

  /* sequences-only: the same reader, none of the channel table */
  const seqOnly=document.createElement('input');
  seqOnly.type='file'; seqOnly.accept='.mstr,.xml,text/xml'; seqOnly.style.display='none';
  seqOnly.addEventListener('change',()=>{
    const f=seqOnly.files[0]; seqOnly.value='';
    if(!f) return;
    const fr=new FileReader();
    fr.onload=()=>{
      try{
        const P=mstrParse(String(fr.result), f.name);
        mstrAdoptSequences(P);
        rebuildMaestroUI();
        toast('Adopted '+P.sequences.length+' sequence(s) from '+f.name+' — playing through YOUR servo settings');
        lg('sys','sequences adopted from '+f.name+' — '+P.sequences.length+', channel table untouched');
      }catch(e){
        lg('warn','sequence import failed: '+e.message);
        toast('Could not read '+f.name+': '+e.message,'err');
      }
    };
    fr.readAsText(f);
  });

  /* THE BUTTON MIKE COULD NOT FIND */
  const bCfg=el('button','b'+(isMaestroBuild?'':' prim'),'Import servo config…');
  bCfg.id='btnCfgImport';
  /* WHAT EACH FILE IS (v1.69.1). This row is nine buttons with nothing but
     their own labels to tell them apart, and three of the labels say "config"
     about three different files. A walkthrough could not tell an
     R2-servos-….json from an R2-setup-….json from a .mstr — so every button
     in the row now carries one line naming the FILE it reads or writes and
     who it is for. (Which three deserve promoting out of the disclosure, and
     how the grid should be laid out, is deliberately not answered here.) */
  bCfg.title='reads an R2-servos-….json — travel only: names, min, centre, max, speed — or the '
           + 'travel half of a whole-setup R2-setup-….json. It replaces the endpoints and leaves '
           + 'your sequences and panel wiring alone';
  bCfg.addEventListener('click',()=>{ if(typeof servoCfgPick==='function') servoCfgPick(()=>rebuildMaestroUI()); });
  /* the other question that had no answer on this screen (v1.39.2) —
     "where do I assign servos to panels?" The editor is the setup's Panels
     step and stays there; what was missing was a way IN to it from the tab
     where you are already thinking in channels. */
  const bMap=el('button','b','Assign panels…');
  bMap.id='btnAssignPanels';
  bMap.title='which servo moves which panel — opens the setup on its Panels step, part by part, with a Test button for each';
  bMap.addEventListener('click',()=>{
    if(typeof wizOpen === 'function' && typeof wizStepIndex === 'function'){
      const i = wizStepIndex('_panels');
      if(i >= 0){ wizOpen(i); return; }
    }
    if(typeof wizOpen === 'function') wizOpen(0);
  });
  const bCfgX=el('button','b','Export servo config');
  bCfgX.title='writes R2-servos-….json — name and travel for every channel and nothing else, no '
            + 'sequences in it. The calibration backup to keep, and the file the setup wizard reads back';
  bCfgX.addEventListener('click',()=>{ if(typeof servoCfgExport==='function') servoCfgExport(); });
  /* `what` is the starter's name in a sentence — it goes into the confirm's
     title and body so the question names the button that was pressed, not
     "this starter". `tip` is the hover line: see WHAT EACH FILE IS below. */
  const mkGen=(label, which, what, tip, note)=>{
    const b=el('button','b',label);
    b.title=tip;
    b.addEventListener('click',async ()=>{
      /* the gate, not the generator — paneStarterConfirm() decides whether
         there is anything to lose and asks only then (v1.69.1) */
      if(!(await paneStarterConfirm(what))) return;
      makeStarter(which); CFG.maestroSource='imported';
      rebuildMaestroUI();
      const m=$('maeMsg'); if(m) m.textContent=note;
    });
    return b;
  };
  const bGen  = mkGen('Body starter','body','Body',
    'builds a body channel table from scratch — doors, arms and ports, named and mapped, '
    + 'plus 8 routines on subroutines 0-7. It REPLACES the whole channel table and the whole '
    + 'sequence library, and asks first if there is anything in either.',
    'Body layout built for the '+boardById(MSTR.board).label+' — doors on subroutines 0-3.');
  const bGenD = mkGen('Dome starter','dome','Dome',
    'builds a dome channel table from scratch — six pies then fourteen side panels — plus 8 '
    + 'routines on subroutines 0-7. It REPLACES the whole channel table and the whole sequence '
    + 'library, and asks first if there is anything in either.',
    'Dome layout built for the '+boardById(MSTR.board).label+' — pies first, side panels fill the rest.');
  const bGenA = mkGen('Frik head starter','anzellan','Frik head',
    'builds an Anzellan face table from scratch — 11 channels, mouth first, brows and gimbals '
    + 'resting mid-travel — plus 8 routines. It REPLACES the whole channel table and the whole '
    + 'sequence library, and asks first if there is anything in either.',
    'Anzellan face layout built for the '+boardById(MSTR.board).label+' — 11 channels, mouth first, resting mid-travel.');
  const bExp=el('button','b','Export .mstr');
  bExp.title='writes the whole Pololu settings file — channel table, endpoints, speeds and the '
           + 'generated script — as one .mstr. This is the file that goes to a Windows box and '
           + 'opens in Maestro Control Center; it is not readable by a PCA9685 sketch.';
  bExp.disabled=!MSTR.loaded;
  bExp.addEventListener('click',exportMstr);
  /* WHICH ROUTE IS THIS FILE FOR (v1.69.1). Nine buttons in one collapsed
     row, and this was the one that quietly wrote a PCA9685 header on a
     Maestro build: 'Export PCA9685 header' names a chip, which reads as a
     feature rather than as a fork in the road. It is NOT disabled here —
     a builder migrating a Maestro rig onto the PCA route needs exactly this
     button on exactly that build — so it takes the other half of the offer
     and says in its own label which route it belongs to and which file
     comes out, with the Maestro builder's answer named in the tooltip. */
  const bExpH=el('button','b','Export sequences.h (PCA9685)');
  bExpH.id='btnExpPca';
  bExpH.title='sequences.h for the MaestroPCA Arduino library — the same loadout and slot numbers, '
            + 'played on a PCA9685 instead of a Maestro. Not the file a Maestro build wants: that '
            + 'one is Export .mstr.';
  bExpH.disabled=!MSTR.loaded;
  bExpH.addEventListener('click',exportPcaHeader);

  /* ONE GUIDED FRONT DOOR (v1.45.0)
     Mike: "Put build/import/export/assign-panel actions in a guided
     wizard."

     What was here was eleven buttons in one bar and two long paragraphs
     explaining which of them to press. The four jobs those buttons serve —
     build sequences, import a config, export, assign panels — now have one
     door that asks which you came for and then walks it
     (maestro/wizard-import.js jobwizOpen).

     COLLAPSE, DON'T HIDE. Every one of the eleven is still here, in a
     disclosure directly underneath: one click on the summary, one on the
     button. Nothing was renamed and no id moved, so #btnCfgImport,
     #btnAssignPanels, #btnExpPca and #lnkMstrFull are the same elements
     doing the same jobs for whatever else reaches for them. */
  const doorBar = el('div','conbar');
  const bJob = el('button','b prim','Build, import, export or assign…');
  bJob.id = 'btnJobWiz';
  bJob.title = 'what do you want to do? — four jobs, each one walked through, '
             + 'with the specialist file formats behind Advanced';
  bJob.addEventListener('click',()=>{ if(typeof jobwizOpen === 'function') jobwizOpen(); });
  doorBar.appendChild(bJob);
  s0.appendChild(doorBar);
  const doorHint = el('div','hint prose');
  doorHint.innerHTML = '<b>' + xmlEsc(IO_FORMATS_SENTENCE) + '</b>';
  s0.appendChild(doorHint);

  if(isMaestroBuild) bar.appendChild(bImp);
  bar.appendChild(bCfg); bar.appendChild(bCfgX); bar.appendChild(bMap);
  if(!isMaestroBuild) bar.appendChild(bImp);
  bar.appendChild(bGen); bar.appendChild(bGenD); bar.appendChild(bGenA); bar.appendChild(bExp); bar.appendChild(bExpH);
  bar.appendChild(fin); bar.appendChild(seqOnly);
  const advIO = document.createElement('details');
  advIO.className = 'advio';
  advIO.id = 'maeAdvIO';
  const advSum = document.createElement('summary');
  advSum.textContent = 'all ' + bar.querySelectorAll('button').length + ' file buttons, one by one';
  advSum.title = 'the same actions the guided door above walks you through — '
               + 'every one of them, in a single bar, for when you already know which you want';
  advIO.appendChild(advSum);
  advIO.appendChild(bar);
  s0.appendChild(advIO);
  const msg=el('div','hint prose'); msg.id='maeMsg';
  /* WHAT THIS SENTENCE IS FOR NOW (v1.45.0). It used to be a paragraph of
     instructions about which button to press, in two build-dependent
     variants — and the guided door above is that paragraph's job. What is
     left is the STATE: what is loaded, or what to do first. */
  msg.innerHTML = MSTR.loaded
    ? MSTR.servoCount+' channels · '+MSTR.sequences.length+' sequence(s) · '+MSTR.subs.length+' subroutine(s)'
    : (isMaestroBuild
        ? 'Nothing loaded. <b>Import a config</b> above reads the file you saved from Maestro Control Center — or drop it anywhere on the window. No file yet? <b>Build sequences</b> offers a named starter layout whose subroutines 0–7 line up with the sketch.'
        : 'Nothing loaded. <b>Import a config</b> above reads the travel this app exports, and leaves your sequences and panel wiring alone — or drop the file anywhere on the window. No layout yet? <b>Build sequences</b> offers a named starter table to work from.');
  s0.appendChild(msg);
  if(!isMaestroBuild){
    const adv=el('div','hint');
    adv.innerHTML = 'Coming <b>from</b> a Maestro? The full settings import — channel table, endpoints and all — is still there: '
      + '<a href="#" id="lnkMstrFull">import a whole .mstr</a>. It replaces your channel table with theirs, which is why it is '
      + 'not a button on a build that has no Maestro in it.';
    s0.appendChild(adv);
    const a=adv.querySelector('#lnkMstrFull');
    if(a) a.addEventListener('click',e=>{ e.preventDefault(); impwizOpen(); });
  }

  if(!MSTR.loaded){
    const n=el('div','note cy prose');
    /* Control Center trivia, and only a Maestro builder needs it. On a PCA
       build the useful sentence is a different one. (v1.39.1) */
    n.innerHTML = isMaestroBuild
      ? '<b>Where sequences live.</b> Control Center keeps sequences in the Windows registry, not on the Maestro. They only reach a file when you <i>Save settings file</i>, and only reach the board via <b>Copy all Sequences to Script</b>. If your file has a script but no <code>&lt;Sequences&gt;</code>, the sim rebuilds the timelines by decoding the <code>sub</code> blocks instead.'
      : '<b>Nothing to import? Start from a table.</b> A servo config carries travel for channels that already exist, so on a fresh build make the layout first — <b>Body starter</b> or <b>Dome starter</b> — then import the travel onto it, or measure it on the bench. The two are the same channel table seen from either end.';
    host.appendChild(n);
    return;
  }

  /* --- which source drives the droid --- */
  const s1=sect(host,'Script source');
  [['imported','Imported subroutines — restartScript(n) plays sub n'],
   ['builtin','Built-in stand-ins — pick per slot in Config']].forEach(([v,label])=>{
    const l=el('label','sw');
    const r=document.createElement('input'); r.type='radio'; r.name='maesrc'; r.checked=(CFG.maestroSource===v);
    r.addEventListener('change',()=>{ if(r.checked){ CFG.maestroSource=v; lg('sys','maestro source → '+v); buildOutputs(); } });
    l.appendChild(r); l.appendChild(document.createTextNode(label));
    s1.appendChild(l);
  });

  /* Subroutine index used to live here as its own table — folded into the
     unified Sequences list above (2026-08-14): the sub name and reachability
     are now per-row (badge + .sub span), and the frame_* helper subs (which
     have no sequence of their own) are no longer surfaced in the UI —
     MSTR.subs still carries them for genScript()/reindexSubs() callers. */

  /* --- the servo hardware bench (folded in from PCA Studio, 2026-08-12) --- */
  const sHw = sect(host,'Servo hardware','the channel table, live');
  const hwBar = el('div','conbar');
  /* WHICH DOOR IS THIS, HONESTLY (v1.45.0)
     The #hwWrap "Servo hardware" overlay is gone: the six-step bench IS the
     servo setup now, and its Channels step (4) is the live channel table
     this button always meant. hwOpen() survives as an alias, so the change
     here is not about avoiding a crash — it is about the label telling the
     truth. "Open the servo bench…" says nothing about whether you are
     about to CREATE a config or EDIT one you already measured, and that is
     the only thing a builder wants to know before clicking.

     WHAT COUNTS AS "you already have one" — setupSaveWorth(), not travel
     alone. Mike, v1.38.3: he had named and ticked four channels and not yet
     been round the dial, and a gate that counted only non-default travel
     decided he had done nothing. A table with names and parts in it is a
     config you edit; it is not a setup you start again. servoCfgConfigured()
     stays as the fallback for any host that has no bench loaded. */
  const worth  = (typeof setupSaveWorth === 'function') ? setupSaveWorth() : null;
  const trav   = (typeof servoCfgConfigured === 'function') ? servoCfgConfigured() : 0;
  const already = worth ? (worth.worth ? (trav || worth.used) : 0) : trav;
  const bHw = el('button','b prim', already ? 'Edit current servo config…' : 'Set up servo hardware…');
  bHw.title = (already
      ? already + ' channel(s) already carry travel. '
      : 'No travel measured yet. ')
    + 'The live channel table: drive a servo, watch where it actually is, '
    + 'and set the endpoints, speed, release and ease that go into sequences.h';
  bHw.addEventListener('click',()=>setupOpen(4));
  hwBar.appendChild(bHw);
  sHw.appendChild(hwBar);
  const hHw = el('div','hint prose');
  hHw.innerHTML = 'Everything PCA Studio does, against <b>this</b> droid\'s channels. '
    + 'Drag a drive slider and the bar beside it shows where the servo actually is — the engine\'s '
    + 'model of the board with nothing plugged in, the servo itself once something is. '
    + '<b>release</b> and <b>ease</b> have always been exported into <code>sequences.h</code>; '
    + 'this is the first place you can set them.';
  sHw.appendChild(hHw);

  /* --- channel → droid part mapping --- */
  buildChannelMap(sect(host,'Outputs → moving parts','drag a slider to test it'));

  /* --- sequence list --- */
  const s5=sect(host,'Generated script','Control Center format');
  const pre=el('pre','gen', genScript(MSTR.sequences, enabledChannels()));
  s5.appendChild(pre);
  const bar5=el('div','conbar');
  const bCopy=el('button','b','Copy script');
  bCopy.addEventListener('click',()=>{
    navigator.clipboard.writeText(genScript(MSTR.sequences, enabledChannels())).then(
      ()=>{ const m=$('maeMsg'); if(m) m.textContent='Script copied — paste it into the Control Center Script tab.'; },
      ()=>{ const m=$('maeMsg'); if(m) m.textContent='Clipboard blocked; select the text above instead.'; });
  });
  bar5.appendChild(bCopy);
  s5.appendChild(bar5);
}

/* ------------------------------------------------- channel → part mapping
   The point of this table is that a Maestro channel number means nothing on
   its own: you have to see which flap actually moves. Every row carries a
   test slider that drives the model straight away, so you can walk the board
   channel by channel and label it from what you see. */
function cadPartsFor(act){
  if(typeof CAD==='undefined' || !CAD.loaded) return 0;
  return CAD.moving.filter(m=>m.act===act).length;
}
function buildChannelMap(host){
  const bar=el('div','conbar');
  const bAuto=el('button','b','Auto-map by name');
  bAuto.title='Re-run the name matcher over every channel';
  bAuto.addEventListener('click',()=>{
    let n=0;
    MSTR.channels.forEach(c=>{ const g=guessPart(c.name); if(g && g!==c.act){ c.act=g; n++; } });
    rebuildMaestroUI();
    const m=$('maeMsg'); if(m) m.textContent = n ? n+' channel(s) re-matched from their names.' : 'No changes — every name already matched.';
  });
  const bClear=el('button','b','Clear all');
  bClear.addEventListener('click',()=>{ MSTR.channels.forEach(c=>c.act=''); rebuildMaestroUI(); });
  const bServo=el('button','b','All to Servo');
  bServo.title='Switch every Input/Output channel to Servo mode so it can drive a panel';
  bServo.addEventListener('click',()=>{
    MSTR.channels.forEach(c=>{ if(!/^servo/i.test(c.mode)){ c.mode='Servo'; c.homemode='Goto'; c.home=c.min; } });
    rebuildMaestroUI();
  });
  const bHome=el('button','b','Home all');
  bHome.addEventListener('click',()=>{
    /* v1.45.0 — "home" is where the thing RESTS, which for a channel the
       board leaves alone at power-up is not mid-travel. chanRest() obeys an
       explicit Goto home and answers for the actuator otherwise. */
    MSTR.channels.forEach(c=>{ const h=chanRest(c); EDIT.live[c.i]=h; if(c.act) ACT_T[c.act]=chanNorm(c,h); });
    rebuildMaestroUI();
  });
  [bAuto,bClear,bServo,bHome].forEach(b=>bar.appendChild(b));
  host.appendChild(bar);

  const hdr=el('div','maerow wide');
  [['ci','#'],['cn','Channel'],['cn','Drives'],['cn','inv'],['cn','Test'],['mv','Part']]
    .forEach(([cls,txt])=>{ const e=el('div',cls,txt); e.style.color='var(--dimmer)'; e.style.fontSize='9px'; e.style.textTransform='uppercase'; hdr.appendChild(e); });
  host.appendChild(hdr);

  let hidden=0;
  MSTR.channels.forEach(c=>{
    if(!/^servo/i.test(c.mode)){ hidden++; return; }
    const r=el('div','maerow wide');
    r.appendChild(el('div','ci',c.i));

    const nm=el('div','cn',c.name);
    nm.title=c.name+'  ('+c.min+'–'+c.max+' qus = '+qus(c.min)+'–'+qus(c.max)+')  — click to rename';
    nm.style.cursor='text';
    nm.addEventListener('click',async ()=>{
      const v=await appPrompt('Channel '+c.i+' name (this is what the name matcher reads):',
        {title:'Rename channel', value:c.name, yes:'Rename'});
      if(v!==null && v.trim()){ c.name=v.trim(); rebuildMaestroUI(); }
    });
    r.appendChild(nm);

    const sel=document.createElement('select');
    /* the '' none-option: PART_LIST[0] is ['—',''] whichever route the rest
       of the list takes below, so this stays byte-identical either way */
    const [noneLabel,noneKey] = PART_LIST[0];
    const o0=document.createElement('option'); o0.value=noneKey; o0.textContent=actLabel(noneLabel,noneKey);
    if(c.act===noneKey) o0.selected=true;
    sel.appendChild(o0);
    /* v1.4x — Mike: "the attached doesnt appear to match what I configured"
       (see the Part-column comment below) applied here too: PART_LIST's
       hand-written labels drift from the CAD ("Dome pie 1" where partLabel
       now says "Pie 1") and never learn a rename. chPartOptions() is the
       same dynamic, CAD-driven, rename-aware list chPicker() in
       app/boards.js already builds from — one source for every "what does
       this channel drive" dropdown in the app. The CAD name rides in the
       tooltip, not the label (chPartOptions' own comment: leading every
       option with "Pie 2  (Pie5)" made four of them look identical).
       PCA Studio never opens this pane at all (it has no droid/CAD — see
       maestro/hw-ui.js's header comment), but CAD.loaded can still be false
       for a moment inside the sim itself, before loadCadFromPayload()
       resolves — either way, PART_LIST is the fallback so this dropdown is
       never left holding only the ten "Other" placeholders. */
    const cadReady = typeof CAD!=='undefined' && CAD.loaded && typeof chPartOptions==='function';
    if(cadReady){
      const grpOther=document.createElement('optgroup'); grpOther.label='Not on the model';
      chPartOptions().forEach(op=>{
        const o=document.createElement('option'); o.value=op.act; o.textContent=op.label;
        if(op.cad) o.title=op.cad;
        if(c.act===op.act) o.selected=true;
        (op.other ? grpOther : sel).appendChild(o);
      });
      if(grpOther.childElementCount) sel.appendChild(grpOther);
    }else{
      /* label every option with the CAD part it moves — "pie 0" on its own means
         nothing at the bench, "Dome pie 1 · MainPie3" does */
      PART_LIST.forEach(([label,key])=>{
        if(!key) return;                                    // the none-option is already in, above
        const o=document.createElement('option'); o.value=key; o.textContent=actLabel(label,key);
        if(c.act===key) o.selected=true; sel.appendChild(o);
      });
      /* v1.40.0 — Mike: "option to choose others that are not part of the
         model, say Other 1 through 10" (core/actuators.js OTH_KEYS). PART_LIST
         is the droid's own parts, so these ten group apart in their own
         optgroup rather than being spliced into that list. */
      if(typeof OTH_KEYS !== 'undefined' && OTH_KEYS.length){
        const grpOther=document.createElement('optgroup'); grpOther.label='Not on the model';
        OTH_KEYS.forEach((key,i)=>{
          const o=document.createElement('option'); o.value=key; o.textContent='Other '+(i+1);
          if(c.act===key) o.selected=true; grpOther.appendChild(o);
        });
        sel.appendChild(grpOther);
      }
    }
    sel.title = actTip(c.act);
    sel.addEventListener('change',()=>{
      const v = sel.value;
      // v1.39.5: a part has exactly one channel — clear-then-set, same as HW.setPart
      if(v) MSTR.channels.forEach(o=>{ if(o!==c && o.act===v) o.act=''; });
      c.act = v; rebuildMaestroUI();
    });
    r.appendChild(sel);

    /* v1.46.0 — `invert` is retired (chanNorm, playback.js). Reversing a
       linkage IS min and max the other way round, which is what the bench's
       own REV tick does, so this one does the same thing. */
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=c.min>c.max; cb.title='reverse — the linkage runs the other way; swaps this channel’s two ends';
    cb.addEventListener('change',()=>{ const t=c.min; c.min=c.max; c.max=t; if(c.act) ACT_T[c.act]=chanNorm(c, EDIT.live[c.i]); });
    r.appendChild(cb);

    const sl=document.createElement('input');
    sl.type='range'; sl.min=Math.min(c.min,c.max); sl.max=Math.max(c.min,c.max); sl.step=4;
    sl.value=EDIT.live[c.i]!==undefined?EDIT.live[c.i]:c.home;
    sl.disabled=!c.act;
    sl.title=c.act?'drag to drive this channel — the droid follows':'map a part first';
    sl.addEventListener('input',()=>{
      const v=+sl.value; EDIT.live[c.i]=v;
      if(c.act) ACT_T[c.act]=chanNorm(c,v);
      sl.title = qus(v)+' — the droid follows as you drag';
    });
    r.appendChild(sl);

    /* WHICH NAME GOES IN THIS COLUMN (v1.39.3)
       Mike, of a table whose Drives column said "Dome pie 2, 3, 4, 5" while
       this one said "Pie5" four times over: "the attached doesnt appear to
       match what I configured."

       Nothing was wrong with the mapping — this cell showed the CAD name,
       and four of the six inner pies are all literally called Pie5 in
       MrBaddeley's Fusion export (cad/naming.js says so at the top). A
       column that repeats one name down four rows reads as a bug whatever
       its provenance, and it is the wrong name to lead with anyway: the
       useful one is what the BUILDER calls that panel — their rename, or
       the build's own "Pie 2" — which is also what the brick, the wiring
       sheet and the Panels table all say. The CAD name is still one hover
       away, where it belongs for anyone matching this to a Fusion tree. */
    const n = c.act ? cadPartsFor(c.act) : 0;
    const cadNm = c.act ? actCadName(c.act) : '';
    const lbl   = (c.act && typeof actPartLabel === 'function') ? actPartLabel(c.act) : '';
    const shown = lbl || cadNm;
    const st = el('div','mv'+(c.act ? (n?' ok':' no') : ''),
      shown ? (shown.length > 11 ? shown.slice(0,10)+'…' : shown) : (c.act ? 'proc' : '—'));
    st.title = !c.act ? 'not mapped'
      : n ? (shown + (cadNm && cadNm !== shown ? '\nCAD: ' + cadNm : '') + '\n' + actTip(c.act))
          : 'no CAD part carries this actuator — the procedural droid still shows it';
    r.appendChild(st);

    host.appendChild(r);
  });

  const wbar=el('div','conbar');
  const bWire=el('button','b','Wiring sheet');
  bWire.title='A printable table: actuator, CAD part name, position on the droid, and the channel it is on';
  bWire.addEventListener('click',()=>{ const f=downloadWiring('html');
    const m=$('maeMsg'); if(m) m.textContent='Saved '+f+' — open it and print, or keep it on a tablet at the bench.'; });
  const bWireC=el('button','b','…as CSV');
  bWireC.addEventListener('click',()=>{ const f=downloadWiring('csv');
    const m=$('maeMsg'); if(m) m.textContent='Saved '+f+'.'; });
  wbar.appendChild(bWire); wbar.appendChild(bWireC);
  host.appendChild(wbar);

  const mapped = MSTR.channels.filter(c=>c.act).length;
  const h=el('div','hint prose');
  h.innerHTML = '<b>'+mapped+'</b> of '+MSTR.channels.length+' channels drive something.'
    + (hidden ? ' <b>'+hidden+'</b> channel(s) are set to Input/Output and are hidden — <b>All to Servo</b> brings them in.' : '')
    + ' Drag a <b>Test</b> slider and the mapped part moves on the model immediately, which is the quickest way to label a board you have already wired: sweep a channel, see what opens, name it here.'
    + ' <b>Part</b> is the name the piece has in your Fusion model — hover it for the bearing from the front and which hinge it uses. <b>proc</b> means the actuator exists but no CAD part claims it.'
    + ' The actuator IDs are numbered by position round the droid, not by the CAD\'s numbering, so <b>pie 0</b> is <b>MainPie3</b> — the <b>Wiring sheet</b> prints both side by side.';
  host.appendChild(h);
}

/* the subroutine table is generated from the LOADOUT, not the library — a
   routine you are still building in the sequencer has no subroutine number
   until you put it on the board (Mike, 2026-07-27) */
function reindexSubs(){ rebuildSubIndex(); }

/* The import door. With no config loaded the file IS your config and goes
   in whole. With one loaded, the choice is the user's (Mike, 2026-08-08):
   servo settings are personal calibration, sequences are portable — so the
   default posture is "their art, your endpoints", and replacing your
   channel table takes an explicit second confirmation. */
async function mstrImportChoice(P){
  if(!MSTR.loaded){ mstrApply(P); return 'all'; }
  const seqs = P.sequences.length;
  const wantAll = !(await appConfirm(
    P.fileName+' carries its own servo settings (endpoints, homes, speeds) and '
    +seqs+' sequence(s).\n\nSequences only plays their moves through YOUR servo '
    +'settings. Everything replaces your channel table with theirs.',
    {title:'Import what?', yes:'Sequences only', no:'Everything…'}));
  if(!wantAll){ mstrAdoptSequences(P); return 'seq'; }
  const sure = await appConfirm(
    'Replace the servo settings for '+MSTR.servoCount+' channel(s) — endpoints, '
    +'homes, speeds and accelerations — with the ones in '+P.fileName+'?\n\n'
    +'Those numbers are tuned to a specific droid\'s linkages. If this file is '
    +'not from YOUR board, your calibration is lost (export a backup first).',
    {title:'Overwrite your servo settings?', yes:'Overwrite', no:'Cancel', danger:true});
  if(!sure) return 'cancel';
  mstrApply(P);
  return 'all';
}
function readMstrFile(file){
  const fr=new FileReader();
  fr.onload=async ()=>{
    try{
      const P = mstrParse(String(fr.result), file.name);
      const did = await mstrImportChoice(P);
      if(did === 'cancel'){ toast('Import cancelled — your servo settings are untouched'); return; }
      if(did === 'all') CFG.maestroSource='imported';
      rebuildMaestroUI();
      document.querySelector('#tabs button[data-p="pMae"]').click();
      const ms=$('maeMsg');
      if(did === 'seq'){
        if(ms) ms.textContent='Adopted the sequences from '+file.name+' onto your servo settings — find them in the sequencer library.';
        toast('Adopted '+P.sequences.length+' sequence(s) from '+file.name+' — playing through YOUR servo settings');
      }else{
        if(ms) ms.textContent='Imported '+file.name+'. Check the channel mapping below, then tap RT/LT + d-pad.';
        toast('Imported '+file.name+' — '+MSTR.servoCount+' channels, '+MSTR.sequences.length+' sequence(s)');
      }
    }catch(e){
      lg('warn','import failed: '+e.message);
      buildMaestroPane();
      const m=$('maeMsg'); if(m){ m.style.color='var(--rd)'; m.textContent='Could not read that file: '+e.message; }
      toast('Could not read '+file.name+': '+e.message, 'err');
    }
  };
  fr.readAsText(file);
}
function exportMstr(){
  reindexSubs();
  const text = mstrBytes(buildMstrText());
  const blob = new Blob([text], {type:'text/xml'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  /* v1.45.0 — Mike: "Add date and time, without seconds, to saved/exported
     filenames." The .mstr is the file that gets carried to a Windows box and
     loaded in Control Center; two of them called the same thing, one of which
     is yesterday's endpoints, is a servo driven into the shell. */
  a.download = MSTR.fileName.replace(/\.mstr$/i,'') + '-' + fileStamp() + '.mstr';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  lg('mae','exported '+a.download+' — '+MSTR.sequences.length+' sequences, '+MSTR.subs.length+' subroutines');
  toast('Exported '+a.download+' — verify endpoints on YOUR hardware before running at speed', 'warn');
  const lintNote = (typeof exportLintNote === 'function') ? exportLintNote() : '';
  if(lintNote) lg('warn','  '+lintNote.replace(/<[^>]+>/g,''));
  const m=$('maeMsg'); if(m){ m.innerHTML='Exported <b>'+a.download+'</b> — open it in Control Center, then Apply Settings. '+
    '<b style="color:var(--am)">Before running at speed: verify every servo\'s endpoints and direction on YOUR hardware.</b> '+
    'The travel values in this file are simulator placeholders, and a wrong endpoint can stall a servo against the shell.'+
    lintNote + EXPORT_PORTABILITY_NOTE; }
}
