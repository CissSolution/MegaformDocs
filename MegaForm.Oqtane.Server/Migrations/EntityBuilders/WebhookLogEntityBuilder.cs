using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class WebhookLogEntityBuilder : BaseEntityBuilder<WebhookLogEntityBuilder>
    {
        private const string TableName = "MF_WebhookLog";
        private readonly PrimaryKey<WebhookLogEntityBuilder> _primaryKey = new("PK_MF_WebhookLog", x => x.LogId);
        private readonly ForeignKey<WebhookLogEntityBuilder> _formForeignKey = new("FK_MF_WebhookLog_MF_Forms", x => x.FormId, "MF_Forms", "FormId", ReferentialAction.Cascade);
        private readonly ForeignKey<WebhookLogEntityBuilder> _submissionForeignKey = new("FK_MF_WebhookLog_MF_Submissions", x => x.SubmissionId, "MF_Submissions", "SubmissionId", ReferentialAction.NoAction);

        public WebhookLogEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
            ForeignKeys.Add(_formForeignKey);
            ForeignKeys.Add(_submissionForeignKey);
        }

        protected override WebhookLogEntityBuilder BuildTable(ColumnsBuilder table)
        {
            LogId = AddAutoIncrementColumn(table, nameof(LogId));
            FormId = AddIntegerColumn(table, nameof(FormId));
            SubmissionId = AddIntegerColumn(table, nameof(SubmissionId));
            WebhookUrl = AddStringColumn(table, nameof(WebhookUrl), 2000);
            RequestBody = AddMaxStringColumn(table, nameof(RequestBody));
            ResponseCode = table.Column<int>(nullable: true);
            ResponseBody = AddMaxStringColumn(table, nameof(ResponseBody));
            Success = AddBooleanColumn(table, nameof(Success));
            RetryCount = AddIntegerColumn(table, nameof(RetryCount));
            CreatedOnUtc = AddDateTimeColumn(table, nameof(CreatedOnUtc));
            return this;
        }

        public OperationBuilder<AddColumnOperation> LogId { get; set; }
        public OperationBuilder<AddColumnOperation> FormId { get; set; }
        public OperationBuilder<AddColumnOperation> SubmissionId { get; set; }
        public OperationBuilder<AddColumnOperation> WebhookUrl { get; set; }
        public OperationBuilder<AddColumnOperation> RequestBody { get; set; }
        public OperationBuilder<AddColumnOperation> ResponseCode { get; set; }
        public OperationBuilder<AddColumnOperation> ResponseBody { get; set; }
        public OperationBuilder<AddColumnOperation> Success { get; set; }
        public OperationBuilder<AddColumnOperation> RetryCount { get; set; }
        public OperationBuilder<AddColumnOperation> CreatedOnUtc { get; set; }
    }
}
