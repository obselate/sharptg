package Tgtui

import System
import System.Collections.Generic
import SharpTui

internal enum MessageActionKind { Reply; Forward; OpenLink }

internal class MessageAction {
  internal let Kind MessageActionKind
  internal let Label string
  internal let Url string

  public init(kind MessageActionKind, label string, url string) {
    Kind = kind
    Label = label
    Url = url
  }
}

private open class MessageActionsPanel : Column {
  private var onShortcut Action[string]?

  internal prop OnShortcut Action[string]? {
    get -> onShortcut
    set -> onShortcut = value
  }

  public init() {
    onShortcut = nil
  }

  protected override func Accept(ev UiEvent) EventResult {
    if !isShortcut(ev) { return EventResult.Continue }
    if ev.Text != "r" && ev.Text != "R" && ev.Text != "f" && ev.Text != "F"
      && (ev.Text.Length != 1 || ev.Text[0] < '1' || ev.Text[0] > '9') {
        return EventResult.Continue
      }
    if let callback = onShortcut { callback(ev.Text) }
    return EventResult.Handled
  }

  private func isShortcut(ev UiEvent) bool {
    if ev.Kind != UiEventKind.Key && ev.Kind != UiEventKind.TextInput { return false }
    if ev.Key != Key.Character || ev.Phase == KeyPhase.Release {
      return false
    }
    let allowed = int32(KeyModifiers.Shift) | int32(KeyModifiers.CapsLock) |
    int32(KeyModifiers.NumLock)
    return (int32(ev.Modifiers) & (int32(0x7fffffff) ^ allowed)) == 0
  }
}

internal class MessageActions {
  private var theme TgtuiTheme
  private var root Overlay
  private var panel MessageActionsPanel
  private var preview Label
  private var list ListView
  private var choose Button
  private var close Button
  private var actions List[MessageAction]
  private var message TelegramMessage?
  private var onChosen Action[MessageAction]?

  internal prop Root Overlay -> root
  internal prop Message TelegramMessage? {
    get -> message
  }
  internal prop OnChosen Action[MessageAction]? {
    get -> onChosen
    set -> onChosen = value
  }

  public init(theme TgtuiTheme) {
    this.theme = theme
    actions = List[MessageAction]()
    message = nil
    onChosen = nil
    preview = Label{ Style: theme.Muted }
    list = ListView()
    list.Height = CellLength.Cells(1)
    list.SelectionMarker = ""
    list.SelectedStyle = theme.PanelSelected
    choose = Button{ Text: "Enter choose" }
    choose.OnPress = () -> chooseSelected()
    close = Button{ Text: "Esc close" }
    close.OnPress = () -> Close()
    panel = MessageActionsPanel()
    panel.Width = CellLength.Cells(42)
    panel.Height = CellLength.Cells(7)
    panel.Padding = CellInsets.All(1)
    panel.ShowBorder = true
    panel.Title = "Message"
    panel.Style = theme.Panel
    panel.Children.Add(preview)
    panel.Children.Add(list)
    panel.Children.Add(choose)
    panel.Children.Add(close)
    panel.OnShortcut = shortcut -> chooseShortcut(shortcut)
    root = Overlay{
      Content: panel,
      DimBackground: true,
      Placement: Placement.Centered,
      IsVisible: false,
    }
    root.CancelAction = close
    root.DefaultAction = choose
  }

  internal func Open(source TelegramMessage, canReply bool) {
    if source.Kind == TelegramMessageKind.Service { return }
    message = source
    var summary = source.Text.Replace("\n", " ↵ ")
    if source.Author != "" { summary = source.Author + ": " + summary }
    preview.Text = "Selected: " + CellText.Clip(summary, 28)
    actions.Clear()
    if canReply { actions.Add(MessageAction(MessageActionKind.Reply, "↩ Reply", "")) }
    actions.Add(MessageAction(MessageActionKind.Forward, "↗ Forward", ""))
    var linkNumber = 1
    for url in links(source) {
      let prefix = linkNumber <= 9 ? linkNumber.ToString() + "  " : "   "
      actions.Add(MessageAction(MessageActionKind.OpenLink,
        prefix + "🔗 Open " + CellText.Clip(url, 24), url))
      linkNumber = linkNumber + 1
    }
    let items = List[ListItem]()
    for action in actions { items.Add(ListItem{ Text: action.Label }) }
    list.Items = items
    list.SelectedIndex = 0
    list.Height = CellLength.Cells(Math.Max(1, actions.Count))
    panel.Height = CellLength.Cells(actions.Count + 7)
    root.IsVisible = true
    root.Focus(list)
  }

  internal func Close() {
    root.IsVisible = false
  }

  private func chooseSelected() {
    let index = list.SelectedIndex
    if index < 0 || index >= actions.Count { return }
    let action = actions[index]
    guard let callback = onChosen else { return }
    callback(action)
  }

  private func chooseShortcut(shortcut string) {
    if shortcut == "r" || shortcut == "R" {
      chooseKind(MessageActionKind.Reply)
      return
    }
    if shortcut == "f" || shortcut == "F" {
      chooseKind(MessageActionKind.Forward)
      return
    }
    chooseLink(Int32.Parse(shortcut) - 1)
  }

  private func chooseKind(kind MessageActionKind) {
    var index = 0
    while index < actions.Count {
      if actions[index].Kind == kind {
        list.SelectedIndex = index
        chooseSelected()
        return
      }
      index = index + 1
    }
  }

  private func chooseLink(want int32) {
    var index = 0
    var linkIndex = 0
    while index < actions.Count {
      if actions[index].Kind == MessageActionKind.OpenLink {
        if linkIndex == want {
          list.SelectedIndex = index
          chooseSelected()
          return
        }
        linkIndex = linkIndex + 1
      }
      index = index + 1
    }
  }

  private func links(source TelegramMessage) List[string] {
    let result = List[string]()
    for url in source.Links { addLink(result, url) }
    return result
  }

  private func addLink(result List[string], url string) {
    for current in result {
      if current == url { return }
    }
    result.Add(url)
  }
}
