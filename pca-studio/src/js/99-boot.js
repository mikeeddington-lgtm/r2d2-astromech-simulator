'use strict';
/* ---------------------------------------------------------------- boot */
$('ver').textContent='v'+STUDIO_VERSION;
PROJ=projLoad()||defaultProject();
PROJ.osc=PROJ.osc||25000000;
if(typeof blkBindUI === "function") blkBindUI();
$('bSetup').onclick=()=>setupOpen(0);
rebuildAll();
requestAnimationFrame(loop);
hwClockStart();   /* the engine's own 10 ms heartbeat — see hw-clock.js */
