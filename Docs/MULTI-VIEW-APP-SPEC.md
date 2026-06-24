# MegaForm Multi-View Application System — Spec v1.0
## From Form Builder → Application Builder

---

## 1. Concept: Form + Views = Application

Hiện tại MegaForm:
```
Form Schema → 1 Edit View → Submissions Table
```

Mục tiêu:
```
Form Schema → Multiple Views → Multiple Pages → Full Application
              ├── Edit View (form nhập liệu)
              ├── List View (table/grid)
              ├── Detail View (hiển thị 1 record)
              ├── Card View (gallery/blog listing)
              ├── Kanban View (pipeline, trạng thái)
              └── Calendar View (lịch)
```

Ví dụ thực tế:

### Article/Blog CMS
```
Fields: title, category, content(RichText), featured_image, tags, author, status, publish_date
Views:
  - Admin List: Table với filter, search, bulk actions
  - Public Blog: Card grid với thumbnail, title, excerpt
  - Article Detail: Full article layout với sidebar
  - Editor: Rich form với preview
```

### Forum
```
Fields: title, category, content(RichText), author, reply_count, vote_count, is_pinned, status
Views:
  - Thread List: Table grouped by category
  - Thread Detail: Original post + replies (related submissions)
  - New Thread: Form với category picker + rich editor
  - User Profile: Filtered list (my threads)
```

### Product Catalog
```
Fields: name, sku, price, description, images, category, stock, status
Views:
  - Admin List: Table with inline edit
  - Product Grid: Card view with image, price
  - Product Detail: Full product page
  - Add/Edit: Form with image upload
```

### CRM Contacts
```
Fields: name, email, phone, company, deal_value, status, notes, last_contact
Views:
  - Contact List: Searchable table
  - Pipeline: Kanban by status (Lead → Qualified → Proposal → Won/Lost)
  - Contact Detail: Profile card + activity timeline
  - Add Contact: Quick form
```

---

## 2. View Architecture

### View Definition (stored in FormSchema)

```json
{
  "version": "3.0",
  "fields": [...],
  "settings": {...},
  "views": [
    {
      "key": "default-edit",
      "type": "edit",
      "name": "Editor",
      "isDefault": true,
      "config": {
        "layout": "form",
        "customHtml": "...",
        "customCss": "..."
      }
    },
    {
      "key": "public-list",
      "type": "list",
      "name": "Articles",
      "config": {
        "columns": ["title", "category", "author", "publish_date", "status"],
        "sortBy": "publish_date",
        "sortDir": "desc",
        "pageSize": 20,
        "searchFields": ["title", "category"],
        "filters": [
          { "field": "status", "operator": "equals", "value": "published" }
        ],
        "actions": ["view", "edit", "delete"],
        "customHtml": "...",
        "customCss": "..."
      }
    },
    {
      "key": "article-detail",
      "type": "detail",
      "name": "Article",
      "config": {
        "layout": "article",
        "fields": ["title", "featured_image", "content", "author", "publish_date", "tags"],
        "customHtml": "...",
        "customCss": "...",
        "relatedView": "comments-list"
      }
    },
    {
      "key": "blog-cards",
      "type": "card",
      "name": "Blog",
      "config": {
        "columns": 3,
        "imageField": "featured_image",
        "titleField": "title",
        "excerptField": "content",
        "excerptLength": 150,
        "dateField": "publish_date",
        "categoryField": "category",
        "linkToView": "article-detail",
        "filters": [
          { "field": "status", "operator": "equals", "value": "published" }
        ],
        "customHtml": "...",
        "customCss": "..."
      }
    },
    {
      "key": "pipeline",
      "type": "kanban",
      "name": "Pipeline",
      "config": {
        "groupByField": "status",
        "titleField": "title",
        "subtitleField": "author",
        "colorField": "category",
        "stages": [
          { "value": "draft", "label": "Draft", "color": "#94a3b8" },
          { "value": "review", "label": "In Review", "color": "#f59e0b" },
          { "value": "published", "label": "Published", "color": "#10b981" },
          { "value": "archived", "label": "Archived", "color": "#6b7280" }
        ]
      }
    }
  ],
  "pages": [
    {
      "path": "",
      "view": "blog-cards",
      "title": "Blog",
      "public": true
    },
    {
      "path": "article/{id}",
      "view": "article-detail",
      "title": "{{title}}",
      "public": true
    },
    {
      "path": "admin",
      "view": "public-list",
      "title": "Manage Articles",
      "public": false,
      "requireRole": "editor"
    },
    {
      "path": "admin/new",
      "view": "default-edit",
      "title": "New Article",
      "public": false
    },
    {
      "path": "admin/edit/{id}",
      "view": "default-edit",
      "title": "Edit Article",
      "public": false,
      "prefillFromId": true
    }
  ]
}
```

