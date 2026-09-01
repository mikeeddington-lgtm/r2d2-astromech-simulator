'use strict';
/* ============================================================== PROJECT */
const LS_KEY='pcastudio.v1';
/* where boot parks a saved blob it could not use, so nothing is lost
   (v1.77.0, H13 — see projNormalise below and 99-boot.js) */
const LS_BAD_KEY='pcastudio.bad';
let PROJ=null, E=null, curSeq=0;
/* the row a NEW channel is born with — and, since v1.77.0, what an unusable
   field in a loaded row falls back to (projNormalise) */
function projDefaultChannel(i){
  return {name:'Servo '+(i|0),mode:'Servo',min:4544,max:7296,home:0,homemode:'Off',speed:80,acceleration:10};
}
function defaultProject(){
  return {
    ver:1, osc:25000000,
    channels:[0,1,2,3].map(projDefaultChannel),
    sequences:[
      {name:'Wave open', frames:[
        {name:'F0',duration:400,targets:[7296,4544,4544,4544]},
        {name:'F1',duration:400,targets:[0,7296,0,0]},
        {name:'F2',duration:400,targets:[0,0,7296,0]},
        {name:'F3',duration:600,targets:[0,0,0,7296]},
        {name:'home',duration:500,targets:[4544,4544,4544,4544]}
      ]},
      {name:'All home', frames:[{name:'F0',duration:500,targets:[4544,4544,4544,4544]}]}
    ]
  };
}
function projSave(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(PROJ)); }catch(e){} }
function projLoad(){
  try{ const t=localStorage.getItem(LS_KEY); if(t) return JSON.parse(t); }catch(e){}
  return null;
}
/* the saved text itself, unparsed — what boot parks when it cannot use it */
function projRaw(){ try{ return localStorage.getItem(LS_KEY); }catch(e){ return null; } }
function projPark(raw){ try{ if(raw != null) localStorage.setItem(LS_BAD_KEY, String(raw)); }catch(e){} }

/* ============================ VALIDATE, THEN COMMIT (v1.77.0, review H13)

   A project file used to be adopted, SAVED, and only then handed to
   rebuildAll() — which is where `{channels:{}, sequences:[]}` finally threw
   (`channels.map is not a function`). By then the blob was in localStorage,
   and every reload after it threw the same TypeError from boot with nothing
   to catch it: an empty page, no log line, and the only way back was the
   browser's own storage inspector. One bad file, opened once, and Studio was
   gone until somebody who knew where to look cleared it by hand.

   The sim's Model Builder already follows the right order (mbImportModelText):
   build the whole thing in scratch, adopt it only if it is usable, and let a
   refusal leave what you had exactly as it was. projNormalise() is that
   scratch build for Studio. It returns a NEW object holding only the fields
   Studio reads, each already in the shape its readers assume — a channel's
   ends are integers inside the Maestro's 14-bit range, a frame's targets are
   a list of integers, a sequence has a name and a frame list — plus a list
   of what it repaired or dropped, in words, so the log can say so instead of
   tidying up in silence. It throws only when there is nothing usable left:
   no channel list at all. Everything short of that is repaired to what a new
   project is born with (projDefaultChannel), because a row with one bad
   number is still a row somebody calibrated, and a frame with one bad target
   is still choreography.

   Absent and wrong are treated differently on purpose. A field that is not
   in the file at all takes its default quietly — that is an older or leaner
   file, and `releaseMs`/`ease` were added years after the first project was
   saved. A field that IS there and cannot be used is repaired AND counted:
   that is corruption or a hand edit gone wrong, and the person wants to hear
   about it. Channel rows that are not rows become default rows rather than
   vanishing, so every later channel keeps its index and every frame's
   targets still line up; a sequence or frame that is not one is dropped. */
const PROJ_MAX_CHANNELS  = 128;   /* PCA_MAX_MASK_CHANNELS — past this the engine cannot even collision-check */
const PROJ_MAX_SEQUENCES = 64;
const PROJ_MAX_QUS       = 16383; /* the Maestro's 14-bit target, in quarter-µs */
/* Pololu's four, plus `Off` — the sim's padding marker, which /^servo/i
   refuses everywhere it matters (export.js §pololuMode) */
const PROJ_MODES     = ['Servo','ServoMultiplied','Output','Input','Off'];
const PROJ_HOMEMODES = ['Off','Goto','Ignore'];
const PROJ_EASES     = ['none','soft','overshoot'];

