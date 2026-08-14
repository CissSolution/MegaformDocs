# Ban giao gallery + Personal Bar/dashboard density cho Claude

Ngay: 2026-08-09. Nguoi ban giao: Codex. Nguoi tiep nhan: Claude.

Tai lieu nay tu chua phan viec vua hoan thanh, bang chung Visual QA, cac file da sua,
quy trinh deploy/package va thu tu xu ly tiep. Muc tieu tiep theo la lam Personal Bar va
dashboard gon, premium, responsive ma khong lam hong cac luong Add to page, pager, wizard,
gallery popup va builder.

---

## 1. Ket qua da chot

### 1.1 Gallery online

- Da promote 19 template tu
  `Samples/FormTemplates/Premium/PENDING-REVIEW/` sang
  `Samples/FormTemplates/Premium/GALLERY-PUBLISHED/`.
- `PENDING-REVIEW`: 0 JSON.
- `GALLERY-PUBLISHED`: 67 JSON (48 cu + 19 moi).
- Gallery clone:
  `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\megaform-gallery`
- Remote:
  `https://github.com/CissSolution/megaform-gallery.git`
- Branch: `main`.
- Commit da push: `8b7db20a2dd5c60a10949a8ddbe7138a3b1d6068`
  (`Publish 19 exact-conversion templates (67 total)`).
- `HEAD`, `origin/main` da trung nhau; clone sach sau push.
- Manifest online:
  `https://CissSolution.github.io/megaform-gallery/manifest.json`
- Manifest online da verify:
  - `templates.length = 67`
  - `generatedUtc = 2026-08-09T13:08:03.198Z`
  - 19/19 slug moi deu co mat, khong missing.
- Trang HTML online da verify sau push:
  - HTTP `200 OK`, `Last-Modified: Sun, 09 Aug 2026 13:08:36 GMT`;
  - 67 `<article>` template card;
  - 67 link `Download JSON`;
  - cac slug moi nhu `xmas-sale-euroyouth-application`, `gold-suite-membership-application`,
    `massage-bodychart-terracotta`, `festa-italiana` xuat hien trong HTML dang phuc vu.

Lenh publisher da dung:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\gallery\Publish-Gallery.ps1 `
  -Message "Publish 19 exact-conversion templates (67 total)"
```

Publisher tu validate clone/remote/worktree, `git pull --ff-only`, build asset + manifest,
commit, push va doi GitHub Pages phuc vu dung manifest moi. Khong push main repo MegaForm
trong buoc nay.

### 1.2 Danh sach 19 template vua publish

| Slug | Mock | DNN form | Oqtane form |
|---|---|---:|---:|
| xmas-sale-euroyouth-application | xmas-sale | 59 | 25 |
| xmas-newsletter-euroyouth-application | xmas-newsletter | 58 | 30 |
| agency-flyer-euroyouth-application | agency-flyer | 57 | 26 |
| kids-first-book-registration | hotel-concierge | 61 | 24 |
| gold-suite-membership-application | hotel-suite | 60 | 28 |
| rose-wellness-registration | rose-registration | 62 | 29 |
| newsletter-signup-amber | newsletter | 66 | 27 |
| job-application-northwind | job-application | 65 | 21 |
| lagoon-reserve-booking | hotel-booking | 64 | 22 |
| product-order-live-total | product-order | 63 | 23 |
| golden-pro-agent-registration | golden-pro-registration | 68 | 18 |
| invoice-request-navy-orange | invoice-form | 70 | 19 |
| invoice-spinera-blue | invoice-spinera | 71 | 20 |
| invoice-codexo-cyan | invoice-codexo | 69 | 31 |
| corporate-registration-blue | corporate-registration | 115 | 17 |
| ielts-report-classic | ielts-report | 116 | 16 |
| massage-intake-sage | massage-intake | 117 | 15 |
| massage-bodychart-terracotta | massage-bodychart | 118 | 14 |
| festa-italiana | festa-italiana | 72 | 32 |

Nguon mock van la:
`E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\form-builder-controls (10)\app\forms\<mock>\page.tsx`.

### 1.3 File gallery lien quan

Publisher/build co the cap nhat cac file generated sau; day la thay doi du kien:

- `tools/gallery/gallery-exclude.json`
- `MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec`
- noi dung build trong clone `megaform-gallery`

`Samples/FormTemplates/Premium/GALLERY-PUBLISHED/` va `PENDING-REVIEW/` hien dang la
untracked trong main worktree. Khong duoc suy dien rang publish chua thanh cong chi vi
main repo khong co commit move; bang chung online la gallery commit + live manifest o tren.

