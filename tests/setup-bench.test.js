/* THE BENCH, SIMPLIFIED (v1.50.0)
   ---------------------------------------------------------------------
   Mike, 2026-08-19, on "Set up your servo hardware": the selection is
   invisible in light mode; the Channels step "jumps around when enabling
   servos"; the table is "too complicated a view" and should be a simple
   list plus a configuration panel that "should always be visible"; the
   apply button should say what it applies to; the dome map should rotate
   to match how you are looking at your real dome, and clicking a panel on
   it should not throw you up the screen; the PCA9685 step should ask how
   many boards and stop there; and the Sketch step should link the sketches
   it has been naming paths at people for five releases.

   WHAT IS WORTH ASSERTING HERE, and what is not. "Is it clearer?" is not a
   test. What IS testable is every structural promise underneath the
   request:

     · the reader does not lose their place — scrollTop survives the
       re-render that ticking a box causes, and so does the caret in a name
       being typed;
     · the list carries only identity, and every setting that left it can
       still be reached and still writes to the same channel;
     · the panel follows the selection from BOTH directions (the row and
       its own picker) and is present whatever is selected, including
       nothing;
     · the test button is the DIRECTED pair, so a reversed channel closes
       when it says shut — the one place a "simpler" control could quietly
       do the opposite of what it says;
     · the map rotates without any bearing being recomputed, and the labels
       come back upright;
     · what came off the PCA step is off it and still reachable, not gone.
   ===================================================================== */
