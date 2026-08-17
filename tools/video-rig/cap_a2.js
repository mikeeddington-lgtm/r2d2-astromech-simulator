/* capture pass A2: the foot-drive wizard step + the two studio bursts */
const { boot, installClock, still, burst, untilFrames } = require('./lib');

(async () => {
  const { browser, page } = await boot();

  // step 1 → step 5 (Foot drive) via Next
  for (let i = 0; i < 4; i++) { await page.click('#btnStpNext'); await page.waitForTimeout(250); }
  await page.waitForTimeout(400);
  await still(page, 'wiz_2_foot');

  await page.evaluate(() => { PREFS.seenStartup = true; closeStartup(); });
  await installClock(page);
  await page.waitForTimeout(300);
  await page.evaluate(() => wsSet('drive'));

  const cdp = await page.context().newCDPSession(page);

  /* burst 1: camera orbit round the MK4 */
  await page.evaluate(() => {
    CAM.theta = 1.6; CAM.phi = 1.1; CAM.dist = 2.6;
    window.__tick = () => { CAM.theta += 0.022; };
  });
  await burst(page, cdp, 'orbit', 46, async (p, count) => {
    await untilFrames(count, 46);
  });

  /* burst 2: dome spin, pie panels, utility arms, holos */
  await page.evaluate(() => { CAM.theta = 2.5; CAM.phi = 1.08; CAM.dist = 2.3; });
  await burst(page, cdp, 'dome', 62, async (p, count) => {
    await p.keyboard.down('j');
    await untilFrames(count, 16);
    await p.keyboard.up('j');
    await p.keyboard.down('c');
    await p.keyboard.down('ArrowUp');
    await untilFrames(count, 34);
    await p.keyboard.up('ArrowUp');
    await p.keyboard.up('c');
    await p.keyboard.down('q');
    await p.keyboard.down('ArrowRight');
    await untilFrames(count, 50);
    await p.keyboard.up('ArrowRight');
    await p.keyboard.up('q');
    await p.keyboard.press('f');
    await untilFrames(count, 62);
  });

  await browser.close();
  console.log('PASS A2 DONE');
})();
