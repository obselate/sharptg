package Tgtui

import SharpTui

internal open class TopStatus : Box {
  private var theme TgtuiTheme
  private var state TelegramConnectionState
  private var connectionText string
  private var accountName string

  public init(theme TgtuiTheme) {
    this.theme = theme
    state = TelegramConnectionState.Reconnecting
    connectionText = "Reconnecting"
    accountName = ""
    Height = CellLength.Cells(1)
    Style = theme.Header
  }

  internal func Update(nextState TelegramConnectionState, text string, account string) {
    state = nextState
    connectionText = text
    accountName = account
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    screen.Fill(bounds, theme.Header)
    if bounds.HeightRows == 0 || bounds.WidthCells < 8 { return }
    var column = bounds.Column + 1
    screen.Write(column, bounds.Row, "tgtui", theme.Accent)
    column = column + 6
    column = separator(screen, bounds, column)
    let stateStyle = statusStyle()
    screen.Write(column, bounds.Row, "●", stateStyle)
    column = column + 2
    let presence = state == TelegramConnectionState.Connected ? "online" :
    (state == TelegramConnectionState.Reconnecting ? "reconnecting" : "offline")
    screen.WriteClipped(bounds, column - bounds.Column, 0, presence, statusMuted())
    column = column + CellText.MeasureWidth(presence) + 1
    column = separator(screen, bounds, column)
    let rightWidth = CellText.MeasureWidth(accountName)
    let rightColumn = bounds.Column + bounds.WidthCells - rightWidth - 1
    if column < rightColumn {
      screen.Write(column, bounds.Row, CellText.Clip(connectionText, rightColumn - column - 1), statusMuted())
    }
    if accountName != "" && rightColumn > bounds.Column {
      if rightColumn - 2 > column {
        screen.Write(rightColumn - 2, bounds.Row, "│", statusBorder())
      }
      screen.Write(rightColumn, bounds.Row, accountName, theme.AccentBlue)
    }
  }

  private func separator(screen Screen, bounds CellRect, column int32) int32 {
    if column < bounds.Column + bounds.WidthCells {
      screen.Write(column, bounds.Row, "│", statusBorder())
    }
    return column + 2
  }

  private func statusStyle() Style {
    if state == TelegramConnectionState.Connected { return theme.Online }
    if state == TelegramConnectionState.Reconnecting { return theme.Reconnecting }
    return theme.Offline
  }

  private func statusMuted() Style ->
  Style{ Foreground: theme.Muted.Foreground, Background: theme.Header.Background }

  private func statusBorder() Style ->
  Style{ Foreground: theme.Border.Foreground, Background: theme.Header.Background }
}
