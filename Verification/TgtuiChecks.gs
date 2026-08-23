package Tgtui

import System
import SharpTui

internal class TgtuiChecks {
  shared {
    internal func Run() int32 {
      var failures = 0
      let service = TelegramService(App(), true)
      failures = failures + expect(service.Chats.Count == 5, "seeded chat count")
      guard let first = service.SelectedChat else { return 1 }
      failures = failures + expect(first.Title == "Mikhail", "initial selection")
      service.Select(2)
      guard let selected = service.SelectedChat else { return 1 }
      failures = failures + expect(selected.Id == "inside-windows", "chat selection")
      failures = failures + expect(selected.Unread == 0, "selection clears unread")
      let before = selected.Messages.Count
      service.Send("compiler-grounded hello")
      failures = failures + expect(selected.Messages.Count == before + 1, "send appends message")
      failures = failures + expect(selected.Preview == "compiler-grounded hello", "send refreshes preview")
      service.Send("   ")
      failures = failures + expect(selected.Messages.Count == before + 1, "blank send ignored")
      let qr = QrCodeView(TgtuiTheme())
      qr.Text = "tg://login?token=tgtui-selfcheck"
      failures = failures + expect(qr.ModuleSize > 0, "QR encoding")
      if failures == 0 {
        Console.WriteLine("selfcheck: pass")
        return 0
      }
      Console.Error.WriteLine("selfcheck: " + failures.ToString() + " failed")
      return 1
    }

    private func expect(condition bool, name string) int32 {
      if condition { return 0 }
      Console.Error.WriteLine("FAIL " + name)
      return 1
    }
  }
}
