using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models.ExternalTable;
using MegaForm.Core.Services.Subform;

namespace MegaForm.Core.Services.ExternalTable
{
    /// <summary>
    /// [ATBE P0] Point this at any table in a customer database and it answers: what is this thing,
    /// what may we do to it, and what will break. Everything downstream (dashboard, AI designer,
    /// writer) reads its verdict instead of re-deriving it.
    ///
    /// Two invariants:
    ///  - FAIL-SAFE. A probe that cannot answer downgrades the table. We never assume an index
    ///    exists, never assume a key is unique, never assume a table is small.
    ///  - The AI is never in this loop. Keys, required-ness, insertability and the final mode are
    ///    machine conclusions; the model only gets the finished flags.
    /// </summary>
    public class TableCapabilityProbe
    {
        private readonly IConnectionRegistry _registry;

        public TableCapabilityProbe(IConnectionRegistry registry)
        {
            _registry = registry;
        }

        public CapabilityProfile Probe(ProbeRequest request)
        {
            if (request == null) throw new ArgumentNullException("request");
            if (!SqlRelationalSchemaReader.IsSafeIdent(request.Table))
                throw new ArgumentException("invalid table name");
            if (!string.IsNullOrEmpty(request.Schema) && !SqlRelationalSchemaReader.IsSafeIdent(request.Schema))
                throw new ArgumentException("invalid schema name");

            var profile = new CapabilityProfile { ProbedAtUtc = DateTime.UtcNow };

            using (var conn = _registry.GetConnection(request.ConnectionKey, request.DatabaseType))
            {
                conn.Open();
                var reader = new SqlRelationalSchemaReader(conn, profile.Policy.ProbeTimeoutSec);

                profile.Connection = reader.ReadEnvironment();
                profile.Connection.ConnectionKey = request.ConnectionKey;

                // P0 — object identity. An ambiguous name stops everything: binding a form to the
                // wrong same-named table is silent and unrecoverable.
                profile.Object = reader.ResolveObject(request.Schema, request.Table);
                if (profile.Object.SchemaCollision || profile.Object.Type == "UNKNOWN")
                {
                    profile.Coverage.MetadataLevel = "L-1";
                    CapabilityDecisionEngine.Decide(profile);
                    profile.Hash = ComputeHash(profile);
                    return profile;
                }

                var schema = profile.Object.Schema;
                var table = profile.Object.Name;
                bool isView = profile.Object.Type == "VIEW";

                profile.Permissions = reader.ReadPermissions(schema, table);

                string level;
                profile.Columns = reader.ReadColumns(schema, table, out level);
                profile.Coverage.MetadataLevel = level;

                reader.ReadTriggers(schema, table, profile.Object);
                reader.ReadCheckEnums(schema, table, profile.Columns);
                reader.ReadForeignKeys(schema, table, profile.Columns, profile.Relations);
                reader.EnrichForeignKeys(profile.Relations);
                profile.Indexes = reader.ReadIndexes(schema, table);
                profile.FullText = reader.ReadFullText(schema, table);
                profile.Size = reader.ReadSize(schema, table, isView);
                reader.MeasureExactCount(schema, table, profile.Size);

                ResolveKey(reader, profile, schema, table, isView);
                ResolveConcurrency(profile);
                ResolveSemantics(reader, profile, schema, table);
                MarkPolymorphicSuspects(profile);
                ResolveFileColumns(reader, profile, schema, table);

                // Column conclusions depend on key + index + semantics, so they come last.
                // Order matters: the UI mapper is what discovers an unrepresentable type, and the
                // query flags must see that verdict — an unsupported column is never sortable.
                foreach (var c in profile.Columns)
                {
                    ApplyWriteFlags(c, profile);
                    ExternalUiTypeMapper.Apply(c);
                    ApplyQueryFlags(c, profile);
                }

                profile.Coverage.Missing = reader.Failures;
                profile.Coverage.BehaviouralProbeConsented = request.AllowBehaviouralProbe;
            }

            CapabilityDecisionEngine.Decide(profile);
            profile.Hash = ComputeHash(profile);
            return profile;
        }

