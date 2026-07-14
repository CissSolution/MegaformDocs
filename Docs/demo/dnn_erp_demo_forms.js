// Creates the three ERP demo forms through the DNN MegaForm API (Form/Save).
// Run inside the DNN admin page context (needs the antiforgery token from ServicesFramework).
// Returns the created form ids.
(async () => {
  const API = '/DesktopModules/MegaForm/API/';
  const MODULE_ID = 385;
  const PORTAL_ID = 0;
  const CONN = 'DashboardDatabase';

  const sf = window.jQuery && window.jQuery.ServicesFramework ? window.jQuery.ServicesFramework(MODULE_ID) : null;
  const headers = { 'Content-Type': 'application/json' };
  if (sf) headers.RequestVerificationToken = sf.getAntiForgeryValue();

  const sqlSelect = (key, label, sql, required) => ({
    key, type: 'Select', label, required: !!required,
    placeholder: 'Select…',
    properties: {
      optionsSource: 'sql',
      optionsType: 'sql',
      optionsConnectionKey: CONN,     // ⚠ omit this and the dropdown silently returns []
      optionsDatabaseType: 'SqlServer',
      optionsSql: sql
    }
  });

  const forms = [
    {
      title: 'Store',
      description: 'Register a store. Country and Currency come from the master tables.',
      schema: {
        version: '1.0',
        fields: [
          { key: 'store_code', type: 'Text', label: 'Store Code', required: true, placeholder: 'ST-001' },
          { key: 'store_name', type: 'Text', label: 'Store Name', required: true },
          { key: 'city', type: 'Text', label: 'City' },
          sqlSelect('country_code', 'Country', 'SELECT CountryCode AS value, CountryName AS label FROM dbo.MFDemo_Country ORDER BY CountryName', true),
          sqlSelect('currency_code', 'Currency', 'SELECT CurrencyCode AS value, CurrencyName AS label FROM dbo.MFDemo_Currency ORDER BY CurrencyCode', true),
          { key: 'manager', type: 'Text', label: 'Store Manager' }
        ],
        settings: {
          databaseInsert: {
            enabled: true,
            connectionKey: CONN,
            databaseType: 'SqlServer',
            insertSql: 'INSERT INTO [dbo].[MFDemo_Store] ([SubmissionId],[StoreCode],[StoreName],[City],[CountryCode],[CurrencyCode],[Manager]) VALUES (:_submissionId, :store_code, :store_name, :city, :country_code, :currency_code, :manager)',
            parameterMapping: {
              ':_submissionId': '_submissionId',
              ':store_code': 'store_code',
              ':store_name': 'store_name',
              ':city': 'city',
              ':country_code': 'country_code',
              ':currency_code': 'currency_code',
              ':manager': 'manager'
            }
          }
        }
      }
    },
    {
      title: 'Vendor',
      description: 'Register a vendor.',
      schema: {
        version: '1.0',
        fields: [
          { key: 'vendor_code', type: 'Text', label: 'Vendor Code', required: true, placeholder: 'VN-001' },
          { key: 'vendor_name', type: 'Text', label: 'Vendor Name', required: true },
          { key: 'contact_email', type: 'Email', label: 'Contact Email' },
          { key: 'phone', type: 'Text', label: 'Phone' },
          sqlSelect('country_code', 'Country', 'SELECT CountryCode AS value, CountryName AS label FROM dbo.MFDemo_Country ORDER BY CountryName', true),
          { key: 'tax_id', type: 'Text', label: 'Tax ID' }
        ],
        settings: {
          databaseInsert: {
            enabled: true,
            connectionKey: CONN,
            databaseType: 'SqlServer',
            insertSql: 'INSERT INTO [dbo].[MFDemo_Vendor] ([SubmissionId],[VendorCode],[VendorName],[ContactEmail],[Phone],[CountryCode],[TaxId]) VALUES (:_submissionId, :vendor_code, :vendor_name, :contact_email, :phone, :country_code, :tax_id)',
            parameterMapping: {
              ':_submissionId': '_submissionId',
              ':vendor_code': 'vendor_code',
              ':vendor_name': 'vendor_name',
              ':contact_email': 'contact_email',
              ':phone': 'phone',
              ':country_code': 'country_code',
              ':tax_id': 'tax_id'
            }
          }
        }
      }
    },
    {
      title: 'Transaction',
      description: 'Record a purchase transaction and upload the vendor receipt. An invoice is issued automatically.',
      schema: {
        version: '1.0',
        fields: [
          sqlSelect('store_code', 'Store', 'SELECT StoreCode AS value, StoreName AS label FROM dbo.MFDemo_Store ORDER BY StoreName', true),
          sqlSelect('vendor_code', 'Vendor', 'SELECT VendorCode AS value, VendorName AS label FROM dbo.MFDemo_Vendor ORDER BY VendorName', true),
          sqlSelect('country_code', 'Country', 'SELECT CountryCode AS value, CountryName AS label FROM dbo.MFDemo_Country ORDER BY CountryName', true),
          sqlSelect('currency_code', 'Currency', 'SELECT CurrencyCode AS value, CurrencyName AS label FROM dbo.MFDemo_Currency ORDER BY CurrencyCode', true),
          { key: 'amount', type: 'Number', label: 'Amount', required: true, placeholder: '0.00' },
          { key: 'txn_date', type: 'Date', label: 'Transaction Date', required: true },
          { key: 'receipt', type: 'File', label: 'Vendor Receipt', required: true,
            properties: { accept: '.pdf,.png,.jpg,.jpeg', maxSizeMb: 5 } },
          { key: 'notes', type: 'Textarea', label: 'Notes' }
        ],
        settings: {
          databaseInsert: {
            enabled: true,
            connectionKey: CONN,
            databaseType: 'SqlServer',
            insertSql: 'INSERT INTO [dbo].[MFDemo_Transaction] ([SubmissionId],[TxnRef],[StoreCode],[VendorCode],[CountryCode],[CurrencyCode],[Amount],[TxnDate],[ReceiptFile],[Notes]) VALUES (:_submissionId, CONCAT(N\'TXN-\', :_submissionId), :store_code, :vendor_code, :country_code, :currency_code, :amount, :txn_date, :receipt, :notes)',
            parameterMapping: {
              ':_submissionId': '_submissionId',
              ':store_code': 'store_code',
              ':vendor_code': 'vendor_code',
              ':country_code': 'country_code',
              ':currency_code': 'currency_code',
              ':amount': 'amount',
              ':txn_date': 'txn_date',
              ':receipt': 'receipt',
              ':notes': 'notes'
            }
          }
        }
      }
    }
  ];

  const created = [];
  for (const f of forms) {
    const body = {
      FormId: 0,
      ModuleId: MODULE_ID,
      PortalId: PORTAL_ID,
      Title: f.title,
      Description: f.description,
      Status: 'Published',
      SchemaJson: JSON.stringify(f.schema),
      SettingsJson: JSON.stringify(f.schema.settings),
      SubmitButtonText: 'Submit'
    };
    const r = await fetch(API + 'Form/Save', {
      method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify(body)
    });
    const text = await r.text();
    created.push({ title: f.title, status: r.status, body: text.slice(0, 160) });
  }
  return created;
})()
