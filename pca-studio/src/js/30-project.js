'use strict';
/* ============================================================== PROJECT */
const LS_KEY='pcastudio.v1';
let PROJ=null, E=null, curSeq=0;
function defaultProject(){
  const mk=(nm,i)=>({name:nm,mode:'Servo',min:4544,max:7296,home:0,homemode:'Off',speed:80,acceleration:10});
  return {
    ver:1, osc:25000000,
    channels:[mk('Servo 0'),mk('Servo 1'),mk('Servo 2'),mk('Servo 3')].map((c,i)=>(c.name='Servo '+i,c)),
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
