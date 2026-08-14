using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    public class TypedSubmissionQueryTests
    {
        [Fact]
        public void Core_routes_search_and_filters_to_typed_repository_before_paging()
        {
            var forms = new InMemoryFormRepository();
            var formId = forms.SaveForm(new FormInfo { PortalId = 7, Title = "Tickets", SchemaJson = "{\"fields\":[]}" });
            var repository = new CapturingTypedRepository(formId);
            var service = new SubmissionQueryService(repository, forms);
            var filter = new MegaForm.Core.Models.SubmissionFieldFilter
            {
                FieldKey = "priority",
                DataType = SubmissionDataType.Number,
                Operator = MegaForm.Core.Models.SubmissionFieldFilterOperator.GreaterThanOrEqual,
                NumberValue = 3
            };

            var result = service.List(new SubmissionListQuery
            {
                FormId = formId,
                UserId = 42,
                Search = "billing",
                PageIndex = 2,
                PageSize = 25,
                FieldFilters = new List<MegaForm.Core.Models.SubmissionFieldFilter> { filter }
            });

            Assert.Equal(1, repository.TypedCalls);
            Assert.Equal(0, repository.LegacyCalls);
            Assert.NotNull(repository.LastQuery);
            Assert.Equal(42, repository.LastQuery.UserId);
            Assert.Equal(2, repository.LastQuery.PageIndex);
            Assert.Same(filter, repository.LastQuery.FieldFilters.Single());
            Assert.Equal(123, result.TotalCount);
        }

        [Fact]
        public void Core_rejects_string_operators_for_number_fields()
        {
            var forms = new InMemoryFormRepository();
            var formId = forms.SaveForm(new FormInfo { PortalId = 7, Title = "Tickets", SchemaJson = "{\"fields\":[]}" });
            var repository = new CapturingTypedRepository(formId);
            var service = new SubmissionQueryService(repository, forms);

            Assert.Throws<NotSupportedException>(() => service.List(new SubmissionListQuery
            {
                FormId = formId,
                FieldFilters = new List<MegaForm.Core.Models.SubmissionFieldFilter>
                {
                    new MegaForm.Core.Models.SubmissionFieldFilter
                    {
                        FieldKey = "priority",
                        DataType = SubmissionDataType.Number,
                        Operator = MegaForm.Core.Models.SubmissionFieldFilterOperator.Contains,
                        NumberValue = 3
                    }
                }
            }));
            Assert.Equal(0, repository.TypedCalls);
        }

        [Fact]
        public void Core_does_not_silently_ignore_filters_on_legacy_repositories()
        {
            var forms = new InMemoryFormRepository();
            var repository = new LegacyOnlyRepository();
            var service = new SubmissionQueryService(repository, forms);

            var error = Assert.Throws<NotSupportedException>(() => service.List(new SubmissionListQuery
            {
                FormId = 7,
                FieldFilters = new List<MegaForm.Core.Models.SubmissionFieldFilter>
                {
                    new MegaForm.Core.Models.SubmissionFieldFilter
                    {
                        FieldKey = "priority",
                        TextValue = "urgent"
                    }
                }
            }));

            Assert.Contains("does not support typed field filters", error.Message);
            Assert.Equal(0, repository.LegacyCalls);
        }

        [Fact]
        public async Task Sdk_maps_typed_filter_contract_to_core_query()
        {
            var forms = new InMemoryFormRepository();
            var formId = forms.SaveForm(new FormInfo { PortalId = 7, Title = "Tickets", SchemaJson = "{\"fields\":[]}" });
            var repository = new CapturingTypedRepository(formId);
            var client = new MegaFormClient(forms, repository);

            await client.SearchAsync(new SubmissionSearchQuery
            {
                FormId = formId,
                Page = 1,
                PageSize = 20,
                FieldFilters = new[]
                {
                    new MegaForm.Sdk.SubmissionFieldFilter
                    {
                        FieldKey = "created_at",
                        DataType = SubmissionFieldDataType.Date,
                        Operator = MegaForm.Sdk.SubmissionFieldFilterOperator.LessThan,
                        DateValue = new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc)
                    }
                }
            }, new MegaFormScope { PortalId = 7 });

            var mapped = Assert.Single(repository.LastQuery.FieldFilters);
            Assert.Equal(SubmissionDataType.Date, mapped.DataType);
            Assert.Equal(MegaForm.Core.Models.SubmissionFieldFilterOperator.LessThan, mapped.Operator);
            Assert.Equal(new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc), mapped.DateValue);
        }

        private sealed class CapturingTypedRepository : ISubmissionRepository, ISubmissionTypedQueryRepository
        {
            private readonly int _formId;

            public CapturingTypedRepository(int formId) => _formId = formId;

            public int TypedCalls { get; private set; }
            public int LegacyCalls { get; private set; }
            public SubmissionListQuery LastQuery { get; private set; }

            public (List<SubmissionInfo> Items, int TotalCount) ListTyped(SubmissionListQuery query)
            {
                TypedCalls++;
                LastQuery = query;
                return (new List<SubmissionInfo>
                {
                    new SubmissionInfo
                    {
                        SubmissionId = 9,
                        FormId = _formId,
                        Status = "new",
                        DataJson = "{\"priority\":4}",
                        SubmittedOnUtc = new DateTime(2026, 8, 14, 0, 0, 0, DateTimeKind.Utc)
                    }
                }, 123);
            }

            public (List<SubmissionInfo> Items, int TotalCount) List(int formId, string status = null, string search = null,
                DateTime? dateFrom = null, DateTime? dateTo = null, int pageIndex = 0, int pageSize = 50)
            {
                LegacyCalls++;
                return (new List<SubmissionInfo>(), 0);
            }

            public int Insert(SubmissionInfo sub) => throw new NotSupportedException();
            public SubmissionInfo Get(int submissionId) => null;
            public List<SubmissionValueInfo> GetValues(int submissionId) => new List<SubmissionValueInfo>();
            public void UpdateStatus(int submissionId, string status) => throw new NotSupportedException();
            public void UpdateData(int submissionId, string dataJson) => throw new NotSupportedException();
            public void Delete(int submissionId) => throw new NotSupportedException();
            public void BulkDelete(int formId, int[] submissionIds) => throw new NotSupportedException();
            public void InsertValues(int submissionId, List<SubmissionValueInfo> values) => throw new NotSupportedException();
        }

        private sealed class LegacyOnlyRepository : ISubmissionRepository
        {
            public int LegacyCalls { get; private set; }

            public (List<SubmissionInfo> Items, int TotalCount) List(int formId, string status = null, string search = null,
                DateTime? dateFrom = null, DateTime? dateTo = null, int pageIndex = 0, int pageSize = 50)
            {
                LegacyCalls++;
                return (new List<SubmissionInfo>(), 0);
            }

            public int Insert(SubmissionInfo sub) => throw new NotSupportedException();
            public SubmissionInfo Get(int submissionId) => null;
            public List<SubmissionValueInfo> GetValues(int submissionId) => new List<SubmissionValueInfo>();
            public void UpdateStatus(int submissionId, string status) => throw new NotSupportedException();
            public void UpdateData(int submissionId, string dataJson) => throw new NotSupportedException();
            public void Delete(int submissionId) => throw new NotSupportedException();
            public void BulkDelete(int formId, int[] submissionIds) => throw new NotSupportedException();
            public void InsertValues(int submissionId, List<SubmissionValueInfo> values) => throw new NotSupportedException();
        }
    }
}
