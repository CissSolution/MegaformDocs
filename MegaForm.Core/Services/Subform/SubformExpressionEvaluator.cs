// ============================================================
// MegaForm.Core — Subform Expression Evaluator
//
// Tiny safe arithmetic evaluator for Subform compute formulas. Supports:
//   qty * price                       — column references
//   discount + tax - shipping         — arithmetic with + - * / %
//   Math.Round(qty * price, 2)        — Math.Round / Math.Min / Math.Max / Math.Abs
//   Sum(rows, "qty * price")          — aggregate over rows (row var = current row)
//
// Deliberate non-features (to keep sandbox safe by construction):
//   - No method calls except whitelisted Math.*
//   - No type references / reflection / IO / DB
//   - No assignment / control flow (no if/for/while)
//   - No string concat (numbers only)
//
// Future: swap to Roslyn CSharpScript + RestrictedRuntime for full Razor.
//
// Badge: SubformExpressionEvaluator v20260528-15
// ============================================================
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace MegaForm.Core.Services.Subform
{
    public class SubformExpressionEvaluator
    {
        private readonly Dictionary<string, object> _row;
        private readonly List<Dictionary<string, object>> _rows;

        public SubformExpressionEvaluator(Dictionary<string, object> row, List<Dictionary<string, object>> rows = null)
        {
            _row = row ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (_row.Comparer != StringComparer.OrdinalIgnoreCase)
                _row = new Dictionary<string, object>(_row, StringComparer.OrdinalIgnoreCase);
            _rows = rows ?? new List<Dictionary<string, object>>();
        }

        public decimal Evaluate(string expr)
        {
            if (string.IsNullOrWhiteSpace(expr)) return 0m;
            var tokens = Tokenize(expr);
            var rpn = ToRpn(tokens);
            return EvalRpn(rpn);
        }

        // ────────────────────────────────────────────────────────────
        //  Tokenizer
        // ────────────────────────────────────────────────────────────
        private enum TokType { Num, Ident, Op, LParen, RParen, Comma, String }
        private struct Tok { public TokType T; public string V; }

        private static readonly HashSet<string> OPS = new HashSet<string>(StringComparer.Ordinal) { "+","-","*","/","%" };
        private static readonly Dictionary<string,int> PREC = new Dictionary<string,int> { {"+",1},{"-",1},{"*",2},{"/",2},{"%",2} };

        private List<Tok> Tokenize(string s)
        {
            var list = new List<Tok>();
            int i = 0;
            while (i < s.Length)
            {
                char c = s[i];
                if (char.IsWhiteSpace(c)) { i++; continue; }
                if (char.IsDigit(c) || (c == '.' && i + 1 < s.Length && char.IsDigit(s[i+1])))
                {
                    int j = i;
                    while (j < s.Length && (char.IsDigit(s[j]) || s[j] == '.')) j++;
                    list.Add(new Tok { T = TokType.Num, V = s.Substring(i, j - i) });
                    i = j; continue;
                }
                if (char.IsLetter(c) || c == '_')
                {
                    int j = i;
                    while (j < s.Length && (char.IsLetterOrDigit(s[j]) || s[j] == '_' || s[j] == '.')) j++;
                    list.Add(new Tok { T = TokType.Ident, V = s.Substring(i, j - i) });
                    i = j; continue;
                }
                if (c == '"' || c == '\'')
                {
                    char q = c; int j = i + 1;
                    while (j < s.Length && s[j] != q) j++;
                    list.Add(new Tok { T = TokType.String, V = s.Substring(i + 1, j - i - 1) });
                    i = j + 1; continue;
                }
                if (c == '(') { list.Add(new Tok { T = TokType.LParen, V = "(" }); i++; continue; }
                if (c == ')') { list.Add(new Tok { T = TokType.RParen, V = ")" }); i++; continue; }
                if (c == ',') { list.Add(new Tok { T = TokType.Comma,  V = "," }); i++; continue; }
                if (OPS.Contains(c.ToString())) { list.Add(new Tok { T = TokType.Op, V = c.ToString() }); i++; continue; }
                throw new InvalidOperationException("Unexpected character: " + c);
            }
            return list;
        }

        // ────────────────────────────────────────────────────────────
        //  Shunting yard → RPN
        // ────────────────────────────────────────────────────────────
        private List<Tok> ToRpn(List<Tok> tokens)
        {
            var output = new List<Tok>();
            var ops = new Stack<Tok>();
            int prev = -1;
            for (int idx = 0; idx < tokens.Count; idx++)
            {
                var t = tokens[idx];
                if (t.T == TokType.Num || t.T == TokType.String) { output.Add(t); }
                else if (t.T == TokType.Ident)
                {
                    if (idx + 1 < tokens.Count && tokens[idx + 1].T == TokType.LParen)
                    {
                        // function call — push to op stack with marker
                        ops.Push(new Tok { T = TokType.Ident, V = t.V });
                    }
                    else
                    {
                        // variable reference (column or row.col)
                        output.Add(t);
                    }
                }
                else if (t.T == TokType.Comma)
                {
                    while (ops.Count > 0 && ops.Peek().T != TokType.LParen) output.Add(ops.Pop());
                    if (ops.Count == 0) throw new InvalidOperationException("Misplaced comma");
                }
                else if (t.T == TokType.Op)
                {
                    // Unary minus / plus handling
                    var isUnary = prev < 0 || tokens[prev].T == TokType.Op || tokens[prev].T == TokType.LParen || tokens[prev].T == TokType.Comma;
                    if (isUnary && (t.V == "-" || t.V == "+"))
                    {
                        output.Add(new Tok { T = TokType.Num, V = "0" });
                    }
                    while (ops.Count > 0 && ops.Peek().T == TokType.Op && PREC[ops.Peek().V] >= PREC[t.V]) output.Add(ops.Pop());
                    ops.Push(t);
                }
                else if (t.T == TokType.LParen) { ops.Push(t); }
                else if (t.T == TokType.RParen)
                {
                    while (ops.Count > 0 && ops.Peek().T != TokType.LParen) output.Add(ops.Pop());
                    if (ops.Count == 0) throw new InvalidOperationException("Mismatched parens");
                    ops.Pop(); // discard LParen
                    if (ops.Count > 0 && ops.Peek().T == TokType.Ident) output.Add(ops.Pop()); // function name
                }
                prev = idx;
            }
            while (ops.Count > 0)
            {
                var op = ops.Pop();
                if (op.T == TokType.LParen) throw new InvalidOperationException("Mismatched parens");
                output.Add(op);
            }
            return output;
        }

        // ────────────────────────────────────────────────────────────
        //  Evaluate RPN
        // ────────────────────────────────────────────────────────────
        private decimal EvalRpn(List<Tok> rpn)
        {
            var stack = new Stack<object>();
            foreach (var t in rpn)
            {
                if (t.T == TokType.Num)
                {
                    stack.Push(decimal.Parse(t.V, CultureInfo.InvariantCulture));
                }
                else if (t.T == TokType.String)
                {
                    stack.Push(t.V);
                }
                else if (t.T == TokType.Op)
                {
                    if (stack.Count < 2) throw new InvalidOperationException("Op missing operand: " + t.V);
                    var b = ToDec(stack.Pop());
                    var a = ToDec(stack.Pop());
                    switch (t.V)
                    {
                        case "+": stack.Push(a + b); break;
                        case "-": stack.Push(a - b); break;
                        case "*": stack.Push(a * b); break;
                        case "/": stack.Push(b == 0 ? 0 : a / b); break;
                        case "%": stack.Push(b == 0 ? 0 : a % b); break;
                    }
                }
                else if (t.T == TokType.Ident)
                {
                    // Function or variable
                    if (IsFunction(t.V))
                    {
                        var argCount = ArgCount(t.V);
                        if (stack.Count < argCount) throw new InvalidOperationException("Function " + t.V + " needs " + argCount + " args");
                        var args = new object[argCount];
                        for (int k = argCount - 1; k >= 0; k--) args[k] = stack.Pop();
                        stack.Push(CallFunction(t.V, args));
                    }
                    else
                    {
                        stack.Push(ToDec(LookupVar(t.V)));
                    }
                }
            }
            if (stack.Count != 1) throw new InvalidOperationException("Eval ended with " + stack.Count + " items on stack");
            return ToDec(stack.Pop());
        }

        // ────────────────────────────────────────────────────────────
        //  Helpers
        // ────────────────────────────────────────────────────────────
        private object LookupVar(string name)
        {
            // Direct column lookup
            if (_row != null && _row.TryGetValue(name, out var v)) return v;
            // Dot notation: row.col
            var dot = name.IndexOf('.');
            if (dot > 0)
            {
                var prefix = name.Substring(0, dot);
                var rest = name.Substring(dot + 1);
                if (string.Equals(prefix, "row", StringComparison.OrdinalIgnoreCase) && _row != null && _row.TryGetValue(rest, out var v2)) return v2;
            }
            return 0m;
        }

        private static readonly HashSet<string> FUNCS = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Sum","Avg","Min","Max","Count","Math.Round","Math.Min","Math.Max","Math.Abs","Math.Floor","Math.Ceiling",
            "Round","Abs","Floor","Ceiling","If"
        };
        private static bool IsFunction(string n) => FUNCS.Contains(n);

        private int ArgCount(string name)
        {
            switch (name.ToLowerInvariant())
            {
                case "math.round": case "round":      return 2;
                case "math.min":   case "math.max":   return 2;
                case "math.abs":   case "abs":        return 1;
                case "math.floor": case "floor":      return 1;
                case "math.ceiling": case "ceiling":  return 1;
                case "if":                            return 3;
                case "sum":                           return 1;  // Sum(expression) — uses _rows in scope
                case "avg":                           return 1;
                case "min":                           return 1;
                case "max":                           return 1;
                case "count":                         return 0;
            }
            return 1;
        }

        private object CallFunction(string name, object[] args)
        {
            switch (name.ToLowerInvariant())
            {
                case "math.round":
                case "round":
                    return Math.Round(ToDec(args[0]), (int)ToDec(args[1]), MidpointRounding.AwayFromZero);
                case "math.min": case "math.max":
                {
                    var x = ToDec(args[0]); var y = ToDec(args[1]);
                    return name.EndsWith("min", StringComparison.OrdinalIgnoreCase) ? Math.Min(x, y) : Math.Max(x, y);
                }
                case "math.abs": case "abs":      return Math.Abs(ToDec(args[0]));
                case "math.floor": case "floor":  return Math.Floor(ToDec(args[0]));
                case "math.ceiling": case "ceiling": return Math.Ceiling(ToDec(args[0]));
                case "if":
                {
                    var cond = ToDec(args[0]) != 0m;
                    return cond ? args[1] : args[2];
                }
                case "sum":   return AggOverRows(args[0], "sum");
                case "avg":   return AggOverRows(args[0], "avg");
                case "min":   return AggOverRows(args[0], "min");
                case "max":   return AggOverRows(args[0], "max");
                case "count": return (decimal)_rows.Count;
            }
            throw new InvalidOperationException("Unknown function: " + name);
        }

        private decimal AggOverRows(object exprArg, string op)
        {
            // Sum/Avg/Min/Max take a string expression like "qty * price" and evaluate per-row.
            // Or take a bare column name (passed as Ident at parse time — turns into LookupVar which
            // already evaluated to current row's value). For aggregate to work across rows we
            // require the expression as a STRING literal: Sum("qty * price").
            if (!(exprArg is string)) throw new InvalidOperationException("Sum/Avg/Min/Max requires a quoted expression: e.g. Sum(\"qty * price\")");
            var expr = (string)exprArg;
            if (_rows == null || _rows.Count == 0) return 0m;

            var results = new List<decimal>();
            foreach (var row in _rows)
            {
                var inner = new SubformExpressionEvaluator(row, _rows);
                try { results.Add(inner.Evaluate(expr)); } catch { /* skip bad row */ }
            }
            if (results.Count == 0) return 0m;
            switch (op)
            {
                case "sum": { decimal s = 0; foreach (var v in results) s += v; return s; }
                case "avg": { decimal s = 0; foreach (var v in results) s += v; return s / results.Count; }
                case "min": { var m = results[0]; foreach (var v in results) if (v < m) m = v; return m; }
                case "max": { var m = results[0]; foreach (var v in results) if (v > m) m = v; return m; }
            }
            return 0m;
        }

        private static decimal ToDec(object v)
        {
            if (v == null) return 0m;
            if (v is decimal d) return d;
            if (v is double dd) return (decimal)dd;
            if (v is float ff) return (decimal)ff;
            if (v is int i) return i;
            if (v is long l) return l;
            if (v is bool b) return b ? 1m : 0m;
            var s = Convert.ToString(v, CultureInfo.InvariantCulture);
            if (string.IsNullOrWhiteSpace(s)) return 0m;
            decimal r;
            if (decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out r)) return r;
            return 0m;
        }
    }
}
