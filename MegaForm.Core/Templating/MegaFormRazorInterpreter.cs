// MegaForm.Core.Templating.MegaFormRazorInterpreter
// Ported verbatim from CISS.SideMenu.Core.DdrEngine.DdrRazorInterpreter
// SOURCE: E:/CISS.SideMenu.Nuget_GPT/CISS.SideMenu.Nuget/src/Core/DdrEngine/DdrRazorInterpreter.cs
//
// MODEL SWAP NOTES:
//   CISS feeds a MenuXml/MenuNode tree. MegaForm feeds an arbitrary
//   IDictionary<string,object> row (typically a SQL row, JSON object, or
//   a submission payload). The @model directive declared by a customer
//   template is parsed and discarded (same as CISS) — actual evaluation
//   walks an IDictionary at runtime via GetProp/CallMethod hardcoded
//   switches plus the reflection fallback.

using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace MegaForm.Core.Templating
{
    /// <summary>
    /// Native Razor SUBSET parser — no Roslyn, no System.Web.WebPages,
    /// cross-platform .NET Framework 4.7.2 + .NET 9.
    ///
    /// SUPPORTED SUBSET:
    ///   Directives:
    ///     @using &lt;ns&gt;          — parsed and discarded
    ///     @inherits &lt;type&gt;     — parsed and discarded
    ///     @model &lt;type&gt;        — parsed and discarded
    ///   Code blocks:
    ///     @{ ... }                 — only `var x = expr;` declarations recognized
    ///   Helpers:
    ///     @helper Name(Type p) { body } — single-parameter, recursive calls supported
    ///   Control flow:
    ///     @if (cond) { ... } / @else { ... } / @else if (...) { ... }
    ///     @foreach (var x in coll) { ... }
    ///     return;                  — early exit of current Run loop
    ///   Output expressions:
    ///     @(expression)            — explicit parenthesized output
    ///     @identifier              — bare variable / property chain
    ///     @Identifier(args)        — helper invocation OR method-call fallback
    ///     @@                       — escape for literal @
    ///   Statement keywords (inside helper bodies, no leading @):
    ///     if, foreach, var, return;
    ///     plus statement-level method-call expressions executed for side effects
    ///   Expressions:
    ///     literals: "..." strings, int, true/false/null, string.Empty
    ///     ternary cond ? a : b (top-level, paren-aware)
    ///     string concatenation with + (top-level)
    ///     logical &amp;&amp; / || in boolean context
    ///     comparisons ==, !=, &gt;, &lt;, &gt;=, &lt;= (with subset-collision guards)
    ///     negation !expr
    ///     property chains a.b.c with mixed method calls a.b().c
    ///   Built-in functions:
    ///     string.IsNullOrEmpty / String.IsNullOrEmpty (with ! prefix)
    ///     String.Join(sep, arr) / string.Join over string[] | List&lt;string&gt; | IEnumerable&lt;string&gt;
    ///   Constructors:
    ///     new List&lt;string&gt;()          (literal form only)
    ///     new HtmlString(x)            (unwraps to inner string, no encoding)
    ///   String methods: Replace(a,b), Trim(), ToLower/ToLowerInvariant,
    ///                   ToUpper/ToUpperInvariant, Contains(x), StartsWith(x)
    ///   Collection methods: List&lt;string&gt; Add/ToArray/Any/Count
    ///   Misc: ICollection.Count, string.Length, string.Empty (static)
    ///   Generic reflection fallback for GetProp on unknown objects.
    ///
    /// UNSUPPORTED FEATURES (intentional; flag a re-port if needed):
    ///   @inject (DI / scoped services)
    ///   @await / async expressions
    ///   @section / @RenderSection / @RenderBody / layouts
    ///   @functions { ... } block (only @helper is supported)
    ///   @switch / case
    ///   @for (int i=0;...) / @while / @do  (only @foreach is parsed)
    ///   @try / @catch / @finally
    ///   Multi-parameter helpers (regex requires exactly one parameter)
    ///   Generic method calls (Linq Where/Select/OrderBy chains beyond Any/Count)
    ///   Lambda expressions (x =&gt; x.Foo)
    ///   Object/array initializers { Prop = val } / new[] { ... } / new T[] { ... }
    ///   Arithmetic operators -, *, /, % (only + for concatenation)
    ///   Compound assignment +=, -=, ++ (explicitly skipped by SplitTop op==`+` guard)
    ///   Indexer access arr[i] / dict["k"] (brackets tracked for paren matching only)
    ///   String interpolation $"..." / verbatim strings @"..."
    ///   char literals 'x'
    ///   decimal/double/float literals (only int.TryParse)
    ///   Method overload resolution / arguments other than 0–2 positional args
    ///   Static methods on arbitrary types (hardcoded string.IsNullOrEmpty + String.Join only)
    ///   User-defined classes / structs / extension methods inside the template
    ///   using-statement blocks, locks, yield
    ///   HTML encoding (raw Append — new HtmlString is a no-op pass-through)
    ///   @Html.* / @Url.* / @Dnn.* helpers (no helper namespaces wired in)
    ///   Razor comments @* ... *@ (not stripped)
    ///   Try / Cast operators (as / is / cast (T)x)
    /// </summary>
    public class MegaFormRazorInterpreter
    {
        // ════════════════════════════════════════════════
        //  PUBLIC API
        // ════════════════════════════════════════════════

        /// <summary>Parse .cshtml into reusable compiled form. Thread-safe result.</summary>
        public static ParsedTemplate Parse(string cshtml)
        {
            if (string.IsNullOrEmpty(cshtml)) return new ParsedTemplate();
            return new Parser(cshtml).Run();
        }

        /// <summary>Execute parsed template with an IDictionary row → HTML string.</summary>
        public static string Execute(ParsedTemplate tmpl, IDictionary<string, object> row)
        {
            if (tmpl == null) return "";
            var ctx = new ExecContext(tmpl, row ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase));
            ctx.Run(tmpl.Body);
            return ctx.Out.ToString();
        }

        /// <summary>One-shot parse + execute.</summary>
        public static string Render(string cshtml, IDictionary<string, object> row)
            => Execute(Parse(cshtml), row);

        // ════════════════════════════════════════════════
        //  AST
        // ════════════════════════════════════════════════

        public enum MfNType { Html, Expr, CodeBlock, If, ForEach, HelperCall, VarDecl, Return }

        public class MfNode
        {
            public MfNType Type;
            public string Text;          // html content, expr, var name
            public string Text2;         // var initializer
            public string Condition;     // if condition
            public string IterVar;       // foreach variable
            public string IterExpr;      // foreach collection
            public string HName;         // helper name
            public string HArgs;         // helper args
            public List<MfNode> Body = new List<MfNode>();
            public List<MfNode> Else;    // else clause (null = none)
        }

        public class MfHelperDef
        {
            public string Name;
            public string Param;         // parameter name (e.g. "pages")
            public List<MfNode> Body = new List<MfNode>();
        }

        public class ParsedTemplate
        {
            public List<MfNode> Body = new List<MfNode>();
            public Dictionary<string, MfHelperDef> Helpers = new Dictionary<string, MfHelperDef>(StringComparer.OrdinalIgnoreCase);
        }

        // ════════════════════════════════════════════════
        //  PARSER
        // ════════════════════════════════════════════════

        private class Parser
        {
            private readonly string _s;
            public Parser(string s) { _s = (s ?? "").Replace("\r\n", "\n").Replace("\r", "\n"); }

            public ParsedTemplate Run()
            {
                var t = new ParsedTemplate();
                var body = PreProcess(t);
                t.Body = ParseBlock(body);
                return t;
            }

            // Extract @using/@inherits/@model (skip) and @helper defs, return remaining body
            private string PreProcess(ParsedTemplate t)
            {
                var sb = new StringBuilder();
                int i = 0;
                while (i < _s.Length)
                {
                    if (_s[i] == '@')
                    {
                        var rest = _s.Substring(i);
                        // Skip directives
                        if (rest.StartsWith("@using ") || rest.StartsWith("@inherits ") || rest.StartsWith("@model "))
                        {
                            var eol = _s.IndexOf('\n', i);
                            i = eol < 0 ? _s.Length : eol + 1;
                            continue;
                        }
                        // Extract @helper
                        if (rest.StartsWith("@helper "))
                        {
                            var h = ExtractHelper(i);
                            if (h != null) { t.Helpers[h.Name] = h; i = h._endPos; continue; }
                        }
                    }
                    sb.Append(_s[i++]);
                }
                return sb.ToString();
            }

            private HelperDefWithPos ExtractHelper(int pos)
            {
                // @helper RenderRow(IDictionary<string,object> row) {
                var m = Regex.Match(_s.Substring(pos),
                    @"^@helper\s+(\w+)\s*\(\s*[\w<>\[\],\s]+\s+(\w+)\s*\)\s*\{", RegexOptions.Singleline);
                if (!m.Success) return null;

                int braceStart = pos + m.Length - 1;
                int braceEnd = MatchBrace(_s, braceStart);
                if (braceEnd < 0) return null;

                var bodyText = _s.Substring(braceStart + 1, braceEnd - braceStart - 1);
                return new HelperDefWithPos
                {
                    Name = m.Groups[1].Value,
                    Param = m.Groups[2].Value,
                    Body = ParseBlock(bodyText),
                    _endPos = braceEnd + 1
                };
            }

            private class HelperDefWithPos : MfHelperDef { public int _endPos; }

            // Parse a block of mixed HTML + Razor into node list
            private static List<MfNode> ParseBlock(string src)
            {
                var nodes = new List<MfNode>();
                var buf = new StringBuilder();
                int i = 0;

                while (i < src.Length)
                {
                    // @@ escape
                    if (src[i] == '@' && i + 1 < src.Length && src[i + 1] == '@')
                    {
                        buf.Append('@'); i += 2; continue;
                    }

                    // Razor @
                    if (src[i] == '@')
                    {
                        Flush(buf, nodes);
                        i++; // skip @
                        if (i >= src.Length) { buf.Append('@'); break; }

                        // @{ code block }
                        if (src[i] == '{')
                        {
                            int end = MatchBrace(src, i);
                            if (end > i) { nodes.AddRange(ParseStatements(src.Substring(i + 1, end - i - 1))); i = end + 1; }
                            else { buf.Append('@'); }
                            continue;
                        }

                        // @if
                        if (LookAt(src, i, "if ") || LookAt(src, i, "if("))
                        {
                            var nd = ParseIf(src, ref i);
                            if (nd != null) nodes.Add(nd);
                            continue;
                        }

                        // @foreach
                        if (LookAt(src, i, "foreach ") || LookAt(src, i, "foreach("))
                        {
                            var nd = ParseForEach(src, ref i);
                            if (nd != null) nodes.Add(nd);
                            continue;
                        }

                        // @(expr)
                        if (src[i] == '(')
                        {
                            int end = MatchParen(src, i);
                            if (end > i)
                            {
                                nodes.Add(new MfNode { Type = MfNType.Expr, Text = src.Substring(i + 1, end - i - 1) });
                                i = end + 1;
                            }
                            continue;
                        }

                        // @Identifier or @Identifier(args) — helper call or variable
                        if (char.IsLetter(src[i]))
                        {
                            int start = i;
                            while (i < src.Length && (char.IsLetterOrDigit(src[i]) || src[i] == '_' || src[i] == '.')) i++;
                            var ident = src.Substring(start, i - start);
                            if (i < src.Length && src[i] == '(')
                            {
                                int end = MatchParen(src, i);
                                if (end > i)
                                {
                                    var args = src.Substring(i + 1, end - i - 1);
                                    nodes.Add(new MfNode { Type = MfNType.HelperCall, HName = ident, HArgs = args });
                                    i = end + 1;
                                }
                            }
                            else
                            {
                                nodes.Add(new MfNode { Type = MfNType.Expr, Text = ident });
                            }
                            continue;
                        }

                        buf.Append('@'); // unknown @ — literal
                        continue;
                    }

                    // C# keywords at statement position (inside helper bodies)
                    if (IsStmtKeyword(src, i))
                    {
                        Flush(buf, nodes);

                        if (LookAt(src, i, "if ") || LookAt(src, i, "if("))
                        {
                            var nd = ParseIf(src, ref i);
                            if (nd != null) nodes.Add(nd);
                            continue;
                        }
                        if (LookAt(src, i, "foreach ") || LookAt(src, i, "foreach("))
                        {
                            var nd = ParseForEach(src, ref i);
                            if (nd != null) nodes.Add(nd);
                            continue;
                        }
                        if (LookAt(src, i, "return;"))
                        {
                            nodes.Add(new MfNode { Type = MfNType.Return }); i += 7; continue;
                        }
                        if (LookAt(src, i, "var "))
                        {
                            var nd = ParseVarDecl(src, ref i);
                            if (nd != null) nodes.Add(nd);
                            continue;
                        }
                        // Statement-level method call: ident.Method(args);
                        if (char.IsLetter(src[i]))
                        {
                            int semi = FindSemicolon(src, i);
                            if (semi > i)
                            {
                                var stmt = src.Substring(i, semi - i).Trim();
                                // treat as expression executed for side effects
                                nodes.Add(new MfNode { Type = MfNType.Expr, Text = stmt });
                                i = semi + 1;
                                continue;
                            }
                        }
                    }

                    buf.Append(src[i++]);
                }

                Flush(buf, nodes);
                return nodes;
            }

            private static MfNode ParseIf(string s, ref int i)
            {
                i += 2; // skip "if"
                SkipWS(s, ref i);
                var cond = ExtractParen(s, ref i);
                SkipWS(s, ref i);
                var body = ExtractBrace(s, ref i);

                var nd = new MfNode { Type = MfNType.If, Condition = cond, Body = ParseBlock(body) };

                SkipWS(s, ref i);
                if (LookAt(s, i, "else"))
                {
                    i += 4; SkipWS(s, ref i);
                    if (LookAt(s, i, "if ") || LookAt(s, i, "if("))
                    {
                        var elseIf = ParseIf(s, ref i);
                        nd.Else = new List<MfNode> { elseIf };
                    }
                    else
                    {
                        var elseTxt = ExtractBrace(s, ref i);
                        nd.Else = ParseBlock(elseTxt);
                    }
                }
                return nd;
            }

            private static MfNode ParseForEach(string s, ref int i)
            {
                i += 7; // skip "foreach"
                SkipWS(s, ref i);
                var paren = ExtractParen(s, ref i);
                SkipWS(s, ref i);
                var body = ExtractBrace(s, ref i);

                var m = Regex.Match(paren, @"var\s+(\w+)\s+in\s+(.+)", RegexOptions.Singleline);
                if (!m.Success) return null;

                return new MfNode
                {
                    Type = MfNType.ForEach,
                    IterVar = m.Groups[1].Value,
                    IterExpr = m.Groups[2].Value.Trim(),
                    Body = ParseBlock(body)
                };
            }

            private static MfNode ParseVarDecl(string s, ref int i)
            {
                int semi = FindSemicolon(s, i);
                if (semi < 0) return null;
                var line = s.Substring(i, semi - i).Trim();
                i = semi + 1;
                if (!line.StartsWith("var ")) return null;
                int eq = FindTopLevel(line, '=');
                if (eq < 0) return null;
                return new MfNode
                {
                    Type = MfNType.VarDecl,
                    Text = line.Substring(4, eq - 4).Trim(),
                    Text2 = line.Substring(eq + 1).Trim()
                };
            }

            private static List<MfNode> ParseStatements(string code)
            {
                var nodes = new List<MfNode>();
                var stmts = SplitSemicolons(code);
                foreach (var stmt in stmts)
                {
                    var s = stmt.Trim();
                    if (s.Length == 0) continue;
                    if (s.StartsWith("var "))
                    {
                        int eq = FindTopLevel(s, '=');
                        if (eq > 0)
                            nodes.Add(new MfNode
                            {
                                Type = MfNType.VarDecl,
                                Text = s.Substring(4, eq - 4).Trim(),
                                Text2 = s.Substring(eq + 1).Trim()
                            });
                    }
                }
                return nodes;
            }

            // ── Parse utilities ──

            private static bool LookAt(string s, int i, string pat)
                => i + pat.Length <= s.Length && s.Substring(i, pat.Length) == pat;

            private static void SkipWS(string s, ref int i)
            { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

            private static string ExtractParen(string s, ref int i)
            {
                if (i >= s.Length || s[i] != '(') return "";
                int end = MatchParen(s, i);
                if (end < 0) { i++; return ""; }
                var r = s.Substring(i + 1, end - i - 1);
                i = end + 1;
                return r;
            }

            private static string ExtractBrace(string s, ref int i)
            {
                SkipWS(s, ref i);
                if (i >= s.Length || s[i] != '{') return "";
                int end = MatchBrace(s, i);
                if (end < 0) { i++; return ""; }
                var r = s.Substring(i + 1, end - i - 1);
                i = end + 1;
                return r;
            }

            private static bool IsStmtKeyword(string s, int i)
            {
                if (i > 0 && !IsStmtBoundary(s[i - 1])) return false;
                return LookAt(s, i, "if ") || LookAt(s, i, "if(")
                    || LookAt(s, i, "foreach ") || LookAt(s, i, "foreach(")
                    || LookAt(s, i, "var ") || LookAt(s, i, "return;");
            }

            private static bool IsStmtBoundary(char c)
                => c == '\n' || c == '{' || c == '}' || c == ';' || char.IsWhiteSpace(c);

            private static void Flush(StringBuilder buf, List<MfNode> nodes)
            {
                if (buf.Length == 0) return;
                nodes.Add(new MfNode { Type = MfNType.Html, Text = buf.ToString() });
                buf.Clear();
            }

            private static int FindSemicolon(string s, int from)
            {
                int d = 0; bool q = false;
                for (int i = from; i < s.Length; i++)
                {
                    char c = s[i];
                    if (c == '"' && (i == 0 || s[i - 1] != '\\')) q = !q;
                    if (q) continue;
                    if (c == '(' || c == '{' || c == '[') d++;
                    if (c == ')' || c == '}' || c == ']') d--;
                    if (c == ';' && d == 0) return i;
                }
                return -1;
            }

            private static int FindTopLevel(string s, char target)
            {
                int d = 0; bool q = false;
                for (int i = 0; i < s.Length; i++)
                {
                    char c = s[i];
                    if (c == '"' && (i == 0 || s[i - 1] != '\\')) q = !q;
                    if (q) continue;
                    if (c == '(' || c == '{' || c == '[') d++;
                    if (c == ')' || c == '}' || c == ']') d--;
                    if (c == target && d == 0) return i;
                }
                return -1;
            }

            private static List<string> SplitSemicolons(string code)
            {
                var r = new List<string>();
                int d = 0; bool q = false; int start = 0;
                for (int i = 0; i < code.Length; i++)
                {
                    char c = code[i];
                    if (c == '"' && (i == 0 || code[i - 1] != '\\')) q = !q;
                    if (q) continue;
                    if (c == '(' || c == '{' || c == '[') d++;
                    if (c == ')' || c == '}' || c == ']') d--;
                    if (c == ';' && d == 0) { r.Add(code.Substring(start, i - start)); start = i + 1; }
                }
                if (start < code.Length) r.Add(code.Substring(start));
                return r;
            }
        }

        // ════════════════════════════════════════════════
        //  SHARED: brace/paren matching
        // ════════════════════════════════════════════════

        internal static int MatchBrace(string s, int open)
        {
            if (open >= s.Length || s[open] != '{') return -1;
            int d = 1; bool q = false;
            for (int i = open + 1; i < s.Length; i++)
            {
                char c = s[i];
                if (c == '"' && (i == 0 || s[i - 1] != '\\')) q = !q;
                if (q) continue;
                if (c == '{') d++;
                if (c == '}') { d--; if (d == 0) return i; }
            }
            return -1;
        }

        internal static int MatchParen(string s, int open)
        {
            if (open >= s.Length || s[open] != '(') return -1;
            int d = 1; bool q = false;
            for (int i = open + 1; i < s.Length; i++)
            {
                char c = s[i];
                if (c == '"' && (i == 0 || s[i - 1] != '\\')) q = !q;
                if (q) continue;
                if (c == '(') d++;
                if (c == ')') { d--; if (d == 0) return i; }
            }
            return -1;
        }

        // ════════════════════════════════════════════════
        //  EXECUTION ENGINE
        // ════════════════════════════════════════════════

        private class ExecContext
        {
            public readonly StringBuilder Out = new StringBuilder();
            private readonly ParsedTemplate _tmpl;
            private readonly IDictionary<string, object> _row;
            private readonly Dictionary<string, object> _vars = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            private bool _ret;

            public ExecContext(ParsedTemplate tmpl, IDictionary<string, object> row)
            {
                _tmpl = tmpl;
                _row = row;
                // MegaForm model contract — Model exposes the row dictionary directly.
                // Templates can use @Model.FieldName or @Row.FieldName interchangeably.
                _vars["Model"] = row;
                _vars["Row"] = row;
            }

            // Child scope for helper calls
            private ExecContext(ExecContext parent, string paramName, object paramValue)
            {
                Out = parent.Out;
                _tmpl = parent._tmpl;
                _row = parent._row;
                foreach (var kv in parent._vars) _vars[kv.Key] = kv.Value;
                _vars[paramName] = paramValue;
            }

            public void Run(List<MfNode> nodes)
            {
                foreach (var n in nodes)
                {
                    if (_ret) return;
                    Exec(n);
                }
            }

            private void Exec(MfNode n)
            {
                switch (n.Type)
                {
                    case MfNType.Html:
                        Out.Append(n.Text);
                        break;

                    case MfNType.Expr:
                        var v = Eval(n.Text);
                        if (v != null) Out.Append(v);
                        break;

                    case MfNType.VarDecl:
                        _vars[n.Text] = Eval(n.Text2);
                        break;

                    case MfNType.CodeBlock:
                        Run(n.Body);
                        break;

                    case MfNType.If:
                        if (EvalBool(n.Condition)) Run(n.Body);
                        else if (n.Else != null) Run(n.Else);
                        break;

                    case MfNType.ForEach:
                        var coll = Eval(n.IterExpr);
                        if (coll is IEnumerable en)
                            foreach (var item in en)
                            {
                                if (_ret) return;
                                _vars[n.IterVar] = item;
                                Run(n.Body);
                            }
                        break;

                    case MfNType.HelperCall:
                        if (_tmpl.Helpers.TryGetValue(n.HName, out var h))
                        {
                            var arg = Eval(n.HArgs);
                            var child = new ExecContext(this, h.Param, arg);
                            child.Run(h.Body);
                        }
                        else
                        {
                            // Not a helper — try as expression with method call
                            var result = Eval(n.HName + "(" + n.HArgs + ")");
                            if (result != null) Out.Append(result);
                        }
                        break;

                    case MfNType.Return:
                        _ret = true;
                        break;
                }
            }

            // ── Expression evaluator ──

            private object Eval(string expr)
            {
                if (string.IsNullOrWhiteSpace(expr)) return null;
                expr = expr.Trim();

                // String concatenation (+)
                var plusParts = SplitTop(expr, '+');
                if (plusParts.Count > 1)
                {
                    var sb = new StringBuilder();
                    foreach (var p in plusParts) sb.Append(Eval(p.Trim())?.ToString() ?? "");
                    return sb.ToString();
                }

                // Ternary: c ? a : b
                var tern = SplitTernary(expr);
                if (tern != null) return EvalBool(tern[0]) ? Eval(tern[1]) : Eval(tern[2]);

                // Outer parens
                if (expr.StartsWith("(") && MatchParen(expr, 0) == expr.Length - 1)
                    return Eval(expr.Substring(1, expr.Length - 2));

                // String literal
                if (expr.StartsWith("\"") && expr.EndsWith("\""))
                    return expr.Substring(1, expr.Length - 2).Replace("\\\"", "\"").Replace("\\\\", "\\");

                // Numeric
                if (int.TryParse(expr, out int iv)) return iv;

                // Boolean / null / string.Empty
                if (expr == "true") return true;
                if (expr == "false") return false;
                if (expr == "null") return null;
                if (expr == "string.Empty" || expr == "String.Empty") return "";

                // string.IsNullOrEmpty(x) / !string.IsNullOrEmpty(x)
                bool neg = expr.StartsWith("!");
                var eff = neg ? expr.Substring(1) : expr;
                if (eff.StartsWith("string.IsNullOrEmpty(") || eff.StartsWith("String.IsNullOrEmpty("))
                {
                    var inner = eff.Substring(eff.IndexOf('(') + 1, eff.Length - eff.IndexOf('(') - 2);
                    bool r = string.IsNullOrEmpty(Eval(inner)?.ToString());
                    return neg ? !r : (object)r;
                }

                // String.Join(sep, arr)
                if (eff.StartsWith("String.Join(") || eff.StartsWith("string.Join("))
                {
                    var args = eff.Substring(eff.IndexOf('(') + 1, eff.Length - eff.IndexOf('(') - 2);
                    int comma = FindTopLevelComma(args);
                    if (comma > 0)
                    {
                        var sep = Eval(args.Substring(0, comma))?.ToString() ?? "";
                        var arr = Eval(args.Substring(comma + 1).Trim());
                        if (arr is string[] sa) return string.Join(sep, sa);
                        if (arr is List<string> sl) return string.Join(sep, sl);
                        if (arr is IEnumerable<string> se) return string.Join(sep, se);
                    }
                    return "";
                }

                // new List<string>()
                if (expr == "new List<string>()") return new List<string>();

                // new HtmlString(x)
                if (expr.StartsWith("new HtmlString(") && expr.EndsWith(")"))
                    return Eval(expr.Substring(15, expr.Length - 16))?.ToString() ?? "";

                // Negation
                if (neg) return !Truthy(Eval(expr.Substring(1)));

                // Property chain / method calls
                return EvalChain(expr);
            }

            private object EvalChain(string expr)
            {
                // Split by . respecting parentheses
                var segs = new List<(string name, bool isMethod, string args)>();
                int i = 0;
                var name = new StringBuilder();
                while (i < expr.Length)
                {
                    char c = expr[i];
                    if (c == '.')
                    {
                        if (name.Length > 0) { segs.Add((name.ToString(), false, null)); name.Clear(); }
                        i++; continue;
                    }
                    if (c == '(')
                    {
                        int end = MatchParen(expr, i);
                        var args = end > i ? expr.Substring(i + 1, end - i - 1) : "";
                        segs.Add((name.ToString(), true, args));
                        name.Clear();
                        i = end + 1;
                        if (i < expr.Length && expr[i] == '.') i++;
                        continue;
                    }
                    name.Append(c); i++;
                }
                if (name.Length > 0) segs.Add((name.ToString(), false, null));
                if (segs.Count == 0) return null;

                // Resolve first segment
                object cur;
                var s0 = segs[0];
                if (s0.isMethod)
                {
                    cur = _vars.TryGetValue(s0.name, out var v0) ? v0 : null;
                    cur = CallMethod(cur, s0.name, s0.args);
                }
                else
                {
                    if (_vars.TryGetValue(s0.name, out var v0))
                    {
                        cur = v0;
                    }
                    else if (_row != null && _row.TryGetValue(s0.name, out var rv))
                    {
                        // Implicit row-field lookup (template can write @FieldName without @Row./@Model. prefix)
                        cur = rv;
                    }
                    else
                    {
                        cur = null;
                    }
                }

                // Walk rest
                for (int j = 1; j < segs.Count; j++)
                {
                    if (cur == null) return null;
                    var sg = segs[j];
                    if (sg.isMethod)
                        cur = CallMethod(cur, sg.name, sg.args);
                    else
                        cur = GetProp(cur, sg.name);
                }
                return cur;
            }

            private object GetProp(object obj, string prop)
            {
                if (obj == null) return null;

                // MegaForm row contract: IDictionary<string,object> → key lookup
                if (obj is IDictionary<string, object> dict)
                {
                    if (dict.TryGetValue(prop, out var dv)) return dv;
                    // Case-insensitive fallback (template may use PascalCase against a lowercase row)
                    foreach (var kv in dict)
                        if (string.Equals(kv.Key, prop, StringComparison.OrdinalIgnoreCase))
                            return kv.Value;
                    return null;
                }
                // Generic non-generic IDictionary (e.g. Hashtable, ListDictionary)
                if (obj is IDictionary nonGenDict)
                {
                    if (nonGenDict.Contains(prop)) return nonGenDict[prop];
                    foreach (var key in nonGenDict.Keys)
                        if (key is string ks && string.Equals(ks, prop, StringComparison.OrdinalIgnoreCase))
                            return nonGenDict[key];
                    return null;
                }

                if (obj is ICollection col && prop == "Count") return col.Count;
                if (obj is string s && prop == "Length") return s.Length;
                if (obj is string && prop == "Empty") return "";

                // Reflection fallback
                // TODO [LOW][SECURITY] Generic GetProperty/GetField walks any
                // public member by name on whatever object the host injected
                // into the row dictionary. If a caller ever stuffs a DNN
                // PortalSettings, UserInfo or HttpContext into the row bag
                // (currently not done — bags are pure JSON/SQL primitives) a
                // template author could read internal state. Mitigation:
                // restrict reflection to a whitelist of [Mf.Templating.Safe]-
                // attributed types, or refuse reflection when the host type
                // namespace begins with "DotNetNuke." / "System.Web.".
                try
                {
                    var pi = obj.GetType().GetProperty(prop);
                    if (pi != null) return pi.GetValue(obj);
                    var fi = obj.GetType().GetField(prop);
                    if (fi != null) return fi.GetValue(obj);
                }
                catch { }
                return null;
            }

            private object CallMethod(object obj, string method, string args)
            {
                // IDictionary helpers
                if (obj is IDictionary<string, object> dict)
                {
                    if (method == "ContainsKey") return dict.ContainsKey(Eval(args)?.ToString() ?? "");
                    if (method == "Keys") return new List<string>(dict.Keys);
                    if (method == "Count") return dict.Count;
                    if (method == "Any") return dict.Count > 0;
                }
                if (obj is List<string> sl)
                {
                    if (method == "Add") { sl.Add(Eval(args)?.ToString() ?? ""); return null; }
                    if (method == "ToArray") return sl.ToArray();
                    if (method == "Any") return sl.Any();
                    if (method == "Count") return sl.Count;
                }
                if (obj is IEnumerable<object> meo)
                {
                    if (method == "Any") return meo.Any();
                    if (method == "Count") return meo.Count();
                }
                if (obj is string str)
                {
                    if (method == "Replace")
                    {
                        int c = FindTopLevelComma(args);
                        if (c > 0) return str.Replace(Eval(args.Substring(0, c))?.ToString() ?? "", Eval(args.Substring(c + 1))?.ToString() ?? "");
                    }
                    if (method == "Trim") return str.Trim();
                    if (method == "ToLower" || method == "ToLowerInvariant") return str.ToLowerInvariant();
                    if (method == "ToUpper" || method == "ToUpperInvariant") return str.ToUpperInvariant();
                    if (method == "Contains") return str.Contains(Eval(args)?.ToString() ?? "");
                    if (method == "StartsWith") return str.StartsWith(Eval(args)?.ToString() ?? "");
                }
                // Generic IEnumerable fallback for Any/Count
                if (obj is IEnumerable en)
                {
                    if (method == "Any")
                    {
                        foreach (var _ in en) return true;
                        return false;
                    }
                    if (method == "Count")
                    {
                        int n = 0;
                        foreach (var _ in en) n++;
                        return n;
                    }
                }
                return null;
            }

            // ── Condition evaluator ──

            private bool EvalBool(string expr)
            {
                if (string.IsNullOrWhiteSpace(expr)) return false;
                expr = expr.Trim();
                if (expr.StartsWith("(") && MatchParen(expr, 0) == expr.Length - 1)
                    expr = expr.Substring(1, expr.Length - 2).Trim();

                // &&
                var parts = SplitLogical(expr, "&&");
                if (parts.Count > 1) return parts.All(p => EvalBool(p));

                // ||
                parts = SplitLogical(expr, "||");
                if (parts.Count > 1) return parts.Any(p => EvalBool(p));

                // Comparison operators
                string[] ops = { "!=", "==", ">=", "<=", ">", "<" };
                foreach (var op in ops)
                {
                    var lr = SplitCmp(expr, op);
                    if (lr != null)
                    {
                        var l = Eval(lr[0]); var r = Eval(lr[1]);
                        switch (op)
                        {
                            case "==": return Eq(l, r);
                            case "!=": return !Eq(l, r);
                            case ">":  return ToInt(l) > ToInt(r);
                            case "<":  return ToInt(l) < ToInt(r);
                            case ">=": return ToInt(l) >= ToInt(r);
                            case "<=": return ToInt(l) <= ToInt(r);
                        }
                    }
                }

                // Negation
                if (expr.StartsWith("!")) return !EvalBool(expr.Substring(1).Trim());

                return Truthy(Eval(expr));
            }

            private static bool Truthy(object v)
            {
                if (v == null) return false;
                if (v is bool b) return b;
                if (v is int i) return i != 0;
                if (v is string s) return s.Length > 0;
                return true;
            }

            private static bool Eq(object l, object r)
            {
                if (l == null && r == null) return true;
                if (l == null || r == null) return false;
                return l.ToString() == r.ToString();
            }

            private static int ToInt(object v)
            {
                if (v is int i) return i;
                if (v is bool b) return b ? 1 : 0;
                if (v != null && int.TryParse(v.ToString(), out int r)) return r;
                return 0;
            }

            // ── Split utilities ──

            private static List<string> SplitTop(string s, char op)
            {
                var r = new List<string>();
                int d = 0; bool q = false; int start = 0;
                for (int i = 0; i < s.Length; i++)
                {
                    char c = s[i];
                    if (c == '"' && (i == 0 || s[i - 1] != '\\')) q = !q;
                    if (q) continue;
                    if (c == '(' || c == '[' || c == '{') d++;
                    if (c == ')' || c == ']' || c == '}') d--;
                    if (c == op && d == 0)
                    {
                        if (op == '+' && i + 1 < s.Length && (s[i + 1] == '+' || s[i + 1] == '=')) continue;
                        r.Add(s.Substring(start, i - start)); start = i + 1;
                    }
                }
                r.Add(s.Substring(start));
                return r.Count > 1 ? r : new List<string>();
            }

            private static string[] SplitTernary(string expr)
            {
                int d = 0; bool q = false;
                for (int i = 0; i < expr.Length; i++)
                {
                    char c = expr[i];
                    if (c == '"' && (i == 0 || expr[i - 1] != '\\')) q = !q;
                    if (q) continue;
                    if (c == '(' || c == '[') d++;
                    if (c == ')' || c == ']') d--;
                    if (c == '?' && d == 0)
                    {
                        int d2 = 0;
                        for (int j = i + 1; j < expr.Length; j++)
                        {
                            char c2 = expr[j];
                            if (c2 == '"' && (j == 0 || expr[j - 1] != '\\')) q = !q;
                            if (q) continue;
                            if (c2 == '(' || c2 == '[') d2++;
                            if (c2 == ')' || c2 == ']') d2--;
                            if (c2 == ':' && d2 == 0)
                                return new[] { expr.Substring(0, i).Trim(), expr.Substring(i + 1, j - i - 1).Trim(), expr.Substring(j + 1).Trim() };
                        }
                    }
                }
                return null;
            }

            private static List<string> SplitLogical(string s, string op)
            {
                var r = new List<string>();
                int d = 0; bool q = false; int start = 0;
                for (int i = 0; i < s.Length - 1; i++)
                {
                    char c = s[i];
                    if (c == '"' && (i == 0 || s[i - 1] != '\\')) q = !q;
                    if (q) continue;
                    if (c == '(' || c == '[') d++;
                    if (c == ')' || c == ']') d--;
                    if (d == 0 && s.Substring(i, 2) == op)
                    {
                        r.Add(s.Substring(start, i - start).Trim());
                        start = i + 2; i++;
                    }
                }
                r.Add(s.Substring(start).Trim());
                return r.Count > 1 ? r : new List<string> { s };
            }

            private static string[] SplitCmp(string s, string op)
            {
                int d = 0; bool q = false;
                for (int i = 0; i <= s.Length - op.Length; i++)
                {
                    char c = s[i];
                    if (c == '"' && (i == 0 || s[i - 1] != '\\')) q = !q;
                    if (q) continue;
                    if (c == '(' || c == '[') d++;
                    if (c == ')' || c == ']') d--;
                    if (d == 0 && s.Substring(i, op.Length) == op)
                    {
                        // Avoid matching subset: > inside >=, < inside <=, = inside != or ==
                        if (op == ">" && i + 1 < s.Length && s[i + 1] == '=') continue;
                        if (op == "<" && i + 1 < s.Length && s[i + 1] == '=') continue;
                        if (op.Length == 1 && op[0] == '=' && i > 0 && (s[i - 1] == '!' || s[i - 1] == '>' || s[i - 1] == '<')) continue;
                        return new[] { s.Substring(0, i).Trim(), s.Substring(i + op.Length).Trim() };
                    }
                }
                return null;
            }

            private static int FindTopLevelComma(string s)
            {
                int d = 0; bool q = false;
                for (int i = 0; i < s.Length; i++)
                {
                    char c = s[i];
                    if (c == '"' && (i == 0 || s[i - 1] != '\\')) q = !q;
                    if (q) continue;
                    if (c == '(' || c == '[') d++;
                    if (c == ')' || c == ']') d--;
                    if (c == ',' && d == 0) return i;
                }
                return -1;
            }
        }
    }
}
