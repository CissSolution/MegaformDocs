# Trạng thái Deploy Blog lên dnn10322_megaf.ai

## ✅ Đã hoàn thành

### 1. Package build thành công
- **Version:** 01.06.22
- **File:** `CustomerDelivery/2026-05-25_DNN_MegaForm_01.06.22_Install.zip`

### 2. Tính năng mới đã implement
| Tính năng | File |
|-----------|------|
| Publish Scheduling Automation | `MegaForm.Core/Services/Blog/ScheduledPublishService.cs` |
| Analytics Rollup Service | `MegaForm.Core/Services/Blog/BlogAnalyticsRollupService.cs` |
| DNN Scheduler Task | `MegaForm.DNN/Services/BlogScheduledPublishTask.cs` |
| Oqtane Hosted Service | `MegaForm.Oqtane.Server/Services/BlogScheduledHostedService.cs` |

### 3. Seed Blog Starter thành công (qua API)
- **FormId:** 255
- **AppKey:** blog-starter
- **DefaultViewKey:** blog-home
- **19 views** được tạo
- **5 roles** được tạo (Blog Authors, Editors, SEO Reviewers, Legal Reviewers, Publishers)
- **Sample data:** 34 posts, 12 categories, comments, reader-events

### 4. Dashboard hoạt động
- URL: `http://dnn10322_megaf.ai/xx#mf-dashboard`
- Login: host / dnnhost
- 59 forms, 9 submissions

---

## ⚠️ Vấn đề còn lại: Module chưa render Blog form

**Nguyên nhân:** `__MF_PLATFORM__.formId = 0`

Module MegaForm (moduleId=1477) trên page `/xx` chưa được bind với form 255. API `BindStarterModule` đã lưu settings vào DB:
- `MegaForm_FormId` = 255
- `MegaForm_CustomViewKey` = blog-home
- `MegaForm_ModuleConfigured` = true

Nhưng DNN module cache chưa refresh, nên module vẫn đọc `formId = 0`.

---

## 🔧 Cách khắc phục (chọn 1 trong 3)

### Cách 1: Clear DNN Cache (khuyên dùng)
1. Login DNN admin: `http://dnn10322_megaf.ai/Login`
2. Click **DNN Logo** (góc trái trên) → **Settings** → **Server**
3. Tab **Performance**
4. Click **Clear Cache**
5. Refresh page `/xx?vk=blog-home`

### Cách 2: Restart IIS / App Pool
1. Remote desktop vào server
2. IIS Manager → Application Pools
3. Find pool cho `dnn10322_megaf.ai`
4. Click **Recycle** hoặc **Restart**

### Cách 3: Manual Module Settings (nếu cache clear không được)
1. Login DNN admin
2. Persona Bar → **Content** → **Pages**
3. Chọn page **xx**
4. Tìm module **MegaForm** trong layout
5. Hover module → click **gear icon** → **Settings**
6. Chọn:
   - **Form:** Blog Publishing Starter
   - **View Mode:** Form / ListView (tùy mục đích)
7. Save

---

## 🧪 Sau khi fix, test các URL

| URL | Kỳ vọng |
|-----|---------|
| `/xx?vk=blog-home` | Hiển thị blog homepage với card grid |
| `/xx?vk=blog-detail` | Hiển thị detail view 1 post |
| `/xx?vk=blog-editorial-board` | Workflow inbox cho editors |
| `/xx?vk=blog-archive` | Archive với filter |
| `/xx#mf-dashboard` | Admin dashboard (đã OK) |
| `/xx?view=form` | Form submit tạo post mới |

---

## 📋 Test Publish Scheduling

1. Tạo post mới với status = `scheduled`
2. Set `publish_date` = 1 phút sau hiện tại
3. Save submission
4. Đợi 5 phút (scheduler chạy mỗi 5 phút)
5. Kiểm tra submission tự động chuyển sang `published`

---

## 📋 Test Analytics Rollup

1. Mở 1 post public
2. Ghi nhận `reader-events` (read, like, share)
3. Đợi scheduler chạy
4. Kiểm tra `view_count`, `like_count` trên post được cập nhật
