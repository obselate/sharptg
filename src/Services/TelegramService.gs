package Tgtui

import System
import System.Collections.Generic
import System.IO
import System.Globalization
import System.Text.Json
import System.Text.Json.Nodes
import System.Text
import System.Threading
import SharpTui

internal class TelegramService {
  private var app App
  private var chats List[TelegramChat]
  private var knownChats Dictionary[string, TelegramChat]
  private var users Dictionary[int64, string]
  private var auth AuthState
  private var selectedIndex int32
  private var revision int32
  private var clientId int32
  private var apiId int32
  private var apiHash string
  private var qrRequested bool
  private var resettingPhone bool
  private var stopping bool
  private var receiver Thread?
  private var showArchive bool
  private var chatsLoading bool
  private var messagesLoading bool
  private var connectionText string
  private var openChatId int64
  private var pendingChatLoads int32
  private var demoMode bool

  internal prop Chats List[TelegramChat] -> chats
  internal prop Auth AuthState -> auth
  internal prop HasChats bool -> chats.Count > 0
  internal prop SelectedChat TelegramChat? {
    get {
      if !HasChats { return nil }
      return chats[selectedIndex]
    }
  }
  internal prop SelectedIndex int32 -> selectedIndex
  internal prop Revision int32 -> revision
  internal prop ShowArchive bool -> showArchive
  internal prop ChatsLoading bool -> chatsLoading
  internal prop MessagesLoading bool -> messagesLoading
  internal prop ConnectionText string -> connectionText

  public init(app App, demo bool) {
    this.app = app
    chats = List[TelegramChat]()
    knownChats = Dictionary[string, TelegramChat]()
    users = Dictionary[int64, string]()
    auth = AuthState()
    selectedIndex = 0
    revision = 1
    clientId = 0
    apiId = 0
    apiHash = ""
    qrRequested = false
    resettingPhone = false
    stopping = false
    receiver = nil
    showArchive = false
    chatsLoading = false
    messagesLoading = false
    connectionText = "Connecting"
    openChatId = 0
    pendingChatLoads = 0
    demoMode = demo

    if demo {
      chats = createDemoChats()
      auth.Phase = AuthPhase.Ready
      auth.Hint = "Demo session"
      connectionText = "Demo session"
      return
    }
    start()
  }

  internal func Select(index int32) {
    if index < 0 || index >= chats.Count || index == selectedIndex { return }
    selectedIndex = index
    if demoMode { chats[index].Unread = 0 }
    openSelectedChat()
    changed()
  }

  internal func Send(text string) {
    let clean = text.Trim()
    if clean == "" || !HasChats { return }
    guard let chat = SelectedChat else { return }
    if !demoMode {
      if !chat.CanSend || chat.TdId == 0 { return }
      let formatted = JsonObject()
      formatted["@type"] = "formattedText"
      formatted["text"] = clean
      formatted["entities"] = JsonArray()
      let content = JsonObject()
      content["@type"] = "inputMessageText"
      content["text"] = formatted
      content["clear_draft"] = true
      let request = JsonObject()
      request["@type"] = "sendMessage"
      request["chat_id"] = chat.TdId
      request["input_message_content"] = content
      send(request.ToJsonString())
      return
    }
    let message = TelegramMessage(
      "local-" + revision.ToString(),
      "Sam",
      clean,
      DateTime.Now.ToString("HH:mm"),
      true)
    chat.Messages.Add(message)
    chat.Preview = clean
    chat.Time = message.Time
    changed()
  }

  internal func SetArchive(value bool) {
    if showArchive == value { return }
    showArchive = value
    rebuildChats()
    changed()
  }

  private func usePhoneLogin() {
    qrRequested = false
    auth.Phase = AuthPhase.Phone
    auth.Hint = "Enter your phone number with country code"
    auth.Link = ""
    changed()
  }

  internal func UseQrLogin() {
    if auth.Phase != AuthPhase.Phone { return }
    qrRequested = true
    auth.Phase = AuthPhase.Qr
    auth.Hint = "Generating login link"
    auth.Link = ""
    send("{\"@type\":\"requestQrCodeAuthentication\"}")
    changed()
  }

  internal func UsePhoneLogin() {
    if auth.Phase != AuthPhase.Qr || resettingPhone { return }
    resetPhoneLogin()
  }

