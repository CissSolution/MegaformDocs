/**
 * Exact conversion of app/forms/document-registration/page.tsx.
 *
 * The desktop composition follows the 768px A4-style mock. Container queries collapse the
 * two-column groups only when the CMS pane itself is narrow, so DNN skins and Oqtane themes do
 * not change the desktop geometry. All visible copy is tokenized by buildTemplate().
 */
import { field, choiceField } from './build-euroyouth-skins.mjs';
import { wrapperReset, controlReset, svgUrl, lucideArrowLeft } from './exact-helpers.mjs';

const DM = `'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif`;
const FONT = "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');";

const shield = svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'
  fill='none' stroke='#fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>
  <path d='M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z'/></svg>`);

const upload = svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'
  fill='none' stroke='#555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>
  <path d='M12 3v12'/><path d='m17 8-5-5-5 5'/><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/></svg>`);

const selectChevron = svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'
  fill='none' stroke='#555' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>
  <path d='m7 10 5 5 5-5'/></svg>`);

const countries = ['Germany', 'France', 'Spain', 'Italy', 'Portugal', 'Netherlands', 'Austria',
  'Belgium', 'Greece', 'Poland', 'Sweden', 'Ireland', 'Other'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

const F = (key, type, label, extra = {}) => field(key, type, label, extra);
const R = (key, label, values, extra = {}) => choiceField(key, 'Radio', label,
  values.map((x) => typeof x === 'string' ? { label: x, value: x.toLowerCase().replace(/\s+/g, '-') } : x),
  'list', null, extra);
const S = (key, label, values, extra = {}) => choiceField(key, 'Select', label,
  values.map((x) => typeof x === 'string' ? { label: x, value: x } : x), 'dropdown', null, extra);

const exactFields = [
  F('application_date', 'Date', 'Date'),
  F('passport_photo', 'File', 'Passport photo', {
    fileSettings: { maxFiles: 1, maxSizeMB: 5, allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'] },
  }),
  F('first_name', 'Text', 'First Name', { required: true, placeholder: 'Eleanor' }),
  F('last_name', 'Text', 'Last Name', { required: true, placeholder: 'Hayes' }),
  R('gender', 'Gender', [{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' }]),
  F('date_of_birth', 'Date', 'Date of Birth'),
  F('place_of_birth', 'Text', 'Place of Birth', { placeholder: 'City, Country' }),
  F('father_name', 'Text', "Father's Name", { placeholder: 'Full name' }),
  F('mother_name', 'Text', "Mother's Name", { placeholder: 'Full name' }),
  S('nationality', 'Nationality', countries, { placeholder: '\u2014 Select \u2014' }),
  F('religion', 'Text', 'Religion', { placeholder: 'Optional' }),
  R('residence_status', 'Residence Status', [
    { label: 'Residence', value: 'resident' }, { label: 'No-Residence', value: 'non-resident' },
  ]),
  R('marital_status', 'Marital Status', [
    { label: 'Single', value: 'single' }, { label: 'Married', value: 'married' },
  ]),
  F('national_id', 'Text', 'National ID No.', { placeholder: 'ID number' }),
  F('passport_no', 'Text', 'Passport No.', { placeholder: 'Passport number' }),
  F('tin', 'Text', 'TIN', { placeholder: 'Tax ID number' }),
  F('driving_license', 'Text', 'Driving License No.', { placeholder: 'License number' }),
  F('address', 'Text', 'Address', { required: true, placeholder: 'Street address' }),
  F('city', 'Text', 'City', { required: true, placeholder: 'City' }),
  F('state', 'Text', 'State / Province', { placeholder: 'State' }),
  F('zip', 'Text', 'Zip Code', { placeholder: '00000' }),
  S('country', 'Country', countries, { required: true, placeholder: '\u2014 Select \u2014' }),
  F('phone', 'Phone', 'Phone', { required: true, placeholder: '+1 (555) 000-0000' }),
  F('email', 'Email', 'Email', { required: true, placeholder: 'email@example.com' }),
  R('membership_type', 'Membership Type', [
    { label: 'Regular', value: 'regular' }, { label: 'Premium', value: 'premium' },
    { label: 'VIP', value: 'vip' },
  ]),
  S('programme', 'Programme', [
    { label: 'Erasmus Exchange', value: 'erasmus' },
    { label: 'Language Immersion', value: 'language' },
    { label: 'Solidarity Corps', value: 'volunteer' },
  ], { required: true, placeholder: '\u2014 Select \u2014' }),
  S('duration', 'Duration (months)', [
    { label: '1 month', value: '1' }, { label: '2 months', value: '2' },
    { label: '3 months', value: '3' }, { label: '6 months', value: '6' },
    { label: '12 months', value: '12' },
  ], { defaultValue: '3' }),
  S('start_month', 'Start Month', months, { required: true, placeholder: '\u2014 Select \u2014' }),
  S('accommodation', 'Accommodation', ['Host Family', 'Student Dormitory', 'Private Apartment',
    'Not Required'], { placeholder: '\u2014 Select \u2014' }),
  S('language_level', 'Language Level', ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], {
    placeholder: '\u2014 Select \u2014',
  }),
  R('scholarship', 'Scholarship Required', [
    { label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' },
  ]),
  choiceField('terms', 'Checkbox', 'Terms', [
    { label: 'I agree to the Terms and Conditions', value: 'yes' },
  ], 'list', null, { required: true }),
  choiceField('newsletter', 'Checkbox', 'Newsletter', [
    { label: 'I would like to receive programme updates and news', value: 'yes' },
  ], 'list'),
  F('signature', 'Signature', 'Signature', {
    required: true,
    widgetProps: { height: 80, placeholderText: 'Sign here', clearText: 'Clear', undoText: 'Undo' },
  }),
];

const label = (text, key, required = false) => `<label class='drc-field'>`
  + `<span class='drc-label'>${text}${required ? '<b>*</b>' : ''}</span>{{field:${key}}}</label>`;
const section = (text) => `<div class='drc-section'><span>${text}</span><i></i></div>`;
const grid = (...items) => `<div class='drc-grid'>${items.join('')}</div>`;

const shellHtml = () => `<div class='mfp mfp-drc mfp-native-generated' data-mf-flexgrid='locked'
  style='background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;box-shadow:none!important'>
  <div class='drc-page'><div class='drc-paper'>
    <div class='drc-head'>
      <div class='drc-brand'><span class='drc-mark' aria-hidden='true'></span><span class='drc-brand-copy'>
        <strong>EuroYouth</strong><small>exchange programme 2026</small></span></div>
      <div class='drc-head-tools'>
        <div class='drc-date'>${label('Date', 'application_date')}</div>
        <div class='drc-photo'>{{field:passport_photo}}<span class='drc-photo-empty' aria-hidden='true'>
          <i></i><small>Photo</small></span><img class='drc-photo-preview' alt='Passport photo'></div>
      </div>
    </div>
    <div class='drc-hgroup'><h1 class='drc-h1'>Registration Form</h1></div>
    <div class='drc-body'>
      ${section('Personal Information')}
      ${grid(label('First Name', 'first_name', true), label('Last Name', 'last_name', true))}
      <div class='drc-gap16'>${label('Gender', 'gender')}</div>
      <div class='drc-gap16'>${grid(
        label('Date of Birth', 'date_of_birth'), label('Place of Birth', 'place_of_birth'),
        label("Father's Name", 'father_name'), label("Mother's Name", 'mother_name'),
        label('Nationality', 'nationality'), label('Religion', 'religion'),
      )}</div>
      <div class='drc-gap16'>${grid(label('Residence Status', 'residence_status'),
        label('Marital Status', 'marital_status'))}</div>
      <div class='drc-gap16'>${grid(
        label('National ID No.', 'national_id'), label('Passport No.', 'passport_no'),
        label('TIN', 'tin'), label('Driving License No.', 'driving_license'),
      )}</div>
      ${section('Contact Information')}
      ${label('Address', 'address', true)}
      <div class='drc-gap16'>${grid(
        label('City', 'city', true), label('State / Province', 'state'), label('Zip Code', 'zip'),
        label('Country', 'country', true), label('Phone', 'phone', true), label('Email', 'email', true),
      )}</div>
      <div class='drc-gap16'>${label('Membership Type', 'membership_type')}</div>
      ${section('Programme Details')}
      ${grid(
        label('Programme', 'programme', true), label('Duration (months)', 'duration'),
        label('Start Month', 'start_month', true), label('Accommodation', 'accommodation'),
        label('Language Level', 'language_level'), label('Scholarship Required', 'scholarship'),
      )}
      ${section('Declaration')}
      <div class='drc-declare'>
        <div><span class='drc-label'>Terms &amp; Conditions</span>
          <div class='drc-terms-copy'>By signing this registration form, I confirm that all the
          information provided is accurate and complete to the best of my knowledge. I understand
          that any false or misleading information may result in the rejection of my application
          or termination of my participation in the EuroYouth Exchange Programme 2026.</div>
          <div class='drc-checks'>{{field:terms}}{{field:newsletter}}</div>
        </div>
        <div><span class='drc-label'>Signature</span><div class='drc-sign'>{{field:signature}}</div>
          <div class='drc-sign-rule'></div><p class='drc-sign-cap'>Applicant Signature</p></div>
      </div>
      <div class='drc-actions'><button class='drc-back' type='button'><i aria-hidden='true'></i>
        Back to forms</button><button class='drc-submit' type='submit'>Submit Registration</button></div>
      <div class='drc-official'>EuroYouth Exchange Programme &mdash; Registered NGO &mdash; euroyouth.eu</div>
    </div>
    {{script:drc_runtime}}
  </div></div>
