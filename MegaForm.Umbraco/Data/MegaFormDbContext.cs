using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Models;

namespace MegaForm.Umbraco.Data
{
    public class MegaFormDbContext : DbContext
    {
        public MegaFormDbContext(DbContextOptions<MegaFormDbContext> options) : base(options) { }

        public DbSet<FormInfo> Forms { get; set; }
        public DbSet<SubmissionInfo> Submissions { get; set; }
        public DbSet<SubmissionValueInfo> SubmissionValues { get; set; }
        public DbSet<ModuleViewConfigInfo> ModuleViewConfigs { get; set; }
        public DbSet<FormViewInfo> FormViews { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // MF_Forms
            modelBuilder.Entity<FormInfo>(e =>
            {
                e.ToTable("MF_Forms");
                e.HasKey(x => x.FormId);
                e.Property(x => x.Title).HasMaxLength(500);
                e.Property(x => x.Status).HasMaxLength(20).HasDefaultValue("Draft");
                e.Property(x => x.SchemaJson).HasColumnType("nvarchar(max)");
                e.Property(x => x.SettingsJson).HasColumnType("nvarchar(max)");
                e.Property(x => x.ThemeJson).HasColumnType("nvarchar(max)");
            });

            // MF_Submissions
            modelBuilder.Entity<SubmissionInfo>(e =>
            {
                e.ToTable("MF_Submissions");
                e.HasKey(x => x.SubmissionId);
                e.Property(x => x.DataJson).HasColumnType("nvarchar(max)").IsRequired();
                e.Property(x => x.Status).HasMaxLength(20).HasDefaultValue("Submitted");
                e.Property(x => x.SubmittedOnUtc).HasDefaultValueSql("SYSUTCDATETIME()");
                e.HasIndex(x => new { x.FormId, x.SubmittedOnUtc }).IsDescending(false, true);
            });

            // MF_SubmissionValues
            modelBuilder.Entity<SubmissionValueInfo>(e =>
            {
                e.ToTable("MF_SubmissionValues");
                e.HasKey(x => x.ValueId);
                e.Property(x => x.FieldKey).HasMaxLength(200).IsRequired();
                e.HasIndex(x => new { x.SubmissionId, x.FieldKey });
            });

            // MF_ModuleViewConfig
            modelBuilder.Entity<ModuleViewConfigInfo>(e =>
            {
                e.ToTable("MF_ModuleViewConfig");
                e.HasKey(x => x.ConfigId);
                e.Property(x => x.ViewType).HasMaxLength(30).HasDefaultValue("submit");
                e.HasIndex(x => x.ModuleId).IsUnique();
            });

            // MF_FormViews
            modelBuilder.Entity<FormViewInfo>(e =>
            {
                e.ToTable("MF_FormViews");
                e.HasKey(x => x.ViewId);
                e.Property(x => x.ViewKey).HasMaxLength(100);
                e.Property(x => x.ViewType).HasMaxLength(50);
                e.HasIndex(x => new { x.FormId, x.ViewKey }).IsUnique();
            });
        }
    }
}
