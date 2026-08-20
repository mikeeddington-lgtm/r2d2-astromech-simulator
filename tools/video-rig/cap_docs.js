/* =====================================================================
   DOCUMENTATION CLIPS — the seven short films in docs/manual/

   Every clip in the builder's manual is captured from the real dist,
   headless and deterministically, by this one file. Run it beside a built
   `R2D2-Simulator.html` (lib.js loads the copy next to itself):

       node tools/video-rig/cap_docs.js            # all seven
       node tools/video-rig/cap_docs.js bench      # just one

   Frames land in `captures/<name>/f####.jpg`; `docs/manual/src/build.py`
   encodes them and inlines them into the manual.

   ------------------------------------------------------- THE ONE RULE
   **Pace every interaction by CAPTURED FRAMES, never by wall clock.**
   swiftshader renders about one frame a second, so a `waitForTimeout(60)`
   between two steps of a slider is not 60 ms of film — it is a twentieth
   of a single frame, and the whole sweep lands inside one image. That is
   how the first bench clip came out with the dial sitting still at 1000
   for its entire length. `untilFrames(count, n)` is the clock here.

   The other traps this file already pays for:
   - `calSlide` is in **quarter-microseconds**. Writing 1000 does not put
     the dial at 1000 µs, it clamps to the bottom of the range. 4000–8000.
   - the dome map draws into `#domeWrap`, below the fold — scroll it into
     view, and click the `<g>` groups inside `#domeSvg`; there are no
     data-key attributes to aim at.
   - the import chooser needs the file loaded BEFORE the job is opened, or
     `jobwizOpen()` re-renders back to the four-job menu.
   - a wizard finished with `wizFinish()` may leave an empty channel table;
     `makeStarter('dome','mini18')` gives the bench something to show.
   ===================================================================== */
const { boot, installClock, burst, untilFrames, still } = require('./lib');

const only = process.argv[2] || '';
const CAPS = '/tmp/w/captures';           // burst() writes under process.cwd()