</div>`;

const runtime = `(function(){
  var root=(typeof __mfCurrentScriptRoot!=='undefined'&&__mfCurrentScriptRoot)||document;
  var scope=(root&&root.closest)?(root.closest('.mfp')||document):document;
  var date=scope.querySelector('[name="application_date"]');
  if(date&&!date.value){date.value=new Date().toISOString().slice(0,10);try{date.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}}
  var photo=scope.querySelector('.drc-photo');
  var input=photo&&photo.querySelector('input[type="file"]');
  var hidden=photo&&photo.querySelector('input[type="hidden"]');
  var preview=photo&&photo.querySelector('.drc-photo-preview');
  function paint(file){if(!file||!preview)return;var r=new FileReader();r.onload=function(){preview.src=String(r.result||'');photo.classList.add('has-photo');};r.readAsDataURL(file);}
  if(photo&&input){
    photo.setAttribute('role','button');photo.setAttribute('tabindex','0');photo.setAttribute('aria-label','Upload passport photo');
    input.addEventListener('click',function(e){e.stopPropagation();});
    input.addEventListener('change',function(){photo.classList.remove('is-uploaded');photo.classList.add('is-uploading');paint(input.files&&input.files[0]);});
    photo.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}});
    if(hidden)hidden.addEventListener('change',function(){photo.classList.remove('is-uploading');photo.classList.toggle('is-uploaded',!!hidden.value);photo.title=hidden.value?'Photo uploaded':'Upload passport photo';});
  }
  var back=scope.querySelector('.drc-back');if(back)back.addEventListener('click',function(){if(history.length>1)history.back();});
})();`;

export const DRC = {
  slug: 'document-registration-a4',
  title: 'EuroYouth Document Registration',
  description: 'A formal A4-style registration document with identity, contact, programme, passport photo, declaration and signature fields.',
  category: 'registration',
  categories: ['registration', 'premium', 'education', 'documents'],
  icon: 'file-text',
  prefix: 'drc',
  outerBorder: false,
  themeVars: false,
  fontStack: DM,
  fontImport: FONT,
  submitLabel: 'Submit Registration',
  successTitle: 'Registration submitted',
  successMessage: 'Registration submitted.',
  successBody: 'Thank you, {{field:first_name}} {{field:last_name}}. Your registration has been received and will be processed within 5 business days.',
  palette: {
    primary: '#111111', accent: '#111111', surface: '#ffffff', text: '#111111',
    muted: '#555555', border: '#cccccc', onPrimary: '#ffffff', deco: '#111111', page: '#f0f0f0',
  },
  exactFields,
  shellHtml,
  customScripts: { drc_runtime: runtime },
  exactCss: `
