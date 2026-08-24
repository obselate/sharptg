package Tgtui

import System
import SharpTui

func printHelp() {
  Console.WriteLine("sharptg - a Telegram client for the terminal")
  Console.WriteLine("")
  Console.WriteLine("Usage: sharptg [options]")
  Console.WriteLine("")
  Console.WriteLine("Options:")
  Console.WriteLine("  --force-low-colors  use the ANSI 16-color palette")
  Console.WriteLine("  --selfcheck         run non-interactive checks")
  Console.WriteLine("  --demo              open the sample conversation without Telegram")
  Console.WriteLine("  --version           show the version")
  Console.WriteLine("  -h, --help          show this help")
}

func Main(args []string) int32 {
  var demo = false
  var selfcheck = false
  var forceLowColors = false
  for arg in args {
    if arg == "-h" || arg == "--help" {
      printHelp()
      return 0
    } else if arg == "--version" {
      Console.WriteLine("sharptg 0.7.0")
      return 0
    } else if arg == "--selfcheck" {
      selfcheck = true
    } else if arg == "--demo" {
      demo = true
    } else if arg == "--force-low-colors" {
      forceLowColors = true
    } else {
      Console.Error.WriteLine("sharptg: unknown option " + arg)
      printHelp()
      return 2
    }
  }
  if selfcheck { return TgtuiChecks.Run() }

  let theme = TgtuiTheme()
  let app = App()
  if forceLowColors { app.ColorMode = TerminalColorMode.Palette16 }
  let service = TelegramService(app, demo)
  defer service.Dispose()
  app.DefaultStyle = theme.Canvas
  app.MouseTracking = MouseTracking.AllMotion
  app.TickInterval = TimeSpan.Zero
  app.Run(TgtuiApplicationView(app, service, theme))
  return 0
}
