import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DNN_BASE_URL || "https://dnndefender.com";
const USERNAME = process.env.DNN_USER || "host";
const PASSWORD = process.env.DNN_PASSWORD;
const TEMPLATE_DIR =
  process.env.MEGAFORM_TEMPLATE_DIR ||
  path.resolve("tmp", "mf-install-01113", "Resources", "Templates");
const DRY_RUN = process.argv.includes("--dry-run");
const CHUNK_SIZE = Number(process.env.SEED_CHUNK_SIZE || 4);

const PORTAL_ID = 0;
const USER_ID = 1;
const APP_SCOPE = "dnn-install-01113-demo";
const DEFAULT_SKIN = "[G]Skins/Aperture/default.ascx";
const DEMO_SKIN = "[G]Skins/Aperture/2-Col-Left.ascx";
const DEFAULT_CONTAINER = "[G]Containers/Aperture/none.ascx";
const VIEW_CONFIG =
  '{"displayMode":"fixed","popup":{"triggerType":"time_delay","delaySeconds":5,"scrollPercent":50,"clickSelector":"","borderMode":"transparent_popup","showOncePerSession":true,"closeOnOverlay":true,"startAt":"","endAt":""}}';
const DEMO_ROOTS = [
  {
    key: "primary",
    tabName: "MegaForm",
    title: "MegaForm Demo Library",
    tabPath: "//MegaForm",
    navPath: "/MegaForm",
    menuLabel: "MegaForm",
    partLabel: "Part 1 of 2",
  },
  {
    key: "continue",
    tabName: "MegaForm Continue",
    title: "MegaForm Demo Library Continue",
    tabPath: "//MegaFormContinue",
    legacyTabPaths: ["//MegaForm-Continue"],
    navPath: "/MegaFormContinue",
    menuLabel: "MegaForm Continue",
    partLabel: "Part 2 of 2",
  },
];

if (!DRY_RUN && !PASSWORD) {
  throw new Error("Set DNN_PASSWORD before running this script.");
}

