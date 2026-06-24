# MegaForm — Hướng dẫn Build & Tạo Package

---

## 1. Yêu cầu hệ thống

| Project | Cần cài | Download |
|---------|---------|----------|
| MegaForm.Core | .NET SDK 8.0+ | https://dotnet.microsoft.com/download |
| MegaForm.DNN | .NET SDK 8.0+ **và** .NET Framework 4.7.2 Developer Pack | https://dotnet.microsoft.com/download/dotnet-framework/net472 |
| MegaForm.Oqtane | .NET SDK 8.0 | https://dotnet.microsoft.com/download/dotnet/8.0 |
| MegaForm.Web | .NET SDK 10.0 | https://dotnet.microsoft.com/download/dotnet/10.0 |

Kiểm tra SDK đã cài:
```powershell
dotnet --list-sdks
```

---

## 2. Restore NuGet Packages

NuGet packages được khai báo trong `.csproj`. Chỉ cần 1 lệnh:

```powershell
cd MegaFormSolution
dotnet restore MegaForm.sln
```

Hoặc trong Visual Studio: chuột phải Solution → **Restore NuGet Packages**.

### Danh sách packages theo project

| Project | Package | Version |
|---------|---------|---------|
| **Core** | Newtonsoft.Json | 13.0.3 |
| **DNN** | Newtonsoft.Json | 13.0.3 |
| | Dapper | 2.0.123 |
| **Oqtane** | Newtonsoft.Json | 13.0.3 |
| | Microsoft.EntityFrameworkCore | 8.0.11 |
| | Microsoft.EntityFrameworkCore.SqlServer | 8.0.11 |
| **Web** | Newtonsoft.Json | 13.0.3 |
| | Microsoft.EntityFrameworkCore | 10.0.0 |
| | Microsoft.EntityFrameworkCore.SqlServer | 10.0.0 |

> **Lưu ý**: MegaForm.DNN còn cần DNN DLLs (xem bước 3). Đây KHÔNG phải NuGet packages mà là local DLLs từ bản cài DNN trên máy.

---

## 3. Setup DNN References (chỉ MegaForm.DNN)

DNN DLLs không có trên NuGet. Cần copy từ thư mục `bin/` của DNN website.

### Cách 1: Chạy script (khuyên dùng)
```powershell
cd MegaForm.DNN
.\SetupReferences.bat
```
Script tự tìm DNN trên máy, copy DLLs vào `References/`.

### Cách 2: Thủ công
1. Tìm `bin/` của DNN website (vd: `C:\inetpub\wwwroot\DNN\bin`)
2. Tạo `MegaForm.DNN\References\`
3. Copy vào:

| DLL | Bắt buộc | Mô tả |
|-----|----------|-------|
| DotNetNuke.dll | ✅ | DNN Core API |
| DotNetNuke.Web.dll | ✅ | DnnApiController |
| DotNetNuke.Web.Client.dll | ✅ | ClientResourceManager |
| System.Web.Http.dll | ✅ | ASP.NET Web API 2 |
| System.Web.Http.WebHost.dll | ✅ | Web API hosting |
| System.Net.Http.Formatting.dll | ✅ | JSON formatting |
| DotNetNuke.Instrumentation.dll | ❌ | Tùy chọn |
| DotNetNuke.Log4Net.dll | ❌ | Tùy chọn |

> **Tip**: Thêm `References/` vào `.gitignore` — đã tự động khi chạy script.

---

## 4. Build

### Build toàn bộ solution
```powershell
dotnet build MegaForm.sln -c Release
```

### Build từng project (theo thứ tự dependency)
```powershell
# 1. Core (bắt buộc build trước)
dotnet build MegaForm.Core -c Release

# 2. DNN
dotnet build MegaForm.DNN -c Release

# 3. Oqtane
dotnet build MegaForm.Oqtane -c Release

# 4. .NET 10 standalone
dotnet build MegaForm.Web -c Release
```

### Dependency graph
```
MegaForm.Core  (net472;net8.0)
    ├── MegaForm.DNN     (net472)
    ├── MegaForm.Oqtane  (net8.0)
    └── MegaForm.Web     (net10.0)
