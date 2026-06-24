# HANDOFF — Composite Registry (P0-2) + NEW Layout-tab widgets + Server-validate (P0-3) — 2026-06-16 (autonomous)

> Tiếp nối `HANDOFF_20260616_P0_COMPOSITE_FIXES.md` §2c. Phiên TỰ ĐỘNG (user ra ngoài, uỷ quyền "hoàn thiện theo kế hoạch + triển khai widget composite mới vào Layout tab").
> **TẤT CẢ DONE + QA-proven LIVE trên `Oqtane.MSSQL3` (http://localhost:5070, host/`abc@ABC1024`).** Reply: **Tiếng Việt**.
> Memory: [[project-april-revert-incident-recovery]] (START-HERE), [[project-composite-gd1-done-and-ai-relational]].

## BẢNG TRẠNG THÁI
| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| **P0-2 Composite Registry (gộp 3 nơi → 1)** | ✅ DONE | `helpers.ts` = 1 nguồn; QA parity 14 preset qua `MFCompositeParts` |
| **5 widget composite MỚI vào Layout tab** | ✅ DONE live | date_range/money/measurement/price_range/full_contact ở `mf-pcat-layout`; ảnh `tmp-qa/registry-1-layout-tab.png`, `newwidget-money-canvas.png` |
| **P0-3 Server-side validate composite** | ✅ DONE live (DLL+restart) | 5/5 case QA: valid PASS, mismatch/ssn/money REJECT, no-parts fail-open |
| Cache | `?v=B171` (CHƯA bump) | review = **Ctrl+F5 / incognito** |

**Server đã restart** (Core.dll mới, pid 22500, curl `/` = 200). Backup DLL: `MSSQL3\_megaform_dllbackup_20260616_p3\MegaForm.Core.dll`.

---

## 1) P0-2 — Composite Control Registry (gộp preset về 1 nguồn)
**Trước:** preset/parts định nghĩa rải **4 nơi** → drift: `renderer/helpers.ts COMPOSITE_PRESETS` (authoritative, parts+combine), `builder/field-plugins/_index.ts MF_COMPOSITE_PRESETS` (mirror parts, đã lệch), `builder/composite-designer.ts PRESETS` (mirror nữa), `builder/core.ts COMPOSITE_PALETTE_MAP/LABEL` (alias→preset + label). Thêm 1 preset = sửa 5-6 chỗ.

**Sau (1 nguồn = `renderer/helpers.ts`):**
- `COMPOSITE_PRESETS` (giữ nguyên) = parts + combine.
- **MỚI `COMPOSITE_PRESET_META`** = metadata mỗi preset (label, tileLabel, alias, icon, color, category, sortOrder) + helper `compositePresetKeys() / compositePresetLabel() / compositeTileLabel() / compositeAliasToPresetMap()`.
- **Mọi thứ phái sinh data-driven:**
  - `core.ts`: `COMPOSITE_PALETTE_MAP = compositeAliasToPresetMap()`, label = `compositePresetLabel()` (bỏ 2 literal).
  - `_index.ts`: **loop-register tiles** từ META (existing→`basic`, mới→`layout`); `compositeEffectiveParts` đọc `COMPOSITE_PRESETS`; select inline + `VALID_PRESETS` từ `compositePresetKeys()`. Literal `MF_COMPOSITE_PRESETS` đánh dấu **⚠️DEAD** (không xoá vật lý, không còn đọc).
  - `composite-designer.ts`: `DIAL_CODES = COMPOSITE_DIAL_CODES`; `presetParts` đọc `COMPOSITE_PRESETS`; modal select từ `compositePresetKeys()`. Literal `PRESETS` đánh dấu **⚠️DEAD**.
- **Thêm 1 preset GIỜ = 2 dòng kề nhau trong helpers.ts** (1 entry COMPOSITE_PRESETS parts+combine + 1 row META). Tự có tile + map + 2 select + canvas preview.

**QA parity (tmp-qa/scn-registry-newwidgets.cjs):** `MFCompositeParts` trả parts ĐÚNG cho cả 14 preset (9 cũ + 5 mới); 0 lỗi JS từ code (lưu ý: `_h is not defined` là lỗi SẴN CÓ của trang `/login` Oqtane, KHÔNG phải của ta — stack `login:304`).

## 2) 5 widget composite MỚI (Layout tab) — data-driven
| Preset | Tile (Layout) | Parts | Combine |
|---|---|---|---|
| `date_range` | Date Range | start(date,req) + end(date,req) | "start → end" |
| `money` | Money / Amount | currency(select 9 cur) + amount(number,min0,req) | "USD 100" |
| `measurement` | Measurement | amount(number,req) + unit(select 11) | "5 kg" |
| `price_range` | Price Range | min(number,min0) + max(number,min0) | "100 - 500" |
| `full_contact` | Contact Block | name(req) + email(email,req) + phone(tel) | "name · email · phone" |

**QA (tmp-qa/scn-newwidget-render.cjs):** `createFieldFromTemplate('CompositeMoney')` → `{type:'Composite',preset:'money'}`; canvas `mf-composite-preview` cellCount=2 (currency+amount); inline editor select = **14 option** (có money/date_range); summary "Currency select / Amount number". 0 lỗi.

## 3) P0-3 — Server-side per-part validation
**Client (`renderer/validation.ts collectFormData`):** thêm `data['__mf_parts'] = { fieldKey: { partKey: value } }` (đọc `[data-mf-part]` trong `.mf-field-group`). Additive — DataJson lưu vẫn là combined.
**Server (3 file C#, fail-OPEN):**
- **MỚI `Core/Services/CompositePresetRegistry.cs`** — `CompositePartRule` + bảng rule per preset (mirror validation-relevant fields từ `helpers.COMPOSITE_PRESETS` authoritative). ⚠️ giữ đồng bộ thủ công khi đổi rule preset.
- `FormValidationService.cs` — `case "Composite"` → `ValidateComposite()` (try/catch nuốt lỗi → không bao giờ chặn submit hợp lệ). Resolve rule: `widgetProps.parts` (nếu author custom) → else registry theo preset. Mirror thứ tự client: required→length→email/number→mask→pattern→matchKey→dateAge. Helper: `ExtractRawParts/ResolveCompositeRules/HumanizePartKey/CalculateAge`.
- `SubmissionProcessor.cs` — `formData.Remove("__mf_parts")` sau Validate, trước lưu (không persist).

**QA (tmp-qa/test-server-validate.ps1, POST `/api/MegaForm/Submit/Post` — anonymous, KHÔNG antiforgery):** form test FormId=5 (INSERT+DELETE sau):
```
1 valid (match)        success=True
2 email MISMATCH       success=False  ec=Email confirm: Emails do not match.
3 ssn BAD format       success=False  ssnf=Ssn: Enter a valid 9-digit SSN.
4 money NEGATIVE       success=False  money1=Amount: minimum 0.
5 no __mf_parts (open) success=True
```

## 4) FILES TOUCHED
| File | Thay đổi |
|---|---|
| `MegaForm.UI/src/renderer/helpers.ts` | +5 preset COMPOSITE_PRESETS + COMPOSITE_PRESET_META + 4 helper fn |
| `MegaForm.UI/src/builder/core.ts` | import registry; maps data-driven (bỏ 2 literal) |
| `MegaForm.UI/src/builder/field-plugins/_index.ts` | import registry; loop tiles; select+VALID_PRESETS+compositeEffectiveParts data-driven; MF_COMPOSITE_PRESETS→DEAD |
| `MegaForm.UI/src/builder/composite-designer.ts` | import registry; presetParts+DIAL_CODES+modal select data-driven; PRESETS→DEAD |
| `MegaForm.UI/src/renderer/validation.ts` | collectFormData gửi `__mf_parts` |
| `MegaForm.Core/Services/CompositePresetRegistry.cs` | **MỚI** — C# rule mirror |
| `MegaForm.Core/Services/FormValidationService.cs` | case Composite + ValidateComposite + helpers |
| `MegaForm.Core/Services/SubmissionProcessor.cs` | strip `__mf_parts` |

**Deploy:** `build-entry.cjs builder` + `renderer` → copy `megaform-builder.js`+`megaform-renderer.js` → MSSQL3 `js/bundles` + `js`. `dotnet build MegaForm.Core -f net10.0` → backup → stop server → copy `MegaForm.Core.dll` → start → 200. Tất cả `?v=B171`.

## 5) ⚠️ CÒN LẠI / FOLLOW-UP (chưa làm)
1. **Alias-type legacy gap (P0-1 mở rộng):** form CŨ lưu field type = alias (`CompositePhone`…) thay vì `Composite` → KHÔNG render composite ở runtime + KHÔNG được server-validate (server `case "Composite"` so type chính xác). Widget DROP mới thì OK (createFieldFromTemplate rewrite→Composite). **Fix đề xuất:** normalize alias→`{type:'Composite',preset}` khi LOAD schema (builder + renderer), không chỉ ở AI/ops.ts.
2. **C# registry drift:** `CompositePresetRegistry.cs` là mirror tay của `helpers.COMPOSITE_PRESETS`. Đổi rule preset phải sửa 2 nơi. Nên codegen TS→C# JSON sau.
3. **Fail-open:** thiếu `__mf_parts` → bỏ qua per-part (combined field-level vẫn chạy). Muốn cưỡng chế tuyệt đối thì reject khi composite có rule mà thiếu parts.
4. **Cross-part so sánh:** date_range end≥start, price_range max≥min CHƯA validate (cần rule mới `gteKey`).
5. **Dead literals** (`MF_COMPOSITE_PRESETS` _index, `PRESETS` composite-designer) đánh dấu DEAD, chưa xoá vật lý.
6. **Drag UX:** reorder COLUMN vẫn qua layout-picker (chưa kéo). Public-form render preset mới: proven-by-construction (cùng path) — chưa chụp ảnh public form thật.
7. **Cache bump:** muốn F5 thường thấy → rebuild loader+Client + restart, bump B171→B172 ở tất cả stamp (làm CUỐI).

## 5b) FOLLOW-UP fixes (theo feedback user, cùng phiên) ✅ DONE live
1. **Address tile → Layout tab.** `COMPOSITE_PRESET_META.address.category` `basic`→`layout` (sortOrder 79) — address là composite component nên thuộc Layout cùng 5 widget mới. (Các composite còn lại: phone/name/name_plus/ssn/dob/time/email_confirm/password_confirm VẪN ở `basic` — đổi 1 dòng category mỗi cái nếu muốn gom hết.)
2. **Composite Designer: đổi Preset → Live Preview tự cập nhật.** `composite-designer.ts renderAll()` GIỜ gọi thêm `renderPreview()` (trước chỉ renderLayoutBar+renderParts+refreshCount → preview tab giữ layout cũ tới khi bấm lại tab). QA `scn-address-preview.cjs`: addrTile=`mf-pcat-layout`, đổi Address→Money thì `previewChanged=true`, preview hiện Currency/Amount (ảnh `addrprev-2-money.png`), 0 lỗi. Rebuild builder + deploy.

## 5c) FOLLOW-UP fidelity fixes (feedback user: builder phải render đúng control) ✅
1. **🐞 RUNTIME BUG — mask không hoạt động.** `interactive.ts bindInteractiveElements()` gọi 9 binder nhưng **KHÔNG gọi `bindMasks()`** (đã import + comment "must run before bindComposites" nhưng call bị mất ở April-revert) → SSN `###-##-####` không format-as-you-type → giá trị thô rồi fail chính pattern của nó. **Fix:** thêm `bindMasks()` trước `bindComposites()`. ⚠️ Deployed (renderer) nhưng CHƯA verify gõ tay trên form thật (public-form render khó headless phiên này) — **nên gõ thử SSN trên 1 form live để xác nhận format**.
2. **Builder canvas layout sai vs runtime.** `canvas.ts` composite preview gộp MỌI part vào 1 hàng + tính width thô (vỡ fraction). **Fix:** group theo `row` (như runtime `inputs.ts`) + dùng `compositeCellStyle` (shared) + sublabel DƯỚI box + override `.mf-composite-preview{align-items:flex-end}` cũ bằng inline `align-items:stretch`. QA `scn-canvas-fidelity.cjs` + ảnh `canvas-fidelity-address.png`: Address = 3 hàng (Street full / Apt full / City|State|ZIP), box fill đủ rộng ✓.
3. **Date/Time separator (DD / MMMM / YYYY).** Thêm `sep?:string` vào `CompositePart`; dob day/month `sep:'/'`, time hour `sep:':'`. Render `<span class="mf-composite-sep">` OUTSIDE box ở **3 nơi**: runtime `inputs.ts`, builder `canvas.ts`, designer `composite-designer.ts renderPreview`. QA: dob `seps=2`, time `seps=1` ✓ (ảnh `canvas-fidelity-dob.png`).
- Files: `interactive.ts`, `canvas.ts`, `inputs.ts`, `composite-designer.ts`, `helpers.ts` (CompositePart.sep + dob/time data). Rebuild renderer+builder, deploy, `?v=B171`.

## 7) ROADMAP & NEXT RESEARCH (gộp 2026-06-16) — xem `FUTURE_PLAN_MEGAFORM_SDK_AND_DOCS.md` §E/§F
2 doc nghiên cứu mới (Kimi) đã gộp vào roadmap chung (FUTURE_PLAN mục E/F):
- `RESEARCH_SDK_API_GAP_AND_FORM_BUILDER_BEST_PRACTICES_2026-06-16.md` — SDK hiện READ-ONLY; thiếu `SubmitAsync/UpdateAsync/DeleteAsync/UpdateFormAsync`, typed `FormSchema`, `IFormRenderer`, server-validate-from-schema, file upload, prefill. Roadmap Phase 1–4. So sánh Form.io/SurveyJS/Typeform (schema=content, renderer thay được, submit API chung).
- `RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md` — **viết form Blazor trên Oqtane vẫn chạy chung với form TS? → CÓ** (schema + submit API shared). Chiến lược A (pure Blazor) vs B (hybrid TS-renderer trong Blazor shell); khuyến nghị B trước.
- **Nối với việc đã làm:** Composite Registry (1 nguồn) + server composite-validation = bước đầu của Phase 1 (server-validate) + "single-source schema". `SubmissionProcessor`+`FormValidationService`+`FormSchema` đã là NỀN cho SDK `SubmitAsync` (chỉ thiếu lớp facade).

### 7b) Câu hỏi user: "làm sao validation/regex/mask KHÔNG vỡ ở các phiên AI khác?" → FUTURE_PLAN §F-resilience
Bug `bindMasks` (call bị mất ở April-revert, không test nào bắt) là lý do. Chiến lược 5-lớp (ưu tiên):
1. ⭐ **Behavioral regression suite** — 1 "kitchen-sink" form (mọi field + composite + rule) + headless runner assert render/mask/client-validate/**server-validate**; chạy trước khi claim DONE (`npm run qa:forms`). Đây là defense mạnh nhất — bắt đúng loại lost-wiring mà unit-test/comment bỏ sót.
2. **Single source + codegen TS→C#** rules (diệt drift `CompositePresetRegistry.cs` hand-mirror).
3. **VALIDATION_INVARIANTS.md + CLAUDE.md checklist** cho mọi phiên (Kimi+Claude): bindMasks phải gọi; registry single-source; verify served-asset; đừng overclaim.
4. Invariant unit-test (bindMasks wired; TS==C# registry). 5. Deploy served-marker verification (chính thức hoá).

## 6) QA scripts (tmp-qa/)
`scn-registry-newwidgets.cjs`, `scn-newwidget-render.cjs`, `scn-registry-form1.cjs`, `scn-diag-h.cjs` (xác minh _h là lỗi /login), `test-server-validate.ps1` (+ `insert-testform.sql`/`cleanup-testform.sql`). Ảnh: `registry-1-layout-tab.png`, `newwidget-money-canvas.png`.
