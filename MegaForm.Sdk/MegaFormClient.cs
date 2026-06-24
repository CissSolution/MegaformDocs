using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Core.Services;
using MegaForm.Core.Utilities;
using Newtonsoft.Json;
using CoreSubmitResult = MegaForm.Core.Services.SubmissionResult;

namespace MegaForm.Sdk
{
    /// <summary>
    /// Default <see cref="IMegaFormClient"/> — a thin facade that maps SDK DTOs to/from
    /// MegaForm.Core repositories. It does NOT contain business logic; it reuses Core.
    /// Tenant/user context comes from the ambient <see cref="IPlatformContext"/> (when the
    /// host provides one) and can be overridden per call via <see cref="MegaFormScope"/>.
    /// </summary>
    public sealed class MegaFormClient : IMegaFormClient, IFormApi, ISubmissionApi, IFileApi, ISchemaApi
    {
        private readonly IFormRepository _forms;
        private readonly ISubmissionRepository _submissions;
        private readonly IPlatformContext? _platform;
        private readonly IFileRepository? _files;
        private readonly IStorageService? _storage;
        private readonly SubmissionProcessor? _processor;

        /// <summary>
        /// Create a client. <paramref name="platform"/>/<paramref name="files"/>/<paramref name="storage"/>
        /// are optional — when platform is null, every call must pass an explicit <see cref="MegaFormScope"/>;
        /// file APIs need files+storage. <paramref name="submissionProcessor"/> is optional: when supplied
        /// (the host registered it in DI), <c>SubmitAsync</c> runs the FULL submission pipeline (validate +
        /// anti-spam + notify + workflow + index), identical to a public form submit; when null, it falls
        /// back to validate-then-insert.
        /// </summary>
        public MegaFormClient(IFormRepository forms, ISubmissionRepository submissions, IPlatformContext? platform = null, IFileRepository? files = null, IStorageService? storage = null, SubmissionProcessor? submissionProcessor = null)
        {
            _forms = forms ?? throw new ArgumentNullException(nameof(forms));
            _submissions = submissions ?? throw new ArgumentNullException(nameof(submissions));
            _platform = platform;
            _files = files;
            _storage = storage;
            _processor = submissionProcessor;
        }

        /// <inheritdoc/>
        public IFormApi Forms => this;

        /// <inheritdoc/>
        public ISubmissionApi Submissions => this;

        /// <inheritdoc/>
        public IFileApi Files => this;

        /// <inheritdoc/>
        public ISchemaApi Schema => this;

        private int ResolvePortalId(MegaFormScope? scope)
        {
            if (scope != null) return scope.PortalId;
            if (_platform != null) return _platform.PortalId;
            throw new InvalidOperationException(
                "No portal context available. Pass a MegaFormScope, or register the SDK in a host that provides IPlatformContext.");
        }

        // ── IFormApi ──────────────────────────────────────────────────────────

        /// <inheritdoc/>
        public Task<FormDto> CreateFormAsync(CreateFormRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            var portalId = ResolvePortalId(scope);
            var form = new FormInfo
            {
                PortalId = portalId,
                Title = request.Title ?? string.Empty,
                Description = request.Description,
                SchemaJson = string.IsNullOrWhiteSpace(request.SchemaJson) ? "{\"fields\":[]}" : request.SchemaJson,
                Status = string.IsNullOrWhiteSpace(request.Status) ? "draft" : request.Status,
                RequireAuth = request.RequireAuth
            };
            var newId = _forms.SaveForm(form);
            var saved = _forms.GetForm(newId);
            return Task.FromResult(ToDto(saved, 0));
        }

        /// <inheritdoc/>
        public Task<FormDto?> GetFormAsync(int formId, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            var portalId = ResolvePortalId(scope);
            var form = _forms.GetForm(formId);
            if (form == null || (form.PortalId != 0 && portalId != 0 && form.PortalId != portalId))
                return Task.FromResult<FormDto?>(null);
            var stats = _forms.GetFormStats(formId);
            return Task.FromResult<FormDto?>(ToDto(form, stats?.TotalSubmissions ?? 0));
        }

