# HANDOFF — FORM CREATION WIZARD (Setup → Fields → Workflow → Design → Publish) → populated builder

> ## ✅✅✅ ALL 4 PRODUCTION UPGRADES SHIPPED + QA ALL PASS on :5000 (2026-06-27, pushed master, AssetVersion B288)
> Order done ④→②→①→③. Commits: **④ af77dfd** (real Oqtane/DNN roles+users in Workflow — server `Permissions/Catalog?formId<=0` → SITE-LEVEL catalog in Oqtane+DNN+Web; `wizard/principals.ts`; qa-wf-roles.mjs), **② 6823d3c** (real template library via `BuilderTemplates/List`; `wizard/templates.ts`; premium = settings.customHtml; qa-templates.mjs form 18), **① d616db8** (full palette from registry — `wizard/field-catalog.ts` builds composite presets from `COMPOSITE_PRESET_META`; Composite field = `{type:'Composite', widgetProps:{preset}}`; curated + "More fields"; qa-palette.mjs form 21), **③ 5e2578c** (PREMIUM EDITABLE in wizard per user demand — `step-fields.premiumFieldsEditor` per-step add/remove; `transform.premiumDto` reconciles customHtml via `@shared/custom-html-insert syncFieldPlaceholders`; qa-premium-edit.mjs form 22 Bulgaria: add 2/remove 1, 4 data-step intact, 0 orphan, added field renders right step). Deploy: dashboard bundle copied to live + Shared DLL B288 swapped + :5000 restarted + verified. ⏳REMAINING refine (next session): standard-template hydrate path coded but UNTESTED (live :5000 only has 2 premium templates, no standard); "Restricted" access scope; deeper premium submit/nav interaction QA; empty-step add edge (insert position). Detail in memory [[project_form_creation_wizard_prep]]. Original plan ↓.


