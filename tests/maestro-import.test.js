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

  /* =================================================================
     v1.45.0 — Mike: "Support importing and converting Maestro and
     PCA9685 configurations, then exporting to either format."

     "A PCA9685 configuration" is the servos.h / sequences.h shape this
     project's own MaestroPCA library defines — i.e. read back exactly
     what pca-gen.js writes. So the sharpest test is a round trip
     through our own generator.
     ================================================================= */
  console.log('\n════ v1.45.0 — a PCA9685 configuration reads back in ════');
  const pcaRt = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24'); reindexSubs();
    const mine = MSTR.channels.filter(c=>/^servo/i.test(c.mode))
      .map(c=>[c.i,c.name,c.min,c.max,c.speed,c.acceleration]);
    const seqBefore = JSON.parse(JSON.stringify(loadoutSeqs()));
    const h = pcaGenFromLoadout();
    if(typeof pcaHeaderParse !== 'function') return {missing:true};
    const P = pcaHeaderParse(h, 'sequences.h');
    const got = P.channels.filter(c=>/^servo/i.test(c.mode))
      .map(c=>[c.i,c.name,c.min,c.max,c.speed,c.acceleration]);
    return {
      sniffH: pcaHeaderLooksLike(h),
      sniffMstr: pcaHeaderLooksLike(buildMstrText()),
      nCh: P.channels.length, nChMine: MSTR.channels.length,
      chSame: JSON.stringify(got)===JSON.stringify(mine),
      nServo: got.length,
      nSeq: P.sequences.length, nSeqMine: seqBefore.length,
      names: P.sequences.map(q=>q.name),
      mineNames: seqBefore.map(q=>q.name),
      framesSame: P.sequences.length===seqBefore.length && P.sequences.every((q,k)=>
        q.frames.length===seqBefore[k].frames.length && q.frames.every((f,j)=>
          f.duration===seqBefore[k].frames[j].duration &&
          JSON.stringify(f.targets)===JSON.stringify(seqBefore[k].frames[j].targets))),
      drops: (P.dropped||[]).map(d=>d.field),
      dropsHaveReasons: (P.dropped||[]).every(d=>!!d.why),
      board: P.board
    };
  });
  ok('the sniffer tells a PCA9685 header from a Maestro .mstr',
     pcaRt.sniffH === true && pcaRt.sniffMstr === false);
  ok('every channel comes back — count and the whole servo table verbatim',
     pcaRt.nCh === pcaRt.nChMine && pcaRt.chSame, pcaRt.nServo+' servo channels of '+pcaRt.nCh);
  ok('the sequences come back with their names, frames and targets intact',
     pcaRt.nSeq === pcaRt.nSeqMine && pcaRt.framesSame,
     pcaRt.nSeq+' of '+pcaRt.nSeqMine+' · '+(pcaRt.names||[]).slice(0,2).join(', '));
  ok('what a PCA9685 header cannot carry is reported BY NAME, never silently dropped',
     ['neutral','range','homemode','invert'].every(f=>(pcaRt.drops||[]).indexOf(f)>=0),
     (pcaRt.drops||[]).join(', '));
  ok('...and every named drop carries a reason', pcaRt.dropsHaveReasons);

  console.log('\n════ v1.45.0 — a PCA9685 config can leave as either family ════');
  const bothWays = await ev(()=>{
    const h = pcaGenFromLoadout();
    const P = pcaHeaderParse(h, 'from-pca.h');
    /* adopt it wholesale: it is now this build's config, with no .mstr
       behind it — so the Maestro export has to be generated from scratch */
    mstrApply(P);
    const xml = buildMstrText();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const again = pcaGenFromLoadout();
    return {
      validXml: doc.documentElement.nodeName === 'UscSettings',
      hasChannels: /<Channel name=/.test(xml),
      hasQuit: /\bquit\b/.test(xml),
      nSeqXml: (xml.match(/<Sequence /g)||[]).length,
      hAgain: again.indexOf('MPCA_CHANNEL_TABLE') >= 0,
      xmlTextNull: !MSTR.xmlText
    };
  });
  ok('a config that arrived as a PCA9685 header exports as a valid .mstr',
     bothWays.validXml && bothWays.hasChannels && bothWays.hasQuit && bothWays.nSeqXml > 0,
     bothWays.nSeqXml+' sequences in the XML');
  ok('...and it had no Pololu file behind it, so the XML was genuinely generated',
     bothWays.xmlTextNull);
  ok('...and it still exports as a PCA9685 header', bothWays.hAgain);

  console.log('\n════ v1.45.0 — the offered accept list and the reader agree ════');
  const acc = await ev(()=>{
    const exts = s=>s.split(',').map(x=>x.trim()).filter(x=>x.charAt(0)==='.');
    buildSet('servoDevice','maestro'); buildSet('servoTopo','m1');
    const mae = servoCfgAccept();
    buildSet('servoDevice','pca'); buildSet('servoTopo','p1x2');
    const pca = servoCfgAccept();
    buildSet('servoDevice','maestro'); buildSet('servoTopo','m1');
    const readable = (typeof servoCfgReadable === 'function') ? servoCfgReadable() : [];
    const offered = exts(mae).concat(exts(pca)).filter((v,i,a)=>a.indexOf(v)===i);
    return {mae, pca, offered:offered.sort(), readable:readable.slice().sort(),
            note: typeof SERVO_CFG_ACCEPT_NOTE === 'string' ? SERVO_CFG_ACCEPT_NOTE : ''};
  });
  ok('every extension the picker offers is one the reader can actually read',
     acc.offered.length>0 && acc.offered.every(e=>acc.readable.indexOf(e)>=0),
     acc.offered.join(' '));
  ok('every format the reader can read is offered somewhere — no silent capability',
     acc.readable.length>0 && acc.readable.every(e=>acc.offered.indexOf(e)>=0),
     acc.readable.join(' '));
  ok('the picker still LEADS with this build\'s own family',
     /^\.mstr/.test(acc.mae) && /^\.json/.test(acc.pca), acc.mae+'  |  '+acc.pca);
  ok('the gap between what is offered and what is read is stated, not merely tolerated',
     /offer/i.test(acc.note) && /read/i.test(acc.note), acc.note.slice(0,90));

  const probe = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24'); reindexSubs();
    const samples = {'.mstr': buildMstrText(), '.xml': buildMstrText(),
                     '.json': JSON.stringify(servoCfgExportObj()), '.h': pcaGenFromLoadout()};
    const out = {};
    Object.keys(samples).forEach(k=>{
      try{ const r = servoCfgImportText(samples[k], 'probe'+k); out[k] = r.from+'/'+r.n; }
      catch(e){ out[k] = 'threw: '+e.message; }
    });
    return out;
  });
  ok('the reader really does take all four, and says which family each came from',
     /^mstr\/\d+/.test(probe['.mstr']||'') && /^mstr\/\d+/.test(probe['.xml']||'') &&
     /^cfg\/\d+/.test(probe['.json']||'') && /^pca\/\d+/.test(probe['.h']||''),
     JSON.stringify(probe));

  /* =================================================================
     v1.46.0 — Mike: "on the build import sequences etc — we should make
     it clear on the import that they select what they are importing as
     clear selections not hidden in advance — Import Servo Config Only,
     Import Servo and Choreography or import Choreography only".

     Three cards, visible, one click each, each saying what it touches
     and what it leaves alone — and a choice the dropped file cannot
     satisfy greyed WITH the reason rather than quietly missing.
     ================================================================= */
  console.log('\n════ v1.46.0 — the import chooser: three visible selections ════');
  const three = await ev(()=>{
    if(typeof impChooseOpen !== 'function') return {missing:true};
    impChooseOpen({from:'test'});
    const host = document.getElementById('jobWiz');
    const cards = Array.from(host.querySelectorAll('.impch'));
    const out = {
      job: JOBWIZ.job,
      ids: cards.map(c=>c.dataset.imp),
      labels: cards.map(c=>c.querySelector('b').textContent),
      touches: cards.every(c=>/touches/i.test(c.textContent) && /leaves alone/i.test(c.textContent)),
      text: host.textContent
    };
    jobwizClose();
    return out;
  });
  ok('the import job leads with the three choices Mike named, in his words',
     three.job==='import' && three.ids.length===3
     && three.ids.indexOf('servo')>=0 && three.ids.indexOf('both')>=0 && three.ids.indexOf('choreography')>=0,
     (three.ids||[]).join(', '));
  ok('...spelled out as "servo config" and "choreography", not "channels" and "sequences"',
     (three.labels||[]).join(' | ')==='import servo config only | import servo config and choreography | import choreography only',
     (three.labels||[]).join(' | '));
  ok('...and every card says what it touches AND what it leaves alone', three.touches===true);
  ok('the one canonical formats sentence is still on this pane',
     (three.text||'').indexOf('imports: ')>=0 && /servos\.h/.test(three.text||''));

  const pre = await ev(()=>{
    /* the sequencer's ⤓ Import sequence button calls exactly this */
    impChooseOpen({kind:'choreography', from:'sequencer'});
    const host = document.getElementById('jobWiz');
    const cards = Array.from(host.querySelectorAll('.impch'));
    const out = {
      kind: IMPCH.kind, from: IMPCH.from,
      picked: cards.filter(c=>c.classList.contains('act')).map(c=>c.dataset.imp),
      allVisible: cards.length===3,
      othersClickable: cards.filter(c=>!c.classList.contains('blocked')).length
    };
    jobwizClose();
    return out;
  });
  ok('opts.kind preselects the matching choice — and all three stay visible and changeable',
     pre.kind==='choreography' && pre.from==='sequencer'
     && pre.picked.length===1 && pre.picked[0]==='choreography'
     && pre.allVisible && pre.othersClickable===3,
     JSON.stringify(pre));

  console.log('\n════ v1.46.0 — the chooser reads the file, and the reader agrees ════');
  const shapes = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24'); reindexSubs();
    const samples = {
      '.mstr': buildMstrText(),
      '.json': JSON.stringify(servoCfgExportObj()),
      '.h':    pcaGenFromLoadout(),
      'choreo.json': JSON.stringify(seqLibExportObj())
    };
    const out = {};
    Object.keys(samples).forEach(k=>{
      const sh = impShape(samples[k], 'probe-'+k);
      /* the CLASSIFIER and the READER have to agree about which family a
         file is, or the chooser offers doors the reader will not open */
      let readFrom = '';
      try{ readFrom = servoCfgImportText(samples[k], 'probe-'+k).from; }catch(e){ readFrom = 'threw'; }
      out[k] = {from:sh.from, readFrom, servo:sh.servo, choreo:sh.choreo, err:sh.err};
    });
    out.junk = impShape('hello, not a config at all', 'x.txt');
    return out;
  });
  ok('the chooser and the one reader name the same family for every format',
     ['.mstr','.json','.h','choreo.json'].every(k=>shapes[k].from===shapes[k].readFrom),
     Object.keys(shapes).filter(k=>k!=='junk').map(k=>k+':'+shapes[k].from+'/'+shapes[k].readFrom).join(' '));
  ok('a .mstr and a PCA9685 header are seen to carry BOTH travel and choreography',
     shapes['.mstr'].servo>0 && shapes['.mstr'].choreo>0 && shapes['.h'].servo>0 && shapes['.h'].choreo>0,
     JSON.stringify([shapes['.mstr'].servo,shapes['.mstr'].choreo,shapes['.h'].servo,shapes['.h'].choreo]));
  ok('a servo config is seen to carry travel and NO choreography',
     shapes['.json'].servo>0 && shapes['.json'].choreo===0);
  ok('this release\'s choreography backup carries both, so it can be read back',
     shapes['choreo.json'].servo>0 && shapes['choreo.json'].choreo>0,
     JSON.stringify([shapes['choreo.json'].servo,shapes['choreo.json'].choreo]));
  ok('an unreadable file says what it should have been, and names the formats',
     !!shapes.junk.err && /servo config/.test(shapes.junk.err) && /\.mstr/.test(shapes.junk.err),
     (shapes.junk.err||'').slice(0,80));

  console.log('\n════ v1.46.0 — a choice the file cannot satisfy is unavailable WITH the reason ════');
  const dead = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24'); reindexSubs();
    const cfg = JSON.stringify(servoCfgExportObj());     // travel only, no sequences
    impChooseOpen({text:cfg, name:'friend-servos.json', from:'test'});
    const cards = Array.from(document.getElementById('jobWiz').querySelectorAll('.impch'));
    const by = {};
    cards.forEach(c=>{ by[c.dataset.imp] = {
      blocked: c.classList.contains('blocked'),
      why: (c.querySelector('.impwhy')||{textContent:''}).textContent,
      clickable: !c.classList.contains('blocked')
    }; });
    jobwizClose();
    return by;
  });
  ok('a servo config offers "servo config only" and nothing else',
     dead.servo.clickable===true && dead.both.blocked===true && dead.choreography.blocked===true,
     JSON.stringify(Object.keys(dead).map(k=>k+':'+(dead[k].blocked?'blocked':'open'))));
  ok('...and both unavailable cards say WHY on the card, not merely nothing',
     /no sequences/.test(dead.choreography.why) && /no sequences/.test(dead.both.why),
     dead.choreography.why);

  const noTable = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24'); reindexSubs();
    const mstr = buildMstrText();
    const was = MSTR.loaded;
    MSTR.loaded = false;                                  // nothing of your own yet
    impChooseOpen({text:mstr, name:'friend.mstr', from:'test'});
    const cards = Array.from(document.getElementById('jobWiz').querySelectorAll('.impch'));
    const by = {};
    cards.forEach(c=>{ by[c.dataset.imp] = {blocked:c.classList.contains('blocked'),
      why:(c.querySelector('.impwhy')||{textContent:''}).textContent}; });
    jobwizClose();
    MSTR.loaded = was;
    return by;
  });
  ok('with no channel table of your own, "choreography only" is a dead end and says so',
     noTable.choreography.blocked===true && /endpoints/.test(noTable.choreography.why)
     && noTable.servo.blocked===false && noTable.both.blocked===false,
     noTable.choreography.why.slice(0,90));

  /* =================================================================
     v1.69.0 — THE THREE THINGS A ROUND TRIP THROUGH YOUR OWN FILE
     WAS QUIETLY REWRITING.

     All three are the same mistake wearing different clothes: the
     import door re-derived something it could have read. The board's
     slot numbers came from the library rather than the script, a sub
     was matched back to its sequence by a symbol the exporter no
     longer emits, and a sequence flag was read at the header's slot
     number against an array that had stopped being indexed by it.
     Each one survives a save and only shows itself on the droid, so
     each one gets an assertion here and not merely a fix.
     ================================================================= */
  console.log('\n════ v1.69.0 — a curated loadout keeps its slot numbers ════');
  const curated = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    /* the loadout is the board: a subset of the library, in the order
       the builder chose, and it is what decides which sequence
       restartScript(n) plays */
    const want = ['Dome Flutter','Whole Dome Open','Dome Pies Close'];
    MSTR.loadout = want.slice();
    reindexSubs();
    const text = buildMstrText();
    parseMstr(text, 'curated.mstr');
    /* and the proof it stuck: save it AGAIN and read the script back.
       That second file is the one that gets flashed. */
    reindexSubs();
    const scr = new DOMParser().parseFromString(buildMstrText(), 'application/xml')
                  .getElementsByTagName('Script')[0].textContent;
    return {
      want,
      loadout: (MSTR.loadout||[]).slice(),
      slots: parseScriptSubs(scr).filter(s=>!/^frame_/i.test(s.name)).map(s=>s.name),
      nSeq: MSTR.sequences.length
    };
  });
  ok('re-importing your own .mstr keeps the loadout the file was built from',
     JSON.stringify(curated.loadout)===JSON.stringify(curated.want),
     JSON.stringify(curated.loadout));
  ok('...so a re-export compiles the same subs in the same order — no renumbering',
     JSON.stringify(curated.slots)===JSON.stringify(curated.want.map(n=>n.replace(/\s+/g,'_'))),
     JSON.stringify(curated.slots));
  ok('...and the rest of the library is still there, merely not on the board',
     curated.nSeq===8, curated.nSeq+' sequence(s)');

  console.log('\n════ v1.69.0 — a round trip invents no sequences ════');
  const phantom = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    /* the two shapes scriptSubNames() rewrites: a name that starts
       with a digit (a bare `2001_Salute` is a literal to the Maestro
       compiler, so it ships as `s_2001_Salute`) and a pair that
       niceName() collapses onto one symbol (the second gets _2) */
    MSTR.sequences[0].name = '2001 Salute';
    MSTR.sequences[1].name = 'Dome Wave';
    MSTR.sequences[2].name = 'Dome_Wave';
    loadoutReset(); reindexSubs();
    const before = MSTR.sequences.length;
    parseMstr(buildMstrText(), 'rt1.mstr');
    const once = {n:MSTR.sequences.length, names:MSTR.sequences.map(s=>s.name),
                  load:(MSTR.loadout||[]).length, recovered:MSTR.report.seqRecovered};
    reindexSubs();
    parseMstr(buildMstrText(), 'rt2.mstr');
    return {before, once, twice:{n:MSTR.sequences.length, load:(MSTR.loadout||[]).length}};
  });
  ok('a leading-digit name and a niceName clash both match their own sub back',
     phantom.once.n===phantom.before && phantom.once.recovered===0,
     phantom.once.n+' sequence(s) from '+phantom.before+', '+phantom.once.recovered+' "recovered"');
  ok('...so no phantom copy of a sequence is appended under its sub symbol',
     phantom.once.names.indexOf('s_2001_Salute')<0 && phantom.once.names.indexOf('Dome_Wave_2')<0,
     phantom.once.names.join(', '));
  ok('...and the library does not grow again on the next cycle',
     phantom.twice.n===phantom.before && phantom.twice.load===phantom.before,
     phantom.twice.n+' sequence(s), loadout '+phantom.twice.load);

  console.log('\n════ v1.69.0 — a header flag lands on the sequence it was written for ════');
  const flags = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    const frames = ()=>JSON.parse(JSON.stringify(MSTR.sequences[0].frames));
    /* a generator is skipped by the reader — it is five numbers per
       entry, not a frame — so from slot 1 on, the header's slot number
       and the position in the parsed array are no longer the same */
    MSTR.sequences = [
      {name:'Idle Sweep', gen:'osc', entries:[{ch:0,lo:4000,hi:8000,period:2000,phase:0}]},
      {name:'Alpha',      frames:frames()},
      {name:'Beta Loop',  frames:frames(), loop:true},
      {name:'Gamma',      frames:frames(), background:true}
    ];
    loadoutReset();
    const h = pcaGenFromLoadout();
    if(typeof pcaHeaderParse !== 'function') return {missing:true};
    const P = pcaHeaderParse(h, 'gen.h');
    return {got: P.sequences.map(q=>q.name+':'+(q.loop?'loop':'-')+':'+(q.background?'bg':'-'))};
  });
  ok('the loop flag stays on the sequence the header put it on, past a generator',
     JSON.stringify(flags.got)===JSON.stringify(['Alpha:-:-','Beta Loop:loop:-','Gamma:-:bg']),
     JSON.stringify(flags.got));

  /* =================================================================
     v1.70.1 — THE SAME RENUMBERING, THROUGH THE OTHER DOOR.

     v1.70.0 fixed mstrApply(): a whole file re-imported keeps the
     loadout its script was built from. The chooser's "choreography
     only, replace" landed the same sequences through
     mstrAdoptSequences() — which appends in LIBRARY order — and then
     called loadoutReset(), so a curated file came back with every
     sequence in the library on the board, in the wrong slots, and the
     d-pad fired something else. Same symptom, same fix: the order
     comes from the file's own subs where it has them.
     ================================================================= */
  console.log('\n════ v1.70.1 — choreography only, replace, keeps the file\'s own slot order ════');
  const choreoOnly = await ev(async ()=>{
    MSTR.sequences = [];                 // the generator left behind above is not a frame list
    setBoard('mini24'); makeStarter('dome','mini24');
    const want = ['Dome Flutter','Whole Dome Open','Dome Pies Close'];
    MSTR.loadout = want.slice();
    reindexSubs();
    const text = buildMstrText();
    /* a droid of your own — the same channel table, and an empty library,
       so "replace" is the answer without a dialog to click */
    MSTR.sequences = []; loadoutReset(); reindexSubs();
    impChooseOpen({kind:'choreography', from:'test'});
    impChooseLoad(text, 'curated.mstr');
    const res = await impChooseRun();
    const host = document.getElementById('jobWiz');
    const out = {res, want,
      loadout:(MSTR.loadout||[]).slice(),
      lib: MSTR.sequences.length,
      open: JOBWIZ.open && !host.hidden,
      text: host.textContent,
      receipt: (host.querySelector('.iwbody .note.gn')||{textContent:''}).textContent,
      foot: Array.from(host.querySelectorAll('.iwfoot button')).map(b=>b.textContent)};
    jobwizClose();
    return out;
  });
  ok('choreography only, replace, takes its slot order from the file\'s own subs',
     JSON.stringify(choreoOnly.loadout)===JSON.stringify(choreoOnly.want),
     JSON.stringify(choreoOnly.loadout));
  ok('...and the rest of the library still arrives, merely not on the board',
     choreoOnly.lib===8, choreoOnly.lib+' sequence(s) in the library');

  console.log('\n════ v1.70.1 — the import says so where the import was asked for ════');
  ok('an import that landed is reported INSIDE the dialog, naming the file and the count',
     /Read curated\.mstr/.test(choreoOnly.receipt||'') && /8 sequences/.test(choreoOnly.receipt||''),
     (choreoOnly.receipt||'(no receipt)').slice(0, 70));
  ok('...so the dialog stays up to show it, rather than vanishing',
     choreoOnly.res==='done' && choreoOnly.open===true, String(choreoOnly.open));
  ok('...and the footer button says the job is done',
     (choreoOnly.foot||[]).slice(-1)[0]==='done', (choreoOnly.foot||[]).join(' | '));

  const wide = await ev(()=>{
    impChooseOpen({from:'test'});
    const host = document.getElementById('jobWiz');
    const out = {
      accept: (typeof impChooseAccept === 'function') ? impChooseAccept() : '',
      readable: (typeof servoCfgReadable === 'function') ? servoCfgReadable() : [],
      text: host.textContent};
    jobwizClose();
    return out;
  });
  ok('the chooser\'s picker offers every format its reader can read',
     wide.readable.length>0
     && wide.readable.every(e=>wide.accept.split(',').map(s=>s.trim()).indexOf(e)>=0),
     wide.accept);
  ok('...so the pane no longer apologises for a picker that greys files out',
     !/greyed out/i.test(wide.text||'') && !/all files/i.test(wide.text||''),
     (wide.text||'').slice(-120));

  ok('no uncaught page errors', errs.length===0, errs.join(' | '));
  await browser.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
