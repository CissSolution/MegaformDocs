using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models.ExternalTable;

namespace MegaForm.Core.Services.ExternalTable
{
    /// <summary>
    /// [ATBE P0] The decision matrix. Every axis votes a maximum mode and the table gets the MINIMUM
    /// of those votes — one blocked axis downgrades the whole form. Nothing here is negotiable and
    /// nothing here is an LLM call: the same profile always yields the same mode.
    ///
    /// Ladder: unsupported &lt; readonly &lt; insertonly &lt; readwrite.
    /// </summary>
    public static class CapabilityDecisionEngine
    {
        private const string Unsupported = "unsupported";
        private const string ReadOnly = "readonly";
        private const string InsertOnly = "insertonly";
        private const string ReadWrite = "readwrite";

        private static int Rank(string mode)
        {
            switch (mode)
            {
                case ReadWrite: return 3;
                case InsertOnly: return 2;
                case ReadOnly: return 1;
                default: return 0;
            }
        }

        public static void Decide(CapabilityProfile p)
        {
            var caps = new CapabilityFacts();
            p.Capabilities = caps;

            string mode = ReadWrite;
            Action<string, string, string, string, string> vote = (cap, code, message, howToFix, severity) =>
            {
                if (Rank(cap) < Rank(mode)) mode = cap;
                if (code != null)
                    caps.Reasons.Add(new CapabilityReason { Code = code, Message = message, HowToFix = howToFix, Severity = severity });
            };

            // ---- Axis E: object + environment -------------------------------------------------
            if (p.Object.SchemaCollision)
            {
                vote(Unsupported, "SCHEMA_COLLISION",
                    "Có nhiều bảng cùng tên '" + p.Object.Name + "' ở các schema khác nhau (" + string.Join(", ", p.Object.CollidingSchemas) + "). MegaForm không đoán.",
                    "Chọn rõ schema rồi dò lại.", "error");
                Finalize(p, caps, mode);
                return;
            }
            if (p.Object.Type == "UNKNOWN")
            {
                vote(Unsupported, "OBJECT_NOT_FOUND",
                    "Không tìm thấy bảng/view này, hoặc tài khoản DB không nhìn thấy nó.",
                    "Kiểm tra tên bảng và quyền của tài khoản kết nối.", "error");
                Finalize(p, caps, mode);
                return;
            }
            if (p.Columns.Count == 0)
            {
                vote(Unsupported, "NO_COLUMNS_VISIBLE",
                    "Không đọc được cột nào. Tài khoản DB có thể bị chặn đọc metadata.",
                    "Cấp quyền VIEW DEFINITION (hoặc SELECT) trên bảng cho tài khoản kết nối.", "error");
                Finalize(p, caps, mode);
                return;
            }
            if (!p.Permissions.Select)
            {
                vote(Unsupported, "PERM_NO_SELECT",
                    "Tài khoản DB không có quyền SELECT trên " + p.Object.Schema + "." + p.Object.Name + ".",
                    "Cấp quyền SELECT rồi dò lại.", "error");
                Finalize(p, caps, mode);
                return;
            }

            if (p.Object.Type == "VIEW")
                vote(ReadOnly, "OBJECT_IS_VIEW",
                    "Đối tượng này là VIEW — MegaForm chỉ đọc, không ghi.",
                    "Bind vào bảng gốc nếu cần gửi biểu mẫu.", "info");

            if (string.Equals(p.Connection.Updateability, "READ_ONLY", StringComparison.OrdinalIgnoreCase))
                vote(ReadOnly, "DB_READ_ONLY",
                    "Database đang ở chế độ READ_ONLY (replica hoặc ApplicationIntent=ReadOnly) — quyền ghi có cũng vô nghĩa.",
                    "Trỏ connection vào primary nếu cần ghi.", "warning");

            if (p.Connection.Provider != "SqlServer" && p.Coverage.MetadataLevel != "L2")
                vote(ReadOnly, "PROVIDER_METADATA_LIMITED",
                    "Provider " + p.Connection.Provider + " chưa đọc đủ metadata (khoá/identity/default) để ghi an toàn.",
                    "Dùng SQL Server, hoặc khai báo khoá thủ công.", "warning");

            if (p.Connection.IsDbOwner)
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "RLS_DBO_BYPASS",
                    Message = "Tài khoản kết nối là db_owner — nếu bảng có Row-Level Security thì RLS BỊ BỎ QUA và MegaForm sẽ thấy toàn bộ dữ liệu.",
                    HowToFix = "Hạ quyền tài khoản ứng dụng xuống mức tối thiểu (SELECT/INSERT/UPDATE trên đúng bảng cần).",
                    Severity = "warning",
                });

