package Tgtui

import SharpTui

internal class TgtuiTheme {
  internal var Canvas Style
  internal var Sidebar Style
  internal var Panel Style
  internal var PanelSelected Style
  internal var Header Style
  internal var Accent Style
  internal var AccentBlue Style
  internal var Muted Style
  internal var Incoming Style
  internal var Outgoing Style
  internal var IncomingSelected Style
  internal var OutgoingSelected Style
  internal var Composer Style
  internal var ComposerFocused Style
  internal var Reply Style
  internal var MutedPanel Style
  internal var MutedCanvas Style
  internal var Border Style
  internal var Online Style
  internal var Reconnecting Style
  internal var Offline Style
  internal var FooterKey Style
  internal var FooterText Style

  public init() {
    let text = Color.Rgb("ecf0f8")
    let dim = Color.Rgb("8c96aa")
    let muted = Color.Rgb("646e82")
    let canvas = Color.Rgb("0f141e")
    let panel = Color.Rgb("161e2e")
    let elevated = Color.Rgb("1e283c")
    let selected = Color.Rgb("2a3a5c")
    let outgoing = Color.Rgb("244878")
    let incoming = Color.Rgb("262e42")
    let accent = Color.Rgb("409eff")
    let border = Color.Rgb("303c56")
    Canvas = Style{ Foreground: text, Background: canvas }
    Sidebar = Style{ Foreground: text, Background: panel }
    Panel = Style{ Foreground: text, Background: panel }
    PanelSelected = Style{ Foreground: text, Background: selected, Attributes: TextAttributes.Bold }
    Header = Style{ Foreground: text, Background: elevated, Attributes: TextAttributes.Bold }
    Accent = Style{ Foreground: Color.Rgb("50e3c2"), Background: elevated, Attributes: TextAttributes.Bold }
    AccentBlue = Style{ Foreground: Color.Rgb("64b5ff"), Background: elevated, Attributes: TextAttributes.Bold }
    Muted = Style{ Foreground: dim, Background: panel }
    Incoming = Style{ Foreground: text, Background: incoming }
    Outgoing = Style{ Foreground: text, Background: outgoing }
    IncomingSelected = Style{ Foreground: text, Background: Color.Rgb("3a486e") }
    OutgoingSelected = Style{ Foreground: text, Background: Color.Rgb("3769aa") }
    Composer = Style{ Foreground: text, Background: canvas }
    ComposerFocused = Style{ Foreground: accent, Background: canvas, Attributes: TextAttributes.Bold }
    Reply = Style{ Foreground: Color.Rgb("50e3c2"), Background: panel, Attributes: TextAttributes.Bold }
    MutedPanel = Style{ Foreground: muted, Background: panel }
    MutedCanvas = Style{ Foreground: muted, Background: canvas }
    Border = Style{ Foreground: border, Background: canvas }
    Online = Style{ Foreground: Color.Rgb("52c47a"), Background: elevated, Attributes: TextAttributes.Bold }
    Reconnecting = Style{ Foreground: Color.Rgb("ffa74c"), Background: elevated, Attributes: TextAttributes.Bold }
    Offline = Style{ Foreground: Color.Rgb("ff6384"), Background: elevated, Attributes: TextAttributes.Bold }
    FooterKey = Style{ Foreground: text, Background: Color.Rgb("202b3e"), Attributes: TextAttributes.Bold }
    FooterText = Style{ Foreground: dim, Background: panel }
  }
}
