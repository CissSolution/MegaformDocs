// /src/widgets/pdf-form-builder/builder/PdfFormBuilderConfig.ts
// Builder-side property schema. This is what shows up in the MegaForm builder
// when an admin adds a `PdfFormBuilder` widget to a form.
//
// Schema mirrors the convention used by DataRepeater / GolfScorecard widgets.

export const PdfFormBuilderBuilderSchema = {
  type: 'PdfFormBuilder',
  label: 'PDF Form Builder',
  icon: '📄',
  category: 'inputs',  // shows under "Input" group in the toolbox
  description: 'Render a PDF and overlay fillable form fields. Supports edit / preview / fill modes.',
  defaultProps: {
    mode: 'edit',
    showToolbar: true,
    showZoomControls: true,
    showPageBar: true,
    defaultZoom: 1.0,
    fields: [],
  },
  propertyGroups: [
    {
      title: 'PDF Source',
      properties: [
        { key: 'pdfUrl', label: 'PDF URL', type: 'text', placeholder: 'https://example.com/form.pdf' },
        { key: 'pdfBase64', label: 'PDF Base64', type: 'textarea', help: 'Alternative: paste base64-encoded PDF data' },
        { key: 'pdfFileFieldKey', label: 'PDF Upload Field Key', type: 'text', help: 'Reference to a file-upload field in this form' },
      ],
    },
    {
      title: 'Mode & UI',
      properties: [
        {
          key: 'mode',
          label: 'Mode',
          type: 'select',
          options: [
            { value: 'edit', label: 'Edit (drag-drop palette)' },
            { value: 'preview', label: 'Preview (read-only)' },
            { value: 'fill', label: 'Fill (end-user fills)' },
          ],
        },
        { key: 'showToolbar', label: 'Show Toolbar', type: 'boolean' },
        { key: 'showZoomControls', label: 'Show Zoom Controls', type: 'boolean' },
        { key: 'defaultZoom', label: 'Default Zoom', type: 'number', min: 0.4, max: 3.0, step: 0.1 },
      ],
    },
    {
      title: 'Output (Fill Mode)',
      properties: [
        { key: 'outputFieldKey', label: 'Save values into form field', type: 'text', help: 'Field key to receive filled values as JSON' },
        { key: 'flattenedPdfFieldKey', label: 'Save flattened PDF into field', type: 'text', help: 'Optional — store the filled & flattened PDF base64' },
      ],
    },
    {
      title: 'Fields (advanced)',
      properties: [
        { key: 'fields', label: 'Fields JSON', type: 'json', help: 'Array of field objects. Edit visually using drag-drop instead.' },
      ],
    },
    {
      title: 'Style',
      properties: [
        { key: 'cssClass', label: 'Extra CSS class', type: 'text' },
        { key: 'emptyMessage', label: 'Empty message', type: 'text' },
      ],
    },
  ],
};

// Register with the global builder schema registry, if present.
// The MegaForm builder picks up new widget types from this registry at boot.
if ((window as any).MegaFormBuilderRegistry && typeof (window as any).MegaFormBuilderRegistry.register === 'function') {
  (window as any).MegaFormBuilderRegistry.register(PdfFormBuilderBuilderSchema);
}
