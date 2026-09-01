'use strict';
/* ---------------------------------------------------------------- boot */
$('ver').textContent='v'+STUDIO_VERSION;
/* BOOT CANNOT BE THE PLACE THAT DIES (v1.77.0, review H13). This was
   `PROJ=projLoad()||defaultProject(); … rebuildAll();` with no net under
   it, so a saved project that rebuildAll() could not build — one bad file,
   adopted and saved before it was checked (40-ui.js §projLoadText) — threw
   here on every load, and the page came up empty with no log line to say
   so. The saved text now goes through projNormalise() first; a blob it
   cannot use is PARKED under LS_BAD_KEY, byte for byte, and Studio starts
   from the default project and says where the old one went. The blob stays
   under LS_KEY too until the first edit saves over it — boot writes nothing
   it did not have to, which is the whole lesson. And if rebuildAll() still
   throws on what the normaliser passed, that is a bug in the normaliser,
   not a reason to leave the person with a blank page: same park, same
   fallback, same log line. */
let bootNote='', bootCls='';
{
  const raw=projRaw();
  PROJ=null;
  if(raw){
    try{
      const n=projNormalise(JSON.parse(raw));
      PROJ=n.proj;
      if(n.dropped.length){ bootNote='saved project loaded with repairs — '+projDropSummary(n.dropped); bootCls='warn'; }
    }catch(e){
      projPark(raw);
      bootNote='the saved project could not be read ('+e.message+'). It is parked untouched under localStorage "'+LS_BAD_KEY+'"; Studio started from the default project instead.';
      bootCls='err';
    }
  }
  if(!PROJ) PROJ=defaultProject();
}
if(typeof blkBindUI === "function") blkBindUI();
$('bSetup').onclick=()=>setupOpen(0);
try{ rebuildAll(); }
catch(e){
  projPark(projRaw());
  /* no carry from an engine that never ran */
  E=null; PROJ=defaultProject(); curSeq=0;
  rebuildAll();
  bootNote='the saved project could not be built ('+e.message+'). It is parked untouched under localStorage "'+LS_BAD_KEY+'"; Studio started from the default project instead.';
  bootCls='err';
}
if(bootNote) log(bootNote, bootCls);
requestAnimationFrame(loop);
hwClockStart();   /* the engine's own 10 ms heartbeat — see hw-clock.js */