            // ---- Axis W: permissions ----------------------------------------------------------
            if (!p.Permissions.Insert)
                vote(ReadOnly, "PERM_NO_INSERT",
                    "Tài khoản DB chỉ có quyền đọc — không gửi được biểu mẫu mới.",
                    "Cấp quyền INSERT trên bảng này để bật gửi biểu mẫu.", "info");

            if (!p.Permissions.Update)
                vote(InsertOnly, "PERM_NO_UPDATE",
                    "Không sửa được bản ghi: tài khoản DB không có quyền UPDATE.",
                    "Cấp quyền UPDATE nếu muốn sửa dữ liệu cũ. (Trạng thái Đã đọc/Lưu trữ vẫn dùng được — MegaForm lưu riêng, không ghi vào bảng của bạn.)", "info");

            // ---- Axis K: key ------------------------------------------------------------------
            if (!p.Key.Trusted)
            {
                var detail = p.Key.Source == "none"
                    ? "Bảng không có khoá chính hoặc unique index đáng tin."
                    : "Khoá phát hiện được không đáng tin (mẫu " + p.Key.Verified.Sampled + " dòng: "
                      + p.Key.Verified.Duplicates + " trùng, " + p.Key.Verified.Nulls + " null).";
                vote(InsertOnly, "NO_TRUSTED_KEY",
                    detail + " MegaForm không thể định danh an toàn một dòng → tắt Xem chi tiết/Sửa/Xoá.",
                    "Thêm PRIMARY KEY hoặc UNIQUE INDEX (cột NOT NULL) rồi bấm Dò lại.", "warning");
            }

            // ---- Axis C: columns --------------------------------------------------------------
            var blocking = p.Columns
                .Where(c => c.Unsupported && !c.Nullable && !c.HasDefault && !c.IsIdentity && !c.IsComputed)
                .ToList();
            if (blocking.Count > 0)
                vote(ReadOnly, "UNSUPPORTED_REQUIRED_COLUMN",
                    "Cột bắt buộc " + string.Join(", ", blocking.Select(c => c.Name + " (" + c.SqlType + ")"))
                    + " có kiểu MegaForm không biểu diễn được → không thể INSERT hợp lệ.",
                    "Cho cột này một DEFAULT ở DB, hoặc cho phép NULL, rồi dò lại.", "error");

