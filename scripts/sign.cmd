@echo off
rem ============================================================
rem 影海 - 自签名代码签名脚本（打包后运行，给安装包/主程序加数字签名）
rem 用法：scripts\sign.cmd
rem 依赖：Windows SDK signtool.exe + 证书 Thumbprint（首次用 scripts\gen-cert.ps1 生成）
rem ============================================================
setlocal

rem ---- 配置（证书 Thumbprint，首次生成后固定）----
rem 2026-09-14：改为影海名下证书（CN=影海 yinghai），旧值 2818B2F6... 是影匣的证书指纹
set TP=50BAB905D077C2FA950CE0317D32624630451F9B

rem ---- 自动探测 signtool（优先 x64，arm64 在本机无法运行）----
set SIGTOOL=
for /f "delims=" %%k in ('dir /b /s "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe" 2^>nul') do set SIGTOOL=%%k
if not defined SIGTOOL (
  for /f "delims=" %%k in ('dir /b /s "C:\Program Files (x86)\Windows Kits\10\bin\signtool.exe" 2^>nul') do set SIGTOOL=%%k
)
if not defined SIGTOOL (
  echo [错误] 未找到 signtool.exe（需安装 Windows SDK）
  exit /b 1
)
echo [signtool] %SIGTOOL%

rem ---- 签名：安装包 + win-unpacked 下所有 exe ----
rem 时间戳用 Sectigo（DigiCert 时间戳服务器在本机不可达）
for %%f in ("%~dp0..\release\*.exe") do (
  echo [签名] %%~nxf
  "%SIGTOOL%" sign /sha1 %TP% /fd SHA256 /tr http://timestamp.sectigo.com /td SHA256 "%%f" || echo [警告] 签名失败: %%~nxf
)
for %%f in ("%~dp0..\release\win-unpacked\*.exe") do (
  echo [签名] win-unpacked\%%~nxf
  "%SIGTOOL%" sign /sha1 %TP% /fd SHA256 /tr http://timestamp.sectigo.com /td SHA256 "%%f" || echo [警告] 签名失败: %%~nxf
)
echo [完成] 全部签名完成
endlocal
