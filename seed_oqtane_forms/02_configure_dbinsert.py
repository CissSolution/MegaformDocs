#!/usr/bin/env python3
"""
Cấu hình databaseInsert cho Form 3 và Form 4 trong Oqtane DB.
Chạy 1 lần; idempotent (ghi đè databaseInsert nếu đã tồn tại).
"""
import json
import pyodbc

CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=Oqtane_MegaForm_Fresh1799;"
    "Trusted_Connection=yes;"
)

DB_INSERTS = {
    4: {
        "enabled": True,
        "connectionKey": "DashboardDatabase",
        "databaseType": "SqlServer",
        "insertSql": (
            "INSERT INTO [dbo].[Form_CV_Submissions] "
            "([FullName],[ShortText],[Dropdown],[Number],[FileUpload],[DateValue],[SubmittedOnUtc]) "
            "VALUES (:full_name, :short_text, :dropdown, :number, :file_upload, :date, SYSUTCDATETIME())"
        ),
        "parameterMapping": {
            ":full_name": "full_name",
            ":short_text": "short_text",
            ":dropdown": "dropdown",
            ":number": "number",
            ":file_upload": "file_upload",
            ":date": "date"
        }
    },
    3: {
        "enabled": True,
        "connectionKey": "DashboardDatabase",
        "databaseType": "SqlServer",
        "insertSql": (
            "INSERT INTO [dbo].[Form_DownUnder_Submissions] "
            "([FirstName],[LastName],[Email],[Phone],[DOB],[Nationality],[Purpose],[Region],[Interests],"
            "[Duration],[Stay],[Budget],[Arrival],[Notes],[Terms],[SubmittedOnUtc]) "
            "VALUES (:first_name, :last_name, :email, :phone, :dob, :nationality, :purpose, :region, :interests, "
            ":duration, :stay, :budget, :arrival, :notes, :terms, SYSUTCDATETIME())"
        ),
        "parameterMapping": {
            ":first_name": "first_name",
            ":last_name": "last_name",
            ":email": "email",
            ":phone": "phone",
            ":dob": "dob",
            ":nationality": "nationality",
            ":purpose": "purpose",
            ":region": "region",
            ":interests": "interests",
            ":duration": "duration",
            ":stay": "stay",
            ":budget": "budget",
            ":arrival": "arrival",
            ":notes": "notes",
            ":terms": "terms"
        }
    }
}


def main():
    conn = pyodbc.connect(CONN_STR)
    cur = conn.cursor()
    for form_id in sorted(DB_INSERTS.keys()):
        cur.execute("SELECT SettingsJson FROM MF_Forms WHERE FormId = ?", (form_id,))
        row = cur.fetchone()
        if not row:
            print(f"[WARN] Form {form_id} not found")
            continue
        settings = json.loads(row[0] or "{}")
        settings["databaseInsert"] = DB_INSERTS[form_id]
        settings["DatabaseInsert"] = DB_INSERTS[form_id]
        new_json = json.dumps(settings, ensure_ascii=False, separators=(",", ":"))
        cur.execute(
            "UPDATE MF_Forms SET SettingsJson = ?, UpdatedOnUtc = SYSUTCDATETIME() WHERE FormId = ?",
            (new_json, form_id)
        )
        print(f"[OK] Form {form_id} databaseInsert configured")
    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
