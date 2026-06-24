@echo off
REM ============================================================
REM  MegaForm - Quick Deploy (dev hot-reload)
REM  Copy DLLs + JS bundles + CSS + Views to DNN site
REM  Chay sau moi lan build C# hoac TS
REM ============================================================

SET DNN_ROOT=C:\inetpub\wwwroot\DNN10221\Website
SET MODULE_ROOT=%DNN_ROOT%\DesktopModules\MegaForm
SET SOLUTION_DIR=%~dp0
SET DLL_DIR=%SOLUTION_DIR%MegaForm.DNN\bin\Debug\net472

echo.
echo ============================================
echo  MegaForm - Quick Deploy
echo  DNN: %DNN_ROOT%
echo ============================================
echo.

REM --- Create directories ---
if not exist "%MODULE_ROOT%\Views" mkdir "%MODULE_ROOT%\Views"
if not exist "%MODULE_ROOT%\Assets\js\bundles" mkdir "%MODULE_ROOT%\Assets\js\bundles"
if not exist "%MODULE_ROOT%\Assets\js\builder" mkdir "%MODULE_ROOT%\Assets\js\builder"
if not exist "%MODULE_ROOT%\Assets\js\plugins" mkdir "%MODULE_ROOT%\Assets\js\plugins"
if not exist "%MODULE_ROOT%\Assets\js\locales" mkdir "%MODULE_ROOT%\Assets\js\locales"
if not exist "%MODULE_ROOT%\Assets\css" mkdir "%MODULE_ROOT%\Assets\css"
if not exist "%MODULE_ROOT%\Assets\css\plugins" mkdir "%MODULE_ROOT%\Assets\css\plugins"

REM --- DLLs ---
echo [1/5] Copying DLLs...
if not exist "%DLL_DIR%\MegaForm.DNN.dll" (
    SET DLL_DIR=%SOLUTION_DIR%MegaForm.DNN\bin\Release\net472
)
copy /y "%DLL_DIR%\MegaForm.DNN.dll" "%DNN_ROOT%\bin\" >nul 2>nul
copy /y "%DLL_DIR%\MegaForm.Core.dll" "%DNN_ROOT%\bin\" >nul 2>nul
echo       DLLs OK

REM --- Views (ASCX) ---
echo [2/5] Copying Views...
copy /y "%SOLUTION_DIR%MegaForm.DNN\Views\*.ascx" "%MODULE_ROOT%\Views\" >nul 2>nul
echo       Views OK

REM --- TS Bundles ---
echo [3/5] Copying JS bundles...
copy /y "%SOLUTION_DIR%Assets\js\bundles\*.js" "%MODULE_ROOT%\Assets\js\bundles\" >nul 2>nul
copy /y "%SOLUTION_DIR%Assets\js\bundles\*.js.map" "%MODULE_ROOT%\Assets\js\bundles\" >nul 2>nul
echo       Bundles OK

REM --- JS (legacy + builder) ---
echo [4/5] Copying JS + CSS...
copy /y "%SOLUTION_DIR%Assets\js\*.js" "%MODULE_ROOT%\Assets\js\" >nul 2>nul
xcopy /y /s /q "%SOLUTION_DIR%Assets\js\builder\*" "%MODULE_ROOT%\Assets\js\builder\" >nul 2>nul
xcopy /y /s /q "%SOLUTION_DIR%Assets\js\plugins\*" "%MODULE_ROOT%\Assets\js\plugins\" >nul 2>nul
xcopy /y /s /q "%SOLUTION_DIR%Assets\js\locales\*" "%MODULE_ROOT%\Assets\js\locales\" >nul 2>nul
copy /y "%SOLUTION_DIR%Assets\css\*.css" "%MODULE_ROOT%\Assets\css\" >nul 2>nul
xcopy /y /s /q "%SOLUTION_DIR%Assets\css\plugins\*" "%MODULE_ROOT%\Assets\css\plugins\" >nul 2>nul
echo       JS + CSS OK

REM --- Summary ---
echo [5/5] Checking files...
echo.
echo  DLL:     %DNN_ROOT%\bin\MegaForm.DNN.dll
for %%F in ("%DNN_ROOT%\bin\MegaForm.DNN.dll") do echo           Size: %%~zF bytes  Modified: %%~tF
echo.
echo  Bundles: %MODULE_ROOT%\Assets\js\bundles\
dir /b "%MODULE_ROOT%\Assets\js\bundles\*.js" 2>nul
echo.
echo ============================================
echo  Deploy complete! Ctrl+F5 in browser.
echo ============================================
echo.
pause
