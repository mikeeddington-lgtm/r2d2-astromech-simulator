'use strict';
/* =====================================================================
   THEME + PAINT + STARTUP
   Theme flips the CSS variable set and the 3D scene together.
   Paint maps the CAD's materials onto a handful of named roles so you
   pick "panel blue" once rather than hunting through 11 Fusion materials.
   ===================================================================== */
const STORE_KEY = 'r2sim.prefs.v1';
/* v1.45.0 — Mike: "Default to light mode." This is the FIRST-RUN default and
   nothing else: prefsLoad() Object.assign()s the saved block straight over it,
   so anyone who has ever pressed the theme button keeps the theme they chose
   (applyTheme() writes it through on every flip). The toggle itself is
   untouched.
   stageTheme stays 'follow', and it is still the right answer on a light first
   run: 'follow' means "the 3D stage matches the frame", so the stage now opens
   light too (THEME_3D.light — a white studio with the contact blobs doing the
   separation, look/theme.js). Holding the stage dark by default under a light
   frame would be a deliberate two-tone look, which is exactly what the BG
   picker is for — not something to hand somebody who has chosen nothing. */
const PREFS = { theme:'light', stageTheme:'follow', uiScale:1.0, paint:null, seenStartup:false,
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
