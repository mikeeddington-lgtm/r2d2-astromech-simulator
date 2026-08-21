/* MaestroPCA engine (pcaseq.js) + sequences.h generator (pca-gen.js).
   The engine is the JS twin of arduino/MaestroPCA/src/MaestroPCA.cpp —
   these tests are the specification both must satisfy. */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
const fs = require('fs');
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };
const LIVE = fs.readFileSync(path.resolve(__dirname,'fixtures-live-dome.mstr'),'utf8');

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForTimeout(1800);
  const ev = (f,a) => page.evaluate(f,a);

  /* a tiny synthetic rig used by most engine tests: 3 servo channels and
     one Input-mode channel that must never move */
  const RIG = `(function(){
    const ch=[
      {i:0,name:'PP5', mode:'Servo',min:4544,max:7296,home:0,   homemode:'Off', speed:80,acceleration:0},
      {i:1,name:'P2',  mode:'Servo',min:4032,max:7616,home:6000,homemode:'Goto',speed:80,acceleration:10},
      {i:2,name:'Fast',mode:'Servo',min:3968,max:8000,home:0,   homemode:'Off', speed:0, acceleration:0},
      {i:3,name:'Btn', mode:'Input',min:0,   max:1024,home:0,   homemode:'Off', speed:0, acceleration:0}
    ];
    const seqs=[
      {name:'Open Up', frames:[
        {name:'F0',duration:400,targets:[7296,7616,8000,0]},
        {name:'F1',duration:300,targets:[0,4032,0,0]},
        {name:'F2',duration:250,targets:[4544,0,3968,0]}
      ]},
      {name:'All home', frames:[{name:'F0',duration:200,targets:[4544,6000,3968,0]}]}
    ];
    return pcaCreate(ch, seqs);
  })()`;

  console.log('\n════ kinematics: the Maestro speed law ════');
  const speedLaw = await ev(RIG=>{
    const E = eval(RIG);
    /* ch0 homemode Off: first target snaps (real Maestro behaviour) */
    pcaSetTarget(E,0,4544);
    const snap = pcaPos(E,0);
    /* now a full 2752-count throw at speed 80 must take ceil(2752/80)=35 ticks */
    pcaSetTarget(E,0,7296);
    let ticks=0;
    while(pcaPos(E,0)!==7296 && ticks<1000){ pcaTick(E,10); ticks++; }
    return {snap, ticks, end:pcaPos(E,0)};
  }, RIG);
  ok('first target after Off snaps with no ramp', speedLaw.snap===4544, 'pos '+speedLaw.snap);
  ok('2752 counts at speed 80 = 35 ticks (350 ms), the bench rule of thumb', speedLaw.ticks===35, speedLaw.ticks+' ticks');
  ok('lands exactly on target', speedLaw.end===7296);

  console.log('\n════ kinematics: acceleration ════');
  const accel = await ev(RIG=>{
    const E = eval(RIG);
    /* ch1 homemode Goto: starts active at 6000, speed 80 accel 10 */
    const trace=[]; let over=false, last=6000;
    pcaSetTarget(E,1,7616);
    for(let t=0;t<300;t++){
      pcaTick(E,10);
      const p=pcaPos(E,1);
      if(p>7616) over=true;
      trace.push(p-last); last=p;
      if(p===7616) break;
    }
    const ramp = trace.length>3 && trace[0]<trace[3];   // slow start = accel ramp
    /* same throw with accel 0 for comparison */
    const E2 = eval(RIG);
    pcaSetAccel(E2,1,0);
    pcaSetTarget(E2,1,7616);
    let t2=0; while(pcaPos(E2,1)!==7616 && t2<1000){ pcaTick(E2,10); t2++; }
    return {home:6000, over, ramp, ticks:trace.length, ticksNoAccel:t2, end:last};
  }, RIG);
  ok('never overshoots the target', !accel.over);
  ok('ramps up from rest (accel limits early ticks)', accel.ramp);
  ok('accelerated move takes longer than speed-only move', accel.ticks>accel.ticksNoAccel,
     accel.ticks+' vs '+accel.ticksNoAccel+' ticks');
  ok('still lands exactly on target', accel.end===7616);

  console.log('\n════ kinematics: limits and off ════');
  const lims = await ev(RIG=>{
    const E = eval(RIG);
    pcaSetTarget(E,2,9999);                    // above max → clamp to 8000
    pcaTick(E,10);
    const clampedHi = pcaPos(E,2);
    pcaSetTarget(E,2,100);                     // below min → clamp to 3968
    pcaTick(E,10);
    const clampedLo = pcaPos(E,2);
    pcaSetTarget(E,2,0);                       // 0 = servo off
    const off = pcaPos(E,2);
    pcaSetTarget(E,3,6000);                    // Input channel must not move
    pcaTick(E,10);
    return {clampedHi, clampedLo, off, input:pcaPos(E,3), moving:pcaMoving(E)};
  }, RIG);
  ok('targets clamp into the calibrated endpoints', lims.clampedHi===8000 && lims.clampedLo===3968,
     lims.clampedHi+'/'+lims.clampedLo);
  ok('setTarget(ch,0) = pulses off, position reads 0', lims.off===0);
  ok('an Input-mode channel never moves', lims.input===0);

  /* Regression, 2026-08-10: only the TARGET used to be clamped, so a
     reversal with residual velocity could integrate the POSITION a little
     outside [min,max]. The C++ twin has the same test. */
  const rev = await ev(RIG=>{
    const E = eval(RIG);
    let lo = 99999, hi = 0;
    for(let round = 0; round < 24; round++){
      const t = (round & 1) ? 4032 : 7616;
      pcaSetTarget(E, 1, t);
      const dwell = 120 + (round % 12) * 130;
      for(let i = 0; i < dwell; i += 10){
        pcaTick(E, 10);
        const q = pcaPos(E, 1);
        if(q < lo) lo = q;
        if(q > hi) hi = q;
      }
    }
    return {lo, hi};
  }, RIG);
  ok('the position never leaves the endpoints across 24 reversals',
     rev.lo >= 4032 && rev.hi <= 7616, rev.lo+'..'+rev.hi);

  console.log('\n════ sequence player mirrors seqStepPlayback ════');
  const seq = await ev(RIG=>{
    const E = eval(RIG);
    pcaRestart(E,0);
    /* step in awkward 16 ms chunks — boundaries must still land right */
    for(let t=0;t<1200;t+=16) pcaTick(E,16);
    const log = E.frameLog.map(f=>({t:f.t,fr:f.frame}));
    const done = E.seq===-1;
    /* ch0 was written by F0 (7296) then F2 (4544); F1 left it alone (0) */
    const ch0 = E.st[0].target, ch1 = E.st[1].target;
    return {log, done, ch0, ch1};
  }, RIG);
  ok('frame 0 applies immediately on restart', seq.log[0] && seq.log[0].fr===0 && seq.log[0].t<=16, JSON.stringify(seq.log[0]));
  ok('frame 1 lands on the 400 ms boundary (±one step)', seq.log[1] && Math.abs(seq.log[1].t-400)<=16, 't='+(seq.log[1]&&seq.log[1].t));
  /* stepping in 16 ms chunks quantises each boundary up to the next step,
     and the carry accumulates one step per frame — ±2 steps for frame 2 */
  ok('frame 2 lands on the 700 ms boundary (±two steps)', seq.log[2] && Math.abs(seq.log[2].t-700)<=32, 't='+(seq.log[2]&&seq.log[2].t));
  ok('sequence ends and the slot clears', seq.done);
  ok('a 0 target leaves the channel alone (F1 skipped ch0)', seq.ch0===4544 && seq.ch1===4032,
     seq.ch0+'/'+seq.ch1);

  const oneAtATime = await ev(RIG=>{
    const E = eval(RIG);
    pcaRestart(E,0);
    pcaTick(E,50);
    pcaRestart(E,1);          // a real Maestro runs ONE script — replace
    pcaTick(E,50);
    const switched = E.frameLog.some(f=>f.seq===1);
    const stillOld = E.seq===0;
    for(let t=0;t<400;t+=16) pcaTick(E,16);
    return {switched, stillOld, done:E.seq===-1};
  }, RIG);
  ok('restartScript replaces the running sequence (one script at a time)',
     oneAtATime.switched && !oneAtATime.stillOld && oneAtATime.done);

  console.log('\n════ the live dome file end-to-end ════');
  const live = await ev(text=>{
    const P = mstrParse(text, 'fixtures-live-dome.mstr');
    const scriptSubs = P.subs.filter(s=>s.kind==='sequence' && s.seqIndex>=0);
    const seqs = scriptSubs.length ? scriptSubs.map(s=>P.sequences[s.seqIndex]) : P.sequences;
    const E = pcaCreate(P.channels, seqs);
    pcaRestart(E,0);
    const total = seqs[0].frames.reduce((a,f)=>a+f.duration,0);
    for(let t=0;t<total+4000;t+=20) pcaTick(E,20);
    /* every channel the last frame drives must end exactly on its target */
    const lastFrame = seqs[0].frames[seqs[0].frames.length-1];
    let missed = -1;
    P.channels.forEach((c,i)=>{
      if(missed>=0) return;
      const want = lastFrame.targets[i];
      if(!want || !/^servo/i.test(c.mode)) return;
      const lo=Math.min(c.min,c.max), hi=Math.max(c.min,c.max);
      const clamped = Math.min(hi, Math.max(lo, want));
      if(pcaPos(E,i)!==clamped) missed = i;
    });
    return {chans:P.channels.length, slots:seqs.length, done:E.seq===-1, missed, writes:E.writes};
  }, LIVE);
  ok('parses to the full channel set', live.chans>=18, live.chans+' channels');
  ok('slot 0 plays to completion', live.done);
  ok('every driven channel lands exactly on its final-frame target', live.missed===-1, 'missed ch '+live.missed);
  ok('I2C writes are finite and bounded (change-only writes)', live.writes>0 && live.writes<20000, live.writes+' writes');

  console.log('\n════ concurrent tracks and looping ════');
  const conc = await ev(()=>{
    /* ch0 is the slow sweeper (speed 20 => 2 s end to end); ch1-3 are
       panels that snap, so the two kinds of motion are distinguishable */
    const ch=[0,1,2,3].map(i=>({i,name:'c'+i,mode:'Servo',min:4000,max:8000,home:6000,
      homemode:'Goto',neutral:6000,range:1905,speed:(i===0?20:0),acceleration:0,act:'',invert:false}));
    const f=(d,t)=>({name:'f',duration:d,targets:t});
    const seqs=[
      {name:'Holo sweep', loop:true, frames:[f(600,[8000,0,0,0]), f(600,[4000,0,0,0])]},  // ch0
      {name:'Panels',                frames:[f(200,[0,8000,8000,0]), f(200,[0,4000,4000,0])]}, // ch1-2
      {name:'Holo home',             frames:[f(200,[6000,0,0,0])]}                        // ch0 — clashes
    ];
    const E=pcaCreate(ch,seqs);
    const step=ms=>{ for(let i=0;i<ms;i+=10) pcaTick(E,10); };
    const mask0=pcaSeqMask(E,0), mask1=pcaSeqMask(E,1);
    pcaRestart(E,0); step(4000);
    const stillLooping=pcaSeqRunning(E,0), stillMoving=pcaMoving(E)===1;
    const posBefore=pcaPos(E,0);
    pcaRestart(E,1);
    const both=pcaRunningCount(E)===2 && pcaSeqRunning(E,0);
    step(100);
    const panelsMoved=pcaPos(E,1)===8000||pcaPos(E,2)===8000;
    const sweepKeptGoing=pcaPos(E,0)!==posBefore;
    step(600);
    const panelsDone=!pcaSeqRunning(E,1), sweepAlive=pcaSeqRunning(E,0);
    pcaRestart(E,2);
    const displaced=!pcaSeqRunning(E,0)&&pcaSeqRunning(E,2);
    pcaRestart(E,0); pcaRestart(E,1);
    const twoAgain=pcaRunningCount(E)===2;
    pcaStop(E);
    const allStopped=!pcaRunning(E) && E.seq===-1;
    return {mask0,mask1,stillLooping,stillMoving,both,panelsMoved,sweepKeptGoing,
            panelsDone,sweepAlive,displaced,twoAgain,allStopped};
  });
  ok('channel masks are disjoint for disjoint sequences', (conc.mask0 & conc.mask1)===0,
     conc.mask0.toString(2)+' / '+conc.mask1.toString(2));
  ok('a loop:true sequence runs past its last frame', conc.stillLooping);
  ok('and is still driving servos after 4 s', conc.stillMoving);
  ok('a sequence on other channels starts alongside it', conc.both);
  ok('the panels move', conc.panelsMoved);
  ok('the sweep keeps going through it', conc.sweepKeptGoing);
  ok('the panel sequence ends on its own', conc.panelsDone);
  ok('the looping sweep is untouched by that', conc.sweepAlive);
  ok('a sequence claiming its channel DISPLACES it', conc.displaced);
  ok('two can run again', conc.twoAgain);
  ok('pcaStop clears every track, and E.seq reads -1', conc.allStopped);

  console.log('\n════ beyond the Maestro ════');
  const beyond = await ev(()=>{
    const mk=o=>Object.assign({i:0,name:'c',mode:'Servo',min:4000,max:8000,home:6000,
      homemode:'Goto',neutral:6000,range:1905,speed:40,acceleration:0,releaseMs:0,ease:'none',
      act:'',invert:false}, o);
    const ch=[mk({i:0,releaseMs:500}), mk({i:1}), mk({i:2,acceleration:10,ease:'overshoot'})];
    const seqs=[
      {name:'idle', gen:'osc', background:true, entries:[{ch:1,lo:4000,hi:8000,period:2000,phase:0}]},
      {name:'grab', frames:[{name:'f',duration:400,targets:[0,7000,0]}]},
      {name:'life', gen:'wander', entries:[{ch:1,lo:4000,hi:8000,period:300,phase:0}]}
    ];
    const E=pcaCreate(ch,seqs);
    const step=ms=>{ for(let i=0;i<ms;i+=10) pcaTick(E,10); };

    pcaSetTarget(E,0,8000); pcaSetTarget(E,1,8000);
    step(2000);
    const released=pcaReleased(E,0), pos0=pcaPos(E,0), held=!pcaReleased(E,1)&&pcaPos(E,1)===8000;
    pcaSetTarget(E,0,4000);
    const resumeFrom=pcaPos(E,0);
    step(1200);
    const arrived=pcaPos(E,0)===4000;
    pcaSetTarget(E,0,0); pcaSetTarget(E,0,7000);
    const snapAfterOff=pcaPos(E,0)===7000;

    pcaRestart(E,0);
    let lo=65535,hi=0;
    for(let i=0;i<6000;i+=10){ pcaTick(E,10); const p=pcaPos(E,1); if(p<lo)lo=p; if(p>hi)hi=p; }
    const swept=lo===4000&&hi===8000, neverEnds=pcaSeqRunning(E,0);

    pcaRestart(E,1);
    const displaced=!pcaSeqRunning(E,0)&&pcaSeqRunning(E,1);
    step(600);
    const cameBack=!pcaSeqRunning(E,1)&&pcaSeqRunning(E,0);
    pcaStop(E); step(600);
    const stopMeansStop=!pcaRunning(E);

    pcaRestart(E,2);
    let wlo=65535,whi=0,changes=0,last=0;
    for(let i=0;i<6000;i+=10){ pcaTick(E,10); const p=pcaPos(E,1);
      if(p<wlo)wlo=p; if(p>whi)whi=p; if(last&&p!==last)changes++; last=p; }

    const E2=pcaCreate(ch,seqs);
    pcaSetTarget(E2,2,7000);
    let peak=0;
    for(let i=0;i<4000;i+=10){ pcaTick(E2,10); const p=pcaPos(E2,2); if(p>peak)peak=p; }
    return {released,pos0,held,resumeFrom,arrived,snapAfterOff,swept,neverEnds,
            displaced,cameBack,stopMeansStop,wIn:wlo>=4000&&whi<=8000,
            wRange:whi-wlo,changes,peak,settledOn:pcaPos(E2,2)};
  });
  ok('releaseMs: the channel goes quiet once settled', beyond.released && beyond.pos0===0);
  ok('a channel without it keeps holding', beyond.held);
  ok('re-driving a released channel eases from memory, not a snap', beyond.resumeFrom>7000,
     'pos '+beyond.resumeFrom);
  ok('  and reaches the new target', beyond.arrived);
  ok('after an explicit off it snaps again (position unknown)', beyond.snapAfterOff);
  ok('an oscillator sweeps the full range', beyond.swept);
  ok('  and never ends on its own', beyond.neverEnds);
  ok('a foreground sequence displaces a background one', beyond.displaced);
  ok('THE BACKGROUND ONE RESUMES BY ITSELF', beyond.cameBack);
  ok('but an explicit stopScript really stops it', beyond.stopMeansStop);
  ok('wander stays inside its range', beyond.wIn);
  ok('wander explores it and keeps moving', beyond.wRange>1000 && beyond.changes>100,
     'spread '+beyond.wRange+', '+beyond.changes+' changes');
  ok('overshoot goes past the target', beyond.peak>7000, 'peak '+beyond.peak);
  ok('  and settles back exactly on it', beyond.settledOn===7000);

  console.log('\n════ sequences.h generator ════');
  const gen = await ev(RIG=>{
    const E = eval(RIG);
    return pcaGenHeader(E.channels, E.sequences, {source:'synthetic'});
  }, RIG);
  ok('declares channel and sequence counts', /#define MPCA_CHANNELS {2}4\n#define MPCA_SEQUENCES 2/.test(gen));
  ok('servo rows carry endpoints verbatim', /4544, {2}7296/.test(gen) && /4032, {2}7616/.test(gen));
  ok('homemode Off encodes home 0; Goto keeps its pose',
     gen.indexOf('{  0,   0,  4544,  7296,     0,   80,    0,       0, MPCA_EASE_NONE      },')>=0 &&
     gen.indexOf('{  0,   1,  4032,  7616,  6000,   80,   10,       0, MPCA_EASE_NONE      },')>=0);
  ok('an Input channel gets pin 255 and zeroed row',
     gen.indexOf('{  0, 255,     0,     0,     0,    0,    0,       0, MPCA_EASE_NONE      },')>=0);
  ok('frame rows are duration + all targets', / {2}400, 7296, 7616, 8000, 0,/.test(gen));
  ok('slot defines are sanitised names in slot order',
     gen.indexOf('#define MPCA_SLOT_OPEN_UP 0')>=0 && gen.indexOf('#define MPCA_SLOT_ALL_HOME 1')>=0);
  const genLoop = await ev(()=>pcaGenHeader(
    [{i:0,name:'a',mode:'Servo',min:4000,max:8000,home:0,homemode:'Off',speed:0,acceleration:0}],
    [{name:'Idle',loop:true,frames:[{name:'f',duration:100,targets:[6000]}]},
     {name:'Once',frames:[{name:'f',duration:100,targets:[6000]}]}], {source:'t'}));
  ok('a looping sequence carries MPCA_SEQ_LOOP into the header',
     genLoop.indexOf('{ MPCA_SEQ0, 1, MPCA_SEQ_LOOP },')>=0);
  ok('a one-shot sequence carries 0', genLoop.indexOf('{ MPCA_SEQ1, 1, 0 },')>=0);
  const genNew = await ev(()=>pcaGenHeader(
    [{i:0,name:'Panel',mode:'Servo',min:4000,max:8000,home:0,homemode:'Off',speed:80,
      acceleration:10,releaseMs:1200,ease:'overshoot'}],
    [{name:'HP idle',gen:'osc',background:true,entries:[{ch:0,lo:4000,hi:8000,period:3000,phase:90}]}],
    {source:'t'}));
  ok('the channel row carries releaseMs and the ease constant',
     /1200, MPCA_EASE_OVERSHOOT/.test(genNew));
  ok('a generator sequence emits ch/lo/hi/period/phase, not frames',
     /0,  4000,  8000,   3000,   90/.test(genNew));
  ok('and its flags say background + oscillator',
     genNew.indexOf('MPCA_SEQ_BACKGROUND | MPCA_SEQ_OSC')>=0);

  const genLive = await ev(text=>{
    const P = mstrParse(text, 'fixtures-live-dome.mstr');
    const h = pcaGenFromParsed(P);
    const c0 = P.channels[0];
    return {h: h.slice(0, 4000), count:P.channels.length,
            hasC0: h.indexOf(String(c0.min))>=0 && h.indexOf(String(c0.max))>=0,
            /* v1.63.0 — the board list no longer names an I2C address. The
               sketches FIND their boards (v1.53.0), so a header that said
               "board 1 -> 0x41" was naming an address the boot scan may
               never use, and somebody wires to the comment. */
            boards: (h.match(/board \d -> channels/g)||[]).length,
            saysScanned: /ASCENDING I2C ADDRESS/.test(h),
            namesNoAddr: !/board \d -> I2C address/.test(h),
            seqCount: (h.match(/MPCA_SEQ\d+\[\]/g)||[]).length};
  }, LIVE);
  ok('live file: channel count carried through', genLive.h.indexOf('#define MPCA_CHANNELS  '+genLive.count)>=0);
  ok('live file: ch0 endpoints appear verbatim', genLive.hasC0);
  ok('live file: an 18-channel table spans two PCA9685 boards', genLive.boards===2, genLive.boards+' boards');
  ok('live file: and the header says the addresses come from the boot scan, not 0x40+n',
     genLive.saysScanned && genLive.namesNoAddr, JSON.stringify({s:genLive.saysScanned, n:genLive.namesNoAddr}));
  ok('live file: every script sequence became a PROGMEM table', genLive.seqCount>0, genLive.seqCount+' sequences');

  const ticks = await ev(()=>[pcaQusToTicks(6000), pcaQusToTicks(4000), pcaQusToTicks(8000)]);
  ok('quarter-µs → 12-bit ticks at 50 Hz (1500 µs = 307)', ticks[0]===307 && ticks[1]===205 && ticks[2]===410,
     ticks.join('/'));

  console.log('\n════ the Maestro tab button ════');
  const ui = await ev(()=>{
    loadProfile('maestro25'); buildFwSelector();
    makeStarter('dome'); CFG.maestroSource='imported';
    rebuildMaestroUI();
    const b = $('btnExpPca');
    if(!b) return {found:false};
    const text = exportPcaHeader();
    return {found:true, enabled:!b.disabled,
            hasTable: text.indexOf('MPCA_SEQ_TABLE')>=0,
            slots: loadoutSeqs().length,
            declared: (text.match(/MPCA_SEQ\d+\[\]/g)||[]).length};
  });
  ok('Export PCA9685 header button exists and is enabled with a config loaded', ui.found && ui.enabled);
  ok('button emits a header whose slots match the loadout', ui.hasTable && ui.declared===ui.slots,
     ui.declared+' of '+ui.slots);

  /* =================================================================
     v1.45.0 — Mike: "…then exporting to either format." Conversion is
     lossy in both directions and the losses are not symmetrical. Every
     dropped field is named to the user; this pins the list.
     ================================================================= */
  console.log('\n════ v1.45.0 — Maestro → PCA9685 names what it cannot carry ════');
  const drops = await ev(()=>{
    loadProfile('maestro25'); setBoard('mini24'); makeStarter('dome','mini24'); reindexSubs();
    if(typeof pcaExportDrops !== 'function') return {missing:true};
    /* a per-frame speed row and a non-servo channel, both of which a PCA
       header has nowhere to put */
    MSTR.channels[MSTR.channels.length-1].mode = 'Input';
    const seqs = loadoutSeqs();
    seqs[0].frames[0].speeds = MSTR.channels.map(()=>10);
    const d = pcaExportDrops(MSTR.channels, seqs);
    delete seqs[0].frames[0].speeds;
    return {fields:d.map(x=>x.field), reasons:d.every(x=>!!x.why),
            counted:d.every(x=>x.n === undefined || typeof x.n === 'number'),
            note:(typeof pcaExportDropNote==='function') ? pcaExportDropNote(d) : ''};
  });
  ok('the Maestro-only fields are named, not silently discarded',
     !drops.missing && ['homemode','neutral','range','mode','invert','frame speed/acceleration']
       .every(f=>(drops.fields||[]).indexOf(f)>=0), (drops.fields||[]).join(', '));
  ok('...each with a reason a builder can act on', !!drops.reasons && !!drops.counted);
  ok('...and one sentence that lists them by name for the user',
     /homemode/.test(drops.note||'') && /neutral/.test(drops.note||''), (drops.note||'').slice(0,120));

  console.log('\n════ v1.45.0 — quarter-µs stays quarter-µs across the conversion ════');
  const units = await ev(()=>{
    if(typeof pcaHeaderParse !== 'function') return {missing:true};
    const h = pcaGenFromLoadout();
    const P = pcaHeaderParse(h, 'u.h');
    const c0 = MSTR.channels.find(c=>/^servo/i.test(c.mode));
    const g0 = P.channels[c0.i];
    return {same: g0.min===c0.min && g0.max===c0.max,
            declaredQus: /QUARTER-MICROSECONDS/.test(h),
            mine:[c0.min,c0.max], got:[g0.min,g0.max]};
  });
  ok('endpoints cross unchanged — both formats already speak quarter-µs',
     !units.missing && units.same && units.declaredQus,
     JSON.stringify(units.mine)+' → '+JSON.stringify(units.got));
  /* ================================================================
     THE GENERATED HEADERS INCLUDE THEIR LIBRARY IN QUOTES (v1.66.4)

     An <angled> include is only ever found on the LIBRARY path. A sketch
     folder that carries its own copy of MaestroPCA — which is how
     examples/MaestroReplacement now ships — cannot compile a generated
     header that uses one: the IDE answers "MaestroPCA.h: No such file or
     directory" with the file sitting two lines away in the same folder.
     Quoted searches the including file's own directory first and the
     library path afterwards, so it works BOTH ways.

     Mike's compiler found this twice in one evening: first in the .ino,
     then again in sequences.h, because that file writes its own include
     line and nobody had ever read it. Asserted on the STRING the writer
     emits, which is the only place the mistake can live. */
  console.log('\n════ the generated header includes its library in quotes ════');
  const inc = await ev(()=>{
    makeStarter('dome');
    const h = pcaGenHeader(MSTR.channels, MSTR.sequences.slice(0,1), {source:'t'});
    const line = (h.match(/^#include.*MaestroPCA\.h.*$/m)||['(none)'])[0];
    return { line, angled: /#include\s*<MaestroPCA\.h>/.test(h) };
  });
  ok('sequences.h includes "MaestroPCA.h", not <MaestroPCA.h>',
     inc.line === '#include "MaestroPCA.h"' && !inc.angled, JSON.stringify(inc));


  console.log('\n'+pass+' passed, '+(fail?fail+' FAILED':'0 failed'));
  console.log('page errors: '+(errs.length?errs.join(' | '):'none'));
  await browser.close();
  process.exit(fail?1:0);
})();
