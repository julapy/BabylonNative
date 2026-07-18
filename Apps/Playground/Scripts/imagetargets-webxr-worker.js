// imagetargets-webxr worker — runs the imagetargets-webxr wasm tracker off the
// render/JS thread (same role locworker.js plays for Immersal on-device).
//
// The HOST fetches the emscripten glue text and wasm bytes and posts them in
// the Boot message — the worker performs no URL resolution and no fetches, so
// it behaves identically under browsers and Babylon Native's Worker polyfill.
// Instantiation is synchronous (new WebAssembly.Module/Instance) via the
// Module.instantiateWasm hook: async WebAssembly.instantiate never settles on
// the no-JIT JSCore runtime, and sync compile is permitted in workers.
//
// Protocol (request -> response, all responses echo `type`):
//   Boot      {glueText, wasmBytes}                    -> {ok}
//   Init      {w, h, fx, fy, cx, cy}                   -> {ok}
//   AddTarget {id, gray:ArrayBuffer, w, h, physicalWidthM} -> {handle}
//   RemoveTarget {handle}                              -> {ok}
//   ClearTargets {}                                    -> {ok}
//   Process   {gray:ArrayBuffer, w, h, ts}             -> {count, stride, results:Float32Array}
//   PyramidLayout {srcW, srcH, texSize}                 -> {layout:Float32Array}
//                 layout = [texSize, targetW, targetH, nLevels, (r,c,w,h,rotated) x nLevels]
//   ProcessPyramid {rgba:ArrayBuffer, texW, texH, ts}   -> {count, stride, results:Float32Array}
//   SetLimits {maxTrackedInView, globalSearchPerFrame}  -> {ok}
//
// Result slot layout (stride floats per result) is defined by the wasm module:
//   [0] handle, [1] status (1=found 2=tracked 3=extrapolated 0=lost),
//   [2..5] quaternion xyzw, [6..8] translation xyz (meters, target-in-camera),
//   [9] widthM, [10] heightM, [11] framesSinceSeen, [12] timestampMs.

var trackerModule = null;
var framePtr = 0;
var framePtrSize = 0;
var pyramidPtr = 0;
var pyramidPtrSize = 0;

function ensureFramePtr(size) {
  if (framePtrSize >= size) return framePtr;
  if (framePtr) trackerModule._free(framePtr);
  framePtr = trackerModule._malloc(size);
  framePtrSize = size;
  return framePtr;
}

function ensurePyramidPtr(size) {
  if (pyramidPtrSize >= size) return pyramidPtr;
  if (pyramidPtr) trackerModule._free(pyramidPtr);
  pyramidPtr = trackerModule._malloc(size);
  pyramidPtrSize = size;
  return pyramidPtr;
}

function readResults(count) {
  var stride = trackerModule._imagetargets_resultStride();
  var resPtr = trackerModule._imagetargets_resultsPtr();
  // Copy out of the wasm heap before posting.
  var results = new Float32Array(
    trackerModule.HEAPF32.subarray(resPtr / 4, resPtr / 4 + count * stride)
  );
  return { count: count, stride: stride, results: results };
}

function boot(glueText, wasmBytes) {
  // Environment shim: the glue is built ENVIRONMENT=web,worker and probes for
  // window/importScripts; also shadow `process` so Node-based test harnesses
  // don't trip its environment assertion. Harmless where already defined.
  var shim =
    "var process=undefined;" +
    "if(typeof importScripts==='undefined'){var importScripts=function(){};}" +
    "if(typeof self==='undefined'){var self=globalThis;}" +
    "if(!self.location){self.location={href:''};}";
  var factory = new Function(shim + glueText + "\n;return IMAGETARGETSWEBXR;")();
  var bytes = wasmBytes instanceof ArrayBuffer ? new Uint8Array(wasmBytes) : wasmBytes;
  return factory({
    instantiateWasm: function (imports, cb) {
      var m = new WebAssembly.Module(bytes);
      var inst = new WebAssembly.Instance(m, imports);
      cb(inst, m);
      return inst.exports;
    },
  });
}

