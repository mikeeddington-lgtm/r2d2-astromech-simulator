'use strict';
/* =====================================================================
   WHAT IS ON THE STAGE — one model at a time

   Mike, 2026-07-29: "in the model tab put a selection thing so that only
   one model is displayed and works."

   Four things can stand on the stage now — the MK4 droid, the Anzellan
   head, the Polar Mouse and (v1.41.0) whatever you build yourself in the
   Model Builder — and having them all out at once made the Model tab lie:
   its visibility switches, its part table and its actuator mapping are
   all the DROID's, and they sat above other models they have nothing to
   do with. So there is one selection, `PREFS.model`, and everything
   follows it:

     · only the selected model is in the scene
     · it is the one the pad drives (the mouse takes the sticks; the droid
       gets them back otherwise)
     · only its channels are registered in ACT, so the Outputs table, the
       sequencer and the wiring sheet describe what you are looking at
     · the Model tab shows that model's own panel and nothing else

   WHAT THIS IS NOT. It does not stop the sketch. The firmware keeps
   running whatever is on the stage — that is the entire point of the
   simulator, and a selector that quietly halted `loop()` would be the same
   mistake as a "simple mode" that simplified the model (see §3, view
   modes). Select the head and the droid is off the stage, not switched
   off: the serial console, the Outputs table and the automation timers all
   carry on.
   ===================================================================== */

const MODELS = [
  {id:'droid', label:'R2-D2 MK4',   short:'R2-D2',
   blurb:'Your MK4 build. The CAD geometry, 36 rigged parts, driven by whichever sketch the build config picked.'},
  {id:'frik',  label:'Anzellan head', short:'Frik head',
   blurb:'The bench-stand puppet head. 11 face channels — jaw, lips, brows, lids, eyes and a head gimbal.'},
  {id:'mouse', label:'Polar Mouse + chariot', short:'Polar Mouse',
   blurb:'Drivable. Ackermann steering on a chassis measured off the CAD, towing the chariot on a hinged hitch.'},
  /* v1.41.0 — the fourth model, and the only one you build yourself: a
     50 mm-grid parts bin (beams, plates, discs, hinges, ball joints) with
     no fixed rig at all. See scene/builder.js. */
  {id:'builder', label:'Builder', short:'Builder',
   blurb:'Build your own mechanism from parts — beams, plates, discs and joints, snapped to a 50 mm grid.'},
  /* v1.60.0 — the fifth, and the only one that is not 3D at all. It went
     from little 3D servos on the stage (v1.57.0) to a workspace of its own
     (v1.59.0) to this: Mike circled the stage and said "the servo grid
     should be where ive marked and replace the r2 completly — we need to
     treat it as another modle like we did for the polar mouse, only we dont
     need the stage area, just a simple screen representing the servos".
     So it IS a model, and app/servos.js draws a flat screen over #stage
     instead of anything the renderer has to deal with. */
  {id:'servos', label:'Servo gauges', short:'Servos',
   blurb:'Every channel on your board as a gauge or a dial, in place of the droid. Click one to see what it drives, name it or test it.'}
];
const MODEL_IDS = MODELS.map(m => m.id);
function modelById(id){ return MODELS.find(m => m.id === id) || MODELS[0]; }

function modelGet(){
  const id = (typeof PREFS !== 'undefined') ? PREFS.model : null;
  return MODEL_IDS.indexOf(id) >= 0 ? id : 'droid';
}

/* WHAT IS ACTUALLY STANDING THERE, as opposed to what PREFS.model asks for
   (v1.46.0). The two are the same almost always — but not at boot, where the
   preference is read long before the payloads have finished loading, and not
   when something writes PREFS.model straight (app/setup-io.js's import, the
   wizard, a suite). modelSet() skips the re-apply only when BOTH agree, so
   "pick the model already on the stage" costs nothing while "the stage is out
   of step with the preference" still gets put right. */
let MODEL_ON_STAGE = null;

/* Put the current selection into effect. Split out from modelSet() because
   boot has to re-apply it once the payloads have finished loading, and
   modelSet() deliberately does nothing when the id has not changed. */
