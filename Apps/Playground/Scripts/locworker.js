self.Module = {
  onRuntimeInitialized: function() {
    pluginInit();
  }
};

function pluginInit() {
  icvGetInteger = Module.cwrap('icvGetInteger', 'number', ['string']);
  icvSetInteger = Module.cwrap('icvSetInteger', 'number', ['string', 'number']);
  icvLoadMap = Module.cwrap('icvLoadMap', 'number', ['number']);
  icvFreeMap = Module.cwrap('icvFreeMap', 'number', ['number']);
  icvLocalize = Module.cwrap('wasmLocalize', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']);

  let r = 0;
  //r = icvSetInteger("LocalizationMaxPixels", 960*720);
  //r = icvSetInteger("LocalizationMaxPixels", 360*360);
  //r = icvSetInteger("NumThreads", 2);
  postMessage({type: "Init", data: r});
}

onmessage = function(e) {
  const { type, data } = e.data;
  //console.log(type);

  if (type == "LoadMap") {
    const map = data;
    const ptrMap = Module._malloc(map.length * map.BYTES_PER_ELEMENT);
    Module.HEAPU8.set(map, ptrMap);
    let r = icvLoadMap(ptrMap);
    Module._free(ptrMap);
    postMessage({type: "LoadMap", data: r});
  }
  else if (type == "FreeMap") {
    let r = icvFreeMap(data);
    postMessage({type: "FreeMap", data: r});
  }
  else if (type == "Localize") {
    const width = data[0];
    const height = data[1];
    const cameraIntrinsics = data[2];
    const pixels = data[3];
    const time = data[4];
    const gyro = data[5];
    const solverType = data[6];
    const cameraRotation = data[7];

    const camRot = new Float32Array([cameraRotation.x, cameraRotation.y, cameraRotation.z, cameraRotation.w]);

    let position = new Float32Array(3);
    let rotation = new Float32Array(4);
    let intrinsics = new Float32Array([cameraIntrinsics.fx, cameraIntrinsics.fy, cameraIntrinsics.ox, cameraIntrinsics.oy]);

    const ptrPix = Module._malloc(pixels.length * pixels.BYTES_PER_ELEMENT);
    Module.HEAPU8.set(pixels, ptrPix);
    const ptrPos = Module._malloc(position.length * position.BYTES_PER_ELEMENT);
    Module.HEAPF32.set(position, ptrPos >> 2);
    const ptrRot = Module._malloc(rotation.length * rotation.BYTES_PER_ELEMENT);
    Module.HEAPF32.set(rotation, ptrRot >> 2);
    const ptrIntrinsics = Module._malloc(intrinsics.length * intrinsics.BYTES_PER_ELEMENT);
    Module.HEAPF32.set(intrinsics, ptrIntrinsics >> 2);
    const ptrCamRot = Module._malloc(camRot.length * camRot.BYTES_PER_ELEMENT);
    Module.HEAPF32.set(camRot, ptrCamRot >> 2);

    let r = icvLocalize(ptrPos, ptrRot, width, height, ptrIntrinsics, ptrPix, 1, solverType, ptrCamRot);

    if (r >= 0) {
      position = Module.HEAPF32.subarray(ptrPos >> 2, (ptrPos >> 2) + position.length);
      rotation = Module.HEAPF32.subarray(ptrRot >> 2, (ptrRot >> 2) + rotation.length);
      intrinsics = Module.HEAPF32.subarray(ptrIntrinsics >> 2, (ptrIntrinsics >> 2) + intrinsics.length);
    }

    const pos = [position[0], position[1], position[2]];
    const rot = [rotation[0], rotation[1], rotation[2], rotation[3]];
    const focalLen = intrinsics[0];
    const G = [gyro.x, gyro.y, gyro.z, gyro.w];

    Module._free(ptrPix);
    Module._free(ptrPos);
    Module._free(ptrRot);
    Module._free(ptrIntrinsics);
    Module._free(ptrCamRot);

    postMessage({type: "Localize", data: {r: r, pos: pos, rot: rot, time: time, gyro: G, focalLength: focalLen}});
  }
  else if (type == "GetInteger") {
    let r = icvGetInteger(data);
    postMessage({type: "GetInteger", data: r});
  }
  else if (type == "SetInteger") {
    let r = icvSetInteger(data[0], data[1]);
    postMessage({type: "SetInteger", data: r});
  }
}

self.importScripts('PosePlugin.js');