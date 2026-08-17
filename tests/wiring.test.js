/* CAD-name reconciliation and the wiring reference sheet */
const { chromium } = require('playwright');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']
  });
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

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('page errors:', errs.length?errs:'none');
  await browser.close();
  process.exit(fail?1:0);
})();
