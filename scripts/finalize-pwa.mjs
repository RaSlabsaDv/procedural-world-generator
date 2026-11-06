import { createHash } from "node:crypto";
import { readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(
  process.argv[2] ?? resolve(repo, "src/client/dist/client/browser"),
);
const config = resolve(
  process.argv[3] ?? resolve(repo, "src/client/ngsw-config.json"),
);
const generator = resolve(
  repo,
  "src/client/node_modules/@angular/service-worker/ngsw-config.js",
);
const hash = (algorithm, value) =>
  createHash(algorithm).update(value).digest("hex");
const indexPath = resolve(output, "index.html");
let index = await readFile(indexPath, "utf8");
// Allow the finalizer to run again without accumulating catalogs or metadata.
index = index.replace(
  /\n<!-- worldgen-offline:start -->[\s\S]*?<!-- worldgen-offline:end -->\n/g,
  "",
);
await writeFile(indexPath, index);
for (const name of await readdir(output)) {
  if (/^offline-assets\.[0-9a-f]{64}\.json$/.test(name))
    await unlink(resolve(output, name));
}
const generate = () =>
  execFileSync(
    process.execPath,
    [generator, relative(repo, output), relative(repo, config), "/"],
    { cwd: repo, stdio: "inherit" },
  );
generate();
const manifest = JSON.parse(
  await readFile(resolve(output, "ngsw.json"), "utf8"),
);
if (
  manifest.assetGroups.length !== 1 ||
  manifest.assetGroups[0].installMode !== "prefetch"
) {
  throw new Error(
    "Offline verification requires one complete prefetch asset group.",
  );
}
const assets = manifest.hashTable;
if (!assets["/index.html"] || !assets["/wasm/_framework/dotnet.js"]) {
  throw new Error(
    "Application shell or WASM assets are missing from the offline manifest.",
  );
}
const version = hash("sha256", JSON.stringify(assets));
const catalogName = `offline-assets.${version}.json`;
index = index.replace(
  "</head>",
  `\n<!-- worldgen-offline:start -->\n<meta name="worldgen-offline-catalog" content="${catalogName}">\n<!-- worldgen-offline:end -->\n</head>`,
);
assets["/index.html"] = hash("sha1", index);
await writeFile(indexPath, index);
await writeFile(
  resolve(output, catalogName),
  JSON.stringify({ version, assets }),
);
// Use Angular's own generator after adding the versioned catalog and index metadata.
generate();
const finalManifest = JSON.parse(
  await readFile(resolve(output, "ngsw.json"), "utf8"),
);
if (!finalManifest.hashTable["/" + catalogName])
  throw new Error("Offline catalog was not cached by Angular.");
console.log(
  `Offline catalog: ${catalogName} (${Object.keys(assets).length} required assets)`,
);
