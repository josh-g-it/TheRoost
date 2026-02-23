; The Roost NSIS Installer Hooks
; Custom cleanup logic for uninstall

!macro NSIS_HOOK_PREINSTALL
  ; Nothing needed before install
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Nothing needed after install
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Nothing needed before uninstall
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Clean up any leftover shortcuts
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${PRODUCTNAME}"
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
!macroend