  internal func SubmitPhone(phone string) {
    if auth.Phase != AuthPhase.Phone { return }
    let clean = phone.Trim()
    if clean == "" { return }
    auth.Hint = "Checking phone number"
    sendAuthentication("setAuthenticationPhoneNumber", "phone_number", clean)
    changed()
  }

  internal func SubmitCode(code string) {
    if auth.Phase != AuthPhase.Code { return }
    let clean = code.Trim()
    if clean == "" { return }
    auth.Hint = "Checking verification code"
    sendAuthentication("checkAuthenticationCode", "code", clean)
    changed()
  }

  internal func SubmitPassword(password string) {
    if auth.Phase != AuthPhase.Password { return }
    if password == "" { return }
    auth.Hint = "Checking cloud password"
    sendAuthentication("checkAuthenticationPassword", "password", password)
    changed()
  }

  internal func SubmitCredentials(idText string, hashText string) {
    if auth.Phase != AuthPhase.Setup { return }
    guard let credentials = TelegramCredentialStore.Parse(idText, hashText) else {
      auth.Hint = "Use a numeric API ID and 32-character API hash"
      changed()
      return
    }
    try {
      TelegramCredentialStore.Save(credentials)
    } catch (failure Exception) {
      auth.Hint = "Could not save credentials: " + failure.Message
      changed()
      return
    }
    apiId = credentials.ApiId
    apiHash = credentials.ApiHash
    auth.Phase = AuthPhase.Starting
    auth.Hint = "Starting Telegram"
    changed()
    startReceiver()
  }

  internal func CopyQrLink() {
    if auth.Phase != AuthPhase.Qr || auth.Link == "" { return }
    let encoded = Convert.ToBase64String(Encoding.UTF8.GetBytes(auth.Link))
    Console.Out.Write("\u001b]52;c;" + encoded + "\u0007")
    Console.Out.Flush()
    auth.Hint = "Login link copied"
    changed()
  }

  internal func Dispose() {
    stopping = true
    if clientId != 0 { send("{\"@type\":\"close\"}") }
    if let worker = receiver {
      if worker.IsAlive { worker.Join(1000) }
    }
  }

  private func start() {
    guard let credentials = TelegramCredentialStore.Load() else {
      auth.Phase = AuthPhase.Setup
      auth.Hint = "Enter the app credentials from my.telegram.org"
      changed()
      return
    }
    apiId = credentials.ApiId
    apiHash = credentials.ApiHash
    startReceiver()
  }

  private func startReceiver() {
    let worker = Thread(() -> receiveLoop())
    worker.IsBackground = true
    worker.Name = "tdlib"
    receiver = worker
    worker.Start()
  }

  private func receiveLoop() {
    try {
      tdRead(tdExecute("{\"@type\":\"setLogVerbosityLevel\",\"new_verbosity_level\":1}"))
      clientId = tdCreateClientId()
      send("{\"@type\":\"getOption\",\"name\":\"version\"}")
      while !stopping {
        let payload = tdRead(tdReceive(0.5))
        if payload != "" { app.Post(() -> process(payload)) }
      }
    } catch (failure Exception) {
      app.Post(() -> fail(failure.Message))
    }
  }

