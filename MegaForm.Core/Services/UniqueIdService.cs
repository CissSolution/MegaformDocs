using System;
using MegaForm.Core.Interfaces;

namespace MegaForm.Core.Services
{
    public class UniqueIdService
    {
        private readonly IPhase2Repository _repo;

        public UniqueIdService(IPhase2Repository repo)
        {
            _repo = repo ?? throw new ArgumentNullException(nameof(repo));
        }

        public string GenerateNext(int formId, string fieldKey, string prefix, int padding, long startValue, string suffixType)
        {
            long counter = _repo.IncrementUniqueId(formId, fieldKey, startValue);
            string paddedNumber = counter.ToString().PadLeft(Math.Max(padding, 1), '0');
            string suffix = "";
            switch ((suffixType ?? "").ToLowerInvariant())
            {
                case "date":
                    suffix = "-" + DateTime.UtcNow.ToString("yyyyMMdd");
                    break;
                case "datetime":
                    suffix = "-" + DateTime.UtcNow.ToString("yyyyMMddHHmm");
                    break;
                case "random":
                    suffix = "-" + Guid.NewGuid().ToString("N").Substring(0, 6).ToUpperInvariant();
                    break;
            }
            return (prefix ?? "") + paddedNumber + suffix;
        }

        public string PeekNext(int formId, string fieldKey, string prefix, int padding, long startValue, string suffixType)
        {
            long current = _repo.GetUniqueIdCounter(formId, fieldKey);
            long next = current > 0 ? current + 1 : startValue;
            string paddedNumber = next.ToString().PadLeft(Math.Max(padding, 1), '0');
            return (prefix ?? "") + paddedNumber;
        }
    }
}