> ## ✅✅ ĐÃ BUILD + PROVEN end-to-end trên :5000 (2026-06-27)
> Module mới `MegaForm.UI/src/dashboard/wizard/` (tách nhỏ: types/transform/save/ui/step-*/preview/index). Nút **"New Form"** (đã làm HREFLESS) → `openFormCreationWizard()` → đi 5 bước → **Create Form** → POST `/api/MegaForm/Form` → redirect `?mfpanel=builder&formId=N` → **builder hiện tại mở populate đầy đủ**. PROVEN `qa5000/qa-wizard.mjs` ALL PASS: tạo form 16 (Row full_name/Email/Phone/Textarea/Rating + Section pageBreak multiPage + theme ocean); builder hiện "PAGE BREAK — STEP 2" + đủ field. Đẹp, bám mock (`qa5000/out/qaw-*.png`). Chỉ build+deploy **dashboard bundle** (builder không đổi).
> ⭐ GOTCHAS đã fix: dashboard ở `?mfpanel=dashboard`; nút New Form bị Blazor nav nuốt → HREFLESS; mock cạnh `AI DESIGNES/postcss.config.mjs` (@tailwindcss/postcss) khiến PostCSS dò ngược lên vỡ build → thêm no-op `MegaForm.UI/postcss.config.cjs`.
> ⏳ TINH CHỈNH còn lại: map approver "Direct Manager"…, review/notify node, "Restricted" scope, collectEmail edge, QA single-page, polish UI.
>
> ## 🎯 PHIÊN SAU — 4 NÂNG CẤP PRODUCTION-GRADE (user yêu cầu 2026-06-27)
> Wizard v1 đã chạy nhưng template + field + role còn hardcode. Phiên sau làm nó **thật**:
>
> ### ① Field wizard KHỚP ĐỦ control MegaForm (hiện chỉ 10 type)
> Catalog đầy đủ ở registry `MegaForm.UI/src/builder/field-plugins/_index.ts` (gọi `FieldPlugins.getByCategory('basic'|'layout'|'plugins')`):
> - **basic**: `Composite` (meta-field, ~20 PRESET ở `renderer/helpers.ts:287-500`: phone/name/name_plus/address/ssn/dob/time/email_confirm/password_confirm/date_range/money/measurement/price_range/full_contact/text/textarea/email/number/url), `Date`, `Select`(native/multi/multi-column), `MultiSelect`, `Radio`, `Checkbox`, `File`, `Rating`(star/emoji/heart/thumbs), `Signature`, `RichText`, `UniqueId`, `Captcha`, `MultiColumnCombo`, `TermsPrivacy`. Legacy: `Text/Textarea/Email/Number/Phone/Url` (= Composite preset).
> - **layout**: `Row`(12-span), `FlexGrid`(12-col), `Html`, `Section`(pageBreak), `Hidden`.  **plugins**: `StripePayment`, `PayPalPayment`.
> → ⭐ Wizard DỰNG palette TỪ registry thay vì list cứng `FIELD_TYPES` trong `wizard/types.ts`. Map đúng: Full Name → `Composite` preset 'name' (KHÔNG phải Row tự chế); Short/Long Text → Composite 'text'/'textarea'. Palette gọn (curated) + nút "more" mở full.
>
> ### ② Template mẫu = TEMPLATE THẬT (standard + premium), bỏ mini hardcode
> Hiện `wizard/types.ts TEMPLATES` = 5 mini cứng. Nạp từ thư viện thật:
> - **`GET /api/MegaForm/BuilderTemplates/List`** → `BuilderTemplateRecord[]` (`MegaForm.Core/Services/BuilderTemplateCatalogStore.cs:14-36`: Id/Slug/Title/Category/Icon/**Fields**/**CustomHtml**/**CustomCss**/**Settings**(customScripts)/Rules/Workflow/theme). Nguồn = `Samples/FormTemplates/*.json` (standard) + `Premium/*.json` (premium).
> - Tái dùng `MegaForm.UI/src/builder/gallery.ts` `normalizeTemplateRecord()`(:445) + `applyTemplateSnapshot()`(:654) (đã chuẩn hoá PascalCase→camelCase, resolve customContent). Bước Setup gọi List → grid template thật theo category → chọn → nạp snapshot vào WizardData.
>
> ### ③ Dùng CẤU TRÚC PREMIUM template (multi-step HOẶC không)
> Premium template mang **customHtml**(shell `data-step` panel) + **customScripts**(`*_wizard`) + **customContent** + **theme/customCss** — KHÔNG chỉ schema. Chọn template premium → "Create Form" emit ĐỦ payload đó vào `settings.*` → builder mở form premium đúng.
> - ⭐ 2 mô hình multi-step: **STANDARD** = `Section pageBreak` (v1 đã làm, schema-driven, sạch); **PREMIUM** = `data-step` panel trong customHtml (custom-shell — dùng `parseWizardStructure`/`fieldStepMap` của [[project_orphan_cleanup_reorder_d1]]). Bước Fields phải biết chế độ: premium → quản step = panel customHtml (dùng hàm session orphan/D1 + `syncFieldPlaceholders`); standard → pageBreak Section. "Có multi-step hoặc không" = premium có thể 1 trang hoặc nhiều `data-step`.
>
> ### ④ Workflow dùng USERS/ROLES THẬT Oqtane & DNN (bỏ hardcode)
> `step-workflow.ts` đang dùng `APPROVAL_ROLES` cứng → KHÔNG resolve lúc chạy (`ApprovalNodeExecutor` chỉ map role/user THẬT, KHÔNG có "manager-of-submitter"). Dùng **principal picker** sẵn có:
> - `MegaForm.UI/src/builder/workflow/wf-principal-picker.ts` `renderPrincipalPicker({formId,kind:'role'|'user',value,onChange})` → `GET /api/MegaForm/Permissions/Catalog?formId=N` (`permissions/api.ts:107`) → `catalog.principals[]` = roles+users THẬT (Oqtane IRole/IUserRepository; DNN Role/UserController) + freetext fallback.
> - ⛔ **CHẶN**: endpoint cần `formId>0` (`MegaFormController.cs:580` BadRequest khi ≤0); wizard chưa có formId. → **(A)** sửa server cho `formId=0` trả catalog site-level, **(B)** thêm `/Permissions/CatalogSite?siteId=N`, **(C)** lưu draft trước bước Workflow. **Khuyến nghị (A)/(B)** — backend change DUY NHẤT đáng kể. Map: role→`candidateRoles[]`, user→`candidateUsers[]`. Bỏ list "Direct Manager" cứng (hoặc giữ làm gợi ý nhưng map sang role THẬT).
>
> **Thứ tự**: ④ (server catalog + picker) → ② (template thật) → ① (full palette) → ③ (premium structure, khó nhất). Mỗi mục build + Visual QA (mở rộng `qa5000/qa-wizard.mjs`).

