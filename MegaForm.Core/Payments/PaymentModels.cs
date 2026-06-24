using System;
using System.Collections.Generic;

namespace MegaForm.Core.Payments
{
    public class PaymentConnectionSettings
    {
        public string ProviderName { get; set; }
        public string PublishableKey { get; set; }
        public string SecretKey { get; set; }
        public string WebhookSecret { get; set; }
        public string BaseUrl { get; set; }
        public bool Sandbox { get; set; }
        public decimal? TransactionFeePercent { get; set; }
        public decimal? TransactionFeeFixed { get; set; }
        public Dictionary<string, string> Extra { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }

    public class PaymentIntentRequest
    {
        public PaymentConnectionSettings Settings { get; set; }
        public string FormTitle { get; set; }
        public long AmountInCents { get; set; }
        public string Currency { get; set; } = "usd";
        public string CustomerEmail { get; set; }
        public string CustomerName { get; set; }
        public string CouponCode { get; set; }
        public Dictionary<string, object> Metadata { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
    }

    public class PaymentIntentResult
    {
        public bool Success { get; set; }
        public string IntentId { get; set; }
        public string ClientSecret { get; set; }
        public long AmountInCents { get; set; }
        public long FinalAmountInCents { get; set; }
        public string Currency { get; set; }
        public string Status { get; set; }
        public string Message { get; set; }
        public Dictionary<string, object> ResponseData { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public Exception Error { get; set; }

        public static PaymentIntentResult Ok(string intentId, string clientSecret, long amount, string currency, string status = null)
        {
            return new PaymentIntentResult
            {
                Success = true,
                IntentId = intentId,
                ClientSecret = clientSecret,
                AmountInCents = amount,
                FinalAmountInCents = amount,
                Currency = currency,
                Status = status
            };
        }

        public static PaymentIntentResult Fail(string message, Exception error = null)
        {
            return new PaymentIntentResult { Success = false, Message = message, Error = error };
        }
    }

    public class SubscriptionRequest
    {
        public PaymentConnectionSettings Settings { get; set; }
        public string PlanId { get; set; }
        public string PriceId { get; set; }
        public string CustomerEmail { get; set; }
        public string CustomerName { get; set; }
        public string CouponCode { get; set; }
        public BillingInterval Interval { get; set; } = BillingInterval.Month;
        public int IntervalCount { get; set; } = 1;
        public int? TrialDays { get; set; }
        public Dictionary<string, object> Metadata { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
    }

    public enum BillingInterval
    {
        Day,
        Week,
        Month,
        Year
    }

    public class SubscriptionResult
    {
        public bool Success { get; set; }
        public string SubscriptionId { get; set; }
        public string Status { get; set; }
        public string ClientSecret { get; set; }
        public string Message { get; set; }
        public Dictionary<string, object> ResponseData { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public Exception Error { get; set; }

        public static SubscriptionResult Ok(string subscriptionId, string status, string clientSecret = null)
        {
            return new SubscriptionResult { Success = true, SubscriptionId = subscriptionId, Status = status, ClientSecret = clientSecret };
        }

        public static SubscriptionResult Fail(string message, Exception error = null)
        {
            return new SubscriptionResult { Success = false, Message = message, Error = error };
        }
    }

    public class CouponDefinition
    {
        public string Code { get; set; }
        public CouponType Type { get; set; } = CouponType.Percent;
        public decimal DiscountValue { get; set; }
        public long? MaxRedemptions { get; set; }
        public DateTime? RedeemBy { get; set; }
        public List<string> ApplicablePlanIds { get; set; } = new List<string>();
    }

    public enum CouponType
    {
        Percent,
        FixedAmount
    }

    public class CouponResult
    {
        public bool Success { get; set; }
        public string CouponId { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public Exception Error { get; set; }

        public static CouponResult Ok(string couponId, string code)
        {
            return new CouponResult { Success = true, CouponId = couponId, Code = code };
        }

        public static CouponResult Fail(string message, Exception error = null)
        {
            return new CouponResult { Success = false, Message = message, Error = error };
        }
    }

    public class CalculationRequest
    {
        public long BaseAmountInCents { get; set; }
        public string Currency { get; set; } = "usd";
        public string CouponCode { get; set; }
        public PaymentConnectionSettings Settings { get; set; }
        public List<LineItem> LineItems { get; set; } = new List<LineItem>();
    }

    public class LineItem
    {
        public string Description { get; set; }
        public long AmountInCents { get; set; }
        public int Quantity { get; set; } = 1;
    }

    public class CalculationResult
    {
        public long SubtotalInCents { get; set; }
        public long DiscountInCents { get; set; }
        public long TaxInCents { get; set; }
        public long FeeInCents { get; set; }
        public long TotalInCents { get; set; }
        public string Currency { get; set; }
        public string AppliedCouponCode { get; set; }
        public string Message { get; set; }

        public static CalculationResult Empty(string currency = "usd")
        {
            return new CalculationResult { Currency = currency };
        }
    }

    public class PaymentHealthResult
    {
        public bool Healthy { get; set; }
        public string Message { get; set; }
        public Exception Error { get; set; }

        public static PaymentHealthResult Ok(string message = null)
        {
            return new PaymentHealthResult { Healthy = true, Message = message };
        }

        public static PaymentHealthResult Fail(string message, Exception error = null)
        {
            return new PaymentHealthResult { Healthy = false, Message = message, Error = error };
        }
    }
}
