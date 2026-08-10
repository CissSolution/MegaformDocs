# Personal Bar C512 + dashboard density — what Claude did, measured

Ngay: 2026-08-09. Nguoi ban giao: Claude. Tiep nhan tu: Codex
(`CLAUDE_HANDOFF_20260809_GALLERY_PERSONABAR_DASHBOARD_DENSITY.md`).

Site QA: `http://megaclean008.ai` (admin / dnnhost), DB `DNN_MegaClean008` tren
`WINDOWS-11\SQLEXPRESS`. Moi con so duoi day deu do bang harness, khong nhin anh.

---

## 1. Ket qua: P0 #1 (Personal Bar) da xong

### 1.1 Root cause that su cua 22 px

Khong phai typography, khong phai padding. B421 an cot bang **media query theo viewport**
(`@media (max-width: 760px)` / `480px`) trong khi **be rong panel do DNN quyet dinh**:

| Viewport | Panel width | Media query nao fire | Table `min-width` |
|---|---:|---|---:|
| 1365 | 860 | khong | 720 (vua) |
| 1024 | **698** | **khong** (1024 > 760) | **720 -> tran 22 px** |
| 390 | 500 (DNN ep) | 480 block | 420 |

Nghia la: o tablet, browser 1024 px nen khong media query nao chay, nhung panel chi 698 px
va bang van doi 720 px. **22 px = 720 - 698.** Cung logic do o phone: block 480 dat
`min-width: 420px` — dung bang con so tran do duoc trong panel 308 px.

### 1.2 Cach sua

Ban dated moi **`MegaForm_20260809_C512`** (khong ghi de B421):

- `.mf-pb-table { min-width: 0 }` — bo hoan toan min-width, ke ca trong 2 media query cu.
- **ResizeObserver do `.mf-pb-table-wrap`** roi gan class len `#megaform-bodyPanel`:
  `mf-pb-w-lg` (>= 780), `mf-pb-w-md` (>= 620), `mf-pb-w-sm` (< 620). Do **panel**, khong do
  browser — day la cau hoi dung.
- Cot bi an se chuyen xuong **meta line** trong o Form (`22 fields · 0 subs · 9/8/2026`),
  luon render san nen resize khong can render lai.
- Phone: `fitPanelWidth()` tu thu nho **panel + header (position:absolute 500px) +
  `.socialpanel-placeholder`** ve `viewport - rail`; chi thu nho, khong bao gio noi rong.
  `box-sizing: border-box` cho panel da fit (1 px border chinh la 1 px tran cuoi cung).
- Khong dung `transform: scale()` hay `zoom` — hit target va popup geometry giu nguyen that.

### 1.3 So do truoc/sau

| | Desktop 1365x675 | Tablet 1024x768 | iPhone 14 390x844 |
|---|---|---|---|
| document overflow B421 | 0 | 0 | **190** |
| document overflow C512 | **0** | **0** | **0** |
| wrapper overflow B421 | 0 | **22** | 112 |
| wrapper overflow C512 | **0** | **0** | **0** |
| density class | `mf-pb-w-lg` | `mf-pb-w-md` | `mf-pb-w-sm` |
| cot hien | 5 | 4 (bo Modified) | 2 (Form + Actions) |
| row height | 53 | 69 -> **50** | 133 -> **93** |
| pager bottom / viewport | 661 / 675 | 754 / 768 | 836 / 844 |
| Add-to-page popup | 981..1341 | 640..1000 | 12..378 (trong 390) |
| Confirm enabled | true | true | true |
| Next -> page range | Page 2 \| 21-40 | Page 2 \| 21-40 | Page 2 \| 21-40 |

Anh: `qa-out/pb-final-{desktop,tablet,iphone14}/`, `qa-out/pb-final2-iphone14/`.
Phone them: bo caption bi cat con `"M..."`, actions xuong 2 dong, tap target >= 40 px.

