// Google Sheets E2E Helper — create spreadsheet + get access token via Service Account JWT
import { readFileSync } from 'fs';
import { createSign } from 'crypto';

const SA_PATH = process.env.SA_JSON || 'C:/Users/Administrator/Downloads/gen-lang-client-0935545035-48a7bfa1cbf4.json';

function loadSa() {
  return JSON.parse(readFileSync(SA_PATH, 'utf8'));
}

function base64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
}

function makeJwt(sa) {
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg:'RS256', typ:'JWT' })));
  const now = Math.floor(Date.now()/1000);
  const claim = base64UrlEncode(Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })));
  const signInput = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signInput);
  const sig = base64UrlEncode(signer.sign(sa.private_key));
  return `${signInput}.${sig}`;
}

async function getAccessToken(sa) {
  const jwt = makeJwt(sa);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion:jwt })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Token error: ${JSON.stringify(d)}`);
  return d.access_token;
}

async function createSpreadsheet(token, title) {
  const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ properties:{ title } })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Create sheet error: ${JSON.stringify(d)}`);
  return d.spreadsheetId;
}

async function appendRow(token, spreadsheetId, range, values) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ range, majorDimension:'ROWS', values: [values] })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Append error: ${JSON.stringify(d)}`);
  return d;
}

async function getValues(token, spreadsheetId, range) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`, {
    headers: { 'Authorization':`Bearer ${token}` }
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Get values error: ${JSON.stringify(d)}`);
  return d.values || [];
}

async function main() {
  const cmd = process.argv[2];
  const sa = loadSa();
  const token = await getAccessToken(sa);

  if (cmd === 'create') {
    const title = process.argv[3] || 'MegaForm E2E Test';
    const id = await createSpreadsheet(token, title);
    console.log(id);
    return;
  }

  if (cmd === 'append') {
    const spreadsheetId = process.argv[3];
    const range = process.argv[4] || 'Sheet1!A:Z';
    const values = JSON.parse(process.argv[5] || '[]');
    const res = await appendRow(token, spreadsheetId, range, values);
    console.log(JSON.stringify(res));
    return;
  }

  if (cmd === 'get') {
    const spreadsheetId = process.argv[3];
    const range = process.argv[4] || 'Sheet1!A:Z';
    const values = await getValues(token, spreadsheetId, range);
    console.log(JSON.stringify(values));
    return;
  }

  console.error('Usage: node gs-e2e-helper.mjs <create|append|get> [args...]');
  process.exit(1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
