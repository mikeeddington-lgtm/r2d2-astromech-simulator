/* PCA Studio smoke test. Part of ./test.sh since v1.43.0 (it runs last,
   against the tracked PCA-Studio.html); run alone with
   node pca-studio/smoke.test.js */
const { launchBrowser } = require('../tests/harness');
const path = require('path');
const fs = require('fs');
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };
const LIVE = fs.readFileSync(path.resolve(__dirname,'..','examples','R2-dome-padawan.mstr'),'utf8');

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname,'PCA-Studio.html'));
  await page.waitForTimeout(800);

  ok('loads with no page errors', errs.length===0, errs.join(' | '));
  ok('default project: 4 channels, 2 sequences', await page.evaluate(()=>PROJ.channels.length===4 && PROJ.sequences.length===2));

  /* ---- the DEFAULT screen's channel table (0.9.2) ----
     Mike: "Home isn't editable from the default screen, reverse tick too."
     home was disabled whenever boot was off, which meant the only way to set
     one was to arm boot first — backwards, since boot decides whether the
     channel is DRIVEN there, not whether you may choose where there is. */
  const main = await page.evaluate(()=>{
    const out = {};
    buildChannels();
    const cell = (i,f)=>document.querySelector('#chTable tr[data-ch="'+i+'"] [data-f='+f+']');
    const c = PROJ.channels[0];
    c.homemode = 'Off'; buildChannels();
    out.homeEditableWhenBootOff = !cell(0,'home').disabled;
    /* µs in, quarter-µs stored — the same units as the wizard and the dial */
    out.shownMin = cell(0,'min').value;
    const hm = cell(0,'home');
    hm.value = '1500'; hm.dispatchEvent(new Event('input',{bubbles:true}));
    out.homeStored = c.home;
    out.homeStillOff = c.homemode;             /* editing home must not arm boot */
    /* the bands are here too */
    const mx = cell(0,'max');
    mx.value = '2600'; mx.dispatchEvent(new Event('input',{bubbles:true}));
    out.bandBad = mx.className;
    mx.value = '1824'; mx.dispatchEvent(new Event('input',{bubbles:true}));
    out.bandClean = mx.className;
    /* reverse, same rule as the setup table: drawn from min > max */
    out.revBefore = {checked:cell(0,'rev').checked, min:c.min, max:c.max};
    cell(0,'rev').click();
    out.revAfter  = {checked:cell(0,'rev').checked, min:c.min, max:c.max};
    cell(0,'rev').click();
    out.revBack   = {checked:cell(0,'rev').checked, min:c.min, max:c.max};
    /* the drive slider must follow a reversed pair, not invert its ends */
    out.sliderLo = +cell(0,'slider').min;
    out.sliderHi = +cell(0,'slider').max;
    return out;
  });
  console.log('\n════ the default screen edits everything the wizard does ════');
  ok('home is editable with boot off — boot is when, not whether',
     main.homeEditableWhenBootOff && main.homeStored === 6000 && main.homeStillOff === 'Off',
     'stored '+main.homeStored+', homemode '+main.homeStillOff);
  ok('min / max / home are µs here too, quarter-µs underneath',
     main.shownMin === '1136', 'min showed '+main.shownMin+' µs');
  ok('a width outside 500–2500 µs is flagged on this table as well',
     main.bandBad === 'bad' && main.bandClean === '');
  ok('reverse is a tick, read back off the numbers',
     main.revBefore.checked === false && main.revAfter.checked === true
     && main.revAfter.min === main.revBefore.max && main.revAfter.max === main.revBefore.min
     && main.revBack.checked === false && main.revBack.min === main.revBefore.min,
     JSON.stringify(main.revAfter));
  ok('  and the drive slider still spans the pair the right way round',
     main.sliderLo < main.sliderHi, main.sliderLo+'..'+main.sliderHi);

  /* engine runs off the rAF loop */
  const t0 = await page.evaluate(()=>E.ticks);
  await page.waitForTimeout(500);
  const t1 = await page.evaluate(()=>E.ticks);
  ok('engine ticks in real time (~10 ms cadence)', t1-t0>20 && t1-t0<80, (t1-t0)+' ticks in 500 ms');

  /* drive a channel and watch it move under the speed law */
  const move = await page.evaluate(()=>{
    pcaSetTarget(E,0,4544);            // snap (homemode Off)
    const snap=pcaPos(E,0);
    pcaSetTarget(E,0,7296);
    return {snap, target:E.st[0].target};
  });
  /* speed 80 + accel 10 over a 2752-count throw ≈ 67 ticks (~670 ms) */
  const landed = await page.waitForFunction(()=>pcaPos(E,0)===7296, null, {timeout:5000})
    .then(()=>7296).catch(()=>page.evaluate(()=>pcaPos(E,0)));
  ok('slider channel snaps then travels to target', move.snap===4544 && landed===7296, move.snap+'→'+landed);

  /* play slot 0 to completion */
  await page.evaluate(()=>{ $('bPlay').click(); });
  const played = await page.waitForFunction(()=>E.seq===-1 && E.frameLog.length>=5, null, {timeout:15000}).then(()=>true).catch(()=>false);
  ok('slot 0 plays through all frames and stops', played);

  /* .mstr import — Mike's real dome file */
  const imp = await page.evaluate(text=>{
    const P=mstrImportText(text,'R2-dome-padawan.mstr');
    return {n:P.channels.length, s:P.sequences.length, first:P.sequences[0].name, warn:P.warn};
  }, LIVE);
  ok('imports the live dome file: 18 channels', imp.n===18, imp.n+' channels');
  ok('slot 0 follows the script order (Dome Pies Open)', /pies open/i.test(imp.first), imp.first);

  /* generated header matches the sim generator's shape */
  const hdr = await page.evaluate(text=>{
    const P=mstrImportText(text,'R2-dome-padawan.mstr');
    return pcaGenHeader(P.channels, P.sequences, {source:'R2-dome-padawan.mstr'});
  }, LIVE);
  /* v1.63.0 stopped naming I2C addresses in the generated header on purpose —
     the sketches SCAN for their boards now (Mike: "I and others may jumper them
     differently"), so a header that said "board 1 -> 0x41" was naming an address
     the boot scan may never use, and somebody wires to the comment. This used to
     assert 0x41 and went on passing only because pca-studio/PCA-Studio.html is a
     TRACKED generated file that had not been rebuilt since. It asserts the thing
     the header actually promises now: the board-to-CHANNEL mapping. */
  ok('header: 18 channels over 2 boards, endpoints verbatim',
     hdr.indexOf('#define MPCA_CHANNELS  18')>=0
     && /board 0 -> channels 0\.\.15/.test(hdr) && /board 1 -> channels 16\.\.17/.test(hdr)
     && /4544, {2}7296/.test(hdr));
  ok('header: slot define for Dome Pies Open is slot 0', hdr.indexOf('#define MPCA_SLOT_DOME_PIES_OPEN 0')>=0);

  /* frame-row parser must stop at the `s` marker */
  const marker = await page.evaluate(()=>{
    const xml='<UscSettings version="1"><Channels><Channel name="A" mode="Servo" min="4000" max="8000" home="6000" homemode="Off" speed="0" acceleration="0"/><Channel name="B" mode="Servo" min="4000" max="8000" home="6000" homemode="Off" speed="0" acceleration="0"/></Channels>'
      +'<Sequences><Sequence name="T"><Frame name="F" duration="100">6000 0 s 80 80 a 10 10</Frame></Sequence></Sequences></UscSettings>';
    const P=mstrImportText(xml,'t.mstr');
    return P.sequences[0].frames[0].targets;
  });
  ok('frame rows stop at the s marker (speeds are not phantom targets)',
     JSON.stringify(marker)==='[6000,0]', JSON.stringify(marker));

  /* --- concurrency + looping (mirrors the C++ tracks_test) --- */
  const tracks = await page.evaluate(()=>{
    const ch=[0,1,2,3].map(i=>({name:'c'+i,mode:'Servo',min:4000,max:8000,home:6000,homemode:'Goto',speed:20,acceleration:0}));
    const f=(d,t)=>({name:'f',duration:d,targets:t});
    const seqs=[
      {name:'sweep', loop:true, frames:[f(600,[8000,0,0,0]), f(600,[4000,0,0,0])]},   // ch0 only
      {name:'panels', frames:[f(200,[0,8000,8000,0]), f(200,[0,4000,4000,0])]},        // ch1-2
      {name:'grab',   frames:[f(200,[6000,0,0,0])]}                                    // ch0 — overlaps
    ];
    const E=pcaCreate(ch,seqs);
    const step=ms=>{ for(let i=0;i<ms;i+=10) pcaTick(E,10); };
    pcaRestart(E,0); step(3000);
    const loops = pcaSeqRunning(E,0);
    pcaRestart(E,1);
    const both = pcaRunningCount(E)===2 && pcaSeqRunning(E,0);
    step(500);
    const survived = pcaSeqRunning(E,0) && !pcaSeqRunning(E,1);
    pcaRestart(E,2);
    const displaced = !pcaSeqRunning(E,0) && pcaSeqRunning(E,2);
    return {loops, both, survived, displaced};
  });
  ok('a loop:true sequence keeps running past its last frame', tracks.loops);
  ok('a sequence on other channels runs alongside it', tracks.both);
  ok('it survives while the other finishes', tracks.survived);
  ok('a sequence claiming its channel displaces it', tracks.displaced);

  const genLoop = await page.evaluate(()=>{
    const ch=[{name:'a',mode:'Servo',min:4000,max:8000,home:0,homemode:'Off',speed:0,acceleration:0}];
    const seqs=[{name:'Idle', loop:true, frames:[{name:'f',duration:100,targets:[6000]}]}];
    return pcaGenHeader(ch,seqs,{source:'t'});
  });
  ok('the generated header marks a looping sequence', /MPCA_SEQ0, 1, MPCA_SEQ_LOOP/.test(genLoop), genLoop.split('\n').filter(l=>l.includes('MPCA_SEQ0,'))[0]||'');

  /* --- the beyond-the-Maestro features (mirrors features_test.cpp) --- */
  const feats = await page.evaluate(()=>{
    const mk=(o)=>Object.assign({name:'c',mode:'Servo',min:4000,max:8000,home:6000,
      homemode:'Goto',speed:40,acceleration:0,releaseMs:0,ease:'none'},o);
    const ch=[mk({releaseMs:500}), mk({}), mk({acceleration:10,ease:'overshoot'}), mk({acceleration:10,ease:'soft'})];
    const seqs=[
      {name:'idle', gen:'osc', background:true, entries:[{ch:1,lo:4000,hi:8000,period:2000,phase:0}]},
      {name:'grab', frames:[{name:'f',duration:400,targets:[0,7000,0,0]}]},
      {name:'life', gen:'wander', entries:[{ch:1,lo:4000,hi:8000,period:300,phase:0}]}
    ];
    const E=pcaCreate(ch,seqs);
    const step=ms=>{ for(let i=0;i<ms;i+=10) pcaTick(E,10); };

    /* release when settled */
    pcaSetTarget(E,0,8000); pcaSetTarget(E,1,8000);
    step(2000);
    const released=pcaReleased(E,0) && pcaPos(E,0)===0;
    const held=!pcaReleased(E,1) && pcaPos(E,1)===8000;
    pcaSetTarget(E,0,4000);
    const resumed=pcaPos(E,0)>7000;          /* eased from memory, not snapped */

    /* oscillator sweeps the full range */
    pcaRestart(E,0);
    let lo=65535,hi=0;
    for(let i=0;i<6000;i+=10){ pcaTick(E,10); const p=pcaPos(E,1); if(p<lo)lo=p; if(p>hi)hi=p; }
    const swept = lo===4000 && hi===8000;

    /* background resume */
    pcaRestart(E,1);
    const displaced=!pcaSeqRunning(E,0) && pcaSeqRunning(E,1);
    step(600);
    const resumedBg=!pcaSeqRunning(E,1) && pcaSeqRunning(E,0);

    /* wander stays in range and keeps moving */
    pcaStop(E); pcaRestart(E,2);
    let wlo=65535,whi=0,changes=0,last=0;
    for(let i=0;i<6000;i+=10){ pcaTick(E,10); const p=pcaPos(E,1);
      if(p<wlo)wlo=p; if(p>whi)whi=p; if(last&&p!==last)changes++; last=p; }

    /* overshoot goes past then settles */
    const E2=pcaCreate(ch,seqs);
    pcaSetTarget(E2,2,7000);
    let peak=0;
    for(let i=0;i<4000;i+=10){ pcaTick(E2,10); const p=pcaPos(E2,2); if(p>peak)peak=p; }
    /* Regression, 2026-08-10: the POSITION must stay inside the calibrated
       endpoints, not just the target. Reversing with residual velocity used
       to carry a channel a little past min/max — and those endpoints are
       what stop a panel binding against the shell. */
    const E3=pcaCreate(ch,seqs);
    let rlo=99999, rhi=0;
    for(let round=0; round<24; round++){
      pcaSetTarget(E3, 2, (round & 1) ? 4000 : 8000);   /* ch2 = overshoot ease */
      const dwell = 120 + (round % 12) * 130;
      for(let i=0;i<dwell;i+=10){ pcaTick(E3,10); const p=pcaPos(E3,2);
        if(p<rlo)rlo=p; if(p>rhi)rhi=p; }
    }

    return {released,held,resumed,swept,displaced,resumedBg,
            wRange:whi-wlo, wIn:wlo>=4000&&whi<=8000, changes,
            peak, settledOn:pcaPos(E2,2), rlo, rhi};
  });
  ok('a channel with releaseMs goes quiet after settling', feats.released);
  ok('one without it keeps holding', feats.held);
  ok('re-driving a released channel eases from memory, no snap', feats.resumed);
  ok('an oscillator sweeps the full range, untruncatable', feats.swept);
  ok('a foreground sequence displaces a background one', feats.displaced);
  ok('and the background one resumes by itself', feats.resumedBg);
  ok('wander stays in range', feats.wIn);
  ok('wander explores and keeps moving', feats.wRange>1000 && feats.changes>100,
     'spread '+feats.wRange+', '+feats.changes+' changes');
  ok('overshoot goes past the target', feats.peak>7000, 'peak '+feats.peak);
  ok('  and settles back exactly on it', feats.settledOn===7000);
  ok('the position never leaves the endpoints across 24 reversals',
     feats.rlo>=4000 && feats.rhi<=8000, feats.rlo+'..'+feats.rhi);

  /* ---------------------------------------------------------- bricks
     The timeline is PCA Studio's view onto the SIM's own block sequencer
     (src/js/maestro/blocks.js, shared verbatim through the BLKH seam), so
     what is checked here is that the seam is wired up — the compiler
     itself is covered by tests/sequencer.test.js. */
  const bricks = await page.evaluate(()=>{
    const out = {};
    PROJ.channels.forEach((c,i)=>{ c.name = 'Pie '+(i+1); });
    PROJ.sequences.push({name:'Brick routine', frames:[]});
    curSeq = PROJ.sequences.length-1;
    rebuildAll();
    const seq = PROJ.sequences[curSeq];

    out.adopted = blkAdoptable(seq) && blockIsRoutine(seq);

    /* an imported frame list must NOT be adopted behind the user's back:
       the first brick regenerates the whole frame list, and those frames
       are somebody's hand-tuned choreography */
    PROJ.sequences.push({name:'Imported', frames:[
      {name:'a',duration:300,targets:[7296,0,0,0]},
      {name:'b',duration:300,targets:[4544,0,0,0]}]});
    const imp = PROJ.sequences[PROJ.sequences.length-1];
    out.refuses = (blkAdoptable(imp) === false) && !blockIsRoutine(imp);
    curSeq = PROJ.sequences.length-1; blkDraw();
    out.notice = !!document.querySelector('#tl .adoptnote') &&
                 document.querySelectorAll('#tl .brick').length === 0;
    document.getElementById('bAdoptCopy').click();
    out.copyMade = PROJ.sequences[curSeq].name === 'Imported (bricks)' &&
                   imp.frames.length === 2 && !imp.blocks;
    curSeq = PROJ.sequences.indexOf(seq); blkDraw();
    out.libBefore = document.querySelectorAll('#libList .libitem[data-kind=act]').length;

    blockAdd(seq, 'act', 'ch0', 0);
    blockAdd(seq, 'act', 'ch2', 600);
    out.lanes  = document.querySelectorAll('#tl .lane').length;   /* +1 for the seq lane */
    out.bricks = document.querySelectorAll('#tl .brick').length;
    /* the frames the board would actually run are REGENERATED from the
       bricks — that is the whole contract of the brick view */
    out.drives0 = seq.frames.some(f=>f.targets[0]);
    out.drives2 = seq.frames.some(f=>f.targets[2]);
    out.leaves1 = seq.frames.every(f=>f.targets[1] === seq.frames[0].targets[1]);
    out.frames  = seq.frames.length;

    /* a channel's own speed floors a brick's ramp: the board cannot ramp
       faster than it can move, so neither may the preview */
    const b0 = seq.blocks[0];
    b0.dur = 4000; b0.rise = 10; b0.fall = 10;
    out.floor = Math.round(blockMinTravelMs('ch0'));
    out.rampFloored = Math.round(blockEffRamps(b0).rise) >= out.floor;
    /* ...but a brick shorter than twice its floor is capped at half its own
       length instead. The servo then simply doesn't finish the throw, which
       is what the real board does too — the compiler does not get to invent
       time it hasn't been given. */
    b0.dur = 400;
    out.shortCap = Math.round(blockEffRamps(b0).rise) === 200;
    b0.dur = 1200;

    /* undo is per-routine and snapshot-based */
    blockHistPush(seq);
    blockAdd(seq, 'act', 'ch3', 1400);
    const three = seq.blocks.length;
    blockUndo(seq);
    out.undo = (three === 3 && seq.blocks.length === 2);

    /* a ready-made shape, built from a group */
    const g = blockGroups()[0];
    out.groupLabel = g && g.label;
    blockMakeShape(seq, 'wave', g.members);
    out.afterShape = seq.blocks.length;
    out.staggered = seq.blocks.slice(2).some((b,i,a)=>i && b.t0 !== a[0].t0);

    /* a generator sequence has no frames, so it must have no timeline */
    PROJ.sequences.push({name:'Idle', gen:'osc', entries:[{ch:0,lo:4544,hi:7296,period:3000,phase:0}]});
    curSeq = PROJ.sequences.length-1;
    blkDraw();
    out.hiddenForGen = document.getElementById('brickWrap').classList.contains('hide');
    return out;
  });
  ok('a frame-list sequence can be adopted as a brick routine', bricks.adopted);
  ok('an imported frame list is NOT adopted silently', bricks.refuses);
  ok('  it offers the choice in the timeline instead', bricks.notice);
  ok('  and "copy first" leaves the original frames alone', bricks.copyMade);
  ok('the library lists every servo channel', bricks.libBefore===4, bricks.libBefore+' items');
  ok('bricks land on their own lanes', bricks.lanes===3 && bricks.bricks===2,
     bricks.lanes+' lanes, '+bricks.bricks+' bricks');
  ok('the frames are regenerated from the bricks', bricks.drives0 && bricks.drives2 && bricks.frames>2,
     bricks.frames+' frames');
  ok('  and a channel with no brick is left alone', bricks.leaves1);
  ok('a ramp cannot be faster than the channel can move', bricks.rampFloored,
     'floor '+bricks.floor+' ms');
  ok('  but a short brick is capped at half its own length, not stretched', bricks.shortCap);
  ok('undo restores the previous brick list', bricks.undo);
  ok('a group builds a ready-made shape', bricks.afterShape===6 && bricks.staggered,
     bricks.groupLabel+' → '+bricks.afterShape+' bricks');
  ok('a generator sequence shows no timeline (it has no frames)', bricks.hiddenForGen);

  /* ------------------------------------------------------------ setup
     The wizard that builds a project from real hardware. What matters here
     is the calibration contract: the dial must be able to move a channel
     PAST its current endpoints (or you could never widen them), the three
     buttons capture wherever it is, and cancelling must put the old range
     back exactly. */
  const setup = await page.evaluate(()=>{
    const out = {};
    setupOpen(0);
    out.opened = SETUP.open && !!document.querySelector('.setcard');
    SETUP.hw.boards = 2; SETUP.hw.mcu = 'nano';
    out.channels = setupChannels();
    out.addr = [setupAddrHex(0), setupAddrHex(1), setupAddrHex(3)];
    out.jump = setupJumpers(3);

    setupGo(2);
    out.svg = !!document.querySelector('#setBody svg');
    setupGo(3);
    out.cfg = /PCA_BOARDS   2/.test(document.querySelector('.setpre').textContent);

    /* choosing an ESP32 must offer the sketch that exists for it, and must
       not leave a choice from another board selected */
    SETUP.hw.mcu = 'esp32'; SETUP.hw.sketch = 'coproc';
    document.getElementById('setBody').dispatchEvent(new Event('input'));
    setupGo(0);
    const inp = document.querySelector('input[data-f=mcu][value=esp32]');
    inp.checked = true; inp.dispatchEvent(new Event('input', {bubbles:true}));
    out.espSketch = SETUP.hw.sketch;
    setupGo(3);
    const cfg = document.querySelector('.setpre').textContent;
    out.espCard = /Esp32Droid/.test(document.getElementById('setBody').innerHTML);
    out.espCfg  = /MPCA_DIRECT_PINS  0/.test(cfg) && /Wire\.begin\(21, 22\)/.test(cfg);
    SETUP.hw.mcu = 'nano'; SETUP.hw.sketch = 'bridge';

    setupGo(4);
    setupUse(1, true);
    const c = PROJ.channels[1];
    const wasMin = c.min, wasMax = c.max;

    setupCalOpen(1);
    /* v1.51.0 — the working range opens for ONE CALL (calDrive) rather than
       for as long as the dial is on screen, because the dial is the default
       view now and a range left open would be saved over the builder's
       travel. So the channel is untouched by opening… */
    out.opensRange = (c.min === wasMin && c.max === wasMax);
    /* …and the TARGET is still what proves the clamp let go, driven the way
       the dial drives */
    out.reaches = (()=>{ calDrive(1, 4100); return E.st[1].target <= 4200; })();
    out.stillUntouched = (c.min === wasMin && c.max === wasMax);

    SETUP.cal.pos = 4300; document.querySelector('[data-cap=min]').click();
    SETUP.cal.pos = 7100; document.querySelector('[data-cap=max]').click();
    SETUP.cal.pos = 5800; document.querySelector('[data-cap=home]').click();
    out.captured = {min:SETUP.cal.min, max:SETUP.cal.max, home:SETUP.cal.home};

    /* cancel restores */
    setupCalCancel();
    out.restored = (c.min === wasMin && c.max === wasMax);

    /* And commit writes the captured pair. NOT homemode: capturing three
       pulse widths on a dial is CALIBRATION, and "drive to centre at
       power-up?" is a separate question with its own tick (setup-hw.js,
       v1.40.0 — Mike: "boot should not be auto ticked just because it's
       setup"). This suite still asserted the old behaviour because it is
       not in ./test.sh and had not been run since. */
    setupCalOpen(1);
    const modeBefore = c.homemode;
    SETUP.cal.min = 4300; SETUP.cal.max = 7100; SETUP.cal.home = 5800;
    setupCalCommit();
    out.committed = {min:c.min, max:c.max, home:c.home, mode:c.homemode, was:modeBefore};

    /* Reopening must work as well as opening. Setting channels.length on a
       shorter array leaves HOLES, and a hole is invisible until it is saved:
       JSON.stringify writes null, and unlike a hole a null is not skipped by
       forEach or filter. That was "it worked the first time and not the
       second", and it only showed after a reload. */
    setupApply();
    out.noHoles = PROJ.channels.length === 32 && PROJ.channels.every(c=>!!c);
    out.survivesJson = JSON.parse(JSON.stringify(PROJ.channels)).every(c=>!!c);
    setupOpen(4);
    out.reopened = SETUP.open && document.querySelectorAll('#setBody tr[data-ch]').length === 32;

    /* the dial: a drag must not rebuild the SVG it is captured on, so the
       shell and the paint pass are separate — same node, moved */
    setupCalOpen(1);
    const svg0 = document.getElementById('calDial');
    calSet(5000); calSet(5400); calSet(6200);
    out.sameNode = document.getElementById('calDial') === svg0;
    out.tracked = SETUP.cal.pos === 6200;
    /* and it steps a quarter of a microsecond — the finest the unit has */
    document.querySelector('[data-nudge="1"]').click();
    out.fine = SETUP.cal.pos === 6201;
    document.getElementById('calNum').value = '1234.75';
    document.getElementById('calNum').dispatchEvent(new Event('change'));
    out.typed = SETUP.cal.pos === 4939;

    /* reverse is a swap, not a flag — there is no invert anywhere downstream */
    setupCalOpen(1);
    SETUP.cal.min = 4300; SETUP.cal.max = 7100;
    document.getElementById('calRev').click();
    out.revDial = {min:SETUP.cal.min, max:SETUP.cal.max, checked:document.getElementById('calRev').checked};
    setupCalCommit();
    setupRender();
    /* v1.51.0 — `rev` lives in the Configure panel, not in the list */
    SETUP.sel = 1; setupRender();
    document.querySelector('#chCfg [data-k=rev]').click();
    setupCalCommit();
    out.revRow = {min:PROJ.channels[1].min, max:PROJ.channels[1].max};

    /* sleep-when-idle is releaseMs, the engine's own field. boot has to be
       ON for servos.h to carry a home at all — an unticked channel is limp
       at power-up and the table says so with a 0 (v1.40.0). */
    c.releaseMs = 900;
    c.homemode = 'Goto';
    const h = setupServosH();
    out.hRows = (h.match(/MPCA_EASE_/g)||[]).length;
    out.hSleep = /900, MPCA_EASE/.test(h);
    out.hGuard = /#error/.test(h);
    out.hEnds = /4300,\s+7100,\s+5800/.test(h);
    const j = JSON.parse(setupJson());
    out.jKind = j.kind; out.jBoards = j.setup.boards; out.jChans = j.channels.length;

    /* ---- v0.9.0: the pulse widths are edited directly. v1.51.0 — in the
       Configure panel rather than in the row, and they stage on the dial
       (setup-hw-channels.js), so committing is what reaches the channel. ---- */
    SETUP.sel = 1; setupRender();
    const mi = document.querySelector('#chCfg [data-k=minUs]');
    out.tableUsShown = mi.value;                       /* 4300 qus reads as 1075 µs */
    mi.value = '1100'; mi.dispatchEvent(new Event('input', {bubbles:true}));
    setupCalCommit(); setupRender();
    out.tableUsSet = PROJ.channels[1].min;             /* and writes back in qus */

    /* the two warning bands, on the field as you type */
    const mx = ()=>document.querySelector('#chCfg [data-k=maxUs]');
    mx().value = '2400'; mx().dispatchEvent(new Event('input', {bubbles:true}));
    out.clsWarn = mx().className;
    mx().value = '2600'; mx().dispatchEvent(new Event('input', {bubbles:true}));
    out.clsBad = mx().className;
    setupCalCommit(); setupRender();
    /* v1.70.1 — this used to assert that 2600 µs REACHED the channel and
       that the audit then found it, which was a description of the bug: the
       screen knew the rule and did not enforce it. The bench refuses a width
       outside 500–2500 at the point of entry now (setup-hw.js §policy), so
       the box goes red, the number is never staged, the commit writes the
       last width that WAS accepted, and there is nothing out of band on the
       board for the audit to count. */
    out.badRefused = pwAudit().bad.length === 0 && pwClass(PROJ.channels[1].max) !== 'bad';
    out.badKeptUs = (PROJ.channels[1].max / 4).toFixed(0);
    mx().value = '1775'; mx().dispatchEvent(new Event('input', {bubbles:true}));   /* put it back */
    setupCalCommit(); setupRender();
    out.clsClean = mx().className === '' && pwAudit().bad.length === 0;
    out.pwFn = [pwClass(6000), pwClass(3900), pwClass(8100), pwClass(1900), pwClass(10400), pwClass(0)].join(',');

    /* boot is what happens at power-up, and it is now its own tick */
    SETUP.sel = 1; setupRender();
    const bt = document.querySelector('#chCfg [data-k=boot]');
    out.bootWas = PROJ.channels[1].homemode;
    bt.click();
    out.bootNow = PROJ.channels[1].homemode;
    /* re-query: the tick's own handler re-renders the step, so `bt` is a
       detached node by now and clicking it again does nothing */
    document.querySelector('#chCfg [data-k=boot]').click();
    out.bootBack = PROJ.channels[1].homemode;

    /* reverse is a TICK now, and its state is read back off the numbers —
       so it can never disagree with the two boxes beside it. v1.51.0 — the
       numbers it swaps are the dial's pending pair, so each click is
       followed by the commit that writes them. */
    SETUP.sel = 1; setupRender();
    const rv = ()=>document.querySelector('#chCfg [data-k=rev]');
    const pair = ()=>({min:PROJ.channels[1].min, max:PROJ.channels[1].max});
    out.revStart = Object.assign({checked:rv().checked}, pair());
    rv().click(); setupCalCommit(); setupRender();
    out.revOn  = Object.assign({checked:rv().checked}, pair());
    rv().click(); setupCalCommit(); setupRender();
    out.revOff = Object.assign({checked:rv().checked}, pair());

    /* ---- apply to selected ---- */
    [2,3,4].forEach(i=>{ setupUse(i, true); PROJ.channels[i].speed = 10; });
    SETUP.pick = [2,3]; SETUP.apField = 'speed'; setupRender();
    document.getElementById('apVal').value = '55';
    document.querySelector('[data-act=applysel]').click();
    out.applyAsks  = !!document.querySelector('.askbar');
    out.applyHeld  = [PROJ.channels[2].speed, PROJ.channels[3].speed];   /* nothing yet */
    document.querySelector('[data-ask=no]').click();
    out.applyCancelled = [PROJ.channels[2].speed, PROJ.channels[3].speed];
    /* cancelling must not throw the typed number away and hand back the
       default next time — the value is deliberately NOT retyped here */
    out.keptValue = document.getElementById('apVal').value;
    document.querySelector('[data-act=applysel]').click();
    document.querySelector('[data-ask=yes]').click();
    out.applyDone = [PROJ.channels[2].speed, PROJ.channels[3].speed, PROJ.channels[4].speed];
    /* a synthetic field: µs in, quarter-µs stored, and only on the picked rows */
    SETUP.apField = 'ctrUs'; setupRender();
    document.getElementById('apVal').value = '1500';
    document.querySelector('[data-act=applysel]').click();
    document.querySelector('[data-ask=yes]').click();
    out.applyCtr = [PROJ.channels[2].home, PROJ.channels[3].home, PROJ.channels[4].home];

    /* ---- the dial: typed ends, reset, and surviving a re-render ---- */
    setupCalOpen(1);
    SETUP.cal.min = 4300; SETUP.cal.max = 7100; SETUP.cal.home = 5800; calPaint();
    const e1 = document.getElementById('calLmin');
    e1.value = '1200'; e1.dispatchEvent(new Event('change', {bubbles:true}));
    out.dialTyped = SETUP.cal.min;
    /* the whole point of the confirm: reset must not fire on the first click */
    document.querySelector('[data-cal=reset]').click();
    out.resetAsks = !!document.querySelector('.askbar') && SETUP.cal.min === 4800;
    document.querySelector('[data-ask=yes]').click();
    out.resetDone = [SETUP.cal.min, SETUP.cal.home, SETUP.cal.max];
    /* the tick is drawn from min > max, so a reset must clear it by itself */
    SETUP.cal.min = 9000; SETUP.cal.max = 4000; calPaint();
    out.revFollows = document.getElementById('calRev').checked;
    SETUP.cal.min = 4000; SETUP.cal.max = 8000; calPaint();
    out.revFollowsBack = document.getElementById('calRev').checked;
    /* rendering the table used to silently shut the dial AND strand the
       channel on the wide working range setupCalOpen installs */
    setupRender();
    out.dialSurvives = !!document.getElementById('calDial') && !!SETUP.cal;
    setupCalCancel();
    out.dialRestored = PROJ.channels[1].min === out.revOff.min;

    setupApply();
    out.applied = !SETUP.open && PROJ.channels.length === 32 && PROJ.setup.boards === 2;
    return out;
  });
  ok('the setup wizard opens', setup.opened);
  ok('two boards give 32 channels at 0x40/0x41, and 0x43 needs A0+A1',
     setup.channels===32 && setup.addr[0]==='0x40' && setup.addr[2]==='0x43' && /A0 \+ A1/.test(setup.jump));
  ok('the wiring step draws a diagram from the answers', setup.svg);
  ok('the sketch step shows the config the answers imply', setup.cfg);
  ok('picking an ESP32 offers Esp32Droid and drops a sketch it cannot flash',
     setup.espCard && setup.espSketch === 'esp32');
  ok('  and its config block is ESP32-shaped: I2C pins, expanders not LEDC',
     setup.espCfg);
  ok('the dial passes the old ends WITHOUT moving them (v1.51.0)',
     setup.opensRange && setup.reaches && setup.stillUntouched);
  ok('Min / Center / Max capture wherever the dial is',
     setup.captured.min===4300 && setup.captured.max===7100 && setup.captured.home===5800);
  ok('cancelling puts the old range back exactly', setup.restored);
  ok('applying leaves no holes in the channel table, before or after JSON',
     setup.noHoles && setup.survivesJson);
  ok('  so the wizard opens a second time with all 32 rows', setup.reopened);
  ok('dragging the dial does not rebuild the node it is captured on',
     setup.sameNode && setup.tracked);
  ok('  and it steps a quarter of a µs, or takes a typed value',
     setup.fine && setup.typed);
  ok('reverse swaps the two ends, on the dial and in the panel',
     setup.revDial.min===7100 && setup.revDial.max===4300 && setup.revDial.checked===true
     && setup.revRow.min===4300 && setup.revRow.max===7100);
  ok('committing writes the captured pair, and leaves boot alone (v1.40.0)',
     setup.committed.min===4300 && setup.committed.max===7100
     && setup.committed.home===5800 && setup.committed.mode===setup.committed.was,
     JSON.stringify(setup.committed));
  ok('servos.h covers every pin the boards have, not just the used ones',
     setup.hRows===32, setup.hRows+' rows');
  ok('  and carries the endpoints, the sleep timer and a channel-count guard',
     setup.hEnds && setup.hSleep && setup.hGuard);
  ok('the setup .json carries the hardware answers and the whole table',
     setup.jKind==='pca-studio-setup' && setup.jBoards===2 && setup.jChans===32);
  ok('applying it builds the project', setup.applied);

  console.log('\n════ the channel table edits what the dial used to own ════');
  ok('min / centre / max are µs in the table and quarter-µs underneath',
     setup.tableUsShown === '1075' && setup.tableUsSet === 4400,
     'showed '+setup.tableUsShown+' µs, stored '+setup.tableUsSet);
  ok('a width outside 1000–2000 µs is flagged amber, and one outside 500–2500 is refused',
     setup.clsWarn === 'warn' && setup.clsBad === 'bad' && setup.badRefused,
     '2400 µs → '+setup.clsWarn+', 2600 µs → '+setup.clsBad
     + ' and never written — the channel kept '+setup.badKeptUs+' µs');
  ok('  and the flag clears when the number comes back inside',
     setup.clsClean);
  ok('  the band function agrees at every boundary',
     setup.pwFn === ',warn,warn,bad,bad,', setup.pwFn);
  /* the tick TOGGLES — which way round it starts is the previous line's
     business (the dial no longer arms it), so assert the toggle, not the
     starting state */
  ok('boot decides what happens at power-up, per channel',
     setup.bootWas !== setup.bootNow && setup.bootBack === setup.bootWas,
     [setup.bootWas, setup.bootNow, setup.bootBack].join(' → '));
  ok('reverse is a tick whose state is read back off min and max',
     setup.revStart.checked === false && setup.revOn.checked === true
     && setup.revOn.min === setup.revStart.max && setup.revOn.max === setup.revStart.min
     && setup.revOff.checked === false && setup.revOff.min === setup.revStart.min,
     JSON.stringify(setup.revOn));

  console.log('\n════ apply to selected ════');
  ok('the apply button asks before it touches anything',
     setup.applyAsks && setup.applyHeld.join() === '10,10');
  ok('  cancelling changes nothing, and keeps what you typed',
     setup.applyCancelled.join() === '10,10' && setup.keptValue === '55', 'kept '+setup.keptValue);
  ok('  confirming writes the selected channels and only those',
     setup.applyDone.join() === '55,55,10', setup.applyDone.join());
  ok('  a µs field converts on the way in, still only for the selection',
     setup.applyCtr[0] === 6000 && setup.applyCtr[1] === 6000 && setup.applyCtr[2] !== 6000,
     setup.applyCtr.join());

  console.log('\n════ the dial: typed ends and reset ════');
  ok('an end can be typed as a pulse width instead of captured',
     setup.dialTyped === 4800, setup.dialTyped+' qus');
  ok('reset asks first, then goes to the stock 1000 / 1500 / 2000 µs',
     setup.resetAsks && setup.resetDone.join() === '4000,6000,8000', setup.resetDone.join());
  ok('the dial\'s reverse tick is drawn from the numbers, not stored',
     setup.revFollows === true && setup.revFollowsBack === false);
  ok('rendering the table no longer shuts the dial and strands the range',
     setup.dialSurvives && setup.dialRestored);

  const genHdr = await page.evaluate(()=>pcaGenHeader(
    [{name:'a',mode:'Servo',min:4000,max:8000,home:0,homemode:'Off',speed:0,acceleration:0,releaseMs:1200,ease:'overshoot'}],
    [{name:'Idle',gen:'osc',background:true,entries:[{ch:0,lo:4000,hi:8000,period:3000,phase:90}]}],{source:'t'}));
  ok('the header carries releaseMs and ease', /1200, MPCA_EASE_OVERSHOOT/.test(genHdr));
  ok('and emits an oscillator sequence', /MPCA_SEQ_BACKGROUND \| MPCA_SEQ_OSC/.test(genHdr)
     && /0,  4000,  8000,   3000,   90/.test(genHdr));

  /* --- firmware identification over a fake serial port --- */
  const idScenarios = await page.evaluate(async ()=>{
    const enc = new TextEncoder();
    function fakePort(opts){
      let ctrl;
      const readable = new ReadableStream({ start(c){ ctrl = c; } });
      const writable = new WritableStream({ write(chunk){
        const t = new TextDecoder().decode(chunk);
        if(opts.reply && t.indexOf('?') >= 0) ctrl.enqueue(enc.encode(opts.reply));
      }});
      return { readable, writable,
        open: async()=>{},
        close: async()=>{ try{ ctrl.close(); }catch(e){} },
        setSignals: async()=>{
          if(opts.onReset) setTimeout(()=>{ try{ ctrl.enqueue(enc.encode(opts.onReset)); }catch(e){} }, 40);
        } };
    }
    const out = {};
    async function run(name, opts){
      /* navigator.serial is a prototype GETTER — plain assignment silently
         fails and the real port picker then hangs forever in headless */
      Object.defineProperty(navigator, 'serial',
        { value:{ requestPort: async()=>fakePort(opts) }, configurable:true });
      await serialConnect();
      out[name] = { blocked: SER.blocked, chip: document.getElementById('serialChip').textContent };
      await serialDisconnect();
    }
    await run('bridgeBanner',  {onReset:'PCA-BRIDGE 1\n'});
    await run('coprocBanner',  {onReset:'MAESTRO-PCA 1\n'});
    await run('quietButAsks',  {reply:'--- PCA bridge ---\n'});          // the real-world case
    await run('coprocViaAsk',  {reply:'--- Maestro replacement ---\n'});
    await run('coprocV2',      {onReset:'MAESTRO-PCA 2\n--- Maestro replacement ---\n'});
    await run('coprocV2Ask',   {reply:'MAESTRO-PCA 2\n--- Maestro replacement ---\n'});
    await run('silent',        {});
    return out;
  });
  ok('a board announcing PCA-BRIDGE streams', idScenarios.bridgeBanner.blocked===false);
  ok('a board announcing MAESTRO-PCA is monitor-only', idScenarios.coprocBanner.blocked===true);
  ok('a QUIET bridge is identified by asking "?" and streams',
     idScenarios.quietButAsks.blocked===false, 'chip: '+idScenarios.quietButAsks.chip);
  ok('a quiet co-processor is identified by asking, and stays monitor-only',
     idScenarios.coprocViaAsk.blocked===true);
  ok('a board that never answers is NOT streamed to by guesswork',
     idScenarios.silent.blocked===true);
  ok('MAESTRO-PCA v2 shares its port safely, so it DOES stream',
     idScenarios.coprocV2.blocked===false, 'chip: '+idScenarios.coprocV2.chip);
  ok('  and is recognised the same way when it answers "?"',
     idScenarios.coprocV2Ask.blocked===false);

  /* ================================================================
     v1.76.0 — review of 2026-09-01 (docs/REVIEW-2026-09-01.md). Three of
     v1.69.0's hardware criticals were fixed in the SIM's copy of the seam
     and never in Studio's, and one wizard step had thrown on every click
     since the same release. Each is pinned here, red first.
     ================================================================ */
  console.log('\n════ every wizard step renders (H5) ════');
  /* step 1, "PCA9685s", read PCA_MAX_BOARDS_UI from maestro/boards.js —
     which Studio does not load — and threw ReferenceError, rendering an
     empty card, from v1.69.0 to v1.75.1. This suite stepped 0→2→3→0→3→4 and
     never asked for it. Now every step is asked for. */
  const steps = await page.evaluate(()=>{
    const out = [];
    setupOpen(0);
    for(let i=0;i<SETUP_STEPS.length;i++){
      let err = null;
      try{ setupGo(i); }catch(e){ err = e.message; }
      out.push({i, key:SETUP_STEPS[i].key, len:document.getElementById('setBody').innerHTML.trim().length, err});
    }
    /* and the Boards field on step 1 is live */
    try{ setupGo(1); }catch(e){}
    const b = document.querySelector('#setBody input[data-f=boards]');
    let boards = null, bErr = null;
    if(b){ try{ b.value = '3'; b.dispatchEvent(new Event('input', {bubbles:true})); boards = SETUP.hw.boards; }catch(e){ bErr = e.message; } }
    setupClose();
    return {out, boards, bErr, hasBoardsField: !!b};
  });
  steps.out.forEach(st=> ok('step '+st.i+' ('+st.key+') renders without throwing', st.len > 0 && !st.err, st.err || ('body '+st.len+' chars')));
  ok('the Boards field on the PCA9685s step writes the answer', steps.hasBoardsField && steps.boards === 3 && !steps.bErr,
     steps.bErr || JSON.stringify({boards:steps.boards}));

  console.log('\n════ a whole-sequence brick can be dropped (H5, seqTotal) ════');
  /* blockSeqDur() called seqTotal(), which lives in maestro/playback.js —
     sim only — so clicking a "Sequences — dropped whole" item threw and
     added nothing */
  const seqBrick = await page.evaluate(()=>{
    /* a fresh routine to drop into, beside the two frame-list sequences */
    PROJ.sequences.push({name:'__drop target', frames:[], blocks:[]});
    curSeq = PROJ.sequences.length - 1;
    rebuildAll(); blkBuildLib();
    const seq = blkSeq();
    const it = document.querySelector('#libList .libitem[data-kind=seq]');
    if(!it) return {found:false};
    const before = seq.blocks.length;
    it.click();
    const expect = (PROJ.sequences.find(s=>s.name===it.dataset.ref)||{frames:[]}).frames.reduce((a,f)=>a+f.duration,0);
    const out = {found:true, before, after:seq.blocks.length, dur: seq.blocks.length ? seq.blocks[seq.blocks.length-1].dur : null, ref: it.dataset.ref, expect};
    PROJ.sequences.pop(); curSeq = 0; rebuildAll();
    return out;
  });
  ok('clicking a whole-sequence item adds one brick, sized to that sequence',
     seqBrick.found && seqBrick.after === seqBrick.before + 1 && seqBrick.dur === Math.max(200, seqBrick.expect), JSON.stringify(seqBrick));

  console.log('\n════ a table keystroke does not walk a driven servo to its stop (H3) ════');
  /* rebuildEngine(true) carried target and not aim, so every keystroke in
     the channel table rebuilt an engine that steered every driven servo to
     its home — 0 on a homemode:Off channel, which pins it at c.min */
  const aim = await page.evaluate(()=>{
    const c = PROJ.channels[0]; c.mode='Servo'; c.min=4000; c.max=8000; c.homemode='Off'; c.home=0; c.speed=40; c.acceleration=0;
    HW.rebuild(false);
    let E = HW.engine();
    pcaSetTarget(E, 0, 5000); pcaSetTarget(E, 0, 7000); for(let i=0;i<200;i++) pcaTick(E,10);
    const before = {aim:E.st[0].aim, pos:E.st[0].pos256>>8, known:E.st[0].known};
    buildChannels();
    const nm = document.querySelector('#chTable tr[data-ch="0"] [data-f=name]');
    nm.value = 'Dome pie'; nm.dispatchEvent(new Event('input', {bubbles:true}));   /* one keystroke */
    E = HW.engine();
    const after = {aim:E.st[0].aim, pos:E.st[0].pos256>>8, known:E.st[0].known};
    for(let i=0;i<50;i++) pcaTick(E,10);
    return {before, after, posLater: E.st[0].pos256>>8};
  });
  ok('the engine after a rename keystroke still aims where it did before',
     aim.after.aim === aim.before.aim && aim.after.known === aim.before.known, JSON.stringify(aim));
  ok('…and the servo stays put', aim.posLater === aim.before.pos, 'pos '+aim.before.pos+' → '+aim.posLater);

  console.log('\n════ Finish sends the rate to the board before streaming at it (H2) ════');
  const fin = await page.evaluate(async ()=>{
    const flush = ()=>new Promise(r=>setTimeout(r,0));
    const bytes = [];
    const frames = a=>{ const f=[]; for(let i=0;i+2<a.length;i+=3) f.push({ch:a[i]&0x7F, val:(a[i+1]<<7)|a[i+2]}); return f; };
    SER.kind = 'bridge'; SER.port = {}; SER.blocked = false;
    SER.writer = { write:b=>{ bytes.push(...Array.from(b)); return Promise.resolve(); } };
    HW.setFreq(50); HW.setOsc(25000000);
    serialConfig(); await flush();
    bytes.length = 0;
    setupOpen(0); SETUP.hw.freq = 200;
    setupApply(); await flush(); await flush();
    const f = frames(bytes);
    const cfg = f.findIndex(x=>x.ch===SER.cfgServo);
    const pos = f.findIndex(x=>x.ch < 62 && x.val !== 8191);
    const out = {hwFreq:HW.freq(), cfgVal: cfg>=0 ? f[cfg].val : null, cfgBeforeAnyPosition: cfg>=0 && (pos<0 || cfg<pos)};
    SER.port = null; SER.writer = null; SER.sent = null; SER.kind = '';
    return out;
  });
  ok('the config frame carries the new rate and precedes every position', fin.hwFreq === 200 && fin.cfgVal === 200 && fin.cfgBeforeAnyPosition, JSON.stringify(fin));

  console.log('\n════ the channel table refuses a half-typed endpoint (H4) ════');
  /* oninput wired to the wire: typing 1500 wrote 1, 15 and 150 µs to a real
     servo before it wrote 1500. The bench's 500–2500 band now guards this
     table too, and the boxes say so in their own min/max. */
  const typed = await page.evaluate(()=>{
    const c = PROJ.channels[0]; c.mode='Servo'; c.min=4000; c.max=8000; c.home=0; HW.rebuild(false);
    buildChannels();
    const mx = document.querySelector('#chTable tr[data-ch="0"] [data-f=max]');
    const seen = [];
    for(const v of ['1','15','150','1500']){ mx.value = v; mx.dispatchEvent(new Event('input',{bubbles:true})); seen.push({v, max:c.max, cls:mx.className}); }
    const hm = document.querySelector('#chTable tr[data-ch="0"] [data-f=home]');
    hm.value = '1900'; hm.dispatchEvent(new Event('input',{bubbles:true}));      /* outside the 1000–1500 the ends now allow */
    return {seen, homeRefused: c.home !== 7600, homeCls: hm.className, attrs:[mx.min, mx.max]};
  });
  ok('1, 15 and 150 µs are refused and never written; 1500 lands',
     typed.seen.slice(0,3).every(x=>x.max === 8000 && x.cls === 'bad') && typed.seen[3].max === 6000, JSON.stringify(typed.seen));
  ok('a centre outside its own two ends is refused too', typed.homeRefused && typed.homeCls === 'bad', JSON.stringify(typed));
  ok('the boxes carry the policy\'s own band as their min/max', typed.attrs[0] === '500' && typed.attrs[1] === '2500', typed.attrs.join('–'));

  /* ================================================================
     v1.77.0 — review of 2026-09-01, H13. The project-file door adopted a
     file, SAVED it, and only then handed it to rebuildAll() — so a file
     that threw there was already in localStorage, and every boot after it
     threw the same TypeError with no fallback: an empty page, no log line,
     until somebody cleared the browser's storage by hand. Validate, then
     commit (projNormalise, 30-project.js); and boot parks a blob it cannot
     use under pcastudio.bad and starts from the default project.
     ================================================================ */
  console.log('\n════ a malformed project file cannot brick Studio (H13) ════');
  /* the road a file takes: the hidden input, FileReader, the onload handler.
     The log is cleared first so "it changed" is the signal to wait on. */
  const openProject = async (obj)=>{
    await page.evaluate(()=>log(''));
    await page.setInputFiles('#fProj', {name:'t.pcastudio.json', mimeType:'application/json', buffer: Buffer.from(JSON.stringify(obj))});
    await page.waitForFunction(()=>document.getElementById('log').textContent !== '', null, {timeout:5000}).catch(()=>{});
  };
  /* (a) the file the review measured */
  const before = await page.evaluate(()=>({proj: JSON.stringify(PROJ), saved: localStorage.getItem('pcastudio.v1')}));
  await openProject({channels:{}, sequences:[]});
  const refused = await page.evaluate(b=>{
    const l = document.getElementById('log');
    return {log: l.textContent, cls: l.className,
            projSame: JSON.stringify(PROJ) === b.proj,
            savedSame: localStorage.getItem('pcastudio.v1') === b.saved,
            hasEngine: !!E && Array.isArray(E.st) && E.st.length === PROJ.channels.length};
  }, before);
  ok('a file whose channels are not a list is refused, and PROJ is untouched',
     refused.projSame && refused.hasEngine);
  ok('  and the saved copy is untouched too — nothing is persisted before it is checked', refused.savedSame);
  ok('  and the log says why, in words rather than a TypeError',
     /load failed/.test(refused.log) && /"channels" must be a list/.test(refused.log) && refused.cls === 'err', refused.log);

  /* (b) one bad number does not cost the row: it is repaired to the default
     and SAID, not tidied up in silence */
  await openProject({ver:1, osc:25000000,
    channels:[{name:'Pie', mode:'Servo', min:'abc', max:99999, home:0, homemode:'Off', speed:80, acceleration:10}],
    sequences:[{name:'S', frames:[{name:'F0', duration:400, targets:[6000]}]}]});
  const repaired = await page.evaluate(()=>{
    const c = PROJ.channels[0] || {};
    let saved = null; try{ saved = JSON.parse(localStorage.getItem('pcastudio.v1')).channels[0]; }catch(e){}
    const l = document.getElementById('log');
    return {n: PROJ.channels.length, name: c.name, min: c.min, max: c.max,
            savedMin: saved && saved.min, savedMax: saved && saved.max,
            engineRows: E ? E.st.length : -1, tabs: document.querySelectorAll('#seqTabs .seqtab').length,
            log: l.textContent, cls: l.className};
  });
  const inBand = v => Number.isInteger(v) && v >= 0 && v <= 16383;
  ok('a channel with min "abc" and max 99999 loads with both repaired into the band',
     repaired.n === 1 && repaired.name === 'Pie' && inBand(repaired.min) && inBand(repaired.max) && repaired.min < repaired.max
     && repaired.engineRows === 1 && repaired.tabs === 1,
     repaired.min+'..'+repaired.max+', '+repaired.engineRows+' engine rows, '+repaired.tabs+' tabs');
  ok('  the saved copy holds the repaired numbers, not the file\'s',
     inBand(repaired.savedMin) && repaired.savedMin === repaired.min && repaired.savedMax === repaired.max,
     repaired.savedMin+'..'+repaired.savedMax);
  ok('  and the log says 2 values were repaired, and which',
     /project loaded/.test(repaired.log) && /2 values repaired/.test(repaired.log) && /min "abc"/.test(repaired.log) && /max 99999/.test(repaired.log) && repaired.cls === 'warn',
     repaired.log);

  /* (c) the blob is already in localStorage — the state the review left a
     browser in. Boot must park it and come up, not die. */
  const bootFrom = async (blob, label)=>{
    const errsBefore = errs.length;
    await page.evaluate(b=>{ localStorage.removeItem('pcastudio.bad'); localStorage.setItem('pcastudio.v1', b); }, blob);
    await page.reload();
    await page.waitForFunction(()=>typeof PROJ !== 'undefined' && PROJ !== null, null, {timeout:10000}).catch(()=>{});
    const out = await page.evaluate(()=>{
      const l = document.getElementById('log');
      return {chans: PROJ && Array.isArray(PROJ.channels) ? PROJ.channels.length : -1,
              seqs: PROJ && Array.isArray(PROJ.sequences) ? PROJ.sequences.length : -1,
              hasEngine: typeof E !== 'undefined' && !!E && Array.isArray(E.st),
              tabs: document.querySelectorAll('#seqTabs .seqtab').length,
              rows: document.querySelectorAll('#chTable tr[data-ch]').length,
              bad: localStorage.getItem('pcastudio.bad'),
              log: l.textContent, cls: l.className};
    });
    out.newErrs = errs.slice(errsBefore);
    ok('boot on '+label+' comes up on the default project, no page error',
       out.chans === 4 && out.seqs === 2 && out.hasEngine && out.tabs === 2 && out.rows === 4 && out.newErrs.length === 0,
       out.newErrs.join(' | ') || JSON.stringify({chans:out.chans, seqs:out.seqs, tabs:out.tabs, rows:out.rows}));
    ok('  the blob is parked under pcastudio.bad, byte for byte', out.bad === blob, String(out.bad).slice(0,60));
    ok('  and the log says so', /parked/.test(out.log) && /pcastudio\.bad/.test(out.log) && out.cls === 'err', out.log);
  };
  await bootFrom(JSON.stringify({channels:{}, sequences:[]}), 'the review\'s {channels:{}} blob');
  await bootFrom('{"channels":[nope', 'text that is not even JSON');

  /* the ~80 blocks above used to print the count of page errors and never
     assert it — a throw in any handler after load was invisible (M21) */
  ok('no page errors anywhere in the run', errs.length===0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+(fail?fail+' FAILED':'0 failed'));
  console.log('page errors: '+(errs.length?errs.join(' | '):'none'));
  await browser.close();
  process.exit(fail?1:0);
})();
