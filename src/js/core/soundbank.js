'use strict';
/* =====================================================================
   SOUND BANK — the real Padawan sound pack

   Mike's pack: github.com/Imperiallandm/r2sounds → Padawan_sounds_May22.zip,
   53 MP3s numbered 01-53 — exactly the track space every ported sketch
   triggers (startup 21, arm/disarm 52/53, Y 13-16, A 17-24, X 25-31,
   B 32-51 …). 18 MB, so the files are NOT embedded in the build: drop the
   zip (or the 53 mp3s) onto the sim once and it plays the real sounds.
   The bank persists in IndexedDB where the browser allows it (file://
   included in Chrome), so the drop is one-time per machine.

   SOUND_NAMES below is just the pack's file names (tiny) — embedded so the
   HUD and Serial log can say "13 · ALARM3" even before any files load.
   ===================================================================== */
const SOUND_NAMES = {
  1:'SCREAM2', 2:'CHORTLE', 3:'DOODOO', 4:'WOLFWSTL', 5:'LEIA', 6:'SHORTCKT',
  7:'PATROL1', 8:'ANNOYED', 9:'Theme', 10:'Cantina', 11:'Emperor', 12:'Chorus',
  13:'ALARM3', 14:'ALARM5', 15:'ALARM7', 16:'ALARM8',
  17:'MISC3', 18:'MISC7', 19:'MISC14', 20:'MISC16', 21:'MISC17', 22:'WHIST9',
  23:'MISC30', 24:'MISC34',
  25:'OOH1', 26:'OOH2', 27:'OOH3', 28:'OOH4', 29:'OOH5', 30:'OOH6', 31:'OOH7',
  32:'SENT1', 33:'SENT2', 34:'SENT3', 35:'SENT4', 36:'SENT5', 37:'SENT6',
  38:'SENT7', 39:'SENT8', 40:'SENT9', 41:'SENT10', 42:'SENT11', 43:'SENT12',
  44:'SENT13', 45:'SENT14', 46:'SENT15', 47:'SENT16', 48:'SENT17', 49:'SENT18',
  50:'SENT19', 51:'SENT20', 52:'HUM19', 53:'HUM20'
};

const SBANK = { bufs:{}, names:{}, decoded:{}, count:0, playing:null, ctx:null, gain:null,
                /* the one IndexedDB connection, the writes a drop is waiting
                   on, and what went wrong if any of them did — see the
                   persistence section at the foot of this file */
                db:null, _dbp:null, puts:[], failed:0, failWhy:null };

function sbankCtx(){
  if(!SBANK.ctx){
    SBANK.ctx = new (window.AudioContext||window.webkitAudioContext)();
    SBANK.gain = SBANK.ctx.createGain();
    SBANK.gain.connect(SBANK.ctx.destination);
  }
  if(SBANK.ctx.state !== 'running') SBANK.ctx.resume().catch(()=>{});
  return SBANK.ctx;
}

/* A FILE NAME BECOMES A LABEL, AND MUST NOT COME OUT WORSE THAN IT WENT IN.

   This was `name.replace(/\.\w+$/,'').replace(/^\d+/,'') || name`, which
   stripped the extension and the leading track number and stopped — leaving
   the SEPARATOR behind. "01 SCREAM2.mp3" became " SCREAM2", with the space;
   "07-ALARM3.mp3" became "-ALARM3". Worse, "21.wav" became "21.wav": the
   strip emptied the string and the `|| name` fallback handed back the raw
   filename. trackDesc() (core/audio.js) prefers SBANK.names[n] over the
   embedded SOUND_NAMES[n], so dropping the real pack's `21.mp3` REPLACED
   the correct "MISC17" with "21.mp3" everywhere the sim names that sound.

   So: take the separator with the number, trim what is left, and when there
   is nothing left fall back to the PACK's name for that track before ever
   falling back to the filename. */
function sbankLabel(n, file){
  const stem = String(file)
    .replace(/\.\w+$/, '')                 // the extension
    .replace(/^\s*\d+\s*[-_.\s]*/, '')     // the track number AND what separates it
    .trim();
  return stem
      || (typeof SOUND_NAMES !== 'undefined' && SOUND_NAMES[n])
      || String(file);
}

function sbankAdd(n, name, buf, persist){
  SBANK.bufs[n] = buf;
  SBANK.names[n] = sbankLabel(n, name);
  delete SBANK.decoded[n];
  SBANK.count = Object.keys(SBANK.bufs).length;
  /* the write is queued, not fired and forgotten: sbankLoadFiles() waits on
     these before it writes the receipt, so the receipt can say what was
     actually STORED rather than what happened to decode */
  if(persist !== false) SBANK.puts.push(sbankIdbPut(n, name, buf));
}

