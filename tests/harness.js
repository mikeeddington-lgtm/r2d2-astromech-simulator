'use strict';
/* =====================================================================
   TEST HARNESS — one browser launch, for every suite and every tool

   Thirty-one files launched Chromium with their own copy of the same
   options. That is not merely untidy: on 2026-08-17 every one of those
   copies carried

       executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

   — a path that existed on exactly one machine, the cloud container the
   suites were written in. It ran there and nowhere else: not on Windows,
   not on a contributor's laptop, not on the GitHub runner where the whole
   estate was about to run in public. Fixing it meant editing thirty-two
   files. Fixing it HERE would have been one line.

   So the rule is: **a suite says what it needs, not how to start a
   browser.** If you find yourself adding a flag to a `chromium.launch()`
   somewhere, add it here instead — or pass it, if it is genuinely that
   suite's business.

   ------------------------------------------------------------ no path
   There is deliberately no `executablePath`. Playwright launches the
   browser IT installed (`npx playwright install chromium`), which is the
   only one guaranteed to exist wherever this runs, and it still honours
   `PLAYWRIGHT_BROWSERS_PATH` where that is set. If a launch fails to find
   a browser, the answer is that install command — never a path in a file.
   ===================================================================== */

const { chromium } = require('playwright');

/* What every headless run needs.
     swiftshader          no GPU on a CI runner or in a container, so three.js
                          falls back to software rendering — say so explicitly
                          rather than letting it discover that per-machine
     no-sandbox           the container has no user namespaces
     disable-dev-shm      /dev/shm is tiny in Docker and Chromium will crash
                          rather than degrade when it fills */
const BASE_ARGS = [
  '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader',
  '--no-sandbox',
  '--disable-dev-shm-usage'
];

/* Only for suites that actually play something. Autoplay is blocked without
   a user gesture, and a headless run has no gestures; muting keeps a CI
   machine from making noise at whoever is sitting near it. */
const AUDIO_ARGS = [
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio'
];

function launchArgs(opts){
  const o = opts || {};
  return BASE_ARGS.concat(o.audio ? AUDIO_ARGS : [], o.args || []);
}

/* launchBrowser()                     — the plain case
   launchBrowser({audio:true})         — a suite that plays sound
   launchBrowser({args:['--x']})       — one extra flag, this suite only
   launchBrowser({launch:{...}})       — anything else Playwright takes */
function launchBrowser(opts){
  const o = opts || {};
  return chromium.launch(Object.assign({}, o.launch, {args: launchArgs(o)}));
}

module.exports = { chromium, launchBrowser, launchArgs, BASE_ARGS, AUDIO_ARGS };
