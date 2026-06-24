/**
 * MegaForm Widget: Terms & Privacy — v1.0
 * Badge: TermsPrivacy v20260603-B65r
 *
 * Required-consent checkbox with linked Terms of Service + Privacy Policy text.
 * Optional second checkbox for marketing-email opt-in. Stores consent metadata
 * (timestamp + form labels) into the submission record so audit trails can
 * prove what the respondent agreed to.
 *
 * Build:   cd Assets/ts && npx tsc -p tsconfig.terms.json
 * Output:  Assets/js/plugins/megaform-widget-terms-privacy.js
 */

declare const MegaFormWidgets: {
  register(type: string, plugin: TermsPlugin): void;
};
declare namespace MFUtil {
  function esc(s: string | null | undefined): string;
  function uid(): string;
}

interface TermsProps {
  label?: string;
  termsLabel?: string;
  termsUrl?: string;
  privacyLabel?: string;
  privacyUrl?: string;
  openInNewTab?: boolean;
  requireConsent?: boolean;
  showMarketingOptIn?: boolean;
  marketingLabel?: string;
  consentVersion?: string;
  defaultChecked?: boolean;
  recordTimestamp?: boolean;
}

interface TermsField {
  key: string;
  type: string;
  label?: string;
  required?: boolean;
  widgetProps?: TermsProps;
}

interface PropertyDef {
  key: string;
  label: string;
  type: 'text' | 'url' | 'checkbox' | 'textarea' | 'select';
  default?: any;
  options?: { value: string; label: string }[];
  hint?: string;
}

interface TermsPlugin {
  meta: { label: string; icon: string; category: string };
  defaults: TermsProps;
  properties: PropertyDef[];
  render(field: TermsField, formId: string | number, val: string): string;
  bind(formId: string | number): void;
  collect(key: string, container: Element): string;
  validate(key: string, container: Element): string | null;
}

