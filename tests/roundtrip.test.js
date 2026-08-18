/* THE ROUND TRIP — build it, export it, wipe the sim, read it back (v1.48.0)
   ---------------------------------------------------------------------
   Mike, 2026-08-18: "create a test sequence, export it out, clean the sim
   so it doesn't exist and then re-import and see if it's the same."

   That is the only question the three export formats exist to answer, and
   until now nothing asked it end to end: mstr-share.test.js proves the
   RETARGETING maths and maestro-import.test.js proves the READERS, but
   neither wipes the app and starts again, so a routine could survive the
   parser and still be lost by the chooser, the loadout, or persistence.

   WHAT MAKES THE FIXTURE HARD, and why each part of it is there. v1.47.1
   was two bugs that only showed on a REAL builder's table, so this suite
   is run twice — once on the starter table, once on:
     · every endpoint pair ASYMMETRIC about 6000 — the v1.47.1 reversal
       landed the invented "open" on the wrong side only on those;
     · one channel INVERTED (min > max, the directed pair);
     · one channel homemode Off with home 0 — the hole a MaestroPCA header
       leaves, and the hole pcaHeaderParse() fills with 6000, which is what
       the reversal fed on;
     · two channels NAMED so guessPart() disagrees with the wired act
       ("Panel7" on `panel5`) — the v1.47.1 cross-wiring, which swapped two
       panels' choreography on Mike's own file.
   The routine spends all four motion modes, two partial-travel amps, a
   deliberate overlap and a nested library sequence, so every branch of
   blockCompile() is in the frames being compared.

   TWO FIXTURE TRAPS, both of which cost an hour when this was written:

   1. An untouched channel is a SPARSE HOLE (`undefined`) in a compiled
      frame and a `0` in a parsed one. They mean the same thing
      (applyFrameTargets: "0 = channel off / untouched"), so both sides are
      normalised to 0 — otherwise 250 phantom differences bury the real
      ones.
   2. Retuning endpoints AFTER makeStarter() leaves the starter FRAMES
      speaking the OLD ones, so a nested starter brick carries values
      outside the new travel and mstrRetargetFrame() clamps them — a
      genuine behaviour (asserted at the bottom), but if it fires here it
      is the FIXTURE that differs, not the round trip. The library is
      therefore rescaled through the old→new ends, exactly as a
      recalibration implies.

   WHAT IT ASSERTS BEYOND THE FRAMES. Since v1.48.0 the BRICKS survive too —
   the writers append them as a base64 comment (`<!--r2sim:blocks …-->` in the
   .mstr, `/* r2sim:blocks … *\/` in the header) and the choreography .json
   always carried them — so every route is checked brick for brick as well,
   with the ids stripped because attach regenerates them. Three losses remain
   and are asserted so that changing THEM is deliberate: merging leaves the
   loadout alone; a frame outside your current travel is clamped by the
   choreography door and not by the .mstr one; and the brick colours live in
   PREFS, so no export carries them.

   PROVE IT CAN FAIL: swap `norm()` below for `a===b` on the raw values and
   the frame comparisons go red at ~250 differences on the first run.
   ===================================================================== */
