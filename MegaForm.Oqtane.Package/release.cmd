@echo off
REM Release -- create nupkg and copy to Oqtane packages folder
del /Q "*.nupkg" 2>NUL

REM Use nuget.exe from the oqtane.package folder if available
IF EXIST "..\..\oqtane.framework\oqtane.package\nuget.exe" (
    "..\..\oqtane.framework\oqtane.package\nuget.exe" pack MegaForm.Oqtane.nuspec
) ELSE IF EXIST "%USERPROFILE%\.nuget\nuget.exe" (
    "%USERPROFILE%\.nuget\nuget.exe" pack MegaForm.Oqtane.nuspec
) ELSE (
    echo [MegaForm] nuget.exe not found. Download from https://www.nuget.org/downloads
    exit /b 1
)

REM Copy nupkg to local Oqtane server for testing
IF EXIST "..\..\oqtane.framework\Oqtane.Server\Packages\" (
    XCOPY "*.nupkg" "..\..\oqtane.framework\Oqtane.Server\Packages\" /Y /Q
    echo [MegaForm] Package deployed to Oqtane Packages folder
)
