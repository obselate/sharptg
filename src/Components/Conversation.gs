package Tgtui

import System
import System.Collections.Generic
import SharpTui

private enum LinkPreviewLineKind { Accent; Header; Title; Muted }

private class LinkPreviewLine {
  internal let Text string
  internal let Kind LinkPreviewLineKind
  internal let Hyperlink string

  public init(text string, kind LinkPreviewLineKind, hyperlink string) {
    Text = text
    Kind = kind
    Hyperlink = hyperlink
  }
}

private class MessageLayout {
  internal let Lines List[string]
  internal let Preview List[LinkPreviewLine]
  internal let ForwardLines List[string]
  internal let ReplyLines List[string]
  internal let SenderName string
  internal let BubbleWidth int32
  internal let BubbleHeight int32
  internal let Stamp string

  public init(lines List[string], preview List[LinkPreviewLine], forwardLines List[string], replyLines List[string], senderName string, bubbleWidth int32, bubbleHeight int32, stamp string) {
    Lines = lines
    Preview = preview
    ForwardLines = forwardLines
    ReplyLines = replyLines
    SenderName = senderName
    BubbleWidth = bubbleWidth
    BubbleHeight = bubbleHeight
    Stamp = stamp
  }
}

private class ConversationSource : VirtualListSource {
  private var theme TgtuiTheme
  private var messages List[TelegramMessage]

  public init(theme TgtuiTheme) {
    this.theme = theme
    messages = List[TelegramMessage]()
  }

  internal func Update(items List[TelegramMessage]) {
    messages = items
  }

  internal func ItemAt(index int32) TelegramMessage -> messages[index]

  func Count() int32 -> messages.Count

  func KeyAt(index int32) string -> messages[index].Id

  func IndexOfKey(key string) int32 {
    var index = 0
    while index < messages.Count {
      if messages[index].Id == key { return index }
      index = index + 1
    }
    return -1
  }

  func IsSelectable(index int32) bool -> true

  func HeightAt(index int32, width int32) int32 {
    let dayRows = hasDaySeparator(index) ? 2 : 0
    let message = messages[index]
    if message.Kind == TelegramMessageKind.Service {
      return dayRows + serviceLines(message, width).Count + (index + 1 < messages.Count ? 1 : 0)
    }
    return dayRows + layout(index, width).BubbleHeight + (index + 1 < messages.Count ? 1 : 0)
  }