### 1.4 Da deploy o dau

- Source: `MegaForm.PersonaBar/Modules/MegaForm/MegaForm_20260809_C512.{html,css,js}`
- Live: `E:\DNN_SITES\DNN_MegaClean008\Website\DesktopModules\Admin\Dnn.PersonaBar\Modules\MegaForm\`
- Manifest: `MegaForm.DNN/MegaForm.dnn` -> `<path>MegaForm_20260809_C512</path>`
- DB: `dbo.PersonaBarMenu.Path = 'MegaForm_20260809_C512'` (Identifier `MegaForm`, MenuId 34)
- Package: `MegaForm.DNN/Install/MegaForm_02.00.014_Install.zip` da build lai; nested
  `PersonaBar.zip` **da verify** co ca 3 file C512 (3786 / 19468 / 20367 B).

⚠️ **DNN cache PersonaBarMenu trong bo nho.** Doi `Path` trong DB xong panel van nap ban cu
cho toi khi app recycle. Toi cham `web.config` de recycle; harness sau do bao dung asset
`MegaForm_20260809_C512.css/js`. Neu khong recycle, moi phep do deu la do ban cu.

---

## 2. Harness: da sua 2 diem lam sai ket qua

`tools/browser-qa/personalbar-compact-qa.mjs`

1. **Harness khong tu mo panel.** No gia dinh panel dang mo; context moi thi khong. O 1024 no
   timeout tai `.mf-pb-addto` va khong ghi `report.json` — de nham thanh "panel hong".
   MegaForm nam trong nhom **Content**: `li#Content` -> `li#MegaForm`. Da them buoc mo.
2. Them khoi `density` vao report: class hien tai, `wrapperClientWidth/ScrollWidth`,
   `horizontalOverflow`, danh sach cot dang hien, row height, meta co hien khong.

`tools/browser-qa/dashboard-density-qa.mjs` (moi) — do dashboard + tung modal: fit width/height,
footer co thay khong, body co cuon noi bo khong, Escape co dong khong.

---

## 3. P0 #2 (dashboard): da do, sua 1, con lai da khoanh vung

### 3.1 Da do (sau khi vao lai bang harness moi)

| | 1365x675 | 1024x768 | 390x844 |
|---|---|---|---|
| document overflow | 0 | 0 | 0 |
| header width | 1109 | 768 | 390 |
| toolbar width | 186 (5 icon button 32px) | 147 | 142 |
| table width / overflow | 1028 / 0 | 687 / 0 | 323 / 88 (trong `.mf-tw` cuon ngang) |
| row height | 60 | 60 | 53 |
| control ra ngoai viewport | 0 | 0 | **8** (`.mf-ic-btn` row actions, right 404..444) |

### 3.2 Da sua: modal bi cat chu tren dien thoai

`Business Starters` o 390: modal 362 px nhung **luoi ben trong 472 px** -> chu bi cat, khong
cuon ngang duoc. Nguyen nhan la **grid item mac dinh `min-width: auto`**, nen the dai nhat
quyet dinh be rong luoi. Sua trong `MegaForm.UI/src/styles/megaform-admin-shell.css`:

```css
.mf-modal-body{...;overflow-x:hidden;min-width:0}
.mf-modal-body>*,.mf-modal-body>*>*{min-width:0}
.mf-modal-body div,.mf-modal-body p,.mf-modal-body span,.mf-modal-body strong{overflow-wrap:anywhere}
```

Da `npm run build:dashboard`, copy `Assets/css/megaform-admin-shell.css` +
`Assets/js/megaform-dashboard.js` sang `.../DesktopModules/MegaForm/Assets/`. Do lai o 390:
modal `fitsWidth = true`, body cuon noi bo, chu doc duoc het
(`qa-out/dash-c512-iphone14/modal-starters.png`).

### 3.3 Dinh chinh mot ket luan sai cua chinh toi

