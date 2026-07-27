using System;
using System.Collections.Generic;
using System.Reflection;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
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
        {
            var proxy = DispatchProxy.Create<IPhase2Repository, FakePhase2RepositoryProxy>();
            ((FakePhase2RepositoryProxy)proxy).Permissions = perms ?? new List<FormPermissionInfo>();
            return new PermissionService(proxy);
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
    }
}
