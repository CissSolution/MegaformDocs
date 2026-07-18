@echo off
REM ============================================================
REM  Release -- LEAN pack (no build) + version single-source + R3-J guard.
REM  This packs whatever DLLs already sit in each project's bin\Release; it does
REM  NOT rebuild. The post-pack validator (..\tools\validate-pack.ps1) ABORTS the
REM  pack if those DLLs are STALE / version-mismatched / missing the typed-storage
REM  contract, so a lean re-pack can no longer silently ship a broken package (the
REM  R3-J trap). For a full clean build+pack, use the root pack.cmd instead.
REM ============================================================
setlocal
del /Q "*.nupkg" 2>NUL

REM -- single-source the package version from ModuleInfo.cs (the one truth) --
REM  (the regex uses '.' for the quote chars to avoid escaped-quote hell inside cmd)
powershell -NoProfile -Command "(Select-String -Path '..\MegaForm.Oqtane.Client\ModuleInfo.cs' -Pattern 'Version = .([0-9.]+).').Matches[0].Groups[1].Value" > "%TEMP%\mfver.txt"
set /p VER=<"%TEMP%\mfver.txt"
del "%TEMP%\mfver.txt" 2>NUL
if "%VER%"=="" ( echo [MegaForm] Khong doc duoc Version tu ModuleInfo.cs & exit /b 1 )
echo [MegaForm] Version = %VER%

set NUGET=
if exist "..\..\oqtane.framework\oqtane.package\nuget.exe" set NUGET=..\..\oqtane.framework\oqtane.package\nuget.exe
if not defined NUGET if exist "%USERPROFILE%\.nuget\nuget.exe" set NUGET=%USERPROFILE%\.nuget\nuget.exe
if not defined NUGET ( echo [MegaForm] nuget.exe not found. Download from https://www.nuget.org/downloads & exit /b 1 )

"%NUGET%" pack MegaForm.Oqtane.nuspec -Version %VER% -NoPackageAnalysis
if errorlevel 1 ( echo [MegaForm] nuget pack failed & exit /b 1 )

REM -- R3-J guard: fail the release if the produced package is stale/mismatched/incomplete --
powershell -NoProfile -ExecutionPolicy Bypass -File "..\tools\validate-pack.ps1" -Nupkg "MegaForm.Oqtane.%VER%.nupkg" -RepoRoot ".."
if errorlevel 1 (
    echo [MegaForm] PACK VALIDATION FAILED -- see [PACK-INVALID] above. Xoa nupkg loi.
    del /Q "MegaForm.Oqtane.%VER%.nupkg" 2>NUL
    exit /b 1
)

REM -- Copy nupkg to local Oqtane server for testing --
if exist "..\..\oqtane.framework\Oqtane.Server\Packages\" (
    xcopy "*.nupkg" "..\..\oqtane.framework\Oqtane.Server\Packages\" /Y /Q
    echo [MegaForm] Package deployed to Oqtane Packages folder
)
endlocal