  private func process(payload string) {
    try {
      using let document = JsonDocument.Parse(payload)
      let root = document.RootElement
      let kind = jsonString(root, "@type")
      if kind == "updateAuthorizationState" {
        if root.TryGetProperty("authorization_state", out var state) { processAuth(state) }
        return
      }
      if kind == "error" {
        processError(root)
        return
      }
      if kind == "ok" {
        completeChatLoad(jsonString(root, "@extra"))
        return
      }
      if kind == "messages" {
        processHistory(root)
        return
      }
      if kind == "chat" {
        upsertChat(root)
        return
      }
      if kind == "user" {
        processUser(root)
        return
      }
      if kind == "updateConnectionState" {
        processConnection(root)
        return
      }
      if kind == "updateNewChat" {
        if root.TryGetProperty("chat", out var chat) { upsertChat(chat) }
        return
      }
      if kind == "updateChatLastMessage" {
        processLastMessage(root)
        return
      }
      if kind == "updateChatPosition" {
        processChatPosition(root)
        return
      }
      if kind == "updateChatReadInbox" {
        processReadInbox(root)
        return
      }
      if kind == "updateChatReadOutbox" {
        processReadOutbox(root)
        return
      }
      if kind == "updateChatTitle" {
        processChatTitle(root)
        return
      }
      if kind == "updateChatNotificationSettings" {
        processNotificationSettings(root)
        return
      }
      if kind == "updateChatPermissions" {
        processPermissions(root)
        return
      }
      if kind == "updateUser" {
        if root.TryGetProperty("user", out var user) { processUser(user) }
        return
      }
      if kind == "updateUserStatus" {
        processUserStatus(root)
        return
      }
      if kind == "updateNewMessage" {
        if root.TryGetProperty("message", out var message) { processNewMessage(message) }
        return
      }
      if kind == "updateMessageSendSucceeded" {
        processSendSucceeded(root)
        return
      }
      if kind == "updateMessageContent" {
        processMessageContent(root)
        return
      }
      if kind == "updateDeleteMessages" { processDeletedMessages(root) }
    } catch (failure Exception) {
      fail(failure.Message)
    }
  }

  private func processAuth(state JsonElement) {
    let kind = jsonString(state, "@type")
    if kind == "authorizationStateWaitTdlibParameters" {
      sendParameters()
    } else if kind == "authorizationStateWaitEncryptionKey" {
      send("{\"@type\":\"checkDatabaseEncryptionKey\",\"encryption_key\":\"\"}")
    } else if kind == "authorizationStateWaitPhoneNumber" {
      usePhoneLogin()
    } else if kind == "authorizationStateWaitOtherDeviceConfirmation" {
      if !qrRequested {
        resetPhoneLogin()
        return
      }
      auth.Phase = AuthPhase.Qr
      auth.Link = jsonString(state, "link")
      auth.Hint = "Settings > Devices > Link Desktop"
      changed()
    } else if kind == "authorizationStateWaitCode" {
      auth.Phase = AuthPhase.Code
      auth.Hint = "Enter the code sent by Telegram"
      changed()
    } else if kind == "authorizationStateWaitPassword" {
      auth.Phase = AuthPhase.Password
      auth.Hint = jsonString(state, "password_hint")
      changed()
    } else if kind == "authorizationStateReady" {
      auth.Phase = AuthPhase.Ready
      auth.Hint = "Connected"
      beginChatSync()
      changed()
    } else if kind == "authorizationStateClosed" {
      if resettingPhone && !stopping {
        resettingPhone = false
        auth.Phase = AuthPhase.Starting
        auth.Hint = "Starting phone login"
        clientId = tdCreateClientId()
        send("{\"@type\":\"getOption\",\"name\":\"version\"}")
        changed()
        return
      }
      auth.Phase = AuthPhase.Closed
      auth.Hint = "Telegram session closed"
      changed()
    }
  }

  private func beginChatSync() {
    connectionText = "Connected"
    chatsLoading = true
    pendingChatLoads = 2
    requestChatList(false)
    requestChatList(true)
    let me = JsonObject()
    me["@type"] = "getMe"
    me["@extra"] = "me"
    send(me.ToJsonString())
  }

  private func requestChatList(archive bool) {
    let list = JsonObject()
    list["@type"] = archive ? "chatListArchive" : "chatListMain"
    let request = JsonObject()
    request["@type"] = "loadChats"
    request["@extra"] = archive ? "load:archive" : "load:main"
    request["chat_list"] = list
    request["limit"] = 100
    send(request.ToJsonString())
  }

  private func completeChatLoad(extra string) {
    if !extra.StartsWith("load:") { return }
    if pendingChatLoads > 0 { pendingChatLoads = pendingChatLoads - 1 }
    chatsLoading = pendingChatLoads > 0
    rebuildChats()
    changed()
  }

  private func processError(root JsonElement) {
    let extra = jsonString(root, "@extra")
    if extra.StartsWith("load:") {
      completeChatLoad(extra)
      return
    }
    if extra.StartsWith("history:") {
      messagesLoading = false
      changed()
      return
    }
    if auth.Phase != AuthPhase.Ready { fail(jsonString(root, "message")) }
  }

