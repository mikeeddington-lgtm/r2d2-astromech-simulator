#include "MaestroPCA.h"

/* The kinematics below is duplicated, integer-for-integer, in the R2-D2
   Simulator's src/js/maestro/pcaseq.js. If you change one, change both, or
   the sim stops being evidence about the real droid.

   There used to be a third copy, inlined in pca-studio/PCA-Studio.html, and
   it is instructive that it is gone: the v1.25.1 endpoint-clamp fix landed
   in two of the three and sat there. Studio is now BUILT from pcaseq.js,
   so the only copy left is the one that genuinely cannot be shared —
   this one, because it has to run on an AVR. */

/* ------------------------------------------------ the PCA9685 backend */
void MpcaPca9685Output::begin(uint32_t oscillatorHz, float servoHz){
  for(uint8_t b = 0; b < _count; b++){
    _boards[b]->begin();
    _boards[b]->setOscillatorFrequency(oscillatorHz);
    _boards[b]->setPWMFreq(servoHz);
  }
  _usPerPeriod = (uint32_t)(1000000.0f / servoHz + 0.5f);
}
uint16_t MpcaPca9685Output::code(uint8_t board, uint8_t pin, uint16_t qus) const {
  (void)board; (void)pin;                 /* every board quantises the same */
  /* quarter-µs → 12-bit ticks: ticks = qus/4 µs × 4096 / period_µs.
     At 50 Hz one tick is 4.88 µs, which is why the engine dedupes on this
     number and not on the target. */
  uint32_t denom = _usPerPeriod * 4UL;
  return (uint16_t)(((uint32_t)qus * 4096UL + denom / 2) / denom);
}
void MpcaPca9685Output::writeCode(uint8_t board, uint8_t pin, uint16_t ticks){
  if(board < _count) _boards[board]->setPWM(pin, 0, ticks);
}
void MpcaPca9685Output::off(uint8_t board, uint8_t pin){
  if(board < _count) _boards[board]->setPWM(pin, 0, 4096);   /* full-off bit */
}

/* ------------------------------------------------- the split backend */
void MpcaSplitOutput::begin(uint32_t oscillatorHz, float servoHz){
  _local.begin(oscillatorHz, servoHz);
  /* Nothing is sent to the far end here on purpose. It boots on its own and
     applies its own idle state; the first real position arrives on the next
     tick anyway, and a startup burst into a link that may not be up yet is
     just noise to resync from. */
}
uint16_t MpcaSplitOutput::code(uint8_t board, uint8_t pin, uint16_t qus) const {
  /* local channels dedupe on the local hardware's quantisation; remote ones
     on the quarter-µs, because only the far end knows what it will round to */
  return (board < _localBoards) ? _local.code(board, pin, qus) : qus;
}
void MpcaSplitOutput::writeCode(uint8_t board, uint8_t pin, uint16_t code){
  if(board < _localBoards){ _local.writeCode(board, pin, code); return; }
  frame(board, pin, code);                 /* `code` IS the qus out here */
}
void MpcaSplitOutput::off(uint8_t board, uint8_t pin){
  if(board < _localBoards){ _local.off(board, pin); return; }
  frame(board, pin, 0);                    /* 0 = stop pulsing, same as ever */
}
void MpcaSplitOutput::frame(uint8_t board, uint8_t pin, uint16_t qus){
  uint8_t ch = (uint8_t)(board * 16 + pin);
  if(ch > 127) return;                     /* the header byte has 7 bits */
  /* three single writes rather than a block: Print::write(buf, n) is a loop
     over this one anyway, and Stream is the smallest thing every target
     agrees on — including the host shim the tests run against. */
  _link.write((uint8_t)(0x80 | ch));
  _link.write((uint8_t)((qus >> 7) & 0x7F));
  _link.write((uint8_t)(qus & 0x7F));
  _sent++;
}

/* ---------------------------------------------------------- the engine */
void MaestroPCA::initCommon(){
  _st = new ChanState[_count];
  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++){
    _tk[i].seq = -1; _tk[i].frame = -1; _tk[i].frameT = 0;
    _tk[i].mask = 0; _tk[i].started = 0;
    _bgWait[i] = -1;
  }
}

MaestroPCA::MaestroPCA(Adafruit_PWMServoDriver* const* boards, uint8_t boardCount,
                       const MpcaChannelDef* channels, uint8_t channelCount,
                       const MpcaSeqDef* sequences, uint8_t sequenceCount)
