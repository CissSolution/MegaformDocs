# Seed dữ liệu Oqtane MegaForm — Form 3 & Form 4

Thư mục này chứa script để:
1. Tạo bảng SQL riêng cho 2 form.
2. Cấu hình `databaseInsert` trong `MF_Forms.SettingsJson` để form submit cũng ghi vào bảng riêng.
3. Seed dữ liệu ngẫu nhiên theo đúng schema của từng form.

## Kết nối

Các script kết nối SQL Server Express local qua Windows Authentication:
- Server: `localhost\SQLEXPRESS`
- Database: `Oqtane_MegaForm_Fresh1799`

Nếu cần đổi, sửa chuỗi `CONN_STR` trong các file `.py`.

## Các bước đã thực hiện

### 1. Tạo bảng
```bash
sqlcmd -S "localhost\SQLEXPRESS" -d Oqtane_MegaForm_Fresh1799 -E -i 01_create_tables.sql
```

Tạo ra:
- `dbo.Form_CV_Submissions` — cho Form 4 ("Form co CV")
- `dbo.Form_DownUnder_Submissions` — cho Form 3 ("Down Under")

### 2. Cấu hình databaseInsert
```bash
python 02_configure_dbinsert.py
```

Script cập nhật `SettingsJson` của `MF_Forms` cho `FormId = 3` và `FormId = 4`, thêm mục `databaseInsert` trỏ đến `DashboardDatabase` (fallback về `DefaultConnection` của Oqtane).

### 3. Seed dữ liệu

Chạy thử 20 bản ghi mỗi form:
```bash
python 03_seed_random.py --test
```

Seed đầy đủ 500.000 bản ghi mỗi form:
```bash
python 03_seed_random.py --full
```

Nếu muốn đồng thờighi vào `MF_Submissions` (chậm hơn):
```bash
python 03_seed_random.py --full --with-submissions
```

## Kết quả

Sau khi chạy `--full`:
- `Form_CV_Submissions`: 500.000 rows
- `Form_DownUnder_Submissions`: 500.000 rows

Thờigian seed thực tế: ~90 giây (Form 3: 55s, Form 4: 35s).

## Lưu ý

- Dữ liệu seed chỉ ghi vào các bảng custom. Muốn hiện trên dashboard MegaForm, thêm flag `--with-submissions`.
- Các bảng có thể `TRUNCATE` lại và chạy seed bất cứ lúc nào.
- `databaseInsert` là fail-soft: nếu INSERT vào bảng custom lỗi, submission vẫn được lưu vào `MF_Submissions`.
