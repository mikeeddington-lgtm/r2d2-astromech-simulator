/* THE SERVO GAUGES — one gauge per channel, ON THE STAGE (v1.60.0).

   Mike, with the stage circled in orange: "The servo grid should be where
   ive marked and replace the r2 completly — we need to treat it as another
   modle like we did for the polar mouse, only we dont need the stage area,
   just a simple screen representing the servos — also the 180 / 360 gauges
   should be selectable for each servo."

   Third shape for this feature and the assertions moved with it: v1.57.0's
   3D rack, v1.59.0's workspace, and now a MODEL. What is pinned here is what
   makes it a model — PREFS.model drives it, it covers #stage, it appears in
   BOTH stages for free, and the way back is the chip.

   FOUR OF THESE ARE REGRESSION GUARDS for things that break something other
   than this view:
     · three.js writes `display:block` INLINE on its canvas (setSize), which
       beats any plain author rule however specific. Without !important the
       3D scene sits under the gauges, rendering every frame.
     · sim only is a public DRIVING mode, and #stageTools is hidden in it —
       a laptop handed over on the gauges would show a wall of instruments
       with no way back to the droid.
     · v1.57.0's rkS actuators are gone. A channel still wired to one LOOKS
       wired — actPartLabel() has nothing to return, so the cell goes blank
       while c.act stays truthy — and every "is this wired" test says yes.
     · CHPOS is the only reason a channel wired to NOTHING has a position at
       all. Without it this whole view is dead for an unmapped board. */
