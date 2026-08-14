// ============================================================================
//  Automation samples — build the live demo set on a DNN site
//
//  Creates the demo forms behind the "Automating what happens after a
//  submission" documentation, places them on a page, approves their C# scripts
//  and submits through them, so every claim on those pages has a running
//  example instead of a snippet nobody executed.
//
//  Needs a SUPERUSER: FormScript/* is host-only by design (gate 1 of 3).
//
//  Env: DNN_BASE_URL, DNN_USER, DNN_PASSWORD
//  Run: node tools/browser-qa/automation-samples-setup.mjs [step]
//       step = forms | scripts | submit | report   (default: all, in order)
// ============================================================================
import { chromium } from "playwright";

const BASE = process.env.DNN_BASE_URL || "http://megaclean008.ai";
const USER = process.env.DNN_USER || "admin";
const PASS = process.env.DNN_PASSWORD;
const STEP = (process.argv[2] || "all").toLowerCase();

if (!PASS) { console.error("DNN_PASSWORD is required"); process.exit(1); }

// ── session ────────────────────────────────────────────────────────────────
async function login() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/?ctl=Login&returnurl=%2f`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator("#dnn_ctr_Login_Login_DNN_txtUsername").fill(USER);
  await page.locator("#dnn_ctr_Login_Login_DNN_txtPassword").fill(PASS);
  await page.locator("#dnn_ctr_Login_Login_DNN_cmdLogin").click();
  await page.waitForFunction(() => /Logout/i.test(document.body?.innerText || ""), null, { timeout: 90000 });
  return { browser, page };
}

// Every call runs inside the page so DNN sees a real host session + antiforgery
// token. Bodies are passed as data, never interpolated into the evaluated source.
async function api(page, method, url, body) {
  return page.evaluate(async ([method, url, body]) => {
    const tok = document.querySelector('input[name="__RequestVerificationToken"]')?.value || "";
    const init = { method, headers: { RequestVerificationToken: tok } };
    if (body !== null && body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const r = await fetch(url, init);
    const text = await r.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* keep raw */ }
    return { status: r.status, json: parsed, text: parsed ? null : text.slice(0, 400) };
  }, [method, url, body ?? null]);
}

const MF = "/DesktopModules/MegaForm/API";

// ── the demo forms ─────────────────────────────────────────────────────────
const f = (key, type, label, extra = {}) => ({ key, type, label, ...extra });

const ORDER_FORM = {
  Title: "Automation Demo — Order intake",
  Description: "One PostCommit C# script does three things with this submission: writes it into a table this site owns, posts it to a REST endpoint, and emails the customer. Tax is computed in the script.",
  Status: "Published",
  SubmitButtonText: "Place order",
  SuccessMessage: "Thank you. Your order has been received.",
  SchemaJson: JSON.stringify({
    version: "1.0",
    fields: [
      f("full_name", "Text", "Full name", { required: true, placeholder: "Jane Carter" }),
      f("email", "Email", "Email address", { required: true, placeholder: "jane@example.com" }),
      f("company", "Text", "Company", { placeholder: "Acme Ltd" }),
      // "Select", not "Dropdown" — the renderer has no Dropdown type and shows
      // "Widget \"Dropdown\" — plugin not installed" in its place.
      f("country", "Select", "Country", {
        required: true,
        options: [
          { label: "Vietnam (10%)", value: "VN" }, { label: "Germany (19%)", value: "DE" },
          { label: "United Kingdom (20%)", value: "GB" }, { label: "United States (0%)", value: "US" },
        ],
      }),
      f("quantity", "Number", "Quantity", { required: true, defaultValue: "1" }),
      f("unit_price", "Number", "Unit price", { required: true, defaultValue: "100" }),
      // No read-only "total" field here on purpose. PostCommit cannot write back into
      // the stored submission (ctx.SetValue is refused after commit), so a field the
      // script could never fill would sit empty forever and read as broken.
      f("notes", "Textarea", "Notes"),
    ],
    settings: {},
  }),
  SettingsJson: JSON.stringify({ theme: "" }),
};

const MEMBER_FORM = {
  Title: "Automation Demo — Membership signup",
  Description: "PostCommit creates a real DNN user account and grants a role, through ctx.Identity.",
  Status: "Published",
  SubmitButtonText: "Create my account",
  SuccessMessage: "Your account has been created.",
  SchemaJson: JSON.stringify({
    version: "1.0",
    fields: [
      f("member_name", "Text", "Full name", { required: true, placeholder: "Sam Rivera" }),
      f("member_email", "Email", "Email address", { required: true, placeholder: "sam@example.com" }),
      f("plan", "Select", "Plan", {
        required: true,
        options: [{ label: "Standard", value: "standard" }, { label: "Premium", value: "premium" }],
      }),
    ],
    settings: {},
  }),
  SettingsJson: JSON.stringify({ theme: "" }),
};

// ── steps ──────────────────────────────────────────────────────────────────
async function findFormByTitle(page, title) {
  const r = await api(page, "GET", `${MF}/Form/List?portalId=0&pageSize=200`);
  const list = Array.isArray(r.json) ? r.json : [];
  return list.find((x) => (x.Title || x.title) === title) || null;
}

async function ensureForm(page, def) {
  const existing = await findFormByTitle(page, def.Title);
  const body = { ...def, PortalId: 0, FormId: existing ? (existing.FormId ?? existing.formId) : 0 };
  const r = await api(page, "POST", `${MF}/Form/Save`, body);
  if (r.status !== 200) throw new Error(`Form/Save ${def.Title} -> ${r.status} ${r.text || JSON.stringify(r.json)}`);
  const after = await findFormByTitle(page, def.Title);
  const id = after ? (after.FormId ?? after.formId) : 0;
  console.log(`  form "${def.Title}" -> id ${id}${existing ? " (updated)" : " (created)"}`);
  return id;
}

// AddToPage always appends a NEW module instance — it has no "is this form already
// here" check — so calling the forms step twice leaves two copies of the same form
// stacked on the page. Skip when the page already renders this form.
async function alreadyOnPage(page, tabPath, formTitle) {
  return page.evaluate(async ([tabPath, formTitle]) => {
    const r = await fetch("/" + tabPath, { headers: { Accept: "text/html" } });
    const html = await r.text();
    return html.includes(formTitle);
  }, [tabPath, formTitle]);
}

async function placeOnPage(page, formId, tabId) {
  const r = await api(page, "POST", "/API/PersonaBar/MegaForm/AddToPage", { FormId: formId, TabId: tabId, Pane: "ContentPane" });
  console.log(`  AddToPage form ${formId} -> tab ${tabId}: ${r.status} ${JSON.stringify(r.json ?? r.text).slice(0, 160)}`);
  return r;
}

// ── the catalog ────────────────────────────────────────────────────────────
// The capability rail in one object: the script names things, the site owns the
// SQL, the URL, the credential and the role list.
const CATALOG = {
  dbActions: [{
    name: "save-order",
    connectionName: "DashboardDatabase",
    kind: "execute",
    sql: "INSERT INTO dbo.MF_Demo_Orders (SubmissionId, FullName, Email, Company, Country, Quantity, UnitPrice, OrderTotal) " +
         "VALUES (@SubmissionId, @FullName, @Email, @Company, @Country, @Quantity, @UnitPrice, @OrderTotal)",
    parameters: ["SubmissionId", "FullName", "Email", "Company", "Country", "Quantity", "UnitPrice", "OrderTotal"],
    timeoutSeconds: 20,
    enabled: true,
    description: "Writes one row of the order into a table this site owns, not a MegaForm table.",
  }],
  endpoints: [{
    name: "crm-webhook",
    url: "https://postman-echo.com/post",
    method: "POST",
    authType: "none",
    timeoutSeconds: 20,
    maxAttempts: 2,
    retryDelaySeconds: 2,
    enabled: true,
    description: "Stand-in for a CRM. Echoes the payload back so the demo can prove what was sent.",
  }],
  notificationTemplates: [{
    name: "order-received",
    channel: "email",
    // Placeholders are {{key}}, matched against the model the script passes.
    // Body values are HTML-encoded and the subject has CR/LF stripped, both server-side.
    subject: "We received your order (#{{submissionId}})",
    body: "<p>Hello {{name}},</p><p>Your order total is <strong>{{total}}</strong>.</p><p>Reference: #{{submissionId}}</p>",
    enabled: true,
    description: "Sent by ctx.Notify through the site's own IEmailSender.",
  }],
  identity: { enabled: true, allowUserCreation: true, allowedRoles: ["Registered Users"] },
};

// ── the scripts ────────────────────────────────────────────────────────────
// PostCommit only. PreValidate / PreInsert / AsyncWorker have no authoring path
// in this build — nothing in the codebase writes Settings.Automation — so a
// sample using them could not be configured on a real site and is not offered.
// [OpenScripting 2026-08-14] Rewritten as plain C#. The ctx capability rail is gone; ctx now
// carries the submission and nothing else. Everything these scripts DO, they do with the same
// APIs a DNN module would use — which is the point of the change and the proof it works.
const ORDER_SCRIPT_PLAIN = `using System.Data.SqlClient;
using System.Net.Http;
using System.Text;
using DotNetNuke.Services.Mail;
using DotNetNuke.Entities.Portals;