---

## 2. Moi truong Personal Bar/dashboard

### 2.1 Repo va site

- Repo:
  `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
- DNN site root:
  `E:\DNN_SITES\DNN_MegaClean008\Website`
- Site:
  `http://megaclean008.ai`
- Tai khoan QA: `admin / dnnhost`
- SQL Server: `WINDOWS-11\SQLEXPRESS`
- Database: `DNN_MegaClean008`
- Authentication: Windows integrated.

### 2.2 Hai UI khac nhau, khong sua nham

1. **Personal Bar MegaForm panel** la iframe/panel cua DNN Persona Bar. Nguon:
   `MegaForm.PersonaBar/Modules/MegaForm/`.
   DNN nap HTML/CSS/JS theo `PersonaBarMenu.Path`, khong phai dashboard Vite bundle.

2. **MegaForm Dashboard** (`/mfqa-admin`) la dashboard bundle trong `MegaForm.UI`, chu yeu:
   `MegaForm.UI/src/dashboard/index.ts` va
   `MegaForm.UI/src/styles/megaform-admin-shell.css`.

Anh chup nguoi dung thay panel rong/to va dashboard tran khong co cung mot root cause.
Phai QA tung surface, tai dung viewport, va kiem tra document overflow thay vi chi nhin anh.

### 2.3 Root cause da tim thay

- DNN Personal Bar host gan khung/padding bang cac lop nhu `socialpanelheader` va
  `socialpanelbody`; chieu rong panel do host quyet dinh (khoang 860 px desktop, 700 px tablet).
- Bang form dai truoc day lam ca document cuon; pager va cac dong cuoi ra khoi viewport.
- Popup Add to page co the bi can/cat neu dat theo flow cua table.
- Dashboard co nhieu nut co ca icon + label tieng Anh; tai viewport 1365/1024 toolbar het cho
  va tao cam giac UI zoom/to.
- DNN/RequireJS cache Persona Bar rat dai. Sua file cung ten khong dam bao browser nap ban moi;
  can dated path trong `PersonaBarMenu.Path` va trong manifest package.

---

## 3. Ban B421 da trien khai

### 3.1 Personal Bar dated assets

Da them:

- `MegaForm.PersonaBar/Modules/MegaForm/MegaForm_20260809_B421.html`
- `MegaForm.PersonaBar/Modules/MegaForm/css/MegaForm_20260809_B421.css`
- `MegaForm.PersonaBar/Modules/MegaForm/scripts/MegaForm_20260809_B421.js`

Da cap nhat:

- `MegaForm.DNN/MegaForm.dnn`: Persona Bar path thanh
  `MegaForm_20260809_B421`.
- Live DB `dbo.PersonaBarMenu`, row `Identifier='MegaForm'`: `Path` thanh
  `MegaForm_20260809_B421`.
