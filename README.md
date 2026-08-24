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
- live main and archive chat lists with TDLib ordering and unread state
- recent message history, live message updates, read receipts, and text sending
- OG link previews with site, type, title, description, author, and URL

Folder tabs, media previews, and message actions remain to be ported.

## Run

```sh
dotnet run --project Tgtui.gsproj -c Release
```

The application asks for the `api_id` and `api_hash` from `my.telegram.org` on first run. It validates them and saves them in the platform user configuration directory under `tgtui/credentials`, with owner-only permissions on Unix.

Delete that file to change the saved credentials.

`./run.fish` is an optional developer shortcut. The application and published executable do not require Fish.

To provide credentials manually:

```sh
export TGTUI_API_ID=123456
export TGTUI_API_HASH=your_api_hash
dotnet run --project Tgtui.gsproj
```

The `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` aliases are also accepted.

The offline sample remains available with `--demo`.

Phone login is the default. Choose `QR login` before submitting a phone number to scan with Telegram. Use `Use phone` to cancel a pending QR login. Press `Ctrl+Y` on the QR screen to copy its login link through the terminal clipboard protocol.

Use `Up` and `Down` to select chats, `Enter` to send, `Ctrl+B` to toggle the sidebar or switch panes, and `Ctrl+Q` to quit.

## Verify

```sh
dotnet run --project Tgtui.gsproj -c Release -- --selfcheck
```

The visual and interaction reference is upstream commit `fec02f6f743178b95bdbe8260b9f653baeb68093`.
