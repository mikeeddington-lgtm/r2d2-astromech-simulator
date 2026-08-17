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
