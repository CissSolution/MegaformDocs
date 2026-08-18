using System;
using Umbraco.Cms.Infrastructure.Migrations;

namespace MegaForm.Umbraco.Migrations
{
    /// <summary>
    /// Umbraco migration plan for the MegaForm package schema.
    /// Tracks MegaForm database schema versions via Umbraco's migration log.
    /// </summary>
    public class MegaFormSchemaMigrationPlan : MigrationPlan
    {
        public const string PlanName = "MegaFormSchema";

        public MegaFormSchemaMigrationPlan()
            : base(PlanName)
        {
            DefinePlan();
        }

        protected void DefinePlan()
        {
            From(string.Empty)
                .To<InitialMegaFormSchemaMigration>("megaform-schema-initial")
                .To<AddWorkflowLibraryTablesMigration>("megaform-schema-workflow-library")
                // [TypedStorage F1 2026-07-18] New step so EXISTING sites (already at the
                // workflow-library state) get the 7 typed-submission tables on upgrade.
                .To<AddTypedSubmissionTablesMigration>("megaform-schema-typed-submission")
                // [CloudReady A2 v20260806] Durable timer columns (Delay + scanner lease +
                // one-shot overdue reminder marker) for existing sites.
                .To<AddWorkflowTimerColumnsMigration>("megaform-schema-workflow-timer")
                // [ATBE P1] External-table binding tables (MF_ExternalBinding +
                // MF_ExternalRowMap) for existing sites.
                .To<AddExternalTableTablesMigration>("megaform-schema-external-tables")
                // [PrevalueSource v20260816] Shared catalog of reusable option sources.
                .To<AddPrevalueSourceTableMigration>("megaform-schema-prevalue-sources")
                // [DataSources v20260818] Shared catalog of named database sources.
                .To<AddDataSourceTableMigration>("megaform-schema-data-sources");
        }
    }
}
