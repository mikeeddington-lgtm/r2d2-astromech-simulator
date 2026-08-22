'use strict';
/* =====================================================================
   ASTROPIXELS — the pane you drive them from
   =====================================================================

   Everything here goes out through apxSend(), never straight at a
   display. That is deliberate and it is the point of the pane: a command
   this build's wiring could not carry has to fail HERE, in front of the
   person choosing it, and say why — rather than working beautifully in the
   simulator and doing nothing at all on the dome.

   So picking "Red alert" on a droid whose build says the AstroPixels are
   on a Marcduino will show you the refusal and the `*RT` prefix that fixes
   it. That is a more useful afternoon than watching it work.
   ===================================================================== */

/* The effects worth putting in front of someone, in the order a builder
   thinks of them rather than the order the library numbers them. The rest
   are still reachable — the command box takes anything. */
const LUI_EFFECTS = [
  LE_SEQ.NORMAL, LE_SEQ.ALARM, LE_SEQ.FAILURE, LE_SEQ.LEIA, LE_SEQ.MARCH,
  LE_SEQ.REDALERT, LE_SEQ.SOLIDCOLOR, LE_SEQ.FLASHCOLOR, LE_SEQ.FLIPFLOPCOLOR,
  LE_SEQ.FLIPFLOPALTCOLOR, LE_SEQ.COLORSWAP, LE_SEQ.RAINBOW, LE_SEQ.PULSE,
  LE_SEQ.PSICOLORWIPE, LE_SEQ.FIRE, LE_SEQ.HORIZONTALSCANLINE,
  LE_SEQ.VERTICALSCANLINE, LE_SEQ.ROAMINGPIXEL, LE_SEQ.TEXTSCROLLLEFT,
  LE_SEQ.LIGHTSOUT, LE_SEQ.RANDOM
];
const LUI_HOLO_SEQ = [
  {n:1, label:'Leia'}, {n:2, label:'Colour flicker'}, {n:3, label:'Dim pulse'},
  {n:4, label:'Cycle'}, {n:5, label:'Solid colour'}, {n:6, label:'Rainbow'},
  {n:7, label:'Short circuit'}, {n:14, label:'Off'}
];
/* Four shows worth one click each. These are the command strings a real
   controller sends, spelled exactly as it sends them, so what you read
   here is what you would type into a Marcduino. */
const LUI_PRESETS = [
  {label:'Scream',      cmds:['LE1010003', 'LE3010003', 'HPA0071']},
  {label:'Leia',        cmds:['LE0030000', 'HPA0011|34']},
  {label:'Imperial march', cmds:['LE0040000']},
  {label:'Red alert',   cmds:['LE0110000', 'HPA0051|10']},
  {label:'Lights out',  cmds:['LE0140000', 'HPA0014']},
  {label:'Back to normal', cmds:['LE000000', 'HPA000']}
];

const LUI = {sel:{}, holoSel:{}};

