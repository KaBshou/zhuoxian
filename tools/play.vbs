' Zhuoxian launcher - double click to open the game.
'
' This file is intentionally pure ASCII. VBScript files are read as ANSI by
' cscript, so Chinese text here would get mangled and break the string parsing.
' All user-facing Chinese messages live in launch.ps1 instead.
'
' Why .vbs instead of .bat:
' a .bat flashes a black console window; closing that window kills the server.
' .vbs can call PowerShell with no window at all - you just see the browser.

Dim fso, shell, here, script

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Resolve relative to this file so the folder can be moved anywhere.
here = fso.GetParentFolderName(WScript.ScriptFullName)
script = here & "\launch.ps1"

If Not fso.FileExists(script) Then
  MsgBox "launch.ps1 not found next to play.vbs.", 16, "Zhuoxian - launch failed"
  WScript.Quit 1
End If

' 0 = hidden window, False = do not wait (the browser should pop up on its own).
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & script & """", 0, False