---

## 3. View Types

### 3.1 Edit View (existing)
Current form builder. No changes needed.
- customHtml/customCss for creative layouts
- Multi-page support
- Validation, conditional logic

### 3.2 List View (NEW)
Table/Grid display of submissions.

**Features:**
- Column selection (which fields to show)
- Sorting (click column header)
- Filtering (dropdown, search, date range)
- Pagination
- Bulk actions (delete, change status, export)
- Inline editing (click cell to edit)
- Row click → navigate to detail view
- Custom row template (customHtml per row)

**Rendering:**
```html
<!-- Auto-generated if no customHtml -->
<div class="mfv-list">
  <div class="mfv-toolbar">
    <input class="mfv-search" placeholder="Search...">
    <select class="mfv-filter">...</select>
  </div>
  <table class="mfv-table">
    <thead><tr>
      <th data-sort="title">Title</th>
      <th data-sort="category">Category</th>
      <th data-sort="publish_date">Date</th>
    </tr></thead>
    <tbody>
      {{#each submissions}}
      <tr data-id="{{id}}" class="mfv-row">
        <td>{{title}}</td>
        <td>{{category}}</td>
        <td>{{publish_date}}</td>
        <td><a href="{{detailUrl}}">View</a></td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <div class="mfv-pagination">...</div>
</div>
```

**Custom List Template (customHtml):**
```html
<!-- Article list with thumbnail -->
<div class="article-list">
  {{#each submissions}}
  <div class="article-row" data-id="{{id}}">
    <img src="{{featured_image}}" class="thumb">
    <div class="info">
      <h3><a href="{{detailUrl}}">{{title}}</a></h3>
      <span class="meta">{{author}} · {{publish_date}} · {{category}}</span>
    </div>
    <span class="status status-{{status}}">{{status}}</span>
  </div>
  {{/each}}
</div>
```

### 3.3 Detail View (NEW)
Single record display.

**Features:**
- Show selected fields in custom layout
- Image/file preview
- Rich text rendering
- Related records (comments, replies)
- Action buttons (edit, delete, back to list)
- Navigation (prev/next record)
- Share/Print

**Rendering:**
```html
<!-- Article detail template -->
<article class="mfv-article">
  <div class="mfv-article-header">
    <span class="category">{{category}}</span>
    <h1>{{title}}</h1>
    <div class="meta">
      <span>By {{author}}</span>
      <span>{{publish_date}}</span>
      <span>{{tags}}</span>
    </div>
  </div>
  {{#if featured_image}}
  <img src="{{featured_image}}" class="hero-image">
  {{/if}}
  <div class="content">{{{content}}}</div>
  <div class="mfv-actions">
    <a href="{{editUrl}}">Edit</a>
    <a href="{{listUrl}}">Back to Articles</a>
  </div>
</article>
```

### 3.4 Card View (NEW)
Grid of cards — blog listing, product catalog, gallery.

**Features:**
- Configurable columns (1-6)
- Image field mapping
- Title, excerpt, date fields
- Category filter tabs
- Load more / infinite scroll
- Click card → detail view
- Responsive grid

**Rendering:**
```html
<div class="mfv-cards" style="--cols:3">
  {{#each submissions}}
  <div class="mfv-card" data-id="{{id}}">
    <div class="mfv-card-img"><img src="{{featured_image}}"></div>
    <div class="mfv-card-body">
      <span class="mfv-card-cat">{{category}}</span>
      <h3>{{title}}</h3>
      <p>{{excerpt content 150}}</p>
      <div class="mfv-card-footer">
        <span>{{author}}</span>
        <span>{{publish_date}}</span>
      </div>
    </div>
  </div>
  {{/each}}
</div>
```

