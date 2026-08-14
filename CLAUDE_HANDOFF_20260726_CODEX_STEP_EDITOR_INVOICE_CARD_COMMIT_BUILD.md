# HANDOFF CHO CLAUDE — 2026-07-26: commit/build Step Editor + invoice card thừa

> Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
>
> Trạng thái: code đã triển khai, build tối thiểu và QA trên DNN test20 đã chạy; **chưa commit**.
> Nhiệm vụ của Claude là rà soát index, commit đúng allowlist và chạy lại build. Worktree đang rất bẩn:
> **tuyệt đối không dùng `git add -A`, `git add .`, reset hoặc checkout để dọn tree**.

## 0. Kết luận cuối cùng của owner

Có hai nhóm thay đổi đã hoàn tất:

1. Step Editor dùng chung cho Wizard + Builder và runtime reconcile theo schema.
2. Ba invoice template không còn lớp card/nền rộng thừa bên ngoài `.io-card`.

Các yêu cầu thử nghiệm ở giữa cuộc trao đổi đã bị owner thu hẹp lại:

- **Không** di chuyển generic step navigation vào trong `customHtml`.
- **Không** ẩn panel Steps theo danh sách hardcode template “support/unsupported”.
- **Không** sửa/cắt block `data-step` trong premium `customHtml`.
- Với invoice, thay đổi cuối cùng **chỉ** làm phẳng wrapper/card thừa; không đổi thiết kế step/nav.

## 1. Kiến trúc đã triển khai

### 1.1 Shared step model — field/schema là nguồn sự thật

File mới: `MegaForm.UI/src/shared/form-steps.ts`.

Exports:

- `listSteps(fields)`
- `addStep(fields, atIndex, options)`
- `removeStep(fields, ordinal, 'merge-prev')`
- `renameStep(fields, ordinal, label)`
- `moveStep(fields, fromOrdinal, toOrdinal)`
- `annotateStepOrdinals(fields, '__step')`

Quy tắc:

- Trang được suy ra từ `Section.properties.pageBreak`.
- Xóa step chỉ xóa/giải page-break anchor; field nội dung được giữ lại và dồn sang trang liền trước.
- Xóa step đầu tiên thì merge forward.
- Không cho xóa khi chỉ còn một step.
- `premiumStepIndex` của Section còn sống **không bị renumber**.

### 1.2 Wizard premium

Các file:

- `MegaForm.UI/src/dashboard/wizard/step-fields.ts`
- `MegaForm.UI/src/dashboard/wizard/transform.ts`
- `MegaForm.UI/src/dashboard/wizard/preview.ts`
- `MegaForm.UI/src/dashboard/wizard/step-setup.ts`
- `MegaForm.UI/src/dashboard/wizard/types.ts`
- file mới `MegaForm.UI/src/dashboard/wizard/premium-steps.ts`
- dependency mới `MegaForm.UI/src/shared/premium-native-migration.ts`

Kết quả:

- Bỏ hộp chữ chết `Template steps fixed`.
- Sidebar premium có nút xóa hover và `+ Add Step`.
- Đổi `navLabel` đồng bộ label của Section.
- Xóa step giữ field, cập nhật `premiumStepDetails`, active ordinal và `__step`.
- Khi save, `customHtml` chỉ reconcile placeholder nếu tập field-key thật sự đổi.
  Thao tác step-only giữ `customHtml` byte-frozen.
- `settings.multiPage` được tính lại từ danh sách schema step.

### 1.3 Builder

Các file:

- file mới `MegaForm.UI/src/builder/steps-panel.ts`
- `MegaForm.UI/src/builder/dom.ts`
- `MegaForm.UI/src/builder/index.ts`
- `MegaForm.UI/src/builder/canvas.ts`

Kết quả:

- Design Studio có accordion `Steps`.
- Panel cho add/rename/remove/reorder và hiện field count.
- Canvas dựng divider từ `Section.pageBreak`, không còn suy luận cấu trúc từ `customHtml`.
- Divider có rename inline và nút remove.
- Form một trang không vẽ step divider.
- Mọi thao tác đặt `multiPage`, dirty state, render canvas và không sửa `customHtml`.

### 1.4 Runtime step/navigation

Các file:

