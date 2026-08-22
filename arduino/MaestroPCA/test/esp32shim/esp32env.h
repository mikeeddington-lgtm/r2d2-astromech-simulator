/* A fake ESP32 environment, just enough to COMPILE Esp32Droid.ino on the
   host. It runs nothing — the point is to catch the mistakes a compiler
   catches (a mistyped method, a missing argument, a stale API) without
   installing a 2 GB toolchain, and without waiting for Mike to find them
   with a board in his hand.

   What this canNOT tell you: whether the silicon then emits the pulse, or
   whether the WiFi joins. Those need a board.

   MPCA_SHIM_CORE picks which arduino-esp32 API the sketch is compiled
   against — 2 or 3. run.sh builds both, because the two address the LEDC
   peripheral completely differently and until v1.68.0 only the 3.x branch
   had ever been compiled by anything. */
#pragma once
#include <string>
#include <cstdint>
#include <cstdio>

#define ESP32 1
#ifndef MPCA_SHIM_CORE
#define MPCA_SHIM_CORE 3
#endif
#define ESP_ARDUINO_VERSION_MAJOR MPCA_SHIM_CORE

/* --- the LEDC peripheral. Not a no-op: ledcfake.h enforces the core's
   own rules, so a sketch that confuses a GPIO with a channel is caught
   here rather than on a bench. --- */
#define MPCA_FAKE_CORE MPCA_SHIM_CORE
#include "ledcfake.h"

/* --- String, the one Arduino type this sketch really uses --- */
class String : public std::string {
public:
  String() {}
  String(const char* s) : std::string(s?s:"") {}
  String(const std::string& s) : std::string(s) {}
  String(int v){ char b[24]; snprintf(b,sizeof b,"%d",v); assign(b); }
  String(unsigned v){ char b[24]; snprintf(b,sizeof b,"%u",v); assign(b); }
  String(unsigned long v){ char b[24]; snprintf(b,sizeof b,"%lu",v); assign(b); }
  String(long v){ char b[24]; snprintf(b,sizeof b,"%ld",v); assign(b); }
  String operator+(const String& o) const { return String(std::string(*this)+std::string(o)); }
  String& operator+=(const String& o){ append(o); return *this; }
  int toInt() const { return atoi(c_str()); }
};
inline String operator+(const char* a, const String& b){ return String(std::string(a)+std::string(b)); }
#define F(x) (x)

/* --- WiFi --- */
#define WIFI_STA 1
#define WIFI_AP  2
#define WL_CONNECTED 3
struct FakeIP { String toString() const { return String("0.0.0.0"); } };
struct FakeWiFi {
  void mode(int){} void begin(const char*, const char*){}
  int status(){ return WL_CONNECTED; }
  FakeIP localIP(){ return FakeIP(); }
  void softAP(const char*, const char*){}
  FakeIP softAPIP(){ return FakeIP(); }
};
extern FakeWiFi WiFi;

/* --- WebServer, with the handler shapes the sketch passes --- */
#include <functional>
class WebServer {
public:
  WebServer(int){}
  void on(const char*, std::function<void()>){}
  void onNotFound(std::function<void()>){}
  void begin(){}
  void handleClient(){}
  void send(int, const char* = "", const String& = String("")){}
  void send(int, const char*, const char*){}
  void sendHeader(const char*, const char*){}
  bool hasArg(const char*){ return false; }
  String arg(const char*){ return String(""); }
};

/* --- Serial / Serial1 --- */
#define SERIAL_8N1 0x06
#ifndef HEX
#define HEX 16
#endif
struct FakeSerial {
  void begin(unsigned long){} 
  void begin(unsigned long, uint32_t, int, int){}
  int  available(){ return 0; }
  int  read(){ return -1; }
  size_t write(const uint8_t*, size_t){ return 0; }
  void print(const char*){} void print(const String&){}
  void print(int){} void print(unsigned){} void print(long){} void print(unsigned long){}
  void print(int, int){} void print(unsigned, int){} void print(char){}
  void println(){} void println(const char*){} void println(const String&){}
  void println(int){} void println(unsigned){} void println(unsigned long){}
};
extern FakeSerial Serial, Serial1;
