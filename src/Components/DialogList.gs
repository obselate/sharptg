package Tgtui

import System
import System.Collections.Generic
import SharpTui

internal open class DialogList : Box {
  private var theme TgtuiTheme
  private var chats List[TelegramChat]
  private var selected int32
  private var pendingSelection int32

  public init(theme TgtuiTheme) {
    this.theme = theme
    chats = List[TelegramChat]()
    selected = 0
    pendingSelection = -1
    Style = theme.Sidebar
  }

  internal func Update(items List[TelegramChat], selectedIndex int32) {
    chats = items
    selected = selectedIndex
  }

  internal func Move(delta int32) int32 {
    if chats.Count == 0 { return -1 }
    var next = selected + delta
    if next < 0 { next = chats.Count - 1 }
    if next >= chats.Count { next = 0 }
    selected = next
    pendingSelection = next
    return next
  }

  internal func SelectAt(row int32) int32 {
    let index = (row - ContentBounds.Row - 2) / 3
    if index < 0 || index >= chats.Count { return -1 }
    selected = index
    pendingSelection = index
    return index
  }

  internal func ConsumeSelection() int32 {
    let value = pendingSelection
    pendingSelection = -1
    return value
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    screen.Fill(bounds, theme.Sidebar)
    if bounds.WidthCells < 8 || bounds.HeightRows < 2 { return }
    let tabStyle = Style{
      Foreground: Color.Rgb("f4f7fc"),
      Background: Color.Rgb("438fdf"),
      Attributes: TextAttributes.Bold,
    }
    screen.WriteClipped(bounds, 2, 0, "All", theme.Muted)
    screen.WriteClipped(bounds, 8, 0, " Archive ", tabStyle)
    screen.Write(bounds.Column + bounds.WidthCells - 2, bounds.Row, chats.Count.ToString(), theme.Muted)
    screen.Fill(CellRect{
      Column: bounds.Column,
      Row: bounds.Row + 1,
      WidthCells: bounds.WidthCells,
      HeightRows: 1,
    }, theme.Canvas)

    var index = 0
    var row = bounds.Row + 2
    while index < chats.Count && row + 2 < bounds.Row + bounds.HeightRows {
      let chat = chats[index]
      let rowStyle = index == selected ? theme.PanelSelected : theme.Panel
      screen.Fill(CellRect{
        Column: bounds.Column,
        Row: row,
        WidthCells: bounds.WidthCells,
        HeightRows: 2,
      }, rowStyle)
      let avatar = avatarStyle(index)
      screen.Write(bounds.Column + 1, row, chat.Initials, avatar)
      let available = bounds.WidthCells - 16
      if available > 0 {
        screen.Write(bounds.Column + 5, row, CellText.Clip(chat.Title, available), rowStyle)
      }
      let timeWidth = CellText.MeasureWidth(chat.Time)
      screen.Write(bounds.Column + bounds.WidthCells - timeWidth - 1, row, chat.Time, theme.Muted)
      let preview = chat.Pinned ? "◆ " + chat.Preview : chat.Preview
      if bounds.WidthCells > 8 {
        screen.Write(bounds.Column + 5, row + 1, CellText.Clip(preview, bounds.WidthCells - 7), theme.Muted)
      }
      if chat.Unread > 0 {
        let badge = " " + chat.Unread.ToString() + " "
        let badgeStyle = Style{
          Foreground: Color.Rgb("101722"),
          Background: chat.Muted ? Color.Rgb("77839a") : Color.Rgb("55b7ff"),
          Attributes: TextAttributes.Bold,
        }
        let badgeWidth = CellText.MeasureWidth(badge)
        screen.Write(bounds.Column + bounds.WidthCells - badgeWidth - 1, row + 1, badge, badgeStyle)
      }
      let separatorRow = row + 2
      screen.Fill(CellRect{
        Column: bounds.Column,
        Row: separatorRow,
        WidthCells: bounds.WidthCells,
        HeightRows: 1,
      }, theme.Canvas)
      index = index + 1
      row = row + 3
    }
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
}
