namespace MegaFormRendererValidationExtra {
  function firstDefined(...args: any[]): any {
    for (var i = 0; i < args.length; i++) {
      if (args[i] !== undefined && args[i] !== null) return args[i];
    }
    return undefined;
  }

  export function getValidationConfig(field: any): any {
    var validation = (field && field.validation) || (field && field.Validation) || {};
    var props = (field && (field.properties || field.Properties)) || {};
    return {
      min: firstDefined(validation.min, validation.Min, props.min, props.Min),
      max: firstDefined(validation.max, validation.Max, props.max, props.Max),
      minLength: firstDefined(validation.minLength, validation.MinLength, props.minLength, props.MinLength),
      maxLength: firstDefined(validation.maxLength, validation.MaxLength, props.maxLength, props.MaxLength),
      pattern: firstDefined(validation.pattern, validation.Pattern, props.pattern, props.Pattern),
      customMessage: firstDefined(validation.customMessage, validation.CustomMessage, props.customMessage, props.CustomMessage)
    };
  }

  export function validateField(field: any, val: any): string | null {
    var v: any = getValidationConfig(field);
    var hasValue = !(val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0));

    if (field.required && !hasValue) {
      return v.customMessage || ((field.label || field.key || 'Field') + ' is required');
    }

    if (!hasValue) return null;

    if (field.type === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) {
      return 'Please enter a valid email address';
    }

    if (field.type === 'Url' && !/^https?:\/\/.+/.test(String(val))) {
      return 'Please enter a valid URL starting with http:// or https://';
    }

    if (field.type === 'Number') {
      var numVal = parseFloat(String(val));
      if (!isNaN(numVal)) {
        if (v.min != null && numVal < Number(v.min)) return v.customMessage || ('Minimum value is ' + v.min);
        if (v.max != null && numVal > Number(v.max)) return v.customMessage || ('Maximum value is ' + v.max);
      }
    }

    if (v.minLength != null && String(val).length < Number(v.minLength)) {
      return v.customMessage || ('Minimum ' + v.minLength + ' characters');
    }

    if (v.maxLength != null && String(val).length > Number(v.maxLength)) {
      return v.customMessage || ('Maximum ' + v.maxLength + ' characters');
    }

    if (v.pattern && val) {
      try {
        if (!new RegExp(String(v.pattern)).test(String(val))) return v.customMessage || 'Invalid format';
      } catch (_) { }
    }

    return null;
  }
}
