import asyncio
import json
from playwright.async_api import async_playwright

async def main():
    with open('cookies_raw.json', 'r', encoding='utf-8') as f:
        cookies = json.load(f)
    local_cookies = [c for c in cookies if c.get('domain') == 'localhost']

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--window-size=1920,1080'])
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
        )
        if local_cookies:
            await context.add_cookies(local_cookies)
        page = await context.new_page()
        await page.goto('http://localhost:5070/')
        await page.wait_for_timeout(4000)
        # Lấy text content
        text = await page.eval_on_selector('body', 'el => el.innerText')
        print(text[:2000])
        # Tìm menu MegaForm
        html = await page.content()
        print('\n--- MegaForm mentions ---')
        for i, line in enumerate(html.split('\n')):
            if 'megaform' in line.lower():
                print(line[:300])
        await browser.close()

asyncio.run(main())
