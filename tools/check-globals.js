#!/usr/bin/env node
/* Fails if a module that PCA Studio shares with the simulator reaches for a
 * global that only the simulator's manifest provides — or if any manifest
 * declares the same top-level name twice.
 *
 * WHY THIS EXISTS (v1.76.0). Both apps are classic scripts in one global
 * scope, in the order their manifest lists them, and thirteen of Studio's
 * modules are the sim's own files. A shared module may therefore call a
 * helper that happens to live in a sim-only file, and NOTHING says so: the
 * build succeeds, the sim's suites pass (the helper is there), and Studio's
 * smoke test passes too unless it happens to walk the exact path. It has now
 * happened three times:
 *
 *   · escGuard() in core/dialog.js       — Studio's hardware wizard, four versions
 *   · download() in a sim-only file      — the setup export button
 *   · PCA_MAX_BOARDS_UI in maestro/boards.js — the "PCA9685s" wizard step, which
 *     threw `ReferenceError` and rendered BLANK from v1.69.0 to v1.75.1, because
 *     the smoke test stepped 0→2→3→0→3→4 and never rendered step 1; and
 *     seqTotal() in maestro/playback.js, reached from blockSeqDur() the moment
 *     a whole-sequence brick is dropped.
 *
 * The rule the review wrote down: "a helper a shared module depends on has to
 * be as shared as the module is." This is that rule as a check.
 *
 * MECHANISM. Every file in each manifest is tokenised (comments, strings,
 * template literals and regex literals stripped; brace depth tracked) and its
 * depth-0 `const/let/var/function/class` names collected. Then, for every
 * file Studio loads, every free identifier — not after a `.`, not an object
 * key, not a declaration — that is declared by the SIM manifest but NOT by
 * Studio's is a finding, unless the same file guards that name with
 * `typeof NAME` on an EARLIER line (the established idiom for "a host may
 * not have this" — `if(typeof f === 'function'){ f(); }`). A use ABOVE the
 * file's first guard is reported. A line can opt out explicitly with a
 * comment containing `host-optional`, for the rare case where the guard is a
 * different name (say so in the comment).
 *
 * The tokeniser is deliberately small and slightly conservative: an
 * identifier followed by `:` is treated as an object key (a ternary's
 * consequent can hide behind that, which costs a MISS, never a false alarm).
 *
 * Exit 1 on any finding; prints one line per finding so a test runner can
 * quote it. Run: node tools/check-globals.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const KEYWORDS = new Set(('break case catch class const continue debugger default delete do else export '
  + 'extends finally for function if import in instanceof new return super switch this throw try typeof '
  + 'var void while with yield let static enum await implements package protected interface private public '
  + 'null true false undefined NaN Infinity async of get set').split(' '));

/* ------------------------------------------------------------ tokeniser
   Emits {t:'id'|'punct'|'kw', v, line, depth} — strings, comments, regex and
   template literals are consumed and dropped. Regex-vs-division is decided by
   the previous significant token, which is the standard heuristic and is
   right for everything in this tree. */
function tokenise(src){
  const out = [];
  let i = 0, line = 1, depth = 0, pd = 0, prev = null;
  const n = src.length;
  const regexOk = ()=> !prev || (prev.t === 'punct' && !/^[)\]}]$/.test(prev.v)) || prev.t === 'kw';
  while(i < n){
    const ch = src[i];
    if(ch === '\n'){ line++; i++; continue; }
    if(ch === ' ' || ch === '\t' || ch === '\r'){ i++; continue; }
    /* comments */
    if(ch === '/' && src[i+1] === '/'){ while(i < n && src[i] !== '\n') i++; continue; }
    if(ch === '/' && src[i+1] === '*'){
      const end = src.indexOf('*/', i+2); const stop = end < 0 ? n : end + 2;
      for(let k=i;k<stop;k++) if(src[k] === '\n') line++;
      i = stop; continue;
    }
    /* strings */
    if(ch === '"' || ch === "'"){
      let k = i+1;
      while(k < n && src[k] !== ch){ if(src[k] === '\\') k++; if(src[k] === '\n') line++; k++; }
      i = k+1; prev = {t:'str'}; continue;
    }
    /* template literals — nested ${} handled by depth counting */
    if(ch === '`'){
      let k = i+1, d = 0;
      while(k < n){
        if(src[k] === '\\'){ k += 2; continue; }
        if(src[k] === '\n') line++;
        if(d === 0 && src[k] === '`') break;
        if(src[k] === '$' && src[k+1] === '{'){ d++; k += 2; continue; }
        if(d > 0 && src[k] === '}'){ d--; }
        k++;
      }
      i = k+1; prev = {t:'str'}; continue;
    }
    /* regex literal */
    if(ch === '/' && regexOk()){
      let k = i+1, cls = false;
      while(k < n){
        if(src[k] === '\\'){ k += 2; continue; }
        if(src[k] === '\n') break;
        if(cls){ if(src[k] === ']') cls = false; }
        else if(src[k] === '[') cls = true;
        else if(src[k] === '/') break;
        k++;
      }
      k++; while(k < n && /[a-z]/i.test(src[k])) k++;
      i = k; prev = {t:'str'}; continue;
    }
    /* identifiers / keywords */
    if(/[A-Za-z_$]/.test(ch)){
      let k = i+1; while(k < n && /[A-Za-z0-9_$]/.test(src[k])) k++;
      const v = src.slice(i, k);
      const tok = {t: KEYWORDS.has(v) ? 'kw' : 'id', v, line, depth, pd};
      out.push(tok); prev = tok; i = k; continue;
    }
    /* numbers */
    if(/[0-9]/.test(ch)){
      let k = i+1; while(k < n && /[0-9A-Za-z_.]/.test(src[k])) k++;
      prev = {t:'num'}; i = k; continue;
    }
    /* punctuation — `=>` is one token, because arrow parameters are bindings */
    if(ch === '=' && src[i+1] === '>'){
      const tok = {t:'punct', v:'=>', line, depth, pd}; out.push(tok); prev = tok; i += 2; continue;
    }
    if(ch === '{') depth++;
    if(ch === '}') depth--;
    if(ch === '(') pd++;
    if(ch === ')') pd--;
    const tok = {t:'punct', v:ch, line, depth: ch === '{' ? depth-1 : depth, pd: ch === '(' ? pd-1 : pd};
    out.push(tok); prev = tok; i++;
  }
  return out;
}

