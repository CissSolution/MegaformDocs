using System;

namespace MegaForm.Core.Models
{
    /// <summary>
    /// Canonical data-type classification for typed submission storage.
    /// Mirrors the Umbraco Forms-style value tables.
    /// </summary>
    public enum SubmissionDataType
    {
        String,
        LongText,
        Number,
        Date,
        Boolean,
        Json
    }

    /// <summary>
    /// One row per submitted logical field. Stores a metadata snapshot at submit time
    /// so old submissions still render correctly after the form schema changes.
    /// </summary>
    public class SubmissionFieldRecord
    {
        public long SubmissionFieldId { get; set; }
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public long? FormFieldId { get; set; }
        public string FieldKey { get; set; }
        public string FieldId { get; set; }
        public string FieldAlias { get; set; }
        public string FieldType { get; set; }
        public string DataType { get; set; }
        public string LabelSnapshot { get; set; }
        public int? PageIndex { get; set; }
        public int? FieldOrder { get; set; }
        public string DisplayValue { get; set; }
        public bool HasValue { get; set; }
        public bool IsSensitive { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public DateTime? UpdatedOnUtc { get; set; }
    }

    /// <summary>
    /// Short string value rows (Text, Email, Url, Phone, Select, Radio, Hidden, etc.).
    /// </summary>
    public class SubmissionValueStringRecord
    {
        public long Id { get; set; }
        public long SubmissionFieldId { get; set; }
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string FieldKey { get; set; }
        public int Ordinal { get; set; }
        public string Value { get; set; }
    }

    /// <summary>
    /// Long text value rows (Textarea, RichText, Signature, MultiSelect display text, etc.).
    /// </summary>
    public class SubmissionValueLongTextRecord
    {
        public long Id { get; set; }
        public long SubmissionFieldId { get; set; }
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string FieldKey { get; set; }
        public int Ordinal { get; set; }
        public string Value { get; set; }
    }

    /// <summary>
    /// Numeric value rows (Number, Currency, Slider, Rating, OpinionScale, etc.).
    /// </summary>
    public class SubmissionValueNumberRecord
    {
        public long Id { get; set; }
        public long SubmissionFieldId { get; set; }
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string FieldKey { get; set; }
        public int Ordinal { get; set; }
        public decimal? Value { get; set; }
    }

    /// <summary>
    /// Date/time value rows (Date, DateTime, Time, DateRange, Appointment, etc.).
    /// </summary>
    public class SubmissionValueDateRecord
    {
        public long Id { get; set; }
        public long SubmissionFieldId { get; set; }
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string FieldKey { get; set; }
        public int Ordinal { get; set; }
        public DateTime? Value { get; set; }
    }

    /// <summary>
    /// Boolean value rows (Checkbox, Switch, Terms, etc.).
    /// </summary>
    public class SubmissionValueBooleanRecord
    {
        public long Id { get; set; }
        public long SubmissionFieldId { get; set; }
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string FieldKey { get; set; }
        public int Ordinal { get; set; }
        public bool Value { get; set; }
    }

    /// <summary>
    /// Field-scoped JSON value rows for complex controls (File, Address, FullName,
    /// Composite, Signature payload, Razor output, etc.). This is NOT the legacy
    /// submission-wide DataJson; it is one JSON blob per submitted field.
    /// </summary>
    public class SubmissionValueJsonRecord
    {
        public long Id { get; set; }
        public long SubmissionFieldId { get; set; }
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public string FieldKey { get; set; }
        public int Ordinal { get; set; }
        public string Value { get; set; }
    }
}
