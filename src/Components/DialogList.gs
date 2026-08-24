package Tgtui

import System
import System.Collections.Generic
import SharpTui

private class DialogSource : VirtualListSource {
  private var theme TgtuiTheme
  private var chats List[TelegramChat]

  public init(theme TgtuiTheme) {
    this.theme = theme
    chats = List[TelegramChat]()
  }

  internal func Update(items List[TelegramChat]) {
    chats = items
  }

  func Count() int32 -> chats.Count

  func KeyAt(index int32) string -> chats[index].Id

  func IndexOfKey(key string) int32 {
    var index = 0
    while index < chats.Count {
      if chats[index].Id == key { return index }
      index = index + 1
    }
    return -1
  }

  func IsSelectable(index int32) bool -> true

  func HeightAt(index int32, width int32) int32 -> 3

  func Render(index int32, screen Screen, bounds CellRect, clipBounds CellRect, style Style, state VirtualListItemState) {
    let chat = chats[index]
    let focused = hasState(state, VirtualListItemState.Focused)
    let rowStyle = focused ? theme.PanelSelected : theme.Panel
    let muted = Style{ Foreground: theme.Muted.Foreground, Background: rowStyle.Background }
    let panelTop = Math.Max(bounds.Row, clipBounds.Row)
    let panelBottom = Math.Min(bounds.Row + 2, clipBounds.Row + clipBounds.HeightRows)
    if panelBottom > panelTop {
      screen.Fill(CellRect{
        Column: bounds.Column,
        Row: panelTop,
        WidthCells: bounds.WidthCells,
        HeightRows: panelBottom - panelTop,
      }, rowStyle)
    }
    write(screen, clipBounds, bounds.Column + 1, bounds.Row, chat.Initials, avatarStyle(index))
    let available = bounds.WidthCells - 16
    if available > 0 {
      write(screen, clipBounds, bounds.Column + 5, bounds.Row,
        CellText.Clip(chat.Title, available), rowStyle)
    }
    let timeWidth = CellText.MeasureWidth(chat.Time)
    write(screen, clipBounds, bounds.Column + bounds.WidthCells - timeWidth - 1,
      bounds.Row, chat.Time, muted)
    let preview = chat.Pinned ? "◆ " + chat.Preview : chat.Preview
    if bounds.WidthCells > 8 {
      write(screen, clipBounds, bounds.Column + 5, bounds.Row + 1,
        CellText.Clip(preview, bounds.WidthCells - 7), muted)
    }
    if chat.Unread > 0 || chat.MarkedUnread {
      let badge = chat.Unread > 0 ? " " + chat.Unread.ToString() + " " : " • "
      let badgeStyle = Style{
        Foreground: Color.Rgb("101722"),
        Background: chat.Muted ? Color.Rgb("646e82") : Color.Rgb("409eff"),
        Attributes: TextAttributes.Bold,
      }
      let badgeWidth = CellText.MeasureWidth(badge)
      write(screen, clipBounds, bounds.Column + bounds.WidthCells - badgeWidth - 1,
        bounds.Row + 1, badge, badgeStyle)
    }
    write(screen, clipBounds, bounds.Column, bounds.Row + 2,
      "".PadLeft(bounds.WidthCells, '─'), theme.Border)
  }

  private func avatarStyle(index int32) Style {
    var background = Color.Rgb("e4a14c")
    if index == 2 { background = Color.Rgb("dd5b82") }
    if index == 3 { background = Color.Rgb("d34d9c") }
    if index == 4 { background = Color.Rgb("a978d4") }
    return Style{
      Foreground: Color.Rgb("ffffff"),
      Background: background,
      Attributes: TextAttributes.Bold,
    }
  }

  private func write(screen Screen, clipBounds CellRect, column int32, row int32, text string, style Style) {
    screen.WriteClipped(clipBounds, column - clipBounds.Column, row - clipBounds.Row, text, style)
  }

  private func hasState(state VirtualListItemState, value VirtualListItemState) bool ->
  (int32(state) & int32(value)) != 0
}

internal open class DialogList : Box {
  private var theme TgtuiTheme
  private var source DialogSource
  private var list VirtualListView
  private var tabs Tabs
  private var tabTitles List[string]
  private var count Label
  private var activeTabIndex int32
  private var pendingTabIndex int32
  private var loading bool

