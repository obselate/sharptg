package Tgtui

import System
import System.Collections.Generic
import System.Diagnostics
import SharpTui

internal open class TgtuiView : Column {
  private let NarrowBreakpoint int32 = 70
  private let CompactFooterBreakpoint int32 = 100
  private var app App
  private var service TelegramService
  private var theme TgtuiTheme
  private var status TopStatus
  private var footer StatusBar
  private var dialogs DialogList
  private var header ConversationHeader
  private var conversation Conversation
  private var composer Composer
  private var body Row
  private var sidebar Column
  private var divider Divider
  private var chat Column
  private var actions MessageActions
  private var revision int32
  private var narrow bool
  private var dialogsVisible bool
  private var sidebarExpanded bool
  private var forwardPicking bool
  private var forwardMessage TelegramMessage?
  private var forwardSourceIndex int32
  private var forwardSourceChatId int64

  public init(app App, service TelegramService, theme TgtuiTheme) {
    this.app = app
    this.service = service
    this.theme = theme
    revision = -1
    narrow = false
    dialogsVisible = false
    sidebarExpanded = true
    forwardPicking = false
    forwardMessage = nil
    forwardSourceIndex = -1
    forwardSourceChatId = 0

    status = TopStatus(theme)
    footer = StatusBar{
      Height: CellLength.Cells(1),
      Style: theme.FooterText,
    }
    dialogs = DialogList(theme)
    dialogs.GrowWeight = 1
    header = ConversationHeader(theme)
    conversation = Conversation(theme)
    composer = Composer(theme, app.Clipboard)
    composer.OnSubmit = text -> send(text)
    sidebar = Column{
      Width: CellLength.Cells(34),
      Style: theme.Sidebar,
      Children: { dialogs },
    }
    chat = Column{
      GrowWeight: 1,
      Style: theme.Border,
      ShowBorder: true,
      Children: { header, conversation, composer },
    }
    divider = Divider(theme.Header)
    actions = MessageActions(theme)
    actions.OnChosen = action -> chooseAction(action)
    body = Row{
      GrowWeight: 1,
      Style: theme.Canvas,
      Children: { sidebar, divider, chat },
    }
    Style = theme.Canvas
    Children.Add(status)
    Children.Add(body)
    Children.Add(footer)
    Children.Add(actions.Root)
    sync()
    focusCompose()
  }

