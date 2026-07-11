using System;
using System.Collections.Generic;

namespace MegaForm.Core.Models.ExternalTable
{
    /// <summary>
    /// [ATBE P0] Everything the engine learned about ONE customer table, and the mode it
    /// concluded. Produced by TableCapabilityProbe, consumed by every other ATBE component.
    ///
    /// Two hard rules this type encodes:
    ///  - <see cref="Connection"/> is SERVER-ONLY. Strip it before any response or AI envelope.
    ///  - <see cref="Hash"/> is re-verified on every submit: the customer's DBA can drop an index
    ///    or change a type under us, and writing with a stale profile corrupts their data.
    /// </summary>
    public class CapabilityProfile
    {
        public const string CurrentVersion = "1.0";

        public string ProfileVersion { get; set; } = CurrentVersion;
        /// <summary>sha256 of the profile body (Connection excluded — a rotated password must not invalidate it).</summary>
        public string Hash { get; set; }
        public DateTime ProbedAtUtc { get; set; }

        public ProbeCoverage Coverage { get; set; } = new ProbeCoverage();
        /// <summary>⛔ SERVER-ONLY — never serialize to the client or to an AI envelope.</summary>
        public ConnectionFacts Connection { get; set; } = new ConnectionFacts();
        public ObjectFacts Object { get; set; } = new ObjectFacts();
        public PermissionFacts Permissions { get; set; } = new PermissionFacts();
        public SizeFacts Size { get; set; } = new SizeFacts();
        public KeyFacts Key { get; set; } = new KeyFacts();
        public ConcurrencyFacts Concurrency { get; set; } = new ConcurrencyFacts();
        public List<ColumnFacts> Columns { get; set; } = new List<ColumnFacts>();
        public List<IndexFacts> Indexes { get; set; } = new List<IndexFacts>();
        public FullTextFacts FullText { get; set; } = new FullTextFacts();
        public RelationFacts Relations { get; set; } = new RelationFacts();
        public SemanticFacts Semantics { get; set; } = new SemanticFacts();
        public CapabilityFacts Capabilities { get; set; } = new CapabilityFacts();
        public PolicyFacts Policy { get; set; } = new PolicyFacts();
    }

    /// <summary>Which metadata tier actually answered, and what we never managed to learn.</summary>
    public class ProbeCoverage
    {
        /// <summary>L2 = sys.* · L1 = INFORMATION_SCHEMA · L0 = GetSchemaTable(KeyInfo) · L-1 = nothing.</summary>
        public string MetadataLevel { get; set; } = "L-1";
        public bool BehaviouralProbeConsented { get; set; }
        /// <summary>Probes that failed. Anything listed here was assumed WORST-CASE, never best-case.</summary>
        public List<string> Missing { get; set; } = new List<string>();
    }

    public class ConnectionFacts
    {
        public string ConnectionKey { get; set; }
        /// <summary>SqlServer | Sqlite | PostgreSql | MySql | Unknown</summary>
        public string Provider { get; set; } = "Unknown";
        public int EngineEdition { get; set; }
        public string ProductVersion { get; set; }
        public string DbCollation { get; set; }
        /// <summary>READ_WRITE | READ_ONLY — a READ_ONLY replica grants UPDATE but still throws Msg 3906.</summary>
        public string Updateability { get; set; } = "READ_WRITE";
        /// <summary>db_owner BYPASSES row-level security — a red warning, not a convenience.</summary>
        public bool IsDbOwner { get; set; }
        public bool CaseInsensitive { get; set; } = true;
    }

    public class ObjectFacts
    {
        public string Schema { get; set; }
        public string Name { get; set; }
        /// <summary>BASE_TABLE | VIEW | SYNONYM | UNKNOWN</summary>
        public string Type { get; set; } = "UNKNOWN";
        /// <summary>Same table name in two schemas — we refuse to guess which one the admin meant.</summary>
        public bool SchemaCollision { get; set; }
        public List<string> CollidingSchemas { get; set; } = new List<string>();
        public bool HasInsteadOfTrigger { get; set; }
        public List<string> AfterTriggers { get; set; } = new List<string>();
        /// <summary>known | unknown — unknown forces the admin to consent before any behavioural probe.</summary>
        public string TriggerKnowledge { get; set; } = "unknown";
        public string Qualified
        {
            get { return "[" + (Schema ?? "dbo") + "].[" + (Name ?? string.Empty) + "]"; }
        }
    }

    public class PermissionFacts
    {
        public bool Select { get; set; }
        public bool Insert { get; set; }
        public bool Update { get; set; }
        public bool Delete { get; set; }
        /// <summary>Never probed by attempting DDL. Always false unless the catalog says otherwise.</summary>
        public bool Alter { get; set; }
        /// <summary>catalog | empirical | assumed</summary>
        public string Source { get; set; } = "assumed";
    }

