# MegaForm Template Package System — Spec v3.0

## 1. Package Format

Template = **ZIP file** containing:

```
my-template.zip
├── template.json        ← REQUIRED: metadata + field schema
├── template.html        ← REQUIRED: custom HTML layout  
├── template.css         ← REQUIRED: custom CSS
├── template.js          ← OPTIONAL: custom JS (security-scanned)
├── thumbnail.png        ← RECOMMENDED: 400x300 preview for gallery
└── assets/              ← OPTIONAL: images, SVGs, fonts
    ├── hero.svg
    ├── bg-pattern.png
    ├── logo.svg
    └── icon-check.svg
```

### template.json
```json
{
  "templateVersion": "3.0",
  "meta": {
    "name": "Professional Contact Form",
    "slug": "contact-pro",
    "category": "business",
    "description": "Split-layout contact form with gradient hero",
    "author": "MegaForm Team",
    "tags": ["contact", "business", "professional"],
    "icon": "✉️",
    "version": "1.0.0",
    "minMegaFormVersion": "1.0"
  },
  "form": {
    "title": "Contact Us",
    "description": "Get in touch with our team",
    "submitButtonText": "Send Message",
    "successMessage": "Thank you! We'll get back to you within 24 hours.",
    "redirectUrl": ""
  },
  "fields": [
    { "key": "full_name", "type": "Text", "label": "Full Name", "required": true, "width": "50%" },
    { "key": "email", "type": "Email", "label": "Email", "required": true, "width": "50%" }
  ],
  "settings": {
    "multiPage": false,
    "enableCaptcha": false
  },
  "translations": {
    "vi-VN": {
      "form": { "title": "Liên hệ", "submitButtonText": "Gửi" },
      "fields": {
        "full_name": { "label": "Họ tên" },
        "email": { "label": "Email" }
      }
    }
  }
}
```

### template.html
- Uses `{{field:key}}` placeholders for fields
- References assets via `{{asset:filename}}` → auto-resolved to local path
- Can include `<button type="submit">` for custom submit button

```html
<div class="mfp">
  <div class="mfp-split">
    <div class="mfp-hero" style="background-image:url('{{asset:hero.svg}}')">
      <img src="{{asset:logo.svg}}" class="mfp-logo" alt="Logo">
      <h1>Get in Touch</h1>
    </div>
    <div class="mfp-card">
      <div class="field">{{field:full_name}}</div>
      <div class="field">{{field:email}}</div>
      <button type="submit">Send Message →</button>
    </div>
  </div>
</div>
```

### template.css
- Scoped to `.mfp` class (avoid global pollution)
- Can reference assets: `url('{{asset:bg-pattern.png}}')`
- No `@import` from external URLs allowed

### template.js (optional)
- Runs AFTER form renders
- Scoped: receives `(formId, container)` parameters
- **Security scanned** before execution

---

## 2. Storage

Templates stored on disk:
```
/DesktopModules/MegaForm/Templates/
├── contact-pro/
│   ├── template.json
│   ├── template.html
│   ├── template.css
│   ├── template.js
│   ├── thumbnail.png
│   └── assets/
│       ├── hero.svg
│       └── logo.svg
├── feedback-stars/
│   ├── template.json
│   ├── ...
└── _index.json          ← auto-generated catalog
```

### _index.json (auto-generated)
```json
{
  "templates": [
    {
      "slug": "contact-pro",
      "name": "Professional Contact Form",
      "category": "business",
      "description": "...",
      "icon": "✉️",
      "thumbnail": "/DesktopModules/MegaForm/Templates/contact-pro/thumbnail.png",
      "fieldCount": 6,
      "hasJs": false,
      "version": "1.0.0"
    }
  ],
  "generatedAt": "2026-02-23T10:00:00Z"
}
```

---

## 3. Security Scanning (JS)

### BLOCKED patterns (file rejected if found):
```
Category: Network/Data Exfiltration
- fetch(, XMLHttpRequest, $.ajax, $.get, $.post
- navigator.sendBeacon
- WebSocket, EventSource
- new Image().src =    (tracking pixel)

Category: Cookie/Storage Theft  
- document.cookie
- localStorage, sessionStorage
- indexedDB

Category: DOM Injection
- document.write
- innerHTML =           (outside scoped container)
- eval(, Function(
- setTimeout(string), setInterval(string)
- import(

Category: External Resources
- <script src=
- <link href=http
- @import url(http
- Any URL not starting with / or {{asset:

Category: Backlinks/SEO Spam
- <a href=http         (external links)
- window.location =
- window.open(
- top.location
- parent.location

Category: Iframe/Embed
- <iframe
- <embed
- <object
```

### ALLOWED in template.js:
```javascript
// Receives scoped parameters
(function(formId, container) {
    // DOM queries scoped to container
    var fields = container.querySelectorAll('.field');
    
    // Event listeners on container elements
    container.addEventListener('click', function(e) { ... });
    
    // CSS class manipulation
    element.classList.add('active');
    
    // Data attributes
    element.dataset.value;
    
    // Animations
    element.style.transform = '...';
    requestAnimationFrame(fn);
    
    // Console (for debugging)
    console.log('Template loaded');
})('{{formId}}', document.getElementById('mf-fields-container-{{formId}}'));
```

