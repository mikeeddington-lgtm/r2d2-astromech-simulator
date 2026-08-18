/* Sharing .mstr files between builders (v1.21.0)
   ---------------------------------------------------------------------
   Mike, 2026-08-08: "servo settings are unique to each person … a person
   imports another person's scripts / sequences and those use the current
   builder's servo settings … export should by default use the person's
   servo settings and not generic or ones imported from other people."

   Covers: parse-without-apply, the sequences-only adoption (retargeting
   maths incl. an inverted mounting, act/name/index matching, unmatched
   channels dropped, per-frame speed rows discarded, loadout untouched),
   the two-dialog UI flow (choice, then overwrite confirm), cancel leaving
   everything untouched, and export writing YOUR channel table after an
   adoption. */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog', async d=>await d.accept());
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  const ev = f => page.evaluate(f);
  await ev(()=>{ buildSet('domeServo','mini24'); buildSet('sound','dysv5w'); wizFinish(); });
  await page.waitForTimeout(300);
  await ev(()=>{ loadProfile('maestro25'); setBoard('mini24'); makeStarter('dome','mini24'); });
  await page.waitForTimeout(300);

  /* A "foreign" file: same part names, different person's calibration.
     ch0 shifted + narrower; ch1 INVERTED (their open drives down); ch2 a
     name my board does not have. Built in-page so the fixture and the
     expectations use the same numbers. */
  const F = await ev(()=>{
    window.__mine = JSON.parse(JSON.stringify(MSTR.channels.map(c=>({i:c.i,min:c.min,max:c.max,home:c.home,name:c.name,act:c.act}))));
    const ch = (name,min,max,home)=>'<Channel name="'+name+'" mode="Servo" min="'+min+'" max="'+max+'" homemode="Goto" home="'+home+'" speed="19" acceleration="4" neutral="'+home+'" range="1905" />';
    const names = MSTR.channels.slice(0,2).map(c=>c.name);
    const xml = '<UscSettings version="1"><NeverSuspend>false</NeverSuspend><SerialMode>UART_FIXED_BAUD_RATE</SerialMode>'
      +'<Channels MiniMaestroServoPeriod="80000" ServoMultiplier="1">'
      + ch(names[0], 4200, 7800, 4200)              // their ch0: closed at min, open at max
      + ch(names[1], 4400, 8000, 8000)              // their ch1: closed at MAX — inverted
      + ch('NoSuchPartHere', 4000, 8000, 4000)      // their ch2: nothing of mine matches
      +'</Channels>'
      +'<Sequences><Sequence name="Their wave"><Frame name="f0" duration="400">7800 4400 5000</Frame>'
      +'<Frame name="f1" duration="400">6000 6200 0 s 10 10 10 a 2 2 2</Frame></Sequence></Sequences>'
      +'<Script ScriptDone="true"></Script></UscSettings>';
    window.__P = mstrParse(xml, 'their-droid.mstr');
    return {chans:__P.channels.length, seqs:__P.sequences.length,
            myCount: MSTR.servoCount, mySeqs: MSTR.sequences.length};
  });
  ok('a foreign file parses WITHOUT touching the loaded config', F.chans===3 && F.seqs===1, JSON.stringify(F));
  ok('…MSTR is still mine after the parse', await ev(()=>
    MSTR.servoCount === __mine.length &&
    MSTR.channels.every((c,k)=> c.min===__mine[k].min && c.max===__mine[k].max && c.home===__mine[k].home)));

  console.log('\n════ sequences-only adoption ════');
  const adopt = await ev(()=>{
    const before = {
      seqs: MSTR.sequences.length,
      loadout: JSON.stringify(MSTR.loadout),
      table: JSON.stringify(MSTR.channels.map(c=>[c.min,c.max,c.home,c.speed,c.acceleration]))
    };
    const r = mstrAdoptSequences(__P);
    const sq = MSTR.sequences.find(s=>s.name==='Their wave');
    /* expected values computed through the SAME closed→open transform the
       spec demands, from both sides' own tables */
    const map = (srcI, v)=>{
      const a = __P.channels[srcI], d = MSTR.channels.find(c=>c.act===a.act);
      /* the SOURCE side keeps the home heuristic (mstrSrcEnds — a foreign
         Control Center pair is always sorted, home is the only tell); MY
         side is the directed pair (blockClosed/blockOpen, v1.46.0) */
      const eA=mstrSrcEnds(a), cA=eA.shut, oA=eA.open, cY=blockClosed(d), oY=blockOpen(d);
      const n = Math.max(0, Math.min(1, (v-cA)/(oA-cA)));
      const lo=Math.min(d.min,d.max), hi=Math.max(d.min,d.max);
      return {i:d.i, v:Math.max(lo, Math.min(hi, Math.round(cY + n*(oY-cY))))};
    };
    const e0 = map(0, 7800), e1 = map(1, 4400), e0b = map(0, 6000), e1b = map(1, 6200);
    const f0 = sq.frames[0].targets, f1 = sq.frames[1].targets;
    return {
      r, before,
      after: {
        seqs: MSTR.sequences.length,
        loadout: JSON.stringify(MSTR.loadout),
        table: JSON.stringify(MSTR.channels.map(c=>[c.min,c.max,c.home,c.speed,c.acceleration]))
      },
      cat: sq.cat, noBlocks: !sq.blocks,
      f0ok: f0[e0.i]===e0.v && f0[e1.i]===e1.v,
      f1ok: f1[e0b.i]===e0b.v && f1[e1b.i]===e1b.v,
      /* their full-open on the inverted channel must land at MY open —
         whichever numeric end that is — not at my numeric max */
      invertedLandsOpen: f0[e1.i] === (function(){ const d=MSTR.channels.find(c=>c.act===__P.channels[1].act); return blockOpen(d); })(),
      speedsDropped: sq.frames.every(f=>!f.speeds && !f.accels),
      untouchedStaysZero: f1[map(2,1).i] === undefined || true
    };
  });
  ok('adoption appends under an Imported · category, as a plain frame list',
     adopt.cat==='Imported · their-droid' && adopt.noBlocks && adopt.after.seqs===adopt.before.seqs+1);
  ok('my channel table is byte-identical after adoption', adopt.after.table===adopt.before.table);
  ok('the loadout (what reaches the board) is untouched', adopt.after.loadout===adopt.before.loadout);
  ok('targets are re-expressed through MY closed→open throw', adopt.f0ok && adopt.f1ok);
  ok('an inverted mounting comes out the right way round', adopt.invertedLandsOpen);
  ok('their per-frame speed/accel rows are discarded — my limits govern', adopt.speedsDropped);
  ok('their unmatched channel was dropped, and reported', adopt.r.unmatched.length===1 && adopt.r.unmatched[0]===2);
  /* 2026-08-18: an exact NAME match outranks the guessed act — a src act is
     always guessPart(name), and trusting the guess over the authored name
     cross-wired Mike's own round-trip (his "Panel7" drives `panel11`, not
     the `panel6` the guess reads). This fixture's names are copied from my
     table, so both channels now pair by name; the meaning is unchanged. */
  ok('matching preferred the authored name, then the part, over the channel number',
     (adopt.r.how.name + adopt.r.how.act) >= 2 && adopt.r.how.index === 0, JSON.stringify(adopt.r.how));
  ok('adopting again never overwrites — the name grows a dot', await ev(()=>{
    mstrAdoptSequences(__P);
    return MSTR.sequences.some(s=>s.name==='Their wave·');
  }));

  console.log('\n════ the two dialogs on the quick import path ════');
  const dlg1 = await ev(()=>{
    window.__done = null;
    mstrImportChoice(__P).then(r=>{ __done = r; });
    const d = document.querySelector('.dlgcard');
    return {up: !!d, yes: d && d.querySelector('.dlgyes').textContent,
            no: d && d.querySelector('.dlgno').textContent,
            title: d && d.querySelector('h4').textContent};
  });
  ok('with a config loaded, import opens the choice dialog',
     dlg1.up && dlg1.title==='Import what?' && /Sequences only/.test(dlg1.yes) && /Everything/.test(dlg1.no), JSON.stringify(dlg1));
  await page.click('.dlgcard .dlgyes');                     // Sequences only
  await page.waitForTimeout(120);
  ok('choosing Sequences only adopts and resolves "seq"', await ev(()=>
    __done==='seq' && MSTR.sequences.some(s=>s.name==='Their wave··')));

  const dlg2 = await ev(()=>{
    window.__done = null;
    mstrImportChoice(__P).then(r=>{ __done = r; });
    return !!document.querySelector('.dlgcard');
  });
  ok('asking again for Everything raises the overwrite confirm', dlg2);
  await page.click('.dlgcard .dlgno');                      // Everything…
  await page.waitForTimeout(120);
  const confirm2 = await ev(()=>{
    const d = document.querySelector('.dlgcard');
    return {up: !!d, danger: d && d.classList.contains('danger'),
            title: d && d.querySelector('h4').textContent};
  });
  ok('…a SECOND, danger-styled dialog', confirm2.up && confirm2.danger && /Overwrite/.test(confirm2.title), JSON.stringify(confirm2));
  await page.click('.dlgcard .dlgno');                      // Cancel
  await page.waitForTimeout(120);
  ok('cancelling leaves my table and resolves "cancel"', await ev(()=>
    __done==='cancel' && MSTR.channels.every((c,k)=> c.min===__mine[k].min && c.max===__mine[k].max)));

  console.log('\n════ everything, confirmed ════');
  await ev(()=>{ window.__done=null; mstrImportChoice(__P).then(r=>{ __done=r; }); });
  await page.click('.dlgcard .dlgno');                      // Everything…
  await page.waitForTimeout(120);
  await page.click('.dlgcard .dlgyes');                     // Overwrite
  await page.waitForTimeout(120);
  ok('confirming replaces the channel table with theirs', await ev(()=>
    __done==='all' && MSTR.servoCount===3 && MSTR.channels[0].min===4200 && MSTR.channels[1].home===8000));

  console.log('\n════ export always speaks with the current table ════');
  ok('the exported XML carries the loaded channel settings, no ghosts', await ev(()=>{
    reindexSubs();
    const xml = buildMstrText();
    return /min="4200"/.test(xml) && /home="8000"/.test(xml) && !/NoSuchGhost/.test(xml);
  }));
  ok('…and after restoring MY config, my numbers again', await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    const xml = buildMstrText();
    const c0 = MSTR.channels[0];
    return new RegExp('min="'+c0.min+'"').test(xml) && !/min="4200"/.test(xml);
  }));

  console.log('\n════ no config yet = no dialog, file goes in whole ════');
  ok('first-ever import applies everything without asking', await ev(async ()=>{
    MSTR.loaded = false;
    const r = await mstrImportChoice(__P);
    return r==='all' && MSTR.loaded && MSTR.servoCount===3 && !document.querySelector('.dlgcard');
  }));

  /* =================================================================
     v1.45.0 — the same contract mstrAdoptSequences() and
     mstrMatchChannels() already honour, extended to the new PCA9685
     family: nothing crosses a format boundary in silence. The log is
     the receipt, and it names the fields.
     ================================================================= */
  console.log('\n════ v1.45.0 — crossing between families is reported, field by field ════');
  const rep = await ev(()=>{
    loadProfile('maestro25'); setBoard('mini24'); makeStarter('dome','mini24'); reindexSubs();
    if(typeof pcaHeaderParse !== 'function') return {missing:true};
    const before = LOG.length;
    const h = pcaGenFromLoadout();
    const r = servoCfgImportText(h, 'friend-sequences.h');
    const said = LOG.slice(before).map(e=>e.s).join(' | ');
    return {from:r.from, n:r.n, dropped:(r.dropped||[]).map(d=>d.field), said};
  });
  ok('a PCA9685 header lands in the servo-config reader, not the .mstr reader',
     rep.from === 'pca' && rep.n > 0, rep.from+' / '+rep.n);
  ok('the fields it could not carry are named in the log, not just counted',
     /neutral/.test(rep.said||'') && /range/.test(rep.said||''), (rep.said||'').slice(-160));
  ok('...and the reader hands the same list back to its caller',
     ['neutral','range','homemode','invert'].every(f=>(rep.dropped||[]).indexOf(f)>=0),
     (rep.dropped||[]).join(', '));

  /* =================================================================
     v1.46.0 — Mike: "when selecting Servo prompt if settings have
     already been imported or created that they will be replaced and
     offer the option to cancel or save a copy of existing, When
     importing Choreography give them the option to save existing and
     replace or add the imports as additions".

     "Save a copy" is a DOWNLOAD (his answer today), stamped by
     fileStamp() like every other writer, and it is a gate: no file, no
     import. Every assertion below is about what happens to the work
     already on the bench, which is the only thing these two prompts
     exist to protect.
     ================================================================= */
  console.log('\n════ v1.46.0 — the two prompts: cancel, save a copy, replace, or add ════');
  await ev(()=>{
    /* every download in this section is captured, never written */
    window.__dl = [];
    window.__aclick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){ window.__dl.push(this.download); };
  });
  const setup = () => ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24'); MSTR.loaded = true;
    loadoutReset(); reindexSubs();
    /* six channels round the dial, the rest named by the starter: that is
       "somebody did work here" by setupSaveWorth()'s definition */
    MSTR.channels.forEach((c,i)=>{ if(i < 6 && /^servo/i.test(c.mode)) c.calibrated = true; });
    if(typeof SETUP !== 'undefined'){ SETUP.changedAt = 0; SETUP.exportedAt = 0; }
    window.__dl.length = 0;
    /* THEIR file: travel that is not mine, plus two routines — one of which
       deliberately collides with a routine I already have */
    const clash = MSTR.sequences[0].name;
    const ch = n=>'<Channel name="'+n+'" mode="Servo" min="4111" max="7888" homemode="Goto" home="4111"'
      + ' speed="42" acceleration="4" neutral="4111" range="1905" />';
    const names = MSTR.channels.slice(0,3).map(c=>c.name);
    window.__CLASH  = clash;
    window.__THEIRS = '<UscSettings version="1"><SerialMode>UART_FIXED_BAUD_RATE</SerialMode>'
      + '<Channels MiniMaestroServoPeriod="80000" ServoMultiplier="1">'
      + names.map(ch).join('')
      + '</Channels><Sequences>'
      + '<Sequence name="'+clash+'"><Frame name="f0" duration="500">7888 4111 5000</Frame></Sequence>'
      + '<Sequence name="Their salute"><Frame name="f0" duration="400">4111 7888 6000</Frame></Sequence>'
      + '</Sequences><Script ScriptDone="true"></Script></UscSettings>';
    /* and a servo config: travel only, no choreography in it at all */
    window.__CFG = (function(){
      const o = JSON.parse(JSON.stringify(servoCfgExportObj()));
      o.channels.forEach(c=>{ if(/^servo/i.test(c.mode||'')){ c.min = 4111; c.max = 7888; c.speed = 42; } });
      return JSON.stringify(o);
    })();
    return {clash:clash, seqs:MSTR.sequences.length,
            travel:JSON.stringify(MSTR.channels.map(c=>[c.min,c.max,c.speed])),
            names:JSON.stringify(MSTR.sequences.map(s=>s.name)),
            worth:impServoWorth()};
  });
  const start = (kind, key, name) => page.evaluate(a=>{
    window.__r = null;
    impChooseOpen({from:'test'});
    impChooseLoad(window[a.key], a.name);
    IMPCH.kind = a.kind;
    jobwizRender();
    impChooseRun().then(v=>{ window.__r = v; });
  }, {kind, key, name});
  const askUp   = id => page.waitForFunction('!!document.querySelector(\'.dlgcard [data-ask="'+id+'"]\')', {timeout:9000});
  const ask     = id => page.click('.dlgcard [data-ask="'+id+'"]');
  const settled = async ()=>{ await page.waitForFunction('window.__r !== null', {timeout:20000}); return ev(()=>window.__r); };
  const state   = () => ev(()=>({
    dl: window.__dl.slice(),
    travel: JSON.stringify(MSTR.channels.map(c=>[c.min,c.max,c.speed])),
    names: JSON.stringify(MSTR.sequences.map(s=>s.name)),
    seqNames: MSTR.sequences.map(s=>s.name),
    min0: MSTR.channels[0].min, speed0: MSTR.channels[0].speed,
    loadout: loadoutNames().length,
    log: LOG.slice(-14).map(e=>e.s).join(' | ')
  }));

  const S = await setup();
  ok('a starter table with names and six ticked channels IS work worth keeping',
     S.worth.worth === true && S.worth.named > 0 && S.worth.cal === 6, JSON.stringify(S.worth));

  await start('servo','__CFG','friend-servos.json');
  await askUp('cancel');
  const sp = await ev(()=>{
    const d = document.querySelector('.dlgcard');
    return {ask: Array.from(d.querySelectorAll('[data-ask]')).map(b=>b.dataset.ask),
            labels: Array.from(d.querySelectorAll('[data-ask]')).map(b=>b.textContent),
            msg: d.querySelector('.dlgmsg').textContent,
            danger: d.classList.contains('danger')};
  });
  ok('the servo prompt offers three ways out — cancel, save a copy first, replace',
     sp.ask.join(',') === 'cancel,save,replace' && sp.danger === true, sp.labels.join(' | '));
  ok('...and says plainly what is about to be replaced, in counts he recognises',
     /named channel/.test(sp.msg) && /calibrated/.test(sp.msg) && /REPLACES/.test(sp.msg),
     sp.msg.replace(/\n/g,' ').slice(0,140));
  await ask('cancel');
  ok('cancel really cancels — nothing imported, nothing written', await settled() === 'cancel');
  const c1 = await state();
  ok('...and the channel table is byte-identical', c1.travel === S.travel);
  ok('...and no file was written either', c1.dl.length === 0, JSON.stringify(c1.dl));

  await start('servo','__CFG','friend-servos.json');
  await askUp('save');
  await ask('save');
  ok('"save a copy first, then import" then imports', await settled() === 'done');
  const c2 = await state();
  ok('...having written a timestamped servo config on the way past',
     c2.dl.length === 1 && /^R2-servos-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(c2.dl[0]), c2.dl.join(' '));
  ok('...and the travel really is theirs now', c2.min0 === 4111 && c2.speed0 === 42,
     c2.min0 + ' / ' + c2.speed0);
  ok('"servo config only" left the choreography exactly as it was', c2.names === S.names);

  await setup();
  await ev(()=>{ window.__realCOU = URL.createObjectURL;
                 URL.createObjectURL = ()=>{ throw new Error('the disk is full'); }; });
  await start('servo','__CFG','friend-servos.json');
  await askUp('save');
  await ask('save');
  ok('a copy that cannot be written ABORTS the import', await settled() === 'savefailed');
  const c3 = await state();
  ok('...and the travel is untouched, so nothing was half-done', c3.travel === S.travel);
  ok('...and it says so rather than failing quietly',
     /could not be written/.test((await ev(()=>{
       const d = document.querySelector('.dlgcard');
       return d ? d.textContent : '';
     }))), 'dialog');
  await page.click('.dlgcard .dlgyes');
  await ev(()=>{ URL.createObjectURL = window.__realCOU; });

  console.log('\n════ v1.46.0 — choreography: add as additions, or save and replace ════');
  await setup();
  await start('choreography','__THEIRS','their-droid.mstr');
  await askUp('merge');
  const cp = await ev(()=>{
    const d = document.querySelector('.dlgcard');
    return {ask: Array.from(d.querySelectorAll('[data-ask]')).map(b=>b.dataset.ask),
            labels: Array.from(d.querySelectorAll('[data-ask]')).map(b=>b.textContent),
            msg: d.querySelector('.dlgmsg').textContent};
  });
  ok('the choreography prompt offers save-and-replace, add-as-additions, and cancel',
     cp.ask.join(',') === 'cancel,save,merge', cp.labels.join(' | '));
  ok('...and promises that a clash is renamed rather than overwritten',
     /renamed, never/.test(cp.msg), cp.msg.replace(/\n/g,' ').slice(0,140));
  await ask('merge');
  ok('adding as additions imports', await settled() === 'done');
  const c4 = await state();
  ok('the merge ADDS — every routine I had is still in the library',
     JSON.parse(S.names).every(n=>c4.seqNames.indexOf(n) >= 0)
     && c4.seqNames.length === S.seqs + 2,
     c4.seqNames.length + ' of ' + (S.seqs + 2));
  ok('...a name clash is renamed, never overwritten', c4.seqNames.indexOf(S.clash + '·') >= 0,
     c4.seqNames.slice(-3).join(', '));
  ok('...and how it was named is said out loud, not merely counted',
     /renamed rather than overwritten/.test(c4.log) && c4.log.indexOf(S.clash + ' → ' + S.clash + '·') >= 0,
     c4.log.slice(-140));
  ok('"choreography only" left every endpoint I measured alone', c4.travel === S.travel);

  await setup();
  await start('choreography','__THEIRS','their-droid.mstr');
  await askUp('save');
  await ask('save');
  ok('"save existing, then replace" imports', await settled() === 'done');
  const c5 = await state();
  ok('...having written a timestamped choreography file first',
     c5.dl.length === 1 && /^R2-choreography-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(c5.dl[0]), c5.dl.join(' '));
  ok('...and the replace path really replaces — the imports ARE the library now',
     c5.seqNames.length === 2 && c5.seqNames.indexOf('Their salute') >= 0
     && c5.seqNames.indexOf(S.clash) >= 0, c5.seqNames.join(', '));
  ok('...with the loadout rebuilt from what arrived, so the board matches the library',
     c5.loadout === 2, String(c5.loadout));

  await setup();
  const pad = await ev(()=>{
    const base = MSTR.sequences[0];
    while(MSTR.sequences.length < 126)
      MSTR.sequences.push({name:'Pad ' + MSTR.sequences.length, frames:base.frames});
    return MSTR.sequences.length;
  });
  await start('choreography','__THEIRS','their-droid.mstr');
  await askUp('merge');
  await ask('merge');
  await page.waitForFunction('document.querySelector(".dlgcard h4") && /will not fit/i.test(document.querySelector(".dlgcard h4").textContent)', {timeout:9000});
  const big = await ev(()=>{
    const d = document.querySelector('.dlgcard');
    return {msg:d.querySelector('.dlgmsg').textContent, oneWay:!d.querySelector('.dlgno')};
  });
  await page.click('.dlgcard .dlgyes');
  ok('a merge past what the board can address is refused BEFORE it happens',
     await settled() === 'toobig');
  ok('...and it says the limit out loud, with one way out',
     /126/.test(big.msg) && big.oneWay === true, big.msg.replace(/\n/g,' ').slice(0,140));
  ok('...and nothing was truncated — the library is exactly as it was',
     await ev(()=>MSTR.sequences.length) === pad, String(pad));

  console.log('\n════ v1.46.0 — servo config AND choreography asks about each of them ════');
  await setup();
  await start('both','__THEIRS','their-droid.mstr');
  await askUp('replace');
  await ask('replace');
  await askUp('merge');
  await ask('merge');
  ok('both halves land', await settled() === 'done');
  const c6 = await state();
  ok('...the travel is theirs AND their routines are on the end of mine',
     c6.min0 === 4111 && c6.seqNames.length === S.seqs + 2, c6.min0 + ' / ' + c6.seqNames.length);

  const virgin = await ev(async ()=>{
    setBoard('mini24'); makeStarter('dome','mini24'); MSTR.loaded = true;
    /* an untouched table: no names of its own, nothing round the dial,
       factory travel, no edits. Nagging about a file nobody has changed is
       how people learn to click through dialogs without reading them. */
    MSTR.channels.forEach((c,i)=>{ c.name = 'Channel ' + i; c.calibrated = false;
                                   c.min = DEFAULT_MIN; c.max = DEFAULT_MAX; });
    if(typeof SETUP !== 'undefined') SETUP.changedAt = 0;
    const w = impServoWorth();
    impChooseOpen({from:'test'});
    impChooseLoad(window.__CFG, 'friend-servos.json');
    IMPCH.kind = 'servo';
    const r = await impChooseRun();
    return {worth:w.worth, r:r, dlg:!!document.querySelector('.dlgcard'), min:MSTR.channels[0].min};
  });
  ok('the servo prompt appears ONLY when there is work worth keeping',
     virgin.worth === false && virgin.r === 'done' && virgin.dlg === false && virgin.min === 4111,
     JSON.stringify(virgin));

  await ev(()=>{ HTMLAnchorElement.prototype.click = window.__aclick; });

  console.log('\n════ adopting our OWN sequences.h comes back the right way round (2026-08-18) ════');
  /* Mike exported sequences.h, re-imported it as choreography-only, and
     every panel came back REVERSED: a MaestroPCA header stores home 0
     (rest is computed, not stored), the parser maps that to 6000, and
     mstrSrcEnds() then invented a fictional mid-travel "shut" — so a
     round-trip of our own directed file was rescaled through the wrong
     ends. The home heuristic is only a directional TELL when the file
     actually measured one: an explicit Goto home inside the pair. */
  const hRt = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24'); reindexSubs();
    /* Mike's channels are BENCH-made: homemode Off, uneven offsets on the
       pair — which the generator writes as home 0, the shape that broke.
       The pair must be ASYMMETRIC about 6000 with min the further end
       (e.g. 4530–7293), because that is what flipped the invented ends. */
    const chans = MSTR.channels.filter(c=>/^servo/i.test(c.mode)).slice(0,3);
    /* names chosen so guessPart(name) DISAGREES with the wired act — Mike's
       real table does this ("Panel7" drives panel11): the round-trip must
       pair by the authored name, never by the guess */
    chans.forEach((c,k)=>{
      c.homemode='Off'; c.min = 4530 + k*11; c.max = 7293 - k*13;
      c.name = ['Panel7','Panel12','Panel9'][k]; c.autoName = false;
    });
    const mkT = pairs=>{ const a = new Array(MSTR.servoCount).fill(0); pairs.forEach(([i,v])=>a[i]=v); return a; };
    const probe = {name:'RT probe', frames:[
      {name:'f0', duration:400, targets: mkT([[chans[0].i, chans[0].min], [chans[1].i, chans[1].max], [chans[2].i, 6100]])},
      {name:'f1', duration:400, targets: mkT([[chans[0].i, chans[0].max], [chans[1].i, chans[1].min], [chans[2].i, chans[2].min]])}
    ]};
    MSTR.sequences.push(probe);
    loadoutReset(); MSTR.loadout = ['RT probe']; reindexSubs();
    const before = JSON.parse(JSON.stringify(probe));
    const h = pcaGenFromLoadout();
    const P = pcaHeaderParse(h, 'sequences.h');
    const nBefore = MSTR.sequences.length;
    mstrAdoptSequences(P);
    const twin = MSTR.sequences[nBefore];
    const bad = [];
    before.frames.forEach((f, j)=>{
      f.targets.forEach((v, ch)=>{
        const w = (twin && twin.frames[j] && twin.frames[j].targets[ch]) || 0;
        if((v||0) !== w && bad.length < 8) bad.push('f'+j+' ch'+ch+': '+v+' → '+w);
      });
    });
    /* clean back out so later state stays predictable */
    MSTR.sequences.length = nBefore - 1; loadoutReset(); reindexSubs();
    return {haveTwin: !!twin, bad};
  });
  ok('the adopted twin is target-for-target identical to the sequence it round-tripped from',
     hRt.haveTwin && hRt.bad.length === 0,
     JSON.stringify(hRt));

  console.log('\n════ the BRICKS survive a round trip (2026-08-18) ════');
  /* Mike, off the round-trip report: "could we not export teh Bricks info
     into the export files that are commented out - but when we import we
     can import them as bricks". The choreography .json always carried
     them; the .mstr and sequences.h now carry them as a comment; every
     reader re-attaches them ONLY when compiling the bricks against the
     DESTINATION table reproduces the imported frames exactly — otherwise
     the frames win and the bricks are dropped, by name. */
  const bk = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24'); reindexSubs();
    EDIT.seq = blockNewRoutine('Brick RT');
    const seq = MSTR.sequences[EDIT.seq];
    const acts = blockActions();
    blockAdd(seq, 'act', acts[0].act, 0,    {dur:900, rise:200, fall:200});
    blockAdd(seq, 'act', acts[1].act, 400,  {dur:700, mode:'o'});
    blockAdd(seq, 'act', acts[2].act, 1400, {dur:600, amp:0.35});
    blockSync(seq);
    loadoutReset(); MSTR.loadout = [seq.name]; reindexSubs();
    /* dense to the board's width: compiled frames are sparse arrays, a
       retargeted frame is a full one — 0 and a hole both mean untouched */
    const norm = s => JSON.stringify(s.frames.map(f=>{
      const t = []; for(let k=0;k<MSTR.servoCount;k++) t.push((f.targets||[])[k]||0);
      return [f.duration, t];
    }));
    const framesBefore = norm(seq);
    const xml = buildMstrText();
    const h = pcaGenFromLoadout();
    const P1 = mstrParse(xml, 'rt.mstr');
    const P2 = pcaHeaderParse(h, 'rt.h');
    const P3 = {fileName:'chor.json', servoCount:MSTR.servoCount,
                channels: JSON.parse(JSON.stringify(MSTR.channels)),
                sequences: JSON.parse(JSON.stringify([seq]))};
    const out = {xmlComment: xml.indexOf('r2sim:blocks') >= 0,
                 hComment: h.indexOf('r2sim:blocks') >= 0};
    const tryOne = (P, key)=>{
      const n0 = MSTR.sequences.length;
      mstrAdoptSequences(P);
      /* a .mstr carries the WHOLE library, so find OUR routine's twin by name */
      const twin = MSTR.sequences.slice(n0).find(s=>s.name.replace(/·+$/,'') === 'Brick RT');
      out[key] = {bricks: !!(twin && twin.blocks && twin.blocks.length === 3),
                  routine: !!(twin && blockIsRoutine(twin)),
                  frames: twin ? norm(twin) === framesBefore : false};
      MSTR.sequences.length = n0; reindexSubs();
    };
    tryOne(P1, 'mstr'); tryOne(P2, 'pca'); tryOne(P3, 'chor');
    /* the negative: slow MY channel after the export, so the travel floor
       changes — the bricks would compile DIFFERENT frames now, so they
       must be dropped and the imported frames kept verbatim */
    const c0 = blockChan(acts[0].act); const keepSpeed = c0.speed;
    c0.speed = 5;
    const n0 = MSTR.sequences.length;
    mstrAdoptSequences(P1);
    const twin = MSTR.sequences.slice(n0).find(s=>s.name.replace(/·+$/,'') === 'Brick RT');
    out.slowed = {bricks: !!(twin && twin.blocks), frames: twin ? norm(twin) === framesBefore : false};
    MSTR.sequences.length = n0; c0.speed = keepSpeed; reindexSubs();
    /* clean the probe out */
    MSTR.sequences.splice(EDIT.seq, 1); EDIT.seq = 0; loadoutReset(); reindexSubs();
    return out;
  });
  ok('the .mstr and the sequences.h both carry the bricks, commented out',
     bk.xmlComment && bk.hComment, JSON.stringify(bk));
  ok('a .mstr round trip comes back EDITABLE — bricks, routine, frames all intact',
     bk.mstr && bk.mstr.bricks && bk.mstr.routine && bk.mstr.frames, JSON.stringify(bk.mstr));
  ok('a sequences.h round trip comes back editable too',
     bk.pca && bk.pca.bricks && bk.pca.routine && bk.pca.frames, JSON.stringify(bk.pca));
  ok('a choreography .json round trip comes back editable too',
     bk.chor && bk.chor.bricks && bk.chor.routine && bk.chor.frames, JSON.stringify(bk.chor));
  ok('when the destination table has changed, the FRAMES win and the bricks are dropped',
     bk.slowed && !bk.slowed.bricks && bk.slowed.frames, JSON.stringify(bk.slowed));

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
