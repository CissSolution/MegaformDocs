export interface CssMatchInfo {
  selectors: string[];
  vars: string[];
}

export function stripDesignerGeneratedBlocks(cssText: string): string {
  return String(cssText || '')
    .replace(/\/\*\s*TDSaveCssStable v[\d-]+:(vars|layout|inspector):start\s*\*\/[\s\S]*?\/\*\s*TDSaveCssStable v[\d-]+:\1:end\s*\*\//g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractDesignerBlock(cssText: string, kind: 'vars' | 'layout' | 'inspector'): string {
  const css = String(cssText || '');
  const regex = new RegExp(String.raw`/\*\s*TDSaveCssStable v[\d-]+:${kind}:start\s*\*/([\s\S]*?)/\*\s*TDSaveCssStable v[\d-]+:${kind}:end\s*\*/`, 'i');
  const match = css.match(regex);
  return match && match[1] ? match[1].trim() : '';
}

export function collectCssMatches(cssText: string, el: Element): CssMatchInfo {
  const selectors: string[] = [];
  const vars = new Set<string>();
  const css = String(cssText || '').trim();
  if (!css) return { selectors, vars: [] };

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  try {
    const sheet = style.sheet as CSSStyleSheet | null;
    if (!sheet) return { selectors, vars: [] };
    walkRules(sheet.cssRules, el, selectors, vars, '');
  } catch {
    // no-op
  } finally {
    style.remove();
  }

  return { selectors, vars: Array.from(vars) };
}

function walkRules(rules: CSSRuleList | undefined, el: Element, selectors: string[], vars: Set<string>, scope: string): void {
  if (!rules) return;
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    if (!rule) continue;
    if (rule.type === CSSRule.STYLE_RULE) {
      const styleRule = rule as CSSStyleRule;
      const selectorText = String(styleRule.selectorText || '').trim();
      if (!selectorText) continue;
      const selectorParts = selectorText.split(',').map((part) => part.trim()).filter(Boolean);
      const matchedParts = selectorParts.filter((part) => {
        try {
          return !!part && typeof el.matches === 'function' && el.matches(part);
        } catch {
          return false;
        }
      });
      if (!matchedParts.length) continue;
      const prefix = scope ? `${scope} :: ` : '';
      matchedParts.forEach((part) => {
        const line = `${prefix}${part}`;
        if (!selectors.includes(line)) selectors.push(line);
      });
      for (let propIndex = 0; propIndex < styleRule.style.length; propIndex += 1) {
        const prop = styleRule.style[propIndex];
        const value = styleRule.style.getPropertyValue(prop);
        const matches = String(value || '').match(/var\((--[\w-]+)/g) || [];
        matches.forEach((raw) => {
          const varName = raw.replace(/^var\(/, '').trim();
          if (varName) vars.add(varName);
        });
      }
      continue;
    }

    const nestedRule = rule as CSSMediaRule & CSSSupportsRule;
    const nestedRules = 'cssRules' in nestedRule ? nestedRule.cssRules : undefined;
    if (!nestedRules || !nestedRules.length) continue;
    let nextScope = scope;
    if (rule.type === CSSRule.MEDIA_RULE && nestedRule.conditionText) {
      nextScope = `@media ${nestedRule.conditionText}`;
    } else if (rule.type === CSSRule.SUPPORTS_RULE && nestedRule.conditionText) {
      nextScope = `@supports ${nestedRule.conditionText}`;
    } else if (rule.cssText.includes('{')) {
      nextScope = rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
    }
    walkRules(nestedRules, el, selectors, vars, nextScope);
  }
}
