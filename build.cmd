@echo off
setlocal EnableDelayedExpansion
REM ============================================================
REM  MegaForm -- Build (Oqtane + TypeScript)
REM  Cach dung:
REM    build.cmd              -> Debug
REM    build.cmd release      -> Release
REM    build.cmd all release  -> Release  (tham so "all" duoc bo qua)
REM    build.cmd clean        -> Xoa bin/obj
REM    build.cmd check        -> Kiem tra .NET SDK
REM ============================================================

REM -- Xu ly tham so (kiem tra tat ca vi tri) ------------------
SET CONFIG=Debug
IF /I "%~1"=="clean"   GOTO :CLEAN
IF /I "%~1"=="check"   GOTO :CHECK
IF /I "%~1"=="release" SET CONFIG=Release
IF /I "%~2"=="release" SET CONFIG=Release
IF /I "%~3"=="release" SET CONFIG=Release

REM -- Kiem tra .NET SDK ---------------------------------------
dotnet --version >NUL 2>&1
IF ERRORLEVEL 1 (
    ECHO [LOI] Khong tim thay .NET SDK.
    ECHO       Tai tai: https://dotnet.microsoft.com/download/dotnet/8.0
    EXIT /B 1
)

REM -- Kiem tra phien ban >= 8 ---------------------------------
SET MAJOR=0
FOR /F "tokens=1 delims=." %%V IN ('dotnet --version 2^>NUL') DO SET MAJOR=%%V
IF "!MAJOR!"=="" SET MAJOR=0
IF !MAJOR! LSS 8 (
    ECHO [LOI] Can .NET 8 hoac cao hon. Hien tai:
    dotnet --version
    EXIT /B 1
)

REM -- Build TypeScript bundles --------------------------------
where node >NUL 2>&1
IF ERRORLEVEL 1 GOTO :SKIP_TS

ECHO.
ECHO [0/6] Build TypeScript bundles...
call BuildTS.bat theme-designer
IF ERRORLEVEL 1 ( ECHO [LOI] BuildTS theme-designer that bai! & EXIT /B 1 )
call BuildTS.bat theme-inspector
IF ERRORLEVEL 1 ( ECHO [LOI] BuildTS theme-inspector that bai! & EXIT /B 1 )
call BuildTS.bat dashboard
IF ERRORLEVEL 1 ( ECHO [LOI] BuildTS dashboard that bai! & EXIT /B 1 )
call BuildTS.bat languages
IF ERRORLEVEL 1 ( ECHO [LOI] BuildTS languages that bai! & EXIT /B 1 )
call BuildTS.bat dnn-host
IF ERRORLEVEL 1 ( ECHO [LOI] BuildTS dnn-host that bai! & EXIT /B 1 )
call BuildTS.bat admin-live
IF ERRORLEVEL 1 ( ECHO [WARN] BuildTS admin-live that bai! tiep tuc... )
call powershell -NoProfile -ExecutionPolicy Bypass -File BuildTS.ps1 -Module captcha -NoPause
IF ERRORLEVEL 1 ( ECHO [LOI] BuildTS captcha that bai! & EXIT /B 1 )
call powershell -NoProfile -ExecutionPolicy Bypass -File BuildTS.ps1 -Module appointment -NoPause
IF ERRORLEVEL 1 ( ECHO [LOI] BuildTS appointment that bai! & EXIT /B 1 )
call powershell -NoProfile -ExecutionPolicy Bypass -File BuildTS.ps1 -Module phone-pro -NoPause
IF ERRORLEVEL 1 ( ECHO [LOI] BuildTS phone-pro that bai! & EXIT /B 1 )
call powershell -NoProfile -ExecutionPolicy Bypass -File BuildTS.ps1 -Module grid-repeater -NoPause
IF ERRORLEVEL 1 ( ECHO [LOI] BuildTS grid-repeater that bai! & EXIT /B 1 )
GOTO :BUILD_CS

:SKIP_TS
ECHO [WARN] Khong tim thay Node.js -- bo qua Vite build

REM -- Build C# ------------------------------------------------
:BUILD_CS
ECHO.
ECHO [MegaForm] .NET SDK:
dotnet --version
ECHO [MegaForm] Cau hinh: !CONFIG!
ECHO [MegaForm] LUU Y: Bo qua MegaForm.DNN va MegaForm.Web (can them thu vien rieng)
ECHO.

ECHO [1/6] MegaForm.Core...
dotnet build MegaForm.Core\MegaForm.Core.csproj -c !CONFIG! -f net9.0
IF ERRORLEVEL 1 ( ECHO [LOI] MegaForm.Core & EXIT /B 1 )

ECHO.
ECHO [2/6] MegaForm.Oqtane.Shared...
dotnet build MegaForm.Oqtane.Shared\MegaForm.Oqtane.Shared.csproj -c !CONFIG!
IF ERRORLEVEL 1 ( ECHO [LOI] MegaForm.Oqtane.Shared & EXIT /B 1 )

ECHO.
ECHO [3/6] MegaForm.Oqtane.Client...
dotnet build MegaForm.Oqtane.Client\MegaForm.Oqtane.Client.csproj -c !CONFIG!
IF ERRORLEVEL 1 ( ECHO [LOI] MegaForm.Oqtane.Client & EXIT /B 1 )

ECHO.
ECHO [4/6] MegaForm.Oqtane.Server...
dotnet build MegaForm.Oqtane.Server\MegaForm.Oqtane.Server.csproj -c !CONFIG!
IF ERRORLEVEL 1 ( ECHO [LOI] MegaForm.Oqtane.Server & EXIT /B 1 )

ECHO.
ECHO [5/6] Ket qua:
ECHO   Core   : MegaForm.Core\bin\!CONFIG!\net9.0\MegaForm.Core.dll
ECHO   Client : MegaForm.Oqtane.Client\bin\!CONFIG!\net9.0\MegaForm.Oqtane.Client.Oqtane.dll
ECHO   Server : MegaForm.Oqtane.Server\bin\!CONFIG!\net9.0\MegaForm.Oqtane.Server.Oqtane.dll
ECHO   Shared : MegaForm.Oqtane.Shared\bin\!CONFIG!\net9.0\MegaForm.Oqtane.Shared.Oqtane.dll
ECHO.
ECHO [MegaForm] BUILD THANH CONG!  (Cau hinh: !CONFIG!)
GOTO :EOF

:CLEAN
ECHO [MegaForm] Xoa bin/ va obj/...
FOR /D /R . %%D IN (bin,obj) DO IF EXIST "%%D" RD /S /Q "%%D"
ECHO [MegaForm] Clean xong.
GOTO :EOF

:CHECK
dotnet --version
dotnet --list-sdks
GOTO :EOF
