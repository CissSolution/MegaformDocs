# MegaForm Cascading SQL Demo — Year → Event

Bundle này chứa toàn bộ những gì cần để dựng lại form **"Cascading SQL Demo - Year then Events"** (FormId 251) trên một site MegaForm khác.

Released as part of MegaForm `01.06.16` (cascading SQL dropdown feature).

## Files

| File | Mục đích |
|---|---|
| `01-create-sample-data-and-proc.sql` | Tạo bảng `dbo.MegaForm_Sample_Events` (14 rows: 2024/2025/2026) + stored proc `dbo.spMegaForm_Sample_GetEventsByYear`. Safe to re-run (idempotent). |
| `02-insert-form-251.sql` | Upsert form row (FormId=251) vào `dbo.MF_Forms` với SchemaJson đầy đủ. |
| `form-251-schema.json` | SchemaJson đã parse + pretty-print — để import qua MegaForm builder UI hoặc inspect. |
| `form-251-row.json` | Toàn bộ row form 251 từ DB (gồm Title, Description, SubmitButtonText, ...). |
| `cascading-demo.html` | Demo page standalone (đặt vào `Portals/_default/Containers/`) — load renderer trực tiếp, không cần đặt form lên DNN tab. |

## Cài đặt

Chạy 2 SQL trên DB chứa MegaForm:

```cmd
sqlcmd -S <server> -d <db> -I -E -i 01-create-sample-data-and-proc.sql
sqlcmd -S <server> -d <db> -I -E -i 02-insert-form-251.sql
```

`-I` (QUOTED_IDENTIFIER ON) bắt buộc vì `MF_Forms` có filtered index `IX_MF_Forms_AppScope`.

Nếu site đã có FormId 251 dùng cho mục đích khác, mở `02-insert-form-251.sql` đổi số (cập nhật cả 4 chỗ).

## Cấu hình field cascading (xem trong SchemaJson)

Field `event` — inline SQL:

```sql
SELECT EventId, EventName + COALESCE(' (' + City + ')', '') 
FROM dbo.MegaForm_Sample_Events 
WHERE EventYear = :year 
ORDER BY EventDate
```

Field `eventSproc` — stored procedure: `spMegaForm_Sample_GetEventsByYear`

Cả 2 field đều `optionsDependsOn: ["year"]` → khi user chọn Year, renderer tự gọi `GET /api/MegaForm/Submit/FieldOptions?formId=251&fieldKey=event&__p__year=2026` để refetch options.

## Yêu cầu trên site đích

- MegaForm version `>= 01.06.16` (cần backend `__p__` param handling + renderer cascade listener).
- HostSetting `MegaForm_Database_ConnectionAlias` = `DashboardDatabase` (hoặc đổi `optionsConnectionKey` trong schema cho khớp alias đã đăng ký).
- Connection alias `DashboardDatabase` trỏ tới DB có chứa bảng `MegaForm_Sample_Events`.

## Demo URL (sau khi cài lên site DNN)

```
http://<host>/Portals/_default/Containers/cascading-demo.html
```

Hoặc đặt form 251 vào một MegaForm module trên DNN tab bình thường.

## Mở rộng thành Year → Month → Event

Thêm field `month` với SQL:
```sql
SELECT DISTINCT MONTH(EventDate) AS m, DATENAME(MONTH, EventDate) AS lbl 
FROM dbo.MegaForm_Sample_Events 
WHERE EventYear = :year 
ORDER BY m
```
`optionsDependsOn: ["year"]`

Sửa field `event`:
```sql
WHERE EventYear = :year AND MONTH(EventDate) = :month
```
`optionsDependsOn: ["year","month"]`
