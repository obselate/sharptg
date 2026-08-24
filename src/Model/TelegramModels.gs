package Tgtui

import System.Collections.Generic

internal enum TelegramConnectionState { Connected; Reconnecting; Disconnected }

internal class TelegramLinkPreview {
  internal var Url string
  internal var DisplayUrl string
  internal var SiteName string
  internal var Title string
  internal var Description string
  internal var Author string
  internal var TypeLabel string
  internal var HasMedia bool
  internal var ShowAboveText bool

  public init() {
    Url = ""
    DisplayUrl = ""
    SiteName = ""
    Title = ""
    Description = ""
    Author = ""
    TypeLabel = ""
    HasMedia = false
    ShowAboveText = false
  }
}

internal class TelegramMessage {
  internal var Id string
  internal var TdId int64
  internal var SenderId int64
  internal var Author string
  internal var Text string
  internal var Time string
  internal var Outgoing bool
  internal var Read bool
  internal var ReplyAuthor string
  internal var ReplyText string
  internal var ReplyToId int64
  internal var LinkPreview TelegramLinkPreview?
  internal var LinkPreviewRequested bool

  public init(id string, author string, text string, time string, outgoing bool) {
    Id = id
    TdId = 0
    SenderId = 0
    Author = author
    Text = text
    Time = time
    Outgoing = outgoing
    Read = outgoing
    ReplyAuthor = ""
    ReplyText = ""
    ReplyToId = 0
    LinkPreview = nil
    LinkPreviewRequested = false
  }
}

internal class TelegramChat {
  internal var Id string
  internal var TdId int64
  internal var UserId int64
  internal var Initials string
  internal var Title string
  internal var Preview string
  internal var Time string
  internal var Unread int32
  internal var Muted bool
  internal var Pinned bool
  internal var Online bool
  internal var Archived bool
  internal var CanSend bool
  internal var MainOrder int64
  internal var ArchiveOrder int64
  internal var MainPinned bool
  internal var ArchivePinned bool
  internal var LastReadOutboxId int64
  internal var LastMessageDate int32
  internal var Messages List[TelegramMessage]

  public init(id string, initials string, title string, preview string, time string) {
    Id = id
    TdId = 0
    UserId = 0
    Initials = initials
    Title = title
    Preview = preview
    Time = time
    Unread = 0
    Muted = false
    Pinned = false
    Online = false
    Archived = false
    CanSend = true
    MainOrder = 0
    ArchiveOrder = 0
    MainPinned = false
    ArchivePinned = false
    LastReadOutboxId = 0
    LastMessageDate = 0
    Messages = List[TelegramMessage]()
  }
}
