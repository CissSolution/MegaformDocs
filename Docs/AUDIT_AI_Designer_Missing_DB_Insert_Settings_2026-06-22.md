# AUDIT: AI Designer tạo form thiếu cấu hình "Database INSERT on submit"

**Ngày audit:** 2026-06-22  
**NgườI thực hiện:** Kimi Code CLI (read-only investigation)  
**Phạm vi:** MegaForm.UI dashboard AI Form Creator, AI Form Assistant (builder chat), MegaForm.Core model/settings, Builder properties panel.  
**Yêu cầu:** Không code — chỉ ghi nhận nguyên nhân, bằng chứng và khuyến nghị.

---

## 1. Tóm tắt vấn đề

NgườI dùng phản ánh: khi tạo form bằng **AI Designer** ( nút "AI Designer" từ Dashboard ), form kết quả **không có** panel cấu hình Database như:

- ✅ / ❌ **Enable database INSERT on submit**
- **Connection name** (vd: `DashboardDatabase`)
- **Database type** (SQL Server / MySQL / PostgreSQL / SQLite)
- **Available form fields** (chip để chèn `:fieldKey`)
- **INSERT SQL**

Trong khi đó, form tạo **thủ công** trong Builder lại có đầy đủ các cấu hình này.

**Kết luận sơ bộ:** AI Designer single-form hiện tại **chưa được thiết kế để sinh/tự động gắn `settings.databaseInsert`**. Chỉ có luồng multi-form `app_batch` (khi user yêu cầu "ứng dụng / hệ thống / app / + DB tables") mới tự động gắn `databaseInsert`, và cũng đang bị lỗi `databaseType` rỗng + cú pháp SQL Server-centric.

---

## 2. Bối cảnh kỹ thuật

### 2.1. Setting Database INSERT được lưu ở đâu?

Cấu hình này thuộc về `FormSettings` trong `MegaForm.Core/Models/FormSchema.cs`:

```csharp
public class FormDatabaseInsertSettings
{
    [JsonProperty("enabled")]           public bool Enabled { get; set; }
    [JsonProperty("connectionKey")]     public string ConnectionKey { get; set; }
    [JsonProperty("databaseType")]      public string DatabaseType { get; set; }
    [JsonProperty("insertSql")]         public string InsertSql { get; set; }
    [JsonProperty("parameterMapping")]  public Dictionary<string, string> ParameterMapping { get; set; }
}
```

Và được khai báo trong `FormSettings`:

```csharp
[JsonProperty("databaseInsert")]
public FormDatabaseInsertSettings DatabaseInsert { get; set; }
```

Khi một form được lưu, nó được serialize vào **2 cột song song** của bảng `MF_Forms`:

| Cột | Nội dung |
|-----|----------|
| `SchemaJson` | `{ "version":"1.0", "fields":[...], "settings":{ "databaseInsert":{...} } }` |
| `SettingsJson` | `{ "databaseInsert":{...}, ... }` |

Runtime `FormDatabaseInsertService` sẽ đọc setting này sau khi submission chính đã lưu vào `MF_Submissions`, rồi thực thi INSERT vào custom table.

### 2.2. Panel Database trong Builder thủ công

Trong `MegaForm.UI/src/builder/properties.ts` (dòng 2369–2450), Builder có panel **"Database (save submission to custom DB)"** với logic:

```ts
function _ensureDbInsert() {
    if (!B.state.schema.settings) B.state.schema.settings = {};
    if (!B.state.schema.settings.databaseInsert)
        B.state.schema.settings.databaseInsert = { enabled: false, connectionKey: '', databaseType: '', insertSql: '', parameterMapping: {} };
    return B.state.schema.settings.databaseInsert;
}
```

Các input HTML id:

- `mf-setting-db-insert-enabled` — checkbox
- `mf-setting-db-insert-conn` — connection name
- `mf-setting-db-insert-dbtype` — database type select
- `mf-setting-db-insert-sql` — INSERT SQL textarea
- `mf-setting-db-insert-fields` — field chips
- `mf-setting-db-insert-sample` — nút "Generate sample SQL"

Khi user tương tác, Builder đánh dấu `B.state.isDirty = true` và khi nhấn Save, `toolbar.ts:buildPayload()` serialize `canonicalSchema.settings` lên server:

```ts
return {
    ...
    SchemaJson:   JSON.stringify(canonicalSchema),
    SettingsJson: JSON.stringify(canonicalSchema.settings || settings),
    ...
};
```

Vậy **form thủ công** có setting DB vì user trực tiếp nhập vào `B.state.schema.settings.databaseInsert`.

---

## 3. Phân tích root cause: Tại sao AI Designer thiếu?

Có **3 luồng AI** khác nhau trong hệ thống. Mỗi luồng xử lý `databaseInsert` khác nhau.

### 3.1. Luồng 1: AI Designer single-form (phổ biến nhất) — HOÀN TOÀN KHÔNG CÓ `databaseInsert`

File: `MegaForm.UI/src/dashboard/ai-form-creator.ts`

