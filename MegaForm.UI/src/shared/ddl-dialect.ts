// [DDL-dialect 2026-06-12] Per-database CREATE TABLE instruction blocks, injected into the
// AI system prompt so the AI emits provider-correct DDL instead of always the MSSQL
// `[dbo]`/IDENTITY shape (which 400s on SQLite: "unknown database [dbo]", and is wrong for
// MySQL/Postgres). Shared by BOTH AI surfaces: the dashboard "Create with AI" modal
// (dashboard/ai-form-creator.ts) and the in-builder AI chat (ai-form-assistant/chat.ts).
// The active provider is detected once via GET /api/.../AiTools/DbProvider.

export const DDL_DIALECTS: Record<string, string> = {
  sqlite:
    '🔴 ACTIVE DATABASE = SQLite. AUTHORITATIVE DDL DIALECT — this OVERRIDES every [dbo]/IDENTITY/NVARCHAR/DATETIME2 example anywhere below. Every CREATE TABLE you emit (app_batch tables[].ddl) MUST be SQLite syntax:\n' +
    '• NO schema prefix → `CREATE TABLE Members (...)` NOT `CREATE TABLE [dbo].[Members]`.\n' +
    '• Auto PK → `Id INTEGER PRIMARY KEY AUTOINCREMENT` NOT `[Id] INT IDENTITY(1,1)`.\n' +
    '• Types → TEXT (not NVARCHAR/VARCHAR), INTEGER (not INT), REAL, NUMERIC.\n' +
    "• Timestamp default → `CreatedOnUtc TEXT DEFAULT (datetime('now'))` NOT DATETIME2/SYSUTCDATETIME().\n" +
    '• FK → inline `ClassId INTEGER REFERENCES Classes(Id)` (no CONSTRAINT/[dbo] names; ON DELETE optional).\n' +
    "• Canonical → `CREATE TABLE Members (Id INTEGER PRIMARY KEY AUTOINCREMENT, FullName TEXT NOT NULL, Email TEXT, ClassId INTEGER REFERENCES Classes(Id), CreatedOnUtc TEXT DEFAULT (datetime('now')))`. Keep `tableName`/`schemaName` plain (no \"dbo\").",
  mssql:
    '🔴 ACTIVE DATABASE = SQL Server (MSSQL). Use the bracketed `[dbo].[Table]` shape with `[Id] INT IDENTITY(1,1) PRIMARY KEY`, NVARCHAR/INT/DATETIME2, `DATETIME2 DEFAULT SYSUTCDATETIME()`, and `[ParentId] INT NULL CONSTRAINT FK_… FOREIGN KEY REFERENCES [dbo].[Parents]([Id])`. The [dbo]/IDENTITY examples below are correct for you.',
  mysql:
    '🔴 ACTIVE DATABASE = MySQL. Every CREATE TABLE MUST be MySQL syntax (the [dbo]/IDENTITY examples below are MSSQL — DO NOT use them):\n' +
    '• NO `[dbo].`/brackets. Auto PK → `Id INT AUTO_INCREMENT PRIMARY KEY` (NOT IDENTITY).\n' +
    '• Types → VARCHAR(n) (not NVARCHAR), INT, DATETIME (not DATETIME2). Timestamp → `CreatedOnUtc DATETIME DEFAULT CURRENT_TIMESTAMP`.\n' +
    '• FK → `FOREIGN KEY (ClassId) REFERENCES Classes(Id)`.\n' +
    '• Example → `CREATE TABLE Members (Id INT AUTO_INCREMENT PRIMARY KEY, FullName VARCHAR(120) NOT NULL, Email VARCHAR(200), ClassId INT, CreatedOnUtc DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (ClassId) REFERENCES Classes(Id))`.',
  postgres:
    '🔴 ACTIVE DATABASE = PostgreSQL. Every CREATE TABLE MUST be PostgreSQL syntax (the [dbo]/IDENTITY examples below are MSSQL — DO NOT use them):\n' +
    '• lowercase identifiers, NO `[dbo].`/brackets. Auto PK → `id SERIAL PRIMARY KEY` (NOT IDENTITY).\n' +
    '• Types → VARCHAR(n)/TEXT, INTEGER, TIMESTAMP (not DATETIME2). Timestamp → `created_on_utc TIMESTAMP DEFAULT now()`.\n' +
    '• FK → `class_id INTEGER REFERENCES classes(id)`.\n' +
    '• Example → `CREATE TABLE members (id SERIAL PRIMARY KEY, full_name VARCHAR(120) NOT NULL, email VARCHAR(200), class_id INTEGER REFERENCES classes(id), created_on_utc TIMESTAMP DEFAULT now())`.',
};

let __dialectCache: string | null = null;
let __providerKeyCache: string | null = null;

/** Map a raw provider string from the backend to one of our dialect keys. */
export function mapProviderToKey(p: string): 'sqlite' | 'mysql' | 'postgres' | 'mssql' | '' {
  const s = String(p || '').toLowerCase();
  if (s.includes('sqlite')) return 'sqlite';
  if (s.includes('mysql') || s.includes('maria')) return 'mysql';
  if (s.includes('postgre') || s.includes('npgsql')) return 'postgres';
  if (s.includes('sqlserver') || s.includes('mssql') || s === 'sql' || s.includes('sqlclient')) return 'mssql';
  return '';
}

/** Resolve the AiTools base URL the same way the tool layer does (ops.ts getAiBaseLocal):
 * Oqtane → `/api/` (route is /api/AiTools, NOT /api/MegaForm/AiTools), DNN → DesktopModules. */
function aiToolsBase(): string {
  const w = window as any;
  const platform = w.__MF_PLATFORM__ || {};
  if (typeof platform.aiApiBase === 'string' && platform.aiApiBase) return String(platform.aiApiBase).replace(/\/+$/, '/');
  if (String(platform.platform || '').toLowerCase() === 'oqtane' || w.Oqtane || w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) return '/api/';
  return '/DesktopModules/MegaForm/API/';
}

/** Detect the active DashboardDatabase provider key (cached): sqlite | mysql | postgres | mssql | ''. */
export async function getDbProviderKey(siteId?: number): Promise<'sqlite' | 'mysql' | 'postgres' | 'mssql' | ''> {
  if (__providerKeyCache !== null) return __providerKeyCache;
  try {
    const w = window as any;
    const platform = w.__MF_PLATFORM__ || {};
    const sid = siteId || platform.siteId || platform.SiteId || 1;
    const r = await fetch(aiToolsBase() + 'AiTools/DbProvider?siteId=' + sid, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const j = await r.json();
    __providerKeyCache = mapProviderToKey(String((j && j.provider) || ''));
  } catch {
    __providerKeyCache = '';
  }
  return __providerKeyCache;
}

/** Detect the active DashboardDatabase provider (cached) and return its DDL-dialect block.
 * Resolves the AiTools base the SAME way the tool layer does (ops.ts getAiBaseLocal):
 * Oqtane → `/api/` (route is /api/AiTools, NOT /api/MegaForm/AiTools), DNN → DesktopModules. */
export async function ensureDbDialect(siteId?: number): Promise<string> {
  if (__dialectCache !== null) return __dialectCache;
  const key = await getDbProviderKey(siteId);
  __dialectCache = key ? DDL_DIALECTS[key] : '';
  return __dialectCache;
}