// PostCommit — the submission row is already saved when this runs.
var name    = ctx.GetString("full_name");
var email   = ctx.GetString("email");
var company = ctx.GetString("company");
var country = ctx.GetString("country");
var qty     = ctx.GetInt("quantity", 1);
var price   = ctx.GetDecimal("unit_price", 0m);

decimal rate = country == "DE" ? 0.19m : country == "GB" ? 0.20m : country == "VN" ? 0.10m : 0.00m;
var total = Math.Round(qty * price * (1m + rate), 2);
ctx.Log("country=" + country + " rate=" + rate + " total=" + total);

// 1 — write into a table this site owns. Ordinary ADO.NET against the site's own connection.
var cs = DotNetNuke.Common.Utilities.Config.GetConnectionString();
using (var cn = new SqlConnection(cs))
{
    cn.Open();
    using (var cmd = cn.CreateCommand())
    {
        cmd.CommandText =
            "INSERT INTO dbo.MF_Demo_Orders (SubmissionId, FullName, Email, Company, Country, Quantity, UnitPrice, OrderTotal) " +
            "VALUES (@sid, @name, @email, @company, @country, @qty, @price, @total)";
        cmd.Parameters.AddWithValue("@sid", ctx.SubmissionId);
        cmd.Parameters.AddWithValue("@name", name);
        cmd.Parameters.AddWithValue("@email", email);
        cmd.Parameters.AddWithValue("@company", company ?? "");
        cmd.Parameters.AddWithValue("@country", country);
        cmd.Parameters.AddWithValue("@qty", qty);
        cmd.Parameters.AddWithValue("@price", price);
        cmd.Parameters.AddWithValue("@total", total);
        var rows = cmd.ExecuteNonQuery();
        ctx.Log("insert rowsAffected=" + rows);
    }
}

