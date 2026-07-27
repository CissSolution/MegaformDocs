using System;
using System.Collections.Generic;
using System.Reflection;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    public class PermissionMatrixEnforcementTests
    {
        private class Phase2Proxy : DispatchProxy
        {
            public List<FormPermissionInfo> Permissions { get; set; } = new List<FormPermissionInfo>();

            protected override object Invoke(MethodInfo targetMethod, object[] args)
            {
                if (targetMethod.Name == nameof(IPhase2Repository.GetFormPermissions))
                    return Permissions;
                throw new NotImplementedException(targetMethod.Name);
            }
        }

        private static PermissionService Service(params FormPermissionInfo[] permissions)
        {
            var repository = DispatchProxy.Create<IPhase2Repository, Phase2Proxy>();
            ((Phase2Proxy)repository).Permissions = new List<FormPermissionInfo>(permissions);
            return new PermissionService(repository);
        }

        private static UserContext User(int id, params string[] roles)
        {
            return new UserContext
            {
                UserId = id,
                UserName = "user-" + id,
                IsAuthenticated = true,
                Roles = new List<string>(roles)
            };
        }

        [Fact]
        public void SpecialPrincipalsMatchAuthenticationState()
        {
            var authenticated = Service(
                new FormPermissionInfo
                {
                    PermissionType = "view",
                    PrincipalType = "special",
                    PrincipalId = "authenticated",
                    IsGranted = true
                });
            Assert.True(authenticated.CanView(1, User(7)));
            Assert.False(authenticated.CanView(1, new UserContext()));

            var anonymous = Service(
                new FormPermissionInfo
                {
                    PermissionType = "view",
                    PrincipalType = "special",
                    PrincipalId = "anonymous",
                    IsGranted = true
                });
            Assert.True(anonymous.CanView(1, new UserContext()));
            Assert.False(anonymous.CanView(1, User(7)));

            var everyone = Service(
                new FormPermissionInfo
                {
                    PermissionType = "view",
                    PrincipalType = "special",
                    PrincipalId = "all_users",
                    IsGranted = true
                });
            Assert.True(everyone.CanView(1, new UserContext()));
            Assert.True(everyone.CanView(1, User(7)));
        }

        [Fact]
        public void ExplicitDenyWinsAndFalseRuleNeverGrants()
        {
            var service = Service(
                new FormPermissionInfo
                {
                    PermissionType = "edit",
                    PrincipalType = "role",
                    PrincipalId = "Editors",
                    IsGranted = true
                },
                new FormPermissionInfo
                {
                    PermissionType = "edit",
                    PrincipalType = "user",
                    PrincipalId = "7",
                    UserId = 7,
                    IsGranted = false
                },
                new FormPermissionInfo
                {
                    PermissionType = "delete",
                    PrincipalType = "role",
                    PrincipalId = "Editors",
                    IsGranted = false
                });

            Assert.False(service.CanEdit(1, User(7, "Editors")));
            Assert.False(service.CanDelete(1, User(8, "Editors")));
        }

        [Fact]
        public void ManageGrantActsAsUnrestrictedMatrixGrant()
        {
            var service = Service(
                new FormPermissionInfo
                {
                    PermissionType = "manage",
                    PrincipalType = "role",
                    PrincipalId = "Form Managers",
                    IsGranted = true
                });
            var actor = User(11, "Form Managers");
            var row = new SubmissionInfo { FormId = 1, UserId = 99, DataJson = "{}" };

            Assert.True(service.CanManage(1, actor));
            Assert.True(service.CanEdit(1, actor));
            Assert.True(service.CanDeleteSubmission(1, row, actor));
            Assert.True(service.CanExportSubmission(1, row, actor));
            Assert.True(service.CanApprove(1, actor));
        }

        [Fact]
        public void ApproveAndManageRequireExplicitGrant()
        {
            var service = Service();
            var actor = User(11, "Reviewers");

            Assert.False(service.CanApprove(1, actor));
            Assert.False(service.CanManage(1, actor));
        }

        [Fact]
        public void OwnAndTeamScopesAreAppliedPerSubmission()
        {
            var actor = User(7, "Sales");
            var ownService = Service(
                new FormPermissionInfo
                {
                    PermissionType = "view",
                    PrincipalType = "role",
                    PrincipalId = "Sales",
                    Scope = "own",
                    IsGranted = true
                });
            Assert.True(ownService.CanViewSubmission(
                1, new SubmissionInfo { FormId = 1, UserId = 7, DataJson = "{}" }, actor));
            Assert.False(ownService.CanViewSubmission(
                1, new SubmissionInfo { FormId = 1, UserId = 8, DataJson = "{}" }, actor));

            var teamService = Service(
                new FormPermissionInfo
                {
                    PermissionType = "export",
                    PrincipalType = "role",
                    PrincipalId = "Sales",
                    Scope = "team:department",
                    IsGranted = true
                });
            Assert.True(teamService.CanExportSubmission(
                1,
                new SubmissionInfo { FormId = 1, DataJson = "{\"department\":\"Sales\"}" },
                actor));
            Assert.False(teamService.CanExportSubmission(
                1,
                new SubmissionInfo { FormId = 1, DataJson = "{\"department\":\"Finance\"}" },
                actor));
        }
    }
}