  private func processConnection(root JsonElement) {
    if !root.TryGetProperty("state", out var state) { return }
    let kind = jsonString(state, "@type")
    if kind == "connectionStateReady" {
      connectionText = "Connected"
    } else if kind == "connectionStateConnecting" {
      connectionText = "Connecting"
    } else if kind == "connectionStateUpdating" {
      connectionText = "Updating"
    } else if kind == "connectionStateWaitingForNetwork" {
      connectionText = "Waiting for network"
    } else {
      connectionText = "Connecting"
    }
    changed()
  }

  private func upsertChat(root JsonElement) {
    let id = jsonInt64(root, "id")
    if id == 0 { return }
    let idText = id.ToString(CultureInfo.InvariantCulture)
    if knownChats.TryGetValue(idText, out var chat) {
      applyChat(chat, root)
    } else {
      let title = jsonString(root, "title")
      let created = TelegramChat(idText, initials(title), title, "", "")
      created.TdId = id
      knownChats[idText] = created
      applyChat(created, root)
    }
    rebuildChats()
    changed()
  }

  private func applyChat(chat TelegramChat, root JsonElement) {
    let title = jsonString(root, "title")
    if title != "" {
      chat.Title = title
      chat.Initials = initials(title)
    }
    chat.Unread = jsonInt32(root, "unread_count", chat.Unread)
    chat.LastReadOutboxId = jsonInt64(root, "last_read_outbox_message_id", chat.LastReadOutboxId)
    if root.TryGetProperty("type", out var chatType) {
      if jsonString(chatType, "@type") == "chatTypePrivate" {
        chat.UserId = jsonInt64(chatType, "user_id")
      }
    }
    if root.TryGetProperty("notification_settings", out var settings) {
      chat.Muted = jsonInt32(settings, "mute_for") > 0
    }
    if root.TryGetProperty("permissions", out var permissions) {
      chat.CanSend = jsonBool(permissions, "can_send_basic_messages", true)
    }
    if root.TryGetProperty("positions", out var positions) { applyPositions(chat, positions) }
    if root.TryGetProperty("last_message", out var lastMessage) && lastMessage.ValueKind == JsonValueKind.Object {
      applyLastMessage(chat, lastMessage)
    }
    chat.Archived = chat.MainOrder == 0 && chat.ArchiveOrder > 0
    updateReceipts(chat)
  }

  private func applyPositions(chat TelegramChat, positions JsonElement) {
    if positions.ValueKind != JsonValueKind.Array { return }
    for position in positions.EnumerateArray() { applyPosition(chat, position) }
  }

  private func applyPosition(chat TelegramChat, position JsonElement) {
    if !position.TryGetProperty("list", out var list) { return }
    let kind = jsonString(list, "@type")
    let order = jsonInt64(position, "order")
    let pinned = jsonBool(position, "is_pinned")
    if kind == "chatListMain" {
      chat.MainOrder = order
      chat.MainPinned = pinned
    } else if kind == "chatListArchive" {
      chat.ArchiveOrder = order
      chat.ArchivePinned = pinned
    }
    chat.Archived = chat.MainOrder == 0 && chat.ArchiveOrder > 0
  }

  private func rebuildChats() {
    let selectedId = if let selected = SelectedChat { selected.Id } else { "" }
    chats.Clear()
    for chat in knownChats.Values {
      let order = showArchive ? chat.ArchiveOrder : chat.MainOrder
      if order == 0 { continue }
      chat.Pinned = showArchive ? chat.ArchivePinned : chat.MainPinned
      chats.Add(chat)
    }
    sortChats()
    selectedIndex = 0
    if selectedId != "" {
      var index = 0
      while index < chats.Count {
        if chats[index].Id == selectedId {
          selectedIndex = index
          break
        }
        index = index + 1
      }
    }
    if HasChats {
      openSelectedChat()
    } else if openChatId != 0 {
      closeOpenChat()
    }
  }

  private func sortChats() {
    var index = 1
    while index < chats.Count {
      var current = index
      while current > 0 && chatBefore(chats[current], chats[current - 1]) {
        let previous = chats[current - 1]
        chats[current - 1] = chats[current]
        chats[current] = previous
        current = current - 1
      }
      index = index + 1
    }
  }