        // ------------------------------------------------------------------ key

        private static void ResolveKey(SqlRelationalSchemaReader reader, CapabilityProfile p, string schema, string table, bool isView)
        {
            var pk = reader.ReadPrimaryKey(schema, table, p.Columns);
            if (pk.Count > 0)
            {
                p.Key.Columns = pk;
                p.Key.Source = "pk";
            }
            else
            {
                var uniques = reader.ReadUniqueKeys(schema, table, p.Columns);
                if (uniques.Count > 0)
                {
                    p.Key.Columns = uniques[0];   // deterministic: fewest columns, then alphabetical
                    p.Key.Source = "uniqueIndex";
                }
                else
                {
                    p.Key.Source = "none";
                    p.Key.Trusted = false;
                    p.Key.Strategy = "none";
                    p.Key.Retrieval = "none";
                    return;
                }
            }

            var keyCols = p.Key.Columns
                .Select(k => p.Columns.FirstOrDefault(c => string.Equals(c.Name, k.Name, StringComparison.OrdinalIgnoreCase)))
                .Where(c => c != null)
                .ToList();

            p.Key.IsIdentity = keyCols.Count == 1 && keyCols[0].IsIdentity;

            // How does a new row GET its key? This is the difference between a working INSERT and a
            // silent 515 for every submission.
            if (p.Key.IsIdentity)
            {
                p.Key.Strategy = "identity";
                p.Key.DefaultKind = "none";
            }
            else if (keyCols.Count == 1 && keyCols[0].HasDefault)
            {
                var def = (keyCols[0].DefaultExpr ?? string.Empty).ToLowerInvariant();
                if (def.Contains("newsequentialid")) { p.Key.Strategy = "dbDefault"; p.Key.DefaultKind = "newsequentialid"; }
                else if (def.Contains("newid")) { p.Key.Strategy = "dbDefault"; p.Key.DefaultKind = "newid"; }
                else if (def.Contains("next value for")) { p.Key.Strategy = "sequence"; p.Key.DefaultKind = "sequence"; }
                else { p.Key.Strategy = "dbDefault"; p.Key.DefaultKind = "none"; }
            }
            else if (keyCols.Count == 1 && keyCols[0].SqlType == "uniqueidentifier")
            {
                // No default: the app must supply the GUID. We can generate it ourselves, which also
                // means we know the key BEFORE the insert — the easiest case of all.
                p.Key.Strategy = "appGuid";
            }
            else
            {
                p.Key.Strategy = "userSupplied";
            }

            // Retrieval strategy. An INSTEAD OF trigger makes SCOPE_IDENTITY() lie, and any trigger
            // at all makes a plain OUTPUT clause fail (Msg 334) — OUTPUT..INTO is the only safe form.
            bool anyTrigger = p.Object.HasInsteadOfTrigger || p.Object.AfterTriggers.Count > 0
                              || p.Object.TriggerKnowledge == "unknown";
            if (p.Key.Strategy == "appGuid") p.Key.Retrieval = "preAssigned";
            else if (p.Key.Strategy == "userSupplied") p.Key.Retrieval = "preAssigned";
            else if (anyTrigger) p.Key.Retrieval = "outputInto";
            else if (p.Key.Strategy == "identity") p.Key.Retrieval = "scopeIdentity";
            else p.Key.Retrieval = "outputInto";

            // Trust. A PK constraint is proof. A unique index on a table is proof. A view proves
            // nothing at all, so we sample the data before we believe it.
            if (p.Key.Source == "pk" && !isView)
            {
                p.Key.Trusted = true;
            }
            else
            {
                p.Key.Verified = reader.VerifyKey(schema, table, p.Key.Columns);
                p.Key.Trusted = p.Key.Verified.Ran
                                && p.Key.Verified.Duplicates == 0
                                && p.Key.Verified.Nulls == 0;
            }

            foreach (var c in keyCols) c.Immutable = true;
        }

