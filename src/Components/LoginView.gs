package Tgtui

import SharpTui

internal open class LoginView : Column {
  private var service TelegramService
  private var title Label
  private var steps Label
  private var hint Label
  private var qr QrCodeView
  private var apiId TextInput
  private var apiHash TextInput
  private var phone TextInput
  private var code TextInput
  private var password TextInput
  private var qrButton Button
  private var saveCredentialsButton Button
  private var phoneButton Button
  private var copyButton Button
  private var continueButton Button
  private var verifyButton Button
  private var unlockButton Button
  private var phoneActions Row
  private var setupActions Row
  private var qrActions Row
  private var codeActions Row
  private var passwordActions Row
  private var centered Row
  private var topSpace Box
  private var bottomSpace Box
  private var footer StatusBar
  private var phase AuthPhase

  public init(service TelegramService, theme TgtuiTheme) {
    this.service = service
    phase = AuthPhase.Closed

    title = Label{ Alignment: HorizontalAlignment.Center, Style: theme.Header }
    steps = Label{ Alignment: HorizontalAlignment.Center, Style: theme.Muted }
    hint = Label{ Alignment: HorizontalAlignment.Center, Style: theme.Muted }
    qr = QrCodeView(theme)
    apiId = TextInput{
      Height: CellLength.Cells(3),
      ShowBorder: true,
      Title: "API ID",
      Placeholder: "From my.telegram.org",
      Style: theme.Composer,
      FocusedStyle: theme.Accent,
    }
    apiHash = TextInput{
      Height: CellLength.Cells(3),
      ShowBorder: true,
      Title: "API hash",
      Placeholder: "32 hexadecimal characters",
      IsPassword: true,
      Style: theme.Composer,
      FocusedStyle: theme.Accent,
    }
    phone = TextInput{
      Height: CellLength.Cells(3),
      ShowBorder: true,
      Title: "Phone number",
      Placeholder: "+14155552671",
      Style: theme.Composer,
      FocusedStyle: theme.Accent,
    }
    code = TextInput{
      Height: CellLength.Cells(3),
      ShowBorder: true,
      Title: "Verification code",
      Placeholder: "Code from Telegram",
      Style: theme.Composer,
      FocusedStyle: theme.Accent,
    }
    password = TextInput{
      Height: CellLength.Cells(3),
      ShowBorder: true,
      Title: "Cloud password",
      Placeholder: "Password",
      IsPassword: true,
      Style: theme.Composer,
      FocusedStyle: theme.Accent,
    }
    qrButton = Button{
      Text: "QR login",
      Style: theme.FooterText,
      OnPress: () -> service.UseQrLogin(),
    }
    saveCredentialsButton = Button{
      Text: "Save and continue",
      Style: theme.FooterKey,
      OnPress: () -> { submitCredentials() },
    }
    phoneButton = Button{
      Text: "Use phone",
      Style: theme.FooterKey,
      OnPress: () -> service.UsePhoneLogin(),
    }
    copyButton = Button{
      Text: "Copy login link",
      Style: theme.FooterKey,
      OnPress: () -> service.CopyQrLink(),
    }
    continueButton = Button{
      Text: "Continue",
      Style: theme.FooterKey,
      OnPress: () -> { submitPhone() },
    }
    verifyButton = Button{
      Text: "Verify",
      Style: theme.FooterKey,
      OnPress: () -> { submitCode() },
    }
    unlockButton = Button{
      Text: "Unlock",
      Style: theme.FooterKey,
      OnPress: () -> { submitPassword() },
    }
    phoneActions = Row{ GapCells: 2, Children: { qrButton, continueButton } }
    setupActions = Row{ GapCells: 2, Children: { saveCredentialsButton } }
    qrActions = Row{ GapCells: 2, Children: { phoneButton, copyButton } }
    codeActions = Row{ GapCells: 2, Children: { verifyButton } }
    passwordActions = Row{ GapCells: 2, Children: { unlockButton } }

    let card = Column{
      Width: CellLength.Cells(52),
      ShowBorder: true,
      Title: "Telegram",
      GapCells: 1,
      Padding: CellInsets{ LeftCells: 2, RightCells: 2 },
      Style: theme.Panel,
      Children: {
        title,
        steps,
        hint,
        qr,
        apiId,
        apiHash,
        phone,
        code,
        password,
        setupActions,
        phoneActions,
        qrActions,
        codeActions,
        passwordActions,
      },
    }
    centered = Row{
      Height: CellLength.Cells(15),
      Children: { Box{ GrowWeight: 1 }, card, Box{ GrowWeight: 1 } },
    }
    topSpace = Box{ GrowWeight: 1 }
    bottomSpace = Box{ GrowWeight: 1 }
    let body = Column{
      GrowWeight: 1,
      Children: { topSpace, centered, bottomSpace },
    }
    let header = StatusBar{
      Height: CellLength.Cells(1),
      LeftText: "tgtui",
      CenterText: "Telegram sign in",
      RightText: "",
      Style: theme.Header,
    }
    footer = StatusBar{
      Height: CellLength.Cells(1),
      LeftText: "Tab next",
      CenterText: "Enter continue",
      RightText: "Esc back",
      Style: theme.FooterText,
    }
    Style = theme.Canvas
    Children.Add(header)
    Children.Add(body)
    Children.Add(footer)
    sync()
  }

