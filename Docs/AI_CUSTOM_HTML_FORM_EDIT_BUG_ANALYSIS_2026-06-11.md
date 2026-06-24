# Phân Tích Root Cause: AI Chỉnh Sửa Custom HTML Form Bị "Mất" Fields

**Date:** 2026-06-11  
**Scope:** AI Assistant Form Builder + Custom HTML (Premium) Forms  
**Severity:** 🔴 High — UX Break / Data Integrity  
**Affected Files:** `ops.ts`, `chat.ts`, `DesignPreservationGate.cs`  

---

## 1. Hiện Tượng (Symptom)

Khi dùng AI assistant để chỉnh sửa một form có **custom HTML** (premium form):
- Header màu hồng, icon số 1-6, nút Submit xanh **vẫn hiển thị** → `customHtml` không bị xóa
- Các input fields (Họ và Tên, Email, ...) **không nằm trong layout custom HTML** mà bị đẩy xuống dưới
- Form nhìn như bị "đứt gãy" — có phần đầu custom đẹp nhưng không có input fields ở giữa

**→ Điều này chứng tỏ `customHtml` không bị BLANK/DELETE. Vấn đề là `customHtml` và `schema.fields` bị DESYNC.**

---

## 2. Root Cause Chính Xác

### 2.1 Cơ Chế Custom HTML Form

Trong MegaForm, khi `settings.customHtml` non-empty, **renderer bỏ qua auto-layout** và render theo markup HTML tùy chỉnh. Các field được chèn vào custom HTML qua placeholder syntax:

```html
<div class="mfp-container">
  <div class="mfp-header">...</div>
  {{field:first_name}}
  {{field:email}}
  {{field:phone}}
  <button type="submit">Submit</button>
</div>
```

**Nếu một field có trong `schema.fields` nhưng KHÔNG có `{{field:key}}` trong `customHtml` → field đó INVISIBLE trong custom HTML layout.**

### 2.2 AI Behavior Khi Edit Custom Form

Khi user yêu cầu AI chỉnh sửa form (ví dụ: "thêm field", "đổi form thành booking form", "sửa lại fields"), AI thường emit:

```json
{
  "op": "replace_form_schema",
  "schema": {
    "fields": [ /* fields mới với key mới hoặc key đã đổi */ ],
    "settings": { /* ... */ }
  },
  "preserveCustomizations": true
}
```

**Vấn đề xảy ra ở 2 khả năng:**

#### Khả năng A: AI đổi field keys nhưng không cập nhật customHtml placeholders

AI thêm field mới `full_name` thay vì `first_name` + `last_name`, hoặc `booking_email` thay vì `email`. `customHtml` cũ vẫn chứa `{{field:first_name}}` và `{{field:email}}` — các placeholder này **không match** với keys mới trong `schema.fields`.

→ Các field mới không có placeholder trong customHtml → **INVISIBLE in custom HTML region**
→ Renderer có thể fallback hiển thị chúng ở auto-layout bên dưới (hoặc không hiển thị)

#### Khả năng B: AI emit `replace_form_schema` mà không include đủ fields trong schema

AI chỉ emit một số fields mới và bỏ quên fields cũ. `customHtml` cũ reference các field key cũ (`{{field:old_key}}`) mà không còn tồn tại trong `schema.fields`.

→ Placeholders trong customHtml thành "dead references" → **không render gì**
→ Các field mới không có placeholders → cũng không render trong customHtml

### 2.3 Tại Sao Các Gate Hiện Tại Không Bắt Được Lỗi Này

| Gate | Chức năng | Tại sao không bắt được desync |
|------|-----------|-------------------------------|
| **PRESERVE-001** (`ops.ts:432`) | Block `add_field` khi customHtml non-empty và new key không có `{{field:key}}` | Chỉ kiểm tra `add_field` op, KHÔNG kiểm tra `replace_form_schema` |
| **PRESERVE-002** (`ops.ts:996`) | Block `replace_form_schema` khi không có `preserveCustomizations:true` | Auto-merge back-fill chỉ xảy ra khi new value EMPTY. Nếu AI emit `customHtml` non-empty (dù khác cũ), gate không block |
| **CONVERT-001** (`ops.ts:752`) | Block BLANK `customCss` / `customHtml` / `theme` | Chỉ chặn wipe sang empty string, không chặn replacement với giá trị non-empty khác |
| **DesignPreservationGate** (server) | Block BLANKING design fields | Chỉ so sánh "had design" vs "still has" (non-empty?), không validate content consistency |
| **ASK-DESIGN** (`ops.ts:1800`) | Hỏi user trước khi đụng design | Nếu user chọn B (allow change), AI có thể tự do thay đổi, và không có gate nào kiểm tra placeholder sync |

