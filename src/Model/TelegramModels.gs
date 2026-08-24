package Tgtui

import System.Collections.Generic

internal enum TelegramConnectionState { Connected; Reconnecting; Disconnected }

internal class TelegramChatList {
  internal let Id int32
  internal let Title string

  public init(id int32, title string) {
    Id = id
    Title = title
  }
}

internal class TelegramChatPosition {
  internal let Order int64
  internal let Pinned bool

  public init(order int64, pinned bool) {
    Order = order
    Pinned = pinned
  }
}

internal enum TelegramReceiptStatus { None; Pending; Failed; Sent; Read }

internal enum TelegramMessageKind {
  Text;
  Photo;
  Video;
  Voice;
  VideoNote;
  Audio;
  Document;
  Sticker;
  Animation;
  Location;
  Contact;
  Poll;
  Call;
  Service;
  Unsupported
}

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
  internal var SenderIsChat bool
  internal var Author string
  internal var Text string
  internal var Time string
  internal var Date int32
  internal var Kind TelegramMessageKind
  internal var Outgoing bool
  internal var Edited bool
  internal var Receipt TelegramReceiptStatus
  internal var ShowAuthor bool
  internal var ReplyAuthor string
  internal var ReplyText string
  internal var ReplyToId int64
  internal var Forwarded bool
  internal var ForwardAuthor string
  internal var ForwardAuthorSecondary string
  internal var ForwardDate int32
  internal var Links List[string]
  internal var LinkPreview TelegramLinkPreview?
  internal var LinkPreviewRequested bool

  public init(id string, author string, text string, time string, outgoing bool) {
    Id = id
    TdId = 0
    SenderId = 0
    SenderIsChat = false
    Author = author
    Text = text
    Time = time
    Date = 0
    Kind = TelegramMessageKind.Text
    Outgoing = outgoing
    Edited = false
    Receipt = outgoing ? TelegramReceiptStatus.Sent : TelegramReceiptStatus.None
    ShowAuthor = false
    ReplyAuthor = ""
    ReplyText = ""
    ReplyToId = 0
    Forwarded = false
    ForwardAuthor = ""
    ForwardAuthorSecondary = ""
    ForwardDate = 0
    Links = List[string]()
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
  internal var MarkedUnread bool
  internal var Muted bool
  internal var Pinned bool
  internal var Online bool
  internal var Group bool
  internal var Channel bool
  internal var CanSend bool
  internal var Positions Dictionary[int32, TelegramChatPosition]
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
    MarkedUnread = false
    Muted = false
    Pinned = false
    Online = false
    Group = false
    Channel = false
    CanSend = true
    Positions = Dictionary[int32, TelegramChatPosition]()
    LastReadOutboxId = 0
    LastMessageDate = 0
    Messages = List[TelegramMessage]()
  }
}
