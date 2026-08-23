package Tgtui

import System

internal class TgtuiChecks {
  shared {
    internal func Run() int32 {
      var failures = 0
      let service = DemoTelegramService()
      failures = failures + expect(service.Chats.Count == 5, "seeded chat count")
      failures = failures + expect(service.SelectedChat.Title == "Mikhail", "initial selection")
      service.Select(2)
      failures = failures + expect(service.SelectedChat.Id == "inside-windows", "chat selection")
      failures = failures + expect(service.SelectedChat.Unread == 0, "selection clears unread")
      let before = service.SelectedChat.Messages.Count
      service.Send("compiler-grounded hello")
      failures = failures + expect(service.SelectedChat.Messages.Count == before + 1, "send appends message")
      failures = failures + expect(service.SelectedChat.Preview == "compiler-grounded hello", "send refreshes preview")
      service.Send("   ")
      failures = failures + expect(service.SelectedChat.Messages.Count == before + 1, "blank send ignored")
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