**Tóm lại:** Tất cả gates bảo vệ khỏi **DELETION** (xóa customHtml/customCss) nhưng **KHÔNG BẢO VỆ khỏi DESYNC** (customHtml và schema.fields không đồng bộ).

---

## 3. Code Evidence

### 3.1 `opReplaceFormSchema` Auto-Merge (ops.ts:1013-1038)

```typescript
// Auto-merge chỉ back-fill EMPTY values. Nếu AI emit customHtml với giá trị
// non-empty (dù khác cũ), auto-merge KHÔNG can thiệp.
const nextSettings = (next.settings && typeof next.settings === 'object') ? next.settings : {};
customisedKeys.forEach(k => {
  const sourceKey = k === 'customHtml' ? (ex.customHtml || ex.CustomHtml) : ...;
  const v = (nextSettings as any)[k];
  const empty = v == null || (typeof v === 'string' && v.length === 0)
              || (typeof v === 'object' && Object.keys(v).length === 0);
  if (empty) (nextSettings as any)[k] = sourceKey;  // Chỉ merge khi EMPTY
});
```

**Bug:** Nếu AI emit `customHtml: "<div>...</div>"` (một markup hoàn toàn mới, không chứa đúng placeholders), auto-merge không back-fill vì giá trị không empty.

### 3.2 `DesignPreservationGate.cs` (server-side)

```csharp
foreach (var f in Fields)
{
    bool hadDesign = IsNonEmpty(GetField(existing, f));
    bool stillHas  = IsNonEmpty(GetField(incoming, f));
    if (hadDesign && !stillHas) r.Violations.Add(f);
}
```

**Bug:** Server chỉ check "có giá trị không" (non-empty?), không check giá trị có chứa đúng `{{field:*}}` placeholders cho tất cả fields trong schema hay không.

### 3.3 System Prompt (chat.ts:272)

```
If customHtml is non-empty, new fields are INVISIBLE at runtime unless
you ALSO update customHtml to include {{field:newkey}}.
```

**Bug:** System prompt chỉ nhắc AI, nhưng **không có enforcement** ở dispatcher hay server. AI có thể "quên" hoặc hallucinate customHtml.

---

## 4. Tại Sao Screenshot Hiển Thị Như Vậy

**Giải thích layout trong screenshot:**

```
┌─────────────────────────────────────┐
│ [Header màu hồng]                   │  ← customHtml renders OK
│ ● ● ●  Rose Blush                   │  ← theme switcher (part of customHtml)
│                                     │
│ ① ② ③ ④ ⑤ ⑥  [icons]              │  ← customHtml renders OK
│                                     │
│ [Submit button]                     │  ← customHtml renders OK (hoặc theme submit)
│                                     │
├─────────────────────────────────────┤
│ Họ và Tên *                         │  ← Auto-layout fallback!
│ [________________]                  │     (field không có trong customHtml)
│ Email *                             │  ← Auto-layout fallback!
│ [________________]                  │
└─────────────────────────────────────┘
```

Các field vẫn hiển thị vì renderer có **auto-layout fallback** khi field không được tìm thấy trong customHtml placeholders. Nhưng chúng bị đẩy xuống dưới vùng custom HTML, tạo ra hiện tượng "form bị đứt gãy".

---

## 5. Cách Reproduce

1. Tạo một form với `theme: "custom"` và `customHtml` chứa các `{{field:field_key_1}}`, `{{field:field_key_2}}`
2. Dùng AI assistant yêu cầu: "thêm field số điện thoại" hoặc "đổi form thành booking form"
3. AI emit `replace_form_schema` với:
   - Fields mới có key khác (ví dụ: `phone_number` thay vì `phone`, `customer_name` thay vì `name`)
   - `preserveCustomizations: true` giữ lại `customHtml` cũ
4. **Kết quả:** `customHtml` vẫn chứa `{{field:name}}`, `{{field:phone}}` nhưng schema.fields giờ có `customer_name`, `phone_number` → **desync → fields invisible in customHtml**

