# Audit Typed SQL Storage Widget Coverage - 2026-07-18

> STATUS UPDATE (Claude, 2026-07-18): Da verify tung claim voi code that va fix 3 gap LIVE
> (FileUpload -> MF_Files; display-only skip; SplitRawValue list/object). Chi tiet + phan biet
> LIVE vs THEORETICAL: `CLAUDE_HANDOFF_20260718_TYPED_STORAGE_WIDGET_SEMANTICS_FIX.md`.
> Luu y: `DateTimePicker` = THEORETICAL (0 hit trong code), chi them guard. 117/117 test pass.
> Browser-QA acceptance (§Ban giao) CHUA chay — la next step.


## Muc tieu

Kiem tra thiet ke SQL table typed-storage va code hien nay da dap ung duoc cac widget/phien ban field phuc tap nhu DataJson cu hay chua, dac biet:

- Calendar / date-time picker
- File upload
- Data repeater / grid repeater / data grid
- Terms/privacy consent
- Cac widget display-only va composite khac

Pham vi: audit only, khong sua code.

## Ket luan ngan

Chua the coi typed SQL storage hien nay da tuong duong DataJson cu cho tat ca widget phuc tap.

Thiet ke table typed-storage da co nen mong tot vi co:

- `MF_SubmissionFields`: field-scoped record, 1 row cho moi logical field.
- `MF_SubmissionValueString`, `MF_SubmissionValueLongText`, `MF_SubmissionValueNumber`, `MF_SubmissionValueDate`, `MF_SubmissionValueBoolean`.
- `MF_SubmissionValueJson`: JSON field-scoped cho control phuc tap, khong phai legacy `MF_Submissions.DataJson`.

Tuy nhien code surface hien nay van thieu mot lop "field type semantics/canonicalization" dung chung giua Core, UI, AI assistant, file extractor, dashboard/query va SDK. Vi vay cac field alias nhu `FileUpload`, `DateTimePicker`, `TermsPrivacy`, `DataGrid`, `GridRepeater`, `DataRepeater`, `QRCode` chua duoc xu ly thong nhat. Neu du lieu duoc gui dung kieu canonical thi nhieu truong van luu duoc qua JSON fallback, nhung chua du de noi la parity voi DataJson cu.

## Bang doi chieu widget

| Widget / field | Tinh trang hien nay | Danh gia |
| --- | --- | --- |
| `Date` calendar picker | UI canonical hien tai la `Date` + property `datePickerMode` (`date-only`, `date-time`, `month-year`). Normalizer map `Date`, `DateTime`, `Time`, `DateRange`, `Appointment` vao `SubmissionValueDate`. | OK neu schema dung `Date`. |
| `DateTimePicker` | Xuat hien trong UI nhu internal/legacy naming, nhung khong phai registered field plugin canonical. Normalizer khong map rieng, nen roi vao `Json`. | Chua OK. Date dashboard/filter se miss neu AI/schema tao type nay. |
| `Calendar` | Trong code chu yeu la view/integration/display concept: Google Calendar provider, starter view, SQL calendar template. Khong phai input field canonical. | Khong nen luu nhu field input. Neu schema tao type `Calendar`, hien se roi vao JSON fallback va khong vao date index. |
| `File` | UI renderer collect hidden JSON metadata. Normalizer map `File` vao `Json`. File meta extractor nhan `File` va `PdfForm` de tao row trong `MF_Files`. | Gan OK cho canonical `File`. Can test round-trip day du. |
| `FileUpload` | Co xuat hien trong starter/backend (`ProposalStarterService`) va AI/domain wording, nhung extractor chi nhan `File`, `PdfForm`; collect/validation special-case cung theo `File`. | Chua OK. De gay loi upload metadata/MF_Files hoac render sai neu schema dung alias nay. |
| `DataRepeater` | UI plugin comment ro la display-only, `collect()` tra `null`, query data tu SQL/API. Normalizer hien khong skip type nay, nen co the tao field row JSON null. | Chua sach. Nen skip trong submission storage neu display-only. |
| `GridRepeater` | Legacy/editable widget co hidden input JSON `{"rows":[...]}` va `collect()` tra JSON string. Normalizer khong map explicit, nen default `Json`. | Co the chay neu value la JSON string, nhung chua du chac. Can explicit mapping va tests. |
| `DataGrid` | Editable DataGrid collect JSON array; neu `useSql` thi display/read-only. Normalizer khong map explicit, default `Json`. | Co the chay trong happy path, nhung chua co semantic ro: editable thi luu JSON, SQL display thi skip. |
| `TermsPrivacy` | Builder catalog mo ta can luu JSON audit trail `{consent, version, marketingOptIn, timestamp, labelText}`. Core enum/normalizer chua map explicit, renderer handler khong thay ro. | Chua OK. Nen explicit `Json`, hoac them bool projection cho consent neu can query. |
| `QRCode` | Widget display-only, `collect()` tra `undefined`. Normalizer khong skip explicit. | Chua sach. Nen skip storage. |
| `Signature` | Normalizer map `Signature` vao `LongText` va danh dau sensitive. Neu payload la data-url string thi OK. Neu payload object/metadata thi khong dung comment "JSON complex controls". | Can quyet dinh schema chuan va test. |
| `Address`, `FullName`, `PhoneIntl`, `Composite` | Normalizer map vao `Json`. Reconstructor parse JSON string thanh JToken/JObject. | OK ve luu raw object, nhung subfield query/filter chua first-class. |
| `MultiColumnCombo` | Normalizer map vao `String`. Neu value chi la selected key/text thi OK. Neu UI gui selected object thi co nguy co mat shape. | Can xac nhan contract value. |

