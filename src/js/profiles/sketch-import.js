'use strict';
/* =====================================================================
   SKETCH IMPORT — a deterministic Arduino-C → JS transpiler for the
   Padawan360 family (v1.21.0. Mike: "can we build a sketch importer …
   or will that need an LLM?" — it does not, and it must not).

   WHY NOT AN LLM, AS A DESIGN RULE: this simulator's highest-value output
   is the confirmed-firmware-bug list (HANDOVER §4). Those bugs were found
   because the ports are FAITHFUL — including the sins. A model porting a
   sketch quietly fixes or invents exactly the behaviour the sim exists to
   expose. This transpiler reproduces the sketch verbatim, fails LOUDLY on
   anything it does not understand (skResidue — name and line, no
   guessing), and gives the same output for the same input, forever.

   WHY IT IS SO SMALL: the hand ports (profiles/mod2026.js etc.) already
   proved the key fact — this dialect of C maps to JS almost token for
   token once the library objects exist. So instead of an AST compiler:
     · a preprocessor (#define/#include/#if defined),
     · a tokenizer,
     · a structural pass that rewrites DECLARATIONS (types→let/const,
       enums, casts, sizeof idiom) and accounts for every identifier,
     · a prelude of ADAPTERS binding the sketch's library objects to the
       sim's existing shims — the same shims the hand ports call. A
       declared `Sabertooth Sabertooth2x(128, Serial1)` binds to the real
       Sabertooth2x shim BY NAME; XBOXRECV instances get an adapter whose
       getButtonClick(b, i) is the sim's getButtonClick(b); and the
       button/axis enums (UP, L1, LeftHatY…) are string constants, so a
       sketch that stores them in variables (throttleAxis = LeftHatY)
       works unchanged.
   Everything between the declarations passes through as-is: C and JS
   share the whole statement/operator syntax this family uses.

   KNOWN HONEST GAPS (reported, not hidden): byte/char wraparound is not
   emulated; a mid-loop delay() arms SIM.blockUntil (loop stops running,
   as the hand ports model it) but the rest of that pass still executes;
   integer division is truncated only where both sides are provably
   int-typed, and every `/` left as float division is listed in the
   report.
   ===================================================================== */

/* Every imported sketch is its OWN firmware (Mike, 2026-08-08: "can we not
   add the new sketch as an additional Firmware?"). They stand beside the
   three hand ports in PROFILE_ORDER and in the setup's Firmware question,
   are chosen and remembered like any other build answer, and several can
   live side by side — so you can flip between your fork and the sketch it
   came from without re-importing either. SKETCH.list is the registry;
   SKETCH.byId maps profile id → {src, fileName}. */
const SKETCH = { list:[], byId:{}, src:null, fileName:null, report:null };
const SK_STORE = 'r2sim.sketches.v2';
const SK_STORE_V1 = 'r2sim.sketch.v1';        // the single-slot original

/* a stable, readable, collision-free profile id from the file name */
function sketchId(fileName){
  const base = String(fileName||'sketch').replace(/\.ino$/i,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,28) || 'sketch';
  let id = 'sketch:'+base, n = 2;
  while(PROFILES[id]) id = 'sketch:'+base+'-'+(n++);
  return id;
}
function sketchIds(){ return PROFILE_ORDER.filter(id=>/^sketch:/.test(id)); }
function isSketchProfile(id){ return /^sketch:/.test(id||''); }

/* ------------------------------------------------------------ residue */
function SkError(residue, msg){
  const e = new Error(msg || ('the sketch uses things the transpiler does not know — nothing was guessed:\n'
    + residue.slice(0, 12).map(r=>'  line '+r.line+': '+r.what).join('\n')
    + (residue.length > 12 ? '\n  … and '+(residue.length-12)+' more' : '')));
  e.residue = residue;
  return e;
}

