// Generates the five hand-authored MegaForm rental schemas (Oqtane).
// Casing of `type` is LOAD-BEARING: Number / Text / Textarea / Date / Select / File / Hidden.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'schemas');
mkdirSync(OUT, { recursive: true });

const DEMO = 'DEMO-RENTAL-2026';

let ord = 0;
const resetOrder = () => { ord = 0; };
const next = () => ++ord;

function base(key, type, label, extra = {}) {
  const f = { key, type, label, order: next(), required: false, pageIndex: 0 };
  return Object.assign(f, extra);
}
const text = (key, label, extra) => base(key, 'Text', label, extra);
const area = (key, label, extra) => base(key, 'Textarea', label, Object.assign({ rows: 4 }, extra));
const date = (key, label, extra) => base(key, 'Date', label, extra);
const hidden = (key, label, extra) => base(key, 'Hidden', label, extra);
const file = (key, label, fileSettings, extra) => base(key, 'File', label, Object.assign({ fileSettings }, extra));

function num(key, label, extra = {}) {
  const { min, max, ...rest } = extra;
  const f = base(key, 'Number', label, rest);
  const v = {};
  if (min !== undefined) v.min = min;
  if (max !== undefined) v.max = max;
  if (Object.keys(v).length) f.validation = v;
  return f;
}
function sel(key, label, options, extra = {}) {
  return base(key, 'Select', label, Object.assign({ options: options.map(([value, l]) => ({ label: l, value })) }, extra));
}
// Verified-safe boolean substitute: Checkbox WITHOUT options renders NO input at all
// on the shipped Oqtane bundle, so a 2-option Select is used instead (lands in
// MF_SubmissionValueString with an exact-match value -> still a real facet, no CSV LIKE).
const YESNO = [['yes', 'Yes (Có)'], ['no', 'No (Không)']];
const bool = (key, label, extra = {}) =>
  sel(key, label, YESNO, Object.assign({ defaultValue: 'no' }, extra));

const demoMarker = () => hidden('demo_marker', 'Demo marker (Dấu dữ liệu demo)', {
  defaultValue: DEMO,
  helpText: 'Seed marker. All rows carrying DEMO-RENTAL-2026 are fictional demo data and can be bulk-deleted.'
});

function settings(submitText) {
  return {
    multiPage: false,
    layoutMode: 'flow',
    displayOnly: false,
    hideHeader: false,
    showProgressBar: false,
    showPageTitles: false,
    honeypotFieldName: '__mf_hp',
    // Admin data entry + bulk seeding: the default 3-per-5-min IP limit adds +60 spam
    // score (>=50 == spam) even for authenticated staff, which would kill a 9k-row seed.
    rateLimitWindowMinutes: 1,
    rateLimitMaxPerWindow: 2000,
    enableAnalytics: false,
    labelPosition: 'top',
    formWidth: '100%',
    submitButtonText: submitText,
    theme: 'default',
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'vi-VN'],
    postSubmitExperience: {
      enabled: true,
      mode: 'rich',
      title: 'Saved',
      message: 'The record has been saved.',
      showSubmissionId: true,
      submissionIdLabel: 'Record ID',
      showAnswerSummary: false,
      allowFillAgain: true,
      fillAgainLabel: 'Add another record',
      reviewBeforeSubmit: false,
      buttons: []
    }
  };
}

const schema = (fields, submitText) => ({
  version: '1.0',
  fields,
  pages: null,
  settings: settings(submitText),
  customScripts: {}
});

// ------------------------------------------------------------------ building
resetOrder();
const DISTRICTS = [
  ['tan_binh', 'Tan Binh (Tân Bình)'],
  ['tan_phu', 'Tan Phu (Tân Phú)'],
  ['quan_7', 'District 7 (Quận 7)'],
  ['nha_be', 'Nha Be (Nhà Bè)'],
  ['phu_nhuan', 'Phu Nhuan (Phú Nhuận)']
];
const PROPERTY_TYPES = [
  ['phong_tro', 'Boarding room (Phòng trọ)'],
  ['can_ho_dich_vu', 'Serviced apartment (Căn hộ dịch vụ)'],
  ['nha_nguyen_can', 'Whole house (Nhà nguyên căn)'],
  ['can_ho_cao_cap', 'Premium apartment (Căn hộ cao cấp)'],
  ['studio', 'Studio (Studio)'],
  ['can_ho_mini', 'Mini apartment (Căn hộ mini)'],
  ['nha_mat_tien', 'Street-front house (Nhà mặt tiền)']
];

