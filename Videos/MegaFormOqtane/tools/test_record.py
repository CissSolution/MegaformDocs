from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context(
        viewport={"width": 1920, "height": 1080},
    )
    page = context.new_page()
    page.goto("http://localhost:5070/?mfpanel=dashboard", timeout=60000, wait_until="domcontentloaded")
    time.sleep(10)
    page.screenshot(path="../recordings/test_screenshot.png")
    print("Title:", page.title())
    print("HTML snippet:", page.content()[:1000])
    context.close()
    browser.close()
