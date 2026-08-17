// Shared Umbraco backoffice login for the QA scripts.
//
// Two things make a flat waitForTimeout unreliable here, and both were measured:
//
//  · Umbraco 14+ signs in through OIDC. Submitting the form starts a redirect chain
//    (/umbraco/login -> management/api/.../authorize -> /umbraco/oauth_complete) and the
//    app is not usable until that finishes. A fixed 9s wait caught it mid-chain often
//    enough that a working login reported as "route broken".
//  · appsettings has "AllowConcurrentLogins": false, so a second QA run can evict the
//    first. Wait for the shell, do not assume it.
//
// The token lives in memory, so NEVER page.goto() a backoffice route afterwards: a full
// navigation re-bootstraps and bounces to the authorize URL. Drive the SPA router instead.
export async function umbLogin(page, { base, user, pass }) {
  await page.goto(`${base}/umbraco`, { waitUntil: "domcontentloaded", timeout: 180000 });

  // The login form is inside a web component that mounts after the initial paint. Querying for
  // it immediately finds nothing, the fill is skipped, and the wait below then times out on a
  // page that was never given a password -- which reads as "login is broken".
  await page.waitForTimeout(6000);

  // The field is name="username" type="text" on this build — NOT type="email". A selector that
  // only knows about email matches nothing, the fill is skipped silently, and the wait below
  // then blames the login for a form that was never filled in.
  const email = page
    .locator('input[name="username"], input[name="email"], input[type="email"], #umb-username')
    .first();
  if (await email.count()) {
    await email.fill(user);
    await page.locator('input[type="password"]').first().fill(pass);
    await page.locator('button[type="submit"]').first().click();
  }

  // The shell is up once the OIDC chain has settled on a section route. Waiting on a nav
  // ELEMENT was tried first and timed out: the backoffice renders its sections through
  // web components whose text does not sit on an <a>/<button>, so "not found" meant
  // "my selector is wrong", not "not logged in". The URL is the honest signal.
  try {
    await page.waitForFunction(
      () => /\/umbraco\/section\//.test(location.pathname),
      null, { timeout: 120000 });
  } catch (e) {
    // Report where it actually stopped. A bare TimeoutError says nothing about whether the
    // credentials were rejected, the account was locked, or the form was never filled.
    const shot = (process.env.OUT_DIR || ".") + "/umb-login-failed.png";
    await page.screenshot({ path: shot }).catch(() => {});
    const state = await page.evaluate(() => ({
      url: location.href.slice(0, 160),
      inputs: [...document.querySelectorAll("input")].map((i) => i.type + ":" + (i.name || i.id)).join(","),
      text: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 220),
    })).catch(() => ({}));
    console.log("LOGIN DID NOT REACH A SECTION:", JSON.stringify(state, null, 1));
    console.log("screenshot:", shot);
    throw e;
  }

  await page.waitForTimeout(2500);
  return page.url();
}

/** Click a control by its exact visible text, searching through shadow roots. */
export function deepClick(page, text) {
  return page.evaluate((t) => {
    const find = (root) => {
      for (const e of root.querySelectorAll("a[href], button, uui-menu-item, umb-menu-item")) {
        if (new RegExp("^\\s*" + t + "\\s*$", "i").test(e.textContent || "")) return e;
      }
      for (const e of root.querySelectorAll("*")) {
        if (e.shadowRoot) { const hit = find(e.shadowRoot); if (hit) return hit; }
      }
      return null;
    };
    const el = find(document);
    if (!el) return null;
    el.click();
    return el.getAttribute("href") || "(button)";
  }, text);
}
