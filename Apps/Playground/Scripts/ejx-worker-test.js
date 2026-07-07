// Worker polyfill smoke test for Babylon Native (JSCore).
//
// Stage 1 — echo worker: postMessage round trip with a structured payload
//   (nested object + typed array + ArrayBuffer) in both directions.
// Stage 2 — the real Immersal locworker.js, unmodified: Init handshake, then
//   LoadMap with the lkroom map downloaded on the main runtime, then a timed
//   Localize with a synthetic frame — all executing on the worker thread.
(function () {
    var TAG = "[EJXWORKER]";
    function log(m) { console.log(TAG + " " + m); }
    log("test starting (Worker=" + typeof Worker + ")");
    if (typeof Worker === "undefined") {
        log("FAILED: no Worker global");
        return;
    }

    // ---- stage 1: echo ----
    try {
        var echo = new Worker("app:///Scripts/ejx-echo-worker.js");
        log("echo created: typeof=" + typeof echo
            + " postMessage=" + typeof (echo && echo.postMessage)
            + " terminate=" + typeof (echo && echo.terminate)
            + " keys=" + (echo ? JSON.stringify(Object.getOwnPropertyNames(echo)) : "-")
            + " proto=" + (echo ? JSON.stringify(Object.getOwnPropertyNames(Object.getPrototypeOf(echo) || {})) : "-"));
        echo.onmessage = function (ev) {
            var d = ev.data;
            var ok = d && d.reply === "pong" && d.n === 42
                && d.bytes && d.bytes.length === 4 && d.bytes[2] === 30
                && d.buf && d.buf.byteLength === 8;
            log("echo reply: " + JSON.stringify({ reply: d.reply, n: d.n, b2: d.bytes && d.bytes[2], buf: d.buf && d.buf.byteLength }) + " => " + (ok ? "PASS" : "FAIL"));
            echo.terminate();
            log("echo worker terminated");
            stage2();
        };
        echo.postMessage({ msg: "ping", n: 41, bytes: new Uint8Array([1, 2, 3]), buf: new ArrayBuffer(8) });
        log("echo message posted");
    } catch (e) {
        log("echo stage FAILED: " + e.message);
    }

    // ---- stage 2: real Immersal locworker ----
    function stage2() {
        var t0 = performance.now();
        var loc;
        try {
            loc = new Worker("app:///Scripts/locworker.js");
        } catch (e) {
            log("locworker create FAILED: " + e.message);
            return;
        }
        var mapLoaded = false;
        loc.addEventListener("message", function (ev) {
            var type = ev.data && ev.data.type;
            var data = ev.data && ev.data.data;
            if (type === "Init") {
                log("locworker Init in " + (performance.now() - t0).toFixed(0) + "ms — wasm instantiated on worker thread");
                downloadMapAndLoad();
            } else if (type === "LoadMap") {
                mapLoaded = data >= 0;
                log("locworker LoadMap => " + data + " " + (mapLoaded ? "SUCCESS" : "FAILED"));
                if (mapLoaded) { timedLocalize(); }
            } else if (type === "Localize") {
                log("locworker Localize => r=" + ev.data.data.r + " in " + (performance.now() - tLoc).toFixed(0) + "ms (worker thread; main stayed responsive: " + mainTicks + " ticks)");
                clearInterval(ticker);
                loc.terminate();
                log("ALL STAGES DONE");
            }
        });

        function downloadMapAndLoad() {
            var token = "0d9e70de2e6dad37060de2019f11f272c00fc6087fbecf803a4cffec2b24b01c";
            fetch("https://api.immersal.com/map?token=" + token + "&id=96897").then(function (r) {
                return r.arrayBuffer();
            }).then(function (buf) {
                log("map downloaded on main: " + buf.byteLength + " bytes; posting to worker");
                loc.postMessage({ type: "LoadMap", data: new Uint8Array(buf) });
            }).catch(function (e) {
                log("map download FAILED: " + e.message);
            });
        }

        var tLoc = 0;
        var mainTicks = 0;
        var ticker = 0;
        function timedLocalize() {
            var width = 645, height = 1398;
            var pixels = new Uint8Array(width * height);
            for (var i = 0; i < pixels.length; i++) {
                pixels[i] = (i * 31 + ((i / width) | 0) * 17 + ((i * 2654435761) >>> 24)) & 255;
            }
            var intr = { fx: 978.7, fy: 978.7, ox: 323.2, oy: 694.6 };
            var gyro = { x: 0, y: 0, z: 0, w: 1 };
            var camRot = { x: 0, y: 0, z: 0, w: 1 };
            tLoc = performance.now();
            // Prove the main JS thread stays responsive while the worker chews.
            ticker = setInterval(function () { mainTicks++; }, 100);
            loc.postMessage({ type: "Localize", data: [width, height, intr, pixels, 0, gyro, 0, camRot] });
            log("localize posted (main thread free)");
        }
    }
})();