function projNormalise(p){
  const dropped = [];
  /* how a value reads in the log — short, and never the whole blob */
  const what = v => v === null ? 'null'
    : Array.isArray(v) ? 'a list'
    : typeof v === 'object' ? 'an object'
    : typeof v === 'string' ? JSON.stringify(v.length > 24 ? v.slice(0,21)+'…' : v)
    : String(v);
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  /* a finite number, or a string holding one, rounded; NaN for anything else */
  const num = v => {
    const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.round(n) : NaN;
  };
  const asInt  = (lo, hi) => v => { const n = num(v); return (n >= lo && n <= hi) ? n : undefined; };
  const asStr  = v => typeof v === 'string' ? v : undefined;
  const asEnum = list => v => typeof v === 'string' ? list.find(k => k.toLowerCase() === v.toLowerCase()) : undefined;
  /* absent → the default, quietly; present and unusable → the default, counted */
  const pick = (obj, k, test, dflt, who) => {
    const v = obj[k];
    if(v === undefined) return dflt;
    const r = test(v);
    if(r !== undefined) return r;
    dropped.push(who+' '+k+' '+what(v)+' → '+(dflt === undefined ? 'dropped' : String(dflt)));
    return dflt;
  };
  /* an object that came in through JSON has no cycles, so this is a deep copy */
  const copy = v => JSON.parse(JSON.stringify(v));

  if(!isObj(p)) throw new Error('not a PCA Studio project — expected an object with "channels" and "sequences", got '+what(p));
  if(!Array.isArray(p.channels)) throw new Error('not a PCA Studio project — "channels" must be a list of channel rows, and here it is '+what(p.channels));
  if(!p.channels.length) throw new Error('not a PCA Studio project — the channel list is empty');

  const proj = {};
  proj.ver = Number.isFinite(p.ver) ? p.ver : 1;
  proj.osc = pick(p, 'osc', asInt(1, 1e9), 25000000, 'project');
  if(p.setup !== undefined){
    if(isObj(p.setup)) proj.setup = copy(p.setup);
    else dropped.push('project setup '+what(p.setup)+' → dropped (not an object)');
  }

  /* ---- channels: one row per index, always ---- */
  if(p.channels.length > PROJ_MAX_CHANNELS)
    dropped.push((p.channels.length - PROJ_MAX_CHANNELS)+' channels past '+PROJ_MAX_CHANNELS+' → dropped');
  proj.channels = p.channels.slice(0, PROJ_MAX_CHANNELS).map((c, i) => {
    const d = projDefaultChannel(i), who = 'channel '+i;
    if(!isObj(c)){ dropped.push(who+' was '+what(c)+', not a row → default row'); return d; }
    const out = {
      name:         pick(c, 'name',         asStr,                    d.name,         who),
      mode:         pick(c, 'mode',         asEnum(PROJ_MODES),       d.mode,         who),
      min:          pick(c, 'min',          asInt(0, PROJ_MAX_QUS),   d.min,          who),
      max:          pick(c, 'max',          asInt(0, PROJ_MAX_QUS),   d.max,          who),
      home:         pick(c, 'home',         asInt(0, PROJ_MAX_QUS),   d.home,         who),
      homemode:     pick(c, 'homemode',     asEnum(PROJ_HOMEMODES),   d.homemode,     who),
      speed:        pick(c, 'speed',        asInt(0, 65535),          d.speed,        who),
      acceleration: pick(c, 'acceleration', asInt(0, 65535),          d.acceleration, who)
    };
    const rel  = pick(c, 'releaseMs', asInt(0, 1e7),         undefined, who);
    const ease = pick(c, 'ease',      asEnum(PROJ_EASES),    undefined, who);
    if(rel  !== undefined) out.releaseMs = rel;
    if(ease !== undefined) out.ease = ease;
    return out;
  });

  /* ---- sequences: what is not a sequence is dropped, what is one is kept
     whole — frames, generator entries, bricks and their step ---- */
  let seqs = p.sequences;
  if(seqs === undefined){ dropped.push('no sequence list in the file → starting with none'); seqs = []; }
  else if(!Array.isArray(seqs)){ dropped.push('sequences '+what(seqs)+' → dropped (not a list)'); seqs = []; }
  if(seqs.length > PROJ_MAX_SEQUENCES)
    dropped.push((seqs.length - PROJ_MAX_SEQUENCES)+' sequences past '+PROJ_MAX_SEQUENCES+' → dropped');
  proj.sequences = [];
  seqs.slice(0, PROJ_MAX_SEQUENCES).forEach((s, k) => {
    const who = 'sequence '+k;
    if(!isObj(s)){ dropped.push(who+' was '+what(s)+', not a sequence → dropped'); return; }
    const out = { name: pick(s, 'name', asStr, 'Sequence '+k, who) };
    if(s.loop !== undefined)       out.loop = !!s.loop;
    if(s.background !== undefined) out.background = !!s.background;
    const gen = pick(s, 'gen', asEnum(['osc','wander']), undefined, who);
    if(gen !== undefined) out.gen = gen;
    /* entries travel even on a frame-list sequence: switching a sequence
       back to a generator reuses the rows it had (40-ui.js §selKind) */
    if(s.entries !== undefined){
      if(!Array.isArray(s.entries)){ dropped.push(who+' entries '+what(s.entries)+' → dropped (not a list)'); if(gen) out.entries = []; }
      else out.entries = s.entries.map((g, gi) => {
        const gw = who+' entry '+gi;
        if(!isObj(g)){ dropped.push(gw+' was '+what(g)+' → dropped'); return null; }
        return {
          ch:     pick(g, 'ch',     asInt(0, PROJ_MAX_CHANNELS-1), 0,    gw),
          lo:     pick(g, 'lo',     asInt(0, PROJ_MAX_QUS),        4544, gw),
          hi:     pick(g, 'hi',     asInt(0, PROJ_MAX_QUS),        7296, gw),
          period: pick(g, 'period', asInt(0, 1e7),                 3000, gw),
          phase:  pick(g, 'phase',  asInt(-3600, 3600),            0,    gw)
        };
      }).filter(g => g);
    }else if(gen) out.entries = [];
    /* a generator has no frames to speak of; a frame-list sequence without
       a frame list is worth a word, but it is still a sequence */
    let frames = s.frames;
    if(frames === undefined){ if(!gen) dropped.push(who+' has no frame list → empty'); frames = []; }
    else if(!Array.isArray(frames)){ dropped.push(who+' frames '+what(frames)+' → dropped (not a list)'); frames = []; }
    out.frames = frames.map((fr, f) => {
      const fw = who+' frame '+f;
      if(!isObj(fr)){ dropped.push(fw+' was '+what(fr)+' → dropped'); return null; }
      const o = {
        name:     pick(fr, 'name',     asStr,          'F'+f, fw),
        duration: pick(fr, 'duration', asInt(0, 1e7),  500,   fw)
      };
      let t = fr.targets;
      if(t === undefined){ dropped.push(fw+' has no targets → none'); t = []; }
      else if(!Array.isArray(t)){ dropped.push(fw+' targets '+what(t)+' → dropped (not a list)'); t = []; }
      o.targets = t.map((v, ci) => {
        const n = asInt(0, PROJ_MAX_QUS)(v === null ? 0 : v);
        if(n !== undefined) return n;
        dropped.push(fw+' target '+ci+' '+what(v)+' → 0'); return 0;
      });
      return o;
    }).filter(fr => fr);
    /* bricks are blocks.js's business — carried whole when they are a list
       of objects, and the step they were drawn at with them */
    if(s.blocks !== undefined){
      if(Array.isArray(s.blocks)) out.blocks = copy(s.blocks.filter(b => isObj(b)));
      else dropped.push(who+' blocks '+what(s.blocks)+' → dropped (not a list)');
    }
    const step = pick(s, 'stepMs', asInt(1, 1e6), undefined, who);
    if(step !== undefined) out.stepMs = step;
    proj.sequences.push(out);
  });
  return {proj, dropped};
}
/* the drop list as one plain phrase for the log: the count, then the first
   few reasons, so "2 values repaired" is never the whole story */
function projDropSummary(dropped){
  const n = dropped.length;
  if(!n) return '';
  return n+' value'+(n === 1 ? '' : 's')+' repaired or dropped: '
    + dropped.slice(0,3).join('; ') + (n > 3 ? '; and '+(n-3)+' more' : '');
}
function rebuildEngine(keepPositions){
  const old=E;
  E=pcaCreate(PROJ.channels, PROJ.sequences);
  /* v1.76.0 — the carry is the ENGINE's (pcaCarryState, pcaseq.js), shared
     with the sim. This file had its own copy, and that copy carried
     `target` but not `aim` — the v1.66.3 fix that reached hw-host.js and
     never this one — so every keystroke in Studio's channel table rebuilt
     an engine that steered every driven servo to its HOME, which on a
     `homemode:'Off'` channel is 0 and pins the horn at c.min. Nor did it
     carry `known`, nor skip a channel that was not a servo before. */
  if(keepPositions && old) pcaCarryState(old, E, PROJ.channels);
  E.onWrite=(ch,qus)=>serialWrite(ch,qus);
  if(SER.port) serialSyncAll();
}
