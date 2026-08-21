'use strict';
/* =====================================================================
   BLOCK SEQUENCER — the HOST seam (PCA Studio's implementation)

   The other end of the seam described in src/js/maestro/blocks-host.js.
   The sim's bricks refer to ACTUATORS — 'pie3', 'panel2' — because that is
   what its builder named. Studio has no droid, so here a brick's `ref` is
   simply 'ch<n>', and every label is the channel's own name.

   The whole point of this file is that it is the ONLY difference. The
   timeline, the compiler, the ready-made shapes, undo and snapping are the
   sim's own `blocks.js`, loaded verbatim.
   ===================================================================== */

const BLKH = {
  /* ---------------------------------------------------------- the board */
  loaded(){ return !!(PROJ && PROJ.channels && PROJ.channels.length); },

  /* blocks.js indexes frame targets by `c.i`, so the channel objects it
     sees must carry their own index. PROJ.channels is a plain array, so the
     index IS the position — this is the whole adaptation. */
  channels(){
    if(!this.loaded()) return [];
    return PROJ.channels.map((c,i)=>({
      i, act:'ch'+i, name:c.name, mode:c.mode,
      min:c.min, max:c.max, home:c.home, homemode:c.homemode,
      speed:c.speed, acceleration:c.acceleration
    }));
  },
  servoChannels(){ return this.channels().filter(c=>/^servo/i.test(c.mode)); },
  sequences(){ return (PROJ && PROJ.sequences) || []; },

  chanFor(ref){
    const i = BLKH.refIndex(ref);
    if(i === null) return null;
    const c = PROJ.channels[i];
    if(!c || !/^servo/i.test(c.mode)) return null;
    return {i, act:'ch'+i, name:c.name, mode:c.mode,
            min:c.min, max:c.max, home:c.home, homemode:c.homemode,
            speed:c.speed, acceleration:c.acceleration};
  },
  refIndex(ref){
    const m = /^ch(\d+)$/.exec(String(ref));
    return m ? +m[1] : null;
  },
  label(ref){
    const i = BLKH.refIndex(ref);
    if(i === null) return String(ref);
    const c = PROJ.channels[i];
    return (c && c.name) ? c.name : ('Channel '+i);
  },

  /* -------------------------------------------------------- the library */
  actions(){
    return BLKH.servoChannels().map(c=>({
      act:c.act, ch:c.i, label:c.name || ('Channel '+c.i), sub:'ch '+c.i
    }));
  },
  /* No pies or panels here, so the useful groupings are the ones a PCA9685
     rig actually has: the board a channel lives on, and whatever the user
     has named consistently. */
  groups(){
    const out = [];
    const acts = BLKH.actions();
    if(!acts.length) return out;
    const boards = new Map();
    acts.forEach(a=>{
      const b = a.ch >> 4;
      if(!boards.has(b)) boards.set(b, []);
      boards.get(b).push(a.act);
    });
    if(boards.size > 1) boards.forEach((members, b)=>{
      out.push({id:'board'+b, label:'Board '+b+' (0x'+(0x40+b).toString(16)+')', members});
    });
    else out.push({id:'all', label:'All channels', members:acts.map(a=>a.act)});
    /* a shared first word is how people name a set — "Pie 1", "Pie 2" */
    const byWord = new Map();
    acts.forEach(a=>{
      const w = String(a.label).trim().split(/[\s_-]+/)[0].toLowerCase();
      if(!w || /^\d+$/.test(w)) return;
      if(!byWord.has(w)) byWord.set(w, []);
      byWord.get(w).push(a.act);
    });
    byWord.forEach((members, w)=>{
      if(members.length < 2 || members.length === acts.length) return;
      out.push({id:'w-'+w, label:w.charAt(0).toUpperCase()+w.slice(1)+' ×'+members.length, members});
    });
    return out;
  },

  /* --------------------------------------------------------- appearance */
  colorIndex(ref){ return BLKH.refIndex(ref); },
  colorMap(){
    if(!PROJ.blkColors) PROJ.blkColors = {};
    return PROJ.blkColors;
  },
  saveColors(){ projSave(); },
  repaint(){},
  tintHex(){ return null; },        /* no model to tint */

  /* ------------------------------------------------------------ physics */
  travelMs(c, dist){ return chanTravelMs(c, dist); },
  speedForMs(c, dist, ms){ return chanSpeedForMs(c, dist, ms); },
  neutral(){ return 6000; },

  /* -------------------------------------------------------------- hooks */
  applyPose(targets){
    if(!targets) return;
    for(let i=0;i<targets.length;i++) if(targets[i]) pcaSetTarget(E, i, targets[i]);
  },
  changed(){ if(typeof blkAfterChange === 'function') blkAfterChange(); },
  log(cat, msg){ log(msg); },

  /* --------------------------------------------------------------- music
     Studio has no music track, so there is no beat grid — the snapper
     falls back to brick edges and its own coarse grid on its own. */
  musicLoaded(){ return false; },
  musicBeats(){ return []; }
};
