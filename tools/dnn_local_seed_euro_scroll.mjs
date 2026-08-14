import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
// GALLERY-PUBLISHED is the hand-off/canonical snapshot requested for continuing the work.
// Seed DNN from that directory directly so the files kept for recovery are
// exactly the source used by the live visual-QA pages.
const templateDir = path.join(repo, "Samples", "FormTemplates", "Premium", "GALLERY-PUBLISHED");
const outputArg = process.argv.indexOf("--out");
const outputFile = outputArg >= 0 ? path.resolve(process.argv[outputArg + 1]) : null;
const slugs = [
  "realestate-registration",
  "botanical-thankyou",
  "kawaii-diary",
  "cv-registration",
];
const appScope = "codex-euro-scroll-20260724";
const rootPath = "//EuroScrollQA";
const viewConfig = {
  displayMode: "fixed",
  popup: {
    triggerType: "time_delay",
    delaySeconds: 5,
    scrollPercent: 50,
    clickSelector: "",
    borderMode: "transparent_popup",
    showOncePerSession: true,
    closeOnOverlay: true,
    startAt: "",
    endAt: "",
  },
};

function sqlString(value) {
  if (value == null) return "NULL";
  const text = String(value);
  const chunks = [];
  for (let index = 0; index < text.length; index += 3000) {
    chunks.push(text.slice(index, index + 3000));
  }
  if (!chunks.length) return "N''";
  return chunks
    .map((chunk, index) => {
      const literal = `N'${chunk.replaceAll("'", "''")}'`;
      return index === 0 && chunks.length > 1 ? `CAST(${literal} AS NVARCHAR(MAX))` : literal;
    })
    .join(" + ");
}

function tabSegment(slug) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function loadTemplate(slug) {
  const file = path.join(templateDir, `${slug}.json`);
  const template = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  const settings = {
    ...(template.settings || {}),
    submitButtonText: template.submitButtonText || "Submit",
    successMessage: template.successMessage || "Thank you.",
    rules: Array.isArray(template.rules) ? template.rules : [],
    workflowTemplate: template.workflow || null,
    localQaSeed: { appScope, sourceFile: `${slug}.json` },
  };
  const schema = {
    version: template.version || "1.0",
    fields: Array.isArray(template.fields) ? template.fields : [],
    settings,
  };
  return {
    slug,
    segment: tabSegment(slug),
    title: template.title,
    description: template.description || "",
    submitButtonText: template.submitButtonText || "Submit",
    successMessage: template.successMessage || "Thank you.",
    schemaJson: JSON.stringify(schema),
    settingsJson: JSON.stringify(settings),
    workflowJson: template.workflow ? JSON.stringify(template.workflow) : "",
  };
}

