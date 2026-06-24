using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class TemplateEntityBuilder : BaseEntityBuilder<TemplateEntityBuilder>
    {
        private const string TableName = "MF_Templates";
        private readonly PrimaryKey<TemplateEntityBuilder> _primaryKey = new("PK_MF_Templates", x => x.TemplateId);

        public TemplateEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
        }

        protected override TemplateEntityBuilder BuildTable(ColumnsBuilder table)
        {
            TemplateId = AddAutoIncrementColumn(table, nameof(TemplateId));
            PortalId = AddIntegerColumn(table, nameof(PortalId));
            Slug = AddStringColumn(table, nameof(Slug), 200);
            Name = AddStringColumn(table, nameof(Name), 250);
            Description = AddMaxStringColumn(table, nameof(Description));
            Category = AddStringColumn(table, nameof(Category), 100);
            Icon = AddStringColumn(table, nameof(Icon), 100);
            Version = AddStringColumn(table, nameof(Version), 50);
            Author = AddStringColumn(table, nameof(Author), 250);
            FieldCount = AddIntegerColumn(table, nameof(FieldCount));
            HasCustomHtml = AddBooleanColumn(table, nameof(HasCustomHtml));
            HasCustomJs = AddBooleanColumn(table, nameof(HasCustomJs));
            ThumbnailPath = AddStringColumn(table, nameof(ThumbnailPath), 1000);
            FolderPath = AddStringColumn(table, nameof(FolderPath), 1000);
            MetadataJson = AddMaxStringColumn(table, nameof(MetadataJson));
            JsScanResult = AddMaxStringColumn(table, nameof(JsScanResult));
            IsEnabled = AddBooleanColumn(table, nameof(IsEnabled));
            InstallDate = AddDateTimeColumn(table, nameof(InstallDate));
            InstalledBy = AddIntegerColumn(table, nameof(InstalledBy));
            return this;
        }

        public OperationBuilder<AddColumnOperation> TemplateId { get; set; }
        public OperationBuilder<AddColumnOperation> PortalId { get; set; }
        public OperationBuilder<AddColumnOperation> Slug { get; set; }
        public OperationBuilder<AddColumnOperation> Name { get; set; }
        public OperationBuilder<AddColumnOperation> Description { get; set; }
        public OperationBuilder<AddColumnOperation> Category { get; set; }
        public OperationBuilder<AddColumnOperation> Icon { get; set; }
        public OperationBuilder<AddColumnOperation> Version { get; set; }
        public OperationBuilder<AddColumnOperation> Author { get; set; }
        public OperationBuilder<AddColumnOperation> FieldCount { get; set; }
        public OperationBuilder<AddColumnOperation> HasCustomHtml { get; set; }
        public OperationBuilder<AddColumnOperation> HasCustomJs { get; set; }
        public OperationBuilder<AddColumnOperation> ThumbnailPath { get; set; }
        public OperationBuilder<AddColumnOperation> FolderPath { get; set; }
        public OperationBuilder<AddColumnOperation> MetadataJson { get; set; }
        public OperationBuilder<AddColumnOperation> JsScanResult { get; set; }
        public OperationBuilder<AddColumnOperation> IsEnabled { get; set; }
        public OperationBuilder<AddColumnOperation> InstallDate { get; set; }
        public OperationBuilder<AddColumnOperation> InstalledBy { get; set; }
    }
}