(function () {
  function esc(s: string | null | undefined): string {
    if (s == null) return '';
    try { return MFUtil.esc(String(s)); } catch (_e) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
  }
  function uid(): string {
    try { return MFUtil.uid(); } catch (_e) { return 'tp-' + Math.random().toString(36).slice(2, 9); }
  }

  function safeUrl(raw: string | undefined | null): string {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    // Allow only http(s), mailto, or relative paths starting with /
    if (/^https?:\/\//i.test(s)) return s;
    if (/^mailto:/i.test(s)) return s;
    if (s.charAt(0) === '/') return s;
    return 'https://' + s;
  }

  function buildLabelHtml(props: TermsProps): string {
    var base = String(props.label || 'I have read and accept the').trim();
    var tUrl = safeUrl(props.termsUrl || '');
    var tText = String(props.termsLabel || 'Terms of Service').trim();
    var pUrl = safeUrl(props.privacyUrl || '');
    var pText = String(props.privacyLabel || 'Privacy Policy').trim();
    var newTab = props.openInNewTab !== false;
    var target = newTab ? ' target="_blank" rel="noopener noreferrer"' : '';

    var parts: string[] = [esc(base)];
    if (tUrl) parts.push(' <a class="mfw-tp-link" href="' + esc(tUrl) + '"' + target + '>' + esc(tText) + '</a>');
    else if (tText) parts.push(' <span class="mfw-tp-link mfw-tp-link-disabled">' + esc(tText) + '</span>');
    if (tUrl && pUrl) parts.push(' <span class="mfw-tp-sep">' + esc(' and ') + '</span>');
    if (pUrl) parts.push('<a class="mfw-tp-link" href="' + esc(pUrl) + '"' + target + '>' + esc(pText) + '</a>');
    else if (pText && tUrl) parts.push(' <span class="mfw-tp-link mfw-tp-link-disabled">' + esc(pText) + '</span>');
    parts.push('.');
    return parts.join('');
  }

  var widget: TermsPlugin = {
    meta: {
      label: 'Terms & Privacy',
      icon: '📜',
      category: 'Compliance'
    },

    defaults: {
      label: 'I have read and accept the',
      termsLabel: 'Terms of Service',
      termsUrl: '',
      privacyLabel: 'Privacy Policy',
      privacyUrl: '',
      openInNewTab: true,
      requireConsent: true,
      showMarketingOptIn: false,
      marketingLabel: 'Send me product updates and newsletters.',
      consentVersion: '1.0',
      defaultChecked: false,
      recordTimestamp: true
    },

    properties: [
      { key: 'label', label: 'Label text', type: 'text', default: 'I have read and accept the',
        hint: 'Lead-in text shown before the linked Terms / Privacy text.' },
      { key: 'termsLabel', label: 'Terms link text', type: 'text', default: 'Terms of Service' },
      { key: 'termsUrl', label: 'Terms URL', type: 'url', default: '',
        hint: 'Full https URL or site-relative path (e.g. /terms).' },
      { key: 'privacyLabel', label: 'Privacy link text', type: 'text', default: 'Privacy Policy' },
      { key: 'privacyUrl', label: 'Privacy URL', type: 'url', default: '',
        hint: 'Full https URL or site-relative path (e.g. /privacy).' },
      { key: 'openInNewTab', label: 'Open links in new tab', type: 'checkbox', default: true,
        hint: 'When ON, the Terms / Privacy links open in a new browser tab (recommended so the form is not lost).' },
      { key: 'requireConsent', label: 'Require consent before submit', type: 'checkbox', default: true,
        hint: 'When ON, the form cannot be submitted until this box is checked.' },
      { key: 'defaultChecked', label: 'Pre-check the box', type: 'checkbox', default: false,
        hint: 'GDPR best practice: leave this OFF so the respondent must take a positive action.' },
      { key: 'showMarketingOptIn', label: 'Show marketing opt-in checkbox', type: 'checkbox', default: false,
        hint: 'When ON, adds a second OPTIONAL checkbox for marketing emails / newsletters.' },
      { key: 'marketingLabel', label: 'Marketing opt-in text', type: 'text',
        default: 'Send me product updates and newsletters.' },
      { key: 'consentVersion', label: 'Consent version tag', type: 'text', default: '1.0',
        hint: 'Stored alongside the consent for audit. Bump when your Terms / Privacy substantially change.' },
      { key: 'recordTimestamp', label: 'Record consent timestamp', type: 'checkbox', default: true,
        hint: 'Submission stores ISO 8601 timestamp + version so audits can prove what the user agreed to.' }
    ],

    render: function (field: TermsField, formId: string | number, existingValue: string): string {
      var props = field && field.widgetProps ? field.widgetProps : {};
      // Merge with defaults so missing keys still work
      var p: TermsProps = {};
      var d = widget.defaults;
      var key: keyof TermsProps;
      for (key in d) { (p as any)[key] = (props as any)[key] !== undefined ? (props as any)[key] : (d as any)[key]; }

      var id = uid();
      var consentId = id + '-consent';
      var marketingId = id + '-marketing';
      var required = field && field.required !== false && p.requireConsent !== false;
      var isChecked = false;
      try {
        if (existingValue) {
          var ev = String(existingValue);
          if (ev === 'true' || ev === '1' || ev === 'on' || /"consent"\s*:\s*true/.test(ev)) isChecked = true;
        }
      } catch (_e) { /* noop */ }
      if (!existingValue && p.defaultChecked) isChecked = true;

      var labelHtml = buildLabelHtml(p);

      var html = '';
      html += '<div class="mfw-terms-privacy" data-field-key="' + esc(field && field.key ? field.key : '') + '"';
      html +=   ' data-consent-version="' + esc(p.consentVersion || '1.0') + '"';
      html +=   ' data-record-ts="' + (p.recordTimestamp !== false ? '1' : '0') + '">';
      html +=   '<label class="mfw-tp-row" for="' + esc(consentId) + '">';
      html +=     '<input type="checkbox" id="' + esc(consentId) + '" class="mfw-tp-consent"';
      html +=       (isChecked ? ' checked' : '') + (required ? ' aria-required="true"' : '') + '/>';
      html +=     '<span class="mfw-tp-label">' + labelHtml;
      if (required) html += ' <span class="mfw-tp-req" aria-hidden="true">*</span>';
      html +=     '</span>';
      html +=   '</label>';

      if (p.showMarketingOptIn) {
        html += '<label class="mfw-tp-row mfw-tp-row-optional" for="' + esc(marketingId) + '">';
        html +=   '<input type="checkbox" id="' + esc(marketingId) + '" class="mfw-tp-marketing"/>';
        html +=   '<span class="mfw-tp-label mfw-tp-label-optional">' + esc(p.marketingLabel || 'Send me product updates and newsletters.') + '</span>';
        html += '</label>';
      }
      html +=   '<div class="mfw-tp-error" role="alert" aria-live="polite" hidden></div>';
      html += '</div>';
      return html;
    },

    bind: function (_formId: string | number): void {
      var nodes = document.querySelectorAll('.mfw-terms-privacy:not([data-bound="1"])');
      var i: number;
      for (i = 0; i < nodes.length; i++) {
        var root = nodes[i] as HTMLElement;
        root.setAttribute('data-bound', '1');
        var consent = root.querySelector('.mfw-tp-consent') as HTMLInputElement | null;
        var err = root.querySelector('.mfw-tp-error') as HTMLElement | null;
        if (!consent) continue;
        consent.addEventListener('change', function () {
          if (err) { err.hidden = true; err.textContent = ''; }
        });
      }
    },

    collect: function (key: string, container: Element): string {
      var root = container.querySelector('.mfw-terms-privacy[data-field-key="' + (key || '').replace(/"/g, '\\"') + '"]')
              || container.querySelector('.mfw-terms-privacy');
      if (!root) return '';
      var consent = root.querySelector('.mfw-tp-consent') as HTMLInputElement | null;
      var marketing = root.querySelector('.mfw-tp-marketing') as HTMLInputElement | null;
      var consented = !!(consent && consent.checked);
      var marketingOk = !!(marketing && marketing.checked);
      var record = String(root.getAttribute('data-record-ts') || '1') === '1';
      var version = String(root.getAttribute('data-consent-version') || '1.0');
      var payload: any = { consent: consented, version: version };
      if (marketing) payload.marketingOptIn = marketingOk;
      if (record) payload.timestamp = new Date().toISOString();
      // Capture text labels so audit trail shows what they agreed to
      var labelEl = root.querySelector('.mfw-tp-label');
      if (labelEl) payload.labelText = (labelEl.textContent || '').replace(/\s+/g, ' ').trim();
      try { return JSON.stringify(payload); } catch (_e) { return consented ? 'true' : 'false'; }
    },

    validate: function (key: string, container: Element): string | null {
      var root = container.querySelector('.mfw-terms-privacy[data-field-key="' + (key || '').replace(/"/g, '\\"') + '"]')
              || container.querySelector('.mfw-terms-privacy');
      if (!root) return null;
      var consent = root.querySelector('.mfw-tp-consent') as HTMLInputElement | null;
      var ariaReq = consent && consent.getAttribute('aria-required') === 'true';
      var required = !!ariaReq;
      if (!required) return null;
      if (consent && consent.checked) return null;
      var err = root.querySelector('.mfw-tp-error') as HTMLElement | null;
      var msg = 'Please accept the Terms & Privacy to continue.';
      if (err) { err.textContent = msg; err.hidden = false; }
      return msg;
    }
  };

  try {
    if (typeof MegaFormWidgets !== 'undefined' && typeof MegaFormWidgets.register === 'function') {
      MegaFormWidgets.register('TermsPrivacy', widget);
    }
  } catch (_e) { /* noop */ }
})();
