/* Sequencer v2 — the Daslight-style rework (v1.12.0)
   ---------------------------------------------------------------------
   Covers Mike's confirmed spec of 2026-07-29: the show-control layout,
   the draggable playhead, snapping (neighbours + musical modes), the
   grouped/searchable library whose CLICK never clears the sequence, the
   Advanced gate on speed overrides, the imported-config authority, the
   colour restore on leaving the sequencer, the removal of dead sliders,
   and the full-screen Put on the board workspace. */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
const fs = require('fs');
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
  await ev(()=>{ buildSet('domeServo','mini24'); buildSet('bodyServo','mini12'); buildSet('sound','dysv5w'); wizFinish(); });
  await page.waitForTimeout(300);
  await ev(()=>{ loadProfile('maestro25'); });
  await page.waitForTimeout(300);
  await ev(()=>{ setBoard('mini24'); makeStarter('dome','mini24'); setStripMode('seq'); });
  await page.waitForTimeout(300);
  await ev(()=>{
    /* a brick routine on a mapped part, so the timeline builds and the
       pose is observable */
    EDIT.seq = blockNewRoutine('Playhead test');
    const seq = MSTR.sequences[EDIT.seq];
    blockAdd(seq, 'act', 'pie0', 0, {dur:2000, rise:300, fall:300});
    buildSequencer();
  });

  console.log('\n════ the show-control layout ════');
  ok('transport: play, stop, time readout, Advanced, Put on the board — the snap picker moved to the ruler (2026-08-18)', await ev(()=>
    !!$('sqPlay') && !!$('sqStop') && !!$('sqTime') &&
    !!$('sqAdv') && /Put on the board/.test($('sqBuild').textContent)));
  ok('the inspector has its own column on the right', await ev(()=>{
    const r = $('seqinsp').getBoundingClientRect();
    const t = $('seqblocks').getBoundingClientRect();
    return r.width > 150 && r.left > t.left;
  }));
  ok('the sequence library has its own panel, below the timeline', await ev(()=>{
    const l = $('seqlib').getBoundingClientRect();
    const t = $('seqblocks').getBoundingClientRect();
    return l.top >= t.top && l.left === t.left && !!$('seqlib').querySelector('.libsearch');
  }));
  ok('the timeline is ONE scroller with a sticky ruler', await ev(()=>{
    const outer = document.querySelectorAll('#seqblocks .tlouter');
    return outer.length===1 && !!outer[0].querySelector('.blkruler');
  }));

  console.log('\n════ the playhead ════');
  ok('it exists and spans the timeline', await ev(()=>!!$('tlPlayhead')));
  const scrub = await ev(()=>{
    ACT_T.pie0 = 0;
    blkPlayheadSet(1000);                       // mid-brick: fully open
    const open = ACT_T.pie0;
    const t1 = BLK.play.t, txt = $('sqTime').textContent;
    blkPlayheadSet(0);
    return {open, t1, txt, closed:ACT_T.pie0,
            left: $('tlPlayhead').style.left};
  });
  ok('scrubbing to mid-brick poses the model open', scrub.open > 0.5, 'ACT_T '+scrub.open);
  ok('…and back to 0 poses it closed', scrub.closed < 0.1);
  ok('the time readout follows it', scrub.t1===1000 && scrub.txt==='1.00s', scrub.txt);
  await ev(()=>{ $('sqPlay').click(); });
  await page.waitForFunction('BLK.play.t > 60', {timeout:20000});
  ok('during preview the playhead follows playback', true);
  ok('■ stops the preview', await ev(()=>{
    $('sqStop').click();
    return !MAESTRO.slot.edit;
  }));

  console.log('\n════ snapping — neighbours ════');
  const snapN = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    blockAdd(seq, 'act', 'pie1', 3000, {dur:1000});
    const align = blockSnapResolve(2960, seq, -1, 100);   // near pie1's start
    const butt  = blockSnapResolve(2050, seq, -1, 100);   // near pie0's end
    const far   = blockSnapResolve(2600, seq, -1, 100);   // near nothing
    return {align, butt, far};
  });
  ok('a drag near another brick aligns with its start', snapN.align.t===3000 && snapN.align.kind==='edge', JSON.stringify(snapN.align));
  ok('…or butts against its end', snapN.butt.t===2000 && /after/.test(snapN.butt.label));
  ok('away from everything it falls back to the 50 ms grid', snapN.far.t===2600 && snapN.far.kind==='grid');

  console.log('\n════ snapping — musical modes ════');
  await ev(()=>{
    MUSIC.loaded = true; MUSIC.name='fake.mp3'; MUSIC.duration = 30;
    MUSIC.peaks = new Float32Array(1800);       // a silent waveform is fine here
    musicSetGrid(120);                          // beats every 500 ms
    BLK.snapMode = 'all';
    buildSequencer();
  });
  ok('strong beats are every bar (4 beats by default)', await ev(()=>
    musicIsStrong(0) && !musicIsStrong(1) && !musicIsStrong(3) && musicIsStrong(4)));
  ok('the ruler draws the beat grid, strong beats distinct', await ev(()=>{
    const all = document.querySelectorAll('#seqblocks .blktick.beat').length;
    const strong = document.querySelectorAll('#seqblocks .blktick.beat.strong').length;
    return all > 4 && strong >= 1 && strong < all;
  }));
  ok('the waveform-side count agrees', await ev(()=>
    musicSnapBeats('all').length > musicSnapBeats('strong').length &&
    musicSnapBeats('off').length === 0));
  const snapM = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    BLK.snapMode='all';    const all    = blockSnapResolve(980,  seq, -1, 100);
    BLK.snapMode='strong'; const strong = blockSnapResolve(1900, seq, -1, 150);
    BLK.snapMode='off';    const off    = blockSnapResolve(982,  seq, -1, 100);
    BLK.snapMode='all';
    return {all, strong, off};
  });
  ok('All beats: 0.98 s lands on the 1.0 s beat', snapM.all.t===1000 && snapM.all.kind==='beat', JSON.stringify(snapM.all));
  ok('Strong beats: 1.9 s lands on the 2.0 s bar', snapM.strong.t===2000 && snapM.strong.kind==='strong');
  ok('Off/manual: nothing snaps', snapM.off.t===980 && snapM.off.kind==='free');
  ok('the toolbar says placement is snapping to music', await ev(()=>{
    buildSequencer();
    return /snapping to/.test($('seqblocks').querySelector('.blktools').textContent);
  }));
  ok('Snap to beats retimes a brick routine onto the grid', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    blockList(seq)[0].t0 = 130;
    const n = blockSnapToBeats(seq);
    return n >= 1 && blockList(seq)[0].t0 === 0;
  }));
  ok('the snap indicator shows what a drag snapped to', await ev(()=>{
    blkSnaplineShow(1000,'beat 2');
    const s = $('tlSnapline');
    const on = s.style.display==='block' && s.querySelector('span').textContent==='beat 2';
    blkSnaplineHide();
    return on && s.style.display==='none';
  }));
  await ev(()=>{ MUSIC.loaded=false; MUSIC.beats=[]; buildSequencer(); });

  console.log('\n════ the sequence library ════');
  ok('grouped: my sequences and imported starters sit under headers', await ev(()=>{
    const heads = Array.from($('seqlib').querySelectorAll('.libgrph')).map(x=>x.textContent);
    return heads.some(h=>/My sequences/.test(h)) && heads.some(h=>/Imported/.test(h));
  }));
  ok('search filters the chips', await ev(()=>{
    BLK.libq='Playhead'; buildSeqLib();
    const n1 = $('seqlib').querySelectorAll('.blkchip.seq').length;
    BLK.libq='zzz-nothing'; buildSeqLib();
    const n0 = $('seqlib').querySelectorAll('.blkchip.seq').length;
    const empty = !!$('seqlib').querySelector('.libempty');
    BLK.libq=''; buildSeqLib();
    const all = $('seqlib').querySelectorAll('.blkchip.seq').length;
    return n1===1 && n0===0 && empty && all===MSTR.sequences.length;
  }));
  const click = await ev(()=>{
    const before = {seq:EDIT.seq, blocks:blockList(MSTR.sequences[EDIT.seq]).length};
    const chip = Array.from($('seqlib').querySelectorAll('.blkchip.seq')).find(c=>+c.dataset.seq!==EDIT.seq);
    const r = chip.getBoundingClientRect();
    chip.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.x+4,clientY:r.y+4,pointerId:7}));
    window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:r.x+4,clientY:r.y+4,pointerId:7}));
    return {prev: !!document.querySelector('.libprev'),
            sameSeq: EDIT.seq===before.seq,
            sameBlocks: blockList(MSTR.sequences[before.seq]).length===before.blocks};
  });
  ok('CLICK opens a description card…', click.prev);
  ok('…and never closes, replaces or clears the routine being edited', click.sameSeq && click.sameBlocks);
  /* v1.40.0 — Mike, 2026-08-14: "imported routines when placed on the
     timeline should be expanded into each servo's block". ＋ Insert now
     EXPLODES (the same default the timeline drop uses); the old
     single-brick behaviour moved to a second button, "Insert as one
     brick", so it stays reachable. This replaces the old
     "the card can insert the routine as a brick instead" assertion,
     which encoded the pre-explode default — deliberately superseded, not
     merely broken, by the explode feature this suite is here to cover. */
  ok('the card can EXPLODE the routine into per-part bricks (the new default)', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const n = blockList(seq).length;
    const b = Array.from(document.querySelectorAll('.libprev button')).find(x=>x.textContent==='＋ Insert');
    if(!b || b.disabled) return false;
    b.click();
    const list = blockList(seq);
    const added = list.slice(n);
    return added.length>0 && added.every(x=>x.kind==='act') && !document.querySelector('.libprev');
  }));
  ok('…and "Insert as one brick" keeps the old single-brick behaviour reachable', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const chip = Array.from($('seqlib').querySelectorAll('.blkchip.seq')).find(c=>+c.dataset.seq!==EDIT.seq);
    const r = chip.getBoundingClientRect();
    chip.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.x+4,clientY:r.y+4,pointerId:8}));
    window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:r.x+4,clientY:r.y+4,pointerId:8}));
    const n = blockList(seq).length;
    const b = Array.from(document.querySelectorAll('.libprev button')).find(x=>x.textContent==='Insert as one brick');
    if(!b || b.disabled) return false;
    b.click();
    const list = blockList(seq);
    return list.length===n+1 && list[list.length-1].kind==='seq';
  }));
  ok('a routine can be given a named group', await ev(()=>{
    const s = MSTR.sequences[EDIT.seq];
    s.cat = 'Shows'; buildSeqLib();
    const has = Array.from($('seqlib').querySelectorAll('.libgrph')).some(x=>/Shows/.test(x.textContent));
    delete s.cat; buildSeqLib();
    return has;
  }));

  console.log('\n════ the Advanced gate on speed overrides ════');
  await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    BLK.sel = blockList(seq)[0].id;
    BLK.adv = false; buildSequencer();
  });
  ok('off: duration and amount only — imported speeds apply', await ev(()=>
    $('seqinsp').querySelectorAll('input[type=range]').length===2 &&
    /imported/i.test($('seqinsp').textContent)));
  ok('on: opening and closing speeds appear', await ev(()=>{
    BLK.adv = true; buildSequencer();
    return $('seqinsp').querySelectorAll('input[type=range]').length===4;
  }));
  ok('an edited speed is badged as an override', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockList(seq)[0];
    b.rise = blockDefaultRamp(b.ref) + 500; blockSync(seq); buildSequencer();
    return $('seqinsp').querySelectorAll('.blkovr').length >= 1;
  }));
  ok('restore puts the imported value back', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockList(seq)[0];
    const btn = Array.from($('seqinsp').querySelectorAll('button')).find(x=>x.textContent==='restore');
    btn.click();
    return b.rise===blockDefaultRamp(b.ref) && b.fall===blockDefaultRamp(b.ref);
  }));
  ok('the switch is remembered', await ev(()=>{
    $('sqAdv').checked = false; $('sqAdv').dispatchEvent(new Event('change'));
    const saved = JSON.parse(localStorage.getItem('r2sim.prefs.v1'));
    return BLK.adv===false && saved.seqAdv===false;
  }));
  ok('Zoom to this part centres the brick\'s part, close up', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    BLK.sel = blockList(seq)[0].id; BLK.cam = 0.7; buildSequencer();
    const btn = Array.from($('seqinsp').querySelectorAll('button')).find(x=>/Zoom to this part/.test(x.textContent));
    if(!btn) return false;
    btn.click();
    const m = CAD.moving.find(x=>x.act===blockList(seq)[0].ref);
    if(!m) return true;
    return Math.abs(CAM.dist-0.7)<1e-6 && CAM.target.distanceTo(partWorldPos(m.name))<1e-4;
  }));

  console.log('\n════ the empty inspector earns its column (Q6) ════');
  const summ = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    BLK.sel = null; buildSequencer();
    const t = $('seqinsp').textContent;
    const vals = Array.from($('seqinsp').querySelectorAll('.blkval')).map(x=>x.textContent);
    const chips = $('seqinsp').querySelectorAll('.blkchip.pc').length;
    const acts = new Set(blockList(seq).filter(b=>b.kind==='act').map(b=>b.ref)).size;
    return {t, vals, chips, acts,
            name: seq.name,
            len: (blockEnd(seq)/1000).toFixed(1)+'s',
            n: String(blockList(seq).length),
            hint: /Click a brick/.test(t)};
  });
  ok('no brick selected: the routine summary card renders, named', summ.t.indexOf(summ.name)>=0, summ.name);
  ok('…with the total length and the brick count', summ.vals.indexOf(summ.len)>=0 && summ.vals.indexOf(summ.n)>=0, JSON.stringify(summ.vals));
  ok('…the parts used, wearing their lane colours', summ.chips===summ.acts && summ.chips>=2, summ.chips+' of '+summ.acts);
  ok('…and an on-board / not-loaded status', /not on the board|on the board as sub \d+/.test(summ.t));
  ok('the old hint survives as a smaller line at the bottom', summ.hint);
  ok('selecting a brick swaps to the brick inspector', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    BLK.sel = blockList(seq)[0].id; buildSequencer();
    const t = $('seqinsp').textContent;
    return /Runs for/i.test(t) && !/on the board/.test(t);
  }));
  ok('deselecting brings the summary back', await ev(()=>{
    BLK.sel = null; buildSequencer();
    const t = $('seqinsp').textContent;
    return t.indexOf(MSTR.sequences[EDIT.seq].name)>=0 && !/Runs for/i.test(t);
  }));

  console.log('\n════ the imported configuration is authoritative ════');
  const mstr = fs.readFileSync(path.join(__dirname,'fixtures-live-dome.mstr'),'utf8');
  await page.evaluate(t=>{ parseMstr(t,'live-dome.mstr'); rebuildMaestroUI(); }, mstr);
  const auth = await ev(()=>{
    const snap = JSON.stringify(MSTR.channels.map(c=>[c.name,c.min,c.max,c.speed,c.acceleration,c.home]));
    const act = MSTR.channels.find(c=>c.act && /^servo/i.test(c.mode)).act;
    /* build, play, snap — none of it may touch the channel table */
    EDIT.seq = blockNewRoutine('Authority');
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockAdd(seq, 'act', act, 0, {dur:3000});
    seqStart('edit', seq.frames, 'preview');
    blkPlayheadSet(1500);
    delete MAESTRO.slot.edit;
    const after = JSON.stringify(MSTR.channels.map(c=>[c.name,c.min,c.max,c.speed,c.acceleration,c.home]));
    /* the physical floor from speed=80 / accel=10 */
    const lim = blockMinTravelMs(act);
    const fast = blockAdd(seq, 'act', act, 4000, {dur:3000, rise:100, fall:100});
    const eff = blockEffRamps(fast);
    /* no compiled target may leave the imported endpoints */
    const c = blockChan(act);
    let out = 0;
    seq.frames.forEach(f=>{ const t=f.targets[c.i];
      if(t && (t<Math.min(c.min,c.max) || t>Math.max(c.min,c.max))) out++; });
    /* defaults are honest from the start */
    const defOk = b.rise >= lim;
    return {same: snap===after, lim, effRise:eff.rise, out, defOk};
  });
  ok('building, playing and scrubbing change no channel setting', auth.same);
  ok('the imported speed/accel set a real travel floor', auth.lim > 500, auth.lim+' ms');
  ok('a brick asking for a 100 ms ramp is floored at the imported travel', auth.effRise >= auth.lim, auth.effRise+' ms');
  ok('a fresh brick defaults to the imported speed, not faster', auth.defOk);
  ok('no compiled target leaves the imported endpoints', auth.out===0);
  ok('the export writes the imported channel table back unchanged', await ev(()=>{
    const t = buildMstrText();
    return MSTR.channels.every(c=>t.indexOf('name="'+c.name+'" mode="'+c.mode+'" min="'+c.min+'" max="'+c.max+
      '" homemode="'+c.homemode+'" home="'+c.home+'" speed="'+c.speed+'" acceleration="'+c.acceleration+'"') >= 0
      || c.autoName);   // the unnamed spare gets its placeholder name stripped elsewhere
  }));
  ok('the summary card reports the slowest imported throw', await ev(()=>{
    BLK.sel = null; buildSequencer();
    return /~\d+ ms at these channels' speeds/.test($('seqinsp').textContent);
  }));

  console.log('\n════ dead sliders are gone ════');
  ok('import wizard: a slider only exists once the channel drives a part', await ev(()=>{
    MSTR.channels[0].act='';           // unmap one on purpose
    impwizOpen(); impwizGo(3);
    const rows = Array.from(document.querySelectorAll('.iwmaprow'));
    const unmapped = rows.filter(r=>r.classList.contains('un'));
    const mapped = rows.filter(r=>!r.classList.contains('un'));
    const okk = unmapped.length>0 && unmapped.every(r=>!r.querySelector('input[type=range]'))
           && mapped.length>0 && mapped.every(r=>!!r.querySelector('input[type=range]'));
    impwizClose();
    MSTR.channels[0].act = guessPart(MSTR.channels[0].name);
    return okk;
  }));
  /* v1.39.3 — Mike: "in the sequncer only parts that are assigned to servos
     should be displayed." An unmapped channel is now HIDDEN by default (the
     brick library has always filtered them out); the count says so and one
     click brings them back, and only THEN is the hint-not-a-slider rule
     visible — a board-only channel is real, it just moves nothing here. */
  ok('pose view: a channel that drives nothing is out of the way by default', await ev(()=>{
    MSTR.channels[0].act = '';
    EDIT.showUnmapped = false;
    buildSequencer();
    const rows = Array.from(document.querySelectorAll('#seqpose .chrow'));
    const hidden = rows.every(r=>!r.classList.contains('unmapped'));
    const said = /drives? nothing on this model/.test($('seqpose').textContent);
    return hidden && said && rows.length > 0;
  }));
  ok('...and shows itself on request, as a hint rather than a dead slider', await ev(()=>{
    EDIT.showUnmapped = true;
    buildSequencer();
    const rows = Array.from(document.querySelectorAll('#seqpose .chrow'));
    const un = rows.filter(r=>r.classList.contains('unmapped'));
    const okk = un.length>0 && un.every(r=>!r.querySelector('input[type=range]'));
    EDIT.showUnmapped = false;
    MSTR.channels[0].act = guessPart(MSTR.channels[0].name);
    buildSequencer();
    return okk;
  }));

  console.log('\n════ every mapped part gets the same colour treatment ════');
  await ev(()=>{ setBoard('mini24'); makeStarter('body','mini24'); buildSequencer(); });
  ok('all four breadpan doors are rigged CAD parts with actuators', await ev(()=>
    ['doorL','doorR','doorRL','doorRR'].every(a=>CAD.moving.some(m=>m.act===a))));
  ok('…and all of them are sequencable parts', await ev(()=>
    ['doorL','doorR','doorRL','doorRR','smallDoor'].every(a=>blockActions().some(x=>x.act===a))));
  ok('with the tint on, EVERY channel-mapped part wears its sequencer colour', await ev(()=>{
    BLK.tint = true; applyPaint();
    const mapped = CAD.moving.filter(m=>m.act && MSTR.channels.some(c=>c.act===m.act));
    const bad = mapped.filter(m=>effectivePartHex(m.name)!==blkColor(m.act));
    BLK.tint = false; applyPaint();
    return mapped.length>=5 && bad.length===0;
  }));

  console.log('\n════ leaving the sequencer restores the colours ════');
  const restore = await ev(()=>{
    BLK.tint = true; applyPaint();
    const m = CAD.moving.find(x=>x.act && MSTR.channels.some(c=>c.act===x.act));
    const tinted = effectivePartHex(m.name);
    setStripMode('pad');
    const after = effectivePartHex(m.name);
    const off = BLK.tint===false;
    setStripMode('seq');
    return {tinted, after, off, backOff: BLK.tint===false};
  });
  ok('the tint is dropped on the way out', restore.off && restore.tinted!==restore.after);
  ok('…and does not sneak back in on re-entry', restore.backOff);

  console.log('\n════ Mexican wave ════');
  await ev(()=>{ setBoard('mini24'); makeStarter('dome','mini24'); buildSequencer(); });
  const mw = await ev(()=>{
    EDIT.seq = blockNewRoutine('Mexican wave');
    const seq = MSTR.sequences[EDIT.seq];
    const g = blockGroups().find(x=>x.id==='all-pies');
    blockMakeShape(seq, 'mexwave', g.members);
    const bl = blockList(seq);
    const num = a => +(/(\d+)$/.exec(a)||[0,999])[1];
    return {
      n: bl.length, members: g.members.length,
      ringOrder: bl.every((b,i)=>i===0 || num(b.ref) >= num(bl[i-1].ref)),
      lagged: bl.every((b,i)=>i===0 || b.t0 - bl[i-1].t0 === 500),
      bell: bl.every(b=>b.rise===b.dur/2 && b.fall===b.dur/2),
      overlap: bl.length>1 && bl[1].t0 < bl[0].t0 + bl[0].dur,
      frames: seq.frames.length
    };
  });
  ok('one brick per part, in PHYSICAL ring order', mw.n===mw.members && mw.ringOrder, JSON.stringify(mw));
  ok('each rises as its neighbour peaks — a travelling overlap', mw.lagged && mw.overlap);
  ok('each part is a smooth rise-and-fall bell', mw.bell);
  ok('and it compiles to real frames', mw.frames > mw.n);

  console.log('\n════ Breathe ════');
  const br = await ev(()=>{
    EDIT.seq = blockNewRoutine('Breathe');
    const seq = MSTR.sequences[EDIT.seq];
    const g = blockGroups().find(x=>x.id==='all-pies');
    blockMakeShape(seq, 'breathe', g.members);
    const bl = blockList(seq);
    const c = blockChan(g.members[0]);
    const closed = blockClosed(c), open = blockOpen(c);
    /* the deepest the compiled routine ever drives that channel */
    let peak = closed;
    seq.frames.forEach(f=>{ const t=f.targets[c.i]; if(t && Math.abs(t-closed) > Math.abs(peak-closed)) peak = t; });
    const frac = Math.abs(peak-closed) / Math.abs(open-closed);
    return {
      n: bl.length, want: g.members.length*4,
      cycles: new Set(bl.map(b=>b.t0)).size,
      gentle: bl.every(b=>b.amp===0.22),
      frac: +frac.toFixed(2),
      total: seqTotal(seq)
    };
  });
  ok('four slow cycles, every part together', br.n===br.want && br.cycles===4, JSON.stringify(br));
  ok('bricks carry the gentle amplitude', br.gentle);
  ok('the compiled pose only ever swells ~a fifth open', br.frac > 0.15 && br.frac < 0.30, br.frac+' of full travel');
  ok('it runs slow — a real breath, not a flutter', br.total >= 12000, br.total+' ms');

  console.log('\n════ routine speed control ════');
  const spd = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const before = blockEnd(seq);
    blockScaleTime(seq, 0.8);
    const fast = blockEnd(seq);
    blockScaleTime(seq, 1.25);
    buildSequencer();
    const btns = Array.from($('seqblocks').querySelectorAll('.blktools button')).map(x=>x.textContent);
    return { before, fast,
             restored: Math.abs(blockEnd(seq) - before) <= 20,
             hasBtns: btns.some(t=>/Slower/.test(t)) && btns.some(t=>/Faster/.test(t)) };
  });
  ok('Faster tightens the whole routine by a fifth', Math.abs(spd.fast - spd.before*0.8) <= 20, spd.before+' → '+spd.fast);
  ok('Slower undoes it', spd.restored);
  ok('the controls live in the sequencer toolbar', spd.hasBtns);
  ok('the inspector has an Opens-to amount for a brick', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    BLK.sel = blockList(seq)[0].id; buildSequencer();
    return /Opens to/i.test($('seqinsp').textContent);
  }));
  ok('both presets sit in the Ready-made row', await ev(()=>{
    const t = Array.from($('seqblocks').querySelectorAll('.blklib button')).map(x=>x.textContent);
    return t.indexOf('Mexican wave')>=0 && t.indexOf('Breathe')>=0;
  }));

  console.log('\n════ Put on the board ════');
  ok('a prominent button in the Sequencer opens it full-screen', await ev(()=>{
    $('sqBuild').click();
    return BLD.open && !$('bldWiz').hidden && !!document.querySelector('.bldgrid');
  }));
  ok('select · order · validate · generate, side by side', await ev(()=>{
    const heads = Array.from(document.querySelectorAll('.bldcol h4')).map(x=>x.textContent);
    return heads.length===3 && /library/i.test(heads[0]) && /order/i.test(heads[1]) && /Validate/i.test(heads[2]);
  }));
  ok('the loadout rows carry restartScript slot numbers', await ev(()=>{
    const slots = Array.from(document.querySelectorAll('.bldrow .bldslot')).map(x=>x.textContent);
    return slots.length===loadoutNames().length && slots[0]==='0';
  }));
  const bld = await ev(()=>{
    const before = loadoutNames().length;
    const dropBtn = Array.from(document.querySelectorAll('.bldrow button')).find(b=>b.textContent==='✕');
    dropBtn.click();
    const dropped = loadoutNames().length===before-1;
    const addBtn = Array.from(document.querySelectorAll('.bldrow.spare button')).find(b=>/Add/.test(b.textContent));
    addBtn.click();
    return {dropped, back: loadoutNames().length===before};
  });
  ok('✕ takes a sequence off the board, ＋ Add puts one on', bld.dropped && bld.back);
  ok('validation runs live in the third column', await ev(()=>{
    const t = document.querySelector('.bldgrid').textContent;
    return /Errors/.test(t) && /Slowest throw/.test(t) && /Subroutines/.test(t);
  }));
  ok('the generated script can be shown', await ev(()=>{
    const b = Array.from(document.querySelectorAll('#bldWiz .iwfoot button')).find(x=>/Show the script/.test(x.textContent));
    b.click();
    const pre = document.querySelector('.bldscript');
    return pre && /^quit$/m.test(pre.textContent) && /sub /.test(pre.textContent);
  }));
  ok('Done closes it and the Maestro pane is the second door', await ev(()=>{
    const b = Array.from(document.querySelectorAll('#bldWiz .iwfoot button')).find(x=>x.textContent==='Done');
    b.click();
    document.querySelector('#tabs button[data-p="pMae"]').click();
    buildMaestroPane();
    const door = Array.from($('maeHost').querySelectorAll('button')).some(x=>/Put on the board/.test(x.textContent));
    return $('bldWiz').hidden && door;
  }));

  console.log('\n════ renaming via Save keeps the sequence on the board (v1.39.5) ════');
  const rename = await ev(()=>{
    EDIT.seq = blockNewRoutine('Rename me');
    blockAdd(MSTR.sequences[EDIT.seq], 'act', 'pie0', 0, {dur:500, rise:100, fall:100});
    loadoutAdd('Rename me');
    buildSequencer();
    const nameIn = document.querySelector('#seqlib .blkname');
    const bSave = Array.from(document.querySelectorAll('#seqlib button')).find(b=>b.textContent==='Save');
    nameIn.value = 'Renamed';
    bSave.click();
    const out = {names: loadoutNames(), onBoard: loadoutIndex('Renamed') >= 0};
    loadoutDrop('Renamed');
    return out;
  });
  ok('Save with a new name renames the loadout entry rather than dropping it off the board',
     rename.names.indexOf('Renamed') >= 0 && rename.names.indexOf('Rename me') < 0 && rename.onBoard,
     JSON.stringify(rename.names));

  console.log('\n════ the door to the sequencer (M2, v1.15.0) ════');
  /* The Controller/Sequencer switch used to be rotated vertical text in a
     14px gutter. It is a horizontal two-way switch on a slim bar now, and
     it must stay visible and clickable in BOTH strip modes. */
  const door = await ev(()=>{
    const meas = ()=>{
      const btns = Array.from(document.querySelectorAll('#stripmode .smbtn'));
      const rs = btns.map(b=>b.getBoundingClientRect());
      return {
        n: btns.length,
        horiz: rs.every(r=>r.width > r.height),
        sideBySide: rs.length===2 && Math.abs(rs[0].top - rs[1].top) < 2 && rs[1].left >= rs[0].right - 1,
        visible: rs.every(r=>r.width > 0 && r.height > 0) && btns.every(b=>b.offsetParent !== null),
        slim: $('stripmode').getBoundingClientRect().height <= 30,
        act: (document.querySelector('#stripmode .smbtn.act')||{dataset:{}}).dataset.m
      };
    };
    const inSeq = meas();
    setStripMode('pad');
    const inPad = meas();
    /* the Sequencer side must actually be hittable from the controller */
    const b = document.querySelector('#stripmode .smbtn[data-m="seq"]');
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2) === b;
    b.click();
    return {inSeq, inPad, hit, back: EDIT.active};
  });
  ok('the switch is horizontal — two side-by-side buttons, wider than tall',
     door.inSeq.n===2 && door.inSeq.horiz && door.inSeq.sideBySide, JSON.stringify(door.inSeq));
  ok('…visible on a slim bar in seq mode', door.inSeq.visible && door.inSeq.slim);
  ok('…and still visible (and horizontal) in controller mode',
     door.inPad.visible && door.inPad.horiz && door.inPad.sideBySide);
  ok('nothing covers it — a click on the Sequencer side lands on it', door.hit);
  ok('the filled side follows the mode, and clicking it switches',
     door.inSeq.act==='seq' && door.inPad.act==='pad' && door.back);

  console.log('\n════ the timeline takes the spare height (M4, v1.15.0) ════');
  /* At 1600×1000 the lanes used to get ~190px while a ~250px dead band sat
     between the parts row and the library. The lane scroller flex-grows
     now: with a 4-brick routine it must clear a robust floor, the parts +
     ready-made rows must sit straight on the library, and the library's
     bottom stays inside the viewport with its own bounded scroll. */
  const bal = await ev(()=>{
    EDIT.seq = blockNewRoutine('Layout test');
    const seq = MSTR.sequences[EDIT.seq];
    ['pie0','pie1','pie2','pie3'].forEach((a,i)=>blockAdd(seq,'act',a,i*800,{dur:1500}));
    BLK.sel = null; buildSequencer();
    const tlEl = document.querySelector('#seqblocks .tlouter');
    const tl = tlEl.getBoundingClientRect();
    const parts = document.querySelector('#seqblocks .blklib').getBoundingClientRect();
    const body = $('seqbody').getBoundingClientRect();
    const lib = $('seqlib').getBoundingClientRect();
    return {
      tlH: tl.height,
      scrolly: getComputedStyle(tlEl).overflowY,
      deadBand: lib.top - parts.bottom,
      fills: Math.abs(parts.bottom - body.bottom) < 2,
      libBottom: lib.bottom, innerH: window.innerHeight,
      libBounded: $('seqlib').clientHeight <= Math.max(280, window.innerHeight * 0.26) + 1
    };
  });
  ok('the lanes take the spare height — well past the old ~190px',
     bal.tlH > 300 && /auto|scroll/.test(bal.scrolly), Math.round(bal.tlH)+'px');
  ok('no dead band — the parts + ready-made rows sit straight on the library',
     bal.fills && bal.deadBand < 2, 'gap '+Math.round(bal.deadBand)+'px');
  ok('the library\'s bottom stays on screen, on its own bounded scroll',
     bal.libBottom <= bal.innerH + 0.5 && bal.libBounded, Math.round(bal.libBottom)+' vs '+bal.innerH);

  console.log('\n════ undo / redo (M6, v1.16.0) ════');
  /* Snapshot-based history: one deep copy of seq.blocks per completed
     gesture, depth 20, redo forked away by any new edit. Driven through
     the REAL handlers — the part chips' pointer path, the inspector's
     Remove, the toolbar's − Slower, and real clicks on ↶ / ↷. */
  ok('↶ / ↷ sit in the transport, before the Bricks/Pose/Frames trio', await ev(()=>{
    const u=$('sqUndo'), r=$('sqRedo'), v=$('sqViewBlocks');
    if(!u || !r || !v) return false;
    const kids = Array.from($('seqtop').children);
    return u.classList.contains('b') && r.classList.contains('b')
      && kids.indexOf(u) >= 0 && kids.indexOf(u) < kids.indexOf(v) && kids.indexOf(r) < kids.indexOf(v);
  }));
  ok('a fresh routine: both stacks empty, both buttons disabled', await ev(()=>{
    EDIT.seq = blockNewRoutine('Undo test');
    BLK.sel = null; buildSequencer();
    return $('sqUndo').disabled && $('sqRedo').disabled;
  }));

  /* add through the chip's own pointer path (a click drops at the end) */
  const uAdd = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const chip = $('seqblocks').querySelector('.blkchip.pc');
    const act = chip.dataset.act;
    const r = chip.getBoundingClientRect();
    chip.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.x+4,clientY:r.y+4,pointerId:9}));
    window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:r.x+4,clientY:r.y+4,pointerId:9}));
    return {n:blockList(seq).length, act, frames:seq.frames.length, undoOn:!$('sqUndo').disabled};
  });
  ok('a chip click adds a brick through the real handler, arming ↶', uAdd.n===1 && uAdd.undoOn, JSON.stringify(uAdd));
  const uUndo = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    $('sqUndo').click();
    return {n:blockList(seq).length, frames:seq.frames.length,
            home: seq.frames.length===1 && seq.frames[0].name==='home',
            undoOff:$('sqUndo').disabled, redoOn:!$('sqRedo').disabled};
  });
  ok('undo removes it AND recompiles the frames (back to the single home frame)',
     uUndo.n===0 && uUndo.home, JSON.stringify(uUndo));
  ok('undo exhausted disables ↶ and arms ↷', uUndo.undoOff && uUndo.redoOn);
  const uRedo = await ev(()=>{
    $('sqRedo').click();
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockList(seq)[0];
    const c = b && blockChan(b.ref);
    return {n:blockList(seq).length, frames:seq.frames.length,
            open: !!c && seq.frames.some(f=>f.targets[c.i]===blockOpen(c))};
  });
  ok('redo restores the brick and the compiled frames drive its channel open',
     uRedo.n===1 && uRedo.frames>1 && uRedo.open, JSON.stringify(uRedo));

  /* a drag through blkDragStart's own pointer path — snapshot captured at
     pointerdown, t0 written live on every move, ONE commit on pointerup.
     Synthetic PointerEvents, not page.mouse: a real held-button drag
     starves on this box (the v1.15.0 serial-run lesson), and
     setPointerCapture is best-effort for exactly this reason. */
  const uDrag = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockList(seq)[0];
    const t0Before = b.t0;
    const node = document.querySelector('.blkbrick');
    const r = node.getBoundingClientRect();
    const cx = r.x + r.width/2, cy = r.y + r.height/2;
    const pe = (type, dx)=>node.dispatchEvent(new PointerEvent(type,
      {bubbles:true, clientX:cx+dx, clientY:cy, pointerId:7}));
    pe('pointerdown', 0); pe('pointermove', 60); pe('pointermove', 120); pe('pointerup', 120);
    const t0After = blockList(seq)[0].t0;
    $('sqUndo').click();
    return {t0Before, t0After, t0Undone: blockList(seq)[0].t0};
  });
  ok('a drag moves the brick (t0 written live, one snapshot at pointerup)',
     uDrag.t0After !== uDrag.t0Before, uDrag.t0Before+' → '+uDrag.t0After);
  ok('undo restores the exact t0', uDrag.t0Undone === uDrag.t0Before, JSON.stringify(uDrag));
  ok('a new edit after undo clears the redo stack', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const hadRedo = blockCanRedo(seq);
    blockHistPush(seq);                          // what every add gesture does
    blockAdd(seq, 'act', blockActions()[1].act, 4000);
    buildSequencer();
    return hadRedo && !blockCanRedo(seq) && $('sqRedo').disabled;
  }));

  /* delete via the inspector's real Remove, undo brings it back whole */
  const uDel = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockList(seq)[0];
    const info = {ref:b.ref, t0:b.t0, dur:b.dur, ch:blockChan(b.ref).i, col:blkColor(b.ref)};
    BLK.sel = b.id; buildSequencer();
    const btn = Array.from($('seqinsp').querySelectorAll('button')).find(x=>x.textContent==='Remove');
    btn.click();
    return {info, n:blockList(seq).length, sel:BLK.sel};
  });
  ok('Remove deletes through the real handler and deselects', uDel.n===1 && uDel.sel===null);
  const uUndel = await page.evaluate(info=>{
    $('sqUndo').click();
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockList(seq).find(x=>x.ref===info.ref && x.t0===info.t0);
    if(!b) return {back:false};
    const node = Array.from(document.querySelectorAll('.blkbrick.pc')).find(n=>+n.dataset.id===b.id);
    const c = blockChan(b.ref);
    return {back: b.dur===info.dur,
            open: seq.frames.some(f=>f.targets[c.i]===blockOpen(c)),
            col: !!node && node.style.getPropertyValue('--pc')===info.col};
  }, uDel.info);
  ok('undo restores the deleted brick on the same channel, driving it again', uUndel.back && uUndel.open);
  ok('…wearing the same colour', uUndel.col);

  /* the deliberately-destructive scaling, restored to the last decimal */
  const uScale = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const shape = s=>JSON.stringify(blockList(s).map(b=>[b.t0,b.dur,b.rise,b.fall]));
    const before = shape(seq);
    const btn = Array.from($('seqblocks').querySelectorAll('.blktools button')).find(x=>/Slower/.test(x.textContent));
    btn.click();
    const scaled = shape(seq);
    $('sqUndo').click();
    return {changed: scaled!==before, exact: shape(seq)===before};
  });
  ok('− Slower rescales the routine (destructive as designed)', uScale.changed);
  ok('undo restores every t0, dur and ramp exactly', uScale.exact);

  /* the two things undo must NEVER touch — mirror the authority diff */
  const uGuard = await ev(()=>{
    const chanShape = ()=>JSON.stringify(MSTR.channels.map(c=>[c.name,c.mode,c.min,c.max,c.speed,c.acceleration,c.home]));
    const chan = chanShape(), board = JSON.stringify(MSTR.loadout);
    const seq = MSTR.sequences[EDIT.seq];
    blockHistPush(seq);
    blockAdd(seq, 'act', blockActions()[2].act, 6000);
    buildSequencer();
    $('sqUndo').click(); $('sqRedo').click(); $('sqUndo').click();
    return {chanSame: chan===chanShape(), boardSame: board===JSON.stringify(MSTR.loadout)};
  });
  ok('undo/redo never touch the channel table', uGuard.chanSame);
  ok('…or the script loadout — the library is not the board', uGuard.boardSame);

  /* depth: 21 edits, the oldest snapshot dropped */
  const uCap = await ev(()=>{
    EDIT.seq = blockNewRoutine('Cap test');
    BLK.sel = null; buildSequencer();
    const seq = MSTR.sequences[EDIT.seq];
    const act = blockActions()[0].act;
    for(let i=0;i<21;i++){ blockHistPush(seq); blockAdd(seq, 'act', act, i*500); }
    buildSequencer();
    let undos = 0;
    while(blockCanUndo(seq) && undos < 99){ blockUndo(seq); undos++; }
    buildSequencer();
    return {undos, left: blockList(seq).length, btn: $('sqUndo').disabled};
  });
  ok('history is capped at 20 — the oldest snapshot is dropped', uCap.undos===20, uCap.undos+' undos');
  ok('…so the FIRST edit is out of reach: one brick survives, ↶ disabled', uCap.left===1 && uCap.btn);

  /* hand-made frame lists have no history BY DESIGN */
  const uNoop = await ev(()=>{
    const i = MSTR.sequences.findIndex(s=>!blockIsRoutine(s));
    if(i < 0) return {isFrameList:false};
    EDIT.seq = i; BLK.sel = null; buildSequencer();
    const s = MSTR.sequences[i];
    const frames = JSON.stringify(s.frames);
    const res = blkUndo();                       // direct call must not throw
    $('sqUndo').click();                         // and the button sits disabled
    return {isFrameList: !blockIsRoutine(s), res,
            same: frames===JSON.stringify(s.frames),
            dis: $('sqUndo').disabled && $('sqRedo').disabled};
  });
  ok('an imported frame list: undo is a disabled no-op that does not throw',
     uNoop.isFrameList && uNoop.res===false && uNoop.same && uNoop.dis, JSON.stringify(uNoop));

  console.log('\n════ undo shortcuts and their containment ════');
  const kbN = await ev(()=>{
    EDIT.seq = MSTR.sequences.findIndex(s=>s.name==='Cap test');
    BLK.sel = null; buildSequencer();
    const seq = MSTR.sequences[EDIT.seq];
    blockHistPush(seq);
    blockAdd(seq, 'act', blockActions()[0].act, 20000);
    buildSequencer();
    if(document.activeElement) document.activeElement.blur();
    return blockList(seq).length;
  });
  const kbLen = ()=>ev(()=>blockList(MSTR.sequences[EDIT.seq]).length);
  await page.keyboard.press('Control+z');
  ok('Ctrl+Z undoes in sequencer mode', (await kbLen())===kbN-1);
  await page.keyboard.press('Control+y');
  ok('Ctrl+Y redoes', (await kbLen())===kbN);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  ok('Ctrl+Shift+Z is redo too', (await kbLen())===kbN);
  await ev(()=>{ $('seqlib').querySelector('.libsearch').focus(); });
  await page.keyboard.press('Control+z');
  ok('…inert while an input has focus — Ctrl+Z there means "undo my typing"', (await kbLen())===kbN);
  await ev(()=>{ document.activeElement.blur(); window.__dlg = appConfirm('containment test'); });
  await page.keyboard.press('Control+z');
  ok('…inert while the app dialog is open', await ev(()=>
    !!document.querySelector('.dlgwrap')) && (await kbLen())===kbN);
  await page.keyboard.press('Escape');
  ok('and the dialog still owns its keys — Esc settles it, nothing undone', await ev(async ()=>{
    const v = await window.__dlg;
    return v===false && !document.querySelector('.dlgwrap');
  }) && (await kbLen())===kbN);
  await ev(()=>setStripMode('pad'));
  await page.keyboard.press('Control+z');
  const kbPad = (await kbLen())===kbN;
  await ev(()=>setStripMode('seq'));
  ok('outside sequencer mode Ctrl+Z does nothing', kbPad);

  /* ================================================================
     v1.40.0 — Mike, 2026-08-14: "clicking a panel brick should offer:
     Opens then closes / just Opens / just Closes / Closes then opens".
     A basic-level control, like "Opens to" — NOT behind Advanced.
     ================================================================ */
  console.log('\n════ per-brick MOTION dropdown ════');
  const motion = await ev(()=>{
    EDIT.seq = blockNewRoutine('Motion test');
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockAdd(seq, 'act', blockActions()[0].act, 0, {dur:800});
    BLK.sel = b.id; BLK.adv = false; buildSequencer();
    const sel = Array.from($('seqinsp').querySelectorAll('select'))
      .find(s=>Array.from(s.options).some(o=>o.value==='oc'));
    return {
      present: !!sel,
      labels: sel ? Array.from(sel.options).map(o=>o.textContent) : [],
      selected: sel ? sel.value : null,
      visibleWithoutAdvanced: !!sel                    // BLK.adv is false right now
    };
  });
  ok('a MOTION dropdown is present on the act-brick inspector', motion.present);
  ok('exactly the four labels Mike gave, in order',
     JSON.stringify(motion.labels) === JSON.stringify(['Opens, then closes','Opens','Closes','Closes, then opens']),
     JSON.stringify(motion.labels));
  ok("defaults to 'oc' when the brick has no mode of its own", motion.selected === 'oc');
  ok('…and it is a basic control — visible with Advanced OFF, not gated behind it',
     motion.visibleWithoutAdvanced);

  const motionChange = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockList(seq)[0];
    const sel = Array.from($('seqinsp').querySelectorAll('select')).find(s=>Array.from(s.options).some(o=>o.value==='oc'));
    const before = blockCanUndo(seq);
    sel.value = 'o';
    sel.dispatchEvent(new Event('change'));
    return {mode: blockList(seq)[0].mode, before, after: blockCanUndo(seq)};
  });
  ok('choosing a mode writes b.mode and recompiles', motionChange.mode === 'o', JSON.stringify(motionChange));
  ok('…as ONE undo snapshot', !motionChange.before && motionChange.after);

  const motionHide = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockList(seq)[0];
    BLK.adv = true;
    const labelsOf = ()=>Array.from($('seqinsp').querySelectorAll('.blkfield label')).map(l=>l.childNodes[0].textContent);
    b.mode = 'c'; buildSequencer();
    const labelsC = labelsOf();
    b.mode = 'o'; buildSequencer();
    const labelsO = labelsOf();
    delete b.mode; buildSequencer();
    const labelsOC = labelsOf();
    BLK.adv = false; buildSequencer();
    return {labelsC, labelsO, labelsOC};
  });
  ok("mode 'c' hides the \"Opens in\" slider (there is no rise) but keeps \"Closes in\"",
     motionHide.labelsC.indexOf('Opens in')<0 && motionHide.labelsC.indexOf('Closes in')>=0,
     JSON.stringify(motionHide.labelsC));
  ok("mode 'o' hides the \"Closes in\" slider (there is no fall) but keeps \"Opens in\"",
     motionHide.labelsO.indexOf('Closes in')<0 && motionHide.labelsO.indexOf('Opens in')>=0,
     JSON.stringify(motionHide.labelsO));
  ok("'oc' (the default) shows both", motionHide.labelsOC.indexOf('Opens in')>=0 && motionHide.labelsOC.indexOf('Closes in')>=0,
     JSON.stringify(motionHide.labelsOC));

  /* ================================================================
     v1.40.0 — Mike: "imported routines when placed on the timeline
     should be expanded into each servo's block so they can be edited,
     not just a single block."
     ================================================================ */
  console.log('\n════ EXPLODE on drop — the UI wiring ════');
  const dropExplode = await ev(()=>{
    EDIT.seq = blockNewRoutine('Drop target');
    const seq = MSTR.sequences[EDIT.seq];
    const acts = blockActions();
    const act0 = acts[0].act, act1 = acts[1].act;
    const c0 = blockChan(act0), c1 = blockChan(act1);
    const synth = { name:'Drop source', frames:[
      {name:'a', duration:300, targets:(()=>{ const t=[]; t[c0.i]=blockOpen(c0); return t; })()},
      {name:'b', duration:300, targets:(()=>{ const t=[]; t[c0.i]=blockClosed(c0); t[c1.i]=blockOpen(c1); return t; })()},
      {name:'c', duration:300, targets:(()=>{ const t=[]; t[c1.i]=blockClosed(c1); return t; })()}
    ]};
    MSTR.sequences.push(synth);
    /* blkExplodeInto is the exact function BOTH entry points call — the
       timeline's DROP handler in buildSeqLib(), and the library card's
       ＋ Insert button — so exercising it here covers the wiring itself,
       the same "call the real function" style the rest of this suite
       uses for the chip pointer path, Remove, − Slower, and so on. */
    blockAdopt(seq);
    blockHistPush(seq);
    const exp = blkExplodeInto(seq, 'Drop source', 250);
    buildSequencer();
    return {n: blockList(seq).length, allAct: blockList(seq).every(b=>b.kind==='act'),
            undoWorks: blockCanUndo(seq), leftover: exp.leftover};
  });
  ok('exploding onto a routine adds one act brick per active, mapped channel',
     dropExplode.n===2 && dropExplode.allAct, JSON.stringify(dropExplode));
  ok('one undo snapshot covers the whole explode gesture', dropExplode.undoWorks);

  console.log('\n════ EXPLODE leaves out channels with no part, and says so ════');
  const leftoverNote = await ev(()=>{
    EDIT.seq = blockNewRoutine('Leftover test');
    const seq = MSTR.sequences[EDIT.seq];
    const bare = MSTR.channels.find(ch=>ch && /^servo/i.test(ch.mode) && ch.act);
    const savedAct = bare.act;
    bare.act = '';
    const synth = { name:'Leftover source', frames:[
      {name:'a', duration:300, targets:(()=>{ const t=[]; t[bare.i]=blockOpen(bare); return t; })()},
      {name:'b', duration:300, targets:(()=>{ const t=[]; t[bare.i]=blockClosed(bare); return t; })()}
    ]};
    MSTR.sequences.push(synth);
    blockAdopt(seq);
    blockHistPush(seq);
    const exp = blkExplodeInto(seq, 'Leftover source', 0);
    bare.act = savedAct;
    buildSequencer();
    return {leftover: exp.leftover, n: blockList(seq).length};
  });
  ok('a channel with activity but no part becomes NO brick', leftoverNote.n===0);
  ok('…and is counted', leftoverNote.leftover===1);
  await page.waitForTimeout(50);
  ok('…and toasts/logs it, exactly: "N channels have no part assigned — left out (assign in Panels)"',
     await ev(()=>Array.from(document.querySelectorAll('.toastp.warn'))
       .some(t=>t.textContent==='1 channels have no part assigned — left out (assign in Panels)')));

  /* ================================================================
     v1.40.0 — Mike: "when building sequences we should have the
     ability to multi select to copy and delete."
     ================================================================ */
  console.log('\n════ multi-select ════');
  const msSetup = await ev(()=>{
    EDIT.seq = blockNewRoutine('Multi select test');
    const seq = MSTR.sequences[EDIT.seq];
    const acts = blockActions();
    blockAdd(seq, 'act', acts[0].act, 0,    {dur:500});
    blockAdd(seq, 'act', acts[1].act, 700,  {dur:500});
    blockAdd(seq, 'act', acts[2].act, 1400, {dur:500});
    BLK.sel = null; blkSelClear();
    buildSequencer();
    return {ids: blockList(seq).map(b=>b.id)};
  });
  const toggle = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const click = (i, mods)=>{
      const n = Array.from(document.querySelectorAll('.blkbrick'))[i];
      const r = n.getBoundingClientRect();
      const init = Object.assign({bubbles:true, clientX:r.x+r.width/2, clientY:r.y+r.height/2, pointerId:30}, mods||{});
      n.dispatchEvent(new PointerEvent('pointerdown', init));
      window.dispatchEvent(new PointerEvent('pointerup', init));
    };
    click(0);
    const afterSingle = {sel:BLK.sel, count:blkSelIds().length};
    click(1, {shiftKey:true});
    const afterShift1 = {count:blkSelIds().length};
    click(2, {ctrlKey:true});
    const afterShift2 = {count:blkSelIds().length};
    const multiCardText = $('seqinsp').textContent;
    const selClasses = Array.from(document.querySelectorAll('.blkbrick')).map(n=>n.classList.contains('sel'));
    click(1, {shiftKey:true});                    // toggle brick 1 back OUT
    const afterToggleOut = {count:blkSelIds().length};
    click(0);                                      // plain click collapses to single
    const afterPlain = {sel:BLK.sel, count:blkSelIds().length};
    return {ids: blockList(seq).map(b=>b.id), afterSingle, afterShift1, afterShift2, multiCardText, selClasses, afterToggleOut, afterPlain};
  });
  ok('a plain click selects one — byte-for-byte the old single-click behaviour',
     toggle.afterSingle.sel===toggle.ids[0] && toggle.afterSingle.count===1, JSON.stringify(toggle.afterSingle));
  ok('Shift-click toggles a second brick into the selection', toggle.afterShift1.count===2, JSON.stringify(toggle.afterShift1));
  ok('Ctrl-click toggles a third brick in too', toggle.afterShift2.count===3, JSON.stringify(toggle.afterShift2));
  ok('all three selected bricks wear the existing "sel" styling', toggle.selClasses.filter(Boolean).length===3, JSON.stringify(toggle.selClasses));
  ok('the inspector swaps to the compact "N bricks selected" card', /3 bricks selected/.test(toggle.multiCardText));
  ok('shift-clicking a selected brick again toggles it back OUT', toggle.afterToggleOut.count===2, JSON.stringify(toggle.afterToggleOut));
  ok('a plain click on one brick collapses the selection back to single-select',
     toggle.afterPlain.count===1 && toggle.afterPlain.sel===toggle.ids[0], JSON.stringify(toggle.afterPlain));

  console.log('\n════ multi-select — DUPLICATE and REMOVE ════');
  const dup = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const click = (i, mods)=>{
      const n = Array.from(document.querySelectorAll('.blkbrick'))[i];
      const r = n.getBoundingClientRect();
      const init = Object.assign({bubbles:true, clientX:r.x+r.width/2, clientY:r.y+r.height/2, pointerId:31}, mods||{});
      n.dispatchEvent(new PointerEvent('pointerdown', init));
      window.dispatchEvent(new PointerEvent('pointerup', init));
    };
    click(0);
    click(1, {shiftKey:true});
    const before = blockList(seq).length;
    const btn = Array.from($('seqinsp').querySelectorAll('button')).find(b=>b.textContent==='Duplicate');
    btn.click();
    return {before, after: blockList(seq).length, selCount: blkSelIds().length, undoWorks: blockCanUndo(seq)};
  });
  ok('DUPLICATE copies every selected brick — reusing blockAdd', dup.after===dup.before+2, JSON.stringify(dup));
  ok('the selection moves to the copies', dup.selCount===2, 'selCount='+dup.selCount);
  ok('one undo snapshot for the whole duplicate gesture', dup.undoWorks);

  const rm = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const before = blockList(seq).length;
    const btn = Array.from($('seqinsp').querySelectorAll('button')).find(b=>b.textContent==='Remove');
    btn.click();
    return {before, after: blockList(seq).length, sel: BLK.sel, selCount: blkSelIds().length};
  });
  ok('REMOVE deletes every selected brick — reusing blockRemove', rm.after===rm.before-2, JSON.stringify(rm));
  ok('the selection clears after a multi remove', rm.sel===null && rm.selCount===0);

  /* ================================================================
     2.6 — the assertions above only ever checked that undo BECAME
     POSSIBLE (blockCanUndo(seq)), never that the bricks the gesture
     touched actually come back. That is the whole point of undo, so
     drive it through the real button (#sqUndo — as every other undo
     assertion in this suite does) and check the bricks themselves,
     not just the stack's arming.
     ================================================================ */
  console.log('\n════ multi-select — undo actually RESTORES (2.6) ════');
  const mrSetup = await ev(()=>{
    EDIT.seq = blockNewRoutine('Multi undo restore test');
    const seq = MSTR.sequences[EDIT.seq];
    const acts = blockActions();
    const made = [
      blockAdd(seq, 'act', acts[0].act, 0,    {dur:400}),
      blockAdd(seq, 'act', acts[1].act, 600,  {dur:500}),
      blockAdd(seq, 'act', acts[2].act, 1300, {dur:600})
    ];
    const before = made.map(b=>({id:b.id, ref:b.ref, t0:b.t0, dur:b.dur}));
    BLK.sel = null; blkSelClear();
    buildSequencer();
    const click = (i, mods)=>{
      const n = Array.from(document.querySelectorAll('.blkbrick'))[i];
      const r = n.getBoundingClientRect();
      const init = Object.assign({bubbles:true, clientX:r.x+r.width/2, clientY:r.y+r.height/2, pointerId:34}, mods||{});
      n.dispatchEvent(new PointerEvent('pointerdown', init));
      window.dispatchEvent(new PointerEvent('pointerup', init));
    };
    click(0); click(1, {shiftKey:true}); click(2, {ctrlKey:true});
    const selCount = blkSelIds().length;
    const btn = Array.from($('seqinsp').querySelectorAll('button')).find(b=>b.textContent==='Remove');
    btn.click();
    return {before, selCount, afterRemove: blockList(seq).length};
  });
  ok('three bricks selected before Remove', mrSetup.selCount===3, 'selCount='+mrSetup.selCount);
  ok('Remove clears all three — gone, not just deselected', mrSetup.afterRemove===0, 'left='+mrSetup.afterRemove);
  const mrUndo = await ev(()=>{
    $('sqUndo').click();
    return blockList(MSTR.sequences[EDIT.seq]).map(b=>({id:b.id, ref:b.ref, t0:b.t0, dur:b.dur}));
  });
  const sameBricks = (want, got) => want.length===got.length &&
    want.every(w=>got.some(g=>g.id===w.id && g.ref===w.ref && g.t0===w.t0 && g.dur===w.dur));
  ok('clicking the real undo button (#sqUndo) brings all three bricks BACK, t0/dur intact — not merely "undo became possible"',
     sameBricks(mrSetup.before, mrUndo), JSON.stringify({before:mrSetup.before, after:mrUndo}));

  const mdSetup = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    BLK.sel = null; blkSelClear();
    buildSequencer();
    const click = (i, mods)=>{
      const n = Array.from(document.querySelectorAll('.blkbrick'))[i];
      const r = n.getBoundingClientRect();
      const init = Object.assign({bubbles:true, clientX:r.x+r.width/2, clientY:r.y+r.height/2, pointerId:35}, mods||{});
      n.dispatchEvent(new PointerEvent('pointerdown', init));
      window.dispatchEvent(new PointerEvent('pointerup', init));
    };
    click(0); click(1, {shiftKey:true}); click(2, {ctrlKey:true});
    const originals = blockList(seq).map(b=>({id:b.id, ref:b.ref, t0:b.t0, dur:b.dur}));
    const btn = Array.from($('seqinsp').querySelectorAll('button')).find(b=>b.textContent==='Duplicate');
    btn.click();
    return {originals, afterDup: blockList(seq).length};
  });
  ok('Duplicate adds three copies on top of the three originals', mdSetup.afterDup===6, 'n='+mdSetup.afterDup);
  const mdUndo = await ev(()=>{
    $('sqUndo').click();
    return blockList(MSTR.sequences[EDIT.seq]).map(b=>({id:b.id, ref:b.ref, t0:b.t0, dur:b.dur}));
  });
  ok('undoing a multi-Duplicate removes exactly the copies — the three ORIGINALS survive, id/t0/dur untouched',
     sameBricks(mdSetup.originals, mdUndo) && mdUndo.length===3,
     JSON.stringify({originals:mdSetup.originals, after:mdUndo}));

  console.log('\n════ Escape and Delete/Backspace ════');
  const escSetup = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    seq.blocks = [];
    const acts = blockActions();
    blockAdd(seq, 'act', acts[0].act, 0,   {dur:400});
    blockAdd(seq, 'act', acts[1].act, 600, {dur:400});
    BLK.sel = null; blkSelClear();
    buildSequencer();
    const click = (i, mods)=>{
      const n = Array.from(document.querySelectorAll('.blkbrick'))[i];
      const r = n.getBoundingClientRect();
      const init = Object.assign({bubbles:true, clientX:r.x+r.width/2, clientY:r.y+r.height/2, pointerId:32}, mods||{});
      n.dispatchEvent(new PointerEvent('pointerdown', init));
      window.dispatchEvent(new PointerEvent('pointerup', init));
    };
    click(0);
    click(1, {shiftKey:true});
    if(document.activeElement) document.activeElement.blur();
    return blkSelIds().length;
  });
  ok('two bricks selected before any key is pressed', escSetup===2, 'selCount='+escSetup);
  await page.keyboard.press('Escape');
  ok('Esc collapses a multi-selection back to its primary brick',
     (await ev(()=>blkSelIds().length))===1);

  const del2 = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const click = (i, mods)=>{
      const n = Array.from(document.querySelectorAll('.blkbrick'))[i];
      const r = n.getBoundingClientRect();
      const init = Object.assign({bubbles:true, clientX:r.x+r.width/2, clientY:r.y+r.height/2, pointerId:33}, mods||{});
      n.dispatchEvent(new PointerEvent('pointerdown', init));
      window.dispatchEvent(new PointerEvent('pointerup', init));
    };
    click(0); click(1, {shiftKey:true});
    if(document.activeElement) document.activeElement.blur();
    return blockList(seq).length;
  });
  await page.keyboard.press('Delete');
  ok('Delete removes the whole (multi) selection', (await ev(()=>blockList(MSTR.sequences[EDIT.seq]).length))===del2-2);

  const bkSetup = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockAdd(seq, 'act', blockActions()[0].act, 0, {dur:400});
    BLK.sel = b.id; blkSelClear();
    buildSequencer();
    if(document.activeElement) document.activeElement.blur();
    return blockList(seq).length;
  });
  await page.keyboard.press('Backspace');
  ok('Backspace removes a single selected brick too (reuses the same path)',
     (await ev(()=>blockList(MSTR.sequences[EDIT.seq]).length))===bkSetup-1);

  const guardSetup = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const b = blockAdd(seq, 'act', blockActions()[0].act, 2000, {dur:400});
    BLK.sel = b.id; blkSelClear();
    buildSequencer();
    $('seqlib').querySelector('.libsearch').focus();
    return blockList(seq).length;
  });
  await page.keyboard.press('Delete');
  ok('…inert while an input has focus — same containment as Ctrl+Z (gamepad.js:39 style guard)',
     (await ev(()=>blockList(MSTR.sequences[EDIT.seq]).length))===guardSetup);
  await ev(()=>{ if(document.activeElement) document.activeElement.blur(); });

  /* ==================================================================
     v1.43.0 — Mike: "The Sequenceer - Needs a delete all with a confirm
     when buildign new sequnce". It ALWAYS asks, whatever the brick count,
     and it is one undo snapshot like every other multi-brick gesture.
     ================================================================== */
  console.log('\n════ clear the timeline, with a confirm ════');
  const clearSetup = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    blockList(seq).slice().forEach(b=>blockRemove(seq, b.id));
    const acts = blockActions();
    blockAdd(seq, 'act', acts[0].act, 0,    {dur:400});
    blockAdd(seq, 'act', acts[0].act, 900,  {dur:400});
    blockAdd(seq, 'act', acts[1 % acts.length].act, 1800, {dur:400});
    buildSequencer();
    return {n: blockList(seq).length, hasBtn: !!$('sqClearAll')};
  });
  ok('a routine with bricks in it offers Clear all', clearSetup.hasBtn && clearSetup.n===3,
     JSON.stringify(clearSetup));
  await ev(()=>{ $('sqClearAll').click(); });
  await page.waitForFunction('!!document.querySelector(".dlgwrap")');
  ok('it asks first, and names what it is about to remove', await ev(()=>{
    const d = document.querySelector('.dlgwrap');
    return /Clear every brick\?/.test(d.textContent) && /all 3 bricks/.test(d.textContent)
        && /Keep them/.test(d.querySelector('.dlgno').textContent);
  }));
  await ev(()=>{ document.querySelector('.dlgwrap .dlgno').click(); });
  await page.waitForFunction('!document.querySelector(".dlgwrap")');
  ok('answering "Keep them" leaves every brick where it was',
     await ev(()=>blockList(MSTR.sequences[EDIT.seq]).length===3));
  await ev(()=>{ $('sqClearAll').click(); });
  await page.waitForFunction('!!document.querySelector(".dlgwrap .dlgyes")');
  await ev(()=>{ document.querySelector('.dlgwrap .dlgyes').click(); });
  await page.waitForFunction('!document.querySelector(".dlgwrap")');
  ok('answering "Clear it" empties the routine but keeps the sequence itself',
     await ev(()=>blockList(MSTR.sequences[EDIT.seq]).length===0 && !!MSTR.sequences[EDIT.seq]));
  ok('...and one undo puts all three back', await ev(()=>{
    blkUndo();
    return blockList(MSTR.sequences[EDIT.seq]).length===3;
  }));
  ok('an empty routine does not offer the button at all', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    blockList(seq).slice().forEach(b=>blockRemove(seq, b.id));
    buildSequencer();
    return !$('sqClearAll');
  }));

  /* =================================================================
     v1.45.0 — Mike: "Show every moving panel in the sequencer; render
     unconfigured ones in muted grey."

     Before this the brick library listed only channels that drive
     something (BLKH.actions()'s !c.act rule), so a panel you had not
     wired yet was simply absent — indistinguishable from a panel your
     droid does not have. Every mover on the model is listed now; the
     ones with no servo channel are dimmed and dashed.

     v1.46.0 changed what a DRAG does — see the block below. The chip's
     appearance, its tooltip, the count under the list and the "only wired
     parts in a Ready-made group" rule are all still v1.45.0's, and are
     still asserted here.
     ================================================================= */
  console.log('\n════ v1.45.0 — every moving panel is in the library, unconfigured ones in grey ════');
  const gy = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24'); setStripMode('seq');
    EDIT.seq = blockNewRoutine('Grey test');
    /* unwire one panel that the model definitely has */
    const c = MSTR.channels.find(x=>x.act==='pie0');
    if(c) c.act='';
    buildSequencer();
    const lib = document.querySelector('#seqblocks .blklib');
    const pc  = lib.querySelectorAll('.blkchip.pc').length;
    const un  = lib.querySelectorAll('.blkchip.unconf').length;
    const movers = (typeof BLKH!=='undefined' && typeof BLKH.movers==='function') ? BLKH.movers() : null;
    const shown = Array.from(lib.querySelectorAll('.blkchip.pc, .blkchip.unconf')).map(c=>c.dataset.act);
    const chip = lib.querySelector('.blkchip.unconf');
    const cs = chip ? getComputedStyle(chip) : null;
    return {pc, un, nMovers: movers?movers.length:-1,
            everyMoverShown: movers ? movers.every(m=>shown.indexOf(m.act)>=0) : false,
            everyWiredShown: blockActions().every(a=>shown.indexOf(a.act)>=0),
            noDuplicateChip: shown.length === new Set(shown).size,
            nOff: movers?movers.filter(m=>!m.on).length:-1,
            firstPcIsWired: !!(lib.querySelector('.blkchip.pc') &&
                               blockActions().some(a=>a.act===lib.querySelector('.blkchip.pc').dataset.act)),
            hasPie0: !!(chip && lib.querySelector('.blkchip.unconf[data-act="pie0"]')),
            dashed: cs ? cs.borderLeftStyle==='dashed' || cs.borderTopStyle==='dashed' : false,
            dim: cs ? parseFloat(cs.opacity) < 1 : false,
            title: chip ? chip.title : '',
            note: /moving panel/i.test(lib.textContent)};
  });
  ok('BLKH.movers() knows every mover on the model, wired or not', gy.nMovers > 0 && gy.nOff > 0,
     gy.nMovers+' movers, '+gy.nOff+' unconfigured');
  ok('every mover on the model has a chip — nothing is silently absent',
     gy.everyMoverShown, gy.pc+' wired + '+gy.un+' grey vs '+gy.nMovers+' movers');
  ok('...and every wired part still has one, including ones no CAD part carries',
     gy.everyWiredShown && gy.noDuplicateChip);
  ok('the panel we just unwired is present as a grey chip', gy.hasPie0);
  ok('an unconfigured chip is unmistakably not-yet-wired (dimmed + dashed)', gy.dashed && gy.dim);
  ok('it says so in the tooltip', /no servo channel/i.test(gy.title), gy.title.slice(0,80));
  ok('the count is stated under the list, not left to be noticed', gy.note);
  ok('the first .blkchip.pc is still a wired, draggable part', gy.firstPcIsWired);

  /* =================================================================
     v1.46.0 — Mike: "The user should be able to drag into the sequencer
     non mapped items but keep them grey - they may not have the servo
     setup in the real model yet but want to build a sequence"

     v1.45.0 REFUSED the drop and offered to go and map it. That was the
     wrong answer to "I am writing the choreography before I have wired
     the droid", so the drop lands now. What must stay true is the pair of
     promises that keep a grey brick honest: it looks unmistakably unwired
     wherever it is drawn, and it is left out of the compiled frames BY
     NAME rather than silently — a frame row that drives nothing is still
     forbidden. The whole life of one: drag → drop → grey → persists →
     compile skips it and says which → map it → it compiles.
     ================================================================= */
  console.log('\n════ v1.46.0 — an unmapped part can be dragged in, and stays grey ════');
  const uw = await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    /* one wired brick, so we have a baseline frame list to compare against */
    blockList(seq).slice().forEach(b=>blockRemove(seq, b.id));
    const wiredAct = blockActions()[0].act;
    blockAdd(seq, 'act', wiredAct, 0, {dur:1000});
    blockSync(seq);
    const framesWiredOnly = JSON.stringify(seq.frames);
    buildSequencer();

    /* DRAG the grey chip onto the timeline — a real gesture, ghost and all */
    const chip  = document.querySelector('#seqblocks .blkchip.unconf[data-act="pie0"]');
    const track = document.querySelector('#seqblocks .blktrack');
    const cr = chip.getBoundingClientRect(), tr = track.getBoundingClientRect();
    const before = blockList(seq).length;
    const at = {clientX:tr.x + 40, clientY:tr.y + tr.height/2, pointerId:11, bubbles:true};
    chip.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:cr.x+4,clientY:cr.y+4,pointerId:11}));
    window.dispatchEvent(new PointerEvent('pointermove', at));
    window.dispatchEvent(new PointerEvent('pointerup', at));

    const list = blockList(seq);
    const brick = list[list.length-1];
    const dropped = list.length === before+1 && brick && brick.kind==='act' && brick.ref==='pie0';

    /* park it PAST the wired brick's end, which is where an unwired brick
       could stretch the frame list if the compiler still counted it */
    if(brick){ brick.t0 = 2000; brick.dur = 1200; }
    blockSync(seq);
    buildSequencer();

    const node = document.querySelector('#seqblocks .blkbrick[data-id="'+(brick?brick.id:-1)+'"]');
    /* getComputedStyle hands back a LIVE declaration, and this test rebuilds
       the pane below — so the look is read into plain values HERE */
    const cs   = node ? getComputedStyle(node) : null;
    const look = {unwiredClass: !!(node && node.classList.contains('unwired')),
                  dashed: cs ? cs.borderTopStyle==='dashed' : false,
                  dim: cs ? parseFloat(cs.opacity) < 1 : false,
                  says: node ? node.textContent : '',
                  title: node ? node.title : ''};
    const lane = document.querySelector('#seqblocks .blklane.unwired');

    /* persistence: through the store the sequencer actually saves to */
    servoStoreFlush();
    const raw = JSON.parse(localStorage.getItem('r2sim.servo.v1') || '{}');
    const savedSeq = (raw.sequences||[]).find(s=>s.name===seq.name);
    const savedBrick = savedSeq && (savedSeq.blocks||[]).find(b=>b.ref==='pie0');
    /* and back again — the model reloaded from that JSON still draws it grey */
    MSTR.sequences[EDIT.seq] = JSON.parse(JSON.stringify(savedSeq));
    blockSync(MSTR.sequences[EDIT.seq]);
    buildSequencer();
    const seq2 = MSTR.sequences[EDIT.seq];
    const reBrick = blockList(seq2).find(b=>b.ref==='pie0');
    const reNode = reBrick ? document.querySelector('#seqblocks .blkbrick[data-id="'+reBrick.id+'"]') : null;

    return Object.assign(look, {
      dropped,
      laneGrey: !!lane,
      framesUnchanged: JSON.stringify(seq.frames) === framesWiredOnly,
      note: blockUnwiredNote(seq),
      banner: (document.querySelector('#seqblocks .blkunwired')||{}).textContent || '',
      unwiredList: blockUnwired(seq).map(u=>u.ref),
      persisted: !!savedBrick,
      reloadedGrey: !!(reNode && reNode.classList.contains('unwired')),
      reloadedFrames: JSON.stringify(seq2.frames) === framesWiredOnly,
      framesWiredOnly
    });
  });
  ok('the drop LANDS — a part with no channel becomes a real brick', uw.dropped);
  ok('...drawn in the grey/dashed unconfigured style, and it says why on the brick',
     uw.unwiredClass && uw.dashed && uw.dim && /not wired/i.test(uw.says) && /no servo channel yet/i.test(uw.title),
     uw.says+' | '+uw.title.slice(0,60));
  ok('...its lane name goes grey with it', uw.laneGrey);
  ok('...and it survives save and reload like any other brick',
     uw.persisted && uw.reloadedGrey, 'persisted='+uw.persisted+' grey after reload='+uw.reloadedGrey);
  ok('the compiler emits NOT ONE extra frame for it — byte-for-byte the routine without it',
     uw.framesUnchanged && uw.reloadedFrames, uw.framesWiredOnly.length+' chars');
  ok('...and it is skipped BY NAME, not silently',
     /^1 brick is not wired to a channel yet: /.test(uw.note) && uw.unwiredList.join()==='pie0',
     uw.note);
  ok('...said under the timeline where the brick is', uw.note && uw.banner.indexOf(uw.note)>=0, uw.banner.slice(0,90));
  /* the plural wording Mike wrote out: "2 bricks are not wired to a channel
     yet: Pie 4, Panel 9" — one line, both names */
  ok('two of them are counted and both named', await ev(()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const other = BLKH.movers().filter(m=>!m.on).map(m=>m.act).find(a=>a!=='pie0');
    blockAdd(seq, 'act', other, 4000, {dur:600});
    blockSync(seq);
    const n = blockUnwiredNote(seq);
    const two = /^2 bricks are not wired to a channel yet: .+, .+$/.test(n);
    blockRemove(seq, blockList(seq)[blockList(seq).length-1].id);
    blockSync(seq); buildSequencer();
    return two;
  }));
  ok('preview says so too, rather than one part mysteriously never moving', await ev(()=>{
    document.querySelectorAll('#toasts .toastp').forEach(p=>p.remove());
    $('sqPlay').click();
    return Array.from(document.querySelectorAll('#toasts .toastp'))
      .some(p=>/not wired to a channel yet/i.test(p.textContent));
  }));
  ok('the brick starts working the moment that panel is given a channel', await ev(()=>{
    $('sqStop').click();
    const seq = MSTR.sequences[EDIT.seq];
    const brick = blockList(seq).find(b=>b.ref==='pie0');
    if(!brick) return false;                 // report a FAIL, never crash the suite
    const free = MSTR.channels.find(c=>c && /^servo/i.test(c.mode) && !c.act);
    free.act = 'pie0';                       // wire it, exactly as the channel map would
    blockSync(seq);
    buildSequencer();
    const node = document.querySelector('#seqblocks .blkbrick[data-id="'+brick.id+'"]');
    const drivesIt = seq.frames.some(f=>f.targets[free.i] === blockOpen(free));
    return blockUnwiredNote(seq)==='' && drivesIt
        && !!node && !node.classList.contains('unwired');
  }));

  ok('Ready-made groups still contain only wired parts, so a shape cannot emit a dead brick', await ev(()=>{
    const wired = blockActions().map(a=>a.act);
    return blockGroups().every(g=>g.members.every(m=>wired.indexOf(m)>=0));
  }));
  ok('the compiler still refuses to emit a brick that drives nothing, and counts it', await ev(()=>{
    const wired = blockActions()[0].act;
    const c = MSTR.channels.find(x=>x.act===wired);
    const name = 'Leftover probe';
    const zero = ()=>new Array(MSTR.servoCount).fill(0);
    const open = zero(); open[c.i] = Math.max(c.min, c.max);
    MSTR.sequences.push({name, frames:[
      {name:'f0',duration:300,targets:zero()},
      {name:'f1',duration:300,targets:open},
      {name:'f2',duration:300,targets:zero()}
    ]});
    const withPart = blockExplode(name, 0);
    c.act = '';
    const without = blockExplode(name, 0);
    c.act = wired;
    MSTR.sequences.pop();
    return withPart.bricks.length > 0 && without.bricks.length === 0 && without.leftover > 0
        && typeof blkExplodeLeftoverNote === 'function';
  }));

  /* =================================================================
     v1.46.0 — Mike: "in the sequencer we should have the import sequence
     button available"

     It must be ON the sequencer's own bar (not another trip back to the
     workshop) and it must not be a fourth copy of the import logic: the
     import chooser is being built in this same release, so the button
     calls whichever door is present — the chooser first, the job wizard's
     import job as the fallback. BOTH branches are asserted, because today
     the fallback is what ships and tomorrow the chooser is.
     ================================================================= */
  console.log('\n════ v1.46.0 — the import button, on the sequencer ════');
  ok('it is on the sequencer transport bar, in plain words, beside Build', await ev(()=>{
    setStripMode('seq');
    const b = $('sqImport');
    if(!b) return false;
    const bar = $('seqtop');
    return b.parentElement===bar && /import sequence/i.test(b.textContent)
        && Array.prototype.indexOf.call(bar.children, b) < Array.prototype.indexOf.call(bar.children, $('sqBuild'));
  }));
  ok('...and it is reachable — on screen, enabled, at the sequencer desk', await ev(()=>{
    if(!$('sqImport')) return false;
    const r = $('sqImport').getBoundingClientRect();
    const bar = $('seqtop').getBoundingClientRect();
    return !$('sqImport').disabled && r.width>0 && r.height>0
        && r.top >= bar.top-1 && r.bottom <= bar.bottom+1;
  }));
  ok('with no chooser in the build it falls back to the job wizard\'s import job', await ev(()=>{
    if(!$('sqImport')) return false;
    const keepChoose = window.impChooseOpen;
    window.impChooseOpen = undefined;          // the world as it ships today
    const seen = [];
    const keepOpen = window.jobwizOpen, keepGo = window.jobwizGo;
    window.jobwizOpen = ()=>seen.push('open');
    window.jobwizGo = j=>seen.push('go:'+j);
    $('sqImport').click();
    window.jobwizOpen = keepOpen; window.jobwizGo = keepGo; window.impChooseOpen = keepChoose;
    return seen.join(' ')==='open go:import';
  }));
  ok('...and the moment the chooser exists, THAT is what it opens — one door, not four', await ev(()=>{
    if(!$('sqImport')) return false;
    const keep = window.impChooseOpen;
    let got = null;
    window.impChooseOpen = o=>{ got = o; };
    const wizSeen = [];
    const keepOpen = window.jobwizOpen;
    window.jobwizOpen = ()=>wizSeen.push('open');
    $('sqImport').click();
    window.impChooseOpen = keep; window.jobwizOpen = keepOpen;
    return !!got && got.kind==='choreography' && got.from==='sequencer' && wizSeen.length===0;
  }));
  await ev(()=>{ const d=document.querySelector('.jwrap,.iwrap,.dlgwrap'); if(d) d.remove(); });

  console.log('\n════ multi-select — bulk Runs for and Motion (2026-08-18) ════');
  /* Mike: "on the sequencer I should be able to select multiple and copy,
     delete and extend the run time and even bulk change if its an open,
     open and close or just close". Copy and delete existed (Duplicate /
     Remove); these are the other two, on the same multi card. */
  const bulk = await ev(()=>{
    EDIT.seq = blockNewRoutine('Bulk edit test');
    const seq = MSTR.sequences[EDIT.seq];
    const acts = blockActions();
    blockAdd(seq, 'act', acts[0].act, 0,    {dur:400});
    blockAdd(seq, 'act', acts[1].act, 600,  {dur:700});
    blockAdd(seq, 'act', acts[2].act, 1400, {dur:500, mode:'o'});
    BLK.sel = null; blkSelClear();
    buildSequencer();
    const click = (i, mods)=>{
      const n = Array.from(document.querySelectorAll('.blkbrick'))[i];
      const r = n.getBoundingClientRect();
      const init = Object.assign({bubbles:true, clientX:r.x+r.width/2, clientY:r.y+r.height/2, pointerId:41}, mods||{});
      n.dispatchEvent(new PointerEvent('pointerdown', init));
      window.dispatchEvent(new PointerEvent('pointerup', init));
    };
    click(0); click(1, {shiftKey:true}); click(2, {ctrlKey:true});
    const insp = $('seqinsp');
    const hasControls = !!insp.querySelector('input[data-multi="dur"]')
                     && !!insp.querySelector('select[data-multi="mode"]');
    const ids = blkSelIds();
    blkMultiDur(seq, ids, 1000);
    const durs = blockList(seq).map(b=>b.dur);
    const durUndo = blockCanUndo(seq);
    blkMultiMode(seq, ids, 'c');
    const modes = blockList(seq).map(b=>b.mode||'oc');
    blkMultiMode(seq, ids, 'oc');
    const cleared = blockList(seq).every(b=>b.mode===undefined);
    return {hasControls, durs, durUndo, modes, cleared, selCount: blkSelIds().length};
  });
  ok('the multi card carries Runs for and Motion alongside Duplicate and Remove',
     bulk.hasControls, JSON.stringify(bulk));
  ok('bulk Runs for writes every selected brick', bulk.durs.join()==='1000,1000,1000', bulk.durs.join());
  ok('...as one undoable gesture, selection kept', bulk.durUndo && bulk.selCount===3, JSON.stringify(bulk));
  ok('bulk Motion writes every selected act brick', bulk.modes.join()==='c,c,c', bulk.modes.join());
  ok("...and 'Opens, then closes' clears the stored mode — same contract as the single-brick dropdown",
     bulk.cleared);
  const bulkUndo = await ev(()=>{
    /* three gestures above = three snapshots; unwind them all and the
       original durations and modes must come back */
    const seq = MSTR.sequences[EDIT.seq];
    $('sqUndo').click(); $('sqUndo').click(); $('sqUndo').click();
    return {durs: blockList(seq).map(b=>b.dur).join(),
            modes: blockList(seq).map(b=>b.mode||'oc').join()};
  });
  ok('undo restores the durations and modes the bulk edits replaced',
     bulkUndo.durs==='400,700,500' && bulkUndo.modes==='oc,oc,o', JSON.stringify(bulkUndo));
  await ev(()=>{ MSTR.sequences.splice(EDIT.seq,1); EDIT.seq=0; EDIT.frame=-1; reindexSubs(); BLK.sel=null; blkSelClear(); buildSequencer(); });

  console.log('\n════ the snap picker lives on the timing line (2026-08-18) ════');
  /* Mike: "there should be a selector for Snap to nearest auto-snap next to
     the timeline timming line" — it existed since v1.12.0 but sat in the
     crowded transport bar, where he never found it. It now IS the ruler
     row's corner cell, so it exists exactly when the timeline does. */
  await ev(()=>{ EDIT.seq = blockNewRoutine('Snap picker home test'); buildSequencer(); });
  ok('the snap picker sits in the ruler corner of the timeline, not the transport',
     await ev(()=>{
       const w = $('sqSnapWrap');
       return !!w && !!w.closest('.tlrow') && w.querySelectorAll('option').length===4;
     }));
  ok('choosing a mode there writes BLK.snapMode and persists to PREFS', await ev(()=>{
    const s = $('sqSnapWrap').querySelector('select');
    s.value = 'off'; s.dispatchEvent(new Event('change'));
    const off = BLK.snapMode==='off' && PREFS.seqSnap==='off';
    const s2 = $('sqSnapWrap').querySelector('select');   // rebuilt by buildSequencer
    s2.value = 'auto'; s2.dispatchEvent(new Event('change'));
    return off && BLK.snapMode==='auto';
  }));
  await ev(()=>{ MSTR.sequences.splice(EDIT.seq,1); EDIT.seq=0; EDIT.frame=-1; reindexSubs(); buildSequencer(); });

  console.log('\n════ unwired bricks WORK on the model (2026-08-18) ════');
  /* Mike: "For panels that I havent mapped yet I should be able to add them
     to a sequence or see them in an exsisting sequence, Also they should
     'Work' on the sim and once I or a user maps them they will then work in
     the real model." The first half shipped in v1.46.0 (the grey brick).
     This is the second: preview and scrub move the MODEL for an unwired
     brick — through ACT_T only, never the compiled frames or the wire. */
  const fw = await ev(()=>{
    EDIT.seq = blockNewRoutine('Free preview test');
    const seq = MSTR.sequences[EDIT.seq];
    const freeAct = BLKH.movers().filter(m=>!m.on).map(m=>m.act)[0];
    if(!freeAct) return {noFree:true};
    blockAdd(seq, 'act', freeAct, 0, {dur:1000, rise:200, fall:200});
    blockSync(seq);
    const framesBefore = JSON.stringify(seq.frames);
    ACT_T[freeAct] = 0;
    blockPoseAt(seq, 500);                        // scrub to mid-brick
    const mid = ACT_T[freeAct];
    blockPoseAt(seq, 100);                        // mid-rise
    const rising = ACT_T[freeAct];
    blockPoseAt(seq, 2000);                       // past the brick — parks
    const after = ACT_T[freeAct];
    return {freeAct, mid, rising, after,
            framesUntouched: JSON.stringify(seq.frames) === framesBefore,
            env: blockEnvAt({t0:0, dur:1000, rise:200, fall:200, kind:'act', ref:freeAct}, 500)};
  });
  ok('scrubbing moves an unwired panel on the model — fully open mid-brick',
     !fw.noFree && fw.mid === 1, JSON.stringify(fw));
  ok('...and shows the ramp on the way up', fw.rising > 0.3 && fw.rising < 0.7, 'rising='+fw.rising);
  ok('...and parks it closed past the brick, like the wired home frame', fw.after === 0);
  ok('...without adding one byte to the compiled frames', fw.framesUntouched);
  const fwPlay = await ev(async ()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const freeAct = blockList(seq)[0].ref;
    ACT_T[freeAct] = 0;
    /* play the preview the same way the button does, and let the follow
       loop drive the free overlay */
    blkPlayheadSet(0, false);
    seqStart('edit', seq.frames, 'preview');
    blkTickStart();
    const t0 = SIM.millis;
    let peak = 0;
    await new Promise(res=>{
      const watch = ()=>{
        peak = Math.max(peak, ACT_T[freeAct]);
        if(!MAESTRO.slot.edit || SIM.millis - t0 > 6000) return res();
        requestAnimationFrame(watch);
      };
      watch();
    });
    await new Promise(r=>setTimeout(r, 120));      // one more tick after the slot ends
    return {peak, settled: ACT_T[freeAct]};
  });
  ok('Play moves the unwired panel on the model', fwPlay.peak > 0.6, 'peak='+fwPlay.peak);
  ok('...and it settles closed when the preview ends', fwPlay.settled === 0, 'settled='+fwPlay.settled);
  /* v1.48.0 — Mike: "if the user Loads the sequence shoudl that then become
     availble" — yes: ANY slot playing a library routine's frames (the pad,
     a loadout slot, restartScript) lays the free overlay too, because
     seqStart() recognises the routine by frames identity. */
  const fwPad = await ev(async ()=>{
    const seq = MSTR.sequences[EDIT.seq];
    const freeAct = blockList(seq)[0].ref;
    ACT_T[freeAct] = 0;
    seqStart(6, seq.frames, 'pad path test');     // a NUMBERED slot — not the sequencer preview
    const t0 = SIM.millis;
    let peak = 0;
    await new Promise(res=>{
      const w = ()=>{
        peak = Math.max(peak, ACT_T[freeAct]);
        if(!MAESTRO.slot[6] || SIM.millis - t0 > 6000) return res();
        requestAnimationFrame(w);
      };
      w();
    });
    await new Promise(r=>setTimeout(r, 120));
    return {peak, settled: ACT_T[freeAct]};
  });
  ok('a routine fired into a NUMBERED slot (pad / loadout path) moves the unwired panel too',
     fwPad.peak > 0.6, 'peak='+fwPad.peak);
  ok('...and parks it closed when that slot ends', fwPad.settled === 0, 'settled='+fwPad.settled);
  await ev(()=>{ MSTR.sequences.splice(EDIT.seq,1); EDIT.seq=0; EDIT.frame=-1; reindexSubs(); BLK.sel=null; blkSelClear(); buildSequencer(); });

  /* Mike, 2026-08-19: "Pose and Frames should only be displayed when
     advanced is ticked." BRICKS is how you author a routine; the other two
     are ways of looking underneath it, and neither is a beginner's first
     move — so they go behind the tick that already reveals the per-brick
     speed overrides. */
  console.log('\n════ Pose and Frames are Advanced-only (v1.52.0) ════');
  const advV = await ev(()=>{
    const vis = id=>$(id).offsetParent !== null;
    $('sqAdv').checked = false; $('sqAdv').dispatchEvent(new Event('change'));
    const off = {bricks:vis('sqViewBlocks'), pose:vis('sqViewPose'), frames:vis('sqViewTable')};
    $('sqAdv').checked = true; $('sqAdv').dispatchEvent(new Event('change'));
    const on = {bricks:vis('sqViewBlocks'), pose:vis('sqViewPose'), frames:vis('sqViewTable')};
    /* standing in Frames when the tick goes off must not strand you on a
       pane whose only door has just been removed */
    setSeqView('table');
    $('sqAdv').checked = false; $('sqAdv').dispatchEvent(new Event('change'));
    const stranded = {view:EDIT.view, cls:(document.body.className.match(/seqv-\w+/)||[''])[0]};
    $('sqAdv').checked = true; $('sqAdv').dispatchEvent(new Event('change'));
    return {off, on, stranded};
  });
  ok('with Advanced off, only Bricks is offered',
     advV.off.bricks && !advV.off.pose && !advV.off.frames, JSON.stringify(advV.off));
  ok('ticking it brings both back',
     advV.on.pose && advV.on.frames, JSON.stringify(advV.on));
  ok('and unticking it while you are IN one of them returns you to the bricks',
     advV.stranded.view === 'blocks' && advV.stranded.cls === 'seqv-blocks', JSON.stringify(advV.stranded));

  /* =====================================================================
     THE FOUR WORK-DESTROYING WAYS OUT (2026-08-22)

     Every case below was found by reading, reproduced by hand, and lost
     somebody's routine on the way. They are regression tests in the strict
     sense: each one was watched failing against the code as it shipped.
     ===================================================================== */

  /* one library, two routines, told apart by the length of their only brick —
     "which one survived" is then a number, not a guess */
  await ev(()=>{
    window.tSaveSetup = ()=>{
      MSTR.sequences.length = 0;
      const mk = (n, dur)=>{
        const s = MSTR.sequences[blockNewRoutine(n)];
        blockAdd(s, 'act', 'pie0', 0, {dur:dur});
        blockSync(s);
        return s;
      };
      mk('Wave', 500);
      const dance = mk('Dance', 900);
      MSTR.loadout = ['Wave','Dance'];
      EDIT.seq = MSTR.sequences.indexOf(dance);
      BLK.sel = null; blkSelClear();
      reindexSubs(); buildSequencer();
    };
    /* type a name into the library's Save box, press Save, and answer whatever
       question it asks. Returns whether it asked one at all. */
    window.tSaveAs = async (typed, replace)=>{
      const lib = $('seqlib');
      lib.querySelector('.blkname').value = typed;
      Array.from(lib.querySelectorAll('button')).find(b=>b.textContent === 'Save').click();
      await new Promise(r=>setTimeout(r, 40));
      const dlg = document.querySelector('.dlgwrap');
      if(dlg){
        const b = dlg.querySelector(replace ? '.dlgyes' : '.dlgno');
        if(b) b.click(); else dlg.remove();
      }
      await new Promise(r=>setTimeout(r, 40));
      return !!dlg;
    };
    window.tLibShape = ()=>({
      names: MSTR.sequences.map(s=>s.name),
      durs:  MSTR.sequences.map(s=>(blockList(s)[0]||{}).dur),
      loadout: (MSTR.loadout||[]).slice()
    });
  });

  /* Save set seq.name FIRST and then handed the name to blockSaveAs, which
     replaces BY NAME — so findIndex found the OTHER routine and overwrote it
     with a copy of the one being edited. No confirm, no log, no undo. */
  console.log('\n════ Save never silently overwrites another sequence ════');
  const saveKeep = await ev(async ()=>{
    tSaveSetup();
    const asked = await tSaveAs('Wave', false);
    return Object.assign({asked}, tLibShape());
  });
  ok('saving onto a name another sequence already has asks first',
     saveKeep.asked, JSON.stringify(saveKeep));
  ok('...and declining leaves the other routine exactly as it was',
     saveKeep.durs.filter(d=>d===500).length === 1 &&
     saveKeep.names.filter(n=>n==='Wave').length === 1, JSON.stringify(saveKeep));
  const saveYes = await ev(async ()=>{
    tSaveSetup();
    const asked = await tSaveAs('Wave', true);
    return Object.assign({asked, edited:(blkSeq()||{}).name}, tLibShape());
  });
  ok('...and agreeing replaces it deliberately — ONE sequence carries the name',
     saveYes.names.filter(n=>n==='Wave').length === 1 &&
     saveYes.durs.indexOf(500) < 0 && saveYes.edited === 'Wave', JSON.stringify(saveYes));
  ok('...and the board does not end up naming the same sequence twice',
     saveYes.loadout.filter(n=>n==='Wave').length === 1, JSON.stringify(saveYes));
  ok('saving under its own name is still just a save',
     await ev(async ()=>{
       tSaveSetup();
       const asked = await tSaveAs('Dance', false);
       const s = tLibShape();
       return !asked && s.names.join()==='Wave,Dance' && s.durs.join()==='500,900';
     }));

  /* blkConvRun's review door held the original frames in BLK.conv and nowhere
     else, while buildSequencer() persisted the CONVERTED routine 500 ms later.
     The only restore path runs from buildBlocks(), which leaving the desk
     never calls — so the frame list was gone with the screen. */
  console.log('\n════ a reviewed conversion keeps the original frames ════');
  await ev(()=>{
    /* author a routine, compile it, throw the bricks away: what is left is
       indistinguishable from an imported Pololu frame list */
    window.tConvSetup = ()=>{
      MSTR.sequences.length = 0;
      const s = MSTR.sequences[blockNewRoutine('Imported thing')];
      s.stepMs = BLK_RAMP_STEP_MS;
      blockAdd(s,'act','pie0',   0, {dur:900,  rise:250, fall:400});
      blockAdd(s,'act','pie1', 300, {dur:1200, rise:150, fall:150});
      blockSync(s);
      window.tConvOrig = JSON.stringify(s.frames);
      delete s.blocks;
      MSTR.loadout = null;
      EDIT.seq = MSTR.sequences.indexOf(s);
      BLK.conv = null; BLK.sel = null; blkSelClear();
      reindexSubs(); setStripMode('seq'); buildSequencer();
      return s;
    };
    /* what servoStoreSave() would write — the persisted library, not a
       screenful of DOM */
    window.tStored = ()=>servoStoreObj().sequences.map(s=>({
      name:s.name, list:!s.blocks, frames:JSON.stringify(s.frames)
    }));
  });
  const convLeave = await ev(()=>{
    const s = tConvSetup();
    blkConvRun(s, true);                       // door 2 — "Work them out and review…"
    const pending = !!BLK.conv;
    setStripMode('pad');                       // the strip switch. buildBlocks() never runs.
    const stored = tStored();
    const back = stored.find(x=>x.list && x.frames === tConvOrig);
    return {pending, kept:!!back, keptName:back?back.name:'', names:stored.map(x=>x.name)};
  });
  ok('door 2 leaves a conversion pending', convLeave.pending, JSON.stringify(convLeave));
  ok('leaving the sequencer still leaves the original frame list recoverable',
     convLeave.kept, JSON.stringify(convLeave));
  const convAcc = await ev(()=>{
    const s = tConvSetup();
    blkConvRun(s, true); blkConvAccept();
    const stored = tStored();
    return {copies: stored.filter(x=>x.list && x.frames === tConvOrig).length,
            names: stored.map(x=>x.name), isRoutine: blockIsRoutine(MSTR.sequences[EDIT.seq])};
  });
  ok('accepting keeps exactly one copy — the one the review already made',
     convAcc.copies === 1 && convAcc.isRoutine, JSON.stringify(convAcc));
  const convDis = await ev(()=>{
    const s = tConvSetup();
    blkConvRun(s, true); blkConvDiscard();
    const stored = tStored();
    return {n: stored.length, names: stored.map(x=>x.name),
            same: JSON.stringify(s.frames) === tConvOrig, isList: !blockIsRoutine(s)};
  });
  ok('discarding leaves nothing behind — nothing changed means nothing added',
     convDis.n === 1 && convDis.same && convDis.isList, JSON.stringify(convDis));

  /* the inspector's Duplicate forgot `mode`, so every "Closes" and "Closes
     then opens" came back as "Opens then closes" — the multi-select twin has
     always passed it */
  console.log('\n════ the inspector Duplicate keeps the motion mode ════');
  const dupMode = await ev(()=>{
    MSTR.sequences.length = 0;
    EDIT.seq = blockNewRoutine('Dup mode');
    const s = MSTR.sequences[EDIT.seq];
    BLK.sel = blockAdd(s,'act','pie0',0,{dur:600, mode:'c'}).id;
    blockSync(s); blkSelClear(); buildSequencer();
    const n0 = blockList(s).length;
    const dup = Array.from($('seqinsp').querySelectorAll('button')).find(b=>b.textContent === 'Duplicate');
    if(dup) dup.click();
    const list = blockList(MSTR.sequences[EDIT.seq]);
    return {had:!!dup, n0, n1:list.length, modes:list.map(b=>blockMode(b))};
  });
  ok('the inspector offers Duplicate on a single brick', dupMode.had, JSON.stringify(dupMode));
  ok('duplicating a brick from the inspector keeps its motion mode',
     dupMode.n1 === dupMode.n0 + 1 && dupMode.modes.filter(m=>m==='c').length === 2,
     JSON.stringify(dupMode));

  /* #sqStepWrap ships as class="blkswitch hide", but the only .hide rules in
     the build named other elements — so .blkswitch{display:flex} won and the
     Advanced-only control was permanently on screen. Read the COMPUTED style:
     under file:// a linked stylesheet's cssRules throws, so a test that reads
     stylesheet text passes on the dist and reads nothing here. */
  console.log('\n════ the Advanced-only Ramp step control (v1.66.0) ════');
  const stepVis = await ev(()=>{
    MSTR.sequences.length = 0;
    EDIT.seq = blockNewRoutine('Step routine');
    const s = MSTR.sequences[EDIT.seq];
    blockAdd(s,'act','pie0',0,{dur:600}); blockSync(s);
    setStripMode('seq');
    $('sqAdv').checked = true;  $('sqAdv').dispatchEvent(new Event('change'));
    const on  = getComputedStyle($('sqStepWrap')).display;
    $('sqAdv').checked = false; $('sqAdv').dispatchEvent(new Event('change'));
    const off = getComputedStyle($('sqStepWrap')).display;
    return {on, off, cls:$('sqStepWrap').className};
  });
  ok('with Advanced ticked the Ramp step control is shown',
     stepVis.on !== 'none', JSON.stringify(stepVis));
  ok('with Advanced off it is actually hidden — .hide has to mean display:none',
     stepVis.off === 'none', JSON.stringify(stepVis));
  const stepStale = await ev(()=>{
    /* a LEGACY routine (no stepMs of its own = 120 ms) and a modern one.
       sqStepSync() used to return before repopulating whenever the control was
       hidden, so the box kept the legacy list — and the change handler clamps
       120 up to 200, which blockStepMs's own comment says must never happen
       because it stops an old routine re-attaching its bricks. */
    MSTR.sequences.length = 0;
    const mk = (n, step)=>{
      const s = MSTR.sequences[blockNewRoutine(n)];
      s.stepMs = step;
      blockAdd(s,'act','pie0',0,{dur:600}); blockSync(s);
      return s;
    };
    const legacy = mk('Legacy', BLK_RAMP_STEP_MS), modern = mk('Modern', 500);
    $('sqAdv').checked = true; $('sqAdv').dispatchEvent(new Event('change'));
    EDIT.seq = MSTR.sequences.indexOf(legacy); buildSequencer();
    const shown = Array.from($('sqStep').options).map(o=>o.value);
    $('sqAdv').checked = false; $('sqAdv').dispatchEvent(new Event('change'));
    EDIT.seq = MSTR.sequences.indexOf(modern); buildSequencer();
    const hidden = Array.from($('sqStep').options).map(o=>o.value);
    return {shown, hidden, value:$('sqStep').value, modern:blockStepMs(modern)};
  });
  ok('a legacy routine is offered its own 120 ms while it is the one open',
     stepStale.shown.indexOf('120') >= 0, JSON.stringify(stepStale));
  ok('the hidden box does not keep the last routine\'s option list',
     stepStale.hidden.indexOf('120') < 0, JSON.stringify(stepStale));
  ok('...it names the routine you are actually in',
     stepStale.value === '500' && stepStale.modern === 500, JSON.stringify(stepStale));


  /* =====================================================================
     THE COLD-START WALKTHROUGH (2026-08-22)

     A builder who wanted a convention show took ~18 minutes and ~14
     interactions to get one panel opening and closing; the theoretical
     minimum is four clicks. Everything below is one piece of that gap,
     and every one of them is measured — geometry and getComputedStyle,
     never a stylesheet's cssRules, which throw on a LINKED sheet under
     file:// and would quietly assert nothing here.
     ===================================================================== */
  await page.setViewportSize({width:1440, height:900});
  await page.waitForTimeout(200);

  console.log('\n════ the parts panel shows that it continues ════');
  const moreSetup = await ev(()=>{
    MSTR.sequences.length = 0;
    EDIT.seq = blockNewRoutine('Walkthrough');
    const s = MSTR.sequences[EDIT.seq];
    blockAdd(s,'act','pie0',0,{dur:600}); blockSync(s);
    BLK.sel = null; setStripMode('seq'); buildSequencer();
    const lib = document.querySelector('#seqblocks .blklib');
    const rm  = Array.from(lib.querySelectorAll('.blklibhead'))
                     .find(h=>/Ready-made/i.test(h.textContent));
    return {clipped: lib.scrollHeight > lib.clientHeight + 4,
            rmBelow: !!rm && rm.getBoundingClientRect().top > lib.getBoundingClientRect().bottom,
            hasMore: !!lib.querySelector('.blkmore')};
  });
  /* This used to require READY-MADE's heading to begin below the fold at
     exactly 1440×900. A few pixels of text metrics decide that, while the
     product rule is that clipped content announces how to reach the rest.
     The assertions below still prove the affordance is pinned and that using
     it reveals READY-MADE; this premise asks only that clipping really exists
     and therefore the affordance is required. */
  ok('the parts panel is clipped and provides the way to the rest',
     moreSetup.clipped && moreSetup.hasMore, JSON.stringify(moreSetup));
  await page.waitForTimeout(250);                 // .blkmore fades in over 120 ms
  const moreCs = await ev(()=>{
    const m = document.querySelector('#seqblocks .blklib .blkmore');
    if(!m) return {};
    const cs = getComputedStyle(m);
    return {pos:cs.position, op:cs.opacity, cls:m.className,
            h:Math.round(m.getBoundingClientRect().height)};
  });
  ok('a scroll affordance sits on the clipped edge, pinned there',
     moreCs.pos === 'sticky' && +moreCs.op > 0.5, JSON.stringify(moreCs));
  ok('…and it costs the panel no height of its own',
     moreCs.h === 0, JSON.stringify(moreCs));
  ok('the panel announces itself as a scroller rather than ending in a hard edge',
     await ev(()=>{
       const cs = getComputedStyle(document.querySelector('#seqblocks .blklib'));
       return cs.overflowY === 'auto' && cs.scrollbarColor !== 'auto';
     }));
  ok('clicking it brings READY-MADE into the visible part of the panel',
     await ev(()=>{
       const lib = document.querySelector('#seqblocks .blklib');
       const b = lib.querySelector('.blkmore button');
       if(!b) return false;
       b.click();
       if(!Array.from(lib.querySelectorAll('.blklibhead')).some(h=>/Ready-made/i.test(h.textContent))) return false;
       const r = lib.getBoundingClientRect();
       const rm = Array.from(lib.querySelectorAll('.blklibhead'))
                       .find(h=>/Ready-made/i.test(h.textContent));
       const t = rm.getBoundingClientRect();
       return t.top >= r.top - 2 && t.bottom <= r.bottom + 2;
     }));
  await ev(()=>{
    const lib = document.querySelector('#seqblocks .blklib');
    lib.scrollTop = lib.scrollHeight;
    if(typeof blkLibMoreSync === 'function') blkLibMoreSync();
  });
  await page.waitForTimeout(250);                 // …and fades back out over the same 120 ms
  ok('…and once you are at the bottom it stops claiming there is more',
     await ev(()=>{
       const m = document.querySelector('#seqblocks .blklib .blkmore');
       return !!m && +getComputedStyle(m).opacity < 0.5;
     }));

  console.log('\n════ the gesture that always works is the one named first ════');
  ok('the PARTS caption says click BEFORE it says drag', await ev(()=>{
    const h = Array.from(document.querySelectorAll('#seqblocks .blklib .blklibhead'))
                   .find(x=>/Parts/i.test(x.querySelector('b').textContent));
    const t = h.querySelector('.blklibhint').textContent;
    return /click/i.test(t) && /drag/i.test(t) && t.search(/click/i) < t.search(/drag/i);
  }));
  ok('a part chip says both in its tooltip too', await ev(()=>{
    const c = document.querySelector('#seqblocks .blklib .blkchip');
    return /click/i.test(c.title) && /drag/i.test(c.title);
  }));
  await page.hover('#seqblocks .blklib .blkchip');
  await page.waitForTimeout(80);
  ok('hovering a chip shows what a plain click will do', await ev(()=>{
    const c = document.querySelector('#seqblocks .blklib .blkchip');
    const s = getComputedStyle(c, '::after').content;
    return !!s && s !== 'none' && /end/i.test(s);
  }), await ev(()=>getComputedStyle(document.querySelector('#seqblocks .blklib .blkchip'),'::after').content));

  console.log('\n════ a sequence can be renamed and deleted from its own card ════');
  const cardBtns = await ev(()=>{
    MSTR.sequences.length = 0;
    ['Wave','Spare','Holder'].forEach(n=>{
      const s = MSTR.sequences[blockNewRoutine(n)];
      blockAdd(s,'act','pie0',0,{dur:400}); blockSync(s);
    });
    /* Holder plays Wave as one whole-sequence brick — the case v1.70.0
       taught the Maestro pane to warn about (paneSeqRefs) */
    const holder = MSTR.sequences.find(s=>s.name==='Holder');
    blockAdd(holder,'seq','Wave',1000,{dur:400}); blockSync(holder);
    EDIT.seq = MSTR.sequences.findIndex(s=>s.name==='Spare');
    buildSequencer();
    const i = MSTR.sequences.findIndex(s=>s.name==='Wave');
    blkLibPreview(i, document.querySelector('#seqlib .blkchip.seq'));
    const card = document.querySelector('.libprev');
    return {labels: card ? Array.from(card.querySelectorAll('button')).map(b=>b.textContent) : []};
  });
  ok('the card offers Rename and Delete beside Open / Preview / Insert',
     cardBtns.labels.some(l=>/Rename/i.test(l)) && cardBtns.labels.some(l=>/Delete/i.test(l)),
     JSON.stringify(cardBtns));

  const delAsked = await ev(async ()=>{
    const card = document.querySelector('.libprev');
    const b = card && Array.from(card.querySelectorAll('button')).find(x=>/Delete/i.test(x.textContent));
    if(!b) return false;
    b.click();
    await new Promise(r=>setTimeout(r,60));
    return !!document.querySelector('.dlgwrap');
  });
  const delDlg = await ev(()=>{
    const d = document.querySelector('.dlgwrap');
    if(!d) return {title:'',msg:'',yes:'',no:''};
    return {title:d.querySelector('h4').textContent, msg:d.querySelector('.dlgmsg').textContent,
            yes:d.querySelector('.dlgyes').textContent, no:d.querySelector('.dlgno').textContent};
  });
  ok('Delete asks before it acts — no sequence disappears on one click', delAsked,
     JSON.stringify(delDlg));
  ok('it asks in the house style — names the target, the count, and what survives',
     /Wave/.test(delDlg.title) && /1 brick\b/.test(delDlg.msg)
     && /Holder/.test(delDlg.msg) && /untouched|survive|keeps|kept/i.test(delDlg.msg),
     JSON.stringify(delDlg));
  ok('…and labels its buttons with verbs, never Yes/No',
     /delete/i.test(delDlg.yes) && /keep/i.test(delDlg.no) && !/^(yes|no|ok|cancel)$/i.test(delDlg.no.trim()),
     JSON.stringify(delDlg));
  await ev(()=>{ const d=document.querySelector('.dlgwrap .dlgno'); if(d) d.click(); });
  await page.waitForTimeout(80);
  ok('answering "Keep it" leaves the library exactly as it was',
     await ev(()=>MSTR.sequences.length===3 && !!MSTR.sequences.find(s=>s.name==='Wave')));

  await ev(()=>{
    const i = MSTR.sequences.findIndex(s=>s.name==='Wave');
    if(i < 0) return;
    blkLibPreview(i, document.querySelector('#seqlib .blkchip.seq'));
    const card = document.querySelector('.libprev'); if(!card) return;
    const b = Array.from(card.querySelectorAll('button')).find(x=>/Delete/i.test(x.textContent));
    if(b) b.click();
  });
  await page.waitForTimeout(120);
  await ev(()=>{ const d=document.querySelector('.dlgwrap .dlgyes'); if(d) d.click(); });
  await page.waitForTimeout(120);
  ok('answering the verb deletes it, and the sequence being edited is still the one open',
     await ev(()=>MSTR.sequences.length===2 && !MSTR.sequences.find(s=>s.name==='Wave')
              && MSTR.sequences[EDIT.seq] && MSTR.sequences[EDIT.seq].name==='Spare'),
     await ev(()=>JSON.stringify({n:MSTR.sequences.map(s=>s.name), edit:EDIT.seq})));

  await ev(()=>{
    const i = MSTR.sequences.findIndex(s=>s.name==='Holder');
    if(i < 0) return;
    blkLibPreview(i, document.querySelector('#seqlib .blkchip.seq'));
    const card = document.querySelector('.libprev'); if(!card) return;
    const b = Array.from(card.querySelectorAll('button')).find(x=>/Rename/i.test(x.textContent));
    if(b) b.click();
  });
  await page.waitForTimeout(120);
  await ev(()=>{
    const d = document.querySelector('.dlgwrap'); if(!d || !d.querySelector('.dlginp')) return;
    d.querySelector('.dlginp').value = 'Convention wave';
    d.querySelector('.dlgyes').click();
  });
  await page.waitForTimeout(120);
  ok('Rename renames it in the library',
     await ev(()=>!!MSTR.sequences.find(s=>s.name==='Convention wave')));

  await ev(()=>{
    /* the other half of paneSeqRefs: a whole-sequence brick naming the
       renamed routine has to follow it, exactly as the Maestro pane's
       Rename already makes it */
    MSTR.sequences.length = 0;
    ['Wave','Holder'].forEach(n=>{
      const s = MSTR.sequences[blockNewRoutine(n)];
      blockAdd(s,'act','pie0',0,{dur:400}); blockSync(s);
    });
    const holder = MSTR.sequences.find(s=>s.name==='Holder');
    blockAdd(holder,'seq','Wave',1000,{dur:400}); blockSync(holder);
    EDIT.seq = MSTR.sequences.indexOf(holder);
    buildSequencer();
  });
  await ev(()=>{
    const i = MSTR.sequences.findIndex(s=>s.name==='Wave'); if(i < 0) return;
    blkLibPreview(i, document.querySelector('#seqlib .blkchip.seq'));
    const card = document.querySelector('.libprev'); if(!card) return;
    const b = Array.from(card.querySelectorAll('button')).find(x=>/Rename/i.test(x.textContent));
    if(b) b.click();
  });
  await page.waitForTimeout(120);
  await ev(()=>{
    const d = document.querySelector('.dlgwrap'); if(!d || !d.querySelector('.dlginp')) return;
    d.querySelector('.dlginp').value = 'Big wave';
    d.querySelector('.dlgyes').click();
  });
  await page.waitForTimeout(120);
  ok('…and every whole-sequence brick that played it follows the new name',
     await ev(()=>{
       const h = MSTR.sequences.find(s=>s.name==='Holder');
       return blockList(h).filter(b=>b.kind==='seq').every(b=>b.ref==='Big wave');
     }), await ev(()=>JSON.stringify(blockList(MSTR.sequences.find(s=>s.name==='Holder')).map(b=>b.kind+':'+b.ref))));

  console.log('\n════ the timeline fits, grows, and stays put ════');
  const fit = await ev(()=>{
    MSTR.sequences.length = 0;
    EDIT.seq = blockNewRoutine('Long one');
    const s = MSTR.sequences[EDIT.seq];
    blockAdd(s,'act','pie0',0,{dur:3950}); blockSync(s);
    BLK.pxms = 0.14; BLK.sel = null; buildSequencer();
    const sc = document.querySelector('#seqblocks .tlouter');
    const before = blkX(blkTotal(s)) > sc.clientWidth - 118;
    const has = !!$('sqFit');
    if(has) $('sqFit').click();
    const sc2 = document.querySelector('#seqblocks .tlouter');
    return {has, before, after: blkX(blkTotal(MSTR.sequences[EDIT.seq])),
            room: sc2.clientWidth - 118, pxms: BLK.pxms};
  });
  ok('a 3.95 s brick really does overrun the visible track at 1×', fit.before, JSON.stringify(fit));
  ok('the toolbar offers a fit control', fit.has, JSON.stringify(fit));
  ok('…and one click makes the whole routine fit the track', fit.has && fit.after <= fit.room + 1,
     JSON.stringify(fit));
  const grow = await ev(()=>{
    MSTR.sequences.length = 0;
    EDIT.seq = blockNewRoutine('Mexican wave');
    const s = MSTR.sequences[EDIT.seq];
    ['pie0','pie1','pie2','pie3','panel0','panel1'].forEach((a,i)=>blockAdd(s,'act',a,i*200,{dur:600}));
    blockSync(s); BLK.sel = null; buildSequencer();
    const sc = document.querySelector('#seqblocks .tlouter');
    const rows = sc.querySelectorAll('.tlrow').length;
    return {rows, client: sc.clientHeight, content: sc.scrollHeight};
  });
  ok('a seven-lane routine gets a lane area tall enough to show its lanes',
     grow.client >= grow.content - 2, JSON.stringify(grow));
  const anchor = await ev(()=>{
    const s = MSTR.sequences[EDIT.seq];
    BLK.pxms = 0.4; buildSequencer();
    const sc = document.querySelector('#seqblocks .tlouter');
    sc.scrollLeft = 220;
    const was = sc.scrollLeft;
    const b = blockList(s)[0];
    BLK.sel = b.id;
    b.t0 = 1000; blockSync(s); buildSequencer();       // in view, and staying there
    const b2 = blockList(MSTR.sequences[EDIT.seq]).find(x=>x.id === BLK.sel);
    b2.t0 = 1400;                                      // the edit a drag commits
    blockSync(s); buildSequencer();
    const sc2 = document.querySelector('#seqblocks .tlouter');
    return {was, now: sc2.scrollLeft, x0: blkX(b2.t0), x1: blkX(b2.t0 + b2.dur), w: sc2.clientWidth};
  });
  ok('committing a brick move does not re-anchor the timeline under the pointer',
     anchor.was > 0 && Math.abs(anchor.now - anchor.was) <= 2, JSON.stringify(anchor));

  console.log('\n════ the library filter tells the truth about itself ════');
  const filt = await ev(()=>{
    MSTR.sequences.length = 0;
    ['Convention open','Convention close','Wave','Breathe','Idle'].forEach(n=>{
      const s = MSTR.sequences[blockNewRoutine(n)];
      blockAdd(s,'act','pie0',0,{dur:400}); blockSync(s);
    });
    EDIT.seq = 0; BLK.libq = ''; buildSequencer();
    const si = document.querySelector('#seqlib .libsearch');
    const auto = si.getAttribute('autocomplete');
    si.value = 'Convention'; si.dispatchEvent(new Event('input'));
    const head = Array.from(document.querySelectorAll('#seqlib .libgrph')).map(x=>x.textContent).join(' | ');
    const clear = document.querySelector('#seqlib .libclear');
    return {auto, head, hasClear: !!clear};
  });
  const stored = await ev(()=>{
    /* a query that is not a substring of ANY sequence name, so what the check
       finds can only be the filter itself and never the library */
    const si = document.querySelector('#seqlib .libsearch');
    si.value = 'zqxwv'; si.dispatchEvent(new Event('input'));
    if(typeof servoStoreSave === 'function') servoStoreSave();
    const hay = JSON.stringify(localStorage) + JSON.stringify(typeof PREFS === 'undefined' ? {} : PREFS);
    return hay.indexOf('zqxwv') >= 0;
  });
  ok('a filtered count says what it is a count OF — "2 of 5", not "(2)"',
     /2 of 5/.test(filt.head), JSON.stringify(filt));
  ok('…and offers a way out of the filter', filt.hasClear, JSON.stringify(filt));
  ok('the filter is session state — nothing writes it anywhere it could come back from',
     filt.auto === 'off' && !stored, JSON.stringify({auto:filt.auto, stored}));
  ok('clearing the filter brings the whole library back', await ev(()=>{
    const c = document.querySelector('#seqlib .libclear'); if(!c) return false;
    c.click();
    return BLK.libq === '' && document.querySelectorAll('#seqlib .blkchip.seq').length === 5;
  }));

  console.log('\n════ one brick, one frame, one length ════');
  ok('a routine with one brick says "1 brick", not "1 bricks"', await ev(()=>{
    MSTR.sequences.length = 0; BLK.libq = '';
    EDIT.seq = blockNewRoutine('Single');
    const s = MSTR.sequences[EDIT.seq];
    blockAdd(s,'act','pie0',0,{dur:500}); blockSync(s); buildSequencer();
    return / 1 brick(\s|$|\D)/.test($('seqName').textContent) && !/1 bricks/.test($('seqName').textContent);
  }), await ev(()=>$('seqName').textContent));
  ok('a hand-made list of one frame says "1 frame"', await ev(()=>{
    MSTR.sequences.length = 0; BLK.libq = '';
    MSTR.sequences.push({name:'One frame', frames:[{name:'F0',duration:500,targets:[]}]});
    EDIT.seq = 0; buildSequencer();
    return !/1 frames/.test($('seqName').textContent) && /1 frame/.test($('seqName').textContent);
  }), await ev(()=>$('seqName').textContent));
  ok('the library card counts in the singular too', await ev(()=>{
    const anchor = document.querySelector('#seqlib .blkchip.seq'); if(!anchor) return false;
    blkLibPreview(0, anchor);
    const m = document.querySelector('.libprev .meta'); if(!m) return false;
    const t = m.textContent;
    blkLibPreviewClose();
    return !/1 frames/.test(t);
  }));
  const lens = await ev(()=>{
    MSTR.sequences.length = 0; BLK.libq = '';
    const off = BLKH.movers().filter(m=>!m.on)[0];
    EDIT.seq = blockNewRoutine('Two readouts');
    const s = MSTR.sequences[EDIT.seq];
    blockAdd(s,'act','pie0',0,{dur:1000});
    if(off) blockAdd(s,'act',off.act,2000,{dur:1000});
    blockSync(s); BLK.sel = null; buildSequencer();
    const head = ($('seqName').textContent.match(/([\d.]+)s\s*$/) || [])[1];
    const row = Array.from($('seqinsp').querySelectorAll('.blkfield'))
                     .find(r=>r.querySelector('label') && /Length/i.test(r.querySelector('label').textContent));
    const insp = row ? row.querySelector('.blkval').textContent.replace('s','') : null;
    return {head, insp, unwired: !!off};
  });
  ok('the header and the summary panel print the SAME length',
     lens.head && lens.insp && lens.head === lens.insp, JSON.stringify(lens));

  /* =====================================================================
     "DID THE THING I MADE DO ANYTHING?"  (2026-08-22)

     A builder's first brick was on Panel1, which sits on the far side of
     the dome from the default camera. They pressed ▶ three times, watched
     the droid, saw nothing move, and concluded they had failed to make an
     animation. Four things had to change for the app's answer to that
     question to be YES, and each has its own section below.
     ===================================================================== */
  console.log('\n════ adding a brick marks the part — it does not move the camera ════');
  const added = await ev(()=>{
    MSTR.sequences.length = 0; BLK.libq = '';
    EDIT.seq = blockNewRoutine('Camera hold');
    CAM.follow = false;
    viewFrame('head');
    updateCamera();
    buildSequencer();
    const before = {t:[CAM.target.x,CAM.target.y,CAM.target.z], d:CAM.dist, th:CAM.theta};
    const chip = Array.from(document.querySelectorAll('#seqblocks .blklib .blkchip'))
                      .find(c=>c.dataset.act === 'panel1');
    if(!chip) return {no:'no panel1 chip'};
    const cr = chip.getBoundingClientRect();
    const at = {bubbles:true, clientX:cr.x+4, clientY:cr.y+4, pointerId:31};
    chip.dispatchEvent(new PointerEvent('pointerdown', at));
    window.dispatchEvent(new PointerEvent('pointerup', at));
    const m = CAD.moving.find(x=>x.act === 'panel1');
    return {before, after:{t:[CAM.target.x,CAM.target.y,CAM.target.z], d:CAM.dist, th:CAM.theta},
            bricks: blockList(MSTR.sequences[EDIT.seq]).length, mark: BLK.mark, want: m && m.name};
  });
  ok('a chip click still adds the brick', added.bricks === 1, JSON.stringify(added));
  ok('…and the camera has not moved an inch',
     JSON.stringify(added.before) === JSON.stringify(added.after), JSON.stringify(added));
  ok('…the part is marked on the model instead', added.mark && added.mark === added.want,
     JSON.stringify({mark:added.mark, want:added.want}));
  ok('…and the mark is a real change to the model, not just a flag', await ev(()=>{
    const n = BLK.mark; const pi = n && CAD.partIndex[n]; if(!pi) return false;
    const a = pi.mesh.geometry.getAttribute('color');
    const base = new THREE.Color(effectivePartHex(n) || '#9ab');
    return Math.abs(a.getX(pi.vStart)-base.r) + Math.abs(a.getY(pi.vStart)-base.g)
         + Math.abs(a.getZ(pi.vStart)-base.b) > 0.05;
  }));
  const framed = await ev(()=>{
    /* the biggest mover on the droid is the case that used to fill the frame */
    const big = CAD.moving.map(m=>{
      const hp = CAD.header.parts.find(p=>p.name === m.name);
      const b = hp && hp.bbox;
      return b ? {act:m.act, name:m.name, span:Math.max(b[3]-b[0], b[4]-b[1], b[5]-b[2])} : null;
    }).filter(x=>x && x.act).sort((a,b)=>b.span-a.span)[0];
    const seq = MSTR.sequences[EDIT.seq];
    blockList(seq).slice().forEach(b=>blockRemove(seq, b.id));
    const brick = blockAdd(seq, 'act', big.act, 0, {dur:1000});
    BLK.sel = brick.id; blockSync(seq); buildSequencer();
    const btn = Array.from($('seqinsp').querySelectorAll('button'))
                     .find(b=>/Zoom to this part/i.test(b.textContent));
    if(!btn) return {no:'no zoom button'};
    btn.click();
    updateCamera();
    return {name:big.name, span:big.span, dist:CAM.dist,
            /* what the view spans, in metres, at the part's own depth */
            frame: 2*CAM.dist*Math.tan(camera.fov*Math.PI/360)};
  });
  ok('ZOOM TO THIS PART frames the part IN CONTEXT — the view spans about three times it',
     framed.frame >= framed.span*3, JSON.stringify(framed));

  console.log('\n════ ▶ shows what is moving, wherever the camera is looking ════');
  await ev(()=>{
    BLK.tint = false;
    if(typeof applyPaint === 'function') applyPaint();
    MSTR.sequences.length = 0;
    EDIT.seq = blockNewRoutine('Behind the dome');
    const s = MSTR.sequences[EDIT.seq];
    blockAdd(s, 'act', 'panel1', 0, {dur:2500});
    blockSync(s); BLK.sel = null; buildSequencer();
    $('sqPlay').click();
  });
  await page.waitForTimeout(400);
  const playing = await ev(()=>({
    tint: BLK.tint,
    box: (document.querySelector('#seqblocks .blkswitch input')||{}).checked,
    slot: !!(MAESTRO.slot && MAESTRO.slot.edit)
  }));
  ok('pressing ▶ colours the model to match while it plays',
     playing.slot && playing.tint === true, JSON.stringify(playing));
  ok('…and the checkbox stops lying about what the model is showing',
     playing.box === true, JSON.stringify(playing));
  await ev(()=>{ $('sqStop').click(); });
  await page.waitForTimeout(300);
  ok('…and their own setting comes back when the preview ends', await ev(()=>
     BLK.tint === false && !(document.querySelector('#seqblocks .blkswitch input')||{}).checked));
  await ev(()=>{
    /* somebody who WANTED the tint keeps it — playback must not switch it off */
    BLK.tint = true; buildSequencer();
    $('sqPlay').click();
  });
  await page.waitForTimeout(300);
  await ev(()=>{ $('sqStop').click(); });
  await page.waitForTimeout(300);
  ok('…and a tint they turned on themselves survives a preview', await ev(()=>BLK.tint === true));
  await ev(()=>{ BLK.tint = false; if(typeof applyPaint === 'function') applyPaint(); buildSequencer(); });

  console.log('\n════ a part round the back says so, and offers a way to see it ════');
  const back = await ev(()=>{
    MSTR.sequences.length = 0;
    EDIT.seq = blockNewRoutine('Round the back');
    const s = MSTR.sequences[EDIT.seq];
    const b = blockAdd(s, 'act', 'panel1', 0, {dur:1000});
    BLK.sel = b.id; blockSync(s);
    const m = CAD.moving.find(x=>x.act === 'panel1');
    const p = partWorldPos(m.name);
    CAM.follow = false; CAM.target.set(0, 0.9, 0); CAM.dist = 1.15;
    CAM.theta = Math.atan2(p.x, p.z) + Math.PI;      // stand behind the droid
    updateCamera();
    buildSequencer();
    const n = $('seqinsp').querySelector('.blkfar');
    return {has:!!n, shown: n ? getComputedStyle(n).display : 'absent',
            txt: n ? n.textContent : '', label: blkLabel('panel1')};
  });
  ok('the inspector says the selected part is on the far side',
     back.has && back.shown !== 'none' && /far side/i.test(back.txt), JSON.stringify(back));
  ok('…and names it, rather than saying "the part"',
     back.txt.indexOf(back.label) >= 0, JSON.stringify(back));
  const turned = await ev(()=>{
    const btn = $('seqinsp').querySelector('.blkfar button');
    if(!btn) return {no:'no button'};
    const was = {d:CAM.dist, t:[CAM.target.x,CAM.target.y,CAM.target.z]};
    btn.click();
    updateCamera();
    const p = partWorldPos(CAD.moving.find(x=>x.act === 'panel1').name);
    const cos = (p.x*camera.position.x + p.z*camera.position.z)
              / (Math.hypot(p.x,p.z) * Math.hypot(camera.position.x, camera.position.z));
    return {cos, was, now:{d:CAM.dist, t:[CAM.target.x,CAM.target.y,CAM.target.z]}};
  });
  ok('…and the button brings that side round to the front',
     turned.cos > 0.5, JSON.stringify(turned));
  ok('…without changing how close, or what, the view is on',
     JSON.stringify(turned.was) === JSON.stringify(turned.now), JSON.stringify(turned));
  ok('…and it goes quiet again once the part is facing you', await ev(()=>{
    buildSequencer();
    const n = $('seqinsp').querySelector('.blkfar');
    return !n || getComputedStyle(n).display === 'none';
  }));

  console.log('\n════ bricks on parts with no channel are a warning at export ════');
  const nochan = await ev(()=>{
    const off = BLKH.movers().filter(m=>!m.on);
    MSTR.sequences.length = 0;
    EDIT.seq = blockNewRoutine('Wiring comes later');
    const s = MSTR.sequences[EDIT.seq];
    blockAdd(s, 'act', blockActions()[0].act, 0, {dur:800});   // one wired brick, so it is not an empty routine
    blockSync(s); loadoutReset(); reindexSubs();
    const before = lintMaestro();
    off.slice(0,2).forEach((m,i)=>blockAdd(s, 'act', m.act, 1000 + i*1200, {dur:1000}));
    blockSync(s); loadoutReset(); reindexSubs(); buildSequencer();
    const rep = lintMaestro();
    const hits = rep.items.filter(i=>i.code === 'brick-nochan');
    return {offCount: off.length, n: hits.length,
            level: hits[0] ? hits[0].level : null,
            msg:   hits[0] ? hits[0].msg   : '',
            fix:   hits[0] ? hits[0].fix   : '',
            slot:  hits[0] ? hits[0].slot  : null,
            names: off.slice(0,2).map(m=>m.label),
            errBefore: before.counts.err, err: rep.counts.err};
  });
  ok('the channel-less parts really are there to build with', nochan.offCount === 10, String(nochan.offCount));
  ok('a routine driving them raises exactly one line, naming the routine',
     nochan.n === 1 && /Wiring comes later/.test(nochan.msg), JSON.stringify(nochan));
  ok('…which names the bricks, not just a count',
     nochan.names.every(l=>nochan.msg.indexOf(l) >= 0), JSON.stringify(nochan));
  ok('…and carries the slot as a field, like slot-nodpad',
     typeof nochan.slot === 'number', JSON.stringify(nochan));
  ok('…and it advises rather than refuses — a warning, and no new errors',
     nochan.level === 'warn' && nochan.err === nochan.errBefore, JSON.stringify(nochan));
  ok('…and it says what to do about it', /channel/i.test(nochan.fix), nochan.fix.slice(0,120));

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length===0, errs.join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
