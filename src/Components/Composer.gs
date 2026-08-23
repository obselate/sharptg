package Tgtui

import SharpTui

internal class Composer {
  private var root Row
  private var input TextInput

  internal prop Root Box -> root
  internal prop Text string -> input.Text
  internal prop IsFocused bool -> input.IsFocused

  public init(theme TgtuiTheme) {
    input = TextInput{
      GrowWeight: 1,
      Height: CellLength.Cells(3),
      ShowBorder: true,
      Title: "✦ Write a message…   ⇧↵ new line",
      Style: theme.Composer,
      FocusedStyle: theme.Accent,
      Placeholder: "Write a message…",
      PlaceholderStyle: theme.Muted,
    }
    root = Row{
      Height: CellLength.Cells(3),
      Style: theme.Canvas,
      Children: { input },
    }
  }

  internal func Focus() {
    root.Focus(input)
  }

  internal func Clear() {
    input.Text = ""
    input.CaretGraphemeIndex = 0
  }
}