const building = schema([
  text('building_code', 'Building code (Mã toà nhà)', {
    required: true,
    placeholder: 'TB01',
    helpText: 'Stable business key. This exact value is what every room record must repeat in its own Building code field.',
    validation: { minLength: 2, maxLength: 20, pattern: '^[A-Z0-9][A-Z0-9_-]{1,19}$', patternMessage: 'Use upper-case letters, digits, - or _ (2-20 chars), e.g. TB01.' }
  }),
  text('name', 'Building name (Tên toà nhà)', { required: true, validation: { minLength: 2, maxLength: 150 } }),
  text('address', 'Street address (Địa chỉ)', { required: true, validation: { minLength: 5, maxLength: 250 } }),
  sel('district', 'District (Quận / Huyện)', DISTRICTS, { required: true }),
  text('ward', 'Ward (Phường / Xã)', { validation: { maxLength: 100 } }),
  sel('property_type', 'Property type (Loại hình)', PROPERTY_TYPES, { required: true }),
  num('total_rooms', 'Total rooms (Tổng số phòng)', { required: true, min: 1, max: 500 }),
  num('floors', 'Number of floors (Số tầng)', { min: 1, max: 50 }),
  num('year_built', 'Year built (Năm xây dựng)', { min: 1950, max: 2030 }),
  num('latitude', 'Latitude (Vĩ độ)', { required: true, min: 8, max: 12, helpText: 'Decimal degrees, e.g. 10.801234. Ho Chi Minh City sits between 10.3 and 11.2.' }),
  num('longitude', 'Longitude (Kinh độ)', { required: true, min: 105, max: 108, helpText: 'Decimal degrees, e.g. 106.652345.' }),
  area('description', 'Description (Mô tả toà nhà)', { validation: { maxLength: 4000 } }),
  area('photo_urls', 'Building photo URLs (Ảnh toà nhà - mỗi dòng một URL)', {
    rows: 5,
    placeholder: 'https://example.com/toa-nha-01.jpg',
    helpText: 'One absolute image URL per line. Do NOT use a File upload here: the file endpoints require authentication, so anonymous visitors get 401 and public photos would never load.',
    validation: { maxLength: 4000 }
  }),
  num('dist_market_m', 'Distance to market, metres (Khoảng cách tới chợ, m)', { min: 0, max: 20000 }),
  num('dist_school_m', 'Distance to school, metres (Khoảng cách tới trường học, m)', { min: 0, max: 20000 }),
  num('dist_hospital_m', 'Distance to hospital, metres (Khoảng cách tới bệnh viện, m)', { min: 0, max: 20000 }),
  num('dist_bus_stop_m', 'Distance to bus stop, metres (Khoảng cách tới trạm xe buýt, m)', { min: 0, max: 20000 }),
  num('dist_supermarket_m', 'Distance to supermarket, metres (Khoảng cách tới siêu thị, m)', { min: 0, max: 20000 }),
  demoMarker()
], 'Save building (Lưu toà nhà)');

// ---------------------------------------------------------------------- room
resetOrder();
const ROOM_STATUS = [
  ['trong', 'Vacant (Trống)'],
  ['da_thue', 'Rented (Đã thuê)'],
  ['dang_sua', 'Under repair (Đang sửa)']
];
const ROOM_VIEW = [
  ['thanh_pho', 'City view (Nhìn thành phố)'],
  ['san_vuon', 'Garden view (Nhìn sân vườn)'],
  ['ho_boi', 'Pool view (Nhìn hồ bơi)'],
  ['duong_pho', 'Street view (Nhìn ra đường)'],
  ['gieng_troi', 'Light-well view (Nhìn giếng trời)'],
  ['khong_co', 'No view (Không có view)']
];
const ORIENTATION = [
  ['dong', 'East (Đông)'],
  ['tay', 'West (Tây)'],
  ['nam', 'South (Nam)'],
  ['bac', 'North (Bắc)'],
  ['dong_nam', 'South-East (Đông Nam)'],
  ['dong_bac', 'North-East (Đông Bắc)'],
  ['tay_nam', 'South-West (Tây Nam)'],
  ['tay_bac', 'North-West (Tây Bắc)']
];

