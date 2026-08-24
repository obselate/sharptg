package Tgtui

import System
import System.Collections.Generic
import SharpTui

internal open class Composer : Box {
  private var theme TgtuiTheme
  private var reply ReplyBanner
  private var input ComposerInput
  private var focused bool
  private var replyMessageId int64

  internal prop Text string -> input.Text
  internal prop IsFocused bool -> focused
  internal prop HasReply bool -> replyMessageId != 0
  internal prop ReplyMessageId int64 -> replyMessageId

  public init(theme TgtuiTheme) {
    this.theme = theme
    focused = false
    replyMessageId = 0
    reply = ReplyBanner(theme)
    reply.IsVisible = false
    input = ComposerInput(theme)
    input.GrowWeight = 1
    ShowBorder = true
    Title = "✦ Write a message…   ⇧↵ new line"
    Style = theme.Composer
    Height = CellLength.Cells(3)
    Children.Add(reply)
    Children.Add(input)
  }

  internal func SetFocused(value bool) {
    focused = value
    input.SetFocused(value)
    Style = value ? theme.ComposerFocused : theme.Composer
  }

  internal func Handle(ev UiEvent) EventResult -> input.Handle(ev)

  internal func OnFirstLine() bool -> input.OnFirstLine

  internal func RefreshHeight() {
    let replyRows = HasReply ? 2 : 0
    let lines = Math.Min(5, input.LineCount)
    Height = CellLength.Cells(2 + replyRows + lines)
  }

  internal func StartReply(message TelegramMessage) {
    replyMessageId = message.TdId
    if replyMessageId == 0 { Int64.TryParse(message.Id, out replyMessageId) }
    reply.Update(message.Outgoing ? "you" : message.Author, message.Text)
    reply.IsVisible = true
    RefreshHeight()
  }

  internal func ClearReply() {
    replyMessageId = 0
    reply.Clear()
    reply.IsVisible = false
    RefreshHeight()
  }

  internal func Clear() {
    input.Clear()
    ClearReply()
  }
}

internal open class ReplyBanner : Box {
  private var theme TgtuiTheme
  private var author string
  private var preview string

  public init(theme TgtuiTheme) {
    this.theme = theme
    author = ""
    preview = ""
    Height = CellLength.Cells(2)
    Style = theme.Panel
  }

  internal func Update(author string, preview string) {
    this.author = author
    this.preview = preview.Replace("\n", " ")
  }

  internal func Clear() {
    author = ""
    preview = ""
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    screen.Fill(bounds, theme.Panel)
    if bounds.HeightRows == 0 || bounds.WidthCells < 4 { return }
    screen.WriteClipped(bounds, 0, 0, "│ Reply · " + author, theme.Reply)
    if bounds.HeightRows > 1 {
      screen.WriteClipped(bounds, 0, 1, "│ " + preview, theme.MutedPanel)
    }
  }
}

internal open class ComposerInput : Box {
  private var theme TgtuiTheme
  private var text string
  private var caret int32
  private var focused bool

  internal prop Text string -> text
  internal prop LineCount int32 -> countLines()
  internal prop OnFirstLine bool -> lineOf(caret) == 0

  public init(theme TgtuiTheme) {
    this.theme = theme
    text = ""
    caret = 0
    focused = false
    Style = theme.Composer
  }

  internal func SetFocused(value bool) {
    focused = value
  }

  internal func Clear() {
    text = ""
    caret = 0
  }

