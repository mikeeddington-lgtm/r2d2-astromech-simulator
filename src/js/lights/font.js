'use strict';
/* =====================================================================
   ASTROPIXELS — the two bitmap fonts the logic displays write with
   =====================================================================

   The library ships two fonts because the two boards are different
   shapes, not because anybody wanted two: a front logic is ten pixels
   tall and can carry a proper glyph, a rear logic is FOUR, and four rows
   is below the height at which a normal alphabet survives. So the rear
   font is its own design with its own rules, and treating it as "the same
   font, smaller" is how you end up with a panel of illegible confetti.

   These two are ORIGINAL bitmaps. ReelTwo's LatinFont8x5 and
   LatinFontVar4pt are LGPL-2.1 data and this project is MIT, so the
   tables could not be reused even though the renderer's BEHAVIOUR (the
   spec's §9) is fair game and is followed closely. Ours were drawn from
   scratch, rendered to ASCII and read back until "R2-D2" and
   "ASTROPIXELS" were unambiguous at both sizes; that test is the only
   reason to prefer one pixel arrangement over another at this size.

   ------------------------------------------------------- the encoding

   Both tables are one long hex string, glyphs in `LE_FONT_CHARS` order,
   fixed-length records so a glyph is a substring and not a search. The
   library scans its table linearly for a matching ASCII byte and falls
   back to the FIRST record on a miss; we keep the fallback (record 0 is
   the space) but index directly, because a linear scan of 46 records per
   character per frame is a silly thing to ask a browser to do at 100 Hz.

     TALL (front logics)   5 columns x 8 rows, 1 bit per pixel.
                           10 hex chars = 5 column bytes, left to right;
                           in each byte bit 0 is the TOP row.
     SHORT (rear logics)   4 rows, 1..4 columns, 2 bits per pixel.
                           9 hex chars = 1 width digit + 4 column bytes;
                           in each byte the MSB pair is the top row.

   Note which way round those are. The board's own 5pt font is 8 wide by
   5 tall stored as row bytes; ours is 5 wide by 8 tall stored as column
   bytes, because an AstroPixel FLD is 9x10 rather than 8x10 — a 5-tall
   glyph on a 10-tall panel wastes half the board, and columns are the
   natural axis when the only thing text ever does here is scroll
   sideways. leTextHeight() reports the real height so nothing downstream
   inherits the library's hard-coded 5.

   ------------------------------------------------- why two bits a pixel

   The rear font is anti-aliased in three levels, as the board's is: 1, 2
   and 3 pick brightnesses 1, 16 and 64 out of the renderer's font ramp.
   Be careful what you expect of that. hsv2rgb_rainbow squares V, so level
   1 lands on black and level 2 on very nearly black — the dim levels are
   shaping, not shading, and a glyph that needs them to be read cannot be
   read. Every letter here is legible from its level-3 pixels alone.
   ===================================================================== */

/* Record 0 is the space, deliberately: it is also the miss fallback, so
   an unknown character comes out as a gap rather than as tofu. */
const LE_FONT_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-!?:'/+*";

const LE_FONT_TALL_H = 8;
const LE_FONT_TALL_W = 5;
const LE_FONT_SHORT_H = 4;

/* 5 x 8, one byte per column, bit 0 = top row. */
const LE_FONT_TALL =
  '00000000007E0909097E7F494949363E414141227F4141413E7F49494941' +
  '7F090909013E4149493A7F0808087F41417F41412040413F017F08142241' +
  '7F404040407F020C027F7F020C107F3E4141413E7F090909063E4151215E' +
  '7F09192946464949493101017F01013F4040403F1F2040201F7F2018207F' +
  '6314081463030478040361514945433E5149453E00427F40004261514946' +
  '2141454B311814127F1027454545393C4A49493001710905033649494936' +
  '064949291E4000000000804000000008080800005F000000000201510906' +
  '240000000003000000004030080601081C0800001408140000';

/* 1..4 x 4, width digit then four column bytes, MSB pair = top row. */
const LE_FONT_SHORT =
  '200000000' + '33FCC3F00' + '3FFF33F00' + '3FFC3C300' + '3FFC33C00' +
  '3FFF3C300' + '3FFCCC000' + '3FFC3CF00' + '3FF0CFF00' + '3C3FFC300' +
  '30CC3FC00' + '3FF30CF00' + '3FF030300' + '4FF3030FF' + '4FF300CFF' +
  '3FFC3FF00' + '3FFCCFC00' + '3FCCCFF00' + '3FFCCF300' + '3F3C3CF00' +
  '3C0FFC000' + '3FF03FF00' + '3FC03FC00' + '4FC0F0FFC' + '3C33CC300' +
  '3C03FC000' + '3CFC3F300' + '3FFC3FF00' + '3C3FF0300' + '3C3CF3300' +
  '3C3F3FF00' + '3FC0CFF00' + '3F3C3CF00' + '3FFCF0F00' + '3C0CFF000' +
  '3FFCFFF00' + '3FCCCFF00' + '103000000' + '2030C0000' + '30C0C0C00' +
  '11F300000' + '3C0CF3000' + '133000000' + '11F000000' + '303033CC0' +
  '00330FC30' + '003CC30CC';

