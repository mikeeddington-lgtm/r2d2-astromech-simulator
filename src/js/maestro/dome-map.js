'use strict';
/* =====================================================================
   THE DOME, FROM ABOVE

   A channel called "P11" means nothing until you can see where P11 is.
   This draws the dome top-down — six pie panels, fourteen lower panels,
   three holoprojectors and the fixed features — so mapping a board is
   "click the channel, click where it is" instead of hunting a dropdown.

   Drawn procedurally, not traced: the geometry below is the panel LAYOUT
   (which panel sits at which bearing), taken off Printed Droid's reference
   drawing at printed-droid.com/kb/r2-d2-terminology. Their drawing is
   their own work and is not reproduced here.

   Bearings are degrees CLOCKWISE FROM THE FRONT-BACK AXIS, 0 = dead astern,
   180 = dead ahead, viewed from above — so the front logic displays and the
   front PSI cluster near 180 and the rear logic display sits near 300, which
   is what the drawing shows.
   ===================================================================== */

const DOME_LAYOUT = {
  /* lower dome panels, on the ring */
  panels: [
    {n:1,  a:142.5}, {n:2,  a:128}, {n:3,  a:114}, {n:4,  a:94},
    {n:5,  a:75.5},  {n:6,  a:62.5},{n:7,  a:45},  {n:8,  a:24},
    {n:9,  a:300},   {n:10, a:242}, {n:11, a:217}, {n:12, a:204},
    {n:13, a:194},   {n:14, a:184}
  ],
  /* the six pie panels, 60 apart */
  pies: [ {n:1,a:150}, {n:2,a:90}, {n:3,a:30}, {n:4,a:330}, {n:5,a:270}, {n:6,a:210} ],
  /* holoprojectors — HP3 lives inside pie panel 3, which is why it is at
     the pie radius rather than out on the ring */
  holos: [ {n:1,a:165,r:0.62}, {n:2,a:350,r:0.62}, {n:3,a:38,r:0.58} ],
  /* fixed features: lights, displays and the two dome buttons. Drawn for
     orientation only — nothing here is a servo. */
  marks: [
    {id:'H1', a:8,  r:0.78, t:'Dome button 1'},
    {id:'H2', a:20, r:0.78, t:'Dome button 2'}
  ],
  /* what Printed Droid says a lower panel actually carries, when it is not
     a moving panel. Shown on the diagram so a surprising mapping is obvious. */
  lit: {5:'Magic Panel', 6:'small upper panel', 8:'Rear PSI',
        9:'Rear Logic Display', 12:'Front Logic Displays', 14:'Front PSI'}
};

/* actuator key for a dome feature */
function domePartKey(kind, n, axis){
  if(kind==='pie')   return 'pie'   + (n-1);
  if(kind==='panel') return 'panel' + (n-1);
  if(kind==='holo')  return 'hp' + n + (axis==='tilt' ? 'Tilt' : 'Pan');
  return '';
}
function domeChannelsFor(channels, key){
  return channels.filter(c=>c.act===key && /^servo/i.test(c.mode));
}

