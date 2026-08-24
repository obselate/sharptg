package Tgtui

import System
import SharpTui

internal open class TgtuiView : Column {
  private let NarrowBreakpoint int32 = 70
  private var app App
  private var service TelegramService
  private var theme TgtuiTheme
  private var status StatusBar
  private var footer StatusBar
  private var dialogs DialogList
  private var header ConversationHeader
  private var conversation Conversation
  private var composer Composer
  private var body Row
  private var sidebar Column
  private var divider Divider
  private var chat Column
  private var paneSwitch Button
  private var revision int32
  private var narrow bool
  private var dialogsVisible bool
  private var sidebarExpanded bool

  public init(app App, service TelegramService, theme TgtuiTheme) {
    this.app = app
    this.service = service
    this.theme = theme
    revision = -1
    narrow = false
    dialogsVisible = false
    sidebarExpanded = true

    status = StatusBar{
      Height: CellLength.Cells(1),
      Style: theme.Header,
      LeftText: "tgtui   ● online",
      CenterText: service.ConnectionText,
      RightText: "Sam",
    }
    footer = StatusBar{
      Height: CellLength.Cells(1),
      Style: theme.FooterText,
      LeftText: "↑/↓ move   Enter send",
      CenterText: "Ctrl+B sidebar",
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
      Style: theme.Canvas,
      Children: { header, conversation, composer.Root },
    }
    divider = Divider(theme.Header)
    paneSwitch = Button{
      Text: "",
      Width: CellLength.Cells(0),
      Height: CellLength.Cells(0),
    }
    paneSwitch.IsVisible = false
    body = Row{
      GrowWeight: 1,
      Style: theme.Canvas,
      Children: { sidebar, divider, chat },
    }
    Style = theme.Canvas
    Children.Add(status)
    Children.Add(body)
    Children.Add(footer)
    Children.Add(paneSwitch)
    sync()
    composer.Focus()
  }

  protected override func PrepareLayout() {
    let selected = dialogs.ConsumeSelection()
    if selected >= 0 { service.Select(selected) }
    sync()
    if narrow && paneSwitch.IsFocused {
      dialogsVisible = !dialogsVisible
      if dialogsVisible { dialogs.FocusList() }
      else { composer.Focus() }
    }
    applyResponsive(Bounds.WidthCells)
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    applyResponsive(bounds.WidthCells)
  }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Phase == KeyPhase.Release { return EventResult.Continue }
    if KeyGesture.Ctrl("q").Matches(ev) { return EventResult.Exit }
    if KeyGesture.Ctrl("b").Matches(ev) {
      if narrow {
        dialogsVisible = !dialogsVisible
        if dialogsVisible {
          dialogs.FocusList()
        } else {
          composer.Focus()
        }
      } else {
        sidebarExpanded = !sidebarExpanded
        sidebar.IsVisible = sidebarExpanded
        divider.IsVisible = sidebarExpanded
      }
      return EventResult.Handled
    }
    if ev.Key == Key.Escape {
      if narrow {
        dialogsVisible = true
      }
      dialogs.FocusList()
      return EventResult.Handled
    }
    if dialogs.HasFocus && plainNavigation(ev) && (ev.Key == Key.Left || ev.Key == Key.Right) {
      service.SetArchive(ev.Key == Key.Right)
      sync()
      return EventResult.Handled
    }
    if ev.Kind == UiEventKind.Mouse && dialogs.IsVisible {
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
        if narrow && selected >= 0 {
          dialogsVisible = false
          composer.Focus()
        }
        sync()
        return EventResult.Handled
      }
    }
    if dialogs.HasFocus && plainNavigation(ev) && (ev.Key == Key.Up || ev.Key == Key.Down) {
      service.Select(dialogs.Move(ev.Key == Key.Up ? -1 : 1))
      sync()
      return EventResult.Handled
    }
    if ev.Key == Key.Enter && dialogs.HasFocus {
      if narrow { dialogsVisible = false }
      composer.Focus()
      return EventResult.Handled
    }
    if ev.Key == Key.Enter && composer.IsFocused {
      let text = composer.Text
      service.Send(text)
      if text.Trim() != "" { composer.Clear() }
      sync()
      return EventResult.Handled
    }
    return EventResult.Continue
  }

  private func sync() {
    if revision == service.Revision { return }
    revision = service.Revision
    dialogs.Update(service.Chats, service.SelectedIndex, service.ShowArchive, service.ChatsLoading)
    status.CenterText = service.ConnectionText
    if let selected = service.SelectedChat {
      header.Update(selected)
      conversation.Update(selected.Messages, service.MessagesLoading)
      composer.Root.IsVisible = selected.CanSend
      status.RightText = selected.Title
      return
    }
    header.Clear()
    conversation.Clear()
    composer.Root.IsVisible = false
    status.RightText = "No chats"
  }

  private func applyResponsive(width int32) {
    let nextNarrow = width < NarrowBreakpoint
    if nextNarrow != narrow {
      narrow = nextNarrow
      dialogsVisible = false
      paneSwitch.IsVisible = narrow
      if narrow { composer.Focus() }
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
      footer.LeftText = dialogsVisible ? "↑/↓ chats" : "Esc chats"
      footer.CenterText = dialogsVisible ? "Tab chat" : "Tab chats"
      footer.RightText = dialogsVisible ? "Dialogs" : "Compose"
      status.RightText = CellText.Clip(selectedTitle(), 14)
    } else {
      sidebar.Width = CellLength.Cells(34)
      sidebar.GrowWeight = 0
      sidebar.IsVisible = sidebarExpanded
      divider.IsVisible = sidebarExpanded
      chat.Width = CellLength.Auto
      chat.GrowWeight = 1
      chat.IsVisible = true
      footer.LeftText = dialogs.HasFocus ? "↑/↓ chats   ←/→ list" : "Enter send"
      footer.CenterText = dialogs.HasFocus ? "Tab compose" : "Tab chats   Ctrl+B sidebar"
      footer.RightText = (dialogs.HasFocus ? "Dialogs   " : "Compose   ") + "Ctrl+Q quit"
      status.RightText = selectedTitle()
    }
  }

  private func selectedTitle() string {
    if let selected = service.SelectedChat { return selected.Title }
    return "No chats"
  }

  private func plainNavigation(ev UiEvent) bool {
    let locks = int32(KeyModifiers.CapsLock) | int32(KeyModifiers.NumLock)
    return (int32(ev.Modifiers) & (int32(0x7fffffff) ^ locks)) == 0
  }
}