function parseMaybeJson(text) {
  let value = text;
  for (let i = 0; i < 3 && typeof value === "string"; i += 1) {
    try {
      value = JSON.parse(value);
    } catch {
      break;
    }
  }
  return value;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function truncate(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`.slice(0, maxLength);
}

function titleFromFile(fileName) {
  return path
    .basename(fileName, ".json")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

function slugify(value) {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "template";
}

function makeUnique(base, used) {
  let candidate = base;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sqlEscape(value) {
  return String(value ?? "").replace(/'/g, "''");
}

function sqlNString(value) {
  if (value === null || value === undefined) return "NULL";
  const text = String(value);
  if (text.length === 0) return "N''";
  const chunks = [];
  for (let i = 0; i < text.length; i += 3000) {
    chunks.push(text.slice(i, i + 3000));
  }
  return chunks
    .map((chunk, index) => {
      const literal = `N'${sqlEscape(chunk)}'`;
      return index === 0 && chunks.length > 1 ? `CAST(${literal} AS NVARCHAR(MAX))` : literal;
    })
    .join(" + ");
}

function sqlBit(value) {
  return value ? "1" : "0";
}

function sqlRootPathFilter() {
  const conditions = DEMO_ROOTS.flatMap((root) => [root.tabPath, ...(root.legacyTabPaths || [])])
    .map((tabPath) => `(TabPath = ${sqlNString(tabPath)} OR TabPath LIKE ${sqlNString(`${tabPath}//%`)})`);
  return conditions.join("\n         OR ");
}

function assignTemplateRoots(items) {
  const splitIndex = Math.ceil(items.length / DEMO_ROOTS.length);
  return items.map((item, index) => {
    const root = index < splitIndex ? DEMO_ROOTS[0] : DEMO_ROOTS[1];
    item.root = root;
    return item;
  });
}

function rootSqlVars(root) {
  const suffix = root.key === "primary" ? "" : "Continue";
  return {
    suffix,
    tab: `@Root${suffix}TabId`,
    module: `@Root${suffix}HtmlModuleId`,
  };
}

function resolveThemeKey(settings, template) {
  const selector = isPlainObject(settings.themeSelector)
    ? settings.themeSelector
    : isPlainObject(settings.ThemeSelector)
      ? settings.ThemeSelector
      : {};
  return firstString(
    selector.selectedThemeKey,
    selector.SelectedThemeKey,
    selector.defaultThemeKey,
    selector.DefaultThemeKey,
    settings.theme,
    settings.Theme,
    template.theme,
    template.Theme,
  );
}

function buildTemplateRecord(file, template, usedSlugs, titleCounts) {
  const rawSettings = isPlainObject(template.settings)
    ? cloneJson(template.settings)
    : isPlainObject(template.Settings)
      ? cloneJson(template.Settings)
      : {};
  const fields = Array.isArray(template.fields)
    ? cloneJson(template.fields)
    : Array.isArray(template.Fields)
      ? cloneJson(template.Fields)
      : Array.isArray(template.schema?.fields)
        ? cloneJson(template.schema.fields)
        : [];

  const sourceFile = path.basename(file);
  const baseTitle = firstString(template.title, template.Title, template.name, template.Name, titleFromFile(file));
  const titleIndex = (titleCounts.get(baseTitle.toLowerCase()) || 0) + 1;
  titleCounts.set(baseTitle.toLowerCase(), titleIndex);
  const title = titleIndex === 1 ? baseTitle : `${baseTitle} ${titleIndex}`;
  const slugBase = slugify(firstString(template.slug, template.Slug, path.basename(file, ".json")));
  const slug = makeUnique(slugBase, usedSlugs);

  const submitButtonText = firstString(
    template.submitButtonText,
    template.SubmitButtonText,
    rawSettings.submitButtonText,
    rawSettings.SubmitButtonText,
    "Submit",
  );
  const successMessage = firstString(
    template.successMessage,
    template.SuccessMessage,
    rawSettings.successMessage,
    rawSettings.SuccessMessage,
    "Thank you. We have received your submission.",
  );
  const customHtml = firstValue(
    template.customHtml,
    template.CustomHtml,
    rawSettings.customHtml,
    rawSettings.CustomHtml,
    "",
  );
  const customCss = firstValue(
    template.customCss,
    template.CustomCss,
    rawSettings.customCss,
    rawSettings.CustomCss,
    "",
  );
  const customScripts = firstValue(
    template.customScripts,
    template.CustomScripts,
    rawSettings.customScripts,
    rawSettings.CustomScripts,
    "",
  );
  const rules = firstValue(template.rules, template.Rules, rawSettings.rules, rawSettings.Rules, []);
  const workflow = firstValue(template.workflow, template.Workflow, rawSettings.workflowTemplate, rawSettings.WorkflowTemplate, null);

  const settings = {
    ...rawSettings,
    submitButtonText,
    successMessage,
    customHtml: typeof customHtml === "string" ? customHtml : "",
    customCss: typeof customCss === "string" ? customCss : "",
    rules: Array.isArray(rules) ? cloneJson(rules) : [],
    workflowTemplate: workflow == null ? null : cloneJson(workflow),
    installPackageSeed: {
      sourceFile,
      packageName: "MegaForm_01.07.113_Install.zip",
      resourcePath: `Resources.zip/Templates/${sourceFile}`,
      createdBy: "Codex live DNN seed",
    },
  };
  if (typeof customScripts === "string" && customScripts.trim()) {
    settings.customScripts = customScripts;
  }

  const schema = {
    version: firstString(template.version, template.Version, "1.0"),
    fields,
    settings,
  };

  const category = firstString(
    template.category,
    template.Category,
    Array.isArray(template.categories) ? template.categories[0] : "",
    Array.isArray(template.Categories) ? template.Categories[0] : "",
    "Template",
  );
  const description = firstString(
    template.description,
    template.Description,
    `Demo form generated from ${sourceFile}.`,
  );
  const theme = resolveThemeKey(settings, template);

  return {
    file: sourceFile,
    title,
    slug,
    category,
    description,
    fieldsCount: fields.length,
    theme,
    submitButtonText,
    successMessage,
    schemaJson: JSON.stringify(schema),
    settingsJson: JSON.stringify(settings),
    themeJson: "{}",
    workflowJson: workflow == null ? "" : JSON.stringify(workflow),
    requireAuth: Boolean(template.requireAuth || template.RequireAuth || rawSettings.requireAuth || rawSettings.RequireAuth),
    enableSaveResume: Boolean(template.enableSaveResume || template.EnableSaveResume || rawSettings.enableSaveResume || rawSettings.EnableSaveResume),
  };
}

function loadTemplates() {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    throw new Error(`Template directory not found: ${TEMPLATE_DIR}`);
  }
  const files = fs
    .readdirSync(TEMPLATE_DIR)
    .filter((file) => file.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  const usedSlugs = new Set();
  const titleCounts = new Map();
  return files.map((file) => {
    const fullPath = path.join(TEMPLATE_DIR, file);
    const template = JSON.parse(fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, ""));
    return buildTemplateRecord(file, template, usedSlugs, titleCounts);
  });
}

function buildDescriptionHtml(item) {
  const facts = [
    ["Source", `MegaForm_01.07.113_Install.zip / ${item.file}`],
    ["Category", item.category],
    ["Fields", String(item.fieldsCount)],
    ["Theme", item.theme || "template default"],
  ];
  const factHtml = facts
    .map(
      ([label, value]) =>
        `<dt style="font-weight:700;color:#24324a;margin-top:12px">${htmlEscape(label)}</dt><dd style="margin:4px 0 0;color:#42526b">${htmlEscape(value)}</dd>`,
    )
    .join("");
  return [
    '<section class="mf-demo-info" style="background:#fff;border:1px solid #d8dee9;border-radius:8px;padding:24px;box-shadow:0 6px 18px rgba(20,31,48,.08)">',
    `<p style="margin:0 0 10px;color:#6b778c;font-size:13px;text-transform:uppercase;letter-spacing:.04em">MegaForm template demo</p>`,
    `<h2 style="margin:0 0 14px;color:#152238;font-size:28px;line-height:1.2">${htmlEscape(item.title)}</h2>`,
    `<p style="margin:0 0 18px;color:#344563;line-height:1.55">${htmlEscape(item.description)}</p>`,
    `<dl style="margin:0">${factHtml}</dl>`,
    "</section>",
  ].join("");
}

function buildRootHtml(items, root) {
  const peer = DEMO_ROOTS.find((candidate) => candidate.key !== root.key);
  const links = items
    .map(
      (item) =>
        `<li style="margin:0 0 10px"><a href="/Default.aspx?tabid=${item.tabId}" style="font-weight:700;color:#0f6cbd;text-decoration:none">${htmlEscape(item.title)}</a><span style="color:#6b778c"> - ${htmlEscape(item.category)} / ${item.fieldsCount} fields</span></li>`,
    )
    .join("");
  return [
    '<section style="max-width:1180px;margin:0 auto;padding:32px 20px">',
    '<p style="margin:0 0 10px;color:#6b778c;font-size:13px;text-transform:uppercase;letter-spacing:.04em">MegaForm 01.07.113</p>',
    `<h1 style="margin:0 0 12px;color:#152238;font-size:38px;line-height:1.15">${htmlEscape(root.title)}</h1>`,
    `<p style="margin:0 0 10px;color:#6b778c;font-size:13px;text-transform:uppercase;letter-spacing:.04em">${htmlEscape(root.partLabel)} / ${items.length} templates</p>`,
    '<p style="margin:0 0 18px;color:#344563;font-size:17px;line-height:1.55">These demo pages were recreated from the form templates embedded in the MegaForm DNN install package. Each child page uses the DNN Aperture multi-column skin with a Text/HTML description on the left and a MegaForm render module on the right.</p>',
    peer
      ? `<p style="margin:0 0 26px;color:#344563;font-size:15px;line-height:1.5">More templates: <a href="${htmlEscape(peer.navPath)}" style="font-weight:700;color:#0f6cbd;text-decoration:none">${htmlEscape(peer.menuLabel)}</a></p>`
      : "",
    `<ol style="columns:2;column-gap:40px;margin:0;padding-left:22px">${links}</ol>`,
    "</section>",
  ].join("");
}

function buildPlaceholderRootHtml(root) {
  return [
    '<section style="max-width:1180px;margin:0 auto;padding:32px 20px">',
    `<h1 style="margin:0 0 12px;color:#152238;font-size:38px;line-height:1.15">${htmlEscape(root.title)}</h1>`,
    `<p style="margin:0 0 10px;color:#6b778c;font-size:13px;text-transform:uppercase;letter-spacing:.04em">${htmlEscape(root.partLabel)}</p>`,
    '<p style="margin:0;color:#344563;font-size:17px;line-height:1.55">Demo pages are being rebuilt from the MegaForm 01.07.113 install package templates.</p>',
    "</section>",
  ].join("");
}

function rootInsertSql(root, orderExpression) {
  const vars = rootSqlVars(root);
  const html = buildPlaceholderRootHtml(root);
  return `
  DECLARE ${vars.tab} INT;
  DECLARE ${vars.module} INT;

  INSERT INTO dbo.Tabs (
      TabOrder, PortalID, TabName, IsVisible, ParentId, DisableLink, Title, [Description], KeyWords,
      IsDeleted, Url, SkinSrc, ContainerSrc, IsSecure, PermanentRedirect, SiteMapPriority,
      CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate,
      CultureCode, [Level], TabPath, HasBeenPublished, IsSystem
  )
  VALUES (
      ${orderExpression}, @PortalId, ${sqlNString(root.tabName)}, 1, NULL, 0, ${sqlNString(root.title)},
      N'MegaForm demo pages recreated from the MegaForm 01.07.113 DNN install package templates.',
      N'MegaForm, DNN, forms, templates',
      0, NULL, @SkinDefault, @Container, 0, 0, 0.5,
      @UserId, @Now, @UserId, @Now,
      NULL, 0, ${sqlNString(root.tabPath)}, 1, 0
  );
  SET ${vars.tab} = CONVERT(INT, SCOPE_IDENTITY());

  INSERT INTO dbo.TabPermission (TabID, PermissionID, AllowAccess, RoleID, UserID, CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate)
  VALUES
      (${vars.tab}, 3, 1, -1, NULL, @UserId, @Now, @UserId, @Now),
      (${vars.tab}, 3, 1, 0, NULL, @UserId, @Now, @UserId, @Now),
      (${vars.tab}, 4, 1, 0, NULL, @UserId, @Now, @UserId, @Now);

  INSERT INTO dbo.Modules (ModuleDefID, AllTabs, IsDeleted, InheritViewPermissions, PortalID, CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate, LastContentModifiedOnDate)
  VALUES (114, 0, 0, 1, @PortalId, @UserId, @Now, @UserId, @Now, @Now);
  SET ${vars.module} = CONVERT(INT, SCOPE_IDENTITY());

  INSERT INTO dbo.TabModules (
      TabID, ModuleID, PaneName, ModuleOrder, CacheTime, Alignment, Color, Border, IconFile, Visibility,
      ContainerSrc, DisplayTitle, DisplayPrint, DisplaySyndicate,
      CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate, IsDeleted, CacheMethod, ModuleTitle, Header, Footer, CultureCode
  )
  VALUES (
      ${vars.tab}, ${vars.module}, N'ContentPane', 0, 1200, NULL, NULL, NULL, NULL, 0,
      @Container, 0, 0, 0,
      @UserId, @Now, @UserId, @Now, 0, NULL, ${sqlNString(root.title)}, NULL, NULL, NULL
  );

  INSERT INTO dbo.HtmlText (ModuleID, Content, Version, StateID, IsPublished, CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate, Summary)
  VALUES (${vars.module}, ${sqlNString(html)}, 1, 1, 1, @UserId, @Now, @UserId, @Now, ${sqlNString(`${root.title} index`)});
`;
}

function resetSql() {
  const rootInserts = DEMO_ROOTS.map((root, index) => rootInsertSql(root, `@RootOrder + ${index}`)).join("\n");
  return `
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRAN;

  DECLARE @PortalId INT = ${PORTAL_ID};
  DECLARE @UserId INT = ${USER_ID};
  DECLARE @Now DATETIME = GETDATE();
  DECLARE @SkinDefault NVARCHAR(200) = ${sqlNString(DEFAULT_SKIN)};
  DECLARE @Container NVARCHAR(200) = ${sqlNString(DEFAULT_CONTAINER)};
  DECLARE @AppScope NVARCHAR(50) = ${sqlNString(APP_SCOPE)};

  UPDATE dbo.PortalSettings
     SET SettingValue = @SkinDefault,
         LastModifiedByUserID = @UserId,
         LastModifiedOnDate = @Now
   WHERE PortalID = @PortalId
     AND SettingName IN (N'DefaultPortalSkin', N'DefaultAdminSkin');

  UPDATE dbo.PortalSettings
     SET SettingValue = @Container,
         LastModifiedByUserID = @UserId,
         LastModifiedOnDate = @Now
   WHERE PortalID = @PortalId
     AND SettingName IN (N'DefaultPortalContainer');

  UPDATE dbo.Tabs
     SET SkinSrc = @SkinDefault,
         LastModifiedByUserID = @UserId,
         LastModifiedOnDate = @Now
   WHERE PortalID = @PortalId
     AND ISNULL(IsDeleted, 0) = 0;

  DECLARE @OldTabs TABLE (TabID INT PRIMARY KEY);
  INSERT INTO @OldTabs (TabID)
  SELECT TabID
    FROM dbo.Tabs
   WHERE PortalID = @PortalId
     AND ISNULL(IsDeleted, 0) = 0
     AND (${sqlRootPathFilter()});

  DECLARE @OldModules TABLE (ModuleID INT PRIMARY KEY);
  INSERT INTO @OldModules (ModuleID)
  SELECT DISTINCT tm.ModuleID
    FROM dbo.TabModules tm
    JOIN @OldTabs ot ON ot.TabID = tm.TabID;

  UPDATE tm
     SET IsDeleted = 1,
         LastModifiedByUserID = @UserId,
         LastModifiedOnDate = @Now
    FROM dbo.TabModules tm
    JOIN @OldTabs ot ON ot.TabID = tm.TabID;

  UPDATE m
     SET IsDeleted = 1,
         LastModifiedByUserID = @UserId,
         LastModifiedOnDate = @Now
    FROM dbo.Modules m
    JOIN @OldModules om ON om.ModuleID = m.ModuleID
   WHERE NOT EXISTS (
         SELECT 1
           FROM dbo.TabModules tm
          WHERE tm.ModuleID = m.ModuleID
            AND ISNULL(tm.IsDeleted, 0) = 0
            AND NOT EXISTS (SELECT 1 FROM @OldTabs ot WHERE ot.TabID = tm.TabID)
   );

  UPDATE t
     SET IsDeleted = 1,
         SkinSrc = @SkinDefault,
         LastModifiedByUserID = @UserId,
         LastModifiedOnDate = @Now
    FROM dbo.Tabs t
    JOIN @OldTabs ot ON ot.TabID = t.TabID;

  DELETE mvc
    FROM dbo.MF_ModuleViewConfig mvc
    JOIN dbo.MF_Forms f ON f.FormId = mvc.FormId
   WHERE f.AppScope = @AppScope;

  DELETE FROM dbo.MF_Forms WHERE AppScope = @AppScope;

  DECLARE @RootOrder INT = ISNULL((SELECT MAX(TabOrder) FROM dbo.Tabs WHERE PortalID = @PortalId AND ParentId IS NULL), 0) + 1;
${rootInserts}

  COMMIT TRAN;

  SELECT N'ResetComplete' AS Section,
         @RootTabId AS RootTabID,
         @RootContinueTabId AS RootContinueTabID,
         (SELECT COUNT(1) FROM @OldTabs) AS SoftDeletedOldTabs,
         (SELECT COUNT(1) FROM dbo.Tabs WHERE PortalID = @PortalId AND ISNULL(IsDeleted, 0) = 0 AND SkinSrc LIKE N'%Aperture%') AS ActiveApertureTabs;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRAN;
  THROW;
END CATCH;
`;
}

function childSql(item, index) {
  const suffix = String(index).replace(/[^0-9]/g, "");
  const tab = `@TabId${suffix}`;
  const htmlModule = `@HtmlModuleId${suffix}`;
  const formModule = `@FormModuleId${suffix}`;
  const form = `@FormId${suffix}`;
  const order = `@TabOrder${suffix}`;
  const root = item.root || DEMO_ROOTS[0];
  const rootVars = rootSqlVars(root);
  const rootTab = rootVars.tab;
  const themeKey = item.theme || "";
  const descriptionHtml = buildDescriptionHtml(item);
  const tabPath = `${root.tabPath}//${item.slug}`;
  const tabDescription = truncate(`Demo page for the ${item.title} MegaForm template from MegaForm 01.07.113 install package.`, 500);
  return `
  DECLARE ${tab} INT;
  DECLARE ${htmlModule} INT;
  DECLARE ${formModule} INT;
  DECLARE ${form} INT;
  DECLARE ${order} INT = ISNULL((SELECT MAX(TabOrder) FROM dbo.Tabs WHERE PortalID = @PortalId AND ParentId = ${rootTab}), 0) + 1;

  INSERT INTO dbo.Tabs (
      TabOrder, PortalID, TabName, IsVisible, ParentId, DisableLink, Title, [Description], KeyWords,
      IsDeleted, Url, SkinSrc, ContainerSrc, IsSecure, PermanentRedirect, SiteMapPriority,
      CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate,
      CultureCode, [Level], TabPath, HasBeenPublished, IsSystem
  )
  VALUES (
      ${order}, @PortalId, ${sqlNString(truncate(item.title, 200))}, 1, ${rootTab}, 0,
      ${sqlNString(truncate(`${item.title} | MegaForm Demo`, 200))},
      ${sqlNString(tabDescription)},
      ${sqlNString(truncate(`MegaForm, ${item.category}, ${item.theme || "template"}`, 500))},
      0, NULL, @SkinDemo, @Container, 0, 0, 0.5,
      @UserId, @Now, @UserId, @Now,
      NULL, 1, ${sqlNString(tabPath)}, 1, 0
  );
  SET ${tab} = CONVERT(INT, SCOPE_IDENTITY());

  INSERT INTO dbo.TabPermission (TabID, PermissionID, AllowAccess, RoleID, UserID, CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate)
  VALUES
      (${tab}, 3, 1, -1, NULL, @UserId, @Now, @UserId, @Now),
      (${tab}, 3, 1, 0, NULL, @UserId, @Now, @UserId, @Now),
      (${tab}, 4, 1, 0, NULL, @UserId, @Now, @UserId, @Now);

  INSERT INTO dbo.Modules (ModuleDefID, AllTabs, IsDeleted, InheritViewPermissions, PortalID, CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate, LastContentModifiedOnDate)
  VALUES (114, 0, 0, 1, @PortalId, @UserId, @Now, @UserId, @Now, @Now);
  SET ${htmlModule} = CONVERT(INT, SCOPE_IDENTITY());

  INSERT INTO dbo.TabModules (
      TabID, ModuleID, PaneName, ModuleOrder, CacheTime, Alignment, Color, Border, IconFile, Visibility,
      ContainerSrc, DisplayTitle, DisplayPrint, DisplaySyndicate,
      CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate, IsDeleted, CacheMethod, ModuleTitle, Header, Footer, CultureCode
  )
  VALUES (
      ${tab}, ${htmlModule}, N'LeftPane', 0, 1200, NULL, NULL, NULL, NULL, 0,
      @Container, 0, 0, 0,
      @UserId, @Now, @UserId, @Now, 0, NULL, N'Template Description', NULL, NULL, NULL
  );

  INSERT INTO dbo.HtmlText (ModuleID, Content, Version, StateID, IsPublished, CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate, Summary)
  VALUES (${htmlModule}, ${sqlNString(descriptionHtml)}, 1, 1, 1, @UserId, @Now, @UserId, @Now, ${sqlNString(`${item.title} template description`)});

  INSERT INTO dbo.Modules (ModuleDefID, AllTabs, IsDeleted, InheritViewPermissions, PortalID, CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate, LastContentModifiedOnDate)
  VALUES (132, 0, 0, 1, @PortalId, @UserId, @Now, @UserId, @Now, @Now);
  SET ${formModule} = CONVERT(INT, SCOPE_IDENTITY());

  INSERT INTO dbo.TabModules (
      TabID, ModuleID, PaneName, ModuleOrder, CacheTime, Alignment, Color, Border, IconFile, Visibility,
      ContainerSrc, DisplayTitle, DisplayPrint, DisplaySyndicate,
      CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate, IsDeleted, CacheMethod, ModuleTitle, Header, Footer, CultureCode
  )
  VALUES (
      ${tab}, ${formModule}, N'ContentPane', 0, 0, NULL, NULL, NULL, NULL, 0,
      @Container, 0, 0, 0,
      @UserId, @Now, @UserId, @Now, 0, NULL, ${sqlNString(item.title)}, NULL, NULL, NULL
  );

  INSERT INTO dbo.MF_Forms (
      ModuleId, PortalId, Title, [Description], SchemaJson, SettingsJson, ThemeJson, [Status],
      SubmitButtonText, SuccessMessage, RedirectUrl, MaxSubmissions, ExpiresOnUtc,
      RequireAuth, EnableCaptcha, EnableSaveResume, WebhookUrl, WebhookSecret, WebhookHeaders,
      NotifyEmails, NotifyTemplate, AutoresponderEnabled, AutoresponderEmailField,
      AutoresponderSubject, AutoresponderBody, AppScope, CreatedByUserId, CreatedOnUtc,
      UpdatedByUserId, UpdatedOnUtc, WorkflowJson
  )
  VALUES (
      ${formModule}, @PortalId, ${sqlNString(truncate(item.title, 500))}, ${sqlNString(item.description)},
      ${sqlNString(item.schemaJson)}, ${sqlNString(item.settingsJson)}, ${sqlNString(item.themeJson)}, N'Published',
      ${sqlNString(truncate(item.submitButtonText, 200))}, ${sqlNString(item.successMessage)}, NULL, NULL, NULL,
      ${sqlBit(item.requireAuth)}, 0, ${sqlBit(item.enableSaveResume)}, NULL, NULL, NULL,
      NULL, NULL, 0, NULL,
      NULL, NULL, @AppScope, @UserId, SYSUTCDATETIME(),
      @UserId, SYSUTCDATETIME(), ${sqlNString(item.workflowJson)}
  );
  SET ${form} = CONVERT(INT, SCOPE_IDENTITY());

  INSERT INTO dbo.ModuleSettings (ModuleID, SettingName, SettingValue, CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate)
  VALUES
      (${formModule}, N'MegaForm_EnableAutoQrCode', N'false', @UserId, @Now, @UserId, @Now),
      (${formModule}, N'MegaForm_FormId', CONVERT(NVARCHAR(50), ${form}), @UserId, @Now, @UserId, @Now),
      (${formModule}, N'MegaForm_ModuleConfigured', N'true', @UserId, @Now, @UserId, @Now),
      (${formModule}, N'MegaForm_ModuleMode', N'render', @UserId, @Now, @UserId, @Now);

  ${themeKey ? `
  INSERT INTO dbo.ModuleSettings (ModuleID, SettingName, SettingValue, CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate)
  VALUES
      (${formModule}, N'MegaForm_SelectedThemePresetKey', ${sqlNString(themeKey)}, @UserId, @Now, @UserId, @Now),
      (${formModule}, N'SelectedThemePresetKey', ${sqlNString(themeKey)}, @UserId, @Now, @UserId, @Now);
  ` : ""}

  INSERT INTO dbo.MF_ModuleViewConfig (ModuleId, FormId, ViewType, ViewConfigJson, CssClass, CacheMinutes, PermissionsJson, CreatedOnUtc, ModifiedOnUtc)
  VALUES (${formModule}, ${form}, N'submit', ${sqlNString(VIEW_CONFIG)}, N'', 0, N'', SYSUTCDATETIME(), SYSUTCDATETIME());

  SELECT N'ChildCreated' AS Section,
         ${tab} AS TabID,
         ${htmlModule} AS HtmlModuleID,
         ${formModule} AS MegaFormModuleID,
         ${form} AS FormID,
         ${sqlNString(item.slug)} AS Slug,
         ${sqlNString(item.title)} AS Title,
         ${sqlNString(item.file)} AS SourceFile,
         ${sqlNString(item.category)} AS Category,
         ${Number(item.fieldsCount) || 0} AS FieldsCount,
         ${sqlNString(item.theme || "")} AS Theme,
         ${sqlNString(root.key)} AS RootKey,
         ${sqlNString(root.tabPath)} AS RootPath,
         ${sqlNString(root.menuLabel)} AS RootMenuLabel;
`;
}

function childBatchSql(items, startIndex) {
  const children = items.map((item, offset) => childSql(item, startIndex + offset + 1)).join("\n");
  return `
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRAN;

  DECLARE @PortalId INT = ${PORTAL_ID};
  DECLARE @UserId INT = ${USER_ID};
  DECLARE @Now DATETIME = GETDATE();
  DECLARE @SkinDemo NVARCHAR(200) = ${sqlNString(DEMO_SKIN)};
  DECLARE @Container NVARCHAR(200) = ${sqlNString(DEFAULT_CONTAINER)};
  DECLARE @AppScope NVARCHAR(50) = ${sqlNString(APP_SCOPE)};
  DECLARE @RootTabId INT = (
      SELECT TOP 1 TabID
        FROM dbo.Tabs
       WHERE PortalID = @PortalId
         AND ISNULL(IsDeleted, 0) = 0
         AND TabPath = N'//MegaForm'
       ORDER BY TabID DESC
  );
  DECLARE @RootContinueTabId INT = (
      SELECT TOP 1 TabID
        FROM dbo.Tabs
       WHERE PortalID = @PortalId
         AND ISNULL(IsDeleted, 0) = 0
         AND TabPath = ${sqlNString(DEMO_ROOTS[1].tabPath)}
       ORDER BY TabID DESC
  );

  IF @RootTabId IS NULL
      THROW 51000, 'Active //MegaForm root was not found.', 1;
  IF @RootContinueTabId IS NULL
      THROW 51002, 'Active //MegaFormContinue root was not found.', 1;

${children}

  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRAN;
  THROW;
END CATCH;
`;
}

function rootIndexSql(root, html) {
  return `
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRAN;
  DECLARE @PortalId INT = ${PORTAL_ID};
  DECLARE @UserId INT = ${USER_ID};
  DECLARE @Now DATETIME = GETDATE();
  DECLARE @RootTabId INT = (
      SELECT TOP 1 TabID
        FROM dbo.Tabs
       WHERE PortalID = @PortalId
         AND ISNULL(IsDeleted, 0) = 0
          AND TabPath = ${sqlNString(root.tabPath)}
       ORDER BY TabID DESC
  );
  DECLARE @RootHtmlModuleId INT = (
      SELECT TOP 1 tm.ModuleID
        FROM dbo.TabModules tm
        JOIN dbo.Modules m ON m.ModuleID = tm.ModuleID
       WHERE tm.TabID = @RootTabId
         AND ISNULL(tm.IsDeleted, 0) = 0
         AND ISNULL(m.IsDeleted, 0) = 0
         AND m.ModuleDefID = 114
       ORDER BY tm.ModuleOrder, tm.TabModuleID
  );

  IF @RootHtmlModuleId IS NULL
      THROW 51001, 'Root HTML module was not found.', 1;

  UPDATE dbo.HtmlText
     SET Content = ${sqlNString(html)},
         LastModifiedByUserID = @UserId,
         LastModifiedOnDate = @Now,
         Summary = ${sqlNString(`${root.title} 01.07.113 demo index`)}
   WHERE ModuleID = @RootHtmlModuleId;

  COMMIT TRAN;

  SELECT N'RootIndexUpdated' AS Section,
         ${sqlNString(root.key)} AS RootKey,
         ${sqlNString(root.tabPath)} AS RootPath,
         @RootTabId AS RootTabID,
         @RootHtmlModuleId AS RootHtmlModuleID;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRAN;
  THROW;
END CATCH;
`;
}

async function loginAndGetSession() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/?ctl=Login&returnurl=%2f`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator("#dnn_ctr_Login_Login_DNN_txtUsername").fill(USERNAME);
  await page.locator("#dnn_ctr_Login_Login_DNN_txtPassword").fill(PASSWORD);
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {}),
    page.locator("#dnn_ctr_Login_Login_DNN_cmdLogin").click(),
  ]);
  await page.waitForTimeout(1500);

  const session = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const token =
      document.querySelector('input[name="__RequestVerificationToken"]')?.value ||
      window.jQuery?.ServicesFramework?.(-1)?.getAntiForgeryValue?.() ||
      "";
    const tabId = window.dnn?.getVar?.("sf_tabId", "-1") || "-1";
    return { loggedIn: /Logout|SuperUser Account/i.test(text), token, tabId };
  });
  if (!session.loggedIn) {
    throw new Error("Login did not reach a host session.");
  }
  if (!session.token) {
    throw new Error("Could not find DNN request verification token.");
  }

  const cookies = await context.cookies(BASE_URL);
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return { browser, session, cookieHeader };
}

async function apiFetch(cookieHeader, session, endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Cookie: cookieHeader,
      RequestVerificationToken: session.token,
      TabId: String(session.tabId || "-1"),
      "X-Requested-With": "XMLHttpRequest",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const parsed = parseMaybeJson(text);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 1200)}`);
  }
  return parsed;
}

