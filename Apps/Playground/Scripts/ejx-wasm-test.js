// Immersal WASM feasibility test for Babylon Native (JSCore).
//
// Q: does the real PosePlugin.wasm (3MB emscripten module) instantiate and run
// in JSC's wasm interpreter on device — however slow?
//
// Runs on the JS thread (blocking is fine for a feasibility gate; the Worker
// polyfill is the production plan). Stages, each timed:
//   1. fetch PosePlugin.wasm from the bundle
//   2. sync-compile + instantiate via Module.instantiateWasm (async
//      WebAssembly.instantiate never settles in this environment)
//   3. evaluate the emscripten glue (PosePlugin.js)
//   4. download the lkroom map from api.immersal.com
//   5. icvLoadMap — real wasm execution through the interpreter
//   6. icvLocalize with a synthetic frame — times the per-attempt cost
(function () {
    var TAG = "[EJXWASM]";
    function log(m) { console.log(TAG + " " + m); }
    log("test starting (WebAssembly=" + typeof WebAssembly + ")");

    // JsRuntimeHost's TextDecoder polyfill is UTF-8 only, but the emscripten
    // glue constructs a utf-16le decoder at eval time. Wrap the global with a
    // JS utf-16le fallback (rarely on the hot path — emscripten uses it only
    // for UTF16ToString).
    (function () {
        var NativeTextDecoder = globalThis.TextDecoder;
        function Utf16LEDecoder() { }
        Utf16LEDecoder.prototype.decode = function (input) {
            var u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
            if (u8.byteOffset & 1) { u8 = new Uint8Array(u8); } // align
            var u16 = new Uint16Array(u8.buffer, u8.byteOffset, u8.byteLength >> 1);
            var parts = [];
            var chunk = 0x8000;
            for (var i = 0; i < u16.length; i += chunk) {
                parts.push(String.fromCharCode.apply(null, u16.subarray(i, i + chunk)));
            }
            return parts.join("");
        };
        globalThis.TextDecoder = function (encoding) {
            if (encoding && /utf-?16/i.test(String(encoding))) {
                return new Utf16LEDecoder();
            }
            return new NativeTextDecoder();
        };
    })();

    var t0 = 0;

    // Measure interpreted icvLocalize cost with a realistic-size frame. The
    // synthetic image won't match the map (r < 0 expected) but feature
    // extraction — the bulk of the cost — runs regardless.
    function timeLocalize() {
        try {
            var icvLocalize = Module.cwrap("wasmLocalize", "number", ["number", "number", "number", "number", "number", "number", "number", "number", "number"]);
            var width = 645, height = 1398;
            var pixels = new Uint8Array(width * height);
            // structured noise (gradients + speckle) so the extractor has work to do
            for (var i = 0; i < pixels.length; i++) {
                pixels[i] = (i * 31 + ((i / width) | 0) * 17 + ((i * 2654435761) >>> 24)) & 255;
            }
            var intr = new Float32Array([978.7, 978.7, 323.2, 694.6]);
            var camRot = new Float32Array([0, 0, 0, 1]);

            var ptrPix = Module._malloc(pixels.length);
            Module.HEAPU8.set(pixels, ptrPix);
            var ptrPos = Module._malloc(12);
            var ptrRot = Module._malloc(16);
            var ptrIntr = Module._malloc(16);
            Module.HEAPF32.set(intr, ptrIntr >> 2);
            var ptrCamRot = Module._malloc(16);
            Module.HEAPF32.set(camRot, ptrCamRot >> 2);

            var t = performance.now();
            var r = icvLocalize(ptrPos, ptrRot, width, height, ptrIntr, ptrPix, 1, 0, ptrCamRot);
            var ms = performance.now() - t;
            log("icvLocalize(" + width + "x" + height + ") => " + r + " in " + ms.toFixed(0) + "ms (no-match expected; timing is the result)");

            Module._free(ptrPix); Module._free(ptrPos); Module._free(ptrRot);
            Module._free(ptrIntr); Module._free(ptrCamRot);
        } catch (e) {
            log("localize timing FAILED: " + ((e && e.message) || e));
        }
    }

    function runImmersalTest() {
        try {
            var icvLoadMap = Module.cwrap("icvLoadMap", "number", ["number"]);
            log("cwrap OK");

            var token = "0d9e70de2e6dad37060de2019f11f272c00fc6087fbecf803a4cffec2b24b01c";
            var mapId = 96897;
            var url = "https://api.immersal.com/map?token=" + token + "&id=" + mapId;
            log("downloading map " + mapId + "...");
            fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
                log("map downloaded: " + buf.byteLength + " bytes");
                var bytes = new Uint8Array(buf);
                var ptr = Module._malloc(bytes.length);
                Module.HEAPU8.set(bytes, ptr);
                var t = performance.now();
                var r = icvLoadMap(ptr);
                var ms = performance.now() - t;
                Module._free(ptr);
                log("icvLoadMap => " + r + " in " + ms.toFixed(0) + "ms — " + (r >= 0 ? "SUCCESS: wasm executes on device" : "FAILED"));
                if (r >= 0) {
                    timeLocalize();
                }
            }).catch(function (e) {
                log("map download FAILED: " + ((e && e.message) || e));
            });
        } catch (e) {
            log("test FAILED at cwrap/loadmap: " + ((e && e.message) || e));
        }
    }

    fetch("app:///Scripts/PosePlugin.wasm").then(function (r) { return r.arrayBuffer(); }).then(function (wasmBuf) {
        log("wasm fetched: " + wasmBuf.byteLength + " bytes");
        t0 = performance.now();

        globalThis.Module = {
            instantiateWasm: function (info, receiveInstance) {
                var t = performance.now();
                var mod = new WebAssembly.Module(wasmBuf);
                log("wasm compiled (sync) in " + (performance.now() - t).toFixed(0) + "ms");
                t = performance.now();
                var inst = new WebAssembly.Instance(mod, info);
                log("wasm instantiated in " + (performance.now() - t).toFixed(0) + "ms");
                receiveInstance(inst);
                return inst.exports;
            },
            onRuntimeInitialized: function () {
                log("emscripten runtime initialized, " + (performance.now() - t0).toFixed(0) + "ms total");
                runImmersalTest();
            },
            print: function (m) { log("stdout: " + m); },
            printErr: function (m) { log("stderr: " + m); },
        };

        return fetch("app:///Scripts/PosePlugin.js").then(function (r) { return r.text(); }).then(function (src) {
            log("glue fetched: " + src.length + " chars, evaluating...");
            (0, eval)(src); // indirect eval -> global scope
            log("glue evaluated");
        });
    }).catch(function (e) {
        log("FAILED: " + ((e && e.message) || e) + ((e && e.stack) ? " | " + e.stack.split("\n")[0] : ""));
    });
})();
