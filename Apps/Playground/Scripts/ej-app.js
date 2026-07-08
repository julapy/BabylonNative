(function(babylonjs, webCore) {
  "use strict";
  const TAG = "[EJXCREATOR]";
  const ARTWORK_ID = "Artwork-00d587a3-7bc8-432d-b7ad-5982666873e0";
  const LAUNCH_BASE = webCore.IS_BABYLON_NATIVE_JSCORE ? "https://launch.eyejack.io" : "/launch-proxy";
  const CDN_HOST = "https://cdn.eyejackapp.com";
  const CDN_PROXY = "/cdn-proxy";
  function resolveAssetUrl(url) {
    if (webCore.IS_BABYLON_NATIVE_JSCORE) {
      return url;
    }
    return url.startsWith(CDN_HOST) ? url.replace(CDN_HOST, CDN_PROXY) : url;
  }
  class Main extends webCore.AppWebXRSimple {
    constructor() {
      let renderCanvas = void 0;
      if (!webCore.IS_BABYLON_NATIVE_JSCORE) {
        renderCanvas = document.getElementById("renderCanvas");
      }
      super(renderCanvas);
    }
    initXROptions() {
      const options = new webCore.XRModuleSessionOptions();
      options.enableHitTest = true;
      options.disableDefaultUI = webCore.IS_BABYLON_NATIVE_JSCORE;
      return options;
    }
    initCustom() {
      const light = new babylonjs.HemisphericLight("light", new babylonjs.Vector3(0, 1, 0), this.scene);
      light.intensity = 1;
    }
    async loadAsync() {
      var _a;
      const url = `${LAUNCH_BASE}/${ARTWORK_ID}/json`;
      console.log(`${TAG} fetching artwork: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`artwork fetch failed: ${response.status} ${response.statusText}`);
      }
      const payload = await response.json();
      if (!webCore.isCreatorArtworkWorld(payload)) {
        throw new Error("artwork is not a world-target (panels) artwork");
      }
      console.log(`${TAG} artwork: ${payload.name ?? "(unnamed)"} — ${((_a = payload.files) == null ? void 0 : _a.length) ?? 0} files`);
      const artwork = {
        ...payload,
        files: (payload.files ?? []).map((file) => ({ ...file, path: resolveAssetUrl(file.path) }))
      };
      await this.setContent(new webCore.CreatorContent(artwork, { showGrid: false, muted: !webCore.IS_BABYLON_NATIVE_JSCORE }));
      console.log(`${TAG} content loaded`);
      if (webCore.IS_BABYLON_NATIVE_JSCORE) {
        setTimeout(() => {
          var _a2;
          console.log(`${TAG} starting XR (native)`);
          (_a2 = this.xrSession) == null ? void 0 : _a2.startXR().then(() => console.log(`${TAG} XR session started`)).catch((e) => console.log(`${TAG} XR start failed: ${(e == null ? void 0 : e.message) ?? e}`));
        }, 2e3);
      }
    }
  }
  console.log(`${TAG} bundle evaluated (jscore=${webCore.IS_BABYLON_NATIVE_JSCORE}, ej-web-core=${webCore.VERSION})`);
  if (!webCore.IS_BABYLON_NATIVE_WEBVIEW) {
    const app = new Main();
    app.init();
    app.loadAsync().then(() => console.log(`${TAG} loadAsync complete`)).catch((e) => {
      const err = e;
      console.log(`${TAG} loadAsync FAILED: ${(err == null ? void 0 : err.message) ?? e}`);
      if (err == null ? void 0 : err.stack) console.log(`${TAG} stack: ${err.stack}`);
    });
    console.log(`${TAG} app initialized`);
  }
})(BABYLON, EJ);