  protected override func PrepareLayout() {
    sync()
  }

  protected override func Accept(ev UiEvent) EventResult {
    if ev.Phase == KeyPhase.Release { return EventResult.Continue }
    if phase == AuthPhase.Qr && ev.Key == Key.Character && ev.Text == "y"
      && (int32(ev.Modifiers) & int32(KeyModifiers.Ctrl)) != 0 {
        service.CopyQrLink()
        return EventResult.Handled
      }
    if ev.Key != Key.Enter { return EventResult.Continue }
    if apiId.IsFocused {
      Focus(apiHash)
      return EventResult.Handled
    }
    if apiHash.IsFocused { return submitCredentials() }
    if phone.IsFocused { return submitPhone() }
    if code.IsFocused { return submitCode() }
    if password.IsFocused { return submitPassword() }
    return EventResult.Continue
  }

  private func sync() {
    let next = service.Auth.Phase
    title.Text = titleFor(next)
    steps.Text = stepsFor(next)
    hint.Text = CellText.Clip(service.Auth.Hint, 46)
    qr.Text = service.Auth.Link

    let phoneVisible = next == AuthPhase.Phone
    let qrVisible = next == AuthPhase.Qr && service.Auth.Link != ""
    let setupVisible = next == AuthPhase.Setup
    apiId.IsVisible = setupVisible
    apiHash.IsVisible = setupVisible
    phone.IsVisible = phoneVisible
    code.IsVisible = next == AuthPhase.Code
    password.IsVisible = next == AuthPhase.Password
    qr.IsVisible = qrVisible
    setupActions.IsVisible = setupVisible
    phoneActions.IsVisible = phoneVisible
    qrActions.IsVisible = qrVisible
    codeActions.IsVisible = next == AuthPhase.Code
    passwordActions.IsVisible = next == AuthPhase.Password
    steps.IsVisible = next == AuthPhase.Phone || next == AuthPhase.Code || next == AuthPhase.Password
    hint.IsVisible = !qrVisible
    title.IsVisible = !qrVisible
    topSpace.IsVisible = next != AuthPhase.Qr
    bottomSpace.IsVisible = next != AuthPhase.Qr
    centered.Height = next == AuthPhase.Qr ? CellLength.Auto : CellLength.Cells(15)
    centered.GrowWeight = next == AuthPhase.Qr ? 1 : 0
    footer.LeftText = "Tab next"
    footer.CenterText = next == AuthPhase.Setup ? "Enter save" : "Enter continue"
    footer.RightText = "Esc quit"
    if next == AuthPhase.Qr {
      footer.LeftText = service.Auth.Link == "" ? "" : "Ctrl+Y copy"
      footer.CenterText = service.Auth.Hint
    }

    if next == phase { return }
    phase = next
    if setupVisible { Focus(apiId) }
    if phoneVisible { Focus(phone) }
    if next == AuthPhase.Code { Focus(code) }
    if next == AuthPhase.Password { Focus(password) }
    if next == AuthPhase.Qr && service.Auth.Link != "" { Focus(phoneButton) }
  }

  private func submitPhone() EventResult {
    if phone.Text.Trim() == "" { return EventResult.Handled }
    service.SubmitPhone(phone.Text)
    return EventResult.Handled
  }

  private func submitCredentials() EventResult {
    service.SubmitCredentials(apiId.Text, apiHash.Text)
    return EventResult.Handled
  }

  private func submitCode() EventResult {
    if code.Text.Trim() == "" { return EventResult.Handled }
    service.SubmitCode(code.Text)
    return EventResult.Handled
  }

  private func submitPassword() EventResult {
    if password.Text == "" { return EventResult.Handled }
    service.SubmitPassword(password.Text)
    return EventResult.Handled
  }

  private func titleFor(value AuthPhase) string {
    if value == AuthPhase.Setup { return "Telegram API credentials" }
    if value == AuthPhase.Qr { return "Scan with Telegram" }
    if value == AuthPhase.Phone { return "Phone number" }
    if value == AuthPhase.Code { return "Verification code" }
    if value == AuthPhase.Password { return "Two-step verification" }
    if value == AuthPhase.Closed { return "Session closed" }
    if value == AuthPhase.Error { return "Telegram error" }
    return "Starting Telegram"
  }

  private func stepsFor(value AuthPhase) string {
    if value == AuthPhase.Phone { return "PHONE" }
    if value == AuthPhase.Code { return "PHONE  /  CODE" }
    if value == AuthPhase.Password { return "PHONE  /  CODE  /  2FA" }
    return ""
  }
}
