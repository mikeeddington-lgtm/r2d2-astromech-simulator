/* capture pass A: wizard stills, drive stills, orbit + dome bursts */
const { boot, installClock, still, burst, untilFrames } = require('./lib');

(async () => {
  const { browser, page } = await boot();

  /* ---- the first-run wizard is already open ---- */
  await still(page, 'wiz_1_controller');

  // hop the rail to visually rich steps (rail chips are clickable)
  const railClick = async label => {
    const hit = await page.evaluate(l => {
      const chips = [...document.querySelectorAll('#stprail *')];
      const c = chips.find(e => e.childElementCount === 0 && e.textContent.trim().toUpperCase().startsWith(l));
      const chip = c && (c.closest('button') || c.closest('[class]'));
      if (chip) { chip.click(); return chip.className + '|' + chip.textContent.trim().slice(0, 30); }
      return null;
    }, label);
    console.log('rail →', label, ':', hit);
    await page.waitForTimeout(400);
  };
  await railClick('FOOT DRIVE');
  await still(page, 'wiz_2_foot');
  await railClick('WIRING');
  await still(page, 'wiz_3_wiring');
  await railClick('COLOURS');
  await still(page, 'wiz_4_colours');

  /* ---- close, install the deterministic clock ---- */
  await page.evaluate(() => { PREFS.seenStartup = true; closeStartup(); });
  await installClock(page);
  await page.waitForTimeout(300);

  /* ---- drive workspace stills ---- */
  await page.evaluate(() => { wsSet('drive'); CAM.theta = 2.35; CAM.phi = 1.12; CAM.dist = 2.4; });
  await page.waitForTimeout(2500);
  await still(page, 'drive_studio');
  await page.evaluate(() => applyTheme('light'));
  await page.waitForTimeout(2500);
  await still(page, 'drive_light');
  await page.evaluate(() => applyTheme('dark'));
  await page.waitForTimeout(1500);

  const cdp = await page.context().newCDPSession(page);

  /* ---- burst 1: camera orbit round the MK4 ---- */
  await page.evaluate(() => {
    CAM.theta = 1.6; CAM.phi = 1.1; CAM.dist = 2.6;
    window.__tick = () => { CAM.theta += 0.022; };
  });
  await burst(page, cdp, 'orbit', 46, async (p, count) => {
    await untilFrames(count, 46);
  });

  /* ---- burst 2: dome spin, pie panels, utility arms, holos ---- */
  await page.evaluate(() => { CAM.theta = 2.5; CAM.phi = 1.08; CAM.dist = 2.3; });
  await burst(page, cdp, 'dome', 62, async (p, count) => {
    await p.keyboard.down('j');                    // right stick X — dome, always live
    await untilFrames(count, 16);
    await p.keyboard.up('j');
    await p.keyboard.down('c');                    // RT …
    await p.keyboard.down('ArrowUp');              // … + UP = dome pie panels open
    await untilFrames(count, 34);
    await p.keyboard.up('ArrowUp');
    await p.keyboard.up('c');
    await p.keyboard.down('q');                    // LB …
    await p.keyboard.down('ArrowRight');           // … + RIGHT = utility arms out
    await untilFrames(count, 50);
    await p.keyboard.up('ArrowRight');
    await p.keyboard.up('q');
    await p.keyboard.press('f');                   // R3 — holoprojector lights
    await untilFrames(count, 62);
  });

  await browser.close();
  console.log('PASS A DONE');
})();