  protected override func PrepareLayout() {
    let selected = dialogs.ConsumeSelection()
    if selected >= 0 { service.Select(selected) }
    let tab = dialogs.ConsumeTab()
    if tab >= 0 { service.SetChatList(tab) }
    sync()
    composer.RefreshHeight()
    applyResponsive(Bounds.WidthCells)
    updateFooter()
  }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Phase == KeyPhase.Release { return EventResult.Continue }
    if KeyGesture.Ctrl("q").Matches(ev) { return EventResult.Exit }
    if KeyGesture.Ctrl("b").Matches(ev) {
      toggleSidebar()
      return EventResult.Handled
    }
    if ev.Key == Key.Escape {
      escapeSection()
      return EventResult.Handled
    }
    if dialogs.HasFocus {
      return handleDialogs(ev)
    }
    if conversation.HasFocus {
      return handleHistory(ev)
    }
    if composer.HasFocus {
      return handleCompose(ev)
    }
    return EventResult.Continue
  }

  private func handleDialogs(ev UiEvent) EventResult {
    if plainNavigation(ev) && (ev.Key == Key.Left || ev.Key == Key.Right) {
      if dialogs.MoveTab(ev.Key == Key.Right ? 1 : -1) {
        let tab = dialogs.ConsumeTab()
        if tab >= 0 { service.SetChatList(tab) }
        sync()
      }
      return EventResult.Handled
    }
    if ev.Key == Key.Enter {
      service.Select(dialogs.SelectedIndex)
      if forwardPicking {
        completeForward()
      } else {
        sync()
        if narrow { dialogsVisible = false }
        focusCompose()
      }
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func handleHistory(ev UiEvent) EventResult {
    if ev.Key == Key.Left && plainNavigation(ev) {
      if narrow { focusCompose() }
      else { dialogs.FocusList() }
      return EventResult.Handled
    }
    if ev.Key == Key.Enter {
      if let message = conversation.SelectedMessage {
        actions.Open(message, composer.IsVisible)
      }
      return EventResult.Handled
    }
    if ev.Key == Key.PageUp && plainNavigation(ev) {
      service.LoadMoreMessages()
      sync()
      return EventResult.Handled
    }
    if shortcut(ev, "r", "R") {
      if composer.IsVisible {
        if let message = conversation.SelectedMessage {
          if message.Kind != TelegramMessageKind.Service { startReply(message) }
        }
      }
      return EventResult.Handled
    }
    if shortcut(ev, "f", "F") {
      if let message = conversation.SelectedMessage {
        if message.Kind != TelegramMessageKind.Service { startForward(message) }
      }
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func handleCompose(ev UiEvent) EventResult {
    if ev.Key == Key.Up && plainNavigation(ev) && composer.OnFirstLine() {
      conversation.SelectNewest()
      focusHistory()
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func chooseAction(action MessageAction) {
    let source = actions.Message
    actions.Close()
    guard let message = source else { return }
    if action.Kind == MessageActionKind.Reply {
      startReply(message)
      return
    }
    if action.Kind == MessageActionKind.Forward {
      startForward(message)
      return
    }
    openLink(action.Url)
    focusHistory()
  }

  private func startReply(message TelegramMessage) {
    conversation.SelectNewest()
    composer.StartReply(message)
    focusCompose()
  }

  private func startForward(message TelegramMessage) {
    conversation.SelectNewest()
    forwardPicking = true
    forwardMessage = message
    forwardSourceIndex = service.SelectedIndex
    forwardSourceChatId = if let chat = service.SelectedChat { chat.TdId } else { 0 }
    if narrow { dialogsVisible = true }
    dialogs.FocusList()
  }

  private func completeForward() {
    if let message = forwardMessage {
      service.Forward(message, forwardSourceChatId, service.SelectedIndex)
    }
    let sourceIndex = forwardSourceIndex
    clearForward()
    if sourceIndex >= 0 { service.Select(sourceIndex) }
    if narrow { dialogsVisible = false }
    focusHistory()
    sync()
  }

  private func clearForward() {
    forwardPicking = false
    forwardMessage = nil
    forwardSourceIndex = -1
    forwardSourceChatId = 0
  }

  private func openLink(url string) {
    if url == "" { return }
    try {
      Process.Start(ProcessStartInfo{ FileName: url, UseShellExecute: true })
    } catch (failure Exception) {
      app.RequestDraw()
    }
  }

  private func escapeSection() {
    if forwardPicking {
      let sourceIndex = forwardSourceIndex
      clearForward()
      if sourceIndex >= 0 { service.Select(sourceIndex) }
      if narrow { dialogsVisible = false }
      focusHistory()
      return
    }
    if conversation.HasFocus {
      focusCompose()
      return
    }
    if composer.HasFocus {
      composer.Clear()
      service.Deselect()
      if narrow { dialogsVisible = true }
      dialogs.FocusList()
      return
    }
    dialogs.FocusList()
  }

  private func toggleSidebar() {
    if narrow {
      dialogsVisible = !dialogsVisible
      if dialogsVisible { dialogs.FocusList() }
      else { focusCompose() }
    } else {
      sidebarExpanded = !sidebarExpanded
      sidebar.IsVisible = sidebarExpanded
      divider.IsVisible = sidebarExpanded
    }
  }

  private func focusCompose() {
    if composer.IsVisible { composer.FocusInput() }
    else { dialogs.FocusList() }
  }

  private func focusHistory() {
    conversation.FocusList()
  }

  private func send(text string) {
    service.Send(text, composer.ReplyMessageId)
    if text.Trim() != "" {
      conversation.SelectNewest()
      composer.Clear()
    }
    sync()
  }

  private func sync() {
    if revision == service.Revision { return }
    revision = service.Revision
    dialogs.Update(service.Chats, service.SelectedIndex, service.ChatListTitles,
      service.ActiveChatListIndex, service.ChatsLoading)
    status.Update(service.ConnectionState, service.ConnectionText, service.AccountName)
    if let selected = service.SelectedChat {
      header.Update(selected)
      conversation.Update(selected.Messages, service.MessagesLoading)
      composer.IsVisible = selected.CanSend
      return
    }
    header.Clear()
    conversation.Clear()
    composer.IsVisible = false
  }

  private func applyResponsive(width int32) {
    let nextNarrow = width < NarrowBreakpoint
    if nextNarrow != narrow {
      narrow = nextNarrow
      dialogsVisible = false
      if narrow { focusCompose() }
      app.RequestDraw()
    }
    if narrow {
      sidebar.Width = CellLength.Auto
      sidebar.GrowWeight = 1
      sidebar.IsVisible = dialogsVisible
      divider.IsVisible = false
      chat.Width = CellLength.Auto
      chat.GrowWeight = 1
      chat.IsVisible = !dialogsVisible
    } else {
      sidebar.Width = CellLength.Cells(34)
      sidebar.GrowWeight = 0
      sidebar.IsVisible = sidebarExpanded
      divider.IsVisible = sidebarExpanded
      chat.Width = CellLength.Auto
      chat.GrowWeight = 1
      chat.IsVisible = true
    }
  }

  private func updateFooter() {
    if Bounds.WidthCells < CompactFooterBreakpoint {
      updateCompactFooter()
      return
    }
    if actions.Root.IsVisible {
      setFooter(
        List[TextRun]{
          TextRun("↑/↓", theme.FooterKey), TextRun(" move   ", theme.FooterText),
          TextRun("Enter", theme.FooterKey), TextRun(" choose", theme.FooterText),
        },
        List[TextRun]{ TextRun("R/F", theme.FooterKey), TextRun(" reply/fwd", theme.FooterText) },
        List[TextRun]{
          TextRun("Esc", theme.FooterKey), TextRun(" history   ", theme.FooterText),
          TextRun("Actions ", footerRole()),
        })
      return
    }
    if forwardPicking {
      var summary = "message"
      if let message = forwardMessage { summary = message.Text.Replace("\n", " ↵ ") }
      setFooter(
        List[TextRun]{
          TextRun("↑/↓", theme.FooterKey), TextRun(" pick   ", theme.FooterText),
          TextRun("Enter", theme.FooterKey), TextRun(" forward", theme.FooterText),
        },
        List[TextRun]{ TextRun("Forward: " + CellText.Clip(summary, 24), theme.FooterText) },
        List[TextRun]{ TextRun("Esc", theme.FooterKey), TextRun(" cancel ", theme.FooterText) })
      return
    }
    if dialogs.HasFocus {
      setFooter(
        List[TextRun]{
          TextRun("↑/↓", theme.FooterKey), TextRun(" move   ", theme.FooterText),
          TextRun("←/→", theme.FooterKey), TextRun(" lists", theme.FooterText),
        },
        List[TextRun]{
          TextRun("Enter", theme.FooterKey), TextRun(" open   ", theme.FooterText),
          TextRun("Tab", theme.FooterKey), TextRun(" cycle", theme.FooterText),
        },
        List[TextRun]{ TextRun("Dialogs ", footerRole()) })
      return
    }
    if conversation.HasFocus {
      setFooter(
        List[TextRun]{
          TextRun("↑/↓", theme.FooterKey), TextRun(" move   ", theme.FooterText),
          TextRun("R/F", theme.FooterKey), TextRun(" reply/fwd", theme.FooterText),
        },
        List[TextRun]{
          TextRun("Enter", theme.FooterKey), TextRun(" actions   ", theme.FooterText),
          TextRun("Tab", theme.FooterKey), TextRun(" cycle", theme.FooterText),
        },
        historyFooter())
      return
    }
    setFooter(
      List[TextRun]{
        TextRun("Enter", theme.FooterKey), TextRun(" send   ", theme.FooterText),
        TextRun("↑", theme.FooterKey), TextRun(" history", theme.FooterText),
      },
      List[TextRun]{
        TextRun("⇧Enter", theme.FooterKey), TextRun(" new line   ", theme.FooterText),
        TextRun("Esc", theme.FooterKey), TextRun(" dialogs   ", theme.FooterText),
        TextRun("Tab", theme.FooterKey), TextRun(" cycle", theme.FooterText),
      },
      List[TextRun]{ TextRun("Compose ", footerRole()) })
  }

  private func updateCompactFooter() {
    if actions.Root.IsVisible {
      setFooter(
        List[TextRun]{
          TextRun("↑/↓", theme.FooterKey), TextRun(" move   ", theme.FooterText),
          TextRun("R/F", theme.FooterKey), TextRun(" direct", theme.FooterText),
        }, List[TextRun](), List[TextRun]{ TextRun("Actions ", footerRole()) })
      return
    }
    if forwardPicking {
      setFooter(
        List[TextRun]{
          TextRun("↑/↓", theme.FooterKey), TextRun(" pick   ", theme.FooterText),
          TextRun("Enter", theme.FooterKey), TextRun(" forward", theme.FooterText),
        }, List[TextRun](),
        List[TextRun]{ TextRun("Esc", theme.FooterKey), TextRun(" cancel ", theme.FooterText) })
      return
    }
    if dialogs.HasFocus {
      setFooter(
        List[TextRun]{
          TextRun("↑/↓", theme.FooterKey), TextRun(" move   ", theme.FooterText),
          TextRun("Enter", theme.FooterKey), TextRun(" open", theme.FooterText),
        }, List[TextRun](), List[TextRun]{ TextRun("Dialogs ", footerRole()) })
      return
    }
    if conversation.HasFocus {
      setFooter(
        List[TextRun]{
          TextRun("↑/↓", theme.FooterKey), TextRun(" move   ", theme.FooterText),
          TextRun("R/F", theme.FooterKey), TextRun(" act", theme.FooterText),
        }, List[TextRun](), List[TextRun]{ TextRun("History ", footerRole()) })
      return
    }
    setFooter(
      List[TextRun]{
        TextRun("Enter", theme.FooterKey), TextRun(" send   ", theme.FooterText),
        TextRun("↑", theme.FooterKey), TextRun(" history", theme.FooterText),
      }, List[TextRun](), List[TextRun]{ TextRun("Compose ", footerRole()) })
  }

  private func setFooter(left List[TextRun], center List[TextRun], right List[TextRun]) {
    footer.LeftRuns = left
    footer.CenterRuns = center
    footer.RightRuns = right
  }

  private func footerRole() Style ->
  Style{
    Foreground: theme.Accent.Foreground,
    Background: theme.FooterText.Background,
    Attributes: TextAttributes.Bold,
  }

  private func historyFooter() List[TextRun] {
    let runs = List[TextRun]{ TextRun("History ", footerRole()) }
    if let message = conversation.SelectedMessage {
      var summary = message.Text.Replace("\n", " ↵ ")
      if message.Author != "" { summary = message.Author + ": " + summary }
      runs.Add(TextRun(CellText.Clip(summary, 18) + " ", theme.FooterText))
    }
    return runs
  }

  private func shortcut(ev UiEvent, lower string, upper string) bool {
    if ev.Kind != UiEventKind.Key && ev.Kind != UiEventKind.TextInput { return false }
    if ev.Key != Key.Character || ev.Phase == KeyPhase.Release {
      return false
    }
    if ev.Text != lower && ev.Text != upper { return false }
    let allowed = int32(KeyModifiers.Shift) | int32(KeyModifiers.CapsLock) |
    int32(KeyModifiers.NumLock)
    return (int32(ev.Modifiers) & (int32(0x7fffffff) ^ allowed)) == 0
  }

  private func plainNavigation(ev UiEvent) bool {
    let locks = int32(KeyModifiers.CapsLock) | int32(KeyModifiers.NumLock)
    return (int32(ev.Modifiers) & (int32(0x7fffffff) ^ locks)) == 0
  }
}
