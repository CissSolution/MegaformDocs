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
    /// [ExportFailClosed v20260728-01] Tests for PermissionService.CanBulkExport — the gate the
    /// CSV/JSON dump endpoints use on all four hosts. Each test also asserts what CanExport says
    /// about the same input, because the whole point of the new method is that the two disagree
    /// exactly where an unbounded PII dump must not inherit the "no rules = open" fallback.
    /// </summary>
    public class BulkExportPermissionTests
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

        private static UserContext SignedIn(int userId = 42, params string[] roles) => new UserContext
        {
            UserId = userId,
            UserName = "user" + userId,
            IsAuthenticated = true,
            Roles = new List<string>(roles ?? Array.Empty<string>())
        };

        private static UserContext Anonymous() => new UserContext { UserId = 0, IsAuthenticated = false };

        [Fact]
        public void NoRulesConfigured_SignedInUser_IsDeniedEvenThoughCanExportAllows()
        {
            var svc = CreateService(new List<FormPermissionInfo>());
            var actor = SignedIn();

            Assert.True(svc.CanExport(1, actor));          // legacy fallback: "no restrictions = open"
            Assert.False(svc.CanBulkExport(1, actor));     // a whole-table dump does not inherit it
        }

        [Fact]
        public void NoRulesConfigured_Anonymous_IsDenied()
        {
            var svc = CreateService(new List<FormPermissionInfo>());

            Assert.False(svc.CanBulkExport(1, Anonymous()));
            Assert.False(svc.CanBulkExport(1, null));
        }

        [Fact]
        public void NoRulesConfigured_AdminAndSuperUser_StillAllowed()
        {
            var svc = CreateService(new List<FormPermissionInfo>());

            Assert.True(svc.CanBulkExport(1, new UserContext { UserId = 1, IsAuthenticated = true, IsAdmin = true }));
            Assert.True(svc.CanBulkExport(1, new UserContext { UserId = 2, IsAuthenticated = true, IsSuperUser = true }));
        }

        [Fact]
        public void AllUsersGrant_DoesNotReachAnonymousCaller()
        {
            // "all_users" matches an anonymous visitor by design (MatchesPrincipal), which is
            // acceptable for reading one record behind a row-level gate but never for a dump.
            var svc = CreateService(new List<FormPermissionInfo>
            {
                new FormPermissionInfo { PermissionType = "export", PrincipalType = "special", PrincipalId = "all_users", IsGranted = true },
            });

            Assert.True(svc.CanExport(1, Anonymous()));
            Assert.False(svc.CanBulkExport(1, Anonymous()));
            Assert.True(svc.CanBulkExport(1, SignedIn()));
        }

        [Fact]
        public void ExplicitRoleGrant_AllowsMatchingSignedInUser()
        {
            var svc = CreateService(new List<FormPermissionInfo>
            {
                new FormPermissionInfo { PermissionType = "export", RoleName = "Support", IsGranted = true },
            });

            Assert.True(svc.CanBulkExport(1, SignedIn(42, "Support")));
            Assert.False(svc.CanBulkExport(1, SignedIn(43, "Customers")));
        }

        [Fact]
        public void ManageGrant_CoversExport()
        {
            var svc = CreateService(new List<FormPermissionInfo>
            {
                new FormPermissionInfo { PermissionType = "manage", RoleName = "Support", IsGranted = true },
            });

            Assert.True(svc.CanBulkExport(1, SignedIn(42, "Support")));
        }

        [Fact]
        public void ExplicitDeny_BeatsGrant()
        {
            var svc = CreateService(new List<FormPermissionInfo>
            {
                new FormPermissionInfo { PermissionType = "export", RoleName = "Support", IsGranted = true },
                new FormPermissionInfo { PermissionType = "export", UserId = 42, IsGranted = false },
            });

            Assert.False(svc.CanBulkExport(1, SignedIn(42, "Support")));
        }

        [Fact]
        public void HostThatOnlyPopulatesUserId_IsStillTreatedAsSignedIn()
        {
            // DNN derives IsAuthenticated from UserID; guard against a host that leaves the flag unset.
            var svc = CreateService(new List<FormPermissionInfo>
            {
                new FormPermissionInfo { PermissionType = "export", RoleName = "Support", IsGranted = true },
            });
            var actor = new UserContext { UserId = 42, IsAuthenticated = false, Roles = new List<string> { "Support" } };

            Assert.True(svc.CanBulkExport(1, actor));
        }
    }
}