: _ownedOut(new MpcaPca9685Output(boards, boardCount)),
  _table(channels), _count(channelCount),
  _seqs(sequences), _seqCount(sequenceCount),
  _startCount(0), _lastMs(0), _tickAcc(0),
  _rng(0x2545F491UL)
{
  _out = _ownedOut;
  initCommon();
}

MaestroPCA::MaestroPCA(MpcaOutput& out,
                       const MpcaChannelDef* channels, uint8_t channelCount,
                       const MpcaSeqDef* sequences, uint8_t sequenceCount)
: _out(&out), _ownedOut(0),
  _table(channels), _count(channelCount),
  _seqs(sequences), _seqCount(sequenceCount),
  _startCount(0), _lastMs(0), _tickAcc(0),
  _rng(0x2545F491UL)
{
  initCommon();
}

MaestroPCA::~MaestroPCA(){
  delete[] _st;
  delete _ownedOut;      /* null unless WE made the PCA9685 backend */
}

/* read one PROGMEM table row into RAM */
static void rowOf(const MpcaChannelDef* table, uint8_t i, MpcaChannelDef* out){
  memcpy_P(out, &table[i], sizeof(MpcaChannelDef));
}

void MaestroPCA::begin(uint32_t oscillatorHz, float servoHz){
  _out->begin(oscillatorHz, servoHz);
  for(uint8_t i=0; i<_count; i++){
    MpcaChannelDef d; rowOf(_table, i, &d);
    _st[i].pos256 = 0; _st[i].vel256 = 0; _st[i].target = 0; _st[i].aim = 0;
    _st[i].lo = d.min < d.max ? d.min : d.max;
    _st[i].hi = d.min < d.max ? d.max : d.min;
    _st[i].speed = d.speed; _st[i].accel = d.accel; _st[i].ease = d.ease;
    _st[i].releaseMs = d.releaseMs;
    _st[i].settled = 0; _st[i].launch = 0;
    _st[i].active = false; _st[i].known = false; _st[i].lastTicks = 0xFFFF;
  }
  goHome();
  _lastMs = millis();
}

void MaestroPCA::goHome(){
  for(uint8_t i=0; i<_count; i++){
    MpcaChannelDef d; rowOf(_table, i, &d);
    if(d.pin == 255) continue;
    if(d.home){
      /* homemode Goto: pulses start at the home pose, no ramp — nothing
         can know where the servo physically was before the first pulse */
      _st[i].target = d.home; _st[i].aim = d.home;
      _st[i].pos256 = (int32_t)d.home << 8;
      _st[i].vel256 = 0;
      _st[i].active = true; _st[i].known = true;
      _st[i].settled = 0; _st[i].launch = 0;
      writeChannel(i);
    }else{
      /* homemode Off: no pulses until something drives the channel.
         Right for panels — no buzzing at rest. */
      _st[i].target = 0; _st[i].aim = 0;
      _st[i].active = false; _st[i].known = false;
      offChannel(i);
    }
  }
}

void MaestroPCA::setRelease(uint8_t ch, uint16_t ms){ if(ch<_count) _st[ch].releaseMs = ms; }
void MaestroPCA::setEase(uint8_t ch, uint8_t ease){ if(ch<_count) _st[ch].ease = ease; }
bool MaestroPCA::isReleased(uint8_t ch) const {
  return ch < _count && !_st[ch].active && _st[ch].known;
}

/* ---------------------------------------------------------- sequences */

uint32_t MaestroPCA::seqMask(uint8_t n) const {
  MpcaSeqDef sd; memcpy_P(&sd, &_seqs[n], sizeof(MpcaSeqDef));
  uint32_t mask = 0;
  if(sd.flags & MPCA_SEQ_GENERATOR){
    /* generator entries name their channel in the first word of each */
    for(uint16_t e = 0; e < sd.frameCount; e++){
      uint16_t c = pgm_read_word(&sd.data[(uint32_t)e * 5]);
      if(c < _count) mask |= 1UL << (c < 31 ? c : 31);
    }
    return mask;
  }
  for(uint16_t f = 0; f < sd.frameCount; f++){
    const uint16_t* row = sd.data + (uint32_t)f * (1 + _count) + 1;
    for(uint8_t c = 0; c < _count; c++)
      if(pgm_read_word(&row[c])) mask |= 1UL << (c < 31 ? c : 31);
  }
  return mask;
}

