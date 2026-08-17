/* capture pass C: sequencer (with dome starter loaded), bench, config, learn, frik, mouse */
const { boot, installClock, still, burst, untilFrames } = require('./lib');

(async () => {
  const { browser, page } = await boot();
  await page.evaluate(() => { PREFS.seenStartup = true; closeStartup(); });
  await installClock(page);
  const cdp = await page.context().newCDPSession(page);
  const ev = f => page.evaluate(f);

  /* ---- give the sim a Maestro: the dome starter on a Mini 18 (the real droid's board) ---- */
  const st = await ev(() => {
    makeStarter('dome', 'mini18');
    if (typeof rebuildMaestroUI === 'function') rebuildMaestroUI();
    return { loaded: MSTR.loaded, board: MSTR.board, seqs: MSTR.sequences.map(s => s.name) };
  });
  console.log('starter:', JSON.stringify(st));

  /* ---- sequencer: new routine + Mexican wave + play ---- */
  await ev(() => wsSet('seq'));
  await page.waitForTimeout(2500);
  console.log('new:', await ev(() => {
    const b = [...document.querySelectorAll('button')].find(x => /New routine/.test(x.textContent));
    if (!b) return 'NO NEW BUTTON';
    b.click(); return 'ok';
  }));
  await page.waitForTimeout(1200);
  console.log('wave:', await ev(() => {
    const sel = document.getElementById('blkGroupSel');
    if (!sel) return 'NO GROUP SEL';
    const opt = [...sel.options].find(o => /pie/i.test(o.textContent)) || sel.options[0];
    sel.value = opt.value; sel.dispatchEvent(new Event('change'));
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Mexican wave');
    if (!b) return 'NO WAVE BUTTON';
    b.click(); return 'ok on ' + opt.textContent;
  }));
  await page.waitForTimeout(2500);
  await still(page, 'seq_wave');
  console.log('play:', await ev(() => {
    const b = document.getElementById('sqPlay');
    if (!b) return 'NO PLAY';
    b.click(); return 'clicked (disabled=' + b.disabled + ')';
  }));
  await burst(page, cdp, 'seq', 76, async (p, count) => {
    await untilFrames(count, 76);
  }, 60);

  /* ---- bench ---- */
  await ev(() => wsSet('bench'));
  await page.waitForTimeout(1500);
  await ev(() => { const t = document.getElementById('tabMae'); if (t) t.click(); });
  await page.waitForTimeout(1200);
  await still(page, 'bench_maestro');
  console.log('outputs:', await ev(() => {
    const t = [...document.querySelectorAll('#tabs *')].find(b => /Output/i.test(b.textContent) && b.childElementCount === 0);
    if (t) { (t.closest('button') || t).click(); return 'ok'; } return 'NO OUTPUTS TAB';
  }));
  await page.waitForTimeout(1200);
  await still(page, 'bench_outputs');
  await ev(() => { const a = document.getElementById('wsAdv'); if (a) a.click(); });
  await page.waitForTimeout(600);
  console.log('serial:', await ev(() => {
    const t = [...document.querySelectorAll('#tabs *')].find(b => /Serial/i.test(b.textContent) && b.childElementCount === 0);
    if (t) { (t.closest('button') || t).click(); return 'ok'; } return 'NO SERIAL TAB';
  }));
  await page.waitForTimeout(1200);
  await still(page, 'bench_serial');

  /* ---- configure ---- */
  await ev(() => wsSet('config'));
  await page.waitForTimeout(1500);
  await still(page, 'config_tab');
  await ev(() => { const t = document.getElementById('tabCad'); if (t) t.click(); });
  await page.waitForTimeout(1500);
  await still(page, 'config_model');

  /* ---- learn ---- */
  await ev(() => wsSet('drive'));
  await page.waitForTimeout(800);
  console.log('learn:', await ev(() => {
    const t = [...document.querySelectorAll('#tabs *')].find(b => /Learn/i.test(b.textContent) && b.childElementCount === 0);
    if (t) { (t.closest('button') || t).click(); return 'ok'; } return 'NO LEARN TAB';
  }));
  await ev(() => { const b = document.getElementById('btnTutor'); if (b) b.click(); });
  await page.waitForTimeout(2500);
  await still(page, 'learn');
  await ev(() => { const b = document.getElementById('btnTutor'); if (b) b.click(); });

  /* ---- the Anzellan head ---- */
  await ev(() => modelSet('frik'));
  await page.waitForTimeout(4000);
  await still(page, 'anz_still');
  await burst(page, cdp, 'anz', 48, async (p, count) => {
    await untilFrames(count, 48);
  }, 60);

  /* ---- the Polar Mouse ---- */
  await ev(() => modelSet('mouse'));
  await page.waitForTimeout(4000);
  await still(page, 'mouse_still');
  await ev(() => { const b = document.getElementById('btnFollow'); if (b) b.click(); });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await burst(page, cdp, 'mouse', 52, async (p, count) => {
    await p.keyboard.down('w');
    await untilFrames(count, 26);
    await p.keyboard.down('d');
    await untilFrames(count, 52);
    await p.keyboard.up('d'); await p.keyboard.up('w');
  }, 60);
  await ev(() => modelSet('droid'));

  await browser.close();
  console.log('PASS C DONE');
})();
