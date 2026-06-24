@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set LOGDIR=%~dp0build-logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>nul
set TSLOG=%LOGDIR%\01-BuildTS.log
set BUILDLOG=%LOGDIR%\02-build.log
set PACKLOG=%LOGDIR%\03-pack.log

echo ============================================================
echo MegaForm - Run full build pipeline
echo 1. BuildTS.bat
echo 2. build.cmd
echo 3. pack.cmd
echo Logs: %LOGDIR%
echo ============================================================
echo.

call :RunStep BuildTS "%TSLOG%" BuildTS.bat
if errorlevel 1 goto :FAIL

call :RunStep build.cmd "%BUILDLOG%" build.cmd
if errorlevel 1 goto :FAIL

call :RunStep pack.cmd "%PACKLOG%" pack.cmd
if errorlevel 1 goto :FAIL

echo.
echo [OK] Toan bo pipeline da chay thanh cong.
echo [OK] Xem logs tai: %LOGDIR%
goto :EOF

:RunStep
set STEP=%~1
set LOG=%~2
shift
shift
echo ------------------------------------------------------------
echo [RUN] %STEP%
echo [LOG] %LOG%
echo ------------------------------------------------------------
call %* > "%LOG%" 2>&1
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
    echo [ERROR] %STEP% that bai voi ma loi %ERR%.
    echo [ERROR] 40 dong cuoi cua log:
    echo.
    powershell -NoProfile -Command "if (Test-Path '%LOG%') { Get-Content '%LOG%' -Tail 40 }"
    exit /b %ERR%
)
echo [OK] %STEP% thanh cong.
exit /b 0

:FAIL
echo.
echo [FAILED] Pipeline dung lai. Xem thu muc log: %LOGDIR%
exit /b 1