  func Render(index int32, screen Screen, bounds CellRect, clipBounds CellRect, style Style, state VirtualListItemState) {
    if bounds.WidthCells < 12 { return }
    let message = messages[index]
    let focused = hasState(state, VirtualListItemState.Focused)
    var itemRow = bounds.Row
    if hasDaySeparator(index) {
      drawDaySeparator(screen, clipBounds, bounds, itemRow, dayLabel(message.Date))
      itemRow = itemRow + 2
    }
    if message.Kind == TelegramMessageKind.Service {
      drawService(screen, clipBounds, bounds, itemRow, message, focused)
      return
    }
    let measured = layout(index, bounds.WidthCells)
    var bubbleStyle = message.Outgoing ? theme.Outgoing : theme.Incoming
    if focused {
      bubbleStyle = message.Outgoing ? theme.OutgoingSelected : theme.IncomingSelected
    }
    var column = bounds.Column + (message.ShowAuthor && !message.Outgoing ? 6 : 3)
    if message.Outgoing {
      column = bounds.Column + bounds.WidthCells - measured.BubbleWidth - 3
    }
    fillBubble(screen, clipBounds, column, itemRow, measured.BubbleWidth,
      measured.BubbleHeight, bubbleStyle)

    var contentRow = itemRow
    if measured.SenderName != "" {
      let senderStyle = Style{
        Foreground: theme.AccentBlue.Foreground,
        Background: bubbleStyle.Background,
        Attributes: TextAttributes.Bold,
      }
      write(screen, clipBounds, column + 2, contentRow,
        CellText.Clip(measured.SenderName, measured.BubbleWidth - 4), senderStyle)
      let avatarStyle = Style{
        Foreground: theme.Canvas.Foreground,
        Background: theme.AccentBlue.Foreground,
        Attributes: TextAttributes.Bold,
      }
      write(screen, clipBounds, bounds.Column + 1, contentRow,
        CellText.Clip(avatarLabel(message.Author), 2), avatarStyle)
      contentRow = contentRow + 1
    }
    if message.Forwarded {
      let forwardStyle = Style{
        Foreground: Color.Rgb("c792ea"),
        Background: bubbleStyle.Background,
        Attributes: TextAttributes.Bold,
      }
      for line in measured.ForwardLines {
        write(screen, clipBounds, column + 2, contentRow,
          CellText.Clip("↗ " + line, measured.BubbleWidth - 4), forwardStyle)
        contentRow = contentRow + 1
      }
    }
    if message.ReplyAuthor != "" {
      let replyHead = Style{
        Foreground: theme.Reply.Foreground,
        Background: bubbleStyle.Background,
        Attributes: TextAttributes.Bold,
      }
      let replyMuted = Style{ Foreground: theme.Muted.Foreground, Background: bubbleStyle.Background }
      write(screen, clipBounds, column + 2, contentRow,
        CellText.Clip("│ Reply · " + message.ReplyAuthor, measured.BubbleWidth - 4), replyHead)
      contentRow = contentRow + 1
      for replyLine in measured.ReplyLines {
        write(screen, clipBounds, column + 2, contentRow,
          CellText.Clip("│ " + replyLine, measured.BubbleWidth - 4), replyMuted)
        contentRow = contentRow + 1
      }
    }
    if message.LinkPreview?.ShowAboveText ?? false {
      contentRow = drawLinkPreview(screen, clipBounds, measured.Preview, column, contentRow,
        measured.BubbleWidth, bubbleStyle)
    }
    for line in measured.Lines {
      let bodyStyle = contentStyle(message.Kind, bubbleStyle)
      let clipped = CellText.Clip(line, measured.BubbleWidth - 4)
      let hyperlink = hyperlinkForLine(message, line)
      if hyperlink == "" {
        write(screen, clipBounds, column + 2, contentRow, clipped, bodyStyle)
      } else {
        write(screen, clipBounds, column + 2, contentRow, TextRun(clipped, bodyStyle, hyperlink))
      }
      contentRow = contentRow + 1
    }
    if !(message.LinkPreview?.ShowAboveText ?? false) {
      contentRow = drawLinkPreview(screen, clipBounds, measured.Preview, column, contentRow,
        measured.BubbleWidth, bubbleStyle)
    }

    let bottom = itemRow + measured.BubbleHeight - 1
    let stampStyle = receiptStyle(message, bubbleStyle)
    write(screen, clipBounds,
      column + measured.BubbleWidth - CellText.MeasureWidth(measured.Stamp) - 1,
      bottom, measured.Stamp, stampStyle)
    let tail = Style{ Foreground: bubbleStyle.Background, Background: theme.Canvas.Background }
    write(screen, clipBounds, message.Outgoing ? column + measured.BubbleWidth : column - 1,
      bottom, message.Outgoing ? "" : "", tail)
    if focused {
      let markerColumn = message.Outgoing ? column - 2 : column - 3
      let marker = Style{
        Foreground: theme.AccentBlue.Foreground,
        Background: theme.Canvas.Background,
        Attributes: TextAttributes.Bold,
      }
      write(screen, clipBounds, markerColumn, itemRow, "▶", marker)
    }
  }

