#!/usr/bin/env fish

set -l project_dir (path resolve (dirname (status filename)))

read -P "Telegram API ID: " api_id; or exit 1
if not string match -qr '^[1-9][0-9]*$' -- "$api_id"
  echo "API ID must contain digits only." >&2
  exit 1
end

read -s -P "Telegram API hash: " api_hash; or exit 1
echo
if not string match -qr '^[0-9a-fA-F]{32}$' -- "$api_hash"
  echo "API hash must contain 32 hexadecimal characters." >&2
  exit 1
end

set -lx TELEGRAM_API_ID "$api_id"
set -lx TELEGRAM_API_HASH "$api_hash"
command dotnet run --project "$project_dir/Tgtui.gsproj" -c Release
