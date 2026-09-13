!include "FileFunc.nsh"

# 影海自定义 NSIS 逻辑

# 强制安装目录为「影海」，避免与影匣（local-video-manager）共用目录导致程序文件覆盖。
# preInit 在安装目录页之前执行，因此用户仍可在界面上浏览修改。
!macro preInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\yinghai"
!macroend

# 安装器侧：把安装语言写入注册表，供卸载器与应用首次启动读取。
# 卸载器侧：卸载欢迎页之后新增「保留用户数据」复选框页面（默认勾选 = 保留）：
#           取消勾选并二次确认后，卸载流程尝试删除 %APPDATA%\yinghai。
# 安全红线：删除前必须通过 yinghai-uninstall-guard.ps1 校验 —— 检测到媒体库路径
#           与用户数据目录重叠时拒绝删除，绝不触碰用户设定的媒体库里的任何文件。

!macro customInit
  !ifdef BUILD_UNINSTALLER
    Goto InitEnd
  !endif

  # 把安装器语言写入注册表，供应用首次启动与卸载器读取
  StrCmp $LANGUAGE "2052" 0 +3
  StrCpy $R0 "zh-CN"
  Goto +2
  StrCpy $R0 "en-US"
  WriteRegStr HKCU "Software\yinghai" "InstallerLanguage" $R0

  # 检测旧版本是否仍在运行
  FindWindow $0 "" "影海"
  IntCmp $0 0 InitEnd
  StrCmp $LANGUAGE "2052" 0 +3
  MessageBox MB_OK|MB_ICONEXCLAMATION "检测到 影海 正在运行。请先彻底关闭应用（包括右下角的托盘图标），然后重新运行安装器。"
  Goto +2
  MessageBox MB_OK|MB_ICONEXCLAMATION "yinghai is currently running. Please close the application completely (including the tray icon), then run the installer again."
  Abort
InitEnd:
!macroend

!macro customUnInit
  # 保护脚本随安装目录分发（resources\yinghai-uninstall-guard.ps1）。
  # 卸载 Section 会删除整个安装目录，因此提前把脚本复制到 $PLUGINSDIR 备用；
  # 删除确认页 leave 回调里还有一次兜底复制。
  InitPluginsDir
  CopyFiles /SILENT "$INSTDIR\resources\yinghai-uninstall-guard.ps1" "$PLUGINSDIR\yinghai-uninstall-guard.ps1"

  # 解析应用内卸载入口传来的参数（/YXKEEPDATA 或 /YXDELDATA）。
  # 不带参数时（系统「应用和功能」卸载）保留原行为：显示数据页由用户选择。
  # ${GetParameters}/${GetOptions} 由 electron-builder 已包含的 FileFunc.nsh 提供。
  StrCpy $yxSkipDataPage "0"
  StrCpy $yxDelConfirmed "0"
  ${GetParameters} $R0
  ${GetOptions} $R0 "/YXDELDATA" $R1
  ${IfNot} ${Errors}
    StrCpy $yxDelConfirmed "1"
    StrCpy $yxSkipDataPage "1"
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/YXKEEPDATA" $R1
  ${IfNot} ${Errors}
    StrCpy $yxDelConfirmed "0"
    StrCpy $yxSkipDataPage "1"
  ${EndIf}

  # 语言回退（数据页被跳过时仍需用于后续提示）
  StrCmp $LANGUAGE "2052" 0 +3
  StrCpy $yxLang "zh-CN"
  Goto +2
  StrCpy $yxLang "en-US"
!macroend

