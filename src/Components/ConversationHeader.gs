package Tgtui

import SharpTui

internal open class ConversationHeader : Box {
  private var theme TgtuiTheme
  private var title string
  private var count int32
  private var online bool

  public init(theme TgtuiTheme) {
    this.theme = theme
    title = ""
    count = 0
    online = false
    Height = CellLength.Cells(2)
    Style = theme.Header
  }

  internal func Update(chat TelegramChat) {
    title = chat.Title
    count = chat.Messages.Count
    online = chat.Online
  }

  internal func Clear() {
    title = "Select a chat"
    count = -1
    online = false
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    screen.Fill(bounds, theme.Header)
    if bounds.HeightRows == 0 { return }
    screen.Write(bounds.Column + 2, bounds.Row, CellText.Clip(title, bounds.WidthCells - 16), theme.Header)
    if count >= 0 {
      let countText = count.ToString() + " msgs"
      screen.Write(bounds.Column + bounds.WidthCells - CellText.MeasureWidth(countText) - 2, bounds.Row, countText, theme.Muted)
    }
    if bounds.HeightRows > 1 {
      let separator = "".PadLeft(bounds.WidthCells, '─')
      screen.Write(bounds.Column, bounds.Row + 1, separator, theme.Border)
    }
  }
}