  private func layout(index int32, width int32) MessageLayout {
    let message = messages[index]
    let edge = message.ShowAuthor && !message.Outgoing ? 7 : 2
    let maxBubble = Math.Max(4, Math.Min(Math.Max(4, width - edge), Math.Max(18, width * 72 / 100)))
    let textWidth = Math.Max(1, maxBubble - 4)
    let lines = CellText.Wrap(message.Text, textWidth)
    if lines.Count == 0 { lines.Add("") }
    let preview = linkPreviewLines(message.LinkPreview, textWidth)
    let stamp = (message.Edited ? "ed " : "") + message.Time + receiptText(message.Receipt)
    let stampWidth = CellText.MeasureWidth(stamp)
    var longest = stampWidth + 4
    for line in lines { longest = Math.Max(longest, CellText.MeasureWidth(line) + 4) }
    for line in preview { longest = Math.Max(longest, CellText.MeasureWidth(line.Text) + 4) }
    let lastLineWidth = CellText.MeasureWidth(lines[lines.Count - 1])
    let stampRow = preview.Count > 0 || lastLineWidth + stampWidth + 5 > maxBubble
    if !stampRow { longest = Math.Max(longest, lastLineWidth + stampWidth + 5) }
    let replyLines = message.ReplyAuthor == "" ? List[string]() :
    CellText.Wrap(message.ReplyText, Math.Max(1, textWidth - 2))
    let senderName = showSender(index) ? message.Author : ""
    let forwardLines = List[string]()
    if message.Forwarded {
      var label = "Forwarded from " + (message.ForwardAuthor == "" ? "Unknown" : message.ForwardAuthor)
      if message.ForwardAuthorSecondary != "" {
        label = label + " (" + message.ForwardAuthorSecondary + ")"
      }
      let wrapped = CellText.Wrap(label, Math.Max(1, textWidth - 2))
      for line in wrapped { forwardLines.Add(line) }
    }
    if senderName != "" { longest = Math.Max(longest, CellText.MeasureWidth(senderName) + 4) }
    for line in forwardLines {
      longest = Math.Max(longest, CellText.MeasureWidth(line) + 6)
    }
    if message.ReplyAuthor != "" {
      longest = Math.Max(longest, CellText.MeasureWidth(message.ReplyAuthor) + 8)
      for replyLine in replyLines {
        longest = Math.Max(longest, CellText.MeasureWidth(replyLine) + 6)
      }
    }
    let bubbleWidth = Math.Max(4, Math.Min(maxBubble, longest))
    let replyRows = message.ReplyAuthor == "" ? 0 : 1 + replyLines.Count
    let senderRows = senderName == "" ? 0 : 1
    let contentRows = lines.Count + preview.Count + forwardLines.Count + replyRows + senderRows
    let bubbleHeight = Math.Max(1, contentRows + (stampRow ? 1 : 0))
    return MessageLayout(lines, preview, forwardLines, replyLines, senderName,
      bubbleWidth, bubbleHeight, stamp)
  }

  private func showSender(index int32) bool {
    let message = messages[index]
    if !message.ShowAuthor || message.Outgoing || message.Author == "" { return false }
    if index == 0 { return true }
    let previous = messages[index - 1]
    return previous.Outgoing || previous.SenderId != message.SenderId
      || previous.SenderIsChat != message.SenderIsChat
      || previous.Kind == TelegramMessageKind.Service
  }

  private func hasDaySeparator(index int32) bool {
    let date = messages[index].Date
    if date <= 0 { return false }
    if index == 0 || messages[index - 1].Date <= 0 { return true }
    let current = DateTimeOffset.FromUnixTimeSeconds(date).ToLocalTime().Date
    let previous = DateTimeOffset.FromUnixTimeSeconds(messages[index - 1].Date).ToLocalTime().Date
    return current != previous
  }

  private func dayLabel(timestamp int32) string {
    if timestamp <= 0 { return "" }
    let date = DateTimeOffset.FromUnixTimeSeconds(timestamp).ToLocalTime().Date
    let today = DateTimeOffset.Now.Date
    if date == today { return "Today" }
    if date == today.AddDays(-1) { return "Yesterday" }
    if date.Year == today.Year { return date.ToString("dd MMMM") }
    return date.ToString("dd MMMM yyyy")
  }

  private func drawDaySeparator(screen Screen, clipBounds CellRect, bounds CellRect, row int32, label string) {
    if label == "" { return }
    let text = " " + label + " "
    let column = bounds.Column + Math.Max(0, (bounds.WidthCells - CellText.MeasureWidth(text)) / 2)
    write(screen, clipBounds, column, row, text, theme.MutedCanvas)
  }

  private func serviceLines(message TelegramMessage, width int32) List[string] ->
  CellText.Wrap(message.Text, Math.Max(1, width - 6))