  public init(theme TgtuiTheme) {
    this.theme = theme
    source = DialogSource(theme)
    list = VirtualListView{ Source: source }
    tabTitles = List[string]()
    let activeTab = Style{
      Foreground: Color.Rgb("f4f7fc"),
      Background: Color.Rgb("409eff"),
      Attributes: TextAttributes.Bold,
    }
    tabs = Tabs{
      GapCells: 0,
      Style: theme.Muted,
      SelectedStyle: activeTab,
      CanFocus: false,
      CanReceiveMouse: true,
    }
    count = Label{ Style: theme.Muted }
    let spacer = Box{ GrowWeight: 1 }
    let header = Row{
      Height: CellLength.Cells(1),
      Padding: CellInsets{ LeftCells: 1, RightCells: 1 },
      Style: theme.Sidebar,
      Children: { tabs, spacer, count },
    }
    let gap = Box{ Height: CellLength.Cells(1), Style: theme.Canvas }
    activeTabIndex = 0
    pendingTabIndex = -1
    loading = false
    Style = theme.Sidebar
    ShowBorder = true
    Children.Add(header)
    Children.Add(gap)
    Children.Add(list)
  }

  internal prop HasFocus bool -> list.IsFocused
  internal prop SelectedIndex int32 -> list.SelectedIndex

  internal func Update(items List[TelegramChat], selectedIndex int32, titles List[string], selectedTabIndex int32, isLoading bool) {
    updateTabTitles(titles)
    let nextTabIndex = normalizedTabIndex(selectedTabIndex)
    if nextTabIndex != activeTabIndex { list.FirstVisibleRowOffset = 0 }
    source.Update(items)
    list.Refresh()
    if items.Count > 0 { list.SelectedIndex = selectedIndex }
    activeTabIndex = nextTabIndex
    pendingTabIndex = -1
    loading = isLoading
    tabs.SelectedIndex = activeTabIndex
    count.Text = items.Count.ToString()
  }

  internal func ConsumeSelection() int32 {
    guard let change = list.ConsumeSelectionChange() else { return -1 }
    return change.SelectedIndex
  }

  internal func MoveTab(delta int32) bool {
    if delta == 0 || tabTitles.Count < 2 { return false }
    var next = (activeTabIndex + delta) % tabTitles.Count
    if next < 0 { next = next + tabTitles.Count }
    if next == activeTabIndex { return false }
    tabs.SelectedIndex = next
    pendingTabIndex = next
    return true
  }

  internal func ConsumeTab() int32 {
    if pendingTabIndex >= 0 {
      let selected = pendingTabIndex
      pendingTabIndex = -1
      return selected
    }
    guard let change = tabs.ConsumeSelectionChange() else { return -1 }
    return change.SelectedIndex
  }

  internal func FocusList() {
    Focus(list)
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    screen.Fill(bounds, theme.Sidebar)
    screen.DrawBorder(Bounds, HasFocus ? theme.Accent : theme.Border)
    if source.Count() > 0 || bounds.WidthCells < 8 || bounds.HeightRows < 2 { return }
    let empty = emptyText()
    let column = bounds.Column + Math.Max(1, (bounds.WidthCells - CellText.MeasureWidth(empty)) / 2)
    let row = bounds.Row + Math.Max(3, bounds.HeightRows / 2)
    if row < bounds.Row + bounds.HeightRows {
      screen.Write(column, row, CellText.Clip(empty, bounds.WidthCells - 2), theme.Muted)
    }
  }

  private func updateTabTitles(titles List[string]) {
    if sameTabTitles(titles) { return }
    tabTitles.Clear()
    let displayTitles = List[string]()
    for title in titles {
      let cleanTitle = title.Trim()
      tabTitles.Add(cleanTitle)
      displayTitles.Add(" " + cleanTitle + " ")
    }
    tabs.Titles = displayTitles
  }

  private func sameTabTitles(titles List[string]) bool {
    if titles.Count != tabTitles.Count { return false }
    for index in 0 ... titles.Count {
      if titles[index].Trim() != tabTitles[index] { return false }
    }
    return true
  }

  private func normalizedTabIndex(index int32) int32 {
    if tabTitles.Count == 0 || index < 0 { return 0 }
    if index >= tabTitles.Count { return tabTitles.Count - 1 }
    return index
  }

  private func emptyText() string {
    if loading { return "Loading chats..." }
    if activeTabIndex < 0 || activeTabIndex >= tabTitles.Count { return "No chats here" }
    let title = tabTitles[activeTabIndex]
    return title == "" ? "No chats here" : title + " is empty"
  }
}
