/* capture pass E: bench Maestro + Outputs on the maestro25 build (real channel table) */
const { boot, installClock, still } = require('./lib');

(async () => {
  const { browser, page } = await boot();
  await page.evaluate(() => { PREFS.seenStartup = true; closeStartup(); });
  await installClock(page);
  const ev = f => page.evaluate(f);
  const st = await ev(() => {
    buildSet('firmware', 'maestro25');
    if (typeof buildApply === 'function') buildApply();
    if (!MSTR.loaded) { makeStarter('dome', 'mini18'); if (typeof rebuildMaestroUI === 'function') rebuildMaestroUI(); }
    return { profile: SIM.profile, loaded: MSTR.loaded, board: MSTR.board };
  });
  console.log('build:', JSON.stringify(st));
  await ev(() => wsSet('bench'));
  await page.waitForTimeout(1500);
  await ev(() => { const t = document.getElementById('tabMae'); if (t) t.click(); });
  await page.waitForTimeout(1500);
  await still(page, 'bench_maestro');
  console.log('outputs:', await ev(() => {
    const t = [...document.querySelectorAll('#tabs *')].find(b => /Output/i.test(b.textContent) && b.childElementCount === 0);
    if (t) { (t.closest('button') || t).click(); return 'ok'; } return 'NO OUTPUTS TAB';
  }));
  await page.waitForTimeout(1500);
  await still(page, 'bench_outputs');
  await browser.close();
  console.log('PASS E DONE');
})();
