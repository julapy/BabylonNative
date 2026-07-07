var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
(function(babylonjs) {
  "use strict";
  class PoseBase {
    constructor() {
      __publicField(this, "position", new babylonjs.Vector3(0, 0, 0));
      __publicField(this, "rotation", babylonjs.Quaternion.Identity());
      __publicField(this, "scale", new babylonjs.Vector3(1, 1, 1));
    }
    setMatrix(matrix) {
      matrix.decompose(this.scale, this.rotation, this.position);
    }
    getMatrix() {
      return babylonjs.Matrix.Compose(this.scale, this.rotation, this.position);
    }
    getMatrixToRef(matrix) {
      return babylonjs.Matrix.ComposeToRef(this.scale, this.rotation, this.position, matrix);
    }
    getPosition() {
      return this.position.clone();
    }
    getPositionToRef(position) {
      return position.copyFrom(this.position);
    }
    getRotation() {
      return this.rotation.clone();
    }
    getRotationToRef(rotation) {
      return rotation.copyFrom(this.rotation);
    }
    getScale() {
      return this.scale.clone();
    }
    getScaleToRef(scale) {
      return scale.copyFrom(this.scale);
    }
    update(_timeDelta) {
    }
    reset() {
      this.position.set(0, 0, 0);
      this.rotation.set(0, 0, 0, 1);
      this.scale.set(1, 1, 1);
    }
  }
  class PoseFilter extends PoseBase {
    constructor() {
      super();
      __publicField(this, "mHistorySize", 8);
      __publicField(this, "mP", new Array(this.mHistorySize));
      __publicField(this, "mX", new Array(this.mHistorySize));
      __publicField(this, "mZ", new Array(this.mHistorySize));
      __publicField(this, "mSamples", 0);
      __publicField(this, "x", new babylonjs.Vector3(0, 0, 0));
      __publicField(this, "z", new babylonjs.Vector3(0, 0, 0));
      __publicField(this, "up", new babylonjs.Vector3(0, 0, 0));
      __publicField(this, "mean", new babylonjs.Vector3(0, 0, 0));
      __publicField(this, "avg", new babylonjs.Vector3(0, 0, 0));
      for (let i = 0; i < this.mHistorySize; i++) {
        this.mP[i] = new babylonjs.Vector3(0, 0, 0);
        this.mX[i] = new babylonjs.Vector3(0, 0, 0);
        this.mZ[i] = new babylonjs.Vector3(0, 0, 0);
      }
    }
    setMatrix(matrix) {
      const idx = this.mSamples % this.mHistorySize;
      this.matrixColumnToVector(matrix, 3, this.mP[idx]);
      this.matrixColumnToVector(matrix, 0, this.mX[idx]);
      this.matrixColumnToVector(matrix, 2, this.mZ[idx]);
      this.mSamples++;
      const n = this.mSamples > this.mHistorySize ? this.mHistorySize : this.mSamples;
      this.position.copyFrom(this.filterAVT(this.mP, n));
      this.x.copyFrom(this.filterAVT(this.mX, n)).normalize();
      this.z.copyFrom(this.filterAVT(this.mZ, n)).normalize();
      babylonjs.Vector3.CrossToRef(this.z, this.x, this.up);
      this.up.normalize();
      babylonjs.Quaternion.FromLookDirectionRHToRef(this.z, this.up, this.rotation);
    }
    matrixColumnToVector(matrix, index, out) {
      out.set(matrix.m[index * 4], matrix.m[index * 4 + 1], matrix.m[index * 4 + 2]);
    }
    filterAVT(buf, n) {
      this.mean.set(0, 0, 0);
      for (let i = 0; i < n; i++) {
        this.mean.addInPlace(buf[i]);
      }
      this.mean.scaleInPlace(1 / n);
      if (n <= 2) {
        return this.mean;
      }
      let s = 0;
      for (let i = 0; i < n; i++) {
        s += babylonjs.Vector3.DistanceSquared(buf[i], this.mean);
      }
      s /= n;
      this.avg.set(0, 0, 0);
      let ib = 0;
      for (let i = 0; i < n; i++) {
        const d = babylonjs.Vector3.DistanceSquared(buf[i], this.mean);
        if (d <= s) {
          this.avg.addInPlace(buf[i]);
          ib++;
        }
      }
      if (ib > 0) {
        this.avg.scaleInPlace(1 / ib);
        return this.avg;
      }
      return this.mean;
    }
    reset() {
      super.reset();
      this.mSamples = 0;
    }
  }
  class PoseSmooth extends PoseBase {
    constructor() {
      super();
      __publicField(this, "warpOutsideThreshold", true);
      __publicField(this, "warpThresholdDistSq", 5 * 5);
      __publicField(this, "warpThresholdCosAngle", Math.cos(20 * Math.PI / 180));
      __publicField(this, "positionTarget", new babylonjs.Vector3(0, 0, 0));
      __publicField(this, "rotationTarget", babylonjs.Quaternion.Identity());
      __publicField(this, "firstData", true);
    }
    setMatrix(matrix) {
      this.positionTarget.set(matrix.m[12], matrix.m[13], matrix.m[14]);
      babylonjs.Quaternion.FromRotationMatrixToRef(matrix, this.rotationTarget);
      if (this.firstData) {
        this.firstData = false;
        this.position.copyFrom(this.positionTarget);
        this.rotation.copyFrom(this.rotationTarget);
      }
    }
    update(timeDelta) {
      const distSq = babylonjs.Vector3.DistanceSquared(this.position, this.positionTarget);
      const cosAngle = babylonjs.Quaternion.Dot(this.rotation, this.rotationTarget);
      if (this.warpOutsideThreshold && (distSq > this.warpThresholdDistSq || cosAngle < this.warpThresholdCosAngle)) {
        this.position.copyFrom(this.positionTarget);
        this.rotation.copyFrom(this.rotationTarget);
      } else {
        const smoothing = 0.025;
        let steps = timeDelta / (1 / 60);
        if (steps < 1) {
          steps = 1;
        } else if (steps > 6) {
          steps = 6;
        }
        const alpha = 1 - Math.pow(1 - smoothing, steps);
        babylonjs.Vector3.LerpToRef(this.position, this.positionTarget, alpha, this.position);
        babylonjs.Quaternion.SlerpToRef(this.rotation, this.rotationTarget, alpha, this.rotation);
      }
    }
    reset() {
      super.reset();
      this.positionTarget.set(0, 0, 0);
      this.rotationTarget.set(0, 0, 0, 1);
      this.firstData = true;
    }
  }
  class PoseConstraints extends PoseBase {
    constructor() {
      super();
      __publicField(this, "constraintPositionX");
      __publicField(this, "constraintPositionY");
      __publicField(this, "constraintPositionZ");
      __publicField(this, "_rotation", new babylonjs.Vector3(0, 0, 0));
      __publicField(this, "constraintRotationX");
      __publicField(this, "constraintRotationY");
      __publicField(this, "constraintRotationZ");
    }
    update() {
      if (this.constraintPositionX) {
        this.position.x = this.constraintPositionX;
      }
      if (this.constraintPositionY) {
        this.position.y = this.constraintPositionY;
      }
      if (this.constraintPositionZ) {
        this.position.z = this.constraintPositionZ;
      }
      if (this.constraintRotationX !== void 0 || this.constraintRotationY !== void 0 || this.constraintRotationZ !== void 0) {
        this.rotation.toEulerAnglesToRef(this._rotation);
        this._rotation.x = this.constraintRotationX ?? this._rotation.x;
        this._rotation.y = this.constraintRotationY ?? this._rotation.y;
        this._rotation.z = this.constraintRotationZ ?? this._rotation.z;
        this.rotation.copyFrom(babylonjs.Quaternion.FromEulerAngles(this._rotation.x, this._rotation.y, this._rotation.z));
      }
    }
    reset() {
      super.reset();
      this.constraintPositionX = void 0;
      this.constraintPositionY = void 0;
      this.constraintPositionZ = void 0;
      this.constraintRotationX = void 0;
      this.constraintRotationY = void 0;
      this.constraintRotationZ = void 0;
    }
  }
  class Pose extends PoseBase {
    constructor() {
      super();
      __publicField(this, "matricesToProcess", []);
      __publicField(this, "poseFilter");
      __publicField(this, "poseSmooth");
      __publicField(this, "poseConstraints");
    }
    enablePoseFilter() {
      if (!this.poseFilter) this.poseFilter = new PoseFilter();
    }
    enablePoseSmooth() {
      if (!this.poseSmooth) this.poseSmooth = new PoseSmooth();
    }
    setPositionConstraints({ positionX, positionY, positionZ }) {
      if (!this.poseConstraints) {
        this.poseConstraints = new PoseConstraints();
      }
      this.poseConstraints.constraintPositionX = positionX;
      this.poseConstraints.constraintPositionY = positionY;
      this.poseConstraints.constraintPositionZ = positionZ;
    }
    setRotationConstraints({ rotationX, rotationY, rotationZ }) {
      if (!this.poseConstraints) {
        this.poseConstraints = new PoseConstraints();
      }
      this.poseConstraints.constraintRotationX = rotationX;
      this.poseConstraints.constraintRotationY = rotationY;
      this.poseConstraints.constraintRotationZ = rotationZ;
    }
    setMatrix(matrix) {
      this.matricesToProcess.push(matrix.clone());
    }
    update(timeDelta) {
      const matrix = this.getMatrix();
      if (this.matricesToProcess.length > 0) {
        if (this.poseFilter) {
          for (let i = 0; i < this.matricesToProcess.length; i++) {
            const matrixToProcess = this.matricesToProcess[i];
            this.poseFilter.setMatrix(matrixToProcess);
          }
          this.poseFilter.getMatrixToRef(matrix);
        } else {
          const lastMatrix = this.matricesToProcess[this.matricesToProcess.length - 1];
          matrix.copyFrom(lastMatrix);
        }
        if (this.poseSmooth) {
          this.poseSmooth.setMatrix(matrix);
        }
      }
      this.matricesToProcess.length = 0;
      if (this.poseSmooth) {
        this.poseSmooth.update(timeDelta);
        this.poseSmooth.getMatrixToRef(matrix);
      }
      if (this.poseConstraints) {
        this.poseConstraints.setMatrix(matrix);
        this.poseConstraints.update();
        this.poseConstraints.getMatrixToRef(matrix);
      }
      super.setMatrix(matrix);
    }
    reset() {
      var _a, _b, _c;
      super.reset();
      (_a = this.poseFilter) == null ? void 0 : _a.reset();
      (_b = this.poseSmooth) == null ? void 0 : _b.reset();
      (_c = this.poseConstraints) == null ? void 0 : _c.reset();
    }
  }
  const ua$1 = typeof window !== "undefined" ? window.navigator.userAgent : "";
  const isWebKit = ua$1.includes("AppleWebKit");
  const isSafari = ua$1.includes("Safari");
  const isVersion = ua$1.includes("Version");
  const isWKWebView = isWebKit && !isSafari && !isVersion;
  const isEyeJackApp = ua$1.includes("EyeJack");
  const isBabylonNative = ua$1.includes("BabylonNative");
  const IS_EYEJACK_APP = isEyeJackApp;
  const IS_BABYLON_NATIVE = isEyeJackApp && isBabylonNative;
  const IS_BABYLON_NATIVE_WEBVIEW = isEyeJackApp && isBabylonNative && isWKWebView;
  const IS_BABYLON_NATIVE_JSCORE = isEyeJackApp && isBabylonNative && !isWKWebView;
  class Utils {
    /**
     * Generate a full UUID (36 chars)
     * e.g., "550e8400-e29b-41d4-a716-446655440000"
     */
    static UUID() {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === "x" ? r : r & 3 | 8;
        return v.toString(16);
      });
    }
    /**
     * Generate a short UUID (16 chars)
     * e.g., "a1b2c3d4e5f67890"
     */
    static UUIDShort() {
      return "xxxxxxxxxxxxxxxx".replace(/[x]/g, () => {
        const r = Math.random() * 16 | 0;
        return r.toString(16);
      });
    }
  }
  class ImmersalBase {
    constructor(token, mapIds) {
      __publicField(this, "token", "");
      __publicField(this, "mapIds", []);
      this.token = token;
      this.mapIds = mapIds;
    }
    async init() {
      return Promise.reject(new Error("immersal.base.init must be overridden in the subclass"));
    }
    async loadMap(_url) {
      return Promise.reject(new Error("immersal.base.loadMap must be overridden in the subclass"));
    }
    async localize(_imageData, _imageWidth, _imageHeight, _intrinsics) {
      return Promise.reject(new Error("immersal.base.localize must be overridden in the subclass"));
    }
  }
  const _Bridge = class _Bridge {
    constructor() {
      __publicField(this, "callbacks", []);
      __publicField(this, "subs", []);
      if (typeof window !== "undefined") {
        window.ejx = window.ejx || {};
        window.ejx.response = window.ejx.response || _Bridge.ResponseCallback;
      }
      _Bridge.instances.push(this);
    }
    dispose() {
      const index = _Bridge.instances.indexOf(this);
      if (index !== -1) {
        _Bridge.instances.splice(index, 1);
      }
    }
    send(message, resolve, reject) {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      const callback = {
        message,
        resolve,
        reject
      };
      this.callbacks.push(callback);
      let sent = true;
      if ((_b = (_a = window.webkit) == null ? void 0 : _a.messageHandlers) == null ? void 0 : _b.eyejack) {
        (_e = (_d = (_c = window.webkit) == null ? void 0 : _c.messageHandlers) == null ? void 0 : _d.eyejack) == null ? void 0 : _e.postMessage(message);
      } else if ((_f = window.ARCore) == null ? void 0 : _f.eyejackMessage) {
        (_h = (_g = window.ARCore) == null ? void 0 : _g.eyejackMessage) == null ? void 0 : _h.call(_g, message);
      } else {
        sent = false;
      }
      if (!sent) {
        console.error("Bridge.send failed.");
        this.callbacks.pop();
      }
    }
    subscribe(uuid, func) {
      const subIndex = this.subs.findIndex((sub) => sub.uuid === uuid);
      if (subIndex === -1) {
        const sub = {
          uuid,
          func
        };
        this.subs.push(sub);
      }
    }
    unsubscribe(uuid) {
      const subIndex = this.subs.findIndex((sub) => sub.uuid === uuid);
      if (subIndex !== -1) {
        this.subs.splice(subIndex, 1);
      }
    }
    response(message) {
      const callbackIndex = this.callbacks.findIndex((callback) => callback.message.uuid === message.uuid);
      if (callbackIndex !== -1) {
        const callback = this.callbacks[callbackIndex];
        this.callbacks.splice(callbackIndex, 1);
        if (message) {
          callback.resolve(message.data);
        } else {
          callback.reject(new Error("Bridge.response error - callback response returned undefined."));
        }
      }
      const subIndex = this.subs.findIndex((sub) => sub.uuid === message.uuid);
      if (subIndex !== -1) {
        const sub = this.subs[subIndex];
        if (message) {
          sub.func(message.data);
        } else {
          console.error("Bridge.response error - subscription response returned undefined.");
        }
      }
    }
  };
  __publicField(_Bridge, "instances", []);
  __publicField(_Bridge, "ResponseCallback", (data) => {
    _Bridge.instances.forEach((instance) => {
      instance.response(data);
    });
  });
  let Bridge = _Bridge;
  const BridgeMessageTypeImmersalLoadMap = "immersal/loadmap";
  const BridgeMessageTypeImmersalLocalizeOnDevice = "immersal/localizeondevice";
  const BridgeMessageTypeImmersalLocalizeOnCloud = "immersal/localizeoncloud";
  const BridgeMessageTypeMediaRecorderStart = "mediarecorder/start";
  const BridgeMessageTypeMediaRecorderStop = "mediarecorder/stop";
  const BridgeMessageTypeShare = "share";
  class BridgeImmersal extends Bridge {
    constructor() {
      super();
    }
    async loadMapFromImmersalApi(token, mapId) {
      const path = "https://api.immersal.com/map?token=" + token + "&id=" + mapId;
      return this.loadMapFromPath(path);
    }
    async loadMapFromPath(path) {
      return new Promise((resolve, reject) => {
        const message = {
          uuid: Utils.UUID(),
          type: BridgeMessageTypeImmersalLoadMap,
          data: {
            path
          }
        };
        this.send(message, resolve, reject);
      });
    }
    async localizeOnDevice() {
      return new Promise((resolve, reject) => {
        const message = {
          uuid: Utils.UUID(),
          type: BridgeMessageTypeImmersalLocalizeOnDevice,
          data: void 0
        };
        this.send(message, resolve, reject);
      });
    }
    async localizeOnCloud(token, mapIds) {
      return new Promise((resolve, reject) => {
        const message = {
          uuid: Utils.UUID(),
          type: BridgeMessageTypeImmersalLocalizeOnCloud,
          data: {
            token,
            mapIds
          }
        };
        this.send(message, resolve, reject);
      });
    }
  }
  class ImmersalAppDevice extends ImmersalBase {
    constructor(token, mapIds) {
      super(token, mapIds);
      __publicField(this, "bridge");
      this.bridge = new BridgeImmersal();
    }
    async init() {
      console.warn("immersal.app.device.init not required.");
      return Promise.resolve();
    }
    async loadMap(url2) {
      return this.bridge.loadMapFromPath(url2);
    }
    async localize(_imageData, _imageWidth, _imageHeight, _intrinsics) {
      try {
        const data = await this.bridge.localizeOnDevice();
        if (data.error) {
          throw new Error("immersal.app.device.localize: failed - " + data.error);
        }
        const locResult = {
          success: false,
          confidence: 0
        };
        if (data.success) {
          let matrix = new babylonjs.Matrix();
          matrix.setRowFromFloats(0, data.r00, -data.r01, -data.r02, data.px);
          matrix.setRowFromFloats(1, data.r10, -data.r11, -data.r12, data.py);
          matrix.setRowFromFloats(2, data.r20, -data.r21, -data.r22, data.pz);
          matrix.setRowFromFloats(3, 0, 0, 0, 1);
          matrix = matrix.transpose();
          locResult.success = true;
          locResult.confidence = data.confidence;
          locResult.matrix = new Float32Array(16);
          matrix.toArray(locResult.matrix, 0);
          if (this.mapIds.length > 0) {
            locResult.map = this.mapIds[0];
          }
        }
        return locResult;
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`${error.message || error}`);
        } else {
          throw new Error(String(error));
        }
      }
    }
  }
  class ImmersalWebDevice extends ImmersalBase {
    constructor(token, mapIds) {
      super(token, mapIds);
      __publicField(this, "locWorker");
    }
    async init() {
      this.locWorker = await new Promise((res) => {
        const workerUrl = new URL("/js/locworker.js", window.location.origin).href;
        const locWorker = new Worker(workerUrl);
        locWorker.addEventListener("message", (ev) => {
          if (ev.data.type === "Init") {
            res(locWorker);
          }
        });
      });
    }
    async loadMap(url2) {
      try {
        const response = await fetch(url2);
        if (!response.ok) {
          throw new Error("immersal.web.device.loadMap: network response was not ok");
        }
        const arrayBuffer = await response.arrayBuffer();
        const mapData = new Uint8Array(arrayBuffer);
        await new Promise((resolve, reject) => {
          const loadMapHandler = (e) => {
            const { type, data } = e.data;
            if (type == "LoadMap") {
              this.locWorker.removeEventListener("message", loadMapHandler);
              const success = data >= 0;
              if (success) {
                resolve();
              } else {
                reject("immersal.web.device.loadMap: locWorker failed to load map");
              }
            }
          };
          this.locWorker.postMessage({ type: "LoadMap", data: mapData });
          this.locWorker.addEventListener("message", loadMapHandler);
        });
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`${error.message || error}`);
        } else {
          throw new Error(String(error));
        }
      }
    }
    async localize(imageData, imageWidth, imageHeight, intrinsics) {
      return new Promise((resolve, reject) => {
        if (!this.locWorker) {
          reject(new Error("immersal.web.device.localize: LocWorker has not been loaded yet."));
          return;
        }
        const SOLVER_TYPE = 0;
        const gyro = { x: 0, y: 0, z: 0, w: 1 };
        const camRot = { x: 0, y: 0, z: 0, w: 1 };
        const intr = {
          fx: intrinsics.focalLength.x,
          fy: intrinsics.focalLength.y,
          ox: intrinsics.principalOffset.x,
          oy: intrinsics.principalOffset.y
        };
        const time = 0;
        const localizeHandler = (e) => {
          const { type, data } = e.data;
          if (type == "Localize") {
            this.locWorker.removeEventListener("message", localizeHandler);
            const locResult = {
              success: false,
              confidence: -1
            };
            const { r, pos, rot, time: time2, gyro: gyro2, focalLength } = data;
            const success = r >= 0;
            if (success) {
              const rotX180 = babylonjs.Quaternion.FromEulerAngles(babylonjs.Tools.ToRadians(180), babylonjs.Tools.ToRadians(0), babylonjs.Tools.ToRadians(0));
              const immersalPos = new babylonjs.Vector3(pos[0], pos[1], pos[2]);
              const immersalRot = new babylonjs.Quaternion(rot[0], rot[1], rot[2], rot[3]).multiplyInPlace(rotX180);
              const immersalScl = new babylonjs.Vector3(1, 1, 1);
              const matrix = babylonjs.Matrix.Compose(immersalScl, immersalRot, immersalPos);
              locResult.success = true;
              locResult.matrix = new Float32Array(16);
              matrix.toArray(locResult.matrix, 0);
              if (this.mapIds.length > 0) {
                locResult.map = this.mapIds[0];
              }
            }
            resolve(locResult);
          }
        };
        this.locWorker.postMessage({ type: "Localize", data: [imageWidth, imageHeight, intr, imageData, time, gyro, SOLVER_TYPE, camRot] });
        this.locWorker.addEventListener("message", localizeHandler);
      });
    }
  }
  var Z_FIXED = 4;
  var Z_BINARY = 0;
  var Z_TEXT = 1;
  var Z_UNKNOWN = 2;
  function zero$1(buf) {
    let len = buf.length;
    while (--len >= 0) buf[len] = 0;
  }
  var STORED_BLOCK = 0;
  var STATIC_TREES = 1;
  var DYN_TREES = 2;
  var LENGTH_CODES = 29;
  var LITERALS = 256;
  var L_CODES = 286;
  var D_CODES = 30;
  var BL_CODES = 19;
  var HEAP_SIZE$1 = 573;
  var MAX_BITS = 15;
  var Buf_size = 16;
  var MAX_BL_BITS = 7;
  var END_BLOCK = 256;
  var REP_3_6 = 16;
  var REPZ_3_10 = 17;
  var REPZ_11_138 = 18;
  var extra_lbits = new Uint8Array([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0
  ]);
  var extra_dbits = new Uint8Array([
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13
  ]);
  var extra_blbits = new Uint8Array([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    3,
    7
  ]);
  var bl_order = new Uint8Array([
    16,
    17,
    18,
    0,
    8,
    7,
    9,
    6,
    10,
    5,
    11,
    4,
    12,
    3,
    13,
    2,
    14,
    1,
    15
  ]);
  var DIST_CODE_LEN = 512;
  var static_ltree = new Array(288 * 2);
  zero$1(static_ltree);
  var static_dtree = new Array(D_CODES * 2);
  zero$1(static_dtree);
  var _dist_code = new Array(DIST_CODE_LEN);
  zero$1(_dist_code);
  var _length_code = new Array(256);
  zero$1(_length_code);
  var base_length = new Array(LENGTH_CODES);
  zero$1(base_length);
  var base_dist = new Array(D_CODES);
  zero$1(base_dist);
  var StaticTreeDesc = class {
    constructor(static_tree, extra_bits, extra_base, elems, max_length) {
      this.static_tree = static_tree;
      this.extra_bits = extra_bits;
      this.extra_base = extra_base;
      this.elems = elems;
      this.max_length = max_length;
      this.has_stree = static_tree && static_tree.length;
    }
  };
  var static_l_desc;
  var static_d_desc;
  var static_bl_desc;
  var TreeDesc = class {
    constructor(dyn_tree, stat_desc) {
      this.dyn_tree = dyn_tree;
      this.max_code = 0;
      this.stat_desc = stat_desc;
    }
  };
  var d_code = (dist) => {
    return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
  };
  var put_short = (s, w) => {
    s.pending_buf[s.pending++] = w & 255;
    s.pending_buf[s.pending++] = w >>> 8 & 255;
  };
  var send_bits = (s, value, length) => {
    if (s.bi_valid > Buf_size - length) {
      s.bi_buf |= value << s.bi_valid & 65535;
      put_short(s, s.bi_buf);
      s.bi_buf = value >> Buf_size - s.bi_valid;
      s.bi_valid += length - Buf_size;
    } else {
      s.bi_buf |= value << s.bi_valid & 65535;
      s.bi_valid += length;
    }
  };
  var send_code = (s, c, tree) => {
    send_bits(s, tree[c * 2], tree[c * 2 + 1]);
  };
  var bi_reverse = (code, len) => {
    let res = 0;
    do {
      res |= code & 1;
      code >>>= 1;
      res <<= 1;
    } while (--len > 0);
    return res >>> 1;
  };
  var bi_flush = (s) => {
    if (s.bi_valid === 16) {
      put_short(s, s.bi_buf);
      s.bi_buf = 0;
      s.bi_valid = 0;
    } else if (s.bi_valid >= 8) {
      s.pending_buf[s.pending++] = s.bi_buf & 255;
      s.bi_buf >>= 8;
      s.bi_valid -= 8;
    }
  };
  var gen_bitlen = (s, desc) => {
    const tree = desc.dyn_tree;
    const max_code = desc.max_code;
    const stree = desc.stat_desc.static_tree;
    const has_stree = desc.stat_desc.has_stree;
    const extra = desc.stat_desc.extra_bits;
    const base = desc.stat_desc.extra_base;
    const max_length = desc.stat_desc.max_length;
    let h;
    let n, m;
    let bits;
    let xbits;
    let f;
    let overflow = 0;
    for (bits = 0; bits <= MAX_BITS; bits++) s.bl_count[bits] = 0;
    tree[s.heap[s.heap_max] * 2 + 1] = 0;
    for (h = s.heap_max + 1; h < HEAP_SIZE$1; h++) {
      n = s.heap[h];
      bits = tree[tree[n * 2 + 1] * 2 + 1] + 1;
      if (bits > max_length) {
        bits = max_length;
        overflow++;
      }
      tree[n * 2 + 1] = bits;
      if (n > max_code) continue;
      s.bl_count[bits]++;
      xbits = 0;
      if (n >= base) xbits = extra[n - base];
      f = tree[n * 2];
      s.opt_len += f * (bits + xbits);
      if (has_stree) s.static_len += f * (stree[n * 2 + 1] + xbits);
    }
    if (overflow === 0) return;
    do {
      bits = max_length - 1;
      while (s.bl_count[bits] === 0) bits--;
      s.bl_count[bits]--;
      s.bl_count[bits + 1] += 2;
      s.bl_count[max_length]--;
      overflow -= 2;
    } while (overflow > 0);
    for (bits = max_length; bits !== 0; bits--) {
      n = s.bl_count[bits];
      while (n !== 0) {
        m = s.heap[--h];
        if (m > max_code) continue;
        if (tree[m * 2 + 1] !== bits) {
          s.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];
          tree[m * 2 + 1] = bits;
        }
        n--;
      }
    }
  };
  var gen_codes = (tree, max_code, bl_count) => {
    const next_code = new Array(16);
    let code = 0;
    let bits;
    let n;
    for (bits = 1; bits <= MAX_BITS; bits++) {
      code = code + bl_count[bits - 1] << 1;
      next_code[bits] = code;
    }
    for (n = 0; n <= max_code; n++) {
      let len = tree[n * 2 + 1];
      if (len === 0) continue;
      tree[n * 2] = bi_reverse(next_code[len]++, len);
    }
  };
  var tr_static_init = () => {
    let n;
    let bits;
    let length;
    let code;
    let dist;
    const bl_count = new Array(16);
    length = 0;
    for (code = 0; code < LENGTH_CODES - 1; code++) {
      base_length[code] = length;
      for (n = 0; n < 1 << extra_lbits[code]; n++) _length_code[length++] = code;
    }
    _length_code[length - 1] = code;
    dist = 0;
    for (code = 0; code < 16; code++) {
      base_dist[code] = dist;
      for (n = 0; n < 1 << extra_dbits[code]; n++) _dist_code[dist++] = code;
    }
    dist >>= 7;
    for (; code < D_CODES; code++) {
      base_dist[code] = dist << 7;
      for (n = 0; n < 1 << extra_dbits[code] - 7; n++) _dist_code[256 + dist++] = code;
    }
    for (bits = 0; bits <= MAX_BITS; bits++) bl_count[bits] = 0;
    n = 0;
    while (n <= 143) {
      static_ltree[n * 2 + 1] = 8;
      n++;
      bl_count[8]++;
    }
    while (n <= 255) {
      static_ltree[n * 2 + 1] = 9;
      n++;
      bl_count[9]++;
    }
    while (n <= 279) {
      static_ltree[n * 2 + 1] = 7;
      n++;
      bl_count[7]++;
    }
    while (n <= 287) {
      static_ltree[n * 2 + 1] = 8;
      n++;
      bl_count[8]++;
    }
    gen_codes(static_ltree, 287, bl_count);
    for (n = 0; n < D_CODES; n++) {
      static_dtree[n * 2 + 1] = 5;
      static_dtree[n * 2] = bi_reverse(n, 5);
    }
    static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, 257, L_CODES, MAX_BITS);
    static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES, MAX_BITS);
    static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES, MAX_BL_BITS);
  };
  var init_block = (s) => {
    let n;
    for (n = 0; n < L_CODES; n++) s.dyn_ltree[n * 2] = 0;
    for (n = 0; n < D_CODES; n++) s.dyn_dtree[n * 2] = 0;
    for (n = 0; n < BL_CODES; n++) s.bl_tree[n * 2] = 0;
    s.dyn_ltree[END_BLOCK * 2] = 1;
    s.opt_len = s.static_len = 0;
    s.sym_next = s.matches = 0;
  };
  var bi_windup = (s) => {
    if (s.bi_valid > 8) put_short(s, s.bi_buf);
    else if (s.bi_valid > 0) s.pending_buf[s.pending++] = s.bi_buf;
    s.bi_buf = 0;
    s.bi_valid = 0;
  };
  var smaller = (tree, n, m, depth) => {
    const _n2 = n * 2;
    const _m2 = m * 2;
    return tree[_n2] < tree[_m2] || tree[_n2] === tree[_m2] && depth[n] <= depth[m];
  };
  var pqdownheap = (s, tree, k) => {
    const v = s.heap[k];
    let j = k << 1;
    while (j <= s.heap_len) {
      if (j < s.heap_len && smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) j++;
      if (smaller(tree, v, s.heap[j], s.depth)) break;
      s.heap[k] = s.heap[j];
      k = j;
      j <<= 1;
    }
    s.heap[k] = v;
  };
  var compress_block = (s, ltree, dtree) => {
    let dist;
    let lc;
    let sx = 0;
    let code;
    let extra;
    if (s.sym_next !== 0) do {
      dist = s.pending_buf[s.sym_buf + sx++] & 255;
      dist += (s.pending_buf[s.sym_buf + sx++] & 255) << 8;
      lc = s.pending_buf[s.sym_buf + sx++];
      if (dist === 0) send_code(s, lc, ltree);
      else {
        code = _length_code[lc];
        send_code(s, code + LITERALS + 1, ltree);
        extra = extra_lbits[code];
        if (extra !== 0) {
          lc -= base_length[code];
          send_bits(s, lc, extra);
        }
        dist--;
        code = d_code(dist);
        send_code(s, code, dtree);
        extra = extra_dbits[code];
        if (extra !== 0) {
          dist -= base_dist[code];
          send_bits(s, dist, extra);
        }
      }
    } while (sx < s.sym_next);
    send_code(s, END_BLOCK, ltree);
  };
  var build_tree = (s, desc) => {
    const tree = desc.dyn_tree;
    const stree = desc.stat_desc.static_tree;
    const has_stree = desc.stat_desc.has_stree;
    const elems = desc.stat_desc.elems;
    let n, m;
    let max_code = -1;
    let node;
    s.heap_len = 0;
    s.heap_max = HEAP_SIZE$1;
    for (n = 0; n < elems; n++) if (tree[n * 2] !== 0) {
      s.heap[++s.heap_len] = max_code = n;
      s.depth[n] = 0;
    } else tree[n * 2 + 1] = 0;
    while (s.heap_len < 2) {
      node = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0;
      tree[node * 2] = 1;
      s.depth[node] = 0;
      s.opt_len--;
      if (has_stree) s.static_len -= stree[node * 2 + 1];
    }
    desc.max_code = max_code;
    for (n = s.heap_len >> 1; n >= 1; n--) pqdownheap(s, tree, n);
    node = elems;
    do {
      n = s.heap[1];
      s.heap[1] = s.heap[s.heap_len--];
      pqdownheap(s, tree, 1);
      m = s.heap[1];
      s.heap[--s.heap_max] = n;
      s.heap[--s.heap_max] = m;
      tree[node * 2] = tree[n * 2] + tree[m * 2];
      s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
      tree[n * 2 + 1] = tree[m * 2 + 1] = node;
      s.heap[1] = node++;
      pqdownheap(s, tree, 1);
    } while (s.heap_len >= 2);
    s.heap[--s.heap_max] = s.heap[1];
    gen_bitlen(s, desc);
    gen_codes(tree, max_code, s.bl_count);
  };
  var scan_tree = (s, tree, max_code) => {
    let n;
    let prevlen = -1;
    let curlen;
    let nextlen = tree[1];
    let count = 0;
    let max_count = 7;
    let min_count = 4;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    }
    tree[(max_code + 1) * 2 + 1] = 65535;
    for (n = 0; n <= max_code; n++) {
      curlen = nextlen;
      nextlen = tree[(n + 1) * 2 + 1];
      if (++count < max_count && curlen === nextlen) continue;
      else if (count < min_count) s.bl_tree[curlen * 2] += count;
      else if (curlen !== 0) {
        if (curlen !== prevlen) s.bl_tree[curlen * 2]++;
        s.bl_tree[REP_3_6 * 2]++;
      } else if (count <= 10) s.bl_tree[REPZ_3_10 * 2]++;
      else s.bl_tree[REPZ_11_138 * 2]++;
      count = 0;
      prevlen = curlen;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      } else if (curlen === nextlen) {
        max_count = 6;
        min_count = 3;
      } else {
        max_count = 7;
        min_count = 4;
      }
    }
  };
  var send_tree = (s, tree, max_code) => {
    let n;
    let prevlen = -1;
    let curlen;
    let nextlen = tree[1];
    let count = 0;
    let max_count = 7;
    let min_count = 4;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    }
    for (n = 0; n <= max_code; n++) {
      curlen = nextlen;
      nextlen = tree[(n + 1) * 2 + 1];
      if (++count < max_count && curlen === nextlen) continue;
      else if (count < min_count) do
        send_code(s, curlen, s.bl_tree);
      while (--count !== 0);
      else if (curlen !== 0) {
        if (curlen !== prevlen) {
          send_code(s, curlen, s.bl_tree);
          count--;
        }
        send_code(s, REP_3_6, s.bl_tree);
        send_bits(s, count - 3, 2);
      } else if (count <= 10) {
        send_code(s, REPZ_3_10, s.bl_tree);
        send_bits(s, count - 3, 3);
      } else {
        send_code(s, REPZ_11_138, s.bl_tree);
        send_bits(s, count - 11, 7);
      }
      count = 0;
      prevlen = curlen;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      } else if (curlen === nextlen) {
        max_count = 6;
        min_count = 3;
      } else {
        max_count = 7;
        min_count = 4;
      }
    }
  };
  var build_bl_tree = (s) => {
    let max_blindex;
    scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
    scan_tree(s, s.dyn_dtree, s.d_desc.max_code);
    build_tree(s, s.bl_desc);
    for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) if (s.bl_tree[bl_order[max_blindex] * 2 + 1] !== 0) break;
    s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
    return max_blindex;
  };
  var send_all_trees = (s, lcodes, dcodes, blcodes) => {
    let rank2;
    send_bits(s, lcodes - 257, 5);
    send_bits(s, dcodes - 1, 5);
    send_bits(s, blcodes - 4, 4);
    for (rank2 = 0; rank2 < blcodes; rank2++) send_bits(s, s.bl_tree[bl_order[rank2] * 2 + 1], 3);
    send_tree(s, s.dyn_ltree, lcodes - 1);
    send_tree(s, s.dyn_dtree, dcodes - 1);
  };
  var detect_data_type = (s) => {
    let block_mask = 4093624447;
    let n;
    for (n = 0; n <= 31; n++, block_mask >>>= 1) if (block_mask & 1 && s.dyn_ltree[n * 2] !== 0) return Z_BINARY;
    if (s.dyn_ltree[18] !== 0 || s.dyn_ltree[20] !== 0 || s.dyn_ltree[26] !== 0) return Z_TEXT;
    for (n = 32; n < LITERALS; n++) if (s.dyn_ltree[n * 2] !== 0) return Z_TEXT;
    return Z_BINARY;
  };
  var static_init_done = false;
  var _tr_init = (s) => {
    if (!static_init_done) {
      tr_static_init();
      static_init_done = true;
    }
    s.l_desc = new TreeDesc(s.dyn_ltree, static_l_desc);
    s.d_desc = new TreeDesc(s.dyn_dtree, static_d_desc);
    s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);
    s.bi_buf = 0;
    s.bi_valid = 0;
    init_block(s);
  };
  var _tr_stored_block = (s, buf, stored_len, last2) => {
    send_bits(s, (STORED_BLOCK << 1) + (last2 ? 1 : 0), 3);
    bi_windup(s);
    put_short(s, stored_len);
    put_short(s, ~stored_len);
    if (stored_len) s.pending_buf.set(s.window.subarray(buf, buf + stored_len), s.pending);
    s.pending += stored_len;
  };
  var _tr_align = (s) => {
    send_bits(s, STATIC_TREES << 1, 3);
    send_code(s, END_BLOCK, static_ltree);
    bi_flush(s);
  };
  var _tr_flush_block = (s, buf, stored_len, last2) => {
    let opt_lenb, static_lenb;
    let max_blindex = 0;
    if (s.level > 0) {
      if (s.strm.data_type === Z_UNKNOWN) s.strm.data_type = detect_data_type(s);
      build_tree(s, s.l_desc);
      build_tree(s, s.d_desc);
      max_blindex = build_bl_tree(s);
      opt_lenb = s.opt_len + 3 + 7 >>> 3;
      static_lenb = s.static_len + 3 + 7 >>> 3;
      if (static_lenb <= opt_lenb) opt_lenb = static_lenb;
    } else opt_lenb = static_lenb = stored_len + 5;
    if (stored_len + 4 <= opt_lenb && buf !== -1) _tr_stored_block(s, buf, stored_len, last2);
    else if (s.strategy === Z_FIXED || static_lenb === opt_lenb) {
      send_bits(s, (STATIC_TREES << 1) + (last2 ? 1 : 0), 3);
      compress_block(s, static_ltree, static_dtree);
    } else {
      send_bits(s, (DYN_TREES << 1) + (last2 ? 1 : 0), 3);
      send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
      compress_block(s, s.dyn_ltree, s.dyn_dtree);
    }
    init_block(s);
    if (last2) bi_windup(s);
  };
  var _tr_tally = (s, dist, lc) => {
    s.pending_buf[s.sym_buf + s.sym_next++] = dist;
    s.pending_buf[s.sym_buf + s.sym_next++] = dist >> 8;
    s.pending_buf[s.sym_buf + s.sym_next++] = lc;
    if (dist === 0) s.dyn_ltree[lc * 2]++;
    else {
      s.matches++;
      dist--;
      s.dyn_ltree[(_length_code[lc] + LITERALS + 1) * 2]++;
      s.dyn_dtree[d_code(dist) * 2]++;
    }
    return s.sym_next === s.sym_end;
  };
  var adler32 = (adler, buf, len, pos) => {
    let s1 = adler & 65535 | 0, s2 = adler >>> 16 & 65535 | 0, n = 0;
    while (len !== 0) {
      n = len > 2e3 ? 2e3 : len;
      len -= n;
      do {
        s1 = s1 + buf[pos++] | 0;
        s2 = s2 + s1 | 0;
      } while (--n);
      s1 %= 65521;
      s2 %= 65521;
    }
    return s1 | s2 << 16 | 0;
  };
  var makeTable = () => {
    let c, table = [];
    for (var n = 0; n < 256; n++) {
      c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      table[n] = c;
    }
    return table;
  };
  var crcTable = new Uint32Array(makeTable());
  var crc32$1 = (crc, buf, len, pos) => {
    const t = crcTable;
    const end = pos + len;
    crc ^= -1;
    for (let i = pos; i < end; i++) crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 255];
    return crc ^ -1;
  };
  var messages_default = {
    2: "need dictionary",
    1: "stream end",
    0: "",
    "-1": "file error",
    "-2": "stream error",
    "-3": "data error",
    "-4": "insufficient memory",
    "-5": "buffer error",
    "-6": "incompatible version"
  };
  var MAX_MEM_LEVEL = 9;
  var HEAP_SIZE = 573;
  var MIN_MATCH = 3;
  var MAX_MATCH = 258;
  var MIN_LOOKAHEAD = 262;
  var PRESET_DICT = 32;
  var INIT_STATE = 42;
  var GZIP_STATE = 57;
  var EXTRA_STATE = 69;
  var NAME_STATE = 73;
  var COMMENT_STATE = 91;
  var HCRC_STATE = 103;
  var BUSY_STATE = 113;
  var FINISH_STATE = 666;
  var BS_NEED_MORE = 1;
  var BS_BLOCK_DONE = 2;
  var BS_FINISH_STARTED = 3;
  var BS_FINISH_DONE = 4;
  var OS_CODE = 3;
  var err = (strm, errorCode) => {
    strm.msg = messages_default[errorCode];
    return errorCode;
  };
  var rank = (f) => {
    return f * 2 - (f > 4 ? 9 : 0);
  };
  var zero = (buf) => {
    let len = buf.length;
    while (--len >= 0) buf[len] = 0;
  };
  var slide_hash = (s) => {
    let n, m;
    let p;
    let wsize = s.w_size;
    n = s.hash_size;
    p = n;
    do {
      m = s.head[--p];
      s.head[p] = m >= wsize ? m - wsize : 0;
    } while (--n);
    n = wsize;
    p = n;
    do {
      m = s.prev[--p];
      s.prev[p] = m >= wsize ? m - wsize : 0;
    } while (--n);
  };
  var HASH = (s, prev, data) => (prev << s.hash_shift ^ data) & s.hash_mask;
  var INSERT_STRING = (s, str) => {
    let h;
    if (s.legacy_hash) h = s.ins_h = HASH(s, s.ins_h, s.window[str + MIN_MATCH - 1]);
    else {
      const w = s.window;
      const value = w[str] | w[str + 1] << 8 | w[str + 2] << 16 | w[str + 3] << 24;
      h = s.ins_h = Math.imul(value, 66521) + 66521 >>> 16 & s.hash_mask;
    }
    const hash_head = s.prev[str & s.w_mask] = s.head[h];
    s.head[h] = str;
    return hash_head;
  };
  var flush_pending = (strm) => {
    const s = strm.state;
    let len = s.pending;
    if (len > strm.avail_out) len = strm.avail_out;
    if (len === 0) return;
    strm.output.set(s.pending_buf.subarray(s.pending_out, s.pending_out + len), strm.next_out);
    strm.next_out += len;
    s.pending_out += len;
    strm.total_out += len;
    strm.avail_out -= len;
    s.pending -= len;
    if (s.pending === 0) s.pending_out = 0;
  };
  var flush_block_only = (s, last2) => {
    _tr_flush_block(s, s.block_start >= 0 ? s.block_start : -1, s.strstart - s.block_start, last2);
    s.block_start = s.strstart;
    flush_pending(s.strm);
  };
  var put_byte = (s, b) => {
    s.pending_buf[s.pending++] = b;
  };
  var putShortMSB = (s, b) => {
    s.pending_buf[s.pending++] = b >>> 8 & 255;
    s.pending_buf[s.pending++] = b & 255;
  };
  var read_buf = (strm, buf, start, size) => {
    let len = strm.avail_in;
    if (len > size) len = size;
    if (len === 0) return 0;
    strm.avail_in -= len;
    buf.set(strm.input.subarray(strm.next_in, strm.next_in + len), start);
    if (strm.state.wrap === 1) strm.adler = adler32(strm.adler, buf, len, start);
    else if (strm.state.wrap === 2) strm.adler = crc32$1(strm.adler, buf, len, start);
    strm.next_in += len;
    strm.total_in += len;
    return len;
  };
  var longest_match = (s, cur_match) => {
    let chain_length = s.max_chain_length;
    let scan = s.strstart;
    let match;
    let len;
    let best_len = s.prev_length;
    let nice_match = s.nice_match;
    const limit = s.strstart > s.w_size - MIN_LOOKAHEAD ? s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0;
    const _win = s.window;
    const wmask = s.w_mask;
    const prev = s.prev;
    const strend = s.strstart + MAX_MATCH;
    let scan_end1 = _win[scan + best_len - 1];
    let scan_end = _win[scan + best_len];
    if (s.prev_length >= s.good_match) chain_length >>= 2;
    if (nice_match > s.lookahead) nice_match = s.lookahead;
    do {
      match = cur_match;
      if (_win[match + best_len] !== scan_end || _win[match + best_len - 1] !== scan_end1 || _win[match] !== _win[scan] || _win[++match] !== _win[scan + 1]) continue;
      scan += 2;
      match++;
      do
        ;
      while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && scan < strend);
      len = MAX_MATCH - (strend - scan);
      scan = strend - MAX_MATCH;
      if (len > best_len) {
        s.match_start = cur_match;
        best_len = len;
        if (len >= nice_match) break;
        scan_end1 = _win[scan + best_len - 1];
        scan_end = _win[scan + best_len];
      }
    } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);
    if (best_len <= s.lookahead) return best_len;
    return s.lookahead;
  };
  var fill_window = (s) => {
    const _w_size = s.w_size;
    let n, more, str;
    do {
      more = s.window_size - s.lookahead - s.strstart;
      if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
        s.window.set(s.window.subarray(_w_size, _w_size + _w_size - more), 0);
        s.match_start -= _w_size;
        s.strstart -= _w_size;
        s.block_start -= _w_size;
        if (s.insert > s.strstart) s.insert = s.strstart;
        slide_hash(s);
        more += _w_size;
      }
      if (s.strm.avail_in === 0) break;
      n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
      s.lookahead += n;
      if (!s.legacy_hash) {
        if (s.lookahead + s.insert > MIN_MATCH) {
          str = s.strstart - s.insert;
          while (s.insert) {
            INSERT_STRING(s, str);
            str++;
            s.insert--;
            if (s.lookahead + s.insert <= MIN_MATCH) break;
          }
        }
      } else if (s.lookahead + s.insert >= MIN_MATCH) {
        str = s.strstart - s.insert;
        s.ins_h = s.window[str];
        s.ins_h = HASH(s, s.ins_h, s.window[str + 1]);
        while (s.insert) {
          INSERT_STRING(s, str);
          str++;
          s.insert--;
          if (s.lookahead + s.insert < MIN_MATCH) break;
        }
      }
    } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);
  };
  var deflate_stored = (s, flush) => {
    let min_block = s.pending_buf_size - 5 > s.w_size ? s.w_size : s.pending_buf_size - 5;
    let len, left, have, last2 = 0;
    let used = s.strm.avail_in;
    do {
      len = 65535;
      have = s.bi_valid + 42 >> 3;
      if (s.strm.avail_out < have) break;
      have = s.strm.avail_out - have;
      left = s.strstart - s.block_start;
      if (len > left + s.strm.avail_in) len = left + s.strm.avail_in;
      if (len > have) len = have;
      if (len < min_block && (len === 0 && flush !== 4 || flush === 0 || len !== left + s.strm.avail_in)) break;
      last2 = flush === 4 && len === left + s.strm.avail_in ? 1 : 0;
      _tr_stored_block(s, 0, 0, last2);
      s.pending_buf[s.pending - 4] = len;
      s.pending_buf[s.pending - 3] = len >> 8;
      s.pending_buf[s.pending - 2] = ~len;
      s.pending_buf[s.pending - 1] = ~len >> 8;
      flush_pending(s.strm);
      if (left) {
        if (left > len) left = len;
        s.strm.output.set(s.window.subarray(s.block_start, s.block_start + left), s.strm.next_out);
        s.strm.next_out += left;
        s.strm.avail_out -= left;
        s.strm.total_out += left;
        s.block_start += left;
        len -= left;
      }
      if (len) {
        read_buf(s.strm, s.strm.output, s.strm.next_out, len);
        s.strm.next_out += len;
        s.strm.avail_out -= len;
        s.strm.total_out += len;
      }
    } while (last2 === 0);
    used -= s.strm.avail_in;
    if (used) {
      if (used >= s.w_size) {
        s.matches = 2;
        s.window.set(s.strm.input.subarray(s.strm.next_in - s.w_size, s.strm.next_in), 0);
        s.strstart = s.w_size;
        s.insert = s.strstart;
      } else {
        if (s.window_size - s.strstart <= used) {
          s.strstart -= s.w_size;
          s.window.set(s.window.subarray(s.w_size, s.w_size + s.strstart), 0);
          if (s.matches < 2) s.matches++;
          if (s.insert > s.strstart) s.insert = s.strstart;
        }
        s.window.set(s.strm.input.subarray(s.strm.next_in - used, s.strm.next_in), s.strstart);
        s.strstart += used;
        s.insert += used > s.w_size - s.insert ? s.w_size - s.insert : used;
      }
      s.block_start = s.strstart;
    }
    if (s.high_water < s.strstart) s.high_water = s.strstart;
    if (last2) return BS_FINISH_DONE;
    if (flush !== 0 && flush !== 4 && s.strm.avail_in === 0 && s.strstart === s.block_start) return BS_BLOCK_DONE;
    have = s.window_size - s.strstart;
    if (s.strm.avail_in > have && s.block_start >= s.w_size) {
      s.block_start -= s.w_size;
      s.strstart -= s.w_size;
      s.window.set(s.window.subarray(s.w_size, s.w_size + s.strstart), 0);
      if (s.matches < 2) s.matches++;
      have += s.w_size;
      if (s.insert > s.strstart) s.insert = s.strstart;
    }
    if (have > s.strm.avail_in) have = s.strm.avail_in;
    if (have) {
      read_buf(s.strm, s.window, s.strstart, have);
      s.strstart += have;
      s.insert += have > s.w_size - s.insert ? s.w_size - s.insert : have;
    }
    if (s.high_water < s.strstart) s.high_water = s.strstart;
    have = s.bi_valid + 42 >> 3;
    have = s.pending_buf_size - have > 65535 ? 65535 : s.pending_buf_size - have;
    min_block = have > s.w_size ? s.w_size : have;
    left = s.strstart - s.block_start;
    if (left >= min_block || (left || flush === 4) && flush !== 0 && s.strm.avail_in === 0 && left <= have) {
      len = left > have ? have : left;
      last2 = flush === 4 && s.strm.avail_in === 0 && len === left ? 1 : 0;
      _tr_stored_block(s, s.block_start, len, last2);
      s.block_start += len;
      flush_pending(s.strm);
    }
    return last2 ? BS_FINISH_STARTED : BS_NEED_MORE;
  };
  var deflate_fast = (s, flush) => {
    let hash_head;
    let bflush;
    for (; ; ) {
      if (s.lookahead < MIN_LOOKAHEAD) {
        fill_window(s);
        if (s.lookahead < MIN_LOOKAHEAD && flush === 0) return BS_NEED_MORE;
        if (s.lookahead === 0) break;
      }
      hash_head = 0;
      if (s.lookahead >= MIN_MATCH) hash_head = INSERT_STRING(s, s.strstart);
      if (hash_head !== 0 && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) s.match_length = longest_match(s, hash_head);
      if (s.match_length >= MIN_MATCH) {
        bflush = _tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH);
        s.lookahead -= s.match_length;
        if (s.match_length <= s.max_lazy_match && s.lookahead >= MIN_MATCH) {
          s.match_length--;
          do {
            s.strstart++;
            hash_head = INSERT_STRING(s, s.strstart);
          } while (--s.match_length !== 0);
          s.strstart++;
        } else {
          s.strstart += s.match_length;
          s.match_length = 0;
          if (s.legacy_hash) {
            s.ins_h = s.window[s.strstart];
            s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + 1]);
          }
        }
      } else {
        bflush = _tr_tally(s, 0, s.window[s.strstart]);
        s.lookahead--;
        s.strstart++;
      }
      if (bflush) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) return BS_NEED_MORE;
      }
    }
    s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
    if (flush === 4) {
      flush_block_only(s, true);
      if (s.strm.avail_out === 0) return BS_FINISH_STARTED;
      return BS_FINISH_DONE;
    }
    if (s.sym_next) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) return BS_NEED_MORE;
    }
    return BS_BLOCK_DONE;
  };
  var deflate_slow = (s, flush) => {
    let hash_head;
    let bflush;
    let max_insert;
    for (; ; ) {
      if (s.lookahead < MIN_LOOKAHEAD) {
        fill_window(s);
        if (s.lookahead < MIN_LOOKAHEAD && flush === 0) return BS_NEED_MORE;
        if (s.lookahead === 0) break;
      }
      hash_head = 0;
      if (s.lookahead >= MIN_MATCH) hash_head = INSERT_STRING(s, s.strstart);
      s.prev_length = s.match_length;
      s.prev_match = s.match_start;
      s.match_length = MIN_MATCH - 1;
      if (hash_head !== 0 && s.prev_length < s.max_lazy_match && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
        s.match_length = longest_match(s, hash_head);
        if (s.match_length <= 5 && (s.strategy === 1 || s.match_length === MIN_MATCH && s.strstart - s.match_start > 4096)) s.match_length = MIN_MATCH - 1;
      }
      if (s.prev_length >= MIN_MATCH && s.match_length <= s.prev_length) {
        max_insert = s.strstart + s.lookahead - MIN_MATCH;
        bflush = _tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH);
        s.lookahead -= s.prev_length - 1;
        s.prev_length -= 2;
        do
          if (++s.strstart <= max_insert) hash_head = INSERT_STRING(s, s.strstart);
        while (--s.prev_length !== 0);
        s.match_available = 0;
        s.match_length = MIN_MATCH - 1;
        s.strstart++;
        if (bflush) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) return BS_NEED_MORE;
        }
      } else if (s.match_available) {
        bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);
        if (bflush)
          flush_block_only(s, false);
        s.strstart++;
        s.lookahead--;
        if (s.strm.avail_out === 0) return BS_NEED_MORE;
      } else {
        s.match_available = 1;
        s.strstart++;
        s.lookahead--;
      }
    }
    if (s.match_available) {
      bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);
      s.match_available = 0;
    }
    s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
    if (flush === 4) {
      flush_block_only(s, true);
      if (s.strm.avail_out === 0) return BS_FINISH_STARTED;
      return BS_FINISH_DONE;
    }
    if (s.sym_next) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) return BS_NEED_MORE;
    }
    return BS_BLOCK_DONE;
  };
  var deflate_rle = (s, flush) => {
    let bflush;
    let prev;
    let scan, strend;
    const _win = s.window;
    for (; ; ) {
      if (s.lookahead <= MAX_MATCH) {
        fill_window(s);
        if (s.lookahead <= MAX_MATCH && flush === 0) return BS_NEED_MORE;
        if (s.lookahead === 0) break;
      }
      s.match_length = 0;
      if (s.lookahead >= MIN_MATCH && s.strstart > 0) {
        scan = s.strstart - 1;
        prev = _win[scan];
        if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
          strend = s.strstart + MAX_MATCH;
          do
            ;
          while (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && scan < strend);
          s.match_length = MAX_MATCH - (strend - scan);
          if (s.match_length > s.lookahead) s.match_length = s.lookahead;
        }
      }
      if (s.match_length >= MIN_MATCH) {
        bflush = _tr_tally(s, 1, s.match_length - MIN_MATCH);
        s.lookahead -= s.match_length;
        s.strstart += s.match_length;
        s.match_length = 0;
      } else {
        bflush = _tr_tally(s, 0, s.window[s.strstart]);
        s.lookahead--;
        s.strstart++;
      }
      if (bflush) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) return BS_NEED_MORE;
      }
    }
    s.insert = 0;
    if (flush === 4) {
      flush_block_only(s, true);
      if (s.strm.avail_out === 0) return BS_FINISH_STARTED;
      return BS_FINISH_DONE;
    }
    if (s.sym_next) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) return BS_NEED_MORE;
    }
    return BS_BLOCK_DONE;
  };
  var deflate_huff = (s, flush) => {
    let bflush;
    for (; ; ) {
      if (s.lookahead === 0) {
        fill_window(s);
        if (s.lookahead === 0) {
          if (flush === 0) return BS_NEED_MORE;
          break;
        }
      }
      s.match_length = 0;
      bflush = _tr_tally(s, 0, s.window[s.strstart]);
      s.lookahead--;
      s.strstart++;
      if (bflush) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) return BS_NEED_MORE;
      }
    }
    s.insert = 0;
    if (flush === 4) {
      flush_block_only(s, true);
      if (s.strm.avail_out === 0) return BS_FINISH_STARTED;
      return BS_FINISH_DONE;
    }
    if (s.sym_next) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) return BS_NEED_MORE;
    }
    return BS_BLOCK_DONE;
  };
  var Config = class {
    constructor(good_length, max_lazy, nice_length, max_chain, func) {
      this.good_length = good_length;
      this.max_lazy = max_lazy;
      this.nice_length = nice_length;
      this.max_chain = max_chain;
      this.func = func;
    }
  };
  var configuration_table = [
    new Config(0, 0, 0, 0, deflate_stored),
    new Config(4, 4, 8, 4, deflate_fast),
    new Config(4, 5, 16, 8, deflate_fast),
    new Config(4, 6, 32, 32, deflate_fast),
    new Config(4, 4, 16, 16, deflate_slow),
    new Config(8, 16, 32, 32, deflate_slow),
    new Config(8, 16, 128, 128, deflate_slow),
    new Config(8, 32, 128, 256, deflate_slow),
    new Config(32, 128, 258, 1024, deflate_slow),
    new Config(32, 258, 258, 4096, deflate_slow)
  ];
  var lm_init = (s) => {
    s.window_size = 2 * s.w_size;
    zero(s.head);
    s.max_lazy_match = configuration_table[s.level].max_lazy;
    s.good_match = configuration_table[s.level].good_length;
    s.nice_match = configuration_table[s.level].nice_length;
    s.max_chain_length = configuration_table[s.level].max_chain;
    s.strstart = 0;
    s.block_start = 0;
    s.lookahead = 0;
    s.insert = 0;
    s.match_length = s.prev_length = MIN_MATCH - 1;
    s.match_available = 0;
    s.ins_h = 0;
  };
  var DeflateState = class {
    constructor() {
      this.strm = null;
      this.status = 0;
      this.pending_buf = null;
      this.pending_buf_size = 0;
      this.pending_out = 0;
      this.pending = 0;
      this.wrap = 0;
      this.gzhead = null;
      this.gzindex = 0;
      this.method = 8;
      this.last_flush = -1;
      this.w_size = 0;
      this.w_bits = 0;
      this.w_mask = 0;
      this.window = null;
      this.window_size = 0;
      this.prev = null;
      this.head = null;
      this.ins_h = 0;
      this.legacy_hash = 0;
      this.hash_size = 0;
      this.hash_bits = 0;
      this.hash_mask = 0;
      this.hash_shift = 0;
      this.block_start = 0;
      this.match_length = 0;
      this.prev_match = 0;
      this.match_available = 0;
      this.strstart = 0;
      this.match_start = 0;
      this.lookahead = 0;
      this.prev_length = 0;
      this.max_chain_length = 0;
      this.max_lazy_match = 0;
      this.level = 0;
      this.strategy = 0;
      this.good_match = 0;
      this.nice_match = 0;
      this.dyn_ltree = new Uint16Array(HEAP_SIZE * 2);
      this.dyn_dtree = /* @__PURE__ */ new Uint16Array(122);
      this.bl_tree = /* @__PURE__ */ new Uint16Array(78);
      zero(this.dyn_ltree);
      zero(this.dyn_dtree);
      zero(this.bl_tree);
      this.l_desc = null;
      this.d_desc = null;
      this.bl_desc = null;
      this.bl_count = /* @__PURE__ */ new Uint16Array(16);
      this.heap = /* @__PURE__ */ new Uint16Array(573);
      zero(this.heap);
      this.heap_len = 0;
      this.heap_max = 0;
      this.depth = /* @__PURE__ */ new Uint16Array(573);
      zero(this.depth);
      this.sym_buf = 0;
      this.lit_bufsize = 0;
      this.sym_next = 0;
      this.sym_end = 0;
      this.opt_len = 0;
      this.static_len = 0;
      this.matches = 0;
      this.insert = 0;
      this.bi_buf = 0;
      this.bi_valid = 0;
    }
  };
  var deflateStateCheck = (strm) => {
    if (!strm) return 1;
    const s = strm.state;
    if (!s || s.strm !== strm || s.status !== INIT_STATE && s.status !== GZIP_STATE && s.status !== EXTRA_STATE && s.status !== NAME_STATE && s.status !== COMMENT_STATE && s.status !== HCRC_STATE && s.status !== BUSY_STATE && s.status !== FINISH_STATE) return 1;
    return 0;
  };
  var deflateResetKeep = (strm) => {
    if (deflateStateCheck(strm)) return err(strm, -2);
    strm.total_in = strm.total_out = 0;
    strm.data_type = 2;
    const s = strm.state;
    s.pending = 0;
    s.pending_out = 0;
    if (s.wrap < 0) s.wrap = -s.wrap;
    s.status = s.wrap === 2 ? GZIP_STATE : s.wrap ? INIT_STATE : BUSY_STATE;
    strm.adler = s.wrap === 2 ? 0 : 1;
    s.last_flush = -2;
    _tr_init(s);
    return 0;
  };
  var deflateReset = (strm) => {
    const ret = deflateResetKeep(strm);
    if (ret === 0) lm_init(strm.state);
    return ret;
  };
  var deflateInit2 = (strm, level, method, windowBits, memLevel, strategy, legacyHash) => {
    if (!strm) return -2;
    let wrap = 1;
    if (level === -1) level = 6;
    if (windowBits < 0) {
      wrap = 0;
      windowBits = -windowBits;
    } else if (windowBits > 15) {
      wrap = 2;
      windowBits -= 16;
    }
    if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== 8 || windowBits < 8 || windowBits > 15 || level < 0 || level > 9 || strategy < 0 || strategy > 4 || windowBits === 8 && wrap !== 1) return err(strm, -2);
    if (windowBits === 8) windowBits = 9;
    const s = new DeflateState();
    strm.state = s;
    s.strm = strm;
    s.status = INIT_STATE;
    s.wrap = wrap;
    s.gzhead = null;
    s.w_bits = windowBits;
    s.w_size = 1 << s.w_bits;
    s.w_mask = s.w_size - 1;
    s.legacy_hash = legacyHash ? 1 : 0;
    s.hash_bits = memLevel + 7;
    if (!s.legacy_hash && s.hash_bits < 15) s.hash_bits = 15;
    s.hash_size = 1 << s.hash_bits;
    s.hash_mask = s.hash_size - 1;
    s.hash_shift = ~~((s.hash_bits + MIN_MATCH - 1) / MIN_MATCH);
    s.window = new Uint8Array(s.w_size * 2);
    s.head = new Uint16Array(s.hash_size);
    s.prev = new Uint16Array(s.w_size);
    s.lit_bufsize = 1 << memLevel + 6;
    s.pending_buf_size = s.lit_bufsize * 4;
    s.pending_buf = new Uint8Array(s.pending_buf_size);
    s.sym_buf = s.lit_bufsize;
    s.sym_end = (s.lit_bufsize - 1) * 3;
    s.level = level;
    s.strategy = strategy;
    s.method = method;
    return deflateReset(strm);
  };
  var deflate$1 = (strm, flush) => {
    if (deflateStateCheck(strm) || flush > 5 || flush < 0) return strm ? err(strm, -2) : -2;
    const s = strm.state;
    if (!strm.output || strm.avail_in !== 0 && !strm.input || s.status === FINISH_STATE && flush !== 4) return err(strm, strm.avail_out === 0 ? -5 : -2);
    const old_flush = s.last_flush;
    s.last_flush = flush;
    if (s.pending !== 0) {
      flush_pending(strm);
      if (strm.avail_out === 0) {
        s.last_flush = -1;
        return 0;
      }
    } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) && flush !== 4) return err(strm, -5);
    if (s.status === FINISH_STATE && strm.avail_in !== 0) return err(strm, -5);
    if (s.status === INIT_STATE && s.wrap === 0) s.status = BUSY_STATE;
    if (s.status === INIT_STATE) {
      let header = 8 + (s.w_bits - 8 << 4) << 8;
      let level_flags = -1;
      if (s.strategy >= 2 || s.level < 2) level_flags = 0;
      else if (s.level < 6) level_flags = 1;
      else if (s.level === 6) level_flags = 2;
      else level_flags = 3;
      header |= level_flags << 6;
      if (s.strstart !== 0) header |= PRESET_DICT;
      header += 31 - header % 31;
      putShortMSB(s, header);
      if (s.strstart !== 0) {
        putShortMSB(s, strm.adler >>> 16);
        putShortMSB(s, strm.adler & 65535);
      }
      strm.adler = 1;
      s.status = BUSY_STATE;
      flush_pending(strm);
      if (s.pending !== 0) {
        s.last_flush = -1;
        return 0;
      }
    }
    if (s.status === GZIP_STATE) {
      strm.adler = 0;
      put_byte(s, 31);
      put_byte(s, 139);
      put_byte(s, 8);
      if (!s.gzhead) {
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, s.level === 9 ? 2 : s.strategy >= 2 || s.level < 2 ? 4 : 0);
        put_byte(s, OS_CODE);
        s.status = BUSY_STATE;
        flush_pending(strm);
        if (s.pending !== 0) {
          s.last_flush = -1;
          return 0;
        }
      } else {
        put_byte(s, (s.gzhead.text ? 1 : 0) + (s.gzhead.hcrc ? 2 : 0) + (!s.gzhead.extra ? 0 : 4) + (!s.gzhead.name ? 0 : 8) + (!s.gzhead.comment ? 0 : 16));
        put_byte(s, s.gzhead.time & 255);
        put_byte(s, s.gzhead.time >> 8 & 255);
        put_byte(s, s.gzhead.time >> 16 & 255);
        put_byte(s, s.gzhead.time >> 24 & 255);
        put_byte(s, s.level === 9 ? 2 : s.strategy >= 2 || s.level < 2 ? 4 : 0);
        put_byte(s, s.gzhead.os & 255);
        if (s.gzhead.extra && s.gzhead.extra.length) {
          put_byte(s, s.gzhead.extra.length & 255);
          put_byte(s, s.gzhead.extra.length >> 8 & 255);
        }
        if (s.gzhead.hcrc) strm.adler = crc32$1(strm.adler, s.pending_buf, s.pending, 0);
        s.gzindex = 0;
        s.status = EXTRA_STATE;
      }
    }
    if (s.status === EXTRA_STATE) {
      if (s.gzhead.extra) {
        let beg = s.pending;
        let left = (s.gzhead.extra.length & 65535) - s.gzindex;
        while (s.pending + left > s.pending_buf_size) {
          let copy = s.pending_buf_size - s.pending;
          s.pending_buf.set(s.gzhead.extra.subarray(s.gzindex, s.gzindex + copy), s.pending);
          s.pending = s.pending_buf_size;
          if (s.gzhead.hcrc && s.pending > beg) strm.adler = crc32$1(strm.adler, s.pending_buf, s.pending - beg, beg);
          s.gzindex += copy;
          flush_pending(strm);
          if (s.pending !== 0) {
            s.last_flush = -1;
            return 0;
          }
          beg = 0;
          left -= copy;
        }
        let gzhead_extra = new Uint8Array(s.gzhead.extra);
        s.pending_buf.set(gzhead_extra.subarray(s.gzindex, s.gzindex + left), s.pending);
        s.pending += left;
        if (s.gzhead.hcrc && s.pending > beg) strm.adler = crc32$1(strm.adler, s.pending_buf, s.pending - beg, beg);
        s.gzindex = 0;
      }
      s.status = NAME_STATE;
    }
    if (s.status === NAME_STATE) {
      if (s.gzhead.name) {
        let beg = s.pending;
        let val;
        do {
          if (s.pending === s.pending_buf_size) {
            if (s.gzhead.hcrc && s.pending > beg) strm.adler = crc32$1(strm.adler, s.pending_buf, s.pending - beg, beg);
            flush_pending(strm);
            if (s.pending !== 0) {
              s.last_flush = -1;
              return 0;
            }
            beg = 0;
          }
          if (s.gzindex < s.gzhead.name.length) val = s.gzhead.name.charCodeAt(s.gzindex++) & 255;
          else val = 0;
          put_byte(s, val);
        } while (val !== 0);
        if (s.gzhead.hcrc && s.pending > beg) strm.adler = crc32$1(strm.adler, s.pending_buf, s.pending - beg, beg);
        s.gzindex = 0;
      }
      s.status = COMMENT_STATE;
    }
    if (s.status === COMMENT_STATE) {
      if (s.gzhead.comment) {
        let beg = s.pending;
        let val;
        do {
          if (s.pending === s.pending_buf_size) {
            if (s.gzhead.hcrc && s.pending > beg) strm.adler = crc32$1(strm.adler, s.pending_buf, s.pending - beg, beg);
            flush_pending(strm);
            if (s.pending !== 0) {
              s.last_flush = -1;
              return 0;
            }
            beg = 0;
          }
          if (s.gzindex < s.gzhead.comment.length) val = s.gzhead.comment.charCodeAt(s.gzindex++) & 255;
          else val = 0;
          put_byte(s, val);
        } while (val !== 0);
        if (s.gzhead.hcrc && s.pending > beg) strm.adler = crc32$1(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      s.status = HCRC_STATE;
    }
    if (s.status === HCRC_STATE) {
      if (s.gzhead.hcrc) {
        if (s.pending + 2 > s.pending_buf_size) {
          flush_pending(strm);
          if (s.pending !== 0) {
            s.last_flush = -1;
            return 0;
          }
        }
        put_byte(s, strm.adler & 255);
        put_byte(s, strm.adler >> 8 & 255);
        strm.adler = 0;
      }
      s.status = BUSY_STATE;
      flush_pending(strm);
      if (s.pending !== 0) {
        s.last_flush = -1;
        return 0;
      }
    }
    if (strm.avail_in !== 0 || s.lookahead !== 0 || flush !== 0 && s.status !== FINISH_STATE) {
      let bstate = s.level === 0 ? deflate_stored(s, flush) : s.strategy === 2 ? deflate_huff(s, flush) : s.strategy === 3 ? deflate_rle(s, flush) : configuration_table[s.level].func(s, flush);
      if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) s.status = FINISH_STATE;
      if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
        if (strm.avail_out === 0) s.last_flush = -1;
        return 0;
      }
      if (bstate === BS_BLOCK_DONE) {
        if (flush === 1) _tr_align(s);
        else if (flush !== 5) {
          _tr_stored_block(s, 0, 0, false);
          if (flush === 3) {
            zero(s.head);
            if (s.lookahead === 0) {
              s.strstart = 0;
              s.block_start = 0;
              s.insert = 0;
            }
          }
        }
        flush_pending(strm);
        if (strm.avail_out === 0) {
          s.last_flush = -1;
          return 0;
        }
      }
    }
    if (flush !== 4) return 0;
    if (s.wrap <= 0) return 1;
    if (s.wrap === 2) {
      put_byte(s, strm.adler & 255);
      put_byte(s, strm.adler >> 8 & 255);
      put_byte(s, strm.adler >> 16 & 255);
      put_byte(s, strm.adler >> 24 & 255);
      put_byte(s, strm.total_in & 255);
      put_byte(s, strm.total_in >> 8 & 255);
      put_byte(s, strm.total_in >> 16 & 255);
      put_byte(s, strm.total_in >> 24 & 255);
    } else {
      putShortMSB(s, strm.adler >>> 16);
      putShortMSB(s, strm.adler & 65535);
    }
    flush_pending(strm);
    if (s.wrap > 0) s.wrap = -s.wrap;
    return s.pending !== 0 ? 0 : 1;
  };
  var deflateEnd = (strm) => {
    if (deflateStateCheck(strm)) return -2;
    const status = strm.state.status;
    strm.state = null;
    return status === BUSY_STATE ? err(strm, -3) : 0;
  };
  var deflateSetDictionary = (strm, dictionary) => {
    let dictLength = dictionary.length;
    if (deflateStateCheck(strm)) return -2;
    const s = strm.state;
    const wrap = s.wrap;
    if (wrap === 2 || wrap === 1 && s.status !== INIT_STATE || s.lookahead) return -2;
    if (wrap === 1) strm.adler = adler32(strm.adler, dictionary, dictLength, 0);
    s.wrap = 0;
    if (dictLength >= s.w_size) {
      if (wrap === 0) {
        zero(s.head);
        s.strstart = 0;
        s.block_start = 0;
        s.insert = 0;
      }
      let tmpDict = new Uint8Array(s.w_size);
      tmpDict.set(dictionary.subarray(dictLength - s.w_size, dictLength), 0);
      dictionary = tmpDict;
      dictLength = s.w_size;
    }
    const avail = strm.avail_in;
    const next = strm.next_in;
    const input = strm.input;
    strm.avail_in = dictLength;
    strm.next_in = 0;
    strm.input = dictionary;
    fill_window(s);
    while (s.lookahead >= MIN_MATCH) {
      let str = s.strstart;
      let n = s.lookahead - (MIN_MATCH - 1);
      do {
        INSERT_STRING(s, str);
        str++;
      } while (--n);
      s.strstart = str;
      s.lookahead = MIN_MATCH - 1;
      fill_window(s);
    }
    s.strstart += s.lookahead;
    s.block_start = s.strstart;
    s.insert = s.lookahead;
    s.lookahead = 0;
    s.match_length = s.prev_length = MIN_MATCH - 1;
    s.match_available = 0;
    strm.next_in = next;
    strm.input = input;
    strm.avail_in = avail;
    s.wrap = wrap;
    return 0;
  };
  var ZStream = class {
    constructor() {
      this.input = null;
      this.next_in = 0;
      this.avail_in = 0;
      this.total_in = 0;
      this.output = null;
      this.next_out = 0;
      this.avail_out = 0;
      this.total_out = 0;
      this.msg = "";
      this.state = null;
      this.data_type = 2;
      this.adler = 0;
    }
  };
  var flattenChunks = (chunks) => {
    const result = new Uint8Array(chunks.reduce((len, chunk2) => len + chunk2.length, 0));
    let pos = 0;
    for (const chunk2 of chunks) {
      result.set(chunk2, pos);
      pos += chunk2.length;
    }
    return result;
  };
  var toString$1 = Object.prototype.toString;
  var defaultOptions$1 = {
    level: -1,
    chunkSize: 16384,
    windowBits: 15,
    memLevel: 8,
    strategy: 0,
    raw: false,
    gzip: false,
    legacyHash: false,
    dictionary: /* @__PURE__ */ new Uint8Array(0)
  };
  var Deflate = class {
    /**
    * Creates a new deflator instance with the specified params. Throws an
    * exception on bad params. See {@link DeflateOptions} for the list of
    * supported options.
    *
    * @example
    * ```javascript
    * import { Deflate } from 'pako'
    *
    * const chunk1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
    * const chunk2 = new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    *
    * const deflate = new Deflate({ level: 3 })
    *
    * deflate.push(chunk1, false)
    * deflate.push(chunk2, true)  // true -> last chunk
    *
    * if (deflate.err) throw new Error(deflate.err)
    *
    * console.log(deflate.result)
    * ```
    */
    constructor(options = {}) {
      __publicField(this, "options");
      /**
      * Error code after deflate finishes. {@link Z_OK} on success.
      * You will not need it in real life, because deflate errors
      * are possible only on wrong options or bad custom `onData` / `onEnd`
      * handlers.
      */
      __publicField(this, "err");
      /** Error message, if {@link Deflate.err} is not {@link Z_OK}. */
      __publicField(this, "msg");
      __publicField(this, "ended");
      __publicField(this, "started");
      /**
      * Chunks of output data, if {@link Deflate.onData} not overridden.
      * @internal
      */
      __publicField(this, "chunks");
      __publicField(this, "strm");
      /**
      * Compressed result, generated by default {@link Deflate.onData}
      * and {@link Deflate.onEnd} handlers. Filled after you push last chunk
      * (call {@link Deflate.push} with {@link Z_FINISH} / `true` param).
      */
      __publicField(this, "result");
      this.options = Object.assign({}, defaultOptions$1, options);
      const opt = this.options;
      if (opt.raw && opt.windowBits > 0) opt.windowBits = -opt.windowBits;
      else if (opt.gzip && opt.windowBits > 0 && opt.windowBits < 16) opt.windowBits += 16;
      this.err = 0;
      this.msg = "";
      this.ended = false;
      this.started = false;
      this.chunks = [];
      this.result = /* @__PURE__ */ new Uint8Array(0);
      this.strm = new ZStream();
      this.strm.avail_out = 0;
      let status = deflateInit2(this.strm, opt.level, 8, opt.windowBits, opt.memLevel, opt.strategy, opt.legacyHash);
      if (status !== 0) throw new Error(messages_default[status]);
      if (toString$1.call(opt.dictionary) === "[object ArrayBuffer]") opt.dictionary = new Uint8Array(opt.dictionary);
      const dictionary = opt.dictionary;
      if (dictionary.length) {
        if (opt.gzip) throw new Error("dictionary is not supported with gzip");
        status = deflateSetDictionary(this.strm, dictionary);
        if (status !== 0) throw new Error(messages_default[status]);
      }
    }
    /**
    * Sends input data to the deflate pipe, generating {@link Deflate.onData} calls
    * with new compressed chunks. Returns `true` on success. The last data block must
    * have `flush_mode` {@link Z_FINISH} (or `true`). That will flush the internal
    * pending buffers and call {@link Deflate.onEnd}.
    *
    * On failure, calls {@link Deflate.onEnd} with the error code and returns false.
    *
    * @param data input data. Strings will be converted to utf8 byte sequence.
    * @param flush_mode 0..6 for corresponding {@link Z_NO_FLUSH}..{@link Z_TREES} modes.
    *   See constants. Skipped or `false` means {@link Z_NO_FLUSH}, `true` means {@link Z_FINISH}.
    *
    * @example
    * ```javascript
    * push(chunk, false) // push one of data chunks
    * ...
    * push(chunk, true)  // push last chunk
    * ```
    */
    push(data, flush_mode = false) {
      const strm = this.strm;
      const chunkSize = this.options.chunkSize;
      let status;
      let _flush_mode;
      if (this.ended) return false;
      if (typeof flush_mode === "number") _flush_mode = flush_mode;
      else _flush_mode = flush_mode === true ? 4 : 0;
      if (typeof data === "string") strm.input = new TextEncoder().encode(data);
      else if (toString$1.call(data) === "[object ArrayBuffer]") strm.input = new Uint8Array(data);
      else strm.input = data;
      strm.next_in = 0;
      strm.avail_in = strm.input.length;
      if (!this.started) {
        this.started = true;
        this.onStart(strm);
      }
      for (; ; ) {
        if (strm.avail_out === 0) {
          strm.output = new Uint8Array(chunkSize);
          strm.next_out = 0;
          strm.avail_out = chunkSize;
        }
        if ((_flush_mode === 2 || _flush_mode === 3) && strm.avail_out <= 6) {
          this.onData(strm.output.subarray(0, strm.next_out));
          strm.avail_out = 0;
          continue;
        }
        status = deflate$1(strm, _flush_mode);
        if (status === -2) break;
        if (status === 1) {
          if (strm.next_out > 0) this.onData(strm.output.subarray(0, strm.next_out));
          status = deflateEnd(this.strm);
          break;
        }
        if (strm.avail_out === 0) {
          this.onData(strm.output);
          continue;
        }
        if (_flush_mode > 0 && strm.next_out > 0) {
          this.onData(strm.output.subarray(0, strm.next_out));
          strm.avail_out = 0;
          continue;
        }
        if (strm.avail_in === 0) return true;
      }
      this.err = status;
      this.msg = strm.msg || messages_default[status];
      this.ended = true;
      this.onEnd(status);
      return status === 0;
    }
    /**
    * Called once before the first low-level deflate call.
    */
    onStart(strm) {
    }
    /**
    * By default, stores data blocks in the {@link Deflate.chunks} property and glues
    * them in {@link Deflate.onEnd}. Override this handler if you need another behaviour.
    */
    onData(chunk2) {
      this.chunks.push(chunk2);
    }
    /**
    * Called once after you tell deflate that the input stream is
    * complete ({@link Z_FINISH}). By default, joins the collected {@link Deflate.chunks}
    * into the {@link Deflate.result} property.
    *
    * @param status deflate status. {@link Z_OK} on success, other if not.
    */
    onEnd(status) {
      if (status === 0) this.result = flattenChunks(this.chunks);
      this.chunks = [];
    }
  };
  function deflate(input, options = {}) {
    const deflator = new Deflate(options);
    deflator.push(input, true);
    if (deflator.err) throw new Error(deflator.msg);
    return deflator.result;
  }
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes2) {
    let crc = 4294967295;
    for (let i = 0; i < bytes2.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes2[i]) & 255] ^ crc >>> 8;
    }
    return (crc ^ 4294967295) >>> 0;
  }
  function chunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const view2 = new DataView(out.buffer);
    view2.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) {
      out[4 + i] = type.charCodeAt(i);
    }
    out.set(data, 8);
    view2.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }
  function encodeGrayPng(gray, width, height) {
    const ihdr = new Uint8Array(13);
    const ihdrView = new DataView(ihdr.buffer);
    ihdrView.setUint32(0, width);
    ihdrView.setUint32(4, height);
    ihdr[8] = 8;
    const src = gray instanceof Uint8Array ? gray : new Uint8Array(gray.buffer, gray.byteOffset, gray.byteLength);
    const raw = new Uint8Array((width + 1) * height);
    for (let y = 0; y < height; y++) {
      raw.set(src.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
    }
    const idat = deflate(raw, { level: 0 });
    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const parts = [signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const png = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      png.set(part, offset);
      offset += part.length;
    }
    return png.buffer;
  }
  const BASE64_CODES = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    BASE64_CODES[i] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".charCodeAt(i);
  }
  function base64FromArrayBuffer(buffer) {
    const bytes2 = new Uint8Array(buffer);
    const n = bytes2.length;
    const out = new Uint8Array(Math.ceil(n / 3) * 4);
    let o = 0;
    const nFull = n - n % 3;
    for (let i = 0; i < nFull; i += 3) {
      const v = bytes2[i] << 16 | bytes2[i + 1] << 8 | bytes2[i + 2];
      out[o++] = BASE64_CODES[v >> 18 & 63];
      out[o++] = BASE64_CODES[v >> 12 & 63];
      out[o++] = BASE64_CODES[v >> 6 & 63];
      out[o++] = BASE64_CODES[v & 63];
    }
    if (n % 3 === 1) {
      const v = bytes2[nFull] << 16;
      out[o++] = BASE64_CODES[v >> 18 & 63];
      out[o++] = BASE64_CODES[v >> 12 & 63];
      out[o++] = 61;
      out[o++] = 61;
    } else if (n % 3 === 2) {
      const v = bytes2[nFull] << 16 | bytes2[nFull + 1] << 8;
      out[o++] = BASE64_CODES[v >> 18 & 63];
      out[o++] = BASE64_CODES[v >> 12 & 63];
      out[o++] = BASE64_CODES[v >> 6 & 63];
      out[o++] = 61;
    }
    const parts = [];
    const chunk2 = 32768;
    for (let i = 0; i < out.length; i += chunk2) {
      parts.push(String.fromCharCode.apply(null, out.subarray(i, i + chunk2)));
    }
    return parts.join("");
  }
  class ImmersalWebCloud extends ImmersalBase {
    constructor(token, mapIds) {
      super(token, mapIds);
      __publicField(this, "pngEncoderWorker");
    }
    async init() {
      if (IS_BABYLON_NATIVE_JSCORE || typeof Worker === "undefined") {
        return Promise.resolve();
      }
      const workerUrl = new URL("/js/pngEncoderWorker.js", window.location.origin).href;
      this.pngEncoderWorker = new Worker(workerUrl);
      return Promise.resolve();
    }
    async loadMap() {
      console.warn("immersal.web.cloud.loadMap not required.");
      return Promise.resolve();
    }
    encodeImage(imageData, imageWidth, imageHeight) {
      if (!this.pngEncoderWorker) {
        return Promise.resolve(encodeGrayPng(imageData, imageWidth, imageHeight));
      }
      return new Promise((resolve) => {
        this.pngEncoderWorker.onmessage = (event) => {
          resolve(event.data);
        };
        this.pngEncoderWorker.postMessage({ imageData, imageWidth, imageHeight });
      });
    }
    async localize(imageData, imageWidth, imageHeight, intrinsics) {
      if (!imageData || !imageWidth || !imageHeight || !intrinsics) {
        throw new Error("immersal.web.cloud.localize - imageData, imageWidth, imageHeight and intrinsics are required.");
      }
      try {
        const mapIds = this.mapIds.map((mapId) => ({ id: parseInt(mapId.toString()) }));
        const req = {
          mapIds,
          fx: intrinsics.focalLength.x,
          fy: intrinsics.focalLength.y,
          ox: intrinsics.principalOffset.x,
          oy: intrinsics.principalOffset.y,
          param1: 0,
          // copy from three.js
          param2: 12,
          // copy from three.js
          param3: 0,
          // copy from three.js
          param4: 2,
          // copy from three.js
          token: this.token
        };
        const tEncode0 = performance.now();
        const buffer = await this.encodeImage(imageData, imageWidth, imageHeight);
        const tEncode1 = performance.now();
        let response;
        if (IS_BABYLON_NATIVE_JSCORE) {
          const b64 = base64FromArrayBuffer(buffer);
          const tB64 = performance.now();
          console.log(`immersal.web.cloud.localize: ${imageWidth}x${imageHeight} png=${(buffer.byteLength / 1024).toFixed(0)}kb encode=${(tEncode1 - tEncode0).toFixed(0)}ms base64=${(tB64 - tEncode1).toFixed(0)}ms`);
          const reqB64 = { ...req, b64 };
          response = await fetch("https://api.immersal.com/localizeb64", {
            method: "POST",
            body: JSON.stringify(reqB64)
          });
        } else {
          const payload = new Blob([JSON.stringify(req), "\0", buffer]);
          response = await fetch("https://api.immersal.com/localize", {
            method: "POST",
            body: payload
          });
        }
        if (!response.ok) {
          throw new Error("immersal.web.cloud.localize - network response was not ok");
        }
        const res = await response.json();
        if (!res) {
          throw new Error("immersal.web.cloud.localize: no result.");
        }
        if (IS_BABYLON_NATIVE_JSCORE && !res.success) {
          console.log(`immersal.web.cloud.localize: response=${JSON.stringify(res)}`);
        }
        const locResult = {
          success: false,
          confidence: -1
        };
        if (res.success) {
          let matrix = new babylonjs.Matrix();
          matrix.setRowFromFloats(0, res.r00, -res.r01, -res.r02, res.px);
          matrix.setRowFromFloats(1, res.r10, -res.r11, -res.r12, res.py);
          matrix.setRowFromFloats(2, res.r20, -res.r21, -res.r22, res.pz);
          matrix.setRowFromFloats(3, 0, 0, 0, 1);
          matrix = matrix.transpose();
          locResult.success = true;
          locResult.matrix = new Float32Array(16);
          matrix.toArray(locResult.matrix, 0);
          locResult.confidence = res.confidence ?? locResult.confidence;
          locResult.map = res.map;
        }
        return locResult;
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`${error.message || error}`);
        } else {
          throw new Error(String(error));
        }
      }
    }
  }
  class ImmersalAppCloud extends ImmersalBase {
    constructor(token, mapIds) {
      super(token, mapIds);
      __publicField(this, "bridge");
      this.bridge = new BridgeImmersal();
    }
    async init() {
      console.warn("immersal.app.cloud.init not required.");
      return Promise.resolve();
    }
    async loadMap(_url) {
      console.warn("immersal.app.cloud.loadMap not required.");
      return Promise.resolve();
    }
    async localize(_imageData, _imageWidth, _imageHeight, _intrinsics) {
      try {
        const data = await this.bridge.localizeOnCloud(this.token, this.mapIds);
        if (data.error && data.error !== "none") {
          throw new Error("immersal.app.cloud.localize: failed - " + data.error);
        }
        const locResult = {
          success: false,
          confidence: 0,
          matrix: void 0
        };
        if (data.success) {
          let matrix = new babylonjs.Matrix();
          matrix.setRowFromFloats(0, data.r00, -data.r01, -data.r02, data.px);
          matrix.setRowFromFloats(1, data.r10, -data.r11, -data.r12, data.py);
          matrix.setRowFromFloats(2, data.r20, -data.r21, -data.r22, data.pz);
          matrix.setRowFromFloats(3, 0, 0, 0, 1);
          matrix = matrix.transpose();
          locResult.success = true;
          locResult.confidence = data.confidence;
          locResult.matrix = new Float32Array(16);
          locResult.map = data.map;
          matrix.toArray(locResult.matrix, 0);
        }
        return locResult;
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`${error.message || error}`);
        } else {
          throw new Error(String(error));
        }
      }
    }
  }
  function assert$3(condition, message) {
    if (!condition) {
      throw new Error(message || "loader assertion failed.");
    }
  }
  const isBrowser$2 = Boolean(typeof process !== "object" || String(process) !== "[object process]" || process.browser);
  const matches$1 = typeof process !== "undefined" && process.version && /v([0-9]*)/.exec(process.version);
  matches$1 && parseFloat(matches$1[1]) || 0;
  const VERSION$2 = "3.4.15";
  function assert$2(condition, message) {
    if (!condition) {
      throw new Error(message || "loaders.gl assertion failed.");
    }
  }
  const isBrowser$1 = typeof process !== "object" || String(process) !== "[object process]" || process.browser;
  const isMobile = typeof window !== "undefined" && typeof window.orientation !== "undefined";
  const matches = typeof process !== "undefined" && process.version && /v([0-9]*)/.exec(process.version);
  matches && parseFloat(matches[1]) || 0;
  function _typeof(o) {
    "@babel/helpers - typeof";
    return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o2) {
      return typeof o2;
    } : function(o2) {
      return o2 && "function" == typeof Symbol && o2.constructor === Symbol && o2 !== Symbol.prototype ? "symbol" : typeof o2;
    }, _typeof(o);
  }
  function toPrimitive(t, r) {
    if ("object" != _typeof(t) || !t) return t;
    var e = t[Symbol.toPrimitive];
    if (void 0 !== e) {
      var i = e.call(t, r);
      if ("object" != _typeof(i)) return i;
      throw new TypeError("@@toPrimitive must return a primitive value.");
    }
    return ("string" === r ? String : Number)(t);
  }
  function toPropertyKey(t) {
    var i = toPrimitive(t, "string");
    return "symbol" == _typeof(i) ? i : i + "";
  }
  function _defineProperty(e, r, t) {
    return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
      value: t,
      enumerable: true,
      configurable: true,
      writable: true
    }) : e[r] = t, e;
  }
  class WorkerJob {
    constructor(jobName, workerThread) {
      _defineProperty(this, "name", void 0);
      _defineProperty(this, "workerThread", void 0);
      _defineProperty(this, "isRunning", true);
      _defineProperty(this, "result", void 0);
      _defineProperty(this, "_resolve", () => {
      });
      _defineProperty(this, "_reject", () => {
      });
      this.name = jobName;
      this.workerThread = workerThread;
      this.result = new Promise((resolve, reject) => {
        this._resolve = resolve;
        this._reject = reject;
      });
    }
    postMessage(type, payload) {
      this.workerThread.postMessage({
        source: "loaders.gl",
        type,
        payload
      });
    }
    done(value) {
      assert$2(this.isRunning);
      this.isRunning = false;
      this._resolve(value);
    }
    error(error) {
      assert$2(this.isRunning);
      this.isRunning = false;
      this._reject(error);
    }
  }
  let Worker$1 = class Worker {
    terminate() {
    }
  };
  const workerURLCache = /* @__PURE__ */ new Map();
  function getLoadableWorkerURL(props) {
    assert$2(props.source && !props.url || !props.source && props.url);
    let workerURL = workerURLCache.get(props.source || props.url);
    if (!workerURL) {
      if (props.url) {
        workerURL = getLoadableWorkerURLFromURL(props.url);
        workerURLCache.set(props.url, workerURL);
      }
      if (props.source) {
        workerURL = getLoadableWorkerURLFromSource(props.source);
        workerURLCache.set(props.source, workerURL);
      }
    }
    assert$2(workerURL);
    return workerURL;
  }
  function getLoadableWorkerURLFromURL(url2) {
    if (!url2.startsWith("http")) {
      return url2;
    }
    const workerSource = buildScriptSource(url2);
    return getLoadableWorkerURLFromSource(workerSource);
  }
  function getLoadableWorkerURLFromSource(workerSource) {
    const blob = new Blob([workerSource], {
      type: "application/javascript"
    });
    return URL.createObjectURL(blob);
  }
  function buildScriptSource(workerUrl) {
    return "try {\n  importScripts('".concat(workerUrl, "');\n} catch (error) {\n  console.error(error);\n  throw error;\n}");
  }
  function getTransferList(object) {
    let recursive = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : true;
    let transfers = arguments.length > 2 ? arguments[2] : void 0;
    const transfersSet = transfers || /* @__PURE__ */ new Set();
    if (!object) ;
    else if (isTransferable(object)) {
      transfersSet.add(object);
    } else if (isTransferable(object.buffer)) {
      transfersSet.add(object.buffer);
    } else if (ArrayBuffer.isView(object)) ;
    else if (recursive && typeof object === "object") {
      for (const key in object) {
        getTransferList(object[key], recursive, transfersSet);
      }
    }
    return transfers === void 0 ? Array.from(transfersSet) : [];
  }
  function isTransferable(object) {
    if (!object) {
      return false;
    }
    if (object instanceof ArrayBuffer) {
      return true;
    }
    if (typeof MessagePort !== "undefined" && object instanceof MessagePort) {
      return true;
    }
    if (typeof ImageBitmap !== "undefined" && object instanceof ImageBitmap) {
      return true;
    }
    if (typeof OffscreenCanvas !== "undefined" && object instanceof OffscreenCanvas) {
      return true;
    }
    return false;
  }
  const NOOP = () => {
  };
  class WorkerThread {
    static isSupported() {
      return typeof Worker !== "undefined" && isBrowser$1 || typeof Worker$1 !== "undefined" && !isBrowser$1;
    }
    constructor(props) {
      _defineProperty(this, "name", void 0);
      _defineProperty(this, "source", void 0);
      _defineProperty(this, "url", void 0);
      _defineProperty(this, "terminated", false);
      _defineProperty(this, "worker", void 0);
      _defineProperty(this, "onMessage", void 0);
      _defineProperty(this, "onError", void 0);
      _defineProperty(this, "_loadableURL", "");
      const {
        name,
        source,
        url: url2
      } = props;
      assert$2(source || url2);
      this.name = name;
      this.source = source;
      this.url = url2;
      this.onMessage = NOOP;
      this.onError = (error) => console.log(error);
      this.worker = isBrowser$1 ? this._createBrowserWorker() : this._createNodeWorker();
    }
    destroy() {
      this.onMessage = NOOP;
      this.onError = NOOP;
      this.worker.terminate();
      this.terminated = true;
    }
    get isRunning() {
      return Boolean(this.onMessage);
    }
    postMessage(data, transferList) {
      transferList = transferList || getTransferList(data);
      this.worker.postMessage(data, transferList);
    }
    _getErrorFromErrorEvent(event) {
      let message = "Failed to load ";
      message += "worker ".concat(this.name, " from ").concat(this.url, ". ");
      if (event.message) {
        message += "".concat(event.message, " in ");
      }
      if (event.lineno) {
        message += ":".concat(event.lineno, ":").concat(event.colno);
      }
      return new Error(message);
    }
    _createBrowserWorker() {
      this._loadableURL = getLoadableWorkerURL({
        source: this.source,
        url: this.url
      });
      const worker = new Worker(this._loadableURL, {
        name: this.name
      });
      worker.onmessage = (event) => {
        if (!event.data) {
          this.onError(new Error("No data received"));
        } else {
          this.onMessage(event.data);
        }
      };
      worker.onerror = (error) => {
        this.onError(this._getErrorFromErrorEvent(error));
        this.terminated = true;
      };
      worker.onmessageerror = (event) => console.error(event);
      return worker;
    }
    _createNodeWorker() {
      let worker;
      if (this.url) {
        const absolute = this.url.includes(":/") || this.url.startsWith("/");
        const url2 = absolute ? this.url : "./".concat(this.url);
        worker = new Worker$1(url2, {
          eval: false
        });
      } else if (this.source) {
        worker = new Worker$1(this.source, {
          eval: true
        });
      } else {
        throw new Error("no worker");
      }
      worker.on("message", (data) => {
        this.onMessage(data);
      });
      worker.on("error", (error) => {
        this.onError(error);
      });
      worker.on("exit", (code) => {
      });
      return worker;
    }
  }
  class WorkerPool {
    static isSupported() {
      return WorkerThread.isSupported();
    }
    constructor(props) {
      _defineProperty(this, "name", "unnamed");
      _defineProperty(this, "source", void 0);
      _defineProperty(this, "url", void 0);
      _defineProperty(this, "maxConcurrency", 1);
      _defineProperty(this, "maxMobileConcurrency", 1);
      _defineProperty(this, "onDebug", () => {
      });
      _defineProperty(this, "reuseWorkers", true);
      _defineProperty(this, "props", {});
      _defineProperty(this, "jobQueue", []);
      _defineProperty(this, "idleQueue", []);
      _defineProperty(this, "count", 0);
      _defineProperty(this, "isDestroyed", false);
      this.source = props.source;
      this.url = props.url;
      this.setProps(props);
    }
    destroy() {
      this.idleQueue.forEach((worker) => worker.destroy());
      this.isDestroyed = true;
    }
    setProps(props) {
      this.props = {
        ...this.props,
        ...props
      };
      if (props.name !== void 0) {
        this.name = props.name;
      }
      if (props.maxConcurrency !== void 0) {
        this.maxConcurrency = props.maxConcurrency;
      }
      if (props.maxMobileConcurrency !== void 0) {
        this.maxMobileConcurrency = props.maxMobileConcurrency;
      }
      if (props.reuseWorkers !== void 0) {
        this.reuseWorkers = props.reuseWorkers;
      }
      if (props.onDebug !== void 0) {
        this.onDebug = props.onDebug;
      }
    }
    async startJob(name) {
      let onMessage2 = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : (job, type, data) => job.done(data);
      let onError = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : (job, error) => job.error(error);
      const startPromise = new Promise((onStart) => {
        this.jobQueue.push({
          name,
          onMessage: onMessage2,
          onError,
          onStart
        });
        return this;
      });
      this._startQueuedJob();
      return await startPromise;
    }
    async _startQueuedJob() {
      if (!this.jobQueue.length) {
        return;
      }
      const workerThread = this._getAvailableWorker();
      if (!workerThread) {
        return;
      }
      const queuedJob = this.jobQueue.shift();
      if (queuedJob) {
        this.onDebug({
          message: "Starting job",
          name: queuedJob.name,
          workerThread,
          backlog: this.jobQueue.length
        });
        const job = new WorkerJob(queuedJob.name, workerThread);
        workerThread.onMessage = (data) => queuedJob.onMessage(job, data.type, data.payload);
        workerThread.onError = (error) => queuedJob.onError(job, error);
        queuedJob.onStart(job);
        try {
          await job.result;
        } finally {
          this.returnWorkerToQueue(workerThread);
        }
      }
    }
    returnWorkerToQueue(worker) {
      const shouldDestroyWorker = this.isDestroyed || !this.reuseWorkers || this.count > this._getMaxConcurrency();
      if (shouldDestroyWorker) {
        worker.destroy();
        this.count--;
      } else {
        this.idleQueue.push(worker);
      }
      if (!this.isDestroyed) {
        this._startQueuedJob();
      }
    }
    _getAvailableWorker() {
      if (this.idleQueue.length > 0) {
        return this.idleQueue.shift() || null;
      }
      if (this.count < this._getMaxConcurrency()) {
        this.count++;
        const name = "".concat(this.name.toLowerCase(), " (#").concat(this.count, " of ").concat(this.maxConcurrency, ")");
        return new WorkerThread({
          name,
          source: this.source,
          url: this.url
        });
      }
      return null;
    }
    _getMaxConcurrency() {
      return isMobile ? this.maxMobileConcurrency : this.maxConcurrency;
    }
  }
  const DEFAULT_PROPS = {
    maxConcurrency: 3,
    maxMobileConcurrency: 1,
    reuseWorkers: true,
    onDebug: () => {
    }
  };
  class WorkerFarm {
    static isSupported() {
      return WorkerThread.isSupported();
    }
    static getWorkerFarm() {
      let props = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      WorkerFarm._workerFarm = WorkerFarm._workerFarm || new WorkerFarm({});
      WorkerFarm._workerFarm.setProps(props);
      return WorkerFarm._workerFarm;
    }
    constructor(props) {
      _defineProperty(this, "props", void 0);
      _defineProperty(this, "workerPools", /* @__PURE__ */ new Map());
      this.props = {
        ...DEFAULT_PROPS
      };
      this.setProps(props);
      this.workerPools = /* @__PURE__ */ new Map();
    }
    destroy() {
      for (const workerPool of this.workerPools.values()) {
        workerPool.destroy();
      }
      this.workerPools = /* @__PURE__ */ new Map();
    }
    setProps(props) {
      this.props = {
        ...this.props,
        ...props
      };
      for (const workerPool of this.workerPools.values()) {
        workerPool.setProps(this._getWorkerPoolProps());
      }
    }
    getWorkerPool(options) {
      const {
        name,
        source,
        url: url2
      } = options;
      let workerPool = this.workerPools.get(name);
      if (!workerPool) {
        workerPool = new WorkerPool({
          name,
          source,
          url: url2
        });
        workerPool.setProps(this._getWorkerPoolProps());
        this.workerPools.set(name, workerPool);
      }
      return workerPool;
    }
    _getWorkerPoolProps() {
      return {
        maxConcurrency: this.props.maxConcurrency,
        maxMobileConcurrency: this.props.maxMobileConcurrency,
        reuseWorkers: this.props.reuseWorkers,
        onDebug: this.props.onDebug
      };
    }
  }
  _defineProperty(WorkerFarm, "_workerFarm", void 0);
  const NPM_TAG = "latest";
  function getWorkerURL(worker) {
    let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
    const workerOptions = options[worker.id] || {};
    const workerFile = "".concat(worker.id, "-worker.js");
    let url2 = workerOptions.workerUrl;
    if (!url2 && worker.id === "compression") {
      url2 = options.workerUrl;
    }
    if (options._workerType === "test") {
      url2 = "modules/".concat(worker.module, "/dist/").concat(workerFile);
    }
    if (!url2) {
      let version = worker.version;
      if (version === "latest") {
        version = NPM_TAG;
      }
      const versionTag = version ? "@".concat(version) : "";
      url2 = "https://unpkg.com/@loaders.gl/".concat(worker.module).concat(versionTag, "/dist/").concat(workerFile);
    }
    assert$2(url2);
    return url2;
  }
  function validateWorkerVersion(worker) {
    let coreVersion = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : VERSION$2;
    assert$2(worker, "no worker provided");
    const workerVersion = worker.version;
    if (!coreVersion || !workerVersion) {
      return false;
    }
    return true;
  }
  function canParseWithWorker(loader, options) {
    if (!WorkerFarm.isSupported()) {
      return false;
    }
    if (!isBrowser$1 && !(options !== null && options !== void 0 && options._nodeWorkers)) {
      return false;
    }
    return loader.worker && (options === null || options === void 0 ? void 0 : options.worker);
  }
  async function parseWithWorker(loader, data, options, context, parseOnMainThread) {
    const name = loader.id;
    const url2 = getWorkerURL(loader, options);
    const workerFarm = WorkerFarm.getWorkerFarm(options);
    const workerPool = workerFarm.getWorkerPool({
      name,
      url: url2
    });
    options = JSON.parse(JSON.stringify(options));
    context = JSON.parse(JSON.stringify(context || {}));
    const job = await workerPool.startJob("process-on-worker", onMessage.bind(null, parseOnMainThread));
    job.postMessage("process", {
      input: data,
      options,
      context
    });
    const result = await job.result;
    return await result.result;
  }
  async function onMessage(parseOnMainThread, job, type, payload) {
    switch (type) {
      case "done":
        job.done(payload);
        break;
      case "error":
        job.error(new Error(payload.error));
        break;
      case "process":
        const {
          id,
          input,
          options
        } = payload;
        try {
          const result = await parseOnMainThread(input, options);
          job.postMessage("done", {
            id,
            result
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown error";
          job.postMessage("error", {
            id,
            error: message
          });
        }
        break;
      default:
        console.warn("parse-with-worker unknown message ".concat(type));
    }
  }
  function compareArrayBuffers(arrayBuffer1, arrayBuffer2, byteLength) {
    byteLength = byteLength || arrayBuffer1.byteLength;
    if (arrayBuffer1.byteLength < byteLength || arrayBuffer2.byteLength < byteLength) {
      return false;
    }
    const array1 = new Uint8Array(arrayBuffer1);
    const array2 = new Uint8Array(arrayBuffer2);
    for (let i = 0; i < array1.length; ++i) {
      if (array1[i] !== array2[i]) {
        return false;
      }
    }
    return true;
  }
  function concatenateArrayBuffers() {
    for (var _len = arguments.length, sources = new Array(_len), _key = 0; _key < _len; _key++) {
      sources[_key] = arguments[_key];
    }
    const sourceArrays = sources.map((source2) => source2 instanceof ArrayBuffer ? new Uint8Array(source2) : source2);
    const byteLength = sourceArrays.reduce((length, typedArray) => length + typedArray.byteLength, 0);
    const result = new Uint8Array(byteLength);
    let offset = 0;
    for (const sourceArray of sourceArrays) {
      result.set(sourceArray, offset);
      offset += sourceArray.byteLength;
    }
    return result.buffer;
  }
  function makeTextDecoderIterator(arrayBufferIterator) {
    try {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
      return async function* () {
        const textDecoder = new TextDecoder(void 0, options);
        for await (const arrayBuffer of arrayBufferIterator) {
          yield typeof arrayBuffer === "string" ? arrayBuffer : textDecoder.decode(arrayBuffer, {
            stream: true
          });
        }
      }();
    } catch (e) {
      return Promise.reject(e);
    }
  }
  async function* makeLineIterator(textIterator) {
    let previous = "";
    for await (const textChunk of textIterator) {
      previous += textChunk;
      let eolIndex;
      while ((eolIndex = previous.indexOf("\n")) >= 0) {
        const line = previous.slice(0, eolIndex + 1);
        previous = previous.slice(eolIndex + 1);
        yield line;
      }
    }
    if (previous.length > 0) {
      yield previous;
    }
  }
  async function forEach(iterator, visitor) {
    while (true) {
      const {
        done,
        value
      } = await iterator.next();
      if (done) {
        iterator.return();
        return;
      }
      const cancel = visitor(value);
      if (cancel) {
        return;
      }
    }
  }
  async function concatenateArrayBuffersAsync(asyncIterator) {
    const arrayBuffers = [];
    for await (const chunk2 of asyncIterator) {
      arrayBuffers.push(chunk2);
    }
    return concatenateArrayBuffers(...arrayBuffers);
  }
  let pathPrefix = "";
  const fileAliases = {};
  function resolvePath(filename2) {
    for (const alias in fileAliases) {
      if (filename2.startsWith(alias)) {
        const replacement = fileAliases[alias];
        filename2 = filename2.replace(alias, replacement);
      }
    }
    if (!filename2.startsWith("http://") && !filename2.startsWith("https://")) {
      filename2 = "".concat(pathPrefix).concat(filename2);
    }
    return filename2;
  }
  function toArrayBuffer$1(buffer) {
    return buffer;
  }
  function isBuffer$1(value) {
    return value && typeof value === "object" && value.isBuffer;
  }
  function toArrayBuffer(data) {
    if (isBuffer$1(data)) {
      return toArrayBuffer$1(data);
    }
    if (data instanceof ArrayBuffer) {
      return data;
    }
    if (ArrayBuffer.isView(data)) {
      if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
        return data.buffer;
      }
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    if (typeof data === "string") {
      const text = data;
      const uint8Array = new TextEncoder().encode(text);
      return uint8Array.buffer;
    }
    if (data && typeof data === "object" && data._toArrayBuffer) {
      return data._toArrayBuffer();
    }
    throw new Error("toArrayBuffer");
  }
  function filename(url2) {
    const slashIndex = url2 ? url2.lastIndexOf("/") : -1;
    return slashIndex >= 0 ? url2.substr(slashIndex + 1) : "";
  }
  function dirname(url2) {
    const slashIndex = url2 ? url2.lastIndexOf("/") : -1;
    return slashIndex >= 0 ? url2.substr(0, slashIndex) : "";
  }
  const isBoolean = (x) => typeof x === "boolean";
  const isFunction = (x) => typeof x === "function";
  const isObject = (x) => x !== null && typeof x === "object";
  const isPureObject = (x) => isObject(x) && x.constructor === {}.constructor;
  const isIterable = (x) => x && typeof x[Symbol.iterator] === "function";
  const isAsyncIterable = (x) => x && typeof x[Symbol.asyncIterator] === "function";
  const isResponse = (x) => typeof Response !== "undefined" && x instanceof Response || x && x.arrayBuffer && x.text && x.json;
  const isBlob = (x) => typeof Blob !== "undefined" && x instanceof Blob;
  const isBuffer = (x) => x && typeof x === "object" && x.isBuffer;
  const isReadableDOMStream = (x) => typeof ReadableStream !== "undefined" && x instanceof ReadableStream || isObject(x) && isFunction(x.tee) && isFunction(x.cancel) && isFunction(x.getReader);
  const isReadableNodeStream = (x) => isObject(x) && isFunction(x.read) && isFunction(x.pipe) && isBoolean(x.readable);
  const isReadableStream = (x) => isReadableDOMStream(x) || isReadableNodeStream(x);
  const DATA_URL_PATTERN = /^data:([-\w.]+\/[-\w.+]+)(;|,)/;
  const MIME_TYPE_PATTERN = /^([-\w.]+\/[-\w.+]+)/;
  function parseMIMEType(mimeString) {
    const matches2 = MIME_TYPE_PATTERN.exec(mimeString);
    if (matches2) {
      return matches2[1];
    }
    return mimeString;
  }
  function parseMIMETypeFromURL(url2) {
    const matches2 = DATA_URL_PATTERN.exec(url2);
    if (matches2) {
      return matches2[1];
    }
    return "";
  }
  const QUERY_STRING_PATTERN = /\?.*/;
  function extractQueryString(url2) {
    const matches2 = url2.match(QUERY_STRING_PATTERN);
    return matches2 && matches2[0];
  }
  function stripQueryString(url2) {
    return url2.replace(QUERY_STRING_PATTERN, "");
  }
  function getResourceUrl(resource) {
    if (isResponse(resource)) {
      const response = resource;
      return response.url;
    }
    if (isBlob(resource)) {
      const blob = resource;
      return blob.name || "";
    }
    if (typeof resource === "string") {
      return resource;
    }
    return "";
  }
  function getResourceMIMEType(resource) {
    if (isResponse(resource)) {
      const response = resource;
      const contentTypeHeader = response.headers.get("content-type") || "";
      const noQueryUrl = stripQueryString(response.url);
      return parseMIMEType(contentTypeHeader) || parseMIMETypeFromURL(noQueryUrl);
    }
    if (isBlob(resource)) {
      const blob = resource;
      return blob.type || "";
    }
    if (typeof resource === "string") {
      return parseMIMETypeFromURL(resource);
    }
    return "";
  }
  function getResourceContentLength(resource) {
    if (isResponse(resource)) {
      const response = resource;
      return response.headers["content-length"] || -1;
    }
    if (isBlob(resource)) {
      const blob = resource;
      return blob.size;
    }
    if (typeof resource === "string") {
      return resource.length;
    }
    if (resource instanceof ArrayBuffer) {
      return resource.byteLength;
    }
    if (ArrayBuffer.isView(resource)) {
      return resource.byteLength;
    }
    return -1;
  }
  async function makeResponse(resource) {
    if (isResponse(resource)) {
      return resource;
    }
    const headers = {};
    const contentLength = getResourceContentLength(resource);
    if (contentLength >= 0) {
      headers["content-length"] = String(contentLength);
    }
    const url2 = getResourceUrl(resource);
    const type = getResourceMIMEType(resource);
    if (type) {
      headers["content-type"] = type;
    }
    const initialDataUrl = await getInitialDataUrl(resource);
    if (initialDataUrl) {
      headers["x-first-bytes"] = initialDataUrl;
    }
    if (typeof resource === "string") {
      resource = new TextEncoder().encode(resource);
    }
    const response = new Response(resource, {
      headers
    });
    Object.defineProperty(response, "url", {
      value: url2
    });
    return response;
  }
  async function checkResponse(response) {
    if (!response.ok) {
      const message = await getResponseError(response);
      throw new Error(message);
    }
  }
  async function getResponseError(response) {
    let message = "Failed to fetch resource ".concat(response.url, " (").concat(response.status, "): ");
    try {
      const contentType = response.headers.get("Content-Type");
      let text = response.statusText;
      if (contentType.includes("application/json")) {
        text += " ".concat(await response.text());
      }
      message += text;
      message = message.length > 60 ? "".concat(message.slice(0, 60), "...") : message;
    } catch (error) {
    }
    return message;
  }
  async function getInitialDataUrl(resource) {
    const INITIAL_DATA_LENGTH = 5;
    if (typeof resource === "string") {
      return "data:,".concat(resource.slice(0, INITIAL_DATA_LENGTH));
    }
    if (resource instanceof Blob) {
      const blobSlice = resource.slice(0, 5);
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          var _event$target;
          return resolve(event === null || event === void 0 ? void 0 : (_event$target = event.target) === null || _event$target === void 0 ? void 0 : _event$target.result);
        };
        reader.readAsDataURL(blobSlice);
      });
    }
    if (resource instanceof ArrayBuffer) {
      const slice = resource.slice(0, INITIAL_DATA_LENGTH);
      const base64 = arrayBufferToBase64(slice);
      return "data:base64,".concat(base64);
    }
    return null;
  }
  function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes2 = new Uint8Array(buffer);
    for (let i = 0; i < bytes2.byteLength; i++) {
      binary += String.fromCharCode(bytes2[i]);
    }
    return btoa(binary);
  }
  async function fetchFile(url2, options) {
    if (typeof url2 === "string") {
      url2 = resolvePath(url2);
      let fetchOptions = options;
      if (options !== null && options !== void 0 && options.fetch && typeof (options === null || options === void 0 ? void 0 : options.fetch) !== "function") {
        fetchOptions = options.fetch;
      }
      return await fetch(url2, fetchOptions);
    }
    return await makeResponse(url2);
  }
  function isElectron(mockUserAgent) {
    if (typeof window !== "undefined" && typeof window.process === "object" && window.process.type === "renderer") {
      return true;
    }
    if (typeof process !== "undefined" && typeof process.versions === "object" && Boolean(process.versions["electron"])) {
      return true;
    }
    const realUserAgent = typeof navigator === "object" && typeof navigator.userAgent === "string" && navigator.userAgent;
    const userAgent = realUserAgent;
    if (userAgent && userAgent.indexOf("Electron") >= 0) {
      return true;
    }
    return false;
  }
  function isBrowser() {
    const isNode = typeof process === "object" && String(process) === "[object process]" && !process.browser;
    return !isNode || isElectron();
  }
  const globals = {
    self: typeof self !== "undefined" && self,
    window: typeof window !== "undefined" && window,
    global: typeof global !== "undefined" && global,
    process: typeof process === "object" && process
  };
  const window_ = globals.window || globals.self || globals.global;
  const process_ = globals.process || {};
  const VERSION$1 = typeof __VERSION__ !== "undefined" ? __VERSION__ : "untranspiled source";
  isBrowser();
  function getStorage(type) {
    try {
      const storage = window[type];
      const x = "__storage_test__";
      storage.setItem(x, x);
      storage.removeItem(x);
      return storage;
    } catch (e) {
      return null;
    }
  }
  class LocalStorage {
    constructor(id, defaultConfig) {
      let type = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : "sessionStorage";
      _defineProperty(this, "storage", void 0);
      _defineProperty(this, "id", void 0);
      _defineProperty(this, "config", void 0);
      this.storage = getStorage(type);
      this.id = id;
      this.config = defaultConfig;
      this._loadConfiguration();
    }
    getConfiguration() {
      return this.config;
    }
    setConfiguration(configuration) {
      Object.assign(this.config, configuration);
      if (this.storage) {
        const serialized = JSON.stringify(this.config);
        this.storage.setItem(this.id, serialized);
      }
    }
    _loadConfiguration() {
      let configuration = {};
      if (this.storage) {
        const serializedConfiguration = this.storage.getItem(this.id);
        configuration = serializedConfiguration ? JSON.parse(serializedConfiguration) : {};
      }
      Object.assign(this.config, configuration);
      return this;
    }
  }
  function formatTime(ms) {
    let formatted;
    if (ms < 10) {
      formatted = "".concat(ms.toFixed(2), "ms");
    } else if (ms < 100) {
      formatted = "".concat(ms.toFixed(1), "ms");
    } else if (ms < 1e3) {
      formatted = "".concat(ms.toFixed(0), "ms");
    } else {
      formatted = "".concat((ms / 1e3).toFixed(2), "s");
    }
    return formatted;
  }
  function leftPad(string) {
    let length = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 8;
    const padLength = Math.max(length - string.length, 0);
    return "".concat(" ".repeat(padLength)).concat(string);
  }
  function formatImage(image, message, scale) {
    let maxWidth = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : 600;
    const imageUrl = image.src.replace(/\(/g, "%28").replace(/\)/g, "%29");
    if (image.width > maxWidth) {
      scale = Math.min(scale, maxWidth / image.width);
    }
    const width = image.width * scale;
    const height = image.height * scale;
    const style = ["font-size:1px;", "padding:".concat(Math.floor(height / 2), "px ").concat(Math.floor(width / 2), "px;"), "line-height:".concat(height, "px;"), "background:url(".concat(imageUrl, ");"), "background-size:".concat(width, "px ").concat(height, "px;"), "color:transparent;"].join("");
    return ["".concat(message, " %c+"), style];
  }
  let COLOR;
  (function(COLOR2) {
    COLOR2[COLOR2["BLACK"] = 30] = "BLACK";
    COLOR2[COLOR2["RED"] = 31] = "RED";
    COLOR2[COLOR2["GREEN"] = 32] = "GREEN";
    COLOR2[COLOR2["YELLOW"] = 33] = "YELLOW";
    COLOR2[COLOR2["BLUE"] = 34] = "BLUE";
    COLOR2[COLOR2["MAGENTA"] = 35] = "MAGENTA";
    COLOR2[COLOR2["CYAN"] = 36] = "CYAN";
    COLOR2[COLOR2["WHITE"] = 37] = "WHITE";
    COLOR2[COLOR2["BRIGHT_BLACK"] = 90] = "BRIGHT_BLACK";
    COLOR2[COLOR2["BRIGHT_RED"] = 91] = "BRIGHT_RED";
    COLOR2[COLOR2["BRIGHT_GREEN"] = 92] = "BRIGHT_GREEN";
    COLOR2[COLOR2["BRIGHT_YELLOW"] = 93] = "BRIGHT_YELLOW";
    COLOR2[COLOR2["BRIGHT_BLUE"] = 94] = "BRIGHT_BLUE";
    COLOR2[COLOR2["BRIGHT_MAGENTA"] = 95] = "BRIGHT_MAGENTA";
    COLOR2[COLOR2["BRIGHT_CYAN"] = 96] = "BRIGHT_CYAN";
    COLOR2[COLOR2["BRIGHT_WHITE"] = 97] = "BRIGHT_WHITE";
  })(COLOR || (COLOR = {}));
  function getColor(color) {
    return typeof color === "string" ? COLOR[color.toUpperCase()] || COLOR.WHITE : color;
  }
  function addColor(string, color, background) {
    if (!isBrowser && typeof string === "string") {
      if (color) {
        color = getColor(color);
        string = "\x1B[".concat(color, "m").concat(string, "\x1B[39m");
      }
      if (background) {
        color = getColor(background);
        string = "\x1B[".concat(background + 10, "m").concat(string, "\x1B[49m");
      }
    }
    return string;
  }
  function autobind(obj) {
    let predefined = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : ["constructor"];
    const proto = Object.getPrototypeOf(obj);
    const propNames = Object.getOwnPropertyNames(proto);
    for (const key of propNames) {
      if (typeof obj[key] === "function") {
        if (!predefined.find((name) => key === name)) {
          obj[key] = obj[key].bind(obj);
        }
      }
    }
  }
  function assert$1(condition, message) {
    if (!condition) {
      throw new Error(message || "Assertion failed");
    }
  }
  function getHiResTimestamp() {
    let timestamp;
    if (isBrowser && "performance" in window_) {
      var _window$performance, _window$performance$n;
      timestamp = window_ === null || window_ === void 0 ? void 0 : (_window$performance = window_.performance) === null || _window$performance === void 0 ? void 0 : (_window$performance$n = _window$performance.now) === null || _window$performance$n === void 0 ? void 0 : _window$performance$n.call(_window$performance);
    } else if ("hrtime" in process_) {
      var _process$hrtime;
      const timeParts = process_ === null || process_ === void 0 ? void 0 : (_process$hrtime = process_.hrtime) === null || _process$hrtime === void 0 ? void 0 : _process$hrtime.call(process_);
      timestamp = timeParts[0] * 1e3 + timeParts[1] / 1e6;
    } else {
      timestamp = Date.now();
    }
    return timestamp;
  }
  const originalConsole = {
    debug: isBrowser ? console.debug || console.log : console.log,
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  };
  const DEFAULT_SETTINGS = {
    enabled: true,
    level: 0
  };
  function noop() {
  }
  const cache = {};
  const ONCE = {
    once: true
  };
  class Log {
    constructor() {
      let {
        id
      } = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {
        id: ""
      };
      _defineProperty(this, "id", void 0);
      _defineProperty(this, "VERSION", VERSION$1);
      _defineProperty(this, "_startTs", getHiResTimestamp());
      _defineProperty(this, "_deltaTs", getHiResTimestamp());
      _defineProperty(this, "_storage", void 0);
      _defineProperty(this, "userData", {});
      _defineProperty(this, "LOG_THROTTLE_TIMEOUT", 0);
      this.id = id;
      this.userData = {};
      this._storage = new LocalStorage("__probe-".concat(this.id, "__"), DEFAULT_SETTINGS);
      this.timeStamp("".concat(this.id, " started"));
      autobind(this);
      Object.seal(this);
    }
    set level(newLevel) {
      this.setLevel(newLevel);
    }
    get level() {
      return this.getLevel();
    }
    isEnabled() {
      return this._storage.config.enabled;
    }
    getLevel() {
      return this._storage.config.level;
    }
    getTotal() {
      return Number((getHiResTimestamp() - this._startTs).toPrecision(10));
    }
    getDelta() {
      return Number((getHiResTimestamp() - this._deltaTs).toPrecision(10));
    }
    set priority(newPriority) {
      this.level = newPriority;
    }
    get priority() {
      return this.level;
    }
    getPriority() {
      return this.level;
    }
    enable() {
      let enabled = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : true;
      this._storage.setConfiguration({
        enabled
      });
      return this;
    }
    setLevel(level) {
      this._storage.setConfiguration({
        level
      });
      return this;
    }
    get(setting) {
      return this._storage.config[setting];
    }
    set(setting, value) {
      this._storage.setConfiguration({
        [setting]: value
      });
    }
    settings() {
      if (console.table) {
        console.table(this._storage.config);
      } else {
        console.log(this._storage.config);
      }
    }
    assert(condition, message) {
      assert$1(condition, message);
    }
    warn(message) {
      return this._getLogFunction(0, message, originalConsole.warn, arguments, ONCE);
    }
    error(message) {
      return this._getLogFunction(0, message, originalConsole.error, arguments);
    }
    deprecated(oldUsage, newUsage) {
      return this.warn("`".concat(oldUsage, "` is deprecated and will be removed in a later version. Use `").concat(newUsage, "` instead"));
    }
    removed(oldUsage, newUsage) {
      return this.error("`".concat(oldUsage, "` has been removed. Use `").concat(newUsage, "` instead"));
    }
    probe(logLevel, message) {
      return this._getLogFunction(logLevel, message, originalConsole.log, arguments, {
        time: true,
        once: true
      });
    }
    log(logLevel, message) {
      return this._getLogFunction(logLevel, message, originalConsole.debug, arguments);
    }
    info(logLevel, message) {
      return this._getLogFunction(logLevel, message, console.info, arguments);
    }
    once(logLevel, message) {
      for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
        args[_key - 2] = arguments[_key];
      }
      return this._getLogFunction(logLevel, message, originalConsole.debug || originalConsole.info, arguments, ONCE);
    }
    table(logLevel, table, columns) {
      if (table) {
        return this._getLogFunction(logLevel, table, console.table || noop, columns && [columns], {
          tag: getTableHeader(table)
        });
      }
      return noop;
    }
    image(_ref) {
      let {
        logLevel,
        priority,
        image,
        message = "",
        scale = 1
      } = _ref;
      if (!this._shouldLog(logLevel || priority)) {
        return noop;
      }
      return isBrowser ? logImageInBrowser({
        image,
        message,
        scale
      }) : logImageInNode();
    }
    time(logLevel, message) {
      return this._getLogFunction(logLevel, message, console.time ? console.time : console.info);
    }
    timeEnd(logLevel, message) {
      return this._getLogFunction(logLevel, message, console.timeEnd ? console.timeEnd : console.info);
    }
    timeStamp(logLevel, message) {
      return this._getLogFunction(logLevel, message, console.timeStamp || noop);
    }
    group(logLevel, message) {
      let opts = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {
        collapsed: false
      };
      const options = normalizeArguments({
        logLevel,
        message,
        opts
      });
      const {
        collapsed
      } = opts;
      options.method = (collapsed ? console.groupCollapsed : console.group) || console.info;
      return this._getLogFunction(options);
    }
    groupCollapsed(logLevel, message) {
      let opts = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
      return this.group(logLevel, message, Object.assign({}, opts, {
        collapsed: true
      }));
    }
    groupEnd(logLevel) {
      return this._getLogFunction(logLevel, "", console.groupEnd || noop);
    }
    withGroup(logLevel, message, func) {
      this.group(logLevel, message)();
      try {
        func();
      } finally {
        this.groupEnd(logLevel)();
      }
    }
    trace() {
      if (console.trace) {
        console.trace();
      }
    }
    _shouldLog(logLevel) {
      return this.isEnabled() && this.getLevel() >= normalizeLogLevel(logLevel);
    }
    _getLogFunction(logLevel, message, method, args, opts) {
      if (this._shouldLog(logLevel)) {
        opts = normalizeArguments({
          logLevel,
          message,
          args,
          opts
        });
        method = method || opts.method;
        assert$1(method);
        opts.total = this.getTotal();
        opts.delta = this.getDelta();
        this._deltaTs = getHiResTimestamp();
        const tag = opts.tag || opts.message;
        if (opts.once) {
          if (!cache[tag]) {
            cache[tag] = getHiResTimestamp();
          } else {
            return noop;
          }
        }
        message = decorateMessage(this.id, opts.message, opts);
        return method.bind(console, message, ...opts.args);
      }
      return noop;
    }
  }
  _defineProperty(Log, "VERSION", VERSION$1);
  function normalizeLogLevel(logLevel) {
    if (!logLevel) {
      return 0;
    }
    let resolvedLevel;
    switch (typeof logLevel) {
      case "number":
        resolvedLevel = logLevel;
        break;
      case "object":
        resolvedLevel = logLevel.logLevel || logLevel.priority || 0;
        break;
      default:
        return 0;
    }
    assert$1(Number.isFinite(resolvedLevel) && resolvedLevel >= 0);
    return resolvedLevel;
  }
  function normalizeArguments(opts) {
    const {
      logLevel,
      message
    } = opts;
    opts.logLevel = normalizeLogLevel(logLevel);
    const args = opts.args ? Array.from(opts.args) : [];
    while (args.length && args.shift() !== message) {
    }
    switch (typeof logLevel) {
      case "string":
      case "function":
        if (message !== void 0) {
          args.unshift(message);
        }
        opts.message = logLevel;
        break;
      case "object":
        Object.assign(opts, logLevel);
        break;
    }
    if (typeof opts.message === "function") {
      opts.message = opts.message();
    }
    const messageType = typeof opts.message;
    assert$1(messageType === "string" || messageType === "object");
    return Object.assign(opts, {
      args
    }, opts.opts);
  }
  function decorateMessage(id, message, opts) {
    if (typeof message === "string") {
      const time = opts.time ? leftPad(formatTime(opts.total)) : "";
      message = opts.time ? "".concat(id, ": ").concat(time, "  ").concat(message) : "".concat(id, ": ").concat(message);
      message = addColor(message, opts.color, opts.background);
    }
    return message;
  }
  function logImageInNode(_ref2) {
    console.warn("removed");
    return noop;
  }
  function logImageInBrowser(_ref3) {
    let {
      image,
      message = "",
      scale = 1
    } = _ref3;
    if (typeof image === "string") {
      const img = new Image();
      img.onload = () => {
        const args = formatImage(img, message, scale);
        console.log(...args);
      };
      img.src = image;
      return noop;
    }
    const element = image.nodeName || "";
    if (element.toLowerCase() === "img") {
      console.log(...formatImage(image, message, scale));
      return noop;
    }
    if (element.toLowerCase() === "canvas") {
      const img = new Image();
      img.onload = () => console.log(...formatImage(img, message, scale));
      img.src = image.toDataURL();
      return noop;
    }
    return noop;
  }
  function getTableHeader(table) {
    for (const key in table) {
      for (const title in table[key]) {
        return title || "untitled";
      }
    }
    return "empty";
  }
  const probeLog = new Log({
    id: "loaders.gl"
  });
  class NullLog {
    log() {
      return () => {
      };
    }
    info() {
      return () => {
      };
    }
    warn() {
      return () => {
      };
    }
    error() {
      return () => {
      };
    }
  }
  class ConsoleLog {
    constructor() {
      _defineProperty(this, "console", void 0);
      this.console = console;
    }
    log() {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      return this.console.log.bind(this.console, ...args);
    }
    info() {
      for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        args[_key2] = arguments[_key2];
      }
      return this.console.info.bind(this.console, ...args);
    }
    warn() {
      for (var _len3 = arguments.length, args = new Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
        args[_key3] = arguments[_key3];
      }
      return this.console.warn.bind(this.console, ...args);
    }
    error() {
      for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
        args[_key4] = arguments[_key4];
      }
      return this.console.error.bind(this.console, ...args);
    }
  }
  const DEFAULT_LOADER_OPTIONS = {
    fetch: null,
    mimeType: void 0,
    nothrow: false,
    log: new ConsoleLog(),
    CDN: "https://unpkg.com/@loaders.gl",
    worker: true,
    maxConcurrency: 3,
    maxMobileConcurrency: 1,
    reuseWorkers: isBrowser$2,
    _nodeWorkers: false,
    _workerType: "",
    limit: 0,
    _limitMB: 0,
    batchSize: "auto",
    batchDebounceMs: 0,
    metadata: false,
    transforms: []
  };
  const REMOVED_LOADER_OPTIONS = {
    throws: "nothrow",
    dataType: "(no longer used)",
    uri: "baseUri",
    method: "fetch.method",
    headers: "fetch.headers",
    body: "fetch.body",
    mode: "fetch.mode",
    credentials: "fetch.credentials",
    cache: "fetch.cache",
    redirect: "fetch.redirect",
    referrer: "fetch.referrer",
    referrerPolicy: "fetch.referrerPolicy",
    integrity: "fetch.integrity",
    keepalive: "fetch.keepalive",
    signal: "fetch.signal"
  };
  function getGlobalLoaderState() {
    globalThis.loaders = globalThis.loaders || {};
    const {
      loaders
    } = globalThis;
    loaders._state = loaders._state || {};
    return loaders._state;
  }
  const getGlobalLoaderOptions = () => {
    const state = getGlobalLoaderState();
    state.globalOptions = state.globalOptions || {
      ...DEFAULT_LOADER_OPTIONS
    };
    return state.globalOptions;
  };
  function normalizeOptions(options, loader, loaders, url2) {
    loaders = loaders || [];
    loaders = Array.isArray(loaders) ? loaders : [loaders];
    validateOptions(options, loaders);
    return normalizeOptionsInternal(loader, options, url2);
  }
  function validateOptions(options, loaders) {
    validateOptionsObject(options, null, DEFAULT_LOADER_OPTIONS, REMOVED_LOADER_OPTIONS, loaders);
    for (const loader of loaders) {
      const idOptions = options && options[loader.id] || {};
      const loaderOptions = loader.options && loader.options[loader.id] || {};
      const deprecatedOptions = loader.deprecatedOptions && loader.deprecatedOptions[loader.id] || {};
      validateOptionsObject(idOptions, loader.id, loaderOptions, deprecatedOptions, loaders);
    }
  }
  function validateOptionsObject(options, id, defaultOptions, deprecatedOptions, loaders) {
    const loaderName = id || "Top level";
    const prefix = id ? "".concat(id, ".") : "";
    for (const key in options) {
      const isSubOptions = !id && isObject(options[key]);
      const isBaseUriOption = key === "baseUri" && !id;
      const isWorkerUrlOption = key === "workerUrl" && id;
      if (!(key in defaultOptions) && !isBaseUriOption && !isWorkerUrlOption) {
        if (key in deprecatedOptions) {
          probeLog.warn("".concat(loaderName, " loader option '").concat(prefix).concat(key, "' no longer supported, use '").concat(deprecatedOptions[key], "'"))();
        } else if (!isSubOptions) {
          const suggestion = findSimilarOption(key, loaders);
          probeLog.warn("".concat(loaderName, " loader option '").concat(prefix).concat(key, "' not recognized. ").concat(suggestion))();
        }
      }
    }
  }
  function findSimilarOption(optionKey, loaders) {
    const lowerCaseOptionKey = optionKey.toLowerCase();
    let bestSuggestion = "";
    for (const loader of loaders) {
      for (const key in loader.options) {
        if (optionKey === key) {
          return "Did you mean '".concat(loader.id, ".").concat(key, "'?");
        }
        const lowerCaseKey = key.toLowerCase();
        const isPartialMatch = lowerCaseOptionKey.startsWith(lowerCaseKey) || lowerCaseKey.startsWith(lowerCaseOptionKey);
        if (isPartialMatch) {
          bestSuggestion = bestSuggestion || "Did you mean '".concat(loader.id, ".").concat(key, "'?");
        }
      }
    }
    return bestSuggestion;
  }
  function normalizeOptionsInternal(loader, options, url2) {
    const loaderDefaultOptions = loader.options || {};
    const mergedOptions = {
      ...loaderDefaultOptions
    };
    addUrlOptions(mergedOptions, url2);
    if (mergedOptions.log === null) {
      mergedOptions.log = new NullLog();
    }
    mergeNestedFields(mergedOptions, getGlobalLoaderOptions());
    mergeNestedFields(mergedOptions, options);
    return mergedOptions;
  }
  function mergeNestedFields(mergedOptions, options) {
    for (const key in options) {
      if (key in options) {
        const value = options[key];
        if (isPureObject(value) && isPureObject(mergedOptions[key])) {
          mergedOptions[key] = {
            ...mergedOptions[key],
            ...options[key]
          };
        } else {
          mergedOptions[key] = options[key];
        }
      }
    }
  }
  function addUrlOptions(options, url2) {
    if (url2 && !("baseUri" in options)) {
      options.baseUri = url2;
    }
  }
  function isLoaderObject(loader) {
    var _loader;
    if (!loader) {
      return false;
    }
    if (Array.isArray(loader)) {
      loader = loader[0];
    }
    const hasExtensions = Array.isArray((_loader = loader) === null || _loader === void 0 ? void 0 : _loader.extensions);
    return hasExtensions;
  }
  function normalizeLoader(loader) {
    var _loader2, _loader3;
    assert$3(loader, "null loader");
    assert$3(isLoaderObject(loader), "invalid loader");
    let options;
    if (Array.isArray(loader)) {
      options = loader[1];
      loader = loader[0];
      loader = {
        ...loader,
        options: {
          ...loader.options,
          ...options
        }
      };
    }
    if ((_loader2 = loader) !== null && _loader2 !== void 0 && _loader2.parseTextSync || (_loader3 = loader) !== null && _loader3 !== void 0 && _loader3.parseText) {
      loader.text = true;
    }
    if (!loader.text) {
      loader.binary = true;
    }
    return loader;
  }
  const getGlobalLoaderRegistry = () => {
    const state = getGlobalLoaderState();
    state.loaderRegistry = state.loaderRegistry || [];
    return state.loaderRegistry;
  };
  function getRegisteredLoaders() {
    return getGlobalLoaderRegistry();
  }
  const log = new Log({
    id: "loaders.gl"
  });
  const EXT_PATTERN = /\.([^.]+)$/;
  async function selectLoader(data) {
    let loaders = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : [];
    let options = arguments.length > 2 ? arguments[2] : void 0;
    let context = arguments.length > 3 ? arguments[3] : void 0;
    if (!validHTTPResponse(data)) {
      return null;
    }
    let loader = selectLoaderSync(data, loaders, {
      ...options,
      nothrow: true
    }, context);
    if (loader) {
      return loader;
    }
    if (isBlob(data)) {
      data = await data.slice(0, 10).arrayBuffer();
      loader = selectLoaderSync(data, loaders, options, context);
    }
    if (!loader && !(options !== null && options !== void 0 && options.nothrow)) {
      throw new Error(getNoValidLoaderMessage(data));
    }
    return loader;
  }
  function selectLoaderSync(data) {
    let loaders = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : [];
    let options = arguments.length > 2 ? arguments[2] : void 0;
    let context = arguments.length > 3 ? arguments[3] : void 0;
    if (!validHTTPResponse(data)) {
      return null;
    }
    if (loaders && !Array.isArray(loaders)) {
      return normalizeLoader(loaders);
    }
    let candidateLoaders = [];
    if (loaders) {
      candidateLoaders = candidateLoaders.concat(loaders);
    }
    if (!(options !== null && options !== void 0 && options.ignoreRegisteredLoaders)) {
      candidateLoaders.push(...getRegisteredLoaders());
    }
    normalizeLoaders(candidateLoaders);
    const loader = selectLoaderInternal(data, candidateLoaders, options, context);
    if (!loader && !(options !== null && options !== void 0 && options.nothrow)) {
      throw new Error(getNoValidLoaderMessage(data));
    }
    return loader;
  }
  function selectLoaderInternal(data, loaders, options, context) {
    const url2 = getResourceUrl(data);
    const type = getResourceMIMEType(data);
    const testUrl = stripQueryString(url2) || (context === null || context === void 0 ? void 0 : context.url);
    let loader = null;
    let reason = "";
    if (options !== null && options !== void 0 && options.mimeType) {
      loader = findLoaderByMIMEType(loaders, options === null || options === void 0 ? void 0 : options.mimeType);
      reason = "match forced by supplied MIME type ".concat(options === null || options === void 0 ? void 0 : options.mimeType);
    }
    loader = loader || findLoaderByUrl(loaders, testUrl);
    reason = reason || (loader ? "matched url ".concat(testUrl) : "");
    loader = loader || findLoaderByMIMEType(loaders, type);
    reason = reason || (loader ? "matched MIME type ".concat(type) : "");
    loader = loader || findLoaderByInitialBytes(loaders, data);
    reason = reason || (loader ? "matched initial data ".concat(getFirstCharacters(data)) : "");
    loader = loader || findLoaderByMIMEType(loaders, options === null || options === void 0 ? void 0 : options.fallbackMimeType);
    reason = reason || (loader ? "matched fallback MIME type ".concat(type) : "");
    if (reason) {
      var _loader;
      log.log(1, "selectLoader selected ".concat((_loader = loader) === null || _loader === void 0 ? void 0 : _loader.name, ": ").concat(reason, "."));
    }
    return loader;
  }
  function validHTTPResponse(data) {
    if (data instanceof Response) {
      if (data.status === 204) {
        return false;
      }
    }
    return true;
  }
  function getNoValidLoaderMessage(data) {
    const url2 = getResourceUrl(data);
    const type = getResourceMIMEType(data);
    let message = "No valid loader found (";
    message += url2 ? "".concat(filename(url2), ", ") : "no url provided, ";
    message += "MIME type: ".concat(type ? '"'.concat(type, '"') : "not provided", ", ");
    const firstCharacters = data ? getFirstCharacters(data) : "";
    message += firstCharacters ? ' first bytes: "'.concat(firstCharacters, '"') : "first bytes: not available";
    message += ")";
    return message;
  }
  function normalizeLoaders(loaders) {
    for (const loader of loaders) {
      normalizeLoader(loader);
    }
  }
  function findLoaderByUrl(loaders, url2) {
    const match = url2 && EXT_PATTERN.exec(url2);
    const extension = match && match[1];
    return extension ? findLoaderByExtension(loaders, extension) : null;
  }
  function findLoaderByExtension(loaders, extension) {
    extension = extension.toLowerCase();
    for (const loader of loaders) {
      for (const loaderExtension of loader.extensions) {
        if (loaderExtension.toLowerCase() === extension) {
          return loader;
        }
      }
    }
    return null;
  }
  function findLoaderByMIMEType(loaders, mimeType) {
    for (const loader of loaders) {
      if (loader.mimeTypes && loader.mimeTypes.includes(mimeType)) {
        return loader;
      }
      if (mimeType === "application/x.".concat(loader.id)) {
        return loader;
      }
    }
    return null;
  }
  function findLoaderByInitialBytes(loaders, data) {
    if (!data) {
      return null;
    }
    for (const loader of loaders) {
      if (typeof data === "string") {
        if (testDataAgainstText(data, loader)) {
          return loader;
        }
      } else if (ArrayBuffer.isView(data)) {
        if (testDataAgainstBinary(data.buffer, data.byteOffset, loader)) {
          return loader;
        }
      } else if (data instanceof ArrayBuffer) {
        const byteOffset = 0;
        if (testDataAgainstBinary(data, byteOffset, loader)) {
          return loader;
        }
      }
    }
    return null;
  }
  function testDataAgainstText(data, loader) {
    if (loader.testText) {
      return loader.testText(data);
    }
    const tests = Array.isArray(loader.tests) ? loader.tests : [loader.tests];
    return tests.some((test) => data.startsWith(test));
  }
  function testDataAgainstBinary(data, byteOffset, loader) {
    const tests = Array.isArray(loader.tests) ? loader.tests : [loader.tests];
    return tests.some((test) => testBinary(data, byteOffset, loader, test));
  }
  function testBinary(data, byteOffset, loader, test) {
    if (test instanceof ArrayBuffer) {
      return compareArrayBuffers(test, data, test.byteLength);
    }
    switch (typeof test) {
      case "function":
        return test(data, loader);
      case "string":
        const magic = getMagicString(data, byteOffset, test.length);
        return test === magic;
      default:
        return false;
    }
  }
  function getFirstCharacters(data) {
    let length = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 5;
    if (typeof data === "string") {
      return data.slice(0, length);
    } else if (ArrayBuffer.isView(data)) {
      return getMagicString(data.buffer, data.byteOffset, length);
    } else if (data instanceof ArrayBuffer) {
      const byteOffset = 0;
      return getMagicString(data, byteOffset, length);
    }
    return "";
  }
  function getMagicString(arrayBuffer, byteOffset, length) {
    if (arrayBuffer.byteLength < byteOffset + length) {
      return "";
    }
    const dataView = new DataView(arrayBuffer);
    let magic = "";
    for (let i = 0; i < length; i++) {
      magic += String.fromCharCode(dataView.getUint8(byteOffset + i));
    }
    return magic;
  }
  const DEFAULT_CHUNK_SIZE$3 = 256 * 1024;
  function* makeStringIterator(string, options) {
    const chunkSize = (options === null || options === void 0 ? void 0 : options.chunkSize) || DEFAULT_CHUNK_SIZE$3;
    let offset = 0;
    const textEncoder = new TextEncoder();
    while (offset < string.length) {
      const chunkLength = Math.min(string.length - offset, chunkSize);
      const chunk2 = string.slice(offset, offset + chunkLength);
      offset += chunkLength;
      yield textEncoder.encode(chunk2);
    }
  }
  const DEFAULT_CHUNK_SIZE$2 = 256 * 1024;
  function makeArrayBufferIterator(arrayBuffer) {
    let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
    return function* () {
      const {
        chunkSize = DEFAULT_CHUNK_SIZE$2
      } = options;
      let byteOffset = 0;
      while (byteOffset < arrayBuffer.byteLength) {
        const chunkByteLength = Math.min(arrayBuffer.byteLength - byteOffset, chunkSize);
        const chunk2 = new ArrayBuffer(chunkByteLength);
        const sourceArray = new Uint8Array(arrayBuffer, byteOffset, chunkByteLength);
        const chunkArray = new Uint8Array(chunk2);
        chunkArray.set(sourceArray);
        byteOffset += chunkByteLength;
        yield chunk2;
      }
    }();
  }
  const DEFAULT_CHUNK_SIZE$1 = 1024 * 1024;
  async function* makeBlobIterator(blob, options) {
    const chunkSize = (options === null || options === void 0 ? void 0 : options.chunkSize) || DEFAULT_CHUNK_SIZE$1;
    let offset = 0;
    while (offset < blob.size) {
      const end = offset + chunkSize;
      const chunk2 = await blob.slice(offset, end).arrayBuffer();
      offset = end;
      yield chunk2;
    }
  }
  function makeStreamIterator(stream, options) {
    return isBrowser$2 ? makeBrowserStreamIterator(stream, options) : makeNodeStreamIterator(stream);
  }
  async function* makeBrowserStreamIterator(stream, options) {
    const reader = stream.getReader();
    let nextBatchPromise;
    try {
      while (true) {
        const currentBatchPromise = nextBatchPromise || reader.read();
        if (options !== null && options !== void 0 && options._streamReadAhead) {
          nextBatchPromise = reader.read();
        }
        const {
          done,
          value
        } = await currentBatchPromise;
        if (done) {
          return;
        }
        yield toArrayBuffer(value);
      }
    } catch (error) {
      reader.releaseLock();
    }
  }
  async function* makeNodeStreamIterator(stream, options) {
    for await (const chunk2 of stream) {
      yield toArrayBuffer(chunk2);
    }
  }
  function makeIterator(data, options) {
    if (typeof data === "string") {
      return makeStringIterator(data, options);
    }
    if (data instanceof ArrayBuffer) {
      return makeArrayBufferIterator(data, options);
    }
    if (isBlob(data)) {
      return makeBlobIterator(data, options);
    }
    if (isReadableStream(data)) {
      return makeStreamIterator(data, options);
    }
    if (isResponse(data)) {
      const response = data;
      return makeStreamIterator(response.body, options);
    }
    throw new Error("makeIterator");
  }
  const ERR_DATA = "Cannot convert supplied data type";
  function getArrayBufferOrStringFromDataSync(data, loader, options) {
    if (loader.text && typeof data === "string") {
      return data;
    }
    if (isBuffer(data)) {
      data = data.buffer;
    }
    if (data instanceof ArrayBuffer) {
      const arrayBuffer = data;
      if (loader.text && !loader.binary) {
        const textDecoder = new TextDecoder("utf8");
        return textDecoder.decode(arrayBuffer);
      }
      return arrayBuffer;
    }
    if (ArrayBuffer.isView(data)) {
      if (loader.text && !loader.binary) {
        const textDecoder = new TextDecoder("utf8");
        return textDecoder.decode(data);
      }
      let arrayBuffer = data.buffer;
      const byteLength = data.byteLength || data.length;
      if (data.byteOffset !== 0 || byteLength !== arrayBuffer.byteLength) {
        arrayBuffer = arrayBuffer.slice(data.byteOffset, data.byteOffset + byteLength);
      }
      return arrayBuffer;
    }
    throw new Error(ERR_DATA);
  }
  async function getArrayBufferOrStringFromData(data, loader, options) {
    const isArrayBuffer = data instanceof ArrayBuffer || ArrayBuffer.isView(data);
    if (typeof data === "string" || isArrayBuffer) {
      return getArrayBufferOrStringFromDataSync(data, loader);
    }
    if (isBlob(data)) {
      data = await makeResponse(data);
    }
    if (isResponse(data)) {
      const response = data;
      await checkResponse(response);
      return loader.binary ? await response.arrayBuffer() : await response.text();
    }
    if (isReadableStream(data)) {
      data = makeIterator(data, options);
    }
    if (isIterable(data) || isAsyncIterable(data)) {
      return concatenateArrayBuffersAsync(data);
    }
    throw new Error(ERR_DATA);
  }
  function getFetchFunction(options, context) {
    const globalOptions = getGlobalLoaderOptions();
    const fetchOptions = options || globalOptions;
    if (typeof fetchOptions.fetch === "function") {
      return fetchOptions.fetch;
    }
    if (isObject(fetchOptions.fetch)) {
      return (url2) => fetchFile(url2, fetchOptions);
    }
    if (context !== null && context !== void 0 && context.fetch) {
      return context === null || context === void 0 ? void 0 : context.fetch;
    }
    return fetchFile;
  }
  function getLoaderContext(context, options, parentContext) {
    if (parentContext) {
      return parentContext;
    }
    const newContext = {
      fetch: getFetchFunction(options, context),
      ...context
    };
    if (newContext.url) {
      const baseUrl = stripQueryString(newContext.url);
      newContext.baseUrl = baseUrl;
      newContext.queryString = extractQueryString(newContext.url);
      newContext.filename = filename(baseUrl);
      newContext.baseUrl = dirname(baseUrl);
    }
    if (!Array.isArray(newContext.loaders)) {
      newContext.loaders = null;
    }
    return newContext;
  }
  function getLoadersFromContext(loaders, context) {
    if (!context && loaders && !Array.isArray(loaders)) {
      return loaders;
    }
    let candidateLoaders;
    if (loaders) {
      candidateLoaders = Array.isArray(loaders) ? loaders : [loaders];
    }
    if (context && context.loaders) {
      const contextLoaders = Array.isArray(context.loaders) ? context.loaders : [context.loaders];
      candidateLoaders = candidateLoaders ? [...candidateLoaders, ...contextLoaders] : contextLoaders;
    }
    return candidateLoaders && candidateLoaders.length ? candidateLoaders : null;
  }
  async function parse(data, loaders, options, context) {
    assert$2(!context || typeof context === "object");
    if (loaders && !Array.isArray(loaders) && !isLoaderObject(loaders)) {
      context = void 0;
      options = loaders;
      loaders = void 0;
    }
    data = await data;
    options = options || {};
    const url2 = getResourceUrl(data);
    const typedLoaders = loaders;
    const candidateLoaders = getLoadersFromContext(typedLoaders, context);
    const loader = await selectLoader(data, candidateLoaders, options);
    if (!loader) {
      return null;
    }
    options = normalizeOptions(options, loader, candidateLoaders, url2);
    context = getLoaderContext({
      url: url2,
      parse,
      loaders: candidateLoaders
    }, options, context || null);
    return await parseWithLoader(loader, data, options, context);
  }
  async function parseWithLoader(loader, data, options, context) {
    validateWorkerVersion(loader);
    if (isResponse(data)) {
      const response = data;
      const {
        ok,
        redirected,
        status,
        statusText,
        type,
        url: url2
      } = response;
      const headers = Object.fromEntries(response.headers.entries());
      context.response = {
        headers,
        ok,
        redirected,
        status,
        statusText,
        type,
        url: url2
      };
    }
    data = await getArrayBufferOrStringFromData(data, loader, options);
    if (loader.parseTextSync && typeof data === "string") {
      options.dataType = "text";
      return loader.parseTextSync(data, options, context, loader);
    }
    if (canParseWithWorker(loader, options)) {
      return await parseWithWorker(loader, data, options, context, parse);
    }
    if (loader.parseText && typeof data === "string") {
      return await loader.parseText(data, options, context, loader);
    }
    if (loader.parse) {
      return await loader.parse(data, options, context, loader);
    }
    assert$2(!loader.parseSync);
    throw new Error("".concat(loader.id, " loader - no parser found and worker is disabled"));
  }
  const VERSION = "3.4.15";
  const PLYLoader$1 = {
    name: "PLY",
    id: "ply",
    module: "ply",
    shapes: ["mesh", "gltf", "columnar-table"],
    version: VERSION,
    worker: true,
    extensions: ["ply"],
    mimeTypes: ["text/plain", "application/octet-stream"],
    text: true,
    binary: true,
    tests: ["ply"],
    options: {
      ply: {}
    }
  };
  function getMeshBoundingBox(attributes) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    const positions = attributes.POSITION ? attributes.POSITION.value : [];
    const len = positions && positions.length;
    for (let i = 0; i < len; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      minX = x < minX ? x : minX;
      minY = y < minY ? y : minY;
      minZ = z < minZ ? z : minZ;
      maxX = x > maxX ? x : maxX;
      maxY = y > maxY ? y : maxY;
      maxZ = z > maxZ ? z : maxZ;
    }
    return [[minX, minY, minZ], [maxX, maxY, maxZ]];
  }
  function assert(condition, message) {
    if (!condition) {
      throw new Error("loader assertion failed.");
    }
  }
  class Schema {
    constructor(fields, metadata) {
      _defineProperty(this, "fields", void 0);
      _defineProperty(this, "metadata", void 0);
      assert(Array.isArray(fields));
      checkNames(fields);
      this.fields = fields;
      this.metadata = metadata || /* @__PURE__ */ new Map();
    }
    compareTo(other) {
      if (this.metadata !== other.metadata) {
        return false;
      }
      if (this.fields.length !== other.fields.length) {
        return false;
      }
      for (let i = 0; i < this.fields.length; ++i) {
        if (!this.fields[i].compareTo(other.fields[i])) {
          return false;
        }
      }
      return true;
    }
    select() {
      const nameMap = /* @__PURE__ */ Object.create(null);
      for (var _len = arguments.length, columnNames = new Array(_len), _key = 0; _key < _len; _key++) {
        columnNames[_key] = arguments[_key];
      }
      for (const name of columnNames) {
        nameMap[name] = true;
      }
      const selectedFields = this.fields.filter((field) => nameMap[field.name]);
      return new Schema(selectedFields, this.metadata);
    }
    selectAt() {
      for (var _len2 = arguments.length, columnIndices = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        columnIndices[_key2] = arguments[_key2];
      }
      const selectedFields = columnIndices.map((index) => this.fields[index]).filter(Boolean);
      return new Schema(selectedFields, this.metadata);
    }
    assign(schemaOrFields) {
      let fields;
      let metadata = this.metadata;
      if (schemaOrFields instanceof Schema) {
        const otherSchema = schemaOrFields;
        fields = otherSchema.fields;
        metadata = mergeMaps(mergeMaps(/* @__PURE__ */ new Map(), this.metadata), otherSchema.metadata);
      } else {
        fields = schemaOrFields;
      }
      const fieldMap = /* @__PURE__ */ Object.create(null);
      for (const field of this.fields) {
        fieldMap[field.name] = field;
      }
      for (const field of fields) {
        fieldMap[field.name] = field;
      }
      const mergedFields = Object.values(fieldMap);
      return new Schema(mergedFields, metadata);
    }
  }
  function checkNames(fields) {
    const usedNames = {};
    for (const field of fields) {
      if (usedNames[field.name]) {
        console.warn("Schema: duplicated field name", field.name, field);
      }
      usedNames[field.name] = true;
    }
  }
  function mergeMaps(m1, m2) {
    return new Map([...m1 || /* @__PURE__ */ new Map(), ...m2 || /* @__PURE__ */ new Map()]);
  }
  class Field {
    constructor(name, type) {
      let nullable = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : false;
      let metadata = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : /* @__PURE__ */ new Map();
      _defineProperty(this, "name", void 0);
      _defineProperty(this, "type", void 0);
      _defineProperty(this, "nullable", void 0);
      _defineProperty(this, "metadata", void 0);
      this.name = name;
      this.type = type;
      this.nullable = nullable;
      this.metadata = metadata;
    }
    get typeId() {
      return this.type && this.type.typeId;
    }
    clone() {
      return new Field(this.name, this.type, this.nullable, this.metadata);
    }
    compareTo(other) {
      return this.name === other.name && this.type === other.type && this.nullable === other.nullable && this.metadata === other.metadata;
    }
    toString() {
      return "".concat(this.type).concat(this.nullable ? ", nullable" : "").concat(this.metadata ? ", metadata: ".concat(this.metadata) : "");
    }
  }
  let Type = function(Type2) {
    Type2[Type2["NONE"] = 0] = "NONE";
    Type2[Type2["Null"] = 1] = "Null";
    Type2[Type2["Int"] = 2] = "Int";
    Type2[Type2["Float"] = 3] = "Float";
    Type2[Type2["Binary"] = 4] = "Binary";
    Type2[Type2["Utf8"] = 5] = "Utf8";
    Type2[Type2["Bool"] = 6] = "Bool";
    Type2[Type2["Decimal"] = 7] = "Decimal";
    Type2[Type2["Date"] = 8] = "Date";
    Type2[Type2["Time"] = 9] = "Time";
    Type2[Type2["Timestamp"] = 10] = "Timestamp";
    Type2[Type2["Interval"] = 11] = "Interval";
    Type2[Type2["List"] = 12] = "List";
    Type2[Type2["Struct"] = 13] = "Struct";
    Type2[Type2["Union"] = 14] = "Union";
    Type2[Type2["FixedSizeBinary"] = 15] = "FixedSizeBinary";
    Type2[Type2["FixedSizeList"] = 16] = "FixedSizeList";
    Type2[Type2["Map"] = 17] = "Map";
    Type2[Type2["Dictionary"] = -1] = "Dictionary";
    Type2[Type2["Int8"] = -2] = "Int8";
    Type2[Type2["Int16"] = -3] = "Int16";
    Type2[Type2["Int32"] = -4] = "Int32";
    Type2[Type2["Int64"] = -5] = "Int64";
    Type2[Type2["Uint8"] = -6] = "Uint8";
    Type2[Type2["Uint16"] = -7] = "Uint16";
    Type2[Type2["Uint32"] = -8] = "Uint32";
    Type2[Type2["Uint64"] = -9] = "Uint64";
    Type2[Type2["Float16"] = -10] = "Float16";
    Type2[Type2["Float32"] = -11] = "Float32";
    Type2[Type2["Float64"] = -12] = "Float64";
    Type2[Type2["DateDay"] = -13] = "DateDay";
    Type2[Type2["DateMillisecond"] = -14] = "DateMillisecond";
    Type2[Type2["TimestampSecond"] = -15] = "TimestampSecond";
    Type2[Type2["TimestampMillisecond"] = -16] = "TimestampMillisecond";
    Type2[Type2["TimestampMicrosecond"] = -17] = "TimestampMicrosecond";
    Type2[Type2["TimestampNanosecond"] = -18] = "TimestampNanosecond";
    Type2[Type2["TimeSecond"] = -19] = "TimeSecond";
    Type2[Type2["TimeMillisecond"] = -20] = "TimeMillisecond";
    Type2[Type2["TimeMicrosecond"] = -21] = "TimeMicrosecond";
    Type2[Type2["TimeNanosecond"] = -22] = "TimeNanosecond";
    Type2[Type2["DenseUnion"] = -23] = "DenseUnion";
    Type2[Type2["SparseUnion"] = -24] = "SparseUnion";
    Type2[Type2["IntervalDayTime"] = -25] = "IntervalDayTime";
    Type2[Type2["IntervalYearMonth"] = -26] = "IntervalYearMonth";
    return Type2;
  }({});
  let _Symbol$toStringTag, _Symbol$toStringTag2, _Symbol$toStringTag7;
  class DataType {
    static isNull(x) {
      return x && x.typeId === Type.Null;
    }
    static isInt(x) {
      return x && x.typeId === Type.Int;
    }
    static isFloat(x) {
      return x && x.typeId === Type.Float;
    }
    static isBinary(x) {
      return x && x.typeId === Type.Binary;
    }
    static isUtf8(x) {
      return x && x.typeId === Type.Utf8;
    }
    static isBool(x) {
      return x && x.typeId === Type.Bool;
    }
    static isDecimal(x) {
      return x && x.typeId === Type.Decimal;
    }
    static isDate(x) {
      return x && x.typeId === Type.Date;
    }
    static isTime(x) {
      return x && x.typeId === Type.Time;
    }
    static isTimestamp(x) {
      return x && x.typeId === Type.Timestamp;
    }
    static isInterval(x) {
      return x && x.typeId === Type.Interval;
    }
    static isList(x) {
      return x && x.typeId === Type.List;
    }
    static isStruct(x) {
      return x && x.typeId === Type.Struct;
    }
    static isUnion(x) {
      return x && x.typeId === Type.Union;
    }
    static isFixedSizeBinary(x) {
      return x && x.typeId === Type.FixedSizeBinary;
    }
    static isFixedSizeList(x) {
      return x && x.typeId === Type.FixedSizeList;
    }
    static isMap(x) {
      return x && x.typeId === Type.Map;
    }
    static isDictionary(x) {
      return x && x.typeId === Type.Dictionary;
    }
    get typeId() {
      return Type.NONE;
    }
    compareTo(other) {
      return this === other;
    }
  }
  _Symbol$toStringTag = Symbol.toStringTag;
  class Int extends DataType {
    constructor(isSigned, bitWidth) {
      super();
      _defineProperty(this, "isSigned", void 0);
      _defineProperty(this, "bitWidth", void 0);
      this.isSigned = isSigned;
      this.bitWidth = bitWidth;
    }
    get typeId() {
      return Type.Int;
    }
    get [_Symbol$toStringTag]() {
      return "Int";
    }
    toString() {
      return "".concat(this.isSigned ? "I" : "Ui", "nt").concat(this.bitWidth);
    }
  }
  class Int8 extends Int {
    constructor() {
      super(true, 8);
    }
  }
  class Int16 extends Int {
    constructor() {
      super(true, 16);
    }
  }
  class Int32 extends Int {
    constructor() {
      super(true, 32);
    }
  }
  class Uint8 extends Int {
    constructor() {
      super(false, 8);
    }
  }
  class Uint16 extends Int {
    constructor() {
      super(false, 16);
    }
  }
  class Uint32 extends Int {
    constructor() {
      super(false, 32);
    }
  }
  const Precision = {
    SINGLE: 32,
    DOUBLE: 64
  };
  _Symbol$toStringTag2 = Symbol.toStringTag;
  class Float extends DataType {
    constructor(precision) {
      super();
      _defineProperty(this, "precision", void 0);
      this.precision = precision;
    }
    get typeId() {
      return Type.Float;
    }
    get [_Symbol$toStringTag2]() {
      return "Float";
    }
    toString() {
      return "Float".concat(this.precision);
    }
  }
  class Float32 extends Float {
    constructor() {
      super(Precision.SINGLE);
    }
  }
  class Float64 extends Float {
    constructor() {
      super(Precision.DOUBLE);
    }
  }
  _Symbol$toStringTag7 = Symbol.toStringTag;
  class FixedSizeList extends DataType {
    constructor(listSize, child) {
      super();
      _defineProperty(this, "listSize", void 0);
      _defineProperty(this, "children", void 0);
      this.listSize = listSize;
      this.children = [child];
    }
    get typeId() {
      return Type.FixedSizeList;
    }
    get valueType() {
      return this.children[0].type;
    }
    get valueField() {
      return this.children[0];
    }
    get [_Symbol$toStringTag7]() {
      return "FixedSizeList";
    }
    toString() {
      return "FixedSizeList[".concat(this.listSize, "]<").concat(this.valueType, ">");
    }
  }
  function getArrowTypeFromTypedArray(array) {
    switch (array.constructor) {
      case Int8Array:
        return new Int8();
      case Uint8Array:
        return new Uint8();
      case Int16Array:
        return new Int16();
      case Uint16Array:
        return new Uint16();
      case Int32Array:
        return new Int32();
      case Uint32Array:
        return new Uint32();
      case Float32Array:
        return new Float32();
      case Float64Array:
        return new Float64();
      default:
        throw new Error("array type not supported");
    }
  }
  function deduceMeshSchema(attributes, metadata) {
    const fields = deduceMeshFields(attributes);
    return new Schema(fields, metadata);
  }
  function deduceMeshField(attributeName, attribute, optionalMetadata) {
    const type = getArrowTypeFromTypedArray(attribute.value);
    const metadata = makeMeshAttributeMetadata(attribute);
    const field = new Field(attributeName, new FixedSizeList(attribute.size, new Field("value", type)), false, metadata);
    return field;
  }
  function deduceMeshFields(attributes) {
    const fields = [];
    for (const attributeName in attributes) {
      const attribute = attributes[attributeName];
      fields.push(deduceMeshField(attributeName, attribute));
    }
    return fields;
  }
  function makeMeshAttributeMetadata(attribute) {
    const result = /* @__PURE__ */ new Map();
    if ("byteOffset" in attribute) {
      result.set("byteOffset", attribute.byteOffset.toString(10));
    }
    if ("byteStride" in attribute) {
      result.set("byteStride", attribute.byteStride.toString(10));
    }
    if ("normalized" in attribute) {
      result.set("normalized", attribute.normalized.toString());
    }
    return result;
  }
  function getPLYSchema(plyHeader, attributes) {
    const metadataMap = makeMetadataFromPlyHeader(plyHeader);
    const schema = deduceMeshSchema(attributes, metadataMap);
    return schema;
  }
  function makeMetadataFromPlyHeader(plyHeader) {
    const metadataMap = /* @__PURE__ */ new Map();
    metadataMap.set("ply_comments", JSON.stringify(plyHeader.comments));
    metadataMap.set("ply_elements", JSON.stringify(plyHeader.elements));
    if (plyHeader.format !== void 0) {
      metadataMap.set("ply_format", plyHeader.format);
    }
    if (plyHeader.version !== void 0) {
      metadataMap.set("ply_version", plyHeader.version);
    }
    if (plyHeader.headerLength !== void 0) {
      metadataMap.set("ply_headerLength", plyHeader.headerLength.toString(10));
    }
    return metadataMap;
  }
  function normalizePLY(plyHeader, plyAttributes, options) {
    const attributes = getMeshAttributes(plyAttributes);
    const boundingBox = getMeshBoundingBox(attributes);
    const vertexCount = plyAttributes.indices.length || plyAttributes.vertices.length / 3;
    const isTriangles = plyAttributes.indices && plyAttributes.indices.length > 0;
    const mode = isTriangles ? 4 : 0;
    const topology = isTriangles ? "triangle-list" : "point-list";
    const schema = getPLYSchema(plyHeader, attributes);
    const plyMesh = {
      loader: "ply",
      loaderData: plyHeader,
      header: {
        vertexCount,
        boundingBox
      },
      schema,
      attributes,
      indices: {
        value: new Uint32Array(0),
        size: 0
      },
      mode,
      topology
    };
    if (plyAttributes.indices.length > 0) {
      plyMesh.indices = {
        value: new Uint32Array(plyAttributes.indices),
        size: 1
      };
    }
    return plyMesh;
  }
  function getMeshAttributes(attributes) {
    const accessors = {};
    for (const attributeName of Object.keys(attributes)) {
      switch (attributeName) {
        case "vertices":
          if (attributes.vertices.length > 0) {
            accessors.POSITION = {
              value: new Float32Array(attributes.vertices),
              size: 3
            };
          }
          break;
        case "normals":
          if (attributes.normals.length > 0) {
            accessors.NORMAL = {
              value: new Float32Array(attributes.normals),
              size: 3
            };
          }
          break;
        case "uvs":
          if (attributes.uvs.length > 0) {
            accessors.TEXCOORD_0 = {
              value: new Float32Array(attributes.uvs),
              size: 2
            };
          }
          break;
        case "colors":
          if (attributes.colors.length > 0) {
            accessors.COLOR_0 = {
              value: new Uint8Array(attributes.colors),
              size: 3,
              normalized: true
            };
          }
          break;
        case "indices":
          break;
        default:
          if (attributes[attributeName].length > 0) {
            accessors[attributeName] = {
              value: new Float32Array(attributes[attributeName]),
              size: 1
            };
          }
          break;
      }
    }
    return accessors;
  }
  function parsePLY(data) {
    let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
    let header;
    let attributes;
    if (data instanceof ArrayBuffer) {
      const text = new TextDecoder().decode(data);
      header = parseHeader(text, options);
      attributes = header.format === "ascii" ? parseASCII$1(text, header) : parseBinary(data, header);
    } else {
      header = parseHeader(data, options);
      attributes = parseASCII$1(data, header);
    }
    return normalizePLY(header, attributes);
  }
  function parseHeader(data, options) {
    const PLY_HEADER_PATTERN = /ply([\s\S]*)end_header\s/;
    let headerText = "";
    let headerLength = 0;
    const result = PLY_HEADER_PATTERN.exec(data);
    if (result !== null) {
      headerText = result[1];
      headerLength = result[0].length;
    }
    const lines = headerText.split("\n");
    const header = parseHeaderLines(lines, headerLength, options);
    return header;
  }
  function parseHeaderLines(lines, headerLength, options) {
    const header = {
      comments: [],
      elements: [],
      headerLength
    };
    let lineType;
    let lineValues;
    let currentElement2 = null;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      line = line.trim();
      if (line === "") {
        continue;
      }
      lineValues = line.split(/\s+/);
      lineType = lineValues.shift();
      line = lineValues.join(" ");
      switch (lineType) {
        case "format":
          header.format = lineValues[0];
          header.version = lineValues[1];
          break;
        case "comment":
          header.comments.push(line);
          break;
        case "element":
          if (currentElement2) {
            header.elements.push(currentElement2);
          }
          currentElement2 = {
            name: lineValues[0],
            count: parseInt(lineValues[1], 10),
            properties: []
          };
          break;
        case "property":
          if (currentElement2) {
            const property = makePLYElementProperty$1(lineValues);
            if (options !== null && options !== void 0 && options.propertyNameMapping && property.name in (options === null || options === void 0 ? void 0 : options.propertyNameMapping)) {
              property.name = options === null || options === void 0 ? void 0 : options.propertyNameMapping[property.name];
            }
            currentElement2.properties.push(property);
          }
          break;
        default:
          console.log("unhandled", lineType, lineValues);
      }
    }
    if (currentElement2) {
      header.elements.push(currentElement2);
    }
    return header;
  }
  function getPLYAttributes(header) {
    const attributes = {
      indices: [],
      vertices: [],
      normals: [],
      uvs: [],
      colors: []
    };
    for (const element of header.elements) {
      if (element.name === "vertex") {
        for (const property of element.properties) {
          switch (property.name) {
            case "x":
            case "y":
            case "z":
            case "nx":
            case "ny":
            case "nz":
            case "s":
            case "t":
            case "red":
            case "green":
            case "blue":
              break;
            default:
              attributes[property.name] = [];
              break;
          }
        }
      }
    }
    return attributes;
  }
  function makePLYElementProperty$1(propertyValues) {
    const type = propertyValues[0];
    switch (type) {
      case "list":
        return {
          type,
          name: propertyValues[3],
          countType: propertyValues[1],
          itemType: propertyValues[2]
        };
      default:
        return {
          type,
          name: propertyValues[1]
        };
    }
  }
  function parseASCIINumber$1(n, type) {
    switch (type) {
      case "char":
      case "uchar":
      case "short":
      case "ushort":
      case "int":
      case "uint":
      case "int8":
      case "uint8":
      case "int16":
      case "uint16":
      case "int32":
      case "uint32":
        return parseInt(n, 10);
      case "float":
      case "double":
      case "float32":
      case "float64":
        return parseFloat(n);
      default:
        throw new Error(type);
    }
  }
  function parsePLYElement$1(properties, line) {
    const values = line.split(/\s+/);
    const element = {};
    for (let i = 0; i < properties.length; i++) {
      if (properties[i].type === "list") {
        const list = [];
        const n = parseASCIINumber$1(values.shift(), properties[i].countType);
        for (let j = 0; j < n; j++) {
          list.push(parseASCIINumber$1(values.shift(), properties[i].itemType));
        }
        element[properties[i].name] = list;
      } else {
        element[properties[i].name] = parseASCIINumber$1(values.shift(), properties[i].type);
      }
    }
    return element;
  }
  function parseASCII$1(data, header) {
    const attributes = getPLYAttributes(header);
    let result;
    const patternBody = /end_header\s([\s\S]*)$/;
    let body = "";
    if ((result = patternBody.exec(data)) !== null) {
      body = result[1];
    }
    const lines = body.split("\n");
    let currentElement2 = 0;
    let currentElementCount = 0;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      line = line.trim();
      if (line !== "") {
        if (currentElementCount >= header.elements[currentElement2].count) {
          currentElement2++;
          currentElementCount = 0;
        }
        const element = parsePLYElement$1(header.elements[currentElement2].properties, line);
        handleElement$1(attributes, header.elements[currentElement2].name, element);
        currentElementCount++;
      }
    }
    return attributes;
  }
  function handleElement$1(buffer, elementName) {
    let element = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
    if (elementName === "vertex") {
      for (const propertyName of Object.keys(element)) {
        switch (propertyName) {
          case "x":
            buffer.vertices.push(element.x, element.y, element.z);
            break;
          case "y":
          case "z":
            break;
          case "nx":
            if ("nx" in element && "ny" in element && "nz" in element) {
              buffer.normals.push(element.nx, element.ny, element.nz);
            }
            break;
          case "ny":
          case "nz":
            break;
          case "s":
            if ("s" in element && "t" in element) {
              buffer.uvs.push(element.s, element.t);
            }
            break;
          case "t":
            break;
          case "red":
            if ("red" in element && "green" in element && "blue" in element) {
              buffer.colors.push(element.red, element.green, element.blue);
            }
            break;
          case "green":
          case "blue":
            break;
          default:
            buffer[propertyName].push(element[propertyName]);
        }
      }
    } else if (elementName === "face") {
      const vertexIndices = element.vertex_indices || element.vertex_index;
      if (vertexIndices.length === 3) {
        buffer.indices.push(vertexIndices[0], vertexIndices[1], vertexIndices[2]);
      } else if (vertexIndices.length === 4) {
        buffer.indices.push(vertexIndices[0], vertexIndices[1], vertexIndices[3]);
        buffer.indices.push(vertexIndices[1], vertexIndices[2], vertexIndices[3]);
      }
    }
  }
  function binaryRead(dataview, at, type, littleEndian) {
    switch (type) {
      case "int8":
      case "char":
        return [dataview.getInt8(at), 1];
      case "uint8":
      case "uchar":
        return [dataview.getUint8(at), 1];
      case "int16":
      case "short":
        return [dataview.getInt16(at, littleEndian), 2];
      case "uint16":
      case "ushort":
        return [dataview.getUint16(at, littleEndian), 2];
      case "int32":
      case "int":
        return [dataview.getInt32(at, littleEndian), 4];
      case "uint32":
      case "uint":
        return [dataview.getUint32(at, littleEndian), 4];
      case "float32":
      case "float":
        return [dataview.getFloat32(at, littleEndian), 4];
      case "float64":
      case "double":
        return [dataview.getFloat64(at, littleEndian), 8];
      default:
        throw new Error(type);
    }
  }
  function binaryReadElement(dataview, at, properties, littleEndian) {
    const element = {};
    let result;
    let read = 0;
    for (let i = 0; i < properties.length; i++) {
      if (properties[i].type === "list") {
        const list = [];
        result = binaryRead(dataview, at + read, properties[i].countType, littleEndian);
        const n = result[0];
        read += result[1];
        for (let j = 0; j < n; j++) {
          result = binaryRead(dataview, at + read, properties[i].itemType, littleEndian);
          list.push(result[0]);
          read += result[1];
        }
        element[properties[i].name] = list;
      } else {
        result = binaryRead(dataview, at + read, properties[i].type, littleEndian);
        element[properties[i].name] = result[0];
        read += result[1];
      }
    }
    return [element, read];
  }
  function parseBinary(data, header) {
    const attributes = getPLYAttributes(header);
    const littleEndian = header.format === "binary_little_endian";
    const body = new DataView(data, header.headerLength);
    let result;
    let loc = 0;
    for (let currentElement2 = 0; currentElement2 < header.elements.length; currentElement2++) {
      const count = header.elements[currentElement2].count;
      for (let currentElementCount = 0; currentElementCount < count; currentElementCount++) {
        result = binaryReadElement(body, loc, header.elements[currentElement2].properties, littleEndian);
        loc += result[1];
        const element = result[0];
        handleElement$1(attributes, header.elements[currentElement2].name, element);
      }
    }
    return attributes;
  }
  let currentElement;
  async function* parsePLYInBatches(iterator, options) {
    const lineIterator = makeLineIterator(makeTextDecoderIterator(iterator));
    const header = await parsePLYHeader(lineIterator, options);
    let attributes;
    switch (header.format) {
      case "ascii":
        attributes = await parseASCII(lineIterator, header);
        break;
      default:
        throw new Error("Binary PLY can not yet be parsed in streaming mode");
    }
    yield normalizePLY(header, attributes);
  }
  async function parsePLYHeader(lineIterator, options) {
    const header = {
      comments: [],
      elements: []
    };
    await forEach(lineIterator, (line) => {
      line = line.trim();
      if (line === "end_header") {
        return true;
      }
      if (line === "") {
        return false;
      }
      const lineValues = line.split(/\s+/);
      const lineType = lineValues.shift();
      line = lineValues.join(" ");
      switch (lineType) {
        case "ply":
          break;
        case "format":
          header.format = lineValues[0];
          header.version = lineValues[1];
          break;
        case "comment":
          header.comments.push(line);
          break;
        case "element":
          if (currentElement) {
            header.elements.push(currentElement);
          }
          currentElement = {
            name: lineValues[0],
            count: parseInt(lineValues[1], 10),
            properties: []
          };
          break;
        case "property":
          const property = makePLYElementProperty(lineValues, options.propertyNameMapping);
          currentElement.properties.push(property);
          break;
        default:
          console.log("unhandled", lineType, lineValues);
      }
      return false;
    });
    if (currentElement) {
      header.elements.push(currentElement);
    }
    return header;
  }
  function makePLYElementProperty(propertyValues, propertyNameMapping) {
    const type = propertyValues[0];
    switch (type) {
      case "list":
        return {
          type,
          name: propertyValues[3],
          countType: propertyValues[1],
          itemType: propertyValues[2]
        };
      default:
        return {
          type,
          name: propertyValues[1]
        };
    }
  }
  async function parseASCII(lineIterator, header) {
    const attributes = {
      indices: [],
      vertices: [],
      normals: [],
      uvs: [],
      colors: []
    };
    let currentElement2 = 0;
    let currentElementCount = 0;
    for await (let line of lineIterator) {
      line = line.trim();
      if (line !== "") {
        if (currentElementCount >= header.elements[currentElement2].count) {
          currentElement2++;
          currentElementCount = 0;
        }
        const element = parsePLYElement(header.elements[currentElement2].properties, line);
        handleElement(attributes, header.elements[currentElement2].name, element);
        currentElementCount++;
      }
    }
    return attributes;
  }
  function parseASCIINumber(n, type) {
    switch (type) {
      case "char":
      case "uchar":
      case "short":
      case "ushort":
      case "int":
      case "uint":
      case "int8":
      case "uint8":
      case "int16":
      case "uint16":
      case "int32":
      case "uint32":
        return parseInt(n, 10);
      case "float":
      case "double":
      case "float32":
      case "float64":
        return parseFloat(n);
      default:
        throw new Error(type);
    }
  }
  function parsePLYElement(properties, line) {
    const values = line.split(/\s+/);
    const element = {};
    for (let i = 0; i < properties.length; i++) {
      if (properties[i].type === "list") {
        const list = [];
        const n = parseASCIINumber(values.shift(), properties[i].countType);
        for (let j = 0; j < n; j++) {
          list.push(parseASCIINumber(values.shift(), properties[i].itemType));
        }
        element[properties[i].name] = list;
      } else {
        element[properties[i].name] = parseASCIINumber(values.shift(), properties[i].type);
      }
    }
    return element;
  }
  function handleElement(buffer, elementName) {
    let element = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
    switch (elementName) {
      case "vertex":
        buffer.vertices.push(element.x, element.y, element.z);
        if ("nx" in element && "ny" in element && "nz" in element) {
          buffer.normals.push(element.nx, element.ny, element.nz);
        }
        if ("s" in element && "t" in element) {
          buffer.uvs.push(element.s, element.t);
        }
        if ("red" in element && "green" in element && "blue" in element) {
          buffer.colors.push(element.red / 255, element.green / 255, element.blue / 255);
        }
        break;
      case "face":
        const vertexIndices = element.vertex_indices || element.vertex_index;
        if (vertexIndices.length === 3) {
          buffer.indices.push(vertexIndices[0], vertexIndices[1], vertexIndices[2]);
        } else if (vertexIndices.length === 4) {
          buffer.indices.push(vertexIndices[0], vertexIndices[1], vertexIndices[3]);
          buffer.indices.push(vertexIndices[1], vertexIndices[2], vertexIndices[3]);
        }
        break;
    }
  }
  const PLYLoader = {
    ...PLYLoader$1,
    parse: async (arrayBuffer, options) => parsePLY(arrayBuffer, options === null || options === void 0 ? void 0 : options.ply),
    parseTextSync: (arrayBuffer, options) => parsePLY(arrayBuffer, options === null || options === void 0 ? void 0 : options.ply),
    parseSync: (arrayBuffer, options) => parsePLY(arrayBuffer, options === null || options === void 0 ? void 0 : options.ply),
    parseInBatches: (arrayBuffer, options) => parsePLYInBatches(arrayBuffer, options === null || options === void 0 ? void 0 : options.ply)
  };
  async function loadModel(asset, scene, rootNode) {
    try {
      let file;
      const useFetch = false;
      if (useFetch) ;
      return new Promise((resolve, reject) => {
        const onSuccess = (meshes, _particleSystems, skeletons, animationGroups) => {
          meshes.forEach((mesh) => {
            if (!mesh.parent) {
              mesh.parent = rootNode;
              asset.meshRoot = mesh;
            }
          });
          animationGroups.forEach((animGroup) => {
            animGroup.stop();
          });
          asset.meshes = meshes;
          asset.animations = animationGroups;
          asset.skeletons = skeletons;
          resolve();
        };
        const onProgress = (_event) => {
        };
        const onError = (_scene, message, _exception) => {
          console.log("app.content.loadModel.error: " + message);
          reject(new Error(message));
        };
        if (file) {
          babylonjs.SceneLoader.ImportMesh("", "", file, scene, onSuccess, onProgress, onError, asset.extension);
        } else {
          babylonjs.SceneLoader.ImportMesh("", asset.path, void 0, scene, onSuccess, onProgress, onError, asset.extension);
        }
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("app.content.loadModel.abort: ", asset.id);
        return;
      }
      console.error("app.content.loadModel.error: ", error);
      throw error;
    } finally {
      asset.abortCtrl = void 0;
    }
  }
  async function loadPointCloud(asset, scene, rootNode) {
    asset.abortCtrl = new AbortController();
    const { signal } = asset.abortCtrl;
    try {
      const response = await fetch(asset.path, { signal });
      const data = await parse(response, PLYLoader);
      const pos = data.attributes.POSITION.value;
      const col = data.attributes.COLOR_0.value;
      const num = pos.length / 3;
      const pointCloudSize = asset.size ?? 1;
      const pcs = new babylonjs.PointsCloudSystem("pcs", pointCloudSize, scene);
      pcs.addPoints(num, (particle, i) => {
        const j = 3 * i;
        particle.position = new babylonjs.Vector3(pos[j + 0], pos[j + 1], pos[j + 2]);
        particle.color = new babylonjs.Color4(
          asset.color ? asset.color[0] : col[j + 0] / 255,
          asset.color ? asset.color[1] : col[j + 1] / 255,
          asset.color ? asset.color[2] : col[j + 2] / 255,
          1
        );
      });
      const mesh = await pcs.buildMeshAsync();
      mesh.parent = rootNode;
      asset.pcs = pcs;
      asset.mesh = mesh;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("app.content.loadPointCloud.abort: ", asset.id);
        return;
      }
      console.error("app.content.loadPointCloud.error: ", error);
      throw error;
    } finally {
      asset.abortCtrl = void 0;
    }
  }
  async function loadTexture(asset, scene, opts = {}) {
    return new Promise((resolve, reject) => {
      const onLoad = () => {
        if (opts.hasAlpha) texture.hasAlpha = true;
        asset.texture = texture;
        resolve();
      };
      const onError = (message, _exception) => {
        reject(new Error(`Failed to load texture: ${message}`));
      };
      const texture = new babylonjs.Texture(asset.path, scene, opts.noMipmap, opts.invertY ?? false, opts.samplingMode, onLoad, onError);
    });
  }
  async function loadCubeTexture(asset, scene) {
    return new Promise((resolve, reject) => {
      const onLoad = () => {
        asset.cubeTexture = cubeTexture;
        resolve();
      };
      const onError = (message, _exception) => {
        reject(new Error(`Failed to load texture: ${message}`));
      };
      const cubeTexture = new babylonjs.CubeTexture(asset.path, scene, void 0, false, void 0, onLoad, onError);
    });
  }
  async function loadVideo(asset, scene) {
    asset.abortCtrl = new AbortController();
    let isAborted = false;
    asset.abortCtrl.signal.addEventListener("abort", () => {
      isAborted = true;
    });
    return new Promise((resolve, reject) => {
      const addEventListeners = (videoTexture2) => {
        videoTexture2.video.addEventListener("loadedmetadata", onLoad, { once: true });
        videoTexture2.video.addEventListener("canplay", onLoad, { once: true });
        videoTexture2.video.addEventListener("error", onError, { once: true });
      };
      const removeEventListeners = (videoTexture2) => {
        videoTexture2.video.removeEventListener("loadedmetadata", onLoad);
        videoTexture2.video.removeEventListener("canplay", onLoad);
        videoTexture2.video.removeEventListener("error", onError);
      };
      const onLoad = (_event) => {
        removeEventListeners(videoTexture);
        if (isAborted) {
          resolve();
          return;
        }
        asset.videoTexture = videoTexture;
        videoTexture.video.pause();
        resolve();
      };
      const onError = (_e) => {
        removeEventListeners(videoTexture);
        if (isAborted) {
          resolve();
          return;
        }
        reject(new Error(`Failed to load video: ${_e}`));
      };
      const settings = {
        autoPlay: true,
        autoUpdateTexture: true
      };
      let videoSrc = asset.path;
      if (asset.videoElement) {
        videoSrc = asset.videoElement;
        videoSrc.src = asset.path;
      }
      const videoTexture = new babylonjs.VideoTexture(
        "video",
        // name
        videoSrc,
        // src
        scene,
        // scene
        void 0,
        // generateMipMaps
        void 0,
        // invertY
        void 0,
        // samplingMode
        settings,
        // settings
        onError,
        // onError
        void 0
        // format
      );
      addEventListeners(videoTexture);
    });
  }
  async function loadAudio(asset, scene) {
    asset.abortCtrl = new AbortController();
    let isAborted = false;
    asset.abortCtrl.signal.addEventListener("abort", () => {
      isAborted = true;
    });
    return new Promise((resolve, reject) => {
      try {
        if (asset.audioElement) {
          const audioElement = asset.audioElement;
          const addEventListeners = (el) => {
            el.addEventListener("loadedmetadata", onLoad, { once: true });
            el.addEventListener("canplay", onLoad, { once: true });
            el.addEventListener("error", onError, { once: true });
          };
          const removeEventListeners = (el) => {
            el.removeEventListener("loadedmetadata", onLoad);
            el.removeEventListener("canplay", onLoad);
            el.removeEventListener("error", onError);
          };
          const onLoad = (_event) => {
            removeEventListeners(audioElement);
            if (isAborted) {
              resolve();
              return;
            }
            audioElement.pause();
            resolve();
          };
          const onError = (e) => {
            removeEventListeners(audioElement);
            if (isAborted) {
              resolve();
              return;
            }
            reject(new Error(`Failed to load audio: ${e}`));
          };
          audioElement.src = asset.path;
          addEventListeners(audioElement);
          audioElement.load();
        } else {
          const onLoad = () => {
            if (isAborted) {
              resolve();
              return;
            }
            asset.audio = audio;
            resolve();
          };
          const audio = new babylonjs.Sound("audio", asset.path, scene, onLoad, {
            loop: false,
            autoplay: false,
            volume: 1
          });
        }
      } catch (e) {
        if (isAborted) {
          resolve();
          return;
        }
        reject(new Error(`Failed to load audio: ${e}`));
      }
    });
  }
  function unloadBase(asset) {
    if (asset.abortCtrl) {
      asset.abortCtrl.abort();
      asset.abortCtrl = void 0;
    }
  }
  function unloadModel(asset) {
    unloadBase(asset);
    if (asset.meshes) {
      asset.meshes.forEach((mesh) => {
        mesh.dispose(false, true);
      });
    }
    if (asset.animations) {
      asset.animations.forEach((animGroup) => {
        animGroup.stop();
        animGroup.dispose();
      });
    }
    if (asset.skeletons) {
      asset.skeletons.forEach((skeleton) => {
        skeleton.dispose();
      });
    }
    asset.meshes = void 0;
    asset.meshRoot = void 0;
    asset.animations = void 0;
    asset.skeletons = void 0;
  }
  function unloadPointCloud(asset) {
    unloadBase(asset);
    if (asset.pcs) {
      asset.pcs.dispose();
    }
    if (asset.mesh) {
      asset.mesh.dispose(false, true);
    }
    asset.mesh = void 0;
  }
  function unloadTexture(asset) {
    unloadBase(asset);
    if (asset.texture) {
      asset.texture.dispose();
      asset.texture = void 0;
    }
  }
  function unloadCubeTexture(asset) {
    unloadBase(asset);
    if (asset.cubeTexture) {
      asset.cubeTexture.dispose();
      asset.cubeTexture = void 0;
    }
  }
  function unloadVideo(asset) {
    unloadBase(asset);
    if (asset.videoTexture) {
      asset.videoTexture.dispose();
      asset.videoTexture.video.src = "";
      asset.videoTexture.video.load();
      asset.videoTexture = void 0;
    }
  }
  function unloadAudio(asset) {
    unloadBase(asset);
    if (asset.audio) {
      asset.audio.pause();
      asset.audio.dispose();
      asset.audio = void 0;
    }
    if (asset.audioElement) {
      asset.audioElement.pause();
      asset.audioElement.src = "";
      asset.audioElement.load();
    }
  }
  class AssetBatch {
    constructor(context) {
      __publicField(this, "assets", []);
      __publicField(this, "assetsLoading", []);
      __publicField(this, "context");
      this.context = context;
    }
    //----------------------------------------------------------------
    async loadContents(assetsToLoad) {
      var _a, _b;
      for (const assetLoading of this.assetsLoading) {
        for (const assetToLoad of assetsToLoad) {
          if (assetLoading.path === assetToLoad.path) {
            const asssetToLoadIdx = assetsToLoad.indexOf(assetToLoad);
            assetsToLoad.splice(asssetToLoadIdx, 1);
          }
        }
      }
      this.assetsLoading.push(...assetsToLoad);
      const batchSize = (_b = (_a = this.context).getBatchSize) == null ? void 0 : _b.call(_a);
      if (batchSize) {
        while (this.assetsLoading.length > 0) {
          const numToLoad = Math.min(batchSize, this.assetsLoading.length);
          const batch = this.assetsLoading.splice(0, numToLoad);
          await this.loadAssets(batch);
        }
      } else {
        const numToLoad = this.assetsLoading.length;
        const batch = this.assetsLoading.splice(0, numToLoad);
        await this.loadAssets(batch);
      }
    }
    unloadContents(assetsToUnload) {
      for (const assetLoading of this.assetsLoading) {
        for (const assetToUnload of assetsToUnload) {
          if (assetLoading.path === assetToUnload.path) {
            const assetLoadingIdx = this.assetsLoading.indexOf(assetLoading);
            this.assetsLoading.splice(assetLoadingIdx, 1);
          }
        }
      }
      this.unloadAssets(assetsToUnload);
    }
    //----------------------------------------------------------------
    async loadAssets(assetsToLoad) {
      const promises = assetsToLoad.map((assetToLoad) => this.loadAsset(assetToLoad));
      await Promise.all(promises);
    }
    async loadAsset(assetToLoad) {
      var _a, _b;
      const assetIdx = this.assets.findIndex((asset2) => asset2.path === assetToLoad.path);
      if (assetIdx >= 0) {
        console.error("loader.batch.loadAsset - asset already exists: ", assetToLoad.path);
        return;
      }
      const asset = {
        type: assetToLoad.type,
        path: assetToLoad.path,
        id: assetToLoad.id || assetToLoad.path
        // if no unique id is provided, use path as unique id.
      };
      this.assets.push(asset);
      asset.loaded = false;
      asset.loading = true;
      asset.loadProgress = 0;
      const scene = this.context.getScene();
      const rootNode = this.context.getRootNode();
      if (asset.type === "model") {
        const assetModel = asset;
        assetModel.extension = assetToLoad.extension;
        await loadModel(assetModel, scene, rootNode);
      } else if (asset.type === "pointcloud") {
        const assetPointCloud = asset;
        assetPointCloud.size = assetToLoad.size;
        assetPointCloud.color = assetToLoad.color;
        await loadPointCloud(assetPointCloud, scene, rootNode);
      } else if (asset.type === "texture") {
        const assetTexture = asset;
        await loadTexture(assetTexture, scene);
      } else if (asset.type === "cubetexture") {
        const assetCubeTexture = asset;
        await loadCubeTexture(assetCubeTexture, scene);
      } else if (asset.type === "video") {
        const assetVideo = asset;
        assetVideo.videoElement = assetToLoad.videoElement;
        await loadVideo(assetVideo, scene);
      } else if (asset.type === "audio") {
        const assetAudio = asset;
        assetAudio.audioElement = assetToLoad.audioElement;
        await loadAudio(assetAudio, scene);
      }
      asset.loaded = true;
      asset.loading = false;
      asset.loadProgress = 1;
      (_b = (_a = this.context).onAssetLoadComplete) == null ? void 0 : _b.call(_a, asset);
    }
    //----------------------------------------------------------------
    unloadAssets(assetsToUnload) {
      for (const assetToUnload of assetsToUnload) {
        this.unloadAsset(assetToUnload);
      }
    }
    unloadAsset(assetToUnload) {
      const assetIdx = this.assets.findIndex((asset2) => asset2.path === assetToUnload.path);
      if (assetIdx < 0) {
        console.error("loader.batch.unloadAsset - asset does not exists: ", assetToUnload.path);
        return;
      }
      const asset = this.assets[assetIdx];
      if (asset.type === "model") {
        const assetModel = asset;
        unloadModel(assetModel);
      } else if (asset.type === "pointcloud") {
        const assetPointCloud = asset;
        unloadPointCloud(assetPointCloud);
      } else if (asset.type === "texture") {
        const assetTexture = asset;
        unloadTexture(assetTexture);
      } else if (asset.type === "cubetexture") {
        const assetCubeTexture = asset;
        unloadCubeTexture(assetCubeTexture);
      } else if (asset.type === "video") {
        const assetVideo = asset;
        unloadVideo(assetVideo);
      } else if (asset.type === "audio") {
        const assetAudio = asset;
        unloadAudio(assetAudio);
      }
      this.assets.splice(assetIdx, 1);
    }
  }
  class MediaRecorderBase {
    constructor() {
    }
    async start() {
      return Promise.reject(new Error("mediarecorder.base.start must be overridden in the subclass"));
    }
    async stop() {
      return Promise.reject(new Error("mediarecorder.base.stop must be overridden in the subclass"));
    }
  }
  class BridgeMediaRecorder extends Bridge {
    constructor() {
      super();
    }
    async start() {
      return new Promise((resolve, reject) => {
        const message = {
          uuid: Utils.UUID(),
          type: BridgeMessageTypeMediaRecorderStart,
          data: void 0
        };
        this.send(message, resolve, reject);
      });
    }
    async stop() {
      return new Promise((resolve, reject) => {
        const message = {
          uuid: Utils.UUID(),
          type: BridgeMessageTypeMediaRecorderStop,
          data: void 0
        };
        this.send(message, resolve, reject);
      });
    }
  }
  class MediaRecorderApp extends MediaRecorderBase {
    constructor() {
      super();
      __publicField(this, "bridge");
      this.bridge = new BridgeMediaRecorder();
    }
    async start() {
      return this.bridge.start();
    }
    async stop() {
      return this.bridge.stop();
    }
  }
  var __accessCheck = (obj, member, msg) => {
    if (!member.has(obj))
      throw TypeError("Cannot " + msg);
  };
  var __privateGet = (obj, member, getter) => {
    __accessCheck(obj, member, "read from private field");
    return getter ? getter.call(obj) : member.get(obj);
  };
  var __privateAdd = (obj, member, value) => {
    if (member.has(obj))
      throw TypeError("Cannot add the same private member more than once");
    member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  };
  var __privateSet = (obj, member, value, setter) => {
    __accessCheck(obj, member, "write to private field");
    member.set(obj, value);
    return value;
  };
  var __privateWrapper = (obj, member, setter, getter) => ({
    set _(value) {
      __privateSet(obj, member, value);
    },
    get _() {
      return __privateGet(obj, member, getter);
    }
  });
  var __privateMethod = (obj, member, method) => {
    __accessCheck(obj, member, "access private method");
    return method;
  };
  var bytes = new Uint8Array(8);
  var view = new DataView(bytes.buffer);
  var u8 = (value) => {
    return [(value % 256 + 256) % 256];
  };
  var u16 = (value) => {
    view.setUint16(0, value, false);
    return [bytes[0], bytes[1]];
  };
  var i16 = (value) => {
    view.setInt16(0, value, false);
    return [bytes[0], bytes[1]];
  };
  var u24 = (value) => {
    view.setUint32(0, value, false);
    return [bytes[1], bytes[2], bytes[3]];
  };
  var u32 = (value) => {
    view.setUint32(0, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var i32 = (value) => {
    view.setInt32(0, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var u64 = (value) => {
    view.setUint32(0, Math.floor(value / 2 ** 32), false);
    view.setUint32(4, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
  };
  var fixed_8_8 = (value) => {
    view.setInt16(0, 2 ** 8 * value, false);
    return [bytes[0], bytes[1]];
  };
  var fixed_16_16 = (value) => {
    view.setInt32(0, 2 ** 16 * value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var fixed_2_30 = (value) => {
    view.setInt32(0, 2 ** 30 * value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var ascii = (text, nullTerminated = false) => {
    let bytes2 = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
    if (nullTerminated)
      bytes2.push(0);
    return bytes2;
  };
  var last = (arr) => {
    return arr && arr[arr.length - 1];
  };
  var lastPresentedSample = (samples) => {
    let result = void 0;
    for (let sample of samples) {
      if (!result || sample.presentationTimestamp > result.presentationTimestamp) {
        result = sample;
      }
    }
    return result;
  };
  var intoTimescale = (timeInSeconds, timescale, round = true) => {
    let value = timeInSeconds * timescale;
    return round ? Math.round(value) : value;
  };
  var rotationMatrix = (rotationInDegrees) => {
    let theta = rotationInDegrees * (Math.PI / 180);
    let cosTheta = Math.cos(theta);
    let sinTheta = Math.sin(theta);
    return [
      cosTheta,
      sinTheta,
      0,
      -sinTheta,
      cosTheta,
      0,
      0,
      0,
      1
    ];
  };
  var IDENTITY_MATRIX = rotationMatrix(0);
  var matrixToBytes = (matrix) => {
    return [
      fixed_16_16(matrix[0]),
      fixed_16_16(matrix[1]),
      fixed_2_30(matrix[2]),
      fixed_16_16(matrix[3]),
      fixed_16_16(matrix[4]),
      fixed_2_30(matrix[5]),
      fixed_16_16(matrix[6]),
      fixed_16_16(matrix[7]),
      fixed_2_30(matrix[8])
    ];
  };
  var deepClone = (x) => {
    if (!x)
      return x;
    if (typeof x !== "object")
      return x;
    if (Array.isArray(x))
      return x.map(deepClone);
    return Object.fromEntries(Object.entries(x).map(([key, value]) => [key, deepClone(value)]));
  };
  var isU32 = (value) => {
    return value >= 0 && value < 2 ** 32;
  };
  var box = (type, contents, children) => ({
    type,
    contents: contents && new Uint8Array(contents.flat(10)),
    children
  });
  var fullBox = (type, version, flags, contents, children) => box(
    type,
    [u8(version), u24(flags), contents ?? []],
    children
  );
  var ftyp = (details) => {
    let minorVersion = 512;
    if (details.fragmented)
      return box("ftyp", [
        ascii("iso5"),
        // Major brand
        u32(minorVersion),
        // Minor version
        // Compatible brands
        ascii("iso5"),
        ascii("iso6"),
        ascii("mp41")
      ]);
    return box("ftyp", [
      ascii("isom"),
      // Major brand
      u32(minorVersion),
      // Minor version
      // Compatible brands
      ascii("isom"),
      details.holdsAvc ? ascii("avc1") : [],
      ascii("mp41")
    ]);
  };
  var mdat = (reserveLargeSize) => ({ type: "mdat", largeSize: reserveLargeSize });
  var free = (size) => ({ type: "free", size });
  var moov = (tracks, creationTime, fragmented = false) => box("moov", null, [
    mvhd(creationTime, tracks),
    ...tracks.map((x) => trak(x, creationTime)),
    fragmented ? mvex(tracks) : null
  ]);
  var mvhd = (creationTime, tracks) => {
    let duration = intoTimescale(Math.max(
      0,
      ...tracks.filter((x) => x.samples.length > 0).map((x) => {
        const lastSample = lastPresentedSample(x.samples);
        return lastSample.presentationTimestamp + lastSample.duration;
      })
    ), GLOBAL_TIMESCALE);
    let nextTrackId = Math.max(...tracks.map((x) => x.id)) + 1;
    let needsU64 = !isU32(creationTime) || !isU32(duration);
    let u32OrU64 = needsU64 ? u64 : u32;
    return fullBox("mvhd", +needsU64, 0, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(GLOBAL_TIMESCALE),
      // Timescale
      u32OrU64(duration),
      // Duration
      fixed_16_16(1),
      // Preferred rate
      fixed_8_8(1),
      // Preferred volume
      Array(10).fill(0),
      // Reserved
      matrixToBytes(IDENTITY_MATRIX),
      // Matrix
      Array(24).fill(0),
      // Pre-defined
      u32(nextTrackId)
      // Next track ID
    ]);
  };
  var trak = (track, creationTime) => box("trak", null, [
    tkhd(track, creationTime),
    mdia(track, creationTime)
  ]);
  var tkhd = (track, creationTime) => {
    let lastSample = lastPresentedSample(track.samples);
    let durationInGlobalTimescale = intoTimescale(
      lastSample ? lastSample.presentationTimestamp + lastSample.duration : 0,
      GLOBAL_TIMESCALE
    );
    let needsU64 = !isU32(creationTime) || !isU32(durationInGlobalTimescale);
    let u32OrU64 = needsU64 ? u64 : u32;
    let matrix;
    if (track.info.type === "video") {
      matrix = typeof track.info.rotation === "number" ? rotationMatrix(track.info.rotation) : track.info.rotation;
    } else {
      matrix = IDENTITY_MATRIX;
    }
    return fullBox("tkhd", +needsU64, 3, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(track.id),
      // Track ID
      u32(0),
      // Reserved
      u32OrU64(durationInGlobalTimescale),
      // Duration
      Array(8).fill(0),
      // Reserved
      u16(0),
      // Layer
      u16(0),
      // Alternate group
      fixed_8_8(track.info.type === "audio" ? 1 : 0),
      // Volume
      u16(0),
      // Reserved
      matrixToBytes(matrix),
      // Matrix
      fixed_16_16(track.info.type === "video" ? track.info.width : 0),
      // Track width
      fixed_16_16(track.info.type === "video" ? track.info.height : 0)
      // Track height
    ]);
  };
  var mdia = (track, creationTime) => box("mdia", null, [
    mdhd(track, creationTime),
    hdlr(track.info.type === "video" ? "vide" : "soun"),
    minf(track)
  ]);
  var mdhd = (track, creationTime) => {
    let lastSample = lastPresentedSample(track.samples);
    let localDuration = intoTimescale(
      lastSample ? lastSample.presentationTimestamp + lastSample.duration : 0,
      track.timescale
    );
    let needsU64 = !isU32(creationTime) || !isU32(localDuration);
    let u32OrU64 = needsU64 ? u64 : u32;
    return fullBox("mdhd", +needsU64, 0, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(track.timescale),
      // Timescale
      u32OrU64(localDuration),
      // Duration
      u16(21956),
      // Language ("und", undetermined)
      u16(0)
      // Quality
    ]);
  };
  var hdlr = (componentSubtype) => fullBox("hdlr", 0, 0, [
    ascii("mhlr"),
    // Component type
    ascii(componentSubtype),
    // Component subtype
    u32(0),
    // Component manufacturer
    u32(0),
    // Component flags
    u32(0),
    // Component flags mask
    ascii("mp4-muxer-hdlr", true)
    // Component name
  ]);
  var minf = (track) => box("minf", null, [
    track.info.type === "video" ? vmhd() : smhd(),
    dinf(),
    stbl(track)
  ]);
  var vmhd = () => fullBox("vmhd", 0, 1, [
    u16(0),
    // Graphics mode
    u16(0),
    // Opcolor R
    u16(0),
    // Opcolor G
    u16(0)
    // Opcolor B
  ]);
  var smhd = () => fullBox("smhd", 0, 0, [
    u16(0),
    // Balance
    u16(0)
    // Reserved
  ]);
  var dinf = () => box("dinf", null, [
    dref()
  ]);
  var dref = () => fullBox("dref", 0, 0, [
    u32(1)
    // Entry count
  ], [
    url()
  ]);
  var url = () => fullBox("url ", 0, 1);
  var stbl = (track) => {
    const needsCtts = track.compositionTimeOffsetTable.length > 1 || track.compositionTimeOffsetTable.some((x) => x.sampleCompositionTimeOffset !== 0);
    return box("stbl", null, [
      stsd(track),
      stts(track),
      stss(track),
      stsc(track),
      stsz(track),
      stco(track),
      needsCtts ? ctts(track) : null
    ]);
  };
  var stsd = (track) => fullBox("stsd", 0, 0, [
    u32(1)
    // Entry count
  ], [
    track.info.type === "video" ? videoSampleDescription(
      VIDEO_CODEC_TO_BOX_NAME[track.info.codec],
      track
    ) : soundSampleDescription(
      AUDIO_CODEC_TO_BOX_NAME[track.info.codec],
      track
    )
  ]);
  var videoSampleDescription = (compressionType, track) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1),
    // Data reference index
    u16(0),
    // Pre-defined
    u16(0),
    // Reserved
    Array(12).fill(0),
    // Pre-defined
    u16(track.info.width),
    // Width
    u16(track.info.height),
    // Height
    u32(4718592),
    // Horizontal resolution
    u32(4718592),
    // Vertical resolution
    u32(0),
    // Reserved
    u16(1),
    // Frame count
    Array(32).fill(0),
    // Compressor name
    u16(24),
    // Depth
    i16(65535)
    // Pre-defined
  ], [
    VIDEO_CODEC_TO_CONFIGURATION_BOX[track.info.codec](track),
    track.info.decoderConfig.colorSpace ? colr(track) : null
  ]);
  var COLOR_PRIMARIES_MAP = {
    "bt709": 1,
    // ITU-R BT.709
    "bt470bg": 5,
    // ITU-R BT.470BG
    "smpte170m": 6
    // ITU-R BT.601 525 - SMPTE 170M
  };
  var TRANSFER_CHARACTERISTICS_MAP = {
    "bt709": 1,
    // ITU-R BT.709
    "smpte170m": 6,
    // SMPTE 170M
    "iec61966-2-1": 13
    // IEC 61966-2-1
  };
  var MATRIX_COEFFICIENTS_MAP = {
    "rgb": 0,
    // Identity
    "bt709": 1,
    // ITU-R BT.709
    "bt470bg": 5,
    // ITU-R BT.470BG
    "smpte170m": 6
    // SMPTE 170M
  };
  var colr = (track) => box("colr", [
    ascii("nclx"),
    // Colour type
    u16(COLOR_PRIMARIES_MAP[track.info.decoderConfig.colorSpace.primaries]),
    // Colour primaries
    u16(TRANSFER_CHARACTERISTICS_MAP[track.info.decoderConfig.colorSpace.transfer]),
    // Transfer characteristics
    u16(MATRIX_COEFFICIENTS_MAP[track.info.decoderConfig.colorSpace.matrix]),
    // Matrix coefficients
    u8((track.info.decoderConfig.colorSpace.fullRange ? 1 : 0) << 7)
    // Full range flag
  ]);
  var avcC = (track) => track.info.decoderConfig && box("avcC", [
    // For AVC, description is an AVCDecoderConfigurationRecord, so nothing else to do here
    ...new Uint8Array(track.info.decoderConfig.description)
  ]);
  var hvcC = (track) => track.info.decoderConfig && box("hvcC", [
    // For HEVC, description is a HEVCDecoderConfigurationRecord, so nothing else to do here
    ...new Uint8Array(track.info.decoderConfig.description)
  ]);
  var vpcC = (track) => {
    if (!track.info.decoderConfig) {
      return null;
    }
    let decoderConfig = track.info.decoderConfig;
    if (!decoderConfig.colorSpace) {
      throw new Error(`'colorSpace' is required in the decoder config for VP9.`);
    }
    let parts = decoderConfig.codec.split(".");
    let profile = Number(parts[1]);
    let level = Number(parts[2]);
    let bitDepth = Number(parts[3]);
    let chromaSubsampling = 0;
    let thirdByte = (bitDepth << 4) + (chromaSubsampling << 1) + Number(decoderConfig.colorSpace.fullRange);
    let colourPrimaries = 2;
    let transferCharacteristics = 2;
    let matrixCoefficients = 2;
    return fullBox("vpcC", 1, 0, [
      u8(profile),
      // Profile
      u8(level),
      // Level
      u8(thirdByte),
      // Bit depth, chroma subsampling, full range
      u8(colourPrimaries),
      // Colour primaries
      u8(transferCharacteristics),
      // Transfer characteristics
      u8(matrixCoefficients),
      // Matrix coefficients
      u16(0)
      // Codec initialization data size
    ]);
  };
  var av1C = () => {
    let marker = 1;
    let version = 1;
    let firstByte = (marker << 7) + version;
    return box("av1C", [
      firstByte,
      0,
      0,
      0
    ]);
  };
  var soundSampleDescription = (compressionType, track) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1),
    // Data reference index
    u16(0),
    // Version
    u16(0),
    // Revision level
    u32(0),
    // Vendor
    u16(track.info.numberOfChannels),
    // Number of channels
    u16(16),
    // Sample size (bits)
    u16(0),
    // Compression ID
    u16(0),
    // Packet size
    fixed_16_16(track.info.sampleRate)
    // Sample rate
  ], [
    AUDIO_CODEC_TO_CONFIGURATION_BOX[track.info.codec](track)
  ]);
  var esds = (track) => {
    let description = new Uint8Array(track.info.decoderConfig.description);
    return fullBox("esds", 0, 0, [
      // https://stackoverflow.com/a/54803118
      u32(58753152),
      // TAG(3) = Object Descriptor ([2])
      u8(32 + description.byteLength),
      // length of this OD (which includes the next 2 tags)
      u16(1),
      // ES_ID = 1
      u8(0),
      // flags etc = 0
      u32(75530368),
      // TAG(4) = ES Descriptor ([2]) embedded in above OD
      u8(18 + description.byteLength),
      // length of this ESD
      u8(64),
      // MPEG-4 Audio
      u8(21),
      // stream type(6bits)=5 audio, flags(2bits)=1
      u24(0),
      // 24bit buffer size
      u32(130071),
      // max bitrate
      u32(130071),
      // avg bitrate
      u32(92307584),
      // TAG(5) = ASC ([2],[3]) embedded in above OD
      u8(description.byteLength),
      // length
      ...description,
      u32(109084800),
      // TAG(6)
      u8(1),
      // length
      u8(2)
      // data
    ]);
  };
  var dOps = (track) => {
    var _a;
    let preskip = 3840;
    let gain = 0;
    const description = (_a = track.info.decoderConfig) == null ? void 0 : _a.description;
    if (description) {
      if (description.byteLength < 18) {
        throw new TypeError("Invalid decoder description provided for Opus; must be at least 18 bytes long.");
      }
      const view2 = ArrayBuffer.isView(description) ? new DataView(description.buffer, description.byteOffset, description.byteLength) : new DataView(description);
      preskip = view2.getUint16(10, true);
      gain = view2.getInt16(14, true);
    }
    return box("dOps", [
      u8(0),
      // Version
      u8(track.info.numberOfChannels),
      // OutputChannelCount
      u16(preskip),
      u32(track.info.sampleRate),
      // InputSampleRate
      fixed_8_8(gain),
      // OutputGain
      u8(0)
      // ChannelMappingFamily
    ]);
  };
  var stts = (track) => {
    return fullBox("stts", 0, 0, [
      u32(track.timeToSampleTable.length),
      // Number of entries
      track.timeToSampleTable.map((x) => [
        // Time-to-sample table
        u32(x.sampleCount),
        // Sample count
        u32(x.sampleDelta)
        // Sample duration
      ])
    ]);
  };
  var stss = (track) => {
    if (track.samples.every((x) => x.type === "key"))
      return null;
    let keySamples = [...track.samples.entries()].filter(([, sample]) => sample.type === "key");
    return fullBox("stss", 0, 0, [
      u32(keySamples.length),
      // Number of entries
      keySamples.map(([index]) => u32(index + 1))
      // Sync sample table
    ]);
  };
  var stsc = (track) => {
    return fullBox("stsc", 0, 0, [
      u32(track.compactlyCodedChunkTable.length),
      // Number of entries
      track.compactlyCodedChunkTable.map((x) => [
        // Sample-to-chunk table
        u32(x.firstChunk),
        // First chunk
        u32(x.samplesPerChunk),
        // Samples per chunk
        u32(1)
        // Sample description index
      ])
    ]);
  };
  var stsz = (track) => fullBox("stsz", 0, 0, [
    u32(0),
    // Sample size (0 means non-constant size)
    u32(track.samples.length),
    // Number of entries
    track.samples.map((x) => u32(x.size))
    // Sample size table
  ]);
  var stco = (track) => {
    if (track.finalizedChunks.length > 0 && last(track.finalizedChunks).offset >= 2 ** 32) {
      return fullBox("co64", 0, 0, [
        u32(track.finalizedChunks.length),
        // Number of entries
        track.finalizedChunks.map((x) => u64(x.offset))
        // Chunk offset table
      ]);
    }
    return fullBox("stco", 0, 0, [
      u32(track.finalizedChunks.length),
      // Number of entries
      track.finalizedChunks.map((x) => u32(x.offset))
      // Chunk offset table
    ]);
  };
  var ctts = (track) => {
    return fullBox("ctts", 0, 0, [
      u32(track.compositionTimeOffsetTable.length),
      // Number of entries
      track.compositionTimeOffsetTable.map((x) => [
        // Time-to-sample table
        u32(x.sampleCount),
        // Sample count
        u32(x.sampleCompositionTimeOffset)
        // Sample offset
      ])
    ]);
  };
  var mvex = (tracks) => {
    return box("mvex", null, tracks.map(trex));
  };
  var trex = (track) => {
    return fullBox("trex", 0, 0, [
      u32(track.id),
      // Track ID
      u32(1),
      // Default sample description index
      u32(0),
      // Default sample duration
      u32(0),
      // Default sample size
      u32(0)
      // Default sample flags
    ]);
  };
  var moof = (sequenceNumber, tracks) => {
    return box("moof", null, [
      mfhd(sequenceNumber),
      ...tracks.map(traf)
    ]);
  };
  var mfhd = (sequenceNumber) => {
    return fullBox("mfhd", 0, 0, [
      u32(sequenceNumber)
      // Sequence number
    ]);
  };
  var fragmentSampleFlags = (sample) => {
    let byte1 = 0;
    let byte2 = 0;
    let byte3 = 0;
    let byte4 = 0;
    let sampleIsDifferenceSample = sample.type === "delta";
    byte2 |= +sampleIsDifferenceSample;
    if (sampleIsDifferenceSample) {
      byte1 |= 1;
    } else {
      byte1 |= 2;
    }
    return byte1 << 24 | byte2 << 16 | byte3 << 8 | byte4;
  };
  var traf = (track) => {
    return box("traf", null, [
      tfhd(track),
      tfdt(track),
      trun(track)
    ]);
  };
  var tfhd = (track) => {
    let tfFlags = 0;
    tfFlags |= 8;
    tfFlags |= 16;
    tfFlags |= 32;
    tfFlags |= 131072;
    let referenceSample = track.currentChunk.samples[1] ?? track.currentChunk.samples[0];
    let referenceSampleInfo = {
      duration: referenceSample.timescaleUnitsToNextSample,
      size: referenceSample.size,
      flags: fragmentSampleFlags(referenceSample)
    };
    return fullBox("tfhd", 0, tfFlags, [
      u32(track.id),
      // Track ID
      u32(referenceSampleInfo.duration),
      // Default sample duration
      u32(referenceSampleInfo.size),
      // Default sample size
      u32(referenceSampleInfo.flags)
      // Default sample flags
    ]);
  };
  var tfdt = (track) => {
    return fullBox("tfdt", 1, 0, [
      u64(intoTimescale(track.currentChunk.startTimestamp, track.timescale))
      // Base Media Decode Time
    ]);
  };
  var trun = (track) => {
    let allSampleDurations = track.currentChunk.samples.map((x) => x.timescaleUnitsToNextSample);
    let allSampleSizes = track.currentChunk.samples.map((x) => x.size);
    let allSampleFlags = track.currentChunk.samples.map(fragmentSampleFlags);
    let allSampleCompositionTimeOffsets = track.currentChunk.samples.map((x) => intoTimescale(x.presentationTimestamp - x.decodeTimestamp, track.timescale));
    let uniqueSampleDurations = new Set(allSampleDurations);
    let uniqueSampleSizes = new Set(allSampleSizes);
    let uniqueSampleFlags = new Set(allSampleFlags);
    let uniqueSampleCompositionTimeOffsets = new Set(allSampleCompositionTimeOffsets);
    let firstSampleFlagsPresent = uniqueSampleFlags.size === 2 && allSampleFlags[0] !== allSampleFlags[1];
    let sampleDurationPresent = uniqueSampleDurations.size > 1;
    let sampleSizePresent = uniqueSampleSizes.size > 1;
    let sampleFlagsPresent = !firstSampleFlagsPresent && uniqueSampleFlags.size > 1;
    let sampleCompositionTimeOffsetsPresent = uniqueSampleCompositionTimeOffsets.size > 1 || [...uniqueSampleCompositionTimeOffsets].some((x) => x !== 0);
    let flags = 0;
    flags |= 1;
    flags |= 4 * +firstSampleFlagsPresent;
    flags |= 256 * +sampleDurationPresent;
    flags |= 512 * +sampleSizePresent;
    flags |= 1024 * +sampleFlagsPresent;
    flags |= 2048 * +sampleCompositionTimeOffsetsPresent;
    return fullBox("trun", 1, flags, [
      u32(track.currentChunk.samples.length),
      // Sample count
      u32(track.currentChunk.offset - track.currentChunk.moofOffset || 0),
      // Data offset
      firstSampleFlagsPresent ? u32(allSampleFlags[0]) : [],
      track.currentChunk.samples.map((_, i) => [
        sampleDurationPresent ? u32(allSampleDurations[i]) : [],
        // Sample duration
        sampleSizePresent ? u32(allSampleSizes[i]) : [],
        // Sample size
        sampleFlagsPresent ? u32(allSampleFlags[i]) : [],
        // Sample flags
        // Sample composition time offsets
        sampleCompositionTimeOffsetsPresent ? i32(allSampleCompositionTimeOffsets[i]) : []
      ])
    ]);
  };
  var mfra = (tracks) => {
    return box("mfra", null, [
      ...tracks.map(tfra),
      mfro()
    ]);
  };
  var tfra = (track, trackIndex) => {
    let version = 1;
    return fullBox("tfra", version, 0, [
      u32(track.id),
      // Track ID
      u32(63),
      // This specifies that traf number, trun number and sample number are 32-bit ints
      u32(track.finalizedChunks.length),
      // Number of entries
      track.finalizedChunks.map((chunk2) => [
        u64(intoTimescale(chunk2.startTimestamp, track.timescale)),
        // Time
        u64(chunk2.moofOffset),
        // moof offset
        u32(trackIndex + 1),
        // traf number
        u32(1),
        // trun number
        u32(1)
        // Sample number
      ])
    ]);
  };
  var mfro = () => {
    return fullBox("mfro", 0, 0, [
      // This value needs to be overwritten manually from the outside, where the actual size of the enclosing mfra box
      // is known
      u32(0)
      // Size
    ]);
  };
  var VIDEO_CODEC_TO_BOX_NAME = {
    "avc": "avc1",
    "hevc": "hvc1",
    "vp9": "vp09",
    "av1": "av01"
  };
  var VIDEO_CODEC_TO_CONFIGURATION_BOX = {
    "avc": avcC,
    "hevc": hvcC,
    "vp9": vpcC,
    "av1": av1C
  };
  var AUDIO_CODEC_TO_BOX_NAME = {
    "aac": "mp4a",
    "opus": "Opus"
  };
  var AUDIO_CODEC_TO_CONFIGURATION_BOX = {
    "aac": esds,
    "opus": dOps
  };
  var Target = class {
  };
  var ArrayBufferTarget = class extends Target {
    constructor() {
      super(...arguments);
      this.buffer = null;
    }
  };
  var StreamTarget = class extends Target {
    constructor(options) {
      super();
      this.options = options;
      if (typeof options !== "object") {
        throw new TypeError("StreamTarget requires an options object to be passed to its constructor.");
      }
      if (options.onData) {
        if (typeof options.onData !== "function") {
          throw new TypeError("options.onData, when provided, must be a function.");
        }
        if (options.onData.length < 2) {
          throw new TypeError(
            "options.onData, when provided, must be a function that takes in at least two arguments (data and position). Ignoring the position argument, which specifies the byte offset at which the data is to be written, can lead to broken outputs."
          );
        }
      }
      if (options.chunked !== void 0 && typeof options.chunked !== "boolean") {
        throw new TypeError("options.chunked, when provided, must be a boolean.");
      }
      if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize < 1024)) {
        throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.");
      }
    }
  };
  var FileSystemWritableFileStreamTarget = class extends Target {
    constructor(stream, options) {
      super();
      this.stream = stream;
      this.options = options;
      if (!(stream instanceof FileSystemWritableFileStream)) {
        throw new TypeError("FileSystemWritableFileStreamTarget requires a FileSystemWritableFileStream instance.");
      }
      if (options !== void 0 && typeof options !== "object") {
        throw new TypeError("FileSystemWritableFileStreamTarget's options, when provided, must be an object.");
      }
      if (options) {
        if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
          throw new TypeError("options.chunkSize, when provided, must be a positive integer");
        }
      }
    }
  };
  var _helper, _helperView;
  var Writer = class {
    constructor() {
      this.pos = 0;
      __privateAdd(this, _helper, new Uint8Array(8));
      __privateAdd(this, _helperView, new DataView(__privateGet(this, _helper).buffer));
      this.offsets = /* @__PURE__ */ new WeakMap();
    }
    /** Sets the current position for future writes to a new one. */
    seek(newPos) {
      this.pos = newPos;
    }
    writeU32(value) {
      __privateGet(this, _helperView).setUint32(0, value, false);
      this.write(__privateGet(this, _helper).subarray(0, 4));
    }
    writeU64(value) {
      __privateGet(this, _helperView).setUint32(0, Math.floor(value / 2 ** 32), false);
      __privateGet(this, _helperView).setUint32(4, value, false);
      this.write(__privateGet(this, _helper).subarray(0, 8));
    }
    writeAscii(text) {
      for (let i = 0; i < text.length; i++) {
        __privateGet(this, _helperView).setUint8(i % 8, text.charCodeAt(i));
        if (i % 8 === 7)
          this.write(__privateGet(this, _helper));
      }
      if (text.length % 8 !== 0) {
        this.write(__privateGet(this, _helper).subarray(0, text.length % 8));
      }
    }
    writeBox(box2) {
      this.offsets.set(box2, this.pos);
      if (box2.contents && !box2.children) {
        this.writeBoxHeader(box2, box2.size ?? box2.contents.byteLength + 8);
        this.write(box2.contents);
      } else {
        let startPos = this.pos;
        this.writeBoxHeader(box2, 0);
        if (box2.contents)
          this.write(box2.contents);
        if (box2.children) {
          for (let child of box2.children)
            if (child)
              this.writeBox(child);
        }
        let endPos = this.pos;
        let size = box2.size ?? endPos - startPos;
        this.seek(startPos);
        this.writeBoxHeader(box2, size);
        this.seek(endPos);
      }
    }
    writeBoxHeader(box2, size) {
      this.writeU32(box2.largeSize ? 1 : size);
      this.writeAscii(box2.type);
      if (box2.largeSize)
        this.writeU64(size);
    }
    measureBoxHeader(box2) {
      return 8 + (box2.largeSize ? 8 : 0);
    }
    patchBox(box2) {
      let endPos = this.pos;
      this.seek(this.offsets.get(box2));
      this.writeBox(box2);
      this.seek(endPos);
    }
    measureBox(box2) {
      if (box2.contents && !box2.children) {
        let headerSize = this.measureBoxHeader(box2);
        return headerSize + box2.contents.byteLength;
      } else {
        let result = this.measureBoxHeader(box2);
        if (box2.contents)
          result += box2.contents.byteLength;
        if (box2.children) {
          for (let child of box2.children)
            if (child)
              result += this.measureBox(child);
        }
        return result;
      }
    }
  };
  _helper = /* @__PURE__ */ new WeakMap();
  _helperView = /* @__PURE__ */ new WeakMap();
  var _target, _buffer, _bytes, _maxPos, _ensureSize, ensureSize_fn;
  var ArrayBufferTargetWriter = class extends Writer {
    constructor(target) {
      super();
      __privateAdd(this, _ensureSize);
      __privateAdd(this, _target, void 0);
      __privateAdd(this, _buffer, new ArrayBuffer(2 ** 16));
      __privateAdd(this, _bytes, new Uint8Array(__privateGet(this, _buffer)));
      __privateAdd(this, _maxPos, 0);
      __privateSet(this, _target, target);
    }
    write(data) {
      __privateMethod(this, _ensureSize, ensureSize_fn).call(this, this.pos + data.byteLength);
      __privateGet(this, _bytes).set(data, this.pos);
      this.pos += data.byteLength;
      __privateSet(this, _maxPos, Math.max(__privateGet(this, _maxPos), this.pos));
    }
    finalize() {
      __privateMethod(this, _ensureSize, ensureSize_fn).call(this, this.pos);
      __privateGet(this, _target).buffer = __privateGet(this, _buffer).slice(0, Math.max(__privateGet(this, _maxPos), this.pos));
    }
  };
  _target = /* @__PURE__ */ new WeakMap();
  _buffer = /* @__PURE__ */ new WeakMap();
  _bytes = /* @__PURE__ */ new WeakMap();
  _maxPos = /* @__PURE__ */ new WeakMap();
  _ensureSize = /* @__PURE__ */ new WeakSet();
  ensureSize_fn = function(size) {
    let newLength = __privateGet(this, _buffer).byteLength;
    while (newLength < size)
      newLength *= 2;
    if (newLength === __privateGet(this, _buffer).byteLength)
      return;
    let newBuffer = new ArrayBuffer(newLength);
    let newBytes = new Uint8Array(newBuffer);
    newBytes.set(__privateGet(this, _bytes), 0);
    __privateSet(this, _buffer, newBuffer);
    __privateSet(this, _bytes, newBytes);
  };
  var DEFAULT_CHUNK_SIZE = 2 ** 24;
  var MAX_CHUNKS_AT_ONCE = 2;
  var _target2, _sections, _chunked, _chunkSize, _chunks, _writeDataIntoChunks, writeDataIntoChunks_fn, _insertSectionIntoChunk, insertSectionIntoChunk_fn, _createChunk, createChunk_fn, _flushChunks, flushChunks_fn;
  var StreamTargetWriter = class extends Writer {
    constructor(target) {
      var _a, _b;
      super();
      __privateAdd(this, _writeDataIntoChunks);
      __privateAdd(this, _insertSectionIntoChunk);
      __privateAdd(this, _createChunk);
      __privateAdd(this, _flushChunks);
      __privateAdd(this, _target2, void 0);
      __privateAdd(this, _sections, []);
      __privateAdd(this, _chunked, void 0);
      __privateAdd(this, _chunkSize, void 0);
      __privateAdd(this, _chunks, []);
      __privateSet(this, _target2, target);
      __privateSet(this, _chunked, ((_a = target.options) == null ? void 0 : _a.chunked) ?? false);
      __privateSet(this, _chunkSize, ((_b = target.options) == null ? void 0 : _b.chunkSize) ?? DEFAULT_CHUNK_SIZE);
    }
    write(data) {
      __privateGet(this, _sections).push({
        data: data.slice(),
        start: this.pos
      });
      this.pos += data.byteLength;
    }
    flush() {
      var _a, _b;
      if (__privateGet(this, _sections).length === 0)
        return;
      let chunks = [];
      let sorted = [...__privateGet(this, _sections)].sort((a, b) => a.start - b.start);
      chunks.push({
        start: sorted[0].start,
        size: sorted[0].data.byteLength
      });
      for (let i = 1; i < sorted.length; i++) {
        let lastChunk = chunks[chunks.length - 1];
        let section = sorted[i];
        if (section.start <= lastChunk.start + lastChunk.size) {
          lastChunk.size = Math.max(lastChunk.size, section.start + section.data.byteLength - lastChunk.start);
        } else {
          chunks.push({
            start: section.start,
            size: section.data.byteLength
          });
        }
      }
      for (let chunk2 of chunks) {
        chunk2.data = new Uint8Array(chunk2.size);
        for (let section of __privateGet(this, _sections)) {
          if (chunk2.start <= section.start && section.start < chunk2.start + chunk2.size) {
            chunk2.data.set(section.data, section.start - chunk2.start);
          }
        }
        if (__privateGet(this, _chunked)) {
          __privateMethod(this, _writeDataIntoChunks, writeDataIntoChunks_fn).call(this, chunk2.data, chunk2.start);
          __privateMethod(this, _flushChunks, flushChunks_fn).call(this);
        } else {
          (_b = (_a = __privateGet(this, _target2).options).onData) == null ? void 0 : _b.call(_a, chunk2.data, chunk2.start);
        }
      }
      __privateGet(this, _sections).length = 0;
    }
    finalize() {
      if (__privateGet(this, _chunked)) {
        __privateMethod(this, _flushChunks, flushChunks_fn).call(this, true);
      }
    }
  };
  _target2 = /* @__PURE__ */ new WeakMap();
  _sections = /* @__PURE__ */ new WeakMap();
  _chunked = /* @__PURE__ */ new WeakMap();
  _chunkSize = /* @__PURE__ */ new WeakMap();
  _chunks = /* @__PURE__ */ new WeakMap();
  _writeDataIntoChunks = /* @__PURE__ */ new WeakSet();
  writeDataIntoChunks_fn = function(data, position) {
    let chunkIndex = __privateGet(this, _chunks).findIndex((x) => x.start <= position && position < x.start + __privateGet(this, _chunkSize));
    if (chunkIndex === -1)
      chunkIndex = __privateMethod(this, _createChunk, createChunk_fn).call(this, position);
    let chunk2 = __privateGet(this, _chunks)[chunkIndex];
    let relativePosition = position - chunk2.start;
    let toWrite = data.subarray(0, Math.min(__privateGet(this, _chunkSize) - relativePosition, data.byteLength));
    chunk2.data.set(toWrite, relativePosition);
    let section = {
      start: relativePosition,
      end: relativePosition + toWrite.byteLength
    };
    __privateMethod(this, _insertSectionIntoChunk, insertSectionIntoChunk_fn).call(this, chunk2, section);
    if (chunk2.written[0].start === 0 && chunk2.written[0].end === __privateGet(this, _chunkSize)) {
      chunk2.shouldFlush = true;
    }
    if (__privateGet(this, _chunks).length > MAX_CHUNKS_AT_ONCE) {
      for (let i = 0; i < __privateGet(this, _chunks).length - 1; i++) {
        __privateGet(this, _chunks)[i].shouldFlush = true;
      }
      __privateMethod(this, _flushChunks, flushChunks_fn).call(this);
    }
    if (toWrite.byteLength < data.byteLength) {
      __privateMethod(this, _writeDataIntoChunks, writeDataIntoChunks_fn).call(this, data.subarray(toWrite.byteLength), position + toWrite.byteLength);
    }
  };
  _insertSectionIntoChunk = /* @__PURE__ */ new WeakSet();
  insertSectionIntoChunk_fn = function(chunk2, section) {
    let low = 0;
    let high = chunk2.written.length - 1;
    let index = -1;
    while (low <= high) {
      let mid = Math.floor(low + (high - low + 1) / 2);
      if (chunk2.written[mid].start <= section.start) {
        low = mid + 1;
        index = mid;
      } else {
        high = mid - 1;
      }
    }
    chunk2.written.splice(index + 1, 0, section);
    if (index === -1 || chunk2.written[index].end < section.start)
      index++;
    while (index < chunk2.written.length - 1 && chunk2.written[index].end >= chunk2.written[index + 1].start) {
      chunk2.written[index].end = Math.max(chunk2.written[index].end, chunk2.written[index + 1].end);
      chunk2.written.splice(index + 1, 1);
    }
  };
  _createChunk = /* @__PURE__ */ new WeakSet();
  createChunk_fn = function(includesPosition) {
    let start = Math.floor(includesPosition / __privateGet(this, _chunkSize)) * __privateGet(this, _chunkSize);
    let chunk2 = {
      start,
      data: new Uint8Array(__privateGet(this, _chunkSize)),
      written: [],
      shouldFlush: false
    };
    __privateGet(this, _chunks).push(chunk2);
    __privateGet(this, _chunks).sort((a, b) => a.start - b.start);
    return __privateGet(this, _chunks).indexOf(chunk2);
  };
  _flushChunks = /* @__PURE__ */ new WeakSet();
  flushChunks_fn = function(force = false) {
    var _a, _b;
    for (let i = 0; i < __privateGet(this, _chunks).length; i++) {
      let chunk2 = __privateGet(this, _chunks)[i];
      if (!chunk2.shouldFlush && !force)
        continue;
      for (let section of chunk2.written) {
        (_b = (_a = __privateGet(this, _target2).options).onData) == null ? void 0 : _b.call(
          _a,
          chunk2.data.subarray(section.start, section.end),
          chunk2.start + section.start
        );
      }
      __privateGet(this, _chunks).splice(i--, 1);
    }
  };
  var FileSystemWritableFileStreamTargetWriter = class extends StreamTargetWriter {
    constructor(target) {
      var _a;
      super(new StreamTarget({
        onData: (data, position) => target.stream.write({
          type: "write",
          data,
          position
        }),
        chunked: true,
        chunkSize: (_a = target.options) == null ? void 0 : _a.chunkSize
      }));
    }
  };
  var GLOBAL_TIMESCALE = 1e3;
  var SUPPORTED_VIDEO_CODECS = ["avc", "hevc", "vp9", "av1"];
  var SUPPORTED_AUDIO_CODECS = ["aac", "opus"];
  var TIMESTAMP_OFFSET = 2082844800;
  var FIRST_TIMESTAMP_BEHAVIORS = ["strict", "offset", "cross-track-offset"];
  var _options, _writer, _ftypSize, _mdat, _videoTrack, _audioTrack, _creationTime, _finalizedChunks, _nextFragmentNumber, _videoSampleQueue, _audioSampleQueue, _finalized, _validateOptions, validateOptions_fn, _writeHeader, writeHeader_fn, _computeMoovSizeUpperBound, computeMoovSizeUpperBound_fn, _prepareTracks, prepareTracks_fn, _generateMpeg4AudioSpecificConfig, generateMpeg4AudioSpecificConfig_fn, _createSampleForTrack, createSampleForTrack_fn, _addSampleToTrack, addSampleToTrack_fn, _validateTimestamp, validateTimestamp_fn, _finalizeCurrentChunk, finalizeCurrentChunk_fn, _finalizeFragment, finalizeFragment_fn, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn, _ensureNotFinalized, ensureNotFinalized_fn;
  var Muxer = class {
    constructor(options) {
      __privateAdd(this, _validateOptions);
      __privateAdd(this, _writeHeader);
      __privateAdd(this, _computeMoovSizeUpperBound);
      __privateAdd(this, _prepareTracks);
      __privateAdd(this, _generateMpeg4AudioSpecificConfig);
      __privateAdd(this, _createSampleForTrack);
      __privateAdd(this, _addSampleToTrack);
      __privateAdd(this, _validateTimestamp);
      __privateAdd(this, _finalizeCurrentChunk);
      __privateAdd(this, _finalizeFragment);
      __privateAdd(this, _maybeFlushStreamingTargetWriter);
      __privateAdd(this, _ensureNotFinalized);
      __privateAdd(this, _options, void 0);
      __privateAdd(this, _writer, void 0);
      __privateAdd(this, _ftypSize, void 0);
      __privateAdd(this, _mdat, void 0);
      __privateAdd(this, _videoTrack, null);
      __privateAdd(this, _audioTrack, null);
      __privateAdd(this, _creationTime, Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET);
      __privateAdd(this, _finalizedChunks, []);
      __privateAdd(this, _nextFragmentNumber, 1);
      __privateAdd(this, _videoSampleQueue, []);
      __privateAdd(this, _audioSampleQueue, []);
      __privateAdd(this, _finalized, false);
      __privateMethod(this, _validateOptions, validateOptions_fn).call(this, options);
      options.video = deepClone(options.video);
      options.audio = deepClone(options.audio);
      options.fastStart = deepClone(options.fastStart);
      this.target = options.target;
      __privateSet(this, _options, {
        firstTimestampBehavior: "strict",
        ...options
      });
      if (options.target instanceof ArrayBufferTarget) {
        __privateSet(this, _writer, new ArrayBufferTargetWriter(options.target));
      } else if (options.target instanceof StreamTarget) {
        __privateSet(this, _writer, new StreamTargetWriter(options.target));
      } else if (options.target instanceof FileSystemWritableFileStreamTarget) {
        __privateSet(this, _writer, new FileSystemWritableFileStreamTargetWriter(options.target));
      } else {
        throw new Error(`Invalid target: ${options.target}`);
      }
      __privateMethod(this, _prepareTracks, prepareTracks_fn).call(this);
      __privateMethod(this, _writeHeader, writeHeader_fn).call(this);
    }
    addVideoChunk(sample, meta, timestamp, compositionTimeOffset) {
      if (!(sample instanceof EncodedVideoChunk)) {
        throw new TypeError("addVideoChunk's first argument (sample) must be of type EncodedVideoChunk.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addVideoChunk's second argument (meta), when provided, must be an object.");
      }
      if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
        throw new TypeError(
          "addVideoChunk's third argument (timestamp), when provided, must be a non-negative real number."
        );
      }
      if (compositionTimeOffset !== void 0 && !Number.isFinite(compositionTimeOffset)) {
        throw new TypeError(
          "addVideoChunk's fourth argument (compositionTimeOffset), when provided, must be a real number."
        );
      }
      let data = new Uint8Array(sample.byteLength);
      sample.copyTo(data);
      this.addVideoChunkRaw(
        data,
        sample.type,
        timestamp ?? sample.timestamp,
        sample.duration,
        meta,
        compositionTimeOffset
      );
    }
    addVideoChunkRaw(data, type, timestamp, duration, meta, compositionTimeOffset) {
      if (!(data instanceof Uint8Array)) {
        throw new TypeError("addVideoChunkRaw's first argument (data) must be an instance of Uint8Array.");
      }
      if (type !== "key" && type !== "delta") {
        throw new TypeError("addVideoChunkRaw's second argument (type) must be either 'key' or 'delta'.");
      }
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        throw new TypeError("addVideoChunkRaw's third argument (timestamp) must be a non-negative real number.");
      }
      if (!Number.isFinite(duration) || duration < 0) {
        throw new TypeError("addVideoChunkRaw's fourth argument (duration) must be a non-negative real number.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addVideoChunkRaw's fifth argument (meta), when provided, must be an object.");
      }
      if (compositionTimeOffset !== void 0 && !Number.isFinite(compositionTimeOffset)) {
        throw new TypeError(
          "addVideoChunkRaw's sixth argument (compositionTimeOffset), when provided, must be a real number."
        );
      }
      __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
      if (!__privateGet(this, _options).video)
        throw new Error("No video track declared.");
      if (typeof __privateGet(this, _options).fastStart === "object" && __privateGet(this, _videoTrack).samples.length === __privateGet(this, _options).fastStart.expectedVideoChunks) {
        throw new Error(`Cannot add more video chunks than specified in 'fastStart' (${__privateGet(this, _options).fastStart.expectedVideoChunks}).`);
      }
      let videoSample = __privateMethod(this, _createSampleForTrack, createSampleForTrack_fn).call(this, __privateGet(this, _videoTrack), data, type, timestamp, duration, meta, compositionTimeOffset);
      if (__privateGet(this, _options).fastStart === "fragmented" && __privateGet(this, _audioTrack)) {
        while (__privateGet(this, _audioSampleQueue).length > 0 && __privateGet(this, _audioSampleQueue)[0].decodeTimestamp <= videoSample.decodeTimestamp) {
          let audioSample = __privateGet(this, _audioSampleQueue).shift();
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
        }
        if (videoSample.decodeTimestamp <= __privateGet(this, _audioTrack).lastDecodeTimestamp) {
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
        } else {
          __privateGet(this, _videoSampleQueue).push(videoSample);
        }
      } else {
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
      }
    }
    addAudioChunk(sample, meta, timestamp) {
      if (!(sample instanceof EncodedAudioChunk)) {
        throw new TypeError("addAudioChunk's first argument (sample) must be of type EncodedAudioChunk.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addAudioChunk's second argument (meta), when provided, must be an object.");
      }
      if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
        throw new TypeError(
          "addAudioChunk's third argument (timestamp), when provided, must be a non-negative real number."
        );
      }
      let data = new Uint8Array(sample.byteLength);
      sample.copyTo(data);
      this.addAudioChunkRaw(data, sample.type, timestamp ?? sample.timestamp, sample.duration, meta);
    }
    addAudioChunkRaw(data, type, timestamp, duration, meta) {
      if (!(data instanceof Uint8Array)) {
        throw new TypeError("addAudioChunkRaw's first argument (data) must be an instance of Uint8Array.");
      }
      if (type !== "key" && type !== "delta") {
        throw new TypeError("addAudioChunkRaw's second argument (type) must be either 'key' or 'delta'.");
      }
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        throw new TypeError("addAudioChunkRaw's third argument (timestamp) must be a non-negative real number.");
      }
      if (!Number.isFinite(duration) || duration < 0) {
        throw new TypeError("addAudioChunkRaw's fourth argument (duration) must be a non-negative real number.");
      }
      if (meta && typeof meta !== "object") {
        throw new TypeError("addAudioChunkRaw's fifth argument (meta), when provided, must be an object.");
      }
      __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
      if (!__privateGet(this, _options).audio)
        throw new Error("No audio track declared.");
      if (typeof __privateGet(this, _options).fastStart === "object" && __privateGet(this, _audioTrack).samples.length === __privateGet(this, _options).fastStart.expectedAudioChunks) {
        throw new Error(`Cannot add more audio chunks than specified in 'fastStart' (${__privateGet(this, _options).fastStart.expectedAudioChunks}).`);
      }
      let audioSample = __privateMethod(this, _createSampleForTrack, createSampleForTrack_fn).call(this, __privateGet(this, _audioTrack), data, type, timestamp, duration, meta);
      if (__privateGet(this, _options).fastStart === "fragmented" && __privateGet(this, _videoTrack)) {
        while (__privateGet(this, _videoSampleQueue).length > 0 && __privateGet(this, _videoSampleQueue)[0].decodeTimestamp <= audioSample.decodeTimestamp) {
          let videoSample = __privateGet(this, _videoSampleQueue).shift();
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
        }
        if (audioSample.decodeTimestamp <= __privateGet(this, _videoTrack).lastDecodeTimestamp) {
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
        } else {
          __privateGet(this, _audioSampleQueue).push(audioSample);
        }
      } else {
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
      }
    }
    /** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
    finalize() {
      if (__privateGet(this, _finalized)) {
        throw new Error("Cannot finalize a muxer more than once.");
      }
      if (__privateGet(this, _options).fastStart === "fragmented") {
        for (let videoSample of __privateGet(this, _videoSampleQueue))
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
        for (let audioSample of __privateGet(this, _audioSampleQueue))
          __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
        __privateMethod(this, _finalizeFragment, finalizeFragment_fn).call(this, false);
      } else {
        if (__privateGet(this, _videoTrack))
          __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, __privateGet(this, _videoTrack));
        if (__privateGet(this, _audioTrack))
          __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, __privateGet(this, _audioTrack));
      }
      let tracks = [__privateGet(this, _videoTrack), __privateGet(this, _audioTrack)].filter(Boolean);
      if (__privateGet(this, _options).fastStart === "in-memory") {
        let mdatSize;
        for (let i = 0; i < 2; i++) {
          let movieBox2 = moov(tracks, __privateGet(this, _creationTime));
          let movieBoxSize = __privateGet(this, _writer).measureBox(movieBox2);
          mdatSize = __privateGet(this, _writer).measureBox(__privateGet(this, _mdat));
          let currentChunkPos = __privateGet(this, _writer).pos + movieBoxSize + mdatSize;
          for (let chunk2 of __privateGet(this, _finalizedChunks)) {
            chunk2.offset = currentChunkPos;
            for (let { data } of chunk2.samples) {
              currentChunkPos += data.byteLength;
              mdatSize += data.byteLength;
            }
          }
          if (currentChunkPos < 2 ** 32)
            break;
          if (mdatSize >= 2 ** 32)
            __privateGet(this, _mdat).largeSize = true;
        }
        let movieBox = moov(tracks, __privateGet(this, _creationTime));
        __privateGet(this, _writer).writeBox(movieBox);
        __privateGet(this, _mdat).size = mdatSize;
        __privateGet(this, _writer).writeBox(__privateGet(this, _mdat));
        for (let chunk2 of __privateGet(this, _finalizedChunks)) {
          for (let sample of chunk2.samples) {
            __privateGet(this, _writer).write(sample.data);
            sample.data = null;
          }
        }
      } else if (__privateGet(this, _options).fastStart === "fragmented") {
        let startPos = __privateGet(this, _writer).pos;
        let mfraBox = mfra(tracks);
        __privateGet(this, _writer).writeBox(mfraBox);
        let mfraBoxSize = __privateGet(this, _writer).pos - startPos;
        __privateGet(this, _writer).seek(__privateGet(this, _writer).pos - 4);
        __privateGet(this, _writer).writeU32(mfraBoxSize);
      } else {
        let mdatPos = __privateGet(this, _writer).offsets.get(__privateGet(this, _mdat));
        let mdatSize = __privateGet(this, _writer).pos - mdatPos;
        __privateGet(this, _mdat).size = mdatSize;
        __privateGet(this, _mdat).largeSize = mdatSize >= 2 ** 32;
        __privateGet(this, _writer).patchBox(__privateGet(this, _mdat));
        let movieBox = moov(tracks, __privateGet(this, _creationTime));
        if (typeof __privateGet(this, _options).fastStart === "object") {
          __privateGet(this, _writer).seek(__privateGet(this, _ftypSize));
          __privateGet(this, _writer).writeBox(movieBox);
          let remainingBytes = mdatPos - __privateGet(this, _writer).pos;
          __privateGet(this, _writer).writeBox(free(remainingBytes));
        } else {
          __privateGet(this, _writer).writeBox(movieBox);
        }
      }
      __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
      __privateGet(this, _writer).finalize();
      __privateSet(this, _finalized, true);
    }
  };
  _options = /* @__PURE__ */ new WeakMap();
  _writer = /* @__PURE__ */ new WeakMap();
  _ftypSize = /* @__PURE__ */ new WeakMap();
  _mdat = /* @__PURE__ */ new WeakMap();
  _videoTrack = /* @__PURE__ */ new WeakMap();
  _audioTrack = /* @__PURE__ */ new WeakMap();
  _creationTime = /* @__PURE__ */ new WeakMap();
  _finalizedChunks = /* @__PURE__ */ new WeakMap();
  _nextFragmentNumber = /* @__PURE__ */ new WeakMap();
  _videoSampleQueue = /* @__PURE__ */ new WeakMap();
  _audioSampleQueue = /* @__PURE__ */ new WeakMap();
  _finalized = /* @__PURE__ */ new WeakMap();
  _validateOptions = /* @__PURE__ */ new WeakSet();
  validateOptions_fn = function(options) {
    if (typeof options !== "object") {
      throw new TypeError("The muxer requires an options object to be passed to its constructor.");
    }
    if (!(options.target instanceof Target)) {
      throw new TypeError("The target must be provided and an instance of Target.");
    }
    if (options.video) {
      if (!SUPPORTED_VIDEO_CODECS.includes(options.video.codec)) {
        throw new TypeError(`Unsupported video codec: ${options.video.codec}`);
      }
      if (!Number.isInteger(options.video.width) || options.video.width <= 0) {
        throw new TypeError(`Invalid video width: ${options.video.width}. Must be a positive integer.`);
      }
      if (!Number.isInteger(options.video.height) || options.video.height <= 0) {
        throw new TypeError(`Invalid video height: ${options.video.height}. Must be a positive integer.`);
      }
      const videoRotation = options.video.rotation;
      if (typeof videoRotation === "number" && ![0, 90, 180, 270].includes(videoRotation)) {
        throw new TypeError(`Invalid video rotation: ${videoRotation}. Has to be 0, 90, 180 or 270.`);
      } else if (Array.isArray(videoRotation) && (videoRotation.length !== 9 || videoRotation.some((value) => typeof value !== "number"))) {
        throw new TypeError(`Invalid video transformation matrix: ${videoRotation.join()}`);
      }
      if (options.video.frameRate !== void 0 && (!Number.isInteger(options.video.frameRate) || options.video.frameRate <= 0)) {
        throw new TypeError(
          `Invalid video frame rate: ${options.video.frameRate}. Must be a positive integer.`
        );
      }
    }
    if (options.audio) {
      if (!SUPPORTED_AUDIO_CODECS.includes(options.audio.codec)) {
        throw new TypeError(`Unsupported audio codec: ${options.audio.codec}`);
      }
      if (!Number.isInteger(options.audio.numberOfChannels) || options.audio.numberOfChannels <= 0) {
        throw new TypeError(
          `Invalid number of audio channels: ${options.audio.numberOfChannels}. Must be a positive integer.`
        );
      }
      if (!Number.isInteger(options.audio.sampleRate) || options.audio.sampleRate <= 0) {
        throw new TypeError(
          `Invalid audio sample rate: ${options.audio.sampleRate}. Must be a positive integer.`
        );
      }
    }
    if (options.firstTimestampBehavior && !FIRST_TIMESTAMP_BEHAVIORS.includes(options.firstTimestampBehavior)) {
      throw new TypeError(`Invalid first timestamp behavior: ${options.firstTimestampBehavior}`);
    }
    if (typeof options.fastStart === "object") {
      if (options.video) {
        if (options.fastStart.expectedVideoChunks === void 0) {
          throw new TypeError(`'fastStart' is an object but is missing property 'expectedVideoChunks'.`);
        } else if (!Number.isInteger(options.fastStart.expectedVideoChunks) || options.fastStart.expectedVideoChunks < 0) {
          throw new TypeError(`'expectedVideoChunks' must be a non-negative integer.`);
        }
      }
      if (options.audio) {
        if (options.fastStart.expectedAudioChunks === void 0) {
          throw new TypeError(`'fastStart' is an object but is missing property 'expectedAudioChunks'.`);
        } else if (!Number.isInteger(options.fastStart.expectedAudioChunks) || options.fastStart.expectedAudioChunks < 0) {
          throw new TypeError(`'expectedAudioChunks' must be a non-negative integer.`);
        }
      }
    } else if (![false, "in-memory", "fragmented"].includes(options.fastStart)) {
      throw new TypeError(`'fastStart' option must be false, 'in-memory', 'fragmented' or an object.`);
    }
    if (options.minFragmentDuration !== void 0 && (!Number.isFinite(options.minFragmentDuration) || options.minFragmentDuration < 0)) {
      throw new TypeError(`'minFragmentDuration' must be a non-negative number.`);
    }
  };
  _writeHeader = /* @__PURE__ */ new WeakSet();
  writeHeader_fn = function() {
    var _a;
    __privateGet(this, _writer).writeBox(ftyp({
      holdsAvc: ((_a = __privateGet(this, _options).video) == null ? void 0 : _a.codec) === "avc",
      fragmented: __privateGet(this, _options).fastStart === "fragmented"
    }));
    __privateSet(this, _ftypSize, __privateGet(this, _writer).pos);
    if (__privateGet(this, _options).fastStart === "in-memory") {
      __privateSet(this, _mdat, mdat(false));
    } else if (__privateGet(this, _options).fastStart === "fragmented") ;
    else {
      if (typeof __privateGet(this, _options).fastStart === "object") {
        let moovSizeUpperBound = __privateMethod(this, _computeMoovSizeUpperBound, computeMoovSizeUpperBound_fn).call(this);
        __privateGet(this, _writer).seek(__privateGet(this, _writer).pos + moovSizeUpperBound);
      }
      __privateSet(this, _mdat, mdat(true));
      __privateGet(this, _writer).writeBox(__privateGet(this, _mdat));
    }
    __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
  };
  _computeMoovSizeUpperBound = /* @__PURE__ */ new WeakSet();
  computeMoovSizeUpperBound_fn = function() {
    if (typeof __privateGet(this, _options).fastStart !== "object")
      return;
    let upperBound = 0;
    let sampleCounts = [
      __privateGet(this, _options).fastStart.expectedVideoChunks,
      __privateGet(this, _options).fastStart.expectedAudioChunks
    ];
    for (let n of sampleCounts) {
      if (!n)
        continue;
      upperBound += (4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += 4 * n;
      upperBound += (4 + 4 + 4) * Math.ceil(2 / 3 * n);
      upperBound += 4 * n;
      upperBound += 8 * n;
    }
    upperBound += 4096;
    return upperBound;
  };
  _prepareTracks = /* @__PURE__ */ new WeakSet();
  prepareTracks_fn = function() {
    if (__privateGet(this, _options).video) {
      __privateSet(this, _videoTrack, {
        id: 1,
        info: {
          type: "video",
          codec: __privateGet(this, _options).video.codec,
          width: __privateGet(this, _options).video.width,
          height: __privateGet(this, _options).video.height,
          rotation: __privateGet(this, _options).video.rotation ?? 0,
          decoderConfig: null
        },
        // The fallback contains many common frame rates as factors
        timescale: __privateGet(this, _options).video.frameRate ?? 57600,
        samples: [],
        finalizedChunks: [],
        currentChunk: null,
        firstDecodeTimestamp: void 0,
        lastDecodeTimestamp: -1,
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        compactlyCodedChunkTable: []
      });
    }
    if (__privateGet(this, _options).audio) {
      __privateSet(this, _audioTrack, {
        id: __privateGet(this, _options).video ? 2 : 1,
        info: {
          type: "audio",
          codec: __privateGet(this, _options).audio.codec,
          numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
          sampleRate: __privateGet(this, _options).audio.sampleRate,
          decoderConfig: null
        },
        timescale: __privateGet(this, _options).audio.sampleRate,
        samples: [],
        finalizedChunks: [],
        currentChunk: null,
        firstDecodeTimestamp: void 0,
        lastDecodeTimestamp: -1,
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        compactlyCodedChunkTable: []
      });
      if (__privateGet(this, _options).audio.codec === "aac") {
        let guessedCodecPrivate = __privateMethod(this, _generateMpeg4AudioSpecificConfig, generateMpeg4AudioSpecificConfig_fn).call(
          this,
          2,
          // Object type for AAC-LC, since it's the most common
          __privateGet(this, _options).audio.sampleRate,
          __privateGet(this, _options).audio.numberOfChannels
        );
        __privateGet(this, _audioTrack).info.decoderConfig = {
          codec: __privateGet(this, _options).audio.codec,
          description: guessedCodecPrivate,
          numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
          sampleRate: __privateGet(this, _options).audio.sampleRate
        };
      }
    }
  };
  _generateMpeg4AudioSpecificConfig = /* @__PURE__ */ new WeakSet();
  generateMpeg4AudioSpecificConfig_fn = function(objectType, sampleRate, numberOfChannels) {
    let frequencyIndices = [96e3, 88200, 64e3, 48e3, 44100, 32e3, 24e3, 22050, 16e3, 12e3, 11025, 8e3, 7350];
    let frequencyIndex = frequencyIndices.indexOf(sampleRate);
    let channelConfig = numberOfChannels;
    let configBits = "";
    configBits += objectType.toString(2).padStart(5, "0");
    configBits += frequencyIndex.toString(2).padStart(4, "0");
    if (frequencyIndex === 15)
      configBits += sampleRate.toString(2).padStart(24, "0");
    configBits += channelConfig.toString(2).padStart(4, "0");
    let paddingLength = Math.ceil(configBits.length / 8) * 8;
    configBits = configBits.padEnd(paddingLength, "0");
    let configBytes = new Uint8Array(configBits.length / 8);
    for (let i = 0; i < configBits.length; i += 8) {
      configBytes[i / 8] = parseInt(configBits.slice(i, i + 8), 2);
    }
    return configBytes;
  };
  _createSampleForTrack = /* @__PURE__ */ new WeakSet();
  createSampleForTrack_fn = function(track, data, type, timestamp, duration, meta, compositionTimeOffset) {
    let presentationTimestampInSeconds = timestamp / 1e6;
    let decodeTimestampInSeconds = (timestamp - (compositionTimeOffset ?? 0)) / 1e6;
    let durationInSeconds = duration / 1e6;
    let adjusted = __privateMethod(this, _validateTimestamp, validateTimestamp_fn).call(this, presentationTimestampInSeconds, decodeTimestampInSeconds, track);
    presentationTimestampInSeconds = adjusted.presentationTimestamp;
    decodeTimestampInSeconds = adjusted.decodeTimestamp;
    if (meta == null ? void 0 : meta.decoderConfig) {
      if (track.info.decoderConfig === null) {
        track.info.decoderConfig = meta.decoderConfig;
      } else {
        Object.assign(track.info.decoderConfig, meta.decoderConfig);
      }
    }
    let sample = {
      presentationTimestamp: presentationTimestampInSeconds,
      decodeTimestamp: decodeTimestampInSeconds,
      duration: durationInSeconds,
      data,
      size: data.byteLength,
      type,
      // Will be refined once the next sample comes in
      timescaleUnitsToNextSample: intoTimescale(durationInSeconds, track.timescale)
    };
    return sample;
  };
  _addSampleToTrack = /* @__PURE__ */ new WeakSet();
  addSampleToTrack_fn = function(track, sample) {
    if (__privateGet(this, _options).fastStart !== "fragmented") {
      track.samples.push(sample);
    }
    const sampleCompositionTimeOffset = intoTimescale(sample.presentationTimestamp - sample.decodeTimestamp, track.timescale);
    if (track.lastTimescaleUnits !== null) {
      let timescaleUnits = intoTimescale(sample.decodeTimestamp, track.timescale, false);
      let delta = Math.round(timescaleUnits - track.lastTimescaleUnits);
      track.lastTimescaleUnits += delta;
      track.lastSample.timescaleUnitsToNextSample = delta;
      if (__privateGet(this, _options).fastStart !== "fragmented") {
        let lastTableEntry = last(track.timeToSampleTable);
        if (lastTableEntry.sampleCount === 1) {
          lastTableEntry.sampleDelta = delta;
          lastTableEntry.sampleCount++;
        } else if (lastTableEntry.sampleDelta === delta) {
          lastTableEntry.sampleCount++;
        } else {
          lastTableEntry.sampleCount--;
          track.timeToSampleTable.push({
            sampleCount: 2,
            sampleDelta: delta
          });
        }
        const lastCompositionTimeOffsetTableEntry = last(track.compositionTimeOffsetTable);
        if (lastCompositionTimeOffsetTableEntry.sampleCompositionTimeOffset === sampleCompositionTimeOffset) {
          lastCompositionTimeOffsetTableEntry.sampleCount++;
        } else {
          track.compositionTimeOffsetTable.push({
            sampleCount: 1,
            sampleCompositionTimeOffset
          });
        }
      }
    } else {
      track.lastTimescaleUnits = 0;
      if (__privateGet(this, _options).fastStart !== "fragmented") {
        track.timeToSampleTable.push({
          sampleCount: 1,
          sampleDelta: intoTimescale(sample.duration, track.timescale)
        });
        track.compositionTimeOffsetTable.push({
          sampleCount: 1,
          sampleCompositionTimeOffset
        });
      }
    }
    track.lastSample = sample;
    let beginNewChunk = false;
    if (!track.currentChunk) {
      beginNewChunk = true;
    } else {
      let currentChunkDuration = sample.presentationTimestamp - track.currentChunk.startTimestamp;
      if (__privateGet(this, _options).fastStart === "fragmented") {
        let mostImportantTrack = __privateGet(this, _videoTrack) ?? __privateGet(this, _audioTrack);
        const chunkDuration = __privateGet(this, _options).minFragmentDuration ?? 1;
        if (track === mostImportantTrack && sample.type === "key" && currentChunkDuration >= chunkDuration) {
          beginNewChunk = true;
          __privateMethod(this, _finalizeFragment, finalizeFragment_fn).call(this);
        }
      } else {
        beginNewChunk = currentChunkDuration >= 0.5;
      }
    }
    if (beginNewChunk) {
      if (track.currentChunk) {
        __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, track);
      }
      track.currentChunk = {
        startTimestamp: sample.presentationTimestamp,
        samples: []
      };
    }
    track.currentChunk.samples.push(sample);
  };
  _validateTimestamp = /* @__PURE__ */ new WeakSet();
  validateTimestamp_fn = function(presentationTimestamp, decodeTimestamp, track) {
    var _a, _b;
    const strictTimestampBehavior = __privateGet(this, _options).firstTimestampBehavior === "strict";
    const noLastDecodeTimestamp = track.lastDecodeTimestamp === -1;
    const timestampNonZero = decodeTimestamp !== 0;
    if (strictTimestampBehavior && noLastDecodeTimestamp && timestampNonZero) {
      throw new Error(
        `The first chunk for your media track must have a timestamp of 0 (received DTS=${decodeTimestamp}).Non-zero first timestamps are often caused by directly piping frames or audio data from a MediaStreamTrack into the encoder. Their timestamps are typically relative to the age of thedocument, which is probably what you want.

If you want to offset all timestamps of a track such that the first one is zero, set firstTimestampBehavior: 'offset' in the options.
`
      );
    } else if (__privateGet(this, _options).firstTimestampBehavior === "offset" || __privateGet(this, _options).firstTimestampBehavior === "cross-track-offset") {
      if (track.firstDecodeTimestamp === void 0) {
        track.firstDecodeTimestamp = decodeTimestamp;
      }
      let baseDecodeTimestamp;
      if (__privateGet(this, _options).firstTimestampBehavior === "offset") {
        baseDecodeTimestamp = track.firstDecodeTimestamp;
      } else {
        baseDecodeTimestamp = Math.min(
          ((_a = __privateGet(this, _videoTrack)) == null ? void 0 : _a.firstDecodeTimestamp) ?? Infinity,
          ((_b = __privateGet(this, _audioTrack)) == null ? void 0 : _b.firstDecodeTimestamp) ?? Infinity
        );
      }
      decodeTimestamp -= baseDecodeTimestamp;
      presentationTimestamp -= baseDecodeTimestamp;
    }
    if (decodeTimestamp < track.lastDecodeTimestamp) {
      throw new Error(
        `Timestamps must be monotonically increasing (DTS went from ${track.lastDecodeTimestamp * 1e6} to ${decodeTimestamp * 1e6}).`
      );
    }
    track.lastDecodeTimestamp = decodeTimestamp;
    return { presentationTimestamp, decodeTimestamp };
  };
  _finalizeCurrentChunk = /* @__PURE__ */ new WeakSet();
  finalizeCurrentChunk_fn = function(track) {
    if (__privateGet(this, _options).fastStart === "fragmented") {
      throw new Error("Can't finalize individual chunks if 'fastStart' is set to 'fragmented'.");
    }
    if (!track.currentChunk)
      return;
    track.finalizedChunks.push(track.currentChunk);
    __privateGet(this, _finalizedChunks).push(track.currentChunk);
    if (track.compactlyCodedChunkTable.length === 0 || last(track.compactlyCodedChunkTable).samplesPerChunk !== track.currentChunk.samples.length) {
      track.compactlyCodedChunkTable.push({
        firstChunk: track.finalizedChunks.length,
        // 1-indexed
        samplesPerChunk: track.currentChunk.samples.length
      });
    }
    if (__privateGet(this, _options).fastStart === "in-memory") {
      track.currentChunk.offset = 0;
      return;
    }
    track.currentChunk.offset = __privateGet(this, _writer).pos;
    for (let sample of track.currentChunk.samples) {
      __privateGet(this, _writer).write(sample.data);
      sample.data = null;
    }
    __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
  };
  _finalizeFragment = /* @__PURE__ */ new WeakSet();
  finalizeFragment_fn = function(flushStreamingWriter = true) {
    if (__privateGet(this, _options).fastStart !== "fragmented") {
      throw new Error("Can't finalize a fragment unless 'fastStart' is set to 'fragmented'.");
    }
    let tracks = [__privateGet(this, _videoTrack), __privateGet(this, _audioTrack)].filter((track) => track && track.currentChunk);
    if (tracks.length === 0)
      return;
    let fragmentNumber = __privateWrapper(this, _nextFragmentNumber)._++;
    if (fragmentNumber === 1) {
      let movieBox = moov(tracks, __privateGet(this, _creationTime), true);
      __privateGet(this, _writer).writeBox(movieBox);
    }
    let moofOffset = __privateGet(this, _writer).pos;
    let moofBox = moof(fragmentNumber, tracks);
    __privateGet(this, _writer).writeBox(moofBox);
    {
      let mdatBox = mdat(false);
      let totalTrackSampleSize = 0;
      for (let track of tracks) {
        for (let sample of track.currentChunk.samples) {
          totalTrackSampleSize += sample.size;
        }
      }
      let mdatSize = __privateGet(this, _writer).measureBox(mdatBox) + totalTrackSampleSize;
      if (mdatSize >= 2 ** 32) {
        mdatBox.largeSize = true;
        mdatSize = __privateGet(this, _writer).measureBox(mdatBox) + totalTrackSampleSize;
      }
      mdatBox.size = mdatSize;
      __privateGet(this, _writer).writeBox(mdatBox);
    }
    for (let track of tracks) {
      track.currentChunk.offset = __privateGet(this, _writer).pos;
      track.currentChunk.moofOffset = moofOffset;
      for (let sample of track.currentChunk.samples) {
        __privateGet(this, _writer).write(sample.data);
        sample.data = null;
      }
    }
    let endPos = __privateGet(this, _writer).pos;
    __privateGet(this, _writer).seek(__privateGet(this, _writer).offsets.get(moofBox));
    let newMoofBox = moof(fragmentNumber, tracks);
    __privateGet(this, _writer).writeBox(newMoofBox);
    __privateGet(this, _writer).seek(endPos);
    for (let track of tracks) {
      track.finalizedChunks.push(track.currentChunk);
      __privateGet(this, _finalizedChunks).push(track.currentChunk);
      track.currentChunk = null;
    }
    if (flushStreamingWriter) {
      __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
    }
  };
  _maybeFlushStreamingTargetWriter = /* @__PURE__ */ new WeakSet();
  maybeFlushStreamingTargetWriter_fn = function() {
    if (__privateGet(this, _writer) instanceof StreamTargetWriter) {
      __privateGet(this, _writer).flush();
    }
  };
  _ensureNotFinalized = /* @__PURE__ */ new WeakSet();
  ensureNotFinalized_fn = function() {
    if (__privateGet(this, _finalized)) {
      throw new Error("Cannot add new video or audio chunks after the file has been finalized.");
    }
  };
  class CanvasRecorder {
    constructor(canvas, width, height) {
      __publicField(this, "canvas");
      __publicField(this, "videoEncoder", null);
      __publicField(this, "audioEncoder", null);
      __publicField(this, "muxer", null);
      __publicField(this, "audioTrack", null);
      __publicField(this, "recording", false);
      __publicField(this, "startTime", null);
      __publicField(this, "lastKeyFrame", -Infinity);
      __publicField(this, "activeFrame", 0);
      __publicField(this, "frameRate", 30);
      __publicField(this, "audioProcessor");
      // assigned in start() before use
      __publicField(this, "lastFrame", null);
      __publicField(this, "width", 0);
      __publicField(this, "height", 0);
      this.canvas = canvas;
      this.width = width;
      this.height = height;
    }
    async startRecording(frameRate, bitrate = 1e6) {
      var _a, _b;
      this.frameRate = frameRate;
      if (typeof VideoEncoder === "undefined") {
        throw new Error("VideoEncoder / WebCodecs API not supported.");
      }
      if (typeof AudioEncoder !== "undefined") {
        try {
          const userMedia = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: true,
              channelCount: 1,
              sampleRate: 48e3 * 2
            }
          });
          this.audioTrack = userMedia.getAudioTracks()[0];
        } catch (e) {
          console.warn("Couldn't acquire an audio track.");
        }
      }
      const audioSampleRate = (_a = this.audioTrack) == null ? void 0 : _a.getSettings().sampleRate;
      const audioNumberOfChannels = (_b = this.audioTrack) == null ? void 0 : _b.getSettings().channelCount;
      this.muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: "avc",
          width: this.width,
          height: this.height
          // frameRate: frameRate,
        },
        audio: {
          codec: "aac",
          sampleRate: audioSampleRate,
          numberOfChannels: audioNumberOfChannels
        },
        fastStart: "in-memory",
        firstTimestampBehavior: "offset"
      });
      this.videoEncoder = new VideoEncoder({
        output: (chunk2, meta) => this.muxer.addVideoChunk(chunk2, meta),
        error: console.error
      });
      this.videoEncoder.configure({
        codec: "avc1.42001f",
        width: this.width,
        height: this.height,
        bitrate
      });
      if (this.audioTrack) {
        this.audioEncoder = new AudioEncoder({
          output: (chunk2, meta) => this.muxer.addAudioChunk(chunk2, meta),
          error: (e) => console.error(e)
        });
        if (audioSampleRate && audioNumberOfChannels) {
          this.audioEncoder.configure({
            //codec: 'opus',
            codec: "mp4a.40.2",
            numberOfChannels: audioNumberOfChannels,
            sampleRate: audioSampleRate
            // bitrate: 34000
          });
        } else {
          console.error("Audio sample rate or number of channels is undefined.");
        }
        this.audioProcessor = new MediaStreamTrackProcessor({ track: this.audioTrack });
        const audioEncoder = this.audioEncoder;
        const consumer = new WritableStream({
          write(audioData) {
            audioEncoder.encode(audioData);
            audioData.close();
          }
        });
        this.audioProcessor.readable.pipeTo(consumer);
      }
      this.startTime = document.timeline.currentTime;
      this.recording = true;
      this.lastKeyFrame = -Infinity;
    }
    capture() {
      if (!this.recording || !this.startTime) return;
      if (this.lastFrame !== null) return;
      const elapsedTime = document.timeline.currentTime - this.startTime;
      const frame = new VideoFrame(this.canvas, { timestamp: elapsedTime * 1e3 });
      const needsKeyFrame = elapsedTime - this.lastKeyFrame > 5;
      if (needsKeyFrame) this.lastKeyFrame = elapsedTime;
      this.lastFrame = { frame, needsKeyFrame };
      this.activeFrame++;
    }
    encode() {
      if (!this.recording || !this.startTime) return;
      if (this.lastFrame !== null && this.videoEncoder) {
        if (this.videoEncoder.state === "closed") {
          console.error("Video encoder is closed.");
          return;
        }
        this.videoEncoder.encode(this.lastFrame.frame, { keyFrame: this.lastFrame.needsKeyFrame });
        this.lastFrame.frame.close();
        this.lastFrame = null;
      }
    }
    async stopRecording() {
      var _a, _b, _c;
      try {
        if (this.lastFrame !== null) {
          this.encode();
        }
        this.recording = false;
        await new Promise((resolve) => setTimeout(resolve, 1e3));
        (_a = this.audioTrack) == null ? void 0 : _a.stop();
        await ((_b = this.videoEncoder) == null ? void 0 : _b.flush());
        await ((_c = this.audioEncoder) == null ? void 0 : _c.flush());
        this.muxer.finalize();
        const { buffer } = this.muxer.target;
        this.videoEncoder = null;
        this.audioEncoder = null;
        this.lastFrame = null;
        this.audioTrack = null;
        this.muxer = null;
        this.startTime = null;
        this.lastKeyFrame = -Infinity;
        return {
          success: true,
          url: URL.createObjectURL(new Blob([buffer], { type: "video/mp4" }))
        };
      } catch (e) {
        return {
          success: false,
          error: e.message,
          url: void 0
        };
      }
    }
    downloadBlob(blob) {
      const url2 = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url2;
      a.download = "recording.mp4";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url2);
    }
  }
  class WebGLBlitter {
    constructor() {
      __publicField(this, "fsProgram");
      __publicField(this, "vertBuffer");
      __publicField(this, "textureLocation", null);
      __publicField(this, "positionLocation", null);
      __publicField(this, "gl");
    }
    createProgram() {
      const gl = this.gl;
      if (!gl) {
        console.error("WebGL context is not initialized.");
        return;
      }
      const vertexShaderSource = `
      attribute vec2 position;
      varying vec2 uv;
      void main() {
        uv = (position + 1.0) * 0.5; // Convert from clip space to UV coords
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;
      const fragmentShaderSource = `
      precision mediump float;
      varying vec2 uv;
      uniform sampler2D renderTexture;
      void main() {
        vec4 renderColor = texture2D(renderTexture, uv);
        gl_FragColor = renderColor;
      }
    `;
      const compileShader = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error(gl.getShaderInfoLog(shader));
          return null;
        }
        return shader;
      };
      const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
      const fragmentShader = compileShader(
        gl.FRAGMENT_SHADER,
        fragmentShaderSource
      );
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return;
      }
      this.fsProgram = program;
    }
    createVertBuffer() {
      const gl = this.gl;
      if (!gl) {
        console.error("WebGL context is not initialized.");
        return;
      }
      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      const vertices = new Float32Array([
        -1,
        -1,
        1,
        -1,
        -1,
        1,
        // First triangle
        -1,
        1,
        1,
        -1,
        1,
        1
        // Second triangle
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      this.vertBuffer = vertexBuffer;
    }
    cleanup() {
      const gl = this.gl;
      if (!gl) {
        console.error("WebGL context is not initialized.");
        return;
      }
      if (this.fsProgram !== void 0) {
        this.fsProgram = void 0;
        gl.deleteProgram(this.fsProgram);
      }
      if (this.vertBuffer !== void 0) {
        this.vertBuffer = void 0;
        gl.deleteBuffer(this.vertBuffer);
      }
      this.textureLocation = null;
      this.positionLocation = null;
    }
    init(gl) {
      this.gl = gl;
      this.cleanup();
      this.createProgram();
      this.createVertBuffer();
    }
    blitRTTToCanvas(renderTarget, width, height) {
      const gl = this.gl;
      if (!gl) {
        console.error("WebGL context is not initialized.");
        return;
      }
      const renderTexture = renderTarget.getInternalTexture();
      if (!renderTexture || !renderTexture._hardwareTexture || !renderTexture._hardwareTexture.underlyingResource) {
        console.error("RenderTargetTexture is missing its WebGL texture.");
        return;
      }
      if (!this.fsProgram || !this.vertBuffer) {
        this.init(gl);
        return;
      }
      gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.viewport(0, 0, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(
        0,
        0,
        0,
        1
      );
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
      if (this.positionLocation === null) {
        this.positionLocation = gl.getAttribLocation(this.fsProgram, "position");
      }
      gl.enableVertexAttribArray(this.positionLocation);
      gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.useProgram(this.fsProgram);
      if (!this.textureLocation) {
        this.textureLocation = gl.getUniformLocation(
          this.fsProgram,
          "renderTexture"
        );
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(
        gl.TEXTURE_2D,
        renderTexture._hardwareTexture.underlyingResource
      );
      gl.uniform1i(this.textureLocation, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.finish();
    }
  }
  class MediaRecorderWeb extends MediaRecorderBase {
    constructor() {
      super();
      __publicField(this, "width", 0);
      __publicField(this, "height", 0);
      __publicField(this, "recordingFrameRate", 25);
      __publicField(this, "debugCanvas", false);
      __publicField(this, "previousHardwareScalingLevel", 1);
      // Babylon
      __publicField(this, "scene");
      __publicField(this, "engine");
      __publicField(this, "xr");
      __publicField(this, "recorder");
      // Render Targets
      __publicField(this, "sceneRenderTarget");
      __publicField(this, "cameraRenderTarget");
      __publicField(this, "babylonTextureCopier");
      // Post Processing
      __publicField(this, "postProcessor");
      __publicField(this, "cameraAccess");
      __publicField(this, "renderFrame", this.renderPixels.bind(this));
      // WebGL Blitter
      __publicField(this, "glBlitter", new WebGLBlitter());
      // Debug
      __publicField(this, "divFPS", document.getElementById(
        "fps"
      ));
      // Capture every Nth frame
      __publicField(this, "frameCounter", 0);
      __publicField(this, "recording", false);
      // Optional callback per frame (e.g. subtitles) - when set, composites via 2D canvas before capture. Matches 8th Wall onProcessFrame.
      __publicField(this, "onProcessFrame");
      __publicField(this, "overlayCanvas");
      __publicField(this, "overlayCtx");
      __publicField(this, "setRecordingResolution", () => {
        const canvasSize = new babylonjs.Vector2(screen.availWidth, screen.availHeight);
        let canvasWidth = Math.ceil(canvasSize.x * window.devicePixelRatio);
        let canvasHeight = Math.ceil(canvasSize.y * window.devicePixelRatio);
        const maxSize = { w: 480, h: 640 };
        {
          maxSize.w = 720;
          maxSize.h = 1280;
        }
        const scaleFactor = Math.min(maxSize.w / canvasWidth, maxSize.h / canvasHeight);
        if (scaleFactor < 1) {
          canvasWidth = Math.floor(canvasWidth * scaleFactor);
          canvasHeight = Math.floor(canvasHeight * scaleFactor);
        }
        this.width = canvasWidth & -2;
        this.height = canvasHeight & -2;
      });
      this.setRecordingResolution();
    }
    //---------------------------------------------------------------- init.
    init(scene, xr, options) {
      this.onProcessFrame = options == null ? void 0 : options.onProcessFrame;
      this.initShaders();
      this.scene = scene;
      this.engine = this.scene.getEngine();
      this.xr = xr;
      this.recordingFrameRate = 25;
      this.debugCanvas = false;
      if (this.xr) {
        const baseExperience = this.xr.baseExperience;
        const featuresManager = baseExperience.featuresManager;
        this.cameraAccess = featuresManager.enableFeature(
          babylonjs.WebXRRawCameraAccess,
          "latest"
        );
      }
    }
    //---------------------------------------------------------------- start.
    async start() {
      if (this.recording) {
        return {
          success: false,
          error: "mediarecorder.web.start.error: start called when already recording.",
          url: void 0
        };
      }
      this.initRecording();
      if (!this.engine._renderingCanvas) {
        this.killRecording();
        return {
          success: false,
          error: "mediarecorder.web.start.error: canvas not found.",
          url: void 0
        };
      }
      try {
        await this.recorder.startRecording(this.recordingFrameRate);
        this.recording = true;
      } catch (e) {
        this.killRecording();
        console.error("mediarecorder.web.start.error:", e);
        return {
          success: false,
          error: "mediarecorder.web.start.error: " + e,
          url: void 0
        };
      }
      return {
        success: true,
        error: void 0,
        url: void 0
      };
    }
    //---------------------------------------------------------------- stop.
    async stop() {
      if (!this.recording) {
        return {
          error: "mediarecorder.web.stop.error: stop called without first recording.",
          success: true,
          url: void 0
        };
      }
      this.killRecording();
      this.recording = false;
      const response = await this.recorder.stopRecording();
      return response;
    }
    //---------------------------------------------------------------- private.
    initShaders() {
      babylonjs.Effect.ShadersStore["mediarecorderCompFragmentShader"] = `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform sampler2D cameraSampler;
  
      vec4 alphaBlend(vec4 src, vec4 dst) {
        float final_alpha = src.a + dst.a * (1.0 - src.a);
        float inv_final_alpha = 1.0 / max(final_alpha, 0.00001); // Avoid division by zero using max()
        return vec4((src.rgb * src.a + dst.rgb * dst.a * (1.0 - src.a)) * inv_final_alpha, final_alpha);
      }
  
      void main(void) {
        vec4 colorCamera = texture2D(cameraSampler, vUV);
        vec4 colorRender = texture2D(textureSampler, vUV);
        vec4 colorFinal = alphaBlend(colorRender, colorCamera);
        gl_FragColor = colorFinal;
      }
    `;
    }
    initRecording() {
      var _a, _b, _c;
      this.previousHardwareScalingLevel = ((_b = (_a = this.engine).getHardwareScalingLevel) == null ? void 0 : _b.call(_a)) ?? 1;
      this.engine.setHardwareScalingLevel(1);
      this.engine.setSize(this.width, this.height, false);
      this.engine.setViewport(this.scene.activeCamera.viewport, this.width, this.height);
      const captureCanvas = this.getCaptureCanvas();
      this.recorder = new CanvasRecorder(captureCanvas, this.width, this.height);
      this.glBlitter.init(this.engine._gl);
      this.sceneRenderTarget = new babylonjs.RenderTargetTexture(
        "depth",
        {
          width: this.width,
          height: this.height
        },
        this.scene,
        true
      );
      this.sceneRenderTarget.clearColor = new babylonjs.Color4(0, 0, 0, 0);
      this.sceneRenderTarget.renderList = null;
      this.scene.customRenderTargets.push(this.sceneRenderTarget);
      this.cameraRenderTarget = new babylonjs.RenderTargetTexture(
        "camera",
        {
          width: this.width,
          height: this.height
        },
        null,
        true
      );
      this.postProcessor = new babylonjs.PostProcess(
        "mediarecorderComp",
        // name
        "mediarecorderComp",
        // fragment shader
        null,
        // uniforms
        ["textureSampler", "cameraSampler"],
        // samplers
        1,
        // ratio
        null,
        // camera (null as this is output to offscreen canvas)
        babylonjs.Constants.TEXTURE_NEAREST_SAMPLINGMODE,
        this.engine,
        // engine
        false
        // reusable
      );
      this.postProcessor.onApply = (effect) => {
        if (this.cameraRenderTarget)
          effect.setTexture("cameraSampler", this.cameraRenderTarget);
      };
      this.sceneRenderTarget.addPostProcess(this.postProcessor);
      this.scene.onAfterRenderCameraObservable.add(this.renderFrame);
      this.babylonTextureCopier = new babylonjs.CopyTextureToTexture(this.engine, false);
      if (this.xr) {
        (_c = this.cameraAccess) == null ? void 0 : _c.onTexturesUpdatedObservable.add(
          this.onXRCameraTextureUpdated.bind(this)
        );
      } else {
        console.error("mediarecorder.web.initRecording: xr not found.");
      }
    }
    killRecording() {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      this.glBlitter.cleanup();
      if (this.postProcessor)
        (_a = this.sceneRenderTarget) == null ? void 0 : _a.removePostProcess(this.postProcessor);
      this.scene.customRenderTargets = this.scene.customRenderTargets.filter(
        (rt) => rt !== this.sceneRenderTarget
      );
      this.scene.onAfterRenderCameraObservable.removeCallback(
        this.renderFrame
      );
      (_b = this.sceneRenderTarget) == null ? void 0 : _b.dispose();
      (_c = this.cameraRenderTarget) == null ? void 0 : _c.dispose();
      (_d = this.postProcessor) == null ? void 0 : _d.dispose();
      (_e = this.babylonTextureCopier) == null ? void 0 : _e.dispose();
      (_f = this.cameraAccess) == null ? void 0 : _f.onTexturesUpdatedObservable.clear();
      (_g = this.engine) == null ? void 0 : _g.setHardwareScalingLevel(this.previousHardwareScalingLevel);
      (_h = this.engine) == null ? void 0 : _h.resize();
    }
    // Callback from WebXR when the camera texture is updated
    onXRCameraTextureUpdated(textures) {
      if (this.babylonTextureCopier && this.cameraRenderTarget) {
        const cameraTexture = textures[0];
        this.babylonTextureCopier.copy(cameraTexture, this.cameraRenderTarget);
      }
    }
    getCaptureCanvas() {
      if (this.onProcessFrame) {
        this.overlayCanvas = document.createElement("canvas");
        this.overlayCanvas.width = this.width;
        this.overlayCanvas.height = this.height;
        this.overlayCtx = this.overlayCanvas.getContext("2d");
        return this.overlayCanvas;
      }
      return this.engine.getRenderingCanvas();
    }
    // Render out the pixels to the offscreen canvas
    renderPixels() {
      this.frameCounter++;
      if (this.divFPS)
        this.divFPS.innerText = this.engine.getFps().toFixed(2) + " fps";
      this.glBlitter.blitRTTToCanvas(
        this.sceneRenderTarget,
        this.width,
        this.height
      );
      if (this.onProcessFrame && this.overlayCanvas && this.overlayCtx) {
        const engineCanvas = this.engine.getRenderingCanvas();
        this.overlayCtx.drawImage(engineCanvas, 0, 0, this.width, this.height);
        this.onProcessFrame(this.overlayCtx);
      }
      this.recorder.capture();
      this.recorder.encode();
    }
  }
  class MediaRecorder extends MediaRecorderBase {
    constructor() {
      super();
      __publicField(this, "impl");
      if (IS_EYEJACK_APP) {
        this.impl = new MediaRecorderApp();
      } else {
        this.impl = new MediaRecorderWeb();
      }
    }
    initWeb(scene, xr, options) {
      if (this.impl instanceof MediaRecorderWeb) {
        this.impl.init(scene, xr, options);
      }
    }
    async start() {
      return this.impl.start();
    }
    async stop() {
      return this.impl.stop();
    }
  }
  class BridgeShare extends Bridge {
    constructor() {
      super();
    }
    async share(data) {
      return new Promise((resolve, reject) => {
        const message = {
          uuid: Utils.UUID(),
          type: BridgeMessageTypeShare,
          data
        };
        this.send(message, resolve, reject);
      });
    }
  }
  class ShareBase {
    constructor() {
    }
    async share(_data) {
      return Promise.reject(new Error("share.base.share must be overridden in the subclass"));
    }
  }
  class ShareApp extends ShareBase {
    constructor() {
      super();
      __publicField(this, "bridge");
      this.bridge = new BridgeShare();
    }
    async share(data) {
      return this.bridge.share(data);
    }
  }
  class ShareWeb extends ShareBase {
    constructor() {
      super();
    }
    async share(data) {
      try {
        if (!navigator.share) {
          return { completed: false, error: "Web Share API not available" };
        }
        const title = data.title;
        const text = data.text;
        let url2 = data.url;
        let files = void 0;
        if (url2 && url2.startsWith("blob:")) {
          const response = await fetch(url2);
          if (response.ok) {
            const blob = await response.blob();
            if (blob.type.startsWith("video/")) {
              const videoFile = new File([blob], "video.mp4", { type: blob.type });
              files = [videoFile];
              url2 = void 0;
            }
          }
        }
        await navigator.share({ title, text, url: url2, files });
        return { completed: true };
      } catch (error) {
        if (error instanceof Error) {
          return { completed: false, error: error.message };
        } else {
          return { completed: false, error: String(error) };
        }
      }
    }
  }
  class Share extends ShareBase {
    constructor() {
      super();
      __publicField(this, "impl");
      if (IS_EYEJACK_APP) {
        this.impl = new ShareApp();
      } else {
        this.impl = new ShareWeb();
      }
    }
    async share(data) {
      return this.impl.share(data);
    }
  }
  var ErrorWebXR = /* @__PURE__ */ ((ErrorWebXR2) => {
    ErrorWebXR2["UNDEFINED"] = "UNDEFINED";
    ErrorWebXR2["NOT_SUPPPORTED"] = "NOT_SUPPPORTED";
    ErrorWebXR2["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    ErrorWebXR2["MOTION_PERMISSION_DENIED"] = "MOTION_PERMISSION_DENIED";
    ErrorWebXR2["CAMERA_PERMISSION_DENIED"] = "CAMERA_PERMISSION_DENIED";
    ErrorWebXR2["MIC_PERMISSION_DENIED"] = "MIC_PERMISSION_DENIED";
    return ErrorWebXR2;
  })(ErrorWebXR || {});
  function mitt(all) {
    all = all || /* @__PURE__ */ new Map();
    function emitFunc(type, evt) {
      let handlers = all.get(type);
      if (handlers) {
        handlers.slice().map((handler) => {
          handler(evt);
        });
      }
      handlers = all.get("*");
      if (handlers) {
        handlers.slice().map((handler) => {
          handler(type, evt);
        });
      }
    }
    const bridge = new Bridge();
    if (typeof window !== "undefined" && IS_BABYLON_NATIVE) {
      window.EJ_MESSAGE = (message) => {
        if (message.type === "native/mitt") {
          emitFunc(message.data.type, message.data.evt);
        }
      };
    }
    return {
      /**
       * A Map of event names to registered handler functions.
       */
      all,
      /**
       * Register an event handler for the given type.
       * @param {string|symbol} type Type of event to listen for, or `'*'` for all events
       * @param {Function} handler Function to call in response to given event
       * @memberOf mitt
       */
      on(type, handler) {
        const handlers = all.get(type);
        if (handlers) {
          handlers.push(handler);
        } else {
          all.set(type, [handler]);
        }
      },
      /**
       * Remove an event handler for the given type.
       * If `handler` is omitted, all handlers of the given type are removed.
       * @param {string|symbol} type Type of event to unregister `handler` from (`'*'` to remove a wildcard handler)
       * @param {Function} [handler] Handler function to remove
       * @memberOf mitt
       */
      off(type, handler) {
        const handlers = all.get(type);
        if (handlers) {
          if (handler) {
            handlers.splice(handlers.indexOf(handler) >>> 0, 1);
          } else {
            all.set(type, []);
          }
        }
      },
      /**
       * Invoke all handlers for the given type.
       * If present, `'*'` handlers are invoked after type-matched handlers.
       *
       * Note: Manually firing '*' handlers is not supported.
       *
       * @param {string|symbol} type The event type to invoke
       * @param {Any} [evt] Any value (object is recommended and powerful), passed to each handler
       * @memberOf mitt
       */
      async emit(type, evt) {
        return new Promise((resolve, reject) => {
          if (IS_BABYLON_NATIVE) {
            const message = {
              uuid: Utils.UUID(),
              type: "native/mitt",
              data: {
                type,
                evt
              }
            };
            bridge.send(message, resolve, reject);
          } else {
            emitFunc(type, evt);
            resolve();
          }
        });
      }
    };
  }
  const _EventEmitter = class _EventEmitter {
    constructor() {
      __publicField(this, "emitter");
      this.emitter = mitt();
    }
    static getInstance() {
      if (!_EventEmitter.instance) {
        _EventEmitter.instance = new _EventEmitter();
      }
      return _EventEmitter.instance;
    }
    on(type, handler) {
      this.emitter.on(type, handler);
    }
    off(type, handler) {
      this.emitter.off(type, handler);
    }
    emit(type, event) {
      this.emitter.emit(type, event);
    }
  };
  __publicField(_EventEmitter, "instance");
  let EventEmitter = _EventEmitter;
  const emitter = EventEmitter.getInstance();
  class AppBase {
    constructor() {
      emitter.on("load", this.loadEvent.bind(this));
      emitter.on("xr-start", this.startXREvent.bind(this));
      emitter.on("xr-stop", this.stopXREvent.bind(this));
      emitter.on("record-start", this.recordStartEvent.bind(this));
      emitter.on("record-stop", this.recordStopEvent.bind(this));
      emitter.on("share", this.shareEvent.bind(this));
      emitter.on("localize", this.localizeEvent.bind(this));
    }
    dispose() {
      emitter.off("load", this.loadEvent.bind(this));
      emitter.off("xr-start", this.startXREvent.bind(this));
      emitter.off("xr-stop", this.stopXREvent.bind(this));
      emitter.off("record-start", this.recordStartEvent.bind(this));
      emitter.off("record-stop", this.recordStopEvent.bind(this));
      emitter.off("share", this.shareEvent.bind(this));
      emitter.off("localize", this.localizeEvent.bind(this));
    }
    //---------------------------------------------------------------- 
    init() {
      this.initialize();
      emitter.emit("initialized");
    }
    initialize() {
    }
    //---------------------------------------------------------------- 
    async loadAsync() {
      return Promise.reject(new Error("app.base.loadAsync must be overridden in the subclass"));
    }
    async loadEvent() {
      await this.loadAsync();
      emitter.emit("loaded");
    }
    //---------------------------------------------------------------- 
    async startXR() {
      return Promise.reject(new Error("app.base.startXR must be overridden in the subclass"));
    }
    async startXREvent() {
      try {
        await this.startXR();
        emitter.emit("xr-started");
      } catch (e) {
        const error = e;
        if (error.name === ErrorWebXR.UNDEFINED) {
          emitter.emit("xr-error-undefined");
        } else if (error.name === ErrorWebXR.NOT_SUPPPORTED) {
          emitter.emit("xr-error-not-supported");
        } else if (error.name === ErrorWebXR.PERMISSION_DENIED) {
          emitter.emit("xr-error-permission-denied");
        } else if (error.name === ErrorWebXR.MOTION_PERMISSION_DENIED) {
          emitter.emit("xr-error-permission-denied", { type: "motion" });
        } else if (error.name === ErrorWebXR.CAMERA_PERMISSION_DENIED) {
          emitter.emit("xr-error-permission-denied", { type: "camera" });
        } else if (error.name === ErrorWebXR.MIC_PERMISSION_DENIED) {
          emitter.emit("xr-error-permission-denied", { type: "mic" });
        }
      }
    }
    //---------------------------------------------------------------- 
    async stopXR() {
      return Promise.reject(new Error("app.base.stopXR must be overridden in the subclass"));
    }
    async stopXREvent() {
      await this.stopXR();
      emitter.emit("xr-stopped");
    }
    //---------------------------------------------------------------- 
    async exitXREvent() {
      emitter.emit("xr-exited");
    }
    //---------------------------------------------------------------- 
    async recordStartAsync() {
      return Promise.reject(new Error("app.base.recordStartAsync must be overridden in the subclass"));
    }
    async recordStartEvent() {
      try {
        const result = await this.recordStartAsync();
        emitter.emit("record-started", result);
      } catch (error) {
        emitter.emit("record-started", error);
      }
    }
    //---------------------------------------------------------------- 
    async recordStopAsync() {
      return Promise.reject(new Error("app.base.recordStopAsync must be overridden in the subclass"));
    }
    async recordStopEvent() {
      try {
        const result = await this.recordStopAsync();
        emitter.emit("record-stopped", result);
      } catch (error) {
        emitter.emit("record-stopped", error);
      }
    }
    //----------------------------------------------------------------
    async shareAsync(_shareData) {
      return Promise.reject(new Error("app.base.shareAsync must be overridden in the subclass"));
    }
    async shareEvent(shareData) {
      try {
        const result = await this.shareAsync(shareData);
        emitter.emit("shared", result);
      } catch (error) {
        emitter.emit("shared", error);
      }
    }
    //---------------------------------------------------------------- 
    async localizeAsync() {
      return Promise.reject(new Error("app.base.localizeAsync must be overridden in the subclass"));
    }
    async localizeEvent() {
      try {
        const result = await this.localizeAsync();
        emitter.emit("localized", result);
      } catch (error) {
        emitter.emit("localized", error);
      }
    }
    //----------------------------------------------------------------
    analyticsEvent(event) {
      emitter.emit("analytics", event);
    }
  }
  class AppBabylon extends AppBase {
    constructor(renderCanvas) {
      super();
      __publicField(this, "renderCanvas");
      __publicField(this, "engine");
      __publicField(this, "scene");
      __publicField(this, "camera");
      __publicField(this, "rootNode");
      __publicField(this, "renderTarget");
      __publicField(this, "fullscreenQuad");
      __publicField(this, "mediaRecorder");
      __publicField(this, "share");
      __publicField(this, "timeLast", 0);
      __publicField(this, "timeDelta", 0);
      this.renderCanvas = renderCanvas;
    }
    initialize() {
      this.initEngine();
      this.initScene();
      this.initCamera();
      this.initRootNode();
      this.initMediaRecorder();
      this.initShare();
      this.initCallbacks();
    }
    initEngine() {
      if (IS_BABYLON_NATIVE_JSCORE) {
        this.engine = new babylonjs.NativeEngine();
      } else {
        if (this.renderCanvas) {
          this.engine = new babylonjs.Engine(this.renderCanvas, true);
        } else {
          console.error("AppBabylon.initEngine - renderCanvas is not defined");
        }
      }
    }
    initScene() {
      this.scene = new babylonjs.Scene(this.engine);
      this.scene.useRightHandedSystem = true;
      this.scene.clearColor = new babylonjs.Color4(0, 0, 0, 0);
    }
    initCamera() {
      this.scene.createDefaultCamera(true, true, true);
      this.camera = this.scene.activeCamera;
      this.camera.position.set(0, 0, 0);
    }
    initRootNode() {
      this.rootNode = new babylonjs.TransformNode("modelNode", this.scene);
    }
    initRenderTarget() {
      this.renderTarget = new babylonjs.RenderTargetTexture(
        "renderTarget",
        {
          width: this.engine.getRenderWidth(),
          height: this.engine.getRenderHeight()
        },
        this.scene,
        false
      );
      this.renderTarget.renderList = [];
      this.scene.meshes.forEach((mesh) => {
        if (mesh instanceof babylonjs.AbstractMesh) {
          this.renderTarget.renderList.push(mesh);
        }
      });
      this.scene.onNewMeshAddedObservable.add((mesh) => {
        if (mesh instanceof babylonjs.AbstractMesh) {
          this.renderTarget.renderList.push(mesh);
        }
      });
      this.scene.customRenderTargets.push(this.renderTarget);
    }
    initFullScreenQuad() {
      babylonjs.Effect.ShadersStore["fullscreenVertexShader"] = `
      precision highp float;

      // Attributes
      attribute vec2 position;

      // Varyings
      varying vec2 vUV;

      void main(void) {
        // Calculate UV
        vUV = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;
      babylonjs.Effect.ShadersStore["fullscreenFragmentShader"] = `
    precision highp float;

    // Varying
    varying vec2 vUV;
    uniform sampler2D textureSampler;

    void main(void) {
        vec4 col = texture2D(textureSampler, vUV);
        gl_FragColor = col;
    }
    `;
      const shaderMat = new babylonjs.ShaderMaterial(
        "shader",
        this.scene,
        {
          vertex: "fullscreen",
          fragment: "fullscreen"
        },
        {
          attributes: ["position"],
          uniforms: ["world", "view", "projection", "fov", "aspect", "nearPlane"]
        }
      );
      const positions = [
        -1,
        -1,
        0,
        // Bottom-left
        1,
        -1,
        0,
        // Bottom-right
        1,
        1,
        0,
        // Top-right
        -1,
        1,
        0
        // Top-left
      ];
      const indices = [
        0,
        1,
        2,
        // First triangle
        0,
        2,
        3
        // Second triangle
      ];
      const uvs = [
        0,
        0,
        // Bottom-left
        1,
        0,
        // Bottom-right
        1,
        1,
        // Top-right
        0,
        1
        // Top-left
      ];
      this.fullscreenQuad = new babylonjs.Mesh("fullscreenQuad", this.scene);
      this.fullscreenQuad.renderingGroupId = 3;
      this.fullscreenQuad.alwaysSelectAsActiveMesh = true;
      this.fullscreenQuad.isPickable = false;
      shaderMat.backFaceCulling = false;
      shaderMat.zOffset = -100;
      shaderMat.disableDepthWrite = true;
      if (this.renderTarget) {
        shaderMat.setTexture("textureSampler", this.renderTarget);
      }
      this.fullscreenQuad.material = shaderMat;
      const vertexData = new babylonjs.VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.uvs = uvs;
      vertexData.applyToMesh(this.fullscreenQuad);
    }
    initMediaRecorder() {
      this.mediaRecorder = new MediaRecorder();
    }
    initShare() {
      this.share = new Share();
    }
    initCallbacks() {
      this.engine.runRenderLoop(this.renderCallback.bind(this));
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("resize", this.resizeCallback.bind(this));
      }
    }
    renderCallback() {
      const now = performance.now() / 1e3;
      if (this.timeLast === 0) {
        this.timeLast = now;
      }
      this.timeDelta = now - this.timeLast;
      this.timeLast = now;
      this.render();
      this.scene.render();
    }
    resizeCallback() {
      this.engine.resize();
      this.resize();
    }
    render() {
    }
    resize() {
    }
    //----------------------------------------------------------------
    recordStartAsync() {
      if (!this.mediaRecorder) {
        return Promise.reject(
          new Error("app.babylon - MediaRecorder is not initialized")
        );
      }
      return this.mediaRecorder.start();
    }
    recordStopAsync() {
      if (!this.mediaRecorder) {
        return Promise.reject(
          new Error("app.babylon - MediaRecorder is not initialized")
        );
      }
      return this.mediaRecorder.stop();
    }
    //----------------------------------------------------------------
    shareAsync(shareData) {
      if (!this.share) {
        return Promise.reject(
          new Error("app.babylon - Share is not initialized")
        );
      }
      return this.share.share(shareData);
    }
  }
  class AppContentConfig {
    constructor() {
      __publicField(this, "loadBatchSize");
    }
  }
  class AppContent extends AppBabylon {
    //----------------------------------------------------------------
    constructor(renderCanvas) {
      super(renderCanvas);
      __publicField(this, "contentConfig", new AppContentConfig());
      __publicField(this, "batch", new AssetBatch({
        getScene: () => this.scene,
        getRootNode: () => this.rootNode,
        getBatchSize: () => this.contentConfig.loadBatchSize,
        onAssetLoadComplete: (asset) => this.loadAssetComplete(asset)
      }));
      // active runnable content (replaced/torn down via setContent/clearContent).
      __publicField(this, "content");
    }
    setConfigContent(contentConfig) {
      this.contentConfig = contentConfig;
    }
    //----------------------------------------------------------------
    // content runner. setContent swaps in a ContentBase instance (init receives
    // the app's scene/camera/rootNode); the app's render/resize/dispose hooks
    // drive its lifecycle. content owns its own teardown via dispose(). the app
    // owns scene.render(), so content.render() is a per-frame update (not a draw).
    async setContent(content) {
      this.clearContent();
      this.content = content;
      await content.init(this.engine, this.scene, this.camera, this.rootNode);
    }
    clearContent() {
      var _a;
      (_a = this.content) == null ? void 0 : _a.dispose();
      this.content = void 0;
    }
    //----------------------------------------------------------------
    render() {
      var _a;
      super.render();
      (_a = this.content) == null ? void 0 : _a.render(this.timeDelta);
    }
    resize() {
      var _a;
      super.resize();
      (_a = this.content) == null ? void 0 : _a.resize();
    }
    dispose() {
      this.clearContent();
      super.dispose();
    }
    //----------------------------------------------------------------
    // asset batching.
    // this is legacy code that will be removed in the future.
    // loading can now be done by individual loader functions.
    get assets() {
      return this.batch.assets;
    }
    get assetsLoading() {
      return this.batch.assetsLoading;
    }
    //----------------------------------------------------------------
    async loadContents(assetsToLoad) {
      await this.batch.loadContents(assetsToLoad);
    }
    unloadContents(assetsToUnload) {
      this.batch.unloadContents(assetsToUnload);
    }
    //----------------------------------------------------------------
    async loadAssets(assetsToLoad) {
      await this.batch.loadAssets(assetsToLoad);
    }
    async loadAsset(assetToLoad) {
      await this.batch.loadAsset(assetToLoad);
    }
    loadAssetComplete(_asset) {
    }
    //----------------------------------------------------------------
    unloadAssets(assetsToUnload) {
      this.batch.unloadAssets(assetsToUnload);
    }
    unloadAsset(assetToUnload) {
      this.batch.unloadAsset(assetToUnload);
    }
  }
  const BASE_URL = "https://api.immersal.com/";
  const DOWNLOAD_MAP = "map";
  const DOWNLOAD_SPARSE = "sparse";
  const DOWNLOAD_DENSE = "dense";
  const DOWNLOAD_TEXTURED = "tex";
  const ImmersalSparseMapIdPrefix = "immersalSparseMap";
  const ImmersalDenseMapIdPrefix = "immersalDenseMap";
  const ImmersalTexturedMapIdPrefix = "immersalTexturedMap";
  function ImmersalSparseMapId(mapId) {
    return `${ImmersalSparseMapIdPrefix}-${mapId}`;
  }
  function ImmersalDenseMapId(mapId) {
    return `${ImmersalDenseMapIdPrefix}-${mapId}`;
  }
  function ImmersalTexturedMapId(mapId) {
    return `${ImmersalTexturedMapIdPrefix}-${mapId}`;
  }
  class AppImmersalMapConfig {
    constructor(config) {
      __publicField(this, "mapId", -1);
      __publicField(this, "loadSparseMap", false);
      __publicField(this, "loadDenseMap", false);
      __publicField(this, "loadTexturedMesh", false);
      __publicField(this, "binaryMapPath");
      // optional, used to load assets locally instead of immersal servers.
      __publicField(this, "sparseMapPath");
      // optional, used to load assets locally instead of immersal servers.
      __publicField(this, "denseMapPath");
      // optional, used to load assets locally instead of immersal servers.
      __publicField(this, "texturedMapPath");
      // optional, used to load assets locally instead of immersal servers.
      __publicField(this, "pointCloudSize", 10);
      // default.
      __publicField(this, "pointCloudColor");
      __publicField(this, "position");
      __publicField(this, "rotation");
      __publicField(this, "matrix");
      this.mapId = config.mapId;
      this.loadSparseMap = config.loadSparseMap ?? this.loadSparseMap;
      this.loadDenseMap = config.loadDenseMap ?? this.loadDenseMap;
      this.loadTexturedMesh = config.loadTexturedMesh ?? this.loadTexturedMesh;
      this.binaryMapPath = config.binaryMapPath ?? this.binaryMapPath;
      this.sparseMapPath = config.sparseMapPath ?? this.sparseMapPath;
      this.denseMapPath = config.denseMapPath ?? this.denseMapPath;
      this.texturedMapPath = config.texturedMapPath ?? this.texturedMapPath;
      this.pointCloudSize = config.pointCloudSize ?? this.pointCloudSize;
      this.pointCloudColor = config.pointCloudColor ?? this.pointCloudColor;
      this.position = config.position ?? this.position;
      this.rotation = config.rotation ?? this.rotation;
      if (this.position && this.rotation) {
        this.matrix = babylonjs.Matrix.Compose(
          new babylonjs.Vector3(1, 1, 1),
          babylonjs.Quaternion.FromEulerAngles(this.rotation[0], this.rotation[1], this.rotation[2]),
          new babylonjs.Vector3(this.position[0], this.position[1], this.position[2])
        );
      }
    }
  }
  class AppImmersalConfig {
    constructor(config) {
      __publicField(this, "token", "");
      __publicField(this, "localizeOnDevice", false);
      __publicField(this, "usePoseProcessor", false);
      // optional, used to process poses.
      __publicField(this, "poseRotationConstraints");
      __publicField(this, "maps", []);
      this.token = config.token;
      this.localizeOnDevice = config.localizeOnDevice ?? this.localizeOnDevice;
      this.usePoseProcessor = config.usePoseProcessor ?? this.usePoseProcessor;
      for (const mapConfig of config.maps ?? []) {
        const map = new AppImmersalMapConfig(mapConfig);
        const pathSuffix = "?token=" + this.token + "&id=" + map.mapId;
        map.binaryMapPath = map.binaryMapPath ?? BASE_URL + DOWNLOAD_MAP + pathSuffix;
        map.sparseMapPath = map.sparseMapPath ?? BASE_URL + DOWNLOAD_SPARSE + pathSuffix;
        map.denseMapPath = map.denseMapPath ?? BASE_URL + DOWNLOAD_DENSE + pathSuffix;
        map.texturedMapPath = map.texturedMapPath ?? BASE_URL + DOWNLOAD_TEXTURED + pathSuffix;
        this.maps.push(map);
      }
    }
  }
  class AppImmersal extends AppContent {
    constructor(renderCanvas) {
      super(renderCanvas);
      __publicField(this, "immersalImpl");
      __publicField(this, "localizing", false);
      __publicField(this, "immersalConfig");
      __publicField(this, "pose", new Pose());
      __publicField(this, "cameraMat");
      __publicField(this, "bridge");
      __publicField(this, "transformContent", (immersalMat, mapMat) => {
        let mat = void 0;
        if (mapMat) {
          mat = mapMat.invert().multiply(immersalMat.invert()).multiply(this.cameraMat);
        } else {
          mat = immersalMat.invert().multiply(this.cameraMat);
        }
        this.pose.setMatrix(mat);
      });
    }
    setConfigImmersal(immersalConfig) {
      this.immersalConfig = immersalConfig;
    }
    initialize() {
      super.initialize();
      this.cameraMat = new babylonjs.Matrix();
      if (!this.immersalConfig) {
        console.error("app.immersal.initialize error: immersalConfig is undefined");
        return;
      }
      const mapIds = this.immersalConfig.maps.map((mapConfig) => {
        return mapConfig.mapId;
      });
      if (IS_BABYLON_NATIVE_JSCORE) {
        if (this.immersalConfig.localizeOnDevice) {
          this.immersalImpl = new ImmersalWebDevice(this.immersalConfig.token, mapIds);
        } else {
          this.immersalImpl = new ImmersalWebCloud(this.immersalConfig.token, mapIds);
        }
      } else if (IS_EYEJACK_APP) {
        if (this.immersalConfig.localizeOnDevice) {
          this.immersalImpl = new ImmersalAppDevice(this.immersalConfig.token, mapIds);
        } else {
          this.immersalImpl = new ImmersalAppCloud(this.immersalConfig.token, mapIds);
        }
      } else {
        if (this.immersalConfig.localizeOnDevice) {
          this.immersalImpl = new ImmersalWebDevice(this.immersalConfig.token, mapIds);
        } else {
          this.immersalImpl = new ImmersalWebCloud(this.immersalConfig.token, mapIds);
        }
      }
      if (this.immersalConfig.usePoseProcessor) {
        this.pose.enablePoseFilter();
        this.pose.enablePoseSmooth();
        if (this.immersalConfig.poseRotationConstraints) {
          this.pose.setRotationConstraints(this.immersalConfig.poseRotationConstraints);
        }
      }
    }
    async loadAsync() {
      const promises = [
        this.loadImmersalBinaryMaps(),
        this.loadImmersalSparseMaps(),
        this.loadImmersalDenseMaps(),
        this.loadImmersalTexturedMaps()
      ];
      await Promise.all(promises);
    }
    async loadImmersalBinaryMaps() {
      await this.immersalImpl.init();
      const maps = this.immersalConfig.maps.slice(0, 1);
      for (const mapConfig of maps) {
        await this.immersalImpl.loadMap(mapConfig.binaryMapPath);
      }
    }
    async loadImmersalSparseMaps() {
      var _a;
      for (const mapConfig of ((_a = this.immersalConfig) == null ? void 0 : _a.maps) ?? []) {
        if (!mapConfig.loadSparseMap || !mapConfig.sparseMapPath) {
          continue;
        }
        const asset = {
          id: ImmersalSparseMapId(mapConfig.mapId),
          type: "pointcloud",
          path: mapConfig.sparseMapPath,
          size: mapConfig.pointCloudSize,
          color: mapConfig.pointCloudColor
        };
        await this.loadAsset(asset);
      }
    }
    async loadImmersalDenseMaps() {
      var _a;
      for (const mapConfig of ((_a = this.immersalConfig) == null ? void 0 : _a.maps) ?? []) {
        if (!mapConfig.loadDenseMap || !mapConfig.denseMapPath) {
          continue;
        }
        const asset = {
          id: ImmersalDenseMapId(mapConfig.mapId),
          type: "pointcloud",
          path: mapConfig.denseMapPath,
          size: mapConfig.pointCloudSize,
          color: mapConfig.pointCloudColor
        };
        await this.loadAsset(asset);
      }
    }
    async loadImmersalTexturedMaps() {
      var _a;
      for (const mapConfig of ((_a = this.immersalConfig) == null ? void 0 : _a.maps) ?? []) {
        if (!mapConfig.loadTexturedMesh || !mapConfig.texturedMapPath) {
          continue;
        }
        const asset = {
          id: ImmersalTexturedMapId(mapConfig.mapId),
          type: "model",
          path: mapConfig.texturedMapPath,
          extension: ".glb"
          // Immersal tex endpoint has no file extension; force Babylon glTF loader.
        };
        await this.loadAsset(asset);
      }
    }
    loadAssetComplete(asset) {
      var _a;
      if (!asset.id) {
        return;
      }
      const isImmersalSparseMap = asset.id.startsWith(ImmersalSparseMapIdPrefix);
      const isImmersalDenseMap = asset.id.startsWith(ImmersalDenseMapIdPrefix);
      const isImmersalTexturedMap = asset.id.startsWith(ImmersalTexturedMapIdPrefix);
      const isImmersalAsset = isImmersalSparseMap || isImmersalDenseMap || isImmersalTexturedMap;
      let mapMat = void 0;
      if (isImmersalAsset) {
        const mapIdStr = asset.id.split("-")[1];
        const mapId = mapIdStr ? parseInt(mapIdStr) : -1;
        const mapConfig = (_a = this.immersalConfig) == null ? void 0 : _a.maps.find((mapConfig2) => mapConfig2.mapId === mapId);
        if (mapConfig && mapConfig.matrix) {
          mapMat = mapConfig.matrix;
        }
      }
      if (isImmersalSparseMap || isImmersalDenseMap) {
        const assetPointCloud = asset;
        if (assetPointCloud.mesh && mapMat) {
          this.transformImmersalMesh(assetPointCloud.mesh, mapMat);
        }
      } else if (isImmersalTexturedMap) {
        const assetModel = asset;
        if (assetModel.meshRoot && mapMat) {
          this.transformImmersalMesh(assetModel.meshRoot, mapMat);
        }
        for (const abstractMesh of assetModel.meshes ?? []) {
          const mesh = abstractMesh;
          if (mesh.material && mesh.material instanceof babylonjs.PBRMaterial) {
            const pbrMaterial = mesh.material;
            pbrMaterial.unlit = true;
          }
        }
      }
    }
    transformImmersalMesh(mesh, matrix) {
      if (!mesh.rotationQuaternion) {
        mesh.rotationQuaternion = new babylonjs.Quaternion();
      }
      matrix.decompose(mesh.scaling, mesh.rotationQuaternion, mesh.position);
    }
    render() {
      super.render();
      this.pose.update(this.timeDelta);
      const mat = this.pose.getMatrix();
      mat.decomposeToTransformNode(this.rootNode);
    }
    async localize(imageData, imageWidth, imageHeight, intrinsics) {
      return new Promise((resolve, reject) => {
        if (this.localizing) {
          reject(new Error("AppImmersal.localize: already localizing."));
          return;
        }
        this.immersalImpl.localize(imageData, imageWidth, imageHeight, intrinsics).then((res) => {
          this.localizing = false;
          if (res.success) {
            const immersalMat = babylonjs.Matrix.FromArray(res.matrix);
            let mapMat = void 0;
            const mapConfig = this.immersalConfig.maps.find((mapConfig2) => mapConfig2.mapId === res.map);
            if (mapConfig && mapConfig.matrix) {
              mapMat = mapConfig.matrix.clone();
            }
            this.transformContent(immersalMat, mapMat);
          }
          resolve(res);
        }).catch((err2) => {
          this.localizing = false;
          reject(err2);
        });
      });
    }
  }
  const ua = typeof window !== "undefined" ? window.navigator.userAgent : "";
  function isWebXRCameraAccessBroken() {
    if (!ua.includes("Android") || !ua.includes("Chrome/")) return false;
    const match = ua.match(/Chrome\/(\d+)/);
    if (!match) return false;
    const major = parseInt(match[1], 10);
    return major >= 147 && major <= 148;
  }
  let _applied = false;
  function applyWebXRCameraAccessFix() {
    var _a;
    if (_applied) return;
    _applied = true;
    if (!isWebXRCameraAccessBroken()) return;
    console.warn(
      "[WebXR] Applying Chrome 147-148 camera-access crash workaround (crbug.com/507508099). Fixed in Chrome 149+."
    );
    const xrWebGLBindingCtor = globalThis.XRWebGLBinding;
    const xrRenderStateCtor = globalThis.XRRenderState;
    const xrSessionCtor = globalThis.XRSession;
    if (xrWebGLBindingCtor == null ? void 0 : xrWebGLBindingCtor.prototype) {
      try {
        delete xrWebGLBindingCtor.prototype.createProjectionLayer;
      } catch (_e) {
      }
    }
    if (xrRenderStateCtor == null ? void 0 : xrRenderStateCtor.prototype) {
      try {
        delete xrRenderStateCtor.prototype.layers;
      } catch (_e) {
      }
    }
    if ((_a = xrSessionCtor == null ? void 0 : xrSessionCtor.prototype) == null ? void 0 : _a.updateRenderState) {
      const originalUpdateRenderState = xrSessionCtor.prototype.updateRenderState;
      let lastBaseLayer;
      xrSessionCtor.prototype.updateRenderState = function(state) {
        const next = { ...state ?? {} };
        if (next.baseLayer !== void 0) {
          lastBaseLayer = next.baseLayer ?? void 0;
        } else if (lastBaseLayer) {
          next.baseLayer = lastBaseLayer;
        }
        return originalUpdateRenderState.call(this, next);
      };
    }
  }
  class XRModuleBase {
    constructor(xr) {
      __publicField(this, "xr");
      this.xr = xr;
    }
  }
  class XRModuleSessionOptions {
    constructor() {
      __publicField(this, "domOverlayElement");
      __publicField(this, "domOverlayElementName");
      __publicField(this, "disableDefaultUI", false);
      __publicField(this, "enableHitTest", true);
      __publicField(this, "enableCameraAccess", true);
      __publicField(this, "arkitFeatures", []);
      __publicField(this, "onEnteringXR");
      __publicField(this, "onExitingXR");
      __publicField(this, "onInXR");
      __publicField(this, "onNotInXR");
      __publicField(this, "onError");
    }
    get enableDomOverlay() {
      const enableDomOverlay = this.domOverlayElement !== void 0 || this.domOverlayElementName !== void 0;
      return enableDomOverlay;
    }
    get requiredFeatures() {
      const requiredFeatures = [];
      if (this.enableDomOverlay) requiredFeatures.push("dom-overlay");
      return requiredFeatures;
    }
    get optionalFeatures() {
      const optionalFeatures = [
        ...this.enableHitTest ? ["hit-test"] : [],
        ...this.enableCameraAccess ? ["camera-access"] : [],
        ...this.arkitFeatures
      ];
      return optionalFeatures;
    }
  }
  class XRModuleSession extends XRModuleBase {
    constructor() {
      super();
      __publicField(this, "options");
      this.options = new XRModuleSessionOptions();
    }
    dispose() {
      this.clearXRStateChangedObservable();
    }
    async init(scene, options) {
      if (this.xr) {
        return this.xr;
      }
      if (options) {
        this.options = options;
      }
      applyWebXRCameraAccessFix();
      if (this.options.disableDefaultUI) {
        await this.initWithCustomUI(scene);
      } else {
        await this.initWithDefaultUI(scene);
      }
      this.addXRStateChangedObservable();
      return this.xr;
    }
    async initWithDefaultUI(scene) {
      try {
        const requiredFeatures = this.options.requiredFeatures;
        const optionalFeatures = this.options.optionalFeatures;
        this.xr = await scene.createDefaultXRExperienceAsync({
          uiOptions: {
            sessionMode: "immersive-ar",
            referenceSpaceType: "local",
            onError: this.options.onError,
            requiredFeatures,
            optionalFeatures
          }
        });
        if (this.options.enableDomOverlay) {
          if (this.xr.baseExperience) {
            const { featuresManager } = this.xr.baseExperience;
            featuresManager.enableFeature(babylonjs.WebXRDomOverlay, "latest", {
              element: this.options.domOverlayElementName
            });
          }
        }
      } catch (error) {
        console.error(error);
      }
    }
    async initWithCustomUI(scene) {
      this.xr = await scene.createDefaultXRExperienceAsync({
        disableDefaultUI: this.options.disableDefaultUI
      });
      const isSupported = await this.xr.baseExperience.sessionManager.isSessionSupportedAsync("immersive-ar");
      if (!isSupported) {
        const error = new Error("app.immersal.webxr.startXR: immersive-ar is not supported.");
        error.name = ErrorWebXR.NOT_SUPPPORTED;
        throw error;
      }
    }
    async startXR() {
      if (!this.xr) {
        return;
      }
      const sessionMode = "immersive-ar";
      const referenceSpaceLocal = IS_BABYLON_NATIVE_JSCORE ? "unbounded" : "local";
      const renderTarget = this.xr.renderTarget;
      let domOverlay = void 0;
      if (this.options.domOverlayElement) {
        domOverlay = { root: this.options.domOverlayElement };
      }
      const sessionCreationOptions = {
        requiredFeatures: this.options.requiredFeatures,
        optionalFeatures: this.options.optionalFeatures,
        domOverlay
      };
      try {
        await this.xr.baseExperience.enterXRAsync(sessionMode, referenceSpaceLocal, renderTarget, sessionCreationOptions);
      } catch (e) {
        let permissionDenied = false;
        if (e instanceof DOMException) {
          const domE = e;
          permissionDenied = domE.name === "NotSupportedError";
        }
        if (permissionDenied) {
          const error = new Error("app.immersal.webxr.startXR: permission denied.");
          error.name = ErrorWebXR.PERMISSION_DENIED;
          throw error;
        } else {
          const error = new Error("app.immersal.webxr.startXR: undefined.");
          error.name = ErrorWebXR.UNDEFINED;
          throw error;
        }
      }
    }
    async stopXR() {
      if (!this.xr) {
        return;
      }
      await this.xr.baseExperience.exitXRAsync();
    }
    get isXRRunning() {
      var _a, _b, _c;
      const xrRunning = !!((_c = (_b = (_a = this.xr) == null ? void 0 : _a.baseExperience) == null ? void 0 : _b.sessionManager) == null ? void 0 : _c.inXRSession);
      return xrRunning;
    }
    addXRStateChangedObservable() {
      if (!this.xr) {
        return;
      }
      this.xr.baseExperience.onStateChangedObservable.add((state) => {
        if (state === babylonjs.WebXRState.ENTERING_XR) {
          if (this.options.onEnteringXR) {
            this.options.onEnteringXR();
          }
        } else if (state === babylonjs.WebXRState.EXITING_XR) {
          if (this.options.onExitingXR) {
            this.options.onExitingXR();
          }
        } else if (state === babylonjs.WebXRState.IN_XR) {
          if (this.options.onInXR) {
            this.options.onInXR();
          }
        } else if (state === babylonjs.WebXRState.NOT_IN_XR) {
          if (this.options.onNotInXR) {
            this.options.onNotInXR();
          }
        }
      });
    }
    clearXRStateChangedObservable() {
      if (!this.xr) {
        return;
      }
      this.xr.baseExperience.onStateChangedObservable.clear();
    }
  }
  class XRModuleHitTest extends XRModuleBase {
    constructor(xr) {
      super(xr);
      __publicField(this, "hitTests", []);
    }
    // rayOrigin uses (NDC) Normalized Device Coordinates
    // rayOrigin coordinate range is x:[-1,1], y:[-1,1], z:[0]
    // rayOrigin is at center of screen by default
    // rayDirection points forward in view space
    async initHitTest(rayOrigin = { x: 0, y: 0, z: 0 }, rayDirection = { x: 0, y: 0, z: -1 }) {
      try {
        if (!this.xr) {
          throw new Error("app.webxr.hitTestUpdate: no xr.");
        }
        const xrSessionManager = this.xr.baseExperience.sessionManager;
        if (!xrSessionManager.inXRSession) {
          throw new Error("app.webxr.hitTestUpdate: not in XR session.");
        }
        const session = xrSessionManager.session;
        if (!session) {
          throw new Error("app.webxr.hitTestUpdate: no session.");
        }
        const hitTestSupported = session.enabledFeatures ? session.enabledFeatures.includes("hit-test") : true;
        if (!hitTestSupported) {
          throw new Error("app.webxr.hitTestUpdate: hit test not supported.");
        }
        if (!session.requestHitTestSource) {
          throw new Error("app.webxr.hitTestUpdate: no requestHitTestSource.");
        }
        const referenceSpaceViewer = await session.requestReferenceSpace("viewer");
        const hitTestSourceOptions = {
          space: referenceSpaceViewer,
          offsetRay: new XRRay(rayOrigin, rayDirection)
        };
        const source = await session.requestHitTestSource(hitTestSourceOptions);
        const hitTest = {
          uuid: Utils.UUID(),
          source,
          matrix: new babylonjs.Matrix(),
          position: new babylonjs.Vector3(0, 0, 0),
          rotation: new babylonjs.Quaternion(0, 0, 0, 1),
          scale: new babylonjs.Vector3(1, 1, 1),
          timestamp: 0
        };
        this.hitTests.push(hitTest);
        return hitTest.uuid;
      } catch (error) {
        console.error(error);
      }
    }
    getHitTest(uuid) {
      const hitTest = this.hitTests.find((hitTest2) => hitTest2.uuid === uuid);
      if (hitTest === void 0) return;
      return hitTest;
    }
    killHitTest(uuid) {
      const hitTestIndex = this.hitTests.findIndex((hitTest2) => hitTest2.uuid === uuid);
      if (hitTestIndex === -1) {
        return;
      }
      const hitTest = this.hitTests[hitTestIndex];
      hitTest.source.cancel();
      this.hitTests.splice(hitTestIndex, 1);
    }
    killAllHitTests() {
      for (const hitTest of this.hitTests) {
        hitTest.source.cancel();
      }
      this.hitTests = [];
    }
    updateHitTests() {
      if (this.hitTests.length === 0) {
        return;
      }
      try {
        if (!this.xr) {
          throw new Error("app.webxr.hitTestUpdate: no xr.");
        }
        const xrSessionManager = this.xr.baseExperience.sessionManager;
        if (!xrSessionManager.inXRSession) {
          throw new Error("app.webxr.hitTestUpdate: not in XR session.");
        }
        const session = xrSessionManager.session;
        if (!session) {
          throw new Error("app.webxr.hitTestUpdate: no session.");
        }
        const frame = xrSessionManager.currentFrame;
        if (!frame) {
          throw new Error("app.webxr.hitTestUpdate: no frame.");
        }
        for (const hitTest of this.hitTests) {
          const hitTestResults = frame.getHitTestResults(hitTest.source);
          for (const hitTestResult of hitTestResults) {
            const pose = hitTestResult.getPose(xrSessionManager.referenceSpace);
            if (!pose) {
              continue;
            }
            const hitMatrix = pose.transform.matrix;
            hitTest.matrix.fromArray(hitMatrix);
            hitTest.matrix.decompose(hitTest.scale, hitTest.rotation, hitTest.position);
            hitTest.timestamp = performance.now();
          }
        }
      } catch (error) {
        console.error(error);
      }
    }
  }
  class XRModuleFloorEstimateOptions {
    constructor() {
      __publicField(this, "initialFloorEstimate", 0);
      __publicField(this, "floorEstimateSmoothingRate", 0.2);
    }
  }
  class XRModuleFloorEstimate extends XRModuleHitTest {
    constructor(xr, scene) {
      super(xr);
      __publicField(this, "options");
      __publicField(this, "hitTestUUID");
      __publicField(this, "floorEstimate", 0);
      __publicField(this, "floorEstimateSmoothed", 0);
      __publicField(this, "buffer", []);
      __publicField(this, "bufferSize", 10);
      __publicField(this, "sampleTime", 0);
      __publicField(this, "sampleRateMs", 1e3);
      __publicField(this, "scene");
      this.scene = scene;
      this.options = new XRModuleFloorEstimateOptions();
      this.floorEstimate = this.options.initialFloorEstimate;
      this.floorEstimateSmoothed = this.options.initialFloorEstimate;
    }
    async initFloorEstimate(options) {
      if (options) {
        this.options = options;
        this.floorEstimate = this.options.initialFloorEstimate;
        this.floorEstimateSmoothed = this.options.initialFloorEstimate;
      }
      const rayOrigin = { x: 0, y: 0, z: 0 };
      const rayDirection = {
        x: 0,
        // No horizontal offset
        y: -0.5,
        // Slightly downward
        z: -1
        // Forward direction in viewer space
      };
      const magnitude = Math.sqrt(rayDirection.x ** 2 + rayDirection.y ** 2 + rayDirection.z ** 2);
      rayDirection.x /= magnitude;
      rayDirection.y /= magnitude;
      rayDirection.z /= magnitude;
      this.hitTestUUID = await this.initHitTest(rayOrigin, rayDirection);
    }
    updateFloorEstimate() {
      var _a;
      this.updateHitTests();
      const hitTest = this.getHitTest();
      if (this.scene.activeCamera === void 0) {
        return;
      }
      const cameraY = ((_a = this.scene.activeCamera) == null ? void 0 : _a.position.y) ?? 0;
      if (hitTest && hitTest.position.y < cameraY) {
        const isNewSample = hitTest.timestamp - this.sampleTime > this.sampleRateMs;
        if (isNewSample) {
          this.sampleTime = hitTest.timestamp;
          this.floorEstimate = this.weightedMovingAverage(hitTest.position.y);
        }
      }
      this.floorEstimateSmoothed += (this.floorEstimate - this.floorEstimateSmoothed) * this.options.floorEstimateSmoothingRate;
    }
    /**
     * Updates the floor estimate using a weighted moving average
     * where weights are based on the difference from the average.
     */
    weightedMovingAverage(value) {
      this.buffer.push(value);
      if (this.buffer.length > this.bufferSize) {
        this.buffer.shift();
      }
      let sum = 0;
      for (const value2 of this.buffer) {
        sum += value2;
      }
      const average = sum / this.buffer.length;
      const weights = [];
      let weightSum = 0;
      for (const value2 of this.buffer) {
        const difference = Math.abs(value2 - average);
        const weight = 1 / (1 + difference);
        weights.push(weight);
        weightSum += weight;
      }
      let weightedSum = 0;
      for (let i = 0; i < this.buffer.length; i++) {
        weightedSum += this.buffer[i] * weights[i];
      }
      const result = weightedSum / weightSum;
      return result;
    }
    getHitTest() {
      if (this.hitTestUUID === void 0) return;
      return super.getHitTest(this.hitTestUUID);
    }
    getHitTestMatrix() {
      const hitTest = this.getHitTest();
      const matrix = hitTest == null ? void 0 : hitTest.matrix.clone();
      return matrix;
    }
    getHitTestPosition() {
      const hitTest = this.getHitTest();
      const position = hitTest == null ? void 0 : hitTest.position.clone();
      return position;
    }
    getHitTestRotation() {
      const hitTest = this.getHitTest();
      const rotation = hitTest == null ? void 0 : hitTest.rotation.clone();
      return rotation;
    }
    getHitTestScale() {
      const hitTest = this.getHitTest();
      const scale = hitTest == null ? void 0 : hitTest.scale.clone();
      return scale;
    }
    getFloorEstimate() {
      return this.floorEstimate;
    }
    getFloorEstimateSmoothed() {
      return this.floorEstimateSmoothed;
    }
  }
  class AppImmersalWebXRConfig {
    // assuming camera initialises at 1.0 meters above the floor.
    constructor(config) {
      __publicField(this, "useFloorEstimate", false);
      __publicField(this, "initialFloorEstimate", -1);
      this.useFloorEstimate = config.useFloorEstimate;
      this.initialFloorEstimate = config.initialFloorEstimate ?? this.initialFloorEstimate;
    }
  }
  const _AppImmersalWebXR = class _AppImmersalWebXR extends AppImmersal {
    constructor(renderCanvas) {
      super(renderCanvas);
      __publicField(this, "immersalWebXRConfig");
      __publicField(this, "xr");
      __publicField(this, "xrSession");
      __publicField(this, "xrFloorEstimate");
      __publicField(this, "downsamplerRatio", _AppImmersalWebXR.DEFAULT_DOWNSAMPLER_RATIO);
      __publicField(this, "downsampler");
      __publicField(this, "rawCameraTexture", null);
      __publicField(this, "pixelDataRgba", new Uint8ClampedArray());
      __publicField(this, "pixelDataGrayscale", new Uint8ClampedArray());
    }
    setConfigImmersalWebXR(config) {
      this.immersalWebXRConfig = config;
    }
    initialize() {
      super.initialize();
    }
    async startXR() {
      var _a;
      if (!this.xrSession) {
        this.xrSession = new XRModuleSession();
        const xrSessionOptions = this.initXROptions();
        this.xr = await this.xrSession.init(this.scene, xrSessionOptions);
      }
      await this.xrSession.startXR();
      (_a = this.mediaRecorder) == null ? void 0 : _a.initWeb(this.scene, this.xr);
    }
    initXROptions() {
      const xrSessionOptions = new XRModuleSessionOptions();
      xrSessionOptions.disableDefaultUI = true;
      if (!IS_BABYLON_NATIVE_JSCORE) {
        xrSessionOptions.domOverlayElement = document.getElementById("domOverlay");
      }
      xrSessionOptions.onExitingXR = this.exitXREvent.bind(this);
      return xrSessionOptions;
    }
    async stopXR() {
      if (!this.xrSession) {
        return;
      }
      await this.xrSession.stopXR();
    }
    render() {
      var _a;
      const xrRunning = this.xrSession && this.xrSession.isXRRunning;
      const useFloorEstimate = (_a = this.immersalWebXRConfig) == null ? void 0 : _a.useFloorEstimate;
      if (xrRunning && useFloorEstimate) {
        if (!this.xrFloorEstimate) {
          const options = new XRModuleFloorEstimateOptions();
          options.initialFloorEstimate = this.immersalWebXRConfig.initialFloorEstimate;
          this.xrFloorEstimate = new XRModuleFloorEstimate(this.xr, this.scene);
          this.xrFloorEstimate.initFloorEstimate(options);
        }
        this.xrFloorEstimate.updateFloorEstimate();
        const floorEstimate = this.xrFloorEstimate.getFloorEstimateSmoothed();
        this.pose.setPositionConstraints({ positionY: floorEstimate });
      }
      super.render();
    }
    async localizeAsync() {
      return new Promise((resolve, reject) => {
        if (this.localizing) {
          reject(new Error("app.immersal.webxr.localize: already localizing."));
          return;
        }
        if (!this.xr) {
          reject(new Error("app.immersal.webxr.localize: no xr."));
          return;
        }
        const xrSessionManager = this.xr.baseExperience.sessionManager;
        if (!xrSessionManager.inXRSession) {
          reject(new Error("app.immersal.webxr.localize: not in XR session."));
          return;
        }
        xrSessionManager.runInXRFrame(async () => {
          var _a;
          try {
            const frame = xrSessionManager.currentFrame;
            if (frame === null) {
              reject(new Error("app.immersal.webxr.localize: no frame."));
              return;
            }
            if (!this.camera) {
              reject(new Error("app.immersal.webxr.localize: no active camera."));
              return;
            }
            const referenceSpace = xrSessionManager.referenceSpace;
            const viewerPose = frame.getViewerPose(referenceSpace);
            if (!viewerPose) {
              reject(new Error("app.immersal.webxr.localize: no viewer pose."));
              return;
            }
            const view2 = viewerPose.views[0];
            if (!view2) {
              reject(new Error("app.immersal.webxr.localize: no view."));
              return;
            }
            this.cameraMat = babylonjs.Matrix.FromArray(view2.transform.matrix, 0);
            const cameraMatScl = new babylonjs.Vector3(1, 1, 1);
            const cameraMatPos = new babylonjs.Vector3(0, 0, 0);
            const cameraMatRot = babylonjs.Quaternion.Identity();
            this.cameraMat.decompose(cameraMatScl, cameraMatRot, cameraMatPos);
            if (IS_BABYLON_NATIVE_JSCORE) {
              const ds = 2;
              const nativeFrame = frame._nativeImpl ?? frame;
              const cameraImage = (_a = nativeFrame.getCameraImageData) == null ? void 0 : _a.call(nativeFrame, 0, ds, true);
              if (!cameraImage) {
                reject(new Error("app.immersal.webxr.localize: no native camera image."));
                return;
              }
              const { width, height } = cameraImage;
              const intrinsics = this.getCameraIntrinsics(view2.projectionMatrix, { x: 0, y: 0, width: width * ds, height: height * ds });
              if (intrinsics === null) {
                reject(new Error("app.immersal.webxr.localize: no intrinsics."));
                return;
              }
              intrinsics.focalLength.x /= ds;
              intrinsics.focalLength.y /= ds;
              intrinsics.principalOffset.x /= ds;
              intrinsics.principalOffset.y /= ds;
              const gray = new Uint8ClampedArray(cameraImage.data);
              this.localize(gray, width, height, intrinsics).then((res) => {
                resolve(res);
              }).catch((err2) => {
                reject(err2);
              });
            } else if (IS_EYEJACK_APP) {
              this.localize().then((res) => {
                resolve(res);
              }).catch((err2) => {
                reject(err2);
              });
            } else {
              if (!view2.camera) {
                reject(new Error("app.immersal.webxr.localize: no view camera."));
                return;
              }
              const viewport = {
                x: 0,
                y: 0,
                width: view2.camera.width,
                height: view2.camera.height
              };
              const intrinsics = this.getCameraIntrinsics(view2.projectionMatrix, viewport);
              if (intrinsics === null) {
                reject(new Error("app.immersal.webxr.localize: no intrinsics."));
                return;
              }
              const size = {
                width: Math.floor(view2.camera.width),
                height: Math.floor(view2.camera.height)
              };
              if (this.downsampler && this.downsamplerRatio !== 1) {
                intrinsics.focalLength.x *= this.downsamplerRatio;
                intrinsics.focalLength.y *= this.downsamplerRatio;
                intrinsics.principalOffset.x *= this.downsamplerRatio;
                intrinsics.principalOffset.y *= this.downsamplerRatio;
                size.width = Math.floor(size.width * this.downsamplerRatio);
                size.height = Math.floor(size.height * this.downsamplerRatio);
              }
              const imageDataResult = this.createCameraImageDataFromFrame(frame, size);
              if (!imageDataResult) throw new Error("app.immersal.webxr.localize: Could not get camera image data.");
              const { imageData, imageWidth, imageHeight } = imageDataResult;
              this.localize(imageData, imageWidth, imageHeight, intrinsics).then((res) => {
                resolve(res);
              }).catch((err2) => {
                reject(err2);
              });
            }
          } catch (err2) {
            reject(err2 instanceof Error ? err2 : new Error(String(err2)));
          }
        }, true);
      });
    }
    createCameraImageDataFromFrame(frame, size) {
      var _a;
      if (size.width * size.height === 0) {
        throw new Error(`app.immersal.webxr.createCameraImageDataFromFrame: Cannot downsample to an image with 0 pixels.  Recieved size ${size.width}x${size.height}.`);
      }
      if (this.rawCameraTexture) {
        this.rawCameraTexture._texture._hardwareTexture._webGLTexture = null;
        this.rawCameraTexture.dispose();
      }
      const xrSessionManager = (_a = this.xr) == null ? void 0 : _a.baseExperience.sessionManager;
      const referenceSpace = xrSessionManager.referenceSpace;
      this.rawCameraTexture = this.createCameraTexture(this.engine, referenceSpace, frame);
      if (this.rawCameraTexture === null) {
        return null;
      }
      if (this.downsampler) {
        this.rawCameraTexture = this.downsampler.downsample(this.rawCameraTexture, size);
      }
      const internalTexture = this.rawCameraTexture.getInternalTexture();
      if (!internalTexture) {
        return null;
      }
      if (this.pixelDataRgba.length !== size.width * size.height * 4) {
        this.pixelDataRgba = new Uint8ClampedArray(size.width * size.height * 4);
        console.log(`pixelDataRgba resized ${size.width}x${size.height}x4=${size.width * size.height * 4 / 1024}kb`);
      }
      this.engine._readTexturePixelsSync(internalTexture, size.width, size.height, void 0, void 0, this.pixelDataRgba, true, true);
      if (this.pixelDataGrayscale.length !== size.width * size.height) {
        this.pixelDataGrayscale = new Uint8ClampedArray(size.width * size.height);
        console.log(`pixelDataRgba resized ${size.width}x${size.height}=${size.width * size.height / 1024}kb`);
      }
      if (this.downsampler) {
        for (let i = 0; i < this.pixelDataGrayscale.length; i++) {
          this.pixelDataGrayscale[i] = this.pixelDataRgba[i * 4];
        }
      } else {
        const imageWidth = internalTexture.width;
        const imageHeight = internalTexture.height;
        for (let kPel = 0; kPel < this.pixelDataGrayscale.length; kPel++) {
          const kFlip = _AppImmersalWebXR.flip_index(
            kPel,
            imageWidth,
            imageHeight
          );
          const offset = 4 * kPel;
          const offsetFlip = kFlip;
          const r = this.pixelDataRgba[offset];
          const g = this.pixelDataRgba[offset + 1];
          const b = this.pixelDataRgba[offset + 2];
          const grey = 0.299 * r + 0.587 * g + 0.114 * b;
          this.pixelDataGrayscale[offsetFlip] = grey;
        }
      }
      return {
        imageData: this.pixelDataGrayscale,
        imageWidth: size.width,
        imageHeight: size.height
      };
    }
    static flip_index(kPel, width, height) {
      const i = Math.floor(kPel / width);
      const j = kPel % width;
      return height * width - (i + 1) * width + j;
    }
    createCameraTexture(engine, referenceSpace, frame) {
      const viewerPose = frame.getViewerPose(referenceSpace);
      if (!viewerPose) {
        console.error("app.immersal.webxr.createCameraTexture: viewerPose is null");
        return null;
      }
      const view2 = viewerPose.views[0];
      const bindings = new XRWebGLBinding(frame.session, engine._gl);
      const cameraWebGLTexture = bindings.getCameraImage(
        view2.camera
      );
      if (!cameraWebGLTexture) {
        console.error("app.immersal.webxr.createCameraTexture: cannot get camera WebGLTexture Object");
        return null;
      }
      const width = view2.camera.width;
      const height = view2.camera.height;
      const rawTexture = babylonjs.RawTexture.CreateRGBTexture(
        new Uint8Array(width * height * 4),
        width,
        height,
        null
      );
      rawTexture._texture._hardwareTexture._webGLTexture = cameraWebGLTexture;
      return rawTexture;
    }
    getCameraIntrinsics(projectionMatrix, viewport) {
      const p = projectionMatrix;
      const u0 = (1 - p[8]) * viewport.width / 2 + viewport.x;
      const v0 = (1 - p[9]) * viewport.height / 2 + viewport.y;
      const ax = viewport.width / 2 * p[0];
      const ay = viewport.height / 2 * p[5];
      return {
        principalOffset: {
          x: u0,
          y: v0
        },
        focalLength: {
          x: ax,
          y: ay
        }
      };
    }
  };
  __publicField(_AppImmersalWebXR, "DEFAULT_DOWNSAMPLER_RATIO", 1);
  let AppImmersalWebXR = _AppImmersalWebXR;
  const TAG = "[EJXIMM]";
  const configImmersal = new AppImmersalConfig({
    token: "0d9e70de2e6dad37060de2019f11f272c00fc6087fbecf803a4cffec2b24b01c",
    localizeOnDevice: false,
    // cloud VPS first; on-device wasm is the next step
    maps: [
      {
        mapId: 96897,
        // Keep the map visuals off for v1 — the axes marker at map origin is the
        // ground truth for a correct pose.
        loadSparseMap: false,
        loadTexturedMesh: false
      }
    ]
  });
  const LOCALIZE_INTERVAL_S = 4;
  class Main extends AppImmersalWebXR {
    constructor() {
      let renderCanvas = void 0;
      if (!IS_BABYLON_NATIVE_JSCORE) {
        renderCanvas = document.getElementById("renderCanvas");
      }
      super(renderCanvas);
      __publicField(this, "localizeCountdown", 2);
      // first attempt shortly after XR starts
      __publicField(this, "localizeCount", 0);
      __publicField(this, "successCount", 0);
    }
    initialize() {
      super.initialize();
      const light = new babylonjs.HemisphericLight("light", new babylonjs.Vector3(0, 1, 0), this.scene);
      light.intensity = 1;
      const makeBar = (name, size, pos, color) => {
        const bar = babylonjs.MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, this.scene);
        const mat = new babylonjs.StandardMaterial(`${name}-mat`, this.scene);
        mat.emissiveColor = color;
        mat.disableLighting = true;
        bar.material = mat;
        bar.position = new babylonjs.Vector3(pos[0], pos[1], pos[2]);
        bar.parent = this.rootNode;
        return bar;
      };
      makeBar("axisX", [0.5, 0.03, 0.03], [0.25, 0, 0], new babylonjs.Color3(1, 0, 0));
      makeBar("axisY", [0.03, 0.5, 0.03], [0, 0.25, 0], new babylonjs.Color3(0, 1, 0));
      makeBar("axisZ", [0.03, 0.03, 0.5], [0, 0, 0.25], new babylonjs.Color3(0, 0, 1));
      makeBar("origin", [0.1, 0.1, 0.1], [0, 0, 0], new babylonjs.Color3(1, 1, 1));
    }
    startDemoXR() {
      console.log(`${TAG} starting XR...`);
      this.startXR().then(() => console.log(`${TAG} XR session started`)).catch((e) => console.log(`${TAG} XR start failed: ${(e == null ? void 0 : e.message) ?? e}`));
    }
    render() {
      var _a;
      super.render();
      if (!((_a = this.xrSession) == null ? void 0 : _a.isXRRunning) || this.localizing) {
        return;
      }
      this.localizeCountdown -= this.timeDelta;
      if (this.localizeCountdown > 0) {
        return;
      }
      this.localizeCountdown = LOCALIZE_INTERVAL_S;
      const attempt = ++this.localizeCount;
      console.log(`${TAG} localize #${attempt}...`);
      const t0 = performance.now();
      this.localizeAsync().then((result) => {
        const ms = Math.round(performance.now() - t0);
        if (result.success) {
          this.successCount++;
          console.log(`${TAG} localize #${attempt} SUCCESS (${ms}ms) confidence=${result.confidence} map=${result.map} [${this.successCount}/${attempt}]`);
        } else {
          console.log(`${TAG} localize #${attempt} no match (${ms}ms) [${this.successCount}/${attempt}]`);
        }
      }).catch((e) => {
        const ms = Math.round(performance.now() - t0);
        console.log(`${TAG} localize #${attempt} FAILED (${ms}ms): ${(e == null ? void 0 : e.message) ?? e}`);
      });
    }
  }
  console.log(`${TAG} bundle evaluated (jscore=${IS_BABYLON_NATIVE_JSCORE})`);
  if (!IS_BABYLON_NATIVE_WEBVIEW) {
    const app = new Main();
    app.setConfigImmersal(configImmersal);
    app.setConfigImmersalWebXR(new AppImmersalWebXRConfig({ useFloorEstimate: false }));
    app.init();
    app.loadAsync().then(() => {
      var _a;
      console.log(`${TAG} loaded`);
      if (IS_BABYLON_NATIVE_JSCORE) {
        setTimeout(() => app.startDemoXR(), 2e3);
      } else {
        (_a = document.getElementById("startButton")) == null ? void 0 : _a.addEventListener("click", () => app.startDemoXR());
      }
    }).catch((e) => {
      const err2 = e;
      console.log(`${TAG} loadAsync FAILED: ${(err2 == null ? void 0 : err2.message) ?? e}`);
      if (err2 == null ? void 0 : err2.stack) console.log(`${TAG} stack: ${err2.stack}`);
    });
    console.log(`${TAG} app initialized`);
  }
})(BABYLON);
