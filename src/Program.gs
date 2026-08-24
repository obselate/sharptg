package Tgtui

import System
import SharpTui

func printHelp() {
  Console.WriteLine("tgtui - a Telegram client for the terminal")
  Console.WriteLine("")
  Console.WriteLine("Usage: tgtui [--demo] [--selfcheck]")
  Console.WriteLine("")
  Console.WriteLine("Options:")
  Console.WriteLine("  --selfcheck  run non-interactive checks")
  Console.WriteLine("  --demo       open the sample conversation without Telegram")
  Console.WriteLine("  --version    show the version")
  Console.WriteLine("  -h, --help   show this help")
}

func Main(args []string) int32 {
  if args.Length > 0 && (args[0] == "-h" || args[0] == "--help") {
    printHelp()
    return 0
  }
  if args.Length > 0 && args[0] == "--version" {
    Console.WriteLine("tgtui 0.7.0")
    return 0
  }
  if args.Length > 0 && args[0] == "--selfcheck" {
    return TgtuiChecks.Run()
  }
  let demo = args.Length == 1 && args[0] == "--demo"
  if args.Length > 0 && !demo {
    Console.Error.WriteLine("tgtui: unknown option " + args[0])
    return 2
  }

  let theme = TgtuiTheme()
  let app = App()
  let service = TelegramService(app, demo)
  defer service.Dispose()
  app.DefaultStyle = theme.Canvas
  app.MouseTracking = MouseTracking.AllMotion
  app.TickInterval = TimeSpan.Zero
  app.Run(TgtuiApplicationView(app, service, theme))
  return 0
}