        private static void ResolveConcurrency(CapabilityProfile p)
        {
            var rv = p.Columns.FirstOrDefault(c => c.IsRowVersion);
            if (rv != null)
            {
                p.Concurrency.RowVersionColumn = rv.Name;
                p.Concurrency.Mode = "rowversion";
                return;
            }
            var modified = p.Columns.FirstOrDefault(c =>
                c.Name != null && c.Name.IndexOf("modified", StringComparison.OrdinalIgnoreCase) >= 0
                && (c.SqlType ?? string.Empty).Contains("date"));
            p.Concurrency.Mode = modified != null ? "compareColumns" : "lastWriteWins";
            if (modified != null) p.Concurrency.RowVersionColumn = modified.Name;
        }

        // ------------------------------------------------------------------ column flags

        /// <summary>The flags the AI reads instead of reasoning. Getting these wrong is how a form
        /// ends up asking a user to type an identity column, or omitting a NOT NULL one.</summary>
        private static void ApplyWriteFlags(ColumnFacts c, CapabilityProfile p)
        {
            bool auto = c.IsIdentity || c.IsComputed || c.IsRowVersion;
            bool defaulted = c.HasDefault && c.DefaultKind == "function";

            // HAS_PERMS_BY_NAME happily reports INSERT on a VIEW. Writing through one is only legal
            // for a narrow class of updatable views, so we simply never offer it.
            bool writableObject = p.Object.Type == "BASE_TABLE";

            c.OmitFromInsert = auto || defaulted;
            c.Insertable = !auto && writableObject && p.Permissions.Insert;
            c.Updatable = !auto && !c.Immutable && writableObject && p.Permissions.Update;

            // A NOT NULL column with no default MUST come from somewhere. If the form does not ask
            // for it and the server does not fill it, every INSERT dies with Msg 515.
            c.MustSupplyOnInsert = !c.Nullable && !c.HasDefault && !auto;

            c.ServerFill = InferServerFill(c);
            c.Required = c.MustSupplyOnInsert && c.Insertable && string.IsNullOrEmpty(c.ServerFill);

            // L0 could not read defaults at all, so anything NOT NULL is treated as required rather
            // than risking a silent 515 on the customer's table.
            if (p.Coverage.MetadataLevel == "L0" && !c.Nullable && !auto && string.IsNullOrEmpty(c.ServerFill))
                c.Required = true;
        }

        /// <summary>Columns the server fills for the user (audit/tenant columns). These must NEVER be
        /// accepted from the client — see the LifecycleRunner precedence bug this design must not repeat.</summary>
        private static string InferServerFill(ColumnFacts c)
        {
            var n = (c.Name ?? string.Empty).ToLowerInvariant();
            var t = (c.SqlType ?? string.Empty).ToLowerInvariant();
            bool isDate = t.Contains("date");
            bool isText = t.Contains("char") || t.Contains("text");
            bool isNum = t.Contains("int");

            if (isDate && (n.StartsWith("created") || n.StartsWith("inserted") || n == "submittedon" || n == "submitteddate"))
                return "utcNow";
            if (isDate && (n.StartsWith("modified") || n.StartsWith("updated")))
                return "utcNow";
            if ((isText || isNum) && (n == "createdby" || n == "createdbyuserid" || n == "createduserid" || n == "insertedby"))
                return isNum ? "actor.userId" : "actor.userName";
            if ((isText || isNum) && (n == "modifiedby" || n == "modifiedbyuserid" || n == "updatedby"))
                return isNum ? "actor.userId" : "actor.userName";
            if (isText && (n == "ipaddress" || n == "clientip"))
                return "ipAddress";
            return null;
        }