const { launchBrowser } = require('./harness');
const path = require('path');
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };
const near=(a,b,t)=>Math.abs(a-b)<=t;

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog', async d=>await d.accept());
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof MOUSE!=="undefined" && MOUSE.loaded', {timeout:60000});
  const ev = f => page.evaluate(f);
  await ev(()=>{ if(typeof closeStartup==='function') closeStartup(); });

  console.log('\n════ it is a MODEL, on the stage ════');
  ok('five models again, the gauges last', await ev(()=>
    MODEL_IDS.join()==='droid,frik,mouse,builder,servos'));
  ok('…and FOUR workspaces — v1.59.0’s fifth button is gone', await ev(()=>
    WORKSPACES.map(w=>w.id).join()==='drive,seq,config,bench'
    && document.querySelectorAll('#viewsel .wsbtn').length===4));
  ok('nothing is left of the 3D rack module', await ev(()=>
    typeof RK === 'undefined' && typeof rkActKey === 'undefined'
    && typeof applyServoRack === 'undefined'));
  ok('cycling the models reaches it and comes home', await ev(()=>{
    modelSet('droid', {frame:false});
    const seen=[modelGet()];
    for(let i=0;i<5;i++){ modelCycle(); seen.push(modelGet()); }
    modelSet('droid', {frame:false});
    return seen.join()==='droid,frik,mouse,builder,servos,droid';
  }));

  const stage = await ev(()=>{
    modelSet('droid', {frame:false});
    const before = {screen:getComputedStyle($('svScreen')).display,
                    canvas:getComputedStyle(document.querySelector('#stage canvas')).display};
    modelSet('servos', {frame:false});
    const c = document.querySelector('#stage canvas');
    return {before, cls: document.body.classList.contains('model-servos'),
            screen: getComputedStyle($('svScreen')).display,
            inStage: $('svScreen').closest('#stage') === $('stage'),
            canvas: getComputedStyle(c).display,
            /* three.js writes display:block INLINE — this is the guard */
            inlineSaysBlock: /display:\s*block/.test(c.getAttribute('style')||''),
            chip: getComputedStyle($('btnModel')).display,
            follow: getComputedStyle($('btnFollow')).display,
            hud: getComputedStyle($('hudTL')).display,
            chipSays: $('btnModel').textContent};
  });
  ok('selecting it covers the stage with a flat screen',
     stage.before.screen==='none' && stage.screen==='flex' && stage.cls && stage.inStage, JSON.stringify(stage));
  ok('…the 3D canvas is hidden, inline display:block and all',
     stage.before.canvas!=='none' && stage.canvas==='none' && stage.inlineSaysBlock);
  ok('…the HUD and the camera buttons go with it', stage.hud==='none' && stage.follow==='none');
  ok('…and the model chip stays, because it is the way back',
     stage.chip!=='none' && /servo/i.test(stage.chipSays), stage.chipSays);
  ok('the renderer is skipped while it is up', await ev(()=>{
    /* main.js: `if(SIM.draw && !SV.shown)` — SV.shown is the whole condition */
    modelSet('servos', {frame:false});
    return SV.shown === true && (typeof SIM === 'undefined' || true);
  }));

  console.log('\n════ the grid follows the board ════');
  const counts = await ev(()=>{
    const out = {};
    modelSet('servos', {frame:false});
    [['micro6',6],['mini12',12],['mini24',24],['pca128',128]].forEach(([id])=>{
      setBoard(id); makeStarter('rack', id);
      buildServos();
      out[id] = {tiles: document.querySelectorAll('#svGrid .svtile').length,
                 chans: MSTR.channels.length};
    });
    return out;
  });
  ok('a Micro 6 draws six tiles', counts.micro6.tiles===6, JSON.stringify(counts.micro6));
  ok('a Mini 24 draws twenty-four', counts.mini24.tiles===24);
  ok('eight PCA9685s draw all 128', counts.pca128.tiles===128, counts.pca128.tiles+'');
  ok('…one tile per channel, always — a tile IS a channel', await ev(()=>{
    const tiles = [...document.querySelectorAll('#svGrid .svtile')];
    return tiles.length === MSTR.channels.length
        && tiles.every((t,i)=>+t.dataset.ch === MSTR.channels[i].i);
  }));

  console.log('\n════ both shapes, PER SERVO, and they agree ════');
  const shapes = await ev(()=>{
    setBoard('mini24'); makeStarter('rack','mini24');
    modelSet('droid',{frame:false}); modelSet('servos',{frame:false});
    svSetShape('gauge');
    const angleOf = ch=>{
      const n = document.querySelector('#svGrid .svtile[data-ch="'+ch+'"] .svneedle');
      const m = /rotate\(([-\d.]+)/.exec(n.getAttribute('transform')||'');
      return m ? +m[1] : null;
    };
    const at = (ch,v)=>{ const c=MSTR.channels[ch]; chanPosSet(c.i,v); CHPOS[c.i]=v; svTick(); return angleOf(ch); };
    const g = {lo:at(0,0), mid:at(0,0.5), hi:at(0,1),
               cls: document.querySelector('#svGrid .svtile[data-ch="0"] .svface').classList.contains('gauge')};

    /* ONE servo to a dial — Mike: "selectable for each servo" */
    svSetShapeOf(0, 'dial');
    const d = {lo:at(0,0), mid:at(0,0.5), hi:at(0,1),
               cls: document.querySelector('#svGrid .svtile[data-ch="0"] .svface').classList.contains('dial'),
               neighbour: document.querySelector('#svGrid .svtile[data-ch="1"] .svface').classList.contains('gauge'),
               per: JSON.stringify(SV.per)};

    /* both faces are the SAME BOX, or a mixed grid goes ragged */
    const box = ch=>document.querySelector('#svGrid .svtile[data-ch="'+ch+'"] .svface').getAttribute('viewBox');
    d.sameBox = box(0) === box(1);

    /* clicking the same one again puts it back on the board default */
    svSetShapeOf(0, '');
    d.cleared = !SV.per[0] && document.querySelector('#svGrid .svtile[data-ch="0"] .svface').classList.contains('gauge');

    /* the head's All buttons set the default AND clear every override */
    svSetShapeOf(3,'dial'); svSetShapeOf(7,'dial');
    const mixed = Object.keys(SV.per).length;
    const litWhileMixed = $('btnSvShape_gauge').classList.contains('act');
    svSetShape('dial');
    const all = {mixed, litWhileMixed, cleared: Object.keys(SV.per).length===0,
                 every: [...document.querySelectorAll('#svGrid .svface')].every(f=>f.classList.contains('dial')),
                 lit: $('btnSvShape_dial').classList.contains('act')};
    svSetShape('gauge');
    return {g, d, all, pref: PREFS.svShape};
  });
  ok('the 180° gauge sweeps exactly 180°, centred at the top',
     shapes.g.cls && shapes.g.lo===-90 && shapes.g.mid===0 && shapes.g.hi===90, JSON.stringify(shapes.g));
  ok('one servo can be a 360° dial while its neighbour stays a gauge',
     shapes.d.cls && shapes.d.neighbour && shapes.d.per==='{"0":"dial"}', JSON.stringify(shapes.d));
  ok('…the dial is a wider bezel with the same centre',
     shapes.d.lo===-150 && shapes.d.mid===0 && shapes.d.hi===150);
  ok('…so both shapes agree about where 0.5 is', shapes.g.mid === shapes.d.mid);
  ok('…and both draw into the SAME box, so a mixed grid stays square', shapes.d.sameBox);
  ok('setting the same shape again puts that servo back on the default', shapes.d.cleared);
  ok('"All 360°" sets every servo and clears the ones set by hand',
     shapes.all.mixed===2 && shapes.all.cleared && shapes.all.every, JSON.stringify(shapes.all));
  ok('…and it is only lit when every tile really is wearing it',
     !shapes.all.litWhileMixed && shapes.all.lit);

  console.log('\n════ CHPOS — a channel wired to NOTHING still has a position ════');
  /* the whole view rests on this. A generated servo layout deliberately wires
     no parts at all, so if an unmapped channel had no reading the grid would
     be 24 needles that never move. */
  const chpos = await ev(()=>{
    setBoard('mini24'); makeStarter('rack','mini24'); modelSet('droid',{frame:false}); modelSet('servos',{frame:false});
    const got = {anyAct: MSTR.channels.some(c=>c.act)};
    const c = MSTR.channels[3];
    got.restedCentre = near2(chanPosNorm(c), 0.5);
    function near2(a,b){ return Math.abs(a-b) < 0.02; }
    /* drive it the way a sequence does, then run the easing loop */
    const q = MSTR.sequences.find(s=>/sweep/i.test(s.name));
    seqStart('doc', q.frames, q.name);
    for(let i=0;i<40;i++){ maestroStep(0.05); syncActuators(0.05); }
    got.moved = Math.abs(chanPosNorm(c) - 0.5) > 0.05;
    got.tickMoved = (()=>{ svTick();
      const n = document.querySelector('#svGrid .svtile[data-ch="3"] .svneedle');
      return /rotate/.test(n.getAttribute('transform')||''); })();
    delete MAESTRO.slot.doc;
    /* …and a MAPPED channel reads its actuator instead, because that is where
       the sketch and the pad put it */
    HW.setPart(3, 'oth1');
    ACT['oth1'] = 0.8;
    got.mappedReadsAct = near2(chanPosNorm(MSTR.channels[3]), 0.8);
    HW.setPart(3, '');
    return got;
  });
  ok('a generated servo layout wires no parts at all', !chpos.anyAct);
  ok('…every channel still rests centred', chpos.restedCentre, JSON.stringify(chpos));
  ok('…a sequence moves one that drives nothing', chpos.moved);
  ok('…and the needle follows it', chpos.tickMoved);
  ok('a channel that DOES drive a part reads its actuator', chpos.mappedReadsAct);

  console.log('\n════ click a gauge — the panel card, one size down ════');
  const card = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24'); modelSet('droid',{frame:false}); modelSet('servos',{frame:false});
    svDeselect();                               // whatever an earlier section left open
    const got = {closed: !$('svCard').classList.contains('on')};
    document.querySelector('#svGrid .svtile[data-ch="2"]').click();
    got.open = $('svCard').classList.contains('on');
    got.title = ($('svCard').querySelector('.seltitle')||{}).textContent;
    got.rows = ['btnSvCardShape_gauge','svCardPart','svCardName','svCardTest'].map(id=>!!$(id));
    got.sel  = document.querySelector('#svGrid .svtile[data-ch="2"]').classList.contains('sel');

    /* 1 — DRIVES, through HW.setPart so it is one-channel-per-part and saved */
    const sel = $('svCardPart');
    sel.value = 'oth3'; sel.dispatchEvent(new Event('change'));
    got.wired = MSTR.channels[2].act;
    got.tileSays = document.querySelector('#svGrid .svtile[data-ch="2"] .svdrives').textContent;

    /* 2 — NAME. No second click: the card survives its own rebuild, which is
       the behaviour worth having — changing what a channel drives must not
       shut the card you changed it from. */
    const inp = $('svCardName');
    inp.value = 'Left eyebrow'; inp.dispatchEvent(new Event('change'));
    got.named = MSTR.channels[2].name;
    got.tileNamed = document.querySelector('#svGrid .svtile[data-ch="2"] .svname').textContent;

    /* 3 — TEST moves it */
    const sl = $('svCardTest');
    sl.value = '0.9'; sl.dispatchEvent(new Event('input'));
    for(let i=0;i<40;i++) syncActuators(0.05);
    got.tested = chanPosNorm(MSTR.channels[2]) > 0.8;

    /* Esc closes it, like deselecting a part on the model */
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}));
    got.escClosed = !$('svCard').classList.contains('on');
    /* and it floats over the STAGE, in #selcard's own corner */
    got.overStage = $('svCard').closest('#stage') === $('stage');
    return got;
  });
  ok('a tile starts unselected and the card is shut', card.closed);
  ok('clicking one opens a card named for the channel',
     card.open && /Channel 2/.test(card.title||'') && card.sel, JSON.stringify(card));
  ok('…with the four rows: face, drives, name and test', card.rows.every(Boolean), JSON.stringify(card.rows));
  ok('DRIVES wires it, and the tile says so', card.wired==='oth3' && /Other 3/.test(card.tileSays), card.tileSays);
  ok('NAME renames the channel, and the tile follows', card.named==='Left eyebrow' && card.tileNamed==='Left eyebrow');
  ok('TEST actually moves the servo', card.tested);
  ok('Esc closes the card', card.escClosed);
  ok('…and it floats over the stage, where the part card does', card.overStage);

  console.log('\n════ the retired rkS ids are cleared, not left looking wired ════');
  const migr = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    MSTR.channels[0].act = 'rkS1';
    MSTR.channels[1].act = 'rkS2';
    const before = MSTR.channels.slice(0,3).map(c=>c.act||'-').join(',');
    /* what it looked like: truthy, and unnameable */
    const looksWired = !!MSTR.channels[0].act && actPartLabel('rkS1') === '';
    const n = chanDropRetiredActs(MSTR.channels);
    return {before, n, after: MSTR.channels.slice(0,3).map(c=>c.act||'-').join(','), looksWired};
  });
  ok('a channel left on a retired rack id looks wired but has no name', migr.looksWired, migr.before);
  ok('…and the migration clears exactly those', migr.n===2 && migr.after==='-,-,pie2', JSON.stringify(migr));

  console.log('\n════ sim only must never land on the gauges ════');
  const kiosk = await ev(()=>{
    modelSet('servos', {frame:false});
    const wasThere = modelGet() === 'servos';
    kioskEnter('');
    const got = {wasThere, left: modelGet() !== 'servos',
                 screenGone: getComputedStyle($('svScreen')).display === 'none',
                 /* the chip is hidden in sim only, so there would have been
                    no way back to the droid from a screen of gauges */
                 toolsGone: getComputedStyle($('stageTools')).display === 'none'};
    kioskLeave();
    return got;
  });
  ok('entering sim only from the gauges puts the droid back',
     kiosk.wasThere && kiosk.left && kiosk.screenGone, JSON.stringify(kiosk));
  ok('…which matters because the way back is hidden in sim only', kiosk.toolsGone);

  console.log('\n════ nothing to show, and a way out of it ════');
  const empty = await ev(()=>{
    MSTR.channels = []; MSTR.sequences = []; MSTR.loaded = false;
    modelSet('droid', {frame:false}); modelSet('servos', {frame:false});
    const got = {tiles: document.querySelectorAll('#svGrid .svtile').length,
                 says: /needs\s+a channel table/i.test($('svGrid').textContent),
                 button: !!$('btnSvStarter')};
    $('btnSvStarter').click();
    got.after = document.querySelectorAll('#svGrid .svtile').length;
    got.seqs = MSTR.sequences.length;
    got.endsHome = MSTR.sequences.every(q=>{
      const last = q.frames[q.frames.length-1].targets;
      return MSTR.channels.every(c=>!/^servo/i.test(c.mode) || last[c.i] === MSTR.channels[0].home);
    });
    return got;
  });
  ok('an empty channel table says so rather than drawing nothing',
     empty.tiles===0 && empty.says && empty.button, JSON.stringify(empty));
  ok('…and one button builds a layout that fills it', empty.after===24 && empty.seqs===8);
  ok('…whose eight routines all end centred, so two of them compose', empty.endsHome);

  console.log('\n════ nothing leaked into the droid ════');
  ok('the droid’s own actuator count is untouched', await ev(()=>
    Object.keys(ACT).filter(k=>!/^bldJ\d+t?$/.test(k)).length
      === ACT_KEYS.length + PIE_COUNT + PANEL_COUNT));
  ok('no rkS key exists anywhere in ACT', await ev(()=>!Object.keys(ACT).some(k=>/^rkS/.test(k))));
  ok('the grid does no per-frame work while another model is on stage', await ev(()=>{
    modelSet('droid', {frame:false});
    const n = document.querySelector('#svGrid .svtile .svneedle');
    const was = n ? n.getAttribute('transform') : '';
    if(MSTR.channels[0]) { CHPOS[0] = 0.123; svTick(); }
    return !n || (n.getAttribute('transform') === was);
  }));
  /* ═══ the needles move at the FRAME rate, not the UI tick (v1.62.0)
     Mike: "the servos are ... looking jerky - more so than previously."
     v1.60.0 put svTick() on the 0.06 s UI tick calling it "a readout, not a
     render" — sixteen needle positions a second, where v1.57.0's 3D rack
     they replaced drew at 60. Red on v1.60.0 and v1.61.0. */
  console.log('\n════ the gauges animate at the frame rate ════');
  const rate = await page.evaluate(async ()=>{
    modelSet('servos', {frame:false});
    let ticks = 0, frames = 0;
    const realTick = window.svTick, realApply = window.applyToModel;
    window.svTick = function(){ ticks++; return realTick.apply(this, arguments); };
    window.applyToModel = function(){ frames++; return realApply.apply(this, arguments); };
    await new Promise(r=>setTimeout(r, 900));
    window.svTick = realTick; window.applyToModel = realApply;
    return {ticks, frames, ratio: frames ? +(ticks/frames).toFixed(2) : 0};
  });
  ok('svTick runs once per frame, not once per UI tick', rate.ratio > 0.9, JSON.stringify(rate));
  ok('…and it actually ran', rate.ticks > 5, JSON.stringify(rate));

  /* ═══ generated channels carry a speed limit (v1.62.0)
     speed 0 / accel 0 = unlimited, and blocks.js compiles a ramp as steps
     ~120 ms apart trusting "the board's own acceleration rounds the corners".
     With no limit there are no corners and a real servo bangs eight times a
     second. Red on v1.61.0. */
  console.log('\n════ a generated servo has a speed limit ════');
  const lim = await page.evaluate(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    const c = MSTR.channels.find(x=>/^servo/i.test(x.mode));
    return {speed:c.speed, accel:c.acceleration,
            fullThrowMs: Math.round(chanTravelMs(c, Math.abs(c.max - c.min))),
            unlimited: liveUnlimited().length};
  });
  ok('a generated servo channel is speed limited', lim.speed > 0 && lim.accel > 0, JSON.stringify(lim));
  ok('…and a full throw takes about 400 ms, not zero',
     lim.fullThrowMs > 300 && lim.fullThrowMs < 600, JSON.stringify(lim));
  ok('…so nothing on a fresh table counts as unlimited', lim.unlimited === 0, JSON.stringify(lim));

  const rackLim = await page.evaluate(()=>{
    makeStarter('rack','mini24');
    const c = MSTR.channels.find(x=>/^servo/i.test(x.mode));
    return {speed:c.speed, accel:c.acceleration, unlimited: liveUnlimited().length};
  });
  ok('the servo layout — the one that regenerates the table — is limited too',
     rackLim.speed > 0 && rackLim.unlimited === 0, JSON.stringify(rackLim));

  /* and the other half of the rule: somebody else's numbers are never
     rewritten, they are only COUNTED, so the arm dialog can say so */
  const mine = await page.evaluate(()=>{
    MSTR.channels.forEach(c=>{ c.speed = 0; c.acceleration = 0; });
    servoStoreSave(); servoStoreLoad();
    const c = MSTR.channels[0];
    return {speed:c.speed, accel:c.acceleration, unlimited: liveUnlimited().length};
  });
  ok('a table of your own carrying 0 survives a save and reload untouched',
     mine.speed === 0 && mine.accel === 0, JSON.stringify(mine));
  ok('…and is counted instead, so arming live drive can warn about it',
     mine.unlimited > 0, JSON.stringify(mine));

  ok('no page errors', errs.length===0, errs.slice(0,5).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