### 3.5 Kanban View (Future)
Drag-drop board grouped by a field.

### 3.6 Calendar View (Future)
Events on calendar from date field.

---

## 4. Template Expressions

Inside view customHtml, use Mustache-like syntax:

| Expression | Description | Example |
|---|---|---|
| `{{fieldKey}}` | Field value (escaped) | `{{title}}` → "My Article" |
| `{{{fieldKey}}}` | Field value (raw HTML, for RichText) | `{{{content}}}` |
| `{{#if field}}...{{/if}}` | Conditional | `{{#if featured_image}}<img>{{/if}}` |
| `{{#each submissions}}` | Loop (list/card views) | Iterate records |
| `{{id}}` | Submission ID | Link to detail |
| `{{detailUrl}}` | Auto-generated detail URL | `?view=detail&id=123` |
| `{{editUrl}}` | Auto-generated edit URL | `?view=edit&id=123` |
| `{{listUrl}}` | Auto-generated list URL | `?view=list` |
| `{{excerpt field len}}` | Truncated text | `{{excerpt content 150}}` |
| `{{formatDate field format}}` | Date format | `{{formatDate publish_date "DD/MM/YYYY"}}` |
| `{{asset:file}}` | Template asset URL | `/Templates/slug/assets/file` |

---

## 5. Page Routing

DNN module uses QueryString for view routing:

```
/page                           → default view (first public view)
/page?view=blog-cards           → card view
/page?view=article-detail&id=5  → detail view for submission 5
/page?view=default-edit         → new submission form
/page?view=default-edit&id=5    → edit submission 5
/page?view=admin                → admin list (requires permission)
```

### Implementation:
```csharp
// FormView.ascx.cs
string viewKey = Request.QueryString["view"] ?? "";
int? recordId = Request.QueryString["id"] != null 
    ? int.Parse(Request.QueryString["id"]) : null;

var view = schema.Views.FirstOrDefault(v => v.Key == viewKey) 
    ?? schema.Views.FirstOrDefault(v => v.IsDefault);

switch (view.Type) {
    case "edit":   RenderEditView(view, recordId); break;
    case "list":   RenderListView(view); break;
    case "detail": RenderDetailView(view, recordId); break;
    case "card":   RenderCardView(view); break;
}
```

---

## 6. API Endpoints for Views

```
GET /API/MegaForm/View/List?formId=1&view=public-list
    &page=1&pageSize=20&sort=publish_date&dir=desc
    &filter[status]=published&search=keyword
    → { items: [...], total: 150, pages: 8 }

GET /API/MegaForm/View/Detail?formId=1&id=5
    → { submission data + resolved field values }

POST /API/MegaForm/View/UpdateField?id=5
    Body: { key: "status", value: "published" }
    → inline edit support

GET /API/MegaForm/View/Navigation?formId=1&id=5&view=public-list
    → { prevId: 4, nextId: 6 }
```

---

## 7. Application Templates

