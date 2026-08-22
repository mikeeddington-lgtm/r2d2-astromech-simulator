'use strict';
/* ------------------------------------------------------------- theme */
/* The studio rig, per theme (v1.18.0, B3 — "ground the hero"). Tuning
   notes: LIGHTS are the safe lever — a hex handed to a MATERIAL is taken
   as linear by this renderer and renders lighter than it says (§7), but a
   light's colour only multiplies, so the rig is where the look is tuned.
   keyPos is the key/sun OFFSET from the droid (updateCamera tracks it);
   blob is the contact-shadow strength (scene.js setShadowStrength).
     dark  — hemi held low so the warm key can actually model the shell,
             and a strong cyan rim from behind the screen-left shoulder so
             the shadow-side silhouette separates from the fog
     light — a white studio drowns rim highlights, so separation comes
             from deeper form shade (hemi down, key up) + the contact
             blobs; the rim is a saturated teal accent, not the outline */
const THEME_3D = {
  dark:  { fog:0x0a0d13, ground:0x141a22, gridA:0x2a3542, gridB:0x1b232c,
           hemiSky:0x9dc0ff, hemiGround:0x161b22, hemi:0.42,
           key:0xfff1de, keyI:1.35, keyPos:[-2.4,5.0,-2.0],
           rim:0x59e2f2, rimI:1.15, fill:0x9db8d8, fillI:0.30, blob:0.78 },
  light: { fog:0xd7e0e9, ground:0xdbe3ec, gridA:0xaebccb, gridB:0xc6d1dc,
           hemiSky:0xffffff, hemiGround:0xb9c5d1, hemi:0.70,
           key:0xffffff, keyI:1.25, keyPos:[-2.4,5.0,-2.0],
           rim:0x2f9db4, rimI:0.55, fill:0xffffff, fillI:0.18, blob:0.55 }
};
function applyTheme(mode){
  PREFS.theme = (mode === 'light') ? 'light' : 'dark';
  document.body.classList.toggle('light', PREFS.theme === 'light');
  applyStageTheme();
  const b = $('btnTheme');
  if(b) b.textContent = PREFS.theme === 'light' ? 'Dark' : 'Light';
  prefsSave();
}
/* the 3D stage can follow the frame theme or hold its own — Mike wants a
   light droid on a dark frame (and vice versa) to be possible */
function applyStageTheme(){
  const mode = (PREFS.stageTheme==='follow') ? PREFS.theme : PREFS.stageTheme;
  const t = THEME_3D[mode==='light' ? 'light' : 'dark'];
  if(typeof scene !== 'undefined' && scene){
    scene.fog.color.setHex(t.fog);
    if(renderer) renderer.setClearColor(t.fog, 0);
    if(ground) ground.material.color.setHex(t.ground);
    if(grid){
      // GridHelper bakes its colours into vertex colours — rebuild it
      const vis = grid.visible;
      scene.remove(grid);
      grid.geometry.dispose(); grid.material.dispose();
      grid = new THREE.GridHelper(24, 48, t.gridA, t.gridB);
      grid.material.opacity = 0.65; grid.material.transparent = true;
      grid.position.y = 0.002; grid.visible = vis;
      scene.add(grid);
    }
    if(LIGHTS.hemi){ LIGHTS.hemi.color.setHex(t.hemiSky); LIGHTS.hemi.groundColor.setHex(t.hemiGround); LIGHTS.hemi.intensity = t.hemi; }
    if(LIGHTS.key){ LIGHTS.key.color.setHex(t.key); LIGHTS.key.intensity = t.keyI; }
    if(LIGHTS.rim){ LIGHTS.rim.color.setHex(t.rim); LIGHTS.rim.intensity = t.rimI; }
    if(LIGHTS.fill){ LIGHTS.fill.color.setHex(t.fill); LIGHTS.fill.intensity = t.fillI; }
    if(LIGHTS.keyOff && t.keyPos) LIGHTS.keyOff.fromArray(t.keyPos);
    if(typeof setShadowStrength === 'function' && t.blob !== undefined) setShadowStrength(t.blob);
  }
  const sb = $('btnStageBG');
  if(sb) sb.textContent = 'BG: ' + (PREFS.stageTheme==='follow' ? 'auto' : PREFS.stageTheme);
  /* an environment other than the studio overrides everything above — it is
     applied LAST so the theme cannot half-repaint a hangar */
  if(typeof envApply === 'function' && typeof envGet === 'function' && envGet() !== 'studio') envApply(envGet());
  else if(typeof envSyncUI === 'function') envSyncUI();
}
/* v1.15.0 (M3) — the stage-BG button opens a picker instead of cycling
   blind, so the choice needs a direct setter and a named option list.
   cycleStageTheme() stays: it is the same choice as a keyboard-free cycle,
   and anything that calls it keeps working. */
function stageBGGet(){
  return (PREFS.stageTheme==='light' || PREFS.stageTheme==='dark') ? PREFS.stageTheme : 'follow';
}
function stageBGOptions(){
  return [
    {id:'follow', label:'Auto — follow theme', hint:'the stage matches the frame theme'},
    {id:'dark',   label:'Dark stage',          hint:'hold the stage dark whatever the frame does'},
    {id:'light',  label:'Light stage',         hint:'hold the stage light whatever the frame does'}
  ];
}
function setStageTheme(mode){
  PREFS.stageTheme = (mode==='light' || mode==='dark') ? mode : 'follow';
  applyStageTheme(); prefsSave();
}
function cycleStageTheme(){
  setStageTheme(PREFS.stageTheme==='follow' ? 'light' : PREFS.stageTheme==='light' ? 'dark' : 'follow');
}
/* UI scale — the frame text was too small to read across a workshop */
/* Mike: "zoom button when clicking should reset to 100%" — the readout
   between A− and A+ is the obvious place for it. */
function bindUiScaleReset(){
  const l = $('uiScaleLbl'); if(!l) return;
  l.style.cursor = 'pointer';
  l.title = 'click to go back to 100%';
  l.addEventListener('click',()=>applyUiScale(1.0));
}
function applyUiScale(v){
  /* the range is not symmetric about 100% and should not pretend to be:
     A+ buys 50% and A− bought 15, on a header whose one fully readable
     size before the chip work was the smallest one. Down to 75%. */
  PREFS.uiScale = clamp(Math.round(v*20)/20, 0.75, 1.5);
  document.body.style.zoom = PREFS.uiScale;
  const l = $('uiScaleLbl'); if(l) l.textContent = Math.round(PREFS.uiScale*100)+'%';
  if(typeof onResize==='function') setTimeout(onResize, 0);   // zoom changes the canvas box
  prefsSave();
}

/* -------------------------------------------------------------- paint
   Roles are the things a builder actually masks off and sprays separately,
   not the eleven Fusion materials — one of which (Steel_-_Satin) covers the
   dome shell, the legs and half the greebles at once. */