  internal func Handle(ev UiEvent) EventResult {
    if ev.Phase == KeyPhase.Release { return EventResult.Continue }
    if ev.Kind == UiEventKind.Paste {
      insert(ev.Text.Replace("\r", ""))
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && ev.Mouse == MouseKind.Press && ContentBounds.Contains(ev.Position) {
      moveToPoint(ev.Position)
      return EventResult.Handled
    }
    if ev.Kind != UiEventKind.Key && ev.Kind != UiEventKind.TextInput { return EventResult.Continue }
    if hasWindowModifier(ev.Modifiers) { return EventResult.Continue }
    if ev.Key == Key.Enter {
      if newLineGesture(ev.Modifiers) && LineCount < 5 {
        insert("\n")
        return EventResult.Handled
      }
      return EventResult.Continue
    }
    if ev.Key == Key.Character {
      if hasShortcutModifier(ev.Modifiers) { return EventResult.Continue }
      insert(ev.Text)
      return EventResult.Handled
    }
    if ev.Key == Key.Backspace {
      if caret == 0 { return EventResult.Continue }
      remove(caret - 1)
      return EventResult.Handled
    }
    if ev.Key == Key.Delete {
      if caret >= graphemes().Count { return EventResult.Continue }
      remove(caret)
      return EventResult.Handled
    }
    if ev.Key == Key.Left {
      if caret == 0 { return EventResult.Continue }
      caret = caret - 1
      return EventResult.Handled
    }
    if ev.Key == Key.Right {
      if caret >= graphemes().Count { return EventResult.Continue }
      caret = caret + 1
      return EventResult.Handled
    }
    if ev.Key == Key.Up { return moveVertical(-1) ? EventResult.Handled : EventResult.Continue }
    if ev.Key == Key.Down { return moveVertical(1) ? EventResult.Handled : EventResult.Continue }
    if ev.Key == Key.Home {
      caret = lineStart(caret)
      return EventResult.Handled
    }
    if ev.Key == Key.End {
      caret = lineEnd(caret)
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    screen.Fill(bounds, theme.Composer)
    if bounds.HeightRows == 0 || bounds.WidthCells == 0 { return }
    if text == "" {
      screen.WriteClipped(bounds, 0, 0, "Write a message…", theme.MutedCanvas)
    } else {
      let lines = text.Replace("\r", "").Split('\n')
      var row = 0
      while row < lines.Length && row < bounds.HeightRows {
        screen.WriteClipped(bounds, 0, row, lines[row], theme.Composer)
        row = row + 1
      }
    }
    if !focused { return }
    let row = lineOf(caret)
    if row < 0 || row >= bounds.HeightRows { return }
    let column = cellColumn(caret)
    if column < 0 || column >= bounds.WidthCells { return }
    let clusters = graphemes()
    let glyph = caret < clusters.Count && clusters[caret] != "\n" ? clusters[caret] : " "
    screen.WriteCell(bounds.Column + column, bounds.Row + row, glyph, theme.Composer.Inverted())
  }

  private func insert(value string) {
    if value == "" { return }
    let source = graphemes()
    let added = CellText.Graphemes(value)
    var result = ""
    var index = 0
    while index < source.Count {
      if index == caret { result = result + value }
      result = result + source[index]
      index = index + 1
    }
    if caret == source.Count { result = result + value }
    text = result
    caret = caret + added.Count
  }

  private func remove(index int32) {
    let source = graphemes()
    if index < 0 || index >= source.Count { return }
    var result = ""
    var current = 0
    while current < source.Count {
      if current != index { result = result + source[current] }
      current = current + 1
    }
    text = result
    if index < caret { caret = caret - 1 }
  }

  private func moveVertical(delta int32) bool {
    let line = lineOf(caret)
    let target = line + delta
    if target < 0 || target >= LineCount { return false }
    let column = caret - lineStart(caret)
    var start = 0
    var current = 0
    while current < target {
      start = lineEnd(start) + 1
      current = current + 1
    }
    caret = Math.Min(start + column, lineEnd(start))
    return true
  }

  private func moveToPoint(point CellPoint) {
    let targetLine = Math.Max(0, Math.Min(LineCount - 1, point.Row - ContentBounds.Row))
    var start = 0
    var line = 0
    while line < targetLine {
      start = lineEnd(start) + 1
      line = line + 1
    }
    let end = lineEnd(start)
    let wanted = Math.Max(0, point.Column - ContentBounds.Column)
    caret = start
    while caret < end && cellColumn(caret + 1) <= wanted { caret = caret + 1 }
  }

  private func lineStart(index int32) int32 {
    let source = graphemes()
    var current = Math.Min(index, source.Count)
    while current > 0 && source[current - 1] != "\n" { current = current - 1 }
    return current
  }

  private func lineEnd(index int32) int32 {
    let source = graphemes()
    var current = Math.Min(index, source.Count)
    while current < source.Count && source[current] != "\n" { current = current + 1 }
    return current
  }

  private func lineOf(index int32) int32 {
    let source = graphemes()
    var line = 0
    var current = 0
    while current < index && current < source.Count {
      if source[current] == "\n" { line = line + 1 }
      current = current + 1
    }
    return line
  }

  private func cellColumn(index int32) int32 {
    let source = graphemes()
    let start = lineStart(index)
    var width = 0
    var current = start
    while current < index && current < source.Count {
      width = width + CellText.MeasureWidth(source[current])
      current = current + 1
    }
    return width
  }

  private func countLines() int32 {
    var count = 1
    for cluster in graphemes() {
      if cluster == "\n" { count = count + 1 }
    }
    return count
  }

  private func graphemes() List[string] -> CellText.Graphemes(text)

  private func newLineGesture(modifiers KeyModifiers) bool {
    let locks = int32(KeyModifiers.CapsLock) | int32(KeyModifiers.NumLock)
    let held = int32(modifiers) & (int32(0x7fffffff) ^ locks)
    return held == int32(KeyModifiers.Shift) || held == int32(KeyModifiers.Ctrl)
      || held == int32(KeyModifiers.Alt)
  }

  private func hasShortcutModifier(modifiers KeyModifiers) bool {
    let shortcuts = int32(KeyModifiers.Ctrl) | int32(KeyModifiers.Alt) | int32(KeyModifiers.Super)
    | int32(KeyModifiers.Hyper) | int32(KeyModifiers.Meta)
    return (int32(modifiers) & shortcuts) != 0
  }

  private func hasWindowModifier(modifiers KeyModifiers) bool {
    let window = int32(KeyModifiers.Super) | int32(KeyModifiers.Hyper) | int32(KeyModifiers.Meta)
    return (int32(modifiers) & window) != 0
  }
}
