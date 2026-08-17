/* capture pass B: environments, track, sequencer, bench, config, learn, frik, mouse */
const { boot, installClock, still, burst, untilFrames } = require('./lib');

(async () => {
  const { browser, page } = await boot();
  await page.evaluate(() => { PREFS.seenStartup = true; closeStartup(); });
  await installClock(page);
  const cdp = await page.context().newCDPSession(page);
  const ev = f => page.evaluate(f);

  /* ---- environments ---- */
  await ev(() => { wsSet('drive'); CAM.theta = 2.35; CAM.phi = 1.1; CAM.dist = 2.6; });
  for (const env of ['workshop', 'desert', 'hangar']) {
    await page.evaluate(e => envApply(e), env);
    await page.waitForTimeout(5000);
    await still(page, 'env_' + env);
  }

  /* ---- practice circuit ---- */
  await page.click('#btnTrack');
  await page.waitForTimeout(5000);
  await still(page, 'track_still');
  await page.click('#btnFollow');
  await page.keyboard.press('Enter');            // START — arm the feet
  await page.waitForTimeout(800);
  await page.keyboard.press('r'); await page.waitForTimeout(300);
  await page.keyboard.press('r'); await page.waitForTimeout(300);   // speed 3
  await burst(page, cdp, 'track', 52, async (p, count) => {
    await p.keyboard.down('w');
    await untilFrames(count, 40);
    await p.keyboard.down('d');
    await untilFrames(count, 52);
    await p.keyboard.up('d'); await p.keyboard.up('w');
  }, 60);
  await page.keyboard.press('Enter');            // disarm
  await page.click('#btnTrack');                 // circuit off
  await page.click('#btnFollow');                // follow off
  await page.evaluate(() => envApply('studio'));
  await page.waitForTimeout(2500);

  /* ---- brick sequencer: new routine + Mexican wave + play ---- */
  await ev(() => wsSet('seq'));
  await page.waitForTimeout(3000);
  const made = await ev(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /New routine/.test(b.textContent));
    if (btn) btn.click();
    return btn ? 'clicked new' : 'NO NEW BUTTON';
  });
  console.log('sequencer:', made);
  await page.waitForTimeout(1500);
  const wave = await ev(() => {
    const sel = document.getElementById('blkGroupSel');
    if (!sel) return 'NO GROUP SEL';
    const opt = [...sel.options].find(o => /pie/i.test(o.textContent)) || sel.options[0];
    sel.value = opt.value; sel.dispatchEvent(new Event('change'));
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Mexican wave');
    if (!btn) return 'NO WAVE BUTTON';
    btn.click();
    return 'wave on ' + opt.textContent;
  });
  console.log('sequencer:', wave);
  await page.waitForTimeout(2500);
  await still(page, 'seq_wave');
  await burst(page, cdp, 'seq', 76, async (p, count) => {
    await p.click('#sqPlay');
    await untilFrames(count, 76);
  }, 60);
  await ev(() => wsSet('drive'));
  await page.waitForTimeout(1000);

  /* ---- bench ---- */
  await ev(() => wsSet('bench'));
  await page.waitForTimeout(1500);
  await page.click('#tabMae');
  await page.waitForTimeout(1200);
  await still(page, 'bench_maestro');
  const outTab = await ev(() => {
    const t = [...document.querySelectorAll('#tabs button, #tabs .tab')].find(b => /Output/i.test(b.textContent));
    if (t) { t.click(); return t.id || t.textContent; } return 'NO OUTPUTS TAB';
  });
  console.log('bench:', outTab);
  await page.waitForTimeout(1200);
  await still(page, 'bench_outputs');
  await ev(() => { const a = document.getElementById('wsAdv'); if (a) a.click(); });
  await page.waitForTimeout(600);
  const conTab = await ev(() => {
    const t = [...document.querySelectorAll('#tabs button, #tabs .tab')].find(b => /Serial/i.test(b.textContent));
    if (t) { t.click(); return t.id || t.textContent; } return 'NO SERIAL TAB';
  });
  console.log('bench:', conTab);
  await page.waitForTimeout(1200);
  await still(page, 'bench_serial');

  /* ---- configure ---- */
  await ev(() => wsSet('config'));
  await page.waitForTimeout(1500);
  await still(page, 'config_tab');
  await page.click('#tabCad');
  await page.waitForTimeout(1500);
  await still(page, 'config_model');

  /* ---- learn ---- */
  await ev(() => wsSet('drive'));
  await page.waitForTimeout(800);
  const lrn = await ev(() => {
    const t = [...document.querySelectorAll('#tabs button, #tabs .tab')].find(b => /Learn/i.test(b.textContent));
    if (t) { t.click(); return 'learn tab'; } return 'NO LEARN TAB';
  });
  console.log('learn:', lrn);
  await page.click('#btnTutor');
  await page.waitForTimeout(2500);
  await still(page, 'learn');
  await page.click('#btnTutor');

  /* ---- the Anzellan head ---- */
  await page.evaluate(() => modelSet('frik'));
  await page.waitForTimeout(4000);
  await still(page, 'anz_still');
  await burst(page, cdp, 'anz', 48, async (p, count) => {
    await untilFrames(count, 48);
  }, 60);

  /* ---- the Polar Mouse ---- */
  await page.evaluate(() => modelSet('mouse'));
  await page.waitForTimeout(4000);
  await still(page, 'mouse_still');
  await page.click('#btnFollow');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await burst(page, cdp, 'mouse', 52, async (p, count) => {
    await p.keyboard.down('w');
    await untilFrames(count, 26);
    await p.keyboard.down('d');
    await untilFrames(count, 52);
    await p.keyboard.up('d'); await p.keyboard.up('w');
  }, 60);
  await page.evaluate(() => modelSet('droid'));

  await browser.close();
  console.log('PASS B DONE');
})();