/* ======================================================= preprocessor */
function skPreprocess(src){
  /* comments out, line count preserved so residue lines stay true */
  let s = src.replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, m=>m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, ' ');
  const defines = {};      // NAME -> token string (object-like only)
  const includes = [];
  const out = [];
  const residue = [];
  /* #if stack: each entry {active, taken} */
  const st = [];
  const active = ()=> st.every(x=>x.active);
  s.split('\n').forEach((line, k)=>{
    const n = k + 1;
    const d = /^\s*#\s*(\w+)\s*(.*)$/.exec(line);
    if(!d){ out.push(active() ? line : ''); return; }
    const [, dir, rest] = d;
    out.push('');                                    // directives leave a blank line
    if(dir === 'include'){ if(active()){ const m=/[<"]([^>"]+)[>"]/.exec(rest); if(m) includes.push(m[1]); } }
    else if(dir === 'define'){
      if(!active()) return;
      const m = /^(\w+)(\(.*?\))?\s*(.*)$/.exec(rest.trim());
      if(!m) return;
      if(m[2]) residue.push({line:n, what:'function-like macro #define '+m[1]+m[2]});
      else defines[m[1]] = (m[3]||'').trim();
    }
    else if(dir === 'undef'){ if(active()) delete defines[/^(\w+)/.exec(rest.trim())[1]]; }
    else if(dir === 'ifdef'){  const v = defines[rest.trim()] !== undefined; st.push({active: active() && v, taken:v}); }
    else if(dir === 'ifndef'){ const v = defines[rest.trim()] === undefined; st.push({active: active() && v, taken:v}); }
    else if(dir === 'if'){
      /* the dialect's uses: defined(X), !defined(X), NAME == N, NAME != N,
         bare NAME/number. FOOT_CONTROLLER == 1 is exactly how the family
         switches Sabertooth vs PWM feet — a transpile picks the branch the
         COMPILER would have picked, from the #define value, which is what
         faithful means here (the hand ports' live FOOT_CONTROLLER toggle
         is a sim feature, not a sketch feature). */
      let e = rest.trim()
        .replace(/!?\s*defined\s*\(\s*(\w+)\s*\)/g, (m, id)=> (/^!/.test(m) ? '!' : '') + (defines[id] !== undefined ? '1' : '0'))
        .replace(/\b([A-Za-z_]\w*)\b/g, (m, id)=> defines[id] !== undefined && /^-?\d+$/.test(defines[id]) ? defines[id] : m);
      if(/^[\d\s!()=<>&|]+$/.test(e)){
        let val = false;
        try{ val = !!(new Function('return ('+e+');'))(); }catch(_){ residue.push({line:n, what:'#if expression did not evaluate: '+rest.trim()}); }
        st.push({active: active() && val, taken:val});
      }else{
        residue.push({line:n, what:'#if with an expression ('+rest.trim()+') the preprocessor cannot decide'});
        st.push({active:false, taken:false});
      }
    }
    else if(dir === 'elif'){
      const t = st[st.length-1];
      if(t){
        const parent = st.slice(0,-1).every(x=>x.active);
        let e = rest.trim()
          .replace(/!?\s*defined\s*\(\s*(\w+)\s*\)/g, (m, id)=> (/^!/.test(m) ? '!' : '') + (defines[id] !== undefined ? '1' : '0'))
          .replace(/\b([A-Za-z_]\w*)\b/g, (m, id)=> defines[id] !== undefined && /^-?\d+$/.test(defines[id]) ? defines[id] : m);
        let val = false;
        if(/^[\d\s!()=<>&|]+$/.test(e)){ try{ val = !!(new Function('return ('+e+');'))(); }catch(_){ residue.push({line:n, what:'#elif did not evaluate: '+rest.trim()}); } }
        else residue.push({line:n, what:'#elif the preprocessor cannot decide: '+rest.trim()});
        t.active = parent && !t.taken && val;
        if(t.active) t.taken = true;
      }
    }
    else if(dir === 'else'){ const t=st[st.length-1]; if(t){ const parent = st.slice(0,-1).every(x=>x.active); t.active = parent && !t.taken; t.taken = true; } }
    else if(dir === 'endif') st.pop();
    else if(dir === 'pragma' || dir === 'error'){ /* ignore / note */ }
  });
  return {text: out.join('\n'), defines, includes, residue};
}

/* ========================================================== tokenizer */
const SK_PUNCT = ['<<=','>>=','...','&&','||','==','!=','<=','>=','+=','-=','*=','/=','%=','&=','|=','^=','++','--','<<','>>','->','::',
                  '{','}','(',')','[',']',';',',','.','?',':','=','<','>','+','-','*','/','%','!','&','|','^','~'];
function skTokenize(text){
  const toks = [];
  let i = 0, line = 1;
  const N = text.length;
  while(i < N){
    const ch = text[i];
    if(ch === '\n'){ line++; i++; continue; }
    if(/\s/.test(ch)){ i++; continue; }
    if(/[A-Za-z_]/.test(ch)){
      let j = i+1; while(j<N && /[A-Za-z0-9_]/.test(text[j])) j++;
      toks.push({t:'id', v:text.slice(i,j), line}); i=j; continue;
    }
    if(/[0-9]/.test(ch) || (ch==='.' && /[0-9]/.test(text[i+1]||''))){
      let j = i; while(j<N && /[0-9a-fA-FxX.uUlLeE+-]/.test(text[j])){
        if((text[j]==='+'||text[j]==='-') && !/[eE]/.test(text[j-1])) break;
        j++;
      }
      let raw = text.slice(i,j).replace(/[uUlL]+$/,'');
      toks.push({t:'num', v:raw, line, isInt: !/[.eE]/.test(raw) || /^0[xX]/.test(raw)});
      i=j; continue;
    }
    if(ch === '"'){
      let j=i+1; while(j<N && text[j] !== '"'){ if(text[j]==='\\') j++; j++; }
      toks.push({t:'str', v:text.slice(i, j+1), line}); i=j+1; continue;
    }
    if(ch === "'"){
      let j=i+1; while(j<N && text[j] !== "'"){ if(text[j]==='\\') j++; j++; }
      toks.push({t:'chr', v:text.slice(i, j+1), line}); i=j+1; continue;
    }
    const three = text.substr(i,3), two = text.substr(i,2);
    if(SK_PUNCT.includes(three)){ toks.push({t:'p', v:three, line}); i+=3; continue; }
    if(SK_PUNCT.includes(two)){ toks.push({t:'p', v:two, line}); i+=2; continue; }
    if(SK_PUNCT.includes(ch)){ toks.push({t:'p', v:ch, line}); i+=1; continue; }
    toks.push({t:'?', v:ch, line}); i++;
  }
  return toks;
}

/* ================================================== the dialect tables */
const SK_INT_TYPES = ['int','long','byte','char','short','word','uint8_t','uint16_t','uint32_t','int8_t','int16_t','int32_t','size_t'];
const SK_TYPES = SK_INT_TYPES.concat(['unsigned','signed','float','double','boolean','bool','void','String',
                                      'AnalogHatEnum','ButtonEnum','LEDEnum']);
/* library object types → how a declared instance binds. byName entries
   bind to an existing sim shim when the sketch reuses the canonical name
   (which the whole family does); otherwise `make` builds a logging stub. */
/* every instance gets a WRAPPER, never the raw shim: the sketch calls the
   full Arduino API (autobaud, setTimeout, attach, begin, setPWMFreq…) and
   the sim shims only carry the calls that mean something. The wrapper adds
   the missing surface as no-ops and delegates the meaningful ones — by
   NAME, which is how the whole family writes its instances. */
const SK_OBJ_TYPES = {
  'USB':                    {make:'__mkUsb()'},
  'XBOXRECV':               {make:'__mkXbox()'},
  'Sabertooth':             {make:'__mkSaber(%NAME%)'},
  'MP3Trigger':             {make:'__mkMp3Trigger()'},
  'MD_YX5300':              {make:'__mkYx5300()'},
  'DY__Player':             {make:'__mkDyPlayer()'},
  'Servo':                  {make:'__mkServo(%NAME%)'},
  'Adafruit_PWMServoDriver':{make:'__mkPwm(%NAME%, %ARGS%)'},
  'MicroMaestro':           {make:'__mkMaestro()'},
  'MiniMaestro':            {make:'__mkMaestro()'},
  'SoftwareSerial':         {make:'__mkSerial("soft")'}
};
/* free identifiers the generated code may reference — everything else in
   sketch scope must be declared by the sketch itself or listed here */
const SK_GLOBALS = [
  /* sim spine */ 'SIM','CFG','XB','lg',
  /* helpers injected by the prelude */ '__idiv','__cfg','__delay','__amap','__mkUsb','__mkXbox','__mkSaber',
  '__mkMp3Trigger','__mkYx5300','__mkDyPlayer','__mkServo','__mkPwm','__mkMaestro','__mkSerial',
  /* arduino free functions (prelude) */ 'millis','micros','delay','delayMicroseconds','random','randomSeed','map','constrain',
  'abs','min','max','pow','sqrt','sq','F','HEX','DEC','BIN','OCT','pinMode','digitalWrite','digitalRead','analogWrite','analogRead','tone','noTone','word','lowByte','highByte',
  /* serials (prelude) */ 'Serial','Serial1','Serial2','Serial3','Wire','MP3Stream',
  /* constants (prelude) */ 'HIGH','LOW','OUTPUT','INPUT','INPUT_PULLUP','LED_BUILTIN','true','false','NULL',
  'UP','DOWN','LEFT','RIGHT','A','B','X','Y','START','BACK','XBOX','SYNC','L1','R1','L2','R2','L3','R3',
  'LeftHatX','LeftHatY','RightHatX','RightHatY','LED1','LED2','LED3','LED4','ROTATING','FASTBLINK','SLOWBLINK','ALTERNATING',
  'MD_YX5300__SERIAL_BPS',
  /* JS carried through */ 'Math'
];
const SK_KEYWORDS = ['if','else','while','for','do','switch','case','default','break','continue','return','const','static','volatile','enum','sizeof','new'];

/* ========================================================= transpiler */
function skTranspile(src, fileName){
  const pre = skPreprocess(src);
  const residue = pre.residue.slice();
  const toks = skTokenize(pre.text);

  const declared = new Set();        // every name the sketch itself defines
  const intVars  = new Set();        // int-typed, for the division rule
  const floatDivLines = new Set();
  const extraCaveats = [];           // (v1.39.5) DEFECT 1 & 4: honest fall-backs, reported not hidden
  /* (v1.39.5) DEFECT 1: `static` locals. curFn/curFnDepth track which
     top-level function body we're currently inside (there is no nesting
     of function DEFINITIONS in this dialect, so "the depth we're back
     down to when a function's own closing brace hits" is enough to know
     it ended). staticRenames maps the static local's SOURCE name to its
     mangled module-scope slot for the REST of that function only — a
     fresh Map every time a new function starts, cleared again when it
     ends, so two functions can each have their own "static int last". */
  let curFn = null, curFnDepth = 0;
  let staticRenames = new Map();
  const preamble = [];               // `let __st_<fn>_<name> = <init>;` — hoisted once, module scope
  const enums = [];
  const instances = [];              // {name, type, bind}
  const cfgConsts = [];              // top-level numeric const/#define → Config tab
  const fns = new Set();

  /* #defines become const declarations (numeric ones join the Config tab) */
  const defLines = [];
  for(const k in pre.defines){
    const v = pre.defines[k];
    declared.add(k);
    if(/^-?\d+(\.\d+)?$/.test(v)){ cfgConsts.push({name:k, val:parseFloat(v)}); defLines.push('let '+k+' = __cfg('+JSON.stringify(k)+', '+v+');'); if(!/\./.test(v)) intVars.add(k); }
    else if(v === '') defLines.push('const '+k+' = true;');
    else defLines.push('const '+k+' = '+v+';   /* #define */');
  }

  /* ---- structural pass over the token stream ---- */
  const out = [];
  let i = 0;
  /* NOT a cached length: the NS::Member handler SPLICES a joined token into
     the stream, and a loop bound frozen before that silently drops one
     token off the END of the file per splice — which is how mod2026 lost
     triggerI2C's closing brace to its single MD_YX5300::SERIAL_BPS. */
  const N = ()=>toks.length;
  const peek = (k)=>toks[i+(k||0)] || {t:'eof', v:'', line:toks.length ? toks[toks.length-1].line : 0};
  const isType = v => SK_TYPES.includes(v);
  let depth = 0;                     // {} nesting; 0 = file scope
  let parenDepth = 0;

  const readTypeRun = ()=>{          // consumes 1+ type words incl. unsigned long
    const first = peek().v;
    let intish = SK_INT_TYPES.includes(first) || first==='unsigned' || first==='signed';
    i++;
    while(peek().t==='id' && isType(peek().v)){ if(SK_INT_TYPES.includes(peek().v)) intish=true; i++; }
    return {intish, isFloat:['float','double'].includes(first)};
  };

  /* (v1.39.5) DEFECT 2 fix — shared int-division fold. An identifier
     string is provably int-typed via intVars; a bare integer literal
     string is provably int by its own spelling; a previously-synthesized
     "__idiv(...)" string is int BY CONSTRUCTION (that is the whole point
     of wrapping). Anything else (a call, a member access, `)` left over
     from one) is NOT simple and must never be folded into — guessing
     there would silently change which sub-expression gets truncated. */
  const isSimpleOperand = s => typeof s === 'string' &&
    (/^[A-Za-z_]\w*$/.test(s) || /^[0-9][0-9a-fA-FxX.]*$/.test(s) || /^__idiv\([\s\S]*\)$/.test(s));
  const isIntishOperand = s => {
    if(/^__idiv\([\s\S]*\)$/.test(s)) return true;
    if(/^[0-9]/.test(s)) return !/[.eE]/.test(s) || /^0[xX]/.test(s);
    if(/^[A-Za-z_]\w*$/.test(s)) return intVars.has(s);
    return false;
  };
  /* Fold the multiplicative run sitting at the END of `arr` (an
     already-emitted-token array — either the main `out` or a scratch
     array for a declaration initializer) together with the division
     by `nxt`. `arr` is mutated ONLY on success; on failure it is left
     exactly as it was — the caller falls back to plain '/' and a
     floatDivLines note, never a guess. Returns true iff it wrapped. */
  const tryFoldDivision = (arr, nxt, afterNxt)=>{
    /* (v1.39.5) DEFECT 1 interaction: `nxt` may be a static local mid-rename
       — resolve it through staticRenames before checking int-ness or
       emitting it, same as every other identifier the current function
       still refers to by its source name. */
    const nxtVal = (nxt && nxt.t==='id' && staticRenames.has(nxt.v)) ? staticRenames.get(nxt.v) : (nxt && nxt.v);
    const nxtIntish = nxt && ((nxt.t==='num' && nxt.isInt) || (nxt.t==='id' && intVars.has(nxtVal)));
    if(!nxtIntish || (afterNxt && afterNxt.v==='.')) return false;
    if(!arr.length || !isSimpleOperand(arr[arr.length-1]) || !isIntishOperand(arr[arr.length-1])) return false;
    let L = 1, ok = true;
    while(true){
      const opPos = arr.length - L - 1;
      if(opPos < 0) break;                                  // start of the run — success
      if(!['*','/','%'].includes(arr[opPos])) break;         // preceded by non-multiplicative — success
      const operandPos = opPos - 1;
      if(operandPos < 0 || !isSimpleOperand(arr[operandPos]) || !isIntishOperand(arr[operandPos])){
        ok = false; break;                                   // a dangling op we can't provably absorb — abort ALL of it
      }
      L += 2;
    }
    if(!ok) return false;
    const left = arr.slice(arr.length - L).join('');
    arr.length -= L;
    arr.push('__idiv('+left+', '+nxtVal+')');
    return true;
  };

  /* (v1.39.5) DEFECT 1 fix — real `static` locals. C's `static long
     last = 0;` inside a function keeps ONE slot across every call; the
     old code just dropped the `static` and re-declared it `let` every
     pass, so the ubiquitous `if(millis()-lastMillis>N)` throttle in
     these sketches fired on every single loop() tick instead of once
     every N ms. Approach: emit a module-scope `let __st_<fn>_<name>`
     (collected in `preamble`, hoisted ahead of everything else) and
     rewrite every later reference to `name` inside the REST of this
     function to the mangled name (staticRenames, consulted wherever an
     identifier is emitted — see tryFoldDivision above and the id/p
     catch-all and initializer walk below). Only when the init is a
     provably-constant expression (digits/parens/arithmetic only, no
     identifiers or calls) — C only runs that init ONCE, on the first
     call, so a non-constant init (`static long last = someFn();`) would
     need real once-only semantics this transpiler does not have; rather
     than guess, that case is left exactly as before (per-call local)
     with a named, lined caveat. Returns true iff it fully consumed the
     declaration (through the trailing ';') and registered the rename;
     on false it has NOT moved `i`, so the caller's default `static` →
     skip-the-keyword behaviour still applies untouched. */
  const tryStaticLocal = ()=>{
    const save = i;
    const declLine = peek().line;
    i++;                                              // consume 'static'
    if(!(peek().t==='id' && isType(peek().v))){ i = save; return false; }
    const {intish: stIntish} = readTypeRun();
    if(peek().t!=='id'){ i = save; return false; }
    const rawName = peek().v; i++;
    if(peek().v==='['){ i = save; return false; }      // static arrays: honest bail, not attempted here
    let hasInit = false, initToks = [];
    if(peek().v==='='){
      hasInit = true; i++;
      const e0 = i; let d = 0;
      while(peek().t!=='eof'){ const v = peek().v;
        if(v==='('||v==='['||v==='{') d++;
        if(v===')'||v===']'||v==='}') d--;
        if(d===0 && (v===','||v===';')) break;
        i++;
      }
      initToks = toks.slice(e0, i);
    }
    if(peek().v!==';'){ i = save; return false; }       // a comma-list or anything unexpected: bail, stay honest
    const isConstExpr = !hasInit || initToks.every(t=> t.t==='num' || (t.t==='p' && ['+','-','*','/','%','(',')'].includes(t.v)));
    if(!isConstExpr){
      extraCaveats.push('line '+declLine+': `static` local "'+rawName+'" in '+curFn+'() has a non-constant initializer — '
        +'C only runs that once, on the first call; this transpile cannot prove the same is safe here, so `static` is '
        +'dropped and it stays a fresh per-call local (the old, honest-if-wrong behaviour)');
      i = save; return false;
    }
    i++;                                                // consume ';'
    const mangled = '__st_'+curFn+'_'+rawName;
    const initStr = hasInit ? initToks.map(t=>t.v).join(' ') : '0';
    preamble.push('let '+mangled+' = '+initStr+';   /* static '+rawName+' in '+curFn+'() */');
    declared.add(mangled); if(stIntish) intVars.add(mangled);
    staticRenames.set(rawName, mangled);
    return true;
  };

  while(i < N()){
    const tk = peek();

    /* ---------- enum NAME { A, B, C }; ---------- */
    if(tk.t==='id' && tk.v==='enum'){
      i++;
      let ename = null;
      if(peek().t==='id'){ ename = peek().v; i++; }
      if(peek().v !== '{'){ residue.push({line:tk.line, what:'enum without a body'}); continue; }
      i++;
      let val = 0;
      const names=[];
      while(peek().v !== '}' && peek().t!=='eof'){
        if(peek().t==='id'){ const n=peek().v; i++;
          if(peek().v==='='){ i++; val = parseInt(peek().v,10)||0; i++; }
          names.push(n+' = '+val); declared.add(n); intVars.add(n); val++;
        } else i++;
      }
      i++; if(peek().v===';') i++;
      if(ename){ declared.add(ename); SK_TYPES.push(ename); SK_INT_TYPES.push(ename); }
      out.push('const '+names.join(', ')+';   /* enum'+(ename?' '+ename:'')+' */');
      enums.push(ename||'(anonymous)');
      continue;
    }

    /* ---------- NS::Member → NS__Member (known ones only) ---------- */
    if(tk.t==='id' && peek(1).v==='::' && peek(2).t==='id'){
      const joined = tk.v+'__'+peek(2).v;
      i+=3;
      if(SK_GLOBALS.includes(joined) || SK_OBJ_TYPES[joined]) toks.splice(i, 0, {t:'id', v:joined, line:tk.line});
      else { residue.push({line:tk.line, what:tk.v+'::'+peek(-1).v+' — unknown namespaced name'}); toks.splice(i,0,{t:'id',v:joined,line:tk.line}); }
      continue;
    }

    /* ---------- declarations & function definitions ---------- */
    if((tk.t==='id' && (isType(tk.v) || SK_OBJ_TYPES[tk.v]) && peek(1).t==='id' && depth===0) ||   /* file scope */
       (tk.t==='id' && isType(tk.v) && peek(1).t==='id' && depth>0)){                              /* local, incl. for-init */

      /* library object instantiation: Type name; / Type name(args); */
      if(SK_OBJ_TYPES[tk.v] && depth===0){
        const type = tk.v, name = peek(1).v, line = tk.line;
        i += 2;
        if(peek().v==='=' && peek(1).t==='id' && peek(1).v===type){ i += 2; }   // Type name = Type(args);
        let args = '';
        if(peek().v==='('){ let d=1; i++; const a0=i; while(d>0 && peek().t!=='eof'){ if(peek().v==='(')d++; if(peek().v===')')d--; if(d>0) i++; } args = toks.slice(a0,i).map(x=>x.v).join(' '); i++; }
        if(peek().v===';') i++;
        const spec = SK_OBJ_TYPES[type];
        const bound = spec.byName && spec.byName[name];
        const mk = bound ? bound : spec.make.replace('%NAME%', JSON.stringify(name)).replace('%ARGS%', JSON.stringify(args));
        out.push('const '+name+' = '+mk+';   /* '+type+(args?'('+args+')':'')+' */');
        declared.add(name);
        instances.push({name, type, bound:!!bound});
        continue;
      }

      const startLine = tk.line;
      const isConst = out.length && /\bconst\s*$/.test(out[out.length-1]);   // never true; const handled below
      const {intish} = readTypeRun();
      const name = peek().v;

      /* function definition: type name ( params ) { ... } */
      if(peek(1).v==='(' ){
        let j=i+2, d=1;
        while(d>0 && toks[j]){ if(toks[j].v==='(')d++; if(toks[j].v===')')d--; j++; }
        /* a PROTOTYPE — type name(params); — declares and emits nothing */
        if(toks[j] && toks[j].v===';'){
          declared.add(name);
          i = j + 1;
          continue;
        }
        if(toks[j] && toks[j].v==='{'){
          /* strip param types — (v1.39.5) DEFECT 3 fix: the int-division
             rule needs each PARAMETER's own declared type, not the
             function's return type. `int half(float v){ return v/2; }`
             must not truncate v/2 just because half() returns int; a
             single-param type run resets at every comma so
             `void f(byte a, float v)` marks only `a` intish. */
          i++; i++;                                   // name, (
          const params=[];
          let paramIntish = false;
          while(peek().v!==')'){
            if(peek().t==='id' && isType(peek().v)){
              if(SK_INT_TYPES.includes(peek().v) || peek().v==='unsigned' || peek().v==='signed') paramIntish = true;
              i++; continue;
            }
            if(peek().v==='&' || peek().v==='*'){ i++; continue; }
            if(peek().v===','){ paramIntish = false; i++; continue; }
            if(peek().t==='id'){ params.push(peek().v); declared.add(peek().v); if(paramIntish) intVars.add(peek().v); }
            i++;
          }
          i++;                                        // )
          out.push('function '+name+'('+params.join(', ')+')');
          declared.add(name); fns.add(name);
          /* (v1.39.5) DEFECT 1: entering a new function body — this dialect
             never nests function DEFINITIONS, so depth===0 here always. */
          curFn = name; curFnDepth = depth; staticRenames = new Map();
          continue;
        }
      }

      /* variable declaration(s) — possibly a comma list, possibly array */
      const kw = (depth===0) ? 'let' : 'let';
      const parts=[];
      while(true){
        const vn = peek().v; const vnLine = peek().line; i++;
        declared.add(vn); if(intish) intVars.add(vn);
        let piece = vn;
        /* (v1.39.5) DEFECT 4 fix: `int buf[4];` used to drop the size and
           declare buf a scalar `= 0` — the sketch's first `buf[0]=1` then
           threw at runtime. A literal size becomes a real zeroed array; a
           macro/expr size (not provably a number here) falls back to a
           fixed capacity WITH a caveat — never a silent scalar. */
        let arrayLit = null;                 // set when `[N]` had a bare int literal
        let sawBrackets = false;
        if(peek().v==='['){
          sawBrackets = true;
          let d=1; i++;
          const sizeToks=[];
          while(d>0 && peek().t!=='eof'){ if(peek().v==='[')d++; if(peek().v===']'){ d--; if(d===0){ i++; break; } } sizeToks.push(peek()); i++; }
          if(sizeToks.length===1 && sizeToks[0].t==='num' && sizeToks[0].isInt) arrayLit = sizeToks[0].v;
          piece = vn;
        }
        if(peek().v==='='){
          i++;
          const e0=i; let d=0;
          while(peek().t!=='eof'){ const v=peek().v;
            if(v==='('||v==='['||v==='{')d++;
            if(v===')'||v===']'||v==='}')d--;
            if(d===0 && (v===','||v===';')) break;
            i++;
          }
          const endIdx = i;
          /* (v1.39.5) DEFECT 3 fix (part 2): a declaration's own initializer
             used to be a blind slice+join that never saw the int-division
             rule at all — `int x = a/3;` stayed float division even with a
             provably-int a. Walk it token by token so the same fold used
             in the main pass (~line 470s, tryFoldDivision) applies here. */
          const pieceOut = [];
          for(let k=e0; k<endIdx; k++){
            const kt = toks[k];
            if(kt.v==='/'){
              const nxt = toks[k+1], afterNxt = toks[k+2];
              if(k+1<endIdx && tryFoldDivision(pieceOut, nxt, afterNxt)){ k++; continue; }
              floatDivLines.add(kt.line);
            }
            /* (v1.39.5) DEFECT 1: a renamed static local can appear inside
               another declaration's initializer too (`int x = last + 1;`)
               — same rename, same "not a property name" guard as the
               main catch-all below. */
            const kIsProp = kt.t==='id' && toks[k-1] && toks[k-1].v==='.';
            pieceOut.push(kt.v==='{' ? '[' : kt.v==='}' ? ']'
              : (kt.t==='id' && !kIsProp && staticRenames.has(kt.v)) ? staticRenames.get(kt.v) : kt.v);
          }
          let init = pieceOut.join(' ');
          piece += ' = '+init;
          /* a top-level single-number const-ish init joins the Config tab */
          if(depth===0 && /^-?\d+(\.\d+)?$/.test(init.trim())){
            cfgConsts.push({name:vn, val:parseFloat(init)});
            piece = vn+' = __cfg('+JSON.stringify(vn)+', '+init.trim()+')';
          }
        } else if(sawBrackets){
          if(arrayLit !== null){
            piece += ' = new Array('+arrayLit+').fill(0)';
          } else {
            piece += ' = new Array(64).fill(0)';
            extraCaveats.push('line '+vnLine+': array "'+vn+'" declared with a non-literal size — filled to a fallback capacity of 64, not the sketch\'s real size');
          }
        } else {
          piece += ' = 0';   // globals: C zero-inits; locals: C is UB — zero is the deterministic choice
        }
        parts.push(piece);
        if(peek().v===','){ i++; continue; }
        break;
      }
      if(peek().v===';') i++;
      out.push(kw+' '+parts.join(', ')+';');
      continue;
    }

    /* ---------- `const type name = …` at any depth ---------- */
    if(tk.t==='id' && (tk.v==='const' || tk.v==='static' || tk.v==='volatile')){
      /* (v1.39.5) DEFECT 1: a `static` local INSIDE a function body gets a
         real persistent slot (tryStaticLocal) instead of the silent
         per-call `let` this used to fall through to. const/volatile keep
         the old (semantically fine) skip-the-keyword behaviour. */
      if(tk.v==='static' && depth>0 && curFn && tryStaticLocal()) continue;
      i++; continue;
    }

    /* ---------- casts: (int)(expr) / (int)x / (float)x ---------- */
    if(tk.v==='(' && peek(1).t==='id' && isType(peek(1).v) && peek(2).v===')'){
      const t = peek(1).v; i+=3;
      const trunc = SK_INT_TYPES.includes(t);
      if(peek().v === '('){
        if(trunc) out.push('Math.trunc');           // (int)(x/y) → Math.trunc(x/y)
      }else{
        const nxt = peek();
        if(nxt.t==='id' || nxt.t==='num'){          // (int)x → Math.trunc(x)
          /* (v1.39.5) DEFECT 1: (int)last must cast the mangled slot too */
          const nxtVal = (nxt.t==='id' && staticRenames.has(nxt.v)) ? staticRenames.get(nxt.v) : nxt.v;
          out.push(trunc ? 'Math.trunc('+nxtVal+')' : '('+nxtVal+')');
          i++;
        }
      }
      continue;
    }

    /* ---------- sizeof idiom ---------- */
    if(tk.t==='id' && tk.v==='sizeof'){
      /* the one honest pattern: sizeof(A)/sizeof(A[0]|int|byte|long) → A.length */
      const m = toks.slice(i, i+12).map(x=>x.v).join(' ');
      const r = /^sizeof \( (\w+) \) \/ sizeof \( (?:\1 \[ 0 \]|int|byte|long) \)/.exec(m);
      if(r){
        out.push('('+r[1]+'.length)');
        i += r[0].split(' ').length;
        continue;
      }
      residue.push({line:tk.line, what:'sizeof outside the array-length idiom'});
      i++; continue;
    }

    /* ---------- residue syntax ---------- */
    if(tk.v==='->'){ residue.push({line:tk.line, what:'pointer dereference ->'}); i++; continue; }
    if(tk.v==='&' && peek(1).t==='id' && (peek(-1).v==='(' || peek(-1).v===',')){
      /* address-of in a call: XBOXRECV Xbox(&Usb) style, harmless — drop the & */
      i++; continue;
    }

    /* ---------- track depth; pass everything else through ---------- */
    if(tk.v==='{') depth++;
    if(tk.v==='}'){
      depth--;
      /* (v1.39.5) DEFECT 1: the current function's own closing brace —
         depth is back down to where it was when the function opened, so
         its static-local renames stop applying from here on. */
      if(curFn && depth===curFnDepth){ curFn = null; staticRenames = new Map(); }
    }
    if(tk.v==='(') parenDepth++;
    if(tk.v===')') parenDepth=Math.max(0,parenDepth-1);
    if(tk.v==='/' ){
      /* (v1.39.5) DEFECT 2 fix: the integer-division rule wrap ONLY when
         provably int ÷ int — and, for a multiplicative CHAIN, provably
         int all the way back. The old code used toks[i-1] (the single
         previous token) as the left operand: `a * b / c` became
         `a * __idiv(b, c)` (wrong associativity) and `a / b / c` became
         `__idiv(b, c)` with `a` silently DELETED. tryFoldDivision instead
         folds from the OUTPUT, absorbing the whole run of simple,
         provably-int * / % operands — or, if any hop in that run is not
         provably simple (a call result, a member access…), abandons the
         wrap entirely rather than guess which half to truncate. */
      if(tryFoldDivision(out, peek(1), peek(2))){ i+=2; continue; }
      floatDivLines.add(tk.line);
    }
    if(tk.t==='str' || tk.t==='chr'){
      /* C concatenates adjacent string literals; JS needs the + spelled out */
      if(tk.t==='str' && out.length && /"$/.test(out[out.length-1])) out.push('+');
      out.push(tk.v); i++; continue;
    }
    if(tk.t==='num'){ out.push(tk.v); i++; continue; }
    if(tk.t==='id' || tk.t==='p'){
      /* (v1.39.5) DEFECT 1: every bare reference to a renamed static local,
         for the rest of ITS function, resolves to the mangled slot — but
         never a property name (`obj.last`) sitting right after a '.',
         which just happens to share the spelling. */
      const isProp = tk.t==='id' && toks[i-1] && toks[i-1].v==='.';
      out.push((tk.t==='id' && !isProp && staticRenames.has(tk.v)) ? staticRenames.get(tk.v) : tk.v);
      i++; continue;
    }
    residue.push({line:tk.line, what:'unexpected character "'+tk.v+'"'});
    i++;
  }

  /* stitch with statement-ish spacing. (v1.39.5) DEFECT 1: `preamble` —
     the mangled static-local slots — is hoisted ahead of everything else,
     same tier as the #define lines, so it runs once at module load. */
  let js = preamble.join('\n') + '\n' + defLines.join('\n') + '\n' + out.join(' ')
    .replace(/ ;/g, ';').replace(/ ,/g, ',').replace(/\( /g, '(').replace(/ \)/g, ')')
    .replace(/ \[/g, '[').replace(/ \]/g, ']').replace(/ \./g, '.').replace(/\. /g, '.')
    .replace(/; /g, ';\n').replace(/\{ /g, '{\n').replace(/ \}/g, '\n}');

  /* ---- identifier accounting: everything used must resolve ----
     Strings and my OWN emitted comments are not code — a word inside
     "button pressed" or a `/* Sabertooth *​/` breadcrumb must not count.
     Property accesses (.foo) don't count either: the adapter owns those. */
  const bare = js.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
                 .replace(/\/\*[\s\S]*?\*\//g, ' ')
                 .replace(/\.\s*[A-Za-z_]\w*/g, '.');
  const used = new Set();
  bare.replace(/(?<![\w])([A-Za-z_]\w*)/g, (m, id)=>{ used.add(id); return m; });
  const jsKw = ['function','let','const','var','if','else','while','for','do','switch','case','default','break','continue','return','true','false','new','typeof','of','in','Math','trunc','length','null','undefined',
    'Array' /* (v1.39.5) DEFECT 4: `new Array(N).fill(0)` for an uninitialised C array */];
  const unknown = [];
  used.forEach(id=>{
    if(declared.has(id) || SK_GLOBALS.includes(id) || jsKw.includes(id) || SK_KEYWORDS.includes(id)) return;
    unknown.push(id);
  });
  unknown.forEach(id=>{
    const ln = (pre.text.split('\n').findIndex(l=>new RegExp('\\b'+id+'\\b').test(l)) + 1) || 0;
    residue.push({line:ln, what:'unknown name "'+id+'" — not declared by the sketch, not a known library'});
  });

  if(!fns.has('loop')) residue.push({line:0, what:'no loop() — this is not a full sketch (a fragment or a patch file?)'});
  if(residue.length) throw SkError(residue);

  const caveats = [];
  if(floatDivLines.size) caveats.push('division left as float on line(s) '+[...floatDivLines].slice(0,8).join(', ')+' — operand types were not provably int');
  caveats.push('byte/char wraparound is not emulated');
  if(js.includes('__delay')) caveats.push('delay() arms the blocking model (SIM.blockUntil); statements after it in the same pass still run that pass');
  caveats.push(...extraCaveats);   // (v1.39.5) DEFECTS 1 & 4: static-init and array-size fall-backs, named and lined

  /* (v1.39.5) DEFECT 5 fix: hasServos/footPWM from what the sketch
     ACTUALLY drives, not "a matching library type exists anywhere".
     hasServos: a declared Adafruit_PWMServoDriver instance that the
     sketch really calls .setPWM() on — a bare #include (maestro25.ino
     keeps one, unused, from a copy-paste) must not count, or an imported
     Maestro sketch's animations go dead (animate.js syncActuators()'s
     hasServos branch would overwrite ACT[] from PCA state that nothing
     ever drives). footPWM: a declared Servo instance .attach()ed to the
     family's real foot-ESC pins (44/45 — see maestro-sketches.js
     leftFootPin/rightFootPin and maestro-shared.js) — not "a Servo
     object exists" (a Sabertooth-feet sketch with one incidental gripper
     Servo must not get misread as PWM-hub feet). Pin arguments are
     usually a #define name (leftFootPin), not a bare literal, so they
     are resolved against the sketch's own #defines/top-level consts —
     never guessed when they can't be resolved. */
  const resolveNumeric = (name)=>{
    if(/^-?\d+$/.test(name)) return parseInt(name, 10);
    if(pre.defines[name] !== undefined && /^-?\d+$/.test(pre.defines[name].trim())) return parseInt(pre.defines[name], 10);
    const c = cfgConsts.find(x=>x.name===name);
    return c ? c.val : null;
  };
  const pcaNames = instances.filter(x=>x.type==='Adafruit_PWMServoDriver').map(x=>x.name);
  const hasServos = pcaNames.some(n=> new RegExp('\\b'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\.setPWM\\s*\\(').test(js));
  const servoNames = new Set(instances.filter(x=>x.type==='Servo').map(x=>x.name));
  let footPWM = false;
  const attachRe = /\b(\w+)\.attach\s*\(\s*([A-Za-z_]\w*|\d+)/g;
  let am;
  while((am = attachRe.exec(js))){
    if(!servoNames.has(am[1])) continue;
    const pinVal = resolveNumeric(am[2]);
    if(pinVal === 44 || pinVal === 45){ footPWM = true; break; }
  }

  /* (v1.77.0, review H6) instance name → library type, so a run-time throw
     can be explained in the sketch's own words — "calls mp3.playFolder,
     which the simulator's MD_YX5300 adapter does not have" — rather than
     as the bare TypeError the JS engine hands back. See sketchExplain(). */
  const instanceTypes = {};
  instances.forEach(x=>{ instanceTypes[x.name] = x.type; });
  const report = {
    fileName, includes: pre.includes, enums, instanceTypes,
    instances: instances.map(x=>x.name+(x.bound?' → sim shim':' → logging stub')),
    cfgConsts: cfgConsts.map(c=>c.name),
    functions: [...fns], caveats, hasServos, footPWM
  };
  return {js, report, cfgConsts, declaredNames:[...declared]};
}

/* ============================================== the runtime the JS sees */
function __idiv(a, b){ return Math.trunc(a / b); }
function __cfg(k, d){ return (typeof CFG !== 'undefined' && CFG[k] !== undefined) ? CFG[k] : d; }
function __delay(ms){ SIM.blockUntil = Math.max(SIM.blockUntil || 0, SIM.millis + ms); }
/* (v1.78.0, review M10) the sketch's map() IS Arduino's, in C:

       long map(long x, long a, long b, long c, long d){ return (x - a) * (d - c) / (b - a) + c; }

   Two things that shape says, both of which this used to get wrong. Every
   parameter is a LONG, so a float argument is truncated toward zero before
   the arithmetic starts (maestro25.ino hands it `float LeftSpeed`, and the
   hand port learned the same lesson in M12). And the DIVISION truncates,
   then `+ c` happens to the truncated quotient — this truncated the SUM,
   `Math.trunc(q + outMin)`, which is the same answer only once q + outMin
   has reached zero: the exact off-by-one core/util.js map_ was cured of in
   v1.69.0 §7.1, carried here in a second copy. A transpiled mod2026 read
   32,760 of the hat's 65,536 positions one unit hot on the reverse half
   (-32767 → -89 where the Arduino says -90). One implementation now: the
   long conversions, then map_ itself. */
function __amap(x, inMin, inMax, outMin, outMax){
  return map_(Math.trunc(x), Math.trunc(inMin), Math.trunc(inMax), Math.trunc(outMin), Math.trunc(outMax));
}
function __mkUsb(){ return { Init:()=>0, Task:()=>{} }; }
function __mkXbox(){
  const o = {
    getButtonClick:(b)=>getButtonClick(b),
    getButtonPress:(b)=>getButtonPress(b),
    getAnalogHat:(a)=>getAnalogHat(a),
    setLedOn:(l)=>setLedOn(parseInt(String(l).replace('LED',''),10)||1),
    setLedMode:(m)=>setLedMode(m),
    setRumbleOn:()=>{}, disconnect:()=>lg('sys','Xbox.disconnect()')
  };
  Object.defineProperty(o, 'XboxReceiverConnected', {get:()=>XB.receiverConnected});
  Object.defineProperty(o, 'Xbox360Connected', {get:()=>[XB.controllerConnected, false, false, false]});
  return o;
}
function __mkSaber(name){
  /* Sabertooth2x and Syren10 are the sim's real motor shims — delegate.
     Any OTHER Sabertooth instance is hardware the sim has no model for:
     log it so the builder can SEE it firing, but drive nothing. */
  const real = (name === 'Sabertooth2x') ? Sabertooth2x : (name === 'Syren10') ? Syren10 : null;
  if(real) return { motor:(a,b)=>{ if(real.motor) real.motor(a,b); }, drive:(v)=>{ if(real.drive) real.drive(v); }, turn:(v)=>{ if(real.turn) real.turn(v); },
                    autobaud:()=>{}, setTimeout:(ms)=>{ if(real.setTimeout) real.setTimeout(ms); },
                    stop:()=>{ if(real.drive) real.drive(0); if(real.turn) real.turn(0); }, setBaudRate:()=>{} };
  return { motor:(a,b)=>lg('fw', name+'.motor('+a+(b!==undefined?','+b:'')+')  [no sim model]'),
           drive:()=>{}, turn:()=>{}, autobaud:()=>{}, setTimeout:()=>{}, stop:()=>{}, setBaudRate:()=>{} };
}
function __mkMp3Trigger(){ return { setup:()=>{}, setVolume:(v)=>mp3.volume(v), play:(n)=>mp3.playTrack(n), trigger:(n)=>mp3.playTrack(n), update:()=>{} }; }
function __mkYx5300(){ return { begin:()=>{}, check:()=>{}, volume:(v)=>mp3.volume(v), playTrack:(n)=>mp3.playTrack(n), playSpecific:(f,n)=>mp3.playTrack(n), playFolderTrack:(f,n)=>mp3.playTrack(n) }; }
function __mkDyPlayer(){ return { begin:()=>{}, setVolume:(v)=>player.setVolume(v), playSpecified:(n)=>player.playSpecified(n), setCycleMode:()=>{}, stop:()=>{} }; }
function __mkServo(name){
  const real = (name === 'leftFootSignal') ? leftFootSignal : (name === 'rightFootSignal') ? rightFootSignal : null;
  let at = 90;
  return { attach:()=>{}, detach:()=>{},
           write:(v)=>{ at=v; if(real) real.write(v); else lg('pwmf', name+'.write('+v+')  [no sim model]'); },
           writeMicroseconds:(us)=>{ at=Math.round((us-1000)/1000*180); if(real) real.write(at); },
           read:()=>at, attached:()=>true };
}
function __mkPwm(name, args){
  const real = (name === 'pwm2' || /0x41|\b65\b/.test(args||'')) ? pwm2 : pwm1;
  return { begin:()=>{}, setPWMFreq:()=>{}, setOscillatorFrequency:()=>{}, sleep:()=>{}, wakeup:()=>{},
           setPWM:(c,a,b)=>real.setPWM(c,a,b) };
}
function __mkMaestro(){
  return {
    restartScript:(n)=>{ if(typeof MSTR!=='undefined' && MSTR.loaded) maestroRestart(n); else lg('mae','maestro.restartScript('+n+')  [no board loaded]'); },
    setTarget:(ch, t)=>{
      const c = (typeof MSTR!=='undefined' && MSTR.loaded) ? MSTR.channels[ch] : null;
      if(c && c.act) ACT_T[c.act] = chanNorm(c, t);
      lg('mae', 'maestro.setTarget('+ch+', '+t+')');
    },
    setSpeed:(ch,v)=>lg('mae','maestro.setSpeed('+ch+', '+v+')'),
    setAcceleration:(ch,v)=>lg('mae','maestro.setAcceleration('+ch+', '+v+')'),
    stopScript:()=>lg('mae','maestro.stopScript()'),
    goHome:()=>lg('mae','maestro.goHome()'), getErrors:()=>0
  };
}
function __mkSerial(tag){
  return { begin:()=>{}, end:()=>{}, print:(x)=>lg('fw', String(x)), println:(x)=>lg('fw', String(x===undefined?'':x)),
           write:(v)=>lg('fw', tag+'.write('+v+')'), read:()=>-1, available:()=>0, peek:()=>-1, flush:()=>{}, setTimeout:()=>{} };
}
const __SK_PRELUDE_CONSTS = (function(){
  const btn = {}; ['UP','DOWN','LEFT','RIGHT','A','B','X','Y','START','BACK','XBOX','SYNC','L1','R1','L2','R2','L3','R3',
                   'LeftHatX','LeftHatY','RightHatX','RightHatY'].forEach(k=>btn[k]=k);
  ['LED1','LED2','LED3','LED4','ROTATING','FASTBLINK','SLOWBLINK','ALTERNATING'].forEach(k=>btn[k]=k);
  Object.assign(btn, {HIGH:1, LOW:0, OUTPUT:'OUTPUT', INPUT:'INPUT', INPUT_PULLUP:'INPUT_PULLUP', LED_BUILTIN:13, NULL:null,
                      MD_YX5300__SERIAL_BPS:9600});
  return btn;
})();

/* build the callable profile pieces from transpiled JS */
function skInstantiate(t){
  const js = (typeof t === 'string') ? t : t.js;
  /* the sketch may declare its OWN MP3Stream / Serial-alias / etc. — C
     shadowing says the sketch's declaration wins, so the colliding
     prelude injection must simply not be passed in */
  const shadow = new Set((typeof t === 'object' && t.declaredNames) || []);
  const names = Object.keys(__SK_PRELUDE_CONSTS).filter(k=>!shadow.has(k));
  const vals  = names.map(k=>__SK_PRELUDE_CONSTS[k]);
  const free = {
    millis:()=>SIM.millis, micros:()=>SIM.millis*1000, delay:__delay, delayMicroseconds:()=>{},
    random:(a,b)=>b===undefined ? rnd(0,a) : rnd(a,b), randomSeed:()=>{},
    map:__amap, constrain:(x,a,b)=>Math.max(a,Math.min(b,x)),
    abs:Math.abs, min:Math.min, max:Math.max, pow:Math.pow, sqrt:Math.sqrt, sq:(x)=>x*x,
    F:(x)=>x, HEX:16, DEC:10, BIN:2, OCT:8,
    pinMode:()=>{}, digitalWrite:(p,v)=>lg('fw','digitalWrite('+p+','+v+')'), digitalRead:()=>0,
    analogWrite:(p,v)=>lg('fw','analogWrite('+p+','+v+')'), analogRead:()=>512, tone:()=>{}, noTone:()=>{},
    word:(h,l)=>((h<<8)|l), lowByte:(v)=>v&0xFF, highByte:(v)=>(v>>8)&0xFF,
    Serial:__mkSerial('Serial'), Serial1:__mkSerial('Serial1'), Serial2:__mkSerial('Serial2'), Serial3:__mkSerial('Serial3'),
    MP3Stream:__mkSerial('MP3Stream'),
    Wire:(function(){ let dev=0, cmd=0; return { begin:()=>{}, beginTransmission:(d)=>{dev=d;}, write:(c)=>{cmd=c;},
      endTransmission:()=>{ if(typeof triggerI2C==='function') triggerI2C(dev, cmd); return 0; }, setClock:()=>{}, requestFrom:()=>0, available:()=>0, read:()=>0 }; })(),
    __idiv, __cfg, __delay, __amap, __mkUsb, __mkXbox, __mkSaber, __mkMp3Trigger, __mkYx5300, __mkDyPlayer,
    __mkServo, __mkPwm, __mkMaestro, __mkSerial
  };
  const fnames = Object.keys(free).filter(k=>!shadow.has(k));
  const body = '"use strict";\n' + js + '\nreturn {setup: (typeof setup==="function" ? setup : function(){}), loop: loop};';
  const fac = new Function(...names, ...fnames, body);
  return fac(...vals, ...fnames.map(k=>free[k]));
}

/* ============================================ a sketch that THROWS (v1.77.0)
   Review 2026-09-01, H6. The identifier accounting above deliberately
   ignores method names ("the adapter owns those"), so a sketch calling a
   library method the adapter lacks — `mp3.playFolder(1, 2)` on the
   MD_YX5300 shim, say — transpiles residue-free and only fails at RUN
   time, as a TypeError from inside setup() or loop(). Until v1.77.0 that
   sketch had already been stored and made the build's firmware by the
   time it first ran, so the throw landed inside main.js's boot handler on
   every reload afterwards: the loop never started, the header buttons
   were never bound, and the only way out was clearing localStorage.

   Three fences now, in the order a bad sketch meets them:
     · sketchTrial()   — the drop door runs setup() and a few loop() passes
                         BEFORE anything is stored or chosen; a throw there
                         refuses the file and nothing changes;
     · the profile's own setup()/loop() wrappers (sketchRegister) catch a
                         throw from a REGISTERED sketch and hand it to
                         fwFallback() (core/firmware.js), which unloads it,
                         points the build back at the setup's own choice and
                         says which method did it;
     · main.js wraps the boot loadProfile() the same way, for any profile.
   The wrappers are on the sketch profile, not on fwLoop(): the three hand
   ports must keep throwing loudly — every suite counts page errors, and a
   blanket catch in the dispatcher would turn a port regression into a
   toast. Only the transpile of somebody else's file gets a safety net. */
function sketchExplain(e, ref){
  const report = (typeof ref === 'string') ? (SKETCH.byId[ref] && SKETCH.byId[ref].report) : ref;
  const msg = String((e && e.message) || e).split('\n')[0];
  /* Chromium: "mp3.playFolder is not a function" — the one shape a missing
     adapter method takes. Anything else is quoted as the engine said it. */
  const m = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+) is not a function/.exec(msg);
  if(m){
    const obj = m[1].split('.')[0];
    const type = (report && report.instanceTypes) ? report.instanceTypes[obj] : null;
    return 'calls '+m[1]+', which the simulator\'s '+(type || obj)+' adapter does not have';
  }
  return 'threw: '+msg;
}
const SK_TRIAL_LOOPS = 3;
function sketchTrial(t, fileName){
  const inst = skInstantiate(t);
  /* a delay() in setup() arms the blocking model; the trial is not a run
     and must not leave the CURRENT firmware blocked behind it */
  const keepBlock = SIM.blockUntil;
  let phase = 'setup()';
  try{
    inst.setup();
    for(let k = 1; k <= SK_TRIAL_LOOPS; k++){ phase = 'loop() pass '+k; inst.loop(); }
  }catch(e){
    const err = new Error(fileName+' threw in '+phase+' — it '+sketchExplain(e, t.report));
    err.trial = true; err.phase = phase; err.cause = e;
    throw err;
  }finally{
    SIM.blockUntil = keepBlock;
  }
}

/* =========================================== registration + persistence */
/* opts.trial — run the sketch once before it is stored (the drop door does;
   sketchRestore() and the tests do not: at boot the sim is half-built and a
   restored sketch that throws is caught by the wrappers below instead). */
function sketchRegister(src, fileName, opts){
  const t = skTranspile(src, fileName);
  let inst = skInstantiate(t);                       // throws on bad JS — before anything is stored
  if(opts && opts.trial) sketchTrial(t, fileName);   // (v1.77.0, H6) throws on bad RUN — same rule
  const defaults = { loopHz:250, servoSpeed:900, maxSpeed:2.4, maxYaw:2.4, domeRate:3.6 };
  t.cfgConsts.forEach(c=>{ defaults[c.name] = c.val; });
  const usesMaestro = t.report.includes.some(x=>/Maestro/i.test(x)) || /__mkMaestro/.test(t.js);
  /* the Config tab's script-slot picker reads CFG.maestroScript[0..7] on
     every hasMaestro profile — borrow the hand port's slot table so the
     sketch's restartScript(n) drives the same on-screen animations */
  if(usesMaestro) defaults.maestroScript =
    (PROFILES.maestro25 && PROFILES.maestro25.defaults.maestroScript)
      ? JSON.parse(JSON.stringify(PROFILES.maestro25.defaults.maestroScript)) : [];
  const id = sketchId(fileName);
  const prof = {
    id, name:'Imported: '+fileName, short:fileName.replace(/\.ino$/i,'').slice(0,14),
    file:fileName, repo:'(imported .ino)',
    audio: t.report.includes.some(x=>/MD_YX5300/i.test(x)) ? 'MD-YX5300'
         : t.report.includes.some(x=>/DYPlayer/i.test(x))  ? 'DY-SV5W' : 'MP3 Trigger',
    /* (v1.39.5) DEFECT 5 fix: both used to be assumed true for every
       import (footPWM keyed off "does __mkServo appear ANYWHERE", which
       is true for any Servo at all, foot or not; hasServos was a flat
       `true`). Now they come from t.report — computed in skTranspile
       from what the sketch actually drives (see the DEFECT 5 comment
       there). A Maestro sketch's animations depend on hasServos being
       false unless it genuinely also drives the PCA9685s (animate.js
       syncActuators()); footPWM depends on the feet really being
       .attach()ed to 44/45, not just "a Servo exists somewhere". */
    swapsStickButtons:false, footPWM:()=>t.report.footPWM, hasServos:t.report.hasServos, hasMaestro:usesMaestro,
    blurb:'transpiled from '+fileName+' — deterministic, faithful, including its bugs',
    defaults,
    /* the Config tab renders fixed groups (panels.js buildConfig) — every
       numeric constant the sketch declares goes in the first grid, under
       its own name, exactly as the sketch spelled it */
    cfg:{ speed: t.cfgConsts.map(c=>[c.name, c.name]), body:[], pie:[],
          sim:[['loopHz','Loop rate Hz'],['servoSpeed','Servo speed u/s'],['maxSpeed','Max drive m/s'],['maxYaw','Max yaw rad/s'],['domeRate','Dome rad/s']] },
    notes:[{k:'info', h:'<b>Transpiled sketch.</b> '+t.report.instances.join(' · ')
      + (t.report.caveats.length ? '<br>Caveats: '+t.report.caveats.join('; ') : '')}],
    /* loadProfile → setup(): rebuild the closure FIRST, so every load is a
       re-flash — the sketch's mutable globals start over. A Config edit
       lands in __cfg() fresh because the edit itself IS a load: the grid
       calls sketchReflash() below (v1.78.0, review M11 — until then this
       comment cited an "apply" that did not exist, and an edited constant
       reached the exported .ino but never the running sketch). */
    /* (v1.77.0, review H6) …and a throw from either is caught HERE, on the
       sketch profile alone, and handed to fwFallback(): the sketch is
       unloaded, the setup's own recommendation runs instead, and the toast
       names the method. Left uncaught, a throw in loop() came back on
       every frame (frame()'s fixed-step while never decremented `acc`) and
       a throw in setup() at boot took the rest of the load handler with it. */
    setup(){
      /* (v1.78.0, M11) a re-flash from the Config grid: loadProfile() has
         just put CFG back to the sketch's own numbers — restore the
         builder's edits BEFORE the closure is rebuilt, so __cfg() reads them */
      if(prof.reflashCfg){ Object.assign(CFG, prof.reflashCfg); prof.reflashCfg = null; if(CFG.vol !== undefined) SND.vol = CFG.vol; }
      try{ inst = skInstantiate(t); inst.setup(); }catch(e){ fwFallback(id, e, 'setup()'); }
    },
    loop(){ try{ inst.loop(); }catch(e){ fwFallback(id, e, 'loop()'); } }
  };
  PROFILES[id] = prof;
  if(PROFILE_ORDER.indexOf(id) < 0) PROFILE_ORDER.push(id);
  /* …and into the SETUP's Firmware question, so an imported sketch is a
     build answer like any other rather than a hidden mode. 'sub' is the
     honest badge: it runs for real, but it is a transpile of somebody's
     file, not one of the three ports that have been walked line by line. */
  if(typeof BUILD_OPTIONS !== 'undefined' && BUILD_OPTIONS.firmware &&
     !BUILD_OPTIONS.firmware.some(o=>o.id === id)){
    BUILD_OPTIONS.firmware.push({
      id, label:'Imported: '+fileName, sim:'sub', file:fileName,
      note:'Transpiled from your own .ino — '+(usesMaestro ? 'Maestro subroutines' : 'PCA9685 servos direct')
         + ', '+prof.audio+' sound'
         + (t.report.caveats.length ? '. Caveats: '+t.report.caveats.join('; ') : '.')
    });
  }
  SKETCH.byId[id] = {src, fileName, report:t.report};   // report: sketchExplain() reads instanceTypes from it
  if(SKETCH.list.indexOf(id) < 0) SKETCH.list.push(id);
  SKETCH.src = src; SKETCH.fileName = fileName; SKETCH.report = t.report;
  sketchStore();
  lg('sys','sketch transpiled: '+fileName+' — '+t.report.functions.length+' function(s), '
     +t.report.cfgConsts.length+' constant(s) on the Config tab, libraries: '+t.report.includes.join(', '));
  t.report.caveats.forEach(c=>lg('sys','  caveat: '+c));
  return prof;
}
/* ============================================ a Config edit IS a re-flash
   (v1.78.0, review M11.) A hand port reads CFG.X on every pass, so a number
   typed into the Speed & feel grid changes the droid on the next loop. A
   transpiled sketch cannot: its constants are emitted as
   `let X = __cfg("X", d)` and read ONCE, when skInstantiate() builds the
   closure — exactly as a #define is baked in at compile time. Until v1.78.0
   the grid wrote CFG[k], logged it, and the running sketch carried on with
   the old number while "Copy .ino constants" printed the new one: the
   exported file and the simulated droid disagreed.

   So an edit on a sketch profile re-flashes it. loadProfile() is the
   re-flash the app already has — actuators, FW, motors, log and setup()
   all start over, the sketch's mutable globals with them, as they would on
   a board you had just flashed — but it also puts CFG back to the profile's
   defaults before setup() runs, which would hand the builder's own edit
   straight back to them. The edited CFG is therefore carried over the
   reset on the profile itself and put back in its setup() before the
   closure is rebuilt. Called from panels.js cfgNumGrid; false for a hand
   port, which needs nothing of the sort. */
function sketchReflash(){
  const id = SIM.profile;
  if(!isSketchProfile(id) || !PROFILES[id] || typeof loadProfile !== 'function') return false;
  PROFILES[id].reflashCfg = JSON.parse(JSON.stringify(CFG));
  loadProfile(id);
  return true;
}
function sketchStore(){
  try{
    localStorage.setItem(SK_STORE, JSON.stringify(
      SKETCH.list.map(id=>({id, fileName:SKETCH.byId[id].fileName, src:SKETCH.byId[id].src}))));
  }catch(e){ lg('warn','could not remember that sketch (storage full?) — it runs, but not after a reload'); }
}
/* Boot: bring every remembered sketch back as its own firmware. One that no
   longer transpiles (the transpiler got stricter, say) is reported and
   skipped — never silently dropped, and never allowed to break the boot. */
function sketchRestore(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(SK_STORE) || 'null'); }catch(e){}
  if(!saved){
    try{
      const one = JSON.parse(localStorage.getItem(SK_STORE_V1) || 'null');   // v1 migration
      if(one && one.src){ saved = [one]; localStorage.removeItem(SK_STORE_V1); }
    }catch(e){}
  }
  if(!Array.isArray(saved)) return;
  saved.forEach(sk=>{
    if(!sk || !sk.src) return;
    try{ sketchRegister(sk.src, sk.fileName || 'sketch.ino'); }
    catch(e){ lg('warn','stored sketch "'+(sk.fileName||'?')+'" no longer transpiles: '+e.message.split('\n')[0]); }
  });
}
/* Forget one sketch (or, with no id, every one of them). */
function sketchForget(id){
  const ids = id ? [id] : SKETCH.list.slice();
  ids.forEach(x=>{
    delete PROFILES[x];
    const k = PROFILE_ORDER.indexOf(x); if(k >= 0) PROFILE_ORDER.splice(k, 1);
    if(typeof BUILD_OPTIONS !== 'undefined' && BUILD_OPTIONS.firmware){
      const j = BUILD_OPTIONS.firmware.findIndex(o=>o.id === x);
      if(j >= 0) BUILD_OPTIONS.firmware.splice(j, 1);
    }
    delete SKETCH.byId[x];
    const l = SKETCH.list.indexOf(x); if(l >= 0) SKETCH.list.splice(l, 1);
    /* if the build was pointing at it, fall back to a real port rather than
       booting into a firmware that no longer exists */
    if(typeof PREFS !== 'undefined' && PREFS.build && PREFS.build.firmware === x){
      PREFS.build.firmware = firmwareRecommend(PREFS.build).id;
      if(typeof prefsSave === 'function') prefsSave();
    }
    if(SIM.profile === x && typeof loadProfile === 'function') loadProfile(PREFS.build ? PREFS.build.firmware : 'mod2026');
  });
  if(!SKETCH.list.length){ SKETCH.src = null; SKETCH.fileName = null; SKETCH.report = null; }
  sketchStore();
}

/* the drop door: a .ino landing anywhere */
function readInoFile(file){
  const fr = new FileReader();
  fr.onload = ()=>{
    try{
      /* (v1.77.0, review H6) trial:true — setup() and three loop() passes
         run BEFORE the source is stored and before the build is pointed at
         it. A sketch that throws is refused here, by name and method, and
         never becomes the thing the app boots into. */
      const prof = sketchRegister(String(fr.result), file.name, {trial:true});
      /* it is a firmware now: make it the BUILD's answer, not a temporary
         mode, so it survives a reload the same way any other choice does */
      if(typeof buildSet === 'function') buildSet('firmware', prof.id);
      if(SIM.profile !== prof.id) loadProfile(prof.id);
      if(typeof buildFwSelector === 'function') buildFwSelector();
      if(typeof rebuildProfileUI === 'function') rebuildProfileUI();
      /* the wrappers may already have unloaded it (a throw the trial did
         not reach) and toasted why — do not then announce it as running */
      if(SIM.profile === prof.id)
        toast('Transpiled '+file.name+' — added as a firmware and now running. Its constants are on the Config tab.');
    }catch(e){
      if(e.trial){
        /* the trial pass ran real shims against the running droid — a
           setup() volume, a motor command, a servo write, a restartScript —
           so the firmware that WAS running is re-flashed to put every one of
           those back, and the report is written after it so the log reset
           in loadProfile() cannot eat it. Nothing was stored, the build's
           answer is untouched. */
        if(SIM.profile && PROFILES[SIM.profile]) loadProfile(SIM.profile);
        lg('warn','sketch import refused: '+e.message);
        toast(e.message+' — nothing was changed.', 'err');
        return;
      }
      lg('warn','sketch import failed:\n'+e.message);
      toast('Could not transpile '+file.name+' — nothing was guessed. The console lists every line.', 'err');
    }
  };
  fr.readAsText(file);
}
