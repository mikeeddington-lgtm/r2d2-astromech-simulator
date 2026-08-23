'use strict';
/* ---------------------------------------------------------------------
   PAINT SECTIONS — reusable

   These used to be the whole startup screen. Since the setup wizard
   landed they are section builders instead, so the same markup can appear
   both as a wizard step and as a section in the Config tab without being
   written twice. `buildStartup()` now lives in config/wizard.js.
   --------------------------------------------------------------------- */

/* scheme buttons + one colour picker per role */
function paintSchemeSect(host, redraw){
  const s1 = sect(host, 'Paint scheme');
  const row = el('div','conbar');
  Object.keys(PAINT_SCHEMES).forEach(k=>{
    const b = el('button','b'+(PAINT.scheme===k?' act':''), PAINT_SCHEMES[k].label);
    b.addEventListener('click',()=>{ setScheme(k); if(redraw) redraw(); if(typeof buildPaintPane==='function') buildPaintPane(); });
    row.appendChild(b);
  });
  s1.appendChild(row);

  const grid = el('div','swgrid');
  PAINT_ROLES.forEach(r=>{
    const cell = el('div','swcell');
    const inp = document.createElement('input');
    inp.type='color'; inp.value = PAINT.colors[r.key] || '#ffffff';
    inp.addEventListener('input',()=>{ setRoleColor(r.key, inp.value); });
    const lab = el('div','swlab', r.label);
    const hint = el('div','swhint', r.hint);
    cell.appendChild(inp); cell.appendChild(lab); cell.appendChild(hint);
    grid.appendChild(cell);
  });
  s1.appendChild(grid);
  const h1 = el('div','hint');
  h1.innerHTML = 'The droid behind you repaints as you go. Roles are assigned by what a part <i>is</i> rather than by its Fusion material — the MK4 exports one <b>Steel_-_Satin</b> across the dome skin, the legs and most of the greebles, so painting by material alone would make the dome grey.';
  s1.appendChild(h1);
  return s1;
}

/* the per-slot override list, collapsed by default */
function paintSlotSect(host, redraw){
  const slots = (typeof CAD!=='undefined' && CAD.slots) ? CAD.slots.slice().sort((a,b)=>b.parts-a.parts) : [];
  if(!slots.length) return null;
  const s1b = sect(host, 'Which parts take which role', slots.length+' groups in this model');
  const listWrap = el('div');
  listWrap.style.display = PAINT.advOpen ? 'block' : 'none';
  const bAdv = el('button','b'+(PAINT.advOpen?' act':''), PAINT.advOpen?'Hide the list':'Show the list');
  bAdv.addEventListener('click',()=>{ PAINT.advOpen = !PAINT.advOpen; if(redraw) redraw(); });
  const advBar = el('div','conbar'); advBar.appendChild(bAdv);
  s1b.appendChild(advBar);
  s1b.appendChild(listWrap);
  slots.forEach(sl=>{
    const r = el('div','maerow wide');
    r.style.gridTemplateColumns = '1fr 118px 44px';
    const nm = el('div','cn', sl.kind + ' · ' + sl.file + '  ' + sl.matName);
    nm.title = sl.parts+' part(s), Fusion material '+sl.matName;
    r.appendChild(nm);
    const sel = document.createElement('select');
    PAINT_ROLES.concat([{key:'glass',label:'Lens (unpainted)'}]).forEach(role=>{
      const o=document.createElement('option'); o.value=role.key; o.textContent=role.label;
      if(PAINT.roleOf[sl.key]===role.key) o.selected=true; sel.appendChild(o);
    });
    sel.addEventListener('change',()=>setSlotRole(sl.key, sel.value));
    r.appendChild(sel);
    r.appendChild(el('div','mv', sl.parts+'p'));
    listWrap.appendChild(r);
  });
  const hb = el('div','hint');
  hb.innerHTML = 'Only worth opening if a guess is wrong for your build — say you are leaving the shoulders bare metal rather than painting them. Each row is one group of parts sharing a Fusion material.';
  listWrap.appendChild(hb);
  return s1b;
}

/* the six user colour slots */
function favColorsSect(host){
  const sF = sect(host, 'Favourite colours', 'yours, everywhere a colour is picked');
  const fRow = el('div','conbar');
  favGet().forEach((hex,i)=>{
    const inp = document.createElement('input');
    inp.type='color'; inp.value=hex; inp.className='favedit';
    inp.title='Favourite '+(i+1);
    inp.addEventListener('input',()=>favSet(i, inp.value));
    fRow.appendChild(inp);
  });
  sF.appendChild(fRow);
  const hF = el('div','hint');
  hF.innerHTML = 'These six show up on every part card — one click to paint. Metal swatches (chrome, gold, aluminium…) are there too, and the <b>Fusion (as modelled)</b> scheme above restores the original colours that came in with your OBJ export.';
  sF.appendChild(hF);
  return sF;
}


/* The setup wizard is THE place the droid is configured (§3), so this is
   the other door sim only has to close at the function rather than at the
   button: #btnSetup is hidden in kiosk mode, but openStartup() is one call
   from anywhere and the wizard would come up over the public's stage. */
function openStartup(){
  if(typeof kioskOn === 'function' && kioskOn()){
    if(typeof toast === 'function') toast('sim only — leave it first to get at the setup','warn');
    return;
  }
  wizOpen();
}
function closeStartup(){
  /* the Sound step borrows the real sound card; give it back before the
     overlay goes, or the live readout spends the rest of the session
     painting into a node nobody can see (core/soundbank.js) */
  if(typeof soundCardPark === 'function') soundCardPark();
  $('startup').classList.remove('on');
  if(typeof wizSplit === 'function') wizSplit(false);   // put the app layout back
  PREFS.seenStartup = true;
  prefsSave();
}
