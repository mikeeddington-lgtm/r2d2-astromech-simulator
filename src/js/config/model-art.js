'use strict';
/* =====================================================================
   MODEL ARTWORK — the pictures on the first setup card

   Mike, 2026-08-14: "move the model selection to the start of the setup
   page - with static images of each model."

   These are hand-drawn SVG, not renders, and that is deliberate:

     · the real geometry is not loaded yet when the wizard first opens
       (CAD.loaded is false for the first few seconds of a cold boot), so
       a render-based thumbnail would show three empty boxes exactly when
       a new builder needs to choose;
     · the MK4 geometry is MrBaddeley's paid Patreon design (HANDOVER §1)
       and a baked render of it would be a picture of that design sitting
       in a file we hand around;
     · line art costs about a kilobyte each, is crisp at any size, and
       inherits the theme — `currentColor` for the outline, the CSS
       accent for the highlights — so the cards look right in light and
       dark without a second asset.

   They are IDENTIFICATION, not a preview. Every one is drawn in the same
   96-unit-tall box with the same stroke weight so the four read as a set
   and the eye can tell them apart in a glance, which is the whole job.
   ===================================================================== */

/* One shared frame. Everything below draws inside 0 0 120 96 with the
   ground line at y = 88, so the three sit on the same shelf. */
const MODEL_ART_VIEWBOX = '0 0 120 96';

function modelArtDroid(){
  return ''
    /* ---- legs, drawn first so the body overlaps them ---- */
    + '<path class="ma-l" d="M32 36 L26 78 L38 78 L40 40 Z"/>'
    + '<path class="ma-l" d="M88 36 L94 78 L82 78 L80 40 Z"/>'
    + '<rect class="ma-l" x="22" y="78" width="20" height="9" rx="2.5"/>'
    + '<rect class="ma-l" x="78" y="78" width="20" height="9" rx="2.5"/>'
    /* ---- centre foot ---- */
    + '<path class="ma-l" d="M53 68 L52 80 L68 80 L67 68 Z"/>'
    + '<rect class="ma-l" x="48" y="80" width="24" height="8" rx="2.5"/>'
    /* ---- body ---- */
    + '<rect class="ma-b" x="40" y="34" width="40" height="42" rx="3"/>'
    /* the two breadpan doors and the dataport — the parts that actually move */
    + '<rect class="ma-a" x="45" y="44" width="13" height="11" rx="1.5"/>'
    + '<rect class="ma-a" x="62" y="44" width="13" height="11" rx="1.5"/>'
    + '<rect class="ma-d" x="45" y="60" width="30" height="9" rx="1.5"/>'
    /* shoulder hubs */
    + '<circle class="ma-d" cx="38" cy="41" r="4.5"/>'
    + '<circle class="ma-d" cx="82" cy="41" r="4.5"/>'
    /* ---- dome ---- */
    + '<path class="ma-b" d="M38 34 A22 22 0 0 1 82 34 Z"/>'
    + '<path class="ma-d" d="M40 26 A20 20 0 0 1 80 26"/>'
    /* the radar eye and a holoprojector, so it is unmistakably an astromech */
    + '<circle class="ma-a" cx="68" cy="24" r="5"/>'
    + '<circle class="ma-d" cx="50" cy="21" r="3"/>'
    /* pie-panel seams */
    + '<path class="ma-d" d="M52 15 L54 34 M60 12 L60 34 M68 15 L66 34"/>';
}

function modelArtFrik(){
  return ''
    /* ---- bench stand ---- */
    + '<rect class="ma-l" x="40" y="82" width="40" height="6" rx="2.5"/>'
    + '<rect class="ma-l" x="54" y="66" width="12" height="18" rx="2"/>'
    /* ---- head ---- */
    + '<ellipse class="ma-b" cx="60" cy="44" rx="31" ry="27"/>'
    /* ears */
    + '<ellipse class="ma-d" cx="27" cy="42" rx="6" ry="10"/>'
    + '<ellipse class="ma-d" cx="93" cy="42" rx="6" ry="10"/>'
    /* the goggles are the whole silhouette — big, and the thing you recognise */
    + '<circle class="ma-a" cx="47" cy="38" r="12"/>'
    + '<circle class="ma-a" cx="73" cy="38" r="12"/>'
    + '<circle class="ma-d" cx="47" cy="38" r="4.5"/>'
    + '<circle class="ma-d" cx="73" cy="38" r="4.5"/>'
    + '<path class="ma-d" d="M59 38 L61 38"/>'
    /* brow line and jaw — the two ends of the 11-channel face rig */
    + '<path class="ma-d" d="M34 25 Q47 19 58 25 M62 25 Q73 19 86 25"/>'
    + '<path class="ma-d" d="M48 58 Q60 66 72 58"/>';
}

