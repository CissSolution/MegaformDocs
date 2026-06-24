<%@ Control Language="C#" AutoEventWireup="true" CodeBehind="FormList.ascx.cs" Inherits="MegaForm.DNN.Components.FormList" %>

<div class="mf-dashboard">
    <%-- Header --%>
    <div class="mf-dash-header">
        <div>
            <h2 class="mf-dash-title"><i class="fa fa-wpforms"></i> My Forms</h2>
            <p class="mf-dash-subtitle">Manage and track all your forms</p>
        </div>
        <a href="<%= GetCreateUrl() %>" class="mf-dash-btn mf-dash-btn-primary">
            <i class="fa fa-plus"></i> Create Form
        </a>
    </div>

    <%-- Stats Summary --%>
    <div class="mf-dash-stats">
        <div class="mf-stat-card mf-stat-accent">
            <div class="mf-stat-icon"><i class="fa fa-wpforms"></i></div>
            <div><div class="mf-stat-value"><%= ViewModel.Forms.Count %></div><div class="mf-stat-label">Total Forms</div></div>
        </div>
        <div class="mf-stat-card mf-stat-green">
            <div class="mf-stat-icon"><i class="fa fa-check-circle"></i></div>
            <div><div class="mf-stat-value"><%= ViewModel.Forms.Count(f => f.Status == "Published") %></div><div class="mf-stat-label">Published</div></div>
        </div>
        <div class="mf-stat-card mf-stat-yellow">
            <div class="mf-stat-icon"><i class="fa fa-edit"></i></div>
            <div><div class="mf-stat-value"><%= ViewModel.Forms.Count(f => f.Status != "Published") %></div><div class="mf-stat-label">Drafts</div></div>
        </div>
        <div class="mf-stat-card mf-stat-blue">
            <div class="mf-stat-icon"><i class="fa fa-paper-plane"></i></div>
            <div><div class="mf-stat-value"><%= ViewModel.Stats.Values.Sum(s => s.TotalSubmissions) %></div><div class="mf-stat-label">Total Submissions</div></div>
        </div>
    </div>

    <%-- Filters --%>
    <div class="mf-dash-filters">
        <input type="text" id="mf-dash-search" class="mf-dash-search" placeholder="Search forms..." />
        <select id="mf-dash-status-filter" class="mf-dash-select">
            <option value="all">All Status</option>
            <option value="Published">Published</option>
            <option value="Draft">Draft</option>
        </select>
    </div>

    <%-- Forms Grid --%>
    <% if (ViewModel.Forms.Count == 0) { %>
    <div class="mf-dash-empty">
        <i class="fa fa-folder-open fa-3x" style="color:#cbd5e1;margin-bottom:16px;"></i>
        <h3>No forms yet</h3>
        <p>Create your first form to get started</p>
        <a href="<%= GetCreateUrl() %>" class="mf-dash-btn mf-dash-btn-primary"><i class="fa fa-plus"></i> Create Form</a>
    </div>
    <% } else { %>
    <div class="mf-dash-grid" id="mf-dash-grid">
        <% foreach (var form in ViewModel.Forms) {
            var stats = ViewModel.Stats.ContainsKey(form.FormId) ? ViewModel.Stats[form.FormId] : null;
            var fieldCount = 0;
            try {
                var schema = Newtonsoft.Json.JsonConvert.DeserializeObject<MegaForm.Models.FormSchema>(form.SchemaJson ?? "{}");
                if (schema?.Fields != null) fieldCount = schema.Fields.Count;
            } catch { }
            var isPublished = form.Status == "Published";
        %>
        <div class="mf-form-card" data-status="<%= form.Status %>" data-title="<%= Server.HtmlEncode(form.Title ?? "").ToLower() %>">
            <%-- Card Thumbnail --%>
            <div class="mf-card-thumb" style="background: linear-gradient(135deg, <%= isPublished ? "#6366f1, #818cf8" : "#94a3b8, #cbd5e1" %>);">
                <div class="mf-card-thumb-preview">
                    <div class="mf-thumb-line" style="width:60%;"></div>
                    <div class="mf-thumb-line" style="width:80%;"></div>
                    <div class="mf-thumb-line" style="width:45%;"></div>
                    <div class="mf-thumb-btn"></div>
                </div>
                <div class="mf-card-actions">
                    <a href="<%= GetEditUrl(form.FormId) %>" class="mf-card-action" title="Edit"><i class="fa fa-pencil-alt"></i></a>
                    <a href="<%= GetSubmissionsUrl(form.FormId) %>" class="mf-card-action" title="Submissions"><i class="fa fa-inbox"></i></a>
                </div>
            </div>

            <%-- Card Body --%>
            <div class="mf-card-body">
                <div class="mf-card-header-row">
                    <h3 class="mf-card-title"><%= Server.HtmlEncode(form.Title ?? "Untitled") %></h3>
                    <span class="mf-card-status <%= isPublished ? "mf-status-published" : "mf-status-draft" %>">
                        <span class="mf-status-dot"></span> <%= form.Status ?? "Draft" %>
                    </span>
                </div>
                <p class="mf-card-desc"><%= Server.HtmlEncode(form.Description ?? "") %></p>
                <div class="mf-card-meta">
                    <span><i class="fa fa-th-list"></i> <%= fieldCount %> fields</span>
                    <span><i class="fa fa-paper-plane"></i> <%= stats?.TotalSubmissions ?? 0 %> submissions</span>
                </div>
                <div class="mf-card-footer">
                    <span class="mf-card-date">
                        <% if (stats?.LastSubmission != null) { %>
                            Last: <%= stats.LastSubmission.Value.ToString("MMM dd, yyyy") %>
                        <% } else { %>
                            Created: <%= form.CreatedOnUtc.ToString("MMM dd, yyyy") %>
                        <% } %>
                    </span>
                    <div class="mf-card-links">
                        <a href="<%= GetEditUrl(form.FormId) %>" class="mf-card-link">Edit</a>
                        <a href="<%= GetSubmissionsUrl(form.FormId) %>" class="mf-card-link">View Data</a>
                    </div>
                </div>
            </div>
        </div>
        <% } %>
    </div>
    <% } %>
