# Phản biện chiến lược I18N V2 — Từ góc độ kỹ thuật Multi-language & AI Scale

> **Author:** Expert Review (AI + i18n Systems)  
> **Date:** 2026-06-11  
> **Target:** `Docs/I18N_LANGUAGE_EXPANSION_STRATEGY_V2_20260611.md`  
> **Verdict:** V2 vượt trội so với V1 về tính thực chứng (evidence-based), nhưng còn **14 lỗ hổng kỹ thuật và chiến lược** cần vá trước khi triển khai. Dưới đây là phân tích từng điểm.

---

## A. Những điểm V2 làm xuất sắc (giữ nguyên, không sửa)

### A1. Phân biệt "Parity vs Coverage" (§2)
Đây là đóng góp quan trọng nhất của V2. Khái niệm này cần được đưa vào **glossary chính thức** của dự án.

### A2. "Drift-prevention before language addition" (§0, §4)
Sắp xếp đúng thứ tự ưu tiên. Không có pipeline thì 50 ngôn ngữ = 50 zombie catalogs.

### A3. Cost correction (§6)
V1 tính $2,150 cho 44 ngôn ngữ là sai về cấu trúc chi phí. V2 nhận ra **maintenance cost** mới là rủi ro chính. Đúng.

### A4. Verified state (§1.3, Appendix A)
Dùng live measurement thay vì claim. Đây là standard mọi architecture doc nên học.

### A5. "Shared namespace, not shared keyset" (§3.5)
Phân tách client/server catalog đúng. `builder.save` không cần xuất hiện trong C# assembly.

---

## B. 14 lỗ hổng cần vá — Phân tích chi tiết

---

### B1. Literal Linter (P1b) — Heuristic quá yếu, sẽ sinh "noise storm"

**Vấn đề:** V2 đề xuất heuristic "starts with capital, ≥2 words" để bắt un-wrapped literals.  
**Tại sao sai:**
- Bỏ sót: `'submit'`, `'ok'`, `'yes'`, `'required'` — toàn bộ là user-facing, viết thường, 1 từ.
- False positive: `'JSON'`, `'SQL'`, `'URL'`, `'DashboardDatabase'`, `'window.MF_AI'`, `'app_batch'` — technical terms viết hoa.
- Bỏ sót nghiêm trọng: template strings `` `Page ${n} of ${total}` `` — dynamic, nhiều từ, viết hoa chữ P, nhưng heuristic có thể bắt được... trừ khi nó nằm trong function helper.

