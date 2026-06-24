# MegaForm Template Specification v2.0
## For AI Assistants & External Developers

---

## Overview

A MegaForm template is a **single JSON file** that defines a complete form: fields, settings, and metadata. Templates can be created by AI, developers, or designers and imported directly into MegaForm.

## File Format

```
filename: template-{slug}.json
encoding: UTF-8
```

## JSON Structure

```json
{
  "templateVersion": "2.0",
  
  "meta": {
    "name": "Customer Feedback Survey",
    "slug": "customer-feedback",
    "category": "survey",
    "description": "Collect customer satisfaction ratings and detailed feedback",
    "tags": ["survey", "feedback", "rating", "customer"],
    "author": "MegaForm Team",
    "locale": "en-US",
    "thumbnail": "customer-feedback.png",
    "difficulty": "beginner"
  },

  "form": {
    "title": "Customer Feedback",
    "description": "We'd love to hear about your experience",
    "submitButtonText": "Submit Feedback",
    "successMessage": "Thank you for your feedback!",
    "redirectUrl": "",
    "settings": {
      "enableCaptcha": false,
      "requireAuth": false,
      "enableSaveResume": false,
      "multiPage": false
    }
  },

  "fields": [
    { ... },
    { ... }
  ],

  "theme": {
    "primaryColor": "#6366f1",
    "fontFamily": "Inter, sans-serif",
    "borderRadius": "8px",
    "style": "modern"
  },

  "translations": {
    "vi-VN": {
      "form": {
        "title": "Phản hồi khách hàng",
        "description": "Chúng tôi muốn nghe về trải nghiệm của bạn",
        "submitButtonText": "Gửi phản hồi"
      },
      "fields": {
        "customer_name": { "label": "Họ tên", "placeholder": "Nhập họ tên" },
        "rating": { "label": "Đánh giá" }
      }
    }
  }
}
```

---

## Field Specification

### Common Properties (all field types)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `key` | string | YES | Unique machine name. Format: `snake_case`. Example: `first_name`, `order_total` |
| `type` | string | YES | Field type. See list below |
| `label` | string | YES | Display label |
| `placeholder` | string | no | Placeholder text |
| `helpText` | string | no | Help text below field |
| `required` | boolean | no | Default: false |
| `defaultValue` | string | no | Pre-filled value |
| `width` | string | no | `"100%"` (default) or `"50%"` for side-by-side |
| `order` | number | no | Display order (auto-assigned if missing) |
| `pageIndex` | number | no | Page number for multi-page forms (0-based) |
| `cssClass` | string | no | Custom CSS class |

### Field Types

#### Basic Fields

**Text** — Single line text
```json
{
  "key": "first_name",
  "type": "Text",
  "label": "First Name",
  "required": true,
  "placeholder": "Enter your name",
  "validation": { "minLength": 2, "maxLength": 100 }
}
```

**Textarea** — Multi-line text
```json
{
  "key": "message",
  "type": "Textarea",
  "label": "Your Message",
  "placeholder": "Tell us more...",
  "validation": { "minLength": 10, "maxLength": 2000 }
}
```

**Email** — Email with validation
```json
{
  "key": "email",
  "type": "Email",
  "label": "Email Address",
  "required": true,
  "placeholder": "you@example.com"
}
```

**Number** — Numeric input
```json
{
  "key": "quantity",
  "type": "Number",
  "label": "Quantity",
  "validation": { "min": 1, "max": 100 }
}
```

**Date** — Date picker
```json
{
  "key": "appointment_date",
  "type": "Date",
  "label": "Preferred Date"
}
```

**Phone** — Phone number
```json
{
  "key": "phone",
  "type": "Phone",
  "label": "Phone Number",
  "placeholder": "+84 xxx xxx xxx"
}
```

**Url** — URL input
```json
{
  "key": "website",
  "type": "Url",
  "label": "Website",
  "placeholder": "https://..."
}
```

#### Choice Fields

**Select** — Dropdown
```json
{
  "key": "department",
  "type": "Select",
  "label": "Department",
  "placeholder": "Choose one...",
  "options": [
    { "value": "sales", "label": "Sales" },
    { "value": "support", "label": "Support" },
    { "value": "billing", "label": "Billing" }
  ]
}
```

**Radio** — Single choice
```json
{
  "key": "priority",
  "type": "Radio",
  "label": "Priority",
  "options": [
    { "value": "low", "label": "Low" },
    { "value": "medium", "label": "Medium" },
    { "value": "high", "label": "High" }
  ]
}
```

**Checkbox** — Multiple choice
```json
{
  "key": "interests",
  "type": "Checkbox",
  "label": "Interests",
  "options": [
    { "value": "product", "label": "Product updates" },
    { "value": "events", "label": "Events" },
    { "value": "newsletter", "label": "Newsletter" }
  ]
}
```

#### Advanced Fields

**Rating** — Star rating (1-5)
```json
{
  "key": "satisfaction",
  "type": "Rating",
  "label": "How satisfied are you?",
  "required": true
}
```

