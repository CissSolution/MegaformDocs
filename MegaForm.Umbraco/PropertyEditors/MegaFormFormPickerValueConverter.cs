using System;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;

namespace MegaForm.Umbraco.PropertyEditors
{
    /// <summary>
    /// Converts the stored MegaForm Form Picker value (a form id string) into
    /// a nullable <see cref="int"/> that can be used directly in Razor views.
    /// </summary>
    public class MegaFormFormPickerValueConverter : PropertyValueConverterBase
    {
        public override bool IsConverter(IPublishedPropertyType propertyType)
            => propertyType.EditorAlias == "MegaForm.FormPicker";

        public override bool? IsValue(object value, PropertyValueLevel level)
            => value is string s ? !string.IsNullOrWhiteSpace(s) : value != null;

        public override Type GetPropertyValueType(IPublishedPropertyType propertyType)
            => typeof(int?);

        public override PropertyCacheLevel GetPropertyCacheLevel(IPublishedPropertyType propertyType)
            => PropertyCacheLevel.Element;

        public override object ConvertSourceToIntermediate(
            IPublishedElement owner,
            IPublishedPropertyType propertyType,
            object source,
            bool preview)
        {
            if (source == null) return null;
            var text = source.ToString();
            if (string.IsNullOrWhiteSpace(text)) return null;
            if (int.TryParse(text, out var formId)) return formId;
            return null;
        }

        public override object ConvertIntermediateToObject(
            IPublishedElement owner,
            IPublishedPropertyType propertyType,
            PropertyCacheLevel referenceCacheLevel,
            object inter,
            bool preview)
            => inter;
    }
}
