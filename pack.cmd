@echo off
REM ============================================================
REM  MegaForm -- Pack script: build Release + tao file .nupkg
REM  Yeu cau: .NET 9 SDK + nuget.exe + (tuy chon) Node.js
REM  Chay: pack.cmd
REM  Output: MegaForm.Oqtane.Package\MegaForm.Oqtane.1.5.0.nupkg
REM
REM  Thu tu dung:
REM    [0/4] Sync vendor files (React/ReactFlow)  -- wwwroot luon dung
REM  [1/4] npm run build:builder + build:workflow + build:dashboard + build:dnn-host + build:admin-live + build:theme-* -- compile TS -> bundle moi
REM    [2/4] dotnet build Release                 -- compile C# voi wwwroot moi
REM    [3/4] Copy Core.dll                        -- chuan bi cho nuspec
REM    [4/4] nuget pack                           -- dong goi .nupkg
REM ============================================================

SET CONFIG=Release

ECHO.
ECHO [MegaForm] Kiem tra .NET SDK...
dotnet --version >NUL 2>&1
IF ERRORLEVEL 1 ( ECHO [LOI] Khong tim thay .NET SDK. & EXIT /B 1 )

REM -- Step 0/4: Sync vendor files (React, ReactFlow) --------------------------
REM  Nguon chuan: MegaForm.Web\wwwroot (developer cap nhat thu cong o day)
REM  Dong bo sang: Assets\js\builder\ va Oqtane.Server\wwwroot\...\js\builder\
REM  Thieu buoc nay -> reactflow.min.js co the bi 0 byte tren DNN hoac Oqtane
REM -----------------------------------------------------------------------------
ECHO.
ECHO [0/4] Sync vendor files (React, ReactFlow)...

SET WEB_VENDOR=MegaForm.Web\wwwroot\megaform\js\builder
SET DNN_VENDOR=Assets\js\builder
SET OQT_VENDOR=MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\js\builder

IF NOT EXIST "%WEB_VENDOR%\reactflow.min.js" (
    ECHO [WARN] Khong tim thay reactflow.min.js trong MegaForm.Web -- bo qua sync vendor
    GOTO :SKIP_VENDOR
)

FOR %%F IN (react.production.min.js react-dom.production.min.js reactflow.min.js) DO (
    IF EXIST "%WEB_VENDOR%\%%F" (
        COPY /Y "%WEB_VENDOR%\%%F" "%DNN_VENDOR%\%%F" >NUL
        COPY /Y "%WEB_VENDOR%\%%F" "%OQT_VENDOR%\%%F" >NUL
        ECHO [OK] Synced: %%F
    ) ELSE (
        ECHO [WARN] Khong tim thay: %WEB_VENDOR%\%%F
    )
)

REM reactflow.min.css: MegaForm.Web dat o css/ khong phai js/builder/
REM Uu tien: Assets\js\builder\ -> MegaForm.Web\css\ -> WARN
IF EXIST "%DNN_VENDOR%\reactflow.min.css" (
    COPY /Y "%DNN_VENDOR%\reactflow.min.css" "%OQT_VENDOR%\reactflow.min.css" >NUL
    ECHO [OK] Synced: reactflow.min.css
    GOTO :CSS_DONE
)
IF EXIST "MegaForm.Web\wwwroot\megaform\css\reactflow.min.css" (
    COPY /Y "MegaForm.Web\wwwroot\megaform\css\reactflow.min.css" "%DNN_VENDOR%\reactflow.min.css" >NUL
    COPY /Y "MegaForm.Web\wwwroot\megaform\css\reactflow.min.css" "%OQT_VENDOR%\reactflow.min.css" >NUL
    ECHO [OK] Synced: reactflow.min.css (tu MegaForm.Web\css)
    GOTO :CSS_DONE
)
ECHO [WARN] Khong tim thay reactflow.min.css o bat ky dau -- Flow tab co the bi loi CSS
:CSS_DONE

:SKIP_VENDOR

REM -- Step 1/4: Build TypeScript -> bundle moi vao wwwroot TRUOC dotnet build --
REM  Quan trong: phai chay TRUOC dotnet build de wwwroot co bundle moi nhat
REM  Vite plugin tu dong sync bundle sang Oqtane.Server va MegaForm.Web
REM -----------------------------------------------------------------------------
ECHO.
ECHO [1/4] Build TypeScript (builder + workflow + dashboard + dnn-host + admin-live + theme-*)...

where node >NUL 2>&1
IF ERRORLEVEL 1 (
    ECHO [WARN] Khong tim thay Node.js -- bo qua TS build
    ECHO [WARN] Neu vua sua file .ts, chay thu cong truoc: cd MegaForm.UI ^&^& npm run build:builder ^&^& cd ..
    GOTO :SKIP_TS
)
where npm >NUL 2>&1
IF ERRORLEVEL 1 (
    ECHO [WARN] Khong tim thay npm -- bo qua TS build
    GOTO :SKIP_TS
)

