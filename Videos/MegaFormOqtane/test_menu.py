import asyncio
import json
from playwright.async_api import async_playwright

async def main():
    with open('cookies_raw.json', 'r', encoding='utf-8') as f:
        cookies = json.load(f)
    local_cookies = [c for c in cookies if c.get('domain') == 'localhost']

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--window-size=1920,1080'])
        context = await browser.new_context(viewport={'width': 1920, 'height': 1080})
        if local_cookies:
            await context.add_cookies(local_cookies)
        page = await context.new_page()
        await page.goto('http://localhost:5070/')
        await page.wait_for_timeout(3000)
        # Tìm tất cả link chứa MegaForm
        links = await page.eval_on_selector_all('a', 'els => els.filter(e => e.textContent.includes("MegaForm")).map(e => ({text: e.textContent.trim(), outer: e.outerHTML.slice(0,300)}))')
        print('MegaForm links:', len(links))
        for l in links:
            print(l)
        # Tìm tất cả link chứa Form Dashboard
        dash = await page.eval_on_selector_all('a', 'els => els.filter(e => e.textContent.includes("Form Dashboard")).map(e => ({text: e.textContent.trim(), href: e.href, outer: e.outerHTML.slice(0,300)}))')
        print('Dashboard links:', dash)
        await browser.close()

asyncio.run(main())
