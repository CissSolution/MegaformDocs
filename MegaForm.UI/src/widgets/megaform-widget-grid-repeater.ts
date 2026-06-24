/* MegaForm GridRepeater Widget (TypeScript)
 * Spec basis: MegaForm GridRepeater v1.0
 * Runtime target: plain browser JS, no external deps except MegaFormWidgets and optional MFUtil
 */

type ColumnType = "text" | "email" | "number" | "tel" | "date" | "select" | "checkbox" | "textarea";

type SelectOption = string | { value: string; label: string };

interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  required?: boolean;
  placeholder?: string;
  width?: string;
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  options?: SelectOption[];
  readOnly?: boolean;
  hideInHeader?: boolean;
}

interface GridRepeaterProps {
  columns: ColumnDef[];
  minRows: number;
  maxRows: number;
  allowReorder: boolean;
  allowDuplicateRows: boolean;
  addRowLabel: string;
  emptyMessage: string;
  layout: "grid" | string;
}

interface FieldLike {
  key: string;
  label?: string;
  required?: boolean;
  widgetProps?: Partial<GridRepeaterProps> & Record<string, any>;
}

declare const MegaFormWidgets: any;
declare const MFUtil: any;

authority();
function authority() {
  const BADGE = "GridRepeaterI18n v20260402-18";

  function tr(key: string, fallback: string, params?: Record<string, string | number>): string {
    try {
      const i18n = (window as any).MegaFormI18n;
      if (i18n && typeof i18n.t === "function") {
        const out = i18n.t(key, params || {});
        if (out && out !== key) return String(out);
      }
    } catch (_err) { }
    let raw = fallback;
    if (params) Object.keys(params).forEach((name) => { raw = raw.replace(new RegExp(`\\{${name}\\}`, "g"), String((params as any)[name] == null ? "" : (params as any)[name])); });
    return raw;
  }
  const defaults: GridRepeaterProps = {
    columns: [],
    minRows: 0,
    maxRows: 50,
    allowReorder: true,
    allowDuplicateRows: false,
    addRowLabel: tr("widget.grid.add_row", "+ Add Row"),
    emptyMessage: tr("widget.grid.empty", "No rows yet. Click Add Row to begin."),
    layout: "grid"
  };

  const properties = [
    { key: "minRows", label: "Min Rows", type: "number", default: 0 },
    { key: "maxRows", label: "Max Rows", type: "number", default: 50 },
    { key: "allowReorder", label: "Allow Reorder", type: "checkbox", default: true },
    { key: "allowDuplicateRows", label: "Duplicate Rows", type: "checkbox", default: false },
    { key: "addRowLabel", label: "Add Row Button Text", type: "text", default: "+ Add Row" },
    { key: "emptyMessage", label: "Empty State Message", type: "text", default: "No rows yet." }
  ];

  function escHtml(input: any): string {
    const str = input == null ? "" : String(input);
    if (typeof MFUtil !== "undefined" && MFUtil && typeof MFUtil.escHtml === "function") return MFUtil.escHtml(str);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseJson<T>(value: any, fallback: T): T {
    if (value == null || value === "") return fallback;
    if (typeof value === "object") return value as T;
    try {
      return JSON.parse(String(value)) as T;
    } catch {
      return fallback;
    }
  }

  function slugify(input: string): string {
    return String(input || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s_]+/g, "")
      .replace(/[\s\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "column";
  }

  function toAttrJson(obj: any): string {
    return escHtml(JSON.stringify(obj || {}));
  }

  function getProps(field: FieldLike): GridRepeaterProps {
    const wp = (field && field.widgetProps) || {};
    const rawColumns = Array.isArray(wp.columns) ? wp.columns : [];
    const columns = rawColumns.map(normalizeColumn).filter(Boolean) as ColumnDef[];
    const merged: GridRepeaterProps = {
      ...defaults,
      ...wp,
      columns,
      minRows: normalizeNumber(wp.minRows, defaults.minRows),
      maxRows: Math.max(normalizeNumber(wp.maxRows, defaults.maxRows), 0),
      allowReorder: wp.allowReorder !== false,
      allowDuplicateRows: !!wp.allowDuplicateRows,
      addRowLabel: String(wp.addRowLabel || defaults.addRowLabel),
      emptyMessage: String(wp.emptyMessage || defaults.emptyMessage),
      layout: String(wp.layout || defaults.layout)
    };
    if (merged.minRows < 0) merged.minRows = 0;
    if (merged.maxRows < merged.minRows) merged.maxRows = merged.minRows;
    return merged;
  }

  function normalizeColumn(col: Partial<ColumnDef>): ColumnDef {
    const type = (col.type || "text") as ColumnType;
    return {
      key: String(col.key || slugify(String(col.label || "column"))),
      label: String(col.label || tr("widget.grid.column", "Column")),
      type,
      required: !!col.required,
      placeholder: col.placeholder == null ? "" : String(col.placeholder),
      width: col.width == null || col.width === "" ? "1fr" : String(col.width),
      defaultValue: normalizeDefaultValue(type, col.defaultValue),
      min: col.min == null || String(col.min) === "" ? undefined : Number(col.min),
      max: col.max == null || String(col.max) === "" ? undefined : Number(col.max),
      step: col.step == null || String(col.step) === "" ? undefined : Number(col.step),
      options: normalizeOptions(col.options),
      readOnly: !!col.readOnly,
      hideInHeader: !!col.hideInHeader
    };
  }

  function normalizeOptions(options: any): SelectOption[] {
    if (!Array.isArray(options)) return [];
    return options
      .map((opt) => {
        if (typeof opt === "string") return opt;
        if (opt && typeof opt === "object") return { value: String(opt.value ?? ""), label: String(opt.label ?? opt.value ?? "") };
        return null;
      })
      .filter(Boolean) as SelectOption[];
  }

  function normalizeDefaultValue(type: ColumnType, value: any): any {
    if (value == null) {
      if (type === "checkbox") return false;
      return null;
    }
    if (type === "number") {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    }
    if (type === "checkbox") return !!value;
    return String(value);
  }

  function normalizeNumber(value: any, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function getWidths(props: GridRepeaterProps): string {
    const widths = props.columns.map((c) => c.width || "1fr");
    widths.push("40px");
    return widths.join(" ");
  }

  function buildEmptyRow(props: GridRepeaterProps): Record<string, any> {
    const row: Record<string, any> = {};
    props.columns.forEach((col) => {
      if (col.defaultValue != null) row[col.key] = col.defaultValue;
      else if (col.type === "checkbox") row[col.key] = false;
      else if (col.type === "number") row[col.key] = null;
      else row[col.key] = "";
    });
    return row;
  }

  function normalizeRows(field: FieldLike, existingValue: any): Record<string, any>[] {
    const props = getProps(field);
    const parsed = parseJson<{ rows?: any[] }>(existingValue, { rows: [] });
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    return rows.map((row) => {
      const out: Record<string, any> = {};
      props.columns.forEach((col) => {
        const value = row && row[col.key] !== undefined ? row[col.key] : col.defaultValue;
        if (col.type === "number") out[col.key] = value == null || value === "" ? null : Number(value);
        else if (col.type === "checkbox") out[col.key] = !!value;
        else out[col.key] = value == null ? "" : value;
      });
      return out;
    });
  }

  function render(field: FieldLike, formId: string, existingValue: any): string {
    const props = getProps(field);
    const widths = getWidths(props);
    let rows = normalizeRows(field, existingValue);
    if (!rows.length && props.minRows > 0) {
      for (let i = 0; i < props.minRows; i++) rows.push(buildEmptyRow(props));
    }
    const valueJson = JSON.stringify({ rows });
    const headerHtml = props.columns.map((col) => {
      const klass = col.hideInHeader ? "mfgr-th mfgr-th-hidden" : "mfgr-th";
      return `<div class="${klass}">${col.hideInHeader ? "" : escHtml(col.label)}</div>`;
    }).join("");
    const rowsHtml = rows.map((row, idx) => renderRow(props, row, idx)).join("");

    return `
<div class="mfgr-wrap" data-formid="${escHtml(formId)}" data-fieldkey="${escHtml(field.key)}" data-widget-props="${toAttrJson(props)}">
  <div class="mfgr-header">
    <div class="mfgr-header-row" style="grid-template-columns:${escHtml(widths)}">
      ${headerHtml}
      <div class="mfgr-th mfgr-th-actions"></div>
    </div>
  </div>
  <div class="mfgr-body">${rowsHtml}</div>
  <div class="mfgr-footer">
    <button type="button" class="mfgr-btn-add">${escHtml(props.addRowLabel)}</button>
    <span class="mfgr-counter"></span>
  </div>
  <div class="mfgr-empty">${escHtml(props.emptyMessage)}</div>
  <input type="hidden" data-gr-value="1" name="${escHtml(field.key)}" value="${escHtml(valueJson)}" />
  <div class="mfgr-error" style="display:none"></div>
</div>`.trim();
  }

  function renderRow(props: GridRepeaterProps, row: Record<string, any>, rowIndex: number): string {
    const widths = getWidths(props);
    const cellHtml = props.columns.map((col) => {
      const value = row ? row[col.key] : undefined;
      return `
<div class="mfgr-cell" data-col-key="${escHtml(col.key)}" data-label="${escHtml(col.label)}">
  ${renderCell(col, value)}
</div>`.trim();
    }).join("");

    const dupButton = props.allowDuplicateRows
      ? `<button type="button" class="mfgr-btn-dup" title="${escHtml(tr("widget.grid.duplicate_row", "Duplicate row"))}" aria-label="${escHtml(tr("widget.grid.duplicate_row", "Duplicate row"))}">⧉</button>`
      : "";
    const drag = props.allowReorder
      ? `<span class="mfgr-drag-handle" title="${escHtml(tr("widget.grid.drag_reorder", "Drag to reorder"))}" draggable="true" aria-label="${escHtml(tr("widget.grid.drag_reorder", "Drag to reorder"))}">≡</span>`
      : "";

    return `
<div class="mfgr-row" data-row-index="${rowIndex}">
  <div class="mfgr-row-inner" style="grid-template-columns:${escHtml(widths)}">
    ${cellHtml}
    <div class="mfgr-cell mfgr-cell-actions">
      <button type="button" class="mfgr-btn-delete" title="${escHtml(tr("widget.grid.remove_row", "Remove row"))}" aria-label="${escHtml(tr("widget.grid.remove_row", "Remove row"))}">✕</button>
      ${dupButton}
      ${drag}
    </div>
  </div>
</div>`.trim();
  }

  function renderCell(col: ColumnDef, value: any): string {
    const v = value == null ? "" : value;
    const attrs = [
      col.required ? "required" : "",
      col.placeholder ? `placeholder="${escHtml(col.placeholder)}"` : "",
      col.readOnly ? "readonly disabled" : ""
    ].filter(Boolean).join(" ");

    if (col.readOnly) {
      const readOnlyText = col.type === "checkbox" ? (v ? tr("widget.grid.readonly_yes", "Yes") : tr("widget.grid.readonly_no", "No")) : String(v || "");
      return `<div class="mfgr-readonly">${escHtml(readOnlyText)}</div>`;
    }

    switch (col.type) {
      case "email":
      case "tel":
      case "date":
      case "text":
        return `<input type="${col.type}" ${attrs} value="${escHtml(v)}" />`;
      case "number": {
        const extra = [
          col.min != null ? `min="${escHtml(col.min)}"` : "",
          col.max != null ? `max="${escHtml(col.max)}"` : "",
          col.step != null ? `step="${escHtml(col.step)}"` : ""
        ].filter(Boolean).join(" ");
        return `<input type="number" ${attrs} ${extra} value="${v === null || v === "" ? "" : escHtml(v)}" />`;
      }
      case "checkbox":
        return `<label class="mfgr-checkbox-wrap"><input type="checkbox" ${v ? "checked" : ""} ${col.readOnly ? "disabled" : ""} /><span class="mfgr-checkbox-text"></span></label>`;
      case "select": {
        const options = (col.options || []).map((opt) => {
          const option = typeof opt === "string" ? { value: opt, label: opt } : opt;
          const selected = String(option.value) === String(v) ? "selected" : "";
          return `<option value="${escHtml(option.value)}" ${selected}>${escHtml(option.label)}</option>`;
        }).join("");
        return `<select ${col.required ? "required" : ""}><option value="">${escHtml(tr("widget.grid.select", "Select..."))}</option>${options}</select>`;
      }
      case "textarea":
        return `<textarea ${attrs}>${escHtml(v)}</textarea>`;
      default:
        return `<input type="text" ${attrs} value="${escHtml(v)}" />`;
    }
  }

  function bind(formId: string): void {
    const wraps = Array.from(document.querySelectorAll(`.mfgr-wrap[data-formid="${cssEscape(formId)}"]`)) as HTMLElement[];
    wraps.forEach(bindWrap);
  }

  function bindWrap(wrap: HTMLElement): void {
    if ((wrap as any).__mfgrBound) {
      syncValue(wrap);
      return;
    }
    (wrap as any).__mfgrBound = true;
    syncValue(wrap);

    wrap.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".mfgr-btn-add")) {
        e.preventDefault();
        addRow(wrap);
        return;
      }
      if (target.closest(".mfgr-btn-delete")) {
        e.preventDefault();
        deleteRow(target, wrap);
        return;
      }
      if (target.closest(".mfgr-btn-dup")) {
        e.preventDefault();
        duplicateRow(target, wrap);
      }
    });

    wrap.addEventListener("input", () => syncValue(wrap));
    wrap.addEventListener("change", () => syncValue(wrap));

    setupDragDrop(wrap);
  }

  function setupDragDrop(wrap: HTMLElement): void {
    let draggingRow: HTMLElement | null = null;

    wrap.addEventListener("dragstart", (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".mfgr-drag-handle")) return;
      draggingRow = target.closest(".mfgr-row") as HTMLElement | null;
      if (!draggingRow) return;
      draggingRow.classList.add("mfgr-row--dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", draggingRow.getAttribute("data-row-index") || "");
      }
    });

    wrap.addEventListener("dragend", () => {
      clearDragStates(wrap);
      draggingRow = null;
      syncValue(wrap);
    });

    wrap.addEventListener("dragover", (e) => {
      if (!draggingRow) return;
      const overRow = (e.target as HTMLElement).closest(".mfgr-row") as HTMLElement | null;
      if (!overRow || overRow === draggingRow) return;
      e.preventDefault();
      clearOverStates(wrap);
      overRow.classList.add("mfgr-row--over");
    });

    wrap.addEventListener("drop", (e) => {
      if (!draggingRow) return;
      const overRow = (e.target as HTMLElement).closest(".mfgr-row") as HTMLElement | null;
      if (!overRow || overRow === draggingRow) return;
      e.preventDefault();
      const body = wrap.querySelector(".mfgr-body");
      if (!body) return;
      const rect = overRow.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (before) body.insertBefore(draggingRow, overRow);
      else body.insertBefore(draggingRow, overRow.nextSibling);
      clearDragStates(wrap);
      syncValue(wrap);
    });
  }

  function clearDragStates(wrap: HTMLElement): void {
    wrap.querySelectorAll(".mfgr-row--dragging,.mfgr-row--over").forEach((el) => {
      el.classList.remove("mfgr-row--dragging", "mfgr-row--over");
    });
  }

  function clearOverStates(wrap: HTMLElement): void {
    wrap.querySelectorAll(".mfgr-row--over").forEach((el) => el.classList.remove("mfgr-row--over"));
  }

  function addRow(wrap: HTMLElement, seed?: Record<string, any>): void {
    const props = readPropsFromWrap(wrap);
    const body = wrap.querySelector(".mfgr-body") as HTMLElement | null;
    if (!body) return;
    const rows = body.querySelectorAll(".mfgr-row");
    if (rows.length >= props.maxRows) return;
    const rowData = seed ? cloneRowData(props, seed) : buildEmptyRow(props);
    const html = renderRow(props, rowData, rows.length);
    body.insertAdjacentHTML("beforeend", html);
    syncValue(wrap);
  }

  function deleteRow(target: HTMLElement, wrap: HTMLElement): void {
    const row = target.closest(".mfgr-row");
    if (!row) return;
    row.remove();
    syncValue(wrap);
  }

  function duplicateRow(target: HTMLElement, wrap: HTMLElement): void {
    const props = readPropsFromWrap(wrap);
    const row = target.closest(".mfgr-row") as HTMLElement | null;
    if (!row) return;
    const body = wrap.querySelector(".mfgr-body") as HTMLElement | null;
    if (!body || body.querySelectorAll(".mfgr-row").length >= props.maxRows) return;
    const data = readRowData(row, props);
    const clone = cloneRowData(props, data);
    const html = renderRow(props, clone, body.querySelectorAll(".mfgr-row").length);
    row.insertAdjacentHTML("afterend", html);
    syncValue(wrap);
  }

  function cloneRowData(props: GridRepeaterProps, seed: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    props.columns.forEach((col) => {
      const value = seed[col.key];
      if (col.type === "checkbox") out[col.key] = !!value;
      else if (col.type === "number") out[col.key] = value == null || value === "" ? null : Number(value);
      else out[col.key] = value == null ? "" : String(value);
    });
    return out;
  }

  function readPropsFromWrap(wrap: HTMLElement): GridRepeaterProps {
    return parseJson<GridRepeaterProps>(wrap.getAttribute("data-widget-props"), defaults);
  }

  function readRowData(rowEl: HTMLElement, props: GridRepeaterProps): Record<string, any> {
    const obj: Record<string, any> = {};
    props.columns.forEach((col) => {
      const cell = rowEl.querySelector(`.mfgr-cell[data-col-key="${cssEscape(col.key)}"]`) as HTMLElement | null;
      if (!cell) {
        obj[col.key] = null;
        return;
      }
      const input = cell.querySelector("input, select, textarea") as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (!input) {
        obj[col.key] = (cell.textContent || "").trim();
        return;
      }
      if ((input as HTMLInputElement).type === "checkbox") obj[col.key] = (input as HTMLInputElement).checked;
      else if ((input as HTMLInputElement).type === "number") obj[col.key] = input.value === "" ? null : Number(input.value);
      else obj[col.key] = input.value;
    });
    return obj;
  }

  function syncValue(wrap: HTMLElement): void {
    const props = readPropsFromWrap(wrap);
    const rows: Record<string, any>[] = [];
    wrap.querySelectorAll(".mfgr-row").forEach((rowEl, index) => {
      (rowEl as HTMLElement).setAttribute("data-row-index", String(index));
      rows.push(readRowData(rowEl as HTMLElement, props));
    });
    const hidden = wrap.querySelector("input[data-gr-value]") as HTMLInputElement | null;
    if (hidden) hidden.value = JSON.stringify({ rows });
    updateCounter(wrap, props, rows.length);
    updateEmpty(wrap, rows.length);
  }

  function updateCounter(wrap: HTMLElement, props: GridRepeaterProps, rowCount?: number): void {
    const counter = wrap.querySelector(".mfgr-counter");
    if (!counter) return;
    const count = rowCount == null ? wrap.querySelectorAll(".mfgr-row").length : rowCount;
    counter.textContent = tr("widget.grid.rows_counter", "{count} / {max} rows", { count, max: props.maxRows });
  }

  function updateEmpty(wrap: HTMLElement, rowCount?: number): void {
    const empty = wrap.querySelector(".mfgr-empty") as HTMLElement | null;
    const count = rowCount == null ? wrap.querySelectorAll(".mfgr-row").length : rowCount;
    if (!empty) return;
    empty.style.display = count === 0 ? "block" : "none";
  }

  function collect(_key: string, container: HTMLElement): string {
    const hidden = container.querySelector("input[type=hidden][data-gr-value]") as HTMLInputElement | null;
    return hidden ? hidden.value : JSON.stringify({ rows: [] });
  }

  function validate(_key: string, container: HTMLElement): boolean {
    const wrap = container.classList.contains("mfgr-wrap") ? container : (container.querySelector(".mfgr-wrap") as HTMLElement | null);
    if (!wrap) return true;
    syncValue(wrap);
    clearErrors(wrap);

    const props = readPropsFromWrap(wrap);
    const hidden = wrap.querySelector("input[data-gr-value]") as HTMLInputElement | null;
    const parsed = parseJson<{ rows?: Record<string, any>[] }>(hidden?.value, { rows: [] });
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    const fieldRequired = container.getAttribute("data-required") === "true" || container.getAttribute("aria-required") === "true";
    const errors: string[] = [];

    if (fieldRequired && rows.length === 0) errors.push(tr("widget.grid.at_least_one_row", "At least one row is required."));
    if (rows.length < props.minRows) errors.push(tr("widget.grid.min_rows_required", "Minimum {min} rows required.", { min: props.minRows }));
    if (rows.length > props.maxRows) errors.push(tr("widget.grid.max_rows_allowed", "Maximum {max} rows allowed.", { max: props.maxRows }));

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    rows.forEach((row, rowIndex) => {
      props.columns.forEach((col) => {
        const value = row[col.key];
        const isEmpty = col.type === "checkbox" ? false : value == null || String(value).trim() === "";
        const rowEl = wrap.querySelector(`.mfgr-row[data-row-index="${rowIndex}"]`) as HTMLElement | null;
        const cell = rowEl?.querySelector(`.mfgr-cell[data-col-key="${cssEscape(col.key)}"]`) as HTMLElement | null;
        const input = cell?.querySelector("input,select,textarea") as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;

        if (col.required && isEmpty) {
          markError(cell, input);
          errors.push(tr("widget.grid.row_required", "Row {row}: {label} is required.", { row: rowIndex + 1, label: col.label }));
          return;
        }

        if (col.type === "number" && value != null && value !== "") {
          const num = Number(value);
          if (!Number.isFinite(num)) {
            markError(cell, input);
            errors.push(tr("widget.grid.row_number", "Row {row}: {label} must be a number.", { row: rowIndex + 1, label: col.label }));
            return;
          }
          if (col.min != null && num < col.min) {
            markError(cell, input);
            errors.push(tr("widget.grid.row_min", "Row {row}: {label} must be at least {min}.", { row: rowIndex + 1, label: col.label, min: col.min as any }));
          }
          if (col.max != null && num > col.max) {
            markError(cell, input);
            errors.push(tr("widget.grid.row_max", "Row {row}: {label} must be at most {max}.", { row: rowIndex + 1, label: col.label, max: col.max as any }));
          }
        }

        if (col.type === "email" && value && !emailRe.test(String(value))) {
          markError(cell, input);
          errors.push(tr("widget.grid.row_invalid_email", "Row {row}: {label} is not a valid email.", { row: rowIndex + 1, label: col.label }));
        }
      });
    });

    if (errors.length) {
      const errorBox = wrap.querySelector(".mfgr-error") as HTMLElement | null;
      if (errorBox) {
        errorBox.style.display = "block";
        errorBox.textContent = errors[0];
      }
      return false;
    }

    return true;
  }

  function clearErrors(wrap: HTMLElement): void {
    wrap.querySelectorAll(".mfgr-cell-error").forEach((el) => {
      el.classList.remove("mfgr-cell-error");
      const inp = el.querySelector("input,select,textarea");
      if (inp) inp.removeAttribute("aria-invalid");
    });
    const errorBox = wrap.querySelector(".mfgr-error") as HTMLElement | null;
    if (errorBox) {
      errorBox.style.display = "none";
      errorBox.textContent = "";
    }
  }

  function markError(cell?: HTMLElement | null, input?: Element | null): void {
    if (cell) cell.classList.add("mfgr-cell-error");
    if (input instanceof HTMLElement) input.setAttribute("aria-invalid", "true");
  }

  function cssEscape(value: string): string {
    const api = (window as any).CSS;
    if (api && typeof api.escape === "function") return api.escape(value);
    return String(value).replace(/([^a-zA-Z0-9_-])/g, "\\$1");
  }

  // ---- Builder side column designer (optional host integration) ----
  function renderPropertiesPanel(container: HTMLElement, field: FieldLike, onChange?: (next: any) => void): void {
    const props = getProps(field);
    container.innerHTML = `
<div class="mfgrb-wrap">
  <div class="mfgrb-top">
    <div class="mfgrb-palette">
      <div class="mfgrb-zone-title">${escHtml(tr("widget.grid.builder.field_palette", "Field Type Palette"))}</div>
      ${["text","email","number","tel","date","select","checkbox","textarea"].map((t) => `<button type="button" class="mfgrb-type" data-type="${t}" draggable="true">${titleCase(t)}</button>`).join("")}
    </div>
    <div class="mfgrb-columns">
      <div class="mfgrb-zone-title">${escHtml(tr("widget.grid.builder.drop_area", "Column Drop Area"))}</div>
      <div class="mfgrb-list"></div>
      <div class="mfgrb-empty">${escHtml(tr("widget.grid.builder.drag_here", "Drag a field type here to add a column"))}</div>
    </div>
  </div>
</div>`.trim();

    const list = container.querySelector(".mfgrb-list") as HTMLElement;
    const empty = container.querySelector(".mfgrb-empty") as HTMLElement;
    let dragIndex = -1;

    function emit() {
      const next = { ...(field.widgetProps || {}), ...props, columns: props.columns.map((c) => ({ ...c })) };
      field.widgetProps = next;
      if (typeof onChange === "function") onChange(next);
    }

    function refresh() {
      list.innerHTML = props.columns.map((col, idx) => renderBuilderColumn(col, idx, props.columns)).join("");
      empty.style.display = props.columns.length ? "none" : "block";
    }

    refresh();

    container.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const typeBtn = target.closest(".mfgrb-type") as HTMLElement | null;
      if (typeBtn) {
        e.preventDefault();
        addBuilderColumn(typeBtn.getAttribute("data-type") as ColumnType);
        return;
      }
      const delBtn = target.closest(".mfgrb-del") as HTMLElement | null;
      if (delBtn) {
        e.preventDefault();
        const idx = Number(delBtn.getAttribute("data-index"));
        props.columns.splice(idx, 1);
        refresh();
        emit();
        return;
      }
      const head = target.closest(".mfgrb-item-head") as HTMLElement | null;
      if (head) {
        const item = head.closest(".mfgrb-item");
        item?.classList.toggle("is-open");
      }
    });

    container.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      const item = target.closest(".mfgrb-item") as HTMLElement | null;
      if (!item) return;
      const idx = Number(item.getAttribute("data-index"));
      const key = target.getAttribute("data-prop") || "";
      const col = props.columns[idx];
      if (!col || !key) return;

      if (key === "required") (col as any)[key] = (target as HTMLInputElement).checked;
      else if (key === "min" || key === "max" || key === "step") (col as any)[key] = target.value === "" ? undefined : Number(target.value);
      else if (key === "defaultValue") {
        if (col.type === "number") col.defaultValue = target.value === "" ? null : Number(target.value);
        else if (col.type === "checkbox") col.defaultValue = (target as HTMLInputElement).checked;
        else col.defaultValue = target.value;
      } else if (key === "options") {
        col.options = parseOptionsTextarea(target.value);
      } else {
        (col as any)[key] = target.value;
        if (key === "label" && (!col.key || slugify(col.key) === slugify(col.label))) col.key = slugify(target.value);
      }
      refreshWarnings(container, props.columns);
      emit();
    });

    container.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      if (!target.matches("input[type='checkbox'][data-prop]")) return;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    });

    container.addEventListener("dragstart", (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest(".mfgrb-item") as HTMLElement | null;
      const typeBtn = target.closest(".mfgrb-type") as HTMLElement | null;
      if (item) {
        dragIndex = Number(item.getAttribute("data-index"));
        item.classList.add("is-dragging");
        if (e.dataTransfer) e.dataTransfer.setData("text/plain", `reorder:${dragIndex}`);
      } else if (typeBtn) {
        if (e.dataTransfer) e.dataTransfer.setData("text/plain", `new:${typeBtn.getAttribute("data-type")}`);
      }
    });

    container.addEventListener("dragend", () => {
      dragIndex = -1;
      container.querySelectorAll(".mfgrb-item.is-dragging,.mfgrb-item.is-over").forEach((el) => el.classList.remove("is-dragging", "is-over"));
    });

    container.addEventListener("dragover", (e) => {
      const item = (e.target as HTMLElement).closest(".mfgrb-item,.mfgrb-list") as HTMLElement | null;
      if (!item) return;
      e.preventDefault();
      container.querySelectorAll(".mfgrb-item.is-over").forEach((el) => el.classList.remove("is-over"));
      if (item.classList.contains("mfgrb-item")) item.classList.add("is-over");
    });

    container.addEventListener("drop", (e) => {
      const data = e.dataTransfer?.getData("text/plain") || "";
      const item = (e.target as HTMLElement).closest(".mfgrb-item") as HTMLElement | null;
      const targetIndex = item ? Number(item.getAttribute("data-index")) : props.columns.length;
      if (!data) return;
      e.preventDefault();
      if (data.startsWith("new:")) {
        addBuilderColumn(data.slice(4) as ColumnType, targetIndex);
        return;
      }
      if (data.startsWith("reorder:")) {
        const from = Number(data.slice(8));
        if (!Number.isFinite(from) || from < 0 || from >= props.columns.length) return;
        const [moved] = props.columns.splice(from, 1);
        props.columns.splice(targetIndex > from ? targetIndex - 1 : targetIndex, 0, moved);
        refresh();
        emit();
      }
    });

    function addBuilderColumn(type: ColumnType, atIndex?: number) {
      const baseLabel = titleCase(type);
      const col: ColumnDef = normalizeColumn({
        label: uniqueLabel(baseLabel, props.columns),
        key: uniqueKey(slugify(baseLabel), props.columns),
        type,
        width: "1fr",
        required: false,
        placeholder: type === "checkbox" || type === "date" || type === "select" ? "" : tr("widget.grid.builder.enter_field", "Enter {label}", { label: baseLabel.toLowerCase() }),
        defaultValue: type === "checkbox" ? false : (type === "number" ? null : ""),
        options: type === "select" ? ["Option 1", "Option 2"] : []
      });
      if (atIndex == null || atIndex < 0 || atIndex > props.columns.length) props.columns.push(col);
      else props.columns.splice(atIndex, 0, col);
      refresh();
      refreshWarnings(container, props.columns);
      emit();
    }

    refreshWarnings(container, props.columns);
  }

  function renderBuilderColumn(col: ColumnDef, idx: number, all: ColumnDef[]): string {
    const isDupKey = all.filter((x) => x.key === col.key).length > 1;
    return `
<div class="mfgrb-item" data-index="${idx}" draggable="true">
  <div class="mfgrb-item-head">
    <div>
      <strong>${escHtml(col.label)}</strong>
      <span class="mfgrb-badge">${escHtml(col.type)}</span>
      ${isDupKey ? '<span class="mfgrb-warn">${escHtml(tr("widget.grid.builder.duplicate_key", "Duplicate key"))}</span>' : ""}
    </div>
    <div class="mfgrb-mini">${escHtml(col.width || "1fr")}</div>
    <button type="button" class="mfgrb-del" data-index="${idx}" aria-label="Delete column">✕</button>
  </div>
  <div class="mfgrb-editor">
    <label>Label<input type="text" data-prop="label" value="${escHtml(col.label)}" /></label>
    <label>Key<input type="text" data-prop="key" value="${escHtml(col.key)}" /></label>
    <label>Width<input type="text" data-prop="width" value="${escHtml(col.width || "1fr")}" /></label>
    <label class="mfgrb-inline"><input type="checkbox" data-prop="required" ${col.required ? "checked" : ""} /> ${escHtml(tr("widget.grid.builder.required", "Required"))}</label>
    ${(col.type === "text" || col.type === "email" || col.type === "number" || col.type === "tel" || col.type === "textarea") ? `<label>Placeholder<input type="text" data-prop="placeholder" value="${escHtml(col.placeholder || "")}" /></label>` : ""}
    ${col.type === "number" ? `
      <label>Default<input type="number" data-prop="defaultValue" value="${col.defaultValue ?? ""}" /></label>
      <label>Min<input type="number" data-prop="min" value="${col.min ?? ""}" /></label>
      <label>Max<input type="number" data-prop="max" value="${col.max ?? ""}" /></label>
      <label>Step<input type="number" data-prop="step" value="${col.step ?? ""}" /></label>
    ` : ""}
    ${col.type === "checkbox" ? `<label class="mfgrb-inline"><input type="checkbox" data-prop="defaultValue" ${col.defaultValue ? "checked" : ""} /> Default checked</label>` : ""}
    ${col.type === "select" ? `<label>Options<textarea data-prop="options">${escHtml(optionsToTextarea(col.options || []))}</textarea></label>` : ""}
  </div>
</div>`.trim();
  }

  function refreshWarnings(container: HTMLElement, cols: ColumnDef[]) {
    container.querySelectorAll(".mfgrb-item").forEach((item, idx) => {
      const warn = item.querySelector(".mfgrb-warn");
      const col = cols[idx];
      const dup = cols.filter((x) => x.key === col.key).length > 1;
      if (warn) warn.remove();
      if (dup) item.querySelector(".mfgrb-item-head > div")?.insertAdjacentHTML("beforeend", '<span class="mfgrb-warn">${escHtml(tr("widget.grid.builder.duplicate_key", "Duplicate key"))}</span>');
    });
  }

  function titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function uniqueLabel(base: string, cols: ColumnDef[]): string {
    let label = base;
    let i = 2;
    while (cols.some((c) => c.label === label)) {
      label = `${base} ${i++}`;
    }
    return label;
  }

  function uniqueKey(base: string, cols: ColumnDef[]): string {
    let key = base;
    let i = 2;
    while (cols.some((c) => c.key === key)) {
      key = `${base}_${i++}`;
    }
    return key;
  }

  function optionsToTextarea(options: SelectOption[]): string {
    return options.map((opt) => (typeof opt === "string" ? opt : `${opt.label}|${opt.value}`)).join("\n");
  }

  function parseOptionsTextarea(value: string): SelectOption[] {
    const raw = value.trim();
    if (!raw) return [];
    if (raw.startsWith("[")) {
      const parsed = parseJson<any[]>(raw, []);
      return normalizeOptions(parsed);
    }
    return raw.split(/\r?\n/).map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      if (trimmed.includes("|")) {
        const [label, val] = trimmed.split("|");
        return { label: label.trim(), value: (val ?? label).trim() };
      }
      return trimmed;
    }).filter(Boolean) as SelectOption[];
  }

  if (typeof MegaFormWidgets !== "undefined" && MegaFormWidgets && typeof MegaFormWidgets.register === "function") {
    MegaFormWidgets.register("GridRepeater", {
      meta: { label: "Grid Repeater", icon: "fa-table", category: "advanced" },
      defaults,
      properties,
      render,
      bind,
      collect,
      validate,
      renderPropertiesPanel,
      renderBuilderPanel: renderPropertiesPanel
    });
  }
}
