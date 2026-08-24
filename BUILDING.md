# Building SharpTg

## Requirements

- .NET SDK 10
- Git

The project restores the G# SDK, SharpTUI, and other managed packages through NuGet.

NativeAOT publishing also requires Clang or GCC, a C++ toolchain, and zlib development headers. The static Linux release has more dependencies and is built by the release script.

Clone the repository:

```bash
git clone https://github.com/obselate/sharptg.git
cd sharptg
```

## Developer build

```bash
dotnet restore SharpTg.gsproj
dotnet build SharpTg.gsproj -c Release
dotnet run --project SharpTg.gsproj -c Release -- --selfcheck
```

Run the offline demo:

```bash
dotnet run --project SharpTg.gsproj -c Release -- --demo
```

Live Telegram use asks for the API ID and API hash from `my.telegram.org` on first run. The non-interactive selfcheck does not require credentials.

## NativeAOT glibc build

```bash
dotnet publish SharpTg.gsproj \
  -c Release \
  -r linux-x64 \
  --self-contained true \
  -o dist/linux-x64

./dist/linux-x64/sharptg --selfcheck
```

This build uses the Ubuntu 22.04 glibc TDLib asset supplied by `tdlib.native`. Build on the oldest supported glibc environment when the output must run on newer distributions.

## Static Linux release

The maintainer release gate builds TDLib 1.8.66 from source against musl, links it directly into the NativeAOT executable, tests that one binary across the complete SmolVM Linux matrix, and emits `sharptg-linux-x86_64` with `sharptg-linux-x86_64.sha256`.

```bash
dotnet-smolrelease \
  --source . \
  --project SharpTg.gsproj \
  --property StaticTdLib=true \
  --property TdLibStaticRoot=/opt/tdlib \
  --abi musl \
  --universal \
  --musl-builder ~/.config/dotnet-smoltest/builders/alpine-tdlib-static.smolfile \
  --package-format binary \
  --package-entrypoint sharptg \
  --package-asset-name sharptg-linux-x86_64 \
  --release-name sharptg \
  -- ./sharptg --selfcheck
```

Packaging rejects dirty source by default. A successful run writes GitHub release assets, per-file checksums, a release manifest, JUnit XML, and target logs under `~/.local/state/dotnet-smoltest/releases/`.

For a workflow test against uncommitted code, add `--allow-dirty-release`. The manifest records the dirty source state. Do not publish that output as a tagged release.
