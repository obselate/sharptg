package Tgtui

import SharpTui

internal open class Divider : Box {
  private var dividerStyle Style

  public init(style Style) {
    dividerStyle = style
    Width = CellLength.Cells(1)
    Style = style
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    screen.Fill(bounds, dividerStyle)
  }
}
