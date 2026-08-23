package Tgtui

import Net.Codecrete.QrCodeGenerator
import SharpTui

internal open class QrCodeView : Box {
  private var code QrCode?
  private var text string
  private var dark Color
  private var light Color
  private var fallback Style

  internal prop Text string{
    get -> text
    set {
      if text == value { return }
      text = value
      code = value == "" ? nil : QrCode.EncodeText(value, QrCode.Ecc.Medium)
    }
  }

  internal prop ModuleSize int32{
    get {
      guard let qr = code else { return 0 }
      return qr.Size
    }
  }

  public init(theme TgtuiTheme) {
    code = nil
    text = ""
    dark = Color.Rgb("05070a")
    light = Color.Rgb("ffffff")
    fallback = theme.Muted
    GrowWeight = 1
  }

  protected override func Render(screen Screen, bounds CellRect, style Style) {
    guard let qr = code else { return }
    let quiet = 4
    let modules = qr.Size + quiet + quiet
    let rows = (modules + 1) / 2
    if bounds.WidthCells < modules || bounds.HeightRows < rows {
      let message = "Enlarge the terminal to scan this QR code"
      let width = CellText.MeasureWidth(message)
      var x = (bounds.WidthCells - width) / 2
      if x < 0 { x = 0 }
      let y = bounds.HeightRows / 2
      screen.WriteClipped(bounds, x, y, message, fallback)
      return
    }

    let left = bounds.Column + (bounds.WidthCells - modules) / 2
    let top = bounds.Row + (bounds.HeightRows - rows) / 2
    var row = 0
    while row < rows {
      var column = 0
      while column < modules {
        let upperDark = module(qr, column - quiet, row * 2 - quiet)
        let lowerDark = module(qr, column - quiet, row * 2 + 1 - quiet)
        let upper = upperDark ? dark : light
        let lower = lowerDark ? dark : light
        if upperDark == lowerDark {
          screen.WriteCell(left + column, top + row, " ",
            Style{ Foreground: upper, Background: upper })
        } else {
          screen.WriteCell(left + column, top + row, "▀",
            Style{ Foreground: upper, Background: lower })
        }
        column = column + 1
      }
      row = row + 1
    }
  }

  private func module(qr QrCode, x int32, y int32) bool {
    if x < 0 || y < 0 || x >= qr.Size || y >= qr.Size { return false }
    return qr.GetModule(x, y)
  }
}