/* a displaced background sequence waits for its channels to come free */
void MaestroPCA::bgRemember(uint8_t n){
  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++) if(_bgWait[i] == (int8_t)n) return;
  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++)
    if(_bgWait[i] < 0){ _bgWait[i] = (int8_t)n; return; }
}

void MaestroPCA::bgResume(){
  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++){
    int8_t n = _bgWait[i];
    if(n < 0) continue;
    uint32_t mask = seqMask((uint8_t)n), busy = 0;
    for(uint8_t t = 0; t < MPCA_MAX_TRACKS; t++) if(_tk[t].seq >= 0) busy |= _tk[t].mask;
    if(mask & busy) continue;              /* still borrowed — wait */
    _bgWait[i] = -1;
    restartScript((uint8_t)n);
  }
}

void MaestroPCA::restartScript(uint8_t n){
  if(n >= _seqCount) return;
  uint32_t mask = seqMask(n);

  /* Anything already driving one of these channels gives way — two
     sequences fighting over one servo would only jitter. Background
     sequences are remembered so they can pick up again afterwards. */
  int8_t slot = -1;
  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++){
    if(_tk[i].seq < 0){ if(slot < 0) slot = i; continue; }
    if(_tk[i].seq == (int8_t)n || (_tk[i].mask & mask)){
      MpcaSeqDef od; memcpy_P(&od, &_seqs[_tk[i].seq], sizeof(MpcaSeqDef));
      if((od.flags & MPCA_SEQ_BACKGROUND) && _tk[i].seq != (int8_t)n)
        bgRemember((uint8_t)_tk[i].seq);
      _tk[i].seq = -1;
      if(slot < 0) slot = i;
    }
  }
  if(slot < 0){                       /* all busy, none overlapping: oldest out */
    slot = 0;
    for(uint8_t i = 1; i < MPCA_MAX_TRACKS; i++)
      if(_tk[i].started < _tk[slot].started) slot = i;
  }
  /* asking for it again cancels any pending resume of the same thing */
  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++) if(_bgWait[i] == (int8_t)n) _bgWait[i] = -1;

  _tk[slot].seq     = (int8_t)n;
  _tk[slot].frame   = -1;
  _tk[slot].frameT  = 0;
  _tk[slot].mask    = mask;
  _tk[slot].started = ++_startCount;
}

void MaestroPCA::stopScript(){
  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++){
    _tk[i].seq = -1; _tk[i].frame = -1; _tk[i].frameT = 0;
    _bgWait[i] = -1;                  /* an explicit stop means stop */
  }
}

void MaestroPCA::stopSequence(uint8_t n){
  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++){
    if(_tk[i].seq == (int8_t)n){ _tk[i].seq = -1; _tk[i].frame = -1; _tk[i].frameT = 0; }
    if(_bgWait[i] == (int8_t)n) _bgWait[i] = -1;
  }
}

bool MaestroPCA::scriptRunning() const {
  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++) if(_tk[i].seq >= 0) return true;
  return false;
}
bool MaestroPCA::sequenceRunning(uint8_t n) const {
  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++) if(_tk[i].seq == (int8_t)n) return true;
  return false;
}
uint8_t MaestroPCA::runningCount() const {
  uint8_t c = 0;
  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++) if(_tk[i].seq >= 0) c++;
  return c;
}
int8_t MaestroPCA::currentScript() const {
  int8_t best = -1; uint32_t newest = 0;
  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++)
    if(_tk[i].seq >= 0 && _tk[i].started >= newest){ newest = _tk[i].started; best = _tk[i].seq; }
  return best;
}

/* ------------------------------------------------------------ targets */

