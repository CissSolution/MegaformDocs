using System.Collections.Generic;
using System.Reflection;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using MegaForm.Core.Payments;
using Xunit;

namespace MegaForm.Sdk.Tests;

/// <summary>
/// [PAY-4 v20260730] Guards the server-side price resolution in PaymentSubmissionVerifier.
///
/// The bug these tests lock out: amountMode="listenTotals" returned Mode="bounds" with no
/// Amount and, unless the designer had typed minAmount/maxAmount, no Min and no Max either.
/// CheckExpectedPrice then accepted ANY captured amount above zero, so a 1,050 EUR cart could
/// be settled with a 0.01 EUR capture and stored as verified - BuildVerifiedValue rewrites the
/// recorded amount from the gateway, so the stored row looked perfectly consistent.
/// </summary>
public class PaymentExpectedPriceTests
{
    // ── helpers ──────────────────────────────────────────────────────────────

    private static PaymentSubmissionVerifier NewVerifier()
        => new PaymentSubmissionVerifier(new StubGatewayStore(), new InMemorySubmissionRepository(), null);

    private static FormField PaymentField(Dictionary<string, object> props, string key = "payment")
        => new FormField { Key = key, Type = "Payment", Label = "Payment", WidgetProps = props };

    /// <summary>
    /// ResolveExpectedPrice and its ExpectedPrice result are private on purpose - the price
    /// decision is not public surface. Reflection keeps the assertion on the exact unit that
    /// changed instead of only on its downstream effect.
    /// </summary>
    private static (string Mode, decimal? Amount, decimal? Min, decimal? Max, string Currency) Resolve(
        Dictionary<string, object> props, Dictionary<string, object> formData = null)
    {
        var verifier = NewVerifier();
        var method = typeof(PaymentSubmissionVerifier).GetMethod("ResolveExpectedPrice",
            BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(method);

        var result = method!.Invoke(verifier, new object[]
        {
            PaymentField(props), props, formData ?? new Dictionary<string, object>()
        });
        Assert.NotNull(result);

        var type = result!.GetType();
        return (
            (string)type.GetField("Mode")!.GetValue(result)!,
            (decimal?)type.GetField("Amount")!.GetValue(result),
            (decimal?)type.GetField("Min")!.GetValue(result),
            (decimal?)type.GetField("Max")!.GetValue(result),
            (string)type.GetField("Currency")!.GetValue(result)!
        );
    }

    // ── the fix ──────────────────────────────────────────────────────────────

    [Fact]
    public void ListenTotalsWithoutBoundsIsUnresolvedNotOpenEnded()
    {
        var resolved = Resolve(new Dictionary<string, object>
        {
            ["amountMode"] = "listenTotals",
            ["currency"] = "EUR"
        });

        Assert.Equal("unresolved", resolved.Mode);
    }

    [Theory]
    [InlineData("listenTotals")]
    [InlineData("listentotals")]
    [InlineData("  LISTENTOTALS  ")]
    public void ListenTotalsUnresolvedRegardlessOfCasingOrPadding(string mode)
    {
        Assert.Equal("unresolved", Resolve(new Dictionary<string, object> { ["amountMode"] = mode }).Mode);
    }

    [Fact]
    public void ListenTotalsWithZeroBoundsIsStillUnresolved()
    {
        // The payment widget's own defaults are minAmount: 0 / maxAmount: 0, and ReadDecimal
        // only returns a value when it parses above zero. Zeros must therefore NOT read as
        // "the designer declared a guard".
        var resolved = Resolve(new Dictionary<string, object>
        {
            ["amountMode"] = "listenTotals",
            ["minAmount"] = "0",
            ["maxAmount"] = "0"
        });

        Assert.Equal("unresolved", resolved.Mode);
    }

    [Fact]
    public void ListenTotalsWithDeclaredBoundsKeepsBoundsChecking()
    {
        var resolved = Resolve(new Dictionary<string, object>
        {
            ["amountMode"] = "listenTotals",
            ["minAmount"] = "10",
            ["maxAmount"] = "2000",
            ["currency"] = "EUR"
        });

        Assert.Equal("bounds", resolved.Mode);
        Assert.Null(resolved.Amount);
        Assert.Equal(10m, resolved.Min);
        Assert.Equal(2000m, resolved.Max);
        Assert.Equal("EUR", resolved.Currency);
    }

    [Fact]
    public void ListenTotalsWithOnlyAMinimumIsAcceptedAsADeclaredGuard()
    {
        var resolved = Resolve(new Dictionary<string, object>
        {
            ["amountMode"] = "listenTotals",
            ["minAmount"] = "25"
        });

        Assert.Equal("bounds", resolved.Mode);
        Assert.Equal(25m, resolved.Min);
        Assert.Null(resolved.Max);
    }

    [Fact]
    public void ListenTotalsWithOnlyAMaximumIsAcceptedAsADeclaredGuard()
    {
        var resolved = Resolve(new Dictionary<string, object>
        {
            ["amountMode"] = "listenTotals",
            ["maxAmount"] = "500"
        });

        Assert.Equal("bounds", resolved.Mode);
        Assert.Null(resolved.Min);
        Assert.Equal(500m, resolved.Max);
    }

    // ── regression guards for the modes that already worked ──────────────────

    [Fact]
    public void FieldModeResolvesTheInvoiceTotalFromSubmittedData()
    {
        // This is the wiring an invoice must use: the DataGrid writes its computed total into a
        // plain Number field and the payment field re-derives from that same submitted value.
        var resolved = Resolve(
            new Dictionary<string, object>
            {
                ["amountMode"] = "field",
                ["amountFieldKey"] = "grand_total",
                ["currency"] = "EUR"
            },
            new Dictionary<string, object> { ["grand_total"] = "1050.00" });

        Assert.Equal("field", resolved.Mode);
        Assert.Equal(1050.00m, resolved.Amount);
        Assert.Equal("EUR", resolved.Currency);
    }

    [Fact]
    public void FieldModeResolvesACalculatorEnvelopeThroughItsResultKey()
    {
        var resolved = Resolve(
            new Dictionary<string, object>
            {
                ["amountMode"] = "field",
                ["amountFieldKey"] = "invoice_calc",
                ["amountFieldResultKey"] = "amount_due"
            },
            new Dictionary<string, object>
            {
                ["invoice_calc"] = """{"variables":{"subtotal":1000},"results":{"subtotal":1000,"amount_due":1207.5}}"""
            });

        Assert.Equal("field", resolved.Mode);
        Assert.Equal(1207.50m, resolved.Amount);
    }

    [Fact]
    public void FieldModeStaysFailClosedWhenTheSourceIsMissing()
    {
        var resolved = Resolve(new Dictionary<string, object>
        {
            ["amountMode"] = "field",
            ["amountFieldKey"] = "grand_total"
        });

        Assert.Equal("unresolved", resolved.Mode);
    }

    [Fact]
    public void FieldModeStaysFailClosedWhenTheSourceIsNotANumber()
    {
        var resolved = Resolve(
            new Dictionary<string, object> { ["amountMode"] = "field", ["amountFieldKey"] = "grand_total" },
            new Dictionary<string, object> { ["grand_total"] = "" });

        Assert.Equal("unresolved", resolved.Mode);
    }

    [Fact]
    public void FixedModeUsesTheSchemaAmount()
    {
        var resolved = Resolve(new Dictionary<string, object>
        {
            ["amountMode"] = "fixed",
            ["amount"] = "199.00",
            ["currency"] = "USD"
        });

        Assert.Equal("fixed", resolved.Mode);
        Assert.Equal(199.00m, resolved.Amount);
    }

    [Fact]
    public void LegacyFieldWithAStoredAmountAndNoModeIsStillPricedAsFixed()
    {
        var resolved = Resolve(new Dictionary<string, object> { ["amount"] = "49.5" });

        Assert.Equal("fixed", resolved.Mode);
        Assert.Equal(49.5m, resolved.Amount);
    }

    // ── observable behaviour, end to end, with no network ────────────────────

    [Fact]
    public async Task PaidClaimOnBoundlessListenTotalsIsRejectedWithoutContactingTheGateway()
    {
        // The verifier is built with a real PaymentGatewayClient (null => new). If the fix
        // regressed, this test would try to reach PayPal; because the field is unpriceable it
        // must reject before any round-trip, so the assertion doubles as proof of that.
        var verifier = NewVerifier();

        var schema = new FormSchema
        {
            Fields = new List<FormField>
            {
                PaymentField(new Dictionary<string, object>
                {
                    ["amountMode"] = "listenTotals",
                    ["currency"] = "EUR",
                    ["provider"] = "paypal"
                })
            }
        };

        var formData = new Dictionary<string, object>
        {
            ["payment"] = """
                {"status":"paid","provider":"paypal","transactionId":"PAY4-CAPTURE-0001",
                 "amount":"0.01","currency":"EUR","meta":{"orderId":"PAY4-ORDER-0001"}}
                """
        };

        var outcome = await verifier.VerifyAsync(new FormInfo { FormId = 9001, Title = "Invoice" }, schema, formData);

        Assert.False(outcome.Allowed);
        Assert.Contains("payment", outcome.FieldErrors.Keys);
    }

    [Fact]
    public async Task PaidClaimOnFieldModeMatchingTheSubmittedTotalGetsPastPricing()
    {
        // Sanity check on the other side of the gate: a field-mode claim whose price DOES
        // re-derive must not be rejected by the pricing step. It will still fail later at the
        // gateway (no credentials here), so assert only that the rejection is not the pricing
        // one - that is what distinguishes "unpriceable" from "priced but unverified".
        var verifier = NewVerifier();

        var schema = new FormSchema
        {
            Fields = new List<FormField>
            {
                PaymentField(new Dictionary<string, object>
                {
                    ["amountMode"] = "field",
                    ["amountFieldKey"] = "grand_total",
                    ["currency"] = "EUR",
                    ["provider"] = "paypal"
                })
            }
        };

        var formData = new Dictionary<string, object>
        {
            ["grand_total"] = "1050.00",
            ["payment"] = """
                {"status":"paid","provider":"paypal","transactionId":"PAY4-CAPTURE-0002",
                 "amount":"1050.00","currency":"EUR","meta":{"orderId":"PAY4-ORDER-0002"}}
                """
        };

        var outcome = await verifier.VerifyAsync(new FormInfo { FormId = 9002, Title = "Invoice" }, schema, formData);

        Assert.False(outcome.Allowed);
        Assert.DoesNotContain("does not match this form's price", outcome.ErrorMessage ?? string.Empty);
    }

    private sealed class StubGatewayStore : IPaymentGatewayStore
    {
        public string Get(int portalId, string key) => string.Empty;
    }
}