// 2 — hand the order to a REST endpoint. Ordinary HttpClient.
using (var http = new HttpClient())
{
    http.Timeout = TimeSpan.FromSeconds(20);
    var payload = "{\\"submissionId\\":" + ctx.SubmissionId + ",\\"name\\":\\"" + name +
                  "\\",\\"email\\":\\"" + email + "\\",\\"total\\":" + total + "}";
    var content = new StringContent(payload, Encoding.UTF8, "application/json");
    var resp = await http.PostAsync("https://postman-echo.com/post", content, ct);
    ctx.Log("crm status=" + (int)resp.StatusCode);
}

// 3 — email the customer with DNN's own mail API, using the SMTP the admin already configured.
var portal = PortalController.Instance.GetPortal(ctx.PortalId);
var from = portal != null && !string.IsNullOrEmpty(portal.Email) ? portal.Email : "noreply@megaclean008.ai";
var body = "<p>Hello " + name + ",</p><p>Your order total is <strong>" + total +
           "</strong>.</p><p>Reference: #" + ctx.SubmissionId + "</p>";
var subject = "We received your order (#" + ctx.SubmissionId + ")";
Mail.SendEmail(from, email, subject, body);
ctx.Log("mail handed to DNN's sender for " + email);
`;

const MEMBER_SCRIPT_PLAIN = `using DotNetNuke.Entities.Users;
using DotNetNuke.Security.Roles;

// PostCommit — create a real account with DNN's own membership API.
var email = ctx.GetString("member_email");
var name  = ctx.GetString("member_name");
var plan  = ctx.GetString("plan");

