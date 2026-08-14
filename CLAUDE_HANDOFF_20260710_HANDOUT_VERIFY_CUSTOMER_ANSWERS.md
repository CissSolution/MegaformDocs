# HANDOFF — Handout verification + customer capability answers (2026-07-10)

> Session goal (user): continue from `Docs/HANDOUT_Reusable_Workflow_Rules_Grid_2026-07-10.md` (committed `9dc54a0` by Codex),
> and produce honest answers to a prospect's 5 capability questions + a working custom submission filter story.
> The earlier same-day SQL-Server-scale/perf request was **explicitly dropped** by the user ("Codex đã xử lý xong") — do NOT redo perf/index work on submission storage, do NOT seed 1M into DNN.
> **Everything below was verified against real code + live DBs + the running :5120 site — not documentation.** No runtime code was changed this session (docs only).

## 0. TL;DR
- Handout §1 (workflow library) = **accurate, 34/34 claims**. §2 = 22 OK / 2 wrong / **1 CRITICAL scope**. §3 = 24 OK / 6 wrong-misleading / **2 CRITICAL**. 0 fabrications anywhere.
- Fixed the handout in place: added **§0b Verification addendum** (top) + inline corrections at §2.2, §2.9, §3.3, §3.6, title.
- New deliverable for sales: **`Docs/ANSWER_Customer_Capability_Questions_2026-07-10.md`** — plain-language honest answers to the 5 questions with evidence + "what to demo" / "what to quote as customization".
- QA screenshots (real 500K site): `Docs/_verify_2026-07-10_shots/` (inbox filter + public wizard form).
- **DB left clean** — I created then dropped a full-text index on :5120 during the (dropped) perf probe; 4 original indexes restored, verified.

## 1. The 3 CRITICAL findings (act on these)
1. **§3.6 index DDL does not run.** `CREATE INDEX … ON MF_SubmissionValues (FormId, FieldKey, FieldValue)` → `Msg 1919` on BOTH platforms (FieldKey/FieldValue are `nvarchar(MAX)`). Corrected, tested DDL is now inline in §3.6 (covering `(FormId,SubmissionId) INCLUDE(FieldKey,FieldValue)`; DNN value index on `ValueText`; Oqtane needs bounded persisted computed cols).
2. **DataRepeater SQL/stored-proc path is anonymous + no field whitelist.** Verified: `curl` (no cookie) `GET /api/MegaForm/DataRepeater/Query?formId=33&widgetKey=x` → **HTTP 200**; admin twin `Field/TestInsert` → 403; `Submissions` → 403. A §3.5-style support-ticket SQL grid on a **public** page leaks all rows. Only the `megaform_submissions` source applies `fieldWhitelist`. This violates the repo's own CLAUDE.md security rule #3. **Decision left to user** (fixing touches the security surface on 3 platforms and could break the "widget on public page" use case) — do not change auth model unattended.
3. **Server-side rule enforcement is Oqtane-only.** `SubmissionProcessor` 6-arg overload calls `ProcessAsync(…, actor:null, query:null)`. Only Oqtane `MegaFormController.cs:1500-1504` passes real `actor`+`query`. DNN (`SubmissionController.cs:22`), Web (`MegaFormController.cs:694`), Umbraco (`MegaFormApiController.cs:463`) → anonymous principal, so role/permission/query rules + role-scoped FieldRestrictions don't enforce there. Fix = update those 3 controllers to the 8-arg overload.

