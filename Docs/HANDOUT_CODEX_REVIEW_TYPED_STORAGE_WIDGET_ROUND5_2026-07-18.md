# Handout Codex Review - Typed Storage Widget (Round 5: B1 FileUpload + B3 Diagnostics)

Date: 2026-07-18
Author: Claude (autonomous session, owner away)
Scope: tong ket DA LAM / CHUA LAM sau khi thuc thi B1 + B3, de Codex source-audit.
Ke tiep: `Docs/REQUEST_CODEX_AUDIT_TYPED_STORAGE_WIDGET_ROUND4_2026-07-18.md` (Round 4).

## Commits tren nhanh `feature/typed-submission-storage-core` (CHUA push)
- `a969c25` widget-semantics + browser/SQL acceptance (11 file)
- `824b577` B1 - canonicalize FileUpload->File across renderers + upload endpoints
- `e0bbe2a` B3 - admin typed-storage diagnostics endpoint (R3-J partial)
- `d3a8a00` docs - handoff update

## Related docs
- `CLAUDE_HANDOFF_20260718_TYPED_STORAGE_WIDGET_SEMANTICS_FIX.md` (full narrative + progress)
- `Docs/QA_TYPED_STORAGE_WIDGET_ACCEPTANCE_2026-07-18.md` (sub 54 evidence)
- `Docs/DESIGN_TYPED_STORAGE_PHASE3_PLANS_2026-07-18.json` (registry-widening / single-row / R3-J plans, adversarial-verified)

---

## PHAN A - DA LAM (source-auditable, kem file:line)

### A0. Widget-semantics core (Round 4, da audit) - commit a969c25
- `MegaForm.Core/Services/TypedSubmission/SubmissionFieldTypeSemantics.cs` (single source: Canonicalize / IsDisplayOnly / IsFileLike).
- Normalizer canonicalize `SubmissionFieldNormalizer.cs:27`; skip display-only raw==null; empty-json no "null"; SplitRawValue StringifyItem.
- Extractor `SubmissionFileMetaExtractor.cs:72` dung IsFileLike.
- 2 single-row proof tests (Option B). Tong 119 test pass.

### A1. B1 - FileUpload alias END-TO-END (commit 824b577) - LIVE-VERIFIED

**Van de:** FileUpload (emit boi `ProposalStarterService.cs:920`) render thanh input thuong + upload bi tu choi -> extractor fix khong bao gio chay. Phai canonicalize/recognize FileUpload o MOI surface dispatch theo field type.

**Da sua (canonicalize FileUpload->File / IsFileLike):**
1. SSR renderer `MegaForm.Core/Services/FormHtmlRenderer.cs`:
   - `:101` AnyHydrationWidget canonicalize -> FileUpload thanh NATIVE (form SSR-eligible, khong ep JS-rebuild).
   - `:568` render switch canonicalize -> FileUpload di vao `case "File"` (emit `.mf-file-dropzone`).
2. TS renderer (parity, CLAUDE.md 2-renderer rule):
   - MOI `MegaForm.UI/src/renderer/field-type-semantics.ts` (canonicalizeFieldType - twin cua Core Canonicalize).
   - `MegaForm.UI/src/renderer/inputs.ts:491` `switch (canonicalizeFieldType(field.type))`.
   - `MegaForm.UI/src/renderer/megaform-renderer.ts:1919` `switch (canonFieldType(field.type))` (helper inline vi bundle IIFE khong co ES import).
3. **Upload endpoint file-field check (3-platform twin):** truoc chi nhan `File||PdfForm` -> FileUpload bi **400 "Invalid file field"**. Sua thanh `SubmissionFieldTypeSemantics.IsFileLike(f.Type)`:
   - Oqtane `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:1713` (committed)
   - Web `MegaForm.Web/Controllers/MegaFormController.cs:1100` (committed)
   - DNN `MegaForm.DNN/WebApi/MegaFormApiController.cs:3224` (**APPLIED nhung KHONG committed** - xem canh bao duoi)