#### 3.1.1. System prompt không yêu cầu AI emit databaseInsert cho single form

System prompt `AI_SYSTEM_PROMPT` (dòng 63–164) chỉ định nghĩa 2 output shape:

- **(A) SINGLE FORM:** `{ "schema": {...}, "explain": "..." }`
- **(B) MULTI-FORM APP:** `{ "ops": [{ "op": "app_batch", ... }] }`

Phần mô tả `databaseInsert` chỉ xuất hiện trong phần **app_batch requirements** (dòng 76–84):

> "Each form has `tableName` (auto-wires settings.databaseInsert with INSERT INTO that table)..."

Với single form, AI chỉ được yêu cầu trả về:

```json
{
  "schema": {
    "version":"1.0",
    "title":"...",
    "fields":[...],
    "settings": { "submitButtonText":"Submit", "successMessage":"...", "theme":"default" }
  },
  "explain":"..."
}
```

Không có hướng dẫn nào yêu cầu AI emit `settings.databaseInsert`. Do đó, dù user prompt có nói "lưu vào bảng X", AI single-form cũng không tự sinh ra cấu hình này.

#### 3.1.2. Tab "Database" trong AI Designer modal chỉ là context, không phải config

Trong `ai-form-creator.ts`, có tab Database cho phép user chọn các bảng từ endpoint `AiTools/SqlTables`. Tuy nhiên, selected tables chỉ được append vào system prompt để AI biết dùng `optionsSql` / `masterQuery` cho dropdown — **không có code nào** chuyển selected table thành `settings.databaseInsert`.

#### 3.1.3. Hàm saveAndRedirect chỉ serialize schema.settings đã có

```ts
async function saveAndRedirect(schema: any, mode: 'view' | 'builder', modal: HTMLElement) {
    const payload: any = {
        FormId: 0,
        Title: title,
        SchemaJson: JSON.stringify({ version: '1.0', fields: schema.fields || [], settings: schema.settings || {} }),
        SettingsJson: JSON.stringify(schema.settings || {}),
        ...
    };
    ...
}
```

Nếu AI không trả về `schema.settings.databaseInsert`, payload sẽ không chứa nó. Kết quả: form được lưu mà không có cấu hình DB INSERT.

---

### 3.2. Luồng 2: AI Form Assistant trong Builder (chat) — CHỈ CÓ `databaseInsert` KHI DÙNG `bindToTable`

File: `MegaForm.UI/src/ai-form-assistant/ops.ts` (dòng 1680–1747)

Hàm `opCreateForm()` có hỗ trợ `bindToTable`:

```ts
if (spec.bindToTable && spec.bindToTable.tableName) {
    const { insertSql, mapping } = buildInsertSqlFor(spec, spec.__parsedTables);
    settingsObj.databaseInsert = {
        enabled: true,
        connectionKey: 'DashboardDatabase',
        databaseType: '',          // ← RỖNG
        insertSql,
        parameterMapping: mapping,
    };
    schemaObj.settings = settingsObj;
}
```

Tuy nhiên:

- `databaseType` được set là **rỗng** (`''`). Runtime sẽ fallback, nhưng nếu DB thực tế là SQLite/MySQL/PostgreSQL → có thể lỗi.
- `insertSql` dùng cú pháp `[schema].[table]` và `[column]` — đây là **SQL Server-centric**. Trên SQLite/PostgreSQL/MySQL sẽ lỗi syntax.
- Luồng này chỉ hoạt động trong **builder chat**, không phải **AI Designer modal**.

---

### 3.3. Luồng 3: AI Designer multi-form app_batch — CÓ `databaseInsert` NHƯNG LỖI

File: `MegaForm.UI/src/dashboard/ai-form-creator.ts` (dòng 1700–1716)

Khi user prompt trigger shape (B) `app_batch` ("ứng dụng", "hệ thống", "app", "+ DB tables"...), code xử lý:

```ts
if (f.tableName) {
    const { insertSql, mapping } = buildInsertSql(f);
    settingsObj.databaseInsert = {
        enabled: true,
        connectionKey: 'DashboardDatabase',
        databaseType: '',          // ← RỖNG
        insertSql, parameterMapping: mapping,
    };
    schemaObj.settings = settingsObj;
}
```

Vấn đề tương tự luồng 2:

- `databaseType: ''`
- `insertSql` dùng `[dbo].[Table]` — SQL Server-centric
- Chỉ hoạt động khi user yêu cầu multi-form app, không áp dụng cho single form thông thường.

---

## 4. So sánh: Form thủ công vs AI Designer

