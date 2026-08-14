import asyncio
import json
from playwright.async_api import async_playwright

async def main():
    with open('cookies_raw.json', 'r', encoding='utf-8') as f:
        cookies = json.load(f)
    # Chỉ giữ cookies của localhost
    local_cookies = [c for c in cookies if c.get('domain') == 'localhost']
    print(f"Local cookies: {len(local_cookies)}")
    for c in local_cookies:
        print(c['name'], c.get('secure'))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--window-size=1920,1080'])
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            record_video_dir='recordings/test',
            record_video_size={'width': 1920, 'height': 1080},
        )
        if local_cookies:
            await context.add_cookies(local_cookies)
        page = await context.new_page()
        await page.goto('http://localhost:5070/')
        await page.wait_for_timeout(5000)
        await page.screenshot(path='recordings/test_login.png', full_page=True)
        print("URL:", page.url)
        print("Title:", await page.title())
        # Kiểm tra có link nào chứa megaform không
        links = await page.eval_on_selector_all('a', 'els => els.map(e => ({href: e.href, text: e.textContent.trim()}))')
        for l in links:
            if 'mega' in l['href'].lower() or 'mega' in l['text'].lower():
                print(l)
        await browser.close()

asyncio.run(main())
