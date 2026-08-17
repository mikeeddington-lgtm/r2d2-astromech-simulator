'use strict';
/* ==================================================== .mstr IMPORT (mini)
   Channels + <Sequences> + the script's sub order for slot numbering.
   Frame rows are THREE sections — targets s speeds a accels — with `s`
   and `a` as literal markers: STOP AT `s` or speeds become phantom
   channel targets. (Full recovery of script-only files lives in the sim;
   this importer warns instead.) */
function mstrImportText(text, fileName){
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length) throw new Error('not valid XML');
  const root=doc.documentElement;
  if(!root || root.nodeName!=='UscSettings') throw new Error('no <UscSettings> root — not a Maestro settings file');
  const chEls=root.getElementsByTagName('Channel');
  const channels=[];
  for(let i=0;i<chEls.length;i++){
    const c=chEls[i];
    channels.push({
      name:(c.getAttribute('name')||'').trim()||('Channel '+i),
      mode:c.getAttribute('mode')||'Servo',
      min:parseInt(c.getAttribute('min')||3968,10),
      max:parseInt(c.getAttribute('max')||8000,10),
      home:parseInt(c.getAttribute('home')||6000,10),
      homemode:c.getAttribute('homemode')||'Off',
      speed:parseInt(c.getAttribute('speed')||0,10),
      acceleration:parseInt(c.getAttribute('acceleration')||0,10)
    });
  }
  if(!channels.length) throw new Error('no <Channel> entries');
  const n=channels.length;
  const sequences=[];
  const seqEls=root.getElementsByTagName('Sequence');
  for(let sx=0;sx<seqEls.length;sx++){
    const frames=[];
    const frEls=seqEls[sx].getElementsByTagName('Frame');
    for(let f=0;f<frEls.length;f++){
      const toks=(frEls[f].textContent||'').trim().split(/\s+/);
      const targets=[];
      for(let t=0;t<toks.length && t<n;t++){
        if(toks[t]==='s') break;                       /* the marker — stop */
        targets.push(parseInt(toks[t],10)||0);
      }
      while(targets.length<n) targets.push(0);
      frames.push({
        name:frEls[f].getAttribute('name')||('Frame '+f),
        duration:parseInt(frEls[f].getAttribute('duration')||500,10),
        targets
      });
    }
    sequences.push({name:seqEls[sx].getAttribute('name')||('Sequence '+sx), frames});
  }
  /* slot order = the script's sequence subs, the real board's truth */
  const scrEl=root.getElementsByTagName('Script')[0];
  const script=scrEl?(scrEl.textContent||''):'';
  const subs=[];
  script.split(/\r?\n/).forEach(line=>{
    const m=/^\s*sub\s+([A-Za-z0-9_.]+)/.exec(line);
    if(m && !/^frame_/i.test(m[1])) subs.push(m[1]);
  });
  const nice=s=>String(s).replace(/\s+/g,'_').replace(/[^a-z0-9_]/gi,'').toLowerCase();
  let ordered=[], warn='';
  if(subs.length){
    subs.forEach(nm=>{
      const q=sequences.find(x=>nice(x.name)===nm.toLowerCase());
      if(q) ordered.push(q);
    });
    const off=sequences.filter(q=>ordered.indexOf(q)<0);
    if(ordered.length){
      if(off.length) warn=off.length+' sequence(s) are in the file but not in its script — appended after the script slots';
      ordered=ordered.concat(off);
    }else{
      warn='script subs did not match any <Sequences> names — using file order';
      ordered=sequences;
    }
  }else{
    if(script.trim() && !sequences.length)
      throw new Error('this file has a script but no <Sequences> — re-save it from Control Center, or use the R2-D2 Simulator, which can decode the script');
    ordered=sequences;
  }
  return {channels, sequences:ordered, fileName:fileName||'settings.mstr', warn};
}