(async () => {
  const { browser, page } = await boot({ width: 1280, height: 1000 });
  const ev = f => page.evaluate(f);
  const wait = ms => page.waitForTimeout(ms);
  await installClock(page);
  const cdp = await page.context().newCDPSession(page);
  const run = async (n, fn) => {
    if (only && only !== n) return;
    try { await fn(); console.log('CLIP OK', n); }
    catch (e) { console.log('CLIP FAIL', n, e.message); }
  };

  /* ---------------------------------------------- 1. the setup wizard */
  await run('setup', async () => {
    await ev(() => wizGo(0));
    await wait(1200);
    await burst(page, cdp, 'setup', 170, async (p, count) => {
      for (let k = 1; k <= 9; k++) {
        await untilFrames(count, 14 + (k - 1) * 17);
        await p.evaluate(i => wizGo(i), k);
      }
      await untilFrames(count, 170);
    });
  });

  /* leave the wizard, and make sure there is a channel table to show */
  await ev(() => { try { wizFinish(); } catch (e) { PREFS.seenStartup = true; closeStartup(); } });
  await wait(2500);
  await ev(() => {
    document.querySelectorAll('button,span,div').forEach(b => {
      if (b.textContent.trim() === '×' && /Where next/.test((b.closest('div') || {}).textContent || '')) b.click();
    });
    try { if (!(MSTR.channels || []).length) makeStarter('dome', 'mini18'); } catch (e) {}
  });
  await wait(800);

  /* ------------------------------------------------------- 2. driving */
  await run('drive', async () => {
    await ev(() => { wsSet('drive'); CAM.theta = 2.4; CAM.phi = 1.10; CAM.dist = 2.5; });
    await wait(2500);
    await burst(page, cdp, 'drive', 260, async (p, count) => {
      await untilFrames(count, 12);
      await p.keyboard.press('Enter');                                 // START
      await untilFrames(count, 30);
      await p.keyboard.down('w');
      await untilFrames(count, 62);
      await p.keyboard.down('d');
      await untilFrames(count, 90);
      await p.keyboard.up('d'); await p.keyboard.up('w');
      await untilFrames(count, 104);
      await p.keyboard.down('j');                                      // dome
      await untilFrames(count, 132);
      await p.keyboard.up('j');
      await p.keyboard.down('c'); await p.keyboard.down('ArrowUp');    // pies open
      await untilFrames(count, 170);
      await p.keyboard.up('ArrowUp'); await p.keyboard.up('c');
      await p.keyboard.down('q'); await p.keyboard.down('ArrowRight'); // utility arms
      await untilFrames(count, 205);
      await p.keyboard.up('ArrowRight'); await p.keyboard.up('q');
      await p.keyboard.press('f');                                     // holos
      await untilFrames(count, 235);
      await p.keyboard.down('c'); await p.keyboard.down('ArrowDown');  // pies shut
      await untilFrames(count, 258);
      await p.keyboard.up('ArrowDown'); await p.keyboard.up('c');
      await p.keyboard.press('Enter');                                 // disarm
      await untilFrames(count, 260);
    });
  });

  /* --------------------------------------- 3. the bench: ends on a dial */
  await run('bench', async () => {
    await ev(() => setupOpen(4));
    await wait(2000);
    await burst(page, cdp, 'bench', 240, async (p, count) => {
      await untilFrames(count, 12);
      await p.evaluate(() => {
        const rs = [...document.querySelectorAll('#setupWrap tr')].filter(r => /Dome Pie 1/.test(r.textContent));
        if (rs[0]) { const c = rs[0].querySelector('td'); (c || rs[0]).click(); }
        const n = document.getElementById('calNum'); if (n) n.scrollIntoView({ block: 'center' });
      });
      await untilFrames(count, 40);
      /* QUARTER-microseconds: 4000-8000 is 1000-2000 µs */
      const setQ = q => p.evaluate(v => {
        const s = document.getElementById('calSlide');
        if (s) { s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); }
      }, q);
      for (let k = 0; k < 25; k++) { await setQ(4000 + k * 160); await untilFrames(count, 42 + k * 3); }
      await untilFrames(count, 122);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Set MAX/i.test(x.textContent)); if (b) b.click(); });
      await untilFrames(count, 145);
      for (let k = 0; k < 25; k++) { await setQ(8000 - k * 160); await untilFrames(count, 147 + k * 3); }
      await untilFrames(count, 226);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Set MIN/i.test(x.textContent)); if (b) b.click(); });
      await untilFrames(count, 240);
    });
    await ev(() => { try { setupClose(); } catch (e) {} });
    await wait(1200);
  });

  /* --------------------------------------------------- 4. the dome map */
  await run('domemap', async () => {
    /* free some panels first, or the map has nothing left to place */
    await ev(() => {
      const ch = HW.channels();
      for (let i = 5; i < 12 && i < ch.length; i++) if (ch[i] && ch[i].act) HW.setPart(i, '');
      try { HW.save && HW.save(); } catch (e) {}
    });
    await ev(() => setupOpen(4));
    await wait(1600);
    await ev(() => { const b = [...document.querySelectorAll('button')].find(x => /dome map/i.test(x.textContent)); if (b) b.click(); });
    await wait(1600);
    await ev(() => { const h = document.getElementById('domeWrap'); if (h) h.scrollIntoView({ block: 'center' }); });
    await wait(800);
    await burst(page, cdp, 'domemap', 160, async (p, count) => {
      await untilFrames(count, 16);
      for (let k = 0; k < 7; k++) {
        await p.evaluate(() => {
          const h = document.getElementById('domeWrap'); if (!h) return;
          const svg = document.getElementById('domeSvg') || h.querySelector('svg'); if (!svg) return;
          const g = [...svg.querySelectorAll('g')].filter(x => /dmpie|dmpan/.test(x.getAttribute('class') || ''));
          const free = g.find(x => !/\bon\b|mapped/.test(x.getAttribute('class') || ''));
          (free || g[0]) && (free || g[0]).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await untilFrames(count, 24 + k * 18);
      }
      await untilFrames(count, 160);
    });
    await ev(() => { try { setupDomeClose(); } catch (e) {} try { setupClose(); } catch (e) {} });
    await wait(1000);
  });

  /* --------------------------------------------------- 5. bricks */
  await run('bricks', async () => {
    await ev(() => wsSet('seq'));
    await wait(2500);
    await ev(() => { const b = [...document.querySelectorAll('button')].find(x => /New\s+(sequence|routine)/i.test(x.textContent)); if (b) b.click(); });
    await wait(1500);
    await burst(page, cdp, 'bricks', 260, async (p, count) => {
      await untilFrames(count, 14);
      await p.evaluate(() => {
        const sel = document.getElementById('blkGroupSel');
        const o = [...sel.options].find(x => /pie/i.test(x.textContent)) || sel.options[0];
        sel.value = o.value; sel.dispatchEvent(new Event('change'));
      });
      await untilFrames(count, 34);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Mexican wave/i.test(x.textContent)); if (b) b.click(); });
      await untilFrames(count, 70);
      await p.evaluate(() => { const b = document.getElementById('sqPlay') || [...document.querySelectorAll('button')].find(x => /^\s*▶/.test(x.textContent)); if (b) b.click(); });
      await untilFrames(count, 260);
    });
  });

  /* ------------------------------------------- 6. the import chooser */
  await run('import', async () => {
    const t = await ev(() => { try { return buildMstrText() || ''; } catch (e) { return ''; } });
    if (t.length < 500) throw new Error('nothing to import — no channels or sequences in this state');
    await ev(() => { try { wsSet('bench'); } catch (e) {} });
    await wait(1400);
    await burst(page, cdp, 'import', 130, async (p, count) => {
      await untilFrames(count, 10);
      await p.evaluate(() => { if (typeof jobwizOpen === 'function') jobwizOpen(); });
      await untilFrames(count, 34);
      /* load FIRST, then open the job — the other order re-renders the menu */
      await p.evaluate(txt => {
        if (typeof impChooseLoad === 'function') impChooseLoad(txt, 'a-friends-droid.mstr');
        if (typeof jobwizOpen === 'function') jobwizOpen('import');
      }, t);
      await untilFrames(count, 70);
      await p.evaluate(() => {
        const b = [...document.querySelectorAll('button,div,label,section')]
          .filter(x => /import servo config and choreography/i.test((x.textContent || '').trim().slice(0, 60)));
        if (b[b.length - 1]) b[b.length - 1].click();
      });
      await untilFrames(count, 130);
    });
    await page.keyboard.press('Escape');
    await wait(900);
  });

  /* ------------------------------------- 7. the loadout: slots 0 to 7 */
  await run('slots', async () => {
    await ev(() => { try { wsSet('bench'); } catch (e) {} });
    await wait(1200);
    await burst(page, cdp, 'slots', 150, async (p, count) => {
      await untilFrames(count, 12);
      await p.evaluate(() => { if (typeof bldOpen === 'function') bldOpen(); });
      await untilFrames(count, 48);
      for (let k = 0; k < 4; k++) {
        await p.evaluate(() => {
          const b = [...document.querySelectorAll('button')].filter(x => /^[▾▼↓]$/.test(x.textContent.trim()));
          if (b[0]) b[0].click();
        });
        await untilFrames(count, 56 + k * 20);
      }
      await untilFrames(count, 150);
    });
  });

  await browser.close();
  console.log('ALL DONE');
})().catch(e => { console.error(e); process.exit(1); });
