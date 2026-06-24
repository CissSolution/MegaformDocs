#!/usr/bin/env python3
"""
Bulk-create Oqtane child pages (under the top navigation item), add a MegaForm
module to each page, import the Premium template JSON, and bind the module to
the new form so the templates can be visually inspected.

This script writes directly to the Oqtane SQLite database because Oqtane's
/Page and /Module REST endpoints require the Blazor antiforgery token flow.
After running, the Oqtane site should be restarted so its in-memory page/module
caches are cleared.
"""
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone

# ── configuration ───────────────────────────────────────────────────────────
DB_PATH = r"E:/DNN_SITES/OqtaneSites/Oqtane_new/Data/Oqtane-202606111406.db"
TEMPLATE_DIR = r"E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MEGAFORM TEMPLATES/DefaultTemplates - Deployed/Premium"
SITE_ID = 1
PARENT_PAGE_ID = 35          # "Test Template Page" top-level navigation item
MODULE_DEFINITION_NAME = "MegaForm.Client, MegaForm.Oqtane.Client.Oqtane"
ROLE_ALL_USERS = 2
ROLE_ADMINISTRATORS = 5
CREATED_BY = "host"

# ── helpers ─────────────────────────────────────────────────────────────────
def now_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + "Z"

def slugify(text: str) -> str:
    s = re.sub(r"[^\w\s-]", "", text).strip().lower()
    s = re.sub(r"[-\s]+", "-", s)
    return s or "template"

def ensure_dict(value):
    if isinstance(value, dict):
        return value
    return {}

