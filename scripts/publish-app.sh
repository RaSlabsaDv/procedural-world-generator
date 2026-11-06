#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
client_dir="$repo_root/src/client"
publish_dir="$repo_root/artifacts/app"
client_output="$client_dir/dist/client/browser"

npm --prefix "$client_dir" run build
dotnet restore "$repo_root/src/api/WorldGenerator.Api.csproj" \
  --locked-mode \
  -p:Configuration=Release
dotnet publish "$repo_root/src/api/WorldGenerator.Api.csproj" \
  --configuration Release \
  --no-restore \
  --output "$publish_dir"

rm -rf "$publish_dir/wwwroot"
mkdir -p "$publish_dir/wwwroot"
cp -R "$client_output/." "$publish_dir/wwwroot/"

printf 'Published Angular, WASM, and API assets to %s\n' "$publish_dir"