/* depth-0 declarations: const/let/var NAME[, NAME…], function NAME, class NAME */
function declarations(toks){
  const names = [];
  for(let i=0;i<toks.length;i++){
    const t = toks[i];
    if(t.t !== 'kw' || t.depth !== 0 || t.pd !== 0) continue;
    if(t.v === 'function' || t.v === 'class'){
      const nx = toks[i+1];
      if(nx && nx.t === 'id') names.push({name:nx.v, line:nx.line});
    }else if(t.v === 'const' || t.v === 'let' || t.v === 'var'){
      /* NAME [= …] (, NAME [= …])* ; — walk the list at depth 0 until ';' */
      let j = i+1, want = true, pdepth = 0;
      while(j < toks.length){
        const u = toks[j];
        if(u.t === 'punct'){
          if(u.v === '(' || u.v === '[') pdepth++;
          if(u.v === ')' || u.v === ']') pdepth--;
          if(pdepth === 0 && u.depth === 0 && u.v === ';') break;
          if(pdepth === 0 && u.depth === 0 && u.v === ',') want = true;
          if(u.v === '=' ) want = false;
        }else if(want && u.t === 'id' && u.depth === 0 && pdepth === 0){
          names.push({name:u.v, line:u.line}); want = false;
        }else if(u.t === 'kw' && u.depth === 0 && pdepth === 0 && (u.v === 'const' || u.v === 'let' || u.v === 'var' || u.v === 'function')){
          break;   /* a missing semicolon before the next statement */
        }
        j++;
      }
    }
  }
  return names;
}

/* every name the file binds LOCALLY somewhere — a parameter, a let/const at
   any depth, an arrow parameter, a catch binding, a for-of variable. A use of
   such a name is not a reach for the global of the same name (`qus` is both a
   sim helper and the commonest parameter name in the engine). This is
   file-wide rather than scope-exact, which can only produce a MISS (a file
   that binds `x` in one function and uses the global `x` in another), never
   a false alarm. */
function localBindings(toks){
  const b = new Set();
  const bindParamsBefore = k => {           /* toks[k] is the ')' closing a parameter list */
    let d = 0;
    for(let j=k;j>=0;j--){
      const u = toks[j];
      if(u.t === 'punct' && u.v === ')') d++;
      if(u.t === 'punct' && u.v === '(') { d--; if(d === 0) return; }
      if(u.t === 'id' && d === 1) b.add(u.v);
    }
  };
  for(let i=0;i<toks.length;i++){
    const t = toks[i], nx = toks[i+1], p = toks[i-1];
    if(t.t === 'kw' && (t.v === 'const' || t.v === 'let' || t.v === 'var')){
      /* the names up to '=' / ';' / 'of' / 'in', including a destructuring pattern */
      let j = i+1, want = true;
      while(j < toks.length){
        const u = toks[j];
        if(u.t === 'punct' && (u.v === ';' || u.v === '=' || u.v === '=>')) { if(u.v === '=') want = false; if(u.v === ';') break; }
        if(u.t === 'punct' && u.v === ',' && u.pd === t.pd && u.depth === t.depth) want = true;
        if(u.t === 'kw' && (u.v === 'of' || u.v === 'in')) break;
        if(u.t === 'id' && want) b.add(u.v);
        if(u.t === 'punct' && (u.v === ')' ) && u.pd < t.pd) break;
        j++;
        if(j - i > 40) break;
      }
    }
    if(t.t === 'kw' && (t.v === 'function' || t.v === 'catch')){
      /* function NAME? ( params ) */
      let j = i+1; if(toks[j] && toks[j].t === 'id') j++;
      if(toks[j] && toks[j].t === 'punct' && toks[j].v === '('){
        let d = 0;
        for(let k=j;k<toks.length;k++){
          const u = toks[k];
          if(u.t === 'punct' && u.v === '(') d++;
          if(u.t === 'punct' && u.v === ')'){ d--; if(d === 0) break; }
          if(u.t === 'id' && d === 1) b.add(u.v);
        }
      }
    }
    if(t.t === 'punct' && t.v === '=>'){
      if(p && p.t === 'id') b.add(p.v);
      else if(p && p.t === 'punct' && p.v === ')') bindParamsBefore(i-1);
    }
    /* method shorthand — `drive(ch, qus){ … }` inside an object literal — is a
       parameter list too: an id, '(' … ')' and then '{' */
    if(t.t === 'punct' && t.v === '{' && p && p.t === 'punct' && p.v === ')'){
      let d = 0, j = i-1;
      for(; j>=0; j--){
        const u = toks[j];
        if(u.t === 'punct' && u.v === ')') d++;
        if(u.t === 'punct' && u.v === '('){ d--; if(d === 0) break; }
      }
      const before = toks[j-1];
      if(before && before.t === 'id') bindParamsBefore(i-1);
    }
  }
  return b;
}

