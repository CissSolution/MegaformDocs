@echo off
REM ============================================================
REM  MegaForm - BuildTS.bat
REM  Wrapper: goi BuildTS.ps1 de build Vite bundles + sync DesktopModules/Web/Oqtane
REM
REM  Cach dung:
REM    BuildTS.bat               -> build tat ca bundles + sync full Assets/plugins to runtime folders
REM                                   (plugins tsconfig now includes QRCode corner widget)
REM    BuildTS.bat builder       -> chi build megaform-builder.js
REM    BuildTS.bat renderer      -> chi build megaform-renderer.js
REM ============================================================

SET SCRIPT_DIR=%~dp0

where powershell >nul 2>nul
if errorlevel 1 (
    echo [ERROR] PowerShell khong tim thay!
    pause
    exit /b 1
)

SET PS_ARGS=
if "%~1" neq "" SET PS_ARGS=-Module %~1

echo [BuildTS] Build + sync: Assets -> DesktopModules, Web, Oqtane, fix21_src copies (if present)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%BuildTS.ps1" %PS_ARGS%

exit /b %ERRORLEVEL%
