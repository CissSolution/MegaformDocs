import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// All 19 composite presets (from the inventory). preset-only → renderer fills default parts.
const presets = [
  ['phone', 'Phone Number'],
  ['name', 'Full Name'],
  ['name_plus', 'Name (with prefix/suffix)'],
  ['address', 'Mailing Address', { addressScheme: 'us' }],
  ['ssn', 'SSN'],
  ['dob', 'Date of Birth'],
  ['time', 'Preferred Time'],
  ['email_confirm', 'Email + Confirm'],
  ['password_confirm', 'Password + Confirm'],
  ['date_range', 'Stay Date Range'],
  ['money', 'Budget Amount'],
  ['measurement', 'Height Measurement'],
  ['price_range', 'Price Range'],
  ['full_contact', 'Contact Block'],
  ['text', 'Short Text'],
  ['textarea', 'Long Text'],
  ['email', 'Email'],
  ['number', 'Number'],
  ['url', 'Website URL'],
];

const fields = presets.map(([preset, label, extra]) => ({
  key: 'c_' + preset,
  type: 'Composite',
  label,
  required: false,
  widgetProps: Object.assign({ preset }, extra || {}),
}));

const schema = { fields };
const schemaJson = JSON.stringify(schema);
const settingsJson = JSON.stringify({ theme: 'default' });

// Escape single quotes for SQL string literal
const esc = s => s.replace(/'/g, "''");
const sql = `SET NOCOUNT ON;
INSERT INTO MF_Forms (ModuleId,PortalId,Title,Description,SchemaJson,SettingsJson,ThemeJson,Status,SubmitButtonText,SuccessMessage,RedirectUrl,RequireAuth,EnableCaptcha,EnableSaveResume,WebhookUrl,WebhookSecret,WebhookHeaders,NotifyEmails,NotifyTemplate,AutoresponderEnabled,AutoresponderEmailField,AutoresponderSubject,AutoresponderBody,CreatedByUserId,CreatedOnUtc,AppScope,RulesJson,WorkflowJson)
VALUES (1828,1,N'QA All Composite Fields',N'Every composite widget for data-entry QA',N'${esc(schemaJson)}',N'${esc(settingsJson)}',N'',N'Published',N'Submit',N'Saved!',N'',0,0,0,N'',N'',N'',N'',N'',0,N'',N'',N'',1,SYSUTCDATETIME(),N'',N'[]',N'');
SELECT SCOPE_IDENTITY() AS NewFormId;
`;
writeFileSync(join('mfqa', 'composite_form.sql'), sql, 'utf8');
console.log('fields:', fields.length);
console.log('schema bytes:', schemaJson.length);
console.log('wrote mfqa/composite_form.sql');