function modelArtMouse(){
  return ''
    /* ---- the towed chariot, behind ---- */
    + '<rect class="ma-b" x="8" y="52" width="34" height="22" rx="3"/>'
    + '<rect class="ma-d" x="14" y="58" width="22" height="9" rx="1.5"/>'
    + '<circle class="ma-l" cx="17" cy="78" r="8"/>'
    + '<circle class="ma-l" cx="35" cy="78" r="8"/>'
    /* ---- the hinged hitch ---- */
    + '<path class="ma-d" d="M42 63 L56 63"/>'
    + '<circle class="ma-a" cx="49" cy="63" r="3"/>'
    /* ---- the mouse itself: the low wedge ---- */
    + '<path class="ma-b" d="M56 74 L56 50 L74 38 L108 38 L112 50 L112 74 Z"/>'
    /* screen / eye band */
    + '<rect class="ma-a" x="80" y="45" width="26" height="9" rx="2"/>'
    + '<path class="ma-d" d="M62 60 L106 60"/>'
    /* wheels — steered front pair is what the Ackermann rig drives */
    + '<circle class="ma-l" cx="70" cy="78" r="9"/>'
    + '<circle class="ma-l" cx="102" cy="78" r="9"/>'
    + '<circle class="ma-d" cx="102" cy="78" r="3"/>';
}

/* the Model Builder card — simple by design, since the whole point is
   that there is no fixed shape: a base plate, and a two-segment arm
   outline made of the same primitives the bin offers (a beam pinned to
   a hinge block, a second beam off that), plus a couple of loose parts
   still sitting on the plate. */
function modelArtBuilder(){
  return ''
    /* ---- base plate ---- */
    + '<rect class="ma-l" x="22" y="80" width="76" height="8" rx="2"/>'
    /* ---- loose parts still in the bin ---- */
    + '<rect class="ma-d" x="28" y="70" width="14" height="8" rx="1.5"/>'
    + '<circle class="ma-d" cx="90" cy="74" r="5.5"/>'
    /* ---- a two-segment arm: hinge block, first beam, second joint, second beam ---- */
    + '<rect class="ma-b" x="55" y="64" width="13" height="15" rx="2"/>'
    + '<circle class="ma-a" cx="61.5" cy="64" r="4.2"/>'
    + '<rect class="ma-b" x="58" y="30" width="8" height="36" rx="2" transform="rotate(-16 62 64)"/>'
    + '<circle class="ma-a" cx="64" cy="31" r="3.6"/>'
    + '<rect class="ma-b" x="61" y="10" width="7" height="24" rx="2" transform="rotate(24 64.5 31)"/>';
}

const MODEL_ART = { droid:modelArtDroid, frik:modelArtFrik, mouse:modelArtMouse, builder:modelArtBuilder };

/* The <svg> for one model, ready to drop into a card.
   `ma-b` body, `ma-l` limbs/wheels, `ma-d` detail, `ma-a` accent — four
   classes, styled once in 07-startup.css so a theme change repaints all
   three without touching this file. */
function modelArtSvg(id){
  const draw = MODEL_ART[id] || MODEL_ART.droid;
  return '<svg class="modelart" viewBox="' + MODEL_ART_VIEWBOX + '" '
       + 'role="img" aria-label="' + (typeof modelById === 'function' ? modelById(id).label : id) + '" '
       + 'preserveAspectRatio="xMidYMid meet" focusable="false">'
       + '<g class="ma-g">' + draw() + '</g>'
       + '</svg>';
}
