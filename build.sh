#!/bin/bash
# ============================================================
#  MegaForm — Build script (Linux / macOS)
#  Yêu cầu: .NET 9 SDK
#  Cách dùng:
#    ./build.sh           -> Debug build
#    ./build.sh release   -> Release build
#    ./build.sh clean     -> Xóa tất cả bin/obj
# ============================================================

CONFIG="Debug"
if [[ "${1,,}" == "release" ]]; then CONFIG="Release"; fi
if [[ "${1,,}" == "clean" ]]; then
    echo "[MegaForm] Xóa bin/ và obj/..."
    find . -type d \( -name bin -o -name obj \) -exec rm -rf {} + 2>/dev/null
    echo "[MegaForm] Clean xong."
    exit 0
fi

echo ""
echo "[MegaForm] Kiểm tra .NET SDK..."
if ! command -v dotnet &> /dev/null; then
    echo "[LỖI] Không tìm thấy .NET SDK. Tải tại: https://dotnet.microsoft.com/download/dotnet/9.0"
    exit 1
fi
echo "[MegaForm] .NET SDK: $(dotnet --version)"
echo "[MegaForm] Cấu hình build: $CONFIG"
echo ""

# --- Restore ---
echo "[1/3] Restore NuGet packages..."
dotnet restore MegaForm.sln
if [ $? -ne 0 ]; then echo "[LỖI] Restore thất bại!"; exit 1; fi

# --- Build ---
echo ""
echo "[2/3] Build solution ($CONFIG)..."
dotnet build MegaForm.sln -c $CONFIG --no-restore
if [ $? -ne 0 ]; then echo "[LỖI] Build thất bại!"; exit 1; fi

echo ""
echo "[3/3] Kết quả build:"
echo "  Client DLL : MegaForm.Oqtane.Client/bin/$CONFIG/net9.0/MegaForm.Oqtane.Client.Oqtane.dll"
echo "  Server DLL : MegaForm.Oqtane.Server/bin/$CONFIG/net9.0/MegaForm.Oqtane.Server.Oqtane.dll"
echo "  Shared DLL : MegaForm.Oqtane.Shared/bin/$CONFIG/net9.0/MegaForm.Oqtane.Shared.Oqtane.dll"
echo ""
echo "[MegaForm] BUILD THÀNH CÔNG!"