  private func drawService(screen Screen, clipBounds CellRect, bounds CellRect, row int32, message TelegramMessage, focused bool) {
    let lines = serviceLines(message, bounds.WidthCells)
    var current = row
    for line in lines {
      let column = bounds.Column + Math.Max(1, (bounds.WidthCells - CellText.MeasureWidth(line)) / 2)
      var serviceStyle = theme.MutedCanvas
      if focused {
        serviceStyle = Style{
          Foreground: theme.Muted.Foreground,
          Background: theme.IncomingSelected.Background,
          Attributes: TextAttributes.Bold,
        }
      }
      write(screen, clipBounds, column, current, line, serviceStyle)
      current = current + 1
    }
  }

  private func receiptText(status TelegramReceiptStatus) string {
    if status == TelegramReceiptStatus.Pending { return " ◌" }
    if status == TelegramReceiptStatus.Failed { return " ✗" }
    if status == TelegramReceiptStatus.Sent { return " ✓" }
    if status == TelegramReceiptStatus.Read { return " ✓✓" }
    return ""
  }

  private func receiptStyle(message TelegramMessage, bubbleStyle Style) Style {
    var foreground = theme.Muted.Foreground
    var attributes = TextAttributes.None
    if message.Receipt == TelegramReceiptStatus.Failed {
      foreground = theme.Offline.Foreground
      attributes = TextAttributes.Bold
    } else if message.Receipt == TelegramReceiptStatus.Read {
      foreground = theme.AccentBlue.Foreground
      attributes = TextAttributes.Bold
    }
    return Style{
      Foreground: foreground,
      Background: bubbleStyle.Background,
      Attributes: attributes,
    }
  }

  private func contentStyle(kind TelegramMessageKind, bubbleStyle Style) Style {
    let accented = kind == TelegramMessageKind.Photo || kind == TelegramMessageKind.Video
      || kind == TelegramMessageKind.Voice || kind == TelegramMessageKind.Audio
      || kind == TelegramMessageKind.Document || kind == TelegramMessageKind.Sticker
      || kind == TelegramMessageKind.Animation || kind == TelegramMessageKind.Location
      || kind == TelegramMessageKind.Poll
    return Style{
      Foreground: accented ? theme.AccentBlue.Foreground : bubbleStyle.Foreground,
      Background: bubbleStyle.Background,
    }
  }

  private func hyperlinkForLine(message TelegramMessage, line string) string {
    for link in message.Links {
      if line.Contains(link, StringComparison.OrdinalIgnoreCase) { return link }
      let visible = visibleLink(link)
      if visible != "" && line.Contains(visible, StringComparison.OrdinalIgnoreCase) { return link }
    }
    return ""
  }

