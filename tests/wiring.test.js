/* CAD-name reconciliation and the wiring reference sheet */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ PREFS.seenStartup=true; closeStartup(); });
  const ev = f => page.evaluate(f);

  console.log('\n════ the CAD names are Mike\'s, untouched ════');
  ok('every rigged part keeps its Fusion group name', await ev(()=>
    CAD.moving.every(m=>/^[A-Za-z0-9]/.test(m.base)) &&
    ['FLBreadpanDoor','ChargingBayDoor','SmallLongDoor','UpperUtilityArm','Panel13']
      .every(n=>CAD.moving.some(m=>m.base===n))));
  ok('Fusion copy-instance suffixes survive in the full name', await ev(()=>
    CAD.moving.some(m=>/\(\d\)/.test(m.name) && !/\(\d\)/.test(m.base))));
  ok('four inner pies really do share one CAD name', await ev(()=>
    CAD.moving.filter(m=>m.base==='Pie5').length===4),
    'which is why the actuator numbering cannot follow the CAD');

  console.log('\n════ actuator IDs are ours, ordered by position ════');
  ok('pie0 is an inner pie — the MainPies are static on the real build', await ev(()=>
    /^(Pie|Main)/.test(actCadName('pie0')) && !/^MainPie/.test(actCadName('pie0'))));
  ok('panel0 is Panel13, not Panel1',  await ev(()=>actCadName('panel0')==='Panel13'));
  ok('the five moving pies run anticlockwise (front view) from the fixed Pie6', await ev(()=>{
    const p6 = CAD.header.parts.find(p=>p.base==='Pie6');
    const a=[0,1,2,3,4].map(i=>((p6.azimuth-actAzimuth('pie'+i))+360)%360);
    return a.every((v,i)=>i===0 || v>a[i-1]);
  }), "act pieI = Mike's Pie I+1, decreasing azimuth");
  ok('pie5..11 have no CAD part — only five pies move on this build', await ev(()=>
    [5,6,7,8,9,10,11].every(i=>actCadName('pie'+i)==='')));
  ok('actPartLabel puts the human name on the actuator', await ev(()=>
    actPartLabel('pie0')==='Pie 1' && actPartLabel('pie4')==='Pie 5'));
  ok('the fourteen side panels run monotonically too', await ev(()=>{
    const a=Array.from({length:14},(_,i)=>actAzimuth('panel'+i));
    return a.every((v,i)=>i===0 || v>=a[i-1]);
  }));
  ok('the front door pair sits either side of the nose', await ev(()=>{
    const l=actAzimuth('doorL'), r=actAzimuth('doorR');
    return l>270 && l<360 && r>0 && r<90;
  }), 'doorL front-left, doorR front-right');
  ok('the rear pair mirrors it', await ev(()=>{
    const l=actAzimuth('doorRL'), r=actAzimuth('doorRR');
    return Math.abs((360-l) - r) < 2;
  }));
  ok('an unmapped actuator reports no CAD name', await ev(()=>actCadName('gripArm')===''));

  console.log('\n════ names surface in the UI ════');
  await ev(()=>{ loadProfile('maestro25'); });
  await page.waitForTimeout(400);
  await ev(()=>{ setBoard('mini24'); makeStarter('dome','mini24'); rebuildMaestroUI(); });
  /* CHANGE 1 (2026-08-15): the Drives dropdown is CAD-driven (chPartOptions())
     now, not PART_LIST's hand-written, drift-prone labels — "Dome pie 1"
     used to show even though partLabel calls the same part "Pie 1". The CAD
     name rides in the option's title (tooltip), the same place chPicker()
     in app/boards.js already puts it, rather than spliced into the label
     text where four same-named Pie5 duplicates used to read identically. */
  ok('the Drives dropdown pairs each actuator with its CAD part', await ev(()=>{
    const o = Array.from($('maeHost').querySelectorAll('.maerow.wide select option'));
    const pie = o.find(x=>x.value==='pie0');
    return pie && pie.textContent==='Pie 1' && pie.title==='Pie1'
        && o.some(x=>x.value==='panel0' && x.textContent==='Panel13');
  }));
  ok('the Part column shows the CAD name, not a count', await ev(()=>
    Array.from($('maeHost').querySelectorAll('.maerow.wide .mv.ok')).some(e=>/MainPie|Panel/.test(e.textContent))));
  ok('hovering gives the bearing and the hinge source', await ev(()=>
    /from the front/.test(actTip('pie0')) && /hinge:/.test(actTip('pie0'))));

  console.log('\n════ the wiring sheet ════');
  /* the sheet follows the BUILD's boards, so say what this droid has */
  await ev(()=>{ buildSet('domeServo','mini24'); buildSet('bodyServo','mini12'); buildSet('sound','dysv5w'); buildApply(); });
  await page.waitForTimeout(300);
  const rows = await ev(()=>wiringRows());
  ok('every row carries both names or says why not', rows.every(r=>r.act && (r.cad||r.board)));
  /* Mike's bug, 2026-07-27: with a Maestro in the dome AND one in the body,
     the sheet printed the dome board and silently dropped every body channel */
  ok('BOTH configured Maestros appear — the body one is not dropped', await ev(()=>{
    const r = wiringRows().filter(x=>x.board);
    return r.some(x=>/dome/.test(x.board)) && r.some(x=>/body/.test(x.board));
  }), await ev(()=>Array.from(new Set(wiringRows().filter(r=>r.board).map(r=>r.board))).join(' + ')));
  ok('…and every driven row names which board and which channel', await ev(()=>
    wiringRows().filter(r=>r.board).every(r=>r.ch!=='' && /Mini|Micro/.test(r.board))));
  const html = await ev(()=>wiringHtml());
  ok('the three sections are disjoint — no row printed twice', (()=>{
    const acts=[...html.matchAll(/<td class="m act">([A-Za-z0-9]+)<\/td>/g)].map(m=>m[1]);
    return acts.length === new Set(acts).size;
  })(), (html.match(/<td class="m">/g)||[]).length+' rows');
  ok('it explains the two naming systems up front', /Two naming systems/.test(html));
  ok('it is a standalone printable document', /^<!DOCTYPE html>/.test(html) && /@media print/.test(html));
  ok('it names the profile it was generated for', html.includes(await ev(()=>PROFILE.name)));

  /* ================================================================
     TWO BOARDS ARE TWO BOXES

     wiringSource() was deliberately fixed to walk BOTH board locations, so
     `rows` legitimately carries rows from two different boards — and the
     default build is a two-board build (servoSplit:'two'). The diagram then
     titled the whole sheet from wired[0].board, drew ONE box, and hung
     every channel off it, so the pin column read 0,0,1,1,2,2… Two physically
     separate boards, printed as one, on the page a builder takes to the
     bench and wires from.
     ================================================================ */
  console.log('\n════ the wiring diagram draws one box per board ════');
  const twoBoard = await ev(()=>{
    const rows = wiringRows().filter(r=>r.board);
    const svg  = wiringDiagramSvg(wiringRows());
    const doc  = new DOMParser().parseFromString(svg.replace(/^[\s\S]*?(?=<svg)/,''), 'image/svg+xml');
    const gs   = [...doc.querySelectorAll('g[data-board]')];
    return {
      boards: [...new Set(rows.map(r=>r.board))],
      /* the board box is the only dark-green rect in the picture, so
         counting them counts boards without leaning on the fix's markup */
      boxes: (svg.match(/fill="#1c4d2e"/g)||[]).length,
      groups: gs.map(g=>g.getAttribute('data-board')),
      dupPins: gs.map(g=>{
        const p = [...g.querySelectorAll('text.pin')].map(t=>t.textContent);
        return p.length - new Set(p).size;
      })
    };
  });
  console.log('      boards: '+JSON.stringify(twoBoard.boards));
  ok('the default build really does have two boards on it', twoBoard.boards.length===2,
     JSON.stringify(twoBoard.boards));
  ok('the sheet names BOTH of them, not just the first', await ev(()=>{
    const svg = wiringDiagramSvg(wiringRows());
    return [...new Set(wiringRows().filter(r=>r.board).map(r=>r.board))].every(b=>svg.indexOf(b)>=0);
  }), JSON.stringify(twoBoard));
  ok('…and draws one board box per board, not one for both',
     twoBoard.boxes === twoBoard.boards.length, twoBoard.boxes+' boxes for '+twoBoard.boards.length+' boards');
  ok('…each channel group tagged with the board it belongs to',
     twoBoard.groups.length === twoBoard.boards.length
     && twoBoard.groups.slice().sort().join('|') === twoBoard.boards.slice().sort().join('|'),
     JSON.stringify(twoBoard.groups));
  ok('…and no pin number appears twice on one board',
     twoBoard.dupPins.length>0 && twoBoard.dupPins.every(n=>n===0), JSON.stringify(twoBoard.dupPins));
  ok('a one-board build still draws exactly one box', await ev(()=>{
    const rows = wiringRows().filter(r=>r.board);
    const one  = rows.filter(r=>r.board===rows[0].board);
    const svg  = wiringDiagramSvg(one);
    return (svg.match(/fill="#1c4d2e"/g)||[]).length === 1 && svg.indexOf(one[0].board) >= 0;
  }));

  /* ================================================================
     v1.45.0 — Mike: "Mark wiring images as Beta." The badge is drawn
     INSIDE each SVG so it cannot be separated from the picture, in the
     app and in the exported sheet — which is the copy that gets printed
     and carried to a bench with no UI around it.
     ================================================================ */
  console.log('\n════ the diagrams say they are beta ════');
  ok('one plain sentence says what beta means here', await ev(()=>
    /guide, not a datasheet/.test(WIRING_BETA_WHY) &&
    /pinout before you cut a wire/.test(WIRING_BETA_WHY)));
  ok('the control-signal diagram carries a BETA badge, inside the SVG', await ev(()=>{
    const s = systemDiagramSvg();
    return /^<svg/.test(s) && s.indexOf('>BETA<') > 0 && s.indexOf(WIRING_BETA_WHY) > 0;
  }));
  ok('the servo wiring diagram carries it too', await ev(()=>{
    const s = wiringDiagramSvg(wiringRows());
    return s.indexOf('>BETA<') > 0 && s.indexOf(WIRING_BETA_WHY) > 0;
  }));
  ok('the badge is amber — the --am warning token, not a new colour', await ev(()=>
    /stroke="var\(--am,#f2a63c\)"/.test(systemDiagramSvg())));
  ok('the exported sheet marks both diagrams and explains it in prose', (()=>{
    const heads = (html.match(/<h2>[^<]*<span class="bmark">beta<\/span><\/h2>/g)||[]).length;
    return heads===2 && /class="note beta"/.test(html) && /diagrams below are beta/.test(html);
  })(), (html.match(/bmark">beta/g)||[]).length+' beta marks');
  ok('the setup step says it above the picture, before a wire is cut', await ev(()=>{
    wizOpen(wizSteps().findIndex(s=>s.key==='_wiring'));
    const n = $('startupBody').querySelector('.note.beta');
    const t = n ? n.textContent : '';
    closeStartup();
    return !!n && /These diagrams are beta/.test(t) && /guide, not a datasheet/.test(t)
        && !!n.querySelector('.betachip');
  }));

  /* ================================================================
     v1.45.0 — Mike: "Add date and time, without seconds, to
     saved/exported filenames." Two writers live in this file's reach:
     the wiring sheet and its CSV.
     ================================================================ */
  console.log('\n════ the exported names carry the date and time ════');
  ok('R2-wiring-<profile>-YYYY-MM-DD-HHMM.html', await ev(()=>
    /^R2-wiring-[a-z0-9]+-\d{4}-\d{2}-\d{2}-\d{4}\.html$/.test(downloadWiring('html'))));
  ok('...and the CSV the same, to the minute and no further', await ev(()=>{
    const n = downloadWiring('csv');
    return /^R2-wiring-[a-z0-9]+-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/.test(n)
        && n.indexOf(fileStamp())>0;      // local time, the shared stamp
  }));

  const csv = await ev(()=>wiringCsv());
  const lines = csv.trim().split('\n');
  ok('the CSV has a header plus one line per row', lines.length===rows.length+1, lines.length+' lines');
  ok('CSV columns stay aligned when a name contains a comma', (()=>{
    const cols = lines[0].split(',').length;
    return lines.every(l => (l.match(/,/g)||[]).length >= cols-1);
  })());

  console.log('\n════ it follows the build ════');
  await ev(()=>{ buildSet('domeServo','mod2026'); buildSet('bodyServo','mod2026'); buildSet('sound','mdyx5300'); buildApply(); loadProfile('mod2026'); });
  await page.waitForTimeout(400);
  const pca = await ev(()=>wiringRows());
  ok('an all-PCA9685 build reports both boards, not a Maestro', pca.some(r=>/PCA9685 0x40/.test(r.board))
     && pca.some(r=>/PCA9685 0x41/.test(r.board)) && !pca.some(r=>/Mini|Micro/.test(r.board)),
     Array.from(new Set(pca.filter(r=>r.board).map(r=>r.board))).join(' + '));
  ok('it picks up the endpoints currently set in Config', await ev(()=>{
    CFG.LeftDoorOpen = 999;
    return wiringRows().find(r=>r.act==='doorL').travel.includes('999');
  }));
  ok('the four doors the firmware cannot drive are listed as undriven', pca.filter(r=>
    ['doorRL','doorRR','smallDoor','drawer'].includes(r.act)).every(r=>!r.board));

  /* ================================================================
     ONE CHANNEL MAP (2026-08-22 — UX review §3.1 and the rest of §2.12)

     Three surfaces answered "which servo is on which channel" at the same
     moment, differently: the Board channel table (dome pies ch0-5, dome
     panels ch6-19), the OUTPUTS tab (`PCA9685 @ 0x41 · BODY` with body
     doors, `@ 0x42 · DOME PIES` with eleven pies) and the wiring sheet
     (19 driven channels, dome only, plus ten body actuators in red).

     The ruling: MSTR.channels — the table the bench edits, the engine
     drives and the exporter writes — is the truth. OUTPUTS is allowed to
     show what a sketch WOULD drive, but it has to say that in its heading
     instead of printing it under one that reads as fact; and the sheet
     has to read the table wherever one is loaded.
     ================================================================ */
  console.log('\n════ Outputs says whether it is the board table or a plan ════');
  const outLive = await ev(()=>{
    buildSet('domeServo','mod2026'); buildSet('bodyServo','mod2026');
    buildSet('sound','mdyx5300'); buildSet('firmware','mod2026'); buildApply();
    loadProfile('mod2026'); buildOutputs();
    return {hasServos:PROFILE.hasServos,
            heads:[...$('outHost').querySelectorAll('.sect > h3')].map(h=>h.textContent)
                    .filter(t=>/PCA9685/.test(t))};
  });
  console.log('      ' + JSON.stringify(outLive.heads));
  ok('the all-PCA9685 build really is running the PCA sketch', outLive.hasServos);
  ok('the headings name the addresses the sketch itself uses — 0x40 and 0x41',
     outLive.heads.some(t=>/0x40/.test(t)) && outLive.heads.some(t=>/0x41/.test(t))
     && !outLive.heads.some(t=>/0x42/.test(t)), outLive.heads.join(' | '));
  ok('…and both say they ARE this build\'s channel table',
     outLive.heads.length===2 && outLive.heads.every(t=>/board table/i.test(t)),
     outLive.heads.join(' | '));

  const outPlan = await ev(()=>{
    buildSet('domeServo','mini24'); buildSet('bodyServo','mod2026');
    buildSet('firmware','mod2026'); buildApply(); loadProfile('mod2026'); buildOutputs();
    return [...$('outHost').querySelectorAll('.sect > h3')].map(h=>h.textContent)
             .filter(t=>/PCA9685/.test(t));
  });
  console.log('      ' + JSON.stringify(outPlan));
  ok('a Maestro dome makes the dome PCA table a PLAN, and the heading says so',
     outPlan.some(t=>/dome/i.test(t) && /planned/i.test(t)), outPlan.join(' | '));
  ok('…while the body board this build really has still reads as the table',
     outPlan.some(t=>/body/i.test(t) && !/planned/i.test(t)), outPlan.join(' | '));

  console.log('\n════ the wiring sheet reads the Board channel table ════');
  const tbl = await ev(()=>{
    setBoard('mini24'); makeStarter('dome','mini24');
    /* move pie0 where the PLANNED layout would never put it, name it, and
       give it measured ends — reversed, so INV has something to say */
    MSTR.channels.forEach(c=>{ if(c && c.act==='pie0') c.act=''; });
    const c = MSTR.channels[21];
    c.mode='Servo'; c.act='pie0'; c.name='Top left pie';
    c.min=7600; c.max=5200; c.invert=false;          // min is shut, max is open
    const r = wiringRows().find(x=>x.act==='pie0') || {};
    return {ch:r.ch, chName:r.chName, travel:r.travel, invert:r.invert,
            board:r.board, planned:r.planned,
            stillSaysSetOnTheBoard: wiringRows().filter(x=>/set on the board/.test(x.travel||'')).length};
  });
  console.log('      ' + JSON.stringify(tbl));
  ok('a channel moved on the board moves on the sheet', tbl.ch===21, JSON.stringify(tbl));
  ok('…under the name the board table carries', tbl.chName==='Top left pie', String(tbl.chName));
  ok('TRAVEL is that channel\'s own endpoints, shut → open',
     /^1900–1300 µs$/.test(tbl.travel||''), String(tbl.travel));
  ok('INV says so when the open end is the lower number', tbl.invert==='yes', String(tbl.invert));
  ok('no channel on a loaded board still says "set on the board"',
     tbl.stillSaysSetOnTheBoard===0, tbl.stillSaysSetOnTheBoard+' rows');
  ok('a board with NO table loaded is marked planned rather than stated', await ev(()=>{
    buildSet('domeServo','mini24'); buildSet('bodyServo','mini12');
    buildSet('firmware','mod2026'); buildApply(); loadProfile('mod2026');
    setBoard('mini24');                       // the table is the DOME's, not the body's
    const rows = wiringRows().filter(r=>r.board);
    const dome = rows.filter(r=>/dome/.test(r.board)), body = rows.filter(r=>/body/.test(r.board));
    return dome.length && body.length && dome.every(r=>!r.planned) && body.every(r=>r.planned)
        && /planned/i.test(wiringHtml());
  }), await ev(()=>Array.from(new Set(wiringRows().filter(r=>r.board).map(r=>r.board+(r.planned?' [planned]':'')))).join(' + ')));

  console.log('\n════ the undriven count is on screen, before the export ════');
  /* the build the walkthrough had: ten of twenty-nine rigged actuators with
     no channel at all, and the only way to learn that was to download the
     sheet and read a red column */
  await ev(()=>{
    buildSet('domeServo','mod2026'); buildSet('bodyServo','mod2026');
    buildSet('firmware','mod2026'); buildApply(); loadProfile('mod2026');
    wizOpen(wizSteps().findIndex(s=>s.key==='_wiring'));
  });
  await page.waitForTimeout(300);
  const cnt = await ev(()=>{
    const bar = [...$('startupBody').querySelectorAll('.conbar')]
      .find(b=>[...b.querySelectorAll('button')].some(x=>/wiring sheet/i.test(x.textContent)));
    const note = bar ? bar.parentNode.querySelector('.wirecount') : null;
    const rows = wiringRows();
    const out = {bar:!!bar, text:note?note.textContent:'',
                 undriven:rows.filter(r=>!r.board).length, total:rows.length};
    closeStartup();
    return out;
  });
  console.log('      ' + JSON.stringify(cnt));
  ok('the wiring step still offers the export', cnt.bar);
  ok('this build really does have parts nothing drives', cnt.undriven>0, cnt.undriven+' of '+cnt.total);
  ok('the count of parts nothing drives is beside the button, before you export',
     !!cnt.text, cnt.text);
  ok('…and it is the same number the sheet prints',
     cnt.text.indexOf(String(cnt.undriven))>=0 && cnt.text.indexOf(String(cnt.total))>=0,
     cnt.undriven+' of '+cnt.total+' — bar says "'+cnt.text+'"');

  /* ================================================================
     v1.70.0 — Q7 gained a THIRD answer, "Not decided yet", and its own
     option note promises "it is on the wiring sheet as undecided so the
     loom does not get drawn round a guess". It fell through the
     `pwm ? FSESC : Sabertooth` ternary and drew a Sabertooth.
     ================================================================ */
  console.log('\n════ undecided feet are drawn as undecided ════');
  const feet = await ev(()=>{
    CFG.FOOT_CONTROLLER = 1;                    // the worst case: a stale constant
    buildSet('bodyDrive','undecided'); buildApply();
    const L = systemLinks().filter(k=>k.sub==='foot drive');
    return {n:L.length, names:L.map(k=>k.name), live:L.map(k=>!!k.live),
            why:L.map(k=>k.why||'').join(' ')};
  });
  console.log('      ' + JSON.stringify(feet));
  ok('the loom does not guess a Sabertooth — or a hub ESC',
     !feet.names.some(n=>/Sabertooth|FSESC/.test(n)), JSON.stringify(feet.names));
  ok('it draws one undecided foot-drive row instead, not driven',
     feet.n===1 && /not decided|undecided|not chosen/i.test(feet.names[0]) && feet.live[0]===false,
     JSON.stringify(feet));
  ok('…and says why, so the row is an open question and not an omission',
     /decid|chos/i.test(feet.why), feet.why);
  await ev(()=>{ CFG.FOOT_CONTROLLER = 0; buildSet('bodyDrive','sabertooth'); buildApply(); });

  console.log('\n════ the sketch filename the sheet prints ════');
  ok('no profile carries a stray space in its .ino name', await ev(()=>
    PROFILE_ORDER.every(id=>!/\s/.test(PROFILES[id].file))),
    await ev(()=>PROFILE_ORDER.map(id=>PROFILES[id].file).join(' | ')));
  ok('mod2026 is padawan_secure_mode.ino, the name a checkout actually has', await ev(()=>
    PROFILES.mod2026.file === 'padawan_secure_mode.ino'), await ev(()=>PROFILES.mod2026.file));

  /* ================================================================
     §3.4 — "NOT SET UP YET" printed over a complete list of the answers.
     buildConfigured() is PREFS.build.done, which only the Finish job
     sets; the predicate is deliberately left alone (it guards the boot
     wizard), so the HEADING gains the middle state it was missing.
     ================================================================ */
  console.log('\n════ Configure does not deny nine answers it is printing ════');
  const cfgHead = await ev(()=>{
    const b = buildGet(), done0 = b.done, seen0 = PREFS.seenStartup;
    const read = ()=>{ buildConfig(); const h = $('cfgHost').querySelector('.sect h3'); return h?h.textContent:''; };
    b.done = false; PREFS.seenStartup = false; const fresh    = read();
    b.done = false; PREFS.seenStartup = true;  const answered = read();
    b.done = true;                             const done     = read();
    b.done = done0; PREFS.seenStartup = seen0; buildConfig();
    return {fresh, answered, done, rows: buildSummaryRows().length};
  });
  console.log('      ' + JSON.stringify(cfgHead));
  ok('a droid nobody has answered for still says so', /not set up yet/i.test(cfgHead.fresh), cfgHead.fresh);
  ok('answers given but never finished read as answered, not as nothing',
     /answered, not finished/i.test(cfgHead.answered) && !/not set up yet/i.test(cfgHead.answered),
     cfgHead.answered);
  ok('…and a finished setup still reads configured', /configured/i.test(cfgHead.done)
     && !/not set up yet/i.test(cfgHead.done), cfgHead.done);

  /* ================================================================
     ONE CLOCK ON THE SHEET

     The filename comes from fileStamp() (core/util.js), whose contract is
     explicitly LOCAL time — "the stamp exists to be recognised by the
     person who pressed the button". The header line inside the same
     document was UTC. Export at 09:00 in UTC+10 and you download
     `…-0900.html` that prints "generated 2026-08-21 23:00": a different
     clock time AND a different date, on the same page.

     This needs its own context, in a timezone that is not the runner's:
     under UTC the bug is invisible, which is exactly why it survived.
     ================================================================ */
  console.log('\n════ the sheet and its filename agree on the clock ════');
  const tzPage = await browser.newPage({ viewport:{width:1400,height:900}, timezoneId:'Australia/Brisbane' });
  await tzPage.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await tzPage.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await tzPage.evaluate(()=>{ PREFS.seenStartup=true; closeStartup(); });
  const clocks = await tzPage.evaluate(()=>{
    const html  = wiringHtml();
    const m     = html.match(/generated ([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2})/);
    const d     = new Date();
    const p     = n => String(n).padStart(2,'0');
    return {
      onSheet: m ? m[1] : null,
      stamp:   fileStamp(),
      local:   d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes()),
      utc:     new Date().toISOString().slice(0,16).replace('T',' '),
      offset:  -d.getTimezoneOffset()/60
    };
  });
  console.log('      sheet "'+clocks.onSheet+'"  local "'+clocks.local+'"  utc "'+clocks.utc+'"  filename '+clocks.stamp+'  (UTC'+(clocks.offset>=0?'+':'')+clocks.offset+')');
  ok('the test context really is off UTC, or this proves nothing', clocks.offset !== 0, 'UTC'+clocks.offset);
  ok('the "generated" line is LOCAL time, the same clock the filename uses',
     clocks.onSheet === clocks.local, clocks.onSheet+' vs '+clocks.local);
  ok('…and it matches fileStamp(), which is what the download is named after',
     clocks.stamp === clocks.onSheet.replace(/[-: ]/g,'').replace(/^(\d{4})(\d{2})(\d{2})(\d{4})$/,'$1-$2-$3-$4'),
     clocks.stamp+' vs '+clocks.onSheet);
  await tzPage.close();

  ok('no page errors', errs.length===0, errs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})();