**LIVE evidence :5126 (Oqtane_MegaForm_Fresh1805), submission 56, Form 8 "ZZ FileUpload Alias":**
- FileUpload field render `.mf-file-dropzone` (SSR-native, khong con widget-hydrate placeholder).
- `POST /api/MegaForm/Upload/File` = 200 (truoc 400).
- `MF_SubmissionFields`: proposal_pack FieldType=FileUpload DataType=json HasValue=1.
- `MF_Files`: row moi FieldKey=proposal_pack, proposal-pack.pdf, application/pdf, path form-8/field-proposal_pack/...
- DataJson = `{}` (collapse).
- Build clean: Core (4 TFM) + Oqtane Server (net10) + Web. 119 test pass.

### A2. B3 - Diagnostics endpoint (commit e0bbe2a) - VERIFIED (gate)
- MOI `MegaForm.Oqtane.Server/Controllers/MegaFormController.Diagnostics.cs`.
- `GET /api/MegaForm/Diagnostics/TypedStorage[?smoke=true]` (`:20`), `[Authorize]` + `if (!CanUseAdminPopup()) return Forbid();`.
- Report: loaded Core/Server asm version+path, serverReferencesCoreVersion vs loaded Core (coreMatchesServerRef), interfaceHasCollapseMember (reflection), storeResolved/storeType, supportsDataJsonCollapse. smoke = write/read/delete sentinel submissionId AM (-987654, typed tables khong co FK), error TYPE-only (rule 10), finally DeleteFields.
- **Muc dich:** detect DLL/package mismatch trap (stale Core.dll + new Server.dll disable typed write/collapse am tham).
- :5126 tra **403 unauth** (registered + gated). Authenticated admin -> JSON report (chua test vi host-login script-blocked).

---

## PHAN B - CHUA LAM (defer co ly do, KHONG lam autonomous khi owner vang)

### B2 - Registry widening drift fixes (P1)
- **CHUA lam:** PhoneIntl (canonicalize phonenumberpro/phonepro/phoneintl ve 1 - hien String vs Json), TermsPrivacy (IsConsentLike: Json audit + bool projection), helper IsDataCarrying/IsStructuredJson/IsConsentLike/IsExternalDataDisplay/CanonicalDataTypeFor, route AI DDL classifier `AiToolsController.cs:825-870` + 3 TS skip-set qua registry.
- **Ly do defer:** doi classification (String<->Json) cho type dang dung = regression risk + can judgment ve value-shape (phone e164 scalar vs JSON object). Registry da widen phan AN TOAN qua B1 (renderers + upload endpoints).
- Plan: DESIGN JSON key `registry-widening`.