        /// <summary>Sortable/filterable/searchable follow the INDEXES, not wishes. On a 500k table an
        /// unindexed ORDER BY is a full scan on every page.</summary>
        private static void ApplyQueryFlags(ColumnFacts c, CapabilityProfile p)
        {
            if (c.IsEncrypted || c.Unsupported)
            {
                c.Sortable = c.Filterable = c.Searchable = false;
                return;
            }

            bool small = p.Size.Bucket == "S";
            bool leading = p.Indexes.Any(i => !i.Disabled && !i.Filtered
                                              && string.Equals(i.Leading, c.Name, StringComparison.OrdinalIgnoreCase));
            bool anyKeyCol = p.Indexes.Any(i => !i.Disabled && !i.Filtered
                                                && i.KeyColumns.Any(k => string.Equals(k, c.Name, StringComparison.OrdinalIgnoreCase)));

            // LOB columns cannot be indexed at all (Msg 1919), so they can never be sorted cheaply.
            if (c.IsLob)
            {
                c.Sortable = false;
                c.Filterable = small;
                c.Searchable = p.FullText.Enabled && p.FullText.Columns.Any(f => string.Equals(f, c.Name, StringComparison.OrdinalIgnoreCase));
                return;
            }

            c.Sortable = leading || c.IsPrimaryKey || small;
            c.Filterable = anyKeyCol || small;

            bool isText = (c.SqlType ?? string.Empty).Contains("char") || (c.SqlType ?? string.Empty).Contains("text");
            if (!isText) { c.Searchable = false; return; }

            if (p.FullText.Enabled && p.FullText.Columns.Any(f => string.Equals(f, c.Name, StringComparison.OrdinalIgnoreCase)))
                c.Searchable = true;
            else if (small)
                c.Searchable = true;             // substring LIKE is affordable below 50k rows
            else
                c.Searchable = leading || anyKeyCol;   // prefix LIKE only, and only if indexed
        }

        // ------------------------------------------------------------------ semantics

        private static void ResolveSemantics(SqlRelationalSchemaReader reader, CapabilityProfile p, string schema, string table)
        {
            p.Semantics.Time = ScoreTimeColumn(p);
            p.Semantics.Status = FindStatusColumn(reader, p, schema, table);
            p.Semantics.SoftDelete = FindSoftDelete(p);
            p.Semantics.Owner = FindOwner(p);
        }

        /// <summary>Deterministic scoring, top candidate returned with its evidence. The admin still has
        /// to confirm it — and separately confirm whether it is UTC, which no probe can tell us.</summary>
        private static TimeColumn ScoreTimeColumn(CapabilityProfile p)
        {
            TimeColumn best = null;
            int bestScore = 0;

            foreach (var c in p.Columns)
            {
                var t = (c.SqlType ?? string.Empty);
                if (!t.Contains("date")) continue;

                var n = (c.Name ?? string.Empty).ToLowerInvariant();
                int score = 0;
                var why = new List<string>();

                if (n.StartsWith("created") || n.StartsWith("inserted") || n.StartsWith("submit")
                    || n.StartsWith("entry") || n.StartsWith("registered") || n.StartsWith("order"))
                { score += 50; why.Add("name looks like a creation timestamp (+50)"); }
                else if (n.StartsWith("modified") || n.StartsWith("updated"))
                { score += 10; why.Add("name looks like a modification timestamp (+10)"); }

                if (!c.Nullable) { score += 20; why.Add("NOT NULL (+20)"); }
                if (c.HasDefault && c.DefaultKind == "function") { score += 20; why.Add("defaults to a clock function (+20)"); }

                bool indexed = p.Indexes.Any(i => !i.Disabled && string.Equals(i.Leading, c.Name, StringComparison.OrdinalIgnoreCase));
                if (indexed) { score += 20; why.Add("leads an index (+20)"); }

                if (score > bestScore)
                {
                    bestScore = score;
                    best = new TimeColumn
                    {
                        Name = c.Name,
                        Kind = c.SqlType,
                        Indexed = indexed,
                        IsUtc = null,                 // nobody can know this from metadata
                        ConfirmedByAdmin = false,
                        Score = score,
                        Evidence = string.Join(", ", why),
                    };
                }
            }
            return best;
        }

