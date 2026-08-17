/* shared capture plumbing */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function boot(viewport = { width: 1920, height: 1080 }) {
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars']
  });
  const page = await browser.newPage({ viewport });
  page.on('pageerror', e => console.log('PAGEERR:', e.message));
  await page.goto('file://' + path.resolve(__dirname, 'R2D2-Simulator.html'));
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', { timeout: 90000 });
  return { browser, page };
}

/* synthetic rAF clock: while window.__step > 0, every rAF callback gets a
   timestamp advanced by exactly __step ms, so the sim advances __step of
   sim-time per rendered frame no matter how slow swiftshader is.
   window.__tick (if set) runs before each frame — per-frame scripted moves. */
async function installClock(page) {
  await page.evaluate(() => {
    const orig = window.requestAnimationFrame.bind(window);
    let vt = performance.now();
    window.__step = 0;
    window.requestAnimationFrame = cb => orig(ts => {
      if (window.__step > 0) {
        vt += window.__step;
        if (window.__tick) { try { window.__tick(); } catch (e) {} }
        cb(vt);
      } else { vt = ts; cb(ts); }
    });
  });
}

async function still(page, name, dir = 'captures') {
  fs.mkdirSync(dir, { recursive: true });
  const t = Date.now();
  await page.screenshot({ path: `${dir}/${name}.jpg`, type: 'jpeg', quality: 95 });
  console.log('STILL', name, Date.now() - t, 'ms');
}

/* capture n frames via CDP screencast while fn(page) performs the action.
   Sets __step for deterministic sim stepping; restores to 0 after. */
async function burst(page, cdp, name, n, fn, step = 50) {
  const dir = `captures/${name}`;
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  const t0 = Date.now();
  const handler = ev => {
    const i = count++;
    fs.writeFileSync(`${dir}/f${String(i).padStart(4, '0')}.jpg`, Buffer.from(ev.data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', handler);
  await page.evaluate(s => { window.__step = s; }, step);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  const done = (async () => {
    while (count < n && Date.now() - t0 < 480000) await new Promise(r => setTimeout(r, 300));
  })();
  await fn(page, () => count);
  await done;
  await cdp.send('Page.stopScreencast').catch(() => {});
  cdp.off('Page.screencastFrame', handler);
  await page.evaluate(() => { window.__step = 0; window.__tick = null; });
  console.log('BURST', name, count, 'frames in', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}

/* wait until the burst has captured at least k frames */
const untilFrames = (getCount, k, timeoutMs = 480000) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (getCount() >= k) { clearInterval(iv); res(); }
    else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); res(); }
  }, 200);
});

module.exports = { boot, installClock, still, burst, untilFrames };
