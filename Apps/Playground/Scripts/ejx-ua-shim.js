// EyeJack harness shim for Babylon Native (JSCore).
//
// eyejack-web-core detects its runtime via window.navigator.userAgent
// (IS_BABYLON_NATIVE_JSCORE requires "EyeJack" + "BabylonNative", and NOT the
// WKWebView signature). The real EyeJack app wrapper installs this userAgent via
// its Navigator polyfill; the Playground doesn't, so provide it here. Also make
// sure `window` and `window.navigator` exist, since the library reads through them.
(function () {
    var g = typeof globalThis !== "undefined" ? globalThis : this;
    if (typeof g.window === "undefined") {
        g.window = g;
    }
    var nav = g.navigator || g.window.navigator;
    if (!nav) {
        nav = {};
    }
    var UA = "EyeJack/1.0 BabylonNative";
    try {
        Object.defineProperty(nav, "userAgent", { value: UA, configurable: true });
    } catch (e) {
        try { nav.userAgent = UA; } catch (e2) { /* ignore */ }
    }
    try { if (!g.navigator) { g.navigator = nav; } } catch (e) { /* ignore */ }
    try { if (!g.window.navigator) { g.window.navigator = nav; } } catch (e) { /* ignore */ }
    console.log("[EJXSHIM] userAgent=" + (g.window.navigator && g.window.navigator.userAgent));
})();
