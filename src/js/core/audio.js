'use strict';
/* ============================================================ AUDIO BOARDS */
const SND = { track:0, at:-1e9, vol:0, chip:'' };
function trackBank(n){
  if(n>=1&&n<=12)  return 'canned cue '+n;
  if(n>=13&&n<=16) return 'gibberish bank';
  if(n>=17&&n<=24) return 'chatty bank';
  if(n>=25&&n<=31) return 'whistle bank';
  if(n>=32&&n<=51) return 'misc / musical bank';
  if(n===52) return 'enable chirp';
  if(n===53) return 'disable chirp';
  return 'track '+n;
}
function trackDesc(n){
  /* the Padawan pack's file name for this number, when we know it */
  const nm = (typeof SBANK!=='undefined' && SBANK.names[n])
          || (typeof SOUND_NAMES!=='undefined' && SOUND_NAMES[n]) || '';
  return nm ? nm+' · '+trackBank(n) : trackBank(n);
}
/* both boards are single-channel: a new track interrupts the current one */
function sndTrigger(n){
  SND.track=n; SND.at=SIM.millis;
  /* THE SKETCH KEEPS RUNNING WHILE YOU ARE IN SETUP — and it should: the
     serial console, the output tables and the automation timers are all
     part of what this app is for. What it must not do is make NOISE at
     somebody who is halfway through naming a channel.

     Mike said it twice. v1.39.6 fixed the half of it he could point at —
     letters typed into a name field falling through to the pad map
     (input/gamepad.js) — and he came straight back with "It's still
     triggering sounds when using the setup menu", because the other half
     never went through the keyboard at all: automation mode fires a random
     track every 3-10 seconds on its own clock, and the pad-connect greeting
     fires whenever a profile reloads, which is what changing a hardware
     answer does.

     So the gate belongs HERE, at the board, not on any one of its callers.
     The sketch still calls playTrack(), the log still records it and
     SND.track still says what the board was told — this is a real
     single-channel sound board being told to play something while its
     speaker is unplugged. Only the speaker is missing. */
  if(typeof uiModalOpen === 'function' && uiModalOpen()) return;
  if(typeof sbankPlay==='function') sbankPlay(n);
}
// MD-YX5300 (mod2026)
const mp3 = {
  playTrack(n){ sndTrigger(n); lg('mp3',`mp3.playTrack(${n})  → ${trackDesc(n)}`); },
  volume(v){ SND.vol=v; lg('mp3',`mp3.volume(${v})`); }
};
// DY-SV5W (maestro sketches)
const player = {
  playSpecified(n){ sndTrigger(n); lg('mp3',`player.playSpecified(${n})  → ${trackDesc(n)}`); },
  setVolume(v){ SND.vol=v; lg('mp3',`player.setVolume(${v})`); }
};

/* ================================================================ I2C / HP */
let I2C_PRESENT = false;   // no logic/HP slave wired up in the sim
function triggerI2C(dev, cmd){
  lg('i2c', `Wire → 0x${dev.toString(16).toUpperCase()} (${dev}) : ${cmd}` + (I2C_PRESENT?'':'  [no ACK]'));
}

/* ============================================================ POLOLU MAESTRO
   restartScript(n) restarts a stored sequence on the Maestro. The sim maps
   each slot to an on-screen animation you can pick in the Config tab.
   ======================================================================= */