var existing = UserController.GetUserByEmail(ctx.PortalId, email);
if (existing != null)
{
    ctx.Log("user already exists, id=" + existing.UserID);
}
else
{
    var u = new DotNetNuke.Entities.Users.UserInfo();
    u.PortalID = ctx.PortalId;
    u.Email = email;
    u.Username = email;
    u.DisplayName = string.IsNullOrEmpty(name) ? email : name;
    u.FirstName = name;
    u.Membership.Password = System.Guid.NewGuid().ToString("N").Substring(0, 12) + "aA1!";
    u.Membership.Approved = true;

    var status = UserController.CreateUser(ref u);
    ctx.Log("CreateUser -> " + status + " id=" + u.UserID + " plan=" + plan);

    if (status == DotNetNuke.Security.Membership.UserCreateStatus.Success)
    {
        var role = RoleController.Instance.GetRoleByName(ctx.PortalId, "Registered Users");
        if (role != null)
        {
            RoleController.Instance.AddUserRole(ctx.PortalId, u.UserID, role.RoleID,
                DotNetNuke.Security.Roles.RoleStatus.Approved, false, System.DateTime.MinValue, System.DateTime.MinValue);
            ctx.Log("granted role " + role.RoleName);
        }
    }
}
`;

const ORDER_SCRIPT_OLD_RAIL = `// PostCommit — the submission row is already saved when this runs.
var name    = ctx.GetString("full_name");
var email   = ctx.GetString("email");
var company = ctx.GetString("company");
var country = ctx.GetString("country");
var qty     = ctx.GetInt("quantity", 1);
var price   = ctx.GetDecimal("unit_price", 0m);

// Tax for the record we are about to write. PostCommit cannot rewrite the stored
// submission — ctx.SetValue is refused after commit, deliberately — so this total
// travels to the systems below rather than back into the form.
decimal rate = country == "DE" ? 0.19m : country == "GB" ? 0.20m : country == "VN" ? 0.10m : 0.00m;
var total = Math.Round(qty * price * (1m + rate), 2);
ctx.Log("country=" + country + " rate=" + rate + " total=" + total);

// 1 — write into a table this site owns
var saved = await ctx.Actions.ExecuteNamedActionAsync("save-order", new Dictionary<string, object>
{
    { "SubmissionId", ctx.SubmissionId }, { "FullName", name }, { "Email", email },
    { "Company", company }, { "Country", country }, { "Quantity", qty },
    { "UnitPrice", price }, { "OrderTotal", total }
});
ctx.Log("save-order rowsAffected=" + saved.RowsAffected);

// 2 — hand the same order to a REST endpoint the site configured
var crm = await ctx.Api.PostJsonAsync("crm-webhook", new Dictionary<string, object>
{
    { "submissionId", ctx.SubmissionId }, { "name", name }, { "email", email },
    { "company", company }, { "country", country }, { "total", total }
});
ctx.Log("crm-webhook status=" + crm.Status + " ok=" + crm.Ok + " in " + crm.DurationMs + "ms");

// 3 — email the customer through the site's own sender, from a named template
await ctx.Notify.EmailAsync("order-received", email, new Dictionary<string, object>
{
    { "name", name }, { "total", total.ToString() }, { "submissionId", ctx.SubmissionId }
});
ctx.Log("order-received email queued for " + email);
`;

const MEMBER_SCRIPT = `// PostCommit — create a real account for the person who just signed up.
var email = ctx.GetString("member_email");
var name  = ctx.GetString("member_name");
var plan  = ctx.GetString("plan");

