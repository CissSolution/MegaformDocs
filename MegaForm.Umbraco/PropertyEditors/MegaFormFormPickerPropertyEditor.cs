using Umbraco.Cms.Core.PropertyEditors;

namespace MegaForm.Umbraco.PropertyEditors
{
    /// <summary>
    /// Server-side schema for the MegaForm Form Picker property editor.
    /// Stores the selected MegaForm id as text; <see cref="MegaFormFormPickerValueConverter"/>
    /// converts it to a nullable int for front-end use.
    /// </summary>
    [DataEditor("MegaForm.FormPicker", ValueType = ValueTypes.Text)]
    public class MegaFormFormPickerPropertyEditor : DataEditor
    {
        public MegaFormFormPickerPropertyEditor(IDataValueEditorFactory dataValueEditorFactory)
            : base(dataValueEditorFactory)
        {
        }
    }
}
