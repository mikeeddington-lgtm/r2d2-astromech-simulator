'use strict';
/* =====================================================================
   ASTROPIXELS — the boards, the palettes and the colour maths
   =====================================================================

   Mike, 2026-08-22: "this is the astropixels code can we use it to build
   the lighting systems?" — https://github.com/dpoulson/Astropixels

   The answer turned out to be "yes, but not the code". That repository is
   six main.cpp files of thirty to a hundred lines; they declare boards and
   pins and nothing else. Every pixel the dome actually lights is drawn by
   Darren Poulson's fork of the ReelTwo library, whose LogicEngine.h alone
   is 3,240 lines — and it is LGPL-2.1, with the Astropixels documentation
   GPL-3, against this project's MIT (scoped — see CREDITS.md).

   So NOTHING here is copied. What we took is the published, documented
   BEHAVIOUR: the command grammar off r2djp.gitbook.io/astropixels, the
   board geometries, the six palettes' key colours, and FastLED's
   `hsv2rgb_rainbow`, all re-implemented from a written specification.
   That is the difference between a clean-room re-implementation and a
   derivative work, and it is why this file describes the maths in prose
   before it states it in code: the prose is the provenance.

   ------------------------------------------------------------ the boards

   An AstroPixel display is a rectangular matrix of WS2812Bs wired as a
   serpentine, and the LED MAP is the table that turns "row 3, column 5"
   into "the 41st LED on the strip". Every published map is a plain
   boustrophedon — every other row (or column) runs backwards — so we
   GENERATE them rather than transcribing tables, and `tests/lights.test.js`
   asserts the generated maps against spot values read off the real ones.

   A generated map cannot drift from a board that was rewired. A copied one
   cannot be checked at all.

   ------------------------------------------------------------ the colours

   The board never stores RGB. It stores a 46-entry HSV ramp built from
   four key colours, and every pixel is a position in a 90-state ping-pong
   walk along it (engine.js). Two things about that ramp are not obvious
   and are the whole reason the real thing looks the way it does:

     · the tween step is INTEGER, so the ramp never quite reaches the next
       key — there is a small jump at every key boundary; and
     · palette 2's first fifteen entries are all V=0, so a third of the
       walk is spent dark. That is the twinkle. A smooth ramp looks wrong.

   Keep both. They are not bugs to tidy up on the way past.
   ===================================================================== */

/* ---------------------------------------------------------------- 8-bit
   FastLED's fixed-point helpers. scale8 is a multiply that keeps 255 as
   unity; map8 rescales 0..255 into lo..hi — and note that (hi-lo) is BYTE
   arithmetic, so map8(v, 1, 0) underflows to scale8(v,255)+1 = v+1 rather
   than 0. Ten effects do exactly that ("set brightness 0, recalculate"),
   and on the real board it makes the ramp one step BRIGHTER, not black.
   We keep the underflow: it is what the dome does. */
const lScale8 = (i, s) => ((i * (1 + (s & 0xFF))) >> 8) & 0xFF;
const lScale8v = (i, s) => (((i * s) >> 8) + ((i && s) ? 1 : 0)) & 0xFF;
const lMap8 = (v, lo, hi) => (lScale8(v, (hi - lo) & 0xFF) + lo) & 0xFF;

/* hsv2rgb_rainbow — FastLED's, not a textbook HSV. The difference is
   visible: a textbook conversion gives a green-biased yellow and a flat
   blue→purple region, and the logics look plasticky. Eight sectors of 32
   hues each, with the thirds interpolated in 8-bit.

   The value is applied through scale8_video(val,val) — squared — so the
   bottom of the ramp is far darker than a linear reading suggests. That
   quadratic is why V=1..20 reads as "nearly off" rather than "dim". */
