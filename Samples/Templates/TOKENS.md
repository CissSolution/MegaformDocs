# MegaForm Template Token Reference

Tổng hợp toàn bộ token cho **view-level templates** (list/card/detail) — đây là engine mạnh nhất, hỗ trợ loops + format specs + auto HTML-escape.

> Form-level `settings.customHtml` (whole-form template) chỉ hỗ trợ subset đơn giản hơn: `{{form:title}}`, `{{field:KEY}}`, `{{content:*}}`, `{{script:*}}`. Document này nói về view-level (mạnh hơn).

## Token sources

| Source | Tokens | Mô tả |
|---|---|---|
| **field** | `{{field:fieldKey}}` `{{field:address:street}}` (nested) | Giá trị field của submission |
| **submission** | `{{submission:id}}` `{{submission:formId}}` `{{submission:date}}` `{{submission:status}}` `{{submission:activeTaskId}}` | Metadata submission |
| **submissions** | `{{submissions:count}}` | Tổng số (dùng trong listview) |
| **form** | `{{form:id}}` `{{form:title}}` `{{form:description}}` | Form context |
| **module** | `{{module:id}}` `{{module:pageId}}` | DNN module / Oqtane module context |
| **user** | `{{user:id}}` `{{user:displayName}}` `{{user:email}}` | Người dùng hiện tại |
| **query** | `{{query:customParam}}` | Query string của URL hiện tại |
| **repeat** | `{{repeat:index}}` `{{repeat:index1}}` `{{repeat:count}}` `{{repeat:isFirst}}` `{{repeat:isLast}}` `{{repeat:alternator2}}` `{{repeat:alternator3}}` `{{repeat:alternator4}}` `{{repeat:alternator5}}` | Chỉ trong `<mf-repeat>` loop |

## Format specifier

Syntax: `{{source:key|format=SPEC}}`

### Date format
```
{{submission:date|format=yyyy-MM-dd}}     → 2026-05-16
{{submission:date|format=dd/MM/yyyy HH:mm}} → 16/05/2026 15:30
{{field:dueDate|format=yyyy}}             → 2026
```
Tokens: `yyyy`, `yy`, `MM`, `M`, `dd`, `d`, `HH`, `H`, `mm`, `m`, `ss`, `s`

### Number format
```
{{field:amount|format=C2}}       → $84,500.00     (currency 2 decimals)
{{field:amount|format=N0}}       → 84,500          (number, no decimals)
{{field:rate|format=P1}}         → 12.5%           (percent 1 decimal)
{{field:count|format=D}}         → 84500           (integer)
```

### String format
```
{{field:name|format=upper}}      → NGUYEN VAN A
{{field:title|format=title}}     → Director Of Operations
{{field:slug|format=lower}}      → po-2026-0042
```

### Raw / unescape
```
{{content:bodyHtml|format=raw}}  → injects HTML without escaping (cẩn thận XSS)
{{content:bodyHtml|format=text}} → strips HTML tags
```

## Loops via `<mf-repeat>`

```html
<mf-repeat each="item in submissions">
  <div class="card">
    <span class="num">#{{repeat:index1}}</span>
    <strong>{{item:field:fullName}}</strong>
    <em>{{item:submission:date|format=dd/MM/yyyy}}</em>
  </div>
</mf-repeat>
```

- `each="VARNAME in SOURCE:KEY"` — VARNAME thành source tạm trong block
- Truy cập property: `{{VARNAME:field:KEY}}`, `{{VARNAME:submission:KEY}}`
- Lồng được: `<mf-repeat each="row in items"><mf-repeat each="cell in row:cells">...`
- `repeat:alternator2` trả về `0` hoặc `1` cho row chẵn/lẻ (zebra striping)

## HTML escape (XSS)

**Mặc định bật**. Mọi token output được escape (`<` → `&lt;`, `&` → `&amp;`, etc.) trừ khi anh đặt `|format=raw`.

## Không hỗ trợ (yet)

- `{{#if condition}}...{{/if}}` — chưa có conditional
- `{{#unless}}` `{{#else}}` — chưa
- Custom helpers — chưa expose extension API
- Server-side rendering — toàn bộ là client-side

## Sample templates — Outlook / SharePoint enterprise style

Không phải template đơn — đây là full enterprise UI với multi-pane, command bar, properties pane, approval flow visualization, activity feed, comments thread. Mỗi file ~300-500 dòng HTML+CSS inline.

| File | Style | Apply vào view | Layout chính |
|---|---|---|---|
| [DocumentCard.html](DocumentCard.html) | **Outlook** | `document-card` / `document-routing-board` | 3-pane: folder rail (categories + workflow stages) · message list (Focused inbox) · reading pane (sender avatar + properties grid + attachments + activity timeline) |
| [PurchaseOrderCard.html](PurchaseOrderCard.html) | **SharePoint** | `po-card` / `po-detail` | Site chrome + breadcrumb + command bar + hero banner + web parts grid (Approval flow / Properties / Status ring / Financial / Items table / Justification / Activity / Comments thread) |
| [LeaveRequestRow.html](LeaveRequestRow.html) | **Outlook** | `leave-request-board` | 3-pane: folder rail + balance widget · inbox list (Focused tab + leave-type pills) · reading pane (calendar preview + reason box + approval timeline) |
| [ProposalDetail.html](ProposalDetail.html) | **SharePoint** | `proposal-card` / `proposal-review-board` | Site chrome + breadcrumb + command bar + gradient hero + web parts grid (Approval flow / Executive summary / Budget gradient card / Status ring / Timeline milestones / Team avatars / Properties / Risk pills / Related items / Activity feed / Comments thread) |

### Apply nhanh (SQL)
[_apply-samples.sql](_apply-samples.sql) — đọc file .html từ disk + UPDATE vào `MF_FormViews.CustomHtml` cho 12 view keys. Chạy 1 lần là 4 starter có UI Outlook/SharePoint ngay.

```bash
sqlcmd -S 'WINDOWS-11\SQLEXPRESS' -E -d 'Oqtane_MSSQL' -I -i 'Samples\Templates\_apply-samples.sql'
# Đổi -d Oqtane_MSSQL thành -d DNN10322_MegaTest để apply cho DNN
```

Sau đó refresh trình duyệt — mỗi view giờ render theo Outlook/SharePoint style.

Mỗi template có CSS đi kèm trong `<style>` tag — gắn vào `FormViewInfo.CustomHtml` hoặc tách CSS ra `FormViewInfo.CustomCss`.

## Cách apply template vào view

### Option 1 — Builder UI
1. Builder → tab **Views** → chọn view (e.g. `document-card`)
2. Tab **Custom HTML** → paste content từ sample template
3. Save

### Option 2 — SQL
```sql
USE Oqtane_MSSQL;  -- hoặc DNN10322_MegaTest
UPDATE dbo.MF_FormViews
SET CustomHtml = N'<paste-template-content>'
WHERE FormId = <N> AND ViewKey = 'document-card';
```

### Option 3 — Starter service code
Update `EnsureViews()` của starter service để set CustomHtml khi tạo view lần đầu. Sample đã wire trong `DocumentExchangeStarterService` v20260516-09 (xem [DocumentCard.html](DocumentCard.html) embedded).