### B3 con lai - Packaging guard (P0-release) - DA LAM + TESTED (commit 0fe5234)
- `tools/validate-pack.ps1` (MOI): unpack nupkg, FAIL neu (a) thieu DLL bat ky lib\netX; (b) Core.dll thieu ISubmissionDataStore.SupportsDataJsonCollapse (byte-scan #Strings heap -> stale pre-typed Core rot); (c) nupkg version != ModuleInfo.Version; (d) built DLL cu hon source .cs cua project do (bin fs mtime, KHONG dung ZIP DOS-time). Runtime-independent (khong load assembly).
- Version single-source: nuspec `<version>$version$</version>`; `release.cmd` + `pack.cmd` doc VER tu ModuleInfo -> `-Version %VER%` (het drift 5-way). Ca 2 script chay validator lam GATE -> xoa nupkg + abort neu fail.
- **KHONG doi AssemblyVersion** (tranh destabilize) - validator + nuspec-align du chan trap.
- **TEST:** validator FAIL 1.7.107 (thieu member + drift + stale); release.cmd end-to-end PASS pack 1.7.108 (`[PACK-OK]`). nupkg gitignored.
- Codex review: (a) byte-scan 'SupportsDataJsonCollapse' co du tin cay khong (false neg neu member doi ten?); (b) staleness bin-mtime project-scoped co bo sot TFM net9 khong (chi check net10); (c) nen them check Server-referenced-Core-version == packed Core (design goc muon, minh bo vi PS5.1 khong reflection-load net10 duoc).

### B4 - Single-row IsCollection (P1-deferred)
- Defer den reader-switch milestone (dung design). Option B da pin 2 test.

### B5 - DNN smoke (site UP + build-verified, runtime smoke CON LAI)
- `dnn10322_megaclean.ai` THUC RA UP (IIS `DNN10322_MegaClean` Started; timeout truoc = cold-start ~2min). **MegaForm.DNN net472 BUILD-CLEAN voi B1** (3-platform twin compile OK). Deployed DNN Core.dll = 12:00AM (prior twin, CHUA co B1).
- Runtime smoke CON LAI: deploy net472 Core+DNN DLL + renderer JS -> recycle -> seed DNN FileUpload form -> browser submit -> verify DNN parallel-write typed rows + MF_Files. Heavy + keo NamedConnections uncommitted + disrupt cold IIS -> defer. Logic = shared Core da proven tren Oqtane.

### B6 - Round 3 P0 R3-A..E (lon, da phien)
- R3-A Umbraco/Web typed store, R3-B reader facade + direct-insert bypass, R3-C typed update API, R3-D SDK Data/Fields, R3-E backfill wiring. Sequence trong DESIGN JSON.

---

## PHAN C - CANH BAO / VIEC OWNER PHAI XU LY

1. **DNN upload-endpoint twin CHUA commit.** `MegaForm.DNN/WebApi/MegaFormApiController.cs:3224` (IsFileLike) da apply trong working tree NHUNG khong committed vi file mang feature **NamedConnections v20260717-01 uncommitted (Codex) rat lon** (ConnectionsList/Save/Delete). PHAI review NamedConnections roi commit hunk DNN RIENG. 3-platform twin hien = 2/3 committed (Oqtane+Web).
2. JS bundle GITIGNORED (`.gitignore` Assets/js/ + wwwroot/.../js/) -> TS source committed, JS la build-artifact (regenerate boi npm build / pack).
3. Env restored: home :5126 -> Form 1. Form 7/8 + sub 54/56 giu lam evidence.

---

## PHAN D - YEU CAU CODEX REVIEW

1. **B1 correctness:** canonicalize o `FormHtmlRenderer.cs:101/:568` co dung/du khong; co surface dispatch theo field.type nao con SOT ma FileUpload van vo (vd `AppendSummaryRows` FormHtmlRenderer:462 CO Y de nguyen - xac nhan co can khong; `PersistSubmissionFiles`/collect path; `AnyHydrationWidget` khac). Kiem tra IsFileLike o 3 upload endpoint co giu nguyen validation extension/size/content (FileUploadSecurityService) - khong noi long security.
2. **TS parity:** `field-type-semantics.ts` + inline `canonFieldType` (megaform-renderer.ts:1919) + inputs.ts:491 co dong bo voi Core Canonicalize khong; co renderInput/widget-gate thu 3 nao con dispatch FileUpload sai khong.
3. **B3 diagnostics:** endpoint co dung compile + auth (`CanUseAdminPopup`), smoke sentinel co that su self-clean (finally), khong ro ri secret (rule 10 - error type only). Xet co nen them DNN twin diagnostics.
4. **Regression:** canonicalize AnyHydrationWidget co doi SSR-eligibility cua form hien co theo huong xau khong (chi FileUpload/DateTimePicker doi tu widget->native). Co form nao dua vao FileUpload la widget khong.
5. **DNN commit hygiene:** xac nhan hunk IsFileLike DNN tach duoc khoi NamedConnections; danh gia NamedConnections uncommitted co an toan commit khong (rieng viec khac).
6. **Verify claim sub 56** = logic B1 (render + upload IsFileLike + normalizer canonicalize + extractor) co san sinh MF_Files row cho FileUpload (Codex trace source, khong can DB).
7. **Priority/DoD:** xac nhan thu tu con lai (B3-pack truoc push, B2 drift, B6) va tieu chi stamp "widget parity dat" (goi y: B1 done [xong] + DNN smoke + B2 xong hoac ghi ro).

## Ghi chu moi truong (chay lai acceptance)
- Site :5126 folder `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805`, DB `Oqtane_MegaForm_Fresh1805`@`localhost\SQLEXPRESS` SSPI. Home = Module 36 (Setting `MegaForm:FormId`).
- Deploy: hot-swap DLL (Core.dll + MegaForm.Oqtane.Server.Oqtane.dll) vao site root + megaform-renderer.js vao `wwwroot/Modules/MegaForm/js/`; stop Oqtane.Server.exe -> copy -> relaunch `--urls http://localhost:5126`.
- Host login script-BLOCKED (antiforgery) -> seed form qua SQL (clone Form 6) + submit public. Checkbox khong options render empty (required chan submit -> dung required:false). Browser = CDP node thuan (Chrome --remote-debugging-port), khong co MCP browser tool.