  private func chatBefore(left TelegramChat, right TelegramChat) bool {
    if left.Pinned != right.Pinned { return left.Pinned }
    let leftOrder = showArchive ? left.ArchiveOrder : left.MainOrder
    let rightOrder = showArchive ? right.ArchiveOrder : right.MainOrder
    if leftOrder != rightOrder { return leftOrder > rightOrder }
    return left.LastMessageDate > right.LastMessageDate
  }

  private func openSelectedChat() {
    if demoMode { return }
    guard let chat = SelectedChat else { return }
    if chat.TdId == 0 || openChatId == chat.TdId { return }
    closeOpenChat()
    openChatId = chat.TdId
    chat.Messages.Clear()
    chat.Unread = 0
    messagesLoading = true
    let request = JsonObject()
    request["@type"] = "openChat"
    request["chat_id"] = chat.TdId
    send(request.ToJsonString())
    requestHistory(chat.TdId, 0, 0)
  }

  private func closeOpenChat() {
    if openChatId == 0 { return }
    let close = JsonObject()
    close["@type"] = "closeChat"
    close["chat_id"] = openChatId
    send(close.ToJsonString())
    openChatId = 0
    messagesLoading = false
  }

  private func requestHistory(chatId int64, fromMessageId int64, page int32) {
    let request = JsonObject()
    request["@type"] = "getChatHistory"
    let extra = "history:" + chatId.ToString(CultureInfo.InvariantCulture) + ":" + fromMessageId.ToString(CultureInfo.InvariantCulture) + ":" + page.ToString(CultureInfo.InvariantCulture)
    request["@extra"] = extra
    request["chat_id"] = chatId
    request["from_message_id"] = fromMessageId
    request["offset"] = 0
    request["limit"] = 100
    request["only_local"] = false
    send(request.ToJsonString())
  }

  private func processHistory(root JsonElement) {
    let parts = jsonString(root, "@extra").Split(':')
    if parts.Length != 4 { return }
    if !Int64.TryParse(parts[1], out var chatId) || chatId != openChatId { return }
    if !Int64.TryParse(parts[2], out var fromMessageId) { return }
    if !Int32.TryParse(parts[3], out var page) { return }
    guard let chat = findChat(chatId) else { return }
    if !root.TryGetProperty("messages", out var messages) || messages.ValueKind != JsonValueKind.Array {
      messagesLoading = false
      changed()
      return
    }
    if fromMessageId == 0 { chat.Messages.Clear() }
    var added = 0
    var index = 0
    while index < messages.GetArrayLength() {
      let source = messages[index]
      if source.ValueKind == JsonValueKind.Object {
        let message = convertMessage(source, chat)
        if message.TdId != 0 && !hasMessage(chat, message.TdId) {
          chat.Messages.Insert(0, message)
          added = added + 1
        }
      }
      index = index + 1
    }
    resolveReplies(chat)
    markRead(chat)
    if added == 0 && fromMessageId == 0 && page == 0 {
      requestHistory(chatId, 0, 1)
      changed()
      return
    }
    if added > 0 && chat.Messages.Count < 100 && page < 20 {
      let oldest = chat.Messages[0].TdId
      requestHistory(chatId, oldest, page + 1)
    } else {
      messagesLoading = false
    }
    changed()
  }

  private func processLastMessage(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    if root.TryGetProperty("last_message", out var message) && message.ValueKind == JsonValueKind.Object {
      applyLastMessage(chat, message)
    }
    if root.TryGetProperty("positions", out var positions) { applyPositions(chat, positions) }
    rebuildChats()
    changed()
  }

  private func processChatPosition(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    if root.TryGetProperty("position", out var position) { applyPosition(chat, position) }
    rebuildChats()
    changed()
  }

  private func processReadInbox(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    chat.Unread = jsonInt32(root, "unread_count")
    changed()
  }

  private func processReadOutbox(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    chat.LastReadOutboxId = jsonInt64(root, "last_read_outbox_message_id")
    updateReceipts(chat)
    changed()
  }

  private func processChatTitle(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    chat.Title = jsonString(root, "title")
    chat.Initials = initials(chat.Title)
    changed()
  }

  private func processNotificationSettings(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    if root.TryGetProperty("notification_settings", out var settings) {
      chat.Muted = jsonInt32(settings, "mute_for") > 0
      changed()
    }
  }

