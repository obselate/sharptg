#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$project_root"

dist_name=${SHARPTG_DIST_NAME:-sharptg}

apk add --no-cache \
  binutils \
  build-base \
  clang \
  cmake \
  gperf \
  git \
  lld \
  linux-headers \
  ncurses-static \
  ninja \
  openssl-dev \
  openssl-libs-static \
  pkgconf \
  zlib-dev \
  zlib-static

git clone --depth 1 --branch tdlib/v1.8.66 \
  https://github.com/ForNeVeR/tdlib-versioned.git /tmp/sharptg-tdlib
cmake -S /tmp/sharptg-tdlib -B /tmp/sharptg-tdlib-build -G Ninja \
  -DCMAKE_C_COMPILER=clang \
  -DCMAKE_CXX_COMPILER=clang++ \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX=/opt/tdlib \
  -DTD_ENABLE_JNI=OFF \
  -DTD_INSTALL_SHARED_LIBRARIES=OFF \
  -DTD_INSTALL_STATIC_LIBRARIES=ON \
  -DOPENSSL_USE_STATIC_LIBS=TRUE \
  -DOPENSSL_ROOT_DIR=/usr \
  -DZLIB_LIBRARY=/usr/lib/libz.a
cmake --build /tmp/sharptg-tdlib-build --target tdjson_static -j"$(nproc)"
cmake --install /tmp/sharptg-tdlib-build

case "$(uname -m)" in
  x86_64) runtime=linux-musl-x64 ;;
  aarch64) runtime=linux-musl-arm64 ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

dotnet publish SharpTg.gsproj \
  -c Release \
  -r "$runtime" \
  --self-contained true \
  -p:SharpTuiProject=../sharptui/SharpTui.Framework.gsproj \
  -p:StaticTdLib=true \
  -p:TdLibStaticRoot=/opt/tdlib \
  -o build-ci/publish

strip -s build-ci/publish/sharptg
build-ci/publish/sharptg --selfcheck

if readelf -l build-ci/publish/sharptg | grep -q INTERP; then
  readelf -l build-ci/publish/sharptg >&2
  exit 1
fi

if readelf -d build-ci/publish/sharptg | grep -q NEEDED; then
  readelf -d build-ci/publish/sharptg >&2
  exit 1
fi

mkdir -p dist
install -m 0755 build-ci/publish/sharptg "dist/$dist_name"