var existing = await ctx.Identity.FindUserIdByEmailAsync(email);
if (existing > 0)
{
    ctx.Log("user already exists, id=" + existing);
    await ctx.Identity.AddRoleAsync(existing, "Registered Users");
    ctx.Log("role confirmed on existing user");
}
else
{
    var created = await ctx.Identity.CreateUserAsync(email, null, new[] { "Registered Users" });
    if (created.Created)
        ctx.Log("created user id=" + created.UserId + " name=" + created.UserName + " plan=" + plan);
    else
        ctx.Log("user not created: " + created.Error);
}
`;

async function saveScript(page, formId, source, label) {
  const val = await api(page, "POST", `${MF}/FormScript/Validate`, { formId, source });
  const diags = val.json?.diagnostics || [];
  const errors = diags.filter((d) => (d.Severity || d.severity) === "error");
  console.log(`  [${label}] validate ${val.status} success=${val.json?.success} errors=${errors.length}` +
    (errors.length ? "\n" + errors.slice(0, 4).map((d) => `      L${d.Line}: ${d.Code} ${d.Message}`).join("\n") : ""));
  if (errors.length) return false;

  const save = await api(page, "POST", `${MF}/FormScript/Save`, {
    formId, source, enabled: true, onFailure: "continue", timeoutSeconds: 30,
  });
  console.log(`  [${label}] save ${save.status} ${JSON.stringify(save.json ?? save.text).slice(0, 200)}`);
  return save.status === 200;
}

async function main() {
  const { browser, page } = await login();
  try {
    console.log(`site: ${BASE}  user: ${USER}  step: ${STEP}`);

    if (STEP === "all" || STEP === "forms") {
      console.log("\n[forms]");
      const orderId = await ensureForm(page, ORDER_FORM);
      const memberId = await ensureForm(page, MEMBER_FORM);

      // pages: reuse the MFQA tabs that already exist on this site
      const pages = await api(page, "GET", "/API/PersonaBar/MegaForm/GetPages?pageSize=200");
      const tabs = pages.json?.pages || [];
      const pick = (needle) => tabs.find((t) => (t.path || t.name || "").toLowerCase().includes(needle));
      const orderTab = pick("mfqa-form") || tabs[0];
      const memberTab = pick("mfqa-admin") || pick("mfqa-pay") || tabs[1] || tabs[0];
      console.log(`  pages: order -> ${orderTab?.name} (${orderTab?.tabId}), member -> ${memberTab?.name} (${memberTab?.tabId})`);
      for (const [tab, id, title] of [[orderTab, orderId, ORDER_FORM.Title], [memberTab, memberId, MEMBER_FORM.Title]]) {
        if (!tab) continue;
        if (await alreadyOnPage(page, tab.path || tab.name, title)) {
          console.log(`  ${tab.name}: already renders "${title}", not adding a second copy`);
        } else {
          await placeOnPage(page, id, tab.tabId);
        }
      }
      console.log(JSON.stringify({ orderId, memberId, orderTab: orderTab?.tabId, memberTab: memberTab?.tabId }));
    }

    if (STEP === "all" || STEP === "scripts") {
      console.log("\n[catalog]");
      const cat = await api(page, "POST", `${MF}/FormScript/Catalog`, { catalog: CATALOG });
      console.log(`  save ${cat.status} ${JSON.stringify(cat.json ?? cat.text).slice(0, 200)}`);
      const back = await api(page, "GET", `${MF}/FormScript/Catalog`);
      const c = back.json?.catalog || back.json || {};
      console.log(`  read back: dbActions=${(c.dbActions || []).length} endpoints=${(c.endpoints || []).length}` +
        ` templates=${(c.notificationTemplates || []).length} identity.enabled=${c.identity?.enabled}`);

      console.log("\n[scripts]");
      const order = await findFormByTitle(page, ORDER_FORM.Title);
      const member = await findFormByTitle(page, MEMBER_FORM.Title);
      const orderId = order?.FormId ?? order?.formId;
      const memberId = member?.FormId ?? member?.formId;
      await saveScript(page, orderId, ORDER_SCRIPT_PLAIN, `order ${orderId}`);
      await saveScript(page, memberId, MEMBER_SCRIPT_PLAIN, `member ${memberId}`);
    }
    if (STEP === "all" || STEP === "submit") {
      console.log("\n[submit] anonymous, exactly what a visitor sends");
      const order = await findFormByTitle(page, ORDER_FORM.Title);
      const member = await findFormByTitle(page, MEMBER_FORM.Title);
      const orderId = order?.FormId ?? order?.formId;
      const memberId = member?.FormId ?? member?.formId;
      const stamp = Date.now();

      const anon = await chromium.launch({ headless: true });
      const anonPage = await anon.newPage();
      await anonPage.goto(`${BASE}/mfqa-form`, { waitUntil: "domcontentloaded", timeout: 120000 });
      const post = (formId, data) => anonPage.evaluate(async ([formId, data]) => {
        const r = await fetch("/DesktopModules/MegaForm/API/Submit/Post", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formId, data, submissionTime: 14.2 }),
        });
        const t = await r.text();
        try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, text: t.slice(0, 300) }; }
      }, [formId, data]);

      const o = await post(orderId, {
        full_name: "Jane Carter", email: "jane.carter@example.com", company: "Acme Ltd",
        country: "DE", quantity: 3, unit_price: 250, notes: "Automation docs sample run " + stamp,
      });
      console.log(`  order  -> ${o.status} ${JSON.stringify(o.json ?? o.text).slice(0, 220)}`);

      const m = await post(memberId, {
        member_name: "Sam Rivera", member_email: `sam.rivera.${stamp}@example.com`, plan: "premium",
      });
      console.log(`  member -> ${m.status} ${JSON.stringify(m.json ?? m.text).slice(0, 220)}`);
      await anon.close();
    }

    if (STEP === "all" || STEP === "report") {
      console.log("\n[report] audit trail straight from the site");
      const order = await findFormByTitle(page, ORDER_FORM.Title);
      const orderId = order?.FormId ?? order?.formId;
      const runs = await api(page, "GET", `${MF}/FormScript/Runs?formId=${orderId}&take=3`);
      console.log(JSON.stringify(runs.json ?? runs.text, null, 1).slice(0, 1800));
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
