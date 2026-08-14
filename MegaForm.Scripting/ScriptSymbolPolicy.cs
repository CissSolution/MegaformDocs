/*
 * MegaForm.Scripting/ScriptSymbolPolicy.cs
 *
 * [AfterSubmitScript v20260813-01] The actual security boundary of the scripting feature.
 *
 * ── Why the boundary is here and not in the reference list ──────────────────────
 * The obvious design is "only reference safe assemblies". It does not work, and it is
 * worth writing down why so nobody re-derives it as an improvement later:
 *
 *   On .NET Framework, System.IO.File, System.Diagnostics.Process, System.Reflection
 *   and System.Environment all live in MSCORLIB — the one assembly a C# compilation
 *   cannot do without. On .NET Core the equivalents sit behind the System.Runtime
 *   facade, which is equally unavoidable. A reference allow-list can therefore never
 *   exclude them. It shapes convenience (what IntelliSense would offer); it is not a
 *   gate.
 *
 * So the gate is a semantic pass: after Roslyn binds the tree, every symbol the script
 * actually touches is resolved to its type, and that type is checked against a deny-list
 * of namespaces and type names. Because it runs on BOUND symbols rather than on text, it
 * is not fooled by aliases (`using F = System.IO.File;`), by fully-qualified names, by
 * `global::`, by generic arguments, or by inferred `var`.
 *
 * ── What is deliberately still allowed ──────────────────────────────────────────
 * A host with this feature switched on can already run code on the server; the deny-list
 * is not pretending otherwise. Its job is to keep a *mistake* — or a script that arrived
 * with an imported form and got approved without a careful read — from reaching the file
 * system, the network, other processes, or the reflection API that would undo all three.
 * Arithmetic, strings, collections, LINQ, regular expressions, dates and JSON stay open,
 * because that is what after-submit scripts are actually for.
 *
 * A script CAN still loop forever. That is bounded by the run timeout, not by this file;
 * see AfterSubmitScriptService for what the timeout can and cannot do.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace MegaForm.Scripting
{
    internal sealed class ScriptPolicyViolation
    {
        public int Line { get; set; }
        public int Column { get; set; }
        public string Message { get; set; }
    }

    internal static class ScriptSymbolPolicy
    {
        public const string DiagnosticCode = "MF1001";

        /// <summary>
        /// Namespaces a script may not touch. Prefix match on the dotted name, so "System.IO" also
        /// covers System.IO.Compression.
        ///
        /// ── This list is NOT the answer to "what can a script do" ───────────────────────────
        /// Reading it as a feature list is the mistake to avoid. A script that could only compute
        /// would be pointless — the Calculate node already does arithmetic. Scripts DO write to
        /// databases and DO call APIs; they do it through <c>ctx.Db</c> and <c>ctx.Http</c>
        /// (MegaForm.Core.Scripting, allow-listed below), which is a deliberate design and not a
        /// consolation prize:
        ///
        ///   ctx.Db   — parameterised SQL against connections an ADMIN registered by name, so a
        ///              script never carries a credential and rotating a password stays one edit.
        ///   ctx.Http — outbound calls through the same SsrfGuard the webhook node uses, with a
        ///              timeout, a response cap, and a line in the run record per call.
        ///
        /// Raw `new SqlConnection(...)` and `new HttpClient()` stay closed because they would
        /// deliver the same power while losing every one of those properties: a connection string
        /// pasted into a script that travels with an exported form, an outbound URL built from
        /// submitted data with no guard, and no audit trail of what the script actually did.
        /// Capability injection, not raw surface.
        /// </summary>
        private static readonly string[] DeniedNamespacePrefixes =
        {
            "System.IO",                          // file system
            "System.Net",                         // raw sockets/HTTP — the guarded door is ctx.Http
            "System.Linq.Expressions",            // Expression.Compile() builds delegates at runtime
            "System.Reflection",                  // the escape hatch that reopens everything below
            "System.Runtime.InteropServices",     // DllImport / Marshal
            "System.Runtime.Loader",              // load another assembly
            "System.Runtime.Serialization",       // deserialisation gadgets
            "System.Diagnostics",                 // Process.Start, but also EventLog
            "System.Threading",                   // Thread, Monitor, Timer, ThreadPool — but see the
                                                  // exceptions below: Task itself has to be reachable
                                                  // or the capability rail cannot be called at all
            "System.Security",                    // permission juggling, cryptography by policy elsewhere
            "System.Data",                        // raw ADO.NET — the named-connection door is ctx.Db
            "System.Xml",                         // XmlDocument/XmlReader external-entity surface
            "System.Configuration",
            "System.Web",
            "System.Management",
            "System.CodeDom",
            "Microsoft.CodeAnalysis",             // compiling more code from inside a script
            "Microsoft.Win32",                    // registry
            "Microsoft.CSharp",                   // the dynamic binder
            "DotNetNuke",                         // host internals — a script is not a module
            "Oqtane",
            "Umbraco",
        };

        /// <summary>
        /// [Automation v2] Namespaces punched back through a deny prefix.
        ///
        /// The capability rail is asynchronous — `ctx.Actions.ExecuteNamedActionAsync(...)` hands
        /// back a Task — so `System.Threading.Tasks` has to be nameable or the whole rail is
        /// unreachable from a script. Denying it produced exactly that: every v2 script failed with
        /// "Namespace 'System.Threading' is not available to scripts (used here:
        /// System.Threading.Tasks.Task)". The rest of System.Threading — Thread, ThreadPool, Timer,
        /// Monitor — stays shut, and the members of Task that spawn background work are denied
        /// individually below.
        /// </summary>
        private static readonly string[] AllowedNamespaceExceptions =
        {
            "System.Threading.Tasks",
        };

        /// <summary>Types inside a denied namespace that a script legitimately needs to name.</summary>
        private static readonly HashSet<string> AllowedTypeExceptions = new HashSet<string>(StringComparer.Ordinal)
        {
            "System.Threading.CancellationToken",
        };

        /// <summary>
        /// Members that would let a script start work outliving the submit request. The run timeout
        /// bounds what the visitor waits for; it cannot bound a Task the script fired and forgot,
        /// and neither can the audit trail, which closes when the run does.
        /// </summary>
        private static readonly HashSet<string> DeniedMembers = new HashSet<string>(StringComparer.Ordinal)
        {
            "System.Threading.Tasks.Task.Run",
            "System.Threading.Tasks.Task.Factory",
            "System.Threading.Tasks.Task.ContinueWith",
            "System.Threading.Tasks.Task.Start",
        };

        /// <summary>Types inside the allowed Tasks namespace that are still not appropriate.</summary>
        private static readonly HashSet<string> DeniedTaskTypes = new HashSet<string>(StringComparer.Ordinal)
        {
            "System.Threading.Tasks.Parallel",
            "System.Threading.Tasks.TaskFactory",
            "System.Threading.Tasks.TaskScheduler",
        };

        /// <summary>
        /// MegaForm's own surface is allow-listed rather than deny-listed, because it grows.
        /// A deny-list here would have to be updated every time a namespace is added, and the
        /// failure mode of forgetting is that a script quietly gains reach — for instance
        /// MegaForm.Core.Services.WebhookService, whose whole job is to make an outbound HTTP
        /// call, and which has a public constructor a script could pass nulls to.
        /// </summary>
        private static readonly string[] AllowedMegaFormNamespaces =
        {
            "MegaForm.Core.Scripting",   // the context, ctx.Http / ctx.Db — the point of the feature
            "MegaForm.Core.Models",      // plain POCOs

            // [Automation v2] The capability rail itself: ctx.Actions, ctx.Api, ctx.Response and
            // the result types they hand back. Without this entry every v2 script fails with
            // "'MegaForm.Core.Automation.AutomationDbResult' is not available to scripts" — the
            // rail exists, is wired, is audited, and is unreachable. Caught by the test suite the
            // first time it ran, which is the second time this exact allow-list has silently
            // excluded the thing it was written to permit.
            "MegaForm.Core.Automation",

            // The script's OWN generated type lives here. Without this entry the pass rejects
            // every script ever written, including the one-liner in the starter snippet, with
            // "'MegaForm.Scripts.Generated.AfterSubmitScript_…' is not available to scripts" —
            // a message that reads like a compiler bug because it names a type the author never
            // typed. Caught by the test suite on its first run.
            ScriptSourceBuilder.GeneratedNamespace,
        };

        /// <summary>
        /// Types that live in an otherwise-allowed namespace (nearly all in plain `System`) and
        /// still hand a script the machine.
        /// </summary>
        private static readonly HashSet<string> DeniedTypeNames = new HashSet<string>(StringComparer.Ordinal)
        {
            "System.Activator",          // Activator.CreateInstance → anything
            "System.AppDomain",
            "System.RuntimeFieldHandle",
            "System.RuntimeMethodHandle",
            "System.RuntimeTypeHandle",
            "System.TypedReference",
            "System.Type",               // the door to System.Reflection from mscorlib
            "System.AppContext",
            "System.Console",
            "System.Delegate",
            "System.Environment",        // env vars, exit, machine name
            "System.GC",
            "System.MulticastDelegate",
            "System.OperatingSystem",
            "System.Type",
            "System.WeakReference",
            "System.Buffer",
            "System.IntPtr",
            "System.UIntPtr",
        };

        /// <summary>
        /// Inspect a bound tree and return everything the script is not allowed to reach.
        /// An empty list means the script may be emitted.
        /// </summary>
        public static List<ScriptPolicyViolation> Inspect(SyntaxTree tree, SemanticModel model)
        {
            var violations = new List<ScriptPolicyViolation>();
            var reported = new HashSet<string>(StringComparer.Ordinal);
            var root = tree.GetRoot();

            foreach (var node in root.DescendantNodes())
            {
                // Pointers and stackalloc never have a legitimate use in an after-submit hook,
                // and both sidestep the type system the rest of this pass depends on.
                if (node is PointerTypeSyntax || node is StackAllocArrayCreationExpressionSyntax)
                {
                    Add(violations, reported, node, "Unsafe code is not allowed in a script.");
                    continue;
                }

                if (!(node is ExpressionSyntax || node is TypeSyntax || node is AttributeSyntax))
                    continue;

                var info = model.GetSymbolInfo(node);
                var symbol = info.Symbol;
                if (symbol == null && info.CandidateSymbols.Length > 0)
                    symbol = info.CandidateSymbols[0];
                if (symbol == null) continue;

                // Member-level check, for the handful of cases where the TYPE is legitimately
                // reachable but one of its members is not (Task is needed; Task.Run is not).
                var deniedMember = DeniedMemberName(symbol);
                if (deniedMember != null)
                {
                    Add(violations, reported, node,
                        "'" + deniedMember + "' is not available to scripts — a script may not start " +
                        "work that outlives the submission.");
                    continue;
                }

                foreach (var type in TypesTouchedBy(symbol))
                {
                    string why;
                    if (IsDenied(type, out why))
                        Add(violations, reported, node, why);
                }
            }

            return violations;
        }

        /// <summary>
        /// Every type a single symbol reference drags in. Checking only the symbol's own
        /// containing type would miss `ctx.Something.ReturnsAFileStream()`, where the
        /// dangerous type arrives as a return value rather than as a written name.
        /// </summary>
        /// <summary>Fully-qualified member name when it is on the deny list, else null.</summary>
        private static string DeniedMemberName(ISymbol symbol)
        {
            if (symbol == null) return null;
            if (!(symbol is IMethodSymbol || symbol is IPropertySymbol)) return null;
            var owner = symbol.ContainingType;
            if (owner == null) return null;
            var full = owner.ToDisplayString() + "." + symbol.Name;
            return DeniedMembers.Contains(full) ? full : null;
        }

        private static IEnumerable<ITypeSymbol> TypesTouchedBy(ISymbol symbol)
        {
            var typeSymbol = symbol as ITypeSymbol;
            if (typeSymbol != null)
            {
                yield return typeSymbol;
                yield break;
            }

            if (symbol.ContainingType != null) yield return symbol.ContainingType;

            var method = symbol as IMethodSymbol;
            if (method != null)
            {
                if (method.ReturnType != null) yield return method.ReturnType;
                foreach (var p in method.Parameters)
                    if (p.Type != null) yield return p.Type;
                foreach (var t in method.TypeArguments)
                    if (t != null) yield return t;
                yield break;
            }

            var property = symbol as IPropertySymbol;
            if (property != null) { if (property.Type != null) yield return property.Type; yield break; }

            var field = symbol as IFieldSymbol;
            if (field != null) { if (field.Type != null) yield return field.Type; yield break; }

            var local = symbol as ILocalSymbol;
            if (local != null) { if (local.Type != null) yield return local.Type; yield break; }

            var parameter = symbol as IParameterSymbol;
            if (parameter != null) { if (parameter.Type != null) yield return parameter.Type; }
        }

        private static bool IsDenied(ITypeSymbol type, out string reason)
        {
            reason = null;
            if (type == null) return false;

            // `dynamic` resolves through the C# runtime binder, which is reflection wearing
            // a hat — it would route around every check in this file.
            if (type.TypeKind == TypeKind.Dynamic)
            {
                reason = "'dynamic' is not allowed in a script — it bypasses the compile-time checks.";
                return true;
            }

            if (type.TypeKind == TypeKind.Pointer)
            {
                reason = "Pointer types are not allowed in a script.";
                return true;
            }

            // Unwrap so `File[]`, `List<Process>` and `Nullable<T>` are all judged by what
            // they contain, not by the container.
            var array = type as IArrayTypeSymbol;
            if (array != null) return IsDenied(array.ElementType, out reason);

            var named = type as INamedTypeSymbol;
            if (named != null && named.TypeArguments.Length > 0)
            {
                foreach (var arg in named.TypeArguments)
                    if (IsDenied(arg, out reason)) return true;
            }

            if (type.SpecialType != SpecialType.None && type.SpecialType != SpecialType.System_Object)
            {
                // int/string/bool/… — always fine, and short-circuiting here keeps the pass cheap.
                return false;
            }

            var ns = NamespaceOf(type);
            var full = string.IsNullOrEmpty(ns) ? type.Name : ns + "." + type.Name;

            if (DeniedTypeNames.Contains(full) || DeniedTaskTypes.Contains(full))
            {
                reason = "'" + full + "' is not available to scripts.";
                return true;
            }

            // Narrow exceptions come before the deny prefixes, so a more specific allow wins over a
            // broader block — System.Threading.Tasks inside a denied System.Threading.
            if (AllowedTypeExceptions.Contains(full)) return false;
            for (int i = 0; i < AllowedNamespaceExceptions.Length; i++)
            {
                var allowed = AllowedNamespaceExceptions[i];
                if (ns == allowed || ns.StartsWith(allowed + ".", StringComparison.Ordinal)) return false;
            }

            if (ns.StartsWith("MegaForm.", StringComparison.Ordinal) || ns == "MegaForm")
            {
                for (int i = 0; i < AllowedMegaFormNamespaces.Length; i++)
                {
                    var allowed = AllowedMegaFormNamespaces[i];
                    if (ns == allowed || ns.StartsWith(allowed + ".", StringComparison.Ordinal))
                        return false;
                }
                reason = "'" + full + "' is not available to scripts. Scripts may use MegaForm.Core.Scripting and MegaForm.Core.Models only.";
                return true;
            }

            for (int i = 0; i < DeniedNamespacePrefixes.Length; i++)
            {
                var prefix = DeniedNamespacePrefixes[i];
                if (ns == prefix || ns.StartsWith(prefix + ".", StringComparison.Ordinal))
                {
                    reason = "Namespace '" + prefix + "' is not available to scripts (used here: " + full + ").";
                    return true;
                }
            }

            return false;
        }

        private static string NamespaceOf(ITypeSymbol type)
        {
            var ns = type.ContainingNamespace;
            if (ns == null || ns.IsGlobalNamespace) return string.Empty;
            return ns.ToDisplayString();
        }

        private static void Add(List<ScriptPolicyViolation> list, HashSet<string> reported,
                                SyntaxNode node, string message)
        {
            // GetMappedLineSpan honours the #line directive ScriptSourceBuilder emits, so the
            // author gets their own line numbers rather than the wrapper's.
            var span = node.GetLocation().GetMappedLineSpan();
            var line = span.StartLinePosition.Line + 1;
            var col = span.StartLinePosition.Character + 1;
            // Dedupe by LINE + message, not by column. One written expression binds several
            // symbols — `System.IO.File.ReadAllText(...)` reports at the column of `System`, of
            // `System.IO` and of `System.IO.File` — so a column-aware key showed the author the
            // same sentence three times for one mistake.
            var key = line + "|" + message;
            if (!reported.Add(key)) return;
            list.Add(new ScriptPolicyViolation { Line = line, Column = col, Message = message });
        }
    }
}
