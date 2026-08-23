# tgtui-sharptui

A G# and SharpTUI port of Sam Pavlovic's C++ [tgtui](https://github.com/sampavlovic/tgtui).

This repository currently contains the first runnable vertical slice:

- MVSC project structure with Model, View, Services, and Components
- responsive two-pane Telegram layout
- three-row dialog entries with unread, mute, and pin state
- bottom-aligned incoming and outgoing message bubbles
- Powerline bubble tails, reply context, timestamps, and receipts
- keyboard and mouse chat selection
- functional composer with an offline sample service
- native TDLib JSON authorization through QR, phone, code, and cloud password states

Chat synchronization, media previews, message actions, and persistence remain to be ported.

## Run

```sh
./run.fish
```

The script prompts for the `api_id` and `api_hash` from `my.telegram.org`. It validates them and passes them only to the tgtui process.

To provide credentials manually:

```sh
export TELEGRAM_API_ID=123456
export TELEGRAM_API_HASH=your_api_hash
dotnet run --project Tgtui.gsproj
```

The offline sample remains available with `--demo`.

Phone login is the default. Choose `QR login` before submitting a phone number to scan with Telegram. Press `Ctrl+Y` on the QR screen to copy its login link through the terminal clipboard protocol.

Use `Up` and `Down` to select chats, `Enter` to send, `Ctrl+B` to toggle the sidebar or switch panes, and `Ctrl+Q` to quit.

## Verify

```sh
dotnet run --project Tgtui.gsproj -c Release -- --selfcheck
```

The visual and interaction reference is upstream commit `fec02f6f743178b95bdbe8260b9f653baeb68093`.
