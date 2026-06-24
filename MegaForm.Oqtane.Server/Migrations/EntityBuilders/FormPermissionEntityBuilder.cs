using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class FormPermissionEntityBuilder : BaseEntityBuilder<FormPermissionEntityBuilder>
    {
        private const string TableName = "MF_Permissions";
        private readonly PrimaryKey<FormPermissionEntityBuilder> _primaryKey = new("PK_MF_Permissions", x => x.PermissionId);
        private readonly ForeignKey<FormPermissionEntityBuilder> _formForeignKey = new("FK_MF_Permissions_MF_Forms", x => x.FormId, "MF_Forms", "FormId", ReferentialAction.Cascade);

        public FormPermissionEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
            ForeignKeys.Add(_formForeignKey);
        }

        protected override FormPermissionEntityBuilder BuildTable(ColumnsBuilder table)
        {
            PermissionId = AddAutoIncrementColumn(table, nameof(PermissionId));
            FormId = AddIntegerColumn(table, nameof(FormId));
            PermissionType = AddStringColumn(table, nameof(PermissionType), 50);
            PrincipalType = AddStringColumn(table, nameof(PrincipalType), 50);
            PrincipalId = AddStringColumn(table, nameof(PrincipalId), 200);
            RoleName = AddStringColumn(table, nameof(RoleName), 256);
            UserId = table.Column<int>(nullable: true);
            Scope = AddStringColumn(table, nameof(Scope), 50);
            IsGranted = AddBooleanColumn(table, nameof(IsGranted));
            FieldRestrictions = AddMaxStringColumn(table, nameof(FieldRestrictions));
            return this;
        }

        public OperationBuilder<AddColumnOperation> PermissionId { get; set; }
        public OperationBuilder<AddColumnOperation> FormId { get; set; }
        public OperationBuilder<AddColumnOperation> PermissionType { get; set; }
        public OperationBuilder<AddColumnOperation> PrincipalType { get; set; }
        public OperationBuilder<AddColumnOperation> PrincipalId { get; set; }
        public OperationBuilder<AddColumnOperation> RoleName { get; set; }
        public OperationBuilder<AddColumnOperation> UserId { get; set; }
        public OperationBuilder<AddColumnOperation> Scope { get; set; }
        public OperationBuilder<AddColumnOperation> IsGranted { get; set; }
        public OperationBuilder<AddColumnOperation> FieldRestrictions { get; set; }
    }
}