---

> ## ✅ QUYẾT ĐỊNH ĐÃ CHỐT (user 2026-06-27): GIỮ builder MegaForm hiện tại, CHỈ THÊM wizard 5 bước (port từ mock). KHÔNG thay builder.
> Wizard = **front-end tạo form mỏng** → bước "Create Form" sinh **save-DTO ĐẦY ĐỦ** (schema + settings + theme + workflow + publish) → POST `/api/MegaForm/Form` → redirect `?mfpanel=builder&formId=N` → **builder hiện tại tự load form đã populate hết** để "làm việc tiếp". Builder KHÔNG đổi; chỉ nhận initial schema/settings phong phú hơn.
>
> ### ⭐ STEPS panel multi-step (đã soi kỹ — `mega-form-admin-redesign (10)/components/form-builder-wizard.tsx:714-968`)
> Model mock = **pages tường minh** `formPages: [{id, title, fields: WizardField[]}]`. Cơ chế:
> - bật Multi-step → migrate `fields` phẳng vào `formPages[0]` ("Step 1"); tắt → flatten lại.
> - `addPage` (title "Step N", fields []), `removePage` (min 1), `renamePage` (double-click sửa tên), click step → sửa field của step đó. Mỗi step hiện số field + nút X.
> - **Ánh xạ MegaForm (CHUẨN, không custom-shell)**: mỗi `FormPage[i]` → (i>0 ? 1 field `Section{type:'Section', label:page.title, properties:{pageBreak:true}}` : không) + `page.fields[]`; `settings.multiPage=true`; `showProgressBar` → progress tự bật. ⭐FormPage.title = Section.label = nhãn step. (Đây CHÍNH là "manage steps" sạch — khác premium custom-shell của session trước.)
>
> ### Field-type map (mock palette → MegaForm type) cần khi sinh SchemaJson
> Short Text→`Text`, Long Text→`Textarea`, Email→`Email`, Phone→`Phone`, Number→`Number`, Dropdown→`Select`, Checkbox→`Checkbox`, Date→`Date`, Rating→`Rating`, Full Name→`Row`(2 cột first_name/last_name) hoặc Text. (Builder mock còn Radio/Heading/Paragraph/Divider→`Radio`/`Html`/`Html`/`Section(không pageBreak)`.)


> Mục tiêu: một **wizard tạo form 5 bước** (mock Next.js user đã chuẩn bị) — user đi qua Setup → Fields → Workflow → Design → Publish, bấm **"Create Form"** → form được tạo và **mở builder với TẤT CẢ settings đã populate sẵn**.
> Đây là feature MỚI (codebase CHƯA có wizard tạo form — hiện chỉ có: blank `?new=1`, template gallery, AI creator modal đơn).
> Tài liệu này = kết quả KHẢO SÁT codebase (4 mảng) để map mock → model thật + plan. Mọi file:line bên dưới đã verify trong repo.

---

## 0. MOCK (5 bước) — từ ảnh user gửi
1. **Setup** — Name & template (tên form + chọn template).
2. **Fields** — palette field (Short Text/Long Text/Email/Phone/Number/Dropdown/Checkbox/Date/Rating/Full Name) + danh sách field + **Live Preview** (panel phải). ⭐ Có **toggle "Multi-step form"** + **toggle "Progress bar"**, và khi bật Multi-step → hiện **panel STEPS (Step 1/2/3 + "Add Step")** để gán field vào từng step. Live preview hiện "Step 1 of 3" + tab Step 1/2/3.
3. **Workflow** — Approval chain: toggle "Enable approval workflow", các step (Approve/Review/Notify), approver dropdown ("Direct Manager"…), "Specific person (optional)", "Required", + options "Notify submitter on status change" + "Deadline per step".
4. **Design** — preset (Clean/Ocean/Forest/Sunset/Midnight/Rose/Slate/Violet) + Primary/Accent color (hex) + Font (Inter/Geist/Monospace/Serif) + Corner (Sharp/Slight/Default/Rounded/Pill).
5. **Publish** — Access (Public/Members Only/Restricted) + Response options (Allow anonymous / Collect email / One response per person) + Close Date → **"Create Form"**.

