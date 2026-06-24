#!/bin/bash
set -e

PROJECT_ROOT="/e/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um"
OQTANE_SITE="/e/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0"
NUGET_EXE="$USERPROFILE/.nuget/nuget.exe"

echo "[1/6] Building Oqtane Client..."
cd "$PROJECT_ROOT"
dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj --configuration Release -v quiet

echo "[2/6] Building Oqtane Server..."
dotnet build MegaForm.Oqtane.Server/MegaForm.Oqtane.Server.csproj --configuration Release -v quiet

echo "[3/6] Packing nupkg..."
cd "$PROJECT_ROOT/MegaForm.Oqtane.Package"
"$NUGET_EXE" pack MegaForm.Oqtane.nuspec -NoDefaultExcludes -Verbosity quiet

echo "[4/6] Copying package + static files..."
cp "$PROJECT_ROOT/MegaForm.Oqtane.Package/MegaForm.Oqtane."*.nupkg "$OQTANE_SITE/Oqtane.Server/Packages/"
cp -r "$PROJECT_ROOT/MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/css" "$OQTANE_SITE/Oqtane.Server/wwwroot/Modules/MegaForm/" 2>/dev/null || true
cp -r "$PROJECT_ROOT/MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js" "$OQTANE_SITE/Oqtane.Server/wwwroot/Modules/MegaForm/" 2>/dev/null || true
cp "$PROJECT_ROOT/MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Module.css" "$OQTANE_SITE/Oqtane.Server/wwwroot/Modules/MegaForm/Module.css"
# [v20260608-B90] Copy compiled DLLs to site root so Oqtane loads new code without nupkg reinstall
cp "$PROJECT_ROOT/MegaForm.Oqtane.Server/bin/Release/net10.0/MegaForm.Oqtane.Server.Oqtane.dll" "$OQTANE_SITE/"
cp "$PROJECT_ROOT/MegaForm.Oqtane.Server/bin/Release/net10.0/MegaForm.Core.dll" "$OQTANE_SITE/"
cp "$PROJECT_ROOT/MegaForm.Oqtane.Client/bin/Release/net10.0/MegaForm.Oqtane.Client.Oqtane.dll" "$OQTANE_SITE/"
cp "$PROJECT_ROOT/MegaForm.Oqtane.Shared/bin/Release/net10.0/MegaForm.Oqtane.Shared.Oqtane.dll" "$OQTANE_SITE/"

echo "[5/6] Killing old Oqtane process..."
PID=$(netstat -ano | grep -w 5005 | grep LISTENING | awk '{print $5}' | head -1)
if [ -n "$PID" ]; then
    taskkill //F //PID "$PID" 2>/dev/null || true
    sleep 2
fi

echo "[6/6] Starting Oqtane..."
cd "$OQTANE_SITE"
./Oqtane.Server.exe --urls "http://localhost:5005" > oqtane.log 2>&1 &
sleep 5
NEW_PID=$(netstat -ano | grep -w 5005 | grep LISTENING | awk '{print $5}' | head -1)
if [ -n "$NEW_PID" ]; then
    echo "Oqtane started on port 5005 (PID: $NEW_PID)"
else
    echo "FAILED to start Oqtane. Check oqtane.log"
    cat oqtane.log | tail -20
    exit 1
fi
