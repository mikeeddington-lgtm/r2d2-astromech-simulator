'use strict';
/* ---- the app's two coordinate systems ----
   applyUiScale() (look/theme.js) sets `document.body.style.zoom`, so from
   the body down there are TWO units in play: the LAYOUT px a stylesheet and
   an offsetWidth speak, and the VIEWPORT px getBoundingClientRect(),
   ev.clientX, innerWidth and the glass itself speak. They differ by exactly
   this factor, and every place that mixes one with the other — a drag that
   measures the viewport and writes a CSS length, a popover that positions
   itself from a client rect — is wrong by it. Three of them were.

   Read from the computed style rather than PREFS.uiScale: what is actually
   on the body is the truth, and this is called from splitters.js and
   main.js as well as here (all three load after this file). */
function uiZoomFactor(){
  const z = parseFloat(getComputedStyle(document.body).zoom);
  return (z > 0 && isFinite(z)) ? z : 1;
}

/* ---- console ---- */
const FILT={sab:true,syr:true,pwm:true,pwmf:true,mp3:true,i2c:true,mae:true,sys:true,warn:true};
const FILT_GROUP={pwm:['pwm','pwmf']};
document.querySelectorAll('.conbar button[data-f]').forEach(b=>{
  b.addEventListener('click',()=>{
    const f=b.dataset.f, on=!FILT[f];
    (FILT_GROUP[f]||[f]).forEach(k=>FILT[k]=on);
    b.classList.toggle('act',on); logDirty=true;
  });
});
$('btnClear').addEventListener('click',()=>{ LOG.length=0; logDirty=true; });
function fmtT(ms){ return (ms/1000).toFixed(3).padStart(9,' '); }
function renderConsole(){
  if(!logDirty) return; logDirty=false;
  const c=$('console'); const out=[];
  for(const e of LOG){
    if(FILT[e.k]===false) continue;
    out.push(`<div><span class="t">${fmtT(e.t)}</span> <span class="${e.k}">${e.s.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span></div>`);
  }
  c.innerHTML = out.join('');
  if($('cbAutoscroll').checked) c.scrollTop = c.scrollHeight;
}

/* ---- the fault chip answers "why?" (Stage 3, M5b) ----
   #chFault lights on a fault but used to be display-only, and the full
   log lives in the Serial pane — Advanced view only — so a Simple-view
   user hit a dead end. hud.js keeps its own small ring of the last 12
   warn/sys log lines and clicking the lit chip opens a popover listing
   them, with a door to the Serial tab where the current view offers it.

   The buffer is fed by WRAPPING lg() at runtime rather than editing
   util.js (not this stage's file): lg is a global function binding,
   every module calls it through that global, and hud.js loads after
   util.js (manifest order), so the wrap sees all traffic. Nothing in
   the codebase aliases lg at load time (checked), so no call bypasses
   it. If util.js ever grows an official log hook, this wrap should
   become a subscriber instead. */
const FAULTBUF = [];
const FAULTBUF_MAX = 12;
const _lg = lg;
lg = function(kind, text){
  _lg(kind, text);
  if(kind === 'warn' || kind === 'sys'){
    FAULTBUF.push({t:SIM.millis, k:kind, s:text});
    if(FAULTBUF.length > FAULTBUF_MAX) FAULTBUF.shift();
  }
};

/* Anchored popover, built on demand and REMOVED on close — same
   containment as the stage pickers and the app dialog (HANDOVER §7 /
   AGENTS lessons): dismiss listeners on the DOCUMENT (setPointerCapture
   retargets stage pointer events), Esc on document CAPTURE with
   stopPropagation so it cannot fall through to the wizard, the gamepad
   mapper or click-to-select. */
