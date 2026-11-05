#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
publish_dir="$repo_root/artifacts/wasm"
assets_dir="$repo_root/src/client/public/wasm"

dotnet publish "$repo_root/src/wasm/WorldGenerator.Wasm.csproj" \
  --configuration Release \
  --output "$publish_dir"

rm -rf "$assets_dir"
mkdir -p "$assets_dir"
cp -R "$publish_dir/wwwroot/_framework" "$assets_dir/"
cp "$publish_dir"/wwwroot/world-generator-host.js* "$assets_dir/"

printf 'Copied WASM assets to %s\n' "$assets_dir"
