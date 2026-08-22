'use strict';
/* =====================================================================
   ASTROPIXELS — putting the pixels on the dome
   =====================================================================

   Every logic display in this app used to be one glowing rectangle whose
   emissive intensity followed a sine wave. It read as "there is a light
   there", which was honest while nothing simulated the lighting — but it
   cannot show you the thing a builder actually wants to see, which is
   whether the effect he is about to flash onto a real ESP32 looks right.

   So each display is now its own little screen: a texture with exactly as
   many texels as the board has LEDs, sampled with NEAREST so a pixel stays
   a pixel, on an unlit material so it emits rather than catches the room's
   light. Nine by ten for the front logic, twenty-seven by four for the
   rear, five by five for a PSI with its corners cut out.

   ------------------------------------------ two domes, two rigs, one set
                                               of textures

   The droid on the stage is either the procedural stand-in or the real MK4
   CAD geometry, and `R2.body.visible = !CAD.active` swaps them. Their domes
   are NOT the same shape and their boards are not in the same places, so
   there is a rig for each — but they share the four DataTextures, because
   the pixels are the same pixels either way and uploading them twice would
   be paying for a display nobody is looking at.

   ------------------------------------------- measure, do not approximate

   The stand-in's boards go on by spherical coordinates, because that is how
   the stand-in was built. THE CAD MODEL IS DIFFERENT: it carries its own
   named parts — SmallLogicLightUp, SmallLogicLightLow, LargeLogicInner,
   FrontPSIRing, RearPSIRing — each with a bounding box and a centroid in
   the header. So on the MK4 the panels are placed and SIZED from the
   geometry Mike exported, which means they land in the actual recesses
   rather than near them, and they stay right the next time it is exported.

   The front logic is two 9x5 boards stacked, and the CAD has them as two
   separate parts, so it is drawn as two meshes taking the top and bottom
   half of one 9x10 texture. That is exactly how the real thing is built and
   exactly how the Marcduino text commands address it (@1M top, @2M bottom).

   Neither dome's sphere centre is written down anywhere, so it is FITTED —
   every dome part in the header carries its distance from that centre, and
   a coarse-to-fine scan recovers it to a fraction of a millimetre. A number
   copied out of a CAD package goes stale; a fitted one cannot.

   ------------------------------------------------------------- colour

   The texture carries what the LED EMITS, which is a display-space value,
   so it declares sRGBEncoding and gets decoded on the way in — HANDOVER §3's
   law, and the one the Anzellan head's skin tone was lost to. Skip it and
   every effect renders washed out and pale, which for a red alert is the
   difference between an alarm and a pink glow.
   ===================================================================== */

const LR = {
  tex:{}, rigs:{}, host:null, hostKey:'', hidden:false, cadFit:null, warned:false
};

/* Where each display sits on the STAND-IN's dome: theta down from the top,
   phi around with 0 at the front. Sizes are the real boards' proportions in
   metres — the front logic is very nearly square (two 9x5 halves stacked),
   the rear one is a long letterbox, and having those two the wrong way
   round is the classic tell of a droid built from photographs. */
const LR_PLACE = {
  fld:  {theta:0.86, phi:0,            w:0.055, h:0.062},
  rld:  {theta:1.00, phi:Math.PI,      w:0.145, h:0.022},
  fpsi: {theta:1.06, phi:-0.62,        w:0.044, h:0.044},
  rpsi: {theta:1.06, phi:Math.PI+0.62, w:0.044, h:0.044}
};
/* The CAD parts each board is fitted into. Two entries for the front logic
   because the real board is two, and `rows` says which slice of the texture
   each one shows. `inset` trims the surround off the bounding box: these
   parts are the FRAME, and the lit area is smaller than the casting. */
const LR_CAD_ANCHOR = {
  fld:  [{part:'SmallLogicLightUp',  rows:[0, 0.5], inset:0.0015},
         {part:'SmallLogicLightLow', rows:[0.5, 1], inset:0.0015}],
  rld:  [{part:'LargeLogicInner',    rows:[0, 1],   inset:0.0035}],
  fpsi: [{part:'FrontPSIRing',       rows:[0, 1],   inset:0.0075}],
  rpsi: [{part:'RearPSIRing',        rows:[0, 1],   inset:0.0075}]
};
/* Holoprojectors on the CAD dome. The MK4 export does not model them at all
   — there is a RadarEye and there are pie panels, and no holoprojector
   anywhere in the part list — so the lighting layer brings its own housing
   rather than leaving the HP effects with nothing to light. It is the one
   piece of geometry here that is an invention, and it is marked as such:
   every other position on this dome was measured off Mike's own export. */
