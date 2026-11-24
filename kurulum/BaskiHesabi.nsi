; Baskı Hesabı — Windows kurulumu (NSIS, kullanıcı başına, tek tık, tr/en/ar).
; Derleme (CI, windows-latest):  makensis /DVERSION=1.14.0 /DEXE=..\dist\BaskiHesabi.exe /DOUTFILE=..\dist\BaskiHesabi-Setup-1.14.0.exe kurulum\BaskiHesabi.nsi
; Kurulum yeri: %LOCALAPPDATA%\Programs\BaskiHesabi  (yönetici izni gerekmez)
; Veriler: kurulum klasöründeki BaskiHesabi-veri — kaldırma ve yeniden kurulum ona DOKUNMAZ.
; İlk açılışta program eski taşınabilir sürümün BaskiHesabi-veri klasörünü bulup kayıtları kendisi taşır (shell-exe/migrate.go).

Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef EXE
  !define EXE "..\dist\BaskiHesabi.exe"
!endif
!ifndef OUTFILE
  !define OUTFILE "..\dist\BaskiHesabi-Setup-${VERSION}.exe"
!endif

!define APPNAME "Baskı Hesabı"
!define EXENAME "BaskiHesabi.exe"
!define UNINST "Kaldir.exe"
!define UKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\BaskiHesabi"
!define KAPAT_URL "http://127.0.0.1:41731/__shell/kapat"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\BaskiHesabi"
RequestExecutionLevel user
ShowInstDetails nevershow
ShowUninstDetails nevershow
AutoCloseWindow true
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Baski Hesabi"
VIAddVersionKey /LANG=1033 "FileDescription" "Baski Hesabi kurulum"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "CompanyName" "departures-mil"
VIAddVersionKey /LANG=1033 "LegalCopyright" "departures-mil"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Turkish"
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Arabic"

LangString MsgOpen ${LANG_TURKISH} "Baskı Hesabı hâlâ açık. Programı kapatıp $\"Yeniden Dene$\"ye basın."
LangString MsgOpen ${LANG_ENGLISH} "Baskı Hesabı is still open. Close the program and press $\"Retry$\"."
LangString MsgOpen ${LANG_ARABIC} "برنامج حساب الطباعة ما زال مفتوحًا. أغلقه ثم اضغط $\"إعادة المحاولة$\"."
LangString UnKeep ${LANG_TURKISH} "Program kaldırıldı. Kayıtlarınız silinmedi: $INSTDIR\BaskiHesabi-veri"
LangString UnKeep ${LANG_ENGLISH} "The program was removed. Your records were not deleted: $INSTDIR\BaskiHesabi-veri"
LangString UnKeep ${LANG_ARABIC} "أُزيل البرنامج. لم تُحذف سجلاتك: $INSTDIR\BaskiHesabi-veri"

; Açık programdan kapanmasını ister (yerel API; program yoksa sessizce geçer).
!macro AskClose
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Method POST -Body ''{}'' -Uri ${KAPAT_URL} -TimeoutSec 3 | Out-Null } catch {}"'
  Pop $0
!macroend

Section "install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  !insertmacro AskClose
  SetOverwrite try
  StrCpy $R1 0
  retry:
    ClearErrors
    File "/oname=${EXENAME}" "${EXE}"
    IfErrors 0 written
    IntOp $R1 $R1 + 1
    IntCmp $R1 30 ask 0 ask
    Sleep 500
    Goto retry
  ask:
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(MsgOpen)" IDRETRY again
    Abort
  again:
    StrCpy $R1 0
    Goto retry
  written:
  SetOverwrite on
  File "icon.ico"
  WriteUninstaller "$INSTDIR\${UNINST}"

  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\icon.ico" 0

  WriteRegStr HKCU "${UKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UKEY}" "Publisher" "departures-mil"
  WriteRegStr HKCU "${UKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UKEY}" "UninstallString" '"$INSTDIR\${UNINST}"'
  WriteRegStr HKCU "${UKEY}" "QuietUninstallString" '"$INSTDIR\${UNINST}" /S'
  WriteRegStr HKCU "${UKEY}" "URLInfoAbout" "https://github.com/departures-mil/baski-hesabi"
  WriteRegDWORD HKCU "${UKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UKEY}" "NoRepair" 1
SectionEnd

Function .onInstSuccess
  IfSilent +2
  Exec '"$INSTDIR\${EXENAME}"'
FunctionEnd

Section "uninstall"
  SetShellVarContext current
  !insertmacro AskClose
  Sleep 1500
  Delete "$INSTDIR\${EXENAME}"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\${UNINST}"
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  DeleteRegKey HKCU "${UKEY}"
  ; BaskiHesabi-veri (kayıtlar) ve BaskiHesabi-ciktilar SİLİNMEZ; klasör boşsa kaldırılır.
  RMDir "$INSTDIR"
  IfSilent +2
  MessageBox MB_OK|MB_ICONINFORMATION "$(UnKeep)"
SectionEnd