void MaestroPCA::setTarget(uint8_t ch, uint16_t targetQus){
  if(ch >= _count) return;
  MpcaChannelDef d; rowOf(_table, ch, &d);
  if(d.pin == 255) return;
  ChanState &s = _st[ch];

  if(targetQus == 0){
    /* Maestro convention: target 0 stops the pulses (servo goes limp).
       Asked for deliberately, so we no longer claim to know where it is. */
    s.target = 0; s.aim = 0; s.active = false; s.known = false; s.vel256 = 0;
    offChannel(ch);
    return;
  }
  uint16_t lo = d.min < d.max ? d.min : d.max;
  uint16_t hi = d.min < d.max ? d.max : d.min;
  if(targetQus < lo) targetQus = lo;
  if(targetQus > hi) targetQus = hi;

  if(!s.active && !s.known){
    /* nothing has ever driven this channel: snap, like a real Maestro */
    s.pos256 = (int32_t)targetQus << 8;
    s.vel256 = 0; s.active = true; s.known = true;
    s.target = targetQus; s.aim = targetQus;
    s.settled = 0; s.launch = 0;
    writeChannel(ch);
    return;
  }
  if(!s.active && s.known){
    /* released after settling — the part has not moved, so resume from
       the remembered position and ease there properly */
    s.active = true;
    s.lastTicks = 0xFFFF;             /* force a write, the output was off */
  }

  if(s.target != targetQus){ s.settled = 0; s.launch = 0; }
  s.target = targetQus;

  /* MPCA_EASE_OVERSHOOT: aim a little beyond, then settle back. Only on
     moves big enough for it to read as weight rather than as a wobble. */
  if(s.ease == MPCA_EASE_OVERSHOOT){
    int32_t d32 = (int32_t)targetQus - ((s.pos256 + 128) >> 8);
    int32_t dist = d32 < 0 ? -d32 : d32;
    if(dist > (int32_t)(hi - lo) / 8){
      int32_t over = dist / 12;
      int32_t a = (int32_t)targetQus + (d32 > 0 ? over : -over);
      if(a < lo) a = lo;
      if(a > hi) a = hi;
      s.aim = (uint16_t)a;
      return;
    }
  }
  s.aim = targetQus;
}

/* generators own the position outright — the waveform IS the motion, so
   there is nothing for the speed limiter to do */
void MaestroPCA::driveChannel(uint8_t ch, uint16_t qus){
  if(ch >= _count) return;
  MpcaChannelDef d; rowOf(_table, ch, &d);
  if(d.pin == 255) return;
  ChanState &s = _st[ch];
  uint16_t lo = d.min < d.max ? d.min : d.max;
  uint16_t hi = d.min < d.max ? d.max : d.min;
  if(qus < lo) qus = lo;
  if(qus > hi) qus = hi;
  if(!s.active){ s.active = true; s.known = true; s.lastTicks = 0xFFFF; }
  s.pos256 = (int32_t)qus << 8;
  s.vel256 = 0;
  s.target = qus; s.aim = qus;
  s.settled = 0;                       /* a generator never goes quiet */
  writeChannel(ch);
}

void MaestroPCA::setTargetMiniSSC(uint8_t ch, uint8_t v){
  if(ch >= _count) return;
  MpcaChannelDef d; rowOf(_table, ch, &d);
  if(d.pin == 255) return;
  uint16_t lo = d.min < d.max ? d.min : d.max;
  uint16_t hi = d.min < d.max ? d.max : d.min;
  if(v > 254) v = 254;
  setTarget(ch, lo + (uint16_t)(((uint32_t)(hi - lo) * v + 127) / 254));
}

void MaestroPCA::setSpeed(uint8_t ch, uint16_t speed){ if(ch<_count) _st[ch].speed = speed; }
void MaestroPCA::setAcceleration(uint8_t ch, uint8_t accel){ if(ch<_count) _st[ch].accel = accel; }

uint16_t MaestroPCA::getPosition(uint8_t ch) const {
  if(ch >= _count || !_st[ch].active) return 0;
  return (uint16_t)((_st[ch].pos256 + 128) >> 8);
}

uint8_t MaestroPCA::getMovingState(){
  for(uint8_t i=0; i<_count; i++)
    if(_st[i].active && _st[i].pos256 != ((int32_t)_st[i].aim << 8)) return 1;
  return 0;
}

/* ---------------------------------------------------------- generators */

/* 0..255 tracing lo → hi → lo across one period, easing to a stop at each
   end (smoothstep over a triangle) so the turn never jerks. `phase`
   offsets one entry from another, e.g. a pan against a tilt. */
uint16_t MaestroPCA::smoothPingPong(uint32_t t, uint16_t period, uint16_t phaseDeg){
  if(!period) return 0;
  uint32_t off = ((uint32_t)phaseDeg % 360) * period / 360;
  uint32_t p   = ((t + off) % period) * 65536UL / period;      /* 0..65535 */
  uint32_t u   = (p < 32768) ? (p * 2) : ((65535 - p) * 2);    /* triangle */
  uint32_t un  = u >> 8;                                       /* 0..255   */
  if(un > 255) un = 255;
  return (uint16_t)((un * un * (765 - 2 * un)) / 65025);       /* smoothstep */
}