        /// <inheritdoc/>
        public Task<PagedResult<FormDto>> ListFormsAsync(FormQuery? query = null, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            var portalId = ResolvePortalId(scope);
            query ??= new FormQuery();
            var pageIndex = Math.Max(0, query.Page - 1);
            var pageSize = query.PageSize <= 0 ? 20 : query.PageSize;
            var forms = _forms.ListForms(portalId, query.Status, query.Search, pageIndex, pageSize) ?? new List<FormInfo>();
            var items = forms.Select(f => ToDto(f, 0)).ToList();
            var result = new PagedResult<FormDto>
            {
                Items = items,
                TotalCount = items.Count,
                Page = pageIndex + 1,
                PageSize = pageSize
            };
            return Task.FromResult(result);
        }

        /// <inheritdoc/>
        public Task DeleteFormAsync(int formId, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            // Resolve portal to enforce that the form belongs to this tenant before deleting.
            var portalId = ResolvePortalId(scope);
            var form = _forms.GetForm(formId);
            if (form != null && (form.PortalId == 0 || portalId == 0 || form.PortalId == portalId))
                _forms.DeleteForm(formId);
            return Task.CompletedTask;
        }

        /// <inheritdoc/>
        public Task<FormDto> UpdateFormAsync(int formId, UpdateFormRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            var portalId = ResolvePortalId(scope);
            var form = _forms.GetForm(formId);
            if (form == null || (form.PortalId != 0 && portalId != 0 && form.PortalId != portalId))
                throw new InvalidOperationException("Form not found in this portal.");

            // Load-then-mutate: only non-null members change, and keeping the loaded FormId makes
            // SaveForm an UPDATE (a fresh FormInfo with FormId=0 would INSERT a duplicate).
            if (request.Title != null) form.Title = request.Title;
            if (request.Description != null) form.Description = request.Description;
            if (request.SchemaJson != null) form.SchemaJson = request.SchemaJson;
            if (request.Status != null) form.Status = request.Status;
            if (request.RequireAuth.HasValue) form.RequireAuth = request.RequireAuth.Value;

            _forms.SaveForm(form);
            var saved = _forms.GetForm(formId);
            var stats = _forms.GetFormStats(formId);
            return Task.FromResult(ToDto(saved, stats?.TotalSubmissions ?? 0));
        }

        // ── ISubmissionApi ────────────────────────────────────────────────────

        /// <inheritdoc/>
        public Task<PagedResult<SubmissionDto>> FindAsync(SubmissionQuery query, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (query == null) throw new ArgumentNullException(nameof(query));
            ResolvePortalId(scope); // ensure a context exists (throws if neither scope nor platform)
            var pageIndex = Math.Max(0, query.Page - 1);
            var pageSize = query.PageSize <= 0 ? 50 : query.PageSize;
            var (rows, total) = _submissions.List(query.FormId, query.Status, null, null, null, pageIndex, pageSize);
            var items = (rows ?? new List<SubmissionInfo>()).Select(ToDto).ToList();
            var result = new PagedResult<SubmissionDto>
            {
                Items = items,
                TotalCount = total,
                Page = pageIndex + 1,
                PageSize = pageSize
            };
            return Task.FromResult(result);
        }

        /// <inheritdoc/>
        public Task<SubmissionDto?> GetAsync(int submissionId, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            var sub = _submissions.Get(submissionId);
            return Task.FromResult(sub == null ? null : ToDto(sub));
        }

