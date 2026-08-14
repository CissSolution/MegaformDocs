using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Core.Services;
using MegaForm.Core.Services.TypedSubmission;
using MegaForm.Core.Utilities;
using MegaForm.Core.Workflow;
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
    public sealed class MegaFormClient : IMegaFormClient, IFormApi, ISubmissionApi, IDashboardApi, ISubmissionDashboardApi, IInboxApi, IWorkflowApi, IFileApi, IGalleryApi, ISchemaApi, IAppApi, IQueryApi, IRecordApi
    {
        private readonly IFormRepository _forms;
        private readonly ISubmissionRepository _submissions;
        private readonly IPlatformContext? _platform;
        private readonly IFileRepository? _files;
        private readonly IStorageService? _storage;
        private readonly SubmissionProcessor? _processor;
        private readonly WorkflowTaskService? _workflowTasks;
        private readonly IWorkflowRepository? _workflowRepository;
        private readonly IPhase2Repository? _phase2;
        private readonly ISubmissionDataStore? _typedStore;

        /// <summary>
        /// Create a client. <paramref name="platform"/>/<paramref name="files"/>/<paramref name="storage"/>
        /// are optional — when platform is null, every call must pass an explicit <see cref="MegaFormScope"/>;
        /// file APIs need files+storage. <paramref name="submissionProcessor"/> is optional: when supplied
        /// (the host registered it in DI), <c>SubmitAsync</c> runs the FULL submission pipeline (validate +
        /// anti-spam + notify + workflow + index), identical to a public form submit; when null, it falls
        /// back to validate-then-insert.
        /// </summary>
        public MegaFormClient(IFormRepository forms, ISubmissionRepository submissions, IPlatformContext? platform = null, IFileRepository? files = null, IStorageService? storage = null, SubmissionProcessor? submissionProcessor = null)
            : this(forms, submissions, platform, files, storage, submissionProcessor, null, null, null, null)
        {
        }

        /// <summary>
        /// Create a client with optional dashboard/inbox workflow services. This overload is used by
        /// hosts that have registered workflow services and want the SDK Inbox surface enabled.
        /// </summary>
        public MegaFormClient(IFormRepository forms, ISubmissionRepository submissions, IPlatformContext? platform, IFileRepository? files, IStorageService? storage, SubmissionProcessor? submissionProcessor, WorkflowTaskService? workflowTasks, IWorkflowRepository? workflowRepository)
            : this(forms, submissions, platform, files, storage, submissionProcessor, workflowTasks, workflowRepository, null, null)
        {
        }

        /// <summary>
        /// Full application constructor. Supplying phase2 + typedStore enables Apps, Queries,
        /// and Records while preserving every legacy constructor for binary compatibility.
        /// </summary>
        private MegaFormClient(IFormRepository forms, ISubmissionRepository submissions, IPlatformContext? platform, IFileRepository? files, IStorageService? storage, SubmissionProcessor? submissionProcessor, WorkflowTaskService? workflowTasks, IWorkflowRepository? workflowRepository, IPhase2Repository? phase2, ISubmissionDataStore? typedStore)
        {
            _forms = forms ?? throw new ArgumentNullException(nameof(forms));
            _submissions = submissions ?? throw new ArgumentNullException(nameof(submissions));
            _platform = platform;
            _files = files;
            _storage = storage;
            _processor = submissionProcessor;
            _workflowTasks = workflowTasks;
            _workflowRepository = workflowRepository;
            _phase2 = phase2;
            _typedStore = typedStore;
        }

        /// <summary>Create a fully wired client with typed app/query/record APIs enabled.</summary>
        public static MegaFormClient CreateApplicationClient(
            IFormRepository forms,
            ISubmissionRepository submissions,
            IPlatformContext? platform,
            IFileRepository? files,
            IStorageService? storage,
            SubmissionProcessor? submissionProcessor,
            WorkflowTaskService? workflowTasks,
            IWorkflowRepository? workflowRepository,
            IPhase2Repository phase2,
            ISubmissionDataStore typedStore) =>
            new MegaFormClient(
                forms, submissions, platform, files, storage, submissionProcessor,
                workflowTasks, workflowRepository, phase2, typedStore);

        /// <inheritdoc/>
        public IFormApi Forms => this;

        /// <inheritdoc/>
        public ISubmissionApi Submissions => this;

        /// <inheritdoc/>
        public IDashboardApi Dashboard => this;

        /// <inheritdoc/>
        public ISubmissionDashboardApi SubmissionDashboard => this;

        /// <inheritdoc/>
        public IInboxApi Inbox => this;

        /// <inheritdoc/>
        public IFileApi Files => this;

        /// <inheritdoc/>
        public IGalleryApi Gallery => this;

        /// <inheritdoc/>
        public ISchemaApi Schema => this;

        /// <inheritdoc/>
        public IAppApi Apps => this;

        /// <inheritdoc/>
        public IQueryApi Queries => this;

        /// <inheritdoc/>
        public IRecordApi Records => this;

        /// <inheritdoc/>
        public IWorkflowApi Workflows => this;

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

        private bool IsFormInPortal(int formId, int portalId)
        {
            var form = _forms.GetForm(formId);
            return form != null && (form.PortalId == 0 || portalId == 0 || form.PortalId == portalId);
        }

        // ── App / Query / Record APIs ─────────────────────────────────────────

        /// <inheritdoc/>
        public Task<AppDto?> GetAppAsync(string appKey, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (string.IsNullOrWhiteSpace(appKey)) throw new ArgumentException("App key is required.", nameof(appKey));
            var portalId = ResolvePortalId(scope);
            var bundle = new AppDefinitionService(RequirePhase2(), _forms).Get(portalId, appKey, true);
            if (bundle?.App == null) return Task.FromResult<AppDto?>(null);

            return Task.FromResult<AppDto?>(new AppDto
            {
                AppId = bundle.App.AppId,
                AppKey = bundle.App.AppKey,
                AppName = bundle.App.AppName,
                Description = bundle.App.Description,
                AppScope = bundle.App.AppScope,
                Icon = bundle.App.Icon,
                AccentColor = bundle.App.AccentColor,
                IsEnabled = bundle.App.IsEnabled,
                Forms = (bundle.Manifest?.Forms ?? new List<AppManifestFormRef>())
                    .Select(x => new AppFormRefDto
                    {
                        FormId = x.FormId,
                        Alias = x.Alias,
                        Role = x.Role,
                        Title = x.Title,
                        IsPrimary = x.IsPrimary
                    }).ToList(),
                Queries = (bundle.Manifest?.Queries ?? new List<AppManifestQueryRef>())
                    .Select(x => new AppQueryRefDto
                    {
                        QueryId = x.QueryId,
                        FormId = x.FormId,
                        QueryKey = x.QueryKey,
                        QueryType = x.QueryType,
                        Alias = x.Alias
                    }).ToList()
            });
        }

        /// <inheritdoc/>
        public Task<AppQueryResultDto> ExecuteAsync(string appKey, string queryKey, AppQueryRequest? request = null, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (string.IsNullOrWhiteSpace(appKey)) throw new ArgumentException("App key is required.", nameof(appKey));
            if (string.IsNullOrWhiteSpace(queryKey)) throw new ArgumentException("Query key is required.", nameof(queryKey));
            request ??= new AppQueryRequest();
            var result = RequireAppRecords().Execute(new AppRecordQueryRequest
            {
                PortalId = ResolvePortalId(scope),
                AppKey = appKey,
                QueryKey = queryKey,
                Page = request.Page,
                PageSize = request.PageSize,
                Search = request.Search,
                Parameters = request.Parameters ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            });

            return Task.FromResult(new AppQueryResultDto
            {
                AppKey = result.App?.AppKey,
                QueryKey = result.Query?.QueryKey,
                FormId = result.Form?.FormId ?? 0,
                Items = result.Items.Select(ToAppRecordDto).ToList(),
                TotalCount = result.TotalCount,
                Page = result.Page,
                PageSize = result.PageSize,
                IsBounded = result.IsBounded
            });
        }

        /// <inheritdoc/>
        public async Task<GalleryResultDto> QueryGalleryAsync(GalleryQueryRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            if (string.IsNullOrWhiteSpace(request.AppKey)) throw new ArgumentException("App key is required.", nameof(request));
            if (string.IsNullOrWhiteSpace(request.QueryKey)) throw new ArgumentException("Query key is required.", nameof(request));

            var source = await ExecuteAsync(
                request.AppKey,
                request.QueryKey,
                request.Query ?? new AppQueryRequest(),
                scope,
                cancellationToken).ConfigureAwait(false);

            var fieldKeys = request.ImageFieldKeys == null || request.ImageFieldKeys.Count == 0
                ? new List<string>
                {
                    "featured_image_url", "image_url", "author_avatar_url",
                    "avatar_url", "photo_url", "thumbnail_url"
                }
                : request.ImageFieldKeys
                    .Where(key => !string.IsNullOrWhiteSpace(key))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
            var items = new List<GalleryItemDto>();
            var urls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var record in source.Items ?? Array.Empty<AppRecordDto>())
            {
                cancellationToken.ThrowIfCancellationRequested();
                var title = GalleryText(record, request.TitleFieldKey, "Record #" + record.SubmissionId);
                var altText = GalleryText(record, request.AltTextFieldKey, title);
                var caption = GalleryText(record, request.CaptionFieldKey, string.Empty);

                foreach (var fieldKey in fieldKeys)
                {
                    if (record.Data == null || !record.Data.TryGetValue(fieldKey, out var raw)) continue;
                    var url = NormalizeGalleryUrl(Convert.ToString(raw, CultureInfo.InvariantCulture));
                    if (string.IsNullOrWhiteSpace(url)) continue;
                    if (request.DeduplicateByUrl && !urls.Add(url)) continue;

                    items.Add(new GalleryItemDto
                    {
                        ItemId = "record:" + record.SubmissionId + ":" + fieldKey,
                        SubmissionId = record.SubmissionId,
                        FormId = record.FormId,
                        Source = "typed-field",
                        FieldKey = fieldKey,
                        Url = url,
                        Title = title,
                        AltText = altText,
                        Caption = caption
                    });
                }

                if (!request.IncludeUploadedImages || _files == null || _storage == null) continue;
                foreach (var file in _files.GetBySubmission(record.SubmissionId) ?? new List<FileInfo>())
                {
                    if (!IsImageFile(file)) continue;
                    string url;
                    try { url = NormalizeGalleryUrl(_storage.GetFileUrl(file.StoredPath)); }
                    catch { continue; }
                    if (string.IsNullOrWhiteSpace(url)) continue;
                    if (request.DeduplicateByUrl && !urls.Add(url)) continue;

                    items.Add(new GalleryItemDto
                    {
                        ItemId = "file:" + file.FileId,
                        SubmissionId = record.SubmissionId,
                        FormId = record.FormId,
                        Source = "uploaded-file",
                        FieldKey = file.FieldKey,
                        FileId = file.FileId,
                        FileName = file.OriginalName,
                        ContentType = file.ContentType,
                        Url = url,
                        Title = string.IsNullOrWhiteSpace(title) ? file.OriginalName : title,
                        AltText = string.IsNullOrWhiteSpace(altText) ? file.OriginalName : altText,
                        Caption = caption
                    });
                }
            }

            return new GalleryResultDto
            {
                AppKey = source.AppKey,
                QueryKey = source.QueryKey,
                FormId = source.FormId,
                Items = items,
                SourceRecordCount = source.TotalCount,
                Page = source.Page,
                PageSize = source.PageSize,
                IsBounded = source.IsBounded
            };
        }

        /// <inheritdoc/>
        public Task<AppRecordDto?> GetRecordAsync(int submissionId, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var record = RequireAppRecords().GetRecord(ResolvePortalId(scope), submissionId);
            return Task.FromResult(record == null ? null : ToAppRecordDto(record));
        }

        /// <inheritdoc/>
        public Task<AppRecordDto?> PatchRecordAsync(int submissionId, Dictionary<string, object> values, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (values == null) throw new ArgumentNullException(nameof(values));
            if (_typedStore == null)
                throw new InvalidOperationException("Typed submission storage is required for record updates.");
            if (!IsSubmissionInPortal(submissionId, scope))
                return Task.FromResult<AppRecordDto?>(null);

            var submission = _submissions.Get(submissionId);
            var form = _forms.GetForm(submission.FormId);
            var data = new SubmissionDataResolver(_typedStore)
                .GetTypedFirstData(submissionId, submission.DataJson);
            foreach (var pair in values)
                data[pair.Key] = pair.Value;

            FormSchema schema;
            try
            {
                schema = RenderModelResolver.Resolve(
                    form.SchemaJson, form.SettingsJson, form.SubmitButtonText,
                    form.SuccessMessage, form.RedirectUrl).Schema ?? new FormSchema();
            }
            catch
            {
                throw new InvalidOperationException("Form schema is invalid; the record was not changed.");
            }

            var fields = new SubmissionFieldNormalizer().Normalize(form.FormId, schema, data);
            _typedStore.ReplaceFields(submissionId, form.FormId, fields);

            // Submission.Status is the canonical workflow/query status. If callers
            // patch the logical status field, keep the master column in the same
            // operation so named-query filtering cannot diverge from typed data.
            if (values.TryGetValue("status", out var patchedStatus))
            {
                var status = Convert.ToString(patchedStatus);
                if (!string.IsNullOrWhiteSpace(status))
                    _submissions.UpdateStatus(submissionId, status);
            }

            // Compatibility mirror only. New APIs read the typed rows above; legacy DNN
            // renderers continue to work until their read path is migrated.
            _submissions.UpdateData(submissionId, JsonConvert.SerializeObject(data));
            var updated = RequireAppRecords().GetRecord(ResolvePortalId(scope), submissionId);
            return Task.FromResult(updated == null ? null : ToAppRecordDto(updated));
        }

        private IPhase2Repository RequirePhase2() =>
            _phase2 ?? throw new InvalidOperationException(
                "App APIs are unavailable because the host did not register IPhase2Repository.");

        private AppRecordQueryService RequireAppRecords() =>
            new AppRecordQueryService(RequirePhase2(), _forms, _submissions, _typedStore);

        private static string GalleryText(AppRecordDto record, string? fieldKey, string fallback)
        {
            if (record?.Data == null || string.IsNullOrWhiteSpace(fieldKey))
                return fallback;
            var safeFieldKey = fieldKey!;
            if (!record.Data.TryGetValue(safeFieldKey, out var value) || value == null)
                return fallback;
            var text = Convert.ToString(value, CultureInfo.InvariantCulture);
            return string.IsNullOrWhiteSpace(text) ? fallback : text!;
        }

        private static string NormalizeGalleryUrl(string? value)
        {
            var url = (value ?? string.Empty).Trim();
            if (url.Length == 0) return string.Empty;
            if (url.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) return url;
            if (url.StartsWith("~/", StringComparison.Ordinal)) return "/" + url.Substring(2);
            if (url.StartsWith("/", StringComparison.Ordinal)) return url;
            if (Uri.TryCreate(url, UriKind.Absolute, out var absolute) &&
                (absolute.Scheme == Uri.UriSchemeHttp || absolute.Scheme == Uri.UriSchemeHttps))
                return url;
            return string.Empty;
        }

        private static bool IsImageFile(FileInfo file)
        {
            if (file == null) return false;
            if (!string.IsNullOrWhiteSpace(file.ContentType) &&
                file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                return true;
            var name = file.OriginalName ?? string.Empty;
            return name.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)
                || name.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase)
                || name.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                || name.EndsWith(".gif", StringComparison.OrdinalIgnoreCase)
                || name.EndsWith(".webp", StringComparison.OrdinalIgnoreCase)
                || name.EndsWith(".svg", StringComparison.OrdinalIgnoreCase);
        }

        private static AppRecordDto ToAppRecordDto(AppRecordInfo record) => new AppRecordDto
        {
            SubmissionId = record.SubmissionId,
            FormId = record.FormId,
            Status = record.Status,
            UserId = record.UserId,
            SubmittedOnUtc = record.SubmittedOnUtc,
            Data = new Dictionary<string, object>(
                record.Data ?? new Dictionary<string, object>(),
                StringComparer.OrdinalIgnoreCase),
            IsTyped = record.IsTyped
        };

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

        /// <inheritdoc/>
        public Task<DashboardOverviewDto> GetOverviewAsync(DashboardQuery? query = null, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            var portalId = ResolvePortalId(scope);
            query ??= new DashboardQuery();
            var days = query.Days <= 0 ? 30 : Math.Min(query.Days, 365);
            var maxForms = query.MaxForms <= 0 ? 250 : Math.Min(query.MaxForms, 1000);
            var now = DateTime.UtcNow;
            var since = now.Date.AddDays(-(days - 1));

            var forms = _forms.ListForms(portalId, query.Status, query.Search, 0, maxForms) ?? new List<FormInfo>();
            var rows = new List<DashboardFormSummaryDto>();
            var totalSubmissions = 0;
            var recentSubmissions = 0;

            foreach (var form in forms)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var total = _submissions.List(form.FormId, pageIndex: 0, pageSize: 1).TotalCount;
                var recent = _submissions.List(form.FormId, dateFrom: since, pageIndex: 0, pageSize: 1).TotalCount;
                totalSubmissions += total;
                recentSubmissions += recent;
                rows.Add(new DashboardFormSummaryDto
                {
                    FormId = form.FormId,
                    Title = form.Title,
                    Status = form.Status,
                    CreatedOnUtc = form.CreatedOnUtc.Year > 1 ? (DateTime?)form.CreatedOnUtc : null,
                    SubmissionCount = total,
                    RecentSubmissionCount = recent
                });
            }

            return Task.FromResult(new DashboardOverviewDto
            {
                PortalId = portalId,
                Days = days,
                GeneratedAtUtc = now,
                TotalForms = rows.Count,
                TotalSubmissions = totalSubmissions,
                RecentSubmissions = recentSubmissions,
                Forms = rows
            });
        }

        /// <inheritdoc/>
        public Task<PagedResult<SubmissionListItemDto>> SearchAsync(SubmissionSearchQuery query, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (query == null) throw new ArgumentNullException(nameof(query));
            var portalId = ResolvePortalId(scope);
            var pageIndex = Math.Max(0, query.Page - 1);
            var pageSize = query.PageSize <= 0 ? 50 : Math.Min(query.PageSize, 250);

            if (query.FormId > 0 && !IsFormInPortal(query.FormId, portalId))
                return Task.FromResult(new PagedResult<SubmissionListItemDto>
                {
                    Items = Array.Empty<SubmissionListItemDto>(),
                    TotalCount = 0,
                    Page = pageIndex + 1,
                    PageSize = pageSize
                });

            var service = new SubmissionQueryService(_submissions, _forms, _files, _typedStore);
            var result = service.List(new SubmissionListQuery
            {
                FormId = query.FormId,
                Status = query.Status,
                Search = query.Search,
                DateFrom = query.DateFrom,
                DateTo = query.DateTo,
                PageIndex = pageIndex,
                PageSize = pageSize,
                FieldFilters = (query.FieldFilters ?? Array.Empty<SubmissionFieldFilter>())
                    .Select(ToCoreFilter)
                    .ToList()
            });

            var items = (result.Items ?? new List<SubmissionListItem>())
                .Where(item => query.FormId > 0 || IsFormInPortal(item.FormId, portalId))
                .Select(ToDto)
                .ToList();

            return Task.FromResult(new PagedResult<SubmissionListItemDto>
            {
                Items = items,
                TotalCount = query.FormId > 0 ? result.TotalCount : items.Count,
                Page = pageIndex + 1,
                PageSize = pageSize
            });
        }

        private static MegaForm.Core.Models.SubmissionFieldFilter ToCoreFilter(SubmissionFieldFilter filter)
        {
            if (filter == null) throw new ArgumentException("FieldFilters cannot contain null entries.", nameof(filter));
            return new MegaForm.Core.Models.SubmissionFieldFilter
            {
                FieldKey = filter.FieldKey,
                DataType = filter.DataType.HasValue
                    ? (MegaForm.Core.Models.SubmissionDataType?)(int)filter.DataType.Value
                    : null,
                Operator = (MegaForm.Core.Models.SubmissionFieldFilterOperator)(int)filter.Operator,
                TextValue = filter.TextValue,
                NumberValue = filter.NumberValue,
                DateValue = filter.DateValue,
                BooleanValue = filter.BooleanValue
            };
        }

        /// <inheritdoc/>
        public Task<SubmissionDetailDto?> GetDetailAsync(int submissionId, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            var portalId = ResolvePortalId(scope);
            var service = new SubmissionQueryService(_submissions, _forms, _files, _typedStore);
            var detail = service.GetDetail(submissionId);
            if (detail == null || detail.Submission == null || !IsFormInPortal(detail.Submission.FormId, portalId))
                return Task.FromResult<SubmissionDetailDto?>(null);

            if (_workflowRepository != null)
            {
                detail.WorkflowDetail = new SubmissionWorkflowDetailService(
                    _workflowRepository,
                    new WorkflowTransparencyService()).GetDetail(detail);
            }

            return Task.FromResult<SubmissionDetailDto?>(ToDetailDto(detail));
        }

        /// <inheritdoc/>
        public Task UpdateStatusAsync(int submissionId, string status, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(status))
                throw new ArgumentException("Status is required.", nameof(status));
            if (IsSubmissionInPortal(submissionId, scope))
                _submissions.UpdateStatus(submissionId, status);
            return Task.CompletedTask;
        }

        /// <inheritdoc/>
        public Task<InboxBoardDto> GetMyInboxAsync(InboxQuery? query = null, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            var service = RequireWorkflowTasks();
            var actor = ResolveActor(scope);
            query ??= new InboxQuery();
            var board = service.GetWorkboard(actor, query.RecentCompleted);
            return Task.FromResult(new InboxBoardDto
            {
                User = ToInboxUser(actor),
                Kpis = new InboxKpiDto
                {
                    Incoming = board.Incoming.Count,
                    InProgress = board.InProgress.Count,
                    Completed = board.Completed.Count,
                    Overdue = board.OverdueCount
                },
                Incoming = board.Incoming.Select(ToDto).ToList(),
                InProgress = board.InProgress.Select(ToDto).ToList(),
                Completed = board.Completed.Select(ToDto).ToList(),
                GeneratedAtUtc = board.GeneratedAt
            });
        }

        /// <inheritdoc/>
        public Task<InboxTaskResultDto> GetTaskAsync(string taskId, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            var result = RequireWorkflowTasks().GetTask(taskId, ResolveActor(scope));
            return Task.FromResult(ToDto(result));
        }

        /// <inheritdoc/>
        public async Task<InboxTaskResultDto> ClaimAsync(InboxTaskActionRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            var result = await RequireWorkflowTasks().ClaimTaskAsync(request.TaskId, ResolveActor(scope), request.Comment ?? string.Empty, cancellationToken).ConfigureAwait(false);
            return ToDto(result);
        }

        /// <inheritdoc/>
        public async Task<InboxTaskResultDto> ApproveAsync(InboxTaskActionRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            var result = await RequireWorkflowTasks().ApproveTaskAsync(request.TaskId, ResolveActor(scope), request.Comment ?? string.Empty, request.Data, cancellationToken).ConfigureAwait(false);
            return ToDto(result);
        }

        /// <inheritdoc/>
        public async Task<InboxTaskResultDto> RejectAsync(InboxTaskActionRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            var result = await RequireWorkflowTasks().RejectTaskAsync(request.TaskId, ResolveActor(scope), request.Comment ?? string.Empty, request.Data, cancellationToken).ConfigureAwait(false);
            return ToDto(result);
        }

        /// <inheritdoc/>
        public async Task<InboxTaskResultDto> ForwardAsync(InboxTaskActionRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            var result = await RequireWorkflowTasks().ForwardTaskAsync(request.TaskId, ResolveActor(scope), request.TargetUser ?? string.Empty, request.Comment ?? string.Empty, cancellationToken).ConfigureAwait(false);
            return ToDto(result);
        }

        /// <inheritdoc/>
        public async Task<InboxTaskResultDto> CommentAsync(InboxTaskActionRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            var result = await RequireWorkflowTasks().CommentTaskAsync(request.TaskId, ResolveActor(scope), request.Comment ?? string.Empty, cancellationToken).ConfigureAwait(false);
            return ToDto(result);
        }

        /// <inheritdoc/>
        public async Task<InboxFileAttachmentResultDto> AttachFileAsync(InboxFileAttachmentRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            if (_files == null || _storage == null)
                throw new InvalidOperationException("File repository and storage service are required for inbox attachments.");
            if (request.Content == null || !request.Content.CanRead)
                throw new ArgumentException("A readable attachment stream is required.", nameof(request));

            var service = RequireWorkflowTasks();
            var actor = ResolveActor(scope);
            var taskResult = service.GetTask(request.TaskId, actor);
            var task = taskResult.Task ?? throw new InvalidOperationException("Workflow task not found.");
            if (task.SubmissionId <= 0)
                throw new InvalidOperationException("Task is not linked to a submission.");
            if (!IsSubmissionInPortal(task.SubmissionId, scope))
                throw new InvalidOperationException("Submission not found in this portal.");

            var fileName = System.IO.Path.GetFileName(string.IsNullOrWhiteSpace(request.FileName) ? "attachment" : request.FileName.Trim());
            fileName = FileUploadSecurityService.SanitizePathSegment(fileName, "attachment");
            var fieldKey = FileUploadSecurityService.SanitizePathSegment(request.FieldKey, "inbox_attachment");
            var extension = System.IO.Path.GetExtension(fileName);
            var blocked = FileUploadSecurityService.ParseExtensions(FileUploadSecurityService.GetDefaultBlockedExtensionsCsv());
            if (blocked.Contains(extension))
                throw new InvalidOperationException("This attachment type is not allowed.");

            byte[] bytes;
            using (var buffer = new System.IO.MemoryStream())
            {
                await request.Content.CopyToAsync(buffer, 81920, cancellationToken).ConfigureAwait(false);
                if (buffer.Length == 0)
                    throw new InvalidOperationException("Attachment content is empty.");

                buffer.Position = 0;
                if (!FileUploadSecurityService.ValidateContentByExtension(buffer, extension))
                    throw new InvalidOperationException("Attachment content does not match its file extension.");

                bytes = buffer.ToArray();
            }

            var folder = "MegaForm/Inbox/form-" + task.FormId + "/submission-" + task.SubmissionId;
            string storedPath;
            using (var saveStream = new System.IO.MemoryStream(bytes, writable: false))
            {
                storedPath = await _storage.SaveFileAsync(saveStream, fileName, folder).ConfigureAwait(false);
            }

            var file = new FileInfo
            {
                SubmissionId = task.SubmissionId,
                FieldKey = fieldKey,
                OriginalName = fileName,
                StoredPath = storedPath,
                ContentType = string.IsNullOrWhiteSpace(request.ContentType) ? "application/octet-stream" : request.ContentType,
                FileSizeBytes = request.SizeBytes.HasValue && request.SizeBytes.Value >= 0 ? request.SizeBytes.Value : bytes.LongLength,
                UploadedOnUtc = DateTime.UtcNow
            };
            file.FileId = _files.InsertFile(file);

            return new InboxFileAttachmentResultDto
            {
                Success = true,
                File = ToDto(file),
                Task = ToDto(service.GetTask(task.TaskId, actor))
            };
        }

        /// <inheritdoc/>
        public Task<InboxSendSubmissionResultDto> SendSubmissionAsync(SendSubmissionToInboxRequest request, MegaFormScope? scope = null, CancellationToken cancellationToken = default)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            var task = RequireWorkflowTasks().CreateAdHocReviewTask(
                request.FormId,
                request.SubmissionId,
                request.TargetUser,
                request.Title ?? string.Empty,
                request.Comment ?? string.Empty,
                ResolveActor(scope));
            return Task.FromResult(new InboxSendSubmissionResultDto
            {
                Success = true,
                TaskId = task.TaskId,
                AssignedTo = task.AssignedDisplayName ?? task.AssignedUserName,
                FormId = request.FormId,
                SubmissionId = request.SubmissionId
            });
        }

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

        private WorkflowTaskService RequireWorkflowTasks()
        {
            if (_workflowTasks == null)
                throw new InvalidOperationException("Workflow task service is not registered. Register WorkflowTaskService before using IMegaFormClient.Inbox.");
            return _workflowTasks;
        }

        private UserContext ResolveActor(MegaFormScope? scope)
        {
            ResolvePortalId(scope);

            var userId = scope?.UserId ?? (_platform?.UserId ?? 0);
            var userName = scope?.UserName ?? _platform?.UserName ?? (userId > 0 ? userId.ToString() : string.Empty);
            return new UserContext
            {
                UserId = userId,
                UserName = userName,
                DisplayName = scope?.DisplayName ?? userName,
                Email = scope?.UserEmail ?? _platform?.UserEmail ?? string.Empty,
                IsAuthenticated = scope?.IsAuthenticated ?? (_platform?.IsAuthenticated ?? userId > 0),
                IsAdmin = scope?.IsAdmin ?? (_platform?.IsAdmin ?? false),
                IsSuperUser = scope?.IsSuperUser ?? false,
                Roles = scope?.Roles != null ? new List<string>(scope.Roles) : new List<string>(),
                IpAddress = scope?.IpAddress ?? string.Empty
            };
        }

        private IReadOnlyList<FileDto> ListFileDtos(int submissionId)
        {
            if (_files == null || submissionId <= 0)
                return Array.Empty<FileDto>();
            return (_files.GetBySubmission(submissionId) ?? new List<FileInfo>())
                .Select(ToDto)
                .ToList();
        }

        private SubmissionDetailDto ToDetailDto(SubmissionDetailResult detail)
        {
            var submission = detail.Submission == null ? null : ToDto(detail.Submission);
            if (submission != null && detail.Data != null)
            {
                submission.Data = new Dictionary<string, object>(detail.Data, StringComparer.OrdinalIgnoreCase);
            }

            return new SubmissionDetailDto
            {
                Submission = submission,
                Form = detail.Form == null ? null : ToDto(detail.Form, 0),
                Schema = detail.Form == null ? new FormSchemaInfo() : Parse(detail.Form.SchemaJson ?? string.Empty),
                Files = (detail.Files ?? new List<FileInfo>()).Select(ToDto).ToList(),
                Values = (detail.FlattenedValues ?? new List<KeyValuePair<string, string>>())
                    .Select(kv => new SubmissionValueDto { Key = kv.Key, Value = kv.Value })
                    .ToList(),
                FieldSnapshots = (detail.FieldSnapshots ?? new List<SubmissionFieldSnapshot>())
                    .Select(ToDto)
                    .ToList(),
                HasSnapshot = detail.HasSnapshot,
                Workflow = ToDto(detail.WorkflowDetail)
            };
        }

        private InboxTaskResultDto ToDto(WorkflowTaskOperationResult r) => new InboxTaskResultDto
        {
            Success = r != null && r.Success,
            Error = r?.Error,
            Task = r?.Task == null ? null : ToDto(r.Task),
            Submission = r?.Submission == null ? null : ToDto(r.Submission),
            Files = r?.Task == null ? Array.Empty<FileDto>() : ListFileDtos(r.Task.SubmissionId),
            Actions = (r?.Actions ?? new List<WorkflowTaskAction>()).Select(ToDto).ToList()
        };

        private static InboxUserDto ToInboxUser(UserContext actor) => new InboxUserDto
        {
            UserId = actor.UserId,
            UserName = actor.UserName,
            DisplayName = actor.DisplayName,
            IsAdmin = actor.IsAdmin || actor.IsSuperUser
        };