CD MegaForm.UI

REM Cai dat dependencies neu node_modules chua co hoac thieu cross-env
IF NOT EXIST "node_modules\cross-env" (
    ECHO [INFO] node_modules chua co cross-env -- chay npm install...
    call npm install
    IF ERRORLEVEL 1 ( CD .. & ECHO [LOI] npm install that bai! & EXIT /B 1 )
)

call npm run build:builder
IF ERRORLEVEL 1 ( CD .. & ECHO [LOI] npm run build:builder that bai! & EXIT /B 1 )
call npm run build:workflow
IF ERRORLEVEL 1 ( CD .. & ECHO [LOI] npm run build:workflow that bai! & EXIT /B 1 )
call npm run build:dashboard
IF ERRORLEVEL 1 ( CD .. & ECHO [LOI] npm run build:dashboard that bai! & EXIT /B 1 )
call npm run build:dnn-host
IF ERRORLEVEL 1 ( CD .. & ECHO [LOI] npm run build:dnn-host that bai! & EXIT /B 1 )
call npm run build:admin-live
IF ERRORLEVEL 1 ( CD .. & ECHO [WARN] npm run build:admin-live that bai! tiep tuc... )
call npm run build:theme-designer
IF ERRORLEVEL 1 ( CD .. & ECHO [WARN] npm run build:theme-designer that bai! tiep tuc... )
call npm run build:theme-inspector
IF ERRORLEVEL 1 ( CD .. & ECHO [WARN] npm run build:theme-inspector that bai! tiep tuc... )
CD ..
call powershell -NoProfile -ExecutionPolicy Bypass -File BuildTS.ps1 -Module captcha -NoPause
IF ERRORLEVEL 1 ( ECHO [LOI] BuildTS captcha that bai! & EXIT /B 1 )
call powershell -NoProfile -ExecutionPolicy Bypass -File BuildTS.ps1 -Module phone-pro -NoPause
IF ERRORLEVEL 1 ( ECHO [LOI] BuildTS phone-pro that bai! & EXIT /B 1 )
call powershell -NoProfile -ExecutionPolicy Bypass -File BuildTS.ps1 -Module grid-repeater -NoPause
IF ERRORLEVEL 1 ( ECHO [LOI] BuildTS grid-repeater that bai! & EXIT /B 1 )
ECHO [OK] TS build xong (builder + workflow + theme-designer + theme-inspector + widget plugins)
ECHO [INFO] Verify Theme Designer sync to MegaForm.Web wwwroot...
IF EXIST "Assets\js\megaform-theme-designer.js" COPY /Y "Assets\js\megaform-theme-designer.js" "MegaForm.Web\wwwroot\megaform\js\megaform-theme-designer.js" >NUL
IF EXIST "Assets\js\megaform-theme-inspector.js" COPY /Y "Assets\js\megaform-theme-inspector.js" "MegaForm.Web\wwwroot\megaform\js\megaform-theme-inspector.js" >NUL
IF EXIST "Assets\css\megaform-theme-designer.css" COPY /Y "Assets\css\megaform-theme-designer.css" "MegaForm.Web\wwwroot\megaform\css\megaform-theme-designer.css" >NUL
IF NOT EXIST "MegaForm.Web\wwwroot\megaform\js\megaform-theme-designer.js" ( ECHO [WARN] Theme Designer JS chua co trong Web wwwroot )
IF NOT EXIST "MegaForm.Web\wwwroot\megaform\js\megaform-theme-inspector.js" ( ECHO [WARN] Theme Inspector JS chua co trong Web wwwroot )

:SKIP_TS

REM -- Step 1b: Sync i18n locale packs + verify package completeness ------------
REM  ROOT CAUSE of the 2026-06-26 drift: the canonical public/i18n was NEVER synced
REM  into the four Oqtane js/**/i18n dirs at pack time, so the wwwroot wildcard shipped
REM  stale/partial language packs. Sync ALL dirs from canonical, then GUARD: abort the
REM  pack if any resource directory (i18n / KB) is incomplete. The package ships whole
REM  DIRECTORIES (wwwroot wildcard) — so completeness == this tree being complete here.
where node >NUL 2>&1
IF ERRORLEVEL 1 (
    ECHO [WARN] Node khong co -- BO QUA i18n sync + completeness guard ^(rui ro ship thieu^)
    GOTO :SKIP_I18N
)
ECHO.
ECHO [1b/4] Sync i18n locale packs to ALL platform dirs...
call node "MegaForm.UI\tools\i18n-sync-platforms.cjs"
IF ERRORLEVEL 1 ( ECHO [LOI] i18n sync that bai! & EXIT /B 1 )
ECHO.
ECHO [1b2/4] Generate per-template facts.json + guide.md to ALL 3 platform dirs...
call node "MegaForm.UI\tools\gen-template-facts.cjs"
IF ERRORLEVEL 1 ( ECHO [LOI] gen-template-facts that bai! & EXIT /B 1 )
ECHO.
ECHO [1c/4] Verify package completeness ^(i18n + KB resources + premium facts/guide^)...
call node "MegaForm.UI\tools\verify-package-complete.cjs"
IF ERRORLEVEL 1 ( ECHO [LOI] Package KHONG day du -- huy pack. Xem log o tren. & EXIT /B 1 )
:SKIP_I18N