        /// <inheritdoc/>
        public async Task<SubmitResult> SubmitAsync(int formId, Dictionary<string, object> data, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            var portalId = ResolvePortalId(scope);
            var userId = scope?.UserId ?? (_platform?.UserId ?? 0);

            // Tenant guard: the form must exist and belong to this portal.
            var form = _forms.GetForm(formId);
            if (form == null || (form.PortalId != 0 && portalId != 0 && form.PortalId != portalId))
                return new SubmitResult { Success = false, ErrorMessage = "Form not found in this portal." };

            // Full pipeline when the host registered the processor (Oqtane/DNN/Web via DI):
            // identical behaviour to a public JS form submit — validate + anti-spam + notify +
            // workflow + index, and the Published-status gate.
            if (_processor != null)
            {
                var coreResult = await _processor.ProcessAsync(
                    formId, data, "sdk", "MegaForm.Sdk", userId > 0 ? (int?)userId : null, 0);
                return ToSubmitResult(coreResult);
            }

            // Fallback (in-memory tests / lightweight hosts with no processor): resolve the schema and
            // run the SAME FormValidationService the pipeline uses (incl. flattened Row/composite fields),
            // then insert. This intentionally SKIPS anti-spam / notifications / workflow and the
            // Published-status gate — production always has the processor, so parity holds there.
            FormSchema schema;
            try
            {
                var resolved = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
                schema = resolved.Schema ?? new FormSchema();
            }
            catch
            {
                return new SubmitResult { Success = false, ErrorMessage = "Form configuration is invalid." };
            }

            var validation = FormValidationService.Validate(schema, data);
            if (!validation.IsValid)
                return new SubmitResult { Success = false, ValidationErrors = validation.Errors };

            var submission = new SubmissionInfo
            {
                FormId = formId,
                DataJson = JsonConvert.SerializeObject(data),
                Status = "new",
                UserId = userId > 0 ? (int?)userId : null,
                SubmittedOnUtc = DateTime.UtcNow
            };
            var newId = _submissions.Insert(submission);
            return new SubmitResult { Success = true, SubmissionId = newId };
        }

        /// <inheritdoc/>
        public Task UpdateAsync(int submissionId, Dictionary<string, object> data, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            if (IsSubmissionInPortal(submissionId, scope))
                _submissions.UpdateData(submissionId, JsonConvert.SerializeObject(data));
            return Task.CompletedTask;
        }

        /// <inheritdoc/>
        public Task DeleteAsync(int submissionId, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (IsSubmissionInPortal(submissionId, scope))
                _submissions.Delete(submissionId);
            return Task.CompletedTask;
        }

        /// <summary>
        /// True when the submission exists and its owning form belongs to the resolved portal.
        /// Mirrors the GetFormAsync/DeleteFormAsync tenant guard; an unresolvable owner refuses the write.
        /// </summary>
        private bool IsSubmissionInPortal(int submissionId, MegaFormScope? scope)
        {
            var portalId = ResolvePortalId(scope);
            var sub = _submissions.Get(submissionId);
            if (sub == null) return false;
            var form = _forms.GetForm(sub.FormId);
            if (form == null) return false;
            return form.PortalId == 0 || portalId == 0 || form.PortalId == portalId;
        }

        private static SubmitResult ToSubmitResult(CoreSubmitResult r) => new SubmitResult
        {
            Success = r.Success,
            SubmissionId = r.SubmissionId,
            ErrorMessage = r.ErrorMessage,
            SuccessMessage = r.SuccessMessage,
            RedirectUrl = r.RedirectUrl,
            IsSpam = r.IsSpam,
            SpamScore = r.SpamScore,
            ValidationErrors = r.ValidationErrors
        };

        // ── IFileApi ──────────────────────────────────────────────────────────

        /// <inheritdoc/>
        public Task<IReadOnlyList<FileDto>> ListForSubmissionAsync(int submissionId, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (_files == null) return Task.FromResult((IReadOnlyList<FileDto>)Array.Empty<FileDto>());
            var rows = _files.GetBySubmission(submissionId) ?? new List<FileInfo>();
            IReadOnlyList<FileDto> list = rows.Select(ToDto).ToList();
            return Task.FromResult(list);
        }