**Giải pháp tối ưu — Hybrid AST + Heuristic:**
```
Bước 1: Dùng TypeScript Compiler API parse tất cả .ts/.tsx
        → Trích xuất TẤT CẢ StringLiteral và TemplateLiteral
Bước 2: Loại trừ (deny-list):
        - Nằm trong `console.*`, `throw new`, `Error(`, `warn(`, `debug(`
        - Nằm trong CSS class/ID/selector string
        - Nằm trong URL path, API endpoint, file path
        - Nằm trong `typeof`, `instanceof` check
        - Key của object literal (trừ khi key đó cũng là display text)
        - Giá trị của enum (trừ khi enum là display values)
Bước 3: Loại trừ (allow-list tĩnh):
        - "true", "false", "null", "undefined", "NaN", "Infinity"
        - "json", "xml", "html", "css", "sql", "api", "url", "http", "https"
        - "get", "post", "put", "delete", "patch"
        - "localhost", "megaform", "dashboarddatabase", "app_batch"
        - Tất cả từ trong TECH_TERMS_GLOSSARY.md
Bước 4: Còn lại là "candidate literals" → flag để human review
        → Output: `candidate-literals.json` với file path + line + context
Bước 5: Sau mỗi review cycle, bổ sung vào allow-list → "ratchet" như V2 nói
```

**Ước tính lại effort:** 2-3 dev-days (không phải 2 days như V2), vì cần seed deny-list cho ~200 file.

---

### B2. Thiếu "Translation Context" — AI dịch 941 key không có context = sai domain terms

**Vấn đề:** V2 dùng flat JSON, AI dịch batch. Nhưng key `builder.tab.field` trong builder topbar khác với `field.text` trong widget palette. AI không biết context.

**Ví dụ thực tế:**
```json
"builder.flexgrid": "Flex Grid"  // AI dịch: "Lưới Linh Hoạt" (OK)
"widget.flexgrid.convert": "Convert to Flex Grid"  // AI dịch: "Chuyển đổi thành Lưới Linh hoạt"
// Nhưng trong UI builder, "Flex Grid" là proper noun/brand term của feature,
// nên ở nhiều ngôn ngữ nên GIỮ NGUYÊN tiếng Anh: "Flex Grid" không dịch.
```

**Giải pháp — Context-annotated catalog:**
```json
{
  "builder.flexgrid": {
    "value": "Flex Grid",
    "context": "Builder canvas: label for the 12-column grid layout field type. Proper noun, keep in English in most locales.",
    "file": "src/builder/field-plugins/_index.ts:416",
    "screenshot": "qa/screenshots/builder-flexgrid-label.png"
  }
}
```

Khi gọi AI translation, truyền `context` vào prompt:
```
Translate the following UI text. Context: "Builder canvas: label for..."
Key: builder.flexgrid
Value: Flex Grid
Rules: This is a proper noun feature name. Keep in English unless the target language has an established localized equivalent.
```

**Impact:** Giảm ~30% lỗi dịch thuật domain-specific. Effort: 1 day để thêm `context` field vào catalog + update AI prompt.

---

### B3. Thiếu "Dead Key Detection" — Catalog sẽ phình to vĩnh viễn

**Vấn đề:** Khi feature bị xóa, key cũ vẫn nằm trong catalog. Sau 2 năm, 941 keys có thể chứa 200+ dead keys (~20%).

**Ví dụ thực tế:** `builder.tab.ai` đã bị retired theo handoff B69 (`#mf-tab-ai` retired), nhưng key `"builder.ai_tab"` vẫn có thể còn trong catalog.

**Giải pháp — Reverse reference scan:**
```bash
npm run i18n:deadkeys
# Scan tất cả .ts/.tsx/.cs/.razor/.ascx cho t('key'), builderT('key'), L("key")
# Cross-reference với en-US.json
# Output: dead-keys.json (những key có trong catalog nhưng KHÔNG được reference ở bất kỳ đâu)
```

**Policy:** Dead keys được flag trong CI (warning, không fail build — vì có thể là server-only key hoặc dynamic key). Review hàng tháng.

---

### B4. P3 Server — Cần `IMegaFormLocalizer.Format()` với named parameters

**Vấn đề:** V2 đề xuất copy `api.*`/`server.*` slice sang server. Nhưng C# interpolation phức tạp hơn JS rất nhiều.

**Ví dụ:**
```csharp
// Hiện tại trong WorkflowEngine.cs
$"Step '{stepName}' failed: {error}"

// Nếu dịch sang German:
// "Schritt '{stepName}' fehlgeschlagen: {error}"
// Thứ tự parameters có thể đảo: "{error}: Schritt '{stepName}' fehlgeschlagen" (không đúng grammar)
// Nhưng nếu dùng positional format, không thể reorder.
```

**Giải pháp:**
```csharp
public interface IMegaFormLocalizer {
    string L(string key, object args = null);
}

// Usage:
localizer.L("workflow.step_failed", new { stepName, error });
// Catalog: "workflow.step_failed": "Step '{stepName}' failed: {error}"

// German can reorder:
// "workflow.step_failed": "Fehler bei Schritt '{stepName}': {error}"
// Named parameters cho phép reorder tự do.
```

**Effort bổ sung:** Cần viết `MegaFormLocalizer.Format()` tương đương JS `t()` với named interpolation. 1 dev-day.

---

### B5. Locale Variants & Fallback Chain chưa được định nghĩa

**Vấn đề:** V2 không định nghĩa fallback cho regional variants.

**Tình huống:**
- User ở Mexico (`es-MX`) → Không có `es-MX.json` → Fallback theo thứ tự nào?
- User ở Canada (`fr-CA`) → Không có `fr-CA.json` → `fr-FR` hay `en-US`?
- User ở Brazil (`pt-BR`) có sẵn, nhưng `pt-PT` thì sao?

**Giải pháp — BCP-47 Parent Chain:**
```typescript
// detectLocale() enhancement
function resolveLocale(req: string): string {
  const chain = {
    'es-MX': ['es-ES', 'en-US'],
    'es-AR': ['es-ES', 'en-US'],
    'fr-CA': ['fr-FR', 'en-US'],
    'fr-BE': ['fr-FR', 'en-US'],
    'pt-PT': ['pt-BR', 'en-US'],  // Brazilian is parent for now
    'zh-TW': ['zh-CN', 'en-US'],  // Simplified fallback (politically sensitive, make configurable)
    'zh-HK': ['zh-TW', 'zh-CN', 'en-US'],
    'en-GB': ['en-US'],
    'en-AU': ['en-US'],
    'de-AT': ['de-DE', 'en-US'],
    'de-CH': ['de-DE', 'en-US'],
  };
  return chain[req] || [req, 'en-US'];
}
```

**Configurability:** Oqtane/DNN admin có thể override parent chain (quan trọng cho zh-TW/zh-CN).

---

### B6. AI System Prompt Translation — Vấn đề ngầm chết ngườ"}

**Vấn đề:** `ai-form-assistant/tools.ts` chứa ~20 tool descriptions dùng cho function-calling.  
**Ví dụ nguy hiểm:**
```typescript
// tools.ts (function schema gửi cho OpenAI/Claude)
{
  name: "list_sql_tables",
  description: "Lists all tables in the connected database...",
  parameters: { ... }
}
```

Nếu dịch description sang tiếng Nhật và gửi cho GPT-4o:
- GPT-4o hiểu tiếng Nhật → có thể vẫn function-call đúng
- Nhưng nếu dịch sang tiếng Việt/Thái/Bengali, model nhỏ (local models) có thể KHÔNG hiểu
- "List tables" → AI phải emit tool call `list_sql_tables` — nếu description là tiếng Việt, model có thể hiểu sai intent

**Giải pháp — Bilingual tool schema:**
```typescript
// Gửi cả 2 ngôn ngữ trong description
{
  name: "list_sql_tables",
  description: locale === 'en-US' 
    ? "Lists all tables..." 
    : `${t('ai.tool.list_sql_tables')} (Lists all tables in the connected database...)`,
  // Hoặc: gửi English description cho model, nhưng hiển thị translated text cho admin
}
```

**Quy tắc cứng:** Tool descriptions cho LLM function-calling LUÔN gửi bằng English, không dịch. Chỉ dịch phần UI hiển thị cho admin. V2 chưa nêu rõ quy tắc này.

---

### B7. Translation Versioning / Cache Invalidation — "Stale locale" bug

**Vấn đề:** `loadLocale()` cache vào `localStorage`. Khi admin update translation trên server, client vẫn dùng cached version.

**Repro:**
1. User load form → `loadLocale('de-DE')` → lưu vào localStorage
2. Dev deploy `de-DE.json` mới với 50 key sửa
3. User refresh page → vẫn dùng localStorage cũ → thấy old translation
4. Phải hard-refresh (Ctrl+F5) hoặc xóa localStorage

**Giải pháp — Catalog Version Stamp:**
```json
// public/i18n/index.json
{
  "locales": [
    { "code": "de-DE", "version": "20260611-3", "hash": "a3f7e2" }
  ]
}
```

```typescript
// loadLocale()
const cached = localStorage.getItem(`mf-locale-${locale}`);
const cachedMeta = JSON.parse(localStorage.getItem(`mf-locale-${locale}-meta`) || '{}');
if (cached && cachedMeta.version === remoteVersion && cachedMeta.hash === remoteHash) {
  return cached;
}
// else: fetch fresh, cache with new meta
```

**Ngoài ra:** Nếu dùng CDN, dùng `?v={hash}` query param cho cache-busting.

---

### B8. Placeholder Reordering — Flat JSON không hỗ trợ grammar reordering

**Vấn đề:** V2 nói "keep flat JSON for 95%" nhưng không giải quyết parameter reordering.

**Ví dụ:**
```json
"en-US": "{user} created {form} on {date}"
// Japanese grammar: "{date} に {user} が {form} を作成しました"
// Nếu dùng flat JS replacement: user + " created " + form + " on " + date → SAI HOÀN TOÀN
```

**Giải pháp — Staged Migration:**
- Phase 1 (now): Flat JSON với named params. Kỹ sư viết source English theo "SVO-neutral" order:
  ```json
  "audit.created": "Creation: {form} by {user} at {date}"
  ```
- Phase 2 (khi cần reorder): Support ICU MessageFormat cho ~20 keys critical:
  ```json
  "audit.created": "{user} created {form} on {date}",
  "audit.created_ja": "{date}に{user}が{form}を作成しました"
  ```
  Hoặc dùng template engine đơn giản:
  ```typescript
  // Thay vì string replacement, dùng template function
  t('audit.created', {user, form, date}, 
    (locale === 'ja') ? '{date}に{user}が{form}を作成しました' : undefined
  );
  ```

**Quyết định:** Hiện tại giữ flat, nhưng kỹ sư phải viết source English theo cách "reorder-safe" (dùng colon-style như V2 đề xuất).

---

### B9. Estimate Phase 2 quá tối ưu — 3 days không đủ

**V2 nói:** "Phase 2 — Harden the 6 we ship · ~3 days"  
**Thực tế:**
- Full builder-canvas RTL pass: drag-drop x-flip trong canvas không đơn giản. Canvas dùng mouse coordinates, sortablejs, flexgrid resize. Flip x-axis đồng nghĩa với refactor mọi `event.clientX` calculation. **3-5 days**.
- Workflow graph RTL (ReactFlow): ReactFlow có hỗ trợ RTL layout nhưng cần cấu hình `nodeOrigin`, `edgePosition`, `controlsPosition`. **1-2 days**.
- Server externalize `api.*` + wire culture: Refactor ~20 controller files, test trên DNN + Oqtane, đảm bảo không break MegaFormApiController.Save (vừa được fix ở B112). **3-4 days**.
- Native spot-review fr/de/es/pt/ar: Upwork freelancer cần 2-3 ngày turnaround, không phải same-day. **1 day coordination + 2 days wait**.

**Estimate điều chỉnh:** Phase 2 = **7-10 dev-days** (1.5-2 tuần), không phải 3 days.

---

### B10. Thiếu "Dynamic Key" Exception Mechanism

**Vấn đề:** V2 đề xuất gate hard-fail 100%. Nhưng có những key được tạo động:

```typescript
// Không thể static analyze
const key = `builder.mode.${mode}`;
t(key);

// Key từ server response
const errorKey = data.errorKey;  // "api.error.form_not_found"
t(errorKey);

// Widget plugins từ bên thứ ba
plugin.render().forEach(item => t(item.labelKey));
```

**Giải pháp:**
```typescript
// Đánh dấu dynamic key bằng comment directive
// @i18n-dynamic
const key = `builder.mode.${mode}`;
t(key);

// Hoặc dùng API riêng cho dynamic keys
import { tDynamic } from '@i18n';
tDynamic(`builder.mode.${mode}`);  // Gate bỏ qua, nhưng log warning
```

Gate có 2 mode:
- **Strict mode** (CI): Fail trên missing key, warning trên dynamic
- **Audit mode** (nightly): Report dynamic key usage để review

---

### B11. Thiếu "Per-Form Content Translation" trong pipeline

V2 tập trung 100% vào "static chrome catalog" mà bỏ qua Layer B (`schema.translations`).

**Vấn đề:** Builder chưa có "Languages" sub-tab để author `schema.translations`. Oqtane chưa có `MF_FieldTranslations`.

**Impact:** Dù có 50 ngôn ngữ trong static catalog, end-user vẫn không thể dịch label của form field.

**Đề xuất bổ sung:** Phase 2 cần bao gồm:
- Builder "Languages" sub-tab: hiển thị bảng (key | en-US | target locale), cho phép admin edit và lưu vào `schema.translations`
- Oqtane: Thêm `MF_FieldTranslations` table hoặc lưu trực tiếp trong `SchemaJson`
- Runtime: `applyFieldTranslation()` đã có trong `megaform-renderer.ts`, chỉ cần builder UI

**Effort:** 3-4 dev-days.

---

### B12. Thiếu "A/B Testing for Translation"

V2 không đề cập A/B testing. Nhưng trong conversion optimization:
- "Submit" vs "Send" vs "Complete" trong tiếng Anh có conversion rate khác nhau
- "Enviar" vs "Enviar ahora" trong tiếng Tây Ban Nha cũng khác
- Marketing copy trong form templates cần test

**Đề xuất bổ sung:** Lưu translation dưới dạng variant:
```json
"form.submit": {
  "default": "Submit",
  "variants": {
    "v1": "Submit",
    "v2": "Send Now",
    "v3": "Complete"
  }
}
```
Admin chọn variant trong builder. Không cần implement ngay, nhưng nên để lại schema room cho feature này.

---

### B13. Thiếu "Emergency Override" — Admin sửa translation hot

**Tình huống:** Production bug — "Submit" trong `de-DE` bị dịch thành "Absenden" (quá formal), cần sửa thành "Abschicken". Hiện tại phải:
1. Sửa `public/i18n/de-DE.json`
2. Build lại bundle
3. Deploy lên DNN + Oqtane
4. Clear CDN cache
5. Bảo user hard-refresh

**Giải pháp — Translation Override API:**
```typescript
// Admin Dashboard có "Translation Override" panel
// POST /api/MegaForm/i18n/Override
// { locale: "de-DE", key: "form.submit", value: "Abschicken" }
// Lưu vào database (MF_TranslationOverrides)
// Runtime: loadLocale() merge overrides ON TOP OF catalog
```

**Effort:** 1 dev-day cho API + UI. Có thể defer đến Phase 3.

---

### B14. Không có "Translation Memory" trong V2 (V1 có đề cập, V2 bỏ)

V1 §4.3 đề xuất Translation Memory (TM). V2 bỏ hoàn toàn.

**Tại sao cần TM:**
- Key `"builder.save"` = "Save", key `"form.save_draft"` = "Save & Continue Later", key `"live.save"` = "Save"
- Khi dịch sang German: "Speichern", "Entwurf speichern & später fortsetzen", "Speichern"
- TM tự động detect "Save" → "Speichern" và đề xuất consistent translation
- Nếu không có TM, AI có thể dịch:
  - `"builder.save"` → "Speichern"
  - `"live.save"` → "Sichern" (từ khác!)
  - `"widget.grid.save"` → "Speichern"

**Inconsistency** là lỗi phổ biến nhất của AI translation và là điểm native speaker review phát hiện đầu tiên.

**Giải pháp đơn giản:**
```json
// translation-memory.json (auto-generated)
{
  "Save": { "de-DE": "Speichern", "fr-FR": "Enregistrer", "count": 12 },
  "Delete": { "de-DE": "Löschen", "fr-FR": "Supprimer", "count": 8 }
}
```

Before calling AI API:
1. Extract value từ en-US catalog
2. Lookup TM
3. Nếu hit → inject vào prompt: "The word 'Save' should be translated as 'Speichern' based on prior usage in 12 other keys."

**Effort:** ½ day. **ROI:** Cao — giảm inconsistency ~40%.

---

## C. Tổng hợp và lộ trình điều chỉnh

### C1. V2 giữ nguyên (không sửa)
- §0 Thesis (drift-prevention first)
- §2 Parity vs Coverage
- §3.1 Kill duplication (P0)
- §3.5 Shared namespace not keyset
- §6 Cost correction
- §7 Risk register (sequence)

### C2. V2 cần bổ sung / điều chỉnh

| ID | Section | V2 hiện tại | Điều chỉnh đề xuất |
|----|---------|-------------|-------------------|
| B1 | P1b | Heuristic literal linter | AST-based + deny-list + allow-list ratchet |
| B2 | §3.3 | Flat AI translation | Context-annotated catalog + domain glossary injection |
| B3 | §3.2 | 5 checks | Thêm check #6: dead-key detection (warning) |
| B4 | §3.5 | Copy JSON slice | Thêm `IMegaFormLocalizer.Format()` với named params |
| B5 | — | Không có | Thêm BCP-47 parent fallback chain |
| B6 | — | Không có | Rule: AI tool descriptions LUÔN English, chỉ dịch UI |
| B7 | — | Không có | Thêm catalog version stamp cho cache invalidation |
| B8 | §3.4 | Flat JSON 95% | Source English phải viết reorder-safe (SVO-neutral) |
| B9 | §4 Phase 2 | ~3 days | Điều chỉnh lên 7-10 dev-days |
| B10 | §3.2 | Hard-fail gate | Thêm dynamic-key exception mechanism (`tDynamic` / `@i18n-dynamic`) |
| B11 | §4 | Không có | Thêm "Languages" sub-tab trong builder (Phase 2) |
| B12 | — | Không có | Để lại schema room cho translation variants |
| B13 | — | Không có | Translation Override API (Phase 3, 1 day) |
| B14 | — | Bỏ TM | Giữ TM (½ day, ROI cao) |

### C3. Lộ trình điều chỉnh

```
Phase 1 — Drift-Proof Pipeline (1.5 tuần, ~8 dev-days)
  ├── P0: Collapse catalog, delete zombie dir, build-embed (1 day)
  ├── P1a/c/d/e: Hard gate + placeholder parity + script-bleed + version stamp (2 days)
  ├── P1b: AST-based literal linter + deny/allow list (3 days)
  ├── P1b-cont: Seed allow-list against current src/ (1 day)
  ├── TM auto-gen + glossary injection (½ day)
  └── BCP-47 parent chain + dynamic-key exception (½ day)

Phase 2 — Harden 6 Languages (1.5-2 tuần, ~10 dev-days)
  ├── P2: plural() helper + inventory count keys (1 day)
  ├── P3: Server localizer + named param Format() + culture resolution (3 days)
  ├── RTL: builder-canvas drag-drop x-flip + workflow graph RTL (3 days)
  ├── Builder "Languages" sub-tab for per-form content (3 days)
  └── Native spot-review top 6 (async, 1 day coordination)

Phase 3 — Scale & Operations (ongoing)
  ├── tools/i18n-translate.cjs one-command (½ day)
  ├── Translation Override API (1 day)
  ├── Dead-key monthly review (process)
  └── Languages on demand (batch, hours each)
```

---

## D. Kết luận

**V2 là một bản strategy xuất sắc**, đặc biệt ở việc chuyển từ "add languages" sang "prevent drift" và phân biệt parity vs coverage. Nhưng nó vẫn còn **3 lỗ hổng kỹ thuật nghiêm trọng** (B1 literal linter yếu, B4 server named params thiếu, B7 cache invalidation không có) và **11 lỗ hổng chiến lược** (B5-B14) cần bổ sung.

**Khuyến nghị:**
1. Merge B1-B14 vào V2 trước khi bắt đầu implement.
2. Phase 1 effort tăng từ 1 tuần lên **1.5 tuần** (AST linter cần 3 ngày, không phải 2).
3. Phase 2 effort tăng từ 3 ngày lên **1.5-2 tuần**.
4. **Không bắt đầu Phase 3** cho đến khi Phase 1 gate đã chứng minh được nó bắt được un-wrapped literals trong B127 (hoặc B128) mà không cần manual audit.

*Nếu gate không bắt được ít nhất 80% số hardcoded strings mà manual audit tìm thấy, thì gate chưa đủ tốt để tin tưởng.*
