'use strict';
/* =====================================================================
   ABOUT — the credits, inside the app

   The simulator is ONE self-contained HTML file by design: you copy it to
   the workshop laptop, or hand it to another builder on a memory stick,
   and it runs off the disk with no server and no internet. Which means
   most of the people who ever run it will never see the repository it came
   from, and a CREDITS.md sitting in that repository credits nobody as far
   as they are concerned.

   So the credits travel WITH the file. Five things are somebody else's
   work and all five are named here:

     · the MK4 and Polar Mouse geometry — MrBaddeley's paid Patreon
       designs, used with his permission, and NOT licensed onward to
       anyone who copies this file;
     · the Padawan360 firmware lineage — Dan Kraus's sketches under
       BSD-3-Clause, which requires exactly this notice;
     · three.js — MIT;
     · the board photographs — the manufacturers', reproduced small for
       identification;
     · IBM Plex Mono and IBM Plex Sans — IBM's typeface, vendored as
       data-URI woff2 in the stylesheet so the file needs no network
       font; SIL Open Font License 1.1, which requires exactly this
       notice too (v1.79.0, review DOC-01 — no OFL licence text
       currently ships with them; see CREDITS.md).

   Deliberately a dialog rather than a pane: it is read once, and a pane
   would cost a tab in a header that has run out of room.
   ===================================================================== */

const ABOUT_CREDITS = [
  {who:'MrBaddeley',
   what:'the MK4 astromech and the Polar Mouse — the 3D geometry this simulator drives',
   note:'Used with his permission. His designs are paid Patreon models: this file carries them so the '
      + 'simulator has something to move, and that permission does not extend to redistributing the '
      + 'geometry yourself. If you want the models, get them from him.',
   url:'https://www.patreon.com/mrbaddeley'},
  {who:'Dan Kraus and the Padawan360 project',
   what:'the firmware this simulator is a model OF',
   note:'The three sketch ports here follow padawan360 and its Maestro forks. BSD-3-Clause.',
   url:'https://github.com/dankraus/padawan360'},
  {who:'Pololu',
   what:'the Maestro servo controllers, and the labelled board photographs on the wiring sheet',
   note:'Photographs from their own product pages, shown small for identification.',
   url:'https://www.pololu.com'},
  {who:'three.js',
   what:'the 3D renderer, r128',
   note:'MIT licence.',
   url:'https://threejs.org'},
  {who:'IBM',
   what:'IBM Plex Mono and IBM Plex Sans — the typeface this simulator renders in',
   note:'Vendored as latin-subset woff2 data URIs in src/css/01-tokens.css, so both builds carry their own '
      + 'type with no network font request. Licence: SIL OFL 1.1 (scripts.sil.org/OFL).',
   url:'https://scripts.sil.org/OFL'},
  {who:'Printed Droid',
   what:'the dome panel numbering the dome map is drawn to',
   note:'The layout is fact about the droid; their reference drawing is their own work and is not reproduced here.',
   url:'https://www.printed-droid.com'}
];

/* the R2 builders' club line — said once, in the app, because a tool for
   building astromechs that does not point at the people who taught everyone
   how is a tool with bad manners */
const ABOUT_BLURB =
  'A browser simulator for an R2-D2 build: it runs real firmware sketches against a model of the '
+ 'actual hardware — Sabertooth, Syren, PCA9685, Pololu Maestro, DY-SV5W — so mappings, endpoints '
+ 'and timing can be shaken out before anything is wired.';

function aboutHtml(){
  const esc = s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  let h = '<div class="abtblurb">' + esc(ABOUT_BLURB) + '</div>'
        + '<div class="abtver">Version <b>' + esc(APP_VERSION) + '</b>'
        + ((typeof STUDIO_VERSION !== 'undefined') ? ' · PCA Studio ' + esc(STUDIO_VERSION) : '')
        + '</div>'
        + '<div class="abth">Built on other people’s work</div>';
  ABOUT_CREDITS.forEach(c=>{
    h += '<div class="abtrow"><b>' + esc(c.who) + '</b> — ' + esc(c.what)
       + '<div class="abtnote">' + esc(c.note)
       + (c.url ? ' <span class="abturl">' + esc(c.url) + '</span>' : '')
       + '</div></div>';
  });
  const lic = (typeof APP_LICENCE === 'string' && APP_LICENCE) ? esc(APP_LICENCE) : '';
  h += '<div class="abtfoot">The simulator’s own code and artwork are '
     + (lic ? lic + '. ' : 'licensed as stated in LICENSE and CREDITS.md in the repository. ')
     + 'Everything above belongs to the people named, on their terms, not this file’s.</div>';
  return h;
}

/* appConfirm with one way out is the dialog this app has (the same shape
   the import failure and the Finish prompt use). `html:true` because this
   one writes its own markup — every value that reaches it is escaped
   above. */
function aboutOpen(){
  if(typeof appConfirm !== 'function') return null;
  return appConfirm(aboutHtml(),
    {title:'R2-D2 Astromech Simulator', yes:'Close', no:'', html:true, cls:'about'});
}
if(typeof $ === 'function' && $('btnAbout')){
  $('btnAbout').addEventListener('click', ()=>{
    if(typeof appMenuClose === 'function') appMenuClose();
    aboutOpen();
  });
}
