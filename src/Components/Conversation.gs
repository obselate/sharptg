package Tgtui

import System
import System.Collections.Generic
import SharpTui

internal enum LinkPreviewLineKind { Accent; Header; Title; Muted }

internal class LinkPreviewLine {
  internal let Text string
  internal let Kind LinkPreviewLineKind

  public init(text string, kind LinkPreviewLineKind) {
    Text = text
    Kind = kind
  }
}

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
    var row = bounds.Row + bounds.HeightRows - 2
    var index = messages.Count - 1
    while index >= 0 && row >= bounds.Row {
      let message = messages[index]
      let maxBubble = Math.Max(18, bounds.WidthCells * 72 / 100)
      let textWidth = Math.Max(8, maxBubble - 4)
      let lines = CellText.Wrap(message.Text, textWidth)
      let preview = linkPreviewLines(message.LinkPreview, textWidth)
      let receipt = message.Outgoing && message.Read ? " ✓✓" : ""
      let stamp = message.Time + receipt
      let stampWidth = CellText.MeasureWidth(stamp)
      var longest = stampWidth + 4
      for line in lines {
        longest = Math.Max(longest, CellText.MeasureWidth(line) + 4)
      }
      for line in preview {
        longest = Math.Max(longest, CellText.MeasureWidth(line.Text) + 4)
      }
      let lastLineWidth = lines.Count == 0 ? 0 : CellText.MeasureWidth(lines[lines.Count - 1])
      let stampRow = preview.Count > 0 || lastLineWidth + stampWidth + 5 > maxBubble
      if !stampRow { longest = Math.Max(longest, lastLineWidth + stampWidth + 5) }
      if message.ReplyAuthor != "" {
        longest = Math.Max(longest, CellText.MeasureWidth(message.ReplyAuthor) + 8)
        longest = Math.Max(longest, CellText.MeasureWidth(message.ReplyText) + 4)
      }
      let bubbleWidth = Math.Min(maxBubble, longest)
      let replyRows = message.ReplyAuthor == "" ? 0 : 2
      let bubbleHeight = lines.Count + preview.Count + replyRows + (stampRow ? 1 : 0)
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
      if message.LinkPreview?.ShowAboveText ?? false {
        contentRow = drawLinkPreview(screen, preview, column, contentRow, bubbleWidth, bubbleStyle)
      }
      for line in lines {
        screen.Write(column + 2, contentRow, CellText.Clip(line, bubbleWidth - 4), bubbleStyle)
        contentRow = contentRow + 1
      }
      if !(message.LinkPreview?.ShowAboveText ?? false) {
        contentRow = drawLinkPreview(screen, preview, column, contentRow, bubbleWidth, bubbleStyle)
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

  private func linkPreviewLines(preview TelegramLinkPreview?, width int32) List[LinkPreviewLine] {
    let lines = List[LinkPreviewLine]()
    guard let value = preview else { return lines }
    let contentWidth = Math.Max(1, width - 2)
    lines.Add(LinkPreviewLine("│ " + "".PadLeft(contentWidth, '─'), LinkPreviewLineKind.Accent))
    var header = value.SiteName
    if header == "" { header = value.DisplayUrl }
    if header == "" { header = value.Url }
    if value.TypeLabel != "" {
      if header != "" { header = header + " · " }
      header = header + value.TypeLabel
    }
    if value.HasMedia && !header.Contains("Photo") && !header.Contains("Video") && !header.Contains("GIF") {
      if header != "" { header = header + " " }
      header = header + "🖼"
    }
    addPreviewLine(lines, header, contentWidth, LinkPreviewLineKind.Header)
    addWrappedPreview(lines, value.Title, contentWidth, LinkPreviewLineKind.Title, 0)
    addWrappedPreview(lines, value.Description, contentWidth, LinkPreviewLineKind.Muted, 4)
    if value.Author != "" {
      addPreviewLine(lines, "by " + value.Author, contentWidth, LinkPreviewLineKind.Muted)
    }
    let link = value.DisplayUrl != "" ? value.DisplayUrl : value.Url
    addPreviewLine(lines, link, contentWidth, LinkPreviewLineKind.Accent)
    return lines
  }

  private func addPreviewLine(lines List[LinkPreviewLine], text string, width int32, kind LinkPreviewLineKind) {
    if text == "" { return }
    lines.Add(LinkPreviewLine("│ " + CellText.Clip(text, width), kind))
  }

  private func addWrappedPreview(lines List[LinkPreviewLine], text string, width int32, kind LinkPreviewLineKind, limit int32) {
    if text == "" { return }
    let wrapped = CellText.Wrap(text, width)
    var index = 0
    while index < wrapped.Count && (limit == 0 || index < limit) {
      var line = wrapped[index]
      if limit > 0 && index + 1 == limit && wrapped.Count > limit {
        line = CellText.Clip(line, Math.Max(1, width - 1)) + "…"
      }
      lines.Add(LinkPreviewLine("│ " + line, kind))
      index = index + 1
    }
  }

  private func drawLinkPreview(screen Screen, lines List[LinkPreviewLine], column int32, row int32, bubbleWidth int32, bubbleStyle Style) int32 {
    var current = row
    for line in lines {
      let style = linkPreviewStyle(line.Kind, bubbleStyle)
      screen.Write(column + 2, current, CellText.Clip(line.Text, bubbleWidth - 4), style)
      current = current + 1
    }
    return current
  }

  private func linkPreviewStyle(kind LinkPreviewLineKind, bubbleStyle Style) Style {
    if kind == LinkPreviewLineKind.Header {
      return Style{
        Foreground: theme.Accent.Foreground,
        Background: bubbleStyle.Background,
        Attributes: TextAttributes.Bold,
      }
    }
    if kind == LinkPreviewLineKind.Title {
      return Style{
        Foreground: bubbleStyle.Foreground,
        Background: bubbleStyle.Background,
        Attributes: TextAttributes.Bold,
      }
    }
    if kind == LinkPreviewLineKind.Muted {
      return Style{ Foreground: theme.Muted.Foreground, Background: bubbleStyle.Background }
    }
    return Style{ Foreground: theme.Accent.Foreground, Background: bubbleStyle.Background }
  }
}
