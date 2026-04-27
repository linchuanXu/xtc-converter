/**
 * Stub implementations for format handlers that require external libraries
 * not available in our WASM build (CHM → chmlib, Word → antiword).
 */
#include "lvstream.h"
#include "lvtinydom.h"

bool DetectCHMFormat(LVStreamRef) { return false; }
bool ImportCHMDocument(LVStreamRef, ldomDocument*, LVDocViewCallback*, CacheLoadingCallback*) { return false; }
bool DetectWordFormat(LVStreamRef) { return false; }
bool ImportWordDocument(LVStreamRef, ldomDocument*, LVDocViewCallback*, CacheLoadingCallback*) { return false; }