const LR_CAD_HOLO = [
  {key:'top',   theta:0.46, phi:-1.15, over:null},
  {key:'front', theta:1.06, phi:0,     over:'SmallLogicLightUp'},
  {key:'rear',  theta:1.06, phi:0,     over:'LargeLogicInner'}
];

/* ------------------------------------------------------------ textures
   One texel per LED, shared by both rigs. RGBA because r128's DataTexture
   wants four channels for RGBAFormat, and the alpha does real work: a hole
   in the board (a PSI's cut corner) is alpha 0, so the bezel shows through
   instead of a black square. */
function lrTexture(d){
  if(LR.tex[d.key]) return LR.tex[d.key];
  const buf = new Uint8Array(d.w * d.h * 4);
  const tex = new THREE.DataTexture(buf, d.w, d.h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if(THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
  tex.flipY = true;
  tex.needsUpdate = true;
  LR.tex[d.key] = tex;
  return tex;
}
/* ------------------------------------------------ the viewing gain
   THE ENGINE IS FAITHFUL AND THE SCREEN IS NOT AN LED, and this is where
   the two are reconciled — deliberately here, in the renderer, and nowhere
   near the simulation.

   A logic display running NORMAL peaks around 18 of 255 and averages under
   3. That number is right: the board bakes its brightness into the palette
   ramp and then applies it AGAIN per pixel, and FastLED squares the value
   on top of that. On a real dome those are physical emitters in a shaded
   recess and you see them perfectly well. As an sRGB value on a monitor,
   18 is black, and Mike would have been shown a dome with its logics off.

   So the pixel goes through a display curve on the way to the texture, and
   only on the way to the texture: `leCell()` still returns exactly what the
   board would have driven, every test reads the true value, and nothing
   downstream of the engine is told a different number. The curve is a plain
   power law, chosen so a 7% pixel reads as roughly a third and a full one
   is untouched — it lifts the floor without flattening the top, which
   matters because half the effects are ABOUT the difference between a dim
   pixel and a bright one. */
const LR_GAIN = 0.45;
const LR_CURVE = (function(){
  const t = new Uint8Array(256);
  for(let i = 0; i < 256; i++) t[i] = Math.round(255 * Math.pow(i / 255, LR_GAIN));
  return t;
})();

/* Row 0 of a logic display is its TOP row and a texture's row 0 is its
   bottom, which is what flipY is for. Write rows in BOARD order and let the
   flag do the turning; do it by hand as well and the panel is upside down,
   which on a scrolling text effect is remarkably hard to spot. */
function lrUpload(d, tex){
  const buf = tex.image.data;
  let o = 0;
  for(let y = 0; y < d.h; y++) for(let x = 0; x < d.w; x++){
    const c = leCell(d, x, y);
    if(c){
      buf[o] = LR_CURVE[c[0]]; buf[o+1] = LR_CURVE[c[1]]; buf[o+2] = LR_CURVE[c[2]];
      buf[o+3] = 255;
    } else { buf[o] = buf[o+1] = buf[o+2] = buf[o+3] = 0; }
    o += 4;
  }
  tex.needsUpdate = true;
}
/* A panel showing rows [a,b) of its texture. flipY means the TOP of the
   board is the TOP of the v range, so the slice runs from 1-b to 1-a — get
   that backwards and the two front-logic halves swap, which reads as a
   board wired upside down. */
function lrPanel(d, w, h, rows){
  const tex = lrTexture(d);
  const mat = new THREE.MeshBasicMaterial({map:tex, transparent:true, alphaTest:0.001});
  /* Unlit AND out of the tone mapper: an LED does not get dimmer because
     the room does, and a display that follows the scene lighting reads as a
     printed sticker rather than a screen. */
  if('toneMapped' in mat) mat.toneMapped = false;
  const geo = new THREE.PlaneGeometry(w, h);
  if(rows && (rows[0] !== 0 || rows[1] !== 1)){
    const v0 = 1 - rows[1], v1 = 1 - rows[0];
    const uv = geo.attributes.uv;
    for(let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
    uv.needsUpdate = true;
  }
  const m = new THREE.Mesh(geo, mat);
  m.rotation.y = Math.PI;      // the groups are left facing -Z, as faceOut leaves them
  return m;
}
function lrBezel(w, h){
  const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({color:0x0a0c10, metalness:0.35, roughness:0.65}));
  b.rotation.y = Math.PI; b.position.z = 0.0016;
  return b;
}

/* --------------------------------------------------- the stand-in's rig */
function lrBuildProc(){
  const rig = new THREE.Group();
  rig.name = 'astropixels-proc';
  for(const key of APX.order){
    const d = APX.disp[key], p = LR_PLACE[key];
    if(!d || !p) continue;
    const g = new THREE.Group();
    faceOut(g, p.theta, p.phi, DOME_R);
    g.add(lrBezel(p.w + 0.010, p.h + 0.010));
    g.add(lrPanel(d, p.w, p.h, [0, 1]));
    rig.add(g);
  }
  return rig;
}

/* -------------------------------------------------------- the CAD's rig
   Everything here is read out of CAD.header.parts — the same table the
   click-to-select picker and the wiring sheet read — so it costs no new
   data and cannot disagree with the model on the stage. */
function lrCadPart(name){
  if(typeof CAD === 'undefined' || !CAD.header || !CAD.header.parts) return null;
  return CAD.header.parts.find(p => p.name === name && p.file === 'dome') || null;
}
/* The dome's sphere centre — fitted to the SHELL ITSELF, from its vertices.

   Two cheaper ideas were tried first and both are wrong, which is worth
   writing down because both look right:

     · fitting the header's `radius` field over all fifty-seven dome parts
       lands 30 mm out. `radius` is not one consistent measurement — a pie
       panel's centroid is the middle of a flat plate sunk into the shell
       and sits well inside the surface, while the rim parts sit outside.
     · fitting the five board faces alone gets the RMS down to 10 mm but is
       DEGENERATE in y: they are five points in a narrow horizontal band, so
       the centre can slide up and down that axis almost for free. It came
       out 50 mm high, which tilts every panel 16 degrees down — a fit that
       is numerically fine and visibly wrong.

   The shell's own vertices have no such problem: thousands of points spread
   over a whole hemisphere pin the centre exactly. One pass, then a second
   with the outliers dropped, because the radar eye and the pie panels stick
   out and would otherwise drag it. The radius that minimises the error for
   a given centre is just the mean distance, so only the centre is searched. */
function lrFitDome(){
  if(LR.cadFit) return LR.cadFit;
  if(typeof CAD === 'undefined' || !CAD.dome) return null;
  const pts = [];
  CAD.dome.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  CAD.dome.traverse(o => {
    if(!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const pos = o.geometry.attributes.position;
    /* Every seventeenth vertex. A prime stride so a regularly-tessellated
       lathe cannot alias onto one meridian and hand back a fit made of a
       single slice of the dome. */
    for(let i = 0; i < pos.count; i += 17){
      v.fromBufferAttribute(pos, i);
      o.updateMatrixWorld(true);
      v.applyMatrix4(o.matrixWorld);
      pts.push(v.x, v.y, v.z);
    }
  });
  if(pts.length < 300) return null;
  const fit = keep => {
    let lo = 0, hi = 2, best = 0, bestE = Infinity, bestR = 0.2;
    for(let pass = 0; pass < 5; pass++){
      const step = (hi - lo) / 120;
      for(let c = lo; c <= hi; c += step){
        let sum = 0, sq = 0, n = 0;
        for(let i = 0; i < pts.length; i += 3){
          if(keep && !keep[i / 3]) continue;
          const dy = pts[i+1] - c;
          const d = Math.sqrt(pts[i]*pts[i] + dy*dy + pts[i+2]*pts[i+2]);
          sum += d; sq += d * d; n++;
        }
        if(!n) continue;
        const mean = sum / n, e = sq / n - mean * mean;
        if(e < bestE){ bestE = e; best = c; bestR = mean; }
      }
      lo = best - step; hi = best + step;
    }
    return {y:best, r:bestR, rms:Math.sqrt(Math.max(0, bestE))};
  };
  let f = fit(null);
  const keep = new Uint8Array(pts.length / 3);
  const tol = Math.max(0.004, f.rms * 1.5);
  for(let i = 0, k = 0; i < pts.length; i += 3, k++){
    const dy = pts[i+1] - f.y;
    const d = Math.sqrt(pts[i]*pts[i] + dy*dy + pts[i+2]*pts[i+2]);
    keep[k] = Math.abs(d - f.r) <= tol ? 1 : 0;
  }
  const f2 = fit(keep);
  if(f2.rms < f.rms) f = f2;
  f.n = pts.length / 3;
  LR.cadFit = f;
  return f;
}
/* Which way round the dome a board sits, so the holoprojectors can be put
   ABOVE the boards they belong with rather than at three numbers somebody
   liked the look of. phi is measured the way faceOut() measures it: 0 at
   the front, which is -Z. */
function lrCadPhi(name){
  const p = lrCadPart(name);
  if(!p || !p.bbox) return 0;
  const x = (p.bbox[0] + p.bbox[3]) / 2, z = (p.bbox[2] + p.bbox[5]) / 2;
  return Math.atan2(x, -z);
}
/* A part's lit face: where it is, how big it is across the dome, and which
   way it looks. The outward direction is radial from the fitted centre,
   which for a board sunk into a spherical shell is exactly right. */
function lrCadFace(name, inset, fit){
  const p = lrCadPart(name);
  if(!p || !p.bbox) return null;
  const b = p.bbox;
  const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
  const nx = cx, ny = cy - fit.y, nz = cz;
  const nl = Math.hypot(nx, ny, nz) || 1;
  const n = [nx / nl, ny / nl, nz / nl];
  /* Width is the box's extent ACROSS the dome — the horizontal diagonal,
     because a board on the back-left has its width split between x and z
     and taking either alone would halve it. Height is the vertical extent
     corrected for how far the board is tilted off vertical, which for the
     PSIs is a real few per cent. */
  const dx = b[3] - b[0], dy = b[4] - b[1], dz = b[5] - b[2];
  const horiz = Math.hypot(dx, dz);
  const tilt = Math.max(0.2, Math.hypot(n[0], n[2]));
  return {
    pos:[cx, cy, cz], n:n,
    w:Math.max(0.004, horiz - inset * 2),
    h:Math.max(0.004, dy / tilt - inset * 2)
  };
}
function lrBuildCad(){
  const fit = lrFitDome();
  if(!fit) return null;
  const rig = new THREE.Group();
  rig.name = 'astropixels-cad';
  let placed = 0;
  for(const key of APX.order){
    const d = APX.disp[key], anchors = LR_CAD_ANCHOR[key];
    if(!d || !anchors) continue;
    for(const a of anchors){
      const f = lrCadFace(a.part, a.inset, fit);
      if(!f) continue;
      const g = new THREE.Group();
      /* Stand the panel a hair proud of the casting, or it z-fights with
         the recess it sits in — which on a NEAREST-sampled texture looks
         exactly like dead pixels. */
      g.position.set(f.pos[0] + f.n[0] * 0.0016,
                     f.pos[1] + f.n[1] * 0.0016,
                     f.pos[2] + f.n[2] * 0.0016);
      g.lookAt(g.position.x + f.n[0], g.position.y + f.n[1], g.position.z + f.n[2]);
      g.rotateY(Math.PI);        // the same -Z convention faceOut leaves
      g.add(lrPanel(d, f.w, f.h, a.rows));
      rig.add(g); placed++;
    }
  }
  /* The holoprojectors the export does not have. Housing and all, because a
     bare glowing ball on a bare dome reads as a rendering fault rather than
     a holoprojector. */
  for(const spec of LR_CAD_HOLO){
    const g = new THREE.Group();
    /* Sat just above the board it belongs with, at that board's own bearing
       round the dome — which is not straight ahead: the MK4's front logic
       is a good 23 degrees off centre, and a holoprojector placed at phi 0
       would sit beside it rather than over it. */
    const phi = spec.over ? lrCadPhi(spec.over) : spec.phi;
    faceOut(g, spec.theta, phi, fit.r);
    g.position.y += fit.y;
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.016, 16),
      new THREE.MeshStandardMaterial({color:0xb9c2cb, metalness:0.75, roughness:0.32}));
    housing.rotation.x = Math.PI / 2;
    g.add(housing);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 8),
      new THREE.MeshStandardMaterial({color:0x161a20, emissive:0x000000, roughness:0.6}));
    lamp.position.z = -0.008;
    g.add(lamp);
    g.userData.holo = spec.key;
    rig.add(g);
  }
  if(!placed && !LR.warned){
    LR.warned = true;
    if(typeof lg === 'function')
      lg('sys', 'the CAD dome carries no logic-display parts — the AstroPixels panels have nowhere measured to sit');
  }
  return rig;
}

