#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
publish_dir="$repo_root/artifacts/wasm"
assets_dir="$repo_root/src/client/public/wasm"
tmp_root=""
publish_installed=false
assets_installed=false
committed=false

restore_previous() {
  if [[ -n "$tmp_root" && -e "$tmp_root/backup-publish" ]]; then
    rm -rf "$publish_dir"
    mv "$tmp_root/backup-publish" "$publish_dir"
  elif [[ "$publish_installed" == true ]]; then
    rm -rf "$publish_dir"
  fi

  if [[ -n "$tmp_root" && -e "$tmp_root/backup-assets" ]]; then
    rm -rf "$assets_dir"
    mv "$tmp_root/backup-assets" "$assets_dir"
  elif [[ "$assets_installed" == true ]]; then
    rm -rf "$assets_dir"
  fi
}

cleanup() {
  if [[ "$committed" != true ]]; then
    restore_previous
  fi
  if [[ -n "$tmp_root" && -d "$tmp_root" ]]; then
    rm -rf "$tmp_root"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

require_glob() {
  local pattern="$1"
  if ! compgen -G "$pattern" > /dev/null; then
    printf 'Missing required publish asset: %s\n' "$pattern" >&2
    return 1
  fi
}

mkdir -p "$repo_root/artifacts" "$(dirname "$assets_dir")"
tmp_root="$(mktemp -d "$repo_root/artifacts/.wasm-publish.XXXXXX")"
stage_publish="$tmp_root/publish"
stage_assets="$tmp_root/assets"

dotnet restore "$repo_root/src/wasm/WorldGenerator.Wasm.csproj" \
  --locked-mode \
  -p:Configuration=Release

dotnet publish "$repo_root/src/wasm/WorldGenerator.Wasm.csproj" \
  --configuration Release \
  --no-restore \
  --output "$stage_publish"

test -f "$stage_publish/wwwroot/_framework/dotnet.js"
test -f "$stage_publish/wwwroot/world-generator-host.js"
test -f "$stage_publish/wwwroot/world-generator-worker.js"
require_glob "$stage_publish/wwwroot/_framework/dotnet.native.*.wasm"
require_glob "$stage_publish/wwwroot/_framework/dotnet.runtime.*.js"
require_glob "$stage_publish/wwwroot/_framework/WorldGenerator.Core.*.wasm"
require_glob "$stage_publish/wwwroot/_framework/WorldGenerator.Wasm.*.wasm"

mkdir -p "$stage_assets"
cp -R "$stage_publish/wwwroot/_framework" "$stage_assets/"
cp "$stage_publish"/wwwroot/world-generator-host.js* "$stage_assets/"
cp "$stage_publish"/wwwroot/world-generator-worker.js* "$stage_assets/"

if [[ -e "$publish_dir" ]]; then
  mv "$publish_dir" "$tmp_root/backup-publish"
fi
if [[ -e "$assets_dir" ]]; then
  mv "$assets_dir" "$tmp_root/backup-assets"
fi

publish_installed=true
mv "$stage_publish" "$publish_dir"
assets_installed=true
mv "$stage_assets" "$assets_dir"
committed=true

printf 'Published WASM assets to %s\n' "$publish_dir"
printf 'Copied WASM assets to %s\n' "$assets_dir"
