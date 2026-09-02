/* AstroPixels — the dome lighting layer (v1.72.0).
   -------------------------------------------------------------------------
   Four things here are REGRESSION tests, not coverage, and each one is a bug
   that would be invisible in a screenshot:

     · the LED MAPS are generated from a serpentine rule rather than
       transcribed, so they are checked against spot values read off the
       published tables. A generator that is one row out of phase produces a
       panel that looks perfectly plausible and scrolls text backwards on
       every other line.

     · the palette ramp's INTEGER tween step. Interpolate it properly and
       every effect still runs, still looks like lights, and no longer looks
       like a logic display — the jump at each key is the whole character.

     · the transport. A command the flashed sketch could not have heard must
       be refused HERE, or the simulator teaches a dome that does not exist.

     · the CAD anchors. The panels are placed from the MK4's own part
       bounding boxes, so the test asserts they land INSIDE those boxes —
       the one check that catches a re-export moving a board. */
const { launchBrowser } = require('./harness');
const path = require('path');
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog', async d=>await d.accept());
  await page.goto('file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q);
  await page.waitForFunction('typeof APX!=="undefined" && APX.built', {timeout:40000});
  const ev = f => page.evaluate(f);
  await ev(()=>{ if(typeof closeStartup==='function') closeStartup(); APX.on = true; });

  console.log('\n════ the boards ════');
  ok('four displays, numbered the way LE addresses them', await ev(()=>
    APX.order.join()==='fld,rld,fpsi,rpsi' &&
    APX.disp.fld.id===1 && APX.disp.rld.id===3 && APX.disp.fpsi.id===4 && APX.disp.rpsi.id===5));
  ok('the front logic is 9x10 and the rear 27x4 — not the other way round', await ev(()=>
    APX.disp.fld.w===9 && APX.disp.fld.h===10 && APX.disp.fld.count===90 &&
    APX.disp.rld.w===27 && APX.disp.rld.h===4 && APX.disp.rld.count===108));
  ok('a PSI is 5x5 with the corners cut out — 25 LEDs in a 25-cell grid, 4 holes', await ev(()=>{
    const d=APX.disp.fpsi;
    let holes=0; for(let i=0;i<d.map.length;i++) if(d.map[i]>=d.count) holes++;
    return d.w===5 && d.h===5 && d.count===25 && holes===4 &&
           leCell(d,0,0)===null && leCell(d,4,4)===null && leCell(d,2,2)!==null;
  }));
  ok('three holoprojectors, seven pixels each', await ev(()=>
    APX.holoOrder.join()==='front,rear,top' && APX.holo.top.rgb.length===21));

  console.log('\n════ the LED maps, against the published tables ════');
  ok('the FLD is TWO 9x5 boards, so the serpentine restarts at row 5', await ev(()=>{
    const m=LE_BOARDS.fld.map();
    return m[0]===0 && m[8]===8 &&           // row 0 ascends
           m[9]===17 && m[17]===9 &&          // row 1 descends
           m[36]===36 && m[44]===44 &&        // row 4 ascends...
           m[45]===45 && m[53]===53 &&        // ...and so does row 5 — the reset
           m[72]===80 && m[80]===72 &&        // row 8 descends
           m[81]===81 && m[89]===89;          // row 9 ascends
  }));
  ok('the 10x10 slant board really is ONE board and alternates all the way down', await ev(()=>{
    const m=LE_BOARDS.fldSlant.map();
    return m[0]===0 && m[10]===19 && m[19]===10 && m[50]===59 && m[59]===50 && m[90]===99;
  }));
  ok('RLD row 1 starts at 53 and row 3 ends at 81', await ev(()=>{
    const m=LE_BOARDS.rld.map();
    return m[0]===0 && m[26]===26 && m[27]===53 && m[53]===27 && m[81]===107 && m[107]===81;
  }));
  ok('the PSI numbers its 21 fitted LEDs around the four holes', await ev(()=>{
    const m=LE_BOARDS.psi.map();
    return m[0]>=25 && m[1]===0 && m[3]===2 && m[4]>=25 && m[5]===3 && m[23]===20 && m[24]>=25;
  }));
  ok('the 8x8 PSI runs every row right to left', await ev(()=>{
    const m=LE_BOARDS.psi8.map();
    return m[2]===3 && m[5]===0 && m[16]===17 && m[23]===10 && m[0]>=64 && m[63]>=64;
  }));
  ok('the toolbox FLD is four boards side by side, each starting its own serpentine', await ev(()=>{
    const m=LE_BOARDS.fldTlbx.map();
    return m[0]===8 && m[1]===9 && m[2]===26 && m[3]===27 && m[4]===44 &&
           m[5]===53 && m[6]===54 && m[9]===89 && m[19]===179;
  }));

  console.log('\n════ the colour maths ════');
  ok('scale8 keeps 255 as unity', await ev(()=>lScale8(200,255)===200 && lScale8(200,0)===0));
  ok('map8(v,1,0) UNDERFLOWS to v+1 — the board gets brighter, not black', await ev(()=>
    lMap8(50,1,0)===51 && lMap8(0,1,0)===1));
  ok('hsv2rgb is FastLED rainbow, not textbook — hue 85 is 59,226,0 not 0,255,0', await ev(()=>{
    const g=lHsv2rgb(85,255,255), r=lHsv2rgb(0,255,255);
    return r[0]===255 && r[1]===0 && r[2]===0 && g[0]===59 && g[1]===226 && g[2]===0;
  }));
  ok('the value is applied twice, so V=64 is far darker than a quarter', await ev(()=>{
    const c=lHsv2rgb(0,255,64);
    return c[0] > 10 && c[0] < 22;
  }), await ev(()=>lHsv2rgb(0,255,64)[0]+''));

  console.log('\n════ the 46-entry ramp, and its integer step ════');
  ok('four keys at 0, 15, 30 and 45', await ev(()=>{
    const c=leColors(0,255);
    return c.length===46 && c[0][2]===1 && c[15][1]===255 && c[45][1]===0;
  }));
  ok('the tween NEVER reaches the next key — 70 where the key is 85', await ev(()=>{
    const c=leColors(0,255);
    return c[14][2]===70 && c[15][2]===85;
  }), await ev(()=>{const c=leColors(0,255); return c[14][2]+' then '+c[15][2];}));
  ok('palette 0 washes out to white at the top: saturation 17 then 0', await ev(()=>{
    const c=leColors(0,255);
    return c[44][1]===17 && c[45][1]===0;
  }));
  ok('palette 2 spends its first fifteen entries at V=0 — that is the twinkle', await ev(()=>{
    const c=leColors(2,255);
    for(let i=0;i<15;i++) if(c[i][2]>1) return false;
    return c[45][2]>200;
  }));

  console.log('\n════ the colour walk ════');
  ok('a PAUSED led is not written at all', await ev(()=>{
    const d=leMakeDisplay(LE_DISPLAYS[0]);
    d.pause[0]=5; d.rgb[0]=123;
    leStepLED(d,0,0,255);
    return d.rgb[0]===123 && d.pause[0]===4;
  }));
  ok('the walk is a 90-state ping-pong that folds back down the ramp', await ev(()=>{
    const d=leMakeDisplay(LE_DISPLAYS[0]);
    d.set.fade=0; d.set.delay=0;
    d.num[0]=44; d.pause[0]=0; leStepLED(d,0,0,255);       // -> 45, the top
    const top=d.num[0];
    d.pause[0]=0; leStepLED(d,0,0,255);                     // -> 46, folds to 44
    return top===45 && d.num[0]===46;
  }));
  ok('every fifth step takes the long pause — eighteen of the ninety, not four', await ev(()=>{
    const d=leMakeDisplay(LE_DISPLAYS[0]);
    d.set.fade=7; d.set.delay=0;
    let long=0;
    for(let n=0;n<90;n++){ d.num[0]=n; d.pause[0]=0; leStepLED(d,0,0,255); if(d.pause[0]!==7) long++; }
    return long===18;
  }), await ev(()=>{
    const d=leMakeDisplay(LE_DISPLAYS[0]); d.set.fade=7; d.set.delay=0; let long=0;
    for(let n=0;n<90;n++){ d.num[0]=n; d.pause[0]=0; leStepLED(d,0,0,255); if(d.pause[0]!==7) long++; }
    return long+' of 90';
  }));

  console.log('\n════ the command grammar ════');
  ok('LE reads from the right, so dropped leading zeros still parse', await ev(()=>{
    const a=apxCommand('LE1030000'), b=apxCommand('LE30000');
    return a.logic===1 && a.effect===3 && a.colour===0 &&
           b.logic===3 && b.effect===0 && b.time===0;
  }));
  ok('logic 0 is all four boards, and there is no board 2', await ev(()=>{
    const a=apxCommand('LE0010000'), b=apxCommand('LE2010000');
    return a.targets.length===4 && b.ok===false;
  }));
  ok('colour, speed and seconds land in the right fields', await ev(()=>{
    const r=apxCommand('LE1064312');
    return r.logic===1 && r.effect===6 && r.colour===4 && r.speed===3 && r.time===12;
  }), await ev(()=>JSON.stringify(apxCommand('LE1064312'))));
  /* v1.78.0, review L19 — the SHORT bodies. Reading from the right means the
     third digit from the end is the speed and the fourth the colour whenever
     they exist; the two gates were one digit late, so LE100 came out as speed
     0 and LE1234 lost its colour. Pinned on exactly the forms the "drop the
     leading zeros" rule tells a builder to type. */
  ok('a three-digit body keeps its speed and a four-digit one its colour — LE100 is speed 1, LE1234 is colour 1 · speed 2 · time 34', await ev(()=>{
    const a=apxLE('LE100'), b=apxLE('LE1234');
    return a.ok && a.logic===0 && a.effect===0 && a.colour===0 && a.speed===1 && a.time===0 &&
           b.ok && b.logic===0 && b.effect===0 && b.colour===1 && b.speed===2 && b.time===34;
  }), await ev(()=>JSON.stringify([apxLE('LE100'), apxLE('LE1234')].map(r=>[r.logic,r.effect,r.colour,r.speed,r.time]))));
  ok('a seconds field actually ends the effect', await ev(()=>{
    apxCommand('LE1030002');                       // Leia for two seconds
    const d=APX.disp.fld;
    for(let i=0;i<180;i++) leFrame(d);             // 1.8 s — still going
    const during=leSeq(d);
    for(let i=0;i<60;i++) leFrame(d);              // past 2 s
    return during===3 && leSeq(d)===0;
  }));
  ok('HP takes its optional fields and a |seconds suffix', await ev(()=>{
    const r=apxCommand('HPA0025|20');
    return r.ok && r.who==='A' && r.seq===2 && r.colour===5 && r.secs===20;
  }), await ev(()=>JSON.stringify(apxCommand('HPA0025|20'))));
  ok('A is all three holos, X is front and rear', await ev(()=>
    apxCommand('HPA0011').applied===3 && apxCommand('HPX0011').applied===2));
  ok('an HP servo move is reported, not faked into a second servo path', await ev(()=>{
    const r=apxCommand('HPF1000002');
    return r.ok && r.servo===true;
  }));

  console.log('\n════ Jawalite, from a Marcduino ════');
  ok('@1T3 is the front logic on alarm, @2T3 the rear', await ev(()=>{
    const a=apxCommand('@1T3'), b=apxCommand('@2T3');
    return a.targets.join()==='fld' && b.targets.join()==='rld' && a.effect===LE_SEQ.ALARM;
  }));
  ok('the Marcduino numbers the rear logic 2 where LE numbers it 3', await ev(()=>
    apxCommand('@2T1').targets.join()==='rld' && APX.disp.rld.id===3));
  ok('@0P6 puts both PSIs on Leia', await ev(()=>
    apxCommand('@0P6').targets.join()==='fpsi,rpsi'));
  ok('the front logic text is two halves joined by a newline', await ev(()=>{
    apxCommand('@1MTOP'); apxCommand('@2MLOW');
    return APX.disp.fld.text==='TOP\nLOW';
  }), await ev(()=>JSON.stringify(APX.disp.fld.text)));
  ok(':SE01 screams on both logics and says the panels are not ours', await ev(()=>{
    const r=apxCommand(':SE01');
    return r.ok && leSeq(APX.disp.fld)===LE_SEQ.ALARM && leSeq(APX.disp.rld)===LE_SEQ.ALARM;
  }));

  console.log('\n════ the transport — what this build could not have heard ════');
  ok('the standard sketch takes native commands on both doors', await ev(()=>{
    apxSetOption('firmware','standard'); APX.on=true;
    return apxSend('LE0010000',{via:'serial'}).ok && apxSend('LE0010000',{via:'i2c'}).ok;
  }));
  ok('imperial has NO serial command port — the command is never read', await ev(()=>{
    apxSetOption('firmware','imperial'); APX.on=true;
    const s=apxSend('LE0010000',{via:'serial'}), i=apxSend('LE0010000',{via:'i2c'});
    return s.ok===false && /never read/.test(s.why) && i.ok===true;
  }));
  ok('standard-md wants Jawalite, and names the prefix that gets a native command through', await ev(()=>{
    apxSetOption('firmware','standard-md'); APX.on=true;
    const bare=apxSend('LE0010000',{via:'serial'});
    const wrapped=apxSend('*RTLE0010000',{via:'serial'});
    return bare.ok===false && /\*RT/.test(bare.why) && wrapped.ok===true;
  }));
  /* v1.78.0, review M4 — the other direction. `jawa:false` was declared on
     three of the four sketches and read by nobody, so `@1T3` on the Standard
     sketch put the logics on ALARM: a command that sketch has never parsed,
     accepted by the module whose stated purpose is refusing exactly that.
     The wrappers are Marcduino verbs too, so they go the same way. */
  ok('Jawalite is refused by the three sketches with no Marcduino in front of them, and the refusal names the sketch', await ev(()=>{
    apxSetOption('firmware','standard'); apxSetOption('iface','serial'); APX.on=true;
    const a=apxSend('@1T3'), b=apxSend('*RTLE0110000'), c=apxSend(':SE01');
    apxSetOption('firmware','imperial'); apxSetOption('iface','i2c'); APX.on=true;
    const d=apxSend('@1T3');
    apxSetOption('iface','serial'); APX.on=true;
    return a.ok===false && /Standard firmware/.test(a.why) && /Marcduino/.test(a.why) && /LE/.test(a.why) &&
           b.ok===false && c.ok===false &&
           d.ok===false && /Imperial/.test(d.why) && /over i2c/.test(d.why);
  }), await ev(()=>{ apxSetOption('firmware','standard'); APX.on=true; return apxSend('@1T3').why; }));
  ok('...and the same three commands still get through on standard-md', await ev(()=>{
    apxSetOption('firmware','standard-md'); apxSetOption('iface','serial'); APX.on=true;
    return apxSend('@1T3').ok===true && apxSend('*RTLE0110000').ok===true && apxSend(':SE01').ok===true;
  }));
  ok('"not connected" refuses everything and says the boards run their own defaults', await ev(()=>{
    apxSetOption('firmware','standard'); apxSetOption('iface','none'); APX.on=true;
    const r=apxSend('LE0010000');
    return r.ok===false && /not connected/.test(r.why);
  }));
  ok('imperial and R2-KT are the stock sketch with one palette change', await ev(()=>{
    apxSetOption('iface','i2c');
    apxSetOption('firmware','imperial'); APX.on=true;
    const imp={pal:APX.disp.fld.def.pal, hue:APX.disp.fld.def.hue, psi:APX.disp.fpsi.def.pal};
    apxSetOption('firmware','r2kt');
    const kt={pal:APX.disp.fld.def.pal, hue:APX.disp.fld.def.hue};
    return imp.pal===2 && imp.hue===255 && kt.hue===220 && imp.psi===4;
  }));
  await ev(()=>{ apxSetOption('firmware','standard'); apxSetOption('iface','serial'); APX.on=true; });

  console.log('\n════ every effect, on every board shape ════');
  const sweep = await ev(()=>{
    const bad=[];
    for(const boardKey of Object.keys(LE_BOARDS)){
      const spec=Object.assign({},LE_DISPLAYS[0],{board:boardKey});
      const d=leMakeDisplay(spec);
      for(let e=0;e<25;e++){
        leSelectSeq(d,e,4,3,0);
        try{
          for(let i=0;i<400;i++) leFrame(d);
        }catch(err){ bad.push(boardKey+' effect '+e+': '+err.message); continue; }
        for(let i=0;i<d.rgb.length;i++){
          const v=d.rgb[i];
          if(!(v>=0 && v<=255)){ bad.push(boardKey+' effect '+e+' wrote '+v); break; }
        }
      }
    }
    return bad;
  });
  ok('twenty-five effects x six board geometries, no throw and no bad pixel', sweep.length===0, sweep.slice(0,3).join(' | '));
  ok('lights out really is out', await ev(()=>{
    /* On its OWN display, not one of the four the droid is wearing. Against
       APX.disp.fld this failed about one run in three on the distributable
       and never on dev.html — the app's own animation loop is ticking those
       four between one evaluate and the next, and something in that traffic
       beat it. The mechanism was not chased down and this comment does not
       pretend otherwise; what IS true is that the subject of the assertion
       is the effect, not the droid, so a display nothing else touches is the
       right thing to point it at. Deterministic over twenty runs since. */
    const d=leMakeDisplay(LE_DISPLAYS[0]);
    leSelectSeq(d,LE_SEQ.LIGHTSOUT,0,0,0);
    for(let i=0;i<400;i++) leFrame(d);
    for(const v of d.rgb) if(v!==0) return false;
    return true;
  }));
  ok('a 27x4 rear logic still scans vertically — nothing assumes ten rows', await ev(()=>{
    const d=APX.disp.rld;
    leSelectSeq(d,LE_SEQ.VERTICALSCANLINE,4,2,0);
    /* Watched over time, not sampled once: a scan line is a moving column
       and any single frame can catch it mid-wipe. What matters is that it
       visits more than one column and that all four rows light. */
    const cols=new Set(); let rows=0;
    for(let i=0;i<900;i++){
      leFrame(d);
      for(let x=0;x<d.w;x++){
        let lit=0;
        for(let y=0;y<d.h;y++){ const c=leCell(d,x,y); if(c && (c[0]+c[1]+c[2])>0) lit++; }
        if(lit){ cols.add(x); rows=Math.max(rows,lit); }
      }
    }
    return cols.size>2 && rows===d.h;
  }));
  ok('the frame clock is 10 ms quanta, so a slow machine runs the same animation', await ev(()=>{
    const a=leMakeDisplay(LE_DISPLAYS[0]), b=leMakeDisplay(LE_DISPLAYS[0]);
    leSeed(7); leSelectSeq(a,LE_SEQ.MARCH,0,0,0);
    for(let i=0;i<60;i++) leAdvance(a,16.7);       // 60 fps
    const af=a.frames;
    leSeed(7); leSelectSeq(b,LE_SEQ.MARCH,0,0,0);
    for(let i=0;i<25;i++) leAdvance(b,40);         // 25 fps, same second
    return Math.abs(af-b.frames)<=3;
  }), await ev(()=>{
    const a=leMakeDisplay(LE_DISPLAYS[0]); for(let i=0;i<60;i++) leAdvance(a,16.7); return a.frames+' frames';
  }));
  ok('a tab that was in the background does not replay ten minutes at once', await ev(()=>{
    const d=leMakeDisplay(LE_DISPLAYS[0]);
    const n=leAdvance(d, 600000);
    return n<=25;
  }));

  console.log('\n════ the holoprojectors ════');
  ok('a short circuit ends LIT, not dark', await ev(()=>{
    leSeed(3);
    const h=leMakeHolo(LE_HOLOS[0]);
    hpCommand(h,{type:0,seq:7,colour:7,speed:0,secs:0});
    for(let i=0;i<1200;i++) hpFrame(h);
    let lit=0; for(let p=0;p<7;p++){ const c=hpCell(h,p); if(c[0]+c[1]+c[2]>0) lit++; }
    return lit>0;
  }));
  ok('the cycle walks the ring of six and never lights the centre', await ev(()=>{
    leSeed(3);
    const h=leMakeHolo(LE_HOLOS[0]);
    hpCommand(h,{type:0,seq:4,colour:3,speed:0,secs:0});
    const seen=new Set(); let centre=0;
    for(let i=0;i<800;i++){
      hpFrame(h);
      for(let p=0;p<7;p++){ const c=hpCell(h,p); if(c[0]+c[1]+c[2]>0){ if(p===6) centre++; else seen.add(p); } }
    }
    return seen.size===6 && centre===0;
  }));
  ok('an idle holo twitches on its own', await ev(()=>{
    leSeed(11);
    const h=leMakeHolo(LE_HOLOS[1]);
    let fires=0, wasLit=false;
    for(let i=0;i<120000;i++){
      hpFrame(h);
      let lit=false; for(let p=0;p<7;p++){ const c=hpCell(h,p); if(c[0]+c[1]+c[2]>0){ lit=true; break; } }
      if(lit && !wasLit) fires++;
      wasLit=lit;
    }
    return fires>=2 && fires<=40;
  }));

  console.log('\n════ on the droid ════');
  await ev(()=>{ APX.on=true; setCadActive(false); apxSync(); });
  ok('the stand-in gets a rig, and its own sine-wave lights are taken down', await ev(()=>
    LR.hostKey==='proc' && LR.rigs.proc && LR.rigs.proc.parent===R2.dome &&
    R2.logicG.every(g=>!g.visible) && R2.psiG.every(g=>!g.visible)));
  ok('a texture per display, one texel per LED', await ev(()=>{
    const t=LR.tex.rld;
    return t.image.width===27 && t.image.height===4 && t.image.data.length===27*4*4;
  }));
  ok('a PSI corner is transparent, not black — the bezel has to show through', await ev(()=>{
    const d=APX.disp.fpsi;
    leSelectSeq(d,LE_SEQ.SOLIDCOLOR,1,0,0);
    for(let i=0;i<200;i++) leFrame(d);
    d.dirty=true; apxSync();
    const t=LR.tex.fpsi, px=t.image.data;
    return px[3]===0 && px[(2*5+2)*4+3]===255;
  }));
  ok('the display curve lifts the floor without touching the ceiling', await ev(()=>
    LR_CURVE[0]===0 && LR_CURVE[255]===255 && LR_CURVE[18]>50 && LR_CURVE[18]<110));

  const cad = await ev(()=>{
    if(!CAD.loaded) return {skip:true};
    setCadActive(true); apxSync();
    const fit=LR.cadFit;
    const inside=[];
    for(const key of Object.keys(LR_CAD_ANCHOR)) for(const a of LR_CAD_ANCHOR[key]){
      const hp=CAD.header.parts.find(p=>p.name===a.part && p.file==='dome');
      if(!hp){ inside.push(a.part+' missing'); continue; }
      const b=hp.bbox, pad=0.02;
      const g=LR.rigs.cad.children.find(c=>{
        const p=c.position;
        return p.x>b[0]-pad && p.x<b[3]+pad && p.y>b[1]-pad && p.y<b[4]+pad && p.z>b[2]-pad && p.z<b[5]+pad;
      });
      if(!g) inside.push(a.part+' has no panel in its box');
    }
    return {skip:false, host:LR.hostKey, fit:fit, inside:inside,
            panels:LR.rigs.cad.children.filter(c=>!c.userData.holo).length};
  });
  if(cad.skip) console.log('  (the CAD payload did not load — skipping the MK4 anchors)');
  else {
    ok('the MK4 gets its own rig', cad.host==='cad');
    ok('five panels, each on the bearing of the CAD part it is fitted to', cad.panels===5 && cad.inside.length===0,
      cad.inside.join(' | '));
    /* v1.74.1 — the placement RULE, not just the neighbourhood. Every panel
       sits on the fitted shell at its part's bearing, offset by that
       fitting's own `out`: negative for a logic display recessed into the
       dome, positive for a PSI standing on its lens. Anchored to the part's
       centroid instead, the PSIs rendered perfectly and were never seen —
       the model's own 38 mm PSI can was drawn over the top of them. */
    ok('...and at the fitted shell radius, not at the part centroid',
      await ev(()=>{
        const fit=LR.cadFit, bad=[];
        for(const key of Object.keys(LR_CAD_ANCHOR)) for(const a of LR_CAD_ANCHOR[key]){
          const g=LR.rigs.cad.children.find(c=>!c.userData.holo &&
            Math.abs(Math.hypot(c.position.x, c.position.y-fit.y, c.position.z)
                     - (fit.r + a.out)) < 0.0005);
          if(!g) bad.push(a.part);
        }
        return bad.length===0;
      }));
    ok('the dome sphere is fitted to the shell to within a few millimetres',
      cad.fit && cad.fit.rms < 0.012 && cad.fit.r > 0.15 && cad.fit.r < 0.30,
      cad.fit ? ('r='+cad.fit.r.toFixed(4)+' rms='+(cad.fit.rms*1000).toFixed(1)+' mm from '+cad.fit.n+' points') : 'no fit');
    ok('the front logic is drawn as its two real boards, top half and bottom',
      await ev(()=>LR_CAD_ANCHOR.fld.length===2 &&
        LR_CAD_ANCHOR.fld[0].rows[1]===0.5 && LR_CAD_ANCHOR.fld[1].rows[0]===0.5));
  }

  console.log('\n════ the rig lifecycle (v1.78.0, review M3) ════');
  /* The rigs, the fit and the textures were cached with no way out. Three
     symptoms of that one omission, each pinned: the layer going off left both
     rigs parented and visible in front of the stand-in's own fittings; a
     board-variant change kept the old texture, so the next upload wrote a
     20x9 grid at a 9x10 buffer; and (cad.test.js) a model swap re-parented
     the MK4's rig, fit and all, onto whatever dome came next. */
  ok('the layer going off takes the rig OFF the dome — unmounted and freed, not left in front of the stand-in', await ev(()=>{
    APX.on=true; apxSync();
    const rig=LR.rigs[LR.hostKey], host=LR.host;
    const mounted = !!rig && rig.parent===host;
    APX.on=false; apxSync();
    const gone = Object.keys(LR.rigs).length===0 && Object.keys(LR.tex).length===0 &&
                 LR.hostKey==='' && LR.host===null && LR.cadFit===null && rig.parent===null;
    APX.on=true; apxSync();
    const back = !!LR.rigs[LR.hostKey] && LR.rigs[LR.hostKey]!==rig && LR.rigs[LR.hostKey].parent===LR.host;
    return mounted && gone && back;
  }), await ev(()=>{ APX.on=false; apxSync(); const s=Object.keys(LR.rigs).join()+'|'+LR.hostKey; APX.on=true; apxSync(); return 'rigs after off: ['+s+']'; }));
  ok('...and a texture comes back showing the display\'s CURRENT pixels, not black', await ev(()=>{
    /* the pixels are written by hand so nothing here depends on where an
       effect's walk happens to be — SOLIDCOLOR twinkles, a third of it dark */
    const d=APX.disp.fpsi;
    d.rgb.fill(255); d.dirty=true;
    APX.on=true; apxSync();               // uploaded, dirty cleared
    const lit=LR.tex.fpsi.image.data[(2*5+2)*4]===255;
    APX.on=false; apxSync();              // freed
    APX.on=true; apxSync();               // rebuilt — a settled display has not dirtied itself, so the rig has to ask
    const px=LR.tex.fpsi.image.data;
    return lit && px[(2*5+2)*4+3]===255 && px[(2*5+2)*4]===255;
  }));
  ok('a board-variant change re-sizes the texture — the toolbox front logic is 20x9, and the old 9x10 is gone', await ev(()=>{
    APX.on=true; apxSync();
    const before=LR.tex.fld;
    apxSetOption('fldBoard','fldTlbx'); APX.on=true; apxSync();
    const t=LR.tex.fld;
    const swapped = APX.disp.fld.w===20 && !!t && t!==before &&
                    t.image.width===20 && t.image.height===9 && t.image.data.length===20*9*4;
    apxSetOption('fldBoard','fld'); APX.on=true; apxSync();
    return swapped && LR.tex.fld.image.width===9 && LR.tex.fld.image.height===10;
  }), await ev(()=>{ apxSetOption('fldBoard','fldTlbx'); APX.on=true; apxSync(); const s=LR.tex.fld.image.width+'x'+LR.tex.fld.image.height; apxSetOption('fldBoard','fld'); APX.on=true; apxSync(); return 'texture after the change: '+s; }));

  console.log('\n════ the build answer is what turns it on ════');
  ok('a build whose dome lighting is not AstroPixels leaves the stand-in alone', await ev(()=>{
    const b=buildGet(), was=b.domeLights;
    b.domeLights='teeces'; apxInit();
    const off=APX.on;
    apxSync();
    const shown=R2.logicG.every(g=>g.visible);
    b.domeLights=was; apxInit(); APX.on=true; apxSync();
    return off===false && shown===true;
  }));
  /* v1.78.0, review M2 — through the BUILD's door, with no apxInit() by hand.
     That is the wizard's path (config/wizard.js writes domeLights through
     buildSet and nothing else), and it reached the lights only on reload:
     the comment in commands.js promised a re-run on a changed answer that
     no caller made. buildApply() makes it now. */
  ok('buildSet(\'domeLights\') alone re-derives APX.on — the wizard\'s tick reaches the lights without a reload', await ev(()=>{
    APX.on=true;
    buildSet('domeLights','teeces');
    const off=APX.on, offFor=APX.domeLights;
    buildSet('domeLights','astropixels');
    return off===false && offFor==='teeces' && APX.on===true && APX.domeLights==='astropixels';
  }), await ev(()=>{ buildSet('domeLights','teeces'); const s='APX.on after teeces: '+APX.on; buildSet('domeLights','astropixels'); return s; }));
  /* v1.78.0, review L9 — a refusal is not an "ok". */
  ok('a refusal from the pane goes up with the warn edge, not the green one', await ev(()=>{
    apxSetOption('iface','none'); APX.on=true;
    const r=luiSend('LE0010000');
    apxSetOption('iface','serial'); APX.on=true;
    const plate=Array.from(document.querySelectorAll('#toasts .toastp')).find(p=>p.textContent===r.why);
    return r.ok===false && !!plate && plate.classList.contains('warn') && !plate.classList.contains('ok');
  }), await ev(()=>{ const p=document.querySelector('#toasts .toastp'); return p ? p.className : 'no toast'; }));
  ok('every command goes through the same door — no back way in for the pane', await ev(()=>{
    apxSetOption('iface','none'); APX.on=true;
    const before=APX.refused;
    apxEffect(0, LE_SEQ.MARCH, 0, 0, 0);
    apxHolo('A', 3, 5, 0, 0);
    const after=APX.refused;
    apxSetOption('iface','serial'); APX.on=true;
    return after===before+2;
  }));

  ok('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
  console.log('\n'+pass+' passed, '+fail+' failed');
  await browser.close();
  process.exit(fail?1:0);
})();
