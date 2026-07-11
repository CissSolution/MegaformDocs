// ============================================================
// MegaForm Core - Recruitment Pipeline Business Starter
// ------------------------------------------------------------
// First MULTI-FORM starter app. Real business apps rarely fit in
// a single form; recruitment in particular needs three:
//
//   1. Job Posting        (HR creates an open position)
//   2. Candidate Application  (public applies to a posting)
//   3. Interview Feedback (interviewer scores a candidate)
//
// All three share AppScope = "recruitment", a single
// AppDefinition record, and three roles (HR Manager / Hiring
// Manager / Interviewer). Sample data is cross-linked: each
// application references a real job_id, each interview
// feedback references a real application_id.
//
// Architecture difference vs the four single-form starters:
//   - Drives 3 forms in one EnsureStarter() call instead of 1.
//   - Returns RecruitmentStarterResult with all 3 formIds + the
//     "default" one to redirect to (Job Postings board).
//   - Sample seeding runs in order Posting -> Application ->
//     Feedback so FK refs resolve.
// ============================================================

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.ViewModes;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Starters
{
    public class RecruitmentStarterResult
    {
        public int AppId { get; set; }
        public string AppKey { get; set; }
        public string AppScope { get; set; }
        public int JobPostingFormId { get; set; }
        public int ApplicationFormId { get; set; }
        public int InterviewFormId { get; set; }
        public List<int> FormIds { get; set; } = new List<int>();
        public string DefaultViewKey { get; set; }
        public string BoardUrl { get; set; }
        public string SubmitUrl { get; set; }
        public List<StarterCredentialInfo> Credentials { get; set; } = new List<StarterCredentialInfo>();
        public Dictionary<string, int> SampleCounts { get; set; } = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
    }

    public class RecruitmentStarterService
    {
        public const string StarterAppScope = "recruitment";
        public const string StarterAppKey = "recruitment-starter";
        public const string StarterAppName = "Recruitment Pipeline";
        public const string JobPostingFormTitle      = "Recruitment - Job Posting";
        public const string ApplicationFormTitle     = "Recruitment - Candidate Application";
        public const string InterviewFormTitle       = "Recruitment - Interview Feedback";
        public const string RegisteredUsersRole = "Registered Users";
        public const string HrManagerRole       = "Recruitment HR Managers";
        public const string HiringManagerRole   = "Recruitment Hiring Managers";
        public const string InterviewerRole     = "Recruitment Interviewers";
        public const string StarterPassword     = "";
        public const string HrManagerUserName     = "recruit.hr";
        public const string HiringManagerUserName = "recruit.hiring";
        public const string InterviewerUserName   = "recruit.interviewer";

        private readonly IFormRepository _forms;
        private readonly ISubmissionRepository _submissions;
        private readonly IPhase2Repository _phase2;
        private readonly IWorkflowRepository _workflowRepo;
        private readonly WorkflowTaskService _workflowTasks;
        private readonly SubmissionProcessor _submissionProcessor;
        private readonly AppDefinitionService _apps;
        private readonly AppQueryRegistryService _queries;
        private readonly IWorkflowIdentityProvisioningService _identityProvisioning;
        private readonly IStarterPlatformAdapter _platform;
        private readonly ILogService _log;

        public RecruitmentStarterService(
            IFormRepository forms,
            ISubmissionRepository submissions,
            IPhase2Repository phase2,
            IWorkflowRepository workflowRepo,
            WorkflowTaskService workflowTasks,
            SubmissionProcessor submissionProcessor,
            AppDefinitionService apps,
            AppQueryRegistryService queries,
            IWorkflowIdentityProvisioningService identityProvisioning,
            IStarterPlatformAdapter platform,
            ILogService log = null)
        {
            _forms = forms ?? throw new ArgumentNullException(nameof(forms));
            _submissions = submissions ?? throw new ArgumentNullException(nameof(submissions));
            _phase2 = phase2 ?? throw new ArgumentNullException(nameof(phase2));
            _workflowRepo = workflowRepo ?? throw new ArgumentNullException(nameof(workflowRepo));
            _workflowTasks = workflowTasks ?? throw new ArgumentNullException(nameof(workflowTasks));
            _submissionProcessor = submissionProcessor ?? throw new ArgumentNullException(nameof(submissionProcessor));
            _apps = apps ?? throw new ArgumentNullException(nameof(apps));
            _queries = queries ?? throw new ArgumentNullException(nameof(queries));
            _identityProvisioning = identityProvisioning ?? throw new ArgumentNullException(nameof(identityProvisioning));
            _platform = platform ?? throw new ArgumentNullException(nameof(platform));
            _log = log;
        }

        public RecruitmentStarterResult EnsureStarter(int portalId, int moduleId, string homeUrl, UserContext actor)
        {
            if (portalId < 0) throw new InvalidOperationException("portalId/siteId is required.");
            actor = actor ?? new UserContext();

            // 1. App definition (single record for all 3 forms)
            var app = EnsureAppDefinition(portalId, actor);

            // 2. Three forms — order matters because sample data of form 2
            //    references form-1 ids, sample data of form 3 references form-2 ids.
            var jobPostingFormId  = EnsureJobPostingForm(portalId, moduleId, actor);
            var applicationFormId = EnsureApplicationForm(portalId, moduleId, actor);
            var interviewFormId   = EnsureInterviewForm(portalId, moduleId, actor);

            // 3. Per-form views + permissions
            EnsureJobPostingViews(jobPostingFormId);
            EnsureApplicationViews(applicationFormId);
            EnsureInterviewViews(interviewFormId);
            EnsurePermissions(jobPostingFormId);
            EnsurePermissions(applicationFormId);
            EnsurePermissions(interviewFormId);

            // 4. Workflows (one per form; simple Submit -> Review path)
            ApplyJobPostingWorkflow(jobPostingFormId);
            ApplyApplicationWorkflow(applicationFormId);
            ApplyInterviewWorkflow(interviewFormId);

            // 5. Wipe prior runtime data so reseed is clean
            _platform.ResetFormRuntimeData(jobPostingFormId);
            _platform.ResetFormRuntimeData(applicationFormId);
            _platform.ResetFormRuntimeData(interviewFormId);

            // 6. Users + roles
            var hr         = EnsureUser(portalId, HrManagerRole,     HrManagerUserName,     "Recruitment HR",      "recruit.hr@megaform.local",          actor);
            var hiring     = EnsureUser(portalId, HiringManagerRole, HiringManagerUserName, "Hiring Manager",       "recruit.hiring@megaform.local",      actor);
            var interviewer= EnsureUser(portalId, InterviewerRole,   InterviewerUserName,   "Senior Interviewer",   "recruit.interviewer@megaform.local", actor);

            // 7. Sample data (cross-linked)
            var jobIds = SeedJobPostings(jobPostingFormId, hr);
            var appIds = SeedApplications(applicationFormId, hiring, jobIds);
            SeedInterviewFeedback(interviewFormId, interviewer, appIds);

            // 8. Counts for the UI
            var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                ["jobs"]         = jobIds.Count,
                ["applications"] = appIds.Count,
                ["feedback"]     = _submissions.List(interviewFormId, pageIndex: 0, pageSize: 200).TotalCount
            };

            return new RecruitmentStarterResult
            {
                AppId             = app.AppId,
                AppKey            = app.AppKey,
                AppScope          = app.AppScope,
                JobPostingFormId  = jobPostingFormId,
                ApplicationFormId = applicationFormId,
                InterviewFormId   = interviewFormId,
                FormIds           = new List<int> { jobPostingFormId, applicationFormId, interviewFormId },
                DefaultViewKey    = "recruitment-job-board",
                BoardUrl          = BuildUrl(homeUrl, "?vk=recruitment-job-board"),
                SubmitUrl         = BuildUrl(homeUrl, "?view=form"),
                Credentials = new List<StarterCredentialInfo>
                {
                    ToCredential(hr,          HrManagerRole),
                    ToCredential(hiring,      HiringManagerRole),
                    ToCredential(interviewer, InterviewerRole)
                },
                SampleCounts = counts
            };
        }

        // ===== App definition =====================================================

        private AppDefinitionInfo EnsureAppDefinition(int portalId, UserContext actor)
        {
            var bundle = _apps.GetByScope(portalId, StarterAppScope, hydrateManifest: false);
            var app = bundle?.App ?? new AppDefinitionInfo();
            app.PortalId    = portalId;
            app.AppKey      = StarterAppKey;
            app.AppName     = StarterAppName;
            app.Description = "Seeded MegaForm multi-form business starter: HR posts jobs, candidates apply, interviewers score. Three linked forms share roles + sample pipeline data.";
            app.AppScope    = StarterAppScope;
            app.Icon        = "fa-solid fa-users-gear";
            app.AccentColor = "#7c3aed";
            app.IsEnabled   = true;
            app.SortOrder   = 50;
            app.CreatedByUserId  = app.CreatedByUserId > 0 ? app.CreatedByUserId : actor.UserId;
            app.ModifiedByUserId = actor.UserId;
            app.SettingsJson  = JsonConvert.SerializeObject(new { starter = "recruitment", defaultViewKey = "recruitment-job-board", multiForm = true, formCount = 3 });
            app.ResourcesJson = JsonConvert.SerializeObject(new { jobBoardLabel = "Open Jobs", applicationsLabel = "Applications", feedbackLabel = "Interview Feedback" });

            var manifest = new AppManifestDefinition
            {
                Profile = new AppProfileDefinition
                {
                    Scope = StarterAppScope,
                    DisplayName = "Recruitment",
                    EntitySingular = "Candidate",
                    EntityPlural = "Candidates",
                    EnableWorkflowInbox = true,
                    EnableAssignments = true,
                    EnableComments = true
                },
                Settings = new Dictionary<string, string>
                {
                    ["starter"] = "recruitment",
                    ["defaultViewKey"] = "recruitment-job-board",
                    ["multiForm"] = "true",
                    ["formCount"] = "3"
                },
                Resources = new Dictionary<string, string>
                {
                    ["jobBoardLabel"]     = "Open Jobs",
                    ["applicationsLabel"] = "Applications",
                    ["feedbackLabel"]     = "Interview Feedback"
                }
            };

            _apps.Save(app, manifest);
            return _apps.Get(portalId, StarterAppKey, hydrateManifest: false)?.App ?? app;
        }

        // ===== Form 1: Job Posting ================================================

        private int EnsureJobPostingForm(int portalId, int moduleId, UserContext actor)
        {
            var existing = (_forms.ListForms(portalId, pageSize: 0) ?? new List<FormInfo>())
                .FirstOrDefault(f => f != null
                    && string.Equals(f.AppScope ?? string.Empty, StarterAppScope, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(f.Title ?? string.Empty, JobPostingFormTitle, StringComparison.OrdinalIgnoreCase));

            var schema = new FormSchema
            {
                Version = "1.0",
                Settings = new FormSettings { LabelPosition = "top", RateLimitWindowMinutes = 2, RateLimitMaxPerWindow = 100 },
                Fields = new List<FormField>
                {
                    new FormField { Key = "position_title", Type = "Text",     Label = "Position Title",    Required = true,  Width = "col-12", Order = 10 },
                    new FormField { Key = "department",     Type = "Select",   Label = "Department",        Required = true,  Width = "col-6",  Order = 20,
                        Options = new List<MegaForm.Core.Models.FieldOption> {
                            new MegaForm.Core.Models.FieldOption { Label = "Engineering",  Value = "Engineering" },
                            new MegaForm.Core.Models.FieldOption { Label = "Product",      Value = "Product" },
                            new MegaForm.Core.Models.FieldOption { Label = "Sales",        Value = "Sales" },
                            new MegaForm.Core.Models.FieldOption { Label = "Marketing",    Value = "Marketing" },
                            new MegaForm.Core.Models.FieldOption { Label = "Operations",   Value = "Operations" },
                            new MegaForm.Core.Models.FieldOption { Label = "HR",           Value = "HR" } } },
                    new FormField { Key = "location",       Type = "Text",     Label = "Location",           Required = true, Width = "col-6", Order = 30, Placeholder = "City / Remote" },
                    new FormField { Key = "employment_type", Type = "Select",  Label = "Employment Type",    Required = true, Width = "col-6", Order = 40,
                        Options = new List<MegaForm.Core.Models.FieldOption> {
                            new MegaForm.Core.Models.FieldOption { Label = "Full-Time", Value = "Full-Time" },
                            new MegaForm.Core.Models.FieldOption { Label = "Part-Time", Value = "Part-Time" },
                            new MegaForm.Core.Models.FieldOption { Label = "Contract",  Value = "Contract" },
                            new MegaForm.Core.Models.FieldOption { Label = "Internship", Value = "Internship" } } },
                    new FormField { Key = "salary_range",   Type = "Text",     Label = "Salary Range",       Width = "col-6", Order = 50, Placeholder = "e.g. $80k - $120k" },
                    new FormField { Key = "requirements",   Type = "Textarea", Label = "Requirements",       Required = true, Width = "col-12", Order = 60, Placeholder = "Years of experience, skills, certifications..." },
                    new FormField { Key = "reports_to_email", Type = "Email",  Label = "Hiring Manager Email", Required = true, Width = "col-12", Order = 70 }
                }
            };

            var form = existing ?? new FormInfo();
            form.ModuleId           = moduleId;
            form.PortalId           = portalId;
            form.Title              = JobPostingFormTitle;
            form.Description        = "Internal form HR uses to post a new open position. Each posting becomes a row in the recruitment app's Open Jobs board, and candidate applications reference its FormId via a job_id field.";
            form.SchemaJson         = JsonConvert.SerializeObject(schema);
            form.SettingsJson       = JsonConvert.SerializeObject(new { starter = "recruitment", formRole = "job-posting", appProfile = StarterAppScope });
            form.Status             = "Published";
            form.SubmitButtonText   = "Post Job";
            form.SuccessMessage     = "Job posting created. Candidates can now apply.";
            form.RequireAuth        = true;
            form.EnableCaptcha      = false;
            form.EnableSaveResume   = false;
            form.AppScope           = StarterAppScope;
            form.CreatedByUserId    = form.CreatedByUserId > 0 ? form.CreatedByUserId : actor.UserId;
            form.ThemeJson          = form.ThemeJson ?? string.Empty;
            form.NotifyEmails       = string.Empty;
            form.WebhookUrl         = string.Empty;
            form.WebhookSecret      = string.Empty;
            form.WebhookHeaders     = string.Empty;
            form.AutoresponderEnabled = false;
            return _forms.SaveForm(form);
        }

        // ===== Form 2: Candidate Application ======================================

        private int EnsureApplicationForm(int portalId, int moduleId, UserContext actor)
        {
            var existing = (_forms.ListForms(portalId, pageSize: 0) ?? new List<FormInfo>())
                .FirstOrDefault(f => f != null
                    && string.Equals(f.AppScope ?? string.Empty, StarterAppScope, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(f.Title ?? string.Empty, ApplicationFormTitle, StringComparison.OrdinalIgnoreCase));

            var schema = new FormSchema
            {
                Version = "1.0",
                Settings = new FormSettings { LabelPosition = "top", RateLimitWindowMinutes = 2, RateLimitMaxPerWindow = 100 },
                Fields = new List<FormField>
                {
                    new FormField { Key = "job_id",          Type = "Text",     Label = "Job Posting ID",    Required = true, Width = "col-6", Order = 10, HelpText = "Submission ID of the Job Posting this candidate is applying to" },
                    new FormField { Key = "position_title",  Type = "Text",     Label = "Position Title",    Required = true, Width = "col-6", Order = 15 },
                    new FormField { Key = "candidate_name",  Type = "Text",     Label = "Full Name",         Required = true, Width = "col-6", Order = 20 },
                    new FormField { Key = "candidate_email", Type = "Email",    Label = "Email",             Required = true, Width = "col-6", Order = 30 },
                    new FormField { Key = "phone",           Type = "Text",     Label = "Phone",             Width = "col-6", Order = 40 },
                    new FormField { Key = "years_experience", Type = "Number",  Label = "Years Experience",  Width = "col-6", Order = 50 },
                    new FormField { Key = "current_company", Type = "Text",     Label = "Current Company",   Width = "col-12", Order = 60 },
                    new FormField { Key = "cover_letter",    Type = "Textarea", Label = "Cover Letter",      Required = true, Width = "col-12", Order = 70 },
                    new FormField { Key = "resume",          Type = "File",     Label = "Resume / CV",       Width = "col-12", Order = 80,
                        FileSettings = new FileFieldSettings { MaxSizeMB = 10, MaxFiles = 1, AllowedExtensions = new List<string> { ".pdf", ".docx" } } }
                }
            };

            var form = existing ?? new FormInfo();
            form.ModuleId           = moduleId;
            form.PortalId           = portalId;
            form.Title              = ApplicationFormTitle;
            form.Description        = "Public-facing form where a candidate applies to a posted job. References the Job Posting submission via job_id.";
            form.SchemaJson         = JsonConvert.SerializeObject(schema);
            form.SettingsJson       = JsonConvert.SerializeObject(new { starter = "recruitment", formRole = "application", appProfile = StarterAppScope, parentForm = "job-posting" });
            form.Status             = "Published";
            form.SubmitButtonText   = "Submit Application";
            form.SuccessMessage     = "Application received. The hiring manager will review and reach out if you advance.";
            form.RequireAuth        = false;  // public form
            form.EnableCaptcha      = false;
            form.EnableSaveResume   = true;
            form.AppScope           = StarterAppScope;
            form.CreatedByUserId    = form.CreatedByUserId > 0 ? form.CreatedByUserId : actor.UserId;
            form.ThemeJson          = form.ThemeJson ?? string.Empty;
            form.NotifyEmails       = string.Empty;
            form.WebhookUrl         = string.Empty;
            form.WebhookSecret      = string.Empty;
            form.WebhookHeaders     = string.Empty;
            form.AutoresponderEnabled = false;
            return _forms.SaveForm(form);
        }

        // ===== Form 3: Interview Feedback =========================================

        private int EnsureInterviewForm(int portalId, int moduleId, UserContext actor)
        {
            var existing = (_forms.ListForms(portalId, pageSize: 0) ?? new List<FormInfo>())
                .FirstOrDefault(f => f != null
                    && string.Equals(f.AppScope ?? string.Empty, StarterAppScope, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(f.Title ?? string.Empty, InterviewFormTitle, StringComparison.OrdinalIgnoreCase));

            var schema = new FormSchema
            {
                Version = "1.0",
                Settings = new FormSettings { LabelPosition = "top", RateLimitWindowMinutes = 2, RateLimitMaxPerWindow = 100 },
                Fields = new List<FormField>
                {
                    new FormField { Key = "application_id",  Type = "Text",     Label = "Application ID",     Required = true, Width = "col-6", Order = 10, HelpText = "Submission ID of the Candidate Application this feedback covers" },
                    new FormField { Key = "candidate_name",  Type = "Text",     Label = "Candidate Name",     Required = true, Width = "col-6", Order = 20 },
                    new FormField { Key = "interviewer_name", Type = "Text",    Label = "Interviewer",        Required = true, Width = "col-6", Order = 30 },
                    new FormField { Key = "interview_date",  Type = "Date",     Label = "Interview Date",     Required = true, Width = "col-6", Order = 40 },
                    new FormField { Key = "technical_score", Type = "Select",   Label = "Technical Score (1-5)", Required = true, Width = "col-4", Order = 50,
                        Options = new List<MegaForm.Core.Models.FieldOption> {
                            new MegaForm.Core.Models.FieldOption { Label = "1 - Far below bar", Value = "1" },
                            new MegaForm.Core.Models.FieldOption { Label = "2 - Below bar",     Value = "2" },
                            new MegaForm.Core.Models.FieldOption { Label = "3 - Meets bar",     Value = "3" },
                            new MegaForm.Core.Models.FieldOption { Label = "4 - Above bar",     Value = "4" },
                            new MegaForm.Core.Models.FieldOption { Label = "5 - Exceptional",   Value = "5" } } },
                    new FormField { Key = "culture_score",   Type = "Select",   Label = "Culture Fit (1-5)",   Required = true, Width = "col-4", Order = 60,
                        Options = new List<MegaForm.Core.Models.FieldOption> {
                            new MegaForm.Core.Models.FieldOption { Label = "1", Value = "1" },
                            new MegaForm.Core.Models.FieldOption { Label = "2", Value = "2" },
                            new MegaForm.Core.Models.FieldOption { Label = "3", Value = "3" },
                            new MegaForm.Core.Models.FieldOption { Label = "4", Value = "4" },
                            new MegaForm.Core.Models.FieldOption { Label = "5", Value = "5" } } },
                    new FormField { Key = "recommendation",  Type = "Select",   Label = "Recommendation",     Required = true, Width = "col-4", Order = 70,
                        Options = new List<MegaForm.Core.Models.FieldOption> {
                            new MegaForm.Core.Models.FieldOption { Label = "Strong Hire", Value = "strong-hire" },
                            new MegaForm.Core.Models.FieldOption { Label = "Hire",        Value = "hire" },
                            new MegaForm.Core.Models.FieldOption { Label = "No Hire",     Value = "no-hire" },
                            new MegaForm.Core.Models.FieldOption { Label = "Strong No Hire", Value = "strong-no-hire" } } },
                    new FormField { Key = "strengths",       Type = "Textarea", Label = "Key Strengths",      Required = true, Width = "col-12", Order = 80 },
                    new FormField { Key = "concerns",        Type = "Textarea", Label = "Concerns / Risks",   Width = "col-12", Order = 90 }
                }
            };

            var form = existing ?? new FormInfo();
            form.ModuleId           = moduleId;
            form.PortalId           = portalId;
            form.Title              = InterviewFormTitle;
            form.Description        = "Internal interviewer scorecard. References a Candidate Application via application_id. Multiple feedback entries can stack on the same application.";
            form.SchemaJson         = JsonConvert.SerializeObject(schema);
            form.SettingsJson       = JsonConvert.SerializeObject(new { starter = "recruitment", formRole = "interview-feedback", appProfile = StarterAppScope, parentForm = "application" });
            form.Status             = "Published";
            form.SubmitButtonText   = "Submit Feedback";
            form.SuccessMessage     = "Feedback recorded. Hiring committee will review.";
            form.RequireAuth        = true;
            form.EnableCaptcha      = false;
            form.EnableSaveResume   = false;
            form.AppScope           = StarterAppScope;
            form.CreatedByUserId    = form.CreatedByUserId > 0 ? form.CreatedByUserId : actor.UserId;
            form.ThemeJson          = form.ThemeJson ?? string.Empty;
            form.NotifyEmails       = string.Empty;
            form.WebhookUrl         = string.Empty;
            form.WebhookSecret      = string.Empty;
            form.WebhookHeaders     = string.Empty;
            form.AutoresponderEnabled = false;
            return _forms.SaveForm(form);
        }

        // ===== Views ==============================================================

        private void EnsureJobPostingViews(int formId)
        {
            UpsertView(formId, new FormViewInfo
            {
                FormId          = formId,
                ViewKey         = "recruitment-job-board",
                ViewType        = "listview",
                ViewName        = "Open Jobs",
                IsDefault       = true,
                SortOrder       = 10,
                ConfigJson      = JsonConvert.SerializeObject(new
                {
                    title = "Open Jobs",
                    pageSize = 10,
                    enableSearch = true,
                    enableSort = true,
                    emptyMessage = "No open positions yet. Post a job to get started.",
                    fields = new[] {
                        new { key = "position_title", label = "Position", type = "Text" },
                        new { key = "department",     label = "Department", type = "Select" },
                        new { key = "location",       label = "Location", type = "Text" },
                        new { key = "employment_type", label = "Type", type = "Select" }
                    },
                    rowTemplate = "<tr class=\"mf-preset-row\"><td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0\"><div style=\"font-weight:700;color:#0f172a\">{{field:position_title}}</div><div style=\"margin-top:4px;font-size:12px;color:#64748b\">{{field:department}} / {{field:employment_type}}</div></td><td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#475569\">{{field:location}}</td><td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px\">{{field:salary_range}}</td><td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px\">{{submission:date|format=yyyy-MM-dd}}</td></tr>",
                    wrapperTemplate = BuildBoardWrapper("Open Jobs", "Posted positions accepting applications", "#7c3aed", new[] { "Position", "Location", "Salary", "Posted" })
                }),
                CustomHtml = string.Empty, CustomCss = string.Empty, PermissionsJson = "[]", CreatedOnUtc = DateTime.UtcNow
            });
        }

        private void EnsureApplicationViews(int formId)
        {
            UpsertView(formId, new FormViewInfo
            {
                FormId          = formId,
                ViewKey         = "recruitment-application-pipeline",
                ViewType        = "listview",
                ViewName        = "Application Pipeline",
                IsDefault       = true,
                SortOrder       = 10,
                ConfigJson      = JsonConvert.SerializeObject(new
                {
                    title = "Application Pipeline",
                    pageSize = 12,
                    enableSearch = true,
                    enableSort = true,
                    emptyMessage = "No candidate applications yet.",
                    fields = new[] {
                        new { key = "candidate_name",   label = "Candidate",  type = "Text" },
                        new { key = "position_title",   label = "Position",   type = "Text" },
                        new { key = "years_experience", label = "Years Exp",  type = "Number" },
                        new { key = "current_company",  label = "Company",    type = "Text" }
                    },
                    rowTemplate = "<tr class=\"mf-preset-row\"><td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0\"><div style=\"font-weight:700;color:#0f172a\">{{field:candidate_name}}</div><div style=\"margin-top:4px;font-size:12px;color:#64748b\">{{field:candidate_email}} · job #{{field:job_id}}</div></td><td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155\">{{field:position_title}}</td><td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#475569\">{{field:years_experience}}y at {{field:current_company}}</td><td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0\"><span style=\"display:inline-block;padding:3px 9px;border-radius:999px;background:#ede9fe;color:#5b21b6;font-size:11px;font-weight:700\">{{submission:status}}</span></td></tr>",
                    wrapperTemplate = BuildBoardWrapper("Application Pipeline", "Candidates moving through Hiring Manager review", "#7c3aed", new[] { "Candidate", "Position", "Background", "Stage" })
                }),
                CustomHtml = string.Empty, CustomCss = string.Empty, PermissionsJson = "[]", CreatedOnUtc = DateTime.UtcNow
            });
        }

        private void EnsureInterviewViews(int formId)
        {
            UpsertView(formId, new FormViewInfo
            {
                FormId          = formId,
                ViewKey         = "recruitment-interview-feedback",
                ViewType        = "listview",
                ViewName        = "Interview Feedback",
                IsDefault       = true,
                SortOrder       = 10,
                ConfigJson      = JsonConvert.SerializeObject(new
                {
                    title = "Interview Feedback",
                    pageSize = 12,
                    enableSearch = true,
                    enableSort = true,
                    emptyMessage = "No feedback recorded yet.",
                    fields = new[] {
                        new { key = "candidate_name",  label = "Candidate",   type = "Text" },
                        new { key = "interviewer_name", label = "Interviewer", type = "Text" },
                        new { key = "technical_score", label = "Tech",         type = "Select" },
                        new { key = "culture_score",   label = "Culture",      type = "Select" },
                        new { key = "recommendation",  label = "Verdict",      type = "Select" }
                    },
                    rowTemplate = "<tr class=\"mf-preset-row\"><td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0\"><div style=\"font-weight:700;color:#0f172a\">{{field:candidate_name}}</div><div style=\"margin-top:4px;font-size:12px;color:#64748b\">application #{{field:application_id}} · {{field:interview_date|format=yyyy-MM-dd}}</div></td><td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155\">{{field:interviewer_name}}</td><td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#475569\">Tech {{field:technical_score}}/5 · Culture {{field:culture_score}}/5</td><td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0\"><span style=\"display:inline-block;padding:3px 9px;border-radius:999px;background:#ede9fe;color:#5b21b6;font-size:11px;font-weight:700\">{{field:recommendation}}</span></td></tr>",
                    wrapperTemplate = BuildBoardWrapper("Interview Feedback", "Scorecards across all interview rounds", "#7c3aed", new[] { "Candidate", "Interviewer", "Scores", "Verdict" })
                }),
                CustomHtml = string.Empty, CustomCss = string.Empty, PermissionsJson = "[]", CreatedOnUtc = DateTime.UtcNow
            });
        }

        private static string BuildBoardWrapper(string title, string subtitle, string accent, string[] headers)
        {
            var ths = string.Join(string.Empty, headers.Select(h => "<th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">" + h + "</th>"));
            return string.Join("\n", new[]
            {
                "<div style=\"display:grid;gap:18px\">",
                "  <section style=\"display:grid;gap:14px;padding:20px 22px;border:1px solid #ddd6fe;border-radius:22px;background:linear-gradient(135deg,#faf5ff 0%,#ffffff 60%,#f5f3ff 100%);box-shadow:0 18px 42px rgba(15,23,42,.08)\">",
                "    <div>",
                "      <div style=\"font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:" + accent + ";font-weight:800\">Recruitment Pipeline</div>",
                "      <h2 style=\"margin:6px 0 0;font-size:28px;line-height:1.15;color:#0f172a\">" + title + "</h2>",
                "      <p style=\"margin:10px 0 0;font-size:14px;line-height:1.7;color:#475569;max-width:760px\">" + subtitle + "</p>",
                "    </div>",
                "  </section>",
                "  <section style=\"overflow:hidden;border:1px solid #e5e7eb;border-radius:22px;background:#ffffff;box-shadow:0 16px 40px rgba(15,23,42,.06)\">",
                "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\">",
                "      <thead style=\"background:#faf5ff\"><tr>" + ths + "</tr></thead>",
                "      <tbody>{{rows}}</tbody>",
                "    </table>",
                "  </section>",
                "</div>"
            });
        }

        // ===== Permissions ========================================================

        private void EnsurePermissions(int formId)
        {
            _phase2.SaveFormPermissions(formId, new List<FormPermissionInfo>
            {
                new FormPermissionInfo { FormId = formId, PermissionType = "view",    PrincipalType = "role", RoleName = HrManagerRole,     Scope = "all",  IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "view",    PrincipalType = "role", RoleName = HiringManagerRole, Scope = "team", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "view",    PrincipalType = "role", RoleName = InterviewerRole,   Scope = "team", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "approve", PrincipalType = "role", RoleName = HiringManagerRole, Scope = "team", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "export",  PrincipalType = "role", RoleName = HrManagerRole,     Scope = "all",  IsGranted = true }
            });
        }

        // ===== Workflows ==========================================================

        private void ApplyJobPostingWorkflow(int formId)
        {
            var review = new WorkflowNode
            {
                Id = "hr-review", Type = WorkflowNodeType.Approval, Label = "HR Review", ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = 200, Y = 120 },
                Config = ToConfig(new ApprovalNodeConfig
                {
                    CandidateRoles = new List<string> { HrManagerRole },
                    CandidateUsers = new List<string>(),
                    AllowClaim = true, AllowForward = true, AllowReassign = true, CommentRequiredOnReject = true,
                    DueInHours = 24,
                    PendingSubmissionStatus = "waiting_hr_review",
                    ApprovedSubmissionStatus = "active",
                    RejectedSubmissionStatus = "rejected"
                })
            };
            var endApproved = new WorkflowNode { Id = "end-active", Type = WorkflowNodeType.End, Label = "Live", ZoneType = WorkflowZoneType.Action, Position = new CanvasPosition { X = 500, Y = 60 },
                Config = ToConfig(new EndNodeConfig { EndType = EndType.Success, Message = "Job posting is live and accepting applications." }) };
            var endRejected = new WorkflowNode { Id = "end-rejected", Type = WorkflowNodeType.End, Label = "Rejected", ZoneType = WorkflowZoneType.Action, Position = new CanvasPosition { X = 500, Y = 200 },
                Config = ToConfig(new EndNodeConfig { EndType = EndType.Success, Message = "Job posting rejected." }) };

            _workflowRepo.SaveDraft(formId, new WorkflowDefinition
            {
                FormId = formId, Name = "Job Posting Approval", StartNodeId = review.Id,
                Nodes = new List<WorkflowNode> { review, endApproved, endRejected },
                Edges = new List<WorkflowEdge>
                {
                    new WorkflowEdge { SourceNodeId = review.Id, SourceHandle = "approved", TargetNodeId = endApproved.Id, Label = "Approved" },
                    new WorkflowEdge { SourceNodeId = review.Id, SourceHandle = "rejected", TargetNodeId = endRejected.Id, Label = "Rejected" }
                },
                Settings = new WorkflowSettings { EnableExecutionLog = true, ExecutionTimeoutSeconds = 180 }
            });
            _workflowRepo.ApplyDraft(formId, "recruitment-job-posting-starter");
        }

        private void ApplyApplicationWorkflow(int formId)
        {
            var screen = new WorkflowNode
            {
                Id = "hm-screen", Type = WorkflowNodeType.Approval, Label = "Hiring Manager Screen", ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = 200, Y = 120 },
                Config = ToConfig(new ApprovalNodeConfig
                {
                    CandidateRoles = new List<string> { HiringManagerRole },
                    CandidateUsers = new List<string>(),
                    AllowClaim = true, AllowForward = true, AllowReassign = true, CommentRequiredOnReject = true,
                    DueInHours = 48,
                    PendingSubmissionStatus = "waiting_hm_screen",
                    ApprovedSubmissionStatus = "interview_scheduled",
                    RejectedSubmissionStatus = "rejected_by_hm"
                })
            };
            var endInterview = new WorkflowNode { Id = "end-interview", Type = WorkflowNodeType.End, Label = "Interview", ZoneType = WorkflowZoneType.Action, Position = new CanvasPosition { X = 500, Y = 60 },
                Config = ToConfig(new EndNodeConfig { EndType = EndType.Success, Message = "Candidate scheduled for interview." }) };
            var endRejected = new WorkflowNode { Id = "end-rejected", Type = WorkflowNodeType.End, Label = "Rejected", ZoneType = WorkflowZoneType.Action, Position = new CanvasPosition { X = 500, Y = 200 },
                Config = ToConfig(new EndNodeConfig { EndType = EndType.Success, Message = "Application rejected." }) };

            _workflowRepo.SaveDraft(formId, new WorkflowDefinition
            {
                FormId = formId, Name = "Candidate Application Triage", StartNodeId = screen.Id,
                Nodes = new List<WorkflowNode> { screen, endInterview, endRejected },
                Edges = new List<WorkflowEdge>
                {
                    new WorkflowEdge { SourceNodeId = screen.Id, SourceHandle = "approved", TargetNodeId = endInterview.Id, Label = "Pass" },
                    new WorkflowEdge { SourceNodeId = screen.Id, SourceHandle = "rejected", TargetNodeId = endRejected.Id, Label = "Reject" }
                },
                Settings = new WorkflowSettings { EnableExecutionLog = true, ExecutionTimeoutSeconds = 180 }
            });
            _workflowRepo.ApplyDraft(formId, "recruitment-application-starter");
        }

        private void ApplyInterviewWorkflow(int formId)
        {
            // Interview feedback is fire-and-forget — no approval needed.
            var endNode = new WorkflowNode { Id = "end-recorded", Type = WorkflowNodeType.End, Label = "Recorded", ZoneType = WorkflowZoneType.Action, Position = new CanvasPosition { X = 240, Y = 120 },
                Config = ToConfig(new EndNodeConfig { EndType = EndType.Success, Message = "Feedback recorded." }) };

            _workflowRepo.SaveDraft(formId, new WorkflowDefinition
            {
                FormId = formId, Name = "Interview Feedback", StartNodeId = endNode.Id,
                Nodes = new List<WorkflowNode> { endNode },
                Edges = new List<WorkflowEdge>(),
                Settings = new WorkflowSettings { EnableExecutionLog = false, ExecutionTimeoutSeconds = 60 }
            });
            _workflowRepo.ApplyDraft(formId, "recruitment-interview-starter");
        }

        // ===== Sample data ========================================================

        private List<int> SeedJobPostings(int formId, StarterSeedUser hr)
        {
            var jobs = new[]
            {
                new { Title = "Senior Backend Engineer",   Dept = "Engineering", Loc = "Hanoi / Remote",      Type = "Full-Time", Range = "$80k - $130k", Req = "5+ years C# / .NET, SQL Server, microservices.", ManagerEmail = "eng.manager@megaform.local" },
                new { Title = "Product Marketing Manager", Dept = "Marketing",   Loc = "Ho Chi Minh City",     Type = "Full-Time", Range = "$60k - $90k",  Req = "B2B SaaS marketing, GTM strategy, 4+ years.",     ManagerEmail = "mkt.manager@megaform.local" },
                new { Title = "Frontend React Developer",  Dept = "Engineering", Loc = "Remote",               Type = "Contract",  Range = "$50/hr",       Req = "React 18, TypeScript, Vite. 3+ years.",            ManagerEmail = "eng.manager@megaform.local" },
                new { Title = "Customer Success Lead",     Dept = "Operations",  Loc = "Hanoi",                Type = "Full-Time", Range = "$45k - $70k",  Req = "Customer ops experience, ticket triage, 3+ years.", ManagerEmail = "ops.manager@megaform.local" }
            };

            var ids = new List<int>();
            for (var i = 0; i < jobs.Length; i++)
            {
                var j = jobs[i];
                var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                {
                    ["position_title"]    = j.Title,
                    ["department"]        = j.Dept,
                    ["location"]          = j.Loc,
                    ["employment_type"]   = j.Type,
                    ["salary_range"]      = j.Range,
                    ["requirements"]      = j.Req,
                    ["reports_to_email"]  = j.ManagerEmail
                };
                ids.Add(SubmitSample(formId, hr.UserId, data));
            }
            return ids;
        }

        private List<int> SeedApplications(int formId, StarterSeedUser hiring, List<int> jobIds)
        {
            // Mix of applications across jobs. Each row references jobIds[index % jobIds.Count].
            var apps = new[]
            {
                new { Name = "Ava Nguyen",   Email = "ava@candidates.local",   Phone = "+84 901 234 567", Years = 6,  Co = "BigCo Inc",     Cover = "Hands-on with .NET microservices for 5+ years; led a team of 4.",      Pos = "Senior Backend Engineer" },
                new { Name = "Bao Tran",     Email = "bao@candidates.local",   Phone = "+84 902 345 678", Years = 4,  Co = "Litware",       Cover = "Ex-startup, deep in B2B SaaS go-to-market.",                            Pos = "Product Marketing Manager" },
                new { Name = "Chau Pham",    Email = "chau@candidates.local",  Phone = "+84 903 456 789", Years = 3,  Co = "PixelStudio",   Cover = "React + TS specialist, recently shipped a design-system migration.",    Pos = "Frontend React Developer" },
                new { Name = "Duy Le",       Email = "duy@candidates.local",   Phone = "+84 904 567 890", Years = 5,  Co = "Northwind",     Cover = "Led customer ops org of 12 at a 2,000-customer SaaS.",                   Pos = "Customer Success Lead" },
                new { Name = "Eva Hoang",    Email = "eva@candidates.local",   Phone = "+84 905 678 901", Years = 7,  Co = "Contoso",       Cover = "Architected event-driven backends with EF Core + RabbitMQ.",            Pos = "Senior Backend Engineer" },
                new { Name = "Fang Vo",      Email = "fang@candidates.local",  Phone = "+84 906 789 012", Years = 2,  Co = "Adatum",        Cover = "Jr-mid React dev with passion for accessibility.",                       Pos = "Frontend React Developer" },
                new { Name = "Gia Tran",     Email = "gia@candidates.local",   Phone = "+84 907 890 123", Years = 8,  Co = "Fabrikam",      Cover = "Senior marketer; rebuilt PMM function from scratch at previous role.",   Pos = "Product Marketing Manager" },
                new { Name = "Huy Dao",      Email = "huy@candidates.local",   Phone = "+84 908 901 234", Years = 4,  Co = "Tailspin",      Cover = "CX ops lead; built a knowledge-base + auto-triage pipeline.",            Pos = "Customer Success Lead" }
            };

            var ids = new List<int>();
            for (var i = 0; i < apps.Length; i++)
            {
                var a = apps[i];
                var jobId = jobIds[i % jobIds.Count];
                var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                {
                    ["job_id"]            = jobId,
                    ["position_title"]    = a.Pos,
                    ["candidate_name"]    = a.Name,
                    ["candidate_email"]   = a.Email,
                    ["phone"]             = a.Phone,
                    ["years_experience"]  = a.Years,
                    ["current_company"]   = a.Co,
                    ["cover_letter"]      = a.Cover
                };
                ids.Add(SubmitSample(formId, hiring.UserId, data));
            }
            return ids;
        }

        private void SeedInterviewFeedback(int formId, StarterSeedUser interviewer, List<int> applicationIds)
        {
            // Cover ~half of applications with 1 feedback each, and 1 application with 2 rounds.
            var fb = new[]
            {
                new { AppIdx = 0, Cand = "Ava Nguyen",  Date = "2026-05-15", Tech = "5", Cult = "4", Rec = "strong-hire",      Str = "Deep system design knowledge; led real high-load services in production.", Concern = "Asking salary at top of band." },
                new { AppIdx = 1, Cand = "Bao Tran",    Date = "2026-05-16", Tech = "4", Cult = "5", Rec = "hire",             Str = "Sharp positioning instincts. Built proof-points fast in role-play.",       Concern = "Limited APAC experience." },
                new { AppIdx = 2, Cand = "Chau Pham",   Date = "2026-05-16", Tech = "4", Cult = "4", Rec = "hire",             Str = "Strong React patterns; great accessibility chops.",                       Concern = "Light on testing rigor; would coach." },
                new { AppIdx = 3, Cand = "Duy Le",      Date = "2026-05-17", Tech = "3", Cult = "5", Rec = "hire",             Str = "Excellent customer empathy; healthy ops process mindset.",                Concern = "Limited exposure to enterprise contracts." },
                new { AppIdx = 4, Cand = "Eva Hoang",   Date = "2026-05-17", Tech = "5", Cult = "5", Rec = "strong-hire",      Str = "Top-tier architecture interview; clean trade-off articulation.",          Concern = "" },
                new { AppIdx = 5, Cand = "Fang Vo",     Date = "2026-05-18", Tech = "2", Cult = "4", Rec = "no-hire",          Str = "Eager and curious; good attitude.",                                       Concern = "Mid-level tech bar not yet met for this role." },
                // 2nd round on Eva (AppIdx=4)
                new { AppIdx = 4, Cand = "Eva Hoang",   Date = "2026-05-19", Tech = "5", Cult = "5", Rec = "strong-hire",      Str = "Coding round: clean, idiomatic, fast.",                                  Concern = "" }
            };

            foreach (var f in fb)
            {
                var appId = applicationIds[f.AppIdx];
                var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                {
                    ["application_id"]    = appId,
                    ["candidate_name"]    = f.Cand,
                    ["interviewer_name"]  = interviewer.DisplayName,
                    ["interview_date"]    = f.Date,
                    ["technical_score"]   = f.Tech,
                    ["culture_score"]     = f.Cult,
                    ["recommendation"]    = f.Rec,
                    ["strengths"]         = f.Str,
                    ["concerns"]          = f.Concern
                };
                SubmitSample(formId, interviewer.UserId, data);
            }
        }

        private int SubmitSample(int formId, int userId, Dictionary<string, object> data)
        {
            var result = _submissionProcessor.ProcessAsync(formId, data, BuildSeedIpAddress(userId), "MegaForm RecruitmentStarter", userId, 4.25d)
                .GetAwaiter().GetResult();
            if (!result.Success || result.SubmissionId <= 0)
                throw new InvalidOperationException("Recruitment starter sample failed: " + (result.ErrorMessage ?? "Unknown"));
            if (result.IsSpam)
                throw new InvalidOperationException("Recruitment starter submission " + result.SubmissionId + " was flagged as spam.");
            return result.SubmissionId;
        }

        // ===== User provisioning ==================================================

        private StarterSeedUser EnsureUser(int portalId, string roleName, string userName, string displayName, string email, UserContext actor)
        {
            try
            {
                _identityProvisioning.EnsureRoleAsync(new WorkflowRoleProvisionRequest
                {
                    PortalId = portalId,
                    RoleName = roleName,
                    Description = "Seeded by MegaForm Recruitment starter.",
                    Actor = actor
                }, CancellationToken.None).GetAwaiter().GetResult();
            }
            catch (Exception ex) { throw BuildProvisioningException("ensure role '" + roleName + "'", ex); }

            WorkflowProvisionedUser provisioned;
            try
            {
                provisioned = _identityProvisioning.EnsureUserAsync(new WorkflowUserProvisionRequest
                {
                    PortalId = portalId,
                    UserName = userName,
                    DisplayName = displayName,
                    Email = email,
                    Password = StarterPassword,
                    ApproveUser = true,
                    UpdateIfExists = true,
                    GeneratePasswordIfEmpty = true,
                    Actor = actor
                }, CancellationToken.None).GetAwaiter().GetResult();
            }
            catch (Exception ex) { throw BuildProvisioningException("ensure user '" + userName + "'", ex); }

            try
            {
                _identityProvisioning.AddUserToRoleAsync(new WorkflowUserRoleProvisionRequest
                {
                    PortalId = portalId, UserIdentifier = email, LookupMode = WorkflowUserLookupMode.Email,
                    RoleName = RegisteredUsersRole, AutoCreateRole = false, Actor = actor
                }, CancellationToken.None).GetAwaiter().GetResult();
                _identityProvisioning.AddUserToRoleAsync(new WorkflowUserRoleProvisionRequest
                {
                    PortalId = portalId, UserIdentifier = email, LookupMode = WorkflowUserLookupMode.Email,
                    RoleName = roleName, AutoCreateRole = true, Actor = actor
                }, CancellationToken.None).GetAwaiter().GetResult();
            }
            catch (Exception ex) { throw BuildProvisioningException("add '" + userName + "' to role '" + roleName + "'", ex); }

            provisioned = NormalizeProvisionedUser(provisioned, userName, displayName, email);
            if (provisioned == null || !provisioned.UserId.HasValue || provisioned.UserId.Value <= 0)
            {
                var resolvedId = _platform.ResolveUserIdByNameOrEmail(userName, email);
                if (provisioned == null) provisioned = new WorkflowProvisionedUser();
                provisioned.UserId = resolvedId;
                provisioned.UserName = userName;
                provisioned.DisplayName = displayName;
                provisioned.Email = email;
            }

            return new StarterSeedUser
            {
                UserId = provisioned.UserId.GetValueOrDefault(0),
                UserName = provisioned.UserName ?? userName,
                DisplayName = provisioned.DisplayName ?? displayName,
                Email = provisioned.Email ?? email,
                RoleName = roleName,
                Password = StarterPassword
            };
        }

        private static WorkflowProvisionedUser NormalizeProvisionedUser(WorkflowProvisionedUser u, string userName, string displayName, string email)
        {
            if (u == null) u = new WorkflowProvisionedUser();
            if (string.IsNullOrWhiteSpace(u.UserName)) u.UserName = userName;
            if (string.IsNullOrWhiteSpace(u.DisplayName)) u.DisplayName = displayName;
            if (string.IsNullOrWhiteSpace(u.Email)) u.Email = email;
            return u;
        }

        private Exception BuildProvisioningException(string step, Exception ex)
        {
            var message = "Recruitment starter failed to " + step + ". " + FlattenExceptionMessage(ex);
            _log?.LogError(nameof(RecruitmentStarterService), message, ex);
            return new InvalidOperationException(message, ex);
        }

        private static string FlattenExceptionMessage(Exception ex)
        {
            if (ex == null) return "Unknown error.";
            var parts = new List<string>();
            var c = ex;
            while (c != null) { if (!string.IsNullOrWhiteSpace(c.Message)) parts.Add(c.Message.Trim()); c = c.InnerException; }
            return string.Join(" | ", parts.Distinct(StringComparer.Ordinal));
        }

        // ===== Helpers ============================================================

        private void UpsertView(int formId, FormViewInfo candidate)
        {
            var existing = (_phase2.GetFormViews(formId) ?? new List<FormViewInfo>())
                .FirstOrDefault(v => string.Equals(v.ViewKey, candidate.ViewKey, StringComparison.OrdinalIgnoreCase));
            if (existing != null) { candidate.ViewId = existing.ViewId; candidate.CreatedOnUtc = existing.CreatedOnUtc; }
            _phase2.SaveFormView(candidate);
        }

        private static StarterCredentialInfo ToCredential(StarterSeedUser u, string role)
        {
            return new StarterCredentialInfo { RoleName = role, UserName = u.UserName, DisplayName = u.DisplayName, Email = u.Email, Password = u.Password };
        }

        private static string BuildUrl(string homeUrl, string suffix)
        {
            var b = (homeUrl ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(b)) return suffix ?? string.Empty;
            if (b.Contains("?")) return b + "&" + (suffix ?? string.Empty).TrimStart('?', '&');
            return b.TrimEnd('/') + (suffix ?? string.Empty);
        }

        private static string BuildSeedIpAddress(int seed)
        {
            return "203.0.113." + Math.Max(10, seed % 240);
        }

        private static Dictionary<string, object> ToConfig<T>(T config)
        {
            return JsonConvert.DeserializeObject<Dictionary<string, object>>(JsonConvert.SerializeObject(config))
                   ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        }

        private sealed class StarterSeedUser
        {
            public int UserId { get; set; }
            public string UserName { get; set; }
            public string DisplayName { get; set; }
            public string Email { get; set; }
            public string RoleName { get; set; }
            public string Password { get; set; }
        }
    }
}