function modelApply(opts){
  const id = modelGet();
  const o = opts || {};
  MODEL_ON_STAGE = id;

  /* the droid: one switch covers the procedural body, the legs and the CAD,
     because CAD.root hangs off R2.root */
  if(typeof R2 !== 'undefined' && R2.root) R2.root.visible = (id === 'droid');

  if(typeof anzSetShown === 'function') anzSetShown(id === 'frik');
  if(typeof mouseSetShown === 'function') mouseSetShown(id === 'mouse');
  /* the builder never takes the pad — like frik, it is a bench thing, not
     something you drive */
  if(typeof mbSetShown === 'function') mbSetShown(id === 'builder');
  /* not a 3D model at all — a flat screen over the stage (app/servos.js),
     but selected and remembered exactly like the four that are */
  if(typeof svSetShown === 'function') svSetShown(id === 'servos');
  /* visibility first: hiding the mouse hands the pad back on its own, so
     claiming it afterwards is the order that survives either direction */
  if(typeof mouseSetDriver === 'function') mouseSetDriver(id === 'mouse' ? 'mouse' : 'r2');

  if(o.frame !== false) modelFrame(id);
  modelSyncBtn();
  if(typeof buildCadPane === 'function') buildCadPane();
  return id;
}

function modelSet(id, opts){
  const next = MODEL_IDS.indexOf(id) >= 0 ? id : 'droid';
  const prev = modelGet();
  if(typeof PREFS !== 'undefined'){ PREFS.model = next; if(typeof prefsSave === 'function') prefsSave(); }
  /* THE RULE modelApply()'s own comment states — "modelSet() deliberately
     does nothing when the id has not changed" — which only the log line
     below obeyed (v1.46.0). Everything after it ran on every pick, so
     choosing the model ALREADY on the stage reset it: modelApply →
     anzSetShown → anzRegister() writes ACT[a.id] = a.home unconditionally
     for all eleven Anzellan face channels, and modelFrame() throws the
     camera back to its default. Mid-sequence, that is the head snapping to
     home because you re-picked the model you were already looking at.
     scene/builder.js states the same law for its own channels and keeps it
     (mbRegisterPart is idempotent, mbSetShown acts only on the was/!was
     edge); this is the seam that was breaking it for the others.
     MODEL_ON_STAGE, not just `prev`: a preference that was written straight
     rather than picked has not been put into effect yet, and that case still
     has to apply — it is the same case modelApply() is split out for. */
  if(next === prev && MODEL_ON_STAGE === next) return next;
  if(next !== prev && typeof lg === 'function') lg('sys', 'stage → ' + modelById(next).label);
  return modelApply(opts);
}
function modelCycle(){
  const i = MODEL_IDS.indexOf(modelGet());
  return modelSet(MODEL_IDS[(i + 1) % MODEL_IDS.length]);
}

/* v1.15.0 (M3) — the option list for the stage picker: full label on the
   row, the blurb as its tooltip */
function modelOptions(){
  return MODELS.map(m => ({id:m.id, label:m.label, hint:m.blurb}));
}

/* frame whatever was just selected — the three are wildly different sizes,
   and a head 60 cm tall in a camera set up for a 1.2 m droid is a dot */
function modelFrame(id){
  if(typeof CAM === 'undefined') return;
  CAM.follow = false;
  if(typeof syncFollowBtn === 'function') syncFollowBtn();
  if(id === 'frik' && typeof ANZ !== 'undefined' && ANZ.root){
    CAM.target.set(ANZ.root.position.x, ANZ_D.standH + 0.06, ANZ.root.position.z);
    CAM.dist = 0.85; CAM.phi = 1.30; CAM.theta = Math.PI + 0.26;
  }else if(id === 'mouse' && typeof MOUSE !== 'undefined' && MOUSE.root){
    CAM.target.set(MOUSE.pos.x, 0.22, MOUSE.pos.z);
    CAM.dist = 1.95; CAM.phi = 1.18; CAM.theta = Math.PI - 0.85;
  }else if(id === 'builder' && typeof MB !== 'undefined' && MB.root){
    CAM.target.set(0, 0.05, 0);
    CAM.dist = 0.85; CAM.phi = 1.05; CAM.theta = Math.PI - 0.6;
  }else if(id === 'servos'){
    /* nothing to frame: there is no scene under it. Leaving the camera
       exactly where it was means switching back to the droid puts you where
       you left off rather than at some default. */
    return;
  }else if(typeof viewFrame === 'function'){
    viewFrame('full');
  }
}

function modelSyncBtn(){
  const b = (typeof $ === 'function') ? $('btnModel') : null;
  if(!b) return;
  const m = modelById(modelGet());
  b.textContent = m.short;
  b.title = 'On the stage: ' + m.label + ' — click to choose. '
          + 'Only the selected model is shown, driven and mapped; the sketch keeps running either way.';
  /* the 🔧 BUILD stage button (scene/builder.js) is a sibling of this same
     chip and only makes sense while the builder is what it names — this is
     the one seam that repaints the chip on every model-apply, so hooking
     the button's show/hide in right here is what keeps the two in step. */
  if(typeof mbSyncStageButton === 'function') mbSyncStageButton();
}