    public class SizeFacts
    {
        public long ApproxRows { get; set; }
        /// <summary>dm_db_partition_stats | sys.partitions | bounded | unknown</summary>
        public string RowsSource { get; set; } = "unknown";
        /// <summary>S &lt; 50k · M 50k-2M · L/XL &gt; 2M (XL ⇒ filter required before listing).</summary>
        public string Bucket { get; set; } = "XL";
        /// <summary>False = COUNT(*) timed out once; never retried, never run per page.</summary>
        public bool ExactCountAllowed { get; set; }
        public int CountMs { get; set; }
    }

    public class KeyFacts
    {
        /// <summary>identity | dbDefault | sequence | appGuid | userSupplied | uniqueIndex | none</summary>
        public string Strategy { get; set; } = "none";
        /// <summary>pk | uniqueIndex | adminDeclared | none</summary>
        public string Source { get; set; } = "none";
        /// <summary>False ⇒ readonly. An untrusted key means UPDATE/DELETE could hit N rows.</summary>
        public bool Trusted { get; set; }
        public List<KeyColumn> Columns { get; set; } = new List<KeyColumn>();
        public bool IsIdentity { get; set; }
        /// <summary>newid | newsequentialid | sequence | none</summary>
        public string DefaultKind { get; set; } = "none";
        /// <summary>outputInto | scopeIdentity | preAssigned | businessKeyLookup | none.
        /// An INSTEAD OF trigger breaks SCOPE_IDENTITY, and OUTPUT..INTO is the only safe form
        /// once any trigger exists.</summary>
        public string Retrieval { get; set; } = "none";
        public KeyVerification Verified { get; set; } = new KeyVerification();
    }

    public class KeyColumn
    {
        public string Name { get; set; }
        public int KeyOrdinal { get; set; }
        public string SqlType { get; set; }
    }

    public class KeyVerification
    {
        public long Sampled { get; set; }
        public long Duplicates { get; set; }
        public long Nulls { get; set; }
        public bool Ran { get; set; }
    }

    public class ConcurrencyFacts
    {
        public string RowVersionColumn { get; set; }
        /// <summary>rowversion | compareColumns | lastWriteWins</summary>
        public string Mode { get; set; } = "lastWriteWins";
    }

    public class ColumnFacts
    {
        public string Name { get; set; }
        public int Ordinal { get; set; }
        public string SqlType { get; set; }
        public int Precision { get; set; }
        public int Scale { get; set; }
        /// <summary>null = MAX/LOB. NEVER 0 and NEVER -1 — both are read as "reject every string" downstream.</summary>
        public int? MaxLengthChars { get; set; }
        public bool IsLob { get; set; }
        public bool Nullable { get; set; }
        public bool IsPrimaryKey { get; set; }
        public bool IsIdentity { get; set; }
        public bool IsComputed { get; set; }
        public bool IsRowVersion { get; set; }
        public bool IsEncrypted { get; set; }
        public bool HasDefault { get; set; }
        /// <summary>literal | function | none — a function default (getdate/newid) means omit from INSERT.</summary>
        public string DefaultKind { get; set; } = "none";
        public string DefaultExpr { get; set; }

        // ---- Pre-computed conclusions. The AI reads these flags; it never derives them. ----
        public bool Insertable { get; set; }
        public bool Updatable { get; set; }
        public bool Immutable { get; set; }
        public bool OmitFromInsert { get; set; }
        public bool MustSupplyOnInsert { get; set; }
        public bool Required { get; set; }
        /// <summary>actor.userId | actor.userName | utcNow | portalId | ipAddress | const:&lt;v&gt; | null</summary>
        public string ServerFill { get; set; }
        public bool Sortable { get; set; }
        public bool Filterable { get; set; }
        public bool Searchable { get; set; }

        public ColumnFk Fk { get; set; }
        /// <summary>blobColumn | filePath | fileUrl | fileJson | filePathList | null</summary>
        public string ValueMode { get; set; }
        public ColumnEnum Enum { get; set; }

        public string UiType { get; set; } = "text";
        /// <summary>Closed whitelist. The AI may pick a widget ONLY from this list.</summary>
        public List<string> AllowedWidgets { get; set; } = new List<string>();
        public string DefaultWidget { get; set; }
        public string MachineNote { get; set; }
        /// <summary>Set when the column cannot be represented at all (sql_variant, hierarchyid, geography…).
        /// NOT NULL + unsupported + no default ⇒ the whole table drops to readonly.</summary>
        public bool Unsupported { get; set; }
    }

