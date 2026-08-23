# tgtui-sharptui

A G# and SharpTUI port of Sam Pavlovic's C++ [tgtui](https://github.com/sampavlovic/tgtui).

This repository currently contains the first runnable vertical slice:

- MVSC project structure with Model, View, Services, and Components
- responsive two-pane Telegram layout
- three-row dialog entries with unread, mute, and pin state
- bottom-aligned incoming and outgoing message bubbles
- Powerline bubble tails, reply context, timestamps, and receipts
- keyboard and mouse chat selection
- functional composer backed by an in-memory Telegram service

TDLib authentication, synchronization, media previews, message actions, and persistence remain to be ported.

## Run

```sh
dotnet run --project Tgtui.gsproj
```

Use `Up` and `Down` to select chats, `Enter` to send, `Ctrl+B` to toggle the sidebar or switch panes, and `Ctrl+Q` to quit.

## Verify

```sh
dotnet run --project Tgtui.gsproj -c Release -- --selfcheck
```

The visual and interaction reference is upstream commit `fec02f6f743178b95bdbe8260b9f653baeb68093`.
