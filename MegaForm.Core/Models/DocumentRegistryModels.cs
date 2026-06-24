using System;

namespace MegaForm.Core.Models
{
    public static class DocumentDirections
    {
        public const string Incoming = "incoming";
        public const string Outgoing = "outgoing";
        public const string Internal = "internal";
    }

    public static class DocumentSecurityLevels
    {
        public const string Public = "public";
        public const string Internal = "internal";
        public const string Confidential = "confidential";
        public const string Secret = "secret";
    }

    public static class DocumentUrgencyLevels
    {
        public const string Normal = "normal";
        public const string Urgent = "urgent";
        public const string VeryUrgent = "very_urgent";
    }

    public class DocumentMetadataInfo
    {
        public int MetadataId { get; set; }
        public int DocumentId { get; set; }
        public int PortalId { get; set; }
        public string Direction { get; set; }
        public string DocumentType { get; set; }
        public string RegistryNumber { get; set; }
        public string ExternalReference { get; set; }
        public string Category { get; set; }
        public string Department { get; set; }
        public int? OwnerUserId { get; set; }
        public string OwnerDisplayName { get; set; }
        public string SenderOrg { get; set; }
        public string RecipientOrg { get; set; }
        public string SignerName { get; set; }
        public string SecurityLevel { get; set; }
        public string UrgencyLevel { get; set; }
        public DateTime? IssuedOnUtc { get; set; }
        public DateTime? ReceivedOnUtc { get; set; }
        public DateTime? EffectiveOnUtc { get; set; }
        public DateTime? DueOnUtc { get; set; }
        public string Tags { get; set; }
        public string Keywords { get; set; }
        public string Notes { get; set; }
        public int? UpdatedByUserId { get; set; }
        public DateTime? UpdatedOnUtc { get; set; }

        public DocumentMetadataInfo()
        {
            Direction = DocumentDirections.Internal;
            DocumentType = string.Empty;
            RegistryNumber = string.Empty;
            ExternalReference = string.Empty;
            Category = string.Empty;
            Department = string.Empty;
            OwnerDisplayName = string.Empty;
            SenderOrg = string.Empty;
            RecipientOrg = string.Empty;
            SignerName = string.Empty;
            SecurityLevel = DocumentSecurityLevels.Internal;
            UrgencyLevel = DocumentUrgencyLevels.Normal;
            Tags = string.Empty;
            Keywords = string.Empty;
            Notes = string.Empty;
        }
    }
}
