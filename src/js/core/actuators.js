'use strict';
/* v1.40.0 — Mike: "option to choose others that are not part of the model,
   say Other 1 through 10". Ten model-independent placeholder actuators for
   a servo that drives something entirely off the CAD model — a fire
   extinguisher, a light-up sign, a custom rig bolted to the frame, whatever
   ends up wired to a spare channel. No CAD part will EVER claim one
   (chPartOptions() in app/boards.js builds them separately from CAD.moving,
   and applyToModel() in app/animate.js never reads an 'oth*' key, so they
   paint and move nothing on the droid). They still have to exist here or a
   channel mapped to one could not be sequenced (BLKH.actions() only offers
   channels with a live ACT/ACT_T entry), tinted-checked or ACT_T-driven at
   all — the same reasoning that put the holoprojector axes in ACT_KEYS
   before any CAD part carried them. */
const OTH_COUNT = 10;
const OTH_KEYS = Array.from({length:OTH_COUNT}, (_,i)=>'oth'+(i+1));
const ACT_KEYS = ['doorL','doorR','gripArm','claw','interArm','interTool','utilUp','utilLo','dataport','chargebay',
                  'doorRL','doorRR','smallDoor','drawer',    // the four before these only exist on the MK4 CAD
  /* The three holoprojectors, each a pan/tilt pair. Real domes wire these —
     Mike's Mini 18 spends six of its eighteen channels on them — so they need
     to exist as actuators even though no CAD part claims them yet: a channel
     the sim cannot name is a channel it cannot sequence, map or lint. */
                  'hp1Pan','hp1Tilt','hp2Pan','hp2Tilt','hp3Pan','hp3Tilt']
                  .concat(OTH_KEYS);
const ACT = {}; const ACT_T = {};
const PIE_COUNT = 12;      // MK4 dome: 6 large + 6 small pie panels
const PANEL_COUNT = 14;    // MK4 dome side panels
function actReset(){
  ACT_KEYS.forEach(k=>{ACT[k]=0;ACT_T[k]=0;});
  for(let i=0;i<PIE_COUNT;i++){ ACT['pie'+i]=0; ACT_T['pie'+i]=0; }
  for(let i=0;i<PANEL_COUNT;i++){ ACT['panel'+i]=0; ACT_T['panel'+i]=0; }
}
actReset();

/* ============================================================ PCA9685 model
   Used by the mod2026 profile. Pulse values move toward their target so you
   see real servo travel time rather than instant snaps.
   ======================================================================= */
