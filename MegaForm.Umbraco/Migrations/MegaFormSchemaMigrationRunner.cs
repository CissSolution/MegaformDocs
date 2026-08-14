using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Migrations;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Infrastructure.Migrations.Upgrade;

namespace MegaForm.Umbraco.Migrations
{
    /// <summary>
    /// Runs the MegaForm schema migration plan during Umbraco application startup.
    /// This replaces the previous Task.Run hosted-service bootstrap with a native,
    /// tracked Umbraco migration.
    /// </summary>
    public class MegaFormSchemaMigrationRunner : INotificationHandler<UmbracoApplicationStartingNotification>
    {
        private readonly ICoreScopeProvider _coreScopeProvider;
        private readonly IMigrationPlanExecutor _migrationPlanExecutor;
        private readonly IKeyValueService _keyValueService;
        private readonly IRuntimeState _runtimeState;

        public MegaFormSchemaMigrationRunner(
            ICoreScopeProvider coreScopeProvider,
            IMigrationPlanExecutor migrationPlanExecutor,
            IKeyValueService keyValueService,
            IRuntimeState runtimeState)
        {
            _coreScopeProvider = coreScopeProvider;
            _migrationPlanExecutor = migrationPlanExecutor;
            _keyValueService = keyValueService;
            _runtimeState = runtimeState;
        }

        public void Handle(UmbracoApplicationStartingNotification notification)
        {
            if (_runtimeState.Level < RuntimeLevel.Run)
                return;

            var plan = new MegaFormSchemaMigrationPlan();
            var upgrader = new Upgrader(plan);
            upgrader.Execute(_migrationPlanExecutor, _coreScopeProvider, _keyValueService);
        }
    }
}
