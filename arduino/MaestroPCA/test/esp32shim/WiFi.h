/* Host shim: the ESP32 sketches say `#include <WiFi.h>`, and everything
   they then use is already faked in esp32env.h. This file exists so the
   include RESOLVES — without it the whole ESP32 compile check failed at
   its first line and had been doing so silently, because run.sh sends the
   compiler's stderr to /dev/null. A check nobody can see fail is not a
   check (v1.53.0). */
#ifndef WIFI_SHIM
#define WIFI_SHIM
#include "esp32env.h"
#endif
