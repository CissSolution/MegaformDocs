const t = require('../Samples/FormTemplates/Premium/down-under-australia.json');
const c = t.customCss || '';
function rule(sel) {
  const i = c.indexOf(sel + '{') >= 0 ? c.indexOf(sel + '{') : c.indexOf(sel + ' {');
  if (i < 0) { console.log(sel + ' : (not found exact)'); return; }
  const end = c.indexOf('}', i);
  console.log(c.slice(i, end + 1).replace(/\s+/g, ' '));
}
console.log('--- root ---');
console.log((c.match(/\.mfp\.mfp-australia\s*\{[^}]*\}/) || ['(none)'])[0].replace(/\s+/g, ' ').slice(0, 360));
console.log('--- .au-body ---');
console.log((c.match(/\.au-body\s*\{[^}]*\}/) || ['(none)'])[0].replace(/\s+/g, ' '));
console.log('--- .au-head ---');
console.log((c.match(/\.au-head\s*\{[^}]*\}/) || ['(none)'])[0].replace(/\s+/g, ' '));
console.log('--- rules with border-radius or box-shadow on australia root ---');
(c.match(/[^{}]*mfp-australia[^{}]*\{[^}]*\}/g) || []).filter(r => /border-radius|box-shadow/.test(r)).slice(0, 4).forEach(r => console.log(r.replace(/\s+/g, ' ').slice(0, 220)));
console.log('--- does .au-body or .au-page set background? ---');
(c.match(/\.au-(body|page)[^{]*\{[^}]*\}/g) || []).slice(0, 4).forEach(r => console.log(r.replace(/\s+/g, ' ').slice(0, 200)));
