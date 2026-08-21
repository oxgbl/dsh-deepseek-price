#Requires -Version 5.1
<#
  dsh-deepseek-price 一键安装脚本
  用法：
    powershell -ExecutionPolicy Bypass -File install.ps1            # 装到 desktop profile（默认）
    powershell -ExecutionPolicy Bypass -File install.ps1 -Profile web
  说明：
    - 把本仓库复制到 $DSH_HOME/profiles/node_modules/dsh-deepseek-price
    - 在 profile 的 cordis.patch.yml 追加 loader entry（幂等，可重复运行以升级）
    - 完成后需完全重启 DeepSeek Harness Desktop（或 web 进程）
#>
param(
  [ValidateSet('desktop', 'web')]
  [string]$Profile = 'desktop'
)

$ErrorActionPreference = 'Stop'

$homeDir = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$src = $PSScriptRoot
if (-not (Test-Path (Join-Path $src 'package.json'))) {
  throw "未找到 package.json，请在仓库根目录运行本脚本: $src"
}

$dst = Join-Path $homeDir 'profiles\node_modules\dsh-deepseek-price'
$patch = Join-Path $homeDir "profiles\$Profile\cordis.patch.yml"

Write-Host "[1/2] 复制插件到 $dst"
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
Copy-Item -Recurse $src $dst
$gitDir = Join-Path $dst '.git'
if (Test-Path $gitDir) { Remove-Item -Recurse -Force $gitDir }

Write-Host "[2/2] 更新 profile 补丁: $patch"
New-Item -ItemType Directory -Force -Path (Split-Path $patch) | Out-Null
$entry = @'

# dsh-deepseek-price（install.ps1 添加）：loader entry，勿加入 dsh.profile.bundles
- insert:
    - id: deepseek-price
      name: dsh-deepseek-price
'@
if (Test-Path $patch) {
  $content = Get-Content $patch -Raw -ErrorAction Stop
  if ($content -match 'id:\s*deepseek-price') {
    Write-Host '  已存在 deepseek-price loader entry，跳过'
  } else {
    Add-Content -Path $patch -Value $entry -Encoding UTF8
    Write-Host '  已追加 loader entry'
  }
} else {
  Set-Content -Path $patch -Value $entry.TrimStart() -Encoding UTF8
  Write-Host '  已创建补丁文件并写入 loader entry'
}

Write-Host ''
Write-Host '完成！请完全退出并重新打开 DeepSeek Harness Desktop（或重启 web 进程）。'