function childSql(item, index) {
  const tab = `@Tab${index}`;
  const module = `@Module${index}`;
  const form = `@Form${index}`;
  const tabPath = `${rootPath}//${item.segment}`;
  return `
  DECLARE ${tab} INT, ${module} INT, ${form} INT;
  INSERT INTO dbo.Tabs (
    TabOrder, PortalID, TabName, IsVisible, ParentId, DisableLink, Title, [Description], KeyWords,
    IsDeleted, Url, SkinSrc, ContainerSrc, IsSecure, PermanentRedirect, SiteMapPriority,
    CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate,
    CultureCode, [Level], TabPath, HasBeenPublished, IsSystem
  ) VALUES (
    ${index}, @PortalId, ${sqlString(item.title)}, 0, @RootTab, 0,
    ${sqlString(`${item.title} | MegaForm Visual QA`)}, ${sqlString(item.description)},
    N'MegaForm, EuroYouth, Visual QA', 0, NULL, N'', N'', 0, 0, 0.5,
    @UserId, @Now, @UserId, @Now, NULL, 1, ${sqlString(tabPath)}, 1, 0
  );
  SET ${tab} = CONVERT(INT, SCOPE_IDENTITY());

  INSERT INTO dbo.TabPermission (
    TabID, PermissionID, AllowAccess, RoleID, UserID,
    CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate
  ) VALUES
    (${tab}, 3, 1, -1, NULL, @UserId, @Now, @UserId, @Now),
    (${tab}, 3, 1, 0, NULL, @UserId, @Now, @UserId, @Now),
    (${tab}, 4, 1, 0, NULL, @UserId, @Now, @UserId, @Now);

  INSERT INTO dbo.Modules (
    ModuleDefID, AllTabs, IsDeleted, InheritViewPermissions, PortalID,
    CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate, LastContentModifiedOnDate
  ) VALUES (@MegaFormModuleDef, 0, 0, 1, @PortalId, @UserId, @Now, @UserId, @Now, @Now);
  SET ${module} = CONVERT(INT, SCOPE_IDENTITY());

  INSERT INTO dbo.TabModules (
    TabID, ModuleID, PaneName, ModuleOrder, CacheTime, Alignment, Color, Border, IconFile, Visibility,
    ContainerSrc, DisplayTitle, DisplayPrint, DisplaySyndicate,
    CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate,
    IsDeleted, CacheMethod, ModuleTitle, Header, Footer, CultureCode
  ) VALUES (
    ${tab}, ${module}, N'ContentPane', 0, 0, NULL, NULL, NULL, NULL, 0,
    N'', 0, 0, 0, @UserId, @Now, @UserId, @Now, 0, NULL, ${sqlString(item.title)}, NULL, NULL, NULL
  );

  INSERT INTO dbo.MF_Forms (
    ModuleId, PortalId, Title, [Description], SchemaJson, SettingsJson, ThemeJson, [Status],
    SubmitButtonText, SuccessMessage, RedirectUrl, MaxSubmissions, ExpiresOnUtc,
    RequireAuth, EnableCaptcha, EnableSaveResume, WebhookUrl, WebhookSecret, WebhookHeaders,
    NotifyEmails, NotifyTemplate, AutoresponderEnabled, AutoresponderEmailField,
    AutoresponderSubject, AutoresponderBody, AppScope, CreatedByUserId, CreatedOnUtc,
    UpdatedByUserId, UpdatedOnUtc, WorkflowJson
  ) VALUES (
    ${module}, @PortalId, ${sqlString(item.title)}, ${sqlString(item.description)},
    ${sqlString(item.schemaJson)}, ${sqlString(item.settingsJson)}, N'{}', N'Published',
    ${sqlString(item.submitButtonText)}, ${sqlString(item.successMessage)}, NULL, NULL, NULL,
    0, 0, 0, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL,
    @AppScope, @UserId, SYSUTCDATETIME(), @UserId, SYSUTCDATETIME(), ${sqlString(item.workflowJson)}
  );
  SET ${form} = CONVERT(INT, SCOPE_IDENTITY());

  INSERT INTO dbo.ModuleSettings (
    ModuleID, SettingName, SettingValue, CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate
  ) VALUES
    (${module}, N'MegaForm_EnableAutoQrCode', N'false', @UserId, @Now, @UserId, @Now),
    (${module}, N'MegaForm_FormId', CONVERT(NVARCHAR(50), ${form}), @UserId, @Now, @UserId, @Now),
    (${module}, N'MegaForm_ModuleConfigured', N'true', @UserId, @Now, @UserId, @Now),
    (${module}, N'MegaForm_ModuleMode', N'render', @UserId, @Now, @UserId, @Now);

  INSERT INTO dbo.MF_ModuleViewConfig (
    ModuleId, FormId, ViewType, ViewConfigJson, CssClass, CacheMinutes,
    PermissionsJson, CreatedOnUtc, ModifiedOnUtc
  ) VALUES (
    ${module}, ${form}, N'submit', ${sqlString(JSON.stringify(viewConfig))},
    N'', 0, N'', SYSUTCDATETIME(), SYSUTCDATETIME()
  );

  SELECT ${sqlString(item.slug)} Slug, ${tab} TabID, ${module} ModuleID, ${form} FormID;
`;
}