  private func visibleLink(link string) string {
    if link.StartsWith("https://", StringComparison.OrdinalIgnoreCase) { return link.Substring(8) }
    if link.StartsWith("http://", StringComparison.OrdinalIgnoreCase) { return link.Substring(7) }
    if link.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase) { return link.Substring(7) }
    return link
  }

  private func avatarLabel(name string) string {
    let clean = name.Trim()
    if clean == "" { return "?" }
    let words = clean.Split(' ', StringSplitOptions.RemoveEmptyEntries)
    if words.Length > 1 {
      return (words[0].Substring(0, 1) + words[1].Substring(0, 1)).ToUpperInvariant()
    }
    return clean.Length == 1 ? clean.ToUpperInvariant() : clean.Substring(0, 2).ToUpperInvariant()
  }

  private func linkPreviewLines(preview TelegramLinkPreview?, width int32) List[LinkPreviewLine] {
    let lines = List[LinkPreviewLine]()
    guard let value = preview else { return lines }
    let contentWidth = Math.Max(1, width - 2)
    lines.Add(LinkPreviewLine("│ " + "".PadLeft(contentWidth, '─'),
      LinkPreviewLineKind.Accent, ""))
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
    addPreviewLine(lines, header, contentWidth, LinkPreviewLineKind.Header, "")
    addWrappedPreview(lines, value.Title, contentWidth, LinkPreviewLineKind.Title, 0)
    addWrappedPreview(lines, value.Description, contentWidth, LinkPreviewLineKind.Muted, 4)
    if value.Author != "" {
      addPreviewLine(lines, "by " + value.Author, contentWidth, LinkPreviewLineKind.Muted, "")
    }
    let link = value.DisplayUrl != "" ? value.DisplayUrl : value.Url
    let target = value.Url != "" ? value.Url : value.DisplayUrl
    addPreviewLine(lines, link, contentWidth, LinkPreviewLineKind.Accent, target)
    return lines
  }

  private func addPreviewLine(lines List[LinkPreviewLine], text string, width int32, kind LinkPreviewLineKind, hyperlink string) {
    if text == "" { return }
    lines.Add(LinkPreviewLine("│ " + CellText.Clip(text, width), kind, hyperlink))
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
      lines.Add(LinkPreviewLine("│ " + line, kind, ""))
      index = index + 1
    }
  }

  private func drawLinkPreview(screen Screen, clipBounds CellRect, lines List[LinkPreviewLine], column int32, row int32, bubbleWidth int32, bubbleStyle Style) int32 {
    var current = row
    for line in lines {
      let previewStyle = linkPreviewStyle(line.Kind, bubbleStyle)
      let text = CellText.Clip(line.Text, bubbleWidth - 4)
      if line.Hyperlink == "" {
        write(screen, clipBounds, column + 2, current, text, previewStyle)
      } else {
        write(screen, clipBounds, column + 2, current,
          TextRun(text, previewStyle, line.Hyperlink))
      }
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

  private func fillBubble(screen Screen, clipBounds CellRect, column int32, row int32, width int32, height int32, style Style) {
    let top = Math.Max(row, clipBounds.Row)
    let bottom = Math.Min(row + height, clipBounds.Row + clipBounds.HeightRows)
    if bottom <= top { return }
    screen.Fill(CellRect{ Column: column, Row: top, WidthCells: width, HeightRows: bottom - top }, style)
  }

  private func write(screen Screen, clipBounds CellRect, column int32, row int32, text string, style Style) {
    screen.WriteClipped(clipBounds, column - clipBounds.Column, row - clipBounds.Row, text, style)
  }

  private func write(screen Screen, clipBounds CellRect, column int32, row int32, run TextRun) {
    screen.WriteClipped(clipBounds, column - clipBounds.Column, row - clipBounds.Row, run)
  }

  private func hasState(state VirtualListItemState, value VirtualListItemState) bool ->
  (int32(state) & int32(value)) != 0
}

internal open class Conversation : Box {
  private var theme TgtuiTheme
  private var source ConversationSource
  private var list VirtualListView
  private var loading bool
  private var hasChat bool

  public init(theme TgtuiTheme) {
    this.theme = theme
    source = ConversationSource(theme)
    list = VirtualListView{ Source: source, FollowTail: true }
    loading = false
    hasChat = false
    GrowWeight = 1
    Style = theme.Canvas
    Children.Add(list)
    Children.Add(Box{ Height: CellLength.Cells(1), Style: theme.Canvas })
  }

  internal prop HasFocus bool -> list.IsFocused

  internal prop SelectedMessage TelegramMessage? {
    get {
      let index = list.SelectedIndex
      if index < 0 || index >= source.Count() { return nil }
      return source.ItemAt(index)
    }
  }

  internal func Update(items List[TelegramMessage], isLoading bool) {
    let selectedKey = list.SelectedKey
    source.Update(items)
    let preserved = selectedKey != "" && source.IndexOfKey(selectedKey) >= 0
    list.Refresh()
    if !preserved && items.Count > 0 {
      list.SelectedIndex = items.Count - 1
      list.FollowTail = true
    }
    loading = isLoading
    hasChat = true
  }

  internal func Clear() {
    source.Update(List[TelegramMessage]())
    list.Refresh()
    list.FollowTail = true
    loading = false
    hasChat = false
  }

  internal func FocusList() {
    Focus(list)
  }

  internal func SelectNewest() {
    if source.Count() == 0 { return }
    list.SelectedIndex = source.Count() - 1
    list.FollowTail = true
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    screen.Fill(bounds, theme.Canvas)
    if bounds.WidthCells < 12 || bounds.HeightRows < 2 || source.Count() > 0 { return }
    let empty = !hasChat ? "Select a chat to read messages" :
    (loading ? "Loading messages..." : "No messages")
    let column = bounds.Column + Math.Max(1, (bounds.WidthCells - CellText.MeasureWidth(empty)) / 2)
    let row = bounds.Row + bounds.HeightRows / 2
    screen.Write(column, row, empty, theme.Muted)
  }
}
