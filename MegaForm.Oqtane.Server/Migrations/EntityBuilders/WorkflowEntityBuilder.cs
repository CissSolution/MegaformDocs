using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class WorkflowEntityBuilder : BaseEntityBuilder<WorkflowEntityBuilder>
    {
        private const string TableName = "MF_Workflows";
        private readonly PrimaryKey<WorkflowEntityBuilder> _primaryKey = new("PK_MF_Workflows", x => x.WorkflowId);
        private readonly ForeignKey<WorkflowEntityBuilder> _formForeignKey = new("FK_MF_Workflows_MF_Forms", x => x.FormId, "MF_Forms", "FormId", ReferentialAction.Cascade);

        public WorkflowEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
            ForeignKeys.Add(_formForeignKey);
        }

        protected override WorkflowEntityBuilder BuildTable(ColumnsBuilder table)
        {
            WorkflowId = AddAutoIncrementColumn(table, nameof(WorkflowId));
            FormId = AddIntegerColumn(table, nameof(FormId));
            WorkflowName = AddStringColumn(table, nameof(WorkflowName), 250);
            Description = AddMaxStringColumn(table, nameof(Description));
            TriggerType = AddStringColumn(table, nameof(TriggerType), 100);
            TriggerConfig = AddMaxStringColumn(table, nameof(TriggerConfig));
            StepsJson = AddMaxStringColumn(table, nameof(StepsJson));
            IsEnabled = AddBooleanColumn(table, nameof(IsEnabled));
            Version = AddIntegerColumn(table, nameof(Version));
            CreatedByUserId = AddIntegerColumn(table, nameof(CreatedByUserId));
            CreatedOnUtc = AddDateTimeColumn(table, nameof(CreatedOnUtc));
            ModifiedOnUtc = AddDateTimeColumn(table, nameof(ModifiedOnUtc), true);
            return this;
        }

        public OperationBuilder<AddColumnOperation> WorkflowId { get; set; }
        public OperationBuilder<AddColumnOperation> FormId { get; set; }
        public OperationBuilder<AddColumnOperation> WorkflowName { get; set; }
        public OperationBuilder<AddColumnOperation> Description { get; set; }
        public OperationBuilder<AddColumnOperation> TriggerType { get; set; }
        public OperationBuilder<AddColumnOperation> TriggerConfig { get; set; }
        public OperationBuilder<AddColumnOperation> StepsJson { get; set; }
        public OperationBuilder<AddColumnOperation> IsEnabled { get; set; }
        public OperationBuilder<AddColumnOperation> Version { get; set; }
        public OperationBuilder<AddColumnOperation> CreatedByUserId { get; set; }
        public OperationBuilder<AddColumnOperation> CreatedOnUtc { get; set; }
        public OperationBuilder<AddColumnOperation> ModifiedOnUtc { get; set; }
    }
}