REM -- Step 2/4: Build C# Release (sau khi wwwroot da co bundle moi) ------------
ECHO.
ECHO [2/4] Build Release C#...

dotnet build MegaForm.Oqtane.Shared\MegaForm.Oqtane.Shared.csproj -c %CONFIG% -v q
IF ERRORLEVEL 1 ( ECHO [LOI] Shared build that bai! & EXIT /B 1 )

dotnet build MegaForm.Core\MegaForm.Core.csproj -c %CONFIG% -f net9.0 -v q
IF ERRORLEVEL 1 ( ECHO [LOI] Core build that bai! & EXIT /B 1 )

dotnet build MegaForm.Oqtane.Client\MegaForm.Oqtane.Client.csproj -c %CONFIG% -v q
IF ERRORLEVEL 1 ( ECHO [LOI] Client build that bai! & EXIT /B 1 )

dotnet build MegaForm.Oqtane.Server\MegaForm.Oqtane.Server.csproj -c %CONFIG% -v q
IF ERRORLEVEL 1 ( ECHO [LOI] Server build that bai! & EXIT /B 1 )

REM -- Step 3/4: Copy Core.dll + Build Package project --------------------------
ECHO.
ECHO [3/4] Copy Core.dll + Build Package (tao staticwebassets)...
COPY /Y "MegaForm.Core\bin\%CONFIG%\net9.0\MegaForm.Core.dll" ^
        "MegaForm.Oqtane.Server\bin\%CONFIG%\net9.0\" >NUL
IF ERRORLEVEL 1 ( ECHO [WARN] Khong copy duoc Core.dll )

REM Build Package.csproj (Microsoft.NET.Sdk.Razor) de tao bin/Release/net9.0/
REM Buoc nay phai chay TRUOC nuget pack vi nuspec lay file tu Package bin/
dotnet build MegaForm.Oqtane.Package\MegaForm.Oqtane.Package.csproj -c %CONFIG% -v q
IF ERRORLEVEL 1 ( ECHO [LOI] Package build that bai! & EXIT /B 1 )

REM -- Step 4/4: Pack bang nuget.exe ---------------------------------------------
ECHO.
ECHO [4/4] Tao .nupkg...

CD MegaForm.Oqtane.Package
DEL /Q "*.nupkg" 2>NUL

SET NUGET_EXE=
IF EXIST "%USERPROFILE%\.nuget\nuget.exe"                         SET NUGET_EXE=%USERPROFILE%\.nuget\nuget.exe
IF EXIST "%ProgramFiles%\NuGet\nuget.exe"                         SET NUGET_EXE=%ProgramFiles%\NuGet\nuget.exe
IF EXIST "C:\nuget\nuget.exe"                                     SET NUGET_EXE=C:\nuget\nuget.exe
IF EXIST "..\..\..\oqtane.framework\oqtane.package\nuget.exe"    SET NUGET_EXE=..\..\..\oqtane.framework\oqtane.package\nuget.exe

IF NOT "%NUGET_EXE%"=="" (
    ECHO [INFO] Dung: %NUGET_EXE%
    "%NUGET_EXE%" pack MegaForm.Oqtane.nuspec -NoPackageAnalysis
    IF ERRORLEVEL 1 ( CD .. & ECHO [LOI] nuget pack that bai! & EXIT /B 1 )
) ELSE (
    ECHO [LOI] Khong tim thay nuget.exe!
    ECHO [INFO] Tai tai: https://dist.nuget.org/win-x86-commandline/latest/nuget.exe
    ECHO [INFO] Dat vao: %USERPROFILE%\.nuget\nuget.exe
    CD ..
    EXIT /B 1
)

CD ..

REM -- Deploy local Oqtane neu co ------------------------------------------------
IF EXIST "..\oqtane.framework\Oqtane.Server\Packages\" (
    XCOPY "MegaForm.Oqtane.Package\*.nupkg" "..\oqtane.framework\Oqtane.Server\Packages\" /Y /Q
    ECHO [OK] Da copy vao Oqtane Packages folder
)

ECHO.
ECHO ============================================================
ECHO  PACK THANH CONG!
ECHO  File: MegaForm.Oqtane.Package\MegaForm.Oqtane.1.5.0.nupkg
ECHO.
ECHO  CACH CAI VAO OQTANE:
ECHO  1. Admin - Module Management - Install Module - Upload
ECHO  2. Hoac copy .nupkg vao [oqtane]\Packages\ roi restart app
ECHO ============================================================
