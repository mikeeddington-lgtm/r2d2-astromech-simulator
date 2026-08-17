'use strict';
/* =====================================================================
   THEME + PAINT + STARTUP
   Theme flips the CSS variable set and the 3D scene together.
   Paint maps the CAD's materials onto a handful of named roles so you
   pick "panel blue" once rather than hunting through 11 Fusion materials.
   ===================================================================== */
const STORE_KEY = 'r2sim.prefs.v1';
const PREFS = { theme:'dark', stageTheme:'follow', uiScale:1.0, paint:null, seenStartup:false,
  favColors:['#d4af37','#c9ced6','#b87333','#dfe6ee','#2b5fb0','#c0392b'] };

function prefsLoad(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw) Object.assign(PREFS, JSON.parse(raw));
  }catch(e){ /* private mode / file:// restrictions — just use defaults */ }
}
function prefsSave(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(PREFS)); }catch(e){}
}