## Nguyen nhan chinh

### 1. Chua co canonical field type registry dung chung

Hien tai mapping nam rai rac:

- UI field plugins co ten canonical rieng.
- AI assistant/co prompt rules co the sinh alias khac.
- `SubmissionFieldNormalizer.ResolveDataType()` co danh sach type rieng.
- `SubmissionFileMetaExtractor` co danh sach file-like rieng.
- Renderer/validation co special-case rieng cho `File`, `Date`, `Signature`.
- Dashboard/indexer lai co mapping rieng cho date/number/text.

Ket qua: `File` va `FileUpload`, `Date` va `DateTimePicker`, display-only `DataRepeater` va editable `DataGrid` khong duoc hieu nhu nhau.

### 2. JSON fallback giup "khong mat het", nhung chua du parity

`SubmissionValueJson` la escape hatch dung, nhung chi bao toan shape tot khi raw value la:

- JSON string hop le.
- Newtonsoft `JObject` / `JArray` / `JToken`.
- Dictionary duoc serialize thanh JSON.

Trong `SplitRawValue`, neu raw la mot `IEnumerable` object phuc tap, moi item co the bi `ToString()` thanh chuoi nhu `System.Collections.Generic.Dictionary...`, gay mat cau truc. Day la rui ro cho repeater/data grid/file payload neu den tu server-side object/list thay vi JSON string.

### 3. File upload con phu thuoc vao alias

File upload khong chi can luu JSON field value. No con can:

- UI collect metadata JSON.
- Server extract metadata.
- Ghi `MF_Files`.
- Reconstruct value cho dashboard/API.

Hien extractor chi nhan `File` va `PdfForm`. Vi vay alias `FileUpload` chua dat parity voi DataJson cu.

### 4. Display-only widget dang bi normalize nhu input

`DataRepeater` va `QRCode` la display-only, khong submit data. Neu normalizer tao typed field/value row cho chung thi database bi nhieu va dashboard/API co the hien truong rong khong dung nghia.

### 5. SDK/API van con DataJson-centric

SDK hien van submit/update qua `SubmissionInfo.DataJson` serialization. Oqtane co bridge hydrate/collapse tu typed rows, DNN van parallel-write giu `DataJson`. Nghia la typed-storage chua tro thanh contract SDK/API duy nhat. Neu bo DataJson legacy ngay luc nay se anh huong cac service con doc `submission.DataJson`.

