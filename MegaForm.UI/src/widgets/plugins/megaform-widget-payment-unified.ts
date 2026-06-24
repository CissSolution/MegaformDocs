(function () {
  'use strict';

  type AnyObj = any;
  type PaymentProvider = 'stripe' | 'paypal' | 'both';
  type AmountMode = 'fixed' | 'field' | 'listenTotals';

  interface PaymentProps {
    provider: PaymentProvider;
    amountMode: AmountMode;
    amount: number;
    amountFieldKey: string;
    currency: string;
    locale: string;
    listenEventName: string;
    listenSelector: string;
    requiredPaid: boolean;
    accentColor: string;
    title: string;
    description: string;
    amountLabel: string;
    payLabel: string;
    paidLabel: string;
    pendingLabel: string;
    errorLabel: string;
    stripePublishableKey: string;
    stripeCreateIntentUrl: string;
    stripeConfirmReturnUrl: string;
    stripeAppearanceTheme: string;
    paypalClientId: string;
    paypalCreateOrderUrl: string;
    paypalCaptureOrderUrl: string;
    paypalIntent: string;
  }

  interface PaymentValue {
    provider: string;
    status: string;
    amount: number;
    currency: string;
    transactionId: string;
    payerEmail: string;
    payerName: string;
    paidAt: string;
    error: string;
    meta: AnyObj;
  }

  var SCRIPT_CACHE: AnyObj = {};
  var BADGE = 'PaymentPro v20260409-01';
  var SETTINGS_BADGE = 'PaymentSettingsPro v20260409-01';

  function tr(key: string, fallback: string, params?: Record<string, string | number>): string {
    try {
      var i18n = (window as AnyObj).MegaFormI18n;
      if (i18n && typeof i18n.t === 'function') {
        var out = i18n.t(key, params || {});
        if (out && out !== key) return String(out);
      }
    } catch (_e) { }
    var raw = fallback;
    if (params) { Object.keys(params).forEach(function (name) { raw = raw.replace(new RegExp('\\{' + name + '\\}', 'g'), String((params as any)[name] == null ? '' : (params as any)[name])); }); }
    return raw;
  }

  function getWidgets(): AnyObj {
    return (window as AnyObj).MegaFormWidgets;
  }

  function getBuilder(): AnyObj {
    return (window as AnyObj).MegaFormBuilder;
  }

  function util(): AnyObj {
    var mf = (window as AnyObj).MFUtil || {};
    return {
      esc: typeof mf.esc === 'function' ? mf.esc : escHtml,
      fmtId: typeof mf.fmtId === 'function' ? mf.fmtId : function (formId: number, key: string): string { return 'mf-' + formId + '-' + key; },
      apiCall: typeof mf.apiCall === 'function' ? mf.apiCall : apiCall,
      toNum: typeof mf.toNum === 'function' ? mf.toNum : function (v: any): number { return coerceAmount(v); }
    };
  }

  function defaults(): PaymentProps {
    return {
      provider: 'both',
      amountMode: 'fixed',
      amount: 0,
      amountFieldKey: '',
      currency: 'USD',
      locale: 'en-US',
      listenEventName: 'mfw:totals-changed',
      listenSelector: '',
      requiredPaid: true,
      accentColor: '#4f46e5',
      title: tr('widget.payment.title', 'Secure Payment'),
      description: tr('widget.payment.description', 'Choose a payment method and complete checkout.'),
      amountLabel: tr('widget.payment.amount_due', 'Amount due'),
      payLabel: tr('widget.payment.pay_by_card', 'Pay by card'),
      paidLabel: tr('widget.payment.paid', 'Payment completed'),
      pendingLabel: tr('widget.payment.pending', 'Processing payment…'),
      errorLabel: tr('widget.payment.failed', 'Payment failed. Please try again.'),
      stripePublishableKey: '',
      stripeCreateIntentUrl: '/api/megaform/payments/stripe/create-intent',
      stripeConfirmReturnUrl: window.location.href,
      stripeAppearanceTheme: 'stripe',
      paypalClientId: '',
      paypalCreateOrderUrl: '/api/megaform/payments/paypal/create-order',
      paypalCaptureOrderUrl: '/api/megaform/payments/paypal/capture-order',
      paypalIntent: 'capture'
    };
  }

  function emptyValue(): PaymentValue {
    return {
      provider: '',
      status: 'idle',
      amount: 0,
      currency: 'USD',
      transactionId: '',
      payerEmail: '',
      payerName: '',
      paidAt: '',
      error: '',
      meta: {}
    };
  }

  function mergeProps(field: AnyObj): PaymentProps {
    var src = (field && field.widgetProps) || {};
    var d = defaults();
    return {
      provider: asProvider(src.provider, d.provider),
      amountMode: asAmountMode(src.amountMode, d.amountMode),
      amount: toNumber(src.amount, d.amount),
      amountFieldKey: toString(src.amountFieldKey, d.amountFieldKey),
      currency: toString(src.currency, d.currency).toUpperCase(),
      locale: toString(src.locale, d.locale),
      listenEventName: toString(src.listenEventName, d.listenEventName),
      listenSelector: toString(src.listenSelector, d.listenSelector),
      requiredPaid: toBool(src.requiredPaid, d.requiredPaid),
      accentColor: toString(src.accentColor, d.accentColor),
      title: toString(src.title, d.title),
      description: toString(src.description, d.description),
      amountLabel: toString(src.amountLabel, d.amountLabel),
      payLabel: toString(src.payLabel, d.payLabel),
      paidLabel: toString(src.paidLabel, d.paidLabel),
      pendingLabel: toString(src.pendingLabel, d.pendingLabel),
      errorLabel: toString(src.errorLabel, d.errorLabel),
      stripePublishableKey: toString(src.stripePublishableKey, d.stripePublishableKey),
      stripeCreateIntentUrl: toString(src.stripeCreateIntentUrl, d.stripeCreateIntentUrl),
      stripeConfirmReturnUrl: toString(src.stripeConfirmReturnUrl, d.stripeConfirmReturnUrl),
      stripeAppearanceTheme: toString(src.stripeAppearanceTheme, d.stripeAppearanceTheme),
      paypalClientId: toString(src.paypalClientId, d.paypalClientId),
      paypalCreateOrderUrl: toString(src.paypalCreateOrderUrl, d.paypalCreateOrderUrl),
      paypalCaptureOrderUrl: toString(src.paypalCaptureOrderUrl, d.paypalCaptureOrderUrl),
      paypalIntent: toString(src.paypalIntent, d.paypalIntent)
    };
  }

  function getInitialValue(existingValue: any, props: PaymentProps): PaymentValue {
    var parsed = safeJson(existingValue);
    return {
      provider: parsed && parsed.provider ? parsed.provider : '',
      status: parsed && parsed.status ? parsed.status : 'idle',
      amount: parsed && isFinite(parsed.amount) ? parsed.amount : props.amount,
      currency: parsed && parsed.currency ? parsed.currency : props.currency,
      transactionId: parsed && parsed.transactionId ? parsed.transactionId : '',
      payerEmail: parsed && parsed.payerEmail ? parsed.payerEmail : '',
      payerName: parsed && parsed.payerName ? parsed.payerName : '',
      paidAt: parsed && parsed.paidAt ? parsed.paidAt : '',
      error: parsed && parsed.error ? parsed.error : '',
      meta: parsed && parsed.meta ? parsed.meta : {}
    };
  }

  function render(field: AnyObj, formId: number, existingValue?: string): string {
    var u = util();
    var props = mergeProps(field);
    var value = getInitialValue(existingValue, props);
    var amount = value.amount || props.amount;
    var wrapId = u.fmtId(formId, field.key) + '-wrap';
    var inputId = u.fmtId(formId, field.key);
    var jsonProps = encodeAttr(JSON.stringify(props));
    var jsonValue = encodeAttr(JSON.stringify(value));
    var showStripe = props.provider === 'stripe' || props.provider === 'both';
    var showPayPal = props.provider === 'paypal' || props.provider === 'both';
    var activeProvider = props.provider === 'paypal' ? 'paypal' : 'stripe';

    return [
      '<div class="mfw-payment-wrap"',
      ' id="', u.esc(wrapId), '"',
      ' data-field-key="', u.esc(field.key), '"',
      ' data-payment-props="', jsonProps, '"',
      ' data-active-provider="', u.esc(activeProvider), '"',
      ' style="--mfw-accent:', u.esc(props.accentColor), ';">',
      '<div class="mfw-payment-card">',
      '<div class="mfw-payment-top">',
      '<div class="mfw-payment-header">',
      '<div class="mfw-payment-title">', u.esc(props.title), '</div>',
      '<div class="mfw-payment-description">', u.esc(props.description), '</div>',
      '</div>',
      '<div class="mfw-payment-summary">',
      '<div class="mfw-payment-amount-box">',
      '<span class="mfw-payment-amount-label">', u.esc(props.amountLabel), '</span>',
      '<strong class="mfw-payment-amount" data-role="amount-display">', u.esc(formatMoney(amount, props.currency, props.locale)), '</strong>',
      '</div>',
      '<div class="mfw-payment-status" data-role="status-badge" data-status="', u.esc(value.status), '">', u.esc(getStatusText(value, props)), '</div>',
      '</div>',
      '</div>',
      (showStripe && showPayPal) ? [
        '<div class="mfw-payment-provider-switch" data-role="provider-switch">',
        '<button type="button" class="mfw-payment-provider-btn is-active" data-role="provider-btn" data-provider="stripe" aria-pressed="true">',
        '<span class="mfw-payment-provider-brand"><span class="mfw-payment-provider-mark is-stripe" aria-hidden="true">S</span><span>Stripe</span></span>',
        '<span class="mfw-payment-provider-meta">', u.esc(tr('widget.payment.stripe_note', 'Cards, wallets')), '</span>',
        '</button>',
        '<button type="button" class="mfw-payment-provider-btn" data-role="provider-btn" data-provider="paypal" aria-pressed="false">',
        '<span class="mfw-payment-provider-brand"><span class="mfw-payment-provider-mark is-paypal" aria-hidden="true">P</span><span>PayPal</span></span>',
        '<span class="mfw-payment-provider-meta">', u.esc(tr('widget.payment.paypal_note', 'PayPal, cards')), '</span>',
        '</button>',
        '</div>'
      ].join('') : '',
      '<div class="mfw-payment-stage">',
      showStripe ? [
        '<section class="mfw-payment-method mfw-payment-method-stripe', activeProvider === 'stripe' ? ' is-active' : '', '" data-provider-panel="stripe"', activeProvider === 'stripe' ? '' : ' hidden', '>',
        '<div class="mfw-payment-method-head">',
        '<span class="mfw-payment-method-name"><span class="mfw-payment-method-mark is-stripe" aria-hidden="true">S</span><span>Pay with card</span></span>',
        '<span class="mfw-payment-method-note">', u.esc(tr('widget.payment.stripe_note', 'Cards, wallets')), '</span>',
        '</div>',
        '<div class="mfw-payment-stripe-box" data-role="stripe-box">',
        '<div class="mfw-payment-stripe-element" data-role="stripe-element"></div>',
        '<button type="button" class="mfw-payment-btn" data-role="stripe-pay-btn">', u.esc(props.payLabel), '</button>',
        '</div>',
        '</section>'
      ].join('') : '',
      showPayPal ? [
        '<section class="mfw-payment-method mfw-payment-method-paypal', activeProvider === 'paypal' ? ' is-active' : '', '" data-provider-panel="paypal"', activeProvider === 'paypal' ? '' : ' hidden', '>',
        '<div class="mfw-payment-method-head">',
        '<span class="mfw-payment-method-name"><span class="mfw-payment-method-mark is-paypal" aria-hidden="true">P</span><span>Pay with PayPal</span></span>',
        '<span class="mfw-payment-method-note">', u.esc(tr('widget.payment.paypal_note', 'PayPal, cards')), '</span>',
        '</div>',
        '<div class="mfw-payment-paypal-box" data-role="paypal-box">',
        '<div class="mfw-payment-paypal-buttons" data-role="paypal-buttons"></div>',
        '</div>',
        '</section>'
      ].join('') : '',
      '</div>',
      '<div class="mfw-payment-inline-msg" data-role="inline-message"></div>',
      '</div>',
      '<input type="hidden" name="', u.esc(field.key), '" id="', u.esc(inputId), '" value="', jsonValue, '" />',
      '</div>'
    ].join('');
  }

  function bind(formId: number): void {
    var wraps = document.querySelectorAll('.mfw-payment-wrap[id^="mf-' + cssEscape(formId) + '-"]');
    forEachNode(wraps, function (node: AnyObj) {
      var wrap = node as HTMLElement & AnyObj;
      if (wrap._mfwPaymentBound) return;
      wrap._mfwPaymentBound = true;
      setupWrap(wrap);
    });
  }

  function setupWrap(wrap: HTMLElement & AnyObj): void {
    var props = getWrapProps(wrap);
    var hidden = getHiddenInput(wrap);
    var value = getStoredValue(wrap);
    syncValue(wrap, value);
    bindProviderSwitch(wrap, props);
    syncAmountFromMode(wrap, props, hidden);
    bindAmountSource(wrap, props, hidden);
    bindTotalsListener(wrap, props, hidden);
    bindStripe(wrap, props, hidden);
    bindPayPal(wrap, props, hidden);
  }

  function bindProviderSwitch(wrap: HTMLElement & AnyObj, props: PaymentProps): void {
    var btns = wrap.querySelectorAll('[data-role="provider-btn"]');
    if (!btns || !btns.length) {
      setActiveProvider(wrap, props.provider === 'paypal' ? 'paypal' : 'stripe');
      return;
    }
    if (wrap._mfwPaymentProviderSwitchBound) return;
    wrap._mfwPaymentProviderSwitchBound = true;
    forEachNode(btns, function (node: AnyObj) {
      var btn = node as HTMLButtonElement;
      btn.addEventListener('click', function () {
        var provider = String(btn.getAttribute('data-provider') || 'stripe');
        setActiveProvider(wrap, provider === 'paypal' ? 'paypal' : 'stripe');
      });
    });
    setActiveProvider(wrap, String(wrap.getAttribute('data-active-provider') || (props.provider === 'paypal' ? 'paypal' : 'stripe')));
  }

  function setActiveProvider(wrap: HTMLElement, provider: string): void {
    var next = provider === 'paypal' ? 'paypal' : 'stripe';
    wrap.setAttribute('data-active-provider', next);
    wrap.querySelectorAll('[data-role="provider-btn"]').forEach(function (el: Element) {
      var btn = el as HTMLButtonElement;
      var active = String(btn.getAttribute('data-provider') || '') === next;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    wrap.querySelectorAll('[data-provider-panel]').forEach(function (el: Element) {
      var panel = el as HTMLElement;
      var active = String(panel.getAttribute('data-provider-panel') || '') === next;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    if (next === 'stripe') queueStripeRefresh(wrap as any, false);
  }

  function bindAmountSource(wrap: HTMLElement & AnyObj, props: PaymentProps, hidden: HTMLInputElement): void {
    if (props.amountMode !== 'field' || !props.amountFieldKey) return;
    if (wrap._mfwPaymentAmountSourceBound) return;
    wrap._mfwPaymentAmountSourceBound = true;

    var sync = function () {
      var latestProps = getWrapProps(wrap);
      var value = getStoredValue(wrap);
      var resolved = resolveAmountFromField(wrap, latestProps.amountFieldKey || props.amountFieldKey);
      applyResolvedAmount(wrap, hidden, value, resolved, latestProps.currency || props.currency, latestProps.locale || props.locale, 'Amount updated from field source.');
    };

    var queueSync = function () {
      if (wrap._mfwPaymentAmountSyncTimer) window.clearTimeout(wrap._mfwPaymentAmountSyncTimer);
      wrap._mfwPaymentAmountSyncTimer = window.setTimeout(sync, 50);
    };

    var root = findFormScope(wrap);
    var handler = function (ev: Event) {
      var target = ev.target as AnyObj;
      if (!target) return;
      if (matchesFieldTarget(target, props.amountFieldKey)) {
        queueSync();
        return;
      }
      queueSync();
    };

    root.addEventListener('input', handler, true);
    root.addEventListener('change', handler, true);

    try {
      var sourceWrap = findSourceFieldWrap(wrap, props.amountFieldKey);
      if (sourceWrap && typeof MutationObserver !== 'undefined') {
        var observer = new MutationObserver(function () { queueSync(); });
        observer.observe(sourceWrap, { subtree: true, childList: true, characterData: true, attributes: true });
        wrap._mfwPaymentAmountObserver = observer;
      }
    } catch (_e) { }

    window.setTimeout(sync, 30);
    window.setTimeout(sync, 180);
    window.setTimeout(sync, 420);
  }

  function bindTotalsListener(wrap: HTMLElement & AnyObj, props: PaymentProps, hidden: HTMLInputElement): void {
    if (props.amountMode !== 'listenTotals') return;
    if (wrap._mfwPaymentTotalsBound) return;
    wrap._mfwPaymentTotalsBound = true;

    var handler = function (ev: Event) {
      var customEv = ev as CustomEvent;
      var detail: AnyObj = customEv && customEv.detail ? customEv.detail : null;
      if (!detail) return;
      var amount = 0;
      if (typeof detail.grandTotal === 'number') amount = detail.grandTotal;
      else if (typeof detail.total === 'number') amount = detail.total;
      else if (detail.grandTotal != null) amount = coerceAmount(detail.grandTotal);
      else if (detail.total != null) amount = coerceAmount(detail.total);

      var currency = detail.currency ? String(detail.currency).toUpperCase() : props.currency;
      var value = getStoredValue(wrap);
      applyResolvedAmount(wrap, hidden, value, amount, currency, props.locale, amount > 0 ? tr('widget.payment.amount_updated_pricing', 'Amount updated from pricing widget.') : tr('widget.payment.waiting_for_amount_pricing', 'Waiting for amount from pricing widget.'));
    };

    var target: AnyObj = document;
    if (props.listenSelector) {
      var found = document.querySelector(props.listenSelector);
      if (found) target = found;
    }
    target.addEventListener(props.listenEventName, handler);
  }

  function syncAmountFromMode(wrap: HTMLElement & AnyObj, props: PaymentProps, hidden: HTMLInputElement): void {
    var value = getStoredValue(wrap);
    if (props.amountMode === 'fixed') {
      applyResolvedAmount(wrap, hidden, value, props.amount, props.currency, props.locale, props.amount > 0 ? '' : tr('widget.payment.set_amount_or_source', 'Set a payment amount or choose a source field.'));
      return;
    }
    if (props.amountMode === 'field' && props.amountFieldKey) {
      var resolved = resolveAmountFromField(wrap, props.amountFieldKey);
      applyResolvedAmount(wrap, hidden, value, resolved, props.currency, props.locale, resolved > 0 ? 'Amount linked to field: ' + props.amountFieldKey : 'Waiting for source field amount.', false);
      return;
    }
    if (!value.amount) {
      updateAmountDisplay(wrap, 0, props.currency, props.locale);
      setInlineMessage(wrap, 'Waiting for amount source.', 'warn');
    }
  }

  function bindStripe(wrap: HTMLElement & AnyObj, props: PaymentProps, hidden: HTMLInputElement): void {
    var btn = wrap.querySelector('[data-role="stripe-pay-btn"]') as HTMLButtonElement | null;
    if (!btn) return;
    if (!wrap._mfwPaymentStripeClickBound) {
      wrap._mfwPaymentStripeClickBound = true;
      btn.addEventListener('click', function () { void startStripePayment(wrap, props, hidden, btn); });
    }
    queueStripeRefresh(wrap, true);
  }

  async function startStripePayment(wrap: HTMLElement & AnyObj, props: PaymentProps, hidden: HTMLInputElement, btn: HTMLButtonElement): Promise<void> {
    var value = getStoredValue(wrap);
    if (!props.stripePublishableKey) { setFailure(wrap, hidden, value, 'Stripe publishable key is missing.'); return; }
    if (!props.stripeCreateIntentUrl) { setFailure(wrap, hidden, value, 'Stripe create-intent URL is missing.'); return; }
    if (value.amount <= 0) { setFailure(wrap, hidden, value, 'Amount must be greater than zero.'); return; }

    try {
      var ready = await ensureStripeReady(wrap, props, hidden, true);
      if (!ready) return;
      var state = wrap._mfwStripeState as AnyObj;
      if (!state || !state.stripe || !state.elements) throw new Error('Stripe payment form is not ready yet.');
      setPending(wrap, hidden, value, 'stripe', props.pendingLabel);
      btn.disabled = true;
      var result = await state.stripe.confirmPayment({
        elements: state.elements,
        confirmParams: { return_url: props.stripeConfirmReturnUrl || window.location.href },
        redirect: 'if_required'
      });
      if (result && result.error) throw new Error(result.error.message || 'Stripe confirmation failed.');
      value.provider = 'stripe';
      value.status = 'paid';
      value.transactionId = state.paymentIntentId || 'stripe_payment';
      value.paidAt = new Date().toISOString();
      value.error = '';
      value.meta = { clientSecret: state.clientSecret || '', paymentIntentId: state.paymentIntentId || '' };
      syncValue(wrap, value);
      setInlineMessage(wrap, props.paidLabel, 'success');
    } catch (err: any) {
      setFailure(wrap, hidden, value, toErrorMessage(err, props.errorLabel));
    } finally {
      var latestBtn = wrap.querySelector('[data-role="stripe-pay-btn"]') as HTMLButtonElement | null;
      if (latestBtn) latestBtn.disabled = false;
    }
  }

  function bindPayPal(wrap: HTMLElement & AnyObj, props: PaymentProps, hidden: HTMLInputElement): void {
    var host = wrap.querySelector('[data-role="paypal-buttons"]') as HTMLElement | null;
    if (!host) return;
    if (!props.paypalClientId) {
      host.innerHTML = '<div class="mfw-payment-mini-error">PayPal client ID is missing.</div>';
      return;
    }
    void renderPayPalButtons(wrap, props, hidden, host);
  }

  function queueStripeRefresh(wrap: HTMLElement & AnyObj, immediate: boolean): void {
    if (wrap._mfwStripeRefreshTimer) {
      window.clearTimeout(wrap._mfwStripeRefreshTimer);
      wrap._mfwStripeRefreshTimer = 0;
    }
    var props = getWrapProps(wrap);
    if (props.provider !== 'stripe' && props.provider !== 'both') return;
    var run = function () {
      var latestProps = getWrapProps(wrap);
      var hidden = getHiddenInput(wrap);
      void ensureStripeReady(wrap, latestProps, hidden, false);
    };
    if (immediate) run();
    else wrap._mfwStripeRefreshTimer = window.setTimeout(run, 220);
  }

  function clearStripeState(wrap: HTMLElement & AnyObj, host: HTMLElement | null, btn: HTMLButtonElement | null, note: string, kind: string = 'warn'): void {
    try {
      var state = wrap._mfwStripeState as AnyObj;
      if (state && state.paymentElement && typeof state.paymentElement.unmount === 'function') state.paymentElement.unmount();
    } catch (_e) { }
    wrap._mfwStripeState = null;
    wrap._mfwStripeReadySignature = '';
    wrap._mfwStripeReadyPromise = null;
    if (host) host.innerHTML = note ? '<div class="mfw-payment-mini-hint is-' + escHtml(kind) + '">' + escHtml(note) + '</div>' : '';
    if (btn) btn.disabled = true;
  }

  async function ensureStripeReady(wrap: HTMLElement & AnyObj, props: PaymentProps, hidden: HTMLInputElement, forceActive: boolean): Promise<boolean> {
    var host = wrap.querySelector('[data-role="stripe-element"]') as HTMLElement | null;
    var btn = wrap.querySelector('[data-role="stripe-pay-btn"]') as HTMLButtonElement | null;
    if (!host || !btn) return false;
    var activeProvider = String(wrap.getAttribute('data-active-provider') || (props.provider === 'paypal' ? 'paypal' : 'stripe'));
    if (!forceActive && props.provider === 'both' && activeProvider !== 'stripe') return false;
    var value = getStoredValue(wrap);
    if (!props.stripePublishableKey) {
      clearStripeState(wrap, host, btn, 'Add a Stripe publishable key to load the secure card form.', 'error');
      return false;
    }
    if (!props.stripeCreateIntentUrl) {
      clearStripeState(wrap, host, btn, 'Add a Stripe create-intent URL to load the secure card form.', 'error');
      return false;
    }
    if (value.amount <= 0) {
      clearStripeState(wrap, host, btn, tr('widget.payment.amount_must_be_positive', 'Amount must be greater than zero before payment.'), 'warn');
      return false;
    }

    var signature = [props.stripePublishableKey, props.stripeCreateIntentUrl, value.amount, value.currency || props.currency, props.stripeAppearanceTheme || 'stripe'].join('|');
    if (wrap._mfwStripeReadySignature === signature && wrap._mfwStripeState && wrap._mfwStripeState.elements) {
      btn.disabled = false;
      return true;
    }
    if (wrap._mfwStripeReadyPromise && wrap._mfwStripeReadySignature === signature) {
      return await wrap._mfwStripeReadyPromise;
    }

    clearStripeState(wrap, host, btn, 'Loading secure card form…', 'info');
    wrap._mfwStripeReadySignature = signature;
    wrap._mfwStripeReadyPromise = (async function (): Promise<boolean> {
      try {
        await loadScriptOnce('https://js.stripe.com/v3/');
        var browserWindow: AnyObj = window as AnyObj;
        if (!browserWindow.Stripe) throw new Error('Stripe SDK failed to load.');
        var stripe = browserWindow.Stripe(props.stripePublishableKey);
        var response = await util().apiCall('POST', props.stripeCreateIntentUrl, {
          amount: value.amount,
          currency: value.currency || props.currency,
          fieldKey: wrap.getAttribute('data-field-key'),
          provider: 'stripe'
        });
        if (!response || !response.clientSecret) throw new Error('Stripe client secret was not returned by the server.');
        host.innerHTML = '';
        var elements = stripe.elements({ clientSecret: response.clientSecret, appearance: { theme: props.stripeAppearanceTheme || 'stripe' } });
        var paymentElement = elements.create('payment');
        paymentElement.mount(host);
        wrap._mfwStripeState = {
          stripe: stripe,
          elements: elements,
          paymentElement: paymentElement,
          clientSecret: response.clientSecret,
          paymentIntentId: response.paymentIntentId || ''
        };
        btn.disabled = false;
        setInlineMessage(wrap, tr('widget.payment.card_ready', 'Secure card form is ready.'), 'info');
        return true;
      } catch (err: any) {
        clearStripeState(wrap, host, btn, toErrorMessage(err, props.errorLabel), 'error');
        return false;
      }
    })();
    return await wrap._mfwStripeReadyPromise;
  }

  async function renderPayPalButtons(wrap: HTMLElement & AnyObj, props: PaymentProps, hidden: HTMLInputElement, host: HTMLElement): Promise<void> {
    try {
      var sdkUrl = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(props.paypalClientId) + '&currency=' + encodeURIComponent(props.currency) + '&intent=' + encodeURIComponent(props.paypalIntent || 'capture');
      await loadScriptOnce(sdkUrl);
      var browserWindow: AnyObj = window as AnyObj;
      if (!browserWindow.paypal || !browserWindow.paypal.Buttons) throw new Error('PayPal SDK failed to load.');
      host.innerHTML = '';
      browserWindow.paypal.Buttons({
        createOrder: function () {
          var value = getStoredValue(wrap);
          if (value.amount <= 0) throw new Error('Amount must be greater than zero.');
          setPending(wrap, hidden, value, 'paypal', props.pendingLabel);
          return Promise.resolve(util().apiCall('POST', props.paypalCreateOrderUrl, {
            amount: value.amount,
            currency: value.currency || props.currency,
            fieldKey: wrap.getAttribute('data-field-key'),
            provider: 'paypal'
          }).then(function (res: AnyObj) {
            if (!res || !res.id) throw new Error('PayPal order ID was not returned by the server.');
            return res.id;
          }));
        },
        onApprove: function (data: AnyObj) {
          var orderId = data.orderID ? String(data.orderID) : '';
          if (!orderId) throw new Error('PayPal order ID missing from approval payload.');
          return Promise.resolve(util().apiCall('POST', props.paypalCaptureOrderUrl, {
            orderId: orderId,
            fieldKey: wrap.getAttribute('data-field-key'),
            provider: 'paypal'
          }).then(function (capture: AnyObj) {
            var stored = getStoredValue(wrap);
            stored.provider = 'paypal';
            stored.status = 'paid';
            stored.transactionId = readPayPalCaptureId(capture, orderId);
            stored.currency = readPayPalCurrency(capture, stored.currency || props.currency);
            stored.amount = readPayPalAmount(capture, stored.amount);
            stored.payerEmail = capture && capture.payer && capture.payer.email_address ? capture.payer.email_address : '';
            stored.payerName = capture && capture.payer && capture.payer.name ? [capture.payer.name.given_name || '', capture.payer.name.surname || ''].join(' ').trim() : '';
            stored.paidAt = new Date().toISOString();
            stored.error = '';
            stored.meta = { orderId: orderId };
            syncValue(wrap, stored);
            setInlineMessage(wrap, props.paidLabel, 'success');
          }));
        },
        onError: function (err: AnyObj) {
          var value = getStoredValue(wrap);
          setFailure(wrap, hidden, value, toErrorMessage(err, props.errorLabel));
        }
      }).render(host);
    } catch (err: any) {
      host.innerHTML = '<div class="mfw-payment-mini-error">' + escHtml(toErrorMessage(err, props.errorLabel)) + '</div>';
    }
  }

  function collect(key: string, container: HTMLElement): string {
    var wrap = getWrap(container, key);
    if (!wrap) return JSON.stringify(emptyValue());
    return JSON.stringify(getStoredValue(wrap));
  }

  function validate(key: string, container: HTMLElement): boolean {
    var wrap = getWrap(container, key);
    if (!wrap) return false;
    var props = getWrapProps(wrap);
    var value = getStoredValue(wrap);
    var isValid = !props.requiredPaid || value.status === 'paid';
    setStatusVisual(wrap, value, props);
    if (!isValid) setInlineMessage(wrap, tr('widget.payment.complete_before_submit', 'Complete payment before submitting the form.'), 'error');
    return isValid;
  }

  function renderProperties(body: HTMLElement, field: AnyObj, onChange: Function): void {
    var props = mergeProps(field);
    var fields = getSourceFieldOptions(field && field.key ? String(field.key) : '');

    body.innerHTML = [
      '<div class="mfw-auto-props mfw-paycfg">',
      '<div class="mfw-paycfg-head mfw-paycfg-head--simple">',
      '<div class="mfw-paycfg-title-row"><div class="mfw-paycfg-title">Payment widget settings</div><span class="mfw-paycfg-badge">' + escHtml(SETTINGS_BADGE) + '</span></div>',
      '<div class="mfw-paycfg-subtitle">Compact checkout • source-driven amount</div>',
      '</div>',
      '<div class="mfw-paycfg-tabs">',
      renderSettingsTab('setup', 'Setup', true),
      renderSettingsTab('labels', 'Labels', false),
      renderSettingsTab('stripe', 'Stripe', false),
      renderSettingsTab('paypal', 'PayPal', false),
      renderSettingsTab('style', 'Style', false),
      '</div>',
      '<div class="mfw-paycfg-pane is-active" data-paycfg-pane="setup">',
      '<div class="mfw-paycfg-card mfw-paycfg-card--compact">',
      renderSelect('Payment provider', 'provider', props.provider, [
        { value: 'both', label: 'Stripe + PayPal' },
        { value: 'stripe', label: 'Stripe only' },
        { value: 'paypal', label: 'PayPal only' }
      ]),
      renderSelect('Amount source', 'amountMode', props.amountMode, [
        { value: 'fixed', label: 'Fixed amount' },
        { value: 'field', label: 'From field / calculator' },
        { value: 'listenTotals', label: 'From totals event (advanced)' }
      ]),
      '<div class="mfw-paycfg-mode" data-amount-mode="fixed">' + renderNumber('Fixed amount', 'amount', props.amount, '0.01') + '</div>',
      '<div class="mfw-paycfg-mode" data-amount-mode="field">' + renderSelect('Source field', 'amountFieldKey', props.amountFieldKey, fields) + '<div class="mfw-paycfg-help">Choose a Number, Calculator, hidden amount field, or pricing field.</div></div>',
      '<div class="mfw-paycfg-mode" data-amount-mode="listenTotals">' + renderText('Totals event name', 'listenEventName', props.listenEventName) + renderText('Event target selector', 'listenSelector', props.listenSelector) + '</div>',
      renderText('Currency', 'currency', props.currency),
      renderCheckbox('Require payment before submit', 'requiredPaid', props.requiredPaid),
      '</div>',
      '</div>',
      '<div class="mfw-paycfg-pane" data-paycfg-pane="labels" hidden>',
      '<div class="mfw-paycfg-card mfw-paycfg-card--compact">',
      renderText('Card title', 'title', props.title),
      renderTextarea('Description', 'description', props.description),
      renderText('Amount label', 'amountLabel', props.amountLabel),
      renderText('Card button label', 'payLabel', props.payLabel),
      renderText('Paid label', 'paidLabel', props.paidLabel),
      renderText('Pending label', 'pendingLabel', props.pendingLabel),
      renderText('Error label', 'errorLabel', props.errorLabel),
      '</div>',
      '</div>',
      '<div class="mfw-paycfg-pane" data-paycfg-pane="stripe" hidden>',
      '<div class="mfw-paycfg-card mfw-paycfg-card--compact">',
      renderText('Publishable key', 'stripePublishableKey', props.stripePublishableKey),
      renderText('Create intent URL', 'stripeCreateIntentUrl', props.stripeCreateIntentUrl),
      renderText('Confirm return URL', 'stripeConfirmReturnUrl', props.stripeConfirmReturnUrl),
      renderSelect('Appearance theme', 'stripeAppearanceTheme', props.stripeAppearanceTheme, [
        { value: 'stripe', label: 'Stripe' },
        { value: 'night', label: 'Night' },
        { value: 'flat', label: 'Flat' }
      ]),
      '</div>',
      '</div>',
      '<div class="mfw-paycfg-pane" data-paycfg-pane="paypal" hidden>',
      '<div class="mfw-paycfg-card mfw-paycfg-card--compact">',
      renderText('Client ID', 'paypalClientId', props.paypalClientId),
      renderText('Create order URL', 'paypalCreateOrderUrl', props.paypalCreateOrderUrl),
      renderText('Capture order URL', 'paypalCaptureOrderUrl', props.paypalCaptureOrderUrl),
      renderSelect('PayPal intent', 'paypalIntent', props.paypalIntent, [
        { value: 'capture', label: 'Capture' },
        { value: 'authorize', label: 'Authorize' }
      ]),
      '</div>',
      '</div>',
      '<div class="mfw-paycfg-pane" data-paycfg-pane="style" hidden>',
      '<div class="mfw-paycfg-card mfw-paycfg-card--compact">',
      renderColor('Accent color', 'accentColor', props.accentColor),
      '<div class="mfw-paycfg-help">Styles the amount box, selected method, and main button.</div>',
      '</div>',
      '</div>',
      '</div>'
    ].join('');

    var refreshVisibility = function () {
      var mode = String((field.widgetProps && field.widgetProps.amountMode) || 'fixed');
      body.querySelectorAll('[data-amount-mode]').forEach(function (el: Element) {
        (el as HTMLElement).style.display = ((el as HTMLElement).getAttribute('data-amount-mode') === mode) ? '' : 'none';
      });
    };

    bindSettingsTabs(body);

    body.querySelectorAll('[data-prop]').forEach(function (el: Element) {
      var input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      var evt = (input instanceof HTMLInputElement && input.type === 'checkbox') || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(evt, function () {
        var key = input.getAttribute('data-prop') || '';
        var val: any = (input instanceof HTMLInputElement && input.type === 'checkbox') ? input.checked : input.value;
        if (input.getAttribute('data-prop-type') === 'number') val = input.value === '' ? 0 : Number(input.value);
        field.widgetProps = field.widgetProps || {};
        field.widgetProps[key] = val;
        if (key === 'currency' && typeof val === 'string') field.widgetProps[key] = String(val).toUpperCase();
        refreshVisibility();
        onChange();
      });
    });

    refreshVisibility();
  }

  function renderSettingsTab(key: string, label: string, active: boolean): string {
    return '<button type="button" class="mfw-paycfg-tab' + (active ? ' is-active' : '') + '" data-paycfg-tab="' + escAttr(key) + '">' + escHtml(label) + '</button>';
  }

  function bindSettingsTabs(body: HTMLElement): void {
    body.querySelectorAll('[data-paycfg-tab]').forEach(function (node: Element) {
      var btn = node as HTMLButtonElement;
      btn.addEventListener('click', function () {
        var next = String(btn.getAttribute('data-paycfg-tab') || 'setup');
        body.querySelectorAll('[data-paycfg-tab]').forEach(function (tabNode: Element) {
          tabNode.classList.toggle('is-active', tabNode === btn);
        });
        body.querySelectorAll('[data-paycfg-pane]').forEach(function (paneNode: Element) {
          var pane = paneNode as HTMLElement;
          var active = String(pane.getAttribute('data-paycfg-pane') || '') === next;
          pane.classList.toggle('is-active', active);
          pane.hidden = !active;
        });
      });
    });
  }

  function renderSelect(label: string, key: string, value: any, options: Array<{ value: string; label: string }>): string {
    var html = '<label class="mfw-prop-row"><span class="mfw-prop-label">' + escHtml(label) + '</span><select data-prop="' + escHtml(key) + '">';
    options.forEach(function (opt) {
      html += '<option value="' + escAttr(opt.value) + '"' + (String(value || '') === String(opt.value) ? ' selected' : '') + '>' + escHtml(opt.label) + '</option>';
    });
    html += '</select></label>';
    return html;
  }

  function renderText(label: string, key: string, value: any): string {
    return '<label class="mfw-prop-row"><span class="mfw-prop-label">' + escHtml(label) + '</span><input type="text" data-prop="' + escHtml(key) + '" value="' + escAttr(String(value || '')) + '"></label>';
  }

  function renderTextarea(label: string, key: string, value: any): string {
    return '<label class="mfw-prop-row mfw-prop-col"><span class="mfw-prop-label">' + escHtml(label) + '</span><textarea rows="3" data-prop="' + escHtml(key) + '">' + escHtml(String(value || '')) + '</textarea></label>';
  }

  function renderNumber(label: string, key: string, value: any, step: string): string {
    return '<label class="mfw-prop-row"><span class="mfw-prop-label">' + escHtml(label) + '</span><input type="number" step="' + escAttr(step) + '" data-prop="' + escHtml(key) + '" data-prop-type="number" value="' + escAttr(String(value != null ? value : '')) + '"></label>';
  }

  function renderColor(label: string, key: string, value: any): string {
    return '<label class="mfw-prop-row"><span class="mfw-prop-label">' + escHtml(label) + '</span><input type="color" data-prop="' + escHtml(key) + '" value="' + escAttr(String(value || '#4f46e5')) + '"></label>';
  }

  function renderCheckbox(label: string, key: string, checked: boolean): string {
    return '<label class="mfw-prop-toggle"><input type="checkbox" data-prop="' + escHtml(key) + '"' + (checked ? ' checked' : '') + '><span>' + escHtml(label) + '</span></label>';
  }

  function getSourceFieldOptions(currentFieldKey: string): Array<{ value: string; label: string }> {
    var out: Array<{ value: string; label: string }> = [{ value: '', label: 'Select field…' }];
    try {
      var builder = getBuilder();
      var schema = builder && builder.state && builder.state.schema ? builder.state.schema : null;
      var all = flattenFields(schema && schema.fields ? schema.fields : []);
      all.forEach(function (f: AnyObj) {
        if (!f || !f.key || f.key === currentFieldKey) return;
        var type = String(f.type || '');
        if (/^(Payment|Section|Html|PageBreak|Divider)$/i.test(type)) return;
        var label = (f.label || f.key) + ' (' + f.key + ') — ' + type;
        out.push({ value: f.key, label: label });
      });
    } catch (_e) {}
    return out;
  }

  function flattenFields(fields: AnyObj[]): AnyObj[] {
    var out: AnyObj[] = [];
    (fields || []).forEach(function (f: AnyObj) {
      if (!f) return;
      out.push(f);
      if (f.type === 'Row' && Array.isArray(f.columns)) {
        (f.columns || []).forEach(function (col: AnyObj) {
          out = out.concat(flattenFields(col && col.fields ? col.fields : []));
        });
      }
    });
    return out;
  }

  function getWrap(container: HTMLElement, key: string): HTMLElement | null {
    return container.querySelector('.mfw-payment-wrap[data-field-key="' + cssEscape(key) + '"]');
  }

  function getHiddenInput(wrap: HTMLElement): HTMLInputElement {
    var fieldKey = wrap.getAttribute('data-field-key') || '';
    var input = document.getElementById(wrap.id.replace(/-wrap$/, '')) as HTMLInputElement | null;
    if (input) return input;
    var fallback = wrap.querySelector('input[type="hidden"][name="' + cssEscape(fieldKey) + '"]') as HTMLInputElement | null;
    if (!fallback) throw new Error(tr('widget.payment.hidden_input_missing', 'Payment widget hidden input not found.'));
    return fallback;
  }

  function getWrapProps(wrap: HTMLElement): PaymentProps {
    var raw = wrap.getAttribute('data-payment-props') || '{}';
    return mergeProps({ widgetProps: safeJson(raw) || {} });
  }

  function getStoredValue(wrap: HTMLElement): PaymentValue {
    var props = getWrapProps(wrap);
    var hidden = getHiddenInput(wrap);
    return getInitialValue(hidden.value, props);
  }

  function syncValue(wrap: HTMLElement, value: PaymentValue): void {
    var props = getWrapProps(wrap);
    var hidden = getHiddenInput(wrap);
    hidden.value = JSON.stringify(value);
    updateAmountDisplay(wrap, value.amount, value.currency || props.currency, props.locale);
    setStatusVisual(wrap, value, props);
  }

  function applyResolvedAmount(wrap: HTMLElement, hidden: HTMLInputElement, value: PaymentValue, amount: number, currency: string, locale: string, message: string, setMessage: boolean = true): void {
    var changed = roundMoney(value.amount) !== roundMoney(amount) || String(value.currency || '').toUpperCase() !== String(currency || '').toUpperCase();
    value.amount = roundMoney(amount);
    value.currency = String(currency || value.currency || 'USD').toUpperCase();
    if (changed) {
      if (value.status === 'paid') {
        value.status = amount > 0 ? 'idle' : 'pending';
        value.provider = '';
        value.transactionId = '';
        value.payerEmail = '';
        value.payerName = '';
        value.paidAt = '';
        value.error = '';
        value.meta = {};
        if (setMessage) setInlineMessage(wrap, tr('widget.payment.amount_changed_retry', 'Amount changed. Please complete payment again.'), amount > 0 ? 'warn' : 'error');
      } else if (value.status !== 'paid') {
        value.status = amount > 0 ? 'idle' : 'pending';
      }
    } else if (value.status !== 'paid') {
      value.status = amount > 0 ? 'idle' : 'pending';
    }
    hidden.value = JSON.stringify(value);
    syncValue(wrap, value);
    if (setMessage && message) setInlineMessage(wrap, message, amount > 0 ? 'info' : 'warn');
    if (!message && amount <= 0) setInlineMessage(wrap, tr('widget.payment.amount_must_be_positive', 'Amount must be greater than zero before payment.'), 'warn');
    queueStripeRefresh(wrap as any, false);
  }

  function updateAmountDisplay(wrap: HTMLElement, amount: number, currency: string, locale: string): void {
    var target = wrap.querySelector('[data-role="amount-display"]') as HTMLElement | null;
    if (target) target.textContent = formatMoney(amount, currency, locale);
  }

  function setStatusVisual(wrap: HTMLElement, value: PaymentValue, props: PaymentProps): void {
    var badge = wrap.querySelector('[data-role="status-badge"]') as HTMLElement | null;
    if (!badge) return;
    badge.setAttribute('data-status', value.status);
    badge.textContent = getStatusText(value, props);
  }

  function setInlineMessage(wrap: HTMLElement, message: string, kind: string): void {
    var el = wrap.querySelector('[data-role="inline-message"]') as HTMLElement | null;
    if (!el) return;
    el.className = 'mfw-payment-inline-msg is-' + kind;
    el.textContent = message;
  }

  function setPending(wrap: HTMLElement, hidden: HTMLInputElement, value: PaymentValue, provider: string, label: string): void {
    value.provider = provider;
    value.status = 'pending';
    value.error = '';
    hidden.value = JSON.stringify(value);
    syncValue(wrap, value);
    setInlineMessage(wrap, label, 'info');
  }

  function setFailure(wrap: HTMLElement, hidden: HTMLInputElement, value: PaymentValue, message: string): void {
    value.status = 'failed';
    value.error = message;
    hidden.value = JSON.stringify(value);
    syncValue(wrap, value);
    setInlineMessage(wrap, message, 'error');
  }

  function getStatusText(value: PaymentValue, props: PaymentProps): string {
    if (value.status === 'paid') return props.paidLabel;
    if (value.status === 'pending') return props.pendingLabel;
    if (value.status === 'failed') return value.error || props.errorLabel;
    return tr('widget.payment.not_paid', 'Not paid');
  }

  function findFormScope(wrap: HTMLElement): HTMLElement | Document {
    return (wrap.closest('.mf-form-wrapper') as HTMLElement) || (wrap.closest('.mfp-body') as HTMLElement) || document;
  }

  function findSourceFieldWrap(wrap: HTMLElement, fieldKey: string): HTMLElement | null {
    if (!fieldKey) return null;
    var scope = findFormScope(wrap);
    var root: ParentNode = scope instanceof HTMLElement ? scope : document;
    return root.querySelector('[data-field-key="' + cssEscape(fieldKey) + '"]') as HTMLElement | null;
  }


  function resolveAmountFromField(wrap: HTMLElement, fieldKey: string): number {
    if (!fieldKey) return 0;
    var scope = findFormScope(wrap);
    var root: ParentNode = scope instanceof HTMLElement ? scope : document;
    var selector = '[name="' + cssEscape(fieldKey) + '"]';
    var nodes = root.querySelectorAll(selector);
    if (!nodes || !nodes.length) {
      var fallback = root.querySelector('#' + cssEscape('mf-' + getFormIdFromWrap(wrap) + '-' + fieldKey));
      if (fallback) return readAmountFromElements([fallback as Element]);
      return 0;
    }
    return readAmountFromElements(Array.prototype.slice.call(nodes));
  }

  function getFormIdFromWrap(wrap: HTMLElement): string {
    var match = wrap.id.match(/^mf-(\d+)-/);
    return match ? match[1] : '0';
  }

  function readAmountFromElements(nodes: Element[]): number {
    var values: number[] = [];
    nodes.forEach(function (node: Element) {
      var el = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (el instanceof HTMLInputElement) {
        if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) return;
        if (el.type === 'hidden' || el.type === 'number' || el.type === 'text' || el.type === 'email' || el.type === 'tel') {
          values.push(coerceAmount(el.value));
          return;
        }
      }
      var raw: any = (el as any).value != null ? (el as any).value : (el.textContent || '');
      values.push(coerceAmount(raw));
    });
    if (!values.length) return 0;
    if (values.length === 1) return roundMoney(values[0]);
    var sum = 0;
    values.forEach(function (v) { if (isFinite(v)) sum += v; });
    return roundMoney(sum);
  }

  function matchesFieldTarget(target: AnyObj, fieldKey: string): boolean {
    if (!target) return false;
    if (target.name && String(target.name) === fieldKey) return true;
    if (target.id && String(target.id) === fieldKey) return true;
    if (target.getAttribute) {
      var dataKey = target.getAttribute('data-field-key') || '';
      if (dataKey === fieldKey) return true;
    }
    if (target.closest) {
      var owner = target.closest('[data-field-key="' + cssEscape(fieldKey) + '"]');
      if (owner) return true;
    }
    return false;
  }

  function loadScriptOnce(url: string): Promise<void> {
    if (Object.prototype.hasOwnProperty.call(SCRIPT_CACHE, url)) return SCRIPT_CACHE[url];
    SCRIPT_CACHE[url] = new Promise<void>(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + url.replace(/"/g, '\\"') + '"]') as HTMLScriptElement | null;
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') { resolve(); return; }
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () { reject(new Error('Failed to load script: ' + url)); });
        return;
      }
      var script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = function () { script.setAttribute('data-loaded', '1'); resolve(); };
      script.onerror = function () { reject(new Error('Failed to load script: ' + url)); };
      document.head.appendChild(script);
    });
    return SCRIPT_CACHE[url];
  }

  async function apiCall(method: string, url: string, body?: any): Promise<any> {
    var resp = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: body != null ? JSON.stringify(body) : undefined
    });
    var text = await resp.text();
    var parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (_e) { parsed = text; }
    if (!resp.ok) throw new Error((parsed && (parsed.error || parsed.message)) || ('Request failed: ' + resp.status));
    return parsed;
  }

  function readPayPalCaptureId(capture: AnyObj, fallback: string): string {
    var item = capture && capture.purchase_units && capture.purchase_units[0] && capture.purchase_units[0].payments && capture.purchase_units[0].payments.captures && capture.purchase_units[0].payments.captures[0];
    return item && item.id ? item.id : fallback;
  }

  function readPayPalCurrency(capture: AnyObj, fallback: string): string {
    var item = capture && capture.purchase_units && capture.purchase_units[0] && capture.purchase_units[0].payments && capture.purchase_units[0].payments.captures && capture.purchase_units[0].payments.captures[0];
    return item && item.amount && item.amount.currency_code ? item.amount.currency_code : fallback;
  }

  function readPayPalAmount(capture: AnyObj, fallback: number): number {
    var item = capture && capture.purchase_units && capture.purchase_units[0] && capture.purchase_units[0].payments && capture.purchase_units[0].payments.captures && capture.purchase_units[0].payments.captures[0];
    if (item && item.amount && item.amount.value) return coerceAmount(item.amount.value);
    return roundMoney(fallback || 0);
  }

  function formatMoney(amount: number, currency: string, locale: string): string {
    var safeAmount = isFinite(amount) ? amount : 0;
    try {
      return new Intl.NumberFormat(locale || 'en-US', { style: 'currency', currency: (currency || 'USD').toUpperCase() }).format(safeAmount);
    } catch (_e) {
      return (currency || 'USD').toUpperCase() + ' ' + safeAmount.toFixed(2);
    }
  }

  function coerceAmount(input: any): number {
    if (typeof input === 'number' && isFinite(input)) return roundMoney(input);
    if (Array.isArray(input)) {
      var sum = 0;
      input.forEach(function (item) { sum += coerceAmount(item); });
      return roundMoney(sum);
    }
    if (input && typeof input === 'object') {
      var keys = ['grandTotal', 'total', 'amount', 'value', 'number'];
      for (var i = 0; i < keys.length; i++) {
        if (input[keys[i]] != null) return coerceAmount(input[keys[i]]);
      }
      if ((input as any).results && typeof (input as any).results === 'object') {
        var results = (input as any).results;
        var resultKeys = ['payment_total', 'grand_total', 'grandTotal', 'invoice_total', 'live_total', 'total', 'amount', 'result', 'due'];
        for (var r = 0; r < resultKeys.length; r++) {
          if (results[resultKeys[r]] != null) return coerceAmount(results[resultKeys[r]]);
        }
        var numeric: number[] = [];
        Object.keys(results).forEach(function (name) {
          var candidate = coerceAmount(results[name]);
          if (isFinite(candidate) && candidate !== 0) numeric.push(candidate);
        });
        if (numeric.length) return roundMoney(numeric[numeric.length - 1]);
      }
      if ((input as any).variables && typeof (input as any).variables === 'object') {
        var vars = (input as any).variables;
        if (vars.amount != null) return coerceAmount(vars.amount);
      }
    }
    var raw = String(input == null ? '' : input).trim();
    if (!raw) return 0;
    try {
      var parsed = JSON.parse(raw);
      if (parsed != null && parsed !== raw) return coerceAmount(parsed);
    } catch (_e) {}
    var cleaned = raw.replace(/[^0-9,.-]/g, '');
    if (cleaned.indexOf(',') !== -1 && cleaned.indexOf('.') === -1) cleaned = cleaned.replace(/,/g, '.');
    else cleaned = cleaned.replace(/,/g, '');
    var num = parseFloat(cleaned);
    return isFinite(num) ? roundMoney(num) : 0;
  }

  function roundMoney(n: number): number {
    return Math.round((isFinite(n) ? n : 0) * 100) / 100;
  }

  function safeJson(raw: any): any {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(String(raw)); } catch (_e) { return null; }
  }

  function toErrorMessage(err: any, fallback: string): string {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    return err.message || err.error || fallback;
  }

  function toString(v: any, fallback: string): string {
    return v == null || v === '' ? fallback : String(v);
  }

  function toBool(v: any, fallback: boolean): boolean {
    if (v == null) return fallback;
    if (typeof v === 'boolean') return v;
    var s = String(v).toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
  }

  function toNumber(v: any, fallback: number): number {
    var n = coerceAmount(v);
    return isFinite(n) ? n : fallback;
  }

  function asProvider(v: any, fallback: PaymentProvider): PaymentProvider {
    var s = toString(v, fallback).toLowerCase();
    return s === 'stripe' || s === 'paypal' || s === 'both' ? (s as PaymentProvider) : fallback;
  }

  function asAmountMode(v: any, fallback: AmountMode): AmountMode {
    var s = toString(v, fallback).toLowerCase();
    return s === 'fixed' || s === 'field' || s === 'listentotals' ? (s === 'listentotals' ? 'listenTotals' : s as AmountMode) : fallback;
  }

  function escHtml(v: any): string {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escAttr(v: any): string { return escHtml(v); }
  function encodeAttr(v: string): string { return escAttr(v); }
  function cssEscape(v: any): string { return String(v == null ? '' : v).replace(/(["\\.#:\[\],=])/g, '\\$1'); }
  function forEachNode(nodes: NodeListOf<Element> | NodeList | ArrayLike<Element>, fn: Function): void {
    Array.prototype.forEach.call(nodes, fn);
  }

  function registerPlugin(): void {
    var widgets = getWidgets();
    if (!widgets || typeof widgets.register !== 'function') {
      window.setTimeout(registerPlugin, 50);
      return;
    }
    widgets.register('Payment', {
      render: render,
      bind: bind,
      collect: collect,
      validate: validate,
      defaults: defaults(),
      renderProperties: renderProperties,
      meta: { icon: 'fa-credit-card', label: 'Payment • ' + BADGE, category: 'payment', color: '#4f46e5', canonical: true }
    });
  }

  registerPlugin();
})();