</div>

<style>
/* ============================================================
   MY FORMS DASHBOARD
   ============================================================ */
.mf-dashboard { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 24px 16px; }

.mf-dash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.mf-dash-title { font-size: 24px; font-weight: 700; color: #1e293b; margin: 0; }
.mf-dash-title i { color: #6366f1; margin-right: 8px; }
.mf-dash-subtitle { color: #64748b; font-size: 14px; margin: 4px 0 0; }

.mf-dash-btn { padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; transition: all .15s; border: none; cursor: pointer; }
.mf-dash-btn-primary { background: #6366f1; color: #fff; }
.mf-dash-btn-primary:hover { background: #4f46e5; color: #fff; text-decoration: none; box-shadow: 0 4px 12px rgba(99,102,241,.3); }

/* Stats */
.mf-dash-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.mf-stat-card { background: #fff; border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 16px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
.mf-stat-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.mf-stat-accent .mf-stat-icon { background: #eef2ff; color: #6366f1; }
.mf-stat-green .mf-stat-icon { background: #ecfdf5; color: #10b981; }
.mf-stat-yellow .mf-stat-icon { background: #fffbeb; color: #f59e0b; }
.mf-stat-blue .mf-stat-icon { background: #eff6ff; color: #3b82f6; }
.mf-stat-value { font-size: 24px; font-weight: 700; color: #1e293b; line-height: 1; }
.mf-stat-label { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-top: 2px; letter-spacing: .3px; }

/* Filters */
.mf-dash-filters { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.mf-dash-search { flex: 1; min-width: 200px; max-width: 360px; padding: 9px 14px 9px 36px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%2394a3b8' viewBox='0 0 20 20'%3E%3Cpath d='M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z'/%3E%3C/svg%3E") 10px center / 16px no-repeat; }
.mf-dash-search:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.1); }
.mf-dash-select { padding: 9px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; background: #fff; min-width: 140px; }

/* Empty state */
.mf-dash-empty { text-align: center; padding: 60px 20px; background: #fff; border-radius: 12px; border: 2px dashed #e2e8f0; }
.mf-dash-empty h3 { color: #334155; margin: 0 0 4px; }
.mf-dash-empty p { color: #94a3b8; margin: 0 0 20px; }

/* Form Cards Grid */
.mf-dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }

.mf-form-card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; transition: all .2s; }
.mf-form-card:hover { border-color: #c7d2fe; box-shadow: 0 8px 24px rgba(99,102,241,.1); transform: translateY(-2px); }

.mf-card-thumb { height: 110px; display: flex; align-items: center; justify-content: center; position: relative; }
.mf-card-thumb-preview { background: rgba(255,255,255,.2); border-radius: 6px; padding: 12px; width: 60%; }
.mf-thumb-line { height: 6px; background: rgba(255,255,255,.4); border-radius: 3px; margin-bottom: 6px; }
.mf-thumb-btn { width: 40px; height: 12px; background: rgba(255,255,255,.5); border-radius: 3px; margin-top: 8px; }

.mf-card-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; opacity: 0; transition: opacity .15s; }
.mf-form-card:hover .mf-card-actions { opacity: 1; }
.mf-card-action { width: 30px; height: 30px; border-radius: 6px; background: rgba(255,255,255,.9); color: #334155; display: flex; align-items: center; justify-content: center; text-decoration: none; font-size: 12px; transition: all .15s; }
.mf-card-action:hover { background: #fff; color: #6366f1; box-shadow: 0 2px 8px rgba(0,0,0,.15); text-decoration: none; }

.mf-card-body { padding: 16px; }
.mf-card-header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
.mf-card-title { font-size: 15px; font-weight: 600; color: #1e293b; margin: 0; line-height: 1.3; }
.mf-card-status { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 10px; white-space: nowrap; display: flex; align-items: center; gap: 4px; }
.mf-status-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.mf-status-published { background: #ecfdf5; color: #059669; }
.mf-status-published .mf-status-dot { background: #10b981; }
.mf-status-draft { background: #fffbeb; color: #d97706; }
.mf-status-draft .mf-status-dot { background: #f59e0b; }

.mf-card-desc { font-size: 13px; color: #64748b; margin: 0 0 10px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mf-card-meta { display: flex; gap: 16px; font-size: 12px; color: #94a3b8; margin-bottom: 12px; }
.mf-card-meta i { margin-right: 3px; }

.mf-card-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid #f1f5f9; }
.mf-card-date { font-size: 11px; color: #94a3b8; }
.mf-card-links { display: flex; gap: 12px; }
.mf-card-link { font-size: 12px; font-weight: 600; color: #6366f1; text-decoration: none; }
.mf-card-link:hover { color: #4f46e5; text-decoration: underline; }

@media (max-width: 768px) {
    .mf-dash-header { flex-direction: column; gap: 12px; text-align: center; }
    .mf-dash-grid { grid-template-columns: 1fr; }
}
</style>

<script type="text/javascript">
(function() {
    var searchInput = document.getElementById('mf-dash-search');
    var statusFilter = document.getElementById('mf-dash-status-filter');
    var grid = document.getElementById('mf-dash-grid');
    if (!grid) return;

    function filterCards() {
        var q = (searchInput ? searchInput.value.toLowerCase() : '');
        var st = (statusFilter ? statusFilter.value : 'all');
        var cards = grid.querySelectorAll('.mf-form-card');
        cards.forEach(function(card) {
            var title = card.getAttribute('data-title') || '';
            var status = card.getAttribute('data-status') || '';
            var matchSearch = !q || title.indexOf(q) >= 0;
            var matchStatus = st === 'all' || status === st;
            card.style.display = (matchSearch && matchStatus) ? '' : 'none';
        });
    }

    if (searchInput) searchInput.addEventListener('input', filterCards);
    if (statusFilter) statusFilter.addEventListener('change', filterCards);
})();
</script>
