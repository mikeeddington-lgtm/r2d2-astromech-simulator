'use strict';
/* =====================================================================
   FLOW DIAGRAMS — how the servo data actually gets there

   Mike, 2026-08-14, on choosing a servo arrangement: "need to make it
   easy to pick which one best suites them : maybe add flow diagrames /
   flow logic images."

   He is right, and the reason is worth writing down. The seven
   arrangements in SERVO_TOPOS differ in exactly one way — the SHAPE of
   the path from the droid's Arduino to the servo — and that shape is
   miserable in prose. "The second board hangs off the first rather than
   off the host" is a sentence you have to read twice; two boxes and an
   arrow is a thing you recognise. So the picker is pictures, and the
   words underneath are the consequence rather than the description.

   These are generated, not drawn. A topology gives an array of LINKS,
   each an array of node names, and this file lays them out:

       ['Padawan','Maestro 1','Maestro 2','Servos']

   becomes four boxes and three arrows on one row. Two links become two
   rows sharing a Padawan. Nothing here knows what a Maestro is — which
   is the point: adding an arrangement is one entry in SERVO_TOPOS, not
   a new drawing.

   The box WIDTH is measured from the label, roughly, because a fixed
   width either truncates "PCA9685 1" or wastes half the row on
   "Servos". SVG cannot measure text, so this uses a per-character
   estimate for the monospace stack the app already ships — good enough
   for a diagram whose job is recognition, not typesetting.
   ===================================================================== */

const FLOW_H     = 34;    /* box height */
const FLOW_GAPX  = 26;    /* arrow length between boxes */
const FLOW_GAPY  = 12;    /* space between two links */
const FLOW_PADX  = 11;    /* padding inside a box */
const FLOW_CHW   = 6.15;  /* ≈ width of one monospace char at 10.5px */

function flowBoxW(label){
  return Math.max(58, Math.round(String(label).length * FLOW_CHW) + FLOW_PADX * 2);
}
/* which role a node plays, so the picture reads without a legend:
   the droid's own board is the accent, the servos are the destination,
   everything between is a link in the chain */
function flowRole(label, i, n){
  if(i === 0) return 'src';
  if(i === n - 1) return 'dst';
  return 'mid';
}

/* One diagram. `links` is an array of arrays of node labels; `dashed`
   draws it as an arrangement that does not work yet. */
function flowSvg(links, opts){
  const o = opts || {};
  const rows = (links && links.length) ? links : [[]];
  const widths = rows.map(r => r.map(flowBoxW));
  const rowW = widths.map(w => w.reduce((a,x)=>a+x, 0) + FLOW_GAPX * Math.max(0, w.length - 1));
  const W = Math.max.apply(null, rowW.concat([10]));
  const H = rows.length * FLOW_H + (rows.length - 1) * FLOW_GAPY;
  const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let s = '<svg class="flow' + (o.dashed ? ' dash' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" '
        + 'preserveAspectRatio="xMinYMid meet" role="img" aria-label="' + esc(rows.map(r=>r.join(' to ')).join('; ')) + '" '
        + 'focusable="false">';

  rows.forEach((row, ri)=>{
    const y = ri * (FLOW_H + FLOW_GAPY);
    const cy = y + FLOW_H / 2;
    let x = 0;
    row.forEach((label, i)=>{
      const w = widths[ri][i];
      const role = flowRole(label, i, row.length);
      if(i > 0){
        /* the arrow sits in the gap we left for it */
        const ax = x - FLOW_GAPX;
        s += '<path class="fl-w" d="M' + (ax + 3) + ' ' + cy + ' H' + (x - 7) + '"/>';
        s += '<path class="fl-a" d="M' + (x - 8) + ' ' + (cy - 3.5) + ' L' + (x - 1) + ' ' + cy
           + ' L' + (x - 8) + ' ' + (cy + 3.5) + ' Z"/>';
      }
      s += '<rect class="fl-b fl-' + role + '" x="' + x + '" y="' + y + '" width="' + w
         + '" height="' + FLOW_H + '" rx="5"/>';
      s += '<text class="fl-t fl-' + role + '" x="' + (x + w / 2) + '" y="' + (cy + 3.6) + '" '
         + 'text-anchor="middle">' + esc(label) + '</text>';
      x += w + FLOW_GAPX;
    });
  });
  s += '</svg>';
  return s;
}

/* The diagram for one SERVO_TOPOS entry — the only caller that matters,
   kept here so the topology table never has to know about drawing. */
function servoTopoSvg(topo){
  if(!topo) return '';
  return flowSvg(topo.flow, {dashed: topo.sim === 'park'});
}
