using System;
using System.Collections.Generic;
using System.Reflection;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.Services.TypedSubmission;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [OwnerRlsSql v20260722-02] Tests for PermissionService.IsOwnOnlyViewScope — the gate that
    /// decides whether the per-row "own" RLS predicate may be pushed down to SQL in list endpoints.
    /// </summary>
    public class PermissionServiceTests
    {
        private class FakePhase2RepositoryProxy : DispatchProxy
        {
            public List<FormPermissionInfo> Permissions { get; set; } = new List<FormPermissionInfo>();

            protected override object Invoke(MethodInfo targetMethod, object[] args)
            {
                if (targetMethod.Name == nameof(IPhase2Repository.GetFormPermissions))
                    return Permissions;
                throw new NotImplementedException(targetMethod.Name);
            }
        }

        private static PermissionService CreateService(List<FormPermissionInfo> perms)
            => CreateService(perms, null);

        private static PermissionService CreateService(List<FormPermissionInfo> perms, ISubmissionDataStore typedStore)
        {
            var proxy = DispatchProxy.Create<IPhase2Repository, FakePhase2RepositoryProxy>();
            ((FakePhase2RepositoryProxy)proxy).Permissions = perms ?? new List<FormPermissionInfo>();
            return new PermissionService(proxy, typedStore == null ? null : new SubmissionDataResolver(typedStore));
        }

        private static UserContext User(int userId = 42, params string[] roles) => new UserContext
        {
            UserId = userId,
            UserName = "user" + userId,
            IsAuthenticated = true,
            Roles = new List<string>(roles ?? Array.Empty<string>())
        };

        [Fact]
        public void OwnOnlyViewScope_AllMatchingGrantsAreOwn_ReturnsTrue()
        {
            var svc = CreateService(new List<FormPermissionInfo>
            {
                new FormPermissionInfo { PermissionType = "view", RoleName = "Customers", Scope = "own", IsGranted = true },
                new FormPermissionInfo { PermissionType = "view", UserId = 42, Scope = "Own", IsGranted = true }, // case-insensitive
                new FormPermissionInfo { PermissionType = "edit", RoleName = "Customers", Scope = "all", IsGranted = true }, // not "view" — ignored
            });
            Assert.True(svc.IsOwnOnlyViewScope(1, User(42, "Customers")));
        }

        [Fact]
        public void OwnOnlyViewScope_AnyAllGrant_ReturnsFalse()
        {
            var svc = CreateService(new List<FormPermissionInfo>
            {
                new FormPermissionInfo { PermissionType = "view", RoleName = "Customers", Scope = "own", IsGranted = true },
                new FormPermissionInfo { PermissionType = "view", RoleName = "Support", Scope = "all", IsGranted = true },
            });
            Assert.False(svc.IsOwnOnlyViewScope(1, User(42, "Customers", "Support")));
        }

        [Fact]
        public void OwnOnlyViewScope_NullScopeCountsAsAll_ReturnsFalse()
        {
            var svc = CreateService(new List<FormPermissionInfo>
            {
                new FormPermissionInfo { PermissionType = "view", RoleName = "Customers", Scope = null, IsGranted = true },
            });
            Assert.False(svc.IsOwnOnlyViewScope(1, User(42, "Customers")));
        }

        [Fact]
        public void OwnOnlyViewScope_NoMatchingGrant_ReturnsFalse()
        {
            var svc = CreateService(new List<FormPermissionInfo>
            {
                new FormPermissionInfo { PermissionType = "view", RoleName = "SomeoneElse", Scope = "own", IsGranted = true },
            });
            Assert.False(svc.IsOwnOnlyViewScope(1, User(42, "Customers")));
        }

        [Fact]
        public void OwnOnlyViewScope_AnonymousOrAdmin_ReturnsFalse()
        {
            var svc = CreateService(new List<FormPermissionInfo>
            {
                new FormPermissionInfo { PermissionType = "view", RoleName = "Customers", Scope = "own", IsGranted = true },
            });
            Assert.False(svc.IsOwnOnlyViewScope(1, null));
            Assert.False(svc.IsOwnOnlyViewScope(1, new UserContext()));
            Assert.False(svc.IsOwnOnlyViewScope(1, new UserContext { UserId = 1, IsAuthenticated = true, IsAdmin = true }));
            Assert.False(svc.IsOwnOnlyViewScope(1, new UserContext { UserId = 1, IsAuthenticated = true, IsSuperUser = true }));
        }

        [Fact]
        public void TeamScope_UsesTypedDataWhenLegacyJsonIsCollapsed()
        {
            var svc = CreateService(new List<FormPermissionInfo>
            {
                new FormPermissionInfo
                {
                    PermissionType = "view",
                    RoleName = "Support",
                    Scope = "team:department",
                    IsGranted = true
                }
            }, new TypedDataStore(new Dictionary<string, object> { ["department"] = "Support" }));

            var submission = new SubmissionInfo
            {
                SubmissionId = 17,
                FormId = 1,
                DataJson = "{}"
            };

            Assert.True(svc.CanViewSubmission(1, submission, User(42, "Support")));
            Assert.False(svc.CanViewSubmission(1, submission, User(42, "Sales")));
        }

        private sealed class TypedDataStore : ISubmissionDataStore
        {
            private readonly Dictionary<string, object> _data;

            public TypedDataStore(Dictionary<string, object> data) => _data = data;

            public bool SupportsDataJsonCollapse => true;
            public SubmissionDataDocument GetData(int submissionId) => new SubmissionDataDocument
            {
                SubmissionId = submissionId,
                FormId = 1,
                Data = new Dictionary<string, object>(_data, StringComparer.OrdinalIgnoreCase)
            };
            public bool HasFields(int submissionId) => true;
            public IReadOnlyList<SubmissionFieldRecord> GetFields(int submissionId) => Array.Empty<SubmissionFieldRecord>();
            public IReadOnlyList<SubmissionValueStringRecord> GetStringValues(long submissionFieldId) => Array.Empty<SubmissionValueStringRecord>();
            public IReadOnlyList<SubmissionValueLongTextRecord> GetLongTextValues(long submissionFieldId) => Array.Empty<SubmissionValueLongTextRecord>();
            public IReadOnlyList<SubmissionValueNumberRecord> GetNumberValues(long submissionFieldId) => Array.Empty<SubmissionValueNumberRecord>();
            public IReadOnlyList<SubmissionValueDateRecord> GetDateValues(long submissionFieldId) => Array.Empty<SubmissionValueDateRecord>();
            public IReadOnlyList<SubmissionValueBooleanRecord> GetBooleanValues(long submissionFieldId) => Array.Empty<SubmissionValueBooleanRecord>();
            public IReadOnlyList<SubmissionValueJsonRecord> GetJsonValues(long submissionFieldId) => Array.Empty<SubmissionValueJsonRecord>();
            public void InsertFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields) { }
            public void ReplaceFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields) { }
            public void DeleteFields(int submissionId) { }
        }
    }
}
