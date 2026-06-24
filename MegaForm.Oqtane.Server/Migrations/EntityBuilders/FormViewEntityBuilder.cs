using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class FormViewEntityBuilder : BaseEntityBuilder<FormViewEntityBuilder>
    {
        private const string TableName = "MF_Views";
        private readonly PrimaryKey<FormViewEntityBuilder> _primaryKey = new("PK_MF_Views", x => x.ViewId);
        private readonly ForeignKey<FormViewEntityBuilder> _formForeignKey = new("FK_MF_Views_MF_Forms", x => x.FormId, "MF_Forms", "FormId", ReferentialAction.Cascade);

        public FormViewEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
            ForeignKeys.Add(_formForeignKey);
        }

        protected override FormViewEntityBuilder BuildTable(ColumnsBuilder table)
        {
            ViewId = AddAutoIncrementColumn(table, nameof(ViewId));
            FormId = AddIntegerColumn(table, nameof(FormId));
            ViewKey = AddStringColumn(table, nameof(ViewKey), 100);
            ViewType = AddStringColumn(table, nameof(ViewType), 50);
            ViewName = AddStringColumn(table, nameof(ViewName), 250);
            IsDefault = AddBooleanColumn(table, nameof(IsDefault));
            SortOrder = AddIntegerColumn(table, nameof(SortOrder));
            ConfigJson = AddMaxStringColumn(table, nameof(ConfigJson));
            CustomHtml = AddMaxStringColumn(table, nameof(CustomHtml));
            CustomCss = AddMaxStringColumn(table, nameof(CustomCss));
            PermissionsJson = AddMaxStringColumn(table, nameof(PermissionsJson));
            CreatedOnUtc = AddDateTimeColumn(table, nameof(CreatedOnUtc));
            return this;
        }

        public OperationBuilder<AddColumnOperation> ViewId { get; set; }
        public OperationBuilder<AddColumnOperation> FormId { get; set; }
        public OperationBuilder<AddColumnOperation> ViewKey { get; set; }
        public OperationBuilder<AddColumnOperation> QueryKey { get; set; }
        public OperationBuilder<AddColumnOperation> ViewType { get; set; }
        public OperationBuilder<AddColumnOperation> ViewName { get; set; }
        public OperationBuilder<AddColumnOperation> IsDefault { get; set; }
        public OperationBuilder<AddColumnOperation> SortOrder { get; set; }
        public OperationBuilder<AddColumnOperation> ConfigJson { get; set; }
        public OperationBuilder<AddColumnOperation> CustomHtml { get; set; }
        public OperationBuilder<AddColumnOperation> CustomCss { get; set; }
        public OperationBuilder<AddColumnOperation> PermissionsJson { get; set; }
        public OperationBuilder<AddColumnOperation> CreatedOnUtc { get; set; }
    }
}
