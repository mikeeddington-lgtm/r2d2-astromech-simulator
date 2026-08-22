/* ============================================================ v1.68.1
   EXPORT GUARDS — the four things a written file must never do.

   All four were found by the 2026-08-21 import/export audit, and all four
   share a shape: the app wrote a file, said nothing was wrong, and the
   damage only appeared in Control Center, in the Arduino IDE, or on the
   droid. So each assertion here is about the ARTEFACT — the bytes that
   leave the app — not about the state that produced them.

     1. mode="Off" is not a Pololu ChannelMode. It reached <Channel> from
        HW.ensure()'s padding rows and Control Center refuses the file.
     2. niceName() strips every non-alphanumeric character, so the "·" an
        import clash appends vanishes and two routines compile to the same
        `sub`. Control Center refuses THAT too, and in here the sub index
        resolved both to the first routine, so restartScript(1) played 0.
     3. exportPcaHeader() never ran the linter it already had, which is how
        seven of nine routines in a real header drove nine channels that
        had been un-ticked and have no pin.
     4. Two export receipts described the code as it was before v1.66.0.

   Plus the portability note, which is not a bug — it is the sentence Mike
   asked for on 2026-08-21: "people can't just send an export to someone".
   ===================================================================== */
const { launchBrowser } = require('./harness');
const path = require('path');
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
const URL_ = 'file://' + path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html') + R2_Q;
let pass = 0, fail = 0;
const ok = (n,c,x='') => { c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  await page.goto(URL_);
  await page.waitForTimeout(1800);
  const ev = (f,a) => page.evaluate(f,a);

  await ev(()=>{ loadProfile('maestro25'); setBoard('mini24'); makeStarter('dome','mini24'); });
  await page.waitForTimeout(300);

  /* ================================================================== 1 */
  console.log('\n════ every mode= in an exported .mstr is a legal Pololu ChannelMode ════');

  const modes = await ev(()=>{
    /* grow the table past the board the way a servo-config import does —
       HW.ensure() is what makes the padding rows */
    HW.ensure(29);
    const text = buildMstrText();
    const found = [];
    text.replace(/<Channel name="[^"]*" mode="([^"]*)"/g, (m,v)=>{ found.push(v); return m; });
    return { found: Array.from(new Set(found)), rows: MSTR.channels.length,
             raw: MSTR.channels.map(c=>c.mode).filter((v,i,a)=>a.indexOf(v)===i) };
  });
  const LEGAL = ['Servo','ServoMultiplied','Output','Input'];
  ok('the table really did grow padding rows to test against', modes.rows > 24, 'rows='+modes.rows);
  ok('no mode= outside Servo|ServoMultiplied|Output|Input reaches the file',
     modes.found.every(m=>LEGAL.indexOf(m) >= 0), 'wrote ' + JSON.stringify(modes.found));
  ok('…specifically, no mode="Off" — Off is a HomeMode, not a ChannelMode',
     modes.found.indexOf('Off') < 0, 'in-app modes were ' + JSON.stringify(modes.raw));
  ok('a padding row is still non-servo, so it is not compiled into the script',
     await ev(()=>enabledChannels().indexOf(29) < 0));

  /* ================================================================== 2 */
  console.log('\n════ two routines can never compile to the same sub ════');

  const clash = await ev(()=>{
    MSTR.sequences = [
      {name:'Dome Wave', frames:[{name:'a',duration:300,targets:[6000]}]},
      {name:'Dome_Wave', frames:[{name:'a',duration:300,targets:[7000]}]},
      {name:'Dome Wave·', frames:[{name:'a',duration:300,targets:[5000]}]}
    ];
    loadoutReset();
    reindexSubs();
    const subs = MSTR.subs.filter(s=>s.kind==='sequence');
    return {
      names: subs.map(s=>s.name),
      seqIndex: subs.map(s=>s.seqIndex),
      script: MSTR.scriptText
    };
  });
  ok('all three routines get DISTINCT subroutine symbols',
     new Set(clash.names).size === 3, clash.names.join(' / '));
  ok('…and each sub still points at its own routine, so restartScript(n) is honest',
     JSON.stringify(clash.seqIndex) === '[0,1,2]', JSON.stringify(clash.seqIndex));
  ok('the emitted script declares each sub exactly once',
     clash.names.every(n=>(clash.script.match(new RegExp('^sub '+n+'$','gm'))||[]).length === 1),
     clash.names.join(' / '));
  ok('the sequencer shows the symbol that was actually emitted, not a guess',
     await ev(()=>scriptSubNameFor(MSTR.sequences[1]) === MSTR.subs.filter(s=>s.kind==='sequence')[1].name));

  /* the clash suffix itself is unchanged — the import still renames rather
     than overwrites, and the user's routine name is still their own */
  ok('the routine NAMES are untouched — uniqueness is settled on the symbol',
     await ev(()=>MSTR.sequences.map(s=>s.name).join('|')) === 'Dome Wave|Dome_Wave|Dome Wave·');

  /* ================================================================== 3 */
  console.log('\n════ the PCA header export names its own lint errors ════');

  const linted = await ev(()=>{
    setBoard('pca48');
    makeStarter('dome','pca48');
    /* the exact shape of Mike's 2026-08-21 file: a channel un-ticked on the
       bench while a starter sequence still drives it */
    const c = MSTR.channels[3];
    c.mode = 'Input';
    const rep = lintMaestro();
    const before = ($('maeMsg')||{}).innerHTML || '';
    exportPcaHeader();
    return {
      errs: rep.counts.err,
      codes: rep.items.filter(i=>i.level==='err').map(i=>i.code),
      msg: ($('maeMsg')||{}).innerHTML || '',
      changed: (($('maeMsg')||{}).innerHTML || '') !== before
    };
  });
  ok('a starter driving an un-ticked channel is a lint error at all',
     linted.errs > 0 && linted.codes.indexOf('tgt-mode') >= 0, JSON.stringify(linted.codes));
  ok('exportPcaHeader() surfaces the error count in the receipt',
     /validation error/i.test(linted.msg), linted.msg.slice(0,160));
  ok('…and names the first offending rule, not just a number',
     /channel 3/i.test(linted.msg), linted.msg.slice(0,220));

  const lintedMstr = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    MSTR.channels[3].mode = 'Input';
    exportMstr();
    return ($('maeMsg')||{}).innerHTML || '';
  });
  ok('the .mstr export does the same, so the two doors agree',
     /validation error/i.test(lintedMstr), lintedMstr.slice(0,160));

  /* ================================================================== 4 */
  console.log('\n════ the receipts describe the code that is actually running ════');

  const drops = await ev(()=>{
    setBoard('pca48'); makeStarter('dome','pca48');
    const s = MSTR.sequences[blockNewRoutine('Speedy')];
    blockAdd(s,'act','pie0',0,{dur:900, rise:250, fall:400});
    loadoutReset();
    const lost = pcaExportDrops(MSTR.channels, loadoutSeqs());
    return {
      fields: lost.map(d=>d.field),
      why: lost.map(d=>d.why).join(' || '),
      speeds: s.frames.some(f=>f.speeds && f.speeds.some(v=>v))
    };
  });
  ok('the fixture really is a routine carrying per-frame speeds', drops.speeds);
  ok('no drop entry claims a frame speed is lost — it has survived since v1.66.0',
     !/frame speed\/acceleration/.test(drops.fields.join('|')), JSON.stringify(drops.fields));
  ok('acceleration is still named as dropped, because it still is',
     /frame acceleration/.test(drops.fields.join('|')), JSON.stringify(drops.fields));
  ok('…and the reason no longer says the channel table governs the motion',
     !/channel table's speed and acceleration govern the motion/.test(drops.why));

  const adoptNote = await ev(()=>{
    const P = pcaHeaderParse(pcaGenFromLoadout(), 'probe.h');
    return (P.dropped||[]).map(d=>d.field+': '+d.why).join(' || ');
  });
  ok('the import receipt no longer claims a frame speed survives BOTH ways',
     !/survives the round trip both ways/.test(adoptNote), adoptNote.slice(0,200));
  ok('…it says plainly that adopting into an existing droid drops them',
     /adopt/i.test(adoptNote) && /speed/i.test(adoptNote), adoptNote.slice(0,240));

  const mstrCfgDrop = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    const text = buildMstrText();
    const r = servoCfgImportText(text, 'theirs.mstr');
    return { dropped: (r.dropped||[]).map(d=>d.field), n: r.n };
  });
  ok('the servo-config door names the sequences it silently dropped from a .mstr',
     mstrCfgDrop.dropped.indexOf('sequences') >= 0, JSON.stringify(mstrCfgDrop));

  /* ============================================== the portability note */
  console.log('\n════ the "you cannot just email this" note ════');

  const port = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    exportMstr();
    const a = ($('maeMsg')||{}).innerHTML || '';
    setBoard('pca48'); makeStarter('dome','pca48');
    exportPcaHeader();
    return { mstr: a, pca: ($('maeMsg')||{}).innerHTML || '' };
  });
  ok('the .mstr receipt says the file describes this droid, not the routine',
     /describes your droid/i.test(port.mstr), port.mstr.slice(-260));
  ok('…and names the path a recipient should take instead',
     /choreography only/i.test(port.mstr));
  ok('the header receipt carries the same sentence',
     /describes your droid/i.test(port.pca) && /choreography only/i.test(port.pca), port.pca.slice(-260));

  /* ================================= the acts sidecar tells the truth */
  console.log('\n════ the part map does not claim a channel that has no pin ════');

  const acts = await ev(()=>{
    setBoard('pca48'); makeStarter('dome','pca48');
    const victim = MSTR.channels[3];
    const keptAct = victim.act;
    victim.mode = 'Input';                       /* un-ticked on the bench */
    const packed = actsPack(MSTR.channels);
    const back = JSON.parse(decodeURIComponent(escape(atob(packed))));
    return { keptAct: keptAct, inFile: back.acts[3], stillInTable: victim.act,
             others: back.acts.filter(Boolean).length };
  });
  ok('the fixture channel did carry a part before it was un-ticked', !!acts.keptAct, acts.keptAct);
  ok('a non-servo channel is not claimed by the exported part map',
     acts.inFile === '', JSON.stringify(acts.inFile));
  ok('…but the table keeps it, so re-ticking the channel gets the part back',
     acts.stillInTable === acts.keptAct, acts.stillInTable);
  ok('every other mapping is still written', acts.others > 5, 'mapped='+acts.others);

  console.log('\n'+(errs.length ? 'PAGE ERRORS: '+errs.join(' | ') : 'no page errors'));
  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