Ban do dau tien bao **`escapeCloses: false`** cho moi modal. Sai: detector cua toi coi *bat ky*
lop fixed/absolute z-index >= 50 nao la modal — ma **chinh dashboard la mot lop nhu vay**.
Doi sang `#mf-modal-overlay` thi Escape **dong dung** (`esc: true` ca desktop lan phone).
`modal()` trong `dashboard/index.ts:573` von da bind Escape + click backdrop.

---

## 3b. Sort theo cot (owner yeu cau) — ban D530

Panel phan trang **phia server** (20 dong / lan), nen sort trong 20 dong dang cam la sort gia.
Sort duoc lam that o SQL:

- **`SqlScripts/02.00.015.SqlDataProvider`** — `usp_MF_Form_List` them `@SortBy` / `@SortDir`
  (optional, nen moi caller cu giu nguyen thu tu cu). **Khong dynamic SQL**: ORDER BY la mot bo
  `CASE` co dinh, gia tri la nghia -> khong khop CASE nao -> ve mac dinh `CreatedOnUtc DESC`
  (cung la tie-breaker). Whitelist lam **2 lop** (controller + proc).
- `FormRepository.ListForms(..., sortBy, sortDir)` + `MegaFormController.GetForms(..., sortBy,
  sortDir)`; response **echo lai** `sortBy/sortDir` de panel ve mui ten theo cai server that su
  da lam, khong theo cai no tuong minh da hoi.
- Panel D530: `<th>` sortable la **`<button>`** that (ban phim toi duoc, `aria-sort` cho screen
  reader), mui ten ↕/↑/↓ ve tu `aria-sort`. Doi cot -> ve **trang 1**. Title mac dinh A→Z, so va
  ngay mac dinh lon/moi truoc.
- **Cot Fields khong sort duoc va khong co nut** — so field dem tu `SchemaJson` **sau khi** SQL
  da phan trang, server khong order theo no duoc. Co tooltip noi ro ly do, thay vi gia vo.

Bang chung (`tools/browser-qa/personalbar-sort-qa.mjs`, `qa-out/pb-sort/sort-report.json`):
moi cot bam 2 lan (xuoi/nguoc), doc **trang 1 va trang 2**, kiem tra ca hai dieu — trong trang
co thu tu, **va trang 2 noi tiep trang 1**. 6/6 truong hop dat, 0 failure:

| Cot | Chieu | Trang 1 dau | Trang 1 cuoi | Trang 2 dau |
|---|---|---|---|---|
| title | asc | `aaa` | `Community Support Reques` | `Contact Us` |
| title | desc | `x` | `Style Consultation` | `Spooky Night Party` |
| submissions | desc | 207 | 0 | 0 |
| modified | desc | 9/8/2026 14:57:29 | 9/8/2026 14:56:40 | 9/8/2026 14:56:40 |
| modified | asc | 29/7/2026 05:21:47 | 9/8/2026 14:56:37 | 9/8/2026 14:56:37 |

Do lai density sau khi them sort (khong regress): desktop/tablet/phone deu
`document overflow = 0`, `wrapper overflow = 0`, pager trong viewport, popup trong viewport,
`Page 2 | 21-40`. Row desktop con **37 px** (truoc 53) vi header gon lai.

**Da deploy + dong goi:**

- DLL: `MegaForm.DNN.dll` + `MegaForm.PersonaBar.dll` build Release, copy vao
  `E:\DNN_SITES\DNN_MegaClean008\Websitein` (da backup `.bak-<stamp>`, pool stop/start).
- SQL: da chay `02.00.015` tren `DNN_MegaClean008` (`usp_MF_Form_List` gio co **7 params**).
- Panel: `MegaForm_20260809_D530.{html,css,js}` vao live; `PersonaBarMenu.Path = D530`;
  manifest `<path>` -> D530.
