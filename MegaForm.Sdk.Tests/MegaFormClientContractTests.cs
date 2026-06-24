using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// Contract tests for the public MegaForm SDK facade. These exercise IMegaFormClient end
    /// to end against in-memory repositories — if an internal change breaks the facade's
    /// behaviour, these fail in CI. (The public API SHAPE is locked separately by the
    /// PublicApiAnalyzers + PublicAPI.*.txt baseline at build time.)
    /// </summary>
    public class MegaFormClientContractTests
    {
        private static (MegaFormClient client, InMemoryFormRepository forms, InMemorySubmissionRepository subs) NewClient()
        {
            var forms = new InMemoryFormRepository();
            var subs = new InMemorySubmissionRepository();
            // platform context = null → callers must pass MegaFormScope (exercises that path too)
            var client = new MegaFormClient(forms, subs, null);
            return (client, forms, subs);
        }

        private static readonly MegaFormScope Scope = new MegaFormScope { PortalId = 7, UserId = 42 };

        [Fact]
        public async Task CreateForm_then_GetForm_roundtrips()
        {
            var (client, _, _) = NewClient();
            var created = await client.Forms.CreateFormAsync(
                new CreateFormRequest { Title = "Contact", Status = "published" }, Scope);

            Assert.True(created.FormId > 0);
            Assert.Equal("Contact", created.Title);
            Assert.Equal(7, created.PortalId);

            var fetched = await client.Forms.GetFormAsync(created.FormId, Scope);
            Assert.NotNull(fetched);
            Assert.Equal(created.FormId, fetched!.FormId);
            Assert.Equal("published", fetched.Status);
        }

        [Fact]
        public async Task ListForms_returns_created_forms_in_portal()
        {
            var (client, _, _) = NewClient();
            await client.Forms.CreateFormAsync(new CreateFormRequest { Title = "A" }, Scope);
            await client.Forms.CreateFormAsync(new CreateFormRequest { Title = "B" }, Scope);

            var page = await client.Forms.ListFormsAsync(new FormQuery { Page = 1, PageSize = 10 }, Scope);
            Assert.Equal(2, page.Items.Count);
            Assert.Contains(page.Items, f => f.Title == "A");
            Assert.Contains(page.Items, f => f.Title == "B");
        }

        [Fact]
        public async Task GetForm_in_other_portal_returns_null()
        {
            var (client, _, _) = NewClient();
            var created = await client.Forms.CreateFormAsync(new CreateFormRequest { Title = "Secret" }, Scope);

            var otherPortal = new MegaFormScope { PortalId = 999, UserId = 1 };
            var fetched = await client.Forms.GetFormAsync(created.FormId, otherPortal);
            Assert.Null(fetched);
        }

        [Fact]
        public async Task FindSubmissions_paginates_with_total_count()
        {
            var (client, forms, subs) = NewClient();
            var form = await client.Forms.CreateFormAsync(new CreateFormRequest { Title = "Survey" }, Scope);
            for (int i = 0; i < 5; i++)
                subs.Insert(new SubmissionInfo { FormId = form.FormId, DataJson = "{}", Status = "new" });

            var page = await client.Submissions.FindAsync(
                new SubmissionQuery { FormId = form.FormId, Page = 1, PageSize = 2 }, Scope);

            Assert.Equal(2, page.Items.Count);   // page size honored
            Assert.Equal(5, page.TotalCount);    // real total from the repository
            Assert.Equal(1, page.Page);
        }

        [Fact]
        public async Task DeleteForm_removes_it()
        {
            var (client, _, _) = NewClient();
            var created = await client.Forms.CreateFormAsync(new CreateFormRequest { Title = "Temp" }, Scope);
            await client.Forms.DeleteFormAsync(created.FormId, Scope);
            Assert.Null(await client.Forms.GetFormAsync(created.FormId, Scope));
        }

        [Fact]
        public async Task NoContext_throws_when_no_scope_and_no_platform()
        {
            var (client, _, _) = NewClient();
            await Assert.ThrowsAsync<System.InvalidOperationException>(
                () => client.Forms.ListFormsAsync(new FormQuery()));
        }

        [Fact]
        public async Task Files_list_and_download_roundtrip()
        {
            var forms = new InMemoryFormRepository();
            var subs = new InMemorySubmissionRepository();
            var files = new InMemoryFileRepository();
            var storage = new InMemoryStorage();
            var client = new MegaFormClient(forms, subs, null, files, storage);

            var subId = subs.Insert(new SubmissionInfo { FormId = 1, DataJson = "{}", Status = "new" });
            var bytes = System.Text.Encoding.UTF8.GetBytes("hello-resume-pdf");
            storage.Put("uploads/cv.pdf", bytes);
            files.InsertFile(new MegaForm.Core.Models.FileInfo {
                SubmissionId = subId, FieldKey = "cv", OriginalName = "cv.pdf",
                StoredPath = "uploads/cv.pdf", ContentType = "application/pdf", FileSizeBytes = bytes.Length });

            // list
            var list = await client.Files.ListForSubmissionAsync(subId, Scope);
            Assert.Single(list);
            Assert.Equal("cv.pdf", list[0].FileName);
            Assert.Equal("application/pdf", list[0].ContentType);
            Assert.Equal(bytes.Length, list[0].SizeBytes);

            // download
            var content = await client.Files.OpenAsync(subId, list[0].FileId, Scope);
            Assert.NotNull(content);
            Assert.Equal("cv.pdf", content!.FileName);
            Assert.Equal(bytes, content.Content);

            // missing file → null
            Assert.Null(await client.Files.OpenAsync(subId, 99999, Scope));
            // no file repo → empty list, never throws
            var (bare, _, _) = NewClient();
            Assert.Empty(await bare.Files.ListForSubmissionAsync(subId, Scope));
        }

        // ── Write API (Phase 1): SubmitAsync / UpdateAsync / DeleteAsync / UpdateFormAsync ──
        //
        // These exercise the no-processor FALLBACK path (the in-memory client passes
        // submissionProcessor = null): resolve schema → FormValidationService.Validate → insert.
        // The full-pipeline path is only reachable when a host registers SubmissionProcessor.

        private const string OneRequiredTextSchema =
            "{\"fields\":[{\"key\":\"name\",\"type\":\"Text\",\"label\":\"Name\",\"required\":true}]}";

        // A Row with two columns, each holding a required Text field. Proves FlattenFields
        // descends into Row columns (same as the server pipeline) during fallback validation.
        private const string RowNestedRequiredSchema =
            "{\"fields\":[{\"key\":\"row1\",\"type\":\"Row\",\"columns\":[" +
            "{\"span\":6,\"fields\":[{\"key\":\"first\",\"type\":\"Text\",\"label\":\"First\",\"required\":true}]}," +
            "{\"span\":6,\"fields\":[{\"key\":\"last\",\"type\":\"Text\",\"label\":\"Last\",\"required\":true}]}]}]}";

        private async Task<int> NewFormAsync(MegaFormClient client, string schemaJson, string status = "published")
        {
            var form = await client.Forms.CreateFormAsync(
                new CreateFormRequest { Title = "WriteForm", Status = status, SchemaJson = schemaJson }, Scope);
            return form.FormId;
        }

        [Fact]
        public async Task SubmitAsync_valid_data_inserts_via_fallback()
        {
            var (client, _, subs) = NewClient();
            var formId = await NewFormAsync(client, OneRequiredTextSchema);

            var result = await client.Submissions.SubmitAsync(
                formId, new System.Collections.Generic.Dictionary<string, object> { ["name"] = "Alice" }, Scope);

            Assert.True(result.Success);
            Assert.True(result.SubmissionId > 0);
            Assert.Null(result.ValidationErrors);
            var saved = subs.Get(result.SubmissionId);
            Assert.NotNull(saved);
            Assert.Equal("new", saved!.Status);
            Assert.Contains("Alice", saved.DataJson);
        }

        [Fact]
        public async Task SubmitAsync_missing_required_field_returns_validation_errors()
        {
            var (client, _, subs) = NewClient();
            var formId = await NewFormAsync(client, OneRequiredTextSchema);

            var result = await client.Submissions.SubmitAsync(
                formId, new System.Collections.Generic.Dictionary<string, object>(), Scope);

            Assert.False(result.Success);
            Assert.Equal(0, result.SubmissionId);
            Assert.NotNull(result.ValidationErrors);
            Assert.True(result.ValidationErrors!.ContainsKey("name"));
            // nothing persisted
            var page = await client.Submissions.FindAsync(new SubmissionQuery { FormId = formId }, Scope);
            Assert.Equal(0, page.TotalCount);
        }

        [Fact]
        public async Task SubmitAsync_nested_row_required_field_fails()
        {
            var (client, _, _) = NewClient();
            var formId = await NewFormAsync(client, RowNestedRequiredSchema);

            // supply only the first column's field → the second (nested, required) must fail
            var result = await client.Submissions.SubmitAsync(
                formId, new System.Collections.Generic.Dictionary<string, object> { ["first"] = "A" }, Scope);

            Assert.False(result.Success);
            Assert.NotNull(result.ValidationErrors);
            Assert.True(result.ValidationErrors!.ContainsKey("last"));
        }

        [Fact]
        public async Task SubmitAsync_unknown_form_returns_not_found()
        {
            var (client, _, _) = NewClient();
            var result = await client.Submissions.SubmitAsync(
                99999, new System.Collections.Generic.Dictionary<string, object>(), Scope);
            Assert.False(result.Success);
            Assert.Null(result.ValidationErrors);
            Assert.NotNull(result.ErrorMessage);
        }

        [Fact]
        public async Task UpdateAsync_replaces_datajson()
        {
            var (client, forms, subs) = NewClient();
            var formId = await NewFormAsync(client, OneRequiredTextSchema);
            var subId = subs.Insert(new SubmissionInfo { FormId = formId, DataJson = "{\"name\":\"old\"}", Status = "new" });

            await client.Submissions.UpdateAsync(
                subId, new System.Collections.Generic.Dictionary<string, object> { ["name"] = "updated" }, Scope);

            var after = subs.Get(subId);
            Assert.Contains("updated", after!.DataJson);
            Assert.DoesNotContain("old", after.DataJson);
        }

        [Fact]
        public async Task UpdateAsync_cross_tenant_is_noop()
        {
            var (client, _, subs) = NewClient();
            var formId = await NewFormAsync(client, OneRequiredTextSchema);
            var subId = subs.Insert(new SubmissionInfo { FormId = formId, DataJson = "{\"name\":\"keep\"}", Status = "new" });

            var otherPortal = new MegaFormScope { PortalId = 999, UserId = 1 };
            await client.Submissions.UpdateAsync(
                subId, new System.Collections.Generic.Dictionary<string, object> { ["name"] = "hacked" }, otherPortal);

            Assert.Contains("keep", subs.Get(subId)!.DataJson);
        }

        [Fact]
        public async Task DeleteAsync_removes_submission()
        {
            var (client, _, subs) = NewClient();
            var formId = await NewFormAsync(client, OneRequiredTextSchema);
            var subId = subs.Insert(new SubmissionInfo { FormId = formId, DataJson = "{}", Status = "new" });

            await client.Submissions.DeleteAsync(subId, Scope);
            Assert.Null(subs.Get(subId));
        }

        [Fact]
        public async Task DeleteAsync_cross_tenant_is_noop()
        {
            var (client, _, subs) = NewClient();
            var formId = await NewFormAsync(client, OneRequiredTextSchema);
            var subId = subs.Insert(new SubmissionInfo { FormId = formId, DataJson = "{}", Status = "new" });

            var otherPortal = new MegaFormScope { PortalId = 999, UserId = 1 };
            await client.Submissions.DeleteAsync(subId, otherPortal);
            Assert.NotNull(subs.Get(subId));   // still there

            await client.Submissions.DeleteAsync(subId, Scope);
            Assert.Null(subs.Get(subId));       // owner can delete
        }

        [Fact]
        public async Task UpdateFormAsync_updates_title_only()
        {
            var (client, _, _) = NewClient();
            var created = await client.Forms.CreateFormAsync(
                new CreateFormRequest { Title = "Old", Status = "published" }, Scope);

            var updated = await client.Forms.UpdateFormAsync(
                created.FormId, new UpdateFormRequest { Title = "New" }, Scope);

            Assert.Equal("New", updated.Title);
            Assert.Equal("published", updated.Status);   // unchanged
            var fetched = await client.Forms.GetFormAsync(created.FormId, Scope);
            Assert.Equal("New", fetched!.Title);
        }

        [Fact]
        public async Task UpdateFormAsync_partial_requireauth_leaves_other_fields()
        {
            var (client, _, _) = NewClient();
            var created = await client.Forms.CreateFormAsync(
                new CreateFormRequest { Title = "Keep", Status = "published", RequireAuth = false }, Scope);

            var updated = await client.Forms.UpdateFormAsync(
                created.FormId, new UpdateFormRequest { RequireAuth = true }, Scope);

            Assert.True(updated.RequireAuth);
            Assert.Equal("Keep", updated.Title);          // unchanged
            Assert.Equal("published", updated.Status);    // unchanged
        }

        [Fact]
        public async Task UpdateFormAsync_unknown_or_cross_tenant_throws()
        {
            var (client, _, _) = NewClient();
            await Assert.ThrowsAsync<System.InvalidOperationException>(
                () => client.Forms.UpdateFormAsync(99999, new UpdateFormRequest { Title = "X" }, Scope));

            var created = await client.Forms.CreateFormAsync(new CreateFormRequest { Title = "Mine" }, Scope);
            var otherPortal = new MegaFormScope { PortalId = 999, UserId = 1 };
            await Assert.ThrowsAsync<System.InvalidOperationException>(
                () => client.Forms.UpdateFormAsync(created.FormId, new UpdateFormRequest { Title = "X" }, otherPortal));
        }

        [Fact]
        public async Task UpdateFormAsync_null_request_throws()
        {
            var (client, _, _) = NewClient();
            var created = await client.Forms.CreateFormAsync(new CreateFormRequest { Title = "F" }, Scope);
            await Assert.ThrowsAsync<System.ArgumentNullException>(
                () => client.Forms.UpdateFormAsync(created.FormId, null!, Scope));
        }

        // ── P2: ISchemaApi.Parse (typed schema) ─────────────────────────────

        [Fact]
        public void Schema_Parse_returns_typed_fields()
        {
            var (client, _, _) = NewClient();
            const string json = "{\"fields\":[" +
                "{\"key\":\"name\",\"type\":\"Text\",\"label\":\"Name\",\"required\":true,\"validation\":{\"minLength\":2,\"maxLength\":50}}," +
                "{\"key\":\"cat\",\"type\":\"Select\",\"label\":\"Category\",\"options\":[{\"label\":\"A\",\"value\":\"a\"},{\"label\":\"B\",\"value\":\"b\"}]}]}";
            var schema = client.Schema.Parse(json);

            Assert.Equal(2, schema.Fields.Count);
            var name = schema.Fields[0];
            Assert.Equal("name", name.Key);
            Assert.Equal("Text", name.Type);
            Assert.True(name.Required);
            Assert.True(name.IsInputField);
            Assert.NotNull(name.Validation);
            Assert.Equal(2, name.Validation!.MinLength);
            Assert.Equal(50, name.Validation.MaxLength);
            var cat = schema.Fields[1];
            Assert.Equal(2, cat.Options.Count);
            Assert.Equal("a", cat.Options[0].Value);
        }

        [Fact]
        public void Schema_Parse_flattens_row()
        {
            var (client, _, _) = NewClient();
            const string json = "{\"fields\":[{\"key\":\"row1\",\"type\":\"Row\",\"columns\":[" +
                "{\"span\":6,\"fields\":[{\"key\":\"first\",\"type\":\"Text\"}]}," +
                "{\"span\":6,\"fields\":[{\"key\":\"last\",\"type\":\"Text\"}]}]}]}";
            var schema = client.Schema.Parse(json);
            Assert.Contains(schema.Fields, f => f.Key == "first");
            Assert.Contains(schema.Fields, f => f.Key == "last");
            Assert.DoesNotContain(schema.Fields, f => f.Type == "Row");
        }

        [Fact]
        public void Schema_Parse_malformed_returns_empty_no_throw()
        {
            var (client, _, _) = NewClient();
            var schema = client.Schema.Parse("not valid json {{{");
            Assert.Empty(schema.Fields);
        }

        [Fact]
        public async Task Schema_ParseForm_uses_form_schemajson()
        {
            var (client, _, _) = NewClient();
            var created = await client.Forms.CreateFormAsync(
                new CreateFormRequest { Title = "F", SchemaJson = "{\"fields\":[{\"key\":\"email\",\"type\":\"Email\",\"required\":true}]}" }, Scope);
            var fetched = await client.Forms.GetFormAsync(created.FormId, Scope);
            var schema = client.Schema.ParseForm(fetched!);
            Assert.Single(schema.Fields);
            Assert.Equal("email", schema.Fields[0].Key);
        }

        [Fact]
        public void Schema_ParseForm_null_throws()
        {
            var (client, _, _) = NewClient();
            Assert.Throws<System.ArgumentNullException>(() => client.Schema.ParseForm(null!));
        }
    }
}