# electron-builder 卸载欢迎页钩子：保留标准卸载欢迎页，紧接其后
# 声明「保留用户数据」复选框页面。
!macro customUnWelcomePage

  Var /GLOBAL yxKeepChk
  Var /GLOBAL yxDelConfirmed
  Var /GLOBAL yxLang
  Var /GLOBAL yxSkipDataPage

  # 应用内卸载入口已做出「保留/删除用户数据」决定时，跳过标准欢迎页与数据页，
  # 直接进入进度页（/YXKEEPDATA、/YXDELDATA 由 customUnInit 解析并设置 yxSkipDataPage）
  # 注：MUI_UNPAGE_WELCOME 会自动消费并 !undef MUI_PAGE_CUSTOMFUNCTION_PRE，无需手动 undef。
  !define MUI_PAGE_CUSTOMFUNCTION_PRE un.yxPreWelcome
  !insertmacro MUI_UNPAGE_WELCOME

  PageEx un.custom
    PageCallbacks un.yxDataPageCreate un.yxDataPageLeave
  PageExEnd

  Function un.yxPreWelcome
    StrCmp $yxSkipDataPage "1" 0 +2
    Abort
  FunctionEnd

  Function un.yxDataPageCreate
    # 应用内已决定数据去留：直接跳过本页（决定沿用 yxDelConfirmed）
    StrCmp $yxSkipDataPage "1" 0 +2
    Abort

    # 语言：优先安装时写入的注册表；缺省按 MUI 语言 ID 回退
    ReadRegStr $R9 HKCU "Software\yinghai" "InstallerLanguage"
    StrCmp $R9 "" 0 langReady
    StrCmp $LANGUAGE "2052" 0 +3
    StrCpy $R9 "zh-CN"
    Goto langReady
    StrCpy $R9 "en-US"
    langReady:
    StrCpy $yxLang $R9

    nsDialogs::Create 1018
    Pop $0

    StrCmp $R9 "zh-CN" 0 langEn
    StrCpy $R1 "是否保留 影海 的应用数据？"
    StrCpy $R2 "应用数据包括：媒体库配置、海报封面、缓存与日志等。取消勾选将在卸载完成后删除这些数据。"
    StrCpy $R3 "你的媒体文件与媒体库永远不会被删除。"
    StrCpy $R4 "保留用户数据"
    StrCpy $R5 "保留用户数据（媒体文件不受影响）"
    Goto langOk
    langEn:
    StrCpy $R1 "Keep yinghai app data?"
    StrCpy $R2 "App data includes library configuration, posters, cache and logs. If unchecked, this data is removed after uninstalling."
    StrCpy $R3 "Your media files and media libraries will never be deleted."
    StrCpy $R4 "Keep user data"
    StrCpy $R5 "Keep user data (media files unaffected)"
    langOk:

    # 页头标题/副标题按运行时语言设置（MUI_HEADER_TEXT 只能接受编译期文本，故直接用 SendMessage）
    SendMessage $mui.Header.Text ${WM_SETTEXT} 0 "STR:$R4"
    SendMessage $mui.Header.SubText ${WM_SETTEXT} 0 "STR:$R1"

    ${NSD_CreateLabel} 0 0 100% 14u "$R1"
    Pop $0
    ${NSD_CreateLabel} 0 20u 100% 28u "$R2"
    Pop $0
    ${NSD_CreateLabel} 0 52u 100% 14u "$R3"
    Pop $0
    ${NSD_CreateCheckbox} 0 72u 100% 14u "$R5"
    Pop $yxKeepChk

    # 默认勾选 = 保留用户数据
    ${NSD_SetState} $yxKeepChk ${BST_CHECKED}
    StrCpy $yxDelConfirmed "0"
    nsDialogs::Show
  FunctionEnd

  Function un.yxDataPageLeave
    ${NSD_GetState} $yxKeepChk $0
    StrCmp $0 ${BST_CHECKED} keep

    # 用户取消勾选 → 二次确认；选择「否」则留在本页
    StrCmp $yxLang "zh-CN" 0 +3
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "确定删除应用数据吗？媒体库中的视频文件不会被删除。" IDYES doDelete
    Goto recheck
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "Delete app data? Videos in your media libraries will never be deleted." IDYES doDelete

    recheck:
    Abort

    keep:
    StrCpy $yxDelConfirmed "0"
    Goto done

    doDelete:
    # 仅记录意愿；真正的校验与删除在 un.install Section 末尾执行，
    # 确保卸载先完成「应用是否在运行」检查与安装文件清理。
    StrCpy $yxDelConfirmed "1"

    done:
  FunctionEnd
!macroend

# 卸载 Section（un.install）内联执行：用户确认删除后，先由保护脚本校验
# 媒体库路径与用户数据目录是否重叠，安全时才删除 %APPDATA%\yinghai。
# 注意：此宏被 electron-builder 插入在 Section "un.install" 内部，不能声明新的 Section。
!macro customUnInstall
  StrCmp $yxDelConfirmed "1" 0 yxDataDone

  # 保护脚本在 unInit 阶段已复制到 $PLUGINSDIR（$INSTDIR 此时已删除）
  IfFileExists "$PLUGINSDIR\yinghai-uninstall-guard.ps1" yxRunGuard

  StrCmp $yxLang "zh-CN" 0 +3
  MessageBox MB_OK|MB_ICONEXCLAMATION "未找到用户数据保护脚本，为安全起见已保留用户数据。"
  Goto yxDataDone
  MessageBox MB_OK|MB_ICONEXCLAMATION "User data protection script not found. User data has been kept for safety."
  Goto yxDataDone

  yxRunGuard:
  # 保护脚本：校验媒体库路径与用户数据目录是否重叠，安全时删除用户数据目录
  #   exit 0 → 已安全删除；exit 9 → 路径重叠（拒删）；exit 8 → 解析失败（保守不删）
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$PLUGINSDIR\yinghai-uninstall-guard.ps1" -DataDirOverride "$APPDATA\yinghai"'
  Pop $0

  StrCmp $0 0 yxDataDone
  StrCmp $0 9 yxDataOverlap
  StrCmp $0 8 yxDataParseFailed
  StrCmp $0 1 yxDataDeleteFailed

  StrCmp $yxLang "zh-CN" 0 +3
  MessageBox MB_OK|MB_ICONEXCLAMATION "无法完成用户数据清理，用户数据已保留。"
  Goto yxDataDone
  MessageBox MB_OK|MB_ICONEXCLAMATION "Unable to clean up user data. Your user data has been kept."
  Goto yxDataDone

  yxDataOverlap:
  StrCmp $yxLang "zh-CN" 0 +3
  MessageBox MB_OK|MB_ICONEXCLAMATION "检测到媒体库路径与用户数据目录重叠，为保护媒体文件已跳过删除。"
  Goto yxDataDone
  MessageBox MB_OK|MB_ICONEXCLAMATION "A media library path overlaps the app data folder. Deletion skipped to protect your media files."
  Goto yxDataDone

  yxDataParseFailed:
  StrCmp $yxLang "zh-CN" 0 +3
  MessageBox MB_OK|MB_ICONEXCLAMATION "无法解析用户数据文件，为保证安全已跳过删除。"
  Goto yxDataDone
  MessageBox MB_OK|MB_ICONEXCLAMATION "Unable to parse the user data file. Deletion skipped for safety."
  Goto yxDataDone

  yxDataDeleteFailed:
  StrCmp $yxLang "zh-CN" 0 +3
  MessageBox MB_OK|MB_ICONEXCLAMATION "无法完成用户数据清理（可能应用仍在运行或数据目录被占用），用户数据已保留。"
  Goto yxDataDone
  MessageBox MB_OK|MB_ICONEXCLAMATION "Unable to clean up user data (the app may still be running or the folder is in use). Your user data has been kept."
  Goto yxDataDone

  yxDataDone:
!macroend