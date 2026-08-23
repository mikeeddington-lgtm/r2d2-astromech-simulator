'use strict';
/* =============================================================== CORE */
const STUDIO_VERSION = '0.12.2';
const $ = id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
function log(msg, cls){ const l=$('log'); l.textContent=msg; l.className=cls||''; }
function download(name, text, mime){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:mime||'text/plain'}));
  a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}

/* ============================== ONE ESCAPER, LOADED FIRST (2026-08-23)

   esc() turns text into markup-safe text — & < > and the double quote,
   which covers both places Studio ever interpolates: the text between two
   tags, and the value inside a double-quoted attribute.

   It used to live at the bottom of 50-blocks-ui.js, the LAST file in the
   manifest, because the brick library was the first view that happened to
   want it. A helper defined in the last file is a trap waiting for someone
   to call it from the first: every view in between builds markup by hand,
   and none of them can reach an escaper that has not been parsed yet.

   On 2026-08-23 we found out what that costs. A sequence named with an img
   tag carrying an onerror handler was REPRODUCED executing in the sequence
   tabs — the fix that sink needed was two files too late to use. Names come
   off the user's keyboard and out of imported project JSON, so they are
   attacker-controlled text either way, and every later view needs the same
   one escaper. So it lives here, in the first file the manifest loads. */
function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