onmessage = function (e) {
  var type = e.data.type;
  var data = e.data.data || {};
  try {
    if (type === "Boot") {
      Promise.resolve(boot(data.glueText, data.wasmBytes)).then(function (mod) {
        trackerModule = mod;
        postMessage({ type: "Boot", data: { ok: true } });
      }, function (err) {
        postMessage({ type: "Boot", error: String(err) });
      });
      return;
    }
    if (!trackerModule) {
      postMessage({ type: type, error: "worker not booted" });
      return;
    }
    if (type === "Init") {
      trackerModule._imagetargets_init(data.w, data.h, data.fx, data.fy, data.cx, data.cy);
      postMessage({ type: "Init", data: { ok: true } });
    } else if (type === "SetCameraPose") {
      var m = new Float32Array(data.m);
      var mInv = new Float32Array(data.mInv);
      var mp = trackerModule._malloc(64);
      var ip = trackerModule._malloc(64);
      trackerModule.HEAPF32.set(m, mp / 4);
      trackerModule.HEAPF32.set(mInv, ip / 4);
      trackerModule._imagetargets_setCameraPose(mp, ip);
      trackerModule._free(mp);
      trackerModule._free(ip);
      postMessage({ type: "SetCameraPose", data: { ok: true } });
    } else if (type === "SetIntrinsics") {
      trackerModule._imagetargets_setIntrinsics(data.w, data.h, data.fx, data.fy, data.cx, data.cy);
      postMessage({ type: "SetIntrinsics", data: { ok: true } });
    } else if (type === "AddTarget") {
      var gray = new Uint8Array(data.gray);
      var idBytes = trackerModule.lengthBytesUTF8(data.id) + 1;
      var idPtr = trackerModule._malloc(idBytes);
      trackerModule.stringToUTF8(data.id, idPtr, idBytes);
      var imgPtr = trackerModule._malloc(gray.length);
      trackerModule.HEAPU8.set(gray, imgPtr);
      var handle = trackerModule._imagetargets_addTarget(idPtr, imgPtr, data.w, data.h, data.physicalWidthM);
      trackerModule._free(imgPtr);
      trackerModule._free(idPtr);
      postMessage({ type: "AddTarget", data: { handle: handle } });
    } else if (type === "AddTargetPyramid") {
      var trgba = new Uint8Array(data.rgba);
      var tIdBytes = trackerModule.lengthBytesUTF8(data.id) + 1;
      var tIdPtr = trackerModule._malloc(tIdBytes);
      trackerModule.stringToUTF8(data.id, tIdPtr, tIdBytes);
      var tPtr = trackerModule._malloc(trgba.length);
      trackerModule.HEAPU8.set(trgba, tPtr);
      var tHandle = trackerModule._imagetargets_addTargetPyramid(
        tIdPtr, tPtr, data.texW, data.texH, data.srcW, data.srcH, data.physicalWidthM);
      trackerModule._free(tPtr);
      trackerModule._free(tIdPtr);
      postMessage({ type: "AddTargetPyramid", data: { handle: tHandle } });
    } else if (type === "RemoveTarget") {
      trackerModule._imagetargets_removeTarget(data.handle);
      postMessage({ type: "RemoveTarget", data: { ok: true } });
    } else if (type === "ClearTargets") {
      trackerModule._imagetargets_clearTargets();
      postMessage({ type: "ClearTargets", data: { ok: true } });
    } else if (type === "Process") {
      var frame = new Uint8Array(data.gray);
      var ptr = ensureFramePtr(frame.length);
      trackerModule.HEAPU8.set(frame, ptr);
      var count = trackerModule._imagetargets_processFrame(ptr, data.w, data.h, data.ts);
      var res = readResults(count);
      postMessage({ type: "Process", data: res }, [res.results.buffer]);
    } else if (type === "PyramidLayout") {
      var n = trackerModule._imagetargets_pyramidLayout(data.srcW, data.srcH, data.texSize | 0);
      var layoutPtr = trackerModule._imagetargets_resultsPtr();
      var layout = new Float32Array(
        trackerModule.HEAPF32.subarray(layoutPtr / 4, layoutPtr / 4 + n)
      );
      postMessage({ type: "PyramidLayout", data: { layout: layout } }, [layout.buffer]);
    } else if (type === "ProcessPyramid") {
      var rgba = new Uint8Array(data.rgba);
      var pptr = ensurePyramidPtr(rgba.length);
      trackerModule.HEAPU8.set(rgba, pptr);
      var pcount = trackerModule._imagetargets_processPyramid(pptr, data.texW, data.texH, data.ts);
      var pres = readResults(pcount);
      postMessage({ type: "ProcessPyramid", data: pres }, [pres.results.buffer]);
    } else if (type === "DebugFeatures") {
      var fc = trackerModule._imagetargets_debugFeatureCount();
      var fp = trackerModule._imagetargets_debugFeaturesPtr();
      var feats = new Float32Array(
        trackerModule.HEAPF32.subarray(fp / 4, fp / 4 + fc * 4)
      );
      postMessage({ type: "DebugFeatures", data: { count: fc, features: feats } }, [feats.buffer]);
    } else if (type === "SetLimits") {
      trackerModule._imagetargets_setLimits(data.maxTrackedInView, data.globalSearchPerFrame);
      postMessage({ type: "SetLimits", data: { ok: true } });
    } else {
      postMessage({ type: type, error: "unknown message type" });
    }
  } catch (err) {
    postMessage({ type: type, error: String(err) });
  }
};
