// [B8.B v20260601-01] Build starter-kit .zip manifests for ExportApp/ImportApp.
//
// Produces ZIPs in DesktopModules/MegaForm/starters/ at the installed DNN site
// and a copy under MegaForm.DNN/StarterKits/dist for source-tree provenance.
//
// Each kit ships with: manifest.json, forms/<id>.json, ddl/<table>.sql,
// kb/index.json, README.md — exactly what /AiTools/ImportApp consumes.
//
// Runs offline, no DB, no AI.

import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createWriteStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// node has no zip stdlib in older versions — use PowerShell's Compress-Archive
// (every Windows install has it, including the QA boxes).

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const dist = join(repoRoot, 'MegaForm.DNN', 'StarterKits', 'dist');
const installedSite = 'E:\\DNN_SITES\\DNN10322_MegaF\\Website\\DesktopModules\\MegaForm\\starters';

mkdirSync(dist, { recursive: true });
try { mkdirSync(installedSite, { recursive: true }); } catch { /* maybe site missing */ }

// ─────────────────────────────────────────────────────────────────
// Kit 1 — Purchase Order
//   2 forms (Vendor, PO) + 2 tables, FK from PO → Vendor
// ─────────────────────────────────────────────────────────────────
const purchaseOrder = {
  app: {
    slug: 'purchase-order',
    title: 'Purchase Order',
    description: 'Vendor registry + 5-role purchase-order workflow with conditional CFO branch when amount > 50K USD.',
    color: '#6366f1',
  },
  forms: [
    {
      id: 1, title: 'Vendor',
      schemaJson: JSON.stringify({
        fields: [
          { key: 'vendor_name',  label: 'Vendor name',  type: 'Text',  required: true },
          { key: 'tax_id',       label: 'Tax ID',       type: 'Text' },
          { key: 'contact_name', label: 'Contact name', type: 'Text' },
          { key: 'contact_email',label: 'Contact email',type: 'Email' },
          { key: 'phone',        label: 'Phone',        type: 'Tel' },
          { key: 'address',      label: 'Address',      type: 'Textarea' },
          { key: 'is_active',    label: 'Active',       type: 'Boolean', defaultValue: true },
        ],
        appScope: 'purchase-order',
      }),
      settingsJson: JSON.stringify({
        databaseInsert: {
          enabled: true,
          connectionKey: 'DashboardDatabase',
          insertSql: "INSERT INTO [dbo].[PO_Vendors] ([vendor_name],[tax_id],[contact_name],[contact_email],[phone],[address],[is_active]) VALUES (@vendor_name,@tax_id,@contact_name,@contact_email,@phone,@address,@is_active);",
        },
      }),
    },
    {
      id: 2, title: 'Purchase Order',
      schemaJson: JSON.stringify({
        fields: [
          { key: 'po_number', label: 'PO #', type: 'Text', required: true },
          { key: 'vendor_id', label: 'Vendor', type: 'Select', required: true,
            properties: {
              optionsSource: 'sql',
              optionsConnectionKey: 'DashboardDatabase',
              optionsSql: 'SELECT [Id] AS value, [vendor_name] AS label FROM [dbo].[PO_Vendors] WHERE [is_active] = 1 ORDER BY [vendor_name]',
            } },
          { key: 'order_date', label: 'Order date',  type: 'Date', required: true },
          { key: 'total_usd',  label: 'Total (USD)', type: 'Number', required: true },
          { key: 'currency',   label: 'Currency',    type: 'Select',
            options: [
              { value: 'USD', label: 'USD' },
              { value: 'VND', label: 'VND' },
              { value: 'EUR', label: 'EUR' },
            ] },
          { key: 'status',     label: 'Status',  type: 'Select',
            options: [
              { value: 'draft',    label: 'Draft' },
              { value: 'pending',  label: 'Pending approval' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'paid',     label: 'Paid' },
            ] },
          { key: 'description',label: 'Description', type: 'Textarea' },
        ],
        appScope: 'purchase-order',
      }),
      settingsJson: JSON.stringify({
        databaseInsert: {
          enabled: true,
          connectionKey: 'DashboardDatabase',
          insertSql: "INSERT INTO [dbo].[PO_Orders] ([po_number],[vendor_id],[order_date],[total_usd],[currency],[status],[description]) VALUES (@po_number,@vendor_id,@order_date,@total_usd,@currency,@status,@description);",
        },
      }),
    },
  ],
  ddl: {
    PO_Vendors: `IF OBJECT_ID('[dbo].[PO_Vendors]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[PO_Vendors] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [vendor_name] NVARCHAR(200) NOT NULL,
        [tax_id] NVARCHAR(50) NULL,
        [contact_name] NVARCHAR(200) NULL,
        [contact_email] NVARCHAR(200) NULL,
        [phone] NVARCHAR(50) NULL,
        [address] NVARCHAR(MAX) NULL,
        [is_active] BIT NOT NULL CONSTRAINT DF_PO_Vendors_active DEFAULT 1,
        [created_on] DATETIME2 NOT NULL CONSTRAINT DF_PO_Vendors_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_PO_Vendors PRIMARY KEY ([Id])
    );
END;`,
    PO_Orders: `IF OBJECT_ID('[dbo].[PO_Orders]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[PO_Orders] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [po_number] NVARCHAR(60) NOT NULL,
        [vendor_id] INT NOT NULL,
        [order_date] DATE NOT NULL,
        [total_usd] DECIMAL(18,2) NOT NULL,
        [currency] NVARCHAR(10) NULL,
        [status] NVARCHAR(20) NULL,
        [description] NVARCHAR(MAX) NULL,
        [created_on] DATETIME2 NOT NULL CONSTRAINT DF_PO_Orders_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_PO_Orders PRIMARY KEY ([Id]),
        CONSTRAINT FK_PO_Orders_Vendor FOREIGN KEY ([vendor_id]) REFERENCES [dbo].[PO_Vendors]([Id])
    );
END;`,
  },
  kb: [
    {
      slug: 'starter-purchase-order',
      kind: 'starter_kit',
      title: 'Starter kit — Purchase Order',
      summary: 'Vendor registry + PO form. PO.vendor_id is an FK Select wired to PO_Vendors via optionsSql.',
      body: 'Use as the canonical 1:N pattern. Parent = Vendor, child = PO. Cascading FK Select uses canonical shape (optionsSource:sql + optionsSql + optionsConnectionKey). Re-importing the kit is safe — CREATE TABLE is IF NOT EXISTS guarded.',
      tags: 'starter-purchase-order,canonical,fk,relational',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// Kit 2 — Recruitment
//   3 linked forms (Job Posting, Candidate, Interview Feedback) +
//   3 tables with FK chain Candidate.job_id → Posting,
//   Interview.candidate_id → Candidate.
// ─────────────────────────────────────────────────────────────────
const recruitment = {
  app: {
    slug: 'recruitment',
    title: 'Recruitment Pipeline',
    description: 'Multi-form app: Job Posting → Candidate Application → Interview Feedback. 3 linked forms, shared roles, cross-linked sample data.',
    color: '#0ea5e9',
  },
  forms: [
    {
      id: 1, title: 'Job Posting',
      schemaJson: JSON.stringify({
        fields: [
          { key: 'job_title',  label: 'Job title',  type: 'Text', required: true },
          { key: 'department', label: 'Department', type: 'Text' },
          { key: 'location',   label: 'Location',   type: 'Text' },
          { key: 'description',label: 'Description',type: 'Textarea' },
          { key: 'min_salary', label: 'Min salary (USD)', type: 'Number' },
          { key: 'max_salary', label: 'Max salary (USD)', type: 'Number' },
          { key: 'status',     label: 'Status', type: 'Select',
            options: [
              { value: 'open',  label: 'Open' },
              { value: 'paused',label: 'Paused' },
              { value: 'filled',label: 'Filled' },
              { value: 'closed',label: 'Closed' },
            ] },
        ],
        appScope: 'recruitment',
      }),
      settingsJson: JSON.stringify({
        databaseInsert: {
          enabled: true,
          connectionKey: 'DashboardDatabase',
          insertSql: "INSERT INTO [dbo].[RC_Jobs] ([job_title],[department],[location],[description],[min_salary],[max_salary],[status]) VALUES (@job_title,@department,@location,@description,@min_salary,@max_salary,@status);",
        },
      }),
    },
    {
      id: 2, title: 'Candidate Application',
      schemaJson: JSON.stringify({
        fields: [
          { key: 'job_id',    label: 'Job', type: 'Select', required: true,
            properties: {
              optionsSource: 'sql',
              optionsConnectionKey: 'DashboardDatabase',
              optionsSql: "SELECT [Id] AS value, [job_title] AS label FROM [dbo].[RC_Jobs] WHERE [status] = 'open' ORDER BY [job_title]",
            } },
          { key: 'full_name', label: 'Full name', type: 'Text', required: true },
          { key: 'email',     label: 'Email',     type: 'Email', required: true },
          { key: 'phone',     label: 'Phone',     type: 'Tel' },
          { key: 'resume_url',label: 'Resume URL',type: 'Url' },
          { key: 'cover_letter', label: 'Cover letter', type: 'Textarea' },
          { key: 'stage',     label: 'Stage', type: 'Select',
            options: [
              { value: 'applied',     label: 'Applied' },
              { value: 'screening',   label: 'Phone screen' },
              { value: 'interviewing',label: 'Interviewing' },
              { value: 'offer',       label: 'Offer extended' },
              { value: 'hired',       label: 'Hired' },
              { value: 'rejected',    label: 'Rejected' },
            ] },
        ],
        appScope: 'recruitment',
      }),
      settingsJson: JSON.stringify({
        databaseInsert: {
          enabled: true,
          connectionKey: 'DashboardDatabase',
          insertSql: "INSERT INTO [dbo].[RC_Candidates] ([job_id],[full_name],[email],[phone],[resume_url],[cover_letter],[stage]) VALUES (@job_id,@full_name,@email,@phone,@resume_url,@cover_letter,@stage);",
        },
      }),
    },
    {
      id: 3, title: 'Interview Feedback',
      schemaJson: JSON.stringify({
        fields: [
          { key: 'candidate_id', label: 'Candidate', type: 'Select', required: true,
            properties: {
              optionsSource: 'sql',
              optionsConnectionKey: 'DashboardDatabase',
              optionsSql: "SELECT [Id] AS value, [full_name] AS label FROM [dbo].[RC_Candidates] WHERE [stage] IN ('interviewing','offer') ORDER BY [full_name]",
            } },
          { key: 'interviewer', label: 'Interviewer', type: 'Text', required: true },
          { key: 'round',       label: 'Round',  type: 'Number' },
          { key: 'rating',      label: 'Rating (1-5)', type: 'Number', required: true },
          { key: 'recommendation', label: 'Recommendation', type: 'Select',
            options: [
              { value: 'strong_yes', label: 'Strong yes' },
              { value: 'yes',        label: 'Yes' },
              { value: 'maybe',      label: 'Maybe' },
              { value: 'no',         label: 'No' },
              { value: 'strong_no',  label: 'Strong no' },
            ] },
          { key: 'notes', label: 'Notes', type: 'Textarea' },
        ],
        appScope: 'recruitment',
      }),
      settingsJson: JSON.stringify({
        databaseInsert: {
          enabled: true,
          connectionKey: 'DashboardDatabase',
          insertSql: "INSERT INTO [dbo].[RC_Feedback] ([candidate_id],[interviewer],[round],[rating],[recommendation],[notes]) VALUES (@candidate_id,@interviewer,@round,@rating,@recommendation,@notes);",
        },
      }),
    },
  ],
  ddl: {
    RC_Jobs: `IF OBJECT_ID('[dbo].[RC_Jobs]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[RC_Jobs] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [job_title] NVARCHAR(200) NOT NULL,
        [department] NVARCHAR(100) NULL,
        [location] NVARCHAR(100) NULL,
        [description] NVARCHAR(MAX) NULL,
        [min_salary] DECIMAL(18,2) NULL,
        [max_salary] DECIMAL(18,2) NULL,
        [status] NVARCHAR(20) NULL,
        [created_on] DATETIME2 NOT NULL CONSTRAINT DF_RC_Jobs_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_RC_Jobs PRIMARY KEY ([Id])
    );
END;`,
    RC_Candidates: `IF OBJECT_ID('[dbo].[RC_Candidates]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[RC_Candidates] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [job_id] INT NOT NULL,
        [full_name] NVARCHAR(200) NOT NULL,
        [email] NVARCHAR(200) NULL,
        [phone] NVARCHAR(50) NULL,
        [resume_url] NVARCHAR(500) NULL,
        [cover_letter] NVARCHAR(MAX) NULL,
        [stage] NVARCHAR(20) NULL,
        [created_on] DATETIME2 NOT NULL CONSTRAINT DF_RC_Candidates_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_RC_Candidates PRIMARY KEY ([Id]),
        CONSTRAINT FK_RC_Candidates_Job FOREIGN KEY ([job_id]) REFERENCES [dbo].[RC_Jobs]([Id])
    );
END;`,
    RC_Feedback: `IF OBJECT_ID('[dbo].[RC_Feedback]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[RC_Feedback] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [candidate_id] INT NOT NULL,
        [interviewer] NVARCHAR(200) NOT NULL,
        [round] INT NULL,
        [rating] INT NULL,
        [recommendation] NVARCHAR(20) NULL,
        [notes] NVARCHAR(MAX) NULL,
        [created_on] DATETIME2 NOT NULL CONSTRAINT DF_RC_Feedback_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_RC_Feedback PRIMARY KEY ([Id]),
        CONSTRAINT FK_RC_Feedback_Candidate FOREIGN KEY ([candidate_id]) REFERENCES [dbo].[RC_Candidates]([Id])
    );
END;`,
  },
  kb: [
    {
      slug: 'starter-recruitment',
      kind: 'starter_kit',
      title: 'Starter kit — Recruitment Pipeline',
      summary: '3-form pipeline: Job → Candidate → Interview Feedback. Two cascading FK Selects.',
      body: 'Canonical multi-form template. RC_Candidates.job_id → RC_Jobs.Id, RC_Feedback.candidate_id → RC_Candidates.Id. Both FK Selects use optionsSource:sql + optionsSql + optionsConnectionKey, the only shape the runtime renderer reads.',
      tags: 'starter-recruitment,multi-form,fk-chain,canonical',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// Kit 3 — Blog
//   2 forms (Post, Comment) + 2 tables, Comment.post_id → Post.
// ─────────────────────────────────────────────────────────────────
const blog = {
  app: {
    slug: 'blog',
    title: 'Blog Publishing',
    description: 'Lightweight blog: Posts + Comments. FK Select on Comment.post_id wired to BL_Posts.',
    color: '#10b981',
  },
  forms: [
    {
      id: 1, title: 'Blog Post',
      schemaJson: JSON.stringify({
        fields: [
          { key: 'slug',    label: 'URL slug',  type: 'Text', required: true },
          { key: 'title',   label: 'Title',     type: 'Text', required: true },
          { key: 'author',  label: 'Author',    type: 'Text' },
          { key: 'summary', label: 'Summary',   type: 'Textarea' },
          { key: 'body',    label: 'Body',      type: 'Textarea' },
          { key: 'status',  label: 'Status', type: 'Select',
            options: [
              { value: 'draft',     label: 'Draft' },
              { value: 'review',    label: 'In review' },
              { value: 'published', label: 'Published' },
              { value: 'archived',  label: 'Archived' },
            ] },
          { key: 'published_on', label: 'Published on', type: 'Date' },
        ],
        appScope: 'blog',
      }),
      settingsJson: JSON.stringify({
        databaseInsert: {
          enabled: true,
          connectionKey: 'DashboardDatabase',
          insertSql: "INSERT INTO [dbo].[BL_Posts] ([slug],[title],[author],[summary],[body],[status],[published_on]) VALUES (@slug,@title,@author,@summary,@body,@status,@published_on);",
        },
      }),
    },
    {
      id: 2, title: 'Blog Comment',
      schemaJson: JSON.stringify({
        fields: [
          { key: 'post_id', label: 'Post', type: 'Select', required: true,
            properties: {
              optionsSource: 'sql',
              optionsConnectionKey: 'DashboardDatabase',
              optionsSql: "SELECT [Id] AS value, [title] AS label FROM [dbo].[BL_Posts] WHERE [status] = 'published' ORDER BY [published_on] DESC",
            } },
          { key: 'author_name',  label: 'Your name',  type: 'Text', required: true },
          { key: 'author_email', label: 'Your email', type: 'Email' },
          { key: 'comment',      label: 'Comment',    type: 'Textarea', required: true },
          { key: 'is_approved',  label: 'Approved',   type: 'Boolean', defaultValue: false },
        ],
        appScope: 'blog',
      }),
      settingsJson: JSON.stringify({
        databaseInsert: {
          enabled: true,
          connectionKey: 'DashboardDatabase',
          insertSql: "INSERT INTO [dbo].[BL_Comments] ([post_id],[author_name],[author_email],[comment],[is_approved]) VALUES (@post_id,@author_name,@author_email,@comment,@is_approved);",
        },
      }),
    },
  ],
  ddl: {
    BL_Posts: `IF OBJECT_ID('[dbo].[BL_Posts]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[BL_Posts] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [slug] NVARCHAR(200) NOT NULL,
        [title] NVARCHAR(400) NOT NULL,
        [author] NVARCHAR(200) NULL,
        [summary] NVARCHAR(MAX) NULL,
        [body] NVARCHAR(MAX) NULL,
        [status] NVARCHAR(20) NULL,
        [published_on] DATE NULL,
        [created_on] DATETIME2 NOT NULL CONSTRAINT DF_BL_Posts_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_BL_Posts PRIMARY KEY ([Id])
    );
END;`,
    BL_Comments: `IF OBJECT_ID('[dbo].[BL_Comments]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[BL_Comments] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [post_id] INT NOT NULL,
        [author_name] NVARCHAR(200) NOT NULL,
        [author_email] NVARCHAR(200) NULL,
        [comment] NVARCHAR(MAX) NOT NULL,
        [is_approved] BIT NOT NULL CONSTRAINT DF_BL_Comments_approved DEFAULT 0,
        [created_on] DATETIME2 NOT NULL CONSTRAINT DF_BL_Comments_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_BL_Comments PRIMARY KEY ([Id]),
        CONSTRAINT FK_BL_Comments_Post FOREIGN KEY ([post_id]) REFERENCES [dbo].[BL_Posts]([Id])
    );
END;`,
  },
  kb: [
    {
      slug: 'starter-blog',
      kind: 'starter_kit',
      title: 'Starter kit — Blog Publishing',
      summary: 'Posts + Comments with FK from Comment to Post.',
      body: 'Showcases content-app shape. BL_Comments.post_id FK Select uses canonical optionsSource:sql shape — the only kind the runtime renderer reads.',
      tags: 'starter-blog,content,fk',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// Build each kit into a .zip
// ─────────────────────────────────────────────────────────────────
function buildKit(kit, name) {
  const stage = join(dist, '__stage__', name);
  // wipe stage
  try { spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', stage], { stdio: 'ignore' }); } catch {}
  mkdirSync(stage, { recursive: true });

  // manifest.json
  const manifest = {
    schemaVersion: '1.0',
    exportedOnUtc: '2026-06-01T00:00:00Z',  // pinned — deterministic builds
    app: kit.app,
    forms: kit.forms.map(f => ({ id: f.id, title: f.title, file: `forms/${f.id}.json` })),
    tables: Object.keys(kit.ddl).map(t => ({ name: t, file: `ddl/${t}.sql` })),
    kb: { count: kit.kb.length, file: 'kb/index.json' },
  };
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // forms/
  mkdirSync(join(stage, 'forms'), { recursive: true });
  for (const f of kit.forms) {
    writeFileSync(join(stage, 'forms', `${f.id}.json`), JSON.stringify(f, null, 2));
  }

  // ddl/  — prefix each filename with a 2-digit index so the dispatcher
  // executes them in declaration order (parents before children for FK).
  mkdirSync(join(stage, 'ddl'), { recursive: true });
  let i = 0;
  for (const [t, sql] of Object.entries(kit.ddl)) {
    const pad = String((++i) * 10).padStart(3, '0');
    writeFileSync(join(stage, 'ddl', `${pad}_${t}.sql`), sql);
  }

  // kb/
  mkdirSync(join(stage, 'kb'), { recursive: true });
  writeFileSync(join(stage, 'kb', 'index.json'), JSON.stringify(kit.kb, null, 2));

  // README.md
  writeFileSync(join(stage, 'README.md'),
    `# MegaForm starter — ${kit.app.title}\n\nSlug: \`${kit.app.slug}\`\n\n` +
    `Forms: ${kit.forms.length}  ·  Tables: ${Object.keys(kit.ddl).length}  ·  KB: ${kit.kb.length}\n\n` +
    `## Install\n\nDashboard → Custom Apps → Starter kits → ${kit.app.title} → Install.\n` +
    `Or POST the .zip to \`/AiTools/ImportApp\`.\n`);

  // Zip via PowerShell Compress-Archive
  const zipPath = join(dist, `${name}.zip`);
  try { spawnSync('cmd', ['/c', 'del', '/q', zipPath], { stdio: 'ignore' }); } catch {}
  const ps = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Compress-Archive -Path "${stage}\\*" -DestinationPath "${zipPath}" -Force`
  ], { stdio: 'inherit' });
  if (ps.status !== 0) {
    console.error(`Compress-Archive failed for ${name}`);
    process.exit(1);
  }

  // Mirror to installed site for instant testing
  if (existsSync(installedSite)) {
    const target = join(installedSite, `${name}.zip`);
    copyFileSync(zipPath, target);
    console.log(`  · copied to ${target}`);
  }
}

console.log('[B8.B] Building starter kits…');
buildKit(purchaseOrder, 'purchase-order');
buildKit(recruitment,   'recruitment');
buildKit(blog,          'blog');
console.log('[B8.B] Done. Kits in ' + dist);
