package Tgtui

internal enum AuthPhase {
  Starting,
  Setup,
  Qr,
  Phone,
  Code,
  Password,
  Ready,
  Error,
  Closed,
}

internal class AuthState {
  internal var Phase AuthPhase
  internal var Hint string
  internal var Link string

  public init() {
    Phase = AuthPhase.Starting
    Hint = "Starting Telegram"
    Link = ""
  }
}
