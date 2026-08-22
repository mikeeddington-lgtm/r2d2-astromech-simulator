#pragma once
/* =====================================================================
   A fake LEDC peripheral that enforces the CORE'S OWN RULES.

   The point of this file is that it is not permissive. A fake that
   accepts anything proves only that the code compiles, and the bug it
   exists to catch — v1.67.1 passing a GPIO number where an LEDC CHANNEL
   belongs, then writing the duty to a third number again — compiled
   perfectly and moved nothing. So this one refuses exactly what the
   silicon refuses:

     * a channel outside 0-15                     (there are 16, that is all)
     * attaching a pin to a channel never set up
     * writing to a channel that has no pin on it

   and it answers the only question that matters at the end of it all:
   WHAT DUTY IS GPIO n HOLDING? Both core branches have to get the same
   answer, which is what makes one set of assertions cover both.

   Set MPCA_FAKE_CORE to 2 or 3 before including. Note that 3.x hides
   channels entirely — you name the pin — so on that branch the channel
   rules simply do not apply, and asking the same question of both is the
   whole trick.
   ===================================================================== */
#include <stdint.h>
#include <string.h>
#include <stdio.h>

#ifndef MPCA_FAKE_CORE
#define MPCA_FAKE_CORE 3
#endif

#define MPCA_FAKE_GPIOS   48
#define MPCA_FAKE_CHANS   16

struct MpcaFakeLedc {
  uint32_t duty[MPCA_FAKE_GPIOS];      /* what each GPIO is holding      */
  bool     live[MPCA_FAKE_GPIOS];      /* has this GPIO ever been driven */
  int8_t   chanGpio[64];               /* 2.x: channel -> GPIO, -1 = none*/
  bool     chanSet[64];                /* 2.x: channel -> configured     */
  uint32_t hz[64]; uint8_t bits[64];
  int      writes;
  int      errors;
  char     lastError[160];
};
static MpcaFakeLedc g_ledc;

inline void mpcaFakeReset(){
  memset(&g_ledc, 0, sizeof g_ledc);
  memset(g_ledc.chanGpio, -1, sizeof g_ledc.chanGpio);
}
inline void mpcaFakeErr(const char* fmt, int a, int b){
  g_ledc.errors++;
  snprintf(g_ledc.lastError, sizeof g_ledc.lastError, fmt, a, b);
}
inline uint32_t mpcaFakeDuty(uint8_t gpio){ return gpio < MPCA_FAKE_GPIOS ? g_ledc.duty[gpio] : 0; }
inline bool     mpcaFakeLive(uint8_t gpio){ return gpio < MPCA_FAKE_GPIOS && g_ledc.live[gpio]; }
inline int      mpcaFakeErrors(){ return g_ledc.errors; }
inline int      mpcaFakeWrites(){ return g_ledc.writes; }
inline const char* mpcaFakeLastError(){ return g_ledc.lastError; }

#if MPCA_FAKE_CORE >= 3
/* ---- arduino-esp32 3.x: everything is addressed by PIN ---- */
inline bool ledcAttach(uint8_t pin, uint32_t hz, uint8_t bits){
  if(pin >= MPCA_FAKE_GPIOS){ mpcaFakeErr("ledcAttach: GPIO %d does not exist%d", pin, 0); return false; }
  g_ledc.live[pin] = true; g_ledc.hz[pin & 63] = hz; g_ledc.bits[pin & 63] = bits;
  return true;
}
inline bool ledcWrite(uint8_t pin, uint32_t duty){
  if(pin >= MPCA_FAKE_GPIOS || !g_ledc.live[pin]){
    mpcaFakeErr("ledcWrite: GPIO %d was never attached (duty %d)", pin, (int)duty); return false; }
  g_ledc.duty[pin] = duty; g_ledc.writes++;
  return true;
}
#else
/* ---- arduino-esp32 2.x: you pick the CHANNEL, then hang a pin on it ---- */
inline uint32_t ledcSetup(uint8_t channel, uint32_t hz, uint8_t bits){
  if(channel >= MPCA_FAKE_CHANS){
    mpcaFakeErr("ledcSetup: there is no LEDC channel %d (0-%d exist)", channel, MPCA_FAKE_CHANS - 1);
    return 0; }
  g_ledc.chanSet[channel] = true; g_ledc.hz[channel] = hz; g_ledc.bits[channel] = bits;
  return hz;
}
inline void ledcAttachPin(uint8_t pin, uint8_t channel){
  if(channel >= MPCA_FAKE_CHANS){
    mpcaFakeErr("ledcAttachPin: GPIO %d asked for channel %d, which does not exist", pin, channel); return; }
  if(!g_ledc.chanSet[channel]){
    mpcaFakeErr("ledcAttachPin: GPIO %d attached to channel %d before ledcSetup", pin, channel); return; }
  if(pin >= MPCA_FAKE_GPIOS){
    mpcaFakeErr("ledcAttachPin: GPIO %d does not exist (channel %d)", pin, channel); return; }
  g_ledc.chanGpio[channel] = (int8_t)pin;
  g_ledc.live[pin] = true;
}
inline void ledcWrite(uint8_t channel, uint32_t duty){
  if(channel >= MPCA_FAKE_CHANS){
    mpcaFakeErr("ledcWrite: there is no LEDC channel %d (duty %d)", channel, (int)duty); return; }
  if(!g_ledc.chanSet[channel] || g_ledc.chanGpio[channel] < 0){
    mpcaFakeErr("ledcWrite: channel %d has no pin on it (duty %d)", channel, (int)duty); return; }
  g_ledc.duty[(uint8_t)g_ledc.chanGpio[channel]] = duty; g_ledc.writes++;
}
#endif
