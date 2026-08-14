const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const mock = 'E:\\DNNDEFENDER AND AI DESIGNES\\AI DESIGNES\\form-builder-controls (11)';
const outDir = path.join(repo, 'Samples', 'FormTemplates', 'Premium');
const kbDir = path.join(outDir, '_kb');
const packageDir = path.join(repo, 'dist', 'premium-mock11-live-package');
const dnnImgDir = path.join(repo, 'DesktopModules', 'MegaForm', 'Assets', 'img', 'mock');
const oqImgDir = path.join(repo, 'MegaForm.Oqtane.Server', 'wwwroot', 'Modules', 'MegaForm', 'img', 'mock');

const imageNames = [
  'agency-flyer-hero.png',
  'rose-wellness-hero.png',
  'australia-hero.png',
  'dance-hero.png',
  'volunteer-hero.png',
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyImages() {
  ensureDir(dnnImgDir);
  ensureDir(oqImgDir);
  for (const name of imageNames) {
    const src = path.join(mock, 'public', 'images', name);
    fs.copyFileSync(src, path.join(dnnImgDir, name));
    fs.copyFileSync(src, path.join(oqImgDir, name));
  }
}

function field(key, type, label, extra = {}) {
  const f = { key, type, label, ...extra };
  if (extra.required) f.required = true;
  return f;
}

function text(key, label, placeholder, required = false) {
  return field(key, 'Text', label, { placeholder, required });
}

function email(key, label, placeholder, required = false) {
  return field(key, 'Email', label, { placeholder, required });
}

function textarea(key, label, placeholder, required = false) {
  return field(key, 'Textarea', label, { placeholder, required });
}

function select(key, label, placeholder, options, required = false) {
  return field(key, 'Select', label, { placeholder, required, options: options.map(opt) });
}

function date(key, label, required = false) {
  return field(key, 'Date', label, { required });
}

function phone(key, label, placeholder = '+1 (555) 000-0000', required = false) {
  return field(key, 'Phone', label, { placeholder, required });
}

function opt(label, value, extra = {}) {
  return { value: value || slug(label), label, ...extra };
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'option';
}

function cards(key, label, options, required = false, columns = 1) {
  return field(key, 'Cards', label, {
    required,
    options,
    optionDisplay: 'cards',
    optionColumns: columns,
    allowOptionHtml: false,
    properties: { optionDisplay: 'cards', optionColumns: columns },
    Properties: { optionDisplay: 'cards', optionColumns: columns },
  });
}

function chips(key, label, options, required = false, columns = 4) {
  return field(key, 'Chips', label, {
    required,
    options,
    optionDisplay: 'chips',
    optionColumns: columns,
    properties: { optionDisplay: 'chips', optionColumns: columns },
    Properties: { optionDisplay: 'chips', optionColumns: columns },
  });
}

function radio(key, label, options, required = false, columns = 2) {
  return field(key, 'Radio', label, {
    required,
    options,
    optionColumns: columns,
    properties: { optionColumns: columns },
    Properties: { optionColumns: columns },
  });
}

function checkbox(key, label, options, required = false) {
  return field(key, 'Checkbox', label, { required, options });
}

function dataGrid(key, label, columns, extra = {}) {
  return field(key, 'DataGrid', label, {
    defaultValue: extra.defaultValue || '',
    widgetProps: {
      editMode: extra.editMode || 'inline',
      displayTemplate: 'grid',
      allowAdd: extra.allowAdd !== false,
      allowDelete: extra.allowDelete !== false,
      stickyHeader: false,
      rowHeight: extra.rowHeight || 'compact',
      minRows: extra.minRows || 0,
      maxRows: extra.maxRows || 0,
      emptyMessage: extra.emptyMessage || 'No rows yet. Click + Add row.',
      columns,
    },
  });
}

const baseFieldCss = `
.mfp-mock11.mfp-mock11{position:relative!important;left:50%!important;right:50%!important;width:100vw!important;max-width:100vw!important;margin-left:-50vw!important;margin-right:-50vw!important}
.mfp-mock11 .mf-field-group{margin:0!important;min-width:0!important;width:100%!important}
.mfp-mock11 .mf-field-label{display:none!important}
.mfp-mock11 label{line-height:1.2!important}
.mfp-mock11 input[type='text'],.mfp-mock11 input[type='email'],.mfp-mock11 input[type='tel'],.mfp-mock11 input[type='number'],.mfp-mock11 input[type='date'],.mfp-mock11 select,.mfp-mock11 textarea,.mfp-mock11 .mf-input,.mfp-mock11 .mf-select,.mfp-mock11 .mf-textarea{box-sizing:border-box!important;width:100%!important;max-width:none!important;margin:0!important;box-shadow:none!important;outline:0!important;line-height:1.2!important}
.mfp-mock11 .mf-option-group{flex-direction:row!important}
.mfp-mock11 .mf-field-error:empty{display:none!important}
.mfp-mock11 button[type='submit']{appearance:none;-webkit-appearance:none;cursor:pointer}
`;

function specialInsurance() {
  const fields = [
    text('insured_name', "Proposed insured's name", 'Please use capital letters', true),
    date('birth_date', 'Birth date', true),
    text('address', 'Address', 'Street, city, state'),
    phone('phone_number', 'Phone number'),
    email('email_address', 'Email address', 'name@example.com', true),
    text('id_number', 'ID number', 'Policyholder ID'),
    text('occupation', 'Occupation', 'Occupation'),
    radio('gender', 'Gender', [opt('Male', 'male'), opt('Female', 'female')], false, 2),
    radio('status', 'Status', [opt('Single'), opt('Married'), opt('Divorced'), opt('Others')], false, 4),
    cards('coverage_type', 'Type of Health Coverage', [
      opt('Employee', 'employee', { icon: 'briefcase', description: 'Primary applicant coverage.' }),
      opt('Spouse', 'spouse', { icon: 'heart', description: 'Coverage for spouse or partner.' }),
      opt('Children', 'children', { icon: 'users', description: 'Coverage for eligible dependents.' }),
    ], true, 3),
    dataGrid('dependents', 'Dependents proposed for coverage', [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Dependent name', width: 'minmax(160px,1.25fr)' },
      { key: 'ssn', label: 'SSN No.', type: 'text', placeholder: '000-00-0000', width: 'minmax(130px,1fr)' },
      { key: 'relationship', label: 'Relationship', type: 'text', placeholder: 'Child / spouse', width: 'minmax(130px,1fr)' },
      { key: 'birth_date', label: 'Birth Date', type: 'date', width: 'minmax(130px,1fr)' },
      { key: 'age', label: 'Age', type: 'number', decimals: 0, width: 'minmax(56px,.55fr)' },
      {
        key: 'sex',
        label: 'Sex',
        type: 'select',
        width: 'minmax(70px,.65fr)',
        options: [
          { label: 'Male', value: 'male' },
          { label: 'Female', value: 'female' },
          { label: 'Other', value: 'other' },
        ],
      },
    ], {
      maxRows: 8,
      emptyMessage: 'Add dependents covered by this policy.',
      defaultValue: JSON.stringify([
        { name: '', ssn: '', relationship: '', birth_date: '', age: '', sex: '' },
        { name: '', ssn: '', relationship: '', birth_date: '', age: '', sex: '' },
        { name: '', ssn: '', relationship: '', birth_date: '', age: '', sex: '' },
      ]),
    }),
    text('annual_premium', 'Annual premium', '$0.00'),
    text('units', 'Units', '0'),
    radio('payment_mode', 'Payment mode', [opt('Annual'), opt('Semi-Annual'), opt('Monthly PAT')], false, 3),
    text('cash_application', 'Cash with application', '$0.00'),
    text('signature', 'Signature', 'Type full legal name', true),
  ];
  const html = `
<div class="mfp-mock11 mfp-insurance-enrollment">
  <article class="ie-card">
    <header class="ie-head">
      <a class="ie-back" href="/">&larr; Back to forms</a>
      <div class="ie-head-row">
        <div><p class="ie-brand">Secure Life</p><h1>Insurance Enrollment</h1><p class="ie-sub">Individual policy application / Page 1 of 1</p></div>
        <div class="ie-seal"><i class="fa-solid fa-shield-halved"></i></div>
      </div>
    </header>
    <section class="ie-body">
      <div class="ie-section"><h2>A. General Questions</h2><div class="ie-grid">
        <label><span>Proposed insured's name *</span>{{field:insured_name}}</label>
        <label><span>Birth date *</span>{{field:birth_date}}</label>
        <label class="ie-span"><span>Address</span>{{field:address}}</label>
        <label><span>Phone number</span>{{field:phone_number}}</label>
        <label><span>Email address *</span>{{field:email_address}}</label>
        <label><span>ID number</span>{{field:id_number}}</label>
        <label><span>Occupation</span>{{field:occupation}}</label>
        <label><span>Gender</span>{{field:gender}}</label>
        <label><span>Status</span>{{field:status}}</label>
      </div></div>
      <div class="ie-section"><h2>B. Type of Health Coverage</h2><label class="ie-full">{{field:coverage_type}}</label>
        <p class="ie-table-title">Dependents proposed for coverage</p>
        <div class="ie-dependents">{{field:dependents}}</div>
      </div>
      <div class="ie-section"><h2>C. Policy / Payment / Signature</h2><div class="ie-grid">
        <label><span>Annual premium</span>{{field:annual_premium}}</label>
        <label><span>Units</span>{{field:units}}</label>
        <label class="ie-span"><span>Payment mode</span>{{field:payment_mode}}</label>
        <label><span>Cash with application</span>{{field:cash_application}}</label>
        <label><span>Signature *</span>{{field:signature}}</label>
      </div><p class="ie-terms">Terms &amp; Conditions: I certify the answers are true and complete to the best of my knowledge.</p></div>
      <button type="submit" class="ie-submit">Submit application</button>
    </section>
  </article>
</div>`;
  const css = `@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css');
${baseFieldCss}
.mfp-insurance-enrollment{background:#e6f1f9!important;color:#263e4c!important;font-family:Inter,Geist,system-ui,sans-serif!important;width:100%!important;max-width:none!important;margin:0 auto!important;padding:24px 0 32px!important}
.mfp-insurance-enrollment *{box-sizing:border-box}
.mfp-insurance-enrollment .ie-card{width:min(100%,1024px);margin:0 auto;background:#fff;border-radius:0;box-shadow:0 24px 70px rgba(32,52,67,.18);overflow:hidden}
.mfp-insurance-enrollment .ie-head{background:#e6f1f9;border-bottom:8px solid #1b668a;padding:20px 24px 18px}
.mfp-insurance-enrollment .ie-back{display:inline-block;margin-bottom:16px;color:#285b70;text-decoration:none;font-size:12px;font-weight:700}
.mfp-insurance-enrollment .ie-head-row{display:flex;align-items:center;justify-content:space-between;gap:24px}
.mfp-insurance-enrollment .ie-brand{margin:0 0 6px!important;text-transform:uppercase;letter-spacing:.18em!important;font-size:11px!important;line-height:16.5px!important;font-weight:700!important;color:#164f73!important}
.mfp-insurance-enrollment h1{margin:0!important;color:#16476b!important;font-size:30px!important;line-height:36px!important;font-weight:700!important;letter-spacing:0!important;font-family:Inter,Geist,system-ui,sans-serif!important}
.mfp-insurance-enrollment .ie-sub{margin:8px 0 0!important;color:#486b7d!important;font-size:14px!important;line-height:20px!important;font-weight:400!important}
.mfp-insurance-enrollment .ie-seal{display:grid;place-items:center;width:58px;height:58px;border-radius:999px;background:#d7e8f1;color:#164f73;font-size:27px}
.mfp-insurance-enrollment .ie-body{padding:22px 32px 32px;font-size:11px;color:#263e4c}
.mfp-insurance-enrollment .ie-section{margin:0 0 24px}
.mfp-insurance-enrollment .ie-section h2{margin:0 0 12px!important;background:#6d91a9;color:#fff!important;padding:7px 12px;font-size:14px!important;line-height:20px!important;font-weight:700!important}
.mfp-insurance-enrollment .ie-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 18px}
.mfp-insurance-enrollment .ie-span{grid-column:1/-1}
.mfp-insurance-enrollment .ie-grid>label>span,.mfp-insurance-enrollment .ie-full>span{display:block;margin:0 0 5px;color:#526f84;font-size:11px;font-weight:400;line-height:16.5px}
.mfp-insurance-enrollment input,.mfp-insurance-enrollment select,.mfp-insurance-enrollment textarea,.mfp-insurance-enrollment .mf-input,.mfp-insurance-enrollment .mf-select{height:34px!important;border:0!important;border-bottom:1px solid #7895a5!important;border-radius:0!important;background:#f7fbfd!important;color:#263e4c!important;padding:6px 8px!important;font:400 11px/16.5px Inter,Geist,system-ui,sans-serif!important}
.mfp-insurance-enrollment ::placeholder{color:#8da3af!important;opacity:1}
.mfp-insurance-enrollment .mf-option-group{display:flex!important;flex-wrap:wrap!important;gap:10px!important;margin:0!important}
.mfp-insurance-enrollment .mf-option-item{display:flex!important;align-items:center!important;gap:7px!important;width:auto!important;flex:0 0 auto!important;margin:0!important;font-size:12px!important;color:#263e4c!important}
.mfp-insurance-enrollment .mf-option-control{width:14px!important;height:14px!important;min-height:14px!important;margin:0!important;accent-color:#0c9fe3}
.mfp-insurance-enrollment .mf-option-group--cards{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important}
.mfp-insurance-enrollment .mf-option-group--cards .mf-option-control{position:absolute!important;opacity:0!important}
.mfp-insurance-enrollment .mf-option-group--cards .mf-option-ui{display:flex!important;align-items:flex-start!important;gap:10px!important;min-height:78px!important;border:2px solid #b5d9e9!important;border-radius:6px!important;background:#fff!important;padding:12px!important;color:#263e4c!important}
.mfp-insurance-enrollment .mf-option-group--cards .mf-option-control:checked+.mf-option-ui{border-color:#0c9fe3!important;background:#eaf8ff!important}
.mfp-insurance-enrollment .mf-option-icon{display:grid!important;place-items:center!important;width:30px!important;height:30px!important;border-radius:8px!important;background:#dff0f8!important;color:#164f73!important}
.mfp-insurance-enrollment .mf-option-label{font-size:13px!important;font-weight:800!important;color:#263e4c!important}
.mfp-insurance-enrollment .mf-option-desc{display:block!important;margin-top:3px!important;font-size:11px!important;line-height:15px!important;color:#5c7180!important}
.mfp-insurance-enrollment .mf-option-check,.mfp-insurance-enrollment .mf-option-badge{display:none!important}
.mfp-insurance-enrollment .ie-table-title{margin:18px 0 8px!important;font-size:11px!important;line-height:16.5px!important;font-weight:700!important;text-transform:uppercase;letter-spacing:.06em!important;color:#263e4c!important}
.mfp-insurance-enrollment .ie-dependents .mf-field-group{margin:0!important}
.mfp-insurance-enrollment .ie-dependents .mf-field-label{display:none!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid{border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important;margin:0!important;max-height:none!important;font-family:Inter,Geist,system-ui,sans-serif!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-toolbar{display:flex!important;justify-content:flex-end!important;align-items:center!important;position:static!important;padding:0 0 6px!important;border:0!important;background:transparent!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-title{display:none!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-add{height:24px!important;padding:0 9px!important;border:1px solid #0c9fe3!important;border-radius:4px!important;background:#eaf8ff!important;color:#164f73!important;font:700 11px/22px Inter,Geist,system-ui,sans-serif!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-grid{display:grid!important;border-left:1px solid #0c9fe3!important;border-top:1px solid #0c9fe3!important;width:100%!important;overflow:visible!important;background:#fff!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-head{display:contents!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-cell{min-width:0!important;min-height:32px!important;padding:4px 6px!important;border-right:1px solid #b5d9e9!important;border-bottom:1px solid #b5d9e9!important;background:#fff!important;font:400 11px/16.5px Inter,Geist,system-ui,sans-serif!important;color:#263e4c!important;overflow:hidden!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-head .mfw-dgrid-cell{position:static!important;top:auto!important;z-index:auto!important;min-height:32px!important;padding:7px!important;background:#eaf8ff!important;color:#164f73!important;font:400 11px/16.5px Inter,Geist,system-ui,sans-serif!important;text-transform:none!important;letter-spacing:0!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-input{width:100%!important;height:24px!important;min-height:24px!important;padding:2px 0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#263e4c!important;font:400 11px/16.5px Inter,Geist,system-ui,sans-serif!important;outline:0!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-input:focus{outline:1px solid #0c9fe3!important;outline-offset:0!important;background:#fff!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-input.is-number{text-align:left!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-del{width:24px!important;height:24px!important;padding:0!important;border:0!important;border-radius:4px!important;background:transparent!important;color:#6d91a9!important;font-size:14px!important;line-height:24px!important;opacity:.72!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-del:hover{background:#eaf8ff!important;color:#164f73!important;opacity:1!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-empty{grid-column:1/-1!important;min-height:32px!important;padding:8px!important;border-right:1px solid #b5d9e9!important;border-bottom:1px solid #b5d9e9!important;background:#fff!important;color:#6d91a9!important;font:400 11px/16.5px Inter,Geist,system-ui,sans-serif!important}
.mfp-insurance-enrollment .ie-dependents .mfw-dgrid-foot{display:none!important}
.mfp-insurance-enrollment .ie-terms{margin:16px 0 0!important;color:#486b7d!important;font-size:11px!important;line-height:17px!important;font-weight:400!important}
.mfp-insurance-enrollment .ie-submit{width:100%!important;min-height:44px!important;border:0!important;border-radius:0!important;background:#164f73!important;color:#fff!important;font-size:13px!important;font-weight:700!important}
@media(max-width:720px){.mfp-insurance-enrollment .ie-grid,.mfp-insurance-enrollment .mf-option-group--cards{grid-template-columns:1fr!important}.mfp-insurance-enrollment .ie-dependents{overflow-x:auto!important}.mfp-insurance-enrollment .ie-dependents .mfw-dgrid{min-width:780px!important}.mfp-insurance-enrollment .ie-body{padding:18px}.mfp-insurance-enrollment h1{font-size:27px}}`;
  return makeTemplate('Insurance Enrollment', 'insurance-enrollment', 'A steel-blue insurance enrollment form with coverage options, dependent table, policy/payment and signature.', fields, html, css, 'Submit application', 'Enrollment received. Your secure policy application has been submitted.');
}

function specialEvent() {
  const fields = [
    text('full_name', 'Full Name', 'Jordan Bennett', true),
    date('date_of_birth', 'Date of Birth'),
    select('gender', 'Gender', 'Select...', ['Female', 'Male', 'Non-binary', 'Prefer not to say']),
    phone('phone_number', 'Phone Number'),
    email('email_address', 'Email', 'jordan@example.com', true),
    text('company', 'Company / Organization', 'Acme Studio'),
    radio('heard_from', 'Where did you hear about this event?', ['Facebook', 'YouTube', 'Instagram', 'Twitter', 'Other'].map(opt), false, 5),
    text('ticket_count', 'Number of Tickets', '1', true),
    radio('payment_method', 'Payment Method', ['Credit Card', 'Debit Card', 'Cash', 'Check'].map(opt), true, 4),
    text('signature', 'Signature', 'Type full legal name', true),
    date('date_signed', 'Date Signed'),
    checkbox('consent', 'Consent', [opt('I agree to the event terms and photography policy', 'yes')], true),
  ];
  const html = `
<div class="mfp-mock11 mfp-event-registration-premium">
  <article class="ev-card">
    <header class="ev-head"><a href="/" class="ev-back">&larr; Back to forms</a><h1>Event Registration Form</h1><p>Design Forward Summit / October 15, 2028</p></header>
    <section class="ev-body">
      <h2>About Event</h2>
      <table class="ev-table"><tbody><tr><th>Event Name</th><td>Design Forward Summit</td></tr><tr><th>Date</th><td>October 15, 2028</td></tr><tr><th>Venue</th><td>Grand Hall, 214 Harbor Avenue</td></tr></tbody></table>
      <div class="ev-icons"><span><i class="fa-solid fa-calendar-days"></i> Oct 15, 2028</span><span><i class="fa-solid fa-clock"></i> 9:00 AM - 5:00 PM</span><span><i class="fa-solid fa-location-dot"></i> Grand Hall</span></div>
      <div class="ev-section"><h2>Participant Information</h2><div class="ev-grid">
        <label><span>Full Name *</span>{{field:full_name}}</label><label><span>Date of Birth</span>{{field:date_of_birth}}</label><label><span>Gender</span>{{field:gender}}</label><label><span>Phone Number</span>{{field:phone_number}}</label><label><span>Email *</span>{{field:email_address}}</label><label><span>Company / Organization</span>{{field:company}}</label>
      </div><label class="ev-full"><span>Where did you hear about this event?</span>{{field:heard_from}}</label></div>
      <div class="ev-section"><h2>Payment and Consent</h2><div class="ev-grid"><label><span>Number of Tickets *</span>{{field:ticket_count}}</label><label><span>Payment Method *</span>{{field:payment_method}}</label><label><span>Signature *</span>{{field:signature}}</label><label><span>Date Signed</span>{{field:date_signed}}</label></div><div class="ev-consent">{{field:consent}}</div></div>
      <button class="ev-submit" type="submit"><i class="fa-solid fa-ticket"></i> Complete registration</button>
      <footer>Webinar Pros LLC / 555-0100 / events@example.com</footer>
    </section>
  </article>
</div>`;
  const css = `@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css');
${baseFieldCss}
.mfp-event-registration-premium{min-height:720px;background:#172b46!important;background-image:radial-gradient(circle at 1px 1px,#44617b 1px,transparent 0)!important;background-size:18px 18px!important;color:#172b46!important;font-family:Inter,Geist,system-ui,sans-serif!important;width:100%!important;max-width:none!important;padding:26px 0!important}
.mfp-event-registration-premium *{box-sizing:border-box}
.mfp-event-registration-premium .ev-card{width:min(100%,760px);margin:0 auto;background:#fff;box-shadow:0 28px 65px rgba(4,15,30,.28)}
.mfp-event-registration-premium .ev-head{padding:28px 40px 24px;border-bottom:1px solid #d2d9df}
.mfp-event-registration-premium .ev-back{display:inline-block;margin:0 0 22px;color:#52677c;font-size:12px;font-weight:700;text-decoration:none}
.mfp-event-registration-premium h1{margin:0!important;color:#263e57!important;font-size:36px!important;line-height:40px!important;font-weight:800!important;letter-spacing:-.025em!important;font-family:Inter,Geist,system-ui,sans-serif!important}
.mfp-event-registration-premium .ev-head p{margin:8px 0 0!important;color:#62758a!important;font-size:14px!important;line-height:20px!important;font-weight:400!important}
.mfp-event-registration-premium .ev-body{padding:28px 40px 34px}
.mfp-event-registration-premium h2{margin:0 0 14px!important;color:#183b5c!important;font-size:14px!important;line-height:20px!important;font-weight:700!important;text-transform:uppercase;letter-spacing:.12em}
.mfp-event-registration-premium .ev-table{width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #8998a7;font-size:13px}
.mfp-event-registration-premium .ev-table th{width:35%;background:#f3f5f6;color:#183b5c;text-align:left;font-weight:800}
.mfp-event-registration-premium .ev-table th,.mfp-event-registration-premium .ev-table td{border:1px solid #8998a7;padding:9px 10px}
.mfp-event-registration-premium .ev-icons{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 0 26px;color:#425a72;font-size:12px}
.mfp-event-registration-premium .ev-icons span{display:flex;gap:7px;align-items:center}.mfp-event-registration-premium .ev-icons i{color:#183b5c}
.mfp-event-registration-premium .ev-section{border-top:1px solid #d2d9df;padding-top:24px;margin-top:24px}
.mfp-event-registration-premium .ev-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px 18px}
.mfp-event-registration-premium .ev-grid>label>span,.mfp-event-registration-premium .ev-full>span{display:block;margin:0 0 6px;color:#183b5c;font-size:11px;font-weight:600;line-height:16px}
.mfp-event-registration-premium input,.mfp-event-registration-premium select,.mfp-event-registration-premium textarea,.mfp-event-registration-premium .mf-input,.mfp-event-registration-premium .mf-select{height:38px!important;border:1px solid #cbd5df!important;border-radius:2px!important;background:#fff!important;color:#10233a!important;padding:8px 10px!important;font:500 11px/16.5px Inter,Geist,system-ui,sans-serif!important}
.mfp-event-registration-premium .ev-full{display:block;margin-top:18px}
.mfp-event-registration-premium .mf-option-group{display:flex!important;flex-wrap:wrap!important;gap:12px 18px!important;margin:0!important}
.mfp-event-registration-premium .mf-option-item{display:flex!important;align-items:center!important;gap:7px!important;width:max-content!important;max-width:100%!important;flex:0 0 auto!important;margin:0!important;color:#183b5c!important;font-size:12px!important}
.mfp-event-registration-premium .mf-option-control{width:14px!important;height:14px!important;min-height:14px!important;margin:0!important;accent-color:#183b5c}
.mfp-event-registration-premium .ev-consent{margin-top:18px;padding:12px 0;color:#183b5c}
.mfp-event-registration-premium .ev-submit{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:9px!important;margin-top:22px!important;min-height:46px!important;width:100%!important;border:0!important;border-radius:2px!important;background:#183b5c!important;color:#fff!important;font-size:14px!important;font-weight:600!important;line-height:20px!important}
.mfp-event-registration-premium footer{margin-top:22px;padding-top:16px;border-top:1px solid #d2d9df;color:#60758a;font-size:12px;text-align:center}
@media(max-width:720px){.mfp-event-registration-premium{padding:12px}.mfp-event-registration-premium .ev-card{width:100%}.mfp-event-registration-premium .ev-head,.mfp-event-registration-premium .ev-body{padding:22px}.mfp-event-registration-premium .ev-grid,.mfp-event-registration-premium .ev-icons{grid-template-columns:1fr}.mfp-event-registration-premium h1{font-size:28px}}`;
  return makeTemplate('Event Registration Premium', 'event-registration-premium', 'A navy patterned premium event registration form with white card, event details table, participant information, payment and consent.', fields, html, css, 'Complete registration', 'Registration confirmed. Your event registration has been received.');
}

function specialDonation() {
  const fields = [
    text('donor_name', 'Name', 'Your full name', true),
    text('address', 'Address', 'Street, city, state', true),
    email('email_address', 'Email Address', 'you@example.com', true),
    phone('contact_number', 'Contact Number', '+1 (555) 000-0000', true),
    radio('donation_amount', 'Donation Amount', [
      opt('$20 - Support daily care for elderly person', '20'),
      opt('$50 - Provide health supplies', '50'),
      opt('$100 - Fund a month of caregiving', '100'),
      opt('Other', 'other'),
    ], true, 1),
    radio('payment_method', 'Payment Method', ['Credit/Debit Card', 'Paypal', 'Bank Transfer', 'Other'].map(opt), true, 2),
    radio('frequency', 'Donation Frequency', ['Once', 'Weekly', 'Monthly', 'Quarterly', 'Other'].map(opt), true, 5),
    textarea('comments', 'Additional comments', 'Leave a message for the care team.'),
  ];
  const html = `
<div class="mfp-mock11 mfp-elderly-care-donation">
  <article class="ed-card"><a class="ed-back" href="/">&larr; Back to forms</a><div class="ed-logo">Your<br>Logo<br>Here</div>
    <header><div class="ed-icon"><i class="fa-solid fa-hand-holding-heart"></i></div><h1>Elderly Care and Support Donation Form</h1><p>Your gift helps provide comfort, safety and daily support for seniors in our care.</p></header>
    <section class="ed-section"><h2>Donor Information</h2><div class="ed-grid"><label><span>Name *</span>{{field:donor_name}}</label><label><span>Address *</span>{{field:address}}</label><label><span>Email Address *</span>{{field:email_address}}</label><label><span>Contact Number *</span>{{field:contact_number}}</label></div></section>
    <section class="ed-section"><h2>Donation Details</h2><label><span>Donation Amount *</span>{{field:donation_amount}}</label><label><span>Payment Method *</span>{{field:payment_method}}</label><label><span>Donation Frequency *</span>{{field:frequency}}</label><label><span>Additional comments</span>{{field:comments}}</label></section>
    <button type="submit" class="ed-submit">Thank you for your compassion; your support enhances seniors' lives.</button>
  </article>
</div>`;
  const css = `@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css');
${baseFieldCss}
.mfp-elderly-care-donation{background:#f6f6fb!important;color:#171767!important;font-family:Inter,Geist,system-ui,sans-serif!important;width:100%!important;max-width:none!important;padding:28px 0!important}
.mfp-elderly-care-donation *{box-sizing:border-box}
.mfp-elderly-care-donation .ed-card{position:relative;width:min(100%,760px);margin:0 auto;background:#fff;border:1px solid #e4e4ee;padding:28px 40px 38px;box-shadow:0 24px 60px rgba(23,23,103,.09)}
.mfp-elderly-care-donation .ed-back{display:inline-block;margin-bottom:20px;color:#171767;text-decoration:none;font:700 12px Arial,Helvetica,sans-serif}
.mfp-elderly-care-donation .ed-logo{position:absolute;right:38px;top:34px;display:grid;place-items:center;width:82px;height:82px;border:1px solid #d3c7b7;border-radius:999px;background:#f5eee3;color:#7777a7;text-align:center;text-transform:uppercase;font:800 9px/12px Arial,Helvetica,sans-serif;letter-spacing:.08em}
.mfp-elderly-care-donation header{text-align:center;border-bottom:1px dashed #7777a7;padding:0 96px 22px;margin-bottom:24px}
.mfp-elderly-care-donation .ed-icon{display:grid;place-items:center;width:44px;height:44px;margin:0 auto 14px;border-radius:999px;background:#eeeeff;color:#171767;font-size:20px}
.mfp-elderly-care-donation h1{margin:0!important;color:#171767!important;font-size:30px!important;line-height:37.5px!important;font-weight:700!important;letter-spacing:0!important;font-family:Inter,Geist,system-ui,sans-serif!important}
.mfp-elderly-care-donation header p{margin:12px auto 0!important;padding-top:14px;border-top:1px dashed #7777a7;color:#171767!important;font-size:12px!important;line-height:16px!important;font-weight:400!important}
.mfp-elderly-care-donation .ed-section{border-bottom:1px dashed #7777a7;padding:0 0 22px;margin:0 0 24px}
.mfp-elderly-care-donation h2{margin:0 0 15px;color:#171767;font-size:15px;line-height:20px;font-weight:700}
.mfp-elderly-care-donation .ed-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px}
.mfp-elderly-care-donation label{display:block;margin:0 0 16px}
.mfp-elderly-care-donation .ed-grid>label>span,.mfp-elderly-care-donation .ed-section>label>span{display:block;margin:0 0 7px;color:#171767;font:400 12px/16px Inter,Geist,system-ui,sans-serif}
.mfp-elderly-care-donation input,.mfp-elderly-care-donation select,.mfp-elderly-care-donation textarea,.mfp-elderly-care-donation .mf-input,.mfp-elderly-care-donation .mf-select,.mfp-elderly-care-donation .mf-textarea{border:1px solid #dadaea!important;border-radius:0!important;background:#fff!important;color:#171767!important;padding:10px 12px!important;font:500 12px/16px Inter,Geist,system-ui,sans-serif!important}
.mfp-elderly-care-donation textarea,.mfp-elderly-care-donation .mf-textarea{min-height:104px!important}
.mfp-elderly-care-donation .mf-option-group{display:flex!important;flex-wrap:wrap!important;gap:10px 18px!important;margin:0!important}
.mfp-elderly-care-donation .mf-option-item{display:flex!important;align-items:flex-start!important;gap:8px!important;width:max-content!important;max-width:100%!important;flex:0 0 auto!important;margin:0!important;color:#171767!important;font:700 12px Inter,Geist,system-ui,sans-serif!important}
.mfp-elderly-care-donation .mf-option-group:not(.mf-option-group--cols){display:flex!important;flex-wrap:wrap!important;gap:9px 18px!important}
.mfp-elderly-care-donation .mf-option-control{width:15px!important;height:15px!important;min-height:15px!important;margin:1px 0 0!important;accent-color:#171767}
.mfp-elderly-care-donation .ed-submit{width:100%!important;min-height:50px!important;border:0!important;border-radius:0!important;background:#11116d!important;color:#fff!important;padding:12px 18px!important;font:600 12px/16px Inter,Geist,system-ui,sans-serif!important}
@media(max-width:720px){.mfp-elderly-care-donation{padding:12px}.mfp-elderly-care-donation .ed-card{padding:24px 20px}.mfp-elderly-care-donation header{padding-right:0;padding-left:0}.mfp-elderly-care-donation .ed-logo{position:static;margin:0 auto 16px}.mfp-elderly-care-donation .ed-grid{grid-template-columns:1fr}.mfp-elderly-care-donation h1{font-size:25px}}`;
  return makeTemplate('Elderly Care Donation', 'elderly-care-donation', 'A premium indigo donation form with dashed dividers, logo seal, donation amount, payment method and frequency.', fields, html, css, 'Send donation pledge', 'Thank you for caring. Your donation pledge has been received.');
}

const waveConfigs = [
  {
    slug: 'professional-application', title: 'Professional Application', eyebrow: 'Career studio', heading: 'Professional application',
    description: 'Present your experience with clarity and intention. We review every application personally.', brand: 'NORTH / WORK', accent: '#233b5d', soft: '#8aa4c7', hero: 'agency-flyer-hero.png', section: 'About your work',
    success: 'Thank you for sharing your profile. Our team will review your application and follow up soon.',
    fields: [
      text('full_name', 'Full name', 'Your name', true), email('email_address', 'Email address', 'you@example.com', true),
      select('role', 'Role', 'Choose a role', ['Designer', 'Engineer', 'Producer', 'Strategist']),
      text('portfolio_url', 'Portfolio URL', 'https://'), select('availability', 'Availability', 'Choose availability', ['Immediately', 'Within 1 month', 'Within 3 months']),
      select('experience_years', 'Years of experience', 'Choose range', ['1-3 years', '4-7 years', '8+ years']),
      textarea('work_note', 'A note about your work', 'What would you bring to the team?'),
    ],
  },
  {
    slug: 'healthcare-intake', title: 'Wellness Intake', eyebrow: 'Private care', heading: 'Wellness intake',
    description: 'A calm first step toward a more considered care plan, prepared around your needs.', brand: 'AURA HEALTH', accent: '#39736d', soft: '#98c8bf', hero: 'rose-wellness-hero.png', section: 'Your wellbeing',
    success: 'Your intake has been received securely. A care coordinator will contact you with the next steps.',
    fields: [
      text('full_name', 'Full name', 'Your name', true), email('email_address', 'Email address', 'you@example.com', true),
      date('date_of_birth', 'Date of birth'), select('preferred_appointment', 'Preferred appointment', 'Choose time', ['Morning', 'Afternoon', 'Evening']),
      select('primary_focus', 'Primary focus', 'Choose focus', ['Stress & sleep', 'Movement', 'Nutrition', 'General wellbeing']),
      text('emergency_contact', 'Emergency contact', 'Name and phone'),
      textarea('support_notes', 'What would you like support with?', 'Share only what feels useful...'),
    ],
  },
  {
    slug: 'travel-consultation', title: 'Travel Consultation', eyebrow: 'Journey planning', heading: 'Travel consultation',
    description: 'Tell us what you are imagining and we will shape a route with room for discovery.', brand: 'FIELD NOTES', accent: '#a65d3a', soft: '#e7b59a', hero: 'australia-hero.png', section: 'Your next journey',
    success: 'Your travel brief is with our studio. We will return with an initial route and a few thoughtful questions.',
    fields: [
      text('your_name', 'Your name', 'Your name', true), email('email_address', 'Email address', 'you@example.com', true),
      text('destination', 'Destination', 'Where would you like to go?'), text('travel_dates', 'Travel dates', 'Month or date range'),
      select('travel_style', 'Travel style', 'Choose style', ['Slow & local', 'Culture & food', 'Nature & adventure', 'Rest & retreat']),
      select('traveler_count', 'Number of travelers', 'Choose count', ['1', '2', '3-4', '5+']),
      textarea('trip_feeling', 'Describe the feeling you want', 'A few words about the trip...'),
    ],
  },
  {
    slug: 'creative-workshop', title: 'Creative Workshop Registration', eyebrow: 'Make something', heading: 'Workshop registration',
    description: 'A small, generous room for ideas. Reserve a place in our next hands-on creative session.', brand: 'STUDIO 09', accent: '#8b4c72', soft: '#dca9c5', hero: 'dance-hero.png', section: 'Your place in the room',
    success: 'You are on the list. We will send the workshop details, materials list and arrival notes by email.',
    fields: [
      text('full_name', 'Full name', 'Your name', true), email('email_address', 'Email address', 'you@example.com', true),
      select('workshop', 'Workshop', 'Choose workshop', ['Collage & composition', 'Movement lab', 'Writing through objects', 'Visual storytelling']),
      date('preferred_date', 'Preferred date'), select('experience_level', 'Experience level', 'Choose level', ['Curious beginner', 'Some experience', 'Practising regularly']),
      text('accessibility_needs', 'Accessibility needs', 'Optional'),
      textarea('hopes', 'What are you hoping to explore?', 'Tell us a little about your curiosity...'),
    ],
  },
  {
    slug: 'volunteer-profile', title: 'Volunteer Profile', eyebrow: 'Give your time', heading: 'Volunteer profile',
    description: 'Connect your strengths with a project that needs care, energy and a willing pair of hands.', brand: 'COMMON GROUND', accent: '#55754e', soft: '#afc9a6', hero: 'volunteer-hero.png', section: 'How you would like to help',
    success: 'Thank you for stepping forward. Our community team will match your profile with a suitable opportunity.',
    fields: [
      text('full_name', 'Full name', 'Your name', true), email('email_address', 'Email address', 'you@example.com', true),
      select('area_of_interest', 'Area of interest', 'Choose area', ['Community', 'Environment', 'Youth', 'Events']),
      select('preferred_day', 'Preferred day', 'Choose day', ['Weekdays', 'Weekends', 'Flexible']),
      select('time_commitment', 'Time commitment', 'Choose commitment', ['One-off', 'Monthly', 'Weekly']),
      text('relevant_skill', 'Relevant skill', 'Skill or experience'),
      textarea('motivation', 'Why would you like to volunteer?', 'A few words are plenty...'),
    ],
  },
];

function waveTemplate(cfg) {
  const rows = cfg.fields.map((f, idx) => {
    const full = f.type === 'Textarea';
    return `<label class="pw-field ${full ? 'pw-span' : ''}"><span>${f.label}${idx < 2 ? ' *' : ''}</span>{{field:${f.key}}}</label>`;
  }).join('\n        ');
  const html = `
<div class="mfp-mock11 mfp-premium-wave" style="--pw-accent:${cfg.accent};--pw-soft:${cfg.soft};--pw-hero:url('/DesktopModules/MegaForm/Assets/img/mock/${cfg.hero}')">
  <main class="pw-main">
    <section class="pw-shell">
      <aside class="pw-hero"><div class="pw-brand"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${cfg.brand}</span></div><div class="pw-hero-copy"><p>${cfg.eyebrow}</p><h1>${cfg.heading}</h1><span>${cfg.description}</span></div><div class="pw-wave"></div></aside>
      <section class="pw-form"><div class="pw-oval"></div><header><p>${cfg.eyebrow}</p><h2>${cfg.heading}</h2><span>${cfg.description}</span><b>01 / of 01</b></header>
        <div class="pw-section"><i></i><span>${cfg.section}</span><em></em></div>
        <div class="pw-grid">${rows}</div>
        <footer><span>Required fields are marked with an asterisk.<br>Your information stays private.</span><button type="submit">Continue <i class="fa-solid fa-arrow-right"></i></button></footer>
      </section>
    </section>
  </main>
</div>`;
  const css = `@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css');
${baseFieldCss}
.mfp-premium-wave{background:#f4f1ea!important;color:#0f172a!important;font-family:Inter,Geist,system-ui,sans-serif!important;width:100%!important;max-width:none!important;padding:32px 18px!important}
.mfp-premium-wave *{box-sizing:border-box}
.mfp-premium-wave .pw-main{min-height:720px;display:grid;place-items:center}
.mfp-premium-wave .pw-shell{display:grid;grid-template-columns:390px minmax(0,1fr);width:min(100%,1152px);min-height:680px;background:#fff;box-shadow:0 28px 80px rgba(15,23,42,.16);overflow:hidden}
.mfp-premium-wave .pw-hero{position:relative;min-height:680px;display:flex;flex-direction:column;justify-content:space-between;padding:40px;color:#fff;background-image:linear-gradient(180deg,rgba(15,23,42,.18),rgba(15,23,42,.62)),var(--pw-hero);background-position:center;background-size:cover;overflow:hidden}
.mfp-premium-wave .pw-brand{display:inline-flex;align-items:center;gap:9px;text-transform:uppercase;letter-spacing:.18em;font-size:11px;font-weight:800}
.mfp-premium-wave .pw-brand i{display:grid;place-items:center;width:28px;height:28px;border-radius:999px;background:rgba(255,255,255,.18);font-size:12px}
.mfp-premium-wave .pw-hero-copy{position:relative;z-index:2;margin-top:auto;margin-bottom:58px}
.mfp-premium-wave .pw-hero-copy p{margin:0 0 16px!important;text-transform:uppercase;letter-spacing:.24em!important;font-size:12px!important;font-weight:700!important;color:rgba(255,255,255,.7)!important;line-height:16px!important}
.mfp-premium-wave .pw-hero-copy h1{margin:0!important;color:#fff!important;font-family:ui-serif,Georgia,Cambria,'Times New Roman',Times,serif!important;font-size:48px!important;line-height:49.92px!important;font-weight:600!important;letter-spacing:0!important;text-wrap:balance}
.mfp-premium-wave .pw-hero-copy span{display:block;margin-top:20px;max-width:300px;color:rgba(255,255,255,.75)!important;font-size:15px!important;line-height:28px!important;font-weight:400!important}
.mfp-premium-wave .pw-wave{position:absolute;left:-70px;right:-70px;bottom:-92px;height:190px;background:#fff;clip-path:ellipse(70% 48% at 42% 100%)}
.mfp-premium-wave .pw-form{position:relative;padding:48px 64px;overflow:hidden;background:#fff}
.mfp-premium-wave .pw-oval{position:absolute;right:-110px;top:-96px;width:260px;height:260px;border-radius:999px;background:var(--pw-soft);opacity:.1}
.mfp-premium-wave .pw-form header{position:relative;border-bottom:1px solid #e2e8f0;padding-bottom:28px;margin-bottom:30px}
.mfp-premium-wave .pw-form header p{margin:0 0 8px!important;color:var(--pw-accent)!important;text-transform:uppercase;letter-spacing:.2em!important;font-size:12px!important;font-weight:700!important;line-height:16px!important}
.mfp-premium-wave .pw-form header h2{margin:0!important;color:#0f172a!important;font-family:ui-serif,Georgia,Cambria,'Times New Roman',Times,serif!important;font-size:48px!important;line-height:60px!important;font-weight:600!important;letter-spacing:0!important}
.mfp-premium-wave .pw-form header span{display:block;margin-top:12px;max-width:560px;color:#64748b!important;font-size:14px!important;line-height:24px!important;font-weight:400!important}
.mfp-premium-wave .pw-form header b{position:absolute;right:0;top:5px;color:#94a3b8;font-size:12px;letter-spacing:0;font-weight:400}
.mfp-premium-wave .pw-section{display:flex;align-items:center;gap:10px;margin:0 0 22px}
.mfp-premium-wave .pw-section i{width:9px;height:9px;border-radius:999px;background:var(--pw-accent)}
.mfp-premium-wave .pw-section span{color:#334155!important;text-transform:uppercase;letter-spacing:.16em!important;font-size:12px!important;font-weight:700!important;line-height:16px!important}
.mfp-premium-wave .pw-section em{height:1px;flex:1;background:#e2e8f0}
.mfp-premium-wave .pw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.mfp-premium-wave .pw-span{grid-column:1/-1}
.mfp-premium-wave .pw-field>span{display:block;margin:0 0 8px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:600;line-height:16px}
.mfp-premium-wave input,.mfp-premium-wave select,.mfp-premium-wave textarea,.mfp-premium-wave .mf-input,.mfp-premium-wave .mf-select,.mfp-premium-wave .mf-textarea{min-height:47px!important;border:1px solid #e2e8f0!important;border-radius:16px!important;background:#f8fafc!important;color:#0f172a!important;padding:12px 16px!important;font:400 14px/20px Inter,Geist,system-ui,sans-serif!important}
.mfp-premium-wave textarea,.mfp-premium-wave .mf-textarea{min-height:122px!important}
.mfp-premium-wave ::placeholder{color:#94a3b8!important;opacity:1}
.mfp-premium-wave footer{display:flex;align-items:center;justify-content:space-between;gap:18px;border-top:1px solid #e2e8f0;margin-top:30px;padding-top:26px}
.mfp-premium-wave footer span{color:#94a3b8!important;font-size:12px!important;line-height:20px!important;font-weight:400!important}
.mfp-premium-wave footer button{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:9px!important;border:0!important;border-radius:999px!important;background:var(--pw-accent)!important;color:#fff!important;min-height:48px!important;padding:0 24px!important;font-size:14px!important;font-weight:600!important;line-height:20px!important}
@media(max-width:900px){.mfp-premium-wave .pw-shell{grid-template-columns:1fr}.mfp-premium-wave .pw-hero{min-height:420px}.mfp-premium-wave .pw-form{padding:34px 28px}.mfp-premium-wave .pw-form header h2{font-size:40px;line-height:48px}}
@media(max-width:620px){.mfp-premium-wave{padding:12px}.mfp-premium-wave .pw-grid{grid-template-columns:1fr}.mfp-premium-wave .pw-form header b{position:static;display:block;margin-top:14px}.mfp-premium-wave footer{align-items:stretch;flex-direction:column}.mfp-premium-wave footer button{width:100%}.mfp-premium-wave .pw-hero-copy h1{font-size:42px}}`;
  return makeTemplate(cfg.title, cfg.slug, `${cfg.title} premium wave form converted from mock route /forms/${cfg.slug}.`, cfg.fields, html, css, 'Continue', cfg.success);
}

function makeTemplate(title, slugValue, description, fields, customHtml, customCss, submitButtonText, successMessage) {
  const settings = {
    theme: 'custom',
    customHtml,
    customCss,
    submitButtonText,
    successMessage,
    hideHeader: true,
    templateSlug: slugValue,
    postSubmitExperience: {
      mode: 'confirmation',
      title: 'Form received',
      message: successMessage,
      fillAgainLabel: 'Submit another',
      doneLabel: 'Done',
    },
    templateGuideSlug: `tpl-${slugValue}`,
  };
  return {
    title,
    slug: slugValue,
    description,
    category: 'Premium',
    theme: 'custom',
    fields,
    settings,
    submitButtonText,
    successMessage,
    customHtml,
    customCss,
  };
}

function kbMarkdown(t, sourceRoute, rootSelector, lockedAreas, editableAreas) {
  return `# ${t.title} - MegaForm AI Design Contract

Source mock route: ${sourceRoute}
Template slug: ${t.slug}
Root selector: \`${rootSelector}\`

## Non-negotiable design rail

- Preserve \`settings.customHtml\` structure and \`settings.customCss\` scope selectors.
- Do not replace \`${rootSelector}\`, wrapper class names, CSS variable names, hero image URLs, section containers, decorative/static table markup, dashed dividers, wave shape, or submit button class.
- Do not invent CSS, SVG, emoji icons, external image URLs, gradients, placeholder artwork, or FontAwesome names.
- CSS and icons are not creative output. They are locked assets copied from the mock and MegaForm catalog. AI may only reuse existing selectors, variables, image URLs, and icon names listed here.
- Row/table-like user inputs must stay native MegaForm widgets such as \`DataGrid\`; never replace editable rows with fake HTML tables or \`aria-hidden\` markup.
- Keep the full-bleed root rail: \`.mfp-mock11.mfp-mock11\` must remain \`width:100vw\` with negative 50vw margins so DNN/Oqtane host panes cannot compress the mock layout.
- Any AI edit must leave \`settings.templateGuideSlug\` pointing to \`tpl-${t.slug}\`.
- Rich choice controls must use MegaForm native \`Cards\` / \`Chips\` or \`optionDisplay:"cards|chips"\`.
- Option icons must come from MegaForm's mock rich-choice catalog only: ticket, shield, calendar-days, map-pin, clock, user, users, mail, phone, briefcase, file-text, wallet, home, compass, waves, mountain, heart-handshake, heart, flower2, party-popper, cake, utensils, wine, salad, pizza, ice-cream, palette, code, megaphone, music, camera, dumbbell, plane, crown, zap, star, sparkles, send, clipboard-list.
- AI may write labels, placeholders, option labels, descriptions, badges, validation, rules, and success copy. AI must not author new styling.

## Locked areas

${lockedAreas.map((x) => `- ${x}`).join('\n')}

## Editable areas

${editableAreas.map((x) => `- ${x}`).join('\n')}

## Safe edit recipe

1. Inspect the form first and confirm it is custom-shell mode with \`${rootSelector}\`.
2. For copy or business changes, update \`fields[].label\`, \`fields[].placeholder\`, \`fields[].options[].label\`, \`fields[].options[].description\`, \`settings.successMessage\`, and validation/rules only.
3. For choices with 6 or fewer options, keep single choice as \`Cards\`; keep multi-select tags/interests/preferences as \`Chips\`.
4. If a color must change, append CSS variables or token overrides inside \`${rootSelector}\` only; never replace the full CSS.
5. If an image must change, choose an existing asset from \`/DesktopModules/MegaForm/Assets/img/mock/\` or a registered MegaForm media asset; do not use random remote URLs.
6. After edits, run visual QA at desktop and mobile and compare against the mock route above.
`;
}

function writeAll() {
  ensureDir(outDir);
  ensureDir(kbDir);
  fs.rmSync(packageDir, { recursive: true, force: true });
  ensureDir(path.join(packageDir, 'forms'));
  ensureDir(path.join(packageDir, 'kb'));
  copyImages();

  const templates = [
    specialInsurance(),
    specialEvent(),
    specialDonation(),
    ...waveConfigs.map(waveTemplate),
  ];

  const kbRows = [];
  for (const t of templates) {
    const file = path.join(outDir, `${t.slug}.json`);
    fs.writeFileSync(file, JSON.stringify(t, null, 2) + '\n', 'utf8');

    const routeSlug = t.slug === 'event-registration-premium' ? 'event-registration' : t.slug;
    const rootSelector = t.slug === 'insurance-enrollment' ? '.mfp-insurance-enrollment'
      : t.slug === 'event-registration-premium' ? '.mfp-event-registration-premium'
      : t.slug === 'elderly-care-donation' ? '.mfp-elderly-care-donation'
      : '.mfp-premium-wave';
    const kb = kbMarkdown(
      t,
      `/forms/${routeSlug}`,
      rootSelector,
      [
        'customHtml shell, wrapper classes and semantic section blocks',
        'editable row/table controls represented by native MegaForm fields such as DataGrid',
        'customCss selectors, dimensions, colors, borders, shadows and responsive breakpoints',
        'hero/image URLs and FontAwesome/mock-catalog icon names',
      ],
      [
        'field labels, placeholders, required flags and validation rules',
        'choice option labels, values, descriptions, meta and badges',
        'success message, submit button text and business copy',
      ],
    );
    const kbFile = path.join(kbDir, `${t.slug}.kb.md`);
    fs.writeFileSync(kbFile, kb, 'utf8');
    kbRows.push({
      slug: `tpl-${t.slug}`,
      kind: 'form_template',
      title: `${t.title} design contract`,
      summary: `AI-safe editing guide for ${t.title}; preserve mock-derived CSS, image and icon rail.`,
      body: kb,
      tags: `premium,template,design-contract,mock11,${t.slug}`,
    });

    const schema = { version: '1.0', fields: t.fields, settings: t.settings };
    const appForm = {
      id: 0,
      title: t.title,
      schemaJson: JSON.stringify(schema),
      settingsJson: JSON.stringify(t.settings),
    };
    fs.writeFileSync(path.join(packageDir, 'forms', `${t.slug}.json`), JSON.stringify(appForm, null, 2) + '\n', 'utf8');
  }

  const manifest = {
    app: {
      slug: 'mock11-premium-forms',
      title: 'Mock 11 Premium Forms',
      description: 'Eight premium MegaForm templates converted from form-builder-controls (11) with per-template AI design contracts.',
      color: '#22c55e',
    },
    forms: templates.map((t) => ({ file: `forms/${t.slug}.json`, title: t.title })),
    tables: [],
  };
  fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(packageDir, 'kb', 'index.json'), JSON.stringify(kbRows, null, 2) + '\n', 'utf8');

  const summary = {
    templates: templates.map((t) => ({ slug: t.slug, title: t.title, fields: t.fields.length })),
    packageDir,
  };
  fs.writeFileSync(path.join(packageDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

writeAll();