        private static StatusColumn FindStatusColumn(SqlRelationalSchemaReader reader, CapabilityProfile p, string schema, string table)
        {
            var candidate = p.Columns.FirstOrDefault(c =>
            {
                var n = (c.Name ?? string.Empty).ToLowerInvariant();
                return n == "status" || n == "statusid" || n == "state" || n == "stage" || n.EndsWith("status");
            });
            if (candidate == null) return null;

            var s = new StatusColumn { Name = candidate.Name, Filterable = candidate.Filterable };

            if (candidate.Fk != null)
            {
                s.Kind = "fkLookup";      // the dashboard must join to show a label, not an id
                return s;
            }
            if ((candidate.SqlType ?? string.Empty) == "bit")
            {
                s.Kind = "bit";
                s.Values = new List<string> { "0", "1" };
                return s;
            }

            s.Kind = "enum";
            if (candidate.Enum != null && candidate.Enum.Values.Count > 0)
            {
                s.Values = candidate.Enum.Values;
            }
            else if (p.Size.Bucket != "XL")
            {
                // Sampling is only safe on a table we can afford to read a slice of.
                var sampled = reader.SampleDistinct(schema, table, candidate.Name);
                if (sampled != null && sampled.Count > 0 && sampled.Count <= 30)
                {
                    s.Values = sampled;
                    candidate.Enum = new ColumnEnum { Source = "distinct", Values = sampled, MembershipEnforced = false };
                }
            }
            return s;
        }

        private static SoftDeleteColumn FindSoftDelete(CapabilityProfile p)
        {
            var c = p.Columns.FirstOrDefault(x =>
            {
                var n = (x.Name ?? string.Empty).ToLowerInvariant();
                var t = (x.SqlType ?? string.Empty);
                bool nameHit = n == "isdeleted" || n == "deleted" || n == "isactive" || n == "isarchived"
                               || n == "voided" || n == "cancelled" || n == "deletedon" || n == "deletedat";
                return nameHit && (t == "bit" || t.Contains("date"));
            });
            if (c == null) return null;

            var name = (c.Name ?? string.Empty).ToLowerInvariant();
            bool inverted = name == "isactive";     // active=1 means NOT deleted
            if ((c.SqlType ?? string.Empty) == "bit")
                return new SoftDeleteColumn
                {
                    Column = c.Name,
                    ActiveValue = inverted ? "1" : "0",
                    DeletedValue = inverted ? "0" : "1",
                };

            return new SoftDeleteColumn { Column = c.Name, ActiveValue = null, DeletedValue = "utcNow" };
        }

        private static OwnerColumn FindOwner(CapabilityProfile p)
        {
            var c = p.Columns.FirstOrDefault(x =>
            {
                var n = (x.Name ?? string.Empty).ToLowerInvariant();
                return n == "createdby" || n == "createdbyuserid" || n == "ownerid" || n == "owner"
                       || n == "userid" || n == "submittedby";
            });
            if (c == null) return null;

            var t = (c.SqlType ?? string.Empty);
            var kind = t.Contains("int") ? "userId"
                     : t == "uniqueidentifier" ? "guid"
                     : (c.Name ?? string.Empty).ToLowerInvariant().Contains("email") ? "email"
                     : "username";
            return new OwnerColumn { Name = c.Name, Kind = kind };
        }