/* the boards call this on every playTrack/playSpecified */
function sbankPlay(n){
  const buf = SBANK.bufs[n];
  if(!buf) return false;                       // no file — the log still shows the trigger
  const ctx = sbankCtx();
  const go = (audio)=>{
    sbankStop();
    const src = ctx.createBufferSource();
    src.buffer = audio;
    // volume 0 is valid (silence), so use ?? not || to distinguish 0 from unset (v1.39.5)
    SBANK.gain.gain.value = clamp(((SND.vol ?? 30)/30), 0, 1);
    src.connect(SBANK.gain);
    src.start();
    SBANK.playing = {n, src};
    src.onended = ()=>{ if(SBANK.playing && SBANK.playing.src===src) SBANK.playing=null; };
  };
  if(SBANK.decoded[n]){ go(SBANK.decoded[n]); return true; }
  ctx.decodeAudioData(buf.slice(0)).then(a=>{ SBANK.decoded[n]=a; go(a); })
    .catch(e=>lg('warn','sound '+n+' failed to decode: '+e.message));
  return true;
}
function sbankStop(){
  if(SBANK.playing){ try{ SBANK.playing.src.stop(); }catch(e){} SBANK.playing=null; }
}

/* ---------------------------------------------------- loading: zip / files
   Tiny zip reader — central directory walk; STORED entries copied, DEFLATE
   entries inflated with DecompressionStream('deflate-raw'). No vendor lib. */