### Blog / Article CMS
```json
{
  "meta": { "name": "Blog CMS", "category": "cms", "icon": "📰" },
  "fields": [
    { "key": "title", "type": "Text", "label": "Title", "required": true },
    { "key": "slug", "type": "Text", "label": "URL Slug", "helpText": "Auto-generated from title" },
    { "key": "category", "type": "Select", "label": "Category", "options": [
      {"value":"news","label":"News"}, {"value":"tutorial","label":"Tutorial"},
      {"value":"review","label":"Review"}, {"value":"opinion","label":"Opinion"}
    ]},
    { "key": "featured_image", "type": "File", "label": "Featured Image", 
      "fileSettings": {"allowedTypes":".jpg,.png,.webp","maxSizeMB":5} },
    { "key": "content", "type": "RichText", "label": "Content", "required": true },
    { "key": "tags", "type": "Checkbox", "label": "Tags", "options": [
      {"value":"tech","label":"Tech"}, {"value":"business","label":"Business"},
      {"value":"lifestyle","label":"Lifestyle"}
    ]},
    { "key": "status", "type": "Select", "label": "Status", "options": [
      {"value":"draft","label":"Draft"}, {"value":"review","label":"In Review"},
      {"value":"published","label":"Published"}, {"value":"archived","label":"Archived"}
    ]},
    { "key": "publish_date", "type": "Date", "label": "Publish Date" },
    { "key": "author", "type": "Text", "label": "Author", "defaultValue": "{{currentUser}}" }
  ],
  "views": [
    { "key": "blog-list", "type": "card", "name": "Blog", 
      "config": { "columns": 3, "imageField": "featured_image", "titleField": "title",
                  "excerptField": "content", "categoryField": "category", "dateField": "publish_date",
                  "filters": [{"field":"status","operator":"equals","value":"published"}] }},
    { "key": "article", "type": "detail", "name": "Read Article",
      "config": { "fields": ["title","featured_image","content","author","publish_date","tags","category"] }},
    { "key": "editor", "type": "edit", "name": "Write Article" },
    { "key": "admin", "type": "list", "name": "Manage Articles",
      "config": { "columns": ["title","category","status","publish_date","author"], "sortBy":"publish_date","sortDir":"desc" }}
  ],
  "pages": [
    { "path": "", "view": "blog-list", "public": true },
    { "path": "article/{id}", "view": "article", "public": true },
    { "path": "admin", "view": "admin", "requireRole": "editor" },
    { "path": "write", "view": "editor", "requireRole": "editor" }
  ]
}
```

### Forum
```json
{
  "meta": { "name": "Discussion Forum", "category": "community", "icon": "💬" },
  "fields": [
    { "key": "title", "type": "Text", "label": "Topic Title", "required": true },
    { "key": "category", "type": "Select", "label": "Category", "options": [
      {"value":"general","label":"General"}, {"value":"help","label":"Help & Support"},
      {"value":"feedback","label":"Feedback"}, {"value":"showcase","label":"Showcase"}
    ]},
    { "key": "content", "type": "RichText", "label": "Content", "required": true },
    { "key": "author", "type": "Text", "label": "Author", "defaultValue": "{{currentUser}}" },
    { "key": "is_pinned", "type": "Checkbox", "label": "Pinned" },
    { "key": "status", "type": "Select", "label": "Status", "options": [
      {"value":"open","label":"Open"}, {"value":"resolved","label":"Resolved"},
      {"value":"closed","label":"Closed"}
    ]},
    { "key": "reply_to", "type": "Hidden", "label": "Reply To", "helpText": "Parent submission ID" }
  ],
  "views": [
    { "key": "threads", "type": "list", "name": "Threads",
      "config": { "columns": ["title","category","author","status","createdDate"],
                  "filters": [{"field":"reply_to","operator":"isEmpty"}],
                  "sortBy":"createdDate","sortDir":"desc" }},
    { "key": "thread-detail", "type": "detail", "name": "Thread",
      "config": { "fields": ["title","content","author","category","status"],
                  "relatedView": "replies" }},
    { "key": "replies", "type": "list", "name": "Replies",
      "config": { "parentField": "reply_to", 
                  "columns": ["content","author","createdDate"],
                  "sortBy":"createdDate","sortDir":"asc" }},
    { "key": "new-thread", "type": "edit", "name": "New Thread" },
    { "key": "reply", "type": "edit", "name": "Reply",
      "config": { "visibleFields": ["content"], "prefill": {"reply_to": "{{parentId}}"} }}
  ],
  "pages": [
    { "path": "", "view": "threads", "public": true },
    { "path": "thread/{id}", "view": "thread-detail", "public": true },
    { "path": "new", "view": "new-thread", "requireAuth": true },
    { "path": "reply/{parentId}", "view": "reply", "requireAuth": true }
  ]
}
```