        /// <summary>A text column whose NAME suggests an attachment is only a candidate — what it
        /// actually holds (relative path / URL / JSON / delimited list) decides how we must write it,
        /// so we look at the data before deciding.</summary>
        private static void ResolveFileColumns(SqlRelationalSchemaReader reader, CapabilityProfile p, string schema, string table)
        {
            foreach (var c in p.Columns)
            {
                if (c.ValueMode != null) continue;                 // binary columns already claimed
                if (c.IsComputed || c.IsRowVersion || c.Fk != null) continue;

                var t = (c.SqlType ?? string.Empty);
                if (!t.Contains("char") && !t.Contains("text")) continue;

                var n = (c.Name ?? string.Empty).ToLowerInvariant();
                bool looksLikeFile = n.Contains("attach") || n.Contains("file") || n.Contains("document")
                                     || n.Contains("upload") || n.EndsWith("path") || n.Contains("photo")
                                     || n.Contains("image") || n.Contains("avatar");
                if (!looksLikeFile) continue;

                c.ValueMode = reader.SniffFileValueMode(schema, table, c.Name) ?? "filePath";
            }
        }

        /// <summary>An EntityId column next to an EntityType discriminator points at different tables per
        /// row. Every parent table "matches" it, so any confidence score we compute would be a lie.</summary>
        private static void MarkPolymorphicSuspects(CapabilityProfile p)
        {
            foreach (var c in p.Columns)
            {
                var n = (c.Name ?? string.Empty).ToLowerInvariant();
                if (!n.EndsWith("id") || c.Fk != null) continue;
                var stem = n.Substring(0, n.Length - 2);
                if (stem.Length == 0) continue;

                bool hasDiscriminator = p.Columns.Any(o =>
                {
                    var on = (o.Name ?? string.Empty).ToLowerInvariant();
                    return on == stem + "type" || on == stem + "kind" || on == stem + "table";
                });
                if (hasDiscriminator) p.Relations.PolymorphicSuspects.Add(c.Name);
            }
        }

        // ------------------------------------------------------------------ hash

        /// <summary>Fingerprints everything a write depends on. Re-checked on every submit: if the DBA
        /// drops an index or changes a type, we stop rather than write against a stale picture.</summary>
        public static string ComputeHash(CapabilityProfile p)
        {
            var sb = new StringBuilder();
            sb.Append(p.ProfileVersion).Append('|')
              .Append(p.Object.Schema).Append('.').Append(p.Object.Name).Append('|')
              .Append(p.Object.Type).Append('|')
              .Append(p.Key.Strategy).Append('|').Append(p.Key.Retrieval).Append('|')
              .Append(string.Join(",", p.Key.Columns.Select(k => k.Name + ":" + k.SqlType))).Append('|')
              .Append(p.Permissions.Select).Append(p.Permissions.Insert).Append(p.Permissions.Update).Append(p.Permissions.Delete).Append('|');

            foreach (var c in p.Columns.OrderBy(c => c.Ordinal))
                sb.Append(c.Name).Append(':').Append(c.SqlType).Append(':')
                  .Append(c.Nullable ? 1 : 0).Append(c.IsIdentity ? 1 : 0).Append(c.IsComputed ? 1 : 0)
                  .Append(c.HasDefault ? 1 : 0).Append(':').Append(c.MaxLengthChars.HasValue ? c.MaxLengthChars.Value : -1).Append(';');

            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(sb.ToString()));
                var hex = new StringBuilder("sha256:");
                foreach (var b in bytes) hex.Append(b.ToString("x2"));
                return hex.ToString();
            }
        }
    }

    public class ProbeRequest
    {
        /// <summary>Resolved SERVER-SIDE from an allowlist. Never taken from a client request body.</summary>
        public string ConnectionKey { get; set; }
        public string DatabaseType { get; set; }
        public string Schema { get; set; }
        public string Table { get; set; }
        /// <summary>Behavioural probes (INSERT inside a rolled-back transaction) fire triggers and burn
        /// identity values for real. Off unless an admin ticked the warning.</summary>
        public bool AllowBehaviouralProbe { get; set; }
    }
}