**Signature** — Drawing pad
```json
{
  "key": "signature",
  "type": "Signature",
  "label": "Your Signature",
  "required": true
}
```

**File** — File upload
```json
{
  "key": "resume",
  "type": "File",
  "label": "Upload Resume",
  "fileSettings": {
    "maxSizeMB": 5,
    "allowedTypes": ".pdf,.doc,.docx",
    "maxFiles": 1
  }
}
```

**Hidden** — Hidden field (for tracking)
```json
{
  "key": "source",
  "type": "Hidden",
  "defaultValue": "website",
  "prefillParam": "utm_source"
}
```

#### Layout Fields

**Section** — Section divider
```json
{
  "key": "section_personal",
  "type": "Section",
  "label": "Personal Information"
}
```

**Html** — Custom HTML block
```json
{
  "key": "notice",
  "type": "Html",
  "label": "",
  "htmlContent": "<div style='background:#fef3c7;padding:12px;border-radius:8px;'>Please complete all required fields.</div>"
}
```

#### Widget Fields

**Calculator** — Dynamic calculation
```json
{
  "key": "total_price",
  "type": "Calculator",
  "label": "Price Calculator",
  "widgetProps": {
    "variables": [
      { "key": "qty", "label": "Quantity", "source": "", "inputType": "number", "defaultValue": "1" }
    ],
    "formulas": [
      { "key": "result", "label": "Total", "formula": "qty * 100", "prefix": "$", "decimals": 2, "visible": true }
    ],
    "tiers": [],
    "displayMode": "card",
    "showDebug": false,
    "locale": "en-US"
  }
}
```

#### Conditional Logic

Any field can have `showIf` to conditionally show/hide:

```json
{
  "key": "other_reason",
  "type": "Textarea",
  "label": "Please specify",
  "showIf": {
    "operator": "And",
    "conditions": [
      { "fieldKey": "reason", "operator": "Equals", "value": "other" }
    ]
  }
}
```

Operators: `Equals`, `NotEquals`, `Contains`, `IsEmpty`, `IsNotEmpty`
Logic: `And` (all conditions), `Or` (any condition)

---

## Categories

Use one of these standard categories:

| Category | Description | Examples |
|----------|-------------|----------|
| `contact` | Contact & inquiry forms | Contact Us, Request Quote, Callback |
| `survey` | Surveys & feedback | Customer Feedback, NPS, Employee Survey |
| `registration` | Sign-up & registration | Event Registration, Course Enrollment |
| `order` | Orders & booking | Order Form, Booking Request, Reservation |
| `application` | Applications & recruitment | Job Application, Scholarship, Membership |
| `healthcare` | Health & medical | Patient Intake, Appointment, Health Assessment |
| `education` | Education & training | Student Enrollment, Course Evaluation |
| `hr` | Human resources | Leave Request, Expense Report, Onboarding |
| `crm` | Customer relationship | Lead Capture, Customer Profile, Support Ticket |
| `marketing` | Marketing & lead gen | Newsletter Signup, Contest Entry, Landing Page |
| `finance` | Financial & accounting | Invoice Request, Budget Proposal, Tax Form |
| `general` | General purpose | Blank, Generic Feedback |

---

## Template Examples

### Example 1: Simple Contact Form

```json
{
  "templateVersion": "2.0",
  "meta": {
    "name": "Simple Contact Form",
    "slug": "simple-contact",
    "category": "contact",
    "description": "Basic contact form with name, email, and message",
    "tags": ["contact", "simple", "beginner"],
    "author": "AI Generator",
    "locale": "en-US"
  },
  "form": {
    "title": "Contact Us",
    "description": "We'd love to hear from you",
    "submitButtonText": "Send Message",
    "successMessage": "Thank you! We'll get back to you within 24 hours."
  },
  "fields": [
    { "key": "name", "type": "Text", "label": "Your Name", "required": true, "placeholder": "John Doe", "width": "50%" },
    { "key": "email", "type": "Email", "label": "Email", "required": true, "placeholder": "john@example.com", "width": "50%" },
    { "key": "subject", "type": "Select", "label": "Subject", "options": [
      { "value": "general", "label": "General Inquiry" },
      { "value": "support", "label": "Technical Support" },
      { "value": "sales", "label": "Sales" },
      { "value": "other", "label": "Other" }
    ]},
    { "key": "message", "type": "Textarea", "label": "Message", "required": true, "placeholder": "How can we help?" }
  ]
}
```

### Example 2: Customer Satisfaction Survey