URL mock: `vm-megaform-admin-redesign-1t.vusercontent.net/builder?wizard=1` (v0 preview — chỉ tham chiếu design).

---

## 1. KIẾN TRÚC TỔNG (create → builder populated)
**Luồng:** wizard tích luỹ 1 **payload** qua từng bước → bước cuối POST `/api/MegaForm/Form` → server trả `{formId, moduleId, siteId}` → redirect sang builder URL với formId đó → builder **tự load form đã populate**.

- **Builder boot/populate**: `#mf-builder-root` mang data-* (`data-form-id`, `data-schema-json`, `data-form-status`, `data-api-base`) — [MegaForm.Oqtane.Client/BuilderView.razor:16-35, 229-250]. `builder/core.ts init(cfg)` đọc `cfg.existingSchema` → `state.schema` → render canvas [core.ts:706-755]. Nếu chỉ có formId, builder GET `/api/MegaForm/Form/{id}`.
- **Builder URL** trên :5000 = `?mfpanel=builder&formId=N` (KHÔNG phải `/builder?formId=` — cái đó 404). New blank = `?new=1` [dashboard/index.ts:99-138 getNewFormBuilderUrl].
- **Save DTO** (hợp đồng wizard phải tạo) — [builder/toolbar.ts:273-341 buildPayload]:
  `FormId(0=new), Title, Description, SchemaJson, SettingsJson, ThemeJson, Status, SubmitButtonText, SuccessMessage, RedirectUrl, NotifyEmails, WebhookUrl, EnableCaptcha, RequireAuth, EnableSaveResume, RulesJson, WorkflowJson, PluginScripts[], PluginStyles[]`.
- **Server** POST `/api/MegaForm/Form` [MegaFormController.cs:332-463] (FormId=0→insert, auto-bind module, trả formId+moduleId+siteId); GET `/api/MegaForm/Form/{id}` [:260-292].
- ⚠ **Recommend**: wizard = một surface MỚI (modal toàn màn hoặc `?mfpanel=wizard`), tái dùng `saveEndpoint()`/`buildFetchHeaders()`/`platformCfg()` của `dashboard/ai-form-creator.ts:333-354`. AI creator (`openAiFormCreator`, StudioHost.onApply) là khung gần nhất để adapt.

---

## 2. MAP TỪNG BƯỚC → MODEL THẬT (reuse vs new)

### Bước 1 — Setup → `Title`, `Description`, template
- Chọn template = nạp `SchemaJson` mẫu (template gallery `builder/gallery.ts`). Reuse.

### Bước 2 — Fields → `schema.fields` + Multi-step (CHUẨN, KHÔNG custom-shell)
⭐ **Đây là điểm giao với việc "manage steps" của session trước.** Multi-step CHUẨN (schema-driven) = SẠCH, không dính script coupling như premium custom-shell:
- `settings.multiPage: boolean` (toggle) [core/types.ts:131]. Builder toggle id `mf-setting-multi-page` [fields.ts:239, properties.ts:2257-2266].
- **Step boundary = field `Section` có `properties.pageBreak:true`** [field-plugins/_index.ts:729-740]. **Field membership = VỊ TRÍ** (field giữa 2 page-break Section thuộc step đó) — KHÔNG có `field.step` riêng.
- Renderer `calculatePages()` tự tách trang + tự sinh progress bar khi >1 trang + next/prev [renderer/index.ts:1342-1411, 2152-2233]. `getSectionStepNumber()` [canvas.ts:3128-3137].
- **Panel STEPS của mock = UI MỚI** quản lý các pageBreak Section: thêm step = chèn Section pageBreak; gán field vào step = đặt field giữa các Section đúng; reorder step = di chuyển khối field giữa các Section. **KHÔNG cần thêm schema property** — chỉ toggle `pageBreak` + vị trí.
- ⭐ **Tái dùng được cho cả 2**: panel STEPS này (standard) + step-divider của session trước (`fieldStepMap`/`parseWizardStructure` cho custom-shell premium). Cân nhắc 1 UI "Steps" chung: standard→pageBreak Section; premium→data-step panel.

