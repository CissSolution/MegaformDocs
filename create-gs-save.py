import json
with open('/tmp/sa.json','r',encoding='utf-8') as f:
    sa = json.load(f)
json_str = json.dumps(sa, ensure_ascii=False)
escaped = json_str.replace('\\','\\\\').replace("'","\\'").replace('\n','\\n')
code = f"""(async (page) => {{
  const saJson = '{escaped}';
  const result = await page.evaluate(async (json) => {{
    const ta = Array.from(document.querySelectorAll('textarea.mf-input')).find(el => el.placeholder.includes('key is saved'));
    if (ta) {{ ta.value = json; ta.dispatchEvent(new Event('input', {{ bubbles: true }})); ta.dispatchEvent(new Event('change', {{ bubbles: true }})); }}
    const r = await fetch('/api/MegaForm/ModuleConfig/GoogleSheetsSettings', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json' }},
      body: JSON.stringify({{ serviceAccountJson: json, defaultSpreadsheetId: '', defaultRange: 'Sheet1!A:Z' }})
    }});
    return {{ status: r.status, body: await r.json() }};
  }}, saJson);
  return result;
}})
"""
with open('gs-save.js','w',encoding='utf-8') as f:
    f.write(code)
print('file created')