#pragma warning disable CS0618
        private static SubmissionListItemDto ToDto(SubmissionListItem item) => new SubmissionListItemDto
        {
            SubmissionId = item.SubmissionId,
            FormId = item.FormId,
            FormTitle = item.FormTitle,
            Status = item.Status,
            IsSpam = item.IsSpam,
            SpamScore = item.SpamScore,
            SubmittedOnUtc = item.SubmittedOnUtc,
            ReadOnUtc = item.ReadOnUtc,
            UserId = item.UserId,
            IpAddress = item.IpAddress,
            SummaryText = item.SummaryText,
            Data = new Dictionary<string, object>(
                item.Data ?? new Dictionary<string, object>(),
                StringComparer.OrdinalIgnoreCase),
            DataJson = item.DataJson
        };

        private static SubmissionFieldSnapshotDto ToDto(SubmissionFieldSnapshot snapshot) => new SubmissionFieldSnapshotDto
        {
            FieldKey = snapshot.FieldKey,
            FieldLabel = snapshot.FieldLabel,
            FieldType = snapshot.FieldType,
            RawValue = snapshot.RawValue,
            DisplayValue = snapshot.DisplayValue,
            SortOrder = snapshot.SortOrder,
            IsLegacyFallback = snapshot.IsLegacyFallback
        };

        private static SubmissionWorkflowSummaryDto ToDto(SubmissionWorkflowDetailInfo workflow)
        {
            var tasks = (workflow?.WorkflowTasks ?? new List<WorkflowTaskInstance>()).Select(ToDto).ToList();
            var actions = (workflow?.WorkflowActions ?? new List<WorkflowTaskAction>()).Select(ToDto).ToList();
            return new SubmissionWorkflowSummaryDto
            {
                HasWorkflow = workflow != null && workflow.HasWorkflow,
                ActiveTaskId = workflow?.Transparency?.ActiveTaskId,
                ActiveNodeLabel = workflow?.Transparency?.ActiveNodeLabel,
                CaseStatus = workflow?.WorkflowCase?.Status.ToString(),
                ExecutionStatus = workflow?.WorkflowExecution?.Status.ToString(),
                TaskCount = tasks.Count,
                OpenTaskCount = tasks.Count(t => string.Equals(t.Status, WorkflowTaskStatus.Pending.ToString(), StringComparison.OrdinalIgnoreCase) ||
                                                 string.Equals(t.Status, WorkflowTaskStatus.Claimed.ToString(), StringComparison.OrdinalIgnoreCase)),
                ActionCount = actions.Count,
                Tasks = tasks,
                Actions = actions
            };
        }

        private static InboxTaskDto ToDto(WorkflowTaskInstance task) => new InboxTaskDto
        {
            TaskId = task.TaskId,
            CaseId = task.CaseId,
            ExecutionId = task.ExecutionId,
            FormId = task.FormId,
            SubmissionId = task.SubmissionId,
            NodeId = task.NodeId,
            NodeLabel = task.NodeLabel,
            Status = task.Status.ToString(),
            CandidateRoles = task.CandidateRoles ?? new List<string>(),
            CandidateUsers = task.CandidateUsers ?? new List<string>(),
            AssignedUserId = task.AssignedUserId,
            AssignedUserName = task.AssignedUserName,
            AssignedDisplayName = task.AssignedDisplayName,
            AllowClaim = task.AllowClaim,
            AllowForward = task.AllowForward,
            AllowReassign = task.AllowReassign,
            Outcome = task.Outcome,
            Comment = task.Comment,
            CreatedAtUtc = task.CreatedAt,
            ClaimedAtUtc = task.ClaimedAt,
            DueAtUtc = task.DueAt,
            CompletedAtUtc = task.CompletedAt
        };

        private static InboxTaskActionDto ToDto(WorkflowTaskAction action) => new InboxTaskActionDto
        {
            ActionId = action.ActionId,
            TaskId = action.TaskId,
            CaseId = action.CaseId,
            ExecutionId = action.ExecutionId,
            FormId = action.FormId,
            SubmissionId = action.SubmissionId,
            ActionType = action.ActionType.ToString(),
            ActorUserId = action.ActorUserId,
            ActorUserName = action.ActorUserName,
            ActorDisplayName = action.ActorDisplayName,
            TargetUser = action.TargetUser,
            Outcome = action.Outcome,
            Comment = action.Comment,
            CreatedAtUtc = action.CreatedAt
        };

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
            Data = ParseDataDictionary(s.DataJson),
            DataJson = s.DataJson,
            Status = s.Status,
            IsSpam = s.IsSpam,
            UserId = s.UserId,
            SubmittedOnUtc = s.SubmittedOnUtc
        };
#pragma warning restore CS0618

        private static Dictionary<string, object> ParseDataDictionary(string dataJson)
        {
            var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(dataJson)) return data;
            try
            {
                var parsed = JsonConvert.DeserializeObject<Dictionary<string, object>>(dataJson);
                if (parsed != null)
                {
                    foreach (var kv in parsed)
                        data[kv.Key] = kv.Value;
                }
            }
            catch
            {
            }
            return data;
        }
    }
}
