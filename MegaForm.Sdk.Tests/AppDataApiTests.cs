using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.TypedSubmission;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    public sealed class AppDataApiTests
    {
        private static readonly MegaFormScope Scope = new MegaFormScope { PortalId = 7, UserId = 42 };

        [Fact]
        public async Task Named_query_uses_typed_app_status_instead_of_submission_transport_status()
        {
            var forms = new InMemoryFormRepository();
            var submissions = new InMemorySubmissionRepository();
            var typed = new AppTypedStore();
            var formId = forms.SaveForm(new FormInfo
            {
                PortalId = 7,
                AppScope = "blog",
                Title = "Posts",
                Status = "published",
                SchemaJson = "{\"fields\":[{\"key\":\"title\",\"type\":\"Text\"}]}"
            });
            var draftId = submissions.Insert(new SubmissionInfo
            {
                FormId = formId,
                Status = "published",
                DataJson = "{\"title\":\"Legacy title\",\"status\":\"draft\"}",
                SubmittedOnUtc = DateTime.UtcNow
            });
            typed.Seed(draftId, formId, new Dictionary<string, object>
            {
                ["title"] = "Typed draft",
                ["status"] = "draft"
            });
            var publishedId = submissions.Insert(new SubmissionInfo
            {
                FormId = formId,
                Status = "Submitted",
                DataJson = "{\"title\":\"Legacy published\",\"status\":\"published\"}",
                SubmittedOnUtc = DateTime.UtcNow.AddMinutes(1)
            });
            typed.Seed(publishedId, formId, new Dictionary<string, object>
            {
                ["title"] = "Typed published",
                ["status"] = "published"
            });

            var phase2 = NewPhase2(formId);
            var client = MegaFormClient.CreateApplicationClient(
                forms, submissions, null, null, null, null, null, null, phase2, typed);

            var result = await client.Queries.ExecuteAsync(
                "blog-starter", "public-posts", new AppQueryRequest(), Scope);

            var record = Assert.Single(result.Items);
            Assert.True(record.IsTyped);
            Assert.Equal("published", record.Status);
            Assert.Equal(publishedId, record.SubmissionId);
            Assert.Equal("Typed published", record.Data["title"]);
        }

        [Fact]
        public async Task Patch_record_writes_typed_rows_and_legacy_mirror()
        {
            var forms = new InMemoryFormRepository();
            var submissions = new InMemorySubmissionRepository();
            var typed = new AppTypedStore();
            var formId = forms.SaveForm(new FormInfo
            {
                PortalId = 7,
                AppScope = "blog",
                Title = "Posts",
                Status = "published",
                SchemaJson = "{\"fields\":[{\"key\":\"title\",\"type\":\"Text\"},{\"key\":\"slug\",\"type\":\"Text\"},{\"key\":\"status\",\"type\":\"Hidden\"}]}"
            });
            var submissionId = submissions.Insert(new SubmissionInfo
            {
                FormId = formId,
                Status = "draft",
                DataJson = "{\"title\":\"Before\",\"slug\":\"before\"}"
            });
            typed.Seed(submissionId, formId, new Dictionary<string, object>
            {
                ["title"] = "Before",
                ["slug"] = "before"
            });

            var client = MegaFormClient.CreateApplicationClient(
                forms, submissions, null, null, null, null, null, null, NewPhase2(formId), typed);

            var updated = await client.Records.PatchRecordAsync(
                submissionId,
                new Dictionary<string, object> { ["title"] = "After", ["status"] = "published" },
                Scope);

            Assert.NotNull(updated);
            Assert.Equal("After", updated!.Data["title"]);
            Assert.Equal("before", updated.Data["slug"]);
            Assert.Equal("published", submissions.Get(submissionId)!.Status);
            Assert.Contains("\"title\":\"After\"", submissions.Get(submissionId)!.DataJson);
        }

        [Fact]
        public async Task Gallery_query_projects_typed_urls_and_uploaded_images()
        {
            var forms = new InMemoryFormRepository();
            var submissions = new InMemorySubmissionRepository();
            var typed = new AppTypedStore();
            var files = new InMemoryFileRepository();
            var storage = new InMemoryStorage();
            var formId = forms.SaveForm(new FormInfo
            {
                PortalId = 7,
                AppScope = "blog",
                Title = "Authors",
                Status = "published",
                SchemaJson = "{\"fields\":[{\"key\":\"author_name\",\"type\":\"Text\"},{\"key\":\"author_avatar_url\",\"type\":\"Text\"}]}"
            });
            var submissionId = submissions.Insert(new SubmissionInfo
            {
                FormId = formId,
                Status = "published",
                DataJson = "{}",
                SubmittedOnUtc = DateTime.UtcNow
            });
            typed.Seed(submissionId, formId, new Dictionary<string, object>
            {
                ["author_name"] = "Ada Editor",
                ["author_avatar_url"] = "https://cdn.example.test/ada.webp"
            });
            files.InsertFile(new FileInfo
            {
                SubmissionId = submissionId,
                FieldKey = "portrait_upload",
                OriginalName = "ada.png",
                StoredPath = "authors/ada.png",
                ContentType = "image/png",
                FileSizeBytes = 128,
                UploadedOnUtc = DateTime.UtcNow
            });
            storage.Put("authors/ada.png", new byte[] { 1, 2, 3 });

            var client = MegaFormClient.CreateApplicationClient(
                forms, submissions, null, files, storage, null, null, null, NewPhase2(formId), typed);

            var result = await client.Gallery.QueryGalleryAsync(new GalleryQueryRequest
            {
                AppKey = "blog-starter",
                QueryKey = "public-posts",
                Query = new AppQueryRequest { PageSize = 25 },
                ImageFieldKeys = new List<string> { "author_avatar_url" },
                TitleFieldKey = "author_name",
                AltTextFieldKey = "author_name",
                IncludeUploadedImages = true
            }, Scope);

            Assert.Equal(2, result.Items.Count);
            Assert.Contains(result.Items, item =>
                item.Source == "typed-field" &&
                item.Url == "https://cdn.example.test/ada.webp" &&
                item.Title == "Ada Editor");
            Assert.Contains(result.Items, item =>
                item.Source == "uploaded-file" &&
                item.Url == "/files/authors/ada.png" &&
                item.FileName == "ada.png");
        }

        private static IPhase2Repository NewPhase2(int formId)
        {
            var proxy = DispatchProxy.Create<IPhase2Repository, AppPhase2Proxy>();
            var state = (AppPhase2Proxy)(object)proxy;
            state.App = new AppDefinitionInfo
            {
                AppId = 9,
                PortalId = 7,
                AppKey = "blog-starter",
                AppName = "Blog",
                AppScope = "blog",
                IsEnabled = true,
                ManifestJson = "{}"
            };
            state.Query = new AppQueryDefinitionInfo
            {
                QueryId = 10,
                AppId = 9,
                FormId = formId,
                QueryKey = "public-posts",
                QueryName = "Public Posts",
                QueryType = "submissions",
                DefinitionJson = "{\"status\":\"published\",\"sort\":[{\"field\":\"publish_date\",\"dir\":\"desc\"}]}"
            };
            return proxy;
        }

        private class AppPhase2Proxy : DispatchProxy
        {
            public AppDefinitionInfo App { get; set; } = null!;
            public AppQueryDefinitionInfo Query { get; set; } = null!;

            protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
            {
                switch (targetMethod?.Name)
                {
                    case nameof(IPhase2Repository.GetAppDefinition):
                        return string.Equals((string?)args![1], App.AppKey, StringComparison.OrdinalIgnoreCase) ? App : null;
                    case nameof(IPhase2Repository.ListAppDefinitions):
                        return new List<AppDefinitionInfo> { App };
                    case nameof(IPhase2Repository.ListAppQueries):
                        return new List<AppQueryDefinitionInfo> { Query };
                    case nameof(IPhase2Repository.GetAppQuery):
                        return Query;
                    case nameof(IPhase2Repository.GetAppScopes):
                        return new List<string> { App.AppScope };
                    case nameof(IPhase2Repository.GetFormViews):
                    case nameof(IPhase2Repository.GetFormRelations):
                    case nameof(IPhase2Repository.GetFormPermissions):
                    case nameof(IPhase2Repository.GetWorkflows):
                        return Activator.CreateInstance(targetMethod.ReturnType);
                    default:
                        return targetMethod != null && targetMethod.ReturnType.IsValueType
                            ? Activator.CreateInstance(targetMethod.ReturnType)
                            : null;
                }
            }
        }

        private sealed class AppTypedStore : ISubmissionDataStore
        {
            private readonly Dictionary<int, SubmissionDataDocument> _documents = new Dictionary<int, SubmissionDataDocument>();
            public bool SupportsDataJsonCollapse => false;

            public void Seed(int submissionId, int formId, Dictionary<string, object> data)
            {
                _documents[submissionId] = new SubmissionDataDocument
                {
                    SubmissionId = submissionId,
                    FormId = formId,
                    Data = new Dictionary<string, object>(data, StringComparer.OrdinalIgnoreCase),
                    Fields = data.Select((pair, index) => new SubmissionFieldRecord
                    {
                        SubmissionFieldId = index + 1,
                        SubmissionId = submissionId,
                        FormId = formId,
                        FieldKey = pair.Key,
                        FieldType = "Text",
                        DataType = "string",
                        FieldOrder = index
                    }).ToList()
                };
            }

            public SubmissionDataDocument GetData(int submissionId) => _documents[submissionId];
            public IReadOnlyList<SubmissionFieldRecord> GetFields(int submissionId) => _documents[submissionId].Fields;
            public bool HasFields(int submissionId) => _documents.ContainsKey(submissionId);

            public void InsertFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields) =>
                ReplaceFields(submissionId, formId, fields);

            public void ReplaceFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields) =>
                Seed(submissionId, formId, fields.ToDictionary(x => x.FieldKey, x => x.Value, StringComparer.OrdinalIgnoreCase));

            public void DeleteFields(int submissionId) => _documents.Remove(submissionId);
            public IReadOnlyList<SubmissionValueStringRecord> GetStringValues(long submissionFieldId) => Array.Empty<SubmissionValueStringRecord>();
            public IReadOnlyList<SubmissionValueLongTextRecord> GetLongTextValues(long submissionFieldId) => Array.Empty<SubmissionValueLongTextRecord>();
            public IReadOnlyList<SubmissionValueNumberRecord> GetNumberValues(long submissionFieldId) => Array.Empty<SubmissionValueNumberRecord>();
            public IReadOnlyList<SubmissionValueDateRecord> GetDateValues(long submissionFieldId) => Array.Empty<SubmissionValueDateRecord>();
            public IReadOnlyList<SubmissionValueBooleanRecord> GetBooleanValues(long submissionFieldId) => Array.Empty<SubmissionValueBooleanRecord>();
            public IReadOnlyList<SubmissionValueJsonRecord> GetJsonValues(long submissionFieldId) => Array.Empty<SubmissionValueJsonRecord>();
        }
    }
}
