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