const room = schema([
  text('room_code', 'Room code (Mã phòng)', {
    required: true,
    placeholder: 'TB01-0203',
    helpText: 'Unique business key for this room. Monthly readings and tenants point back here with this exact value.',
    validation: { minLength: 2, maxLength: 40, pattern: '^[A-Z0-9][A-Z0-9_.-]{1,39}$', patternMessage: 'Upper-case letters, digits, - . _ (2-40 chars), e.g. TB01-0203.' }
  }),
  text('building_code', 'Building code (Mã toà nhà)', {
    required: true,
    placeholder: 'TB01',
    helpText: 'FOREIGN KEY. Must repeat the parent building record\'s Building code exactly (matched case-insensitively by the auto-link).',
    validation: { minLength: 2, maxLength: 20, pattern: '^[A-Z0-9][A-Z0-9_-]{1,19}$', patternMessage: 'Must match an existing building code, e.g. TB01.' }
  }),
  text('room_name', 'Room name / number (Tên hoặc số phòng)', { validation: { maxLength: 100 } }),
  num('floor_level', 'Floor level (Tầng)', { min: 0, max: 50 }),
  num('area_m2', 'Area in m2 (Diện tích, m²)', { required: true, min: 5, max: 500 }),
  num('base_rent', 'Base rent, VND per month (Giá thuê gốc, VNĐ/tháng)', {
    required: true, min: 0, max: 500000000,
    helpText: 'Plain number, no thousands separators and no currency symbol. There is no Currency field type in this engine — the unit lives in the label.'
  }),
  num('discount_percent', 'Discount percent (Giảm giá, %)', { min: 0, max: 100, defaultValue: '0' }),
  num('final_price', 'Final price, VND per month (Giá cuối, VNĐ/tháng)', {
    required: true, min: 0, max: 500000000,
    helpText: 'Deliberately denormalised = base rent x (100 - discount) / 100. Stored so a price-range filter can hit one numeric column instead of computing at query time.'
  }),
  num('deposit', 'Deposit, VND (Tiền cọc, VNĐ)', { min: 0, max: 500000000 }),
  num('max_occupants', 'Maximum occupants (Số người tối đa)', { min: 1, max: 20 }),
  sel('status', 'Status (Tình trạng)', ROOM_STATUS, { required: true, defaultValue: 'trong' }),
  sel('room_view', 'View (Hướng nhìn)', ROOM_VIEW),
  sel('orientation', 'Orientation (Hướng phòng)', ORIENTATION),
  bool('amenity_wifi', 'Wifi (Wifi)'),
  bool('amenity_parking', 'Motorbike parking (Chỗ để xe)'),
  bool('amenity_drying_area', 'Laundry drying area (Sân phơi)'),
  bool('amenity_kitchen', 'Cooking allowed / kitchen (Được nấu ăn - bếp)'),
  bool('amenity_air_conditioner', 'Air conditioning (Máy lạnh)'),
  bool('amenity_reception_area', 'Private reception area (Khu tiếp khách riêng)'),
  bool('amenity_water_heater', 'Water heater (Máy nước nóng)'),
  bool('amenity_private_bathroom', 'Private bathroom (Vệ sinh khép kín)'),
  bool('amenity_balcony', 'Balcony (Ban công)'),
  bool('amenity_window', 'Window (Cửa sổ)'),
  area('photo_urls', 'Room photo URLs (Ảnh phòng - mỗi dòng một URL)', {
    rows: 5,
    placeholder: 'https://example.com/phong-0203-01.jpg',
    helpText: 'One absolute image URL per line. File uploads are not usable for public photos (every file endpoint requires authentication).',
    validation: { maxLength: 4000 }
  }),
  area('description', 'Description (Mô tả phòng)', { validation: { maxLength: 4000 } }),
  num('latitude', 'Latitude (Vĩ độ)', { min: 8, max: 12, helpText: 'Per-room pin for the map. Copy the building value when the room has no distinct entrance.' }),
  num('longitude', 'Longitude (Kinh độ)', { min: 105, max: 108 }),
  demoMarker()
], 'Save room (Lưu phòng)');

