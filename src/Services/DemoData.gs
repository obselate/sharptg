package Tgtui

import System.Collections.Generic

internal func createDemoChats() List[TelegramChat] {
  let chats = List[TelegramChat]()
  let mikhail = TelegramChat("mikhail", "MI", "Mikhail", "♥ Sticker", "00:58")
  mikhail.Online = true
  mikhail.Pinned = true
  mikhail.Messages.Add(TelegramMessage("1", "Sam", "very good work", "03:41", true))
  mikhail.Messages.Add(TelegramMessage("2", "Mikhail", "thanks brotha", "09:28", false))
  mikhail.Messages.Add(TelegramMessage("3", "Sam", "I made a TUI Telegram client, do you want to have a fake-sounding chat so I can put you on the screenshot?", "00:56", true))
  mikhail.Messages.Add(TelegramMessage("4", "Mikhail", "Yeah sure why not", "00:56", false))
  let link = TelegramMessage("5", "Sam", "for you", "00:57", true)
  link.LinkPreview = TelegramLinkPreview{
    Url: "https://youtube.com/watch?v=w9wi0cPrU4U",
    DisplayUrl: "youtube.com/watch?v=w9wi0cPrU4U",
    SiteName: "YouTube",
    Title: "BANE - FOR YOU",
    Description: "Bane's For You clip from The Dark Knight Rises",
    TypeLabel: "Video",
    HasMedia: true,
  }
  mikhail.Messages.Add(link)
  mikhail.Messages.Add(TelegramMessage("6", "Mikhail", "ha, that's a good one!", "00:57", false))
  let reply = TelegramMessage("7", "Sam", "for you", "00:57", true)
  reply.ReplyAuthor = "Mikhail"
  reply.ReplyText = "ha, that's a good one!"
  mikhail.Messages.Add(reply)
  mikhail.Messages.Add(TelegramMessage("8", "Mikhail", "❤️ Sticker", "00:58", false))
  chats.Add(mikhail)

  let sam = TelegramChat("sam", "SA", "Sam Pavlovic's Association", "hello", "yesterday")
  sam.Unread = 2
  sam.Messages.Add(TelegramMessage("9", "Sam Pavlovic", "hello", "18:12", false))
  chats.Add(sam)

  let windows = TelegramChat("inside-windows", "IN", "Inside Windows™ Chat", "I am showing it a visual bug…", "yesterday")
  windows.Unread = 14
  windows.Muted = true
  windows.Messages.Add(TelegramMessage("10", "Inside Windows", "I am showing it a visual bug in the latest build.", "16:48", false))
  chats.Add(windows)

  let lex = TelegramChat("lex", "LE", "Lex Fridman Group 🔇", "Unsupported message", "yesterday")
  lex.Muted = true
  lex.Messages.Add(TelegramMessage("11", "Lex", "Unsupported message", "15:03", false))
  chats.Add(lex)

  let paper = TelegramChat("paper", "PA", "Paper Plane 🔇", "😭 Sticker", "07 Jul")
  paper.Messages.Add(TelegramMessage("12", "Paper Plane", "😭 Sticker", "07 Jul", false))
  chats.Add(paper)
  return chats
}