/* ------------------------------------------------------------- geometry */
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(t, attrs){
  const e = document.createElementNS(SVGNS, t);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
/* 0 = astern (up on screen), increasing clockwise */
function domePolar(r, aDeg){
  const th = (aDeg-90) * Math.PI/180;
  return [ r*Math.cos(th), r*Math.sin(th) ];
}
/* an annulus sector from a1 to a2 between radii r1 (inner) and r2 (outer) */
function domeSector(r1, r2, a1, a2){
  const [x1,y1]=domePolar(r2,a1), [x2,y2]=domePolar(r2,a2);
  const [x3,y3]=domePolar(r1,a2), [x4,y4]=domePolar(r1,a1);
  const big = (a2-a1) > 180 ? 1 : 0;
  return 'M'+x1.toFixed(2)+' '+y1.toFixed(2)+
         'A'+r2+' '+r2+' 0 '+big+' 1 '+x2.toFixed(2)+' '+y2.toFixed(2)+
         'L'+x3.toFixed(2)+' '+y3.toFixed(2)+
         'A'+r1+' '+r1+' 0 '+big+' 0 '+x4.toFixed(2)+' '+y4.toFixed(2)+'Z';
}

/* =====================================================================
   buildDomeMap(host, opts)
     opts.channels    the channel table to read (defaults to MSTR.channels —
                       the import wizard's temporary set and the live table
                       both look the same shape: {i,name,mode,act,...})
     opts.selected     channel index into opts.channels the next click
                        assigns to (or -1)
     opts.hoverKey     actuator key to highlight
     opts.onPick(key)  a dome feature was clicked — the caller owns what
                        "assign" means (the import wizard's temporary
                        MSTR.channels[i].act=key, or HW.setPart for the live
                        table); this file never writes a channel itself
   ===================================================================== */
function buildDomeMap(host, opts){
  const o = opts || {};
  const channels = o.channels || MSTR.channels;
  const R = 100;
  const svg = svgEl('svg', {viewBox:'-142 -140 284 288', class:'domemap'});
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Top-down dome map');

  const selCh  = (o.selected>=0) ? channels[o.selected] : null;
  const hoverK = o.hoverKey || '';

  const cls = (key)=>{
    const owners = domeChannelsFor(channels, key);
    let c = 'dm';
    if(owners.length) c += ' has';
    if(owners.length > 1) c += ' dup';
    if(hoverK === key) c += ' hov';
    if(selCh && selCh.act === key) c += ' sel';
    return c;
  };
  const title = (label, key, extra)=>{
    const owners = domeChannelsFor(channels, key);
    let t = label;
    if(extra) t += ' — ' + extra;
    t += owners.length
       ? '\nchannel ' + owners.map(c=>c.i+' ('+c.name+')').join(', ')
       : '\nnot mapped' + (selCh ? ' — click to assign channel '+selCh.i : '');
    return t;
  };
  const pick = (key)=>{ if(o.onPick) o.onPick(key); };

  /* --- dome outline --- */
  svg.appendChild(svgEl('circle',{cx:0,cy:0,r:R,class:'dmring'}));
  svg.appendChild(svgEl('circle',{cx:0,cy:0,r:R*0.86,class:'dmring2'}));
  svg.appendChild(svgEl('circle',{cx:0,cy:0,r:R*0.44,class:'dmring2'}));
  svg.appendChild(svgEl('circle',{cx:0,cy:0,r:R*0.09,class:'dmhub'}));

  /* --- front marker, so the drawing has an orientation --- */
  const [fx,fy] = domePolar(R*1.34, 180);
  const ft = svgEl('text',{x:fx,y:fy+3,class:'dmfront','text-anchor':'middle'});
  ft.textContent = 'FRONT';
  svg.appendChild(ft);

  /* --- the six pie panels --- */
  DOME_LAYOUT.pies.forEach(p=>{
    const key = domePartKey('pie', p.n);
    const g = svgEl('g',{class:cls(key)+' dmpie'});
    const path = svgEl('path',{d:domeSector(R*0.13, R*0.42, p.a-28, p.a+28)});
    g.appendChild(path);
    const [tx,ty] = domePolar(R*0.26, p.a);
    const t = svgEl('text',{x:tx,y:ty+3,'text-anchor':'middle',class:'dmlab'});
    t.textContent = 'PP'+p.n;
    g.appendChild(t);
    const tt = svgEl('title'); tt.textContent = title('Pie panel '+p.n, key,
      p.n===3 ? 'carries holoprojector 3 — drawn just outside it' : p.n===4 ? 'usually the periscope' : '');
    g.appendChild(tt);
    g.addEventListener('click',()=>pick(key));
    svg.appendChild(g);
  });

  /* --- the fourteen lower panels ---
     Their bearings are real, so some sit 10 apart and their labels would
     overlap. Stagger those onto a second radius and give every one a leader
     line, the way the reference drawing does. */
  const ordered = DOME_LAYOUT.panels.slice().sort((a,b)=>a.a-b.a);
  const labR = {}; let prevA = -999, prevOut = false;
  ordered.forEach(p=>{
    const out = (p.a - prevA < 16) ? !prevOut : false;
    labR[p.n] = out ? 1.29 : 1.13;
    prevA = p.a; prevOut = out;
  });
  DOME_LAYOUT.panels.forEach(p=>{
    const key = domePartKey('panel', p.n);
    const light = DOME_LAYOUT.lit[p.n];
    const g = svgEl('g',{class:cls(key)+' dmpanel'+(light?' lit':'')});
    g.appendChild(svgEl('path',{d:domeSector(R*0.86, R, p.a-6, p.a+6)}));
    const lr = labR[p.n];
    const [lx1,ly1] = domePolar(R*1.02, p.a);
    const [lx2,ly2] = domePolar(R*(lr-0.07), p.a);
    g.appendChild(svgEl('line',{x1:lx1,y1:ly1,x2:lx2,y2:ly2,class:'dmlead'}));
    const [tx,ty] = domePolar(R*lr, p.a);
    const t = svgEl('text',{x:tx,y:ty+3,'text-anchor':'middle',class:'dmlab'});
    t.textContent = 'P'+p.n;
    g.appendChild(t);
    const tt = svgEl('title');
    tt.textContent = title('Panel '+p.n, key, light ? light+' on the reference drawing — usually not a servo' : 'moving panel');
    g.appendChild(tt);
    g.addEventListener('click',()=>pick(key));
    svg.appendChild(g);
  });

  /* --- three holoprojectors, two axes each ---
     One marker per unit rather than two: a click takes pan first and then
     tilt, so wiring a holo is two clicks in the same place. The ring around
     it fills as its axes get claimed. */
  DOME_LAYOUT.holos.forEach(h=>{
    const panK = domePartKey('holo',h.n,'pan'), tiltK = domePartKey('holo',h.n,'tilt');
    const done = (domeChannelsFor(channels, panK).length?1:0) + (domeChannelsFor(channels, tiltK).length?1:0);
    const nextK = domeChannelsFor(channels, panK).length ? tiltK : panK;
    const g = svgEl('g',{class:'dm dmholo'+(done?' has':'')+(done===2?' full':'')+
                          ((hoverK===panK||hoverK===tiltK)?' hov':'')});
    const [cx,cy] = domePolar(R*h.r, h.a);
    g.appendChild(svgEl('circle',{cx,cy,r:12}));
    const t = svgEl('text',{x:cx,y:cy+3,'text-anchor':'middle',class:'dmlab'});
    t.textContent = 'HP'+h.n;
    g.appendChild(t);
    const d = svgEl('text',{x:cx,y:cy+15,'text-anchor':'middle',class:'dmsub'});
    d.textContent = done+'/2';
    g.appendChild(d);
    const tt = svgEl('title');
    tt.textContent = 'Holoprojector '+h.n+' — pan and tilt\n'+
      ['pan','tilt'].map(ax=>{
        const k = domePartKey('holo',h.n,ax);
        const own = domeChannelsFor(channels, k);
        return '  '+ax+': '+(own.length ? own.map(c=>'ch'+c.i+' ('+c.name+')').join(', ') : 'not mapped');
      }).join('\n') + (selCh ? '\nclick to assign channel '+selCh.i+' to '+(nextK===panK?'pan':'tilt') : '');
    g.appendChild(tt);
    g.addEventListener('click',()=>pick(nextK));
    svg.appendChild(g);
  });

  /* --- fixed features, for orientation only --- */
  DOME_LAYOUT.marks.forEach(m=>{
    const [cx,cy] = domePolar(R*m.r, m.a);
    const g = svgEl('g',{class:'dmmark'});
    g.appendChild(svgEl('circle',{cx,cy,r:9}));
    const t = svgEl('text',{x:cx,y:cy+3,'text-anchor':'middle',class:'dmlab'});
    t.textContent = m.id;
    g.appendChild(t);
    const tt = svgEl('title'); tt.textContent = m.t + '\nnot a servo';
    g.appendChild(tt);
    svg.appendChild(g);
  });

  host.appendChild(svg);
  return svg;
}

/* Everything on the dome map, in the order the diagram draws it — used to
   tell the user which of their channels the diagram cannot place. */
function domeMapKeys(){
  const out = [];
  DOME_LAYOUT.pies.forEach(p=>out.push(domePartKey('pie',p.n)));
  DOME_LAYOUT.panels.forEach(p=>out.push(domePartKey('panel',p.n)));
  DOME_LAYOUT.holos.forEach(h=>{ out.push(domePartKey('holo',h.n,'pan')); out.push(domePartKey('holo',h.n,'tilt')); });
  return out;
}
function domeMapCovers(key){ return !!key && domeMapKeys().indexOf(key) >= 0; }