/* free identifier uses: not after '.', not an object key, not a declaration name */
function uses(toks){
  const out = [];
  const local = localBindings(toks);
  for(let i=0;i<toks.length;i++){
    const t = toks[i]; if(t.t !== 'id') continue;
    const p = toks[i-1], nx = toks[i+1];
    if(p && p.t === 'punct' && p.v === '.') continue;
    if(nx && nx.t === 'punct' && nx.v === ':' ) continue;
    if(p && p.t === 'kw' && (p.v === 'function' || p.v === 'class' || p.v === 'const' || p.v === 'let' || p.v === 'var')) continue;
    if(local.has(t.v)) continue;
    const guarded = !!(p && p.t === 'kw' && p.v === 'typeof');
    out.push({name:t.v, line:t.line, guarded});
  }
  return out;
}

function manifestFiles(mf){
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const base = path.basename(mf) === 'manifest.json' && mf.indexOf('pca-studio') >= 0 ? ROOT : path.dirname(mf);
  return (m.js || []).map(p => path.resolve(base, p));
}

function main(){
  const simMf = path.join(ROOT, 'src', 'manifest.json');
  const stuMf = path.join(ROOT, 'pca-studio', 'manifest.json');
  const findings = [];
  const declsOf = {};
  const tokCache = {};
  const toks = f => tokCache[f] || (tokCache[f] = tokenise(fs.readFileSync(f, 'utf8')));

  for(const [label, mf] of [['sim', simMf], ['studio', stuMf]]){
    const files = manifestFiles(mf);
    const seen = new Map();
    for(const f of files){
      if(!fs.existsSync(f)){ findings.push(label+': manifest lists a file that does not exist — '+path.relative(ROOT, f)); continue; }
      for(const d of declarations(toks(f))){
        const rel = path.relative(ROOT, f);
        if(seen.has(d.name)){
          findings.push(label+': top-level `'+d.name+'` declared twice — '+seen.get(d.name)+' and '+rel+':'+d.line);
        }else seen.set(d.name, rel+':'+d.line);
      }
    }
    declsOf[label] = seen;
  }

  /* shared modules reaching for sim-only globals */
  const simOnly = new Set([...declsOf.sim.keys()].filter(k => !declsOf.studio.has(k)));
  const studioFiles = manifestFiles(stuMf);
  for(const f of studioFiles){
    if(!fs.existsSync(f)) continue;
    const rel = path.relative(ROOT, f);
    const src = fs.readFileSync(f, 'utf8');
    const lines = src.split(/\r?\n/);
    const tk = toks(f);
    /* the first line on which the file asks `typeof NAME` — a use at or below
       that line is taken as sitting behind the guard (the idiom is
       `if(typeof f === 'function'){ f(); }`, guard on the line above) */
    const guardLine = {};
    for(const u of uses(tk)) if(u.guarded && !(u.name in guardLine)) guardLine[u.name] = u.line;
    const reported = new Set();
    for(const u of uses(tk)){
      if(!simOnly.has(u.name) || u.guarded) continue;
      if(u.name in guardLine && guardLine[u.name] <= u.line) continue;
      const lineText = lines[u.line-1] || '';
      if(/host-optional/.test(lineText)) continue;     /* an explicit, per-line opt-out */
      const key = u.name+'@'+u.line;
      if(reported.has(key)) continue; reported.add(key);
      findings.push('studio: '+rel+':'+u.line+' uses `'+u.name+'`, which only the sim manifest provides ('
        + declsOf.sim.get(u.name)+')' + ((u.name in guardLine) ? ' — the file only asks typeof '+u.name+' further DOWN, at line '+guardLine[u.name] : ''));
    }
  }

  const total = declsOf.sim.size + declsOf.studio.size;
  if(findings.length){
    console.log('FAIL — '+findings.length+' global-scope problem(s):');
    findings.forEach(x => console.log('  '+x));
    process.exit(1);
  }
  console.log('sim '+declsOf.sim.size+' top-level names, studio '+declsOf.studio.size+', no duplicates; '
    + 'every global a shared module reaches for is one Studio loads');
}
main();