const templates = slugs.map(loadTemplate);
const children = templates.map((item, index) => childSql(item, index + 1)).join("\n");
const sql = `
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRAN;
  DECLARE @PortalId INT = 0, @UserId INT = 1, @Now DATETIME = GETDATE();
  DECLARE @AppScope NVARCHAR(50) = ${sqlString(appScope)};
  DECLARE @MegaFormModuleDef INT = (
    SELECT TOP 1 ModuleDefID FROM dbo.ModuleDefinitions WHERE FriendlyName = N'MegaForm' ORDER BY ModuleDefID DESC
  );
  IF @MegaFormModuleDef IS NULL THROW 51001, 'MegaForm module definition was not found.', 1;

  DECLARE @OldModules TABLE (ModuleID INT PRIMARY KEY);
  INSERT INTO @OldModules SELECT ModuleId FROM dbo.MF_Forms WHERE AppScope = @AppScope;
  DECLARE @OldTabs TABLE (TabID INT PRIMARY KEY);
  INSERT INTO @OldTabs
    SELECT DISTINCT tm.TabID FROM dbo.TabModules tm JOIN @OldModules om ON om.ModuleID = tm.ModuleID;

  DELETE mvc FROM dbo.MF_ModuleViewConfig mvc JOIN dbo.MF_Forms f ON f.FormId = mvc.FormId WHERE f.AppScope = @AppScope;
  DELETE FROM dbo.MF_Forms WHERE AppScope = @AppScope;
  DELETE ms FROM dbo.ModuleSettings ms JOIN @OldModules om ON om.ModuleID = ms.ModuleID;
  UPDATE tm SET IsDeleted = 1, LastModifiedByUserID = @UserId, LastModifiedOnDate = @Now
    FROM dbo.TabModules tm JOIN @OldModules om ON om.ModuleID = tm.ModuleID;
  UPDATE m SET IsDeleted = 1, LastModifiedByUserID = @UserId, LastModifiedOnDate = @Now
    FROM dbo.Modules m JOIN @OldModules om ON om.ModuleID = m.ModuleID;
  UPDATE t SET IsDeleted = 1, LastModifiedByUserID = @UserId, LastModifiedOnDate = @Now
    FROM dbo.Tabs t JOIN @OldTabs ot ON ot.TabID = t.TabID;
  UPDATE dbo.Tabs SET IsDeleted = 1, LastModifiedByUserID = @UserId, LastModifiedOnDate = @Now
    WHERE PortalID = @PortalId AND ISNULL(IsDeleted, 0) = 0
      AND (TabPath = ${sqlString(rootPath)} OR TabPath LIKE ${sqlString(`${rootPath}//%`)});

  DECLARE @RootTab INT;
  DECLARE @RootOrder INT = ISNULL((SELECT MAX(TabOrder) FROM dbo.Tabs WHERE PortalID = @PortalId AND ParentId IS NULL), 0) + 1;
  INSERT INTO dbo.Tabs (
    TabOrder, PortalID, TabName, IsVisible, ParentId, DisableLink, Title, [Description], KeyWords,
    IsDeleted, Url, SkinSrc, ContainerSrc, IsSecure, PermanentRedirect, SiteMapPriority,
    CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate,
    CultureCode, [Level], TabPath, HasBeenPublished, IsSystem
  ) VALUES (
    @RootOrder, @PortalId, N'Euro Scroll QA', 0, NULL, 0, N'Euro Scroll QA',
    N'Pixel and scroll QA pages for four EuroYouth templates.', N'MegaForm, Visual QA',
    0, NULL, N'', N'', 0, 0, 0.5, @UserId, @Now, @UserId, @Now,
    NULL, 0, ${sqlString(rootPath)}, 1, 0
  );
  SET @RootTab = CONVERT(INT, SCOPE_IDENTITY());
  INSERT INTO dbo.TabPermission (
    TabID, PermissionID, AllowAccess, RoleID, UserID,
    CreatedByUserID, CreatedOnDate, LastModifiedByUserID, LastModifiedOnDate
  ) VALUES
    (@RootTab, 3, 1, -1, NULL, @UserId, @Now, @UserId, @Now),
    (@RootTab, 3, 1, 0, NULL, @UserId, @Now, @UserId, @Now),
    (@RootTab, 4, 1, 0, NULL, @UserId, @Now, @UserId, @Now);

${children}
  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRAN;
  THROW;
END CATCH;
`;

if (outputFile) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  // UTF-8 BOM keeps Windows PowerShell 5 / SQL deployment paths from
  // mis-decoding non-ASCII labels and placeholders (for example, Müller).
  fs.writeFileSync(outputFile, `\uFEFF${sql}`, "utf8");
  console.log(`[dnn-seed] wrote ${outputFile} (${templates.length} forms)`);
} else {
  process.stdout.write(sql);
}
