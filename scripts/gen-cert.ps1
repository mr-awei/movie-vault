# 影海 - 自签名证书生成脚本（首次使用运行一次）
# 用法：PowerShell 执行  scripts\gen-cert.ps1
# 生成：CurrentUser\My 存储中的代码签名证书（CN=影海 yinghai），有效期 5 年
# 之后 scripts\sign.cmd 用证书 Thumbprint 给安装包/主程序签名

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=影海 yinghai, O=yinghai, C=CN" `
  -CertStoreLocation Cert:\CurrentUser\My `
  -KeyUsage DigitalSignature `
  -KeyExportPolicy Exportable `
  -NotAfter (Get-Date).AddYears(5)

Write-Output "证书已生成，Thumbprint: $($cert.Thumbprint)"
Write-Output "把它填入 scripts\sign.cmd 的 TP= 变量"

# 导出 pfx（供导入「受信任的根证书颁发机构」用）
# 密码从环境变量读取，避免硬编码泄露；pfx 文件本身按项目约定放 build/yinghai-sign.pfx（.gitignore 已为该文件保留例外）
# 优先读 CERT_PASSWORD（与 GitHub Actions Secret 同名），兼容旧名 yinghai_CERT_PASSWORD
$password = $env:CERT_PASSWORD
if (-not $password) { $password = $env:yinghai_CERT_PASSWORD }
if (-not $password) {
  Write-Error "请先设置环境变量 CERT_PASSWORD（用于导出 pfx 的密码），例如：`$env:CERT_PASSWORD='你的随机强密码'"
  exit 1
}
$bytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $password)
[System.IO.File]::WriteAllBytes((Join-Path $PSScriptRoot '..\build\yinghai-sign.pfx'), $bytes)
Write-Output "pfx 已导出: build\yinghai-sign.pfx （密码取自环境变量 CERT_PASSWORD）"
Write-Output ""
Write-Output "可选：让 Windows 完全信任（SmartScreen 不再提示），把 pfx 导入「受信任的根证书颁发机构」："
Write-Output "  双击 build\yinghai-sign.pfx → 本地计算机 → 受信任的根证书颁发机构 → 完成（需管理员）"