uint16_t MaestroPCA::nextRandom(uint16_t lo, uint16_t hi){
  _rng ^= _rng << 13; _rng ^= _rng >> 17; _rng ^= _rng << 5;
  if(hi <= lo) return lo;
  return lo + (uint16_t)((_rng >> 8) % (uint32_t)(hi - lo + 1));
}

/* --------------------------------------------------------------- loop */

void MaestroPCA::update(){
  uint32_t now = millis();
  uint32_t elapsed = now - _lastMs;
  if(!elapsed) return;
  if(elapsed > 250) elapsed = 250;    /* a blocking sketch must not cause a stampede */
  _lastMs = now;

  for(uint8_t i = 0; i < MPCA_MAX_TRACKS; i++){
    Track &t = _tk[i];
    if(t.seq < 0) continue;
    MpcaSeqDef sd; memcpy_P(&sd, &_seqs[t.seq], sizeof(MpcaSeqDef));
    if(!sd.frameCount){ t.seq = -1; continue; }

    if(sd.flags & MPCA_SEQ_GENERATOR){
      uint32_t before = t.frameT;
      t.frameT += elapsed;
      for(uint16_t e = 0; e < sd.frameCount; e++){
        const uint16_t* g = sd.data + (uint32_t)e * 5;
        uint16_t ch     = pgm_read_word(&g[0]);
        uint16_t lo     = pgm_read_word(&g[1]);
        uint16_t hi     = pgm_read_word(&g[2]);
        uint16_t period = pgm_read_word(&g[3]);
        uint16_t phase  = pgm_read_word(&g[4]);
        if(ch >= _count || !period) continue;
        if(sd.flags & MPCA_SEQ_OSC){
          uint16_t s = smoothPingPong(t.frameT, period, phase);
          driveChannel((uint8_t)ch, lo + (uint16_t)(((uint32_t)(hi - lo) * s) / 255));
        }else{
          uint32_t off = ((uint32_t)phase % 360) * period / 360;
          if(before == 0 || ((before + off) / period) != ((t.frameT + off) / period))
            setTarget((uint8_t)ch, nextRandom(lo, hi));
        }
      }
      continue;                        /* generators never end on their own */
    }

    if(t.frame < 0){ t.frame = 0; t.frameT = 0; applyFrame(i, 0); }
    else t.frameT += elapsed;

    while(t.frame < (int16_t)sd.frameCount){
      uint16_t dur = pgm_read_word(&sd.data[(uint32_t)t.frame * (1 + _count)]);
      if(t.frameT < dur) break;
      t.frameT -= dur;
      t.frame++;
      if(t.frame < (int16_t)sd.frameCount) applyFrame(i, t.frame);
    }

    if(t.frame >= (int16_t)sd.frameCount){
      if(sd.flags & MPCA_SEQ_LOOP){
        /* keep the leftover milliseconds, so a looping idle does not
           drift a few ms slower on every pass round */
        t.frame = 0;
        applyFrame(i, 0);
      }else{
        t.seq = -1;
      }
    }
  }

  bgResume();                          /* an idle picks up once it can */

  _tickAcc += (uint8_t)((elapsed > 200) ? 200 : elapsed);
  while(_tickAcc >= 10){
    _tickAcc -= 10;
    for(uint8_t c = 0; c < _count; c++)
      if(_st[c].active) stepChannel(c);
  }
}

void MaestroPCA::applyFrame(uint8_t track, uint16_t f){
  if(_tk[track].seq < 0) return;
  const uint16_t* row = (const uint16_t*)pgm_read_ptr(&_seqs[_tk[track].seq].data);
  if(!row) return;
  row += (uint32_t)f * (1 + _count) + 1;      /* skip the duration word */
  for(uint8_t c=0; c<_count; c++){
    uint16_t t = pgm_read_word(&row[c]);
    if(t != 0) setTarget(c, t);               /* 0 = frame leaves it alone */
  }
}

/* ---------------------------------------------------------- kinematics */

