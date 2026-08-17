'use strict';
/* ========================================================== PCA GEN (sim)
   The sim-only front-ends onto pca-gen.js. They read MSTR, LOADOUT and the
   Maestro tab's DOM, none of which exist in PCA Studio — which is why the
   generator itself lives next door and is shared with it verbatim.
   ===================================================================== */

function pcaGenFromLoadout(){
  return pcaGenHeader(MSTR.channels, loadoutSeqs(),
    {source: (MSTR.fileName||'sim')+' loadout'});
}

function pcaGenFromParsed(P){
  /* the script is the board's truth: sequence subs in declaration order
     are what restartScript(n) hit. No script → the <Sequences> order. */
  let seqs = [];
  const scriptSubs = (P.subs||[]).filter(s=>s.kind==='sequence' && s.seqIndex>=0);
  if(scriptSubs.length) seqs = scriptSubs.map(s=>P.sequences[s.seqIndex]);
  else seqs = P.sequences.slice();
  return pcaGenHeader(P.channels, seqs, {source: P.fileName});
}

/* the Maestro-tab button */
function exportPcaHeader(){
  const text = pcaGenFromLoadout();
  const blob = new Blob([text], {type:'text/x-c'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (MSTR.fileName||'sequences').replace(/\.mstr$/i,'') + '-sequences.h';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  const nSeq = loadoutSeqs().length;
  lg('mae','exported '+a.download+' — '+MSTR.channels.length+' channels, '+nSeq+' sequences for MaestroPCA');
  toast('Exported '+a.download+' — pair it with the MaestroPCA library. Calibrate the PCA9685 oscillator before trusting endpoints.', 'warn');
  const m=$('maeMsg'); if(m){ m.innerHTML='Exported <b>'+a.download+'</b> for the <b>MaestroPCA</b> library (the cheap PCA9685 route). '
    +'Slot numbers match this loadout, so the sketch\'s restartScript(n) calls are identical to the Maestro build. '
    +'<b style="color:var(--am)">Verify endpoints and oscillator calibration on YOUR hardware at low speed first.</b>'; }
  return text;
}
