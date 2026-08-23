package Tgtui

import System
import System.Collections.Generic
import System.IO
import System.Text.Json
import System.Text.Json.Nodes
import System.Text
import System.Threading
import SharpTui

internal class TelegramService {
  private var app App
  private var chats List[TelegramChat]
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

  public init(app App, demo bool) {
    this.app = app
    chats = List[TelegramChat]()
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

    if demo {
      chats = createDemoChats()
      auth.Phase = AuthPhase.Ready
      auth.Hint = "Demo session"
      return
    }
    start()
  }

  internal func Select(index int32) {
    if index < 0 || index >= chats.Count || index == selectedIndex { return }
    selectedIndex = index
    chats[index].Unread = 0
    changed()
  }

  internal func Send(text string) {
    let clean = text.Trim()
    if clean == "" || !HasChats { return }
    let message = TelegramMessage(
      "local-" + revision.ToString(),
      "Sam",
      clean,
      DateTime.Now.ToString("HH:mm"),
      true)
    guard let chat = SelectedChat else { return }
    chat.Messages.Add(message)
    chat.Preview = clean
    chat.Time = message.Time
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
    let idText = Environment.GetEnvironmentVariable("TELEGRAM_API_ID") ?? ""
    apiHash = Environment.GetEnvironmentVariable("TELEGRAM_API_HASH") ?? ""
    if !Int32.TryParse(idText, out apiId) || apiId <= 0 || apiHash.Trim() == "" {
      auth.Phase = AuthPhase.Setup
      auth.Hint = "Set TELEGRAM_API_ID and TELEGRAM_API_HASH"
      changed()
      return
    }
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
      if kind == "error" && auth.Phase != AuthPhase.Ready {
        fail(jsonString(root, "message"))
      }
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

  private func sendParameters() {
    var root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
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
    request["application_version"] = "0.3.1"
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

}
