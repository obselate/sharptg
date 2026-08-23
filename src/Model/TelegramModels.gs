package Tgtui

import System.Collections.Generic

internal class TelegramMessage {
  internal var Id string
  internal var Author string
  internal var Text string
  internal var Time string
  internal var Outgoing bool
  internal var Read bool
  internal var ReplyAuthor string
  internal var ReplyText string

  public init(id string, author string, text string, time string, outgoing bool) {
    Id = id
    Author = author
    Text = text
    Time = time
    Outgoing = outgoing
    Read = outgoing
    ReplyAuthor = ""
    ReplyText = ""
  }
}

internal class TelegramChat {
  internal var Id string
  internal var Initials string
  internal var Title string
  internal var Preview string
  internal var Time string
  internal var Unread int32
  internal var Muted bool
  internal var Pinned bool
  internal var Online bool
  internal var Archived bool
  internal var Messages List[TelegramMessage]

  public init(id string, initials string, title string, preview string, time string) {
    Id = id
    Initials = initials
    Title = title
    Preview = preview
    Time = time
    Unread = 0
    Muted = false
    Pinned = false
    Online = false
    Archived = true
    Messages = List[TelegramMessage]()
  }
}