function lHsv2rgb(h, s, v){
  h &= 0xFF; s &= 0xFF; v &= 0xFF;
  const offset8 = (h & 0x1F) << 3;
  const third = lScale8(offset8, 85);
  const two3 = lScale8(offset8, 170);
  let r, g, b;
  switch(h >> 5){
    case 0: r = 255 - third;  g = third;         b = 0;            break;
    case 1: r = 171;          g = 85 + third;    b = 0;            break;
    case 2: r = 171 - two3;   g = 170 + third;   b = 0;            break;
    case 3: r = 0;            g = 255 - third;   b = third;        break;
    case 4: r = 0;            g = 171 - two3;    b = 85 + two3;    break;
    case 5: r = third;        g = 0;             b = 255 - third;  break;
    case 6: r = 85 + third;   g = 0;             b = 171 - third;  break;
    default:r = 170 + third;  g = 0;             b = 85 - third;   break;
  }
  if(s !== 255){
    if(s === 0){ r = 255; g = 255; b = 255; }
    else {
      if(r) r = lScale8(r, s);
      if(g) g = lScale8(g, s);
      if(b) b = lScale8(b, s);
      const floor = lScale8(255 - s, 255 - s);
      r += floor; g += floor; b += floor;
    }
  }
  if(v !== 255){
    v = lScale8v(v, v);
    if(v === 0){ r = 0; g = 0; b = 0; }
    else {
      if(r) r = lScale8(r, v);
      if(g) g = lScale8(g, v);
      if(b) b = lScale8(b, v);
    }
  }
  return [r & 0xFF, g & 0xFF, b & 0xFF];
}

/* --------------------------------------------------------- the palettes
   Six sets of four key HSV colours. 0 and 1 are the stock front and rear
   logic looks; 2 (monotone) is what almost every commanded effect switches
   to, because an effect that wants ONE colour gets it by running a
   black→saturated ramp and then shifting the hue on the way out. 4 and 5
   are the PSI defaults. Documented on the Changing Colours page. */
const LE_PAL = [
  [[170,255,  0],[170,255, 85],[170,255,170],[170,  0,170]],  // 0 front logic
  [[ 90,235,  0],[ 75,255,250],[ 30,255,184],[  0,255,250]],  // 1 rear logic
  [[  0,255,  0],[  0,255,  0],[  0,255,100],[  0,255,250]],  // 2 monotone
  [[  0,255,  0],[  0,255,250],[ 40,255,  0],[ 40,255,250]],  // 3 red + yellow
  [[165, 50,248],[166,181,226],[165,223, 89],[255,255,214]],  // 4 blue + red
  [[ 87,206,105],[ 79,255,214],[ 43,255,250],[ 25,255,214]]   // 5 yellow + green
];
const LE_TWEENS = 14;
const LE_TOTAL = 4 + LE_TWEENS * 3;          // 46
const LE_TOTALWBIZ = LE_TOTAL * 2 - 2;       // 90

/* Build the 46-entry ramp. THE INTEGER STEP IS THE POINT — perStep is
   truncated toward zero and then multiplied, so tween 14 of the front
   logic's first segment lands on V=70 where the next key is V=85. The
   ramp jumps at every key. Interpolate properly and the display loses its
   stepped, mechanical fade and starts to look like a phone screen. */
