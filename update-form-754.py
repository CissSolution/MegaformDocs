#!/usr/bin/env python3
"""Update Oqtane form 754 from the Fiesta Coral party RSVP template JSON."""
import json
import pathlib
import pyodbc

DB_PATH = "Oqtane_MSSQL3"
FORM_ID = 754
TEMPLATE_PATH = (
    "E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/"
    "MEGAFORM TEMPLATES/DefaultTemplates - Deployed/Premium Current/"
    "fiesta-coral-party-rsvp.json"
)


def main():
    tmpl = json.loads(pathlib.Path(TEMPLATE_PATH).read_text(encoding="utf-8"))

    conn = pyodbc.connect(
        "DRIVER={ODBC Driver 17 for SQL Server};"
        "SERVER=lpc:.\\SQLEXPRESS;"
        f"DATABASE={DB_PATH};"
        "Trusted_Connection=yes;"
    )
    cur = conn.cursor()
    row = cur.execute(
        "SELECT SchemaJson, SettingsJson FROM MF_Forms WHERE FormId=?", (FORM_ID,)
    ).fetchone()
    if not row:
        raise RuntimeError(f"Form {FORM_ID} not found")

    schema = json.loads(row.SchemaJson)
    settings = json.loads(row.SettingsJson)

    # Merge template payload into existing DB records so we keep DB-only keys.
    schema["version"] = tmpl.get("version", schema.get("version", "1.0"))
    schema["title"] = tmpl.get("title", schema.get("title"))
    schema["description"] = tmpl.get("description", schema.get("description", ""))
    schema["fields"] = tmpl.get("fields", schema.get("fields", []))

    tmpl_settings = tmpl.get("settings", {})
    for key in [
        "theme",
        "multiPage",
        "customContent",
        "customScripts",
        "customHtml",
        "customCss",
        "submitButtonText",
        "successMessage",
        "rules",
        "workflowTemplate",
        "themeSelector",
        "postSubmitExperience",
    ]:
        if key in tmpl_settings:
            settings[key] = tmpl_settings[key]

    schema["settings"] = settings

    new_schema_json = json.dumps(schema, ensure_ascii=False)
    new_settings_json = json.dumps(settings, ensure_ascii=False)

    cur.execute(
        """
        UPDATE MF_Forms
        SET Title=?,
            SchemaJson=?,
            SettingsJson=?,
            SubmitButtonText=?,
            SuccessMessage=?,
            RulesJson=?,
            WorkflowJson=?,
            UpdatedOnUtc=GETUTCDATE()
        WHERE FormId=?
        """,
        (
            tmpl.get("title", ""),
            new_schema_json,
            new_settings_json,
            tmpl.get("submitButtonText", "Submit"),
            tmpl.get("successMessage", ""),
            json.dumps(tmpl.get("rules", []), ensure_ascii=False),
            json.dumps(tmpl.get("workflow", {}), ensure_ascii=False),
            FORM_ID,
        ),
    )
    conn.commit()
    print(f"Form {FORM_ID} updated.")


if __name__ == "__main__":
    main()