- **Package bump `02.00.014` -> `02.00.015`** (bat buoc: DNN chi chay script co version cao hon
  ban da cai). `MegaForm.DNN/Install/MegaForm_02.00.015_Install.zip` — da verify outer co
  `SqlScripts/02.00.015.SqlDataProvider`, nested `PersonaBar.zip` co ca 3 file D530.

⚠️ Site khac muon co sort **phai cai package 02.00.015** (de chay script) — chi copy file panel
la khong du, API se goi proc cu 5 tham so va bao loi.

## 3c. "Add to page" -> "Add to current page" (owner yeu cau) — ban E541

Panel la overlay tren mot trang DNN that, va trang dang mo gan nhu luon la trang muon dat form.
DNN da cong bo san no: **`window.top.dnn.getVar('sf_tabId')`** (do duoc: `1014` tren `/mfqa-wide`).

- Nhan dong: `Add to current page` (khi doc duoc tab id) — neu **khong** doc duoc thi giu nguyen
  nhan cu `Add to page` va hanh vi cu. Mot nut ghi "current page" ma thuc ra doan la te hon cai
  picker no thay the.
- Popover: tieu de `Add this form to the page you are on`; **trang hien tai duoc ghim len dau,
  chon san, gan huy hieu "you are here"**. Van con toan bo danh sach ben duoi -> doi trang khac
  van 1 cu click. Neu trang hien tai khong nam trong danh sach (bi cap 100 hoac dang loc),
  panel **tu dung mot muc** tu title/pathname cua trang cha thay vi lang le bo qua.
- **i18n**: khong hardcode. 4 key moi trong `Modules/MegaForm/App_LocalResources/MegaForm.resx`
  — `AddToCurrentPage.Text`, `AddToCurrentPageTitle.Text`, `CurrentPage.Text`,
  `CurrentPageBadge.Text` — deu goi qua `t(key, englishFallback)` nhu cac chuoi khac cua panel.
  ⚠️ Panel nay **chua co ban vi-VN** (`MegaForm.vi-VN.resx` khong ton tai): dich rieng 4 key se
  ra panel nua Anh nua Viet. Neu owner muon panel tieng Viet thi nen dich **ca file**, mot lan.

Bang chung (`tools/browser-qa/personalbar-currentpage-qa.mjs`, `qa-out/pb-currentpage/report.json`):

| Do | Ket qua |
|---|---|
| trang chu | `/mfqa-wide?mfFormId=221` -> `sf_tabId = 1014` |
| nhan dong | `Add to current page` |
| tieu de popover | `Add this form to the page you are on` |
| muc dau danh sach | trang hien tai, badge `you are here`, **da chon san**, Confirm bat |
| body POST that su gui | `{"formId":223,"tabId":1014,"pane":"ContentPane"}` |
| server tra ve | `aaa -> mfqa-wide. Open the page` |

⚠️ Lan QA nay **da them that** module form #223 ("aaa") vao trang `/mfqa-wide`. Xoa bang Edit
page neu khong can.

Da deploy: `MegaForm_20260809_E541.{html,css,js}` + `MegaForm.resx` vao live, `PersonaBarMenu.Path
= E541`, manifest `<path>` -> E541, package `02.00.015` build lai (nested zip **da verify** co ca
3 file E541 + resx 9946 B). Do lai desktop sau khi doi: doc/wrapper overflow 0, 5 cot, pager 661,
popup 981..1341, `Page 2 | 21-40` — sort va density khong regress.

## 3d. Submissions khong hien (owner bao) — 2 loi, 1 do toi gay ra

Trieu chung: tu Persona Bar bam **Submissions** -> `/mfqa-admin?mfFormId=46#mf-submissions`
dung mai o "Loading submissions...".

**Loi 1 — LECH DLL, do chinh toi.** Toi deploy `MegaForm.DNN.dll` build tu cay hom nay nhung
**khong deploy `MegaForm.Core.dll` di kem** (site van giu Core ngay 7/8). DNN.dll goi vao Core cu
khong co -> hang loat endpoint gay:

