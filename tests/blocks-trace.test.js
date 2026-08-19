/* FRAMES BACK INTO BRICKS (v1.49.0)
   ---------------------------------------------------------------------
   Mike, 2026-08-19: *"lets build it - but with two options the first is
   where we guess and another which highlights the issues and allows the
   user to use the bricks sequence to see them, accept them or change each
   issue"* — after being told that importing somebody else's .mstr gives
   you a hand-made frame list and no brick view.

   THE ONE PROPERTY WORTH PROVING. A conversion is a guess; what stops it
   being a bad one is that it is MEASURED. So the spine of this suite is a
   round trip in the other direction from tests/roundtrip.test.js: author a
   routine as bricks, compile it, throw the bricks away, and require the
   tracer to find its way back. On our own compiled frames that has to come
   out clean — if `blockTrace()` cannot re-derive a routine the compiler
   itself produced, it has no business guessing at a stranger's file.

   Everything else here is about the two doors and the honesty rules around
   them: the original frame list survives BOTH of them as a copy; a review
   can be discarded back to exactly what was there; a channel with no part
   is named rather than silently dropped; and the flagged brick, the live
   inspector readout and the issue list all agree with the measurement
   instead of each having their own opinion.
   ===================================================================== */
const { launchBrowser } = require('./harness');
const path = require('path');
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
const URL_ = 'file://' + path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html') + R2_Q;
let pass = 0, fail = 0;
const ok = (n,c,x='') => { c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

/* `tuned` gives every channel a real speed setting, which is what makes
   blockEffRamps() floor a ramp — the commonest reason a converted brick
   cannot be as quick as the file claimed. */
async function droid(page, tuned){
  await page.goto(URL_);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ buildSet('domeServo','mini24'); buildSet('sound','dysv5w'); wizFinish(); });
  await page.waitForTimeout(300);
  await page.evaluate(()=>{ loadProfile('maestro25'); setBoard('mini24'); makeStarter('dome','mini24'); });
  await page.waitForTimeout(300);
  if(tuned) await page.evaluate(()=>{
    MSTR.channels.forEach((c,i)=>{ if(!/^servo/i.test(c.mode)) return;
      c.min = 4530 + i*17; c.max = 7293 - i*11; c.home = c.min;
      c.speed = 12 + (i%5); c.acceleration = 3 + (i%4); });
    HW.save();
  });
  await page.waitForTimeout(150);
}
/* author a routine, compile it, and hand back a sequence that looks
   exactly like an imported one: frames, no bricks */
const asFrameList = (page, name, tuned) => page.evaluate(([N,slow])=>{
  const s = MSTR.sequences[blockNewRoutine(N)];
  blockAdd(s,'act','pie0',    0,   {dur:900,  rise:250, fall:400});
  blockAdd(s,'act','pie1',    300, {dur:1200, rise:150, fall:150});
  blockAdd(s,'act','panel0',  1100,{dur:1500, rise:300, fall:300});
  blockAdd(s,'act','panel5',  1400,{dur:1000, rise:200, fall:600, amp:0.35});
  blockAdd(s,'act','panel1',  2600,{dur:2400, rise:900, fall:900, amp:0.2});
  blockAdd(s,'act','pie3',    600, {dur:700,  rise:200, fall:200});   // a second run on its own lane
  blockAdd(s,'act','pie3',    3000,{dur:700,  rise:200, fall:200});   // …twice, so excursions must split
  blockSync(s);
  const frames = JSON.parse(JSON.stringify(s.frames));
  const bricks = JSON.parse(JSON.stringify(s.blocks)).map(b=>{ delete b.id; return b; });
  delete s.blocks; s.frames = frames;          // now it is an import
  EDIT.seq = MSTR.sequences.indexOf(s);
  setStripMode('seq');
  buildSequencer();
  return {frames: frames.length, bricks: bricks.length};
}, [name, !!tuned]);