- `MegaForm.UI/src/renderer/index.ts`
- file mới `MegaForm.UI/src/renderer/premium-step-reconcile.ts`

Kết quả:

- Premium shell có native rail dùng `premiumStepIndex` để ẩn item thừa, cắt connector và đánh số hiển thị lại.
- Form `customHtml` không có native premium rail nhưng được thêm page-break sẽ nhận generic schema-driven navigation.
- Nếu shell đã có action row/button, runtime tái sử dụng đúng button/style authored để tránh sinh nút thừa.
- Back được ẩn ở trang đầu; forward đổi Next → Submit ở trang cuối.
- Field group trong custom shell được page theo schema.
- Form chỉ còn một trang không giữ step nav `1 / 4`; submit chrome trở lại trạng thái single-page.

### 1.5 Invoice card thừa — client + SSR + generator

Các file:

- `MegaForm.UI/src/renderer/index.ts`
- `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs`
- file mới `tools/templates/build-invoice-templates.mjs`
- ba JSON mới:
  - `Samples/FormTemplates/Premium/DONEE/invoice-orange-application.json`
  - `Samples/FormTemplates/Premium/DONEE/invoice-dark-application.json`
  - `Samples/FormTemplates/Premium/DONEE/invoice-minimal-application.json`

Rule cuối cùng cho ba skin:

```css
.mfp.mfp-invoice-... .io-page {
  background: transparent !important;
  padding: 0 !important;
  min-height: 0 !important;
}
```

`.io-card` authored vẫn giữ nguyên thiết kế, max-width 768px và căn giữa.

Quan trọng: public DNN là SSR (`data-mf-ssr="1"`), nên sửa client renderer một mình không đủ.
Rule tương đương đã được thêm vào `CustomShellCompatibilityCssService`.

Generator là canonical source của ba JSON và cũng đã đổi:

```js
${R} .io-page{background:transparent;padding:0;min-height:0;}
```

Chạy lại generator đã xác nhận `customHtml` không đổi:

| Template | SHA256 `customHtml` |
|---|---|
| dark | `856807E0CCEA0367FB791F2A13922A271586818849B35FD14BDD12FD37EF5710` |
| minimal | `78940DCA4A3F16F1B30942DF79E92EBAEC6A926BDBB0256465559C2C82F16618` |
| orange | `48C194E6CA01074C4DEB4D27FA8063C8479613D09F80705B177E0DFC1B894650` |

## 2. Allowlist commit

### 2.1 File mới phải stage toàn bộ

```text
MegaForm.UI/src/shared/form-steps.ts
MegaForm.UI/src/shared/premium-native-migration.ts
MegaForm.UI/src/dashboard/wizard/premium-steps.ts
MegaForm.UI/src/builder/steps-panel.ts
MegaForm.UI/src/renderer/premium-step-reconcile.ts
tools/templates/build-invoice-templates.mjs
Samples/FormTemplates/Premium/DONEE/invoice-orange-application.json
Samples/FormTemplates/Premium/DONEE/invoice-dark-application.json
Samples/FormTemplates/Premium/DONEE/invoice-minimal-application.json
```

`premium-native-migration.ts`, `premium-steps.ts` và `premium-step-reconcile.ts` đã tồn tại trong
working tree trước phần chỉnh cuối, nhưng vẫn đang `??` và là dependency bắt buộc của source tracked.
Không được bỏ chúng khỏi commit.

### 2.2 File tracked có diff thuộc scope này

```text
MegaForm.UI/src/dashboard/wizard/step-fields.ts
MegaForm.UI/src/dashboard/wizard/transform.ts
MegaForm.UI/src/dashboard/wizard/preview.ts
MegaForm.UI/src/dashboard/wizard/step-setup.ts
MegaForm.UI/src/dashboard/wizard/types.ts
MegaForm.UI/src/builder/dom.ts
MegaForm.UI/src/builder/index.ts
MegaForm.UI/src/renderer/index.ts
MegaForm.Core/Services/CustomShellCompatibilityCssService.cs
MegaForm.UI/public/i18n/ar-SA.json
MegaForm.UI/public/i18n/de-DE.json
MegaForm.UI/public/i18n/en-US.json
MegaForm.UI/public/i18n/hi-IN.json
MegaForm.UI/public/i18n/id-ID.json
MegaForm.UI/public/i18n/it-IT.json
MegaForm.UI/public/i18n/nl-NL.json
MegaForm.UI/public/i18n/pl-PL.json
MegaForm.UI/public/i18n/pt-BR.json
MegaForm.UI/public/i18n/ru-RU.json
MegaForm.UI/public/i18n/th-TH.json
MegaForm.UI/public/i18n/tr-TR.json
MegaForm.UI/public/i18n/vi-VN.json
```