| Endpoint | Truoc | Sau khi nap Core khop |
|---|---|---|
| `Submissions/List?formId=46` | **500** (body rong) | **200** + 12 dong that |
| `Reports/FormsOverview` | **500** | 200 |
| `Workflow/MyInbox` | **400** x2 | 200 |
| `AiAssistant/DefaultConfig` | ERR_ABORTED | 200 |
| `megaform-dnn-host.js` | `TypeError: ... reading 'dataset'` | het |

Da nap `MegaForm.Core.dll` + `MegaForm.Sdk.dll` + `MegaForm.Integrations.CloudStorage.dll` tu
**cung mot ban build**, co backup `.bak-<stamp>`. **Bai hoc: package ship Core + DNN cung nhau,
deploy tay cung phai di ca bo.**

**Loi 2 — TRUNG ID `mf-submissions-root`** (co san tu truoc, khong lien quan DLL). Trang
`/mfqa-admin#mf-submissions` co **hai** phan tu cung id nay: mot trong overlay cua host
(`#mf-host-submissions-overlay`, luc do `display:none`) va mot la surface that trang render.
`getElementById` tra ve **cai dau tien theo document order** = ban an -> app submissions mount vao
cho khong ai thay (do duoc: bang 12 dong, rect `0x0`), con khung nhin thay giu nguyen chu
"Loading submissions...".

Vá trong `MegaForm.UI/src/dnn-host/index.ts`: them `rootById(id)` chon **root dang nhin thay
duoc** (`getClientRects().length`), ap cho `mf-submissions-root`, `mf-myinbox-root`,
`mf-languages-root` (cung kieu rui ro). Khi overlay that su mo thi no visible va van duoc chon
truoc — nen khong doi hanh vi duong cu.

Da `npm run build:dnn-host`, copy `Assets/js/megaform-dnn-host.js` sang live. Do lai:

- `/mfqa-admin?mfFormId=46#mf-submissions`: het "Loading", **12/12 dong hien**, sidebar + bo loc
  + counter (Tong 12 / Moi 12) day du (`qa-out/subs-fixed-direct.png`).
- Tu Persona Bar bam Submissions -> `/mfqa-admin?mfFormId=223#mf-submissions` render binh thuong
  (`qa-out/subs-fixed-frompanel.png`).
- Console: **0 loi**, moi call API deu 200.

**Con lai (co san, chua sua):** `GET Form/List?siteId=1` -> **404** tu `megaform-renderer.js`.
DNN expose `Form/ListAll?portalId=` (call nay 200), trong khi 4 cho trong UI van hoi
`Form/List?siteId=` kieu Oqtane (`dashboard/index.ts:3390,4828`, `submissions/forms-overview.ts:134`,
`listview/designer.ts:78`). Trang van chay nen co ve co fallback — phai quyet dinh: DNN them route
`List`, hay UI dung `ListAll` tren DNN. Dung sua mu vi Oqtane dang dung `Form/List?moduleId=`.

## 3e. 🔴 VIEC LON TIEP THEO (owner chot 2026-08-10): panel phai TU CHAY, khong can module tren trang

Owner: *"khong can phai co 1 thuc the megaform tai 1 trang nao; sau khi cai dat xong thi megaform
phai duoc tich hop vao Persona Bar DNN, va New form, dashboard... deu hoat dong duoc tu day"*
(cach cu — tu tao trang Admin — van phai chay song song).

Hien trang: **moi thu trong panel deu di qua `MegaFormHostPageResolver.Resolve(PortalId)`** — tim
mot trang co module MegaForm roi dung URL tro toi do. Vi vay `New form`, `Open dashboard`,
`Submissions`, `Edit` deu redirect sang `/mfqa-admin`. Khong co module nao thi cac nut bi disable
kem thong bao "Add a MegaForm module to a page first".

