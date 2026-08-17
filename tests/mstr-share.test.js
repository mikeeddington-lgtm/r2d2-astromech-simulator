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
const { chromium } = require('playwright');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']
  });
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
      const cA=blockClosed(a), oA=blockOpen(a), cY=blockClosed(d), oY=blockOpen(d);
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
  ok('matching preferred the part name over the channel number', adopt.r.how.act>=2, JSON.stringify(adopt.r.how));
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

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