            var encrypted = p.Columns.Where(c => c.IsEncrypted).ToList();
            if (encrypted.Count > 0)
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "ALWAYS_ENCRYPTED_COLUMNS",
                    Message = "Cột mã hoá (Always Encrypted): " + string.Join(", ", encrypted.Select(c => c.Name)) + " — không lọc/sắp xếp được.",
                    HowToFix = "Bật 'Column Encryption Setting=Enabled' trên connection nếu cần đọc/ghi các cột này.",
                    Severity = "warning",
                });

            if (p.Object.HasInsteadOfTrigger)
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "INSTEAD_OF_TRIGGER",
                    Message = "Bảng có INSTEAD OF trigger — SCOPE_IDENTITY() sẽ trả sai khoá; MegaForm chuyển sang OUTPUT..INTO.",
                    HowToFix = "Không cần làm gì; chỉ cần biết rằng dữ liệu ghi vào có thể bị trigger biến đổi.",
                    Severity = "warning",
                });
            else if (p.Object.TriggerKnowledge == "unknown")
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "TRIGGER_UNKNOWN",
                    Message = "Không đọc được danh sách trigger của bảng — MegaForm giả định CÓ trigger (fail-safe) và dùng OUTPUT..INTO.",
                    HowToFix = "Cấp quyền đọc sys.triggers nếu muốn chẩn đoán chính xác.",
                    Severity = "info",
                });

            // ---- Axis T: semantics ------------------------------------------------------------
            caps.HasTimestamp = p.Semantics.Time != null;
            caps.HasStatus = p.Semantics.Status != null;
            caps.StatusFilterable = p.Semantics.Status != null && p.Semantics.Status.Filterable;

            if (p.Semantics.Time == null)
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "NO_TIME_COLUMN",
                    Message = "Không tìm thấy cột thời gian → danh sách sắp xếp theo khoá giảm dần thay vì theo ngày.",
                    HowToFix = "Chỉ định cột ngày thủ công nếu bảng có (tên không theo quy ước).",
                    Severity = "info",
                });
            else if (!p.Semantics.Time.ConfirmedByAdmin)
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "TIME_COLUMN_NEEDS_CONFIRM",
                    Message = "Cột thời gian đề xuất: " + p.Semantics.Time.Name + " (" + p.Semantics.Time.Evidence + "). Múi giờ (UTC hay giờ địa phương) máy KHÔNG suy ra được.",
                    HowToFix = "Xác nhận cột và múi giờ — chọn sai sẽ lệch giờ trên toàn bộ dashboard.",
                    Severity = "warning",
                });

            // ---- Axis S: scale + index --------------------------------------------------------
            caps.RequiresFilterBeforeList = p.Size.Bucket == "XL";
            if (p.Size.Bucket == "XL")
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "BIG_TABLE_FILTER_REQUIRED",
                    Message = "Bảng rất lớn (≈" + p.Size.ApproxRows.ToString("N0") + " dòng) — bắt buộc chọn bộ lọc trước khi xem danh sách; không hiển thị tổng số chính xác.",
                    HowToFix = "Không cần làm gì — đây là cách duy nhất để không quét toàn bảng.",
                    Severity = "info",
                });

            var sortTarget = p.Semantics.Time != null
                ? p.Columns.FirstOrDefault(c => string.Equals(c.Name, p.Semantics.Time.Name, StringComparison.OrdinalIgnoreCase))
                : null;
            if (sortTarget != null && !sortTarget.Sortable && p.Size.Bucket != "S")
                caps.Reasons.Add(new CapabilityReason
                {
                    Code = "NO_INDEX_FOR_SORT",
                    Message = "Cột " + sortTarget.Name + " chưa có index — sắp xếp theo cột này sẽ quét toàn bộ ≈" + p.Size.ApproxRows.ToString("N0") + " dòng.",
                    HowToFix = "CREATE INDEX IX_" + p.Object.Name + "_" + sortTarget.Name + " ON " + p.Object.Schema + "." + p.Object.Name + " (" + sortTarget.Name + " DESC);  — script gợi ý cho DBA, MegaForm KHÔNG tự chạy DDL.",
                    Severity = "warning",
                });

            // ---- Conclusions -------------------------------------------------------------------
            Finalize(p, caps, mode);
        }

        private static void Finalize(CapabilityProfile p, CapabilityFacts caps, string mode)
        {
            caps.Mode = mode;

            bool addressable = p.Key.Trusted;
            caps.CanInsert = Rank(mode) >= Rank(InsertOnly) && p.Permissions.Insert;
            caps.CanUpdate = mode == ReadWrite && p.Permissions.Update && addressable;
            caps.CanDelete = mode == ReadWrite && p.Permissions.Delete && addressable;
            caps.CanOpenDetail = Rank(mode) >= Rank(ReadOnly) && addressable;
            caps.CanSort = Rank(mode) >= Rank(ReadOnly) && p.Columns.Any(c => c.Sortable);
            caps.CanFilterServer = Rank(mode) >= Rank(ReadOnly) && p.Columns.Any(c => c.Filterable);
            caps.CanExport = Rank(mode) >= Rank(ReadOnly);

            // Never aggregatable: the All-Forms view fans out across forms and merges client-side,
            // which would drag the customer's whole table through the browser.
            caps.Aggregatable = false;

            if (Rank(mode) >= Rank(ReadOnly))
            {
                if (p.FullText.Enabled && p.Columns.Any(c => c.Searchable && c.IsLob))
                    caps.CanSearch = "fulltext";
                else if (p.Size.Bucket == "S" && p.Columns.Any(c => c.Searchable))
                    caps.CanSearch = "substring";
                else if (p.Columns.Any(c => c.Searchable))
                    caps.CanSearch = "prefix";
                else
                    caps.CanSearch = "off";
            }

            var actions = new List<string>();
            if (Rank(mode) >= Rank(ReadOnly)) actions.Add("read");
            if (caps.CanInsert) actions.Add("create");
            if (caps.CanUpdate) actions.Add("update");
            if (caps.CanDelete) actions.Add("delete");
            caps.AllowedActions = actions;
        }
    }
}