```

---

## 5. Tạo Install Package

### 5a. DNN Install Package

```powershell
cd MegaForm.DNN
.\BuildPackage-DNN.bat
```

**Output**: `MegaForm.DNN\Install\MegaForm_01.05.00_Install.zip`

**Package chứa**:
```
MegaForm_01.05.00_Install.zip
├── MegaForm.dnn           ← manifest
├── bin\
│   ├── MegaForm.DNN.dll   ← DNN module
│   └── MegaForm.Core.dll  ← shared core
├── SqlScripts\
│   ├── 01_CreateTables.sql
│   ├── 02_StoredProcedures.sql
│   └── Uninstall.sql
├── Resources.zip           ← Views + Assets
├── License.txt
└── ReleaseNotes.txt
```

**Cài đặt**: DNN → Host → Extensions → Install Extension → Upload ZIP

### 5b. Oqtane Module Package

```powershell
cd MegaForm.Oqtane
.\BuildPackage-Oqtane.bat
```

**Output**: `MegaForm.Oqtane\Install\MegaForm.Oqtane.1.5.0.nupkg`

**Cài đặt**: Oqtane Admin → System → Module Management → Upload

### 5c. .NET 10 Standalone Publish

```powershell
cd MegaForm.Web
.\BuildPublish-Web.bat
```

**Output**: `MegaForm.Web\publish\` — chạy trực tiếp:
```powershell
cd publish
dotnet MegaForm.Web.dll
# Mở: http://localhost:5000
```

**Deploy options**:
- **IIS**: Copy `publish\` → IIS site, Application Pool .NET 10
- **Docker**: `FROM mcr.microsoft.com/dotnet/aspnet:10.0`
- **Azure**: `az webapp deploy`

---

## 6. Dev Workflow — Hot Deploy DNN

Khi dev, không cần tạo package mỗi lần sửa code. Dùng hot deploy:

```powershell
cd MegaForm.DNN
.\Deploy-DNN.bat
```

Script copy trực tiếp DLLs + Views + Assets vào DNN website.
Chỉnh `DNN_ROOT` trong `Deploy-DNN.bat` trước khi chạy.

---

## 7. Tổng hợp Scripts

| Script | Vị trí | Mục đích |
|--------|--------|----------|
| `SetupReferences.bat` | MegaForm.DNN/ | Copy DNN DLLs (chạy 1 lần) |
| `BuildPackage-DNN.bat` | MegaForm.DNN/ | Tạo DNN Install ZIP |
| `Deploy-DNN.bat` | MegaForm.DNN/ | Hot deploy lên DNN (dev) |
| `BuildPackage-Oqtane.bat` | MegaForm.Oqtane/ | Tạo Oqtane .nupkg |
| `BuildPublish-Web.bat` | MegaForm.Web/ | Publish .NET 10 standalone |

---

## 8. Troubleshooting

### ⚠️ "DotNetNuke.dll invalid" khi Add Reference trong VS

Đây là lỗi phổ biến nhất. **KHÔNG dùng Visual Studio GUI** (Add Reference → Browse) để thêm DNN DLLs.

**Lý do**: VS GUI validate assembly metadata. DNN 9.x DLLs có strong name + mixed dependencies mà VS GUI từ chối khi project dùng SDK-style `.csproj`.

**Cách đúng**:
1. Chạy `SetupReferences.bat` để copy DLLs vào `References\`
2. References đã được khai báo sẵn trong `.csproj` bằng XML — **không cần thêm gì qua GUI**
3. Build bằng `dotnet build` hoặc VS Build (Ctrl+Shift+B)

```xml
<!-- Đã có sẵn trong .csproj — KHÔNG xóa, KHÔNG sửa -->
<Reference Include="DotNetNuke">
  <HintPath>References\DotNetNuke.dll</HintPath>
  <Private>false</Private>
  <SpecificVersion>false</SpecificVersion>  <!-- Quan trọng! -->
</Reference>
```

**Key points**:
- `SpecificVersion=false` — bỏ qua version check, chấp nhận mọi version DNN 9.x
- `Private=false` — không copy DLL vào output (DNN đã có sẵn trong bin/)
- `HintPath` relative tới `MegaForm.DNN/` project folder

| Lỗi | Nguyên nhân | Cách fix |
|-----|-------------|----------|
| `DotNetNuke.dll not found` | Chưa setup references | Chạy `SetupReferences.bat` |
| `net472;net8.0 not found` | Thiếu SDK | Cài .NET SDK 8.0+ |
| `net472 targeting pack not found` | Thiếu .NET Framework | Cài .NET 4.8 Developer Pack |
| `MegaForm.Core.dll not found` | Chưa build Core | `dotnet build MegaForm.Core -c Release` |
| EF Core version mismatch | NuGet cache cũ | `dotnet restore --force` |
| Assets không hiển thị | Chưa copy Assets | Kiểm tra script đã copy đúng vị trí |
| ASCX parse error | Namespace thay đổi | Xem `Inherits=` trong ASCX phải là `MegaForm.DNN.xxx` |
