package Tgtui

import SharpTui

internal class TgtuiTheme {
  internal var Canvas Style
  internal var Sidebar Style
  internal var Panel Style
  internal var PanelSelected Style
  internal var Header Style
  internal var Accent Style
  internal var Muted Style
  internal var Incoming Style
  internal var Outgoing Style
  internal var Composer Style
  internal var FooterKey Style
  internal var FooterText Style

  public init() {
    let text = Color.Rgb("e8edf7")
    let muted = Color.Rgb("7f8ba3")
    let canvas = Color.Rgb("111722")
    let panel = Color.Rgb("182233")
    let selected = Color.Rgb("202c40")
    let outgoing = Color.Rgb("294d79")
    let incoming = Color.Rgb("252d40")
    let accent = Color.Rgb("55b7ff")
    Canvas = Style{ Foreground: text, Background: canvas }
    Sidebar = Style{ Foreground: text, Background: panel }
    Panel = Style{ Foreground: text, Background: panel }
    PanelSelected = Style{ Foreground: text, Background: selected, Attributes: TextAttributes.Bold }
    Header = Style{ Foreground: text, Background: Color.Rgb("1c2839"), Attributes: TextAttributes.Bold }
    Accent = Style{ Foreground: Color.Rgb("56e6d2"), Background: Color.Rgb("1c2839"), Attributes: TextAttributes.Bold }
    Muted = Style{ Foreground: muted, Background: panel }
    Incoming = Style{ Foreground: text, Background: incoming }
    Outgoing = Style{ Foreground: text, Background: outgoing }
    Composer = Style{ Foreground: text, Background: canvas }
    FooterKey = Style{ Foreground: text, Background: Color.Rgb("202b3e"), Attributes: TextAttributes.Bold }
    FooterText = Style{ Foreground: muted, Background: Color.Rgb("151d2b") }
  }
}
