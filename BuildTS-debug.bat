@echo off
REM ============================================================
REM  MegaForm - BuildTS-debug.bat
REM  Build mot Vite module cu the + hien thi loi chi tiet
REM
REM  Cach dung:
REM    BuildTS-debug.bat builder       -> build megaform-builder.js (verbose)
REM    BuildTS-debug.bat renderer      -> build megaform-renderer.js
REM ============================================================

SET UI_DIR=%~dp0MegaForm.UI

if "%~1"=="" (
    echo Usage: BuildTS-debug.bat [module]
    echo   Modules: builder config renderer widgets submissions views presets embed i18n admin-live
    pause
    exit /b 1
)

cd /d "%UI_DIR%"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo.
echo Building megaform-%~1.js (verbose)...
echo.
set MF_ENTRY=%~1
call npx vite build
echo.
echo Exit code: %ERRORLEVEL%
pause
