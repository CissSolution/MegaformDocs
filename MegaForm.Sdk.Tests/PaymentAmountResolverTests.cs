using System.Collections.Generic;
using MegaForm.Core.Payments;
using Xunit;

namespace MegaForm.Sdk.Tests;

public class PaymentAmountResolverTests
{
    [Fact]
    public void ResolvesScalarAmount()
    {
        Assert.True(PaymentAmountResolver.TryResolve("$1,250.50", string.Empty, out var amount));
        Assert.Equal(1250.50m, amount);
    }

    [Fact]
    public void ResolvesSelectedCalculatorResult()
    {
        const string value = """
            {"variables":{"quantity":2},"results":{"subtotal":100,"payment_total":125.5}}
            """;

        Assert.True(PaymentAmountResolver.TryResolve(value, "payment_total", out var amount));
        Assert.Equal(125.5m, amount);
    }

    [Fact]
    public void ResolvesConventionalCalculatorResult()
    {
        const string value = """
            {"results":{"subtotal":100,"payment_total":125.5}}
            """;

        Assert.True(PaymentAmountResolver.TryResolve(value, string.Empty, out var amount));
        Assert.Equal(125.5m, amount);
    }

    [Fact]
    public void ResolvesOnlyNumericCalculatorResult()
    {
        const string value = """
            {"results":{"note":"estimate","final_due":87.25}}
            """;

        Assert.True(PaymentAmountResolver.TryResolve(value, string.Empty, out var amount));
        Assert.Equal(87.25m, amount);
    }

    [Fact]
    public void RejectsAmbiguousCalculatorResults()
    {
        const string value = """
            {"results":{"subtotal":100,"tax":25}}
            """;

        Assert.False(PaymentAmountResolver.TryResolve(value, string.Empty, out _));
    }

    [Fact]
    public void RejectsMissingSelectedCalculatorResult()
    {
        const string value = """
            {"results":{"total":100}}
            """;

        Assert.False(PaymentAmountResolver.TryResolve(value, "payment_total", out _));
    }

    [Fact]
    public void SumsMultiValueSource()
    {
        // Parity with the widget: a field that submits several checked values is
        // summed there, so the server must reach the same number or a legitimate
        // payer is rejected at submit time.
        var value = new List<object> { "25.50", 10 };

        Assert.True(PaymentAmountResolver.TryResolve(value, string.Empty, out var amount));
        Assert.Equal(35.50m, amount);
    }

    [Fact]
    public void RejectsListWithNoAmountInIt()
    {
        // Regression guard: a CLR list used to fall through to Convert.ToString and the
        // digits inside "System.Collections.Generic.List`1[System.Object]" parsed as 1.
        var value = new List<object> { "small", "large" };

        Assert.False(PaymentAmountResolver.TryResolve(value, string.Empty, out _));
    }
}