function buildDomeLightsSect(host){
  if(typeof APX === 'undefined') return;
  const fw = apxFirmware();
  const iface = LE_IFACES.find(i => i.id === APX.iface) || LE_IFACES[0];
  const s = sect(host, 'Dome lighting', APX.on ? 'AstroPixels' : 'not simulated');

  /* Why the section might be inert. The build wizard owns this answer, so
     the pane's job is to say which answer is doing it and where to change
     it — not to offer a switch that contradicts the build. */
  if(!APX.on){
    const why = el('div','note cy prose');
    why.innerHTML = '<b>The dome lights are not being simulated.</b> ' +
      'This build\'s <b>Dome lighting</b> answer is not AstroPixels, so the logics and PSIs are running ' +
      'the stand-in\'s own idle blink. Change it on the <b>Setup</b> step and the real LogicEngine effects come on.';
    s.appendChild(why);
    return s;
  }

  /* Which sketch, and which door. These two are NOT build questions: the
     build wizard asks what hardware is in the droid, and both of these are
     facts about the code on it — the same reason the Config tab holds the
     sketch's own constants and nothing else. Changing either is a reflash,
     so it rebuilds the boards and re-runs the boot banner. */
  const rFw = el('div','cfgrow'); rFw.style.gridTemplateColumns = '76px 1fr';
  rFw.appendChild(el('label', null, 'Sketch'));
  const selFw = document.createElement('select'); selFw.className = 'msel';
  for(const f of LE_FIRMWARE){
    const o = document.createElement('option');
    o.value = f.id; o.textContent = f.label; o.title = f.note;
    if(f.id === APX.firmware) o.selected = true;
    selFw.appendChild(o);
  }
  selFw.addEventListener('change', () => {
    apxSetOption('firmware', selFw.value);
    if(typeof lg === 'function') lg('sys', 'AstroPixels → ' + selFw.options[selFw.selectedIndex].textContent);
    buildCadPane();
  });
  rFw.appendChild(selFw); s.appendChild(rFw);

  const rIf = el('div','cfgrow'); rIf.style.gridTemplateColumns = '76px 1fr';
  rIf.appendChild(el('label', null, 'Wired to'));
  const selIf = document.createElement('select'); selIf.className = 'msel';
  for(const i of LE_IFACES){
    const o = document.createElement('option');
    o.value = i.id; o.textContent = i.label; o.title = i.note;
    if(i.id === APX.iface) o.selected = true;
    /* An option the flashed sketch cannot listen on is shown and is still
       choosable — it is a real wiring mistake a builder can make, and the
       point of modelling it is to let him make it here and be told, rather
       than on the bench with a screwdriver in his hand. */
    if(i.id !== 'none' && fw.doors.indexOf(i.id) < 0) o.textContent += '  — this sketch does not listen there';
    selIf.appendChild(o);
  }
  selIf.addEventListener('change', () => {
    apxSetOption('iface', selIf.value);
    buildCadPane();
  });
  rIf.appendChild(selIf); s.appendChild(rIf);

  const head = el('div','hint prose');
  head.innerHTML = '<b>' + fw.label + '</b> over <b>' + xmlEsc(iface.label) + '</b> — ' + xmlEsc(fw.note) + '.';
  s.appendChild(head);

  /* ---- the four displays ---- */
  for(const key of APX.order){
    const d = APX.disp[key];
    const r = el('div','cfgrow'); r.style.gridTemplateColumns = '76px 1fr 62px';
    r.appendChild(el('label', null, d.label));
    const sel = document.createElement('select'); sel.className = 'msel';
    for(const n of LUI_EFFECTS){
      const o = document.createElement('option');
      o.value = n; o.textContent = (n === LE_SEQ.RANDOM ? 'Random' : LE_SEQ_NAME[n]);
      sel.appendChild(o);
    }
    sel.value = String(leSeq(d));
    LUI.sel[key] = sel;
    const col = document.createElement('select'); col.className = 'msel';
    for(let c = 0; c < 10; c++){
      const o = document.createElement('option');
      o.value = c; o.textContent = c === 0 ? 'default' : LE_COLOUR_NAME[c];
      col.appendChild(o);
    }
    const fire = () => luiSend('LE' + d.id +
      (Number(sel.value) < 10 ? '0' + sel.value : sel.value) + col.value + '000');
    sel.addEventListener('change', fire);
    col.addEventListener('change', fire);
    r.appendChild(sel); r.appendChild(col);
    s.appendChild(r);
  }
  /* "All four at once" is logic digit 0, and it is worth its own row
     because it is what nearly every real command uses. */
  const rAll = el('div','cfgrow'); rAll.style.gridTemplateColumns = '76px 1fr 62px';
  rAll.appendChild(el('label', null, 'All four'));
  const selAll = document.createElement('select'); selAll.className = 'msel';
  for(const n of LUI_EFFECTS){
    const o = document.createElement('option');
    o.value = n; o.textContent = (n === LE_SEQ.RANDOM ? 'Random' : LE_SEQ_NAME[n]);
    selAll.appendChild(o);
  }
  const colAll = document.createElement('select'); colAll.className = 'msel';
  for(let c = 0; c < 10; c++){
    const o = document.createElement('option');
    o.value = c; o.textContent = c === 0 ? 'default' : LE_COLOUR_NAME[c];
    colAll.appendChild(o);
  }
  const fireAll = () => luiSend('LE0' +
    (Number(selAll.value) < 10 ? '0' + selAll.value : selAll.value) + colAll.value + '000');
  selAll.addEventListener('change', fireAll);
  colAll.addEventListener('change', fireAll);
  rAll.appendChild(selAll); rAll.appendChild(colAll);
  s.appendChild(rAll);

  /* ---- the holoprojectors ---- */
  const rh = el('div','cfgrow'); rh.style.gridTemplateColumns = '76px 1fr 62px';
  rh.appendChild(el('label', null, 'Holos'));
  const hsel = document.createElement('select'); hsel.className = 'msel';
  for(const o of LUI_HOLO_SEQ){
    const opt = document.createElement('option');
    opt.value = o.n; opt.textContent = o.label; hsel.appendChild(opt);
  }
  const hcol = document.createElement('select'); hcol.className = 'msel';
  /* The holo colour table is NOT the logic one — 2 is yellow here and
     orange there, and 9 is white rather than pink. Spelling out the holo's
     own names is the difference between picking a colour and guessing. */
  const HP_COLOUR = ['random','red','yellow','green','cyan','blue','magenta','orange','purple','white'];
  for(let c = 0; c < 10; c++){
    const o = document.createElement('option');
    o.value = c; o.textContent = HP_COLOUR[c]; hcol.appendChild(o);
  }
  const fireHolo = () => luiSend('HPA00' +
    (Number(hsel.value) < 10 ? '0' + hsel.value : hsel.value) + hcol.value + '0');
  hsel.addEventListener('change', fireHolo);
  hcol.addEventListener('change', fireHolo);
  rh.appendChild(hsel); rh.appendChild(hcol);
  s.appendChild(rh);

  /* ---- one-click shows ---- */
  const bar = el('div','conbar');
  for(const p of LUI_PRESETS){
    const b = el('button','b', p.label);
    b.title = p.cmds.join('  ');
    b.addEventListener('click', () => { for(const c of p.cmds) luiSend(c); });
    bar.appendChild(b);
  }
  s.appendChild(bar);

  /* ---- the command box ---- */
  const rc = el('div','cfgrow'); rc.style.gridTemplateColumns = '76px 1fr';
  rc.appendChild(el('label', null, 'Command'));
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'msel'; inp.placeholder = 'LE0100010  ·  HPA0021|20  ·  @1T3';
  inp.addEventListener('keydown', e => {
    if(e.key !== 'Enter') return;
    e.preventDefault();
    luiSend(inp.value.trim());
    inp.value = '';
  });
  rc.appendChild(inp);
  s.appendChild(rc);

  const out = el('div','hint prose'); out.id = 'luiOut';
  out.innerHTML = luiLastLines();
  s.appendChild(out);

  const note = el('div','note cy prose');
  note.innerHTML = '<b>Effects are re-implemented, not ported.</b> The AstroPixels sketches are a hundred lines of board declarations; ' +
    'every pixel is drawn by the ReelTwo library, which is LGPL against this project\'s MIT. So what runs here was written from the ' +
    'published command grammar and a behavioural specification — the timings, the palettes and the colour walk are the real ones, ' +
    'and the divergences are named in the comments. Treat it as a very good preview, not as the firmware.';
  s.appendChild(note);
  return s;
}

/* One door for every control on the pane, so a refusal is reported the
   same way wherever it came from. */
function luiSend(cmd){
  if(!cmd) return;
  const r = apxSend(cmd);
  const out = $('luiOut');
  if(out) out.innerHTML = luiLastLines();
  if(!r.ok && typeof toast === 'function') toast(r.why);
  else if(r.why && typeof lg === 'function') lg('sys', r.why);
  return r;
}
function luiLastLines(){
  const n = APX.log.slice(-4);
  if(!n.length) return 'Nothing sent yet.';
  return n.map(l => xmlEsc(l)).join('<br>');
}
