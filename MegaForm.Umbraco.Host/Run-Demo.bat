@echo off
setlocal

echo === MegaForm for Umbraco - Local Demo ===

REM Stop stale host processes so build outputs are not locked.
echo Stopping stale MegaForm.Umbraco.Host processes...
taskkill /F /IM MegaForm.Umbraco.Host.exe 2>nul
timeout /t 2 /nobreak >nul

REM Build once before running.
echo Building MegaForm.Umbraco.Host...
dotnet build "%~dp0MegaForm.Umbraco.Host.csproj" -c Debug --nologo
if errorlevel 1 (
    echo Build failed. Fix errors above and rerun.
    exit /b 1
)

REM Run the compiled DLL directly on a predictable URL.
set ASPNETCORE_ENVIRONMENT=Development
set URLS=http://localhost:16474

echo Starting demo at %URLS%
echo Back-office: %URLS%/umbraco
echo   User: admin@local  /  Password: Admin123456!
echo Demo pages:  %URLS%/demo
echo Press Ctrl+C to stop.

dotnet "%~dp0bin\Debug\net10.0\MegaForm.Umbraco.Host.dll" --urls %URLS%
