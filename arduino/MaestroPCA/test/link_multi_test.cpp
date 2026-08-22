/* Set Multiple Targets (0x9F) — the one command that announces its own
   length, and therefore the one that can be told to walk off the buffer.
   =====================================================================
   Every other command has a fixed argument count baked into argsFor().
   0x9F does not: its FIRST data byte says how many channels follow, and
   that byte comes off the wire. `_arg` is a fixed 52 bytes, so a count
   the buffer cannot hold has to be REFUSED, not clamped silently and not
   believed.

   The byte pair that matters is `0x9F 0x7F`. It is not a hypothetical:
   0x9F is a command byte, and the parser's own self-resync (S_ARGS sees a
   high-bit byte, abandons the command in progress and starts a new one)
   is what turns one dropped byte on the host's TX line into exactly this
   sequence. A droid whose link picks up noise gets it for free.

   These assertions are about the PARSER only — the engine underneath is
   four channels wide and mostly refuses the targets — because what is
   being checked is which bytes are consumed, when the command fires, and
   whether the count is believed.

   Build/run:  arduino/MaestroPCA/test/run.sh
   ===================================================================== */
#include "Arduino.h"
#include "Adafruit_PWMServoDriver.h"
#include "../src/MaestroPCA.h"
#include "../src/MaestroLink.h"
#include <cstdio>

unsigned long __fakeMillis = 0;
PwmWrite __pwmLog[4096]; int __pwmCount = 0;
static int pass=0, fail=0;
static const char* numf(const char* f,long v){ static char b[8][40]; static int i=0; i=(i+1)&7; snprintf(b[i],40,f,v); return b[i]; }
static void ok(const char*n,bool c,const char*x=""){ c?pass++:fail++; printf("  %s  %s%s%s\n",c?"PASS":"FAIL",n,*x?"   ":"",x); }

#define NCH 4
/*  board pin   min   max  home  spd acc  releaseMs  ease */
const MpcaChannelDef TABLE[NCH] PROGMEM = {
  { 0,0, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0,1, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0,2, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE },
  { 0,3, 4000, 8000, 6000, 0,0, 0, MPCA_EASE_NONE }
};
static const uint16_t SEQ0[] PROGMEM = { 100, 6000, 0,0,0 };
const MpcaSeqDef SEQS[1] PROGMEM = { { SEQ0, 1, 0 } };

Adafruit_PWMServoDriver pca(0x40);
Adafruit_PWMServoDriver* const B[] = { &pca };

/* feed a run of bytes, discarding replies — none of these commands reply */
static void feedAll(MaestroLink& l, const uint8_t* b, int n){
  uint8_t out[2];
  for(int i=0;i<n;i++) l.feed(b[i], out);
}
/* a target is only a target until the kinematics tick moves the channel
   onto it, so every "did it reach" assertion runs the engine first */
static void adv(MaestroPCA&m,int ms){ for(int i=0;i<ms;i+=10){ __fakeMillis+=10; m.update(); } }

int main(){
  printf("\n==== a well-formed Set Multiple Targets still works ====\n");
  {
    MaestroPCA m(B,1,TABLE,NCH,SEQS,1); m.begin();
    MaestroLink link(m);
    /* two channels from channel 1: 7000 and 5000, low-7 then high-7 */
    const uint8_t msg[] = { 0x9F, 2, 1,
                            7000 & 0x7F, (7000 >> 7) & 0x7F,
                            5000 & 0x7F, (5000 >> 7) & 0x7F };
    feedAll(link, msg, sizeof msg);
    adv(m, 50);
    ok("one command counted, nothing rejected",
       link.commandCount() == 1 && link.badCount() == 0,
       numf("bad %ld", (long)link.badCount()));
    ok("  and both channels were driven",
       m.getPosition(1) == 7000 && m.getPosition(2) == 5000,
       numf("ch1 %ld", (long)m.getPosition(1)));
  }

  printf("\n==== a count the buffer cannot hold is REFUSED ====\n");
  {
    /* 0x7F is the largest a 7-bit data byte can be: 127 channels, 256
       bytes of arguments. `2 + 127*2` is 256, which is 0 in a uint8_t —
       so an unfixed parser decides the command is already complete on
       its first argument byte and executes it out of uninitialised
       memory past the end of _arg. TWO BYTES. */
    MaestroPCA m(B,1,TABLE,NCH,SEQS,1); m.begin();
    MaestroLink link(m);
    const uint8_t msg[] = { 0x9F, 0x7F };
    feedAll(link, msg, sizeof msg);
    adv(m, 50);
    ok("0x9F 0x7F did NOT execute a command",
       link.commandCount() == 0, numf("count %ld", (long)link.commandCount()));
    ok("  it was counted as bad instead",
       link.badCount() == 1, numf("bad %ld", (long)link.badCount()));
    ok("  and no channel was touched",
       m.getPosition(0) == 6000 && m.getPosition(1) == 6000
       && m.getPosition(2) == 6000 && m.getPosition(3) == 6000);

    /* back to idle, so the next real command is understood */
    const uint8_t good[] = { 0x84, 0, 7000 & 0x7F, (7000 >> 7) & 0x7F };
    feedAll(link, good, sizeof good);
    adv(m, 50);
    ok("  and the parser resynced: the next command was obeyed",
       m.getPosition(0) == 7000, numf("ch0 %ld", (long)m.getPosition(0)));
  }

  printf("\n==== the boundary: 25 fits the buffer exactly, 26 does not ====\n");
  {
    MaestroPCA m(B,1,TABLE,NCH,SEQS,1); m.begin();
    MaestroLink link(m);
    /* 25 channels is 2 + 50 = 52 argument bytes, which is sizeof(_arg).
       The command must not fire until every one of them has arrived. */
    uint8_t msg[52 + 1];
    msg[0] = 0x9F; msg[1] = 25; msg[2] = 0;
    for(int i=0;i<50;i++) msg[3+i] = (uint8_t)((i & 1) ? (6000 >> 7) & 0x7F : 6000 & 0x7F);
    feedAll(link, msg, 52);            /* header + 51 of the 52 arg bytes */
    ok("25 channels: not fired one byte short", link.commandCount() == 0);
    feedAll(link, msg + 52, 1);
    ok("  fired on the last byte, and was not rejected",
       link.commandCount() == 1 && link.badCount() == 0,
       numf("bad %ld", (long)link.badCount()));

    /* 26 needs 54 bytes and there are only 52. Refused at the count. */
    const uint8_t over[] = { 0x9F, 26, 0, 0, 0 };
    feedAll(link, over, sizeof over);
    ok("26 channels rejected the moment the count arrived",
       link.commandCount() == 1 && link.badCount() == 1,
       numf("count %ld", (long)link.commandCount()));
  }

  printf("\n%d passed, %d failed\n", pass, fail);
  return fail?1:0;
}