  private func processPermissions(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    if root.TryGetProperty("permissions", out var permissions) {
      chat.CanSend = jsonBool(permissions, "can_send_basic_messages", true)
      changed()
    }
  }

  private func processUser(root JsonElement) {
    let id = jsonInt64(root, "id")
    if id == 0 { return }
    let first = jsonString(root, "first_name")
    let last = jsonString(root, "last_name")
    var name = (first + " " + last).Trim()
    if name == "" { name = "User" }
    users[id] = name
    for chat in knownChats.Values {
      for message in chat.Messages {
        if message.SenderId == id { message.Author = name }
      }
    }
    changed()
  }

  private func processUserStatus(root JsonElement) {
    let userId = jsonInt64(root, "user_id")
    if !root.TryGetProperty("status", out var status) { return }
    let online = jsonString(status, "@type") == "userStatusOnline"
    for chat in knownChats.Values {
      if chat.UserId == userId { chat.Online = online }
    }
    changed()
  }

  private func processNewMessage(root JsonElement) {
    let chatId = jsonInt64(root, "chat_id")
    guard let chat = findChat(chatId) else {
      requestChat(chatId)
      return
    }
    let message = convertMessage(root, chat)
    if chatId == openChatId && !hasMessage(chat, message.TdId) {
      chat.Messages.Add(message)
      resolveReplies(chat)
      markRead(chat)
    }
    applyLastMessage(chat, root)
    rebuildChats()
    changed()
  }

  private func processSendSucceeded(root JsonElement) {
    if !root.TryGetProperty("message", out var source) { return }
    guard let chat = findChat(jsonInt64(source, "chat_id")) else { return }
    let oldId = jsonInt64(root, "old_message_id")
    removeMessage(chat, oldId)
    let message = convertMessage(source, chat)
    if chat.TdId == openChatId && !hasMessage(chat, message.TdId) { chat.Messages.Add(message) }
    applyLastMessage(chat, source)
    rebuildChats()
    changed()
  }

  private func processMessageContent(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    let messageId = jsonInt64(root, "message_id")
    if !root.TryGetProperty("new_content", out var content) { return }
    for message in chat.Messages {
      if message.TdId == messageId {
        message.Text = contentText(content)
        break
      }
    }
    changed()
  }

  private func processDeletedMessages(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    if !root.TryGetProperty("message_ids", out var ids) || ids.ValueKind != JsonValueKind.Array { return }
    for id in ids.EnumerateArray() { removeMessage(chat, elementInt64(id)) }
    changed()
  }

  private func requestChat(chatId int64) {
    if chatId == 0 { return }
    let request = JsonObject()
    request["@type"] = "getChat"
    request["chat_id"] = chatId
    send(request.ToJsonString())
  }

  private func applyLastMessage(chat TelegramChat, root JsonElement) {
    chat.Preview = messagePreview(root)
    chat.LastMessageDate = jsonInt32(root, "date")
    chat.Time = formatChatTime(chat.LastMessageDate)
  }

  private func convertMessage(root JsonElement, chat TelegramChat) TelegramMessage {
    let id = jsonInt64(root, "id")
    let outgoing = jsonBool(root, "is_outgoing")
    let senderId = senderId(root)
    var author = outgoing ? "You" : chat.Title
    if users.TryGetValue(senderId, out var senderName) { author = senderName }
    let message = TelegramMessage(
      id.ToString(CultureInfo.InvariantCulture),
      author,
      messagePreview(root),
      formatMessageTime(jsonInt32(root, "date")),
      outgoing)
    message.TdId = id
    message.SenderId = senderId
    message.Read = outgoing && id <= chat.LastReadOutboxId
    if root.TryGetProperty("reply_to", out var reply) {
      let replyId = jsonInt64(reply, "message_id")
      if replyId != 0 {
        message.ReplyText = replyId.ToString(CultureInfo.InvariantCulture)
        message.ReplyAuthor = "Reply"
      }
    }
    return message
  }

  private func resolveReplies(chat TelegramChat) {
    for message in chat.Messages {
      if message.ReplyAuthor != "Reply" { continue }
      if !Int64.TryParse(message.ReplyText, out var replyId) { continue }
      for source in chat.Messages {
        if source.TdId == replyId {
          message.ReplyAuthor = source.Author
          message.ReplyText = source.Text
          break
        }
      }
    }
  }

