using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class SubmissionValueEntityBuilder : BaseEntityBuilder<SubmissionValueEntityBuilder>
    {
        private const string TableName = "MF_SubmissionValues";
        private readonly PrimaryKey<SubmissionValueEntityBuilder> _primaryKey = new("PK_MF_SubmissionValues", x => x.ValueId);
        private readonly ForeignKey<SubmissionValueEntityBuilder> _submissionForeignKey = new("FK_MF_SubmissionValues_MF_Submissions", x => x.SubmissionId, "MF_Submissions", "SubmissionId", ReferentialAction.Cascade);

        public SubmissionValueEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
            ForeignKeys.Add(_submissionForeignKey);
        }

        protected override SubmissionValueEntityBuilder BuildTable(ColumnsBuilder table)
        {
            ValueId = AddAutoIncrementColumn(table, nameof(ValueId));
            SubmissionId = AddIntegerColumn(table, nameof(SubmissionId));
            FieldKey = AddStringColumn(table, nameof(FieldKey), 200);
            FieldValue = AddMaxStringColumn(table, nameof(FieldValue));
            return this;
        }

        public OperationBuilder<AddColumnOperation> ValueId { get; set; }
        public OperationBuilder<AddColumnOperation> SubmissionId { get; set; }
        public OperationBuilder<AddColumnOperation> FieldKey { get; set; }
        public OperationBuilder<AddColumnOperation> FieldValue { get; set; }
    }
}
