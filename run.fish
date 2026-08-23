#!/usr/bin/env fish

set -l project_dir (path resolve (dirname (status filename)))
command dotnet run --project "$project_dir/Tgtui.gsproj" -c Release -- $argv
