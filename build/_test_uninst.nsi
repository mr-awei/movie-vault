!include MUI2.nsh
!include nsDialogs.nsh
!define BUILD_UNINSTALLER
!include "E:\moviemanger\build\installer.nsh"
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE English
Section
SectionEnd
Section un.test
SectionEnd