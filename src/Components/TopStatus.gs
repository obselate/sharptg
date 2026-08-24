package Tgtui

import System.Collections.Generic
import SharpTui

internal open class TopStatus : StatusBar {
  private var theme TgtuiTheme

  public init(theme TgtuiTheme) {
    this.theme = theme
    Height = CellLength.Cells(1)
    Style = theme.Header
    Update(TelegramConnectionState.Reconnecting, "Reconnecting", "")
  }

  internal func Update(state TelegramConnectionState, connection string, account string) {
    let presence = state == TelegramConnectionState.Connected ? "online" :
    (state == TelegramConnectionState.Reconnecting ? "reconnecting" : "offline")
    let stateStyle = if state == TelegramConnectionState.Connected { theme.Online }
    else if state == TelegramConnectionState.Reconnecting { theme.Reconnecting }
    else { theme.Offline }
    let muted = Style{ Foreground: theme.Muted.Foreground, Background: theme.Header.Background }
    let border = Style{ Foreground: theme.Border.Foreground, Background: theme.Header.Background }
    LeftRuns = List[TextRun]{
      TextRun(" sharptg ", theme.Accent),
      TextRun("│ ", border),
      TextRun("● ", stateStyle),
      TextRun(presence + " ", muted),
      TextRun("│ ", border),
      TextRun(connection, muted),
    }
    RightRuns = account == "" ? List[TextRun]() : List[TextRun]{
      TextRun("│ ", border),
      TextRun(account + " ", theme.AccentBlue),
    }
  }
}