        /// <inheritdoc/>
        public Task<MegaFormFileContent?> OpenAsync(int submissionId, int fileId, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (_files == null || _storage == null) return Task.FromResult<MegaFormFileContent?>(null);
            var file = (_files.GetBySubmission(submissionId) ?? new List<FileInfo>())
                .FirstOrDefault(f => f.FileId == fileId);
            if (file == null || string.IsNullOrEmpty(file.StoredPath))
                return Task.FromResult<MegaFormFileContent?>(null);

            byte[] bytes;
            using (var src = _storage.GetFile(file.StoredPath))
            {
                if (src == null) return Task.FromResult<MegaFormFileContent?>(null);
                using var ms = new System.IO.MemoryStream();
                src.CopyTo(ms);
                bytes = ms.ToArray();
            }
            return Task.FromResult<MegaFormFileContent?>(new MegaFormFileContent
            {
                FileName = string.IsNullOrWhiteSpace(file.OriginalName) ? ("file-" + fileId) : file.OriginalName!,
                ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType!,
                Content = bytes
            });
        }

        // ── ISchemaApi ────────────────────────────────────────────────────────

        /// <inheritdoc/>
        public FormSchemaInfo Parse(string schemaJson)
        {
            // RenderModelResolver is the canonical, fail-soft parse (legacy-alias normalized);
            // it returns an empty FormSchema on malformed JSON rather than throwing.
            var schema = RenderModelResolver.Resolve(schemaJson ?? string.Empty, null).Schema ?? new FormSchema();
            var flat = MegaFormUtils.FlattenFields(schema.Fields) ?? new List<FormField>();
            return new FormSchemaInfo { Fields = flat.Select(ToFieldInfo).ToList() };
        }

        /// <inheritdoc/>
        public FormSchemaInfo ParseForm(FormDto form)
        {
            if (form == null) throw new ArgumentNullException(nameof(form));
            return Parse(form.SchemaJson ?? string.Empty);
        }

        private static FormFieldInfo ToFieldInfo(FormField f) => new FormFieldInfo
        {
            Key = f.Key,
            Type = f.Type,
            Label = f.Label,
            Placeholder = f.Placeholder,
            HelpText = f.HelpText,
            Required = f.Required,
            ReadOnly = f.ReadOnly,
            Hidden = f.Hidden,
            Width = f.Width,
            Order = f.Order,
            IsInputField = IsInputType(f.Type),
            Options = (f.Options ?? new List<MegaForm.Core.Models.FieldOption>())
                .Select(o => new FieldOptionInfo { Label = o.Label, Value = o.Value, Selected = o.Selected })
                .ToList(),
            Validation = f.Validation == null ? null : new FieldValidationInfo
            {
                MinLength = f.Validation.MinLength,
                MaxLength = f.Validation.MaxLength,
                Min = f.Validation.Min,
                Max = f.Validation.Max,
                Pattern = f.Validation.Pattern,
                PatternMessage = f.Validation.PatternMessage,
                CustomMessage = f.Validation.CustomMessage,
            },
        };

        // Layout/display types carry no submittable value — mirrors FormValidationService's skip-set.
        private static bool IsInputType(string? type)
        {
            switch ((type ?? string.Empty).ToLowerInvariant())
            {
                case "html":
                case "section":
                case "row":
                case "uniqueid":
                    return false;
                default:
                    return true;
            }
        }

        // ── mapping ───────────────────────────────────────────────────────────

        private static FileDto ToDto(FileInfo f) => new FileDto
        {
            FileId = f.FileId,
            SubmissionId = f.SubmissionId,
            FieldKey = f.FieldKey,
            FileName = f.OriginalName,
            ContentType = f.ContentType,
            SizeBytes = f.FileSizeBytes,
            UploadedOnUtc = f.UploadedOnUtc
        };

        private static FormDto ToDto(FormInfo f, int submissionCount) => new FormDto
        {
            FormId = f.FormId,
            PortalId = f.PortalId,
            Title = f.Title,
            Description = f.Description,
            Status = f.Status,
            SchemaJson = f.SchemaJson,
            RequireAuth = f.RequireAuth,
            SubmissionCount = submissionCount
        };

        private static SubmissionDto ToDto(SubmissionInfo s) => new SubmissionDto
        {
            SubmissionId = s.SubmissionId,
            FormId = s.FormId,
            DataJson = s.DataJson,
            Status = s.Status,
            IsSpam = s.IsSpam,
            UserId = s.UserId,
            SubmittedOnUtc = s.SubmittedOnUtc
        };
    }
}