${wrapperReset('drc')}
@S@{container-type:inline-size;font-family:${DM}!important;color:#111;background:transparent!important}
@S@.drc-page{padding:32px 16px;background:#f0f0f0}
@S@.drc-paper{box-sizing:border-box;width:100%;max-width:768px;margin:0 auto;background:#fff;
  border-top:3px solid #111;box-shadow:0 2px 24px rgba(0,0,0,.10)}
@S@.drc-head{display:flex;align-items:flex-start;justify-content:space-between;padding:28px 32px 20px;
  border-bottom:1px solid #ccc}
@S@.drc-brand{display:flex;align-items:center;gap:10px}
@S@.drc-mark{display:block;flex:0 0 36px;width:36px;height:36px;border-radius:4px;background:#111 ${shield} center/20px 20px no-repeat}
@S@.drc-brand-copy{display:flex;flex-direction:column}
@S@.drc-brand-copy strong{font-size:15px;line-height:20px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#111}
@S@.drc-brand-copy small{font-size:10px;line-height:12px;font-weight:400;color:#555}
@S@.drc-head-tools{display:flex;align-items:flex-start;gap:20px}
@S@.drc-date{width:126px;text-align:right}
@S@.drc-date .drc-label{text-align:right}
@S@.drc-photo{position:relative;flex:0 0 64px;width:64px;height:80px;overflow:hidden;border:1px solid #ccc;background:#f7f7f7}
@S@.drc-photo:hover,@S@.drc-photo:focus-visible{border-color:#777;outline:1px solid #777;outline-offset:2px}
@S@.drc-photo .mf-field-group{height:100%!important}
@S@.drc-photo .mf-file-dropzone{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-height:0!important;
  margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;z-index:3;cursor:pointer!important}
@S@.drc-photo .mf-file-dropzone-inner,@S@.drc-photo .mf-file-list{display:none!important}
@S@.drc-photo-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;pointer-events:none}
@S@.drc-photo-empty i{display:block;width:16px;height:16px;background:${upload} center/16px 16px no-repeat}
@S@.drc-photo-empty small{font-size:9px;line-height:12px;font-weight:500;letter-spacing:.05em;text-transform:uppercase;color:#555}
@S@img.drc-photo-preview{position:absolute!important;inset:0!important;display:none!important;width:100%!important;height:100%!important;max-width:none!important;object-fit:cover!important}
@S@.drc-photo.has-photo img.drc-photo-preview{display:block!important}
@S@.drc-photo.has-photo .drc-photo-empty{display:none}
@S@.drc-photo.is-uploaded:after{content:'\\2713';position:absolute;right:3px;bottom:3px;z-index:4;display:grid;width:16px;height:16px;place-items:center;
  border-radius:50%;background:#111;color:#fff;font-size:10px;line-height:1;pointer-events:none}
@S@.drc-hgroup{padding:20px 32px 4px}
@S@h1.drc-h1{margin:0!important;font-size:24px!important;line-height:32px!important;font-weight:700!important;letter-spacing:0!important;color:#111!important}
@S@.drc-body{padding:0 32px 32px}
@S@.drc-section{display:flex;align-items:center;gap:12px;margin:28px 0 16px}
@S@.drc-section span{flex:0 0 auto;font-size:11px;line-height:17px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#111}
@S@.drc-section i{display:block;flex:1 1 auto;height:1px;background:#ccc}
@S@.drc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 24px}
@S@.drc-gap16{margin-top:16px}
@S@.drc-field{display:block;margin:0}
@S@.drc-label{display:block;margin:0 0 2px;font-size:10px;line-height:15px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#555}
@S@.drc-label b{margin-left:2px;font-weight:600;color:#111}
${controlReset()}
@S@.mf-input[class],@S@.mf-select[class]{box-sizing:border-box;width:100%!important;height:36.67px!important;min-height:0!important;margin:0!important;padding:8px 0!important;
  border:0!important;border-bottom:1px solid #c8c8c8!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;
  color:#111!important;font-family:inherit!important;font-size:13px!important;line-height:20px!important;font-weight:400!important;letter-spacing:0!important;outline:none!important}
@S@.mf-input[class]:focus,@S@.mf-select[class]:focus{border-bottom:1.5px solid #111!important;box-shadow:none!important}
@S@.mf-input[class]::placeholder{color:#aaa!important;opacity:1}
@S@.mf-select[class]{appearance:none!important;-webkit-appearance:none!important;cursor:pointer!important;
  padding-left:8px!important;padding-right:34px!important;background-image:${selectChevron}!important;background-repeat:no-repeat!important;
  background-position:right 10px center!important;background-size:16px 16px!important}
@S@.mf-select option{padding:6px 10px!important}
@S@.mf-select-wrap>.mf-select-chevron{display:none!important}
@S@.mf-option-group{display:flex!important;flex-direction:row!important;flex-wrap:wrap!important;gap:4px 20px!important;padding-top:6px!important}
@S@label.mf-option-item[class]{display:inline-flex!important;align-items:center!important;width:max-content!important;max-width:none!important;flex:0 0 auto!important;margin:0!important;min-height:0!important}
@S@.mf-option-control{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important;border:0!important}
@S@.mf-option-ui{display:flex!important;align-items:center!important;gap:6px!important;min-height:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:#111!important}
@S@.mf-option-ui:before{content:'';display:block;box-sizing:border-box;flex:0 0 14px;width:14px;height:14px;border:1px solid #c8c8c8;background:transparent}
@S@input[type='radio'] + .mf-option-ui:before{border-radius:50%}
@S@input[type='radio']:checked + .mf-option-ui:before{border:4px solid #111}
@S@input[type='checkbox']:checked + .mf-option-ui:before{border-color:#111;background:#111}
@S@.mf-option-label{font-size:13px!important;line-height:20px!important;font-weight:400!important;color:#111!important}
@S@.mf-option-check,@S@.mf-option-icon{display:none!important}
@S@.drc-declare{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:20px;align-items:start}
@S@.drc-terms-copy{box-sizing:border-box;width:100%;height:90px;overflow:auto;padding:8px 12px;border:1px solid #ccc;background:#f9f9f9;
  font-size:11px;line-height:18px;font-weight:400;color:#555}
@S@.drc-checks{display:flex;flex-direction:column;gap:8px;margin-top:12px}
@S@.drc-checks .mf-option-group{padding:0!important}
@S@.drc-checks .mf-option-label{font-size:12px!important;line-height:18px!important;color:#555!important}
@S@.drc-checks input[type='checkbox'] + .mf-option-ui:before{border-radius:0}
@S@.drc-sign{box-sizing:border-box;height:96px;overflow:hidden;border:1px solid #ccc;background:#fff}
@S@.drc-sign .mf-signature-field{box-sizing:border-box;display:flex!important;flex-direction:column!important;width:100%!important;height:100%!important;
  margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:#fff!important;box-shadow:none!important}
@S@.drc-sign .mf-signature-canvas-wrap{position:relative!important;display:block!important;box-sizing:border-box!important;flex:1 1 auto!important;min-height:0!important;
  margin:0!important;padding:0!important;overflow:hidden!important;border:0!important;border-radius:0!important;background:#fff!important;box-shadow:none!important}
@S@.drc-sign canvas.mf-signature-canvas{display:block!important;box-sizing:border-box!important;width:100%!important;height:70px!important;
  margin:0!important;border:0!important;border-radius:0!important;background:#fff!important;cursor:crosshair!important;touch-action:none!important}
@S@.drc-sign .mf-signature-placeholder{position:absolute!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;
  gap:5px!important;pointer-events:none!important;color:#bbb!important;font-size:10px!important;line-height:14px!important;letter-spacing:.1em!important;text-transform:uppercase!important}
@S@.drc-sign .mf-signature-placeholder svg{width:14px!important;height:14px!important}
@S@.drc-sign .mf-signature-actions{box-sizing:border-box!important;display:flex!important;flex:0 0 24px!important;align-items:center!important;justify-content:flex-end!important;
  gap:4px!important;height:24px!important;margin:0!important;padding:2px 4px!important;border-top:1px solid #eee!important;background:#fafafa!important}
@S@.drc-sign .mf-signature-actions button{box-sizing:border-box!important;min-width:0!important;min-height:0!important;height:19px!important;margin:0!important;
  padding:1px 6px!important;border:0!important;border-radius:2px!important;background:transparent!important;box-shadow:none!important;color:#666!important;
  font-family:inherit!important;font-size:9px!important;line-height:15px!important;font-weight:500!important;text-transform:none!important}
@S@.drc-sign .mf-signature-actions button:hover{background:#eee!important;color:#111!important}
@S@.drc-sign .mf-signature-actions button:disabled{opacity:.35!important}
@S@.drc-sign-rule{height:1px;margin-top:4px;background:#ccc}
@S@p.drc-sign-cap{margin:2px 0 0!important;text-align:center;font-size:9px!important;line-height:14px!important;font-weight:400!important;letter-spacing:.1em;text-transform:uppercase;color:#555!important}
@S@.drc-actions{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:32px;padding-top:20px;border-top:1px solid #ccc}
@S@button.drc-back{display:inline-flex;align-items:center;gap:6px;padding:0!important;border:0!important;background:transparent!important;color:#555!important;
  font-family:inherit!important;font-size:13px!important;line-height:20px!important;font-weight:500!important;text-align:left!important;text-transform:none!important;box-shadow:none!important}
@S@button.drc-back i{display:block;width:14px;height:14px;background:${lucideArrowLeft('#555555')} center/14px 14px no-repeat}
@S@button.drc-submit[type='submit']{width:auto!important;min-height:0!important;padding:10px 28px!important;border:0!important;border-radius:4px!important;background:#111!important;
  color:#fff!important;font-family:inherit!important;font-size:13px!important;line-height:20px!important;font-weight:600!important;letter-spacing:.05em!important;text-transform:uppercase!important;box-shadow:none!important}
@S@button.drc-submit.mf-nav-blocked,@S@button.drc-submit[disabled]{opacity:.4!important;background:#111!important}
@S@.drc-official{margin-top:24px;padding-top:16px;border-top:1px solid #ccc;text-align:center;font-size:10px;line-height:15px;font-weight:400;letter-spacing:.1em;text-transform:uppercase;color:#bbb}
@container (max-width:520px){
  @S@.drc-page{padding:0!important}
  @S@.drc-paper{box-shadow:none}
  @S@.drc-head{padding:20px 18px 16px;gap:14px}
  @S@.drc-head-tools{gap:10px}
  @S@.drc-date{display:none}
  @S@.drc-hgroup{padding:18px 18px 2px}
  @S@.drc-body{padding:0 18px 24px}
  @S@.drc-grid{grid-template-columns:1fr!important}
  @S@.drc-declare{grid-template-columns:minmax(0,1fr)!important}
  @S@.drc-declare>div{min-width:0!important}
  @S@.drc-checks label.mf-option-item[class]{width:100%!important;max-width:100%!important;white-space:normal!important}
  @S@.drc-checks .mf-option-ui,@S@.drc-checks .mf-option-copy,@S@.drc-checks .mf-option-label{min-width:0!important;white-space:normal!important}
  @S@.drc-actions{align-items:stretch;flex-direction:column-reverse}
  @S@button.drc-submit[type='submit']{width:100%!important}
  @S@button.drc-back{justify-content:center}
}
`,
};
