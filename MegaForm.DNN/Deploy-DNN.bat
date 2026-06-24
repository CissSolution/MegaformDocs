@echo off
REM ============================================================
REM  MegaForm.DNN - Hot Deploy (dev only)
REM  1. Build Vite bundles (builder + dashboard + dnn-host + admin-live)
REM  2. Copy DLLs + Views + Assets -> DNN website
REM
REM  Chinh DNN_ROOT truoc khi chay lan dau.
REM  Chay BuildTS.bat truoc neu muon rebuild TAT CA modules.
REM ============================================================
setlocal enabledelayedexpansion

SET DNN_ROOT=C:\inetpub\wwwroot\DNN10221\Website
SET MODULE_ROOT=%DNN_ROOT%\DesktopModules\MegaForm
SET SOLUTION_DIR=%~dp0..
SET UI_DIR=%SOLUTION_DIR%\MegaForm.UI

echo.
echo ============================================
echo  MegaForm.DNN - Hot Deploy
echo  DNN: %DNN_ROOT%
echo ============================================
echo.

REM -- Check DNN root exists -----------------------------------
if not exist "%DNN_ROOT%" (
    echo [ERROR] DNN_ROOT not found: %DNN_ROOT%
    echo         Edit Deploy-DNN.bat and set DNN_ROOT correctly.
    pause & exit /b 1
)

REM -- [0] Build Vite bundles (all JS needed for DNN) ----------
echo [0/6] Building Vite bundles (builder + dashboard + dnn-host + admin-live)...
if not exist "%UI_DIR%\node_modules" (
    echo       node_modules not found, running npm install...
    cd /d "%UI_DIR%" && npm install
)
cd /d "%UI_DIR%"

REM builder (bundles\megaform-builder.js)
set MF_ENTRY=builder
call npx vite build
if errorlevel 1 (
    echo [ERROR] Vite build:builder failed! Deploy aborted.
    pause & exit /b 1
)

REM dashboard (megaform-dashboard.js) - platform-aware links, settings panels
set MF_ENTRY=dashboard
call npx vite build
if errorlevel 1 (
    echo [ERROR] Vite build:dashboard failed! Deploy aborted.
    pause & exit /b 1
)

REM dnn-host (megaform-dnn-host.js) - overlay manager, #mf-* hash routing
set MF_ENTRY=dnn-host
call npx vite build
if errorlevel 1 (
    echo [ERROR] Vite build:dnn-host failed! Deploy aborted.
    pause & exit /b 1
)

REM admin-live (megaform-admin-live.js) - live style editor with DNN auth headers
set MF_ENTRY=admin-live
call npx vite build
if errorlevel 1 (
    echo [WARN] Vite build:admin-live failed! Continuing...
)

echo       Vite OK (builder + dashboard + dnn-host + admin-live)
echo.

REM -- Directories ---------------------------------------------
cd /d "%SOLUTION_DIR%"
if not exist "%MODULE_ROOT%\Views"              mkdir "%MODULE_ROOT%\Views"
if not exist "%MODULE_ROOT%\Assets\js\bundles"  mkdir "%MODULE_ROOT%\Assets\js\bundles"
if not exist "%MODULE_ROOT%\Assets\js\builder"  mkdir "%MODULE_ROOT%\Assets\js\builder"
if not exist "%MODULE_ROOT%\Assets\js\plugins"  mkdir "%MODULE_ROOT%\Assets\js\plugins"
if not exist "%MODULE_ROOT%\Assets\js\locales"  mkdir "%MODULE_ROOT%\Assets\js\locales"
if not exist "%MODULE_ROOT%\Assets\css"         mkdir "%MODULE_ROOT%\Assets\css"
if not exist "%MODULE_ROOT%\Assets\css\plugins" mkdir "%MODULE_ROOT%\Assets\css\plugins"

