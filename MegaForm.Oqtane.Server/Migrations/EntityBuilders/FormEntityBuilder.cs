using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class FormEntityBuilder : BaseEntityBuilder<FormEntityBuilder>
    {
        private const string TableName = "MF_Forms";
        private readonly PrimaryKey<FormEntityBuilder> _primaryKey = new("PK_MF_Forms", x => x.FormId);
        private readonly ForeignKey<FormEntityBuilder> _moduleForeignKey = new("FK_MF_Forms_Module", x => x.ModuleId, "Module", "ModuleId", ReferentialAction.Cascade);

        public FormEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
            ForeignKeys.Add(_moduleForeignKey);
        }

        protected override FormEntityBuilder BuildTable(ColumnsBuilder table)
        {
            FormId = AddAutoIncrementColumn(table, nameof(FormId));
            ModuleId = AddIntegerColumn(table, nameof(ModuleId));
            PortalId = AddIntegerColumn(table, nameof(PortalId));
            Title = AddStringColumn(table, nameof(Title), 500);
            Description = AddMaxStringColumn(table, nameof(Description));
            SchemaJson = AddMaxStringColumn(table, nameof(SchemaJson));
            SettingsJson = AddMaxStringColumn(table, nameof(SettingsJson));
            ThemeJson = AddMaxStringColumn(table, nameof(ThemeJson));
            Status = AddStringColumn(table, nameof(Status), 50);
            SubmitButtonText = AddStringColumn(table, nameof(SubmitButtonText), 200);
            SuccessMessage = AddMaxStringColumn(table, nameof(SuccessMessage));
            RedirectUrl = AddStringColumn(table, nameof(RedirectUrl), 2000);
            MaxSubmissions = table.Column<int>(nullable: true);
            ExpiresOnUtc = AddDateTimeColumn(table, nameof(ExpiresOnUtc), true);
            RequireAuth = AddBooleanColumn(table, nameof(RequireAuth));
            EnableCaptcha = AddBooleanColumn(table, nameof(EnableCaptcha));
            EnableSaveResume = AddBooleanColumn(table, nameof(EnableSaveResume));
            WebhookUrl = AddStringColumn(table, nameof(WebhookUrl), 2000);
            WebhookSecret = AddStringColumn(table, nameof(WebhookSecret), 500);
            WebhookHeaders = AddMaxStringColumn(table, nameof(WebhookHeaders));
            NotifyEmails = AddMaxStringColumn(table, nameof(NotifyEmails));
            NotifyTemplate = AddMaxStringColumn(table, nameof(NotifyTemplate));
            AutoresponderEnabled = AddBooleanColumn(table, nameof(AutoresponderEnabled));
            AutoresponderEmailField = AddStringColumn(table, nameof(AutoresponderEmailField), 200);
            AutoresponderSubject = AddStringColumn(table, nameof(AutoresponderSubject), 500);
            AutoresponderBody = AddMaxStringColumn(table, nameof(AutoresponderBody));
            CreatedByUserId = AddIntegerColumn(table, nameof(CreatedByUserId));
            CreatedOnUtc = AddDateTimeColumn(table, nameof(CreatedOnUtc));
            UpdatedByUserId = table.Column<int>(nullable: true);
            UpdatedOnUtc = AddDateTimeColumn(table, nameof(UpdatedOnUtc), true);
            AppScope = AddStringColumn(table, nameof(AppScope), 200);
            RulesJson = AddMaxStringColumn(table, nameof(RulesJson));
            WorkflowJson = AddMaxStringColumn(table, nameof(WorkflowJson));
            return this;
        }

        public OperationBuilder<AddColumnOperation> FormId { get; set; }
        public OperationBuilder<AddColumnOperation> ModuleId { get; set; }
        public OperationBuilder<AddColumnOperation> PortalId { get; set; }
        public OperationBuilder<AddColumnOperation> Title { get; set; }
        public OperationBuilder<AddColumnOperation> Description { get; set; }
        public OperationBuilder<AddColumnOperation> SchemaJson { get; set; }
        public OperationBuilder<AddColumnOperation> SettingsJson { get; set; }
        public OperationBuilder<AddColumnOperation> ThemeJson { get; set; }
        public OperationBuilder<AddColumnOperation> Status { get; set; }
        public OperationBuilder<AddColumnOperation> SubmitButtonText { get; set; }
        public OperationBuilder<AddColumnOperation> SuccessMessage { get; set; }
        public OperationBuilder<AddColumnOperation> RedirectUrl { get; set; }
        public OperationBuilder<AddColumnOperation> MaxSubmissions { get; set; }
        public OperationBuilder<AddColumnOperation> ExpiresOnUtc { get; set; }
        public OperationBuilder<AddColumnOperation> RequireAuth { get; set; }
        public OperationBuilder<AddColumnOperation> EnableCaptcha { get; set; }
        public OperationBuilder<AddColumnOperation> EnableSaveResume { get; set; }
        public OperationBuilder<AddColumnOperation> WebhookUrl { get; set; }
        public OperationBuilder<AddColumnOperation> WebhookSecret { get; set; }
        public OperationBuilder<AddColumnOperation> WebhookHeaders { get; set; }
        public OperationBuilder<AddColumnOperation> NotifyEmails { get; set; }
        public OperationBuilder<AddColumnOperation> NotifyTemplate { get; set; }
        public OperationBuilder<AddColumnOperation> AutoresponderEnabled { get; set; }
        public OperationBuilder<AddColumnOperation> AutoresponderEmailField { get; set; }
        public OperationBuilder<AddColumnOperation> AutoresponderSubject { get; set; }
        public OperationBuilder<AddColumnOperation> AutoresponderBody { get; set; }
        public OperationBuilder<AddColumnOperation> CreatedByUserId { get; set; }
        public OperationBuilder<AddColumnOperation> CreatedOnUtc { get; set; }
        public OperationBuilder<AddColumnOperation> UpdatedByUserId { get; set; }
        public OperationBuilder<AddColumnOperation> UpdatedOnUtc { get; set; }
        public OperationBuilder<AddColumnOperation> AppScope { get; set; }
        public OperationBuilder<AddColumnOperation> RulesJson { get; set; }
        public OperationBuilder<AddColumnOperation> WorkflowJson { get; set; }
    }
}