### Scan Result:
```json
{
  "passed": false,
  "violations": [
    { "line": 12, "pattern": "fetch(", "category": "network", "severity": "critical" },
    { "line": 45, "pattern": "<a href=\"http", "category": "backlink", "severity": "warning" }
  ]
}
```

---

## 4. API Endpoints

### Template Management
```
GET    /API/MegaForm/Templates/List
       → { templates: [...], categories: [...] }

GET    /API/MegaForm/Templates/Get?slug=contact-pro
       → { template JSON + resolved asset URLs }

POST   /API/MegaForm/Templates/Install
       Content-Type: multipart/form-data
       Body: file=template.zip
       → { success, slug, scanResult }

POST   /API/MegaForm/Templates/Apply?slug=contact-pro
       → creates new form from template, returns { formId }

DELETE /API/MegaForm/Templates/Delete?slug=contact-pro
       → { success }

POST   /API/MegaForm/Templates/Export?formId=123
       → downloads ZIP package

POST   /API/MegaForm/Templates/Validate
       Content-Type: multipart/form-data  
       Body: file=template.zip
       → { valid, errors, scanResult }
```

---

## 5. Template Gallery UI (Builder)

### Gallery view (replaces current template chooser):
```
┌─────────────────────────────────────────────────┐
│  📦 Template Gallery                    [Upload] │
│─────────────────────────────────────────────────│
│  [All] [Business] [Survey] [Booking] [Health]   │
│─────────────────────────────────────────────────│
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ thumbnail│ │ thumbnail│ │ thumbnail│        │
│  │          │ │          │ │          │        │
│  │ Contact  │ │ Feedback │ │ Event    │        │
│  │ ✉️ 6 fld │ │ ⭐ 6 fld │ │ 🎫 7 fld │        │
│  │ [Use][🗑]│ │ [Use][🗑]│ │ [Use][🗑]│        │
│  └──────────┘ └──────────┘ └──────────┘        │
│                                                  │
│  ┌──────────┐ ┌──────────┐                      │
│  │ + Upload │ │ + Import │                      │
│  │ Template │ │   JSON   │                      │
│  └──────────┘ └──────────┘                      │
└─────────────────────────────────────────────────┘
```

### Template card actions:
- **Use** → apply to current form (confirm if fields exist)
- **Preview** → open in new tab
- **Export** → download as ZIP
- **Delete** → remove from disk (admin only)

---

## 6. Rendering Pipeline

When form has template:

```
1. Load template files from /Templates/{slug}/
2. Read template.html
3. Resolve {{asset:filename}} → /DesktopModules/MegaForm/Templates/{slug}/assets/filename
4. Resolve {{field:key}} → rendered field HTML
5. Inject template.css into <head>
6. If template.js exists + passed security scan → execute scoped JS
7. Bind submit handlers
```

### Asset resolution in CSS:
```css
/* In template.css */
.hero { background-image: url('{{asset:hero.svg}}'); }

/* Resolved to: */
.hero { background-image: url('/DesktopModules/MegaForm/Templates/contact-pro/assets/hero.svg'); }
```

---

## 7. Export Form as Template Package

From builder: **Export** button:

1. Collect current form schema (fields, settings)
2. Extract customHtml → `template.html`
3. Extract customCss → `template.css`  
4. Scan customHtml for asset references → include referenced files
5. Generate `template.json` from schema
6. Take canvas screenshot → `thumbnail.png` (or use placeholder)
7. Pack as ZIP → download

---

## 8. Built-in Templates (shipped with module)

Located in `/Templates/_builtin/` (read-only):

| Slug | Name | Category |
|------|------|----------|
| contact-pro | Contact Us | business |
| feedback-stars | Customer Feedback | survey |
| event-reg | Event Registration | registration |
| job-application | Job Application | business |
| order-form | Order Form | order |
| newsletter | Newsletter Signup | marketing |
| support-ticket | Support Ticket | business |
| appointment | Book Appointment | booking |
| patient-intake | Patient Intake | healthcare |

User-installed templates go in `/Templates/` (writable).

---

## 9. Implementation Phases

### Phase 1 (Current — v10036):
- [x] Templates with inline customHtml/customCss (working)
- [x] Export form as JSON
- [x] Import form from JSON
- [x] Template gallery with categories

### Phase 2 (Next):
- [ ] Template stored as file package on disk
- [ ] Asset resolution ({{asset:file}})
- [ ] Thumbnail in gallery
- [ ] Install template from ZIP upload
- [ ] Export form as ZIP package

### Phase 3 (Future):
- [ ] template.js support with security scanning
- [ ] Template marketplace / online gallery
- [ ] Template versioning & updates
- [ ] AI template generation from prompt
- [ ] Community template sharing
