import { dotnet } from "./_framework/dotnet.js";

const protocol = "worker-rpc-v1";
const started = performance.now();
let runtime;
try {
  const { getAssemblyExports, getConfig } = await dotnet.create();
  const exports = await getAssemblyExports(getConfig().mainAssemblyName);
  runtime = exports.WorldGeneratorInterop;
  self.postMessage({
    protocol,
    ready: true,
    runtimeMs: performance.now() - started,
  });
} catch (error) {
  self.postMessage({ protocol, ready: false, error: String(error) });
}
self.onmessage = ({ data }) => {
  if (data?.protocol !== protocol || !Number.isSafeInteger(data.id)) return;
  try {
    if (!runtime) throw new Error("WASM runtime is unavailable.");
    const methods = {
      generateTerrainJson: "GenerateTerrainJson",
    };
    const name = methods[data.method];
    if (!name) throw new Error("Unknown worker method.");
    self.postMessage({
      protocol,
      id: data.id,
      value: runtime[name](...data.args),
    });
  } catch (error) {
    self.postMessage({ protocol, id: data.id, error: String(error) });
  }
};
