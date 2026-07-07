// Echo worker for the Worker polyfill smoke test: replies with a transformed
// structured payload (typed array + ArrayBuffer) to exercise the clone path
// in both directions.
onmessage = function (ev) {
    var d = ev.data;
    postMessage({
        reply: d.msg === "ping" ? "pong" : "unexpected",
        n: (d.n | 0) + 1,
        bytes: new Uint8Array([d.bytes[0] * 10, d.bytes[1] * 10, d.bytes[2] * 10]).length === 3
            ? new Uint8Array([10, 20, 30, 40])
            : new Uint8Array(0),
        buf: d.buf,
    });
};