const { launchBrowser } = require('./harness');
const path = require('path');
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
const TARGET = process.env.R2_TARGET || 'R2D2-Simulator.html';
const URL_ = 'file://' + path.resolve(__dirname, '..', TARGET) + R2_Q;
let pass = 0, fail = 0;
const ok = (n,c,x='') => { c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

/* the name is part of the test: quotes, an apostrophe, angle brackets and an
   ampersand all have to survive XML escaping and a C string */
const SEQ_NAME = 'RT probe: "Mike\'s" <wave> & co';

/* the SAME droid every time, from a cold page */
async function freshDroid(page, tuned){
  await page.goto(URL_);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ buildSet('domeServo','mini24'); buildSet('sound','dysv5w'); wizFinish(); });
  await page.waitForTimeout(300);
  await page.evaluate(()=>{ loadProfile('maestro25'); setBoard('mini24'); makeStarter('dome','mini24'); });
  await page.waitForTimeout(300);
  if(tuned) await page.evaluate(()=>{
    const old = MSTR.channels.map(c=>({shut:c.min, open:c.max}));
    MSTR.channels.forEach((c,i)=>{
      if(!/^servo/i.test(c.mode)) return;
      c.min = 4530 + i*17; c.max = 7293 - i*11; c.home = c.min; c.homemode = 'Goto';
      c.speed = 12 + (i%5); c.acceleration = 3 + (i%4); c.neutral = 6000;
    });
    const inv = MSTR.channels[2]; inv.min = 7810; inv.max = 4210; inv.home = 7810;
    const off = MSTR.channels[7]; off.homemode = 'Off'; off.home = 0;
    MSTR.channels[11].name = 'Panel7';    // wired to panel5  — the guess says panel6
    MSTR.channels[17].name = 'Panel13';   // wired to panel11 — the guess says panel12
    /* trap 2: bring the library with the recalibration */
    MSTR.sequences.forEach(s=>(s.frames||[]).forEach(f=>{
      MSTR.channels.forEach((c,i)=>{
        const v = f.targets[i]; if(!v) return;
        const a = old[i]; if(!a || a.open === a.shut) return;
        const n = Math.max(0, Math.min(1, (v - a.shut)/(a.open - a.shut)));
        f.targets[i] = Math.round(c.min + n*(c.max - c.min));
      });
    }));
    if(typeof HW !== 'undefined' && HW.save) HW.save();
  });
  await page.waitForTimeout(200);
}

const buildTestSequence = page => page.evaluate(N=>{
  const seq = MSTR.sequences[blockNewRoutine(N)];
  blockAdd(seq,'act','pie0',    0,    {dur:900,  rise:250, fall:400});
  blockAdd(seq,'act','pie1',    300,  {dur:1200, rise:150, fall:150, mode:'o'});   // just opens
  blockAdd(seq,'act','pie2',    700,  {dur:800,  rise:400, fall:200, mode:'c'});   // just closes
  blockAdd(seq,'act','panel0',  1100, {dur:1500, rise:300, fall:300, mode:'co'});  // closes then opens
  blockAdd(seq,'act','panel5',  1400, {dur:1000, rise:200, fall:600, amp:0.35});   // partial travel
  blockAdd(seq,'act','panel11', 1400, {dur:1000, rise:200, fall:200});             // overlaps it
  blockAdd(seq,'act','panel1',  2600, {dur:2400, rise:900, fall:900, amp:0.2, mode:'o'});
  blockAdd(seq,'seq','Dome Pie Wave', 3200, {});                                   // a nested sequence
  blockSync(seq);
  if(typeof loadoutAdd === 'function') loadoutAdd(N);
  if(typeof HW !== 'undefined' && HW.save) HW.save();
  return {blocks:seq.blocks.length, frames:seq.frames.length};
}, SEQ_NAME);

const snap = (page, name) => page.evaluate(N=>{
  const s = MSTR.sequences.find(x=>x.name === N); if(!s) return null;
  return { name:s.name, nFrames:(s.frames||[]).length, nBlocks:(s.blocks||[]).length,
    /* ids are regenerated when blocksTryAttach() re-attaches, so they are not
       part of what "the same bricks" means — strip them here, once */
    blocks: JSON.parse(JSON.stringify(s.blocks||[])).map(b=>{ delete b.id; return b; }),
    frames:(s.frames||[]).map(f=>({d:f.duration, t:(f.targets||[]).map(v=>v===undefined?null:v)})),
    inLoadout:(typeof loadoutNames === 'function') ? loadoutNames().indexOf(s.name) : -2 };
}, name);

/* v1.48.0 — the bricks come back too, through the base64 comment the writers
   append (`<!--r2sim:blocks …-->` / `/* r2sim:blocks … *\/`) and the JSON's own
   `blocks`, attached only when blocksTryAttach() can recompile them to the SAME
   frames. So this suite now asserts the bricks on EVERY route, and does it by
   value: ids are regenerated on attach, so they are stripped before comparing. */
