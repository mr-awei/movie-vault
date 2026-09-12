; 模拟 electron-builder uninstaller 模板结构，验证 installer.nsh 宏展开语法
!define BUILD_UNINSTALLER
!include MUI2.nsh
!include nsDialogs.nsh

!include "E:\moviemanger\build\installer.nsh"

; 模拟 assistedInstaller.nsh 的卸载分支
!ifmacrodef customUnWelcomePage
  !insertmacro customUnWelcomePage
!endif
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE English
!insertmacro MUI_LANGUAGE SimpChinese

Section
SectionEnd

Section un.test
  ; 模拟 uninstaller.nsh 第 238-240 行：在 un.install Section 内部调用
  !ifmacrodef customUnInstall
    !insertmacro customUnInstall
  !endif
SectionEnd