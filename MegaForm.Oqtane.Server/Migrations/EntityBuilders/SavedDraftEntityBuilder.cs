using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class SavedDraftEntityBuilder : BaseEntityBuilder<SavedDraftEntityBuilder>
    {
        private const string TableName = "MF_SavedDrafts";
        private readonly PrimaryKey<SavedDraftEntityBuilder> _primaryKey = new("PK_MF_SavedDrafts", x => x.DraftId);
        private readonly ForeignKey<SavedDraftEntityBuilder> _formForeignKey = new("FK_MF_SavedDrafts_MF_Forms", x => x.FormId, "MF_Forms", "FormId", ReferentialAction.Cascade);

        public SavedDraftEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
            ForeignKeys.Add(_formForeignKey);
        }

        protected override SavedDraftEntityBuilder BuildTable(ColumnsBuilder table)
        {
            DraftId = AddAutoIncrementColumn(table, nameof(DraftId));
            FormId = AddIntegerColumn(table, nameof(FormId));
            ResumeToken = AddStringColumn(table, nameof(ResumeToken), 200);
            DataJson = AddMaxStringColumn(table, nameof(DataJson));
            Email = AddStringColumn(table, nameof(Email), 256);
            IpAddress = AddStringColumn(table, nameof(IpAddress), 100);
            CreatedOnUtc = AddDateTimeColumn(table, nameof(CreatedOnUtc));
            ExpiresOnUtc = AddDateTimeColumn(table, nameof(ExpiresOnUtc));
            return this;
        }

        public OperationBuilder<AddColumnOperation> DraftId { get; set; }
        public OperationBuilder<AddColumnOperation> FormId { get; set; }
        public OperationBuilder<AddColumnOperation> ResumeToken { get; set; }
        public OperationBuilder<AddColumnOperation> DataJson { get; set; }
        public OperationBuilder<AddColumnOperation> Email { get; set; }
        public OperationBuilder<AddColumnOperation> IpAddress { get; set; }
        public OperationBuilder<AddColumnOperation> CreatedOnUtc { get; set; }
        public OperationBuilder<AddColumnOperation> ExpiresOnUtc { get; set; }
    }
}