Dich den: panel **tu host dashboard SPA** (bundle da co san: `Assets/js/megaform-dashboard.js` +
`css/megaform-admin-shell.css`, cung mot bundle `/mfqa-admin` dang dung), mount ngay trong
`socialpanelbody`. Persona Bar la trang same-origin nen cookie DNN va asset deu toi duoc.

Diem dau noi da biet:

1. `MegaForm.PersonaBar/Modules/MegaForm/MegaForm_20260809_E541.html` — them mot vung mount
   (`<div id="mf-pb-dashboard-root">`) va nap 2 asset tren khi nguoi dung bam New form/Dashboard.
2. `scripts/MegaForm_*.js` — dat `window.__MF_PLATFORM__` (apiBase `/DesktopModules/MegaForm/API/`,
   portalId) roi goi `window.MegaForm.initDashboard(root)`; wizard mo bang
   `location.hash = '#mf-new-form'` (deep link vua them 2026-08-10) hoac goi thang
   `openFormCreationWizard()` neu export no ra `window.MegaForm`.
3. `Services/MegaFormController.cs` + `Components/MegaFormHostPageResolver.cs` — cac URL chi con la
   **duong lui** khi nguoi dung muon mo o tab rieng; khong con la duong chinh.
4. `MegaForm.DNN/WebApi/*` — 🟢 **DA DO XONG 2026-08-10, khong con phai doan**.
5. Quyen: panel da la admin-only (401 cho anonymous). 🟢 **DA DO XONG** — xem duoi.

### 3e-1. Ket qua do (`tools/browser-qa/pb-module-context-probe.mjs`)

```
node tools/browser-qa/pb-module-context-probe.mjs http://megaclean008.ai admin dnnhost qa-out/pb-modctx
```

23 endpoint, moi cai goi 6 lan tu **trong khung Persona Bar** (`Dnn.PersonaBar/index.html`), khac
nhau o ngu canh module. Bang day du: `qa-out/pb-modctx/module-context-probe.json`.

| ngu canh gui len | ket qua |
|---|---|
| **khong gui gi** (panel chi co the lam vay) | **200 cho 21/22 endpoint co that** |
| `?moduleid=0` | **200** — vo hai (builder DNN dang gui the nay moi ngay) |
| `?tabid=0` | 🔴 **404 TAT CA** |
| `?moduleid=0&tabid=0` | 🔴 **404 TAT CA** (thu pham la `tabid`, khong phai `moduleid`) |
| header `ModuleId: 0` + `TabId: 0` | 🔴 **400 TAT CA** — day chinh la loi 400 hom qua |
| cap module/tab that (doi chung) | 200 |

**Ba ket luan dung de viet code:**

1. **Panel KHONG gui `tabid`/`ModuleId`-`TabId` header. Khong gui gi la dung nhat.** So 0 khong
   phai "trung tinh": `tabid=0` lam DNN 404 ca request, header 0 lam DNN 400. `antiforgery.ts:85`
   da ghi dung ly do tu truoc ("Deliberately NOT sending ModuleId/TabId") — nay co so do.
2. **Chi MOT surface that su can module: workflow designer.** `WorkflowApiController` +
   `WorkflowDatabaseController` mang `[DnnModuleAuthorize(Edit)]` ⇒ `Workflow/Get` tra **401**
   khi khong co module, **200** khi co. Muon mo designer tu panel thi phai doi guard sang kieu
   `[DnnAuthorize]` + kiem quyen theo `UserInfo` (nhu `WorkflowInboxController` da lam roi), hoac
   chap nhan designer chi mo o tab rieng. Moi thu khac cua dashboard chay duoc khong can module.
