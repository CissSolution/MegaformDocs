using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class SubmissionEntityBuilder : BaseEntityBuilder<SubmissionEntityBuilder>
    {
        private const string TableName = "MF_Submissions";
        private readonly PrimaryKey<SubmissionEntityBuilder> _primaryKey = new("PK_MF_Submissions", x => x.SubmissionId);
        private readonly ForeignKey<SubmissionEntityBuilder> _formForeignKey = new("FK_MF_Submissions_MF_Forms", x => x.FormId, "MF_Forms", "FormId", ReferentialAction.Cascade);

        public SubmissionEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
            ForeignKeys.Add(_formForeignKey);
        }

        protected override SubmissionEntityBuilder BuildTable(ColumnsBuilder table)
        {
            SubmissionId = AddAutoIncrementColumn(table, nameof(SubmissionId));
            FormId = AddIntegerColumn(table, nameof(FormId));
            DataJson = AddMaxStringColumn(table, nameof(DataJson));
            IpAddress = AddStringColumn(table, nameof(IpAddress), 100);
            UserAgent = AddStringColumn(table, nameof(UserAgent), 1000);
            UserId = table.Column<int>(nullable: true);
            Status = AddStringColumn(table, nameof(Status), 50);
            IsSpam = AddBooleanColumn(table, nameof(IsSpam));
            SpamScore = table.Column<decimal>(nullable: true);
            SubmittedOnUtc = AddDateTimeColumn(table, nameof(SubmittedOnUtc));
            ReadOnUtc = AddDateTimeColumn(table, nameof(ReadOnUtc), true);
            ModifiedOnUtc = AddDateTimeColumn(table, nameof(ModifiedOnUtc), true);
            ModifiedByUserId = table.Column<int>(nullable: true);
            return this;
        }

        public OperationBuilder<AddColumnOperation> SubmissionId { get; set; }
        public OperationBuilder<AddColumnOperation> FormId { get; set; }
        public OperationBuilder<AddColumnOperation> DataJson { get; set; }
        public OperationBuilder<AddColumnOperation> IpAddress { get; set; }
        public OperationBuilder<AddColumnOperation> UserAgent { get; set; }
        public OperationBuilder<AddColumnOperation> UserId { get; set; }
        public OperationBuilder<AddColumnOperation> Status { get; set; }
        public OperationBuilder<AddColumnOperation> IsSpam { get; set; }
        public OperationBuilder<AddColumnOperation> SpamScore { get; set; }
        public OperationBuilder<AddColumnOperation> SubmittedOnUtc { get; set; }
        public OperationBuilder<AddColumnOperation> ReadOnUtc { get; set; }
        public OperationBuilder<AddColumnOperation> ModifiedOnUtc { get; set; }
        public OperationBuilder<AddColumnOperation> ModifiedByUserId { get; set; }
    }
}
