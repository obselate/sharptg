package Tgtui

import System
import System.Collections.Generic
import SharpTui

internal open class Conversation : Box {
  private var theme TgtuiTheme
  private var messages List[TelegramMessage]
  private var loading bool

  public init(theme TgtuiTheme) {
    this.theme = theme
    messages = List[TelegramMessage]()
    loading = false
    GrowWeight = 1
    Style = theme.Canvas
  }

  internal func Update(items List[TelegramMessage], isLoading bool) {
    messages = items
    loading = isLoading
  }

  internal func Clear() {
    messages = List[TelegramMessage]()
    loading = false
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    screen.Fill(bounds, theme.Canvas)
    if bounds.WidthCells < 12 || bounds.HeightRows < 2 { return }
    if messages.Count == 0 {
      let empty = loading ? "Loading messages..." : "No messages"
      let column = bounds.Column + Math.Max(1, (bounds.WidthCells - CellText.MeasureWidth(empty)) / 2)
      let row = bounds.Row + bounds.HeightRows / 2
      screen.Write(column, row, empty, theme.Muted)
      return
    }
    var row = bounds.Row + bounds.HeightRows - 1
    var index = messages.Count - 1
    while index >= 0 && row >= bounds.Row {
      let message = messages[index]
      let maxBubble = Math.Max(18, bounds.WidthCells * 72 / 100)
      let textWidth = Math.Max(8, maxBubble - 4)
      let lines = CellText.Wrap(message.Text, textWidth)
      let receipt = message.Outgoing && message.Read ? " ✓✓" : ""
      let stamp = message.Time + receipt
      let stampWidth = CellText.MeasureWidth(stamp)
      var longest = stampWidth + 4
      for line in lines {
        longest = Math.Max(longest, CellText.MeasureWidth(line) + 4)
      }
      let lastLineWidth = lines.Count == 0 ? 0 : CellText.MeasureWidth(lines[lines.Count - 1])
      let stampRow = lastLineWidth + stampWidth + 5 > maxBubble
      if !stampRow { longest = Math.Max(longest, lastLineWidth + stampWidth + 5) }
      if message.ReplyAuthor != "" {
        longest = Math.Max(longest, CellText.MeasureWidth(message.ReplyAuthor) + 8)
        longest = Math.Max(longest, CellText.MeasureWidth(message.ReplyText) + 4)
      }
      let bubbleWidth = Math.Min(maxBubble, longest)
      let replyRows = message.ReplyAuthor == "" ? 0 : 2
      let bubbleHeight = lines.Count + replyRows + (stampRow ? 1 : 0)
      let top = row - bubbleHeight + 1
      if top < bounds.Row { break }
      var column = bounds.Column + 3
      if message.Outgoing { column = bounds.Column + bounds.WidthCells - bubbleWidth - 3 }
      let bubbleStyle = message.Outgoing ? theme.Outgoing : theme.Incoming
      screen.Fill(CellRect{
        Column: column,
        Row: top,
        WidthCells: bubbleWidth,
        HeightRows: bubbleHeight,
      }, bubbleStyle)
      var contentRow = top
      if message.ReplyAuthor != "" {
        screen.Write(column + 2, contentRow, "Reply · " + message.ReplyAuthor, theme.Accent)
        screen.Write(column + 2, contentRow + 1, CellText.Clip(message.ReplyText, bubbleWidth - 4), theme.Muted)
        contentRow = contentRow + 2
      }
      for line in lines {
        screen.Write(column + 2, contentRow, CellText.Clip(line, bubbleWidth - 4), bubbleStyle)
        contentRow = contentRow + 1
      }
      screen.Write(column + bubbleWidth - CellText.MeasureWidth(stamp) - 1, row, stamp, theme.Muted)
      if message.Outgoing {
        let tail = Style{ Foreground: theme.Outgoing.Background, Background: theme.Canvas.Background }
        screen.Write(column + bubbleWidth, row, "", tail)
      } else {
        let tail = Style{ Foreground: theme.Incoming.Background, Background: theme.Canvas.Background }
        screen.Write(column - 1, row, "", tail)
      }
      row = top - 2
      index = index - 1
    }
    if row >= bounds.Row + 2 {
      let label = " Today "
      let column = bounds.Column + (bounds.WidthCells - CellText.MeasureWidth(label)) / 2
      screen.Write(column, row - 1, label, theme.Muted)
    }
  }
}