## Danh gia theo cau hoi "co thay duoc DataJson cu chua?"

### Da dap ung mot phan

Typed SQL table design co the luu:

- Scalar string/number/date/bool.
- Multi-value field qua nhieu row typed value.
- Complex object/array qua `SubmissionValueJson`.
- Field-scoped JSON thay vi submission-wide JSON.

Neu form schema dung canonical type va frontend gui JSON string hop le, cac widget nhu `File`, `Address`, `FullName`, editable `DataGrid`, `GridRepeater` co kha nang round-trip qua typed JSON.

### Chua dap ung day du

Chua dat parity DataJson cu cho:

- Alias field type do AI/starter sinh ra (`FileUpload`, `DateTimePicker`).
- Display-only widget can skip (`DataRepeater`, `QRCode`).
- Editable repeater/data grid khi raw value la CLR list/object thay vi JSON string.
- File upload end-to-end `MF_Files` voi alias.
- Terms/privacy consent audit trail.
- Query/filter/dashboard theo subfield trong JSON complex controls.
- Loai bo hoan toan `DataJson` trong DNN va SDK.

## Kien truc bo sung toi thieu de dat parity

### 1. Them Core field semantics registry

Nen tao mot lop Core dung chung, vi du `SubmissionFieldTypeSemantics`, va moi noi dung chung phai di qua lop nay.

No nen tra ve:

- `CanonicalType`: vi du `FileUpload -> File`, `DateTimePicker -> Date`.
- `StorageDataType`: String, LongText, Number, Date, Boolean, Json.
- `IsDisplayOnly`: true cho `DataRepeater`, `QRCode`, cac widget view-only.
- `IsFileLike`: true cho `File`, `FileUpload`, `PdfForm`.
- `IsEditableRepeater`: true cho `DataGrid` editable, `GridRepeater`.
- `IsSqlDisplayWidget`: true neu `DataGrid.useSql` hoac `DataRepeater` chi hien data.
- `NeedsJsonPreserve`: true cho composite/file/payment/repeater/terms/privacy.

Quan trong: dung mot nguon truth cho normalizer, file extractor, dashboard, SDK metadata va AI schema validation.

### 2. Chuan hoa alias truoc khi luu

Can map explicit:

- `FileUpload` -> canonical `File`, storage `Json`, file-like true.
- `DateTimePicker` -> canonical `Date`, storage `Date`.
- `CalendarDatePicker` neu co -> canonical `Date`, storage `Date`.
- `TermsPrivacy` -> storage `Json`.
- `DataGrid` editable -> storage `Json`.
- `GridRepeater` -> storage `Json`.
- `DataRepeater` display-only -> skip.
- `QRCode` display-only -> skip.

Khong nen dung default JSON nhu mot cach "im lang chap nhan moi thu" cho production dashboard, vi dashboard/query can biet field nay la date, file, repeater hay display-only.

### 3. Sua JSON normalization de bao toan object/list

`SplitRawValue` can:

- Nhan `System.Text.Json.JsonElement` / `JsonDocument`.
- Neu raw la `IEnumerable` cua object phuc tap, serialize ca collection thanh mot JSON array neu storage type la Json.
- Neu item la dictionary/object, serialize item thanh JSON, khong dung `item.ToString()`.
- Giu nguyen JSON string hop le.

Muc tieu: repeater/file/grid data khong bi bien thanh string .NET type name.

### 4. File upload end-to-end

Can dong bo:

- Renderer/validation collect cho canonical file-like type, khong hard-code chi `File`.
- `SubmissionFileMetaExtractor.FileFieldTypes` dung semantics registry.
- Starter/AI khong sinh `FileUpload` nua, hoac neu sinh thi Core canonicalize thanh `File`.
- Tests phai assert vua co `SubmissionValueJson`, vua co `MF_Files`.

### 5. Repeater/data grid rule

Nen chia ro:

