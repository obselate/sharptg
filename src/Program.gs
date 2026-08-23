package Tgtui

import System
import SharpTui

func printHelp() {
  Console.WriteLine("tgtui - a Telegram client for the terminal")
  Console.WriteLine("")
  Console.WriteLine("Usage: tgtui [--selfcheck]")
  Console.WriteLine("")
  Console.WriteLine("Options:")
  Console.WriteLine("  --selfcheck  run non-interactive checks")
  Console.WriteLine("  --version    show the version")
  Console.WriteLine("  -h, --help   show this help")
}

func Main(args []string) int32 {
  if args.Length > 0 && (args[0] == "-h" || args[0] == "--help") {
    printHelp()
    return 0
  }
  if args.Length > 0 && args[0] == "--version" {
    Console.WriteLine("tgtui 0.1.0")
    return 0
  }
  if args.Length > 0 && args[0] == "--selfcheck" {
    return TgtuiChecks.Run()
  }
  if args.Length > 0 {
    Console.Error.WriteLine("tgtui: unknown option " + args[0])
    return 2
  }

  let theme = TgtuiTheme()
  let service = DemoTelegramService()
  let app = App()
  app.DefaultStyle = theme.Canvas
  app.MouseTracking = MouseTracking.AllMotion
  app.TickInterval = TimeSpan.Zero
  app.Run(TgtuiView(app, service, theme))
  return 0
}