/* ------------------------------------------------------------ the mount */
function lrRig(key){
  if(LR.rigs[key]) return LR.rigs[key];
  const rig = (key === 'cad') ? lrBuildCad() : lrBuildProc();
  if(rig) LR.rigs[key] = rig;
  return rig;
}
function lrMount(){
  const cadOn = (typeof CAD !== 'undefined' && CAD.active && CAD.dome && CAD.loaded);
  const key = cadOn ? 'cad' : 'proc';
  const host = cadOn ? CAD.dome : ((typeof R2 !== 'undefined') ? R2.dome : null);
  if(!host) return null;
  const rig = lrRig(key);
  if(!rig) return null;
  if(LR.hostKey === key && LR.host === host && rig.parent === host) return rig;
  if(rig.parent) rig.parent.remove(rig);
  host.add(rig);
  LR.host = host; LR.hostKey = key;
  return rig;
}

/* ------------------------------------------------------------ each frame
   Textures only move when the engine says a display changed. Most frames
   most LEDs are still paused, so this is cheap — but the saving is real
   only because a paused LED is not written at all (engine.js). The two
   facts are the same fact. */
function apxSync(){
  if(!APX.built || typeof THREE === 'undefined') return;
  const on = APX.on;
  lrShowLegacy(!on);
  if(!on) return;
  const rig = lrMount();
  if(!rig) return;
  for(const key of APX.order){
    const d = APX.disp[key], tex = LR.tex[key];
    if(!d || !tex || !d.dirty) continue;
    lrUpload(d, tex);
    d.dirty = false;
  }
  lrHolos(rig);
}