/* Decoded once at load. 46 glyphs is nothing, and doing it here means
   leGlyph() is a subscript rather than a parse — it is called for every
   character of every scrolled frame. */
const LE_FONT_INDEX = (function(){
  const ix = {};
  for(let i = 0; i < LE_FONT_CHARS.length; i++) ix[LE_FONT_CHARS.charAt(i)] = i;
  return ix;
})();

function leFontDecode(){
  const tall = [], short = [];
  for(let i = 0; i < LE_FONT_CHARS.length; i++){
    const tb = [];
    let tw = 0;
    for(let c = 0; c < LE_FONT_TALL_W; c++){
      const b = parseInt(LE_FONT_TALL.substr(i * 10 + c * 2, 2), 16) || 0;
      tb.push(b);
      /* Advance is the glyph's real ink width, measured now rather than
         stored, exactly as the board measures it at render time — which
         is what makes 'I' and '1' narrow without a width column. */
      if(b) tw = c + 1;
    }
    /* A blank cell would otherwise advance zero and stack the rest of the
       message on top of itself. The board forces 4; so do we, and that is
       why a space is wide. */
    tall.push({w: tw || 4, h: LE_FONT_TALL_H, bits: tb, tall: true});

    const sw = parseInt(LE_FONT_SHORT.substr(i * 9, 1), 16) || 0, sb = [];
    for(let c = 0; c < 4; c++) sb.push(parseInt(LE_FONT_SHORT.substr(i * 9 + 1 + c * 2, 2), 16) || 0);
    short.push({w: sw || 3, h: LE_FONT_SHORT_H, bits: sb, tall: false});
  }
  return {tall: tall, short: short};
}
const LE_FONT = leFontDecode();

/* `tall` is the caller's choice of font, not the character's: the display
   picks by panel height (see leTallFont) and then every glyph in the
   message comes from the same table. Lower case folds to upper because
   there is no lower case to fold to — at four rows there is no room for
   an x-height, and at five columns a descender would collide with the
   next line. */
function leGlyph(ch, tall){
  let i = LE_FONT_INDEX[ch];
  if(i === undefined) i = LE_FONT_INDEX[String(ch).toUpperCase()];
  if(i === undefined) i = 0;                 // miss → the space, as the board does
  return (tall ? LE_FONT.tall : LE_FONT.short)[i];
}

/* 0 = transparent, 1..3 = which of the renderer's three font brightnesses.
   The tall font only ever returns 0 or 3: the board's 5pt renderer draws
   every set bit in the brightest colour and never touches the dim two. */
function leGlyphLevel(g, x, y){
  if(!g || x < 0 || y < 0 || y >= g.h || x >= g.bits.length) return 0;
  const b = g.bits[x];
  return g.tall ? (((b >> y) & 1) ? 3 : 0) : ((b >> (6 - y * 2)) & 3);
}

/* Both measurements walk the string the same way the renderer does, so a
   centred message really is centred: advance is glyph width plus a
   one-column gap, and a newline returns to the left margin. Multi-line
   messages are measured at their widest line, which is what a "does it
   fit" test wants; the board's measureText just sums, and gets a wrong
   answer for anything with a newline in it. */
function leTextWidth(s, tall){
  const str = String(s == null ? '' : s);
  let w = 0, line = 0;
  for(let i = 0; i < str.length; i++){
    const ch = str.charAt(i);
    if(ch === '\n'){ if(line > w) w = line; line = 0; continue; }
    line += leGlyph(ch, tall).w + 1;
  }
  return (line > w) ? line : w;
}
function leTextHeight(s, tall){
  const str = String(s == null ? '' : s);
  let lines = 1;
  for(let i = 0; i < str.length; i++) if(str.charAt(i) === '\n') lines++;
  return lines * (tall ? LE_FONT_TALL_H : LE_FONT_SHORT_H);
}

/* Which font a panel gets. The library decides by board type — 5pt for
   every FLD, 4pt for every RLD — but a simulator has to cope with panels
   the library never had (the 20x9 toolbox front, the 5x5 PSI), so decide
   by the only thing that actually matters: can eight rows of glyph fit.
   9x10, 20x9, 10x10 and the 8x8 PSI take the tall font; the 27x4 rear
   logic and the 5x5 PSI take the four-row one. */
const leTallFont = d => d.h >= LE_FONT_TALL_H;