3. **Antiforgery da co san loi giai, khong phai lam gi them.** Trong khung panel KHONG co
   `jQuery.ServicesFramework` va KHONG co input `__RequestVerificationToken`. Nhung
   `MegaForm.UI/src/shared/antiforgery.ts` di nguoc len `parent`/`top` va trang nen DNN co ca hai
   — do duoc: **"hidden input in the ancestor (81 ky tu)"**. Cac loi goi ghi (Form/Save,
   Form/Delete) do do van qua duoc.

**Cai KHONG lien quan toi module, nhung lo ra khi do** (dung nham la loi cua panel):
`Submissions/My` va `Submissions/Languages` **404 o moi ngu canh** — route kieu Oqtane, DNN chua
he co. My Inbox tren DNN di bang `Workflow/MyInbox` (200). Va `Form/List?portalId=0&pageSize=5`
tra ve **669 KB cho 5 dong** (moi dong keo ca `SchemaJson`), `Form/ListAll` **4.3 MB**,
`BuilderTemplates/List` **6.0 MB** — nhoi ca dong nay vao panel la mot van de rieng.

### 3e-2. 🟢 DA DUNG XONG — ban **F550**, dang chay live tren megaclean008.ai

`MegaForm_20260810_F550.{html,css,js}`, `PersonaBarMenu.Path = MegaForm_20260810_F550`, manifest
`<path>` -> F550, `MegaForm.PersonaBar.dll` da deploy (pool recycle qua `Deploy-CoreDll.ps1`).

**Do bang `tools/browser-qa/personalbar-dashboard-qa.mjs`** (anh: `qa-out/pb-dash2/`):

| viec | ket qua do duoc |
|---|---|
| Panel mo, danh sach form | 20 dong |
| **Open dashboard** | dashboard SPA **mount trong panel**: sidebar + header + **Forms 109 · 106 da xuat ban · Bai gui 288**, bang **50 form co ten that** |
| Trang nen | `topUrl` van la `/mf-templates/mf-xmas-sale` — **khong con nhay trang** |
| Back to forms | quay lai danh sach 20 dong, giu nguyen trang thai |
| **New form** | `#mf-wizard-root` hien, dung wizard 5 buoc ("Thiet lap bieu mau cua ban") |
| API loi | **1**: `Permissions/Catalog?formId=0` 400 (co san tu truoc, wizard goi khi chua co form) |

⭐⭐⭐**3 bay da tra gia de biet:**

1. **`initDashboard` DOI ID cua root**: `root.id = 'mf-dash-root'` (dashboard/index.ts, nut delete tham
   chieu theo id do). Moi selector `#mf-dashboard-root` sau khi mount deu **null** — lan do dau
   bao "rootExists: false" lam tuong mount hong, that ra no chay.
2. **SPA KHONG tu fetch du lieu trang chu.** No doc payload dau tien tu `data-dashboard` ma
   `FormView.ascx` bake san (`BuildDashboardJson`). Mount tran ⇒ vo dep, nav du, **trang chu
   RONG** (statTiles 0, tableRows 0). F550 dung payload tu chinh 2 API cua panel
   (`GetDashboard` + `GetForms` pageSize 50) roi set `data-dashboard` truoc khi init.
3. **Panel 860px lam bang cua dashboard chong chu** — cot ten form de len chinh header cua no.
   Che do dashboard nay chiem het be ngang canh rail (`widenPanelForDashboard`), tra lai khi Back.

**Con thieu (biet ro, khong phai bug an):**

- **Gom theo AppScope mat**: `GetForms` cua panel khong tra `appScope` ⇒ moi form vao nhom
  "Bieu mau doc lap". Tren trang DNN thi gom theo app.
- **The "bai gui gan day" rong**: panel API khong co du lieu do ⇒ gui mang rong chu khong bia.
- **Workflow designer** van can module (`[DnnModuleAuthorize]` -> 401), nen van mo o tab rieng.
- **Cach sua that**: nhac `BuildDashboardJson` ra khoi `FormView.ascx.cs` (no dang phu thuoc
  `EditUrl()` cua module control) thanh mot service ma **ca hai host cung goi**. PersonaBar **da**
  `ProjectReference` sang MegaForm.DNN nen khong can DLL moi, chi can go phu thuoc control.

