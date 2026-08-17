/* capture pass D: the sequencer, on a Maestro build (mod2026 blocks the desk — honestly) */
const { boot, installClock, still, burst, untilFrames } = require('./lib');

(async () => {
  const { browser, page } = await boot();
  await page.evaluate(() => { PREFS.seenStartup = true; closeStartup(); });
  await installClock(page);
  const cdp = await page.context().newCDPSession(page);
  const ev = f => page.evaluate(f);

  const st = await ev(() => {
    buildSet('firmware', 'maestro25');
    if (typeof buildApply === 'function') buildApply();
    if (!MSTR.loaded) { makeStarter('dome', 'mini18'); if (typeof rebuildMaestroUI === 'function') rebuildMaestroUI(); }
    return { profile: SIM.profile, loaded: MSTR.loaded, board: MSTR.board, n: MSTR.sequences.length };
  });
  console.log('build:', JSON.stringify(st));

  await ev(() => wsSet('seq'));
  await page.waitForTimeout(3000);
  console.log('inseq:', await ev(() => document.body.classList.contains('seqmode') + ' lib=' + !!document.querySelector('#seqlib button')));
  console.log('new:', await ev(() => {
    const b = [...document.querySelectorAll('button')].find(x => /New routine/.test(x.textContent));
    if (!b) return 'NO NEW BUTTON';
    b.click(); return 'ok';
  }));
  await page.waitForTimeout(1500);
  console.log('wave:', await ev(() => {
    const sel = document.getElementById('blkGroupSel');
    if (!sel) return 'NO GROUP SEL';
    const opt = [...sel.options].find(o => /pie/i.test(o.textContent)) || sel.options[0];
    sel.value = opt.value; sel.dispatchEvent(new Event('change'));
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Mexican wave');
    if (!b) return 'NO WAVE BUTTON';
    b.click(); return 'ok on ' + opt.textContent.trim();
  }));
  await page.waitForTimeout(3000);
  await still(page, 'seq_wave');
  console.log('play:', await ev(() => {
    const b = document.getElementById('sqPlay');
    if (!b) return 'NO PLAY';
    b.click(); return 'clicked';
  }));
  await burst(page, cdp, 'seq', 80, async (p, count) => {
    await untilFrames(count, 80);
  }, 60);

  await browser.close();
  console.log('PASS D DONE');
})();
