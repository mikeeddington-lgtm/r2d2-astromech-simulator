/* M1 typography verification screenshots — NOT part of the suite.
   Boots like the tests (buildSet → wizFinish → closeStartup), then captures
   the Maestro, Config (advanced), Controls and Learn tabs in dark and light. */
const { launchBrowser } = require('../tests/harness');
const path = require('path');

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on('pageerror',e=>console.log('PAGEERROR', e.message));
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html'));
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  const ev = f => page.evaluate(f);

  await ev(()=>{
    buildSet('firmware','maestro25');
    buildSet('domeServo','mini24'); buildSet('bodyServo','mini12'); buildSet('sound','dysv5w');
    wizFinish(); closeStartup();
    setView('advanced');
    makeStarter('dome'); CFG.maestroSource='imported'; rebuildMaestroUI();
  });

  const ALL = {maestro:'pMae', config:'pCfg', controls:'pHelp', learn:'pLearn', outputs:'pServo', model:'pCad'};
  const want = (process.env.SHOT_TABS||Object.keys(ALL).join(',')).split(',');
  const themes = (process.env.SHOT_THEMES||'dark,light').split(',');
  const tabs = want.map(n=>[ALL[n],n]);
  for(const theme of themes){
    await page.evaluate(t=>applyTheme(t), theme);
    for(const [pane,name] of tabs){
      const okTab = await page.evaluate(p=>{
        const b=document.querySelector('#tabs button[data-p="'+p+'"]');
        if(!b) return false; b.click(); return true;
      }, pane);
      if(!okTab){ console.log('no tab for', pane); continue; }
      await page.screenshot({path:'docs/shots/typo-'+name+'-'+theme+'.png'});
    }
  }
  console.log('done');
  await browser.close();
})();