async function sbankLoadZip(file){
  const ab = await file.arrayBuffer();
  const dv = new DataView(ab);
  let e = ab.byteLength - 22;
  while(e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if(e < 0) throw new Error(file.name+' is not a zip');
  const cnt = dv.getUint16(e+10, true);
  let p = dv.getUint32(e+16, true), loaded=0, skipped=0;
  for(let i=0;i<cnt;i++){
    if(dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p+10, true);
    const csize  = dv.getUint32(p+20, true);
    const nlen = dv.getUint16(p+28, true), elen = dv.getUint16(p+30, true), clen = dv.getUint16(p+32, true);
    const lho  = dv.getUint32(p+42, true);
    const name = new TextDecoder().decode(new Uint8Array(ab, p+46, nlen));
    p += 46 + nlen + elen + clen;
    if(/\/$/.test(name)) continue;
    const m = name.match(/(?:^|\/)(\d{1,3})[^\/]*\.(mp3|wav|ogg|m4a)$/i);
    if(!m){ skipped++; continue; }
    const lnlen = dv.getUint16(lho+26, true), lelen = dv.getUint16(lho+28, true);
    const off = lho + 30 + lnlen + lelen;
    let raw = ab.slice(off, off + csize);
    if(method === 8){
      raw = await new Response(new Blob([raw]).stream()
              .pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    }else if(method !== 0){ skipped++; continue; }
    sbankAdd(parseInt(m[1],10), name.replace(/^.*\//,''), raw);
    loaded++;
  }
  return {loaded, skipped};
}

async function sbankLoadFiles(files){
  SBANK.puts.length = 0; SBANK.failed = 0; SBANK.failWhy = null;
  let loaded=0, skipped=0;
  for(const f of files){
    try{
      if(/\.zip$/i.test(f.name)){
        const r = await sbankLoadZip(f); loaded += r.loaded; skipped += r.skipped;
      }else{
        const m = f.name.match(/^(\d{1,3})/);
        if(m && isAudioFile(f)){ sbankAdd(parseInt(m[1],10), f.name, await f.arrayBuffer()); loaded++; }
        else skipped++;
      }
    }catch(err){ lg('warn', 'sound load failed ('+f.name+'): '+err.message); skipped++; }
  }
  /* THE RECEIPT IS ABOUT WHAT SURVIVES A RELOAD, so wait for the writes
     sbankAdd() queued before saying anything. This used to count decodes
     and call them tracks. */
  const stored = await Promise.all(SBANK.puts.splice(0));
  const lost = stored.filter(v => v === false).length;
  lg('mp3', 'sound bank: '+loaded+' file(s) loaded'+(skipped?', '+skipped+' skipped (need a leading track number)':'')
     + ' — '+SBANK.count+' of 53 tracks present');
  if(lost) lg('warn', 'sound bank: '+lost+' of '+loaded+' file(s) could not be stored ('
     + (SBANK.failWhy||'storage error') + ') — they play this session and are gone after a reload');
  /* one toast per drop/pick, never per file — the status line lives on the
     Controls tab, which is not where the zip was dropped */
  toast(loaded
    ? 'Sound bank: '+loaded+' file(s) loaded'+(skipped?', '+skipped+' skipped':'')+' — '+SBANK.count+' of 53 tracks'
      + (lost ? ' · '+lost+' NOT SAVED ('+(SBANK.failWhy||'storage error')+') — gone after a reload' : '')
    : 'No usable sound files'+(skipped?' — '+skipped+' skipped (need a leading track number)':''),
    (loaded && !lost) ? 'ok' : 'warn');
  sbankSyncUI();
  return {loaded, skipped};
}

/* ------------------------------------------------------------- IndexedDB
   ONE CONNECTION, AND A FAILED WRITE THAT SAYS SO.

   This was an `indexedDB.open()` per file with a `.catch(()=>{})` on the
   end, and both halves of that were wrong. Dropping the 53-track Padawan
   pack opened 53 connections, started 53 transactions nobody awaited and
   closed none of the handles. And the catch only ever saw the OPEN fail: a
   QuotaExceededError on put() aborts the TRANSACTION and fires `error`
   there — on a handle with no listener, long after the promise had already
   resolved. So a bank that failed to store a single byte reported "53 of 53
   tracks" (a count of decodes), and the next reload came up empty with
   nothing ever having been said.

   Now: one cached connection, both transaction failure events hooked, and
   every put resolves true/false so the drop's receipt can be about what
   survives a reload. */
function sbankIdb(){
  if(SBANK.db)  return Promise.resolve(SBANK.db);
  if(SBANK._dbp) return SBANK._dbp;
  SBANK._dbp = new Promise((res, rej)=>{
    try{
      const rq = indexedDB.open('r2sim-sounds', 1);
      rq.onupgradeneeded = ()=>rq.result.createObjectStore('files');
      rq.onsuccess = ()=>res(rq.result);
      rq.onerror   = ()=>rej(rq.error);
    }catch(err){ rej(err); }
  }).then(db=>{
    SBANK.db = db;
    /* a handle the browser takes away underneath us — site data cleared,
       another tab upgrading the store — must not be handed out again */
    db.onclose = db.onversionchange = ()=>{
      try{ db.close(); }catch(e){}
      SBANK.db = null; SBANK._dbp = null;
    };
    return db;
  }, err=>{ SBANK._dbp = null; throw err; });
  return SBANK._dbp;
}
function sbankPersistFail(e){
  SBANK.failed++;
  const err = (e && e.target && e.target.error) || e;
  if(!SBANK.failWhy) SBANK.failWhy = (err && (err.name || err.message)) || 'storage error';
  return false;
}
/* resolves true when the file is on disk, false when it is not — never
   rejects, because the caller's job is to COUNT failures, not to stop */
function sbankIdbPut(n, name, buf){
  return sbankIdb().then(db=>new Promise(res=>{
    let settled = false;
    const tx = db.transaction('files','readwrite');
    const fail = e=>{ if(settled) return; settled = true; res(sbankPersistFail(e)); };
    tx.onerror = fail;                       // the write itself was refused
    tx.onabort = fail;                       // …or the quota killed the whole tx
    tx.oncomplete = ()=>{ if(!settled){ settled = true; res(true); } };
    try{ tx.objectStore('files').put({name, buf}, n); }
    catch(err){ fail(err); }
  })).catch(err=>sbankPersistFail(err));
}
function sbankClear(){
  SBANK.bufs={}; SBANK.names={}; SBANK.decoded={}; SBANK.count=0; sbankStop();
  sbankIdb().then(db=>db.transaction('files','readwrite').objectStore('files').clear()).catch(()=>{});
  toast('Stored sound files forgotten — drop the pack again to reload');
  sbankSyncUI();
}
async function sbankInit(){
  try{
    const db = await sbankIdb();
    const st = db.transaction('files').objectStore('files');
    const keys = await new Promise((res,rej)=>{ const r=st.getAllKeys(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
    const vals = await new Promise((res,rej)=>{ const r=st.getAll();     r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
    keys.forEach((k,i)=>{ if(vals[i] && vals[i].buf) sbankAdd(k, vals[i].name, vals[i].buf, false); });
    if(SBANK.count) lg('mp3','sound bank restored from browser storage — '+SBANK.count+' of 53 tracks');
  }catch(err){ /* private mode / no IDB — drop the zip again next session */ }
  sbankSyncUI();
}

/* ------------------------------------------------------------------- UI */
function sbankSyncUI(){
  const s = $('sbankStat');
  if(!s) return;
  s.textContent = SBANK.count
    ? SBANK.count+' / 53 real sounds loaded'
    : 'no sound files — drop the Padawan zip here to hear the real thing';
  s.classList.toggle('ok', SBANK.count>0);
}
function sbankBindUI(){
  const b = $('btnSounds'); if(!b) return;
  const fin = document.createElement('input');
  fin.type='file'; fin.multiple=true; fin.accept='.zip,audio/*,.mp3,.wav,.ogg,.m4a';
  fin.style.display='none'; document.body.appendChild(fin);
  fin.addEventListener('change',()=>{ if(fin.files.length) sbankLoadFiles(Array.from(fin.files)); fin.value=''; });
  b.addEventListener('click',()=>fin.click());
  const bc = $('btnSoundsClear');
  if(bc) bc.addEventListener('click',async ()=>{
    if(await appConfirm('Forget all stored sound files?',
      {title:'Forget sounds', yes:'Forget them', no:'Keep them'})) sbankClear();
  });
  sbankSyncUI();
}
