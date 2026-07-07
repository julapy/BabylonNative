#pragma once

#include <napi/env.h>

#include <functional>
#include <string>

namespace Babylon::Embedding::Workers
{
    // Log sink for worker console output (message, logLevel 0=log 1=warn 2=error).
    using LogCallbackT = std::function<void(const char*, int)>;

    // Installs a Web Worker polyfill on the given (main) environment.
    //
    // Each `new Worker(url)` spins up a dedicated Babylon::AppRuntime — its own
    // JS engine instance on its own thread — initialized with the non-graphics
    // polyfills (console, XHR/fetch/Blob/File, TextEncoder/TextDecoder,
    // performance, setTimeout) plus a worker bootstrap providing self,
    // postMessage/onmessage/addEventListener, importScripts (synchronous),
    // location, and JSC compatibility shims (sync-backed WebAssembly.instantiate,
    // utf-16le TextDecoder).
    //
    // Messages are deep-copied between runtimes (structured-clone subset:
    // primitives, plain objects/arrays, ArrayBuffer, TypedArrays).
    void Initialize(Napi::Env env, LogCallbackT logCallback);
}
