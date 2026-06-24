using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Migrations.Operations.Builders;
using Oqtane.Databases.Interfaces;
using Oqtane.Migrations;
using Oqtane.Migrations.EntityBuilders;

namespace MegaForm.Oqtane.Server.Migrations.EntityBuilders
{
    public class SubmissionLinkEntityBuilder : BaseEntityBuilder<SubmissionLinkEntityBuilder>
    {
        private const string TableName = "MF_SubmissionLinks";
        private readonly PrimaryKey<SubmissionLinkEntityBuilder> _primaryKey = new("PK_MF_SubmissionLinks", x => x.LinkId);
        private readonly ForeignKey<SubmissionLinkEntityBuilder> _relationForeignKey = new("FK_MF_SubmissionLinks_MF_FormRelations", x => x.RelationId, "MF_FormRelations", "RelationId", ReferentialAction.Cascade);
        private readonly ForeignKey<SubmissionLinkEntityBuilder> _parentSubmissionForeignKey = new("FK_MF_SubmissionLinks_MF_Submissions_Parent", x => x.ParentSubmissionId, "MF_Submissions", "SubmissionId", ReferentialAction.NoAction);
        private readonly ForeignKey<SubmissionLinkEntityBuilder> _childSubmissionForeignKey = new("FK_MF_SubmissionLinks_MF_Submissions_Child", x => x.ChildSubmissionId, "MF_Submissions", "SubmissionId", ReferentialAction.NoAction);

        public SubmissionLinkEntityBuilder(MigrationBuilder migrationBuilder, IDatabase database) : base(migrationBuilder, database)
        {
            EntityTableName = TableName;
            PrimaryKey = _primaryKey;
            ForeignKeys.Add(_relationForeignKey);
            ForeignKeys.Add(_parentSubmissionForeignKey);
            ForeignKeys.Add(_childSubmissionForeignKey);
        }

        protected override SubmissionLinkEntityBuilder BuildTable(ColumnsBuilder table)
        {
            LinkId = AddAutoIncrementColumn(table, nameof(LinkId));
            RelationId = AddIntegerColumn(table, nameof(RelationId));
            ParentSubmissionId = AddIntegerColumn(table, nameof(ParentSubmissionId));
            ChildSubmissionId = AddIntegerColumn(table, nameof(ChildSubmissionId));
            CreatedOnUtc = AddDateTimeColumn(table, nameof(CreatedOnUtc));
            return this;
        }

        public OperationBuilder<AddColumnOperation> LinkId { get; set; }
        public OperationBuilder<AddColumnOperation> RelationId { get; set; }
        public OperationBuilder<AddColumnOperation> ParentSubmissionId { get; set; }
        public OperationBuilder<AddColumnOperation> ChildSubmissionId { get; set; }
        public OperationBuilder<AddColumnOperation> CreatedOnUtc { get; set; }
    }
}
