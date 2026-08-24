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
  private var pendingReplies Dictionary[string, TelegramMessage]
  private var pendingPreviews Dictionary[string, TelegramMessage]
  private var auth AuthState
  private var selectedIndex int32
  private var selectedOpen bool
  private var revision int32
  private var clientId int32
  private var apiId int32
  private var apiHash string
  private var qrRequested bool
  private var resettingPhone bool
  private var stopping bool
  private var receiver Thread?
  private var chatLists List[TelegramChatList]
  private var chatListTitles List[string]
  private var activeChatListIndex int32
  private var chatsLoading bool
  private var messagesLoading bool
  private var connectionText string
  private var connectionState TelegramConnectionState
  private var accountName string
  private var openChatId int64
  private var pendingChatLoads int32
  private var demoMode bool

  internal prop Chats List[TelegramChat] -> chats
  internal prop Auth AuthState -> auth
  internal prop HasChats bool -> chats.Count > 0
  internal prop SelectedChat TelegramChat? {
    get {
      if !HasChats || !selectedOpen { return nil }
      return chats[selectedIndex]
    }
  }
  internal prop SelectedIndex int32 -> selectedIndex
  internal prop Revision int32 -> revision
  internal prop ChatListTitles List[string] -> chatListTitles
  internal prop ActiveChatListIndex int32 -> activeChatListIndex
  internal prop ChatsLoading bool -> chatsLoading
  internal prop MessagesLoading bool -> messagesLoading
  internal prop ConnectionText string -> connectionText
  internal prop ConnectionState TelegramConnectionState -> connectionState
  internal prop AccountName string -> accountName

  public init(app App, demo bool) {
    this.app = app
    chats = List[TelegramChat]()
    knownChats = Dictionary[string, TelegramChat]()
    users = Dictionary[int64, string]()
    pendingReplies = Dictionary[string, TelegramMessage]()
    pendingPreviews = Dictionary[string, TelegramMessage]()
    auth = AuthState()
    selectedIndex = 0
    selectedOpen = true
    revision = 1
    clientId = 0
    apiId = 0
    apiHash = ""
    qrRequested = false
    resettingPhone = false
    stopping = false
    receiver = nil
    chatLists = List[TelegramChatList]{
      TelegramChatList(0, "All"),
      TelegramChatList(-1, "Archive"),
    }
    chatListTitles = List[string]{ "All", "Archive" }
    activeChatListIndex = 0
    chatsLoading = false
    messagesLoading = false
    connectionText = "Connecting"
    connectionState = TelegramConnectionState.Reconnecting
    accountName = ""
    openChatId = 0
    pendingChatLoads = 0
    demoMode = demo

    if demo {
      chats = createDemoChats()
      auth.Phase = AuthPhase.Ready
      auth.Hint = "Demo session"
      connectionText = "Demo session"
      connectionState = TelegramConnectionState.Connected
      accountName = "Sam"
      return
    }
    start()
  }

  internal func Select(index int32) {
    if index < 0 || index >= chats.Count { return }
    if index == selectedIndex && selectedOpen { return }
    selectedIndex = index
    selectedOpen = true
    if demoMode { chats[index].Unread = 0 }
    openSelectedChat()
    changed()
  }

  internal func Deselect() {
    if !selectedOpen { return }
    selectedOpen = false
    if !demoMode { closeOpenChat() }
    changed()
  }

  internal func Send(text string) {
    Send(text, 0)
  }

  internal func Send(text string, replyToId int64) {
    var clean = text.Replace("\r", "")
    while clean.EndsWith("\n") { clean = clean.Substring(0, clean.Length - 1) }
    if clean.Trim() == "" || !HasChats { return }
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
      content["link_preview_options"] = enabledLinkPreviewOptions()
      content["clear_draft"] = true
      let request = JsonObject()
      request["@type"] = "sendMessage"
      request["chat_id"] = chat.TdId
      if replyToId != 0 {
        let reply = JsonObject()
        reply["@type"] = "inputMessageReplyToMessage"
        reply["message_id"] = replyToId
        request["reply_to"] = reply
      }
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
    if replyToId != 0 {
      for source in chat.Messages {
        if source.TdId == replyToId || source.Id == replyToId.ToString() {
          message.ReplyToId = replyToId
          message.ReplyAuthor = source.Outgoing ? "you" : source.Author
          message.ReplyText = source.Text
          break
        }
      }
    }
    chat.Messages.Add(message)
    chat.Preview = clean
    chat.Time = message.Time
    changed()
  }

  internal func Forward(message TelegramMessage, sourceChatId int64, destinationIndex int32) {
    if destinationIndex < 0 || destinationIndex >= chats.Count { return }
    let destination = chats[destinationIndex]
    if demoMode {
      let copy = TelegramMessage("local-" + revision.ToString(), message.Author, message.Text,
        DateTime.Now.ToString("HH:mm"), true)
      copy.LinkPreview = message.LinkPreview
      copy.Links = message.Links
      copy.Forwarded = true
      copy.ForwardAuthor = message.Author
      destination.Messages.Add(copy)
      destination.Preview = message.Text
      destination.Time = copy.Time
      changed()
      return
    }
    if message.TdId == 0 || sourceChatId == 0 || destination.TdId == 0 || !destination.CanSend { return }
    let ids = JsonArray()
    ids.Add(JsonNode.Parse(message.TdId.ToString(CultureInfo.InvariantCulture)))
    let request = JsonObject()
    request["@type"] = "forwardMessages"
    request["chat_id"] = destination.TdId
    request["from_chat_id"] = sourceChatId
    request["message_ids"] = ids
    request["send_copy"] = true
    request["remove_caption"] = false
    send(request.ToJsonString())
  }

  internal func SetChatList(index int32) {
    if index < 0 || index >= chatLists.Count || index == activeChatListIndex { return }
    activeChatListIndex = index
    rebuildChats()
    if !demoMode { requestChatList(chatLists[index], false) }
    changed()
  }

  internal func LoadMoreMessages() {
    if demoMode || messagesLoading || openChatId == 0 { return }
    guard let chat = findChat(openChatId) else { return }
    if chat.Messages.Count == 0 { return }
    let oldest = chat.Messages[0].TdId
    if oldest == 0 { return }
    messagesLoading = true
    requestHistory(openChatId, oldest, -1)
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
      if kind == "linkPreview" {
        processLinkPreview(root)
        return
      }
      if kind == "message" {
        processReply(root)
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
      if kind == "updateChatFolders" {
        processChatFolders(root)
        return
      }
      if kind == "updateChatAddedToList" {
        processChatAddedToList(root)
        return
      }
      if kind == "updateChatRemovedFromList" {
        processChatRemovedFromList(root)
        return
      }
      if kind == "updateChatReadInbox" {
        processReadInbox(root)
        return
      }
      if kind == "updateChatIsMarkedAsUnread" {
        processMarkedUnread(root)
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
      if kind == "updateMessageSendFailed" {
        processSendFailed(root)
        return
      }
      if kind == "updateMessageEdited" {
        processMessageEdited(root)
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
    let emailVerification = kind == "authorizationStateWaitEmailAddress"
      || kind == "authorizationStateWaitEmailCode"
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
    } else if kind == "authorizationStateWaitRegistration" {
      auth.Phase = AuthPhase.Error
      auth.Hint = "Create an account in the official Telegram app first"
      changed()
    } else if emailVerification {
      auth.Phase = AuthPhase.Error
      auth.Hint = "Complete email verification in an official Telegram app"
      changed()
    } else if kind == "authorizationStateWaitPremiumPurchase" {
      auth.Phase = AuthPhase.Error
      auth.Hint = "Telegram requires Premium for this login path"
      changed()
    } else if kind == "authorizationStateReady" {
      auth.Phase = AuthPhase.Ready
      auth.Hint = "Connected"
      beginChatSync()
      changed()
    } else if kind == "authorizationStateLoggingOut" || kind == "authorizationStateClosing" {
      auth.Phase = AuthPhase.Closed
      auth.Hint = kind == "authorizationStateLoggingOut" ? "Logging out" : "Closing session"
      changed()
    } else if kind == "authorizationStateClosed" {
      connectionState = TelegramConnectionState.Disconnected
      connectionText = "Disconnected"
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
    connectionState = TelegramConnectionState.Connected
    chatsLoading = true
    pendingChatLoads = chatLists.Count
    for list in chatLists { requestChatList(list, true) }
    let me = JsonObject()
    me["@type"] = "getMe"
    me["@extra"] = "me"
    send(me.ToJsonString())
  }

  private func requestChatList(chatList TelegramChatList, tracked bool) {
    let list = chatListObject(chatList.Id)
    let request = JsonObject()
    let extraKind = tracked ? "load:" : "refresh:"
    request["@type"] = "loadChats"
    request["@extra"] = extraKind + chatList.Id.ToString(CultureInfo.InvariantCulture)
    request["chat_list"] = list
    request["limit"] = 100
    send(request.ToJsonString())
  }

  private func completeChatLoad(extra string) {
    if extra.StartsWith("refresh:") {
      rebuildChats()
      changed()
      return
    }
    if !extra.StartsWith("load:") { return }
    if pendingChatLoads > 0 { pendingChatLoads = pendingChatLoads - 1 }
    chatsLoading = pendingChatLoads > 0
    rebuildChats()
    changed()
  }

  private func processError(root JsonElement) {
    let extra = jsonString(root, "@extra")
    if extra.StartsWith("load:") || extra.StartsWith("refresh:") {
      completeChatLoad(extra)
      return
    }
    if extra.StartsWith("history:") {
      messagesLoading = false
      changed()
      return
    }
    if extra.StartsWith("reply:") {
      pendingReplies.Remove(extra)
      return
    }
    if extra.StartsWith("preview:") {
      pendingPreviews.Remove(extra)
      requestMissingPreviewsForOpenChat()
      return
    }
    if auth.Phase != AuthPhase.Ready { fail(jsonString(root, "message")) }
  }

  private func processConnection(root JsonElement) {
    if !root.TryGetProperty("state", out var state) { return }
    let kind = jsonString(state, "@type")
    if kind == "connectionStateReady" {
      connectionText = "Connected"
      connectionState = TelegramConnectionState.Connected
    } else if reconnecting(kind) {
      connectionText = "Reconnecting"
      connectionState = TelegramConnectionState.Reconnecting
    } else if kind == "connectionStateWaitingForNetwork" {
      connectionText = "Disconnected"
      connectionState = TelegramConnectionState.Disconnected
    } else {
      connectionText = "Reconnecting"
      connectionState = TelegramConnectionState.Reconnecting
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
    for current in knownChats.Values {
      for message in current.Messages {
        if message.SenderIsChat && message.SenderId == id {
          message.Author = knownChats[idText].Title
        }
      }
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
    chat.MarkedUnread = jsonBool(root, "is_marked_as_unread", chat.MarkedUnread)
    chat.LastReadOutboxId = jsonInt64(root, "last_read_outbox_message_id", chat.LastReadOutboxId)
    if root.TryGetProperty("type", out var chatType) {
      let kind = jsonString(chatType, "@type")
      chat.Channel = kind == "chatTypeSupergroup" && jsonBool(chatType, "is_channel")
      chat.Group = kind == "chatTypeBasicGroup" || kind == "chatTypeSupergroup" && !chat.Channel
      if kind == "chatTypePrivate" {
        chat.UserId = jsonInt64(chatType, "user_id")
      }
    }
    if root.TryGetProperty("notification_settings", out var settings) {
      chat.Muted = jsonInt32(settings, "mute_for") > 0
    }
    if root.TryGetProperty("permissions", out var permissions) {
      chat.CanSend = jsonBool(permissions, "can_send_basic_messages", true)
    }
    if root.TryGetProperty("positions", out var positions) {
      chat.Positions.Clear()
      applyPositions(chat, positions)
    }
    if root.TryGetProperty("last_message", out var lastMessage) && lastMessage.ValueKind == JsonValueKind.Object {
      applyLastMessage(chat, lastMessage)
    }
    updateReceipts(chat)
  }

  private func applyPositions(chat TelegramChat, positions JsonElement) {
    if positions.ValueKind != JsonValueKind.Array { return }
    for position in positions.EnumerateArray() { applyPosition(chat, position) }
  }

  private func applyPosition(chat TelegramChat, position JsonElement) {
    if !position.TryGetProperty("list", out var list) { return }
    let listId = chatListId(list)
    if listId == Int32.MinValue { return }
    let order = jsonInt64(position, "order")
    let pinned = jsonBool(position, "is_pinned")
    if order == 0 {
      chat.Positions.Remove(listId)
    } else {
      chat.Positions[listId] = TelegramChatPosition(order, pinned)
    }
  }

  private func rebuildChats() {
    let selectedId = selectedIndex >= 0 && selectedIndex < chats.Count ? chats[selectedIndex].Id : ""
    let listId = activeChatList().Id
    chats.Clear()
    for chat in knownChats.Values {
      if !chat.Positions.TryGetValue(listId, out var position) { continue }
      chat.Pinned = position.Pinned
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
    if HasChats && selectedOpen {
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
    let listId = activeChatList().Id
    let leftOrder = chatOrder(left, listId)
    let rightOrder = chatOrder(right, listId)
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
    requestMissingPreviews(chat)
    markRead(chat)
    if page < 0 {
      messagesLoading = false
      changed()
      return
    }
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
    if root.TryGetProperty("positions", out var positions) {
      chat.Positions.Clear()
      applyPositions(chat, positions)
    }
    rebuildChats()
    changed()
  }

  private func processChatPosition(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    if root.TryGetProperty("position", out var position) { applyPosition(chat, position) }
    rebuildChats()
    changed()
  }

  private func processChatFolders(root JsonElement) {
    let activeId = activeChatList().Id
    let folders = List[TelegramChatList]()
    if root.TryGetProperty("chat_folders", out var source) && source.ValueKind == JsonValueKind.Array {
      for folder in source.EnumerateArray() {
        let id = jsonInt32(folder, "id")
        if id > 0 { folders.Add(TelegramChatList(id, chatFolderTitle(folder))) }
      }
    }
    let mainPosition = Math.Max(0, Math.Min(jsonInt32(root, "main_chat_list_position"), folders.Count))
    chatLists.Clear()
    chatListTitles.Clear()
    var index = 0
    while index < folders.Count {
      if index == mainPosition { addChatList(TelegramChatList(0, "All")) }
      addChatList(folders[index])
      index = index + 1
    }
    if mainPosition >= folders.Count { addChatList(TelegramChatList(0, "All")) }
    addChatList(TelegramChatList(-1, "Archive"))
    activeChatListIndex = chatListIndex(activeId)
    rebuildChats()
    for folder in folders { requestChatList(folder, false) }
    changed()
  }

  private func processChatAddedToList(root JsonElement) {
    if !root.TryGetProperty("chat_list", out var source) { return }
    let listId = chatListId(source)
    if listId == Int32.MinValue { return }
    if let list = findChatList(listId) { requestChatList(list, false) }
  }

  private func processChatRemovedFromList(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    if !root.TryGetProperty("chat_list", out var source) { return }
    let listId = chatListId(source)
    if listId == Int32.MinValue { return }
    chat.Positions.Remove(listId)
    rebuildChats()
    changed()
  }

  private func processReadInbox(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    chat.Unread = jsonInt32(root, "unread_count")
    changed()
  }

  private func processMarkedUnread(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    chat.MarkedUnread = jsonBool(root, "is_marked_as_unread")
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
    if jsonString(root, "@extra") == "me" { accountName = name }
    for chat in knownChats.Values {
      for message in chat.Messages {
        if !message.SenderIsChat && message.SenderId == id { message.Author = name }
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
      requestMissingPreviews(chat)
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
    if chat.TdId == openChatId && !hasMessage(chat, message.TdId) {
      chat.Messages.Add(message)
      requestMissingPreviews(chat)
    }
    applyLastMessage(chat, source)
    rebuildChats()
    changed()
  }

  private func processSendFailed(root JsonElement) {
    if !root.TryGetProperty("message", out var source) { return }
    guard let chat = findChat(jsonInt64(source, "chat_id")) else { return }
    let oldId = jsonInt64(root, "old_message_id")
    removeMessage(chat, oldId)
    let message = convertMessage(source, chat)
    message.Receipt = TelegramReceiptStatus.Failed
    if chat.TdId == openChatId && !hasMessage(chat, message.TdId) {
      chat.Messages.Add(message)
    }
    applyLastMessage(chat, source)
    rebuildChats()
    changed()
  }

  private func processMessageEdited(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    let messageId = jsonInt64(root, "message_id")
    for message in chat.Messages {
      if message.TdId == messageId {
        message.Edited = jsonInt32(root, "edit_date") > 0
        break
      }
    }
    changed()
  }

  private func processMessageContent(root JsonElement) {
    guard let chat = findChat(jsonInt64(root, "chat_id")) else { return }
    let messageId = jsonInt64(root, "message_id")
    if !root.TryGetProperty("new_content", out var content) { return }
    for message in chat.Messages {
      if message.TdId == messageId {
        message.Kind = contentKind(content)
        message.Text = contentText(content, message.SenderId, message.Author)
        message.Links = contentLinks(content)
        message.LinkPreview = linkPreview(content)
        requestMissingPreviews(chat)
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
    let senderFromChat = senderIsChat(root)
    var author = outgoing ? "You" : chat.Title
    if senderFromChat {
      if let senderChat = findChat(senderId) { author = senderChat.Title }
    } else if users.TryGetValue(senderId, out var senderName) {
      author = senderName
    }
    let date = jsonInt32(root, "date")
    var text = "Unsupported message"
    var kind = TelegramMessageKind.Unsupported
    var links = List[string]()
    var preview TelegramLinkPreview?
    if root.TryGetProperty("content", out var content) {
      kind = contentKind(content)
      text = contentText(content, senderId, author)
      links = contentLinks(content)
      preview = linkPreview(content)
    }
    let message = TelegramMessage(
      id.ToString(CultureInfo.InvariantCulture),
      author,
      text,
      formatMessageTime(date),
      outgoing)
    message.TdId = id
    message.SenderId = senderId
    message.SenderIsChat = senderFromChat
    message.Date = date
    message.Kind = kind
    message.Edited = jsonInt32(root, "edit_date") > 0
    message.Receipt = receiptStatus(root, chat.LastReadOutboxId)
    message.ShowAuthor = !outgoing && (chat.Group || chat.Channel)
    message.Links = links
    message.LinkPreview = preview
    applyForwardInfo(message, root)
    if root.TryGetProperty("reply_to", out var reply) {
      let replyId = jsonInt64(reply, "message_id")
      if replyId != 0 {
        message.ReplyToId = replyId
        message.ReplyText = replyId.ToString(CultureInfo.InvariantCulture)
        message.ReplyAuthor = "Reply"
        if reply.TryGetProperty("quote", out var quote) && quote.TryGetProperty("text", out var quoteText) {
          let value = formattedText(quoteText)
          if value != "" { message.ReplyText = value }
        } else if reply.TryGetProperty("content", out var replyContent) {
          let value = contentText(replyContent, 0, "")
          if value != "Unsupported message" { message.ReplyText = value }
        }
        if reply.TryGetProperty("origin", out var origin) {
          let value = originName(origin)
          if value != "" { message.ReplyAuthor = value }
        }
      }
    }
    return message
  }

  private func resolveReplies(chat TelegramChat) {
    for message in chat.Messages {
      if message.ReplyToId == 0 { continue }
      let replyId = message.ReplyToId
      for source in chat.Messages {
        if source.TdId == replyId {
          message.ReplyAuthor = source.Author
          message.ReplyText = source.Text
          break
        }
      }
      if message.ReplyText == replyId.ToString(CultureInfo.InvariantCulture) {
        requestReply(chat, message)
      }
    }
  }

  private func requestReply(chat TelegramChat, message TelegramMessage) {
    if chat.TdId == 0 || message.TdId == 0 { return }
    let chatId = chat.TdId.ToString(CultureInfo.InvariantCulture)
    let messageId = message.TdId.ToString(CultureInfo.InvariantCulture)
    let extra = "reply:" + chatId + ":" + messageId
    if pendingReplies.ContainsKey(extra) { return }
    pendingReplies[extra] = message
    let request = JsonObject()
    request["@type"] = "getRepliedMessage"
    request["@extra"] = extra
    request["chat_id"] = chat.TdId
    request["message_id"] = message.TdId
    send(request.ToJsonString())
  }

  private func processReply(root JsonElement) {
    let extra = jsonString(root, "@extra")
    if !pendingReplies.TryGetValue(extra, out var target) { return }
    pendingReplies.Remove(extra)
    let sender = senderId(root)
    var author = jsonBool(root, "is_outgoing") ? "you" : "message"
    if users.TryGetValue(sender, out var name) { author = name }
    target.ReplyAuthor = author
    target.ReplyText = messagePreview(root)
    changed()
  }

  private func reconnecting(kind string) bool ->
  kind == "connectionStateConnecting" || kind == "connectionStateConnectingToProxy"
    || kind == "connectionStateUpdating"

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
    chat.MarkedUnread = false
  }

  private func updateReceipts(chat TelegramChat) {
    for message in chat.Messages {
      if !message.Outgoing { continue }
      if message.Receipt == TelegramReceiptStatus.Pending { continue }
      if message.Receipt == TelegramReceiptStatus.Failed { continue }
      message.Receipt = if chat.LastReadOutboxId != 0 && message.TdId <= chat.LastReadOutboxId {
        TelegramReceiptStatus.Read
      } else {
        TelegramReceiptStatus.Sent
      }
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
    let id = senderId(root)
    var author = "Someone"
    if senderIsChat(root) {
      if let chat = findChat(id) { author = chat.Title }
    } else if users.TryGetValue(id, out var name) {
      author = name
    }
    return contentText(content, id, author)
  }

  private func contentKind(content JsonElement) TelegramMessageKind {
    let kind = jsonString(content, "@type")
    if kind == "messageText" || kind == "messageAnimatedEmoji" { return TelegramMessageKind.Text }
    if kind == "messagePhoto" { return TelegramMessageKind.Photo }
    if kind == "messageVideo" { return TelegramMessageKind.Video }
    if kind == "messageVoiceNote" { return TelegramMessageKind.Voice }
    if kind == "messageVideoNote" { return TelegramMessageKind.VideoNote }
    if kind == "messageAudio" { return TelegramMessageKind.Audio }
    if kind == "messageDocument" { return TelegramMessageKind.Document }
    if kind == "messageSticker" { return TelegramMessageKind.Sticker }
    if kind == "messageAnimation" { return TelegramMessageKind.Animation }
    if kind == "messageLocation" || kind == "messageVenue" { return TelegramMessageKind.Location }
    if kind == "messageContact" { return TelegramMessageKind.Contact }
    if kind == "messagePoll" { return TelegramMessageKind.Poll }
    if kind == "messageCall" { return TelegramMessageKind.Call }
    if isServiceContent(kind) { return TelegramMessageKind.Service }
    return TelegramMessageKind.Unsupported
  }

  private func contentText(content JsonElement, actorId int64, actorName string) string {
    let kind = jsonString(content, "@type")
    if isServiceContent(kind) { return serviceText(content, actorId, actorName) }
    if kind == "messageText" && content.TryGetProperty("text", out var text) {
      return formattedText(text)
    }
    let caption = if content.TryGetProperty("caption", out var value) { formattedText(value) } else { "" }
    if kind == "messagePhoto" { return caption == "" ? "📷 Photo" : "📷 " + caption }
    if kind == "messageVideo" { return caption == "" ? "🎥 Video" : "🎥 " + caption }
    if kind == "messageAnimation" { return "GIF" }
    if kind == "messageVoiceNote" { return "🎤 Voice message" }
    if kind == "messageVideoNote" { return "⏺ Video message" }
    if kind == "messageAudio" {
      if content.TryGetProperty("audio", out var audio) {
        let title = jsonString(audio, "title")
        if title != "" { return "🎵 " + title }
      }
      return "🎵 Audio"
    }
    if kind == "messageDocument" {
      if content.TryGetProperty("document", out var document) {
        let fileName = jsonString(document, "file_name")
        if fileName != "" { return "📎 " + fileName }
      }
      return "📎 Document"
    }
    if kind == "messageSticker" && content.TryGetProperty("sticker", out var sticker) {
      let emoji = jsonString(sticker, "emoji")
      return emoji == "" ? "Sticker" : emoji + " Sticker"
    }
    if kind == "messagePoll" && content.TryGetProperty("poll", out var poll) {
      if poll.TryGetProperty("question", out var question) {
        let text = formattedText(question)
        return text == "" ? "📊 Poll" : "📊 " + text
      }
      return "📊 Poll"
    }
    if kind == "messageContact" { return "👤 Contact" }
    if kind == "messageLocation" || kind == "messageVenue" { return "📍 Location" }
    if kind == "messageCall" { return "📞 Call" }
    if kind == "messageAnimatedEmoji" { return jsonString(content, "emoji") }
    return "Unsupported message"
  }

  private func isServiceContent(kind string) bool ->
  kind == "messageChatAddMembers" || kind == "messageChatJoinByLink"
    || kind == "messageChatJoinByRequest" || kind == "messageChatDeleteMember"
    || kind == "messageChatChangeTitle" || kind == "messageChatChangePhoto"
    || kind == "messageChatDeletePhoto" || kind == "messagePinMessage"
    || kind == "messageBasicGroupChatCreate" || kind == "messageSupergroupChatCreate"
    || kind == "messageChatUpgradeTo" || kind == "messageChatUpgradeFrom"

  private func serviceText(content JsonElement, actorId int64, actorName string) string {
    let kind = jsonString(content, "@type")
    let actor = actorName == "" ? "Someone" : actorName
    if kind == "messageChatAddMembers" {
      let names = List[string]()
      var selfJoin = false
      if content.TryGetProperty("member_user_ids", out var ids) && ids.ValueKind == JsonValueKind.Array {
        for id in ids.EnumerateArray() {
          let userId = elementInt64(id)
          if userId == actorId && ids.GetArrayLength() == 1 { selfJoin = true }
          names.Add(userName(userId))
        }
      }
      if selfJoin { return actor + " joined the group" }
      if names.Count == 0 { return actor + " added members" }
      return actor + " added " + joinNames(names)
    }
    if kind == "messageChatJoinByLink" { return actor + " joined via invite link" }
    if kind == "messageChatJoinByRequest" { return actor + " joined the group" }
    if kind == "messageChatDeleteMember" {
      let userId = jsonInt64(content, "user_id")
      let target = userName(userId)
      if userId == actorId || actorId == 0 { return target + " left the group" }
      return actor + " removed " + target
    }
    if kind == "messageChatChangeTitle" {
      let title = jsonString(content, "title")
      return title == "" ? actor + " changed the group title" :
      actor + " renamed the group to \"" + title + "\""
    }
    if kind == "messageChatChangePhoto" { return actor + " changed the group photo" }
    if kind == "messageChatDeletePhoto" { return actor + " removed the group photo" }
    if kind == "messagePinMessage" { return actor + " pinned a message" }
    if kind == "messageBasicGroupChatCreate" || kind == "messageSupergroupChatCreate" {
      let title = jsonString(content, "title")
      return title == "" ? actor + " created the group" :
      actor + " created the group \"" + title + "\""
    }
    if kind == "messageChatUpgradeTo" { return "Group upgraded to supergroup" }
    if kind == "messageChatUpgradeFrom" { return "Group history upgraded" }
    return "Group update"
  }

  private func userName(id int64) string {
    if users.TryGetValue(id, out var name) { return name }
    return "User"
  }

  private func joinNames(names List[string]) string {
    if names.Count == 0 { return "someone" }
    if names.Count == 1 { return names[0] }
    if names.Count == 2 { return names[0] + " and " + names[1] }
    var text = ""
    var index = 0
    while index < names.Count {
      if index > 0 { text = text + (index + 1 == names.Count ? " and " : ", ") }
      text = text + names[index]
      index = index + 1
    }
    return text
  }

  private func contentLinks(content JsonElement) List[string] {
    let links = List[string]()
    let kind = jsonString(content, "@type")
    if kind == "messageText" {
      if content.TryGetProperty("text", out var text) { extractFormattedLinks(text, links) }
    } else if hasLinkCaption(kind) {
      if content.TryGetProperty("caption", out var caption) { extractFormattedLinks(caption, links) }
    }
    if kind == "messageText" && content.TryGetProperty("link_preview", out var preview) {
      addLink(links, jsonString(preview, "url"))
    }
    return links
  }

  private func hasLinkCaption(kind string) bool ->
  kind == "messagePhoto" || kind == "messageVideo" || kind == "messageDocument"
    || kind == "messageAnimation" || kind == "messageAudio"

  private func extractFormattedLinks(root JsonElement, links List[string]) {
    let text = formattedText(root)
    if root.TryGetProperty("entities", out var entities) && entities.ValueKind == JsonValueKind.Array {
      for entity in entities.EnumerateArray() {
        if !entity.TryGetProperty("type", out var entityType) { continue }
        let kind = jsonString(entityType, "@type")
        if kind == "textEntityTypeTextUrl" {
          addLink(links, jsonString(entityType, "url"))
        } else if kind == "textEntityTypeUrl" {
          addLink(links, entityText(text, entity))
        } else if kind == "textEntityTypeEmailAddress" {
          let address = entityText(text, entity)
          if address != "" { addLink(links, "mailto:" + address) }
        }
      }
    }
    scanBareLinks(text, links)
  }

  private func entityText(text string, entity JsonElement) string {
    let offset = jsonInt32(entity, "offset")
    let length = jsonInt32(entity, "length")
    if offset < 0 || length <= 0 || offset >= text.Length { return "" }
    return text.Substring(offset, Math.Min(length, text.Length - offset))
  }

  private func scanBareLinks(text string, links List[string]) {
    scanPrefix(text, "https://", links)
    scanPrefix(text, "http://", links)
    scanPrefix(text, "tg://", links)
    scanPrefix(text, "www.", links)
    scanPrefix(text, "t.me/", links)
    scanPrefix(text, "telegram.me/", links)
    scanPrefix(text, "mailto:", links)
  }

  private func scanPrefix(text string, prefix string, links List[string]) {
    var start = 0
    while start < text.Length {
      let found = text.IndexOf(prefix, start, StringComparison.OrdinalIgnoreCase)
      if found < 0 { return }
      var end = found + prefix.Length
      while end < text.Length && isLinkCharacter(text[end]) { end = end + 1 }
      addLink(links, text.Substring(found, end - found))
      start = Math.Max(end, found + 1)
    }
  }

  private func isLinkCharacter(value char) bool ->
  Char.IsLetterOrDigit(value) || value == '.' || value == '-' || value == '_'
    || value == '~' || value == '/' || value == '?' || value == '#'
    || value == '%' || value == '=' || value == '&' || value == '+'
    || value == ':' || value == '@'

  private func addLink(links List[string], source string) {
    var value = source.Trim()
    while value.Length > 0 && isTrailingLinkPunctuation(value[value.Length - 1]) {
      value = value.Substring(0, value.Length - 1)
    }
    if value == "" { return }
    if needsHttpsScheme(value) {
      value = "https://" + value
    }
    if !isNavigableLink(value) { return }
    if !links.Contains(value) { links.Add(value) }
  }

  private func needsHttpsScheme(value string) bool ->
  value.StartsWith("www.", StringComparison.OrdinalIgnoreCase)
    || value.StartsWith("t.me/", StringComparison.OrdinalIgnoreCase)
    || value.StartsWith("telegram.me/", StringComparison.OrdinalIgnoreCase)

  private func isNavigableLink(value string) bool ->
  value.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
    || value.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
    || value.StartsWith("tg://", StringComparison.OrdinalIgnoreCase)
    || value.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase)

  private func isTrailingLinkPunctuation(value char) bool ->
  value == '.' || value == ',' || value == ';' || value == ')' || value == ']'
    || value == '>' || value == '"' || value == '\''

  private func linkPreview(content JsonElement) TelegramLinkPreview? {
    if jsonString(content, "@type") != "messageText" { return nil }
    if !content.TryGetProperty("link_preview", out var source) || source.ValueKind != JsonValueKind.Object {
      return nil
    }
    return parseLinkPreview(source)
  }

  private func parseLinkPreview(source JsonElement) TelegramLinkPreview? {
    let preview = TelegramLinkPreview()
    preview.Url = jsonString(source, "url")
    preview.DisplayUrl = jsonString(source, "display_url")
    if preview.DisplayUrl == "" { preview.DisplayUrl = preview.Url }
    preview.SiteName = jsonString(source, "site_name")
    preview.Title = jsonString(source, "title")
    if source.TryGetProperty("description", out var description) {
      preview.Description = formattedText(description)
    }
    preview.Author = jsonString(source, "author")
    preview.ShowAboveText = jsonBool(source, "show_above_text")
    if source.TryGetProperty("type", out var previewType) && previewType.ValueKind == JsonValueKind.Object {
      preview.TypeLabel = linkPreviewType(jsonString(previewType, "@type"))
      preview.HasMedia = true
    }
    preview.HasMedia = preview.HasMedia || jsonBool(source, "has_large_media")
    if preview.Title == "" && preview.Description == "" && preview.SiteName == ""
      && preview.DisplayUrl == "" && preview.Url == "" {
        return nil
      }
    return preview
  }

  private func processLinkPreview(root JsonElement) {
    let extra = jsonString(root, "@extra")
    if !pendingPreviews.TryGetValue(extra, out var message) { return }
    pendingPreviews.Remove(extra)
    message.LinkPreview = parseLinkPreview(root)
    requestMissingPreviewsForOpenChat()
    changed()
  }

  private func requestMissingPreviewsForOpenChat() {
    guard let chat = findChat(openChatId) else { return }
    requestMissingPreviews(chat)
  }

  private func requestMissingPreviews(chat TelegramChat) {
    if demoMode || chat.TdId != openChatId { return }
    var index = chat.Messages.Count - 1
    while index >= 0 && pendingPreviews.Count < 2 {
      let message = chat.Messages[index]
      if message.LinkPreview == nil && message.Links.Count > 0 {
        requestLinkPreview(chat, message)
      }
      index = index - 1
    }
  }

  private func requestLinkPreview(chat TelegramChat, message TelegramMessage) {
    if chat.TdId == 0 || message.TdId == 0 { return }
    let chatId = chat.TdId.ToString(CultureInfo.InvariantCulture)
    let messageId = message.TdId.ToString(CultureInfo.InvariantCulture)
    let key = "preview:" + chatId + ":" + messageId
    if message.LinkPreviewRequested { return }
    message.LinkPreviewRequested = true
    pendingPreviews[key] = message
    let text = JsonObject()
    text["@type"] = "formattedText"
    text["text"] = message.Links[0]
    text["entities"] = JsonArray()
    let request = JsonObject()
    request["@type"] = "getLinkPreview"
    request["@extra"] = key
    request["text"] = text
    request["link_preview_options"] = enabledLinkPreviewOptions()
    send(request.ToJsonString())
  }

  private func enabledLinkPreviewOptions() JsonObject {
    let options = JsonObject()
    options["@type"] = "linkPreviewOptions"
    options["is_disabled"] = false
    options["url"] = ""
    options["force_small_media"] = false
    options["force_large_media"] = false
    options["show_above_text"] = false
    return options
  }

  private func linkPreviewType(kind string) string {
    if kind == "linkPreviewTypeAlbum" { return "Album" }
    if kind == "linkPreviewTypeAnimation" { return "GIF" }
    if kind == "linkPreviewTypeApp" { return "App" }
    if kind == "linkPreviewTypeArticle" { return "Article" }
    if kind == "linkPreviewTypeAudio" { return "Audio" }
    if kind == "linkPreviewTypeDocument" { return "Document" }
    if kind == "linkPreviewTypePhoto" { return "Photo" }
    if kind == "linkPreviewTypeSticker" || kind == "linkPreviewTypeStickerSet" { return "Sticker" }
    if kind == "linkPreviewTypeVideo" || kind == "linkPreviewTypeVideoNote" { return "Video" }
    if kind == "linkPreviewTypeVoiceNote" { return "Voice" }
    if kind == "linkPreviewTypeWebApp" { return "Web App" }
    return "Link"
  }

  private func formattedText(root JsonElement) string -> jsonString(root, "text")

  private func receiptStatus(root JsonElement, outboxReadId int64) TelegramReceiptStatus {
    if !jsonBool(root, "is_outgoing") { return TelegramReceiptStatus.None }
    if root.TryGetProperty("sending_state", out var state) && state.ValueKind == JsonValueKind.Object {
      if jsonString(state, "@type") == "messageSendingStateFailed" {
        return TelegramReceiptStatus.Failed
      }
      return TelegramReceiptStatus.Pending
    }
    let id = jsonInt64(root, "id")
    if outboxReadId != 0 && id <= outboxReadId { return TelegramReceiptStatus.Read }
    return TelegramReceiptStatus.Sent
  }

  private func applyForwardInfo(message TelegramMessage, root JsonElement) {
    if root.TryGetProperty("forward_info", out var info) && info.ValueKind == JsonValueKind.Object {
      message.Forwarded = true
      message.ForwardDate = jsonInt32(info, "date")
      if info.TryGetProperty("origin", out var origin) {
        message.ForwardAuthor = originName(origin)
        let kind = jsonString(origin, "@type")
        if kind == "messageOriginChat" || kind == "messageOriginChannel" {
          let signature = jsonString(origin, "author_signature")
          if signature != "" && signature != message.ForwardAuthor {
            message.ForwardAuthorSecondary = signature
          }
        }
      }
      if message.ForwardAuthor == "" && info.TryGetProperty("source", out var source) {
        message.ForwardAuthor = jsonString(source, "sender_name")
        if message.ForwardAuthor == "" && source.TryGetProperty("sender_id", out var sender) {
          message.ForwardAuthor = senderName(sender)
        }
      }
      if message.ForwardAuthor == "" { message.ForwardAuthor = "Unknown" }
      return
    }
    if root.TryGetProperty("import_info", out var imported) && imported.ValueKind == JsonValueKind.Object {
      message.Forwarded = true
      message.ForwardAuthor = jsonString(imported, "sender_name")
      if message.ForwardAuthor == "" { message.ForwardAuthor = "Imported" }
      message.ForwardDate = jsonInt32(imported, "date")
    }
  }

  private func originName(origin JsonElement) string {
    let kind = jsonString(origin, "@type")
    if kind == "messageOriginUser" { return userName(jsonInt64(origin, "sender_user_id")) }
    if kind == "messageOriginHiddenUser" { return jsonString(origin, "sender_name") }
    if kind == "messageOriginChat" {
      let signature = jsonString(origin, "author_signature")
      if signature != "" { return signature }
      if let chat = findChat(jsonInt64(origin, "sender_chat_id")) { return chat.Title }
      return "Chat"
    }
    if kind == "messageOriginChannel" {
      if let chat = findChat(jsonInt64(origin, "chat_id")) { return chat.Title }
      let signature = jsonString(origin, "author_signature")
      return signature == "" ? "Channel" : signature
    }
    return ""
  }

  private func senderName(sender JsonElement) string {
    let kind = jsonString(sender, "@type")
    if kind == "messageSenderUser" { return userName(jsonInt64(sender, "user_id")) }
    if kind == "messageSenderChat" {
      if let chat = findChat(jsonInt64(sender, "chat_id")) { return chat.Title }
      return "Chat"
    }
    return ""
  }

  private func senderId(root JsonElement) int64 {
    if !root.TryGetProperty("sender_id", out var sender) { return 0 }
    let kind = jsonString(sender, "@type")
    if kind == "messageSenderUser" { return jsonInt64(sender, "user_id") }
    if kind == "messageSenderChat" { return jsonInt64(sender, "chat_id") }
    return 0
  }

  private func senderIsChat(root JsonElement) bool {
    if !root.TryGetProperty("sender_id", out var sender) { return false }
    return jsonString(sender, "@type") == "messageSenderChat"
  }

  private func activeChatList() TelegramChatList {
    if activeChatListIndex < 0 || activeChatListIndex >= chatLists.Count {
      activeChatListIndex = 0
    }
    return chatLists[activeChatListIndex]
  }

  private func addChatList(chatList TelegramChatList) {
    chatLists.Add(chatList)
    chatListTitles.Add(chatList.Title)
  }

  private func chatListIndex(id int32) int32 {
    var index = 0
    while index < chatLists.Count {
      if chatLists[index].Id == id { return index }
      index = index + 1
    }
    return 0
  }

  private func findChatList(id int32) TelegramChatList? {
    for chatList in chatLists {
      if chatList.Id == id { return chatList }
    }
    return nil
  }

  private func chatOrder(chat TelegramChat, listId int32) int64 {
    if chat.Positions.TryGetValue(listId, out var position) { return position.Order }
    return 0
  }

  private func chatListId(root JsonElement) int32 {
    let kind = jsonString(root, "@type")
    if kind == "chatListMain" { return 0 }
    if kind == "chatListArchive" { return -1 }
    if kind == "chatListFolder" { return jsonInt32(root, "chat_folder_id") }
    return Int32.MinValue
  }

  private func chatListObject(id int32) JsonObject {
    let result = JsonObject()
    if id == 0 {
      result["@type"] = "chatListMain"
    } else if id == -1 {
      result["@type"] = "chatListArchive"
    } else {
      result["@type"] = "chatListFolder"
      result["chat_folder_id"] = id
    }
    return result
  }

  private func chatFolderTitle(root JsonElement) string {
    if root.TryGetProperty("name", out var name) {
      if name.ValueKind == JsonValueKind.String {
        return name.GetString() ?? "Folder"
      }
      if name.TryGetProperty("text", out var text) {
        if text.ValueKind == JsonValueKind.String { return text.GetString() ?? "Folder" }
        let formatted = jsonString(text, "text")
        if formatted != "" { return formatted }
      }
    }
    return "Folder"
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
    let preferred = Path.Combine(root, "sharptg")
    let legacy = Path.Combine(root, "tgtui")
    let data = Directory.Exists(preferred) || !Directory.Exists(legacy) ? preferred : legacy
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
    request["application_version"] = "0.6.1"
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
