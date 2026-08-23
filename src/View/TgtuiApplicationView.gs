package Tgtui

import SharpTui

internal open class TgtuiApplicationView : Column {
  private var service TelegramService
  private var login LoginView
  private var chat TgtuiView
  private var ready bool

  public init(app App, service TelegramService, theme TgtuiTheme) {
    this.service = service
    login = LoginView(service, theme)
    chat = TgtuiView(app, service, theme)
    login.GrowWeight = 1
    chat.GrowWeight = 1
    ready = service.Auth.Phase == AuthPhase.Ready
    Style = theme.Canvas
    Children.Add(login)
    Children.Add(chat)
    login.IsVisible = !ready
    chat.IsVisible = ready
  }

  protected override func PrepareLayout() {
    sync()
  }

  private func sync() {
    let next = service.Auth.Phase == AuthPhase.Ready
    if next == ready { return }
    ready = next
    login.IsVisible = !ready
    chat.IsVisible = ready
  }
}