```json
{
  "templateVersion": "2.0",
  "meta": {
    "name": "Customer Satisfaction Survey",
    "slug": "csat-survey",
    "category": "survey",
    "description": "CSAT survey with rating, NPS, and open-ended feedback",
    "tags": ["survey", "csat", "nps", "rating"],
    "author": "AI Generator"
  },
  "form": {
    "title": "How did we do?",
    "description": "Your feedback helps us improve",
    "submitButtonText": "Submit Feedback",
    "successMessage": "Thank you for your valuable feedback!"
  },
  "fields": [
    { "key": "section_rating", "type": "Section", "label": "Overall Experience" },
    { "key": "overall_rating", "type": "Rating", "label": "How would you rate your overall experience?", "required": true },
    { "key": "recommend", "type": "Radio", "label": "How likely are you to recommend us?", "options": [
      { "value": "10", "label": "Definitely (10)" },
      { "value": "8", "label": "Very likely (8)" },
      { "value": "6", "label": "Somewhat likely (6)" },
      { "value": "4", "label": "Unlikely (4)" },
      { "value": "2", "label": "Not at all (2)" }
    ]},
    { "key": "section_details", "type": "Section", "label": "Tell Us More" },
    { "key": "what_liked", "type": "Textarea", "label": "What did you like most?", "placeholder": "Tell us what went well..." },
    { "key": "what_improve", "type": "Textarea", "label": "What could we improve?", "placeholder": "How can we do better..." },
    { "key": "section_contact", "type": "Section", "label": "Optional: Stay in Touch" },
    { "key": "email", "type": "Email", "label": "Email (optional)", "placeholder": "your@email.com", "helpText": "Only if you'd like us to follow up" }
  ]
}
```

### Example 3: Job Application (Multi-page)

```json
{
  "templateVersion": "2.0",
  "meta": {
    "name": "Job Application",
    "slug": "job-application",
    "category": "application",
    "description": "Multi-page job application with resume upload",
    "tags": ["job", "application", "hr", "recruitment"]
  },
  "form": {
    "title": "Job Application",
    "description": "Apply to join our team",
    "submitButtonText": "Submit Application",
    "successMessage": "Application received! We'll review it and get back to you.",
    "settings": { "multiPage": true, "enableSaveResume": true }
  },
  "fields": [
    { "key": "section_p1", "type": "Section", "label": "Personal Information", "pageIndex": 0 },
    { "key": "full_name", "type": "Text", "label": "Full Name", "required": true, "width": "50%", "pageIndex": 0 },
    { "key": "email", "type": "Email", "label": "Email", "required": true, "width": "50%", "pageIndex": 0 },
    { "key": "phone", "type": "Phone", "label": "Phone", "required": true, "width": "50%", "pageIndex": 0 },
    { "key": "linkedin", "type": "Url", "label": "LinkedIn Profile", "width": "50%", "pageIndex": 0 },
    
    { "key": "section_p2", "type": "Section", "label": "Experience & Skills", "pageIndex": 1 },
    { "key": "position", "type": "Select", "label": "Position Applied For", "required": true, "pageIndex": 1, "options": [
      { "value": "developer", "label": "Software Developer" },
      { "value": "designer", "label": "UI/UX Designer" },
      { "value": "pm", "label": "Project Manager" },
      { "value": "qa", "label": "QA Engineer" }
    ]},
    { "key": "experience", "type": "Radio", "label": "Years of Experience", "required": true, "pageIndex": 1, "options": [
      { "value": "0-1", "label": "0-1 years" },
      { "value": "2-3", "label": "2-3 years" },
      { "value": "4-6", "label": "4-6 years" },
      { "value": "7+", "label": "7+ years" }
    ]},
    { "key": "skills", "type": "Checkbox", "label": "Key Skills", "pageIndex": 1, "options": [
      { "value": "js", "label": "JavaScript" },
      { "value": "python", "label": "Python" },
      { "value": "csharp", "label": "C#" },
      { "value": "react", "label": "React" },
      { "value": "sql", "label": "SQL" }
    ]},
    
    { "key": "section_p3", "type": "Section", "label": "Documents", "pageIndex": 2 },
    { "key": "resume", "type": "File", "label": "Resume/CV", "required": true, "pageIndex": 2, "fileSettings": { "maxSizeMB": 10, "allowedTypes": ".pdf,.doc,.docx" }},
    { "key": "cover_letter", "type": "Textarea", "label": "Cover Letter", "pageIndex": 2, "placeholder": "Tell us why you'd be a great fit..." },
    { "key": "start_date", "type": "Date", "label": "Available Start Date", "pageIndex": 2 }
  ]
}
```

---

## Validation Rules

Templates MUST pass these checks:

1. Every field has `key`, `type`, and `label`
2. All `key` values are unique within the template
3. `key` format: lowercase, letters/numbers/underscore only, 1-50 chars
4. `type` is one of the supported types listed above
5. `options` array required for Select, Radio, Checkbox types
6. Each option has `value` and `label`
7. `meta.name` and `meta.category` are required
8. `form.title` is required

## Import API

```
POST /API/MegaForm/Templates/Import
Content-Type: application/json
Body: { template JSON }

Response: { success: true, formId: 123 }
```

## Batch Import

```
POST /API/MegaForm/Templates/ImportBatch
Content-Type: application/json
Body: { templates: [ ...array of template JSONs ] }
```