    public class ColumnFk
    {
        public string RefSchema { get; set; }
        public string RefTable { get; set; }
        public string RefColumn { get; set; }
        /// <summary>catalog | name-heuristic | admin-confirmed. Anything below 1.0 may NOT build a
        /// lookup control until an admin confirms it.</summary>
        public string Source { get; set; } = "catalog";
        public double Confidence { get; set; } = 1.0;
        public string OnDelete { get; set; }
        public long ParentApproxRows { get; set; }
        public string ParentLabelColumn { get; set; }
    }

    public class ColumnEnum
    {
        /// <summary>check | distinct — a distinct-sampled enum must NOT enforce membership
        /// (a rare legit value would be rejected).</summary>
        public string Source { get; set; }
        public List<string> Values { get; set; } = new List<string>();
        public bool MembershipEnforced { get; set; }
    }

    public class IndexFacts
    {
        public string Name { get; set; }
        public bool Unique { get; set; }
        public bool PrimaryKey { get; set; }
        public string Leading { get; set; }
        public List<string> KeyColumns { get; set; } = new List<string>();
        public List<string> Included { get; set; } = new List<string>();
        public bool Filtered { get; set; }
        public bool Disabled { get; set; }
    }

    public class FullTextFacts
    {
        public bool Enabled { get; set; }
        public List<string> Columns { get; set; } = new List<string>();
    }

    public class RelationFacts
    {
        public List<ColumnFk> Outbound { get; set; } = new List<ColumnFk>();
        public List<InboundFk> Inbound { get; set; } = new List<InboundFk>();
        /// <summary>Columns like EntityId paired with an EntityType discriminator. Every parent table
        /// "matches" them, so confidence scoring lies — refuse to build lookups for these.</summary>
        public List<string> PolymorphicSuspects { get; set; } = new List<string>();
    }

    public class InboundFk
    {
        public string ChildSchema { get; set; }
        public string ChildTable { get; set; }
        public string ChildColumn { get; set; }
        public string OnDelete { get; set; }
        public bool FkIndexed { get; set; }
    }

    public class SemanticFacts
    {
        public TimeColumn Time { get; set; }
        public StatusColumn Status { get; set; }
        public SoftDeleteColumn SoftDelete { get; set; }
        public OwnerColumn Owner { get; set; }
    }

    public class TimeColumn
    {
        public string Name { get; set; }
        public string Kind { get; set; }
        /// <summary>null until an admin says so. Guessing wrong shifts every timestamp by the offset.</summary>
        public bool? IsUtc { get; set; }
        public bool Indexed { get; set; }
        public bool ConfirmedByAdmin { get; set; }
        public int Score { get; set; }
        public string Evidence { get; set; }
    }

    public class StatusColumn
    {
        public string Name { get; set; }
        /// <summary>enum | bit | fkLookup</summary>
        public string Kind { get; set; }
        public List<string> Values { get; set; } = new List<string>();
        public bool Filterable { get; set; }
    }

    public class SoftDeleteColumn
    {
        public string Column { get; set; }
        public string ActiveValue { get; set; }
        public string DeletedValue { get; set; }
    }

    public class OwnerColumn
    {
        public string Name { get; set; }
        /// <summary>userId | username | email | guid</summary>
        public string Kind { get; set; }
    }

    public class CapabilityFacts
    {
        /// <summary>readwrite | insertonly | readonly | unsupported — the MINIMUM across every axis.</summary>
        public string Mode { get; set; } = "unsupported";
        public bool CanInsert { get; set; }
        public bool CanUpdate { get; set; }
        public bool CanDelete { get; set; }
        public bool CanOpenDetail { get; set; }
        public bool CanSort { get; set; }
        public bool CanFilterServer { get; set; }
        /// <summary>fulltext | prefix | substring | off</summary>
        public string CanSearch { get; set; } = "off";
        public bool CanExport { get; set; }
        /// <summary>False ⇒ excluded from the All-Forms view (that view fans out and merges client-side).</summary>
        public bool Aggregatable { get; set; }
        public bool RequiresFilterBeforeList { get; set; }
        public bool StatusFilterable { get; set; }
        public bool HasTimestamp { get; set; }
        public bool HasStatus { get; set; }
        public List<string> AllowedActions { get; set; } = new List<string>();
        public List<CapabilityReason> Reasons { get; set; } = new List<CapabilityReason>();
    }

    /// <summary>Every downgrade must say: what was lost, why, and how to unlock it.</summary>
    public class CapabilityReason
    {
        public string Code { get; set; }
        public string Message { get; set; }
        public string HowToFix { get; set; }
        public string Severity { get; set; } = "info";
    }

    public class PolicyFacts
    {
        public int ProbeTimeoutSec { get; set; } = 5;
        public int ListTimeoutSec { get; set; } = 15;
        public int ExportTimeoutSec { get; set; } = 120;
        public int LockTimeoutMs { get; set; } = 5000;
        public int PageSize { get; set; } = 50;
        public int MaxOffset { get; set; } = 10000;
    }
}
