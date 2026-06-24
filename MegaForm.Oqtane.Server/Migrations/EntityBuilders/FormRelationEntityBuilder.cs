using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class FormRelationEntityBuilder : BaseEntityBuilder<FormRelationEntityBuilder>
    {
        private const string TableName = "MF_FormRelations";
        private readonly PrimaryKey<FormRelationEntityBuilder> _primaryKey = new("PK_MF_FormRelations", x => x.RelationId);
        private readonly ForeignKey<FormRelationEntityBuilder> _parentFormForeignKey = new("FK_MF_FormRelations_MF_Forms_Parent", x => x.ParentFormId, "MF_Forms", "FormId", ReferentialAction.NoAction);
        private readonly ForeignKey<FormRelationEntityBuilder> _childFormForeignKey = new("FK_MF_FormRelations_MF_Forms_Child", x => x.ChildFormId, "MF_Forms", "FormId", ReferentialAction.NoAction);

        public FormRelationEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
            ForeignKeys.Add(_parentFormForeignKey);
            ForeignKeys.Add(_childFormForeignKey);
        }

        protected override FormRelationEntityBuilder BuildTable(ColumnsBuilder table)
        {
            RelationId = AddAutoIncrementColumn(table, nameof(RelationId));
            ParentFormId = AddIntegerColumn(table, nameof(ParentFormId));
            ChildFormId = AddIntegerColumn(table, nameof(ChildFormId));
            RelationType = AddStringColumn(table, nameof(RelationType), 50);
            ForeignKey = AddStringColumn(table, nameof(ForeignKey), 150);
            ParentKey = AddStringColumn(table, nameof(ParentKey), 150);
            Label = AddStringColumn(table, nameof(Label), 250);
            CascadeDelete = AddBooleanColumn(table, nameof(CascadeDelete));
            return this;
        }

        public OperationBuilder<AddColumnOperation> RelationId { get; set; }
        public OperationBuilder<AddColumnOperation> ParentFormId { get; set; }
        public OperationBuilder<AddColumnOperation> ChildFormId { get; set; }
        public OperationBuilder<AddColumnOperation> RelationType { get; set; }
        public OperationBuilder<AddColumnOperation> ForeignKey { get; set; }
        public OperationBuilder<AddColumnOperation> ParentKey { get; set; }
        public OperationBuilder<AddColumnOperation> Label { get; set; }
        public OperationBuilder<AddColumnOperation> CascadeDelete { get; set; }
    }
}
