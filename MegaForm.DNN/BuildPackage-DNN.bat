@echo off
REM  MegaForm.DNN - Tao Install Package day du (TS + C# + Package)
REM  BuildTS now also verifies the standalone QRCode corner plugin before packaging
REM  Double-click file nay
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0BuildPackage-DNN.ps1" -BuildTS -BuildDotNet -Configuration Release -NoPause
