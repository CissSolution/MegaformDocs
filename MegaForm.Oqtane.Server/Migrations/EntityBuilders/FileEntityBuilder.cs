using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class FileEntityBuilder : BaseEntityBuilder<FileEntityBuilder>
    {
        private const string TableName = "MF_Files";
        private readonly PrimaryKey<FileEntityBuilder> _primaryKey = new("PK_MF_Files", x => x.FileId);
        private readonly ForeignKey<FileEntityBuilder> _submissionForeignKey = new("FK_MF_Files_MF_Submissions", x => x.SubmissionId, "MF_Submissions", "SubmissionId", ReferentialAction.Cascade);

        public FileEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
            ForeignKeys.Add(_submissionForeignKey);
        }

        protected override FileEntityBuilder BuildTable(ColumnsBuilder table)
        {
            FileId = AddAutoIncrementColumn(table, nameof(FileId));
            SubmissionId = AddIntegerColumn(table, nameof(SubmissionId));
            FieldKey = AddStringColumn(table, nameof(FieldKey), 200);
            OriginalName = AddStringColumn(table, nameof(OriginalName), 500);
            StoredPath = AddStringColumn(table, nameof(StoredPath), 1000);
            ContentType = AddStringColumn(table, nameof(ContentType), 200);
            FileSizeBytes = table.Column<long>(nullable: false);
            UploadedOnUtc = AddDateTimeColumn(table, nameof(UploadedOnUtc));
            return this;
        }

        public OperationBuilder<AddColumnOperation> FileId { get; set; }
        public OperationBuilder<AddColumnOperation> SubmissionId { get; set; }
        public OperationBuilder<AddColumnOperation> FieldKey { get; set; }
        public OperationBuilder<AddColumnOperation> OriginalName { get; set; }
        public OperationBuilder<AddColumnOperation> StoredPath { get; set; }
        public OperationBuilder<AddColumnOperation> ContentType { get; set; }
        public OperationBuilder<AddColumnOperation> FileSizeBytes { get; set; }
        public OperationBuilder<AddColumnOperation> UploadedOnUtc { get; set; }
    }
}