### Bước 3 — Workflow → `WorkflowJson` (BPMN, có sẵn)
- Model đầy đủ: `WorkflowDefinition{nodes,edges,...}` lưu `WorkflowJson` trên form [WorkflowModels.cs:175, MegaFormModels.cs:40]. Approval node (type 22) config `{candidateRoles,candidateUsers,dueInHours,*SubmissionStatus,notify*}` [WorkflowHumanTaskModels.cs:35]. Runtime `ApprovalNodeExecutor.cs:54`.
- UI hiện = **BPMN canvas đầy đủ** (React Flow) [builder/workflow/index.ts], approval panel `wf-approval.ts:27 renderApprovalConfig`, helpers `wf-approval-config.ts` (normalize/serialize), principal picker `wf-principal-picker.ts:80`.
- **Map mock (approval chain đơn giản)**: cách A (reuse) = sinh **N Approval node tuần tự** + edges "approved"→next→End; approver "Direct Manager" → role; "Specific person" → candidateUsers; "Deadline per step" → dueInHours; "Notify submitter" → notify flags. Cách B (mới) = node "ApprovalChain" gộp nhiều bước (cần executor mới). **Khuyến nghị: cách A** (0 code backend mới).

### Bước 4 — Design → `settings.theme` + `settings.cssOverrides`
- Preset: `settings.theme` (id preset). 16 preset có sẵn [view-designer/settings-popup.ts:88-106]. Map 8 mock: Clean→Default, Ocean→Ocean, Forest→Forest, Sunset→Sunset, Midnight→Midnight, Rose→Rose, Slate→Slate, Violet→Lavender/Berry.
- Màu/Font/Corner → `settings.cssOverrides`: `--mf-primary`(primary), `--mf-c1`(accent), `--mf-font-family`(stack), `--mf-form-radius`/`--mf-input-radius`/`--mf-btn-radius`(px). Corner: Sharp=0, Slight=4-6, Default=8-12, Rounded=16-20, Pill=50. [admin-live/presets.ts:22-216, theme-tab-adapter.ts:40-46]. **Tất cả REUSE** (Theme Designer đã dùng đúng các key này).

### Bước 5 — Publish → DTO + một số field MỚI
- **Reuse**: Access "Members Only" = `RequireAuth:true`; "Public" = `RequireAuth:false` [EntityModels.cs:21, toolbar.ts:337]. Close Date = `ExpiresOnUtc` (ISO UTC) [EntityModels.cs:20] — *toolbar chưa save, cần thêm UI+payload*.
- **MỚI (cần thêm field server-side `FormInfo` + TS types + DTO)**: `AllowAnonymous`, `CollectEmailAddresses`, `AllowOnlyOneResponse` (dedup). Access "Restricted" cũng cần model riêng (permission scope) — chưa có. Anonymous tạm có thể suy từ `RequireAuth=false`.

---

## 3. REUSE vs NEW — tóm tắt
| Mảng | Reuse | New |
|---|---|---|
| Create→builder | saveEndpoint, buildPayload contract, builder boot via data-*/GET | UX shell 5 bước + progressive payload + redirect-with-formId |
| Fields/Multi-step | settings.multiPage, Section pageBreak, renderer pages, fieldStepMap (session trước) | **Panel STEPS** (add/remove/reorder step + assign field) |
| Workflow | WorkflowJson, Approval node + executor, approval config helpers, principal picker | Sinh N Approval node từ chain đơn giản (mapping layer) |
| Design | settings.theme + cssOverrides (16 preset, --mf-* vars) | (chỉ map 8 preset mock → preset thật) |
| Publish | RequireAuth, ExpiresOnUtc | AllowAnonymous, CollectEmailAddresses, AllowOnlyOneResponse (+server fields), Restricted scope |

---