---

## 6. Giải Pháp Đề Xuất

### 6.1 Fix Ngắn Hạn (Hotfix)

**Thêm placeholder consistency validation** vào `opReplaceFormSchema` handler (ops.ts):

```typescript
// BEFORE applying replace_form_schema, validate that customHtml (if preserved)
// contains {{field:key}} placeholders for ALL fields in the new schema.
function validateCustomHtmlPlaceholders(customHtml: string, fields: any[]): string | null {
  if (!customHtml || !fields || fields.length === 0) return null;
  const referencedKeys = Array.from(customHtml.matchAll(/\{\{\s*field\s*:\s*([a-zA-Z0-9_-]+)\s*\}\}/g))
    .map(m => m[1]);
  const fieldKeys = fields.map(f => f.key).filter(Boolean);
  const missing = fieldKeys.filter(k => !referencedKeys.includes(k));
  if (missing.length > 0) {
    return `[PRESERVE-004] The preserved customHtml does not contain {{field:...}} placeholders for these fields: ${missing.join(', ')}. ` +
           `They will be INVISIBLE in the custom layout. Either: (1) include {{field:key}} for each in customHtml; ` +
           `(2) set mergeWithCustomHtml:true to auto-append placeholders; (3) switch to auto-layout by clearing customHtml.`;
  }
  return null;
}
```

Và gọi validation này trong `opReplaceFormSchema`:

```typescript
const customHtmlToUse = nextSettings.customHtml || ex.customHtml;
if (customHtmlToUse && typeof customHtmlToUse === 'string') {
  const validationError = validateCustomHtmlPlaceholders(customHtmlToUse, next.fields);
  if (validationError && !op.forcePlaceholdersMismatch) {
    return { op: op.op, ok: false, message: validationError };
  }
}
```

### 6.2 Fix Trung Hạn

**Tự động append placeholders** khi `mergeWithCustomHtml:true`:

```typescript
if (op.mergeWithCustomHtml && customHtmlToUse) {
  const referencedKeys = /* extract from customHtml */;
  const newFields = next.fields.filter(f => !referencedKeys.includes(f.key));
  if (newFields.length > 0) {
    const placeholders = newFields.map(f => `\n<div class="mf-field-group" data-key="${f.key}">{{field:${f.key}}}</div>`).join('');
    nextSettings.customHtml = String(customHtmlToUse) + placeholders;
  }
}
```

### 6.3 Fix Dài Hạn (Architectural)

1. **Server-side `CustomHtmlValidator`** — Trong `DesignPreservationGate` hoặc `MegaFormController.Save`, validate rằng `customHtml` chứa placeholders cho tất cả fields trong schema. Nếu không, reject save với lỗi rõ ràng.

2. **AI System Prompt Enhancement** — Thêm rule cụ thể:
   ```
   BEFORE emitting replace_form_schema on a customHtml form, ALWAYS call
   inspect_form_customizations to get fieldKeysReferencedInCustomHtml.
   If your new schema introduces field keys NOT in that list, you MUST either:
   (a) update customHtml to add {{field:newkey}} placeholders, OR
   (b) set mergeWithCustomHtml:true (which auto-appends them).
   ```

3. **Renderer Fallback Enhancement** — Nếu field không có trong customHtml, renderer nên log warning hoặc hiển thị field ở vị trí "graceful" trong customHtml (ví dụ: append vào cuối container), thay vì đẩy xuống auto-layout hoàn toàn.

---

## 7. Kết Luận

**Root Cause:** AI chỉnh sửa `schema.fields` (thêm/xóa/đổi key) nhưng không đồng bộ cập nhật `{{field:key}}` placeholders trong `customHtml`. Các gate hiện tại (PRESERVE-001/002, CONVERT-001, DesignPreservationGate) chỉ bảo vệ khỏi **BLANKING/WIPING** (xóa trắng customHtml) chứ không bảo vệ khỏi **PLACEHOLDER DESYNC**.

**Impact:** User thấy form "bị hỏng" — header đẹp nhưng không có input fields ở đúng vị trí. Đây là UX bug nghiêm trọng cho premium/custom forms.

**Recommended Immediate Action:** Thêm `PRESERVE-004` validation trong `opReplaceFormSchema` để kiểm tra placeholder consistency trước khi apply.
