#include "MaestroLink.h"
#include "MaestroPCA.h"

/* CRC-7, polynomial 0x91 — byte-for-byte the routine in Pololu's
   Maestro::writeByte(). Only used when the host enables CRC, which the
   Maestro's factory default and every stock Padawan sketch do not. */
void MaestroLink::crcAdd(uint8_t b){
  if(!_crcEnabled) return;
  _crc ^= b;
  for(uint8_t j = 0; j < 8; j++){
    if(_crc & 1) _crc ^= 0x91;
    _crc >>= 1;
  }
}

/* 0xFF (Mini SSC) is deliberately absent: it carries a full 8-bit target
   and no CRC, so it is handled as a special case in feed(). */
uint8_t MaestroLink::argsFor(uint8_t cmd){
  switch(cmd){
    case 0x84: return 3;    /* set target        ch, lo, hi   */
    case 0x87: return 3;    /* set speed                      */
    case 0x89: return 3;    /* set acceleration               */
    case 0x8A: return 4;    /* set PWM (no equivalent — eaten) */
    case 0x9F: return 0xFF; /* set multiple targets — variable */
    case 0x90: return 1;    /* get position      ch  -> 2     */
    case 0x93: return 0;    /* get moving state      -> 1     */
    case 0xA1: return 0;    /* get errors            -> 2     */
    case 0xA2: return 0;    /* go home                        */
    case 0xA4: return 0;    /* stop script                    */
    case 0xA7: return 1;    /* restart script at subroutine   */
    case 0xA8: return 3;    /* restart with parameter         */
    case 0xAE: return 0;    /* get script status     -> 1     */
    default:   return 0xFE; /* unknown                        */
  }
}

MaestroLink::MaestroLink(MaestroPCA& engine, uint8_t deviceNumber, bool crcEnabled)
: _engine(engine), _deviceNumber(deviceNumber), _crcEnabled(crcEnabled),
  _state(S_IDLE), _cmd(0), _need(0), _got(0), _crc(0),
  _lastCmd(0), _lastArg(0), _count(0), _bad(0)
{}

void MaestroLink::reset(){ _state = S_IDLE; _got = 0; _crc = 0; }

void MaestroLink::begin(uint8_t cmd){
  _cmd  = cmd;
  _got  = 0;
  _need = argsFor(cmd);
  if(_need == 0xFE){                 /* unknown command — resync on the next one */
    _bad++;
    _state = S_IDLE;
    return;
  }
  _state = S_ARGS;
}

/* begin whatever a high-bit byte starts: an addressed header, a Mini SSC,
   or a plain compact command */
void MaestroLink::startByte(uint8_t b){
  if(b == 0xAA){                     /* Pololu protocol: 0xAA, device, cmd&0x7F */
    _crc = 0; crcAdd(b);
    _state = S_POL_DEV;
    return;
  }
  if(b == 0xFF){                     /* Mini SSC: channel, 8-bit target, no CRC */
    _cmd = 0xFF; _got = 0; _need = 2;
    _state = S_ARGS;
    return;
  }
  _crc = 0; crcAdd(b);
  begin(b);
}

uint8_t MaestroLink::feed(uint8_t b, uint8_t* out){
  switch(_state){

    case S_IDLE:
      if(b & 0x80){ startByte(b); break; }
      return 0;                      /* stray data byte between commands — ignore */

    case S_POL_DEV:
      crcAdd(b);
      /* not addressed to us: swallow the command that follows */
      if(_deviceNumber != 255 && b != _deviceNumber){ _state = S_IDLE; return 0; }
      _state = S_POL_CMD;
      return 0;

    case S_POL_CMD:
      crcAdd(b);
      begin(b | 0x80);               /* the host stripped the high bit */
      break;

    case S_ARGS:
      /* Data bytes are 7-bit — only a Mini SSC target can have the high
         bit set. So a command byte arriving mid-command means the one in
         progress was truncated by noise or a dropped byte. Abandon it and
         resync on the new one, rather than eating it as an argument and
         corrupting BOTH commands. This self-resync is exactly what the
         protocol's 7-bit data encoding exists to allow. */
      if(_cmd != 0xFF && (b & 0x80)){
        _bad++;
        startByte(b);
        break;
      }
      if(_cmd != 0xFF) crcAdd(b);
      if(_got < sizeof(_arg)) _arg[_got] = b;
      _got++;
      /* set-multiple-targets announces its own length in the first byte */
      if(_cmd == 0x9F && _got == 1) _need = 2 + _arg[0] * 2;
      break;

    case S_CRC:
      _state = S_IDLE;
      if(b != _crc){ _bad++; return 0; }   /* corrupted — drop it, do not act */
      _count++;
      return execute(out);
  }

  /* have we got a whole command? */
  if(_state == S_ARGS && _need != 0xFF && _got >= _need){
    if(_crcEnabled && _cmd != 0xFF){ _state = S_CRC; return 0; }
    _state = S_IDLE;
    _count++;
    return execute(out);
  }
  /* a zero-argument compact command with CRC still needs its CRC byte */
  if(_state == S_ARGS && _need == 0 && _crcEnabled && _cmd != 0xFF){
    _state = S_CRC;
  }
  return 0;
}

uint8_t MaestroLink::execute(uint8_t* out){
  _lastCmd = _cmd;
  _lastArg = _arg[0];

  switch(_cmd){
    case 0x84:                                   /* set target */
      _engine.setTarget(_arg[0], val14(1));
      break;

    case 0x87:                                   /* set speed */
      _engine.setSpeed(_arg[0], val14(1));
      break;

    case 0x89:                                   /* set acceleration */
      _engine.setAcceleration(_arg[0], (uint8_t)val14(1));
      break;

    case 0x8A:                                   /* set PWM output pin */
      break;                                     /* no equivalent — accepted and ignored */

    case 0x9F: {                                 /* set multiple targets */
      uint8_t n = _arg[0], first = _arg[1];
      for(uint8_t i = 0; i < n; i++) _engine.setTarget(first + i, val14(2 + i * 2));
      break;
    }

    case 0x90: {                                 /* get position -> 2 bytes, low first */
      uint16_t p = _engine.getPosition(_arg[0]);
      out[0] = (uint8_t)(p & 0xFF);
      out[1] = (uint8_t)(p >> 8);
      return 2;
    }

    case 0x93:                                   /* get moving state -> 1 byte */
      out[0] = _engine.getMovingState();
      return 1;

    case 0xA1:                                   /* get errors -> 2 bytes */
      out[0] = 0; out[1] = 0;                    /* nothing here latches errors */
      return 2;

    case 0xA2:                                   /* go home */
      _engine.goHome();
      break;

    case 0xA4:                                   /* stop script */
      _engine.stopScript();
      break;

    case 0xA7:                                   /* restart script at subroutine */
      _engine.restartScript(_arg[0]);            /* subroutine n == sequence slot n */
      break;

    case 0xA8:                                   /* restart with parameter */
      _engine.restartScript(_arg[0]);            /* no script variables — parameter dropped */
      break;

    case 0xAE:                                   /* get script status: 0 running, 1 stopped */
      out[0] = _engine.scriptRunning() ? 0 : 1;
      return 1;

    case 0xFF:                                   /* Mini SSC, 8-bit target */
      _engine.setTargetMiniSSC(_arg[0], _arg[1]);
      break;
  }
  return 0;
}