Mỗi locale hiện chỉ có đúng block 17 key `steps.*`, nên có thể stage nguyên file locale.

### 2.3 File mixed — bắt buộc stage theo hunk

`MegaForm.UI/src/builder/canvas.ts` có cả thay đổi step editor và một thay đổi kéo field vào Row
không thuộc task này.

Dùng:

```powershell
git add -p -- MegaForm.UI/src/builder/canvas.ts
```

Accept các hunk:

- import `listSteps` thay `fieldStepMap`
- helper `stepT`
- `schemaSteps` / `stepAtIndex`
- `makeStepDivider(...)` editable

Reject các hunk chứa:

```text
[Lỗi1 2026-07-18]
Allow dragging an EXISTING top-level field into a cell
Moving an existing top-level field into a cell is now allowed
```

### 2.4 Không stage

- Bundle/build output hoặc platform copy bị ignore.
- QA backup dưới `QA/`, `qa-*`, `tmp-*`.
- Các file Docs, SDK, Umbraco, Cloud Storage, AI, Inbox, SQL và hàng trăm thay đổi khác đang nằm
  trong dirty tree.
- Không stage `AGENTS.md`.

## 3. Cách stage an toàn

Có thể làm một commit chung vì `renderer/index.ts` chứa cả step runtime và invoice SSR parity phía client:

```powershell
git add -- `
  MegaForm.UI/src/shared/form-steps.ts `
  MegaForm.UI/src/shared/premium-native-migration.ts `
  MegaForm.UI/src/dashboard/wizard/premium-steps.ts `
  MegaForm.UI/src/builder/steps-panel.ts `
  MegaForm.UI/src/renderer/premium-step-reconcile.ts `
  MegaForm.UI/src/dashboard/wizard/step-fields.ts `
  MegaForm.UI/src/dashboard/wizard/transform.ts `
  MegaForm.UI/src/dashboard/wizard/preview.ts `
  MegaForm.UI/src/dashboard/wizard/step-setup.ts `
  MegaForm.UI/src/dashboard/wizard/types.ts `
  MegaForm.UI/src/builder/dom.ts `
  MegaForm.UI/src/builder/index.ts `
  MegaForm.UI/src/renderer/index.ts `
  MegaForm.Core/Services/CustomShellCompatibilityCssService.cs `
  tools/templates/build-invoice-templates.mjs `
  Samples/FormTemplates/Premium/DONEE/invoice-orange-application.json `
  Samples/FormTemplates/Premium/DONEE/invoice-dark-application.json `
  Samples/FormTemplates/Premium/DONEE/invoice-minimal-application.json

git add -- MegaForm.UI/public/i18n/ar-SA.json `
  MegaForm.UI/public/i18n/de-DE.json `
  MegaForm.UI/public/i18n/en-US.json `
  MegaForm.UI/public/i18n/hi-IN.json `
  MegaForm.UI/public/i18n/id-ID.json `
  MegaForm.UI/public/i18n/it-IT.json `
  MegaForm.UI/public/i18n/nl-NL.json `
  MegaForm.UI/public/i18n/pl-PL.json `
  MegaForm.UI/public/i18n/pt-BR.json `
  MegaForm.UI/public/i18n/ru-RU.json `
  MegaForm.UI/public/i18n/th-TH.json `
  MegaForm.UI/public/i18n/tr-TR.json `
  MegaForm.UI/public/i18n/vi-VN.json

git add -p -- MegaForm.UI/src/builder/canvas.ts
```

Sau đó bắt buộc:

```powershell
git diff --cached --name-status
git diff --cached --check
git diff --cached -- MegaForm.UI/src/builder/canvas.ts
```

Commit message gợi ý:

```text
feat(forms): add shared step editing and fix invoice shell card
```