// ------------------------------------------------------------------- reading
resetOrder();
const reading = schema([
  text('room_code', 'Room code (Mã phòng)', {
    required: true,
    placeholder: 'TB01-0203',
    helpText: 'FOREIGN KEY. Must repeat the parent room record\'s Room code exactly.',
    validation: { minLength: 2, maxLength: 40, pattern: '^[A-Z0-9][A-Z0-9_.-]{1,39}$', patternMessage: 'Must match an existing room code, e.g. TB01-0203.' }
  }),
  date('reading_month', 'Reading month (Tháng chốt chỉ số)', {
    required: true,
    helpText: 'Use the first day of the billing month, e.g. 2026-07-01.'
  }),
  num('period', 'Period YYYYMM (Kỳ, dạng YYYYMM)', {
    required: true, min: 200001, max: 209912,
    placeholder: '202607',
    helpText: 'Sortable numeric month, e.g. 202607. Required because the relation reader orders children by when the row was TYPED, not by the month it belongs to.'
  }),
  num('elec_previous', 'Electricity previous reading (Chỉ số điện cũ)', { required: true, min: 0, max: 1000000 }),
  num('elec_current', 'Electricity current reading (Chỉ số điện mới)', { required: true, min: 0, max: 1000000 }),
  num('elec_unit_price', 'Electricity unit price, VND/kWh (Đơn giá điện, VNĐ/kWh)', { min: 0, max: 100000, defaultValue: '3500' }),
  num('water_previous', 'Water previous reading (Chỉ số nước cũ)', { required: true, min: 0, max: 1000000 }),
  num('water_current', 'Water current reading (Chỉ số nước mới)', { required: true, min: 0, max: 1000000 }),
  num('water_unit_price', 'Water unit price, VND/m3 (Đơn giá nước, VNĐ/m³)', { min: 0, max: 200000, defaultValue: '15000' }),
  num('other_charges', 'Other charges, VND (Chi phí khác, VNĐ)', { min: 0, max: 100000000, defaultValue: '0' }),
  num('total_amount', 'Total amount, VND (Tổng tiền, VNĐ)', {
    required: true, min: 0, max: 500000000,
    helpText: 'Denormalised total so the month can be filtered and summed without recomputing.'
  }),
  bool('paid', 'Paid (Đã thanh toán)'),
  area('note', 'Note (Ghi chú)', { validation: { maxLength: 2000 } }),
  demoMarker()
], 'Save reading (Lưu chỉ số)');

// -------------------------------------------------------------------- tenant
resetOrder();
const tenant = schema([
  text('tenant_code', 'Tenant code (Mã khách thuê)', {
    required: true,
    placeholder: 'KT-0001',
    helpText: 'Unique business key. The private-documents record points back here with this exact value.',
    validation: { minLength: 2, maxLength: 40, pattern: '^[A-Z0-9][A-Z0-9_.-]{1,39}$', patternMessage: 'Upper-case letters, digits, - . _ (2-40 chars), e.g. KT-0001.' }
  }),
  text('room_code', 'Room code (Mã phòng)', {
    required: true,
    placeholder: 'TB01-0203',
    helpText: 'FOREIGN KEY. Must repeat the parent room record\'s Room code exactly.',
    validation: { minLength: 2, maxLength: 40, pattern: '^[A-Z0-9][A-Z0-9_.-]{1,39}$', patternMessage: 'Must match an existing room code, e.g. TB01-0203.' }
  }),
  text('full_name', 'Full name (Họ và tên)', {
    required: true,
    helpText: 'FICTIONAL demo data only. Do not enter a real person.',
    validation: { minLength: 2, maxLength: 150 }
  }),
  text('phone', 'Phone (Số điện thoại)', {
    placeholder: '0900000001',
    helpText: 'Demo dataset uses the deliberately unassigned 09000000xx range.',
    validation: { maxLength: 20, pattern: '^0[0-9]{9}$', patternMessage: 'Ten digits starting with 0, e.g. 0900000001.' }
  }),
  text('email', 'Email (Thư điện tử)', {
    placeholder: 'khach01@example.invalid',
    helpText: 'Demo dataset uses the reserved .invalid / example.com domains so nothing can be delivered to a real inbox.',
    validation: { maxLength: 150, pattern: '^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$', patternMessage: 'Enter a valid email address.' }
  }),
  date('date_of_birth', 'Date of birth (Ngày sinh)'),
  date('lease_start', 'Lease start (Ngày bắt đầu thuê)', { required: true }),
  date('lease_end', 'Lease end (Ngày kết thúc thuê)'),
  num('monthly_rent_agreed', 'Monthly rent agreed, VND (Giá thuê đã thoả thuận, VNĐ/tháng)', { required: true, min: 0, max: 500000000 }),
  num('deposit_paid', 'Deposit paid, VND (Tiền cọc đã nhận, VNĐ)', { min: 0, max: 500000000 }),
  num('occupant_count', 'Number of occupants (Số người ở)', { min: 1, max: 20, defaultValue: '1' }),
  num('opening_electricity_reading', 'Opening electricity reading (Chỉ số điện lúc nhận phòng)', { min: 0, max: 1000000 }),
  num('opening_water_reading', 'Opening water reading (Chỉ số nước lúc nhận phòng)', { min: 0, max: 1000000 }),
  bool('rule_order_ack', 'House order rules acknowledged (Đã nhận nội quy về trật tự)'),
  bool('rule_fire_safety_ack', 'Fire safety rules acknowledged (Đã nhận nội quy phòng cháy)'),
  bool('rule_hygiene_ack', 'Hygiene rules acknowledged (Đã nhận nội quy vệ sinh)'),
  area('note', 'Note (Ghi chú)', { validation: { maxLength: 2000 } }),
  demoMarker()
], 'Save tenant (Lưu khách thuê)');

