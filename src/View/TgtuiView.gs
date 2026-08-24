package Tgtui

import System
import System.Diagnostics
import SharpTui

internal open class TgtuiView : Column {
  private let NarrowBreakpoint int32 = 70
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
  private var composeFocus ListView
  private var historyFocus ListView
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
      LeftText: "↑/↓ move   Enter send",
      CenterText: "Tab cycle",
      RightText: "Ctrl+Q quit",
    }
    dialogs = DialogList(theme)
    dialogs.GrowWeight = 1
    header = ConversationHeader(theme)
    conversation = Conversation(theme)
    composer = Composer(theme)
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
    composeFocus = ListView{ Width: CellLength.Cells(0), Height: CellLength.Cells(0) }
    historyFocus = ListView{ Width: CellLength.Cells(0), Height: CellLength.Cells(0) }
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
    Children.Add(composeFocus)
    Children.Add(historyFocus)
    Children.Add(actions.Root)
    sync()
    focusCompose()
  }

  protected override func PrepareLayout() {
    let selected = dialogs.ConsumeSelection()
    if selected >= 0 { service.Select(selected) }
    sync()
    composer.RefreshHeight()
    applyResponsive(Bounds.WidthCells)
    composer.SetFocused(composeFocus.IsFocused)
    conversation.SetFocused(historyFocus.IsFocused)
    updateFooter()
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    applyResponsive(bounds.WidthCells)
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
    if ev.Kind == UiEventKind.Mouse {
      let result = handleMouse(ev)
      if result != EventResult.Continue { return result }
    }
    if dialogs.HasFocus {
      return handleDialogs(ev)
    }
    if historyFocus.IsFocused {
      return handleHistory(ev)
    }
    if composeFocus.IsFocused {
      return handleCompose(ev)
    }
    return EventResult.Continue
  }

  private func handleDialogs(ev UiEvent) EventResult {
    if plainNavigation(ev) && (ev.Key == Key.Left || ev.Key == Key.Right) {
      service.SetArchive(ev.Key == Key.Right)
      sync()
      return EventResult.Handled
    }
    if plainNavigation(ev) && (ev.Key == Key.Up || ev.Key == Key.Down) {
      service.Select(dialogs.Move(ev.Key == Key.Up ? -1 : 1))
      sync()
      return EventResult.Handled
    }
    if ev.Key == Key.Enter {
      if forwardPicking {
        completeForward()
      } else {
        service.Select(service.SelectedIndex)
        sync()
        if narrow { dialogsVisible = false }
        focusCompose()
      }
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func handleHistory(ev UiEvent) EventResult {
    if plainNavigation(ev) && (ev.Key == Key.Up || ev.Key == Key.Down) {
      conversation.Move(ev.Key == Key.Up ? -1 : 1)
      return EventResult.Handled
    }
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
    return EventResult.Continue
  }

  private func handleCompose(ev UiEvent) EventResult {
    if ev.Key == Key.Up && plainNavigation(ev) && composer.OnFirstLine() {
      focusHistory()
      conversation.Move(-1)
      return EventResult.Handled
    }
    let result = composer.Handle(ev)
    if result != EventResult.Continue { return result }
    if ev.Key == Key.Enter && plainNavigation(ev) {
      let text = composer.Text
      service.Send(text, composer.ReplyMessageId)
      if text.Trim() != "" { composer.Clear() }
      sync()
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func handleMouse(ev UiEvent) EventResult {
    if dialogs.IsVisible {
      if ev.Mouse == MouseKind.ScrollUp {
        service.Select(dialogs.Move(-1))
        sync()
        return EventResult.Handled
      }
      if ev.Mouse == MouseKind.ScrollDown {
        service.Select(dialogs.Move(1))
        sync()
        return EventResult.Handled
      }
      if ev.Mouse == MouseKind.Press && ev.Button == MouseButton.Left && dialogs.ContentBounds.Contains(ev.Position) {
        let tab = dialogs.SelectTabAt(ev.Position.Column, ev.Position.Row)
        if tab >= 0 {
          dialogs.FocusList()
          service.SetArchive(tab == 1)
          sync()
          return EventResult.Handled
        }
        let selected = dialogs.SelectAt(ev.Position.Row)
        if selected >= 0 {
          service.Select(selected)
          dialogs.FocusList()
        }
        if narrow && selected >= 0 && !forwardPicking {
          dialogsVisible = false
          focusCompose()
        }
        sync()
        return EventResult.Handled
      }
    }
    if chat.IsVisible && ev.Mouse == MouseKind.Press && ev.Button == MouseButton.Left {
      if composer.Bounds.Contains(ev.Position) {
        focusCompose()
        return composer.Handle(ev)
      }
      if conversation.Bounds.Contains(ev.Position) {
        focusHistory()
        return EventResult.Handled
      }
    }
    return EventResult.Continue
  }

  private func chooseAction(action MessageAction) {
    let source = actions.Message
    actions.Close()
    guard let message = source else { return }
    if action.Kind == MessageActionKind.Reply {
      composer.StartReply(message)
      focusCompose()
      return
    }
    if action.Kind == MessageActionKind.Forward {
      forwardPicking = true
      forwardMessage = message
      forwardSourceIndex = service.SelectedIndex
      forwardSourceChatId = if let chat = service.SelectedChat { chat.TdId } else { 0 }
      if narrow { dialogsVisible = true }
      dialogs.FocusList()
      return
    }
    openLink(action.Url)
    focusHistory()
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
    if historyFocus.IsFocused {
      focusCompose()
      return
    }
    if composeFocus.IsFocused {
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
    Focus(composeFocus)
    composer.SetFocused(true)
    conversation.SetFocused(false)
  }

  private func focusHistory() {
    Focus(historyFocus)
    composer.SetFocused(false)
    conversation.SetFocused(true)
  }

  private func sync() {
    if revision == service.Revision { return }
    revision = service.Revision
    dialogs.Update(service.Chats, service.SelectedIndex, service.ShowArchive, service.ChatsLoading)
    status.Update(service.ConnectionState, service.ConnectionText, service.AccountName)
    if let selected = service.SelectedChat {
      header.Update(selected)
      conversation.Update(selected.Messages, service.MessagesLoading)
      composer.IsVisible = selected.CanSend
      composeFocus.IsVisible = selected.CanSend
      return
    }
    header.Clear()
    conversation.Clear()
    composer.IsVisible = false
    composeFocus.IsVisible = false
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
      composeFocus.IsVisible = !dialogsVisible && composer.IsVisible
      historyFocus.IsVisible = !dialogsVisible
    } else {
      sidebar.Width = CellLength.Cells(34)
      sidebar.GrowWeight = 0
      sidebar.IsVisible = sidebarExpanded
      divider.IsVisible = sidebarExpanded
      chat.Width = CellLength.Auto
      chat.GrowWeight = 1
      chat.IsVisible = true
      composeFocus.IsVisible = composer.IsVisible
      historyFocus.IsVisible = true
    }
  }

  private func updateFooter() {
    if actions.Root.IsVisible {
      footer.LeftText = "↑/↓ move   Enter choose"
      footer.CenterText = "Esc history"
      footer.RightText = "Actions"
      return
    }
    if forwardPicking {
      footer.LeftText = "↑/↓ pick   Enter forward"
      footer.CenterText = "Esc cancel"
      footer.RightText = "Dialogs"
      return
    }
    if dialogs.HasFocus {
      footer.LeftText = "↑/↓ move   ←/→ lists"
      footer.CenterText = "Enter open   Tab cycle"
      footer.RightText = "Dialogs"
      return
    }
    if historyFocus.IsFocused {
      footer.LeftText = "↑/↓ move   Enter reply/fwd"
      footer.CenterText = "Esc compose   Tab cycle"
      footer.RightText = "History"
      return
    }
    footer.LeftText = "Enter send   ↑ history"
    footer.CenterText = "⇧Enter new line   Esc dialogs   Tab cycle"
    footer.RightText = "Compose"
  }

  private func plainNavigation(ev UiEvent) bool {
    let locks = int32(KeyModifiers.CapsLock) | int32(KeyModifiers.NumLock)
    return (int32(ev.Modifiers) & (int32(0x7fffffff) ^ locks)) == 0
  }
}
