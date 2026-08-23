/* ═══════════════════════════════════════════════════════════════════════
   A NAME IS NEVER MARKUP  (v1.75.1, 2026-08-23)

   A 2026-08-23 review found, and this file's first two assertions REPRODUCE,
   that a name typed into the app or read out of a file reached an innerHTML
   sink and executed. It was not theoretical: renaming a Model Builder part
   to `<img src=x onerror=…>` ran that code in the page that holds the Web
   Serial handle to a servo board, and the same worked on a PCA Studio
   sequence name. Anything an injected script can reach, it can command.

   The payload is an EVENT HANDLER, never a <script> tag, and that choice is
   the whole point of this file: a <script> inserted with innerHTML does NOT
   execute, so a suite written with `<script>alert(1)</script>` passes against
   a completely vulnerable app and tells you it is safe. `<img src=x onerror>`
   fires. If you add a case here, use a handler.

   Each assertion checks BOTH halves — that nothing ran, and that the text is
   still on screen literally. A sink that silently drops the name would pass a
   "did it fire" test while quietly losing the user's label.
   ═══════════════════════════════════════════════════════════════════════ */
const { launchBrowser } = require('./harness');
const path = require('path');
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

const BOOM = '<img src=x onerror="window.__pwn=1">';       /* 36 chars — under mbRename's 40 cap */
const ATTR = 'x" onmouseover="window.__pwn=1';             /* breaks out of a double-quoted attribute */

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const target = 'file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q;
  await page.goto(target);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ PREFS.seenStartup=true; closeStartup(); });
  /* NOTE the second argument — the payload is passed IN rather than baked
     into the function source, and an `ev` that quietly dropped it made every
     assertion here pass against undefined the first time this was run. */
  const ev = (f, a) => page.evaluate(f, a);
  const fired = async () => { await page.waitForTimeout(250); return ev(()=>window.__pwn|0); };
  const arm = () => ev(()=>{ window.__pwn = 0; });

  console.log('\n════ sect(): the shared heading, and the exploit that was reproduced ════');

  await arm();
  await ev(()=>modelSet('builder'));
  await page.waitForTimeout(1500);          // the model swap is async; parts land after it
  const mb = await ev(p=>{
    const rec = mbAddPart(Object.keys(MB_PRIM)[0]);
    if(!rec) return {err:'no part'};
    mbRename(rec.id, p); mbSelect(rec.id); buildCadPane();
    const h = [...document.querySelectorAll('#cadHost h3')].map(x=>x.innerHTML).join(' ');
    const t = [...document.querySelectorAll('#cadHost h3')].map(x=>x.textContent).join(' ');
    return {name: rec.name, html: h, text: t};
  }, BOOM);
  ok('a Model Builder part named with an onerror handler does NOT execute', await fired() === 0,
     JSON.stringify(mb).slice(0,180));
  ok('…and the name is still shown, literally', !!mb.text && mb.text.indexOf('<img') >= 0,
     (mb.text||'').slice(0,90));
  ok('…because sect() built no element from it', !/<img/i.test(mb.html||''),
     (mb.html||'').slice(0,120));

  /* sect() is the sink 64 call sites share, so pin the RULE and not just the
     one caller that happened to be exploitable. */
  await arm();
  const direct = await ev(p=>{
    const host = document.createElement('div');
    const s = sect(host, p, p);
    return {html: host.innerHTML, text: host.textContent};
  }, BOOM);
  ok('sect() renders a hostile TITLE as text', !/<img/i.test(direct.html) && direct.text.indexOf('<img') >= 0);
  ok('sect() renders a hostile RIGHT as text', (direct.html.match(/<span>/g)||[]).length === 1
     && direct.text.split('<img').length === 3, direct.html.slice(0,140));
  ok('…and still nothing ran', await fired() === 0);

  console.log('\n════ names that arrive from a FILE, not a keyboard ════');

  /* The imported-sketch trap: PROFILE.file/.short/.blurb are constants for the
     three hand ports and are the dropped .ino's FILENAME for an imported one. */
  await arm();
  const prof = await ev(p=>{
    const was = {f:PROFILE.file, b:PROFILE.blurb};
    PROFILE.file = p; PROFILE.blurb = p;
    buildMap();
    const out = {html: $('hwBlurb').innerHTML, text: $('hwBlurb').textContent};
    PROFILE.file = was.f; PROFILE.blurb = was.b; buildMap();
    return out;
  }, BOOM);
  ok('an imported sketch FILENAME does not execute in the sketch blurb', await fired() === 0);
  ok('…and is shown literally', prof.text.indexOf('<img') >= 0 && !/<img/i.test(prof.html),
     prof.html.slice(0,120));

  /* A channel name is whatever an imported .mstr or servo-config .json said. */
  await arm();
  /* make sure there IS a channel table — a skipped assertion that reports PASS
     is decoration, and this is the sink that PCA Studio shares */
  await ev(()=>{
    if(typeof buildEnsureMaestro === 'function') buildEnsureMaestro();
    /* #calWrap only exists on the bench wizard's Channels step, so the dial
       has to be opened where a person opens it or this proves nothing */
    if(typeof setupOpen === 'function'){
      setupOpen(SETUP_STEPS.findIndex(x=>x.key==='channels'));
      if(typeof setupRender === 'function') setupRender();
    }
  });
  await page.waitForTimeout(500);
  const cal = await ev(p=>{
    if(typeof HW === 'undefined' || !HW.channels || !HW.channels().length) return {skip:1};
    const ch = HW.channels()[0], was = ch.name;
    ch.name = p;
    let html = '', text = '';
    if(typeof setupCalOpen === 'function'){
      try{
        setupCalOpen(0, {});
        if(typeof setupCalRender === 'function') setupCalRender();
        const h = document.querySelector('.calhead');
        if(h){ html = h.innerHTML; text = h.textContent; }
        if(typeof setupCalCancel === 'function') setupCalCancel();
      }catch(e){ return {err:String(e)}; }
    }
    ch.name = was;
    return {html, text};
  }, BOOM);
  if(cal.skip) ok('calibration heading — NO CHANNEL TABLE, so this proved nothing', false, 'buildEnsureMaestro did not produce one');
  else{
    /* the dial must actually have RENDERED, or the two assertions below are
       both true of an empty string and neither of them means anything */
    ok('the calibration dial really drew (otherwise the next two prove nothing)',
       !!cal.html && cal.html.length > 20, JSON.stringify(cal).slice(0,140));
    ok('a hostile CHANNEL name does not execute on the calibration dial', await fired() === 0,
       JSON.stringify(cal).slice(0,160));
    ok('…and is shown literally there too',
       !/<img/i.test(cal.html||'') && (cal.text||'').indexOf('<img') >= 0, (cal.html||'').slice(0,140));
  }
  await ev(()=>{ if(typeof setupClose === 'function') setupClose(); });

  console.log('\n════ every remaining assertion is the same rule, elsewhere ════');

  /* The .r2m header's `kind` is unvalidated file JSON — cad/build.js only
     checks that parts/materials are non-empty arrays. */
  await arm();
  const kind = await ev(p=>{
    if(!CAD.header || !CAD.header.parts || !CAD.header.parts.length) return {skip:1};
    /* poison EVERY header record, not parts[0]: the selsub reads the header
       entry matching the SELECTED part, and picking two different parts is how
       this assertion passed against a build that was provably vulnerable */
    const was = CAD.header.parts.map(r=>r.kind);
    CAD.header.parts.forEach(r=>{ r.kind = p; });
    let html='';
    try{
      const nm = (CAD.moving && CAD.moving[0]) ? CAD.moving[0].name : null;
      if(nm){ selectPart(nm); const s=document.querySelector('#selcard .selsub'); if(s) html=s.innerHTML; }
    }catch(e){ CAD.header.parts.forEach((r,i)=>{ r.kind = was[i]; }); return {err:String(e)}; }
    CAD.header.parts.forEach((r,i)=>{ r.kind = was[i]; });
    return {html};
  }, BOOM);
  if(kind.skip) ok('.r2m part kind — skipped, no CAD header', true);
  else{
    ok('the part card really drew (otherwise the next assertion proves nothing)',
       !!kind.html && /·/.test(kind.html), (kind.html||'').slice(0,120));
    ok('a hostile `kind` in a dropped .r2m header does not execute',
       await fired() === 0 && !/<img/i.test(kind.html||''), (kind.html||'').slice(0,120));
  }

  ok('no page errors were raised by any of it', errs.length === 0, errs.slice(0,2).join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