## 4. Con lai cho nguoi tiep theo

### P0. Dashboard tren dien thoai (390)

- 8 nut `.mf-ic-btn` cua cot Actions nam ngoai viewport (right 404..444). Chung **nam trong
  `.mf-tw` co `overflow-x:auto`** nen van cham toi duoc bang cach cuon ngang bang — document
  khong tran. Nhung theo acceptance "khong nut nao ra ngoai viewport" thi day van la no.
- Nguyen nhan gian tiep: **sidebar an mat chieu ngang**. `.mf-sidebar` = 256 px
  (`[data-state=collapsed]` = 56 px). O 640px chua co rule nao an han han sidebar.
- De xuat: duoi 640 px cho sidebar thanh **off-canvas** (an mac dinh, `.mf-sb-tog` mo dang
  overlay). **Chua lam** vi phai sua ca JS state, khong sua mu bang CSS duoc — an sidebar bang
  CSS khong thoi se lam nut toggle bam nhu khong co gi xay ra.

### P0. Cac modal con lai chua do duoc

`Create with AI` (`.mf-btn-ai-create`), `Bulk delete`, `Pin to page` — harness click bi timeout
8s du selector ton tai trong DOM. Chua ro bi che boi lop nao hay button bi disable luc do.
Phai xac dinh **truoc** khi ket luan chung dat/khong dat acceptance.

### P1. Duplicate chrome

Outer DNN header `MegaForm Dashboard` + inner `.mf-hd` van an 2 tang chieu cao. Chua dung toi.

### P1. Nen/host

Van thay `GET .../API/AiAssistant/DefaultConfig` va `Workflow/MyInbox` bi `ERR_ABORTED`, cong
them 2 loi `400` tu trang nen duoi overlay. Personal Bar API (forms/pager/Add-to-page) van
thanh cong — dung gan loi cua trang nen cho panel.

---

## 5. File da dong vao

- `MegaForm.PersonaBar/Modules/MegaForm/MegaForm_20260809_C512.html` (moi)
- `MegaForm.PersonaBar/Modules/MegaForm/css/MegaForm_20260809_C512.css` (moi)
- `MegaForm.PersonaBar/Modules/MegaForm/scripts/MegaForm_20260809_C512.js` (moi)
- `MegaForm.DNN/MegaForm.dnn` (path -> C512)
- `MegaForm.UI/src/styles/megaform-admin-shell.css` (modal shrink)
- `tools/browser-qa/personalbar-compact-qa.mjs` (tu mo panel + density metrics)
- `tools/browser-qa/dashboard-density-qa.mjs` (moi)
- `MegaForm.DNN/Install/MegaForm_02.00.014_Install.zip` (build lai)

Khong dung toi: B421, 20260802, base `MegaForm.*` (van giu noi dung B421 — neu muon "base =
hien tai" thi phai sync tay sang C512), thu muc `Samples/FormTemplates/**`, va moi thay doi
khac dang nam trong worktree.

## 6. Lenh chay lai

```powershell
node tools/browser-qa/personalbar-compact-qa.mjs http://megaclean008.ai admin dnnhost qa-out/pb 1365 675
node tools/browser-qa/personalbar-compact-qa.mjs http://megaclean008.ai admin dnnhost qa-out/pb-t 1024 768
node tools/browser-qa/personalbar-compact-qa.mjs http://megaclean008.ai admin dnnhost qa-out/pb-m 390 844
node tools/browser-qa/dashboard-density-qa.mjs   http://megaclean008.ai admin dnnhost qa-out/dash 390 844
```

Doi asset Persona Bar -> **phai** recycle (`touch web.config`) truoc khi do, neu khong ban do
duoc la ban cu.