uint32_t MaestroPCA::isqrt32(uint32_t v){
  uint32_t r = 0, bit = 1UL << 30;
  while(bit > v) bit >>= 2;
  while(bit){
    if(v >= r + bit){ v -= r + bit; r = (r >> 1) + bit; }
    else r >>= 1;
    bit >>= 2;
  }
  return r;
}

void MaestroPCA::stepChannel(uint8_t ch){
  ChanState &s = _st[ch];
  int32_t T = (int32_t)s.aim << 8;
  int32_t d = T - s.pos256;

  if(d == 0 && s.vel256 == 0){
    /* arrived. If we overshot deliberately, come back to the real target;
       otherwise start counting toward release. */
    if(s.aim != s.target){ s.aim = s.target; s.launch = 0; return; }
    if(s.releaseMs){
      if(s.settled < 0xFFFF) s.settled++;
      if((uint32_t)s.settled * 10 >= s.releaseMs){
        /* stop pulsing: silent, cool, no current — but remember where it
           is, so the next command eases from here instead of snapping */
        s.active = false;
        offChannel(ch);
      }
    }
    return;
  }
  s.settled = 0;
  if(s.launch < 0xFFFF) s.launch++;

  uint16_t speed = s.speed;
  uint8_t  accel = s.accel;

  if(speed == 0 && accel == 0){
    s.pos256 = T; s.vel256 = 0;
    writeChannel(ch);
    return;
  }

  int8_t dir = (d >= 0) ? 1 : -1;
  int32_t dist = (d >= 0) ? d : -d;
  int32_t vmax = speed ? ((int32_t)speed << 8) : 0x20000000L;

  if(accel == 0){
    /* pure speed limit: constant crawl, no ramp */
    int32_t step = (dist < vmax) ? dist : vmax;
    s.pos256 += dir * step;
    s.vel256 = 0;
  }else{
    int32_t a = (int32_t)accel << 5;            /* accel × 256 / 8 ticks-per-80ms */
    /* MPCA_EASE_SOFT: let the acceleration itself come in over the first
       8 ticks, so the move breathes into motion rather than stepping. */
    if(s.ease == MPCA_EASE_SOFT && s.launch < 8){
      a = (a * (int32_t)(s.launch + 1)) / 8;
      if(a < 1) a = 1;
    }
    int32_t v = dir * s.vel256;                 /* component toward the aim */
    v += a;
    if(v > vmax) v = vmax;
    /* never go faster than we can still stop from within dist:
       v ≤ √(2·a·dist), at quarter-µs granularity so the AVR stays inside
       32 bits — √(2·(A·32)·(dq·256)) = 128·√(A·dq), +1 count so a
       stationary channel one count away still moves */
    uint32_t dq = (uint32_t)(dist >> 8);
    int32_t vstop = (int32_t)(128UL * isqrt32((uint32_t)accel * dq)) + 256;
    if(v > vstop) v = vstop;
    if(v > dist) v = dist;                      /* no overshoot inside one tick */
    s.pos256 += dir * v;
    s.vel256 = dir * v;
  }
  /* Clamp the POSITION, not just the target. Reversing direction while
     some velocity remains from the previous move can otherwise carry a
     channel a little past its calibrated endpoint — small, but endpoints
     are exactly what stop a panel binding against the shell. */
  if(s.pos256 < ((int32_t)s.lo << 8)){ s.pos256 = (int32_t)s.lo << 8; s.vel256 = 0; }
  if(s.pos256 > ((int32_t)s.hi << 8)){ s.pos256 = (int32_t)s.hi << 8; s.vel256 = 0; }
  if(s.pos256 == T) s.vel256 = 0;
  writeChannel(ch);
}

void MaestroPCA::writeChannel(uint8_t ch){
  MpcaChannelDef d; rowOf(_table, ch, &d);
  if(d.pin == 255) return;
  uint16_t code = _out->code(d.board, d.pin, (uint16_t)((_st[ch].pos256 + 128) >> 8));
  if(code == _st[ch].lastTicks) return;    /* nothing new to say on the bus */
  _st[ch].lastTicks = code;
  _out->writeCode(d.board, d.pin, code);
}

void MaestroPCA::offChannel(uint8_t ch){
  MpcaChannelDef d; rowOf(_table, ch, &d);
  if(d.pin == 255) return;
  _st[ch].lastTicks = 0xFFFF;
  _out->off(d.board, d.pin);
}