  private func markRead(chat TelegramChat) {
    if chat.TdId != openChatId || chat.Messages.Count == 0 { return }
    let ids = JsonArray()
    for message in chat.Messages {
      if message.TdId != 0 {
        ids.Add(JsonNode.Parse(message.TdId.ToString(CultureInfo.InvariantCulture)))
      }
    }
    if ids.Count == 0 { return }
    let source = JsonObject()
    source["@type"] = "messageSourceChatHistory"
    let request = JsonObject()
    request["@type"] = "viewMessages"
    request["chat_id"] = chat.TdId
    request["message_ids"] = ids
    request["source"] = source
    request["force_read"] = true
    send(request.ToJsonString())
    chat.Unread = 0
  }

  private func updateReceipts(chat TelegramChat) {
    for message in chat.Messages {
      if message.Outgoing { message.Read = message.TdId <= chat.LastReadOutboxId }
    }
  }

  private func findChat(id int64) TelegramChat? {
    if id == 0 { return nil }
    let key = id.ToString(CultureInfo.InvariantCulture)
    if knownChats.TryGetValue(key, out var chat) { return chat }
    return nil
  }

  private func hasMessage(chat TelegramChat, id int64) bool {
    if id == 0 { return false }
    for message in chat.Messages {
      if message.TdId == id { return true }
    }
    return false
  }

  private func removeMessage(chat TelegramChat, id int64) {
    var index = chat.Messages.Count - 1
    while index >= 0 {
      if chat.Messages[index].TdId == id { chat.Messages.RemoveAt(index) }
      index = index - 1
    }
  }

  private func messagePreview(root JsonElement) string {
    if !root.TryGetProperty("content", out var content) { return "Unsupported message" }
    return contentText(content)
  }

  private func contentText(content JsonElement) string {
    let kind = jsonString(content, "@type")
    if kind == "messageText" && content.TryGetProperty("text", out var text) {
      return formattedText(text)
    }
    let caption = if content.TryGetProperty("caption", out var value) { formattedText(value) } else { "" }
    if kind == "messagePhoto" { return mediaText("Photo", caption) }
    if kind == "messageVideo" { return mediaText("Video", caption) }
    if kind == "messageAnimation" { return mediaText("GIF", caption) }
    if kind == "messageVoiceNote" { return mediaText("Voice message", caption) }
    if kind == "messageVideoNote" { return "Video message" }
    if kind == "messageAudio" { return mediaText("Audio", caption) }
    if kind == "messageDocument" { return mediaText("Document", caption) }
    if kind == "messageSticker" && content.TryGetProperty("sticker", out var sticker) {
      let emoji = jsonString(sticker, "emoji")
      return emoji == "" ? "Sticker" : emoji + " Sticker"
    }
    if kind == "messagePoll" && content.TryGetProperty("poll", out var poll) {
      return "Poll: " + jsonString(poll, "question")
    }
    if kind == "messageContact" { return "Contact" }
    if kind == "messageLocation" { return "Location" }
    if kind == "messageVenue" { return "Location" }
    if kind == "messageCall" { return "Call" }
    if kind.StartsWith("messageChat") { return "Service message" }
    return "Unsupported message"
  }

  private func formattedText(root JsonElement) string -> jsonString(root, "text")

  private func mediaText(label string, caption string) string {
    if caption == "" { return label }
    return label + " · " + caption
  }

  private func senderId(root JsonElement) int64 {
    if !root.TryGetProperty("sender_id", out var sender) { return 0 }
    let kind = jsonString(sender, "@type")
    if kind == "messageSenderUser" { return jsonInt64(sender, "user_id") }
    if kind == "messageSenderChat" { return jsonInt64(sender, "chat_id") }
    return 0
  }

  private func initials(title string) string {
    let clean = title.Trim()
    if clean == "" { return "TG" }
    let words = clean.Split(' ', StringSplitOptions.RemoveEmptyEntries)
    if words.Length > 1 {
      return (words[0].Substring(0, 1) + words[1].Substring(0, 1)).ToUpperInvariant()
    }
    if clean.Length == 1 { return clean.ToUpperInvariant() }
    return clean.Substring(0, 2).ToUpperInvariant()
  }

