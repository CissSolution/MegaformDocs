@echo off
REM Debug -- copy wwwroot assets directly to local Oqtane installation
IF EXIST "..\..\oqtane.framework\Oqtane.Server\wwwroot\Modules\MegaForm\" (
    XCOPY "..\MegaForm.Oqtane.Server\wwwroot\Modules\MegaForm\*.*" "..\..\oqtane.framework\Oqtane.Server\wwwroot\Modules\MegaForm\" /E /Y /Q
    echo [MegaForm] Assets synced to Oqtane debug server
) ELSE (
    echo [MegaForm] Debug path not found -- skipping asset copy
)
