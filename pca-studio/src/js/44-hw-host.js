'use strict';
/* =====================================================================
   HW — PCA STUDIO's implementation of the hardware seam

   The contract, and the reasoning behind it, is documented once in
   src/js/maestro/hw-host.js, which is the SIMULATOR's implementation over
   MSTR. This is the same contract over Studio's PROJ.

   Studio is the simpler host by some distance: it has one channel array,
   one engine, one place to save to, and no 3D droid to keep in step. That
   is the point of it — a 197 KB page you open from a USB stick next to a
   droid, with the same channel table, the same dial and the same wire
   protocol as the big app.
   ===================================================================== */

const HW = {
  channels(){ return PROJ.channels; },
  count(){ return PROJ.channels.length; },
  /* fills 0..i, never just i — a hole is invisible until something walks
     the array (HANDOVER §Traps) */
  ensure(i){
    const mk = ()=>({name:'', mode:'Input', min:4000, max:8000,
                     home:0, homemode:'Off', speed:0, acceleration:0});
    for(let k=0;k<=i;k++) if(!PROJ.channels[k]) PROJ.channels[k] = mk();
    return PROJ.channels[i];
  },
  boards(){ return Math.max(1, Math.ceil(PROJ.channels.length/16)); },
  trim(n){ if(PROJ.channels.length > n) PROJ.channels.length = n; },
  /* Studio owns its hardware outright: how many boards you said IS how many
     channels there are */
  setupCount(){ return SETUP.hw.boards * 16; },
  sequences(){ return PROJ.sequences || (PROJ.sequences = []); },
  addSequence(seq){ this.sequences().push(seq); curSeq = this.sequences().length-1; },

  /* --------------------------------------------------- the wizard's answers
     Studio owns the hardware outright: the answers ARE the project, so
     applying them rebuilds the whole screen and there is nothing to
     reconcile against. */
  setup(){ return PROJ.setup; },
  setSetup(hw){ PROJ.setup = hw; },
  appVersion(){ return STUDIO_VERSION + ' (PCA Studio)'; },
  applied(){ curSeq = 0; rebuildAll(); },

  engine(){ return E; },
  rebuild(keep){ rebuildEngine(keep); },
  /* Studio has no model to mirror into — the engine IS the droid here, and
     the wire is the engine's onWrite */
  drive(ch, qus){ pcaSetTarget(E, ch, qus); },
  pos(ch){ return pcaPos(E, ch); },
  tick(dtMs){ pcaTick(E, dtMs); },

  osc(){ return PROJ.osc; },
  setOsc(hz){ PROJ.osc = hz|0; },
  freq(){ return (PROJ.setup && PROJ.setup.freq) || 50; },
  setFreq(hz){ PROJ.setup = PROJ.setup || {}; PROJ.setup.freq = hz|0; },

  say(msg, cls){ log(msg, cls); },
  save(){ projSave(); },
  /* the frame grid's column headers carry channel names, so a rename has
     to reach it — but rebuilding the whole UI on every keystroke would
     take the caret with it, so this is the narrow version */
  changed(){ rebuildEngine(true); if(typeof buildFrames === 'function') buildFrames(); }
};
