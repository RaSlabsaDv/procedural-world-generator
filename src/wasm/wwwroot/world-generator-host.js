import { dotnet } from './_framework/dotnet.js';

let runtimePromise = null;
let initCount = 0;
let initMs = null;

export function getRuntimeInfo() {
    return { initCount, initMs };
}

export function getWorldGenerator() {
    runtimePromise ??= initialize().catch((error) => {
        runtimePromise = null;
        throw error;
    });
    return runtimePromise;
}

async function initialize() {
    const started = performance.now();
    const { getAssemblyExports, getConfig } = await dotnet.create();
    const config = getConfig();
    const exports = await getAssemblyExports(config.mainAssemblyName);

    initMs = performance.now() - started;
    initCount += 1;

    return {
        add: (left, right) => exports.WorldGeneratorInterop.Add(left, right),
        generateSamplesJson: (seed, count) =>
            exports.WorldGeneratorInterop.GenerateSamplesJson(seed, count),
        generateHeightMapJson: (requestJson) =>
            exports.WorldGeneratorInterop.GenerateHeightMapJson(requestJson),
    };
}
