namespace MegaForm.Samples.SdkWebDemo.HostedServices
{
    /// <summary>
    /// Rich demo schemas and templates for the MegaForm SDK sample app.
    /// </summary>
    public static class DemoSchemas
    {
        public const string EventRegistration = """
{
  "version": "1.0",
  "pages": [
    { "title": "Personal Information", "description": "Tell us who you are." },
    { "title": "Preferences", "description": "Choose your session and extras." },
    { "title": "Review & Submit", "description": "Confirm your details." }
  ],
  "fields": [
    {
      "key": "header_1",
      "type": "Html",
      "htmlContent": "<h2 class='mf-section-title'>Welcome to MegaForm Demo</h2><p class='mf-section-subtitle'>Experience multi-step forms, conditional logic and rich themes.</p>",
      "pageIndex": 0,
      "order": 0
    },
    {
      "key": "row_name",
      "type": "Row",
      "label": "Full Name",
      "pageIndex": 0,
      "order": 1,
      "columns": [
        {
          "span": 6,
          "fields": [
            {
              "key": "firstName",
              "type": "Text",
              "label": "First Name",
              "placeholder": "Jane",
              "required": true,
              "validation": { "minLength": 2, "maxLength": 50 }
            }
          ]
        },
        {
          "span": 6,
          "fields": [
            {
              "key": "lastName",
              "type": "Text",
              "label": "Last Name",
              "placeholder": "Doe",
              "required": true,
              "validation": { "minLength": 2, "maxLength": 50 }
            }
          ]
        }
      ]
    },
    {
      "key": "email",
      "type": "Email",
      "label": "Email Address",
      "placeholder": "jane.doe@example.com",
      "required": true,
      "width": "col-12",
      "pageIndex": 0,
      "order": 2
    },
    {
      "key": "phone",
      "type": "Phone",
      "label": "Phone Number",
      "placeholder": "555-123-4567",
      "required": true,
      "validation": { "mask": "###-###-####" },
      "width": "col-6",
      "pageIndex": 0,
      "order": 3
    },
    {
      "key": "birthDate",
      "type": "Date",
      "label": "Date of Birth",
      "required": false,
      "width": "col-6",
      "pageIndex": 0,
      "order": 4
    },
    {
      "key": "session",
      "type": "Radio",
      "label": "Select your session",
      "required": true,
      "optionDisplay": "cards",
      "options": [
        { "label": "Marketing Growth (9:00 AM)", "value": "marketing" },
        { "label": "Product Engineering (11:00 AM)", "value": "engineering" },
        { "label": "Design Systems (2:00 PM)", "value": "design" }
      ],
      "pageIndex": 1,
      "order": 5
    },
    {
      "key": "workshops",
      "type": "Checkbox",
      "label": "Optional workshops",
      "helpText": "Select the extra sessions you would like to attend.",
      "options": [
        { "label": "AI-Powered Forms ($50)", "value": "ai" },
        { "label": "Workflow Automation ($75)", "value": "workflow" },
        { "label": "Multi-tenant Architecture ($100)", "value": "multitenant" }
      ],
      "pageIndex": 1,
      "order": 6
    },
    {
      "key": "dietary",
      "type": "Dropdown",
      "label": "Dietary requirements",
      "placeholder": "Choose an option",
      "required": false,
      "options": [
        { "label": "None", "value": "none" },
        { "label": "Vegetarian", "value": "vegetarian" },
        { "label": "Vegan", "value": "vegan" },
        { "label": "Gluten-free", "value": "glutenfree" }
      ],
      "pageIndex": 1,
      "order": 7
    },
    {
      "key": "experience",
      "type": "Number",
      "label": "Years of experience",
      "required": false,
      "validation": { "min": 0, "max": 60 },
      "width": "col-6",
      "pageIndex": 1,
      "order": 8
    },
    {
      "key": "satisfaction",
      "type": "Rating",
      "label": "How excited are you?",
      "required": true,
      "widgetProps": { "max": 5 },
      "pageIndex": 1,
      "order": 9
    },
    {
      "key": "resume",
      "type": "File",
      "label": "Upload your resume or portfolio (optional)",
      "helpText": "PDF, DOCX or images up to 5 MB.",
      "required": false,
      "fileSettings": { "allowedExtensions": ".pdf,.docx,.png,.jpg", "maxFileSizeMb": 5 },
      "pageIndex": 2,
      "order": 10
    },
    {
      "key": "comments",
      "type": "LongText",
      "label": "Additional comments",
      "placeholder": "Anything else we should know?",
      "required": false,
      "rows": 4,
      "pageIndex": 2,
      "order": 11
    },
    {
      "key": "terms",
      "type": "Terms",
      "label": "I agree to the event terms and privacy policy.",
      "required": true,
      "widgetProps": { "termsUrl": "/terms", "privacyUrl": "/privacy" },
      "pageIndex": 2,
      "order": 12
    }
  ],
  "settings": {
    "submitButtonText": "Register Now",
    "successMessage": "Thank you for registering! We have sent a confirmation email.",
    "enableSaveResume": true,
    "postSubmitExperience": {
      "enabled": true,
      "mode": "rich",
      "title": "Registration Confirmed",
      "message": "Thank you for registering. See you at the event!",
      "showSubmissionId": true,
      "reviewBeforeSubmit": true,
      "reviewTitle": "Review your registration"
    }
  }
}
""";