- `DataRepeater`: display-only, query SQL/API, khong submit, khong tao typed submission value.
- `GridRepeater`: legacy editable repeater, luu JSON rows.
- `DataGrid`: neu editable thi luu JSON rows; neu `useSql`/read-only thi skip submission storage.

Dashboard/API nen hien repeater JSON duoi dang array/rows, khong ep thanh text.

### 6. Terms/privacy rule

Can chot contract:

```json
{
  "consent": true,
  "version": "2026-07",
  "marketingOptIn": false,
  "timestamp": "2026-07-18T10:00:00Z",
  "labelText": "I agree..."
}
```

Luu raw object vao `SubmissionValueJson`. Neu dashboard can filter consent nhanh, co the them synthetic/derived bool field hoac index rieng, nhung khong thay the JSON audit trail.

## Test matrix can co truoc khi noi "parity"

1. `Date` voi `datePickerMode=date-time` ghi vao `MF_SubmissionValueDate`, reconstruct lai dung date/time.
2. `DateTimePicker` alias cung ghi vao `MF_SubmissionValueDate`, khong roi vao JSON.
3. `File` upload metadata JSON ghi vao `SubmissionValueJson` va tao row `MF_Files`.
4. `FileUpload` alias cho ket qua giong `File`.
5. `GridRepeater` payload `{"rows":[{"sku":"A1","qty":2}]}` round-trip dung shape.
6. `DataGrid` editable JSON array round-trip dung shape.
7. `DataGrid` read-only SQL va `DataRepeater` display-only khong tao submission value rong.
8. CLR `List<Dictionary<string,object>>` duoc serialize JSON dung, khong thanh `.ToString()`.
9. `TermsPrivacy` luu JSON audit trail va reconstruct dung object.
10. `QRCode` display-only khong vao submission storage.
11. `Signature` data-url string va, neu support, object payload duoc xu ly theo contract da chot.
12. DNN va Oqtane cung co ket qua typed rows giong nhau cho cung payload.

## Ket luan hanh dong cho phien sau

Viec can lam tiep khong phai doi table truoc. Table hien tai da du de chua scalar va complex field-scoped JSON.

Viec can lam la lam chat contract code:

1. Tao field semantics/canonicalization Core dung chung.
2. Doi normalizer, file extractor, renderer schema handling, dashboard/query dung semantics do.
3. Sua JSON splitting de khong lam mat object/list.
4. Them test matrix cho advanced widgets.
5. Sau khi test pass moi tinh toi viec giam phu thuoc `DataJson` trong SDK/DNN.

Neu khong lam cac buoc tren, typed SQL storage van co nguy co chi chay tot voi form don gian, con cac widget phuc tap se phu thuoc may man vao viec UI gui JSON string dung shape nhu DataJson cu.

## Ban giao cho Claude phien sau

Claude phai tiep tuc theo huong audit nay bang cach tao form test thuc te, submit bang browser, va doi chieu database/API/UI. Khong chi sua unit test hoac suy luan tu code.

### Yeu cau form test bat buoc

Tao it nhat 3 form test trong Oqtane va, neu dang co moi truong DNN san sang, tao lai cung bo form tren DNN.

#### Form A - Scalar va date controls

Form nay can co:

- Text
- Email
- Phone
- Number
- Currency
- Rating
- Checkbox
- Switch
- Select
- MultiSelect
- Date picker mode `date-only`
- Date picker mode `date-time`
- Time
- DateRange
- Appointment
- Neu UI/AI co the sinh alias, them case rieng `DateTimePicker` de xac nhan canonicalization.

Muc tieu: xac nhan cac value vao dung typed table String/Number/Boolean/Date va reconstruct dung.

#### Form B - File, composite, consent va signature

Form nay can co:

- File upload canonical `File`
- File upload alias `FileUpload` neu schema/AI co the sinh
- Address
- FullName
- PhoneIntl
- Country
- Signature
- Terms
- TermsPrivacy
- Hidden
- RichText/Textarea

Muc tieu: xac nhan file metadata vao `SubmissionValueJson`, file row vao `MF_Files`, composite object reconstruct dung, consent audit trail khong bi mat.

