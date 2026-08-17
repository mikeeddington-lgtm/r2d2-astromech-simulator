'use strict';
/* =====================================================================
   BLOCK SEQUENCER — the HOST seam (the simulator's implementation)

   `blocks.js` is the sequencer's model: the timeline, the compiler that
   turns bricks back into Maestro frames, the ready-made shapes, undo and
   snapping. None of that is about R2-D2. It was written against the sim's
   globals anyway — MSTR, PARTS, CAD, MUSIC, PREFS — and that is what kept
   it from being usable anywhere else.

   Everything the model needs from its surroundings now comes through one
   object, `BLKH`. The sim supplies this file; PCA Studio supplies its own,
   where a "part" is just a channel and there is no droid to tint. The
   model file is shared between them verbatim, so a fix to the compiler is
   a fix in both tools rather than a note in the handover asking someone to
   remember.

   Load order matters: this file defines BLKH and must come BEFORE
   blocks.js, which reads it.

   Nothing here has any logic of its own. If you find yourself writing a
   rule in this file, it belongs in blocks.js — otherwise the two tools
   quietly start behaving differently, which is the exact thing the seam
   exists to prevent.
   ===================================================================== */

const BLKH = {
  /* ---------------------------------------------------------- the board */
  loaded(){ return typeof MSTR !== 'undefined' && !!MSTR.loaded; },
  channels(){ return (typeof MSTR !== 'undefined' && MSTR.channels) || []; },
  servoChannels(){ return this.channels().filter(c=>/^servo/i.test(c.mode)); },
  sequences(){ return (typeof MSTR !== 'undefined' && MSTR.sequences) || []; },

  /* A brick's `ref` is an ACTUATOR id here — 'pie3', 'panel2' — because
     that is what the builder named and what reads on a brick. Studio has no
     actuators, so there a ref is the channel index. Everything downstream
     only ever passes refs back through chanFor() and label(). */
  chanFor(ref){
    if(!this.loaded()) return null;
    return this.channels().find(c=>c.act === ref && /^servo/i.test(c.mode)) || null;
  },
  /* the part label the builder typed wins, then the friendly name — a
     channel can be wired to an actuator with no CAD geometry, and "pie5"
     on a brick reads like a bug */
  label(ref){
    if(typeof actPartLabel === 'function'){ const l = actPartLabel(ref); if(l) return l; }
    if(typeof actFriendly === 'function'){ const f = actFriendly(ref); if(f && f !== ref) return f; }
    return ref;
  },

  /* -------------------------------------------------------- the library */
  actions(){
    if(!this.loaded()) return [];
    const out = [];
    this.channels().forEach(c=>{
      if(!/^servo/i.test(c.mode) || !c.act) return;
      out.push({ act:c.act, ch:c.i, label:BLKH.label(c.act) || c.name, sub:'ch '+c.i });
    });
    return out;
  },
  /* groups make useful bricks too — "all the pies" as one drag */
  groups(){
    const out = [];
    const acts = this.actions();
    const pick = re => acts.filter(a=>re.test(a.act)).map(a=>a.act);
    const pies = pick(/^pie/), panels = pick(/^panel/), doors = pick(/^door/);
    if(pies.length)   out.push({id:'all-pies',   label:'All pies',        members:pies});
    if(panels.length) out.push({id:'all-panels', label:'All side panels', members:panels});
    if(doors.length)  out.push({id:'all-doors',  label:'All body doors',  members:doors});
    if(typeof PARTS !== 'undefined' && PARTS.groups) PARTS.groups.forEach(g=>{
      const members = (typeof groupActs === 'function' ? groupActs(g) : [])
        .filter(a=>acts.some(x=>x.act === a));
      if(members.length) out.push({id:'grp'+g.id, label:g.name, members});
    });
    return out;
  },

  /* --------------------------------------------------------- appearance
     The brick colour is derived from the CHANNEL a part is plugged into,
     so it is stable across rebuilds and two neighbouring channels never
     land on the same hue. */
  colorIndex(ref){
    if(!this.loaded()) return null;
    const c = this.channels().find(x=>x.act === ref);
    return c ? c.i : null;
  },
  colorMap(){ return PREFS.blkColors || (PREFS.blkColors = {}); },
  saveColors(){ prefsSave(); if(typeof applyPaint === 'function') applyPaint(); },
  repaint(){ if(typeof applyPaint === 'function') applyPaint(); },
  /* the model tint LAYER, read by effectivePartHex(). Studio has no model,
     and returns null — which switches the whole feature off by itself. */
  tintHex(name){
    if(typeof CAD === 'undefined' || !CAD.loaded) return null;
    const m = CAD.moving.find(x=>x.name === name);
    if(!m || !m.act) return null;
    return blkColor(m.act);
  },

  /* ------------------------------------------------------------ physics
     The imported speed/acceleration per channel are AUTHORITATIVE (Mike,
     2026-07-29): a brick may ask for a faster ramp, but the board will not
     deliver it, so neither may the preview. */
  travelMs(c, dist){
    return (typeof chanTravelMs === 'function') ? chanTravelMs(c, dist) : 0;
  },
  neutral(){ return (typeof DEFAULT_NEUTRAL !== 'undefined') ? DEFAULT_NEUTRAL : 6000; },

  /* -------------------------------------------------------------- hooks */
  applyPose(targets){ if(typeof applyFrameTargets === 'function') applyFrameTargets(targets); },
  changed(){ if(typeof reindexSubs === 'function') reindexSubs(); },
  log(cat, msg){ if(typeof lg === 'function') lg(cat, msg); },

  /* --------------------------------------------------------------- music
     Optional everywhere. Null means "no beat grid", which the snapper
     already handles — Studio simply never has one. */
  musicLoaded(){ return typeof MUSIC !== 'undefined' && !!MUSIC.loaded; },
  musicBeats(mode){
    if(!this.musicLoaded() || typeof musicSnapBeats !== 'function') return [];
    return musicSnapBeats(mode);
  }
};
