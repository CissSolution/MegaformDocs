# Hướng dẫn Deploy Blog Starter lên dnn10322_megaf.ai

## 📦 Package đã build

| File | Path | Size |
|------|------|------|
| Install ZIP | `CustomerDelivery/2026-05-25_DNN_MegaForm_01.06.22_Install.zip` | ~2.6 MB |
| SQL Script | `MegaForm.DNN/SqlScripts/01.06.22.SqlDataProvider` | Auto-register scheduler |

## 🚀 Các tính năng mới trong 01.06.22

### 1. Publish Scheduling Automation
- Tự động publish bài viết khi `publish_date` đến hạn
- Kiểm tra `embargo_until` (nếu có)
- Chạy mỗi 5 phút qua DNN Scheduler

### 2. Analytics Rollup Service
- Tổng hợp `reader-events` (read, share, like, bookmark, newsletter_click)
- Cập nhật `view_count`, `unique_readers`, `share_count`, `like_count`, `bookmark_count`
- Chạy đồng thờ với publish scheduler

### 3. DNN ScheduleItem
- Auto-registered trong SQL script 01.06.22
- Chạy cho tất cả active portals

## 🔧 Bước cài đặt trên dnn10322_megaf.ai

### Bước 1: Install Package
1. Login DNN Admin: http://dnn10322_megaf.ai/Login
   - Username: `host`
   - Password: `dnnhost`
2. Click **DNN Logo** (góc trái trên) → **Settings** → **Extensions**
3. Click **Install Extension**
4. Upload: `CustomerDelivery/2026-05-25_DNN_MegaForm_01.06.22_Install.zip`
5. Follow wizard → Accept License → Complete Install

### Bước 2: Tạo Page Blog
1. **Content** → **Pages** → **Add Page**
2. Page Name: `Blog`
3. URL: `/blog`
4. Add Module: **MegaForm**
5. Save Page

### Bước 3: Seed Blog Starter
1. Vào page Blog (vừa tạo)
2. Click **MegaForm Admin Dock** → **Business Starters**
3. Chọn **Blog Publishing Starter**
4. Click **Launch**

### Bước 4: Verify Scheduler
1. **Settings** → **Scheduler** (hoặc Host > Schedule)
2. Tìm task: **MegaForm Blog Publish & Analytics**
3. Ensure **Enabled** = true
4. Time Lapse: 5 minutes

### Bước 5: Test
1. Mở `http://dnn10322_megaf.ai/blog?vk=blog-home`
2. Kiểm tra dashboard, form render, submissions
3. Tạo 1 post với status = `scheduled` và `publish_date` = 1 phút sau
4. Đợi 5 phút → kiểm tra post tự động chuyển sang `published`

## 📁 File code đã tạo/sửa

```
MegaForm.Core/Services/Blog/
  IScheduledPublishService.cs
  ScheduledPublishService.cs
  IAnalyticsRollupService.cs
  BlogAnalyticsRollupService.cs
  BlogManifestHelper.cs

MegaForm.DNN/Services/
  BlogScheduledPublishTask.cs

MegaForm.Oqtane.Server/Services/
  BlogScheduledHostedService.cs

MegaForm.DNN/SqlScripts/
  01.06.22.SqlDataProvider
```

## 🔄 Nếu site đã cài MegaForm cũ

Nếu dnn10322_megaf.ai đã có MegaForm bản cũ (dù script kiểm tra cho thấy chưa có):
1. Vào **Extensions** → tìm MegaForm → **Upgrade**
2. Upload package 01.06.22
3. SQL script sẽ tự chạy (thêm scheduler task)
4. Reseed Blog starter nếu cần

## 🆘 Troubleshooting

| Vấn đề | Cách xử lý |
|--------|-----------|
| "ScheduleItem không chạy" | Vào Host > Scheduler, click **Run Now** để test |
| "Analytics không cập nhật" | Kiểm tra form reader-events có submission không |
| "Scheduled post không publish" | Kiểm tra `publish_date` format (YYYY-MM-DDTHH:mm:ssZ) |
| "Blog starter seed fail" | Check DNN Event Log (Admin > Event Viewer) |