// -------------------------------------------------------------- private_docs
resetOrder();
const IMG = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
const privateDocs = schema([
  text('tenant_code', 'Tenant code (Mã khách thuê)', {
    required: true,
    placeholder: 'KT-0001',
    helpText: 'FOREIGN KEY. Must repeat the parent tenant record\'s Tenant code exactly. This form is the private half of the tenant file — the security boundary is the form itself.',
    validation: { minLength: 2, maxLength: 40, pattern: '^[A-Z0-9][A-Z0-9_.-]{1,39}$', patternMessage: 'Must match an existing tenant code, e.g. KT-0001.' }
  }),
  text('national_id', 'National ID number (Số CCCD / CMND)', {
    required: true,
    placeholder: 'DEMO-000000001',
    helpText: 'DEMO DATASET ONLY. The pattern forces a DEMO- prefix so the value can never collide with a real Vietnamese 12-digit citizen ID. Never type a real number here.',
    validation: { minLength: 14, maxLength: 14, pattern: '^DEMO-[0-9]{9}$', patternMessage: 'Demo IDs only: DEMO- followed by exactly 9 digits, e.g. DEMO-000000001.' }
  }),
  file('id_card_photo', 'ID card photo (Ảnh CCCD / CMND)',
    { maxSizeMB: 8, allowedExtensions: IMG, maxFiles: 2 },
    { helpText: 'Front and back. Fictional sample images only.' }),
  file('signed_contract_photo', 'Signed contract scan (Ảnh hợp đồng đã ký)',
    { maxSizeMB: 15, allowedExtensions: IMG, maxFiles: 4 }),
  file('movein_condition_photos', 'Move-in equipment condition photos (Ảnh hiện trạng thiết bị lúc nhận phòng)',
    { maxSizeMB: 8, allowedExtensions: IMG, maxFiles: 12 },
    { helpText: 'Up to 12 images. maxFiles is set in the schema JSON directly because the builder\'s File Settings panel does not write it back.' }),
  area('movein_checklist_note', 'Move-in checklist note (Biên bản bàn giao - ghi chú)', { rows: 6, validation: { maxLength: 4000 } }),
  demoMarker()
], 'Save private documents (Lưu hồ sơ riêng)');

const all = { building, room, reading, tenant, private_docs: privateDocs };
for (const [slug, s] of Object.entries(all)) {
  const compact = JSON.stringify(s);
  JSON.parse(compact); // round-trip guard
  writeFileSync(join(OUT, slug + '.json'), JSON.stringify(s, null, 2), 'utf8');
  writeFileSync(join(OUT, slug + '.min.json'), compact, 'utf8');
  const nums = s.fields.filter(f => f.type === 'Number').map(f => f.key);
  console.log(`${slug}: fields=${s.fields.length} numeric=${nums.length} bytes=${compact.length}`);
  console.log('   numeric: ' + nums.join(','));
  const keys = s.fields.map(f => f.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length) throw new Error(slug + ' duplicate keys: ' + dupes.join(','));
  const orders = s.fields.map(f => f.order);
  if (new Set(orders).size !== orders.length) throw new Error(slug + ' duplicate order');
}
console.log('OK');