const clickText = async (page, txt) => {
  const n = await page.evaluateHandle(t=>Array.from(document.querySelectorAll('button'))
    .find(b=>b.offsetParent && (b.textContent||'').trim() === t) || null, txt);
  const e = n.asElement(); if(!e) return false;
  await e.click(); await page.waitForTimeout(250); return true;
};

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', async d=>await d.accept());

  console.log('════ the analysis, on frames the compiler itself wrote ════');
  await droid(page, false);
  const built = await asFrameList(page, 'Imported wave');
  ok('the fixture is a frame list, not a routine',
     await page.evaluate(()=>!blockIsRoutine(MSTR.sequences[EDIT.seq])), JSON.stringify(built));
  const t = await page.evaluate(()=>{
    const r = blockTrace(MSTR.sequences[EDIT.seq]);
    return {n:r.bricks.length, issues:r.issues, moved:r.moved,
            refs:r.bricks.map(b=>b.ref), t0s:r.bricks.map(b=>b.t0)};
  });
  console.log('  traced: '+t.n+' bricks '+JSON.stringify(t.refs));
  ok('it finds a brick for every excursion, including the lane used twice',
     t.n === built.bricks && t.refs.filter(r=>r==='pie3').length === 2, t.n+' vs '+built.bricks);
  ok('and reports NO issues — it reproduces the compiler exactly',
     t.issues.length === 0, JSON.stringify(t.issues.map(i=>i.label+' '+i.err)));
  ok('the partial-travel brick keeps its amplitude',
     await page.evaluate(()=>{
       const b = blockTrace(MSTR.sequences[EDIT.seq]).bricks.find(x=>x.ref==='panel5');
       return !!b && Math.abs(b.amp - 0.35) < 0.02;
     }));

  console.log('\n════ door 1 — "Work out the bricks" ════');
  ok('the button is offered on a frame list', await page.evaluate(()=>
    !!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Work out the bricks')));
  const before = await page.evaluate(()=>MSTR.sequences.length);
  ok('clicked', await clickText(page, 'Work out the bricks'));
  const g = await page.evaluate(()=>{
    const s = MSTR.sequences[EDIT.seq];
    const copy = MSTR.sequences.find(x=>x.name === 'Imported wave (frames)');
    return {isRoutine: blockIsRoutine(s), bricks:(s.blocks||[]).length,
            copy: !!copy, copyFrames: copy ? copy.frames.length : 0, copyIsList: copy ? !blockIsRoutine(copy) : false,
            n: MSTR.sequences.length};
  });
  ok('the routine is bricks now', g.isRoutine && g.bricks === built.bricks, JSON.stringify(g));
  ok('and the original frame list is kept beside it as a copy',
     g.copy && g.copyFrames === built.frames && g.copyIsList && g.n === before + 1, JSON.stringify(g));

  console.log('\n════ door 2 — "Work them out and review…", on a droid it cannot fit ════');
  await droid(page, true);
  await asFrameList(page, 'Imported wave', true);
  /* a channel that MOVES but has no part: its motion cannot be a brick */
  await page.evaluate(()=>{
    const s = MSTR.sequences[EDIT.seq];
    MSTR.channels[20].mode = 'Servo'; MSTR.channels[20].act = '';
    MSTR.channels[20].min = 4000; MSTR.channels[20].max = 8000; MSTR.channels[20].name = 'Board only';
    s.frames.forEach((f,i)=>{ f.targets[20] = (i > 3 && i < 12) ? 7000 : 4000; });
    buildSequencer();
  });
  ok('review opens', await clickText(page, 'Work them out and review…'));
  const r = await page.evaluate(()=>({
    on: !!BLK.conv,
    issues: (BLK.conv ? BLK.conv.issues : []).map(i=>({k:i.kind, l:i.label, err:i.err||0})),
    banner: !!document.querySelector('.note.blkconv'),
    rows: document.querySelectorAll('.blkconvrow').length,
    flagged: document.querySelectorAll('.blkbrick.convbad').length,
    isRoutine: blockIsRoutine(MSTR.sequences[EDIT.seq]),
    origKept: BLK.conv ? BLK.conv.orig.length : 0
  }));
  console.log('  '+JSON.stringify(r));
  ok('the banner lists the issues', r.on && r.banner && r.rows === r.issues.length && r.rows > 0);
  ok('the unmapped channel is NAMED, not silently dropped',
     r.issues.some(i=>i.k === 'unmapped'), JSON.stringify(r.issues));
  ok('the bricks it cannot reproduce are flagged on the timeline', r.flagged > 0, String(r.flagged));
  ok('nothing was saved yet — the original frames are still held',
     r.origKept === (await page.evaluate(()=>BLK.conv.orig.length)) && r.origKept > 0);
  ok('no "(frames)" copy exists until you accept',
     !(await page.evaluate(()=>MSTR.sequences.some(s=>s.name === 'Imported wave (frames)'))));

  console.log('\n════ the readout is the measurement, not a second opinion ════');
  const line = await page.evaluate(()=>{
    const bad = BLK.conv.issues.find(i=>i.kind === 'mismatch');
    if(!bad) return {skip:true};
    blkConvGoTo(bad);
    const b = blockFind(MSTR.sequences[EDIT.seq], BLK.sel);
    const el = document.querySelector('.blkconvline');
    return {ref:bad.ref, sel: b ? b.ref : null, playhead: BLK.play.t, at: bad.at,
            text: el ? el.textContent : '', cls: el ? el.className : ''};
  });
  ok('clicking an issue selects its brick and parks the playhead on the worst moment',
     line.skip || (line.sel === line.ref && line.playhead === line.at), JSON.stringify(line));
  ok('the inspector shows the same error the issue does',
     line.skip || (/off by \d+/.test(line.text) && /bad/.test(line.cls)), JSON.stringify(line.text));

  console.log('\n════ the measurement follows the bricks, edit by edit ════');
  /* Liveness proved in BOTH directions on one brick: shift it and the error
     against the original must grow; put it back and the error must return
     to exactly what it was. A readout that only ever got worse could be a
     counter; one that comes back is reading the bricks. */
  const live = await page.evaluate(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockList(seq).find(x=>x.ref === 'pie0'); if(!b) return {skip:true};
    const errFor = ref => {
      const i = blockTraceReview(seq, BLK.conv.orig).find(x=>x.ref === ref);
      return i ? i.err : 0;
    };
    const e0 = errFor('pie0');
    const t0 = b.t0;
    b.t0 = t0 + 400; blockSync(seq);
    const e1 = errFor('pie0');
    b.t0 = t0;       blockSync(seq);
    const e2 = errFor('pie0');
    return {skip:false, e0, e1, e2};
  });
  ok('moving a brick makes its error grow', live.skip || live.e1 > live.e0, JSON.stringify(live));
  ok('…and putting it back restores exactly the error it had',
     live.skip || live.e2 === live.e0, JSON.stringify(live));
  ok('an unmapped channel stays reported after an edit — it is not a number that can be dragged away',
     (await page.evaluate(()=>blockTraceReview(MSTR.sequences[EDIT.seq], BLK.conv.orig)
        .filter(i=>i.kind === 'unmapped').length)) === 1);

  console.log('\n════ discard puts it back exactly ════');
  const disc = await page.evaluate(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const want = JSON.stringify(BLK.conv.orig);
    blkConvDiscard();
    return {conv: !!BLK.conv, isRoutine: blockIsRoutine(seq),
            same: JSON.stringify(seq.frames) === want,
            copies: MSTR.sequences.filter(s=>/\(frames\)/.test(s.name)).length};
  });
  ok('the routine is a frame list again', !disc.conv && !disc.isRoutine, JSON.stringify(disc));
  ok('…with byte-identical frames', disc.same);
  ok('…and discarding left no copy behind', disc.copies === 0, String(disc.copies));

  console.log('\n════ accept keeps the original, whatever the state ════');
  await clickText(page, 'Work them out and review…');
  const acc = await page.evaluate(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const want = JSON.stringify(BLK.conv.orig);
    const left = BLK.conv.issues.length;
    blkConvAccept();
    const copy = MSTR.sequences.find(s=>s.name === 'Imported wave (frames)');
    return {conv: !!BLK.conv, isRoutine: blockIsRoutine(seq), left,
            copy: !!copy, copySame: copy ? JSON.stringify(copy.frames) === want : false};
  });
  ok('accepting with issues outstanding is allowed — and says so', acc.left > 0 && !acc.conv, JSON.stringify(acc));
  ok('the routine stays bricks', acc.isRoutine);
  ok('the untouched original is in the library, byte for byte', acc.copy && acc.copySame, JSON.stringify(acc));

  console.log('\n════ leaving the routine abandons a pending review ════');
  await droid(page, false);
  await asFrameList(page, 'Imported wave');
  await clickText(page, 'Work them out and review…');
  const away = await page.evaluate(()=>{
    const mine = MSTR.sequences[EDIT.seq];
    const want = JSON.stringify(BLK.conv.orig);
    EDIT.seq = 0;                       // open another routine
    buildSequencer();
    return {conv: !!BLK.conv, isRoutine: blockIsRoutine(mine),
            same: JSON.stringify(mine.frames) === want};
  });
  ok('the review is dropped and the frame list restored', !away.conv && !away.isRoutine && away.same,
     JSON.stringify(away));

  console.log('\n════ nothing to convert is refused, with the reason ════');
  const none = await page.evaluate(()=>{
    const s = {name:'Flat', frames:[{name:'a',duration:400,targets:[]},{name:'b',duration:400,targets:[]}]};
    MSTR.sequences.push(s); EDIT.seq = MSTR.sequences.indexOf(s);
    const t = blockTrace(s);
    blkConvRun(s, false);
    return {bricks:t.bricks.length, moved:t.moved, stillList: !blockIsRoutine(s),
            copy: MSTR.sequences.some(x=>x.name === 'Flat (frames)')};
  });
  ok('a routine that never leaves rest is not converted', none.bricks === 0 && none.stillList && !none.copy,
     JSON.stringify(none));

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length === 0, errs.slice(0,3).join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