## 2. Non-critical corrections (already annotated in handout)
- **Role/permission `showIf` does NOT visually hide fields on the published form.** Server never ships roles to the browser: boot script emits `window.__MF_PLATFORM__={platform:'oqtane',apiBase:'/api/MegaForm/',…}` with no roles; `__MF_RULE_CONTEXT__` is never assigned in any `.cs`. **Verified in a real logged-in-as-host browser session on `/templates/classic-registration`: `__MF_RULE_CONTEXT__=undefined`, `roles=[]`.** Field-value ("show B when A=X") logic works fine. The builder UI can only author field-value conditions; role rules = JSON hand-edit.
- **No tabs.** No `Tab` field type / markup / palette item. Equivalent = multi-step wizard (Next/Back). The 4-step "Classic Car Show" wizard screenshot proves multistep works.
- **§2.9 admin bypass** overstated: admins bypass only ShowIf/permission-source rules (`"*"`), NOT the explicit submit gate nor `all_users` field denies.
- **Oqtane EAV empty/un-indexed.** `MF_SubmissionValues` = 0 rows for form 35 (500K). Root cause verified by running the indexer's exact INSERT: `SubmissionIndexerService.InsertRow` inserts `(SubmissionId,FormId,FieldKey,ValueText,ValueNumber,ValueDate)` but Oqtane's `FieldValue` is `NOT NULL` with no default → **`Msg 515`**, swallowed by `SubmissionProcessor.cs:317 catch`. So every EAV write on Oqtane has always failed silently. The 409 existing rows came from the EF `InsertValues` path (FieldValue = whole-JSON, ValueText empty). DNN's EAV is correct + fully indexed (8 indexes). **This is a real bug** — field-value submission grids/reports return blank on Oqtane. Fix = add `FieldValue` to the indexer INSERT (or make the column nullable / drop it). (In scope of "fix" but touches shared indexer used by all platforms — verify DNN/Web still OK.)

## 3. The 5 customer answers (short)
1. Dynamic fields/tabs/sections by role/permission → **PARTIAL**. Field-value logic: full. Role/permission: backend-only (Oqtane), no client visual hide today.
2. Tabbed forms → **NO** (multi-step wizard = yes).
3. Complex workflows → **YES** (Approval/human-task node not on palette yet).
4. Multiple forms → one workflow → **YES** backend (Oqtane tables exist but empty, no admin UI; seed via API/SQL).
5. Custom search/filter grids → **YES** (built-in inbox filters — measured status 27ms/date 28ms on 500K; or `megaform_submissions` whitelist grid). Avoid raw-SQL DataRepeater on public pages (finding #2).
Full text + "what to demo" + "quote as customization" in `Docs/ANSWER_Customer_Capability_Questions_2026-07-10.md`.

## 4. Ground-truth numbers (live, this session)
- `Oqtane_MegaForm_Prod1797` :5120 — MF_Submissions 500,051 (form 35 = 500,000: New 350,248 / Pending 50,020 / Processed 49,872 / Read 49,860). MF_SubmissionValues 409 (0 for form 35). RCSI ON. Compat 160. DataJson/IpAddress/UserAgent = nvarchar(MAX); Status nvarchar(450).
- MF_Submissions indexes (Oqtane): PK + `IX_MF_Submissions_FormId_Status_SubmittedOnUtc` + `IX_MF_Submissions_FormId_SubmittedOnUtc`. MF_SubmissionValues: PK only.
- `DNNQA1799` — RCSI OFF; MF_Submissions bounded types; MF_SubmissionValues 10 cols + 8 indexes; `usp_MF_Submission_List` uses `SELECT s.* … OFFSET`, search via `EXISTS(v.FieldValue LIKE '%x%')` (catch-all predicate → param sniffing).
- Migration trap confirmed: `MegaForm.01.06.00.30` recorded in `__EFMigrationsHistory` but its index absent → Oqtane never runs migration `Up()` bodies (builds schema from EF model via `GenerateCreateScript` + seeds history). Workflow-library migration `01.06.00.38`'s 3 tables DO exist because they're EF model entities in `MegaFormDbContext`.

## 5. Files touched this session
- `Docs/HANDOUT_Reusable_Workflow_Rules_Grid_2026-07-10.md` — added §0b addendum + inline corrections (6 marked spots). **Not committed** (user commits when ready).
- `Docs/ANSWER_Customer_Capability_Questions_2026-07-10.md` — NEW.
- `Docs/_verify_2026-07-10_shots/{inbox-filter-500k,public-form-wizard}.png` — NEW QA evidence.
- No source/runtime code changed. DB restored to original state.

## 6. Next-session options (if user wants)
- Fix the Oqtane EAV indexer INSERT (finding #2.4) — smallest high-value fix; then field-value grids work on Oqtane.
- Lock down DataRepeater SQL endpoints (finding #1.2) — security; needs decision on public-widget model.
- Wire actor+query into DNN/Web/Umbraco submit controllers (finding #1.3) — 3-platform enforcement parity.
- Build workflow-library admin UI + seed a demo template mapping 2 forms (E2E proof for Q4).
