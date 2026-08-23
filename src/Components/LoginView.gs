package Tgtui

import SharpTui

internal open class LoginView : Column {
  private var service TelegramService
  private var theme TgtuiTheme
  private var title Label
  private var steps Label
  private var hint Label
  private var link Label
  private var phone TextInput
  private var code TextInput
  private var password TextInput
  private var phoneButton Button
  private var qrButton Button
  private var continueButton Button
  private var verifyButton Button
  private var unlockButton Button
  private var phoneActions Row
  private var qrActions Row
  private var codeActions Row
  private var passwordActions Row
  private var footer StatusBar
  private var phase AuthPhase

  public init(service TelegramService, theme TgtuiTheme) {
    this.service = service
    this.theme = theme
    phase = AuthPhase.Closed

    title = Label{ Alignment: HorizontalAlignment.Center, Style: theme.Header }
    steps = Label{ Alignment: HorizontalAlignment.Center, Style: theme.Muted }
    hint = Label{ Alignment: HorizontalAlignment.Center, Style: theme.Muted }
    link = Label{ Alignment: HorizontalAlignment.Center, Style: theme.Accent }
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
    phoneButton = Button{
      Text: "Use phone",
      Style: theme.FooterKey,
      OnPress: () -> service.UsePhoneLogin(),
    }
    qrButton = Button{
      Text: "QR login",
      Style: theme.FooterText,
      OnPress: () -> service.UseQrLogin(),
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
    qrActions = Row{ GapCells: 2, Children: { phoneButton } }
    phoneActions = Row{ GapCells: 2, Children: { qrButton, continueButton } }
    codeActions = Row{ GapCells: 2, Children: { verifyButton } }
    passwordActions = Row{ GapCells: 2, Children: { unlockButton } }

    let card = Column{
      Width: CellLength.Cells(52),
      Height: CellLength.Cells(15),
      ShowBorder: true,
      Title: "Telegram",
      GapCells: 1,
      Padding: CellInsets{ LeftCells: 2, RightCells: 2 },
      Style: theme.Panel,
      Children: {
        title,
        steps,
        hint,
        link,
        phone,
        code,
        password,
        qrActions,
        phoneActions,
        codeActions,
        passwordActions,
      },
    }
    let centered = Row{
      Height: CellLength.Cells(15),
      Children: { Box{ GrowWeight: 1 }, card, Box{ GrowWeight: 1 } },
    }
    let body = Column{
      GrowWeight: 1,
      Children: { Box{ GrowWeight: 1 }, centered, Box{ GrowWeight: 1 } },
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
    if ev.Key == Key.Escape && (phase == AuthPhase.Phone || phase == AuthPhase.Error) {
      service.UseQrLogin()
      return EventResult.Handled
    }
    if ev.Key != Key.Enter { return EventResult.Continue }
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
    link.Text = CellText.Clip(service.Auth.Link, 46)

    let phoneVisible = next == AuthPhase.Phone || next == AuthPhase.Error
    phone.IsVisible = phoneVisible
    code.IsVisible = next == AuthPhase.Code
    password.IsVisible = next == AuthPhase.Password
    qrActions.IsVisible = next == AuthPhase.Qr
    phoneActions.IsVisible = phoneVisible
    codeActions.IsVisible = next == AuthPhase.Code
    passwordActions.IsVisible = next == AuthPhase.Password
    link.IsVisible = next == AuthPhase.Qr && service.Auth.Link != ""
    footer.LeftText = next == AuthPhase.Setup ? "" : "Tab next"
    footer.CenterText = next == AuthPhase.Setup ? "" : "Enter continue"
    footer.RightText = next == AuthPhase.Phone || next == AuthPhase.Error ? "Esc QR" : "Esc quit"

    if next == phase { return }
    phase = next
    if phoneVisible { Focus(phone) }
    if next == AuthPhase.Code { Focus(code) }
    if next == AuthPhase.Password { Focus(password) }
    if next == AuthPhase.Qr { Focus(phoneButton) }
  }

  private func submitPhone() EventResult {
    if phone.Text.Trim() == "" { return EventResult.Handled }
    service.SubmitPhone(phone.Text)
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
    if value == AuthPhase.Qr { return "Link this device" }
    if value == AuthPhase.Phone || value == AuthPhase.Error { return "Phone number" }
    if value == AuthPhase.Code { return "Verification code" }
    if value == AuthPhase.Password { return "Two-step verification" }
    if value == AuthPhase.Closed { return "Session closed" }
    return "Starting Telegram"
  }

  private func stepsFor(value AuthPhase) string {
    if value == AuthPhase.Phone || value == AuthPhase.Error { return "PHONE" }
    if value == AuthPhase.Code { return "PHONE  /  CODE" }
    if value == AuthPhase.Password { return "PHONE  /  CODE  /  2FA" }
    if value == AuthPhase.Qr { return "QR" }
    return ""
  }
}