## 4. PLAN ĐỀ XUẤT (phiên sau)
1. **Khung wizard** (mới): surface 5 bước + state tích luỹ payload (1 object). Tái dùng style/host của ai-form-creator. Stepper + Live Preview (preview = render qua `megaform-renderer` với schema/settings hiện thời).
2. **Bước Fields + STEPS panel** (giao với session trước): build panel quản lý pageBreak Section (standard). Đây là phần "manage steps" SẠCH nhất — ưu tiên làm trước vì 0 script coupling.
3. **Bước Design**: map 8 preset + 4 control → settings.theme/cssOverrides (reuse).
4. **Bước Workflow**: mapping chain→N Approval node.
5. **Bước Publish**: RequireAuth + ExpiresOnUtc (reuse) + 3 field mới (cần server change FormInfo + migration + DTO + TS types — đây là phần backend duy nhất đáng kể).
6. **Create**: POST 1 lần → redirect `?mfpanel=builder&formId=N` (đã populate).

⚠ **Lưu ý server**: 3 field Publish mới (AllowAnonymous/CollectEmail/OneResponse) + Restricted cần: cột DB (migration), `FormInfo` (EntityModels.cs), DTO (MegaFormModels.cs), đọc trong SaveForm (MegaFormController.cs), enforce khi render/submit. Build trên :5000 self-contained (stop-process + thay DLL). Phần UI (bước 1-4) thuần JS, deploy nhanh.

---

## 4c. CHI TIẾT 3 BƯỚC Workflow/Design/Publish + ĐIỂM CẦN QUYẾT ĐỊNH (đã soi code 2026-06-27)
**Workflow** (form-builder-wizard.tsx:970-1162) — chain tuyến tính, mỗi `ApprovalNode{role∈APPROVAL_ROLES, name(specific person), type:approve/review/notify, required}` + options `notifySubmitter`, `deadlineDays`.
- ⚠ **Quyết định**: (a) `role` là approver SEMANTIC ("Direct Manager"/"Department Head"/…) — MegaForm Approval dùng `candidateRoles`/`candidateUsers` (role/user THẬT). "Direct Manager" = manager-of-submitter, MegaForm CHƯA resolve native → tạm lưu role string vào candidateRoles (admin map sau) HOẶC build resolver. (b) `type`: approve→Approval node, notify→SendEmail node, review→Approval(read-only?). (c) `required=false` = step optional — MegaForm Approval không có "optional" native. (d) `name` (specific person)→candidateUsers nếu có. (e) `deadlineDays→dueInHours=days*24`; `notifySubmitter`→notify flags / SendEmail cuối tới submitter. → cách A (research): N Approval node tuần tự + End.

**Design** (1164-1295) — REUSE sạch: click preset → `theme=id` + `primaryColor=colors[0]`; `primaryColor→--mf-primary`, `accentColor→--mf-c1`, `fontStyle(inter/geist/mono/serif)→--mf-font-family` (map sang stack), `roundness(none/sm/md/lg/full = Sharp/Slight/Default/Rounded/Pill)→--mf-form/input/btn-radius` (0/4-6/8-12/16-20/50). 8 preset THEMES (clean/ocean/forest/sunset/midnight/rose/slate/violet, colors=[primary,dark,surface]) → map sang preset MegaForm.

**Publish** (1297-end) — `accessLevel public/authenticated/restricted` (authenticated→RequireAuth:true; restricted→**scope MỚI**); `closeDate→ExpiresOnUtc`; `embedEnabled`→embed (có sẵn megaform-embed.js). 3 switch MỚI: `allowAnonymous`, `collectEmail`, `limitOneResponse`.
- ⭐ **`collectEmail` KHÔNG chỉ là flag** — desc "Auto-add email field" → phải CHÈN 1 field Email vào SchemaJson nếu chưa có. (ảnh hưởng schema, không chỉ setting.)

**TÓM TẮT QUYẾT ĐỊNH cần user**: (1) approver "Direct Manager"… map thế nào (role string tạm vs resolver); (2) review/notify node type; (3) optional step; (4) "Restricted" access scope. Design/Publish core = reuse, chỉ cần 3 field server mới + email auto-add.