#### Form C - Repeater, grid va display-only widgets

Form nay can co:

- Editable `DataGrid`
- Legacy/editable `GridRepeater` neu van support
- Display-only `DataRepeater`
- QRCode display-only
- DynamicLabel/display text neu form builder co
- Razor widget neu dang support hidden/emitted value

Muc tieu: xac nhan editable grid/repeater luu JSON rows dung shape, con display-only widgets khong tao submission value rong/vo nghia.

### Du lieu submit mau

Claude can submit toi thieu 2 records moi form bang browser:

- Record 1 dung day du value hop le.
- Record 2 co multi-value va edge cases: bo trong optional field, nhieu file neu support, repeater/grid co it nhat 2 rows, date-time co gio/phut khac mac dinh, TermsPrivacy co marketing opt-in false.

Khong duoc chi goi API truc tiep cho lan test dau. Phai thao tac qua browser de kiem tra renderer, collect value, validation, upload, submit flow va dashboard.

### Browser acceptance script

1. Mo trang Oqtane test site.
2. Tao moi form bang Form Wizard hoac Builder.
3. Them day du field theo Form A, B, C.
4. Save form.
5. Mo form public/runtime view.
6. Nhap data bang browser nhu nguoi dung that.
7. Upload file that cho field `File` va `FileUpload`.
8. Them 2 rows vao DataGrid/GridRepeater.
9. Submit form.
10. Mo submission dashboard/inbox hoac API dashboard view.
11. Xac nhan record moi hien thi dung display value.
12. Goi API/SDK read submission neu co surface API san sang.
13. Doi chieu SQL typed tables.
14. Neu Oqtane pass, lap lai tren DNN neu moi truong DNN dang chay.

### SQL acceptance checks

Voi moi submission moi, Claude can kiem tra:

- Co row trong `MF_Submissions`.
- Co field rows tuong ung trong `MF_SubmissionFields`.
- Scalar text/email/select vao `MF_SubmissionValueString` hoac `MF_SubmissionValueLongText`.
- Number/currency/rating vao `MF_SubmissionValueNumber`.
- Date/date-time/time/date-range/appointment vao `MF_SubmissionValueDate`.
- Checkbox/switch/terms vao `MF_SubmissionValueBoolean`.
- File/composite/repeater/grid/terms privacy vao `MF_SubmissionValueJson`.
- File upload co row trong `MF_Files`.
- Display-only `DataRepeater` va `QRCode` khong tao value row rong neu da them skip logic.
- Reconstructed submission data qua API/UI match payload nguoi dung da submit.

### Acceptance criteria

Claude chi duoc ket luan "typed SQL parity dat yeu cau" khi tat ca dieu kien sau dat:

- Form A, B, C submit thanh cong bang browser tren Oqtane.
- Khong can reload/save module setting thu cong de form hoat dong.
- Dashboard/submission dashboard hien dung data moi submit.
- API/SDK doc surface doc duoc submission data reconstructed khong can doc legacy `DataJson`.
- `File` va `FileUpload` deu upload, submit, reconstruct va tao `MF_Files` dung.
- `Date` date-time va `DateTimePicker` alias deu vao typed Date storage, khong roi vao JSON sai nghia.
- Editable DataGrid/GridRepeater round-trip dung array/rows, khong bien thanh string `.ToString()`.
- Display-only widgets khong lam ban submission bi nhieu bang value rong.
- Oqtane va DNN co cung behavior hoac neu DNN chua support thi phai ghi ro gap con lai.
- Co anh chup/browser evidence hoac log buoc test kem SQL/API evidence.

### Output Claude phai giao lai

Claude phai cap nhat handout hoac tao audit follow-up moi, bao gom:

- Danh sach file code da sua.
- Danh sach form test da tao.
- Link URL form runtime/dashboard da test.
- SubmissionId cua moi record test.
- Bang SQL nao co row nao cho tung widget.
- Cac bug con lai va muc do uu tien.
- Ket luan ro: dat parity, dat mot phan, hay chua dat.