  private func formatMessageTime(timestamp int32) string {
    if timestamp <= 0 { return "" }
    return DateTimeOffset.FromUnixTimeSeconds(timestamp).ToLocalTime().ToString("HH:mm")
  }

  private func formatChatTime(timestamp int32) string {
    if timestamp <= 0 { return "" }
    let value = DateTimeOffset.FromUnixTimeSeconds(timestamp).ToLocalTime()
    let today = DateTimeOffset.Now.Date
    if value.Date == today { return value.ToString("HH:mm") }
    if value.Date == today.AddDays(-1) { return "yesterday" }
    return value.ToString("dd MMM")
  }

  private func sendParameters() {
    var root = Environment.GetEnvironmentVariable("XDG_DATA_HOME") ?? ""
    if root.Trim() == "" {
      root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
    }
    if root == "" {
      root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "share")
    }
    let data = Path.Combine(root, "tgtui")
    Directory.CreateDirectory(data)
    let request = JsonObject()
    request["@type"] = "setTdlibParameters"
    request["use_test_dc"] = false
    request["database_directory"] = Path.Combine(data, "db")
    request["files_directory"] = Path.Combine(data, "files")
    request["database_encryption_key"] = ""
    request["use_file_database"] = true
    request["use_chat_info_database"] = true
    request["use_message_database"] = true
    request["use_secret_chats"] = true
    request["api_id"] = apiId
    request["api_hash"] = apiHash
    request["system_language_code"] = "en"
    request["device_model"] = "Terminal"
    request["system_version"] = Environment.OSVersion.VersionString
    request["application_version"] = "0.5.0"
    send(request.ToJsonString())
  }

  private func sendAuthentication(kind string, name string, value string) {
    let request = JsonObject()
    request["@type"] = kind
    request[name] = value
    send(request.ToJsonString())
  }

  private func resetPhoneLogin() {
    resettingPhone = true
    qrRequested = false
    auth.Phase = AuthPhase.Starting
    auth.Hint = "Returning to phone login"
    auth.Link = ""
    send("{\"@type\":\"destroy\"}")
    changed()
  }

  private func send(request string) {
    if clientId != 0 { tdSend(clientId, request) }
  }

  private func fail(message string) {
    if auth.Phase == AuthPhase.Qr && auth.Link == "" {
      auth.Phase = AuthPhase.Phone
      qrRequested = false
    }
    if auth.Phase == AuthPhase.Starting { auth.Phase = AuthPhase.Error }
    auth.Hint = message == "" ? "Telegram sign-in failed" : message
    changed()
  }

  private func changed() {
    revision = revision + 1
    app.RequestDraw()
  }

  private func jsonString(root JsonElement, name string) string {
    if root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String {
      return value.GetString() ?? ""
    }
    return ""
  }

  private func jsonInt64(root JsonElement, name string) int64 -> jsonInt64(root, name, 0)

  private func jsonInt64(root JsonElement, name string, fallback int64) int64 {
    if !root.TryGetProperty(name, out var value) { return fallback }
    return elementInt64(value, fallback)
  }

  private func elementInt64(value JsonElement) int64 -> elementInt64(value, 0)

  private func elementInt64(value JsonElement, fallback int64) int64 {
    if value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var number) { return number }
    if value.ValueKind == JsonValueKind.String
      && Int64.TryParse(value.GetString(), out var parsed) { return parsed }
    return fallback
  }

  private func jsonInt32(root JsonElement, name string) int32 -> jsonInt32(root, name, 0)

  private func jsonInt32(root JsonElement, name string, fallback int32) int32 {
    if !root.TryGetProperty(name, out var value) { return fallback }
    if value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) { return number }
    if value.ValueKind == JsonValueKind.String
      && Int32.TryParse(value.GetString(), out var parsed) { return parsed }
    return fallback
  }

  private func jsonBool(root JsonElement, name string) bool -> jsonBool(root, name, false)

  private func jsonBool(root JsonElement, name string, fallback bool) bool {
    if !root.TryGetProperty(name, out var value) { return fallback }
    if value.ValueKind == JsonValueKind.True { return true }
    if value.ValueKind == JsonValueKind.False { return false }
    return fallback
  }

}
