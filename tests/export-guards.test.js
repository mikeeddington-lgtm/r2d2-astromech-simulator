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

  /* ================================================================== 5
     v1.69.0 — THE VALIDATE PANEL, AND WHAT THE GENERATOR DOES WITH A NAME

     A walkthrough of the builder's step 3 read "ERRORS 129, WARNINGS 9",
     and all 129 were one sentence repeated: every frame that pushed one
     channel past its limits got its own line. A report nobody can read is
     a report nobody reads, so the count below is about the number of LINES
     the report contains, not the number of frames behind them — and the
     line has to keep the channel number, because that is the only thing an
     affordance can act on. The colour is the same argument in one glance:
     errors were rendered in the warnings' amber, so the two piles looked
     alike from across the room. */
  console.log('\n════ the validate panel collapses duplicates and colours errors as errors ════');

  const dedupe = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    /* the first channel any starter frame actually drives — narrowing THAT
       one is what puts every frame that touches it out of range */
    let victim = -1;
    (MSTR.sequences||[]).forEach(s=>(s.frames||[]).forEach(f=>
      (f.targets||[]).forEach((t,i)=>{ if(t && victim < 0) victim = i; })));
    const c = MSTR.channels[victim];
    c.min = 10400; c.max = 10800;
    const rep = lintMaestro();
    const errItems = rep.items.filter(i=>i.level === 'err');
    const range = errItems.filter(i=>i.code === 'tgt-range');
    return {
      victim,
      frames: rep.stats.outOfRange,
      lines: range.length,
      errItems: errItems.length,
      uniq: new Set(errItems.map(i=>i.msg)).size,
      n: range.length ? range[0].n : null,
      ch: range.length ? range[0].ch : null,
      msg: range.length ? range[0].msg : ''
    };
  });
  ok('the fixture really does put a pile of frames out of range',
     dedupe.frames > 20, 'outOfRange=' + dedupe.frames);
  ok('one channel over its limits is ONE error line, however many frames did it',
     dedupe.lines === 1, dedupe.lines + ' line(s) for ' + dedupe.frames + ' frame(s)');
  ok('…and the line carries the frame count, so nothing is hidden by collapsing it',
     dedupe.n === dedupe.frames && new RegExp('\\b'+dedupe.frames+'\\b').test(dedupe.msg),
     'n=' + dedupe.n + '  ' + dedupe.msg);
  ok('…and the channel number, which is what an affordance can act on',
     dedupe.ch === dedupe.victim, 'ch=' + JSON.stringify(dedupe.ch));
  ok('no two errors in the whole report say the same sentence twice',
     dedupe.errItems === dedupe.uniq, dedupe.errItems + ' error(s), ' + dedupe.uniq + ' distinct');

  const panel = await ev(()=>{
    try{
      bldOpen();
      const notes = Array.from(document.querySelectorAll('#bldWiz .note'));
      const find = re => notes.find(n=>re.test(n.textContent||''));
      const errNote  = find(/limits/i);
      const warnNote = find(/home .* outside|cut short|loadout has/i);
      const style = n => (n ? (n.getAttribute('style') || '') : '');
      const foot = Array.from(document.querySelectorAll('#bldWiz .iwfoot button'))
                        .map(b=>({t:(b.textContent||'').trim(), c:b.className}));
      const fix = errNote ? errNote.querySelector('button[data-fixch]') : null;
      return {
        errStyle: style(errNote), warnStyle: style(warnNote),
        hasErr: !!errNote, hasWarn: !!warnNote,
        fixCh: fix ? fix.getAttribute('data-fixch') : null,
        fixLabel: fix ? (fix.textContent||'').trim() : '',
        foot
      };
    }catch(e){ return { thrown: String(e && e.message || e) }; }
  });
  ok('the errors panel does not paint itself in the warnings\' amber',
     !panel.thrown && panel.hasErr && /var\(--rd/.test(panel.errStyle),
     panel.thrown || JSON.stringify(panel.errStyle));
  ok('…and the warnings panel is left alone, so the two now differ',
     !panel.thrown && panel.hasWarn && !/var\(--rd/.test(panel.warnStyle),
     panel.thrown || JSON.stringify(panel.warnStyle));
  ok('the error offers a way to act on the channel it names',
     panel.fixCh !== null && panel.fixCh !== undefined && /fix/i.test(panel.fixLabel),
     JSON.stringify(panel.fixLabel) + ' data-fixch=' + JSON.stringify(panel.fixCh));

  /* the two footer buttons are the OWNER's call and are deferred — this
     pins that nothing here reordered or restyled them */
  ok('the footer still ends "Export anyway" (primary) then "Done", untouched',
     !panel.thrown && panel.foot.length >= 2
     && /^Export anyway/i.test(panel.foot[panel.foot.length-2].t)
     && /\bprim\b/.test(panel.foot[panel.foot.length-2].c)
     && /^Done$/i.test(panel.foot[panel.foot.length-1].t),
     JSON.stringify(panel.foot));

  const reached = await ev(()=>{
    try{
      const b = document.querySelector('#bldWiz .note button[data-fixch]');
      if(!b) return { missing:true };
      const want = +b.getAttribute('data-fixch');
      b.click();
      return { want, open: !!(typeof SETUP !== 'undefined' && SETUP.open),
               stepKey: (typeof SETUP_STEPS !== 'undefined' && SETUP_STEPS[SETUP.step])
                        ? SETUP_STEPS[SETUP.step].key : null,
               sel:  (typeof SETUP !== 'undefined') ? SETUP.sel  : null,
               builderShut: (typeof BLD !== 'undefined') ? !BLD.open : null };
    }catch(e){ return { thrown: String(e && e.message || e) }; }
  });
  ok('"Fix channel N" really lands on that channel in the bench',
     !reached.thrown && !reached.missing && reached.open === true
     && reached.stepKey === 'channels' && reached.sel === reached.want,
     JSON.stringify(reached));

  /* ================================================================== 6 */
  console.log('\n════ a name can never end the comment it is written into ════');

  const cmt = await ev(()=>{
    setBoard('pca48'); makeStarter('dome','pca48');
    MSTR.sequences[0].name = 'Wave */ int pwn = 1; /*';
    MSTR.channels[1].name = 'Pie */ evil';
    MSTR.channels[2].name = 'Multi\nline';
    loadoutReset();
    const h = pcaGenFromLoadout();
    /* the prose blocks at the top of the header run over many lines, so
       "opens one and closes one" is not the rule. The rule is that no
       single line may CLOSE a comment twice, which is exactly what an
       interpolated star-slash does and nothing else in the file does. */
    const bad = h.split('\n').filter(l=>(l.match(/\*\//g) || []).length > 1);
    const P = pcaHeaderParse(h, 'probe.h');
    return { bad: bad.slice(0,3),
             seqName: (P.sequences[0]||{}).name || '',
             ch1: (P.channels[1]||{}).name || '',
             ch2: (P.channels[2]||{}).name || '',
             rows: P.channels.length };
  });
  ok('no generated line closes a comment twice', cmt.bad.length === 0, JSON.stringify(cmt.bad));
  ok('the routine name survives the round trip instead of being truncated at the */',
     /int pwn/.test(cmt.seqName), JSON.stringify(cmt.seqName));
  ok('a channel name with a */ in it comes back whole', /evil/.test(cmt.ch1), JSON.stringify(cmt.ch1));
  ok('a newline in a channel name never reaches the file',
     cmt.ch2 === 'Multi line', JSON.stringify(cmt.ch2));

  /* ================================================================== 7 */
  console.log('\n════ a zero-frame routine never reaches the C ════');

  const empty = await ev(()=>{
    setBoard('pca48'); makeStarter('dome','pca48');
    MSTR.sequences.push({name:'Empty One', frames:[]});
    loadoutReset();
    const h = pcaGenFromLoadout();
    const rep = lintMaestro();
    const arrays = (h.match(/static const uint16_t MPCA_SEQ\d+\[\]/g) || []).length;
    const declared = /#define MPCA_SEQUENCES\s+(\d+)/.exec(h);
    return {
      emptyArray: /PROGMEM\s*=\s*\{[^\n]*\n\};/.test(h),
      zeroRow: /\{\s*MPCA_SEQ\d+,\s*0,/.test(h),
      arrays, declared: declared ? +declared[1] : -1,
      named: /Empty One/.test(h),
      lint: rep.items.filter(i=>i.code === 'seq-empty').map(i=>i.level + ':' + i.msg)
    };
  });
  ok('no empty C array is written', !empty.emptyArray);
  ok('no slot-table row claims a zero-frame sequence', !empty.zeroRow);
  ok('MPCA_SEQUENCES counts the arrays that were actually written',
     empty.declared === empty.arrays, empty.declared + ' declared / ' + empty.arrays + ' written');
  ok('the header still names the routine it dropped', empty.named);
  ok('the linter has a rule for it, so the builder says so before the export',
     empty.lint.length === 1, JSON.stringify(empty.lint));

  /* ================================================================== 8 */
  console.log('\n════ a 90-second hold is still 90 seconds on the droid ════');

  const longHold = await ev(()=>{
    const ch = [0,1].map(i=>({i, name:'c'+i, mode:'Servo', min:4000, max:8000, home:6000,
      homemode:'Goto', neutral:6000, range:1905, speed:0, acceleration:0, releaseMs:0,
      ease:'', act:'', invert:false}));
    const h = pcaGenHeader(ch, [{name:'Long Hold',
      frames:[{name:'hold', duration:90000, targets:[7000, 0]}]}], {source:'test'});
    const P = pcaHeaderParse(h, 'long.h');
    const fr = P.sequences[0].frames;
    return { durs: fr.map(f=>f.duration), total: fr.reduce((a,f)=>a+f.duration,0),
             first: fr[0].targets.slice(0,2),
             restQuiet: fr.slice(1).every(f=>f.targets.every(t=>!t)) };
  });
  ok('no emitted row can overflow the uint16 duration',
     longHold.durs.every(d=>d >= 0 && d <= 65535), JSON.stringify(longHold.durs));
  ok('…and the hold still adds up to the 90 s that was asked for',
     longHold.total === 90000, longHold.total + ' ms');
  ok('the targets ride on the first row only, so the split changes no motion',
     longHold.first[0] === 7000 && longHold.restQuiet, JSON.stringify(longHold.first));

  /* ================================================================== 9 */
  console.log('\n════ the >128-sequence guard tells the truth about an old library ════');

  const over = await ev(()=>{
    const ch = [{i:0, name:'c0', mode:'Servo', min:4000, max:8000, home:6000, homemode:'Goto',
      neutral:6000, range:1905, speed:0, acceleration:0, releaseMs:0, ease:'', act:'', invert:false}];
    const seqs = [];
    for(let k=0;k<130;k++) seqs.push({name:'S'+k, frames:[{name:'f', duration:100, targets:[6000]}]});
    const h = pcaGenHeader(ch, seqs, {source:'test'});
    const few = pcaGenHeader(ch, seqs.slice(0,8), {source:'test'});
    return { h, guardWhenFew: /MPCA_MASK_WORDS/.test(few) };
  });
  ok('the warning no longer says an old library is unaffected',
     !/on this board are unaffected/.test(over.h),
     (over.h.match(/#warning[\s\S]{0,320}/) || [''])[0]);
  ok('…it names int16_t Track::seq as the thing that decides it',
     /int16_t/.test(over.h) && /sequenceRunning\(\)/.test(over.h));
  ok('a #error keyed on MPCA_MASK_WORDS fails the build instead of scrolling past',
     /#ifndef MPCA_MASK_WORDS[\s\S]{0,600}#error[\s\S]{0,600}#endif/.test(over.h),
     (over.h.match(/#ifndef MPCA_MASK_WORDS[\s\S]{0,400}/) || [''])[0]);
  ok('a header inside 128 sequences carries no such guard, so nothing changes for anybody',
     !over.guardWhenFew);
  /* the guard is only worth anything if the symbol it keys on really is the
     one the fixed library defines — read the library, do not assume it */
  ok('MPCA_MASK_WORDS is defined by the shipped arduino/MaestroPCA/src/MaestroPCA.h',
     /^#define\s+MPCA_MASK_WORDS\s+\d+/m.test(
       require('fs').readFileSync(path.resolve(__dirname,'..','arduino','MaestroPCA','src','MaestroPCA.h'),'utf8')));

  /* ================================================================= 10 */
  console.log('\n════ the JS channel mask is the firmware\'s four words again ════');

  const wide = await ev(()=>{
    try{
      const ch = [];
      for(let i=0;i<48;i++) ch.push({i, name:'c'+i, mode:'Servo', min:4000, max:8000, home:6000,
        homemode:'Goto', neutral:6000, range:1905, speed:0, acceleration:0, releaseMs:0,
        ease:'', act:'', invert:false});
      const one = (idx,v)=>{ const a = new Array(48).fill(0); a[idx] = v; return a; };
      const seqs = [
        {name:'High A', frames:[{name:'f', duration:400, targets:one(32,7000)}]},
        {name:'High B', frames:[{name:'f', duration:400, targets:one(40,7000)}]},
        {name:'Edge31', frames:[{name:'f', duration:400, targets:one(31,7000)}]}
      ];
      const E = pcaCreate(ch, seqs);
      const m0 = pcaSeqMask(E,0), m1 = pcaSeqMask(E,1), m2 = pcaSeqMask(E,2);
      pcaRestart(E,0); pcaRestart(E,1);
      return {
        words: m0.length,
        selfOverlap: pcaMaskOverlaps(m0, m0),
        disjointHigh: pcaMaskOverlaps(m0, m1),
        boundary: pcaMaskOverlaps(m2, m0),
        has32: pcaMaskHas(m0, 32), has31: pcaMaskHas(m0, 31),
        running: pcaRunningCount(E), a: pcaSeqRunning(E,0), b: pcaSeqRunning(E,1)
      };
    }catch(e){ return { thrown: String(e && e.message || e) }; }
  });
  ok('the mask is MPCA_MASK_WORDS words wide, like the C++',
     wide.words === 4, wide.thrown || ('words=' + wide.words));
  ok('a mask still overlaps itself', wide.selfOverlap === true, wide.thrown || String(wide.selfOverlap));
  ok('two sequences on channels 32 and 40 no longer collide',
     wide.disjointHigh === false, wide.thrown || String(wide.disjointHigh));
  ok('…and 31 is no longer folded in with everything above it',
     wide.boundary === false && wide.has32 === true && wide.has31 === false,
     wide.thrown || JSON.stringify({b:wide.boundary, has32:wide.has32, has31:wide.has31}));
  ok('so the sim runs both of them at once, exactly as the droid does',
     wide.running === 2 && wide.a && wide.b, wide.thrown || ('running=' + wide.running));

  /* ================================================================= 11
     v1.78.0, review M9 — TWO LINT RULES THAT CRIED WOLF

     (a) `chan-range` made min >= max an ERROR while the bench RECORDS a
         reversed linkage by swapping the pair (the REV tick), so every
         export of a droid with one reversed panel said "Written with N
         validation errors outstanding" and the button read "Export anyway".
     (b) `timing` judged every re-target from rest against the step before
         it, and a compiled ramp is a staircase that re-targets before each
         step arrives BY DESIGN — one plain 'oc' brick at Mike's 80/10 drew
         three warnings on a routine that lands on time, burying the real
         ones. A run of same-direction re-targets is one move now.
     Both assert on the REPORT — counts and codes — because counts.err is
     what relabels the export button and writes the receipt. */
  console.log('\n════ a reversed channel is not an export error ════');

  const rev = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    const c = MSTR.channels.find(x=>/^servo/i.test(x.mode));
    const lo = Math.min(c.min, c.max), hi = Math.max(c.min, c.max);
    c.min = hi; c.max = lo;                              /* the REV tick's own record */
    const onMaestro = lintMaestro();
    const revItems = onMaestro.items.filter(i=>i.ch === c.i && /chan-/.test(i.code));
    setBoard('pca48'); makeStarter('dome','pca48');
    const p = MSTR.channels.find(x=>/^servo/i.test(x.mode));
    const plo = Math.min(p.min, p.max), phi = Math.max(p.min, p.max);
    p.min = phi; p.max = plo;
    const onPca = lintMaestro();
    /* and a pair with NO travel is still an error on either board */
    p.min = p.max;
    const flat = lintMaestro();
    return {
      ch: c.i,
      maestroErrs: onMaestro.counts.err,
      maestroCodes: onMaestro.items.filter(i=>i.level === 'err').map(i=>i.code),
      revItems: revItems.map(i=>({level:i.level, code:i.code, msg:i.msg, fix:i.fix})),
      pcaItems: onPca.items.filter(i=>i.ch === p.i && /chan-/.test(i.code)).map(i=>i.level + ':' + i.code),
      pcaErrs: onPca.counts.err,
      flat: flat.items.filter(i=>i.ch === p.i && i.code === 'chan-range').map(i=>i.level)
    };
  });
  ok('a reversed pair on a Maestro build is not among the errors',
     rev.maestroErrs === 0, 'err=' + rev.maestroErrs + ' ' + JSON.stringify(rev.maestroCodes));
  ok('…it is a WARNING that names Control Center and says the pair is written as stored',
     rev.revItems.length === 1 && rev.revItems[0].level === 'warn'
     && /Control Center/.test(rev.revItems[0].msg + ' ' + rev.revItems[0].fix)
     && /as stored/i.test(rev.revItems[0].msg + ' ' + rev.revItems[0].fix),
     JSON.stringify(rev.revItems));
  ok('…and on a PCA9685 build, which has no Control Center, it is not mentioned at all',
     rev.pcaErrs === 0 && rev.pcaItems.length === 0, 'err=' + rev.pcaErrs + ' ' + JSON.stringify(rev.pcaItems));
  ok('a channel with min === max — no travel — is still an error',
     JSON.stringify(rev.flat) === '["err"]', JSON.stringify(rev.flat));

  console.log('\n════ a compiled ramp at Mike\'s 80/10 raises no timing warning; a real reversal still does ════');

  const chain = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    const act = blockActions()[0].act;
    const c = blockChan(act);
    c.speed = 80; c.acceleration = 10;                   /* the dome Maestro's own numbers, bench 2026-07-29 */
    const s = MSTR.sequences[blockNewRoutine('One brick')];
    /* 'oc'; the ramps are floored to the channel's own full throw — 4000
       quarter-µs at 80/10 is accel-dominated, ~1131 ms — and drawn as a
       staircase of 500 ms steps, so every step is a re-target the old rule
       judged from rest and found 234 ms short */
    blockAdd(s, 'act', act, 0, {dur:3000, rise:250, fall:250});
    const issues = seqTimingIssues(s);
    const rep = lintMaestro();
    /* and a plain frame list that really does turn a panel round before it
       can have got there: a full throw at speed 10 (1 quarter-µs per ms, so
       4000 quarter-µs takes 4 s) given 50 ms */
    const slow = MSTR.channels.find(x=>/^servo/i.test(x.mode) && x.i !== c.i);
    slow.speed = 10; slow.acceleration = 0;
    const row = v=>{ const t = new Array(MSTR.channels.length).fill(0); t[slow.i] = v; return t; };
    const lo = Math.min(slow.min, slow.max), hi = Math.max(slow.min, slow.max);
    const bad = {name:'Whipsaw', frames:[
      {name:'out',  duration:50,  targets:row(hi)},
      {name:'back', duration:50,  targets:row(lo)},
      {name:'out2', duration:500, targets:row(hi)}
    ]};
    const badIssues = seqTimingIssues(bad);
    MSTR.sequences.push(bad);
    const rep2 = lintMaestro();
    return {
      steps: s.frames.length,
      speeds: [c.speed, c.acceleration],
      issues: issues.map(i=>({frame:i.frame, had:i.had, need:i.need})),
      timingFor: rep.items.filter(i=>i.code === 'timing' && /One brick/.test(i.msg)).length,
      bad: badIssues.map(i=>({frame:i.frame, had:i.had, need:i.need})),
      badLine: (rep2.items.find(i=>i.code === 'timing' && /Whipsaw/.test(i.msg)) || {}).msg || ''
    };
  });
  ok('the fixture is a real staircase on an accel-dominated channel — two steps up, a hold, two steps down, home',
     chain.steps >= 5 && chain.speeds[0] === 80 && chain.speeds[1] === 10,
     chain.steps + ' frames at ' + chain.speeds.join('/'));
  ok("one plain 'oc' brick at speed 80 / accel 10 raises NO timing issue — the staircase is one move and it lands on time",
     chain.issues.length === 0 && chain.timingFor === 0, JSON.stringify(chain.issues));
  ok('a frame that reverses a full throw at speed 10 inside 50 ms still fires',
     chain.bad.length >= 1 && chain.bad.every(i=>i.had === 50 && i.need >= 3900), JSON.stringify(chain.bad));
  ok('…and the report line names the sequence, the time it had and the time it needed',
     /Whipsaw/.test(chain.badLine) && /50 ms of a \d{4} ms travel/.test(chain.badLine), chain.badLine);

  ok('no page errors', errs.length === 0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