### HR Employee Directory
```json
{
  "meta": { "name": "Employee Directory", "category": "hr", "icon": "👥" },
  "fields": [
    { "key": "photo", "type": "File", "label": "Photo", "fileSettings": {"allowedTypes":".jpg,.png"} },
    { "key": "full_name", "type": "Text", "label": "Full Name", "required": true },
    { "key": "email", "type": "Email", "label": "Email", "required": true },
    { "key": "phone", "type": "Phone", "label": "Phone" },
    { "key": "department", "type": "Select", "label": "Department", "options": [
      {"value":"engineering","label":"Engineering"}, {"value":"design","label":"Design"},
      {"value":"marketing","label":"Marketing"}, {"value":"hr","label":"HR"},
      {"value":"finance","label":"Finance"}
    ]},
    { "key": "position", "type": "Text", "label": "Position" },
    { "key": "start_date", "type": "Date", "label": "Start Date" },
    { "key": "bio", "type": "Textarea", "label": "Bio" }
  ],
  "views": [
    { "key": "directory", "type": "card", "name": "Team Directory",
      "config": { "columns": 4, "imageField": "photo", "titleField": "full_name",
                  "excerptField": "position", "categoryField": "department" }},
    { "key": "profile", "type": "detail", "name": "Profile",
      "config": { "fields": ["photo","full_name","position","department","email","phone","start_date","bio"] }},
    { "key": "admin", "type": "list", "name": "Manage Employees",
      "config": { "columns": ["full_name","department","position","email","start_date"] }},
    { "key": "add", "type": "edit", "name": "Add Employee" }
  ]
}
```

---

## 8. New Field Types Needed

| Type | Widget | Use Case |
|---|---|---|
| **RichText** | TinyMCE/CKEditor | Article content, forum posts |
| **ImageGallery** | Multi-image upload + preview | Product photos, portfolio |
| **Lookup** | Dropdown from other form's data | Category from Categories form |
| **AutoNumber** | Auto-increment ID | Order #, Ticket # |
| **Computed** | Read-only formula | Full name = first + last |
| **Relation** | Link to another submission | Reply → Thread, Order → Customer |
| **CurrentUser** | Auto-fill logged-in user | Author field |
| **Status** | Styled status badge | Draft/Published/Archived |

---

## 9. Rendering Engine Upgrade

Current renderer: 1 function `renderFields()` for edit view only.

New renderer needs:

```javascript
MegaFormViews = {
  renderView: function(container, schema, viewConfig, data) {
    switch (viewConfig.type) {
      case 'edit':   return MegaFormRenderer.init(config);  // existing
      case 'list':   return MegaFormListView.render(container, viewConfig, data);
      case 'detail': return MegaFormDetailView.render(container, viewConfig, data);
      case 'card':   return MegaFormCardView.render(container, viewConfig, data);
      case 'kanban': return MegaFormKanbanView.render(container, viewConfig, data);
    }
  },
  
  // Mustache-like template engine for views
  template: function(html, data) {
    // Replace {{field}} with values
    // Handle {{#if}}, {{#each}}, {{{raw}}}
    // Resolve {{asset:}}, {{detailUrl}}, {{editUrl}}
  }
};
```

---

## 10. Implementation Roadmap

### Phase 1: View Infrastructure (2-3 weeks)
- [ ] View definition in FormSchema (JSON structure)
- [ ] View builder UI in right panel (add/edit views)
- [ ] QueryString routing (?view=xxx&id=yyy)
- [ ] Template expression engine ({{field}}, {{#each}}, {{#if}})

### Phase 2: List & Detail Views (2-3 weeks)
- [ ] List view renderer (table, sort, filter, pagination)
- [ ] Detail view renderer (single record display)
- [ ] List → Detail navigation
- [ ] Edit → back to list
- [ ] View-specific customHtml/customCss

### Phase 3: Card View + Templates (1-2 weeks)
- [ ] Card view renderer (responsive grid)
- [ ] Blog CMS application template
- [ ] Forum application template
- [ ] Employee Directory template

### Phase 4: Advanced (Future)
- [ ] Kanban view
- [ ] Calendar view
- [ ] Inline editing in list view
- [ ] RichText widget (TinyMCE)
- [ ] Relation/Lookup fields
- [ ] Record-level permissions
- [ ] Activity/Comment system