function blockDiff(a, b){
  if(!a || !b) return [{why:'one side missing', a:!!a, b:!!b}];
  if(a.nBlocks !== b.nBlocks) return [{why:'brick count', a:a.nBlocks, b:b.nBlocks}];
  const out = [];
  for(let i=0;i<a.nBlocks;i++){
    const x = JSON.stringify(a.blocks[i]), y = JSON.stringify(b.blocks[i]);
    if(x !== y) out.push({why:'brick', i:i, a:x, b:y});
  }
  return out;
}
/* trap 1 — a hole and a zero both mean "this channel is not commanded" */
const norm = v => (v === null || v === undefined) ? 0 : v;
function frameDiff(a, b){
  const out = [];
  if(!a || !b) return [{why:'one side missing', a:!!a, b:!!b}];
  if(a.nFrames !== b.nFrames) out.push({why:'frame count', a:a.nFrames, b:b.nFrames});
  for(let i=0;i<Math.min(a.nFrames,b.nFrames);i++){
    if(a.frames[i].d !== b.frames[i].d) out.push({why:'duration', frame:i, a:a.frames[i].d, b:b.frames[i].d});
    const ta = a.frames[i].t, tb = b.frames[i].t;
    for(let c=0;c<Math.max(ta.length,tb.length);c++)
      if(norm(ta[c]) !== norm(tb[c])) out.push({why:'target', frame:i, ch:c, a:norm(ta[c]), b:norm(tb[c])});
  }
  return out;
}
const clickAsk = async (page, id) => {
  const sel = 'button[data-ask="'+id+'"]';
  if(await page.$(sel)){ await page.click(sel); await page.waitForTimeout(300); return true; }
  return false;
};

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', async d=>await d.accept());

  for(const tuned of [false, true]){
    console.log('\n════════ the '+(tuned ? 'TUNED droid — asymmetric pairs, one inverted, one homemode Off, two misleading names'
                                        : 'starter droid')+' ════════');
    const tag = tuned ? 'tuned' : 'plain';
    await freshDroid(page, tuned);
    const built = await buildTestSequence(page);
    const before = await snap(page, SEQ_NAME);
    ok(tag+': the routine compiles to frames', built.blocks === 8 && before.nFrames > 10,
       built.blocks+' bricks, '+before.nFrames+' frames');
    ok(tag+': it is in the loadout, so it reaches the board and the .h', before.inLoadout >= 0,
       'slot '+before.inLoadout);

    const files = await page.evaluate(()=>({
      choreo: JSON.stringify(seqLibExportObj(), null, 1),
      mstr:   buildMstrText(),
      pcah:   pcaGenFromLoadout()
    }));
    ok(tag+': a choreography backup was written', files.choreo.indexOf('r2sim.choreography') > 0);
    ok(tag+': the awkward name survives XML escaping',
       files.mstr.indexOf('&quot;Mike&apos;s&quot; &lt;wave&gt; &amp;') > 0
       || files.mstr.indexOf('&lt;wave&gt;') > 0);
    ok(tag+': …and the C header', files.pcah.indexOf('RT probe') > 0);

    /* ---- A. the choreography backup, choreography only, merged in ---- */
    await page.evaluate(()=>localStorage.clear());
    await freshDroid(page, tuned);
    ok(tag+'/json: the sim has genuinely forgotten it', !(await snap(page, SEQ_NAME)));
    await page.evaluate(t=>impChooseOpen({kind:'choreography', text:t, name:'rt-choreography.json', from:'test'}), files.choreo);
    await page.waitForTimeout(400);
    ok(tag+'/json: the chooser asks before it writes anything', !!(await page.$('button[data-ask="merge"]')));
    await clickAsk(page, 'merge');
    await page.waitForTimeout(400);
    const A = await snap(page, SEQ_NAME), dA = frameDiff(before, A);
    ok(tag+'/json: every frame comes back target-for-target', dA.length === 0,
       dA.length+' difference(s) '+JSON.stringify(dA.slice(0,3)));
    /* v1.48.0 — the bricks come back, so the restored routine is still editable */
    const bA = blockDiff(before, A);
    ok(tag+'/json: all eight bricks come back, brick for brick', bA.length === 0,
       bA.length+' difference(s) '+JSON.stringify(bA.slice(0,2)));
    ok(tag+'/json: merging does not touch the loadout, by design', A && A.inLoadout < 0, A ? String(A.inLoadout) : '-');

    /* ---- B. the same file as servo config AND choreography ---- */
    await page.evaluate(()=>localStorage.clear());
    await freshDroid(page, tuned);
    await page.evaluate(t=>impChooseOpen({kind:'both', text:t, name:'rt-choreography.json', from:'test'}), files.choreo);
    await page.waitForTimeout(400);
    await clickAsk(page, 'replace');
    await clickAsk(page, 'merge');
    await page.waitForTimeout(400);
    const B = await snap(page, SEQ_NAME), dB = frameDiff(before, B), bB = blockDiff(before, B);
    ok(tag+'/json+cfg: every frame comes back target-for-target', dB.length === 0,
       dB.length+' difference(s) '+JSON.stringify(dB.slice(0,3)));
    ok(tag+'/json+cfg: and every brick', bB.length === 0,
       bB.length+' difference(s) '+JSON.stringify(bB.slice(0,2)));
    if(tuned) ok(tag+'/json+cfg: the inverted pair and the homemode-Off channel come back',
      await page.evaluate(()=>MSTR.channels[2].min === 7810 && MSTR.channels[2].max === 4210
                            && MSTR.channels[7].homemode === 'Off'));

    /* ---- C. a Pololu .mstr, through the guided import's own path ---- */
    await page.evaluate(()=>localStorage.clear());
    await freshDroid(page, tuned);
    await page.evaluate(t=>{ mstrApply(mstrParse(t, 'rt.mstr')); }, files.mstr);
    await page.waitForTimeout(400);
    const C = await snap(page, SEQ_NAME), dC = frameDiff(before, C);
    ok(tag+'/mstr: every frame comes back target-for-target', dC.length === 0,
       dC.length+' difference(s) '+JSON.stringify(dC.slice(0,3)));
    ok(tag+'/mstr: the awkward name is intact', C && C.name === SEQ_NAME, C ? JSON.stringify(C.name) : '-');
    /* the bricks ride in an XML comment — base64, because a comment cannot hold `--` */
    ok(tag+'/mstr: the file carries the bricks in a comment', files.mstr.indexOf('<!--r2sim:blocks ') > 0);
    /* v1.48.1 — THE .mstr NOW CARRIES THE PART MAPPING. It never did: a
       Pololu `<Channel>` is name, mode, travel, speed and acceleration, so
       `mstrParse()` re-derived "which panel" with `guessPart(name)` and a
       wholesale import replaced whatever the builder had assigned by hand.
       On the starter table the names ARE the guess; on this one they are
       not, and the import used to come back with channels 11 and 12 BOTH
       claiming `panel6`, `panel5` and `panel11` driven by nothing, and
       every brick naming either of them unwired — 63 frames' worth of
       bricks recompiling to 54, so `blocksTryAttach()` refused them. The
       frames were exact throughout, which is why it went unseen until the
       bricks had a way home. The mapping now rides the same kind of
       comment the bricks do (`<!--r2sim:acts …-->`, export.js). */
    ok(tag+'/mstr: the file carries the part mapping in a comment',
       files.mstr.indexOf('<!--r2sim:acts ') > 0);
    if(tuned) ok(tag+'/mstr: …so the hand-assigned mapping comes back, not the guess',
      await page.evaluate(()=>{
        const a = MSTR.channels.map(c=>c.act);
        /* channel 11 is named "Panel7" and wired to panel5; the guess says panel6 */
        return a[11] === 'panel5' && a[17] === 'panel11'
            && a.filter(x=>x === 'panel6').length === 1;
      }));
    const bC = blockDiff(before, C);
    ok(tag+'/mstr: and the bricks come back, brick for brick', bC.length === 0,
       bC.length+' difference(s) '+JSON.stringify(bC.slice(0,2)));
    if(tuned) ok(tag+'/mstr: the inverted pair comes back',
      await page.evaluate(()=>MSTR.channels[2].min === 7810 && MSTR.channels[2].max === 4210));

    /* ---- D. a MaestroPCA sequences.h ---- */
    await page.evaluate(()=>localStorage.clear());
    await freshDroid(page, tuned);
    ok(tag+'/pca: the header is recognised as ours',
       await page.evaluate(t=>impShape(t,'rt-sequences.h').from === 'pca', files.pcah));
    await page.evaluate(t=>impChooseOpen({kind:'both', text:t, name:'rt-sequences.h', from:'test'}), files.pcah);
    await page.waitForTimeout(400);
    await clickAsk(page, 'replace');
    await clickAsk(page, 'merge');
    await page.waitForTimeout(400);
    const hit = (await page.evaluate(()=>MSTR.sequences.map(s=>s.name))).find(n=>n.indexOf('RT probe') === 0);
    const D = hit ? await snap(page, hit) : null;
    const dD = frameDiff(before, D), bD = blockDiff(before, D);
    ok(tag+'/pca: every frame comes back target-for-target', dD.length === 0,
       dD.length+' difference(s) '+JSON.stringify(dD.slice(0,3)));
    ok(tag+'/pca: the header carries the bricks in a C comment', files.pcah.indexOf('r2sim:blocks ') > 0);
    /* v1.48.1 — the header carries the mapping too. This route ADOPTS (your
       table is kept, so nothing here could re-wire it); the assertion is on
       the READER, which is the half a wholesale .h import would use. */
    ok(tag+'/pca: …and the part mapping', files.pcah.indexOf('r2sim:acts ') > 0);
    if(tuned) ok(tag+'/pca: the reader gives back the authored mapping, not the guess',
      await page.evaluate(t=>{
        const ch = pcaHeaderParse(t, 'rt-sequences.h').channels;
        return ch[11].act === 'panel5' && ch[17].act === 'panel11';
      }, files.pcah));
    ok(tag+'/pca: and they come back, brick for brick', bD.length === 0,
       bD.length+' difference(s) '+JSON.stringify(bD.slice(0,2)));
  }

  /* ------------------------------------------------------------------
     The two doors disagree about a frame authored OUTSIDE the endpoints
     you have now — author a routine, then pull the open end in, which is
     what a rebuild does. mstrRetargetFrame() normalises and clamps;
     mstrApply() takes the file wholesale. Both are defensible and neither
     is a bug, but they are asserted so that changing either is deliberate.
     ------------------------------------------------------------------ */
  console.log('\n════════ a frame outside your current travel ════════');
  const CN = 'Clip probe';
  await page.evaluate(()=>localStorage.clear());
  await freshDroid(page, false);
  const clip = await page.evaluate(N=>{
    const s = MSTR.sequences[blockNewRoutine(N)];
    blockAdd(s,'act','pie0',0,{dur:900, rise:200, fall:200}); blockSync(s); loadoutAdd(N);
    MSTR.channels[0].max = 7000;                 // the recalibration, after the fact
    HW.save();
    return {peak: Math.max(...s.frames.map(f=>f.targets[0]||0)),
            files:{choreo: JSON.stringify(seqLibExportObj(),null,1), mstr: buildMstrText()}};
  }, CN);
  await page.evaluate(()=>localStorage.clear());
  await freshDroid(page, false);
  await page.evaluate(()=>{ MSTR.channels[0].max = 7000; HW.save(); });
  await page.evaluate(t=>impChooseOpen({kind:'choreography', text:t, name:'clip.json', from:'test'}), clip.files.choreo);
  await page.waitForTimeout(400);
  await clickAsk(page, 'merge');
  await page.waitForTimeout(400);
  const clipJson = await page.evaluate(N=>{
    const s = MSTR.sequences.find(x=>x.name === N || x.name === N+'·');
    return s ? Math.max(...s.frames.map(f=>f.targets[0]||0)) : null;
  }, CN);
  ok('the choreography import CLAMPS it to the endpoint you have now',
     clip.peak === 8000 && clipJson === 7000, 'was '+clip.peak+', back as '+clipJson);
  await page.evaluate(()=>localStorage.clear());
  await freshDroid(page, false);
  await page.evaluate(t=>{ mstrApply(mstrParse(t,'clip.mstr')); }, clip.files.mstr);
  await page.waitForTimeout(300);
  ok('…and the .mstr import does not — it takes the file wholesale',
     await page.evaluate(N=>{
       const s = MSTR.sequences.find(x=>x.name === N);
       return !!s && Math.max(...s.frames.map(f=>f.targets[0]||0)) === 8000;
     }, CN));

  /* The brick colours live in PREFS, not MSTR — no export carries them. */
  ok('the brick colours are in neither export file', await page.evaluate(()=>{
    blkSetColor('pie0','#ff0000');
    return blkColor('pie0') === '#ff0000'
        && JSON.stringify(seqLibExportObj()).indexOf('ff0000') < 0
        && buildMstrText().indexOf('ff0000') < 0;
  }));

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length === 0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
