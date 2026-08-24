package Tgtui

import System
import System.IO

internal class TelegramCredentials {
  internal var ApiId int32
  internal var ApiHash string

  public init(apiId int32, apiHash string) {
    ApiId = apiId
    ApiHash = apiHash
  }
}

internal class TelegramCredentialStore {
  shared {
    internal func Load() TelegramCredentials? {
      let idText = Environment.GetEnvironmentVariable("SHARPTG_API_ID") ?? Environment.GetEnvironmentVariable("TGTUI_API_ID") ?? Environment.GetEnvironmentVariable("TELEGRAM_API_ID") ?? ""
      let hashText = Environment.GetEnvironmentVariable("SHARPTG_API_HASH") ?? Environment.GetEnvironmentVariable("TGTUI_API_HASH") ?? Environment.GetEnvironmentVariable("TELEGRAM_API_HASH") ?? ""
      let environment = Parse(idText, hashText)
      if environment != nil { return environment }

      var path = credentialPath("sharptg")
      if !File.Exists(path) { path = credentialPath("tgtui") }
      if !File.Exists(path) { return nil }
      let lines = File.ReadAllLines(path)
      if lines.Length < 2 { return nil }
      return Parse(lines[0], lines[1])
    }

    internal func Parse(idText string, hashText string) TelegramCredentials? {
      if !Int32.TryParse(idText.Trim(), out var apiId) || apiId <= 0 { return nil }
      let apiHash = hashText.Trim()
      if apiHash.Length != 32 { return nil }
      for value in apiHash {
        let number = value >= '0' && value <= '9'
        let lower = value >= 'a' && value <= 'f'
        let upper = value >= 'A' && value <= 'F'
        if !number && !lower && !upper { return nil }
      }
      return TelegramCredentials(apiId, apiHash)
    }

    internal func Save(credentials TelegramCredentials) {
      let path = credentialPath("sharptg")
      guard let directory = Path.GetDirectoryName(path) else { return }
      Directory.CreateDirectory(directory)
      if !OperatingSystem.IsWindows() {
        File.SetUnixFileMode(
          directory,
          UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute)
      }

      let temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp"
      try {
        File.WriteAllText(
          temporary,
          credentials.ApiId.ToString() + "\n" + credentials.ApiHash + "\n")
        if !OperatingSystem.IsWindows() {
          File.SetUnixFileMode(temporary, UnixFileMode.UserRead | UnixFileMode.UserWrite)
        }
        File.Move(temporary, path, true)
      } catch (failure Exception) {
        if File.Exists(temporary) { File.Delete(temporary) }
        throw failure
      }
    }

    private func credentialPath(application string) string {
      var root = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME") ?? ""
      if root.Trim() == "" {
        root = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)
      }
      if root == "" {
        root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config")
      }
      return Path.Combine(root, application, "credentials")
    }
  }
}