def serialize(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

def load_templates(folder: str):
    files = sorted([f for f in os.listdir(folder) if f.lower().endswith(".json")])
    templates = []
    for name in files:
        path = os.path.join(folder, name)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as ex:
            print(f"WARN: could not parse {name}: {ex}")
            continue
        templates.append((name, data))
    return templates

def build_form_payload(template: dict, module_id: int, site_id: int) -> dict:
    settings = ensure_dict(template.get("settings", {}))
    custom_html = str(template.get("customHtml", "") or "")
    custom_css = str(template.get("customCss", "") or "")
    custom_scripts = ensure_dict(template.get("customScripts", settings.get("customScripts", {})))

    # Merge standalone customHtml/customCss into settings (builder convention)
    settings["customHtml"] = custom_html
    settings["CustomHtml"] = custom_html
    settings["customCss"] = custom_css
    settings["CustomCss"] = custom_css
    if "customContent" not in settings:
        settings["customContent"] = {}
    settings["CustomContent"] = settings["customContent"]
    if "customScripts" not in settings:
        settings["customScripts"] = custom_scripts
    settings["CustomScripts"] = settings["customScripts"]

    schema = {
        "version": str(template.get("version", "1.0")),
        "fields": template.get("fields", []),
        "settings": settings,
        "customScripts": custom_scripts,
    }

    theme_key = settings.get("theme", settings.get("Theme", "default"))

    return {
        "ModuleId": module_id,
        "PortalId": site_id,
        "Title": str(template.get("title", "Untitled Form")),
        "Description": str(template.get("description", "")),
        "SchemaJson": serialize(schema),
        "SettingsJson": serialize(settings),
        "ThemeJson": serialize({"theme": theme_key}),
        "Status": "Published",
        "SubmitButtonText": str(template.get("submitButtonText", "Submit")),
        "SuccessMessage": str(template.get("successMessage", "")),
        "RedirectUrl": "",
        "EnableCaptcha": 0,
        "EnableSaveResume": 0,
        "RequireAuth": 0,
        "NotifyEmails": "",
        "WebhookUrl": "",
        "RulesJson": serialize(template.get("rules", [])),
        "WorkflowJson": serialize(template.get("workflow", {})),
        "AppScope": "",
    }

# ── main ────────────────────────────────────────────────────────────────────
def main():
    if not os.path.exists(DB_PATH):
        print(f"ERROR: database not found: {DB_PATH}")
        sys.exit(1)
    if not os.path.isdir(TEMPLATE_DIR):
        print(f"ERROR: template folder not found: {TEMPLATE_DIR}")
        sys.exit(1)

    templates = load_templates(TEMPLATE_DIR)
    print(f"Loaded {len(templates)} premium templates.")

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = OFF")
    cur = conn.cursor()

    # Verify parent page
    cur.execute("SELECT PageId, Path, Name FROM Page WHERE PageId = ?", (PARENT_PAGE_ID,))
    parent = cur.fetchone()
    if not parent:
        print(f"ERROR: parent page {PARENT_PAGE_ID} not found.")
        sys.exit(1)
    parent_path = parent[1].rstrip("/")
    parent_name = parent[2]
    print(f"Parent page: #{PARENT_PAGE_ID} '{parent_name}' (path='{parent_path}')")

    created = []
    skipped = []

    for idx, (filename, tpl) in enumerate(templates, start=1):
        title = str(tpl.get("title") or os.path.splitext(filename)[0]).strip()
        # Use the filename as the primary slug so every template file gets its
        # own page, even when multiple templates share the same title/slug.
        base_slug = slugify(os.path.splitext(filename)[0])
        page_path = f"{parent_path}/{base_slug}".lstrip("/")

        # Ensure uniqueness (should only collide if the script has already run)
        suffix = 1
        original_path = page_path
        while True:
            cur.execute(
                "SELECT PageId FROM Page WHERE SiteId = ? AND Path = ?",
                (SITE_ID, page_path),
            )
            existing = cur.fetchone()
            if not existing:
                break
            suffix += 1
            page_path = f"{parent_path}/{base_slug}-{suffix}".lstrip("/")

        if suffix > 1:
            skipped.append((title, original_path, page_path))
            print(f"  RENAME ({idx}/{len(templates)}): {title} path conflict -> /{page_path}")

        now = now_utc()
        # Page
        cur.execute(
            """
            INSERT INTO Page (SiteId, Path, Name, Title, Icon, ParentId, "Order", IsNavigation,
                              Url, IsPersonalizable, DefaultContainerType, CreatedBy, CreatedOn,
                              ModifiedBy, ModifiedOn, IsDeleted, IsClickable)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (SITE_ID, page_path, title, title, "", PARENT_PAGE_ID, idx, 1,
             "", 0, "", CREATED_BY, now, CREATED_BY, now, 0, 1),
        )
        page_id = cur.lastrowid

        # Module
        cur.execute(
            """
            INSERT INTO Module (SiteId, ModuleDefinitionName, AllPages, CreatedBy, CreatedOn,
                                ModifiedBy, ModifiedOn)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (SITE_ID, MODULE_DEFINITION_NAME, 0, CREATED_BY, now, CREATED_BY, now),
        )
        module_id = cur.lastrowid

        # PageModule
        cur.execute(
            """
            INSERT INTO PageModule (PageId, ModuleId, Title, Pane, "Order", ContainerType,
                                    CreatedBy, CreatedOn, ModifiedBy, ModifiedOn, IsDeleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (page_id, module_id, "MegaForm", "Default", 1, "", CREATED_BY, now, CREATED_BY, now, 0),
        )

        # Page permissions: View All Users, View Administrators, Edit Administrators
        for perm_name, role_id in [("View", ROLE_ALL_USERS), ("View", ROLE_ADMINISTRATORS), ("Edit", ROLE_ADMINISTRATORS)]:
            cur.execute(
                """
                INSERT INTO Permission (SiteId, EntityName, EntityId, PermissionName, RoleId,
                                        UserId, IsAuthorized, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (SITE_ID, "Page", page_id, perm_name, role_id, None, 1, CREATED_BY, now, CREATED_BY, now),
            )

        # Module permissions
        for perm_name, role_id in [("View", ROLE_ALL_USERS), ("View", ROLE_ADMINISTRATORS), ("Edit", ROLE_ADMINISTRATORS)]:
            cur.execute(
                """
                INSERT INTO Permission (SiteId, EntityName, EntityId, PermissionName, RoleId,
                                        UserId, IsAuthorized, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (SITE_ID, "Module", module_id, perm_name, role_id, None, 1, CREATED_BY, now, CREATED_BY, now),
            )

        # Form
        payload = build_form_payload(tpl, module_id, SITE_ID)
        cur.execute(
            """
            INSERT INTO MF_Forms (ModuleId, PortalId, Title, Description, SchemaJson, SettingsJson,
                                  ThemeJson, Status, SubmitButtonText, SuccessMessage, RedirectUrl,
                                  RequireAuth, EnableCaptcha, EnableSaveResume, WebhookUrl, WebhookSecret,
                                  WebhookHeaders, NotifyEmails, NotifyTemplate, AutoresponderEnabled,
                                  AutoresponderEmailField, AutoresponderSubject, AutoresponderBody,
                                  CreatedByUserId, CreatedOnUtc, UpdatedByUserId, UpdatedOnUtc, AppScope,
                                  RulesJson, WorkflowJson)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["ModuleId"], payload["PortalId"], payload["Title"], payload["Description"],
                payload["SchemaJson"], payload["SettingsJson"], payload["ThemeJson"], payload["Status"],
                payload["SubmitButtonText"], payload["SuccessMessage"], payload["RedirectUrl"],
                payload["RequireAuth"], payload["EnableCaptcha"], payload["EnableSaveResume"],
                payload["WebhookUrl"], "", "", payload["NotifyEmails"], "", 0, "", "", "",
                1, now, 1, now, payload["AppScope"], payload["RulesJson"], payload["WorkflowJson"],
            ),
        )
        form_id = cur.lastrowid

        # Bind module to form (mirrors SaveForm auto-bind)
        for setting_name, value in [
            ("MegaForm:FormId", str(form_id)),
            ("FormId", str(form_id)),
            ("MegaForm:ModuleConfigured", "true"),
            ("ModuleConfigured", "true"),
        ]:
            cur.execute(
                """
                INSERT INTO Setting (EntityName, EntityId, SettingName, SettingValue, CreatedBy,
                                     CreatedOn, ModifiedBy, ModifiedOn, IsPrivate)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                ("Module", module_id, setting_name, value, CREATED_BY, now, CREATED_BY, now, 0),
            )

        created.append({
            "pageId": page_id,
            "moduleId": module_id,
            "formId": form_id,
            "title": title,
            "path": page_path,
        })
        print(f"  CREATED ({idx}/{len(templates)}): {title} -> /{page_path} (form #{form_id})")

    conn.commit()
    conn.close()

    print("")
    print("-" * 40)
    print(f"Created {len(created)} pages/modules/forms.")
    if skipped:
        print(f"Resolved {len(skipped)} path conflicts by appending a suffix.")
    print("")
    print("Sample URLs:")
    for item in created[:5]:
        print(f"  http://localhost:5000/{item['path']}")
    if len(created) > 5:
        print(f"  ... and {len(created) - 5} more.")
    print("")
    print("NOTE: Restart Oqtane.Server so the new pages appear in navigation and modules.")

if __name__ == "__main__":
    main()
