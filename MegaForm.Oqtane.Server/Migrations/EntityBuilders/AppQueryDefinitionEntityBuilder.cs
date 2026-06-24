using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class AppQueryDefinitionEntityBuilder : BaseEntityBuilder<AppQueryDefinitionEntityBuilder>
    {
        private const string TableName = "MF_AppQueries";
        private readonly PrimaryKey<AppQueryDefinitionEntityBuilder> _primaryKey = new("PK_MF_AppQueries", x => x.QueryId);
        private readonly ForeignKey<AppQueryDefinitionEntityBuilder> _appForeignKey = new("FK_MF_AppQueries_MF_Apps", x => x.AppId, "MF_Apps", "AppId", ReferentialAction.Cascade);

        public AppQueryDefinitionEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
            ForeignKeys.Add(_appForeignKey);
        }

        protected override AppQueryDefinitionEntityBuilder BuildTable(ColumnsBuilder table)
        {
            QueryId = AddAutoIncrementColumn(table, nameof(QueryId));
            AppId = AddIntegerColumn(table, nameof(AppId));
            FormId = AddIntegerColumn(table, nameof(FormId));
            QueryKey = AddStringColumn(table, nameof(QueryKey), 150);
            QueryName = AddStringColumn(table, nameof(QueryName), 250);
            Description = AddMaxStringColumn(table, nameof(Description));
            QueryType = AddStringColumn(table, nameof(QueryType), 50);
            DefinitionJson = AddMaxStringColumn(table, nameof(DefinitionJson));
            IsSystem = AddBooleanColumn(table, nameof(IsSystem));
            SortOrder = AddIntegerColumn(table, nameof(SortOrder));
            CreatedByUserId = AddIntegerColumn(table, nameof(CreatedByUserId));
            CreatedOnUtc = AddDateTimeColumn(table, nameof(CreatedOnUtc));
            ModifiedByUserId = AddIntegerColumn(table, nameof(ModifiedByUserId));
            ModifiedOnUtc = AddDateTimeColumn(table, nameof(ModifiedOnUtc), true);
            return this;
        }

        public OperationBuilder<AddColumnOperation> QueryId { get; set; }
        public OperationBuilder<AddColumnOperation> AppId { get; set; }
        public OperationBuilder<AddColumnOperation> FormId { get; set; }
        public OperationBuilder<AddColumnOperation> QueryKey { get; set; }
        public OperationBuilder<AddColumnOperation> QueryName { get; set; }
        public OperationBuilder<AddColumnOperation> Description { get; set; }
        public OperationBuilder<AddColumnOperation> QueryType { get; set; }
        public OperationBuilder<AddColumnOperation> DefinitionJson { get; set; }
        public OperationBuilder<AddColumnOperation> IsSystem { get; set; }
        public OperationBuilder<AddColumnOperation> SortOrder { get; set; }
        public OperationBuilder<AddColumnOperation> CreatedByUserId { get; set; }
        public OperationBuilder<AddColumnOperation> CreatedOnUtc { get; set; }
        public OperationBuilder<AddColumnOperation> ModifiedByUserId { get; set; }
        public OperationBuilder<AddColumnOperation> ModifiedOnUtc { get; set; }
    }
}