async function getSqlConnection(cookieHeader, session) {
  const saved = await apiFetch(cookieHeader, session, "/API/personaBar/SqlConsole/GetSavedQueries", {
    method: "GET",
  });
  const connection = saved.connections?.[0] || saved.Connections?.[0] || "";
  if (!connection) {
    throw new Error(`Could not resolve SQL connection from ${JSON.stringify(saved).slice(0, 500)}`);
  }
  return connection;
}

async function runSql(cookieHeader, session, connection, query, label) {
  const result = await apiFetch(cookieHeader, session, "/API/personaBar/SqlConsole/RunQuery", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ connection, query }),
  });
  if (result.Error || result.error) {
    throw new Error(`${label} failed: ${result.Error || result.error}`);
  }
  return result;
}

function resultRows(result) {
  const data = result.Data || result.data || [];
  return Array.isArray(data) ? data.flatMap((table) => (Array.isArray(table) ? table : [])) : [];
}

async function clearCache(cookieHeader, session) {
  try {
    const result = await apiFetch(cookieHeader, session, "/API/personaBar/Command/Cmd", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ cmdLine: "clear-cache", currentPage: "/" }),
    });
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function main() {
  const templates = assignTemplateRoots(loadTemplates());
  if (templates.length === 0) {
    throw new Error(`No JSON templates found in ${TEMPLATE_DIR}`);
  }

  const planned = {
    templateDir: TEMPLATE_DIR,
    count: templates.length,
    skinDefault: DEFAULT_SKIN,
    skinDemo: DEMO_SKIN,
    container: DEFAULT_CONTAINER,
    appScope: APP_SCOPE,
    roots: DEMO_ROOTS.map((root) => ({
      key: root.key,
      tabName: root.tabName,
      tabPath: root.tabPath,
      plannedTemplates: templates.filter((item) => item.root?.key === root.key).length,
    })),
    firstFive: templates.slice(0, 5).map((item) => ({
      title: item.title,
      slug: item.slug,
      file: item.file,
      root: item.root?.menuLabel,
      fieldsCount: item.fieldsCount,
      theme: item.theme,
      schemaBytes: Buffer.byteLength(item.schemaJson, "utf8"),
    })),
    totalSchemaBytes: templates.reduce((sum, item) => sum + Buffer.byteLength(item.schemaJson, "utf8"), 0),
  };

  if (DRY_RUN) {
    console.log(JSON.stringify({ dryRun: true, planned }, null, 2));
    return;
  }

  const { browser, session, cookieHeader } = await loginAndGetSession();
  const created = [];
  try {
    const connection = await getSqlConnection(cookieHeader, session);
    console.log(JSON.stringify({ step: "login", ok: true, tabId: session.tabId, templateCount: templates.length }));

    const resetResult = await runSql(cookieHeader, session, connection, resetSql(), "reset");
    console.log(JSON.stringify({ step: "reset", rows: resultRows(resetResult) }));

    for (let i = 0; i < templates.length; i += CHUNK_SIZE) {
      const chunk = templates.slice(i, i + CHUNK_SIZE);
      const label = `children ${i + 1}-${i + chunk.length}`;
      const result = await runSql(cookieHeader, session, connection, childBatchSql(chunk, i), label);
      const rows = resultRows(result).filter((row) => row.Section === "ChildCreated");
      created.push(...rows.map((row) => ({
        title: row.Title,
        slug: row.Slug,
        file: row.SourceFile,
        category: row.Category,
        fieldsCount: Number(row.FieldsCount || 0),
        theme: row.Theme,
        rootKey: row.RootKey,
        rootPath: row.RootPath,
        rootMenuLabel: row.RootMenuLabel,
        tabId: row.TabID,
        formId: row.FormID,
        megaFormModuleId: row.MegaFormModuleID,
        htmlModuleId: row.HtmlModuleID,
      })));
      console.log(JSON.stringify({ step: "childBatch", label, created: rows.length, totalCreated: created.length }));
    }

    for (const root of DEMO_ROOTS) {
      const rootItems = created.filter((item) => item.rootKey === root.key);
      const rootHtml = buildRootHtml(rootItems, root);
      const rootResult = await runSql(cookieHeader, session, connection, rootIndexSql(root, rootHtml), `root index ${root.key}`);
      console.log(JSON.stringify({ step: "rootIndex", root: root.key, rows: resultRows(rootResult) }));
    }

    const cache = await clearCache(cookieHeader, session);
    console.log(JSON.stringify({ step: "clearCache", ...cache }));

    console.log(JSON.stringify({
      ok: true,
      planned,
      createdCount: created.length,
      created,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