- Live files da copy vao:
  `E:\DNN_SITES\DNN_MegaClean008\Website\DesktopModules\Admin\Dnn.PersonaBar\Modules\MegaForm\`.

Noi dung B421:

- body la flex shell theo viewport, `height: calc(100vh - 103px)`.
- table nam trong `.mf-pb-table-wrap`, cuon noi bo, sticky header.
- KPI, filter, action va pager duoc compact.
- pager luon nam trong viewport.
- Add-to-page popover dat an toan trong viewport.
- JS cap nhat page info, reset table scroll khi doi trang/filter.
- Khong doi API contract cu.

Luu y: file base `MegaForm.html/css/js` va dated `20260802` trong worktree cung dang chua
noi dung B421. Khong xoa/revert vo y; dated B421 la path live/package can giu.

### 3.2 Dashboard density

Da sua:

- `MegaForm.UI/src/styles/megaform-admin-shell.css`
  - tai `max-width: 1600px`, cac toolbar action compact thanh icon button;
  - giu tooltip/accessible label;
  - tranh document overflow.
- `MegaForm.UI/src/dashboard/index.ts`
  - them `aria-label` cho Close, Refresh, New Form, Business Starters,
    Create with AI va cac control lien quan.
- `MegaForm.DNN/Views/FormView.ascx.cs`
  - cache constants `DASHBOARD_V` va `ADMIN_V` = `?v=20260809-B421`.

### 3.3 Build/package

Da build thanh cong:

- MegaForm UI dashboard.
- MegaForm DNN .NET.
- MegaForm PersonaBar .NET.

Package:
`MegaForm.DNN/Install/MegaForm_02.00.014_Install.zip`

Da verify nested `PersonaBar.zip` co:

- `MegaForm\MegaForm_20260809_B421.html`
- `MegaForm\css\MegaForm_20260809_B421.css`
- `MegaForm\scripts\MegaForm_20260809_B421.js`

Outer manifest cung tro toi B421.

---

## 4. Visual QA da chay, khong phai doan

Harness:
`tools/browser-qa/personalbar-compact-qa.mjs`

### 4.1 Desktop 1365 x 675

- Personal Bar document: `scrollWidth=1365`, `scrollHeight=675`.
- body bottom = 675, khong tran document.
- table cuon noi bo.
- pager bottom = 661, van thay va thao tac duoc.
- Add-to-page popup rect:
  `{left:981, top:203, right:1341, bottom:599, width:360, height:396}`.
- Confirm trong popup enabled.
- Pager: `Page 1 | 1-20` -> `Page 2 | 21-40`.
- Dong dau trang 2: `Spooky Night Party`.
- `Open dashboard` chuyen dung sang `/mfqa-admin`.
- Dashboard document `scrollWidth=1365`, khong document overflow.

### 4.2 Tablet 1024 x 768

- Personal Bar document: `scrollWidth=1024`, `scrollHeight=768`.
- body bottom = 768.
- pager bottom = 754.
- Add-to-page popup rect:
  `{left:640, top:230, right:1000, bottom:626, width:360, height:396}`.
- Dashboard document `scrollWidth=1024`; toolbar buttons nam trong viewport.

### 4.3 Anh QA

Desktop:

- `qa-out/personalbar-b421-desktop/02-settled.png`
- `qa-out/personalbar-b421-desktop/03-add-to-page.png`
- `qa-out/personalbar-b421-desktop/04-next-page.png`
- `qa-out/personalbar-b421-desktop/05-dashboard.png`

Tablet:

- `qa-out/personalbar-b421-tablet/02-settled.png`
- `qa-out/personalbar-b421-tablet/03-add-to-page.png`
- `qa-out/personalbar-b421-tablet/04-next-page.png`
- `qa-out/personalbar-b421-tablet/05-dashboard.png`

---

## 5. Phan con lai Claude can xu ly

### P0. Goi gon Personal Bar theo cam nhan premium

- Tablet van co **internal table horizontal overflow khoang 22 px**:
  table 720 px, wrapper client 698 px. Document khong tran, nhung nen bo cuon ngang nho nay.
- Uu tien an/gop cot tai breakpoint nho (Modified, Fields, Submissions tuy viewport), khong
  dung `transform: scale()` hoac CSS `zoom` vi se lam sai hit target va popup geometry.
- Kiem tra typography/row height/action density tai dung viewport nguoi dung (anh thuong la
  1365 x 675). Muc tieu la gon hon, khong chi "khong overflow".
- Giu table internal scroll va pager co dinh trong panel.

### P0. Dashboard full-screen/responsive

- Dashboard document da het overflow tai 1365/1024, nhung toolbar/table van co the trong
  to va title bi truncate tai tablet.
- Xem lai responsive column strategy, uu tien cot Form, Status, Actions; an Role/Subs/Modified
  theo breakpoint hoac dua metadata xuong dong phu.
- Outer DNN header `MegaForm Dashboard` + inner toolbar ton chieu cao va trung y nghia.
  Can compact/hide duplicate chrome theo host context, nhung phai giu Close/Home ro rang.
- Kiem tra tat ca modal: Create with AI, Business Starters, wizard, template gallery.
  Modal phai co max-height theo viewport, body cuon noi bo, footer Close/Next/Use template
  luon thay.

### P0. Mobile QA

- B421 moi da QA desktop + tablet, **chua re-run iPhone 14**.
- Bat buoc QA 390 x 844 (va neu co the 430 x 932):
  - document khong cuon ngang;
  - header action khong de len nhau;
  - popup/modal nam trong viewport;
  - table/list co che do mobile ro rang;
  - tap target >= 40 px;
  - pager, Close, Next, Use template thao tac duoc.

### P1. Loi nen/host can phan biet

- Request `localization/gettable?culture=en-US` co luc bi aborted.
- Co the thay HTTP 400 tu trang template nam duoi overlay Personal Bar.
- Neu Personal Bar API forms/pager/Add-to-page van thanh cong, khong duoc gan nham loi cua
  background page cho panel. Luon kiem tra request URL + initiator.

---

## 6. Acceptance bat buoc

Personal Bar:

1. Tai 1365x675, 1024x768 va 390x844:
   `document.scrollWidth <= viewport.width` va noi dung khong vuot bottom viewport.
2. Table dai cuon noi bo; pager luon thay.
3. Next/Previous doi dung du lieu va page range.
4. Search/status filter reset page va scroll.
5. Add to page mo duoc, page tree/chon pane/Confirm thao tac duoc, popup khong bi cat.
6. Open dashboard, New form va Close van dung.

Dashboard/wizard/gallery:

1. Khong document horizontal overflow tai 1365, 1024, 390.
2. Khong nut nao ra ngoai viewport.
3. Wizard co Close/Cancel va Next/Back luon thay.
4. Template Library 67/100+ item phai pager/virtualize, khong keo modal cao vo han.
5. Gallery popup chon template xong phai dong/di tiep duoc.
6. Create with AI modal co Close va footer action trong viewport.
7. Screenshot truoc/sau va do bounding rect; khong ket luan bang mat thuong.

---

## 7. Lenh va SOP tiep tuc

### 7.1 Build

Dung script/package.json hien co cua tung project; truoc khi deploy phai build dashboard,
DNN va PersonaBar. Sau do:

```powershell
powershell -ExecutionPolicy Bypass -File .\BuildPackage-DNN.ps1 -NoPause
```

Verify outer zip + nested `PersonaBar.zip`, khong chi grep source.

### 7.2 Deploy Personal Bar dated version

Moi lan thay doi ma can pha cache:

1. Tao bo dated HTML/CSS/JS moi (khong ghi de B421 roi mong RequireJS tu refresh).
2. Cap nhat `<path>` trong `MegaForm.DNN/MegaForm.dnn`.
3. Copy dated assets vao live site.
4. Update `dbo.PersonaBarMenu.Path` cho `Identifier='MegaForm'`.
5. Reload DNN/clear browser cache neu can.
6. Repack va verify nested zip.

SQL kiem tra truoc/sau:

```sql
SELECT MenuId, Identifier, Path, ModuleName
FROM dbo.PersonaBarMenu
WHERE Identifier = 'MegaForm';
```

### 7.3 QA harness

```powershell
node tools/browser-qa/personalbar-compact-qa.mjs
```

Neu thay doi harness, luu JSON metrics cung screenshot de so sanh breakpoint.

---

## 8. Canh bao worktree

Main repo dang dirty va co nhieu thay doi cua nguoi dung/Claude/Codex, trong do co nhieu
file `DONEE` bi delete va nhieu thu muc template untracked. **Khong reset, checkout, clean,
revert hoac gom commit hang loat.** Chi sua file lien quan, doc diff truoc moi edit.

Nhung file chinh cua B421 can giu:

- `MegaForm.DNN/MegaForm.dnn`
- `MegaForm.DNN/Views/FormView.ascx.cs`
- `MegaForm.PersonaBar/Modules/MegaForm/MegaForm_20260809_B421.html`
- `MegaForm.PersonaBar/Modules/MegaForm/css/MegaForm_20260809_B421.css`
- `MegaForm.PersonaBar/Modules/MegaForm/scripts/MegaForm_20260809_B421.js`
- `MegaForm.UI/src/dashboard/index.ts`
- `MegaForm.UI/src/styles/megaform-admin-shell.css`
- `tools/browser-qa/personalbar-compact-qa.mjs`

Khong regression:

- dated path B421 (hoac dated path moi day du ca source/live/DB/package);
- Add-to-page;
- pager 20 dong va page range;
- dashboard Open/Close;
- gallery manifest SHA256/build validation;
- 19 template vua publish.

---

## 9. Thu tu de nghi cho Claude

1. Mo site bang browser o 1365x675, mo MegaForm tu Personal Bar, chup va do baseline.
2. Xu ly 22 px internal horizontal overflow bang responsive columns.
3. Compact Personal Bar density, giu pager + Add-to-page.
4. Compact duplicate dashboard chrome va responsive table.
5. Sua wizard/gallery/AI modal theo viewport-safe shell, footer sticky.
6. Chay desktop, tablet, iPhone 14; test interaction, khong chi screenshot.
7. Tao dated Persona Bar version moi neu co thay doi live, deploy DB path, rebuild package.
8. Ghi lai exact metrics va residual risks trong handoff tiep theo.