---

## 4b. MOCK CHẠY LIVE + CONTRACT CHÍNH XÁC (đã dựng + đọc code 2026-06-27)
Mock = `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\mega-form-admin-redesign (10)` (Next.js 16 + React 19 + Radix + Tailwind, pnpm). Chạy: `cd` vào đó → `pnpm install` → `pnpm dev` → **http://localhost:3000**. Đây là **FULL admin/builder redesign** (routes: `/` dashboard, `/builder`, `/builder/settings`, `/builder/workflow`, `/inbox`, `/submissions`, `/submissions/[formId]`, `/templates`, `/theme`), KHÔNG chỉ wizard. Wizard = `components/form-builder-wizard.tsx` (1667 dòng), render trong `app/builder/page.tsx:464` qua `showWizard` (mở bằng nút "New Form"; mock `onComplete(wizardData)` mới chỉ `setShowWizard(false)` — CHƯA wire populate, ta tự nối).

⭐ **CONTRACT wizard tạo ra** (`WizardData`, form-builder-wizard.tsx:102-131) — khớp 1:1 research:
```ts
interface WizardField { id; type; label; required }
interface FormPage   { id; title; fields: WizardField[] }     // multi-step = pages tường minh
interface ApprovalNode { id; role; name; type:'approve'|'review'|'notify'; required }
interface WizardData {
  formName; formDescription; category; template;                          // Setup
  isMultiStep; fields: WizardField[]; formPages: FormPage[]; showProgressBar; // Fields
  approvalEnabled; approvalNodes: ApprovalNode[]; notifySubmitter; deadlineDays; // Workflow
  theme; primaryColor; accentColor; fontStyle; roundness;                 // Design
  accessLevel:'public'|'authenticated'|'restricted'; allowAnonymous; collectEmail; limitOneResponse; closeDate; embedEnabled; // Publish
}
```
**Transform WizardData → MegaForm save-DTO** (bước "Create Form"):
- `formName→Title`, `formDescription→Description`.
- **Fields**: `isMultiStep=false` → `SchemaJson.fields = fields[]`. `isMultiStep=true` → với mỗi `FormPage` chèn 1 `Section{properties.pageBreak:true (trừ page đầu), label: page.title}` rồi tới `page.fields[]`; set `settings.multiPage=true`. (⭐ FormPage.fields = đúng model pageBreak vị-trí của MegaForm; FormPage.title = Section.label = nhãn step.)
- `showProgressBar` → progress bar tự bật khi >1 trang (renderer), không cần field riêng (hoặc thêm `settings.showProgressBar`).
- **Workflow**: `approvalEnabled` → build `WorkflowJson`; mỗi `ApprovalNode` → 1 Approval node (role→candidateRoles, required, type), nối tuần tự + End; `notifySubmitter`→notify flag, `deadlineDays→dueInHours=days*24`.
- **Design**: `theme→settings.theme` (map id); `primaryColor→--mf-primary`, `accentColor→--mf-c1`, `fontStyle→--mf-font-family`, `roundness→--mf-form/input/btn-radius` trong `settings.cssOverrides`.
- **Publish**: `accessLevel:'authenticated'→RequireAuth:true` ('public'→false; 'restricted'→scope mới); `closeDate→ExpiresOnUtc`; `allowAnonymous/collectEmail/limitOneResponse→` 3 field server MỚI.

---

## 5. BỐI CẢNH SESSION TRƯỚC (đã xong, đang live :5000)
Xem [[project_orphan_cleanup_reorder_d1]]: A (dọn orphan), D1 (reorder hit render), submit-guard (wizard premium edit submit lại được — GENERAL 4 wizard), `parseWizardStructure`/`fieldStepMap` (prefix-agnostic, đã survey 5 template premium: common = `data-step` panel + `<h2>` title; intake=không-wizard), builder canvas đã hiện "STEP N·Title" divider. **Multi-step STANDARD (pageBreak Section) của wizard này là model SẠCH, khác hẳn premium custom-shell (script coupling).** Harness QA: `qa5000/{lib-analyze,test-acceptance(22/22),qa-reorder,qa-submit,qa-step-canvas,parseWizardStructure}`.
