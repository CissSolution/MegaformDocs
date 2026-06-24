#!/usr/bin/env python3
"""
Import all Premium-Fixed JSON templates into the existing Oqtane test pages
via the MegaForm API. The cookie below must belong to a host user.
"""
import json
import os
import urllib.request
import urllib.error
import sqlite3
import re

BASE_URL = "http://localhost:5000"
# Cookie extracted from the active Playwright browser session.
COOKIE_VALUE = "CfDJ8ClUaks4bJZBvv57BE5-7gBNKbr5ML-YIl0xUrNekOFMHu33CseMYuW0tz392qWohkXmziU4SJ4FmVGeeW3biqev5B734AT6DvS7poAgjMPrenbnEJsC24jAbDy6xqaXH42_h4oSjxtlumxhhNrrUTVtKBhpbj8XPrS5vvRk3DwdwshXgmDFQtDUkjnt-9tuOPGyYwiSq8Z_GePaE4wGDWqJvt3TMMcoBv79a2CCbHktZHxmx1zTGxB25wnH8dpIXVdPHgahpnqonU8uj3CSDGgOF3I62lENBkXYnlIn58e_arhInS_5Ia0W5hesXxU0ZeabweKHAAb5Y4UpqVG9Y0BDFRC_eY2-E_19S0aRe0pfOZl3PYYnRp6wbLt4sc3grz6oo8mEB217bbgei1cu-gxEeP-O5NkzID1CE7jkzriAD4UMcjKG9DtmUwNFS8b9FAoRx4gfZij2TRlm8tKubamFD_P9lv0wUcqFrPPwpvinSP4rnlkon-RjD5Gl-THch6ij9_ckHb1ntqAYJloJzxVPNWxu6NWGOjFzA1RPK_AU7aSR0bFB4svWcPjiWhh_KXajZ3NC7s0ZnFw7_l7RfHjgrniFh4JP0Bh6AgpgGIWCsfuhxkDhG37TmRn1pCz2X3b4EQHAv3TJ2QUXqshptbVZKirPze82r6b1oaQENpNjnTitCbpze6EAwHN03TkxlNCuHVvPd1nDOwJSqV7t-3kp_wZgjBDI7JWslgkOqTLXiZuAUl99-Tltd3NGKBD7nRBHLx4yP3b7kMEV_04J8yyyUNozsyP2Qp2rWS1pCkqCBr7uZzlU4MgT8vb589epz3czp3GCD0RFiHnDsE6U4KblQ51_KnkmGEf7_0LElhYiwK-6rvgpeR3lm0VMPdvesR6fOmkppiTahqE4BdPnmu5dxk6nH505fRdxBiU_L8MN"

DB_PATH = r"E:/DNN_SITES/OqtaneSites/Oqtane_new/Data/Oqtane-202606111406.db"
FIXED_DIR = r"E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MEGAFORM TEMPLATES/DefaultTemplates - Deployed/Premium-Fixed"
SITE_ID = 1
PARENT_PAGE_ID = 35


def slugify(text: str) -> str:
    s = re.sub(r"[^\w\s-]", "", text).strip().lower()
    s = re.sub(r"[-\s]+", "-", s)
    return s or "template"


def load_mapping():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT p.PageId, p.Path, m.ModuleId, s.SettingValue as FormId
        FROM Page p
        LEFT JOIN PageModule pm ON pm.PageId=p.PageId
        LEFT JOIN Module m ON m.ModuleId=pm.ModuleId
        LEFT JOIN Setting s ON s.EntityName='Module' AND s.EntityId=m.ModuleId AND s.SettingName='MegaForm:FormId'
        WHERE p.ParentId=? AND p.IsDeleted=0
        ORDER BY p.PageId
        """,
        (PARENT_PAGE_ID,),
    ).fetchall()
    # map slugified filename base -> (module_id, form_id)
    mapping = {}
    for r in rows:
        base = r["Path"].split("/")[-1]
        mapping[base] = (r["ModuleId"], int(r["FormId"]) if r["FormId"] else None)
    return mapping


def build_payload(tpl, module_id, form_id, site_id=1):
    settings = tpl.get("settings", {})
    settings["customHtml"] = tpl.get("customHtml", "")
    settings["CustomHtml"] = tpl.get("customHtml", "")
    scripts = tpl.get("customScripts", settings.get("customScripts", {}))
    if scripts:
        settings["customScripts"] = scripts
        settings["CustomScripts"] = scripts
    content = tpl.get("content", settings.get("customContent", {}))
    if content:
        settings["customContent"] = content
        settings["CustomContent"] = content
    top_css = tpl.get("customCss", "")
    patch_css = settings.get("customCss", "")
    combined_css = top_css
    if patch_css and patch_css not in top_css:
        combined_css = top_css + "\n\n" + patch_css
    settings["customCss"] = combined_css
    settings["CustomCss"] = combined_css
    schema = {
        "version": tpl.get("version", "1.0"),
        "fields": tpl.get("fields", []),
        "settings": settings,
        "customScripts": settings.get("customScripts", {}),
    }
    return {
        "FormId": form_id,
        "ModuleId": module_id,
        "SiteId": site_id,
        "Title": tpl.get("title"),
        "Description": tpl.get("description", ""),
        "SchemaJson": json.dumps(schema, ensure_ascii=False),
        "SettingsJson": json.dumps(settings, ensure_ascii=False),
        "ThemeJson": json.dumps(
            {"theme": settings.get("theme", settings.get("Theme", "default"))},
            ensure_ascii=False,
        ),
        "Status": "Published",
        "SubmitButtonText": tpl.get("submitButtonText", "Submit"),
        "SuccessMessage": tpl.get("successMessage", ""),
        "RedirectUrl": "",
        "EnableCaptcha": False,
        "EnableSaveResume": False,
        "RequireAuth": False,
        "NotifyEmails": "",
        "WebhookUrl": "",
        "RulesJson": json.dumps(tpl.get("rules", []), ensure_ascii=False),
        "WorkflowJson": json.dumps(tpl.get("workflow", {}), ensure_ascii=False),
    }


def import_one(filename, module_id, form_id):
    path = os.path.join(FIXED_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        tpl = json.load(f)
    payload = build_payload(tpl, module_id, form_id)
    url = f"{BASE_URL}/api/MegaForm/Form?authmoduleid={module_id}&authsiteid={SITE_ID}"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Cookie": f".AspNetCore.Identity.Application={COOKIE_VALUE}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read().decode("utf-8")
            return resp.status, data[:200]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")[:400]


def main():
    mapping = load_mapping()
    files = sorted([f for f in os.listdir(FIXED_DIR) if f.lower().endswith(".json")])
    for filename in files:
        base = slugify(os.path.splitext(filename)[0])
        # Some pages got a numeric suffix to avoid collisions; try exact then suffixes.
        candidates = [base] + [f"{base}-{i}" for i in range(1, 10)]
        chosen = None
        for c in candidates:
            if c in mapping:
                chosen = c
                break
        if not chosen:
            print(f"SKIP {filename}: no page mapping found")
            continue
        module_id, form_id = mapping[chosen]
        if not form_id:
            print(f"SKIP {filename}: no FormId binding")
            continue
        status, body = import_one(filename, module_id, form_id)
        print(f"{filename}: {status} -> {body}")


if __name__ == "__main__":
    main()
