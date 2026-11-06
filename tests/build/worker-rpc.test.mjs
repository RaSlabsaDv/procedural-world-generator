import { test } from "node:test";
import assert from "node:assert/strict";

const instances = [];
class FakeWorker {
  constructor() {
    instances.push(this);
    queueMicrotask(() =>
      this.onmessage({
        data: { protocol: "worker-rpc-v1", ready: true, runtimeMs: 3 },
      }),
    );
  }
  postMessage(message) {
    this.last = message;
  }
  terminate() {
    this.terminated = true;
  }
  reply(value, id = this.last.id) {
    this.onmessage({ data: { protocol: "worker-rpc-v1", id, value } });
  }
}

test("worker RPC shares initialization, correlates requests, rejects crashes and retries", async () => {
  globalThis.Worker = FakeWorker;
  const host = await import("../../src/wasm/wwwroot/world-generator-host.js");
  const [a, b] = await Promise.all([
    host.getWorldGenerator(),
    host.getWorldGenerator(),
  ]);
  assert.equal(a, b);
  assert.equal(instances.length, 1);
  const first = a.generateTerrainJson("first");
  await Promise.resolve();
  const id1 = instances[0].last.id;
  const second = b.generateTerrainJson("{}");
  await Promise.resolve();
  instances[0].reply("terrain");
  instances[0].reply(3, id1);
  assert.equal(await first, 3);
  assert.equal(await second, "terrain");
  assert.equal(host.getRuntimeInfo().initCount, 1);
  assert.equal(host.getRuntimeInfo().execution, "worker");
  const pending = a.generateTerrainJson("pending");
  const failed = assert.rejects(pending, /crashed/);
  await Promise.resolve();
  instances[0].onerror({ message: "crashed" });
  await failed;
  assert.equal(instances[0].terminated, true);
  await host.getWorldGenerator();
  assert.equal(instances.length, 2);
  assert.equal(host.getRuntimeInfo().initCount, 2);
  host.disposeWorldGenerator();
  assert.equal(instances[1].terminated, true);
  globalThis.Worker = class extends FakeWorker {
    constructor() {
      super();
      queueMicrotask(() =>
        this.onmessage({ data: { protocol: "wrong-version" } }),
      );
    }
  };
  // A mismatch invalidates the connection and fails the following request.
  await host.getWorldGenerator();
  await assert.rejects(a.generateTerrainJson("protocol"), /protocol/);
  globalThis.Worker = class {
    constructor() {
      queueMicrotask(() =>
        this.onmessage({
          data: {
            protocol: "worker-rpc-v1",
            ready: false,
            error: "startup failure",
          },
        }),
      );
    }
    terminate() {}
  };
  await assert.rejects(host.getWorldGenerator(), /startup failure/);
  globalThis.Worker = FakeWorker;
  await host.getWorldGenerator();
  host.disposeWorldGenerator();
});
