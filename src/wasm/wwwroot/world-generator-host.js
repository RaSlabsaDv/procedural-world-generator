// One worker owns the only C# runtime for this page. All callers share this proxy.
const protocol = "worker-rpc-v1";
let connection = null;
let worker = null;
let initCount = 0;
let initMs = null;
let runtimeMs = null;
let failure = null;
let nextId = 0;
const pending = new Map();

export function getRuntimeInfo() {
  return { initCount, initMs, runtimeMs, execution: "worker", protocol };
}

function fail(error) {
  failure = error;
  worker?.terminate();
  worker = null;
  connection = null;
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}

function initialize() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const started = performance.now();
    if (typeof Worker === "undefined") {
      reject(new Error("This browser does not support module workers."));
      return;
    }
    worker = new Worker(
      new URL("./world-generator-worker.js", import.meta.url),
      { type: "module" },
    );
    const timeout = setTimeout(
      () => startupFailure(new Error("WASM worker initialization timed out.")),
      60000,
    );
    const startupFailure = (error) => {
      clearTimeout(timeout);
      reject(error);
      fail(error);
    };
    worker.onerror = (event) =>
      startupFailure(new Error(event.message || "WASM worker failed."));
    worker.onmessageerror = () =>
      startupFailure(new Error("WASM worker message could not be decoded."));
    worker.onmessage = ({ data }) => {
      if (data?.protocol !== protocol) {
        startupFailure(new Error("Incompatible WASM worker protocol."));
        return;
      }
      if ("ready" in data) {
        if (!data.ready) {
          startupFailure(new Error(data.error));
          return;
        }
        clearTimeout(timeout);
        initCount++;
        initMs = performance.now() - started;
        runtimeMs = data.runtimeMs;
        resolve(worker);
        return;
      }
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.value);
    };
  }).catch((error) => {
    connection = null;
    throw error;
  });
  return connection;
}

async function call(method, args) {
  const activeWorker = await initialize();
  if (activeWorker !== worker)
    throw failure || new Error("WASM worker disconnected.");
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    try {
      activeWorker.postMessage({ protocol, id, method, args });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}
const runtime = {
  generateTerrainJson: (json) => call("generateTerrainJson", [json]),
};
export async function getWorldGenerator() {
  await initialize();
  return runtime;
}
export function disposeWorldGenerator() {
  fail(new Error("WASM worker was disposed."));
}
