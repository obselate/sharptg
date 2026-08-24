SharpTg is a G# and SharpTUI port of [Sam Pavlovic's C++ tgtui](https://github.com/sampavlovic/tgtui).

This is a SharpTUI framework capability test.

## Install

Download the build for your platform from [Releases](https://github.com/obselate/sharptg/releases/latest). Release builds are NativeAOT and do not require .NET.

On Linux, make the downloaded file executable and run it:

```sh
chmod +x sharptg-linux-x86_64
./sharptg-linux-x86_64
```

## Build from source

Requires Git and the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0).

```sh
git clone https://github.com/obselate/sharptg.git
cd sharptg
dotnet run --project SharpTg.gsproj -c Release
```

`SharpTg.gsproj` restores SharpTUI from NuGet. See [BUILDING.md](BUILDING.md) for NativeAOT and static Linux builds.

## Run

The application asks for the `api_id` and `api_hash` from `my.telegram.org` on first run. It validates them and saves them in the platform user configuration directory under `sharptg/credentials`, with owner-only permissions on Unix.

Delete that file to change the saved credentials.

To provide credentials manually:

```sh
export SHARPTG_API_ID=123456
export SHARPTG_API_HASH=your_api_hash
dotnet run --project SharpTg.gsproj
```

The legacy `TGTUI_API_ID` and `TGTUI_API_HASH` names and the
`TELEGRAM_API_ID` and `TELEGRAM_API_HASH` aliases are also accepted.

The offline sample remains available with `--demo`.

Use `--force-low-colors` to force the ANSI 16-color palette.

Phone login is the default. Choose `QR login` before submitting a phone number to scan with Telegram. Use `Use phone` to cancel a pending QR login. Press `Ctrl+Y` on the QR screen to copy its login link through the terminal clipboard protocol.

Use `Tab` and `Shift+Tab` to cycle dialogs, compose, and history. In compose, `Enter` sends, `Shift+Enter` adds a line, and `Up` selects the newest history message from the first line. In history, use `Up` and `Down` to move the `▶` selection, `PageUp` to load older messages, `R` to reply, `F` to forward, and `Enter` for all actions. Links in the action menu use `1` through `9`. `Esc` returns toward dialogs, `Ctrl+B` toggles the sidebar, and `Ctrl+Q` quits.

## Verify

```sh
dotnet run --project SharpTg.gsproj -c Release -- --selfcheck
```

The visual and interaction reference is upstream commit `fec02f6f743178b95bdbe8260b9f653baeb68093`.
