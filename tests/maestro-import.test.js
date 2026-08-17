/* Import-your-config: the parser, the exporter, the part matcher and the
   lint — checked against Mike's REAL Mini Maestro 18 dome file, not a
   fixture invented to pass. Every assertion here corresponds to something
   that actually went wrong on the bench on 2026-07-29. */
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
  await page.goto('file://'+path.resolve(__dirname,'..',process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForTimeout(1800);
  const ev = (f,a) => page.evaluate(f,a);
  await ev(()=>{loadProfile('maestro25');buildFwSelector();});
  await page.waitForTimeout(400);

  console.log('\n════ the three-section frame row ════');
  const row = await ev(()=>{
    const eighteen = Array.from({length:18},(_,i)=>1000+i).join(' ');
    const speeds   = Array.from({length:18},(_,i)=>i).join(' ');
    const accels   = Array.from({length:18},()=>0).join(' ');
    return {
      full: parseFrameRow(eighteen+' s '+speeds+' a '+accels, 18),
      bare: parseFrameRow(eighteen, 18),
      short: parseFrameRow('4000 5000 s 0 0 a 0 0', 4)
    };
  });
  ok('targets stop at the s marker, not at token 18',
     row.full.targets[0]===1000 && row.full.targets[17]===1017 && row.full.targets.length===18);
  ok('the speed section is kept, not swallowed as targets',
     row.full.speeds[3]===3 && row.full.speeds.length===18);
  ok('the acceleration section is kept', row.full.accels.length===18 && row.full.accels[5]===0);
  ok('a bare targets-only row still parses', row.bare.targets[17]===1017 && row.bare.speeds===null);
  ok('a short row is padded to the channel count, not truncated',
     row.short.targets.length===4 && row.short.targets[2]===0, JSON.stringify(row.short.targets));

  console.log('\n════ Printed Droid shorthand ════');
  const g = await ev(()=>({
    pp1:guessPart('PP1'), pp5:guessPart('PP5'), pp6:guessPart('PP6'),
    p2:guessPart('P2'), p11:guessPart('P11'), p13:guessPart('P13'),
    p1fix:guessPart('P1-Fix'),
    hp11:guessPart('HP1-1'), hp12:guessPart('HP1-2'),
    hp21:guessPart('HP2-1'), hp32:guessPart('HP3-2'),
    holo:guessPart('Holoprojector 2 tilt'),
    /* the descriptive names must not be captured by the new short rules */
    pieWord:guessPart('Dome Pie 3'), panelWord:guessPart('Dome Panel 4'),
    door:guessPart('FL Breadpan Door'), util:guessPart('Upper Utility Arm'),
    frik:guessPart('Frik lower lip')
  }));
  ok('PP1/PP5/PP6 → pie panels', g.pp1==='pie0'&&g.pp5==='pie4'&&g.pp6==='pie5', [g.pp1,g.pp5,g.pp6].join(' '));
  ok('P2/P11/P13 → side panels', g.p2==='panel1'&&g.p11==='panel10'&&g.p13==='panel12', [g.p2,g.p11,g.p13].join(' '));
  ok('"P1-Fix" is still P1', g.p1fix==='panel0', g.p1fix);
  ok('HPn-1 is pan, HPn-2 is tilt', g.hp11==='hp1Pan'&&g.hp12==='hp1Tilt'&&g.hp21==='hp2Pan'&&g.hp32==='hp3Tilt',
     [g.hp11,g.hp12,g.hp21,g.hp32].join(' '));
  ok('the spelled-out holoprojector name also matches', g.holo==='hp2Tilt', g.holo);
  ok('descriptive names are untouched by the short rules',
     g.pieWord==='pie2'&&g.panelWord==='panel3'&&g.door==='doorL'&&g.util==='utilUp'&&g.frik==='anzLipL',
     [g.pieWord,g.panelWord,g.door,g.util,g.frik].join(' '));

  console.log('\n════ Mike\'s real 18-channel dome file ════');
  const imp = await ev(t=>{
    parseMstr(t,'live-dome.mstr');
    const servo = MSTR.channels.filter(c=>/^servo/i.test(c.mode));
    return {
      board: MSTR.board, n: MSTR.channels.length,
      mapped: MSTR.channels.filter(c=>c.act).length,
      unmapped: servo.filter(c=>!c.act).map(c=>c.name),
      seq: MSTR.sequences.map(s=>s.name),
      firstTargets: MSTR.sequences[0].frames[0].targets.length,
      ch0: MSTR.channels[0], ch6: MSTR.channels[6].name, ch16: MSTR.channels[16].name,
      report: MSTR.report
    };
  }, LIVE);
  ok('detected as a Mini Maestro 18', imp.board==='mini18' && imp.n===18, imp.board+' / '+imp.n);
  ok('frame targets are 18 wide, not 56', imp.firstTargets===18, String(imp.firstTargets));
  ok('endpoints and speed/accel survive verbatim',
     imp.ch0.min===4544 && imp.ch0.max===7296 && imp.ch0.speed===80 && imp.ch0.acceleration===10 && imp.ch0.homemode==='Off',
     JSON.stringify([imp.ch0.min,imp.ch0.max,imp.ch0.speed,imp.ch0.acceleration,imp.ch0.homemode]));
  ok('all four of his sequences come through', imp.seq.length===4, imp.seq.join(' | '));
  ok('17 of 18 channels now auto-map (ch17 is unnamed)', imp.mapped===17,
     imp.mapped+' mapped, unmapped: '+JSON.stringify(imp.unmapped));

  console.log('\n════ what the file was, before we touched it ════');
  ok('the begin/repeat script is caught', imp.report.scriptLoop===true);
  ok('and it is reported as carrying no sequence subroutine at all',
     imp.report.seqSubs.length===0, JSON.stringify(imp.report.seqSubs));
  ok('the unnamed channel 17 is counted', imp.report.blankNames===1, String(imp.report.blankNames));
  ok('no duplicate names in the corrected file', imp.report.dupNames.length===0, JSON.stringify(imp.report.dupNames));

  const dup = await ev(t=>{ parseMstr(t.replace('name="P13"','name="P11"'),'dup.mstr');
                            return MSTR.report.dupNames; }, LIVE);
  ok('a duplicated channel name IS caught', dup.length===2 && dup.indexOf(6)>=0 && dup.indexOf(16)>=0, JSON.stringify(dup));

  console.log('\n════ the top-level quit ════');
  const scr = await ev(t=>{
    parseMstr(t,'live-dome.mstr');
    reindexSubs();
    const s = genScript(loadoutSeqs(), enabledChannels());
    const tr = scriptTraps(s);
    return {head:s.split('\n').filter(l=>l.trim()&&!/^#/.test(l))[0], tr,
            subIdx: parseScriptSubs(s).slice(0,3).map(x=>x.index+':'+x.name)};
  }, LIVE);
  ok('the generated script opens with a bare quit', scr.head.trim()==='quit', scr.head);
  ok('scriptTraps sees the quit and no loop', scr.tr.hasQuit===true && scr.tr.hasLoop===false);
  ok('quit does NOT shift restartScript numbering — sub 0 is still the first sequence',
     scr.subIdx[0].startsWith('0:') && !/^0:frame_/.test(scr.subIdx[0]), scr.subIdx.join(', '));

  console.log('\n════ export shape and round trip ════');
  const exp = await ev(t=>{
    parseMstr(t,'live-dome.mstr'); reindexSubs();
    const text = buildMstrText();
    const bytes = mstrBytes(text);
    const frame = /<Frame [^>]*>([^<]*)<\/Frame>/.exec(text);
    const before = JSON.stringify(MSTR.sequences);
    parseMstr(text,'roundtrip.mstr');
    return {
      hasSA: / s /.test(frame[1]) && / a /.test(frame[1]),
      tokens: frame[1].trim().split(/\s+/).length,
      useSA: /useSpeedAndAcceleration="(true|false)"/.test(text),
      seqSame: JSON.stringify(MSTR.sequences)===before,
      bom: bytes.charCodeAt(0)===0xFEFF,
      crlfHead: bytes.slice(0,200).indexOf('\r\n')>0,
      lfScript: /return\n<\/Script>/.test(bytes) || /\n\n<\/Script>/.test(bytes),
      trailing: /<\/UscSettings>$/.test(bytes)
    };
  }, LIVE);
  ok('frames export in the targets s speeds a accelerations form', exp.hasSA===true);
  ok('an 18-channel frame row is 56 tokens', exp.tokens===56, String(exp.tokens));
  ok('sequences carry useSpeedAndAcceleration', exp.useSA===true);
  ok('sequences survive an export/import round trip unchanged', exp.seqSame===true);
  ok('download bytes: no BOM', exp.bom===false);
  ok('download bytes: CRLF in the XML structure', exp.crlfHead===true);
  ok('download bytes: bare LF inside the script body', exp.lfScript===true);
  ok('download bytes: no trailing newline after </UscSettings>', exp.trailing===true);

  console.log('\n════ the travel-time model ════');
  const tv = await ev(()=>{
    const c = {min:4544,max:7296,speed:80,acceleration:10,mode:'Servo'};
    return {
      full: Math.round(chanFullThrowMs(c)),
      unlimited: chanTravelMs({min:0,max:8000,speed:0,acceleration:0},4000),
      speedOnly: Math.round(chanTravelMs({speed:80,acceleration:0},2752)),
      zero: chanTravelMs(c,0)
    };
  });
  ok('speed 80 / accel 10 over a 2752 throw is ~940 ms, not the ~344 ms speed alone implies',
     tv.full>900 && tv.full<980, tv.full+' ms');
  ok('speed alone would have said ~344 ms', tv.speedOnly===344, tv.speedOnly+' ms');
  ok('speed 0 and accel 0 means unlimited', tv.unlimited===0);
  ok('a zero-distance move takes no time', tv.zero===0);

  console.log('\n════ the lint ════');
  const lintShort = await ev(t=>{
    parseMstr(t,'live-dome.mstr');
    /* a wave that reverses a channel after 250 ms — exactly the mistake that
       made the first hand-built file look short on the bench */
    const z = new Array(18).fill(0);
    const open = z.slice(); open[0]=7296;
    const shut = z.slice(); shut[0]=4544;
    MSTR.sequences=[{name:'Too Fast',frames:[
      {name:'open',duration:250,targets:open},
      {name:'shut',duration:250,targets:shut},
      {name:'open2',duration:250,targets:open}
    ]}];
    loadoutReset(); reindexSubs();
    const rep = lintMaestro();
    return {timing: rep.items.filter(i=>i.code==='timing'),
            hits: rep.stats.timingHits, slowest: rep.stats.slowestThrowMs};
  }, LIVE);
  ok('a channel reversed before it arrives is flagged', lintShort.timing.length===1 && lintShort.hits===2,
     JSON.stringify({n:lintShort.timing.length,hits:lintShort.hits}));
  ok('and the message names the real travel time', /9\d\d ms travel/.test(lintShort.timing[0].msg||''),
     lintShort.timing[0] ? lintShort.timing[0].msg : '');
  ok('the slowest full throw on this board is reported', lintShort.slowest>1100 && lintShort.slowest<1250,
     lintShort.slowest+' ms');

  const lintOk = await ev(t=>{
    parseMstr(t,'live-dome.mstr');
    const z = new Array(18).fill(0);
    const open = z.slice(); open[0]=7296;
    const shut = z.slice(); shut[0]=4544;
    MSTR.sequences=[{name:'Paced',frames:[
      {name:'open',duration:1200,targets:open},
      {name:'shut',duration:1200,targets:shut}
    ]}];
    loadoutReset(); reindexSubs();
    const rep = lintMaestro();
    return {timing: rep.counts, codes: rep.items.map(i=>i.code)};
  }, LIVE);
  ok('a properly paced sequence raises no timing warning', lintOk.codes.indexOf('timing')<0, lintOk.codes.join(','));

  const lintTraps = await ev(()=>{
    const loop = scriptTraps('# x\nbegin\n  500 6000 frame_0\nrepeat\n\nsub frame_0\n  0 servo\n  delay\n  return\n');
    const fall = scriptTraps('# x\nsub Wave\n  500 6000 frame_0\n  return\n\nsub frame_0\n  0 servo\n  delay\n  return\n');
    const good = scriptTraps('quit\n\nsub Wave\n  500 6000 frame_0\n  return\n');
    return {loop, fall, good};
  });
  ok('begin/repeat with no sequence sub is detected', lintTraps.loop.hasLoop===true && lintTraps.loop.seqSubs.length===0);
  ok('a subroutines-only script is detected as a fall-through risk',
     lintTraps.fall.hasLoop===false && lintTraps.fall.hasQuit===false && lintTraps.fall.seqSubs.length===1);
  ok('a script with quit is clean', lintTraps.good.hasQuit===true && lintTraps.good.hasLoop===false);

  const lintRange = await ev(t=>{
    parseMstr(t,'live-dome.mstr');
    const z=new Array(18).fill(0); z[0]=9999;              // past ch0's 7296 max
    MSTR.sequences=[{name:'Over',frames:[{name:'f',duration:1500,targets:z}]}];
    loadoutReset(); reindexSubs();
    return lintMaestro().items.map(i=>i.code);
  }, LIVE);
  ok('a target past a channel endpoint is an error', lintRange.indexOf('tgt-range')>=0, lintRange.join(','));

  console.log('\n════ the wizard ════');
  const wiz = await ev(t=>{
    parseMstr(t,'live-dome.mstr');
    impwizOpen();
    const host=document.getElementById('impWiz');
    const out={opened:!host.hidden, step:IMPWIZ.step, steps:host.querySelectorAll('.iwstep').length};
    impwizGo(3);
    out.mapRows = host.querySelectorAll('.iwmaprow').length;
    impwizGo(4);
    out.check = host.querySelectorAll('.iwfact').length;
    impwizGo(2);
    out.foundHtml = host.innerHTML;
    impwizClose();
    out.closed = document.getElementById('impWiz').hidden;
    return out;
  }, LIVE);
  ok('the wizard opens straight to Found when a file is already loaded', wiz.opened===true && wiz.step===2);
  ok('it has five steps', wiz.steps===5, String(wiz.steps));
  ok('the map step lists every servo channel', wiz.mapRows===18, String(wiz.mapRows));
  ok('the check step renders its fact grid', wiz.check>=6, String(wiz.check));
  ok('the Found step names the begin/repeat problem', /begin\/repeat/.test(wiz.foundHtml));
  ok('and it explains 0x0080', /0x0080/.test(wiz.foundHtml));
  ok('the wizard closes cleanly', wiz.closed===true);

  console.log('\n════ the top-down dome map ════');
  const geo = await ev(()=>({
    panels: DOME_LAYOUT.panels.length, pies: DOME_LAYOUT.pies.length, holos: DOME_LAYOUT.holos.length,
    dupA: new Set(DOME_LAYOUT.panels.map(p=>p.a)).size,
    keys: {pp5:domePartKey('pie',5), p11:domePartKey('panel',11),
           hp1p:domePartKey('holo',1,'pan'), hp2t:domePartKey('holo',2,'tilt')},
    covers: {pie:domeMapCovers('pie4'), panel:domeMapCovers('panel10'),
             holo:domeMapCovers('hp3Tilt'), door:domeMapCovers('doorL'), none:domeMapCovers('')},
    /* front of the droid points DOWN the screen: FLDs (P12) and front PSI
       (P14) must land in the lower half, the rear logic display (P9) upper */
    p12y: (function(){const p=DOME_LAYOUT.panels.find(x=>x.n===12);return domePolar(100,p.a)[1];})(),
    p14y: (function(){const p=DOME_LAYOUT.panels.find(x=>x.n===14);return domePolar(100,p.a)[1];})(),
    p9y:  (function(){const p=DOME_LAYOUT.panels.find(x=>x.n===9); return domePolar(100,p.a)[1];})()
  }));
  ok('fourteen lower panels, six pies, three holos',
     geo.panels===14 && geo.pies===6 && geo.holos===3, JSON.stringify([geo.panels,geo.pies,geo.holos]));
  ok('no two lower panels share a bearing', geo.dupA===14, String(geo.dupA));
  ok('diagram features resolve to the right actuator keys',
     geo.keys.pp5==='pie4' && geo.keys.p11==='panel10' && geo.keys.hp1p==='hp1Pan' && geo.keys.hp2t==='hp2Tilt',
     JSON.stringify(geo.keys));
  ok('domeMapCovers knows dome parts from body parts',
     geo.covers.pie && geo.covers.panel && geo.covers.holo && !geo.covers.door && !geo.covers.none,
     JSON.stringify(geo.covers));
  ok('the front of the droid is at the bottom — FLDs and front PSI below centre, RLD above',
     geo.p12y>0 && geo.p14y>0 && geo.p9y<0,
     JSON.stringify([geo.p12y.toFixed(0),geo.p14y.toFixed(0),geo.p9y.toFixed(0)]));

  const map = await ev(t=>{
    parseMstr(t,'live-dome.mstr');
    impwizOpen(); impwizGo(3);
    const host=document.getElementById('impWiz');
    const svg=host.querySelector('svg.domemap');
    const out={
      svg: !!svg,
      pies: host.querySelectorAll('.dmpie').length,
      panels: host.querySelectorAll('.dmpanel').length,
      holos: host.querySelectorAll('.dmholo').length,
      /* his file maps 17 of 18, so most of the diagram should read as taken */
      taken: host.querySelectorAll('.dm.has').length,
      litDashed: host.querySelectorAll('.dmpanel.lit').length
    };
    /* click-to-place: clear one channel, select it, click a pie */
    MSTR.channels[2].act='';                 // ch2 is PP1
    IMPWIZ.sel = 2; impwizRender();
    const host2=document.getElementById('impWiz');
    const pie1=Array.from(host2.querySelectorAll('.dmpie')).find(g=>g.querySelector('text').textContent==='PP1');
    pie1.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    out.placed = MSTR.channels[2].act;
    out.advanced = IMPWIZ.sel;
    impwizClose();
    return out;
  }, LIVE);
  ok('the map step draws the dome', map.svg===true);
  ok('every panel, pie and holo is on it',
     map.pies===6 && map.panels===14 && map.holos===3, JSON.stringify([map.pies,map.panels,map.holos]));
  ok('lighting-only panels are drawn dashed', map.litDashed===6, String(map.litDashed));
  ok('mapped features read as taken', map.taken>=10, String(map.taken));
  ok('clicking a pie places the selected channel on it', map.placed==='pie0', map.placed);
  ok('and the selection advances to the next unmapped channel', map.advanced===17, String(map.advanced));

  console.log('\n════ starter files still export cleanly ════');
  const starters = await ev(()=>{
    const out={};
    ['body','dome','anzellan'].forEach(w=>{
      makeStarter(w); reindexSubs();
      const text=buildMstrText();
      const tr=scriptTraps(MSTR.scriptText);
      out[w]={quit:tr.hasQuit, loop:tr.hasLoop, seqSubs:tr.seqSubs.length,
              err:lintMaestro().counts.err, xml:!/parsererror/.test(
                new DOMParser().parseFromString(text,'application/xml').documentElement.nodeName)};
    });
    return out;
  });
  ['body','dome','anzellan'].forEach(w=>{
    ok(w+' starter: quit present, no loop, real sequence subs, valid XML',
       starters[w].quit && !starters[w].loop && starters[w].seqSubs>0 && starters[w].xml,
       JSON.stringify(starters[w]));
  });

  ok('no uncaught page errors', errs.length===0, errs.join(' | '));
  await browser.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
