'use strict';
/* =====================================================================
   TWO NAMING SYSTEMS, RECONCILED

   The CAD names are MrBaddeley's, carried verbatim through the Fusion
   exports: "MainPie3", "FLBreadpanDoor", "Panel13".

   The actuator IDs are ours, and they are numbered BY AZIMUTH around the
   droid rather than by the CAD's numbering, because a firmware channel maps
   to a physical position, not to whatever order Fusion happened to name
   things in. Four of the six inner pies are all literally called "Pie5" with
   copy suffixes, so their CAD names carry no ordering at all.

   The two therefore do NOT line up — pie0 is MainPie3, panel0 is Panel13 —
   so anywhere an actuator ID is shown to a human, the CAD name goes with it.
   ===================================================================== */

function actCadParts(act){
  if(!act || typeof CAD === 'undefined' || !CAD.loaded) return [];
  return CAD.moving.filter(m => m.act === act);
}
/* the CAD name(s) an actuator drives, '' if none */
function actCadName(act){
  const ps = actCadParts(act);
  if(!ps.length) return '';
  return ps.map(p => p.base).join(' + ');
}
/* degrees clockwise from the front (-Z): front 0, R2's right 90, rear 180 */
function partAzimuth(m){
  if(!m || typeof CAD === 'undefined' || !CAD.header) return null;
  const p = CAD.header.parts.find(x => x.name === m.name);
  if(!p) return null;
  if(typeof p.azimuth === 'number') return p.azimuth;   // convert.py sets this for pies and panels
  const c = p.centroid;
  if(!c) return null;
  return Math.round((((Math.atan2(c[0], -c[2]) * 180 / Math.PI) + 360) % 360) * 10) / 10;
}
function actAzimuth(act){
  const ps = actCadParts(act);
  return ps.length ? partAzimuth(ps[0]) : null;
}
/* compass-ish words, easier to find on a real dome than a bearing */
function azWord(a){
  if(a === null || a === undefined) return '';
  const names = ['front','front-right','right','rear-right','rear','rear-left','left','front-left'];
  return names[Math.round(((a % 360) + 360) % 360 / 45) % 8];
}
/* the HUMAN name(s) an actuator drives — user rename, else the build's
   default label (e.g. "Pie 3"), else the CAD base. '' if none. */
function actPartLabel(act){
  /* v1.40.0: the 'Other 1-10' placeholders drive nothing on the model, so the
     CAD lookup below finds nothing — name them here, at the naming seam,
     so every consumer (bricks, wiring sheet, dropdowns) agrees */
  const oth = /^oth(\d+)$/.exec(act || '');
  if(oth) return 'Other ' + oth[1];
  /* v1.41.0: Builder joints name themselves — the part's user name, else
     "Joint N" (+ pan/tilt) — via the same seam */
  if(typeof mbIsAct === 'function' && mbIsAct(act) && typeof builderActLabel === 'function')
    return builderActLabel(act);
  const ps = actCadParts(act);
  if(!ps.length) return '';
  return ps.map(p => (typeof partLabel==='function') ? partLabel(p.name) : p.base).join(' + ');
}
/* "Dome pie 1 · MainPie3" — for dropdowns and table cells */
function actLabel(base, act){
  const n = actCadName(act);
  return n ? base + ' · ' + n : base;
}
/* longer form for a tooltip */
function actTip(act){
  const ps = actCadParts(act);
  if(!ps.length) return act ? 'no CAD part carries this actuator' : 'not mapped';
  const a = actAzimuth(act);
  return ps.map(p => p.base).join(', ')
       + (a === null ? '' : '\n' + a.toFixed(0) + '° from the front (' + azWord(a) + ')')
       + '\nhinge: ' + ps[0].rig.src;
}