Nếu muốn tách hai commit, dùng `git add -p` cho `renderer/index.ts`; hunk invoice nằm trong
`buildCustomShellCompatibilityCss()`. Không cần tách nếu điều đó tăng rủi ro stage nhầm.

## 4. Build bắt buộc trước commit

Từ repo root:

```powershell
node tools/templates/build-invoice-templates.mjs

Push-Location MegaForm.UI
npm run build:dashboard
npm run build:builder
npm run build:renderer
npm run i18n:check
Pop-Location

dotnet build MegaForm.Core/MegaForm.Core.csproj -c Release -f net472 --no-restore
```

Nếu cần xác nhận DNN assembly/package:

```powershell
dotnet build MegaForm.DNN/MegaForm.DNN.csproj -c Release --no-restore
```

Known unrelated failure:

```text
MegaForm.UI/src/builder/workflow/wf-app.ts(785,3): TS1128
```

Nếu `npm run typecheck` vẫn chỉ dừng tại lỗi trên thì ghi là pre-existing; các Vite entry build ở trên
mới là gate bắt buộc cho task này.

Trạng thái đã chạy ở lượt Codex:

- `npm run build:renderer` — PASS
- `npm run i18n:check` — PASS
- `dotnet build MegaForm.Core ... -f net472` — PASS, 0 error, 2 warning cũ
- Generator — 3/3 JSON parse được, braces cân bằng, không thiếu field placeholder

Claude vẫn phải chạy lại toàn bộ dashboard/builder/renderer sau khi stage để xác nhận index cuối.

## 5. Deploy/QA đã thực hiện

Site:

```text
http://dnn10_3_3_test20.ai
host / dnnhost
App pool: DNN10_3_3_Test20.AI_nvQuickSite
```

Đã deploy:

- `MegaForm.Core.dll`
- `Assets/js/megaform-renderer.js`
- `HostSettings.CrmVersion = 66`
- app pool đang `Started`

Hash bản deploy:

```text
MegaForm.Core.dll
30333E980ADC598EFE30A571DBFEB87D6909B4E71F0577EFF6323129E986E2B7

megaform-renderer.js
3655E0F4373C660BA3C8DBBF4CA4B324D3953163DDD0435DDDAA4AC2FCC82C01
```

Visual/DOM QA Form 18 sau deploy:

```text
URL: http://dnn10_3_3_test20.ai/Home/formid/18?qa=invoice-card-v66
data-mf-ssr = 1
.io-page background = rgba(0, 0, 0, 0)
.io-page padding = 0px
.io-page min-height = 0px
.io-card background = rgb(34, 34, 34)
.io-card width = 768px, centered
SSR style block chứa rule .mfp.mfp-invoice-dark .io-page
```

Không submit form trong lượt QA card cuối.

## 6. Regression checklist sau build

1. Wizard premium: add, rename và delete step; delete giữ nguyên toàn bộ field.
2. Builder: accordion Steps và canvas divider cho cùng số step.
3. Delete step giữa: field merge về step trước.
4. Delete step đầu: merge forward.
5. Không thể delete step cuối cùng.
6. Premium rail 4 item + schema 3 page: chỉ còn 3 item visible, connector đúng.
7. `premiumStepIndex` của Section sống sót không bị renumber.
8. Custom shell không có native rail + thêm page-break: có navigation, không sinh button thiết kế sai/thừa.
9. Single-page form: không hiện step nav `1 / 4`; submit hoạt động như form một trang.
10. Form 18: chỉ còn một dark invoice card ở giữa, không còn nền/card đen rộng bên ngoài.
11. Không có thay đổi byte ngoài ý muốn trong `customHtml` của ba invoice khi chạy generator.

## 7. Những điều không được “sửa thêm” trong lượt commit/build

- Không cắt `data-step` hoặc rewrite premium `customHtml`.
- Không renumber `premiumStepIndex`.
- Không nhét generic step nav vào `.io-card`/invoice body.
- Không thêm hardcode tiếng Việt vào TypeScript.
- Không khôi phục footer-width override đã bị loại bỏ; final card fix chỉ chạm `.io-page`.
- Không chạy formatter toàn repo.
- Không dọn hoặc commit các thay đổi ngoài allowlist.

