// /src/widgets/pdf-form-builder/types/index.ts — v6

export type FieldKind =
  | 'label'
  | 'text'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'signature'
  | 'image'
  | 'date'
  | 'number'
  | 'whiteout';

export interface FieldBase {
  id: string;
  kind: FieldKind;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  fontSize?: number;
  fontFamily?: string;       // ★ v6: per-field font override (falls back to systemFont)
  textAlign?: 'left' | 'center' | 'right';
  borderColor?: string;
  bgColor?: string;
  textColor?: string;
}

export interface RadioField extends FieldBase {
  kind: 'radio';
  group: string;
  value: string;
}
export interface DropdownField extends FieldBase {
  kind: 'dropdown';
  options: { label: string; value: string }[];
}
export interface CheckboxField extends FieldBase { kind: 'checkbox'; }
export interface LabelField extends FieldBase {
  kind: 'label';
  content: string;
}
export interface TextField extends FieldBase {
  kind: 'text' | 'textarea' | 'date' | 'number' | 'signature' | 'image' | 'whiteout';
}
export type AnyField =
  | TextField
  | RadioField
  | DropdownField
  | CheckboxField
  | LabelField;

export interface SignatureState {
  dataUrl: string;
  naturalW: number;
  naturalH: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}
export interface ImageState {
  dataUrl: string;
  naturalW: number;
  naturalH: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  mimeType: 'image/png' | 'image/jpeg';
}

export interface PdfFormBuilderProps {
  pdfUrl?: string;
  pdfBase64?: string;
  pdfFileFieldKey?: string;
  fields?: AnyField[];
  mode?: 'edit' | 'preview' | 'fill';
  showToolbar?: boolean;
  showZoomControls?: boolean;
  showPageBar?: boolean;
  defaultZoom?: number;
  showGrid?: boolean;
  snapEnabled?: boolean;       // default false in v6
  gridSize?: number;
  systemFont?: string;         // ★ v6: global font family for all text fields
  outputFieldKey?: string;
  flattenedPdfFieldKey?: string;
  cssClass?: string;
  emptyMessage?: string;
}

export interface PdfPageInfo {
  pageNumber: number;
  width: number;
  height: number;
  cssScale: number;
}
