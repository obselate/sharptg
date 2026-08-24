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

internal class MessageActions {
  private var theme TgtuiTheme
  private var root Overlay
  private var panel Column
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
    list = ListView()
    list.Height = CellLength.Cells(1)
    list.SelectionMarker = ""
    list.SelectedStyle = theme.PanelSelected
    choose = Button{ Text: "Enter choose" }
    choose.OnPress = () -> chooseSelected()
    close = Button{ Text: "Esc close" }
    close.OnPress = () -> Close()
    panel = Column{
      Width: CellLength.Cells(42),
      Height: CellLength.Cells(7),
      Padding: CellInsets.All(1),
      ShowBorder: true,
      Title: "Message",
      Style: theme.Panel,
      Children: { list, choose, close },
    }
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
    message = source
    actions.Clear()
    if canReply { actions.Add(MessageAction(MessageActionKind.Reply, "↩ Reply", "")) }
    actions.Add(MessageAction(MessageActionKind.Forward, "↗ Forward", ""))
    for url in links(source) {
      actions.Add(MessageAction(MessageActionKind.OpenLink, "🔗 Open " + CellText.Clip(url, 28), url))
    }
    let items = List[ListItem]()
    for action in actions { items.Add(ListItem{ Text: action.Label }) }
    list.Items = items
    list.SelectedIndex = 0
    list.Height = CellLength.Cells(Math.Max(1, actions.Count))
    panel.Height = CellLength.Cells(actions.Count + 6)
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

  private func links(source TelegramMessage) List[string] {
    let result = List[string]()
    for token in source.Text.Replace("\n", " ").Split(' ', StringSplitOptions.RemoveEmptyEntries) {
      var url = token
      while url.EndsWith(".") || url.EndsWith(",") || url.EndsWith(")") || url.EndsWith("]") {
        url = url.Substring(0, url.Length - 1)
      }
      if url.StartsWith("https://") || url.StartsWith("http://") { addLink(result, url) }
    }
    if let preview = source.LinkPreview {
      if preview.Url != "" { addLink(result, preview.Url) }
    }
    return result
  }

  private func addLink(result List[string], url string) {
    for current in result {
      if current == url { return }
    }
    result.Add(url)
  }
}