let FPOP = null;
function faultPopClose(){
  if(!FPOP) return;
  document.removeEventListener('pointerdown', FPOP.onDown, true);
  document.removeEventListener('keydown', FPOP.onKey, true);
  FPOP.pop.remove();
  FPOP = null;
}
function faultPopOpen(){
  if(FPOP){ faultPopClose(); return; }             // second click folds it away
  const chip = $('chFault');
  const pop = el('div'); pop.id = 'faultPop';
  pop.appendChild(el('div','fph', (chip.lastElementChild.textContent || 'fault') + ' — recent log'));
  if(!FAULTBUF.length){
    pop.appendChild(el('div','fpempty','nothing logged yet — the sketch has not complained'));
  }
  FAULTBUF.forEach(e=>{
    const row = el('div','fprow' + (e.k === 'warn' ? ' warn' : ''));
    row.appendChild(el('span','t',(e.t/1000).toFixed(3) + ' s'));
    row.appendChild(el('span','s',e.s));
    pop.appendChild(row);
  });
  /* the whole story lives in the Serial pane — offered only when the
     current view actually has that pane, so the row never dead-ends */
  if(typeof viewShows === 'function' && viewShows('pCon')){
    const b = el('button','fpser','open Serial →');
    b.title = 'the full log, with filters';
    b.addEventListener('click',()=>{
      faultPopClose();
      const t = document.querySelector('#tabs button[data-p="pCon"]');
      if(t) t.click();
    });
    pop.appendChild(b);
  }
  document.body.appendChild(pop);
  /* THE ANCHOR IS IN VIEWPORT px, THE `left`/`top` WE WRITE ARE NOT.
     #faultPop is position:fixed but it hangs off the body, which carries
     the ui-scale zoom, so a length set on it is a LAYOUT px and gets
     multiplied by the zoom on its way to the glass. getBoundingClientRect()
     and innerWidth are already on the glass. At 150% that mismatch put this
     panel 200px below the chip it belongs to and a third of a screen to the
     right — and the innerWidth clamp could not save it, because the clamp
     was in the other unit system. Divide the anchor back into layout px and
     everything, clamp included, is in one space. */
  const z = uiZoomFactor();
  const r = chip.getBoundingClientRect();
  pop.style.top  = (r.bottom/z + 6) + 'px';
  pop.style.left = Math.max(8, Math.min(innerWidth/z - pop.offsetWidth - 8, r.left/z - 10)) + 'px';
  const onDown = e=>{
    const t = e.target;
    if(t && t.closest && (t.closest('#faultPop') || t.closest('#chFault'))) return;
    faultPopClose();
  };
  const onKey = e=>{
    if(e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    faultPopClose();
  };
  /* click fires after pointerup, so the opening gesture cannot re-enter */
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  FPOP = { pop, onDown, onKey };
}
$('chFault').addEventListener('click', faultPopOpen);

/* CHANGE 2 (2026-08-15, UX item 1.5a) — the DRIVE OFF/ON chip becomes a
   button. Goes through virtualPress() (input/pad-ui.js) — the same
   INPUT.virtual.btn path a real on-screen START tap uses — so the sketch
   sees a genuine button edge and handles its own arm/disarm bookkeeping
   (LEDs, the arm/disarm sound, the Serial line) exactly as it would for
   any other START press. Rendering is otherwise untouched — still no
   border, no plate (chrome.test.js) — just the pointer cursor
   (02-layout.css) and this title say it takes a click. The title is
   fixed rather than mirroring the chip's own text: main.js's
   syncChipTitles() leaves chDrive out of CHIP_IDS for exactly that
   reason. */
if($('chDrive')){
  $('chDrive').title = 'arm / disarm the foot motors (START)';
  $('chDrive').addEventListener('click', ()=>{
    if(typeof virtualPress === 'function') virtualPress('START');
  });
}

/* ---- header + hud ---- */
function chip(id, state, text){
  const e=$(id); e.className='chip'+(state?' '+state:'');
  e.lastElementChild.textContent=text;
}
function updateHUD(){
  chip('chGamepad', INPUT.forceDisconnect?'bad':(INPUT.gpIndex!==null?'on':'warn'),
       INPUT.forceDisconnect?'Disconnected — click':(INPUT.gpIndex!==null?'Pad '+(INPUT.gpName||'').slice(0,12):'Virtual pad'));
  chip('chDrive', FW.isDriveEnabled?'on':'', FW.isDriveEnabled?'Drive armed':'Drive off');
  chip('chAuto',  FW.isInAutomationMode?'warn':'', FW.isInAutomationMode?'Auto on':'Auto off');
  const si = FW.drivespeed===CFG.DRIVESPEED1?1:FW.drivespeed===CFG.DRIVESPEED2?2:3;
  chip('chSpeed', FW.isDriveEnabled?'on':'', 'Spd '+si+' · '+FW.drivespeed+(FW.CalibrationMode?' CAL':''));
  chip('chHP', FW.isHPOn?'on':'', FW.isHPOn?'HP on':'HP off');

  // fault chip: watchdog timeout or a blocking delay()
  const blocked = SIM.millis < SIM.blockUntil;
  const starved = !PROFILE.footPWM() && MOT.driveTO && MOT.drive!==0;
  const f=$('chFault');
  if(blocked || starved){
    f.style.display='';
    f.className='chip bad';
    f.lastElementChild.textContent = blocked ? 'LOOP BLOCKED · delay(750)' : 'S/T TIMEOUT · watchdog';
  } else f.style.display='none';

  const setBar=(bid,vid,val,max,cls)=>{
    const b=$(bid), v=$(vid);
    const p=clamp(val/max,-1,1);
    b.style.left = p<0 ? (50+p*50)+'%' : '50%';
    b.style.width = Math.abs(p)*50+'%';
    v.textContent = val; v.className='v'+(cls||'');
  };
  if(PROFILE.footPWM()){
    setBar('bDrive','vDrive',MOT.leftFoot-90,90, FW.isDriveEnabled?'':' am');
    setBar('bTurn','vTurn',MOT.rightFoot-90,90, FW.isDriveEnabled?'':' am');
    $('vDrive').previousElementSibling.previousElementSibling.textContent='L foot';
    $('vTurn').previousElementSibling.previousElementSibling.textContent='R foot';
  }else{
    setBar('bDrive','vDrive',MOT.drive,127, MOT.driveTO&&MOT.drive!==0?' rd':(FW.isDriveEnabled?'':' am'));
    setBar('bTurn','vTurn',MOT.turn,127,  MOT.driveTO&&MOT.turn!==0?' rd':(FW.isDriveEnabled?'':' am'));
    $('vDrive').previousElementSibling.previousElementSibling.textContent='Drive';
    $('vTurn').previousElementSibling.previousElementSibling.textContent='Turn';
  }
  setBar('bDome','vDome',MOT.dome,127, MOT.domeTO&&MOT.dome!==0?' rd':'');
  $('vLoop').textContent = SIM.hz+' Hz';
  $('vUp').textContent = (SIM.millis/1000).toFixed(1)+' s';
  $('vVol').textContent = CFG.vol;

  /* While the mouse has the sticks the Drive/Turn bars honestly read zero —
     that IS what the sketch is seeing — so the vehicle needs its own line or
     there is no feedback at all that you are moving. */
  const hm = $('hudMouse');
  if(hm){
    const on = (typeof mouseIsDriving === 'function') && mouseIsDriving();
    hm.style.display = on ? '' : 'none';
    if(on){
      const kph = MOUSE.speed*3.6, deg = MOUSE.steer*180/Math.PI;
      const fold = ((MOUSE.yaw - MOUSE.chYaw)*180/Math.PI + 540) % 360 - 180;
      hm.innerHTML = '<b>POLAR MOUSE</b> &nbsp; '
        + (MOUSE.speed>=0?'▲':'▼') + ' ' + Math.abs(kph).toFixed(1) + ' km/h &nbsp;·&nbsp; '
        + 'steer ' + (deg>=0?'L':'R') + Math.abs(deg).toFixed(0) + '° &nbsp;·&nbsp; '
        + 'chariot ' + (Math.abs(fold)>85 ? '<span style="color:var(--rd)">JACK-KNIFED</span>'
                                          : Math.abs(fold).toFixed(0)+'°')
        + '<br><span style="opacity:.7">left stick: up/down throttle · left/right steering — the sketch sees them centred</span>';
    }
  }

  const on = (SIM.millis-SND.at) < 1600 && SND.track>0;
  $('sndBox').classList.toggle('on',on);
  $('sndNum').classList.toggle('on',on);
  $('sndNum').textContent = SND.track? String(SND.track).padStart(2,'0') : '--';
  $('sndDesc').textContent = SND.track? trackDesc(SND.track) : 'idle';
  $('sndVol').textContent = CFG.vol;

  if(typeof syncGridBtn === 'function') syncGridBtn();
}

/* ---- on-screen pad mirroring ---- */
const PADIDS={UP:'b_UP',DOWN:'b_DOWN',LEFT:'b_LEFT',RIGHT:'b_RIGHT',A:'b_A',B:'b_B',X:'b_X',Y:'b_Y',
  L1:'b_LB',R1:'b_RB',L2:'b_LT',R2:'b_RT',START:'b_START',BACK:'b_BACK',XBOX:'b_XBOX'};
function updatePad(){
  for(const n in PADIDS){ const e=$(PADIDS[n]); if(e) e.classList.toggle('on', XB.press[n]>0); }
  $('f_LT').setAttribute('width', (XB.press.L2/255*72).toFixed(1));
  $('f_RT').setAttribute('width', (XB.press.R2/255*72).toFixed(1));
  const MAXR=27, sl=$('s_L'), sr=$('s_R');
  sl.setAttribute('cx', 158 + (XB.hat.LeftHatX/32767)*MAXR);
  sl.setAttribute('cy', 146 - (XB.hat.LeftHatY/32767)*MAXR);
  sr.setAttribute('cx', 406 + (XB.hat.RightHatX/32767)*MAXR);
  sr.setAttribute('cy', 204 - (XB.hat.RightHatY/32767)*MAXR);
  sl.classList.toggle('on', XB.press.L3>0);
  sr.classList.toggle('on', XB.press.R3>0);
  const leds=[$('led1'),$('led2'),$('led3'),$('led4')];
  if(!XB.receiverConnected) leds.forEach(l=>l.classList.remove('on'));
  else if(XB.ledMode==='ROTATING'){ const k=Math.floor(SIM.millis/220)%4; leds.forEach((l,i)=>l.classList.toggle('on',i===k)); }
  else leds.forEach((l,i)=>l.classList.toggle('on',(i+1)===XB.ledOn));
}

/* ---- stage buttons ---- */
function syncFollowBtn(){ $('btnFollow').classList.toggle('act',CAM.follow); }
$('btnFollow').addEventListener('click',()=>{ CAM.follow=!CAM.follow; syncFollowBtn(); });
/* `act` means THE FEATURE IS ON, everywhere in this app — syncFollowBtn two
   lines up is the model. This one was negated, so the grid started visible
   with an unlit button and the first click hid the grid and lit it: the
   button said the opposite of the stage in both states.

   It is also SYNCED, not just toggled, and from updateHUD() rather than only
   from the click. envApply() (scene/env.js) turns the grid off for every
   non-studio environment and back on for studio, and it knows nothing about
   this button; syncing on the UI tick means picking Workshop or Desert
   cannot leave the two disagreeing, without a hand-off into a file this
   change does not own. It is one classList.toggle against a boolean. */
function syncGridBtn(){ const b=$('btnGrid'); if(b && typeof grid!=='undefined' && grid) b.classList.toggle('act', !!grid.visible); }
$('btnGrid').addEventListener('click',()=>{
  grid.visible=!grid.visible;
  if(typeof ENV!=='undefined') ENV.gridWanted = grid.visible;   // survives an environment switch
  syncGridBtn();
});
$('btnReset').addEventListener('click',()=>{ R2.pos.set(0,0,0); R2.yaw=0; R2.domeYaw=0; CAM.target.set(0,0.6,0);
  if(typeof anzResetPose==='function') anzResetPose();
  if(typeof mouseResetPose==='function') mouseResetPose();
  lg('sys','sim: droid pose reset'); });