| Tiêu chí | Form thủ công (Builder) | AI Designer single-form | AI Designer app_batch / Builder chat bindToTable |
|----------|-------------------------|------------------------|--------------------------------------------------|
| **Enable database INSERT on submit** | Có checkbox | Không có | Có (enabled=true) |
| **Connection name** | User nhập/tự động `DashboardDatabase` | Không được set | `DashboardDatabase` |
| **Database type** | User chọn `SqlServer/MySql/PostgreSql/Sqlite` | Không có | `''` (rỗng) |
| **Insert SQL** | User nhập hoặc "Generate sample SQL" | Không có | AI tự generate |
| **Available form fields chips** | Có | Không có | Không có |
| **Lưu setting** | `toolbar.ts` serialize `canonicalSchema.settings` đã chứa `databaseInsert` | `saveAndRedirect` serialize `schema.settings` nhưng AI không emit `databaseInsert` | `ops.ts` / `ai-form-creator.ts` tự gắn `databaseInsert` |
| **Runtime reliability** | Cao | Không INSERT vào custom DB | Trung bình — lỗi nếu DB không phải SQL Server |

---

## 5. Ảnh hưởng (Impact)

1. **Khách hàng mất chức năng quan trọng:** Form tạo bằng AI không tự động lưu vào custom table như kỳ vọng.
2. **Không nhất quán UX:** Cùng một sản phẩm, form thủ công có panel DB, form AI thì không.
3. **Lỗi runtime tiềm ẩn:** Ngay cả khi dùng app_batch, `databaseType=''` và SQL Server syntax có thể gây lỗi trên SQLite/MySQL/PostgreSQL.
4. **Tăng workload hỗ trợ:** User phải vào Builder sau khi tạo form AI để cấu hình DB thủ công.

---

## 6. Các file/code liên quan

| File | Vai trò |
|------|---------|
| `MegaForm.Core/Models/FormSchema.cs` | Định nghĩa `FormDatabaseInsertSettings` |
| `MegaForm.Core/Services/FormDatabaseInsertService.cs` | Runtime thực thi INSERT sau submission |
| `MegaForm.UI/src/builder/properties.ts:2369–2450` | Panel Database trong Builder thủ công |
| `MegaForm.UI/src/builder/toolbar.ts:320–341` | `buildPayload()` serialize settings thủ công |
| `MegaForm.UI/src/dashboard/ai-form-creator.ts:63–164` | System prompt AI Designer (thiếu DB config cho single form) |
| `MegaForm.UI/src/dashboard/ai-form-creator.ts:1886–1926` | `saveAndRedirect()` lưu form AI single-form |
| `MegaForm.UI/src/dashboard/ai-form-creator.ts:1700–1716` | `app_batch` tự gắn `databaseInsert` nhưng `databaseType=''` |
| `MegaForm.UI/src/ai-form-assistant/ops.ts:1680–1747` | `opCreateForm()` với `bindToTable` — cũng `databaseType=''` |

---

## 7. Khuyến nghị (không code)

### 7.1. P0 — Bổ sung DB config cho AI Designer single-form

1. **Cập nhật system prompt** trong `ai-form-creator.ts:AI_SYSTEM_PROMPT` để khi prompt liên quan đến "lưu vào bảng / save to table / database" thì AI emit:
   ```json
   "settings": {
     "databaseInsert": {
       "enabled": true,
       "connectionKey": "DashboardDatabase",
       "databaseType": "SqlServer",
       "insertSql": "INSERT INTO [dbo].[Table]([Col1],[Col2]) VALUES (:field1, :field2)"
     }
   }
   ```
2. **Hoặc** thêm bước post-process sau khi AI trả về `schema`: phát hiện từ khóa DB/table trong prompt, gọi endpoint để lấy schema bảng, tự build `databaseInsert`.
3. **Hoặc** thêm UI step trong AI Designer modal cho phép user chọn table trước khi generate, sau đó code tự gắn `databaseInsert`.

### 7.2. P1 — Sửa app_batch / bindToTable

4. Không để `databaseType: ''` — cần sniff từ connection string thực tế hoặc yêu cầu AI/user chọn.
5. Dùng provider-aware identifier quoting thay vì hardcode `[]` (SQL Server).
6. Kiểm tra `parameterMapping` được build đúng cho từng dialect.

### 7.3. P2 — Audit & test thêm

7. Kiểm tra bundle deploy: `megaform-dashboard.js` và `megaform-ai-form-assistant.js` đã được build/copy đúng chưa.
8. Test end-to-end:
   - Single-form AI prompt "tạo form đăng ký và lưu vào bảng X" → verify `SettingsJson` có `databaseInsert`.
   - Multi-form app_batch trên SQLite → verify custom table có row sau submit.
9. Kiểm tra per-site `DashboardDatabase` override có thực sự được runtime đọc không.

---

## 8. Kết luận

**Nguyên nhân gốc rễ:** AI Designer single-form chưa được prompt/hướng dẫn để emit `settings.databaseInsert`, và code save của nó cũng không tự động wire form với DB table. Multi-form `app_batch` và builder chat `bindToTable` thì có wire nhưng để `databaseType` rỗng và dùng SQL Server syntax, gây lỗi runtime trên non-MSSQL. Form manual có đủ setting vì builder UI cho phép user nhập trực tiếp vào `FormDatabaseInsertSettings`.

**Mức độ ưu tiên:** P0 — cần bổ sung khả năng sinh DB config cho AI Designer single-form để đảm bảo tính năng này nhất quán giữa các luồng tạo form.
