' Start PunchType without showing a console window (autostart + shortcuts).
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = appDir & "\PunchType.exe"
If Not fso.FileExists(exePath) Then
  WScript.Quit 1
End If
shell.Run """" & exePath & """ --background", 0, False
