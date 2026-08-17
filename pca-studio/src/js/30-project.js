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
  if(keepPositions && old){
    for(let i=0;i<Math.min(old.st.length,E.st.length);i++){
      const o=old.st[i], s=E.st[i];
      if(!s.servo) continue;
      s.active=o.active; s.pos256=o.pos256; s.vel256=o.vel256; s.target=o.target;
      const c=PROJ.channels[i], lo=Math.min(c.min,c.max)<<8, hi=Math.max(c.min,c.max)<<8;
      if(s.active){ s.pos256=clamp(s.pos256,lo,hi); s.target=clamp(s.target,lo>>8,hi>>8); }
    }
  }
  E.onWrite=(ch,qus)=>serialWrite(ch,qus);
  if(SER.port) serialSyncAll();
}