REM -- [1] DLLs ------------------------------------------------
echo [1/6] Copying DLLs...
SET DLL_DIR=%SOLUTION_DIR%\MegaForm.DNN\bin\Debug\net472
if not exist "%DLL_DIR%\MegaForm.DNN.dll" (
    SET DLL_DIR=%SOLUTION_DIR%\MegaForm.DNN\bin\Release\net472
)
if not exist "%DLL_DIR%\MegaForm.DNN.dll" (
    echo [WARN] MegaForm.DNN.dll not found - build the C# project first in Visual Studio.
    echo        Skipping DLL copy...
) else (
    copy /y "%DLL_DIR%\MegaForm.DNN.dll"  "%DNN_ROOT%\bin\" >nul
    copy /y "%DLL_DIR%\MegaForm.Core.dll" "%DNN_ROOT%\bin\" >nul 2>nul
    for %%F in ("%DNN_ROOT%\bin\MegaForm.DNN.dll") do echo       DNN.dll  %%~tF  (%%~zF bytes)
)
echo.

REM -- [2] Views (ASCX only - CS compiled into DLL) ------------
echo [2/6] Copying Views...
REM Copy all ascx but skip *Old.ascx (backup files)
for %%F in ("%SOLUTION_DIR%\MegaForm.DNN\Views\*.ascx") do (
    echo %%~nF | findstr /i "Old" >nul || copy /y "%%F" "%MODULE_ROOT%\Views\" >nul
)
echo       Views OK
echo.

REM -- [3] Vite bundle (just built above) ----------------------
echo [3/6] Copying JS bundles...
copy /y "%SOLUTION_DIR%\Assets\js\bundles\*.js"     "%MODULE_ROOT%\Assets\js\bundles\" >nul
copy /y "%SOLUTION_DIR%\Assets\js\bundles\*.js.map" "%MODULE_ROOT%\Assets\js\bundles\" >nul 2>nul
for %%F in ("%MODULE_ROOT%\Assets\js\bundles\megaform-builder.js") do (
    echo       megaform-builder.js  %%~tF  (%%~zF bytes)
)
echo.

REM -- [4] JS (all other) --------------------------------------
echo [4/6] Copying JS...
copy /y "%SOLUTION_DIR%\Assets\js\*.js"              "%MODULE_ROOT%\Assets\js\"        >nul
xcopy /y /s /q "%SOLUTION_DIR%\Assets\js\builder\*"  "%MODULE_ROOT%\Assets\js\builder\" >nul
xcopy /y /s /q "%SOLUTION_DIR%\Assets\js\plugins\*"  "%MODULE_ROOT%\Assets\js\plugins\" >nul
xcopy /y /s /q "%SOLUTION_DIR%\Assets\js\locales\*"  "%MODULE_ROOT%\Assets\js\locales\" >nul
echo       JS OK
echo.

REM -- [5] CSS -------------------------------------------------
echo [5/6] Copying CSS...
copy /y "%SOLUTION_DIR%\Assets\css\*.css"            "%MODULE_ROOT%\Assets\css\"        >nul
xcopy /y /s /q "%SOLUTION_DIR%\Assets\css\plugins\*" "%MODULE_ROOT%\Assets\css\plugins\" >nul
echo       CSS OK
echo.

REM -- [6] Embed files -----------------------------------------
echo [6/6] Copying embed files...
copy /y "%SOLUTION_DIR%\Assets\embed*.html" "%MODULE_ROOT%\Assets\" >nul 2>nul
echo       Embed OK
echo.

REM -- Also sync to ASP Core wwwroot ---------------------------
echo [+] Syncing to ASP Core wwwroot...
SET ASP_WWWROOT=%SOLUTION_DIR%\MegaForm.Web\wwwroot\megaform
if exist "%ASP_WWWROOT%" (
    copy /y "%SOLUTION_DIR%\Assets\js\bundles\*.js"      "%ASP_WWWROOT%\js\bundles\" >nul
    copy /y "%SOLUTION_DIR%\Assets\js\*.js"              "%ASP_WWWROOT%\js\"         >nul
    xcopy /y /s /q "%SOLUTION_DIR%\Assets\js\plugins\*"  "%ASP_WWWROOT%\js\plugins\" >nul
    copy /y "%SOLUTION_DIR%\Assets\css\*.css"            "%ASP_WWWROOT%\css\"        >nul
    xcopy /y /s /q "%SOLUTION_DIR%\Assets\css\plugins\*" "%ASP_WWWROOT%\css\plugins\" >nul
    echo       ASP Core wwwroot synced
) else (
    echo       [SKIP] ASP Core wwwroot not found
)
echo.

echo ============================================
echo  Deploy complete!
echo  >> Ctrl+Shift+R in browser to clear cache
echo ============================================
echo.
pause
