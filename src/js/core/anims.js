'use strict';
const ANIMS = {
  none:         {label:'— nothing —', dur:0,    steps:[]},
  pies_open:    {label:'Dome pies open',         dur:760,  steps:(()=>{const s=[];for(let i=0;i<12;i++)s.push([i*55,'pie'+i,1]);return s;})()},
  pies_close:   {label:'Dome pies close',        dur:760,  steps:(()=>{const s=[];for(let i=11;i>=0;i--)s.push([(11-i)*55,'pie'+i,0]);return s;})()},
  pies_wave:    {label:'Dome pie wave',          dur:2000, steps:(()=>{const s=[];for(let i=0;i<12;i++){s.push([i*70,'pie'+i,1]);s.push([900+i*70,'pie'+i,0]);}return s;})()},
  panels_open:  {label:'Dome side panels open',  dur:900,  steps:(()=>{const s=[];for(let i=0;i<14;i++)s.push([i*55,'panel'+i,1]);return s;})()},
  panels_close: {label:'Dome side panels close', dur:900,  steps:(()=>{const s=[];for(let i=13;i>=0;i--)s.push([(13-i)*55,'panel'+i,0]);return s;})()},
  dome_open:    {label:'Whole dome open',        dur:1700, steps:(()=>{
                    const s=[];
                    for(let i=0;i<12;i++) s.push([i*55,'pie'+i,1]);
                    for(let i=0;i<14;i++) s.push([700+i*55,'panel'+i,1]);
                    return s; })()},
  dome_close:   {label:'Whole dome close',       dur:1700, steps:(()=>{
                    const s=[];
                    for(let i=13;i>=0;i--) s.push([(13-i)*55,'panel'+i,0]);
                    for(let i=11;i>=0;i--) s.push([800+(11-i)*55,'pie'+i,0]);
                    return s; })()},
  dome_wave:    {label:'Dome ripple (pies + sides)', dur:3000, steps:(()=>{
                    const s=[];
                    for(let i=0;i<12;i++){ s.push([i*90,'pie'+i,1]); s.push([760+i*90,'pie'+i,0]); }
                    for(let i=0;i<14;i++){ s.push([1500+i*75,'panel'+i,1]); s.push([2200+i*75,'panel'+i,0]); }
                    return s; })()},
  dome_flutter: {label:'Dome flutter (alarm)',   dur:2200, steps:(()=>{
                    const s=[]; let t=0;
                    for(let r=0;r<4;r++){
                      for(let i=0;i<12;i++) s.push([t, 'pie'+i, r%2 ? 0 : 1]);
                      t += 260;
                    }
                    for(let i=0;i<12;i++) s.push([t,'pie'+i,0]);
                    return s; })()},
  utils_out:    {label:'Utility arms out',      dur:800,  steps:[[0,'utilUp',1],[120,'utilLo',1]]},
  utils_in:     {label:'Utility arms in',       dur:800,  steps:[[0,'utilLo',0],[120,'utilUp',0]]},
  dataport_open:{label:'Dataport door open',    dur:500,  steps:[[0,'dataport',1]]},
  dataport_close:{label:'Dataport door close',  dur:500,  steps:[[0,'dataport',0]]},
  charge_open:  {label:'Chargebay door open',   dur:500,  steps:[[0,'chargebay',1]]},
  charge_close: {label:'Chargebay door close',  dur:500,  steps:[[0,'chargebay',0]]},
  front_doors_open: {label:'Front doors open',  dur:900,  steps:[[0,'doorL',1],[150,'doorR',1]]},
  front_doors_close:{label:'Front doors close', dur:900,  steps:[[0,'doorR',0],[150,'doorL',0]]},
  doors_open:   {label:'All body doors open',   dur:1400, steps:[
                    [0,'doorL',1],[130,'doorR',1],[280,'doorRL',1],[410,'doorRR',1],[560,'smallDoor',1]]},
  doors_close:  {label:'All body doors close',  dur:1400, steps:[
                    [0,'smallDoor',0],[150,'doorRR',0],[280,'doorRL',0],[410,'doorR',0],[540,'doorL',0]]},
  ports_open:   {label:'Dataport + chargebay open',  dur:800, steps:[[0,'dataport',1],[190,'chargebay',1]]},
  ports_close:  {label:'Dataport + chargebay close', dur:800, steps:[[0,'chargebay',0],[190,'dataport',0]]},
  /* v1.45.0 — these two were the only pie animations that stopped at 11 while
     every other one covers PIE_COUNT (12), so "Everything close" left pie11
     standing open in the Outputs table for the rest of the session. One count,
     from actuators.js, for all of them. (pie11 drives nothing on either model:
     the procedural dome has 11 panels and the MK4 CAD rigs 5 — it exists as an
     actuator so a channel wired to it can still be named and sequenced, the
     same reason the holoprojector axes are in ACT_KEYS.) */
  all_open:     {label:'Everything open',  dur:3000, steps:(()=>{
                    const s=[[0,'doorL',1],[120,'doorR',1],[240,'doorRL',1],[360,'doorRR',1],
                             [500,'smallDoor',1],[640,'dataport',1],[760,'chargebay',1],
                             [900,'utilUp',1],[1020,'utilLo',1],[1160,'drawer',1]];
                    for(let i=0;i<PIE_COUNT;i++) s.push([1300+i*70,'pie'+i,1]);
                    return s; })()},
  all_close:    {label:'Everything close', dur:3000, steps:(()=>{
                    const s=[];
                    for(let i=PIE_COUNT-1;i>=0;i--) s.push([(PIE_COUNT-1-i)*70,'pie'+i,0]);
                    s.push([820,'drawer',0],[940,'utilLo',0],[1060,'utilUp',0],
                           [1200,'chargebay',0],[1320,'dataport',0],[1460,'smallDoor',0],
                           [1600,'doorRR',0],[1720,'doorRL',0],[1840,'doorR',0],[1960,'doorL',0]);
                    return s; })()},
  grip_seq:     {label:'Gripper arm sequence',  dur:4200, steps:[
                    [0,'doorR',1],[600,'gripArm',1],[1500,'claw',1],[1900,'claw',0],
                    [2300,'claw',1],[2700,'claw',0],[3100,'gripArm',0],[3900,'doorR',0]]},
  inter_seq:    {label:'Interface arm sequence',dur:4200, steps:[
                    [0,'doorL',1],[600,'interArm',1],[1500,'interTool',1],[2600,'interTool',0],
                    [3100,'interArm',0],[3900,'doorL',0]]},

  /* ---- Anzellan head (see scene/anzellan.js). These fire against the same
     ACT_T targets as everything else, so a Maestro slot can drive the face
     exactly the way it drives a dome panel. The bipolar channels rest at
     0.5, so every one of these ENDS on the rest pose rather than at zero —
     a face left at 0 is a face staring at the floor with its eyes shut. */
  frik_talk:    {label:'Frik: talk',      dur:2600, steps:(()=>{
                    const s=[]; let t=0;
                    for(let i=0;i<9;i++){
                      s.push([t,'anzJaw', i%2 ? 0.06 : 0.55 + (i%3)*0.12]);
                      s.push([t,'anzLipU', i%2 ? 0.30 : 0.62]);
                      t += 190 + (i%3)*45;
                    }
                    s.push([t,'anzJaw',0],[t,'anzLipU',0.30],[t,'anzBrowL',0.60],[t,'anzBrowR',0.60]);
                    s.push([t+320,'anzBrowL',0.35],[t+320,'anzBrowR',0.35]);
                    return s; })()},
  frik_blink:   {label:'Frik: blink',     dur:700,  steps:[[0,'anzLids',1],[110,'anzLids',0.10],
                                                          [330,'anzLids',1],[440,'anzLids',0.10]]},
  frik_look_left:  {label:'Frik: look left',  dur:1500, steps:[
                    [0,'anzEyeX',0.06],[220,'anzPan',0.20],[900,'anzEyeX',0.5],[1050,'anzPan',0.5]]},
  frik_look_right: {label:'Frik: look right', dur:1500, steps:[
                    [0,'anzEyeX',0.94],[220,'anzPan',0.80],[900,'anzEyeX',0.5],[1050,'anzPan',0.5]]},
  frik_surprise:{label:'Frik: surprise',  dur:1800, steps:[
                    [0,'anzLids',0],[0,'anzBrowL',1],[0,'anzBrowR',1],[60,'anzJaw',0.85],
                    [80,'anzNod',0.30],[700,'anzJaw',0.20],[900,'anzLids',0.10],
                    [1100,'anzBrowL',0.35],[1100,'anzBrowR',0.35],[1200,'anzJaw',0],[1200,'anzNod',0.5]]},
  frik_grumble: {label:'Frik: grumble',   dur:2200, steps:[
                    [0,'anzBrowL',0],[0,'anzBrowR',0],[0,'anzLids',0.45],[0,'anzLipL',0.85],
                    [200,'anzTilt',0.30],[420,'anzJaw',0.22],[620,'anzJaw',0.04],
                    [840,'anzJaw',0.26],[1040,'anzJaw',0.00],[1300,'anzTilt',0.68],
                    [1700,'anzTilt',0.5],[1700,'anzLipL',0.30],[1800,'anzBrowL',0.35],
                    [1800,'anzBrowR',0.35],[1800,'anzLids',0.10]]},
  frik_nod_yes: {label:'Frik: nod yes',   dur:1600, steps:[
                    [0,'anzNod',0.86],[280,'anzNod',0.24],[560,'anzNod',0.82],
                    [840,'anzNod',0.28],[1120,'anzNod',0.5],[0,'anzBrowL',0.62],[0,'anzBrowR',0.62],
                    [1120,'anzBrowL',0.35],[1120,'anzBrowR',0.35]]},
  frik_shake_no:{label:'Frik: shake no',  dur:1600, steps:[
                    [0,'anzPan',0.16],[300,'anzPan',0.84],[600,'anzPan',0.18],
                    [900,'anzPan',0.82],[1200,'anzPan',0.5],[0,'anzBrowL',0.08],[0,'anzBrowR',0.08],
                    [1200,'anzBrowL',0.35],[1200,'anzBrowR',0.35]]}
};
const ANIM_IDS = Object.keys(ANIMS);