/* Seven pixels onto one lamp as their average: a 30 mm holoprojector cannot
   show a ring of six, and what a viewer reads at dome distance is the
   colour and the flicker, both of which survive the average.

   On the stand-in the lamps are the model's own — one at the top and two at
   the sides, where a real dome carries top, front and rear — so the two
   side housings stand in for front and rear, in that order. Said here
   rather than assumed anywhere else. */
const LR_HOLO_SLOT = ['top', 'front', 'rear'];
function lrLampColour(mat, h){
  let r = 0, g = 0, b = 0;
  for(let p = 0; p < 7; p++){ const c = hpCell(h, p); r += c[0]; g += c[1]; b += c[2]; }
  r /= 7; g /= 7; b /= 7;
  const peak = Math.max(r, g, b);
  if(peak < 1){ mat.emissive.setRGB(0, 0, 0); mat.emissiveIntensity = 0; return; }
  /* Normalise the hue and carry the level in the intensity: a material
     colour is clamped at 1, so a bright frame would flatten to white and
     lose exactly the flicker the short-circuit effect IS. */
  mat.emissive.setRGB(r / peak, g / peak, b / peak);
  if(mat.emissive.convertSRGBToLinear) mat.emissive.convertSRGBToLinear();
  mat.emissiveIntensity = 0.25 + 2.1 * (peak / 255);
}
function lrHolos(rig){
  if(LR.hostKey === 'cad'){
    for(const g of rig.children){
      const key = g.userData && g.userData.holo;
      if(!key || !APX.holo[key]) continue;
      const lamp = g.children[1];
      if(lamp && lamp.material) lrLampColour(lamp.material, APX.holo[key]);
    }
    return;
  }
  if(typeof R2 === 'undefined' || !R2.hp) return;
  for(let i = 0; i < R2.hp.length && i < LR_HOLO_SLOT.length; i++){
    const h = APX.holo[LR_HOLO_SLOT[i]], lamp = R2.hp[i];
    if(h && lamp && lamp.material) lrLampColour(lamp.material, h);
  }
}

/* The stand-in's own sine-wave lights. They stay in the model and stay
   driven by app/animate.js whenever the AstroPixels layer is off — a build
   whose dome lighting answer is Teeces or "none yet" still wants a droid
   whose logics blink, and going dark would look broken rather than
   unmodelled. The whole fitting goes, bezel included: hiding only the
   glowing face leaves a black surround floating where no board is. */
function lrShowLegacy(show){
  if(LR.hidden === !show) return;
  LR.hidden = !show;
  if(typeof R2 === 'undefined') return;
  for(const g of (R2.logicG || [])) g.visible = show;
  for(const g of (R2.psiG || [])) g.visible = show;
}
