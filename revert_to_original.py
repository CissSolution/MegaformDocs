#!/usr/bin/env python3
"""Restore the 36 test forms to the original Premium templates (no fixes)."""
import json
import os
import urllib.request
import urllib.error

BASE_URL = "http://localhost:5000"
COOKIE_VALUE = "CfDJ8ClUaks4bJZBvv57BE5-7gBNKbr5ML-YIl0xUrNekOFMHu33CseMYuW0tz392qWohkXmziU4SJ4FmVGeeW3biqev5B734AT6DvS7poAgjMPrenbnEJsC24jAbDy6xqaXH42_h4oSjxtlumxhhNrrUTVtKBhpbj8XPrS5vvRk3DwdwshXgmDFQtDUkjnt-9tuOPGyYwiSq8Z_GePaE4wGDWqJvt3TMMcoBv79a2CCbHktZHxmx1zTGxB25wnH8dpIXVdPHgahpnqonU8uj3CSDGgOF3I62lENBkXYnlIn58e_arhInS_5Ia0W5hesXxU0ZeabweKHAAb5Y4UpqVG9Y0BDFRC_eY2-E_19S0aRe0pfOZl3PYYnRp6wbLt4sc3grz6oo8mEB217bbgei1cu-gxEeP-O5NkzID1CE7jkzriAD4UMcjKG9DtmUwNFS8b9FAoRx4gfZij2TRlm8tKubamFD_P9lv0wUcqFrPPwpvinSP4rnlkon-RjD5Gl-THch6ij9_ckHb1ntqAYJloJzxVPNWxu6NWGOjFzA1RPK_AU7aSR0bFB4svWcPjiWhh_KXajZ3NC7s0ZnFw7_l7RfHjgrniFh4JP0Bh6AgpgGIWCsfuhxkDhG37TmRn1pCz2X3b4EQHAv3TJ2QUXqshptbVZKirPze82r6b1oaQENpNjnTitCbpze6EAwHN03TkxlNCuHVvPd1nDOwJSqV7t-3kp_wZgjBDI7JWslgkOqTLXiZuAUl99-Tltd3NGKBD7nRBHLx4yP3b7kMEV_04J8yyyUNozsyP2Qp2rWS1pCkqCBr7uZzlU4MgT8vb589epz3czp3GCD0RFiHnDsE6U4KblQ51_KnkmGEf7_0LElhYiwK-6rvgpeR3lm0VMPdvesR6fOmkppiTahqE4BdPnmu5dxk6nH505fRdxBiU_L8MN"

SRC_DIR = r"E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MEGAFORM TEMPLATES/DefaultTemplates - Deployed/Premium"
PAGES_FILE = r"E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um/qa_pages.json"


def build_payload(tpl, module_id, form_id, site_id=1):
    settings = tpl.get("settings", {}) if isinstance(tpl.get("settings"), dict) else {}
    custom_html = str(tpl.get("customHtml", "") or settings.get("customHtml", "") or settings.get("CustomHtml", "") or "")
    custom_css = str(tpl.get("customCss", "") or settings.get("customCss", "") or settings.get("CustomCss", "") or "")
    custom_scripts = tpl.get("customScripts") or settings.get("customScripts") or settings.get("CustomScripts") or {}

    settings["customHtml"] = custom_html
    settings["CustomHtml"] = custom_html
    settings["customCss"] = custom_css
    settings["CustomCss"] = custom_css
    settings["customScripts"] = custom_scripts
    settings["CustomScripts"] = custom_scripts

    schema = {
        "version": tpl.get("version", "1.0"),
        "fields": tpl.get("fields", []),
        "settings": settings,
        "customScripts": custom_scripts,
    }
    return {
        "FormId": form_id,
        "ModuleId": module_id,
        "SiteId": site_id,
        "Title": tpl.get("title"),
        "Description": tpl.get("description", ""),
        "SchemaJson": json.dumps(schema, ensure_ascii=False),
        "SettingsJson": json.dumps(settings, ensure_ascii=False),
        "ThemeJson": json.dumps({"theme": settings.get("theme", settings.get("Theme", "default"))}, ensure_ascii=False),
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
        "allowDesignReset": True,
    }


def find_original_file(page_path):
    segment = page_path.split("/")[-1].lower()
    candidates = [f for f in os.listdir(SRC_DIR) if f.lower().endswith(".json")]
    for f in candidates:
        if os.path.splitext(f)[0].lower() == segment:
            return f
    return None


def revert_one(filename, module_id, form_id):
    path = os.path.join(SRC_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        tpl = json.load(f)
    payload = build_payload(tpl, module_id, form_id)
    url = f"{BASE_URL}/api/MegaForm/Form?authmoduleid={module_id}&authsiteid=1"
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
            return resp.status, resp.read().decode("utf-8")[:200]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")[:400]


def main():
    with open(PAGES_FILE, "r", encoding="utf-8") as f:
        pages = json.load(f)
    ok = 0
    for p in pages:
        filename = find_original_file(p["path"])
        if not filename:
            print(f"SKIP {p['path']}: no matching original template")
            continue
        status, body = revert_one(filename, p["moduleId"], p["formId"])
        print(f"{filename}: status={status} body={body}")
        if status == 200:
            ok += 1
    print(f"\nReverted {ok}/{len(pages)} forms.")


if __name__ == "__main__":
    main()
