package Tgtui

import System
import SharpTui

internal open class Composer : Box {
  private let LineLimit int32 = 8
  private var theme TgtuiTheme
  private var reply ReplyBanner
  private var input TextArea
  private var replyMessageId int64

  internal prop Text string -> input.Text
  internal prop HasFocus bool -> input.IsFocused
  internal prop HasReply bool -> replyMessageId != 0
  internal prop ReplyMessageId int64 -> replyMessageId
  internal prop OnSubmit Action[string]? {
    get -> input.OnSubmit
    set -> input.OnSubmit = value
  }

  public init(theme TgtuiTheme, clipboard Clipboard) {
    this.theme = theme
    replyMessageId = 0
    reply = ReplyBanner(theme)
    reply.IsVisible = false
    input = TextArea{
      GrowWeight: 1,
      Style: theme.Composer,
      FocusedStyle: theme.Composer,
      GutterStyle: theme.MutedCanvas,
      SelectedTextStyle: theme.PanelSelected,
      ShowLineNumbers: false,
      Wrapping: TextWrapping.None,
      EnterBehavior: TextAreaEnterBehavior.SubmitOnPlainEnter,
      MaxLines: LineLimit,
      Clipboard: clipboard,
    }
    ShowBorder = true
    Title = "✦ Write a message…   ⇧↵ new line"
    Style = theme.Composer
    Height = CellLength.Cells(3)
    Children.Add(reply)
    Children.Add(input)
  }

  internal func FocusInput() {
    Focus(input)
  }

  internal func OnFirstLine() bool -> input.Caret.LineIndex == 0

  internal func RefreshHeight() {
    let replyRows = HasReply ? 2 : 0
    let lines = Math.Min(LineLimit, input.LineCount)
    Height = CellLength.Cells(2 + replyRows + lines)
    Style = HasFocus ? theme.ComposerFocused : theme.Composer
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
    input.Text = ""
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