function leColors(palNum, bri){
  const pal = LE_PAL[palNum] || LE_PAL[0];
  const out = new Array(LE_TOTAL);
  for(let i = 0; i < LE_TOTAL; i++) out[i] = [0, 0, 0];
  for(let k = 0; k < 4; k++){
    const key = pal[k], base = k * (LE_TWEENS + 1);
    out[base][0] = key[0]; out[base][1] = key[1];
    out[base][2] = lMap8(key[2], 1, bri);
    if(base + 1 === LE_TOTAL) continue;      // true only for k === 3
    const next = pal[k + 1];
    for(let el = 0; el < 3; el++){
      const per = Math.trunc((next[el] - key[el]) / (LE_TWEENS + 1));
      for(let t = 1; t <= LE_TWEENS; t++){
        const raw = (per !== 0 ? key[el] + t * per : key[el]) & 0xFF;
        out[base + t][el] = (el === 2) ? lMap8(raw, 1, bri) : raw;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------- colour numbers
   The one-digit colour of a command. 0 and 1 are the same HUE — effects
   that need to tell them apart branch on the digit, not on the hue,
   because 0 means "leave the board's own palette alone". */
const LE_HUE = [0, 0, 26, 42, 85, 128, 170, 202, 213, 228];
const LE_COLOUR_NAME = ['default','red','orange','yellow','green','cyan','blue','purple','magenta','pink'];
const leHueOf = c => LE_HUE[(c | 0) >= 0 && (c | 0) <= 9 ? (c | 0) : 0];

/* ------------------------------------------------------------ LED maps
   map[row * w + col] = the physical LED index.

   `serp` walks rows, reversing every other one. `serpCols` walks COLUMNS
   in strips of `h`, reversing every other strip — and restarting the
   alternation on every `perBoard` columns, because the toolbox FLD is four
   separate 45-LED boards stood side by side and each one starts its own
   serpentine. Get that restart wrong and the panel tears into four bands
   that scroll in opposite directions. */
function leSerp(w, h, perBoard){
  const m = new Array(w * h);
  for(let r = 0; r < h; r++){
    /* THE ALTERNATION RESTARTS AT EVERY BOARD, and that is not a detail.
       The stock front logic is TWO 9x5 boards stacked, each wired as its
       own serpentine, so rows 4 and 5 both run left to right — the phase
       resets in the middle of the panel. A strict every-other-row rule
       produces a map that looks entirely reasonable and renders the bottom
       half of every glyph mirrored. The 10x10 slant board really is one
       board and really does alternate all the way down, which is why this
       is a parameter and not a rule. */
    const within = perBoard ? (r % perBoard) : r;
    const back = (within % 2 === 1);
    for(let c = 0; c < w; c++) m[r * w + c] = r * w + (back ? (w - 1 - c) : c);
  }
  return m;
}
function leSerpCols(w, h, perBoard){
  const m = new Array(w * h);
  for(let c = 0; c < w; c++){
    const within = perBoard ? (c % perBoard) : c;
    const desc = (within % 2 === 0);
    const base = c * h;
    for(let r = 0; r < h; r++) m[r * w + c] = base + (desc ? (h - 1 - r) : r);
  }
  return m;
}
/* The PSIs are square boards with the corners cut off. A cell whose map
   entry is >= count is a HOLE: no LED is fitted there, and it must render
   as board, not as a black pixel. The library spells that with a dummy
   index (31 on the 5x5, 99 on the 8x8) and we keep the same convention —
   any index >= count means "nothing here". */
function lePsi5(){
  const HOLE = 31, m = new Array(25).fill(HOLE);
  let n = 0;
  for(let r = 0; r < 5; r++) for(let c = 0; c < 5; c++){
    const corner = (r === 0 || r === 4) && (c === 0 || c === 4);
    if(!corner) m[r * 5 + c] = n++;
  }
  return m;
}
function lePsi8(){
  const HOLE = 99, m = new Array(64).fill(HOLE);
  const cut = [2, 1, 0, 0, 0, 0, 1, 2];      // cells missing from each end of each row
  let n = 0;
  for(let r = 0; r < 8; r++){
    const k = cut[r];
    for(let c = 7 - k; c >= k; c--) m[r * 8 + c] = n++;   // every row runs right to left
  }
  return m;
}

/* ------------------------------------------------------------- the kit
   `variant` is what a builder can actually have bought. The FLD is the
   one with real choices — the stock 9x10 pair, Darren's four-board
   toolbox panel, and the slanted 10x10 — so it is a build question, not a
   constant. `id` is the digit the LE command addresses the board by. */
const LE_BOARDS = {
  fld:      {label:'Front logic (FLD)',  w: 9, h:10, count: 90, id:1, kind:'logic', map:()=>leSerp(9,10,5)},
  fldTlbx:  {label:'Front logic — toolbox 4-board', w:20, h:9, count:180, id:1, kind:'logic', map:()=>leSerpCols(20,9,5)},
  fldSlant: {label:'Front logic — slant', w:10, h:10, count:100, id:1, kind:'logic', map:()=>leSerp(10,10,0)},
  rld:      {label:'Rear logic (RLD)',   w:27, h: 4, count:108, id:3, kind:'logic', map:()=>leSerp(27,4,0)},
  psi:      {label:'PSI 5x5',            w: 5, h: 5, count: 25, id:0, kind:'psi',   map:lePsi5},
  psi8:     {label:'PSI 8x8',            w: 8, h: 8, count: 64, id:0, kind:'psi',   map:lePsi8}
};

/* The four displays an AstroPixels dome runs, in the order the LE command
   numbers them. `pin` is the ESP32 GPIO off the breakout board — recorded
   so the wiring sheet can print it, never used by the simulation. */
const LE_DISPLAYS = [
  {key:'fld',  id:1, label:'Front logic',  short:'FLD',  pin:15, board:'fld', pal:0, fade: 1, delay:10, bri:160, def:0},
  {key:'rld',  id:3, label:'Rear logic',   short:'RLD',  pin:33, board:'rld', pal:1, fade: 3, delay:40, bri:140, def:0},
  {key:'fpsi', id:4, label:'Front PSI',    short:'FPSI', pin:32, board:'psi', pal:4, fade: 1, delay:10, bri:160, def:23},
  {key:'rpsi', id:5, label:'Rear PSI',     short:'RPSI', pin:23, board:'psi', pal:5, fade: 3, delay:40, bri:140, def:23}
];
/* Holoprojectors: seven pixels each — a ring of six around one centre. */
const LE_HOLOS = [
  {key:'front', letter:'F', label:'Front holoprojector', pin:25},
  {key:'rear',  letter:'R', label:'Rear holoprojector',  pin:26},
  {key:'top',   letter:'T', label:'Top holoprojector',   pin:27}
];
const LE_AUX_PINS = [2, 4, 5, 18, 19];
const LE_SERIAL_PINS = {rx:16, tx:17};

/* The sequence numbers, by name, so nothing downstream spells one wrong. */
const LE_SEQ = {
  NORMAL:0, ALARM:1, FAILURE:2, LEIA:3, MARCH:4, SOLIDCOLOR:5, FLASHCOLOR:6,
  FLIPFLOPCOLOR:7, FLIPFLOPALTCOLOR:8, COLORSWAP:9, RAINBOW:10, REDALERT:11,
  MICBRIGHT:12, MICRAINBOW:13, LIGHTSOUT:14, TEXT:15, TEXTSCROLLLEFT:16,
  TEXTSCROLLRIGHT:17, TEXTSCROLLUP:18, ROAMINGPIXEL:19, HORIZONTALSCANLINE:20,
  VERTICALSCANLINE:21, FIRE:22, PSICOLORWIPE:23, PULSE:24, RANDOM:99
};
const LE_SEQ_NAME = [
  'Normal','Alarm','Failure','Leia','March','Solid colour','Flashing colour',
  'Flip flop','Flip flop alt','Colour swap','Rainbow','Red alert','Mic brightness',
  'Mic rainbow','Lights out','Text','Text scroll left','Text scroll right',
  'Text scroll up','Roaming pixel','Horizontal scanline','Vertical scanline',
  'Fire','PSI colour wipe','Pulse'
];
/* Packing, exactly as the library does it — one signed integer carries the
   whole command, which is why an effect change is a single comparison. */
const leSequence = (seq, colour, speed, secs) =>
  (seq | 0) * 10000 + (colour | 0) * 1000 + (speed | 0) * 100 + (secs | 0);
