using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class AppDefinitionEntityBuilder : BaseEntityBuilder<AppDefinitionEntityBuilder>
    {
        private const string TableName = "MF_Apps";
        private readonly PrimaryKey<AppDefinitionEntityBuilder> _primaryKey = new("PK_MF_Apps", x => x.AppId);

        public AppDefinitionEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
        }

        protected override AppDefinitionEntityBuilder BuildTable(ColumnsBuilder table)
        {
            AppId = AddAutoIncrementColumn(table, nameof(AppId));
            PortalId = AddIntegerColumn(table, nameof(PortalId));
            AppKey = AddStringColumn(table, nameof(AppKey), 150);
            AppName = AddStringColumn(table, nameof(AppName), 250);
            Description = AddMaxStringColumn(table, nameof(Description));
            AppScope = AddStringColumn(table, nameof(AppScope), 150);
            Icon = AddStringColumn(table, nameof(Icon), 200);
            AccentColor = AddStringColumn(table, nameof(AccentColor), 50);
            ManifestJson = AddMaxStringColumn(table, nameof(ManifestJson));
            SettingsJson = AddMaxStringColumn(table, nameof(SettingsJson));
            ResourcesJson = AddMaxStringColumn(table, nameof(ResourcesJson));
            IsEnabled = AddBooleanColumn(table, nameof(IsEnabled));
            SortOrder = AddIntegerColumn(table, nameof(SortOrder));
            CreatedByUserId = AddIntegerColumn(table, nameof(CreatedByUserId));
            CreatedOnUtc = AddDateTimeColumn(table, nameof(CreatedOnUtc));
            ModifiedByUserId = AddIntegerColumn(table, nameof(ModifiedByUserId));
            ModifiedOnUtc = AddDateTimeColumn(table, nameof(ModifiedOnUtc), true);
            return this;
        }

        public OperationBuilder<AddColumnOperation> AppId { get; set; }
        public OperationBuilder<AddColumnOperation> PortalId { get; set; }
        public OperationBuilder<AddColumnOperation> AppKey { get; set; }
        public OperationBuilder<AddColumnOperation> AppName { get; set; }
        public OperationBuilder<AddColumnOperation> Description { get; set; }
        public OperationBuilder<AddColumnOperation> AppScope { get; set; }
        public OperationBuilder<AddColumnOperation> Icon { get; set; }
        public OperationBuilder<AddColumnOperation> AccentColor { get; set; }
        public OperationBuilder<AddColumnOperation> ManifestJson { get; set; }
        public OperationBuilder<AddColumnOperation> SettingsJson { get; set; }
        public OperationBuilder<AddColumnOperation> ResourcesJson { get; set; }
        public OperationBuilder<AddColumnOperation> IsEnabled { get; set; }
        public OperationBuilder<AddColumnOperation> SortOrder { get; set; }
        public OperationBuilder<AddColumnOperation> CreatedByUserId { get; set; }
        public OperationBuilder<AddColumnOperation> CreatedOnUtc { get; set; }
        public OperationBuilder<AddColumnOperation> ModifiedByUserId { get; set; }
        public OperationBuilder<AddColumnOperation> ModifiedOnUtc { get; set; }
    }
}