        public const string EventTheme = """
{
  "presetKey": "modern",
  "colors": {
    "primary": "#4f46e5",
    "primaryHover": "#4338ca",
    "background": "#ffffff",
    "surface": "#f8fafc",
    "text": "#0f172a",
    "textMuted": "#64748b",
    "border": "#e2e8f0",
    "success": "#10b981",
    "error": "#ef4444"
  },
  "typography": {
    "fontFamily": "DM Sans, system-ui, sans-serif",
    "headingSize": "1.5rem",
    "bodySize": "1rem"
  },
  "form": {
    "maxWidth": "720px",
    "padding": "2rem",
    "borderRadius": "1rem",
    "shadow": "0 10px 40px rgba(15, 23, 42, 0.08)"
  }
}
""";

        public const string EventSettings = """
{
  "layout": "multi-page",
  "showProgressBar": true,
  "showPageNumbers": true,
  "enableSaveResume": true,
  "autoSaveIntervalSeconds": 30
}
""";

        public const string ContactForm = """
{
  "version": "1.0",
  "fields": [
    { "key": "name", "type": "Text", "label": "Full Name", "required": true },
    { "key": "email", "type": "Email", "label": "Email Address", "required": true },
    { "key": "phone", "type": "Phone", "label": "Phone Number" },
    { "key": "subject", "type": "Dropdown", "label": "Subject", "options": [
      { "label": "General Inquiry", "value": "general" },
      { "label": "Sales", "value": "sales" },
      { "label": "Support", "value": "support" }
    ]},
    { "key": "message", "type": "LongText", "label": "Message", "required": true, "rows": 5 }
  ],
  "settings": {
    "submitButtonText": "Send Message",
    "successMessage": "Thank you for contacting us. We will reply shortly."
  }
}
""";

        public const string JobApplication = """
{
  "version": "1.0",
  "pages": [
    { "title": "About You" },
    { "title": "Experience" },
    { "title": "Review" }
  ],
  "fields": [
    {
      "key": "firstName", "type": "Text", "label": "First Name", "required": true, "pageIndex": 0, "order": 0
    },
    {
      "key": "lastName", "type": "Text", "label": "Last Name", "required": true, "pageIndex": 0, "order": 1
    },
    {
      "key": "email", "type": "Email", "label": "Email", "required": true, "pageIndex": 0, "order": 2
    },
    {
      "key": "position", "type": "Radio", "label": "Position", "required": true,
      "options": [
        { "label": "Frontend Engineer", "value": "frontend" },
        { "label": "Backend Engineer", "value": "backend" },
        { "label": "Product Designer", "value": "designer" }
      ],
      "pageIndex": 1, "order": 3
    },
    {
      "key": "yearsExperience", "type": "Number", "label": "Years of Experience", "required": true,
      "validation": { "min": 0, "max": 50 },
      "pageIndex": 1, "order": 4
    },
    {
      "key": "resume", "type": "File", "label": "Resume", "required": true,
      "fileSettings": { "allowedExtensions": ".pdf,.docx", "maxFileSizeMb": 5 },
      "pageIndex": 1, "order": 5
    },
    {
      "key": "coverLetter", "type": "LongText", "label": "Cover Letter", "rows": 4,
      "pageIndex": 2, "order": 6
    },
    {
      "key": "terms", "type": "Terms", "label": "I confirm the information is accurate.", "required": true,
      "pageIndex": 2, "order": 7
    }
  ],
  "settings": {
    "submitButtonText": "Submit Application",
    "successMessage": "Your application has been received. Good luck!",
    "postSubmitExperience": {
      "enabled": true,
      "mode": "rich",
      "title": "Application Submitted"
    }
  }
}
""";
    }
}