const { launchBrowser } = require('./harness');
const path = require('path');
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
const URL_ = 'file://' + path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html') + R2_Q;
let pass = 0, fail = 0;
const ok = (n,c,x='') => { c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', async d=>await d.accept());
  await page.goto(URL_);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  const ev = f => page.evaluate(f);
  await ev(()=>{ PREFS.seenStartup=true; if(typeof closeStartup==='function') closeStartup(); });
  await ev(()=>{ buildSet('domeServo','mini24'); buildSet('sound','dysv5w'); wizFinish(); });
  await page.waitForTimeout(300);
  await ev(()=>{ loadProfile('maestro25'); setBoard('mini24'); makeStarter('dome','mini24'); });
  await page.waitForTimeout(300);
  await ev(()=>setupOpen(4));
  await page.waitForTimeout(300);

  console.log('\n════ the list carries identity, and only identity ════');
  const cols = await ev(()=>Array.from(document.querySelectorAll('.chtab tr:first-child th'))
    .map(t=>t.textContent.trim().toLowerCase()));
  console.log('  ' + JSON.stringify(cols));
  ok('seven columns, not sixteen', cols.length === 7, String(cols.length));
  ok('and they are the identity ones', cols.join('|').indexOf('name') >= 0
     && cols.join('|').indexOf('drives') >= 0 && cols.join('|').indexOf('test') >= 0);
  ok('no setting is left in the list', !/µs|speed|accel|ease|sleep|boot|rev/.test(cols.join('|')), cols.join('|'));
  ok('so nothing scrolls sideways any more — the pinning went with it',
     await ev(()=>document.querySelectorAll('.chtab .cst').length === 0));

  console.log('\n════ the panel is always there, and follows the selection ════');
  ok('the panel exists before anything is selected', await ev(()=>!!$('chCfg')));
  const p1 = await ev(()=>{ document.querySelector('tr[data-ch="3"]').click(); return {sel:SETUP.sel, who:$('chCfg').textContent}; });
  ok('clicking a row selects it', p1.sel === 3, String(p1.sel));
  ok('…and the panel is about that channel', /channel 3/.test(p1.who), p1.who.slice(0,60));
  ok('the row is marked as the selected one',
     await ev(()=>document.querySelector('tr[data-ch="3"]').classList.contains('sel')));
  const p2 = await ev(()=>{
    const s = $('chPick'); s.value = '7'; s.dispatchEvent(new Event('input',{bubbles:true}));
    return {sel:SETUP.sel, who:$('chCfg').textContent};
  });
  ok('the panel’s own picker moves the selection too', p2.sel === 7 && /channel 7/.test(p2.who), String(p2.sel));
  ok('every setting that left the list is in the panel',
     await ev(()=>['minUs','ctrUs','maxUs','rev','boot','speed','acceleration','ease','sleep']
        .every(k=>!!document.querySelector('#chCfg [data-k="'+k+'"]'))));
  ok('and so is the live half',
     await ev(()=>!!document.querySelector('#chCfg [data-k=slide]')
        && !!document.querySelector('#chCfg [data-k=soff]')));
  ok('…with the dial itself under it, behind no button (v1.51.0)',
     await ev(()=>!!document.querySelector('#calWrap .calpanel')
        && !document.querySelector('#chCfg [data-k=cal]')));
  ok('a channel not in use says so rather than showing empty fields',
     await ev(()=>{ SETUP.sel = 23; setupRender();
       return !document.querySelector('#chCfg [data-k=minUs]') && /not in use/.test($('chCfg').textContent); }));

  console.log('\n════ the dial is the default view, not a mode (v1.51.0) ════');
  const dial0 = await ev(()=>{
    SETUP.sel = 5; setupRender();
    const c = HW.channels()[5];
    c.min = 4532; c.home = 6276; c.max = 7292; HW.save(); HW.rebuild(true);
    HW.drive(5, c.home);
    const targetBefore = HW.engine().st[5].target;
    SETUP.cal = null;                       // as if arriving fresh
    setupRender();
    return {
      open: !!document.querySelector('#calWrap .calpanel'),
      onCh: SETUP.cal ? SETUP.cal.ch : -1,
      pressedNothing: !document.querySelector('#chCfg [data-k=cal]'),
      targetBefore, targetAfter: HW.engine().st[5].target,
      ok: (document.querySelector('[data-cal=ok]')||{}).textContent,
      panel: ['minUs','ctrUs','maxUs'].map(k=>document.querySelector('#chCfg [data-k='+k+']').value),
      dial:  ['calLmin','calLctr','calLmax'].map(id=>$(id).value),
      dirty: !!document.querySelector('.calpend')
    };
  });
  console.log('  ' + JSON.stringify(dial0));
  ok('it is there without pressing anything', dial0.open && dial0.onCh === 5 && dial0.pressedNothing);
  ok('and opening it does NOT move the servo', dial0.targetAfter === dial0.targetBefore,
     dial0.targetBefore+' → '+dial0.targetAfter);
  ok('the button says what it does', dial0.ok === 'save servo setting', dial0.ok);
  ok('the panel and the dial show the SAME three numbers',
     JSON.stringify(dial0.panel) === JSON.stringify(dial0.dial), JSON.stringify([dial0.panel, dial0.dial]));
  ok('…and they are the builder’s travel, not the dial’s 1000–2000 working range',
     dial0.panel[0] === '1133' && dial0.panel[2] === '1823', JSON.stringify(dial0.panel));
  ok('nothing is marked unsaved before anything is touched', !dial0.dirty);

  const edit = await ev(()=>{
    const c = HW.channels()[5];
    const stored = {min:c.min, max:c.max};
    const f = document.querySelector('#chCfg [data-k=maxUs]');
    f.value = '1900'; f.dispatchEvent(new Event('input',{bubbles:true}));
    return {stored, cal: SETUP.cal.max, chan: HW.channels()[5].max,
            dialBox: $('calLmax').value,
            dirty: (setupRender(), !!document.querySelector('.calpend'))};
  });
  ok('typing an end in the panel moves the DIAL, not the channel',
     edit.cal === 7600 && edit.chan !== 7600, JSON.stringify(edit));
  ok('…and the dial’s own box agrees', edit.dialBox === '1900', edit.dialBox);
  ok('…and it is marked unsaved', edit.dirty);
  const saved = await ev(()=>{
    document.querySelector('[data-cal=ok]').click();
    return {chan: HW.channels()[5].max, stillOpen: !!document.querySelector('#calWrap .calpanel'),
            onCh: SETUP.cal ? SETUP.cal.ch : -1,
            dirty: !!document.querySelector('.calpend'),
            panel: document.querySelector('#chCfg [data-k=maxUs]').value};
  });
  ok('save servo setting writes it to the channel', saved.chan === 7600, JSON.stringify(saved));
  ok('…the dial stays open, because it is the view', saved.stillOpen && saved.onCh === 5);
  ok('…and it is not marked unsaved any more', !saved.dirty && saved.panel === '1900');
  const undone = await ev(()=>{
    const f = document.querySelector('#chCfg [data-k=minUs]');
    f.value = '700'; f.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('[data-cal=cancel]').click();
    return {chan: HW.channels()[5].min, cal: SETUP.cal ? SETUP.cal.min : -1,
            open: !!document.querySelector('#calWrap .calpanel')};
  });
  ok('cancel puts the ends back and the dial comes straight back with them',
     undone.chan === 4532 && undone.cal === 4532 && undone.open, JSON.stringify(undone));

  /* Mike, asked what a staged end should do when you walk away from it:
     "keep it — leaving means keeping." Every other field in this panel saves
     on change; three of them reverting because you looked at the next
     channel would be the trap, not the safeguard. */
  console.log('\n════ leaving a channel keeps what you staged ════');
  const leave = await ev(()=>{
    SETUP.sel = 5; setupRender();
    const f = document.querySelector('#chCfg [data-k=ctrUs]');
    f.value = '1600'; f.dispatchEvent(new Event('input',{bubbles:true}));
    const staged = {cal: SETUP.cal.home, chan: HW.channels()[5].home};
    SETUP.sel = 6; setupRender();                     // walk away
    return {staged, kept: HW.channels()[5].home, nowOn: SETUP.cal ? SETUP.cal.ch : -1};
  });
  ok('a staged centre is written when you click another channel',
     leave.staged.cal === 6400 && leave.staged.chan !== 6400 && leave.kept === 6400,
     JSON.stringify(leave));
  ok('…and the dial has moved to the channel you clicked', leave.nowOn === 6, String(leave.nowOn));
  const shut = await ev(()=>{
    SETUP.sel = 6; setupRender();
    const f = document.querySelector('#chCfg [data-k=maxUs]');
    f.value = '1750'; f.dispatchEvent(new Event('input',{bubbles:true}));
    setupClose();
    const kept = HW.channels()[6].max;
    setupOpen(4);
    return {kept, cal: !!SETUP.cal};
  });
  ok('and closing the bench keeps it too', shut.kept === 7000, JSON.stringify(shut));

  console.log('\n════ the channel’s own ends are never left widened ════');
  ok('opening the dial does not move the channel’s ends at all', await ev(()=>{
    SETUP.sel = 8; setupRender();
    const c = HW.channels()[8];
    c.min = 4532; c.max = 7292; HW.save(); HW.rebuild(true);
    SETUP.cal = null; setupRender();                  // arrive fresh, dial opens
    return c.min === 4532 && c.max === 7292 && !!SETUP.cal;
  }));
  ok('…and neither does turning it past them', await ev(()=>{
    const c = HW.channels()[8];
    SETUP.cal.wide = true;
    calSet(9600);
    return c.min === 4532 && c.max === 7292 && HW.engine().st[8].target === 9600;
  }));
  ok('so an ordinary save cannot write the working range over the travel', await ev(()=>{
    const c = HW.channels()[8];
    const sp = document.querySelector('#chCfg [data-k=speed]');
    sp.value = 77; sp.dispatchEvent(new Event('input',{bubbles:true}));
    const raw = localStorage.getItem('r2sim.servo.v1') || '';
    const back = JSON.parse(raw).channels[8];
    return back.min === 4532 && back.max === 7292 && c.speed === 77;
  }));
  ok('a channel not in use gets no dial at all', await ev(()=>{
    SETUP.sel = 23; setupRender();
    return !document.querySelector('#calWrap .calpanel') && !SETUP.cal;
  }));

  console.log('\n════ the panel writes to the channel it says it does ════');
  await ev(()=>{ SETUP.sel = 5; setupRender(); });
  const wrote = await ev(()=>{
    const before = {sp:HW.channels()[5].speed, min:HW.channels()[5].min, other:HW.channels()[6].speed};
    const sp = document.querySelector('#chCfg [data-k=speed]');
    sp.value = 123; sp.dispatchEvent(new Event('input',{bubbles:true}));
    const mn = document.querySelector('#chCfg [data-k=minUs]');
    mn.value = 900; mn.dispatchEvent(new Event('input',{bubbles:true}));
    setupCalCommit(); setupRender();          // the ends are staged; commit them
    return {before, sp:HW.channels()[5].speed, min:HW.channels()[5].min, other:HW.channels()[6].speed};
  });
  ok('a number typed in the panel lands on that channel', wrote.sp === 123 && wrote.min === 3600, JSON.stringify(wrote));
  ok('…and on no other', wrote.other === wrote.before.other, JSON.stringify(wrote));

  console.log('\n════ you do not lose your place (the jumping) ════');
  const jump = await ev(()=>{
    const body = $('setBody');
    body.scrollTop = 300;
    const before = body.scrollTop;
    const box = document.querySelector('tr[data-ch="12"] [data-k=use]');
    box.checked = false; box.dispatchEvent(new Event('input',{bubbles:true}));
    return {before, after: $('setBody').scrollTop, used: /^servo/i.test(HW.channels()[12].mode||'')};
  });
  ok('un-ticking a servo does not scroll the page back to the top',
     jump.before > 0 && jump.after === jump.before, JSON.stringify(jump));
  ok('…and it really did untick it', jump.used === false);
  const caret = await ev(()=>{
    const box = document.querySelector('tr[data-ch="2"] [data-k=name]');
    box.focus(); box.value = 'Dome Pie 3x';
    box.setSelectionRange(4,4);
    box.dispatchEvent(new Event('input',{bubbles:true}));
    /* something that re-renders, while the field has focus */
    setupRender();
    const now = document.activeElement;
    return {k: now && now.dataset ? now.dataset.k : '', ch: now && now.closest ? (now.closest('[data-ch]')||{dataset:{}}).dataset.ch : '',
            at: now ? now.selectionStart : -1};
  });
  ok('a re-render puts the keyboard back in the field you were typing in',
     caret.k === 'name' && caret.ch === '2', JSON.stringify(caret));
  ok('…with the caret where it was', caret.at === 4, JSON.stringify(caret));

  console.log('\n════ the test button is the DIRECTED pair ════');
  const test = await ev(()=>{
    const c = HW.channels()[4];
    c.min = 7800; c.max = 4200;              // reversed: shut is the BIGGER number
    HW.save(); HW.rebuild(true);
    HW.drive(4, c.min);                      // start it where a shut panel is
    setupRender();
    const b = document.querySelector('tr[data-ch="4"] [data-k=test]');
    const word0 = b.textContent;
    b.click();
    const t1 = HW.engine().st[4].target;
    document.querySelector('tr[data-ch="4"] [data-k=test]').click();
    const t2 = HW.engine().st[4].target;
    return {word0, t1, t2, min:c.min, max:c.max};
  });
  ok('it says "open" while the channel is shut', test.word0 === 'open', test.word0);
  ok('pressing it drives to the OPEN end, even reversed', test.t1 === 4200, JSON.stringify(test));
  ok('pressing it again drives back to the SHUT end', test.t2 === 7800, JSON.stringify(test));

  console.log('\n════ apply says what it applies to ════');
  const applyTxt = await ev(()=>{
    SETUP.pick = [0,1,2]; setupRender();
    return document.querySelector('[data-act=applysel]').textContent;
  });
  ok('the button names the count', /all 3 selected/.test(applyTxt), applyTxt);
  ok('…and is disabled with nothing ticked',
     await ev(()=>{ SETUP.pick = []; setupRender();
       return document.querySelector('[data-act=applysel]').disabled; }));

  console.log('\n════ the dome map turns ════');
  await ev(()=>{ SETUP.sel = 0; setupDomeOpen(); });
  await page.waitForTimeout(200);
  ok('there is a rotation control', await ev(()=>!!$('domeRot')));
  /* Mike, 2026-08-19: "move rotate to under the image" — a control belongs
     beside what it changes, and the panel header is where you go to LEAVE */
  ok('…and it sits under the drawing, not in the header', await ev(()=>{
    const r = $('domeRot'), svg = $('domeSvg');
    return !!r && !!svg
        && r.getBoundingClientRect().top > svg.getBoundingClientRect().top
        && !document.querySelector('.calhead #domeRot')
        && !!document.querySelector('.domrotbar #domeRot');
  }));
  ok('…and reset came with it', await ev(()=>
    !!document.querySelector('.domrotbar [data-dome="0"]')));
  const rot = await ev(()=>{
    const before = document.querySelector('#domeSvg g').getAttribute('transform') || '';
    const r = $('domeRot'); r.value = 90; r.dispatchEvent(new Event('input',{bubbles:true}));
    const g = document.querySelector('#domeSvg g');
    return {before, after: g.getAttribute('transform') || '', pref: PREFS.domeRot,
            upright: document.querySelectorAll('#domeSvg text[transform]').length,
            texts: document.querySelectorAll('#domeSvg text').length};
  });
  ok('the whole drawing is rotated by one transform', /rotate\(90\)/.test(rot.after), JSON.stringify(rot.after));
  ok('every label is turned back so it stays readable',
     rot.upright === rot.texts && rot.texts > 10, rot.upright+' of '+rot.texts);
  ok('the angle is remembered', rot.pref === 90, String(rot.pref));
  ok('reset puts it back', await ev(()=>{
    document.querySelector('[data-dome="0"]').click();
    return PREFS.domeRot === 0 && !/rotate/.test(document.querySelector('#domeSvg g').getAttribute('transform')||'');
  }));
  const domeJump = await ev(()=>{
    const body = $('setBody');
    body.scrollTop = 260;
    const before = body.scrollTop;
    const g = document.querySelector('#domeSvg g.dmpie, #domeSvg g.dm');
    if(g) g.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return {before, after: $('setBody').scrollTop};
  });
  ok('clicking a panel on the map does not throw you up the screen',
     domeJump.after === domeJump.before, JSON.stringify(domeJump));
  await ev(()=>setupDomeClose());

  console.log('\n════ the PCA9685 step asks one question ════');
  await ev(()=>{ SETUP.adv = false; setupGo(1); });
  await page.waitForTimeout(200);
  const pca = await ev(()=>({h:$('setBody').querySelector('h3').textContent, t:$('setBody').textContent,
                             boards:!!$('setBody').querySelector('[data-f=boards]')}));
  ok('the heading is just the board count', /how many pca9685 boards\?$/i.test(pca.h.trim()), pca.h);
  ok('the board count is still asked', pca.boards);
  ok('chained-vs-star is off the step', !/star \(in parallel\)/i.test(pca.t));
  ok('so is the power routing', !/a feed per board/i.test(pca.t));
  ok('but the step still says what they are set to', /signal/i.test(pca.t) && /chained|star/i.test(pca.t));
  const adv = await ev(()=>{ SETUP.adv = true; setupRender();
    return {t:$('setBody').textContent, chain:!!$('setBody').querySelector('[data-f=chain]'),
            power:!!$('setBody').querySelector('[data-f=power]'), amps:!!$('setBody').querySelector('[data-f=supplyA]')}; });
  ok('and Advanced still has all three, so nothing was deleted',
     adv.chain && adv.power && adv.amps, JSON.stringify(adv).slice(0,120));
  await ev(()=>{ SETUP.adv = false; });

  console.log('\n════ the sketches are links ════');
  await ev(()=>setupGo(3));
  await page.waitForTimeout(200);
  const links = await ev(()=>Array.from($('setBody').querySelectorAll('a.setlinkout')).map(a=>({
    href:a.getAttribute('href'), t:a.getAttribute('target'), rel:a.getAttribute('rel')})));
  console.log('  ' + links.length + ' link(s)');
  ok('the Sketch step links out', links.length >= 3, String(links.length));
  ok('PCA_Bridge is one of them', links.some(l=>/pca-studio\/PCA_Bridge$/.test(l.href)), JSON.stringify(links.map(l=>l.href)));
  ok('so is MaestroReplacement', links.some(l=>/examples\/MaestroReplacement$/.test(l.href)));
  ok('they open in a new tab, without a handle back into this one',
     links.every(l=>l.t === '_blank' && /noopener/.test(l.rel||'')));
  /* the constant lives in the PAGE, not in this file — a helper defined in
     the Node process is not defined in the browser, and the reverse is just
     as true (HANDOVER §Traps) */
  const repo = await ev(()=>APP_REPO);
  ok('and they point at this project', !!repo && links.every(l=>l.href.indexOf(repo) === 0), repo);

  /* Mike, 2026-08-19: "does the PCA sketches check for pca boards via a
     scan of all addresses as I and others may jumper them differently".
     They do since v1.53.0 (arduino/MaestroPCA/src/MpcaScan.h), and this
     block is what somebody COPIES into their sketch — so it must not read
     as an instruction about which jumpers to bridge. */
  console.log('\n════ the sketch block says the addresses are found, not fixed ════');
  await ev(()=>setupGo(3));
  await page.waitForTimeout(200);
  const cfg = await ev(()=>$('setBody').querySelector('.setpre').textContent);
  ok('it still shows the driver list', /Adafruit_PWMServoDriver\(0x40\)/.test(cfg));
  ok('…and says the sketch scans for them', /SCANS the bus/.test(cfg), cfg.slice(-220));
  ok('…naming the range and the All Call exclusion', /0x40-0x7F/.test(cfg) && /All Call/.test(cfg));
  ok('the PCA9685 step calls the jumper table a suggestion', await ev(()=>{
    setupGo(1);
    return /scan for the boards/.test($('setBody').textContent)
        && /suggestion, not a requirement/.test($('setBody').textContent);
  }));

  console.log('\n════ selection is visible in light mode ════');
  await ev(()=>{ applyTheme('light'); setupGo(0); });
  await page.waitForTimeout(250);
  const look = await ev(()=>{
    const on = document.querySelector('.setopt.on'), off = document.querySelector('.setopt:not(.on)');
    const cs = getComputedStyle(on), co = getComputedStyle(off);
    return {onBg:cs.backgroundColor, offBg:co.backgroundColor, shadow:cs.boxShadow,
            border:cs.borderLeftColor, tick:getComputedStyle(on.querySelector('b'),'::before').content};
  });
  console.log('  ' + JSON.stringify(look));
  ok('the selected card is filled differently from the others', look.onBg !== look.offBg, look.onBg+' vs '+look.offBg);
  ok('…and carries an accent bar as well as a fill', /inset/.test(look.shadow) && look.shadow.length > 20, look.shadow.slice(0,60));
  ok('…and a tick, so colour is not the only signal', /✓/.test(look.tick), String(look.tick));
  await ev(()=>applyTheme('dark'));

  /* ═══════════════════════════════════════════════════════════════════
     "STILL CANT SEE SERVOS 24 AND ABOVE"  (v1.65.0)

     Mike's screenshot: this wizard, Channels step, three PCA9685s ticked on
     step 2, his bridge reporting 0x40/0x48/0x50 — and under the table,
     `0 channels in use of 24`. A Mini Maestro 24's worth of rows, because
     that is what the BUILD still said. Both numbers right, neither aware of
     the other, and HW.applied()'s reconcile only spoke when MSTR.board was
     already a PCA board — so the build that most needed telling was the one
     case it stayed quiet for. All red on v1.64.0. */
  console.log('\n════ the bench asks for more boards than the build gives ════');
  const gap = await page.evaluate(()=>{
    buildSet('domeServo','mini24'); buildSet('bodyServo','mini24'); wizFinish();
    setBoard('mini24'); makeStarter('dome','mini24');
    /* an hour of somebody's life, which must survive being grown around */
    const c = MSTR.channels[3];
    c.name = 'Pie 4'; c.min = 4111; c.max = 7888; c.act = 'pie3'; c.speed = 80;
    if(typeof setupOpen === 'function') setupOpen();
    SETUP.hw.boards = 3; HW.setSetup(SETUP.hw);
    setupGo(SETUP_STEPS.findIndex(x=>x.key === 'channels'));
    setupRender();
    const el2 = document.getElementById('setChCount');
    return {board: MSTR.board, rows: MSTR.channels.length,
            want: HW.wantCount(), short: HW.short(),
            line: el2 ? el2.textContent.replace(/\s+/g,' ').trim() : '(missing)',
            btn: !!(el2 && el2.querySelector('button[data-act=growboards]'))};
  });
  ok('HW.short() sees the gap the two answers make',
     gap.want === 48 && gap.short && gap.short.have === 24 && gap.short.boards === 3
     && gap.short.missing === 24, JSON.stringify(gap.short));
  ok('the count line names BOTH numbers, not just the table\'s',
     /in use of 24/.test(gap.line) && /3 PCA9685s/.test(gap.line) && /48 channels/.test(gap.line),
     gap.line.slice(0,120));
  ok('…and says exactly which channels have nowhere to go',
     /channels 24-47/.test(gap.line), gap.line.slice(-90));
  ok('…and offers the way across', gap.btn, String(gap.btn));

  const grew = await page.evaluate(()=>{
    const before = HW.count();
    const took = setupAdoptBoards();
    const c = MSTR.channels[3];
    setupRender();
    const el2 = document.getElementById('setChCount');
    return {took, before, after: HW.count(), board: MSTR.board, boards: buildGet().pcaBoards,
            kept: [c.name, c.min, c.max, c.act, c.speed].join('|'),
            row47: !!MSTR.channels[47],
            line: el2 ? el2.textContent.replace(/\s+/g,' ').trim() : '(missing)',
            shortNow: HW.short()};
  });
  ok('the button grows the table to what the boards need',
     grew.took && grew.before === 24 && grew.after === 48 && grew.row47, JSON.stringify(grew).slice(0,150));
  ok('…by changing the BUILD, which is the thing allowed to decide',
     grew.board === 'pca48' && grew.boards === 3, grew.board+' · '+grew.boards);
  ok('…without touching a row somebody calibrated',
     grew.kept === 'Pie 4|4111|7888|pie3|80', grew.kept);
  ok('…and then the line goes quiet', grew.shortNow === null && !/PCA9685s/.test(grew.line), grew.line);

  /* GROW ONLY. HW.trim() is a deliberate no-op and this obeys the same rule:
     a board off the bus, or a wizard answer typed down, must never delete a
     row that carries an endpoint somebody measured. */
  const never = await page.evaluate(()=>{
    SETUP.hw.boards = 1; HW.setSetup(SETUP.hw);
    const before = HW.count();
    return {short: HW.short(), can: setupCanAdoptBoards(), adopt: setupAdoptBoards(),
            before, after: HW.count()};
  });
  ok('asking for FEWER boards never shrinks the table',
     never.short === null && never.can === false && never.adopt === false
     && never.after === never.before && never.after === 48, JSON.stringify(never));

  /* ═══════════════════════════════════════════════════════════════════
     AN IMPORT THAT NEVER REACHED THE HARDWARE  (v1.69.1)

     The engine is a COPY of the channel table, not a view of it: pcaCreate
     reads speed, acceleration, ease and `servo` (from mode) once, at build
     time, and only min/max are read live off the shared array. Every door
     into servoCfgApply() ended at rebuildMaestroUI(), which is three render
     calls — so an imported speed limit stayed a number in a table while the
     board still slammed the panel across at full rate, and a channel the
     file turned INTO a servo could not be driven at all.

     Both halves are asserted on the engine rather than the table, because
     the table was always right; it was the thing that moves that was
     wrong. */
  console.log('\n════ an imported servo config reaches the ENGINE, not just the table ════');
  const impEng = await ev(()=>{
    const c3 = HW.ensure(3), c7 = HW.ensure(7);
    c3.mode = 'Servo'; c3.min = 4800; c3.max = 6400; c3.home = 4800; c3.homemode = 'Goto';
    c3.speed = 0; c3.acceleration = 0; c3.ease = 'none'; c3.releaseMs = 0;
    c7.mode = 'Input'; c7.speed = 0; c7.acceleration = 0;
    HW.save(); HW.rebuild(false);                 // an engine built from THIS table
    const file = JSON.stringify({kind:'r2sim.servo-config', version:1, channels:[
      {i:3, speed:80},
      {i:7, mode:'Servo', min:4800, max:6400, home:4800, homemode:'Goto'}]});
    servoCfgImportText(file, 'R2-servos-bench.json');
    const E = HW.engine();
    HW.drive(3, 6400);                            // 4800 → 6400 qus, one full throw
    HW.tick(10);                                  // exactly one 10 ms engine tick
    const moved = HW.pos(3) - 4800;
    HW.drive(7, 6400); HW.tick(10);
    return {tableSpeed: HW.channels()[3].speed, engineSpeed: E.st[3].speed,
            tableMode: HW.channels()[7].mode, engineServo: E.st[7].servo,
            moved, ch7pos: HW.pos(7)};
  });
  console.log('  ' + JSON.stringify(impEng));
  ok('the speed in the file is the speed the engine runs at',
     impEng.tableSpeed === 80 && impEng.engineSpeed === 80, JSON.stringify(impEng));
  ok('…so one 10 ms tick cannot cross the whole throw any more',
     impEng.moved > 0 && impEng.moved < 1600, String(impEng.moved));
  ok('a channel the file turns into a Servo can actually be driven',
     impEng.engineServo === true && impEng.ch7pos === 6400, JSON.stringify(impEng));

  /* ═══════════════════════════════════════════════════════════════════
     THE TWO FIELDS THE SERVO CONFIG DROPPED  (v1.69.1)

     `releaseMs` and `ease` are per-channel bench settings; both C headers
     carry them and both firmware doors consume them. They were missing
     from SERVO_CFG_FIELDS, so the two .jsons built on servoCfgFrom() — the
     bench's own R2-servos-*.json and the choreography file that
     impChooseSave('servo') writes as the "save a copy first" safety gate —
     left them behind without saying so. The safety net dropped the
     settings it exists to preserve. */
  console.log('\n════ the servo config carries release and ease ════');
  const relOut = await ev(()=>{
    const c = HW.ensure(3);
    c.releaseMs = 1500; c.ease = 'overshoot';
    const row = servoCfgExportObj().channels[3];
    const cho = (typeof seqLibExportObj === 'function') ? seqLibExportObj().maestro.channels[3] : {};
    return {rel: row.releaseMs, ease: row.ease, choRel: cho.releaseMs, choEase: cho.ease};
  });
  console.log('  ' + JSON.stringify(relOut));
  ok('the exported servo config has the release time in it', relOut.rel === 1500, String(relOut.rel));
  ok('…and the ease', relOut.ease === 'overshoot', String(relOut.ease));
  ok('…and so does the copy the "save first" gate writes',
     relOut.choRel === 1500 && relOut.choEase === 'overshoot', JSON.stringify(relOut));
  const relBack = await ev(()=>{
    const file = JSON.stringify(servoCfgExportObj());   // written with 1500 / overshoot
    const c = HW.ensure(3);
    c.releaseMs = 0; c.ease = 'none';                   // as if on somebody else's bench
    servoCfgImportText(file, 'R2-servos-new.json');
    const now = HW.channels()[3];
    return {rel: now.releaseMs, ease: now.ease, engRel: HW.engine().st[3].releaseMs};
  });
  ok('reading that file back puts both of them on the channel',
     relBack.rel === 1500 && relBack.ease === 'overshoot', JSON.stringify(relBack));
  ok('…and on the engine, which is what stops pulsing', relBack.engRel === 1500, String(relBack.engRel));
  /* an absent key has always meant "keep what is there" (servoCfgApply only
     copies fields the row actually defines), and a config somebody kept for
     a year must not start clearing a setting it has never heard of */
  const relOld = await ev(()=>{
    const c = HW.ensure(3);
    c.releaseMs = 1500; c.ease = 'overshoot';
    const o = servoCfgExportObj();
    o.channels.forEach(r=>{ delete r.releaseMs; delete r.ease; });   // a pre-v1.69.1 file
    servoCfgImportText(JSON.stringify(o), 'R2-servos-2026-01-01.json');
    const now = HW.channels()[3];
    return {rel: now.releaseMs, ease: now.ease};
  });
  ok('an older file without them leaves what is already set alone',
     relOld.rel === 1500 && relOld.ease === 'overshoot', JSON.stringify(relOld));

  /* ═══════════════════════════════════════════════════════════════════
     THE READER AGREES WITH THE WRITER ABOUT NAMES  (v1.69.1)

     pcaCommentSafe() (pca-gen.js) turns `* /` into `* /` and every newline
     into a space before a name reaches a C comment, because those comments
     are where pcaHeaderParse reads the name back OUT. A hand-edited header
     is the one that never went through it, so the reader has to hold the
     same line — otherwise a channel comes back carrying a newline in its
     name, and the round trip stops being a round trip. */
  console.log('\n════ a name read out of a row comment cannot carry a newline ════');
  const meta = await ev(()=>{
    const clean = pcaRowMeta('ch 3 Dome Pie 3', 3);
    const dirty = pcaRowMeta('ch 3 Dome\nPie 3', 3);
    return {clean: clean.name, dirty: dirty.name,
            written: (typeof pcaCommentSafe === 'function') ? pcaCommentSafe('Dome\nPie 3') : ''};
  });
  console.log('  ' + JSON.stringify(meta));
  ok('a newline in a hand-edited row comment never becomes part of a name',
     !/[\r\n]/.test(meta.dirty), JSON.stringify(meta.dirty));
  ok('…and the name it reads is the one pcaCommentSafe would have written',
     meta.dirty === meta.clean && meta.dirty === meta.written, JSON.stringify(meta));

  /* ═══════════════════════════════════════════════════════════════════
     THE SAFE RANGE THE PANEL NAMED AND DID NOT DEFEND  (v1.70.1)

     A walkthrough typed 2700 into Set MAX and 2600 into Set MIN. Nothing
     turned red, nothing warned, `save servo setting` took it, and what came
     out was a channel whose centre sits outside its own min–max —
     `shut 2600 · centre 1000 · open 2700`, exported as min="10400"
     max="10800" home="4000". The panel above the dial had been saying
     `safe range · 1000–2000 µs` the whole time, and a red chip appeared
     afterwards, at the top of the table, off-screen, counting against a
     THIRD pair of numbers.

     Mike's ruling: "500 – 2500 but warn when outside of 1000–2000". Two
     bands and one policy, everywhere. The outer band is a REFUSAL and not
     another note, because a horn held against a hard stop strips its gears
     in seconds and does it quietly; the inner one is a warning and must
     stay possible, because "I know, my servo takes this" is a real answer.

     Everything below is asserted at the POINT OF ENTRY. A number that only
     goes red after it has been saved is the fault, not the fix.
     ═══════════════════════════════════════════════════════════════════ */
  console.log('\n════ the two bands are one source, everywhere they are quoted ════');
  await ev(()=>{
    setupGo(SETUP_STEPS.findIndex(x=>x.key === 'channels'));
    setupUse(9, true);
    const c = HW.channels()[9];
    c.min = 4000; c.max = 8000; c.home = 6000; c.calibrated = false;
    HW.save(); HW.rebuild(true);
    SETUP.sel = 9; SETUP.cal = null; setupRender();
  });
  await page.waitForTimeout(150);
  const src = await ev(()=>{
    const S = (typeof PW_STD === 'undefined') ? null : PW_STD;
    const A = (typeof PW_ABS === 'undefined') ? null : PW_ABS;
    const safe = (typeof CAL_SAFE === 'undefined') ? null : CAL_SAFE;
    const full = (typeof CAL_FULL === 'undefined') ? null : CAL_FULL;
    const ap = (typeof setupApplyDef === 'function') ? setupApplyDef('maxUs') : {};
    const box = document.querySelector('#chCfg [data-k=maxUs]');
    const dial = $('calLmax');
    return {
      std: S && [S.lo, S.hi], abs: A && [A.lo, A.hi],
      safe: safe && [safe.lo, safe.hi], full: full && [full.lo, full.hi],
      /* the same OBJECT, not a second pair that happens to agree today */
      same: (safe === S) && (full === A),
      apply: [ap.min, ap.max],
      panelBox: box ? [box.getAttribute('min'), box.getAttribute('max')] : null,
      dialBox:  dial ? [dial.getAttribute('min'), dial.getAttribute('max')] : null
    };
  });
  console.log('  ' + JSON.stringify(src));
  ok('the dial’s cautious sweep IS the standard band, not a copy of it',
     src.same && JSON.stringify(src.safe) === JSON.stringify(src.std), JSON.stringify([src.safe, src.std]));
  ok('…and its full sweep IS the absolute band — the same object, not a second pair',
     src.same && JSON.stringify(src.full) === JSON.stringify(src.abs), JSON.stringify([src.full, src.abs]));
  ok('the apply bar’s µs fields stop at the same edge, not at 400–2600',
     src.apply[0] === 500 && src.apply[1] === 2500, JSON.stringify(src.apply));
  ok('the panel’s own boxes do too, not 300–2700',
     JSON.stringify(src.panelBox) === '["500","2500"]', JSON.stringify(src.panelBox));
  ok('…and so do the dial’s three end boxes',
     JSON.stringify(src.dialBox) === '["500","2500"]', JSON.stringify(src.dialBox));

  console.log('\n════ outside 500–2500 is refused where it is typed ════');
  const refused = await ev(()=>{
    SETUP.sel = 9; SETUP.cal = null; setupRender();
    const box = $('calLmax');
    box.value = '2700';
    box.dispatchEvent(new Event('change', {bubbles:true}));
    const say = $('calSay');
    return {
      staged: SETUP.cal ? SETUP.cal.max : -1,
      chan: HW.channels()[9].max,
      cls: box.className,
      border: getComputedStyle(box).borderColor,
      clean: getComputedStyle($('calLctr')).borderColor,
      why: say ? say.textContent.replace(/\s+/g,' ').trim() : '(no message at the control)',
      saveOff: !!(document.querySelector('[data-cal=ok]') || {}).disabled
    };
  });
  console.log('  ' + JSON.stringify(refused));
  ok('2700 µs never reaches the dial’s staged end', refused.staged === 8000, String(refused.staged));
  ok('…nor the channel', refused.chan === 8000, String(refused.chan));
  ok('…the box you typed it into goes red', refused.cls === 'bad', refused.cls);
  ok('…and red is a colour, not just a class name',
     refused.border !== refused.clean && refused.border !== '', refused.border+' vs '+refused.clean);
  ok('…and the reason is on screen AT THE CONTROL, with both numbers in it',
     /500/.test(refused.why) && /2500/.test(refused.why), refused.why);
  /* and save is dead while it stands there. A save that succeeded with
     2700 in the box would report "saved: 1000–2000 µs" and be read as
     having taken the 2700 — the number on screen has to be one that could
     be saved before saving is offered. */
  ok('…and save is blocked while the refused number is still in the box',
     refused.saveOff, String(refused.saveOff));
  const cleared = await ev(()=>{
    const box = $('calLmax');
    box.value = '1950';
    box.dispatchEvent(new Event('change', {bubbles:true}));
    return {off: !!(document.querySelector('[data-cal=ok]')||{}).disabled,
            cls: ($('calLmax')||{}).className,
            why: (($('calSay')||{textContent:''}).textContent).trim()};
  });
  ok('…and comes back the moment a width that fits is typed',
     !cleared.off && cleared.cls === '' && cleared.why === '', JSON.stringify(cleared));

  console.log('\n════ save is blocked while an end is out of band ════');
  const blocked = await ev(()=>{
    /* as an imported .mstr or an older calibration arrives — past every
       control, straight onto the staged trio */
    SETUP.cal.max = 10800;
    if(typeof calPaint === 'function') calPaint();
    const btn = document.querySelector('[data-cal=ok]');
    const off = !!btn.disabled;
    btn.click();
    const say = $('calSay');
    return {off, chan: HW.channels()[9].max, open: !!SETUP.cal,
            why: say ? say.textContent.replace(/\s+/g,' ').trim() : '(no message)'};
  });
  console.log('  ' + JSON.stringify(blocked));
  ok('save servo setting does not write it', blocked.chan !== 10800, String(blocked.chan));
  ok('…the button says it is blocked before you press it', blocked.off, String(blocked.off));
  ok('…and the reason is still at the control', /500/.test(blocked.why) && /2500/.test(blocked.why), blocked.why);

  console.log('\n════ between the bands is legitimate: accepted, and warned ════');
  const warned = await ev(()=>{
    SETUP.cal.max = 8000; if(typeof calPaint === 'function') calPaint();
    const box = $('calLmax');
    box.value = '2200';
    box.dispatchEvent(new Event('change', {bubbles:true}));
    const say = $('calSay');
    /* re-queried: an accepted width past the cautious sweep unlocks the
       full one, which rebuilds the dial — the node typed into is gone */
    const cls = ($('calLmax')||{}).className;
    const why = say ? say.textContent.replace(/\s+/g,' ').trim() : '(no message)';
    const off = !!(document.querySelector('[data-cal=ok]') || {}).disabled;
    document.querySelector('[data-cal=ok]').click();
    return {cls, why, off, staged: 8800, chan: HW.channels()[9].max};
  });
  console.log('  ' + JSON.stringify(warned));
  ok('2200 µs is taken — "I know, my servo takes this" stays possible',
     warned.chan === 8800, String(warned.chan));
  ok('…save is not blocked by a warning', !warned.off, String(warned.off));
  ok('…the box is amber, not red', warned.cls === 'warn', warned.cls);
  ok('…and it says which band it is outside', /1000/.test(warned.why) && /2000/.test(warned.why), warned.why);

  console.log('\n════ inside 1000–2000 there is no decoration at all ════');
  const silent = await ev(()=>{
    const box = $('calLmax');
    box.value = '1900';
    box.dispatchEvent(new Event('change', {bubbles:true}));
    const say = $('calSay');
    return {cls: box.className, why: say ? say.textContent.trim() : '',
            panel: (document.querySelector('#chCfg [data-k=maxUs]')||{}).className};
  });
  ok('a width inside the standard band decorates nothing',
     silent.cls === '' && silent.why === '', JSON.stringify(silent));

  console.log('\n════ a centre outside its own min–max is refused, in its own words ════');
  const centre = await ev(()=>{
    SETUP.sel = 9; SETUP.cal = null; setupRender();
    /* a legitimately wide pair — both ends inside 500–2500 — with a centre
       that is nowhere between them */
    SETUP.cal.min = 8800; SETUP.cal.max = 9600; SETUP.cal.home = 4000;
    if(typeof calPaint === 'function') calPaint();
    const before = HW.channels()[9].home;
    const off = !!(document.querySelector('[data-cal=ok]') || {}).disabled;
    document.querySelector('[data-cal=ok]').click();
    const say = $('calSay');
    return {before, off, home: HW.channels()[9].home,
            ctrCls: ($('calLctr')||{}).className,
            why: say ? say.textContent.replace(/\s+/g,' ').trim() : '(no message)'};
  });
  console.log('  ' + JSON.stringify(centre));
  ok('a centre outside the pair cannot be saved', centre.home !== 4000, String(centre.home));
  ok('…the centre box is the one that goes red', centre.ctrCls === 'bad', centre.ctrCls);
  ok('…and it reads differently from an out-of-band end',
     /centre/i.test(centre.why) && !/500–2500/.test(centre.why), centre.why);
  const typedCtr = await ev(()=>{
    SETUP.sel = 9; SETUP.cal = null; setupRender();
    const box = $('calLctr');
    box.value = '2400';                       // outside shut 1000 – open 2000
    box.dispatchEvent(new Event('change', {bubbles:true}));
    return {staged: SETUP.cal.home, cls: ($('calLctr')||{}).className,
            why: (($('calSay')||{textContent:''}).textContent).replace(/\s+/g,' ').trim()};
  });
  ok('a centre TYPED outside the travel is refused where it is typed',
     typedCtr.staged !== 9600 && typedCtr.cls === 'bad', JSON.stringify(typedCtr));

  /* THE OTHER HALF OF THE SAME RULE, and the reason it is not just "refuse
     anything that leaves a stray centre". Moving an END is the ordinary
     way round the dial — shut, then open, then centre — and a channel that
     arrives with its centre sitting on its shut end (every starter does)
     would otherwise refuse the very first number you typed. The end is
     what you touched, so the end wins and the centre comes with it; what
     must never happen is that the pair is written with the centre left
     outside, and it is not. */
  const follow = await ev(()=>{
    const c = HW.channels()[9];
    c.min = 4000; c.max = 8000; c.home = 4000;   // centre sitting on the shut end
    HW.save(); HW.rebuild(true); SETUP.cal = null; SETUP.sel = 9; setupRender();
    const box = $('calLmin');
    box.value = '1100';                           // tighten shut past the centre
    box.dispatchEvent(new Event('change', {bubbles:true}));
    const staged = {min: SETUP.cal.min, home: SETUP.cal.home};
    const off = !!(document.querySelector('[data-cal=ok]')||{}).disabled;
    document.querySelector('[data-cal=ok]').click();
    const now = HW.channels()[9];
    return {staged, off, min: now.min, home: now.home};
  });
  console.log('  ' + JSON.stringify(follow));
  ok('an end that swallows the centre brings the centre with it',
     follow.staged.min === 4400 && follow.staged.home === 4400, JSON.stringify(follow.staged));
  ok('…so the end you typed is the one that lands, and saves',
     !follow.off && follow.min === 4400 && follow.home === 4400, JSON.stringify(follow));
  /* and the same for the gesture this dial is actually FOR: turn to the
     shut end, press Set MIN, on a channel whose centre arrived on its old
     shut end. If that were a refusal, the button in the middle of the
     screen would refuse the first press of a normal calibration. */
  const captured = await ev(()=>{
    const c = HW.channels()[9];
    c.min = 4000; c.max = 8000; c.home = 4000; HW.save(); HW.rebuild(true);
    SETUP.cal = null; SETUP.sel = 9; setupRender();
    calSet(4800);                                  // turn the dial to 1200 µs
    document.querySelector('[data-cap=min]').click();
    return {min: SETUP.cal.min, home: SETUP.cal.home,
            off: !!(document.querySelector('[data-cal=ok]')||{}).disabled};
  });
  ok('capturing MIN past the centre is not a refusal either',
     captured.min === 4800 && captured.home === 4800 && !captured.off, JSON.stringify(captured));

  console.log('\n════ the walkthrough itself, typed in the same order ════');
  const walk = await ev(()=>{
    const c = HW.channels()[9];
    c.min = 4000; c.max = 8000; c.home = 6000; HW.save(); HW.rebuild(true);
    SETUP.cal = null; SETUP.sel = 9; setupRender();
    const type = (id, v)=>{ const b = $(id); b.value = String(v);
                            b.dispatchEvent(new Event('change', {bubbles:true})); };
    type('calLmax', 2700);
    type('calLmin', 2600);
    type('calLctr', 1000);
    const btn = document.querySelector('[data-cal=ok]'); btn.click();
    const now = HW.channels()[9];
    return {min: now.min, home: now.home, max: now.max,
            words: (($('calSay')||{textContent:''}).textContent).replace(/\s+/g,' ').trim()};
  });
  console.log('  ' + JSON.stringify(walk));
  ok('shut 2600 · centre 1000 · open 2700 is impossible to save',
     !(walk.min === 10400 && walk.max === 10800 && walk.home === 4000), JSON.stringify(walk));
  ok('…the channel keeps the ends it had', walk.min === 4000 && walk.max === 8000, JSON.stringify(walk));

  console.log('\n════ the gate and calDrive() stay apart ════');
  const drove = await ev(()=>{
    const c = HW.channels()[9];
    c.min = 4532; c.max = 7292; c.home = 6000; HW.save(); HW.rebuild(true);
    SETUP.cal = null; SETUP.sel = 9; setupRender();
    SETUP.cal.wide = true; setupCalRender();
    calSet(9600);                       // 2400 µs: past the stored stops, inside 500–2500
    return {min: c.min, max: c.max, target: HW.engine().st[9].target, pos: SETUP.cal.pos,
            staged: [SETUP.cal.min, SETUP.cal.max]};
  });
  console.log('  ' + JSON.stringify(drove));
  ok('the dial still reaches past the stored stops while you measure',
     drove.target === 9600 && drove.pos === 9600, JSON.stringify(drove));
  ok('…and the one-call widening is not mistaken for an end being set',
     drove.min === 4532 && drove.max === 7292
     && drove.staged[0] === 4532 && drove.staged[1] === 7292, JSON.stringify(drove));

  console.log('\n════ the chip at the top of the table agrees with the control ════');
  const chip = await ev(()=>{
    const c = HW.channels()[9];
    c.min = 10400; c.max = 10800; c.home = 4000;   // as a file would carry it
    HW.save(); HW.rebuild(true); SETUP.cal = null; setupRender();
    const f = document.querySelector('.pwflag.bad');
    const say = $('calSay');
    return {chip: f ? f.textContent.replace(/\s+/g,' ').trim() : '(no chip)',
            title: f ? (f.getAttribute('title')||'') : '',
            why: say ? say.textContent.replace(/\s+/g,' ').trim() : '(no message)'};
  });
  console.log('  ' + JSON.stringify(chip));
  ok('the chip still counts what a FILE can still carry in', /channel/.test(chip.chip), chip.chip);
  ok('…quoting the same band the control quotes',
     /500/.test(chip.chip) && /2500/.test(chip.chip) && /500/.test(chip.why), chip.chip+' | '+chip.why);
  ok('…and saying it cannot have been typed here', /file|import|older/i.test(chip.title), chip.title);
  await ev(()=>{
    const c = HW.channels()[9];
    c.min = 4000; c.max = 8000; c.home = 6000; HW.save(); HW.rebuild(true);
    SETUP.cal = null; setupRender();
  });

  console.log('\n════ no page errors ════');
  ok('nothing threw', errs.length === 0, errs.slice(0,3).join(' | '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
