// ============================================================================
//  Upload an image into the documentation image folder on a DNN site.
//
//  The docs channel references images as /Portals/0/MegaFormBlogs/docs/<name>,
//  and on a remote site there is no way to copy a file in — it has to go
//  through DNN's own file service, with a host session.
//
//  Env: DNN_BASE_URL, DNN_USER, DNN_PASSWORD
//  Run: node tools/browser-qa/dnn-upload-docs-image.mjs <file> [<file> ...]
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.DNN_BASE_URL || "https://dnndefender.com";
const USER = process.env.DNN_USER || "host";
const PASS = process.env.DNN_PASSWORD;
const FOLDER = process.env.DOCS_IMAGE_FOLDER || "MegaFormBlogs/docs";
if (!PASS) throw new Error("Set DNN_PASSWORD");

const files = process.argv.slice(2);
if (!files.length) { console.error("usage: dnn-upload-docs-image.mjs <file> [...]"); process.exit(1); }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}/?ctl=Login&returnurl=%2f`, { waitUntil: "domcontentloaded", timeout: 240000 });
await page.locator("#dnn_ctr_Login_Login_DNN_txtUsername").fill(USER);
await page.locator("#dnn_ctr_Login_Login_DNN_txtPassword").fill(PASS);
await page.locator("#dnn_ctr_Login_Login_DNN_cmdLogin").click();
await page.waitForFunction(() => /Logout/i.test(document.body?.innerText || ""), null, { timeout: 120000 });
await page.waitForFunction(() => !!document.querySelector('input[name="__RequestVerificationToken"]'),
  { timeout: 30000 }).catch(() => {});

for (const f of files) {
  const name = path.basename(f);
  const b64 = fs.readFileSync(f).toString("base64");

  const res = await page.evaluate(async ([name, b64, folder]) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "image/png" });

    const fd = new FormData();
    fd.append("folder", folder);
    fd.append("filter", "");
    fd.append("overwrite", "true");
    fd.append("isHostMenu", "false");
    fd.append("extract", "false");
    fd.append("postfile", blob, name);

    const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || "";
    const r = await fetch("/API/internalservices/fileupload/postfile", {
      method: "POST",
      headers: { RequestVerificationToken: token, ModuleId: "-1", TabId: "-1", "X-Requested-With": "XMLHttpRequest" },
      body: fd,
    });
    return { status: r.status, body: (await r.text()).slice(0, 300) };
  }, [name, b64, FOLDER]);

  console.log(`${name.padEnd(34)} ${res.status}  ${res.body.replace(/\s+/g, " ").slice(0, 140)}`);
}

// Prove it: fetch the URL the article will use, anonymously.
const anon = await browser.newContext();
const check = await anon.newPage();
for (const f of files) {
  const url = `${BASE}/Portals/0/${FOLDER}/${path.basename(f)}`;
  const r = await check.goto(url, { timeout: 120000 }).catch(() => null);
  console.log(`${r ? r.status() : "ERR"}  ${url}`);
}
await browser.close();
