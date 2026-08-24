#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$project_root"

dotnet publish SharpTg.gsproj \
  -c Release \
  -r osx-arm64 \
  --self-contained true \
  -o build-ci/publish

build-ci/publish/sharptg --selfcheck
strip -x build-ci/publish/sharptg
codesign --force --sign - build-ci/publish/libtdjson.dylib
codesign --force --sign - build-ci/publish/sharptg

mkdir -p dist
tar -C build-ci/publish -czf dist/sharptg-macos-arm64.tar.gz \
  sharptg \
  libtdjson.dylib
